# Gravel Riot concept art

Visual target for a 3D, MotorStorm-style off-road festival racer (PC + mobile). "Gravel Riot" is a working title.

## Gameplay snapshots (current)

20 in-engine style captures rendered as lit 3D scenes in Blender Cycles at 1920×1080.

- `board.html` – interactive board (open in a browser; toggle the HUD on or off).
- `gameplay/` – the 20 snapshots with the race HUD.
- `gameplay/clean/` – the same frames without the HUD.
- `3d/` – the procedural scene generator that produced them.

| # | Shot | Environment | Vehicles |
|---|---|---|---|
| 01 | Mesa Run | Canyon, day | Buggy, trophy truck |
| 02 | Monsoon Mud | Mud valley, storm | Mud plugger, trophy truck |
| 03 | Caldera Night | Volcano, night | Buggy |
| 04 | Whiteout Pass | Arctic, day | Rally car, rally-raid truck |
| 05 | Mesa Hauler | Canyon, dusk | Big rig |
| 06 | Dune Jump | Dunes, golden hour | Sand rail |
| 07 | Tideline | Coast, day | Rally car |
| 08 | Saltpan Sprint | Salt flats, midday | Trophy truck, rally car |
| 09 | Shatterpoint | Ruined city, dusk | Monster truck |
| 10 | Bayou Fog | Swamp, overcast | Mud plugger |
| 11 | Timberline | Alpine forest, day | Rally car |
| 12 | Quarry Pack | Quarry, day | Trophy truck, buggy, rally car |
| 13 | Festival Grid | Desert festival, sunset | Full mixed field |
| 14 | Rustwater | Oilfield, sunset | Trophy truck, mud plugger |
| 15 | Ash Hauler | Volcano, ash fall | Racing rig |
| 16 | Aurora Run | Arctic, night | Trophy truck |
| 17 | Canopy Trail | Jungle, dawn | Buggy |
| 18 | Canyon Leap | Canyon, day | Rally car |
| 19 | Mud Brawl | Mud valley, overcast | Monster truck, mud plugger |
| 20 | Highland Gale | Highland, day | Buggy, rally car |

### Re-rendering

```
pip install bpy pillow numpy          # bpy 5.2, Python 3.13
cd concept-art/3d
python render_shots.py ../raw 01,02,03 1920 28   # shot ids, width, samples
python hud.py ../raw ../gameplay                  # grade + HUD
python hud.py ../raw ../gameplay/clean --clean    # grade only
```

Shot setups (track shape, sky, sun, fog, scenery, vehicles, camera, HUD values) live in `3d/shots.py`.

## First pass (2D)

`2d/` holds the earlier 50-frame 2D concept board.
