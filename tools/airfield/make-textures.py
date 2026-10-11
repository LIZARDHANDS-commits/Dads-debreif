# Pavement textures for Traffic's 3D airfield (TR-136; Patrick, 10 Oct, with photos of the ramp and 29L: "this is what they look like
# IRL"). Generated, not photographed, so they tile without seams and carry no one's imagery:
#   cracked.jpg   2048 px = 400 ft: continuous concrete in 25 ft lanes (very faint joints along u), irregular transverse cracks, a network
#                 of hairline and sealed cracks, broad mottling and a few repaired patches (runways past their threshold zones, 03/21,
#                 taxiways, ramp; TR-137, TR-138: twice the tile and less regular, Patrick: "make the pattern less obviously regular").
#   blocks.jpg    2048 px = 200 ft: square 25 ft slabs with sealed joints, barely varying tone (the threshold zones only).
#   asphalt.jpg   1024 px = 100 ft: mid-grey aggregate grain with a few sealed cracks; tinted darker for Echo's fresh asphalt and
#                 lighter for the ramp lane's weathered asphalt (TR-138).
#   rubber.png    2048 x 256 px = 400 ft along by 40 ft across: tyre-rubber streaks for the runway centrelines (alpha only).
# Usage: python tools/airfield/make-textures.py public/media/traffic-textures
import sys, os
import numpy as np, cv2

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(156)


def periodic_noise(h, w, scale_px, seed):
    """Smooth noise that wraps at the edges (filtered in frequency space), about -1..1."""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    k = np.sqrt((fx / w) ** 2 + (fy / h) ** 2) * scale_px
    n = np.real(np.fft.ifft2(f * np.exp(-(k ** 2) * 2.0)))
    return n / (np.abs(n).max() + 1e-9)


def wrap_polyline(img, pts, color, width):
    """Draws a polyline on a tiling image: again shifted by the image size wherever it crosses an edge."""
    h, w = img.shape[:2]
    for dx in (-w, 0, w):
        for dy in (-h, 0, h):
            cv2.polylines(img, [np.int32(pts + [dx, dy])], False, color, width, cv2.LINE_AA)


def crack(start, end, wobble, steps=24):
    """A wandering crack between two points."""
    t = np.linspace(0, 1, steps)[:, None]
    line = start + (end - start) * t
    side = np.array([-(end - start)[1], (end - start)[0]], float)
    side /= np.linalg.norm(side) + 1e-9
    walk = np.cumsum(rng.standard_normal(steps)) * wobble
    walk -= np.linspace(0, walk[-1], steps)  # ends on the end point
    return line + side * walk[:, None]


# ---- concrete: two kinds (Patrick, 10 Oct: "the blocks are only at the thresholds ... the rest is just cracked") ----
N = 2048  # 200 ft
base = np.array([198, 193, 180], np.float32)  # RGB, sampled off the photo's older concrete


def concrete_base(seed, tone_sd):
    """Concrete grain and mottling, tiling."""
    im = np.ones((N, N, 3), np.float32) * base
    im *= (1 + 0.030 * periodic_noise(N, N, 220, seed))[..., None]
    im *= (1 + 0.016 * periodic_noise(N, N, 14, seed + 1))[..., None]
    im *= (1 + 0.022 * rng.standard_normal((N, N))).clip(0.92, 1.08)[..., None]
    return im


def crack_network(canvas, count, hair=(150, 145, 134), tar=(118, 113, 103), tar_share=0.3, length=(80, 420)):
    """Wandering cracks, some branching, mostly hairline and some tar-sealed, drawn wrapping across the tile."""
    for _ in range(count):
        p0 = rng.uniform(0, N, 2)
        ang = rng.uniform(0, np.pi)
        L = rng.uniform(*length)
        p1 = p0 + L * np.array([np.cos(ang), np.sin(ang)])
        pts = crack(p0, p1, rng.uniform(1.5, 4.0), steps=max(8, int(L / 12)))
        sealed = rng.random() < tar_share
        wrap_polyline(canvas, pts, tar if sealed else hair, 2 if sealed else 1)
        if rng.random() < 0.4:  # a branch
            k = rng.integers(2, len(pts) - 2)
            b_ang = ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.2)
            q1 = pts[k] + rng.uniform(40, 160) * np.array([np.cos(b_ang), np.sin(b_ang)])
            wrap_polyline(canvas, crack(pts[k], q1, 2.0, 10), tar if sealed else hair, 2 if sealed else 1)


# Cracked: continuous pavement, 400 ft a tile (2,048 px, about 2.3 in a pixel), in 25 ft lanes along u with very faint joints, irregular
# transverse cracks, a network of hairline and sealed cracks, broad mottling and a few repaired patches, so it does not read as a grid.
LANES = 16
LW = N // LANES
img = np.ones((N, N, 3), np.float32) * base
img *= (1 + 0.055 * periodic_noise(N, N, 420, 31))[..., None]          # broad mottling, a few hundred feet across
img *= (1 + 0.025 * periodic_noise(N, N, 60, 32))[..., None]
img *= (1 + 0.014 * periodic_noise(N, N, 10, 33))[..., None]
img *= (1 + 0.020 * rng.standard_normal((N, N))).clip(0.93, 1.07)[..., None]
for lane in range(LANES):
    img[lane * LW:(lane + 1) * LW] *= 1 + rng.normal(0, 0.006)
for _ in range(10):  # repaired patches: a slab-sized block a shade lighter or darker, soft-edged
    x0, y0 = rng.integers(0, N - 260, 2)
    w, h = rng.integers(60, 240, 2)
    m = np.zeros((N, N), np.float32)
    m[y0:y0 + h, x0:x0 + w] = 1
    m = cv2.GaussianBlur(m, (0, 0), 1.5)
    img *= (1 + rng.choice([-1, 1]) * rng.uniform(0.03, 0.06) * m)[..., None]
canvas = img.clip(0, 255).astype(np.uint8).copy()
for lane in range(LANES):
    y = lane * LW
    if rng.random() < 0.7:  # not every lane joint shows
        canvas[y % N, :] = (canvas[y % N, :] * 0.90).astype(np.uint8)
    x = int(rng.uniform(0, 300))
    while x < N:
        x += int(rng.uniform(70, 260))
        if x >= N: break
        if rng.random() < 0.35: continue
        pts = crack(np.array([x, y + 1.0]), np.array([x + rng.normal(0, 18), y + LW - 1.0]), 1.8, 8)
        wrap_polyline(canvas, pts, (125, 120, 110) if rng.random() < 0.4 else (152, 147, 136), 1)
crack_network(canvas, 55, hair=(165, 160, 149), tar=(132, 127, 117), tar_share=0.25, length=(40, 260))
cv2.imwrite(os.path.join(out, 'cracked.jpg'), cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])

# Blocks: the threshold zones' square 25 ft slabs, joints sealed, tone barely varying (no checkerboard), a few cracks.
img = concrete_base(21, 0)
S = N // 8
for i in range(8):
    for j in range(8):
        img[j * S:(j + 1) * S, i * S:(i + 1) * S] *= 1 + rng.normal(0, 0.012)
canvas = img.clip(0, 255).astype(np.uint8).copy()
crack_network(canvas, 30, length=(40, 200), tar_share=0.2)
for k in range(8):
    q = k * S
    for r in (q, (q + 1) % N):
        canvas[:, r] = (canvas[:, r] * 0.62).astype(np.uint8)
        canvas[r, :] = (canvas[r, :] * 0.62).astype(np.uint8)
cv2.imwrite(os.path.join(out, 'blocks.jpg'), cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])

# ---- asphalt ----
M = 1024
a = np.ones((M, M, 3), np.float32) * np.array([110, 110, 112], np.float32)
a *= (1 + 0.06 * periodic_noise(M, M, 120, 3))[..., None]
a *= (1 + 0.10 * rng.standard_normal((M, M))).clip(0.75, 1.3)[..., None]   # aggregate
light = rng.random((M, M)) < 0.015
a[light] *= 1.5
acan = a.clip(0, 255).astype(np.uint8).copy()
for _ in range(5):
    p0 = rng.uniform(0, M, 2); p1 = p0 + rng.normal(0, 260, 2)
    wrap_polyline(acan, crack(p0, p1, 4.0), (70, 70, 72), 2)
cv2.imwrite(os.path.join(out, 'asphalt.jpg'), cv2.cvtColor(acan, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])

# ---- tyre rubber (alpha) ----
L, Wd = 2048, 256
alpha = np.zeros((Wd, L), np.float32)
v = np.linspace(-1, 1, Wd)[:, None]
along = 0.5 + 0.5 * periodic_noise(1, L, 300, 4)[0][None, :]
for centre, width, strength in [(0, 0.35, 0.55), (-0.25, 0.12, 0.35), (0.25, 0.12, 0.35), (-0.05, 0.05, 0.4), (0.07, 0.04, 0.35)]:
    alpha += strength * np.exp(-((v - centre) / width) ** 2)
streaks = 0.5 + 0.5 * periodic_noise(Wd, L, 3, 5)
alpha *= along * (0.6 + 0.6 * streaks)
alpha = (alpha / alpha.max()).clip(0, 1)
rgba = np.zeros((Wd, L, 4), np.uint8)
rgba[..., 3] = (alpha * 255).astype(np.uint8)
cv2.imwrite(os.path.join(out, 'rubber.png'), rgba)
for f in ('cracked.jpg', 'blocks.jpg', 'asphalt.jpg', 'rubber.png'):
    print(f, os.path.getsize(os.path.join(out, f)) // 1024, 'KB')
