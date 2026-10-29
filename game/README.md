# Gravel Riot

Off-road truck racing in a volcanic region, for PC (browser or installed Windows app), tablets and phones.
Built with Three.js (PBR rendering, post-processing) and Rapier (vehicle physics).

## Run

```bash
cd game
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/, host anywhere
npm run app        # build and open the desktop app (needs the electron binary: plain `npm i` downloads it)
npm run dist:win   # Windows installer -> release/GravelRiot-Setup.exe (needs makensis; on Linux `apt install nsis`)
```

## Modes and tracks

- **World Race**: a three-round championship (Ashfall Village, Summit Sprint, Caldera Loop) with
  10-8-6-5-4-3-2-1 points and standings after each round.
- **Quick Race**: any track, 0 to 7 opponents, easy / normal / hard AI, lap count, truck paint.
- **Settings**: graphics preset (low / medium / high), frame-rate cap (30 / 60 / uncapped), camera, touch
  steering style (buttons or tilt), auto-accelerate, steering assist, FPS counter, driver name.

Tracks share one volcano map:

- **Caldera Loop** (main track, 2.9 km): the original loop with the lava-river jump.
- **Ashfall Village** (1.9 km): a circuit through the streets of the village below the volcano.
- **Summit Sprint** (3.2 km, point to point): switchbacks from the foothills up to the summit lookout.

The browser and phones cap at 30 fps and default to lighter graphics; the desktop app runs uncapped at high.

## Controls

Keyboard: W/S or arrows to drive and brake, A/D to steer, Shift to boost, Space for the handbrake,
C to change camera, R to reset, Esc or P to pause. Gamepad: RT/LT, left stick, A boost, B handbrake,
Y camera, Start pause, Back reset. Touch: left/right pads, gas, brake, boost, camera and pause buttons
(or tilt steering); auto-accelerate and steering assist are on by default on touch devices.

Cameras: chase, far chase, hood, bumper and trackside TV.

## Crashes and damage

- **Knock-down props**: barrels, tyres, crates, gas bottles, jerry cans, benches, tables, corner chevrons,
  concrete barriers and street lamps fly or topple when hit, and take speed off the truck in proportion to their
  weight. Barriers and lamps stand firm below about 45 and 18 km/h. Buildings and trees are solid.
- **Truck damage**: hard hits dent the body and scrape the paint, and parts break off by side (mirrors,
  bumpers, light bar, spare tyres, doors, bonnet). Damage costs power and top speed; at 100% the truck is
  totaled, coasts to a stop and is out (DNF), unless it rolls over the finish line first.
- **Boost**: the camera shakes in the last 5% of the tank. Running it dry at full boost blows the engine one
  time in five: slow motion, bonnet and pistons out, fire and smoke, and the truck is totaled.

`tools/truck/split.py` cuts the breakable parts out of the baked truck models.

URL options: `?race=caldera|village|summit`, `&ai=N`, `&laps=N`, `&diff=easy|normal|hard`, `&cam=...`,
`?q=low|medium|high`, `?fps=N`, `?auto` (autopilot), `?blow` (force an engine blow), `?at=N&yaw=R&ram=V` (crash test), `?still=N` (render one frame after N simulated steps,
used for headless captures).

## Code

`src/main.js` (app state and loop), `world.js` (terrain, materials, lava), `track.js` (track geometry
queries), `vehicle.js` (truck physics and visuals), `ai.js` (opponent drivers), `race.js` (grid, laps,
respawns, results), `camera.js`, `input.js` (keyboard, gamepad, touch, tilt), `ui.js` / `ui.css` (menus,
HUD), `settings.js` (presets and saved settings), `props.js` and `village.js` (scenery). The desktop
wrapper is `electron/main.cjs`, and `electron/installer.nsi` builds the installer.

## Truck and environment

- **Truck**: the "Ridgeline" trophy truck, modelled procedurally in Blender (`tools/truck/build.py`), with
  2K PBR atlases baked by `tools/truck/bake.py` and a 23k-triangle LOD (`tools/truck/lod.py`) for
  distant opponents.
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
python tools/import_village.py    # village building materials -> public/textures/ext/v_*
python tools/decimate_props.py    # game-budget rock/prop models -> public/models/env
python tools/truck/bake.py        # truck model + baked textures -> public/models/truck*
python tools/truck/lod.py         # low-poly truck for distant opponents
python tools/truck/split.py       # breakable parts (run after bake.py and lod.py)
```
