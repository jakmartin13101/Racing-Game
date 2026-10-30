import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../world.js';
import { loadPropModels, makePlacer } from '../props.js';
import { surfaceAt } from './surfaces.js';

// Wailele Nahele: the rainforest circuit's set pieces and race events.
//   buildScenery: the old sugar mill at the start (rusted sheds, brick chimney, machinery, water tower, the
//     narrow-gauge cane line, gantry, grid, spectators), basalt walls and lip at the falls gorge jump, the timber
//     rail trestle over the river (it carries the trucks: deck colliders), the ford, and the trail dressing
//     (roots across the canopy tunnel, old sleepers, fence posts).
//   TrackEvents: trees that topple across the trail on lap 2 or 3 after a red marker goes up, slick mud
//     patches, the ford's water drag, and a lane-keeping hint so the AI runs single file over the trestle.
// Everything is placed from the track rows and world.heightAt at load, so it follows a rebake.

const BASE = import.meta.env.BASE_URL;
const G_GROUND = (0x0001 << 16) | 0xffff;
const UP = new THREE.Vector3(0, 1, 0);
const P = new URLSearchParams(location.search);
// ?wltest=trees: every tree falls on lap 1 (for screenshots); ?wltest=fall: the player starts slow before the
// gorge lip, to check a missed jump is put back on the far side
const TEST = P.get('wltest') || '';

// ---------------------------------------------------------------- materials
const tl = new THREE.TextureLoader();
const texCache = {}, texWait = [];
function jtex(file, srgb) {
  if (texCache[file]) return texCache[file];
  // the scenery waits for these before it returns, so the first frame (and a headless still) has them
  let done;
  texWait.push(new Promise((r) => { done = r; }));
  const t = tl.load(`${BASE}textures/kaiele/jungle/${file}`, done, undefined, done);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return (texCache[file] = t);
}

// PBR set with UVs worked out in the shader from the instance's scaled local position, so one unit box or
// cylinder textures at metre scale whatever size it is stretched to. Box mode picks the face's dominant axis
// (walls get u across, v up: corrugations and wood grain run along a beam's length, its local Y); cylinder mode
// wraps u round the circumference.
function jmat(key, { scale = 2, metal = 0, rough = 1, cyl = false, color = 0xffffff, env = 0.7 } = {}) {
  const orm = jtex(`${key}_orm.jpg`);
  const m = new THREE.MeshStandardMaterial({
    map: jtex(`${key}_albedo.jpg`, true), normalMap: jtex(`${key}_normal.jpg`), roughnessMap: orm, metalnessMap: orm, aoMap: orm,
    roughness: rough, metalness: metal ? 1 : 0, color, envMapIntensity: env,
  });
  m.userData.wx = 'object';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTexScale = { value: scale };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTexScale;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_INSTANCING
vec3 bSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
vec3 bSc = vec3(1.0);
#endif
vec3 bP = position * bSc, bN = abs(normal);
${cyl ? 'vec2 bUv = bN.y > 0.9 ? bP.xz : vec2(atan(position.z, position.x) * 0.5 * bSc.x, bP.y);'
    : 'vec2 bUv = bN.x > max(bN.y, bN.z) ? bP.zy : (bN.y > bN.z ? bP.xz : bP.xy);'}
bUv /= uTexScale;
#ifdef USE_MAP
vMapUv = bUv;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = bUv;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv = bUv;
#endif
#ifdef USE_METALNESSMAP
vMetalnessMapUv = bUv;
#endif
#ifdef USE_AOMAP
vAoMapUv = bUv;
#endif`);
  };
  m.customProgramCacheKey = () => (cyl ? 'wl-cyl' : 'wl-box');
  return m;
}

function plain(color, rough = 0.8, metal = 0, wx = 'object') {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  m.userData.wx = wx;
  return m;
}

// ---------------------------------------------------------------- instanced kit of parts
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1);
const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
const HEX = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

class Kit {
  constructor() { this.L = new Map(); }
  add(geo, mat, m, col = WHITE, shadow = true) {
    const k = `${geo.uuid}|${mat.uuid}|${shadow}`;
    let e = this.L.get(k);
    if (!e) this.L.set(k, e = { geo, mat, shadow, m: [], c: [] });
    // array tints are weathering variation around the texture's own colour: squeeze them towards 1
    e.m.push(m.clone()); e.c.push(col instanceof THREE.Color ? col.clone() : new THREE.Color(...col.map((c) => 0.5 + 0.65 * c)));
  }
  // box centred at (x, y, z), sizes along its local axes, turned by yaw (and optionally pitch about local X, roll about Z)
  box(mat, x, y, z, sx, sy, sz, yaw = 0, col, pitch = 0, roll = 0, geo = BOX) {
    _e.set(pitch, yaw, roll, 'YXZ');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
    this.add(geo, mat, _m, col);
  }
  // a beam (or a cylinder: geo CYL) from a to b, w x d in section; its local X stays level
  beam(mat, a, b, w, d, col, geo = BOX, shadow = true) {
    _Y.subVectors(b, a);
    const len = _Y.length();
    if (len < 1e-4) return;
    _Y.divideScalar(len);
    _X.crossVectors(_Y, UP);
    if (_X.lengthSq() < 1e-6) _X.set(1, 0, 0); else _X.normalize();
    _Z.crossVectors(_X, _Y);
    _m.makeBasis(_X.multiplyScalar(w), _Y.multiplyScalar(len), _Z.multiplyScalar(d));
    _m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(geo, mat, _m, col, shadow);
  }
  cyl(mat, a, b, r, col, geo = CYL) { this.beam(mat, a, b, r * 2, r * 2, col, geo); }
  build(group, castShadow = true) {
    for (const e of this.L.values()) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.m.length);
      e.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, e.c[i]); });
      im.castShadow = castShadow && e.shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }
    this.L.clear();
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- placement helpers
function helpers(world, track) {
  const gy = (x, z) => world.heightAt(x, z);
  // a point at row i, lat metres to the left of the line (+ = the frame's normal side)
  const at = (i, lat) => { const f = track.frame(Math.round(i)); return { x: f.x + f.nx * lat, z: f.z + f.nz * lat, f }; };
  // ground under a footprint: lowest and highest of a 4 x 4 sample
  const foot = (x, z, yaw, w, d) => {
    let lo = Infinity, hi = -Infinity;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let a = -0.5; a <= 0.5; a += 1 / 3) for (let b = -0.5; b <= 0.5; b += 1 / 3) {
      const lx = a * w, lz = b * d;
      const y = gy(x + lx * c + lz * s, z - lx * s + lz * c);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return { lo, hi };
  };
  // somewhere beside row i between lat0 and lat1 (signed, same side) where a w x d footprint sits nearly level
  // and clear of the road; returns the flattest spot found
  const spot = (i, lat0, lat1, w, d, yawOff = 0, rowSpan = 0) => {
    let best = null;
    for (let di = -rowSpan; di <= rowSpan; di += 4) for (let k = 0; k <= 12; k++) {
      const lat = lat0 + (lat1 - lat0) * k / 12;
      const p = at(i + di, lat);
      const yaw = p.f.yaw + yawOff;
      const fp = foot(p.x, p.z, yaw, w, d);
      // keep the whole footprint off the road
      const near = track.nearest({ x: p.x, z: p.z }, track.wrap(i + di)).d;
      if (near - Math.hypot(w, d) / 2 < track.width / 2 + 1.5) continue;
      const score = fp.hi - fp.lo + Math.abs(lat - lat0) * 0.01;
      if (!best || score < best.score) best = { score, x: p.x, z: p.z, yaw, lo: fp.lo, hi: fp.hi, lat };
    }
    return best;
  };
  return { gy, at, foot, spot };
}

// ---------------------------------------------------------------- the sugar mill
function corrugatedShed(kit, M, rnd, { x, z, yaw, w, d, h, pitch = 0.32, base, lo, monitor = false, doors = 2, paint = null }) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, ly, lz) => V(x + lx * c + lz * s, base + ly, z - lx * s + lz * c);
  const tint = () => { const k = 0.75 + rnd() * 0.35; return [k, k * (0.92 + rnd() * 0.1), k * (0.85 + rnd() * 0.1)]; };
  // concrete plinth down to the lowest ground under it
  const ph = base - lo + 0.6;
  kit.box(M.conc, x, base - ph / 2 + 0.25, z, w + 0.6, ph, d + 0.6, yaw, [0.8, 0.78, 0.72]);
  // steel frame columns at each bay (the sheets are missing in places, so the frame shows)
  const bays = Math.max(2, Math.round(d / 5));
  for (let b = 0; b <= bays; b++) {
    const lz = -d / 2 + d * b / bays;
    for (const sx of [-1, 1]) kit.beam(M.rust, L(sx * (w / 2 - 0.15), 0.25, lz), L(sx * (w / 2 - 0.15), h, lz), 0.25, 0.25, [0.5, 0.4, 0.34]);
    // roof truss: rafters up to the ridge
    for (const sx of [-1, 1]) kit.beam(M.rust, L(sx * w / 2, h, lz), L(0, h + w / 2 * pitch, lz), 0.18, 0.3, [0.5, 0.4, 0.34]);
    kit.beam(M.rust, L(-w / 2, h, lz), L(w / 2, h, lz), 0.12, 0.12, [0.5, 0.4, 0.34]);
  }
  // wall sheets, 1.1 m wide, a few gone or hanging askew
  const sheet = (lx, lz, nx, wid, top) => {
    const r = rnd();
    if (r < 0.07) return; // missing
    const lean = r < 0.14 ? (rnd() - 0.5) * 0.25 : 0;
    const p = L(lx, top / 2 + 0.25, lz);
    kit.box(M.tin, p.x, p.y - (lean ? 0.2 : 0), p.z, nx ? 0.05 : wid, top - 0.2, nx ? wid : 0.05, yaw, tint(), nx ? 0 : lean, nx ? lean : 0);
  };
  for (let lz = -d / 2 + 0.55; lz < d / 2; lz += 1.1) for (const sx of [-1, 1]) {
    // big sliding doors on the long side facing the road
    const doorAt = doors && sx === 1 && Math.abs(((lz + d / 2) % (d / doors)) - d / doors / 2) < 2.2;
    if (doorAt) continue;
    sheet(sx * w / 2, lz, 1, 1.12, h);
  }
  for (let lx = -w / 2 + 0.55; lx < w / 2; lx += 1.1) for (const sz of [-1, 1]) {
    // gable ends: sheets reach up under the roof slope
    const top = h + (w / 2 - Math.abs(lx)) * pitch;
    sheet(lx, sz * d / 2, 0, 1.12, top);
  }
  // door openings: dark interior and a rusty door half slid open
  if (doors) for (let k = 0; k < doors; k++) {
    const lz = -d / 2 + d / doors * (k + 0.5);
    const p = L(w / 2 - 0.3, 2.3, lz);
    kit.box(M.dark, p.x, p.y, p.z, 0.05, 4.2, 4.4, yaw);
    const q = L(w / 2 + 0.15, 2.3, lz + 2.6 + rnd() * 1.2);
    kit.box(M.tin, q.x, q.y, q.z, 0.08, 4.4, 2.6, yaw, paint || tint());
  }
  // floor
  kit.box(M.conc, x, base + 0.15, z, w - 0.2, 0.2, d - 0.2, yaw, [0.45, 0.42, 0.38]);
  // roof: sheets either side of the ridge, some gone (sunlight falls through) and some slid down
  const slope = Math.atan(pitch), run = w / 2 / Math.cos(slope);
  for (let lz = -d / 2 - 0.3 + 0.5; lz < d / 2 + 0.3; lz += 1.0) for (const sx of [-1, 1]) {
    const r = rnd();
    if (r < 0.08) continue;
    const slip = r < 0.15 ? 0.6 + rnd() * 0.8 : 0;
    const lx = sx * (run / 2 + slip) * Math.cos(slope) + sx * 0.25;
    const p = L(lx, h + (w / 2 - Math.abs(lx)) * pitch + 0.12, lz);
    kit.box(M.tin, p.x, p.y, p.z, run + 0.5, 0.05, 1.05, yaw, tint(), 0, -sx * slope + (slip ? (rnd() - 0.5) * 0.06 : 0));
  }
  // ridge cap
  { const a = L(0, h + w / 2 * pitch + 0.18, -d / 2 - 0.3), b = L(0, h + w / 2 * pitch + 0.18, d / 2 + 0.3); kit.beam(M.rust, a, b, 0.5, 0.12, [0.6, 0.45, 0.35]); }
  // the mill's raised monitor roof along the ridge (vents the boiling house)
  if (monitor) {
    const mh = 1.6, mw = w * 0.3, top = h + w / 2 * pitch;
    for (let lz = -d / 2 + 2; lz < d / 2 - 2; lz += 1.1) for (const sx of [-1, 1]) {
      const p = L(sx * mw / 2, top - 0.2 + mh / 2, lz);
      if (rnd() < 0.3) kit.box(M.dark, p.x, p.y, p.z, 0.05, mh, 1.1, yaw); else kit.box(M.tin, p.x, p.y, p.z, 0.05, mh * 0.5, 1.1, yaw, tint());
    }
    for (let lz = -d / 2 + 1.5; lz < d / 2 - 1.5; lz += 1.0) for (const sx of [-1, 1]) {
      const lx = sx * (mw / 4 + 0.2);
      const p = L(lx, top + mh + (mw / 2 - Math.abs(lx)) * pitch, lz);
      kit.box(M.tin, p.x, p.y, p.z, mw / 2 + 0.6, 0.05, 1.05, yaw, tint(), 0, -sx * slope);
    }
  }
}

function brickChimney(group, kit, M, x, z, base, lo, H = 32) {
  // square brick plinth, then a tapering round stack with iron bands and a corbelled cap
  const ph = base - lo + 4.5;
  kit.box(M.brick, x, base + 4.5 - ph / 2, z, 4.2, ph, 4.2, 0.3);
  kit.box(M.brick, x, base + 4.7, z, 4.6, 0.4, 4.6, 0.3, [0.85, 0.8, 0.75]);
  const r0 = 1.75, r1 = 1.15, sh = H - 5;
  const geo = new THREE.CylinderGeometry(r1, r0, sh, 28, 8, true);
  // brick-scale UVs: u round the stack, v up it (r varies, so scale u by the mean circumference)
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * (r0 + r1) / 1.6, uv.getY(i) * sh / 1.6);
  const brick = new THREE.MeshStandardMaterial({ map: jtex('brick_albedo.jpg', true), normalMap: jtex('brick_normal.jpg'), roughnessMap: jtex('brick_orm.jpg'), aoMap: jtex('brick_orm.jpg'), color: 0xd8c8bc, roughness: 1 });
  brick.userData.wx = 'object';
  // soot darkens the top of the stack
  brick.onBeforeCompile = (sh2) => {
    sh2.vertexShader = sh2.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <begin_vertex>', `#include <begin_vertex>\nvH = position.y / ${sh.toFixed(1)} + 0.5;`);
    sh2.fragmentShader = sh2.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.25, smoothstep(0.7, 1.0, vH));');
  };
  const stack = new THREE.Mesh(geo, brick);
  stack.position.set(x, base + 4.9 + sh / 2, z);
  stack.castShadow = stack.receiveShadow = true;
  group.add(stack);
  const topY = base + 4.9 + sh;
  for (let k = 1; k < 6; k++) {
    const t = k / 6, r = r0 + (r1 - r0) * t + 0.04;
    kit.cyl(M.rustC, V(x, base + 4.9 + sh * t - 0.1, z), V(x, base + 4.9 + sh * t + 0.1, z), r, [0.4, 0.3, 0.25]);
  }
  kit.cyl(M.brickC, V(x, topY - 0.2, z), V(x, topY + 0.6, z), r1 + 0.28, [0.4, 0.3, 0.28]);
  kit.cyl(M.dark, V(x, topY + 0.55, z), V(x, topY + 0.62, z), r1 - 0.2);
  return topY;
}

function waterTower(kit, M, rnd, x, z, base, lo) {
  // four battered timber legs on concrete pads, braced, carrying a riveted tank under a conical roof
  const H = 9, R = 2.6, top = base + H;
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const b = V(x + sx * 2.7, base, z + sz * 2.7), t = V(x + sx * 1.9, top, z + sz * 1.9);
    kit.box(M.conc, b.x, base - (base - lo) / 2 + 0.2, b.z, 0.9, base - lo + 0.8, 0.9, 0);
    kit.beam(M.wood, b, t, 0.32, 0.32, [0.7, 0.65, 0.6]);
    legs.push([b, t]);
  }
  for (let k = 0; k < 4; k++) {
    const [b0, t0] = legs[k], [b1, t1] = legs[(k + 1) % 4];
    for (const f of [0.33, 0.66]) {
      const a = b0.clone().lerp(t0, f), b = b1.clone().lerp(t1, f);
      kit.beam(M.wood, a, b, 0.15, 0.2, [0.7, 0.65, 0.6]);
    }
    kit.beam(M.rust, b0.clone().lerp(t0, 0.05), b1.clone().lerp(t1, 0.62), 0.04, 0.04, [0.4, 0.3, 0.25]);
    kit.beam(M.rust, b1.clone().lerp(t1, 0.05), b0.clone().lerp(t0, 0.62), 0.04, 0.04, [0.4, 0.3, 0.25]);
  }
  kit.box(M.wood, x, top + 0.15, z, 5.2, 0.3, 5.2, 0, [0.6, 0.55, 0.5]);
  kit.cyl(M.rustC, V(x, top + 0.3, z), V(x, top + 4.3, z), R, [0.75, 0.5, 0.38]);
  for (const y of [1.2, 2.4, 3.6]) kit.cyl(M.rustC, V(x, top + 0.3 + y - 0.05, z), V(x, top + 0.3 + y + 0.05, z), R + 0.04, [0.45, 0.32, 0.25]);
  // ladder up one leg and the spout
  const lb = legs[0][0].clone().add(V(-0.5, 0, 0)), lt = legs[0][1].clone().add(V(-0.5, 4.3, 0));
  kit.beam(M.rust, lb, lt, 0.05, 0.05, [0.4, 0.3, 0.25]);
  kit.beam(M.rust, lb.clone().add(V(0, 0, 0.45)), lt.clone().add(V(0, 0, 0.45)), 0.05, 0.05, [0.4, 0.3, 0.25]);
  for (let k = 0; k < 18; k++) { const p = lb.clone().lerp(lt, k / 18); kit.beam(M.rust, p, p.clone().add(V(0, 0, 0.45)), 0.03, 0.03, [0.4, 0.3, 0.25]); }
  const sp = V(x + R, top + 1.0, z);
  kit.cyl(M.rustC, sp, sp.clone().add(V(1.6, -0.9, 0.4)), 0.13, [0.45, 0.3, 0.22]);
  return { roof: V(x, top + 4.3, z), R };
}

function flywheel(group, kit, M, x, z, base, yaw, r = 2.4) {
  // a big spoked flywheel on its bearing blocks, half its rim sunk in a pit
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ax = V(c, 0, -s), cy = base + r * 0.75;
  const centre = V(x, cy, z);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 8, 40).rotateY(Math.PI / 2), M.rust);
  rim.position.copy(centre); rim.rotation.y = yaw; rim.castShadow = rim.receiveShadow = true;
  group.add(rim);
  const perp = V(s, 0, c);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const dir = perp.clone().multiplyScalar(Math.cos(a)).add(V(0, Math.sin(a), 0));
    kit.beam(M.rust, centre, centre.clone().addScaledVector(dir, r - 0.1), 0.12, 0.2, [0.55, 0.4, 0.32]);
  }
  kit.cyl(M.rustC, centre.clone().addScaledVector(ax, -1.6), centre.clone().addScaledVector(ax, 1.6), 0.22, [0.35, 0.28, 0.24]);
  kit.cyl(M.rustC, centre.clone().addScaledVector(ax, -0.35), centre.clone().addScaledVector(ax, 0.35), 0.45, [0.5, 0.36, 0.28]);
  for (const k of [-1.3, 1.3]) {
    const p = centre.clone().addScaledVector(ax, k);
    kit.box(M.conc, p.x, base + (cy - base) / 2, p.z, 0.8, cy - base + 0.3, 1.2, yaw, [0.6, 0.58, 0.54]);
  }
}

function crusher(kit, M, x, z, base, yaw) {
  // three-roller cane crusher in a cast-iron frame, with its gear wheel
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, ly, lz) => V(x + lx * c + lz * s, base + ly, z - lx * s + lz * c);
  kit.box(M.conc, x, base + 0.3, z, 3.6, 0.6, 4.6, yaw, [0.55, 0.52, 0.48]);
  for (const lz of [-1.7, 1.7]) {
    kit.box(M.rust, L(0, 0, lz).x, base + 1.9, L(0, 0, lz).z, 2.6, 2.6, 0.35, yaw, [0.45, 0.33, 0.27]);
  }
  for (const [lx, ly] of [[-0.7, 1.4], [0.7, 1.4], [0, 2.5]]) kit.cyl(M.rustC, L(lx, ly, -2.1), L(lx, ly, 2.1), 0.48, [0.5, 0.36, 0.28]);
  kit.cyl(M.rustC, L(0, 2.5, 2.1), L(0, 2.5, 2.45), 1.2, [0.42, 0.3, 0.24], CYL6);
}

function boiler(kit, M, x, z, base, yaw) {
  // horizontal fire-tube boiler on a brick setting, with its stack pipe
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, ly, lz) => V(x + lx * c + lz * s, base + ly, z - lx * s + lz * c);
  const b = L(0, 0.8, 0);
  kit.box(M.brick, b.x, b.y, b.z, 2.6, 1.6, 6.4, yaw, [0.85, 0.75, 0.7]);
  kit.cyl(M.rustC, L(0, 2.3, -3.2), L(0, 2.3, 3.2), 1.1, [0.6, 0.42, 0.32]);
  for (const lz of [-2.4, -0.8, 0.8, 2.4]) kit.cyl(M.rustC, L(0, 2.3, lz - 0.06), L(0, 2.3, lz + 0.06), 1.14, [0.4, 0.3, 0.24]);
  kit.cyl(M.rustC, L(0, 3.2, 2.6), L(0, 7.5, 2.6), 0.35, [0.35, 0.26, 0.22]);
  kit.cyl(M.rustC, L(0.9, 2.9, -1), L(2.6, 2.9, -1), 0.12, [0.4, 0.3, 0.24]);
  kit.box(M.dark, L(0, 0.8, -3.22).x, base + 0.8, L(0, 0.8, -3.22).z, 1.0, 0.8, 0.05, yaw);
}

// narrow-gauge rail line along a lateral offset from row i0 to i1, rails on timber sleepers, following the ground
function railLine(kit, M, H, track, i0, i1, lat, rnd, { gauge = 0.92, every = 0.75, missing = 0.04 } = {}) {
  const pts = [];
  for (let i = i0; i <= i1; i += 1) {
    const p = H.at(i, lat);
    pts.push(V(p.x, H.gy(p.x, p.z), p.z));
  }
  // smooth the rail heights so they read as a laid line rather than draped on every bump
  for (let it = 0; it < 4; it++) for (let k = 1; k < pts.length - 1; k++) pts[k].y = (pts[k - 1].y + pts[k].y * 2 + pts[k + 1].y) / 4;
  const curve = new THREE.CatmullRomCurve3(pts);
  const len = curve.getLength();
  const n = Math.floor(len / every);
  const t = new THREE.Vector3(), q = new THREE.Vector3();
  for (let k = 0; k <= n; k++) {
    if (rnd() < missing) continue;
    const u = k / n;
    curve.getPointAt(u, q); curve.getTangentAt(u, t);
    const yaw = Math.atan2(t.x, t.z) + Math.PI / 2 + (rnd() - 0.5) * 0.08;
    const sunk = 0.04 + rnd() * 0.05;
    kit.box(M.wood, q.x, q.y + 0.07 - sunk, q.z, 1.7, 0.14, 0.22, yaw, [0.55 + rnd() * 0.2, 0.5 + rnd() * 0.15, 0.45]);
  }
  for (const side of [-1, 1]) {
    const seg = 3;
    for (let k = 0; k < Math.floor(len / seg); k++) {
      const a = curve.getPointAt(k * seg / len), b = curve.getPointAt(Math.min(1, (k + 1) * seg / len));
      curve.getTangentAt(k * seg / len, t);
      const nx = t.z, nz = -t.x, L2 = Math.hypot(nx, nz) || 1;
      const o = V(nx / L2 * side * gauge / 2, 0.19, nz / L2 * side * gauge / 2);
      kit.beam(M.rail, a.clone().add(o), b.clone().add(o), 0.07, 0.11, [0.42, 0.3, 0.24]);
    }
  }
  return curve;
}

// a cane car: four-wheel flat with a stake cage, standing on the rails at u along the curve
function caneCar(kit, M, curve, u, rnd, loaded) {
  const p = curve.getPointAt(u), t = curve.getTangentAt(u);
  const yaw = Math.atan2(t.x, t.z);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, ly, lz) => V(p.x + lx * c + lz * s, p.y + ly, p.z - lx * s + lz * c);
  const bed = 0.85;
  const col = [0.6 + rnd() * 0.2, 0.42, 0.32];
  kit.box(M.rust, L(0, 0, 0).x, p.y + bed, L(0, 0, 0).z, 1.7, 0.18, 3.6, yaw, col);
  for (const lz of [-1.1, 1.1]) {
    kit.cyl(M.rustC, L(-0.6, 0.5, lz), L(0.6, 0.5, lz), 0.05, [0.3, 0.25, 0.22]);
    for (const lx of [-0.46, 0.46]) kit.cyl(M.rustC, L(lx - 0.05, 0.32, lz), L(lx + 0.05, 0.32, lz), 0.3, [0.32, 0.25, 0.2]);
  }
  // stakes and top rails
  for (const lx of [-0.82, 0.82]) {
    for (let lz = -1.7; lz <= 1.71; lz += 0.68) kit.beam(M.rust, L(lx, bed, lz), L(lx * (1 + rnd() * 0.05), bed + 1.4, lz), 0.07, 0.07, col);
    kit.beam(M.rust, L(lx, bed + 1.35, -1.75), L(lx, bed + 1.35, 1.75), 0.06, 0.06, col);
  }
  for (const lz of [-1.75, 1.75]) kit.beam(M.rust, L(-0.82, bed + 1.35, lz), L(0.82, bed + 1.35, lz), 0.06, 0.06, col);
  if (loaded) {
    // a load of cut cane stalks, long since dried out
    for (let k = 0; k < 46; k++) {
      const lx = (rnd() - 0.5) * 1.45, ly = bed + 0.15 + rnd() * 1.0 * (1 - Math.abs(lx) * 0.4);
      const a = L(lx, ly, -1.65 + rnd() * 0.2), b = L(lx + (rnd() - 0.5) * 0.3, ly + (rnd() - 0.5) * 0.2, 1.6 - rnd() * 0.2);
      kit.cyl(M.cane, a, b, 0.035, [0.55 + rnd() * 0.25, 0.5 + rnd() * 0.2, 0.28]);
    }
  }
}

// ---------------------------------------------------------------- canvas textures
function bannerTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 160;
  const g = cv.getContext('2d');
  g.fillStyle = '#1b2a1c'; g.fillRect(0, 0, 1024, 160);
  // checkered borders
  for (let k = 0; k < 64; k++) for (let r = 0; r < 2; r++) {
    g.fillStyle = (k + r) % 2 ? '#f2efe6' : '#141414';
    g.fillRect(k * 16, r * 16, 16, 16); g.fillRect(k * 16, 128 + r * 16, 16, 16);
  }
  g.fillStyle = '#f4d35e';
  g.font = 'bold 76px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 82);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function gridTexture() {
  // start line (checkered) and a grid box outline, for decals laid on the road
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? 'rgba(240,238,230,0.92)' : 'rgba(20,20,20,0.9)'; g.fillRect(i * 16, j * 16, 16, 16); }
  g.strokeStyle = 'rgba(238,236,228,0.9)'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(40, 250); g.lineTo(40, 110); g.lineTo(216, 110); g.lineTo(216, 250); g.stroke();
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(90,60,40,${Math.random() * 0.5})`; g.fillRect(Math.random() * 256, 64 + Math.random() * 192, 2, 2); g.clearRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function depthPostTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#ece8dc'; g.fillRect(0, 0, 64, 512);
  // bands every 0.25 m (the post is 2 m: 64 px per 0.25 m), numbered every half metre from the bottom
  for (let k = 0; k < 8; k++) {
    g.fillStyle = k % 2 ? '#c8261d' : '#ece8dc';
    g.fillRect(0, 512 - (k + 1) * 64, 64, 64);
    if (k % 2 === 0) { g.fillStyle = '#111'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText((k * 0.25).toFixed(1), 32, 512 - k * 64 - 22); }
  }
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(70,50,30,${Math.random() * 0.4})`; g.fillRect(Math.random() * 64, 380 + Math.random() * 132, 2, 3); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a decal strip draped on the ground: rows i0..i1, lat -w/2..w/2, uv (0..1 across, 0..1 along)
function drape(world, track, i0, i1, w, lift = 0.15, steps = 8) {
  const pos = [], uv = [], idx = [];
  const n = i1 - i0;
  for (let k = 0; k <= n; k++) {
    const f = track.frame(i0 + k);
    for (let j = 0; j <= steps; j++) {
      const l = (j / steps - 0.5) * w;
      const x = f.x + f.nx * l, z = f.z + f.nz * l;
      pos.push(x, world.heightAt(x, z) + lift, z);
      uv.push(j / steps, k / n);
    }
  }
  for (let k = 0; k < n; k++) for (let j = 0; j < steps; j++) {
    const a = k * (steps + 1) + j, b = a + 1, c = a + steps + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The gorge lip: a basalt slab kicker over the last metres of road before the edge. The bake leaves the lip
// nearly flat, and a truck at the slower end of the AI's lip speeds (about 38 m/s) dropped short; this tips the
// launch up about 6 degrees so every speed the AI reaches clears the gap, the fastest landing well down the run-out.
// Rows: [lip - LIP_LEN .. lip], height above the road h * u^2 (u 0 -> 1), so it eases in and launches at its end.
const LIP_LEN = 14, LIP_H = 0.75;
function lipRamp(track) {
  const { lip } = track.gorge;
  const hw = track.width / 2 + 1.0;
  const rows = [];
  for (let k = 0; k <= LIP_LEN; k++) {
    const i = lip - LIP_LEN + k, f = track.frame(i), u = k / LIP_LEN;
    rows.push({ f, y: track.at(i)[1] + LIP_H * u * u, hw });
  }
  return rows;
}

// ---------------------------------------------------------------- scenery
export async function buildScenery(ctx) {
  const { scene, world, quality, track, M: MS } = ctx;
  const low = !!quality.aiLod;
  const rnd = mulberry(7311);
  const H = helpers(world, track);
  const group = new THREE.Group();
  group.name = 'wailele';
  scene.add(group);
  const kit = new Kit(), small = new Kit();
  const M = {
    tin: jmat('tin', { scale: 2.2, metal: 1 }),
    rust: jmat('rust', { scale: 1.5, metal: 1, color: 0xe0c0b0 }),
    rustC: jmat('rust', { scale: 1.5, metal: 1, cyl: true, color: 0xe0c0b0 }),
    rail: jmat('rust', { scale: 1, metal: 1, color: 0x9a8070 }),
    brick: jmat('brick', { scale: 1.6 }),
    brickC: jmat('brick', { scale: 1.6, cyl: true }),
    wood: jmat('wood', { scale: 1.8, color: 0xfff4e8 }),
    rock: jmat('rock', { scale: 3 }),
    conc: plain(0x8c877e, 0.95),
    dark: plain(0x0d0b0a, 1),
    cane: plain(0xa08a52, 0.9),
    paintW: plain(0xe9e5da, 0.6),
    steel: plain(0x6c6e70, 0.45, 0.8),
  };
  // dark_rock is near black: lift it to a weathered basalt grey
  M.rock.color.setRGB(3.6, 3.6, 3.8);
  M.rockSide = jmat('rock', { scale: 2.5 });
  M.rockSide.color.setRGB(3.2, 3.1, 3.0);
  M.rockSide.side = THREE.DoubleSide;
  const colliders = [];
  const W = track.width;

  // ---- the sugar mill: sheds on the ground beside the start straight, wherever it is level enough
  const line = track.line;
  const side = 1; // the mill yard sits east of the straight (the frame's normal side)
  const mill = H.spot(line + 30, side * 18, side * 62, 18, 34, 0, 16);
  if (mill) corrugatedShed(kit, M, rnd, { x: mill.x, z: mill.z, yaw: mill.yaw, w: 18, d: 34, h: 9, base: mill.hi + 0.1, lo: mill.lo, monitor: true, doors: 2 });
  const shed2 = H.spot(line - 30, -side * 16, -side * 55, 12, 22, 0, 12);
  if (shed2) corrugatedShed(kit, M, rnd, { x: shed2.x, z: shed2.z, yaw: shed2.yaw + Math.PI, w: 12, d: 22, h: 6, pitch: 0.28, base: shed2.hi + 0.1, lo: shed2.lo, doors: 1 });
  // a lean-to store, half collapsed
  const shed3 = H.spot(line + 90, side * 15, side * 45, 8, 12, 0, 12);
  if (shed3) corrugatedShed(kit, M, rnd, { x: shed3.x, z: shed3.z, yaw: shed3.yaw + 0.05, w: 8, d: 12, h: 4.2, pitch: 0.2, base: shed3.hi + 0.1, lo: shed3.lo, doors: 1, paint: [0.4, 0.5, 0.42] });
  // the boiling house chimney stands behind the mill
  const ch = H.spot(line + 72, side * 26, side * 70, 5, 5, 0, 10);

  if (ch) brickChimney(group, kit, M, ch.x, ch.z, ch.hi, ch.lo, 34);
  const wt = H.spot(line + 50, -side * 14, -side * 45, 7, 7, 0, 12);
  if (wt) waterTower(kit, M, rnd, wt.x, wt.z, wt.hi, wt.lo);
  // machinery left out in the yard to rust
  const yard = H.spot(line + 4, side * 14, side * 40, 12, 14, 0, 10);
  if (yard) {
    const c = Math.cos(yard.yaw), s = Math.sin(yard.yaw);
    const Lp = (lx, lz) => [yard.x + lx * c + lz * s, yard.z - lx * s + lz * c];
    let [x, z] = Lp(-2, -3);
    flywheel(group, kit, M, x, z, H.gy(x, z) - 0.6, yard.yaw);
    [x, z] = Lp(3, 3);
    crusher(kit, M, x, z, H.gy(x, z) - 0.1, yard.yaw + 0.4);
    [x, z] = Lp(2, -4);
    boiler(kit, M, x, z, H.gy(x, z) - 0.15, yard.yaw + 1.3);
    // scattered gears and pipes in the grass
    for (let k = 0; k < 7; k++) {
      [x, z] = Lp((rnd() - 0.5) * 11, (rnd() - 0.5) * 13);
      const y = H.gy(x, z);
      if (k < 3) kit.cyl(M.rustC, V(x, y + 0.05, z), V(x, y + 0.3, z), 0.5 + rnd() * 0.6, [0.45, 0.32, 0.26], CYL6);
      else { const a = rnd() * 6.3; kit.cyl(M.rustC, V(x, y + 0.15, z), V(x + Math.cos(a) * 4, y + 0.2, z + Math.sin(a) * 4), 0.15, [0.42, 0.3, 0.24]); }
    }
  }

  // ---- the cane line: narrow gauge alongside the straight on the mill side, cane cars standing on it
  const railLat = side * (W / 2 + 3.2);
  const cane = railLine(kit, M, H, track, line - 110, line + 150, railLat, rnd);
  const cl = cane.getLength();
  for (const [u, loaded] of [[60, true], [64.4, true], [69, false], [140, true]]) caneCar(kit, M, cane, u / cl, rnd, loaded);
  // a buffer stop at the south end
  { const p = cane.getPointAt(0), t = cane.getTangentAt(0); const yaw = Math.atan2(t.x, t.z); kit.box(M.wood, p.x, p.y + 0.5, p.z, 1.6, 0.35, 0.35, yaw, [0.6, 0.5, 0.45]); kit.box(M.wood, p.x - t.x * 0.5, p.y + 0.3, p.z - t.z * 0.5, 0.3, 0.6, 1.0, yaw, [0.6, 0.5, 0.45]); }

  // ---- start/finish gantry: two lattice towers and a truss over the road with the banner
  {
    const f = track.frame(line);
    const span = W / 2 + 1.6, hh = 7.2;
    const legs = [-1, 1].map((sd) => { const x = f.x + f.nx * sd * span, z = f.z + f.nz * sd * span; return V(x, H.gy(x, z), z); });
    const topY = Math.max(legs[0].y, legs[1].y) + hh;
    const tw = 0.7;
    for (const b of legs) {
      for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const dx = (f.nx * ox + f.tx * oz) * tw / 2, dz = (f.nz * ox + f.tz * oz) * tw / 2;
        kit.beam(M.steel, V(b.x + dx, b.y - 0.3, b.z + dz), V(b.x + dx, topY + 0.6, b.z + dz), 0.08, 0.08);
      }
      for (let y = b.y; y < topY; y += 0.9) {
        for (const oz of [-1, 1]) {
          const a = V(b.x - f.nx * tw / 2 + f.tx * oz * tw / 2, y, b.z - f.nz * tw / 2 + f.tz * oz * tw / 2);
          const c = V(b.x + f.nx * tw / 2 + f.tx * oz * tw / 2, y + 0.9, b.z + f.nz * tw / 2 + f.tz * oz * tw / 2);
          small.beam(M.steel, a, c, 0.04, 0.04);
        }
      }
      kit.box(M.conc, b.x, b.y - 0.2, b.z, 1.2, 0.6, 1.2, f.yaw);
    }
    // truss: top and bottom chords and zigzag diagonals, both faces
    for (const oz of [-0.35, 0.35]) {
      const A = (sd, y) => V(f.x + f.nx * sd * span + f.tx * oz, y, f.z + f.nz * sd * span + f.tz * oz);
      kit.beam(M.steel, A(-1, topY), A(1, topY), 0.1, 0.1);
      kit.beam(M.steel, A(-1, topY + 1.2), A(1, topY + 1.2), 0.1, 0.1);
      const n = 12;
      for (let k = 0; k < n; k++) {
        const s0 = -1 + 2 * k / n, s1 = -1 + 2 * (k + 1) / n;
        small.beam(M.steel, A(s0, k % 2 ? topY + 1.2 : topY), A(s1, k % 2 ? topY : topY + 1.2), 0.05, 0.05);
      }
    }
    // banner on both faces
    const tex = bannerTexture('WAILELE NAHELE');
    const bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide });
    bm.userData.wx = 'object';
    bm.side = THREE.FrontSide;
    for (const k of [0, 1]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 1.2, (span * 2 - 1.2) * 160 / 1024), bm);
      // one face towards the trucks coming up to the line, one towards the start straight behind
      banner.position.set(f.x - f.tx * (k ? -0.02 : 0.02), topY + 0.6, f.z - f.tz * (k ? -0.02 : 0.02));
      banner.rotation.y = f.yaw + (k ? 0 : Math.PI);
      banner.castShadow = !k;
      group.add(banner);
    }
    // grid boxes and the line
    const gt = gridTexture();
    const decal = (geo, uvRect) => {
      const m = new THREE.MeshStandardMaterial({ map: gt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.7 });
      m.userData.wx = 'road';
      m.map = gt.clone(); m.map.needsUpdate = true;
      m.map.offset.set(uvRect[0], uvRect[1]); m.map.repeat.set(uvRect[2], uvRect[3]);
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = 2; mesh.receiveShadow = true;
      group.add(mesh);
    };
    decal(drape(world, track, line - 1, line + 1, W, 0.16, 16), [0, 0.75, 1, 0.25]);
    for (let k = 0; k < 8; k++) {
      const sl = track.gridSlot(k);
      const f2 = track.frame(sl.i);
      const lat = (sl.x - f2.x) * f2.nx + (sl.z - f2.z) * f2.nz;
      // a 2.8 m x 5 m box behind each slot (drape builds around the centre line: shift the vertices across)
      const g = drape(world, track, sl.i - 2, sl.i + 3, 2.8, 0.16, 2);
      const pa = g.attributes.position;
      for (let v = 0; v < pa.count; v++) {
        const r = track.frame(sl.i - 2 + Math.floor(v / 3));
        const x = pa.getX(v) + r.nx * lat, z = pa.getZ(v) + r.nz * lat;
        pa.setXYZ(v, x, world.heightAt(x, z) + 0.16, z);
      }
      decal(g, [0, 0, 1, 0.72]);
    }
  }

  // ---- spectators on the banks at the start and above the gorge landing
  const crowd = [];
  const addCrowd = (i0, i1, lat0, lat1, n) => {
    for (let k = 0; k < n; k++) {
      const i = Math.round(i0 + (i1 - i0) * rnd());
      const sd = rnd() < 0.5 ? -1 : 1;
      const p = H.at(i, sd * (lat0 + (lat1 - lat0) * rnd()));
      const near = track.nearest({ x: p.x, z: p.z }, track.wrap(i)).d;
      if (near < W / 2 + 2.5) continue;
      // not on a cliff face
      const nrm = world.normalAt(p.x, p.z);
      if (nrm.y < 0.6) continue;
      crowd.push({ x: p.x, z: p.z, y: H.gy(p.x, p.z), yaw: p.f.yaw + sd * Math.PI / 2 + (rnd() - 0.5) * 1.2 });
    }
  };
  addCrowd(line - 30, line + 60, W / 2 + 3, W / 2 + 16, low ? 30 : 70);
  addCrowd(track.gorge.land + 4, track.gorge.land + 40, W / 2 + 3, W / 2 + 14, low ? 10 : 24);
  addCrowd(track.trestle[1] + 6, track.trestle[1] + 30, W / 2 + 3, W / 2 + 12, low ? 6 : 14);
  if (crowd.length) {
    const torso = mergeGeometries([new THREE.BoxGeometry(0.42, 0.62, 0.24).translate(0, 1.18, 0),
      new THREE.BoxGeometry(0.11, 0.6, 0.11).translate(-0.27, 1.17, 0).rotateZ(0.08), new THREE.BoxGeometry(0.11, 0.6, 0.11).translate(0.27, 1.17, 0).rotateZ(-0.08)]);
    const legs = new THREE.BoxGeometry(0.36, 0.86, 0.2).translate(0, 0.43, 0);
    const head = mergeGeometries([new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.64, 0), new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10).translate(0, 1.74, 0)]);
    const shirts = [[0.85, 0.2, 0.18], [0.95, 0.85, 0.3], [0.2, 0.45, 0.75], [0.95, 0.95, 0.92], [0.2, 0.6, 0.4], [0.9, 0.5, 0.2], [0.7, 0.3, 0.6]];
    const parts = [[torso, (r) => shirts[Math.floor(r * shirts.length)]], [legs, (r) => [0.12 + r * 0.25, 0.12 + r * 0.2, 0.15 + r * 0.25]], [head, (r) => [0.55 + r * 0.3, 0.38 + r * 0.2, 0.26 + r * 0.12]]];
    const mat = plain(0xffffff, 0.85);
    for (const [geo, colf] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, crowd.length);
      const r2 = mulberry(55);
      crowd.forEach((c, k) => {
        _m.compose(_p.set(c.x, c.y - 0.05, c.z), _q.setFromAxisAngle(UP, c.yaw), _s.setScalar(0.92 + r2() * 0.16));
        im.setMatrixAt(k, _m); im.setColorAt(k, new THREE.Color(...colf(rnd())));
      });
      im.castShadow = !low; im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  }

  // ---- the falls gorge: basalt column walls under the lip and the landing, a rock lip, boulders on the floor
  {
    const { lip, land } = track.gorge;
    const lipY = track.at(lip)[1];
    const face = (row, dir) => {
      // dir +1: the wall faces forward (under the lip); -1: faces back (under the landing)
      const f = track.frame(row);
      for (let lat = -24; lat <= 24; lat += 0.62) {
        for (let layer = 0; layer < 2; layer++) {
          const out = (layer ? 0.55 : 0.05) + rnd() * 0.25;
          const x = f.x + f.nx * lat + f.tx * dir * out, z = f.z + f.nz * lat + f.tz * dir * out;
          const g = H.gy(x, z);
          // top: just under the road surface across the road, then the natural ground beside it
          const back = H.gy(x - f.tx * dir * 2.5, z - f.tz * dir * 2.5);
          let top = Math.abs(lat) < W / 2 + 0.5 ? track.at(row)[1] - 0.08 - layer * (0.4 + rnd() * 0.8) : back + (rnd() - 0.3) * 0.9 - layer * 0.6;
          if (top - g < 0.6) continue;
          const r = 0.33 + rnd() * 0.08;
          kit.box(M.rock, x, (top + g - 1) / 2, z, r * 2, top - g + 1, r * 2, rnd() * 1.05, [0.75 + rnd() * 0.3, 0.75 + rnd() * 0.3, 0.8 + rnd() * 0.3], 0, 0, HEX);
        }
      }
    };
    face(lip + 1, 1);
    face(land - 1, -1);
    // the kicker: a slab of rock on the road over the last metres to the edge (its collider is per race, in
    // TrackEvents), its front face dropping into the gorge and its sides into the ground
    {
      const R = lipRamp(track), pos = [], idx = [];
      const push = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
      for (let k = 0; k < R.length; k++) {
        const { f, y, hw } = R[k];
        const g0 = H.gy(f.x - f.nx * hw, f.z - f.nz * hw) - 0.3, g1 = H.gy(f.x + f.nx * hw, f.z + f.nz * hw) - 0.3;
        push(f.x - f.nx * hw, g0, f.z - f.nz * hw); push(f.x - f.nx * hw, y + 0.02, f.z - f.nz * hw);
        push(f.x + f.nx * hw, y + 0.02, f.z + f.nz * hw); push(f.x + f.nx * hw, g1, f.z + f.nz * hw);
        if (k) for (let c = 0; c < 3; c++) { const a0 = (k - 1) * 4 + c, b0 = a0 + 4; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      }
      // front face down to below the road at the edge
      const e = R[R.length - 1], n = (R.length - 1) * 4;
      const lo = e.y - LIP_H - 1.2;
      const f0 = push(e.f.x - e.f.nx * e.hw, lo, e.f.z - e.f.nz * e.hw), f1 = push(e.f.x + e.f.nx * e.hw, lo, e.f.z + e.f.nz * e.hw);
      idx.push(n + 1, n + 2, f0, f0, n + 2, f1);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const slab = new THREE.Mesh(g, M.rockSide);
      slab.castShadow = slab.receiveShadow = true;
      group.add(slab);
    }
    // the lip itself: a ledge of column tops either side of the road, stepped down to the edge
    const fl = track.frame(lip);
    for (const sd of [-1, 1]) for (let k = 0; k < 14; k++) {
      const lat = sd * (W / 2 + 0.4 + rnd() * 3.5), back = rnd() * 5;
      const x = fl.x + fl.nx * lat - fl.tx * back, z = fl.z + fl.nz * lat - fl.tz * back;
      const g = H.gy(x, z), h = 0.3 + rnd() * 1.1;
      kit.box(M.rock, x, g - 0.5 + h / 2, z, 0.7, h + 1, 0.7, rnd(), [0.8, 0.8, 0.85], 0, 0, HEX);
    }
    // fallen columns and boulders on the gorge floor
    for (let k = 0; k < (low ? 14 : 34); k++) {
      const row = lip + 2 + Math.floor(rnd() * (land - lip - 4));
      const p = H.at(row, (rnd() - 0.5) * 30);
      const g = H.gy(p.x, p.z);
      if (g > lipY - 3) continue;
      const len = 0.8 + rnd() * 2.6;
      const a = rnd() * 6.28;
      kit.box(M.rock, p.x, g + 0.25, p.z, 0.7, len, 0.7, a, [0.7, 0.7, 0.75], Math.PI / 2 + (rnd() - 0.5) * 0.4, 0, HEX);
    }
  }

  // ---- the rail trestle: timber ties on stringers, cross-braced bents down to the river bed, no barriers
  {
    const [t0, t1] = track.trestle;
    const deckY = track.at(Math.round((t0 + t1) / 2))[1];
    const DW = 8.4, top = 0.14;
    const rows = [];
    for (let i = t0; i <= t1; i++) rows.push(track.frame(i));
    // ties every 0.55 m across the full deck (gaps between them: you can see the river through)
    const curvePts = rows.map((f) => V(f.x, deckY, f.z));
    const cv = new THREE.CatmullRomCurve3(curvePts);
    const len = cv.getLength();
    const tt = new THREE.Vector3();
    for (let s = 0; s < len; s += 0.55) {
      const p = cv.getPointAt(s / len); cv.getTangentAt(s / len, tt);
      const yaw = Math.atan2(tt.x, tt.z);
      kit.box(M.wood, p.x, deckY + top - 0.11, p.z, DW, 0.22, 0.3, yaw, [0.6 + rnd() * 0.25, 0.55 + rnd() * 0.2, 0.5 + rnd() * 0.15]);
    }
    // stringers, rails and low wheel guards along the deck
    const along = (lat, y, w, h, mat, col, seg = 2.2) => {
      for (let s = 0; s < len - 0.01; s += seg) {
        const a = cv.getPointAt(s / len), b = cv.getPointAt(Math.min(1, (s + seg) / len));
        cv.getTangentAt(s / len, tt);
        const nx = tt.z, nz = -tt.x;
        kit.beam(mat, V(a.x + nx * lat, y, a.z + nz * lat), V(b.x + nx * lat, y, b.z + nz * lat), w, h, col);
      }
    };
    for (const lat of [-3.0, -1.6, -0.5, 0.5, 1.6, 3.0]) along(lat, deckY + top - 0.22 - 0.25, 0.3, 0.5, M.wood, [0.5, 0.45, 0.4]);
    for (const lat of [-0.46, 0.46]) along(lat, deckY + top + 0.05, 0.07, 0.11, M.rail, [0.42, 0.3, 0.24], 3);
    // wheel guards: a low timber kerb along each edge (a wheel that strays glances off; a truck can still go over)
    for (const lat of [-DW / 2 + 0.15, DW / 2 - 0.15]) along(lat, deckY + top + 0.15, 0.3, 0.3, M.wood, [0.55, 0.5, 0.44], 3);
    // deck colliders: level boxes along the line, their tops at the tie tops
    for (let k = 0; k < rows.length - 1; k += 2) {
      const a = rows[k], b = rows[Math.min(rows.length - 1, k + 2)];
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const d = Math.hypot(b.x - a.x, b.z - a.z) + 0.3, x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      colliders.push({ x, y: deckY + top - 0.6, z, w: DW, h: 0.6, d, yaw });
      for (const sd of [-1, 1]) colliders.push({ x: x + Math.cos(yaw) * sd * (DW / 2 - 0.15), y: deckY + top, z: z - Math.sin(yaw) * sd * (DW / 2 - 0.15), w: 0.3, h: 0.3, d, yaw });
    }
    // bents every 4.6 m: five posts (the outer pair battered), a cap, girts and X bracing each storey, a sill
    const capY = deckY + top - 0.22 - 0.5 - 0.2;
    let prev = null;
    for (let s = 2.3; s < len - 1; s += 4.6) {
      const p = cv.getPointAt(s / len); cv.getTangentAt(s / len, tt);
      const nx = tt.z, nz = -tt.x;
      const Pt = (lat, y) => V(p.x + nx * lat, y, p.z + nz * lat);
      let foot = Infinity;
      for (const lat of [-5, -2.4, 0, 2.4, 5]) foot = Math.min(foot, H.gy(p.x + nx * lat, p.z + nz * lat));
      foot -= 0.4;
      if (capY - foot < 1.2) { prev = null; continue; }
      const hgt = capY - foot;
      kit.beam(M.wood, Pt(-DW / 2 - 0.3, capY), Pt(DW / 2 + 0.3, capY), 0.35, 0.4, [0.5, 0.45, 0.4]);
      const batter = Math.min(1.6, hgt * 0.12);
      const posts = [[-3.2, -3.2 - batter], [-1.6, -1.6], [0, 0], [1.6, 1.6], [3.2, 3.2 + batter]];
      for (const [lt, lb] of posts) kit.beam(M.wood, Pt(lb, foot), Pt(lt, capY), 0.34, 0.34, [0.48 + rnd() * 0.1, 0.43, 0.38]);
      kit.beam(M.wood, Pt(-3.6 - batter, foot + 0.2), Pt(3.6 + batter, foot + 0.2), 0.35, 0.35, [0.35, 0.33, 0.3]);
      // concrete footings in the river bed
      for (const [, lb] of posts) { const q = Pt(lb, foot); kit.box(M.conc, q.x, foot - 0.45, q.z, 0.7, 1.2, 0.7, rnd(), new THREE.Color(0.3, 0.29, 0.26)); }
      const storeys = Math.max(1, Math.round(hgt / 4));
      const levels = [];
      for (let k = 0; k <= storeys; k++) levels.push(foot + hgt * k / storeys);
      for (let k = 0; k < storeys; k++) {
        const y0 = levels[k], y1 = levels[k + 1];
        const w0 = 3.2 + batter * (1 - (y0 - foot) / hgt), w1 = 3.2 + batter * (1 - (y1 - foot) / hgt);
        kit.beam(M.wood, Pt(-w0 - 0.2, y0 + 0.3), Pt(w1 + 0.2, y1 - 0.3), 0.12, 0.25, [0.45, 0.4, 0.36]);
        kit.beam(M.wood, Pt(w0 + 0.2, y0 + 0.3), Pt(-w1 - 0.2, y1 - 0.3), 0.12, 0.25, [0.45, 0.4, 0.36]);
        if (k) kit.beam(M.wood, Pt(-w0 - 0.25, y0), Pt(w0 + 0.25, y0), 0.15, 0.28, [0.45, 0.4, 0.36]);
      }
      // longitudinal struts and sway bracing back to the previous bent
      if (prev) for (const lat of [-3.2, 3.2]) {
        for (let k = 1; k < levels.length - 1; k++) kit.beam(M.wood, prev(lat, levels[k]), Pt(lat, levels[k]), 0.15, 0.25, [0.42, 0.38, 0.34]);
        kit.beam(M.wood, prev(lat, capY - 0.2), Pt(lat, Math.max(foot + 1, capY - 4)), 0.1, 0.2, [0.42, 0.38, 0.34]);
      }
      prev = Pt;
      // iron bolts' rust streaks: the plates at the cap
      for (const [lt] of posts) { const q = Pt(lt, capY - 0.35); small.box(M.rust, q.x, q.y, q.z, 0.4, 0.3, 0.4, Math.atan2(tt.x, tt.z), [0.35, 0.25, 0.2]); }
    }
    // abutments: timber cribs where the deck meets the ground at either end
    for (const end of [0, 1]) {
      const f = rows[end ? rows.length - 1 : 0];
      const dir = end ? 1 : -1;
      for (let k = 0; k < 5; k++) {
        const y = deckY + top - 0.5 - k * 0.32;
        for (const off of [0, 1.4]) {
          const x = f.x + f.tx * dir * off, z = f.z + f.tz * dir * off;
          kit.box(M.wood, x, y, z, DW + 1.4, 0.3, 0.3, f.yaw, [0.45, 0.4, 0.36]);
        }
      }
    }
  }

  // ---- the ford: river stones, a depth marker post, and the water standing in the dip
  const fordLevel = track.at(track.fordRow)[1] + 0.35;
  const stones = await loadPropModels(['boulder_01', 'rock_09', 'namaqualand_boulder_02']);
  const put = makePlacer(world, stones, rnd);
  {
    const fr = track.fordRow;
    for (let k = 0; k < (low ? 20 : 48); k++) {
      const i = fr - 18 + Math.floor(rnd() * 36);
      const sd = rnd() < 0.5 ? -1 : 1;
      const p = H.at(i, sd * (W / 2 + 0.3 + rnd() * 6));
      put.put(rnd() < 0.5 ? 'rock_09' : 'boulder_01', p.x, p.z, rnd() * 6.3, 0.4 + rnd() * 1.3, { sink: 0.3, align: 0.6 });
    }
    // a few big ones marking the crossing
    for (const [di, lat] of [[-9, -8.5], [-6, 8.4], [5, -8.2], [9, 9]]) { const p = H.at(fr + di, lat); put.put('namaqualand_boulder_02', p.x, p.z, rnd() * 6.3, 2.0 + rnd(), { sink: 0.25, align: 0.5 }); }
    // depth post at the road edge
    const p = H.at(fr - 3, W / 2 + 0.8);
    const g = H.gy(p.x, p.z);
    const pm = new THREE.MeshStandardMaterial({ map: depthPostTexture(), roughness: 0.6 });
    pm.userData.wx = 'object';
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2, 0.16), pm);
    post.position.set(p.x, g + 1.0, p.z);
    post.rotation.set(0.04, track.frame(fr).yaw, -0.05);
    post.castShadow = true;
    group.add(post);
    // the creek's own water covers the crossing when it runs through the dip; otherwise show the standing water
    const creek = world.data.water?.creek;
    const cf = track.frame(fr);
    let near = Infinity;
    for (const q of creek?.points || []) near = Math.min(near, Math.hypot(q[0] - cf.x, q[2] - cf.z));
    if (near > 6) {
      const geo = drape(world, track, fr - 22, fr + 22, 26, 0, 26);
      const pa = geo.attributes.position, alpha = [];
      for (let v = 0; v < pa.count; v++) {
        const d = fordLevel - H.gy(pa.getX(v), pa.getZ(v));
        pa.setY(v, fordLevel);
        alpha.push(THREE.MathUtils.clamp(d / 0.25, 0, 1));
      }
      geo.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1));
      geo.computeVertexNormals();
      const wm = new THREE.MeshStandardMaterial({ color: 0x3b3122, roughness: 0.08, metalness: 0.1, transparent: true, depthWrite: false });
      wm.userData.wx = false;
      wm.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float alpha; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = alpha;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vA * 0.85;');
      };
      const wmesh = new THREE.Mesh(geo, wm);
      wmesh.renderOrder = 3;
      group.add(wmesh);
    }
  }

  // ---- trail dressing: roots across the canopy tunnel, old rail sleepers, leaning fence posts
  const rootGeos = [];
  const canopy = [track.gorge.land + 120, track.trestle[0] - 40];
  for (let i = canopy[0]; i < canopy[1]; i += low ? 70 : 34 + Math.floor(rnd() * 20)) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const sd = rnd() < 0.5 ? -1 : 1;
      const row = i + k * (1.5 + rnd() * 2);
      const pts = [];
      const reach = W / 2 + 2 - rnd() * 7;
      // the root wanders a little along the trail as it crosses (frame per row; offset it along the tangent)
      let along = 0;
      const drift = (rnd() - 0.5) * 0.5;
      for (let j = 0; j <= 10; j++) {
        const lat = sd * (W / 2 + 4 - (W / 2 + 4 + reach) * j / 10);
        along += drift + (rnd() - 0.5) * 0.25;
        const p0 = H.at(row, lat), p = { x: p0.x + p0.f.tx * along, z: p0.z + p0.f.tz * along };
        // roots arch out of the bank and run just proud of the dirt
        const lift = j < 2 ? 0.35 - j * 0.12 : 0.02 + Math.sin(j * 1.7) * 0.04;
        pts.push(V(p.x, H.gy(p.x, p.z) + lift, p.z));
      }
      const r0 = 0.1 + rnd() * 0.08;
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r0, 6);
      // taper towards the tip
      const pa = geo.attributes.position, cpts = geo.parameters.path.getSpacedPoints(24);
      for (let v = 0; v < pa.count; v++) {
        const seg = Math.floor(v / 7), c = cpts[Math.min(24, seg)];
        const tpr = 1 - seg / 24 * 0.75;
        pa.setXYZ(v, c.x + (pa.getX(v) - c.x) * tpr, c.y + (pa.getY(v) - c.y) * tpr * 0.7, c.z + (pa.getZ(v) - c.z) * tpr);
      }
      geo.computeVertexNormals();
      rootGeos.push(geo);
    }
  }
  if (rootGeos.length) {
    const rm = new THREE.Mesh(mergeGeometries(rootGeos), plain(0x4a3a2c, 0.95));
    rm.receiveShadow = true; rm.castShadow = !low;
    group.add(rm);
  }
  // old sleepers from the cane line that once ran up the valley: piles and strays beside the trail
  const sleeperRange = [[380, 1050], [track.gorge.land + 60, track.trestle[0] - 20]];
  for (const [a, b] of sleeperRange) for (let i = a; i < b; i += low ? 60 : 26 + Math.floor(rnd() * 24)) {
    const sd = rnd() < 0.5 ? -1 : 1;
    const p = H.at(i, sd * (W / 2 + 2 + rnd() * 2.5));
    const g = H.gy(p.x, p.z), yaw = p.f.yaw + (rnd() - 0.5) * 1.2;
    if (rnd() < 0.3) {
      // a stack
      for (let l = 0; l < 3; l++) for (let m2 = 0; m2 < 3 - l; m2++) {
        const o = (m2 - (2 - l) / 2) * 0.26;
        small.box(M.wood, p.x + Math.cos(yaw) * o, g + 0.08 + l * 0.15, p.z - Math.sin(yaw) * o, 0.24, 0.15, 1.8, yaw + (rnd() - 0.5) * 0.1, [0.45 + rnd() * 0.2, 0.4, 0.35]);
      }
    } else small.box(M.wood, p.x, g + 0.03, p.z, 0.24, 0.15, 1.8, yaw, [0.45 + rnd() * 0.2, 0.4, 0.35], (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.2);
  }
  // fence posts along the climb with sagging wire, on the outside of the trail
  {
    let prev = null;
    for (let i = 390; i < 1060; i += 3.2) {
      const row = Math.round(i);
      const sd = track.curv[track.wrap(row)] > 0 ? -1 : 1;
      if (prev && prev.sd !== sd) prev = null;
      const p = H.at(row, sd * (W / 2 + 2.8));
      const g = H.gy(p.x, p.z);
      if (rnd() < 0.06) { prev = null; continue; } // a post gone
      const lean = V((rnd() - 0.5) * 0.25, 1, (rnd() - 0.5) * 0.25).normalize();
      const topP = V(p.x, g, p.z).addScaledVector(lean, 1.25);
      small.beam(M.wood, V(p.x, g - 0.3, p.z), topP, 0.11, 0.11, [0.55, 0.5, 0.45]);
      if (prev) for (const f of [0.55, 0.95]) {
        const a = prev.b.clone().lerp(prev.t, f), b = V(p.x, g, p.z).lerp(topP, f);
        const mid = a.clone().lerp(b, 0.5).add(V(0, -0.08, 0));
        small.beam(M.rail, a, mid, 0.012, 0.012, [0.5, 0.45, 0.4], BOX, false);
        small.beam(M.rail, mid, b, 0.012, 0.012, [0.5, 0.45, 0.4], BOX, false);
      }
      prev = { b: V(p.x, g, p.z), t: topP, sd };
    }
  }

  kit.build(group, true);
  small.build(group, !low);
  put.build(group, !low);
  await Promise.all(texWait);

  return {
    colliders,
    update() {},
    handles: [],
    fordLevel,
  };
}

// ---------------------------------------------------------------- race events
// tree sites: rows in the canopy tunnel and on the climb, away from the gorge run-up and the trestle
const TREE_SITES = [{ near: 1480, side: 1 }, { near: 1770, side: -1 }, { near: 2010, side: 1 }, { near: 780, side: -1 }];
// mud patches: row, lateral centre, half-length along, half-width; `late` ones seep up on lap 2
const MUD = [
  { i: 560, lat: 2.2, a: 9, b: 3.2 }, { i: 905, lat: -2.0, a: 7, b: 3.5, late: true }, { i: 1560, lat: 1.5, a: 11, b: 3.4 },
  { i: 1890, lat: -2.4, a: 8, b: 3.0, late: true }, { i: 2390, lat: 1.8, a: 9, b: 3.3 },
];

function treeModel(rnd, L) {
  // a tall rainforest tree (an albizia-like spreading crown) built along +Y with its base at the origin
  const g = new THREE.Group();
  const bark = plain(0x6b5d4f, 0.95);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.5, L, 10, 8).translate(0, L / 2, 0);
  // a little bend and buttress flare at the foot
  const pa = trunkGeo.attributes.position;
  for (let v = 0; v < pa.count; v++) {
    const y = pa.getY(v), k = y / L;
    const flare = 1 + Math.max(0, 0.6 - y) * 0.9;
    pa.setXYZ(v, pa.getX(v) * flare + Math.sin(k * 3) * 0.25, y, pa.getZ(v) * flare + Math.sin(k * 2.2 + 1) * 0.18);
  }
  trunkGeo.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkGeo, bark);
  trunk.castShadow = true;
  g.add(trunk);
  const leaf = plain(0x2f5a22, 0.75);
  leaf.flatShading = true;
  const bGeos = [], fGeos = [];
  for (let k = 0; k < 6; k++) {
    const y0 = L * (0.62 + rnd() * 0.25), a = rnd() * 6.28, len = 2.5 + rnd() * 3;
    const s = V(Math.sin(k * 3) * 0.25, y0, 0), e = s.clone().add(V(Math.cos(a) * len, len * 0.55, Math.sin(a) * len));
    const bg = new THREE.CylinderGeometry(0.06, 0.14, s.distanceTo(e), 6).translate(0, s.distanceTo(e) / 2, 0);
    bg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, e.clone().sub(s).normalize()))).translate(s.x, s.y, s.z);
    bGeos.push(bg);
    for (let j = 0; j < 3; j++) {
      const fg = new THREE.IcosahedronGeometry(1.3 + rnd() * 1.0, 1);
      const fp = fg.attributes.position;
      for (let v = 0; v < fp.count; v++) fp.setXYZ(v, fp.getX(v) * (0.85 + rnd() * 0.3), fp.getY(v) * 0.55, fp.getZ(v) * (0.85 + rnd() * 0.3));
      fg.translate(e.x + (rnd() - 0.5) * 2, e.y + (rnd() - 0.3) * 0.8, e.z + (rnd() - 0.5) * 2);
      fGeos.push(fg);
    }
  }
  const br = new THREE.Mesh(mergeGeometries(bGeos), bark);
  br.castShadow = true;
  const crown = new THREE.Mesh(mergeGeometries(fGeos), leaf);
  crown.castShadow = true;
  g.add(br, crown);
  const branches = br;
  // the red marker: a band of tape round the trunk and a flag
  const red = new THREE.MeshStandardMaterial({ color: 0xd8180f, emissive: 0x900000, emissiveIntensity: 0.6, roughness: 0.5 });
  red.userData.wx = false;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.35, 12, 1, true), red);
  band.position.y = 1.5;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55).translate(0.45, 0, 0), red);
  flag.material.side = THREE.DoubleSide;
  flag.position.set(0.5, 2.4, 0);
  band.visible = flag.visible = false;
  g.add(band, flag);
  return { g, crown, branches, band, flag, red };
}

export class TrackEvents {
  constructor(hz) {
    this.hz = hz;
    const { track, world, scene } = hz;
    this.track = track;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    const rnd = mulberry(91 + (Date.now() & 0xff));
    this.rnd = rnd;
    track.obstacles = [];
    // the trestle is one lane with no barriers: the AI lines up on the middle from 200 m out (a jump entry
    // with nothing to clear does exactly that: see ai.js), and is never put back on its run-up
    this.trestleHint = { at: track.trestle[1], speed: 0, flat: 0, land: track.trestle[1], guard: -1 };
    track.jumps.push(this.trestleHint);
    // the gorge jump: track.js looks for the landing from the jump row over the gap rows, but here the jump row
    // is the lip itself (not a gap row), so it would put a truck that falls short back down mid-gorge (lip + 20)
    this.gorgeJump = track.jumps.find((j) => j.at === track.gorge.lip);
    if (this.gorgeJump) { this.gorgeLand0 = this.gorgeJump.land; this.gorgeJump.land = track.wrap(track.gorge.land + 20); }
    // the lip kicker's driving surface
    {
      const R = lipRamp(track), v = [], ix = [];
      R.forEach(({ f, y, hw }, k) => {
        v.push(f.x - f.nx * hw, y, f.z - f.nz * hw, f.x + f.nx * hw, y, f.z + f.nz * hw);
        if (k) { const a0 = (k - 1) * 2; ix.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      });
      this.lipBody = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(ix)).setFriction(1).setCollisionGroups(G_GROUND), this.lipBody);
    }
    // ford: water level at the dip, and the creek's own channel
    this.fordLevel = track.at(track.fordRow)[1] + 0.35;
    this.fordC = track.frame(track.fordRow);
    this.creek = world.data.water?.creek;
    // trees
    this.trees = [];
    const W = track.width;
    const sites = hz.quality?.aiLod ? TREE_SITES.slice(0, 3) : TREE_SITES;
    for (const s of sites) {
      // the straightest row near the planned spot
      let best = s.near, bc = Infinity;
      for (let i = s.near - 40; i <= s.near + 40; i++) { const c = Math.abs(track.curv[track.wrap(i)]); if (c < bc) { bc = c; best = i; } }
      const f = track.frame(best);
      const sd = s.side;
      const baseLat = sd * (W / 2 + 2.2);
      const bx = f.x + f.nx * baseLat, bz = f.z + f.nz * baseLat;
      const by = world.heightAt(bx, bz) - 0.2;
      // fall across the road, a little skewed so it lies on the diagonal
      const skew = (rnd() - 0.5) * 0.5;
      const dir = V(-f.nx * sd, 0, -f.nz * sd).applyAxisAngle(UP, skew).normalize();
      const L = 15 + rnd() * 3;
      const m = treeModel(rnd, L);
      m.g.position.set(bx, by, bz);
      // standing with a slight lean towards the road: the one that is going to come down
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      const t = { row: best, f, sd, dir, axis, L, m, theta: 0.06, w: 0, state: 'stand', lap: TEST === 'trees' ? 0 : 1 + Math.floor(rnd() * 2), base: V(bx, by, bz), body: null, bounced: 0 };
      m.g.quaternion.setFromAxisAngle(axis, t.theta);
      this.group.add(m.g);
      this.trees.push(t);
    }
    // a warning stripe on the road under each tree's fall line, shown with its marker
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    stripeMat.userData.wx = false;
    this.stripeMat = stripeMat;
    for (const t of this.trees) {
      const pts = [];
      const geo = new THREE.PlaneGeometry(1.6, t.L * 0.8, 1, 10).rotateX(-Math.PI / 2).translate(0, 0, -t.L * 0.4);
      const pa = geo.attributes.position;
      const yaw = Math.atan2(t.dir.x, t.dir.z) + Math.PI;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (let v = 0; v < pa.count; v++) {
        const lx = pa.getX(v), lz = pa.getZ(v);
        const x = t.base.x + lx * c + lz * s, z = t.base.z - lx * s + lz * c;
        pa.setXYZ(v, x, world.heightAt(x, z) + 0.2, z);
        pts.push(x);
      }
      const stripe = new THREE.Mesh(geo, stripeMat);
      stripe.renderOrder = 4;
      stripe.visible = false;
      this.group.add(stripe);
      t.stripe = stripe;
    }
    // mud
    this.mud = MUD.map((p) => ({ ...p, k: p.late ? 0 : 1 }));
    // grip along the line (surface, and the mud patches once they are out) for the AI's corner speeds
    this.gripRow = new Float32Array(track.n);
    for (let i = 0; i < track.n; i++) this.gripRow[i] = surfaceAt(track, i).grip;
    for (const p of this.mud) for (let k = -p.a; k <= p.a; k++) { const r = track.wrap(p.i + k); this.gripRow[r] = Math.min(this.gripRow[r], 0.7); }
    // and the bend onto the trestle, where running a metre wide drops a truck off the deck: take it with margin
    for (let k = -60; k <= 8; k++) { const r = track.wrap(track.trestle[0] + k); this.gripRow[r] = Math.min(this.gripRow[r], 0.66); }
    // the hairpin through the ford, out over the creek, and the bend the gorge landing runs straight into: the
    // trucks arrive there fast and a slide puts them up the cut bank and over
    for (let k = -45; k <= 25; k++) { const r = track.wrap(track.fordRow + k); this.gripRow[r] = Math.min(this.gripRow[r], 0.45); }
    for (let k = 20; k <= 140; k++) { const r = track.wrap(track.gorge.land + k); this.gripRow[r] = Math.min(this.gripRow[r], 0.78); }
    this.mudMeshes = this.mud.map((p) => this.mudDecal(p));
    this.log = { lip: [], land: [], miss: [], fell: [], ford: 0 };
    globalThis.__wailele = this.log;
    this.started = false;
  }

  mudDecal(p) {
    const { track, world } = this;
    const pos = [], uv = [], idx = [];
    const n = Math.ceil(p.a * 2), m = 10;
    for (let k = 0; k <= n; k++) {
      const f = track.frame(p.i - p.a + k);
      for (let j = 0; j <= m; j++) {
        const l = p.lat + (j / m - 0.5) * p.b * 2.4;
        const x = f.x + f.nx * l, z = f.z + f.nz * l;
        pos.push(x, world.heightAt(x, z) + 0.17, z);
        uv.push(j / m * 2 - 1, k / n * 2 - 1);
      }
    }
    for (let k = 0; k < n; k++) for (let j = 0; j < m; j++) { const a = k * (m + 1) + j, b = a + 1, c = a + m + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c1c12, roughness: 0.12, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    mat.userData.wx = 'road';
    const u = { tNoise: { value: this.hz.M.noise }, uK: { value: p.k }, uSeed: { value: p.i * 0.013 } };
    p.u = u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vQ; varying vec3 vWp;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvQ = uv; vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vQ; varying vec3 vWp; uniform sampler2D tNoise; uniform float uK, uSeed;')
        .replace('#include <map_fragment>', `#include <map_fragment>
float nz = texture(tNoise, vWp.xz / 7.0 + uSeed).r * 0.6 + texture(tNoise, vWp.xz / 1.9).g * 0.4;
float r = length(vQ) + (nz - 0.5) * 0.7;
float edge = 1.0 - smoothstep(uK * 0.85 - 0.2, uK * 0.85, r);
// standing water in the deepest part, churned tyre tracks in the rest
float wet = smoothstep(0.55, 0.75, nz) * edge;
diffuseColor.rgb = mix(vec3(0.17, 0.1, 0.06), vec3(0.08, 0.06, 0.045), wet);
diffuseColor.a = edge * 0.92;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.45, 0.05, wet);');
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  // how far below the ford's (or the creek's) water the ground is at x, z
  waterDepth(x, z) {
    const g = this.world.heightAt(x, z);
    let lv = -Infinity;
    if (Math.hypot(x - this.fordC.x, z - this.fordC.z) < 26) lv = this.fordLevel;
    const c = this.creek;
    if (c) {
      let bd = Infinity, bi = 0;
      for (let k = 0; k < c.points.length; k++) { const q = c.points[k]; const d = (q[0] - x) ** 2 + (q[2] - z) ** 2; if (d < bd) { bd = d; bi = k; } }
      if (Math.sqrt(bd) < c.width[bi] / 2 + 1) lv = Math.max(lv, c.points[bi][1] + 0.2);
    }
    return lv - g;
  }

  pre(dt, race) {
    const { track } = this;
    if (!this.started) {
      this.started = true;
      if (TEST === 'fall') {
        // slow, straight at the lip: the truck drops into the gorge
        const st = race.player, f = track.frame(track.gorge.lip - 40);
        race.place(st, track.wrap(track.gorge.lip - 40), f.x, f.z, f.yaw);
        st.ai = null;
      }
    }
    if (TEST === 'fall' && race.clock > 0) {
      // roll the player off the lip at 12 m/s, far too slow to clear it
      const st = race.player, d = track.ahead(st.i, track.gorge.lip);
      if (d >= 0 && d < 60) { const f = track.frame(st.i), v = st.v.body.linvel(); st.v.body.setLinvel({ x: f.tx * 12, y: v.y, z: f.tz * 12 }, true); }
    }
    // the leader's lap decides when the late mud seeps up and when the trees come down
    let lead = null;
    for (const st of race.cars) if (!st.finished && (!lead || st.dist > lead.dist)) lead = st;
    const lap = lead ? lead.lap : 0;
    for (const p of this.mud) {
      const target = !p.late || lap >= 1 ? 1 : 0;
      p.k = Math.min(target, p.k + dt / 12);
      p.u.uK.value = p.k;
    }
    for (const st of race.cars) {
      const v = st.v, pos = v.group.position;
      // slick mud: patches cover part of the road
      for (const p of this.mud) {
        if (p.k < 0.2) continue;
        const da = track.ahead(p.i, st.i);
        const al = da > track.n / 2 ? da - track.n : da;
        if (Math.abs(al) > p.a) continue;
        const f = track.frame(st.i);
        const lat = (pos.x - f.x) * f.nx + (pos.z - f.z) * f.nz;
        const r = Math.hypot(al / p.a, (lat - p.lat) / (p.b * 1.2));
        if (r < p.k * 0.85) { v.surfGrip *= 0.6; v.surfDrag += 450; v.surfName = 'slick mud'; }
      }
      // the ford: deep water drags at the wheels, more the deeper it is
      if (Math.abs(track.ahead(track.fordRow, st.i) > track.n / 2 ? track.ahead(track.fordRow, st.i) - track.n : track.ahead(track.fordRow, st.i)) < 40 || this.creek) {
        const d = this.waterDepth(pos.x, pos.z);
        if (d > 0.02) {
          const k = Math.min(1.4, d / 0.45);
          v.surfDrag += 2600 * k;
          v.surfGrip *= 1 - 0.12 * Math.min(1, k);
          v.surfName = 'water';
          if (st.isPlayer) this.log.ford = Math.max(this.log.ford, +d.toFixed(2));
        }
      }
    }
    // the AI plans its corner speeds on dry grip: on the mud at the ford and the slick patches it would arrive
    // too fast and slide off up the bank, so brake for the grip that is really there
    for (const st of race.cars) {
      if (!st.ai || st.finished || st.v.totaled || !st.v.contacts) continue;
      // never off the gas on the run-up to the gorge
      const dl = track.ahead(st.i, track.gorge.lip);
      if (dl >= 0 && dl < 230) continue;
      const spd = st.v.speed();
      if (spd < 8) continue;
      const grip = race.diff.grip * st.ai.skill;
      let target = Infinity;
      for (let j = 3; j < 100; j += 3) {
        const r = track.wrap(st.i + j), sg = this.gripRow[r];
        if (sg > 0.86) continue;
        const vmax = Math.sqrt(grip * sg / Math.max(Math.abs(track.curv[r]), 1e-4));
        target = Math.min(target, Math.sqrt(vmax * vmax + 2 * 4.5 * j));
      }
      if (spd > target + 0.5) Object.assign(st.v.input, { throttle: 0, boost: 0, brake: THREE.MathUtils.clamp((spd - target) / 4, 0.3, 1) });
    }
    // trees
    for (const t of this.trees) this.stepTree(t, dt, race, lead, lap);
    // logs on the road: obstacles for the AI, from where the bodies lie now
    track.obstacles = [];
    for (const t of this.trees) {
      if (!t.body) continue;
      const p = t.body.translation(), r = t.body.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const ax = V(0, 1, 0).applyQuaternion(q);
      const near = track.nearest(p, t.row);
      const f = track.frame(near.i);
      let lo = Infinity, hi = -Infinity;
      for (const s of [-1, 1]) {
        const e = V(p.x, p.y, p.z).addScaledVector(ax, s * t.halfLen);
        const lat = (e.x - f.x) * f.nx + (e.z - f.z) * f.nz;
        lo = Math.min(lo, lat); hi = Math.max(hi, lat);
      }
      // pushed clear of the road: no longer in the way
      if (lo > track.width / 2 + 1 || hi < -track.width / 2 - 1) continue;
      track.obstacles.push({ i: near.i, lat: (lo + hi) / 2, r: (hi - lo) / 2 + 0.5 });
    }
  }

  stepTree(t, dt, race, lead, lap) {
    const { track } = this;
    if (t.state === 'stand') {
      // the marker goes up while the leader on the falling lap is still a good way off
      if (lead && lap >= t.lap && race.clock > 0) {
        const d = track.ahead(lead.i, t.row);
        if (d > 0 && d < 420) { t.state = 'marked'; t.mt = 0; t.m.band.visible = t.m.flag.visible = true; t.stripe.visible = true; }
      }
      return;
    }
    if (t.state === 'marked') {
      t.mt += dt;
      const pulse = 0.5 + 0.5 * Math.sin(t.mt * 7);
      this.stripeMat.opacity = 0.25 + pulse * 0.35;
      t.m.red.emissiveIntensity = 0.3 + pulse * 1.2;
      t.m.flag.rotation.y = Math.sin(t.mt * 5) * 0.4;
      // it comes down when the first truck gets close (a few seconds' warning at racing speed), or anyway
      let closest = Infinity;
      for (const st of race.cars) { const d = track.ahead(st.i, t.row); if (d >= 0 && d < closest) closest = d; }
      if ((closest < 95 && t.mt > 2.5) || t.mt > 14) { t.state = 'fall'; t.w = 0.05; }
      return;
    }
    if (t.state === 'fall') {
      // a rod pivoting on its foot: theta'' = 3g / (2L) sin(theta)
      t.w += 1.5 * 9.81 / t.L * Math.sin(t.theta) * dt;
      t.theta += t.w * dt;
      // where the trunk meets the ground
      const tip = t.base.clone().addScaledVector(t.dir, t.L * 0.75);
      const gTip = this.world.heightAt(tip.x, tip.z);
      const thLand = Math.PI / 2 - Math.asin(THREE.MathUtils.clamp((gTip + 0.45 - t.base.y) / (t.L * 0.75), -0.5, 0.5));
      if (t.theta >= thLand) {
        t.theta = thLand;
        if (t.bounced < 1 && t.w > 0.6) { t.w = -t.w * 0.18; t.bounced++; this.crushCheck(t, race); }
        else { t.w = 0; this.settle(t); }
      }
      t.m.g.quaternion.setFromAxisAngle(t.axis, t.theta);
      t.stripe.visible = this.trees.some((x) => x.state === 'marked');
      return;
    }
    if (t.state === 'down' && t.body) {
      // the log follows its physics body (trucks can shove it)
      const p = t.body.translation(), r = t.body.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      t.m.g.quaternion.copy(q);
      const ax = V(0, 1, 0).applyQuaternion(q);
      t.m.g.position.set(p.x, p.y, p.z).addScaledVector(ax, -t.halfLen - t.off);
    }
  }

  // trucks under the trunk when it hits the road take the blow
  crushCheck(t, race) {
    const a = t.base, b = t.base.clone().addScaledVector(t.dir, t.L * 0.8);
    const ab = b.clone().sub(a);
    for (const st of race.cars) {
      const p = st.v.group.position;
      const k = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      const c = a.clone().addScaledVector(ab, k);
      if (Math.hypot(p.x - c.x, p.z - c.z) < 1.6) {
        st.v.damage?.hit(V(0, -1, 0), 7, p.clone());
        st.v.body.applyImpulse({ x: 0, y: -4000, z: 0 }, true);
      }
    }
    this.log.fell.push(`${t.row}@${race.t.toFixed(0)}`);
  }

  settle(t) {
    t.state = 'down';
    this.stripeMat.opacity = 0;
    t.stripe.visible = false;
    t.m.band.visible = t.m.flag.visible = false;
    // the crown is crushed flat where it hit: squash it along the direction that now points down (in the tree's
    // own frame that is the way it fell), about the crown's middle
    // (turning about axis = up x dir takes up to dir and dir to down: so down, in the tree's frame, is dir)
    const dl = t.dir.clone();
    const k = 0.4 - 1, cc = new THREE.Vector3(0, t.L * 0.8, 0);
    const S = new THREE.Matrix4().set(
      1 + k * dl.x * dl.x, k * dl.x * dl.y, k * dl.x * dl.z, 0,
      k * dl.y * dl.x, 1 + k * dl.y * dl.y, k * dl.y * dl.z, 0,
      k * dl.z * dl.x, k * dl.z * dl.y, 1 + k * dl.z * dl.z, 0, 0, 0, 0, 1);
    const crush = new THREE.Matrix4().makeTranslation(cc.x, cc.y, cc.z).multiply(S).multiply(new THREE.Matrix4().makeTranslation(-cc.x, -cc.y, -cc.z));
    for (const o of [t.m.crown, t.m.branches]) { o.matrixAutoUpdate = false; o.matrix.copy(crush); }
    const { phys } = this.hz;
    // the trunk's lower part as a heavy capsule trucks can bump over, shove or go round; the thin top and the
    // crown don't stop anything
    const q = t.m.g.quaternion;
    const ax = V(0, 1, 0).applyQuaternion(q);
    t.off = 0.6;
    t.halfLen = t.L * 0.27;
    const c = t.base.clone().addScaledVector(ax, t.off + t.halfLen);
    const body = phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(c.x, c.y, c.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(1.2).setAngularDamping(2.0).setCcdEnabled(true));
    phys.createCollider(RAPIER.ColliderDesc.capsule(t.halfLen, 0.36).setMass(1100).setFriction(0.9).setRestitution(0.05).setCollisionGroups(G_GROUND), body);
    t.body = body;
  }

  post(dt, race) {
    const { track } = this;
    const { lip, land } = track.gorge;
    // a truck that dropped into the gorge goes straight back on the landing side: left to race.js it can count
    // the gorge floor by the landing face as its last safe spot and be put back down only to roll off the edge
    const jump = this.gorgeJump;
    for (const st of race.cars) {
      if (st.finished || st.v.totaled || !jump) continue;
      const p = st.v.body.translation();
      const near = track.nearest(p, st.i);
      if (track.ahead(lip, near.i) > land - lip + 8 || p.y > track.at(near.i)[1] - 4) continue;
      st.lastSafe = jump.land;
      this.log.miss.push(`${st.v.name[0]}${(st.wlLip ?? 0).toFixed(0)}`);
      race.respawn(st, 'G');
    }
    // gorge stats for testing: speed at the lip, row where each truck first lands with all wheels down
    for (const st of race.cars) {
      const prev = st.wlPrev ?? st.i;
      if (!st.wlAir && track.ahead(prev, lip) > 0 && track.ahead(prev, lip) < 30 && track.ahead(lip, st.i) >= 0 && track.ahead(lip, st.i) < 30) { st.wlLip = st.v.speed(); this.log.lip.push(+st.wlLip.toFixed(1)); st.wlAir = true; }
      if (st.wlAir && st.v.contacts >= 3) { st.wlAir = false; this.log.land.push(st.i); }
      st.wlPrev = st.i;
    }
  }

  dispose() {
    const { track, hz } = this;
    const j = track.jumps.indexOf(this.trestleHint);
    if (j >= 0) track.jumps.splice(j, 1);
    if (this.gorgeJump) this.gorgeJump.land = this.gorgeLand0;
    track.obstacles = [];
    for (const t of this.trees) if (t.body) hz.phys.removeRigidBody(t.body);
    hz.phys.removeRigidBody(this.lipBody);
    hz.scene.remove(this.group);
  }
}
