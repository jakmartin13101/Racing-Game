import * as THREE from 'three';
import { mulberry } from '../../world.js';
import { burnTruck, clamp } from './util.js';

// The lava chasing the pack down from the rim: a glowing sheet over the road from behind the grid all the way
// to the kicker above the delta, revealed up to an advancing front. It sets off a few seconds after GO, gathers
// pace as it spills over the rim and then runs at the difficulty's share of a clean, quick truck's pace through
// each metre; the player gets no breathing space (too far clear and it closes in), and anyone it reaches is
// burned out. At the coastal road it runs out of road: it pours over the broken edge into the delta and stops.
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

export class ChaseFlow {
  constructor(hz, lavaGroup, { a, b }) {
    this.hz = hz;
    const t = this.t = hz.track, W = t.width;
    this.a = a; this.b = b;
    this.hw = W / 2 + 3.5;
    const NU = 8, verts = [], uvs = [], flow = [], idx = [];
    let rows = 0;
    const step = hz.lite ? 3 : 2;
    for (let i = a; i <= b; i += step) {
      const f = t.frame(i);
      const gap = t.c[t.wrap(i)][4];
      for (let k = 0; k <= NU; k++) {
        const lat = (k / NU * 2 - 1) * this.hw;
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
        // over a gap (the breakouts, the bridge) the flow pours down into the channel: it follows the ground
        let y = hz.world.heightAt(x, z) + 0.42 - (lat / this.hw) ** 2 * 0.2;
        if (!gap && Math.abs(lat) < W / 2 + 1) y = Math.max(y, f.y + 0.3);
        verts.push(x, y, z);
        uvs.push(i - a, lat);
        flow.push(k / NU * 2 - 1, 7);
      }
      rows++;
    }
    for (let j = 0; j < rows - 1; j++) for (let k = 0; k < NU; k++) {
      const p = j * (NU + 1) + k, q = p + 1, c = p + NU + 1, d = c + 1;
      idx.push(p, q, c, q, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.uFront = { value: -50 };
    const mat = lavaGroup.userData.makeMat(true);
    const base = mat.onBeforeCompile, uFront = this.uFront, edge = (this.hw - 2.2).toFixed(2);
    mat.onBeforeCompile = (sh, r) => {
      base(sh, r);
      sh.uniforms.uFront = uFront;
      sh.fragmentShader = sh.fragmentShader.replace('uniform float uTime;', 'uniform float uTime; uniform float uFront;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float eN = texture(tNoise, vW.xz / 13.0).r;
// the front is a lobed, bulging tongue: it leads down the middle of the road and lags at the verges
float lobe = (eN - 0.5) * 9.0 - pow(abs(vT.y) / ${this.hw.toFixed(2)}, 2.0) * 5.0;
if (vT.x > uFront + lobe) discard;
if (abs(vT.y) > ${edge} + eN * 2.2) discard;`)
        .replace('totalEmissiveRadiance += lavaEm;', `totalEmissiveRadiance += lavaEm;
float behind = uFront + lobe - vT.x;
float fresh = 1.0 - smoothstep(0.0, 40.0, behind);
float warm = 1.0 - smoothstep(0.0, 500.0, behind);
float vein = smoothstep(0.35, 0.75, texture(tNoise, vW.xz / 6.0 + vec2(uTime * 0.02, 0.0)).g);
// the very toe: an incandescent rolling lip, then a skin that dulls to red-black crust over the next few hundred metres
float toe = 1.0 - smoothstep(0.0, 3.0, behind);
totalEmissiveRadiance += vec3(1.0, 0.26, 0.04) * (0.3 + 0.9 * warm) * (0.5 + vein) + vec3(2.4, 0.8, 0.14) * fresh * (0.7 + 0.3 * eN) + vec3(3.0, 1.4, 0.4) * toe;`);
    };
    mat.customProgramCacheKey = () => 'ahi-chase-flow';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
    hz.group.add(this.mesh);
    this.light = new THREE.PointLight(0xff5a1a, 0, 90, 1.8);
    hz.group.add(this.light);
    // pace: how fast a truck can take each metre, from the bends and the braking into them
    const n = t.n, vp = new Float32Array(n);
    for (let i = 0; i < n; i++) vp[i] = Math.min(44, Math.sqrt(9 / Math.max(Math.abs(t.curv[i]), 1e-4)));
    for (let i = n - 2; i >= 0; i--) vp[i] = Math.min(vp[i], Math.sqrt(vp[i + 1] ** 2 + 12));
    for (let i = 1; i < n; i++) vp[i] = Math.min(vp[i], Math.sqrt(vp[i - 1] ** 2 + 7));
    this.pace = vp;
    this.state = 'wait';
    this.front = a - 30;
    this.gapToPlayer = null;
    this.rnd = mulberry(7);
    this.log = [];
  }

  // hold the flow off the slow parts of the course a little (the breakout jumps and the bridge, where trucks must
  // slow or line up): the caller lists [row, factor] spans
  slowSpans(spans) { for (const [i0, i1, k] of spans) for (let i = Math.max(0, i0); i <= Math.min(this.t.n - 1, i1); i++) this.pace[i] *= k; }

  pre(dt, race, time) {
    const pl = race.player, t = this.t;
    if (this.state === 'wait') {
      // the rim gives way behind the grid a few seconds after GO
      if (race.clock > 0) { this.state = 'delay'; this.T = 0; }
      return;
    }
    if (this.state === 'delay') {
      this.T += dt;
      if (this.T > 6 + (race.diff.grace ?? 9) * 0.6) {
        this.state = 'run'; this.runT = 0; this.mesh.visible = true;
        // it breaks over the rim well behind the back of the grid
        this.front = Math.min(this.a, Math.min(...race.cars.map((c) => c.i)) - 60);
        this.hz.events.push({ type: 'flow' });
        this.log.push(`start t${race.t.toFixed(0)}`);
      }
      return;
    }
    if (this.state === 'done') { this.glow(time); return; }
    const i = Math.min(this.b, Math.max(this.a, Math.floor(this.front)));
    this.runT += dt;
    const D = race.diff;
    // (a long race with a lot of downhill braking: it runs well under the trucks' pace through each metre, so it
    // is losing a truck that loses time, a stop or a crash, that it catches)
    let v = clamp(this.pace[i] * (D.lava ?? 0.86) * 0.82, 7, 29) * Math.min(1, 0.35 + this.runT / 6);
    // the player gets no breathing space: more than the difficulty's slack clear and the flow speeds up to close
    // in, unless an opponent still racing is within reach ahead of it (a stopped or wrecked one is fair game)
    const alive = !pl.finished && !pl.leap && !pl.leapt;
    const gap = pl.i - this.front, slack = (D.slack ?? 105) * 1.15;
    const chasing = race.cars.some((c) => !c.finished && c !== pl && c.v.speed() > 4 && c.i - this.front > 0 && c.i - this.front < 220);
    if (alive && gap > slack && !chasing) v *= 1 + Math.min(0.5, (gap - slack) / 140);
    this.v = v;
    this.front = Math.min(this.b, this.front + v * dt);
    if (Math.floor(this.runT / 20) !== Math.floor((this.runT - dt) / 20)) this.log.push(`f${Math.round(this.front)}@${race.t.toFixed(0)}`);
    this.uFront.value = this.front - this.a;
    this.gapToPlayer = alive && !pl.dnf ? Math.max(0, gap) : null;
    if (this.front >= this.b) { this.state = 'done'; this.gapToPlayer = null; this.log.push(`sea t${race.t.toFixed(0)}`); }
    this.glow(time);
    // smoke and spatter rolling off the front
    const f = t.frame(Math.min(this.b, Math.floor(this.front)));
    const fx = this.hz.fx;
    for (let k = 0; k < 2; k++) {
      const lat = (this.rnd() - 0.5) * 2 * this.hw * 0.8;
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat, y = Math.max(this.hz.world.heightAt(x, z), f.y) + 0.8;
      const c = 0.07 + this.rnd() * 0.06;
      fx.smoke.emit(tmp.set(x, y, z), tmp2.set(f.tx * v * 0.3, 2 + this.rnd() * 2, f.tz * v * 0.3), 1.8 + this.rnd() * 1.5, time, 4, c, c * 0.92, c * 0.88);
      if (this.rnd() < 0.35) fx.fire.emit(tmp.set(x, y, z), tmp2.set(f.tx * v * 0.5, 1, f.tz * v * 0.5), 1 + this.rnd(), time, 0.5);
    }
  }

  glow(time) {
    const f = this.t.frame(Math.min(this.b, Math.floor(this.front)));
    this.light.position.set(f.x, f.y + 5, f.z);
    this.light.intensity = (this.state === 'done' ? 160 : 300) * (0.85 + 0.15 * Math.sin(time * 4));
  }

  post(dt, race, time) {
    if (this.state !== 'run' && this.state !== 'done') return;
    for (const st of race.cars) {
      if (st.finished || st.burned || st.leap || st.leapt) continue;
      if (st.i < this.a + 2 || this.front - st.i < 1.5) continue;
      burnTruck(this.hz, st, race, time, this.log);
    }
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
