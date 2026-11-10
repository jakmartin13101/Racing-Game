import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeSlab, crackCanvas, roadCrack } from '../../quake.js';
import { mulberry } from '../../world.js';
import { G_GROUND, disposeTree } from './util.js';

// The cracked switchbacks: quakes break the road up into slabs. At each of the bake's slab rows the road
// shatters into a field of plates, the big one heaved up into a ramp across most of the road, smaller ones
// shoved up into kerbs and steps beside and behind it, cracks ripping across, chunks of road thrown about.
// No lava: torn gravel, soil and rock. Each goes off when the player is about two seconds short of it, so it
// happens on screen; they stay up for the rest of the race, real colliders. Between them, quakes keep ripping
// fissures across the road ahead of the player.
const tmp = new THREE.Vector3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

class Plate {
  // one slab: w wide, l long (along the road), at `along` metres from the site's row and `lat` across;
  // lift: how high its lip rises (m); roll: its tilt across
  constructor(site, { along, lat, w, l, th, lift, roll, delay, seed }) {
    const hz = site.hz, t = hz.track;
    Object.assign(this, { site, along, lat, w, l, th, lift, roll, delay });
    const i = site.i + Math.round(along);
    this.f = t.frame(i);
    this.mesh = makeSlab(hz.M, w, l, th, seed, t.width);
    this.mesh.visible = false;
    site.group.add(this.mesh);
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.f.x, -500, this.f.z));
    hz.phys.createCollider(RAPIER.ColliderDesc.cuboid(w / 2 - 0.1, th / 2, l / 2 - 0.1).setFriction(1).setCollisionGroups(G_GROUND), this.body);
    // the dark hole it tore out of, under its lip
    this.pit = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, l * 0.5).rotateX(-Math.PI / 2).translate(0, 0, l * 0.22), site.pitMat);
    this.pit.visible = false;
    site.group.add(this.pit);
  }

  pose(k) {
    const f = this.f, hz = this.site.hz;
    const cx = f.x + f.nx * this.lat, cz = f.z + f.nz * this.lat;
    const hl = this.l / 2;
    const hb = hz.world.heightAt(cx - f.tx * hl, cz - f.tz * hl), hf = hz.world.heightAt(cx + f.tx * hl, cz + f.tz * hl);
    const pitch = Math.atan2(hf - hb, this.l) + Math.atan2(this.lift, this.l) * k;
    tq.setFromAxisAngle(Y, f.yaw).multiply(tq2.setFromAxisAngle(X, -pitch)).multiply(tq2.setFromAxisAngle(Z, this.roll * k));
    // the back edge stays down at the road; the lip rises
    const y = hb - 1.2 * (1 - k) + Math.sin(pitch) * hl - this.th * 0.3 + Math.abs(Math.sin(this.roll * k)) * this.w * 0.25;
    return { p: tmp.set(cx, y, cz), q: tq };
  }

  set(k) {
    const { p, q } = this.pose(k);
    this.body.setNextKinematicTranslation(p);
    this.body.setNextKinematicRotation(q);
    this.mesh.position.copy(p); this.mesh.quaternion.copy(q);
    this.mesh.visible = true;
    if (!this.pit.visible) {
      const f = this.f, hz = this.site.hz;
      const cx = f.x + f.nx * this.lat, cz = f.z + f.nz * this.lat;
      this.pit.position.set(cx, hz.world.heightAt(cx, cz) + 0.07, cz);
      this.pit.rotation.y = f.yaw;
      this.pit.visible = true;
    }
  }
}

class QuakeSite {
  constructor(q, i, seed) {
    this.q = q; this.hz = q.hz; this.i = i;
    const hz = this.hz, t = hz.track, W = t.width, rnd = this.rnd = mulberry(seed);
    this.group = new THREE.Group();
    hz.group.add(this.group);
    this.pitMat = q.pitMat;
    // the big ramp slab across most of the road, its free side a step; a kerb plate beside it; a stepped pair
    // behind it; a far plate tipped up on the other verge
    const s = rnd() < 0.5 ? -1 : 1;
    const big = { along: 0, lat: s * (W * 0.12), w: W * 0.72, l: 8.5, th: 0.75, lift: 0.95 + rnd() * 0.3, roll: s * 0.04, delay: 0 };
    const specs = [big,
      { along: 1.5, lat: -s * (W / 2 - 1.6), w: 3.2, l: 5.5, th: 0.55, lift: 0.55, roll: -s * 0.22, delay: 0.25 },
      { along: 10.5, lat: s * (W * 0.2), w: W * 0.5, l: 5, th: 0.6, lift: 0.4 + rnd() * 0.15, roll: -s * 0.05, delay: 0.5 },
      { along: 10, lat: -s * (W * 0.3), w: W * 0.36, l: 4.5, th: 0.55, lift: 0.25, roll: s * 0.12, delay: 0.6 },
      { along: -9, lat: s * (W / 2 - 1.3), w: 2.8, l: 4.5, th: 0.5, lift: 0.35, roll: s * 0.3, delay: 0.4 }];
    if (hz.lite) specs.pop();
    this.plates = specs.map((sp, k) => new Plate(this, { ...sp, seed: seed * 11 + k }));
    // cracks crazing the road all round the site
    const f = t.frame(i);
    const g = new THREE.PlaneGeometry(1, 1, 12, 12).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const lat = p.getX(k) * (W + 4), al = p.getZ(k) * 34 + 1;
      const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
      p.setXYZ(k, x, hz.world.heightAt(x, z) + 0.15, z);
    }
    this.decal = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: crackCanvas(mulberry(seed + 1), 512, 1024, { main: 7, branches: 26, border: false, width: 9 }),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.decal.renderOrder = 2;
    this.decal.visible = false;
    this.group.add(this.decal);
    this.state = 'idle';
    this.T = 0;
    this.fissures = [];
    // the AI takes it steady and lines up on the ramp
    this.jump = { at: t.wrap(i - 14), speed: 0, flat: 0, max: 19, land: t.wrap(i + 22), guard: 40 };
  }

  trigger(race) {
    const pl = race.player, d = this.i - pl.i;
    if (!pl.finished && d > 0 && d < 24 + pl.v.speed() * 2.0) return true;
    // the player far behind (or out): the leaders set it off themselves
    return (pl.i < this.i - 400 || pl.finished) && race.cars.some((c) => !c.isPlayer && !c.finished && this.i - c.i > 0 && this.i - c.i < 70);
  }

  pre(dt, race, time) {
    const hz = this.hz;
    if (this.state === 'idle') {
      if (!this.trigger(race)) return;
      this.state = 'rise'; this.T = 0;
      this.decal.visible = true;
      hz.track.jumps.push(this.jump);
      hz.events.push({ type: 'quake', k: 0.4 });
      hz.events.push({ type: 'heave', i: this.i });
      const t = hz.track, W = t.width, f = t.frame(this.i), rnd = this.rnd;
      // the road bursts: chunks of it flung up all round
      for (let k = 0; k < (hz.lite ? 24 : 44); k++) {
        const a = (rnd() - 0.5) * (W + 4), b = (rnd() - 0.5) * 26;
        const x = f.x + f.nx * a + f.tx * b, z = f.z + f.nz * a + f.tz * b;
        hz.chips.throw(tmp.set(x, hz.world.heightAt(x, z) + 0.2, z), new THREE.Vector3(f.nx * a * 0.4 + (rnd() - 0.5) * 3, 4 + rnd() * 8, f.nz * a * 0.4 + (rnd() - 0.5) * 3), 0.1 + rnd() * rnd() * 0.5);
      }
      // cracks rip across ahead of and behind the plates
      for (const al of [-17, 19]) {
        const ff = t.frame(this.i + al);
        this.fissures.push(roadCrack(hz.M, hz.world, t, ff, W + 4, 2.6 + rnd() * 1.5, (rnd() - 0.5) * 0.7, rnd, this.group));
      }
    }
    if (this.state === 'rise') {
      this.T += dt;
      let done = true;
      for (const pl of this.plates) {
        const u = THREE.MathUtils.clamp((this.T - pl.delay) / 0.9, 0, 1);
        // a hard shove up, overshooting a touch, then settling back
        const k = u < 1 ? THREE.MathUtils.smoothstep(u, 0, 1) * (1 + 0.12 * Math.sin(u * Math.PI)) : 1;
        if (u > 0 || pl.mesh.visible) pl.set(k);
        if (u < 1) done = false;
      }
      // dust boiling out of the breaks while it moves
      const hzr = this.rnd, t = hz.track, f = t.frame(this.i), W = t.width;
      if (this.T < 2.2 && hzr() < 0.6) for (let k = 0; k < 1; k++) {
        const a = (hzr() - 0.5) * W, b = (hzr() - 0.5) * 24;
        const x = f.x + f.nx * a + f.tx * b, z = f.z + f.nz * a + f.tz * b;
        const c = 0.38 + hzr() * 0.1;
        hz.fx.smoke.emit(tmp.set(x, hz.world.heightAt(x, z) + 0.4, z), new THREE.Vector3((hzr() - 0.5) * 2, 1.5 + hzr() * 3, (hzr() - 0.5) * 2), 0.5 + hzr() * 0.4, time, 2.6, c, c * 0.9, c * 0.8);
      }
      if (done && this.T > 2.5) this.state = 'up';
    }
  }

  dispose() {
    const t = this.hz.track, j = t.jumps.indexOf(this.jump);
    if (j >= 0) t.jumps.splice(j, 1);
    for (const p of this.plates) this.hz.phys.removeRigidBody(p.body);
    disposeTree(this.group, new Set([this.pitMat]));
  }
}

export class Switchbacks {
  constructor(hz, rows, sec) {
    this.hz = hz;
    this.sec = sec;
    this.pitMat = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 1 });
    this.sites = rows.map((i, k) => new QuakeSite(this, i, 700 + k * 31));
    this.rnd = mulberry(901);
    this.quakeT = 3;
    this.fissures = [];
  }

  pre(dt, race, time) {
    for (const s of this.sites) s.pre(dt, race, time);
    const hz = this.hz, t = hz.track, pl = race.player, [a, b] = this.sec;
    // quakes while the player is on the switchbacks, cracking the road open just ahead
    if (pl.finished || pl.i < a - 150 || pl.i > b) return;
    this.quakeT -= dt;
    if (this.quakeT > 0) return;
    this.quakeT = 4 + this.rnd() * 3.5;
    hz.events.push({ type: 'quake', k: 0.18 + this.rnd() * 0.12 });
    const i = pl.i + Math.round(20 + pl.v.speed() * (0.9 + this.rnd() * 0.6));
    if (i < a || i > b || t.c[t.wrap(i)][4] || this.sites.some((s) => Math.abs(s.i - i) < 40)) return;
    const f = t.frame(i), W = t.width + 4, L = 2.4 + this.rnd() * 1.8;
    const meshes = roadCrack(hz.M, hz.world, t, f, W, L, (this.rnd() - 0.5) * 0.7, this.rnd, hz.group);
    this.fissures.push({ meshes, f, W, age: 0 });
    if (this.fissures.length > 12) this.drop(this.fissures.shift());
    for (let k = 0; k < 14; k++) {
      const lat = (this.rnd() - 0.5) * W;
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat, y = hz.world.heightAt(x, z) + 0.3;
      const c = 0.36 + this.rnd() * 0.1;
      hz.fx.smoke.emit(tmp.set(x, y, z), new THREE.Vector3(this.rnd() - 0.5, 2 + this.rnd() * 3, this.rnd() - 0.5), 1.4, time, 3.5, c, c * 0.9, c * 0.8);
      hz.chips.throw(tmp.set(x, y, z), new THREE.Vector3((this.rnd() - 0.5) * 3, 3 + this.rnd() * 5, (this.rnd() - 0.5) * 3), 0.08 + this.rnd() * 0.18);
    }
  }

  post(dt, race, time) {
    const hz = this.hz;
    for (const fs of this.fissures) {
      fs.age += dt;
      if (fs.age < 10 && Math.random() < 0.06) {
        const lat = (Math.random() - 0.5) * fs.W, f = fs.f;
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat, c = 0.4;
        hz.fx.smoke.emit(tmp.set(x, hz.world.heightAt(x, z) + 0.3, z), new THREE.Vector3(0, 1, 0), 0.9, time, 3, c, c * 0.9, c * 0.8);
      }
    }
  }

  drop(fs) { for (const m of fs.meshes) { this.hz.group.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); } }

  get state() { return this.sites.map((s) => `${s.i}:${s.state}`).join(' '); }

  dispose() {
    for (const s of this.sites) s.dispose();
    for (const fs of this.fissures) this.drop(fs);
    this.pitMat.dispose();
  }
}
