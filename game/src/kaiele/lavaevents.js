import { Hazards } from '../hazards.js';
import { buildLava } from '../world.js';

// Kula Pele and Ahi i ke Kai on Kai'ele. Their race-time action (lava crossings, the breaking highway, quakes,
// breakouts, the chasing flow, the ocean leap) runs on the volcano's Hazards, which hands these two ids to
// lavatracks.js; this wraps it in the TrackEvents shape tracks.js expects. buildScenery lays the lava field round
// both tracks (crust, rubble, vents, skylights, the ocean entry), once for the island.
export class TrackEvents {
  constructor(hz) {
    this.h = new Hazards({ phys: hz.phys, scene: hz.scene, world: hz.world, track: hz.track, fx: hz.fx, M: hz.M,
      lava: hz.lava, quality: hz.quality, events: hz.events });
  }

  get lavaGap() { return this.h.lavaGap; }
  get env() { return this.h.env; }
  pre(dt, race) {
    // an AI truck that has sat still for a while (off a bench edge, hung on a heaved slab or a bridge rail) is put
    // back on the road before the lava reaches it
    for (const st of race.cars) {
      if (!st.ai || st.isPlayer || st.finished || st.dnf || st.leap || race.clock < 3 || st.v.speed() > 1.5) { st.stillT = 0; continue; }
      st.stillT = (st.stillT || 0) + dt;
      if (st.stillT > 6) { st.stillT = 0; st.respawn = true; }
    }
    this.h.pre(dt, race);
  }
  post(dt, race) { this.h.post(dt, race); }
  dispose() { this.h.dispose(); }
}

let field = null;
export async function buildScenery(ctx) {
  if (field) return {};
  // main.js builds the river mesh after the island; a second, unshown copy lends its materials to the vents and
  // skylights, its clock kept in step here
  const lava = buildLava(ctx.world, ctx.M);
  field = (await import('./lavafield.js')).buildLavaField({ ...ctx, lava });
  const f = await field;
  return {
    update(t, dt, camera) {
      lava.userData.uniforms.uTime.value = t;
      f.update(t, dt, camera.position);
    },
  };
}
