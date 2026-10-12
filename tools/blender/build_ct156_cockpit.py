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
# name once the file is in, and only while the part's fingerprint matches the code's; the code part stays otherwise.
# Every part, the forward bow and the canopy rails included, is the code's own pieces, rounded and shaded here. Until
# 12 Oct 2026 this script drew its own bow and rails from a few numbers, with no fingerprint, so the app showed those
# whatever the code drew (Patrick, 12 Oct 2026, "the canopy rail gets thin as soon as I move my head").
#
# Axes as the code cockpit: feet, nose +X, left +Y, up +Z, origin on the spinner's axis at the model's origin. Exported
# Z-up (export_yup off). Materials are named by the code cockpit's colour slots (band, black, frame, dark).
import json
import math
import sys

import bpy
import bmesh
import mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
shape_path, out_path = argv[0], argv[1]
pieces_path = argv[2] if len(argv) > 2 else None  # the code cockpit's named parts (ct156-cockpit-pieces.mjs)
ao_dir = argv[3] if len(argv) > 3 else None       # where the baked soft shadows go (one picture per part)
with open(shape_path) as f:
    S = json.load(f)

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


# ---------- the code cockpit's named parts (forward-bow, canopy-rails, seat, pcl, stick, body), rounded ----------
# Each piece as the code draws it, its vertices welded so Blender can round its edges: the seat's cushions well rounded
# (SEAT_ROUND), the oxygen hose left as it is, every other piece's edges rounded a little (EDGE_ROUND). Each part is an
# empty holding its pieces; the loader merges them by colour.
SEAT_ROUND = (0.03, 4)   # (width ft, segments): the cushions and bolsters (estimate, judged off Patrick's photos)
EDGE_ROUND = (0.006, 2)  # about 0.07 in: machined and moulded edges (estimate)
ROUND_BY_SLOT = {'seat': SEAT_ROUND, 'green': None}
if pieces_path:
    with open(pieces_path) as f:
        PIECES = json.load(f)
    EYES = [(e['x'], e['y'], e['z']) for e in PIECES.pop('_eyes').values()]
    for name, entry in PIECES.items():
        part = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(part)
        if entry['hash']:
            part['ct156_hash'] = entry['hash']  # exported as the node's extras; the loader checks it against the code's
        for k, pc in enumerate(entry['pieces']):
            bm = bmesh.new()
            vs = [bm.verts.new(v) for v in pc['verts']]
            for a, b, c in pc['faces']:
                if len({a, b, c}) == 3:
                    try:
                        bm.faces.new((vs[a], vs[b], vs[c]))
                    except ValueError:
                        pass  # a face drawn twice
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
            bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
            if name != '_occluders':
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            else:  # the pictured faces are open sheets: each turned to face the nearer pilot's eye, the side he sees
                bm.normal_update()
                for f in bm.faces:
                    c = f.calc_center_median()
                    eye = min(EYES, key=lambda e: abs(e[0] - c.x))
                    if f.normal.dot(mathutils.Vector(eye) - c) < 0:
                        f.normal_flip()
            rnd = None if name == '_occluders' else ROUND_BY_SLOT.get(pc['slot'], EDGE_ROUND)
            obj = new_object(f'{name}-{k}', bm, [pc['slot']], bevel=0.0)
            if rnd:
                mod = obj.modifiers.new('round', 'BEVEL')
                mod.width, mod.segments = rnd
                mod.limit_method = 'ANGLE'
                mod.angle_limit = math.radians(35)
                mod.harden_normals = True
            obj.parent = part

# ---------- the baked soft shadows (ambient occlusion) ----------
# Each part's pieces joined into one mesh, laid out flat (its own UV map), and the light reaching each point from all
# round within AO_DISTANCE baked into a grey picture (white open, dark in corners and under overhangs), the pictured
# faces (_occluders) shading them too. Saved as ct156-cockpit-ao-<part>.jpg beside the file and named in the part's
# extras; the app darkens the part's colours by it (ct156-cockpit-model.js). Sizes and distance are estimates.
AO_DISTANCE = 1.0  # ft: how far round a point counts as shading it (0.6 read as almost nothing from the seat)
AO_SAMPLES = 64
AO_CONTRAST = 1.8  # the picture raised to this power, so half-shaded corners read darker from the seat
AO_SIZE = {'body': 2048, 'seat': 1024, 'pcl': 1024, 'stick': 512, 'forward-bow': 1024, 'canopy-rails': 1024, 'shade': 2048}
PARTS = [o for o in bpy.data.objects if o.parent is None and o.name != '_occluders']


def join_part(top):
    meshes = [o for o in [top] + list(top.children_recursive) if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.convert(target='MESH')  # applies the rounding
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


if ao_dir:
    import os
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = AO_SAMPLES
    scene.world = bpy.data.worlds.new('world')
    scene.world.light_settings.distance = AO_DISTANCE
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.color_mode = 'BW'
    scene.render.image_settings.quality = 88
    # The pictured faces get their shadows too, as their own part 'shade': the faces themselves, carrying only the baked
    # picture, which the app lays over the code's pictures (multiplying), so the code's faces keep their own pictures.
    occ = bpy.data.objects.get('_occluders')
    if occ:
        shade = join_part(occ)
        shade.parent = None
        shade.name = 'shade'
        shade['ct156_hash'] = PIECES['_occluders']['hash']
        shade.data.materials.clear()
        shade.data.materials.append(material('shade'))
        PARTS.append(shade)
    for top in PARTS:
        size = AO_SIZE.get(top.name)
        if not size:
            continue
        mesh = join_part(top)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
        bpy.ops.object.mode_set(mode='OBJECT')
        img = bpy.data.images.new(f'ao-{top.name}', size, size)
        for m in mesh.data.materials:
            m.use_nodes = True
            node = m.node_tree.nodes.get('ao') or m.node_tree.nodes.new('ShaderNodeTexImage')
            node.name = 'ao'
            node.image = img
            m.node_tree.nodes.active = node
        bpy.ops.object.select_all(action='DESELECT')
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.bake(type='AO', margin=6)
        import numpy as np
        px = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px[0::4] **= AO_CONTRAST
        px[1::4] **= AO_CONTRAST
        px[2::4] **= AO_CONTRAST
        img.pixels.foreach_set(px)
        file = f'ct156-cockpit-ao-{top.name}.jpg'
        img.save_render(os.path.join(ao_dir, file))
        top['ct156_ao'] = file
        print(f'baked {file}')
    # The image nodes only steer the bake; the file's materials stay plain names.
    for m in bpy.data.materials:
        if m.node_tree and m.node_tree.nodes.get('ao'):
            m.node_tree.nodes.remove(m.node_tree.nodes['ao'])
for o in [o for o in bpy.data.objects if o.name.startswith('_occluders')]:
    bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_yup=False, export_apply=True, export_extras=True,
                          export_cameras=False, export_lights=False)
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
print(f'ct156-cockpit.glb written: {len(bpy.data.objects)} objects, about {tris} triangles before bevels')
