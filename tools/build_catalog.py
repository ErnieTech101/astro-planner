#!/usr/bin/env python3
"""Build static/catalog.json from OpenNGC.

OpenNGC (https://github.com/mattiaverga/OpenNGC) by Mattia Verga, CC-BY-SA-4.0.
Download NGC.csv and addendum.csv from its database_files folder, then:

    python tools/build_catalog.py NGC.csv addendum.csv > static/catalog.json

What goes in:
  * every Messier and Caldwell object, whatever its magnitude
  * other NGC/IC deep-sky objects with a known magnitude of MAG_LIMIT or brighter
  * not stars, double stars, duplicates, non-existent objects or novae

Each object becomes one row:
  [id, common name, type, RA hours J2000, Dec deg J2000, mag, major axis arcmin, minor axis arcmin,
   surface brightness mag/arcsec2, catalogs ("M", "C", "N" for NGC/IC), aliases]
The first six columns match what the planner has always used.
"""
import csv
import json
import math
import re
import sys

MAG_LIMIT = 10.5          # nothing fainter is realistic for a small smart telescope

TYPES = {
    "G": "Galaxy", "GPair": "Galaxy pair", "GTrpl": "Galaxy trio", "GGroup": "Galaxy group",
    "OCl": "Open cluster", "GCl": "Globular", "PN": "Planetary", "Neb": "Nebula", "HII": "Emission nebula",
    "EmN": "Emission nebula", "RfN": "Reflection nebula", "Cl+N": "Cluster + nebula", "SNR": "Supernova remnant",
    "*Ass": "Star cloud", "DrkN": "Dark nebula", "**": "Double star",
}
SKIP = {"*", "Dup", "NonEx", "Nova", "Other"}

# Magnitudes OpenNGC leaves blank for objects every planner should still offer (visual, rounded).
MAG_FIX = {
    "M22": 5.1, "M24": 4.6, "M35": 5.3, "M45": 1.6, "M62": 6.5, "M69": 7.6, "M70": 7.9, "M71": 8.2, "M107": 7.9,
    "C9": 7.7, "C14": 3.7, "C41": 0.5, "C47": 8.9, "C64": 4.1, "C66": 10.2, "C68": 9.7, "C73": 7.3, "C78": 6.6,
    "C79": 6.8, "C81": 8.2, "C82": 5.2, "C84": 7.6, "C94": 4.2, "C102": 1.9, "C105": 7.8, "C107": 9.2,
}   # standard Messier/Caldwell list values. C99 (Coalsack, a dark nebula) has no magnitude and is left out.
# M102 is disputed. OpenNGC files it as a duplicate of M101; most observing lists use NGC 5866.
MESSIER_FIX = {"NGC 5866": "M102"}
# Common names for objects OpenNGC leaves unnamed, or names observers know better.
NAME_FIX = {"M1": "Crab Nebula", "M101": "Pinwheel Galaxy", "M102": "Spindle Galaxy", "M104": "Sombrero Galaxy", "M11": "Wild Duck Cluster", "M13": "Hercules Cluster", "M15": "Pegasus Cluster", "M16": "Eagle Nebula", "M17": "Omega Nebula", "M20": "Trifid Nebula", "M22": "Sagittarius Cluster", "M24": "Sagittarius Star Cloud", "M27": "Dumbbell Nebula", "M31": "Andromeda Galaxy", "M33": "Triangulum Galaxy", "M42": "Orion Nebula", "M43": "De Mairan's Nebula", "M44": "Beehive Cluster", "M45": "Pleiades", "M57": "Ring Nebula", "M6": "Butterfly Cluster", "M63": "Sunflower Galaxy", "M64": "Black Eye Galaxy", "M7": "Ptolemy Cluster", "M76": "Little Dumbbell", "M8": "Lagoon Nebula", "M81": "Bode's Galaxy", "M82": "Cigar Galaxy", "M83": "Southern Pinwheel", "M97": "Owl Nebula", "NGC 2169": "\"37\" Cluster", "NGC 2244": "Rosette Cluster", "NGC 2264": "Christmas Tree Cluster", "NGC 2360": "Caroline's Cluster", "NGC 2362": "Tau CMa Cluster", "NGC 253": "Sculptor Galaxy", "NGC 3242": "Ghost of Jupiter", "NGC 457": "Owl Cluster", "NGC 6530": "Lagoon Cluster", "NGC 6543": "Cat's Eye Nebula", "NGC 7000": "North America Nebula", "NGC 7009": "Saturn Nebula", "NGC 7293": "Helix Nebula", "NGC 7662": "Blue Snowball", "NGC 7789": "Caroline's Rose", "NGC 869": "Double Cluster (h Per)", "NGC 884": "Double Cluster (χ Per)"}


def ngc_name(raw):
    m = re.match(r"^(NGC|IC)0*(\d+)(.*)$", raw)
    return f"{m.group(1)} {m.group(2)}{m.group(3)}" if m else raw


def hms(s, hours):
    if not s:
        return None
    sign = -1 if s.startswith("-") else 1
    a, b, c = (abs(float(x)) for x in s.lstrip("+-").split(":"))
    return round(sign * (a + b / 60 + c / 3600), 5)


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def main(paths):
    rows = []
    for p in paths:
        with open(p, newline="", encoding="utf-8") as f:
            rows += list(csv.DictReader(f, delimiter=";"))

    out = []
    for r in rows:
        t = r["Type"]
        if t in SKIP and not (r["M"] or re.match(r"^C\d{3}$", r["Name"])):
            continue
        if t == "Dup":
            continue
        name = r["Name"]
        cats, aliases = set(), []
        messier = f"M{int(r['M'])}" if r["M"] else None
        cald = [f"C{int(c)}" for c in re.findall(r"\bC (\d{3})\b", r["Identifiers"])]
        if re.match(r"^C\d{3}$", name):
            cald.append(f"C{int(name[1:])}")
        if re.match(r"^M\d{3}$", name):
            messier = f"M{int(name[1:])}"
        ngc = ngc_name(name) if re.match(r"^(NGC|IC)\d", name) else None
        messier = messier or MESSIER_FIX.get(ngc)
        if messier:
            cats.add("M")
        if cald:
            cats.add("C")
        if ngc:
            cats.add("N")
        # The id people use: Messier first, then NGC/IC, then Caldwell
        oid = messier or ngc or (cald[0] if cald else name)
        for a in [ngc, *cald]:
            if a and a != oid:
                aliases.append(a)
        if r["NGC"] and not ngc:
            aliases += [f"NGC {int(x)}" if x.isdigit() else f"NGC {x}" for x in r["NGC"].split(",")]
        if r["IC"] and not ngc:
            aliases += [f"IC {int(x)}" if x.isdigit() else f"IC {x}" for x in r["IC"].split(",")]

        mag = num(r["V-Mag"]) or num(r["B-Mag"])
        for key in [oid, *aliases]:
            if key in MAG_FIX:
                mag = MAG_FIX[key]
        if not (cats & {"M", "C"}):
            if t in SKIP or mag is None or mag > MAG_LIMIT:
                continue
        if mag is None:
            print(f"note: no magnitude for {oid} ({r['Common names']}), left out", file=sys.stderr)
            continue

        maj, mnr = num(r["MajAx"]), num(r["MinAx"])
        sb = None
        if maj:
            area = math.pi / 4 * maj * (mnr or maj) * 3600          # arcsec^2
            sb = round(mag + 2.5 * math.log10(area), 1)
        common = NAME_FIX.get(oid) or (r["Common names"] or "").split(",")[0].strip()
        out.append([oid, common, TYPES.get(t, t), hms(r["RA"], True), hms(r["Dec"], False), round(mag, 1),
                    maj and round(maj, 1), mnr and round(mnr, 1), sb, "".join(sorted(cats)), aliases])

    out.sort(key=lambda o: (0 if o[0].startswith("M") else 1, o[0]))
    doc = {"source": "OpenNGC by Mattia Verga, https://github.com/mattiaverga/OpenNGC, CC-BY-SA-4.0",
           "columns": ["id", "name", "type", "ra_h", "dec_deg", "mag", "maj_arcmin", "min_arcmin",
                       "sb_mag_arcsec2", "catalogs", "aliases"],
           "objects": out}
    json.dump(doc, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    m = sum("M" in o[9] for o in out)
    c = sum("C" in o[9] for o in out)
    print(f"\n{len(out)} objects: {m} Messier, {c} Caldwell", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:] or ["NGC.csv", "addendum.csv"])
