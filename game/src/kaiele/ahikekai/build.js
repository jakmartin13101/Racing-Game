import * as THREE from 'three';

// Geometry helpers for the set pieces: sweep a cross-section along a run of track-frame rows, and merge
// simple boxes into one buffer with extra per-vertex attributes.

// rows: [{x, y, z, nx, nz, tx, tz, ...extra}], sec: [[lat, dy], ...] (a closed or open polygon in the
// row's lateral plane). attrs: {name: (row, k, secIndex) => value} per-vertex scalar attributes.
export function sweep(rows, sec, { closed = false, attrs = {}, latOf = null, dyOf = null } = {}) {
  const P = [], idx = [], A = Object.fromEntries(Object.keys(attrs).map((k) => [k, []]));
  const S = sec.length;
  rows.forEach((r, j) => {
    sec.forEach(([l, d], k) => {
      const lat = latOf ? latOf(r, l, k) : l, dy = dyOf ? dyOf(r, d, k) : d;
      P.push(r.x + r.nx * lat, r.y + dy, r.z + r.nz * lat);
      for (const [n, fn] of Object.entries(attrs)) A[n].push(fn(r, k, j));
    });
  });
  const segs = closed ? S : S - 1;
  for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < segs; k++) {
    const a = j * S + k, b = j * S + (k + 1) % S, c = a + S, d = b + S;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  for (const [n, arr] of Object.entries(A)) g.setAttribute(n, new THREE.Float32BufferAttribute(arr, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Collects transformed copies of geometries into one, with constant per-piece attribute values.
export class Merger {
  constructor(attrNames = []) { this.parts = []; this.attrNames = attrNames; }
  add(geo, matrix, vals = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    for (const a of this.attrNames) {
      const v = vals[a];
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) arr[i] = typeof v === 'function' ? v(g.attributes.position, i) : (v ?? 0);
      g.setAttribute(a, new THREE.BufferAttribute(arr, 1));
    }
    this.parts.push(g);
  }
  build() {
    if (!this.parts.length) return null;
    const keys = ['position', 'normal', ...this.attrNames];
    let n = 0;
    for (const p of this.parts) n += p.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const k of keys) {
      const sz = k === 'position' || k === 'normal' ? 3 : 1;
      const arr = new Float32Array(n * sz);
      let o = 0;
      for (const p of this.parts) { arr.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }
      out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
    }
    if (this.parts.every((p) => p.attributes.uv)) {
      const arr = new Float32Array(n * 2);
      let o = 0;
      for (const p of this.parts) { arr.set(p.attributes.uv.array, o); o += p.attributes.uv.array.length; }
      out.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
    }
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return out;
  }
}

// a matrix for a box centred at p, yawed, then pitched/rolled
export function mat4(p, yaw = 0, pitch = 0, roll = 0, s = null) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
  return new THREE.Matrix4().compose(p, q, s || new THREE.Vector3(1, 1, 1));
}

// a canvas texture
export function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
