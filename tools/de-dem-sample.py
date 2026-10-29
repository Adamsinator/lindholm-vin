#!/usr/bin/env python3
"""Heights from Rheinland-Pfalz's 1 m terrain model (DGM1, ©GeoBasis-DE / LVermGeoRP, dl-de/by-2-0) at given points,
for tools/de-dem.js. Reads [[E, N], …] in ETRS89 / UTM 32N (EPSG:25832) as JSON on stdin, writes the heights (m,
DHHN2016; null where the model has none) as JSON on stdout. Tiles are 1 km², named by their south-west corner in km
(dgm1_32_<E>_<N>_1_rp_<year>.tif); each is fetched once, read, and dropped — only the points' heights are kept.

    needs: pip install tifffile imagecodecs numpy        (curl does the downloading: it goes through the proxy)
"""
import json, os, subprocess, sys, tempfile
import tifffile

BASE = "https://geobasis-rlp.de/data/dgm1/current/tif/"
listing_file = os.path.join(os.path.dirname(__file__), ".dem-cache", "rlp-dgm1-listing.html")

def listing():
    os.makedirs(os.path.dirname(listing_file), exist_ok=True)
    if not os.path.exists(listing_file):
        subprocess.run(["curl", "-sS", "--max-time", "300", "--retry", "5", "-o", listing_file, BASE], check=True)
    names = {}
    import re
    for m in re.finditer(r'href="(dgm1_32_(\d+)_(\d+)_1_rp_(\d+)\.tif)"', open(listing_file, encoding="utf-8").read()):
        key = (int(m.group(2)), int(m.group(3)))
        if key not in names or m.group(4) > names[key][1]: names[key] = (m.group(1), m.group(4))  # the newest year
    return {k: v[0] for k, v in names.items()}

def main():
    pts = json.load(sys.stdin)
    tiles = listing()
    by_tile = {}
    for i, (e, n) in enumerate(pts):
        by_tile.setdefault((int(e // 1000), int(n // 1000)), []).append(i)
    out = [None] * len(pts)
    with tempfile.TemporaryDirectory() as tmp:
        for k, (key, idx) in enumerate(sorted(by_tile.items())):
            name = tiles.get(key)
            if not name: continue  # outside Rheinland-Pfalz
            f = os.path.join(tmp, name)
            for attempt in range(5):
                r = subprocess.run(["curl", "-sS", "--max-time", "180", "-o", f, BASE + name])
                if r.returncode == 0 and os.path.getsize(f) > 1000: break
            else:
                raise SystemExit("couldn't fetch " + name)
            with tifffile.TiffFile(f) as t:
                a = t.pages[0].asarray()
                x0, y0 = t.pages[0].tags[33922].value[3:5]  # the top-left corner, metres; 1 m cells
                nod = t.pages[0].tags.get(42113)
                nodata = float(nod.value) if nod else -9999
            for i in idx:
                e, n = pts[i]
                c, rr = int(e - x0), int(y0 - n)
                if 0 <= rr < a.shape[0] and 0 <= c < a.shape[1]:
                    v = float(a[rr, c])
                    out[i] = None if v <= nodata + 1 else round(v, 2)
            os.remove(f)
            if (k + 1) % 50 == 0: print(f"  {k + 1}/{len(by_tile)} tiles", file=sys.stderr, flush=True)
    json.dump(out, sys.stdout)

main()
