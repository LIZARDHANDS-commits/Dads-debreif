# Builds the CT-156 Harvard II as a Blender model and exports it as public/models/ct156.glb (trial, not used by
# the modules yet). Runs headless, with no Blender window:
#
#   node tools/blender/ct156-shape.mjs > ct156-shape.json
#   blender -b --factory-startup -P tools/blender/build_ct156.py -- ct156-shape.json tools/blender/ct156-params.json public/models/ct156.glb
#
# Every shape number comes from the code model's own tables (src/ui-kit/ct156-model.js, dumped by ct156-shape.mjs), so
# both models have one source: Patrick's side-on photo of 156101 scaled to the T-6A's 33 ft 4 in, the 97 in prop, and the
# estimates marked there. The extra Blender gets us is smooth curves (a subdivided fuselage, smooth-shaded aerofoils with
# sharp trailing edges) and a model file a person can open and polish by hand.
#
# ct156-params.json can move the canopy peak, the forward canopy bow and the nose top line (feet); null keeps the code
# tables. Those are where the cockpit-view numbers under review drop in once Patrick approves them.
#
# Axes as the code model: nose +X, left +Y, up +Z, origin on the spinner's axis, model units (1.44 = nose to tail). It
# is exported Z-up (export_yup off), so the file drops straight into the code model's group with no turn.
import json
import math
import sys

import bpy
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:]
shape_path, params_path, out_path = argv
with open(shape_path) as f:
    S = json.load(f)
with open(params_path) as f:
    P = json.load(f)

FT = S['CT156_UNIT_LENGTH'] / S['CT156_LENGTH_FT']  # model units per foot
SPINNER_TIP_X = 0.66
STATIONS = [list(r) for r in S['STATIONS']]
CANOPY = [list(r) for r in S['CANOPY']]
FRAME_X = list(S['CT156_FRAME_X'])
WING, STAB, FIN = S['WING'], S['STAB'], S['FIN']
DIHEDRAL, TIP, WING_Z = S['DIHEDRAL'], S['TIP'], S['WING_Z']


# ---------- the code model's helpers, in Python (same maths as ct156-model.js) ----------

def row_at(rows, x):
    if x >= rows[0][0]:
        return rows[0]
    for i in range(1, len(rows)):
        if x >= rows[i][0]:
            a, b = rows[i - 1], rows[i]
            t = (a[0] - x) / (a[0] - b[0])
            return [va + (vb - va) * t for va, vb in zip(a, b)]
    return rows[-1]


def sgn(v):
    return (v > 0) - (v < 0)


def section_point(sec, theta):
    _, w, top, bottom, n = sec
    zc, h = (top + bottom) / 2, (top - bottom) / 2
    c, s = math.cos(theta), math.sin(theta)
    return w * sgn(c) * abs(c) ** (2 / n), zc + h * sgn(s) * abs(s) ** (2 / n)


def fuse_surf(x, z):
    _, w, top, bottom, n = row_at(STATIONS, x)
    zc, h = (top + bottom) / 2, (top - bottom) / 2
    s = min(0.999, abs(z - zc) / h) ** (n / 2)
    return w * math.sqrt(max(1 - s * s, 1e-6)) ** (2 / n) + 0.0025


def sill_z(x, half_width):
    _, w, top, bottom, n = row_at(STATIONS, x)
    zc, h = (top + bottom) / 2, (top - bottom) / 2
    c = min(1, half_width / w) ** (n / 2)
    return zc + h * math.sqrt(max(1 - c * c, 0)) ** (2 / n)


def canopy_at(x, grow=0.0):
    _, w, top = row_at(CANOPY, x)
    return w + grow, top + grow, sill_z(x, w)


def canopy_point(c, phi):
    w, top, base = c
    cp, sp = math.cos(phi), math.sin(phi)
    return w * sgn(cp) * abs(cp) ** 0.85, base + (top - base) * max(sp, 0) ** 0.75


def thick(xc, t):
    return 5 * t * (0.2969 * math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)


def cheat_z(x):
    return -0.045 + (x - 0.48) * 0.0202


# ---------- the parameters (feet; null keeps the code tables) ----------

def apply_params():
    nose = P.get('noseTopFt')
    if nose:  # [at the spinner, at the windscreen's foot]: the cowling's top line, straight between them
        x0, x1 = STATIONS[0][0], CANOPY[0][0]
        for r in STATIONS:
            if r[0] >= x1:
                f = (x0 - r[0]) / (x0 - x1)
                r[2] = (nose[0] + (nose[1] - nose[0]) * f) * FT
    peak = P.get('canopyPeakFt')
    if peak:  # the canopy's tops scaled so its highest point is this high above the spinner's axis
        k = peak * FT / max(r[2] for r in CANOPY)
        for r in CANOPY:
            r[2] *= k
    bow = P.get('forwardBowCrestFt')
    if bow:  # [aft of the spinner tip, above the axis]: the forward bow moves there, the canopy ahead of the peak bends to meet it
        FRAME_X[0] = SPINNER_TIP_X - bow[0] * FT
        want, have = bow[1] * FT, canopy_at(FRAME_X[0])[1]
        peak_x = max(CANOPY, key=lambda r: r[2])[0]
        foot_x = CANOPY[0][0]
        for r in CANOPY:
            if r[0] > peak_x:
                f = min(1, (r[0] - peak_x) / max(FRAME_X[0] - peak_x, 1e-6)) if r[0] <= FRAME_X[0] else (foot_x - r[0]) / (foot_x - FRAME_X[0])
                r[2] += (want - have) * max(0, f)


apply_params()


# ---------- Blender helpers ----------

def material(name, color, rough=0.5, metal=0.0, clearcoat=0.0, alpha=1.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    r, g, bl = (int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    srgb = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, bl)]
    b.inputs['Base Color'].default_value = (*srgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = clearcoat
    b.inputs['Coat Roughness'].default_value = 0.12
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    if emit:
        b.inputs['Emission Color'].default_value = (*srgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


def mesh_object(name, verts, faces, mat, smooth=True, sharp_deg=None, subdiv=0):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if subdiv:
        mod = ob.modifiers.new('smooth', 'SUBSURF')
        mod.levels = mod.render_levels = subdiv
    if smooth:
        me.shade_smooth()
        if sharp_deg is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    return ob


def loft(rings, closed=True, caps=True):
    """Rings of equal length, in order; quads between them, a fan at each end."""
    n = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = []
    for i in range(len(rings) - 1):
        for k in range(n if closed else n - 1):
            a, b = i * n + k, i * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    if caps:
        for i in (0, len(rings) - 1):
            ring = rings[i]
            verts.append(tuple(sum(p[j] for p in ring) / n for j in range(3)))
            c = len(verts) - 1
            for k in range(n):
                faces.append((c, i * n + k, i * n + (k + 1) % n))
    return verts, faces


def airfoil(sections, span='y', mirror=False, K=24):
    xs = [(1 - math.cos(math.pi * k / K)) / 2 for k in range(K + 1)]
    ring = [(xs[k], 1) for k in range(K, -1, -1)] + [(xs[k], -1) for k in range(1, K)]
    rings = []
    for sec in sections:
        pts = []
        for xc, side in ring:
            x = sec['le'] - xc * sec['chord']
            off = sec['z'] + side * thick(xc, sec['t']) * sec['chord']
            s = -sec['s'] if mirror else sec['s']
            pts.append((x, s, off) if span == 'y' else (x, off, s))
        rings.append(pts)
    return loft(rings)


def rotate_x(verts, a):
    c, s = math.cos(a), math.sin(a)
    return [(x, y * c - z * s, y * s + z * c) for x, y, z in verts]


def tube(points, r, sides=8):
    rings = []
    for i, p in enumerate(points):
        q = points[min(i + 1, len(points) - 1)]
        o = points[max(i - 1, 0)]
        tx, ty, tz = q[0] - o[0], q[1] - o[1], q[2] - o[2]
        L = math.sqrt(tx * tx + ty * ty + tz * tz) or 1
        tx, ty, tz = tx / L, ty / L, tz / L
        ux, uy, uz = 1.0, 0.0, 0.0  # the hoops lie across the fuselage, so x is never along them
        nx, ny, nz = uy * tz - uz * ty, uz * tx - ux * tz, ux * ty - uy * tx
        bx, by, bz = ty * nz - tz * ny, tz * nx - tx * nz, tx * ny - ty * nx
        rings.append([(p[0] + r * (math.cos(a) * nx + math.sin(a) * bx), p[1] + r * (math.cos(a) * ny + math.sin(a) * by),
                       p[2] + r * (math.cos(a) * nz + math.sin(a) * bz)) for a in (2 * math.pi * k / sides for k in range(sides))])
    return loft(rings)


def ellipsoid(name, c, r, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=c)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = r
    ob.data.materials.append(mat)
    ob.data.shade_smooth()
    return ob


# ---------- the build ----------

bpy.ops.wm.read_factory_settings(use_empty=True)

M = {
    'navy': material('navy', '#151d31', 0.42, 0.15, 1.0),
    # The tail: each ship's own colour in the app (the loader repaints this material), Lead's blue here.
    'ship': material('ship_color', '#0066ff', 0.4, 0.1, 1.0),
    'white': material('white', '#f1f4f8', 0.45, 0.0, 0.5),
    'chrome': material('chrome', '#f2f5f8', 0.1, 1.0),
    'glass': material('glass', '#1d2a36', 0.04, 0.6, 0.0, alpha=0.4),
    'frame': material('frame', '#0c1017', 0.5),
    'blade': material('blade', '#0a0c10', 0.6),
    'tip': material('prop_tip', '#d2202c', 0.5),
    'exhaust': material('exhaust', '#4a4d54', 0.45, 0.8),
    'red': material('light_red', '#ff2b2b', emit=3),
    'green': material('light_green', '#2bff6a', emit=3),
    'strobe': material('light_white', '#ffffff', emit=3),
}

# Fuselage: the code model's stations, resampled finely, then one level of subdivision for the curves.
RING, N = 40, 64
x0, x1 = STATIONS[0][0], STATIONS[-1][0]
rings = []
for i in range(N + 1):
    x = x0 + (x1 - x0) * i / N
    sec = row_at(STATIONS, x)
    rings.append([(x, *section_point(sec, 2 * math.pi * k / RING)) for k in range(RING)])
mesh_object('fuselage', *loft(rings), M['navy'], subdiv=1)

# The canopy: a rounded hood from sill to sill, as the code model.
NC, MC = 40, 20
cx0, cx1 = CANOPY[0][0], CANOPY[-1][0]
rings = []
for i in range(NC + 1):
    x = cx0 + (cx1 - cx0) * i / NC
    c = canopy_at(x)
    rings.append([(x, *canopy_point(c, math.pi * j / MC)) for j in range(MC + 1)])
mesh_object('canopy', *loft(rings, closed=False, caps=False), M['glass'])

# The canopy bows (forward, centre, rear) and sill rails.
for k, fx in enumerate(FRAME_X):
    c = canopy_at(fx, 0.0015)
    pts = [(fx, *canopy_point(c, math.pi * j / 24)) for j in range(25)]
    mesh_object(f'bow_{k}', *tube(pts, 0.0045), M['frame'])

# The cheat line: a thin white strip just off each side, nose number to tail.
for side in (1, -1):
    pts, faces = [], []
    n = 64
    for k in range(n + 1):
        x = 0.395 + (-0.75 - 0.395) * k / n
        zc = cheat_z(x)
        for z in (zc + 0.0032, zc - 0.0032):
            pts.append((x, side * fuse_surf(x, z), z))
    for k in range(n):
        p = 2 * k
        faces.append((p, p + 1, p + 3, p + 2))
    mesh_object(f'cheat_{side}', pts, faces, M['white'])

# Wings (3° dihedral), tailplane, fin: smooth aerofoils with sharp trailing edges.
for side, name in ((1, 'wing_left'), (-1, 'wing_right')):
    v, f = airfoil(WING, mirror=side < 0)
    mesh_object(name, rotate_x(v, side * DIHEDRAL), f, M['navy'], sharp_deg=35)
mesh_object('tailplane', *airfoil(STAB), M['navy'], sharp_deg=35)
mesh_object('fin', *airfoil(FIN, span='z'), M['ship'], sharp_deg=35)
vf = [(-0.51, -0.13), (-0.54, -0.19), (-0.67, -0.19), (-0.69, -0.11)]
mesh_object('ventral_fin', [(x, s * 0.005, z) for s in (1, -1) for x, z in vf], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['navy'], smooth=False)

# The spinner: an ogive lathe, chrome, on a dark ring.
og = [(0.66 - 0.085 * t, 0.001 + 0.033 * math.sin(t * math.pi / 2) ** 0.8) for t in (k / 16 for k in range(17))]
rings = [[(x, r * math.cos(2 * math.pi * k / 40), r * math.sin(2 * math.pi * k / 40)) for k in range(40)] for x, r in og]
mesh_object('spinner', *loft(rings), M['chrome'])
ring_pts = [(0.573 + d, 0.0355 * math.cos(2 * math.pi * k / 40), 0.0355 * math.sin(2 * math.pi * k / 40)) for d in (0.003, -0.003) for k in range(40)]
mesh_object('spinner_ring', ring_pts, [(k, (k + 1) % 40, 40 + (k + 1) % 40, 40 + k) for k in range(40)], M['blade'])

# The prop: four blades, 97 in across (0.175 units a side), twisted from about 35° at the root to 15° at the tip
# (twist an estimate), red tips from 0.15 units out.
def blade(r0, r1, w0, w1, mat, name, k):
    rings = []
    for j in range(7):
        t = j / 6
        r = r0 + (r1 - r0) * t
        w = w0 + (w1 - w0) * t
        pitch = math.radians(35 - 20 * (r - 0.03) / 0.145)
        sec = []
        for a in range(10):
            ang = 2 * math.pi * a / 10
            u, v = w * math.cos(ang), 0.0025 * math.sin(ang)  # chord across, thickness fore and aft
            sec.append((0.587 + v * math.cos(pitch) - u * math.sin(pitch), r, u * math.cos(pitch) + v * math.sin(pitch)))
        rings.append(sec)
    v, f = loft(rings)
    mesh_object(name, rotate_x(v, k * math.pi / 2 + math.radians(22)), f, mat, sharp_deg=60)


for k in range(4):
    blade(0.03, 0.15, 0.016, 0.013, M['blade'], f'blade_{k}', k)
    blade(0.15, 0.175, 0.013, 0.012, M['tip'], f'blade_tip_{k}', k)

# The exhaust stacks, either side of the nose just under the top line.
stub_y = fuse_surf(0.5, -0.012) - 0.003
for s in (1, -1):
    rings = [[(x, s * stub_y + r * math.cos(2 * math.pi * k / 16), -0.012 + r * math.sin(2 * math.pi * k / 16)) for k in range(16)]
             for x, r in ((0.53, 0.012), (0.47, 0.009))]
    mesh_object(f'exhaust_{s}', *loft(rings), M['exhaust'])

# The position lights: red left tip, green right, white strobes and tail light.
tip_y = TIP * math.cos(DIHEDRAL) - WING_Z * math.sin(DIHEDRAL)
tip_z = TIP * math.sin(DIHEDRAL) + WING_Z * math.cos(DIHEDRAL)
nav_x = WING[1]['le'] - 0.012
strobe_x = WING[1]['le'] - WING[1]['chord'] + 0.01
ellipsoid('light_left', (nav_x, tip_y + 0.002, tip_z), (0.014, 0.007, 0.006), M['red'])
ellipsoid('light_right', (nav_x, -(tip_y + 0.002), tip_z), (0.014, 0.007, 0.006), M['green'])
for s in (1, -1):
    ellipsoid(f'strobe_{s}', (strobe_x, s * (tip_y + 0.002), tip_z), (0.008, 0.005, 0.004), M['strobe'])
ellipsoid('light_tail', (-0.787, 0, -0.035), (0.006, 0.004, 0.005), M['strobe'])

# One part per paint, so the aircraft is about a dozen draw calls (the code model joins its parts the same way).
for ob in bpy.data.objects:
    for mod in list(ob.modifiers):
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
by_mat = {}
for ob in list(bpy.data.objects):
    by_mat.setdefault(ob.data.materials[0].name, []).append(ob)
for name, obs in by_mat.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    bpy.context.active_object.name = name

bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_yup=False, export_apply=True,
                          export_cameras=False, export_lights=False)
tris = sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.data.calc_loop_triangles() is None)
print(f'ct156.glb written: {len(bpy.data.objects)} parts, about {tris} triangles')
