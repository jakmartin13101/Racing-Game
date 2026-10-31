import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { earthMaterial } from '../../quake.js';
import { mulberry } from '../../world.js';
import { GRAV, G_GROUND, clamp, sstep, burnTruck, brokenEdge, makePuffs, Veil, heatGlow, disposeTree, UP, riverLevel } from './util.js';
import { Merger, mat4, canvasTex } from './build.js';

// The ocean entry. The coastal road runs out where the lava crossed it to the sea: its last stretch is a kicker
// off the broken end of the road, and every truck is thrown off it on a real ballistic arc over the new lava
// delta, through the steam where the lava meets the surf, onto the beach beyond. The arc is the bake's: the
// landing is cut to the design jump (speed, kicker angle, touchdown row), exactly as on Eruption's crater leap.
// Too slow off the kicker and the arc falls short, into the delta: the truck burns, out of the race.
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion();
const RIGHT = new THREE.Vector3(1, 0, 0);

export class Delta {
  constructor(hz, lava, uTime) {
    this.hz = hz;
    const t = this.t = hz.track, W = t.width, world = hz.world;
    this.lip = t.lip; this.land = t.land;
    this.J = t.leap || { v: 34, angle: 14, td: t.land + 20 };
    this.td = this.J.td;
    this.sea = world.data.seaLevel ?? 0;
    this.group = new THREE.Group();
    hz.group.add(this.group);
    this.log = [];
    this.rnd = mulberry(6044);
    // the delta's surface: just over the sea, or the river feeding it where that runs higher
    const fm0 = t.frame(Math.round((this.lip + this.land) / 2));
    const rl = riverLevel(world, fm0.x, fm0.z, 60);
    this.lavaTop = Math.min(Math.max(this.sea + 0.9, (rl ?? -1e9) + 0.2), t.at(this.land)[1] - 3);
    // what a short truck comes down into: the sheet, or a river standing above it where the sheet is capped
    this.burnTop = Math.max(this.lavaTop, (rl ?? -1e9) + 0.2);
    this.surface(lava);
    this.steam = makePuffs(hz, hz.lite ? 260 : 700, 'smoke');
    this.veil = new Veil(this.group, hz.M);
    this.veilK = 0;
    this.kicker();
    // the glow from the delta under the jump
    const fm = t.frame(Math.round((this.lip + this.land) / 2));
    this.mid = new THREE.Vector3(fm.x, this.lavaTop, fm.z);
    this.light = new THREE.PointLight(0xff6020, 0, 110, 1.6);
    this.light.position.set(fm.x, this.lavaTop + 8, fm.z);
    this.group.add(this.light);
    const span = Math.hypot(t.at(this.land)[0] - t.at(this.lip)[0], t.at(this.land)[2] - t.at(this.lip)[2]);
    this.focus = { x: fm.x, y: this.lavaTop, z: fm.z, r: span / 2 + 10 };
    this.leapt = 0;
  }

  // the delta: a fresh lava shelf filling the cut below the jump and running out into the sea, black crust split
  // by glowing seams, with molten tongues where it pours over its own front into the surf
  surface(lava) {
    const hz = this.hz, t = this.t, W = t.width, world = hz.world, sea = this.sea;
    const a = this.lip - 10, b = this.land + 6;
    const oe = world.data.oceanEntry;
    const fm = t.frame(Math.round((a + b) / 2));
    // reach further out on the sea side, towards the entry point
    const seaSide = oe ? Math.sign((oe.x - fm.x) * fm.nx + (oe.z - fm.z) * fm.nz) || 1 : 1;
    const reachSea = oe ? clamp(Math.abs((oe.x - fm.x) * fm.nx + (oe.z - fm.z) * fm.nz) + 40, 50, 180) : 60;
    const latA = -(seaSide < 0 ? reachSea : W / 2 + 40), latB = seaSide > 0 ? reachSea : W / 2 + 40;
    const NU = hz.lite ? 36 : 64, verts = [], uvs = [], keep = [], idx = [];
    const rows = [];
    for (let i = a; i <= b; i += 1) rows.push(i);
    rows.forEach((i) => {
      const f = t.frame(i);
      for (let k = 0; k <= NU; k++) {
        const lat = latA + (latB - latA) * k / NU;
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
        const h = world.heightAt(x, z);
        verts.push(x, Math.max(h + 0.3, this.lavaTop), z);
        uvs.push(i - a, lat);
        // only where the ground is down at sea level (or under it): the shelf, not the cliffs either side
        keep.push(1 - sstep(h, this.lavaTop + 2, this.lavaTop + 5));
      }
    });
    const nr = rows.length;
    for (let j = 0; j < nr - 1; j++) for (let k = 0; k < NU; k++) {
      const p = j * (NU + 1) + k, q = p + 1, c = p + NU + 1, d = c + 1;
      idx.push(p, c, q, q, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('keep', new THREE.Float32BufferAttribute(keep, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = lava.userData.makeMat(false);
    const base = mat.onBeforeCompile;
    const end = Math.max(Math.abs(latA), Math.abs(latB)).toFixed(1);
    mat.onBeforeCompile = (sh, r) => {
      base(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float keep; varying float vKeep;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKeep = keep;');
      sh.fragmentShader = sh.fragmentShader.replace('uniform float uTime;', 'uniform float uTime; varying float vKeep;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float dN = texture(tNoise, vW.xz / 17.0).r;
if (vKeep < 0.35 + (dN - 0.5) * 0.5) discard;
if (abs(vT.y) > ${end} - 8.0 + (dN - 0.5) * 16.0) discard;`)
        .replace('totalEmissiveRadiance += lavaEm;', `
// a delta shelf: mostly black, cooling crust; the seams glow and the front pours molten into the sea
float seam = smoothstep(0.62, 0.7, texture(tNoise, vW.xz / 7.0 + 0.3).g) * (1.0 - smoothstep(0.7, 0.78, texture(tNoise, vW.xz / 7.0 + 0.3).g));
float front = smoothstep(${(this.lavaTop + 0.3).toFixed(2)}, ${(this.lavaTop + 0.05).toFixed(2)}, vW.y) * (1.0 - smoothstep(0.35, 0.6, vKeep - 0.4));
diffuseColor.rgb *= 0.7;
totalEmissiveRadiance += lavaEm * 0.75 + vec3(2.4, 0.7, 0.12) * seam * (0.6 + 0.4 * sin(uTime * 1.3 + dN * 12.0)) + vec3(2.0, 0.6, 0.1) * front;`);
    };
    mat.customProgramCacheKey = () => 'ahi-delta';
    this.surf = new THREE.Mesh(geo, mat);
    this.group.add(this.surf);
  }

  // the end of the coastal road: the kicker, closed off with barriers and warning boards (nobody told the racers),
  // its broken end hanging over the delta; and the far edge of the cut where the beach begins
  kicker() {
    const hz = this.hz, t = this.t, W = t.width, M = hz.M, rnd = this.rnd;
    const earth = heatGlow(earthMaterial(M), { value: this.lavaTop + 2 }, 1.2, 'delta');
    earth.side = THREE.DoubleSide;
    this.mats = [earth];
    this.group.add(brokenEdge(hz, earth, this.lip, 1, this.lavaTop, W / 2 + 1.6, 77));
    // the landing side of the cut (the edge of the new shelf against the old beach)
    let lb = this.land;
    while (lb < this.land + 15 && t.c[t.wrap(lb)][4]) lb++;
    this.group.add(brokenEdge(hz, earth, lb, -1, this.lavaTop, W / 2 + 3, 79));
    // jersey barriers along both verges of the last stretch, amber lamps flashing on every third
    const prof = new THREE.Shape();
    prof.moveTo(-0.3, 0); prof.lineTo(0.3, 0); prof.lineTo(0.3, 0.08); prof.lineTo(0.12, 0.28); prof.lineTo(0.1, 0.82); prof.lineTo(-0.1, 0.82); prof.lineTo(-0.12, 0.28); prof.lineTo(-0.3, 0.08);
    const blk = new THREE.ExtrudeGeometry(prof, { depth: 1.95, bevelEnabled: false }).translate(0, 0, -0.975);
    const mg = new Merger();
    const lampG = new Merger();
    const lamp = new THREE.SphereGeometry(0.09, 8, 6);
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const run = Math.min(90, this.lip - (t.runup ?? this.lip - 140));
    for (let s = 0, k = 0; s < run; s += 2, k++) {
      const i = this.lip - 2 - s;
      const f = t.frame(i);
      for (const side of [-1, 1]) {
        if (k % 9 === 4 && side > 0) continue; // a gap where one has been shoved aside
        const lat = side * (W / 2 + 0.45);
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat, y = hz.world.heightAt(x, z);
        const yaw = f.yaw + (rnd() - 0.5) * 0.06;
        mg.add(blk, mat4(tmp.set(x, y - 0.03, z), yaw));
        const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
        hz.phys.createCollider(RAPIER.ColliderDesc.cuboid(0.28, 0.42, 0.97).setTranslation(x, y + 0.4, z).setRotation(q).setFriction(0.4).setCollisionGroups(G_GROUND), this.body);
        if (k % 3 === 0) lampG.add(lamp, mat4(tmp.set(x, y + 0.92, z)));
      }
    }
    const conc = new THREE.MeshStandardMaterial({ color: 0xa8a29a, roughness: 0.9 });
    const stripes = canvasTex(64, 64, (g) => { g.fillStyle = '#c8c2b8'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c23a1a'; for (let k = -64; k < 64; k += 16) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 8, 64); g.lineTo(k + 72, 0); g.lineTo(k + 64, 0); g.fill(); } });
    stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
    conc.map = stripes;
    const bm = new THREE.Mesh(mg.build(), conc);
    // box-projected uvs for the stripes
    const pos = bm.geometry.attributes.position, uv = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++) { uv[k * 2] = (pos.getX(k) + pos.getZ(k)) * 0.8; uv[k * 2 + 1] = pos.getY(k) * 0.8; }
    bm.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    bm.castShadow = bm.receiveShadow = true;
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: new THREE.Color(3, 1.4, 0.1), emissiveIntensity: 1 });
    const lm = new THREE.Mesh(lampG.build(), this.lampMat);
    this.group.add(bm, lm);
    this.mats.push(conc, this.lampMat);
    blk.dispose(); lamp.dispose();
    // ROAD CLOSED boards at the start of the run-in and chevrons at the broken end
    const board = canvasTex(512, 256, (g) => {
      g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = '#c4200f'; g.lineWidth = 22; g.strokeRect(14, 14, 484, 228);
      g.fillStyle = '#c4200f'; g.font = 'bold 92px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('ROAD', 256, 112);
      g.fillText('CLOSED', 256, 204);
      for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(40,30,20,${Math.random() * 0.2})`; g.fillRect(Math.random() * 512, Math.random() * 256, 1 + Math.random() * 6, 1 + Math.random() * 3); }
    });
    const chev = canvasTex(256, 128, (g) => {
      g.fillStyle = '#ffb41f'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#15110e';
      for (let k = 0; k < 2; k++) { const x = 30 + k * 100; g.beginPath(); g.moveTo(x, 10); g.lineTo(x + 50, 64); g.lineTo(x, 118); g.lineTo(x + 28, 118); g.lineTo(x + 78, 64); g.lineTo(x + 28, 10); g.fill(); }
    });
    const steel = new THREE.MeshStandardMaterial({ color: 0x55524e, roughness: 0.5, metalness: 0.8 });
    const bMat = new THREE.MeshStandardMaterial({ map: board, roughness: 0.7 });
    const cMat = new THREE.MeshStandardMaterial({ map: chev, roughness: 0.6 });
    this.mats.push(steel, bMat, cMat);
    const sign = (i, side, mat, w, h, ht, lean = 0) => {
      const f = t.frame(i), lat = side * (W / 2 + 1.8);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat, y = hz.world.heightAt(x, z);
      const g = new THREE.Group();
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, ht, 6), steel); p.position.set(s * w * 0.35, ht / 2, 0); g.add(p); }
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      pl.position.set(0, ht - h / 2, 0.05);
      g.add(pl);
      g.position.set(x, y, z);
      g.rotation.set(0, f.yaw + Math.PI, lean);
      g.traverse((o) => { o.castShadow = true; });
      this.group.add(g);
    };
    const i0 = this.lip - run;
    sign(i0, -1, bMat, 1.6, 0.8, 1.9, 0.05); sign(i0 + 3, 1, bMat, 1.6, 0.8, 1.9, -0.12);
    sign(this.lip - 3, -1, cMat, 1.0, 0.5, 1.3); sign(this.lip - 3, 1, cMat, 1.0, 0.5, 1.3, 0.3);
  }

  pre(dt, race, time) {
    const t = this.t;
    for (const st of race.cars) {
      if (!st.leap && !st.leapt && st.i >= this.lip - 3 && st.i <= this.lip + 8 && st.v.speed() > 7 && !st.v.totaled && !st.finished) this.launch(st, race, time);
    }
    this.lampMat.emissiveIntensity = Math.sin(time * 6) > 0 ? 1 : 0.05;
  }

  // off the kicker. A truck at (or near) the design speed flies the design arc: the kicker angle, gravity, and
  // a touchdown tangent to the landing; well short of it and it flies its own, shorter arc into the delta
  launch(st, race, time) {
    const t = this.t, b = st.v.body, p = b.translation(), J = this.J;
    const f0 = t.frame(this.lip);
    const lat = clamp((p.x - f0.x) * f0.nx + (p.z - f0.z) * f0.nz, -4, 4);
    const from = new THREE.Vector3(p.x, p.y, p.z);
    const ang = THREE.MathUtils.degToRad(J.angle);
    const speed = st.v.speed();
    const short = speed < J.v * 0.62;
    let to, T, vx, vz, vy;
    if (short) {
      const vh = speed * Math.cos(ang);
      vy = speed * Math.sin(ang);
      vx = f0.tx * vh; vz = f0.tz * vh;
      const dy = from.y - this.lavaTop;
      T = (vy + Math.sqrt(vy * vy + 2 * GRAV * Math.max(0.5, dy))) / GRAV;
      to = new THREE.Vector3(from.x + vx * T, this.lavaTop, from.z + vz * T);
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
    st.leap = { t: 0, T, from, to, short, yaw: Math.atan2(vx, vz), apex: from.y + vy * vy / (2 * GRAV), delta: true };
    st.v.ghost = true;
    this.leapt++;
    this.log.push(`${st.v.name.slice(0, 3)}${short ? 'S' : ''}${speed.toFixed(0)}`);
    this.hz.events.push({ type: 'leap', st, leap: st.leap, focus: this.focus });
    this.hz.fx.burst(from.clone().setY(from.y - 0.5), time, 1.0);
    // the kicker's broken end sheds stones as each truck leaves it
    for (let k = 0; k < 8; k++) this.hz.chips.throw(tmp.set(from.x + (Math.random() - 0.5) * 3, from.y - 0.6, from.z + (Math.random() - 0.5) * 3), tmp2.set(vx * 0.3 + (Math.random() - 0.5) * 3, Math.random() * 2, vz * 0.3 + (Math.random() - 0.5) * 3), 0.08 + Math.random() * 0.15);
  }

  post(dt, race, time) {
    const hz = this.hz, pl = race.player;
    for (const st of race.cars) {
      const L = st.leap;
      if (st.landT > 0) {
        st.landT -= dt;
        if (st.landT <= 0) st.v.ghost = false;
        else if (st.leapt) { const w = st.v.body.angvel(), k = Math.exp(-dt * 12); st.v.body.setAngvel({ x: w.x * k, y: w.y, z: w.z * k }, true); }
      }
      if (!L || !L.delta) continue;
      L.t += dt;
      const b = st.v.body, p = b.translation();
      const rem = L.T - L.t;
      if (L.short) {
        // into the delta: the truck lands in the lava and burns
        const floor = Math.max(hz.world.heightAt(p.x, p.z) + 0.3, this.burnTop);
        if (p.y < floor + 1.2 || L.t > L.T + 2.5) {
          hz.fx.burst(new THREE.Vector3(p.x, floor + 0.5, p.z), time, 1.6);
          this.endLeap(st, false);
          burnTruck(hz, st, race, time, this.log);
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
      // through the steam: it streams off the truck as it punches through
      const u = L.t / L.T;
      if (u > 0.25 && u < 0.75 && Math.random() < (st.isPlayer ? 0.9 : 0.3)) {
        const c = 0.8 + Math.random() * 0.12;
        this.steam.emit(tmp.set(p.x + (Math.random() - 0.5) * 4, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 4), tmp2.set(-v.x * 0.1, 1 + Math.random(), -v.z * 0.1), 0.8 + Math.random() * 0.8, time, 2.5, c, c, c * 1.02);
      }
      if (L.t > L.T * 0.6 && st.v.contacts >= 2) this.endLeap(st, true);
    }
    // the player's view goes white in the thick of the steam, mid-flight
    let goal = 0;
    const L = pl.leap;
    if (L?.delta) { const u = L.t / L.T; goal = (L.short ? 0.55 : 0.9) * sstep(u, 0.18, 0.36) * (1 - sstep(u, 0.58, 0.78)); }
    this.veilK += (goal - this.veilK) * Math.min(1, dt * (goal > this.veilK ? 7 : 4));
    this.veil.set(this.veilK, time);
    // the beach after the landing is soft sand: it scrubs the speed off a truck that lands hot
    for (const st of race.cars) {
      if (st.i < this.td - 6 || st.i > this.td + 70 || st.v.contacts < 2 || st.leap) continue;
      const v = st.v.body.linvel(), s = Math.hypot(v.x, v.z);
      if (s < 24) continue;
      const k = -st.v.body.mass() * Math.min(9, (s - 24) * 0.5 + 3) * dt / s;
      st.v.body.applyImpulse({ x: v.x * k, y: 0, z: v.z * k }, true);
      if (Math.random() < 0.5) {
        const p = st.v.body.translation(), c = 0.18;
        hz.fx.smoke.emit(tmp.set(p.x, p.y - 0.5, p.z), tmp2.set(-v.x * 0.12 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, -v.z * 0.12 + (Math.random() - 0.5) * 3), 1.3, time, 2.2, c, c * 0.95, c * 0.9);
      }
    }
    // steam boiling up off the delta across the jump, the glow under it
    const near = Math.abs(pl.i - this.lip) < 450 || (pl.finished && pl.i < this.land + 300);
    this.light.intensity = near ? 900 * (0.85 + 0.15 * Math.sin(time * 1.9) * Math.sin(time * 0.6)) : 0;
    if (near) {
      const t = this.t, n = this.hz.lite ? 2 : 4;
      for (let k = 0; k < n; k++) {
        if (Math.random() > dt * 60 * 0.2) continue;
        const i = this.lip + Math.floor(Math.random() * (this.land - this.lip));
        const f = t.frame(i), lat = (Math.random() - 0.5) * (t.width + 30);
        const c = 0.78 + Math.random() * 0.14;
        this.steam.emit(tmp.set(f.x + f.nx * lat, this.burnTop + 0.5, f.z + f.nz * lat), tmp2.set((Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2), 2.6 + Math.random() * 2, time, 2.6 + Math.random() * 0.6, c, c, c * 1.02);
      }
    }
    this.steam.update(time);
  }

  endLeap(st, landed) {
    st.leap = null;
    st.leapt = true;
    st.landT = landed ? 1.2 : 0.01;
    this.hz.events.push({ type: 'landed', st });
  }

  dispose() {
    this.hz.phys.removeRigidBody(this.body);
    this.veil.dispose();
    this.hz.group.remove(this.steam.mesh); this.steam.mesh.geometry.dispose(); this.steam.mat.dispose();
    disposeTree(this.group);
  }
}

// The finish on the beach: a Hawaiian arch of carved timber posts and lashed log beams under a thatch fringe,
// the banner slung beneath, pennants strung out to the verges, tiki torches burning along the run-in and a
// chequered line across the sand.
export class FinishArch {
  constructor(hz) {
    this.hz = hz;
    const t = hz.track, W = t.width, world = hz.world, rnd = mulberry(808);
    const fi = t.line + t.finishRel;
    const f = this.f = t.frame(fi);
    this.group = new THREE.Group();
    hz.group.add(this.group);
    const span = W + 11, H = 9.6;
    const y0 = world.heightAt(f.x, f.z);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.8 });
    const rope = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 1 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x2c2826, roughness: 0.95 });
    this.mats = [wood, dark, rope, stone];
    // the grain: bark-carved posts read better with a little noise in their colour
    wood.onBeforeCompile = (sh) => {
      sh.uniforms.tNoise = { value: hz.M.noise };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vO;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvO = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vO; uniform sampler2D tNoise;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 0.75 + 0.5 * texture2D(tNoise, vec2(atan(vO.x, vO.z) * 0.3, vO.y * 0.05)).r;');
    };
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const yaw = f.yaw;
    const put = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz, 'YXZ');
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    const tops = [];
    for (const s of [-1, 1]) {
      const x = f.x + f.nx * s * span / 2, z = f.z + f.nz * s * span / 2, yb = world.heightAt(x, z);
      const h = H + y0 - yb;
      // stone plinth, the carved post, lashings, and a carved head near the top
      put(new THREE.CylinderGeometry(0.95, 1.15, 0.9, 9), stone, x, yb + 0.3, z);
      const post = new THREE.CylinderGeometry(0.42, 0.52, h, 14, 8);
      const pp = post.attributes.position;
      for (let k = 0; k < pp.count; k++) {
        const y = pp.getY(k) / h + 0.5, a = Math.atan2(pp.getZ(k), pp.getX(k));
        // carved bands and a face's brow and mouth grooves
        const groove = (Math.abs(Math.sin(y * 31)) < 0.25 ? 0.9 : 1) * (y > 0.72 && y < 0.9 && Math.cos(a - yaw) > 0 ? 1 + 0.08 * Math.sin(y * 70) : 1);
        pp.setX(k, pp.getX(k) * groove); pp.setZ(k, pp.getZ(k) * groove);
      }
      post.computeVertexNormals();
      put(post, wood, x, yb + h / 2, z, 0, yaw);
      for (const hy of [0.25, 0.5, 0.78]) put(new THREE.TorusGeometry(0.5, 0.06, 6, 16), rope, x, yb + h * hy, z, Math.PI / 2, 0);
      put(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, x, yb + h, z);
      hz.phys.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.55).setTranslation(x, yb + h / 2, z).setCollisionGroups(G_GROUND), this.body);
      tops.push(new THREE.Vector3(x, yb + h, z));
    }
    // two lashed log beams, the upper one longer with upswept ends
    const mid = tops[0].clone().add(tops[1]).multiplyScalar(0.5);
    const beamYaw = Math.atan2(-f.nz, f.nx);
    put(new THREE.CylinderGeometry(0.34, 0.38, span + 1.4, 12), wood, mid.x, mid.y - 0.7, mid.z, 0, beamYaw, Math.PI / 2).rotation.set(0, beamYaw, Math.PI / 2, 'YXZ');
    const upper = new THREE.CylinderGeometry(0.3, 0.3, span + 4, 12, 16);
    const up = upper.attributes.position;
    for (let k = 0; k < up.count; k++) { const y = up.getY(k) / (span + 4) * 2; up.setX(k, up.getX(k) + Math.pow(Math.abs(y), 4) * 1.1); }
    upper.computeVertexNormals();
    put(upper, wood, mid.x, mid.y + 0.15, mid.z, 0, beamYaw, Math.PI / 2).rotation.set(0, beamYaw, Math.PI / 2, 'YXZ');
    // thatch fringe hanging off the top beam
    const thatch = canvasTex(256, 128, (g) => {
      g.clearRect(0, 0, 256, 128);
      for (let k = 0; k < 420; k++) {
        const x = rnd() * 256, L = 60 + rnd() * 68, c = 120 + rnd() * 70;
        g.strokeStyle = `rgba(${c},${c * 0.82 | 0},${c * 0.5 | 0},${0.7 + rnd() * 0.3})`; g.lineWidth = 1 + rnd() * 2;
        g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (rnd() - 0.5) * 10, L * 0.6, x + (rnd() - 0.5) * 16, L); g.stroke();
      }
    });
    const thM = new THREE.MeshStandardMaterial({ map: thatch, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 });
    this.mats.push(thM);
    for (const d of [-0.32, 0.32]) {
      const pl = put(new THREE.PlaneGeometry(span + 2.5, 1.5, 16, 1), thM, mid.x + f.tx * d, mid.y - 0.3, mid.z + f.tz * d);
      pl.rotation.set(-d * 0.5, yaw + Math.PI, 0, 'YXZ');
    }
    // the banner
    const ban = canvasTex(1024, 192, (g) => {
      g.fillStyle = '#14100d'; g.fillRect(0, 0, 1024, 192);
      for (let k = 0; k < 64; k++) for (let j = 0; j < 2; j++) { g.fillStyle = (k + j) % 2 ? '#f2ede2' : '#14100d'; g.fillRect(k * 16, j * 16, 16, 16); g.fillRect(k * 16, 160 + j * 16, 16, 16); }
      g.fillStyle = '#d6452a'; g.fillRect(0, 34, 1024, 6); g.fillRect(0, 152, 1024, 6);
      g.fillStyle = '#ffb41f'; g.font = 'bold 86px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('FINISH', 512, 88);
      g.fillStyle = '#f2ede2'; g.font = 'bold 30px Arial, sans-serif'; g.fillText('AHI I KE KAI  ·  FIRE TO THE SEA', 512, 136);
      // stylised flame-and-wave motif either side
      for (const sx of [110, 914]) {
        g.fillStyle = '#d6452a'; g.beginPath(); g.moveTo(sx - 50, 140); g.quadraticCurveTo(sx - 40, 70, sx, 46); g.quadraticCurveTo(sx - 10, 90, sx + 20, 110); g.quadraticCurveTo(sx + 30, 80, sx + 50, 140); g.fill();
        g.strokeStyle = '#3aa0b8'; g.lineWidth = 7; g.beginPath(); for (let x = -60; x <= 60; x += 4) g.lineTo(sx + x, 146 + Math.sin(x * 0.12) * 5); g.stroke();
      }
    });
    const banM = new THREE.MeshStandardMaterial({ map: ban, roughness: 0.85, side: THREE.DoubleSide });
    this.mats.push(banM);
    const bannerG = new THREE.PlaneGeometry(span - 2.5, (span - 2.5) * 192 / 1024, 20, 2);
    const bp = bannerG.attributes.position;
    for (let k = 0; k < bp.count; k++) bp.setZ(k, Math.sin(bp.getX(k) * 0.4) * 0.08);
    bannerG.computeVertexNormals();
    const banner = put(bannerG, banM, mid.x, mid.y - 2.1, mid.z, 0, yaw + Math.PI);
    banner.rotation.set(0, yaw + Math.PI, 0);
    // pennant strings from the post tops out to poles on the verges
    const flagM = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
    this.mats.push(flagM);
    const fl = new Merger(['r', 'g', 'b']);
    const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.55, 0], 3));
    tri.computeVertexNormals();
    const cols = [[0.85, 0.22, 0.12], [1, 0.72, 0.12], [0.12, 0.55, 0.32], [0.95, 0.93, 0.88], [0.2, 0.55, 0.7]];
    const lineG = new Merger();
    for (const s of [-1, 1]) for (const along of [-14, 14]) {
      const top = tops[s < 0 ? 0 : 1];
      const px = f.x + f.nx * s * (span / 2 + 4) + f.tx * along, pz = f.z + f.nz * s * (span / 2 + 4) + f.tz * along;
      const py = world.heightAt(px, pz);
      lineG.add(new THREE.CylinderGeometry(0.07, 0.09, 6.5, 6), mat4(tmp.set(px, py + 3.25, pz)));
      const a = top.clone().add(tmp2.set(0, -0.4, 0)), b = new THREE.Vector3(px, py + 6.3, pz);
      for (let k = 1; k < 14; k++) {
        const u = k / 14, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 1.2;
        const c = cols[(k + (s > 0 ? 2 : 0)) % cols.length];
        fl.add(tri, mat4(p, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, 0, (rnd() - 0.5) * 0.3), { r: c[0], g: c[1], b: c[2] });
      }
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, k) => { const u = k / 8, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 1.2; return p; }));
      lineG.add(new THREE.TubeGeometry(curve, 12, 0.012, 4), new THREE.Matrix4());
    }
    const fg = fl.build();
    const cr = fg.attributes.r.array, cg = fg.attributes.g.array, cb = fg.attributes.b.array, col = new Float32Array(cr.length * 3);
    for (let k = 0; k < cr.length; k++) { col[k * 3] = cr[k]; col[k * 3 + 1] = cg[k]; col[k * 3 + 2] = cb[k]; }
    fg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const flags = new THREE.Mesh(fg, flagM); flags.castShadow = true;
    const lines = new THREE.Mesh(lineG.build(), dark); lines.castShadow = true;
    this.group.add(flags, lines);
    tri.dispose();
    // tiki torches along the run-in, burning
    this.torches = [];
    const torchG = new Merger();
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
      const i = fi - 12 - k * 16 + (s > 0 ? 8 : 0);
      const ff = t.frame(i), lat = s * (W / 2 + 2.2);
      const x = ff.x + ff.nx * lat, z = ff.z + ff.nz * lat, y = world.heightAt(x, z);
      torchG.add(new THREE.CylinderGeometry(0.05, 0.065, 2.6, 6), mat4(tmp.set(x, y + 1.3, z)));
      torchG.add(new THREE.CylinderGeometry(0.13, 0.09, 0.35, 8), mat4(tmp.set(x, y + 2.7, z)));
      this.torches.push(new THREE.Vector3(x, y + 2.95, z));
    }
    const tm = new THREE.Mesh(torchG.build(), dark); tm.castShadow = true;
    this.group.add(tm);
    this.flames = makePuffs(hz, hz.lite ? 60 : 160, 'flame');
    this.flames.mat.uniforms.tTex.value = hz.fx.flame.mat.uniforms.tTex.value;
    this.light = new THREE.PointLight(0xffa040, 0, 30, 2);
    this.light.position.set(f.x, y0 + 3, f.z);
    this.group.add(this.light);
    // the chequered line across the sand
    const chk = canvasTex(256, 32, (g) => { for (let k = 0; k < 16; k++) for (let j = 0; j < 2; j++) { g.fillStyle = (k + j) % 2 ? '#efe9dc' : '#16120f'; g.fillRect(k * 16, j * 16, 16, 16); } });
    const lg = new THREE.PlaneGeometry(1, 1, 16, 1).rotateX(-Math.PI / 2);
    const lp = lg.attributes.position;
    for (let k = 0; k < lp.count; k++) {
      const lat = lp.getX(k) * (W + 1), al = lp.getZ(k) * 1.6;
      const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
      lp.setXYZ(k, x, world.heightAt(x, z) + 0.16, z);
    }
    const lineM = new THREE.MeshStandardMaterial({ map: chk, roughness: 0.9, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mats.push(lineM);
    const fline = new THREE.Mesh(lg, lineM); fline.renderOrder = 2; fline.receiveShadow = true;
    this.group.add(fline);
    this.fi = fi;
  }

  update(dt, race, time) {
    const pl = race.player;
    const near = pl.i > this.fi - 400;
    this.light.intensity = near ? 40 * (0.85 + 0.15 * Math.sin(time * 9)) : 0;
    if (near) {
      for (const p of this.torches) if (Math.random() < 0.6) this.flames.emit(tmp.set(p.x + (Math.random() - 0.5) * 0.15, p.y, p.z + (Math.random() - 0.5) * 0.15), tmp2.set((Math.random() - 0.5) * 0.4, 1 + Math.random(), (Math.random() - 0.5) * 0.4), 0.35 + Math.random() * 0.25, time, 0.5 + Math.random() * 0.3);
    }
    this.flames.update(time);
  }

  dispose() {
    this.hz.phys.removeRigidBody(this.body);
    this.hz.group.remove(this.flames.mesh); this.flames.mesh.geometry.dispose(); this.flames.mat.dispose();
    disposeTree(this.group);
  }
}
