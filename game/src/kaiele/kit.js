import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry } from '../world.js';

// Shared kit for the Kai'ele coast set pieces (Kahakai, Pali Kai): PBR texture sets, a geometry merger with
// vertex colours (one draw call per material for a whole village), metre-UV boxes, lumpy basalt, low-poly
// spectators, wind-blown flags, canvas signs and flickering flames.
const BASE = import.meta.env.BASE_URL;
const tl = new THREE.TextureLoader();
const UP = new THREE.Vector3(0, 1, 0);

// prefix like 'kaiele/coast/tin' or 'ext/v_wood' -> <prefix>_{albedo,normal,orm}.jpg, tinted by vertex colour
export function pbr(prefix, { aniso = 8, metal = 0, rough = 1, normal = 1, wx = 'object' } = {}) {
  const T = (s, srgb) => {
    const t = tl.load(`${BASE}textures/${prefix}_${s}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const orm = T('orm');
  const m = new THREE.MeshStandardMaterial({ map: T('albedo', true), normalMap: T('normal'), aoMap: orm, roughnessMap: orm,
    metalnessMap: metal ? orm : null, roughness: rough, metalness: metal, vertexColors: true, envMapIntensity: 0.75 });
  m.normalScale.setScalar(normal);
  m.userData.wx = wx;
  return m;
}

export function plain(color, { rough = 0.8, metal = 0, wx = 'object', ...o } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, ...o });
  m.userData.wx = wx;
  return m;
}

// position, yaw (and optional pitch/roll, scale) -> matrix
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function M(x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(pitch, yaw, roll, 'YXZ');
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}
// local frame helper: L(x, y, z) -> world point, at(x, y, z, yaw) -> world matrix, for a building at (x, y, z, yaw)
export function frameAt(x, y, z, yaw) {
  const base = M(x, y, z, yaw);
  return {
    base,
    p: (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(base),
    m: (lx, ly, lz, ryaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => base.clone().multiply(M(lx, ly, lz, ryaw, pitch, roll, sx, sy, sz)),
  };
}

// box with UVs in metres / s on every face (textures tile at their real size)
export function box(w, h, d, s = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
  }
  return g;
}
export function cyl(rt, rb, h, seg = 10, s = 1, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const c = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * c / s, uv.getY(i) * h / s);
  return g;
}
// a flat triangle (gable ends), both faces: points in local coords, uv from x+z / y
export function tri(a, b, c, s = 1) {
  const g = new THREE.BufferGeometry();
  const P = [a, b, c, a, c, b];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap((p) => [(p[0] + p[2]) / s, p[1] / s]), 2));
  g.computeVertexNormals();
  return g;
}
// a flat quad, both faces
export function quad(a, b, c, d, s = 1) {
  const g = new THREE.BufferGeometry();
  const P = [a, b, c, a, c, d, a, c, b, a, d, c];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap((p) => [(p[0] + p[2]) / s, p[1] / s]), 2));
  g.computeVertexNormals();
  return g;
}

// Collects transformed geometry per material key; build() merges each key into one mesh with vertex colours.
// col: [r,g,b] or (worldPos) => [r,g,b] (grime, sun bleaching...). opts.worldUV = s: box-project UVs in world space
export class Merge {
  constructor() { this.parts = {}; }
  add(key, geo, m, col = [1, 1, 1], opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const keep = col === null && g.attributes.color; // col null: the geometry brings its own colours
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', keep ? 'color' : ''].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (opts.worldUV || !g.attributes.uv) boxUV(g, opts.worldUV || 1);
    const p = g.attributes.position, n = p.count;
    if (keep) { (this.parts[key] ||= []).push(g); return this; }
    const c = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const k = typeof col === 'function' ? col(v.fromBufferAttribute(p, i)) : col;
      c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    (this.parts[key] ||= []).push(g);
    return this;
  }
  build(mats, group, { shadow = true, receive = true } = {}) {
    const out = [];
    for (const [k, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mats[k]);
      mesh.castShadow = shadow; mesh.receiveShadow = receive;
      group.add(mesh);
      out.push(mesh);
    }
    this.parts = {};
    return out;
  }
}

// planar UVs per triangle from its dominant normal axis (for rocks and anything without UVs)
export function boxUV(g, s = 1) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const q = [a, b, c][k];
      const [u, v] = ay >= ax && ay >= az ? [q.x, q.z] : ax >= az ? [q.z, q.y] : [q.x, q.y];
      uv[(i + k) * 2] = u / s; uv[(i + k) * 2 + 1] = v / s;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// lumpy rock: icosahedron pushed about by a few sine octaves; sharp = facet it (basalt breaks in planes)
export function rockGeo(seed, detail = 2, { rough = 0.22, flat = 0.8, sharp = true } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = mulberry(seed * 7919 + 13);
  const k = Array.from({ length: 8 }, () => r() * 6.28);
  const t = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    t.fromBufferAttribute(p, i);
    const n = 1 + rough * (Math.sin(t.x * 2.7 + k[0]) * Math.sin(t.y * 2.3 + k[1]) * 0.8 + Math.sin(t.z * 4.1 + k[2]) * 0.45
      + Math.sin((t.x - t.z) * 7.3 + k[3]) * 0.22 + Math.sin((t.y + t.x) * 11 + k[4]) * 0.1);
    t.multiplyScalar(n);
    if (t.y < 0) t.y *= flat;
    p.setXYZ(i, t.x, t.y, t.z);
  }
  // Polyhedron geometry comes unindexed (flat facets); welded, it shades smooth
  if (!sharp) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); }
  g.computeVertexNormals();
  return g;
}

// colour helpers
export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// darken towards the ground: dirt and splash along the bottom of walls (y0 = ground height)
export const grime = (c, y0, amt = 0.4, hgt = 1.0) => (v) => mul(c, 1 - amt * Math.max(0, 1 - (v.y - y0) / hgt));

// Canvas sign: lines of text on a board; returns a material
export function signMaterial(lines, { w = 1024, h = 256, bg = '#f1e6cc', fg = '#2b2219', accent = null, font = '"Saira Condensed", Impact, sans-serif', weather = 0.2 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (accent) { g.fillStyle = accent; g.fillRect(0, 0, w, h * 0.08); g.fillRect(0, h * 0.92, w, h * 0.08); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = lines.length;
  lines.forEach((ln, i) => {
    const size = (typeof ln === 'object' ? ln.size : null) ?? (h * 0.7) / L;
    g.font = `800 ${size}px ${font}`;
    const txt = typeof ln === 'object' ? ln.t : ln;
    if (typeof ln === 'object' && ln.c) g.fillStyle = ln.c; else g.fillStyle = fg;
    g.fillText(txt, w / 2, h * (i + 0.5) / L + h * 0.02, w * 0.94);
  });
  // sun and salt: fade, flecks and streaks
  for (let i = 0; i < 1800 * weather * (w / 1024); i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '250,245,235' : '70,55,40'},${Math.random() * 0.25})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 10, 1 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
  m.userData.wx = 'object';
  return m;
}

// ------------------------------------------------------------------------------------------- spectators
// Low-poly figures: clothes (shirt and shorts, tinted per instance) and skin (head, arms, legs) as two instanced
// batches. Half of them cheer, arms up, and hop while trucks are close.
function personGeos(cheer) {
  const C = new Merge(), S = new Merge();
  const I = new THREE.Matrix4();
  // legs
  for (const sx of [-0.1, 0.1]) S.add('s', cyl(0.06, 0.055, 0.8, 6), M(sx, 0.4, 0));
  C.add('c', cyl(0.17, 0.15, 0.3, 8), M(0, 0.85, 0)); // shorts
  C.add('c', cyl(0.19, 0.17, 0.55, 8), M(0, 1.25, 0)); // shirt
  S.add('s', new THREE.IcosahedronGeometry(0.12, 1), M(0, 1.66, 0)); // head
  for (const sx of [-1, 1]) {
    const a = cheer ? sx * 2.6 : sx * 0.12;
    S.add('s', cyl(0.045, 0.05, 0.6, 6).translate(0, -0.3, 0), M(sx * 0.22, 1.48, 0, 0, 0, a));
  }
  const g = {};
  const tmp = new THREE.Group();
  for (const [k, mrg] of [['c', C], ['s', S]]) { const [m] = mrg.build({ [k]: null }, tmp); g[k] = m.geometry; }
  void I;
  return g;
}

export class Crowd {
  constructor(rnd) { this.rnd = rnd; this.list = []; }
  add(x, y, z, yaw) { this.list.push({ x, y, z, yaw: yaw + (this.rnd() - 0.5) * 0.6, cheer: this.rnd() < 0.5, ph: this.rnd() * 6.28, s: 0.92 + this.rnd() * 0.16 }); }
  // a loose group facing a point
  gather(world, cx, cz, n, r, faceX, faceZ, blocked) {
    for (let k = 0; k < n * 3 && n > 0; k++) {
      const a = this.rnd() * 6.28, d = Math.sqrt(this.rnd()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (blocked?.(x, z)) continue;
      this.add(x, world.heightAt(x, z), z, Math.atan2(faceX - x, faceZ - z));
      n--;
    }
  }
  build(group) {
    const SHIRTS = ['#e8e4dc', '#d8443a', '#2f6fb3', '#f2c230', '#3a9a6a', '#ef7f3a', '#9b4fb0', '#1e2a38', '#f08fb0', '#5fc3d8'].map(hex);
    const SKIN = ['#8a5a3c', '#a8714d', '#6b4430', '#c79572', '#e0b896', '#5a3a28'].map(hex);
    const matC = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true }); matC.userData.wx = 'object';
    const matS = new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true }); matS.userData.wx = 'object';
    this.batches = [];
    for (const cheer of [false, true]) {
      const items = this.list.filter((p) => p.cheer === cheer);
      if (!items.length) continue;
      const g = personGeos(cheer);
      const mc = new THREE.InstancedMesh(g.c, matC, items.length), ms = new THREE.InstancedMesh(g.s, matS, items.length);
      items.forEach((p, i) => {
        const m = M(p.x, p.y, p.z, p.yaw, 0, 0, p.s);
        mc.setMatrixAt(i, m); ms.setMatrixAt(i, m);
        const sh = SHIRTS[Math.floor(this.rnd() * SHIRTS.length)], sk = SKIN[Math.floor(this.rnd() * SKIN.length)];
        mc.setColorAt(i, new THREE.Color(...sh)); ms.setColorAt(i, new THREE.Color(...sk));
      });
      for (const m of [mc, ms]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
      if (cheer) { mc.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ms.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
      this.batches.push({ cheer, items, mc, ms });
    }
  }
  // hop while a truck is near (or always, gently, before the start)
  update(t, cars) {
    for (const b of this.batches || []) {
      if (!b.cheer) continue;
      let any = false;
      b.items.forEach((p, i) => {
        let near = 0;
        for (const c of cars || []) { const q = c.v.group.position; const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < 3600) near = 1; }
        const hop = near ? Math.max(0, Math.sin(t * 9 + p.ph)) * 0.22 : Math.max(0, Math.sin(t * 2 + p.ph) - 0.8) * 0.3;
        if (hop === p.hop) return;
        p.hop = hop; any = true;
        const m = M(p.x, p.y + hop, p.z, p.yaw, 0, 0, p.s);
        b.mc.setMatrixAt(i, m); b.ms.setMatrixAt(i, m);
      });
      if (any) { b.mc.instanceMatrix.needsUpdate = true; b.ms.instanceMatrix.needsUpdate = true; }
    }
  }
}

// ------------------------------------------------------------------------------------------- flags
// Feather (beach) flags and pennants that flap in the wind; uGust bends them over (Pali Kai's gusts).
// One instanced batch: pole as a separate batch, sail with a vertex-shader flap.
export class Flags {
  constructor() { this.list = []; this.uT = { value: 0 }; this.uGust = { value: 0 }; this.uDir = { value: new THREE.Vector2(1, 0) }; }
  add(x, y, z, yaw, h = 4.2, col = '#d8443a') { this.list.push({ x, y, z, yaw, h, col }); }
  build(group) {
    if (!this.list.length) return;
    // sail: a tall teardrop strip hung from the pole top, x along the cloth (0 at the pole)
    const sail = new THREE.PlaneGeometry(0.9, 2.6, 6, 10).translate(0.45, -1.3, 0);
    const p = sail.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const v = -y / 2.6;
      // feather shape: narrow at the foot, round at the top
      const wdt = 0.9 * Math.min(1, 0.35 + (1 - v) * 0.9) * (v < 0.08 ? 0.6 + v * 5 : 1);
      p.setX(i, x / 0.9 * wdt);
    }
    sail.computeVertexNormals();
    const pole = cyl(0.025, 0.035, 1, 6).translate(0, 0.5, 0);
    const n = this.list.length;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });
    mat.userData.wx = 'object';
    const U = { uT: this.uT, uGust: this.uGust, uDir: this.uDir };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT, uGust; uniform vec2 uDir;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec2 wp = instanceMatrix[3].xz;
  float ph = dot(wp, vec2(0.37, 0.23));
  float u = max(position.x, 0.0);
  float sp = 6.0 + uGust * 6.0;
  transformed.z += sin(uT * sp - u * 5.0 + ph) * u * (0.18 + uGust * 0.1) + sin(uT * 13.0 + ph + position.y * 3.0) * u * 0.04;
  transformed.x -= u * u * 0.05;
}`);
    };
    mat.customProgramCacheKey = () => 'kaiele-flag';
    const ms = new THREE.InstancedMesh(sail, mat, n);
    const mp = new THREE.InstancedMesh(pole, plain(0x3a3632, { rough: 0.5, metal: 0.6, vertexColors: false }), n);
    this.sail = ms; this.pole = mp;
    this.list.forEach((f, i) => {
      mp.setMatrixAt(i, M(f.x, f.y, f.z, 0, 0, 0, 1, f.h, 1));
      ms.setColorAt(i, new THREE.Color(f.col));
    });
    for (const m of [ms, mp]) { m.castShadow = true; m.computeBoundingSphere(); group.add(m); }
    ms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.place(0);
  }
  // the cloth streams downwind: yaw each sail to the wind, and gusts lean the poles' sails out flat
  place(windYaw) {
    if (!this.sail) return;
    this.list.forEach((f, i) => {
      const yaw = windYaw - Math.PI / 2 + Math.sin(i * 1.7) * 0.25;
      this.sail.setMatrixAt(i, M(f.x, f.y + f.h, f.z, yaw, 0, -this.uGust.value * 0.5));
    });
    this.sail.instanceMatrix.needsUpdate = true;
    this.sail.computeBoundingSphere();
  }
  update(t, windYaw, gust = 0) {
    this.uT.value = t;
    const changed = Math.abs(gust - this.uGust.value) > 0.02 || windYaw !== this.windYaw;
    this.uGust.value = gust;
    if (changed) { this.windYaw = windYaw; this.place(windYaw); }
  }
}

// ------------------------------------------------------------------------------------------- flames
// Flickering flame sprites (tiki torches, lamp glow) plus a few real point lights on the bigger presets.
function flameTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 92, 2, 32, 80, 52);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,200,90,0.95)');
  grd.addColorStop(0.55, 'rgba(255,110,20,0.55)'); grd.addColorStop(1, 'rgba(120,30,0,0)');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(60, 60, 62, 100, 32, 124); g.bezierCurveTo(2, 100, 4, 60, 32, 2); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export class Flames {
  constructor(maxLights = 0) { this.list = []; this.maxLights = maxLights; this.lights = []; }
  add(x, y, z, s = 1) { this.list.push({ x, y, z, s, ph: Math.random() * 100 }); }
  build(group) {
    const mat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffc070 });
    mat.userData.wx = false;
    this.sprites = this.list.map((f) => {
      const s = new THREE.Sprite(mat);
      s.position.set(f.x, f.y + 0.25 * f.s, f.z);
      s.scale.set(0.35 * f.s, 0.7 * f.s, 1);
      group.add(s);
      return s;
    });
    for (let k = 0; k < Math.min(this.maxLights, this.list.length); k++) {
      const f = this.list[Math.floor(k * this.list.length / Math.min(this.maxLights, this.list.length))];
      const L = new THREE.PointLight(0xff9a40, 6, 14, 2);
      L.position.set(f.x, f.y + 0.5, f.z);
      L.userData.f = f;
      group.add(L);
      this.lights.push(L);
    }
  }
  update(t) {
    this.list.forEach((f, i) => {
      const k = 0.8 + 0.2 * Math.sin(t * 17 + f.ph) * Math.sin(t * 7.3 + f.ph * 2) + 0.08 * Math.sin(t * 31 + f.ph);
      const s = this.sprites[i];
      s.scale.set(0.35 * f.s * (0.9 + 0.1 * Math.sin(t * 11 + f.ph)), 0.7 * f.s * k, 1);
      s.position.y = f.y + 0.3 * f.s * k;
    });
    for (const L of this.lights) L.intensity = 5 + 2 * Math.sin(t * 15 + L.userData.f.ph) * Math.sin(t * 6.1 + L.userData.f.ph);
  }
}

// ------------------------------------------------------------------------------------------- knock-down models
// Procedural props for makePlacer/BREAKABLE: { meshes: [{geo, mat}], box, size }
export function modelFrom(merge, mats) {
  const tmp = new THREE.Group();
  const meshes = merge.build(mats, tmp).map((m) => ({ geo: m.geometry, mat: m.material }));
  const bx = new THREE.Box3();
  for (const m of meshes) { m.geo.computeBoundingBox(); bx.union(m.geo.boundingBox); }
  return { meshes, box: bx, size: bx.getSize(new THREE.Vector3()) };
}

export function driftwoodModel(mats, seed = 1) {
  const r = mulberry(seed);
  const D = new Merge();
  const L = 3.2 + r() * 1.5;
  const g = new THREE.CylinderGeometry(0.17, 0.24, L, 9, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const bend = Math.sin(y * 0.8 + seed) * 0.12;
    p.setX(i, p.getX(i) * (1 + Math.sin(y * 5 + i) * 0.08) + bend);
    p.setZ(i, p.getZ(i) * (1 + Math.cos(y * 4 + i) * 0.08));
  }
  g.computeVertexNormals();
  // silver-grey, sun-bleached
  D.add('drift', g, M(0, 0.22, 0, 0, 0, Math.PI / 2), hex('#b9b2a6'));
  // root stub and a broken branch
  D.add('drift', rockGeo(seed + 3, 1, { rough: 0.35, sharp: false }), M(-L / 2 - 0.1, 0.3, 0, 0, 0, 0, 0.42, 0.36, 0.42), hex('#a69f94'));
  D.add('drift', new THREE.CylinderGeometry(0.04, 0.08, 1.1, 6), M(L * 0.15, 0.5, 0.2, 0.4, 0.9, 0.3), hex('#bdb6aa'));
  return modelFrom(D, mats);
}

export function fishCrateModel(mats, col = '#3b7fb8') {
  const D = new Merge();
  const c = hex(col);
  // plastic fish box: walls with hand holes suggested by a dark band, a few fish-scale flecks inside
  D.add('plastic', box(0.8, 0.05, 0.5), M(0, 0.025, 0), c);
  for (const [x, z, w, d] of [[0, 0.235, 0.8, 0.03], [0, -0.235, 0.8, 0.03], [0.385, 0, 0.03, 0.5], [-0.385, 0, 0.03, 0.5]]) {
    D.add('plastic', box(w, 0.3, d), M(x, 0.15, z), c);
  }
  D.add('plastic', box(0.6, 0.06, 0.02), M(0, 0.24, 0.252), mul(c, 0.4));
  D.add('plastic', box(0.6, 0.06, 0.02), M(0, 0.24, -0.252), mul(c, 0.4));
  return modelFrom(D, mats);
}

export function floatModel(mats) {
  const D = new Merge();
  D.add('plastic', new THREE.SphereGeometry(0.22, 10, 8), M(0, 0.22, 0), hex('#f07a22'));
  D.add('plastic', cyl(0.03, 0.03, 0.12, 6), M(0, 0.47, 0), hex('#1e1e1e'));
  return modelFrom(D, mats);
}

// ------------------------------------------------------------------------------------------- start / finish
// timber gantry on lava-rock footings with a painted banner, over row `row`
export function gantry(group, mats, world, track, row, text, sub) {
  const f = track.frame(row);
  const W = track.width, span = W + 5;
  const B = new Merge();
  const y0 = world.heightAt(f.x, f.z);
  const h = 6.8;
  for (const sd of [-1, 1]) {
    const x = f.x + f.nx * sd * span / 2, z = f.z + f.nz * sd * span / 2;
    const yb = world.heightAt(x, z);
    // carved hardwood post on a lava-rock footing
    B.add('basalt', rockGeo(sd + 5, 1, { rough: 0.3 }), M(x, yb + 0.2, z, 0, 0, 0, 1.0, 0.7, 1.0), [0.55, 0.55, 0.55], { worldUV: 1.5 });
    B.add('wood', box(0.55, h + y0 - yb + 0.5, 0.55, 1.5), M(x, yb + (h + y0 - yb + 0.5) / 2, z, f.yaw), [0.5, 0.36, 0.26]);
    for (let k = 0; k < 4; k++) B.add('paint', box(0.6, 0.08, 0.6), M(x, yb + 1.2 + k * 0.5, z, f.yaw), hex(k % 2 ? '#1c1a18' : '#c43c2c'));
  }
  B.add('wood', box(span + 1.4, 0.5, 0.5, 1.5), M(f.x, y0 + h + 0.2, f.z, f.yaw), [0.5, 0.36, 0.26]);
  B.add('wood', box(span + 0.6, 0.25, 0.3, 1.5), M(f.x, y0 + h - 2.2, f.z, f.yaw), [0.5, 0.36, 0.26]);
  B.build(mats, group);
  const sign = signMaterial([{ t: text, size: 120 }, { t: sub, size: 56, c: '#c43c2c' }], { w: 2048, h: 280, bg: '#efe6d0', fg: '#1d1a17', accent: '#2f5d62' });
  for (const sd of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(span - 0.6, 1.75), sign);
    p.position.set(f.x + f.tx * sd * 0.27, y0 + h - 1.0, f.z + f.tz * sd * 0.27);
    p.rotation.y = f.yaw + (sd < 0 ? Math.PI : 0);
    p.castShadow = true;
    group.add(p);
  }
}

// chequered start line and the painted grid boxes
export function gridMarks(group, world, track, slots = 8) {
  const B = new Merge();
  const f = track.frame(track.line);
  const W = track.width;
  const n = 16;
  for (let k = 0; k < n; k++) for (let r = 0; r < 2; r++) {
    const lat = -W / 2 + (k + 0.5) * W / n;
    const x = f.x + f.nx * lat + f.tx * (r - 0.5) * W / n, z = f.z + f.nz * lat + f.tz * (r - 0.5) * W / n;
    B.add('paint', new THREE.PlaneGeometry(W / n, W / n).rotateX(-Math.PI / 2), M(x, world.heightAt(x, z) + 0.2, z, f.yaw), (k + r) % 2 ? [0.08, 0.08, 0.08] : [0.95, 0.95, 0.92]);
  }
  for (let k = 0; k < slots; k++) {
    const s = track.gridSlot(k);
    const g = track.frame(s.i);
    const at = (dl, dt) => [s.x + g.nx * dl + g.tx * dt, s.z + g.nz * dl + g.tz * dt];
    for (const [dl, dt, w, d] of [[0, 2.6, 2.6, 0.18], [-1.25, 1.6, 0.16, 2.0], [1.25, 1.6, 0.16, 2.0]]) {
      const [x, z] = at(dl, dt);
      B.add('paint', new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), M(x, world.heightAt(x, z) + 0.2, z, g.yaw), [0.92, 0.92, 0.88]);
    }
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  mat.userData.wx = 'object';
  B.build({ paint: mat }, group, { shadow: false });
}

// ------------------------------------------------------------------------------------------- jump kickers
// The baked kick rows end flat (a table top) and the ground sampled at the lip sags into the channel the bake cut
// beside it, so a truck leaving at the AI's slower speeds drops into the gap. A kicker over the last k.len metres
// to the lip rising k.rise above the road fixes that: a tilted slab, drawn by the scenery and made solid per race.
export function kickFrame(world, track, R, k) {
  const a = track.frame(R - k.len), b = track.frame(R);
  // the road's own heights at the lip, not the sagging ground
  const A = new THREE.Vector3(a.x, Math.max(world.heightAt(a.x, a.z), track.at(R - k.len)[1]) + (k.lift ?? 0.06), a.z);
  const B = new THREE.Vector3(b.x, track.at(R)[1] + (k.lift ?? 0.06) + k.rise, b.z);
  const yaw = Math.atan2(B.x - A.x, B.z - A.z);
  const pitch = -Math.atan2(B.y - A.y, Math.hypot(B.x - A.x, B.z - A.z));
  const len = A.distanceTo(B);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  // top surface height at fractional row s (R - len .. R)
  const top = (s) => A.y + (B.y - A.y) * (s - (R - k.len)) / k.len;
  return { R, A, B, yaw, pitch, len, quat, top, width: track.width + 1.0, thick: k.thick ?? 0.6 };
}
// the slab whose top face is the kicker surface, as a matrix (centre and tilt) for drawing or a Rapier collider
export function kickMatrix(kf) {
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(kf.quat);
  const c = kf.A.clone().lerp(kf.B, 0.5).addScaledVector(n, -kf.thick / 2);
  return new THREE.Matrix4().compose(c, kf.quat, new THREE.Vector3(1, 1, 1));
}
export function addKicker(phys, kf) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  kickMatrix(kf).decompose(p, q, s);
  const body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  phys.createCollider(RAPIER.ColliderDesc.cuboid(kf.width / 2, kf.thick / 2, kf.len / 2).setTranslation(p.x, p.y, p.z)
    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.9).setCollisionGroups((0x0001 << 16) | 0xffff), body);
  return body;
}

// distance along a ray from (x, z) in direction (dx, dz) to where the ground falls away by `drop` (or null)
export function edgeAlong(world, x, z, dx, dz, maxD = 200, drop = 12, step = 2) {
  const y0 = world.heightAt(x, z);
  for (let d = step; d < maxD; d += step) if (world.heightAt(x + dx * d, z + dz * d) < y0 - drop) return d;
  return null;
}

export { UP };
