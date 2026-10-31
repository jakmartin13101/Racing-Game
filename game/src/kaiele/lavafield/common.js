import * as THREE from 'three';

// Shared bits for the lava field dressing: the lava masks, track and lava proximity lookups, the terrain lattice,
// and the extra textures.
const BASE = import.meta.env.BASE_URL;
const loader = new THREE.TextureLoader();

export function kTex(name, srgb = false, repeat = true) {
  const t = loader.load(`${BASE}textures/kaiele/${name}`);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// lava_masks.png: R fresh lava field cover, G share of it that is 'a'a rubble. Read back to the CPU for placement,
// and kept as a texture for the shaders.
export async function loadMasks(world) {
  const url = `${BASE}${world.dir || 'world'}/lava_masks.png`;
  const img = await new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
  const S = img ? img.width : 1;
  let R = new Uint8Array(1), G = new Uint8Array(1);
  if (img) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, S, S).data;
    R = new Uint8Array(S * S); G = new Uint8Array(S * S);
    for (let i = 0, k = 0; i < S * S; i++, k += 4) { R[i] = d[k]; G[i] = d[k + 1]; }
  }
  const tex = img ? new THREE.Texture(img) : new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  const ext = world.extent, half = world.half;
  const at = (A, x, z) => {
    if (!img) return A === R ? 1 : 0;
    const fx = (x + half) / ext * S - 0.5, fz = (z + half) / ext * S - 0.5;
    const ix = Math.max(0, Math.min(S - 2, Math.floor(fx))), iz = Math.max(0, Math.min(S - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
    const i = iz * S + ix;
    return ((A[i] * (1 - tx) + A[i + 1] * tx) * (1 - tz) + (A[i + S] * (1 - tx) + A[i + S + 1] * tx) * tz) / 255;
  };
  return { tex, fresh: (x, z) => at(R, x, z), aa: (x, z) => at(G, x, z) };
}

// nearest-point lookups on a set of 2D points (track centres, lava river points), bucketed on a grid
export class PointGrid {
  constructor(pts, cell = 32) {
    this.cell = cell; this.map = new Map();
    for (const p of pts) {
      const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
      let l = this.map.get(k);
      if (!l) this.map.set(k, (l = []));
      l.push(p);
    }
  }
  // distance to the nearest point, searched out to r (returns r when nothing is closer); best point in this.best
  dist(x, z, r) {
    const c = this.cell, n = Math.ceil(r / c);
    const gx = Math.floor(x / c), gz = Math.floor(z / c);
    let bd = r * r; this.best = null;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const l = this.map.get(`${gx + i},${gz + j}`);
      if (!l) continue;
      for (const p of l) {
        const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d < bd) { bd = d; this.best = p; }
      }
    }
    return Math.sqrt(bd);
  }
}

// The ground mesh's own vertex lattice (see buildGeometry in kaiele/terrain.js): decals laid on exactly these
// vertices and triangulated the same way are coplanar with the ground, so they never clip into it or float above
// it. Only the fine chunks (64 m, within 150 m of a road) share one lattice; ok(x, z) says whether a cell is in one.
export function terrainAxes(world, quality) {
  const { half, extent, data } = world;
  const C = 64, NC = Math.round(extent / C);
  const fine = Math.max(world.res, quality.terrainStep || 3);
  const st = C / Math.max(2, Math.round(C / fine));
  const axis = [];
  for (let v = -half; v <= half + 1e-6; v += st) axis.push(v);
  const lv0 = new Uint8Array(NC * NC);
  for (const t of data.tracks) for (let k = 0; k < t.centre.length; k += 4) {
    const x = t.centre[k][0], z = t.centre[k][2], r = 150;
    const i0 = Math.max(0, Math.floor((x - r + half) / C)), i1 = Math.min(NC - 1, Math.floor((x + r + half) / C));
    const j0 = Math.max(0, Math.floor((z - r + half) / C)), j1 = Math.min(NC - 1, Math.floor((z + r + half) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = Math.max(-half + i * C - x, 0, x - (-half + (i + 1) * C));
      const dz = Math.max(-half + j * C - z, 0, z - (-half + (j + 1) * C));
      if (dx * dx + dz * dz < r * r) lv0[j * NC + i] = 1;
    }
  }
  const ok = (x, z) => {
    const i = Math.floor((x + half) / C), j = Math.floor((z + half) / C);
    return i >= 0 && j >= 0 && i < NC && j < NC && lv0[j * NC + i] === 1;
  };
  return { ax: axis, az: axis, ok };
}

// index of the last axis value <= v (binary search)
export function axisIndex(a, v) {
  let lo = 0, hi = a.length - 1;
  if (v <= a[0]) return 0;
  if (v >= a[hi]) return hi - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m; else hi = m; }
  return lo;
}

// river helpers: arc length along each lava river, with the flow speed the river shader scrolls its crust at
export function riverPaths(world) {
  return world.data.rivers.map((rv) => {
    const P = rv.points, n = P.length;
    const s = new Float32Array(n), spd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i) s[i] = s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]);
      const q = P[Math.min(i + 1, n - 1)], o = P[Math.max(i - 1, 0)];
      const drop = (o[1] - q[1]) / (Math.hypot(q[0] - o[0], q[2] - o[2]) || 1);
      spd[i] = THREE.MathUtils.clamp(2.2 + drop * 30, 2.2, 9);
    }
    // position, tangent and half width at arc length t
    const sample = (t, out) => {
      t = Math.max(0, Math.min(s[n - 1] - 1e-3, t));
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= t) lo = m; else hi = m; }
      const f = (t - s[lo]) / ((s[hi] - s[lo]) || 1);
      const a = P[lo], b = P[hi];
      out.x = a[0] + (b[0] - a[0]) * f; out.y = a[1] + (b[1] - a[1]) * f; out.z = a[2] + (b[2] - a[2]) * f;
      const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      out.tx = (b[0] - a[0]) / L; out.tz = (b[2] - a[2]) / L;
      out.w = (rv.width[lo] * (1 - f) + rv.width[hi] * f) * 0.5;
      out.spd = spd[lo] * (1 - f) + spd[hi] * f;
      return out;
    };
    return { rv, P, s, spd, len: s[n - 1], sample };
  });
}

export function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
