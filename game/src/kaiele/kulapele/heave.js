import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { crackCanvas, Chips } from '../../quake.js';
import { G_GROUND, tmp, clamp, smooth, mulberry, canvasTex } from './util.js';
import { surfaceMaterial } from './surfaces.js';

// The old highway breaking up, from lap 2. Each heave is a slab of the road itself, asphalt, paint and all, torn
// free along its cracks and wrenched up on its gravel base: a single slab tipped up into a ramp with a torn lip,
// or two slabs shoved together into a pressure ridge across the road. Chunks of asphalt and stones fly, dust
// pours out of the cracks, and the slabs stay up for the rest of the race (kinematic colliders).

const ASPH_T = 0.13, BASE_T = 0.3;
// ?kp=heave sets the slabs off on lap 1, for screenshots
const DEV_HEAVE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('kp') === 'heave';

// the torn sides of a slab: asphalt over the crushed-rock road base over soil, the bottom edge ragged
function skirtMaterial(M) {
  const m = new THREE.MeshStandardMaterial({ map: M.sco.a, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: M.noise };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tNoise;')
      .replace('#include <map_fragment>', `
vec4 te = texture(map, vMapUv);
float sp = texture(tNoise, vMapUv * 3.7).r;
diffuseColor.rgb *= mix(vec3(dot(te.rgb, vec3(0.33))), te.rgb, 0.4) * (0.6 + sp * 0.8) * 1.6;`);
  };
  m.customProgramCacheKey = () => 'kp-skirt';
  return m;
}

// the hole a lifted slab leaves: crushed base rock, damp and dark, with soil showing through
function pitTexture(seed) {
  const r = mulberry(seed);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3d3934'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2600; k++) {
      const s = 1 + r() * r() * 7, c = 30 + r() * 70;
      g.fillStyle = `rgb(${c + 6},${c + 3},${c})`;
      g.fillRect(r() * w, r() * h, s, s * (0.6 + r() * 0.6));
    }
    for (let k = 0; k < 14; k++) {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      grd.addColorStop(0, 'rgba(40,28,20,0.7)'); grd.addColorStop(1, 'rgba(40,28,20,0)');
      g.save(); g.translate(r() * w, r() * h); g.scale(20 + r() * 40, 12 + r() * 25); g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, 6.3); g.fill(); g.restore();
    }
    // the rim, where the slab tore away, darker
    g.strokeStyle = 'rgba(15,12,10,0.8)'; g.lineWidth = 14; g.strokeRect(0, 0, w, h);
  });
}

// One slab: w across, l along; top at local y = 0, centred on the origin. along0 / lat0 place the asphalt
// shader's markings where they were on the road.
function slabMesh(kp, w, l, seed, along0, lat0, mats) {
  const rnd = mulberry(seed);
  const NX = 12, NZ = 8;
  const P = [], UV = [], KP = [], SH = [], idx = [];
  const ring = [];
  const pts = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NZ;
    let x = (u - 0.5) * w, z = (v - 0.5) * l, y = 0;
    const edge = i === 0 || i === NX || j === 0 || j === NZ;
    if (edge) {
      const bite = rnd() * 0.45;
      if (i === 0) x += bite; else if (i === NX) x -= bite;
      if (j === 0) z += bite * 0.7; else if (j === NZ) z -= bite;
      y -= rnd() * 0.04;
    } else y += (rnd() - 0.5) * 0.025;
    P.push(x, y, z);
    UV.push(along0 + z, lat0 - x);
    KP.push(1, -30, -30, 1);
    SH.push(1);
    pts.push([x, y, z]);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  top.setAttribute('kp', new THREE.Float32BufferAttribute(KP, 4));
  top.setAttribute('shade', new THREE.Float32BufferAttribute(SH, 1));
  top.setIndex(idx);
  top.computeVertexNormals();
  const grp = new THREE.Group();
  const tm = new THREE.Mesh(top, mats.top);
  tm.castShadow = true; tm.receiveShadow = true;
  grp.add(tm);
  // outline, then the skirt in bands: asphalt, road base, soil (ragged)
  for (let i = 0; i <= NX; i++) ring.push(i);
  for (let j = 1; j <= NZ; j++) ring.push(j * (NX + 1) + NX);
  for (let i = NX - 1; i >= 0; i--) ring.push(NZ * (NX + 1) + i);
  for (let j = NZ - 1; j >= 0; j--) ring.push(j * (NX + 1));
  const bands = [[0, [0.05, 0.05, 0.055]], [ASPH_T, [0.06, 0.058, 0.06]], [ASPH_T + 0.02, [0.42, 0.4, 0.37]], [ASPH_T + BASE_T, [0.36, 0.33, 0.3]], [ASPH_T + BASE_T + 0.03, [0.2, 0.14, 0.1]], [-1, [0.14, 0.1, 0.07]]];
  const SP = [], SC = [], SUV = [], SI = [];
  const B = bands.length;
  let per = 0;
  ring.forEach((k, r) => {
    const [x, y, z] = pts[k];
    if (r) { const [px, , pz] = pts[ring[r - 1]]; per += Math.hypot(x - px, z - pz); }
    for (const [d, c] of bands) {
      const dd = d < 0 ? ASPH_T + BASE_T + 0.2 + rnd() * 0.45 : d + (d > ASPH_T ? (rnd() - 0.5) * 0.04 : 0);
      const sh = d < 0 ? 0.9 : 1;
      SP.push(x * sh, y - dd, z * sh);
      SC.push(...c);
      SUV.push(per / 1.6, dd / 1.6);
    }
  });
  for (let r = 0; r < ring.length - 1; r++) for (let b = 0; b < B - 1; b++) {
    const a = r * B + b, c = a + B;
    SI.push(a, a + 1, c, c, a + 1, c + 1);
  }
  const sk = new THREE.BufferGeometry();
  sk.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
  sk.setAttribute('color', new THREE.Float32BufferAttribute(SC, 3));
  sk.setAttribute('uv', new THREE.Float32BufferAttribute(SUV, 2));
  sk.setIndex(SI);
  sk.computeVertexNormals();
  const skm = new THREE.Mesh(sk, mats.skirt);
  skm.castShadow = true; skm.receiveShadow = true;
  grp.add(skm);
  // underside: soil clinging to the base course
  const bot = top.clone();
  const bp = bot.attributes.position;
  for (let k = 0; k < bp.count; k++) bp.setY(k, bp.getY(k) - ASPH_T - BASE_T - 0.25 - rnd() * 0.2);
  bot.setIndex(idx.slice().reverse());
  bot.deleteAttribute('kp'); bot.deleteAttribute('shade');
  const cols = [];
  for (let k = 0; k < bp.count; k++) cols.push(0.18, 0.13, 0.1);
  bot.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  bot.computeVertexNormals();
  grp.add(new THREE.Mesh(bot, mats.skirt));
  return grp;
}

export class Heaves {
  constructor(kp) {
    this.kp = kp;
    const hz = kp.hz, t = kp.t;
    this.list = [];
    const top = surfaceMaterial(hz.M, 'asphalt', t.width, { tex: kp.tex });
    top.transparent = false; top.depthWrite = true; top.polygonOffset = false; top.side = THREE.FrontSide;
    top.customProgramCacheKey = () => 'kp-surf-asphalt-solid';
    this.mats = { top, skirt: skirtMaterial(hz.M) };
    this.chunkMat = new THREE.MeshStandardMaterial({ color: 0x1d1c1b, roughness: 0.9 });
    this.chunks = new Chips(kp.world, kp.group, this.chunkMat, hz.lite ? 50 : 120);
    this.pitTex = pitTexture(5);
    const rows = t.slabs || [];
    const kinds = ['kerb', 'ramp', 'ridge', 'kerb', 'ramp', 'ridge'];
    rows.forEach((i, k) => this.list.push(new Heave(this, i, kinds[k % kinds.length], 300 + k * 17)));
  }

  pre(dt, race, time) {
    // the leader starting lap two breaks the road; each slab goes off just ahead of the player or the leader
    const ready = race.cars.some((c) => c.lap >= 1) || DEV_HEAVE;
    for (const h of this.list) h.pre(dt, race, time, ready);
  }

  post(dt) { this.chunks.update(dt); }

  debug() { return { heaves: this.list.map((h) => `${h.i0}${h.kind[0]}:${h.state}`).join(' ') }; }

  dispose() { for (const h of this.list) h.dispose(); }
}

class Heave {
  constructor(H, i0, kind, seed) {
    const kp = H.kp, hz = kp.hz, t = kp.t, world = kp.world;
    this.H = H; this.kp = kp; this.i0 = i0; this.kind = kind;
    this.rnd = mulberry(seed);
    this.state = 'idle';
    this.T = 0;
    this.rise = kind === 'ramp' ? 0.9 : 0.7;
    const W = t.width;
    const f = t.frame(i0);
    this.f = f;
    // slabs: [along offset of the centre, length, pitch (rad), pivot at the back (1) or the front (-1)]
    const skew = (this.rnd() - 0.5) * 0.22;
    this.skew = skew;
    const shift = (this.rnd() - 0.5) * 0.5;
    if (kind === 'ramp') {
      // tipped up on its back edge: a ramp with a torn lip and a drop after it
      const L = 7.5 + this.rnd() * 2;
      this.parts = [{ al: 0, L, w: W + 0.8, pitch: 0.13 + this.rnd() * 0.03, piv: 1, lat: shift }];
    } else if (kind === 'kerb') {
      // shoved up on its leading edge: a broken kerb of road across the line, its torn face (asphalt, road base,
      // soil) towards the oncoming trucks, skewed across the road
      const L = 5 + this.rnd() * 1.5;
      this.skew = (this.rnd() < 0.5 ? -1 : 1) * (0.18 + this.rnd() * 0.1);
      this.parts = [{ al: 0, L, w: W + 1.2, pitch: -Math.asin((0.32 + this.rnd() * 0.08) / L), piv: -1, lat: shift }];
    } else {
      const L = 4.5 + this.rnd() * 1.2, L2 = 4 + this.rnd() * 1.2;
      const ph = 0.6 + this.rnd() * 0.15;
      this.parts = [{ al: -L / 2 - 0.05, L, w: W + 0.8, pitch: Math.asin(ph / L), piv: 1, lat: shift },
        { al: L2 / 2 + 0.05, L: L2, w: W + 0.8, pitch: -Math.asin(ph / L2), piv: -1, lat: -shift * 0.6 }];
    }
    const S = kp.S;
    for (const p of this.parts) {
      p.mesh = slabMesh(kp, p.w, p.L, seed + p.al * 10, (S[i0] ?? i0) + p.al, p.lat, H.mats);
      p.mesh.visible = false;
      kp.group.add(p.mesh);
      p.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(f.x, -500, f.z));
      // the collider's top face is the slab's top
      const th = (ASPH_T + BASE_T) / 2;
      hz.phys.createCollider(RAPIER.ColliderDesc.cuboid(p.w / 2 - 0.2, th, p.L / 2 - 0.05).setTranslation(0, -th, 0).setFriction(1).setCollisionGroups(G_GROUND), p.body);
    }
    const sk = Math.abs(Math.sin(this.skew)) * (W + 1.2) / 2;
    const a0 = Math.min(...this.parts.map((p) => p.al - p.L / 2)) - sk, a1 = Math.max(...this.parts.map((p) => p.al + p.L / 2)) + sk;
    this.a0 = a0; this.a1 = a1;
    // cracks across the road round it: faint before it goes (the road is already failing there), then torn open
    const span = a1 - a0 + 14;
    const crk = crackCanvas(mulberry(seed + 1), 512, 512, { main: 5, branches: 24, border: false, width: 3.5 });
    this.crackMat = new THREE.MeshBasicMaterial({ map: crk, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const cg = new THREE.PlaneGeometry(1, 1, 10, 10).rotateX(-Math.PI / 2);
    const cp = cg.attributes.position;
    const mid = (a0 + a1) / 2;
    for (let k = 0; k < cp.count; k++) {
      const lat = cp.getX(k) * (W + 3), al = mid + cp.getZ(k) * span;
      const g = t.frame(i0 + Math.round(al));
      const x = g.x + g.nx * lat, z = g.z + g.nz * lat;
      cp.setXYZ(k, x, world.heightAt(x, z) + 0.17, z);
    }
    this.crack = new THREE.Mesh(cg, this.crackMat);
    this.crack.renderOrder = 3;
    kp.group.add(this.crack);
    // the holes they leave, under the lifted edges
    this.pits = this.parts.map((p) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 6, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: H.pitTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      const pp = m.geometry.attributes.position;
      for (let k = 0; k < pp.count; k++) {
        const lat = pp.getX(k) * (p.w - 0.4) + p.lat, al = p.al + pp.getZ(k) * (p.L - 0.2);
        const g = this.local(lat, al);
        pp.setXYZ(k, g.x, world.heightAt(g.x, g.z) + 0.16, g.z);
      }
      m.geometry.computeVertexNormals();
      m.renderOrder = 3; m.visible = false; m.receiveShadow = true;
      kp.group.add(m);
      return m;
    });
    this.rowA = t.wrap(i0 + Math.floor(a0) - 1); this.rowB = t.wrap(i0 + Math.ceil(a1) + 1);
    this.jump = { at: t.wrap(this.rowA - 2), speed: 0, flat: 0, max: kind === 'ramp' ? 26 : kind === 'kerb' ? 27 : 29, land: t.wrap(this.rowB + 12), guard: 40 };
  }

  // a point lat across and al along from the heave's centre, along the (skewed) slab axis
  local(lat, al) {
    const f = this.f, c = Math.cos(this.skew), s = Math.sin(this.skew);
    const tx = f.tx * c + f.nx * s, tz = f.tz * c + f.nz * s;
    const nx = -tz, nz = tx;
    return { x: f.x + tx * al + nx * lat, z: f.z + tz * al + nz * lat, tx, tz };
  }

  pose(p, k) {
    const w = this.kp.world;
    const hl = p.L / 2;
    const pivAl = p.al - p.piv * hl;
    const b = this.local(p.lat, pivAl), o = this.local(p.lat, p.al + p.piv * hl);
    const yb = w.heightAt(b.x, b.z) + 0.16, yo = w.heightAt(o.x, o.z) + 0.16;
    const grade = Math.atan2((yo - yb) * p.piv, p.L);
    const pitch = grade + p.pitch * smooth(k, 0, 1) + (k > 0 && k < 1 ? Math.sin(k * 40) * 0.006 * (1 - k) : 0);
    const yaw = Math.atan2(b.tx, b.tz);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch));
    // the pivot edge stays on the road
    const off = new THREE.Vector3(0, 0, -p.piv * hl).applyQuaternion(q);
    return { p: new THREE.Vector3(b.x - off.x, yb - off.y, b.z - off.z), q };
  }

  set(k) {
    for (const p of this.parts) {
      const { p: pos, q } = this.pose(p, k);
      p.body.setNextKinematicTranslation(pos);
      p.body.setNextKinematicRotation(q);
      p.mesh.position.copy(pos); p.mesh.quaternion.copy(q);
    }
  }

  pre(dt, race, time, ready) {
    const hz = this.kp.hz, t = this.kp.t;
    if (this.state === 'idle') {
      if (!ready) return;
      const near = (c) => { const d = t.ahead(c.i, this.rowA); return d > 0 && d < 24 + c.v.speed() * 2.2; };
      const pl = race.player;
      const leader = race.order.find((c) => !c.finished) || pl;
      if (!(near(pl) && (pl.lap >= 1 || DEV_HEAVE) && !pl.finished) && !(near(leader) && leader.lap >= 1)) return;
      // never under a truck
      if (race.cars.some((c) => { const d = t.ahead(this.rowA, c.i); return d >= -2 && d <= this.rowB - this.rowA + 3 && d < 60; })) return;
      this.state = 'rise'; this.T = 0;
      for (const p of this.parts) p.mesh.visible = true;
      this.crackMat.opacity = 1;
      this.set(0);
      hz.events?.push({ type: 'heave', i: this.i0 });
      const pd = race.player.v.group.position.distanceTo(new THREE.Vector3(this.f.x, this.f.y, this.f.z));
      if (pd < 90) hz.events?.push({ type: 'quake', k: 0.4 * (1 - pd / 90) + 0.1 });
      this.burst(time, 1);
      t.jumps.push(this.jump);
      this.kp.log.push(`heave ${this.i0} t${race.t.toFixed(0)}`);
      return;
    }
    if (this.state !== 'rise') return;
    this.T += dt;
    const k = clamp(this.T / this.rise, 0, 1);
    this.set(k);
    if (k > 0.2) for (const m of this.pits) m.visible = true;
    if (Math.random() < 0.5) this.burst(time, 0.12);
    if (k >= 1) { this.state = 'up'; this.settle = 6; }
  }

  // dust out of the cracks and chunks of road thrown up
  burst(time, power) {
    const hz = this.kp.hz, w = this.kp.world, lite = hz.lite;
    const W = this.kp.t.width;
    const n = Math.max(1, Math.round((lite ? 14 : 26) * power));
    for (let k = 0; k < n; k++) {
      const p = this.parts[k % this.parts.length];
      // mostly from the torn edges
      const edge = Math.random() < 0.7;
      const lat = edge ? (Math.random() - 0.5) * W : (Math.random() < 0.5 ? -1 : 1) * (W / 2 + Math.random());
      const al = edge ? p.al + p.piv * p.L / 2 * (Math.random() < 0.8 ? 1 : -1) + (Math.random() - 0.5) : p.al + (Math.random() - 0.5) * p.L;
      const g = this.local(lat, al);
      const y = w.heightAt(g.x, g.z) + 0.3;
      const c = 0.3 + Math.random() * 0.08;
      hz.fx.smoke.emit(tmp.set(g.x, y, g.z), new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 3 * (power > 0.5 ? 1.5 : 0.6), (Math.random() - 0.5) * 2), 1 + Math.random() * 1.2, time, 2.5 + Math.random() * 1.5, c, c * 0.95, c * 0.9);
      if (power > 0.5 || Math.random() < 0.3) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 6 * power + 1, (Math.random() - 0.5) * 4);
        if (Math.random() < 0.55) this.H.chunks.throw(tmp.set(g.x, y, g.z), v, 0.12 + Math.pow(Math.random(), 2) * 0.35);
        else hz.chips.throw(tmp.set(g.x, y, g.z), v, 0.06 + Math.random() * 0.12);
      }
    }
  }

  dispose() {
    const hz = this.kp.hz;
    const j = this.kp.t.jumps.indexOf(this.jump);
    if (j >= 0) this.kp.t.jumps.splice(j, 1);
    for (const p of this.parts) hz.phys.removeRigidBody(p.body);
    this.crackMat.map.dispose();
  }
}
