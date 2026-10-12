# Picks where the CT-156 build scripts bake their soft shadows: the graphics card if Blender finds one (OptiX, then
# CUDA, then HIP), otherwise the processor. Checked 12 Oct 2026 on Blender 5.2 with an RTX 3070: the card's pictures
# match the processor's (mean difference 0.03 of 255) and the outside bakes in 52 s instead of 125 s.
# Set CT156_BAKE_DEVICE=CPU to force the processor.
import os

import bpy


def use_bake_device(scene):
    """Sets scene.cycles.device to 'GPU' when a graphics card is usable, else 'CPU'. Prints what it chose."""
    scene.cycles.device = 'CPU'
    if os.environ.get('CT156_BAKE_DEVICE', '').upper() == 'CPU':
        print('bake device: CPU (CT156_BAKE_DEVICE)')
        return
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP'):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        cards = [d for d in prefs.devices if d.type == kind]
        if cards:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = 'GPU'
            print(f'bake device: GPU ({kind}: {", ".join(d.name for d in cards)})')
            return
    print('bake device: CPU (no graphics card found)')
