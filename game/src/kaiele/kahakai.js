import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry, nearTrack } from '../world.js';
import { loadPropModels, makePlacer } from '../props.js';
import { pbr, plain, M, frameAt, box, cyl, tri, quad, Merge, rockGeo, hex, mul, grime, signMaterial, Crowd, Flags,
  driftwoodModel, fishCrateModel, floatModel, gantry, gridMarks, kickFrame, addKicker } from './kit.js';

// Kahakai ʻEleʻele, round 1: the black-sand beach circuit. Set pieces: the fishing village of tin-roof shacks
// along the harbour road (from world.data.buildings), canoes, nets and drying racks, the start gantry and grid,
// the old timber boat-ramp jump over the tidal channel, the black lava-rock point with its tide pools, and
// driftwood, fish crates and marker posts trackside (knocked flying when hit).
// Race events: the surf washes driftwood up onto the beach road in front of the pack.

const PASTELS = ['#9fd3c7', '#f2d39b', '#e9a99a', '#b9d4ea', '#f3efe2', '#c8e0a8', '#e7c3d8', '#f6c88f', '#a9c7c0', '#ddd4b8'].map(hex);
const TRIMS = ['#f4f1ea', '#f4f1ea', '#2f5d62', '#8a3b2e', '#33506e'].map(hex);
const ROOF_PAINT = ['#a8452f', '#4f7a5a', '#5a7f9a', '#d9d4c9', '#8e3b32', '#6b6f73'].map(hex);
const CANOE = ['#c43c2c', '#1d5d7a', '#f1ece0', '#2c6e49', '#e7b43a'].map(hex);

function materials(quality) {
  const aniso = quality.aiLod ? 4 : 8;
  const m = {
    wood: pbr('ext/v_wood', { aniso }),
    boards: pbr('kaiele/coast/boards', { aniso }),
    tin: pbr('kaiele/coast/tin', { aniso, metal: 1 }),
    rtin: pbr('kaiele/coast/rtin', { aniso, metal: 1 }),
    pmetal: pbr('kaiele/coast/pmetal', { aniso, metal: 1 }),
    basalt: pbr('kaiele/coast/basalt', { aniso, normal: 1.4 }),
    concrete: pbr('ext/v_concrete', { aniso }),
    dark: plain(0x0c0b0a, { rough: 0.6 }),
    paint: plain(0xffffff, { rough: 0.7 }),
    plastic: plain(0xffffff, { rough: 0.45 }),
    drift: plain(0xffffff, { rough: 0.95 }),
    cloth: plain(0xffffff, { rough: 0.9, side: THREE.DoubleSide }),
    glass: plain(0x1a2328, { rough: 0.15, metal: 0.3 }),
  };
  return m;
}

// ------------------------------------------------------------------------------------------- shacks
// One fishing shack: posts or block piers, a timber box in faded paint with white trim, louvred windows,
// a lanai (porch) on the road side where there is room, and a corrugated roof (painted or rusting).
function shack(B, b, rnd, front, isStore) {
  const W = b.w, D = b.d;
  const hS = isStore ? 0.35 : 0.45 + rnd() * 0.7; // floor height above the levelled ground
  const wallH = isStore ? 3.2 : 2.5 + rnd() * 0.3;
  const F = frameAt(b.x, b.y, b.z, b.yaw);
  const col = PASTELS[Math.floor(rnd() * PASTELS.length)].map((c) => c * (0.85 + rnd() * 0.15));
  const trim = TRIMS[Math.floor(rnd() * TRIMS.length)];
  const y0 = b.y;
  // piers: timber posts on most, stacked concrete blocks on some
  const blocks = rnd() < 0.35;
  const nx = Math.max(2, Math.round(W / 2.4) + 1), nz = Math.max(2, Math.round(D / 2.4) + 1);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    if (i > 0 && i < nx - 1 && k > 0 && k < nz - 1) continue;
    const lx = -W / 2 + 0.2 + i * (W - 0.4) / (nx - 1), lz = -D / 2 + 0.2 + k * (D - 0.4) / (nz - 1);
    if (blocks) B.add('concrete', box(0.4, hS + 0.3, 0.4, 1), F.m(lx, (hS - 0.3) / 2, lz), [0.62, 0.6, 0.57]);
    else B.add('wood', box(0.16, hS + 0.4, 0.16, 1), F.m(lx, (hS - 0.4) / 2, lz), [0.55, 0.5, 0.45]);
  }
  // floor and walls
  B.add('wood', box(W + 0.1, 0.16, D + 0.1, 2), F.m(0, hS, 0), [0.6, 0.55, 0.5]);
  B.add('boards', box(W, wallH, D, 2.2), F.m(0, hS + wallH / 2 + 0.08, 0), grime(col, y0 + hS, 0.35, 1.0));
  // corner boards and a fascia under the eaves
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('paint', box(0.14, wallH, 0.14), F.m(sx * W / 2, hS + wallH / 2 + 0.08, sz * D / 2), trim);
  // windows: jalousie louvres (dark glass with pale slats), a frame; a door on the front
  const win = (lx, lz, face, door = false) => {
    const m = F.m(lx, 0, lz, face);
    const at = (x, y, z) => m.clone().multiply(M(x, y, z));
    const ww = door ? 0.95 : 0.9, wh = door ? 2.05 : 1.05, wy = door ? hS + 0.08 + wh / 2 : hS + 1.55;
    B.add('dark', box(ww, wh, 0.04), at(0, wy, 0.02), [1, 1, 1]);
    B.add('paint', box(ww + 0.2, 0.1, 0.07), at(0, wy + wh / 2 + 0.05, 0.03), trim);
    B.add('paint', box(0.08, wh, 0.07), at(-ww / 2 - 0.04, wy, 0.03), trim);
    B.add('paint', box(0.08, wh, 0.07), at(ww / 2 + 0.04, wy, 0.03), trim);
    if (door) { B.add('wood', box(ww - 0.06, wh - 0.05, 0.05), at(0, wy - 0.02, 0.04), mul(trim, 0.8)); return; }
    B.add('paint', box(ww + 0.25, 0.07, 0.12), at(0, wy - wh / 2 - 0.04, 0.05), trim);
    for (let s = 0; s < 6; s++) B.add('glass', box(ww - 0.04, 0.035, 0.12), at(0, wy - wh / 2 + 0.12 + s * 0.16, 0.06, 0, -0.5), [0.75, 0.82, 0.86]);
    // some have a hinged board shutter propped open over the window
    if (rnd() < 0.3) B.add('wood', box(ww + 0.15, wh * 0.9, 0.04), at(0, wy + wh / 2 + 0.05, 0.3).multiply(M(0, 0, 0, 0, -1.0)).multiply(M(0, -wh * 0.45, 0)), mul(col, 0.9));
  };
  const nWin = Math.max(1, Math.floor((W - 1.2) / 2.4));
  for (let k = 0; k < nWin + 1; k++) {
    const lx = -W / 2 + (k + 0.5) * W / (nWin + 1);
    win(lx, D / 2, 0, k === Math.floor((nWin + 1) / 2));
    if (k < nWin && rnd() < 0.8) win(-W / 2 + (k + 0.5) * W / nWin, -D / 2, Math.PI);
  }
  win(W / 2, 0, Math.PI / 2); if (rnd() < 0.6) win(-W / 2, (rnd() - 0.5) * D * 0.4, -Math.PI / 2);
  // roof: gable across the short side, or a skillion sloping to the back
  const roofKey = rnd() < 0.55 ? 'rtin' : 'tin';
  const roofCol = roofKey === 'rtin' ? [0.95, 0.93, 0.9] : ROOF_PAINT[Math.floor(rnd() * ROOF_PAINT.length)];
  const top = hS + wallH + 0.08, o = 0.45;
  const skillion = !isStore && rnd() < 0.3;
  if (skillion) {
    const rise = 0.7;
    const len = Math.hypot(D + 2 * o, rise);
    B.add(roofKey, box(W + 2 * o, 0.05, len, 1.6), F.m(0, top + rise / 2, 0, 0, Math.atan2(rise, D + 2 * o)), roofCol);
    // fill the sides under the slope
    const hb = rise * (0.5 + 0.5 * D / (D + 2 * o)), hf = rise * (0.5 - 0.5 * D / (D + 2 * o));
    for (const sx of [-1, 1]) B.add('boards', quad([sx * W / 2, 0, D / 2], [sx * W / 2, 0, -D / 2], [sx * W / 2, hb, -D / 2], [sx * W / 2, hf, D / 2], 2.2), F.m(0, top, 0), col);
  } else {
    const rise = D * 0.3;
    const half = D / 2 + o;
    const len = Math.hypot(half, rise);
    const a = Math.atan2(rise, half);
    for (const sz of [-1, 1]) B.add(roofKey, box(W + 2 * o, 0.05, len, 1.6), F.m(0, top + rise / 2, sz * half / 2, 0, sz * a), roofCol);
    B.add(roofKey, box(W + 2 * o + 0.05, 0.12, 0.3, 1), F.m(0, top + rise + 0.03, 0), mul(roofCol, 0.8));
    for (const sx of [-1, 1]) B.add('boards', tri([sx * W / 2, 0, -D / 2], [sx * W / 2, 0, D / 2], [sx * W / 2, rise - 0.05, 0], 2.2), F.m(0, top, 0), col);
    B.add('dark', box(W + 2 * o - 0.1, 0.02, D + 2 * o - 0.1), F.m(0, top + 0.02, 0), [1, 1, 1]); // shadowy soffit
  }
  // the store: a false front above the porch carries the sign
  let ext = 0;
  if (isStore) {
    B.add('boards', box(W + 0.4, 1.5, 0.15, 2.2), F.m(0, top + 0.6, D / 2 + 0.08), col);
    B.add('paint', box(W + 0.6, 0.12, 0.25), F.m(0, top + 1.4, D / 2 + 0.1), trim);
  }
  // lanai on the road side
  const lanai = Math.min(2.6, front - 1.6);
  if (lanai > 1.2) {
    ext = lanai;
    const lw = isStore ? W : W * (0.6 + rnd() * 0.4);
    const lx = isStore ? 0 : (W - lw) / 2 * (rnd() < 0.5 ? -1 : 1);
    const zc = D / 2 + lanai / 2;
    B.add('wood', box(lw, 0.12, lanai, 2), F.m(lx, hS - 0.02, zc), [0.62, 0.56, 0.5]);
    const nPost = Math.max(2, Math.round(lw / 2.2) + 1);
    const ph = wallH - 0.25;
    for (let k = 0; k < nPost; k++) {
      const px = lx - lw / 2 + 0.1 + k * (lw - 0.2) / (nPost - 1);
      B.add('paint', box(0.13, ph + hS, 0.13), F.m(px, (ph + hS) / 2 - 0.05, D / 2 + lanai - 0.1), trim);
      if (!isStore && k < nPost - 1) {
        // rail with a few balusters
        const sx = px + (lw - 0.2) / (nPost - 1) / 2;
        B.add('paint', box((lw - 0.2) / (nPost - 1), 0.07, 0.07), F.m(sx, hS + 0.9, D / 2 + lanai - 0.1), trim);
        for (let q = -2; q <= 2; q++) B.add('paint', box(0.04, 0.85, 0.04), F.m(sx + q * 0.32, hS + 0.47, D / 2 + lanai - 0.1), trim);
      }
    }
    // steps down from the porch
    const steps = Math.ceil(hS / 0.22);
    for (let s = 0; s < steps; s++) B.add('wood', box(1.1, 0.06, 0.3), F.m(lx, hS - 0.2 - s * 0.22, D / 2 + lanai + 0.15 + s * 0.28), [0.6, 0.55, 0.5]);
    // lean-to roof off the wall top
    const drop = 0.4, len = Math.hypot(lanai + 0.3, drop);
    B.add(roofKey, box(lw + 0.4, 0.05, len, 1.6), F.m(lx, top - drop / 2 - 0.05, D / 2 + (lanai + 0.3) / 2, 0, Math.atan2(drop, lanai + 0.3)), roofCol);
    // porch clutter: a bench, a cooler
    if (!isStore && rnd() < 0.6) B.add('wood', box(1.4, 0.1, 0.4), F.m(lx + lw * 0.2, hS + 0.45, D / 2 + 0.35), [0.5, 0.42, 0.34]);
    if (rnd() < 0.5) B.add('plastic', box(0.7, 0.45, 0.42), F.m(lx - lw * 0.25, hS + 0.27, D / 2 + 0.4), hex(['#d8443a', '#2f6fb3', '#f2f2f2'][Math.floor(rnd() * 3)]));
  }
  // rain tank on a timber stand at one side, gutter pipe down to it
  if (!isStore && rnd() < 0.45) {
    const sx = rnd() < 0.5 ? -1 : 1;
    const tx = sx * (W / 2 + 0.95), tz = -D / 4;
    const tankKey = rnd() < 0.6 ? 'pmetal' : 'plastic';
    const tc = tankKey === 'pmetal' ? [0.9, 0.95, 0.9] : hex(['#2a2a2a', '#3b5e48', '#7d8a8f'][Math.floor(rnd() * 3)]);
    for (const [px, pz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) B.add('wood', box(0.12, 1.1, 0.12), F.m(tx + px, 0.45, tz + pz), [0.5, 0.45, 0.4]);
    B.add('wood', box(1.5, 0.1, 1.5), F.m(tx, 1.0, tz), [0.5, 0.45, 0.4]);
    B.add(tankKey, cyl(0.75, 0.75, 1.6, 14, 1.5), F.m(tx, 1.85, tz), tc);
    B.add('dark', cyl(0.05, 0.05, top - 2.5, 6), F.m(sx * (W / 2 + 0.25), 2.5 + (top - 2.5) / 2, tz), [0.6, 0.6, 0.6]);
  }
  // washing line out the back
  if (!isStore && rnd() < 0.4) {
    const bz = -D / 2 - 2.5, L = Math.min(W, 6);
    for (const sx of [-L / 2, L / 2]) {
      B.add('wood', box(0.08, 2.1, 0.08), F.m(sx, 1.05, bz), [0.55, 0.5, 0.45]);
      B.add('wood', box(0.06, 0.06, 0.6), F.m(sx, 2.05, bz), [0.55, 0.5, 0.45]);
    }
    for (const dz of [-0.25, 0.25]) B.add('dark', box(L, 0.012, 0.012), F.m(0, 2.0, bz + dz), [0.8, 0.8, 0.8]);
    let x = -L / 2 + 0.4;
    while (x < L / 2 - 0.5) {
      const w = 0.4 + rnd() * 0.6, h = 0.45 + rnd() * 0.5;
      const c = hex(['#f4f1ea', '#d8443a', '#2f6fb3', '#f2c230', '#9fd3c7', '#e9a99a', '#3a3a3a'][Math.floor(rnd() * 7)]);
      B.add('cloth', new THREE.PlaneGeometry(w, h), F.m(x + w / 2, 2.0 - h / 2, bz + (rnd() < 0.5 ? -0.25 : 0.25), 0, 0, (rnd() - 0.5) * 0.08), c);
      x += w + 0.15 + rnd() * 0.3;
    }
  }
  const H = top + D * 0.3 + 0.2;
  // collider: the box over walls and porch (porch posts are part of it)
  const c = new THREE.Vector3(0, 0, ext / 2).applyMatrix4(F.base);
  return { x: c.x, y: y0 - 0.3, z: c.z, w: W + 0.2, d: D + ext + 0.2, h: H + 0.3, yaw: b.yaw, top, front: F.p(0, 0, D / 2 + ext), back: F.p(0, 0, -D / 2), F, W, D };
}

// ------------------------------------------------------------------------------------------- village dressing
// outrigger canoe (waʻa): hull with raised ends, the ama float to one side on two ʻiako booms
function canoe(B, world, x, z, yaw, rnd) {
  const y = world.heightAt(x, z);
  const F = frameAt(x, y, z, yaw);
  const L = 5.5 + rnd() * 2.5;
  const c = CANOE[Math.floor(rnd() * CANOE.length)];
  const hull = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); // lower half shell
  B.add('paint', hull, F.m(0, 0.5, 0, 0, 0, 0, 0.36, 0.5, L / 2), grime(c, y, 0.3, 0.4));
  B.add('wood', box(0.62, 0.1, L * 0.8, 1), F.m(0, 0.52, 0), [0.45, 0.35, 0.27]); // gunwale deck
  for (const e of [-1, 1]) B.add('paint', box(0.3, 0.25, 0.7), F.m(0, 0.6, e * L * 0.42, 0, e * 0.4), mul(c, 0.85));
  const side = rnd() < 0.5 ? -1 : 1;
  for (const bz of [-L * 0.2, L * 0.22]) B.add('wood', cyl(0.05, 0.05, 2.6, 6), F.m(side * 1.25, 0.62, bz, 0, 0, Math.PI / 2 + side * 0.1), [0.55, 0.45, 0.35]);
  B.add('wood', cyl(0.14, 0.12, L * 0.62, 8), F.m(side * 2.4, 0.2, 0, 0, Math.PI / 2), [0.7, 0.66, 0.6]);
  // a paddle left across the hull
  if (rnd() < 0.7) { B.add('wood', cyl(0.025, 0.025, 1.4, 5), F.m(0.2, 0.62, 0.4, 0.3, Math.PI / 2), [0.5, 0.38, 0.28]); B.add('wood', box(0.2, 0.02, 0.5), F.m(0.38, 0.62, 1.1, 0.3), [0.5, 0.38, 0.28]); }
}

function surfRack(B, world, x, z, yaw, rnd) {
  const y = world.heightAt(x, z);
  const F = frameAt(x, y, z, yaw);
  for (const sx of [-1.4, 1.4]) {
    B.add('wood', box(0.1, 1.8, 0.1), F.m(sx, 0.9, -0.5, 0, 0.25), [0.5, 0.42, 0.34]);
    B.add('wood', box(0.1, 1.8, 0.1), F.m(sx, 0.9, 0.5, 0, -0.25), [0.5, 0.42, 0.34]);
  }
  for (const yy of [0.6, 1.25]) B.add('wood', box(3.0, 0.08, 0.08), F.m(0, yy, 0), [0.5, 0.42, 0.34]);
  const board = new THREE.SphereGeometry(1, 10, 6);
  const n = 4 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    const c = hex(['#f4f1ea', '#5fc3d8', '#f2c230', '#e86a4f', '#9fd3c7', '#f08fb0'][Math.floor(rnd() * 6)]);
    const L = 2.0 + rnd() * 0.8;
    B.add('plastic', board, F.m(-1.2 + k * 2.4 / (n - 1), L / 2 * 0.98, 0.3, 0, -0.18, 0, 0.27, L / 2, 0.035), c);
  }
}

function dryingRack(B, world, x, z, yaw, rnd) {
  const y = world.heightAt(x, z);
  const F = frameAt(x, y, z, yaw);
  const L = 3 + rnd() * 2;
  for (const sx of [-L / 2, L / 2]) for (const sz of [-0.5, 0.5]) B.add('wood', box(0.08, 1.7, 0.08), F.m(sx, 0.85, sz), [0.5, 0.44, 0.38]);
  for (const sz of [-0.5, 0.5]) B.add('wood', cyl(0.03, 0.03, L, 5), F.m(0, 1.65, sz, 0, 0, Math.PI / 2), [0.55, 0.48, 0.4]);
  const fish = new THREE.SphereGeometry(1, 7, 5);
  for (const sz of [-0.5, 0.5]) for (let k = 0; k < L / 0.28; k++) {
    if (rnd() < 0.25) continue;
    const s = 0.7 + rnd() * 0.5;
    B.add('paint', fish, F.m(-L / 2 + 0.2 + k * 0.28, 1.4, sz, rnd() * 0.3, 0, 0, 0.05 * s, 0.22 * s, 0.11 * s), hex(rnd() < 0.5 ? '#9a9890' : '#b8a37a'));
  }
}

function netPile(B, world, x, z, rnd) {
  const y = world.heightAt(x, z);
  const s = 0.9 + rnd() * 0.8;
  B.add('paint', rockGeo(Math.floor(rnd() * 1000), 1, { rough: 0.35, flat: 0.2, sharp: false }), M(x, y + 0.1, z, rnd() * 6, 0, 0, s * 1.3, s * 0.35, s), hex(rnd() < 0.5 ? '#2f5a46' : '#3d4f63'));
  for (let k = 0; k < 6; k++) {
    const a = rnd() * 6.28, r = s * (0.6 + rnd() * 0.6);
    B.add('plastic', new THREE.SphereGeometry(0.13, 8, 6), M(x + Math.cos(a) * r, y + 0.12 + rnd() * 0.15, z + Math.sin(a) * r), hex(rnd() < 0.7 ? '#f07a22' : '#f2e14a'));
  }
}

// ------------------------------------------------------------------------------------------- the boat ramp
// The baked kick rows end flat (a table top), too gentle to carry a truck over the channel from the hairpin
// exit. The old slipway ends in a timber kicker: a planked wedge over the last KICK.len metres to the lip that
// rises KICK.rise above the road, a real collider (made per race by TrackEvents) under the drawn deck.
export const KICK = { len: 12, rise: 1.0, lift: 0.06 };
const kickerFrame = (world, track) => kickFrame(world, track, track.rampRow ?? track.jump, KICK);

// The old slipway: planked deck over the pinned kick rows with side stringers and a crib wall where it stands
// proud of the sand, a timber face at the lip, broken pilings standing in the tidal channel under the gap, and
// the landing abutment on the far side.
function slipway(B, world, track, rnd) {
  const R = track.rampRow ?? track.jump;
  const W = track.width;
  const f = {}, g = {};
  const yAt = (i, lat = 0) => { track.frame(i, f); return world.heightAt(f.x + f.nx * lat, f.z + f.nz * lat); };
  const kf = kickerFrame(world, track);
  // the kicker's sides: boards from the road up to the wedge, and a cross beam under the lip
  for (const sd of [-1, 1]) {
    const o = new THREE.Vector3(Math.cos(kf.yaw), 0, -Math.sin(kf.yaw)).multiplyScalar(sd * kf.width / 2);
    const a0 = kf.A.clone().add(o), b0 = kf.B.clone().add(o);
    const ga = world.heightAt(a0.x, a0.z), gb = world.heightAt(b0.x, b0.z);
    B.add('wood', quad([a0.x, ga, a0.z], [b0.x, gb, b0.z], [b0.x, b0.y, b0.z], [a0.x, a0.y, a0.z], 1.5), new THREE.Matrix4(), [0.55, 0.49, 0.42]);
    for (let q = 0; q <= 4; q++) {
      const p = a0.clone().lerp(b0, q / 4);
      const gy = world.heightAt(p.x, p.z);
      if (p.y - gy > 0.2) B.add('wood', box(0.2, p.y - gy, 0.2), M(p.x, gy + (p.y - gy) / 2, p.z, kf.yaw), [0.42, 0.37, 0.31]);
    }
  }
  // deck planks every 0.42 m across the kick rows (and a few metres before them)
  for (let s = R - 40; s < R; s += 0.42) {
    const i = Math.floor(s), u = s - i;
    track.frame(i, f); track.frame(i + 1, g);
    const x = f.x + (g.x - f.x) * u, z = f.z + (g.z - f.z) * u;
    const ya = Math.max(world.heightAt(f.x, f.z), track.at(i)[1]), yb = Math.max(world.heightAt(g.x, g.z), track.at(i + 1)[1]);
    const y = ya + (yb - ya) * u;
    const pitch = -Math.atan2(yb - ya, Math.hypot(g.x - f.x, g.z - f.z));
    const onKick = s >= kf.R - KICK.len;
    if (!onKick && rnd() < 0.04) continue; // a missing board here and there
    const shade = 0.75 + rnd() * 0.3;
    B.add('wood', box(W + 1.0, 0.06, 0.38, 2.5), onKick ? M(x, kf.top(s) - 0.03, z, kf.yaw, kf.pitch) : M(x, y + 0.15, z, f.yaw, pitch), [1.0 * shade, 0.92 * shade, 0.8 * shade]);
  }
  // stringers and crib wall along both edges
  for (let i = R - 40; i < R; i += 2) {
    track.frame(i, f); track.frame(i + 2, g);
    for (const sd of [-1, 1]) {
      const lat = sd * (W / 2 + 0.55);
      const xa = f.x + f.nx * lat, za = f.z + f.nz * lat, xb = g.x + g.nx * lat, zb = g.z + g.nz * lat;
      const ya = world.heightAt(f.x, f.z) + 0.12, yb = world.heightAt(g.x, g.z) + 0.12;
      const L = Math.hypot(xb - xa, zb - za, yb - ya);
      const mx = (xa + xb) / 2, mz = (za + zb) / 2, my = (ya + yb) / 2;
      B.add('wood', box(0.32, 0.36, L + 0.05, 1.5), M(mx, my, mz, f.yaw, -Math.atan2(yb - ya, Math.hypot(xb - xa, zb - za))), [0.45, 0.4, 0.34]);
      // crib wall: vertical boards down to the sand where the deck stands proud
      const gy = world.heightAt(mx + f.nx * sd * 2.5, mz + f.nz * sd * 2.5);
      const hgt = my - gy;
      if (hgt > 0.35) B.add('wood', box(0.12, hgt + 0.4, 2.05, 1.5), M(mx + f.nx * sd * 0.1, gy - 0.2 + (hgt + 0.4) / 2, mz + f.nz * sd * 0.1, f.yaw), grime([0.5, 0.45, 0.38], gy, 0.5, 0.8));
      if (hgt > 0.6 && i % 4 === 0) B.add('wood', cyl(0.16, 0.18, hgt + 1, 8), M(mx + f.nx * sd * 0.35, gy - 0.5 + (hgt + 1) / 2, mz + f.nz * sd * 0.35), [0.4, 0.36, 0.3]);
    }
  }
  // the lip: a heavy timber face down into the channel
  track.frame(R, f);
  const lipY = kf.B.y + 0.03; // the kicker's top edge
  let gapEnd = R + 1;
  while (track.at(gapEnd)[4] && gapEnd < R + 60) gapEnd++;
  let bottom = Infinity;
  for (let i = R + 1; i < gapEnd; i++) bottom = Math.min(bottom, yAt(i));
  if (!isFinite(bottom)) bottom = lipY - 4;
  const faceH = lipY - bottom + 0.5;
  B.add('wood', box(W + 1.6, faceH, 0.35, 1.5), M(f.x + f.tx * 0.6, bottom - 0.5 + faceH / 2, f.z + f.tz * 0.6, f.yaw), grime([0.5, 0.45, 0.38], bottom + 0.6, 0.7, 1.2));
  for (let k = -3; k <= 3; k++) {
    const lat = k * (W + 1) / 6;
    B.add('wood', cyl(0.2, 0.22, faceH + 0.1, 8), M(f.x + f.nx * lat + f.tx * 0.95, bottom - 0.8 + (faceH + 0.1) / 2, f.z + f.nz * lat + f.tz * 0.95), grime([0.42, 0.37, 0.31], bottom + 0.4, 0.8, 1.5));
  }
  // broken pilings of the collapsed span, standing in the channel well below the flight path
  for (let i = R + 3; i < gapEnd - 1; i += 3) {
    track.frame(i, f);
    for (const lat of [-W / 2 + 0.8, -2.2, 2.2, W / 2 - 0.8]) {
      if (rnd() < 0.3) continue;
      const x = f.x + f.nx * lat + (rnd() - 0.5) * 0.4, z = f.z + f.nz * lat + (rnd() - 0.5) * 0.4;
      const gy = world.heightAt(x, z);
      const top = Math.min(lipY - 3.2, gy + 0.6 + rnd() * 2.4);
      if (top < gy + 0.3) continue;
      B.add('wood', cyl(0.17, 0.2, top - gy + 1, 7), M(x, gy - 1 + (top - gy + 1) / 2, z, rnd() * 6, (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.15), grime([0.4, 0.35, 0.3], gy + 0.3, 0.8, 1.4));
    }
    // a fallen deck beam leaning across two of them
    if (rnd() < 0.4) B.add('wood', box(0.3, 0.3, 4, 1.5), M(f.x, yAt(i) + 0.8, f.z, f.yaw + 1.2, 0.25), [0.42, 0.37, 0.31]);
  }
  // landing abutment
  // the landing abutment: a timber crib filled to road level. The ground sampled at the landing edge sags into
  // the channel, so the crib is also solid (a flat box collider) and trucks that land short of the road or are
  // put back at the edge don't roll back into the channel.
  track.frame(gapEnd, f);
  const landTop = track.at(gapEnd)[1] + 0.02;
  const aH = landTop - bottom + 0.5;
  B.add('wood', box(W + 1.6, aH, 0.35, 1.5), M(f.x - f.tx * 0.6, bottom - 0.5 + aH / 2, f.z - f.tz * 0.6, f.yaw), grime([0.5, 0.45, 0.38], bottom + 0.6, 0.7, 1.2));
  B.add('wood', box(W + 1.0, 0.06, 4.6, 2.5), M(f.x + f.tx * 1.7, landTop + 0.03, f.z + f.tz * 1.7, f.yaw), [0.9, 0.83, 0.72]);
  const crib = { x: f.x + f.tx * 1.7, y: bottom - 0.5, z: f.z + f.tz * 1.7, w: W + 1.6, d: 4.8, h: landTop - bottom + 0.5, yaw: f.yaw };
  // still water left in the tidal channel
  track.frame(Math.round((R + gapEnd) / 2), g);
  const water = { x: g.x, y: bottom + 0.35, z: g.z, yaw: g.yaw, w: W + 14, d: gapEnd - R + 2 };
  return { lipY, bottom, gapEnd, crib, water };
}

// ------------------------------------------------------------------------------------------- build
export async function buildScenery(ctx) {
  const { scene, world, quality, track } = ctx;
  if (!track) return {};
  const lite = !!quality.aiLod;
  const rnd = mulberry(7101);
  const group = new THREE.Group();
  group.name = 'kahakai';
  scene.add(group);
  const mats = materials(quality);
  const W = track.width;
  const n = track.n;
  const B = new Merge();
  const colliders = [];
  const f = {};

  // ---------------------------------------------------------------- village
  const buildings = (world.data.buildings || []).filter((b) => b.style === 'shack');
  const lineF = track.frame(track.line);
  // the store: the biggest shack near the start line
  let store = null, best = -1;
  for (const b of buildings) {
    const d = Math.hypot(b.x - lineF.x, b.z - lineF.z);
    if (d < 180 && b.w * b.d > best) { best = b.w * b.d; store = b; }
  }
  const shacks = [];
  for (const b0 of buildings) {
    const b = { ...b0 };
    // face the road: the local +z side goes to the nearest racing line
    const near = track.nearest({ x: b.x, z: b.z });
    const c = track.at(near.i);
    const fz = [Math.sin(b.yaw), Math.cos(b.yaw)];
    if (fz[0] * (c[0] - b.x) + fz[1] * (c[2] - b.z) < 0) b.yaw += Math.PI;
    // room in front: centre to road edge minus half the depth
    const front = near.d - W / 2 - b.d / 2;
    const s = shack(B, b, rnd, front, b0 === store);
    s.b = b; s.store = b0 === store;
    shacks.push(s);
    colliders.push({ x: s.x, y: s.y, z: s.z, w: s.w, d: s.d, h: s.h, yaw: s.yaw });
  }
  const blocked = (x, z, r = 1) => colliders.some((c) => {
    const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const lx = dx * co - dz * si, lz = dx * si + dz * co;
    return Math.abs(lx) < c.w / 2 + r && Math.abs(lz) < c.d / 2 + r;
  });
  // store sign, ice chest and a shave-ice board
  if (store) {
    const s = shacks.find((q) => q.store);
    const sign = signMaterial([{ t: 'KAHAKAI STORE', size: 150 }, { t: 'BAIT · ICE · POKE · SHAVE ICE', size: 62, c: '#2f5d62' }], { w: 1600, h: 300, bg: '#f3e9cf', fg: '#8a3b2e', weather: 0.5 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s.W - 0.2, 1.2), sign);
    p.position.copy(s.F.p(0, s.top + 0.6, s.D / 2 + 0.17));
    p.rotation.y = s.b.yaw;
    group.add(p);
    B.add('paint', box(1.4, 0.9, 0.7), s.F.m(s.W / 2 - 1.0, s.top - 2.9, s.D / 2 + 0.6), hex('#f4f4f0'));
    const ice = signMaterial(['ICE'], { w: 256, h: 128, bg: '#2f6fb3', fg: '#ffffff' });
    const pi = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), ice);
    pi.position.copy(s.F.p(s.W / 2 - 1.0, s.top - 2.85, s.D / 2 + 0.96));
    pi.rotation.y = s.b.yaw;
    group.add(pi);
  }
  // behind the shacks: drying racks, nets and floats, the odd canoe pulled up
  for (const s of shacks) {
    if (s.store) continue;
    const r = rnd();
    const bx = s.F.p((rnd() - 0.5) * s.W, 0, -s.D / 2 - 3 - rnd() * 4);
    if (blocked(bx.x, bx.z, 1.2) || nearTrack(world, bx.x, bx.z, W / 2 + 3)) continue;
    if (r < 0.25) dryingRack(B, world, bx.x, bx.z, s.b.yaw + (rnd() - 0.5) * 0.4, rnd);
    else if (r < 0.5) netPile(B, world, bx.x, bx.z, rnd);
    else if (r < 0.62) canoe(B, world, bx.x, bx.z, s.b.yaw + Math.PI / 2 + (rnd() - 0.5) * 0.5, rnd);
  }

  // ---------------------------------------------------------------- beach: canoes, racks, nets on the infield sand
  const seaSide = (i) => {
    track.frame(i, f);
    const a = world.heightAt(f.x + f.nx * 30, f.z + f.nz * 30), b = world.heightAt(f.x - f.nx * 30, f.z - f.nz * 30);
    return a < b ? 1 : -1;
  };
  const [s0, s1] = track.surfLine || [1100, 1960];
  for (let i = s0 + 40; i < s1; i += 70 + Math.floor(rnd() * 60)) {
    const side = -seaSide(i);
    track.frame(i, f);
    const k = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < k; j++) {
      const lat = side * (W / 2 + 6 + j * 3.2 + rnd());
      const x = f.x + f.nx * lat + f.tx * (rnd() - 0.5) * 3, z = f.z + f.nz * lat + f.tz * (rnd() - 0.5) * 3;
      if (nearTrack(world, x, z, W / 2 + 3.5)) continue;
      canoe(B, world, x, z, f.yaw + (rnd() - 0.5) * 0.3, rnd);
    }
    const pick = rnd();
    const lat = side * (W / 2 + 9 + k * 3.2);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    if (nearTrack(world, x, z, W / 2 + 4)) continue;
    if (pick < 0.35) surfRack(B, world, x, z, f.yaw, rnd);
    else if (pick < 0.7) netPile(B, world, x, z, rnd);
    else dryingRack(B, world, x, z, f.yaw, rnd);
  }
  // a surfboard rack and canoes at the start, by the store
  if (store) {
    const s = shacks.find((q) => q.store);
    const p = s.F.p(s.W / 2 + 3, 0, s.D / 2 - 1);
    if (!nearTrack(world, p.x, p.z, W / 2 + 2) && !blocked(p.x, p.z, 0.5)) surfRack(B, world, p.x, p.z, s.b.yaw, rnd);
  }

  // ---------------------------------------------------------------- start
  gantry(group, mats, world, track, track.line, track.name.toUpperCase(), 'GRAVEL RIOT · ROUND 1 · KAIʻELE');
  gridMarks(group, world, track);

  // ---------------------------------------------------------------- the old boat ramp
  const ramp = slipway(B, world, track, rnd);
  colliders.push(ramp.crib);
  const R = track.rampRow ?? track.jump;

  // ---------------------------------------------------------------- lava-rock point
  const lavaRows = [];
  for (let i = 0; i < n; i++) if (track.surf?.[i] === 3) lavaRows.push(i);
  const pointRocks = [];
  const geos = [1, 2, 3, 4, 5, 6].map((s) => rockGeo(s * 31, lite ? 1 : 2, { rough: 0.28, flat: 0.5 }));
  for (let k = 0; k < (lite ? 140 : 320); k++) {
    if (!lavaRows.length) break;
    const i = lavaRows[Math.floor(rnd() * lavaRows.length)];
    track.frame(i, f);
    const side = rnd() < 0.65 ? seaSide(i) : -seaSide(i);
    const lat = side * (W / 2 + 3 + Math.pow(rnd(), 1.4) * 42);
    const x = f.x + f.nx * lat + (rnd() - 0.5) * 6, z = f.z + f.nz * lat + (rnd() - 0.5) * 6;
    const big = Math.abs(lat) > W / 2 + 9;
    const s = big ? 1.2 + Math.pow(rnd(), 2) * 5 : 0.4 + rnd() * 1.0;
    if (nearTrack(world, x, z, W / 2 + 1.5 + s)) continue;
    const y = world.heightAt(x, z);
    // ledges: wide and flat, tilted with the shore; boulders: rounder
    const ledge = big && rnd() < 0.5;
    const sx = ledge ? s * (1.6 + rnd()) : s, sy = ledge ? s * 0.35 : s * (0.6 + rnd() * 0.3), sz = ledge ? s * (1.1 + rnd() * 0.6) : s * (0.8 + rnd() * 0.3);
    const shade = 0.42 + rnd() * 0.2;
    B.add('basalt', geos[Math.floor(rnd() * geos.length)], M(x, y - sy * 0.25, z, rnd() * 6.28, (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.25, sx, sy, sz),
      [shade, shade * 0.98, shade * 0.96], { worldUV: 2.2 });
    pointRocks.push({ x, z, r: Math.max(sx, sz) });
    // solid only where the box can't reach the road (it's axis aligned and fatter than the rock)
    if (Math.max(sx, sz) > 1.6 && sy > 0.6 && !nearTrack(world, x, z, W / 2 + 1 + Math.max(sx, sz))) colliders.push({ x, y: y - 0.5, z, w: sx * 1.2, d: sz * 1.2, h: sy * 1.2 + 0.5, yaw: 0 });
  }
  // tide pools: still water in the hollows of the seaward rocks, ringed by rough lava
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x1d3b40, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.82 });
  poolMat.userData.wx = false;
  const pools = [];
  {
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(ramp.water.w, ramp.water.d).rotateX(-Math.PI / 2), poolMat);
    wm.position.set(ramp.water.x, ramp.water.y, ramp.water.z);
    wm.rotation.y = ramp.water.yaw;
    wm.receiveShadow = true;
    group.add(wm);
  }
  for (let k = 0; k < 120 && pools.length < (lite ? 6 : 12); k++) {
    if (!lavaRows.length) break;
    const i = lavaRows[Math.floor(rnd() * lavaRows.length)];
    track.frame(i, f);
    const side = seaSide(i);
    const lat = side * (W / 2 + 10 + rnd() * 30);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    const y = world.heightAt(x, z);
    if (y < 0.15 || y > 3 || nearTrack(world, x, z, W / 2 + 6) || pools.some((p) => Math.hypot(p.x - x, p.z - z) < 8)) continue;
    const r = 1.4 + rnd() * 2.2;
    let rim = Infinity;
    for (let a = 0; a < 12; a++) rim = Math.min(rim, world.heightAt(x + Math.cos(a / 12 * 6.28) * r, z + Math.sin(a / 12 * 6.28) * r));
    const level = Math.max(y + 0.08, rim - 0.05);
    pools.push({ x, z });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2), poolMat);
    disc.position.set(x, level, z);
    disc.receiveShadow = true;
    group.add(disc);
    // the rough rim hides the water's edge
    for (let a = 0; a < 10; a++) {
      const ang = a / 10 * 6.28 + rnd() * 0.4, rr = r * (0.95 + rnd() * 0.2);
      const px = x + Math.cos(ang) * rr, pz = z + Math.sin(ang) * rr;
      const s = 0.4 + rnd() * 0.5;
      B.add('basalt', geos[a % geos.length], M(px, world.heightAt(px, pz) + 0.05, pz, rnd() * 6, 0, 0, s * 1.3, s * 0.5, s), [0.38, 0.37, 0.36], { worldUV: 1.6 });
    }
  }

  // ---------------------------------------------------------------- trackside: marker posts
  for (let i = 0; i < n; i += 18) {
    if (track.at(i)[4]) continue;
    const onBeach = (i >= s0 && i <= s1) || lavaRows.includes(i);
    if (!onBeach) continue;
    track.frame(i, f);
    for (const sd of [-1, 1]) {
      const lat = sd * (W / 2 + 1.6);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      if (nearTrack(world, x, z, W / 2 + 1.0)) continue;
      const y = world.heightAt(x, z);
      B.add('paint', box(0.12, 1.1, 0.12), M(x, y + 0.5, z, f.yaw), [0.92, 0.92, 0.9]);
      B.add('paint', box(0.13, 0.18, 0.13), M(x, y + 0.88, z, f.yaw), sd > 0 ? hex('#d8443a') : hex('#f2f2f2'));
    }
  }
  B.build(mats, group);

  // ---------------------------------------------------------------- knock-down props: driftwood, crates, floats, tyres
  const pm = {
    driftwood_log: driftwoodModel(mats, 3), driftwood_log_b: driftwoodModel(mats, 8),
    fish_crate: fishCrateModel(mats, '#3b7fb8'), fish_crate_b: fishCrateModel(mats, '#e2662a'), net_float: floatModel(mats),
    ...await loadPropModels(['old_tyre', 'Barrel_02', 'wooden_crate_01', 'boulder_01', 'rock_09', 'namaqualand_boulder_02'])
  };
  // the stock rocks come out as fresh black lava
  for (const k of ['boulder_01', 'rock_09', 'namaqualand_boulder_02']) for (const m of pm[k].meshes) {
    m.mat = m.mat.clone(); m.mat.color.setRGB(0.32, 0.31, 0.31); m.mat.userData.wx = 'object';
  }
  for (const m of Object.values(pm)) for (const x of m.meshes) x.mat.userData.wx ??= 'object';
  const { put, build, handles } = makePlacer(world, pm, rnd);
  // driftwood and crates along the surf line, a few on the road edge
  for (let i = s0; i < s1; i += 9 + Math.floor(rnd() * 14)) {
    track.frame(i, f);
    const side = rnd() < 0.7 ? seaSide(i) : -seaSide(i);
    const lat = side * (W / 2 - 1.5 + rnd() * 9);
    const x = f.x + f.nx * lat + f.tx * rnd() * 4, z = f.z + f.nz * lat + f.tz * rnd() * 4;
    const r = rnd();
    if (r < 0.45) put(rnd() < 0.5 ? 'driftwood_log' : 'driftwood_log_b', x, z, f.yaw + (rnd() - 0.5) * 2, 3.2 + rnd() * 1.4, { align: 1, sink: 0.04 });
    else if (r < 0.75) {
      put(rnd() < 0.6 ? 'fish_crate' : 'fish_crate_b', x, z, rnd() * 6.28, 0.8, { align: 1 });
      if (rnd() < 0.4) put('fish_crate', x, z, rnd() * 6.28, 0.8, { align: 1, yOff: 0.3 });
    } else if (r < 0.88) for (let k = 0; k < 3; k++) put('net_float', x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, 0, 0.45, { align: 1 });
    else put('Barrel_02', x, z, rnd() * 6.28, 0.9, { byHeight: true });
  }
  // crates and drums stacked by the shacks along the harbour road
  for (const s of shacks) {
    if (rnd() < 0.45) continue;
    const p = s.F.p((rnd() - 0.5) * s.W, 0, s.D / 2 + 0.6 + rnd() * 1.4 + (s.d - s.D - 0.2));
    if (nearTrack(world, p.x, p.z, W / 2 + 0.8) || blocked(p.x, p.z, 0.2)) continue;
    const r = rnd();
    if (r < 0.4) { put('fish_crate', p.x, p.z, s.b.yaw, 0.8, { align: 1 }); put('fish_crate_b', p.x, p.z, s.b.yaw + 0.3, 0.8, { align: 1, yOff: 0.3 }); }
    else if (r < 0.7) put('Barrel_02', p.x, p.z, rnd() * 6, 0.9, { byHeight: true });
    else put('wooden_crate_01', p.x, p.z, rnd() * 6, 0.8);
  }
  // black lava boulders at the point (solid, from the stock models)
  for (let k = 0; k < (lite ? 30 : 70); k++) {
    if (!lavaRows.length) break;
    const i = lavaRows[Math.floor(rnd() * lavaRows.length)];
    track.frame(i, f);
    const lat = (rnd() < 0.5 ? -1 : 1) * (W / 2 + 4 + rnd() * 35);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    const s = 0.8 + Math.pow(rnd(), 2) * 3.5;
    if (nearTrack(world, x, z, W / 2 + 2 + s)) continue;
    put(['boulder_01', 'rock_09', 'namaqualand_boulder_02'][Math.floor(rnd() * 3)], x, z, rnd() * 6.28, s, { align: 0.6, sink: 0.15, tilt: 0.5 });
    if (s > 1.8 && !nearTrack(world, x, z, W / 2 + 2 + s)) colliders.push({ x, y: world.heightAt(x, z) - 0.5, z, w: s * 0.7, d: s * 0.7, h: s * 0.8, yaw: 0 });
  }
  // tyre walls on the outside of the hairpin at the point and the ramp approach
  for (let i = 0; i < n; i += 5) {
    const a = track.frame(i - 10, {}), b = track.frame(i + 10, {});
    const turn = a.tx * b.tz - a.tz * b.tx;
    if (Math.abs(turn) < 0.35 || track.at(i)[4]) continue;
    track.frame(i, f);
    const side = turn > 0 ? -1 : 1;
    for (let t = 0; t < 3; t++) {
      const lat = side * (W / 2 + 2.4);
      const x = f.x + f.nx * lat + f.tx * (t - 1) * 0.9, z = f.z + f.nz * lat + f.tz * (t - 1) * 0.9;
      if (nearTrack(world, x, z, W / 2 + 1.4) || blocked(x, z, 0.3)) continue;
      for (let h = 0; h < 2; h++) put('old_tyre', x, z, rnd() * 6, 0.85, { align: 1, yOff: h * 0.27 });
    }
  }
  build(group);

  // ---------------------------------------------------------------- spectators and beach flags
  const crowd = new Crowd(rnd);
  const flags = new Flags();
  const FLAG = ['#d8443a', '#f2c230', '#2f6fb3', '#f4f1ea', '#2c6e49'];
  const spot = (i, lat) => { track.frame(i, f); return [f.x + f.nx * lat, f.z + f.nz * lat]; };
  const freeSpot = (x, z) => !nearTrack(world, x, z, W / 2 + 2.6) && !blocked(x, z, 0.4) && world.heightAt(x, z) > 0.4;
  const n0 = lite ? 0.5 : 1;
  // start: both sides of the line, in front of the shacks
  for (let k = 0; k < 120 * n0; k++) {
    const i = track.line - 30 + Math.floor(rnd() * 60);
    const sd = rnd() < 0.5 ? -1 : 1;
    const [x, z] = spot(i, sd * (W / 2 + 3 + rnd() * 5));
    if (!freeSpot(x, z)) continue;
    track.frame(i, f);
    crowd.add(x, world.heightAt(x, z), z, f.yaw + (sd > 0 ? -Math.PI / 2 : Math.PI / 2));
  }
  // around the boat ramp: on the dunes beside the run-up and the landing, clear of the channel
  for (let k = 0; k < 110 * n0; k++) {
    const i = R - 40 + Math.floor(rnd() * 90);
    const sd = rnd() < 0.5 ? -1 : 1;
    const [x, z] = spot(i, sd * (W / 2 + 4 + rnd() * 9));
    if (!freeSpot(x, z) || world.heightAt(x, z) < ramp.lipY - 4 || (i > R - 4 && i < ramp.gapEnd + 6)) continue;
    const c = track.frame(R + 8, {});
    crowd.add(x, world.heightAt(x, z), z, Math.atan2(c.x - x, c.z - z));
  }
  crowd.build(group);
  for (let k = -6; k <= 6; k++) {
    for (const sd of [-1, 1]) {
      const [x, z] = spot(track.line + k * 12, sd * (W / 2 + 2.2));
      if (!nearTrack(world, x, z, W / 2 + 1.6) && !blocked(x, z, 0.4)) flags.add(x, world.heightAt(x, z), z, 0, 4.2, FLAG[(k + 6 + (sd > 0 ? 2 : 0)) % FLAG.length]);
    }
  }
  for (const i of [R - 30, R - 15, R - 2, ramp.gapEnd + 4, ramp.gapEnd + 16]) for (const sd of [-1, 1]) {
    const [x, z] = spot(i, sd * (W / 2 + 2.4));
    if (!nearTrack(world, x, z, W / 2 + 1.8)) flags.add(x, world.heightAt(x, z), z, 0, 4.6, FLAG[(i + sd + 5) % FLAG.length]);
  }
  for (let i = s0; i < s1; i += 160) {
    const sd = -seaSide(i);
    const [x, z] = spot(i, sd * (W / 2 + 3));
    if (!nearTrack(world, x, z, W / 2 + 2)) flags.add(x, world.heightAt(x, z), z, 0, 4.2, FLAG[(i / 160 | 0) % FLAG.length]);
  }
  flags.build(group);

  // the trade wind blows from the north-east, onshore here: sails stream to the south-west
  const windYaw = Math.atan2(-0.8, 0.6);
  return {
    colliders, handles,
    update(t, dt, camera, race) {
      flags.update(t, windYaw, 0.15 + 0.1 * Math.sin(t * 0.3));
      crowd.update(t, race?.cars);
    },
  };
}

// ------------------------------------------------------------------------------------------- race events
// The surf throws driftwood up onto the beach road: every so often a log washes in from the sea side a little
// ahead of a truck on the surf line, slides up the sand and stops on (or across) the road. Logs hit the trucks
// (and the trucks shove them aside); they wash away again after a while.
const G_HAZARD = (0x0008 << 16) | 0x0003;
export class TrackEvents {
  constructor(hz) {
    this.hz = hz;
    this.rnd = mulberry(5150);
    this.logs = [];
    this.t = 9;
    this.group = new THREE.Group();
    hz.scene.add(this.group);
    const g = new THREE.CylinderGeometry(0.18, 0.24, 1, 8, 3).rotateZ(Math.PI / 2);
    this.geo = g;
    this.mat = new THREE.MeshStandardMaterial({ color: 0xa69c8c, roughness: 0.95 });
    this.mat.userData.wx = 'object';
    const [a, b] = hz.track.surfLine || [1100, 1960];
    this.rows = [a + 20, b - 20];
    // the slipway kicker: one tilted slab whose top is the drawn deck
    this.kickBody = addKicker(hz.phys, kickerFrame(hz.world, hz.track));
  }

  pre(dt, race) {
    if (race.clock < 3) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 10 + this.rnd() * 12;
    if (this.logs.length >= (this.hz.quality.aiLod ? 4 : 7)) return;
    // pick a truck on (or about to reach) the beach and drop the log 60-120 m in front of it
    const tr = this.hz.track;
    const on = race.cars.filter((c) => !c.finished && c.i > this.rows[0] - 150 && c.i < this.rows[1] - 120);
    if (!on.length) return;
    const st = on.find((c) => c.isPlayer && this.rnd() < 0.6) || on[Math.floor(this.rnd() * on.length)];
    const i = Math.min(this.rows[1], Math.max(this.rows[0], st.i + 60 + Math.floor(this.rnd() * 60)));
    const f = tr.frame(i);
    const w = this.hz.world;
    const side = w.heightAt(f.x + f.nx * 30, f.z + f.nz * 30) < w.heightAt(f.x - f.nx * 30, f.z - f.nz * 30) ? 1 : -1;
    const lat = side * (tr.width / 2 + 6);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    const L = 2.6 + this.rnd() * 1.8;
    const y = Math.max(w.heightAt(x, z), 0.2) + 0.5;
    const yaw = f.yaw + (this.rnd() - 0.5) * 1.2 + Math.PI / 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const sp = 3.5 + this.rnd() * 2.5; // the backwash shoves it up the beach
    const body = this.hz.phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q)
      .setLinvel(-f.nx * side * sp, 0.5, -f.nz * side * sp).setLinearDamping(0.6).setAngularDamping(0.8).setCcdEnabled(true));
    this.hz.phys.createCollider(RAPIER.ColliderDesc.capsule(L / 2 - 0.2, 0.2).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 })
      .setMass(70).setFriction(0.9).setRestitution(0.1).setCollisionGroups(G_HAZARD), body);
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.scale.set(L, 1, 1);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.logs.push({ body, mesh, age: 0, i });
    // white water where it comes ashore
    for (let k = 0; k < 6; k++) this.hz.fx.smoke.emit(new THREE.Vector3(x, y, z), new THREE.Vector3((this.rnd() - 0.5) * 3, 1.2, (this.rnd() - 0.5) * 3), 1.4, this.hz.fx.time, 1.6, 0.9, 0.93, 0.95);
  }

  post(dt, race) {
    for (const l of this.logs) {
      l.age += dt;
      const p = l.body.translation(), q = l.body.rotation();
      l.mesh.position.set(p.x, p.y, p.z);
      l.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      // the tide takes it back once the pack has gone by
      const behind = race.cars.every((c) => c.finished || this.hz.track.ahead(l.i, c.i) > 80 && this.hz.track.ahead(l.i, c.i) < 1500);
      if (l.age > 45 || (l.age > 8 && behind) || p.y < -20) l.dead = true;
    }
    for (const l of this.logs) if (l.dead) { this.hz.phys.removeRigidBody(l.body); this.group.remove(l.mesh); }
    this.logs = this.logs.filter((l) => !l.dead);
  }

  dispose() {
    if (this.kickBody) this.hz.phys.removeRigidBody(this.kickBody);
    for (const l of this.logs) this.hz.phys.removeRigidBody(l.body);
    this.logs = [];
    this.hz.scene.remove(this.group);
  }
}
