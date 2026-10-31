import * as THREE from 'three';
import { loadPropModels } from '../../props.js';

// Tree geometry for the burning forest: procedural charred snags (a tapered trunk wandering up, branch stubs and
// limbs reaching out) and the island tree models, loaded once at start-up so they are ready by race time.
export const TREE_MODELS = ['island_tree_01', 'dead_tree_trunk', 'dead_tree_trunk_02', 'dry_branches_medium_01', 'shrub_01', 'shrub_02', 'shrub_03', 'shrub_04'];
let models = null;
const loading = (typeof document !== 'undefined' ? loadPropModels(TREE_MODELS) : Promise.resolve(null))
  .then((m) => { models = m; return m; })
  .catch((e) => { console.warn('ahikekai: tree models', e); return null; });
export const treeModels = () => models;
export const treeModelsReady = loading;

// a tube along pts with a radius per point; capped at the far end
export function taperTube(pts, radii, radial = 7, out = { P: [], N: [], I: [] }) {
  const { P, N, I } = out;
  const base = P.length / 3;
  const n = pts.length;
  const T = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), ref = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    T.subVectors(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]).normalize();
    ref.set(Math.abs(T.y) < 0.9 ? 0 : 1, Math.abs(T.y) < 0.9 ? 1 : 0, 0);
    A.crossVectors(T, ref).normalize(); B.crossVectors(T, A).normalize();
    for (let s = 0; s < radial; s++) {
      const a = s / radial * Math.PI * 2;
      // a little irregular, like bark split by the heat
      const r = radii[k] * (1 + 0.08 * Math.sin(a * 3 + k * 1.7));
      const cx = Math.cos(a), cy = Math.sin(a);
      N.push(A.x * cx + B.x * cy, A.y * cx + B.y * cy, A.z * cx + B.z * cy);
      P.push(p.x + (A.x * cx + B.x * cy) * r, p.y + (A.y * cx + B.y * cy) * r, p.z + (A.z * cx + B.z * cy) * r);
    }
  }
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < radial; s++) {
    const a = base + k * radial + s, b = base + k * radial + (s + 1) % radial, c = a + radial, d = b + radial;
    I.push(a, b, c, b, d, c);
  }
  // the broken-off end
  const tip = P.length / 3, last = pts[n - 1];
  P.push(last.x, last.y, last.z); N.push(T.x, T.y, T.z);
  for (let s = 0; s < radial; s++) I.push(base + (n - 1) * radial + s, base + (n - 1) * radial + (s + 1) % radial, tip);
  return out;
}

// A charred snag: H tall, r0 at the base. bias: a direction (unit, horizontal) the limbs favour, or null.
// Returns the geometry (base at the origin, up +Y) and the points where flames sit.
export function snagGeometry(rnd, H, r0, { limbs = 5, bias = null, broken = 0.3 } = {}) {
  const out = { P: [], N: [], I: [] };
  const fire = [];
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.12, 1, (rnd() - 0.5) * 0.12).normalize();
  const top = rnd() < broken ? H * (0.55 + rnd() * 0.25) : H;
  const pts = [], radii = [];
  const NS = 9;
  const wob = new THREE.Vector3();
  for (let k = 0; k <= NS; k++) {
    const u = k / NS, h = u * top;
    wob.set(Math.sin(u * 5 + rnd()) * 0.15 * u, 0, Math.cos(u * 4 + rnd()) * 0.15 * u);
    pts.push(lean.clone().multiplyScalar(h).add(wob));
    // flared root collar, then a slow taper
    radii.push(r0 * (1 + 0.6 * Math.exp(-h * 2.2)) * (1 - u * 0.78));
  }
  taperTube(pts, radii, 8, out);
  fire.push(pts[NS].clone(), pts[Math.round(NS * 0.6)].clone());
  for (let k = 0; k < limbs; k++) {
    const u0 = 0.35 + rnd() * 0.55;
    if (u0 * H > top - 0.3) continue;
    const j = Math.min(NS - 1, Math.round(u0 * NS));
    const o = pts[j];
    let a = rnd() * Math.PI * 2;
    if (bias) { const ab = Math.atan2(bias.z, bias.x) + (rnd() < 0.5 ? 0 : Math.PI); a = ab + (rnd() - 0.5) * 1.6; }
    const up = 0.4 + rnd() * 0.7, L = H * (0.15 + rnd() * 0.25) * (1 - u0 * 0.5);
    const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    const lp = [], lr = [];
    const rb = radii[j] * (0.35 + rnd() * 0.2);
    for (let s = 0; s <= 4; s++) {
      const v = s / 4;
      lp.push(o.clone().addScaledVector(dir, L * v).add(new THREE.Vector3(0, -v * v * L * 0.15, 0)));
      lr.push(rb * (1 - v * 0.75));
    }
    taperTube(lp, lr, 5, out);
    fire.push(lp[4].clone());
    // a twig or two off the limb
    if (rnd() < 0.6) {
      const o2 = lp[2], d2 = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.2, 0.5, (rnd() - 0.5) * 1.2)).normalize();
      taperTube([o2, o2.clone().addScaledVector(d2, L * 0.45)], [rb * 0.45, rb * 0.15], 4, out);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.N, 3));
  g.setIndex(out.I);
  return { geo: g, fire, top };
}
