# Vehicle line-up

30 vehicles, 5 each of ATV, dirt bike, rail buggy, dune buggy, jeep and side-by-side, built the same
way as the Ridgeline truck: procedural Blender models with 2K baked PBR atlases (colour, AO/roughness/metal,
normal, clear-coat) weathered with ash dust, mud splatter, edge wear and rust, plus livery and decals.

| Class | Vehicles |
|---|---|
| ATV | Hornet, Pack Mule, Bogwalker, Sandstinger, Ember |
| Dirt bike | Kestrel MX, Ashrunner, Nomad, Banshee, Mountain Goat |
| Rail buggy | Dune Phantom, Scorpion, Wasp, Dust Devil, Vulcan |
| Dune buggy | Sunseeker, Coyote, Tiki Runner, Cinder, Sprite |
| Jeep | Trail Boss, Rockhopper, Sirocco, Bayou Bruiser, Desert Scout |
| Side-by-side | Razorback, Four Play, Workhorse, Dune Blade, Swamp Thing |

Showroom renders of every vehicle are in `shots/`.

## Output

Per vehicle, in `public/models/vehicles/`:

- `<id>.glb`: nodes `body`, `glass`, `lights`, `wheel_FL/FR/RL/RR` (bikes: `wheel_F`, `wheel_R`) and, for
  bikes and ATVs, `steer` (fork / handlebars, origin on the steering axis). Materials are named like the
  truck's (`body`, `wheel`, `glass`, `light_lamp`, `light_tail`, `light_lens`, `light_amber`), so the baked
  atlases bind the same way as in `src/vehicle.js`. Same axes as the truck: +Z forward, origin at the physics
  body centre.
- `<id>/`: `body_col.jpg`, `body_orm.jpg`, `body_nrm.png`, `body_coat.jpg`, `wheel_col.jpg`, `wheel_orm.jpg`,
  `wheel_nrm.png`.
- `<id>.json`: wheel positions and radii, steering pivot and axis, origin height, size, triangle count and
  a suggested physics tune (`mass` kg, relative `power`, `grip`, `top` km/h) for balancing.

Bodies are decimated to 60k triangles (ATVs, bikes) or 80k (the rest); each wheel is 6k to 12k.

## Building

Needs `bpy` (Blender 5.2 as a Python module), numpy, pillow and the CC0 assets (`ASSETS=/path/to/assets`).

```bash
python tools/vehicles/make.py <id|class|all>             # build, bake, export, showroom render
python tools/vehicles/make.py <id> --preview             # untextured modelling check only
python tools/vehicles/showroom.py <glb> <texdir> <out.jpg> "<title>" "<subtitle>"
```

About 9 to 10 minutes per vehicle on 4 CPU cores.

- `specs.py`: the 30 designs (colours, livery, parts, tune).
- `kit.py`: shared parts (tyres in 8 tread styles, rims in 8 styles, wire wheels, coilovers, A-arms, tube
  frames, lofted shells and panels, bucket seats, saddles, bars, lights).
- `atv.py`, `bike.py`, `rail.py`, `dune.py`, `jeep.py`, `sxs.py`: one builder per class.
- `vbake.py`: weathering graphs, livery, decals, baking and glTF export. `livery.py` draws the decals.
- `showroom.py`: renders the exported model on a gravel pad under the game sky.
