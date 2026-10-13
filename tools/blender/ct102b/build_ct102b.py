# Builds the CT-102B Astra II's outside (Grob G 120TP) as a Blender master file, first refine pass (shared plan Step 3c
# items 1 to 4, docs/modules/shared/ct102-astra-plan.md). Runs headless, with Blender 5.2 or the bpy module:
#
#   blender -b --factory-startup -P tools/blender/ct102b/build_ct102b.py -- <out>/ct102b.blend [<render dir>]
#   <venv>/bin/python tools/blender/ct102b/build_ct102b.py -- <out>/ct102b.blend [<render dir>]
#
# Every number is in the constants block below and names its row in sources.md (P = a public page, R = measured off the
# Aeromaquina three-view Dad sent on 13 Oct 2026, E = an estimate). The first refine pass (plan Step 3c item 4) replaced
# most first-pass estimates with R rows; what is still an estimate says so.
#
# Axes and units are the CT-156 scripts' (build_ct156_exterior.py, ct156-points.mjs): real feet, nose +X, left +Y,
# up +Z from the propeller's axis. The origin is the spinner's tip, so a part's station (feet behind the tip) is -X.
# Parts are smooth-shaded with a hard edge where faces meet at more than SHARP_DEG, as the CT-156's are. The baked soft
# shadows come with the High and Performance delivery (plan Step 3c item 6), not in this pass.
#
# The paint (plan Step 3c, Dad's ask 13 Oct 2026, "put on the RCAF colours") is one block of colours, boundaries and markings in
# the constants (rows D7a to D7p in sources.md, all read off Dad's photo of CT-102B 202), drawn into small generated textures
# and applied to the parts by position. It is for renders and checking: for the CT-156 the paint stays the app's code (ALL-38),
# and where the delivered Astra II carries its paint is a question for Patrick at delivery (plan Step 3c item 6).
#
# With a render directory, the saved master is opened again and the full renders are made from it: both quarters, below,
# and square-on side, front and top over a 1 ft grid, and a side view from the photo's own camera.
import math
import os
import shutil
import sys
import tempfile

import bpy  # first: with the bpy module, bmesh exists only once bpy is loaded
import bmesh  # noqa: E402
from mathutils import Matrix, Vector

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
AXIS_HEIGHT_FT = 4.08               # R1: the height (P2) less the fin top above the axis (R14); level on the ground (P6)
SPINNER_LENGTH_FT = 1.7             # R3 (was E20)
SPINNER_RADIUS_FT = 0.65            # R3 (was E20)
PROP_STATION_FT = 1.0               # E21 estimate (no blades drawn on the three-view)
BLADE_ROOT_FT = 0.55                # E22 estimate: where the blade leaves the spinner
BLADE_CHORD_FT = (0.50, 0.32)       # E22 estimate: root, tip
BLADE_ANGLE_DEG = (42, 14)          # E23 estimate: root, tip, from the disc's plane

# Fuselage stations (R4 half-widths from the top view, R5 top and bottom from the side view): station ft, half-width ft,
# top ft, bottom ft (heights above the axis). Under the canopy the top is a deck hidden inside the bubble.
FUSELAGE = [
    (1.7, 0.68, 0.70, -0.72),
    (2.0, 0.87, 0.74, -1.05),
    (2.5, 1.08, 0.80, -1.20),
    (3.0, 1.25, 0.86, -1.34),
    (3.5, 1.39, 0.89, -1.50),
    (4.0, 1.52, 0.93, -1.72),
    (5.0, 1.71, 1.00, -1.92),
    (6.0, 1.88, 1.05, -1.92),
    (7.0, 2.03, 1.10, -1.95),
    (8.0, 2.15, 0.75, -2.05),
    (9.0, 2.20, 0.70, -2.15),
    (10.5, 2.20, 0.70, -2.20),
    (12.0, 2.18, 0.70, -2.10),
    (13.0, 2.10, 0.80, -1.98),
    (14.0, 1.75, 1.05, -1.84),
    (15.0, 1.53, 1.40, -1.77),
    (16.0, 1.25, 1.38, -1.68),
    (17.0, 1.03, 1.33, -1.62),
    (18.0, 0.89, 1.27, -1.55),
    (19.0, 0.67, 1.23, -1.52),
    (20.0, 0.53, 1.25, -1.48),
    (21.0, 0.43, 1.30, -1.43),
    (22.0, 0.38, 1.30, -1.38),
    (23.0, 0.33, 1.20, -1.33),
    (24.0, 0.28, 1.00, -1.25),
    (25.0, 0.22, 0.60, -1.12),
    (25.6, 0.12, 0.20, -0.95),
]
FIREWALL_STATION_FT = 7.0           # E3 estimate: the cowl ends here (the windshield's foot is at 6.8, R6)
SECTION_POWER = 2.5                 # E4 estimate: superellipse power of the fuselage's sections

# Canopy (R6): station ft, sill height ft, top height ft (above the axis). The sill lies on the fuselage's side, so the
# bubble is as wide as the fuselage there. Windshield 6.8 to 9.25 ft, sliding part 9.25 to 14.8 ft (slides aft, P6).
CANOPY = [
    (6.8, 1.10, 1.12),
    (7.0, 0.64, 1.45),
    (7.5, 0.24, 1.80),
    (8.0, 0.00, 1.98),
    (8.5, -0.10, 2.16),
    (9.0, -0.15, 2.32),
    (9.5, -0.15, 2.46),
    (10.0, -0.15, 2.51),
    (11.0, -0.15, 2.52),
    (12.0, -0.15, 2.37),
    (12.5, -0.15, 2.27),
    (13.0, -0.13, 2.10),
    (13.5, -0.08, 1.95),
    (14.0, 0.05, 1.80),
    (14.5, 0.50, 1.62),
    (14.8, 1.40, 1.42),
]
CANOPY_BOW_FT = (9.05, 9.45)        # R6: the windshield's frame, seen on the side and top views
CANOPY_SECTION_POWER = 4.0          # R6: superellipse power of the bubble's section; the front view shows a flat top

# Wing (R7 to R10; span P2, area check P2). Leading and trailing edges are straight lines through the centreline values
# and the values at WING_REF_OUT_FT, the winglet's root on the top and front views.
WING_ROOT_Z_FT = -1.80              # R9 chord line at the centreline, below the axis (low wing, P5; was E8 -1.20)
WING_BREAK_FT = 0.0                 # R9 dihedral from the root: no flat centre section on the front view (was E9 2.0)
WING_DIHEDRAL_DEG = 2.9             # R9 (was E9 5.0)
WING_THICKNESS = (0.15, 0.15)       # R10 root, tip (front view); section still the NACA 24xx stand-in, E10
WING_CAMBER = 0.02                  # E10
WING_REF_OUT_FT = 15.44             # R7 the winglet's root, out from the centreline
WING_LE_FT = (8.14, 8.54)           # R7 leading-edge station at the centreline, at WING_REF_OUT_FT (was E11, E12)
WING_TE_FT = (13.89, 11.71)         # R7 trailing-edge station, likewise
WINGLET_LENGTH_FT = 2.1             # R11 (was E13 1.9)
WINGLET_BEND_FT = 1.0               # R11 (was E13 0.7)
WINGLET_CANT_DEG = 58               # R11, from level at the tip (was E13 72)
WINGLET_TIP_CHORD_FT = 1.15         # R11 (was E13 1.4)
WINGLET_LE_SHIFT = 1.0              # R11: the winglet's trailing edge is straight on, so its leading edge takes all the taper
WINGLET_THICKNESS = 0.10            # E13
FLAP_SPAN_FT = (2.25, 10.40)        # R8 out from the centreline (was E14)
AILERON_SPAN_FT = (10.45, 15.30)    # R8 (was E15)
FLAP_HINGE_CHORD = 0.75             # R8: flaps are the aft 25% of the chord
AILERON_HINGE_CHORD = 0.71          # R8: ailerons are the aft 29%

# Tailplane (R12), fin and rudder (R13, R14); fin top from HEIGHT_FT and AXIS_HEIGHT_FT; the rudder's top trailing edge
# is the overall length
TAIL_HALF_SPAN_FT = 12.35 / 2       # R12 (was E16 11.5)
TAIL_Z_FT = 0.30                    # R12 (was E16 0.55)
TAIL_LE_FT = (21.28, 22.00)         # R12 root, tip (was E16)
TAIL_TE_FT = 24.12                  # R12 straight across
TAIL_THICKNESS = 0.10               # E16
ELEVATOR_HINGE_FT = 23.36           # R12 straight across (was E17, 38% of the chord)
FIN_ROOT_Z_FT = -0.90               # R13 the rudder's foot (was E18 0.9)
FIN_LE_LINE = ((2.01, 22.81), (4.36, 24.81))  # R13 two points (height ft, station ft) on the fin's leading edge: 40 deg
FIN_FILLET = ((1.25, 20.00), (2.01, 22.81))   # R13 the dorsal fillet's leading edge, from the fuselage's top to the fin
FIN_TE_ROOT_FT = 26.30              # R13 trailing edge at the root
FIN_THICKNESS = 0.08                # R13 the top view shows about 0.2 ft either side of the centreline near the root
RUDDER_HINGE_LINE = ((-0.13, 24.45), (3.72, 26.81))  # R14 two points (height ft, station ft) on the rudder's hinge

# Gear, down (R15, R16; retractable tricycle P5, mains inwards and nose backwards P6). The three-view draws no legs.
MAIN_WHEEL_OUT_FT = 3.91            # R15: track 7.82 ft (was E24 5.0)
MAIN_PIVOT_OUT_FT = MAIN_WHEEL_OUT_FT + 0.37  # E24 estimate: the leg's pivot just outboard of the wheel
MAIN_STATION_FT = 10.98             # R15 (was E24 10.6)
MAIN_WHEEL_DIA_FT, MAIN_WHEEL_WIDTH_FT = 1.25, 0.48  # R15 (was E24)
NOSE_STATION_FT = 4.95              # R16 (was E25 3.9)
NOSE_PIVOT_Z_FT = -1.5              # E25 estimate, inside the cowl
NOSE_WHEEL_DIA_FT, NOSE_WHEEL_WIDTH_FT = 1.15, 0.36  # R16 (was E25)
MAIN_LEG_RADIUS_FT, NOSE_LEG_RADIUS_FT = 0.13, 0.12  # E26

# Named points
EYE_STATION_FT, EYE_OUT_FT, EYE_Z_FT = 11.0, 0.95, 1.85  # E30 estimate, side by side (P3, P4); height lowered under the
#                                                          measured canopy, from the pilot's head drawn on the side view

SHARP_DEG = 40  # as build_ct156_exterior.py: faces meeting at more than this keep a hard edge

# ---------- RCAF paint (Dad's photo of CT-102B 202, 13 Oct 2026; rows D7a to D7p in sources.md) ----------
# How the boundaries were found: the camera of the photo was fitted to six landmarks (spinner tip, the three tyres' ground
# points, the fin's top corners), leaving up to 12 px (about 0.25 ft) between where the model puts a landmark and where the
# photo has it. The photo is taken from ahead and to the left, about 32 deg off square-on, with a 45 deg wide lens, so the tail
# is about 40 percent further away than the nose. Each boundary pixel was then cast from that camera onto the model's skin, which
# takes the angle and the perspective out; what remains is that fit error (about +-0.3 ft by the nose, +-0.5 ft by the tail) and
# the pixel reading (+-3 px). Stations are feet behind the spinner's tip, heights are feet above the prop axis (as FUSELAGE).
# Colours are sRGB 0 to 255 read off the photo, away from reflections (D7a); the photo's yellow is washed by the hangar lights.
PAINT_RGB = {
    'navy': (16, 26, 72), 'yellow': (255, 208, 36), 'red': (214, 22, 32), 'white': (240, 240, 240), 'black': (22, 22, 24),
    'silver': (170, 170, 172), 'grey': (178, 180, 184), 'tyre': (30, 32, 36), 'prop': (46, 49, 60),
}
# D7b: the dark navy nose meets yellow along this line (station, height), running down the cowl's side just ahead of the
# windshield (6.8 ft, R6), then aft along the lower fuselage to the tail. Navy is below and ahead of it. The nose part is read
# off the photo; the part under the wing (stations 7.8 to 18.8) is hidden by the wing in the photo and is a straight line
# between the two ends. It runs off the top (height 3) and off the tail (station 30) so the line has no end caps.
NAVY_EDGE = [(6.30, 3.0), (6.30, 0.49), (6.33, -0.43), (6.45, -1.26), (6.76, -1.54), (7.77, -1.67), (18.84, -0.98),
             (21.35, -0.73), (23.91, -0.53), (25.40, -0.35), (30.0, -0.22)]
# D7c: from the navy edge toward the yellow: white, red, white; widths in ft (red about 0.17 ft, from the photo's stripe at the nose)
STRIPE_BANDS = ((0.05, 'white'), (0.17, 'red'), (0.05, 'white'))
WING_LE_SILVER = 0.10          # D7d estimate: the leading edge's silver band, as a fraction of the chord (it looks about 10 percent)
TAIL_LE_SILVER = 0.10          # D7d estimate, likewise (the photo shows the tailplane's near side grey; its top is not seen)
# Markings: on = which part; s, z = centre (station ft, height ft above the axis, from the casts); size in ft. The text is
# Blender's built-in font, scaled to the photo's width; the real lettering is a different face and is not copied (D7e).
MARKS = [
    dict(on='fuselage', kind='text', text='202', s=5.13, z=-0.53, width=1.00, colour='white'),      # D7e: on the navy cowl
    dict(on='fuselage', kind='text', text='Canada', s=7.88, z=-0.62, width=1.80, colour='black'),   # D7f
    dict(on='fuselage', kind='flag', s=8.70, z=-0.40, width=0.30, height=0.16),                     # D7f: the small flag by the word
    dict(on='fuselage', kind='text', text='RCAF', s=17.33, z=0.10, width=1.60, colour='black'),     # D7g
    dict(on='fuselage', kind='roundel', s=18.87, z=0.14, diameter=1.10),                            # D7g
    dict(on='fuselage', kind='text', text='ARC', s=20.24, z=0.20, width=1.36, colour='black'),      # D7g
    dict(on='fin', kind='flag', s=25.10, z=3.27, width=1.00, height=0.60),                          # D7h
]
# Seen on the left side only; the right side is taken as the same, mirrored so it reads the right way (E, not in the photo).
WING_ROUNDEL_FT = dict(out=7.5, chord_fraction=0.45, diameter=1.5)  # D7i estimate: on both wings' upper surfaces, position not seen
TIP_LIGHT = dict(station=9.3, out=15.0, below=0.30, length=1.1, width=0.40, depth=0.16)  # D7j: under the winglet's root; size E
HUB_FRACTION = 0.55            # D7k: red wheel hubs, about this fraction of the tyre's diameter (the photo shows red hubs)
# The photo's camera for the matching render (D7a): position (ft), yaw, pitch, roll (rad), focal length in pixels of a 1400 px picture
PHOTO_CAM = dict(pos=(6.18, 30.56, -0.17), yaw=2.58390, pitch=0.02308, roll=-0.06267, f_px=1678.8, size=(1400, 786))

# ---------- worked out from the numbers above ----------
GROUND_Z = -AXIS_HEIGHT_FT
FIN_TOP_Z = HEIGHT_FT - AXIS_HEIGHT_FT
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


# Materials. Plain colours from PAINT_RGB for the parts that carry one colour; the fuselage, fin, wing and tailplane get
# generated textures (the paint block below). The canopy's glass stays an estimate.
def linear(c):
    return tuple(((v / 255 + 0.055) / 1.055) ** 2.4 if v > 10.3 else v / 255 / 12.92 for v in c)


COLOURS = {k: (*linear(v), 1) for k, v in PAINT_RGB.items()}
COLOURS.update({'airframe': COLOURS['yellow'], 'surface': COLOURS['yellow'], 'spinner': COLOURS['navy'],
                'gear': COLOURS['grey'], 'canopy': (0.45, 0.62, 0.78, 1)})


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.diffuse_color = COLOURS[name]
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = COLOURS[name]
    bsdf.inputs['Roughness'].default_value = 0.6 if name in ('tyre', 'prop', 'gear') else 0.3
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
    """Height and half-width of the canopy's sill at station s: the sill height is measured (CANOPY, R6), and the
    bubble is as wide as the fuselage's section at that height, so its sides run down into the fuselage's."""
    hw, top, bot = (catmull(FUSELAGE, s, c) for c in (1, 2, 3))
    zc, hh = (top + bot) / 2, (top - bot) / 2
    sill = catmull(CANOPY, s, 1)
    f = min(1.0, abs(sill - zc) / hh)
    return sill, max(0.02, hw * (1 - f ** SECTION_POWER) ** (1 / SECTION_POWER))


def canopy_rings(s0, s1, grow=0.0, n=33):
    rings = []
    for s in steps(s0, s1, 0.1):
        sill, w = canopy_sill(s)
        h = max(catmull(CANOPY, s, 2) - sill, 0.03)
        p = CANOPY_SECTION_POWER
        rings.append([(X(s), (w + grow) * se(math.cos(t), p), sill + (h + grow) * abs(math.sin(t)) ** (2 / p))
                      for t in (math.pi * k / (n - 1) for k in range(n))])
    return rings


def canopy(bm):
    loft(bm, canopy_rings(CANOPY[0][0], CANOPY[-1][0]))


part('canopy', 'canopy', canopy)
part('canopyBow', 'airframe', lambda bm: loft(bm, canopy_rings(*CANOPY_BOW_FT, grow=0.03)))  # R6

# ---------- wing, with flaps, ailerons and winglets ----------
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
WING_TIP_FT = SPAN_FT / 2 - winglet_reach(WING_TE_FT[1] - WING_LE_FT[1])


def wing_le(y):
    return WING_LE_FT[0] + (WING_LE_FT[1] - WING_LE_FT[0]) * y / WING_REF_OUT_FT


def chord(y):
    return WING_TE_FT[0] + (WING_TE_FT[1] - WING_TE_FT[0]) * y / WING_REF_OUT_FT - wing_le(y)


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
        le = le0 + WINGLET_LE_SHIFT * (c0 - c)
        t = T_TIP + (WINGLET_THICKNESS - T_TIP) * f
        ny, nz = -math.sin(phi), math.cos(phi)  # the section's "up", turning inboard as the winglet rises
        rings.append([(X(le + x * c), side * (WING_TIP_FT + dy + zc * c * ny), z0 + dz + zc * c * nz)
                      for x, zc in foil(0, 1, t, WING_CAMBER)])
    loft(bm, rings)


def wing_main(bm, side):
    loft(bm, wing_span(0.0, FLAP_SPAN_FT[0], 0, 1, side))
    loft(bm, wing_span(FLAP_SPAN_FT[0], FLAP_SPAN_FT[1], 0, FLAP_HINGE_CHORD, side))
    loft(bm, wing_span(FLAP_SPAN_FT[1], AILERON_SPAN_FT[0], 0, 1, side))
    loft(bm, wing_span(AILERON_SPAN_FT[0], AILERON_SPAN_FT[1], 0, AILERON_HINGE_CHORD, side))
    loft(bm, wing_span(AILERON_SPAN_FT[1], WING_TIP_FT, 0, 1, side))
    winglet(bm, side)


def hinge_point(y, h):
    """On the chord line at a flap's or aileron's hinge, the aft (1 - h) of the chord."""
    return Vector((X(wing_le(y) + h * chord(y)), y, wing_z(y)))


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
    for surf, (y0, y1), h, row in (('flap', FLAP_SPAN_FT, FLAP_HINGE_CHORD, 'R8'),
                                   ('aileron', AILERON_SPAN_FT, AILERON_HINGE_CHORD, 'R8')):
        obj = part(f'{surf}{lr}', 'surface', lambda bm, a=y0, b=y1, s=side, h=h: loft(bm, wing_span(a, b, h, 1, s)))
        p0, p1 = hinge_point(y0, h), hinge_point(y1, h)
        p0.y *= side
        p1.y *= side
        hinges[obj.name] = empty(f'{surf}{lr}Hinge', (p0 + p1) / 2, aligned(p1 - p0, TE_DOWN),
                                 positive='trailing edge down', travel='not set (no source yet)', source=f'{row} (measured)')
        attach(obj, hinges[obj.name])

# ---------- tailplane and elevator, fin and rudder ----------


def tail_le(y):
    return TAIL_LE_FT[0] + (TAIL_LE_FT[1] - TAIL_LE_FT[0]) * abs(y) / TAIL_HALF_SPAN_FT


def tail_hinge_frac(y):
    return (ELEVATOR_HINGE_FT - tail_le(y)) / (TAIL_TE_FT - tail_le(y))


def tail_ring(y, a, b):
    le = tail_le(y)
    c = TAIL_TE_FT - le
    return [(X(le + x * c), y, TAIL_Z_FT + zc * c) for x, zc in foil(a, b, TAIL_THICKNESS)]


TAIL_YS = sorted(set(steps(-TAIL_HALF_SPAN_FT, TAIL_HALF_SPAN_FT, 0.5)) | {0.0})
part('tailplane', 'airframe', lambda bm: loft(bm, [tail_ring(y, 0, tail_hinge_frac(y)) for y in TAIL_YS]))
elevator = part('elevator', 'surface', lambda bm: loft(bm, [tail_ring(y, tail_hinge_frac(y), 1) for y in TAIL_YS]))
hinges['elevator'] = empty('elevatorHinge', Vector((X(ELEVATOR_HINGE_FT), 0, TAIL_Z_FT)), TE_DOWN,
                           positive='trailing edge down', travel='not set (no source yet)', source='R12 (measured)')
attach(elevator, hinges['elevator'])


def line_at(pts, z):
    """Station on the straight line through two (height, station) points, at height z."""
    (z0, s0), (z1, s1) = pts
    return s0 + (s1 - s0) * (z - z0) / (z1 - z0)


def fin_le(z):
    if z >= FIN_FILLET[1][0]:
        return line_at(FIN_LE_LINE, z)
    return line_at(FIN_FILLET, max(z, FIN_FILLET[0][0]))  # the dorsal fillet; below the fuselage's top, held


def fin_te(z):
    return FIN_TE_ROOT_FT + (LENGTH_FT - FIN_TE_ROOT_FT) * (z - FIN_ROOT_Z_FT) / (FIN_TOP_Z - FIN_ROOT_Z_FT)


def fin_ring(z, a, b):
    le = fin_le(z)
    c = fin_te(z) - le
    return [(X(le + x * c), zc * c, z) for x, zc in foil(a, b, min(FIN_THICKNESS, 0.48 / c))]


def rudder_frac(z):
    return (line_at(RUDDER_HINGE_LINE, z) - fin_le(z)) / (fin_te(z) - fin_le(z))


FIN_ZS = sorted(set(steps(FIN_ROOT_Z_FT, FIN_TOP_Z, 0.25)) | {FIN_FILLET[0][0], FIN_FILLET[1][0]})
part('fin', 'airframe', lambda bm: loft(bm, [fin_ring(z, 0, rudder_frac(z)) for z in FIN_ZS]))
rudder = part('rudder', 'surface', lambda bm: loft(bm, [fin_ring(z, rudder_frac(z), 1) for z in FIN_ZS]))
r0 = Vector((X(line_at(RUDDER_HINGE_LINE, FIN_ROOT_Z_FT)), 0, FIN_ROOT_Z_FT))
r1 = Vector((X(line_at(RUDDER_HINGE_LINE, FIN_TOP_Z)), 0, FIN_TOP_Z))
hinges['rudder'] = empty('rudderHinge', (r0 + r1) / 2, aligned(r1 - r0, (0, 0, 1)),
                         positive='trailing edge right', travel='not set (no source yet)', source='R14 (measured)')
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
                  travel='not set (no source yet)', source='R15 (wheel, measured), E24 (pivot, estimate)')
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
                   travel='not set (no source yet)', source='R16 (wheel, measured), E25 (pivot, estimate)')
attach(part('gearNoseLeg', 'gear', nose_leg), nose_hinge)
attach(part('gearNoseWheel', 'tyre', lambda bm: wheel(bm, nose_axle, NOSE_WHEEL_DIA_FT, NOSE_WHEEL_WIDTH_FT)), nose_hinge)

# ---------- RCAF paint (constants above; rows D7a to D7p) ----------
import numpy as np  # noqa: E402  (the bpy module needs it, so it is always there)

TMP_DIR = tempfile.mkdtemp()
SS = 2  # the textures are drawn at twice the size and averaged down, for smooth edges


def glyph_triangles(text):
    """The text's outline as triangles (list of 3 points, unit height-ish), centred, from Blender's built-in font."""
    cu = bpy.data.curves.new('glyphs', 'FONT')
    cu.body = text
    cu.align_x = 'CENTER'
    ob = bpy.data.objects.new('glyphs', cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new()
    bm.from_mesh(ev.to_mesh())
    bmesh.ops.triangulate(bm, faces=bm.faces)
    tris = np.array([[(v.co.x, v.co.y) for v in f.verts] for f in bm.faces])
    bm.free()
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    lo, hi = tris.reshape(-1, 2).min(0), tris.reshape(-1, 2).max(0)
    return (tris - (lo + hi) / 2) / (hi[0] - lo[0])  # width 1


def fill_triangles(mask, tris):
    h, w = mask.shape
    for t in tris:
        x0, x1 = max(int(t[:, 0].min()), 0), min(int(t[:, 0].max()) + 2, w)
        y0, y1 = max(int(t[:, 1].min()), 0), min(int(t[:, 1].max()) + 2, h)
        if x1 <= x0 or y1 <= y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        mask[y0:y1, x0:x1] |= (l1 >= 0) & (l2 >= 0) & (1 - l1 - l2 >= 0)


def leaf(r, a, size):
    """A stand-in for the maple leaf: an 11-lobed star, not the real artwork."""
    return r <= size * (0.5 + 0.5 * np.abs(np.cos(5.5 * a)))


def draw_mark(canvas, m, cx, cy, px):
    """Draws one marking into the canvas (rows from the bottom), centred at pixel (cx, cy), px pixels per foot."""
    h, w, _ = canvas.shape
    rgb = lambda k: np.array(PAINT_RGB[k]) / 255  # noqa: E731
    if m['kind'] == 'text':
        mask = np.zeros((h, w), bool)
        fill_triangles(mask, glyph_triangles(m['text']) * m['width'] * px + np.array([cx, cy]))
        canvas[mask] = rgb(m['colour'])
        return
    xs, ys = (np.arange(w) + 0.5 - cx) / px, (np.arange(h) + 0.5 - cy) / px
    X_, Y_ = np.meshgrid(xs, ys)
    if m['kind'] == 'roundel':  # D7g: simple rings, white edge, navy ring, white disc, red leaf; not the real artwork
        r = np.hypot(X_, Y_) / (m['diameter'] / 2)
        a = np.arctan2(Y_, X_)
        for limit, colour in ((1.0, 'white'), (0.90, 'navy'), (0.60, 'white')):
            canvas[r <= limit] = rgb(colour)
        canvas[leaf(r, a, 0.45)] = rgb('red')
    elif m['kind'] == 'flag':  # D7f, D7h: red, white, red bands (1:2:1) and an 11-lobed leaf; geometric stand-in
        inside = (np.abs(X_) <= m['width'] / 2) & (np.abs(Y_) <= m['height'] / 2)
        canvas[inside] = rgb('white')
        canvas[inside & (np.abs(X_) > m['width'] / 4)] = rgb('red')
        r = np.hypot(X_, Y_) / (m['height'] / 2)
        canvas[inside & leaf(r, np.arctan2(Y_, X_), 0.48)] = rgb('red')


def edge_distance(S, Z, path):
    """Distance from each point to the polyline, positive on the left of its travel (the yellow side of NAVY_EDGE)."""
    best, sign = np.full(S.shape, 1e9), np.ones(S.shape)
    for (ax, ay), (bx, by) in zip(path, path[1:]):
        dx, dy = bx - ax, by - ay
        t = np.clip(((S - ax) * dx + (Z - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.hypot(S - (ax + t * dx), Z - (ay + t * dy))
        near = d < best
        best = np.where(near, d, best)
        sign = np.where(near, np.where(dx * (Z - ay) - dy * (S - ax) < 0, -1.0, 1.0), sign)
    return best * sign


def fuselage_base(S, Z):
    d = edge_distance(S, Z, NAVY_EDGE)
    col = np.empty(S.shape + (3,))
    col[:] = np.array(PAINT_RGB['yellow']) / 255
    col[d < 0] = np.array(PAINT_RGB['navy']) / 255
    start = 0.0
    for width, name in STRIPE_BANDS:
        col[(d >= start) & (d < start + width)] = np.array(PAINT_RGB[name]) / 255
        start += width
    return col


def plain_base(S, Z):
    col = np.empty(S.shape + (3,))
    col[:] = np.array(PAINT_RGB['yellow']) / 255
    return col


def make_image(name, panels):
    """panels: list of float arrays (rows from the bottom, columns, 3), stacked bottom to top into one picture."""
    pix = np.concatenate(panels, 0)
    img = bpy.data.images.new(name, pix.shape[1], pix.shape[0], alpha=False)
    rgba = np.ones(pix.shape[:2] + (4,), np.float32)
    rgba[..., :3] = pix
    img.pixels.foreach_set(rgba.ravel())
    # A generated picture is lost when the file is saved, so write it out once, load that and pack it into the .blend
    tmp = os.path.join(TMP_DIR, name + '.png')
    img.filepath_raw = tmp
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    packed = bpy.data.images.load(tmp)
    packed.pack()  # the file stays until the script ends: saving packs from it again
    return packed


def down(canvas):
    h, w, c = canvas.shape
    return canvas.reshape(h // SS, SS, w // SS, SS, c).mean((1, 3))


def side_texture(name, s0, s1, z0, z1, ppf, base, marks):
    """Two panels, one per side: the left's station runs to the right, the right's to the left, so lettering reads
    correctly from either side (the right side is taken as the left's mirror, E)."""
    w, h = round((s1 - s0) * ppf), round((z1 - z0) * ppf)
    panels = []
    for side in (0, 1):
        cols, rows = (np.arange(w * SS) + 0.5) / (ppf * SS), (np.arange(h * SS) + 0.5) / (ppf * SS)
        S, Z = np.meshgrid(s0 + cols if side == 0 else s1 - cols, z0 + rows)
        canvas = base(S, Z)
        for m in marks:
            cx = (m['s'] - s0 if side == 0 else s1 - m['s']) * ppf * SS
            draw_mark(canvas, m, cx, (m['z'] - z0) * ppf * SS, ppf * SS)
        panels.append(down(canvas))
    return make_image(name, panels)


def top_texture(name, s0, s1, y0, y1, ppf, le_fn, chord_fn, silver, marks=()):
    """One picture of a wing or tailplane seen from above: station along u, span along v. A silver band at the leading edge."""
    w, h = round((s1 - s0) * ppf), round((y1 - y0) * ppf)
    cols, rows = (np.arange(w * SS) + 0.5) / (ppf * SS), (np.arange(h * SS) + 0.5) / (ppf * SS)
    S, Y = np.meshgrid(s0 + cols, y0 + rows)
    canvas = plain_base(S, Y)
    canvas[S < le_fn(Y) + silver * chord_fn(Y)] = np.array(PAINT_RGB['silver']) / 255
    for m in marks:
        draw_mark(canvas, m, (m['s'] - s0) * ppf * SS, (m['y'] - y0) * ppf * SS, ppf * SS)
    return down(canvas)


def textured(name, img):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'EXTEND'
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.3
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def set_uv(obj, fn):
    me = obj.data
    uv = me.uv_layers.new(name='paint')
    for p in me.polygons:
        cos = [me.vertices[me.loops[i].vertex_index].co for i in p.loop_indices]
        left = sum(c.y for c in cos) >= 0
        for i, c in zip(p.loop_indices, cos):
            uv.data[i].uv = fn(c, left)


def paint_side(names, img, s0, s1, z0, z1):
    for name in names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(textured(f'paint_{name}', img))
        set_uv(obj, lambda c, left: (((-c.x - s0) if left else (s1 + c.x)) / (s1 - s0),
                                     ((c.z - z0) / (z1 - z0) + (0 if left else 1)) / 2))


def paint_top(names, top_img, bottom_img, s0, s1, y0, y1):
    for name in names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(textured(f'paint_{name}_top', top_img))
        obj.data.materials.append(textured(f'paint_{name}_bottom', bottom_img))
        set_uv(obj, lambda c, left: ((-c.x - s0) / (s1 - s0), (c.y - y0) / (y1 - y0)))
        for p in obj.data.polygons:
            p.material_index = 0 if p.normal.z >= 0 else 1


# Fuselage and cowl: stations 0 to 26 ft, heights -2.4 to 1.6 ft (D7b to D7g); the fin: its own picture (D7h).
FUS_PICTURE = (0.0, 26.0, -2.4, 1.6)
fuse_marks = [m for m in MARKS if m['on'] == 'fuselage']
fin_marks = [m for m in MARKS if m['on'] == 'fin']
paint_side(['cowl', 'fuselage'], side_texture('paintFuselage', *FUS_PICTURE, 80, fuselage_base, fuse_marks), *FUS_PICTURE)
FIN_PICTURE = (22.0, 28.0, -1.1, 4.7)
paint_side(['fin'], side_texture('paintFin', *FIN_PICTURE, 100, plain_base, fin_marks), *FIN_PICTURE)


def np_wing_le(y):
    return WING_LE_FT[0] + (WING_LE_FT[1] - WING_LE_FT[0]) * np.abs(y) / WING_REF_OUT_FT


def np_wing_chord(y):
    return WING_TE_FT[0] + (WING_TE_FT[1] - WING_TE_FT[0]) * np.abs(y) / WING_REF_OUT_FT - np_wing_le(y)


# Wings: stations 7.8 to 14.2 ft, out to 17.2 ft each side; the roundel on the upper surfaces only (D7i, estimate)
WING_PICTURE = (7.8, 14.2, -17.2, 17.2)
roundel_s = lambda out: WING_LE_FT[0] + (WING_LE_FT[1] - WING_LE_FT[0]) * out / WING_REF_OUT_FT \
    + WING_ROUNDEL_FT['chord_fraction'] * (WING_TE_FT[0] + (WING_TE_FT[1] - WING_TE_FT[0]) * out / WING_REF_OUT_FT
                                           - WING_LE_FT[0] - (WING_LE_FT[1] - WING_LE_FT[0]) * out / WING_REF_OUT_FT)  # noqa: E731
wing_marks = [dict(kind='roundel', s=roundel_s(WING_ROUNDEL_FT['out']), y=sgn * WING_ROUNDEL_FT['out'],
                   diameter=WING_ROUNDEL_FT['diameter']) for sgn in (1, -1)]
args = (*WING_PICTURE[:2], *WING_PICTURE[2:], 64, np_wing_le, np_wing_chord, WING_LE_SILVER)
paint_top(['wingLeft', 'wingRight'], make_image('paintWingTop', [top_texture('a', *args, marks=wing_marks)]),
          make_image('paintWingBottom', [top_texture('b', *args)]), *WING_PICTURE)
# Tailplane: stations 21 to 24.3 ft, out to 6.3 ft each side (D7d)
TAIL_PICTURE = (21.0, 24.3, -6.3, 6.3)
tail_le = lambda y: TAIL_LE_FT[0] + (TAIL_LE_FT[1] - TAIL_LE_FT[0]) * np.abs(y) / TAIL_HALF_SPAN_FT  # noqa: E731
tail_args = (*TAIL_PICTURE[:2], *TAIL_PICTURE[2:], 64, tail_le, lambda y: TAIL_TE_FT - tail_le(y), TAIL_LE_SILVER)
tail_img = make_image('paintTail', [top_texture('t', *tail_args)])
paint_top(['tailplane'], tail_img, tail_img, *TAIL_PICTURE)
# The canopy's frames and the flaps, ailerons, elevator and rudder are plain yellow; the spinner is navy; the blades dark.

# Small shapes: red wheel hubs (D7k) and the white lights under the winglets' roots (D7j, size and place estimated)
for side, lr in ((1, 'Left'), (-1, 'Right')):
    for kind, wheel_obj, width in (('Main', f'gearMain{lr}Wheel', MAIN_WHEEL_WIDTH_FT), ('Nose', 'gearNoseWheel', NOSE_WHEEL_WIDTH_FT)):
        if kind == 'Nose' and lr == 'Right':
            continue
        w_obj = bpy.data.objects[wheel_obj]
        hub_dia = (MAIN_WHEEL_DIA_FT if kind == 'Main' else NOSE_WHEEL_DIA_FT) * HUB_FRACTION
        # the wheel's mesh is drawn in world coordinates, so its centre is the average of its points
        verts = [w_obj.matrix_world @ v.co for v in w_obj.data.vertices]
        centre = sum(verts, Vector()) / len(verts)

        def hub(bm, c=centre, wd=width, d=hub_dia):
            for sgn in (1, -1):
                cylinder(bm, c + Vector((0, sgn * (wd / 2 - 0.002), 0)), c + Vector((0, sgn * (wd / 2 + 0.012), 0)), d / 2, seg=32)

        h_obj = part(f'hub{kind}{lr}' if kind == 'Main' else 'hubNose', 'red', hub)
        h_obj.parent = w_obj.parent
        h_obj.matrix_parent_inverse = w_obj.matrix_parent_inverse
    LT = TIP_LIGHT
    ls = LT['station']

    def light(bm, rx, ry, rz, at):
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz)) + at

    at = Vector((X(ls), side * LT['out'], wing_z(LT['out']) - LT['below']))
    part(f'tipLightRim{lr}', 'navy', lambda bm, a=at: light(bm, LT['length'] / 2 + 0.04, LT['width'] / 2 + 0.04, LT['depth'] / 2, a))
    part(f'tipLight{lr}', 'white', lambda bm, a=at: light(bm, LT['length'] / 2, LT['width'] / 2, LT['depth'] / 2 + 0.07, a))

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
wing_area = WING_TIP_FT * (chord(0) + chord(WING_TIP_FT))           # to the winglet roots, through the fuselage
wing_area_full = SPAN_FT / 2 * (chord(0) + chord(SPAN_FT / 2))      # the same lines carried out to the full span


def check(what, got, ref, src):
    print(f'  {what:<10} {got:7.2f} ft   {src} {ref:7.2f} ft   difference {got - ref:+.2f} ft ({(got - ref) * 12:+.1f} in)')


print('size checks (model, ft):')
for what, got, rcaf, easa in (('length', size.x, RCAF_LENGTH_FT, LENGTH_FT), ('span', size.y, RCAF_SPAN_FT, SPAN_FT),
                              ('height', size.z, RCAF_HEIGHT_FT, HEIGHT_FT)):
    check(what, got, rcaf, 'RCAF page (P1)    ')
    check('', got, easa, 'EASA sheet (P2)   ')
for what, a in (('to the winglet roots', wing_area), ('carried to the full span', wing_area_full)):
    print(f'  wing area  {a:7.1f} ft2  EASA sheet (P2) {WING_AREA_FT2:7.1f} ft2  difference {a - WING_AREA_FT2:+.1f} ft2 '
          f'(trapezoid {what}, through the fuselage)')
print(f'  wing panel tip {WING_TIP_FT:.2f} ft out (from the span and winglet), measured winglet root {WING_REF_OUT_FT:.2f} ft (R7)')
print(f'  prop tip to ground {AXIS_HEIGHT_FT - PROP_RADIUS_FT:.2f} ft (R1 with P2a)')
print('named points (ft: forward +X from the spinner tip, left +Y, up +Z from the prop axis):')
for o in sorted((o for o in bpy.data.objects if o.type == 'EMPTY'), key=lambda o: o.name):
    axis = f"  axis {tuple(o['axis'])}, positive {o['positive']}" if 'axis' in o else ''
    print(f'  {o.name:<20} {tuple(round(c, 2) for c in o.location)}{axis}')

os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('saved', OUT_BLEND)

if not RENDER_DIR:
    shutil.rmtree(TMP_DIR, ignore_errors=True)  # the pictures are packed in the saved master
    sys.exit(0)

# ---------- full renders from the saved master ----------
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

# The same side view from the photo's own camera (PHOTO_CAM), over a plain floor, to set beside the photo (D7a).
pc = PHOTO_CAM
cy_, sy_, cp_, sp_, cr_, sr_ = (f(a) for a in (pc['yaw'], pc['pitch'], pc['roll']) for f in (math.cos, math.sin))
Rz = Matrix(((cy_, -sy_, 0), (sy_, cy_, 0), (0, 0, 1)))
Rx = Matrix(((1, 0, 0), (0, cp_, -sp_), (0, sp_, cp_)))
Ry = Matrix(((cr_, 0, sr_), (0, 1, 0), (-sr_, 0, cr_)))
Rm = Rz @ Rx @ Ry
cam.data.type = 'PERSP'
cam.data.sensor_fit = 'HORIZONTAL'
cam.data.sensor_width = 36
cam.data.lens = pc['f_px'] * 36 / pc['size'][0]
cam.matrix_world = Matrix.Translation(pc['pos']) @ Matrix((Rm.col[0], Rm.col[2], -Rm.col[1])).transposed().to_4x4()
floor = bpy.data.objects.new('floor', bpy.data.meshes.new('floor'))
bmf = bmesh.new()
bmf.faces.new([bmf.verts.new((a * 80, b * 80, GROUND_Z)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
bmf.to_mesh(floor.data)
bmf.free()
fm = bpy.data.materials.new('floor')
fm.diffuse_color = (0.45, 0.45, 0.46, 1)
floor.data.materials.append(fm)
scene.collection.objects.link(floor)
for o in grids.values():
    o.hide_render = True
scene.render.resolution_x, scene.render.resolution_y = pc['size']
scene.render.filepath = os.path.join(RENDER_DIR, 'ct102b-photo-angle.png')
bpy.ops.render.render(write_still=True)
print('render', scene.render.filepath)
shutil.rmtree(TMP_DIR, ignore_errors=True)
