import * as THREE from 'three';
import { buildTrackRibbon, mulberry } from '../world.js';
import { buildIslandTerrain } from './terrain.js';
import { buildKaieleRoads } from './road.js';
import { buildKaieleSky } from './sky.js';
import { buildOcean } from './ocean.js';
import { buildFreshWater } from './water.js';
import { buildVegetation } from './vegetation.js';
import { buildBeach } from './beach.js';
import { TRACK_EVENTS } from './tracks.js';
export { KaieleHazards } from './hazards.js';

// Builds Kai'ele, the Hawaiian island region: ground, roads, sea, rivers and falls, plants, and each track's set
// pieces. Returns what main.js needs in place of the volcano's terrain, props, village and ambient life:
//   { props: { handles, models, update }, colliders, ambient: { update }, events: { trackId: TrackEvents },
//     wetness(pos, track, i), update(t, dt, camera, race) }
// Every part is a module of its own under src/kaiele/ with the same build(ctx) -> { update } shape.
export async function buildKaiele(ctx) {
  const { scene, world, M, quality, tracks, fog } = ctx;
  ctx.rnd = mulberry(4242);
  // clear tropical air, a warmer sun
  fog.color.setRGB(0.66, 0.76, 0.86);
  fog.density = 0.00016;
  fog.sun = 3.1;
  ctx.sky = await buildKaieleSky(ctx);
  scene.add(await buildIslandTerrain(world, M, quality));
  for (const t of world.data.tracks) scene.add(buildKaieleRoads(world, M, t, quality));
  const parts = [];
  const ocean = buildOcean(ctx);
  parts.push(ocean);
  ctx.loadStep?.(0.36, 'FILLING THE RIVERS…');
  parts.push(buildFreshWater(ctx));
  ctx.loadStep?.(0.4, 'GROWING THE JUNGLE…');
  // the ground mesh is at the bake's own 2 m grid near the tracks, so plants stand on the baked heights
  world.groundAt = world.heightAt;
  const veg = await buildVegetation(ctx);
  parts.push(veg);
  parts.push(buildBeach(ctx));
  const props = { handles: [], models: {}, update() {} };
  const colliders = [...(veg.colliders || [])];
  const events = {};
  for (const [id, load] of Object.entries(TRACK_EVENTS)) {
    if (!tracks.some((t) => t.id === id)) continue;
    const mod = await load();
    const sc = (await mod.buildScenery?.({ ...ctx, track: tracks.find((t) => t.id === id) })) || {};
    parts.push(sc);
    if (sc.handles) props.handles.push(...sc.handles);
    if (sc.colliders) colliders.push(...sc.colliders);
    if (mod.TrackEvents) events[id] = mod.TrackEvents;
  }
  return {
    props, colliders, events,
    ambient: { update() {} },
    ownBridges: new Set(['wailele']),
    wetness: (p, track, i) => ocean.wetness(p, track, i),
    update(t, dt, camera, race) { for (const p of parts) p.update?.(t, dt, camera, race); },
  };
}
