# Builds the CT-102B Astra II's outside (Grob G 120TP) as a Blender master file, first pass (shared plan Step 3c items 1
# to 3, docs/modules/shared/ct102-astra-plan.md). Runs headless, with Blender 5.2 or the bpy module:
#
#   blender -b --factory-startup -P tools/blender/ct102b/build_ct102b.py -- <out>/ct102b.blend [<render dir>]
#   <venv>/bin/python tools/blender/ct102b/build_ct102b.py -- <out>/ct102b.blend [<render dir>]
#
# Every number is in the constants block below and names its row in sources.md (P = a public page, E = an estimate).
# Nothing here is measured off a picture yet: the shape is sized to the published length, span, height and wing area,
# and everything else is an estimate until the fix list replaces it.
#
# Axes and units are the CT-156 scripts' (build_ct156_exterior.py, ct156-points.mjs): real feet, nose +X, left +Y,
# up +Z from the propeller's axis. The origin is the spinner's tip, so a part's station (feet behind the tip) is -X.
# Parts are smooth-shaded with a hard edge where faces meet at more than SHARP_DEG, as the CT-156's are. The baked soft
# shadows come with the High and Performance delivery (plan Step 3c item 6), not in this pass.
#
# With a render directory, the saved master is opened again and the full renders are made from it in plain colours:
# both quarters, below, and square-on side, front and top over a 1 ft grid.
import math
import os
import sys

import bpy  # first: with the bpy module, bmesh exists only once bpy is loaded
import bmesh  # noqa: E402
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    sys.exit('usage: build_ct102b.py -- <out.blend> [<render dir>]')
OUT_BLEND = os.path.abspath(argv[0])
RENDER_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None

M_TO_FT = 1 / 0.3048

# ---------- the numbers (each names its row in sources.md) ----------
# Published sizes
RCAF_LENGTH_FT = 8.4 * M_TO_FT      # P1 RCAF page
RCAF_SPAN_FT = 10.3 * M_TO_FT       # P1
RCAF_HEIGHT_FT = 2.7 * M_TO_FT      # P1
LENGTH_FT = 8.42 * M_TO_FT          # P2 EASA type certificate data sheet (also P3, P4); the build's target
SPAN_FT = 10.31 * M_TO_FT           # P2 (also P3, P4)
HEIGHT_FT = 2.64 * M_TO_FT          # P2 (also P3); Grob P4 says 2.62 m, RCAF P1 2.7 m
WING_AREA_FT2 = 13.52 * M_TO_FT ** 2  # P2 (also P3)
PROP_DIAMETER_FT = 2.10 * M_TO_FT   # P2a (also P5)
PROP_BLADES = 5                     # P2a (also P5)

# Propeller axis and spinner
AXIS_HEIGHT_FT = 4.35               # E1 estimate: axis above the ground, gear down
SPINNER_LENGTH_FT = 1.7             # E20 estimate
SPINNER_RADIUS_FT = 0.64            # E20 estimate
PROP_STATION_FT = 1.0               # E21 estimate
BLADE_ROOT_FT = 0.55                # E22 estimate: where the blade leaves the spinner
BLADE_CHORD_FT = (0.50, 0.32)       # E22 estimate: root, tip
BLADE_ANGLE_DEG = (42, 14)          # E23 estimate: root, tip, from the disc's plane

# Fuselage stations (E2 estimate): station ft, half-width ft, top ft, bottom ft (heights above the axis)
FUSELAGE = [
    (1.7, 0.66, 0.66, -0.70),
    (2.5, 0.85, 0.85, -1.05),
    (4.0, 1.10, 1.15, -1.35),
    (5.5, 1.30, 1.35, -1.50),
    (7.0, 1.55, 1.50, -1.55),
    (8.5, 1.85, 1.58, -1.55),
    (10.0, 1.98, 1.62, -1.50),
    (11.5, 1.98, 1.62, -1.40),
    (13.0, 1.85, 1.58, -1.25),
    (15.0, 1.50, 1.50, -1.00),
    (17.5, 1.10, 1.40, -0.65),
    (20.0, 0.80, 1.32, -0.30),
    (22.5, 0.55, 1.28, 0.00),
    (25.0, 0.35, 1.25, 0.30),
    (26.6, 0.15, 1.20, 0.65),
]
FIREWALL_STATION_FT = 7.0           # E3 estimate: the cowl ends here
SECTION_POWER = 2.5                 # E4 estimate: superellipse power of the fuselage's sections

# Canopy (E5 to E7 estimates): one bubble that slides aft (P6); closed, no frame drawn
CANOPY_FRONT_FT, CANOPY_PEAK_FT, CANOPY_AFT_FT = 7.8, 11.0, 15.5  # E5
CANOPY_PEAK_HEIGHT_FT = 3.35        # E6, above the axis
CANOPY_SILL = 0.6                   # E7: the sill sits this far up the fuselage's side (0 middle, 1 top)

# Wing (E8 to E15 estimates; span P2, area check P2)
WING_ROOT_Z_FT = -1.20              # E8 chord line at the root, below the axis (low wing, P5)
WING_BREAK_FT = 2.0                 # E9 flat centre section out to here
WING_DIHEDRAL_DEG = 5.0             # E9
WING_THICKNESS = (0.15, 0.12)       # E10 root, tip (NACA 24xx stand-in)
WING_CAMBER = 0.02                  # E10
WING_CHORD_FT = (5.6, 3.2)          # E11 root, tip; quarter-chord line straight across; area to P2
WING_LE_ROOT_FT = 8.6               # E12 station of the root's leading edge
WINGLET_LENGTH_FT = 1.9             # E13
WINGLET_BEND_FT = 0.7               # E13
WINGLET_CANT_DEG = 72               # E13, from level
WINGLET_TIP_CHORD_FT = 1.4          # E13
WINGLET_THICKNESS = 0.10            # E13
FLAP_SPAN_FT = (2.1, 9.0)           # E14 out from the centreline
AILERON_SPAN_FT = (9.2, 15.4)       # E15
WING_HINGE_CHORD = 0.75             # E14, E15: flaps and ailerons are the aft 25%

# Tailplane, fin (E16 to E19 estimates; fin top from HEIGHT_FT and AXIS_HEIGHT_FT; root TE from LENGTH_FT)
TAIL_HALF_SPAN_FT = 11.5 / 2        # E16
TAIL_Z_FT = 0.55                    # E16
TAIL_CHORD_FT = (3.2, 2.1)          # E16 root, tip
TAIL_LE_FT = (22.2, 22.8)           # E16 root, tip
TAIL_THICKNESS = 0.10               # E16
ELEVATOR_HINGE_CHORD = 0.62         # E17
FIN_ROOT_Z_FT = 0.9                 # E18
FIN_ROOT_CHORD_FT = 5.74            # E18
FIN_TIP_CHORD_FT = 2.7              # E18
FIN_TIP_LE_FT = 24.6                # E18
FIN_THICKNESS = 0.12                # E18
RUDDER_HINGE_CHORD = 0.62           # E19

# Gear, down (E24 to E26 estimates; retractable tricycle P5, mains inwards and nose backwards P6)
MAIN_PIVOT_OUT_FT = 5.37            # E24
MAIN_WHEEL_OUT_FT = 5.0             # E24
MAIN_STATION_FT = 10.6              # E24
MAIN_WHEEL_DIA_FT, MAIN_WHEEL_WIDTH_FT = 1.30, 0.45  # E24
NOSE_STATION_FT = 3.9               # E25
NOSE_PIVOT_Z_FT = -1.2              # E25
NOSE_WHEEL_DIA_FT, NOSE_WHEEL_WIDTH_FT = 1.10, 0.40  # E25
MAIN_LEG_RADIUS_FT, NOSE_LEG_RADIUS_FT = 0.13, 0.12  # E26

# Named points
EYE_STATION_FT, EYE_OUT_FT, EYE_Z_FT = 11.3, 0.95, 2.55  # E30 estimate, side by side (P3, P4)

SHARP_DEG = 40  # as build_ct156_exterior.py: faces meeting at more than this keep a hard edge

# ---------- worked out from the numbers above ----------
GROUND_Z = -AXIS_HEIGHT_FT
FIN_TOP_Z = HEIGHT_FT - AXIS_HEIGHT_FT
FIN_ROOT_LE_FT = LENGTH_FT - FIN_ROOT_CHORD_FT  # the rudder's root trailing edge is the overall length
PROP_RADIUS_FT = PROP_DIAMETER_FT / 2


def X(station):
    return -station


# ---------- shapes ----------
def naca(x, t, m=0.0, p=0.4):
    """NACA 4-digit section at x (0 leading edge, 1 trailing edge): (upper z, lower z), closed trailing edge."""
    yt = 5 * t * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
    if m == 0:
        yc = 0.0
    elif x < p:
        yc = m / p ** 2 * (2 * p * x - x * x)
    else:
        yc = m / (1 - p) ** 2 * (1 - 2 * p + 2 * p * x - x * x)
    return yc + yt, yc - yt


N_FOIL = 18  # points along each surface


def foil(a, b, t, m=0.0):
    """Closed loop of (chord fraction, z / chord) for the part of a section between chord fractions a and b: the upper
    surface from b to a, then the lower from a to b. A cut (a > 0) closes with a straight face at the hinge."""
    xs = [a + (b - a) * (1 - math.cos(math.pi * i / (N_FOIL - 1))) / 2 for i in range(N_FOIL)]
    upper = [(x, naca(x, t, m)[0]) for x in reversed(xs)]
    lower = [(x, naca(x, t, m)[1]) for x in xs]
    if a == 0:
        lower = lower[1:]   # the leading edge is one point
    if b == 1:
        lower = lower[:-1]  # the closed trailing edge is one point
    return upper + lower


def loft(bm, rings, caps=True):
    """Quads between rings of equal length, each ring a closed loop; the end rings capped flat."""
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(vs[0][::-1])
        bm.faces.new(vs[-1])


def cylinder(bm, p0, p1, r, seg=20):
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0).normalized()
    u = ax.orthogonal().normalized()
    v = ax.cross(u)
    ring = [u * (r * math.cos(2 * math.pi * k / seg)) + v * (r * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    loft(bm, [[p0 + q for q in ring], [p1 + q for q in ring]])


def catmull(table, s, col):
    """Smooth value of column col at station s through the table's rows (Catmull-Rom, ends clamped)."""
    st = [row[0] for row in table]
    i = max(0, min(len(st) - 2, next((k for k in range(len(st) - 1) if s <= st[k + 1]), len(st) - 2)))
    p = [table[max(0, min(len(table) - 1, k))][col] for k in (i - 1, i, i + 1, i + 2)]
    u = (s - st[i]) / (st[i + 1] - st[i])
    return 0.5 * (2 * p[1] + (-p[0] + p[2]) * u + (2 * p[0] - 5 * p[1] + 4 * p[2] - p[3]) * u * u
                  + (-p[0] + 3 * p[1] - 3 * p[2] + p[3]) * u ** 3)


def se(c, n):
    """Superellipse curve: sign(c) |c|^(2/n)."""
    return math.copysign(abs(c) ** (2 / n), c)


def steps(a, b, step):
    n = max(1, round((b - a) / step))
    return [a + (b - a) * k / n for k in range(n + 1)]


def fuselage_ring(s, n=48):
    hw, top, bot = (catmull(FUSELAGE, s, c) for c in (1, 2, 3))
    zc, hh = (top + bot) / 2, (top - bot) / 2
    return [(X(s), hw * se(math.cos(t), SECTION_POWER), zc + hh * se(math.sin(t), SECTION_POWER))
            for t in (2 * math.pi * k / n for k in range(n))]


# Materials: plain colours (estimates, for the renders only; the paint scheme is not part of this pass)
COLOURS = {
    'airframe': (0.85, 0.85, 0.83, 1), 'surface': (0.50, 0.60, 0.72, 1), 'canopy': (0.45, 0.62, 0.78, 1),
    'spinner': (0.55, 0.55, 0.57, 1), 'prop': (0.12, 0.12, 0.13, 1), 'gear': (0.60, 0.60, 0.62, 1),
    'tyre': (0.07, 0.07, 0.07, 1),
}


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.diffuse_color = COLOURS[name]
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = COLOURS[name]
    bsdf.inputs['Roughness'].default_value = 0.6
    return m


def part(name, colour, make):
    """One named mesh object: make(bm) draws it; smooth-shaded with hard edges past SHARP_DEG."""
    bm = bmesh.new()
    make(bm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material(colour))
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def empty(name, at, axis=None, **props):
    """A named point. With an axis, its local X lies along it (a hinge's turning axis, right-handed: positive turns as
    `positive` says)."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS' if axis else 'SPHERE'
    e.empty_display_size = 0.5
    e.location = at
    if axis:
        a = Vector(axis).normalized()
        e.rotation_mode = 'QUATERNION'
        e.rotation_quaternion = a.to_track_quat('X', 'Z')
        e['axis'] = [round(c, 4) for c in a]
    for k, v in props.items():
        e[k] = v
    bpy.context.collection.objects.link(e)
    return e


def attach(child, parent):
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- fuselage, cowl, spinner, canopy ----------
part('cowl', 'airframe', lambda bm: loft(bm, [fuselage_ring(s) for s in steps(FUSELAGE[0][0], FIREWALL_STATION_FT, 0.25)]))
part('fuselage', 'airframe', lambda bm: loft(bm, [fuselage_ring(s) for s in steps(FIREWALL_STATION_FT, FUSELAGE[-1][0], 0.25)]))


def spinner(bm, n=32):
    rings = []
    for s in steps(0.02, SPINNER_LENGTH_FT, 0.08):
        r = SPINNER_RADIUS_FT * math.sqrt(1 - (1 - s / SPINNER_LENGTH_FT) ** 2)
        rings.append([(X(s), r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)])
    loft(bm, rings)


spinner_obj = part('spinner', 'spinner', spinner)


def canopy_sill(s):
    """Height and half-width of the canopy's sill at station s: on the fuselage's side, CANOPY_SILL of the way up,
    where the section is still nearly its full width, so the bubble's sides run down into the fuselage's."""
    hw, top, bot = (catmull(FUSELAGE, s, c) for c in (1, 2, 3))
    zc, hh = (top + bot) / 2, (top - bot) / 2
    return zc + CANOPY_SILL * hh, hw * (1 - CANOPY_SILL ** SECTION_POWER) ** (1 / SECTION_POWER)


def canopy(bm, n=33):
    peak_h = CANOPY_PEAK_HEIGHT_FT - canopy_sill(CANOPY_PEAK_FT)[0]
    rings = []
    for s in steps(CANOPY_FRONT_FT, CANOPY_AFT_FT, 0.2):
        if s <= CANOPY_PEAK_FT:
            h = peak_h * math.sin((s - CANOPY_FRONT_FT) / (CANOPY_PEAK_FT - CANOPY_FRONT_FT) * math.pi / 2) ** 0.7
        else:
            h = peak_h * math.cos((s - CANOPY_PEAK_FT) / (CANOPY_AFT_FT - CANOPY_PEAK_FT) * math.pi / 2)
        h = max(h, 0.03)
        sill, w = canopy_sill(s)
        rings.append([(X(s), w * se(math.cos(t), 2.6), sill + h * abs(math.sin(t)) ** (2 / 2.6))
                      for t in (math.pi * k / (n - 1) for k in range(n))])
    loft(bm, rings)


part('canopy', 'canopy', canopy)

# ---------- wing, with flaps, ailerons and winglets ----------
C_ROOT, C_TIP = WING_CHORD_FT
T_ROOT, T_TIP = WING_THICKNESS


def winglet_path():
    """Points along the winglet from the panel's tip: (offset out, offset up, cant radians, fraction along)."""
    pts, y, z, n = [], 0.0, 0.0, 16
    ds = WINGLET_LENGTH_FT / n
    for k in range(n + 1):
        s = k * ds
        u = min(1.0, s / WINGLET_BEND_FT)
        phi = math.radians(WINGLET_CANT_DEG) * (3 * u * u - 2 * u ** 3)
        pts.append((y, z, phi, s / WINGLET_LENGTH_FT))
        y += math.cos(phi) * ds
        z += math.sin(phi) * ds
    return pts


WINGLET = winglet_path()


def winglet_reach(c0):
    """How far out the winglet's outermost surface point lies beyond the panel's tip, for a tip chord c0."""
    reach = 0.0
    for dy, dz, phi, f in WINGLET:
        c = c0 + (WINGLET_TIP_CHORD_FT - c0) * f
        t = T_TIP + (WINGLET_THICKNESS - T_TIP) * f
        reach = max(reach, max(dy - zc * c * math.sin(phi) for x, zc in foil(0, 1, t, WING_CAMBER)))
    return reach


# The panel's tip, so the span over the winglets is the published span (P2). The tip chord barely depends on it.
WING_TIP_FT = SPAN_FT / 2 - winglet_reach(WING_CHORD_FT[1])


def chord(y):
    if y <= WING_BREAK_FT:
        return C_ROOT
    return C_ROOT + (C_TIP - C_ROOT) * (y - WING_BREAK_FT) / (WING_TIP_FT - WING_BREAK_FT)


def wing_le(y):
    return WING_LE_ROOT_FT + 0.25 * (C_ROOT - chord(y))


def wing_z(y):
    return WING_ROOT_Z_FT + max(0.0, y - WING_BREAK_FT) * math.tan(math.radians(WING_DIHEDRAL_DEG))


def wing_t(y):
    return T_ROOT + (T_TIP - T_ROOT) * y / WING_TIP_FT


def wing_ring(y, a, b, side):
    c, le, z0, t = chord(y), wing_le(y), wing_z(y), wing_t(y)
    return [(X(le + x * c), side * y, z0 + zc * c) for x, zc in foil(a, b, t, WING_CAMBER)]


def wing_span(y0, y1, a, b, side):
    ys = steps(y0, y1, 0.5)
    if y0 < WING_BREAK_FT < y1:
        ys = sorted(set(ys) | {WING_BREAK_FT})
    return [wing_ring(y, a, b, side) for y in ys]


def winglet(bm, side):
    c0, le0, z0 = chord(WING_TIP_FT), wing_le(WING_TIP_FT), wing_z(WING_TIP_FT)
    rings = []
    for dy, dz, phi, f in WINGLET:
        c = c0 + (WINGLET_TIP_CHORD_FT - c0) * f
        le = le0 + 0.8 * (c0 - c)
        t = T_TIP + (WINGLET_THICKNESS - T_TIP) * f
        ny, nz = -math.sin(phi), math.cos(phi)  # the section's "up", turning inboard as the winglet rises
        rings.append([(X(le + x * c), side * (WING_TIP_FT + dy + zc * c * ny), z0 + dz + zc * c * nz)
                      for x, zc in foil(0, 1, t, WING_CAMBER)])
    loft(bm, rings)


def wing_main(bm, side):
    h = WING_HINGE_CHORD
    loft(bm, wing_span(0.0, FLAP_SPAN_FT[0], 0, 1, side))
    loft(bm, wing_span(FLAP_SPAN_FT[0], FLAP_SPAN_FT[1], 0, h, side))
    loft(bm, wing_span(FLAP_SPAN_FT[1], AILERON_SPAN_FT[0], 0, 1, side))
    loft(bm, wing_span(AILERON_SPAN_FT[0], AILERON_SPAN_FT[1], 0, h, side))
    loft(bm, wing_span(AILERON_SPAN_FT[1], WING_TIP_FT, 0, 1, side))
    winglet(bm, side)


def hinge_point(y):
    """On the chord line at the flaps' and ailerons' hinge."""
    return Vector((X(wing_le(y) + WING_HINGE_CHORD * chord(y)), y, wing_z(y)))


def aligned(v, want):
    v = Vector(v).normalized()
    return v if v.dot(Vector(want)) >= 0 else -v


# A positive turn about each hinge's axis moves the surface as `positive` says: for a trailing edge going down, the
# axis is aft x down = -Y; for the rudder's trailing edge going right, aft x right = +Z; for a leg going up, down x the
# way it folds (P6: mains inwards, nose backwards).
TE_DOWN = (0, -1, 0)
hinges = {}
for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'wing{lr}', 'airframe', lambda bm, s=side: wing_main(bm, s))
    for surf, (y0, y1), row in (('flap', FLAP_SPAN_FT, 'E14'), ('aileron', AILERON_SPAN_FT, 'E15')):
        obj = part(f'{surf}{lr}', 'surface', lambda bm, a=y0, b=y1, s=side: loft(bm, wing_span(a, b, WING_HINGE_CHORD, 1, s)))
        p0, p1 = hinge_point(y0), hinge_point(y1)
        p0.y *= side
        p1.y *= side
        hinges[obj.name] = empty(f'{surf}{lr}Hinge', (p0 + p1) / 2, aligned(p1 - p0, TE_DOWN),
                                 positive='trailing edge down', travel='not set (no source yet)', source=f'{row} (estimate)')
        attach(obj, hinges[obj.name])

# ---------- tailplane and elevator, fin and rudder ----------


def tail_ring(y, a, b):
    f = abs(y) / TAIL_HALF_SPAN_FT
    c = TAIL_CHORD_FT[0] + (TAIL_CHORD_FT[1] - TAIL_CHORD_FT[0]) * f
    le = TAIL_LE_FT[0] + (TAIL_LE_FT[1] - TAIL_LE_FT[0]) * f
    return [(X(le + x * c), y, TAIL_Z_FT + zc * c) for x, zc in foil(a, b, TAIL_THICKNESS)]


TAIL_YS = sorted(set(steps(-TAIL_HALF_SPAN_FT, TAIL_HALF_SPAN_FT, 0.5)) | {0.0})
part('tailplane', 'airframe', lambda bm: loft(bm, [tail_ring(y, 0, ELEVATOR_HINGE_CHORD) for y in TAIL_YS]))
elevator = part('elevator', 'surface', lambda bm: loft(bm, [tail_ring(y, ELEVATOR_HINGE_CHORD, 1) for y in TAIL_YS]))


def tail_hinge(y):
    f = abs(y) / TAIL_HALF_SPAN_FT
    c = TAIL_CHORD_FT[0] + (TAIL_CHORD_FT[1] - TAIL_CHORD_FT[0]) * f
    return Vector((X(TAIL_LE_FT[0] + (TAIL_LE_FT[1] - TAIL_LE_FT[0]) * f + ELEVATOR_HINGE_CHORD * c), y, TAIL_Z_FT))


hinges['elevator'] = empty('elevatorHinge', tail_hinge(0), aligned(tail_hinge(TAIL_HALF_SPAN_FT) - tail_hinge(0), TE_DOWN),
                           positive='trailing edge down', travel='not set (no source yet)', source='E17 (estimate)')
attach(elevator, hinges['elevator'])


def fin_ring(z, a, b):
    f = (z - FIN_ROOT_Z_FT) / (FIN_TOP_Z - FIN_ROOT_Z_FT)
    c = FIN_ROOT_CHORD_FT + (FIN_TIP_CHORD_FT - FIN_ROOT_CHORD_FT) * f
    le = FIN_ROOT_LE_FT + (FIN_TIP_LE_FT - FIN_ROOT_LE_FT) * f
    return [(X(le + x * c), zc * c, z) for x, zc in foil(a, b, FIN_THICKNESS)]


def fin_hinge(z):
    return Vector((fin_ring(z, RUDDER_HINGE_CHORD, 1)[N_FOIL - 1][0], 0, z))


FIN_ZS = steps(FIN_ROOT_Z_FT, FIN_TOP_Z, 0.4)
part('fin', 'airframe', lambda bm: loft(bm, [fin_ring(z, 0, RUDDER_HINGE_CHORD) for z in FIN_ZS]))
rudder = part('rudder', 'surface', lambda bm: loft(bm, [fin_ring(z, RUDDER_HINGE_CHORD, 1) for z in FIN_ZS]))
hinges['rudder'] = empty('rudderHinge', (fin_hinge(FIN_ROOT_Z_FT) + fin_hinge(FIN_TOP_Z)) / 2,
                         aligned(fin_hinge(FIN_TOP_Z) - fin_hinge(FIN_ROOT_Z_FT), (0, 0, 1)),
                         positive='trailing edge right', travel='not set (no source yet)', source='E19 (estimate)')
attach(rudder, hinges['rudder'])

# ---------- propeller ----------


def blade(bm, psi):
    radial = Vector((0, math.cos(psi), math.sin(psi)))
    tangent = Vector((0, -math.sin(psi), math.cos(psi)))
    aft = Vector((-1, 0, 0))
    rings = []
    for r in steps(BLADE_ROOT_FT, PROP_RADIUS_FT, 0.2):
        f = (r - BLADE_ROOT_FT) / (PROP_RADIUS_FT - BLADE_ROOT_FT)
        c = BLADE_CHORD_FT[0] + (BLADE_CHORD_FT[1] - BLADE_CHORD_FT[0]) * f
        c *= math.sqrt(max(0.15, 1 - max(0.0, (f - 0.85) / 0.15) ** 2))  # rounded tip
        beta = math.radians(BLADE_ANGLE_DEG[0] + (BLADE_ANGLE_DEG[1] - BLADE_ANGLE_DEG[0]) * f)
        along = tangent * math.cos(beta) + aft * math.sin(beta)
        up = along.cross(radial).normalized()
        centre = Vector((X(PROP_STATION_FT), 0, 0)) + radial * r
        t = 0.16 - 0.10 * f
        rings.append([centre + along * ((x - 0.35) * c) + up * (zc * c) for x, zc in foil(0, 1, t, 0.03)])
    loft(bm, rings)


prop_axis = empty('propAxis', (X(PROP_STATION_FT), 0, 0), (1, 0, 0), positive='turning direction not confirmed',
                  source='P2a (5 blades, 2.10 m), E21 (estimate)')
for k in range(PROP_BLADES):
    attach(part(f'blade{k + 1}', 'prop', lambda bm, i=k: blade(bm, 2 * math.pi * i / PROP_BLADES + math.pi / 2)), prop_axis)
attach(spinner_obj, prop_axis)

# ---------- landing gear, down (P5, P6; sizes E24 to E26) ----------


def wheel(bm, centre, dia, width):
    c = Vector(centre)
    cylinder(bm, c - Vector((0, width / 2, 0)), c + Vector((0, width / 2, 0)), dia / 2, seg=32)


def main_leg(bm, pivot, axle, wheel_at):
    cylinder(bm, pivot, axle, MAIN_LEG_RADIUS_FT)
    cylinder(bm, axle, wheel_at, MAIN_LEG_RADIUS_FT * 0.6)  # the axle out to the wheel, inboard of the leg


for side, lr in ((1, 'Left'), (-1, 'Right')):
    pivot = Vector((X(MAIN_STATION_FT), side * MAIN_PIVOT_OUT_FT, wing_z(MAIN_PIVOT_OUT_FT)))
    axle = Vector((X(MAIN_STATION_FT), side * MAIN_PIVOT_OUT_FT, GROUND_Z + MAIN_WHEEL_DIA_FT / 2))
    wheel_at = Vector((axle.x, side * MAIN_WHEEL_OUT_FT, axle.z))
    hinge = empty(f'gearMain{lr}Hinge', pivot, (-side, 0, 0), positive='leg up (folds inwards, P6)',
                  travel='not set (no source yet)', source='E24 (estimate)')
    leg = part(f'gearMain{lr}Leg', 'gear', lambda bm, a=pivot, b=axle, w=wheel_at: main_leg(bm, a, b, w))
    tyre = part(f'gearMain{lr}Wheel', 'tyre', lambda bm, w=wheel_at: wheel(bm, w, MAIN_WHEEL_DIA_FT, MAIN_WHEEL_WIDTH_FT))
    attach(leg, hinge)
    attach(tyre, hinge)

nose_pivot = Vector((X(NOSE_STATION_FT), 0, NOSE_PIVOT_Z_FT))
nose_axle = Vector((X(NOSE_STATION_FT), 0, GROUND_Z + NOSE_WHEEL_DIA_FT / 2))
fork_top = nose_axle + Vector((0, 0, NOSE_WHEEL_DIA_FT / 2 + 0.12))
fork_y = NOSE_WHEEL_WIDTH_FT / 2 + 0.06


def nose_leg(bm):
    cylinder(bm, nose_pivot, fork_top, NOSE_LEG_RADIUS_FT)
    cylinder(bm, fork_top + Vector((0, fork_y, 0)), fork_top - Vector((0, fork_y, 0)), 0.06)
    for sgn in (1, -1):
        cylinder(bm, fork_top + Vector((0, sgn * fork_y, 0)), nose_axle + Vector((0, sgn * fork_y, 0)), 0.05)


nose_hinge = empty('gearNoseHinge', nose_pivot, (0, 1, 0), positive='leg up (folds backwards, P6)',
                   travel='not set (no source yet)', source='E25 (estimate)')
attach(part('gearNoseLeg', 'gear', nose_leg), nose_hinge)
attach(part('gearNoseWheel', 'tyre', lambda bm: wheel(bm, nose_axle, NOSE_WHEEL_DIA_FT, NOSE_WHEEL_WIDTH_FT)), nose_hinge)

# ---------- named points ----------
empty('datum', (0, 0, 0), source='E31: the model origin, the spinner tip on the prop axis (not the weighing datum)')
for side, lr in ((1, 'Left'), (-1, 'Right')):
    empty(f'eye{lr}Seat', (X(EYE_STATION_FT), side * EYE_OUT_FT, EYE_Z_FT), source='E30 (estimate), side by side P3 P4')

# ---------- size checks ----------
bpy.context.view_layer.update()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in bpy.data.objects:
    if o.type == 'MESH':
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
size = hi - lo
wing_area = 2 * (WING_BREAK_FT * C_ROOT + (WING_TIP_FT - WING_BREAK_FT) * (C_ROOT + C_TIP) / 2)


def check(what, got, ref, src):
    print(f'  {what:<10} {got:7.2f} ft   {src} {ref:7.2f} ft   difference {got - ref:+.2f} ft ({(got - ref) * 12:+.1f} in)')


print('size checks (model, ft):')
for what, got, rcaf, easa in (('length', size.x, RCAF_LENGTH_FT, LENGTH_FT), ('span', size.y, RCAF_SPAN_FT, SPAN_FT),
                              ('height', size.z, RCAF_HEIGHT_FT, HEIGHT_FT)):
    check(what, got, rcaf, 'RCAF page (P1)    ')
    check('', got, easa, 'EASA sheet (P2)   ')
print(f'  wing area  {wing_area:7.1f} ft2  EASA sheet (P2) {WING_AREA_FT2:7.1f} ft2  difference {wing_area - WING_AREA_FT2:+.1f} ft2 '
      '(trapezoids to the winglet roots, through the fuselage)')
print(f'  prop tip to ground {AXIS_HEIGHT_FT - PROP_RADIUS_FT:.2f} ft (E1 with P2a)')
print('named points (ft: forward +X from the spinner tip, left +Y, up +Z from the prop axis):')
for o in sorted((o for o in bpy.data.objects if o.type == 'EMPTY'), key=lambda o: o.name):
    axis = f"  axis {tuple(o['axis'])}, positive {o['positive']}" if 'axis' in o else ''
    print(f'  {o.name:<20} {tuple(round(c, 2) for c in o.location)}{axis}')

os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('saved', OUT_BLEND)

if not RENDER_DIR:
    sys.exit(0)

# ---------- full renders from the saved master, plain colours ----------
bpy.ops.wm.open_mainfile(filepath=OUT_BLEND)
os.makedirs(RENDER_DIR, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = False
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 2.0
sun.data.angle = math.radians(12)  # soft shadows
sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(30))
scene.collection.objects.link(sun)

lo, hi = Vector(lo), Vector(hi)
mid = (lo + hi) / 2


def grid(name, plane, u_range, v_range):
    """1 ft lines (every 5th heavier) in a plane, drawn as thin flat strips; plane(u, v) gives a point."""
    def make(bm):
        for axis, (a, b), (c, d) in ((0, u_range, v_range), (1, v_range, u_range)):
            for k in range(math.ceil(a), math.floor(b) + 1):
                w = 0.015 if k % 5 else 0.04  # half-widths, ft
                pts = [(k - w, c), (k + w, c), (k + w, d), (k - w, d)] if axis == 0 else [(c, k - w), (d, k - w), (d, k + w), (c, k + w)]
                bm.faces.new([bm.verts.new(plane(u, v)) for u, v in pts])
    bm = bmesh.new()
    make(bm)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.45, 0.45, 0.45, 1)
    nt.links.new(em.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.hide_render = True
    return obj


# Grid lines sit on whole feet from the spinner's tip (stations), the centreline and the ground.
g = GROUND_Z
grids = {
    'side': grid('gridSide', lambda u, v: (-u, -25, g + v), (-2, math.ceil(LENGTH_FT) + 2), (-1, math.ceil(HEIGHT_FT) + 2)),
    'front': grid('gridFront', lambda u, v: (-45, u, g + v), (-math.ceil(SPAN_FT / 2) - 2, math.ceil(SPAN_FT / 2) + 2),
                  (-1, math.ceil(HEIGHT_FT) + 2)),
    'top': grid('gridTop', lambda u, v: (-u, v, g - 1), (-2, math.ceil(LENGTH_FT) + 2),
                (-math.ceil(SPAN_FT / 2) - 2, math.ceil(SPAN_FT / 2) + 2)),
}
cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
cam.data.clip_end = 500
scene.collection.objects.link(cam)
scene.camera = cam


def shoot(name, loc, look=None, ortho=None, euler=None, res=(1920, 1080)):
    for k, o in grids.items():
        o.hide_render = k != name.split('-')[0]
    cam.location = loc
    if euler:
        cam.rotation_mode = 'XYZ'
        cam.rotation_euler = euler
    else:
        cam.rotation_mode = 'QUATERNION'
        cam.rotation_quaternion = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y')
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = 50
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = os.path.join(RENDER_DIR, f'ct102b-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('render', scene.render.filepath)


R = 52  # ft from the middle of the aircraft
shoot('quarter-front-left', mid + Vector((0.62, 0.62, 0.30)) * R, mid)
shoot('quarter-rear-right', mid + Vector((-0.65, -0.60, 0.30)) * R, mid)
shoot('below', mid + Vector((0.45, 0.35, -0.80)) * R * 1.45, mid)
# Square-on views: the left side (nose to the left of the picture), the front, and the top (nose up).
shoot('side', (mid.x, 60, mid.z), (mid.x, 0, mid.z), ortho=LENGTH_FT * 1.15)
shoot('front', (60, 0, mid.z), (0, 0, mid.z), ortho=SPAN_FT * 1.12)
shoot('top', (mid.x, 0, 60), ortho=SPAN_FT * 1.08, euler=(0, 0, math.radians(-90)), res=(1600, 1600))
