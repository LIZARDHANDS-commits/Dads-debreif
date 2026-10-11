# The airfield's paved surface, built (TR-128, TR-136): runways (with their threshold pads), 03/21 and taxiways as straight strips at their
# measured widths; the ramp and the Snowbirds apron from the photo trace (mask.npy, from mask.py over mosaic.py's picture), straightened,
# with Patrick's edits (10 Oct, red: edges; blue: remove); fillets at every junction by closing the union (grow then shrink by FILLET).
# Then the surface is cut into areas, each with its material (concrete or asphalt) and the direction its slab joints run (along each
# runway and taxiway, square to the ramp), and written as src/modules/traffic/airfield-surface.js.
# Usage: python tools/airfield/build-surface.py <work dir with mask.npy and mos.png> <out .js> [taxi-fit.json]
import sys, json, math
import numpy as np, cv2
from shapely.geometry import Polygon, LineString, MultiPolygon, box, Point
from shapely.ops import unary_union

d, out = sys.argv[1], sys.argv[2]
fit_path = sys.argv[3] if len(sys.argv) > 3 else __file__.rsplit('/', 1)[0].rsplit(chr(92), 1)[0] + '/taxi-fit.json'
X0, Y1, RES = -4400, 3600, 2

def line_x(a, b, p, q):
    """Intersection of line a-b with line p-q."""
    a, b, p, q = map(np.array, (a, b, p, q))
    d1, d2 = b - a, q - p
    den = d1[0] * d2[1] - d1[1] * d2[0]
    t = ((p - a)[0] * d2[1] - (p - a)[1] * d2[0]) / den
    return a + d1 * t

R29L = ((2796, -2776), (-3572, 690))
R29R = ((3622, -1189), (-3628, 2769))
R03 = ((55, -1284), (2175, 929))

def strip(pts, width, ends=('flat', 'flat')):
    return LineString(pts).buffer(width / 2, cap_style='flat', join_style='round', quad_segs=8)

parts = []
# Runways: 160 ft, carried 240 ft past each runway point so the threshold pads (206 ft before each bar) are paved too.
def extended(a, b, by):
    a, b = np.array(a, float), np.array(b, float); u = (b - a) / np.linalg.norm(b - a)
    return [a - u * by, b + u * by]
for (a, b) in (R29L, R29R):
    parts.append(strip(extended(a, b, 240), 160))
# 03/21: 100 ft, from 29L's centreline to its north end.
parts.append(strip(list(R03), 100))
# Taxiways: re-centred lines (TR-127), carried to the centreline of the runway they meet.
_fit = json.load(open(fit_path))  # each taxiway's centreline fitted to its concrete every 25 ft (TR-129)
TW = {k: (v['pts'], v['width']) for k, v in _fit.items() if k != 'Echo'}
def to_runway(pts, which):
    """Moves the first and last points onto a runway centreline along their own segment, where they end near one."""
    pts = [list(p) for p in pts]
    for end, nxt in ((0, 1), (-1, -2)):
        best = None
        for rw in (R29L, R29R):
            q = line_x(pts[end], pts[nxt], *rw)
            dist = np.hypot(q[0] - pts[end][0], q[1] - pts[end][1])
            if dist < 260 and (best is None or dist < best[0]): best = (dist, q)
        if best: pts[end] = [float(best[1][0]), float(best[1][1])]
    return pts
for k, (pts, w) in TW.items():
    parts.append(strip(to_runway(pts, k), w + 4))
# Echo: repaved 50 ft, centred on its old concrete (30 ft east of the old line), from 29R's centreline to 29L's.
e0, e1 = np.array(_fit['Echo']['pts'][0], float), np.array(_fit['Echo']['pts'][1], float)
parts.append(strip([line_x(e0, e1, *R29R), line_x(e0, e1, *R29L)], 50))

# Ramp and Snowbirds apron from the trace, inside their zones, straightened, with Patrick's edits.
mask = np.load(d + '/mask.npy').astype(np.uint8)
cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
hier = hier[0]
ft = lambda c: [((p[0][0] + 0.5) * RES + X0, Y1 - (p[0][1] + 0.5) * RES) for p in c]
traced = []
for i, c in enumerate(cs):
    if hier[i][3] != -1 or len(c) < 4: continue
    holes, j = [], hier[i][2]
    while j != -1:
        if len(cs[j]) >= 4: holes.append(ft(cs[j]))
        j = hier[j][0]
    traced.append(Polygon(ft(c), holes).buffer(0))
traced = unary_union(traced)
# The ramp: south edge straight, north edge where Patrick drew it (along the hangar fronts and between them).
ramp_zone = Polygon([
    (-800, 1550), (1560, 1500), (1700, 1560),   # south
    (1700, 2045), (1410, 2045), (1410, 2135), (1110, 2135), (1110, 2240), (800, 2240), (800, 2265),
    (430, 2265), (430, 2325), (355, 2325), (355, 2075), (-800, 2075),
])
snow_zone = Polygon([(1550, 1700), (2700, 1700), (2700, 3020), (1550, 3020)])
# The two holding pads beside F, north of the 03/21 end (photo).
pad_zones = [box(1850, 960, 2210, 1220), box(2250, 860, 2620, 1250), box(-3480, 2960, -3000, 3160)]  # + the wide corner by the 11L end
remove = [
    Polygon([(1299, 2187), (1720, 2187), (1720, 2430), (1299, 2430)]),  # blue: behind Hangar 4 / the flight-line building
    Polygon([(2284, 2662), (2700, 2662), (2700, 3020), (2284, 3020)]),  # blue: behind the Snowbirds hangar
    Polygon([(2365, 2651), (2700, 2651), (2700, 2400), (2423, 2607)]),  # red: the Snowbirds apron's south-east edge
    Polygon([(1550, 2045), (1700, 2045), (1700, 2190), (1550, 2190)]),  # red: beside Hangar 4
]
apron = unary_union([traced.intersection(ramp_zone), traced.intersection(snow_zone)] + [traced.intersection(z) for z in pad_zones])
apron = apron.difference(unary_union(remove))
apron = apron.buffer(-6).buffer(6)                      # drop slivers
apron = apron.simplify(10, preserve_topology=True)     # straight edges
# The ramp's south edge as one straight line (it had a bump where a plane's shadow sat).
ramp_south = Polygon([(-760, 1760), (0, 1700), (1560, 1500), (1560, 1980), (-760, 2075)])
# The bays between and beside the hangars, paved up to Patrick's red lines.
bays = [box(170, 1990, 355, 2110), box(355, 1990, 430, 2325), box(667, 1990, 800, 2265), box(976, 1990, 1110, 2240), box(1110, 1990, 1410, 2135)]
apron = unary_union([apron, ramp_south.intersection(ramp_zone)] + bays)

# Patrick, 10 Oct (marked screenshot): nothing behind the Snowbirds and Hangar 5 hangars, i.e. north-west of the line along their
# back walls; and no narrow juts there (anything under about 50 ft wide in this area goes).
back = np.array([1745, 2555.]), np.array([2085, 2925.])
u = (back[1] - back[0]) / np.linalg.norm(back[1] - back[0]); nrm = np.array([-u[1], u[0]])  # nrm points north-west
behind = Polygon([back[0] - u * 300, back[1] + u * 400, back[1] + u * 400 + nrm * 600, back[0] - u * 300 + nrm * 600])
apron = apron.difference(behind)
snow_area = box(1550, 2150, 2450, 3050)
local = apron.intersection(snow_area).buffer(-25).buffer(25)
apron = unary_union([apron.difference(snow_area), local])
FILLET = 60
geo = unary_union(parts + [apron])
geo = geo.buffer(FILLET, join_style='round', quad_segs=8).buffer(-FILLET, join_style='round', quad_segs=8)
geo = geo.simplify(1.0, preserve_topology=True)
polys = [p for p in (list(geo.geoms) if isinstance(geo, MultiPolygon) else [geo]) if p.area > 100000]  # islands go
geo = unary_union(polys)

# ---- Areas: material and joint direction (TR-136) ----
def frame_of(a, b, mat='cracked', tint=1.0, tile=None):
    tile = tile or {'cracked': 400, 'blocks': 200, 'asphalt': 100}[mat]
    a, b = np.array(a, float), np.array(b, float)
    return {'mat': mat, 'ox': round(float(a[0]), 1), 'oy': round(float(a[1]), 1), 'ang': round(math.atan2(b[1] - a[1], b[0] - a[0]), 5), 'tile': tile, 'tint': tint}
RAMP_EDGE = ((0, 1700), (1560, 1500))
LANE_NORTH = lambda x: 1772 - 0.118 * x  # the asphalt lane's north edge (photo, 10 Oct)
frames, claims = [], []
def claim(poly, fr):
    frames.append(fr); claims.append(poly)
# Runways: square slabs only in the threshold zones, bar to BLOCKS_FT past it at each end (Patrick, 10 Oct: "the blocks are only at the
# thresholds of the runway (both sides both runways). the rest is just cracked"; 500 ft is an estimate off his photo of 29L).
BLOCKS_FT = 500
BARS = {R29L: (-1, 4), R29R: (-33, 5)}  # each end's threshold bar, ft before the first runway point and past the second (runway-markings.js)
def along_box(a, b, s0, s1, half):
    a, b = np.array(a, float), np.array(b, float); u = (b - a) / np.linalg.norm(b - a); n = np.array([-u[1], u[0]])
    return Polygon([a + u * s0 - n * half, a + u * s1 - n * half, a + u * s1 + n * half, a + u * s0 + n * half])
for rw in (R29L, R29R):
    a, b = rw; L = float(np.hypot(b[0] - a[0], b[1] - a[1])); barA, pastB = BARS[rw]
    claim(along_box(a, b, barA, barA + BLOCKS_FT, 85), frame_of(a, b, mat='blocks'))
    claim(along_box(a, b, L + pastB - BLOCKS_FT, L + pastB, 85), frame_of(a, b, mat='blocks'))
    claim(LineString(extended(*rw, 260)).buffer(85, cap_style='flat'), frame_of(*rw, tint=0.98))
claim(LineString(R03).buffer(56, cap_style='flat'), frame_of(*R03))
# Echo: fresh asphalt, ending square 30 ft short of the runways' and 03/21's pavement so it meets them cleanly (Patrick: "echo is freshly
# paved so it does look black, but make it look merged in nicely").
eA, eB = line_x(e0, e1, *R29R), line_x(e0, e1, *R29L)
# Its fresh asphalt runs right to the runways' and 03/21's pavement edges, the flares where it widens into them included, so it meets the
# concrete along a straight construction joint at the runway edge (Patrick: "make these look more natural like they were constructed by
# humans recently not drawn on like that"; TR-138).
echo_claim = geo.intersection(LineString([eA, eB]).buffer(260, cap_style='flat'))
echo_claim = echo_claim.difference(unary_union(claims))  # the runways and 03/21 keep their concrete
other_taxis = unary_union([LineString(to_runway(pts, k)).buffer(w / 2 + 12) for k, (pts, w) in TW.items()])
echo_claim = echo_claim.difference(other_taxis)  # and the other taxiways theirs (C runs close by Echo's north end)
_core = LineString([eA, eB]).difference(unary_union(claims)).buffer(30)  # Echo up to the runways' and 03/21's pavement
_pieces = list(echo_claim.geoms) if hasattr(echo_claim, 'geoms') else [echo_claim]
echo_claim = unary_union([pc for pc in _pieces if pc.intersects(_core) and pc.area > 6000])  # only Echo itself: no stray fillet slivers
claim(echo_claim, frame_of(eA, eB, mat='asphalt', tint=0.82))
lane = Polygon([(-20, LANE_NORTH(-20)), (1700, LANE_NORTH(1700)), (1700, 1400), (-20, 1400)]).intersection(ramp_zone)
# The ramp's south lane is concrete like the rest (Patrick, 10 Oct: "get rid of this dark patch"; TR-139); `lane` still keeps the newer
# slabs' area off it.
claim(box(390, 1500, 980, 2030).difference(lane), frame_of(*RAMP_EDGE, tint=1.07))  # the newer, lighter slabs
claim(ramp_zone.union(unary_union(bays)), frame_of(*RAMP_EDGE))
gpts = _fit.get('G', {'pts': [[1650, 1908], [2250, 2558]]})['pts'] if 'G' in _fit else [[1650, 1908], [2250, 2558]]
claim(snow_zone, frame_of(gpts[0], gpts[-1]))
segs = []
for k, (pts, w) in TW.items():
    pts = to_runway(pts, k)
    for i in range(len(pts) - 1):
        segs.append((LineString([pts[i], pts[i + 1]]), frame_of(pts[i], pts[i + 1])))
for z in pad_zones:
    near = min(segs, key=lambda sg: sg[0].distance(z.centroid))
    claim(z, near[1])
for line, fr in segs:
    claim(line.buffer(80, cap_style='flat'), fr)
areas, taken = [], Polygon()
for poly, fr in zip(claims, frames):
    part = geo.intersection(poly).difference(taken)
    taken = taken.union(poly)
    if not part.is_empty: areas.append((part, fr))
rest = geo.difference(taken)
for piece in (list(rest.geoms) if hasattr(rest, 'geoms') else [rest]):
    if piece.is_empty or piece.area < 1: continue
    near = min(segs + [(LineString(R29L), frames[0]), (LineString(R29R), frames[1])], key=lambda sg: sg[0].distance(piece.centroid))
    areas.append((piece, near[1]))
# Same frame, one entry: merge pieces that share a frame.
by_frame = {}
for part, fr in areas:
    key = json.dumps(fr, sort_keys=True)
    by_frame.setdefault(key, (fr, []))[1].append(part)
r = lambda ring: [[round(x, 1), round(y, 1)] for x, y in list(ring.coords)[:-1]]
frame_list, area_list = [], []
for key, (fr, parts_) in by_frame.items():
    u = unary_union(parts_).buffer(0)
    pieces = list(u.geoms) if hasattr(u, 'geoms') else [u]
    idx = len(frame_list); frame_list.append(fr)
    for pc in pieces:
        if pc.geom_type != 'Polygon' or pc.area < 4: continue
        pc = pc.simplify(0.5, preserve_topology=True)
        area_list.append({'f': idx, 'outer': r(pc.exterior), 'holes': [r(h) for h in pc.interiors if Polygon(h).area > 4]})
open(out, 'w', encoding='utf-8', newline='\n').write(
    "// The airfield's paved surface (TR-128, TR-136). Built by tools/airfield/build-surface.py, not by hand: 29L and 29R (160 ft, with their\n"
    "// threshold pads), 03/21 (100 ft) and the taxiways (their measured widths, on centrelines fitted to the photo's concrete, TR-131) as\n"
    "// straight strips; Echo 50 ft of asphalt on its old concrete; the ramp and the Snowbirds apron from the photo trace (Esri zoom 18,\n"
    "// 10 Oct), straightened, with Patrick's marked edges; every junction filleted with a 60 ft radius. Cut into areas, each with a frame:\n"
    "// its material and the line its slab joints run along (origin ox, oy and angle ang, radians from east), the texture's tile in ft\n"
    "// and a tint. Feet from the ARP (x east, y north).\n"
    "export const SURFACE_FRAMES = Object.freeze(" + json.dumps(frame_list, separators=(',', ':')) + ");\n"
    "export const AIRFIELD_SURFACE = Object.freeze(" + json.dumps(area_list, separators=(',', ':')) + ");\n")
print('frames', len(frame_list), 'areas', len(area_list), 'points', sum(len(a['outer']) + sum(len(h) for h in a['holes']) for a in area_list), 'sq ft', int(geo.area))
