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
  ribbon(spine, hw, c, col, { fold = 0.3, foldTip = null, centre = null, bentK = 0.55, flut = 1, side = null, roll = 0, aoBase = 1 } = {}) {
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
      // leaflets hang from the midrib: the V deepens towards the tip
      const fd = foldTip === null ? fold : fold + (foldTip - fold) * t;
      const L = spine[k].clone().addScaledVector(sd, w).addScaledVector(dn, fd * w);
      const R = spine[k].clone().addScaledVector(sd, -w).addScaledVector(dn, fd * w);
      const nn = dn.clone().negate();
      if (centre) nn.multiplyScalar(1 - bentK).add(spine[k].clone().sub(centre).normalize().multiplyScalar(bentK)).add(V(0, 0.3, 0)).normalize();
      const v = c.v0 + (c.v1 - c.v0) * t, uc = (c.u0 + c.u1) / 2;
      const f = flut * Math.pow(t, 1.3);
      // darker where the frond leaves the crown (shaded by the others)
      const ao = aoBase + (1 - aoBase) * Math.min(1, t * 2.2);
      const cc = [col[0] * ao, col[1] * ao, col[2] * ao];
      rows.push([this.v(L, nn, c.u0, v, cc, f), this.v(spine[k], nn, uc, v, cc, f * 0.6), this.v(R, nn, c.u1, v, cc, f)]);
    }
    for (let k = 0; k < S; k++) {
      const a = rows[k], b = rows[k + 1];
      this.quad(a[0], a[1], b[1], b[0]);
      this.quad(a[1], a[2], b[2], b[1]);
    }
  }

  // a flat card: base point, right and up vectors (full width / height), normal mode
  card(base, right, up, c, col, { centre = null, crown = null, flut = 0.6, n = null, centred = false } = {}) {
    const o = centred ? base.clone().addScaledVector(up, -0.5) : base;
    const nf = n || right.clone().cross(up).normalize();
    // normals bent out of the cluster and, more, out of the whole crown: the crown shades as one leafy mass and a
    // card seen edge-on has no flat face to give it away
    const nrm = (p) => {
      if (!centre) return nf;
      const a = p.clone().sub(centre).normalize();
      if (crown) a.multiplyScalar(0.35).add(p.clone().sub(crown.c).divide(crown.r).normalize().multiplyScalar(0.65));
      return a.add(V(0, 0.3, 0)).normalize();
    };
    const p0 = o.clone().addScaledVector(right, -0.5), p1 = o.clone().addScaledVector(right, 0.5);
    const p2 = p1.clone().add(up), p3 = p0.clone().add(up);
    const a = this.v(p0, nrm(p0), c.u0, c.v0, col, flut * 0.3), b = this.v(p1, nrm(p1), c.u1, c.v0, col, flut * 0.3);
    const d = this.v(p2, nrm(p2), c.u1, c.v1, col, flut), e = this.v(p3, nrm(p3), c.u0, c.v1, col, flut);
    this.quad(a, b, d, e);
  }

  sphere(c, r, k, col) {
    const ico = new THREE.IcosahedronGeometry(1, 1);
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
  tube(pts, rad, sides, k, col, vPerM, cap, keep = true) {
    this.hi.tube(pts, rad, sides, k, col, vPerM, cap);
    if (!keep) return;
    const lp = pts.length > 3 ? pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) : pts;
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
// leans towards +x (the placer turns that seaward); the slender grey ringed trunk curves back up towards the light
// and carries a full crown of long arching fronds whose leaflets hang in a deepening V, and a bunch of coconuts
export function palm(rnd, { H = 14, lean = 0.25, detail = 1 } = {}) {
  const bark = new Dual(H), leaves = new Dual(H);
  const N = 14;
  const pts = [];
  let p = V(), ang = lean;
  const wob = rnd() * 6.28, curl = 0.6 + rnd() * 0.5;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    pts.push(p.clone());
    // leans out low, then bends back up: the classic beach palm curve
    ang = lean * (1.15 - curl * t * t) + 0.035 * Math.sin(t * 7 + wob);
    p = p.clone().add(V(Math.sin(ang), Math.cos(ang), 0.06 * Math.sin(t * 4 + wob)).multiplyScalar(H / N / Math.cos(lean * 0.6)));
  }
  const R0 = 0.15 + rnd() * 0.04;
  // a swollen foot (the root bole), then a slim trunk tapering a little to the crown
  bark.tube(pts, (t) => R0 * (1 + 0.85 * Math.pow(1 - t, 14) + 0.15 * Math.pow(1 - t, 3)) * (1 - 0.22 * t), 10, STRIP.palm, tint(rnd, [1, 1, 1], 0.06), 0.1);
  const top = pts[N].clone();
  const tdir = pts[N].clone().sub(pts[N - 1]).normalize();
  // the crown shaft wrapped in old leaf sheaths and fibre
  bark.tube([top.clone().addScaledVector(tdir, -0.6), top.clone(), top.clone().addScaledVector(tdir, 0.5)], (t) => R0 * (1.2 + 0.45 * Math.sin(t * Math.PI)), 8, STRIP.sheath, [0.85, 0.8, 0.72], 0.4, true);
  const C = top.clone().addScaledVector(tdir, 0.3);
  // coconuts in a bunch or two just under the fronds: green, yellow and ripening brown
  const bunches = 1 + Math.floor(rnd() * 2.5);
  for (let b = 0; b < bunches; b++) {
    const ba = rnd() * 6.28, n = 4 + Math.floor(rnd() * 7);
    const bc = [[0.85, 1.05, 0.55], [1.3, 1.15, 0.5], [0.75, 0.6, 0.4]][Math.floor(rnd() * 3)];
    for (let k = 0; k < n; k++) {
      const a = ba + (rnd() - 0.5) * 1.4, r = 0.22 + rnd() * 0.18;
      bark.sphere(C.clone().add(V(Math.cos(a) * r, -0.3 - rnd() * 0.45, Math.sin(a) * r)), 0.13 + rnd() * 0.05, STRIP.husk, tint(rnd, bc, 0.08));
    }
  }
  // fronds in a spiral: young ones stand up, old ones droop; the oldest hang dead down the trunk
  const F = 24 + Math.floor(rnd() * 7);
  const segs = 9;
  const scale = Math.min(1.1, 0.6 + H / 22);
  for (let f = 0; f < F; f++) {
    const age = f / (F - 1);
    const az = f * 2.39996 + rnd() * 0.3;
    const el = THREE.MathUtils.lerp(1.2, -0.35, age) + (rnd() - 0.5) * 0.25;
    const L = (4.3 + rnd() * 1.6) * scale * (age < 0.12 ? 0.65 : 1);
    const droop = 0.5 + 1.1 * age + rnd() * 0.35;
    const spine = arch(C.clone().add(dirFrom(az, 0).multiplyScalar(0.12)), az, el, L, droop, segs);
    const old = age > 0.85 && rnd() < 0.55;
    const col = old ? tint(rnd, [1.0, 0.93, 0.78], 0.1) : tint(rnd, [0.96, 1, 0.92], 0.12);
    leaves.ribbon(spine, L * 0.21, old ? CELLS.palmOld : CELLS.palm, col,
      { fold: 0.5, foldTip: 1.25, centre: C, bentK: 0.5, flut: 1, roll: (rnd() - 0.5) * 0.7, aoBase: 0.55 }, f % 3 !== 2);
  }
  const dead = Math.floor(rnd() * 4);
  for (let f = 0; f < dead; f++) {
    const az = rnd() * 6.28, L = 3 + rnd();
    const spine = arch(C.clone().add(dirFrom(az, 0).multiplyScalar(0.2)), az, -1.25 - rnd() * 0.25, L, 0.15, 3);
    leaves.ribbon(spine, L * 0.12, CELLS.palmOld, [0.62, 0.45, 0.3], { fold: 0.2, centre: C, flut: 0.3, roll: rnd() * 2 }, f === 0);
  }
  return Dual.prototype.out(bark, leaves, { H: top.y + 1.5, trunkR: R0 * 1.4 });
}

// ------------------------------------------------------------------ rainforest canopy tree
// buttressed trunk, a few big limbs that fork, and a dome of many small leaf clusters on their tips. over > 0
// pushes the crown towards +x (the canopy tunnel trees reach out over the road); vines hang from under the limbs
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
  const tips = [];
  const cR = (2.6 + H * 0.08) * clusterK;
  // limbs: rise out from the trunk top and level off, forking twice; over-hanging trees send most of them one way
  const nb = 4 + Math.floor(rnd() * 3);
  const limb = (p0, az, el, L, r0, depth) => {
    const pts = [p0];
    for (let k = 1; k <= 3; k++) pts.push(pts[k - 1].clone().addScaledVector(dirFrom(az + (rnd() - 0.5) * 0.3, el * (1 - 0.5 * k / 3)), L / 3));
    // the forks are too thin to see from the middle distance: the light model keeps only the main limbs
    bark.tube(pts, (t) => r0 * (1 - 0.6 * t) + 0.03, depth ? (depth > 1 ? 3 : 4) : 6, STRIP.root, [1, 1, 1], 0.2, false, depth === 0);
    if (depth >= 2) { tips.push(pts[3]); return; }
    tips.push(pts[2].clone().add(V(0, cR * 0.3, 0)));
    for (const s of [-1, 1]) limb(pts[3], az + s * (0.45 + rnd() * 0.4), el * 0.8 + 0.15, L * (0.45 + rnd() * 0.15), r0 * 0.45, depth + 1);
  };
  for (let b = 0; b < nb; b++) {
    let az = (b / nb) * 6.28 + rnd() * 0.6;
    if (over > 0 && b < nb - 1) az = (rnd() - 0.5) * 2.2;
    const L = spread * (0.42 + rnd() * 0.3) * (over > 0 && b < nb - 1 ? 1 + over : 1);
    const el = low ? 0.3 + rnd() * 0.3 : 0.55 + rnd() * 0.4;
    limb(top.clone().add(V(0, -hb * 0.12 * rnd(), 0)), az, el, L, R0 * 0.55, 0);
  }
  tips.push(top.clone().add(V(0, H - top.y - cR * 0.6, 0)));
  // the crown as a whole (for the bent normals and the shading inside it)
  const box = new THREE.Box3().setFromPoints(tips);
  const crown = { c: box.getCenter(V()), r: box.getSize(V()).multiplyScalar(0.5).addScalar(cR * 0.8) };
  crown.c.y -= cR * 0.2;
  // fill the inside of the crown too, so it reads as one deep leafy mass from the side and from the air
  const nFill = low ? 4 : 7;
  for (let k = 0; k < nFill; k++) {
    const u = rnd() * 6.28, rr = Math.sqrt(rnd()) * 0.75;
    tips.push(crown.c.clone().add(V(Math.cos(u) * rr * crown.r.x, (rnd() * 0.9 - 0.2) * crown.r.y, Math.sin(u) * rr * crown.r.z)));
  }
  // leaf clusters: small flattened balls of spray cards on every twig tip; darker underneath and inside
  const cell = pale ? CELLS.kukui : CELLS.canopy;
  const per = 7;
  for (const c of tips) {
    const r = cR * (0.5 + rnd() * 0.3);
    for (let k = 0; k < per; k++) {
      const u = rnd() * 6.28, v = Math.acos(1 - 2 * Math.pow(rnd(), 0.6)), rr = r * (0.35 + 0.65 * rnd());
      const off = V(Math.sin(v) * Math.cos(u) * rr, Math.cos(v) * rr * 0.8, Math.sin(v) * Math.sin(u) * rr);
      const pos = c.clone().add(off);
      // cards lie mostly flat-ish and face outwards, like leaves turned to the light
      const n = off.clone().normalize().add(V(0, 0.6, 0)).add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.0)).normalize();
      const right = n.clone().cross(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()).normalize();
      const up = right.clone().cross(n).normalize();
      const s = r * (1.0 + rnd() * 0.5);
      // ambient occlusion: how deep in the crown, and how low
      const q = pos.clone().sub(crown.c).divide(crown.r);
      const depthAO = THREE.MathUtils.clamp(q.length(), 0, 1);
      const ao = (0.38 + 0.62 * Math.pow(depthAO, 1.4)) * (0.72 + 0.28 * THREE.MathUtils.clamp(q.y * 0.5 + 0.6, 0, 1));
      const col = tint(rnd, [ao, ao, ao * 0.95], 0.1);
      leaves.card(pos, right.multiplyScalar(s), up.multiplyScalar(s), cell, col, { centre: c.clone().add(V(0, -r * 0.3, 0)), crown, flut: 0.7, centred: true }, k % 2 === 0);
    }
  }
  // pothos and climbing vines up the trunk: cards hugging the bark, facing out
  const climb = low ? 1 : 2 + Math.floor(rnd() * 4);
  for (let k = 0; k < climb; k++) {
    const a = rnd() * 6.28, y0 = rnd() * hb * 0.25, len = hb * (0.45 + rnd() * 0.5);
    const out = V(Math.cos(a), 0, Math.sin(a));
    const t0 = trunk[Math.min(8, Math.round((y0 + len / 2) / (hb * 1.12) * 8))];
    const base = V(t0.x, y0, t0.z).addScaledVector(out, R0 * 1.15);
    leaves.card(base, out.clone().cross(UP).multiplyScalar(1.1), V(0, len, 0), CELLS.vine, tint(rnd, [0.55, 0.62, 0.52], 0.1), { flut: 0.3, n: out.clone().add(V(0, 0.3, 0)).normalize() }, k === 0);
  }
  // lianas hanging from under the crown
  for (let k = 0; k < vines; k++) {
    const c = tips[Math.floor(rnd() * tips.length)];
    const len = 2.5 + rnd() * 3.5, yaw = rnd() * 6.28;
    const base = c.clone().add(V((rnd() - 0.5) * 2, -cR * 0.35 - len, (rnd() - 0.5) * 2));
    leaves.card(base, V(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.9), V(0, len, 0), CELLS.vine, tint(rnd, [0.75, 0.82, 0.75], 0.1), { flut: 1.2, n: V(Math.sin(yaw), 0.4, -Math.cos(yaw)).normalize() });
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
  const F = 14 + Math.floor(rnd() * 6);
  const segs = 6;
  for (let f = 0; f < F; f++) {
    const az = f * 2.39996 + rnd() * 0.4;
    const young = f < 2;
    const el = young ? 1.3 : 0.5 + rnd() * 0.6;
    const len = L * (young ? 0.55 : 0.85 + rnd() * 0.3);
    const spine = arch(C.clone().add(dirFrom(az, 0).multiplyScalar(0.1)), az, el, len, young ? 0.2 : 1.0 + rnd() * 0.7, segs);
    leaves.ribbon(spine, len * 0.25, CELLS.fern, tint(rnd, young ? [1.1, 1.15, 0.9] : [1, 1, 1], 0.1),
      { fold: 0.12, foldTip: 0.5, centre: C.clone().add(V(0, -0.3, 0)), flut: 1, aoBase: 0.6 }, f % 3 !== 2);
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
    const nl = 7 + Math.floor(rnd() * 4);
    for (let k = 0; k < nl; k++) {
      const az = k * 2.39996 + rnd() * 0.5;
      const dry = k === nl - 1 && rnd() < 0.6;
      const L = (dry ? 1.5 : 1.7 + rnd() * 1.0) * Math.sqrt(h / H);
      const spine = arch(top.clone(), az, dry ? -0.6 : 0.95 + rnd() * 0.4, L, dry ? 0.6 : 0.9 + rnd() * 0.8, 5);
      leaves.ribbon(spine, L * 0.29, CELLS.banana, dry ? [0.8, 0.6, 0.35] : tint(rnd, [1, 1, 1], 0.1), { fold: 0.15, foldTip: 0.35, centre: top, flut: 1.1, roll: (rnd() - 0.5) * 0.8, aoBase: 0.7 }, k % 2 === 0 || dry);
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

// a carpet of leaves over the forest floor: cards lying almost flat (tilted up a little), scattered over radius R,
// normals up so they light like the ground they cover; darker in the middle of the patch
export function carpet(rnd, cells, { n = 14, R = 1.6, s = 1 } = {}) {
  const m = new Mesher(0.6 * s);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, r = R * Math.sqrt(rnd());
    const yaw = rnd() * 6.28, tilt = 0.15 + rnd() * 0.45, size = s * (0.7 + rnd() * 0.6);
    const fwd = V(Math.cos(yaw) * Math.cos(tilt), Math.sin(tilt), Math.sin(yaw) * Math.cos(tilt)).multiplyScalar(size);
    const right = V(-Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(size * 0.9);
    const ao = 0.6 + 0.4 * r / R;
    m.card(V(Math.cos(a) * r, 0.02, Math.sin(a) * r).addScaledVector(fwd, -0.35), right, fwd, cells[i % cells.length], tint(rnd, [ao, ao, ao], 0.12),
      { n: V(Math.cos(yaw) * 0.15, 1, Math.sin(yaw) * 0.15).normalize(), flut: 0.5 });
  }
  return { leaves: m.geometry(), H: 0.6 * s };
}

// a rounded shrub (naupaka, hau scrub): leaf-spray cards over a low dome, facing out of it, with the normals bent
// out of the dome and the inside and underside shaded, so it reads as a solid leafy mound instead of crossed planes
export function shrub(rnd, c, { n = 22, R = 1.2, h = 1.0, s = 0.9 } = {}) {
  const m = new Mesher(h);
  const crown = { c: V(0, h * 0.35, 0), r: V(R, h * 0.75, R) };
  for (let i = 0; i < n; i++) {
    const u = rnd() * 6.28, v = Math.acos(1 - 1.15 * rnd()), rr = 0.55 + 0.45 * rnd();
    const d = V(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    const pos = V(d.x * R * rr, Math.max(0.1 * h, h * 0.35 + d.y * h * 0.65 * rr), d.z * R * rr);
    const nrm = d.clone().add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8)).normalize();
    const right = nrm.clone().cross(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()).normalize();
    const up = right.clone().cross(nrm).normalize();
    const size = s * (0.8 + rnd() * 0.5);
    const ao = (0.5 + 0.5 * rr) * (0.7 + 0.3 * Math.max(0, d.y));
    m.card(pos, right.multiplyScalar(size), up.multiplyScalar(size), c, tint(rnd, [ao, ao, ao], 0.1), { centre: crown.c, crown, flut: 0.6, centred: true });
  }
  return { leaves: m.geometry(), H: h };
}
