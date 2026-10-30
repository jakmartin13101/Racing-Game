// Per-track gameplay for Kai'ele: each id maps to a loader for its module. A module exports
//   class TrackEvents { constructor(hz) {} pre(dt, race) {} post(dt, race) {} dispose() {} }
// hz is the KaieleHazards instance (phys, scene, world, track, fx, M, lava, island, quality, events, breakables).
// The lava rounds register kulapele and ahikekai here.
export const TRACK_EVENTS = {
  kahakai: () => import('./kahakai.js'),
  wailele: () => import('./wailele.js'),
  palikai: () => import('./palikai.js'),
};
