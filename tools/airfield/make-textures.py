# Pavement textures for Traffic's 3D airfield (TR-136; Patrick, 10 Oct, with photos of the ramp and 29L: "this is what they look like
# IRL"). Generated, not photographed, so they tile without seams and carry no one's imagery:
#   concrete.jpg  2048 px = 200 ft: 25 ft slabs (an estimate from the photo's joints), each a slightly different tone, dark sealed
#                 joints, hairline and tar-sealed cracks in some slabs, fine grain.
#   asphalt.jpg   1024 px = 100 ft: dark aggregate grain with a few sealed cracks (Echo, the ramp's south lane).
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


# ---- concrete ----
N, SLABS = 2048, 8
S = N // SLABS
base = np.array([196, 191, 177], np.float32)  # RGB, sampled off the photo's older concrete
img = np.ones((N, N, 3), np.float32) * base
for i in range(SLABS):
    for j in range(SLABS):
        tone = 1 + rng.normal(0, 0.035)
        warm = rng.normal(0, 0.012)
        img[j * S:(j + 1) * S, i * S:(i + 1) * S] *= np.array([tone + warm, tone, tone - warm], np.float32)
img *= (1 + 0.035 * periodic_noise(N, N, 180, 1))[..., None]          # broad mottling
img *= (1 + 0.020 * periodic_noise(N, N, 12, 2))[..., None]           # fine grain
img *= (1 + 0.030 * rng.standard_normal((N, N)))[..., None].clip(0.9, 1.1)  # speckle
# stains: a few soft darker patches
for _ in range(14):
    c = rng.uniform(0, N, 2); r = rng.uniform(30, 120)
    m = np.zeros((N, N), np.float32)
    for dx in (-N, 0, N):
        for dy in (-N, 0, N):
            cv2.circle(m, (int(c[0] + dx), int(c[1] + dy)), int(r), 1, -1, cv2.LINE_AA)
    m = cv2.GaussianBlur(m, (0, 0), r / 2)
    img *= (1 - 0.06 * m)[..., None]
canvas = img.clip(0, 255).astype(np.uint8).copy()
# cracks: in about a third of the slabs, hairline (light grey) or tar-sealed (dark, wider)
for i in range(SLABS):
    for j in range(SLABS):
        if rng.random() > 0.38: continue
        x0, y0 = i * S, j * S
        for _ in range(rng.integers(1, 3)):
            sides = rng.choice(4, 2, replace=False)
            def on(side):
                t = rng.uniform(0.15, 0.85) * S
                return np.array([[x0 + t, y0], [x0 + S, y0 + t], [x0 + t, y0 + S], [x0, y0 + t]][side], float)
            pts = crack(on(sides[0]), on(sides[1]), 3.0)
            if rng.random() < 0.5:
                wrap_polyline(canvas, pts, (70, 66, 60), 4)      # tar-sealed
            else:
                wrap_polyline(canvas, pts, (138, 133, 122), 1)   # hairline
# joints: dark sealant, about 1 in wide (2 px), at every slab edge (x = 0 wraps)
for k in range(SLABS):
    p = k * S
    for q in (p - 1, p, p + 1 if p == 0 else p):
        q %= N
        canvas[:, q] = (canvas[:, q] * 0.55).astype(np.uint8)
        canvas[q, :] = (canvas[q, :] * 0.55).astype(np.uint8)
cv2.imwrite(os.path.join(out, 'concrete.jpg'), cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])

# ---- asphalt ----
M = 1024
a = np.ones((M, M, 3), np.float32) * np.array([84, 84, 86], np.float32)
a *= (1 + 0.06 * periodic_noise(M, M, 120, 3))[..., None]
a *= (1 + 0.10 * rng.standard_normal((M, M))).clip(0.75, 1.3)[..., None]   # aggregate
light = rng.random((M, M)) < 0.015
a[light] *= 1.5
acan = a.clip(0, 255).astype(np.uint8).copy()
for _ in range(5):
    p0 = rng.uniform(0, M, 2); p1 = p0 + rng.normal(0, 260, 2)
    wrap_polyline(acan, crack(p0, p1, 4.0), (40, 40, 42), 3)
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
for f in ('concrete.jpg', 'asphalt.jpg', 'rubber.png'):
    print(f, os.path.getsize(os.path.join(out, f)) // 1024, 'KB')
