# Roof textures for Traffic's 3D buildings (TR-140; Patrick, 10 Oct: roof textures, "ribbed metal on the hangars, membrane or gravel on
# the flat roofs, shingles on the houses, each keeping its photo colour"). Neutral grey, close to white, so each roof's own colour
# (traced off the photo) multiplies through. Tiling, generated, no one's imagery.
#   roof-metal.jpg     1024 px = 40 ft: standing-seam metal, a rib every 2 ft along v, light catching each rib, faint panel streaks.
#   roof-membrane.jpg  1024 px = 60 ft: a flat roof's membrane in 10 ft sheets with lapped seams, gravel speckle, ponding stains.
#   roof-shingles.jpg  1024 px = 30 ft: asphalt shingles in 5 in courses (rows along u, the ridge), tabs offset course by course.
# Usage: python tools/airfield/make-roof-textures.py public/media/traffic-textures
import sys, os
import numpy as np, cv2

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(140)
N = 1024


def periodic_noise(h, w, scale_px, seed):
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    k = np.sqrt((fx / w) ** 2 + (fy / h) ** 2) * scale_px
    n = np.real(np.fft.ifft2(f * np.exp(-(k ** 2) * 2.0)))
    return n / (np.abs(n).max() + 1e-9)


def save(name, g):
    g = (np.clip(g, 0, 1) * 255).astype(np.uint8)
    cv2.imwrite(os.path.join(out, name), g, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(name, os.path.getsize(os.path.join(out, name)) // 1024, 'KB')


# Metal: a panel every 2 ft (51.2 px; 20 in 40 ft) with its standing seam lit on one side and shaded on the other, each panel a
# shade different (so the ribs still read from a few hundred feet, where the seams themselves are too thin to see), long streaks.
x = np.arange(N)[None, :].repeat(N, 0).astype(np.float32)
period = N / 20
ph = (x % period) / period
rib = np.where(ph < 0.08, 1.14, np.where(ph < 0.16, 0.80, 1.0))
panel = 1 + 0.05 * np.sin(np.floor(x / period) * 12.9898 + 1.3)
streak = 1 + 0.04 * np.repeat(periodic_noise(1, N, 6, 2), N, 0)
metal = 0.90 * rib * panel * streak * (1 + 0.06 * periodic_noise(N, N, 200, 3))
save('roof-metal.jpg', metal)

# Membrane: 10 ft sheets (170.7 px), each a shade different, with a darker lapped seam about 5 in wide, gravel speckle and broad
# ponding stains 10 to 30 ft across.
y = np.arange(N)[:, None].repeat(N, 1).astype(np.float32)
sheet = N / 6
sheet_tone = 1 + 0.035 * np.sin(np.floor(y / sheet) * 7.31 + 0.4)
seam = np.where((y % sheet) < 7, 0.80, 1.0)
gravel = 1 + 0.06 * rng.standard_normal((N, N))
stains = 1 - 0.16 * np.clip(periodic_noise(N, N, 260, 4), 0, 1) - 0.06 * np.clip(periodic_noise(N, N, 90, 7), 0, 1)
membrane = 0.92 * sheet_tone * seam * gravel.clip(0.85, 1.15) * stains * (1 + 0.04 * periodic_noise(N, N, 40, 5))
save('roof-membrane.jpg', membrane)

# Shingles: 5 in courses (14.2 px), tabs 12 in wide (34 px), each course offset by half a tab; a shadow line under each course,
# tab-to-tab tone, granule speckle, and broad weathering streaks down the slope that still show from a few hundred feet.
course = N / 72
tab = N / 30
row = np.floor(y / course)
xs = x + (row % 2) * tab / 2
tab_id = np.floor(xs / tab) + row * 97
tone = 0.90 + 0.10 * (np.sin(tab_id * 12.9898) * 43758.5453 % 1.0)
shadow = np.where((y % course) < 2.5, 0.68, 1.0)
slot = np.where((xs % tab) < 1.8, 0.78, 1.0)
streaks = 1 - 0.10 * np.clip(np.repeat(periodic_noise(1, N, 20, 8), N, 0), 0, 1) * (0.6 + 0.4 * periodic_noise(N, N, 160, 9))
shingles = tone * shadow * slot * (1 + 0.05 * rng.standard_normal((N, N))).clip(0.85, 1.15) * streaks * (1 + 0.07 * periodic_noise(N, N, 220, 6))
save('roof-shingles.jpg', shingles * 0.97)

for f in ('roof-metal.jpg', 'roof-membrane.jpg', 'roof-shingles.jpg'):
    print(f, 'mean', round(cv2.imread(os.path.join(out, f), 0).mean() / 255, 3))  # ROOF_MEAN in roof-textures3d.js
