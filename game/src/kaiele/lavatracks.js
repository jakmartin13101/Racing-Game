// Kai'ele's two lava tracks: Kula Pele and Ahi i ke Kai. Each module builds its hazards and set pieces for one race
// on the shared Hazards object (hz) and is stepped with it: pre(dt, race, time) before the physics step,
// post(dt, race, time) after it, dispose() when the race ends. Optional getters: env (0..1, darkens the sky and
// reddens the fog) and lavaGap (metres between the player and a chasing lava front, for the HUD).
import { KulaPele } from './kulapele.js';
import { AhiIKeKai } from './ahikekai.js';

const BY_ID = { kulapele: KulaPele, ahikekai: AhiIKeKai };

export function lavaTrackHazards(hz, lava) {
  const C = BY_ID[hz.track.id];
  return C ? new C(hz, lava) : null;
}
