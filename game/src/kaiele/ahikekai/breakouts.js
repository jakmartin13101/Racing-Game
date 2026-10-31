import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { crackCanvas, earthMaterial } from '../../quake.js';
import { roadMaterial, mulberry } from '../../world.js';
import { G_GROUND, spillSheet, riverLevel, brokenEdge, heatGlow, clamp, disposeTree } from './util.js';
import { sweep, Merger, mat4 } from './build.js';

// The two breakout crossings on the traverse. Lava has broken out of the flank and runs across the road:
// A: the breakout heaved a slab of the road up into a ramp just short of the spill and tore the road open; the
//    only way on is to fly it. The ramp itself is shaped by the bake; this dresses it as a broken slab of road
//    standing on torn earth, with the lava running through the gap below, and gives the lip a crisp collider.
// B: a narrow old steel-girder bridge over the spill, sagging in the heat and sagging more as the race goes on.
// Both spills creep wider over the race.
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// the lowest the spill can sit: a couple of metres under the road over the gap rows
function gapFloor(hz, i0, i1, W) {
  const t = hz.track;
  let road = Infinity, bed = Infinity;
  for (let i = i0; i <= i1; i++) {
    const f = t.frame(i);
    road = Math.min(road, f.y);
    for (const l of [-W / 2, 0, W / 2]) bed = Math.min(bed, hz.world.heightAt(f.x + f.nx * l, f.z + f.nz * l));
  }
  // the pool's level: the lava river running through the gap if there is one, else a metre over the bed;
  // always well under the road, with room to rise
  const f = t.frame(Math.round((i0 + i1) / 2));
  const rl = riverLevel(hz.world, f.x, f.z, 35);
  const level = clamp((rl ?? bed + 0.8) + 0.25, bed + 0.5, road - 3.2);
  return { road, bed, level, rise: clamp(road - 2.4 - level, 0, 1.0) };
}

export class SlabCrossing {
  constructor(hz, lava, c) {
    this.hz = hz; this.c = c;
    const t = hz.track, W = t.width, M = hz.M, rnd = mulberry(c.at * 7 + 3);
    this.group = new THREE.Group();
    hz.group.add(this.group);
    const [g0, g1] = c.gap, [s0] = c.slab || [c.at - 17, c.at];
    const lip = c.at;
    const { road, bed, level, rise } = gapFloor(hz, g0, g1, W);
    this.lavaY = level;
    // the spill through the gap and out over the slopes either side
    const sp = spillSheet(hz, lava, { i0: g0, i1: g1, latMax: W / 2 + 34, level, rise, ext: 10, key: 'slab' });
    this.spill = sp; this.group.add(sp.mesh);
    // the slab: the ramp rows from where it tore loose to the lip, raised a hand's width over the road on its
    // own broken surface; the lip overhangs the gap a little
    const half = W / 2 + 0.7, NX = 14;
    const rows = [];
    for (let i = s0 + 2; i <= lip; i++) rows.push(i);
    const P = [], UVr = [], UVc = [], idx = [], col = [];
    const nR = rows.length;
    const topAt = [];
    rows.forEach((i, j) => {
      const f = t.frame(i);
      const v = j / (nR - 1);
      const over = j === nR - 1 ? 0.7 : 0;
      for (let k = 0; k <= NX; k++) {
        const u = k / NX;
        let lat = (u * 2 - 1) * half;
        if (k === 0 || k === NX) lat -= Math.sign(lat) * rnd() * 0.45;
        const al = over + (j === nR - 1 ? -rnd() * 0.5 : 0);
        const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
        const gy = j === nR - 1 ? Math.max(hz.world.heightAt(x - f.tx * 1.2, z - f.tz * 1.2), f.y) : hz.world.heightAt(x, z);
        // the back edge comes up out of the road; the lip buckles up where it snapped
        const y = gy + 0.12 + 0.06 * Math.min(1, j / 2) + (j >= nR - 2 ? rnd() * 0.12 : (rnd() - 0.5) * 0.04);
        P.push(x, y, z); UVr.push(i + 100, lat); UVc.push(u, v);
        topAt.push([x, y, z]);
      }
    });
    for (let j = 0; j < nR - 1; j++) for (let k = 0; k < NX; k++) {
      const a = j * (NX + 1) + k, b = a + 1, cc = a + NX + 1, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute(UVr, 2));
    top.setIndex(idx);
    top.computeVertexNormals();
    const roadM = roadMaterial(M, W, 1e6);
    roadM.transparent = false; roadM.depthWrite = true;
    this.mats = [roadM];
    const topMesh = new THREE.Mesh(top, roadM);
    topMesh.receiveShadow = true;
    this.group.add(topMesh);
    const cg = top.clone();
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(UVc, 2));
    const crackMat = new THREE.MeshBasicMaterial({ map: crackCanvas(rnd, 512, 1024, { main: 5, branches: 16, cells: 40 }), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const cracks = new THREE.Mesh(cg, crackMat);
    cracks.renderOrder = 2;
    this.group.add(cracks);
    // the collider is the slab's own surface, so the lip is sharp (the heightfield rounds it off)
    const cv = new Float32Array(P), ci = new Uint32Array(idx);
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(cv, ci).setFriction(1).setCollisionGroups(G_GROUND), this.body);
    // torn earth: down the sides of the slab, and the lip's face down to the lava
    const earth = heatGlow(earthMaterial(M), { value: this.lavaY + 1.5 }, 1.4, 'slab');
    earth.side = THREE.DoubleSide;
    this.mats.push(earth);
    for (const side of [0, NX]) {
      const SP = [], SI = [];
      rows.forEach((i, j) => {
        const [x, y, z] = topAt[j * (NX + 1) + side];
        SP.push(x, y, z, x, Math.min(y - 0.6, hz.world.heightAt(x, z) - 0.5 - rnd() * 0.6), z);
      });
      for (let j = 0; j < nR - 1; j++) { const a = j * 2; SI.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
      g.setIndex(SI); g.computeVertexNormals();
      const m = new THREE.Mesh(g, earth); m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    {
      // the lip face: the road bed, the soil under it, then the rock, ragged down into the spill
      const SP = [], SI = [];
      const f = t.frame(lip);
      for (let k = 0; k <= NX; k++) {
        const [x, y, z] = topAt[(nR - 1) * (NX + 1) + k];
        const u1 = 0.3 + rnd() * 0.5, u2 = -0.6 + rnd() * 1.4;
        SP.push(x, y, z, x + f.tx * u1 * 0.4, y - 0.35, z + f.tz * u1 * 0.4,
          x - f.tx * u1, (y + this.lavaY) / 2 + (rnd() - 0.5), z - f.tz * u1, x + f.tx * u2, this.lavaY - 0.8, z + f.tz * u2);
      }
      for (let k = 0; k < NX; k++) for (let s = 0; s < 3; s++) { const a = k * 4 + s; SI.push(a, a + 4, a + 1, a + 1, a + 4, a + 5); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
      g.setIndex(SI); g.computeVertexNormals();
      const m = new THREE.Mesh(g, earth); m.castShadow = true;
      this.group.add(m);
      // reinforcing mesh torn out of the lip, bent down towards the lava
      const steel = new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.6, metalness: 0.7 });
      this.mats.push(steel);
      const rebar = new Merger();
      for (let k = 0; k < 16; k++) {
        const lat = (rnd() * 2 - 1) * (half - 1);
        const x = f.x + f.nx * lat + f.tx * 0.5, z = f.z + f.nz * lat + f.tz * 0.5;
        const y = topAt[(nR - 1) * (NX + 1) + Math.round((lat / half + 1) / 2 * NX)][1] - 0.18;
        const L = 0.6 + rnd() * 1.2;
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x - f.tx * 0.3, y, z - f.tz * 0.3),
          new THREE.Vector3(x + f.tx * L * 0.6, y + 0.05, z + f.tz * L * 0.6), new THREE.Vector3(x + f.tx * L * 0.7 + (rnd() - 0.5) * 0.4, y - L * (0.4 + rnd() * 0.6), z + f.tz * L * 0.7));
        rebar.add(new THREE.TubeGeometry(curve, 6, 0.016, 4), new THREE.Matrix4());
      }
      const rm = new THREE.Mesh(rebar.build(), steel);
      rm.castShadow = true;
      this.group.add(rm);
    }
    // the far side of the gap: the broken road edge the trucks land beyond
    this.group.add(brokenEdge(hz, earth, g1 + 1, -1, this.lavaY, W / 2 + 1.5, c.at + 11));
    // cracks fanning out over the road behind the slab and round the landing
    const crackDecal = (i, len, seed) => {
      const f = t.frame(i);
      const g = new THREE.PlaneGeometry(1, 1, 10, 10).rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const lat = p.getX(k) * (W + 3), al = p.getZ(k) * len;
        const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
        p.setXYZ(k, x, hz.world.heightAt(x, z) + 0.15, z);
      }
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: crackCanvas(mulberry(seed), 512, 512, { main: 5, branches: 16, border: false, width: 8 }),
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      m.renderOrder = 2;
      this.group.add(m);
    };
    crackDecal(s0, 14, c.at);
    crackDecal(g1 + 7, 12, c.at + 5);
    // chunks of road and rock strewn about the verges
    const chunks = new THREE.InstancedMesh(hz.geos[1], hz.rockMat, 26);
    for (let k = 0; k < 26; k++) {
      const i = s0 + Math.floor(rnd() * (g1 + 20 - s0));
      if (t.c[t.wrap(i)][4]) { chunks.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0)); continue; }
      const f = t.frame(i), lat = (rnd() < 0.5 ? -1 : 1) * (W / 2 + 0.5 + rnd() * 6);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat, s = 0.15 + rnd() * rnd() * 0.6;
      chunks.setMatrixAt(k, mat4(tmp.set(x, hz.world.heightAt(x, z) + s * 0.3, z), rnd() * 6, rnd(), rnd(), tmp2.set(s, s * 0.6, s)));
    }
    chunks.castShadow = true;
    this.group.add(chunks);
    this.chunks = chunks;
    // glow and smoke from the gap
    const fm = t.frame(Math.round((g0 + g1) / 2));
    this.mid = new THREE.Vector3(fm.x, this.lavaY, fm.z);
    this.light = new THREE.PointLight(0xff5a1a, 0, 40, 1.8);
    this.light.position.set(fm.x, this.lavaY + 3, fm.z);
    this.group.add(this.light);
    this.f = fm; this.g0 = g0; this.g1 = g1;
    this.rnd = rnd;
    // the AI flies it flat out; a truck that comes to grief on the run-up is put down beyond the gap
    this.jump = { at: lip, speed: c.speed ?? 33, flat: (c.speed ?? 33) + 3, land: t.wrap(g1 + 24) };
    t.jumps.push(this.jump);
  }

  update(dt, race, time, near) {
    // the spill creeps wider as the race goes on
    this.spill.uWide.value = clamp((race.t - 20) / 220, 0, 1);
    this.light.intensity = near ? 90 * (0.85 + 0.15 * Math.sin(time * 2.7) * Math.sin(time * 1.1)) : 0;
    if (!near) return;
    const f = this.f, hz = this.hz, W = hz.track.width;
    if (this.rnd() < 0.5) {
      const lat = (this.rnd() - 0.5) * (W + 20), al = (this.rnd() - 0.5) * (this.g1 - this.g0);
      const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
      const c = 0.12 + this.rnd() * 0.12;
      hz.fx.smoke.emit(tmp.set(x, this.lavaY + 0.6, z), tmp2.set(0, 2 + this.rnd() * 2, 0), 0.8 + this.rnd() * 0.8, time, 4, c, c * 0.95, c * 0.9);
      if (this.rnd() < 0.2) hz.fx.fire.emit(tmp, tmp2.set(0, 1.5, 0), 0.8, time, 0.4);
    }
  }

  dispose() {
    const j = this.hz.track.jumps.indexOf(this.jump);
    if (j >= 0) this.hz.track.jumps.splice(j, 1);
    this.hz.phys.removeRigidBody(this.body);
    disposeTree(this.group, new Set([this.hz.geos[1], this.hz.rockMat]));
  }
}

// sag: every vertex carries aSag (its share of the mid-span sag) and aHot (how red-hot it runs)
function sagMaterial(base, uSag, uHeat, uTime, name) {
  const prev = base.onBeforeCompile;
  base.onBeforeCompile = (sh, r) => {
    prev?.call(base, sh, r);
    sh.uniforms.uSag = uSag; sh.uniforms.uHeatB = uHeat; sh.uniforms.uTimeB = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSag; attribute float aHot; uniform float uSag; varying float vHot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y -= uSag * aSag; vHot = aHot;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHot; uniform float uHeatB, uTimeB;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float hb = vHot * uHeatB * (0.85 + 0.15 * sin(uTimeB * 1.7 + vHot * 6.0));
diffuseColor.rgb *= 1.0 - min(0.6, vHot * 0.6);
totalEmissiveRadiance += vec3(1.6, 0.35, 0.05) * hb * hb * 2.0 + vec3(0.25, 0.04, 0.0) * hb;`);
  };
  const k0 = base.customProgramCacheKey?.bind(base);
  base.customProgramCacheKey = () => (k0 ? k0() : '') + `-ahisag-${name}`;
  return base;
}

export class SagBridge {
  constructor(hz, lava, c, uTime) {
    this.hz = hz; this.c = c;
    const t = hz.track, W = t.width, M = hz.M, rnd = mulberry(c.bridge[0] * 13 + 1);
    const [a, b] = c.bridge;
    this.a = a; this.b = b;
    this.sag0 = c.sag ?? 0.55;
    this.sag = this.sag0;
    this.group = new THREE.Group();
    hz.group.add(this.group);
    const { road, bed, level, rise } = gapFloor(hz, a, b, W);
    this.lavaY = level;
    const sp = spillSheet(hz, lava, { i0: a, i1: b, latMax: W / 2 + 32, level, rise, ext: 10, key: 'bridge' });
    this.spill = sp; this.group.add(sp.mesh);
    // narrow: one and a bit truck widths, and the approaches are funnelled in by barriers
    const Wb = this.Wb = Math.max(3.8, W * 0.3);
    const E = 7;
    const rows = [];
    for (let i = a - E; i <= b + E; i++) {
      const f = t.frame(i);
      const k = THREE.MathUtils.smoothstep(Math.min(i - (a - E), b + E - i), 0, 6);
      const u = clamp((i - a) / (b - a), 0, 1);
      const w = i >= a && i <= b ? Math.sin(Math.PI * u) : 0;
      rows.push({ i, x: f.x, z: f.z, y: f.y + 0.12, k, nx: f.nx, nz: f.nz, tx: f.tx, tz: f.tz, w, u });
    }
    this.rows = rows;
    const gy = (r, l) => hz.world.heightAt(r.x + r.nx * l, r.z + r.nz * l) + 0.13;
    this.yAt = (r, l) => THREE.MathUtils.lerp(gy(r, l), r.y, r.k);
    const yAt = this.yAt;
    this.uSag = { value: this.sag }; this.uHeat = { value: 1 };
    const conc = sagMaterial(new THREE.MeshStandardMaterial({ color: 0x7d776f, roughness: 0.95 }), this.uSag, this.uHeat, uTime, 'conc');
    heatGlow(conc, { value: this.lavaY + 2 }, 0.5, 'bridge');
    const steel = sagMaterial(new THREE.MeshStandardMaterial({ color: 0x5a4334, roughness: 0.62, metalness: 0.65 }), this.uSag, this.uHeat, uTime, 'steel');
    const deckMat = sagMaterial(roadMaterial(M, W, 1e6), this.uSag, this.uHeat, uTime, 'deck');
    deckMat.transparent = false; deckMat.depthWrite = true;
    this.mats = [conc, steel, deckMat];
    const span = rows.filter((r) => r.k > 0.5);
    // deck: the slab with its edge beams; on top the old road surface
    const attrs = (hot) => ({ aSag: (r) => r.w, aHot: (r, k) => hot(r, k) });
    const slabSec = [[Wb + 0.25, 0.05], [Wb + 0.25, -0.55], [-Wb - 0.25, -0.55], [-Wb - 0.25, 0.05]];
    const slab = sweep(rows, slabSec, { attrs: attrs((r, k) => (k === 1 || k === 2 ? r.w * 0.5 : 0)), dyOf: (r, d, k) => yAt(r, slabSec[k][0]) - r.y + d });
    const slabM = new THREE.Mesh(slab, conc); slabM.castShadow = slabM.receiveShadow = true;
    const topSec = [[-Wb, 0.08], [Wb, 0.08]];
    const deckG = sweep(rows, topSec, { attrs: { aSag: (r) => r.w, aHot: () => 0 }, dyOf: (r, d, k) => yAt(r, topSec[k][0]) - r.y + d });
    const uv = [];
    let al = 100;
    rows.forEach((r, j) => { if (j) al += Math.hypot(r.x - rows[j - 1].x, r.z - rows[j - 1].z); uv.push(al, -Wb, al, Wb); });
    deckG.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const deck = new THREE.Mesh(deckG, deckMat); deck.receiveShadow = true;
    // kerbs along the deck edges
    const kerbs = [];
    for (const s of [-1, 1]) {
      const sec = [[s * (Wb - 0.35), 0.06], [s * (Wb - 0.35), 0.28], [s * (Wb + 0.25), 0.28], [s * (Wb + 0.25), 0.04]];
      kerbs.push(new THREE.Mesh(sweep(span, sec, { attrs: attrs(() => 0), dyOf: (r, d, k) => yAt(r, sec[k][0]) - r.y + d }), conc));
    }
    this.group.add(slabM, deck, ...kerbs);
    // two plate girders under the deck, red-hot along their bottom flanges mid-span; cross girders between
    const gR = rows.filter((r) => r.i >= a - 2 && r.i <= b + 2);
    for (const s of [-1, 1]) {
      const L = s * (Wb - 1.1), D = 1.35, fw = 0.32, tw = 0.03, ft = 0.05;
      const sec = [[L - fw, -0.55], [L + fw, -0.55], [L + fw, -0.55 - ft], [L + tw, -0.55 - ft], [L + tw, -0.55 - D + ft], [L + fw, -0.55 - D + ft],
        [L + fw, -0.55 - D], [L - fw, -0.55 - D], [L - fw, -0.55 - D + ft], [L - tw, -0.55 - D + ft], [L - tw, -0.55 - ft], [L - fw, -0.55 - ft]];
      const g = sweep(gR, sec, { closed: true, attrs: { aSag: (r) => r.w, aHot: (r, k) => (k >= 4 && k <= 9 ? Math.pow(r.w, 1.3) * (k >= 5 && k <= 8 ? 1 : 0.6) : r.w * 0.15) } });
      const m = new THREE.Mesh(g, steel); m.castShadow = true;
      this.group.add(m);
    }
    const xg = new Merger(['aSag', 'aHot']);
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = a - 1; i <= b + 1; i += 3) {
      const r = rows[i - (a - E)];
      const y = r.y - 0.55 - 0.45;
      xg.add(box, mat4(tmp.set(r.x, y, r.z), Math.atan2(r.tx, r.tz), 0, 0, tmp2.set(2 * (Wb - 1.1), 0.7, 0.14)), { aSag: r.w, aHot: r.w * 0.5 });
      // diagonal bracing
      for (const s of [-1, 1]) xg.add(box, mat4(tmp.set(r.x + r.tx * 1.5, y, r.z + r.tz * 1.5), Math.atan2(r.tx, r.tz) + s * 0.55, 0, 0, tmp2.set(0.06, 0.08, 3.4)), { aSag: r.w, aHot: r.w * 0.6 });
    }
    // abutments: old masonry blocks the girders sit on, down into the channel
    for (const i of [a - 1, b + 1]) {
      const r = rows[i - (a - E)];
      const h = r.y - 0.6 - (this.lavaY - 2);
      xg.add(box, mat4(tmp.set(r.x, r.y - 0.6 - h / 2, r.z), Math.atan2(r.tx, r.tz), 0, 0, tmp2.set(2 * Wb + 1.6, h, 2.6)), { aSag: 0, aHot: 0 });
    }
    const xm = new THREE.Mesh(xg.build(), steel); xm.castShadow = true;
    this.group.add(xm);
    // railings: posts every 2 m and three rails; bowed out and drooping where the heat has got to them, a post
    // or two bent right over, one rail section torn away
    const pg = new Merger(['aSag', 'aHot']);
    const post = new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(0, 0.55, 0);
    const railSegs = [];
    const bendAt = (s, u, w) => s * (w * w * (0.25 + 0.2 * Math.sin(u * 17 + s))) ;
    const torn = { s: rnd() < 0.5 ? -1 : 1, u0: 0.55 + rnd() * 0.1, u1: 0.7 + rnd() * 0.08 };
    this.railPts = { '-1': [], '1': [] };
    for (const s of [-1, 1]) {
      const pts = [];
      span.forEach((r) => {
        const lat = s * (Wb - 0.05) + bendAt(s, r.u, r.w);
        pts.push({ r, lat, y: yAt(r, lat) + 0.28 });
      });
      this.railPts[s] = pts;
      pts.forEach((p, j) => {
        if (j % 2) return;
        const r = p.r;
        const lean = s * p.r.w * p.r.w * (0.25 + (rnd() < 0.15 ? 0.9 : 0));
        pg.add(post, mat4(tmp.set(r.x + r.nx * p.lat, p.y, r.z + r.nz * p.lat), Math.atan2(r.tx, r.tz), 0, -lean), { aSag: r.w, aHot: 0 });
      });
      for (const [h, rad] of [[0.45, 0.04], [0.78, 0.04], [1.08, 0.06]]) {
        let seg = [];
        const flush = () => { if (seg.length > 1) railSegs.push({ pts: seg, rad, s }); seg = []; };
        for (const p of pts) {
          const gone = s === torn.s && p.r.u > torn.u0 && p.r.u < torn.u1 && h > 0.6;
          if (gone) { flush(); continue; }
          const droop = p.r.w * p.r.w * 0.12 * (h / 1.08);
          seg.push({ v: new THREE.Vector3(p.r.x + p.r.nx * (p.lat + s * h * p.r.w * 0.2), p.y + h - droop, p.r.z + p.r.nz * (p.lat + s * h * p.r.w * 0.2)), w: p.r.w });
        }
        flush();
      }
    }
    for (const rs of railSegs) {
      const curve = new THREE.CatmullRomCurve3(rs.pts.map((q) => q.v));
      const tg = new THREE.TubeGeometry(curve, Math.max(4, rs.pts.length), rs.rad, 5);
      // each tube vertex takes the sag weight of its nearest rail point
      const n = tg.attributes.position.count, ring = 6;
      const ws = rs.pts.map((q) => q.w);
      pg.add(tg, new THREE.Matrix4(), { aSag: (pos, k) => ws[Math.min(ws.length - 1, Math.round(Math.floor(k / ring) / Math.max(1, (n / ring - 1)) * (ws.length - 1)))] ?? 0, aHot: 0 });
      // the torn end hangs down towards the lava
      tg.dispose();
    }
    {
      // the torn-away section dangles off one end
      const sp0 = this.railPts[torn.s].find((p) => p.r.u >= torn.u0);
      if (sp0) {
        const r = sp0.r, o = new THREE.Vector3(r.x + r.nx * (sp0.lat + torn.s * 0.2), sp0.y + 1.0, r.z + r.nz * (sp0.lat + torn.s * 0.2));
        const curve = new THREE.QuadraticBezierCurve3(o, o.clone().add(new THREE.Vector3(r.nx * torn.s * 0.6, -0.8, r.nz * torn.s * 0.6)),
          o.clone().add(new THREE.Vector3(r.nx * torn.s * 0.5 + r.tx * 1.5, -2.6, r.nz * torn.s * 0.5 + r.tz * 1.5)));
        const tg = new THREE.TubeGeometry(curve, 8, 0.05, 5);
        pg.add(tg, new THREE.Matrix4(), { aSag: r.w, aHot: (pos, k) => clamp((o.y - pos.getY(k)) / 2.6, 0, 1) * 0.8 });
        tg.dispose();
      }
    }
    const pm = new THREE.Mesh(pg.build(), steel); pm.castShadow = true;
    this.group.add(pm);
    box.dispose(); post.dispose();
    // barriers funnel the road down to the deck at both ends (old concrete blocks, scraped and sooty)
    this.barrier(rows, Wb, conc);
    // collider: the deck and the rail walls, rebuilt as it sags
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.collide();
    const mid = rows[Math.round(rows.length / 2)];
    this.mid = new THREE.Vector3(mid.x, mid.y, mid.z);
    this.light = new THREE.PointLight(0xff5a1a, 0, 30, 1.8);
    this.light.position.set(mid.x, (mid.y + this.lavaY) / 2, mid.z);
    this.group.add(this.light);
    this.rnd = rnd;
    this.creak = 0;
    // the AI lines up and takes it steady; a truck that crashes on the approach is put down beyond it
    this.jump = { at: t.wrap(a - E), speed: 0, flat: 0, max: 24, land: t.wrap(b + 16), guard: 70 };
    t.jumps.push(this.jump);
  }

  barrier(rows, Wb, mat) {
    const hz = this.hz, t = hz.track, W = t.width;
    const prof = new THREE.Shape();
    prof.moveTo(-0.3, 0); prof.lineTo(0.3, 0); prof.lineTo(0.3, 0.08); prof.lineTo(0.12, 0.28); prof.lineTo(0.1, 0.82); prof.lineTo(-0.1, 0.82); prof.lineTo(-0.12, 0.28); prof.lineTo(-0.3, 0.08);
    const blk = new THREE.ExtrudeGeometry(prof, { depth: 1.9, bevelEnabled: false }).translate(0, 0, -0.95);
    const mg = new Merger(['aSag', 'aHot']);
    this.barrierBody = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const end of [-1, 1]) {
      const i0 = end < 0 ? this.a - 1 : this.b + 1;
      for (let s = 1; s <= 9; s++) {
        const i = i0 + end * s * 2;
        const f = t.frame(i);
        // the funnel: from the bridge rails out to the road edge
        const k = clamp((s - 1) / 7, 0, 1);
        const latK = Wb + 0.25 + k * (W / 2 + 0.2 - Wb);
        for (const side of [-1, 1]) {
          const lat = side * latK + (this.rnd?.() ?? 0);
          const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
          const y = hz.world.heightAt(x, z);
          const yaw = f.yaw + side * end * Math.atan2(W / 2 - Wb, 16) * 0.9 + (s % 3 - 1) * 0.04;
          mg.add(blk, mat4(tmp.set(x, y - 0.03, z), yaw, 0, (s % 4 === 1 ? 0.04 : 0)), { aSag: 0, aHot: 0 });
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          hz.phys.createCollider(RAPIER.ColliderDesc.cuboid(0.28, 0.42, 0.95).setTranslation(x, y + 0.4, z).setRotation(q).setFriction(0.4).setCollisionGroups(G_GROUND), this.barrierBody);
        }
      }
    }
    const m = new THREE.Mesh(mg.build(), mat);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    blk.dispose();
  }

  collide() {
    const hz = this.hz, rows = this.rows, Wb = this.Wb, sag = this.sag;
    if (this.collider) hz.phys.removeCollider(this.collider, false);
    for (const c of this.railCols || []) hz.phys.removeCollider(c, false);
    const v = [], ix = [];
    for (const r of rows) {
      const d = sag * r.w;
      v.push(r.x - r.nx * Wb, this.yAt(r, -Wb) + 0.08 - d, r.z - r.nz * Wb, r.x + r.nx * Wb, this.yAt(r, Wb) + 0.08 - d, r.z + r.nz * Wb);
    }
    for (let j = 0; j < rows.length - 1; j++) { const p = j * 2; ix.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
    this.collider = hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(ix)).setFriction(1).setCollisionGroups(G_GROUND), this.body);
    this.railCols = [];
    for (const s of [-1, 1]) {
      const pts = this.railPts[s], rv = [], ri = [];
      for (const p of pts) {
        const d = sag * p.r.w;
        const x = p.r.x + p.r.nx * p.lat, z = p.r.z + p.r.nz * p.lat;
        rv.push(x, p.y - 0.3 - d, z, x, p.y + 1.0 - d, z);
      }
      for (let j = 0; j < pts.length - 1; j++) { const p = j * 2; ri.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      this.railCols.push(hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(rv), new Uint32Array(ri)).setFriction(0.3).setCollisionGroups(G_GROUND), this.body));
    }
    this.colSag = sag;
  }

  // sag at mid-span right now (for anything sitting on the deck)
  update(dt, race, time, near) {
    const hz = this.hz;
    // it sags through the race, and a jolt more each time a truck crosses
    const goal = this.sag0 * (1 + 1.4 * clamp((race.t - 15) / 200, 0, 1)) + (this.jolts || 0);
    for (const st of race.cars) {
      if (st.i >= this.a + 4 && st.i <= this.b - 4 && !st.onBridge) {
        st.onBridge = this; this.jolts = Math.min(this.sag0 * 0.9, (this.jolts || 0) + 0.035);
        if (this.rnd() < 0.5) this.creak = 0.25;
      } else if ((st.i < this.a || st.i > this.b) && st.onBridge === this) st.onBridge = null;
    }
    // it gives in small lurches, not smoothly: steel yielding
    if (goal - this.sag > 0.045 || this.creak > 0) {
      const step = this.creak > 0 ? 0.03 : 0.045;
      this.creak = 0;
      this.sag = Math.min(goal + 0.02, this.sag + step);
      this.lurch(time, race);
    }
    this.uSag.value += (this.sag - this.uSag.value) * Math.min(1, dt * 8);
    if (Math.abs(this.uSag.value - this.colSag) > 0.04) { this.collide(); }
    this.uHeat.value = 0.75 + 0.25 * Math.sin(time * 0.9) * Math.sin(time * 0.37) + clamp(race.t / 300, 0, 0.3);
    this.spill.uWide.value = clamp((race.t - 30) / 240, 0, 1);
    this.light.intensity = near ? 70 * (0.85 + 0.15 * Math.sin(time * 2.3) * Math.sin(time * 0.7)) : 0;
    if (!near) return;
    // smoke boiling up round the deck edges, heat shimmer, now and then drips of molten metal from the flanges
    const r = this.rows[Math.floor(this.rows.length * (0.3 + this.rnd() * 0.4))];
    if (this.rnd() < 0.45) {
      const s = this.rnd() < 0.5 ? -1 : 1, lat = s * (this.Wb + 0.5 + this.rnd() * 2);
      const c = 0.1 + this.rnd() * 0.1;
      hz.fx.smoke.emit(tmp.set(r.x + r.nx * lat, r.y - 1.5 - this.sag * r.w, r.z + r.nz * lat), tmp2.set(r.nx * s * 0.5, 2.5 + this.rnd() * 2, r.nz * s * 0.5), 0.6 + this.rnd() * 0.6, time, 3.5, c, c * 0.95, c * 0.9);
    }
    if (this.rnd() < 0.06) {
      const s = this.rnd() < 0.5 ? -1 : 1, lat = s * (this.Wb - 1.1);
      hz.fx.spark.emit(tmp.set(r.x + r.nx * lat, r.y - 1.9 - this.sag * r.w, r.z + r.nz * lat), tmp2.set(0, -1, 0), 0.06, time, 1.2);
    }
  }

  lurch(time, race) {
    const hz = this.hz, mid = this.rows[Math.round(this.rows.length / 2)];
    // the joints groan: grit and flakes of rust shaken off the girders, and sparks where steel grinds on steel
    for (let k = 0; k < 6; k++) {
      const r = this.rows[Math.floor(this.rows.length * (0.2 + this.rnd() * 0.6))];
      const lat = (this.rnd() - 0.5) * 2 * this.Wb;
      const c = 0.35;
      hz.fx.smoke.emit(tmp.set(r.x + r.nx * lat, r.y - 0.7 - this.sag * r.w, r.z + r.nz * lat), tmp2.set(0, -0.6, 0), 0.6, time, 1.6, c, c * 0.9, c * 0.8);
    }
    for (const e of [this.rows[7], this.rows[this.rows.length - 8]]) hz.fx.sparks(tmp.set(e.x, e.y - 0.7, e.z), tmp2.set(0, 0.3, 0), time, 6);
    const p = race.player.v.body.translation();
    if (Math.hypot(p.x - mid.x, p.z - mid.z) < 40) hz.events.push({ type: 'quake', k: 0.12 });
  }

  dispose() {
    const j = this.hz.track.jumps.indexOf(this.jump);
    if (j >= 0) this.hz.track.jumps.splice(j, 1);
    this.hz.phys.removeRigidBody(this.body);
    this.hz.phys.removeRigidBody(this.barrierBody);
    disposeTree(this.group);
  }
}
