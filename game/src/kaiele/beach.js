import * as THREE from 'three';
import { mulberry } from '../world.js';
import { wind } from '../ambient.js';
import { vegWind } from './vegetation.js';
import { kaieleShore } from './terrain.js';

// Beach detail along the sand tracks, instanced: lava pebbles, coral rubble and shells on the swash slope, the
// wrack line's driftwood, limu and coconuts at the reach of the biggest waves, and low tufts of beach grass on the
// dune hummocks behind. Placed by the same run-up measure as the sand shader (terrain.js SAND_GLSL), so the 3D
// litter sits on the painted wrack line. Kept in 96 m tiles, each drawn only near the camera.
const TILE = 96;
// drawn within r m of the camera
const KINDS = {
  pebble: { r: 45, cast: false },
  coral: { r: 45, cast: false },
  shell: { r: 30, cast: false },
  limu: { r: 60, cast: false },
  stick: { r: 110, cast: true },
  nut: { r: 110, cast: true },
  grass: { r: 120, cast: false },
};

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// a lumpy rock: icosphere pushed about by a few random bumps, flattened, grounded at y = 0
function lump(rnd, flat, bumps = 5, amt = 0.25) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, v = new THREE.Vector3();
  const B = Array.from({ length: bumps }, () => [new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), (rnd() - 0.4) * amt]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let s = 1;
    for (const [d, a] of B) s += a * Math.max(0, v.dot(d)) ** 3;
    v.multiplyScalar(s);
    v.y = v.y * flat + flat * 0.55;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function colourGeo(g, top, bot) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  let ymax = 1e-4;
  for (let i = 0; i < p.count; i++) ymax = Math.max(ymax, p.getY(i));
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / ymax));
    for (let k = 0; k < 3; k++) c[i * 3 + k] = bot[k] + (top[k] - bot[k]) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// a cowrie / cone shell: a ribbed half-ellipsoid
function shellGeo() {
  const g = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), rib = 1 + 0.08 * Math.cos(a * 9);
    p.setXYZ(i, x * rib * 0.62, y * 0.45, z * rib);
  }
  g.computeVertexNormals();
  return colourGeo(g, [1, 1, 1], [0.8, 0.78, 0.74]);
}
// a branched coral fragment, sun-bleached
function coralGeo(rnd) {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.CylinderGeometry(0.12, 0.16, 1, 5, 1);
    c.rotateZ(Math.PI / 2 + (rnd() - 0.5) * 0.6);
    c.rotateY(k * 1.4 + rnd());
    c.translate((rnd() - 0.5) * 0.4, 0.12, (rnd() - 0.5) * 0.4);
    parts.push(c);
  }
  const g = merge(parts);
  return colourGeo(g, [1, 0.97, 0.92], [0.82, 0.78, 0.72]);
}
// driftwood: a bent, tapering stick lying on the sand, bleached grey
function stickGeo(rnd) {
  const g = new THREE.CylinderGeometry(0.6, 1, 1, 6, 4, false);
  const p = g.attributes.position;
  const bend = (rnd() - 0.5) * 0.5;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + bend * (y * y - 0.25) * 8);
  }
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.8, 0);
  g.computeVertexNormals();
  return colourGeo(g, [0.62, 0.58, 0.52], [0.42, 0.38, 0.33]);
}
// a tuft of beach grass: thin tapered blades fanning out, dark at the base, sun-bleached tips
function grassGeo(rnd) {
  const pos = [], col = [], idx = [];
  const n = 16;
  for (let b = 0; b < n; b++) {
    const a = rnd() * Math.PI * 2, lean = 0.25 + rnd() * 0.6, h = 0.55 + rnd() * 0.45, w = 0.02 + rnd() * 0.012;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w;
    const base = pos.length / 3;
    const seg = 3;
    for (let s = 0; s <= seg; s++) {
      const t = s / seg, r = lean * t * t * 0.9 + 0.03, y = h * (t - lean * 0.35 * t * t), ww = 1 - t * 0.92;
      pos.push(dx * r - px * ww, y, dz * r - pz * ww, dx * r + px * ww, y, dz * r + pz * ww);
      const c = [0.16 + t * 0.32, 0.22 + t * 0.26, 0.08 + t * 0.12];
      col.push(...c, ...c);
    }
    for (let s = 0; s < seg; s++) { const q = base + s * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // blades light like the tuft they belong to: normals mostly up
  const nr = g.attributes.normal;
  for (let i = 0; i < nr.count; i++) { const y = Math.abs(nr.getY(i)) + 1.2; nr.setXYZ(i, nr.getX(i) * 0.4, y, nr.getZ(i) * 0.4); }
  for (let i = 0; i < nr.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(nr, i).normalize(); nr.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
function merge(list) {
  const pos = [], nrm = [], idx = [];
  for (const g of list) {
    const gi = g.index ? g : g.toNonIndexed();
    const base = pos.length / 3;
    pos.push(...gi.attributes.position.array); nrm.push(...gi.attributes.normal.array);
    if (gi.index) for (const i of gi.index.array) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export function buildBeach(ctx) {
  const { scene, world, quality, tracks } = ctx;
  const low = quality.terrainStep > 3;
  const dens = low ? 0.35 : quality.ultra ? 1.4 : 1;
  const rnd = mulberry(9157);
  const shore = kaieleShore(world).userData.at;
  // geometry and material per kind
  const mats = {
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),
    bone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
    limu: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  };
  // the grass leans and sways with the trade wind, more at the tips
  mats.grass.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uWind: wind.uTime, uWindK: vegWind.strength, uWindDir: vegWind.dir });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind, uWindK; uniform vec2 uWindDir;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec2 wp = instanceMatrix[3].xz;
  float k = transformed.y * transformed.y * uWindK;
  float g = 0.6 + 0.4 * sin(uWind * 1.9 + dot(wp, vec2(0.3, 0.21))) * sin(uWind * 0.7 + wp.x * 0.05);
  vec2 d = uWindDir * k * (0.18 + 0.12 * g);
  transformed += inverse(mat3(instanceMatrix)) * vec3(d.x, -k * 0.05, d.y);
}`);
  };
  mats.grass.customProgramCacheKey = () => 'kaiele-beachgrass';
  const geos = {
    pebble: [colourGeo(lump(rnd, 0.55), [1, 1, 1], [0.75, 0.75, 0.75]), colourGeo(lump(rnd, 0.4, 7, 0.4), [1, 1, 1], [0.7, 0.7, 0.7])],
    coral: [coralGeo(rnd), colourGeo(lump(rnd, 0.6, 9, 0.5), [1, 0.98, 0.94], [0.8, 0.77, 0.72])],
    shell: [shellGeo()],
    limu: [colourGeo(lump(rnd, 0.14, 9, 0.7), [1, 1, 1], [0.6, 0.6, 0.6])],
    stick: [stickGeo(rnd), stickGeo(rnd)],
    nut: [colourGeo(lump(rnd, 0.85, 4, 0.15), [1, 1, 1], [0.7, 0.7, 0.7])],
    grass: [grassGeo(rnd), grassGeo(rnd)],
  };
  const matOf = { pebble: mats.rock, coral: mats.bone, shell: mats.bone, limu: mats.limu, stick: mats.wood, nut: mats.wood, grass: mats.grass };
  // instances, by tile and kind
  const tiles = new Map();
  const put = (kind, x, z, s, sy, yaw, col, tilt = 0.15) => {
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = { x: (Math.floor(x / TILE) + 0.5) * TILE, z: (Math.floor(z / TILE) + 0.5) * TILE, items: {} }));
    const v = Math.floor(rnd() * geos[kind].length);
    ((t.items[kind] ||= geos[kind].map(() => []))[v]).push([x, world.heightAt(x, z), z, s, sy, yaw, col, tilt]);
  };
  // where the beach tracks run: rows by 8 m cell, to keep litter off the racing line
  const cellRows = new Map();
  const sandTracks = tracks.filter((t) => t.surf && t.c.some((_, i) => [1, 2, 10].includes(t.surf[i])));
  for (const t of sandTracks) for (let i = 0; i < t.n; i += 2) {
    const p = t.c[i];
    const k = `${Math.floor(p[0] / 8)},${Math.floor(p[2] / 8)}`;
    (cellRows.get(k) || cellRows.set(k, []).get(k)).push([p[0], p[2], t.width / 2]);
  }
  const offRoad = (x, z, pad) => {
    const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
    for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
      for (const [px, pz, hw] of cellRows.get(`${i},${j}`) || []) if (Math.hypot(x - px, z - pz) < hw + pad) return false;
    }
    return true;
  };
  // scatter over the beach either side of every sand stretch of track
  const seen = new Set();
  let n = 0;
  for (const t of sandTracks) for (let i = 0; i < t.n; i += 6) {
    if (![1, 2, 10].includes(t.surf[i])) continue;
    const f = t.frame(i);
    const white = t.surf[i] === 10; // the north cove's coral sand, else black volcanic
    const ck = `${Math.floor(f.x / 24)},${Math.floor(f.z / 24)}`;
    if (seen.has(ck)) continue;
    seen.add(ck);
    // a 24 m cell around this row, then its neighbours out to 72 m
    for (let cj = -3; cj <= 3; cj++) for (let ci = -3; ci <= 3; ci++) {
      const k2 = `${Math.floor(f.x / 24) + ci},${Math.floor(f.z / 24) + cj}`;
      if (seen.has('c' + k2)) continue;
      seen.add('c' + k2);
      const x0 = (Math.floor(f.x / 24) + ci) * 24, z0 = (Math.floor(f.z / 24) + cj) * 24;
      const tries = Math.round(600 * dens);
      for (let s = 0; s < tries; s++) {
        const x = x0 + rnd() * 24, z = z0 + rnd() * 24;
        const y = world.heightAt(x, z);
        if (y < 0.15 || y > 14) continue;
        const [sd, rs] = shore(x, z);
        if (sd < 1 || sd > 70) continue;
        if (world.normalAt(x, z, new THREE.Vector3()).y < 0.93) continue;
        const q = Math.max(sd / (24 * rs * 1.2), y / (1.3 + 1.32 * rs));
        const r = rnd();
        const wr = Math.exp(-(((q - 1) / 0.06) ** 2)) + 0.5 * Math.exp(-(((q - 1.3) / 0.05) ** 2));
        if (!offRoad(x, z, q > 1.4 ? 2.5 : 1.2)) continue;
        // pebbles and coral bits: on the swash slope and the wrack, sparse higher up
        const pp = (0.08 + 0.5 * wr + 0.25 * ss(0.15, 0.4, q) * (1 - ss(0.8, 1.0, q))) * (q < 1.8 ? 1 : 0.15);
        if (r < pp * 0.35) {
          const lava = rnd() < (white ? 0.15 : 0.85);
          const sz = 0.025 + rnd() ** 2 * 0.09;
          const c = lava ? 0.035 + rnd() * 0.03 : 0.6 + rnd() * 0.15;
          put(lava ? 'pebble' : 'coral', x, z, sz, sz, rnd() * 6.28, lava ? [c, c * 0.97, c * 0.95] : [c, c * 0.95, c * 0.86]);
          n++;
          continue;
        }
        // shells near the wrack and the swash marks
        if (r < pp * 0.35 + (0.05 + 0.3 * wr) * 0.12) {
          const sz = 0.015 + rnd() * 0.03;
          const tone = rnd();
          put('shell', x, z, sz, sz, rnd() * 6.28, tone < 0.6 ? [0.85, 0.8, 0.72] : tone < 0.85 ? [0.8, 0.6, 0.52] : [0.55, 0.42, 0.3], 0.3);
          n++;
          continue;
        }
        // the wrack line: limu clumps, driftwood, a coconut now and then
        if (wr > 0.25 && r < 0.6 + wr * 0.08) {
          const w2 = rnd();
          if (w2 < 0.55) {
            const sz = 0.12 + rnd() * 0.3, g = rnd();
            put('limu', x, z, sz, sz, rnd() * 6.28, [0.05 + g * 0.04, 0.045 + g * 0.03, 0.02]);
          } else if (w2 < 0.8) {
            const len = 0.3 + rnd() ** 2 * 1.6, rad = 0.015 + rnd() * 0.03 + len * 0.02;
            put('stick', x, z, len, rad, rnd() * 6.28, [0.9 + rnd() * 0.3, 0.9 + rnd() * 0.25, 0.85 + rnd() * 0.2], 0.08);
          } else if (w2 < 0.86) {
            const old = rnd() < 0.5;
            put('nut', x, z, 0.1 + rnd() * 0.03, 0.1, rnd() * 6.28, old ? [0.32, 0.22, 0.13] : [0.42, 0.36, 0.14], 0.3);
          }
          n++;
          continue;
        }
        // beach grass on the dry sand and dune hummocks behind, in clumps
        if (q > 1.45 && sd > 14) {
          const clump = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.sin(z * 0.17 + Math.sin(x * 0.11) * 2);
          if (r < 0.5 * ss(1.45, 2.2, q) * ss(0.45, 0.8, clump)) {
            const sz = 0.3 + rnd() * 0.35;
            const g = rnd();
            put('grass', x, z, sz, sz * (0.8 + rnd() * 0.5), rnd() * 6.28, [0.75 + g * 0.5, 0.8 + g * 0.35, 0.6 + g * 0.2], 0.1);
            n++;
          }
        }
      }
    }
  }
  // build the instanced meshes
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), cl = new THREE.Color();
  const live = [];
  for (const t of tiles.values()) {
    t.meshes = [];
    for (const [kind, vars] of Object.entries(t.items)) vars.forEach((list, v) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geos[kind][v], matOf[kind], list.length);
      list.forEach(([x, y, z, s, sy, yaw, c, tilt], k) => {
        e.set((rnd() - 0.5) * tilt, yaw, (rnd() - 0.5) * tilt);
        qt.setFromEuler(e);
        const sxz = kind === 'stick' ? [s, sy, sy] : [s, sy, s * (0.8 + rnd() * 0.4)];
        // half sunk in the sand (sticks and coconuts bed in, grass roots below)
        const sink = kind === 'grass' ? 0.05 : kind === 'stick' ? sy * 0.6 : sy * 0.25;
        m4.compose(new THREE.Vector3(x, y - sink, z), qt, new THREE.Vector3(...sxz));
        im.setMatrixAt(k, m4);
        im.setColorAt(k, cl.setRGB(c[0], c[1], c[2]));
      });
      im.castShadow = KINDS[kind].cast && !low;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.userData.r = KINDS[kind].r * (low ? 0.7 : 1);
      im.visible = false;
      group.add(im);
      t.meshes.push(im);
    });
    live.push(t);
  }
  scene.add(group);
  console.info(`kaiele beach detail: ${n} pieces in ${tiles.size} tiles`);
  return {
    update(t, dt, camera) {
      if (!camera) return;
      const cx = camera.position.x, cz = camera.position.z;
      for (const tl of live) {
        const d = Math.hypot(Math.max(Math.abs(cx - tl.x) - TILE / 2, 0), Math.max(Math.abs(cz - tl.z) - TILE / 2, 0));
        for (const m of tl.meshes) m.visible = d < m.userData.r;
      }
    },
  };
}
