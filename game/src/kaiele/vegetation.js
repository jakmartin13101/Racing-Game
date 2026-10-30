import * as THREE from 'three';
import { mulberry, vnoise } from '../world.js';
import { wind } from '../ambient.js';
import { palm, canopyTree, treeFern, banana, bamboo, crossed, leafClump, CELLS } from './plants.js';
import { buildLife } from './life.js';

const BASE = import.meta.env.BASE_URL;
const TEX = `${BASE}textures/kaiele/plants`;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The trade wind: blows from the north-east. The weather can drive strength (1 = a steady trade wind) and dir.
export const vegWind = { strength: { value: 1 }, dir: { value: new THREE.Vector2(-0.7, 0.7).normalize() } };
const sunView = { value: new THREE.Vector3(0, 1, 0) };

// LOD radii (m) and densities per graphics preset. near: full models; far: impostor cards (trees only)
const PRESET = {
// full: the share of the near radius drawn with the full models (the rest with the light ones)
  low: { near: 85, full: 0, far: 900, small: 0.45, trees: 0.75, detail: 0, tex: '_1k' },
  medium: { near: 120, full: 0.4, far: 1300, small: 0.7, trees: 0.9, detail: 1, tex: '_1k' },
  high: { near: 155, full: 0.45, far: 1800, small: 1, trees: 1, detail: 1, tex: '' },
  ultra: { near: 230, full: 0.45, far: 2600, small: 1.4, trees: 1, detail: 1, tex: '' },
};

// ------------------------------------------------------------------ materials
// wind sway (whole plant bends downwind with the gusts, leaves flutter), in world space so every instance's
// yaw sees the same wind; aw = (bend, flutter) per vertex, iw = exposure per instance (cliff tops sway more)
function patchPlant(mat, { leaf = false, texSize = 2048, imp = false } = {}) {
  mat.userData.wx = 'foliage';
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, { uWind: wind.uTime, uWindK: vegWind.strength, uWindDir: vegWind.dir, uSunView: sunView });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uWind, uWindK; uniform vec2 uWindDir; attribute vec2 aw; attribute float iw;${imp ? '\nvarying float vImpA;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
#ifdef USE_INSTANCING
  vec3 wpos = (instanceMatrix * vec4(transformed, 1.0)).xyz; vec2 wp = instanceMatrix[3].xz; float ex = iw * uWindK;
#else
  vec3 wpos = transformed; vec2 wp = vec2(0.0); float ex = uWindK;
#endif
  float ph = dot(wp, vec2(0.13, 0.21));
  float gust = 0.55 + 0.45 * sin(uWind * 0.35 + dot(wp, vec2(0.004, 0.003))) * sin(uWind * 0.11 + wp.y * 0.002 + 1.3);
  float b = aw.x * 0.28 * ex;
  float sway = b * (0.45 + 0.55 * gust) * (0.75 + 0.25 * sin(uWind * 1.6 + ph) + 0.12 * sin(uWind * 3.1 + ph * 1.7));
  vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y) * sway + vec3(-uWindDir.y, 0.0, uWindDir.x) * b * 0.22 * sin(uWind * 1.2 + ph * 1.3);
  d.y -= sway * sway * 0.08;
  float fl = max(aw.y, 0.0) * 0.06 * ex * (0.5 + gust);
  d += vec3(sin(uWind * 6.3 + ph + wpos.y * 1.7 + wpos.x), 0.7 * sin(uWind * 8.1 + ph * 1.3 + wpos.z * 1.9), cos(uWind * 7.2 + ph + wpos.z * 1.3 + wpos.y)) * fl;
#ifdef USE_INSTANCING
  transformed += inverse(mat3(instanceMatrix)) * d;
#else
  transformed += d;
#endif
${imp ? `  // impostors: the flat card over the crown (aw.y < 0) shows only from above, the upright ones fade out there
  float vup = abs(normalize(wpos - cameraPosition).y);
  vImpA = aw.y < -0.5 ? smoothstep(0.3, 0.55, vup) : 1.0 - smoothstep(0.8, 0.97, vup);` : ''}
}`);
    if (leaf && sh.fragmentShader.includes('#include <normal_fragment_begin>')) {
      // cards keep their "out of the crown" normal on both faces, and glow when the sun is behind them
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunView;' + (imp ? '\nvarying float vImpA;' : ''))
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replaceAll('normal *= faceDirection;', ''))
        .replace('#include <alphatest_fragment>', `
#ifdef USE_MAP
  { vec2 dd = fwidth(vMapUv * ${texSize.toFixed(1)}); diffuseColor.a *= 1.0 + max(0.0, log2(max(dd.x, dd.y))) * 0.3; }
#endif
${imp ? 'diffuseColor.a *= vImpA;' : ''}
#include <alphatest_fragment>`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float tr = pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 3.0);
    reflectedLight.indirectDiffuse += diffuseColor.rgb * (vec3(1.0, 0.92, 0.6) * tr * 0.55 + 0.04); }`);
    }
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + (leaf ? '-kplant-leaf' : '-kplant') + (imp ? '-imp' : '');
  return mat;
}

// the shadow of a swaying plant sways with it, and is cut out by the leaf alpha
function depthFor(mat) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: mat.alphaTest, side: THREE.DoubleSide });
  return patchPlant(d);
}

// ------------------------------------------------------------------ the rendered ground
// Plants stand on the terrain mesh as drawn, which is coarser than the baked heightfield (on a steep slope the two
// differ by metres). The terrain module can publish world.groundAt; otherwise this follows terrain.js's grid
// (step max(3, terrainStep * 2.5), each square split along the b-c diagonal).
export function groundFn(world, quality) {
  if (world.groundAt) return world.groundAt;
  const step = Math.max(3, quality.terrainStep * 2.5), half = world.half;
  return (x, z) => {
    const fx = (x + half) / step, fz = (z + half) / step;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const x0 = -half + i * step, z0 = -half + j * step;
    const hb = world.heightAt(x0 + step, z0), hc = world.heightAt(x0, z0 + step);
    if (tx + tz <= 1) { const ha = world.heightAt(x0, z0); return ha + (hb - ha) * tx + (hc - ha) * tz; }
    const hd = world.heightAt(x0 + step, z0 + step);
    return hd + (hc - hd) * (1 - tx) + (hb - hd) * (1 - tz);
  };
}

// ------------------------------------------------------------------ data readback
// a PNG's raw texels. Through a canvas the browser premultiplies alpha (and zeroes colour where alpha is 0, as on
// biome.png away from bare rock), so read it back from a WebGL texture with premultiplication off.
async function readPixels(url) {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2', { premultipliedAlpha: false });
    if (!gl) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const out = new Uint8Array(img.width * img.height * 4);
    gl.readPixels(0, 0, img.width, img.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { data: out, w: img.width, h: img.height };
  } catch { return null; }
}

// ------------------------------------------------------------------ fields
// 8 m grids over the map: distance to the sea, to fresh water and to any track; plus exact lookups near them
function buildFields(world, biome, lavaMask, masks) {
  const G = 512, half = world.half, CS = world.extent / G;
  const h = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) h[j * G + i] = world.heightAt(-half + (i + 0.5) * CS, -half + (j + 0.5) * CS);
  const chamfer = (d) => {
    const a = CS, b = CS * Math.SQRT2;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const k = j * G + i; let v = d[k];
      if (i) v = Math.min(v, d[k - 1] + a);
      if (j) { v = Math.min(v, d[k - G] + a); if (i) v = Math.min(v, d[k - G - 1] + b); if (i < G - 1) v = Math.min(v, d[k - G + 1] + b); }
      d[k] = v;
    }
    for (let j = G - 1; j >= 0; j--) for (let i = G - 1; i >= 0; i--) {
      const k = j * G + i; let v = d[k];
      if (i < G - 1) v = Math.min(v, d[k + 1] + a);
      if (j < G - 1) { v = Math.min(v, d[k + G] + a); if (i < G - 1) v = Math.min(v, d[k + G + 1] + b); if (i) v = Math.min(v, d[k + G - 1] + b); }
      d[k] = v;
    }
    return d;
  };
  const cellOf = (x, z) => {
    const i = Math.min(G - 1, Math.max(0, Math.floor((x + half) / CS))), j = Math.min(G - 1, Math.max(0, Math.floor((z + half) / CS)));
    return j * G + i;
  };
  const coast = new Float32Array(G * G).fill(1e9);
  for (let k = 0; k < G * G; k++) if (h[k] < 0.2) coast[k] = 0;
  chamfer(coast);
  // fresh water: rivers, creek, the plunge pool; dense points for exact distance (minus half width)
  const W = world.data.water || {};
  const river = new Float32Array(G * G).fill(1e9);
  const wpts = [];
  for (const rv of [W.river, W.creek].filter(Boolean)) {
    const P = rv.points;
    for (let k = 0; k < P.length - 1; k++) {
      const L = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][2] - P[k][2]), n = Math.max(1, Math.ceil(L / 2));
      for (let s = 0; s < n; s++) {
        const t = s / n, x = P[k][0] + (P[k + 1][0] - P[k][0]) * t, z = P[k][2] + (P[k + 1][2] - P[k][2]) * t;
        const r = (rv.width[k] ?? 8) / 2;
        wpts.push([x, z, r]);
        river[cellOf(x, z)] = 0;
      }
    }
  }
  const pool = W.falls?.pool;
  if (pool) for (let a = 0; a < 64; a++) for (let rr = 0; rr <= pool.r; rr += 4) river[cellOf(pool.x + Math.cos(a / 64 * 6.283) * rr, pool.z + Math.sin(a / 64 * 6.283) * rr)] = 0;
  chamfer(river);
  const track = new Float32Array(G * G).fill(1e9);
  const tracks = world.data.tracks;
  for (const t of tracks) for (const c of t.centre) track[cellOf(c[0], c[2])] = 0;
  chamfer(track);
  // exact queries through hashes of points
  const hash = (cs) => ({ cs, m: new Map() });
  const hput = (H, x, z, v) => { const k = Math.floor(x / H.cs) * 4096 + Math.floor(z / H.cs); let l = H.m.get(k); if (!l) H.m.set(k, (l = [])); l.push(v); };
  const wh = hash(16);
  for (const p of wpts) hput(wh, p[0], p[1], p);
  const th = hash(24);
  tracks.forEach((t, ti) => { for (let i = 0; i < t.centre.length; i += 2) hput(th, t.centre[i][0], t.centre[i][2], [t.centre[i][0], t.centre[i][2], ti, i, t.width]); });
  const near = (H, x, z, f) => {
    const gx = Math.floor(x / H.cs), gz = Math.floor(z / H.cs);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = H.m.get((gx + a) * 4096 + gz + b); if (l) for (const p of l) f(p); }
  };
  // metres from the water's edge (negative: in the water)
  const waterAt = (x, z) => {
    let d = 1e9;
    near(wh, x, z, (p) => { d = Math.min(d, Math.hypot(p[0] - x, p[1] - z) - p[2]); });
    if (pool) d = Math.min(d, Math.hypot(pool.x - x, pool.z - z) - pool.r);
    return d;
  };
  // metres from the road edge of the nearest track (and which track, which row)
  const q = { edge: 1e9, d: 1e9, t: -1, i: -1 };
  const trackAt = (x, z) => {
    q.edge = 1e9; q.d = 1e9; q.t = -1; q.i = -1;
    // callers only need it close in (clearances under 12 m, colliders within 15 m of the edge)
    if (track[cellOf(x, z)] > 34) return q;
    const gx = Math.floor(x / th.cs), gz = Math.floor(z / th.cs);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = th.m.get((gx + a) * 4096 + gz + b);
      if (!l) continue;
      for (let k = 0; k < l.length; k++) {
        const p = l[k], dx = p[0] - x, dz = p[1] - z, d2 = dx * dx + dz * dz, lim = q.edge + p[4] / 2;
        if (d2 >= lim * lim) continue;
        const d = Math.sqrt(d2);
        q.edge = d - p[4] / 2; q.d = d; q.t = p[2]; q.i = p[3];
      }
    }
    return q;
  };
  const sample = (img, x, z, ch) => {
    if (!img) return 0;
    const i = Math.min(img.w - 1, Math.max(0, Math.floor((x / world.extent + 0.5) * img.w)));
    const j = Math.min(img.h - 1, Math.max(0, Math.floor((z / world.extent + 0.5) * img.h)));
    return img.data[(j * img.w + i) * 4 + ch] / 255;
  };
  const N = new THREE.Vector3();
  // vegetation density 0..1: the bake's own formula (biome.png B), recomputed here as a floor so the jungle grows
  // even where the mask came out empty; bare rock and fresh lava thin it out
  const vegAt = (x, z, hh, cst, riv) => {
    world.normalAt(x, z, N);
    const slope = Math.sqrt(Math.max(0, 1 - N.y * N.y)) / Math.max(0.05, N.y);
    const nb = vnoise(x / 700, 0.5, z / 700);
    let v = ss(20, 140, cst) * (1 - ss(0.65, 1.0, slope)) * (1 - ss(520, 640, hh + nb * 40));
    v *= 0.55 + 0.45 * ss(-0.3, 0.6, nb);
    v = Math.max(v, (1 - ss(0, 420, riv)) * ss(5, 30, cst) * 0.95);
    const rock = sample(biome, x, z, 3), fresh = Math.max(sample(lavaMask, x, z, 0), sample(masks, x, z, 2));
    v = Math.max(v * (1 - rock * 0.8), sample(biome, x, z, 2));
    return { v: v * (1 - fresh), slope, rock, fresh };
  };
  return { G, CS, half, h, coast, river, track, cellOf, waterAt, trackAt, vegAt, sample };
}

// ------------------------------------------------------------------ instance sets with distance LOD
class Kind {
  constructor(name, model, { near = 1, imp = null, shadow = false } = {}) {
    Object.assign(this, { name, model, near, imp, shadow });
    this.list = [];
  }
  add(x, y, z, yaw, s, ex, col) { this.list.push([x, y, z, yaw, s, ex, col]); }
}

const up = new THREE.Vector3(0, 1, 0);

class LodSet {
  constructor(kinds, imps, P, group) {
    this.P = P;
    this.kinds = kinds.filter((k) => k.list.length);
    this.imps = imps;
    const CELL = 64, GN = 64;
    this.CELL = CELL; this.GN = GN;
    for (const k of this.kinds) {
      // sort into 64 m cells so a radius query walks only the cells it needs
      const cellOf = (e) => Math.min(GN - 1, Math.max(0, Math.floor((e[2] + 2048) / CELL))) * GN + Math.min(GN - 1, Math.max(0, Math.floor((e[0] + 2048) / CELL)));
      k.list.sort((a, b) => cellOf(a) - cellOf(b));
      const n = k.list.length;
      k.start = new Int32Array(GN * GN + 1);
      for (const e of k.list) k.start[cellOf(e) + 1]++;
      for (let c = 0; c < GN * GN; c++) k.start[c + 1] += k.start[c];
      // compact per instance (x, y, z, cos * scale, sin * scale): the matrix is built as it is drawn
      k.pos = new Float32Array(n * 2); k.tr = new Float32Array(n * 5); k.col = new Float32Array(n * 3); k.ex = new Float32Array(n);
      k.list.forEach((e, i) => {
        k.pos[i * 2] = e[0]; k.pos[i * 2 + 1] = e[2];
        k.tr.set([e[0], e[1], e[2], Math.cos(e[3]) * e[4], Math.sin(e[3]) * e[4]], i * 5);
        k.col.set(e[6], i * 3); k.ex[i] = e[5];
      });
      k.list = null;
      // a light model for the middle distance where the plant has one; low settings use only that
      const lo = k.model.loParts?.length ? k.model.loParts : null;
      k.full = lo ? P.full : 1;
      const cap = Math.min(n, this.capacity(k, P.near * k.near));
      k.meshes = k.full > 0 ? this.makeMesh(k.model.parts, cap, group, k.shadow) : [];
      k.meshesLo = lo ? this.makeMesh(lo, cap, group, k.shadow) : [];
    }
    for (const imp of imps) {
      const n = this.kinds.filter((k) => k.imp?.type === imp).reduce((s, k) => s + Math.min(k.pos.length / 2, this.capacity(k, P.far)), 0);
      imp.meshes = n ? this.makeMesh([{ geo: imp.geo, mat: imp.mat }], n, group, false) : [];
    }
    this.nearAt = null; this.farAt = null;
  }

  // the most instances of a kind within r of any point (a box sum over the 64 m cells): the buffers' size
  capacity(k, r) {
    const { GN, CELL } = this, w = Math.ceil(r / CELL);
    let best = 0;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      let s = 0;
      for (let b = Math.max(0, j - w); b <= Math.min(GN - 1, j + w); b++) s += k.start[b * GN + Math.min(GN - 1, i + w) + 1] - k.start[b * GN + Math.max(0, i - w)];
      if (s > best) best = s;
    }
    return Math.max(16, best);
  }

  // one InstancedMesh per part (bark, leaves), all sharing one set of instance buffers
  makeMesh(parts, n, group, shadow) {
    const [matA, colA, exA] = this.buffers(n);
    return parts.map(({ geo, mat }) => {
      const g = geo.clone();
      g.setAttribute('iw', exA);
      const im = new THREE.InstancedMesh(g, mat, 0);
      im.instanceMatrix = matA; im.instanceColor = colA;
      im.count = 0; im.visible = false;
      im.frustumCulled = false;
      im.castShadow = shadow; im.receiveShadow = true;
      if (mat.userData.depth) im.customDepthMaterial = mat.userData.depth;
      group.add(im);
      return im;
    });
  }

  // writes instances straight into a mesh set's buffers
  buffers(n) {
    return [new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16), new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
      new THREE.InstancedBufferAttribute(new Float32Array(n), 1)].map((a) => a.setUsage(THREE.DynamicDrawUsage));
  }
  writer(meshes) {
    if (!meshes.length) return null;
    return { meshes, A: meshes[0].instanceMatrix.array, C: meshes[0].instanceColor.array, E: meshes[0].geometry.attributes.iw.array, n: 0 };
  }
  // one instance: rotation about y, uniform scale (times sm), position
  put(w, k, i, sm = 1) {
    if (w.n * 16 >= w.A.length) this.grow(w);
    const n = w.n++, o = n * 16, t = k.tr, b = i * 5, c = t[b + 3] * sm, s = t[b + 4] * sm;
    const A = w.A;
    A[o] = c; A[o + 1] = 0; A[o + 2] = -s; A[o + 3] = 0;
    A[o + 4] = 0; A[o + 5] = Math.hypot(c, s); A[o + 6] = 0; A[o + 7] = 0;
    A[o + 8] = s; A[o + 9] = 0; A[o + 10] = c; A[o + 11] = 0;
    A[o + 12] = t[b]; A[o + 13] = t[b + 1]; A[o + 14] = t[b + 2]; A[o + 15] = 1;
    w.C[n * 3] = k.col[i * 3]; w.C[n * 3 + 1] = k.col[i * 3 + 1]; w.C[n * 3 + 2] = k.col[i * 3 + 2];
    w.E[n] = k.ex[i];
  }
  // more in range than the estimate: double the buffers (rare)
  grow(w) {
    const [A, C, E] = this.buffers(w.A.length / 8);
    A.array.set(w.A); C.array.set(w.C); E.array.set(w.E);
    for (const m of w.meshes) { m.instanceMatrix = A; m.instanceColor = C; m.geometry.setAttribute('iw', E); }
    w.A = A.array; w.C = C.array; w.E = E.array;
  }
  done(w) {
    if (!w) return;
    const m0 = w.meshes[0];
    for (const a of [m0.instanceMatrix, m0.instanceColor, m0.geometry.attributes.iw]) { a.clearUpdateRanges(); a.addUpdateRange(0, w.n * a.itemSize); a.needsUpdate = true; }
    for (const m of w.meshes) { m.count = w.n; m.visible = w.n > 0; }
  }

  // walk the cells within r of (x, z), calling f(index, d2)
  walk(k, x, z, r, f) {
    const { CELL, GN } = this;
    const i0 = Math.max(0, Math.floor((x - r + 2048) / CELL)), i1 = Math.min(GN - 1, Math.floor((x + r + 2048) / CELL));
    const j0 = Math.max(0, Math.floor((z - r + 2048) / CELL)), j1 = Math.min(GN - 1, Math.floor((z + r + 2048) / CELL));
    const r2 = r * r, pos = k.pos;
    for (let j = j0; j <= j1; j++) {
      const a = k.start[j * GN + i0], b = k.start[j * GN + i1 + 1];
      for (let i = a; i < b; i++) {
        const dx = pos[i * 2] - x, dz = pos[i * 2 + 1] - z, d2 = dx * dx + dz * dz;
        if (d2 < r2) f(i, d2);
      }
    }
  }

  update(cam, force = false) {
    const x = cam.x, z = cam.z;
    const P = this.P;
    // near models: rebuilt every few metres of camera travel
    if (force || !this.nearAt || Math.hypot(x - this.nearAt.x, z - this.nearAt.z) > 6) {
      this.nearAt = { x, z };
      for (const k of this.kinds) {
        const hi = this.writer(k.meshes), lo = this.writer(k.meshesLo), r = P.near * k.near, rf2 = (r * k.full) ** 2;
        this.walk(k, x, z, r, (i, d2) => { const w = d2 < rf2 ? hi : lo; if (w) this.put(w, k, i); });
        this.done(hi); this.done(lo);
      }
    }
    // impostors: everything with one, from just inside the near radius out to the far radius. Each type keeps
    // its own centre and at most one type is rebuilt per frame, so the work is spread out
    const MARGIN = 40;
    let budget = force ? this.imps.length : 1;
    for (const imp of this.imps) {
      if (!budget) break;
      if (!force && imp.at && Math.hypot(x - imp.at.x, z - imp.at.z) < 28) continue;
      budget--;
      imp.at = { x, z };
      const w = this.writer(imp.meshes);
      if (!w) continue;
      for (const k of this.kinds) {
        if (k.imp?.type !== imp) continue;
        const rn = Math.max(0, P.near * k.near - MARGIN), rn2 = rn * rn;
        const sm = k.imp.scale;
        this.walk(k, x, z, P.far, (i, d2) => { if (d2 >= rn2) this.put(w, k, i, sm); });
      }
      this.done(w);
    }
  }
}

// ------------------------------------------------------------------ impostors
// each tree type rendered once, front, side and from above, into a 4x3 atlas (albedo with its baked crown shading);
// far away a tree is two crossed cards with those pictures and a flat one across the crown for views from the air
function bakeImpostors(renderer, types, mats) {
  const S = 512;
  const rt = new THREE.WebGLRenderTarget(S * 4, S * 3, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const basicL = new THREE.MeshBasicMaterial({ map: mats.leaf.map, alphaTest: 0.5, vertexColors: true, side: THREE.DoubleSide });
  const basicB = new THREE.MeshBasicMaterial({ map: mats.bark.map, vertexColors: true });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const prev = { rt: renderer.getRenderTarget(), auto: renderer.autoClear, col: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha(), shadow: renderer.shadowMap.autoUpdate };
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x3a5226, 0);
  renderer.clear();
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;
  types.forEach((ty, ti) => {
    const meshes = [];
    if (ty.model.bark) meshes.push(new THREE.Mesh(ty.model.bark, basicB));
    if (ty.model.leaves) meshes.push(new THREE.Mesh(ty.model.leaves, basicL));
    for (const m of meshes) scene.add(m);
    const box = new THREE.Box3();
    for (const m of meshes) box.union(m.geometry.boundingBox);
    ty.views = [];
    for (let v = 0; v < 3; v++) {
      const cell = ti * 3 + v, x0 = cell % 4, y0 = Math.floor(cell / 4);
      if (v === 2) {
        // from above: screen right is +x, screen up is -z
        const half = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
        cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
        cam.updateProjectionMatrix();
        cam.up.set(0, 0, -1); cam.position.set(cx, box.max.y + 20, cz); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld(); cam.up.set(0, 1, 0);
        rt.viewport.set(x0 * S, y0 * S, S, S); rt.scissor.set(x0 * S, y0 * S, S, S); rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        ty.top = { u0: x0 / 4, u1: (x0 + 1) / 4, v0: y0 / 3, v1: (y0 + 1) / 3, cx, cz, half, y: box.min.y + (box.max.y - box.min.y) * 0.62 };
        continue;
      }
      // view 0 looks along -z (sees x), view 1 along +x (sees z)
      const lo = v ? box.min.z : box.min.x, hi = v ? box.max.z : box.max.x;
      const w = Math.max(hi - lo, 1), H = box.max.y - Math.min(0, box.min.y);
      const size = Math.max(w, H);
      const cx = (lo + hi) / 2;
      cam.left = -size / 2; cam.right = size / 2; cam.top = size; cam.bottom = 0;
      cam.updateProjectionMatrix();
      const yb = Math.min(0, box.min.y);
      if (v) { cam.position.set(-100, yb, cx); cam.lookAt(0, yb, cx); } else { cam.position.set(cx, yb, 100); cam.lookAt(cx, yb, 0); }
      cam.updateMatrixWorld();
      rt.viewport.set(x0 * S, y0 * S, S, S); rt.scissor.set(x0 * S, y0 * S, S, S); rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      ty.views.push({ u0: x0 / 4, u1: (x0 + 1) / 4, v0: y0 / 3, v1: (y0 + 1) / 3, cx, size, y0: yb });
    }
    for (const m of meshes) scene.remove(m);
  });
  rt.scissorTest = false;
  rt.viewport.set(0, 0, S * 4, S * 3);
  renderer.setRenderTarget(prev.rt);
  renderer.autoClear = prev.auto;
  renderer.setClearColor(prev.col, prev.a);
  renderer.shadowMap.autoUpdate = prev.shadow;
  basicL.dispose(); basicB.dispose();
  // the cards: one facing z (front view), one facing x (side view), spanning what each view saw
  for (const ty of types) {
    const p = [], n = [], uv = [], c = [], w = [], idx = [];
    const H = ty.views[0].size;
    ty.views.forEach((vw, v) => {
      const o = p.length / 3;
      const half = vw.size / 2;
      const corners = [[-half, 0], [half, 0], [half, vw.size], [-half, vw.size]];
      for (const [a, y] of corners) {
        const yy = y + vw.y0;
        // view 1 looks along +x from -x: its screen-right is +z
        const X = v ? 0 : vw.cx + a, Z = v ? vw.cx + a : 0;
        p.push(X, yy, Z);
        const nx = v ? -0.2 : a / half * 0.7, nz = v ? a / half * 0.7 : 0.2;
        const ny = (yy / H - 0.4) * 1.2;
        const L = Math.hypot(nx, ny, nz) || 1;
        n.push(nx / L, ny / L, nz / L);
        c.push(1, 1, 1);
        const t = Math.max(0, yy) / H;
        w.push(t * t * H / 10, 0);
      }
      uv.push(vw.u0, vw.v0, vw.u1, vw.v0, vw.u1, vw.v1, vw.u0, vw.v1);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    {
      const tp = ty.top, o = p.length / 3, t = Math.max(0, tp.y) / H;
      for (const [a, b] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        p.push(tp.cx + a * tp.half, tp.y, tp.cz + b * tp.half);
        n.push(0, 1, 0); c.push(1, 1, 1); w.push(t * t * H / 10, -1);
      }
      uv.push(tp.u0, tp.v0, tp.u1, tp.v0, tp.u1, tp.v1, tp.u0, tp.v1);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setAttribute('aw', new THREE.Float32BufferAttribute(w, 2));
    g.setIndex(idx);
    ty.geo = g;
  }
  return rt;
}

// ------------------------------------------------------------------ build
export async function buildVegetation(ctx) {
  const { renderer, scene, world, quality, tracks } = ctx;
  const P = PRESET[quality.name] || (quality.aiLod ? PRESET.low : PRESET.high);
  const rnd = mulberry(90210);
  const tl = new THREE.TextureLoader();
  const [fol, bark, barkN, biome, lavaMask, masks] = await Promise.all([
    tl.loadAsync(`${TEX}/foliage${P.tex}.webp`), tl.loadAsync(`${TEX}/bark.jpg`), tl.loadAsync(`${TEX}/bark_n.jpg`),
    readPixels(`${BASE}${world.dir}/biome.png`), readPixels(`${BASE}${world.dir}/lava_masks.png`), readPixels(`${BASE}${world.dir}/masks.png`),
  ]);
  fol.colorSpace = THREE.SRGBColorSpace;
  fol.anisotropy = 4;
  bark.colorSpace = THREE.SRGBColorSpace;
  for (const t of [bark, barkN]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  const mats = {
    leaf: patchPlant(new THREE.MeshStandardMaterial({ map: fol, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.35 }), { leaf: true, texSize: fol.image.width }),
    bark: patchPlant(new THREE.MeshStandardMaterial({ map: bark, normalMap: barkN, vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 })),
  };
  for (const m of Object.values(mats)) m.userData.depth = depthFor(m);
  const group = new THREE.Group();
  group.name = 'kaiele-vegetation';
  scene.add(group);
  const tf = performance.now();
  const F = buildFields(world, biome, lavaMask, masks);
  const groundAt = groundFn(world, quality);
  F.groundAt = groundAt;
  const D = P.detail;

  // ---------------------------------------------------------------- models
  const partsOf = (b, l) => [b && { geo: b, mat: mats.bark }, l && { geo: l, mat: mats.leaf }].filter(Boolean);
  const model = (m) => ({ ...m, parts: partsOf(m.bark, m.leaves), loParts: m.lo ? partsOf(m.lo.bark, m.lo.leaves) : null });
  const nv = D ? 1 : 0.5;
  const R = (k) => Math.max(1, Math.round(k * nv));
  const palms = Array.from({ length: R(4) }, (_, i) => model(palm(rnd, { H: 14, lean: i % 2 ? 0.38 : 0.16, detail: D })));
  const trees = Array.from({ length: R(3) }, () => model(canopyTree(rnd, { H: 22, spread: 8 + rnd() * 3, vines: D ? 3 : 1, detail: D })));
  const pales = Array.from({ length: R(2) }, () => model(canopyTree(rnd, { H: 18, spread: 7, pale: true, vines: 0, detail: D })));
  const small = Array.from({ length: R(2) }, (_, i) => model(canopyTree(rnd, { H: 9, spread: 6, pale: i === 1, vines: 0, detail: D, clusterK: 0.85, low: true })));
  const tunnel = [
    model(canopyTree(rnd, { H: 24, spread: 9, over: 0.6, lean: 0.12, vines: D ? 6 : 2, detail: D })),
    model(canopyTree(rnd, { H: 26, spread: 10, over: 0.7, lean: 0.18, vines: 0, detail: D })),
    model(canopyTree(rnd, { H: 22, spread: 8, over: 0.5, lean: 0.08, pale: true, vines: D ? 4 : 1, detail: D })),
  ];
  for (const t of tunnel) {
    // how far each reaches out over +x, and its lowest leaf there (vines must clear the trucks)
    const p = t.leaves.attributes.position;
    t.reach = 0; t.lowOver = 1e9;
    for (let i = 0; i < p.count; i++) { t.reach = Math.max(t.reach, p.getX(i)); if (p.getX(i) > 2.5) t.lowOver = Math.min(t.lowOver, p.getY(i)); }
  }
  const ferns = Array.from({ length: R(3) }, () => model(treeFern(rnd, { trunkH: 2.5 + rnd() * 2.5, L: 2.6 + rnd() * 0.8, detail: D })));
  const groundFerns = Array.from({ length: R(2) }, () => model(treeFern(rnd, { trunkH: 0, L: 1.2 + rnd() * 0.4, detail: D })));
  const bananas = Array.from({ length: R(2) }, () => model(banana(rnd, { H: 3.5 + rnd(), detail: D })));
  const bamboos = Array.from({ length: R(2) }, () => model(bamboo(rnd, { H: 11 + rnd() * 3, R: 1.5 + rnd(), detail: D })));
  const monstera = [model(leafClump(rnd, CELLS.monstera, { n: 8, s: 1.1, detail: D }))];
  const ti = [model(crossed(rnd, CELLS.ti, { k: 3, w: 1.4, h: 1.7 }))];
  const ginger = [model(crossed(rnd, CELLS.ginger, { k: 3, w: 0.9, h: 1.9 }))];
  const grass = Array.from({ length: R(2) }, () => model(crossed(rnd, CELLS.grass, { k: 3, w: 1.0, h: 0.75, up: true, tilt: 0.4 })));
  const naupaka = Array.from({ length: R(2) }, () => model(crossed(rnd, CELLS.naupaka, { k: 4, w: 2.0, h: 1.1 })));

  // impostor types: one picture per kind of tree silhouette
  const impTypes = [{ model: palms[palms.length - 1] }, { model: trees[0] }, { model: pales[0] }, { model: bamboos[0] }];
  const rt = bakeImpostors(renderer, impTypes, mats);
  const impMat = patchPlant(new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.4 }), { leaf: true, texSize: 2048, imp: true });
  for (const t of impTypes) { t.mat = impMat; t.H = t.model.H; }
  const [impPalm, impTree, impPale, impBamboo] = impTypes;

  const kinds = [];
  const K = (models, opts) => models.map((m, i) => {
    const imp = opts.imp ? { type: opts.imp, scale: (m.H / opts.imp.H) } : null;
    const k = new Kind(`${opts.name}${i}`, m, { ...opts, imp });
    kinds.push(k);
    return k;
  });
  const kPalm = K(palms, { name: 'palm', near: 1, imp: impPalm, shadow: true });
  const kTree = K(trees, { name: 'tree', near: 1, imp: impTree, shadow: true });
  const kPale = K(pales, { name: 'pale', near: 1, imp: impPale, shadow: true });
  const kSmall = [K([small[0]], { name: 'small', near: 0.9, imp: impTree, shadow: true })[0], K([small[small.length - 1]], { name: 'smallp', near: 0.9, imp: impPale, shadow: true })[0]];
  const kTunnel = K(tunnel, { name: 'tunnel', near: 1.15, imp: impTree, shadow: true });
  const kFern = K(ferns, { name: 'fern', near: 0.75, shadow: true });
  const kGFern = K(groundFerns, { name: 'gfern', near: 0.4 });
  const kBanana = K(bananas, { name: 'banana', near: 0.6, shadow: true });
  const kBamboo = K(bamboos, { name: 'bamboo', near: 1, imp: impBamboo, shadow: true });
  const kMonstera = K(monstera, { name: 'monstera', near: 0.4 });
  const kTi = K(ti, { name: 'ti', near: 0.4 });
  const kGinger = K(ginger, { name: 'ginger', near: 0.4 });
  const kGrass = K(grass, { name: 'grass', near: 0.3 });
  const kNaupaka = K(naupaka, { name: 'naupaka', near: 0.5 });
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // ---------------------------------------------------------------- placement rules
  const data = world.data;
  const gapNear = tracks.map((t) => {
    // rows near a jump or over a gap: keep trees well clear of the flight path
    const a = new Uint8Array(t.n);
    for (let i = 0; i < t.n; i++) if (t.c[i][4]) for (let j = -30; j <= 30; j++) a[t.wrap(i + j)] = 1;
    for (const j of t.jumps || []) for (let d = -40; d <= 40; d++) a[t.wrap(j.at + d)] = 1;
    return a;
  });
  const trackIdx = (ti) => tracks.findIndex((t) => t.id === data.tracks[ti]?.id);
  // set pieces other modules build: the sugar mill, the lighthouse, the beach camp, the fishing shacks
  const keepOut = [];
  for (const t of tracks) {
    const s = t.c[t.wrap(t.line ?? t.start)];
    if (t.id === 'wailele') keepOut.push([s[0], s[2], 60]);
    if (t.id === 'palikai') { keepOut.push([t.c[0][0], t.c[0][2], 50]); const e = t.c[t.n - 1]; keepOut.push([e[0], e[2], 40]); }
    if (t.id === 'kahakai') keepOut.push([s[0], s[2], 30]);
  }
  for (const b of data.buildings || []) keepOut.push([b.x, b.z, Math.max(b.w, b.d) / 2 + 3.5]);
  // flag the coarse cells near a set piece so most points skip the list
  const keepCell = new Uint8Array(F.G * F.G);
  for (const [a, b, r] of keepOut) for (let dz = -r - 16; dz <= r + 16; dz += 4) for (let dx = -r - 16; dx <= r + 16; dx += 4) keepCell[F.cellOf(a + dx, b + dz)] = 1;
  const kept = (x, z, pad = 0) => keepCell[F.cellOf(x, z)] === 1 && keepOut.some(([a, b, r]) => (x - a) ** 2 + (z - b) ** 2 < Math.max(0, r + pad) ** 2);
  const jungle = (ti) => data.tracks[ti]?.id === 'wailele';
  // clearance from the road edge by plant size; the jungle trail runs between walls of green
  const clear = (q, size) => {
    if (q.t < 0) return true;
    const tk = trackIdx(q.t);
    const gap = tk >= 0 && gapNear[tk][q.i];
    const need = size === 'tree' ? (gap ? 9 : jungle(q.t) ? 2.8 : 3.8) : size === 'bush' ? (gap ? 4 : jungle(q.t) ? 1.2 : 1.8) : 1.1;
    return q.edge > need;
  };
  const colliders = [];
  const collide = (x, y, z, r, yaw, h = 6) => {
    const q = F.trackAt(x, z);
    if (q.t < 0 || q.d > (data.tracks[q.t].width / 2 + 15)) return;
    const w = Math.max(0.35, r * 1.6);
    colliders.push({ x, y: y - 0.6, z, w, d: w, h, yaw });
  };
  const exposure = (x, z, hh, cst) => {
    let e = 1 + 0.5 * (1 - ss(0, 250, cst));
    // Pali Kai's cliff top takes the full trade wind
    if (z < -1150) e += 1.5 * ss(35, 75, hh) * (1 - ss(150, 500, cst));
    return e;
  };
  const tint = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const yawToward = (dx, dz) => Math.atan2(-dz, dx);

  // ---------------------------------------------------------------- the canopy tunnel on the jungle trail
  const tunnelRows = [];
  const Nrm = new THREE.Vector3();
  const wl = tracks.find((t) => t.id === 'wailele');
  if (wl && wl.gorge && wl.trestle) {
    const a = wl.gorge.land + 12, b = wl.trestle[0] - 8;
    let gapUntil = -1, gapSide = 0, nextGap = a + 60 + rnd() * 50;
    for (let i = a; i < b; i += 5 + rnd() * 4) {
      const ii = Math.round(i);
      tunnelRows.push(ii);
      // every ~100 m a break in the canopy on one side or both: the sun comes through in shafts
      if (ii > nextGap) { gapUntil = ii + 10 + rnd() * 14; gapSide = rnd() < 0.4 ? 0 : rnd() < 0.5 ? -1 : 1; nextGap = ii + 80 + rnd() * 60; }
      const f = wl.frame(ii);
      const road = wl.c[ii][1];
      for (const side of [-1, 1]) {
        if (ii < gapUntil && (gapSide === 0 || gapSide === side)) continue;
        // a few spots out from the verge: the first that is not water, cliff or too low to clear the trucks
        for (const [l0, l1] of [[3, 6.5], [6.5, 10], [2.8, 4]]) {
          const lat = side * (wl.width / 2 + l0 + rnd() * (l1 - l0));
          const x = f.x + f.nx * lat + f.tx * (rnd() - 0.5) * 2, z = f.z + f.nz * lat + f.tz * (rnd() - 0.5) * 2;
          const q = F.trackAt(x, z);
          if (!clear(q, 'tree') || F.waterAt(x, z) < 4 || kept(x, z)) continue;
          if (world.normalAt(x, z, Nrm).y < 0.35) continue;
          // on the steep banks the buttresses sink into the slope
          const gy = groundAt(x, z) - (1 - Nrm.y) * 4;
          let k = Math.floor(rnd() * kTunnel.length);
          const s = THREE.MathUtils.clamp((Math.abs(lat) + 1.5 + rnd() * 2) / tunnel[k].reach, 0.75, 1.3);
          // vines and low leaves over the road must hang above a truck on a jump
          if (gy + tunnel[k].lowOver * s < road + 6.5) { k = 1; if (gy + tunnel[1].lowOver * s < road + 6.5) continue; }
          const yaw = yawToward(-f.nx * side, -f.nz * side) + (rnd() - 0.5) * 0.3;
          kTunnel[k].add(x, gy - 0.3, z, yaw, s, 0.8, tint([1, 1, 1], [0.85, 0.95, 0.8], rnd()));
          collide(x, gy, z, tunnel[k].trunkR * s, yaw, 8);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- the island, cell by cell
  const { G, CS, half } = F;
  const t0 = performance.now();
  const fieldMs = Math.round(t0 - tf);
  let nTry = 0;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const c = j * G + i;
    const hc = F.h[c];
    if (hc < 0.4) continue;
    const cst = F.coast[c], riv = F.river[c], trk = F.track[c];
    const cx = -half + (i + 0.5) * CS, cz = -half + (j + 0.5) * CS;
    const veg = F.vegAt(cx, cz, hc, cst, riv);
    const v = veg.v;
    // Pali Kai's headlands and cliff top are windswept grass with a few bent trees
    const headland = cz < -1150 ? ss(25, 60, hc) * (1 - ss(250, 600, cst)) : 0;
    // the coastal lowland (the fishing village, the palm grove) is palms, hau and grass; rainforest starts up the
    // slopes and fills the valleys
    const lowCoast = (1 - ss(18, 60, hc)) * (1 - ss(250, 600, cst)) * ss(60, 160, riv);
    const forest = ss(0.45, 0.85, v) * ss(15, 60, cst) * (1 - 0.9 * headland) * (1 - 0.92 * lowCoast);
    const area = CS * CS;
    const nearTrk = trk < 130;
    // maxSlope (rise over run): trees don't grow out of cliff faces
    const spawn = (lambda, f, maxSlope = 1.4) => {
      let n = Math.floor(lambda * area + rnd());
      while (n-- > 0) {
        const x = cx + (rnd() - 0.5) * CS, z = cz + (rnd() - 0.5) * CS;
        nTry++;
        world.normalAt(x, z, Nrm);
        if (Nrm.y < 1 / Math.sqrt(1 + maxSlope * maxSlope)) continue;
        f(x, z, groundAt(x, z));
      }
    };
    const okWater = (x, z, m) => riv > 30 || F.waterAt(x, z) > m;
    // coconut palms: along the beaches, clustered, leaning out over the sand towards the sea
    const beach = (1 - ss(70, 140, cst)) * ss(4, 12, cst) * (1 - ss(18, 30, hc)) * (1 - ss(0.35, 0.6, veg.slope));
    const lowland = (1 - ss(250, 550, cst)) * (1 - ss(30, 70, hc)) * (1 - headland);
    const clump = ss(-0.15, 0.45, vnoise(cx / 70, 3.3, cz / 70));
    const lp = (beach * clump * 1.2 + lowland * (0.04 + (nearTrk ? 0.5 : 0.15) * clump)) / 110 * P.trees;
    if (lp > 0) spawn(lp, (x, z, gy) => {
      if (gy < 1.2 || !okWater(x, z, 4) || kept(x, z)) return;
      const q = F.trackAt(x, z);
      if (!clear(q, 'tree')) return;
      // lean seaward: down the coast-distance gradient
      const gx = F.coast[F.cellOf(x + CS, z)] - F.coast[F.cellOf(x - CS, z)], gz = F.coast[F.cellOf(x, z + CS)] - F.coast[F.cellOf(x, z - CS)];
      const near = 1 - ss(20, 120, cst);
      const lean = rnd() < 0.5 + near * 0.4;
      const k = (lean ? 1 : 0) + 2 * Math.floor(rnd() * Math.ceil(kPalm.length / 2));
      const kk = Math.min(kPalm.length - 1, k);
      const H = 9 + rnd() * 12;
      const yaw = (Math.hypot(gx, gz) > 0.1 ? yawToward(-gx, -gz) : rnd() * 6.28) + (rnd() - 0.5) * 0.9;
      const s = H / palms[kk].H;
      kPalm[kk].add(x, gy - 0.15, z, yaw, s, exposure(x, z, gy, cst), tint([1, 1, 1], [1.05, 1.0, 0.85], rnd()));
      collide(x, gy, z, palms[kk].trunkR * s, yaw, 4);
    }, 0.7);
    // naupaka on the dunes and the beach heads
    const dune = (1 - ss(45, 90, cst)) * ss(3, 8, cst) * (1 - ss(14, 25, hc)) * (nearTrk ? 1 : 0.25);
    if (dune > 0) spawn(dune / 22 * P.small, (x, z, gy) => {
      if (gy < 0.9 || !okWater(x, z, 2)) return;
      if (!clear(F.trackAt(x, z), 'bush') || kept(x, z)) return;
      kNaupaka[Math.floor(rnd() * kNaupaka.length)].add(x, gy - 0.15, z, rnd() * 6.28, 1.1 + rnd() * 1.1, exposure(x, z, gy, cst), tint([1, 1, 1], [1.1, 1.05, 0.85], rnd()));
    }, 0.9);
    // rainforest canopy: big trees where it's lush, scattered smaller ones on the grassland
    const far = trk > 500 ? 0.55 : 1;
    const tp = (forest / 42 + ss(0.15, 0.4, v) * (1 - forest) / 700) * P.trees * far;
    if (tp > 0) spawn(tp, (x, z, gy) => {
      if (!okWater(x, z, 4) || kept(x, z)) return;
      const q = F.trackAt(x, z);
      if (!clear(q, 'tree')) return;
      const big = forest > 0.3 && rnd() < 0.85;
      const pale = rnd() < (big ? 0.18 : 0.4) + 0.2 * (1 - ss(50, 200, F.river[F.cellOf(x, z)]));
      let k, m;
      if (big) { const arr = pale ? kPale : kTree; k = arr[Math.floor(rnd() * arr.length)]; m = k.model; } else { k = kSmall[pale ? 1 : 0]; m = k.model; }
      const H = big ? (11 + rnd() * 17) * (0.8 + 0.2 * forest) : 6 + rnd() * 7;
      const s = H / m.H;
      // low spreading crowns stay off the road; tall canopies may arch over it
      if (!big && q.t >= 0 && q.edge < 7.5 * s + 1) return;
      const yaw = rnd() * 6.28;
      k.add(x, gy - 0.3 - (1 - Nrm.y) * 4, z, yaw, s, (big ? 0.85 : 1.1) * exposure(x, z, gy, cst), tint([1, 1, 1], pale ? [1.08, 1.05, 0.95] : [0.8, 0.92, 0.78], rnd()));
      collide(x, gy, z, m.trunkR * s, yaw);
    }, 1.2);
    // hapu'u tree ferns under the canopy, thickest along the streams
    const fp = forest * (1 + 1.5 * (1 - ss(40, 200, riv))) / 110 * P.trees * (1 - ss(150, 260, trk));
    if (fp > 0) spawn(fp, (x, z, gy) => {
      if (!okWater(x, z, 2) || kept(x, z)) return;
      const q = F.trackAt(x, z);
      if (!clear(q, 'bush') || q.edge < 2) return;
      const k = pick(kFern), s = 0.7 + rnd() * 0.6;
      k.add(x, gy - 0.2, z, rnd() * 6.28, s, 1, tint([1, 1, 1], [0.85, 1, 0.8], rnd()));
      collide(x, gy, z, 0.22 * s, 0, 4);
    }, 1.0);
    // bananas and bamboo down on the valley floor by the water
    const valley = (1 - ss(15, 110, riv)) * ss(10, 30, cst) * ss(0.2, 0.5, v) * (1 - ss(300, 450, trk));
    if (valley > 0) {
      spawn(valley / 260 * P.trees, (x, z, gy) => {
        if (!okWater(x, z, 3) || kept(x, z) || !clear(F.trackAt(x, z), 'bush')) return;
        pick(kBanana).add(x, gy - 0.1, z, rnd() * 6.28, 0.8 + rnd() * 0.5, 1.1, tint([1, 1, 1], [1.1, 1.05, 0.8], rnd()));
      }, 0.9);
      spawn(valley * clump / 1400 * P.trees, (x, z, gy) => {
        if (!okWater(x, z, 5) || kept(x, z)) return;
        const q = F.trackAt(x, z);
        if (q.edge < 5.5) return;
        const k = pick(kBamboo);
        k.add(x, gy - 0.2, z, rnd() * 6.28, 0.85 + rnd() * 0.3, 1, tint([1, 1, 1], [1.1, 1.08, 0.8], rnd()));
      }, 0.8);
    }
    // bananas in the yards of the fishing village
    // understorey along the tracks: ferns, monstera, ti and red ginger; a dense green wall beside the jungle trail
    const jungleTrail = trk < 40 && wl && Math.hypot(cx - 0, cz - 200) < 700 ? 0.8 : 0;
    const under = Math.max(forest, jungleTrail);
    if (nearTrk && under > 0.15) {
      const wall = trk < 30 ? 2.2 : 1;
      spawn(under * wall / 14 * P.small, (x, z, gy) => {
        if (!okWater(x, z, 1) || kept(x, z)) return;
        const q = F.trackAt(x, z);
        if (!clear(q, 'bush')) return;
        const r = rnd(), ex = 0.8;
        const col = tint([1, 1, 1], [0.8, 0.9, 0.75], rnd());
        if (r < 0.4) pick(kGFern).add(x, gy - 0.05, z, rnd() * 6.28, 0.7 + rnd() * 0.7, ex, col);
        else if (r < 0.62) kMonstera[0].add(x, gy - 0.05, z, rnd() * 6.28, 0.7 + rnd() * 0.6, ex, col);
        else if (r < 0.82) kTi[0].add(x, gy - 0.05, z, rnd() * 6.28, 0.7 + rnd() * 0.6, ex, tint([1, 1, 1], [1.25, 0.7, 0.75], rnd() ** 2));
        else kGinger[0].add(x, gy - 0.05, z, rnd() * 6.28, 0.7 + rnd() * 0.5, ex, col);
      }, 1.1);
    }
    // grass on the open ground near the tracks: headlands, cliff tops, road verges; little on fresh lava or sand
    if (trk < 110) {
      const sand = Math.max(F.sample(biome, cx, cz, 0), (1 - ss(25, 60, cst)) * (1 - ss(5, 9, hc)));
      const open = (0.35 + 0.65 * ss(0.1, 0.35, v)) * (1 - 0.75 * forest) * (1 - sand * 0.9) * (1 - veg.rock * 0.85) * (1 - veg.fresh * 0.9);
      const dense = trk < 40 ? 1.6 : 1;
      if (open > 0.02) spawn(open * dense / 3 * P.small, (x, z, gy) => {
        if (gy < 0.8 || !okWater(x, z, 0.5)) return;
        const q = F.trackAt(x, z);
        if (!clear(q, 'grass') || kept(x, z, -10)) return;
        pick(kGrass).add(x, gy - 0.04, z, rnd() * 6.28, 0.6 + rnd() * 0.8, exposure(x, z, gy, cst), tint([0.9, 0.95, 0.85], [1.15, 1.05, 0.7], rnd() * (0.3 + 0.4 * (1 - v))));
      });
      // sparse ferns and grass break through the fresh lava
      if (veg.rock > 0.4 || veg.fresh > 0.3) spawn(0.012 * P.small, (x, z, gy) => {
        if (!clear(F.trackAt(x, z), 'bush')) return;
        pick(kGFern).add(x, gy - 0.05, z, rnd() * 6.28, 0.4 + rnd() * 0.4, 1, tint([1, 1, 1], [1.2, 0.9, 0.7], rnd()));
      });
    }
  }
  const counts = Object.fromEntries(kinds.map((k) => [k.name, k.list.length]));
  const total = kinds.reduce((s, k) => s + k.list.length, 0);
  console.info(`kaiele vegetation: ${total} plants (${nTry} tried) in ${Math.round(performance.now() - t0)} ms (fields, models, impostors ${fieldMs} ms)`, JSON.stringify(counts), `${colliders.length} trunk colliders`);

  const lod = new LodSet(kinds, impTypes, P, group);
  const cam = ctx.camera?.position || new THREE.Vector3();
  lod.update(cam, true);
  const life = await buildLife(ctx, { F, tunnelRows, palms: kPalm, trees: [...kTree, ...kTunnel] });
  const sv = new THREE.Vector3();
  // ?vegstats: draw stats for profiling (instances drawn per kind, LOD update time)
  const stats = new URLSearchParams(location.search).has('vegstats') ? (window.__veg = { renderer, lod, ms: 0, counts }) : null;
  return {
    colliders,
    group,
    update(t, dt, camera, race) {
      wind.uTime.value = t;
      if (camera) {
        if (stats) { renderer.info.autoReset = false; renderer.info.reset(); }
        const t1 = stats && performance.now();
        lod.update(camera.position);
        if (stats) stats.ms = Math.max(stats.ms, performance.now() - t1);
        sv.copy(ctx.sun || up).normalize().transformDirection(camera.matrixWorldInverse);
        sunView.value.copy(sv);
      }
      life?.update(t, dt, camera, race);
    },
  };
}
