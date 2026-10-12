# Builds the CT-156's landing gear as a Blender model file (ALL-34, Patrick 12 Oct 2026) and exports
# public/models/ct156-gear.glb with its baked picture public/models/ct156-gear-ao.jpg. Runs headless:
#
#   node tools/blender/ct156-gear-pieces.mjs > ct156-gear-pieces.json
#   node tools/blender/ct156-exterior-pieces.mjs > ct156-exterior-pieces.json
#   node tools/blender/ct156-shape.mjs > ct156-shape.json
#   blender -b --factory-startup -P tools/blender/build_ct156_gear.py -- ct156-gear-pieces.json ct156-exterior-pieces.json ct156-shape.json public/models/ct156-gear.glb
#
# The shapes are the code model's own (ct156-model.js, through ct156-gear-pieces.mjs), so the code's tables stay the one
# source for the gear's shape and size. Blender smooths them and bakes one picture of soft shadows over them, gear down:
# each part is set in its place for the bake (its pose), with the right side's gear and the fuselage and wings round it
# to cast shadows, then put back in its hinge's own frame for the app to swing. Each part keeps the code's fingerprint,
# so the app uses the file only while the code still draws those shapes.
#
# Axes and units are the code model's: nose +X, left +Y, up +Z from the spinner's axis, 1.44 units nose to tail
# (33 ft 4 in). Exported Z-up (export_yup off).
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
gear_path, exterior_path, shape_path, out_path = argv[:4]
out_dir = os.path.dirname(os.path.abspath(out_path))
with open(gear_path) as f:
    PIECES = json.load(f)
with open(exterior_path) as f:
    EXTERIOR = json.load(f)
with open(shape_path) as f:
    S = json.load(f)
U = S['CT156_UNIT_LENGTH'] / S['CT156_LENGTH_FT']  # model units per foot

bpy.ops.wm.read_factory_settings(use_empty=True)

# Faces meeting at more than SHARP_DEG keep a hard edge (door edges, the tyre's shoulders); the rest shade smooth.
SHARP_DEG = 40
# The parts drawn on both sides; the right side is the left's mirror (the app draws it so too).
MIRRORED = ('gearMain', 'gearMainDoor', 'gearInboardDoor', 'gearNoseDoor')
# The outside's parts that shade the gear: the fuselage, and the wings and tail.
OCCLUDERS = ('fuselage', 'airframe')


def build(name, part, slots=True):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in part['verts']]
    for (a, b, c), slot in zip(part['faces'], part['slots']):
        if len({a, b, c}) < 3:
            continue
        try:
            bm.faces.new((vs[a], vs[b], vs[c])).material_index = slot if slots else 0
        except ValueError:
            pass  # a face drawn twice
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for slot in range(max(part['slots']) + 1 if slots else 1):
        mat = f'{name}|{slot}'
        mesh.materials.append(bpy.data.materials.get(mat) or bpy.data.materials.new(mat))
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def pose_of(part):
    e = part['pose']  # column-major
    return Matrix([[e[0], e[4], e[8], e[12]], [e[1], e[5], e[9], e[13]], [e[2], e[6], e[10], e[14]], [e[3], e[7], e[11], e[15]]])


POSES = {name: pose_of(part) for name, part in PIECES.items()}
objects = {}
for name, part in PIECES.items():
    o = build(name, part)
    o.data.transform(POSES[name])  # into its place, gear down
    objects[name] = o
# Shading only, not baked or exported: the right side's gear, the fuselage and the wings.
shade_only = []
for name in MIRRORED:
    m = objects[name].data.copy()
    m.transform(Matrix.Diagonal((1, -1, 1, 1)))
    m.flip_normals()
    o = bpy.data.objects.new(f'{name}-right', m)
    bpy.context.collection.objects.link(o)
    shade_only.append(o)
for name in OCCLUDERS:
    shade_only.append(build(f'{name}-shade', EXTERIOR[name], slots=False))

# ---------- one picture: soft shadows ----------
# The left gear's parts joined into one, laid flat on one UV map (each face's material still names its part), and the
# light reaching each point from all round within AO_DISTANCE_FT baked into a grey picture: white in the open, dark in
# the corners (the wheel under its leg, the doors' insides, the wing over the legs). Size and distance are estimates.
AO_SIZE = 1024
AO_DISTANCE_FT = 1.0
AO_SAMPLES = 64
AO_CONTRAST = 1.3

for o in bpy.data.objects:
    o.select_set(False)
for o in objects.values():
    o.select_set(True)
bpy.context.view_layer.objects.active = objects['gearMain']
bpy.ops.object.join()
bake = bpy.context.view_layer.objects.active
bake.name = 'bake'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = AO_SAMPLES
scene.world = bpy.data.worlds.new('world')
scene.world.light_settings.distance = AO_DISTANCE_FT * U

ao_img = bpy.data.images.new('ao', AO_SIZE, AO_SIZE)
ao_img.generated_color = (1, 1, 1, 1)
for m in bake.data.materials:
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    d = nt.nodes.new('ShaderNodeBsdfDiffuse')
    nt.links.new(d.outputs[0], out.inputs[0])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = ao_img
    nt.nodes.active = tex
bpy.ops.object.select_all(action='DESELECT')
bake.select_set(True)
bpy.context.view_layer.objects.active = bake
bpy.ops.object.bake(type='AO', margin=8)

px = list(ao_img.pixels)
for i in range(0, len(px), 4):
    v = px[i] ** AO_CONTRAST
    px[i] = px[i + 1] = px[i + 2] = v
ao_img.pixels = px
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.color_mode = 'BW'
scene.render.image_settings.quality = 85
scene.view_settings.view_transform = 'Raw'  # the values as they are: the picture is data, not colour
ao_file = os.path.splitext(os.path.basename(out_path))[0] + '-ao.jpg'
ao_img.save_render(os.path.join(out_dir, ao_file))
print(f'baked {ao_file}')

# ---------- the parts again, each under its own name, back in its hinge's frame ----------
for o in shade_only:
    bpy.data.objects.remove(o, do_unlink=True)
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
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    used = {o.data.materials[p.material_index].name for p in o.data.polygons}
    if not used:
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    name = next(iter(used)).split('|')[0]
    o.data.transform(POSES[name].inverted())
    pieces_by_part.setdefault(name, []).append(o)

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
