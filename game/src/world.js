import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;

export async function loadWorld() {
  const [hb, track] = await Promise.all([
    fetch(`${BASE}world/height.bin`).then((r) => r.arrayBuffer()),
    fetch(`${BASE}world/track.json`).then((r) => r.json()),
  ]);
  const heights = new Float32Array(hb);
  const g = track.grid;
  const res = track.extent / (g - 1);
  const half = track.extent / 2;
  const world = { heights, track, grid: g, res, half, extent: track.extent };
  world.heightAt = (x, z) => {
    const fx = (x + half) / res, fz = (z + half) / res;
    let ix = Math.floor(fx), iz = Math.floor(fz);
    ix = Math.min(Math.max(ix, 0), g - 2);
    iz = Math.min(Math.max(iz, 0), g - 2);
    const tx = fx - ix, tz = fz - iz;
    const i = iz * g + ix;
    const a = heights[i] * (1 - tx) + heights[i + 1] * tx;
    const b = heights[i + g] * (1 - tx) + heights[i + g + 1] * tx;
    return a * (1 - tz) + b * tz;
  };
  world.normalAt = (x, z, out = new THREE.Vector3()) => {
    const e = res;
    const hx = world.heightAt(x + e, z) - world.heightAt(x - e, z);
    const hz = world.heightAt(x, z + e) - world.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  };
  return world;
}

// ---------------------------------------------------------------- textures
const loader = new THREE.TextureLoader();
let maxAniso = 8;
export function setAniso(n) { maxAniso = n; }
function tex(name, srgb = false) {
  const t = loader.load(`${BASE}textures/${name}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function loadMaterials() {
  const set = (n) => ({ a: tex(`${n}_albedo.jpg`, true), n: tex(`${n}_normal.jpg`), o: tex(`${n}_orm.jpg`) });
  return {
    ash: set('ext/track'), sco: set('ext/gravel'), bas: set('ext/cliff'), lava: set('ext/lava'),
    burnt: set('ext/burnt'), heat: tex('ext/lava_heat.jpg'), molten: tex('ext/lava_molten.jpg', true), detail: tex('detail_normal.jpg'), noise: tex('noise.png'),
    smoke: (() => { const t = loader.load(`${BASE}textures/smoke.png`); return t; })(),
  };
}

// Shared GLSL: anti-tiled sampling and triplanar helpers
const GLSL_COMMON = /* glsl */`
uniform sampler2D tNoise;
vec4 texAT(sampler2D t, vec2 uv, float n) {
  // two decorrelated lookups blended by low-frequency noise breaks visible tiling
  vec4 a = texture(t, uv);
  vec4 b = texture(t, uv * 0.43 + vec2(0.37, 0.71));
  return mix(a, b, smoothstep(0.35, 0.65, n));
}
vec3 unpackN(vec4 c) { return c.xyz * 2.0 - 1.0; }
// Reoriented top-projection: tangent normal sampled with uv = world.xz -> world normal
vec3 topToWorld(vec3 tn, vec3 N) {
  vec3 t = vec3(tn.xy + N.xz, abs(tn.z) * N.y);
  return normalize(t.xzy);
}
`;

// ---------------------------------------------------------------- terrain
export function buildTerrain(world, M, quality) {
  const { extent, half } = world;
  // non-uniform grid: dense where the track and volcano are, coarse at the horizon
  const inner = 760, step = quality.terrainStep;
  const axis = [];
  const outerN = 90;
  for (let i = 0; i < outerN; i++) axis.push(-half + (half - inner) * (i / outerN));
  for (let v = -inner; v < inner; v += step) axis.push(v);
  for (let i = 0; i <= outerN; i++) axis.push(inner + (half - inner) * (i / outerN));
  const n = axis.length;
  const pos = new Float32Array(n * n * 3);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const z = axis[j];
    for (let i = 0; i < n; i++) {
      const x = axis[i];
      pos[k++] = x; pos[k++] = world.heightAt(x, z); pos[k++] = z;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  // world-space normal map baked from the 1.5 m heightfield
  const NS = 2048;
  const nd = new Uint8Array(NS * NS * 4);
  const tmp = new THREE.Vector3();
  for (let j = 0; j < NS; j++) {
    const z = -half + (j + 0.5) * extent / NS;
    for (let i = 0; i < NS; i++) {
      const x = -half + (i + 0.5) * extent / NS;
      world.normalAt(x, z, tmp);
      const o = (j * NS + i) * 4;
      nd[o] = (tmp.x * 0.5 + 0.5) * 255; nd[o + 1] = (tmp.y * 0.5 + 0.5) * 255;
      nd[o + 2] = (tmp.z * 0.5 + 0.5) * 255; nd[o + 3] = 255;
    }
  }
  const ntex = new THREE.DataTexture(nd, NS, NS, THREE.RGBAFormat);
  ntex.magFilter = THREE.LinearFilter; ntex.minFilter = THREE.LinearMipmapLinearFilter;
  ntex.generateMipmaps = true; ntex.needsUpdate = true;
  const mask = loader.load(`${BASE}world/masks.png`);

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const uniforms = {
    tNH: { value: ntex }, tMask: { value: mask }, tNoise: { value: M.noise },
    ashA: { value: M.ash.a }, ashN: { value: M.ash.n }, ashO: { value: M.ash.o },
    scoA: { value: M.sco.a }, scoN: { value: M.sco.n }, scoO: { value: M.sco.o },
    basA: { value: M.bas.a }, basN: { value: M.bas.n }, basO: { value: M.bas.o },
    lavA: { value: M.lava.a }, lavN: { value: M.lava.n }, tDetail: { value: M.detail },
    uExtent: { value: extent },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW;
uniform sampler2D tNH, tMask, ashA, ashN, ashO, scoA, scoN, scoO, basA, basN, basO, lavA, lavN, tDetail;
uniform float uExtent;
${GLSL_COMMON}
vec3 gN; float gAO; vec3 gEm;`)
      .replace('#include <map_fragment>', /* glsl */`
vec2 wuv = vW.xz / uExtent + 0.5;
vec3 Ng = normalize(texture(tNH, wuv).xyz * 2.0 - 1.0);
vec4 msk = texture(tMask, wuv);
vec3 nz = texture(tNoise, vW.xz / 240.0).rgb;
vec3 nz2 = texture(tNoise, vW.xz / 37.0).rgb;
float slope = 1.0 - Ng.y;
float camD = length(vW - cameraPosition);

// ground layers (top projected)
vec2 uvS = vW.xz / 3.0;
vec2 uvA = vW.xz / 6.0;
vec4 sA = texAT(scoA, uvS, nz.g); vec4 sO = texAT(scoO, uvS, nz.g); vec3 sN = unpackN(texAT(scoN, uvS, nz.g));
vec4 aA = texAT(ashA, uvA, nz.b); vec4 aO = texAT(ashO, uvA, nz.b); vec3 aN = unpackN(texAT(ashN, uvA, nz.b));
// grey wind-blown ash higher up the cone
float hAsh = smoothstep(120.0, 260.0, vW.y + nz.r * 80.0);
vec3 ashGrey = vec3(dot(sA.rgb, vec3(0.3,0.5,0.2))) * vec3(1.05, 1.0, 0.96) * 1.25;
sA.rgb *= vec3(0.42, 0.38, 0.35);
vec3 groundA = mix(sA.rgb, ashGrey, hAsh * 0.6);
// patches of compacted ash dirt break up the cinder
float patchW = smoothstep(0.55, 0.75, nz.r * 0.7 + nz2.g * 0.5);
float wRoad = smoothstep(0.05, 0.6, msk.g);
float wDirt = max(patchW * 0.7, wRoad);
groundA = mix(groundA, aA.rgb, wDirt);
vec3 groundN = normalize(mix(sN, aN, wDirt));
vec2 groundRO = mix(sO.rg, aO.rg, wDirt);

// triplanar basalt on steep faces
vec3 bw = pow(abs(Ng), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
float rs = 1.0 / 7.0;
vec2 uX = vW.zy * rs, uY = vW.xz * rs, uZ = vW.xy * rs;
vec3 bA = texture(basA, uX).rgb * bw.x + texture(basA, uY).rgb * bw.y + texture(basA, uZ).rgb * bw.z;
vec2 bO = texture(basO, uX).rg * bw.x + texture(basO, uY).rg * bw.y + texture(basO, uZ).rg * bw.z;
vec3 tnX = unpackN(texture(basN, uX)), tnY = unpackN(texture(basN, uY)), tnZ = unpackN(texture(basN, uZ));
tnX = vec3(tnX.xy + Ng.zy, abs(tnX.z) * Ng.x);
tnY = vec3(tnY.xy + Ng.xz, abs(tnY.z) * Ng.y);
tnZ = vec3(tnZ.xy + Ng.xy, abs(tnZ.z) * Ng.z);
vec3 rockN = normalize(tnX.zyx * bw.x + tnY.xzy * bw.y + tnZ.xyz * bw.z);
float wRock = smoothstep(0.22, 0.42, slope + (nz2.r - 0.5) * 0.18) * (1.0 - wRoad);

// scorched crust near lava
vec2 uvL = vW.xz / 10.0;
float wBurn = smoothstep(0.1, 0.8, msk.b + (nz2.b - 0.5) * 0.3);
vec3 lA = texture(lavA, uvL).rgb;
vec3 lN = unpackN(texture(lavN, uvL));

vec3 albedo = mix(groundA, bA, wRock);
albedo = mix(albedo, lA, wBurn * (1.0 - wRoad));
// macro tonal variation so the slopes don't read flat at distance
albedo *= mix(0.78, 1.12, nz.g) * mix(0.9, 1.06, nz2.r);

vec3 topN = groundN;
topN = normalize(mix(topN, lN, wBurn * (1.0 - wRoad)));
// close-range micro detail
vec3 dN = unpackN(texture(tDetail, vW.xz / 1.3));
topN = normalize(topN + vec3(dN.xy, 0.0) * 0.35 * (1.0 - smoothstep(10.0, 40.0, camD)));
vec3 wN = topToWorld(topN, Ng);
wN = normalize(mix(wN, rockN, wRock));
gN = wN;
vec2 ro = mix(groundRO, bO, wRock);
gAO = ro.r;
// lava light bounce on nearby ground
gEm = vec3(1.0, 0.3, 0.05) * pow(msk.r, 6.0) * 0.5;
diffuseColor.rgb = albedo;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(ro.g, 0.3, 1.0);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEm;')
      .replace('#include <aomap_fragment>', `
float ambientOcclusion = gAO;
reflectedLight.indirectDiffuse *= ambientOcclusion;
reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, 0.5);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- track surface ribbon
export function buildTrackRibbon(world, M) {
  const c = world.track.centre;
  const W = world.track.width;
  const across = [-1.6, -1.25, -1.0, -0.85, -0.7, -0.55, -0.4, -0.25, -0.12, 0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.25, 1.6];
  const n = c.length;
  const verts = [], uvs = [], idx = [];
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const p = c[i % n], q = c[(i + 1) % n];
    const tx = q[0] - p[0], tz = q[2] - p[2];
    const L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L;
    for (const a of across) {
      const lat = a * W / 2 + 0;
      const x = p[0] + nx * lat, z = p[2] + nz * lat;
      const y = world.heightAt(x, z) + 0.12;
      verts.push(x, y, z);
      uvs.push(s, lat);
    }
    if (i < n) s += Math.hypot(q[0] - p[0], q[2] - p[2]);
  }
  const m = across.length;
  for (let i = 0; i < n; i++) {
    if (c[i][4] && c[(i + 1) % n][4]) continue; // lava gap at the jump
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = a + 1, cc = a + m, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const uniforms = {
    ashA: { value: M.ash.a }, ashN: { value: M.ash.n }, ashO: { value: M.ash.o }, tNoise: { value: M.noise },
    tDetail: { value: M.detail }, uHalfW: { value: W / 2 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec2 vT;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vT = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec2 vT;
uniform sampler2D ashA, ashN, ashO, tDetail; uniform float uHalfW;
${GLSL_COMMON}
vec3 rN; float rAO; float rR;`)
      .replace('#include <map_fragment>', /* glsl */`
float along = vT.x, lat = vT.y;
vec3 nz = texture(tNoise, vec2(along / 300.0, 0.3)).rgb;
vec3 nzf = texture(tNoise, vW.xz / 23.0).rgb;
// racing lines wander slowly along the lap
float wob = (nz.r - 0.5) * 5.0;
float l = lat - wob;
float rut = 0.0, rutD = 0.0;
for (int k = 0; k < 4; k++) {
  float off = (float(k) - 1.5) * 1.75 + (k > 1 ? 0.25 : -0.25);
  float w = 0.32 + 0.12 * nzf.g;
  float g = exp(-pow((l - off) / w, 2.0));
  rut += g;
  rutD += -2.0 * (l - off) / (w * w) * g;
}
float centreWear = exp(-pow(l / 4.5, 2.0));
vec2 uv = vec2(along / 6.0, lat / 6.0 + 0.5);
vec4 A = texAT(ashA, uv, nzf.r);
vec4 O = texAT(ashO, uv, nzf.r);
vec3 tn = unpackN(texAT(ashN, uv, nzf.r));
// packed ruts are darker, smoother; loose material collects outside them
// cool the brown mud toward volcanic grey-brown
vec3 col = mix(A.rgb, vec3(dot(A.rgb, vec3(0.33))) * vec3(1.08, 1.0, 0.93), 0.45) * 1.15;
col *= mix(1.0, 0.8, clamp(rut, 0.0, 1.0) * 0.6) * mix(1.04, 0.94, centreWear);
// fine longitudinal tyre striations inside the ruts
float stri = texture(tNoise, vec2(lat * 1.7, along / 40.0)).r;
col *= mix(1.0, 0.85 + 0.3 * stri, clamp(rut, 0.0, 1.0));
float edge = smoothstep(uHalfW - 1.0, uHalfW + 2.5, abs(lat));
col = mix(col, col * vec3(1.12, 1.05, 1.0), edge * 0.6);
tn = normalize(mix(tn, vec3(0, 0, 1), rut * 0.55));
tn.x += rutD * 0.03 * 0.0; // keep rut normals subtle
vec3 dN = unpackN(texture(tDetail, vW.xz / 1.1));
tn = normalize(tn + vec3(dN.xy, 0.0) * 0.25);
rN = tn; rAO = O.r; rR = mix(O.g, 0.62, rut * 0.6);
diffuseColor.rgb = col;
float fade = 1.0 - smoothstep(uHalfW + 0.5, uHalfW * 1.55, abs(lat) + (nzf.b - 0.5) * 5.0);
diffuseColor.a = fade;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rR;')
      .replace('#include <normal_fragment_maps>', `
// ribbon uv: x along track, y across. Build TBN from screen derivatives.
vec3 q0 = dFdx(vW), q1 = dFdy(vW);
vec2 st0 = dFdx(vT), st1 = dFdy(vT);
vec3 Nw = normalize(cross(q0, q1)); if (Nw.y < 0.0) Nw = -Nw;
vec3 q1p = cross(q1, Nw), q0p = cross(Nw, q0);
vec3 Tt = q1p * st0.x + q0p * st1.x;
vec3 Bt = q1p * st0.y + q0p * st1.y;
float det = max(dot(Tt, Tt), dot(Bt, Bt));
float isc = det == 0.0 ? 0.0 : inversesqrt(det);
vec3 wn = normalize(Tt * isc * rN.x + Bt * isc * rN.y + Nw * rN.z);
normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `
reflectedLight.indirectDiffuse *= rAO;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

// ---------------------------------------------------------------- lava
export function buildLava(world, M) {
  const group = new THREE.Group();
  const lavaUniforms = {
    uTime: { value: 0 }, lavA: { value: M.lava.a }, lavN: { value: M.lava.n }, tHeat: { value: M.heat },
    tNoise: { value: M.noise },
  };
  const makeMat = (flowing) => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, lavaUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec2 vT;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vT = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec2 vT;
uniform float uTime; uniform sampler2D lavA, lavN, tHeat;
${GLSL_COMMON}
vec3 lavaEm; vec3 lavaN;
vec3 blackbody(float t) {
  // 0..1 -> dark red .. orange .. yellow-white
  return vec3(1.0, 0.25, 0.02) * smoothstep(0.0, 0.4, t) + vec3(0.0, 0.45, 0.1) * smoothstep(0.35, 0.8, t)
       + vec3(0.0, 0.25, 0.45) * smoothstep(0.8, 1.0, t);
}`)
        .replace('#include <map_fragment>', /* glsl */`
${flowing
    ? 'vec2 uv1 = vec2(vT.x / 14.0 - uTime * 0.05, vT.y / 14.0); vec2 uv2 = vec2(vT.x / 9.0 - uTime * 0.085, vT.y / 9.0 + 0.3);'
    : 'vec2 uv1 = vW.xz / 18.0 + vec2(uTime * 0.006, 0.0); vec2 uv2 = vW.xz / 11.0 - vec2(0.0, uTime * 0.01);'}
vec3 nz = texture(tNoise, vW.xz / 90.0 + uTime * 0.003).rgb;
float h1 = texture(tHeat, uv1).r, h2 = texture(tHeat, uv2 * 1.3).r;
float hot = max(h1, h2 * 0.85);
// open molten areas where the crust has broken up
float molten = smoothstep(0.5, 0.75, nz.g + ${flowing ? '0.12' : '0.0'});
float heat = clamp(hot + molten * 0.9, 0.0, 1.0);
float pulse = 0.85 + 0.15 * sin(uTime * 1.7 + nz.r * 12.0);
vec3 crust = texture(lavA, uv1).rgb;
diffuseColor.rgb = mix(crust, vec3(0.05), molten);
lavaEm = blackbody(heat) * heat * 9.0 * pulse;
lavaN = unpackN(texture(lavN, uv1));
lavaN = normalize(mix(lavaN, vec3(0,0,1), molten));
`)
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(topToWorld(lavaN, vec3(0,1,0)), 0.0)).xyz);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += lavaEm;');
    };
    return mat;
  };
  const riverMat = makeMat(true);
  for (const rv of world.track.rivers) {
    const pts = rv.points;
    const verts = [], uvs = [], idx = [];
    let s = 0;
    const segs = 8;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const tx = q[0] - o[0], tz = q[2] - o[2];
      const L = Math.hypot(tx, tz) || 1;
      const nx = -tz / L, nz = tx / L;
      const w = rv.width[i] * 0.5;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * 2 - 1;
        verts.push(p[0] + nx * a * w, p[1] - (a * a) * 0.4, p[2] + nz * a * w);
        uvs.push(s, a * w);
      }
      if (i < pts.length - 1) s += Math.hypot(q[0] - p[0], q[2] - p[2]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, riverMat));
  }
  const lk = world.track.lake;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(lk.r + 30, 96).rotateX(-Math.PI / 2), makeMat(false));
  lake.position.set(lk.x, lk.y + 1.0, lk.z);
  group.add(lake);
  // crater lava pool
  const crater = new THREE.Mesh(new THREE.CircleGeometry(80, 64).rotateX(-Math.PI / 2), makeMat(false));
  crater.position.set(0, world.heightAt(0, 0) + 6, 0);
  group.add(crater);
  group.userData.uniforms = lavaUniforms;
  return group;
}

// ---------------------------------------------------------------- rocks
function rockGeometry(seed, detail = 4) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const rnd = mulberry(seed);
  const planes = [];
  for (let i = 0; i < 7; i++) {
    const n = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    planes.push([n, 0.55 + rnd() * 0.35]);
  }
  const v = new THREE.Vector3();
  const sx = 0.8 + rnd() * 0.6, sy = 0.5 + rnd() * 0.4, sz = 0.8 + rnd() * 0.5;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // faceted, fractured look: clip by random planes, then add noise
    let r = 1;
    for (const [n, d] of planes) {
      const t = v.dot(n);
      if (t * r > d) r = d / t;
    }
    v.multiplyScalar(r);
    const nn = vnoise(v.x * 2.3 + seed, v.y * 2.3, v.z * 2.3) * 0.12 + vnoise(v.x * 6, v.y * 6 + seed, v.z * 6) * 0.04;
    v.multiplyScalar(1 + nn);
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals();
  return g;
}

export function buildRocks(world, M, quality) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const uniforms = { basA: { value: M.bas.a }, basN: { value: M.bas.n }, basO: { value: M.bas.o }, tNoise: { value: M.noise },
    scoA: { value: M.sco.a } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vW = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;
vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vWN;
uniform sampler2D basA, basN, basO, scoA;
${GLSL_COMMON}
vec3 kN; float kAO; float kR;`)
      .replace('#include <map_fragment>', `
vec3 Ng = normalize(vWN);
vec3 bw = pow(abs(Ng), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
float rs = 1.0 / 3.5;
vec2 uX = vW.zy * rs, uY = vW.xz * rs, uZ = vW.xy * rs;
vec3 bA = texture(basA, uX).rgb * bw.x + texture(basA, uY).rgb * bw.y + texture(basA, uZ).rgb * bw.z;
vec2 bO = texture(basO, uX).rg * bw.x + texture(basO, uY).rg * bw.y + texture(basO, uZ).rg * bw.z;
vec3 tnX = unpackN(texture(basN, uX)), tnY = unpackN(texture(basN, uY)), tnZ = unpackN(texture(basN, uZ));
tnX = vec3(tnX.xy + Ng.zy, abs(tnX.z) * Ng.x);
tnY = vec3(tnY.xy + Ng.xz, abs(tnY.z) * Ng.y);
tnZ = vec3(tnZ.xy + Ng.xy, abs(tnZ.z) * Ng.z);
kN = normalize(tnX.zyx * bw.x + tnY.xzy * bw.y + tnZ.xyz * bw.z);
// dust settles on top faces
float dust = smoothstep(0.55, 0.95, Ng.y) * 0.55;
vec3 dc = texture(scoA, vW.xz / 5.0).rgb * 1.15;
diffuseColor.rgb = mix(bA * 1.1, dc, dust);
kAO = bO.r; kR = mix(bO.g, 0.95, dust);
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kR;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(kN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= kAO;');
  };
  const variants = [0, 1, 2, 3, 4, 5].map((s) => rockGeometry(s * 17 + 3, quality.rockDetail));
  const counts = variants.map(() => []);
  const rnd = mulberry(99);
  const c = world.track.centre;
  const W = world.track.width;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const N = new THREE.Vector3();
  const place = (x, z, size, sink = 0.3) => {
    const y = world.heightAt(x, z);
    world.normalAt(x, z, N);
    e.set(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5);
    q.setFromEuler(e);
    const up = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), N);
    q.premultiply(up);
    sc.set(size * (0.8 + rnd() * 0.5), size * (0.6 + rnd() * 0.6), size * (0.8 + rnd() * 0.5));
    p.set(x, y - sc.y * sink, z);
    m4.compose(p, q, sc);
    counts[Math.floor(rnd() * variants.length)].push(m4.clone());
  };
  // track-side boulders and rubble
  for (let i = 0; i < c.length; i += 3) {
    const pnt = c[i], nx = c[(i + 1) % c.length];
    const tx = nx[0] - pnt[0], tz = nx[2] - pnt[2];
    const L = Math.hypot(tx, tz) || 1;
    for (const side of [-1, 1]) {
      if (rnd() < 0.55) {
        const lat = side * (W / 2 + 4 + Math.pow(rnd(), 2) * 45);
        const x = pnt[0] - tz / L * lat + (rnd() - 0.5) * 3, z = pnt[2] + tx / L * lat + (rnd() - 0.5) * 3;
        const near = Math.abs(lat) < W / 2 + 10;
        const size = near ? 0.25 + rnd() * 0.7 : 0.4 + Math.pow(rnd(), 3) * 6;
        if (!nearTrack(world, x, z, W / 2 + 3)) place(x, z, size);
      }
    }
  }
  // scattered field boulders
  for (let i = 0; i < quality.fieldRocks; i++) {
    const a = rnd() * Math.PI * 2, r = 160 + Math.pow(rnd(), 0.7) * 900;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!nearTrack(world, x, z, W / 2 + 4)) place(x, z, 0.6 + Math.pow(rnd(), 4) * 14, 0.4);
  }
  variants.forEach((g, i) => {
    const list = counts[i];
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((m, j) => im.setMatrixAt(j, m));
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  });
  return group;
}

let trackGrid = null;
export function nearTrack(world, x, z, r) {
  if (!trackGrid) {
    trackGrid = new Map();
    for (const p of world.track.centre) {
      const k = `${Math.floor(p[0] / 32)},${Math.floor(p[2] / 32)}`;
      if (!trackGrid.has(k)) trackGrid.set(k, []);
      trackGrid.get(k).push(p);
    }
  }
  const gx = Math.floor(x / 32), gz = Math.floor(z / 32);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const l = trackGrid.get(`${gx + i},${gz + j}`);
    if (!l) continue;
    for (const p of l) if ((p[0] - x) ** 2 + (p[2] - z) ** 2 < r * r) return true;
  }
  return false;
}

// ---------------------------------------------------------------- utils
export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
export function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    r += hash3(ix + a, iy + b, iz + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
  }
  return r * 2 - 1;
}
