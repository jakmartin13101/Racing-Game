import * as THREE from 'three';
import { mulberry, vnoise } from '../../world.js';
import { smoothstep } from './common.js';

// 'A'a clinker: jagged, spiny blocks of torn crust, piled thick where the 'a'a mask is high, a few blocks and
// slabs of broken crust on the pahoehoe, all kept off the roads. Chunked InstancedMeshes; in each chunk the
// instances are sorted biggest first, so drawing fewer of them with distance drops the small stuff first.

// a clinker block: a squashed, noise-torn icosahedron with flat facets and sharp spines
export function clinkerGeometry(seed, detail = 1, spike = 0.45) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = mulberry(seed);
  const o = [r() * 50, r() * 50, r() * 50];
  // shared vertices must move together: displace by position so the faces stay closed
  const moved = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let d = moved.get(k);
    if (d === undefined) {
      const n1 = vnoise(x * 1.3 + o[0], y * 1.3 + o[1], z * 1.3 + o[2]);
      const n2 = vnoise(x * 3.1 + o[1], y * 3.1 + o[2], z * 3.1 + o[0]);
      // spines: a few vertices thrust out, most pulled in
      const sp = r() < 0.18 ? spike * (0.5 + r()) : -r() * 0.12;
      d = 1 + n1 * 0.35 + n2 * 0.18 + sp;
      moved.set(k, d);
    }
    p.setXYZ(i, x * d * 1.1, y * d * 0.72, z * d);
  }
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals(); // non-indexed: flat facets
  // planar uvs per face from its dominant axis (box projection) so the rock texture never stretches
  const P = ng.attributes.position, uv = new Float32Array(P.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      const [u, w] = ax > ay && ax > az ? [v.z, v.y] : ay > az ? [v.x, v.z] : [v.x, v.y];
      uv[(i + k) * 2] = u * 0.5; uv[(i + k) * 2 + 1] = w * 0.5;
    }
  }
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ng.translate(0, 0.25, 0); // sit partly buried
  return ng;
}

export function rockMaterial(tex, M) {
  const mat = new THREE.MeshStandardMaterial({ map: tex.clinkerA, roughness: 0.92, metalness: 0, envMapIntensity: 0.7 });
  const u = { tClN: { value: tex.clinkerN }, uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRP; varying vec2 vRuv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRuv = uv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tClN; varying vec3 vRP; varying vec2 vRuv;')
      .replace('#include <map_fragment>', /* glsl */`
vec4 tc = texture2D(map, vRuv);
// darken and cool the scanned rock to fresh basalt; rusty oxidised faces on some blocks (instance colour)
vec3 rc = tc.rgb * vec3(0.5, 0.47, 0.45);
diffuseColor.rgb *= rc;
float rAO = texture2D(tClN, vRuv).b;
// the undersides sit in the rubble's shadow
diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(-0.2, 0.6, vRP.y)) * mix(0.6, 1.0, rAO);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 tnr = texture2D(tClN, vRuv).xyz * 2.0 - 1.0;
  vec3 dx = dFdx(vViewPosition), dy = dFdy(vViewPosition);
  vec2 ux = dFdx(vRuv), uy = dFdy(vRuv);
  vec3 T = normalize(dx * uy.y - dy * ux.y), B = normalize(-dx * uy.x + dy * ux.x);
  normal = normalize(normal + (T * tnr.x + B * tnr.y) * 0.9);
}`);
  };
  mat.customProgramCacheKey = () => 'kaiele-clinker';
  return mat;
}

export function buildRubble({ world, quality, masks, trackGrid, lavaGrid, features, M, tex, group, rnd }) {
  const q = quality.name;
  const lite = !!quality.aiLod;
  const mat = rockMaterial(tex, M);
  // budgets: small clinker near the roads, blocks out over the field, big boulders/tumuli slabs to the horizon
  const NB = { low: 5000, medium: 9000, high: 16000, ultra: 26000 }[q] ?? 9000;
  const geos = [clinkerGeometry(11, 1, 0.5), clinkerGeometry(23, 1, 0.35), clinkerGeometry(37, lite ? 0 : 1, 0.25)];
  const CH = lite ? 448 : 320;
  const chunks = new Map();
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const nrm = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion();
  const col = new THREE.Color();
  const feat = features.filter((f) => f.rubble);
  const add = (x, z, s, kind) => {
    const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
    let c = chunks.get(key);
    if (!c) chunks.set(key, (c = { list: [], x: (Math.floor(x / CH) + 0.5) * CH, z: (Math.floor(z / CH) + 0.5) * CH }));
    world.normalAt(x, z, nrm);
    e.set((rnd() - 0.5) * 0.7, rnd() * 6.3, (rnd() - 0.5) * 0.7);
    qt.setFromEuler(e);
    qa.setFromUnitVectors(up, nrm.lerp(up, 0.4).normalize());
    qt.premultiply(qa);
    const flat = kind === 2 ? 0.45 + rnd() * 0.3 : 0.7 + rnd() * 0.5;
    sc.set(s * (0.8 + rnd() * 0.5), s * flat, s * (0.8 + rnd() * 0.5));
    p.set(x, world.heightAt(x, z) - s * 0.2, z);
    m4.compose(p, qt, sc);
    // dark grey-black basalt; some blocks rust-brown or with a faint purple-grey sheen
    const t = rnd();
    if (t < 0.12) col.setRGB(1.25, 0.82, 0.62); else if (t < 0.3) col.setRGB(0.85, 0.85, 0.95); else col.setRGB(0.95 + rnd() * 0.1, 0.95, 0.93);
    col.multiplyScalar(0.8 + rnd() * 0.45);
    c.list.push({ m: m4.clone(), c: col.clone(), s, g: kind });
  };
  // candidate spots: around the tracks (most), round the features, and anywhere on the field (few, big)
  const tracks = world.data.tracks;
  let placed = 0;
  for (let k = 0; placed < NB && k < NB * 8; k++) {
    let x, z, near;
    const r = rnd();
    if (r < 0.72) {
      const t = tracks[Math.floor(rnd() * tracks.length)];
      const C = t.centre, i = Math.floor(rnd() * C.length), c0 = C[i], c1 = C[Math.min(i + 1, C.length - 1)];
      const tx = c1[0] - c0[0], tz = c1[2] - c0[2], L = Math.hypot(tx, tz) || 1;
      const lat = (rnd() < 0.5 ? -1 : 1) * (11 + Math.pow(rnd(), 1.6) * 110);
      x = c0[0] - tz / L * lat; z = c0[2] + tx / L * lat;
      near = true;
    } else if (r < 0.8 && feat.length) {
      const f = feat[Math.floor(rnd() * feat.length)], a = rnd() * 6.3, d = f.r0 + Math.pow(rnd(), 1.5) * f.r;
      x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d;
      near = true;
    } else {
      x = -600 + rnd() * 2600; z = -60 + rnd() * 2060;
      near = false;
    }
    const fr = masks.fresh(x, z);
    if (fr < 0.2) continue;
    const aa = masks.aa(x, z);
    const dR = trackGrid.dist(x, z, 40);
    if (dR < 11) continue;
    // nothing in the lava itself
    const dl = lavaGrid.dist(x, z, 40);
    if (lavaGrid.best && dl < lavaGrid.best[2] + 2.5) continue;
    if (world.heightAt(x, z) < 1.5) continue;
    world.normalAt(x, z, nrm);
    if (nrm.y < 0.6) continue;
    // 'a'a: dense; pahoehoe: only now and then (slabs of broken crust, the odd block)
    const dens = (0.08 + 0.92 * smoothstep(0.25, 0.7, aa)) * fr;
    if (rnd() > dens) continue;
    // clinker sizes: lots of small, some big; bigger blocks further from the road
    let s = 0.25 + Math.pow(rnd(), 3.2) * (aa > 0.4 ? 2.2 : 1.4);
    if (!near) s = 0.9 + Math.pow(rnd(), 2) * 2.6;
    s *= smoothstep(10, 22, dR) * 0.6 + 0.4;
    const kind = aa > 0.4 ? 0 : 2;
    add(x, z, s, kind);
    // 'a'a lies in heaps: a few more pieces round each block
    if (aa > 0.45 && near) {
      const nb = 1 + Math.floor(rnd() * (lite ? 2 : 4));
      for (let j = 0; j < nb && placed < NB; j++) {
        const a = rnd() * 6.3, d = s * (0.8 + rnd() * 1.8);
        const x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d;
        if (trackGrid.dist(x2, z2, 12) < 10.5) continue;
        add(x2, z2, s * (0.3 + rnd() * 0.5), 0);
        placed++;
      }
    }
    placed++;
  }
  // build: per chunk, one InstancedMesh per geometry, biggest first
  const meshes = [];
  let total = 0;
  for (const c of chunks.values()) {
    for (let gk = 0; gk < geos.length; gk++) {
      const l = c.list.filter((o) => o.g === gk).sort((a, b) => b.s - a.s);
      if (!l.length) continue;
      // the 'a'a clinker alternates between two block shapes chunk by chunk
      const geo = gk === 0 && ((Math.floor(c.x / CH) + Math.floor(c.z / CH)) & 1) ? geos[1] : geos[gk];
      const im = new THREE.InstancedMesh(geo, mat, l.length);
      l.forEach((o, i) => { im.setMatrixAt(i, o.m); im.setColorAt(i, o.c); });
      im.castShadow = !lite; im.receiveShadow = true;
      im.computeBoundingSphere();
      // size of the n-th instance, to decide how many to draw at a distance
      im.userData.sizes = l.map((o) => o.s);
      im.userData.cx = c.x; im.userData.cz = c.z;
      group.add(im);
      meshes.push(im);
      total += l.length;
    }
  }
  // LOD: a rock of size s is drawn out to about s * K metres
  const K = { low: 160, medium: 230, high: 320, ultra: 420 }[q] ?? 230;
  let tick = 0;
  return {
    total, meshes: meshes.length,
    update(cam) {
      if ((tick++ & 7) !== 0) return; // every 8th frame is plenty
      for (const im of meshes) {
        const d = Math.max(0, Math.hypot(im.userData.cx - cam.x, im.userData.cz - cam.z) - CH * 0.7);
        const smin = d / K;
        const sz = im.userData.sizes;
        // binary search: sizes descend
        let lo = 0, hi = sz.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (sz[m] >= smin) lo = m + 1; else hi = m; }
        im.count = lo;
        im.visible = lo > 0;
      }
    },
  };
}
