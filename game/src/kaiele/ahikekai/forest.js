import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry, nearTrack } from '../../world.js';
import { patchWind } from '../../ambient.js';
import { G_GROUND, charMaterial, makePuffs, Embers, clamp, disposeTree, UP } from './util.js';
import { snagGeometry, treeModels, taperTube } from './trees.js';
import { canvasTex } from './build.js';

// The burning forest: the lava has reached the lowland forest. Near the road and on the lava side it is
// already a stand of charred snags and scorched trees, many of them still burning, flames climbing the trunks,
// fallen logs and the forest floor smouldering; further back the trees are singed but standing. Smoke rolls
// across the road and embers ride the wind over it. At the bake's `falls` rows a burning tree gives way and
// comes down across the road in front of the leaders or the player (a red marker on the road warns a moment
// before): a real obstacle, its thick butt end a wall, its thin top a bump to drive over.
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), m4 = new THREE.Matrix4(), tq = new THREE.Quaternion(), sc = new THREE.Vector3();

export class Forest {
  constructor(hz, sec, falls, uTime) {
    this.hz = hz;
    const t = hz.track, W = t.width, world = hz.world, lite = hz.lite;
    this.sec = sec;
    this.uTime = uTime;
    this.group = new THREE.Group();
    hz.group.add(this.group);
    this.rnd = mulberry(5645);
    const wd = world.data.wind;
    this.wind = wd ? new THREE.Vector3(wd[0], 0, wd[1]).normalize() : new THREE.Vector3(-0.72, 0, 0.69);
    // own particle pools: the forest burns hard and the crash smoke has wrecks to look after
    this.flames = makePuffs(hz, lite ? 260 : 700, 'flame');
    this.flames.mat.uniforms.tTex.value = hz.fx.flame.mat.uniforms.tTex.value;
    this.fire = makePuffs(hz, lite ? 140 : 360, 'fire');
    this.smoke = makePuffs(hz, lite ? 260 : 650, 'smoke');
    this.embers = new Embers(this.group, lite ? 500 : 1400, this.wind.clone().multiplyScalar(4.5));
    this.heat = { value: 1 };
    this.charMat = charMaterial(hz.M, uTime, this.heat);
    this.coldChar = charMaterial(hz.M, uTime, { value: 0.25 }, { color: 0x221d19, glow: 0.6 });
    this.emitters = [];
    this.lights = [];
    for (let k = 0; k < (lite ? 1 : 3); k++) {
      const L = new THREE.PointLight(0xff7022, 0, 45, 2);
      this.group.add(L);
      this.lights.push(L);
    }
    this.lightT = 0;
    // which side the lava river is on, along the section
    const rv = (world.data.rivers || []).find((r) => r.id === t.river) || null;
    this.lavaSide = (f) => {
      if (!rv) return 1;
      let bd = Infinity, bp = null;
      for (const p of rv.points) { const d = (p[0] - f.x) ** 2 + (p[2] - f.z) ** 2; if (d < bd) { bd = d; bp = p; } }
      return (bp[0] - f.x) * f.nx + (bp[2] - f.z) * f.nz > 0 ? 1 : -1;
    };
    this.built = false;
    this.snags();
    this.ground();
    this.falls = falls.map((fl, k) => new FallingTree(this, fl, 9000 + k * 17));
  }

  // rows the forest covers, with a ragged edge either end
  span() { const [a, b] = this.sec; return [a - 70, b + 30]; }

  place(fn, n, minOff, maxOff, seed) {
    const t = this.hz.track, W = t.width, rnd = mulberry(seed), [a, b] = this.span();
    const out = [];
    for (let k = 0; k < n; k++) {
      const i = Math.floor(a + rnd() * (b - a));
      if (t.c[t.wrap(i)][4]) continue;
      const f = t.frame(i);
      const side = rnd() < 0.5 ? -1 : 1;
      const off = W / 2 + minOff + Math.pow(rnd(), 1.3) * (maxOff - minOff);
      const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
      if (nearTrack(this.hz.world, x, z, W / 2 + minOff - 0.5)) continue;
      // burnt worst near the road and on the lava side
      const burn = clamp(1.25 - off / 60 + (side === this.lavaSide(f) ? 0.35 : -0.1) + (rnd() - 0.5) * 0.4, 0, 1);
      const r = fn({ i, f, side, off, x, z, y: this.hz.world.heightAt(x, z), burn, rnd });
      if (r) out.push(r);
    }
    return out;
  }

  snags() {
    const hz = this.hz, lite = hz.lite, rnd = mulberry(77);
    // a handful of snag shapes, instanced
    const V = lite ? 4 : 7;
    this.snagGeo = [];
    for (let k = 0; k < V; k++) this.snagGeo.push(snagGeometry(rnd, 1, 0.032 + rnd() * 0.012, { limbs: 3 + Math.floor(rnd() * 5), broken: 0.35 }));
    const lists = this.snagGeo.map(() => []);
    this.place(({ i, x, z, y, burn, rnd: r, off }) => {
      if (burn < 0.35 && r() < 0.6) return null;
      const v = Math.floor(r() * V), H = 7 + r() * 9;
      const o = { x, y, z, H, yaw: r() * 6.28, tilt: (r() - 0.5) * 0.12 };
      lists[v].push(o);
      const G = this.snagGeo[v];
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tilt, o.yaw, o.tilt * 0.6));
      // most of the near ones are alight somewhere
      if (burn > 0.5 && r() < 0.55) for (const fp of G.fire.slice(0, 1 + Math.floor(r() * 3))) this.emitters.push({ i, p: fp.clone().multiplyScalar(H).applyQuaternion(q).add(new THREE.Vector3(x, y - 0.15, z)), s: 0.7 + r() * 0.9 + H * 0.04, kind: 'tree' });
      return 1;
    }, lite ? 140 : 300, 2.5, 55, 11);
    this.snagMeshes = lists.map((L, v) => {
      if (!L.length) return null;
      const im = new THREE.InstancedMesh(this.snagGeo[v].geo, this.charMat, L.length);
      L.forEach((o, k) => {
        tq.setFromEuler(new THREE.Euler(o.tilt, o.yaw, o.tilt * 0.6));
        im.setMatrixAt(k, m4.compose(tmp.set(o.x, o.y - 0.15, o.z), tq, sc.set(o.H, o.H, o.H)));
      });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      return im;
    }).filter(Boolean);
  }

  // the island tree models, the shrubs and the fallen logs, once loaded
  dress() {
    const M = treeModels();
    if (!M || this.built) return;
    this.built = true;
    const hz = this.hz, lite = hz.lite;
    const tint = (mat, col, opts = {}) => { const m = mat.clone(); m.color = (m.color || new THREE.Color()).clone().multiply(new THREE.Color(col)); Object.assign(m, opts); return m; };
    const mk = [];
    const add = (name, list, mats) => {
      if (!list.length) return;
      const mdl = M[name];
      mdl.meshes.forEach(({ geo }, k) => {
        const mat = mats[k];
        if (!mat) return;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((o, j) => im.setMatrixAt(j, o));
        im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
        mk.push(im);
      });
    };
    const tree = M.island_tree_01;
    const trunkM = tree.meshes.map(({ mat }) => mat);
    // which primitive is which: leaves (alpha-blended cards), branches, the trunk
    const kind = trunkM.map((m) => (/leaves/i.test(m.name) || m.transparent ? 'leaf' : /branch/i.test(m.name) ? 'branch' : 'trunk'));
    const of = (k) => trunkM[Math.max(0, kind.indexOf(k))];
    // scorched: the bark blackened, the crowns gone brown and copper; singed further back
    const charBark = tint(of('trunk'), 0x3a332e), charBr = tint(of('branch'), 0x2e2925);
    const scorch = tint(of('leaf'), 0x8a5a32, { emissive: new THREE.Color(0x2a0800) });
    const singed = tint(of('leaf'), 0xb8a070);
    const by = (trunk, leaf, branch) => kind.map((k) => (k === 'leaf' ? leaf : k === 'branch' ? branch : trunk));
    patchWind(scorch, 0.012); patchWind(singed, 0.012);
    this.mats = [charBark, charBr, scorch, singed];
    const bare = [], brown = [], green = [];
    this.place(({ i, x, z, y, burn, rnd: r }) => {
      const H = 6 + r() * 6;
      const s = H / tree.size.y;
      m4.compose(tmp.set(x, y - tree.box.min.y * s - 0.05, z), tq.setFromAxisAngle(UP, r() * 6.28), sc.set(s, s, s));
      if (burn > 0.75) bare.push(m4.clone());
      else if (burn > 0.4) { brown.push(m4.clone()); if (r() < 0.35) this.emitters.push({ i, p: new THREE.Vector3(x, y + H * 0.8, z), s: 1.3 + r(), kind: 'crown' }); }
      else green.push(m4.clone());
      return 1;
    }, lite ? 110 : 240, 3, 60, 23);
    add('island_tree_01', bare, by(charBark, null, charBr));
    add('island_tree_01', brown, by(charBark, scorch, charBr));
    add('island_tree_01', green, by(of('trunk'), singed, of('branch')));
    // smouldering logs and brush on the forest floor
    const logs = [[], []], brush = [], shrubs = [[], [], [], []];
    this.place(({ i, x, z, y, burn, rnd: r }) => {
      const k = r();
      if (k < 0.3) {
        const which = r() < 0.5 ? 0 : 1, mdl = M[which ? 'dead_tree_trunk_02' : 'dead_tree_trunk'], L = 3 + r() * 3, s = L / mdl.size.x;
        m4.compose(tmp.set(x, y - mdl.box.min.y * s - 0.1, z), tq.setFromAxisAngle(UP, r() * 6.28), sc.set(s, s, s));
        logs[which].push(m4.clone());
        if (burn > 0.4 && r() < 0.6) this.emitters.push({ i, p: new THREE.Vector3(x, y + 0.3, z), s: 0.6 + r() * 0.5, kind: 'log' });
      } else if (k < 0.55) {
        const mdl = M.dry_branches_medium_01, s = (1.4 + r() * 1.8) / Math.max(mdl.size.x, mdl.size.z);
        m4.compose(tmp.set(x, y - mdl.box.min.y * s, z), tq.setFromAxisAngle(UP, r() * 6.28), sc.set(s, s, s));
        brush.push(m4.clone());
        if (burn > 0.5 && r() < 0.4) this.emitters.push({ i, p: new THREE.Vector3(x, y + 0.2, z), s: 0.5 + r() * 0.4, kind: 'log' });
      } else {
        const v = Math.floor(r() * 4), mdl = M[`shrub_0${v + 1}`], s = (0.8 + r() * 1.2) / mdl.size.y;
        m4.compose(tmp.set(x, y - mdl.box.min.y * s, z), tq.setFromAxisAngle(UP, r() * 6.28), sc.set(s, s, s));
        shrubs[v].push(m4.clone());
      }
      return 1;
    }, lite ? 120 : 280, 1.2, 45, 31);
    add('dead_tree_trunk', logs[0], [this.coldChar]);
    add('dead_tree_trunk_02', logs[1], [this.coldChar]);
    add('dry_branches_medium_01', brush, M.dry_branches_medium_01.meshes.map(() => this.coldChar));
    const shrubMats = new Map();
    shrubs.forEach((L, v) => add(`shrub_0${v + 1}`, L, M[`shrub_0${v + 1}`].meshes.map(({ mat }) => {
      if (!shrubMats.has(mat)) { const m = tint(mat, 0x4a3828); shrubMats.set(mat, m); this.mats.push(m); }
      return shrubMats.get(mat);
    })));
    this.modelMeshes = mk;
    this.sortEmitters();
  }

  // the forest floor: charred ground and smouldering patches glowing through the ash
  ground() {
    const hz = this.hz, rnd = mulberry(91);
    const tex = canvasTex(256, 256, (g) => {
      const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grd.addColorStop(0, 'rgba(14,11,9,0.95)'); grd.addColorStop(0.6, 'rgba(20,16,13,0.75)'); grd.addColorStop(1, 'rgba(30,25,20,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 900; k++) {
        const a = rnd() * 6.283, r = Math.pow(rnd(), 0.7) * 120;
        g.fillStyle = `rgba(${rnd() < 0.5 ? '90,84,78' : '8,6,5'},${rnd() * 0.5})`;
        g.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 1 + rnd() * 4, 1 + rnd() * 4);
      }
    });
    const emi = canvasTex(256, 256, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 140; k++) {
        const a = rnd() * 6.283, r = Math.pow(rnd(), 1.4) * 95, s = 2 + rnd() * 9;
        const gg = g.createRadialGradient(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 0, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, s);
        gg.addColorStop(0, `rgba(255,${120 + rnd() * 80 | 0},40,${0.5 + rnd() * 0.5})`); gg.addColorStop(1, 'rgba(255,60,10,0)');
        g.fillStyle = gg; g.fillRect(0, 0, 256, 256);
      }
    });
    this.groundMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: emi, emissive: new THREE.Color(1.6, 0.5, 0.1), transparent: true, depthWrite: false,
      roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const P = [], UV = [], I = [];
    const N = 6;
    this.place(({ x, z, i, rnd: r }) => {
      const R = 3 + r() * 6, base = P.length / 3, rot = r() * 6.28;
      for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) {
        const u = a / N - 0.5, v = b / N - 0.5;
        const px = x + (Math.cos(rot) * u - Math.sin(rot) * v) * 2 * R, pz = z + (Math.sin(rot) * u + Math.cos(rot) * v) * 2 * R;
        P.push(px, hz.world.heightAt(px, pz) + 0.08, pz); UV.push(a / N, b / N);
      }
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) { const p = base + a * (N + 1) + b; I.push(p, p + 1, p + N + 1, p + 1, p + N + 2, p + N + 1); }
      if (r() < 0.3) this.emitters.push({ i, p: new THREE.Vector3(x, hz.world.heightAt(x, z) + 0.1, z), s: 0.4 + r() * 0.4, kind: 'ground' });
      return 1;
    }, hz.lite ? 40 : 90, 1.5, 40, 47);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    this.groundMesh = new THREE.Mesh(g, this.groundMat);
    this.groundMesh.renderOrder = 1;
    this.groundMesh.receiveShadow = true;
    this.group.add(this.groundMesh);
    this.sortEmitters();
  }

  sortEmitters() { this.emitters.sort((a, b) => a.i - b.i); }

  pre(dt, race, time) {
    if (!this.built) this.dress();
    for (const ft of this.falls) ft.pre(dt, race, time);
  }

  post(dt, race, time) {
    const pl = race.player, [a, b] = this.span();
    for (const ft of this.falls) ft.post(dt, race, time);
    const active = pl.i > a - 260 && pl.i < b + 160;
    this.flames.update(time); this.fire.update(time); this.smoke.update(time);
    this.embers.update(dt, time);
    if (!active) { for (const L of this.lights) L.intensity = 0; return; }
    const r = this.rnd, lite = this.hz.lite;
    // emitters near the player burn; the rest are out of sight anyway
    const lo = pl.i - 90, hi = pl.i + 260;
    const scale = lite ? 0.45 : 1;
    for (const e of this.emitters) {
      if (e.i < lo) continue;
      if (e.i > hi) break;
      this.burn(e, dt * scale, time, r);
    }
    for (const ft of this.falls) if (ft.state !== 'idle' && ft.i > lo && ft.i < hi) ft.burn(dt * scale, time, r);
    // embers swept across the road ahead of the player
    const t = this.hz.track, W = t.width;
    for (let k = 0; k < (lite ? 2 : 5); k++) {
      const f = t.frame(pl.i + 10 + Math.floor(r() * 120));
      if (f.i < a) continue;
      const lat = (r() - 0.5) * (W + 40);
      this.embers.emit(tmp.set(f.x + f.nx * lat, f.y + 1 + r() * 8, f.z + f.nz * lat), tmp2.set(this.wind.x * 3, 0.5, this.wind.z * 3), 5, 0.1 + r() * 0.08);
    }
    // the fire lights jump to the nearest big fires ahead every so often
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.4;
      const cand = this.emitters.filter((e) => e.i > pl.i - 10 && e.i < pl.i + 120 && e.kind !== 'ground');
      for (const ft of this.falls) if (ft.state !== 'idle') cand.push({ p: ft.firePos(), i: ft.i, s: 3 });
      cand.sort((x, y) => (x.i - pl.i) - (y.i - pl.i));
      this.lights.forEach((L, k) => {
        const e = cand[Math.floor(k * cand.length / this.lights.length)];
        if (e) { L.position.copy(e.p).y += 1.5; L.userData.on = 1; } else L.userData.on = 0;
      });
    }
    this.lights.forEach((L, k) => { L.intensity = (L.userData.on ? 140 : 0) * (0.75 + 0.15 * Math.sin(time * 13 + k * 2) + 0.1 * Math.sin(time * 29 + k)); });
  }

  burn(e, dt, time, r) {
    const big = e.kind === 'tree' || e.kind === 'crown' ? 1 : 0.6;
    // flames
    e.acc = (e.acc || 0) + dt * (e.kind === 'ground' ? 3 : 9) * big;
    while (e.acc > 1) {
      e.acc -= 1;
      tmp.set(e.p.x + (r() - 0.5) * e.s, e.p.y + (r() - 0.3) * e.s * 0.6, e.p.z + (r() - 0.5) * e.s);
      this.flames.emit(tmp, tmp2.set((r() - 0.5) + this.wind.x * 0.8, 1.5 + r() * 2, (r() - 0.5) + this.wind.z * 0.8), e.s * (0.6 + r() * 0.6), time, 0.5 + r() * 0.5);
      if (r() < 0.25) this.fire.emit(tmp, tmp2.set(this.wind.x, 2 + r() * 2, this.wind.z), e.s * (0.8 + r()), time, 0.7);
      if (r() < 0.35) this.embers.emit(tmp, tmp2.set((r() - 0.5) * 3, 3 + r() * 4, (r() - 0.5) * 3), 4, 0.08 + r() * 0.1);
    }
    // smoke: a dark column leaning over with the wind
    e.sacc = (e.sacc || 0) + dt * (e.kind === 'ground' ? 0.5 : 1.4) * big;
    while (e.sacc > 1) {
      e.sacc -= 1;
      const c = 0.06 + r() * 0.08;
      this.smoke.emit(tmp.set(e.p.x, e.p.y + e.s, e.p.z), tmp2.set(this.wind.x * 2.5 + (r() - 0.5), 2 + r() * 1.5, this.wind.z * 2.5 + (r() - 0.5)), 0.5 + e.s * 0.3 + r() * 0.5, time, 5 + r() * 3, c, c * 0.93, c * 0.88);
    }
  }

  get state() { return this.falls.map((f) => `${f.i}:${f.state}`).join(' '); }

  dispose() {
    for (const ft of this.falls) ft.dispose();
    this.embers.dispose();
    for (const p of [this.flames, this.fire, this.smoke]) { this.hz.group.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose(); }
    for (const m of this.mats || []) m.dispose();
    for (const s of this.snagGeo) s.geo.dispose();
    this.charMat.dispose(); this.coldChar.dispose();
    this.groundMat.map.dispose(); this.groundMat.emissiveMap.dispose(); this.groundMat.dispose(); this.groundMesh.geometry.dispose();
    for (const im of this.modelMeshes || []) im.dispose();
    for (const im of this.snagMeshes) im.dispose();
  }
}

// One burning tree at the road edge that comes down across the road.
class FallingTree {
  constructor(forest, fl, seed) {
    this.forest = forest;
    const hz = this.hz = forest.hz, t = hz.track, W = t.width, rnd = this.rnd = mulberry(seed);
    this.i = fl.i; this.side = fl.side || 1;
    const f = this.f = t.frame(this.i);
    this.L = 14 + rnd() * 4;
    this.r0 = 0.42 + rnd() * 0.16;
    // it stands just off the verge, and falls across towards the other side
    const off = W / 2 + 2.4;
    this.base = new THREE.Vector3(f.x + f.nx * this.side * off, 0, f.z + f.nz * this.side * off);
    this.base.y = hz.world.heightAt(this.base.x, this.base.z) - 0.1;
    this.dir = new THREE.Vector3(-f.nx * this.side, 0, -f.nz * this.side);
    this.axis = new THREE.Vector3().crossVectors(UP, this.dir).normalize();
    // the limbs reach along the road, so it lies down flat
    const bias = new THREE.Vector3(f.tx, 0, f.tz);
    const G = snagGeometry(rnd, this.L, this.r0, { limbs: 7, bias, broken: 0 });
    // the snag generator works in units; scale its geometry to metres (radius is already in metres per unit H)
    this.geo = G.geo;
    this.fireLocal = G.fire;
    // a burning crown of scorched leaf litter: a few clumps of cards
    this.mesh = new THREE.Group();
    const trunk = new THREE.Mesh(this.geo, forest.charMat);
    trunk.castShadow = true;
    this.mesh.add(trunk);
    this.mesh.position.copy(this.base);
    hz.group.add(this.mesh);
    this.theta = 0;
    this.w = 0;
    // where it comes to rest: the trunk lying on the road, tip clear of the ground
    this.thetaEnd = this.restAngle();
    // colliders: the thick butt end (a wall) and the thin top (a bump you can drive over)
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.base.x, this.base.y, this.base.z));
    const thick = this.L * 0.5, thin = this.L * 0.32;
    this.rThick = this.r0 * 0.85; this.rThin = this.r0 * 0.42;
    hz.phys.createCollider(RAPIER.ColliderDesc.capsule(thick / 2, this.rThick).setTranslation(0, thick / 2 + 0.4, 0).setFriction(0.8).setCollisionGroups(G_GROUND), this.body);
    hz.phys.createCollider(RAPIER.ColliderDesc.capsule(thin / 2, this.rThin).setTranslation(0, thick + 0.4 + thin / 2, 0).setFriction(0.8).setCollisionGroups(G_GROUND), this.body);
    // the warning: a pulsing red band on the road along the line it will fall
    const mk = new THREE.PlaneGeometry(1, 1, 1, 12).rotateX(-Math.PI / 2);
    const p = mk.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const along = (p.getZ(k) + 0.5) * this.L * 0.95, w = p.getX(k) * 1.6;
      const x = this.base.x + this.dir.x * along + f.tx * w, z = this.base.z + this.dir.z * along + f.tz * w;
      p.setXYZ(k, x, Math.max(hz.world.heightAt(x, z), 0) + 0.2, z);
    }
    this.markMat = new THREE.MeshBasicMaterial({ color: 0xff1a08, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.marker = new THREE.Mesh(mk, this.markMat);
    this.marker.visible = false;
    this.marker.renderOrder = 4;
    hz.group.add(this.marker);
    this.state = 'idle';
    this.T = 0;
    this.apply();
  }

  restAngle() {
    const hz = this.hz;
    for (let th = 1.2; th < 1.75; th += 0.01) {
      for (let s = 2; s <= this.L * 0.95; s += 1) {
        const r = this.r0 * (1 - s / this.L * 0.78);
        const x = this.base.x + this.dir.x * Math.sin(th) * s, z = this.base.z + this.dir.z * Math.sin(th) * s;
        const y = this.base.y + Math.cos(th) * s;
        if (y - r < Math.max(hz.world.heightAt(x, z), this.hz.track.at(this.i)[1]) + 0.05) return th;
      }
    }
    return 1.57;
  }

  apply() {
    tq.setFromAxisAngle(this.axis, this.theta);
    this.mesh.quaternion.copy(tq);
    this.body.setNextKinematicRotation(tq);
    this.body.setNextKinematicTranslation(this.base);
  }

  trigger(race) {
    const pl = race.player, d = this.i - pl.i;
    if (!pl.finished && !pl.dnf && d > 18 && d < 22 + pl.v.speed() * 3.2) return true;
    return (pl.finished || pl.i < this.i - 350) && race.cars.some((c) => !c.isPlayer && !c.finished && this.i - c.i > 20 && this.i - c.i < 90);
  }

  pre(dt, race, time) {
    if (this.state === 'idle') {
      if (!this.trigger(race)) return;
      this.state = 'warn'; this.T = 0;
      this.marker.visible = true;
    }
    this.T += dt;
    if (this.state === 'warn') {
      // it groans and shudders, burning through at the base
      this.markMat.opacity = (0.45 + 0.4 * Math.sin(this.T * 22)) * Math.min(1, this.T * 5);
      this.theta = 0.03 * Math.sin(this.T * 17) * this.T + this.T * 0.04;
      if (Math.random() < 0.4) this.hz.fx.sparks(tmp.copy(this.base).add(tmp2.set(0, 1, 0)), tmp2.copy(this.dir).negate(), time, 3);
      if (this.T > 0.9) { this.state = 'fall'; this.T = 0; this.theta = 0.1; this.w = 0.2; }
      this.apply();
      return;
    }
    if (this.state === 'fall') {
      this.markMat.opacity = 0.5 + 0.4 * Math.sin(this.T * 22);
      // a rod pivoting on its burnt-through base, a little quicker than free fall: the stump gives way
      this.w += 2.3 * Math.sin(this.theta) * dt;
      this.theta += this.w * dt;
      if (this.theta >= this.thetaEnd) {
        this.theta = this.thetaEnd;
        if (this.w > 0.35 && (this.bounces || 0) < 2) { this.w = -this.w * 0.22; this.bounces = (this.bounces || 0) + 1; this.impact(race, time, this.bounces === 1 ? 1 : 0.4); }
        else { this.w = 0; this.state = 'down'; this.marker.visible = false; this.settle(); }
      }
      this.apply();
    }
  }

  impact(race, time, k) {
    const hz = this.hz;
    // a crash of sparks, embers and burning bark all along it, a cloud of ash
    for (let s = 1; s < this.L; s += 1.5) {
      const p = tmp.copy(this.base).addScaledVector(this.dir, s * Math.sin(this.theta)).add(tmp2.set(0, Math.cos(this.theta) * s + 0.3, 0));
      hz.fx.sparks(p, UP, time, Math.round(6 * k));
      for (let j = 0; j < 3 * k; j++) this.forest.embers.emit(p, tmp2.set((Math.random() - 0.5) * 8, 3 + Math.random() * 6, (Math.random() - 0.5) * 8), 4, 0.12);
      const c = 0.2;
      hz.fx.smoke.emit(p, tmp2.set((Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3), 1.5 * k + 0.5, time, 3, c, c * 0.92, c * 0.85);
    }
    const pl = race.player.v.body.translation();
    if (Math.hypot(pl.x - this.base.x, pl.z - this.base.z) < 80) hz.events.push({ type: 'quake', k: 0.25 * k });
  }

  // lying across the road: the AI sees it as an obstacle round its thick end
  settle() {
    const t = this.hz.track, W = t.width;
    const reach = this.L * 0.5 * Math.sin(this.theta) + 0.8;
    const latBase = this.side * (W / 2 + 2.4);
    this.obstacle = { i: this.i, lat: latBase - this.side * reach / 2, r: reach / 2, body: null };
    (t.obstacles ||= []).push(this.obstacle);
  }

  firePos() { return tmp.copy(this.base).addScaledVector(this.dir, this.L * 0.6 * Math.sin(this.theta)).add(tmp2.set(0, Math.cos(this.theta) * this.L * 0.6 + 0.5, 0)).clone(); }

  burn(dt, time, r) {
    // flames all along it, hottest round the crown
    this.acc = (this.acc || 0) + dt * 30;
    const wind = this.forest.wind;
    tq.setFromAxisAngle(this.axis, this.theta);
    while (this.acc > 1) {
      this.acc -= 1;
      const fp = this.fireLocal[Math.floor(r() * this.fireLocal.length)];
      const s = r() < 0.5 ? fp : tmp2.set(0, r() * this.L, 0);
      const p = tmp.copy(s).applyQuaternion(tq).add(this.base);
      this.forest.flames.emit(p, tmp2.set((r() - 0.5) + wind.x, 1.5 + r() * 2, (r() - 0.5) + wind.z), 0.8 + r() * 1.2, time, 0.5 + r() * 0.5);
      if (r() < 0.3) this.forest.embers.emit(p, tmp2.set((r() - 0.5) * 3, 3 + r() * 3, (r() - 0.5) * 3), 4, 0.1);
      if (r() < 0.12) { const c = 0.07; this.forest.smoke.emit(p, tmp2.set(wind.x * 2, 2.5, wind.z * 2), 0.6 + r() * 0.6, time, 5, c, c * 0.93, c * 0.88); }
    }
  }

  post() {}

  dispose() {
    this.hz.phys.removeRigidBody(this.body);
    const t = this.hz.track;
    if (this.obstacle && t.obstacles) { const j = t.obstacles.indexOf(this.obstacle); if (j >= 0) t.obstacles.splice(j, 1); }
    this.geo.dispose();
    this.marker.geometry.dispose(); this.markMat.dispose();
    this.hz.group.remove(this.mesh, this.marker);
  }
}

export { taperTube };
