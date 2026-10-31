import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
const loader = new THREE.TextureLoader();

// packed Kai'ele material set: albedo + roughness (A), and normal XY + AO (see tools/pack_terrain.py). The sand
// is packed its own way (tools/kaiele_sand_tex.py): albedo + height, and grain normal XY + wind-ripple normal XY.
const sets = {};
export function kaieleSet(name, aniso = 8) {
  if (sets[name]) return sets[name];
  const t = (f, srgb) => {
    const x = loader.load(`${BASE}textures/kaiele/${f}`);
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.anisotropy = aniso;
    if (srgb) x.colorSpace = THREE.SRGBColorSpace;
    return x;
  };
  return (sets[name] = { a: t(`${name}_ar.webp`, true), p: t(name === 'sand' ? 'sand_nn.webp' : `${name}_nao.jpg`) });
}

// The shore field for the sand (4 m texels): R = signed distance from the waterline (m, inland positive; -8..56
// in 0.25 m steps), G = wave exposure (mean water depth within 60 m: the ocean's run-up scale, ocean.js rs).
// The beach bands (wet, swash marks, wrack line, dry ripples, dunes) are measured in run-up, as the swash is.
let shore = null;
export function kaieleShore(world) {
  if (shore) return shore;
  const N = 1024, cell = world.extent / N, half = world.half;
  const h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = world.heightAt(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell);
  // chamfer distance from the far side of the waterline, seeded with a sub-cell estimate where it crosses
  const BIG = 1e4;
  const dl = new Float32Array(N * N).fill(BIG), dw = new Float32Array(N * N).fill(BIG);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i, land = h[k] > 0;
    if ((h[k - 1] > 0) !== land || (h[k + 1] > 0) !== land || (h[k - N] > 0) !== land || (h[k + N] > 0) !== land) {
      const g = Math.max(Math.hypot(h[k + 1] - h[k - 1], h[k + N] - h[k - N]) / (2 * cell), 0.02);
      const e = Math.min(Math.abs(h[k]) / g, cell);
      // dw: distance to the water (land cells), dl: distance to the land (sea cells)
      if (land) { dw[k] = e; dl[k] = 0; } else { dl[k] = e; dw[k] = 0; }
    } else if (land) dl[k] = 0; else dw[k] = 0;
  }
  const a = cell, b = cell * Math.SQRT2;
  const pass = (d) => {
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = j * N + i;
      d[k] = Math.min(d[k], d[k - 1] + a, d[k - N] + a, d[k - N - 1] + b, d[k - N + 1] + b);
    }
    for (let j = N - 2; j > 0; j--) for (let i = N - 2; i > 0; i--) {
      const k = j * N + i;
      d[k] = Math.min(d[k], d[k + 1] + a, d[k + N] + a, d[k + N + 1] + b, d[k + N - 1] + b);
    }
  };
  pass(dl); pass(dw);
  // exposure: mean depth of the water within 60 m (box filter, as the ocean does)
  const r = Math.round(60 / cell);
  const box = (src) => {
    const t = new Float32Array(N * N), o = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += src[j * N + Math.min(Math.max(i, 0), N - 1)];
      for (let i = 0; i < N; i++) { t[j * N + i] = s; s += src[j * N + Math.min(i + r + 1, N - 1)] - src[j * N + Math.max(i - r, 0)]; }
    }
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += t[Math.min(Math.max(j, 0), N - 1) * N + i];
      for (let j = 0; j < N; j++) { o[j * N + i] = s; s += t[Math.min(j + r + 1, N - 1) * N + i] - t[Math.max(j - r, 0) * N + i]; }
    }
    return o;
  };
  const dep = new Float32Array(N * N), wet = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) { dep[k] = Math.max(-h[k], 0); wet[k] = h[k] <= 0 ? 1 : 0; }
  const bd = box(dep), bw = box(wet);
  const d = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    const sd = h[k] > 0 ? dw[k] : -dl[k];
    const rs = bw[k] > 0.5 ? Math.min(Math.max((bd[k] / bw[k] - 0.1) / 0.65, 0.22), 1.2) : 0.22;
    d[k * 4] = Math.round(Math.min(Math.max((sd + 8) * 4, 0), 255));
    d[k * 4 + 1] = Math.round(rs / 1.25 * 255);
    d[k * 4 + 3] = 255;
  }
  shore = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  shore.magFilter = THREE.LinearFilter; shore.minFilter = THREE.LinearFilter;
  shore.needsUpdate = true;
  // the same field on the CPU (bilinear, as the texture filters): beach.js scatters its detail by it
  shore.userData.at = (x, z) => {
    const fx = Math.min(Math.max((x + half) / cell - 0.5, 0), N - 1.001), fz = Math.min(Math.max((z + half) / cell - 0.5, 0), N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = (j * N + i) * 4;
    const f = (o) => (d[k + o] * (1 - tx) + d[k + 4 + o] * tx) * (1 - tz) + (d[k + N * 4 + o] * (1 - tx) + d[k + N * 4 + 4 + o] * tx) * tz;
    return [f(0) / 4 - 8, f(1) / 255 * 1.25];
  };
  return shore;
}

// Shared GLSL for the island's ground and roads: anti-tiled sampling, packed normals, top projection
export const KAIELE_GLSL = /* glsl */`
vec4 texAT(sampler2D t, vec2 uv, float n) {
  // two decorrelated lookups blended by low-frequency noise breaks visible tiling
  vec4 a = texture(t, uv);
  vec4 b = texture(t, uv * 0.43 + vec2(0.37, 0.71));
  return mix(a, b, smoothstep(0.35, 0.65, n));
}
vec3 unpackNP(vec4 c) { vec2 xy = c.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
vec3 topToWorld(vec3 tn, vec3 N) { vec3 t = vec3(tn.xy + N.xz, abs(tn.z) * N.y); return normalize(t.xzy); }
float lum3(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
`;

// Beach sand, shared by the ground and the sand roads so a road's edge melts into the beach around it. Sampled in
// world space: the grain scan at two scales and rotations, wind ripples laid across the north-east trade wind at
// two scales, and everything else procedural, in bands measured in wave run-up from the shore field: a glassy
// film where the last wave drained, darker damp sand (water fills the grain's hollows first) with swash marks, the
// wrack line at the reach of the biggest sets, dry rippled sand above, dune hummocks at the back; pebbles, shells
// and coral bits, and glints on dry grains. Returns albedo, a top-projected tangent normal (x = world x, y = world
// z), AO, roughness and wetness.
//   sd, rs: the shore field (m from the waterline, exposure); white: 0 black volcanic .. 1 white coral;
//   trod: 0..1 traffic (wipes ripples, pebbles and wrack); wetX: forced wetness (rain, the surf line's road)
export const SAND_GLSL = /* glsl */`
const vec2 WIND = vec2(-0.7071, 0.7071); // the trade wind blows towards the south-west
float hash12(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(p.xyx * vec3(0.1031, 0.103, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
struct Sand { vec3 col; vec3 tn; float ao; float rgh; float wet; };
Sand sandAt(sampler2D sA, sampler2D sN, sampler2D tN, vec3 p, float sd, float rs, float white, float trod, float camD, float wetX) {
  Sand s;
  vec2 xz = p.xz;
  vec3 nb = texture(tN, xz / 31.0).rgb, nm = texture(tN, xz / 8.3).rgb;
  // ---- grain: the 2.6 m scan anti-tiled, plus a rotated 1.1 m copy close up
  vec2 uv = xz / 2.6;
  vec4 A = texAT(sA, uv, nb.g), G = texAT(sN, uv, nb.g);
  vec3 tn = unpackNP(G);
  tn.xy *= mix(0.65, 0.4, white); // coral sand is finer and rounder
  float hgt = A.a;
  float L = lum3(A.rgb);
  vec3 hue = A.rgb / max(L, 1e-3) / vec3(1.256, 0.973, 0.586); // grain-to-grain hue around the scan's mean
#ifndef SAND_LO
  float nearK = 1.0 - smoothstep(6.0, 28.0, camD);
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * xz / 1.1;
  vec4 A2 = texture(sA, uv2), G2 = texture(sN, uv2);
  tn.xy += unpackNP(G2).xy * 0.4 * nearK;
  L = mix(L, L * lum3(A2.rgb) / 0.268, 0.4 * nearK);
  hgt = mix(hgt, A2.a, 0.3 * nearK);
#endif
  L /= 0.268; // 1 = the scan's mean
  float ao = mix(0.62, 1.05, hgt);
  // ---- colour. Black sand: basalt and volcanic glass, charcoal with brown, grey and pale grains. White sand:
  // coral and shell, warm cream with pink and tan fragments. Broad patches of coarser and finer sand.
  vec3 blk = vec3(0.064, 0.06, 0.057) * pow(L, 1.25) * mix(vec3(1.0), hue, 0.7);
  vec3 wht = vec3(0.78, 0.7, 0.56) * mix(1.0, L, 0.3) * mix(vec3(1.0), hue, 0.5);
  vec3 col = mix(blk, wht, white);
#ifndef SAND_LO
  // single grains close up: pale feldspar, olivine and coral grit in the black sand, dark basalt in the white
  vec2 gq = floor(xz / 0.004);
  float gh = hash12(gq);
  float gk = (1.0 - smoothstep(2.0, 9.0, camD));
  col = mix(col, mix(vec3(0.2, 0.19, 0.16), vec3(0.05, 0.045, 0.04), white), step(mix(0.965, 0.992, white), gh) * gk);
  col = mix(col, vec3(0.06, 0.08, 0.035), step(0.993, gh) * gk * (1.0 - white));
#endif
  col *= mix(0.86, 1.1, smoothstep(0.3, 0.75, nb.r)) * mix(0.93, 1.05, nm.g);
  // ---- run-up: 0 at the waterline, 1 at the reach of the biggest sets (by distance, or height on a steep beach)
  float R = 24.0 * rs;
  float q = max(sd / (R * 1.2), p.y / (1.3 + 1.32 * rs)) + (nb.g - 0.5) * 0.14 + (nm.b - 0.5) * 0.05;
  float film = 1.0 - smoothstep(0.03, 0.09, q + (nm.r - 0.5) * 0.04);
  float damp = 1.0 - smoothstep(0.3, 0.52, q + (0.5 - hgt) * 0.05);
  float wet = max(max(damp, film), wetX);
  float dryK = smoothstep(1.02, 1.25, q);
  float back = smoothstep(1.5, 2.3, q) * smoothstep(-2.0, 12.0, sd - 18.0);
  // ---- trampled: footprints and old wheel marks dimple the dry sand in broad patches
  vec2 fq = xz / 0.9;
  float f0 = texture(tN, fq).r, f1 = texture(tN, fq + vec2(0.015, 0.0)).r, f2 = texture(tN, fq + vec2(0.0, 0.015)).r;
  float stomp = (1.0 - damp) * smoothstep(0.42, 0.62, nb.r * 0.6 + nm.b * 0.5) * (1.0 - back * 0.5) * (1.0 - trod);
  tn.xy += vec2(f0 - f1, f0 - f2) * 9.0 * stomp;
  ao *= mix(1.0, 0.85 + 0.3 * f0, stomp);
  // ---- wind ripples on the dry sand, meandering, worn away in patches; troughs gather the heavy dark grains
  vec2 rot = vec2(WIND.y, -WIND.x);
  vec2 ru = vec2(dot(xz, rot), dot(xz, WIND)) + (vec2(nm.r, nm.b) - 0.5) * 0.9;
  vec4 X = texture(sN, ru / 3.4);
  float ripK = dryK * (1.0 - trod) * smoothstep(0.3, 0.52, nb.b + nm.g * 0.25) * (1.0 - back * 0.4) * (1.0 - stomp * 0.7);
  vec2 rn = X.ba * 2.0 - 1.0;
  tn.xy += (rn.x * rot + rn.y * WIND) * ripK * 1.4;
  col *= mix(1.0, 1.0 + rn.y * mix(0.35, 0.15, white), ripK);
#ifndef SAND_LO
  // larger, more irregular ripples a little off the wind
  vec4 X2 = texture(sN, mat2(0.97, 0.26, -0.26, 0.97) * ru / 8.5 + 0.31);
  vec2 rn2 = X2.ba * 2.0 - 1.0;
  float rip2 = dryK * (1.0 - trod) * smoothstep(0.45, 0.7, nm.g * 0.7 + nb.r * 0.5);
  vec2 r2 = mat2(0.97, -0.26, 0.26, 0.97) * rn2;
  tn.xy += (r2.x * rot + r2.y * WIND) * rip2 * 0.9;
  col *= mix(1.0, 1.0 + rn2.y * 0.2, rip2);
#endif
  // ---- dune hummocks at the back of the beach: wind-scoured pale crests, sheltered hollows with plant litter
  vec2 hq = xz / 9.0;
  float h0 = texture(tN, hq).g, hx = texture(tN, hq + vec2(0.012, 0.0)).g, hz = texture(tN, hq + vec2(0.0, 0.012)).g;
  back *= smoothstep(0.3, 0.6, nb.r + nm.g * 0.3); // in patches, not everywhere
  tn.xy += vec2(h0 - hx, h0 - hz) * 12.0 * back;
  col *= mix(1.0, mix(0.82, 1.1, smoothstep(0.35, 0.65, h0)), back);
  col = mix(col, col * vec3(0.78, 0.7, 0.58), back * smoothstep(0.55, 0.35, h0) * smoothstep(0.5, 0.7, nm.r) * 0.6);
  ao *= mix(1.0, mix(0.75, 1.0, smoothstep(0.3, 0.6, h0)), back);
  // ---- swash marks: thin arcs of fine grains and foam scum left at each run-up's limit
  float sy = (q + (nm.g - 0.5) * 0.06) * 9.0;
  float sw = fwidth(sy) + 1e-4;
  float sm = fract(sy);
  float swl = smoothstep(0.0, 0.03 + sw, sm) * (1.0 - smoothstep(0.04, 0.09 + sw * 2.0, sm));
  swl *= smoothstep(0.08, 0.15, q) * (1.0 - smoothstep(0.9, 1.0, q)) * smoothstep(0.42, 0.6, nm.b + nb.g * 0.3) * (1.0 - trod) * (1.0 - smoothstep(0.05, 0.25, sw));
  col = mix(col, mix(vec3(0.1, 0.095, 0.09), col * 0.72, white), swl * 0.5);
  // ---- the wrack line: limu, twigs, palm fibre, shells and coral grit dropped by the highest waves; an older,
  // patchier line from the last big swell further up
  float wr = exp(-pow((q - 1.0) / 0.06, 2.0)) + 0.6 * exp(-pow((q - 1.3) / 0.045, 2.0)) * step(0.45, nb.b);
  float clump = smoothstep(0.42, 0.66, texture(tN, xz / 1.4).r * 0.7 + nm.g * 0.5);
  float wrack = clamp(wr * clump, 0.0, 1.0) * (1.0 - trod);
  float fib = texture(tN, mat2(0.6, 0.8, -0.8, 0.6) * xz * vec2(3.0, 0.9)).b;
  // fresh limu dark olive, sun-dried limu and palm fibre tan, twigs bleached grey
  vec3 limu = mix(vec3(0.05, 0.04, 0.02), vec3(0.035, 0.05, 0.02), smoothstep(0.4, 0.6, nm.r));
  limu = mix(limu, vec3(0.2, 0.15, 0.085), smoothstep(0.5, 0.62, fib) * smoothstep(0.3, 0.6, nb.r + 0.2));
  limu = mix(limu, vec3(0.32, 0.3, 0.27), smoothstep(0.68, 0.74, fib));
  float wk = wrack * smoothstep(0.36, 0.52, fib + clump * 0.2);
  col = mix(col, limu, wk);
  tn.xy += (vec2(fib, texture(tN, xz * 1.7).g) - 0.5) * 1.6 * wk;
  ao *= 1.0 - wk * 0.35;
  // shell and coral grit strewn along the line
  float grit = step(0.9, hash12(floor(xz / 0.018))) * clamp(wr, 0.0, 1.0) * (1.0 - trod) * (1.0 - smoothstep(10.0, 30.0, camD));
  col = mix(col, vec3(0.62, 0.58, 0.5), grit * 0.8);
  float rgh = 0.92;
  // ---- pebbles: rounded lava pebbles on the black beach, coral rubble and shells on the white one, gathered on the
  // swash slope and along the wrack, sparse elsewhere; domed normals and contact shadows
  float pebK = (0.03 + 0.45 * wr + 0.18 * damp * (1.0 - film)) * smoothstep(0.35, 0.65, nm.b * 0.6 + nb.r * 0.6) * (1.0 - trod);
#ifndef SAND_LO
  if (camD < 70.0 && pebK > 0.01) {
    vec2 gp = xz / 0.24, gi = floor(gp), gf = fract(gp);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = gi + vec2(i, j);
      float r = hash12(id);
      if (r > pebK) continue;
      vec2 hh = hash22(id + 17.0);
      vec2 d = gf - vec2(i, j) - 0.2 - hh * 0.6;
      float an = hh.x * 6.283, rad = 0.08 + 0.2 * fract(r * 37.0);
      d = mat2(cos(an), sin(an), -sin(an), cos(an)) * d * vec2(1.0, 1.5);
      float qd = length(d) / rad;
      if (qd < 1.35) {
        float kind = fract(r * 91.0 + hh.y);
        // black beach: mostly lava pebbles, a few coral bits; white beach the other way round
        bool lava = kind < mix(0.85, 0.15, white);
        vec3 pc = lava ? vec3(0.03, 0.029, 0.028) * (0.7 + hh.y * 0.8) : mix(vec3(0.7, 0.66, 0.58), vec3(0.72, 0.52, 0.47), step(0.8, fract(kind * 7.0)));
        float in1 = 1.0 - smoothstep(0.85, 1.0, qd);
        float dome = sqrt(max(0.0, 1.0 - qd * qd));
        col = mix(col, pc, in1);
        tn.xy = mix(tn.xy, d / rad * 0.7 / max(dome, 0.25), in1);
        ao *= mix(1.0, 0.55 + 0.45 * smoothstep(1.0, 1.35, qd), 1.0 - in1);
        rgh = mix(rgh, lava ? mix(0.5, 0.12, wet) : mix(0.7, 0.3, wet), in1);
      }
    }
  }
  // ---- glints: now and then a grain's facet catches the sun (volcanic glass more than coral)
  vec2 gc = floor(xz / 0.011);
  float gl = step(0.985, hash12(gc)) * (1.0 - wet) * (1.0 - smoothstep(3.0, 18.0, camD)) * mix(1.0, 0.4, white);
  tn.xy = mix(tn.xy, (hash22(gc + 5.3) - 0.5) * 1.2, gl);
  rgh = mix(rgh, 0.08, gl);
#endif
  // ---- wet: darker, smoother, glossy; where the last wave drained a film of water mirrors the sky
  col *= mix(1.0, mix(0.5, 0.62, white), wet);
  col *= mix(1.0, mix(0.8, 0.88, white), film);
  rgh = mix(rgh, mix(0.24, 0.34, white) - (hgt - 0.5) * 0.2, wet);
  rgh = mix(rgh, 0.05, film);
  tn.xy *= mix(1.0, 0.3, wet) * mix(1.0, 0.3, film);
  ao = mix(ao, 1.0, film * 0.6);
  s.col = col; s.tn = normalize(vec3(tn.xy, max(tn.z, 0.2))); s.ao = ao; s.rgh = rgh; s.wet = wet;
  return s;
}
`;

// The lava thread may bake fresh flows (R fresh cover, G 'a'a share); the dev server answers a missing file with
// index.html, so trust only an image reply.
async function loadLavaMasks(world, NS) {
  try {
    const r = await fetch(`${BASE}${world.dir}/lava_masks.png`);
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image')) return null;
    const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const cv = document.createElement('canvas');
    cv.width = cv.height = NS;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, NS, NS);
    return g.getImageData(0, 0, NS, NS).data;
  } catch (e) { return null; }
}

// World-space ground normals from the 2 m heightfield (RG = normal XZ, Y rebuilt in the shader) with the lava
// masks in BA, so the fresh flows cost no extra sampler. Texel (i, j) covers the grid cell between nodes.
async function bakeGroundTexture(world) {
  const { heights: h, grid: g, res } = world;
  const NS = g - 1;
  const lm = await loadLavaMasks(world, NS);
  const d = new Uint8Array(NS * NS * 4);
  for (let j = 0; j < NS; j++) {
    for (let i = 0; i < NS; i++) {
      const a = j * g + i;
      const hx = (h[a + 1] + h[a + g + 1] - h[a] - h[a + g]) * 0.5;
      const hz = (h[a + g] + h[a + g + 1] - h[a] - h[a + 1]) * 0.5;
      const L = Math.hypot(hx, res, hz);
      const o = (j * NS + i) * 4;
      d[o] = (-hx / L * 0.5 + 0.5) * 255; d[o + 1] = (-hz / L * 0.5 + 0.5) * 255;
      if (lm) { d[o + 2] = lm[o]; d[o + 3] = lm[o + 1]; }
    }
  }
  const t = new THREE.DataTexture(d, NS, NS, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// Kai'ele ground. Geometry: 64 m chunks, fine (the quality preset's terrain step) within ~150 m of any track,
// medium out to 450 m, coarse beyond and coarsest over the deep sea. Chunks of different steps meet with
// T-junctions, so every chunk hangs a skirt down from its border to hide the cracks; the shading comes from the
// baked normal texture, so a skirt reads as the ground it hides. Chunks are merged into 512 m tiles that the
// camera can cull.
function buildGeometry(world, quality) {
  const { half, extent, data } = world;
  const C = 64, NC = Math.round(extent / C), TILE = 8;
  const fine = Math.max(world.res, quality.terrainStep);
  const level = new Uint8Array(NC * NC).fill(3);
  const mark = (x, z, r, lv) => {
    const i0 = Math.max(0, Math.floor((x - r + half) / C)), i1 = Math.min(NC - 1, Math.floor((x + r + half) / C));
    const j0 = Math.max(0, Math.floor((z - r + half) / C)), j1 = Math.min(NC - 1, Math.floor((z + r + half) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      // distance from the point to the chunk's rectangle
      const dx = Math.max(-half + i * C - x, 0, x - (-half + (i + 1) * C));
      const dz = Math.max(-half + j * C - z, 0, z - (-half + (j + 1) * C));
      if (dx * dx + dz * dz < r * r) level[j * NC + i] = Math.min(level[j * NC + i], lv);
    }
  };
  for (const t of data.tracks) for (let k = 0; k < t.centre.length; k += 4) {
    const p = t.centre[k];
    mark(p[0], p[2], 150, 0);
    mark(p[0], p[2], 450, 1);
  }
  const steps = [fine, fine * 2.5, 16, 32];
  const tiles = [];
  const nt = NC / TILE;
  const counts = [0, 0, 0, 0];
  const tmpN = new THREE.Vector3();
  for (let tj = 0; tj < nt; tj++) for (let ti = 0; ti < nt; ti++) {
    const pos = [], nrm = [], idx = [];
    for (let cj = tj * TILE; cj < (tj + 1) * TILE; cj++) for (let ci = ti * TILE; ci < (ti + 1) * TILE; ci++) {
      let lv = level[cj * NC + ci];
      const x0 = -half + ci * C, z0 = -half + cj * C;
      // a coarse chunk entirely under deep water drops to the coarsest step
      if (lv >= 2) {
        let hmax = -1e9;
        for (let s = 0; s <= 8; s++) for (let r = 0; r <= 8; r++) hmax = Math.max(hmax, world.heightAt(x0 + s * 8, z0 + r * 8));
        lv = hmax < -15 ? 3 : 2;
      }
      const n = Math.max(2, Math.round(C / steps[lv]));
      counts[lv]++;
      const st = C / n, base = pos.length / 3;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const x = x0 + i * st, z = z0 + j * st;
        pos.push(x, world.heightAt(x, z), z);
        world.normalAt(x, z, tmpN);
        nrm.push(tmpN.x, tmpN.y, tmpN.z);
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      // skirts: deep enough to cover the worst gap between this step's edge and a finer neighbour's
      const drop = 0.6 + st * 0.6;
      const edge = (get) => {
        const sb = pos.length / 3;
        for (let k = 0; k <= n; k++) {
          const v = get(k);
          pos.push(pos[v * 3], pos[v * 3 + 1] - drop, pos[v * 3 + 2]);
          nrm.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
        }
        for (let k = 0; k < n; k++) {
          const a = get(k), b = get(k + 1), c = sb + k, d = sb + k + 1;
          idx.push(a, c, b, b, c, d, a, b, c, b, d, c); // both windings: the skirt shows from either side
        }
      };
      edge((k) => base + k);
      edge((k) => base + n * (n + 1) + k);
      edge((k) => base + k * (n + 1));
      edge((k) => base + k * (n + 1) + n);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    tiles.push(geo);
  }
  console.info('kaiele terrain chunks by level', counts.join('/'), 'fine step', fine);
  return tiles;
}

export async function buildIslandTerrain(world, M, quality) {
  const { extent } = world;
  const lowEnd = !!quality.aiLod;
  const aniso = lowEnd ? 4 : 8;
  const tNH = await bakeGroundTexture(world);
  // waited for, so the first frame (and headless stills) already shows the right ground
  const biome = await loader.loadAsync(`${BASE}${world.dir}/biome.png`);
  biome.premultiplyAlpha = false;
  biome.needsUpdate = true;
  // the bake writes row 0 at the north edge (z = -half), the same way up as the normal texture
  biome.flipY = false;
  const S = { sand: kaieleSet('sand', aniso), grass: kaieleSet('grass', aniso), litter: kaieleSet('litter', aniso),
    dirt: kaieleSet('dirt', aniso), rock: kaieleSet('rock', aniso) };
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.8 });
  mat.userData.wx = 'ground';
  // weather (later): uWet 0..1 darkens and glosses the ground, uSnow could lower the snow line
  const uniforms = {
    tNH: { value: tNH }, tBiome: { value: biome }, tNoise: { value: M.noise }, uExtent: { value: extent },
    sandA: { value: S.sand.a }, sandP: { value: S.sand.p }, grsA: { value: S.grass.a }, grsP: { value: S.grass.p },
    litA: { value: S.litter.a }, litP: { value: S.litter.p }, dirA: { value: S.dirt.a }, dirP: { value: S.dirt.p },
    rokA: { value: S.rock.a }, rokP: { value: S.rock.p }, tShore: { value: kaieleShore(world) },
    uWet: { value: 0 }, uSnowLine: { value: 600 },
  };
  mat.userData.uniforms = uniforms;
  // low preset (phones; main.js tells it by the terrain step): one grain scale, no pebbles, glints or larger ripples
  if (quality.terrainStep > 3) mat.defines = { SAND_LO: '' };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW;
// 14 samplers + shadow map + environment: the 16 units many GPUs allow
uniform sampler2D tNH, tBiome, tNoise, tShore, sandA, sandP, grsA, grsP, litA, litP, dirA, dirP, rokA, rokP;
uniform float uExtent, uWet, uSnowLine;
${KAIELE_GLSL}
${SAND_GLSL}
vec3 gN; float gAO; float gR;`)
      .replace('#include <map_fragment>', /* glsl */`
vec2 wuv = vW.xz / uExtent + 0.5;
vec4 nh = texture(tNH, wuv);
vec3 Ng = vec3(nh.r * 2.0 - 1.0, 0.0, nh.g * 2.0 - 1.0); Ng.y = sqrt(max(0.0, 1.0 - dot(Ng.xz, Ng.xz)));
// the 2 m field is rough; ground cover follows the slope of the land around (mip 3, ~16 m)
vec4 nhS = texture(tNH, wuv, 3.0);
vec2 sxz = nhS.rg * 2.0 - 1.0;
float slope = 1.0 - Ng.y, slopeS = 1.0 - sqrt(max(0.0, 1.0 - dot(sxz, sxz)));
float slopeM = mix(slope, slopeS, 0.6);
float fresh = nh.b, aa = nh.a;
vec4 bm = texture(tBiome, wuv);
vec3 nz = texture(tNoise, vW.xz / 240.0).rgb;
vec3 nz2 = texture(tNoise, vW.xz / 37.0).rgb;
vec3 nzm = texture(tNoise, vW.xz / 7.0).rgb;
float y = vW.y;
float camD = length(vW - cameraPosition);

// ---- erosion: rain cuts gullies straight down the slopes; noise stretched along the fall line
vec2 fall = normalize(sxz + vec2(1e-4));
vec2 gq = vec2(dot(vW.xz, vec2(-fall.y, fall.x)) / 14.0, dot(vW.xz, fall) / 110.0);
float gully = clamp((texture(tNoise, gq).r * 0.6 + texture(tNoise, gq * vec2(3.1, 2.0)).g * 0.4 - 0.52) * 3.5 + 0.5, 0.0, 1.0);
float gK = smoothstep(0.08, 0.3, slopeM);

// ---- layer weights
float land = smoothstep(-0.6, 1.2, y);
// beaches: the bake's sand mask, and any gentle shore below ~4 m (sand runs on out under the water)
float shore = (1.0 - smoothstep(2.5, 5.5, y + (nz2.g - 0.5) * 3.0)) * (1.0 - smoothstep(0.16, 0.3, slopeS)) * smoothstep(-9.0, -3.0, y);
float wSand = max(smoothstep(0.12, 0.45, bm.r + (nz2.g - 0.5) * 0.12), shore);
// the bake's rock mask is right on the coast (lava point, tide pools); inland it follows a noisy 2 m slope, so
// only keep it as scattered outcrops there
float coast = 1.0 - smoothstep(10.0, 28.0, y);
float wRockB = bm.a * mix(0.3 * smoothstep(0.55, 0.75, nz2.r + bm.a * 0.3), 1.0, coast);
wSand *= 1.0 - smoothstep(0.3, 0.7, wRockB);
float wCliff = smoothstep(0.44, 0.6, slopeM + (nz2.r - 0.5) * 0.12);
float vegP = land * smoothstep(2.0, 9.0, y + nz2.b * 4.0) * (1.0 - smoothstep(uSnowLine - 90.0, uSnowLine - 20.0, y + nz.r * 50.0));
float veg = max(bm.b, vegP * mix(0.75, 1.0, nz.g));
// trade winds blow from the north-east: the leeward south-west lowlands are drier, golden grass and red earth
float dry = smoothstep(-300.0, 1300.0, (vW.z - vW.x) * 0.7 + (nz.r - 0.5) * 500.0) * (1.0 - smoothstep(0.3, 0.7, bm.b)) * (1.0 - smoothstep(250.0, 420.0, y));
float wJungle = clamp(smoothstep(0.4, 0.85, bm.b) + smoothstep(0.6, 0.85, gully) * gK * 0.5 * smoothstep(40.0, 120.0, y), 0.0, 1.0);
// red laterite: bare banks, steep-ish slopes, gully floors and worn patches on the uplands
float wDirt = smoothstep(0.18, 0.34, slopeM + (nz2.g - 0.5) * 0.22 + (gully - 0.5) * 0.25 * gK);
wDirt = max(wDirt, smoothstep(0.7, 0.82, nz.b * 0.7 + nzm.g * 0.35) * 0.8);
wDirt = max(wDirt, dry * smoothstep(0.62, 0.75, nz2.r * 0.7 + nzm.g * 0.4) * 0.85);
wDirt *= 1.0 - smoothstep(0.6, 0.95, bm.b) * 0.7;
float snow = smoothstep(uSnowLine, uSnowLine + 40.0, y + nz.r * 40.0 + nz2.g * 10.0) * (1.0 - wCliff * 0.6);

// ---- sand: black volcanic on the south beach, white coral at the north cove, wet and glossy at the waterline
vec2 sh = texture(tShore, wuv).rg;
Sand sd = sandAt(sandA, sandP, tNoise, vW, sh.r * 64.0 - 8.0, sh.g * 1.25, smoothstep(0.2, 0.7, bm.g), 0.0, camD, uWet);
vec3 sandC = sd.col;
float sandR = sd.rgh;
vec3 sandN = sd.tn;

// ---- grass on the headlands and plateau, two tones, yellowing on the dry upper slopes
vec2 uvG = vW.xz / 3.0;
vec4 gA = texAT(grsA, uvG, nz2.r); vec4 gP = texAT(grsP, uvG, nz2.r);
vec3 grassC = gA.rgb * mix(vec3(0.72, 0.98, 0.55), vec3(0.95, 1.0, 0.62), smoothstep(0.35, 0.7, nz.r));
// clumps: darker lush patches and paler worn ones break up the lawn look
grassC *= mix(0.72, 1.12, smoothstep(0.25, 0.75, nzm.g * 0.6 + nz2.b * 0.6 - 0.1));
grassC = mix(grassC, gA.rgb * vec3(1.15, 1.0, 0.55), smoothstep(320.0, 520.0, y + nz.g * 80.0) * 0.6);
grassC = mix(grassC, vec3(lum3(gA.rgb)) * vec3(1.6, 1.25, 0.6), dry * smoothstep(0.3, 0.6, nz2.g + nzm.b * 0.3) * 0.75);
// ---- jungle floor: dark soil, leaf litter, moss
vec2 uvJ = vW.xz / 3.5;
vec4 jA = texAT(litA, uvJ, nz2.b); vec4 jP = texAT(litP, uvJ, nz2.b);
vec3 jungleC = jA.rgb * vec3(0.7, 0.72, 0.6);
jungleC = mix(jungleC, gA.rgb * vec3(0.45, 0.62, 0.3), smoothstep(0.5, 0.75, nzm.b) * 0.55);
// ---- Hawaiian red dirt
vec2 uvD = vW.xz / 4.5;
vec4 dA = texAT(dirA, uvD, nz2.r); vec4 dP = texAT(dirP, uvD, nz2.r);
vec3 dTN = unpackNP(dP);
if (slopeM > 0.2) {
  // banks: side projections, or the top projection smears down the slope
  vec2 w2 = pow(abs(Ng.xz), vec2(4.0)); w2 /= (w2.x + w2.y + 1e-4);
  float wt = smoothstep(0.2, 0.32, slopeM);
  vec4 aX = texture(dirA, vW.zy / 4.5), aZ = texture(dirA, vW.xy / 4.5);
  vec4 pX = texture(dirP, vW.zy / 4.5), pZ = texture(dirP, vW.xy / 4.5);
  dA = mix(dA, aX * w2.x + aZ * w2.y, wt);
  dP = mix(dP, pX * w2.x + pZ * w2.y, wt);
  // side normals are in the face's plane; approximate them as top-tangent so they still read as relief
  dTN = normalize(mix(dTN, unpackNP(dP), wt));
}
vec3 dirtC = mix(dA.rgb, vec3(lum3(dA.rgb)) * vec3(1.75, 0.72, 0.42), 0.55);
dirtC = mix(dirtC, dirtC * vec3(0.8, 0.62, 0.55), smoothstep(0.55, 0.8, nzm.r) * 0.6);

// ---- rock: top projected for the shelves, triplanar layered basalt for the cliffs
vec2 uvR = vW.xz / 5.0;
vec4 rA = texAT(rokA, uvR, nz2.g); vec4 rP = texAT(rokP, uvR, nz2.g);
vec3 rockTopC = vec3(pow(lum3(rA.rgb), 0.75) * 0.42) * vec3(2.4, 2.3, 2.2);
vec3 rockTopN = unpackNP(rP);
// tide pools: still water left in the hollows of the coastal shelves
float pool = smoothstep(0.66, 0.72, texture(tNoise, vW.xz / 9.0).b) * coast * (1.0 - smoothstep(1.2, 2.2, y));

vec3 cliffC = vec3(0.0); vec3 cliffN = Ng; float cliffAO = 1.0, cliffR = 0.85;
if (wCliff > 0.005) {
  vec3 bw = pow(abs(Ng), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float rs = 1.0 / 9.0;
  vec2 uX = vW.zy * rs, uY = vW.xz * rs, uZ = vW.xy * rs;
  vec4 cX = texture(rokA, uX), cY = texture(rokA, uY), cZ = texture(rokA, uZ);
  vec4 pX = texture(rokP, uX), pY = texture(rokP, uY), pZ = texture(rokP, uZ);
  cliffC = vec3(pow(lum3(cX.rgb * bw.x + cY.rgb * bw.y + cZ.rgb * bw.z), 0.75) * 0.42);
  cliffAO = pX.b * bw.x + pY.b * bw.y + pZ.b * bw.z;
  vec3 tnX = unpackNP(pX), tnY = unpackNP(pY), tnZ = unpackNP(pZ);
  tnX = vec3(tnX.xy + Ng.zy, abs(tnX.z) * Ng.x);
  tnY = vec3(tnY.xy + Ng.xz, abs(tnY.z) * Ng.y);
  tnZ = vec3(tnZ.xy + Ng.xy, abs(tnZ.z) * Ng.z);
  cliffN = normalize(tnX.zyx * bw.x + tnY.xzy * bw.y + tnZ.xyz * bw.z);
  // stacked lava flows: dense grey-black basalt beds split by thin rusty clinker and ash layers
  float yb = y + texture(tNoise, vW.xz / 160.0).r * 18.0;
  // (the noise is sampled blurred: a 1D line through it is otherwise full of hairline stripes)
  float bed = texture(tNoise, vec2(yb / 9.0, 0.37), 2.0).r;
  float seam = smoothstep(0.6, 0.7, texture(tNoise, vec2(yb / 24.0, 0.71), 2.5).g);
  cliffC *= mix(vec3(1.9, 1.85, 1.8), vec3(2.5, 2.4, 2.3), smoothstep(0.3, 0.7, bed));
  cliffC = mix(cliffC, vec3(0.16, 0.08, 0.05) * (0.8 + bed * 0.4), seam * 0.4);
  // Hawaiian valley walls are draped in green: ferns and moss over the rock except on the sheerest faces
  float ledge = smoothstep(0.45, 0.75, Ng.y + (nzm.g - 0.5) * 0.4 + (nz2.b - 0.5) * 0.3) * smoothstep(8.0, 40.0, y) * (1.0 - snow);
  // velvet-green ridges: all but the sheerest faces carry a skin of ferns and moss, opening in patches
  float drape = smoothstep(0.35, 0.7, veg) * smoothstep(8.0, 40.0, y) * (1.0 - snow);
  ledge = max(ledge, drape * max(1.0 - smoothstep(0.55, 0.78, slopeM + (nz2.b - 0.5) * 0.2), smoothstep(0.5, 0.72, nz2.b * 0.6 + nzm.r * 0.5)));
  cliffC = mix(cliffC, mix(grassC * 0.6, jungleC * 0.9, wJungle), ledge * 0.9);
  float runoff = texture(tNoise, vec2(dot(vW.xz, vec2(-Ng.z, Ng.x)) / 3.0, yb / 70.0)).r;
  cliffC *= mix(0.75, 1.15, runoff);
  cliffN = normalize(mix(cliffN, Ng, seam * 0.4));
  cliffR = 0.8 + (cX.a * bw.x + cY.a * bw.y + cZ.a * bw.z) * 0.15;
}

// ---- compose the top layers
vec3 col = mix(dirtC, grassC, veg);
vec3 tn = normalize(mix(dTN, unpackNP(gP), veg));
float ao = mix(dP.b, gP.b, veg);
float rgh = mix(0.95, 0.9, veg);
col = mix(col, jungleC, wJungle * veg);
tn = normalize(mix(tn, unpackNP(jP), wJungle * veg)); ao = mix(ao, jP.b, wJungle * veg);
col = mix(col, dirtC, wDirt * land);
tn = normalize(mix(tn, dTN, wDirt * land)); ao = mix(ao, dP.b, wDirt * land);
// sea floor near the shore: dark sand and silt
float sub = 1.0 - land;
col = mix(col, sandC * 0.8, sub);
// old lava rock and the reef shelf (wet algae on rock just under and at sea level)
float wRock = max(wRockB, sub * 0.5 * smoothstep(0.4, 0.7, nz2.r));
float reef = (1.0 - smoothstep(0.1, 0.9, y)) * smoothstep(-5.0, -0.6, y) * max(bm.a, 1.0 - wSand);
vec3 rockC = rockTopC;
rockC = mix(rockC, rockTopC * vec3(0.7, 1.05, 0.55) + vec3(0.03, 0.05, 0.01) * smoothstep(0.4, 0.7, nzm.g), reef);
rockC *= mix(1.0, 0.55, coast * (1.0 - smoothstep(0.6, 2.0, y)));
col = mix(col, rockC, wRock);
tn = normalize(mix(tn, rockTopN, wRock)); ao = mix(ao, rP.b, wRock);
rgh = mix(rgh, mix(0.75, 0.25, max(reef, coast * (1.0 - smoothstep(0.6, 2.0, y)))), wRock);
col = mix(col, sandC, wSand);
tn = normalize(mix(tn, sandN, wSand)); ao = mix(ao, sd.ao, wSand); rgh = mix(rgh, sandR, wSand);
col = mix(col, col * vec3(0.25, 0.3, 0.32), pool * wRock); rgh = mix(rgh, 0.05, pool * wRock);
tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), pool * wRock));

// fresh lava from the lava thread: glassy black pahoehoe where smooth, broken clinker where 'a'a
if (fresh > 0.01) {
  float rope = texture(tNoise, vW.xz / 1.6 + texture(tNoise, vW.xz / 11.0).rg * 0.6).r;
  vec3 pahoe = vec3(0.035, 0.033, 0.032) * (0.7 + rope * 0.6) + vec3(0.02, 0.016, 0.014) * smoothstep(0.7, 0.85, nzm.r);
  vec3 clink = rockTopC * 0.45 + vec3(0.03, 0.012, 0.006) * smoothstep(0.5, 0.8, nzm.b);
  vec3 lavC = mix(pahoe, clink, aa);
  vec3 ropeN = normalize(vec3((texture(tNoise, vW.xz / 1.6 + vec2(0.01, 0.0)).r - rope) * 9.0, (texture(tNoise, vW.xz / 1.6 + vec2(0.0, 0.01)).r - rope) * 9.0, 1.0));
  col = mix(col, lavC, fresh);
  tn = normalize(mix(tn, mix(ropeN, normalize(rockTopN * vec3(2.0, 2.0, 1.0)), aa), fresh));
  rgh = mix(rgh, mix(0.28, 0.97, aa), fresh);
}

// macro tonal variation so the slopes don't read flat at distance; erosion streaks down the fall line
col *= mix(0.8, 1.12, nz.g) * mix(0.9, 1.07, nz2.r);
col *= mix(1.0, mix(0.7, 1.25, smoothstep(0.3, 0.75, gully)), gK * (1.0 - wSand) * 0.8);
float midK = smoothstep(12.0, 40.0, camD) * (1.0 - smoothstep(150.0, 400.0, camD));
col *= mix(1.0, mix(0.82, 1.1, nzm.r) * mix(0.93, 1.05, nzm.b), midK);
// near: grit and pebbles
float grit = texture(tNoise, vW.xz / 0.55).g;
col *= mix(1.0, mix(0.8, 1.15, smoothstep(0.35, 0.8, grit)), (1.0 - smoothstep(6.0, 30.0, camD)) * 0.5 * (1.0 - wSand));

// snow on the summit
vec3 snowC = vec3(0.86, 0.88, 0.92) * mix(0.9, 1.04, nzm.g);
col = mix(col, snowC, snow);
tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), snow * 0.6));
rgh = mix(rgh, 0.55, snow);

vec3 wN = topToWorld(tn, Ng);
wN = normalize(mix(wN, cliffN, wCliff));
// the gully sides catch the light
float gd = (texture(tNoise, gq + vec2(0.01, 0.0)).r - texture(tNoise, gq - vec2(0.01, 0.0)).r) * 3.0;
wN = normalize(wN + vec3(-fall.y, 0.0, fall.x) * gd * 2.5 * gK * (1.0 - wCliff));
col = mix(col, mix(cliffC, snowC, snow * 0.7), wCliff);
ao = mix(ao, cliffAO, wCliff);
rgh = mix(rgh, cliffR, wCliff);
// the sea floor fades into deep blue water with depth (the sky dome below the horizon matches)
col = mix(col, vec3(0.012, 0.04, 0.06), smoothstep(-1.0, -25.0, y));
// weather: rain darkens and glosses everything but the sea floor
col *= mix(1.0, 0.7, uWet * land);
rgh = mix(rgh, rgh * 0.45, uWet * land);
gN = wN; gAO = ao; gR = rgh;
diffuseColor.rgb = col;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(gR, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', `
float ambientOcclusion = gAO;
reflectedLight.indirectDiffuse *= ambientOcclusion;
reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, 0.5);
reflectedLight.indirectSpecular *= ambientOcclusion;`);
  };
  mat.customProgramCacheKey = () => 'kaiele-ground';
  const group = new THREE.Group();
  for (const geo of buildGeometry(world, quality)) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.material = mat;
  return group;
}
