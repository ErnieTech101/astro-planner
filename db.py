"""SQLite storage for the Astro Imaging Planner.

One database file holds every account. Each row carries a user_id, and the
app only ever queries with the signed-in user's id.
"""
import json
import secrets
import sqlite3
from contextlib import contextmanager

SCHEMA_VERSION = 4

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL DEFAULT '',
    callsign      TEXT NOT NULL DEFAULT '',
    pw_hash       TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT,
    last_seen     TEXT,
    disabled      INTEGER NOT NULL DEFAULT 0,
    must_change_pw INTEGER NOT NULL DEFAULT 0,
    seen_version  TEXT
);
CREATE TABLE IF NOT EXISTS invites (
    code        TEXT PRIMARY KEY,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    used_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at     TEXT
);
CREATE TABLE IF NOT EXISTS settings (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data        TEXT NOT NULL DEFAULT '{}',
    updated_at  TEXT
);
CREATE TABLE IF NOT EXISTS sites (
    id       INTEGER PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    lat      REAL NOT NULL,
    lon      REAL NOT NULL,
    tz       TEXT NOT NULL,
    az0      REAL NOT NULL,
    az1      REAL NOT NULL,
    al0      REAL NOT NULL,
    al1      REAL NOT NULL,
    bortle   INTEGER,
    notes    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sites_user ON sites(user_id);
CREATE TABLE IF NOT EXISTS log (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id       INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    session_date  TEXT NOT NULL,
    object_id     TEXT NOT NULL,
    subs          INTEGER,
    sub_sec       REAL,
    gain          TEXT NOT NULL DEFAULT '',
    filter        TEXT NOT NULL DEFAULT '',
    sky           TEXT NOT NULL DEFAULT '',
    rating        INTEGER,
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS log_user ON log(user_id, session_date);
CREATE TABLE IF NOT EXISTS scopes (
    id        INTEGER PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    model     TEXT NOT NULL DEFAULT '',
    fov_w     REAL NOT NULL,
    fov_h     REAL NOT NULL,
    aperture  REAL,
    focal     REAL,
    pixel     REAL,
    mount     TEXT NOT NULL DEFAULT 'altaz',
    filters   TEXT NOT NULL DEFAULT '',
    notes     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS scopes_user ON scopes(user_id);
"""

# A new account starts with a generic Philadelphia site that the user edits on first login.
DEFAULT_SITE = dict(name="Home", lat=39.95, lon=-75.17, tz="America/New_York",
                    az0=150, az1=210, al0=20, al1=50, bortle=8, notes="")

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I


def connect(path):
    con = sqlite3.connect(path, timeout=10, isolation_level=None)  # autocommit; use tx() for groups
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=5000")
    con.execute("PRAGMA journal_mode=WAL")
    return con


# Columns added after the first release. init() adds any that an older database lacks.
MIGRATIONS = [
    ("users", "last_seen", "TEXT"),
    ("users", "disabled", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "must_change_pw", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "seen_version", "TEXT"),
    ("log", "scope_id", "INTEGER REFERENCES scopes(id) ON DELETE SET NULL"),   # 1.5.2
    ("scopes", "pixel", "REAL"),                                                 # 1.5.3
    ("scopes", "mount", "TEXT NOT NULL DEFAULT 'altaz'"),                        # 1.5.3
]


def init(con):
    con.executescript(SCHEMA)
    for table, col, decl in MIGRATIONS:
        have = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        if col not in have:
            try:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
            except sqlite3.OperationalError as e:      # another worker got there first
                if "duplicate column" not in str(e):
                    raise
    con.execute(f"PRAGMA user_version={SCHEMA_VERSION}")


@contextmanager
def tx(con):
    """Run several statements as one all-or-nothing transaction."""
    con.execute("BEGIN IMMEDIATE")
    try:
        yield con
    except BaseException:
        con.execute("ROLLBACK")
        raise
    else:
        con.execute("COMMIT")


def new_invite_code():
    return "-".join("".join(secrets.choice(INVITE_ALPHABET) for _ in range(4)) for _ in range(3))


def normalize_invite(code):
    raw = "".join(ch for ch in (code or "").upper() if ch.isalnum())
    return "-".join(raw[i:i + 4] for i in range(0, len(raw), 4))


def create_user(con, username, pw_hash, display_name="", callsign="", is_admin=False, site=None, seen_version=None):
    """Insert a user with one starting site and default settings. Call inside tx()."""
    cur = con.execute(
        "INSERT INTO users(username, display_name, callsign, pw_hash, is_admin, seen_version) VALUES (?,?,?,?,?,?)",
        (username, display_name, callsign, pw_hash, 1 if is_admin else 0, seen_version))
    uid = cur.lastrowid
    s = dict(DEFAULT_SITE, **(site or {}))
    sid = con.execute(
        "INSERT INTO sites(user_id,name,lat,lon,tz,az0,az1,al0,al1,bortle,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (uid, s["name"], s["lat"], s["lon"], s["tz"], s["az0"], s["az1"], s["al0"], s["al1"],
         s["bortle"], s["notes"])).lastrowid
    settings = {"site_id": sid, "setupDone": bool(site)}
    con.execute("INSERT INTO settings(user_id, data, updated_at) VALUES (?,?,datetime('now'))",
                (uid, json.dumps(settings)))
    return uid


def temp_password():
    """A readable one-time password, e.g. KQ7M-X2PA-9RTV."""
    return new_invite_code()
