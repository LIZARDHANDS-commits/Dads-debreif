# Pavement mask from the mosaic: light, grey pixels; opened to drop anything narrower than about 36 ft; kept only where it connects
# to the runways; holes under about 4,000 sq ft filled in one pass. Saves mask.npy (bool) and mask_preview.png over the photo.
import sys
import numpy as np
import cv2

d = sys.argv[1]
m = np.load(d + '/mos.npy').astype(np.int16)
X0, Y1, RES = -4400, 3600, 2
V = m.max(2)
S = (m.max(2) - m.min(2)) / np.maximum(m.max(2), 1)
raw = ((V >= 158) & (S <= 0.22)).astype(np.uint8)
raw = cv2.medianBlur(raw * 255, 5) // 255

disc = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
raw = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, disc(5))  # bridge painted hold lines and joints (10 ft) before anything else
# Fence out what is not the movement area (ARP ft): the base north of the ramp, the main road, and old Echo (drawn on its own).
fence = np.zeros_like(raw)
def poly(pts):
    return np.array([[int((x - X0) / RES), int((Y1 - y) / RES)] for x, y in pts], np.int32)
for pts in [
    [(-1000, 2160), (1300, 2160), (1300, 4000), (-1000, 4000)],     # north of the ramp, west of the Snowbirds apron
    [(1300, 2480), (1700, 2480), (1700, 4000), (1300, 4000)],       # between Hangar 4 and the Snowbirds apron
    [(1600, 3020), (4400, 3020), (4400, 4000), (1600, 4000)],       # the main road and beyond
]:
    cv2.fillPoly(fence, [poly(pts)], 1)
# old Echo: a corridor 70 ft each side of its line
e0, e1 = np.array([-1140, 1370.0]), np.array([280, -1403.0])
u = (e1 - e0) / np.linalg.norm(e1 - e0); nrm = np.array([-u[1], u[0]])
a0, a1 = e0 + 150 * u, e1 - 520 * u  # stop short of 29R and of the 03/29L junction pad
cv2.fillPoly(fence, [poly([a0 + 70 * nrm, a1 + 70 * nrm, a1 - 70 * nrm, a0 - 70 * nrm])], 1)
# keep the 29L / 03 junction itself: Echo's corridor must not cut the runway
raw = raw & (1 - fence)
opened = cv2.morphologyEx(raw, cv2.MORPH_OPEN, disc(6))  # 12 ft radius: under about 26 ft wide goes

n, labels = cv2.connectedComponents(opened, connectivity=8)
px = lambda x, y: (int((Y1 - y) / RES), int((x - X0) / RES))
seeds = [(0, -1251), (1500, -2069), (0, 790), (-1500, -432), (400, 1900)]
keep_ids = {labels[px(x, y)] for x, y in seeds} - {0}
keep = np.isin(labels, list(keep_ids)).astype(np.uint8)

mask = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, disc(3))
# Holes: components of the inverse that do not touch the border; fill the small ones, all at once.
inv = (1 - mask).astype(np.uint8)
n2, lab2, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
H, W = mask.shape
small = np.zeros(n2, bool)
for i in range(1, n2):
    x, y, w, h, area = stats[i]
    touches = x == 0 or y == 0 or x + w == W or y + h == H
    small[i] = (not touches) and area * RES * RES < 4000
mask = (mask.astype(bool) | small[lab2])

np.save(d + '/mask.npy', mask)
photo = cv2.cvtColor(cv2.imread(d + '/mos.png'), cv2.COLOR_BGR2RGB)
photo[mask] = (photo[mask] * 0.35 + np.array([255, 40, 40]) * 0.65).astype(np.uint8)
cv2.imwrite(d + '/mask_preview.png', cv2.cvtColor(cv2.resize(photo, (W // 2, H // 2)), cv2.COLOR_RGB2BGR))
print('kept components', len(keep_ids), 'pavement sq ft', int(mask.sum() * RES * RES))
