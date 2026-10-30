"""Build, bake, export and photograph vehicles from specs.py.

    python tools/vehicles/make.py <id|class|all> [--size 2048] [--samples 8] [--preview] [--shot-only]

--preview renders the untextured model only (fast modelling check).
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import specs  # noqa: E402

GAME = os.path.abspath(os.path.join(HERE, '..', '..'))
SHOTS = os.environ.get('SHOTS', os.path.join(GAME, 'tools', 'vehicles', 'shots'))


def builder(cls):
    import importlib
    return importlib.import_module(cls).build


def main():
    a = sys.argv[1:]
    sel = a[0]
    size = int(a[a.index('--size') + 1]) if '--size' in a else 2048
    samples = int(a[a.index('--samples') + 1]) if '--samples' in a else 8
    todo = [s for s in specs.ALL if sel in ('all', s['id'], s['class'])]
    for s in todo:
        if '--preview' in a:
            import kit
            kit.reset(); kit.init_mats()
            P = builder(s['class'])(s)
            import bpy
            for name, loc, kind in P.spots:
                for src in P.wheel_kinds[kind]:
                    o = src.copy(); o.data = src.data.copy(); bpy.context.scene.collection.objects.link(o)
                    if loc[0] < 0:
                        o.rotation_euler[2] = 3.14159265
                    o.location = loc
            for kd in P.wheel_kinds.values():
                for src in kd:
                    src.location.z = -50
            L = P.meta['ymax'] - P.meta['ymin']
            d = L * 1.6 + 1.5
            kit.preview(f'/tmp/claude-0/vs/{s["id"]}_pre.png', (d * 0.75, d * 0.8, d * 0.38), (0, 0, P.meta['height'] * 0.4))
            kit.preview(f'/tmp/claude-0/vs/{s["id"]}_pre2.png', (-d * 0.8, -d * 0.7, d * 0.42), (0, 0, P.meta['height'] * 0.4))
            continue
        if '--shot-only' not in a:
            import vbake
            vbake.produce(s, builder(s['class']), size, samples)
        os.makedirs(SHOTS, exist_ok=True)
        out = os.path.join(SHOTS, f"{s['id']}.jpg")
        subprocess.run([sys.executable, os.path.join(HERE, 'showroom.py'), os.path.join(GAME, 'public', 'models', 'vehicles', s['id'] + '.glb'),
                        os.path.join(GAME, 'public', 'models', 'vehicles', s['id']), out, s['name'],
                        f"{specs.CLASS_NAMES[s['class']]}  ·  #{s['number']}  ·  {s['blurb']}", '--samples', '40', '--width', '960'], check=True)


if __name__ == '__main__':
    main()
