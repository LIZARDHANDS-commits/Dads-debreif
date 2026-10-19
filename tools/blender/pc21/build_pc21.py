# Builds the CT-157 Siskin II's outside (Pilatus PC-21) as a Blender master file, first pass with the RCAF paint of 201
# (shared plan Step 3f items 1, 2 and 5, docs/modules/shared/pc21-plan.md; proposed, built ahead of Patrick's yes, Dad
# 17 to 18 Oct 2026). Runs headless, with Blender 5.2 or the bpy module:
#
#   blender -b --factory-startup -P tools/blender/pc21/build_pc21.py -- <out>/pc21.blend [<render dir>]
#   <venv>/bin/python tools/blender/pc21/build_pc21.py -- <out>/pc21.blend [<render dir>]
#
# Every number is in the constants block below and names its row in sources.md: S = printed on the Pilatus three-view Dad
# sent (18 Oct 2026), R = measured off that drawing, each view at its own printed size, D = read off Dad's renders of the
# RCAF CT-157 201 by eye, E = an estimate. The drawings and renders are references only: none is copied into the repo.
#
# Axes and units are the CT-156 scripts' and the Astra's (build_ct102b.py): real feet, nose +X, left +Y, up +Z from the
# propeller's axis. The origin is the spinner's tip, so a part's station (feet behind the tip) is -X. Parts are
# smooth-shaded with a hard edge where faces meet at more than SHARP_DEG.
#
# The paint is one block of colours, boundaries and markings in the constants, drawn into small generated pictures and
# applied by position (the Astra's way). The roundels, flags and leaf are simple geometric stand-ins and the lettering is
# Blender's built-in face, so no artwork is copied. With a render directory, the saved master is opened again and the
# renders are made: both quarters, below, and square-on side, front and top over a 1 ft grid.
import math
import os
import shutil
import sys
import tempfile

import bpy  # first: with the bpy module, bmesh exists only once bpy is loaded
import bmesh  # noqa: E402
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    sys.exit('usage: build_pc21.py -- <out.blend> [<render dir>]')
OUT_BLEND = os.path.abspath(argv[0])
RENDER_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None

IN = 1 / 12

# ---------- the numbers (each names its row in sources.md) ----------
# Printed sizes (S1, the Pilatus three-view)
LENGTH_FT = 36 + 10 * IN            # S1: 36 ft 10 in (11.22 m), spinner tip to tail cone
SPAN_FT = 29 + 11 * IN              # S1: 29 ft 11 in (9.11 m)
HEIGHT_FT = 12 + 4 * IN             # S1: 12 ft 4 in (3.75 m) "typical". The drawing's own views measure about 13 ft 4 in
#                                     (R16): the build takes the printed figure by drawing the fin shorter (FIN_SCALE)
WING_AREA_FT2 = 163.85              # S1
PROP_DIAMETER_FT = 7 + 10 * IN      # S1: 7 ft 10 in (2.39 m)
PROP_BLADES = 5                     # S1 (the head-on and side views) and D1 (the renders)
TRACK_FT = 8 + 10 * IN              # S1: 8 ft 10 in (2.69 m), main wheels
WHEELBASE_FT = 7 + 11 * IN          # S1: 7 ft 11 in (2.41 m)
TAIL_SPAN_FT = 13 + 2 * IN          # S1: 13 ft 2 in (4.00 m)
FUSELAGE_WIDTH_FT = 3 + 3 * IN      # S1: 3 ft 3 in (1.00 m), at the wing's trailing edge

# Propeller axis and spinner (R1, R2)
AXIS_HEIGHT_FT = 4.72               # R1: side view at its length's scale (front view 4.80); prop tip 0.81 ft off the ground
PROP_STATION_FT = 2.26              # R2: the blades' plane, side view
SPINNER = [(0.02, 0.04), (0.5, 0.36), (1.0, 0.55), (1.5, 0.70), (2.0, 0.80), (2.5, 0.88), (2.75, 0.90)]  # R2 (station, radius)
BLADE_ROOT_FT = 0.70                # E1 estimate: where the blade leaves the spinner
BLADE_CHORD_FT = (0.55, 0.36)       # R2 root, tip (side view, about 0.5 to 0.6 ft wide), tip rounded
BLADE_ANGLE_DEG = (48, 18)          # E2 estimate: root, tip, from the disc's plane
BLADE_TIP_COLOUR_FT = 0.0           # D1: the renders show the blades dark to the tip

# Fuselage stations (R3 half-widths from the top view at 23.1 px/ft, R4 top and bottom from the side view at 23.2 px/ft):
# station ft, half-width ft, top ft, bottom ft (heights above the axis). Under the canopy the top is a deck hidden inside
# the bubble (sill + CANOPY_DECK). Behind the canopy the top is the spine fairing down to the fin, the bottom the upswept
# belly to the tail cone's tip, which sits high (R4).
CANOPY_DECK = 0.45                  # E3 estimate: so the bubble's base is as wide as the top view's canopy (R5)
FUSELAGE = [
    (2.70, 0.90, 0.95, -0.90),
    (3.00, 0.95, 1.03, -0.98),
    (3.50, 1.04, 1.12, -1.50),
    (4.00, 1.12, 1.21, -1.70),
    (4.50, 1.20, 1.29, -1.77),
    (5.00, 1.28, 1.38, -1.81),
    (6.00, 1.43, 1.55, -1.81),
    (7.00, 1.56, 1.68, -1.81),
    (8.00, 1.59, 1.85, -1.81),
    (9.00, 1.61, 1.98, -1.81),
    (9.50, 1.62, 2.07, -1.81),
    (10.8, 1.625, 1.68 + CANOPY_DECK, -1.81),
    (12.0, 1.625, 1.85 + CANOPY_DECK, -1.80),
    (14.0, 1.625, 2.13 + CANOPY_DECK, -1.82),
    (16.0, 1.625, 2.41 + CANOPY_DECK, -1.76),
    (18.0, 1.625, 2.69 + CANOPY_DECK, -1.68),
    (19.0, 1.625, 2.83 + CANOPY_DECK, -1.60),
    (20.0, 1.61, 2.97 + CANOPY_DECK, -1.45),
    (21.0, 1.60, 3.80, -1.25),
    (21.5, 1.57, 4.05, -1.16),
    (22.0, 1.56, 3.88, -1.08),
    (23.0, 1.47, 3.75, -0.90),
    (24.0, 1.38, 3.66, -0.70),
    (25.0, 1.30, 3.55, -0.50),
    (26.0, 1.21, 3.42, -0.34),
    (27.0, 1.12, 3.30, -0.17),
    (28.0, 1.00, 3.18, 0.00),
    (30.0, 0.85, 2.95, 0.15),
    (32.0, 0.70, 2.72, 0.30),
    (34.0, 0.50, 2.48, 0.50),
    (35.0, 0.38, 2.40, 0.80),
    (36.0, 0.22, 2.26, 1.40),
    (LENGTH_FT - 0.03, 0.04, 2.05, 1.90),
]
COWL_END_FT = 9.5                   # R5: the cowl ends at the windshield's foot
SECTION_POWER = 2.5                 # E4 estimate: superellipse power of the fuselage's sections

# Exhaust stacks either side of the nose (R6: side view oval at 3.2 to 5.2 ft, about level with the axis; top view out to
# 2.33 ft at 4.5 ft, curving aft): a bent pipe from the cowl's side, out and back. Points (station, out, height), radius.
EXHAUST_PATH = [(3.30, 0.95, 0.05), (3.55, 1.55, 0.06), (3.95, 1.98, 0.04), (4.50, 2.18, 0.00), (5.10, 2.22, -0.05)]
EXHAUST_RADIUS_FT = (0.30, 0.26)    # R6 (the side view's oval is about 0.9 ft tall); E for the taper

# Canopy (R5): station ft, sill height ft, top height ft (above the axis). One piece from the windshield's foot (9.5 ft)
# to its aft end (21.3 ft); the sill rises aft (side view); the frame between the seats (R5a) is the yellow arch.
CANOPY = [
    (9.50, 2.07, 2.08),
    (9.80, 1.92, 2.25),
    (10.2, 1.78, 2.55),
    (10.8, 1.68, 2.95),
    (11.5, 1.75, 3.27),
    (12.0, 1.85, 3.53),
    (13.0, 1.99, 3.92),
    (14.0, 2.13, 4.26),
    (15.0, 2.27, 4.48),
    (16.0, 2.41, 4.65),
    (17.0, 2.55, 4.74),
    (18.0, 2.69, 4.74),
    (19.0, 2.83, 4.65),
    (20.0, 2.97, 4.44),
    (20.6, 3.07, 4.28),
    (21.0, 3.30, 4.16),
    (21.3, 3.75, 4.07),
]
CANOPY_ARCH_FT = (15.45, 15.85)     # R5a: the frame between the seats (side view's double line, top view 15.4 to 16.1)
CANOPY_SECTION_POWER = 3.0          # E5 estimate: the head-on view's canopy is rounded, a little flatter than a circle

# Wing (R7 planform off the top view, R8 heights and dihedral off the head-on view; span S1, area check S1).
WING_LE = (11.31, 0.250)            # R7: leading-edge station at the centreline, and its sweep (station per foot out), 14 deg
WING_TE = (18.97, -0.036)           # R7: trailing-edge station at the centreline, and its slope (nearly straight across)
WING_TE_KINK = (2.40, 19.70)        # R7: inboard of 2.4 ft out the trailing edge kinks aft to 19.7 ft at 1.4 ft out (root fillet)
WING_TIP_ROUND_FT = 14.20           # R7: outboard of this the leading edge rounds back into the tip
WING_ROOT_Z_FT = -1.38              # R8: chord line at the centreline, below the axis (low wing)
WING_DIHEDRAL_DEG = 4.0             # R8: head-on view, the chord line from 2.7 to 13.4 ft out
WING_TIP_UP = (13.90, 15.0)         # R8: the tip bends up outboard of 13.9 ft out, to 15 deg of dihedral (head-on view)
WING_THICKNESS = (0.135, 0.13)      # R8 root, tip (head-on view: 1.0 ft at the root, 0.48 ft near the tip)
WING_CAMBER = 0.02                  # E6 estimate
FLAP_SPAN_FT = (2.40, 8.30)         # R9 out from the centreline (top view's lines)
AILERON_SPAN_FT = (8.40, 13.90)     # R9
FLAP_HINGE_CHORD = 0.75             # R9: flaps are the aft 25 percent
AILERON_HINGE_CHORD = 0.73          # R9: ailerons the aft 27 percent

# Tailplane (R10 planform, R11 height), fin and rudder (R12, R13). Tailplane span S1.
TAIL_LE = (31.78, 0.278)            # R10: leading-edge station at the centreline and its sweep, 15.5 deg
TAIL_TE = (36.00, -0.030)           # R10: trailing edge, nearly straight across
TAIL_TIP_ROUND_FT = 6.0             # R10: outboard of this the leading edge rounds into the tip
TAIL_Z_FT = 1.90                    # R11: head-on 1.86, side view 1.94
TAIL_DIHEDRAL_DEG = 1.0             # E7 estimate: the drawing shows it about level; Dad's brief says "slight dihedral"
TAIL_THICKNESS = 0.10               # E8
ELEVATOR_HINGE_FT = 34.90           # R10: straight across (top view's line)
# The fin as drawn (side view, heights above the axis); FIN_SCALE then lowers everything above FIN_SCALE_BASE so the fin's
# top is the printed height (R16).
FIN_FILLET = ((3.62, 24.5), (4.45, 29.8))   # R12: the dorsal fillet's leading edge (height, station)
FIN_LE_LINE = ((4.45, 29.8), (8.06, 31.73))  # R12: the fin's leading edge, about 28 deg back from upright
FIN_TOP_DRAWN = 8.66                # R12: the flat top, side view
FIN_TOP_ROUND = (31.73, 32.60)      # R12: the leading edge rounds into the flat top between these stations
FIN_TE_FT = 34.60                   # R12: the rudder's trailing edge, upright
FIN_ROOT_Z_FT = 2.00                # E9: the fin is built down into the fuselage from here
FIN_THICKNESS = 0.11                # E10
RUDDER_HINGE_LINE = ((7.07, 33.07), (2.76, 32.42))  # R13 two points (height, station), as drawn
FIN_SCALE_BASE = 3.0                # E11: heights above this are scaled; the fuselage's top under the fin is about here

# Ventral strakes under the rear fuselage (R14: the side view's small fins at 23.5 to 25.5 ft; the underside view's pair)
STRAKE = dict(s0=23.2, s1=26.8, out=0.55, depth=0.55, cant_deg=35, thick=0.05)  # R14 place; E12 size and cant

# Gear, down (S1 track and wheelbase; R15 wheels and legs). Tricycle, retractable.
NOSE_STATION_FT = 7.73              # R15: drawn at 7.54 and the mains at 15.83; the printed wheelbase is centred on them
MAIN_STATION_FT = NOSE_STATION_FT + WHEELBASE_FT
MAIN_WHEEL_OUT_FT = TRACK_FT / 2
MAIN_WHEEL_DIA_FT, MAIN_WHEEL_WIDTH_FT = 1.90, 0.60  # R15
NOSE_WHEEL_DIA_FT, NOSE_WHEEL_WIDTH_FT = 1.64, 0.48  # R15
MAIN_PIVOT_OUT_FT = MAIN_WHEEL_OUT_FT + 0.25  # E13: the leg's top under the wing, just outboard of the wheel (head-on)
NOSE_PIVOT_Z_FT = -1.55             # E14 inside the cowl
MAIN_LEG_RADIUS_FT, NOSE_LEG_RADIUS_FT = 0.14, 0.12  # E15

# Named points
EYE_FRONT = (14.3, 0.0, 3.25)       # E16 estimate: front seat's eye, under the canopy, from the renders' pilots
EYE_REAR = (18.3, 0.0, 3.65)        # E16 estimate: rear seat raised (stepped tandem seating, the side drawing)

SHARP_DEG = 40  # as build_ct156_exterior.py: faces meeting at more than this keep a hard edge

# ---------- RCAF paint of 201 (Dad's renders, 18 Oct 2026; rows D in sources.md, all by eye, estimates) ----------
PAINT_RGB = {
    'yellow': (250, 196, 30), 'navy': (24, 27, 46), 'red': (210, 30, 40), 'white': (240, 240, 240),
    'tyre': (30, 32, 36), 'grey': (150, 152, 158), 'prop': (24, 24, 28), 'exhaust': (150, 122, 92),
    'canopy': (52, 70, 88), 'black': (20, 20, 22),
}
# D2: the stripe's yellow edge on the fuselage's side (station, height): yellow above and ahead of it, navy below and behind.
# It starts low on the nose behind the spinner, runs aft under the canopy rising gently, and sweeps up over the top just
# behind the canopy. It runs off the top (height 6) so the line has no end cap.
STRIPE_EDGE = [(2.60, -0.80), (5.0, -0.52), (8.0, -0.20), (11.0, 0.18), (14.0, 0.58), (17.0, 1.00), (19.0, 1.38),
               (20.2, 1.85), (20.9, 2.60), (21.4, 3.50), (21.8, 4.40), (22.0, 6.0)]
# D3: from the yellow edge toward the navy: white, red, white; widths in ft
STRIPE_BANDS = ((0.06, 'white'), (0.28, 'red'), (0.06, 'white'))
# D4 markings: on = part; s, z = centre (station ft, height ft above the axis); size in ft. Text is Blender's built-in face.
MARKS = [
    dict(on='fuselage', kind='text', text='201', s=8.0, z=0.55, width=1.15, colour='navy'),           # D4a
    dict(on='fuselage', kind='bar', s=6.4, z=1.30, width=1.10, height=0.13, colour='white'),          # D4b: the white bar ahead
    dict(on='fuselage', kind='triangle', s=12.6, z=1.78, size=0.42),                                  # D4c: rescue triangles
    dict(on='fuselage', kind='triangle', s=18.6, z=2.50, size=0.42),
    dict(on='fuselage', kind='text', text='Canada', s=15.9, z=1.30, width=1.90, colour='navy', group=16.08),  # D4d
    dict(on='fuselage', kind='flag', s=17.05, z=1.62, width=0.32, height=0.16, group=16.08),        # D4d: the small flag
    dict(on='fuselage', kind='text', text='RCAF', s=23.25, z=1.95, width=1.25, colour='white', group=24.5),  # D4e
    dict(on='fuselage', kind='roundel', s=24.55, z=1.98, diameter=0.95, group=24.5),                # D4e
    dict(on='fuselage', kind='text', text='ARC', s=25.70, z=1.95, width=0.95, colour='white', group=24.5),   # D4e
    dict(on='fuselage', kind='bar', s=24.5, z=1.30, width=3.60, height=0.10, colour='white'),       # D4e: the bar under it
    dict(on='fin', kind='flag', s=32.05, z=5.25, width=0.90, height=0.45),                          # D4f (drawn heights)
    dict(on='fin', kind='text', text='157201', s=32.05, z=4.66, width=0.85, colour='white'),        # D4f
]
# A mark with a `group` is one of a block of words read left to right from either side (D4d, D4e: on the right side the
# renders show RCAF aft and ARC forward): on the right side its station is mirrored about the group's middle.
# D5: the wings' top: yellow forward and outboard of a straight stripe from the root to the trailing edge, navy inboard and
# behind it. The stripe's yellow edge: from (station, out) at the root to the trailing edge at WING_STRIPE_OUT.
WING_STRIPE = ((14.7, 1.66), 10.0)   # D5: root point (45 percent of the root chord), and where it meets the trailing edge
WING_MARKS_TOP = [
    dict(kind='roundel', s=14.6, y=10.6, diameter=1.70),                                     # D5a: left wing, near the tip
    dict(kind='text', text='201', s=15.6, y=-10.6, width=1.50, colour='navy', spanwise=True),  # D5b: right wing
]
WING_TIP_YELLOW_BELOW_FT = 13.2      # D6: underside navy with yellow tips outboard of this
TAIL_TIP_YELLOW_BELOW_FT = 5.6       # D6: the tailplane's underside likewise

# ---------- worked out from the numbers above ----------
GROUND_Z = -AXIS_HEIGHT_FT
FIN_TOP_Z = HEIGHT_FT - AXIS_HEIGHT_FT
FIN_SCALE = (FIN_TOP_Z - FIN_SCALE_BASE) / (FIN_TOP_DRAWN - FIN_SCALE_BASE)
PROP_RADIUS_FT = PROP_DIAMETER_FT / 2


def X(station):
    return -station


def fin_z(z_drawn):
    """A height on the drawn fin, lowered so the fin's top is the printed height (R16)."""
    return z_drawn if z_drawn <= FIN_SCALE_BASE else FIN_SCALE_BASE + (z_drawn - FIN_SCALE_BASE) * FIN_SCALE


def fin_z_drawn(z):
    return z if z <= FIN_SCALE_BASE else FIN_SCALE_BASE + (z - FIN_SCALE_BASE) / FIN_SCALE


# ---------- shapes (the helpers are the Astra's and the T-38's) ----------
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


N_FOIL = 16  # points along each surface


def foil(a, b, t, m=0.0):
    """Closed loop of (chord fraction, z / chord) between chord fractions a and b: upper surface b to a, lower a to b."""
    xs = [a + (b - a) * (1 - math.cos(math.pi * i / (N_FOIL - 1))) / 2 for i in range(N_FOIL)]
    upper = [(x, naca(x, t, m)[0]) for x in reversed(xs)]
    lower = [(x, naca(x, t, m)[1]) for x in xs]
    if a == 0:
        lower = lower[1:]
    if b == 1:
        lower = lower[:-1]
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


def cylinder(bm, p0, p1, r0, r1=None, seg=16):
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0).normalized()
    u = ax.orthogonal().normalized()
    v = ax.cross(u)
    r1 = r0 if r1 is None else r1
    ring = [u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg) for k in range(seg)]
    loft(bm, [[p0 + q * r0 for q in ring], [p1 + q * r1 for q in ring]])


def pchip(table, s, col):
    """Smooth value of column col at station s, monotone between rows (Fritsch-Carlson), so it never overshoots."""
    st = [row[0] for row in table]
    ys = [row[col] for row in table]
    if s <= st[0]:
        return ys[0]
    if s >= st[-1]:
        return ys[-1]
    i = max(k for k in range(len(st) - 1) if st[k] <= s)
    d = [(ys[k + 1] - ys[k]) / (st[k + 1] - st[k]) for k in range(len(st) - 1)]

    def slope(k):
        if k == 0:
            return d[0]
        if k == len(st) - 1:
            return d[-1]
        if d[k - 1] * d[k] <= 0:
            return 0.0
        return 2 / (1 / d[k - 1] + 1 / d[k])

    h = st[i + 1] - st[i]
    u = (s - st[i]) / h
    m0, m1 = slope(i) * h, slope(i + 1) * h
    return ((2 * u ** 3 - 3 * u ** 2 + 1) * ys[i] + (u ** 3 - 2 * u ** 2 + u) * m0
            + (-2 * u ** 3 + 3 * u ** 2) * ys[i + 1] + (u ** 3 - u ** 2) * m1)


def se(c, n):
    """Superellipse curve: sign(c) |c|^(2/n)."""
    return math.copysign(abs(c) ** (2 / n), c)


def steps(a, b, step):
    n = max(1, round(abs(b - a) / step))
    return [a + (b - a) * k / n for k in range(n + 1)]


def fuselage_ring(s, n=40):
    hw, top, bot = (pchip(FUSELAGE, s, c) for c in (1, 2, 3))
    zc, hh = (top + bot) / 2, (top - bot) / 2
    return [(X(s), hw * se(math.cos(t), SECTION_POWER), zc + hh * se(math.sin(t), SECTION_POWER))
            for t in (2 * math.pi * k / n for k in range(n))]


# ---------- materials ----------
def linear(c):
    return tuple(((v / 255 + 0.055) / 1.055) ** 2.4 if v > 10.3 else v / 255 / 12.92 for v in c)


COLOURS = {k: (*linear(v), 1) for k, v in PAINT_RGB.items()}


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.diffuse_color = COLOURS[name]
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = COLOURS[name]
    bsdf.inputs['Roughness'].default_value = {'tyre': 0.8, 'grey': 0.5, 'prop': 0.5, 'canopy': 0.08}.get(name, 0.3)
    bsdf.inputs['Metallic'].default_value = {'exhaust': 0.8, 'grey': 0.3}.get(name, 0.0)
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
    """A named point. With an axis, its local X lies along it (a hinge's turning axis)."""
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


def aligned(v, want):
    v = Vector(v).normalized()
    return v if v.dot(Vector(want)) >= 0 else -v


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- fuselage, cowl, spinner, canopy, exhausts, strakes ----------
part('cowl', 'yellow', lambda bm: loft(bm, [fuselage_ring(s) for s in steps(FUSELAGE[0][0], COWL_END_FT, 0.25)]))
part('fuselage', 'yellow', lambda bm: loft(bm, [fuselage_ring(s) for s in steps(COWL_END_FT, FUSELAGE[-1][0], 0.30)]))


def spinner(bm, n=24):
    rings = [[(X(s), r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]
             for s, r in ((s, pchip(SPINNER, s, 1)) for s in steps(SPINNER[0][0], SPINNER[-1][0], 0.11))]
    loft(bm, rings)


spinner_obj = part('spinner', 'yellow', spinner)


def canopy_sill(s):
    """Height and half-width of the canopy's sill at station s: its height is measured (CANOPY, R5) and the bubble is as
    wide as the fuselage's section at that height, so its sides run down into the fuselage's (the Astra's way)."""
    hw, top, bot = (pchip(FUSELAGE, s, c) for c in (1, 2, 3))
    zc, hh = (top + bot) / 2, (top - bot) / 2
    sill = pchip(CANOPY, s, 1)
    f = min(1.0, abs(sill - zc) / hh)
    return sill, max(0.02, hw * (1 - f ** SECTION_POWER) ** (1 / SECTION_POWER))


def canopy_rings(s0, s1, grow=0.0, n=29):
    rings = []
    for s in steps(s0, s1, 0.1):
        sill, w = canopy_sill(s)
        h = max(pchip(CANOPY, s, 2) - sill, 0.03)
        p = CANOPY_SECTION_POWER
        rings.append([(X(s), (w + grow) * se(math.cos(t), p), sill - 0.02 + (h + 0.02 + grow) * abs(math.sin(t)) ** (2 / p))
                      for t in (math.pi * k / (n - 1) for k in range(n))])
    return rings


part('canopy', 'canopy', lambda bm: loft(bm, canopy_rings(CANOPY[0][0], CANOPY[-1][0])))
part('canopyArch', 'yellow', lambda bm: loft(bm, canopy_rings(*CANOPY_ARCH_FT, grow=0.04)))  # R5a


def tube(bm, path, r0, r1, seg=14):
    """A pipe along a polyline of points, its radius going from r0 to r1, open-capped."""
    pts = [Vector((X(s), y, z)) for s, y, z in path]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = d.orthogonal().normalized()
        v = d.cross(u)
        r = r0 + (r1 - r0) * i / (len(pts) - 1)
        rings.append([p + (u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)])
    loft(bm, rings)


for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'exhaust{lr}', 'exhaust', lambda bm, sd=side: tube(bm, [(s, sd * y, z) for s, y, z in EXHAUST_PATH], *EXHAUST_RADIUS_FT))


def strake(bm, side):
    """One ventral strake: a thin plate under the rear fuselage, canted out (R14, E12)."""
    k = STRAKE
    c, sn = math.cos(math.radians(k['cant_deg'])), math.sin(math.radians(k['cant_deg']))
    rings = []
    for s in (k['s0'], k['s1']):
        root_z = pchip(FUSELAGE, s, 3) + 0.15
        d = k['depth'] * (0.35 if s == k['s0'] else 1.0)  # the leading end is shallower: a swept plate
        y0, z0 = side * k['out'], root_z
        y1, z1 = side * (k['out'] + d * sn), root_z - d * c
        t = k['thick']
        rings.append([(X(s), y0 - t, z0), (X(s), y0 + t, z0), (X(s), y1 + t, z1), (X(s), y1 - t, z1)])
    loft(bm, rings)


for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'strake{lr}', 'navy', lambda bm, sd=side: strake(bm, sd))

# ---------- wing, with flaps and ailerons, kinked trailing edge and upturned tips ----------
T_ROOT, T_TIP = WING_THICKNESS
WING_HALF = SPAN_FT / 2


def wing_le(y):
    le = WING_LE[0] + WING_LE[1] * y
    if y > WING_TIP_ROUND_FT:  # rounded tip: the leading edge swings back on a quarter ellipse
        u = min(1.0, (y - WING_TIP_ROUND_FT) / (WING_HALF - WING_TIP_ROUND_FT))
        le += 0.55 * (wing_te_line(y) - le) * (1 - math.sqrt(max(0.0, 1 - u * u)))
    return le


def wing_te_line(y):
    return WING_TE[0] + WING_TE[1] * y


def wing_te(y):
    te = wing_te_line(y)
    y_k, s_k = WING_TE_KINK
    if y < y_k:  # the root fillet: the trailing edge kinks aft
        te = max(te, wing_te_line(y_k) + (s_k - wing_te_line(y_k)) * (y_k - y) / (y_k - 1.4))
    return te


def chord(y):
    return wing_te(y) - wing_le(y)


def wing_z(y):
    z = WING_ROOT_Z_FT + y * math.tan(math.radians(WING_DIHEDRAL_DEG))
    y0, tip_deg = WING_TIP_UP
    if y > y0:
        z += (y - y0) * (math.tan(math.radians(tip_deg)) - math.tan(math.radians(WING_DIHEDRAL_DEG)))
    return z


def wing_t(y):
    return T_ROOT + (T_TIP - T_ROOT) * min(1.0, y / WING_HALF)


def wing_ring(y, a, b, side):
    c, le, z0, t = chord(y), wing_le(y), wing_z(y), wing_t(y)
    return [(X(le + x * c), side * y, z0 + zc * c) for x, zc in foil(a, b, t, WING_CAMBER)]


def wing_ys(y0, y1):
    ys = set(steps(y0, y1, 0.6))
    ys |= {y for y in (WING_TE_KINK[0], WING_TIP_UP[0], WING_TIP_ROUND_FT) if y0 < y < y1}
    if y1 >= WING_HALF - 1e-6:
        ys |= {WING_HALF - d for d in (0.04, 0.12, 0.25, 0.4)}
    return sorted(ys)


def wing_span(y0, y1, a, b, side):
    return [wing_ring(y, a, b, side) for y in wing_ys(y0, y1)]


def wing_main(bm, side):
    loft(bm, wing_span(0.0, FLAP_SPAN_FT[0], 0, 1, side))
    loft(bm, wing_span(FLAP_SPAN_FT[0], FLAP_SPAN_FT[1], 0, FLAP_HINGE_CHORD, side))
    loft(bm, wing_span(FLAP_SPAN_FT[1], AILERON_SPAN_FT[0], 0, 1, side))
    loft(bm, wing_span(AILERON_SPAN_FT[0], AILERON_SPAN_FT[1], 0, AILERON_HINGE_CHORD, side))
    loft(bm, wing_span(AILERON_SPAN_FT[1], WING_HALF - 0.04, 0, 1, side))


def hinge_point(y, h):
    return Vector((X(wing_le(y) + h * chord(y)), y, wing_z(y)))


TE_DOWN = (0, -1, 0)
for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'wing{lr}', 'yellow', lambda bm, s=side: wing_main(bm, s))
    for surf, (y0, y1), h, row in (('flap', FLAP_SPAN_FT, FLAP_HINGE_CHORD, 'R9'),
                                   ('aileron', AILERON_SPAN_FT, AILERON_HINGE_CHORD, 'R9')):
        obj = part(f'{surf}{lr}', 'navy', lambda bm, a=y0, b=y1, s=side, h=h: loft(bm, wing_span(a, b, h, 1, s)))
        p0, p1 = hinge_point(y0, h), hinge_point(y1, h)
        p0.y *= side
        p1.y *= side
        e = empty(f'{surf}{lr}Hinge', (p0 + p1) / 2, aligned(p1 - p0, TE_DOWN),
                  positive='trailing edge down', travel='not set (no source yet)', source=f'{row} (measured)')
        attach(obj, e)

# ---------- tailplane and elevator, fin and rudder ----------
TAIL_HALF = TAIL_SPAN_FT / 2


def tail_te(y):
    return TAIL_TE[0] + TAIL_TE[1] * abs(y)


def tail_le(y):
    a = abs(y)
    le = TAIL_LE[0] + TAIL_LE[1] * a
    if a > TAIL_TIP_ROUND_FT:
        u = min(1.0, (a - TAIL_TIP_ROUND_FT) / (TAIL_HALF - TAIL_TIP_ROUND_FT))
        le += 0.5 * (tail_te(a) - le) * (1 - math.sqrt(max(0.0, 1 - u * u)))
    return le


def tail_hinge_frac(y):
    return min(0.9, max(0.1, (ELEVATOR_HINGE_FT - tail_le(y)) / (tail_te(y) - tail_le(y))))


def tail_ring(y, a, b):
    le = tail_le(y)
    c = tail_te(y) - le
    z0 = TAIL_Z_FT + abs(y) * math.tan(math.radians(TAIL_DIHEDRAL_DEG))
    return [(X(le + x * c), y, z0 + zc * c) for x, zc in foil(a, b, TAIL_THICKNESS)]


TAIL_YS = sorted(set(steps(-TAIL_HALF + 0.03, TAIL_HALF - 0.03, 0.5)) | {0.0}
                 | {sg * (TAIL_HALF - d) for sg in (1, -1) for d in (0.1, 0.25)})
part('tailplane', 'navy', lambda bm: loft(bm, [tail_ring(y, 0, tail_hinge_frac(y)) for y in TAIL_YS]))
elevator = part('elevator', 'navy', lambda bm: loft(bm, [tail_ring(y, tail_hinge_frac(y), 1) for y in TAIL_YS]))
e = empty('elevatorHinge', Vector((X(ELEVATOR_HINGE_FT), 0, TAIL_Z_FT)), TE_DOWN,
          positive='trailing edge down', travel='not set (no source yet)', source='R10 (measured)')
attach(elevator, e)


def line_at(pts, z):
    """Station on the straight line through two (height, station) points, at height z."""
    (z0, s0), (z1, s1) = pts
    return s0 + (s1 - s0) * (z - z0) / (z1 - z0)


def fin_le(z):
    zd = fin_z_drawn(z)
    if zd >= FIN_LE_LINE[1][0]:  # the rounded top corner, a quarter ellipse into the flat top
        u = min(1.0, (zd - FIN_LE_LINE[1][0]) / (FIN_TOP_DRAWN - FIN_LE_LINE[1][0]))
        return FIN_TOP_ROUND[0] + (FIN_TOP_ROUND[1] - FIN_TOP_ROUND[0]) * (1 - math.sqrt(max(0.0, 1 - u * u)))
    if zd >= FIN_FILLET[1][0]:
        return line_at(FIN_LE_LINE, zd)
    return line_at(FIN_FILLET, max(zd, FIN_FILLET[0][0]))  # the dorsal fillet; below the fuselage's top, held


def fin_ring(z, a, b):
    le = fin_le(z)
    c = FIN_TE_FT - le
    return [(X(le + x * c), zc * c, z) for x, zc in foil(a, b, min(FIN_THICKNESS, 0.5 / c))]


def rudder_frac(z):
    return (line_at(RUDDER_HINGE_LINE, fin_z_drawn(z)) - fin_le(z)) / (FIN_TE_FT - fin_le(z))


FIN_ZS = sorted(set(steps(FIN_ROOT_Z_FT, FIN_TOP_Z - 0.02, 0.25)) | {fin_z(FIN_FILLET[0][0]), fin_z(FIN_FILLET[1][0]),
                                                                     fin_z(FIN_LE_LINE[1][0])}
                | {FIN_TOP_Z - d for d in (0.06, 0.15)})
RUDDER_ZS = [z for z in FIN_ZS if z >= 2.35]
part('fin', 'navy', lambda bm: (loft(bm, [fin_ring(z, 0, 1) for z in FIN_ZS if z < 2.35] + [fin_ring(2.35, 0, 1)]),
                                loft(bm, [fin_ring(z, 0, rudder_frac(z)) for z in RUDDER_ZS])))
rudder = part('rudder', 'navy', lambda bm: loft(bm, [fin_ring(z, rudder_frac(z), 1) for z in RUDDER_ZS]))
r0 = Vector((X(line_at(RUDDER_HINGE_LINE, fin_z_drawn(RUDDER_ZS[0]))), 0, RUDDER_ZS[0]))
r1 = Vector((X(line_at(RUDDER_HINGE_LINE, fin_z_drawn(FIN_TOP_Z))), 0, FIN_TOP_Z))
e = empty('rudderHinge', (r0 + r1) / 2, aligned(r1 - r0, (0, 0, 1)),
          positive='trailing edge right', travel='not set (no source yet)', source='R13 (measured)')
attach(rudder, e)

# ---------- propeller ----------


def blade(bm, psi):
    radial = Vector((0, math.cos(psi), math.sin(psi)))
    tangent = Vector((0, -math.sin(psi), math.cos(psi)))
    aft = Vector((-1, 0, 0))
    rings = []
    for r in steps(BLADE_ROOT_FT, PROP_RADIUS_FT, 0.3):
        f = (r - BLADE_ROOT_FT) / (PROP_RADIUS_FT - BLADE_ROOT_FT)
        c = BLADE_CHORD_FT[0] + (BLADE_CHORD_FT[1] - BLADE_CHORD_FT[0]) * f
        c *= math.sqrt(max(0.15, 1 - max(0.0, (f - 0.85) / 0.15) ** 2))  # rounded tip
        beta = math.radians(BLADE_ANGLE_DEG[0] + (BLADE_ANGLE_DEG[1] - BLADE_ANGLE_DEG[0]) * f)
        along = tangent * math.cos(beta) + aft * math.sin(beta)
        up = along.cross(radial).normalized()
        centre = Vector((X(PROP_STATION_FT), 0, 0)) + radial * r
        t = 0.14 - 0.09 * f
        rings.append([centre + along * ((x - 0.35) * c) + up * (zc * c) for x, zc in foil(0, 1, t, 0.03)])
    loft(bm, rings)


prop_axis = empty('propAxis', (X(PROP_STATION_FT), 0, 0), (1, 0, 0), positive='turning direction not confirmed',
                  source='S1 (5 blades, 2.39 m), R2 (plane)')
for k in range(PROP_BLADES):
    attach(part(f'blade{k + 1}', 'prop', lambda bm, i=k: blade(bm, 2 * math.pi * i / PROP_BLADES + math.pi / 2)), prop_axis)
attach(spinner_obj, prop_axis)

# ---------- landing gear, down (S1, R15; legs E13 to E15) ----------


def wheel(bm, centre, dia, width):
    c = Vector(centre)
    cylinder(bm, c - Vector((0, width / 2, 0)), c + Vector((0, width / 2, 0)), dia / 2, seg=24)


for side, lr in ((1, 'Left'), (-1, 'Right')):
    top = Vector((X(MAIN_STATION_FT - 0.45), side * MAIN_PIVOT_OUT_FT, wing_z(MAIN_PIVOT_OUT_FT) - 0.35))
    axle = Vector((X(MAIN_STATION_FT), side * MAIN_PIVOT_OUT_FT, GROUND_Z + MAIN_WHEEL_DIA_FT / 2))
    wheel_at = Vector((axle.x, side * MAIN_WHEEL_OUT_FT, axle.z))
    hinge = empty(f'gearMain{lr}Hinge', top, (-side, 0, 0), positive='leg up (folds inwards, estimate)',
                  travel='not set (no source yet)', source='S1 track, R15 wheel, E13 leg')
    leg = part(f'gearMain{lr}Leg', 'grey', lambda bm, a=top, b=axle, w=wheel_at: (
        cylinder(bm, a, b, MAIN_LEG_RADIUS_FT), cylinder(bm, b, w, MAIN_LEG_RADIUS_FT * 0.6)))
    tyre = part(f'gearMain{lr}Wheel', 'tyre', lambda bm, w=wheel_at: wheel(bm, w, MAIN_WHEEL_DIA_FT, MAIN_WHEEL_WIDTH_FT))
    hub = part(f'hubMain{lr}', 'grey', lambda bm, w=wheel_at: wheel(bm, w, MAIN_WHEEL_DIA_FT * 0.55, MAIN_WHEEL_WIDTH_FT + 0.03))
    for o in (leg, tyre, hub):
        attach(o, hinge)

nose_pivot = Vector((X(NOSE_STATION_FT), 0, NOSE_PIVOT_Z_FT))
nose_axle = Vector((X(NOSE_STATION_FT), 0, GROUND_Z + NOSE_WHEEL_DIA_FT / 2))
fork_top = nose_axle + Vector((0, 0, NOSE_WHEEL_DIA_FT / 2 + 0.12))
fork_y = NOSE_WHEEL_WIDTH_FT / 2 + 0.06


def nose_leg(bm):
    cylinder(bm, nose_pivot, fork_top, NOSE_LEG_RADIUS_FT)
    cylinder(bm, fork_top + Vector((0, fork_y, 0)), fork_top - Vector((0, fork_y, 0)), 0.06)
    for sgn in (1, -1):
        cylinder(bm, fork_top + Vector((0, sgn * fork_y, 0)), nose_axle + Vector((0, sgn * fork_y, 0)), 0.05)


nose_hinge = empty('gearNoseHinge', nose_pivot, (0, 1, 0), positive='leg up (folds backwards, estimate)',
                   travel='not set (no source yet)', source='S1 wheelbase, R15 wheel, E14 pivot')
attach(part('gearNoseLeg', 'grey', nose_leg), nose_hinge)
attach(part('gearNoseWheel', 'tyre', lambda bm: wheel(bm, nose_axle, NOSE_WHEEL_DIA_FT, NOSE_WHEEL_WIDTH_FT)), nose_hinge)
attach(part('hubNose', 'grey', lambda bm: wheel(bm, nose_axle, NOSE_WHEEL_DIA_FT * 0.55, NOSE_WHEEL_WIDTH_FT + 0.03)), nose_hinge)

# ---------- RCAF paint (constants above; rows D) ----------
import numpy as np  # noqa: E402  (the bpy module needs it, so it is always there)

TMP_DIR = tempfile.mkdtemp()
SS = 2  # the pictures are drawn at twice the size and averaged down, for smooth edges


def glyph_triangles(text):
    """The text's outline as triangles, centred, width 1, from Blender's built-in font."""
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
    return (tris - (lo + hi) / 2) / (hi[0] - lo[0])


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


def rgb(k):
    return np.array(PAINT_RGB[k]) / 255


def draw_mark(canvas, m, cx, cy, px, flip=1):
    """Draws one marking into the canvas (rows from the bottom), centred at pixel (cx, cy), px pixels per foot. flip -1
    mirrors the picture's columns (the right side's panel runs tail to nose), so text and flags still read correctly."""
    h, w, _ = canvas.shape
    if m['kind'] == 'text':
        mask = np.zeros((h, w), bool)
        g = glyph_triangles(m['text']) * m['width'] * px
        if m.get('spanwise'):  # along the span, read from behind: the glyph's x runs outboard, its top forward
            g = np.stack([-g[..., 1], -g[..., 0]], -1) if m['y'] < 0 else np.stack([-g[..., 1], g[..., 0]], -1)
        fill_triangles(mask, g + np.array([cx, cy]))
        canvas[mask] = rgb(m['colour'])
        return
    xs, ys = (np.arange(w) + 0.5 - cx) / px * flip, (np.arange(h) + 0.5 - cy) / px
    X_, Y_ = np.meshgrid(xs, ys)
    if m['kind'] == 'roundel':  # simple rings: white edge, navy ring, white disc, red leaf; not the real artwork
        r = np.hypot(X_, Y_) / (m['diameter'] / 2)
        a = np.arctan2(Y_, X_)
        for limit, colour in ((1.0, 'white'), (0.90, 'navy'), (0.60, 'white')):
            canvas[r <= limit] = rgb(colour)
        canvas[leaf(r, a, 0.45)] = rgb('red')
    elif m['kind'] == 'flag':  # red, white, red bands (1:2:1) and an 11-lobed leaf; geometric stand-in
        inside = (np.abs(X_) <= m['width'] / 2) & (np.abs(Y_) <= m['height'] / 2)
        canvas[inside] = rgb('white')
        canvas[inside & (np.abs(X_) > m['width'] / 4)] = rgb('red')
        r = np.hypot(X_, Y_) / (m['height'] / 2)
        canvas[inside & leaf(r, np.arctan2(Y_, X_), 0.48)] = rgb('red')
    elif m['kind'] == 'bar':
        canvas[(np.abs(X_) <= m['width'] / 2) & (np.abs(Y_) <= m['height'] / 2)] = rgb(m['colour'])
    elif m['kind'] == 'triangle':  # a red rescue triangle, point down, with a thin white edge
        a = m['size']
        for grow, colour in ((0.04, 'white'), (0.0, 'red')):
            top, half = a * 0.45 + grow, a / 2 + grow
            canvas[(Y_ <= top) & (Y_ >= top - (a * 0.9 + 2 * grow)) & (np.abs(X_) <= half * (Y_ - (top - a * 0.9 - 2 * grow)) / (a * 0.9 + 2 * grow))] = rgb(colour)


def edge_distance(S, Z, path):
    """Distance from each point to the polyline, positive on the left of its travel (the yellow side)."""
    best, sign = np.full(S.shape, 1e9), np.ones(S.shape)
    for (ax, ay), (bx, by) in zip(path, path[1:]):
        dx, dy = bx - ax, by - ay
        t = np.clip(((S - ax) * dx + (Z - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.hypot(S - (ax + t * dx), Z - (ay + t * dy))
        near = d < best
        best = np.where(near, d, best)
        sign = np.where(near, np.where(dx * (Z - ay) - dy * (S - ax) < 0, -1.0, 1.0), sign)
    return best * sign


def striped(S, Z, path):
    """Yellow on the left of the path, navy on the right, the stripe's bands between (STRIPE_BANDS from the yellow edge)."""
    d = edge_distance(S, Z, path)
    col = np.empty(S.shape + (3,))
    col[:] = rgb('yellow')
    col[d < 0] = rgb('navy')
    start = 0.0
    for width, name in STRIPE_BANDS:
        col[(d < -start) & (d >= -start - width)] = rgb(name)
        start += width
    return col


def fuselage_base(S, Z):
    return striped(S, Z, STRIPE_EDGE)


def navy_base(S, Z):
    col = np.empty(S.shape + (3,))
    col[:] = rgb('navy')
    return col


def make_image(name, panels):
    """panels: float arrays (rows from the bottom, columns, 3), stacked bottom to top into one picture."""
    pix = np.concatenate(panels, 0)
    img = bpy.data.images.new(name, pix.shape[1], pix.shape[0], alpha=False)
    rgba = np.ones(pix.shape[:2] + (4,), np.float32)
    rgba[..., :3] = pix
    img.pixels.foreach_set(rgba.ravel())
    tmp = os.path.join(TMP_DIR, name + '.png')  # a generated picture is lost on save: write it, load it, pack it
    img.filepath_raw = tmp
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    packed = bpy.data.images.load(tmp)
    packed.pack()
    return packed


def down(canvas):
    h, w, c = canvas.shape
    return canvas.reshape(h // SS, SS, w // SS, SS, c).mean((1, 3))


def side_texture(name, s0, s1, z0, z1, ppf, base, marks):
    """Two panels, one per side: the left's station runs to the right, the right's to the left, so lettering reads
    correctly from either side (the right side is taken as the left's mirror, an estimate)."""
    w, h = round((s1 - s0) * ppf), round((z1 - z0) * ppf)
    panels = []
    for side in (0, 1):
        cols, rows = (np.arange(w * SS) + 0.5) / (ppf * SS), (np.arange(h * SS) + 0.5) / (ppf * SS)
        S, Z = np.meshgrid(s0 + cols if side == 0 else s1 - cols, z0 + rows)
        canvas = base(S, Z)
        for m in marks:
            ms = m['s'] if side == 0 or 'group' not in m else 2 * m['group'] - m['s']
            cx = (ms - s0 if side == 0 else s1 - ms) * ppf * SS
            draw_mark(canvas, m, cx, (m['z'] - z0) * ppf * SS, ppf * SS, flip=1 if side == 0 else -1)
        panels.append(down(canvas))
    return make_image(name, panels)


def top_texture(s0, s1, y0, y1, ppf, base, marks=()):
    """One picture of a wing or tailplane seen from above: station along u, span along v."""
    w, h = round((s1 - s0) * ppf), round((y1 - y0) * ppf)
    cols, rows = (np.arange(w * SS) + 0.5) / (ppf * SS), (np.arange(h * SS) + 0.5) / (ppf * SS)
    S, Y = np.meshgrid(s0 + cols, y0 + rows)
    canvas = base(S, Y)
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


def paint_side(names, img, s0, s1, z0, z1, z_of=lambda z: z):
    for name in names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(textured(f'paint_{name}', img))
        set_uv(obj, lambda c, left: (((-c.x - s0) if left else (s1 + c.x)) / (s1 - s0),
                                     ((z_of(c.z) - z0) / (z1 - z0) + (0 if left else 1)) / 2))


def paint_top(names, top_img, bottom_img, s0, s1, y0, y1):
    for name in names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(textured(f'paint_{name}_top', top_img))
        obj.data.materials.append(textured(f'paint_{name}_bottom', bottom_img))
        set_uv(obj, lambda c, left: ((-c.x - s0) / (s1 - s0), (c.y - y0) / (y1 - y0)))
        for p in obj.data.polygons:
            p.material_index = 0 if p.normal.z >= 0 else 1


# Fuselage and cowl: stations 2.5 to 37 ft, heights -2.0 to 5.0 ft (D2 to D4e). The fin: its own picture in drawn heights.
FUS_PICTURE = (2.5, 37.0, -2.0, 5.0)
paint_side(['cowl', 'fuselage'], side_texture('paintFuselage', *FUS_PICTURE, 56, fuselage_base,
                                              [m for m in MARKS if m['on'] == 'fuselage']), *FUS_PICTURE)
FIN_PICTURE = (24.0, 35.0, 1.8, 8.8)
paint_side(['fin', 'rudder'], side_texture('paintFin', *FIN_PICTURE, 56, navy_base, [m for m in MARKS if m['on'] == 'fin']),
           *FIN_PICTURE, z_of=fin_z_drawn)


def wing_top_base(S, Y):
    """The wings' top (D5): in (station, out) both wings alike, yellow ahead of and outboard of the stripe's straight
    yellow edge, from the root point to the trailing edge at WING_STRIPE's out, carried past both ends."""
    (rs, ry), out = WING_STRIPE
    te = WING_TE[0] + WING_TE[1] * out
    ds, da = te - rs, out - ry
    path = [(rs - 0.5 * ds, ry - 0.5 * da), (te + 0.5 * ds, out + 0.5 * da)]
    return striped(S, np.abs(Y), path)


def wing_bottom_base(S, Y):
    col = navy_base(S, Y)
    col[np.abs(Y) >= WING_TIP_YELLOW_BELOW_FT] = rgb('yellow')
    return col


WING_PICTURE = (11.0, 20.0, -15.2, 15.2)
paint_top(['wingLeft', 'wingRight'],
          make_image('paintWingTop', [top_texture(*WING_PICTURE, 48, wing_top_base, WING_MARKS_TOP)]),
          make_image('paintWingBottom', [top_texture(*WING_PICTURE, 24, wing_bottom_base)]), *WING_PICTURE)
for name in ('flapLeft', 'flapRight', 'aileronLeft', 'aileronRight'):  # painted as the wing they sit in
    paint_top([name], make_image(f'paint_{name}_t', [top_texture(*WING_PICTURE, 24, wing_top_base)]),
              make_image(f'paint_{name}_b', [top_texture(*WING_PICTURE, 12, wing_bottom_base)]), *WING_PICTURE)


def tail_bottom_base(S, Y):
    col = navy_base(S, Y)
    col[np.abs(Y) >= TAIL_TIP_YELLOW_BELOW_FT] = rgb('yellow')
    return col


TAIL_PICTURE = (31.5, 36.2, -6.7, 6.7)
tail_bottom = make_image('paintTailBottom', [top_texture(*TAIL_PICTURE, 24, tail_bottom_base)])
tail_top = make_image('paintTailTop', [top_texture(*TAIL_PICTURE, 4, navy_base)])
paint_top(['tailplane', 'elevator'], tail_top, tail_bottom, *TAIL_PICTURE)

# ---------- named points ----------
empty('datum', (0, 0, 0), source='E17: the model origin, the spinner tip on the prop axis (not the weighing datum)')
empty('eyeFrontSeat', (X(EYE_FRONT[0]), EYE_FRONT[1], EYE_FRONT[2]), source='E16 (estimate), tandem seats')
empty('eyeRearSeat', (X(EYE_REAR[0]), EYE_REAR[1], EYE_REAR[2]), source='E16 (estimate), tandem seats, rear raised')

# ---------- size checks ----------
bpy.context.view_layer.update()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in bpy.data.objects:
    if o.type == 'MESH':
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
size = hi - lo
ys = steps(0.0, WING_HALF, 0.01)
wing_area = 2 * sum(chord(y) * (WING_HALF / (len(ys) - 1)) for y in ys[:-1])  # through the fuselage, kink and round tip
wing_area_plain = 2 * sum((wing_te_line(y) - WING_LE[0] - WING_LE[1] * y) * (WING_HALF / (len(ys) - 1)) for y in ys[:-1])


def check(what, got, ref, src):
    print(f'  {what:<15} {got:7.2f} ft   {src} {ref:7.2f} ft   difference {got - ref:+.2f} ft ({(got - ref) * 12:+.1f} in)')


print('size checks (model, ft):')
check('length', size.x, LENGTH_FT, 'three-view (S1)')
check('span', size.y, SPAN_FT, 'three-view (S1)')
check('height', size.z, HEIGHT_FT, 'three-view (S1)')
check('tailplane span', TAIL_SPAN_FT, TAIL_SPAN_FT, 'three-view (S1)')
check('main track', 2 * MAIN_WHEEL_OUT_FT, TRACK_FT, 'three-view (S1)')
check('wheelbase', MAIN_STATION_FT - NOSE_STATION_FT, WHEELBASE_FT, 'three-view (S1)')
check('prop diameter', PROP_DIAMETER_FT, PROP_DIAMETER_FT, 'three-view (S1)')
check('fuselage width', 2 * pchip(FUSELAGE, 19.0, 1), FUSELAGE_WIDTH_FT, 'three-view (S1)')
print(f'  wing area      {wing_area:7.1f} ft2 (as built, through the fuselage); straight lines to the tip '
      f'{wing_area_plain:7.1f} ft2; three-view (S1) {WING_AREA_FT2:7.2f} ft2')
print(f'  prop tip to ground {AXIS_HEIGHT_FT - PROP_RADIUS_FT:.2f} ft; fin scale {FIN_SCALE:.3f} (R16)')
print('named points (ft: forward +X from the spinner tip, left +Y, up +Z from the prop axis):')
for o in sorted((o for o in bpy.data.objects if o.type == 'EMPTY'), key=lambda o: o.name):
    axis = f"  axis {tuple(o['axis'])}, positive {o['positive']}" if 'axis' in o else ''
    print(f'  {o.name:<20} {tuple(round(c, 2) for c in o.location)}{axis}')
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
print(f'triangles: {tris}')

os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('saved', OUT_BLEND)

if not RENDER_DIR:
    shutil.rmtree(TMP_DIR, ignore_errors=True)
    sys.exit(0)

# ---------- renders from the saved master ----------
bpy.ops.wm.open_mainfile(filepath=OUT_BLEND)
os.makedirs(RENDER_DIR, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = False
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 2.2
sun.data.angle = math.radians(12)
sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(30))
scene.collection.objects.link(sun)
mid = (Vector(lo) + Vector(hi)) / 2


def grid(name, plane, u_range, v_range):
    """1 ft lines (every 5th heavier) in a plane; plane(u, v) gives a point."""
    bm = bmesh.new()
    for axis, (a, b), (c, d) in ((0, u_range, v_range), (1, v_range, u_range)):
        for k in range(math.ceil(a), math.floor(b) + 1):
            w = 0.015 if k % 5 else 0.04
            pts = [(k - w, c), (k + w, c), (k + w, d), (k - w, d)] if axis == 0 else [(c, k - w), (d, k - w), (d, k + w), (c, k + w)]
            bm.faces.new([bm.verts.new(plane(u, v)) for u, v in pts])
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


def shoot(name, loc, look=None, ortho=None, euler=None, res=(1600, 900)):
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
    scene.render.filepath = os.path.join(RENDER_DIR, f'pc21-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('render', scene.render.filepath)


R = 62
shoot('quarter-front-left', mid + Vector((0.62, 0.62, 0.30)) * R, mid)
shoot('quarter-rear-right', mid + Vector((-0.65, -0.60, 0.40)) * R, mid)
shoot('below', mid + Vector((0.45, 0.35, -0.80)) * R * 1.3, mid)
shoot('side', (mid.x, 60, mid.z), (mid.x, 0, mid.z), ortho=LENGTH_FT * 1.12)
shoot('front', (60, 0, mid.z), (0, 0, mid.z), ortho=SPAN_FT * 1.12)
shoot('top', (mid.x, 0, 60), ortho=LENGTH_FT * 1.08, euler=(0, 0, math.radians(-90)), res=(1400, 1400))
shutil.rmtree(TMP_DIR, ignore_errors=True)
