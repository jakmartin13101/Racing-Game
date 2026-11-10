import { Bridge } from '../bridge.js';
import { surfaceAt } from './surfaces.js';

// Race-time systems on Kai'ele, in the shape race.js expects of hazards (pre, post, dispose): the surface under
// each truck (grip and drag by surface, wetted by the surf), and the track's own events from tracks.js.
export class KaieleHazards {
  constructor(opts) {
    Object.assign(this, opts);
    this.events = opts.events;
    this.mod = opts.island.events?.[opts.track.id] ? new opts.island.events[opts.track.id](this) : null;
    if (opts.track.bridge && !opts.island.ownBridges?.has(opts.track.id)) this.bridge = new Bridge({ phys: opts.phys, scene: opts.scene, track: opts.track, world: opts.world, M: opts.M });
  }

  // the lava rounds' chase: how far back the flow is (shown on the HUD)
  get lavaGap() { return this.mod?.lavaGap; }
  // a lava round's darkening sky and reddening fog (0..1)
  get env() { return this.mod?.env; }

  pre(dt, race) {
    for (const st of race.cars) {
      const s = surfaceAt(this.track, st.i);
      const v = st.v;
      // on the road surface take its grip; off it, the race's own loose-ground model applies on top
      const wet = this.island.wetness ? this.island.wetness(v.group.position, this.track, st.i) : 0;
      v.surfGrip = s.grip * (1 - wet * 0.12);
      v.surfDrag = s.drag + wet * 600;
      v.surfName = s.name;
    }
    this.mod?.pre(dt, race);
  }

  post(dt, race) {
    this.mod?.post(dt, race);
    this.bridge?.update(this.fx.time);
  }

  dispose() {
    this.mod?.dispose();
    this.bridge?.dispose(this.phys, this.scene);
  }
}
