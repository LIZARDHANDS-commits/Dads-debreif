# Road surfaces for Traffic's OpenStreetMap roads (TR-144). Each picture runs across the road (u, 0 at one edge, 1 at the other)
# and along it (v, one tile ROAD_TILE_FT long, in osm3d.js), with soft see-through edges so the road meets the photo's verge.
# Generated, no one's imagery. Sizes are estimates of common Saskatchewan practice, not a survey:
#   road-highway.png  36 ft wide: two 12 ft lanes, 6 ft paved shoulders, white edge lines, a broken yellow centre line (10 ft
#                     dashes, 30 ft apart).
#   road-paved.png    plain asphalt, no lines (town streets, paved grid roads).
#   road-gravel.png   a grid road's gravel: two darker wheel tracks, a loose ridge in the middle and at the edges.
#   road-dirt.png     a farm track: two bare wheel ruts with the grass showing between them.
# Usage: python tools/osm/make-road-textures.py public/media/traffic-textures
import sys, os
import numpy as np, cv2

out = sys.argv[1]
W, H = 128, 512  # across, along (one tile, 120 ft along)
rng = np.random.default_rng(144)
u = (np.arange(W)[None, :] + 0.5) / W
v = (np.arange(H)[:, None] + 0.5) / H


def noise(scale, seed):
    r = np.random.default_rng(seed)
    n = cv2.resize(r.standard_normal((max(2, H // scale), max(2, W // scale))).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    return n / (np.abs(n).max() + 1e-6)


def edge_alpha(soft=0.04):
    a = np.clip(np.minimum(u, 1 - u) / soft, 0, 1)
    return np.repeat(a, H, 0)


def save(name, rgb, alpha):
    img = np.dstack([np.clip(rgb, 0, 255)[..., ::-1], np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    cv2.imwrite(os.path.join(out, name), img, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    print(name, os.path.getsize(os.path.join(out, name)) // 1024, 'KB')


def asphalt(base):
    g = base * (1 + 0.05 * noise(8, 1) + 0.06 * rng.standard_normal((H, W)).clip(-2, 2) * 0.5)
    return np.dstack([g, g, g * 1.02])


# Highway: across 36 ft; shoulders 0-6 and 30-36 ft a touch lighter; edge lines (4 in) at 6 ft; yellow broken centre line.
ft = u * 36
rgb = asphalt(96)
rgb[np.broadcast_to((ft < 6) | (ft > 30), (H, W))] *= 1.08
line = lambda a, b: np.broadcast_to((ft >= a) & (ft < b), (H, W))
rgb[line(5.85, 6.25)] = (232, 232, 226)
rgb[line(29.75, 30.15)] = (232, 232, 226)
dash = np.broadcast_to(((v * 120) % 30) < 10, (H, W))
rgb[line(17.8, 18.2) & dash] = (236, 190, 40)
save('road-highway.png', rgb, edge_alpha(0.03))

save('road-paved.png', asphalt(104), edge_alpha(0.06))

# Gravel: tan, two wheel tracks a bit darker and smoother, a loose ridge between and at the verges.
tracks = np.exp(-((u - 0.3) / 0.08) ** 2) + np.exp(-((u - 0.7) / 0.08) ** 2)
g = 172 * (1 + 0.06 * noise(6, 2) + 0.09 * rng.standard_normal((H, W)).clip(-2, 2) * 0.5) * (1 - 0.10 * tracks)
rgb = np.dstack([g, g * 0.93, g * 0.80])
save('road-gravel.png', rgb, edge_alpha(0.12))

# Dirt track: two ruts, the photo's grass showing in the middle and at the sides.
ruts = np.exp(-((u - 0.28) / 0.09) ** 2) + np.exp(-((u - 0.72) / 0.09) ** 2)
g = 140 * (1 + 0.08 * noise(6, 3) + 0.08 * rng.standard_normal((H, W)).clip(-2, 2) * 0.5)
rgb = np.dstack([g, g * 0.86, g * 0.68])
save('road-dirt.png', rgb, np.repeat(np.clip(ruts * 1.1, 0, 0.9), H, 0) * (0.8 + 0.2 * noise(10, 4)))
