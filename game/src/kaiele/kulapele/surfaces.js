import * as THREE from 'three';
import { vnoise } from '../../world.js';
import { crackCanvas } from '../../quake.js';
import { strip, rowsBetween, cumulative, clamp, smooth, mulberry, signed, smoothNoise, shadeLights } from './util.js';

// Kula Pele's road surfaces, laid as overlay strips on top of the shared gravel ribbon:
//  asphalt   the old Belt Road: oxidised, cracked and patched, faded double yellow centre line and white edge
//            lines, and the shoulders (in places the lanes) buried under lobes of old black pāhoehoe
//  pahoehoe  smooth ropy lava the road crew graded a track across, dusty in the wheel paths
//  rock      the natural basalt ramp onto the first lava stream, cinders spread over it
//  crust     the crust ridge onto the third stream: plates of cooling crust with glowing seams
//  aa        ʻaʻā clinker fields either side of the road
// vertex attribute kp = (age or heat, lobe left, lobe right, fade); shade = baked lighting multiplier

const GLSL = /* glsl */`
float kpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kpLine(float d, float w) { float aa = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
// smooth, ropy pāhoehoe: glassy black, folded into ropes in places, silvery where the glass rind catches the sky
void kpPahoehoe(vec2 q, float along, float lat, sampler2D tN, out vec3 col, out float rough, out vec2 dn) {
  float w1 = texture(tN, q / 17.0).r, w2 = texture(tN, q / 5.5).g, w3 = texture(tN, q / 41.0).b;
  float s = lat * 0.7 + along * 0.45 + w1 * 6.0 + w2 * 1.6 + lat * lat * 0.03;
  float ropeK = smoothstep(0.45, 0.7, w3);
  float r = sin(s * 18.0);
  float hump = (texture(tN, q / 2.6).r - 0.5);
  dn = vec2(cos(s * 18.0) * 0.55 * ropeK, 0.0) + vec2(hump * 0.9, (texture(tN, q / 2.6 + 0.3).r - 0.5) * 0.9);
  col = vec3(0.028, 0.029, 0.033) * (0.75 + 0.5 * w2) + vec3(0.02) * r * ropeK;
  // weathered grey bloom and the odd rust stain
  col = mix(col, vec3(0.075, 0.07, 0.066), smoothstep(0.55, 0.85, w1) * 0.6);
  col = mix(col, vec3(0.09, 0.045, 0.02), smoothstep(0.78, 0.9, texture(tN, q / 9.0).b) * 0.35);
  rough = mix(0.32, 0.62, w2) + ropeK * 0.08;
}
`;

function crackTex(seed, opts) {
  const t = crackCanvas(mulberry(seed), 512, 512, opts);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function surfaceMaterial(M, kind, W, { tex, glow } = {}) {
  const mat = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  const uniforms = {
    tNoise: { value: smoothNoise() }, tDetail: { value: M.detail }, tCrA: { value: tex.crA }, tCrB: { value: tex.crB },
    scoA: { value: M.sco.a }, scoP: { value: M.sco.p }, basA: { value: M.bas.a }, basP: { value: M.bas.p }, brA: { value: M.burnt.a },
    uHalfW: { value: W / 2 }, uGlow: glow || { value: 1 }, uTime: tex.time,
  };
  mat.userData.uniforms = uniforms;
  const body = {
    asphalt: /* glsl */`
float age = vKp.x;
vec3 nzf = texture(tNoise, vW.xz / 23.0).rgb;
float ag1 = texture(tNoise, vW.xz / 0.31).r, ag2 = texture(tNoise, vW.xz / 0.11 + 0.5).g;
// binder: fresh black on the ranger road, oxidised to a dusty grey on the old highway
vec3 bin = mix(vec3(0.026, 0.026, 0.028), vec3(0.078, 0.075, 0.07), age) * (0.82 + 0.36 * nzf.r);
vec3 col = bin * (0.82 + 0.42 * smoothstep(0.55, 0.85, ag1)) * (0.9 + 0.2 * ag2);
// worn surface: the binder has gone from the stones in places
col = mix(col, vec3(0.15, 0.145, 0.135), smoothstep(0.8, 0.9, ag2) * age * 0.55);
float al = abs(lat);
float wt = exp(-pow((al - 2.7) / 0.55, 2.0)) + exp(-pow((al - 4.9) / 0.55, 2.0));
col *= 1.0 - wt * (0.1 + 0.08 * age);
float rough = 0.9 - wt * 0.14;
float paintK = 0.0; vec3 paintC = vec3(0.0);
// patches: rectangles of newer, blacker asphalt, outlined with tar; no paint on them
vec2 cell = vec2(floor(along / 8.5), floor((lat + 30.0) / 3.75));
vec2 cf = vec2(fract(along / 8.5), fract((lat + 30.0) / 3.75));
float ph = kpHash(cell);
float pat = (ph > 1.0 - 0.1 * age && al < uHalfW - 0.4 && vKp.y > -20.0) ? 1.0 : 0.0;
vec2 pr = vec2(0.12 + 0.2 * kpHash(cell + 3.1), 0.1 + 0.15 * kpHash(cell + 5.7));
float inPatch = pat * step(pr.x, cf.x) * step(cf.x, 1.0 - pr.x * 0.6) * step(pr.y, cf.y) * step(cf.y, 1.0 - pr.y);
float pEdge = pat * max(kpLine(cf.x - pr.x, 0.006), kpLine(cf.x - (1.0 - pr.x * 0.6), 0.006)) * step(pr.y, cf.y) * step(cf.y, 1.0 - pr.y)
  + pat * max(kpLine(cf.y - pr.y, 0.02), kpLine(cf.y - (1.0 - pr.y), 0.02)) * step(pr.x, cf.x) * step(cf.x, 1.0 - pr.x * 0.6);
col = mix(col, col * 0.72 * (0.9 + 0.2 * ag1), inPatch);
// markings: double yellow centre line (one line dashed on the ranger road), white edge lines; faded and flaking
float fl = texture(tNoise, vec2(along / 1.9, lat * 1.3)).r * 0.6 + texture(tNoise, vW.xz / 0.6).g * 0.4;
float keep = smoothstep(0.3, 0.55, fl + 0.45 - age * 0.42);
float dash = step(0.45, fract(along / 12.0));
float cy = max(kpLine(lat - 0.17, 0.055), kpLine(lat + 0.17, 0.055) * mix(dash, 1.0, step(0.5, age)));
float ew = kpLine(al - (uHalfW - 0.5), 0.07);
paintK = max(cy, ew) * keep * (1.0 - inPatch);
paintC = mix(vec3(0.95, 0.93, 0.86), vec3(0.78, 0.55, 0.08), cy) * mix(0.75, 0.42, age);
col = mix(col, paintC, paintK);
rough = mix(rough, 0.7, paintK);
// cracks: block cracking and alligator crazing on the old road, transverse cracks right across, the centre joint
vec4 cA = texture(tCrA, vec2(along / 29.0, lat / 16.0 + 0.5));
vec4 cB = texture(tCrB, vec2(along / 9.0 + 0.3, lat / 7.0));
float craze = smoothstep(0.62, 0.8, texture(tNoise, vec2(along / 70.0, lat / 25.0)).g + wt * 0.08) * age * 0.6;
float blockK = smoothstep(0.35, 0.65, texture(tNoise, vec2(along / 53.0, lat / 40.0 + 0.6)).r) * smoothstep(0.15, 0.6, age);
float crk = max(cA.a * blockK, cB.a * craze) * 0.8;
float tc = along + (texture(tNoise, vec2(lat / 7.0, along / 13.0)).r - 0.5) * 1.4;
float tcell = floor(tc / 13.0);
crk = max(crk, kpLine(fract(tc / 13.0) - 0.5, 0.0035) * step(0.35, kpHash(vec2(tcell, 7.0))) * step(0.25, age) * 0.9);
crk = max(crk, kpLine(lat - 0.55 - (texture(tNoise, vec2(along / 9.0, 0.7)).r - 0.5) * 0.5, 0.025) * smoothstep(0.4, 0.8, age) * 0.85);
// some of it sealed with glossy tar snakes, the rest open and dusty
float seal = smoothstep(0.5, 0.65, texture(tNoise, vec2(along / 40.0, lat / 31.0 + 0.4)).b);
col = mix(col, mix(vec3(0.012), vec3(0.008), seal), crk * (1.0 - inPatch * 0.7));
rough = mix(rough, mix(0.95, 0.35, seal), crk);
col = mix(col, vec3(0.01), pEdge * 0.6);
// crumbling edge: the asphalt breaks up into the shoulder
float eN = (texture(tNoise, vW.xz / 1.3).r - 0.5) * 0.7 + (texture(tNoise, vec2(along / 6.0, 0.2)).g - 0.5) * 0.8 * age;
float asphalt = 1.0 - smoothstep(uHalfW + 0.25 + eN - 0.05, uHalfW + 0.25 + eN + 0.05, al);
col *= 1.0 - smoothstep(uHalfW - 0.9, uHalfW + 0.3, al + eN) * 0.25;
vec2 dn = vec2(0.0);
// lobes of old pāhoehoe that ran over the road
float sc = (texture(tNoise, vW.xz / 5.0).r - 0.5) * 2.6 + (texture(tNoise, vW.xz / 1.6).g - 0.5) * 0.9;
float lobeD = max(-(lat + uHalfW) + vKp.y + sc, (lat - uHalfW) + vKp.z + sc);
float lobe = smoothstep(-0.06, 0.06, lobeD);
if (lobe > 0.0) {
  vec3 pc; float pr2; vec2 pdn;
  kpPahoehoe(vW.xz, along, lat, tNoise, pc, pr2, pdn);
  // the toe of each lobe: a raised, slightly paler rind with a shadow line in front of it
  float rim = 1.0 - smoothstep(0.0, 0.5, lobeD);
  pc *= 1.0 + rim * 0.4;
  col = mix(col, pc, lobe); rough = mix(rough, pr2, lobe); dn = mix(dn, pdn, lobe);
}
float shadowLine = smoothstep(-0.35, 0.0, lobeD) * (1.0 - lobe);
col *= 1.0 - shadowLine * 0.55;
diffuseColor.rgb = col;
diffuseColor.a = max(asphalt, max(lobe, shadowLine * 0.6)) * vKp.w;
kpR = rough;
kpDN = dn + (vec2(ag1, ag2) - 0.5) * 0.25 * (1.0 - lobe);
`,
    pahoehoe: /* glsl */`
vec3 pc; float pr2; vec2 pdn;
kpPahoehoe(vW.xz, along, lat, tNoise, pc, pr2, pdn);
float al = abs(lat);
// cooling cracks
vec4 cA = texture(tCrA, vW.xz / 19.0);
pc = mix(pc, vec3(0.006), cA.a * 0.8);
// the graded line: cinder grit and dust ground into the hollows, polished smoother in the wheel paths
vec4 G = texture(scoA, vW.xz / 3.0);
float lineK = 1.0 - smoothstep(uHalfW - 1.5, uHalfW + 1.0, al + (texture(tNoise, vW.xz / 3.0).r - 0.5) * 2.0);
float wt = exp(-pow((al - 2.6) / 0.8, 2.0)) + exp(-pow((al - 5.0) / 0.8, 2.0));
vec3 grit = mix(vec3(dot(G.rgb, vec3(0.33))), G.rgb, 0.3) * 0.5;
float gk = lineK * smoothstep(0.3, 0.7, texture(tNoise, vW.xz / 1.1).r + wt * 0.2) * 0.55;
vec3 col = mix(pc, grit, gk);
col = mix(col, col * 1.6 + vec3(0.02), wt * lineK * 0.35);
diffuseColor.rgb = col;
float eN = (texture(tNoise, vW.xz / 6.0).r - 0.5) * 5.0 + (texture(tNoise, vW.xz / 1.7).g - 0.5) * 1.2;
diffuseColor.a = (1.0 - smoothstep(uHalfW + 5.5 + eN - 0.1, uHalfW + 5.5 + eN + 0.1, al)) * vKp.w;
kpR = mix(pr2, 0.85, gk);
kpDN = pdn * (1.0 - gk * 0.7);
`,
    rock: /* glsl */`
vec4 A = texture(basA, vW.xz / 4.0), P = texture(basP, vW.xz / 4.0);
float n1 = texture(tNoise, vW.xz / 13.0).r;
vec3 rock = mix(vec3(dot(A.rgb, vec3(0.33))), A.rgb, 0.3) * (0.42 + 0.3 * n1);
float al = abs(lat);
vec4 G = texture(scoA, vW.xz / 2.6);
vec3 grit = mix(vec3(dot(G.rgb, vec3(0.33))), G.rgb, 0.35) * 0.62;
float lineK = 1.0 - smoothstep(uHalfW - 2.5, uHalfW + 0.5, al + (texture(tNoise, vW.xz / 2.5).r - 0.5) * 3.0);
float gk = lineK * smoothstep(0.35, 0.65, texture(tNoise, vW.xz / 1.4).g + 0.15);
vec3 col = mix(rock, grit, gk * 0.85);
// heat-stained near the lip
col = mix(col, col * vec3(1.25, 0.8, 0.6), vKp.x * 0.5);
diffuseColor.rgb = col;
float eN = (texture(tNoise, vW.xz / 4.0).r - 0.5) * 3.5;
diffuseColor.a = (1.0 - smoothstep(uHalfW + 3.5 + eN - 0.1, uHalfW + 3.5 + eN + 0.1, al)) * vKp.w;
kpR = mix(A.a, 0.95, gk);
kpDN = kpUnpack(P).xy * (1.0 - gk * 0.6) * 1.3;
`,
    crust: /* glsl */`
float heat = vKp.x;
float al = abs(lat);
vec4 A = texture(brA, vW.xz / 3.5);
float n1 = texture(tNoise, vW.xz / 9.0).r, n2 = texture(tNoise, vW.xz / 2.2).g;
// crust plates: dark, slaggy, oxidised rusty-brown at the edges, grey-silver where it is fresh and glassy
vec3 col = vec3(0.035, 0.03, 0.028) * (0.7 + 0.6 * n2);
col = mix(col, vec3(0.11, 0.05, 0.025), smoothstep(0.55, 0.85, n1) * 0.6);
col = mix(col, A.rgb * 0.35, 0.25);
vec4 cA = texture(tCrA, vW.xz / 9.0), cB = texture(tCrB, vW.xz / 4.0);
float seam = max(cA.a, cB.a * 0.6);
float lineK = 1.0 - smoothstep(uHalfW - 1.0, uHalfW + 1.0, al);
float wt = exp(-pow((al - 2.6) / 0.8, 2.0)) + exp(-pow((al - 5.0) / 0.8, 2.0));
col = mix(col, vec3(0.09, 0.085, 0.08), wt * lineK * 0.25);
col = mix(col, vec3(0.02, 0.006, 0.002), seam);
diffuseColor.rgb = col;
float eN = (texture(tNoise, vW.xz / 4.0).r - 0.5) * 4.0;
diffuseColor.a = (1.0 - smoothstep(uHalfW + 4.5 + eN - 0.1, uHalfW + 4.5 + eN + 0.1, al)) * vKp.w;
kpR = mix(0.85, 0.5, smoothstep(0.6, 0.9, n2));
kpDN = (vec2(n1, n2) - 0.5) * 0.9;
kpEm = vec3(2.8, 0.7, 0.1) * cA.a * heat * (0.55 + 0.45 * sin(uTime * 1.7 + n1 * 12.0)) + vec3(1.4, 0.3, 0.04) * cB.a * heat * heat * 0.6;
`,
    aa: /* glsl */`
float al = abs(lat);
vec4 A = texture(brA, vW.xz / 2.8), G = texture(scoA, vW.xz / 1.9 + 0.3);
float n1 = texture(tNoise, vW.xz / 7.0).r, n2 = texture(tNoise, vW.xz / 0.9).g, n3 = texture(tNoise, vW.xz / 31.0).b;
// clinker: jumbled black and rust-red rubble, ash-grey in the hollows
vec3 col = mix(vec3(0.035, 0.03, 0.028), vec3(0.13, 0.055, 0.03), smoothstep(0.5, 0.8, n1) * 0.8);
col = mix(col, G.rgb * 0.3, 0.3) * (0.55 + 0.9 * n2);
col = mix(col, vec3(0.1, 0.095, 0.09), smoothstep(0.65, 0.85, n3) * 0.4);
diffuseColor.rgb = col;
float inner = smoothstep(uHalfW + 0.8, uHalfW + 3.0, al + (n1 - 0.5) * 3.0);
float outer = 1.0 - smoothstep(uHalfW + 22.0, uHalfW + 30.0, al + (n3 - 0.5) * 12.0);
diffuseColor.a = inner * outer * vKp.w;
kpR = 0.95;
kpDN = (vec2(n2, texture(tNoise, vW.xz / 0.45).r) - 0.5) * 2.2;
`,
  }[kind];
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec2 vT; attribute vec4 kp; varying vec4 vKp; attribute float shade; varying float vShade;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vT = uv; vKp = kp; vShade = shade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec2 vT; varying vec4 vKp; varying float vShade;
uniform sampler2D tNoise, tDetail, tCrA, tCrB, scoA, scoP, basA, basP, brA; uniform float uHalfW, uGlow, uTime;
vec3 kpUnpack(vec4 c) { vec2 xy = c.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
${GLSL}
float kpR; vec2 kpDN; vec3 kpEm;`)
      .replace('#include <map_fragment>', `float along = vT.x, lat = vT.y; kpEm = vec3(0.0);\n${body}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kpR;')
      .replace('#include <normal_fragment_maps>', /* glsl */`
vec3 q0 = dFdx(vW), q1 = dFdy(vW);
vec2 st0 = dFdx(vT), st1 = dFdy(vT);
vec3 Nw = normalize(cross(q0, q1)); if (Nw.y < 0.0) Nw = -Nw;
vec3 q1p = cross(q1, Nw), q0p = cross(Nw, q0);
vec3 Tt = q1p * st0.x + q0p * st1.x, Bt = q1p * st0.y + q0p * st1.y;
float det = max(dot(Tt, Tt), dot(Bt, Bt));
float isc = det == 0.0 ? 0.0 : inversesqrt(det);
vec3 dN = texture(tDetail, vW.xz / 1.1).xyz * 2.0 - 1.0;
vec3 tn = normalize(vec3(kpDN + dN.xy * 0.15, 1.0));
vec3 wn = normalize(Tt * isc * tn.x + Bt * isc * tn.y + Nw * tn.z);
normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += kpEm * uGlow;')
      ;
    shadeLights(sh);
  };
  mat.customProgramCacheKey = () => `kp-surf-${kind}`;
  return mat;
}

// shared crack textures and a time uniform for every surface
export function surfaceTextures() {
  return {
    crA: crackTex(41, { main: 3, branches: 10, border: false, width: 3.2, cells: 0 }),
    crB: crackTex(77, { main: 1, branches: 5, border: false, width: 2.2, cells: 46 }),
    glowCr: crackTex(131, { main: 5, branches: 22, border: false, width: 7, cells: 0 }),
    time: { value: 0 },
  };
}

// Lays all the overlays from the track's sections. Returns { meshes, lobe(i) -> [left, right], age(i) }.
export function buildSurfaces(hz, ctx) {
  const t = hz.track, world = hz.world, W = t.width, hw = W / 2;
  const S = ctx.S || (ctx.S = cumulative(t));
  const sec = t.sections;
  const tex = ctx.tex;
  const out = [];
  const lift = 0.135;
  const yRoad = (i, lat, x, z) => world.heightAt(x, z) + lift;
  const lats = (w, step) => { const a = []; const n = Math.ceil((2 * w) / step); for (let k = 0; k <= n; k++) a.push(-w + (2 * w * k) / n); return a; };
  const lay = (kind, a, b, latW, latStep, kp, { step = 1, shade = null, mat = null, glow = null } = {}) => {
    const rows = rowsBetween(t, a, b, step);
    const n = rows.length;
    const g = strip(t, rows, lats(latW, latStep), yRoad, {
      S, attrs: (i, lat, k, r) => {
        return { kp: kp(i, lat, r / Math.max(1, n - 1)), shade: [shade ? shade(i, lat) : 1] };
      },
    });
    const m = new THREE.Mesh(g, mat || surfaceMaterial(hz.M, kind, W, { tex, glow }));
    m.renderOrder = 2;
    m.receiveShadow = true;
    ctx.group.add(m);
    out.push(m);
    return m;
  };
  // fade in and out over `e` metres at the ends of a run
  const ends = (u, len, e) => smooth(u * len, 0, e) * smooth((1 - u) * len, 0, e);

  // ---- asphalt: from the end of the flats, round past the line and all along the old highway, until the lava
  // swallows it
  const [ha, hb] = sec.highway;
  const [fa, fb] = sec.flats;
  const aStart = t.wrap(fb - 8), aEnd = t.wrap(hb + 45);
  const lobe = (i) => {
    // the old flow came down from the uphill side: lobes are big on one side, small on the other
    const s = S[i] || i;
    const k = t.ahead(t.wrap(ha - 60), i) < t.ahead(t.wrap(ha - 60), aEnd) ? 1 : 0.25;
    const n1 = vnoise(s / 55, 0.3, 1.7), n2 = vnoise(s / 17, 2.1, 0.4), n3 = vnoise(s / 70, 5.5, 3.1);
    let L = -4.5 + k * (Math.max(0, n1) * 7 + n2 * 1.5);
    let R = -4.5 + k * (Math.max(0, n3) * 6 + n2 * 1.2);
    // at the far end the flow has buried the lot
    const bury = smooth(signed(t, hb, i), -40, 45);
    L += bury * 10; R += bury * 10;
    return [Math.min(L, 2.6 + bury * 12), Math.min(R, 2.2 + bury * 12)];
  };
  const age = (i) => {
    // the ranger road was resurfaced; the old highway was not
    const d = t.ahead(t.wrap(ha - 70), i);
    return d <= t.ahead(t.wrap(ha - 70), aEnd) ? clamp(0.3 + smooth(d, 0, 90) * 0.7, 0, 1) : 0.3;
  };
  const aLen = t.ahead(aStart, aEnd);
  ctx.asphalt = lay('asphalt', aStart, aEnd, hw + 6, 1.25, (i, lat, u) => {
    const [L, R] = lobe(i);
    return [age(i), L, R, ends(u, aLen, 12)];
  });
  ctx.lobe = lobe; ctx.age = age;

  // ---- pāhoehoe: from where the highway is buried, over the lava plain to the tube and through it, out to the
  // flats; the crossings get their own surfaces
  const [ua, ub] = sec.tube;
  const pStart = t.wrap(hb + 20), pEnd = t.wrap(fa + 30);
  const cuts = [];
  for (const c of t.crossings || []) {
    if (c.kind === 'ramp') cuts.push([t.wrap(c.at - 48), t.wrap(c.gap[1] + 26), c]);
    else if (c.kind === 'ridge') cuts.push([t.wrap(c.at - 40), t.wrap(c.gap[1] + 22), c]);
    else cuts.push([t.wrap(c.bridge[0] - 7), t.wrap(c.bridge[1] + 7), c]);
  }
  cuts.sort((p, q) => t.ahead(pStart, p[0]) - t.ahead(pStart, q[0]));
  let from = pStart;
  const segs = [];
  for (const [a, b] of cuts) {
    if (t.ahead(pStart, a) > t.ahead(pStart, pEnd)) continue;
    segs.push([from, t.wrap(a + 4)]);
    from = t.wrap(b - 4);
  }
  segs.push([from, pEnd]);
  const tubeShade = ctx.tubeShade || (() => 1);
  for (const [a, b] of segs) {
    const len = t.ahead(a, b);
    if (len < 4) continue;
    lay('pahoehoe', a, b, hw + 9, 1.5, (i, lat, u) => [0, 0, 0, ends(u, len, a === pStart ? 40 : b === pEnd ? 40 : 5)], { shade: tubeShade, step: 1 });
  }

  // ---- the crossings' own surfaces
  for (const [a, b, c] of cuts) {
    if (c.kind === 'bridge') continue;
    const len = t.ahead(a, b);
    const lip = c.at, land = c.gap[1];
    const heat = (i) => {
      const d = Math.min(Math.abs(t.ahead(i, lip)), Math.abs(t.ahead(land, i)));
      return Math.exp(-Math.max(0, d) / (c.kind === 'ridge' ? 14 : 8));
    };
    lay(c.kind === 'ramp' ? 'rock' : 'crust', a, b, hw + 6, 1.25, (i, lat, u) => [heat(i), 0, 0, ends(u, len, 6)], { glow: ctx.glow });
  }

  // ---- ʻaʻā either side of the road over the flats and down the run in to them
  const aaA = t.wrap(ub + 10), aaB = t.wrap(fb + 10);
  const aaLen = t.ahead(aaA, aaB);
  const aaLats = [];
  for (const s of [-1, 1]) for (let k = 0; k <= 14; k++) aaLats.push(s * (hw + 0.5 + k * 2.2));
  aaLats.sort((p, q) => p - q);
  const aaRows = rowsBetween(t, aaA, aaB, 2);
  // two strips, one each side, so the road between stays clear of geometry
  for (const s of [-1, 1]) {
    const L = aaLats.filter((l) => Math.sign(l) === s);
    const g = strip(t, aaRows, s < 0 ? L : L, (i, lat, x, z) => world.heightAt(x, z) + 0.1, {
      S, attrs: (i, lat, k, r) => {
        const f = t.frame(i), x = f.x + f.nx * lat, z = f.z + f.nz * lat;
        const rise = Math.abs(world.heightAt(x, z) - t.at(i)[1]);
        return { kp: [0, 0, 0, ends(r / Math.max(1, aaRows.length - 1), aaLen, 30) * (1 - smooth(rise, 2, 5))], shade: [1] };
      },
    });
    const m = new THREE.Mesh(g, surfaceMaterial(hz.M, 'aa', W, { tex }));
    m.renderOrder = 2; m.receiveShadow = true;
    ctx.group.add(m); out.push(m);
  }
  return out;
}
