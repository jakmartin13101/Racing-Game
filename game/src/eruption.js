import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { roadCrack } from './quake.js';
import { mulberry } from './world.js';

// Eruption, the World Race finale, a hill climb. The climb: the ground heaves up into ramps and fissures crack
// open across the road right in front of the player, quakes shake the pack and a lava breakout floods one of the
// long legs. The top: the volcano erupts, and the in-run down the Ash Ridge throws every truck off the kicker in the
// rim notch on a real ballistic arc across the crater, through fountains of lava, onto a landing hill built for
// that arc. Too slow off the kicker and the arc falls short, into the lake. The descent: lava pours over the rim
// behind the pack and chases it down, past heavy rocks lying on the road; anyone it catches is burned out.
const GRAV = 9.81;
const G_ROCK = (0x0008 << 16) | 0x0003; // hits the ground and trucks
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0), FWD = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;

export class Eruption {
  constructor(hz, lavaGroup, makeHeave) {
    this.hz = hz;
    const t = this.t = hz.track;
    this.rnd = mulberry(4242);
    this.lip = t.lip; this.land = t.land; this.seg = t.segs;
    // the design jump the landing hill was shaped for: launch speed (m/s), kicker angle (deg), touchdown row
    this.jump = t.leap || { v: 34, angle: 12, td: this.land + 10 };
    this.td = this.jump.td;
    this.crater = hz.world.data.crater || { x: 0, z: 0, r: 88, y: hz.world.heightAt(0, 0) + 6 };
    this.env = 0;
    this.quakeT = 6;
    this.fissures = [];
    // ground that heaves up into ramps on the climb, one on each long leg; the second floods with lava behind its
    // ramp. Each goes off when the player is about two seconds short of it, so it happens fast and on screen.
    const up0 = this.seg.up, upN = this.lip - up0;
    const spots = [[260, 470, false], [up0 + upN * 0.14, up0 + upN * 0.3, false], [up0 + upN * 0.38, up0 + upN * 0.52, true],
      [up0 + upN * 0.6, up0 + upN * 0.72, false]];
    this.heaves = spots.map(([a, b, lava]) => {
      const i0 = this.straight(Math.round(a), Math.round(b));
      return makeHeave({ i0, lava, spread: 4, event: lava ? 'breakout' : 'heave', rise: 0.75, flood: 1.6,
        trigger: (race) => {
          const pl = race.player, d = i0 - pl.i;
          if (!pl.finished && d > 0 && d < 22 + pl.v.speed() * 2.1) return true;
          // with the player far behind, the leaders set it off themselves (out of sight anyway)
          return pl.i < i0 - 400 && race.cars.some((c) => !c.isPlayer && !c.finished && i0 - c.i > 0 && i0 - c.i < 70);
        } });
    });
    this.fountains = new Fountains(hz, this.crater, hz.lite);
    // the crater glows from below
    this.glow = new THREE.PointLight(0xff6420, 0, 520, 2);
    this.glow.position.set(this.crater.x, this.crater.y + 18, this.crater.z);
    hz.group.add(this.glow);
    this.flow = new LavaFlow(this, lavaGroup);
    this.rocks = new RoadRocks(this);
  }

  // the row in [a, b] with the straightest road for 130 m before it and 30 m after: room to line up a ramp
  straight(a, b) {
    const t = this.t;
    let best = a, bs = Infinity;
    for (let i = a; i <= b; i += 2) {
      let s = 0;
      for (let j = i - 130; j <= i + 30; j += 2) s = Math.max(s, Math.abs(t.curv[t.wrap(j)]));
      if (s < bs) { bs = s; best = i; }
    }
    return best;
  }

  pre(dt, race, time) {
    const t = this.t, hz = this.hz, pl = race.player;
    for (const h of this.heaves) h.pre(dt, race, time);
    // the sky darkens and the ash thickens as the pack climbs; the eruption itself turns it red
    const climb = clamp((pl.i - this.seg.loopA) / (this.lip - this.seg.loopA), 0, 1);
    const goal = this.erupting ? 1 : climb * 0.6;
    this.env += (goal - this.env) * Math.min(1, dt * 0.5);
    hz.env = this.env;
    if (!this.erupting && race.cars.some((c) => !c.finished && c.i > this.lip - 480 && c.i < this.lip)) {
      this.erupting = true;
      hz.events.push({ type: 'erupt' });
    }
    this.glow.intensity = (this.erupting ? 30000 : 12000) * (0.85 + 0.15 * Math.sin(time * 2.3) * Math.sin(time * 0.7));
    // quakes on the climb, ripping fissures open across the road just ahead of the player, in plain view
    if (race.clock > 2 && pl.i < this.lip - 60 && !pl.finished) {
      this.quakeT -= dt;
      if (this.quakeT <= 0) {
        this.quakeT = 4.5 + this.rnd() * 3 - this.env * 2;
        hz.events.push({ type: 'quake', k: 0.16 + this.env * 0.3 });
        const i = pl.i + Math.round(18 + pl.v.speed() * (0.9 + this.rnd() * 0.6));
        if (i < this.lip - 60 && !t.c[t.wrap(i)][4] && this.heaves.every((h) => Math.abs(h.i0 - i) > 30)) this.fissure(i, time);
      }
    }
    // trucks reaching the lip are flung across the crater
    for (const st of race.cars) {
      if (!st.leap && !st.leapt && st.i >= this.lip - 3 && st.i <= this.lip + 8 && st.v.speed() > 7 && !st.v.totaled) this.launch(st, race, time);
    }
    this.flow.pre(dt, race, time);
  }

  // off the kicker. A truck at (or near) the design speed flies the design arc: the kicker angle, gravity, and
  // a touchdown tangent to the landing hill. Well short of it and it flies its own, shorter arc into the lake.
  launch(st, race, time) {
    const t = this.t, b = st.v.body, p = b.translation(), J = this.jump;
    const f0 = t.frame(this.lip);
    const lat = clamp((p.x - f0.x) * f0.nx + (p.z - f0.z) * f0.nz, -4, 4);
    const from = new THREE.Vector3(p.x, p.y, p.z);
    const ang = THREE.MathUtils.degToRad(J.angle);
    const speed = st.v.speed();
    const short = speed < J.v * 0.62;
    let to, T, vx, vz, vy;
    if (short) {
      // its own speed, along the kicker
      const vh = speed * Math.cos(ang);
      vy = speed * Math.sin(ang);
      vx = f0.tx * vh; vz = f0.tz * vh;
      // where that arc meets the lava lake
      const dy = from.y - this.crater.y;
      T = (vy + Math.sqrt(vy * vy + 2 * GRAV * dy)) / GRAV;
      to = new THREE.Vector3(from.x + vx * T, this.crater.y, from.z + vz * T);
    } else {
      const fl = t.frame(this.td);
      to = new THREE.Vector3(fl.x + fl.nx * lat, t.at(this.td)[1] + 1.25, fl.z + fl.nz * lat);
      const D = Math.hypot(to.x - from.x, to.z - from.z), vh = J.v * Math.cos(ang);
      T = D / vh;
      vy = (to.y - from.y) / T + 0.5 * GRAV * T;
      vx = (to.x - from.x) / T; vz = (to.z - from.z) / T;
    }
    b.setLinvel({ x: vx, y: vy, z: vz }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    st.leap = { t: 0, T, from, to, short, yaw: Math.atan2(vx, vz), apex: from.y + vy * vy / (2 * GRAV) };
    st.v.ghost = true;
    this.hz.events.push({ type: 'leap', st, leap: st.leap });
    this.hz.fx.burst(from.clone().setY(from.y - 0.5), time, 1.4);
    this.fountains.surge(st.leap, st.isPlayer);
  }

  fissure(i, time) {
    const t = this.t, hz = this.hz, W = t.width + 4;
    const f = t.frame(i);
    const L = 2.6 + this.rnd() * 1.6, skew = (this.rnd() - 0.5) * 0.6;
    // a crack rips across the road, its edges shoved up into low ridges of road
    const meshes = roadCrack(hz.M, hz.world, t, f, W, L, skew, this.rnd, hz.group);
    this.fissures.push({ meshes, f, W, L, age: 0 });
    if (this.fissures.length > 10) { const o = this.fissures.shift(); for (const m of o.meshes) { hz.group.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); } }
    // the crack bursts open
    for (let k = 0; k < 14; k++) {
      const lat = (this.rnd() - 0.5) * W;
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      const y = hz.world.heightAt(x, z) + 0.3;
      const c = 0.36 + this.rnd() * 0.1;
      hz.fx.smoke.emit(new THREE.Vector3(x, y, z), tmp.set(this.rnd() - 0.5, 2 + this.rnd() * 3, this.rnd() - 0.5), 1.4, time, 3.5, c, c * 0.9, c * 0.8);
      hz.chips.throw(new THREE.Vector3(x, y, z), tmp.set((this.rnd() - 0.5) * 3, 3 + this.rnd() * 5, (this.rnd() - 0.5) * 3), 0.08 + this.rnd() * 0.18);
    }
  }

  post(dt, race, time) {
    const hz = this.hz;
    for (const h of this.heaves) h.post(dt, race, time);
    // flight across the crater: gravity does the work, the arc is only held to its line against the small
    // errors of the fixed step. The nose follows the flight path, as a truck's does off a big kicker, so it comes
    // down nose first along the landing hill.
    for (const st of race.cars) {
      const L = st.leap;
      if (st.landT > 0) {
        st.landT -= dt;
        if (st.landT <= 0) st.v.ghost = false;
        // the long-travel suspension soaks up the touchdown: no pitching over or barrel-rolling off the hill
        else if (st.leapt) { const w = st.v.body.angvel(), k = Math.exp(-dt * 12); st.v.body.setAngvel({ x: w.x * k, y: w.y, z: w.z * k }, true); }
      }
      if (!L) continue;
      L.t += dt;
      const b = st.v.body, p = b.translation();
      const rem = L.T - L.t;
      if (L.short) {
        // into the lake: a splash, and the truck is put down on the landing hill (lost time is the penalty)
        if (p.y < this.crater.y + 1.5 || L.t > L.T + 2) {
          hz.fx.burst(new THREE.Vector3(p.x, this.crater.y + 1, p.z), time, 1.6);
          this.endLeap(st, false);
          race.respawn(st, 'C');
        }
        continue;
      }
      if (st.i < this.lip - 10 || L.t > L.T + 2.5) { this.endLeap(st, false); continue; }
      if (rem > 0.3) {
        const vy = (L.to.y - p.y) / rem + 0.5 * GRAV * rem;
        b.setLinvel({ x: (L.to.x - p.x) / rem, y: vy, z: (L.to.z - p.z) / rem }, true);
      }
      const v = b.linvel();
      const pitch = -Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.85;
      tq.setFromAxisAngle(UP, L.yaw).multiply(tq2.setFromAxisAngle(RIGHT, pitch));
      const r = b.rotation();
      tq2.set(r.x, r.y, r.z, r.w).slerp(tq, Math.min(1, dt * 3));
      b.setRotation(tq2, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (L.t > L.T * 0.6 && st.v.contacts >= 2) this.endLeap(st, true);
    }
    if (typeof window !== 'undefined' && window.__ltrace) {
      const st = race.player, p = st.v.body.translation(), v = st.v.body.linvel();
      if (st.i > this.td && st.i < this.td + 140) window.__ltrace.push([race.t.toFixed(2), st.i, p.y.toFixed(1), (p.y - this.t.at(st.i)[1]).toFixed(2), (st.off ?? 0).toFixed(1), v.x.toFixed(1), v.y.toFixed(1), v.z.toFixed(1), st.v.contacts, st.leap ? 'L' : '-', st.v.up?.toFixed(2)].join(' '));
    }
    // the landing hill and its run-out are a deep bed of loose cinders, an arrester bed: it scrubs the speed
    // off hard, so the bend at the bottom can be made
    for (const st of race.cars) {
      if (st.i < this.td - 6 || st.i > this.td + 95 || st.v.contacts < 2 || st.leap) continue;
      const v = st.v.body.linvel(), s = Math.hypot(v.x, v.z);
      if (s < 17) continue;
      const k = -st.v.body.mass() * Math.min(14, (s - 17) * 0.7 + 5) * dt / s;
      st.v.body.applyImpulse({ x: v.x * k, y: 0, z: v.z * k }, true);
      if (Math.random() < 0.5) {
        const p = st.v.body.translation(), c = 0.32;
        hz.fx.smoke.emit(tmp.set(p.x, p.y - 0.4, p.z), tmp2.set(-v.x * 0.15 + (Math.random() - 0.5) * 3, 2 + Math.random() * 2, -v.z * 0.15 + (Math.random() - 0.5) * 3), 1.6, time, 2.5, c, c * 0.9, c * 0.85);
      }
    }
    for (const fs of this.fissures) {
      fs.age += dt;
      // dust keeps sifting out of the crack for a while
      if (fs.age < 12 && Math.random() < 0.08) {
        const lat = (Math.random() - 0.5) * fs.W, f = fs.f;
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
        const c = 0.4; hz.fx.smoke.emit(new THREE.Vector3(x, hz.world.heightAt(x, z) + 0.3, z), tmp.set(0, 1.0, 0), 0.9, time, 3, c, c * 0.9, c * 0.8);
      }
    }
    this.fountains.update(dt, time, this.erupting);
    this.flow.post(dt, race, time);
    this.rocks.post();
  }

  endLeap(st, landed) {
    st.leap = null;
    st.leapt = true;
    st.landT = landed ? 1.2 : 0.01;
    this.hz.events.push({ type: 'landed', st });
  }

  // HUD: metres between the player and the lava front, while the flow is chasing
  get gap() { return this.flow.gapToPlayer; }

  dispose() {
    for (const h of this.heaves) h.dispose();
    this.rocks.dispose();
    this.flow.dispose();
    for (const fs of this.fissures) for (const m of fs.meshes) { m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); }
  }
}

// Lava fountains in the crater lake: glowing gobs thrown up from vents, stretched along their flight, cooling
// from yellow-white to dark red as they fall back. A truck's leap sets off columns along its path, timed to burst
// up past it at the height it flies through.
class Fountains {
  constructor(hz, crater, lite) {
    this.hz = hz; this.crater = crater;
    const N = this.N = lite ? 700 : 2000;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    hz.group.add(this.mesh);
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3);
    this.age = new Float32Array(N); this.size = new Float32Array(N); this.alive = new Uint8Array(N);
    this.next = 0;
    this.jets = [];
    this.rnd = mulberry(99);
    this.ambT = 0;
    this.m = new THREE.Matrix4(); this.s = new THREE.Vector3(); this.c = new THREE.Color(); this.q = new THREE.Quaternion();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) this.mesh.setMatrixAt(i, zero);
  }

  jet(x, z, v0, spread, rate, dur, size = 1) { this.jets.push({ x, z, v0, spread, rate, dur, size, acc: 0 }); }

  surge(L, big) {
    const cr = this.crater;
    for (const fr of [0.3, 0.42, 0.5, 0.58, 0.7]) {
      const x = L.from.x + (L.to.x - L.from.x) * fr, z = L.from.z + (L.to.z - L.from.z) * fr;
      if (Math.hypot(x - cr.x, z - cr.z) > cr.r - 12) continue;
      const tf = L.T * fr;
      // the truck's height above the lake when it passes over this vent
      const vy0 = (L.to.y - L.from.y) / L.T + 0.5 * GRAV * L.T;
      const h = L.from.y + vy0 * tf - 0.5 * GRAV * tf * tf - cr.y;
      const v0 = (h + 0.5 * GRAV * tf * tf) / tf;
      // lateral jitter so the columns flank the truck rather than hitting it square
      const side = (this.rnd() < 0.5 ? -1 : 1) * (4 + this.rnd() * 7);
      const dx = L.to.z - L.from.z, dz = -(L.to.x - L.from.x), dl = Math.hypot(dx, dz);
      this.jet(x + dx / dl * side, z + dz / dl * side, v0 * (1.02 + this.rnd() * 0.15), 2.6, big ? 170 : 60, L.T * 0.75, big ? 1.3 : 1);
    }
  }

  spawn(x, z, v0, spread, size) {
    const i = this.next; this.next = (this.next + 1) % this.N;
    const r = this.rnd;
    this.p[i * 3] = x + (r() - 0.5) * 3; this.p[i * 3 + 1] = this.crater.y + 0.5; this.p[i * 3 + 2] = z + (r() - 0.5) * 3;
    const s = v0 * (0.82 + r() * 0.3);
    this.v[i * 3] = (r() - 0.5) * 2 * spread; this.v[i * 3 + 1] = s; this.v[i * 3 + 2] = (r() - 0.5) * 2 * spread;
    this.age[i] = 0; this.size[i] = size * (0.45 + r() * r() * 1.4); this.alive[i] = 1;
  }

  update(dt, time, erupting) {
    const cr = this.crater, r = this.rnd;
    // the lake always bubbles; once the volcano erupts the vents roar and a great column stands in the middle
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = erupting ? 0.5 + r() * 0.7 : 1.4 + r() * 1.6;
      const a = r() * 6.283, d = r() * (cr.r - 25);
      this.jet(cr.x + Math.cos(a) * d, cr.z + Math.sin(a) * d, erupting ? 26 + r() * 26 : 9 + r() * 12, erupting ? 4 : 2.5, erupting ? 60 : 22, 0.8 + r() * 1.2, 1);
      if (erupting && r() < 0.35) this.jet(cr.x + (r() - 0.5) * 10, cr.z + (r() - 0.5) * 10, 44 + r() * 16, 3.5, 110, 1.6 + r(), 1.3);
    }
    for (const j of this.jets) {
      j.dur -= dt;
      j.acc += j.rate * dt;
      while (j.acc >= 1) { j.acc -= 1; this.spawn(j.x, j.z, j.v0, j.spread, j.size); }
    }
    this.jets = this.jets.filter((j) => j.dur > 0);
    const { p, v, m, s, c, q } = this;
    const mesh = this.mesh;
    const drag = Math.exp(-dt * 0.05);
    for (let i = 0; i < this.N; i++) {
      if (!this.alive[i]) continue;
      const k = i * 3;
      v[k + 1] -= GRAV * dt;
      v[k] *= drag; v[k + 2] *= drag;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      this.age[i] += dt;
      const inLake = Math.hypot(p[k] - cr.x, p[k + 2] - cr.z) < cr.r - 4;
      const floor = inLake ? cr.y : this.hz.world.heightAt(p[k], p[k + 2]);
      if (v[k + 1] < 0 && p[k + 1] < floor) {
        this.alive[i] = 0;
        m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m);
        if (inLake && r() < 0.04) this.hz.fx.fire.emit(tmp.set(p[k], cr.y + 0.5, p[k + 2]), tmp2.set(0, 1.5, 0), 1.6, time, 0.5);
        continue;
      }
      const sp = Math.hypot(v[k], v[k + 1], v[k + 2]);
      const sz = this.size[i];
      s.set(sz, sz, sz * (1 + sp * 0.12));
      q.setFromUnitVectors(FWD, tmp.set(v[k], v[k + 1], v[k + 2]).divideScalar(Math.max(sp, 1e-3)));
      m.compose(tmp2.set(p[k], p[k + 1], p[k + 2]), q, s);
      mesh.setMatrixAt(i, m);
      // white-hot from the vent, cooling as it flies
      const heat = Math.exp(-this.age[i] / 3.2);
      c.setRGB(0.7 + 1.3 * heat, 0.07 + 0.5 * heat * heat, 0.01 + 0.1 * heat ** 3);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}

// The lava flow on the descent: a glowing sheet laid over the road from the landing to the finish, revealed
// up to the advancing front. It sets off once the player is over the crater and runs at a pace a clean,
// quick truck can just stay ahead of; it closes in if the player is too far ahead, so the pressure stays on.
class LavaFlow {
  constructor(eru, lavaGroup) {
    this.eru = eru;
    const hz = eru.hz, t = eru.t, W = t.width;
    this.a = eru.land; this.b = t.n - 1;
    this.hw = W / 2 + 3.5;
    const NU = 8, verts = [], uvs = [], flow = [], idx = [];
    let rows = 0;
    for (let i = this.a; i <= this.b; i += 2) {
      const f = t.frame(i);
      for (let k = 0; k <= NU; k++) {
        const lat = (k / NU * 2 - 1) * this.hw;
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
        verts.push(x, hz.world.heightAt(x, z) + 0.42 - (lat / this.hw) ** 2 * 0.2, z);
        uvs.push(i - this.a, lat);
        flow.push(k / NU * 2 - 1, 7);
      }
      rows++;
    }
    for (let j = 0; j < rows - 1; j++) for (let k = 0; k < NU; k++) {
      const a = j * (NU + 1) + k, b = a + 1, c = a + NU + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
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
if (vT.x > uFront + (eN - 0.5) * 9.0) discard;
if (abs(vT.y) > ${edge} + eN * 2.2) discard;`)
        .replace('totalEmissiveRadiance += lavaEm;', `totalEmissiveRadiance += lavaEm;
// fresh lava: it glows right through its thin crust, white-hot at the front and dimming over the next few
// hundred metres as it crusts over
float behind = uFront - vT.x;
float fresh = 1.0 - smoothstep(0.0, 40.0, behind);
float warm = 1.0 - smoothstep(0.0, 400.0, behind);
float vein = smoothstep(0.35, 0.75, texture(tNoise, vW.xz / 6.0 + vec2(uTime * 0.02, 0.0)).g);
totalEmissiveRadiance += vec3(1.0, 0.26, 0.04) * (0.35 + 0.9 * warm) * (0.5 + vein) + vec3(2.4, 0.8, 0.14) * fresh * (0.7 + 0.3 * eN);`);
    };
    mat.customProgramCacheKey = () => 'lava-flow';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
    hz.group.add(this.mesh);
    this.light = new THREE.PointLight(0xff5a1a, 0, 80, 1.8);
    hz.group.add(this.light);
    // pace: how fast a truck can take each metre of the descent, from the bends and the braking into them
    const n = t.n, vp = new Float32Array(n);
    for (let i = 0; i < n; i++) vp[i] = Math.min(44, Math.sqrt(9 / Math.max(Math.abs(t.curv[i]), 1e-4)));
    for (let i = n - 2; i >= 0; i--) vp[i] = Math.min(vp[i], Math.sqrt(vp[i + 1] ** 2 + 12));
    for (let i = 1; i < n; i++) vp[i] = Math.min(vp[i], Math.sqrt(vp[i - 1] ** 2 + 7));
    this.pace = vp;
    this.state = 'wait';
    this.front = this.a - 30;
    this.gapToPlayer = null;
    this.rnd = mulberry(7);
  }

  pre(dt, race, time) {
    const pl = race.player, eru = this.eru;
    if (this.state === 'wait') {
      // pours over the rim once the player is across (or out), when the rest of the field is across too,
      // or twenty seconds on for anyone still to come: they will land in it
      if ((pl.leapt && !pl.leap) || pl.dnf || pl.finished) { this.state = 'delay'; this.T = 0; }
      return;
    }
    if (this.state === 'delay') {
      this.T += dt;
      // ...and the last of them has got clear of the rim
      const across = race.cars.every((c) => c.finished || (c.leapt && !c.leap && c.i > this.a + 120));
      if ((across && this.T > 1) || this.T > (race.diff.grace ?? 9)) { this.state = 'run'; this.runT = 0; this.mesh.visible = true; this.front = this.a; eru.hz.events.push({ type: 'flow' }); (this.log ||= []).push(`start t${race.t.toFixed(0)} lead ${Math.max(...race.cars.map((c) => c.i))}`); }
      return;
    }
    const i = Math.min(this.b, Math.floor(this.front));
    // it gathers pace over the first couple of seconds as it spills over the rim, then runs at the difficulty's
    // share of a clean, quick truck's pace through each metre
    this.runT += dt;
    const D = race.diff;
    let v = clamp(this.pace[i] * (D.lava ?? 0.86), 8, 42) * Math.min(1, 0.45 + this.runT / 2.5);
    // the player gets no breathing space: more than the difficulty's slack clear and the flow speeds up to close
    // in, unless an opponent still racing is right ahead of it (a stopped or wrecked one is fair game)
    const alive = !pl.finished;
    const gap = pl.i - this.front, slack = D.slack ?? 105;
    const chasing = race.cars.some((c) => !c.finished && c !== pl && c.v.speed() > 4 && c.i - this.front > 0 && c.i - this.front < 70);
    if (alive && gap > slack && !chasing) v *= 1 + Math.min(0.5, (gap - slack) / 120);
    this.front = Math.min(this.b + 20, this.front + v * dt);
    this.uFront.value = this.front - this.a;
    this.gapToPlayer = alive ? Math.max(0, gap) : null;
    const f = eru.t.frame(Math.min(this.b, Math.floor(this.front)));
    this.light.position.set(f.x, f.y + 4, f.z);
    this.light.intensity = 260 * (0.85 + 0.15 * Math.sin(time * 4));
    // smoke and spatter rolling off the front
    const fx = eru.hz.fx;
    for (let k = 0; k < 2; k++) {
      const lat = (this.rnd() - 0.5) * 2 * this.hw * 0.8;
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat, y = eru.hz.world.heightAt(x, z) + 0.8;
      const c = 0.07 + this.rnd() * 0.06;
      fx.smoke.emit(tmp.set(x, y, z), tmp2.set(f.tx * v * 0.3, 2 + this.rnd() * 2, f.tz * v * 0.3), 1.8 + this.rnd() * 1.5, time, 4, c, c * 0.92, c * 0.88);
      if (this.rnd() < 0.35) fx.fire.emit(tmp.set(x, y, z), tmp2.set(f.tx * v * 0.5, 1, f.tz * v * 0.5), 1 + this.rnd(), time, 0.5);
    }
  }

  post(dt, race, time) {
    if (this.state !== 'run') return;
    for (const st of race.cars) {
      if (st.finished || st.burned) continue;
      if (st.leap || st.i < this.a + 2 || this.front - st.i < 1.5) continue;
      this.burn(st, race, time);
    }
  }

  burn(st, race, time) {
    const v = st.v, d = v.damage;
    st.burned = true;
    (this.log ||= []).push(`${st.v.name.slice(0, 3)}@${st.i}t${race.t.toFixed(0)}`);
    if (d) { d.level = 1; d.burning = 1; d.totaledAt = true; }
    const p = v.body.translation(), lv = v.body.linvel();
    this.eru.hz.fx.explode(new THREE.Vector3(p.x, p.y + 0.5, p.z), time, 1.2, new THREE.Vector3(lv.x, lv.y, lv.z));
    v.body.setLinvel({ x: lv.x * 0.3, y: lv.y, z: lv.z * 0.3 }, true);
    this.eru.hz.events.push({ type: 'burned', st });
    race.retire(st);
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// Heavy rocks lying across the descent. Sleeping rigid bodies until a truck hits one; the AI steers round them.
class RoadRocks {
  constructor(eru) {
    this.eru = eru;
    const hz = eru.hz, t = eru.t, W = t.width, rnd = mulberry(311);
    t.obstacles = [];
    this.list = [];
    // spread over the descent legs and the run down the loop, clear of the landing run-out
    const a = eru.td + 150, b = eru.seg.out - 40, N = 16;
    for (let k = 0; k < N; k++) {
      let i = Math.round(a + (b - a) * (k + 0.2 + rnd() * 0.6) / N);
      // not in the middle of a hairpin
      const bendy = (c) => { let m = 0; for (let j = c - 30; j <= c + 30; j += 3) m = Math.max(m, Math.abs(t.curv[t.wrap(j)])); return m > 1 / 45; };
      for (let s = 0; s < 30 && bendy(i); s++) i += 5;
      const f = t.frame(i);
      const r = 1.25 + rnd() * 0.8;
      const lat = (rnd() * 2 - 1) * (W / 2 - 2.2);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      const sx = r, sy = r * 0.72, sz = r * 0.9, br = r * 0.25;
      const y = hz.world.heightAt(x, z) + sy * 0.8;
      const body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setSleeping(true).setCanSleep(true)
        .setRotation(tq.setFromAxisAngle(UP, rnd() * 6.283)).setLinearDamping(0.4).setAngularDamping(0.8));
      hz.phys.createCollider(RAPIER.ColliderDesc.roundCuboid(sx - br, sy - br, sz - br, br).setMass(2400 + r * 2200).setFriction(1)
        .setRestitution(0.1).setCollisionGroups(G_ROCK), body);
      const mesh = new THREE.Mesh(hz.geos[k % 4], hz.rockMat);
      mesh.scale.set(sx * 1.05, sy * 1.25, sz * 1.05);
      mesh.castShadow = true; mesh.receiveShadow = true;
      hz.group.add(mesh);
      const o = { i, lat, r: Math.max(sx, sz), body, mesh };
      this.sync(o);
      this.list.push(o);
      t.obstacles.push(o);
    }
  }

  sync(o) {
    const p = o.body.translation(), q = o.body.rotation();
    o.mesh.position.set(p.x, p.y, p.z);
    o.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }

  post() {
    const t = this.eru.t;
    for (const o of this.list) {
      if (o.body.isSleeping()) continue;
      this.sync(o);
      const p = o.body.translation();
      const near = t.nearest(p, o.i);
      o.i = near.i;
      const f = t.frame(o.i);
      o.lat = (p.x - f.x) * f.nx + (p.z - f.z) * f.nz;
    }
  }

  dispose() {
    for (const o of this.list) this.eru.hz.phys.removeRigidBody(o.body);
    this.eru.t.obstacles = [];
  }
}
