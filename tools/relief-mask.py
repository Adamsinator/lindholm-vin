#!/usr/bin/env python3
"""Keeps a pre-rendered relief (tools/region-relief.js) to the land it is about: every pixel outside the given polygons
turns white, which the atlas draws as no shade, so a wine map of Denmark doesn't shade Sweden's hills or the sea.
The image is on a regular longitude/latitude grid over its box, as tools/hillshade.py makes it.

  python3 tools/relief-mask.py <relief.webp> <lon0> <lat0> <lon1> <lat1> <land.geojson> [more.geojson …]"""
import sys, json, os
from PIL import Image, ImageDraw, ImageChops

def main():
    out, (lon0, lat0, lon1, lat1), files = sys.argv[1], map(float, sys.argv[2:6]), sys.argv[6:]
    im = Image.open(out).convert("L"); w, h = im.size
    mask = Image.new("L", (w, h), 0); dr = ImageDraw.Draw(mask)
    px = lambda p: ((p[0] - lon0) / (lon1 - lon0) * w, (lat1 - p[1]) / (lat1 - lat0) * h)
    n = 0
    for f in files:
        for ft in json.load(open(f))["features"]:
            g = ft["geometry"]; polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            for poly in polys:
                dr.polygon([px(p) for p in poly[0]], fill=255)
                for hole in poly[1:]: dr.polygon([px(p) for p in hole], fill=0)
                n += 1
    white = Image.new("L", (w, h), 255)
    Image.composite(im, white, mask).save(out, "WEBP", quality=int(os.environ.get("RELIEF_QUALITY", "72")), method=6)
    print(f"{out}: kept to {n} polygons of land")

main()
