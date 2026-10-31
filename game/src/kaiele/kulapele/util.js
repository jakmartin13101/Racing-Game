import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../../world.js';

// Shared bits for Kula Pele's set pieces: collision groups, strips laid along the track rows, lumpy rock
// geometry, a triplanar basalt material (optionally seamed with glowing cracks), and the "shade" patch that lets
// a mesh carry its own baked darkness (the lava tube interior, which the sun's shadow map cannot cover end to end).
export const G_GROUND = (0x0001 << 16) | 0xffff;
export const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tq = new THREE.Quaternion();
export const UP = new THREE.Vector3(0, 1, 0);
export const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
export { mulberry };

// rows a..b (inclusive, wrapping) in driving order
export function rowsBetween(track, a, b, step = 1) {
  const out = [];
  const n = track.ahead(a, b);
  for (let k = 0; k <= n; k += step) out.push(track.wrap(a + k));
  if (out[out.length - 1] !== track.wrap(b)) out.push(track.wrap(b));
  return out;
}

// is row i inside [a, b] (wrapping)
export function inRange(track, i, a, b) { return track.ahead(a, i) <= track.ahead(a, b); }

// metres along the lap at each row (row 0 = 0)
export function cumulative(track) {
  const S = new Float32Array(track.n + 1);
  for (let i = 1; i <= track.n; i++) {
    const a = track.at(i - 1), b = track.at(i);
    S[i] = S[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]);
  }
  return S;
}

// signed metres from row a to row b, the short way round
export function signed(track, a, b) {
  if (!track.closed) return b - a;
  const n = track.n;
  let d = ((b - a) % n + n) % n;
  if (d > n / 2) d -= n;
  return d;
}

export const isGap = (track, i) => !!track.at(i)[4];

// A strip along track rows: one vertex per (row, lat). y(i, lat, x, z) gives the height; attrs(i, lat, k) returns
// extra per-vertex attributes as { name: [values] }. uv = (metres along, lat). Quads touching a lava-gap row are
// left out unless keepGap.
export function strip(track, rows, lats, y, { S = null, attrs = null, keepGap = false, flip = false } = {}) {
  const P = [], UV = [], idx = [], extra = {};
  const f = {};
  rows.forEach((i, r) => {
    track.frame(i, f);
    const along = S ? S[i] : i;
    lats.forEach((lat, k) => {
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      P.push(x, y(i, lat, x, z, k), z);
      UV.push(along, lat);
      if (attrs) {
        const a = attrs(i, lat, k, r);
        for (const key in a) (extra[key] ||= { size: a[key].length, v: [] }).v.push(...a[key]);
      }
    });
  });
  const m = lats.length;
  for (let r = 0; r < rows.length - 1; r++) {
    if (!keepGap && (isGap(track, rows[r]) || isGap(track, rows[r + 1]))) continue;
    for (let k = 0; k < m - 1; k++) {
      const a = r * m + k, b = a + 1, c = a + m, d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  for (const key in extra) g.setAttribute(key, new THREE.Float32BufferAttribute(extra[key].v, extra[key].size));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// lumpy rock: a subdivided icosahedron pushed about by a few sine octaves; sharp = jagged clinker
export function rockGeo(seed, detail = 2, { flat = 0.85, sharp = 0, smoothN = false } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = mulberry(seed);
  const k = [r() * 6, r() * 6, r() * 6, r() * 6, r() * 6];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let n = 1 + 0.18 * Math.sin(v.x * 3.1 + k[0]) * Math.sin(v.y * 2.7 + k[1]) + 0.1 * Math.sin(v.z * 5.3 + k[2]) + 0.06 * Math.sin((v.x + v.y) * 9 + k[3]);
    if (sharp) n += sharp * (Math.abs(Math.sin(v.x * 7.3 + k[4]) * Math.sin(v.z * 6.1 + k[0]) * Math.sin(v.y * 8.7)) - 0.25);
    v.multiplyScalar(n);
    v.y *= flat;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // faceted (fractured clinker) or welded smooth (weathered boulders)
  if (!smoothN) { g.computeVertexNormals(); return g; }
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const out = mergeVertices(g, 1e-4);
  out.computeVertexNormals();
  return out;
}

const GLSL_TRI = /* glsl */`
vec3 kpUnpack(vec4 c) { vec2 xy = c.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
`;

// world-position and world-normal varyings for any (instanced or not) mesh
export function patchWorld(sh, extra = '') {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vW; varying vec3 vNw;${extra}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 kpW = vec4(transformed, 1.0);
vec3 kpN = objectNormal;
#ifdef USE_INSTANCING
kpW = instanceMatrix * kpW; kpN = mat3(instanceMatrix) * kpN;
#endif
vW = (modelMatrix * kpW).xyz; vNw = normalize(mat3(modelMatrix) * kpN);`);
}

// Rough basalt, triplanar from the cliff set. opts:
//  tint: colour multiplier; scale: metres per texture tile; rough: roughness bias
//  glow: { amp (uniform object or number), low: world y where cracks glow brightest, range: metres it fades over,
//          width: crack width 0..1, scale: crack pattern scale, patch: 0..1 how patchy the glowing areas are }
//  heat: 0..1 glow of the surface itself near `low` (radiant heat from lava below)
//  shade: true to read a per-vertex 'shade' attribute (baked darkness, 0..1) that scales the lighting
//  vcol: multiply by vertex colours
export function basaltMaterial(M, opts = {}) {
  const { tint = [0.55, 0.52, 0.5], scale = 4.5, glow = null, shade = false, vcol = false, heat = 0, rough = 0, side = THREE.FrontSide, key = '', cracks = null } = opts;
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...tint), roughness: 1, metalness: 0, side, vertexColors: vcol, envMapIntensity: 0.6 });
  const amp = glow ? (typeof glow.amp === 'object' ? glow.amp : { value: glow.amp ?? 1 }) : { value: 0 };
  m.userData.glow = amp;
  const low = glow?.low ?? -1e5, range = glow?.range ?? 6;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { basA: { value: M.bas.a }, basP: { value: M.bas.p }, tNoise: { value: smoothNoise() }, tCrk: { value: cracks || glow?.tex || smoothNoise() }, uGlow: amp, uLow: { value: low } });
    patchWorld(sh, shade ? '\nattribute float shade; varying float vShade;' : '');
    if (shade) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = shade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vNw; uniform sampler2D basA, basP, tNoise, tCrk; uniform float uGlow, uLow;${shade ? ' varying float vShade;' : ''}
${GLSL_TRI}
vec3 kpBl; float kpR; vec3 kpTN;`)
      .replace('#include <map_fragment>', /* glsl */`
vec3 Nw0 = normalize(vNw) * (gl_FrontFacing ? 1.0 : -1.0);
kpBl = pow(abs(Nw0), vec3(4.0)); kpBl /= dot(kpBl, vec3(1.0));
float S = ${scale.toFixed(2)};
vec2 uX = vW.zy / S, uY = vW.xz / S, uZ = vW.xy / S;
vec4 aX = texture(basA, uX), aY = texture(basA, uY), aZ = texture(basA, uZ);
vec4 A = aX * kpBl.x + aY * kpBl.y + aZ * kpBl.z;
float nB = texture(tNoise, vW.xz / 37.0 + vW.y / 53.0).r * 0.7 + texture(tNoise, (vW.zy + vW.xy) / 9.0).g * 0.3;
// basalt: grey-black with a faint warm cast, weathered lighter in big soft patches
vec3 col = mix(vec3(dot(A.rgb, vec3(0.33))), A.rgb, 0.35) * (0.7 + nB * 0.6);
diffuseColor.rgb *= col;
kpR = clamp(A.a + ${rough.toFixed(2)}, 0.3, 1.0);
vec3 tX = kpUnpack(texture(basP, uX)), tY = kpUnpack(texture(basP, uY)), tZ = kpUnpack(texture(basP, uZ));
tX = vec3(tX.xy + Nw0.zy, abs(tX.z) * Nw0.x);
tY = vec3(tY.xy + Nw0.xz, abs(tY.z) * Nw0.y);
tZ = vec3(tZ.xy + Nw0.xy, abs(tZ.z) * Nw0.z);
kpTN = normalize(tX.zyx * kpBl.x + tY.xzy * kpBl.y + tZ.xyz * kpBl.z);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kpR;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(kpTN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${glow ? /* glsl */`
{
  // glowing seams: a crack network, triplanar, brightest low down near the lava, only in patches
  float cs = ${(glow.scale ?? 1).toFixed(3)} / 7.0;
  float cX = texture(tCrk, vW.zy * cs).a, cY = texture(tCrk, vW.xz * cs).a, cZ = texture(tCrk, vW.xy * cs).a;
  float crack = smoothstep(0.25, 0.9, cX * kpBl.x + cY * kpBl.y + cZ * kpBl.z);
  float pn = texture(tNoise, vW.xz / 60.0 + vW.y / 45.0).b;
  float patchy = smoothstep(${(0.35 + (glow.patch ?? 0) * 0.3).toFixed(2)}, ${(0.5 + (glow.patch ?? 0) * 0.3).toFixed(2)}, pn);
  float lowK = 1.0 - smoothstep(uLow, uLow + ${range.toFixed(2)}, vW.y);
  float flick = 0.8 + 0.2 * sin(vW.x * 0.7 + vW.z * 0.5 + uGlow * 0.0);
  totalEmissiveRadiance += vec3(2.6, 0.62, 0.08) * crack * patchy * lowK * uGlow * flick;
  totalEmissiveRadiance += vec3(0.9, 0.18, 0.03) * pow(lowK, 3.0) * ${heat.toFixed(2)} * uGlow;
}` : ''}`);
    if (shade) shadeLights(sh);
  };
  m.customProgramCacheKey = () => `kp-basalt-${scale}-${!!glow}-${low}-${range}-${glow?.width}-${glow?.scale}-${glow?.patch}-${shade}-${vcol}-${heat}-${rough}-${key}`;
  return m;
}

// The baked 'shade' (0..1) dims the sun and the sky's light (ambient, hemisphere, image light) but not point
// lights, so a lamp or a glowing crack still lights a dark tunnel. Needs a 'vShade' varying in the fragment shader.
export function shadeLights(sh) {
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= vShade;'))
    .replace('#include <lights_fragment_end>', 'irradiance *= vShade; iblIrradiance *= vShade; radiance *= vShade;\n#include <lights_fragment_end>');
}

// adds the per-vertex 'shade' attribute and the lighting multiplier to a standard material's shader
export function shadePatch(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float shade; varying float vShade;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = shade;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShade;');
  shadeLights(sh);
}

// a canvas texture helper
export function canvasTex(w, h, draw, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// a terrain-hugging square decal (centre x,z, size s, yaw), for stains and scorch
export function groundDecal(world, x, z, s, yaw, mat, lift = 0.08, N = 10) {
  const g = new THREE.PlaneGeometry(1, 1, N, N).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (let k = 0; k < p.count; k++) {
    const u = p.getX(k) * s, v = p.getZ(k) * s;
    const wx = x + u * c - v * sn, wz = z + u * sn + v * c;
    p.setXYZ(k, wx, world.heightAt(wx, wz) + lift, wz);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  m.receiveShadow = true;
  return m;
}

// Smooth tileable fBm noise, four independent channels: sampled at world / S it has features from S/4 down to
// S/32 (the shared noise.png is closer to white noise, too busy for large patches and crack bands)
let noiseTex = null;
export function smoothNoise() {
  if (noiseTex) return noiseTex;
  const N = 256, data = new Uint8Array(N * N * 4);
  const r = mulberry(2024);
  for (let ch = 0; ch < 4; ch++) {
    const acc = new Float32Array(N * N);
    let amp = 1, tot = 0;
    for (const cells of [4, 8, 16, 32]) {
      const g = new Float32Array(cells * cells);
      for (let k = 0; k < g.length; k++) g[k] = r();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = x / N * cells, fy = y / N * cells;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = g[iy * cells + ix], b = g[iy * cells + (ix + 1) % cells], c = g[((iy + 1) % cells) * cells + ix], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
        acc[y * N + x] += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
      }
      tot += amp; amp *= 0.5;
    }
    // stretch to use the full range
    let lo = 1e9, hi = -1e9;
    for (const v of acc) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let k = 0; k < N * N; k++) data[k * 4 + ch] = Math.round((acc[k] - lo) / (hi - lo) * 255);
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// glow sprite texture (radial falloff) shared by beacons and lamps
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }, { srgb: false });
  return glowTex;
}

// dispose every geometry/material/texture under a group
export function disposeTree(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of ['map', 'normalMap', 'bumpMap', 'emissiveMap', 'alphaMap', 'roughnessMap']) if (m[k] && m[k].isCanvasTexture && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
      m.dispose();
    }
  });
  glowTex = null;
  if (noiseTex) { noiseTex.dispose(); noiseTex = null; }
}
