import * as THREE from 'three';
import { kaieleSet, kaieleShore, KAIELE_GLSL, SAND_GLSL } from './terrain.js';

// Kai'ele track surfaces: the ribbon of buildTrackRibbon (world.js), split into runs by track.surf, each run laid
// with its own surface shader. Runs overlap their neighbours by OV rows and fade in and out along the overlap, so
// one surface blends into the next; the edges fade into the ground with a noisy, surface-dependent width. Runs of
// one kind are merged into one mesh per track.
const KIND = { 0: 'coral', 1: 'sand', 2: 'wetsand', 3: 'lavarock', 4: 'dirt', 5: 'mud', 6: 'wetrock', 7: 'planks',
  8: 'grass', 9: 'reef', 10: 'whitesand', 11: 'coral' };
const SET = { coral: 'coral', sand: 'sand', wetsand: 'sand', whitesand: 'sand', lavarock: 'rock', wetrock: 'rock',
  reef: 'rock', dirt: 'dirt', mud: 'mud', planks: 'planks', grass: 'grass' };
const OV = 8, MINRUN = 10;
const ACROSS = [-1.6, -1.25, -1.0, -0.85, -0.7, -0.55, -0.4, -0.25, -0.12, 0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.25, 1.6];

export function buildKaieleRoads(world, M, track, quality) {
  const c = track.centre, n = c.length, W = track.width, closed = track.closed;
  const shared = track.shared || [];
  const surf = track.surf || [];
  const lift = 0.12 + Math.max(0, quality.terrainStep - 2) * 0.06; // coarse ground strays further from the field
  // per-row vertices (row n repeats row 0 on a closed track)
  const rows = closed ? n + 1 : n;
  const m = ACROSS.length;
  const P = new Float32Array(rows * m * 3), S = new Float32Array(rows);
  let s = 0;
  for (let i = 0; i < rows; i++) {
    const p = c[i % n];
    const q = closed ? c[(i + 1) % n] : c[Math.min(i + 1, n - 1)];
    const o = closed ? c[(i - 1 + n) % n] : c[Math.max(i - 1, 0)];
    const tx = q[0] - o[0], tz = q[2] - o[2], L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L;
    ACROSS.forEach((a, j) => {
      const x = p[0] + nx * a * W / 2, z = p[2] + nz * a * W / 2;
      P.set([x, world.heightAt(x, z) + lift, z], (i * m + j) * 3);
    });
    S[i] = s;
    if (i < rows - 1) s += Math.hypot(q[0] - p[0], q[2] - p[2]);
  }
  const total = s;
  // runs of one kind; slivers shorter than MINRUN rows join the run before them
  const kindAt = (i) => KIND[surf[i] ?? 0] || 'coral';
  let runs = [];
  for (let i = 0; i < n; i++) {
    const k = kindAt(i);
    if (runs.length && runs[runs.length - 1].k === k) runs[runs.length - 1].b = i + 1;
    else runs.push({ k, a: i, b: i + 1 });
  }
  for (let pass = 0; pass < 2; pass++) {
    const out = [];
    for (const r of runs) {
      if (out.length && (r.b - r.a < MINRUN || out[out.length - 1].k === r.k)) out[out.length - 1].b = r.b;
      else out.push({ ...r });
    }
    runs = out;
  }
  if (closed && runs.length > 1 && runs[0].k === runs[runs.length - 1].k) {
    const last = runs.pop();
    runs[0].a = last.a - n; // wraps through row 0
  }
  const loop = closed && runs.length === 1;
  // geometry per kind
  const byKind = {};
  for (const r of runs) {
    const g = (byKind[r.k] ||= { pos: [], uv: [], fade: [], idx: [] });
    const a = loop ? 0 : r.a - OV, b = loop ? n : r.b + OV;
    const base = g.pos.length / 3;
    for (let t = a; t <= b; t++) {
      let i = t;
      if (closed) i = ((t % n) + n) % n; else i = Math.min(Math.max(t, 0), n - 1);
      // fade 0..1 across the OV rows either side of the run's ends (none at a closed lap's seam)
      let f = loop ? 1 : Math.min(THREE.MathUtils.smoothstep(t, r.a - OV, r.a + OV), 1 - THREE.MathUtils.smoothstep(t, r.b - OV, r.b + OV));
      if (!closed && (t <= 0 || t >= n - 1)) f = 0;
      const rowI = loop && t === n ? n : i;
      for (let j = 0; j < m; j++) {
        const o = (rowI * m + j) * 3;
        g.pos.push(P[o], P[o + 1], P[o + 2]);
        // along: metres from the lap start, so textures run on continuously across runs
        g.uv.push(closed ? S[i] + Math.floor(t / n) * total : S[i], ACROSS[j] * W / 2);
        g.fade.push(f);
      }
    }
    const nr = b - a + 1;
    for (let k = 0; k < nr - 1; k++) {
      const i0 = closed ? (((a + k) % n) + n) % n : Math.min(Math.max(a + k, 0), n - 1);
      const i1 = closed ? (i0 + 1) % n : Math.min(i0 + 1, n - 1);
      if (i0 === i1) continue;
      if (c[i0][4] && c[i1][4]) continue; // jump gap
      if (shared.some(([sa, sb]) => i0 >= sa && i0 + 1 < sb)) continue; // drawn by the track it borrows
      for (let j = 0; j < m - 1; j++) {
        const q0 = base + k * m + j, q1 = q0 + 1, q2 = q0 + m, q3 = q2 + 1;
        g.idx.push(q0, q1, q2, q1, q3, q2);
      }
    }
  }
  const group = new THREE.Group();
  for (const [k, g] of Object.entries(byKind)) {
    if (!g.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('fade', new THREE.Float32BufferAttribute(g.fade, 1));
    geo.setIndex(g.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, surfaceMaterial(world, M, k, W, quality));
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

// Per-surface GLSL: given along/lat (m), rut (0..1+), rutD (d rut / d lat), noise nz/nzf, sample A/P and write
// col, tn (tangent normal: x along, y across), ao, rgh, and edgeW (how wide the edge fade runs, in metres).
const SURF = {
  coral: /* glsl */`
vec2 uv = vec2(along, lat) / 3.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
// crushed coral and limestone: bright, packed grey-white in the wheel tracks, loose and whiter on the crown
col = mix(A.rgb, vec3(lum3(A.rgb)), 0.3) * vec3(0.55, 0.52, 0.47);
col *= mix(1.0, 0.72, clamp(rut, 0.0, 1.0) * 0.7);
col = mix(col, col * vec3(0.95, 0.85, 0.75), smoothstep(0.55, 0.8, nzf.g) * 0.5); // red dirt worked up through it
tn = normalize(mix(unpackNP(Pk), vec3(0, 0, 1), clamp(rut, 0.0, 1.0) * 0.6));
tn.y += rutD * 0.05;
ao = Pk.b; rgh = mix(A.a * 0.3 + 0.65, 0.6, clamp(rut, 0.0, 1.0));
float stones = smoothstep(0.72, 0.8, texture(tNoise, vW.xz / 0.7).r) * (1.0 - clamp(rut, 0.0, 1.0));
col = mix(col, vec3(0.85, 0.84, 0.8), stones * 0.5);
POTHOLES(0.62, 0.55, 0.48)
edgeW = 1.0;`,
  // the beach itself (SAND_GLSL, world space, so it runs on seamlessly under the ribbon's soft edge) churned by
  // the traffic: every wheel line is a few overlapping tyre tracks, flat-bottomed ruts printed with tread lugs and
  // edged with berms of the sand they pushed aside, loose sand thrown up in heaps at the road's edges
  sand: /* glsl */`
SANDKIND
float ax = abs(lat);
float onRoad = 1.0 - smoothstep(uHalfW * 0.8, uHalfW * 1.15, ax + (nzf.b - 0.5) * 2.0);
float trod = onRoad * 0.92;
vec2 sh = texture(tX, vW.xz / uExtent + 0.5).rg;
Sand sd = sandAt(tA, tP, tNoise, vW, sh.r * 64.0 - 8.0, sh.g * 1.25, white, trod, camD, wetX);
// relief h (m) and its slope along and across; tread fades out once a lug is under a pixel
float hR = 0.0, hL = 0.0, hA = 0.0, tr = 0.0;
float lugK = 1.0 - smoothstep(0.012, 0.035, fwidth(along));
for (int k = 0; k < 4; k++) for (int m = 0; m < 3; m++) {
  // each wheel line: three trucks' tracks wandering about it (sines: no texture lookups in the loop)
  float fk = float(k), fm = float(m);
  float off = (fk - 1.5) * 1.75 + (k > 1 ? 0.25 : -0.25) + (sin(along / (23.0 + fk * 3.0) + fk * 1.7 + fm * 2.3) * 0.45 + sin(along / (9.1 + fm) + fm * 4.1 + fk) * 0.15) * (0.4 + fm * 0.5);
  float w = 0.19 + 0.04 * fm;
  float dep = (0.055 + 0.02 * sin(along / 6.3 + fk * 2.0 + fm)) * (1.0 - fm * 0.25);
  float d = l - off;
  float g = exp(-d * d / (w * w));
  float bw = w * 0.7, bd = (abs(d) - w * 1.6) / bw, be = exp(-bd * bd) * 0.55;
  hR += -g * dep + be * dep;
  hL += (2.0 * d / (w * w) * g - 2.0 * bd / bw * sign(d) * be) * dep;
  // lugs: a chevron across the tyre, 11 cm pitch, printed in the rut's floor (crisp only in the latest track)
  float ph = (along + abs(d) * 0.7 + fm * 0.05) * 6.283 / 0.11;
  hA += cos(ph) * 6.283 / 0.11 * 0.0035 * smoothstep(0.5, 0.9, g) * lugK * (1.0 - fm * 0.6); // older tracks: worn lugs
  tr = max(tr, g * (1.0 - fm * 0.2));
}
// churned sand between the ruts, and the loose heaps along the edges
vec2 cq = vW.xz / 0.7;
float c0 = texture(tNoise, cq).r, cx = texture(tNoise, cq + vec2(0.02, 0.0)).r, cz = texture(tNoise, cq + vec2(0.0, 0.02)).r;
float churn = onRoad * (0.5 + 0.5 * nzf.g) * (1.0 - tr * 0.5);
float ed = (ax - uHalfW * (0.82 + 0.12 * nzf.r)) / 0.9, heap = exp(-ed * ed) * (0.6 + 0.8 * nzf.g);
hL += -2.0 * ed / 0.9 * heap * 0.08 * sign(lat);
float relief = onRoad * RELIEF;
tn = normalize(vec3(-hA * relief, -hL * relief, 1.0));
rW = sd.tn.xy + vec2(c0 - cx, c0 - cz) * (churn * 4.5 + heap * 4.0) * (1.0 - wetX * 0.75); // packed wet sand barely churns
col = sd.col;
// rut floors are packed and a shade darker (damper sand from below); berms and heaps loose, dry, a touch paler
col *= mix(1.0, RUTCOL * (0.8 + 0.4 * c0), tr * onRoad);
col *= 1.0 + (heap * 0.12 + max(hR, 0.0) * 2.0) * (1.0 - sd.wet);
ao = sd.ao * (1.0 - tr * onRoad * 0.2) * (1.0 - heap * 0.1);
rgh = mix(sd.rgh, RUTRGH, tr * onRoad);
gritK = 0.0;
// the ground's macro breakup (terrain.js), so the colour matches across the soft edge
col *= mix(0.8, 1.12, texture(tNoise, vW.xz / 240.0).g) * mix(0.9, 1.07, texture(tNoise, vW.xz / 37.0).r);
vec3 nzm7 = texture(tNoise, vW.xz / 7.0).rgb;
col *= mix(1.0, mix(0.82, 1.1, nzm7.r) * mix(0.93, 1.05, nzm7.b), smoothstep(12.0, 40.0, camD) * (1.0 - smoothstep(150.0, 400.0, camD)));
edgeW = 4.5;`,
  dirt: /* glsl */`
vec2 uv = vec2(along, lat) / 4.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
col = mix(A.rgb, vec3(lum3(A.rgb)) * vec3(1.8, 0.7, 0.4), 0.6);
col *= mix(1.0, 0.7, clamp(rut, 0.0, 1.0) * 0.8);
tn = normalize(mix(unpackNP(Pk), vec3(0, 0, 1), clamp(rut, 0.0, 1.0) * 0.5));
tn.y += rutD * 0.1;
ao = Pk.b; rgh = mix(0.9, 0.7, clamp(rut, 0.0, 1.0));
// the jungle floor creeps in from the verges: leaf litter and roots at the edge
col = mix(col, col * vec3(0.55, 0.5, 0.35), smoothstep(uHalfW - 2.5, uHalfW, abs(lat) + (nzf.b - 0.5) * 2.0) * 0.7);
PUDDLES(0.62, 0.17, 0.09, 0.05)
edgeW = 1.5;`,
  mud: /* glsl */`
vec2 uv = vec2(along, lat) / 3.5;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
col = mix(A.rgb, vec3(lum3(A.rgb)) * vec3(1.5, 0.75, 0.5), 0.5) * 0.7;
float sq = texture(tNoise, vec2(lat / 0.9, along / 2.5)).g;
tn = normalize(unpackNP(Pk) * vec3(1.0, 1.0, 0.7) + vec3(0.0, (sq - 0.5) * 0.6, 0.0));
tn.y += rutD * 0.2;
col *= mix(1.0, 0.65, clamp(rut, 0.0, 1.0));
ao = Pk.b; rgh = mix(0.45, 0.22, clamp(rut, 0.0, 1.0));
PUDDLES(0.5, 0.12, 0.07, 0.045)
edgeW = 2.0;`,
  grass: /* glsl */`
vec2 uv = vec2(along, lat) / 3.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
vec4 B = texAT(tB, uv * 0.8, nzf.g), Bp = texAT(tBP, uv * 0.8, nzf.g);
vec3 grass = A.rgb * vec3(0.78, 0.98, 0.6);
vec3 dirt = mix(B.rgb, vec3(lum3(B.rgb)) * vec3(1.7, 0.75, 0.45), 0.55) * 0.85;
// a double track: worn red-dirt wheel lines with grass between and on the crown, flattened grass beside them
float worn = clamp(rut * 1.3 - 0.15 + (nzf.r - 0.5) * 0.5, 0.0, 1.0);
col = mix(grass, dirt, worn);
col = mix(col, grass * vec3(1.12, 1.05, 0.8), (1.0 - worn) * smoothstep(0.4, 0.0, rut) * 0.3);
tn = normalize(mix(unpackNP(Pk), unpackNP(Bp), worn));
tn.y += rutD * 0.08;
ao = mix(Pk.b, Bp.b, worn); rgh = 0.9;
edgeW = 3.0;`,
  rock: /* glsl */`
vec2 uv = vec2(along, lat) / 5.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
col = vec3(pow(lum3(A.rgb), 0.75) * 0.42) * vec3(2.3, 2.2, 2.1);
tn = unpackNP(Pk) * vec3(1.4, 1.4, 1.0);
ao = Pk.b; rgh = 0.8;
ROCKKIND
edgeW = 2.5;`,
  planks: /* glsl */`
// boards laid across the line of travel
vec2 uv = vec2(lat / 3.0, along / 3.0);
vec4 A = texture(tA, uv), Pk = texture(tP, uv);
col = A.rgb * vec3(0.95, 0.9, 0.85) * mix(1.0, 0.75, clamp(rut, 0.0, 1.0) * 0.6);
tn = unpackNP(Pk);
ao = Pk.b; rgh = mix(A.a, 0.6, 0.4);
edgeW = 0.6;`,
};
const ROCKKIND = {
  lavarock: 'col *= 0.9; rgh = 0.92;',
  wetrock: 'col *= 0.55; rgh = 0.22; tn = normalize(mix(tn, vec3(0,0,1), 0.3));',
  // reef: algae-green and brown on wet limestone, with sea water left in the hollows
  reef: /* glsl */`col = mix(col * vec3(0.75, 1.05, 0.6), col * vec3(1.1, 0.95, 0.7), smoothstep(0.4, 0.7, nzf.g)) * 0.75 + vec3(0.01, 0.025, 0.005) * smoothstep(0.5, 0.8, texture(tNoise, vW.xz / 1.7).r);
rgh = 0.25;
float pool = smoothstep(0.64, 0.7, texture(tNoise, vec2(along / 7.0, lat / 7.0 + 0.3)).b);
col = mix(col, col * vec3(0.3, 0.4, 0.42), pool); rgh = mix(rgh, 0.04, pool); tn = normalize(mix(tn, vec3(0,0,1), pool));`,
};
// sand kinds: colour, wetness (the surf line's packed wet sand: darker, smoother, shallow ruts that hold water)
const SANDKIND = {
  sand: { k: 'float white = 0.0, wetX = 0.0;', relief: '2.4', rutcol: '0.85', rutrgh: 'sd.rgh * 0.9' },
  wetsand: { k: 'float white = 0.0, wetX = 0.75;', relief: '1.0', rutcol: '0.7', rutrgh: '0.06' },
  whitesand: { k: 'float white = 1.0, wetX = 0.0;', relief: '2.4', rutcol: '0.86', rutrgh: 'sd.rgh * 0.9' },
};
// shallow dished hollows between the ruts
const POTHOLES = (r, g, b) => /* glsl */`
float ph = texture(tNoise, vec2(along / 9.0, lat / 9.0 + 0.6)).b;
float pot = smoothstep(0.7, 0.8, ph) * (1.0 - clamp(rut, 0.0, 1.0) * 0.7) * (1.0 - smoothstep(uHalfW - 1.5, uHalfW, abs(lat)));
col = mix(col, col * vec3(${r}, ${g}, ${b}), pot * 0.6);
vec2 pg = vec2(texture(tNoise, vec2((along + 0.3) / 9.0, lat / 9.0 + 0.6)).b - ph, texture(tNoise, vec2(along / 9.0, (lat + 0.3) / 9.0 + 0.6)).b - ph);
tn = normalize(tn + vec3(pg * 6.0 * smoothstep(0.65, 0.8, ph), 0.0));`;
// rain water standing in the ruts and hollows: dark red-brown, mirror-smooth, flat
const PUDDLES = (th, r, g, b) => /* glsl */`
float pw = texture(tNoise, vec2(along / 11.0, lat / 6.0 + 0.2)).b * 0.75 + clamp(rut, 0.0, 1.0) * 0.3 + uWet * 0.25;
float pud = smoothstep(${th} + 0.12, ${th} + 0.16, pw) * (1.0 - smoothstep(uHalfW - 2.0, uHalfW, abs(lat)));
float rim = smoothstep(${th} + 0.06, ${th} + 0.12, pw) - pud;
col = mix(col, col * 0.6, rim); rgh = mix(rgh, 0.35, rim);
col = mix(col, vec3(${r}, ${g}, ${b}) * 0.6, pud); rgh = mix(rgh, 0.03, pud); tn = normalize(mix(tn, vec3(0,0,1), pud)); ao = mix(ao, 1.0, pud);`;

const SETB = { grass: 'dirt' };
function surfaceMaterial(world, M, kind, W, quality) {
  const aniso = quality.aiLod ? 4 : 8;
  const set = kaieleSet(SET[kind], aniso);
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    envMapIntensity: 0.9,
  });
  mat.userData.wx = 'road';
  const uniforms = { tA: { value: set.a }, tP: { value: set.p }, tNoise: { value: M.noise }, uHalfW: { value: W / 2 }, uWet: { value: 0 } };
  if (SETB[kind]) { const b = kaieleSet(SETB[kind], aniso); uniforms.tB = { value: b.a }; uniforms.tBP = { value: b.p }; }
  const isSand = !!SANDKIND[kind];
  if (isSand) Object.assign(uniforms, { tX: { value: kaieleShore(world) }, uExtent: { value: world.extent } });
  mat.userData.uniforms = uniforms;
  if (isSand && quality.terrainStep > 3) mat.defines = { SAND_LO: '' }; // low preset (as main.js tells it)
  const fam = SURF[kind] ? kind : (SANDKIND[kind] ? 'sand' : 'rock');
  const body = SURF[fam]
    .replace('SANDKIND', SANDKIND[kind]?.k || '').replace(/RELIEF/g, SANDKIND[kind]?.relief || '1.0')
    .replace('RUTCOL', SANDKIND[kind]?.rutcol || '1.0').replace('RUTRGH', SANDKIND[kind]?.rutrgh || 'rgh')
    .replace('ROCKKIND', ROCKKIND[kind] || '')
    .replace(/POTHOLES\(([^)]*)\)/, (_, a) => POTHOLES(...a.split(',').map((x) => x.trim())))
    .replace(/PUDDLES\(([^)]*)\)/, (_, a) => PUDDLES(...a.split(',').map((x) => x.trim())));
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fade; varying vec3 vW; varying vec2 vT; varying float vFade;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vT = uv; vFade = fade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec2 vT; varying float vFade;
uniform sampler2D tNoise, tA, tP${SETB[kind] ? ', tB, tBP' : ''}${isSand ? ', tX' : ''}; uniform float uHalfW, uWet${isSand ? ', uExtent' : ''};
${KAIELE_GLSL}
${isSand ? SAND_GLSL : ''}
vec3 rN; float rAO; float rR; vec2 rW = vec2(0.0);`)
      .replace('#include <map_fragment>', /* glsl */`
float along = vT.x, lat = vT.y;
vec3 nz = texture(tNoise, vec2(along / 300.0, 0.3)).rgb;
vec3 nzf = texture(tNoise, vW.xz / 23.0).rgb;
// racing lines wander slowly along the lap; four wheel tracks
float l = lat - (nz.r - 0.5) * 5.0;
float rut = 0.0, rutD = 0.0;
for (int k = 0; k < 4; k++) {
  float off = (float(k) - 1.5) * 1.75 + (k > 1 ? 0.25 : -0.25);
  float w = 0.32 + 0.12 * nzf.g;
  float g = exp(-pow((l - off) / w, 2.0));
  rut += g;
  rutD += -2.0 * (l - off) / (w * w) * g;
}
vec3 col; vec3 tn; float ao = 1.0, rgh = 0.9, edgeW = 1.0, gritK = 1.0;
float camD = length(vW - cameraPosition);
${body}
// close detail: grit
col *= mix(1.0, mix(0.85, 1.12, texture(tNoise, vW.xz / 0.45).g), (1.0 - smoothstep(5.0, 25.0, camD)) * 0.6 * gritK);
// weather: wet roads darken and gloss
col *= mix(1.0, 0.72, uWet); rgh = mix(rgh, rgh * 0.4, uWet);
rN = normalize(tn); rAO = ao; rR = rgh;
diffuseColor.rgb = col;
float fadeE = 1.0 - smoothstep(uHalfW + 0.3 - edgeW * 0.3, uHalfW + edgeW, abs(lat) + (nzf.b - 0.5) * (2.0 + edgeW));
// always gone before the ribbon's own edge (1.6 half-widths out), or a wide soft edge shows as a hard line
fadeE *= 1.0 - smoothstep(uHalfW * 1.6 - 1.2, uHalfW * 1.6 - 0.15, abs(lat));
diffuseColor.a = fadeE * vFade;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(rR, 0.03, 1.0);')
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
wn = normalize(wn + vec3(rW.x, 0.0, rW.y) * Nw.y); // world-space detail (the beach sand's ripples and grain)
normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `
reflectedLight.indirectDiffuse *= rAO;
reflectedLight.indirectSpecular *= mix(rAO, 1.0, 0.5);`);
  };
  mat.customProgramCacheKey = () => `kaiele-road-${kind}`;
  return mat;
}
