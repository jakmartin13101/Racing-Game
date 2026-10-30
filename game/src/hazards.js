import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry } from './world.js';
import { Eruption } from './eruption.js';
import { Bridge } from './bridge.js';
import { makeSlab, Chips, crackCanvas } from './quake.js';
import { Craters } from './crater.js';

// Track action: volcanic bombs raining on the village (and the upper summit road), boulders rolling off the
// slopes on the summit sprint, and on Caldera Loop a lava breakout after lap one with the ground heaving up
// into a ramp in front of it. One Hazards object lives for one race.
const G_HAZARD = (0x0008 << 16) | 0x0003; // hits the ground and trucks
const G_GROUND = (0x0001 << 16) | 0xffff;
const GRAV = 9.81;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), tq = new THREE.Quaternion();

// lumpy rock: a subdivided icosahedron pushed about by a few sine octaves
function rockGeometry(seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = mulberry(seed);
  const k = [r() * 6, r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    tmp.fromBufferAttribute(p, i);
    const n = 1 + 0.18 * Math.sin(tmp.x * 3.1 + k[0]) * Math.sin(tmp.y * 2.7 + k[1]) + 0.1 * Math.sin(tmp.z * 5.3 + k[2]) + 0.06 * Math.sin((tmp.x + tmp.y) * 9 + k[3]);
    tmp.multiplyScalar(n);
    tmp.y *= 0.85;
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  g.computeVertexNormals();
  return g;
}

// basalt with glowing cracks; heat 1 = fresh from the vent, 0 = cold
function bombMaterial(noise, base = 1, scale = 1, narrow = 0) {
  const heat = { value: 1 };
  const m = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHeat = heat; sh.uniforms.tNoise = { value: noise };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform float uHeat; uniform sampler2D tNoise;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float n = texture2D(tNoise, (vObj.xy * 0.35 + vObj.z * 0.21) * ${scale.toFixed(3)}).g * 0.6 + texture2D(tNoise, vObj.yz * 0.9 * ${scale.toFixed(3)}).r * 0.4;
float crack = ${narrow ? 'smoothstep(0.55, 0.6, n) * (1.0 - smoothstep(0.6, 0.65, n))' : 'smoothstep(0.42, 0.62, n) * (1.0 - smoothstep(0.62, 0.8, n)) + smoothstep(0.7, 0.9, n) * 0.3'};
totalEmissiveRadiance += vec3(3.2, 0.9, 0.12) * crack * uHeat * uHeat * 2.2 + vec3(0.6, 0.12, 0.02) * uHeat * uHeat * ${base.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => `volcanic-bomb-${base}-${scale}-${narrow}`;
  m.userData.heat = heat;
  return m;
}

function scorchTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(8,6,5,0.95)'); grd.addColorStop(0.55, 'rgba(12,9,7,0.7)'); grd.addColorStop(1, 'rgba(20,15,12,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * 6.283, r = 20 + Math.random() * 44;
    g.fillStyle = `rgba(10,8,6,${Math.random() * 0.4})`;
    g.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  return new THREE.CanvasTexture(cv);
}

export class Hazards {
  constructor({ phys, scene, world, track, fx, M, lava, rockMat, quality, events }) {
    Object.assign(this, { phys, scene, world, track, fx, M, events });
    this.lite = !!quality.aiLod;
    this.rnd = mulberry(1777);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rockMat = rockMat || new THREE.MeshStandardMaterial({ color: 0x3a342f, roughness: 0.95 });
    this.geos = [1, 2, 3, 4].map((s) => rockGeometry(s, this.lite ? 1 : 2));
    this.bombs = [];
    this.boulders = [];
    this.marks = [];
    this.scorchMat = new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.chips = new Chips(world, this.group, this.rockMat, this.lite ? 60 : 140);
    this.craters = new Craters({ world, track, group: this.group, M, phys, lite: this.lite });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a12, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    // what runs where
    const id = track.id;
    this.bombCfg = id === 'village' ? { gap: [1.4, 3.0], big: 0.28, from: 0 } : id === 'summit' ? { gap: [2.2, 4.2], big: 0.35, from: 0.45 }
      : id === 'eruption' ? { gap: [2.0, 3.8], big: 0.35, from: 0.3 } : { gap: [7, 12], big: 0.2, from: 0 };
    this.rockfall = id === 'summit' || id === 'eruption';
    this.rockFrom = id === 'eruption' ? 0.52 : 0.05;
    this.bombT = 4; this.rockT = 6;
    if (id === 'caldera') this.lava = new LavaBreakout(this, lava);
    // the finale: heaving ground and breakouts on the climb, the crater leap, the lava chasing the pack down
    if (id === 'eruption') { this.erupt = new Eruption(this, lava, (opts) => new LavaBreakout(this, lava, opts)); this.env = 0; }
    if (track.bridge) this.bridge = new Bridge({ phys, scene, track, world, M });
  }

  // before the physics step: spawn, steer kinematic bodies
  pre(dt, race) {
    if (race.clock < 2) return;
    this.t = (this.t || 0) + dt;
    const time = this.fx.time;
    this.bombT -= dt;
    const maxBombs = this.lite ? 8 : 14;
    if (this.bombT <= 0 && this.bombs.filter((b) => !b.landed).length < maxBombs) {
      const [a, b] = this.bombCfg.gap;
      this.bombT = a + this.rnd() * (b - a);
      this.spawnBomb(race);
    }
    if (this.rockfall) {
      this.rockT -= dt;
      if (this.rockT <= 0) { this.rockT = 5 + this.rnd() * 5; this.spawnBoulder(race); }
    }
    this.lava?.pre(dt, race, time);
    this.erupt?.pre(dt, race, time);
  }

  pickTarget(race, ahead, from = this.bombCfg.from) {
    const live = race.cars.filter((c) => !c.finished);
    if (!live.length) return null;
    const st = this.rnd() < 0.55 ? race.player : live[Math.floor(this.rnd() * live.length)];
    const t = this.track;
    const sp = Math.max(12, st.v.speed());
    const i = st.i + Math.round(sp * ahead * (0.85 + this.rnd() * 0.4));
    if (!t.closed && (i > t.n - 5)) return null;
    if (t.wrap(i) / t.n < from) return null;
    // nothing lands in the crater gap or on the climb's last stretch to the lip
    if (t.c[t.wrap(i)][4] || (t.lip != null && i > t.lip - 120 && i < t.land + 60)) return null;
    return { st, i: t.wrap(i), f: t.frame(i) };
  }

  spawnBomb(race) {
    // lobs vary, high and steep or long and flat, so they come down at different speeds
    const T = 2.4 + this.rnd() * 1.2;
    const tg = this.pickTarget(race, T);
    if (!tg) return;
    this.nBombs = (this.nBombs || 0) + 1;
    const W = this.track.width;
    const lat = (this.rnd() - 0.5) * (W + 6);
    const x = tg.f.x + tg.f.nx * lat, z = tg.f.z + tg.f.nz * lat;
    const y = this.world.heightAt(x, z);
    const big = this.rnd() < this.bombCfg.big;
    const r = big ? 0.9 + this.rnd() * 0.6 : 0.3 + this.rnd() * 0.3;
    // lobbed from the direction of the crater
    const away = tmp.set(x, 0, z).normalize();
    const reach = 120 + this.rnd() * 80, lift = 90 + this.rnd() * 80;
    const start = new THREE.Vector3(x - away.x * reach, y + lift, z - away.z * reach);
    const vel = new THREE.Vector3((x - start.x) / T, (y + r - start.y) / T + 0.5 * GRAV * T, (z - start.z) / T);
    const body = this.phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true)
      .setLinvel(vel.x, vel.y, vel.z).setAngvel({ x: this.rnd() * 4 - 2, y: this.rnd() * 4 - 2, z: this.rnd() * 4 - 2 }));
    this.phys.createCollider(RAPIER.ColliderDesc.ball(r * 0.9).setMass(Math.min(2500, 2600 * 4 / 3 * Math.PI * r ** 3)).setFriction(0.9)
      .setRestitution(0).setCollisionGroups(G_HAZARD), body);
    const mat = bombMaterial(this.M.noise);
    const mesh = new THREE.Mesh(this.geos[Math.floor(this.rnd() * 4)], mat);
    mesh.scale.setScalar(r);
    mesh.castShadow = true;
    this.group.add(mesh);
    // a glowing ring marks where it will land
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 2.2, r * 2.2 + 0.35, 40).rotateX(-Math.PI / 2), this.ringMat.clone());
    ring.position.set(x, y + 0.15, z);
    this.group.add(ring);
    this.bombs.push({ body, mesh, mat, ring, r, big, t: 0, T, i: tg.i, landed: false, age: 0, vPrev: new THREE.Vector3(vel.x, vel.y, vel.z) });
  }

  spawnBoulder(race) {
    // roll from whichever side of the road is higher; on flat ground look a little further on
    let f = null, side = 1;
    for (let k = 0; k < 4 && !f; k++) {
      const tg = this.pickTarget(race, 4.5 + k * 1.5, this.rockFrom);
      if (!tg) return;
      const hA = this.world.heightAt(tg.f.x + tg.f.nx * 30, tg.f.z + tg.f.nz * 30), hB = this.world.heightAt(tg.f.x - tg.f.nx * 30, tg.f.z - tg.f.nz * 30);
      if (Math.abs(hA - hB) >= 3) { f = tg.f; side = hA > hB ? 1 : -1; }
    }
    if (!f) return;
    this.nBoulders = (this.nBoulders || 0) + 1;
    const d = 24 + this.rnd() * 12;
    const x = f.x + f.nx * side * d, z = f.z + f.nz * side * d;
    const r = 0.8 + this.rnd() * 0.7;
    const y = this.world.heightAt(x, z) + r + 0.5;
    const body = this.phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCcdEnabled(true)
      .setLinvel(-f.nx * side * 7, -2, -f.nz * side * 7).setAngularDamping(0.1));
    this.phys.createCollider(RAPIER.ColliderDesc.ball(r * 0.92).setMass(1400 + r * 1500).setFriction(1).setRestitution(0.25)
      .setCollisionGroups(G_HAZARD), body);
    const mesh = new THREE.Mesh(this.geos[Math.floor(this.rnd() * 4)], this.rockMat);
    mesh.scale.setScalar(r);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.boulders.push({ body, mesh, r, age: 0 });
    // a dust kick where it breaks loose
    for (let k = 0; k < 8; k++) this.fx.smoke.emit(new THREE.Vector3(x, y, z), new THREE.Vector3(this.rnd() * 4 - 2, 1 + this.rnd() * 2, this.rnd() * 4 - 2), 1.2, this.fx.time, 2.5, 0.3, 0.27, 0.24);
  }

  // after the physics step: move visuals, detect landings, hurt trucks nearby
  post(dt, race) {
    const time = this.fx.time;
    for (const b of this.bombs) {
      if (!b.body) continue;
      b.age += dt;
      const p = b.body.translation(), q = b.body.rotation();
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      if (!b.landed) {
        b.t += dt;
        // fiery trail on the way down
        if (Math.random() < (this.lite ? 0.5 : 0.9)) {
          this.fx.fire.emit(b.mesh.position, tmp.set(0, 0.5, 0), b.r * 1.6, time, 0.35);
          const c = 0.08; this.fx.smoke.emit(b.mesh.position, tmp.set(0, 0.3, 0), b.r * 1.5, time, 3, c, c * 0.95, c * 0.9);
        }
        const left = b.T - b.t;
        b.ring.material.opacity = THREE.MathUtils.clamp(1 - left / 1.8, 0, 1) * (0.55 + 0.45 * Math.sin(time * 20));
        const gy = this.world.heightAt(p.x, p.z);
        if (p.y - gy < b.r + 0.4 || b.t > b.T + 1.5) this.land(b, race, new THREE.Vector3(p.x, Math.max(p.y, gy), p.z), time);
      } else {
        if (!b.rest) this.bounce(b, p, time);
        // cooling on the ground, still smoking
        b.mat.userData.heat.value = Math.max(0.05, 1 - b.age / 14);
        if (Math.random() < 0.15) { const c = 0.25; this.fx.smoke.emit(b.mesh.position, tmp.set(0, 0.8, 0), b.r, time, 3, c, c, c); }
        if (b.age > 30) this.remove(b);
      }
      if (b.body) { const v = b.body.linvel(); b.vPrev.set(v.x, v.y, v.z); }
    }
    this.bombs = this.bombs.filter((b) => b.body);
    for (const r of this.boulders) {
      if (!r.body) continue;
      r.age += dt;
      const p = r.body.translation(), q = r.body.rotation();
      r.mesh.position.set(p.x, p.y, p.z);
      r.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      const v = r.body.linvel();
      if (Math.hypot(v.x, v.z) > 4 && Math.random() < 0.3 && p.y - this.world.heightAt(p.x, p.z) < r.r + 0.3) {
        this.fx.smoke.emit(new THREE.Vector3(p.x, p.y - r.r * 0.8, p.z), tmp.set(0, 0.6, 0), r.r * 0.8, time, 2, 0.32, 0.29, 0.25);
      }
      if (r.age > 28 || p.y < -300) { this.phys.removeRigidBody(r.body); r.body = null; this.group.remove(r.mesh); }
    }
    this.boulders = this.boulders.filter((r) => r.body);
    for (const m of this.marks) { m.age += dt; m.mesh.material.opacity = Math.max(0, 1 - Math.max(0, m.age - 30) / 10); }
    this.marks = this.marks.filter((m) => { if (m.age > 40) { this.group.remove(m.mesh); m.mesh.material.dispose(); return false; } return true; });
    this.lava?.post(dt, race, time);
    this.erupt?.post(dt, race, time);
    this.chips.update(dt);
    this.craters.update(dt);
    this.bridge?.update(time);
  }

  // a crater for a rock of radius r hitting at speed v: grows with the rock and (more weakly) with the speed,
  // the rim thrown up about a sixth of its radius; slow hits on the bounce only dent the ground
  crater(b, p, v, n) {
    const R = Math.min(6, b.r * (0.35 + 2.1 * (v / 60) ** 0.6));
    if (R < Math.max(0.45, b.r * 1.05)) return false;
    const h = R * (0.15 + this.rnd() * 0.06) * Math.min(1, (v / 35) ** 0.5);
    this.craters.add(tmp.set(p.x, 0, p.z).clone(), R, h, b.i);
    // earth and broken road thrown out of it
    const nc = Math.min(30, Math.round(R * 5));
    for (let k = 0; k < nc; k++) {
      const a = this.rnd() * 6.283, s = 3 + this.rnd() * 5 * Math.sqrt(R);
      this.chips.throw(tmp.set(p.x + Math.cos(a) * R * 0.5, this.world.heightAt(p.x, p.z) + 0.3, p.z + Math.sin(a) * R * 0.5),
        new THREE.Vector3(Math.cos(a) * s, 3 + this.rnd() * 6 * Math.sqrt(R / 2), Math.sin(a) * s), 0.08 + this.rnd() * 0.12 * R / 2);
    }
    return true;
  }

  // after it lands a rock skips along: each hit throws it back up a little less, and after its last bounce
  // (one to five of them) it comes to rest. Rapier holds it on the ground; the hops are set here, from the
  // velocity it had coming in
  bounce(b, p, time) {
    b.since += 1 / 60;
    const gy = this.world.heightAt(p.x, p.z);
    if (p.y - gy > b.r * 0.92 + 0.15 || b.vPrev.y > -0.6 || b.since < 0.1) return;
    const n = this.world.normalAt(p.x, p.z, tmp2);
    const vin = b.vPrev, vn = vin.dot(n), sp = vin.length();
    if (vn > -0.6) return;
    b.since = 0;
    b.hits++;
    if (b.hits > 1) {
      this.crater(b, p, sp, n);
      this.fx.smoke.emit(tmp.set(p.x, gy + 0.3, p.z), tmp3.set(0, 1, 0), 0.6 + b.r, time, 2, 0.3, 0.27, 0.24);
    }
    if (b.hits > b.nb) {
      // done: it rolls on a little and stops (left free, so a truck can shove it aside)
      b.rest = true;
      b.body.setLinvel({ x: vin.x * 0.3, y: 0, z: vin.z * 0.3 }, true);
      b.body.setLinearDamping(0.6); b.body.setAngularDamping(0.8);
      return;
    }
    // each hop lower than the last; the ground takes most of the speed along it too
    const up = Math.min(-vn * 0.4, 7.5 * 0.55 ** (b.hits - 1));
    const keep = 0.5 + 0.1 * b.hits;
    const vt = tmp3.copy(vin).addScaledVector(n, -vn).multiplyScalar(Math.min(keep, 8 / Math.max(1, sp)));
    b.body.setLinvel({ x: vt.x + n.x * up, y: vt.y + n.y * up, z: vt.z + n.z * up }, true);
    const w = b.body.angvel();
    b.body.setAngvel({ x: w.x * 0.6 + (this.rnd() - 0.5) * 3, y: w.y * 0.6, z: w.z * 0.6 + (this.rnd() - 0.5) * 3 }, true);
  }

  land(b, race, p, time) {
    b.landed = true;
    b.age = 0;
    this.group.remove(b.ring);
    b.ring.material.dispose();
    // the crater, from the speed it came in at; then it bounces one to five times
    const sp = b.vPrev.length();
    const made = this.crater(b, p, sp);
    b.nb = 1 + Math.floor(this.rnd() * 5); b.hits = 0; b.since = 1; b.rest = false;
    this.bounce(b, { x: p.x, y: this.world.heightAt(p.x, p.z) + b.r * 0.5, z: p.z }, time);
    this.fx.burst(p, time, b.big ? 1.3 : 0.6);
    // dust ring
    for (let k = 0; k < (b.big ? 18 : 9); k++) {
      const a = (k / (b.big ? 18 : 9)) * 6.283;
      this.fx.smoke.emit(p, tmp.set(Math.cos(a) * 6, 0.5, Math.sin(a) * 6), 0.8 + b.r, time, 2.2, 0.3, 0.27, 0.24);
    }
    // scorch mark on the ground (dents too small for a crater still blacken it)
    if (made) return this.blast(b, race, p);
    const n = this.world.normalAt(p.x, p.z, new THREE.Vector3());
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.scorchMat.clone());
    mark.scale.setScalar(2.5 + b.r * 4);
    mark.position.set(p.x, this.world.heightAt(p.x, p.z) + 0.06, p.z);
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mark.rotateZ(Math.random() * 6.283);
    this.group.add(mark);
    this.marks.push({ mesh: mark, age: 0 });
    if (this.marks.length > 30) { const m = this.marks.shift(); this.group.remove(m.mesh); m.mesh.material.dispose(); }
    this.blast(b, race, p);
  }

  blast(b, race, p) {
    // blast: dents and a shove for any truck close by
    const R = 3 + b.r * 6;
    for (const st of race.cars) {
      const c = st.v.body.translation();
      const d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
      if (d > R) continue;
      const f = 1 - d / R;
      const dir = new THREE.Vector3(p.x - c.x, p.y - c.y, p.z - c.z).normalize();
      st.v.damage?.hit(dir, f * (6 + b.r * 16), p.clone(), false);
      const push = f * 2170 * (2 + b.r * 4);
      st.v.body.applyImpulse({ x: -dir.x * push, y: push * 0.5, z: -dir.z * push }, true);
      if (st.isPlayer) this.events?.push({ type: 'hit', dv: f * 10, st });
    }
    if (race.player.v.group.position.distanceTo(p) < 60) this.events?.push({ type: 'quake', k: b.big ? 0.35 : 0.15 });
  }

  remove(b) {
    if (b.body) this.phys.removeRigidBody(b.body);
    b.body = null;
    this.group.remove(b.mesh, b.ring);
    b.mat.dispose();
  }

  dispose() {
    for (const b of this.bombs) this.remove(b);
    this.craters.dispose();
    for (const r of this.boulders) if (r.body) this.phys.removeRigidBody(r.body);
    this.lava?.dispose();
    this.erupt?.dispose();
    this.bridge?.dispose(this.phys, this.scene);
    this.scene.remove(this.group);
  }
}

// Caldera Loop, after lap one: the ground cracks and heaves up into a slab ramp, then lava breaks out of the
// hillside and floods across the track just past it. From then on the only way through is over the top.
// opts (Eruption): i0 the track row, lava false for a bare heave with no flood, trigger(race) to set it off,
// rise and flood the seconds the slab takes to come up and the lava to cross (Eruption's go off right in front of
// the player, so they are quick).
export class LavaBreakout {
  constructor(hz, lavaGroup, opts = {}) {
    this.hz = hz;
    const t = hz.track;
    this.i0 = opts.i0 ?? 1365;
    this.withLava = opts.lava ?? true;
    this.trigger = opts.trigger || ((race) => race.cars.some((c) => c.lap >= 1));
    this.event = opts.event || 'breakout';
    this.rise = opts.rise ?? 3;
    this.flood = opts.flood ?? 7;
    this.state = 'idle';
    this.T = 0;
    const f = t.frame(this.i0);
    this.f = f;
    const W = t.width;
    this.half = 6; // along the track
    // the flow comes from the uphill side
    const hA = hz.world.heightAt(f.x + f.nx * 25, f.z + f.nz * 25), hB = hz.world.heightAt(f.x - f.nx * 25, f.z - f.nz * 25);
    this.side = hA > hB ? 1 : -1;
    // how far the flood spreads either side; on Eruption's switchbacks it must stop short of the next leg
    this.latMax = W / 2 + (opts.spread ?? 16);
    // lava sheet: a terrain-hugging grid, u across (0 = uphill edge), v along
    const NU = 40, NV = 14, verts = [], uvs = [], idx = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU, v = j / NV;
      const lat = this.side * (this.latMax - u * 2 * this.latMax);
      const al = (v - 0.5) * 2 * (this.half + 2);
      const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
      // the road ribbon sits a little above the terrain; the lava has to cover it too
      let y = hz.world.heightAt(x, z);
      if (Math.abs(lat) < W / 2 + 3) y = Math.max(y, t.at(t.wrap(this.i0 + Math.round(al)))[1] + 0.15);
      verts.push(x, y + 0.25, z);
      uvs.push(u, v);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.front = { value: 0 };
    const mat = lavaGroup.userData.makeMat(false);
    mat.side = THREE.DoubleSide;
    const base = mat.onBeforeCompile;
    const front = this.front;
    mat.onBeforeCompile = (sh, r) => {
      base(sh, r);
      sh.uniforms.uFront = front;
      sh.fragmentShader = sh.fragmentShader.replace('uniform float uTime;', 'uniform float uTime; uniform float uFront;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float edgeN = texture(tNoise, vW.xz / 9.0).r;
if (vT.x > uFront + (edgeN - 0.5) * 0.18) discard;
if (abs(vT.y - 0.5) * 2.0 > 0.72 + edgeN * 0.3 - smoothstep(0.0, 0.2, uFront - vT.x) * 0.0) discard;`);
    };
    mat.customProgramCacheKey = () => 'lava-breakout';
    this.sheet = new THREE.Mesh(geo, mat);
    this.sheet.visible = false;
    if (this.withLava) {
      hz.group.add(this.sheet);
      this.light = new THREE.PointLight(0xff5a1a, 0, 40, 2);
      this.light.position.set(f.x, hz.world.heightAt(f.x, f.z) + 3, f.z);
      hz.group.add(this.light);
    }
    // the slab that heaves up: 9 m wide, 9 m long, its lip a metre short of the lava
    this.rampAlong = -(this.half + 1 + 4.5);
    this.rampLen = 9; this.rampW = 9; this.rampTh = 0.7; this.pitch = 0.25;
    // a slab of the road itself, wrenched up on its torn earth
    const slab = makeSlab(hz.M, this.rampW, this.rampLen, this.rampTh, 900 + this.i0, t.width);
    slab.visible = false;
    hz.group.add(slab);
    this.slab = slab;
    // where it tore out of the road: a dark hole of earth under the lifted lip, and cracks running off across the road
    const cr = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: crackCanvas(mulberry(this.i0), 512, 512, { main: 5, branches: 18, border: false, width: 9 }), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const cx = f.x + f.tx * this.rampAlong, cz = f.z + f.tz * this.rampAlong;
    const cp = cr.geometry.attributes.position;
    for (let k = 0; k < cp.count; k++) {
      const lat = cp.getX(k) * (W + 2), al = cp.getZ(k) * (this.rampLen + 10);
      const x = cx + f.nx * lat + f.tx * al, z = cz + f.nz * lat + f.tz * al;
      cp.setXYZ(k, x, hz.world.heightAt(x, z) + 0.16, z);
    }
    cr.renderOrder = 2;
    cr.visible = false;
    hz.group.add(cr);
    this.crackDecal = cr;
    // (only under the front of it: the back edge stays down on the road)
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(this.rampW - 0.6, this.rampLen * 0.45).rotateX(-Math.PI / 2).translate(0, 0, this.rampLen * 0.25), new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 1 }));
    pit.visible = false;
    hz.group.add(pit);
    this.pit = pit;
    this.chips = hz.chips;
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(f.x, -500, f.z));
    hz.phys.createCollider(RAPIER.ColliderDesc.cuboid(this.rampW / 2, this.rampTh / 2, this.rampLen / 2).setFriction(1).setCollisionGroups(G_GROUND), this.body);
    this.jump = this.withLava ? { at: t.wrap(this.i0 - this.half - 1), speed: 24, flat: 30, land: t.wrap(this.i0 + 24) }
      : { at: t.wrap(this.i0 - this.half - 1), speed: 0, flat: 0, max: 21, land: t.wrap(this.i0 + 10), guard: 40 };
    if (!this.withLava) this.pitch = 0.13;
  }

  // slab pose for a rise fraction k (0 sunk, 1 up)
  pose(k) {
    const f = this.f, hz = this.hz;
    const cx = f.x + f.tx * this.rampAlong, cz = f.z + f.tz * this.rampAlong;
    // tilt up from the road's own grade, with the back edge on the road
    const hl = this.rampLen / 2;
    const hb = hz.world.heightAt(cx - f.tx * hl, cz - f.tz * hl), hf = hz.world.heightAt(cx + f.tx * hl, cz + f.tz * hl);
    const pitch = Math.atan2(hf - hb, this.rampLen) + this.pitch * k;
    tq.setFromAxisAngle(tmp.set(0, 1, 0), f.yaw);
    const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch);
    tq.multiply(qp);
    // the back edge stays at the ground; the lip rises
    const y = hb - 1.6 * (1 - k) + Math.sin(pitch) * hl - this.rampTh * 0.3;
    return { p: new THREE.Vector3(cx, y, cz), q: tq.clone() };
  }

  pre(dt, race, time) {
    const hz = this.hz;
    if (this.state === 'idle') {
      // the leader starting lap two sets it off
      if (this.trigger(race)) {
        this.state = 'rise'; this.T = 0; this.slab.visible = true; this.crackDecal.visible = true;
        hz.events?.push({ type: this.event, i: this.i0 });
        // the road bursts: chunks of it and stones thrown up all round the slab
        const f = this.f, c = this.pose(0).p;
        for (let k = 0; k < 26; k++) {
          const a = (Math.random() - 0.5) * (this.rampW + 3), b = (Math.random() - 0.5) * (this.rampLen + 3);
          const x = c.x + f.nx * a + f.tx * b, z = c.z + f.nz * a + f.tz * b;
          hz.chips.throw(tmp.set(x, hz.world.heightAt(x, z) + 0.2, z), new THREE.Vector3(f.nx * a * 0.6 + (Math.random() - 0.5) * 2, 4 + Math.random() * 7, f.nz * a * 0.6 + (Math.random() - 0.5) * 2), 0.12 + Math.pow(Math.random(), 2) * 0.45);
        }
      }
      return;
    }
    this.T += dt;
    const k = THREE.MathUtils.smoothstep(this.T, 0, this.rise);
    const { p, q } = this.pose(k);
    this.body.setNextKinematicTranslation(p);
    this.body.setNextKinematicRotation(q);
    this.slab.position.copy(p); this.slab.quaternion.copy(q);
    if (!this.pit.visible) {
      // the hole it leaves, on the road under the slab
      const f = this.f, c = this.pose(0).p;
      this.pit.position.set(c.x, this.hz.world.heightAt(c.x, c.z) + 0.06, c.z);
      this.pit.rotation.y = f.yaw;
      this.pit.visible = true;
    }
    // cracking ground: dust and stone chips while it heaves
    if (this.T < this.rise + 0.5 && Math.random() < (this.rise < 2 ? 0.45 : 0.3)) {
      const a = (Math.random() - 0.5) * this.rampW, b = (Math.random() - 0.5) * this.rampLen;
      const f = this.f;
      const x = p.x + f.nx * a + f.tx * b, z = p.z + f.nz * a + f.tz * b;
      const c = 0.36 + Math.random() * 0.1;
      hz.fx.smoke.emit(new THREE.Vector3(x, hz.world.heightAt(x, z) + 0.3, z), tmp.set(Math.random() - 0.5, 1.5 + Math.random() * 2.5, Math.random() - 0.5), 0.9 + Math.random() * 0.8, time, 2.5, c, c * 0.9, c * 0.8);
      if (Math.random() < 0.35) hz.chips.throw(new THREE.Vector3(x, hz.world.heightAt(x, z) + 0.2, z), tmp.set((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3), 0.08 + Math.random() * 0.15);
    }
    if (this.T > this.rise * 0.5 && !this.jumpOn) { this.jumpOn = true; hz.track.jumps.push(this.jump); }
    // lava floods across from the uphill side
    const t0 = this.rise * 0.83;
    if (this.T > t0 && this.withLava) {
      this.sheet.visible = true;
      this.front.value = THREE.MathUtils.clamp((this.T - t0) / this.flood, 0, 1.08);
      this.light.intensity = 70 * Math.min(1, this.front.value * 2) * (0.9 + 0.1 * Math.sin(time * 3));
      if (Math.random() < 0.12) {
        const u = Math.random() * Math.min(1, this.front.value), lat = this.side * (this.latMax - u * 2 * this.latMax);
        const f = this.f, al = (Math.random() - 0.5) * this.half * 1.6;
        const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
        const c = 0.35; hz.fx.smoke.emit(new THREE.Vector3(x, hz.world.heightAt(x, z) + 0.5, z), tmp.set(0, 1.6, 0), 1.0, time, 2.6, c, c * 0.96, c * 0.92);
      }
    }
  }

  // trucks that touch the lava are lost to it
  post(dt, race) {
    if (!this.withLava || this.front.value <= 0) return;
    const f = this.f;
    for (const st of race.cars) {
      if (st.finished && !st.v.totaled) continue;
      const p = st.v.body.translation();
      const dx = p.x - f.x, dz = p.z - f.z;
      const al = dx * f.tx + dz * f.tz, lat = dx * f.nx + dz * f.nz;
      const u = (this.latMax - lat * this.side) / (2 * this.latMax);
      if (Math.abs(al) > this.half * 0.85 || u > this.front.value || u < 0) continue;
      if (Math.abs(this.hz.track.ahead(this.i0, st.i)) > 40) continue; // a different stretch of road that passes close by
      if (p.y > this.hz.world.heightAt(p.x, p.z) + 1.6) continue;
      this.hz.fx.burst(new THREE.Vector3(p.x, p.y, p.z), this.hz.fx.time, 0.7);
      race.respawn(st, 'L');
    }
  }

  dispose() {
    const j = this.hz.track.jumps.indexOf(this.jump);
    if (j >= 0) this.hz.track.jumps.splice(j, 1);
    this.hz.phys.removeRigidBody(this.body);
  }
}
