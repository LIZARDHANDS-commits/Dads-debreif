# Builds the C-130J-30 Super Hercules's outside as a Blender master file, first pass (shared plan Step 3e items 1 to 3,
# with a first paint pass, item 5; docs/modules/shared/c130j-plan.md). Runs headless, with Blender 5.2 or the bpy module:
#
#   blender -b --factory-startup -P tools/blender/c130j/build_c130j.py -- <out>/c130j.blend [<render dir> [silhouettes]]
#   <venv>/bin/python tools/blender/c130j/build_c130j.py -- <out>/c130j.blend [<render dir> [silhouettes | short]]
#
# Every number is in the constants block below and names its row in sources.md (P = a public page, R = measured off a
# picture Dad sent on 15 Oct 2026 (C1 the line-art three-view, C3 the rendered three-view with dimensions), D = read off
# Dad's paint pictures (C2 the Ramstein photo, C4 the six-view poster), E = an estimate).
#
# C1, the clearest outline, draws the SHORT C-130J (97 ft 9 in; sources.md R1). Its shapes are measured in its own
# stations ("short stations", ft behind the nose) and the model is the stretched C-130J-30 (Dad's pick, 15 Oct 2026):
# the published 100 in plug ahead of the wing and 80 in plug behind it (P4) are put into the fuselage, which C3's -30
# confirms (R1). `short` after the render directory builds the short outline instead and makes only its silhouettes,
# for the overlay check against C1; it is never delivered.
#
# Axes and units follow the CT-156, Astra and T-38A scripts: real feet, nose +X, left +Y, up +Z. The origin (the named
# point `datum`) is the tip of the radome, so a part's station (feet behind the nose) is -X. Heights are feet above the
# radome tip. On the ground the main and nose wheels touch z = GROUND_Z (C1's wheels, R2).
#
# Parts are smooth-shaded with a hard edge where faces meet at more than SHARP_DEG, as the CT-156's, the Astra's and the
# T-38A's are. The paint (D rows, USAF grey with the Ramstein "RS" tail, Dad's pick, 15 Oct 2026) is drawn into small
# generated pictures applied by position, as the T-38A's.
#
# With a render directory, the saved master is opened again and the full renders are made from it, twice: in plain
# colours (<render dir>/plain) and painted (<render dir>/painted): both quarters, below, and square-on side, front and top
# over a 1 ft grid; the painted set adds a view from below near the angle of Dad's photo C2. The plain set also writes the
# side, top and front silhouettes (`-alpha.png`) that the overlay sheets are made from.
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
    sys.exit('usage: build_c130j.py -- <out.blend> [<render dir> [silhouettes | short]]')
OUT_BLEND = os.path.abspath(argv[0])
RENDER_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None
SHORT = len(argv) > 2 and argv[2] == 'short'  # the short C-130J's outline, silhouettes only, for the overlay on C1
SILHOUETTES_ONLY = SHORT or (len(argv) > 2 and argv[2] == 'silhouettes')

IN_TO_FT = 1 / 12

# ---------- the numbers (each names its row in sources.md) ----------
# Published sizes
LENGTH_FT = 112 + 9 * IN_TO_FT       # P1 RCAF CC-130J fact sheet (34.37 m), the C-130J-30; the 403rd Wing sheet says 34.69 m
LENGTH_SHORT_FT = 97 + 9 * IN_TO_FT  # P2 403rd Wing fact sheet, the short C-130J: C1's scale (R1)
SPAN_FT = 132 + 7 * IN_TO_FT         # P1 (40.38 m; DND 40.4 m)
HEIGHT_FT = 38 + 9 * IN_TO_FT        # P1 (11.81 m) and C3; 403rd Wing 38 ft 10 in, AMC 39 ft 5 in
TAIL_SPAN_FT = 52 + 8 * IN_TO_FT     # P3 C3's dimension drawing (16.05 m)
WING_AREA_FT2 = 1745.0               # P5 secondary pages (the size check only)
PROP_DIAMETER_FT = 13.5              # P5 secondary page (C1's front view draws 13.7 ft, R9)
PLUG_FWD = (22.0, 0.0 if SHORT else 100 * IN_TO_FT)  # P4 100 in plug; where it goes, short station 22.0 (R1, E1)
PLUG_AFT = (56.0, 0.0 if SHORT else 80 * IN_TO_FT)   # P4 80 in plug; at short station 56.0 (R1, E1)

# Frame (R2): short stations ft behind the radome tip, heights ft above it, out = ft from the centreline
GROUND_Z = -7.16                     # R2 C1 side view: the wheels' bottoms, 7.16 ft below the radome tip

# Fuselage (R3 top and bottom from C1's side view, R4 half-widths from C1's top view, R5 the section from C1's front
# view; ahead of 12.6 ft the rows are smoothed within C1's one-pixel reading, 0.2 ft): short station, half-width, top, bottom, height of the widest point (None: R5's share of the height, ZW_SHARE),
# superellipse power above and below the widest point. The sponsons, ramp and door are their own parts.
FUSELAGE = [
    (0.00, 0.12, 0.12, -0.12, 0.00, 2.0, 2.0),
    (0.20, 1.00, 0.75, -1.00, -0.10, 2.0, 2.0),
    (0.40, 1.47, 1.18, -1.57, -0.15, 2.0, 2.0),
    (1.18, 2.06, 1.60, -2.00, -0.15, 2.0, 2.0),
    (1.96, 2.46, 1.93, -2.36, -0.15, 2.0, 2.0),
    (2.75, 2.72, 2.20, -2.68, -0.12, 2.0, 2.05),
    (3.53, 3.08, 2.48, -2.96, -0.05, 2.0, 2.1),
    (4.32, 3.45, 3.04, -3.22, 0.05, 2.0, 2.15),
    (5.10, 3.82, 4.05, -3.47, 0.15, 2.0, 2.2),
    (6.28, 4.40, 5.40, -3.83, 0.30, 2.0, 2.25),
    (7.85, 5.00, 6.62, -4.28, 0.55, 2.0, 2.3),
    (9.42, 5.60, 7.20, -4.66, 0.80, 2.05, 2.35),
    (10.99, 6.19, 7.60, -4.95, 1.00, 2.1, 2.4),
    (12.56, 6.58, 7.95, -5.10, 1.10, 2.1, 2.4),
    (14.13, 6.78, 8.15, -5.10, 1.15, 2.1, 2.4),
    (15.70, 6.97, 8.15, -5.10, 1.19, 2.1, 2.4),
    (17.27, 7.17, 8.15, -5.10, 1.19, 2.1, 2.4),
    (56.13, 7.17, 8.15, -5.10, 1.19, 2.1, 2.4),
    # the upswept aft body: the top stays level to the tail, the belly rises (R3), the width closes in (R4)
    (57.70, 7.17, 8.15, -4.51, None, 2.1, 2.4),
    (60.06, 7.17, 8.15, -3.83, None, 2.1, 2.4),
    (63.20, 7.17, 8.15, -2.65, None, 2.1, 2.4),
    (66.34, 7.17, 8.15, -1.37, None, 2.1, 2.4),
    (69.48, 7.17, 8.15, -0.10, None, 2.1, 2.4),
    (71.00, 7.17, 8.15, 0.60, None, 2.1, 2.4),
    (73.40, 6.90, 8.15, 1.65, None, 2.1, 2.4),
    (76.50, 6.48, 8.15, 2.95, None, 2.1, 2.45),
    (79.70, 5.99, 8.15, 4.45, None, 2.1, 2.5),
    (82.04, 5.30, 8.15, 5.45, None, 2.1, 2.5),
    (85.18, 4.60, 8.15, 5.92, None, 2.1, 2.5),
    (89.10, 3.80, 8.15, 6.45, None, 2.1, 2.5),
    (92.20, 3.20, 8.15, 7.05, None, 2.1, 2.5),
    (93.80, 2.65, 8.15, 7.35, None, 2.1, 2.5),
    (95.40, 2.00, 8.14, 7.58, None, 2.1, 2.5),
    (96.96, 1.20, 8.12, 7.80, None, 2.1, 2.5),
    (97.75, 0.12, 8.06, 7.98, None, 2.1, 2.5),
]
ZW_SHARE = 0.475                     # R5: the widest point 1.19 ft above the radome tip, 0.475 of the way up the section
TAIL_TIP_SHORT = FUSELAGE[-1][0]     # R1: the tail cone's tip, 97.75 short (C1 498 px at 5.095 px/ft)

# Main-gear sponsons (R6, C1 side, top and front views): short station, outer half-width, bottom, top. Their inner side
# is buried in the fuselage at SPONSON_INNER.
SPONSON = [
    (30.00, 6.20, -2.60, -1.70), (30.60, 7.10, -3.90, -0.90), (31.60, 7.70, -4.60, -0.10), (33.00, 8.00, -4.85, 0.55),
    (35.50, 8.10, -4.90, 1.10), (38.10, 8.10, -4.90, 1.37), (54.40, 8.10, -4.90, 1.37), (55.60, 7.90, -4.85, 0.90),
    (56.80, 7.60, -4.70, 0.00), (57.80, 7.30, -4.40, -1.20), (58.70, 7.00, -4.00, -2.40),
]
SPONSON_INNER = 5.0                  # E2 estimate: buried in the fuselage
SPONSON_POWER = 3.4                  # E2 estimate: a rounded box (C1's front view draws rounded corners)

# Cargo ramp and door, closed (R7, C1 side view): short stations; each is the underside of the aft body, out to
# RAMP_EDGE_DEG below the widest line either side (E3), a skin just proud of the fuselage.
RAMP_SHORT = (58.44, 67.71)          # R7: the ramp's hinge to its joint with the door
DOOR_SHORT = (67.71, 81.26)          # R7: the door's front edge to its aft end
RAMP_EDGE_DEG = 35.0                 # E3 estimate, fits C1's side edge 2.3 ft above the belly at the hinge

# Flight deck windows (R8, C1 side and top views): side windows are quadrilaterals (short station, height) projected
# sideways onto the skin, corners in the order front-low, aft-low, aft-high, front-high; windshield panes are
# quadrilaterals (short station, out) projected down onto the skin from above. Both sides alike (mirrored).
SIDE_WINDOWS = [
    [(6.28, 3.61), (8.00, 3.61), (9.10, 6.28), (7.73, 6.28)],
    [(8.12, 3.61), (9.70, 3.61), (10.54, 6.28), (9.22, 6.28)],
    [(6.10, 0.60), (8.15, 0.60), (8.15, 2.55), (6.10, 2.55)],
]
WINDSHIELD = [
    [(3.95, 0.20), (5.90, 0.20), (5.90, 2.25), (4.10, 2.25)],
    [(4.35, 2.38), (6.55, 2.38), (6.85, 3.25), (4.80, 3.25)],
]
WINDOW_PROUD_FT = 0.04               # E4: how far the glass stands off the skin, so it shows

# Wing (R10 planform from C1's top view, R11 its height and thickness from C1's front view). Short stations.
WING_LE = (36.60, 7.20, 0.0396)      # R10: leading edge at the body (station, out) and its sweep back per ft out
WING_TE_ROOT = 53.00                 # R10: trailing edge, straight across the centre wing ...
WING_TE_BREAK_OUT = 18.40            # R10: ... to here, then tapering forward
WING_TE_SLOPE = 0.1247               # R10: ft forward per ft out outboard of the break
WING_TIP_START_OUT = 63.30           # R10: the rounded tip from here to the published span (C1 draws it to 66.30)
WING_Z = 7.07                        # R11: the chord plane at the centre wing (C1 front view 7.07)
WING_FLAT_OUT = 14.0                 # R11: flat to here (the centre wing) ...
WING_DIHEDRAL_DEG = 2.30             # R11: ... then rising 2.3 deg to the tip: C1's front view (C3's front view also rises)
WING_TC = (0.19, 0.10)               # R11: thickness 3.14 ft at the centre wing (19%), 0.79 ft at the tip (about 10%)
FLAP_OUT = (7.20, 45.30)             # R12: flaps from the body to the aileron (C1 top view)
AILERON_OUT = (45.30, 63.30)         # R12: aileron to the tip (C1 top view: 45.3 to 64.9)
HINGE_CHORD = 0.70                   # R12: flaps and ailerons are the aft 30% of the chord (C1: 0.68 to 0.70)

# Nacelles, spinners and props (R9, C1 top, side and front views). Short stations; heights from the hub.
NACELLES = [(16.60, 5.93), (33.40, 6.78)]  # R9: centre out, hub height (C1 front view 5.93 and 6.78; side view 6.08)
PROP_PLANE_SHORT = 29.13             # R9: C1 side view
# Nacelle profile: short station, half-width, top above the hub, bottom below it (R9, C1; the over-wing hump E5)
NACELLE = [
    (29.20, 1.10, 1.10, -1.10), (29.80, 1.55, 1.80, -1.90), (30.60, 1.72, 2.10, -2.30), (32.00, 1.77, 2.15, -2.40),
    (35.00, 1.77, 2.15, -2.30), (38.00, 1.75, 2.45, -1.90), (41.00, 1.70, 2.60, -1.50), (45.00, 1.60, 2.40, -1.35),
    (50.00, 1.30, 1.90, -1.00), (54.00, 0.95, 1.30, -0.70), (57.90, 0.15, 0.10, -0.25),
]
NACELLE_POWER = 2.4                  # E5 estimate: section roundness
SPINNER = [(27.30, 0.02), (27.50, 0.35), (27.90, 0.65), (28.40, 0.88), (28.90, 1.03), (29.20, 1.10)]  # R9 tip, E6 shape
PROP_BLADES = 6                      # P6 six-blade props (Dowty R391, public)
BLADE_CHORD = (0.80, 1.00, 0.42)     # E7 estimate: at the root, at r 2.5 ft, at the tip
BLADE_PITCH_DEG = (42.0, 20.0)       # E7 estimate: section angle to the disc at the root and at the tip (static)
BLADE_SWEEP_FT = 0.9                 # E7 estimate: the tip swept back this far (the R391's scimitar blades, by eye on C3)
BLADE_ROOT_R = 0.95                  # E7 inside the spinner
BLADE_PHASE_DEG = (0.0, 15.0, -15.0, 30.0)  # E7: each prop's blades turned a little differently (static, as in C3)

# Main gear, down (R13, C1 side and front views)
MAIN_WHEELS_SHORT = (40.50, 45.50)   # R13: the tandem wheels' centres
MAIN_WHEEL = (4.00, 1.60)            # R13 diameter (side), width (front)
MAIN_WHEEL_OUT = 7.03                # R13: centre of the tyre, C1 front view (track 14.06 ft)
NOSE_WHEEL_SHORT = 11.25             # R13
NOSE_WHEEL = (2.94, 0.75)            # R13 diameter; width E8
NOSE_WHEEL_OUT = 0.55                # E8 estimate: the twin nose wheels either side of the centre
NOSE_PIVOT = (10.60, -4.20)          # E8 estimate: short station, height

# Tailplane and elevators (R14, C1 top view; span P3; height C1 side view)
TAIL_LE = (78.32, 0.2361)            # R14: leading edge at the centreline (extended) and its sweep per drawn ft out
TAIL_TE = (93.77, 0.1380)            # R14: trailing edge at the centreline and its sweep forward per drawn ft out
TAIL_DRAWN_HALF_SPAN = 25.93         # R14: C1 draws 25.93 ft; built to P3's 26.33 ft, stretched spanwise
TAIL_Z = 7.95                        # R14: C1 side view
TAIL_TC = (0.09, 0.09)               # E9 estimate
ELEVATOR_HINGE_SHORT = 88.13         # R14: C1 top view, straight across
ELEVATOR_OUT0 = 1.0                  # E9 estimate: the elevators start this far out

# Fin and rudder (R15, C1 side view; its height to P1, R15)
FIN_TOP_Z = GROUND_Z + HEIGHT_FT     # R15: 31.59 above the radome tip; C1 draws 30.71 (C3 agrees with P1, R15)
FIN_DRAWN_TOP_Z = 30.71              # R15: C1's fin top, before the fin is stretched to P1's height
FUSELAGE_TOP_Z = 8.15                # R3
# The leading edge, (height as drawn on C1, short station), from inside the body to the top
FIN_LE = [(7.00, 53.27), (8.15, 58.60), (11.48, 74.63), (12.46, 76.40), (FIN_DRAWN_TOP_Z, 85.18)]
FIN_TE = [(7.00, 95.10), (FIN_DRAWN_TOP_Z, 90.90)]  # R15 trailing edge, drawn heights
FIN_T_FT = (2.2, 0.65)               # E10 estimate: thickness at the body and at the top
RUDDER_HINGE_SHORT = 89.99           # R15: vertical hinge line (C1)
RUDDER_Z_DRAWN = (8.54, 29.70)       # R15: foot of the rudder (C1), its top under the fin's cap (E10)

# Named points
EYES = dict(pilot=(7.50, 1.60, 4.80), copilot=(7.50, -1.60, 4.80))  # E11 estimate: short station, out (left +), height

SHARP_DEG = 40  # as build_ct156_exterior.py: faces meeting at more than this keep a hard edge

# ---------- USAF paint, Ramstein "RS" (D rows: C2 photo, C4 poster for placement by eye; Dad's pick, 15 Oct 2026) ------
PAINT_RGB = {'grey': (142, 148, 152), 'black': (26, 26, 28), 'prop': (40, 42, 46), 'spinner': (52, 54, 58),
             'tyre': (30, 31, 34), 'gear': (190, 192, 196), 'glass': (34, 40, 48), 'red': (178, 34, 52),
             'white': (236, 236, 236), 'blue': (40, 52, 104)}
# Markings: on = which picture; s = station ft in the -30's stations (where the build puts it), z = height. Lettering is
# Blender's built-in face, sized to the pictures; the insignia and the flag are simple geometric stand-ins (D9).
MARKS = [
    dict(on='fuselage', kind='text', text='U.S. AIR FORCE', s=18.4, z=3.90, width=11.0),       # D3
    dict(on='fuselage', kind='starbar', s=78.0, z=1.90, width=8.5, diameter=4.2),              # D4
]
FIN_MARKS = [  # placed by the fraction of the chord from the leading edge and the height above the fuselage top (D5)
    dict(kind='flag', frac=0.40, above=14.0, width=3.0, height=1.65),
    dict(kind='text', text='RS', frac=0.42, above=7.3, height=3.3),
]
FIN_BOOT = dict(z=(9.0, 15.0), depth=2.4)  # D6: black on the fin's leading edge low down (C2, C4)
TAIL_BOOT_DEPTH = 1.6                # D6: black along the tailplane's leading edge (C2)
NACELLE_PATCH = dict(half=2.9, chord=0.42)  # D7: black on the wing's top beside each nacelle (C4), to 42% of the chord
WING_MARKS = [  # D8: 'upper' seen from above, 'lower' from below; out positive = left wing; letters' tops toward the LE
    dict(surface='upper', kind='text', text='USAF', out=-50.0, frac=0.45, width=12.0),
    dict(surface='upper', kind='starbar', out=50.0, frac=0.45, width=9.0, diameter=4.5),
    dict(surface='lower', kind='text', text='USAF', out=50.0, frac=0.45, width=12.0),
    dict(surface='lower', kind='starbar', out=-50.0, frac=0.45, width=9.0, diameter=4.5),
]

# ---------- worked out from the numbers above ----------
WING_HALF_SPAN = SPAN_FT / 2
TAIL_HALF_SPAN = TAIL_SPAN_FT / 2
FIN_Z_SCALE = (FIN_TOP_Z - FUSELAGE_TOP_Z) / (FIN_DRAWN_TOP_Z - FUSELAGE_TOP_Z)  # R15: 1.039
WING_SHIFT = PLUG_FWD[1]             # the wing, nacelles, sponsons and main gear sit between the two plugs
TAIL_SHIFT = PLUG_FWD[1] + PLUG_AFT[1]


def stretch(s):
    """A fuselage short station (C1) as a station of the model built (the -30's, with both plugs in)."""
    return s + (PLUG_FWD[1] if s >= PLUG_FWD[0] else 0.0) + (PLUG_AFT[1] if s >= PLUG_AFT[0] else 0.0)


def unstretch(S):
    """The C1 short station whose section the model has at station S (inside a plug: the plug's own station)."""
    a0, a1 = PLUG_FWD[0], PLUG_FWD[0] + PLUG_FWD[1]
    b0 = PLUG_AFT[0] + PLUG_FWD[1]
    b1 = b0 + PLUG_AFT[1]
    if S < a0:
        return S
    if S < a1:
        return PLUG_FWD[0]
    if S < b0:
        return S - PLUG_FWD[1]
    if S < b1:
        return PLUG_AFT[0]
    return S - TAIL_SHIFT


def X(station):
    return -station


# ---------- shapes (the helpers are the Astra's and the T-38A's) ----------
def naca(x, t):
    """Symmetric NACA 4-digit thickness at x (0 leading edge, 1 trailing edge): half-thickness / chord, closed edge."""
    return 5 * t * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)


N_FOIL = 14


def foil(a, b, t):
    """Closed loop of (chord fraction, z / chord) between chord fractions a and b: upper from b to a, lower from a to b."""
    xs = [a + (b - a) * (1 - math.cos(math.pi * i / (N_FOIL - 1))) / 2 for i in range(N_FOIL)]
    upper = [(x, naca(x, t)) for x in reversed(xs)]
    lower = [(x, -naca(x, t)) for x in xs]
    if a == 0:
        lower = lower[1:]
    if b == 1:
        lower = lower[:-1]
    return upper + lower


def loft(bm, rings, caps=True, cap_mat=(0, 0), closed=True):
    """Joins rings of points (each the same count) into faces; closed=False leaves each ring an open line."""
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(vs[0][::-1]).material_index = cap_mat[0]
        bm.faces.new(vs[-1]).material_index = cap_mat[1]
    return vs


def cylinder(bm, p0, p1, r0, r1=None, seg=20):
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


# The fuselage table with the widest point filled in where it follows the section (ZW_SHARE)
FUS = [(s, hw, top, bot, bot + ZW_SHARE * (top - bot) if zw is None else zw, pu, pl)
       for s, hw, top, bot, zw, pu, pl in FUSELAGE]


def section(S):
    """The fuselage's section at the model's station S: half-width, top, bottom, widest height, powers."""
    s = unstretch(S)
    return tuple(pchip(FUS, s, c) for c in range(1, 7))


def fuselage_ring(S, n=48):
    hw, top, bot, zw, pu, pl = section(S)
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, si = math.cos(t), math.sin(t)
        p = pu if si >= 0 else pl
        z = zw + (top - zw) * se(si, pu) if si >= 0 else zw + (zw - bot) * se(si, pl)
        pts.append((X(S), hw * se(c, p), z))
    return pts


def body_halfwidth_at(S, z):
    """Half-width of the body's section at station S and height z (0 outside it)."""
    hw, top, bot, zw, pu, pl = section(S)
    if z >= zw:
        f, p = min(1.0, (z - zw) / max(top - zw, 1e-6)), pu
    else:
        f, p = min(1.0, (zw - z) / max(zw - bot, 1e-6)), pl
    return hw * max(0.0, 1 - f ** p) ** (1 / p)


def body_top_at(S, y):
    """Height of the body's upper surface at station S and `y` ft out."""
    hw, top, bot, zw, pu, pl = section(S)
    f = min(1.0, abs(y) / max(hw, 1e-6))
    return zw + (top - zw) * max(0.0, 1 - f ** pu) ** (1 / pu)


# ---------- materials ----------
def linear(c):
    return tuple(((v / 255 + 0.055) / 1.055) ** 2.4 if v > 10.3 else v / 255 / 12.92 for v in c)


PLAIN_RGB = {'airframe': (205, 206, 210), 'surface': (188, 190, 196), 'canopy': (115, 158, 199), 'door': (180, 183, 190),
             'gear': (215, 215, 218), 'tyre': (30, 32, 36), 'prop': (70, 72, 78), 'spinner': (120, 122, 128),
             'nacelle': (196, 198, 203), 'sponson': (198, 200, 205)}


def bsdf_material(name, rgb, rough=0.35, metal=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    col = (*linear(rgb), 1)
    m.diffuse_color = col
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = col
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def plain(name):
    return bsdf_material('plain_' + name, PLAIN_RGB[name], rough=0.6 if name in ('tyre', 'gear', 'prop') else 0.4)


def part(name, colours, make):
    """One named mesh object: make(bm) draws it (faces may pick a material by index into colours); smooth-shaded with
    hard edges past SHARP_DEG. colours are PLAIN_RGB names, kept on the object for the plain renders."""
    colours = [colours] if isinstance(colours, str) else list(colours)
    bm = bmesh.new()
    make(bm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for c in colours:
        mesh.materials.append(plain(c))
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
    obj = bpy.data.objects.new(name, mesh)
    obj['plain'] = colours
    bpy.context.collection.objects.link(obj)
    return obj


def empty(name, at, axis=None, **props):
    """A named point. With an axis, its local X lies along it (a hinge's turning axis, right-handed: positive turns as
    `positive` says)."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS' if axis else 'SPHERE'
    e.empty_display_size = 1.0
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

# ---------- fuselage ----------
TAIL_TIP = stretch(TAIL_TIP_SHORT)
_short = (steps(0.0, 1.6, 0.1) + steps(1.6, 14.2, 0.4) + steps(14.2, 17.4, 0.8) + steps(56.0, 58.0, 0.5)
          + steps(58.0, 82.0, 0.8) + steps(82.0, 96.0, 1.0) + steps(96.0, TAIL_TIP_SHORT, 0.25))
FUS_STATIONS = sorted({round(stretch(s), 4) for s in _short}
                      | set(steps(stretch(17.4), stretch(PLUG_AFT[0]) - 0.001, 3.0)))
part('fuselage', 'airframe', lambda bm: loft(bm, [fuselage_ring(S) for S in FUS_STATIONS]))


# ---------- sponsons ----------
def sponson_ring(s_short, side, n=32):
    w, bot, top = (pchip(SPONSON, s_short, c) for c in (1, 2, 3))
    yc, hy = (SPONSON_INNER + w) / 2, (w - SPONSON_INNER) / 2
    zc, hz = (bot + top) / 2, max((top - bot) / 2, 0.05)
    S = s_short + WING_SHIFT
    return [(X(S), side * (yc + hy * se(math.cos(t), SPONSON_POWER)), zc + hz * se(math.sin(t), SPONSON_POWER))
            for t in (2 * math.pi * k / n for k in range(n))]


for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'sponson{lr}', 'sponson',
         lambda bm, sd=side: loft(bm, [sponson_ring(s, sd) for s in steps(SPONSON[0][0], SPONSON[-1][0], 0.7)]))


# ---------- cargo ramp and door (closed), and the flight deck windows ----------
def underside_skin(bm, S0, S1, step=0.5, n=18):
    """The aft body's underside from S0 to S1, out to RAMP_EDGE_DEG below the widest line either side, 0.03 ft proud."""
    a0, a1 = math.radians(180 + RAMP_EDGE_DEG), math.radians(360 - RAMP_EDGE_DEG)
    rings = []
    for S in steps(S0, S1, step):
        hw, top, bot, zw, pu, pl = section(S)
        ring = []
        for k in range(n):
            t = a0 + (a1 - a0) * k / (n - 1)
            c, si = math.cos(t), math.sin(t)
            y = (hw + 0.03) * se(c, pl)
            z = zw + (zw - bot + 0.03) * se(si, pl)
            ring.append((X(S), y, z))
        rings.append(ring)
    outer = rings
    inner = [[(x, y * 0.995, z + 0.03) for x, y, z in r] for r in rings]
    loft(bm, outer, caps=False, closed=False)
    loft(bm, inner, caps=False, closed=False)
    for ra, rb in ((outer[0], inner[0]), (outer[-1], inner[-1])):
        va, vb = [bm.verts.new(p) for p in ra], [bm.verts.new(p) for p in rb]
        for k in range(len(va) - 1):
            bm.faces.new((va[k], va[k + 1], vb[k + 1], vb[k]))
    for k in (0, -1):
        bm.faces.new([bm.verts.new(p) for p in (outer[0][k], outer[-1][k], inner[-1][k], inner[0][k])])


RAMP = tuple(stretch(s) for s in RAMP_SHORT)
DOOR = tuple(stretch(s) for s in DOOR_SHORT)
ramp = part('cargoRamp', 'door', lambda bm: underside_skin(bm, *RAMP))
door = part('cargoDoor', 'door', lambda bm: underside_skin(bm, *DOOR))
hw0, top0, bot0, zw0, _, _ = section(RAMP[0])
attach(ramp, empty('cargoRampHinge', (X(RAMP[0]), 0, bot0 + 0.03), (0, 1, 0), positive='aft edge down (opens)',
                   travel='not set (no source yet)', source='R7 (measured, C1 side view)'))
hw1, top1, bot1, zw1, _, _ = section(DOOR[1])
attach(door, empty('cargoDoorHinge', (X(DOOR[1]), 0, bot1 + 0.03), (0, -1, 0),
                   positive='front edge up into the fuselage (opens; how it moves is an estimate, E3)',
                   travel='not set (no source yet)', source='R7 (measured, C1 side view)'))


def bilinear(q, u, v):
    (a0, b0), (a1, b1), (a2, b2), (a3, b3) = q
    lo = (a0 + (a1 - a0) * u, b0 + (b1 - b0) * u)
    hi = (a3 + (a2 - a3) * u, b3 + (b2 - b3) * u)
    return lo[0] + (hi[0] - lo[0]) * v, lo[1] + (hi[1] - lo[1]) * v


def window_patch(bm, q, project, n=6):
    """A pane: the quadrilateral q gridded n by n, each point put on the skin by project(a, b), as a thin plate."""
    grid = [[project(*bilinear(q, i / n, j / n)) for i in range(n + 1)] for j in range(n + 1)]
    loft(bm, grid, caps=False, closed=False)


def side_point(side):
    return lambda s, z: (X(s), side * (body_halfwidth_at(s, z) + WINDOW_PROUD_FT), z)


def top_point(side):
    return lambda s, y: (X(s), side * y, body_top_at(s, y) + WINDOW_PROUD_FT)


def windows(bm):
    for side in (1, -1):
        for q in SIDE_WINDOWS:  # the flight deck is ahead of the forward plug: short stations are the model's here
            window_patch(bm, q, side_point(side))
        for q in WINDSHIELD:
            window_patch(bm, q, top_point(side))


part('flightDeckWindows', 'canopy', windows)

# ---------- wing, with flaps and ailerons ----------


def wing_le(y):
    return WING_LE[0] + (abs(y) - WING_LE[1]) * WING_LE[2] + WING_SHIFT


def wing_te(y):
    y = abs(y)
    return WING_TE_ROOT + WING_SHIFT - (max(0.0, y - WING_TE_BREAK_OUT) * WING_TE_SLOPE)


def wing_z(y):
    return WING_Z + max(0.0, abs(y) - WING_FLAT_OUT) * math.tan(math.radians(WING_DIHEDRAL_DEG))


def wing_tc(y):
    f = max(0.0, abs(y) - WING_FLAT_OUT) / (WING_HALF_SPAN - WING_FLAT_OUT)
    return WING_TC[0] + (WING_TC[1] - WING_TC[0]) * f


def tip_scale(y):
    """The rounded tip (R10): the chord closes in about 45% of it from WING_TIP_START_OUT to the published span."""
    f = (abs(y) - WING_TIP_START_OUT) / (WING_HALF_SPAN - WING_TIP_START_OUT)
    return 1.0 if f <= 0 else max(0.12, math.sqrt(max(0.0, 1 - f * f)))


def wing_ring(y, a, b, side):
    le, te = wing_le(y), wing_te(y)
    k = tip_scale(y)
    mid = le + 0.45 * (te - le)
    le, te = mid + (le - mid) * k, mid + (te - mid) * k
    c = te - le
    t = wing_tc(y) / max(k, 0.5) * k  # thinner with the tip's chord
    return [(X(le + x * c), side * abs(y), wing_z(y) + zc * c) for x, zc in foil(a, b, max(t, 0.02))]


def wing_stations(y0, y1, step=2.0):
    return sorted(set(steps(y0, y1, step)) | {v for v in (WING_FLAT_OUT, WING_TE_BREAK_OUT) if y0 < v < y1})


TIP_STATIONS = [WING_TIP_START_OUT + (WING_HALF_SPAN - WING_TIP_START_OUT) * f for f in (0, 0.35, 0.6, 0.8, 0.93, 1.0)]


def wing_main(bm, side):
    loft(bm, [wing_ring(y, 0, 1, side) for y in wing_stations(0.0, FLAP_OUT[0])])
    loft(bm, [wing_ring(y, 0, HINGE_CHORD, side) for y in wing_stations(FLAP_OUT[0], AILERON_OUT[1])])
    loft(bm, [wing_ring(y, 0, 1, side) for y in TIP_STATIONS])


def hinge_point(y):
    return Vector((X(wing_le(y) + HINGE_CHORD * (wing_te(y) - wing_le(y))), y, wing_z(y)))


TE_DOWN = (0, -1, 0)  # aft x down: a positive turn moves a trailing edge down (as the Astra's and the T-38A's)
for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'wing{lr}', 'airframe', lambda bm, s=side: wing_main(bm, s))
    for surf, (y0, y1) in (('flap', FLAP_OUT), ('aileron', AILERON_OUT)):
        obj = part(f'{surf}{lr}', 'surface',
                   lambda bm, a=y0, b=y1, s=side: loft(bm, [wing_ring(y, HINGE_CHORD, 1, s) for y in wing_stations(a, b)]))
        p0, p1 = hinge_point(y0), hinge_point(y1)
        p0.y *= side
        p1.y *= side
        h = empty(f'{surf}{lr}Hinge', (p0 + p1) / 2, aligned(p1 - p0, TE_DOWN), positive='trailing edge down',
                  travel='not set (no source yet)', source='R12 (measured, C1 top view)')
        attach(obj, h)

# ---------- nacelles, spinners and props (engines 1 to 4, left outboard to right outboard) ----------
PROP_PLANE = PROP_PLANE_SHORT + WING_SHIFT
ENGINES = [(1, 1, NACELLES[1]), (2, 1, NACELLES[0]), (3, -1, NACELLES[0]), (4, -1, NACELLES[1])]


def nacelle_ring(s_short, out, hub_z, n=36):
    hw, top, bot = (pchip(NACELLE, s_short, c) for c in (1, 2, 3))
    zc, hz = hub_z + (top + bot) / 2, (top - bot) / 2
    S = s_short + WING_SHIFT
    return [(X(S), out + hw * se(math.cos(t), NACELLE_POWER), zc + hz * se(math.sin(t), NACELLE_POWER))
            for t in (2 * math.pi * k / n for k in range(n))]


def spinner(bm, out, hub_z, seg=24):
    rings = []
    for s, r in SPINNER:
        S = s + WING_SHIFT
        rings.append([(X(S), out + r * math.cos(2 * math.pi * k / seg), hub_z + r * math.sin(2 * math.pi * k / seg))
                      for k in range(seg)])
    loft(bm, rings)


def blade_value(r, root, mid, tip, R):
    """A blade's chord along its radius: root at BLADE_ROOT_R, mid at 2.5 ft, tip at R (straight between)."""
    if r <= 2.5:
        return root + (mid - root) * (r - BLADE_ROOT_R) / (2.5 - BLADE_ROOT_R)
    return mid + (tip - mid) * (r - 2.5) / (R - 2.5)


def prop(bm, out, hub_z, phase_deg):
    """Six static blades (P6), each a thin twisted section from inside the spinner to the published diameter (P5); the
    shape is an estimate (E7). The props turn about +X; the blades' leading edges lead a turn about -X (not sourced)."""
    R = PROP_DIAMETER_FT / 2
    hub = Vector((X(PROP_PLANE), out, hub_z))
    radii = steps(BLADE_ROOT_R, R, 0.55)
    for k in range(PROP_BLADES):
        phi = math.radians(phase_deg + 360 * k / PROP_BLADES)
        e_r = Vector((0, math.cos(phi), math.sin(phi)))
        e_t = Vector((0, -math.sin(phi), math.cos(phi)))  # the way the blade moves
        e_x = Vector((1, 0, 0))
        rings = []
        for r in radii:
            f = (r - BLADE_ROOT_R) / (R - BLADE_ROOT_R)
            c = blade_value(r, *BLADE_CHORD, R)
            beta = math.radians(BLADE_PITCH_DEG[0] + (BLADE_PITCH_DEG[1] - BLADE_PITCH_DEG[0]) * f)
            d = e_t * math.cos(beta) + e_x * math.sin(beta)  # chord line, leading edge first
            nrm = -e_t * math.sin(beta) + e_x * math.cos(beta)
            centre = hub + e_r * r - e_t * (BLADE_SWEEP_FT * f * f)
            th = 0.07 * c if f < 0.95 else 0.03 * c
            pts = []
            for u, v in ((0.0, 0.0), (0.12, 0.6), (0.4, 1.0), (0.75, 0.6), (1.0, 0.0), (0.75, -0.4), (0.4, -0.7), (0.12, -0.4)):
                pts.append(centre + d * ((0.25 - u) * c) + nrm * (v * th))
            rings.append(pts)
        loft(bm, rings)


for n, side, (out, hub_z) in ENGINES:
    o = side * out
    part(f'nacelle{n}', 'nacelle',
         lambda bm, o=o, z=hub_z: loft(bm, [nacelle_ring(s, o, z) for s in steps(NACELLE[0][0], NACELLE[-1][0], 0.6)]))
    hub = empty(f'prop{n}Hub', (X(PROP_PLANE), o, hub_z), (1, 0, 0), positive='turns about the prop axis (+X)',
                travel='free (the prop turns)', source='R9 (measured, C1 front and side views)')
    attach(part(f'spinner{n}', 'spinner', lambda bm, o=o, z=hub_z: spinner(bm, o, z)), hub)
    attach(part(f'prop{n}', 'prop', lambda bm, o=o, z=hub_z, ph=BLADE_PHASE_DEG[n - 1]: prop(bm, o, z, ph)), hub)

# ---------- tailplane and elevators, fin and rudder ----------


def tail_le(y):
    return TAIL_LE[0] + TAIL_LE[1] * abs(y) * TAIL_DRAWN_HALF_SPAN / TAIL_HALF_SPAN + TAIL_SHIFT


def tail_te(y):
    return TAIL_TE[0] - TAIL_TE[1] * abs(y) * TAIL_DRAWN_HALF_SPAN / TAIL_HALF_SPAN + TAIL_SHIFT


ELEVATOR_HINGE = ELEVATOR_HINGE_SHORT + TAIL_SHIFT


def tail_ring(y, s_from, s_to):
    le, te = tail_le(y), tail_te(y)
    c = te - le
    a, b = (s_from - le) / c, (s_to - le) / c
    t = TAIL_TC[0] + (TAIL_TC[1] - TAIL_TC[0]) * abs(y) / TAIL_HALF_SPAN
    return [(X(le + x * c), y, TAIL_Z + zc * c) for x, zc in foil(a, b, t)]


def tailplane(bm):
    e0 = ELEVATOR_OUT0
    loft(bm, [tail_ring(y, tail_le(y), tail_te(y)) for y in steps(-e0, e0, e0)])
    for sd in (1, -1):
        loft(bm, [tail_ring(sd * y, tail_le(y), ELEVATOR_HINGE) for y in steps(e0, TAIL_HALF_SPAN, 1.5)])


part('tailplane', 'airframe', tailplane)
for side, lr in ((1, 'Left'), (-1, 'Right')):
    obj = part(f'elevator{lr}', 'surface', lambda bm, sd=side: loft(
        bm, [tail_ring(sd * y, ELEVATOR_HINGE, tail_te(y)) for y in steps(ELEVATOR_OUT0, TAIL_HALF_SPAN, 1.5)]))
    attach(obj, empty(f'elevator{lr}Hinge', (X(ELEVATOR_HINGE), side * (ELEVATOR_OUT0 + TAIL_HALF_SPAN) / 2, TAIL_Z),
                      TE_DOWN, positive='trailing edge down', travel='not set (no source yet)',
                      source='R14 (measured, C1 top view)'))


def fin_z(z_drawn):
    """A height on C1's fin as built: stretched above the fuselage top so the fin's top is at P1's height (R15)."""
    return z_drawn if z_drawn <= FUSELAGE_TOP_Z else FUSELAGE_TOP_Z + (z_drawn - FUSELAGE_TOP_Z) * FIN_Z_SCALE


FIN_LE_BUILT = [(fin_z(z), s + TAIL_SHIFT) for z, s in FIN_LE]
FIN_TE_BUILT = [(fin_z(z), s + TAIL_SHIFT) for z, s in FIN_TE]
RUDDER_HINGE = RUDDER_HINGE_SHORT + TAIL_SHIFT
RUDDER_Z = tuple(fin_z(z) for z in RUDDER_Z_DRAWN)


def polyline(pts, z):
    for (z0, s0), (z1, s1) in zip(pts, pts[1:]):
        if z <= z1 or (z1, s1) == pts[-1]:
            return s0 + (s1 - s0) * (z - z0) / (z1 - z0)
    return pts[-1][1]


def fin_le(z):
    return polyline(FIN_LE_BUILT, z)


def fin_te(z):
    return polyline(FIN_TE_BUILT, z)


def fin_ring(z, s_from, s_to):
    cf = fin_te(z) - fin_le(z)
    f = max(0.0, (z - FUSELAGE_TOP_Z) / (FIN_TOP_Z - FUSELAGE_TOP_Z))
    t = (FIN_T_FT[0] + (FIN_T_FT[1] - FIN_T_FT[0]) * f) / cf
    a, b = (s_from - fin_le(z)) / cf, (s_to - fin_le(z)) / cf
    return [(X(fin_le(z) + x * cf), zc * cf, z) for x, zc in foil(a, b, t)]


def fin(bm):
    z0 = FIN_LE_BUILT[0][0]
    knees = {p[0] for p in FIN_LE_BUILT[1:-1]}
    lower = sorted(set(steps(z0, RUDDER_Z[1], 0.8)) | knees)
    loft(bm, [fin_ring(z, fin_le(z), RUDDER_HINGE) for z in lower])
    loft(bm, [fin_ring(z, fin_le(z), fin_te(z)) for z in steps(RUDDER_Z[1], FIN_TOP_Z, 0.6)])


part('fin', 'airframe', fin)
rudder = part('rudder', 'surface',
              lambda bm: loft(bm, [fin_ring(z, RUDDER_HINGE, fin_te(z)) for z in steps(*RUDDER_Z, 0.8)]))
attach(rudder, empty('rudderHinge', (X(RUDDER_HINGE), 0, sum(RUDDER_Z) / 2), (0, 0, 1), positive='trailing edge right',
                     travel='not set (no source yet)', source='R15 (measured, C1 side view)'))

# ---------- landing gear, down ----------


def wheel(bm, centre, dia, width, seg=28):
    c = Vector(centre)
    cylinder(bm, c - Vector((0, width / 2, 0)), c + Vector((0, width / 2, 0)), dia / 2, seg=seg)


MAIN_WHEELS = tuple(s + WING_SHIFT for s in MAIN_WHEELS_SHORT)
dia, width = MAIN_WHEEL
axle_z = GROUND_Z + dia / 2
for side, lr in ((1, 'Left'), (-1, 'Right')):
    slide = empty(f'gearMain{lr}Slide', (X(sum(MAIN_WHEELS) / 2), side * MAIN_WHEEL_OUT, -3.0), (0, 0, 1),
                  positive='wheels up into the sponson (the main gear retracts straight up: from memory, to be sourced)',
                  travel='not set (no source yet)', source='R13 (wheels, measured), E8 (struts, estimate)')
    strut_y = side * (MAIN_WHEEL_OUT - width / 2 - 0.18)

    def legs(bm, sy=strut_y, sd=side):
        for s in MAIN_WHEELS:
            cylinder(bm, (X(s), sy, axle_z), (X(s), sy, -3.0), 0.22, seg=12)
            cylinder(bm, (X(s), sy, axle_z), (X(s), sd * MAIN_WHEEL_OUT, axle_z), 0.16, seg=12)

    attach(part(f'gearMain{lr}Legs', 'gear', legs), slide)
    attach(part(f'gearMain{lr}Wheels', 'tyre',
                lambda bm, sd=side: [wheel(bm, (X(s), sd * MAIN_WHEEL_OUT, axle_z), dia, width) for s in MAIN_WHEELS]),
           slide)

ndia, nwidth = NOSE_WHEEL
nose_pivot = Vector((X(NOSE_PIVOT[0]), 0, NOSE_PIVOT[1]))
nose_axle = Vector((X(NOSE_WHEEL_SHORT), 0, GROUND_Z + ndia / 2))


def nose_leg(bm):
    cylinder(bm, nose_pivot, nose_axle + Vector((0, 0, 0.2)), 0.2, seg=12)
    cylinder(bm, nose_axle + Vector((0, NOSE_WHEEL_OUT, 0)), nose_axle - Vector((0, NOSE_WHEEL_OUT, 0)), 0.12, seg=10)


nose_hinge = empty('gearNoseHinge', nose_pivot, (0, -1, 0), positive='leg swings forward (from memory, not confirmed)',
                   travel='not set (no source yet)', source='R13 (wheels, measured), E8 (pivot, estimate)')
attach(part('gearNoseLeg', 'gear', nose_leg), nose_hinge)
attach(part('gearNoseWheels', 'tyre', lambda bm: [wheel(bm, nose_axle + Vector((0, sd * NOSE_WHEEL_OUT, 0)), ndia, nwidth)
                                                 for sd in (1, -1)]), nose_hinge)

# ---------- named points ----------
empty('datum', (0, 0, 0), source='the model origin: the radome tip (not the weighing datum, which is in the flight manual)')
empty('tailTip', (X(TAIL_TIP), 0, FUS[-1][2]), source='R1: the published length runs to here (P1)')
for name, (s, y, z) in EYES.items():
    empty(f'eye{name.title()}', (X(s), y, z), source='E11 (estimate): the flight deck, ahead of the forward plug')

# ---------- USAF paint (constants above; rows D1 to D9) ----------
import numpy as np  # noqa: E402  (the bpy module needs it, so it is always there)

TMP_DIR = tempfile.mkdtemp()
SS = 2  # pictures are drawn at twice the size and averaged down, for smooth edges


def rgbf(k):
    return np.array(PAINT_RGB[k]) / 255


def glyph_triangles(text):
    """The text's outline as triangles, centred, height 1, from Blender's built-in face (as the Astra's and T-38A's)."""
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
    return (tris - (lo + hi) / 2) / (hi[1] - lo[1]), (hi[0] - lo[0]) / (hi[1] - lo[1])


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


def star_points(r_out, r_in=None, n=5):
    r_in = r_out * 0.382 if r_in is None else r_in
    return [((r_out if k % 2 == 0 else r_in) * math.cos(math.pi / 2 + k * math.pi / n),
             (r_out if k % 2 == 0 else r_in) * math.sin(math.pi / 2 + k * math.pi / n)) for k in range(2 * n)]


def polyline_distance(X_, Y_, pts, closed=True):
    best = np.full(X_.shape, 1e9)
    segs = list(zip(pts, pts[1:] + pts[:1])) if closed else list(zip(pts, pts[1:]))
    for (ax, ay), (bx, by) in segs:
        dx, dy = bx - ax, by - ay
        t = np.clip(((X_ - ax) * dx + (Y_ - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        best = np.minimum(best, np.hypot(X_ - (ax + t * dx), Y_ - (ay + t * dy)))
    return best


def draw_mark(canvas, m, cx, cy, px, colour='black'):
    """Draws one marking into the canvas (rows from the bottom), centred at pixel (cx, cy), px pixels per foot, its top
    toward the rows' increase. The shapes are simple geometric stand-ins, not copied artwork (D9)."""
    h, w, _ = canvas.shape
    if m['kind'] == 'text':
        tris, aspect = glyph_triangles(m['text'])
        height = m['height'] if 'height' in m else m['width'] / aspect
        mask = np.zeros((h, w), bool)
        fill_triangles(mask, tris * height * px + np.array([cx, cy]))
        canvas[mask] = rgbf(colour)
        return
    xs, ys = (np.arange(w) + 0.5 - cx) / px, (np.arange(h) + 0.5 - cy) / px
    X_, Y_ = np.meshgrid(xs, ys)
    if m['kind'] == 'starbar':  # D4, D8: the low-visibility national insignia, a black outline
        lw = 0.06 * m['diameter'] / 4.2
        R = m['diameter'] / 2
        ring = np.abs(np.hypot(X_, Y_) - R) < lw
        star = polyline_distance(X_, Y_, star_points(R * 0.92)) < lw
        bw, bh = m['width'] / 2, R * 0.36
        bars = polyline_distance(X_, Y_, [(R * 0.93, bh), (bw, bh), (bw, -bh), (R * 0.93, -bh)], closed=False) < lw
        bars |= polyline_distance(X_, Y_, [(-R * 0.93, bh), (-bw, bh), (-bw, -bh), (-R * 0.93, -bh)], closed=False) < lw
        canvas[ring | star | bars] = rgbf(colour)
    elif m['kind'] == 'flag':  # D5: a stand-in flag: seven red stripes on white and a plain blue canton
        hw, hh = m['width'] / 2, m['height'] / 2
        inside = (np.abs(X_) <= hw) & (np.abs(Y_) <= hh)
        stripe = np.floor((Y_ + hh) / (2 * hh) * 13).astype(int) % 2 == 0
        canvas[inside] = rgbf('white')
        canvas[inside & stripe] = rgbf('red')
        canvas[inside & (X_ <= -hw + 0.4 * 2 * hw) & (Y_ >= hh - 7 / 13 * 2 * hh)] = rgbf('blue')


def make_image(name, panels):
    """panels: float arrays (rows from the bottom, columns, 3), stacked bottom to top into one packed picture."""
    pix = np.concatenate(panels, 0)
    img = bpy.data.images.new(name, pix.shape[1], pix.shape[0], alpha=False)
    rgba = np.ones(pix.shape[:2] + (4,), np.float32)
    rgba[..., :3] = pix
    img.pixels.foreach_set(rgba.ravel())
    tmp = os.path.join(TMP_DIR, name + '.png')
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
    correctly from either side (the right side is taken as the left's mirror, D10)."""
    w, h = round((s1 - s0) * ppf), round((z1 - z0) * ppf)
    panels = []
    for side in (0, 1):
        cols, rows = (np.arange(w * SS) + 0.5) / (ppf * SS), (np.arange(h * SS) + 0.5) / (ppf * SS)
        S, Z = np.meshgrid(s0 + cols if side == 0 else s1 - cols, z0 + rows)
        canvas = base(S, Z)
        for m in marks:
            cx = (m['s'] - s0 if side == 0 else s1 - m['s']) * ppf * SS
            draw_mark(canvas, m, cx, (m['z'] - z0) * ppf * SS, ppf * SS, m.get('colour', 'black'))
        panels.append(down(canvas))
    return make_image(name, panels)


def plan_texture(name, s0, s1, y0, y1, ppf, base, marks):
    """Two panels for a flat part seen from above (panel 0) and from below (panel 1). Columns run along the span: from
    above, toward the right wing (-Y); from below, toward the left wing (+Y), so lettering reads correctly from either
    side. Rows run forward (toward the leading edge), so a marking's top faces the leading edge (D8)."""
    w, h = round((y1 - y0) * ppf), round((s1 - s0) * ppf)
    panels = []
    for k, surface in enumerate(('upper', 'lower')):
        cols, rows = (np.arange(w * SS) + 0.5) / (ppf * SS), (np.arange(h * SS) + 0.5) / (ppf * SS)
        Y, S = np.meshgrid(y1 - cols if k == 0 else y0 + cols, s1 - rows)
        canvas = base(S, Y, surface)
        for m in marks:
            if m['surface'] != surface:
                continue
            cx = ((y1 - m['y']) if k == 0 else (m['y'] - y0)) * ppf * SS
            draw_mark(canvas, m, cx, (s1 - m['s']) * ppf * SS, ppf * SS, m.get('colour', 'black'))
        panels.append(down(canvas))
    return make_image(name, panels)


def textured(name, img, rough=0.45):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'EXTEND'
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def set_uv(obj, fn):
    me = obj.data
    uv = me.uv_layers.new(name='paint')
    for p in me.polygons:
        cos = [me.vertices[me.loops[i].vertex_index].co for i in p.loop_indices]
        for i, c in zip(p.loop_indices, cos):
            uv.data[i].uv = fn(c, p)


def paint_side(names, img, s0, s1, z0, z1):
    for name in names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(textured(f'paint_{name}', img))
        set_uv(obj, lambda c, p: ((((-c.x - s0) if p.center.y >= 0 else (s1 + c.x)) / (s1 - s0)),
                                  ((c.z - z0) / (z1 - z0) + (0 if p.center.y >= 0 else 1)) / 2))


def paint_plan(names, img, s0, s1, y0, y1):
    for name in names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(textured(f'paint_{name}', img))
        set_uv(obj, lambda c, p: (((y1 - c.y) if p.normal.z >= 0 else (c.y - y0)) / (y1 - y0),
                                  ((s1 + c.x) / (s1 - s0) + (0 if p.normal.z >= 0 else 1)) / 2))


def paint_mat(k):
    rough = {'black': 0.5, 'tyre': 0.75, 'glass': 0.08, 'prop': 0.55}.get(k, 0.45)
    return bsdf_material('paint_' + k, PAINT_RGB[k], rough=rough)


def grey_base(S, Z, *_):
    col = np.empty(S.shape + (3,))
    col[:] = rgbf('grey')
    return col


FUS_PICTURE = (-0.5, TAIL_TIP + 0.5, -6.0, 9.0)
fus_marks = [m for m in MARKS if m['on'] == 'fuselage']
paint_side(['fuselage', 'sponsonLeft', 'sponsonRight', 'cargoRamp', 'cargoDoor'],
           side_texture('paintFuselage', *FUS_PICTURE, 20, grey_base, fus_marks), *FUS_PICTURE)


def fin_mark_place(m):
    z = FUSELAGE_TOP_Z + m['above']
    return dict(m, s=fin_le(z) + m['frac'] * (fin_te(z) - fin_le(z)), z=z)


def fin_base(S, Z):
    col = grey_base(S, Z)
    le = np.interp(Z, [p[0] for p in FIN_LE_BUILT], [p[1] for p in FIN_LE_BUILT])
    boot = (Z >= FIN_BOOT['z'][0]) & (Z <= FIN_BOOT['z'][1]) & (S - le <= FIN_BOOT['depth'])
    col[boot] = rgbf('black')
    return col


FIN_PICTURE = (FIN_LE_BUILT[0][1] - 0.5, FIN_TE_BUILT[0][1] + 1.0, 6.8, FIN_TOP_Z + 0.2)
paint_side(['fin', 'rudder'], side_texture('paintFin', *FIN_PICTURE, 24, fin_base, [fin_mark_place(m) for m in FIN_MARKS]),
           *FIN_PICTURE)


def tail_base(S, Y, surface):
    col = grey_base(S, Y)
    le = TAIL_LE[0] + TAIL_SHIFT + TAIL_LE[1] * np.abs(Y) * TAIL_DRAWN_HALF_SPAN / TAIL_HALF_SPAN
    col[(S - le) <= TAIL_BOOT_DEPTH] = rgbf('black')
    return col


TAIL_PICTURE = (TAIL_LE[0] + TAIL_SHIFT - 0.5, TAIL_TE[0] + TAIL_SHIFT + 0.5, -TAIL_HALF_SPAN - 0.5, TAIL_HALF_SPAN + 0.5)
paint_plan(['tailplane', 'elevatorLeft', 'elevatorRight'],
           plan_texture('paintTailplane', *TAIL_PICTURE, 12, tail_base, []), *TAIL_PICTURE)


def wing_base(S, Y, surface):
    col = grey_base(S, Y)
    if surface == 'upper':
        a = np.abs(Y)
        le = WING_LE[0] + WING_SHIFT + (a - WING_LE[1]) * WING_LE[2]
        te = WING_TE_ROOT + WING_SHIFT - np.maximum(0.0, a - WING_TE_BREAK_OUT) * WING_TE_SLOPE
        for out, _ in NACELLES:  # D7: black beside each nacelle, from the leading edge back
            col[(np.abs(a - out) <= NACELLE_PATCH['half']) & (S - le <= NACELLE_PATCH['chord'] * (te - le))] = rgbf('black')
    return col


def wing_mark_place(m):
    y = m['out']
    return dict(m, y=y, s=wing_le(y) + m['frac'] * (wing_te(y) - wing_le(y)))


WING_PICTURE = (wing_le(0) - 0.5, WING_TE_ROOT + WING_SHIFT + 0.5, -WING_HALF_SPAN - 0.5, WING_HALF_SPAN + 0.5)
paint_plan(['wingLeft', 'wingRight', 'flapLeft', 'flapRight', 'aileronLeft', 'aileronRight'],
           plan_texture('paintWing', *WING_PICTURE, 12, wing_base, [wing_mark_place(m) for m in WING_MARKS]), *WING_PICTURE)

# Plain paint for the rest: grey nacelles, dark props and spinners, dark glass, grey gear (D11, estimate), dark tyres.
PAINT_OF = {f'nacelle{n}': 'grey' for n in range(1, 5)}
PAINT_OF.update({f'prop{n}': 'prop' for n in range(1, 5)})
PAINT_OF.update({f'spinner{n}': 'spinner' for n in range(1, 5)})
PAINT_OF.update({'flightDeckWindows': 'glass', 'gearNoseLeg': 'gear', 'gearMainLeftLegs': 'gear',
                 'gearMainRightLegs': 'gear', 'gearNoseWheels': 'tyre', 'gearMainLeftWheels': 'tyre',
                 'gearMainRightWheels': 'tyre'})
for name, k in PAINT_OF.items():
    me = bpy.data.objects[name].data
    me.materials.clear()
    me.materials.append(paint_mat(k))

# ---------- size checks ----------
bpy.context.view_layer.update()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
        for c in o.data.vertices:
            w = o.matrix_world @ c.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
size = hi - lo
ys = steps(0.0, WING_HALF_SPAN, 0.05)
wing_area = 2 * sum((wing_te((a + b) / 2) - wing_le((a + b) / 2)) * tip_scale((a + b) / 2) * (b - a) for a, b in zip(ys, ys[1:]))
tail_area = 2 * TAIL_HALF_SPAN * ((tail_te(0) - tail_le(0)) + (tail_te(TAIL_HALF_SPAN) - tail_le(TAIL_HALF_SPAN))) / 2


def check(what, got, ref, src, unit='ft'):
    d = got - ref
    extra = f' ({d * 12:+.1f} in)' if unit == 'ft' else ''
    print(f'  {what:<30} {got:8.2f} {unit}   {src:<26} {ref:8.2f} {unit}   difference {d:+.2f} {unit}{extra}')


print('size checks (model, ft):' + ('  SHORT C-130J OUTLINE (overlay check only)' if SHORT else ''))
check('length (radome tip to tail)', size.x, LENGTH_SHORT_FT if SHORT else LENGTH_FT,
      '403rd Wing (P2)' if SHORT else 'RCAF fact sheet (P1)')
if not SHORT:
    check('', size.x, 34.69 / 0.3048, '403rd Wing 34.69 m (P1)')
check('span', size.y, SPAN_FT, 'RCAF fact sheet (P1)')
check('height (ground to fin top)', hi.z - GROUND_Z, HEIGHT_FT, 'RCAF fact sheet (P1)')
check('', hi.z - GROUND_Z, 39 + 5 / 12, 'AMC fact sheet (P1)')
check('lowest point (wheels)', lo.z, GROUND_Z, 'ground (R2)')
check('wing area (planform)', wing_area, WING_AREA_FT2, 'secondary pages (P5)', 'ft2')
check('tailplane span', 2 * TAIL_HALF_SPAN, TAIL_SPAN_FT, "Dad's drawing C3 (P3)")
check('prop diameter', PROP_DIAMETER_FT, 13.7, "C1's front view (R9)")
print(f'  tailplane area (trapezoid) {tail_area:.0f} ft2; main wheel track {2 * MAIN_WHEEL_OUT:.2f} ft (R13); '
      f'wheelbase {sum(MAIN_WHEELS) / 2 - NOSE_WHEEL_SHORT:.2f} ft (nose to the middle of the tandem pair)')
print(f'  wing: chord {wing_te(0) - wing_le(0):.2f} ft at the centreline, {wing_te(WING_TIP_START_OUT) - wing_le(WING_TIP_START_OUT):.2f} ft '
      f'where the tip starts; fin {FIN_Z_SCALE:.3f} times C1\'s height above the fuselage (R15)')
print(f'  triangles: {tris}')
print('named points (ft: forward +X from the radome tip, left +Y, up +Z from the radome tip):')
for o in sorted((o for o in bpy.data.objects if o.type == 'EMPTY'), key=lambda o: o.name):
    axis = f"  axis {tuple(o['axis'])}, positive {o['positive']}" if 'axis' in o else ''
    print(f'  {o.name:<22} {tuple(round(c, 2) for c in o.location)}{axis}')

os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('saved', OUT_BLEND)
shutil.rmtree(TMP_DIR, ignore_errors=True)  # the pictures are packed in the saved master
if not RENDER_DIR:
    sys.exit(0)

# ---------- full renders from the saved master ----------
bpy.ops.wm.open_mainfile(filepath=OUT_BLEND)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 40
scene.cycles.use_denoising = False
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('world')
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (1, 1, 1, 1)
bg.inputs['Strength'].default_value = 0.55
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 2.2
sun.data.angle = math.radians(12)
sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(30))
scene.collection.objects.link(sun)

S_MID = TAIL_TIP / 2                 # middle of the length, station ft
Z_MID = (GROUND_Z + FIN_TOP_Z) / 2
mid = Vector((X(S_MID), 0, Z_MID))


def grid(name, plane, u_range, v_range):
    """1 ft lines (every 5th heavier) in a plane, drawn as thin flat strips; plane(u, v) gives a point."""
    bm = bmesh.new()
    for axis, (a, b), (c, d) in ((0, u_range, v_range), (1, v_range, u_range)):
        for k in range(math.ceil(a), math.floor(b) + 1):
            w = 0.045 if k % 5 else 0.11  # at 12 px per ft: about 1 px and 2.6 px wide
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
    em.inputs['Color'].default_value = (0.32, 0.32, 0.32, 1)
    nt.links.new(em.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs[0])
    mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.hide_render = True
    return obj


# Grid lines sit on whole feet from the radome tip (stations), the centreline and the ground.
g = GROUND_Z
HALF = math.ceil(SPAN_FT / 2) + 3
grids = {
    'side': grid('gridSide', lambda u, v: (-u, -90, g + v), (-4, math.ceil(TAIL_TIP) + 4), (-1, math.ceil(HEIGHT_FT) + 3)),
    'front': grid('gridFront', lambda u, v: (-150, u, g + v), (-HALF, HALF), (-1, math.ceil(HEIGHT_FT) + 3)),
    'top': grid('gridTop', lambda u, v: (-u, v, g - 1), (-4, math.ceil(TAIL_TIP) + 4), (-HALF, HALF)),
}
cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
cam.data.clip_end = 2000
scene.collection.objects.link(cam)
scene.camera = cam

# The square-on views use these exact scales and centres, so the overlay sheets can map a pixel to feet:
# side: 12 px per ft, centre (S_MID, Z_MID), image right = aft; top: 12 px per ft, centre (S_MID, 0), image right = aft,
# image up = the right wing (-Y); front: 12 px per ft, centre (0, Z_MID), image right = the left wing (+Y).
ORTHO_PPF = 12
SIDE_RES = (1500, 600)
TOP_RES = (1500, 1700)
FRONT_RES = (1700, 600)


def place(loc, right, up):
    right, up = Vector(right).normalized(), Vector(up).normalized()
    back = right.cross(up)
    m = Matrix((right, up, back)).transposed().to_4x4()
    m.translation = loc
    cam.matrix_world = m


def shoot(folder, name, loc, look=None, ortho=None, basis=None, res=(1920, 1080), lens=50, grid_on=True, alpha=False):
    for k, o in grids.items():
        o.hide_render = not grid_on or k != name.split('-')[0]
    scene.render.film_transparent = alpha
    if basis:
        place(loc, *basis)
    else:
        cam.rotation_mode = 'QUATERNION'
        cam.location = loc
        cam.rotation_quaternion = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y')
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = lens
    cam.data.sensor_fit = 'HORIZONTAL'
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = os.path.join(folder, f'c130j-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('render', scene.render.filepath)


def views(folder, painted):
    os.makedirs(folder, exist_ok=True)
    R = 230  # ft from the middle of the aircraft
    side = dict(loc=(X(S_MID), 200, Z_MID), ortho=SIDE_RES[0] / ORTHO_PPF, basis=((-1, 0, 0), (0, 0, 1)), res=SIDE_RES)
    top = dict(loc=(X(S_MID), 0, 200), ortho=TOP_RES[0] / ORTHO_PPF, basis=((-1, 0, 0), (0, -1, 0)), res=TOP_RES)
    front = dict(loc=(200, 0, Z_MID), ortho=FRONT_RES[0] / ORTHO_PPF, basis=((0, 1, 0), (0, 0, 1)), res=FRONT_RES)
    if SILHOUETTES_ONLY:
        for name, v in (('side', side), ('top', top), ('front', front)):
            shoot(folder, f'{name}-alpha', grid_on=False, alpha=True, **v)
        return
    shoot(folder, 'quarter-front-left', mid + Vector((0.62, 0.62, 0.30)) * R, mid)
    shoot(folder, 'quarter-rear-right', mid + Vector((-0.65, -0.60, 0.30)) * R, mid)
    shoot(folder, 'below', mid + Vector((0.45, 0.35, -0.80)) * R * 1.15, mid)
    shoot(folder, 'side', **side)
    shoot(folder, 'front', **front)
    shoot(folder, 'top', **top)
    if painted:
        # Near the angle of Dad's photo C2: from below, ahead and to the right, a long lens (D12, by eye)
        shoot(folder, 'photo-angle', mid + Vector((0.30, -0.25, -0.92)) * 600, mid, res=(1244, 880), lens=135, grid_on=False)
    else:
        for name, v in (('side', side), ('top', top), ('front', front)):
            shoot(folder, f'{name}-alpha', grid_on=False, alpha=True, **v)


# Painted first (the master's own materials), then plain colours (each part's `plain` names, kept on the object).
if not SILHOUETTES_ONLY:
    views(os.path.join(RENDER_DIR, 'painted'), True)
for o in bpy.data.objects:
    if o.type == 'MESH' and 'plain' in o:
        names = list(o['plain'])
        o.data.materials.clear()
        for n in names:
            o.data.materials.append(plain(n))
        if len(names) == 1:
            for p in o.data.polygons:
                p.material_index = 0
views(os.path.join(RENDER_DIR, 'short' if SHORT else 'plain'), False)
