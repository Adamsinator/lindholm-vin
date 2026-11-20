#!/usr/bin/env python3
"""A hillshade for a region whose relief no tile service gives us (Piedmont): rendered once from an open terrain model
and served with the site. Reads a GeoTIFF that is uncompressed float32 in WGS84 / UTM 32N (Regione Piemonte's DTM 25,
ICE 2009-2011, CC BY 4.0: one row a strip), shades it (light from the north-west, 45 deg up) and resamples it onto a
regular longitude/latitude grid, which the atlas lays under a pack drawn on its equirectangular grid.

  python3 tools/hillshade.py <dtm.tif> <lon0> <lat0> <lon1> <lat1> <out.webp> [metres a pixel, default 10]

Only numpy and Pillow; the TIFF is mapped from disk, not read whole."""
import sys, math
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

def geotiff(path):
    im = Image.open(path); t = im.tag_v2
    assert t.get(259) == 1 and im.mode == "F", "needs an uncompressed float32 GeoTIFF"
    assert 32632 in (t.get(34735) or ()), "needs WGS84 / UTM 32N"
    offs = t.get(273); W, H = im.size
    assert all(offs[i + 1] - offs[i] == W * 4 for i in range(min(50, len(offs) - 1))), "rows must be contiguous"
    little = im.tag_v2.get(254) is not None or open(path, "rb").read(2) == b"II"
    data = np.memmap(path, dtype="<f4" if little else ">f4", mode="r", offset=offs[0], shape=(H, W))
    sx, sy = t.get(33550)[:2]; tie = t.get(33922)
    return data, tie[3], tie[4], sx, sy, float(t.get(42113) or 0)

def utm32(lon, lat):  # WGS84 → UTM 32N, arrays
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f); ep2 = e2 / (1 - e2); d = math.pi / 180
    phi = lat * d; lam = (lon - 9.0) * d
    N = a / np.sqrt(1 - e2 * np.sin(phi) ** 2); T = np.tan(phi) ** 2; C = ep2 * np.cos(phi) ** 2; A = np.cos(phi) * lam
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * np.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * np.sin(4 * phi) - (35 * e2 ** 3 / 3072) * np.sin(6 * phi))
    E = 500000 + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120)
    Nn = k0 * (M + N * np.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720))
    return E, Nn

def main():
    tif, lon0, lat0, lon1, lat1, out = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
    res = float(sys.argv[7]) if len(sys.argv) > 7 else 10.0
    dem, x0, y0, sx, sy, nodata = geotiff(tif)
    # the window of the model the box needs (its corners in UTM, and a margin for the slope's neighbours)
    cl, cr = np.array([lon0, lon1, lon0, lon1]), np.array([lat0, lat0, lat1, lat1]); E, N = utm32(cl, cr)
    c0 = max(0, int((E.min() - x0) / sx) - 3); c1 = min(dem.shape[1], int((E.max() - x0) / sx) + 4)
    r0 = max(0, int((y0 - N.max()) / sy) - 3); r1 = min(dem.shape[0], int((y0 - N.min()) / sy) + 4)
    z = np.array(dem[r0:r1, c0:c1], dtype=np.float64)
    z[z == nodata] = np.nan; z = np.where(np.isnan(z), np.nanmean(z), z)
    # the shading: slope and aspect from the grid, the sun in the north-west at 45 deg, the hills a little taller
    gy, gx = np.gradient(z * 1.6, sy, sx)  # rows grow southwards: the slope northwards is -gy
    dzde, dzdn = gx, -gy
    az, alt = math.radians(315), math.radians(45)  # the light: azimuth clockwise from north, height above the horizon
    L = (math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt))
    hs = np.clip((-dzde * L[0] - dzdn * L[1] + L[2]) / np.sqrt(dzde ** 2 + dzdn ** 2 + 1), 0, 1)  # the ground's normal · the light
    # onto a regular longitude/latitude grid (the atlas's equirectangular pack is linear in both), bilinear
    w = int(round((lon1 - lon0) * 111320 * math.cos(math.radians((lat0 + lat1) / 2)) / res)); h = int(round((lat1 - lat0) * 110574 / res))
    LON, LAT = np.meshgrid(np.linspace(lon0, lon1, w), np.linspace(lat1, lat0, h))
    E, N = utm32(LON, LAT)
    fc = (E - x0) / sx - c0 - 0.5; fr = (y0 - N) / sy - r0 - 0.5
    i0 = np.clip(np.floor(fr).astype(int), 0, hs.shape[0] - 2); j0 = np.clip(np.floor(fc).astype(int), 0, hs.shape[1] - 2)
    dr = np.clip(fr - i0, 0, 1); dc = np.clip(fc - j0, 0, 1)
    v = (hs[i0, j0] * (1 - dr) * (1 - dc) + hs[i0 + 1, j0] * dr * (1 - dc) + hs[i0, j0 + 1] * (1 - dr) * dc + hs[i0 + 1, j0 + 1] * dr * dc)
    # flat ground light, the shaded sides dark: the atlas multiplies it over its colours
    flat = math.sin(alt)
    img = np.clip(255 * v / flat, 0, 255).astype(np.uint8)
    Image.fromarray(img, "L").save(out, "WEBP", quality=72, method=6)
    print(f"{out}: {w}×{h} px, {res:g} m a pixel, model window {c1 - c0}×{r1 - r0} cells")

if __name__ == "__main__":
    main()
