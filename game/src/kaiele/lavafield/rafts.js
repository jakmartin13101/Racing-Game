import * as THREE from 'three';
import { mulberry } from '../../world.js';
import { riverPaths } from './common.js';

// Cooling crust plates riding the lava rivers: dark rafts of crust, glowing at their torn edges, that form,
// drift down with the flow (at the speed the river shader scrolls its surface), turn slowly, then crack apart
// and founder. One InstancedMesh for all of them.

function plateGeometry(seed) {
  const r = mulberry(seed);
  const K = 11, rad = [];
  for (let k = 0; k < K; k++) rad.push(0.75 + r() * 0.45);
  const pos = [], edge = [], uv = [], idx = [];
  // top: a fan from a raised centre, each rim vertex jittered; then a skirt down under the surface
  pos.push(0, 0.16, 0); edge.push(0); uv.push(0.5, 0.5);
  for (let k = 0; k < K; k++) {
    const a = k / K * Math.PI * 2, x = Math.cos(a) * rad[k], z = Math.sin(a) * rad[k] * 0.8;
    pos.push(x * 0.55, 0.12 + r() * 0.05, z * 0.55); edge.push(0.45); uv.push(0.5 + x * 0.25, 0.5 + z * 0.25);
    pos.push(x, 0.05 + r() * 0.06, z); edge.push(1); uv.push(0.5 + x * 0.5, 0.5 + z * 0.5);
    pos.push(x * 1.04, -0.3, z * 1.04); edge.push(1.3); uv.push(0.5 + x * 0.52, 0.5 + z * 0.52);
  }
  for (let k = 0; k < K; k++) {
    const i = 1 + k * 3, j = 1 + ((k + 1) % K) * 3;
    idx.push(0, j, i);
    idx.push(i, j, i + 1, j, j + 1, i + 1);
    idx.push(i + 1, j + 1, i + 2, j + 1, j + 2, i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildRafts({ world, quality, M, group, rnd }) {
  const lite = !!quality.aiLod;
  const paths = riverPaths(world);
  const rafts = [];
  for (const p of paths) {
    const main = p.rv.id === 'ahi';
    const n = Math.floor(p.len / (main ? 11 : 13) * (lite ? 0.55 : 1));
    for (let k = 0; k < n; k++) rafts.push(newRaft(p, rnd, rnd() * p.len, main, true));
  }
  const NF = lite ? 60 : 140;
  const frags = [];
  for (let k = 0; k < NF; k++) frags.push({ on: false });
  const N = rafts.length + NF;
  const mat = new THREE.MeshStandardMaterial({ map: M.lava.a, normalMap: M.lava.n, roughness: 0.85, metalness: 0, vertexColors: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float edge; varying float vEdge; varying vec3 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = edge;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEdge; varying vec3 vRW;')
      .replace('#include <color_fragment>', `
// instance colour: r = crust brightness, g = heat (new crust glows, old crust only at its torn rim)
float rHeat = vColor.g;
diffuseColor.rgb *= vec3(0.28, 0.25, 0.24) * vColor.r;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // the rim glows only where it is torn and the melt wells up against it; the skirt below the melt line is hidden
  float torn = smoothstep(0.45, 0.7, texture2D(map, vRW.xz / 2.3 + 0.5).g);
  float rim = smoothstep(0.85, 1.05, vEdge) * (1.0 - smoothstep(1.1, 1.3, vEdge)) * (0.25 + 0.75 * torn);
  float crk = smoothstep(0.66, 0.72, texture2D(map, vRW.xz / 3.0).r) * (1.0 - rim);
  totalEmissiveRadiance += vec3(1.0, 0.26, 0.035) * (rim * (0.5 + 1.6 * rHeat) + crk * rHeat * 1.2 + rHeat * rHeat * 0.25);
}`);
  };
  mat.customProgramCacheKey = () => 'kaiele-raft';
  const im = new THREE.InstancedMesh(plateGeometry(7), mat, N);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  im.receiveShadow = true;
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) im.setColorAt(i, col.setRGB(1, 0, 0));
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  group.add(im);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const smp = {};
  const qS = new THREE.Quaternion();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (i, path, s, a, size, yaw, sink, heat, bright) => {
    path.sample(s, smp);
    const lat = a * smp.w;
    const x = smp.x - smp.tz * lat, z = smp.z + smp.tx * lat;
    // the ribbon dips a little across its width (see buildLava)
    const y = smp.y - a * a * 0.4 + 0.06 - sink;
    // tilted down the slope a touch
    path.sample(s + 3, smp);
    const slope = Math.atan2(smp.y - (y + sink - 0.06 + a * a * 0.4), 3);
    e.set(0, yaw, 0, 'YXZ'); q.setFromEuler(e);
    const qs = qS.setFromAxisAngle(pos.set(-smp.tz, 0, smp.tx), slope);
    q.premultiply(qs);
    sc.set(size, size * 0.8, size);
    m4.compose(pos.set(x, y, z), q, sc);
    im.setMatrixAt(i, m4);
    im.setColorAt(i, col.setRGB(bright, heat, 0));
  };
  const spawnFrags = (r) => {
    let made = 0;
    for (const f of frags) {
      if (f.on) continue;
      const ang = rnd() * 6.3;
      Object.assign(f, { on: true, path: r.path, s: r.s + Math.cos(ang) * r.size * 0.4, a: r.a, da: Math.sin(ang) * 0.025, size: r.size * (0.35 + rnd() * 0.25),
        yaw: r.yaw + rnd() * 3, spin: (rnd() - 0.5) * 0.6, age: 0, life: 2.5 + rnd() * 2, bright: r.bright });
      if (++made >= 2 + Math.floor(rnd() * 2)) break;
    }
  };
  let tick = 0;
  return {
    count: rafts.length,
    update(t, dt, cam) {
      dt = Math.min(dt, 0.1);
      const far = (tick++ & 3) !== 0; // far rafts move on every 4th frame
      rafts.forEach((r, i) => {
        r.path.sample(r.s, smp);
        const d = Math.abs(smp.x - cam.x) + Math.abs(smp.z - cam.z);
        if (d > 900 && far) return;
        const step = d > 900 ? dt * 4 : dt;
        const spd = smp.spd * (1 - 0.7 * r.a * r.a);
        r.s += spd * step;
        r.age += step;
        r.yaw += r.spin * step;
        if (r.age > r.life || r.s > r.path.len - 4) {
          if (r.s < r.path.len - 4 && d < 600) spawnFrags(r);
          Object.assign(r, newRaft(r.path, rnd, rnd() * r.path.len * 0.95, r.main, false));
        }
        const grow = Math.min(1, r.age / 2.5);
        const heat = Math.max(0, 1 - r.age / 8) * 0.9 + 0.1;
        place(i, r.path, r.s, r.a, r.size * (0.3 + 0.7 * grow), r.yaw, 0, heat, r.bright);
      });
      frags.forEach((f, k) => {
        const i = rafts.length + k;
        if (!f.on) { im.setMatrixAt(i, zero); return; }
        f.path.sample(f.s, smp);
        f.s += smp.spd * (1 - 0.7 * f.a * f.a) * dt;
        f.a = Math.max(-0.9, Math.min(0.9, f.a + f.da * dt * 10));
        f.age += dt;
        f.yaw += f.spin * dt;
        const k2 = f.age / f.life;
        if (k2 >= 1 || f.s > f.path.len - 2) { f.on = false; im.setMatrixAt(i, zero); return; }
        // the pieces tip and founder into the melt, glowing as they go
        place(i, f.path, f.s, f.a, f.size * (1 - k2 * 0.6), f.yaw, k2 * 0.35, 0.3 + k2 * 0.7, f.bright);
      });
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
    },
  };
}

function newRaft(path, rnd, s, main, initial) {
  return {
    path, main, s, a: (rnd() - 0.5) * 1.5, size: (main ? 1.6 : 1.1) + rnd() * (main ? 3.2 : 1.8),
    yaw: rnd() * 6.3, spin: (rnd() - 0.5) * 0.12, age: initial ? rnd() * 20 : 0, life: 14 + rnd() * 30, bright: 0.75 + rnd() * 0.5,
  };
}
