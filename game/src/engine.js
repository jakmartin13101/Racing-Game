import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// The trophy truck's engine bay, built procedurally: a 90-degree V8 with cast heads, ribbed red valve covers,
// a cast intake with runners, a distributor and red plug leads, heat-tinted tube headers into collectors,
// the front accessory drive (crank damper, water pump, alternator, power steering, idler and tensioner on a
// serpentine belt), a radiator with a shrouded fan, hoses, battery, reservoirs, firewall and inner wings.
// Geometry is merged per material and shared by every truck; the pulleys and the fan are separate meshes so
// they can spin with the revs. `full` false gives the cut-down version for distant trucks.

const Z0 = 1.5; // middle of the block, along the truck
const CRANK = -0.13; // crank height

export const ENGINE_MATS = {
  bay: new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.8, metalness: 0.35, side: THREE.DoubleSide, name: 'eng_bay' }),
  alu: new THREE.MeshStandardMaterial({ color: 0xa4a29c, roughness: 0.48, metalness: 0.92, name: 'eng_alu' }),
  black: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.62, metalness: 0.35, name: 'eng_black' }),
  red: new THREE.MeshPhysicalMaterial({ color: 0x9e1810, roughness: 0.32, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, name: 'eng_red' }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe6e4e0, roughness: 0.1, metalness: 1, name: 'eng_chrome' }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.88, metalness: 0, name: 'eng_rubber' }),
  steel: new THREE.MeshStandardMaterial({ color: 0x67635e, roughness: 0.4, metalness: 0.9, name: 'eng_steel' }),
  // heat-tinted headers (straw, gold and blue by the ports, grey towards the collectors); glow with heat
  header: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.9, emissive: 0xff3a0a, emissiveIntensity: 0, name: 'eng_header' }),
  plastic: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.05, name: 'eng_plastic' }),
  radiator: null,
};

// fine fin texture for the radiator core
function radiatorMaterial() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#26282a'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) { g.fillStyle = '#6d6e6c'; g.fillRect(0, y, 64, 1); g.fillStyle = '#111'; g.fillRect(0, y + 2, 64, 1); }
  for (let x = 0; x < 64; x += 16) { g.fillStyle = '#3c3d3d'; g.fillRect(x, 0, 2, 64); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.7, name: 'eng_radiator' });
}

// ---------------------------------------------------------------- geometry helpers
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
function place(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
  g.applyMatrix4(_m);
  return g;
}
function rbox(w, h, d, r = 0.015, seg = 2) { return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.1, h / 2.1, d / 2.1)); }
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
// cylinder lying along z (pulleys, the throttle body) unless axis says otherwise
function cylZ(r, len, seg = 20, r2 = r) { return new THREE.CylinderGeometry(r, r2, len, seg).rotateX(Math.PI / 2); }
function cylY(r, len, seg = 20, r2 = r) { return new THREE.CylinderGeometry(r, r2, len, seg); }
function hex(r, h) { return new THREE.CylinderGeometry(r, r, h, 6); }
function tube(pts, r, seg = 24, radial = 8, closed = false) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(c, seg, r, radial, closed);
}
// grooved pulley turned on a lathe, axis along z
function pulley(r, w, grooves = 4) {
  const pts = [new THREE.Vector2(0.012, -w / 2), new THREE.Vector2(r * 0.96, -w / 2)];
  for (let i = 0; i <= grooves * 2; i++) {
    const u = i / (grooves * 2);
    pts.push(new THREE.Vector2(i % 2 ? r * 0.9 : r, -w / 2 + w * 0.08 + u * w * 0.84));
  }
  pts.push(new THREE.Vector2(r * 0.96, w / 2), new THREE.Vector2(r * 0.35, w / 2), new THREE.Vector2(r * 0.3, w / 2 + 0.012), new THREE.Vector2(0.012, w / 2 + 0.012));
  return new THREE.LatheGeometry(pts, 28).rotateX(Math.PI / 2);
}
function colour(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3), col = new THREE.Color(c);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function merge(list) {
  const geos = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  const hasCol = geos.some((g) => g.attributes.color);
  if (hasCol) for (const g of geos) if (!g.attributes.color) colour(g, 0xffffff);
  const m = mergeGeometries(geos, false);
  m.computeBoundingSphere();
  return m;
}

// ---------------------------------------------------------------- the engine
const BANK = Math.PI / 4; // each bank leans 45 degrees out of the vee

function buildGeometry(full) {
  const G = { bay: [], alu: [], black: [], red: [], chrome: [], rubber: [], steel: [], header: [], plastic: [], radiator: [] };
  // bay: firewall, inner wings, skid plate
  G.bay.push(place(box(1.66, 0.6, 0.02), 0, -0.06, 1.04));
  for (const s of [-1, 1]) G.bay.push(place(box(0.02, 0.5, 1.1), s * 0.8, -0.02, 1.6, 0, 0, s * 0.12));
  G.bay.push(place(box(1.5, 0.02, 1.15), 0, -0.44, 1.62));

  // bottom end: oil pan, crankcase, timing cover, bell housing
  G.black.push(place(rbox(0.36, 0.13, 0.56, 0.03), 0, -0.36, Z0 - 0.02));
  G.alu.push(place(rbox(0.44, 0.17, 0.62, 0.02), 0, -0.22, Z0));
  G.alu.push(place(rbox(0.3, 0.26, 0.04, 0.02), 0, -0.06, Z0 + 0.32));
  G.alu.push(place(cylZ(0.25, 0.12, 28, 0.2), 0, -0.14, Z0 - 0.38));
  // the two banks, heads and valve covers, leaning out from the vee
  for (const s of [-1, 1]) {
    const a = -s * BANK;
    const at = (up, across = 0) => [Math.sin(s * BANK) * up + s * Math.cos(BANK) * across, CRANK + Math.cos(BANK) * up - Math.sin(BANK) * across, 0];
    const [bx, by] = at(0.17);
    G.alu.push(place(rbox(0.2, 0.22, 0.6, 0.02), bx, by, Z0, 0, 0, a));
    const [hx, hy] = at(0.31);
    G.alu.push(place(rbox(0.22, 0.07, 0.62, 0.012), hx, hy, Z0, 0, 0, a));
    const [cx, cy] = at(0.375);
    G.red.push(place(rbox(0.19, 0.07, 0.58, 0.03, 3), cx, cy, Z0, 0, 0, a));
    // cast ribs along the cover, and the hold-down bolts
    if (full) {
      for (let k = -2; k <= 2; k++) {
        const [rx, ry] = at(0.413, k * 0.03);
        G.red.push(place(rbox(0.012, 0.016, 0.44, 0.005, 1), rx, ry, Z0, 0, 0, a));
      }
      for (const e of [-1, 1]) for (let k = 0; k < 4; k++) {
        const [px, py] = at(0.405, e * 0.083);
        G.steel.push(place(hex(0.011, 0.016), px, py, Z0 - 0.24 + k * 0.16, 0, 0, a));
      }
      // oil filler cap and breather on the covers
      const [ox, oy] = at(0.42, -0.04);
      G.black.push(place(cylY(0.03, 0.03, 16), ox, oy, Z0 + (s > 0 ? 0.17 : -0.17), 0, 0, a));
      // head bolts along the deck
      for (let k = 0; k < 5; k++) {
        const [px, py] = at(0.33, 0.115);
        G.steel.push(place(hex(0.012, 0.018), px, py, Z0 - 0.26 + k * 0.13, 0, 0, a - s * Math.PI / 2));
      }
    }
    // headers: four primaries per bank out of the head's outer face, down and back into a collector
    const n = 4;
    for (let k = 0; k < n; k++) {
      const z = Z0 - 0.22 + k * 0.147;
      const [px, py] = at(0.29, 0.13);
      const pts = [
        [px, py, z], [px + s * 0.07, py - 0.03, z], [px + s * 0.12, py - 0.14, z - 0.02 - k * 0.01],
        [s * 0.5, -0.3, z - 0.1 - k * 0.04], [s * 0.44, -0.4, Z0 - 0.42], [s * 0.4, -0.42, Z0 - 0.5],
      ];
      if (full || k % 2 === 0) G.header.push(heatTint(tube(pts, 0.021, full ? 30 : 10, full ? 8 : 5)));
      // flange at the port
      if (full) G.steel.push(place(rbox(0.012, 0.06, 0.07, 0.006, 1), px + s * 0.005, py, z, 0, 0, a + s * Math.PI / 2));
    }
    G.header.push(heatTint(tube([[s * 0.4, -0.42, Z0 - 0.48], [s * 0.37, -0.43, Z0 - 0.7], [s * 0.3, -0.45, 0.9]], 0.04, 8, 10), 0.9));
    if (full) {
      // spark plugs (white insulators) in the head's side, with red leads up to the distributor
      for (let k = 0; k < 4; k++) {
        const z = Z0 - 0.15 + k * 0.147;
        const [px, py] = at(0.275, 0.12);
        G.plastic.push(colour(place(cylY(0.009, 0.04, 8), px + s * 0.02, py + 0.01, z, 0, 0, a - s * 1.1), 0xe8e4dc));
        G.rubber.push(place(cylY(0.013, 0.04, 8), px + s * 0.04, py + 0.02, z, 0, 0, a - s * 1.1));
        const lead = tube([[px + s * 0.055, py + 0.03, z], [px + s * 0.08, py + 0.14, z - 0.02], [s * 0.18, 0.22, Z0 - 0.3 + k * 0.03], [s * 0.04, 0.2, Z0 - 0.34]], 0.0065, 18, 5);
        G.plastic.push(colour(lead, 0xb3140c));
      }
    }
  }
  // intake: a cast plenum in the vee with runners out to each head, a throttle body and a filter can
  G.alu.push(place(rbox(0.25, 0.1, 0.5, 0.03, 3), 0, 0.12, Z0));
  if (full) {
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const z = Z0 - 0.22 + k * 0.147;
      G.alu.push(tube([[s * 0.1, 0.13, z], [s * 0.17, 0.12, z], [s * 0.22, 0.06, z]], 0.024, 8, 8));
    }
    for (let k = 0; k < 3; k++) G.steel.push(place(hex(0.012, 0.02), 0.09, 0.175, Z0 - 0.15 + k * 0.15), place(hex(0.012, 0.02), -0.09, 0.175, Z0 - 0.15 + k * 0.15));
  }
  G.alu.push(place(cylZ(0.05, 0.08, 24), 0, 0.14, Z0 + 0.29));
  G.black.push(tube([[0, 0.14, Z0 + 0.33], [0.06, 0.15, Z0 + 0.42], [0.22, 0.14, Z0 + 0.46], [0.38, 0.1, Z0 + 0.42]], 0.045, 16, 12));
  // pleated air filter with a chrome lid
  const filt = cylY(0.11, 0.13, full ? 72 : 20);
  if (full) {
    const p = filt.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 0.105) continue;
      const k = 1 + 0.045 * Math.cos(Math.atan2(z, x) * 36);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    filt.computeVertexNormals();
  }
  G.plastic.push(colour(place(filt, 0.45, 0.08, Z0 + 0.42), 0x9b1a12));
  G.chrome.push(place(cylY(0.122, 0.02, 32), 0.45, 0.155, Z0 + 0.42), place(cylY(0.122, 0.02, 32), 0.45, 0.005, Z0 + 0.42));
  G.chrome.push(place(cylY(0.018, 0.02, 12), 0.45, 0.17, Z0 + 0.42));
  // distributor at the back of the vee
  G.black.push(place(cylY(0.05, 0.06, 20), 0, 0.2, Z0 - 0.34), place(cylY(0.03, 0.08, 14), 0, 0.15, Z0 - 0.34));
  // front accessory drive: pulley centres in the front plane
  const fz = Z0 + 0.38;
  const P = [
    { x: 0, y: CRANK, r: 0.095, w: 0.05 }, // crank damper
    { x: 0, y: 0.03, r: 0.07, w: 0.04 }, // water pump
    { x: 0.25, y: 0.07, r: 0.04, w: 0.04 }, // alternator
    { x: 0.12, y: -0.03, r: 0.035, w: 0.035 }, // tensioner
    { x: -0.25, y: 0.04, r: 0.06, w: 0.04 }, // power steering pump
    { x: -0.11, y: 0.14, r: 0.035, w: 0.035 }, // idler
  ];
  // alternator body with cooling slots, power steering pump and its reservoir, water pump housing
  G.alu.push(place(cylZ(0.075, 0.13, 24), 0.25, 0.07, fz - 0.1));
  if (full) for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    G.black.push(place(box(0.008, 0.02, 0.06), 0.25 + Math.cos(a) * 0.072, 0.07 + Math.sin(a) * 0.072, fz - 0.1, 0, 0, a));
  }
  G.alu.push(place(cylZ(0.05, 0.1, 18), -0.25, 0.04, fz - 0.09));
  G.black.push(place(cylY(0.04, 0.07, 18), -0.25, 0.14, fz - 0.12));
  G.alu.push(place(rbox(0.12, 0.12, 0.08, 0.02), 0, 0.02, fz - 0.06));
  G.steel.push(place(box(0.06, 0.04, 0.2), 0.2, 0.0, fz - 0.15, 0, 0, 0.4), place(box(0.06, 0.04, 0.18), -0.2, 0.0, fz - 0.14, 0, 0, -0.4));
  // serpentine belt round the outside of the pulleys
  {
    const cx = P.reduce((a, p) => a + p.x, 0) / P.length, cy = P.reduce((a, p) => a + p.y, 0) / P.length;
    const ring = [...P].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const pts = [];
    for (const p of ring) {
      const a0 = Math.atan2(p.y - cy, p.x - cx);
      for (const da of [-0.55, 0, 0.55]) pts.push([p.x + Math.cos(a0 + da) * (p.r + 0.006), p.y + Math.sin(a0 + da) * (p.r + 0.006), fz + 0.01]);
    }
    const belt = tube(pts, 0.007, full ? 120 : 40, 4, true);
    belt.scale(1, 1, 1);
    G.rubber.push(belt);
  }
  // radiator: frame, finned core, top and bottom tanks, shroud; hoses back to the engine
  G.steel.push(place(box(1.12, 0.05, 0.07), 0, 0.2, 2.13), place(box(1.12, 0.05, 0.07), 0, -0.3, 2.13));
  G.steel.push(place(box(0.05, 0.5, 0.07), 0.56, -0.05, 2.13), place(box(0.05, 0.5, 0.07), -0.56, -0.05, 2.13));
  G.radiator.push(place(box(1.06, 0.45, 0.05), 0, -0.05, 2.13));
  G.black.push(place(rbox(0.5, 0.42, 0.04, 0.02), 0, -0.05, 2.08));
  G.black.push(place(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 32, 1, true).rotateX(Math.PI / 2), 0, -0.05, 2.03));
  G.rubber.push(tube([[0.42, 0.16, 2.09], [0.38, 0.2, 1.98], [0.15, 0.2, 1.9], [0.02, 0.16, Z0 + 0.3]], 0.024, 20, 10));
  G.rubber.push(tube([[-0.42, -0.25, 2.09], [-0.3, -0.25, 1.98], [-0.1, -0.12, 1.92], [-0.02, -0.02, fz - 0.04]], 0.026, 20, 10));
  G.chrome.push(place(cylZ(0.03, 0.01, 12), 0.42, 0.16, 2.08), place(cylZ(0.032, 0.01, 12), -0.42, -0.25, 2.08));
  // battery, coolant tank, brake master cylinder and fluid reservoir, fuse box, dipstick and wiring
  G.plastic.push(colour(place(rbox(0.25, 0.17, 0.17, 0.012), -0.56, -0.05, 1.22), 0x1d1f22));
  G.plastic.push(colour(place(rbox(0.25, 0.012, 0.17, 0.004), -0.56, 0.035, 1.22), 0x2f6fb5));
  G.plastic.push(colour(place(cylY(0.016, 0.03, 10), -0.48, 0.05, 1.18), 0xc0191a), colour(place(cylY(0.016, 0.03, 10), -0.64, 0.05, 1.18), 0x111111));
  G.plastic.push(colour(place(rbox(0.12, 0.15, 0.1, 0.02), 0.58, -0.02, 1.95), 0xd8d4c8));
  G.plastic.push(colour(place(cylY(0.022, 0.03, 12), 0.58, 0.07, 1.95), 0x2a2a2a));
  G.alu.push(place(cylZ(0.04, 0.16, 16), 0.45, 0.1, 1.12));
  G.plastic.push(colour(place(rbox(0.1, 0.07, 0.06, 0.015), 0.45, 0.17, 1.13), 0xd0c9a8), colour(place(cylY(0.022, 0.02, 12), 0.45, 0.215, 1.13), 0x161616));
  G.plastic.push(colour(place(rbox(0.16, 0.08, 0.12, 0.01), -0.55, 0.02, 1.52), 0x151515));
  G.plastic.push(colour(place(new THREE.TorusGeometry(0.02, 0.006, 6, 14), 0.2, 0.09, Z0 - 0.2, 0, Math.PI / 2, 0), 0xf2c014));
  if (full) {
    G.plastic.push(colour(tube([[-0.48, 0.05, 1.18], [-0.4, 0.12, 1.4], [0.1, 0.12, 1.75], [0.25, 0.1, fz - 0.17]], 0.008, 30, 5), 0xa51410));
    G.plastic.push(colour(tube([[-0.64, 0.05, 1.18], [-0.7, -0.1, 1.3], [-0.5, -0.3, 1.4], [-0.25, -0.3, Z0]], 0.009, 24, 5), 0x111111));
    // wiring loom along each wing
    for (const s of [-1, 1]) G.plastic.push(colour(tube([[s * 0.72, 0.12, 1.1], [s * 0.74, 0.1, 1.5], [s * 0.7, 0.08, 1.9], [s * 0.5, 0.0, 2.05]], 0.011, 24, 6), 0x161616));
  }
  const out = {};
  for (const [k, list] of Object.entries(G)) if (list.length) out[k] = merge(list);
  return { geos: out, pulleys: P.map((p) => ({ ...p, z: fz })) };
}

// straw near the port, through gold and blue to dull grey along the tube
function heatTint(g, start = 0) {
  const n = g.attributes.position.count, uv = g.attributes.uv, a = new Float32Array(n * 3);
  const stops = [[0, [0.86, 0.75, 0.52]], [0.18, [0.78, 0.55, 0.3]], [0.36, [0.42, 0.33, 0.55]], [0.55, [0.3, 0.36, 0.55]], [0.8, [0.42, 0.42, 0.44]], [1, [0.36, 0.35, 0.35]]];
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, start + uv.getX(i) * (1 - start));
    let j = 0;
    while (j < stops.length - 2 && u > stops[j + 1][0]) j++;
    const [u0, c0] = stops[j], [u1, c1] = stops[j + 1];
    const t = THREE.MathUtils.clamp((u - u0) / (u1 - u0), 0, 1);
    for (let c = 0; c < 3; c++) a[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const cache = {};
function shared(full) {
  if (!ENGINE_MATS.radiator) ENGINE_MATS.radiator = radiatorMaterial();
  return (cache[full] ||= (() => {
    const { geos, pulleys } = buildGeometry(full);
    // spinning parts: the pulleys and the fan
    const pg = new Map();
    for (const p of pulleys) if (!pg.has(p.r)) pg.set(p.r, pulley(p.r, p.w, full ? 4 : 1));
    const fan = [];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2;
      fan.push(place(rbox(0.07, 0.17, 0.008, 0.004, 1), Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0, 0.35, 0, a - Math.PI / 2));
    }
    fan.push(cylZ(0.05, 0.05, 20));
    return { geos, pulleys, pg, fan: merge(fan) };
  })());
}

// one truck's engine. mat(base) gives the truck's own copy of each material (bent with the body).
export function buildEngine(full, mat = (m) => m) {
  const S = shared(full);
  const group = new THREE.Group();
  group.name = 'engine';
  const add = (geo, m) => { const o = new THREE.Mesh(geo, mat(m)); o.castShadow = true; o.receiveShadow = true; group.add(o); return o; };
  for (const [k, geo] of Object.entries(S.geos)) add(geo, ENGINE_MATS[k]);
  const spin = [];
  for (const p of S.pulleys) {
    const o = add(S.pg.get(p.r), p.r > 0.08 ? ENGINE_MATS.black : ENGINE_MATS.alu);
    o.position.set(p.x, p.y, p.z);
    spin.push({ o, k: 0.095 / p.r });
  }
  const fan = add(S.fan, ENGINE_MATS.black);
  fan.position.set(0, -0.05, 2.0);
  spin.push({ o: fan, k: 1.15 });
  const header = mat(ENGINE_MATS.header);
  return { group, spin, header, rest: group.position.clone() };
}

// a forged piston with its rings, gudgeon pin and an I-beam rod with the big-end cap bolted on (for the blow-up)
let pistonGeo = null;
export function pistonMesh() {
  if (!pistonGeo) {
    const prof = [[0, 0.04], [0.048, 0.04], [0.052, 0.035], [0.052, 0.028], [0.049, 0.026], [0.049, 0.02], [0.052, 0.018], [0.052, 0.012], [0.049, 0.01], [0.049, 0.004], [0.052, 0.002], [0.052, -0.04], [0.046, -0.042]];
    const crown = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    const pin = cylZ(0.016, 0.1, 12).rotateY(Math.PI / 2).translate(0, -0.02, 0);
    const beam = [rbox(0.03, 0.2, 0.016, 0.006, 1).translate(0, -0.12, 0), rbox(0.01, 0.2, 0.026, 0.004, 1).translate(0.012, -0.12, 0), rbox(0.01, 0.2, 0.026, 0.004, 1).translate(-0.012, -0.12, 0)];
    const small = new THREE.TorusGeometry(0.022, 0.009, 8, 16).translate(0, -0.02, 0);
    const big = new THREE.TorusGeometry(0.036, 0.011, 8, 20).translate(0, -0.24, 0);
    const bolts = [hex(0.008, 0.04).translate(0.04, -0.26, 0), hex(0.008, 0.04).translate(-0.04, -0.26, 0)];
    pistonGeo = { crown: merge([crown, pin]), rod: merge([...beam, small, big, ...bolts]) };
  }
  const g = new THREE.Group();
  for (const [geo, m] of [[pistonGeo.crown, ENGINE_MATS.chrome], [pistonGeo.rod, ENGINE_MATS.steel]]) {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    g.add(o);
  }
  return g;
}

// a valve cover torn off in the blow-up
export function coverMesh() {
  const g = new THREE.Group();
  const o = new THREE.Mesh(merge([rbox(0.19, 0.07, 0.58, 0.03, 3), ...[-2, -1, 0, 1, 2].map((k) => place(rbox(0.012, 0.016, 0.44, 0.005, 1), k * 0.03, 0.038, 0))]), ENGINE_MATS.red);
  o.castShadow = true;
  g.add(o);
  return g;
}
