# Bakes the buildings' shadows onto the ground for Traffic's 3D view (TR-133; Patrick, 10 Oct: "I wanna start with shadows").
# Run headless: blender -b -P tools/blender/bake-shadows.py -- buildings.obj out.png [samples]
# buildings.obj comes from tools/blender/export-buildings.mjs (feet from the ARP, z up). The sun is the 3D view's own (view3d.js SUN_AZIMUTH_DEG and
# SUN_ELEVATION_DEG; TR-134): from 225 degrees true, 30 degrees up, its edge softened to 1.5 degrees (an estimate; the real sun is 0.5). Two bakes onto a flat ground
# sheet over the base: direct sunlight (the cast shadows) and ambient occlusion within 30 ft (the darkening where a wall meets the
# ground). Written as one grey picture of darkness (black = untouched ground, white = darkest), 2 ft a pixel, with its corners in
# the file name's .json beside it.
import bpy, sys, json, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
obj_path, out_png = argv[0], argv[1]
samples = int(argv[2]) if len(argv) > 2 else 32
AREA = dict(x0=-1200.0, x1=2900.0, y0=1300.0, y1=5100.0)  # the flight line and the base, ft from the ARP
FT_PER_PX = 2.0
SUN_AZ, SUN_EL, SUN_SOFT_DEG = 225.0, 30.0, 1.5
AO_DISTANCE_FT = 30.0

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = samples
scene.world = bpy.data.worlds.new('world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0  # sun only: shadows stay clean

bpy.ops.wm.obj_import(filepath=obj_path, forward_axis='Y', up_axis='Z')
buildings = [o for o in scene.objects if o.type == 'MESH']
grey = bpy.data.materials.new('walls')
for o in buildings:
    o.data.materials.clear()
    o.data.materials.append(grey)

# The sun: its light runs along its local -Z, so its +Z points at the sun.
az, el = math.radians(SUN_AZ), math.radians(SUN_EL)
toward_sun = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = 1.0
sun_data.angle = math.radians(SUN_SOFT_DEG)
sun = bpy.data.objects.new('sun', sun_data)
sun.rotation_euler = toward_sun.to_track_quat('Z', 'Y').to_euler()
scene.collection.objects.link(sun)

# The ground sheet, with an image to bake into.
W = int(round((AREA['x1'] - AREA['x0']) / FT_PER_PX))
H = int(round((AREA['y1'] - AREA['y0']) / FT_PER_PX))
bpy.ops.mesh.primitive_plane_add(size=1, location=((AREA['x0'] + AREA['x1']) / 2, (AREA['y0'] + AREA['y1']) / 2, 0.02))
ground = bpy.context.active_object
ground.scale = (AREA['x1'] - AREA['x0'], AREA['y1'] - AREA['y0'], 1)
bpy.ops.object.transform_apply(scale=True)
mat = bpy.data.materials.new('ground')
mat.use_nodes = True
nodes = mat.node_tree.nodes
nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1)
nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
ground.data.materials.append(mat)


def bake(kind, **kw):
    img = bpy.data.images.new(kind, W, H, float_buffer=True)
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    nodes.active = tex
    for o in scene.objects:
        o.select_set(False)
    ground.select_set(True)
    bpy.context.view_layer.objects.active = ground
    bpy.ops.object.bake(type=kind, margin=0, **kw)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[..., 0]
    nodes.remove(tex)
    return a


direct = bake('DIFFUSE', pass_filter={'DIRECT'})
lit = np.percentile(direct, 99)  # open, sunlit ground
direct = np.clip(direct / max(lit, 1e-6), 0, 1)
scene.world.light_settings.distance = AO_DISTANCE_FT
ao = np.clip(bake('AO'), 0, 1)

darkness = np.clip((1 - direct) * 0.85 + (1 - ao) * 0.45, 0, 1)
out = bpy.data.images.new('darkness', W, H)
rgba = np.ones((H, W, 4), dtype=np.float32)
rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = darkness
out.pixels = rgba.ravel()
out.filepath_raw = out_png
out.file_format = 'PNG'
out.save()
with open(out_png.rsplit('.', 1)[0] + '.json', 'w') as f:
    json.dump({**AREA, 'ftPerPx': FT_PER_PX, 'width': W, 'height': H, 'sun': [SUN_AZ, SUN_EL]}, f)
print('baked', W, 'x', H, 'shadowed share', float((darkness > 0.2).mean()))
