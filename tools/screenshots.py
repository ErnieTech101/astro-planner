"""Retake the README screenshots in docs/screenshots/.

Builds a throwaway demo database (one member, a Fox Chase site, a Dwarf Mini,
a few log entries), runs the app on a private port, and photographs it with
a headless browser. No real member data is ever used.

Needs:  pip install playwright && python -m playwright install chromium
Usage:  python tools/screenshots.py            (from the project folder)
        AIP_CHROMIUM=/path/to/chrome python tools/screenshots.py
"""
import json
import os
import sys
import tempfile
import threading

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "docs", "screenshots")
DATE = "2027-02-05"          # new Moon, Orion in the southern window: a good spread of targets
PORT = 8099

tmp = tempfile.mkdtemp(prefix="aip-shots-")
os.environ["AIP_DB"] = os.path.join(tmp, "demo.db")
os.environ["AIP_SECRET_KEY"] = "screenshots-only-" + "x" * 32
sys.path.insert(0, HERE)

import app as A          # noqa: E402  (needs the environment above)
import db                # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402
from werkzeug.serving import make_server              # noqa: E402

from changelog import CHANGELOG  # noqa: E402


def build_demo():
    con = db.connect(os.environ["AIP_DB"])
    with db.tx(con):
        uid = db.create_user(con, "demo", generate_password_hash("demo-password"), "Dave", "K3DFD", True,
                             dict(name="Fox Chase", lat=40.08, lon=-75.08, tz="America/New_York",
                                  az0=150, az1=210, al0=20, al1=50, bortle=8),
                             seen_version=A.VERSION)
        sid = con.execute("SELECT id FROM sites WHERE user_id=?", (uid,)).fetchone()[0]
        scope = con.execute(
            "INSERT INTO scopes(user_id,name,model,fov_w,fov_h,aperture,focal,pixel,mount,filters) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (uid, "Dwarf Mini", "Dwarf Mini", 2.13, 1.20, 30, 150, 2.9, "altaz", "Astro, Dual-band")).lastrowid
        for d, obj, subs, sec, flt, rating, note in [
            ("2026-10-16", "M2", 240, 15, "Astro", 4, "Tight core, steady seeing"),
            ("2026-10-18", "NGC 7293", 360, 15, "Dual-band", 3, "Helix faint but there"),
            ("2026-10-25", "M15", 200, 15, "Astro", 4, ""),
            ("2026-11-02", "M33", 300, 15, "Astro", 2, "Washed out from town"),
        ]:
            con.execute("INSERT INTO log(user_id,site_id,scope_id,session_date,object_id,subs,sub_sec,filter,rating,notes) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?)", (uid, sid, scope, d, obj, subs, sec, flt, rating, note))
        settings = dict(site_id=sid, scope_id=scope, setupDone=True, mag=7, dur=60, t0="19:00", t1="21:00",
                        cats="MCN", sb=0, moonRule="show", showConst=True, showStars=True, showMer=True)
        con.execute("UPDATE settings SET data=? WHERE user_id=?", (json.dumps(settings), uid))
    con.close()


def shoot():
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    base = f"http://127.0.0.1:{PORT}"
    with sync_playwright() as p:
        exe = os.environ.get("AIP_CHROMIUM")
        br = p.chromium.launch(**({"executable_path": exe} if exe else {}))
        pg = br.new_page(viewport={"width": 1100, "height": 1000}, device_scale_factor=1.5)
        pg.goto(base + "/login")
        pg.fill("input[name=username]", "demo")
        pg.fill("input[name=password]", "demo-password")
        pg.click("button[type=submit]")
        pg.wait_for_selector("#chart svg")
        pg.fill("#date", DATE)
        pg.dispatch_event("#date", "change")
        pg.wait_for_timeout(500)
        pg.evaluate("document.activeElement.blur()")
        pg.mouse.move(0, 0)

        def window_top(name):
            # the app window from the title bar down to the end of the sky box chart
            top = pg.locator(".win").first.bounding_box()
            chart = pg.locator("fieldset:has(#chart)").bounding_box()
            pg.screenshot(path=os.path.join(OUT, name), full_page=True, clip={"x": top["x"], "y": top["y"], "width": top["width"],
                                                              "height": chart["y"] + chart["height"] + 12 - top["y"]})
            print("wrote", name)

        window_top("planner.png")
        pg.locator("fieldset:has(#list)").screenshot(path=os.path.join(OUT, "targets.png")); print("wrote targets.png")
        pg.click("#red")
        pg.wait_for_timeout(300)
        window_top("red-light.png")
        pg.click("#red")
        pg.click("#mylog")
        pg.wait_for_timeout(300)
        pg.locator(".dlg").screenshot(path=os.path.join(OUT, "imaging-log.png")); print("wrote imaging-log.png")
        pg.click(".dlg .x")
        pg.click("#setup")
        pg.click("#tab_equip")
        pg.wait_for_timeout(300)
        pg.locator(".dlg").screenshot(path=os.path.join(OUT, "equipment.png")); print("wrote equipment.png")
        br.close()


if __name__ == "__main__":
    build_demo()
    srv = make_server("127.0.0.1", PORT, A.app)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        shoot()
    finally:
        srv.shutdown()
    print(f"Screenshots for version {A.VERSION} ({CHANGELOG[0][0]} is the newest changelog entry) are in {OUT}")
