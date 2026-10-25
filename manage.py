#!/usr/bin/env python3
"""Command-line admin for the Astro Imaging Planner.

    python manage.py init
    python manage.py create-admin dave --name "Dave" --callsign K3DFD --lat 40.08 --lon -75.08
    python manage.py invite --note "for Josh"         (prints a new invite code)
    python manage.py invites
    python manage.py users
    python manage.py reset-password josh
    python manage.py disable josh   /   enable josh
    python manage.py delete-user josh
    python manage.py backup /var/backups/astro-planner/planner-2026-10-17.db
    python manage.py verify planner-2026-10-17.db     (integrity check + counts; changes nothing)

Uses the database at $AIP_DB (default: planner.db next to this file).
"""
import argparse
import getpass
import os
import sys

from werkzeug.security import generate_password_hash

import db

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("AIP_DB", os.path.join(HERE, "planner.db"))


def ask_password():
    while True:
        p1 = getpass.getpass("New password (8+ characters): ")
        if len(p1) < 8:
            print("Too short.")
            continue
        if p1 != getpass.getpass("Again: "):
            print("They don't match. Try again.")
            continue
        return p1


def user_row(con, name):
    u = con.execute("SELECT * FROM users WHERE username=?", (name,)).fetchone()
    if not u:
        sys.exit(f"No user named {name!r}.")
    return u


def main():
    ap = argparse.ArgumentParser(description="Astro Imaging Planner admin")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init", help="create the database tables")
    p = sub.add_parser("create-admin", help="create an administrator account")
    p.add_argument("username")
    p.add_argument("--name", default="")
    p.add_argument("--callsign", default="")
    p.add_argument("--lat", type=float)
    p.add_argument("--lon", type=float)
    p.add_argument("--tz", default="America/New_York")
    p.add_argument("--site-name", default="Home")
    p = sub.add_parser("invite", help="create invite codes")
    p.add_argument("--note", default="")
    p.add_argument("-n", type=int, default=1, help="how many codes")
    sub.add_parser("invites", help="list invite codes")
    sub.add_parser("users", help="list users")
    p = sub.add_parser("reset-password", help="set a new password for a user")
    p.add_argument("username")
    p = sub.add_parser("disable", help="turn an account off (keeps its data)")
    p.add_argument("username")
    p = sub.add_parser("enable", help="turn an account back on")
    p.add_argument("username")
    p = sub.add_parser("delete-user", help="delete a user and all their data")
    p.add_argument("username")
    p = sub.add_parser("backup", help="write a consistent copy of the database")
    p.add_argument("dest")
    p = sub.add_parser("verify", help="check a database file is intact and show what it holds")
    p.add_argument("path")
    a = ap.parse_args()

    if a.cmd == "verify":
        sys.exit(verify(a.path))

    con = db.connect(DB_PATH)
    db.init(con)

    if a.cmd == "init":
        print(f"Database ready at {DB_PATH}")

    elif a.cmd == "create-admin":
        if con.execute("SELECT 1 FROM users WHERE username=?", (a.username,)).fetchone():
            sys.exit("That user name is taken.")
        site = None
        if a.lat is not None and a.lon is not None:
            site = dict(name=a.site_name, lat=a.lat, lon=a.lon, tz=a.tz)
        pw = ask_password()
        with db.tx(con):
            db.create_user(con, a.username, generate_password_hash(pw), a.name, a.callsign.upper(),
                           is_admin=True, site=site)
        print(f"Created administrator {a.username}.")

    elif a.cmd == "invite":
        for _ in range(max(1, a.n)):
            code = db.new_invite_code()
            con.execute("INSERT INTO invites(code, note) VALUES (?,?)", (code, a.note))
            print(code)

    elif a.cmd == "invites":
        for r in con.execute("SELECT i.*, u.username FROM invites i LEFT JOIN users u ON u.id=i.used_by "
                             "ORDER BY i.created_at"):
            state = f"used by {r['username'] or '(deleted user)'} {r['used_at']}" if r["used_at"] else "unused"
            print(f"{r['code']}  {state:40}  {r['note']}")

    elif a.cmd == "users":
        q = ("SELECT u.*, (SELECT COUNT(*) FROM log WHERE user_id=u.id) n, "
             "MAX(COALESCE(u.last_seen,''), COALESCE(u.last_login,''), u.created_at) seen FROM users u ORDER BY seen")
        print(f"{'user':16} {'name':18} {'call':8} {'log':>5}  {'last seen':16}  status")
        for r in con.execute(q):
            flag = "admin" if r["is_admin"] else ""
            flag = "OFF" if r["disabled"] else flag
            print(f"{r['username']:16} {r['display_name'][:18]:18} {r['callsign']:8} {r['n']:5}  {r['seen'][:16]:16}  {flag}")

    elif a.cmd in ("disable", "enable"):
        u = user_row(con, a.username)
        con.execute("UPDATE users SET disabled=? WHERE id=?", (1 if a.cmd == "disable" else 0, u["id"]))
        print(f"{u['username']} is now {'off' if a.cmd == 'disable' else 'on'}.")

    elif a.cmd == "reset-password":
        u = user_row(con, a.username)
        con.execute("UPDATE users SET pw_hash=?, must_change_pw=0 WHERE id=?",
                    (generate_password_hash(ask_password()), u["id"]))
        print("Password changed.")

    elif a.cmd == "delete-user":
        u = user_row(con, a.username)
        if input(f"Type {u['username']} to delete this user, their sites and their log: ") != u["username"]:
            sys.exit("Cancelled.")
        con.execute("DELETE FROM users WHERE id=?", (u["id"],))
        print("Deleted.")

    elif a.cmd == "backup":
        import sqlite3
        dest = sqlite3.connect(a.dest)
        con.backup(dest)
        dest.execute("PRAGMA journal_mode=DELETE")   # a self-contained single file, no -wal/-shm
        dest.close()
        print(f"Backed up to {a.dest}")


def verify(path):
    """Read-only check of a database file. Returns 0 if it is intact."""
    import sqlite3
    if not os.path.isfile(path):
        print(f"No such file: {path}")
        return 1
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        result = con.execute("PRAGMA integrity_check").fetchone()[0]
        print(f"Integrity: {result}")
        if result != "ok":
            return 1
        n = lambda sql: con.execute(sql).fetchone()[0]
        print(f"Schema:    version {n('PRAGMA user_version')}")
        print(f"Members:   {n('SELECT COUNT(*) FROM users')} "
              f"({n('SELECT COUNT(*) FROM users WHERE is_admin=1')} admin)")
        print(f"Sites:     {n('SELECT COUNT(*) FROM sites')}")
        if n("SELECT COUNT(*) FROM sqlite_master WHERE name='scopes'"):     # added in 1.5.2
            print(f"Scopes:    {n('SELECT COUNT(*) FROM scopes')}")
        print(f"Log:       {n('SELECT COUNT(*) FROM log')} entries, newest "
              f"{n('SELECT MAX(session_date) FROM log') or 'none'}")
        print(f"Invites:   {n('SELECT COUNT(*) FROM invites')} "
              f"({n('SELECT COUNT(*) FROM invites WHERE used_at IS NULL')} unused)")
        con.close()
        return 0
    except sqlite3.DatabaseError as e:
        print(f"Not a usable planner database: {e}")
        return 1


if __name__ == "__main__":
    main()
