"""Build static/sky.json (bright stars + constellation figures) from d3-celestial data.

Source: https://github.com/ofrohn/d3-celestial (BSD 3-Clause, (c) 2015 Olaf Frohn).
Stars there come from the XHIP Hipparcos compilation; lines and name positions
follow the IAU constellation charts. Keep the credit in the About box.

Usage:  python tools/build_sky.py stars.6.json constellations.lines.json constellations.json > static/sky.json
"""
import json, sys

MAG_LIMIT = 5.0          # Bortle-8 friendly; keeps the chart light

def ra_h(lon):           # GeoJSON longitude (-180..180) -> RA hours
    return round(((lon + 360) % 360) / 15, 4)

def main(stars_f, lines_f, names_f):
    stars = []
    for f in json.load(open(stars_f))["features"]:
        m = f["properties"]["mag"]
        if m is not None and m <= MAG_LIMIT:
            lon, lat = f["geometry"]["coordinates"]
            stars.append([ra_h(lon), round(lat, 3), round(m, 1)])
    stars.sort(key=lambda s: s[2])
    lines = {}
    for f in json.load(open(lines_f))["features"]:
        lines[f["id"]] = [[[ra_h(p[0]), round(p[1], 3)] for p in seg]
                          for seg in f["geometry"]["coordinates"]]
    names = []
    for f in json.load(open(names_f))["features"]:
        p = f["properties"]; lon, lat = f["geometry"]["coordinates"]
        names.append([f["id"], p["name"], int(p.get("rank", 3)), ra_h(lon), round(lat, 2)])
    out = {"credit": "Stars and constellation figures: d3-celestial (BSD 3-Clause, Olaf Frohn), "
                     "stars from the XHIP Hipparcos compilation.",
           "stars": stars, "lines": lines, "names": names}
    json.dump(out, sys.stdout, separators=(",", ":"))
    print(f"{len(stars)} stars to mag {MAG_LIMIT}, {len(lines)} figures, {len(names)} names", file=sys.stderr)

if __name__ == "__main__":
    main(*sys.argv[1:4])
