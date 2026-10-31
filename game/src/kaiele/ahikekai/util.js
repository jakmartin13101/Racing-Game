import * as THREE from 'three';
import { Puffs } from '../../fx.js';
import { mulberry } from '../../world.js';

// Shared bits for Ahi i ke Kai's set pieces: collision groups, the lava burn-out, charred wood, glowing lava
// spills, embers drifting on the fire's wind, and a steam puff system of its own (the crash smoke has a tight
// budget the wrecks need).
export const GRAV = 9.81;
export const G_GROUND = (0x0001 << 16) | 0xffff;
export const G_HAZARD = (0x0008 << 16) | 0x0003;
export const clamp = THREE.MathUtils.clamp;
export const sstep = THREE.MathUtils.smoothstep;
export const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

// a truck lost to the lava: it goes up in flames where it is and is out of the race
export function burnTruck(hz, st, race, time, log) {
  if (st.burned || (st.finished && !st.dnf)) return;
  const v = st.v, d = v.damage;
  st.burned = true;
  log?.push(`${v.name.slice(0, 3)}@${st.i}t${race.t.toFixed(0)}`);
  if (d) { d.level = 1; d.burning = 1; d.totaledAt = true; }
  const p = v.body.translation(), lv = v.body.linvel();
  hz.fx.explode(new THREE.Vector3(p.x, p.y + 0.5, p.z), time, 1.2, new THREE.Vector3(lv.x, lv.y, lv.z));
  v.body.setLinvel({ x: lv.x * 0.3, y: Math.min(lv.y, 0) * 0.3, z: lv.z * 0.3 }, true);
  hz.events.push({ type: 'burned', st });
  race.retire(st);
}

// dispose every geometry and (unshared) material under an object
export function disposeTree(obj, keep = new Set()) {
  obj.traverse((o) => {
    if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (keep.has(m)) continue;
      for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k] && !keep.has(m[k]) && m[k].isCanvasTexture) m[k].dispose();
      m.dispose();
    }
  });
}

// world-space varyings for a patched standard material
const VW = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
#ifdef USE_INSTANCING
vW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
};

// charred wood: black, cracked into alligator checks that glow where the fire is still in it. heat (uniform,
// 0..1) sets how much is still burning; uTime makes the embers breathe.
export function charMaterial(M, uTime, heat = { value: 1 }, { color = 0x1a1613, glow = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.97, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: M.noise }; sh.uniforms.tBark = { value: M.burnt.a }; sh.uniforms.uHeat = heat; sh.uniforms.uTime = uTime;
    VW(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform sampler2D tNoise, tBark; uniform float uHeat, uTime;')
      .replace('#include <map_fragment>', `
vec2 bu = vec2(vW.x * 0.8 + vW.z * 0.6, vW.y * 0.35);
vec3 bark = texture(tBark, bu).rgb;
float ck = texture(tNoise, vec2(vW.x + vW.z, vW.y * 0.25) * 0.9).r;
// alligator checking: the charcoal splits into blocks along the grain
float lines = abs(fract(vW.y * 2.3 + ck * 1.7) - 0.5) * 2.0;
float checks = smoothstep(0.9, 0.985, 1.0 - lines) * 0.8 + smoothstep(0.57, 0.6, ck) * (1.0 - smoothstep(0.6, 0.64, ck));
diffuseColor.rgb *= mix(vec3(0.55), bark * 1.4, 0.5) * (0.65 + 0.5 * ck);
diffuseColor.rgb *= 1.0 - checks * 0.6;
float emb = checks;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float br = 0.65 + 0.35 * sin(uTime * 2.1 + vW.y * 3.0 + ck * 9.0);
// only patches of it are still alight, and only low down near the ground fire or where it is burning through
float hot = uHeat * ${glow.toFixed(2)} * smoothstep(0.6, 0.85, texture(tNoise, vW.xz * 0.07 + vW.y * 0.04).g + 0.15 * sin(uTime * 0.6 + vW.x));
totalEmissiveRadiance += vec3(1.5, 0.36, 0.05) * emb * hot * br + vec3(0.2, 0.035, 0.005) * hot * 0.2;`);
  };
  m.customProgramCacheKey = () => `ahi-char-${glow}`;
  m.userData.heat = heat;
  return m;
}

// the hot underside of anything over a lava channel: emissive red glow rising from below y = uLow
export function heatGlow(mat, low, k = 1, key = 'x') {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    if (!sh.vertexShader.includes('varying vec3 vW;')) VW(sh);
    sh.uniforms.uLowY = low;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${sh.fragmentShader.includes('varying vec3 vW;') ? '' : 'varying vec3 vW;'}\nuniform float uLowY;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.28, 0.05) * pow(1.0 - smoothstep(uLowY - 1.0, uLowY + 3.5, vW.y), 2.0) * ${k.toFixed(2)};`);
  };
  const key0 = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key0 ? key0() : '') + `-heat${key}`;
  return mat;
}

// a steam/smoke puff system of our own, lit like the crash smoke
export function makePuffs(hz, n, kind = 'smoke') {
  const p = new Puffs(hz.M, n, kind);
  if (kind === 'smoke') p.mat.uniforms.uSun.value.copy(hz.fx.smoke.mat.uniforms.uSun.value);
  hz.group.add(p.mesh);
  return p;
}

// Embers: glowing flecks riding the fire's updraft and the wind off the lava, flickering as they burn out.
// CPU-simulated points, emitted round fires and swept across the road.
export class Embers {
  constructor(group, max, wind = new THREE.Vector3(3, 0, 1)) {
    this.max = max; this.wind = wind;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max).fill(1e9); this.size = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.ka = new THREE.BufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pa);
    geo.setAttribute('ka', this.ka);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 620 }, uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec2 ka; uniform float uScale, uTime; varying float vK; varying float vF;
        void main() {
          vec4 mv = viewMatrix * vec4(position, 1.0);
          vK = ka.x;
          vF = 0.55 + 0.45 * sin(uTime * (9.0 + ka.y * 13.0) + ka.y * 40.0);
          gl_PointSize = vK > 0.0 ? clamp(ka.y * uScale / -mv.z, 1.0, 9.0) : 0.0;
          gl_Position = vK > 0.0 ? projectionMatrix * mv : vec4(0.0, 0.0, -2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vK; varying float vF;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          vec3 c = mix(vec3(0.9, 0.12, 0.02), vec3(3.2, 1.3, 0.35), vK * vF);
          gl_FragColor = vec4(c * a * vK, a * vK);
        }`,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    group.add(this.mesh);
    this.i = 0;
    this.rnd = mulberry(5150);
  }

  emit(pos, vel, life = 4, size = 0.12) {
    const i = this.i++ % this.max, k = i * 3;
    this.p[k] = pos.x; this.p[k + 1] = pos.y; this.p[k + 2] = pos.z;
    this.v[k] = vel.x; this.v[k + 1] = vel.y; this.v[k + 2] = vel.z;
    this.age[i] = 0; this.life[i] = life * (0.7 + this.rnd() * 0.6); this.size[i] = size * (0.5 + this.rnd());
  }

  update(dt, time) {
    const { p, v, age, life, size, wind } = this, K = this.ka.array, r = this.rnd;
    this.mat.uniforms.uTime.value = time;
    for (let i = 0; i < this.max; i++) {
      if (age[i] > life[i]) { if (K[i * 2] !== 0) K[i * 2] = 0; continue; }
      const k = i * 3;
      age[i] += dt;
      // carried by the wind, tossed by the fire's turbulence, slowly settling once the updraft lets go
      const gust = Math.sin(time * 1.7 + p[k] * 0.05) * 0.5 + 0.5;
      v[k] += ((wind.x * (0.6 + gust) - v[k]) * 0.9 + (r() - 0.5) * 14) * dt;
      v[k + 2] += ((wind.z * (0.6 + gust) - v[k + 2]) * 0.9 + (r() - 0.5) * 14) * dt;
      v[k + 1] += ((-0.5 - v[k + 1]) * 0.5 + (r() - 0.45) * 10) * dt;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      const u = age[i] / life[i];
      K[i * 2] = Math.min(1, u * 8) * (1 - u * u);
      K[i * 2 + 1] = size[i];
    }
    this.pa.needsUpdate = true; this.ka.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// A full-screen veil (steam blindness): drawn straight to clip space, last, over everything. k 0..1.
export class Veil {
  constructor(group, M) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uK: { value: 0 }, uTime: { value: 0 }, tNoise: { value: M.noise }, uCol: { value: new THREE.Color(0.86, 0.87, 0.88) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uK, uTime; uniform sampler2D tNoise; uniform vec3 uCol; varying vec2 vUv;
        void main() {
          vec2 q = vUv * vec2(1.6, 0.9);
          float n = texture2D(tNoise, q * 0.7 + vec2(uTime * 0.11, uTime * 0.05)).r * 0.6 + texture2D(tNoise, q * 1.9 - vec2(uTime * 0.17, -uTime * 0.08)).g * 0.4;
          // thickest in the middle of the view: the edges of the screen clear first
          float edge = length((vUv - 0.5) * vec2(1.3, 1.0));
          float a = clamp(uK * (1.25 - edge * 0.55) + (n - 0.5) * 0.55 * uK, 0.0, 0.97);
          gl_FragColor = vec4(uCol * (0.9 + n * 0.15), a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9999;
    this.mesh.visible = false;
    group.add(this.mesh);
  }

  set(k, time) {
    this.mat.uniforms.uK.value = k;
    this.mat.uniforms.uTime.value = time;
    this.mesh.visible = k > 0.003;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// The lava level at a spot: the surface of the nearest world lava river if one runs within `r` m, else null
export function riverLevel(world, x, z, r = 30) {
  let best = null, bd = r * r;
  for (const rv of world.data.rivers || []) for (const p of rv.points) {
    const d = (p[0] - x) ** 2 + (p[2] - z) ** 2;
    if (d < bd) { bd = d; best = p[1]; }
  }
  return best;
}

// A lava spill across a stretch of the road's gap rows and out over the ground either side. It is a pool at a
// level (uLevel, m): the sheet sits at max(ground + 0.35, level), so the ground's own contours give the spill
// its outline, and raising the level through the race makes it creep wider up the banks and out along the
// slopes (it never reaches the road, which the caller keeps well above the top level). uWide 0..1.
export function spillSheet(hz, lava, { i0, i1, latMax, level, rise = 0.9, ext = 8, key }) {
  const t = hz.track, NU = hz.lite ? 40 : 64, rows = [];
  for (let i = i0 - ext; i <= i1 + ext; i++) rows.push(i);
  const verts = [], uvs = [], idx = [], hs = [];
  const nv = rows.length;
  rows.forEach((i) => {
    const f = t.frame(i);
    for (let k = 0; k <= NU; k++) {
      const lat = (k / NU * 2 - 1) * latMax;
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      const h = hz.world.heightAt(x, z);
      verts.push(x, Math.max(h + 0.35, level), z);
      hs.push(h);
      // vT: x = metres along from the gap start, y = metres across
      uvs.push(i - i0, lat);
    }
  });
  for (let j = 0; j < nv - 1; j++) for (let k = 0; k < NU; k++) {
    const a = j * (NU + 1) + k, b = a + 1, c = a + NU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const uWide = { value: 0 }, uLevel = { value: level };
  const mat = lava.userData.makeMat(false);
  const base = mat.onBeforeCompile, len = (i1 - i0).toFixed(1), lm = latMax.toFixed(1), e = ext.toFixed(1), lv = level.toFixed(2), rs = rise.toFixed(2);
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.uniforms.uWide = uWide;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aH; uniform float uWide; varying float vDepth;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float lvl = ${lv} + uWide * ${rs};
transformed.y = max(aH + 0.35, lvl);
vDepth = lvl - aH;`);
    sh.uniforms.uWide = uWide;
    sh.fragmentShader = sh.fragmentShader.replace('uniform float uTime;', 'uniform float uTime; uniform float uWide; varying float vDepth;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float sN = texture(tNoise, vW.xz / 11.0).r, sN2 = texture(tNoise, vW.xz / 4.0).g;
// ragged ends to the sheet, so its grid never shows
float outA = max(-vT.x, vT.x - ${len});
if (outA > ${e} - 2.5 + (sN - 0.5) * 4.0) discard;
if (abs(vT.y) > ${lm} - 4.0 + (sN - 0.5) * 8.0) discard;
// where it only skins the ground (above the pool), only the hot margin shows
if (vDepth < -0.2 + (sN2 - 0.5) * 0.4) discard;`)
      .replace('totalEmissiveRadiance += lavaEm;', `totalEmissiveRadiance += lavaEm;
// the fresh margins glow brightest where the crust is thinnest
float rim = 1.0 - smoothstep(0.0, 0.7, vDepth);
totalEmissiveRadiance += vec3(2.2, 0.62, 0.1) * rim * (0.5 + 0.5 * sN2);`);
  };
  mat.customProgramCacheKey = () => `ahi-spill-${key}`;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  return { mesh, uWide, level: () => level + uWide.value * rise };
}

// Torn-off road edge: a ragged wall of earth from the road edge at row i (facing dir = +1 forwards / −1 back)
// down to y = bottom, across the road width, glowing hot at the foot.
export function brokenEdge(hz, earthMat, i, dir, bottom, widthHalf, seed) {
  const t = hz.track, f = t.frame(i), rnd = mulberry(seed);
  const N = 22, P = [], idx = [];
  for (let k = 0; k <= N; k++) {
    const lat = (k / N * 2 - 1) * widthHalf;
    const bite = (rnd() - 0.3) * 0.8;
    const x = f.x + f.nx * lat + f.tx * dir * bite, z = f.z + f.nz * lat + f.tz * dir * bite;
    const top = Math.max(hz.world.heightAt(x, z), t.at(i)[1]) + 0.12 - rnd() * 0.12;
    P.push(x, top, z);
    // the face undercuts as it goes down, raggedly
    const u = 0.6 + rnd() * 1.4;
    P.push(x + f.tx * dir * u, (top + bottom) / 2 + (rnd() - 0.5) * 0.8, z + f.tz * dir * u);
    P.push(x + f.tx * dir * (u * 0.5 + rnd()), bottom - 0.5, z + f.tz * dir * (u * 0.5 + rnd()));
  }
  for (let k = 0; k < N; k++) for (let j = 0; j < 2; j++) {
    const a = k * 3 + j, b = a + 1, c = a + 3, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, earthMat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export { tmp as _tmp };
