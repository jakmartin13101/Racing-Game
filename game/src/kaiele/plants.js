import * as THREE from 'three';

// Procedural plant models for Kai'ele: coconut palms, rainforest canopy trees, hapu'u tree ferns, bananas, bamboo
// clumps and the understorey. Each generator returns { bark, leaves } BufferGeometries in metres (base at the
// origin, y up) that share two materials: bark (eight 128 px strips of textures/kaiele/plants/bark.jpg) and leaves
// (alpha-cut cards in foliage.webp; cells as tools/kaiele_plants.py paints them). Every vertex carries aw =
// (bend, flutter): bend is how far the wind sways it, in tenths of the plant's height at its top; flutter is how
// much a leaf trembles about that.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const A = 2048;
const cell = (x, y, w, h) => ({ u0: x / A + 0.001, u1: (x + w) / A - 0.001, v0: 1 - (y + h) / A + 0.001, v1: 1 - y / A - 0.002 });
export const CELLS = {
  palm: cell(0, 0, 512, 1024), palmOld: cell(0, 1024, 512, 1024), fern: cell(512, 0, 512, 1024), banana: cell(512, 1024, 512, 1024),
  canopy: cell(1024, 0, 512, 512), kukui: cell(1536, 0, 512, 512), monstera: cell(1024, 512, 512, 512), ti: cell(1536, 512, 512, 512),
  grass: cell(1024, 1024, 512, 512), naupaka: cell(1536, 1024, 512, 512), bamboo: cell(1024, 1536, 512, 512),
  vine: cell(1536, 1536, 256, 512), ginger: cell(1792, 1536, 256, 512),
};
// bark strips
export const STRIP = { palm: 0, bark: 1, fern: 2, bamboo: 3, banana: 4, husk: 5, root: 6, sheath: 7 };

class Mesher {
  constructor(H) { this.H = H; this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.i = []; }
  bend(y) { const t = Math.max(0, y) / this.H; return t * t * this.H / 10; }
  v(p, n, u, v, col, flut = 0) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.c.push(col[0], col[1], col[2]); this.w.push(this.bend(p.y), flut);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  geometry() {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aw', new THREE.Float32BufferAttribute(this.w, 2));
    g.setIndex(this.i);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  // a tube along pts (Vector3) with radius rad(t, angle), bark strip k; vPerM: texture repeats per metre
  tube(pts, rad, sides, k, col, vPerM = 0.12, capTop = false) {
    const u0 = k / 8 + 0.002, du = 1 / 8 - 0.004;
    const T = [], N = [];
    for (let j = 0; j < pts.length; j++) T.push(pts[Math.min(j + 1, pts.length - 1)].clone().sub(pts[Math.max(j - 1, 0)]).normalize());
    // parallel-transported frame so the bark doesn't twist
    let n = Math.abs(T[0].y) < 0.95 ? V(0, 1, 0).cross(T[0]).normalize() : V(1, 0, 0);
    for (let j = 0; j < pts.length; j++) {
      if (j) { const b = T[j - 1].clone().cross(T[j]); if (b.lengthSq() > 1e-8) n.applyAxisAngle(b.normalize(), T[j - 1].angleTo(T[j])); }
      N.push(n.clone());
    }
    let s = 0;
    const base = this.p.length / 3;
    for (let j = 0; j < pts.length; j++) {
      if (j) s += pts[j].distanceTo(pts[j - 1]);
      const t = j / (pts.length - 1), bi = T[j].clone().cross(N[j]);
      for (let a = 0; a <= sides; a++) {
        const th = a / sides * Math.PI * 2;
        const dir = N[j].clone().multiplyScalar(Math.cos(th)).addScaledVector(bi, Math.sin(th));
        const r = rad(t, th);
        const ao = 0.7 + 0.3 * Math.min(1, pts[j].y / 2 + 0.2);
        this.v(pts[j].clone().addScaledVector(dir, r), dir, u0 + du * a / sides, s * vPerM, [col[0] * ao, col[1] * ao, col[2] * ao]);
      }
    }
    for (let j = 0; j < pts.length - 1; j++) for (let a = 0; a < sides; a++) {
      const i0 = base + j * (sides + 1) + a, i1 = i0 + sides + 1;
      this.quad(i0, i0 + 1, i1 + 1, i1);
    }
    if (capTop) {
      const c = this.v(pts[pts.length - 1], T[T.length - 1], u0 + du / 2, s * vPerM, col);
      const last = base + (pts.length - 1) * (sides + 1);
      for (let a = 0; a < sides; a++) this.tri(last + a, last + a + 1, c);
    }
  }

  // a leaf card along a spine (Vector3[]), with its edges dropped by fold * half width into a V (leaflets hang
  // from the midrib); normals blend the card's own with "out from the plant" so the crown shades as one mass
  ribbon(spine, hw, c, col, { fold = 0.3, centre = null, flut = 1, side = null, roll = 0 } = {}) {
    const S = spine.length - 1;
    const rows = [];
    for (let k = 0; k <= S; k++) {
      const t = k / S;
      const tan = spine[Math.min(k + 1, S)].clone().sub(spine[Math.max(k - 1, 0)]).normalize();
      let sd = side ? side.clone() : tan.clone().cross(UP);
      if (sd.lengthSq() < 1e-4) sd.set(1, 0, 0);
      sd.addScaledVector(tan, -sd.dot(tan)).normalize();
      if (roll) sd.applyAxisAngle(tan, roll * t);
      let dn = sd.clone().cross(tan).normalize();
      if (dn.y > 0) dn.negate();
      const w = hw * (k === 0 ? 0.6 : 1);
      const L = spine[k].clone().addScaledVector(sd, w).addScaledVector(dn, fold * w);
      const R = spine[k].clone().addScaledVector(sd, -w).addScaledVector(dn, fold * w);
      const nn = dn.clone().negate();
      if (centre) nn.multiplyScalar(0.45).add(spine[k].clone().sub(centre).normalize().multiplyScalar(0.55)).add(V(0, 0.35, 0)).normalize();
      const v = c.v0 + (c.v1 - c.v0) * t, uc = (c.u0 + c.u1) / 2;
      const f = flut * Math.pow(t, 1.3);
      rows.push([this.v(L, nn, c.u0, v, col, f), this.v(spine[k], nn, uc, v, col, f * 0.6), this.v(R, nn, c.u1, v, col, f)]);
    }
    for (let k = 0; k < S; k++) {
      const a = rows[k], b = rows[k + 1];
      this.quad(a[0], a[1], b[1], b[0]);
      this.quad(a[1], a[2], b[2], b[1]);
    }
  }

  // a flat card: base point, right and up vectors (full width / height), normal mode
  card(base, right, up, c, col, { centre = null, flut = 0.6, n = null, centred = false } = {}) {
    const o = centred ? base.clone().addScaledVector(up, -0.5) : base;
    const nf = n || right.clone().cross(up).normalize();
    const nrm = (p) => {
      if (!centre) return nf;
      return p.clone().sub(centre).normalize().multiplyScalar(0.7).add(V(0, 0.45, 0)).normalize();
    };
    const p0 = o.clone().addScaledVector(right, -0.5), p1 = o.clone().addScaledVector(right, 0.5);
    const p2 = p1.clone().add(up), p3 = p0.clone().add(up);
    const a = this.v(p0, nrm(p0), c.u0, c.v0, col, flut * 0.3), b = this.v(p1, nrm(p1), c.u1, c.v0, col, flut * 0.3);
    const d = this.v(p2, nrm(p2), c.u1, c.v1, col, flut), e = this.v(p3, nrm(p3), c.u0, c.v1, col, flut);
    this.quad(a, b, d, e);
  }

  sphere(c, r, k, col) {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const p = ico.attributes.position;
    const u0 = k / 8 + 0.01;
    for (let i = 0; i < p.count; i += 3) {
      const ids = [];
      for (let j = 0; j < 3; j++) {
        const d = V(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
        ids.push(this.v(c.clone().addScaledVector(d, r), d, u0 + (d.x * 0.5 + 0.5) * 0.1, d.y * 0.2, col));
      }
      this.tri(ids[0], ids[1], ids[2]);
    }
  }
}

// writes every model twice: full detail, and a light one for the middle distance (every other leaf card, a
// little bigger to keep the crown as dense; fewer trunk sides and rings). Both draw the same random plant.
class Dual {
  constructor(H) { this.hi = new Mesher(H); this.lo = new Mesher(H); }
  tube(pts, rad, sides, k, col, vPerM, cap) {
    this.hi.tube(pts, rad, sides, k, col, vPerM, cap);
    const lp = pts.length > 4 ? pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) : pts;
    if (sides >= 5 || pts.length > 3) this.lo.tube(lp, rad, Math.max(4, Math.round(sides * 0.6)), k, col, vPerM, cap);
  }
  ribbon(spine, hw, c, col, o, keep = true) {
    this.hi.ribbon(spine, hw, c, col, o);
    if (!keep) return;
    const n = spine.length - 1, m = Math.min(n, 3);
    this.lo.ribbon(Array.from({ length: m + 1 }, (_, i) => spine[Math.round(i / m * n)]), hw * 1.15, c, col, o);
  }
  card(base, right, up, c, col, o = {}, keep = true) {
    this.hi.card(base, right, up, c, col, o);
    if (keep) this.lo.card(base, right.clone().multiplyScalar(1.3), up.clone().multiplyScalar(1.3), c, col, o);
  }
  sphere(c, r, k, col) { this.hi.sphere(c, r, k, col); }
  out(bark, leaves, extra) {
    return { bark: bark?.hi.geometry(), leaves: leaves?.hi.geometry(), lo: { bark: bark?.lo.geometry(), leaves: leaves?.lo.geometry() }, ...extra };
  }
}

const tint = (rnd, base, k = 0.12) => base.map((v) => v * (1 - k + rnd() * 2 * k));
const dirFrom = (az, el) => V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));

// a frond's spine: leaves the crown at elevation el, curling down by droop radians, gently twisted
function arch(start, az, el, L, droop, segs) {
  const pts = [start.clone()];
  let p = start.clone();
  for (let k = 1; k <= segs; k++) {
    const e = el - droop * Math.pow(k / segs, 1.4);
    p = p.clone().addScaledVector(dirFrom(az, e), L / segs);
    pts.push(p);
  }
  return pts;
}

// ------------------------------------------------------------------ coconut palm
// leans towards +x (the placer turns that seaward); the trunk curves back up towards the light
export function palm(rnd, { H = 14, lean = 0.25, detail = 1 } = {}) {
  const bark = new Dual(H), leaves = new Dual(H);
  const N = 12;
  const pts = [];
  let p = V(), ang = lean;
  const wob = rnd() * 6.28;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    pts.push(p.clone());
    ang = lean * (1 - 0.7 * t * t) + 0.04 * Math.sin(t * 7 + wob);
    p = p.clone().add(V(Math.sin(ang), Math.cos(ang), 0.05 * Math.sin(t * 5 + wob)).multiplyScalar(H / N / Math.cos(lean * 0.6)));
  }
  const R0 = 0.16 + rnd() * 0.06;
  bark.tube(pts, (t) => R0 * (1 + 0.7 * Math.pow(1 - t, 10)) * (1 - 0.28 * t), 8, STRIP.palm, tint(rnd, [1, 1, 1], 0.08), 0.09);
  const top = pts[N].clone();
  const tdir = pts[N].clone().sub(pts[N - 1]).normalize();
  // the crown shaft wrapped in old leaf sheaths
  bark.tube([top.clone().addScaledVector(tdir, -0.5), top.clone(), top.clone().addScaledVector(tdir, 0.55)], (t) => R0 * (1.25 + 0.35 * Math.sin(t * Math.PI)), 7, STRIP.sheath, [0.9, 0.85, 0.8], 0.4, true);
  const C = top.clone().addScaledVector(tdir, 0.35);
  // coconuts hang in a bunch just under the fronds
  const nuts = Math.floor(rnd() * 9);
  for (let k = 0; k < nuts; k++) {
    const a = rnd() * 6.28, r = 0.25 + rnd() * 0.15;
    const col = rnd() < 0.7 ? tint(rnd, [1, 1, 1], 0.1) : [1.3, 1.1, 0.5];
    bark.sphere(C.clone().add(V(Math.cos(a) * r, -0.35 - rnd() * 0.35, Math.sin(a) * r)), 0.12 + rnd() * 0.04, STRIP.husk, col);
  }
  // fronds in a spiral: young ones stand up, old ones droop; the oldest hang dead down the trunk
  const F = 19 + Math.floor(rnd() * 5);
  const segs = 7;
  const scale = Math.min(1, 0.55 + H / 22);
  for (let f = 0; f < F; f++) {
    const age = f / (F - 1);
    const az = f * 2.39996 + rnd() * 0.3;
    const el = THREE.MathUtils.lerp(1.15, -0.45, age) + (rnd() - 0.5) * 0.25;
    const L = (3.6 + rnd() * 1.6) * scale * (age < 0.1 ? 0.7 : 1);
    const droop = 0.35 + 0.9 * age + rnd() * 0.3;
    const spine = arch(C.clone().add(dirFrom(az, 0).multiplyScalar(0.12)), az, el, L, droop, segs);
    const old = age > 0.82 && rnd() < 0.5;
    const col = old ? tint(rnd, [1.0, 0.95, 0.8], 0.1) : tint(rnd, [0.95, 1, 0.9], 0.1);
    leaves.ribbon(spine, L * 0.19, old ? CELLS.palmOld : CELLS.palm, col, { fold: 0.55, centre: C, flut: 1, roll: (rnd() - 0.5) * 0.6 }, f % 3 !== 2);
  }
  const dead = Math.floor(rnd() * 4);
  for (let f = 0; f < dead; f++) {
    const az = rnd() * 6.28, L = 3 + rnd();
    const spine = arch(C.clone().add(dirFrom(az, 0).multiplyScalar(0.2)), az, -1.25 - rnd() * 0.25, L, 0.15, 3);
    leaves.ribbon(spine, L * 0.12, CELLS.palmOld, [0.62, 0.45, 0.3], { fold: 0.2, centre: C, flut: 0.3, roll: rnd() * 2 }, f === 0);
  }
  return Dual.prototype.out(bark, leaves, { H: top.y + 1, trunkR: R0 * 1.4 });
}

// ------------------------------------------------------------------ rainforest canopy tree
// buttressed trunk, a few big limbs, and an umbrella of leaf-spray clusters. over > 0 pushes the crown towards +x
// (the canopy tunnel trees reach out over the road); vines hang from under the limbs
export function canopyTree(rnd, { H = 22, spread = 9, pale = false, over = 0, lean = 0, vines = 0, detail = 1, clusterK = 1, low = false } = {}) {
  const bark = new Dual(H), leaves = new Dual(H);
  // low: a sprawling coastal tree (hau, kamani) that branches close to the ground
  const hb = H * (low ? 0.28 + rnd() * 0.08 : 0.5 + rnd() * 0.12);
  const R0 = 0.28 + H * 0.016;
  const sides = 10;
  const trunk = [];
  const wob = rnd() * 6.28;
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    trunk.push(V(Math.sin(lean) * hb * t * t + 0.25 * Math.sin(t * 4 + wob), hb * 1.12 * t, 0.25 * Math.cos(t * 3 + wob)));
  }
  const fins = 4 + Math.floor(rnd() * 3), fph = rnd() * 6.28;
  bark.tube(trunk, (t, th) => {
    const base = R0 * (1 - 0.35 * t);
    const b = Math.max(0, 1 - t / 0.22);
    return base * (1 + 2.2 * b * b * Math.pow(Math.max(0, Math.cos(fins * th / 2 + fph)), 4) + 0.35 * b);
  }, sides, STRIP.bark, tint(rnd, [1, 1, 1], 0.08), 0.12);
  const top = trunk[8];
  const crown = [];
  const cR = (2.4 + H * 0.07) * clusterK;
  // limbs: rise out from the trunk top and level off; over-hanging trees send most of them one way
  const nb = 4 + Math.floor(rnd() * 3);
  for (let b = 0; b < nb; b++) {
    let az = (b / nb) * 6.28 + rnd() * 0.6;
    if (over > 0 && b < nb - 1) az = (rnd() - 0.5) * 2.2;
    const L = spread * (0.55 + rnd() * 0.45) * (over > 0 && b < nb - 1 ? 1 + over : 1);
    const el = low ? 0.3 + rnd() * 0.3 : 0.5 + rnd() * 0.45;
    const pts = [top.clone().add(V(0, -hb * 0.12 * rnd(), 0))];
    for (let k = 1; k <= 4; k++) {
      const e = el * (1 - 0.6 * k / 4);
      pts.push(pts[k - 1].clone().addScaledVector(dirFrom(az, e), L / 4));
    }
    bark.tube(pts, (t) => R0 * 0.55 * (1 - 0.75 * t) + 0.04, 6, STRIP.root, [1, 1, 1], 0.2);
    crown.push(pts[4], pts[2].clone().add(V(0, cR * 0.4, 0)));
    // a side branch off the middle of the limb
    if (true) {
      const a2 = az + (rnd() < 0.5 ? 0.9 : -0.9);
      const q = [pts[2].clone(), pts[2].clone().addScaledVector(dirFrom(a2, 0.5), L * 0.35)];
      bark.tube(q, (t) => R0 * 0.25 * (1 - 0.6 * t) + 0.03, 4, STRIP.root, [1, 1, 1], 0.2);
      crown.push(q[1]);
    }
  }
  crown.push(top.clone().add(V(0, H - top.y - cR * 0.6, 0)));
  // leaf clusters: flattened balls of spray cards, darker underneath and inside
  const cell = pale ? CELLS.kukui : CELLS.canopy;
  const per = 14;
  for (const c of crown) {
    const r = cR * (0.75 + rnd() * 0.5);
    for (let k = 0; k < per; k++) {
      const u = rnd() * 6.28, v = Math.acos(1 - 2 * Math.pow(rnd(), 0.7)), rr = r * (0.45 + 0.55 * rnd());
      const off = V(Math.sin(v) * Math.cos(u) * rr, Math.cos(v) * rr * 0.75, Math.sin(v) * Math.sin(u) * rr);
      const pos = c.clone().add(off);
      const n = off.clone().normalize().add(V(0, 0.35, 0)).add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.1)).normalize();
      const right = n.clone().cross(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()).normalize();
      const up = right.clone().cross(n).normalize();
      const s = r * (0.75 + rnd() * 0.4);
      const ao = 0.5 + 0.5 * THREE.MathUtils.clamp((off.y + r * 0.55) / (r * 1.1), 0, 1) * (0.6 + 0.4 * rr / r);
      const col = tint(rnd, [ao, ao, ao * 0.95], 0.08);
      leaves.card(pos, right.multiplyScalar(s), up.multiplyScalar(s), cell, col, { centre: c.clone().add(V(0, -r * 0.3, 0)), flut: 0.7, centred: true }, k % 2 === 0);
    }
  }
  // lianas hanging from under the crown
  for (let k = 0; k < vines; k++) {
    const c = crown[Math.floor(rnd() * crown.length)];
    const len = 2.5 + rnd() * 3.5, yaw = rnd() * 6.28;
    const base = c.clone().add(V((rnd() - 0.5) * 2, -cR * 0.35 - len, (rnd() - 0.5) * 2));
    leaves.card(base, V(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.9), V(0, len, 0), CELLS.vine, tint(rnd, [0.85, 0.9, 0.85], 0.1), { flut: 1.2, n: V(Math.sin(yaw), 0.4, -Math.cos(yaw)).normalize() });
  }
  return Dual.prototype.out(bark, leaves, { H, trunkR: R0 * 1.3, crownLow: hb });
}

// ------------------------------------------------------------------ hapu'u tree fern (trunk 0: a ground fern)
export function treeFern(rnd, { trunkH = 3, L = 3, detail = 1 } = {}) {
  const H = trunkH + L * 0.8;
  const bark = new Dual(H), leaves = new Dual(H);
  let C = V();
  if (trunkH > 0.2) {
    const pts = [];
    const lean = (rnd() - 0.5) * 0.3;
    for (let k = 0; k <= 4; k++) pts.push(V(Math.sin(lean) * trunkH * (k / 4) ** 2, trunkH * k / 4, 0));
    bark.tube(pts, (t) => 0.22 + 0.14 * (1 - t) ** 2 + 0.05 * t * t, 7, STRIP.fern, tint(rnd, [1, 1, 1], 0.1), 0.25, true);
    C = pts[4];
  }
  const F = 11 + Math.floor(rnd() * 5);
  const segs = 5;
  for (let f = 0; f < F; f++) {
    const az = f * 2.39996 + rnd() * 0.4;
    const young = f < 2;
    const el = young ? 1.3 : 0.55 + rnd() * 0.55;
    const len = L * (young ? 0.55 : 0.8 + rnd() * 0.3);
    const spine = arch(C.clone().add(dirFrom(az, 0).multiplyScalar(0.1)), az, el, len, young ? 0.2 : 1.1 + rnd() * 0.6, segs);
    leaves.ribbon(spine, len * 0.24, CELLS.fern, tint(rnd, young ? [1.1, 1.15, 0.9] : [1, 1, 1], 0.1), { fold: 0.18, centre: C.clone().add(V(0, -0.3, 0)), flut: 1 }, f % 3 !== 2);
  }
  return Dual.prototype.out(bark, leaves, { H, trunkR: 0.25 });
}

// ------------------------------------------------------------------ banana clump
export function banana(rnd, { H = 4, detail = 1 } = {}) {
  const bark = new Dual(H + 1.5), leaves = new Dual(H + 1.5);
  const stems = 1 + Math.floor(rnd() * 3);
  for (let s = 0; s < stems; s++) {
    const h = H * (s ? 0.45 + rnd() * 0.4 : 1);
    const o = s ? V((rnd() - 0.5) * 1.2, 0, (rnd() - 0.5) * 1.2) : V();
    const top = o.clone().add(V((rnd() - 0.5) * 0.3, h, (rnd() - 0.5) * 0.3));
    bark.tube([o, o.clone().lerp(top, 0.5), top], (t) => 0.15 * (1 - 0.4 * t) * Math.sqrt(h / H) + 0.03, 7, STRIP.banana, tint(rnd, [1, 1, 1], 0.1), 0.25);
    const nl = (6) + Math.floor(rnd() * 3);
    for (let k = 0; k < nl; k++) {
      const az = k * 2.39996 + rnd() * 0.5;
      const dry = k === nl - 1 && rnd() < 0.6;
      const L = (dry ? 1.5 : 1.7 + rnd() * 1.0) * Math.sqrt(h / H);
      const spine = arch(top.clone(), az, dry ? -0.6 : 0.95 + rnd() * 0.4, L, dry ? 0.6 : 0.9 + rnd() * 0.8, 5);
      leaves.ribbon(spine, L * 0.24, CELLS.banana, dry ? [0.8, 0.6, 0.35] : tint(rnd, [1, 1, 1], 0.1), { fold: 0.22, centre: top, flut: 1.1, roll: (rnd() - 0.5) * 0.8 }, k % 2 === 0 || dry);
    }
  }
  return Dual.prototype.out(bark, leaves, { H: H + 1.5, trunkR: 0.2 });
}

// ------------------------------------------------------------------ bamboo clump
export function bamboo(rnd, { H = 11, R = 1.8, detail = 1 } = {}) {
  const bark = new Dual(H), leaves = new Dual(H);
  const n = 16 + Math.floor(rnd() * 10);
  for (let c = 0; c < n; c++) {
    const a = rnd() * 6.28, r = R * Math.sqrt(rnd());
    const h = H * (0.65 + rnd() * 0.35);
    const out = V(Math.cos(a), 0, Math.sin(a));
    const pts = [];
    const segs = 6;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      pts.push(V(Math.cos(a) * r, 0, Math.sin(a) * r).addScaledVector(out, h * (0.08 * t + 0.32 * t * t * t)).add(V(0, h * t * (1 - 0.12 * t * t), 0)));
    }
    bark.tube(pts, () => 0.045 + rnd() * 0.0, 5, STRIP.bamboo, tint(rnd, [1, 1, 1], 0.12), 0.7);
    const sprays = 6;
    for (let k = 0; k < sprays; k++) {
      const t = 0.45 + 0.55 * (k + rnd()) / sprays;
      const j = Math.min(segs - 1, Math.floor(t * segs));
      const q = pts[j].clone().lerp(pts[j + 1], t * segs - j);
      const yaw = a + (rnd() - 0.5) * 2.4;
      const d = V(Math.cos(yaw), -0.3 - rnd() * 0.4, Math.sin(yaw)).normalize();
      const s = 1.2 + rnd() * 0.8;
      const right = d.clone().cross(UP).normalize().multiplyScalar(s);
      leaves.card(q.clone().addScaledVector(d, s * 0.45), right, d.clone().cross(right).normalize().multiplyScalar(-s * 0.9), CELLS.bamboo, tint(rnd, [1, 1, 1], 0.12), { centre: V(0, h * 0.6, 0), flut: 1.2, centred: true }, k % 2 === 0);
    }
  }
  return Dual.prototype.out(bark, leaves, { H, trunkR: R });
}

// ------------------------------------------------------------------ understorey and ground cover
// k crossed vertical cards round the y axis, w x h; normals out from the middle of the bush (or up, for grass)
export function crossed(rnd, c, { k = 3, w = 1, h = 1, up = false, tilt = 0, colour = [1, 1, 1] } = {}) {
  const m = new Mesher(h);
  const centre = V(0, h * 0.35, 0);
  for (let i = 0; i < k; i++) {
    const a = i * Math.PI / k + rnd() * 0.3;
    const right = V(Math.cos(a) * w, 0, Math.sin(a) * w);
    const upv = V(Math.sin(a) * tilt * (rnd() - 0.5), h, -Math.cos(a) * tilt * (rnd() - 0.5));
    m.card(V((rnd() - 0.5) * w * 0.15, -0.03, (rnd() - 0.5) * w * 0.15), right, upv, c, tint(rnd, colour, 0.08),
      up ? { n: V(Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15).normalize(), flut: 1 } : { centre, flut: 0.8 });
  }
  return { leaves: m.geometry(), H: h };
}

// a low clump of big leaves fanning out from the ground (monstera, 'ape)
export function leafClump(rnd, c, { n = 7, s = 1.1, detail = 1 } = {}) {
  const m = new Mesher(s * 1.4);
  const centre = V(0, 0.2, 0);
  const cnt = n;
  for (let i = 0; i < cnt; i++) {
    const a = i * 2.39996 + rnd() * 0.5, el = 0.8 + rnd() * 0.5;
    const size = s * (0.75 + rnd() * 0.5);
    const d = dirFrom(a, el);
    // the blades rise straight out of the ground on short stalks (hidden in the clump)
    const base = V(Math.cos(a) * 0.12, -0.05 + rnd() * 0.15 * s, Math.sin(a) * 0.12);
    const right = d.clone().cross(UP).normalize().multiplyScalar(size * 0.9);
    const up = right.clone().cross(d).normalize();
    if (up.y < 0) up.negate();
    // lay the leaf back towards its stalk direction: blade tilted down from the vertical by el
    const blade = d.clone().multiplyScalar(Math.cos(0.3)).addScaledVector(up, 0.3).normalize().multiplyScalar(size);
    m.card(base, right, blade, c, tint(rnd, [1, 1, 1], 0.1), { centre, flut: 0.8 });
  }
  return { leaves: m.geometry(), H: s * 1.4 };
}
