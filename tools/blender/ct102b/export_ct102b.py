# Exports the CT-102B Astra II master (built by build_ct102b.py) as the two model files the app loads (Traffic plan
# Step 5c Phase 5; shared plan Step 3c item 6, first delivery: the outside and its paint, no cockpit; Dad, 14 Oct 2026:
# "Export it now, refine later"). Runs headless:
#   blender -b --factory-startup -P tools/blender/ct102b/export_ct102b.py -- <master.blend> public/models
#   <venv>/bin/python tools/blender/ct102b/export_ct102b.py -- <master.blend> public/models
#
# Writes ct102b-exterior.glb (High: every part as built, the paint pictures at full size) and ct102b-exterior-lite.glb
# (the light one for every Astra but the one followed: the bigger parts decimated and the paint pictures halved).
# Both keep the master's own frame and units: feet, nose +X (the spinner tip at x 0), left +Y, up +Z, exported Z-up
# (no turn), as the CT-156's files are; src/ui-kit/ct102b-model.js scales and places them. A picture only: no flight numbers.
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    sys.exit('usage: export_ct102b.py -- <master.blend> <out dir>')
MASTER, OUT = os.path.abspath(argv[0]), os.path.abspath(argv[1])

# The light file: parts over this many triangles are decimated to this share, and each paint picture is halved.
# Estimates for the look at the size an Astra is drawn when not followed (a few tens of pixels long).
LITE_MIN_TRIS = 1000
LITE_RATIO = 0.3
LITE_PICTURE_SCALE = 0.5


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=False, export_apply=True, export_texcoords=True,
        export_normals=True, export_materials='EXPORT', export_image_format='AUTO', export_extras=True,
        export_cameras=False, export_lights=False, export_animations=False,
    )
    print('wrote', path, os.path.getsize(path), 'bytes')


def triangles(obj):
    mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


bpy.ops.wm.open_mainfile(filepath=MASTER)
os.makedirs(OUT, exist_ok=True)
for obj in bpy.data.objects:  # nothing hidden from the renders goes in the files either
    if obj.hide_render:
        bpy.data.objects.remove(obj)

export(os.path.join(OUT, 'ct102b-exterior.glb'))

for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
    if triangles(obj) > LITE_MIN_TRIS:
        mod = obj.modifiers.new('lite', 'DECIMATE')
        mod.ratio = LITE_RATIO
for image in bpy.data.images:
    if image.size[0] > 0:
        image.scale(max(1, round(image.size[0] * LITE_PICTURE_SCALE)), max(1, round(image.size[1] * LITE_PICTURE_SCALE)))
export(os.path.join(OUT, 'ct102b-exterior-lite.glb'))
