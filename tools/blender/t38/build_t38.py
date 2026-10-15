# Builds the T-38A Talon's outside as a Blender master file, first pass (shared plan Step 3d items 1 to 3, with a first
# paint pass, item 5; docs/modules/shared/t38a-plan.md). Runs headless, with Blender 5.2 or the bpy module:
#
#   blender -b --factory-startup -P tools/blender/t38/build_t38.py -- <out>/t38.blend [<render dir>]
#   <venv>/bin/python tools/blender/t38/build_t38.py -- <out>/t38.blend [<render dir> [silhouettes | cockpit]]
#
# Every number is in the constants block below and names its row in sources.md (P = a public page, R = measured off a
# drawing Dad sent on 14 Oct 2026 (T2 Cullen's three-view, T3 Peeters' 1/72 drawings), D = read off Dad's Beale pictures
# (T6 profile print, T7 photo), K = the cockpit's layout read by eye off Dad's cockpit pictures (T8 to T12), E = an
# estimate).
#
# Axes and units follow the CT-156 and Astra scripts: real feet, nose +X, left +Y, up +Z. The origin (the named point
# `datum`) is the tip of the radome, the nose cone's point behind the pitot boom, so a part's station (feet behind the
# radome tip) is -X and the pitot reaches forward to +2.16 ft. Heights are feet above the radome tip. The X axis is the
# ground line of Peeters' side view (R1): on the ground, both main wheels and the nose wheel touch z = GROUND_Z.
#
# Parts are smooth-shaded with a hard edge where faces meet at more than SHARP_DEG, as the CT-156's and the Astra's are.
# The paint (D rows, the Beale AFB 9th Reconnaissance Wing scheme) is drawn into small generated pictures applied by
# position, as the Astra's; it is for renders and checking, and where the delivered model carries its paint is a question
# for Patrick at delivery (plan Step 3d item 6).
#
# With a render directory, the saved master is opened again and the full renders are made from it, twice: in plain
# colours (<render dir>/plain) and painted (<render dir>/painted): both quarters, below, and square-on side, front and top
# over a 1 ft grid; the painted set adds a view near the angle of Dad's photo T7. The plain set also writes the side and
# top silhouettes (`-alpha.png`) that the overlay sheets are made from.
#
# The cockpits (shared plan Step 3d item 7, first pass, "rough": shapes and layout, no working instruments; Dad, 14 Oct
# 2026: "lets workout the rough T-38A cockpit") are built here too, from the K and E rows of sources.md: the outside
# keeps the cockpit opening, the open canopy arches and a plain tub (`cockpitWell`), and everything else sits in the
# `cockpit` collection, which export_t38.py writes into its own file. `cockpit` after the render directory makes only
# the cockpit renders (<render dir>/cockpit: each seat's view, from above and behind, and a cutaway side view).
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
    sys.exit('usage: build_t38.py -- <out.blend> [<render dir> [silhouettes | cockpit]]')
OUT_BLEND = os.path.abspath(argv[0])
RENDER_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None
SILHOUETTES_ONLY = len(argv) > 2 and argv[2] == 'silhouettes'  # only the side and top silhouettes, for the overlays
COCKPIT_ONLY = len(argv) > 2 and argv[2] == 'cockpit'  # only the cockpit renders

IN_TO_FT = 1 / 12

# ---------- the numbers (each names its row in sources.md) ----------
# Published sizes (USAF fact sheets; the length runs to the pitot boom's tip, P2)
LENGTH_FT = 46 + 4 * IN_TO_FT       # P1 (46 ft 4 in); P2 gives 46 ft 4.5 in "including the nose probe"
SPAN_FT = 25 + 3 * IN_TO_FT         # P1 (also P3)
HEIGHT_FT = 12 + 10 * IN_TO_FT      # P1; P2 gives 12 ft 10.5 in
WING_AREA_FT2 = 170.0               # P3
WING_AR = 3.75                      # P3 aspect ratio
WING_TAPER = 0.20                   # P3 taper ratio
WING_SWEEP_QC_DEG = 24.0            # P3 quarter-chord sweep
WING_THICKNESS = 0.048              # P3 NACA 65A004.8 (built with the NACA 4-digit thickness shape at 4.8%, E1)
TRACK_FT = 10 + 9 * IN_TO_FT        # P3 tread
TAIL_AREA_FT2 = 59.0                # P3 horizontal tail, total (the size check only)
FIN_AREA_FT2 = 41.42                # P3 vertical tail, total (the size check only)
WHEELBASE_FT = 19 + 5 * IN_TO_FT    # P4 (a secondary page; the size check only)

# Frame and ends (R1, R2): stations ft behind the radome tip, heights ft above it
NOZZLE_EXIT_FT = 44.17              # R2 radome tip to the nozzles' exit: T3 44.22, T2 44.13
PITOT_LENGTH_FT = LENGTH_FT - NOZZLE_EXIT_FT  # R2: 2.16 ft (T3 2.11, T2 2.20); the published length is to its tip
GROUND_Z = -4.71                    # R1 ground under the wheels, T3 side view (fin top less HEIGHT_FT gives -4.70)

# Fuselage stations (R3 top and bottom from T3's side view, R4 half-widths from T2's top view): station ft, half-width ft,
# top ft, bottom ft, height of the widest point ft, superellipse power above and below the widest point. Under the
# canopy the top is a deck hidden inside the canopy (the canopy's sill is R5). Behind the canopy this is the main body
# only; the dorsal spine (SPINE) and the intakes (INTAKE) are their own parts.
FUSELAGE = [
    (0.00, 0.05, 0.05, -0.05, 0.00, 2.0, 2.0),
    (0.25, 0.24, 0.24, -0.27, -0.02, 2.0, 2.0),
    (0.70, 0.44, 0.35, -0.49, -0.06, 2.0, 2.0),
    (1.60, 0.68, 0.43, -0.64, -0.08, 2.2, 2.2),
    (3.00, 1.01, 0.62, -0.79, -0.08, 2.3, 2.3),
    (4.30, 1.26, 0.88, -0.91, -0.04, 2.4, 2.4),
    (5.70, 1.44, 1.20, -1.05, 0.05, 2.5, 2.5),
    (7.10, 1.61, 1.50, -1.17, 0.15, 2.5, 2.5),
    (8.00, 1.68, 1.80, -1.21, 0.25, 2.6, 2.6),
    (9.00, 1.70, 2.20, -1.22, 0.35, 2.6, 2.6),
    (10.0, 1.70, 2.30, -1.22, 0.35, 2.6, 2.6),
    (17.8, 1.70, 2.30, -1.22, 0.35, 2.6, 2.6),
    (19.5, 1.72, 2.25, -1.22, 0.35, 2.6, 2.6),
    (21.0, 1.78, 1.75, -1.22, 0.25, 2.6, 2.7),
    (23.0, 1.88, 1.45, -1.22, 0.15, 2.8, 2.8),
    (25.0, 2.02, 1.32, -1.24, 0.10, 3.0, 3.0),
    (26.5, 2.14, 1.27, -1.27, 0.05, 3.0, 3.0),
    (28.5, 2.26, 1.27, -1.31, 0.00, 3.0, 3.0),
    (30.6, 2.43, 1.27, -1.41, 0.00, 3.0, 3.0),
    (31.3, 2.52, 1.27, -1.44, 0.00, 3.0, 3.0),
    (34.6, 2.52, 1.27, -1.49, 0.00, 3.0, 3.0),
    (35.6, 2.40, 1.27, -1.45, 0.00, 3.0, 3.0),
    (36.7, 2.31, 1.27, -1.33, 0.00, 3.0, 3.0),
    (38.0, 2.18, 1.27, -1.16, 0.00, 3.0, 3.0),
    (39.4, 2.09, 1.26, -1.13, 0.00, 3.0, 3.0),
    (40.7, 1.92, 1.20, -1.12, 0.00, 3.0, 3.0),
    (41.4, 1.84, 1.12, -1.12, 0.00, 3.0, 3.0),
    (42.3, 1.80, 1.00, -1.12, -0.05, 3.0, 3.0),
]

# Dorsal spine (R3 top line from T3, R4 width from T2's top view): station ft, half-width ft, top ft. It sits on the
# body with its base buried at SPINE_BASE_Z, starts inside the canopy's aft end and runs into the fin's fillet.
SPINE = [
    (19.9, 1.10, 3.80), (20.3, 1.15, 3.78), (21.8, 1.30, 3.55), (23.0, 1.24, 3.38), (24.2, 1.16, 3.14),
    (25.3, 1.10, 3.03), (26.5, 1.03, 2.85), (27.7, 0.96, 2.67), (28.9, 0.84, 2.50), (30.0, 0.70, 2.32),
    (31.2, 0.58, 2.15), (32.0, 0.50, 2.06), (33.4, 0.38, 1.80), (34.8, 0.22, 1.40),
]
SPINE_BASE_Z = 0.9                  # E2 estimate: hidden inside the body
SPINE_POWER = 2.4                   # E2 estimate: roundness of the spine's section

# Canopy (R5): station ft, sill height ft, top height ft. Windshield 7.5 to 10.7 ft, front canopy 10.7 to 14.8 ft,
# rear canopy 14.8 to 20.3 ft (T3 side; T2's frames 0.3 to 0.7 ft further forward). The canopy is as wide as the body at its sill.
CANOPY = [
    (7.50, 1.56, 1.56), (8.10, 1.75, 1.85), (8.80, 1.88, 2.15), (9.50, 1.90, 2.50), (10.1, 1.90, 2.85),
    (10.7, 1.90, 3.20), (11.8, 1.90, 3.55), (13.0, 1.90, 3.79), (14.8, 1.90, 3.96), (17.1, 1.90, 4.02),
    (18.8, 1.90, 3.96), (20.3, 1.90, 3.78),
]
CANOPY_POWER = 2.5                  # R5: section roundness, T2 front view
CANOPY_FRAMES_FT = ((10.6, 10.8), (14.65, 14.95), (20.12, 20.32))  # R5: windshield bow, the split, the aft frame
CANOPY_SPLIT_FT = 14.8              # R5 front and rear canopies meet here
WINDSHIELD_AFT_FT = 10.7            # R5

# Intakes (R6, T2 top and front views, T3 and T2 side views): station ft, centre out ft, half-width ft, centre height ft,
# half-height ft. The outer edge (centre + half-width) is T2's top-view outline; the lip is slanted in the side view.
INTAKE = [
    (18.2, 2.29, 0.56, -0.10, 0.78), (19.1, 2.33, 0.65, -0.10, 0.80), (19.8, 2.33, 0.65, -0.12, 0.80),
    (21.1, 2.27, 0.59, -0.14, 0.77), (22.5, 2.19, 0.50, -0.16, 0.72), (23.8, 2.10, 0.42, -0.18, 0.65),
    (25.2, 1.98, 0.33, -0.20, 0.57), (26.5, 1.85, 0.30, -0.22, 0.50), (27.5, 1.75, 0.28, -0.24, 0.45),
]
INTAKE_LIP_SLANT_FT = 0.5           # R6: the lip's top is 1.0 ft ahead of its bottom (T2 1.1 ft, T3 0.9 ft)
INTAKE_POWER = 2.6                  # E3 estimate: section roundness
INTAKE_DUCT = (0.85, 0.75, 1.6)     # E3 estimate: inner lip scale, duct end scale, duct depth ft

# Wing (P3 planform, placed by R7): the trapezoid from P3's area, aspect ratio, taper and quarter-chord sweep, no
# dihedral (P3; flat on T2's front view). Its leading edge meets the centreline at WING_LE_ROOT_FT.
WING_LE_ROOT_FT = 20.3              # R7: fits T2 (20.32) and T3 (20.21) at the root's mid-chord
WING_Z_FT = -0.67                   # R7: chord plane, T3 side view (the root section drawn edge-on)
WING_ROOT_OUT_FT = 2.65             # R7: where the wing leaves the body (T2 2.69, T3 2.61)
FLAP_SPAN_FT = (2.65, 6.32)         # R7: T2 top view (T3: 6.4)
AILERON_SPAN_FT = (6.32, 8.86)      # R7: T2 top view (T3: 6.4 to 9.0)
HINGE_CHORD = 0.72                  # R7: flaps and ailerons are the aft 28% of the chord (T2: 0.69 to 0.74)

# Tailplane, all-moving (R8, T2 top view; height T3 side view)
TAIL_HALF_SPAN_FT = 7.0             # R8: T2 top 7.0, T2 front 6.99, T3 underside 7.0
TAIL_LE_FT = (34.64, 39.07)         # R8 leading edge at the centreline (extended), at the tip: mean of T2 and T3
TAIL_TE_FT = (41.0, 40.9)           # R8 trailing edge, likewise
TAIL_Z_FT = -1.55                   # R8: T3 side view -1.6; T2 front view 0.5 ft below the wing (-1.17)
TAIL_THICKNESS = 0.04               # E4 estimate
TAIL_PIVOT_FT = 37.6                # E5 estimate: the quarter-chord of the mean chord

# Fin and rudder (R9, T3 side view)
FIN_TOP_Z = GROUND_Z + HEIGHT_FT    # R9: T3's fin top, 8.13 ft above the radome tip; from P1's height here (8.12)
FIN_TIP_FT = (37.5, 40.5)           # R9 leading and trailing edge at the top
FIN_LE_SWEEP_DEG = 30.3             # R9 (T2 shows 38.7, the decal four-view 31)
FIN_TE_ROOT = (42.1, 1.27)          # R9 the trailing edge meets the body here (station, height)
FIN_FILLET = ((32.0, 2.05), (34.39, 2.80))  # R9 the dorsal fillet's leading edge, from the spine to the fin
FIN_ROOT_Z = 0.9                    # E6: hidden inside the body
FIN_THICKNESS = 0.045               # E6 estimate
RUDDER_HINGE_FT = 39.8              # R9: vertical hinge line (T2 39.78, T3 40.0)
RUDDER_Z = (1.27, 4.73)             # R9: foot and top of the rudder (T2: 3.38 ft tall)

# Nozzles and tail cone (R10)
NOZZLE_OUT_FT = 0.88                # R10: centres either side (T2 top view)
NOZZLE_Z_FT = -0.15                 # R10: T3 side view
NOZZLE_STATION_FT = 42.0            # R10: where the shrouds leave the body (T2: the body's end step at 42.1)
NOZZLE_RADIUS_FT = (0.95, 0.80)     # R10: shroud at its root and at the exit (T3 side 1.88 to 1.52 ft tall)
NOZZLE_DUCT = (0.70, 0.62, 1.0)     # E7 estimate: inner radius at the exit, at the duct's end, depth ft

# Gear, down (R11, T3 side view and undercarriage details; track P3)
NOSE_STATION_FT = 7.33              # R11
NOSE_WHEEL = (1.45, 0.40)           # R11 diameter (T3 side), width (T3 detail's proportion)
NOSE_PIVOT = (7.0, -1.0)            # E8 estimate: station, height
MAIN_STATION_FT = 27.15             # R11
MAIN_WHEEL = (1.65, 0.58)           # R11 diameter (T3 side), width (T3 detail's proportion)
MAIN_WHEEL_OUT_FT = TRACK_FT / 2    # P3: 5.375 ft
MAIN_LEG_OUT_FT = MAIN_WHEEL_OUT_FT - 0.45  # R11: the leg is inboard of the wheel (T3 detail); offset E8
MAIN_PIVOT_Z = -0.95                # E8 estimate: in the wing's lower skin
MAIN_DOOR = (26.4, 28.5, -0.85, -3.70)  # R11: the leg door outboard of the wheel, stations and heights (T3 side)
LEG_RADIUS = (0.17, 0.12)           # E8 estimate: main, nose

# Speed brakes under the fuselage (R12, T3 underside by eye; that these are the speed brakes is a guess)
SPEED_BRAKE = dict(s=(23.8, 25.4), out=(0.6, 1.55))

# Pitot boom (R2 length; shape E9)
PITOT = [(0.25, 0.11), (-0.30, 0.11), (-0.60, 0.045), (-PITOT_LENGTH_FT, 0.04)]  # E9 (station, radius)

# Named points
EYE_FRONT = (12.3, 3.0)             # E10 estimate (station, height), front cockpit
EYE_REAR = (17.3, 3.35)             # E10 estimate, rear cockpit (the rear seat sits higher)

# ---------- cockpits (shared plan Step 3d item 7, first pass; K = layout by eye off T8 to T12, E = estimate) ----------
# Every size here is an estimate (E12 to E22): no picture of the cockpit carries a scale, so the panel is scaled from its
# width (E14), the rest from the cockpit's outside width (R4, R5) and a seated pilot's eye height (E16). Stations ft
# behind the radome tip, heights ft above it, as everywhere in this script. The rear cockpit is the front one moved by
# REAR_SHIFT, its panel REAR_PANEL_RAISE higher again (K8).
SILL_Z = 1.90                       # R5: the canopy's sill, the cockpit opening's edge
COCKPIT_OPEN_FT = (9.6, 19.9)       # E12: the opening in the fuselage's top, from under the glare shield to the spine
TUB = dict(front=9.0, aft=19.85, wall=0.08, floor_front=-0.75, floor_rear=-0.40, step=13.9)  # E13: tub, walls 0.08 ft in from the skin
REAR_SHIFT = (EYE_REAR[0] - EYE_FRONT[0], EYE_REAR[1] - EYE_FRONT[1])  # K8: the rear cockpit is the front one, 5.0 ft aft and 0.35 ft up
REAR_PANEL_RAISE = 0.15             # K8, E21: the rear panel sits higher still, its hood over the front seat's headbox
# The main instrument panel (K1 to K4, E14): its top centre, how far its face leans back from upright (the top forward),
# and its layout in panel feet: u to the pilot's right, v up from the top centre (negative down). Scaled so the main
# panel is 2.15 ft across its shoulders (E14), which makes the attitude indicator's frame 4.7 in and the engine gauges
# about 1.8 in across.
PANEL_TOP = (10.05, 2.47)           # E15: station, height of the panel's top centre
PANEL_LEAN_DEG = 12.0               # E15
PANEL_TOP_FLAT_U = 0.47             # K2: the top edge is flat to here, then slopes down at the shoulders
PANEL_SHOULDER = (1.075, -0.31)     # K2: the shoulder's corner (u, v); the top edge carries on down to the glass
PANEL_MAIN_BOTTOM_V = -0.83         # K2: the main panel's foot; below it the lower panel, wider
PANEL_LOWER = dict(half=1.28, knee_top=-1.15, bottom=-1.57, pedestal=0.21, knee=(0.21, 0.90))  # K3: lower panel, knee wells, pedestal
GLARE_SHIELD = dict(front=9.5, lip_aft=0.30, lip_up=0.08, thick=0.10)  # E15: hood from 9.5 ft, lip 0.3 ft aft of the panel top
# Gauges (K4): kind, u, v, radius ft. 'adi' attitude indicator, 'hsi', 'dial' a round gauge, 'light' a light face.
PANEL_GAUGES = [
    ('adi', -0.07, -0.22, 0.164), ('hsi', -0.07, -0.61, 0.164),
    ('dial', -0.41, -0.23, 0.12),                                    # airspeed and Mach, left of the attitude indicator
    ('dial', 0.27, -0.21, 0.12), ('dial', 0.27, -0.51, 0.12),        # altimeter, vertical velocity
    ('dial', -0.65, -0.26, 0.093), ('dial', -0.62, -0.47, 0.087), ('light', -0.415, -0.47, 0.087),
    ('dial', -0.62, -0.68, 0.093), ('dial', 0.21, -0.73, 0.04), ('dial', 0.33, -0.73, 0.04),
    ('dial', 0.48, -0.22, 0.071), ('dial', 0.63, -0.22, 0.071), ('dial', 0.48, -0.37, 0.071), ('dial', 0.63, -0.37, 0.071),
    ('dial', 0.83, -0.34, 0.093),
    ('dial', 0.48, -0.54, 0.076), ('dial', 0.63, -0.54, 0.076), ('dial', 0.80, -0.54, 0.076), ('dial', 0.96, -0.54, 0.076),
    ('dial', 0.48, -0.70, 0.076), ('dial', 0.63, -0.70, 0.076), ('dial', 0.80, -0.70, 0.076), ('dial', 0.96, -0.70, 0.076),
    ('dial', -0.64, -0.93, 0.07), ('dial', 1.14, -1.37, 0.075),
]
# Square black backings (K4): u0, u1, v0, v1 (attitude indicator, HSI, airspeed, altimeter, vertical velocity)
PANEL_FRAMES = [(-0.27, 0.13, -0.43, -0.03), (-0.27, 0.13, -0.78, -0.44), (-0.54, -0.28, -0.36, -0.10),
                (0.13, 0.40, -0.34, -0.08), (0.14, 0.40, -0.65, -0.38)]
# Lamps (K5): u, v, width, height ft, colour: the fire lights at both ends, the warning lights on top, the gear lights
PANEL_LAMPS = [(-0.88, -0.36, 0.10, 0.045, 'fire'), (0.99, -0.36, 0.10, 0.045, 'fire'),
               (0.26, -0.05, 0.10, 0.04, 'amber'), (0.43, -0.055, 0.10, 0.04, 'fire'),
               (-0.92, -0.59, 0.025, 0.025, 'green'), (-0.86, -0.59, 0.025, 0.025, 'green'), (-0.80, -0.59, 0.025, 0.025, 'green'),
               (0.27, -0.90, 0.04, 0.10, 'fire'), (0.75, -0.89, 0.04, 0.09, 'fire'), (0.92, -0.89, 0.04, 0.09, 'fire'),
               (-1.18, -1.33, 0.05, 0.10, 'fire'), (0.92, -1.33, 0.04, 0.10, 'fire'), (1.00, -1.33, 0.04, 0.10, 'fire')]
# Black switch panels on the lower panel and pedestal (K3): u0, u1, v0, v1
PANEL_BLOCKS = [(-0.68, -0.22, -1.15, -0.85), (-1.27, -0.91, -1.46, -1.08), (-1.06, -0.89, -1.01, -0.85),
                (-0.19, 0.20, -1.17, -0.85), (-0.19, 0.20, -1.56, -1.19), (0.24, 0.65, -1.15, -0.85),
                (0.66, 1.04, -1.05, -0.85), (0.85, 1.06, -1.46, -1.17)]
GEAR_LEVER = (-0.86, -0.75)         # K5: the landing gear lever on the left of the main panel (u, v)
AOA_INDEXER_Y = -0.03               # K6: on the glare shield's top centre (T11, T12)
STANDBY_COMPASS = (10.85, -0.55, 2.82)  # K6, E22: hung from the windshield bow, upper right (T10, T11, T12)
MIRRORS = dict(s=10.82, out=0.70, z=2.85, w=0.28, h=0.14)  # K6, E22: a rear-view mirror each side on the bow (T10, T11)
# Side consoles (K7, E17): from the panel aft beside the seat, the throttle quadrant on the left
CONSOLE = dict(s=(10.45, 12.80), top=0.97, inboard=1.17)
THROTTLE = dict(s=11.25, out=(1.28, 1.44), top=1.30, slot=(10.91, 11.60))  # K7, E17: two levers side by side
# Ejection seat (K9, E16): the cushion's top, the pan's front, the back's foot and top, the headbox
SEAT = dict(pan_front=11.35, back_foot=12.75, cushion_z=0.45, half=0.62, frame_half=0.72, back_top=(13.08, 2.55),
            back_depth=0.34, headbox=(13.05, 13.65, 2.55, 3.35, 0.42))
STICK = dict(base=(11.15, -0.75), boot_top=(11.12, -0.35), grip_foot=(11.05, 0.50), grip_top=(11.08, 0.90))  # K10, E18
PEDALS = dict(s=9.45, out=0.40, z=(-0.70, -0.25), w=0.18)  # K10, E18
FOOTWELL_CEILING_Z = 1.33           # E13: under the panel, over the pedals (the knee wells' top, K3)
WINDSCREEN_FRAME_DEPTH = (0.12, 0.08, 0.08)  # E19: how far each bow stands in from the glass (the windshield's is thick, T10)
INTER_WINDSCREEN_FT = 14.98         # E20: the rear cockpit's own windscreen, on its panel's shroud (fix list 4)
SHROUD_FRONT_Z = 2.55               # E21: the shroud's top behind the front seat's headbox, which stands 0.8 ft above it

SHARP_DEG = 40  # as build_ct156_exterior.py: faces meeting at more than this keep a hard edge

# ---------- Beale AFB paint (D rows: T6 profile print and T7 photo, Dad, 14 Oct 2026) ----------
# Colours are sRGB 0 to 255 read off T7 away from reflections (D1); the black is a gloss black (T7 reads 8, 7, 14 in shade).
PAINT_RGB = {'black': (20, 20, 23), 'red': (180, 28, 36), 'metal': (185, 180, 174), 'darkMetal': (70, 68, 66),
             'grey': (200, 201, 205), 'tyre': (28, 29, 32), 'duct': (12, 12, 14), 'frame': (34, 34, 38),
             'white': (235, 235, 235), 'interior': (128, 136, 144)}
BARE_METAL_FROM_FT = 41.1           # D2: T7 3.7 ft and T6 2.7 ft of bare metal ahead of the exit; mean
STAR_COLOUR = 'black'               # D3: T6 and T7 show the fin band's stars dark; the plan's description says white
# Markings: on = which picture; s, z = centre (station ft, height ft above the radome tip); sizes in ft. Lettering is
# Blender's built-in face, scaled to the pictures' sizes; the real stencil face is not copied (D9).
MARKS = [
    dict(on='fuselage', kind='text', text='U.S. AIR FORCE', s=25.3, z=0.10, width=4.6),        # D4
    dict(on='fuselage', kind='starbar', s=29.6, z=0.20, width=1.8, diameter=0.9),             # D5
    dict(on='fuselage', kind='text', text='U', s=34.5, z=-0.55, height=0.75),                 # D6
    dict(on='fuselage', kind='arrow', s=14.5, z=1.50, width=0.35),                            # D7
    dict(on='fuselage', kind='bar', s=14.3, z=0.70, width=1.1, height=0.14),                  # D7
]
# The fin's markings, placed by the fraction of the chord from the leading edge and the depth below the fin's top (D8)
FIN_BAND_DEPTH = 0.5                # D8 red band at the fin's top
FIN_STARS = 5                       # D8
FIN_MARKS = [
    dict(kind='badge', frac=0.35, below=2.84, height=0.70, width=0.60),
    dict(kind='text', text='BB', frac=0.38, below=4.08, height=0.90),
    dict(kind='text', text='247', frac=0.42, below=5.27, height=0.62),
    dict(kind='text', text='AF', frac=0.25, below=5.10, height=0.26),
]

# ---------- worked out from the numbers above ----------
WING_HALF_SPAN = SPAN_FT / 2
WING_ROOT_CHORD = 2 * WING_AREA_FT2 / (SPAN_FT * (1 + WING_TAPER))   # at the centreline: 11.22 ft
WING_TIP_CHORD = WING_ROOT_CHORD * WING_TAPER                        # 2.24 ft
TAN_LE = math.tan(math.radians(WING_SWEEP_QC_DEG)) + (1 - WING_TAPER) / (WING_AR * (1 + WING_TAPER))
TAN_TE = TAN_LE - 4 * (1 - WING_TAPER) / (WING_AR * (1 + WING_TAPER))


def X(station):
    return -station


# ---------- shapes (the helpers are the Astra's, build_ct102b.py) ----------
def naca(x, t):
    """Symmetric NACA 4-digit thickness at x (0 leading edge, 1 trailing edge): half-thickness / chord, closed edge."""
    return 5 * t * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)


N_FOIL = 18


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
    """Joins rings of points (each the same count) into faces; closed=False leaves each ring an open line (an arch)."""
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


def fuselage_ring(s, n=56):
    hw, top, bot, zw, pu, pl = (pchip(FUSELAGE, s, c) for c in range(1, 7))
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, si = math.cos(t), math.sin(t)
        p = pu if si >= 0 else pl
        z = zw + (top - zw) * se(si, pu) if si >= 0 else zw + (zw - bot) * se(si, pl)
        pts.append((X(s), hw * se(c, p), z))
    if COCKPIT_OPEN_FT[0] <= s <= COCKPIT_OPEN_FT[1]:  # over the cockpit, the top is laid flat at the sill and cut away
        pts = [(x, y, min(z, SILL_Z)) for x, y, z in pts]
    return pts


def cut_cockpit(bm):
    """Removes the fuselage's top over the cockpit (E12): the faces laid flat at the sill, so the skin ends at the sill."""
    gone = [f for f in bm.faces if all(v.co.z >= SILL_Z - 1e-6 for v in f.verts)
            and all(COCKPIT_OPEN_FT[0] - 1e-6 <= -v.co.x <= COCKPIT_OPEN_FT[1] + 1e-6 for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')


def body_halfwidth_at(s, z):
    """Half-width of the body's section at station s and height z (0 outside it)."""
    hw, top, bot, zw, pu, pl = (pchip(FUSELAGE, s, c) for c in range(1, 7))
    if z >= zw:
        f, p = min(1.0, (z - zw) / (top - zw)), pu
    else:
        f, p = min(1.0, (zw - z) / (zw - bot)), pl
    return hw * max(0.0, 1 - f ** p) ** (1 / p)


# ---------- materials ----------
def linear(c):
    return tuple(((v / 255 + 0.055) / 1.055) ** 2.4 if v > 10.3 else v / 255 / 12.92 for v in c)


PLAIN_RGB = {'airframe': (205, 206, 210), 'surface': (190, 192, 198), 'canopy': (115, 158, 199), 'frame': (60, 62, 66),
             'gear': (215, 215, 218), 'tyre': (30, 32, 36), 'metal': (150, 148, 145), 'duct': (25, 25, 28),
             'brake': (175, 177, 182), 'interior': (120, 126, 132)}


def bsdf_material(name, rgb, rough=0.35, metal=0.0, glass=False):
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
    if glass:  # a thin tinted see-through surface: clean at few samples, unlike refraction
        b.inputs['Alpha'].default_value = 0.28
        b.inputs['Roughness'].default_value = 0.05
    return m


def plain(name):
    return bsdf_material('plain_' + name, PLAIN_RGB[name], rough=0.6 if name in ('tyre', 'gear', 'duct') else 0.4,
                         glass=False)


def part(name, colours, make, cockpit=False):
    """One named mesh object: make(bm) draws it (faces may pick a material by index into colours); smooth-shaded with
    hard edges past SHARP_DEG. colours are PLAIN_RGB names; the plain names are kept on the object for the renders.
    With cockpit=True the colours are COCKPIT_RGB names, the part goes into the `cockpit` collection and keeps its own
    colours in the plain renders too."""
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
        mesh.materials.append(cockpit_mat(c) if cockpit else plain(c))
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
    obj = bpy.data.objects.new(name, mesh)
    if cockpit:
        cockpit_collection().objects.link(obj)
    else:
        obj['plain'] = colours
        bpy.context.collection.objects.link(obj)
    return obj


# The cockpit's colours (sRGB), read by eye off Dad's cockpit photos T8 and T9 (K11; estimates): the grey of the walls,
# consoles and panel, black switch panels and glare shield, the seat's grey cushions and khaki harness, yellow handles.
COCKPIT_RGB = {'interior': (138, 146, 154), 'panel': (172, 177, 182), 'black': (26, 26, 29), 'cushion': (96, 99, 98),
               'seatFrame': (66, 68, 70), 'harness': (122, 112, 78), 'yellow': (226, 184, 38), 'floor': (70, 72, 76),
               'boot': (24, 24, 26), 'mirror': (110, 122, 132), 'metal': (165, 165, 162), 'grip': (32, 32, 34),
               'fire': (205, 30, 30), 'amber': (230, 150, 30), 'green': (60, 200, 90), 'glass': (150, 170, 185)}


def cockpit_mat(k):
    if k == 'glass':
        return bsdf_material('cockpit_glass', COCKPIT_RGB[k], glass=True)
    rough = {'mirror': 0.08, 'metal': 0.3, 'black': 0.6, 'cushion': 0.85, 'harness': 0.8, 'floor': 0.8}.get(k, 0.55)
    return bsdf_material('cockpit_' + k, COCKPIT_RGB[k], rough=rough, metal=1.0 if k in ('mirror', 'metal') else 0.0)


def cockpit_collection():
    c = bpy.data.collections.get('cockpit')
    if not c:
        c = bpy.data.collections.new('cockpit')
        bpy.context.scene.collection.children.link(c)
    return c


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


def aligned(v, want):
    v = Vector(v).normalized()
    return v if v.dot(Vector(want)) >= 0 else -v


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- fuselage, spine, canopy, intakes, pitot ----------
FUS_STATIONS = sorted(set(steps(0.0, 1.6, 0.1) + steps(1.6, FUSELAGE[-1][0], 0.25)))
part('fuselage', 'airframe', lambda bm: (loft(bm, [fuselage_ring(s) for s in FUS_STATIONS]), cut_cockpit(bm)))


def spine_ring(s, n=33):
    hw, top = pchip(SPINE, s, 1), pchip(SPINE, s, 2)
    h = top - SPINE_BASE_Z
    pts = [(X(s), hw * se(math.cos(t), SPINE_POWER), SPINE_BASE_Z + h * abs(math.sin(t)) ** (2 / SPINE_POWER))
           for t in (math.pi * k / (n - 1) for k in range(n))]
    return pts + [(X(s), -hw * 0.6, SPINE_BASE_Z - 0.05), (X(s), hw * 0.6, SPINE_BASE_Z - 0.05)]  # flat base


part('spine', 'airframe', lambda bm: loft(bm, [spine_ring(s) for s in steps(SPINE[0][0], SPINE[-1][0], 0.2)]))


def canopy_rings(s0, s1, grow=0.0, n=33, step=0.1):
    rings = []
    for s in steps(s0, s1, step):
        sill = pchip(CANOPY, s, 1)
        w = max(0.03, body_halfwidth_at(s, sill))
        h = max(pchip(CANOPY, s, 2) - sill, 0.03)
        p = CANOPY_POWER
        rings.append([(X(s), (w + grow) * se(math.cos(t), p), sill - grow * 0.5 + (h + grow) * abs(math.sin(t)) ** (2 / p))
                      for t in (math.pi * k / (n - 1) for k in range(n))])
    return rings


def canopy_hw(s, z):
    """Half-width of the canopy's glass at station s and height z (0 above its top); below the sill, the body's."""
    sill = pchip(CANOPY, s, 1)
    if z <= sill:
        return body_halfwidth_at(s, z)
    w, h = max(0.03, body_halfwidth_at(s, sill)), max(pchip(CANOPY, s, 2) - sill, 0.03)
    f = (z - sill) / h
    if f >= 1:
        return 0.0
    sin_t = f ** (CANOPY_POWER / 2)
    return w * math.sqrt(max(0.0, 1 - sin_t ** 2)) ** (2 / CANOPY_POWER)


def arch_band(bm, s0, s1, out, inward, step=0.05):
    """A canopy bow: a band round the canopy from sill to sill, `out` ft proud of the glass and `inward` ft inside it."""
    outer, inner = canopy_rings(s0, s1, grow=out, step=step), canopy_rings(s0, s1, grow=-inward, step=step)
    loft(bm, outer, caps=False, closed=False)
    loft(bm, inner, caps=False, closed=False)
    for ring_o, ring_i in ((outer[0], inner[0]), (outer[-1], inner[-1])):  # the band's fore and aft faces
        vo, vi = [bm.verts.new(p) for p in ring_o], [bm.verts.new(p) for p in ring_i]
        for k in range(len(vo) - 1):
            bm.faces.new((vo[k], vo[k + 1], vi[k + 1], vi[k]))
    for k in (0, -1):  # the feet
        bm.faces.new([bm.verts.new(p) for p in (outer[0][k], outer[-1][k], inner[-1][k], inner[0][k])])


# The glass is open below (no floor across the sill) and at its ends, so it reads as glass from inside the cockpit too.
part('windshield', 'canopy', lambda bm: loft(bm, canopy_rings(CANOPY[0][0], WINDSHIELD_AFT_FT), caps=False, closed=False))
part('canopyFront', 'canopy', lambda bm: loft(bm, canopy_rings(WINDSHIELD_AFT_FT, CANOPY_SPLIT_FT), caps=False, closed=False))
part('canopyRear', 'canopy', lambda bm: loft(bm, canopy_rings(CANOPY_SPLIT_FT, CANOPY[-1][0]), caps=False, closed=False))
for k, (a, b) in enumerate(CANOPY_FRAMES_FT):
    part(('canopyFrameWindshield', 'canopyFrameSplit', 'canopyFrameAft')[k], 'frame',
         lambda bm, a=a, b=b, k=k: arch_band(bm, a, b, 0.035, WINDSCREEN_FRAME_DEPTH[k]))


def sill_rail(bm, side):
    """The canopy's lower frame along the sill, both canopies (R5)."""
    rings = []
    for s in steps(CANOPY[0][0] + 0.3, CANOPY[-1][0], 0.25):
        sill = pchip(CANOPY, s, 1)
        w = body_halfwidth_at(s, sill)
        c = Vector((X(s), side * (w + 0.01), sill + 0.06))
        rings.append([c + Vector((0, side * 0.04 * math.cos(t), 0.07 * math.sin(t))) for t in
                      (2 * math.pi * k / 8 for k in range(8))])
    loft(bm, rings)


part('canopySill', 'frame', lambda bm: (sill_rail(bm, 1), sill_rail(bm, -1)))


def floor_z(s):
    return TUB['floor_front'] if s < TUB['step'] else TUB['floor_rear']


def wall_hw(s, z):
    """Half-width of the tub's inside at station s and height z: the skin less the wall (E13)."""
    return body_halfwidth_at(s, z) - TUB['wall']


def tub_profile(s, nz=14):
    """The tub's section at station s, left sill to right sill: a ledge in from the skin's cut edge, down the left wall,
    across the floor, up the right wall and out to the right ledge (E13)."""
    top, bottom = SILL_Z - 0.005, floor_z(s)
    zs = [top + (bottom - top) * k / (nz - 1) for k in range(nz)]
    left = [(X(s), body_halfwidth_at(s, SILL_Z), top)] + [(X(s), wall_hw(s, z), z) for z in zs]
    return left + [(x, -y, z) for x, y, z in reversed(left)]


def cockpit_well(bm):
    """The plain tub under the cockpit opening, in the outside model, so the outside never shows a hole: walls and floor
    (one step up to the rear seat's floor, K8), the footwell's front end and the bulkhead behind the rear seat."""
    st = sorted(set(steps(TUB['front'], TUB['aft'], 0.25)) | {TUB['step'] - 0.01, TUB['step'] + 0.01})
    rings = [tub_profile(s) for s in st]
    loft(bm, rings, caps=False, closed=False)
    front = [p for p in rings[0] if p[2] <= FOOTWELL_CEILING_Z]  # the footwell's front end, up to the ceiling
    bm.faces.new([bm.verts.new(p) for p in front])
    aft = rings[-1] + [p for p in reversed(canopy_rings(TUB['aft'], TUB['aft'], grow=-0.01)[0])]
    bm.faces.new([bm.verts.new(p) for p in aft])


part('cockpitWell', 'interior', cockpit_well)


def intake_ring(s, side, scale=1.0, slant=True, n=40, ds=0.0):
    c, w, zc, h = (pchip(INTAKE, s, k) for k in range(1, 5))
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        y = c + w * scale * se(math.cos(t), INTAKE_POWER)
        z = zc + h * scale * se(math.sin(t), INTAKE_POWER)
        st = s + ds - (INTAKE_LIP_SLANT_FT * (z - zc) / h if slant else 0.0)
        pts.append((X(st), side * y, z))
    return pts


def intake(bm, side):
    s0 = INTAKE[0][0]
    inner, end, depth = INTAKE_DUCT
    outer = [intake_ring(s, side, slant=(s == s0)) for s in steps(s0, INTAKE[-1][0], 0.25)]
    rings = [intake_ring(s0, side, scale=end, ds=depth), intake_ring(s0, side, scale=inner)] + outer
    loft(bm, rings, caps=True, cap_mat=(1, 0))


for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'intake{lr}', ('airframe', 'duct'), lambda bm, s=side: intake(bm, s))


def pitot(bm):
    for (s0, r0), (s1, r1) in zip(PITOT, PITOT[1:]):
        cylinder(bm, (X(s0), 0, 0), (X(s1), 0, 0), r0, r1, seg=16)


part('pitot', 'frame', pitot)

# ---------- wing, with flaps and ailerons ----------


def wing_le(y):
    return WING_LE_ROOT_FT + abs(y) * TAN_LE


def wing_te(y):
    return WING_LE_ROOT_FT + WING_ROOT_CHORD + abs(y) * TAN_TE


def wing_ring(y, a, b, side):
    le, c = wing_le(y), wing_te(y) - wing_le(y)
    return [(X(le + x * c), side * y, WING_Z_FT + zc * c) for x, zc in foil(a, b, WING_THICKNESS)]


def wing_span(y0, y1, a, b, side):
    return [wing_ring(y, a, b, side) for y in steps(y0, y1, 0.5)]


def wing_main(bm, side):
    loft(bm, wing_span(0.0, FLAP_SPAN_FT[0], 0, 1, side))
    loft(bm, wing_span(FLAP_SPAN_FT[0], FLAP_SPAN_FT[1], 0, HINGE_CHORD, side))
    loft(bm, wing_span(AILERON_SPAN_FT[0], AILERON_SPAN_FT[1], 0, HINGE_CHORD, side))
    loft(bm, wing_span(AILERON_SPAN_FT[1], WING_HALF_SPAN, 0, 1, side))


def hinge_point(y):
    return Vector((X(wing_le(y) + HINGE_CHORD * (wing_te(y) - wing_le(y))), y, WING_Z_FT))


TE_DOWN = (0, -1, 0)  # aft x down: a positive turn moves a trailing edge down (as the Astra's)
for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'wing{lr}', 'airframe', lambda bm, s=side: wing_main(bm, s))
    for surf, (y0, y1) in (('flap', FLAP_SPAN_FT), ('aileron', AILERON_SPAN_FT)):
        obj = part(f'{surf}{lr}', 'surface',
                   lambda bm, a=y0, b=y1, s=side: loft(bm, wing_span(a, b, HINGE_CHORD, 1, s)))
        p0, p1 = hinge_point(y0), hinge_point(y1)
        p0.y *= side
        p1.y *= side
        h = empty(f'{surf}{lr}Hinge', (p0 + p1) / 2, aligned(p1 - p0, TE_DOWN), positive='trailing edge down',
                  travel='not set (no source yet)', source='R7 (measured, T2)')
        attach(obj, h)

# ---------- tailplane (all-moving), fin and rudder ----------


def tail_le(y):
    return TAIL_LE_FT[0] + (TAIL_LE_FT[1] - TAIL_LE_FT[0]) * abs(y) / TAIL_HALF_SPAN_FT


def tail_te(y):
    return TAIL_TE_FT[0] + (TAIL_TE_FT[1] - TAIL_TE_FT[0]) * abs(y) / TAIL_HALF_SPAN_FT


def tail_ring(y):
    le, c = tail_le(y), tail_te(y) - tail_le(y)
    return [(X(le + x * c), y, TAIL_Z_FT + zc * c) for x, zc in foil(0, 1, TAIL_THICKNESS)]


tailplane = part('tailplane', 'surface',
                 lambda bm: loft(bm, [tail_ring(y) for y in sorted(set(steps(-TAIL_HALF_SPAN_FT, TAIL_HALF_SPAN_FT, 0.5)) | {0.0})]))
attach(tailplane, empty('tailplanePivot', (X(TAIL_PIVOT_FT), 0, TAIL_Z_FT), TE_DOWN, positive='trailing edge down',
                        travel='not set (no source yet)', source='R8 (planform, measured), E5 (pivot, estimate)'))

TAN_FIN = math.tan(math.radians(FIN_LE_SWEEP_DEG))


def fin_le(z):
    if z >= FIN_FILLET[1][1]:
        return FIN_TIP_FT[0] - (FIN_TOP_Z - z) * TAN_FIN
    (s0, z0), (s1, z1) = FIN_FILLET
    z = max(z, z0)
    return s0 + (s1 - s0) * (z - z0) / (z1 - z0)


def fin_te(z):
    s0, z0 = FIN_TE_ROOT
    return s0 + (FIN_TIP_FT[1] - s0) * (z - z0) / (FIN_TOP_Z - z0)


def fin_ring(z, s_from, s_to):
    c = s_to - s_from
    cf = fin_te(z) - fin_le(z)
    a, b = (s_from - fin_le(z)) / cf, (s_to - fin_le(z)) / cf
    return [(X(fin_le(z) + x * cf), zc * cf, z) for x, zc in foil(a, b, FIN_THICKNESS)]


def fin(bm):
    lower = sorted(set(steps(FIN_ROOT_Z, RUDDER_Z[1], 0.2)) | {FIN_FILLET[0][1], FIN_FILLET[1][1]})
    loft(bm, [fin_ring(z, fin_le(z), RUDDER_HINGE_FT) for z in lower])
    loft(bm, [fin_ring(z, fin_le(z), fin_te(z)) for z in steps(RUDDER_Z[1], FIN_TOP_Z, 0.2)])


part('fin', 'airframe', fin)
rudder = part('rudder', 'surface',
              lambda bm: loft(bm, [fin_ring(z, RUDDER_HINGE_FT, fin_te(z)) for z in steps(*RUDDER_Z, 0.2)]))
attach(rudder, empty('rudderHinge', (X(RUDDER_HINGE_FT), 0, sum(RUDDER_Z) / 2), (0, 0, 1), positive='trailing edge right',
                     travel='not set (no source yet)', source='R9 (measured, T3 and T2)'))

# ---------- nozzles (bare metal) ----------


def nozzle(bm, side):
    r_in, r_end, depth = NOZZLE_DUCT
    c = lambda s: Vector((X(s), side * NOZZLE_OUT_FT, NOZZLE_Z_FT))  # noqa: E731
    seg = 32
    ring = lambda s, r: [c(s) + Vector((0, r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg)))  # noqa: E731
                         for k in range(seg)]
    rings = [ring(NOZZLE_STATION_FT, NOZZLE_RADIUS_FT[0])]
    for s in steps(NOZZLE_STATION_FT, NOZZLE_EXIT_FT, 0.25)[1:]:
        f = (s - NOZZLE_STATION_FT) / (NOZZLE_EXIT_FT - NOZZLE_STATION_FT)
        rings.append(ring(s, NOZZLE_RADIUS_FT[0] + (NOZZLE_RADIUS_FT[1] - NOZZLE_RADIUS_FT[0]) * f ** 1.5))
    rings += [ring(NOZZLE_EXIT_FT, r_in), ring(NOZZLE_EXIT_FT - depth, r_end)]
    loft(bm, rings, caps=True, cap_mat=(0, 1))


for side, lr in ((1, 'Left'), (-1, 'Right')):
    part(f'nozzle{lr}', ('metal', 'duct'), lambda bm, s=side: nozzle(bm, s))

# ---------- speed brakes (closed) ----------
for side, lr in ((1, 'Left'), (-1, 'Right')):
    (s0, s1), (o0, o1) = SPEED_BRAKE['s'], SPEED_BRAKE['out']

    def brake(bm, sd=side):
        rings = []
        for s in steps(s0, s1, 0.2):
            z = pchip(FUSELAGE, s, 3) - 0.015
            rings.append([(X(s), sd * o0, z), (X(s), sd * o1, z), (X(s), sd * o1, z - 0.04), (X(s), sd * o0, z - 0.04)])
        loft(bm, rings)

    obj = part(f'speedBrake{lr}', 'brake', brake)
    attach(obj, empty(f'speedBrake{lr}Hinge', (X(s0), side * (o0 + o1) / 2, pchip(FUSELAGE, s0, 3)), TE_DOWN,
                      positive='opens (trailing edge down)', travel='not set (no source yet)',
                      source='R12 (position by eye on T3; identification a guess)'))

# ---------- landing gear, down ----------


def wheel(bm, centre, dia, width):
    c = Vector(centre)
    cylinder(bm, c - Vector((0, width / 2, 0)), c + Vector((0, width / 2, 0)), dia / 2, seg=32)


for side, lr in ((1, 'Left'), (-1, 'Right')):
    dia, width = MAIN_WHEEL
    axle_z = GROUND_Z + dia / 2
    pivot = Vector((X(MAIN_STATION_FT), side * MAIN_LEG_OUT_FT, MAIN_PIVOT_Z))
    axle = Vector((X(MAIN_STATION_FT), side * MAIN_LEG_OUT_FT, axle_z))
    centre = Vector((X(MAIN_STATION_FT), side * MAIN_WHEEL_OUT_FT, axle_z))
    hinge = empty(f'gearMain{lr}Hinge', pivot, (-side, 0, 0), positive='leg up (folds inwards, estimate)',
                  travel='not set (no source yet)', source='R11 (wheel, door), P3 (track), E8 (pivot, estimate)')

    def leg(bm, a=pivot, b=axle, w=centre):
        cylinder(bm, a, b - Vector((0, 0, 0.1)), LEG_RADIUS[0])
        cylinder(bm, b, w, LEG_RADIUS[0] * 0.6)

    def door(bm, sd=side):
        sa, sb, za, zb = MAIN_DOOR
        y = sd * (MAIN_WHEEL_OUT_FT + width / 2 + 0.08)
        rings = [[(X(sa), y - 0.02, za), (X(sb), y - 0.02, za), (X(sb), y - 0.02, zb), (X(sa), y - 0.02, zb)],
                 [(X(sa), y + 0.02, za), (X(sb), y + 0.02, za), (X(sb), y + 0.02, zb), (X(sa), y + 0.02, zb)]]
        loft(bm, rings)

    for name, colour, make in ((f'gearMain{lr}Leg', 'gear', leg), (f'gearMain{lr}Door', 'brake', door),
                               (f'gearMain{lr}Wheel', 'tyre', lambda bm, w=centre: wheel(bm, w, dia, width))):
        attach(part(name, colour, make), hinge)

dia, width = NOSE_WHEEL
nose_pivot = Vector((X(NOSE_PIVOT[0]), 0, NOSE_PIVOT[1]))
nose_axle = Vector((X(NOSE_STATION_FT), 0, GROUND_Z + dia / 2))
fork_top = nose_axle + Vector((0, 0, dia / 2 + 0.12))
fork_y = width / 2 + 0.06


def nose_leg(bm):
    cylinder(bm, nose_pivot, fork_top, LEG_RADIUS[1])
    cylinder(bm, fork_top + Vector((0, fork_y, 0)), fork_top - Vector((0, fork_y, 0)), 0.06)
    for sgn in (1, -1):
        cylinder(bm, fork_top + Vector((0, sgn * fork_y, 0)), nose_axle + Vector((0, sgn * fork_y, 0)), 0.05)


nose_hinge = empty('gearNoseHinge', nose_pivot, (0, -1, 0), positive='leg swings forward (direction not confirmed)',
                   travel='not set (no source yet)', source='R11 (wheel, measured), E8 (pivot, estimate)')
attach(part('gearNoseLeg', 'gear', nose_leg), nose_hinge)
attach(part('gearNoseWheel', 'tyre', lambda bm: wheel(bm, nose_axle, dia, width)), nose_hinge)

# ---------- named points ----------
empty('datum', (0, 0, 0), source='the model origin: the radome tip (not the weighing datum, which is in the flight manual)')
empty('pitotTip', (X(-PITOT_LENGTH_FT), 0, 0), source='R2: the published length runs to here (P1, P2)')
empty('eyeFront', (X(EYE_FRONT[0]), 0, EYE_FRONT[1]), source='E10 (estimate), tandem seats P1')
empty('eyeRear', (X(EYE_REAR[0]), 0, EYE_REAR[1]), source='E10 (estimate), tandem seats P1')

# ---------- Beale paint (constants above; rows D1 to D9) ----------
import numpy as np  # noqa: E402  (the bpy module needs it, so it is always there)

TMP_DIR = tempfile.mkdtemp()
SS = 2  # pictures are drawn at twice the size and averaged down, for smooth edges


def rgbf(k):
    return np.array(PAINT_RGB[k]) / 255


def glyph_triangles(text):
    """The text's outline as triangles, centred, height 1, from Blender's built-in face (as the Astra's)."""
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


def draw_mark(canvas, m, cx, cy, px, colour='red'):
    """Draws one marking into the canvas (rows from the bottom), centred at pixel (cx, cy), px pixels per foot. The
    shapes are simple geometric stand-ins, not copied artwork (D9)."""
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
    lw = 0.035
    if m['kind'] == 'starbar':  # D5: low-visibility star-and-bar, red outline only
        R = m['diameter'] / 2
        r = np.hypot(X_, Y_)
        ring = np.abs(r - R) < lw
        star = polyline_distance(X_, Y_, star_points(R * 0.92)) < lw
        bw, bh = m['width'] / 2, R * 0.36
        bars = polyline_distance(X_, Y_, [(R * 0.93, bh), (bw, bh), (bw, -bh), (R * 0.93, -bh)], closed=False) < lw
        bars |= polyline_distance(X_, Y_, [(-R * 0.93, bh), (-bw, bh), (-bw, -bh), (-R * 0.93, -bh)], closed=False) < lw
        canvas[ring | star | bars] = rgbf(colour)
    elif m['kind'] == 'badge':  # D8: a plain shield outline stand-in for the unit badge
        hw, hh = m['width'] / 2, m['height'] / 2
        shield = [(-hw, hh), (hw, hh), (hw, -hh * 0.2), (0, -hh), (-hw, -hh * 0.2)]
        canvas[polyline_distance(X_, Y_, shield) < lw * 1.2] = rgbf(colour)
    elif m['kind'] == 'arrow':  # D7: rescue arrow, a red triangle pointing down
        hw = m['width'] / 2
        mask = np.zeros((h, w), bool)
        fill_triangles(mask, np.array([[(cx - hw * px, cy + hw * px), (cx + hw * px, cy + hw * px), (cx, cy - hw * px)]]))
        canvas[mask] = rgbf(colour)
    elif m['kind'] == 'bar':
        canvas[(np.abs(X_) <= m['width'] / 2) & (np.abs(Y_) <= m['height'] / 2)] = rgbf(colour)
    elif m['kind'] == 'star':
        pts = star_points(m['size'] / 2)
        tris = np.array([[(cx, cy), (cx + a[0] * px, cy + a[1] * px), (cx + b[0] * px, cy + b[1] * px)]
                         for a, b in zip(pts, pts[1:] + pts[:1])])
        mask = np.zeros((h, w), bool)
        fill_triangles(mask, tris)
        canvas[mask] = rgbf(colour)


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
            draw_mark(canvas, m, cx, (m['z'] - z0) * ppf * SS, ppf * SS, m.get('colour', 'red'))
        panels.append(down(canvas))
    return make_image(name, panels)


def textured(name, img, rough=0.22):
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
        left = sum(c.y for c in cos) >= 0
        for i, c in zip(p.loop_indices, cos):
            uv.data[i].uv = fn(c, left)


def paint_side(names, img, s0, s1, z0, z1):
    for name in names:
        obj = bpy.data.objects[name]
        keep = list(obj.data.materials)[1:]  # a duct's dark inside stays
        obj.data.materials.clear()
        obj.data.materials.append(textured(f'paint_{name}', img))
        for m in keep:
            obj.data.materials.append(paint_mat('duct'))
        set_uv(obj, lambda c, left: (((-c.x - s0) if left else (s1 + c.x)) / (s1 - s0),
                                     ((c.z - z0) / (z1 - z0) + (0 if left else 1)) / 2))


def paint_mat(k):
    rough = {'black': 0.22, 'metal': 0.3, 'tyre': 0.7, 'duct': 0.8, 'grey': 0.45}.get(k, 0.35)
    return bsdf_material('paint_' + k, PAINT_RGB[k], rough=rough, metal=1.0 if k == 'metal' else 0.0)


def fuselage_base(S, Z):
    col = np.empty(S.shape + (3,))
    col[:] = rgbf('black')
    col[S >= BARE_METAL_FROM_FT] = rgbf('metal')
    return col


def black_base(S, Z):
    col = np.empty(S.shape + (3,))
    col[:] = rgbf('black')
    return col


FUS_PICTURE = (-0.5, 45.0, -2.0, 4.4)
paint_side(['fuselage', 'spine', 'intakeLeft', 'intakeRight'],
           side_texture('paintFuselage', *FUS_PICTURE, 40, fuselage_base, [m for m in MARKS if m['on'] == 'fuselage']),
           *FUS_PICTURE)


def fin_mark_place(m):
    z = FIN_TOP_Z - m['below']
    return dict(m, s=fin_le(z) + m['frac'] * (fin_te(z) - fin_le(z)), z=z)


def fin_base(S, Z):
    col = black_base(S, Z)
    col[Z >= FIN_TOP_Z - FIN_BAND_DEPTH] = rgbf('red')
    return col


z_star = FIN_TOP_Z - FIN_BAND_DEPTH / 2
le_s, te_s = fin_le(z_star), fin_te(z_star)
fin_marks = [fin_mark_place(m) for m in FIN_MARKS]
fin_marks += [dict(kind='star', s=le_s + (te_s - le_s) * (k + 0.75) / (FIN_STARS + 0.5), z=z_star, size=0.32,
                   colour=STAR_COLOUR) for k in range(FIN_STARS)]
FIN_PICTURE = (31.5, 43.0, 0.8, FIN_TOP_Z + 0.1)
paint_side(['fin'], side_texture('paintFin', *FIN_PICTURE, 60, fin_base, fin_marks), *FIN_PICTURE)

# Plain paint for the rest: black surfaces, bare-metal nozzles, clear canopy, grey gear (D11, estimate), dark tyres.
PAINT_OF = {'wingLeft': 'black', 'wingRight': 'black', 'flapLeft': 'black', 'flapRight': 'black',
            'aileronLeft': 'black', 'aileronRight': 'black', 'tailplane': 'black', 'rudder': 'black',
            'speedBrakeLeft': 'black', 'speedBrakeRight': 'black', 'gearMainLeftDoor': 'black',
            'gearMainRightDoor': 'black', 'canopyFrameWindshield': 'black', 'canopyFrameSplit': 'black',
            'canopyFrameAft': 'black', 'canopySill': 'black', 'pitot': 'darkMetal', 'gearNoseLeg': 'grey',
            'gearMainLeftLeg': 'grey', 'gearMainRightLeg': 'grey', 'gearNoseWheel': 'tyre',
            'gearMainLeftWheel': 'tyre', 'gearMainRightWheel': 'tyre', 'cockpitWell': 'interior'}
for name, k in PAINT_OF.items():
    me = bpy.data.objects[name].data
    me.materials.clear()
    me.materials.append(paint_mat(k))
for name in ('nozzleLeft', 'nozzleRight'):
    me = bpy.data.objects[name].data
    me.materials.clear()
    me.materials.append(paint_mat('metal'))
    me.materials.append(paint_mat('duct'))
glass = bsdf_material('paint_glass', (150, 170, 185), glass=True)  # clear canopy (D13), a slight tint (estimate)
for name in ('windshield', 'canopyFront', 'canopyRear'):
    me = bpy.data.objects[name].data
    me.materials.clear()
    me.materials.append(glass)

# ---------- cockpits (shared plan Step 3d item 7, first pass; constants above, rows K1 to K11 and E12 to E22) ----------
# Everything here goes into the `cockpit` collection (export_t38.py writes it into its own file), except the tub, which
# is the outside's `cockpitWell`. The front cockpit is built at (ds, dz) = (0, 0), the rear one at REAR_SHIFT.
LEAN = math.radians(PANEL_LEAN_DEG)
PANEL_TEX = dict(u=(-1.3, 1.3), v=(-1.6, 0.0), ppf=360)  # the panel picture covers this much of the panel, px per ft


def P(s, y, z):
    return (X(s), y, z)


def hexa(bm, c):
    """Six faces through 8 corners: the bottom 4 then the top 4, each going round the same way."""
    v = [bm.verts.new(p) for p in c]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in f])


def box(bm, s0, s1, y0, y1, z0, z1):
    hexa(bm, [P(s0, y0, z0), P(s1, y0, z0), P(s1, y1, z0), P(s0, y1, z0),
              P(s0, y0, z1), P(s1, y0, z1), P(s1, y1, z1), P(s0, y1, z1)])


def bisect(f, lo, hi, n=40):
    """The x in [lo, hi] where f changes sign (f(lo) > 0 > f(hi))."""
    for _ in range(n):
        mid = (lo + hi) / 2
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def inside_hw(s, z):
    """How far out a panel may reach at station s and height z: inside the glass above the sill, the walls below it."""
    return canopy_hw(s, z) - 0.03 if z > SILL_Z else wall_hw(s, z) - 0.02


def panel_point(u, v, ds=0.0, dz=0.0):
    """A point on the panel's face (u right, v up from its top centre) as (station, y, height)."""
    return PANEL_TOP[0] + ds - v * math.sin(LEAN), -u, PANEL_TOP[1] + dz + v * math.cos(LEAN)


def panel_normal():
    """The panel face's normal toward the pilot, as (station, height) parts: aft and up."""
    return math.cos(LEAN), math.sin(LEAN)


def panel_top_v(u):
    """The panel's top edge: flat to PANEL_TOP_FLAT_U, then sloping down through the shoulder (K2)."""
    a = abs(u)
    return 0.0 if a <= PANEL_TOP_FLAT_U else -(a - PANEL_TOP_FLAT_U) * -PANEL_SHOULDER[1] / (PANEL_SHOULDER[0] - PANEL_TOP_FLAT_U)


def panel_top_u(v):
    return PANEL_TOP_FLAT_U + (PANEL_SHOULDER[0] - PANEL_TOP_FLAT_U) * (-v) / -PANEL_SHOULDER[1]


def board_piece(bm, v0, v1, span, ds, dz, n_u=24, dv=0.03):
    """A strip of the panel face from v0 down to v1, each row from span(v, s, z) = (u_left, u_right), UVs on the picture."""
    uv_rows = []
    rows = []
    for v in steps(v0, v1, dv):
        s, _, z = panel_point(0, v, ds, dz)
        a, b = span(v, s, z)
        row, uvr = [], []
        for k in range(n_u):
            u = a + (b - a) * k / (n_u - 1)
            ps, py, pz = panel_point(u, v, ds, dz)
            row.append(bm.verts.new(P(ps, py, pz)))
            uvr.append(((u - PANEL_TEX['u'][0]) / (PANEL_TEX['u'][1] - PANEL_TEX['u'][0]),
                        (v - PANEL_TEX['v'][0]) / (PANEL_TEX['v'][1] - PANEL_TEX['v'][0])))
        rows.append(row)
        uv_rows.append(uvr)
    uv = bm.loops.layers.uv.verify()
    for r0, r1, q0, q1 in zip(rows, rows[1:], uv_rows, uv_rows[1:]):
        for k in range(n_u - 1):
            f = bm.faces.new((r0[k], r1[k], r1[k + 1], r0[k + 1]))
            for loop, t in zip(f.loops, (q0[k], q1[k], q1[k + 1], q0[k + 1])):
                loop[uv].uv = t


def board(bm, ds, dz):
    """The instrument panel's face (K1 to K3): the main panel to the glass and walls, the lower panel, then the outer
    parts and the pedestal either side of the two knee wells."""
    lim = lambda s, z: inside_hw(s, z)  # noqa: E731
    lo = PANEL_LOWER
    board_piece(bm, 0.0, PANEL_MAIN_BOTTOM_V, lambda v, s, z: (-min(panel_top_u(v), lim(s, z)), min(panel_top_u(v), lim(s, z))), ds, dz)
    board_piece(bm, PANEL_MAIN_BOTTOM_V, lo['knee_top'], lambda v, s, z: (-lim(s, z), lim(s, z)), ds, dz)
    board_piece(bm, lo['knee_top'], lo['bottom'], lambda v, s, z: (-lim(s, z), -lo['knee'][1]), ds, dz, n_u=6)
    board_piece(bm, lo['knee_top'], lo['bottom'], lambda v, s, z: (-lo['pedestal'], lo['pedestal']), ds, dz, n_u=6)
    board_piece(bm, lo['knee_top'], lo['bottom'], lambda v, s, z: (lo['knee'][1], lim(s, z)), ds, dz, n_u=6)


def glare_shield(bm, ds, dz, front_s, front_z):
    """The glare shield: a hood 0.1 ft thick from front_s, where it meets the deck at front_z, aft to its lip over the
    panel's top (E15); its edge follows the panel's top edge and stops at the glass."""
    g = GLARE_SHIELD
    lip_s = PANEL_TOP[0] + ds + g['lip_aft']
    lip_z = lambda u: PANEL_TOP[1] + dz + g['lip_up'] + panel_top_v(u)  # noqa: E731
    n = 31
    rings = []
    for s in steps(front_s, lip_s, 0.08):
        f = (s - front_s) / (lip_s - front_s)
        f = f * f * (3 - 2 * f)
        z_top = lambda u: front_z + (lip_z(u) - front_z) * f  # noqa: E731
        reach = bisect(lambda u: canopy_hw(s, z_top(u)) - 0.03 - u, 0.0, 1.8)
        us = [reach * (-1 + 2 * k / (n - 1)) for k in range(n)]
        top = [P(s, -u, z_top(u)) for u in us]
        rings.append(top + [(x, y, z - g['thick']) for x, y, z in reversed(top)])
    loft(bm, rings)


def shroud(bm, s0, s1, z0, z1, z_front):
    """The rear panel's shroud over the front seat's back (K8): from the tub's walls up to the glass, its top sloping from
    z_front behind the front seat's headbox up to z1 at the rear panel's top (E21)."""
    nz = 10
    rings = []
    for s in steps(s0, s1, 0.1):
        top = z_front + (z1 - z_front) * (s - s0) / (s1 - s0)
        zs = [z0 + (top - z0) * k / (nz - 1) for k in range(nz)]
        left = [P(s, inside_hw(s, z), z) for z in zs]
        rings.append(left + [(x, -y, z) for x, y, z in reversed(left)])
    loft(bm, rings)


def seat(bm, ds, dz):
    """The ejection seat (K9, E16): cushion and bucket, the back and its frame, the headbox and its pad."""
    S = SEAT
    cz = S['cushion_z'] + dz
    pan0, foot = S['pan_front'] + ds, S['back_foot'] + ds
    bs, bz = S['back_top'][0] + ds, S['back_top'][1] + dz
    h, fh, d = S['half'], S['frame_half'], S['back_depth']
    box(bm, pan0, foot, -h, h, cz - 0.15, cz)                                           # seat cushion
    hexa(bm, [P(foot, -h + 0.07, cz), P(foot + 0.2, -h + 0.07, cz), P(foot + 0.2, h - 0.07, cz), P(foot, h - 0.07, cz),
              P(bs, -h + 0.07, bz), P(bs + 0.2, -h + 0.07, bz), P(bs + 0.2, h - 0.07, bz), P(bs, h - 0.07, bz)])  # back cushion


def seat_frame(bm, ds, dz):
    S = SEAT
    cz = S['cushion_z'] + dz
    pan0, foot = S['pan_front'] + ds, S['back_foot'] + ds
    bs, bz = S['back_top'][0] + ds, S['back_top'][1] + dz
    h, fh, d = S['half'], S['frame_half'], S['back_depth']
    for sd in (1, -1):  # the bucket's sides
        box(bm, pan0, foot + 0.2, sd * h, sd * fh, cz - 0.4, cz + 0.35)
    box(bm, pan0 + 0.15, foot + 0.15, -h + 0.07, h - 0.07, floor_z(pan0) + 0.0, cz - 0.15)  # under the pan, to the floor
    hexa(bm, [P(foot + 0.2, -fh, cz - 0.35), P(foot + 0.2 + d, -fh, cz - 0.35), P(foot + 0.2 + d, fh, cz - 0.35), P(foot + 0.2, fh, cz - 0.35),
              P(bs + 0.2, -fh, bz), P(bs + 0.2 + d, -fh, bz), P(bs + 0.2 + d, fh, bz), P(bs + 0.2, fh, bz)])  # the back's frame
    s0, s1, z0, z1, hb = S['headbox']
    box(bm, s0 + ds, s1 + ds, -hb, hb, z0 + dz, z1 + dz)                                       # headbox


def headbox_pad(bm, ds, dz):
    s0, _, z0, z1, hb = SEAT['headbox']
    box(bm, s0 + ds - 0.06, s0 + ds, -0.25, 0.25, z0 + dz + 0.1, z1 + dz - 0.18)


def harness(bm, ds, dz):
    """A hint of the harness (K9): two shoulder straps down the back cushion and the lap belt's halves on the cushion."""
    S = SEAT
    cz = S['cushion_z'] + dz
    foot, bs, bz = S['back_foot'] + ds, S['back_top'][0] + ds, S['back_top'][1] + dz
    for sd in (1, -1):
        y0, y1 = sd * 0.13, sd * 0.27
        hexa(bm, [P(foot - 0.02, y0, cz + 0.12), P(foot - 0.005, y0, cz + 0.12), P(foot - 0.005, y1, cz + 0.12), P(foot - 0.02, y1, cz + 0.12),
                  P(bs - 0.02, y0, bz - 0.1), P(bs - 0.005, y0, bz - 0.1), P(bs - 0.005, y1, bz - 0.1), P(bs - 0.02, y1, bz - 0.1)])
        box(bm, foot - 0.32, foot - 0.18, sd * 0.10, sd * (S['half'] - 0.02), cz, cz + 0.02)


def buckle(bm, ds, dz):
    cz = SEAT['cushion_z'] + dz
    foot = SEAT['back_foot'] + ds
    box(bm, foot - 0.34, foot - 0.16, -0.10, 0.10, cz, cz + 0.04)


def seat_handles(bm, ds, dz):
    """The yellow handgrips at the front of the seat's sides (K9)."""
    cz = SEAT['cushion_z'] + dz
    for sd in (1, -1):
        box(bm, SEAT['pan_front'] + ds + 0.02, SEAT['pan_front'] + ds + 0.38, sd * (SEAT['half'] + 0.01), sd * (SEAT['frame_half'] + 0.02),
            cz + 0.35, cz + 0.43)


def stick(bm, ds, dz, part_):
    S = STICK
    p = lambda a: Vector(P(a[0] + ds, 0, a[1] + dz))  # noqa: E731
    if part_ == 'boot':
        cylinder(bm, p(S['base']), p(S['boot_top']), 0.17, 0.05, seg=16)
    elif part_ == 'shaft':
        cylinder(bm, p(S['boot_top']), p(S['grip_foot']), 0.032, seg=12)
    else:
        cylinder(bm, p(S['grip_foot']), p(S['grip_top']), 0.055, 0.06, seg=16)


def pedals(bm, ds, dz, ceiling_z):
    """The rudder pedals (K10, E18): a plate each side hung from under the panel."""
    Pd = PEDALS
    z0, z1 = Pd['z'][0] + dz, Pd['z'][1] + dz
    for sd in (1, -1):
        y0, y1 = sd * (Pd['out'] - Pd['w'] / 2), sd * (Pd['out'] + Pd['w'] / 2)
        s = Pd['s'] + ds
        hexa(bm, [P(s + 0.08, y0, z0), P(s + 0.11, y0, z0), P(s + 0.11, y1, z0), P(s + 0.08, y1, z0),
                  P(s - 0.08, y0, z1), P(s - 0.05, y0, z1), P(s - 0.05, y1, z1), P(s - 0.08, y1, z1)])
        cylinder(bm, Vector(P(s - 0.07, sd * Pd['out'], z1)), Vector(P(s - 0.2, sd * Pd['out'], ceiling_z)), 0.025, seg=8)


def footwell_ceiling(bm, s0, s1, z):
    box(bm, s0, s1, -inside_hw(s0, z), inside_hw(s0, z), z - 0.03, z)


def pedestal(bm, ds, dz):
    """The pedestal's lower part, from the panel's foot down to the floor, sloping aft toward the stick (K3)."""
    s_top, _, z_top = panel_point(0, PANEL_LOWER['bottom'], ds, dz)
    w = PANEL_LOWER['pedestal']
    fz = floor_z(s_top)
    hexa(bm, [P(s_top - 0.4, -w, fz), P(s_top + 0.37, -w, fz), P(s_top + 0.37, w, fz), P(s_top - 0.4, w, fz),
              P(s_top - 0.4, -w, z_top), P(s_top - 0.005, -w, z_top), P(s_top - 0.005, w, z_top), P(s_top - 0.4, w, z_top)])


def console(bm, ds, dz, sd):
    s0, s1 = CONSOLE['s'][0] + ds, CONSOLE['s'][1] + ds
    top = CONSOLE['top'] + dz
    out = min(wall_hw(s0, top), wall_hw(s1, top)) - 0.01
    box(bm, s0, s1, sd * CONSOLE['inboard'], sd * out, floor_z(s0), top)


def console_top(bm, ds, dz, sd):
    """The console's top, the picture on it (K7) mapped along the console from its front."""
    s0, s1 = CONSOLE['s'][0] + ds, CONSOLE['s'][1] + ds
    top = CONSOLE['top'] + dz + 0.004
    out = min(wall_hw(s0, top), wall_hw(s1, top)) - 0.01
    a, b = CONSOLE['inboard'], out
    vs = [bm.verts.new(P(s, sd * y, top)) for s, y in ((s0, a), (s1, a), (s1, b), (s0, b))]
    f = bm.faces.new(vs if sd < 0 else vs[::-1])
    uv = bm.loops.layers.uv.verify()
    for loop in f.loops:
        s, y = -loop.vert.co.x, abs(loop.vert.co.y)
        loop[uv].uv = ((y - a) / (b - a), (s - s0) / (s1 - s0))


def throttles(bm, ds, dz, part_):
    T = THROTTLE
    top = CONSOLE['top'] + dz
    for y in T['out']:
        if part_ == 'lever':
            cylinder(bm, Vector(P(T['s'] + ds, y, top)), Vector(P(T['s'] + ds - 0.06, y, T['top'] + dz - 0.06)), 0.02, seg=8)
        else:
            box(bm, T['s'] + ds - 0.13, T['s'] + ds - 0.01, y - 0.035, y + 0.035, T['top'] + dz - 0.08, T['top'] + dz + 0.03)


def gear_lever(bm, part_):
    s, y, z = panel_point(*GEAR_LEVER)
    ns, nz = panel_normal()
    a, b = Vector(P(s, y, z)), Vector(P(s + 0.14 * ns, y, z + 0.14 * nz))
    if part_ == 'lever':
        cylinder(bm, a, b, 0.018, seg=8)
    else:
        cylinder(bm, b, b + Vector((-0.03 * ns, 0, 0.03 * nz)), 0.05, seg=20)


def aoa_indexer(bm, ds, dz, part_):
    s = PANEL_TOP[0] + ds + GLARE_SHIELD['lip_aft'] - 0.04
    z0 = PANEL_TOP[1] + dz + GLARE_SHIELD['lip_up'] - 0.01
    y = AOA_INDEXER_Y
    if part_ == 'body':
        box(bm, s - 0.14, s, y - 0.035, y + 0.035, z0, z0 + 0.19)
    else:
        k = ('green', 'amber', 'fire').index(part_)
        zc = z0 + 0.155 - 0.05 * k
        box(bm, s, s + 0.006, y - 0.022, y + 0.022, zc - 0.018, zc + 0.018)


def bow_height(s, out):
    """The height of the canopy's glass at station s and `out` ft from the centreline (its inside)."""
    return bisect(lambda z: canopy_hw(s, z) - out, SILL_Z + 0.01, pchip(CANOPY, s, 2) - 0.001)


def mirrors(bm, part_):
    M = MIRRORS
    for sd in (1, -1):
        y = sd * M['out']
        if part_ == 'glass':
            box(bm, M['s'] + 0.025, M['s'] + 0.035, y - M['w'] / 2, y + M['w'] / 2, M['z'] - M['h'] / 2, M['z'] + M['h'] / 2)
        else:
            box(bm, M['s'], M['s'] + 0.025, y - M['w'] / 2 - 0.015, y + M['w'] / 2 + 0.015, M['z'] - M['h'] / 2 - 0.015, M['z'] + M['h'] / 2 + 0.015)
            y_bow = sd * (canopy_hw(CANOPY_FRAMES_FT[0][1], M['z']) - WINDSCREEN_FRAME_DEPTH[0] / 2)  # out to the bow's side
            cylinder(bm, Vector(P(M['s'] + 0.01, sd * (M['out'] + M['w'] / 2), M['z'])), Vector(P(CANOPY_FRAMES_FT[0][1] - 0.05, y_bow, M['z'])), 0.015, seg=8)


def standby_compass(bm):
    s, y, z = STANDBY_COMPASS
    box(bm, s - 0.08, s + 0.08, y - 0.08, y + 0.08, z - 0.07, z + 0.07)
    z_bow = bow_height(CANOPY_FRAMES_FT[0][1], abs(y)) - WINDSCREEN_FRAME_DEPTH[0]
    cylinder(bm, Vector(P(s, y, z + 0.07)), Vector(P(CANOPY_FRAMES_FT[0][1] - 0.05, y, z_bow)), 0.02, seg=8)


def compass_face(bm):
    s, y, z = STANDBY_COMPASS
    box(bm, s + 0.08, s + 0.086, y - 0.05, y + 0.05, z - 0.04, z + 0.04)


def inter_windscreen(bm):
    """The rear cockpit's own windscreen on its panel's shroud (E20): the canopy's inside section above the shroud."""
    s, z0 = INTER_WINDSCREEN_FT, PANEL_TOP[1] + REAR_SHIFT[1] + REAR_PANEL_RAISE
    ring = [p for p in canopy_rings(s, s, grow=-0.06)[0] if p[2] > z0]
    y0 = canopy_hw(s, z0) - 0.06
    pts = [P(s, y0, z0)] + ring + [P(s, -y0, z0)]
    bm.faces.new([bm.verts.new(p) for p in pts])


# ---- the panel and console pictures (K4, K5, K7): simple faces drawn here, nothing copied from the pictures ----
RGBF = lambda c: np.array(c) / 255  # noqa: E731
PANEL_INK = {'panel': (172, 177, 182), 'black': (24, 24, 27), 'bezel': (84, 87, 91), 'face': (14, 14, 16),
             'tick': (225, 225, 220), 'sky': (205, 205, 198), 'earth': (52, 44, 38), 'symbol': (240, 140, 30),
             'lightFace': (218, 218, 212), 'knob': (120, 122, 126), 'label': (210, 210, 205), 'seam': (120, 124, 128),
             'display': (186, 198, 182), 'fire': (205, 30, 30), 'amber': (230, 150, 30), 'green': (60, 200, 90),
             'mapCase': (110, 114, 118)}


class Canvas:
    """A picture in feet: x across, y up from its own origin, `ppf` pixels per foot, drawn at SS times and averaged."""

    def __init__(self, x0, x1, y0, y1, ppf, base):
        self.x0, self.y0, self.ppf = x0, y0, ppf * SS
        w, h = round((x1 - x0) * ppf) * SS, round((y1 - y0) * ppf) * SS
        self.pix = np.empty((h, w, 3))
        self.pix[:] = RGBF(PANEL_INK[base])

    def window(self, x0, x1, y0, y1):
        h, w, _ = self.pix.shape
        c0, c1 = max(0, int((x0 - self.x0) * self.ppf)), min(w, int((x1 - self.x0) * self.ppf) + 1)
        r0, r1 = max(0, int((y0 - self.y0) * self.ppf)), min(h, int((y1 - self.y0) * self.ppf) + 1)
        xs = self.x0 + (np.arange(c0, c1) + 0.5) / self.ppf
        ys = self.y0 + (np.arange(r0, r1) + 0.5) / self.ppf
        X_, Y_ = np.meshgrid(xs, ys)
        return (slice(r0, r1), slice(c0, c1)), X_, Y_

    def rect(self, x0, x1, y0, y1, ink):
        sl, _, _ = self.window(x0, x1, y0, y1)
        self.pix[sl] = RGBF(PANEL_INK[ink])

    def paint(self, sl, mask, ink):
        self.pix[sl][mask] = RGBF(PANEL_INK[ink])

    def ticks(self, cx, cy, r, n, r0, r1, width, ink, long_every=0, r0_long=None):
        sl, X_, Y_ = self.window(cx - r, cx + r, cy - r, cy + r)
        for k in range(n):
            a = 2 * math.pi * k / n
            inner = r0_long if long_every and k % long_every == 0 else r0
            ax, ay, bx, by = cx + inner * math.sin(a), cy + inner * math.cos(a), cx + r1 * math.sin(a), cy + r1 * math.cos(a)
            self.paint(sl, polyline_distance(X_, Y_, [(ax, ay), (bx, by)], closed=False) < width, ink)

    def gauge(self, kind, cx, cy, r):
        sl, X_, Y_ = self.window(cx - r, cx + r, cy - r, cy + r)
        d = np.hypot(X_ - cx, Y_ - cy)
        self.paint(sl, d < r, 'bezel')
        face = d < r * 0.86
        if kind == 'adi':  # the ball: light above the horizon, dark below, a white horizon and an orange aircraft symbol
            self.paint(sl, face & (Y_ >= cy), 'sky')
            self.paint(sl, face & (Y_ < cy), 'earth')
            self.paint(sl, face & (np.abs(Y_ - cy) < r * 0.02), 'tick')
            for k in (-2, -1, 1, 2):
                self.paint(sl, face & (np.abs(Y_ - cy - k * r * 0.2) < r * 0.012) & (np.abs(X_ - cx) < r * (0.12 + 0.06 * abs(k))), 'tick')
            wing = (np.abs(Y_ - cy + r * 0.04) < r * 0.03) & (np.abs(X_ - cx) < r * 0.45) & (np.abs(X_ - cx) > r * 0.1)
            self.paint(sl, wing | (np.hypot(X_ - cx, Y_ - cy + r * 0.04) < r * 0.04), 'symbol')
            self.ticks(cx, cy, r * 0.93, 12, r * 0.86, r * 0.98, r * 0.015, 'tick')
        elif kind == 'hsi':  # the compass card's ticks round a black face, a lubber line and a white aircraft
            self.paint(sl, face, 'face')
            self.ticks(cx, cy, r, 36, r * 0.74, r * 0.84, r * 0.012, 'tick', long_every=3, r0_long=r * 0.66)
            self.paint(sl, (np.abs(X_ - cx) < r * 0.015) & (Y_ > cy + r * 0.84) & (d < r * 0.95), 'symbol')
            plane = ((np.abs(X_ - cx) < r * 0.025) & (np.abs(Y_ - cy) < r * 0.22)) | \
                    ((np.abs(Y_ - cy - r * 0.04) < r * 0.025) & (np.abs(X_ - cx) < r * 0.2))
            self.paint(sl, plane, 'tick')
        else:  # a round gauge: a dark (or light) face with twelve ticks, no needle
            light = kind == 'light'
            self.paint(sl, face, 'lightFace' if light else 'face')
            self.ticks(cx, cy, r, 12, r * 0.64, r * 0.8, r * 0.025, 'face' if light else 'tick')

    def knobs(self, x0, x1, y0, y1, seed, r=0.018):
        """A black switch panel with a few knobs and white label marks, placed by a fixed seed (a pattern, not a layout)."""
        rng = np.random.default_rng(seed)
        self.rect(x0, x1, y0, y1, 'black')
        nx, ny = max(1, int((x1 - x0) / 0.11)), max(1, int((y1 - y0) / 0.11))
        for i in range(nx):
            for j in range(ny):
                if rng.random() < 0.35:
                    continue
                cx = x0 + (i + 0.5) * (x1 - x0) / nx
                cy = y0 + (j + 0.5) * (y1 - y0) / ny
                sl, X_, Y_ = self.window(cx - 0.05, cx + 0.05, cy - 0.05, cy + 0.05)
                self.paint(sl, np.hypot(X_ - cx, Y_ - cy) < r * (1 + rng.random()), 'knob')
                self.paint(sl, (np.abs(Y_ - cy - 0.035) < 0.004) & (np.abs(X_ - cx) < 0.025), 'label')

    def image(self, name):
        return make_image(name, [down(self.pix)])


def panel_picture():
    c = Canvas(*PANEL_TEX['u'], *PANEL_TEX['v'], PANEL_TEX['ppf'], 'panel')
    c.rect(PANEL_TEX['u'][0], PANEL_TEX['u'][1], PANEL_MAIN_BOTTOM_V - 0.012, PANEL_MAIN_BOTTOM_V - 0.004, 'seam')
    for k, (u0, u1, v0, v1) in enumerate(PANEL_BLOCKS):
        c.knobs(u0, u1, v0, v1, seed=k)
    c.rect(-0.17, -0.02, -0.98, -0.88, 'display')  # the radio head's frequency card
    for u0, u1, v0, v1 in PANEL_FRAMES:
        c.rect(u0, u1, v0, v1, 'black')
    for kind, u, v, r in PANEL_GAUGES:
        c.gauge(kind, u, v, r)
    for u, v, w, h, ink in PANEL_LAMPS:
        c.rect(u - w / 2, u + w / 2, v - h / 2, v + h / 2, ink)
    return c.image('cockpitPanel')


CONSOLE_LEN = CONSOLE['s'][1] - CONSOLE['s'][0]
# Console panels (K7): along the console from its front (ft), across it from its inboard edge as a share of its width
CONSOLE_PANELS = {
    'left': [(0.02, 0.41, 'knobs'), (0.46, 1.15, 'throttle'), (1.18, 1.29, 'knobs'), (1.31, 1.53, 'knobs'), (1.56, 2.33, 'switches')],
    'right': [(0.02, 0.53, 'lamps'), (0.60, 1.20, 'knobs'), (1.25, 2.33, 'mapCase')],
}


def console_picture(side):
    width = 0.42
    c = Canvas(0, width, 0, CONSOLE_LEN, 300, 'panel')
    for k, (a0, a1, kind) in enumerate(CONSOLE_PANELS[side]):
        x0, x1 = 0.03, width - 0.03
        if kind == 'mapCase':
            c.rect(x0, x1, a0, a1, 'black')
            c.rect(x0 + 0.02, x1 - 0.02, a0 + 0.02, a1 - 0.02, 'mapCase')
        elif kind == 'throttle':  # the throttle quadrant: black with two light slots where the levers run (K7)
            c.rect(x0, x1, a0, a1, 'black')
            for y in THROTTLE['out']:
                b = (y - CONSOLE['inboard']) / width * width
                c.rect(b - 0.012, b + 0.012, THROTTLE['slot'][0] - CONSOLE['s'][0], THROTTLE['slot'][1] - CONSOLE['s'][0], 'seam')
        elif kind == 'lamps':
            c.rect(x0, x1, a0, a1, 'black')
            for i in range(6):
                for j in range(2):
                    c.rect(x0 + 0.04 + j * 0.17, x0 + 0.17 + j * 0.17, a0 + 0.04 + i * 0.075, a0 + 0.09 + i * 0.075, 'amber' if (i + j) % 3 else 'fire')
        elif kind == 'switches':
            c.rect(x0, x1, a0, a1, 'seam')
            for i in range(4):
                c.rect(x0 + 0.05, x0 + 0.12, a0 + 0.08 + i * 0.17, a0 + 0.16 + i * 0.17, 'fire')
            sl, X_, Y_ = c.window(0.15, 0.35, a0 + 0.3, a0 + 0.5)
            c.paint(sl, np.hypot(X_ - 0.26, Y_ - a0 + -0.40) < 0.07, 'amber')
        else:
            c.knobs(x0, x1, a0, a1, seed=100 + k + (50 if side == 'right' else 0))
    return c.image(f'cockpitConsole{side.title()}')


def textured_part(obj, img, rough=0.6):
    obj.data.materials.clear()
    obj.data.materials.append(textured(f'cockpit_{obj.name}', img, rough=rough))


panel_img = panel_picture()
console_imgs = {'left': console_picture('left'), 'right': console_picture('right')}

for seat_name, (ds, dz) in (('Front', (0.0, 0.0)), ('Rear', REAR_SHIFT)):
    pz = dz + (REAR_PANEL_RAISE if seat_name == 'Rear' else 0.0)  # the panel's own raise (K8)
    C = lambda name: f'cockpit{seat_name}{name}'  # noqa: E731
    textured_part(part(C('Panel'), 'panel', lambda bm: board(bm, ds, pz), cockpit=True), panel_img, rough=0.5)
    front_s = GLARE_SHIELD['front'] if seat_name == 'Front' else INTER_WINDSCREEN_FT
    front_z = pchip(FUSELAGE, GLARE_SHIELD['front'], 2) if seat_name == 'Front' else PANEL_TOP[1] + pz
    part(C('GlareShield'), 'black', lambda bm: glare_shield(bm, ds, pz, front_s, front_z), cockpit=True)
    part(C('Pedestal'), 'black', lambda bm: pedestal(bm, ds, pz), cockpit=True)
    s_knee = panel_point(0, PANEL_LOWER['knee_top'], ds, pz)[0]
    ceiling_z = panel_point(0, PANEL_LOWER['knee_top'], ds, pz)[2] - 0.015
    if seat_name == 'Front':
        part(C('FootwellCeiling'), 'interior', lambda bm: footwell_ceiling(bm, TUB['front'], s_knee, ceiling_z), cockpit=True)
    else:  # the shroud over the front seat's back, its underside the rear footwell's ceiling (K8)
        sh0 = SEAT['headbox'][1] + 0.1
        part(C('Shroud'), 'interior', lambda bm: shroud(bm, sh0, PANEL_TOP[0] + ds, ceiling_z, PANEL_TOP[1] + pz, SHROUD_FRONT_Z), cockpit=True)
        part(C('FootwellCeiling'), 'interior', lambda bm: footwell_ceiling(bm, PANEL_TOP[0] + ds - 0.05, s_knee, ceiling_z), cockpit=True)
    part(C('AoaIndexer'), 'black', lambda bm: aoa_indexer(bm, ds, pz, 'body'), cockpit=True)
    for lamp in ('green', 'amber', 'fire'):
        part(C(f'AoaLamp{lamp.title()}'), lamp, lambda bm, k=lamp: aoa_indexer(bm, ds, pz, k), cockpit=True)
    for sd, side in ((1, 'Left'), (-1, 'Right')):
        part(C(f'Console{side}'), 'interior', lambda bm, sd=sd: console(bm, ds, dz, sd), cockpit=True)
        textured_part(part(C(f'Console{side}Top'), 'panel', lambda bm, sd=sd: console_top(bm, ds, dz, sd), cockpit=True),
                      console_imgs[side.lower()])
    part(C('ThrottleLevers'), 'metal', lambda bm: throttles(bm, ds, dz, 'lever'), cockpit=True)
    part(C('ThrottleGrips'), 'grip', lambda bm: throttles(bm, ds, dz, 'grip'), cockpit=True)
    part(C('SeatCushions'), 'cushion', lambda bm: seat(bm, ds, dz), cockpit=True)
    part(C('SeatFrame'), 'seatFrame', lambda bm: seat_frame(bm, ds, dz), cockpit=True)
    part(C('SeatHeadPad'), 'cushion', lambda bm: headbox_pad(bm, ds, dz), cockpit=True)
    part(C('Harness'), 'harness', lambda bm: harness(bm, ds, dz), cockpit=True)
    part(C('Buckle'), 'metal', lambda bm: buckle(bm, ds, dz), cockpit=True)
    part(C('SeatHandles'), 'yellow', lambda bm: seat_handles(bm, ds, dz), cockpit=True)
    part(C('StickBoot'), 'boot', lambda bm: stick(bm, ds, dz, 'boot'), cockpit=True)
    part(C('StickShaft'), 'metal', lambda bm: stick(bm, ds, dz, 'shaft'), cockpit=True)
    part(C('StickGrip'), 'grip', lambda bm: stick(bm, ds, dz, 'grip'), cockpit=True)
    part(C('Pedals'), 'metal', lambda bm: pedals(bm, ds, dz, ceiling_z), cockpit=True)
    part(C('Floor'), 'floor', lambda bm: box(bm, TUB['front'] if seat_name == 'Front' else TUB['step'], TUB['step'] if seat_name == 'Front' else TUB['aft'],
                                             -wall_hw(12.0 + ds, floor_z(12.0 + ds)) + 0.01, wall_hw(12.0 + ds, floor_z(12.0 + ds)) - 0.01,
                                             floor_z(12.0 + ds) + 0.002, floor_z(12.0 + ds) + 0.01), cockpit=True)

# The front cockpit only: the gear lever, the bow's mirrors and the standby compass (K5, K6)
part('cockpitFrontGearLever', 'metal', lambda bm: gear_lever(bm, 'lever'), cockpit=True)
part('cockpitFrontGearKnob', 'interior', lambda bm: gear_lever(bm, 'knob'), cockpit=True)
part('cockpitMirrorFrames', 'black', lambda bm: mirrors(bm, 'frame'), cockpit=True)
part('cockpitMirrorGlass', 'mirror', lambda bm: mirrors(bm, 'glass'), cockpit=True)
part('cockpitStandbyCompass', 'black', standby_compass, cockpit=True)
part('cockpitStandbyCompassFace', 'panel', compass_face, cockpit=True)
part('cockpitInterWindscreen', 'glass', inter_windscreen, cockpit=True)
for name in ('cockpitFrontGearKnob',):  # the gear lever's knob is white (K5)
    bpy.data.objects[name].data.materials.clear()
    bpy.data.objects[name].data.materials.append(bsdf_material('cockpit_white', (230, 230, 226), rough=0.5))

# ---- the eye checks (E10 against the canopy, glare shield and seats) ----
print('cockpit checks (ft, deg):')
for name, (es, ez), (ds, dz), pz in (('front', EYE_FRONT, (0, 0), 0), ('rear', EYE_REAR, REAR_SHIFT, REAR_SHIFT[1] + REAR_PANEL_RAISE)):
    bow_s, bow_z = (CANOPY_FRAMES_FT[0][1], pchip(CANOPY, CANOPY_FRAMES_FT[0][1], 2) - WINDSCREEN_FRAME_DEPTH[0]) if name == 'front' else \
        (INTER_WINDSCREEN_FT, pchip(CANOPY, INTER_WINDSCREEN_FT, 2) - 0.06)
    lip_s, lip_z = PANEL_TOP[0] + ds + GLARE_SHIELD['lip_aft'], PANEL_TOP[1] + pz + GLARE_SHIELD['lip_up']
    helmet_top = ez + 0.45  # E16: a helmet's top about 0.45 ft over the eye
    print(f'  {name}: eye at {es:.2f} ft, {ez:.2f} ft; {ez - SILL_Z:.2f} ft over the sill, {ez - (SEAT["cushion_z"] + dz):.2f} ft over the cushion; '
          f'glass {pchip(CANOPY, es, 2) - ez:.2f} ft over the eye, {pchip(CANOPY, es + 0.35, 2) - helmet_top:.2f} ft over a helmet')
    print(f'    glare shield lip {math.degrees(math.atan2(ez - lip_z, es - lip_s)):.1f} deg below the eye line (seen over it: '
          f'{"yes" if lip_z < ez else "NO"}); {"windshield bow" if name == "front" else "own windscreen"}\'s inside top '
          f'{math.degrees(math.atan2(bow_z - ez, es - bow_s)):+.1f} deg')
hb = SEAT['headbox']
print(f'  front headbox top {hb[3]:.2f} ft at {hb[0]:.2f} to {hb[1]:.2f}: '
      f'{math.degrees(math.atan2(hb[3] - EYE_REAR[1], EYE_REAR[0] - hb[1])):+.1f} deg from the rear eye; '
      f'rear panel top {PANEL_TOP[1] + REAR_SHIFT[1] + REAR_PANEL_RAISE:.2f} ft')

# ---------- size checks ----------
bpy.context.view_layer.update()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in bpy.data.objects:
    if o.type == 'MESH':
        for c in o.data.vertices:
            w = o.matrix_world @ c.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
size = hi - lo
wing_area = WING_HALF_SPAN * (WING_ROOT_CHORD + WING_TIP_CHORD)
tail_area = TAIL_HALF_SPAN_FT * ((TAIL_TE_FT[0] - TAIL_LE_FT[0]) + (TAIL_TE_FT[1] - TAIL_LE_FT[1]))
zs = steps(FIN_TE_ROOT[1], FIN_TOP_Z, 0.05)
fin_area = sum((fin_te((a + b) / 2) - fin_le((a + b) / 2)) * (b - a) for a, b in zip(zs, zs[1:]))  # fillet included


def check(what, got, ref, src, unit='ft'):
    d = got - ref
    extra = f' ({d * 12:+.1f} in)' if unit == 'ft' else ''
    print(f'  {what:<28} {got:8.2f} {unit}   {src:<22} {ref:8.2f} {unit}   difference {d:+.2f} {unit}{extra}')


print('size checks (model, ft):')
check('length (pitot tip to exit)', size.x, LENGTH_FT, 'USAF fact sheet (P1)')
check('', size.x, 46 + 4.5 / 12, 'P2 46 ft 4.5 in')
check('span', size.y, SPAN_FT, 'USAF fact sheet (P1)')
check('height (ground to fin top)', hi.z - GROUND_Z, HEIGHT_FT, 'USAF fact sheet (P1)')
check('', hi.z - GROUND_Z, 12 + 10.5 / 12, 'P2 12 ft 10.5 in')
check('lowest point (wheels)', lo.z, GROUND_Z, 'ground (R1)')
check('wing area (trapezoid)', wing_area, WING_AREA_FT2, 'textbook (P3)', 'ft2')
check('tailplane area (trapezoid)', tail_area, TAIL_AREA_FT2, 'textbook (P3)', 'ft2')
check('fin area above the body', fin_area, FIN_AREA_FT2, 'textbook (P3)', 'ft2')
check('main wheel track', 2 * MAIN_WHEEL_OUT_FT, TRACK_FT, 'textbook (P3)')
check('wheelbase', MAIN_STATION_FT - NOSE_STATION_FT, WHEELBASE_FT, 'secondary page (P4)')
print(f'  wing: root chord {WING_ROOT_CHORD:.2f} ft, tip chord {WING_TIP_CHORD:.2f} ft, leading edge '
      f'{math.degrees(math.atan(TAN_LE)):.1f} deg back, trailing edge {-math.degrees(math.atan(TAN_TE)):.1f} deg forward (P3)')
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
scene.cycles.samples = 48
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

S_MID = (NOZZLE_EXIT_FT - PITOT_LENGTH_FT) / 2      # middle of the length, station ft
Z_MID = (GROUND_Z + FIN_TOP_Z) / 2
mid = Vector((X(S_MID), 0, Z_MID))


def grid(name, plane, u_range, v_range):
    """1 ft lines (every 5th heavier) in a plane, drawn as thin flat strips; plane(u, v) gives a point."""
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


# Grid lines sit on whole feet from the radome tip (stations), the centreline and the ground.
g = GROUND_Z
grids = {
    'side': grid('gridSide', lambda u, v: (-u, -25, g + v), (-4, math.ceil(NOZZLE_EXIT_FT) + 3), (-1, math.ceil(HEIGHT_FT) + 2)),
    'front': grid('gridFront', lambda u, v: (-60, u, g + v), (-math.ceil(SPAN_FT / 2) - 2, math.ceil(SPAN_FT / 2) + 2),
                  (-1, math.ceil(HEIGHT_FT) + 2)),
    'top': grid('gridTop', lambda u, v: (-u, v, g - 1), (-4, math.ceil(NOZZLE_EXIT_FT) + 3),
                (-math.ceil(SPAN_FT / 2) - 2, math.ceil(SPAN_FT / 2) + 2)),
}
cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
cam.data.clip_end = 500
scene.collection.objects.link(cam)
scene.camera = cam

# The square-on views use these exact scales and centres, so the overlay sheets can map a pixel to feet:
# side: 40 px per ft, centre (S_MID, Z_MID), image right = aft; top: 40 px per ft, centre (S_MID, 0), image right = aft,
# image up = the right wing (-Y).
ORTHO_PPF = 40
SIDE_RES = (2080, 720)
TOP_RES = (2080, 1200)
FRONT_RES = (1240, 720)


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
    scene.render.filepath = os.path.join(folder, f't38-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('render', scene.render.filepath)


def views(folder, painted):
    os.makedirs(folder, exist_ok=True)
    R = 88  # ft from the middle of the aircraft
    side = dict(loc=(X(S_MID), 80, Z_MID), ortho=SIDE_RES[0] / ORTHO_PPF, basis=((-1, 0, 0), (0, 0, 1)), res=SIDE_RES)
    top = dict(loc=(X(S_MID), 0, 80), ortho=TOP_RES[0] / ORTHO_PPF, basis=((-1, 0, 0), (0, -1, 0)), res=TOP_RES)
    if SILHOUETTES_ONLY:
        shoot(folder, 'side-alpha', grid_on=False, alpha=True, **side)
        shoot(folder, 'top-alpha', grid_on=False, alpha=True, **top)
        return
    shoot(folder, 'quarter-front-left', mid + Vector((0.62, 0.62, 0.30)) * R, mid)
    shoot(folder, 'quarter-rear-right', mid + Vector((-0.65, -0.60, 0.30)) * R, mid)
    shoot(folder, 'below', mid + Vector((0.45, 0.35, -0.80)) * R * 1.2, mid)
    shoot(folder, 'side', **side)
    shoot(folder, 'front', (80, 0, Z_MID), ortho=FRONT_RES[0] / ORTHO_PPF, basis=((0, 1, 0), (0, 0, 1)), res=FRONT_RES)
    shoot(folder, 'top', **top)
    if painted:
        # Near the angle of Dad's photo T7: the left side, a little ahead and above, a long lens (D12, by eye)
        shoot(folder, 'photo-angle', mid + Vector((0.10, 0.99, 0.10)) * 200, mid, res=(1356, 904), lens=135, grid_on=False)
    else:
        shoot(folder, 'side-alpha', grid_on=False, alpha=True, **side)
        shoot(folder, 'top-alpha', grid_on=False, alpha=True, **top)


def cockpit_views(folder):
    """The cockpit renders (plan Step 3d item 7): from each eye looking ahead as the Debrief's Cockpit camera does (55 deg
    across the picture's height) and 15 deg down onto the panel, from above and behind the front seat with its canopy
    away (near the angle of Dad's photo T9), and a cutaway side view sliced 0.75 ft left of the centreline."""
    os.makedirs(folder, exist_ok=True)
    res = (1600, 1000)
    lens = 18 / math.tan(math.atan(math.tan(math.radians(55 / 2)) * res[0] / res[1]))  # 55 deg tall on a 36 mm wide sensor
    for seat_name, (es, ez) in (('front', EYE_FRONT), ('rear', EYE_REAR)):
        eye = Vector((X(es), 0, ez))
        shoot(folder, f'eye-{seat_name}', eye, eye + Vector((10, 0, 0)), res=res, lens=lens, grid_on=False)  # the nose is +X
        shoot(folder, f'eye-{seat_name}-down', eye, eye + Vector((10, 0, -10 * math.tan(math.radians(15)))), res=res, lens=lens, grid_on=False)
    hidden = [bpy.data.objects[n] for n in ('canopyFront', 'canopyRear', 'canopyFrameSplit', 'canopyFrameAft')]
    for o in hidden:
        o.hide_render = True
    shoot(folder, 'above-behind', Vector((X(14.6), 0, 7.6)), Vector((X(11.0), 0, 0.2)), res=(1100, 1500), lens=24, grid_on=False)
    for o in hidden:
        o.hide_render = False
    cam.data.clip_start = 40 - 0.75  # the slice: nothing nearer the camera than 0.75 ft left of the centreline
    bg.inputs['Strength'].default_value = 1.6  # more light from all round: the slice is otherwise deep in shade
    shoot(folder, 'cutaway-side', (X(14.6), 40, 1.4), ortho=14.0, basis=((-1, 0, 0), (0, 0, 1)), res=(1800, 900), grid_on=False)
    bg.inputs['Strength'].default_value = 0.55
    cam.data.clip_start = 0.1


if COCKPIT_ONLY:
    cockpit_views(os.path.join(RENDER_DIR, 'cockpit'))
    sys.exit(0)

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
views(os.path.join(RENDER_DIR, 'plain'), False)
