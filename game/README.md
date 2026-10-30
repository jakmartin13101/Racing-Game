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

- **World Race**: a four-round championship (Ashfall Village, Summit Sprint, Caldera Loop, and Eruption as
  the finale) with 10-8-6-5-4-3-2-1 points and standings after each round.
- **Quick Race**: any track, 0 to 7 opponents, easy / normal / hard AI, lap count, truck paint.
- **Settings**: graphics preset (low / medium / high / ultra), frame-rate cap (30 / 60 / uncapped), camera, touch
  steering style (buttons or tilt), auto-accelerate, steering assist, FPS counter, driver name.

Tracks share one volcano map:

- **Caldera Loop** (main track, 2.9 km): the original loop with the lava-river jump. Once the leader starts
  lap two, the road in the canyon breaks and a slab of it heaves up into a ramp, and lava floods across the
  road just past it: jump it or lose the truck to the lava.
- **Ashfall Village** (1.9 km): a circuit through the streets of the village below the volcano, under a
  steady rain of glowing volcanic bombs, small and large. A red ring marks where each one will land.
- **Summit Sprint** (3.2 km, point to point): switchbacks from the foothills up to the summit lookout.
  On the first leg up the cone a concrete bridge carries the road over a lava spill running down the
  mountain. Boulders roll off the slopes, and bombs fall on the upper half.
- **Eruption** (6.4 km, point to point, the finale): from the plain at the foot of the volcano, along the
  Caldera Loop's flank and over its lava jump, then a hill climb up the cone: three long sweeping legs and
  a run out along Ash Ridge. On the way up the road breaks into slabs that heave up into ramps right in
  front of you, quakes rip cracks across the road just ahead and shove their edges up, one ramp floods with lava behind it, and the sky darkens as
  the volcano wakes. At the top a straight downhill run-in ends in a kicker. Hit it fast and the truck is
  flung about 175 m across the crater through fountains of lava on a real ballistic arc, landing on a
  downslope cut to match it (the player's leap plays in slow motion with its own camera shots); too slow
  and it drops into the lava lake. On the far side lava pours over the rim and chases the pack down the
  descent to the finish on the plain. It runs fast on every difficulty and gives less room for a crash or
  slowdown the harder the setting; heavy rocks lie on the road, and a truck the lava catches is burned out
  (DNF). The HUD shows how far back the lava is.

All around the tracks the world is alive: the lava rivers run visibly down the mountain (fastest down the
middle and where it is steep), smoking and spitting molten gobs; the lava lake and the crater pool bubble and
burst; steam vents hiss on the cone; birds wheel over the plain; and dry grass, shrubs and trees move in the
wind. The ground has erosion gullies down the slopes, grit and loose stones, and the roads have potholes.
Cooled lava crust lines the river banks, its seams still glowing near the flow; obsidian chips glint; scoria
and cinder fields, charred snags and fallen logs dress the cone; embers rise off the lava and ash drifts down.

Volcanic bombs dig craters where they land, sized by the rock and how fast it came down, with a raised rim and
a splash of thrown earth; the floor glows for a while. They stay for the whole race, and a truck bucks over the
rim. A rock skips one to five times after it hits, each hop lower, then rolls to a stop.

The browser and phones cap at 30 fps and default to lighter graphics; the desktop app runs uncapped at high.

**Ultra** is for a powerful graphics card and is never the default. On top of High it renders at 1.5x
resolution or more and scales down, uses finer terrain, more rocks, an 8K shadow map over a wider area,
full-resolution ambient occlusion, height fog that pools in the valleys and glows towards the sun, sun shafts
through the ash, depth of field, heat shimmer near lava, ultra anti-aliasing and more tyre marks, and steps
the physics at 120 Hz instead of 60.

## Driving physics

Six-speed sequential gearbox with an rpm-based torque curve, auto shifts with a short power cut, engine
braking and a rev limiter (gear and rpm on the HUD). Air drag grows with the square of speed. The track
surface grips best; loose ground off it has about 80% of the grip and drags at the tyres. Tyres leave marks
when they slide, spin off the line, lock under hard braking or on the handbrake.

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
- **Truck damage** (all trucks): soft-body dents push the panels in where they are hit, more detailed on
  higher graphics settings. Panels work loose before they go: the bonnet pops and buckles up, doors and
  bumpers hang and flap at speed, then break off (mirrors, bumpers, light bar, spare tyres, doors, bonnet).
  A hard hit on a wheel bends it (the truck pulls to that side), and a harder one tears it off.
  Volcanic bombs and boulders do damage too. Damage costs power and top speed; at 100% the truck is
  totaled, coasts to a stop and is out (DNF), unless it rolls over the finish line first.
- **Boost**: the camera shakes hard in the last 10% of the tank. Running it dry at full boost blows the engine one
  time in five: slow motion, bonnet and pistons out, fire and smoke, and the truck is totaled.

`tools/truck/split.py` cuts the breakable parts out of the baked truck models.

URL options: `?race=caldera|village|summit|eruption`, `&ai=N`, `&laps=N`, `&diff=easy|normal|hard`, `&cam=...`,
`?q=low|medium|high|ultra`, `?sub=N` (physics substeps), `?nofog`, `?noshafts`, `?nodof`, `?noskid`, `?fps=N`, `?auto` (autopilot), `?blow` (force an engine blow), `?at=N&yaw=R&ram=V` (crash test), `?lava=N` (Eruption: start the lava N m behind the truck placed with `at`), `?trace` (log truck progress), `?look=x,y,z,tx,ty,tz` (a fixed camera, for scenery shots), `?craters` (a row of test craters ahead), `?still=N` (render one frame after N simulated steps,
used for headless captures).

## Code

`src/main.js` (app state and loop), `world.js` (terrain, materials, lava), `track.js` (track geometry
queries), `vehicle.js` (truck physics and visuals), `ai.js` (opponent drivers), `race.js` (grid, laps,
respawns, results), `camera.js` (the TV camera checks its line of sight and moves when terrain or a building gets in the way),
`hazards.js` (bombs, boulders, the Caldera lava breakout), `eruption.js` (Eruption's heaves, fissures, crater leap, lava fountains, lava flow and road rocks), `ultra.js` (height fog, sun shafts, depth of field, tyre marks), `damage.js`, `crash.js`, `fx.js` (smoke, fire,
motion blur), `input.js` (keyboard, gamepad, touch, tilt), `ui.js` / `ui.css` (menus,
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
