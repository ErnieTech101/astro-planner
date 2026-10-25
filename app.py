"""Astro Imaging Planner: a small invite-only web app for planning and logging
smart-telescope imaging sessions.

Run for development:   flask --app app run --debug
Run in production:     gunicorn -w 2 -b 127.0.0.1:8077 app:app   (see README)
"""
import csv
import io
import json
import os
import re
import secrets
import sqlite3
import tempfile
import time
from datetime import date, datetime, timedelta
from functools import wraps
from zoneinfo import available_timezones

from flask import (Flask, Response, abort, g, jsonify, redirect, render_template, request,
                   session, url_for)
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

import db
from changelog import CHANGELOG, news_since

VERSION = "1.5.3"
HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("AIP_DB", os.path.join(HERE, "planner.db"))

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)  # trust one proxy (Caddy)

_secret = os.environ.get("AIP_SECRET_KEY")
if not _secret:
    _secret = secrets.token_hex(32)
    app.logger.warning("AIP_SECRET_KEY is not set. Using a temporary key, so everyone "
                       "is signed out whenever the app restarts.")
app.config.update(
    SECRET_KEY=_secret,
    SESSION_COOKIE_NAME="aip_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("AIP_SECURE_COOKIES", "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=90),
    MAX_CONTENT_LENGTH=64 * 1024,
)

TIMEZONES = available_timezones()
INACTIVE_DAYS = int(os.environ.get("AIP_INACTIVE_DAYS", "90"))
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
SETTINGS_KEYS = {"mag", "dur", "t0", "t1", "site_id", "unimagedFirst", "red", "setupDone", "cats", "sb", "moonRule",
                 "showConst", "showStars", "showMer", "scope_id"}
# Compared against when the username doesn't exist, so a wrong username takes as long as a wrong password.
_DUMMY_HASH = generate_password_hash(secrets.token_hex(16))

_init = db.connect(DB_PATH)
db.init(_init)
_init.close()


# ---------------------------------------------------------------- plumbing

def get_db():
    if "db" not in g:
        g.db = db.connect(DB_PATH)
    return g.db


@app.teardown_appcontext
def _close_db(_exc):
    con = g.pop("db", None)
    if con is not None:
        con.close()


@app.after_request
def _headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    if request.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


class BadInput(Exception):
    pass


@app.errorhandler(BadInput)
def _bad_input(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(413)
def _too_big(_e):
    return jsonify(error="That request is too large."), 413


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    if "user" not in g:
        g.user = get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if g.user is None or g.user["disabled"]:
            session.clear()
            g.user = None
    return g.user


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(24)
    return session["csrf"]


app.jinja_env.globals["csrf_token"] = csrf_token
app.jinja_env.globals["VERSION"] = VERSION


def check_csrf():
    tok = session.get("csrf")
    if not tok or not secrets.compare_digest(request.form.get("csrf", ""), tok):
        abort(400)


def api(rule, methods=("GET",), admin=False):
    """JSON endpoint for the signed-in user. Writes must carry X-Requested-With: aip,
    which a cross-site form can't send, so this doubles as CSRF protection."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            u = current_user()
            if not u:
                return jsonify(error="Please sign in again."), 401
            if request.method != "GET" and request.headers.get("X-Requested-With") != "aip":
                return jsonify(error="Bad request."), 400
            if admin and not u["is_admin"]:
                return jsonify(error="Only the site administrator can do that."), 403
            return fn(u, *args, **kwargs)
        app.add_url_rule(rule, fn.__name__, wrapper, methods=list(methods))
        return wrapper
    return deco


def body():
    j = request.get_json(silent=True)
    if not isinstance(j, dict):
        raise BadInput("Expected a JSON object.")
    return j


def num(j, key, lo, hi, label, required=True, integer=False):
    v = j.get(key)
    if v is None or v == "":
        if required:
            raise BadInput(f"{label} is required.")
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise BadInput(f"{label} must be a number.")
    if not lo <= v <= hi:  # also rejects NaN and infinity
        raise BadInput(f"{label} must be between {lo:g} and {hi:g}.")
    if integer:
        if v != int(v):
            raise BadInput(f"{label} must be a whole number.")
        v = int(v)
    return v


def text(j, key, label, maxlen, required=False):
    v = j.get(key)
    v = "" if v is None else str(v).strip()
    if required and not v:
        raise BadInput(f"{label} is required.")
    if len(v) > maxlen:
        raise BadInput(f"{label} is too long (limit {maxlen} characters).")
    return v


def rows(cur):
    return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------- pages

@app.get("/")
def index():
    u = current_user()
    if not u:
        return redirect(url_for("login"))
    return render_template("index.html", me=u)


_fails = {}  # ip -> recent failed login times (per worker process)


def _too_many_fails(ip):
    now = time.time()
    recent = [t for t in _fails.get(ip, []) if now - t < 900]
    _fails[ip] = recent
    return len(recent) >= 10


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        if current_user():
            return redirect(url_for("index"))
        return render_template("login.html")
    check_csrf()
    ip = request.remote_addr or "?"
    username = request.form.get("username", "").strip()
    if _too_many_fails(ip):
        return render_template("login.html", error="Too many failed attempts. Wait 15 minutes and try again.",
                               username=username), 429
    con = get_db()
    u = con.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    ok = check_password_hash(u["pw_hash"] if u else _DUMMY_HASH, request.form.get("password", ""))
    if not (u and ok):
        _fails.setdefault(ip, []).append(time.time())
        return render_template("login.html", error="That user name and password don't match.",
                               username=username), 401
    if u["disabled"]:
        return render_template("login.html", error="This account is turned off. Ask the site administrator.",
                               username=username), 403
    _start_session(u["id"])
    con.execute("UPDATE users SET last_login=datetime('now'), last_seen=datetime('now') WHERE id=?", (u["id"],))
    return redirect(url_for("index"))


def _start_session(uid):
    session.clear()
    session["uid"] = uid
    session.permanent = True


class FormError(Exception):
    pass


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "GET":
        return render_template("signup.html", f={"code": request.args.get("code", "")})
    check_csrf()
    f = {k: request.form.get(k, "").strip() for k in ("code", "username", "display_name", "callsign")}
    pw, pw2 = request.form.get("password", ""), request.form.get("password2", "")
    code = db.normalize_invite(f["code"])
    try:
        if not USERNAME_RE.match(f["username"]):
            raise FormError("User names are 3 to 32 characters: letters, numbers, dot, dash or underscore.")
        if len(f["display_name"]) > 60:
            raise FormError("Your name is too long (limit 60 characters).")
        if len(f["callsign"]) > 12:
            raise FormError("That callsign is too long.")
        if not 8 <= len(pw) <= 200:
            raise FormError("Choose a password of at least 8 characters.")
        if pw != pw2:
            raise FormError("The two passwords don't match.")
        con = get_db()
        with db.tx(con):
            inv = con.execute("SELECT 1 FROM invites WHERE code=? AND used_at IS NULL", (code,)).fetchone()
            if not inv:
                raise FormError("That invite code isn't valid or has already been used. "
                                "Check it with the person who sent it.")
            if con.execute("SELECT 1 FROM users WHERE username=?", (f["username"],)).fetchone():
                raise FormError("That user name is taken. Try another.")
            uid = db.create_user(con, f["username"], generate_password_hash(pw),
                                 display_name=f["display_name"], callsign=f["callsign"].upper(), seen_version=VERSION)
            con.execute("UPDATE invites SET used_by=?, used_at=datetime('now') WHERE code=?", (uid, code))
    except FormError as e:
        return render_template("signup.html", error=str(e), f=f), 400
    _start_session(uid)
    return redirect(url_for("index"))


@app.get("/healthz")
def healthz():
    get_db().execute("SELECT 1")
    return {"ok": True, "version": VERSION}


# ---------------------------------------------------------------- API: state & settings

def _settings(con, uid):
    r = con.execute("SELECT data FROM settings WHERE user_id=?", (uid,)).fetchone()
    return json.loads(r["data"]) if r else {}


def _log(con, uid):
    return rows(con.execute(
        "SELECT l.*, s.name AS site_name, sc.name AS scope_name FROM log l "
        "LEFT JOIN sites s ON s.id=l.site_id LEFT JOIN scopes sc ON sc.id=l.scope_id "
        "WHERE l.user_id=? ORDER BY l.session_date DESC, l.id DESC", (uid,)))


def _me(u):
    return {k: u[k] for k in ("id", "username", "display_name", "callsign", "is_admin", "must_change_pw")}


# A member's most recent sign of life: page load, sign-in, log entry, or joining.
ACTIVITY_SQL = """
    SELECT u.id, u.username, u.display_name, u.callsign, u.is_admin, u.disabled, u.must_change_pw,
           u.created_at, u.last_login, u.last_seen,
           (SELECT COUNT(*) FROM log l WHERE l.user_id=u.id) AS entries,
           (SELECT COUNT(*) FROM sites s WHERE s.user_id=u.id) AS sites,
           (SELECT MAX(session_date) FROM log l WHERE l.user_id=u.id) AS last_entry,
           MAX(COALESCE(u.last_seen, ''), COALESCE(u.last_login, ''), u.created_at,
               COALESCE((SELECT MAX(created_at) FROM log l WHERE l.user_id=u.id), '')) AS active_at
    FROM users u"""


def _members(con):
    out = []
    for r in rows(con.execute(ACTIVITY_SQL + " ORDER BY active_at")):
        r["idle_days"] = int(con.execute("SELECT julianday('now') - julianday(?)", (r["active_at"],)).fetchone()[0])
        r["inactive"] = bool(not r["disabled"] and r["idle_days"] >= INACTIVE_DAYS)
        out.append(r)
    return out


@api("/api/state")
def api_state(u):
    con = get_db()
    # "last seen", recorded at most once an hour so page loads don't mean constant writes
    con.execute("UPDATE users SET last_seen=datetime('now') WHERE id=? AND "
                "(last_seen IS NULL OR last_seen < datetime('now', '-1 hour'))", (u["id"],))
    out = {"me": _me(u), "settings": _settings(con, u["id"]),
           "sites": rows(con.execute("SELECT * FROM sites WHERE user_id=? ORDER BY id", (u["id"],))),
           "scopes": rows(con.execute("SELECT * FROM scopes WHERE user_id=? ORDER BY id", (u["id"],))),
           "log": _log(con, u["id"]), "version": VERSION,
           "news": [{"version": v, "date": d, "items": items} for v, d, items in news_since(u["seen_version"], VERSION)]}
    if u["is_admin"]:
        out["inactive"] = sum(m["inactive"] for m in _members(con))
        out["inactive_days"] = INACTIVE_DAYS
    return out


@api("/api/news/seen", methods=("POST",))
def api_news_seen(u):
    get_db().execute("UPDATE users SET seen_version=? WHERE id=?", (VERSION, u["id"]))
    return {"ok": True}


@api("/api/changelog")
def api_changelog(u):
    return {"version": VERSION, "changelog": [{"version": v, "date": d, "items": i} for v, d, i in CHANGELOG]}


@api("/api/stats")
def api_stats(u):
    """Club-wide totals. Nothing here identifies what any one member logged."""
    con = get_db()
    one = lambda sql: con.execute(sql).fetchone()[0]
    top = con.execute("SELECT object_id, COUNT(DISTINCT user_id) AS members, COUNT(*) AS entries FROM log "
                      "GROUP BY object_id ORDER BY members DESC, entries DESC LIMIT 1").fetchone()
    active30 = sum(1 for m in _members(con) if not m["disabled"] and m["idle_days"] < 30)
    return {
        "members": one("SELECT COUNT(*) FROM users WHERE disabled=0"),
        "active30": active30,
        "entries": one("SELECT COUNT(*) FROM log"),
        "hours": round((one("SELECT COALESCE(SUM(subs * sub_sec), 0) FROM log WHERE subs IS NOT NULL "
                            "AND sub_sec IS NOT NULL") or 0) / 3600, 1),
        "objects": one("SELECT COUNT(DISTINCT object_id) FROM log"),
        "nights": one("SELECT COUNT(DISTINCT session_date) FROM log"),
        "top": dict(top) if top else None,
        # how many members own each model (a member with two of the same counts once)
        "scopes": rows(con.execute(
            "SELECT CASE WHEN model='' OR model='Other' THEN 'Other' ELSE model END AS model, "
            "COUNT(DISTINCT s.user_id) AS members FROM scopes s JOIN users u ON u.id=s.user_id "
            "WHERE u.disabled=0 GROUP BY 1 ORDER BY members DESC, model")),
        "since": (one("SELECT MIN(created_at) FROM users") or "")[:10],
    }


@api("/api/settings", methods=("PUT",))
def api_settings(u):
    j = body()
    data = {k: v for k, v in j.items() if k in SETTINGS_KEYS and isinstance(v, (str, int, float, bool, type(None)))}
    blob = json.dumps(data)
    if len(blob) > 2000:
        raise BadInput("Settings are too large.")
    get_db().execute(
        "INSERT INTO settings(user_id,data,updated_at) VALUES (?,?,datetime('now')) "
        "ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
        (u["id"], blob))
    return {"ok": True}


# ---------------------------------------------------------------- API: sites

def _clean_site(j):
    s = dict(
        name=text(j, "name", "Site name", 60, required=True),
        lat=num(j, "lat", -90, 90, "Latitude"),
        lon=num(j, "lon", -180, 180, "Longitude"),
        tz=text(j, "tz", "Time zone", 64, required=True),
        az0=num(j, "az0", 0, 360, "Azimuth from"),
        az1=num(j, "az1", 0, 360, "Azimuth to"),
        al0=num(j, "al0", -5, 90, "Altitude from"),
        al1=num(j, "al1", -5, 90, "Altitude to"),
        bortle=num(j, "bortle", 1, 9, "Bortle class", required=False, integer=True),
        notes=text(j, "notes", "Notes", 500),
    )
    if s["tz"] not in TIMEZONES:
        raise BadInput("Pick a time zone from the list.")
    if s["al1"] <= s["al0"]:
        raise BadInput("Altitude 'to' must be higher than altitude 'from'.")
    if s["az0"] == s["az1"]:
        raise BadInput("Azimuth 'from' and 'to' can't be the same. For the whole sky use 0 to 360.")
    return s


def _site(con, uid, sid):
    r = con.execute("SELECT * FROM sites WHERE id=? AND user_id=?", (sid, uid)).fetchone()
    if not r:
        abort(404)
    return dict(r)


@api("/api/sites", methods=("POST",))
def api_site_new(u):
    s = _clean_site(body())
    con = get_db()
    if con.execute("SELECT COUNT(*) FROM sites WHERE user_id=?", (u["id"],)).fetchone()[0] >= 25:
        raise BadInput("You can have up to 25 sites.")
    sid = con.execute(
        "INSERT INTO sites(user_id,name,lat,lon,tz,az0,az1,al0,al1,bortle,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (u["id"], s["name"], s["lat"], s["lon"], s["tz"], s["az0"], s["az1"], s["al0"], s["al1"],
         s["bortle"], s["notes"])).lastrowid
    return {"site": _site(con, u["id"], sid)}


@api("/api/sites/<int:sid>", methods=("PUT", "DELETE"))
def api_site(u, sid):
    con = get_db()
    _site(con, u["id"], sid)
    if request.method == "DELETE":
        if con.execute("SELECT COUNT(*) FROM sites WHERE user_id=?", (u["id"],)).fetchone()[0] <= 1:
            raise BadInput("You need at least one site.")
        con.execute("DELETE FROM sites WHERE id=? AND user_id=?", (sid, u["id"]))
        return {"ok": True}
    s = _clean_site(body())
    con.execute("UPDATE sites SET name=?,lat=?,lon=?,tz=?,az0=?,az1=?,al0=?,al1=?,bortle=?,notes=? "
                "WHERE id=? AND user_id=?",
                (s["name"], s["lat"], s["lon"], s["tz"], s["az0"], s["az1"], s["al0"], s["al1"],
                 s["bortle"], s["notes"], sid, u["id"]))
    return {"site": _site(con, u["id"], sid)}


# ---------------------------------------------------------------- API: equipment (scopes)

def _clean_scope(j):
    s = dict(
        name=text(j, "name", "Scope name", 60, required=True),
        model=text(j, "model", "Model", 30),
        fov_w=num(j, "fov_w", 0.05, 60, "Field of view width"),
        fov_h=num(j, "fov_h", 0.05, 60, "Field of view height"),
        aperture=num(j, "aperture", 1, 2000, "Aperture", required=False),
        focal=num(j, "focal", 1, 20000, "Focal length", required=False),
        pixel=num(j, "pixel", 0.5, 30, "Pixel size", required=False),
        mount=text(j, "mount", "Mount", 10) or "altaz",
        filters=text(j, "filters", "Filters", 120),
        notes=text(j, "notes", "Notes", 500),
    )
    if s["mount"] not in ("altaz", "eq"):
        raise BadInput("Mount must be alt-az or equatorial.")
    if s["fov_h"] > s["fov_w"]:          # keep width as the long side
        s["fov_w"], s["fov_h"] = s["fov_h"], s["fov_w"]
    return s


SCOPE_COLS = ("name", "model", "fov_w", "fov_h", "aperture", "focal", "pixel", "mount", "filters", "notes")


def _scope(con, uid, sid):
    r = con.execute("SELECT * FROM scopes WHERE id=? AND user_id=?", (sid, uid)).fetchone()
    if not r:
        abort(404)
    return dict(r)


@api("/api/scopes", methods=("POST",))
def api_scope_new(u):
    s = _clean_scope(body())
    con = get_db()
    if con.execute("SELECT COUNT(*) FROM scopes WHERE user_id=?", (u["id"],)).fetchone()[0] >= 25:
        raise BadInput("You can have up to 25 scopes.")
    sid = con.execute(f"INSERT INTO scopes(user_id,{','.join(SCOPE_COLS)}) VALUES (?{',?' * len(SCOPE_COLS)})",
                      (u["id"], *[s[c] for c in SCOPE_COLS])).lastrowid
    return {"scope": _scope(con, u["id"], sid)}


@api("/api/scopes/<int:sid>", methods=("PUT", "DELETE"))
def api_scope(u, sid):
    con = get_db()
    _scope(con, u["id"], sid)
    if request.method == "DELETE":
        con.execute("DELETE FROM scopes WHERE id=? AND user_id=?", (sid, u["id"]))   # log entries keep, scope -> NULL
        return {"ok": True}
    s = _clean_scope(body())
    con.execute(f"UPDATE scopes SET {','.join(c + '=?' for c in SCOPE_COLS)} WHERE id=? AND user_id=?",
                (*[s[c] for c in SCOPE_COLS], sid, u["id"]))
    return {"scope": _scope(con, u["id"], sid)}


# ---------------------------------------------------------------- API: imaging log

def _clean_log(con, uid, j):
    d = text(j, "session_date", "Date", 10, required=True)
    try:
        date.fromisoformat(d)
    except ValueError:
        raise BadInput("Date must look like 2026-10-17.")
    site_id = j.get("site_id")
    if site_id in (None, ""):
        site_id = None
    else:
        site_id = num(j, "site_id", 1, 2**62, "Site", integer=True)
        _site(con, uid, site_id)
    scope_id = j.get("scope_id")
    if scope_id in (None, ""):
        scope_id = None
    else:
        scope_id = num(j, "scope_id", 1, 2**62, "Scope", integer=True)
        _scope(con, uid, scope_id)
    return dict(
        session_date=d, site_id=site_id, scope_id=scope_id,
        object_id=text(j, "object_id", "Object", 40, required=True),
        subs=num(j, "subs", 0, 100000, "Number of subs", required=False, integer=True),
        sub_sec=num(j, "sub_sec", 0, 3600, "Sub length", required=False),
        gain=text(j, "gain", "Gain", 20),
        filter=text(j, "filter", "Filter", 30),
        sky=text(j, "sky", "Sky conditions", 120),
        rating=num(j, "rating", 1, 5, "Rating", required=False, integer=True),
        notes=text(j, "notes", "Notes", 2000),
    )


LOG_COLS = ("session_date", "site_id", "scope_id", "object_id", "subs", "sub_sec", "gain", "filter", "sky", "rating", "notes")


@api("/api/log", methods=("GET", "POST"))
def api_log(u):
    con = get_db()
    if request.method == "POST":
        e = _clean_log(con, u["id"], body())
        if con.execute("SELECT COUNT(*) FROM log WHERE user_id=?", (u["id"],)).fetchone()[0] >= 20000:
            raise BadInput("Your log is full (20,000 entries).")
        con.execute(f"INSERT INTO log(user_id,{','.join(LOG_COLS)}) VALUES (?{',?' * len(LOG_COLS)})",
                    (u["id"], *[e[c] for c in LOG_COLS]))
    return {"log": _log(con, u["id"])}


@api("/api/log/<int:lid>", methods=("PUT", "DELETE"))
def api_log_entry(u, lid):
    con = get_db()
    if not con.execute("SELECT 1 FROM log WHERE id=? AND user_id=?", (lid, u["id"])).fetchone():
        abort(404)
    if request.method == "DELETE":
        con.execute("DELETE FROM log WHERE id=? AND user_id=?", (lid, u["id"]))
    else:
        e = _clean_log(con, u["id"], body())
        con.execute(f"UPDATE log SET {','.join(c + '=?' for c in LOG_COLS)} WHERE id=? AND user_id=?",
                    (*[e[c] for c in LOG_COLS], lid, u["id"]))
    return {"log": _log(con, u["id"])}


def _cell(v):
    """Keep spreadsheet programs from treating text as a formula."""
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


@api("/api/log.csv")
def api_log_csv(u):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["date", "object", "subs", "sub_sec", "integration_min", "gain", "filter", "site",
                "scope", "sky", "rating", "notes"])
    for e in reversed(_log(get_db(), u["id"])):
        mins = round(e["subs"] * e["sub_sec"] / 60, 1) if e["subs"] and e["sub_sec"] else ""
        w.writerow([_cell(x) for x in (e["session_date"], e["object_id"], e["subs"], e["sub_sec"], mins,
                                       e["gain"], e["filter"], e["site_name"], e["scope_name"], e["sky"], e["rating"], e["notes"])])
    name = f"imaging-log-{u['username']}-{date.today().isoformat()}.csv"
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- API: account

@api("/api/account", methods=("PUT",))
def api_account(u):
    j = body()
    dn = text(j, "display_name", "Name", 60)
    cs = text(j, "callsign", "Callsign", 12).upper()
    get_db().execute("UPDATE users SET display_name=?, callsign=? WHERE id=?", (dn, cs, u["id"]))
    return {"me": dict(_me(u), display_name=dn, callsign=cs)}


@api("/api/password", methods=("POST",))
def api_password(u):
    j = body()
    if not check_password_hash(u["pw_hash"], str(j.get("current", ""))):
        raise BadInput("Your current password isn't right.")
    new = str(j.get("new", ""))
    if not 8 <= len(new) <= 200:
        raise BadInput("Choose a new password of at least 8 characters.")
    get_db().execute("UPDATE users SET pw_hash=?, must_change_pw=0 WHERE id=?", (generate_password_hash(new), u["id"]))
    return {"ok": True}


@api("/api/logout", methods=("POST",))
def api_logout(u):
    session.clear()
    return {"ok": True}


# ---------------------------------------------------------------- API: admin

def _admin_state(con):
    return {
        "invites": rows(con.execute(
            "SELECT i.code, i.note, i.created_at, i.used_at, u.username AS used_by "
            "FROM invites i LEFT JOIN users u ON u.id=i.used_by ORDER BY i.created_at DESC")),
        "users": _members(con),
        "inactive_days": INACTIVE_DAYS,
    }


def _member(con, username, me, verb):
    m = con.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not m:
        abort(404)
    if m["id"] == me["id"]:
        raise BadInput(f"You can't {verb} your own account here, so the site always keeps an administrator.")
    return m


@api("/api/admin/users/<username>/reset", methods=("POST",), admin=True)
def api_admin_reset(u, username):
    con = get_db()
    m = con.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not m:
        abort(404)
    temp = db.temp_password()
    con.execute("UPDATE users SET pw_hash=?, must_change_pw=1 WHERE id=?", (generate_password_hash(temp), m["id"]))
    return dict(_admin_state(con), temp=temp)


@api("/api/admin/users/<username>/disable", methods=("POST",), admin=True)
def api_admin_disable(u, username):
    con = get_db()
    off = bool(body().get("disabled"))
    m = _member(con, username, u, "turn off")
    con.execute("UPDATE users SET disabled=? WHERE id=?", (1 if off else 0, m["id"]))
    return _admin_state(con)


@api("/api/admin/users/<username>/admin", methods=("POST",), admin=True)
def api_admin_role(u, username):
    con = get_db()
    make = bool(body().get("is_admin"))
    m = _member(con, username, u, "change the role of")
    con.execute("UPDATE users SET is_admin=? WHERE id=?", (1 if make else 0, m["id"]))
    return _admin_state(con)


@api("/api/admin/users/<username>", methods=("DELETE",), admin=True)
def api_admin_delete(u, username):
    con = get_db()
    m = _member(con, username, u, "delete")
    if str(body().get("confirm", "")) != m["username"]:
        raise BadInput(f"Type {m['username']} exactly to confirm.")
    con.execute("DELETE FROM users WHERE id=?", (m["id"],))
    return _admin_state(con)


@api("/api/admin", admin=True)
def api_admin(u):
    return _admin_state(get_db())


@api("/api/admin/invites", methods=("POST",), admin=True)
def api_admin_invite(u):
    note = text(body(), "note", "Note", 80)
    con = get_db()
    code = db.new_invite_code()
    con.execute("INSERT INTO invites(code, note) VALUES (?,?)", (code, note))
    return dict(_admin_state(con), code=code)


@api("/api/admin/invites/<code>", methods=("DELETE",), admin=True)
def api_admin_invite_delete(u, code):
    con = get_db()
    con.execute("DELETE FROM invites WHERE code=? AND used_at IS NULL", (db.normalize_invite(code),))
    return _admin_state(con)


@api("/api/admin/backup.db", admin=True)
def api_admin_backup(u):
    """A consistent copy of the whole database, for keeping somewhere safe.
    Database only: the secret key and server settings never leave the server this way."""
    fd, tmp = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        dest = sqlite3.connect(tmp)
        get_db().backup(dest)
        dest.execute("PRAGMA journal_mode=DELETE")   # a self-contained single file
        dest.close()
        with open(tmp, "rb") as f:
            data = f.read()
    finally:
        os.remove(tmp)
    name = f"planner-{datetime.now():%Y-%m-%d-%H%M}.db"
    return Response(data, mimetype="application/vnd.sqlite3",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
