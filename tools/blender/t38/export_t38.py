# Exports the T-38A master (built by build_t38.py) as the two model files the app loads (shared plan Step 3d item 6,
# first delivery: the outside and its Beale paint, no cockpit; first used in the Debrief's 3D view, Dad, 14 Oct 2026:
# "add it into the KML as a choice for how to display aircraft"). Runs headless:
#   blender -b --factory-startup -P tools/blender/t38/export_t38.py -- <master.blend> public/models
#   <venv>/bin/python tools/blender/t38/export_t38.py -- <master.blend> public/models
#
# Writes t38a-exterior.glb (High: every part as built, the paint pictures at full size) and t38a-exterior-lite.glb (the
# bigger parts decimated and the paint pictures halved). Both keep the master's own frame and units: feet, nose +X with
# the radome tip at x 0 (the pitot ahead of it), left +Y, up +Z with the ground under the wheels at build_t38.py's
# GROUND_Z, exported Z-up (no turn); src/ui-kit/t38a-model.js scales and places them. A picture only: no flight numbers.
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    sys.exit('usage: export_t38.py -- <master.blend> <out dir>')
MASTER, OUT = os.path.abspath(argv[0]), os.path.abspath(argv[1])

# The light file: parts over this many triangles are decimated to this share, and each paint picture is halved.
# Estimates for the look at the size an aircraft is drawn when not followed (the same as the Astra's).
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
for obj in list(bpy.data.objects):  # nothing hidden from the renders (the grid, the cameras' helpers) goes in the files
    if obj.hide_render or obj.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(obj)

export(os.path.join(OUT, 't38a-exterior.glb'))

for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
    if triangles(obj) > LITE_MIN_TRIS:
        mod = obj.modifiers.new('lite', 'DECIMATE')
        mod.ratio = LITE_RATIO
for image in bpy.data.images:
    if image.size[0] > 0:
        image.scale(max(1, round(image.size[0] * LITE_PICTURE_SCALE)), max(1, round(image.size[1] * LITE_PICTURE_SCALE)))
export(os.path.join(OUT, 't38a-exterior-lite.glb'))
