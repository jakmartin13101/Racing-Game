# Gravel Riot: Caldera Loop

A playable single-lap volcano track for PC and mobile browsers.
Built with Three.js (PBR rendering, post-processing) and Rapier (vehicle physics).

## Run

```bash
cd game
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/, host anywhere
```

Controls: W/S or arrows to drive and brake, A/D to steer, Shift to boost, Space for the handbrake,
R to reset to the last checkpoint. Gamepads (triggers + left stick) and touch buttons are supported.

URL options: `?mobile` (low quality preset), `?lowq`, `?auto` (attract-mode autopilot),
`?photo=cam:x,h,z,lx,ly,lz` and `?orbit=dx,dy,dz,fov` for screenshots, `?still=N` (render one frame after N
simulated steps, used for headless captures).

## What's in it

- **Track**: a 2.9 km loop around a 640 m stratovolcano. A cinder plain start straight, climbs into basalt
  cuttings, a jump over a lava river, ridge runs, and a descent back past a lava lake.
- **Truck**: the "Ridgeline" trophy truck, modelled procedurally in Blender (`tools/truck/build.py`): lofted
  pickup body, cab with glass and interior, bed cage with triple rear shocks, two strapped spares, A-arms and
  coilovers, light bar, lugged tyres on beadlock rims. `tools/truck/bake.py` bakes weathered paint, decals,
  chipped edges, ash dust, mud splatter and rust into 2K PBR atlases.
- **Environment**: CC0 textures, HDRI and props from Poly Haven and ambientCG (see each `LICENSE.txt`),
  triplanar rock on cliffs, animated lava with bloom, a volcanic plume, wheel dust, drifting ash and embers,
  N8AO ambient occlusion, ACES tone mapping.

## Regenerating assets

Needs Blender as a Python module (`pip install bpy`), numpy, scipy, pillow, and the downloaded CC0 assets
(`ASSETS=/path/to/assets`).

```bash
python tools/world.py             # heightmap, masks, track + lava data -> public/world
python tools/textures.py          # procedural sprites / detail maps -> public/textures
python tools/import_assets.py     # Poly Haven / ambientCG maps + HDRI -> public/textures/ext, public/env
python tools/pack_terrain.py      # pack terrain sets into albedo+rough / normal+AO pairs (16-texture GPUs)
python tools/decimate_props.py    # game-budget rock/prop models -> public/models/env
python tools/truck/bake.py        # truck model + baked textures -> public/models/truck*
```
