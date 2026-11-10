import * as THREE from 'three';
import { ChaseFlow } from './ahikekai/flow.js';
import { SlabCrossing, SagBridge } from './ahikekai/breakouts.js';
import { Switchbacks } from './ahikekai/quakes.js';
import { Forest } from './ahikekai/forest.js';
import { Delta, FinishArch } from './ahikekai/delta.js';
import { Rim } from './ahikekai/rim.js';
import { burnTruck, clamp } from './ahikekai/util.js';
import './ahikekai/trees.js';

// Ahi i ke Kai, "fire to the sea": the Hawaiian finale, 6.6 km downhill from the summit crater to the coast,
// racing an active lava flow to the ocean. In driving order:
//   rim          the grid on the summit rim beside the lava lake, in steam and ash; volcanic bombs on the way off it
//   descent      long fast sweepers beside the lava river (the river is the world's); the flow chasing from the rim
//   breakouts    lava across the road twice: a heaved slab of road to jump the spill from, and a narrow old
//                bridge over the other, sagging in the heat; both spills creep wider through the race
//   switchbacks  quakes break the road into slabs ahead of the player, fissures rip across it
//   forest       the lava has reached the lowland forest: trees burn, smoke and embers cross the road, burning
//                trees come down across it
//   delta        the coastal road's end kicks every truck over the new lava delta through the steam to the beach;
//                short of the arc is into the lava
//   beach        a sandy run to the finish arch
// Every row and place comes from the track data (sections, crossings, slabs, falls, lip/land/leap), never
// hard-coded: the bake decides where things are.
export class AhiIKeKai {
  constructor(hz, lava) {
    this.hz = hz;
    const t = this.t = hz.track;
    const S = this.S = t.sections || {};
    const uTime = this.uTime = lava.userData.uniforms.uTime;
    t.obstacles = [];
    this.log = [];
    const sec = (k, d) => S[k] || d;
    this.rim = new Rim(hz, sec('rim', [0, 600]));
    // the flow chases from behind the grid to the end of the coastal road, where it pours into the delta
    this.flow = new ChaseFlow(hz, lava, { a: 0, b: (t.lip ?? t.n - 200) - 1 });
    this.crossings = (t.crossings || []).map((c) => (c.kind === 'slab' ? new SlabCrossing(hz, lava, c) : c.kind === 'bridge' ? new SagBridge(hz, lava, c, uTime) : null)).filter(Boolean);
    // the flow eases off over the crossings, where every truck has to slow or line up
    this.flow.slowSpans(this.crossings.map((c) => (c instanceof SagBridge ? [c.a - 120, c.b + 20, 0.85] : [c.c.at - 60, c.g1 + 20, 0.92])));
    this.quakes = new Switchbacks(hz, t.slabs || [], sec('switchbacks', [0, 0]));
    this.forest = S.forest ? new Forest(hz, S.forest, t.falls || [], uTime) : null;
    this.delta = t.lip != null ? new Delta(hz, lava, uTime) : null;
    this.arch = !t.closed ? new FinishArch(hz) : null;
    this.envK = 0.4;
    // volcanic bombs off the summit on the rim and the top of the descent (hazards.js reads this object live)
    this.bombCfg = { gap: [3.2, 5.5], big: 0.15, from: 0 };
    this.bombsTo = S.descent ? S.descent[0] + (S.descent[1] - S.descent[0]) * 0.35 : t.n * 0.2;
    if (typeof window !== 'undefined') window.__ahi = () => this.debug(); // state for headless test runs
  }

  get lavaGap() { return this.flow.gapToPlayer; }
  get env() { return this.envK; }

  // which section a row is in
  section(i) {
    for (const [k, [a, b]] of Object.entries(this.S)) if (i >= a && i < b) return k;
    return 'beach';
  }

  pre(dt, race, time) {
    const pl = race.player, t = this.t;
    // bombs only while the player is up on the mountain
    const up = pl.i < this.bombsTo && !pl.finished;
    this.bombCfg.gap[0] = up ? 3.2 : 1e9; this.bombCfg.gap[1] = up ? 5.5 : 1e9;
    if (!up && this.hz.bombT > 30) this.hz.bombT = 30;
    // the sky: ash and steam on the rim, clearer down the flank, the forest fire's smoke, steam at the sea
    const sk = this.section(pl.i);
    const goal = { rim: 0.55, descent: 0.32, breakouts: 0.42, switchbacks: 0.3, forest: 0.7, delta: 0.5, beach: 0.12 }[sk] ?? 0.3;
    this.envK += (goal - this.envK) * Math.min(1, dt * 0.4);
    this.flow.pre(dt, race, time);
    this.quakes.pre(dt, race, time);
    this.forest?.pre(dt, race, time);
    this.delta?.pre(dt, race, time);
  }

  post(dt, race, time) {
    const t = this.t, pl = race.player;
    this.rim.update(dt, race, time);
    for (const c of this.crossings) {
      const near = Math.abs(pl.i - (c.a ?? c.g0)) < 350;
      c.update(dt, race, time, near);
    }
    this.quakes.post(dt, race, time);
    this.forest?.post(dt, race, time);
    this.delta?.post(dt, race, time);
    this.arch?.update(dt, race, time);
    this.flow.post(dt, race, time);
    // anything that drops into a gap (the breakout spills, off the bridge, off the kicker without flying) is lost
    // to the lava. The leap handles its own trucks.
    for (const st of race.cars) {
      if (st.burned || st.leap || (st.finished && !st.v.totaled)) continue;
      const c = t.c[t.wrap(st.i)];
      if (!c[4]) continue;
      const p = st.v.body.translation(), v = st.v.body.linvel();
      if (p.y < c[1] - 3.2 && v.y < 0.5) burnTruck(this.hz, st, race, time, this.log);
    }
  }

  debug() {
    const t = this.t;
    return { flow: `${this.flow.state} ${Math.round(this.flow.front)} v${(this.flow.v || 0).toFixed(0)}`, flowLog: this.flow.log.join(' '), leapt: this.delta?.leapt, leapLog: this.delta?.log.join(' '),
      burned: this.log.join(' '), quakes: this.quakes.state, falls: this.forest?.state, built: this.forest?.built,
      bridgeSag: this.crossings.find((c) => c instanceof SagBridge)?.sag.toFixed(2), obstacles: (t.obstacles || []).map((o) => `${o.i}:${o.lat.toFixed(1)}`).join(','),
      jumps: t.jumps.map((j) => j.at).join(','), env: this.envK.toFixed(2), gap: this.lavaGap };
  }

  dispose() {
    this.rim.dispose();
    this.flow.dispose();
    for (const c of this.crossings) c.dispose();
    this.quakes.dispose();
    this.forest?.dispose();
    this.delta?.dispose();
    this.arch?.dispose();
    this.t.obstacles = [];
    if (typeof window !== 'undefined' && window.__ahi) delete window.__ahi;
  }
}
