# Builds a north-up mosaic in ARP feet from Esri tiles: x0..x1, y0..y1 at `res` ft a pixel, zoom z. Saves .npy (H, W, 3) uint8.
import sys, math, os, io, urllib.request
import numpy as np
from PIL import Image
x0, x1, y0, y1, res, z = map(float, sys.argv[1:7]); z = int(z); out = sys.argv[7]; tiles_dir = sys.argv[8]
LAT0, LON0, R, F = 50.3303, -105.5592, 6371000, 1/0.3048
os.makedirs(tiles_dir, exist_ok=True)
W, H = int((x1 - x0) / res), int((y1 - y0) / res)
xs = x0 + (np.arange(W) + 0.5) * res
ys = y1 - (np.arange(H) + 0.5) * res
lon = LON0 + (xs / (F * R * math.cos(math.radians(LAT0)))) * 180 / math.pi
lat = LAT0 + (ys / (F * R)) * 180 / math.pi
n = 2 ** z
PX = (lon + 180) / 360 * n * 256
s = np.sin(np.radians(lat)); PY = (0.5 - np.log((1 + s) / (1 - s)) / (4 * math.pi)) * n * 256
tx0, tx1 = int(PX.min() // 256), int(PX.max() // 256); ty0, ty1 = int(PY.min() // 256), int(PY.max() // 256)
big = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256, 3), np.uint8)
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        p = os.path.join(tiles_dir, f'{z}_{tx}_{ty}.jpg')
        if not os.path.exists(p):
            u = f'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{ty}/{tx}'
            open(p, 'wb').write(urllib.request.urlopen(u, timeout=30).read())
        im = Image.open(p).convert('RGB')
        if im.size != (256, 256): raise SystemExit('bad tile')
        big[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = np.asarray(im)
ix = (PX - tx0 * 256).astype(int); iy = (PY - ty0 * 256).astype(int)
mos = big[iy[:, None], ix[None, :]]
np.save(out, mos)
Image.fromarray(mos).save(out.replace('.npy', '.png'))
print(out, mos.shape)
