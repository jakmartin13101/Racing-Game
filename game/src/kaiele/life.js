import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../world.js';
import { wind } from '../ambient.js';

// Animals on Kai'ele: white tropicbirds and dark shearwaters wheeling along the coasts and the Pali Kai cliffs,
// a flock of cattle egrets that bursts out of the jungle canopy when the trucks come through, and pale ghost
// crabs on Kahakai's black sand that scuttle sideways away from the trucks and dive into their burrows.
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();

// a bird, nose along +z: body, two-part wings (the outer part beats more), forked tail streamers
function birdGeometry() {
  const P = [], F = [];
  const tri = (a, b, c, fa = 0, fb = 0, fc = 0) => { P.push(...a, ...b, ...c); F.push(fa, fb, fc); };
  // body: two crossed slivers
  tri([0, 0, 0.45], [0, 0.06, -0.1], [0, 0, -0.4]); tri([0, 0, 0.45], [0, -0.07, 0], [0, 0, -0.4]);
  tri([0, 0, 0.45], [0.07, 0, 0], [0, 0, -0.4]); tri([0, 0, 0.45], [-0.07, 0, 0], [0, 0, -0.4]);
  for (const sx of [1, -1]) {
    // inner wing, outer wing (swept back), flap weight by distance out
    tri([0, 0, 0.18], [0.45 * sx, 0.02, 0.1], [0, 0, -0.12], 0, 0.4, 0);
    tri([0, 0, -0.12], [0.45 * sx, 0.02, 0.1], [0.45 * sx, 0.02, -0.12], 0, 0.4, 0.4);
    tri([0.45 * sx, 0.02, 0.1], [1.05 * sx, 0.05, -0.18], [0.45 * sx, 0.02, -0.12], 0.4, 1, 0.4);
    // tail streamer
    tri([0, 0, -0.35], [0.05 * sx, 0, -0.95], [0.01 * sx, 0, -0.4]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('flap', new THREE.Float32BufferAttribute(F, 1));
  // wing tips and tail dark (the instance colour paints the rest)
  const C = [];
  for (let i = 0; i < P.length / 3; i++) { const x = Math.abs(P[i * 3]), z = P[i * 3 + 2]; const d = x > 0.85 || z < -0.6 ? 0.25 : 1; C.push(d, d, d); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  return g;
}

function birdMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.userData.wx = false;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float flap; attribute vec2 aFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
// aFlap: (phase, how hard it beats: 0 gliding, 1 flapping)
float beat = sin(uTime * (9.0 + aFlap.x * 0.3) + aFlap.x * 6.0);
transformed.y += flap * (beat * 0.55 * aFlap.y + 0.08 * (1.0 - aFlap.y)) * (0.6 + abs(transformed.x));`);
  };
  mat.customProgramCacheKey = () => 'kaiele-bird';
  return mat;
}

// a ghost crab, about 25 cm across: carapace, eye stalks, two claws, eight legs
function crabGeometry() {
  const parts = [];
  const box = (w, h, d, x, y, z, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(1, 1, 1)));
    parts.push(g);
  };
  box(0.16, 0.05, 0.12, 0, 0.08, 0);
  box(0.12, 0.03, 0.09, 0, 0.115, -0.005);
  for (const sx of [1, -1]) {
    box(0.012, 0.05, 0.012, 0.04 * sx, 0.13, 0.05);
    box(0.06, 0.035, 0.04, 0.09 * sx, 0.08, 0.08, 0.5 * sx);
    for (let k = 0; k < 4; k++) box(0.13, 0.012, 0.014, 0.12 * sx, 0.05, 0.035 - k * 0.035, (k - 1.5) * 0.25 * sx, -0.5 * sx);
  }
  const g = mergeGeometries(parts.map((x) => x.deleteAttribute('uv') && x));
  return g;
}

export async function buildLife(ctx, veg) {
  const { scene, world, quality, tracks } = ctx;
  const { F } = veg;
  const rnd = mulberry(777);
  const lite = !!quality.aiLod;
  const group = new THREE.Group();
  group.name = 'kaiele-life';
  scene.add(group);
  const birds = [];
  const seaward = (x, z) => {
    const c = F.cellOf(x, z), G = F.G;
    const gx = F.coast[Math.min(c + 1, F.coast.length - 1)] - F.coast[Math.max(c - 1, 0)];
    const gz = F.coast[Math.min(c + G, F.coast.length - 1)] - F.coast[Math.max(c - G, 0)];
    const L = Math.hypot(gx, gz) || 1;
    return [-gx / L, -gz / L];
  };

  // ---------------------------------------------------------------- seabirds over the coast
  for (const t of tracks) {
    if (t.id !== 'kahakai' && t.id !== 'palikai') continue;
    const step = lite ? 420 : 260;
    for (let i = 0; i < t.n; i += step) {
      const c = t.c[i];
      if (F.coast[F.cellOf(c[0], c[2])] > 220) continue;
      const [sx, sz] = seaward(c[0], c[2]);
      const off = 50 + rnd() * 60;
      const cx = c[0] + sx * off, cz = c[2] + sz * off;
      const cliff = t.id === 'palikai' && c[1] > 40;
      const n = (lite ? 3 : 5) + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const white = rnd() < (cliff ? 0.8 : 0.45);
        birds.push({ kind: 'sea', cx: cx + (rnd() - 0.5) * 40, cz: cz + (rnd() - 0.5) * 40, r: 25 + rnd() * 55, w: (0.15 + rnd() * 0.15) * (rnd() < 0.5 ? -1 : 1),
          ph: rnd() * 6.28, alt: cliff ? 25 + rnd() * 70 : 12 + rnd() * 45, s: 0.55 + rnd() * 0.35,
          col: white ? [0.95, 0.95, 0.92] : [0.2, 0.19, 0.18], flapPh: rnd() * 10 });
      }
    }
  }

  // ---------------------------------------------------------------- egrets in the jungle canopy
  const sites = [];
  const wl = tracks.find((t) => t.id === 'wailele');
  if (wl) {
    const rows = veg.tunnelRows.length ? veg.tunnelRows : [];
    const pickRows = [];
    for (let i = 60; i < wl.n; i += lite ? 420 : 260) pickRows.push(i);
    for (const i of pickRows) {
      const f = wl.frame(i);
      const side = rnd() < 0.5 ? -1 : 1, lat = side * (wl.width / 2 + 9 + rnd() * 8);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      if (F.waterAt(x, z) < 3) continue;
      const top = F.groundAt(x, z) + (rows.includes(i) ? 22 : 16) + rnd() * 4;
      const site = { x, z, y: top, row: i, out: [f.nx * side, f.nz * side], t: -1, cool: 0, birds: [] };
      const n = lite ? 6 : 11;
      for (let k = 0; k < n; k++) {
        const b = { kind: 'egret', site, px: x + (rnd() - 0.5) * 9, pz: z + (rnd() - 0.5) * 9, py: top + (rnd() - 0.5) * 2, ph: rnd() * 6.28,
          r: 18 + rnd() * 22, w: 0.5 + rnd() * 0.25, alt: 14 + rnd() * 14, delay: rnd() * 0.6, s: 0.42 + rnd() * 0.1, col: [0.97, 0.96, 0.92], flapPh: rnd() * 10 };
        site.birds.push(b);
        birds.push(b);
      }
      sites.push(site);
    }
  }

  const bmesh = new THREE.InstancedMesh(birdGeometry(), birdMaterial(), Math.max(1, birds.length));
  bmesh.frustumCulled = false;
  bmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const flapA = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, birds.length) * 2), 2).setUsage(THREE.DynamicDrawUsage);
  bmesh.geometry.setAttribute('aFlap', flapA);
  birds.forEach((b, i) => bmesh.setColorAt(i, new THREE.Color(...b.col)));
  bmesh.count = birds.length;
  group.add(bmesh);

  // ---------------------------------------------------------------- ghost crabs on the black sand
  const crabs = [];
  const kh = tracks.find((t) => t.id === 'kahakai');
  if (kh) {
    const want = lite ? 40 : 90;
    for (let tries = 0; crabs.length < want && tries < 4000; tries++) {
      const i = Math.floor(rnd() * kh.n);
      const f = kh.frame(i);
      const lat = (rnd() < 0.5 ? -1 : 1) * (kh.width / 2 + 3 + rnd() * 22);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      const h = world.heightAt(x, z);
      if (h < 0.45 || h > 4 || F.coast[F.cellOf(x, z)] > 60) continue;
      crabs.push({ hx: x, hz: z, x, z, yaw: rnd() * 6.28, state: 'idle', t: rnd() * 4, vx: 0, vz: 0, sink: 0, s: 0.8 + rnd() * 0.5 });
    }
  }
  const cmat = new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.6, metalness: 0 });
  cmat.userData.wx = 'object';
  const cmesh = new THREE.InstancedMesh(crabGeometry(), cmat, Math.max(1, crabs.length));
  cmesh.frustumCulled = false;
  cmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cmesh.count = 0;
  cmesh.castShadow = true;
  group.add(cmesh);

  const cars = [];
  return {
    update(t, dt, camera, race) {
      const cam = camera?.position;
      if (!cam) return;
      cars.length = 0;
      if (race) for (const st of race.cars) if (st.v?.group) cars.push(st.v.group.position);
      dt = Math.min(dt, 0.1);
      // egret sites: a truck close by puts the flock up; they wheel over the canopy and settle again
      for (const st of sites) {
        if (st.t < 0) {
          st.cool -= dt;
          if (st.cool <= 0 && cars.some((c) => (c.x - st.x) ** 2 + (c.z - st.z) ** 2 < 38 * 38)) st.t = 0;
        } else {
          st.t += dt;
          if (st.t > 22) { st.t = -1; st.cool = 6; }
        }
      }
      birds.forEach((b, i) => {
        let x, y, z, yaw, bank = 0, flap = 0;
        if (b.kind === 'sea') {
          // soaring circles, a few wing beats now and then
          const a = b.ph + t * b.w * (60 / (b.r + 30));
          x = b.cx + Math.cos(a) * b.r; z = b.cz + Math.sin(a) * b.r;
          y = b.alt + Math.sin(t * 0.3 + b.ph * 3) * 5;
          const dx = -Math.sin(a) * Math.sign(b.w), dz = Math.cos(a) * Math.sign(b.w);
          yaw = Math.atan2(dx, dz);
          bank = -0.45 * Math.sign(b.w);
          flap = Math.sin(t * 0.5 + b.flapPh) > 0.75 ? 1 : 0;
        } else {
          const st = b.site, tt = st.t - b.delay;
          if (st.t < 0 || tt <= 0) {
            // perched on the canopy top, folded
            x = b.px; y = b.py; z = b.pz; yaw = b.ph; flap = 0;
            m4.compose(p.set(x, y, z), q.setFromEuler(e.set(0, yaw, 0, 'YXZ')), s.set(b.s * 0.45, b.s * 0.9, b.s * 0.8));
            bmesh.setMatrixAt(i, m4);
            flapA.setXY(i, b.flapPh, 0);
            return;
          }
          // burst up and out from the track, wheel round over the trees, glide back down to the perch
          const w = ss(0, 2.2, tt) * (1 - ss(17, 21.5, tt));
          const a = b.ph + tt * b.w;
          const ox = st.x + st.out[0] * 30 + Math.cos(a) * b.r, oz = st.z + st.out[1] * 30 + Math.sin(a) * b.r;
          const burst = Math.exp(-tt * 0.8) * 12;
          x = b.px + (ox - b.px) * w + st.out[0] * burst; z = b.pz + (oz - b.pz) * w + st.out[1] * burst;
          y = b.py + (b.alt + Math.sin(tt * 0.9 + b.ph) * 3) * w + (1 - Math.exp(-tt * 2)) * 3 * (1 - w);
          const dx = -Math.sin(a) * w + st.out[0] * (1 - w) + 0.001, dz = Math.cos(a) * w + st.out[1] * (1 - w);
          yaw = Math.atan2(dx, dz);
          bank = -0.35 * w;
          flap = tt < 4 || tt > 16 ? 1 : 0.4;
        }
        m4.compose(p.set(x, y, z), q.setFromEuler(e.set(0, yaw, bank, 'YXZ')), s.setScalar(b.s));
        bmesh.setMatrixAt(i, m4);
        flapA.setXY(i, b.flapPh, flap);
      });
      bmesh.instanceMatrix.needsUpdate = true;
      flapA.needsUpdate = true;

      // crabs: only near the camera
      let n = 0;
      for (const c of crabs) {
        const dc = (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2;
        c.t -= dt;
        // nearest truck
        let td = 1e9, tx = 0, tz = 0;
        for (const v of cars) { const d = (v.x - c.x) ** 2 + (v.z - c.z) ** 2; if (d < td) { td = d; tx = v.x; tz = v.z; } }
        if (c.state === 'hidden') {
          if (c.t <= 0 && td > 30 * 30) { c.state = 'idle'; c.x = c.hx + (rnd() - 0.5) * 6; c.z = c.hz + (rnd() - 0.5) * 6; c.sink = 1; c.t = 2 + rnd() * 4; }
          else continue;
        }
        if (c.state !== 'flee' && td < 15 * 15) {
          // run sideways away from the truck
          const L = Math.sqrt(td) || 1;
          const sp = 4.5 + rnd() * 2;
          c.vx = (c.x - tx) / L * sp; c.vz = (c.z - tz) / L * sp;
          c.state = 'flee'; c.t = 0.8 + rnd() * 0.8;
          c.yaw = Math.atan2(c.vx, c.vz) + Math.PI / 2;
        }
        if (c.state === 'flee') {
          c.x += c.vx * dt; c.z += c.vz * dt;
          if (c.t <= 0 || td < 2) { c.state = 'dive'; c.t = 0.35; }
        } else if (c.state === 'dive') {
          c.sink = Math.min(1.5, c.sink + dt * 4);
          if (c.t <= 0) { c.state = 'hidden'; c.t = 12 + rnd() * 20; continue; }
        } else {
          // idle: little sideways dashes, then still
          c.sink = Math.max(0, c.sink - dt * 2);
          if (c.t <= 0) {
            const a = rnd() * 6.28, sp = 1 + rnd() * 1.5;
            c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.t = 0.3 + rnd() * 0.6; c.yaw = a;
            c.dash = c.t;
          }
          if (c.dash > 0) { c.dash -= dt; c.x += c.vx * dt; c.z += c.vz * dt; if (c.dash <= 0) c.t = 1 + rnd() * 5; }
          if ((c.x - c.hx) ** 2 + (c.z - c.hz) ** 2 > 100) { c.vx = (c.hx - c.x) * 0.3; c.vz = (c.hz - c.z) * 0.3; }
        }
        if (dc > 160 * 160) continue;
        const gy = F.groundAt(c.x, c.z);
        if (gy < 0.15) { c.state = 'hidden'; c.t = 5; continue; }
        const bob = c.state === 'flee' ? Math.abs(Math.sin(t * 40 + c.hx)) * 0.02 : 0;
        m4.compose(p.set(c.x, gy - c.sink * 0.12 + bob, c.z), q.setFromAxisAngle(s.set(0, 1, 0), c.yaw), s.setScalar(c.s));
        cmesh.setMatrixAt(n++, m4);
      }
      cmesh.count = n;
      cmesh.instanceMatrix.needsUpdate = true;
    },
  };
}
