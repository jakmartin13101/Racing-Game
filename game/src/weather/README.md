# Weather and time of day

Every race runs under one weather and one time of day. Quick Race lets the player pick each (or Random);
the World Race (the campaign) rolls both at random for every event. Restarting a race keeps its conditions.

| Weather | Grip | What you see |
| --- | --- | --- |
| Sunny | 100% | clear sky (the midday HDRI by day), light breeze |
| Overcast | 99% | grey cloud deck, soft shadows, damp sheen |
| Light rain | 88% | drizzle, wet glossy road, a few puddles, drops on the lens |
| Rain | 80% | steady rain, splashes, rippling puddles, spray from the trucks, lower visibility |
| Heavy rain | 72% | downpour, deep puddles, far less visibility, the odd distant flash |
| Thunderstorm | 70% | heavy rain, black cloud, forked lightning that lights the whole scene and shakes the camera with thunder, crosswind gusts that shove the trucks |
| Fog | 95% | visibility down to about 150 m, headlights on |
| Snow | 62% | falling snow, snow lying on everything that faces up, white spray |
| Blizzard | 55% | driving snow, near whiteout, gusts |

Times of day: Morning (low warm sun), Midday, Evening (sunset), Night (moon, stars, headlights).

Gameplay: the grip figure scales the tyres' friction on the track. Off the track rain turns the ground to mud and
snow lies deep (up to 16% less again). Standing water costs another 30% of grip and drags at the tyres. AI drivers
take corners slower and brake earlier with the grip. Lights come on at night, in the evening and in murky weather;
the player's truck throws real light down the road.

## Which weather a track can have

A track's climate decides what can come up, and how often (`conditions.js`). **Snow and blizzards only happen in
the `alpine` and `arctic` climates**; nothing on the volcano or in the islands ever snows.

| Climate | Weathers | Used by |
| --- | --- | --- |
| `volcanic` | sunny, overcast, light rain, rain, heavy rain, storm, fog | the volcano tracks (the default) |
| `tropical` | the same, showery, with more storms | Hawaiian-style tracks |
| `temperate` | the same, greyer | forests, bayous |
| `desert` | mostly sunny, rare showers and storms | canyons, mesas |
| `alpine` | adds snow and blizzards | mountains |
| `arctic` | mostly snow and blizzards | ice fields |

A new track sets it in its data, either directly or through its region:

```js
{ id: 'kaimana', name: 'Kaimana Coast', climate: 'tropical', ... }
{ id: 'whiteout', name: 'Whiteout Pass', region: 'alpine', ... }   // REGION_CLIMATE maps region -> climate
```

A track with neither is treated as `volcanic`.

## Using it from a track or a region

`main.js` owns one `Weather` for the whole game and calls it every frame and every physics step, so a new track
gets rain, snow, lightning, fog, lights and grip without doing anything. What a track or region can do:

```js
import { weathersFor, timesFor, resolveConditions, WEATHERS, TIMES } from './weather/index.js';

weather.set({ weather: 'storm', time: 'night' }, track); // or 'random' for either; returns the resolved pair
weather.cond                  // { weather, time } now
weather.W, weather.T          // the active presets (WEATHERS[...] and the time-of-day look)
weather.grip                  // grip on the track surface now, 1 = dry
weather.gripAt(x, z, loose)   // grip at a point, with puddles and mud
weather.puddleAt(x, z)        // 0..1 standing water
weather.adopt(object3d, kind) // make new scenery take the rain and snow (see below)
weather.on('lightning', (e) => {})  // { x, y, z, dist }: a strike, e.g. for a tree to catch fire
weather.on('thunder', (e) => {})    // { k }: the rumble arriving, 0..1 strength
weather.on('change', (e) => {})     // { cond }: new conditions were set
weather.fogColor, weather.fogDensity, weather.sunIntensity, weather.lampLevel
```

### Wet and snowy scenery

Every `MeshStandardMaterial` / `MeshPhysicalMaterial` in the scene is adopted when the world loads and again at the
start of each race, so scenery built at load time just works. Something added later (a new region loaded on the
fly) should call `weather.adopt(root)`. The kind decides how a surface takes the weather; set it with
`material.userData.wx` before it is adopted:

| `userData.wx` | Effect |
| --- | --- |
| `'ground'` | terrain: soaks dark, puddles with rain ripples, full snow cover |
| `'road'` | track surface: the same, but the snow stays packed to slush where the trucks run |
| `'object'` (default) | rocks, buildings, props: wet sheen, snow on top faces |
| `'foliage'` | grass, palms, shrubs: darker when wet, snow on top |
| `'vehicle'` | trucks, boats, jet skis: wet paint, a dusting of snow |
| `false` | left alone: lava, water surfaces, glowing things |

`roadMaterial()` and `buildTerrain()` in `world.js` already tag themselves. A sea or lake surface should be
`userData.wx = false` (it is already water); rain still falls and splashes on it.

Puddles are a world-space noise field that is identical in the shader (`surface.js`) and in `puddleAt()`, so the
water a player sees is the water the tyres feel.

### Files

- `conditions.js`: the weather and time presets, climates, the random pick
- `index.js`: the `Weather` class: lighting, fog, sky set-up, gusts, grip, wiring of the parts below
- `sky.js`: the sky dome (atmosphere, clouds, sun, moon, stars, lightning glow) and its environment map
- `surface.js`: the wet / puddle / snow shader added to adopted materials, and the shared puddle field
- `precip.js`: rain streaks, snowflakes, splashes
- `lightning.js`: bolts, flicker and thunder timing
- `lens.js`: drops and streaks on the camera lens (a post-processing effect)
- `lights.js`: headlights, light bar, tail and brake lights, and the player's spotlights

Testing from the URL: `?race=caldera&weather=storm&time=night`; `&anywx` ignores the track's climate (snow on the
volcano, for screenshots). On the title screen `?weather=fog&time=evening` sets the backdrop.
