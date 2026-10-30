import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;

export async function loadWorld() {
  const [hb, data] = await Promise.all([
    fetch(`${BASE}world/height.u16`).then((r) => r.arrayBuffer()),
    fetch(`${BASE}world/track.json`).then((r) => r.json()),
  ]);
  const raw = new Uint16Array(hb);
  const heights = new Float32Array(raw.length);
  const k = (data.hmax - data.hmin) / 65535;
  for (let i = 0; i < raw.length; i++) heights[i] = data.hmin + raw[i] * k;
  const g = data.grid;
  const res = data.extent / (g - 1);
  const half = data.extent / 2;
  const world = { heights, data, grid: g, res, half, extent: data.extent };
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
  // packed sets: albedo + roughness in alpha, and normal XY + AO (see tools/pack_terrain.py)
  const pset = (n) => ({ a: tex(`${n}_ar.webp`, true), p: tex(`${n}_nao.jpg`) });
  return {
    ash: pset('ext/track'), sco: pset('ext/gravel'), bas: pset('ext/cliff'), lava: set('ext/lava'),
    burnt: pset('ext/burnt'), heat: tex('ext/lava_heat.jpg'), molten: tex('ext/lava_molten.jpg', true), detail: tex('detail_normal.jpg'), noise: tex('noise.png'),
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
// packed normal map: RG = tangent normal XY, B = AO
vec3 unpackNP(vec4 c) { vec2 xy = c.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
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
  // fine within the volcano tracks, medium out to the village and the sprint start, coarse to the horizon
  const inner = 760, mid = 1150, step = quality.terrainStep, stepM = step * 1.5;
  const axis = [];
  const outerN = 60;
  for (let i = 0; i < outerN; i++) axis.push(-half + (half - mid) * (i / outerN));
  for (let v = -mid; v < -inner; v += stepM) axis.push(v);
  for (let v = -inner; v < inner; v += step) axis.push(v);
  for (let v = inner; v < mid; v += stepM) axis.push(v);
  for (let i = 0; i <= outerN; i++) axis.push(mid + (half - mid) * (i / outerN));
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

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.7 });
  mat.userData.wx = 'ground'; // puddles and snow cover (weather/surface.js)
  const uniforms = {
    tNH: { value: ntex }, tMask: { value: mask }, tNoise: { value: M.noise },
    ashA: { value: M.ash.a }, ashP: { value: M.ash.p },
    scoA: { value: M.sco.a }, scoP: { value: M.sco.p },
    basA: { value: M.bas.a }, basP: { value: M.bas.p },
    tDetail: { value: M.detail },
    brA: { value: M.burnt.a }, brP: { value: M.burnt.p },
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
// 12 samplers here + shadow map + environment stays within the common 16-unit limit
uniform sampler2D tNH, tMask, ashA, ashP, scoA, scoP, basA, basP, tDetail, brA, brP;
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
vec4 sA = texAT(scoA, uvS, nz.g); vec4 sP = texAT(scoP, uvS, nz.g); vec3 sN = unpackNP(sP); vec2 sO = vec2(sP.b, sA.a);
vec4 aA = texAT(ashA, uvA, nz.b); vec4 aP = texAT(ashP, uvA, nz.b); vec3 aN = unpackNP(aP); vec2 aO = vec2(aP.b, aA.a);
// black cinder gravel and burnt ash ground in large patches
vec4 bbA = texAT(brA, vW.xz / 4.0, nz.b); vec4 bbP = texAT(brP, vW.xz / 4.0, nz.b); vec3 bbN = unpackNP(bbP); vec2 bbO = vec2(bbP.b, bbA.a);
sA.rgb *= vec3(0.5, 0.46, 0.43);
float pB = smoothstep(0.4, 0.62, nz.r * 0.8 + nz2.g * 0.35);
vec3 groundA = mix(sA.rgb, bbA.rgb * vec3(0.8, 0.75, 0.72), pB);
vec3 gN0 = normalize(mix(sN, bbN, pB));
vec2 gRO0 = mix(sO, bbO, pB);
// darker wind-packed ash on the upper cone with rust-red oxidised streaks
float hAsh = smoothstep(150.0, 320.0, vW.y + nz.r * 80.0);
float lum = dot(groundA, vec3(0.3, 0.55, 0.15));
vec3 coneC = mix(vec3(lum) * vec3(0.92, 0.86, 0.82), vec3(lum) * vec3(1.5, 0.85, 0.6), smoothstep(0.55, 0.8, nz2.r) * 0.7);
groundA = mix(groundA, coneC, hAsh * 0.7);
float wRoad = smoothstep(0.05, 0.6, msk.g) * (1.0 - smoothstep(0.08, 0.2, slope));
groundA = mix(groundA, aA.rgb * 0.8, wRoad);
vec3 groundN = normalize(mix(gN0, aN, wRoad));
vec2 groundRO = mix(gRO0, aO, wRoad);

// triplanar basalt on steep faces
vec3 bw = pow(abs(Ng), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
float rs = 1.0 / 7.0;
vec2 uX = vW.zy * rs, uY = vW.xz * rs, uZ = vW.xy * rs;
vec4 cX = texture(basA, uX), cY = texture(basA, uY), cZ = texture(basA, uZ);
vec3 bA = cX.rgb * bw.x + cY.rgb * bw.y + cZ.rgb * bw.z;
vec4 pX = texture(basP, uX), pY = texture(basP, uY), pZ = texture(basP, uZ);
vec2 bO = vec2(pX.b, cX.a) * bw.x + vec2(pY.b, cY.a) * bw.y + vec2(pZ.b, cZ.a) * bw.z;
vec3 tnX = unpackNP(pX), tnY = unpackNP(pY), tnZ = unpackNP(pZ);
tnX = vec3(tnX.xy + Ng.zy, abs(tnX.z) * Ng.x);
tnY = vec3(tnY.xy + Ng.xz, abs(tnY.z) * Ng.y);
tnZ = vec3(tnZ.xy + Ng.xy, abs(tnZ.z) * Ng.z);
vec3 rockN = normalize(tnX.zyx * bw.x + tnY.xzy * bw.y + tnZ.xyz * bw.z);
float wRock = smoothstep(0.13, 0.3, slope + (nz2.r - 0.5) * 0.16) * (1.0 - wRoad);
bA *= mix(vec3(1.0), vec3(1.35, 0.8, 0.62), smoothstep(0.5, 0.8, nz.g) * 0.6);

// scorched crust near lava
vec2 uvL = vW.xz / 10.0;
float wBurn = smoothstep(0.1, 0.8, msk.b + (nz2.b - 0.5) * 0.3);
vec3 lA = bbA.rgb * 0.45;
vec3 lN = bbN;

vec3 albedo = mix(groundA, bA, wRock);
albedo = mix(albedo, lA, wBurn * (1.0 - wRoad));
// macro tonal variation so the slopes don't read flat at distance
albedo *= mix(0.75, 1.15, nz.g) * mix(0.88, 1.08, nz2.r);
// erosion: rain and ash slides cut gullies straight down the slopes; sample the noise stretched along the fall line
vec2 fall = normalize(Ng.xz + vec2(1e-4));
vec2 gq = vec2(dot(vW.xz, vec2(-fall.y, fall.x)) / 16.0, dot(vW.xz, fall) / 120.0);
// (the noise is low-contrast, so stretch it out to the full range)
float gully = clamp((texture(tNoise, gq).r * 0.6 + texture(tNoise, gq * vec2(3.1, 2.0)).g * 0.4 - 0.52) * 3.5 + 0.5, 0.0, 1.0);
float gK = smoothstep(0.06, 0.3, slope) * (1.0 - wRoad);
albedo *= mix(1.0, mix(0.55, 1.45, smoothstep(0.3, 0.75, gully)), gK);
// paler ash washed down the gully floors on the upper cone
albedo = mix(albedo, vec3(0.34, 0.31, 0.29) * (0.8 + nz2.g * 0.4), smoothstep(0.62, 0.8, gully) * gK * hAsh * 0.55);
// mid-range breakup (20-150 m), where the ground textures have blurred out but the macro noise is too broad
vec3 nzm = texture(tNoise, vW.xz / 7.0).rgb;
float midK = smoothstep(12.0, 40.0, camD) * (1.0 - smoothstep(150.0, 400.0, camD));
albedo *= mix(1.0, mix(0.8, 1.12, nzm.r) * mix(0.92, 1.05, nzm.b), midK);
// near: loose stones and grit speckle the ground
float grit = texture(tNoise, vW.xz / 0.55).g;
albedo *= mix(1.0, mix(0.72, 1.2, smoothstep(0.35, 0.8, grit)), (1.0 - smoothstep(6.0, 30.0, camD)) * 0.6);

vec3 topN = groundN;
topN = normalize(mix(topN, lN, wBurn * (1.0 - wRoad)));
// close-range micro detail
vec3 dN = unpackN(texture(tDetail, vW.xz / 1.3));
topN = normalize(topN + vec3(dN.xy, 0.0) * 0.35 * (1.0 - smoothstep(10.0, 40.0, camD)));
vec3 wN = topToWorld(topN, Ng);
wN = normalize(mix(wN, rockN, wRock));
float gd = (texture(tNoise, gq + vec2(0.01, 0.0)).r - texture(tNoise, gq - vec2(0.01, 0.0)).r) * 3.0;
wN = normalize(wN + vec3(-fall.y, 0.0, fall.x) * gd * 3.0 * gK);
gN = wN;
vec2 ro = mix(groundRO, bO, wRock);
gAO = ro.r;
// lava light bounce on nearby ground
gEm = vec3(1.0, 0.26, 0.04) * (pow(msk.r, 6.0) * 0.1 + pow(msk.r, 14.0) * 0.8);
diffuseColor.rgb = albedo;
`)
      // volcanic ground is matte: remap the scanned roughness so low sun doesn't glaze the plain white
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(0.62 + ro.g * 0.42, 0.62, 1.0);')
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
export function buildTrackRibbon(world, M, track) {
  const c = track.centre;
  const W = track.width;
  const closed = track.closed;
  const shared = track.shared || [];
  const across = [-1.6, -1.25, -1.0, -0.85, -0.7, -0.55, -0.4, -0.25, -0.12, 0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.25, 1.6];
  const n = c.length;
  const verts = [], uvs = [], idx = [];
  let s = 0;
  const rows = closed ? n + 1 : n;
  for (let i = 0; i < rows; i++) {
    const p = c[i % n];
    const q = closed ? c[(i + 1) % n] : c[Math.min(i + 1, n - 1)];
    const o = closed ? p : c[Math.max(i - 1, 0)];
    const tx = q[0] - o[0], tz = q[2] - o[2];
    const L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L;
    for (const a of across) {
      const lat = a * W / 2 + 0;
      const x = p[0] + nx * lat, z = p[2] + nz * lat;
      const y = world.heightAt(x, z) + 0.12;
      verts.push(x, y, z);
      uvs.push(s, lat);
    }
    if (i < rows - 1) s += Math.hypot(q[0] - p[0], q[2] - p[2]);
  }
  const m = across.length;
  for (let i = 0; i < rows - 1; i++) {
    if (c[i][4] && c[(i + 1) % n][4]) continue; // lava gap at the jump
    if (shared.some(([a, b]) => i >= a && i + 1 < b)) continue; // drawn by the track it borrows
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
  const mat = roadMaterial(M, W, closed ? 1e9 : s);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

// the gravel road surface, on a strip with uv = (metres along, metres across); also laid on bridge decks
export function roadMaterial(M, W, len) {
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mat.userData.wx = 'road';
  const uniforms = {
    ashA: { value: M.ash.a }, ashP: { value: M.ash.p }, tNoise: { value: M.noise },
    tDetail: { value: M.detail }, uHalfW: { value: W / 2 }, uLen: { value: len },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec2 vT;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vT = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec2 vT;
uniform sampler2D ashA, ashP, tDetail; uniform float uHalfW, uLen;
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
vec4 P = texAT(ashP, uv, nzf.r);
vec3 tn = unpackNP(P);
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
// potholes: shallow dished hollows, darker and wetter-looking, worn between the ruts
float ph = texture(tNoise, vec2(along / 9.0, lat / 9.0 + 0.6)).b;
float pot = smoothstep(0.7, 0.8, ph) * (1.0 - clamp(rut, 0.0, 1.0) * 0.7) * (1.0 - smoothstep(uHalfW - 1.5, uHalfW, abs(lat)));
col *= 1.0 - pot * 0.35;
vec2 pg = vec2(texture(tNoise, vec2((along + 0.3) / 9.0, lat / 9.0 + 0.6)).b - ph, texture(tNoise, vec2(along / 9.0, (lat + 0.3) / 9.0 + 0.6)).b - ph);
tn = normalize(tn + vec3(pg * 6.0 * smoothstep(0.65, 0.8, ph), 0.0));
// loose stones thrown to the edges and the crown between the wheel tracks
float st = texture(tNoise, vW.xz / 0.7).r;
float stones = smoothstep(0.72, 0.8, st) * (0.35 + 0.65 * (1.0 - clamp(rut, 0.0, 1.0)));
col = mix(col, col * vec3(1.35, 1.3, 1.22), stones * 0.6);
tn.x += rutD * 0.03 * 0.0; // keep rut normals subtle
vec3 dN = unpackN(texture(tDetail, vW.xz / 1.1));
tn = normalize(tn + vec3(dN.xy, 0.0) * 0.25);
rN = tn; rAO = P.b * (1.0 - pot * 0.25); rR = mix(mix(A.a, 0.62, rut * 0.6), 0.5, pot * 0.5);
diffuseColor.rgb = col;
float fade = 1.0 - smoothstep(uHalfW + 0.5, uHalfW * 1.55, abs(lat) + (nzf.b - 0.5) * 5.0);
diffuseColor.a = fade * smoothstep(0.0, 10.0, along) * smoothstep(uLen, uLen - 10.0, along);
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
  return mat;
}

// ---------------------------------------------------------------- lava
export function buildLava(world, M) {
  const group = new THREE.Group();
  const lavaUniforms = {
    uTime: { value: 0 }, lavA: { value: M.lava.a }, lavN: { value: M.lava.n }, tHeat: { value: M.heat }, tMolten: { value: M.molten },
    tNoise: { value: M.noise },
  };
  const makeMat = (flowing) => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    mat.userData.wx = false; // rain and snow never settle on lava
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, lavaUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vW; varying vec2 vT;${flowing ? '\nattribute vec2 flow; varying vec2 vF;' : ''}`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vT = uv;${flowing ? ' vF = flow;' : ''}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec2 vT;${flowing ? ' varying vec2 vF;' : ''}
uniform float uTime; uniform sampler2D lavA, lavN, tHeat, tMolten;
${GLSL_COMMON}
vec3 lavaEm; vec3 lavaN;
vec3 blackbody(float t) {
  // 0..1 -> dark red .. orange .. yellow-white
  return vec3(1.0, 0.25, 0.02) * smoothstep(0.0, 0.4, t) + vec3(0.0, 0.45, 0.1) * smoothstep(0.35, 0.8, t)
       + vec3(0.0, 0.25, 0.45) * smoothstep(0.8, 1.0, t);
}`)
        .replace('#include <map_fragment>', /* glsl */`
${flowing ? /* glsl */`
// a river running down the mountain: it moves fastest down its middle and drags at its banks (vF.x is -1..1
// across, vF.y the speed in m/s from the slope). Two texture phases, each restarting every few seconds and
// cross-faded, so the crust keeps sliding downhill without smearing out where the speed changes.
float a = vF.x, spd = vF.y * (1.0 - 0.7 * a * a);
float P = 3.2, f0 = fract(uTime / P), f1 = fract(uTime / P + 0.5);
float wB = abs(1.0 - 2.0 * f0);
vec2 base = vec2(vT.x, vT.y);
vec2 uA = base - vec2(spd * f0 * P, 0.0), uB = base - vec2(spd * f1 * P, 0.0) + vec2(5.3, 2.1);
// stretched along the flow, so the crust reads as streaks being dragged downhill
vec2 uv1 = uA / vec2(22.0, 11.0), uv2 = uA / vec2(13.0, 8.0) + 0.3, uv1b = uB / vec2(22.0, 11.0), uv2b = uB / vec2(13.0, 8.0) + 0.3;
vec3 nz = texture(tNoise, vW.xz / 90.0 + uTime * 0.003).rgb;
float nA = texture(tNoise, uA / 25.0).r, nB = texture(tNoise, uB / 25.0).r;
float nzbr = mix(nA, nB, wB);
float hot = max(mix(texture(tHeat, uv1).r, texture(tHeat, uv1b).r, wB), mix(texture(tHeat, uv2 * 1.3).r, texture(tHeat, uv2b * 1.3).r, wB) * 0.8);
// the crust tears open down the hot middle of the flow and along the shear lines
float core = 1.0 - smoothstep(0.08, 0.38, abs(a + (nzbr - 0.5) * 0.5));
float molten = clamp(smoothstep(0.62, 0.76, nz.g * 0.75 + nzbr * 0.4) + core * 0.8, 0.0, 1.0);
// surges: brighter bands that roll down with the flow
float surge = 0.5 + 0.5 * sin((vT.x - uTime * spd) * 0.35 + nz.r * 9.0);
float pulse = 0.8 + 0.3 * surge * core + 0.1 * sin(uTime * 1.3 + nz.r * 12.0);
vec3 crust = mix(texture(lavA, uv1).rgb, texture(lavA, uv1b).rgb, wB);
vec3 melt = mix(texture(tMolten, uv2 * 0.6).rgb, texture(tMolten, uv2b * 0.6).rgb, wB);
diffuseColor.rgb = mix(crust * 0.45, melt * 0.15, molten);
// the crust between: dark, glowing only along its torn streaks, dimmer towards the banks where it has cooled
float bank = 1.0 - smoothstep(0.55, 1.0, abs(a));
lavaEm = (vec3(1.0, 0.3, 0.04) * pow(hot, 1.8) * 3.0 * (0.35 + 0.65 * bank) + melt * vec3(1.2, 0.75, 0.45) * molten * 3.0) * pulse;
lavaN = unpackN(mix(texture(lavN, uv1), texture(lavN, uv1b), wB));
lavaN = normalize(mix(lavaN, vec3(0,0,1), molten * 0.7));
` : /* glsl */`
vec2 uv1 = vW.xz / 18.0 + vec2(uTime * 0.006, 0.0); vec2 uv2 = vW.xz / 11.0 - vec2(0.0, uTime * 0.01);
vec3 nz = texture(tNoise, vW.xz / 90.0 + uTime * 0.003).rgb;
vec3 nzb = texture(tNoise, vW.xz / 25.0 - uTime * 0.004).rgb;
float e1 = texture(tHeat, uv1).r, e2 = texture(tHeat, uv2 * 1.3).r;
float hot = max(e1, e2 * 0.8);
// open molten channels where the crust has broken up; slow convection rolls it over
float molten = smoothstep(0.58, 0.72, nz.g * 0.75 + nzb.r * 0.4 - 0.05);
float pulse = 0.85 + 0.15 * sin(uTime * 1.3 + nz.r * 12.0);
vec3 crust = texture(lavA, uv1).rgb;
vec3 melt = texture(tMolten, uv2 * 0.6).rgb;
diffuseColor.rgb = mix(crust * 0.6, melt * 0.15, molten);
lavaEm = (vec3(1.0, 0.32, 0.05) * pow(hot, 1.5) * 2.6 + melt * vec3(1.2, 0.75, 0.45) * molten * 3.2) * pulse;
lavaN = unpackN(texture(lavN, uv1));
lavaN = normalize(mix(lavaN, vec3(0,0,1), molten * 0.7));
`}`)
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(topToWorld(lavaN, vec3(0,1,0)), 0.0)).xyz);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += lavaEm;');
    };
    mat.customProgramCacheKey = () => `lava-${flowing}`;
    return mat;
  };
  const riverMat = makeMat(true);
  for (const rv of world.data.rivers) {
    const pts = rv.points;
    const verts = [], uvs = [], flow = [], idx = [];
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
        // runs faster where it is steep
        const drop = (o[1] - q[1]) / (Math.hypot(q[0] - o[0], q[2] - o[2]) || 1);
        flow.push(a, THREE.MathUtils.clamp(2.2 + drop * 30, 2.2, 9));
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
    geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, riverMat));
  }
  const lk = world.data.lake;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(lk.r + 30, 96).rotateX(-Math.PI / 2), makeMat(false));
  lake.position.set(lk.x, lk.y + 1.0, lk.z);
  group.add(lake);
  // crater lava pool
  const cr = world.data.crater || { x: 0, z: 0, r: 86, y: world.heightAt(0, 0) + 6 };
  const crater = new THREE.Mesh(new THREE.CircleGeometry(cr.r - 2, 96).rotateX(-Math.PI / 2), makeMat(false));
  crater.position.set(cr.x, cr.y, cr.z);
  group.add(crater);
  group.userData.uniforms = lavaUniforms;
  group.userData.makeMat = makeMat;
  return group;
}

// ---------------------------------------------------------------- track proximity

let trackGrid = null;
export function nearTrack(world, x, z, r) {
  if (!trackGrid) {
    trackGrid = new Map();
    for (const p of world.data.tracks.flatMap((t) => t.centre)) {
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
