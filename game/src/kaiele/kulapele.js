import * as THREE from 'three';
import { cumulative, disposeTree } from './kulapele/util.js';
import { buildSurfaces, surfaceTextures } from './kulapele/surfaces.js';
import { Tube } from './kulapele/tube.js';
import { Crossings } from './kulapele/crossings.js';
import { Heaves } from './kulapele/heave.js';
import { Vents } from './kulapele/vents.js';
import { Rubble } from './kulapele/rubble.js';
import { Station } from './kulapele/station.js';

// Kula Pele, round 4 of the Hawaiian series: a loop across a fresh lava plain on the volcano's lower flank, where
// the ground itself is the enemy. Every set piece reads its rows from the track data (sections, crossings, slabs,
// vents, tube, station), so a re-bake moves them with the road.
//  - the ranger station at the line: hut, lookout, fence, the closed-road sign and flashing lights
//  - the old highway: cracked, patched asphalt half buried by an old flow; from lap 2 slabs of it heave up into
//    ramps and pressure ridges, and stay up
//  - three live lava streams across the road: a basalt rock-ramp jump, the road crew's steel bridge, a crust-ridge
//    jump; a truck that falls into the lava is burned out
//  - the lava tube: a dark tunnel with glowing cracks in its walls and light shafts from collapsed skylights
//  - the steam vent flats: vents puffing steam across the road, ʻaʻā rubble off the line that bites
export class KulaPele {
  constructor(hz, lava) {
    this.hz = hz;
    this.lava = lava;
    this.t = hz.track;
    this.world = hz.world;
    this.lite = hz.lite;
    this.group = new THREE.Group();
    this.group.name = 'kulapele';
    hz.group.add(this.group);
    this.S = cumulative(this.t);
    this.tex = surfaceTextures();
    this.glow = { value: 1 };
    this.parts = [];
    this.log = [];
    this.lavaGroup = lava;
    // the tube first: the road surfaces inside it take its baked darkness
    const opt = (name, make) => {
      try { return this.add(make()); } catch (e) { console.error(`Kula Pele: ${name} failed`, e); return null; }
    };
    if (this.t.tube || this.t.sections?.tube) this.tube = opt('tube', () => new Tube(this));
    this.surfaces = buildSurfaces(hz, this);
    this.crossings = opt('crossings', () => new Crossings(this));
    this.heaves = opt('heaves', () => new Heaves(this));
    this.vents = opt('vents', () => new Vents(this));
    this.rubble = opt('rubble', () => new Rubble(this));
    this.station = opt('station', () => new Station(this));
  }

  add(part) { if (part) this.parts.push(part); return part; }

  pre(dt, race, time) {
    this.tex.time.value = time;
    // the glowing seams breathe
    this.glow.value = 0.85 + 0.15 * Math.sin(time * 1.3) * Math.sin(time * 0.37 + 1);
    for (const p of this.parts) p.pre?.(dt, race, time);
  }

  post(dt, race, time) {
    for (const p of this.parts) p.post?.(dt, race, time);
  }

  debug() { return { log: this.log.slice(-40), parts: this.parts.map((p) => p.debug?.()).filter(Boolean) }; }

  dispose() {
    for (const p of this.parts) p.dispose?.();
    this.hz.group.remove(this.group);
    disposeTree(this.group);
    this.tex.crA.dispose(); this.tex.crB.dispose(); this.tex.glowCr.dispose();
  }
}
