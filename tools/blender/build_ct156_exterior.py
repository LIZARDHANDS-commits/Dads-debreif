# Builds the CT-156's outside as a Blender model file (ALL-33, Patrick 11 Oct 2026) and exports
# public/models/ct156-exterior.glb with its baked picture public/models/ct156-exterior-ao.jpg. Runs headless:
#
#   node tools/blender/ct156-exterior-pieces.mjs > ct156-exterior-pieces.json
#   node tools/blender/ct156-shape.mjs > ct156-shape.json
#   blender -b --factory-startup -P tools/blender/build_ct156_exterior.py -- ct156-exterior-pieces.json ct156-shape.json public/models/ct156-exterior.glb
#
# The shapes are the code model's own (ct156-model.js, through ct156-exterior-pieces.mjs), so the code's tables stay the
# one source for the aircraft's shape and size. Blender adds what code can't easily: smooth shading with sharp trailing
# edges and corners, and one picture laid over every part (its own UV map) holding the soft shadows where parts crowd
# each other (wing roots, tail, canopy frames, exhausts) and the panel lines and control-surface gaps. Each part keeps
# the code's fingerprint, so the app uses the file only while the code still draws those shapes.
#
# Axes and units are the code model's: nose +X, left +Y, up +Z from the spinner's axis, 1.44 units nose to tail
# (33 ft 4 in). Exported Z-up (export_yup off), so the parts drop into the model's group with no turn.
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
pieces_path, shape_path, out_path = argv[:3]
out_dir = os.path.dirname(os.path.abspath(out_path))
with open(pieces_path) as f:
    PIECES = json.load(f)
with open(shape_path) as f:
    S = json.load(f)
U = S['CT156_UNIT_LENGTH'] / S['CT156_LENGTH_FT']  # model units per foot

bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- the parts, smooth-shaded ----------
# Faces meeting at more than SHARP_DEG keep a hard edge (trailing edges, tips, the exhaust lips); the rest shade smooth.
SHARP_DEG = 40
# Drawn from the file, but not baked: the fuselage opened over the cockpit (the camera's own ship) lies on the whole
# fuselage, so it takes the whole fuselage's picture afterwards instead of shading it.
UNBAKED = {'fuselageCut'}


def build(name, part):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in part['verts']]
    for (a, b, c), slot in zip(part['faces'], part['slots']):
        if len({a, b, c}) < 3:
            continue
        try:
            bm.faces.new((vs[a], vs[b], vs[c])).material_index = slot
        except ValueError:
            pass  # a face drawn twice
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for slot in range(max(part['slots']) + 1):
        mesh.materials.append(bpy.data.materials.get(f'{name}|{slot}') or bpy.data.materials.new(f'{name}|{slot}'))
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


objects = {name: build(name, part) for name, part in PIECES.items()}
PART_IDS = {name: i for i, name in enumerate(PIECES)}

# ---------- one picture: soft shadows and panel lines ----------
# All the baked parts joined into one, laid flat on one UV map (each face's material still names its part), and the
# light reaching each point from all round within AO_DISTANCE_FT baked into a grey picture: white in the open, dark in
# the corners. Then the panel lines are drawn into it (PANEL_LINES, below). Size and distance are estimates.
AO_SIZE = 4096
AO_DISTANCE_FT = 1.5
AO_SAMPLES = 64
AO_CONTRAST = 1.5  # the picture raised to this power, so the shadows read from a formation position

baked = [o for n, o in objects.items() if n not in UNBAKED]
for o in objects.values():
    o.select_set(False)
for o in baked:
    o.select_set(True)
bpy.context.view_layer.objects.active = baked[0]
bpy.ops.object.join()
bake = bpy.context.view_layer.objects.active
bake.name = 'bake'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
bpy.ops.object.mode_set(mode='OBJECT')
for name in UNBAKED:
    objects[name].hide_render = True

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.world = bpy.data.worlds.new('world')
scene.world.light_settings.distance = AO_DISTANCE_FT * U


def bake_into(img, kind, samples, emit=None):
    """Bakes `kind` ('AO' or 'EMIT') into img; for 'EMIT', emit(node_tree) wires each material's emission."""
    scene.cycles.samples = samples
    for m in bake.data.materials:
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        if emit:
            em = nt.nodes.new('ShaderNodeEmission')
            nt.links.new(em.outputs[0], out.inputs[0])
            emit(m, nt, em)
        else:
            d = nt.nodes.new('ShaderNodeBsdfDiffuse')
            nt.links.new(d.outputs[0], out.inputs[0])
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        nt.nodes.active = tex
    bpy.ops.object.select_all(action='DESELECT')
    bake.select_set(True)
    bpy.context.view_layer.objects.active = bake
    bpy.ops.object.bake(type=kind, margin=8)


def pixels(img):
    px = np.empty(AO_SIZE * AO_SIZE * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(AO_SIZE, AO_SIZE, 4)


ao_img = bpy.data.images.new('ao', AO_SIZE, AO_SIZE)
ao_img.generated_color = (1, 1, 1, 1)
bake_into(ao_img, 'AO', AO_SAMPLES)
ao = pixels(ao_img)[..., 0] ** AO_CONTRAST

# Each texel's place on the aircraft (model units) and its part, baked as colours.
pos_img = bpy.data.images.new('pos', AO_SIZE, AO_SIZE, float_buffer=True)
pos_img.colorspace_settings.name = 'Non-Color'


def emit_position(m, nt, em):
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    ma = nt.nodes.new('ShaderNodeVectorMath')
    ma.operation = 'MULTIPLY_ADD'
    ma.inputs[1].default_value = (0.5, 0.5, 0.5)
    ma.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs['Position'], ma.inputs[0])
    nt.links.new(ma.outputs[0], em.inputs['Color'])


bake_into(pos_img, 'EMIT', 1, emit_position)
pos = (pixels(pos_img)[..., :3] - 0.5) * 2
x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]

part_img = bpy.data.images.new('part', AO_SIZE, AO_SIZE, float_buffer=True)
part_img.colorspace_settings.name = 'Non-Color'


def emit_part(m, nt, em):
    v = (PART_IDS[m.name.split('|')[0]] + 0.5) / 64
    em.inputs['Color'].default_value = (v, v, v, 1)


bake_into(part_img, 'EMIT', 1, emit_part)
part = np.floor(pixels(part_img)[..., 0] * 64).astype(int)

# ---------- panel lines ----------
# Thin dark lines where the skin's panels and the control surfaces meet. Measured 11 Oct 2026 off the T-6A-1 Figure
# 1-1-2 views (side view scaled by its 33 ft 4 in, spinner tip to elevator trailing edge; top view by its wing; cited
# only, never traced or kept) and Patrick's photos of 156102 and 156115, each about +-2 in; the ones marked ESTIMATE are
# not on the drawings. Places along the fuselage are feet behind the spinner's tip, heights feet above its axis.
LINE_WIDTH_FT = 0.035  # about 3/8 in
LINE_DARK = 0.2  # how dark a line is at its middle (0 black, 1 none)
TIP_X = 0.66  # the spinner's tip, units (ct156SpinnerProfile)
# The cowl: joints all round 4.43 ft (behind the spinner's backplate) and 8.35 ft (the firewall, under the windscreen's
# foot), one at 6.15 ft from the lower line up; the side panel's upper line 0.72 ft up between the first two, and the
# lower line from -1.27 ft at the first joint to -1.47 ft at the firewall.
COWL_RINGS_FT, COWL_SPLIT_FT = (4.43, 8.35), 6.15
COWL_UPPER_FT = (4.43, 6.15, 0.72)
COWL_LOWER_FT = (4.43, 8.35, -1.27, -1.47)
# Access doors on both sides, rounded oblongs: [front, back, top, bottom] in feet, corners PANEL_CORNER_FT round. The
# door under the firewall, the two big ones aft of the wing and two small ones on the fairing behind the canopy.
PANELS_FT = ((8.5, 10.5, -1.5, -2.3), (18.3, 20.3, 0.3, -1.57), (20.4, 21.9, 0.08, -1.52), (19.1, 20.25, 1.72, 0.84),
             (20.6, 21.1, 1.2, 0.68))
PANEL_CORNER_FT = 0.25
# The wing (top view), by chord fraction (0 the leading edge) and span station s (units along the bent wing): a spar
# line along x = WING_SPAR_X on the top; the ailerons behind AILERON_HINGE from AILERON_ROOT out to the tip cap joint
# TIP_CAP, a trim tab on each aileron's inboard end (TAB_S, behind TAB_F); the flaps behind FLAP_HINGE on the underside
# (dashed from above) from the fuselage to AILERON_ROOT; the centre section's joint at WING_BREAK.
WING_SPAR_X = 0.0923  # 13.1 ft behind the spinner's tip
AILERON_HINGE, AILERON_ROOT, TIP_CAP = 0.765, 0.40, 0.718
TAB_S, TAB_F = 0.462, 0.93
FLAP_HINGE = 0.79
# The gear doors underneath (Patrick, 11 Oct 2026 20:20Z: "I also want the gear doors ... modeled on the bottom"),
# shut, as seen from below: [front, back, inboard, outboard] feet (behind the spinner's tip, out from the middle). The
# T-6A-1 p. 1-38 lists each main gear's outboard door on its leg and two inboard doors; the Fig 1-1-2 views put the
# main legs about 14 ft behind the tip, hinged about 4.1 ft out, and the main wheels about 1.8 ft across. Folded
# inboard the leg's door lies from the hinge in to the wheel and the inboard door over the wheel. Sizes ESTIMATE.
GEAR_DOORS_FT = ((13.45, 14.55, 2.3, 4.25), (12.9, 15.1, 0.45, 2.35))
GEAR_DOOR_CORNER_FT = 0.3
# The speed brake's outline under the belly: hinged 16.0 ft behind the tip, 2.3 ft long, 1.8 ft across (ESTIMATE; the
# code model's SPEED_BRAKE, whose plate is drawn there).
SPEED_BRAKE_FT = (16.0, 18.3, 0.9)
# The tailplane (top view): elevators behind STAB_HINGE, their horn balances reaching forward to STAB_HORN over the
# outer STAB_HORN_SPAN of each half; a trim tab on the right elevator from STAB_TAB_S[0] to [1] of the half-span,
# behind STAB_TAB_F.
STAB_HINGE, STAB_HORN, STAB_HORN_SPAN = 0.58, 0.37, 0.18
STAB_TAB_S, STAB_TAB_F = (0.11, 0.48), 0.9
# The fin (side view): the rudder behind FIN_HINGE; its trim tab behind FIN_TAB_F from the root up to FIN_TAB_TOP units.
FIN_HINGE, FIN_TAB_F, FIN_TAB_TOP = 0.55, 0.88, 0.13

w = LINE_WIDTH_FT * U
lines = np.ones_like(ao)
ft_x = lambda ft: TIP_X - ft * U


def draw(mask, dist):
    """Darkens the texels within `mask` by how close `dist` (units) is to a line."""
    k = np.clip(1 - np.abs(dist) / (w / 2), 0, 1) * mask
    np.minimum(lines, 1 - (1 - LINE_DARK) * k, out=lines)


def oblong(mask, a, b, c, d, r):
    """A rounded oblong's outline, corners r: between a and b along the first axis, c and d along the second."""
    u0, u1 = a
    v0, v1 = c
    cu, cv, hu, hv = (u0 + u1) / 2, (v0 + v1) / 2, abs(u1 - u0) / 2, abs(v1 - v0) / 2
    qu, qv = np.abs(b - cu) - (hu - r), np.abs(d - cv) - (hv - r)
    dist = np.hypot(qu.clip(0), qv.clip(0)) + np.minimum(np.maximum(qu, qv), 0) - r
    draw(mask, dist)


def chord_at(sections, s, half=True):
    """Leading edge and chord at span station s; half: a mirrored table (wing, tailplane), read on its s >= 0 side."""
    rows = sorted((c for c in sections if c['s'] >= 0 or not half), key=lambda c: c['s'])
    ss = np.array([c['s'] for c in rows])
    return np.interp(s, ss, np.array([c['le'] for c in rows])), np.interp(s, ss, np.array([c['chord'] for c in rows]))


def between(v, a, b):
    return (v >= min(a, b)) & (v <= max(a, b))


fus = part == PART_IDS['fuselage']
for ft in COWL_RINGS_FT:
    draw(fus, x - ft_x(ft))
lo0, lo1 = COWL_LOWER_FT[2] * U, COWL_LOWER_FT[3] * U
x0, x1 = ft_x(COWL_LOWER_FT[0]), ft_x(COWL_LOWER_FT[1])
low_z = lo0 + (lo1 - lo0) * (x0 - x) / (x0 - x1)
draw(fus & (z > np.interp(ft_x(COWL_SPLIT_FT), [x1, x0], [lo1, lo0])), x - ft_x(COWL_SPLIT_FT))
draw(fus & between(x, ft_x(COWL_UPPER_FT[0]), ft_x(COWL_UPPER_FT[1])), z - COWL_UPPER_FT[2] * U)
draw(fus & between(x, x0, x1), z - low_z)
for f0, f1, top, bottom in PANELS_FT:
    oblong(fus, (ft_x(f0), ft_x(f1)), x, (top * U, bottom * U), z, PANEL_CORNER_FT * U)

air = part == PART_IDS['airframe']
# The wings: span along the dihedral (the outer panel bends up at WING_BREAK); top or underside by the side of the
# chord plane a texel is on.
ay = np.abs(y)
s = np.where(ay <= S['WING_BREAK'], ay, S['WING_BREAK'] + (ay - S['WING_BREAK']) / math.cos(S['DIHEDRAL']))
plane = S['WING_Z'] + (ay - S['WING_BREAK']).clip(0) * math.tan(S['DIHEDRAL'])
le, ch = chord_at(S['WING'], s)
f = (le - x) / ch
wing = air & (np.abs(z - plane) < 0.04) & (ay > 0.06) & (f > -0.02) & (f < 1.02)
top, under = wing & (z > plane), wing & (z <= plane)
draw(top & between(s, 0.06, TIP_CAP), x - WING_SPAR_X)
draw(wing & between(s, AILERON_ROOT, TIP_CAP), (f - AILERON_HINGE) * ch)
draw(wing & (f > AILERON_HINGE), s - AILERON_ROOT)
draw(wing & between(s, AILERON_ROOT, TAB_S), (f - TAB_F) * ch)
draw(wing & (f > TAB_F), s - TAB_S)
draw(under & (s < AILERON_ROOT), (f - FLAP_HINGE) * ch)
for sp in (S['WING_BREAK'], TIP_CAP):
    draw(wing, s - sp)
# The gear doors and the speed brake, drawn on whatever faces down there (the wing's underside or the belly's).
below = (air | fus) & (z < S['WING_Z'] - 0.004) & (x < ft_x(12.0)) & (x > ft_x(19.0))
for f0, f1, a, b in GEAR_DOORS_FT:
    oblong(below, (ft_x(f0), ft_x(f1)), x, (a * U, b * U), ay, GEAR_DOOR_CORNER_FT * U)
oblong(below, (ft_x(SPEED_BRAKE_FT[0]), ft_x(SPEED_BRAKE_FT[1])), x, (-SPEED_BRAKE_FT[2] * U, SPEED_BRAKE_FT[2] * U), y, 0.01)
# The tailplane and elevators.
half = abs(S['STAB'][0]['s'])
le, ch = chord_at(S['STAB'], ay)
f = (le - x) / ch
stab = air & (x < -0.5) & (np.abs(z - S['STAB'][0]['z']) < 0.03) & (ay > 0.035) & (f > -0.02) & (f < 1.02)
horn = ay > half * (1 - STAB_HORN_SPAN)
draw(stab & ~horn, (f - STAB_HINGE) * ch)
draw(stab & horn, (f - STAB_HORN) * ch)
draw(stab & between(f, STAB_HORN, STAB_HINGE), ay - half * (1 - STAB_HORN_SPAN))
draw(stab & (f > STAB_HINGE), ay - 0.035)
right = stab & (y < 0)
draw(right & between(ay, STAB_TAB_S[0] * half, STAB_TAB_S[1] * half), (f - STAB_TAB_F) * ch)
for t in STAB_TAB_S:
    draw(right & (f > STAB_TAB_F), ay - t * half)
# The fin and rudder (span up the fin).
fin = part == PART_IDS['fin']
le, ch = chord_at(S['FIN'], z, half=False)
f = (le - x) / ch
draw(fin & (z > 0.0), (f - FIN_HINGE) * ch)
draw(fin & (z > 0.0) & (z < FIN_TAB_TOP), (f - FIN_TAB_F) * ch)
draw(fin & (f > FIN_TAB_F), z - FIN_TAB_TOP)
# The nose gear doors: the fairing under the nose split down its middle (ESTIMATE).
rows = np.array(S['STATIONS'])[::-1]
nose = fus & between(x, ft_x(5.85), ft_x(10.5)) & (z < np.interp(x, rows[:, 0], rows[:, 3]) - 0.004)
draw(nose, y)

final = np.clip(ao * lines, 0, 1)
out = np.ones((AO_SIZE, AO_SIZE, 4), dtype=np.float32)
out[..., 0] = out[..., 1] = out[..., 2] = final
ao_img.pixels.foreach_set(out.ravel())
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.color_mode = 'BW'
scene.render.image_settings.quality = 85
ao_file = os.path.splitext(os.path.basename(out_path))[0] + '-ao.jpg'
ao_img.save_render(os.path.join(out_dir, ao_file))
print(f'baked {ao_file}')

# ---------- the parts again, each under its own name ----------
for m in bpy.data.materials:
    m.use_nodes = False
    if m.node_tree:
        for n in list(m.node_tree.nodes):
            m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT')
bake.select_set(True)
bpy.context.view_layer.objects.active = bake
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
pieces_by_part = {}
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in UNBAKED]:
    used = {o.data.materials[p.material_index].name for p in o.data.polygons}
    if not used:
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    pieces_by_part.setdefault(next(iter(used)).split('|')[0], []).append(o)

# The opened fuselage takes the whole fuselage's picture from the nearest point of it.
whole = pieces_by_part['fuselage'][0]
for name in UNBAKED:
    o = objects[name]
    o.hide_render = False
    o.data.uv_layers.new(name=whole.data.uv_layers.active.name)
    mod = o.modifiers.new('picture', 'DATA_TRANSFER')
    mod.object = whole
    mod.use_loop_data = True
    mod.data_types_loops = {'UV'}
    mod.loop_mapping = 'POLYINTERP_NEAREST'
    pieces_by_part[name] = [o]

for name, objs in pieces_by_part.items():
    for o in objs:
        o.name = f'{name}-mesh'  # first, so the part's own name is free for its node
for name, objs in pieces_by_part.items():
    top = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(top)
    top['ct156_hash'] = PIECES[name]['hash']  # the glTF node's extras; the app checks it against the code's
    for o in objs:
        o.parent = top

bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_yup=False, export_apply=True, export_extras=True,
                          export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False)
print(f'{os.path.basename(out_path)} written: {len(pieces_by_part)} parts')
