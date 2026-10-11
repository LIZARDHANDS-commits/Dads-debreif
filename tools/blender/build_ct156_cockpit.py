# Builds the CT-156 cockpit's parts that are drawn better as a model than in code (ALL-32) and exports them as
# public/models/ct156-cockpit.glb. Runs headless, with no Blender window:
#
#   node tools/blender/ct156-cockpit-shape.mjs > ct156-cockpit-shape.json
#   blender -b --factory-startup -P tools/blender/build_ct156_cockpit.py -- ct156-cockpit-shape.json public/models/ct156-cockpit.glb
#
# Every place and size comes from the code cockpit (ct156-cockpit-shape.mjs runs its own helpers), so the eye, bow, canopy
# and sill keep one source; what Blender adds is solid parts with rounded edges where the code draws flat strips.
#
# Each top-level object is one part the code cockpit also draws; ct156-cockpit-model.js hides the code part of the same
# name once the file is in, and the code part stays if the file fails to load. Parts so far (step 1, Patrick 11 Oct 2026
# 08:09Z, the bow's foot "looks bad"):
#   forward-bow    the windscreen's bow: a solid light band with its ring of 22 dark holes on the aft face and the dark
#                  tube along its inner edge, its feet standing on the canopy rails.
#   canopy-rails   along each side of the glass from the bow to the rear frame: a round light rail at the glass's foot
#                  (the T-6A-1's canopy frame, Fig 1-1-39 detail C: a round rail with a riveted strip above it) and
#                  the sill ledge under it, out over the fuselage's cut edge.
# Sizes are estimates judged off Patrick's cockpit photos and the commercial sim frame (11 Oct 2026) unless the code's.
#
# Axes as the code cockpit: feet, nose +X, left +Y, up +Z, origin on the spinner's axis at the model's origin. Exported
# Z-up (export_yup off). Materials are named by the code cockpit's colour slots (band, black, frame, dark).
import json
import math
import sys

import bpy
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:]
shape_path, out_path = argv
with open(shape_path) as f:
    S = json.load(f)

BOW = S['forwardBow']
SIDE = S['sideFrame']
RAIL_R = 0.06          # the canopy rail's radius (1.4 in across; estimate)
STRIP_TALL = 0.16      # the riveted strip above it, up the glass (estimate)
STRIP_THICK = 0.015
LEDGE_THICK = 0.04
BAND_THICK = 0.05      # the bow band, fore and aft (the code's aft face to its crest station)
BEVEL = 0.008

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m


def new_object(name, bm, mats, bevel=0.0, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for m in mats:
        mesh.materials.append(material(m))
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(40)
        mod.harden_normals = True
    return obj


def bridge(bm, rings, closed, mat=0, cap=True):
    """Quads between consecutive rings of verts (each ring the same count, closed loops when `closed`)."""
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for k in range(n if closed else n - 1):
            k2 = (k + 1) % n
            f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
            f.material_index = mat
    if cap and closed:
        for ring in (vs[0], vs[-1]):
            f = bm.faces.new(ring)
            f.material_index = mat
    bm.normal_update()
    return vs


def tube_rings(path, r, sides=10):
    """Rings of a round tube along `path` (points), each ring square to the path (parallel transport)."""
    def sub(a, b): return [a[i] - b[i] for i in range(3)]
    def norm(a):
        l = math.sqrt(sum(v * v for v in a)) or 1.0
        return [v / l for v in a]
    def cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    def dot(a, b): return sum(a[i] * b[i] for i in range(3))
    tans = []
    for i in range(len(path)):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, len(path) - 1)]
        tans.append(norm(sub(b, a)))
    up = [0, 0, 1] if abs(tans[0][2]) < 0.9 else [1, 0, 0]
    u = norm(cross(tans[0], up))
    rings = []
    for i, p in enumerate(path):
        t = tans[i]
        u = norm([u[k] - dot(u, t) * t[k] for k in range(3)])
        v = cross(t, u)
        rings.append([[p[k] + r * (math.cos(2 * math.pi * j / sides) * u[k] + math.sin(2 * math.pi * j / sides) * v[k])
                       for k in range(3)] for j in range(sides)])
    return rings


# ---------- the forward bow ----------
hoop = BOW['hoop']
base = BOW['base']


def inward(p, d, dx=0.0):
    """A hoop point moved `d` feet in toward the canopy's middle at the sill (the code's bandGeometries) and dx forward."""
    x, y, z = p
    dy, dz = -y, base - z
    l = math.hypot(dy, dz) or 1.0
    return [x + dx, y + dy / l * d, z + dz / l * d]


g, depth = BOW['glassInset'], BOW['bandDepth']
bm = bmesh.new()
# The band as a solid: four corners per hoop point (glass side and inner side, aft face and front face).
rings = [[inward(p, g), inward(p, g + depth), inward(p, g + depth, BAND_THICK), inward(p, g, BAND_THICK)] for p in hoop]
# Its feet: carry each end straight down onto the rail's top so the band stands on it.
for end in (0, -1):
    ring = rings[end]
    foot = [[q[0], q[1], base + RAIL_R] for q in ring]
    if end == 0:
        rings.insert(0, foot)
    else:
        rings.append(foot)
bridge(bm, rings, closed=True)
bow = new_object('forward-bow', bm, ['band'], bevel=BEVEL)

# The ring of holes: shallow dark discs on the aft face, evenly spaced along the band's middle line, half a spacing in
# from each sill (the code's 22, 0.07 ft across).
row = BOW['dots'][0]
mid = [inward(p, g + depth * row['at'], -0.004) for p in hoop]
along = [0.0]
for a, b in zip(mid, mid[1:]):
    along.append(along[-1] + math.dist(a[1:], b[1:]))
bm = bmesh.new()
for k in range(row['n']):
    want = (k + 0.5) / row['n'] * along[-1]
    j = next(i for i in range(1, len(along)) if along[i] >= want)
    t = (want - along[j - 1]) / ((along[j] - along[j - 1]) or 1)
    c = [mid[j - 1][i] + (mid[j][i] - mid[j - 1][i]) * t for i in range(3)]
    ring = [[c[0], c[1] + row['dia'] / 2 * math.cos(a), c[2] + row['dia'] / 2 * math.sin(a)]
            for a in (2 * math.pi * s / 12 for s in range(12))]
    back = [[q[0] + 0.006] + q[1:] for q in ring]
    bridge(bm, [back, ring], closed=True)
holes = new_object('forward-bow-holes', bm, ['black'])
holes.parent = bow

# The dark tube along the band's inner edge, its ends turned down into the rail.
inner = [inward(p, g + depth, BAND_THICK / 2) for p in hoop]
path = [[inner[0][0], inner[0][1], base + RAIL_R]] + inner + [[inner[-1][0], inner[-1][1], base + RAIL_R]]
bm = bmesh.new()
bridge(bm, tube_rings(path, BOW['tubeR'], 8), closed=True)
tube = new_object('forward-bow-tube', bm, ['black'])
tube.parent = bow

# ---------- the canopy rails ----------
rail = SIDE['rail']
for side, label in ((1, 'left'), (-1, 'right')):
    # The round rail at the glass's foot, just inside the glass.
    path = [[r['x'], side * (r['yBase'] - RAIL_R - 0.004), r['base'] + RAIL_R] for r in rail]
    bm = bmesh.new()
    bridge(bm, tube_rings(path, RAIL_R, 12), closed=True)
    obj = new_object(f'canopy-rail-{label}', bm, ['frame'])
    # The riveted strip above it, flat on the glass.
    rings = []
    for r in rail:
        y = side * (r['yTop'] - 0.004)
        z0, z1 = r['base'] + RAIL_R, r['base'] + RAIL_R + STRIP_TALL
        yi = side * (r['yTop'] - 0.004 - STRIP_THICK)
        rings.append([[r['x'], y, z0], [r['x'], y, z1], [r['x'], yi, z1], [r['x'], yi, z0]])
    bm = bmesh.new()
    bridge(bm, rings, closed=True)
    strip = new_object(f'canopy-strip-{label}', bm, ['frame'], bevel=0.004)
    strip.parent = obj
    # Rivets along the strip.
    bm = bmesh.new()
    x = SIDE['x0'] - SIDE['pitch'] / 2
    while x > SIDE['x1']:
        r = min(rail, key=lambda q: abs(q['x'] - x))
        z = r['base'] + RAIL_R + STRIP_TALL * 0.6
        y = side * (r['yTop'] - 0.004 - STRIP_THICK - 0.003)
        ring = [[x + 0.012 * math.cos(a), y, z + 0.012 * math.sin(a)] for a in (2 * math.pi * s / 8 for s in range(8))]
        back = [[q[0], q[1] + side * 0.004, q[2]] for q in ring]
        bridge(bm, [back, ring], closed=True)
        x -= SIDE['pitch']
    rivets = new_object(f'canopy-rivets-{label}', bm, ['dark'])
    rivets.parent = obj
    # The sill ledge under the rail: from 0.35 ft outside the glass (over the fuselage's cut edge) to 0.2 ft inside it.
    rings = []
    for r in rail:
        z = r['base'] + 0.006
        rings.append([[r['x'], side * (r['w'] + 0.35), z], [r['x'], side * (r['w'] - 0.2), z],
                      [r['x'], side * (r['w'] - 0.2), z - LEDGE_THICK], [r['x'], side * (r['w'] + 0.35), z - LEDGE_THICK]])
    bm = bmesh.new()
    bridge(bm, rings, closed=True)
    ledge = new_object(f'canopy-ledge-{label}', bm, ['frame'], bevel=0.01)
    ledge.parent = obj

# The two sides under one parent, so the loader hides the code's rails, strips and sills in one go.
rails = bpy.data.objects.new('canopy-rails', None)
bpy.context.collection.objects.link(rails)
for o in list(bpy.data.objects):
    if o.name.startswith('canopy-rail-'):
        o.parent = rails

bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_yup=False, export_apply=True,
                          export_cameras=False, export_lights=False)
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
print(f'ct156-cockpit.glb written: {len(bpy.data.objects)} objects, about {tris} triangles before bevels')
