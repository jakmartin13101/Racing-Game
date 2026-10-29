import * as THREE from 'three';
import { loadPropModels, makePlacer } from './props.js';
import { mulberry, nearTrack } from './world.js';

const BASE = import.meta.env.BASE_URL;

// Tiling PBR set with metre-scaled UVs; vertex colours tint each building.
function texSet(key, aniso) {
  const tl = new THREE.TextureLoader();
  const T = (s, srgb) => {
    const t = tl.load(`${BASE}textures/ext/v_${key}_${s}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const orm = T('orm');
  return new THREE.MeshStandardMaterial({
    map: T('albedo', true), normalMap: T('normal'), aoMap: orm, roughnessMap: orm, metalnessMap: orm,
    roughness: 1, metalness: key === 'tin' ? 1 : 0, vertexColors: true, envMapIntensity: 0.7,
  });
}

// Geometry accumulator: one merged mesh per material for the whole village.
class Builder {
  constructor() { this.b = {}; }
  buf(mat) { return (this.b[mat] ||= { p: [], n: [], uv: [], c: [], uv1: [] }); }
  // quad from four corners (counter-clockwise seen from the front); uv in metres / scale
  quad(mat, a, b, c, d, scale, col, { u0 = 0, v0 = 0, dark = 0 } = {}) {
    const B = this.buf(mat);
    const e1 = new THREE.Vector3().subVectors(b, a), e2 = new THREE.Vector3().subVectors(d, a);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    const w = e1.length(), h = e2.length();
    const uvs = [[u0, v0], [u0 + w / scale, v0], [u0 + w / scale, v0 + h / scale], [u0, v0 + h / scale]];
    const pts = [a, b, c, d];
    const tint = (k) => {
      // ash and splash grime darkens the lower course of walls
      const y = pts[k].y - a.y;
      const g = dark ? 1 - dark * Math.max(0, 1 - y / 1.1) : 1;
      return [col[0] * g, col[1] * g, col[2] * g];
    };
    for (const k of [0, 1, 2, 0, 2, 3]) {
      B.p.push(pts[k].x, pts[k].y, pts[k].z);
      B.n.push(n.x, n.y, n.z);
      B.uv.push(uvs[k][0], uvs[k][1]);
      B.c.push(...tint(k));
    }
  }
  // axis box in a local frame given by matrix m
  box(mat, m, sx, sy, sz, scale, col, opts = {}) {
    const h = [sx / 2, sy / 2, sz / 2];
    const V = (x, y, z) => new THREE.Vector3(x * h[0], y * h[1], z * h[2]).applyMatrix4(m);
    const faces = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
    ];
    faces.forEach((f, i) => {
      if (opts.skipBottom && i === 5) return;
      this.quad(mat, V(...f[0]), V(...f[1]), V(...f[2]), V(...f[3]), scale, col, opts);
    });
  }
  build(mats, group) {
    for (const [k, B] of Object.entries(this.b)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
      const mesh = new THREE.Mesh(g, mats[k]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

const WALL_TINTS = [[1, 0.98, 0.94], [0.98, 0.88, 0.7], [0.95, 0.82, 0.76], [0.85, 0.86, 0.84], [0.9, 0.8, 0.62], [1, 0.95, 0.85]];
const SHUTTER_TINTS = [[0.25, 0.42, 0.33], [0.28, 0.4, 0.55], [0.55, 0.3, 0.22], [0.5, 0.45, 0.38], [0.6, 0.55, 0.42]];

function house(B, b, rnd) {
  const yaw = b.yaw;
  const base = new THREE.Matrix4().makeRotationY(yaw).setPosition(b.x, b.y - 0.3, b.z);
  const L = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(base);
  const at = (x, y, z) => new THREE.Matrix4().makeRotationY(yaw).setPosition(L(x, y, z));
  const kind = b.kind;
  const farm = !!b.farm;
  const floors = b.floors;
  const fh = 3.0;
  const H = floors * fh + 0.5;
  const W = b.w, D = b.d;
  const wallMat = farm ? (rnd() < 0.5 ? 'wood' : 'concrete') : ['plaster', 'paint', 'brick', 'plaster', 'concrete', 'paint'][kind];
  const tint = farm ? [0.85, 0.8, 0.72] : WALL_TINTS[Math.floor(rnd() * WALL_TINTS.length)];
  const ashy = 0.85 + rnd() * 0.15;
  const col = tint.map((c) => c * ashy);
  // walls as four quads so the grime band and windows line up
  const corners = [L(-W / 2, 0, D / 2), L(W / 2, 0, D / 2), L(W / 2, 0, -D / 2), L(-W / 2, 0, -D / 2)];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], c = corners[(i + 1) % 4];
    const up = new THREE.Vector3(0, H, 0);
    B.quad(wallMat, a, c, c.clone().add(up), a.clone().add(up), 2.6, col, { dark: 0.45 });
  }
  // plinth
  B.box('concrete', at(0, 0.25, 0), W + 0.2, 0.5, D + 0.2, 2, [0.55, 0.53, 0.5]);
  // windows, shutters and doors on the street face (+z) and the back (-z)
  const shut = SHUTTER_TINTS[Math.floor(rnd() * SHUTTER_TINTS.length)];
  for (const face of [1, -1]) {
    const nWin = Math.max(1, Math.floor((W - 1.5) / 2.6));
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < nWin; k++) {
        const x = -W / 2 + (k + 0.5) * (W / nWin);
        const ground = f === 0;
        const isDoor = ground && face === 1 && k === Math.floor(nWin / 2);
        const wy = ground ? (isDoor ? 0.5 + 1.05 : 0.5 + 1.55) : 0.5 + f * fh + 1.45;
        const ww = isDoor ? 1.1 : 1.0, wh = isDoor ? 2.1 : 1.3;
        const z = face * (D / 2 + 0.01);
        const r = new THREE.Matrix4().makeRotationY(yaw + (face > 0 ? 0 : Math.PI)).setPosition(L(x, wy, z));
        // dark opening, timber frame, lintel
        B.box('dark', r, ww, wh, 0.05, 1, [1, 1, 1]);
        B.box('wood', new THREE.Matrix4().multiplyMatrices(r, new THREE.Matrix4().makeTranslation(0, wh / 2 + 0.12, 0.04)), ww + 0.3, 0.18, 0.12, 1.5, [0.72, 0.68, 0.62]);
        if (!isDoor) B.box('concrete', new THREE.Matrix4().multiplyMatrices(r, new THREE.Matrix4().makeTranslation(0, -wh / 2 - 0.06, 0.08)), ww + 0.25, 0.1, 0.2, 1, [0.8, 0.78, 0.74]);
        if (isDoor) { B.box('wood', new THREE.Matrix4().multiplyMatrices(r, new THREE.Matrix4().makeTranslation(0, 0, 0.03)), ww * 0.9, wh * 0.95, 0.06, 1.2, shut.map((c) => c * 0.8)); continue; }
        // shutters, some hanging open, some closed, some missing
        const s = rnd();
        if (s < 0.65) {
          const open = s < 0.4;
          for (const sd of [-1, 1]) {
            if (rnd() < 0.12) continue;
            const m = new THREE.Matrix4().multiplyMatrices(r, new THREE.Matrix4().makeTranslation(sd * (open ? ww * 0.5 + ww * 0.25 + 0.06 : ww * 0.25), 0, 0.07));
            B.box('wood', m, ww * 0.5, wh, 0.05, 1.2, shut);
          }
        }
        // balconies on upper floors of town houses
        if (f >= 1 && face === 1 && kind % 2 === 0 && k === Math.floor(nWin / 2)) {
          const m = new THREE.Matrix4().multiplyMatrices(r, new THREE.Matrix4().makeTranslation(0, -wh / 2 - 0.1, 0.55));
          B.box('concrete', m, ww + 1.2, 0.14, 1.1, 1, [0.78, 0.76, 0.72]);
          for (let q = -2; q <= 2; q++) {
            B.box('iron', new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(q * (ww + 1.1) / 4, 0.5, 0.5)), 0.035, 0.95, 0.035, 1, [0.2, 0.19, 0.18]);
          }
          B.box('iron', new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, 0.98, 0.5)), ww + 1.15, 0.05, 0.05, 1, [0.2, 0.19, 0.18]);
        }
      }
    }
  }
  // side windows for wider plots
  // roofs
  const roofCol = (rnd() < 0.5 ? [0.9, 0.75, 0.68] : [1, 0.85, 0.75]).map((c) => c * (0.7 + rnd() * 0.25));
  if (farm || kind === 5) {
    // corrugated lean-to
    const o = 0.4;
    const hi = H + 0.9, lo = H;
    const a = L(-W / 2 - o, lo, D / 2 + o), b2 = L(W / 2 + o, lo, D / 2 + o), c = L(W / 2 + o, hi, -D / 2 - o), d = L(-W / 2 - o, hi, -D / 2 - o);
    B.quad('tin', a, b2, c, d, 2.2, [0.8, 0.72, 0.64]);
    B.quad('tin', d, c, b2, a, 2.2, [0.5, 0.45, 0.4]);
    B.quad(wallMat, L(-W / 2, H, -D / 2), L(-W / 2, H, D / 2), L(-W / 2, lo + 0.0, D / 2), L(-W / 2, hi - 0.4, -D / 2), 2.6, col);
  } else if (kind === 3 || kind === 4) {
    // flat roof with parapet, water tank and clutter
    B.box('concrete', at(0, H + 0.08, 0), W, 0.16, D, 2.5, [0.62, 0.6, 0.57]);
    for (const [px, pz, sx, sz] of [[0, D / 2, W + 0.3, 0.3], [0, -D / 2, W + 0.3, 0.3], [W / 2, 0, 0.3, D], [-W / 2, 0, 0.3, D]]) {
      B.box(wallMat, at(px, H + 0.45, pz), sx, 0.9, sz, 2.6, col);
    }
    if (rnd() < 0.7) {
      const tx = (rnd() - 0.5) * (W - 3), tz = (rnd() - 0.5) * (D - 3);
      B.box('tin', at(tx, H + 1.25, tz), 1.4, 1.2, 1.4, 1.5, [0.7, 0.68, 0.64]);
      for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) B.box('iron', at(tx + lx, H + 0.45, tz + lz), 0.08, 0.7, 0.08, 1, [0.25, 0.22, 0.2]);
    }
  } else {
    // gabled terracotta roof with overhang, ridge along the longer side
    const o = 0.45, rise = Math.min(W, D) * 0.28;
    const alongX = W >= D;
    const hw = (alongX ? D : W) / 2 + o, hl = (alongX ? W : D) / 2 + o;
    const P = (l, s, y) => (alongX ? L(l, y, s) : L(s, y, l));
    const eave = H, ridge = H + rise;
    // two slopes: front and back
    const f1 = [P(-hl, hw, eave), P(hl, hw, eave), P(hl, 0, ridge), P(-hl, 0, ridge)];
    const f2 = [P(hl, -hw, eave), P(-hl, -hw, eave), P(-hl, 0, ridge), P(hl, 0, ridge)];
    if (!alongX) { f1.reverse(); f2.reverse(); }
    B.quad('roof', ...f1, 1.6, roofCol);
    B.quad('roof', ...f2, 1.6, roofCol);
    // underside of the overhang
    B.quad('dark', f1[3], f1[2], f1[1], f1[0], 2, [1, 1, 1]);
    B.quad('dark', f2[3], f2[2], f2[1], f2[0], 2, [1, 1, 1]);
    // gable ends
    const hwW = (alongX ? D : W) / 2;
    for (const e of [-1, 1]) {
      const l = e * (alongX ? W : D) / 2;
      const g0 = P(l, -hwW, eave), g1 = P(l, hwW, eave), g2 = P(l, 0, ridge);
      const tri = e * (alongX ? 1 : -1) > 0 ? [g0, g2, g1] : [g1, g2, g0];
      const Bf = B.buf(wallMat);
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(tri[1], tri[0]), new THREE.Vector3().subVectors(tri[2], tri[0])).normalize();
      for (const p of tri) {
        Bf.p.push(p.x, p.y, p.z); Bf.n.push(n.x, n.y, n.z);
        Bf.uv.push((p.x + p.z) / 2.6, p.y / 2.6); Bf.c.push(...col);
      }
    }
    // ridge cap and chimney
    B.box('roof', alongX ? at(0, ridge + 0.05, 0) : new THREE.Matrix4().makeRotationY(yaw + Math.PI / 2).setPosition(L(0, ridge + 0.05, 0)), hl * 2, 0.16, 0.36, 1, roofCol.map((c) => c * 0.85));
    if (rnd() < 0.6) B.box('brick', at((rnd() - 0.5) * W * 0.5, ridge - 0.2, (rnd() - 0.5) * D * 0.3), 0.6, 1.6, 0.6, 1.5, [0.7, 0.66, 0.62]);
  }
  return { x: b.x, y: b.y - 0.3, z: b.z, w: W, d: D, h: H + 0.5, yaw };
}

// Ashfall Village: buildings from the world bake, street furniture, trees, fences and power lines.
export async function buildVillage(world, scene, M, quality, tracks) {
  const track = tracks.find((t) => t.id === 'village');
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  if (!track) return { group, colliders };
  const rnd = mulberry(4242);
  const aniso = Math.min(8, quality.terrainStep > 3 ? 4 : 8);
  const mats = Object.fromEntries(['plaster', 'paint', 'brick', 'roof', 'tin', 'wood', 'concrete'].map((k) => [k, texSet(k, aniso)]));
  mats.dark = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.6, metalness: 0.1, vertexColors: true });
  mats.iron = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.7, vertexColors: true });
  const B = new Builder();
  for (const b of world.data.buildings) colliders.push(house(B, b, rnd));
  B.build(mats, group);

  // street furniture and vegetation
  const names = ['dead_tree_trunk', 'dead_tree_trunk_02', 'island_tree_01', 'dry_branches_medium_01', 'shrub_01', 'shrub_02', 'shrub_03', 'shrub_04',
    'street_lamp_01', 'painted_wooden_bench', 'wooden_crate_01', 'Barrel_02', 'wine_barrel_01', 'stone_fire_pit', 'wooden_picnic_table'];
  const models = await loadPropModels(names);
  const { put, build } = makePlacer(world, models, rnd);
  const vc = track.villageCentre;
  const W = track.width;
  const inCore = (x, z) => Math.hypot(x - vc[0], z - vc[1]) < 190;
  const blocked = (x, z, r) => colliders.some((c) => Math.abs(c.x - x) < c.w / 2 + r + 1 && Math.abs(c.z - z) < c.d / 2 + r + 1 &&
    Math.hypot(...rotate(x - c.x, z - c.z, c.yaw).map((v, i) => Math.max(0, Math.abs(v) - (i ? c.d : c.w) / 2))) < r);
  // lamps both sides of the village streets, alternating
  for (let i = 0; i < track.n; i += 24) {
    const f = track.frame(i);
    if (!inCore(f.x, f.z)) continue;
    const side = (i / 24) % 2 ? 1 : -1;
    const x = f.x + f.nx * side * (W / 2 + 1.2), z = f.z + f.nz * side * (W / 2 + 1.2);
    if (blocked(x, z, 0.6) || nearTrack(world, x, z, W / 2 + 0.6)) continue;
    put('street_lamp_01', x, z, f.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 4.6, { byHeight: true });
    colliders.push({ x, y: world.heightAt(x, z), z, w: 0.3, d: 0.3, h: 4, yaw: 0 });
  }
  // benches, barrels and crates against the house fronts; trees and shrubs in gaps and gardens
  for (let k = 0; k < 900; k++) {
    const i = Math.floor(rnd() * track.n);
    const f = track.frame(i);
    const side = rnd() < 0.5 ? -1 : 1;
    const core = inCore(f.x, f.z);
    const off = W / 2 + (core ? 1.3 + rnd() * 2.2 : 3 + rnd() * 30);
    const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
    if (nearTrack(world, x, z, W / 2 + 0.8) || blocked(x, z, 0.8)) continue;
    const pick = rnd();
    const face = f.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    if (core) {
      if (pick < 0.15) put('painted_wooden_bench', x, z, face, 1.8);
      else if (pick < 0.3) put(rnd() < 0.5 ? 'Barrel_02' : 'wine_barrel_01', x, z, rnd() * 6.3, 0.95, { byHeight: true });
      else if (pick < 0.42) put('wooden_crate_01', x, z, rnd() * 6.3, 0.8);
      else if (pick < 0.5) put(['shrub_01', 'shrub_02', 'shrub_03', 'shrub_04'][Math.floor(rnd() * 4)], x, z, rnd() * 6.3, 1.2 + rnd(), { byHeight: true });
    } else if (pick < 0.06) {
      // fallen trunks lie at their natural size
      put(rnd() < 0.5 ? 'dead_tree_trunk' : 'dead_tree_trunk_02', x, z, rnd() * 6.3, 3 + rnd() * 1.5, { align: 0.8, sink: 0.08 });
    } else if (pick < 0.12) {
      put('island_tree_01', x, z, rnd() * 6.3, 5 + rnd() * 4, { byHeight: true, sink: 0.01 });
      colliders.push({ x, y: world.heightAt(x, z), z, w: 0.7, d: 0.7, h: 4, yaw: 0 });
    } else if (pick < 0.32) put(['shrub_01', 'shrub_02', 'shrub_03', 'shrub_04'][Math.floor(rnd() * 4)], x, z, rnd() * 6.3, 0.8 + rnd() * 1.6, { byHeight: true });
    else if (pick < 0.4) put('dry_branches_medium_01', x, z, rnd() * 6.3, 1.5 + rnd() * 2);
  }
  // square: fire pit, tables
  put('stone_fire_pit', vc[0], vc[1], 0, 2.2);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + 0.4, x = vc[0] + Math.cos(a) * 6, z = vc[1] + Math.sin(a) * 6;
    if (!nearTrack(world, x, z, W / 2 + 1)) put('wooden_picnic_table', x, z, a, 2.2);
  }
  build(group);

  // timber fences round the fields and power lines along the main road out of the village
  const F = new Builder();
  for (let i = 0; i < track.n; i += 3) {
    const f = track.frame(i);
    if (inCore(f.x, f.z)) continue;
    for (const side of [-1, 1]) {
      const off = W / 2 + 7;
      const x = f.x + f.nx * side * off, z = f.z + f.nz * side * off;
      if (nearTrack(world, x, z, W / 2 + 5) || blocked(x, z, 1)) continue;
      if (Math.floor(i / 60) % 3 === 0) continue;
      const y = world.heightAt(x, z);
      const m = new THREE.Matrix4().makeRotationY(f.yaw).setPosition(x, y + 0.55, z);
      F.box('wood', m, 0.12, 1.1 + (rnd() - 0.5) * 0.15, 0.12, 1, [0.75, 0.7, 0.62]);
      const lean = new THREE.Matrix4().makeRotationY(f.yaw).setPosition(x, y + 0.85, z + 0);
      F.box('wood', new THREE.Matrix4().multiplyMatrices(lean, new THREE.Matrix4().makeTranslation(0, 0, 1.5)), 0.05, 0.12, 3.0, 1.5, [0.7, 0.66, 0.6]);
      F.box('wood', new THREE.Matrix4().multiplyMatrices(lean, new THREE.Matrix4().makeTranslation(0, -0.4, 1.5)), 0.05, 0.12, 3.0, 1.5, [0.7, 0.66, 0.6]);
    }
  }
  const poles = [];
  for (let i = 0; i < track.n; i += 38) {
    const f = track.frame(i);
    const off = W / 2 + 4.5;
    const x = f.x - f.nx * off, z = f.z - f.nz * off;
    if (nearTrack(world, x, z, W / 2 + 2) || blocked(x, z, 1)) { poles.push(null); continue; }
    const y = world.heightAt(x, z);
    F.box('wood', new THREE.Matrix4().makeRotationY(f.yaw).setPosition(x, y + 4, z), 0.24, 8, 0.24, 2, [0.6, 0.55, 0.5]);
    F.box('wood', new THREE.Matrix4().makeRotationY(f.yaw).setPosition(x, y + 7.6, z), 1.8, 0.14, 0.14, 2, [0.6, 0.55, 0.5]);
    poles.push(new THREE.Vector3(x, y + 7.7, z).add(new THREE.Vector3(f.tx, 0, f.tz).multiplyScalar(0)));
    poles[poles.length - 1].nx = f.nx; poles[poles.length - 1].nz = f.nz;
    colliders.push({ x, y, z, w: 0.4, d: 0.4, h: 8, yaw: 0 });
  }
  F.build(mats, group);
  // sagging wires between consecutive poles
  const wirePts = [];
  for (let k = 0; k + 1 < poles.length; k++) {
    const a = poles[k], b = poles[k + 1];
    if (!a || !b) continue;
    for (const s of [-0.8, 0.8]) {
      const pa = a.clone().add(new THREE.Vector3(a.nz * 0 + a.nx * s, 0, a.nz * s)), pb = b.clone().add(new THREE.Vector3(b.nx * s, 0, b.nz * s));
      for (let j = 0; j < 12; j++) {
        const u0 = j / 12, u1 = (j + 1) / 12;
        const P = (u) => pa.clone().lerp(pb, u).add(new THREE.Vector3(0, -Math.sin(Math.PI * u) * 0.9, 0));
        wirePts.push(P(u0), P(u1));
      }
    }
  }
  if (wirePts.length) {
    const wires = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: 0x141210 }));
    group.add(wires);
  }
  return { group, colliders };
}

function rotate(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}
