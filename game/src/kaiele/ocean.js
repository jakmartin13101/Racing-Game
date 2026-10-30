import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;

// The sea round Kai'ele.
//  - A coast field baked at load from the heightmap: terrain height, signed distance to the waterline (+ inland),
//    how exposed the shore is to the swell (shallow reef flats soak the waves up) and how steep it is (rock and
//    cliff shores throw white water). One half-float texture for the shaders, the same arrays for gameplay.
//  - Open-sea swell: Gerstner waves on a polar mesh that follows the camera, faded out into a flat ring that runs
//    to the horizon. Near the coast the swell gives way to shore waves whose crests run parallel to the waterline
//    (their phase is the distance to shore), steepen as the water shoals and break into white water bores.
//  - Swash: a thin sheet draped over the beaches. Each bore that reaches the waterline runs up the sand and drains
//    back, leaving a wet sheen. wetness() uses the same clock, so the water a truck feels is the water you see.
//  - Spray: thrown up by trucks driving through the water and by waves slamming into the rocks.

// ---------------------------------------------------------------- shared surf model (JS and GLSL agree exactly)
// One bore reaches any point of the shore every T seconds; the arrival time drifts along the coast (surfOff), so a
// wave peels along the beach instead of landing everywhere at once. Wave n's size is waveAmp(n): sets of bigger
// waves every seven or so. Its run-up reaches R0 * exposure * waveAmp(n) metres inland of the waterline.
export const SURF = { T: 7.0, L: 34, R0: 24, UP: 0.36 };
export const surfOff = (x, z) => 0.35 * Math.sin(x * 0.0047 + z * 0.0031) + 0.25 * Math.sin(x * 0.0123 - z * 0.0094 + 1.7) + 0.12 * Math.sin(x * 0.031 + z * 0.027);
export const waveAmp = (n) => { const s = 0.5 + 0.5 * Math.sin(n * 0.8976); return 0.55 + 0.2 * (0.5 + 0.5 * Math.sin(n * 2.39996 + 0.5)) + 0.45 * s * s * s; };
export const swashFront = (u, R) => u < SURF.UP ? R * (1 - (1 - u / SURF.UP) ** 2) : R * (1 - ((u - SURF.UP) / (1 - SURF.UP)) ** 1.6);
// highest ground the swash climbs (dunes and rocks stop it)
const swashTop = (amp, rs) => 1.3 + 1.1 * amp * rs;

export const SURF_GLSL = /* glsl */`
#define SURF_T ${SURF.T.toFixed(3)}
#define SURF_L ${SURF.L.toFixed(3)}
#define SURF_R0 ${SURF.R0.toFixed(3)}
#define SURF_UP ${SURF.UP.toFixed(3)}
float surfOff(vec2 p) { return 0.35 * sin(p.x * 0.0047 + p.y * 0.0031) + 0.25 * sin(p.x * 0.0123 - p.y * 0.0094 + 1.7) + 0.12 * sin(p.x * 0.031 + p.y * 0.027); }
float waveAmp(float n) { float s = 0.5 + 0.5 * sin(n * 0.8976); return 0.55 + 0.2 * (0.5 + 0.5 * sin(n * 2.39996 + 0.5)) + 0.45 * s * s * s; }
float swashFront(float u, float R) { return u < SURF_UP ? R * (1.0 - pow(1.0 - u / SURF_UP, 2.0)) : R * (1.0 - pow((u - SURF_UP) / (1.0 - SURF_UP), 1.6)); }
float swashTop(float amp, float rs) { return 1.3 + 1.1 * amp * rs; }
`;

// Sky lookup matching the dome in fx.js (HDRI above the horizon, haze below), for reflections
const SKY_GLSL = /* glsl */`
uniform sampler2D tSky; uniform float uSkyInt; uniform vec3 uHaze;
vec3 skyCol(vec3 d) {
  d.y = max(d.y, 0.0);
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 c = texture2D(tSky, uv).rgb * uSkyInt;
  float h = smoothstep(-0.04, 0.1, d.y);
  c = mix(uHaze, c, h * h * (3.0 - 2.0 * h) * 0.7 + 0.3 * h);
  return min(c, vec3(3.0));
}
// GGX, capped: a mirror-sharp glint must stay inside half-float range or the bloom turns it into a black hole
float ggx(float NH, float r) { float a = r * r, d = NH * NH * (a * a - 1.0) + 1.0; return min(a * a / (3.14159 * d * d), 400.0); }
`;

// the sky dome's HDRI and haze uniforms (fx.js buildSky), so the water reflects the same sky
export function findSky(scene) {
  let u = null;
  scene.traverse((o) => { if (!u && o.material?.uniforms?.tSky) u = o.material.uniforms; });
  return u;
}

const tierOf = (q) => q.ultra ? 3 : !q.aiLod ? 2 : q.terrainStep >= 4 ? 0 : 1;
let texCache = null;
export function waterTextures() {
  if (texCache) return texCache;
  const L = new THREE.TextureLoader();
  const t = (n) => { const x = L.load(`${BASE}textures/kaiele/water/${n}`); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 4; return x; };
  texCache = { nc: t('water_nc.jpg'), foam: t('water_foam.jpg') };
  return texCache;
}

// ---------------------------------------------------------------- coast field
function buildCoast(world, N) {
  const { extent, half } = world;
  const cell = extent / N;
  const h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < N; i++) h[j * N + i] = world.heightAt(-half + (i + 0.5) * cell, z);
  }
  // two-pass chamfer distance (in cells) to the nearest cell of the other kind
  const chamfer = (src) => {
    const d = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) d[k] = src(k) ? 0 : 1e6;
    const D = Math.SQRT2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let v = d[k];
      if (!v) continue;
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, d[k - N] + 1);
        if (i > 0) v = Math.min(v, d[k - N - 1] + D);
        if (i < N - 1) v = Math.min(v, d[k - N + 1] + D);
      }
      d[k] = v;
    }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let v = d[k];
      if (!v) continue;
      if (i < N - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < N - 1) {
        v = Math.min(v, d[k + N] + 1);
        if (i < N - 1) v = Math.min(v, d[k + N + 1] + D);
        if (i > 0) v = Math.min(v, d[k + N - 1] + D);
      }
      d[k] = v;
    }
    return d;
  };
  const toWater = chamfer((k) => h[k] <= 0), toLand = chamfer((k) => h[k] > 0);
  const sd = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    let s = (h[k] > 0 ? toWater[k] - 0.5 : -(toLand[k] - 0.5)) * cell;
    // right at the shore the cell distance is too coarse: use height over slope, which puts the zero exactly
    // where the terrain crosses sea level
    if (Math.abs(s) < 2.5 * cell && i > 0 && j > 0 && i < N - 1 && j < N - 1) {
      const gx = (h[k + 1] - h[k - 1]) / (2 * cell), gz = (h[k + N] - h[k - N]) / (2 * cell);
      const g = Math.hypot(gx, gz);
      if (g > 1e-3) {
        const est = THREE.MathUtils.clamp(h[k] / g, -2.5 * cell, 2.5 * cell);
        s = THREE.MathUtils.lerp(est, s, THREE.MathUtils.smoothstep(Math.abs(s), cell, 2.5 * cell));
      }
    }
    sd[k] = THREE.MathUtils.clamp(s, -400, 400);
  }
  // exposure: mean water depth within ~60 m. Open beaches with a sloping shelf take the full run-up; reef flats
  // just awash soak the waves up and only the big sets wash over them
  const r = Math.max(2, Math.round(60 / cell));
  const box = (a) => {
    const t = new Float32Array(N * N), o = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += a[j * N + Math.min(Math.max(i, 0), N - 1)];
      for (let i = 0; i < N; i++) {
        t[j * N + i] = acc;
        acc += a[j * N + Math.min(i + r + 1, N - 1)] - a[j * N + Math.max(i - r, 0)];
      }
    }
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += t[Math.min(Math.max(j, 0), N - 1) * N + i];
      for (let j = 0; j < N; j++) {
        o[j * N + i] = acc;
        acc += t[Math.min(j + r + 1, N - 1) * N + i] - t[Math.max(j - r, 0) * N + i];
      }
    }
    return o;
  };
  const dep = new Float32Array(N * N), wet = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) { dep[k] = Math.max(-h[k], 0); wet[k] = h[k] <= 0 ? 1 : 0; }
  const bd = box(dep), bw = box(wet);
  const rs = new Float32Array(N * N), steep = new Float32Array(N * N);
  const s3 = Math.max(1, Math.round(10 / cell));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    const avg = bw[k] > 0.5 ? bd[k] / bw[k] : 0;
    rs[k] = THREE.MathUtils.clamp((avg - 0.1) / 0.65, 0.22, 1.2);
    // slope over a 20 m baseline, so the rock shore's white water reaches out over the water in front of it
    const a = Math.max(i - s3, 0), b = Math.min(i + s3, N - 1), c = Math.max(j - s3, 0), e = Math.min(j + s3, N - 1);
    const gx = (h[j * N + b] - h[j * N + a]) / ((b - a) * cell), gz = (h[e * N + i] - h[c * N + i]) / ((e - c) * cell);
    steep[k] = THREE.MathUtils.smoothstep(Math.hypot(gx, gz), 0.12, 0.55);
  }
  const data = new Uint16Array(N * N * 4);
  const hf = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < N * N; k++) {
    data[k * 4] = hf(h[k]); data[k * 4 + 1] = hf(sd[k]); data[k * 4 + 2] = hf(rs[k]); data[k * 4 + 3] = hf(steep[k]);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  // bilinear sample of a field at a world point, matching the texture's linear filtering
  const sample = (arr, x, z) => {
    const fx = (x + half) / cell - 0.5, fz = (z + half) / cell - 0.5;
    const i = Math.min(Math.max(Math.floor(fx), 0), N - 2), j = Math.min(Math.max(Math.floor(fz), 0), N - 2);
    const tx = THREE.MathUtils.clamp(fx - i, 0, 1), tz = THREE.MathUtils.clamp(fz - j, 0, 1);
    const k = j * N + i;
    return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - tz) + (arr[k + N] * (1 - tx) + arr[k + N + 1] * tx) * tz;
  };
  return { N, cell, h, sd, rs, steep, tex, sample };
}

// ---------------------------------------------------------------- spray particles
// Lit billboards on closed-form ballistic paths with linear drag: x(t) = p0 + W t + (v0 - W)(1 - e^-kt)/k, where W
// is the terminal velocity (wind drift sideways, g/k downwards). Optional rainbow: the 42° (and faint 51°) bow
// round the anti-solar point, lit in the droplets wherever the view ray crosses that cone.
export class Spray {
  constructor(M, { max = 400, sun, sunCol, wind = new THREE.Vector3(1.5, 0, -0.8), rainbow = false, tint = [0.86, 0.9, 0.93], fog } = {}) {
    this.max = max; this.i = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.a = new Float32Array(max * 4); // p0, birth
    this.b = new Float32Array(max * 4); // v0, size
    this.c = new Float32Array(max * 4); // life, k (drag), grow, opacity
    this.d = new Float32Array(max * 2); // gravity scale, seed
    for (let i = 0; i < max; i++) { this.a[i * 4 + 3] = -1e4; this.c[i * 4] = 1; this.c[i * 4 + 1] = 1; }
    const attr = (arr, n) => { const x = new THREE.InstancedBufferAttribute(arr, n); x.setUsage(THREE.DynamicDrawUsage); return x; };
    this.attrs = [attr(this.a, 4), attr(this.b, 4), attr(this.c, 4), attr(this.d, 2)];
    geo.setAttribute('pa', this.attrs[0]); geo.setAttribute('pb', this.attrs[1]); geo.setAttribute('pc', this.attrs[2]); geo.setAttribute('pd', this.attrs[3]);
    geo.instanceCount = max;
    this.fog = fog;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      defines: rainbow ? { RAINBOW: 1 } : {},
      uniforms: {
        uTime: { value: 0 }, tSmoke: { value: M.smoke }, uSun: { value: sun.clone() }, uSunCol: { value: sunCol.clone() },
        uWind: { value: wind.clone() }, uTint: { value: new THREE.Color(...tint) },
        uFogC: { value: new THREE.Color(0.66, 0.76, 0.86) }, uFogD: { value: 0.00016 },
      },
      vertexShader: /* glsl */`
        attribute vec4 pa, pb, pc; attribute vec2 pd; uniform float uTime; uniform vec3 uWind;
        varying vec2 vUv; varying float vA; varying vec3 vR, vU, vF, vW; varying float vDepth, vSeed;
        void main() {
          float t = uTime - pa.w;
          float life = pc.x, k = pc.y;
          vA = t < 0.0 || t > life ? 0.0 : pow(1.0 - t / life, 1.4) * smoothstep(0.0, 0.06 * life + 0.02, t) * pc.w;
          vec3 W = vec3(uWind.x, -9.81 * pd.x / k, uWind.z);
          vec3 p = pa.xyz + W * t + (pb.xyz - W) * (1.0 - exp(-k * t)) / k;
          float size = min(pb.w * (1.0 + pc.z * t), 24.0);
          // turn with the seed so neighbouring puffs don't repeat the same sprite
          float ang = pd.y * 6.283 + t * (pd.y - 0.5) * 0.6;
          vec2 q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * position.xy;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          // fade puffs that reach the camera instead of letting the near plane slice them
          vDepth = -mv.z;
          // (a puff wrapped round the camera would also cost a full screen of fill: drop it)
          vA *= smoothstep(0.3 * size + 0.3, 0.8 * size + 0.6, vDepth);
          mv.xy += q * size;
          vUv = uv; vSeed = pd.y;
          vR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          vW = (inverse(viewMatrix) * mv).xyz;
          gl_Position = projectionMatrix * mv;
          if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tSmoke; uniform vec3 uSun, uSunCol, uTint, uFogC; uniform float uFogD;
        varying vec2 vUv; varying float vA; varying vec3 vR, vU, vF, vW; varying float vDepth, vSeed;
        vec3 hue(float h) { return clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0); }
        void main() {
          vec4 s = texture2D(tSmoke, vUv);
          float a = s.a * vA;
          if (a < 0.004) discard;
          vec3 n = normalize((s.r * 2.0 - 1.0) * vR + (s.g * 2.0 - 1.0) * vU + (s.b * 2.0 - 1.0) * vF);
          vec3 ray = normalize(vW - cameraPosition);
          float lit = clamp(dot(n, uSun) * 0.5 + 0.55, 0.0, 1.0);
          // water droplets scatter strongly forwards: spray glows when you look towards the sun through it
          float fwd = pow(max(dot(ray, uSun), 0.0), 6.0);
          vec3 c = uTint * (vec3(0.42, 0.5, 0.6) + uSunCol * (0.32 * lit + 0.9 * fwd));
          #ifdef RAINBOW
          float th = degrees(acos(clamp(dot(ray, -uSun), -1.0, 1.0)));
          float p1 = smoothstep(40.2, 41.0, th) * (1.0 - smoothstep(42.1, 42.7, th));
          float p2 = smoothstep(50.2, 51.0, th) * (1.0 - smoothstep(53.0, 53.8, th));
          vec3 bow = hue(clamp((42.5 - th) / 2.2, 0.0, 1.0) * 0.78) * p1 + hue(clamp((th - 50.3) / 3.4, 0.0, 1.0) * 0.78) * p2 * 0.4;
          c += bow * uSunCol * 0.5 * step(0.0, uSun.y);
          #endif
          float fog = 1.0 - exp(-uFogD * uFogD * vDepth * vDepth);
          c = mix(c, uFogC, fog);
          gl_FragColor = vec4(c, a);
        }`,
    });
    this.mat.userData.wx = false;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  // gravity: 1 = droplets, ~0.05 = mist that hangs and drifts
  emit(time, x, y, z, vx, vy, vz, size, life, { drag = 1.2, grow = 0.6, opacity = 0.6, gravity = 1 } = {}) {
    const i = this.i++ % this.max;
    this.a.set([x, y, z, time], i * 4);
    this.b.set([vx, vy, vz, size], i * 4);
    this.c.set([life, drag, grow, opacity], i * 4);
    this.d[i * 2] = gravity; this.d[i * 2 + 1] = Math.random();
    this.dirty = true;
  }
  update(time) {
    this.mat.uniforms.uTime.value = time;
    if (this.fog) { this.mat.uniforms.uFogC.value.copy(this.fog.color); this.mat.uniforms.uFogD.value = this.fog.density; }
    if (this.dirty) { for (const a of this.attrs) a.needsUpdate = true; this.dirty = false; }
  }
}

// A truck driving through water: sheets of droplets thrown out sideways and up off each tyre, more the faster it
// goes and the deeper the water (wet 0..1), with a little hanging mist behind.
const _wp = new THREE.Vector3(), _wd = new THREE.Vector3();
const WHEELS = [[1.02, 1.62], [-1.02, 1.62], [1.02, -1.55], [-1.02, -1.55]];
export function wheelSpray(spray, v, t, dt, wet, tier) {
  const spd = v.speed();
  if (spd < 2.5 || wet < 0.05 || dt <= 0) return;
  const lv = v.body.linvel(), rnd = Math.random;
  const rate = wet * Math.min(spd, 40) * (tier === 0 ? 0.6 : 1.6) * dt;
  const kick = Math.min(1, spd / 18);
  WHEELS.forEach(([wx, wz], i) => {
    if (v.lostWheels?.has(i)) return;
    let m = rate * (0.5 + rnd());
    while (m > rnd()) {
      m -= 1;
      _wp.set(wx, -0.55, wz); v.group.localToWorld(_wp);
      _wd.set(wx > 0 ? 1 : -1, 0, 0).transformDirection(v.group.matrixWorld);
      const side = 1.5 + rnd() * 3.5 * kick;
      spray.emit(t, _wp.x, _wp.y, _wp.z,
        lv.x * 0.45 + _wd.x * side + (rnd() - 0.5) * 2, 1.5 + rnd() * 3.5 * kick, lv.z * 0.45 + _wd.z * side + (rnd() - 0.5) * 2,
        0.35 + rnd() * 0.6, 0.7 + rnd() * 0.7, { drag: 1.4, grow: 1.6, opacity: 0.55, gravity: 1 });
    }
    if (tier > 0 && rnd() < rate * 0.12) {
      _wp.set(wx, -0.3, wz); v.group.localToWorld(_wp);
      spray.emit(t, _wp.x, _wp.y, _wp.z, lv.x * 0.3, 1 + rnd(), lv.z * 0.3, 1.2 + rnd(), 1.4 + rnd(), { drag: 2.5, grow: 1.4, opacity: 0.28, gravity: 0.05 });
    }
  });
}

// ---------------------------------------------------------------- ocean
export function buildOcean(ctx) {
  const { world, scene, quality, sun, M } = ctx;
  const tier = tierOf(quality);
  const sea = world.data.water?.sea ?? 0;
  const coast = buildCoast(world, tier >= 2 ? 2048 : 1024);
  ctx.coast = coast; // fresh water reads the same field and shares the spray
  const W = waterTextures();
  const skyU = findSky(scene);
  const sunCol = new THREE.Vector3(1, 0.96, 0.88).multiplyScalar(ctx.sunLight?.intensity ?? 3);
  const biome = new THREE.TextureLoader().load(`${BASE}${world.dir}/biome.png`);

  // deep-water swell: trade-wind swell from the north-east plus a longer groundswell; the shore waves take over
  // where it gets shallow
  const NW = tier === 0 ? 3 : tier === 1 ? 5 : 7;
  const waves = [
    [95, 0.42, 3.75], [61, 0.3, 3.4], [40, 0.2, 4.15], [27, 0.13, 3.0], [17, 0.075, 4.6], [11, 0.045, 2.6], [7, 0.025, 4.0],
  ].slice(0, NW).map(([L, A, ang], i) => {
    const k = (2 * Math.PI) / L;
    return new THREE.Vector4(Math.cos(ang), Math.sin(ang), k, A);
  });
  const omegas = waves.map((w) => Math.sqrt(9.81 * w.z));

  const near = tier === 0 ? 900 : 1400;
  const uniforms = {
    uTime: { value: 0 }, uExtent: { value: world.extent }, uCell: { value: coast.cell }, uSea: { value: sea },
    tCoast: { value: coast.tex }, tNC: { value: W.nc }, tFoam: { value: W.foam }, tBiome: { value: biome },
    tSky: { value: skyU?.tSky.value ?? null }, uSkyInt: skyU?.uInt ?? { value: 0.85 }, uHaze: { value: ctx.fog.color },
    uSun: { value: sun.clone() }, uSunCol: { value: sunCol },
    uWave: { value: waves }, uOmega: { value: omegas }, uNear: { value: near },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const defs = { NW, TIER: tier };
  if (location.search.includes('wdbg')) defs.DBG = 1;
  const vert = /* glsl */`
    #include <common>
    #include <fog_pars_vertex>
    uniform sampler2D tCoast; uniform float uTime, uExtent, uSea, uNear;
    uniform vec4 uWave[NW]; uniform float uOmega[NW];
    varying vec3 vW; varying float vH;
    ${SURF_GLSL}
    // the shore wave: crest profile over one cycle (crest at f = 0), steep front, long back
    float crest(float f) { return f > 0.84 ? pow((f - 0.84) / 0.16, 2.0) : pow(1.0 - min(f / 0.55, 1.0), 2.0); }
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float r = length(wp.xz - cameraPosition.xz);
      vec3 p = vec3(wp.x, uSea, wp.z);
      #ifndef FAR
      vec4 c = texture2D(tCoast, wp.xz / uExtent + 0.5);
      float depth = uSea - c.r, sd = c.g;
      float fade = 1.0 - smoothstep(uNear * 0.6, uNear * 0.95, r);
      // swell flattens out over the shallows
      float att = smoothstep(0.6, 14.0, depth) * fade;
      vec3 d = vec3(0.0);
      for (int i = 0; i < NW; i++) {
        vec4 w = uWave[i];
        float th = w.z * dot(w.xy, wp.xz) - uOmega[i] * uTime + float(i) * 1.7;
        float q = min(0.6 / (w.z * w.w * float(NW)), 1.0);
        d.xz += q * w.w * w.xy * cos(th);
        d.y += w.w * sin(th);
      }
      p += d * att;
      // shore waves: shoal (grow) inside ~8 m of depth, break once the face is too tall for the water under it
      float zone = smoothstep(-190.0, -70.0, sd) * fade;
      float ph = uTime / SURF_T - sd / SURF_L + surfOff(wp.xz);
      float n = floor(ph + 0.5), f = fract(ph);
      float A0 = 0.42 * waveAmp(n) * (1.0 + 0.7 * smoothstep(8.0, 1.5, depth));
      float A = min(A0, 0.42 * max(depth, 0.0) + 0.06);
      p.y += A * (crest(f) - 0.24) * zone;
      #endif
      vW = p;
      vH = p.y - uSea;
      vec4 mvPosition = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const frag = /* glsl */`
    #include <common>
    #include <fog_pars_fragment>
    uniform sampler2D tCoast, tNC, tFoam, tBiome; uniform float uTime, uExtent, uCell, uSea, uNear;
    uniform vec3 uSun, uSunCol;
    uniform vec4 uWave[NW]; uniform float uOmega[NW];
    varying vec3 vW; varying float vH;
    ${SURF_GLSL}
    ${SKY_GLSL}
    float crest(float f) { return f > 0.84 ? pow((f - 0.84) / 0.16, 2.0) : pow(1.0 - min(f / 0.55, 1.0), 2.0); }
    float dcrest(float f) { return f > 0.84 ? 2.0 * (f - 0.84) / 0.0256 : -2.0 * (1.0 - min(f / 0.55, 1.0)) / 0.55 * step(f, 0.55); }
    void main() {
      vec2 xz = vW.xz;
      vec3 V = cameraPosition - vW;
      float dist = length(V); V /= dist;
      vec2 uvC = xz / uExtent + 0.5;
      vec4 c = texture2D(tCoast, uvC);
      float sd = c.g, steep = c.a;
      float depth = uSea + vH - c.r;
      float far = smoothstep(150.0, 1800.0, dist);
      // fine detail fades out early, harder at grazing angles, before it aliases into glitter
      float fine = smoothstep(40.0, 500.0, dist) + smoothstep(0.8, 0.985, 1.0 - V.y) * 0.5;
      // ---- shore waves (same phase as the vertex shader and the swash)
      float zone = smoothstep(-190.0, -70.0, sd);
      float ph = uTime / SURF_T - sd / SURF_L + surfOff(xz);
      float n = floor(ph + 0.5), f = fract(ph);
      float amp = waveAmp(n);
      float A0 = 0.42 * amp * (1.0 + 0.7 * smoothstep(8.0, 1.5, depth));
      float A = min(A0, 0.42 * max(depth, 0.0) + 0.06);
      // breaking is strongest where the wave first trips; far shallower (reef flats) only small bores are left
      float bx = 2.0 * A0 / max(depth, 0.05);
      float brk = smoothstep(0.75, 1.25, bx) * (1.0 - 0.7 * smoothstep(2.5, 6.0, bx)) * zone;
      // ---- normal: swell slopes, shore wave slope along the distance gradient, two scales of chop
      vec2 sl = vec2(0.0);
      float att = smoothstep(0.6, 14.0, depth) * (1.0 - far * 0.85);
      for (int i = 0; i < NW; i++) {
        vec4 w = uWave[i];
        float th = w.z * dot(w.xy, xz) - uOmega[i] * uTime + float(i) * 1.7;
        sl += w.xy * (w.w * w.z * cos(th)) * (i > 2 ? max(1.0 - fine, 0.0) : 1.0);
      }
      sl *= att;
      float e = uCell * 1.5;
      vec2 gsd = vec2(texture2D(tCoast, uvC + vec2(e / uExtent, 0.0)).g - texture2D(tCoast, uvC - vec2(e / uExtent, 0.0)).g,
                      texture2D(tCoast, uvC + vec2(0.0, e / uExtent)).g - texture2D(tCoast, uvC - vec2(0.0, e / uExtent)).g) / (2.0 * e);
      sl += gsd * (-A * dcrest(f) / SURF_L) * zone * (1.0 - far);
      float tt = uTime;
      vec2 n1 = texture2D(tNC, xz / 21.0 + vec2(tt * 0.011, tt * 0.017)).rg * 2.0 - 1.0;
      vec2 n2 = texture2D(tNC, xz / 6.7 + vec2(-tt * 0.031, tt * 0.022)).rg * 2.0 - 1.0;
      #if TIER > 0
      vec2 n3 = texture2D(tNC, xz / 83.0 + vec2(tt * 0.004, -tt * 0.006)).rg * 2.0 - 1.0;
      #else
      vec2 n3 = vec2(0.0);
      #endif
      float chop = mix(0.2, 0.06, min(fine, 1.0)) * (1.0 - 0.6 * smoothstep(1.5, 0.0, depth));
      sl += (n1 * 0.6 * (1.0 - 0.5 * min(fine, 1.0)) + n2 * 0.25 * max(1.0 - fine, 0.0) + n3 * 0.7) * chop;
      vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
      // ---- foam
      float u = fract(uTime / SURF_T + surfOff(xz));
      float foamAmt = brk * (smoothstep(0.80, 0.985, f) * 1.1 + exp(-f * 6.0) * 1.2 + exp(-f * 2.2) * 0.35);
      // rocks and cliffs: the surge slams in as each bore arrives, then drains off as lacy foam
      foamAmt += steep * smoothstep(-22.0, -1.0, sd) * (1.0 - smoothstep(0.0, 3.0, sd)) * (0.35 + 1.4 * exp(-u * 4.0) * amp);
      // a ribbon of foam always clings to the waterline
      foamAmt += smoothstep(-5.0, -0.5, sd) * 0.45;
      vec2 fdrift = -normalize(gsd + 1e-5) * uTime * 0.25;
      vec3 ft = texture2D(tFoam, xz / 13.0 + fdrift * 0.08 + N.xz * 0.15).rgb;
      vec3 ft2 = texture2D(tFoam, xz / 37.0 - fdrift * 0.03).rgb;
      float fpat = mix(max(ft.r, ft2.r * 0.8) * 0.75 + ft.g * 0.25, ft2.r * 0.6 + 0.3, smoothstep(30.0, 250.0, dist));
      float foam = clamp(foamAmt * 1.25 - (1.0 - fpat) * 1.1, 0.0, 1.0) * (1.0 - far * 0.6);
      foam = max(foam, clamp(foamAmt - 0.9, 0.0, 1.0) * 0.6);
      // and a soft milky wash of old foam and churned sand over the surf zone, never thresholded into speckle
      float lace = zone * smoothstep(2.5, 0.4, depth) * (0.25 + 0.5 * exp(-f * 3.0)) * (0.5 + 0.5 * fpat) * (1.0 - far);
      // ---- light
      vec3 L = uSun;
      float NV = max(dot(N, V), 1e-3);
      // capped: a rough sea never turns into a perfect mirror even at grazing angles
      float F = min(0.02 + 0.98 * pow(1.0 - NV, 5.0), 0.4);
      vec3 R = reflect(-V, N);
      // the unresolved small waves tilt towards the viewer, so a distant sea reflects sky well above the horizon
      // haze: lift the reflected ray instead of mirroring the white horizon
      R.y = max(R.y, 0.0) * 0.75 + 0.1;
      vec3 sky = skyCol(normalize(R)) * 0.85;
      vec3 H = normalize(V + L);
      float rough = mix(0.1, 0.2, far);
      float NL = max(dot(N, L), 0.0);
      vec3 spec = uSunCol * ggx(max(dot(N, H), 0.0), rough) * F * 0.25 / max(NV, 0.2) * NL * (1.0 - foam);
      // water body. Plain alpha blending can't absorb red more than blue, so the shader paints the sea floor itself
      // (its colour estimated from the same biome mask the terrain uses) filtered through the water column, and
      // lets the real terrain show through only in the first few tens of centimetres. Turquoise over white sand,
      // teal-black over the black sand and lava shelves, navy offshore.
      float dpt = max(depth, 0.0);
      vec3 amb = vec3(0.45, 0.55, 0.65) * 0.55;
      vec3 light = amb + uSunCol * 0.2 * max(L.y, 0.0);
      vec3 scatter = mix(vec3(0.02, 0.26, 0.27), vec3(0.003, 0.022, 0.06), 1.0 - exp(-dpt / 9.0)) * light;
      vec3 Tr = exp(-dpt * vec3(0.85, 0.16, 0.11));
      vec4 bm = texture2D(tBiome, uvC);
      vec3 sand = mix(vec3(0.07, 0.065, 0.06), vec3(0.78, 0.72, 0.6), bm.g);
      vec3 floorC = mix(vec3(0.13, 0.12, 0.1), sand, bm.r) * (amb + uSunCol * 0.3 * max(L.y, 0.0));
      #if TIER > 0
      vec2 cuv = (xz + N.xz * 0.6) / 5.5;
      float caus = min(texture2D(tNC, cuv + vec2(tt * 0.025, tt * 0.01)).b, texture2D(tNC, cuv * 0.83 - vec2(tt * 0.018, -tt * 0.02)).b);
      floorC += floorC * caus * 3.0 * uSunCol.r * 0.33 * max(L.y, 0.0) * smoothstep(0.05, 0.5, dpt) * exp(-dpt * 0.25) * (1.0 - far);
      #endif
      float Tm = dot(Tr, vec3(0.333));
      // the floor is lit through the water and seen back up through it: absorbed twice
      vec3 inside = floorC * Tr * Tr + scatter * (1.0 - Tm);
      // light through the thin top of a wave as it rears up, seen against the sun
      #if TIER > 1
      vec3 ray = -V;
      float back = pow(max(dot(normalize(ray.xz + 1e-4), normalize(L.xz)), 0.0), 3.0) * smoothstep(0.0, 0.6, vH);
      inside += vec3(0.04, 0.4, 0.3) * uSunCol * 0.08 * back * (1.0 - far);
      #endif
      float alpha = 1.0 - exp(-dpt * 3.5);
      vec3 water = inside * alpha;
      vec3 col = (1.0 - F) * water + F * sky + spec;
      float a = (1.0 - F) * alpha + F;
      vec3 foamCol = vec3(0.86, 0.9, 0.92) * (amb * 1.3 + uSunCol * 0.32 * (0.4 + 0.6 * NL));
      col = mix(col, foamCol, foam + lace * 0.22 * (1.0 - foam));
      a = mix(a, 1.0, foam + lace * 0.22 * (1.0 - foam));
      // soften the waterline where the surface meets the sand
      float edge = smoothstep(-0.02, 0.3, depth);
      col *= edge; a *= edge;
      gl_FragColor = vec4(col, a);
      #ifdef DBG
      gl_FragColor = vec4(fract(sd / 20.0), clamp(depth * 0.2, 0.0, 1.0), c.b, 1.0);
      #endif
      #ifdef USE_FOG
      #include <fog_fragment>
      #endif
    }`;
  const mkMat = (far) => {
    const m = new THREE.ShaderMaterial({
      uniforms, defines: far ? { ...defs, FAR: 1 } : defs, vertexShader: vert, fragmentShader: frag, fog: true,
      transparent: true, depthWrite: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    m.userData.wx = false;
    return m;
  };
  // polar grid round the camera: rings spaced in proportion to their radius keep cells square
  const NA = tier === 0 ? 96 : tier === 1 ? 160 : 256;
  const b = (2 * Math.PI / NA) * 0.95, r1 = tier === 0 ? 1.2 : tier === 1 ? 0.9 : 0.7;
  const a0 = r1 / (Math.exp(b) - 1);
  const NR = Math.ceil(Math.log(near / a0 + 1) / b);
  const pos = [], idx = [];
  for (let j = 0; j <= NR; j++) {
    const r = Math.min(near, a0 * (Math.exp(b * j) - 1));
    for (let i = 0; i < NA; i++) { const t = (i / NA) * Math.PI * 2; pos.push(Math.cos(t) * r, 0, Math.sin(t) * r); }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
    const a = j * NA + i, b2 = j * NA + (i + 1) % NA, c = a + NA, d = b2 + NA;
    idx.push(a, b2, c, b2, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const nearMesh = new THREE.Mesh(g, mkMat(false));
  const farMesh = new THREE.Mesh(new THREE.RingGeometry(near * 0.97, 8800, 128, 1).rotateX(-Math.PI / 2), mkMat(true));
  for (const m of [nearMesh, farMesh]) {
    m.frustumCulled = false; m.renderOrder = 2;
    m.onBeforeRender = (r, s, cam) => { m.position.set(cam.position.x, 0, cam.position.z); m.updateMatrixWorld(); };
    scene.add(m);
  }

  // ---- swash sheet over the beaches
  const swash = buildSwash(ctx, coast, W, skyU, sunCol, tier);
  scene.add(swash.mesh);

  // ---- spray
  const spray = new Spray(M, { max: tier === 0 ? 260 : 900, sun, sunCol, fog: ctx.fog });
  scene.add(spray.mesh);
  ctx.spray = spray;
  // rock and cliff points where breaking waves throw spray up (not on low)
  const rocks = [];
  if (tier > 0) {
    const seen = new Set();
    const { N, cell } = coast;
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = j * N + i;
      if (coast.steep[k] < 0.6 || Math.abs(coast.sd[k] + cell) > cell * 0.7) continue;
      const x = -world.half + (i + 0.5) * cell, z = -world.half + (j + 0.5) * cell;
      const key = `${Math.floor(x / 34)},${Math.floor(z / 34)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rocks.push({ x, z, n: 0, s: coast.steep[k] });
    }
  }
  let clock = 0;
  const rnd = Math.random;

  const wetness = (p) => {
    const sd = coast.sample(coast.sd, p.x, p.z);
    if (sd > 45) return 0;
    const h = coast.sample(coast.h, p.x, p.z);
    const inSea = THREE.MathUtils.clamp((sea - h) * 3, 0, 1);
    const rs = coast.sample(coast.rs, p.x, p.z);
    const psi = clock / SURF.T + surfOff(p.x, p.z);
    const n = Math.floor(psi), amp = waveAmp(n);
    const F = swashFront(psi - n, SURF.R0 * rs * amp);
    const top = swashTop(amp, rs);
    const cover = THREE.MathUtils.smoothstep(F - sd, -0.3, 2.5) * THREE.MathUtils.smoothstep(top + 0.3 - h, 0, 0.5);
    return Math.max(cover, inSea);
  };

  return {
    wetness,
    coast,
    spray,
    update(t, dt, camera, race) {
      clock = t;
      uniforms.uTime.value = t;
      uniforms.fogColor.value.copy(scene.fog?.color ?? ctx.fog.color);
      uniforms.fogDensity.value = scene.fog?.density ?? ctx.fog.density;
      swash.uniforms.uTime.value = t;
      swash.uniforms.fogColor.value.copy(uniforms.fogColor.value);
      swash.uniforms.fogDensity.value = uniforms.fogDensity.value;
      // trucks in the water throw spray off their wheels
      if (race && dt > 0) for (const st of race.cars) {
        const v = st.v, gp = v.group.position;
        const spd = v.speed();
        if (spd < 2.5) continue;
        const wet = wetness(gp);
        if (wet < 0.08) continue;
        wheelSpray(spray, v, t, dt, wet, tier);
      }
      // waves bursting on the rocks near the camera
      if (rocks.length && camera) {
        const cx = camera.position.x, cz = camera.position.z;
        for (const r of rocks) {
          const dx = r.x - cx, dz = r.z - cz;
          if (dx * dx + dz * dz > 420 * 420) continue;
          const psi = t / SURF.T + surfOff(r.x, r.z);
          const n = Math.floor(psi);
          if (n === r.n) continue;
          const first = r.n === 0;
          r.n = n;
          const amp = waveAmp(n);
          if (first || amp < 0.62) continue;
          const y = Math.max(world.heightAt(r.x, r.z), sea) + 0.3;
          const cnt = Math.round((4 + 10 * (amp - 0.55)) * r.s);
          for (let k = 0; k < cnt; k++) {
            const up = (5 + rnd() * 9) * amp;
            spray.emit(t + rnd() * 0.25, r.x + (rnd() - 0.5) * 12, y, r.z + (rnd() - 0.5) * 12, (rnd() - 0.5) * 3, up, (rnd() - 0.5) * 3,
              1.5 + rnd() * 2.5, 2.2 + rnd() * 1.6, { drag: 0.9, grow: 1.1, opacity: 0.5, gravity: 0.6 });
          }
        }
      }
      spray.update(t);
    },
  };
}

// The swash: a sheet draped over every low shore, a hand's breadth above the sand (and the beach road). Each bore
// runs up to its run-up distance and drains back; the sand it covered stays dark and glossy for a while.
function buildSwash(ctx, coast, W, skyU, sunCol, tier) {
  const { world, sun } = ctx;
  const { N, cell } = coast;
  const step = Math.max(1, Math.round((tier === 0 ? 6 : 4) / cell));
  const M = Math.floor(N / step);
  const at = (i, j) => (j * step) * N + i * step;
  const want = (k) => coast.sd[k] > -7 && coast.sd[k] < SURF.R0 * 1.25 * coast.rs[k] + 6 && coast.h[k] < 3.6 && coast.h[k] > -1.5;
  const vid = new Int32Array(M * M).fill(-1);
  const pos = [], att = [], idx = [];
  const vtx = (i, j) => {
    const q = j * M + i;
    if (vid[q] >= 0) return vid[q];
    const k = at(i, j);
    const x = -world.half + (i * step + 0.5) * cell, z = -world.half + (j * step + 0.5) * cell;
    const h = world.heightAt(x, z);
    pos.push(x, Math.max(h, -0.4) + 0.17, z);
    att.push(coast.sd[k], coast.rs[k], h);
    vid[q] = pos.length / 3 - 1;
    return vid[q];
  };
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) {
    if (!(want(at(i, j)) || want(at(i + 1, j)) || want(at(i, j + 1)) || want(at(i + 1, j + 1)))) continue;
    const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i, j + 1), d = vtx(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('sw', new THREE.Float32BufferAttribute(att, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const uniforms = {
    uTime: { value: 0 }, tNC: { value: W.nc }, tFoam: { value: W.foam },
    tSky: { value: skyU?.tSky.value ?? null }, uSkyInt: skyU?.uInt ?? { value: 0.85 }, uHaze: { value: ctx.fog.color },
    uSun: { value: sun.clone() }, uSunCol: { value: sunCol },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 sw; varying vec3 vSw; varying vec3 vW;
      void main() {
        vSw = sw;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform sampler2D tNC, tFoam; uniform vec3 uSun, uSunCol;
      varying vec3 vSw; varying vec3 vW;
      ${SURF_GLSL}
      ${SKY_GLSL}
      void main() {
        float sd = vSw.x, rs = vSw.y, h = vSw.z;
        vec2 xz = vW.xz;
        float psi = uTime / SURF_T + surfOff(xz);
        float n = floor(psi), u = psi - n;
        float amp = waveAmp(n), ampP = waveAmp(n - 1.0);
        float R = SURF_R0 * rs * amp, Rp = SURF_R0 * rs * ampP;
        float Fr = swashFront(u, R);
        float top = swashTop(amp, rs);
        float dry = smoothstep(top + 0.3, top - 0.2, h);
        // a ragged front: bubbles and fingers of water run ahead of the sheet
        vec3 ft = texture2D(tFoam, xz / 6.0 + vec2(0.0, uTime * 0.02)).rgb;
        float film = Fr - sd + (ft.r - 0.5) * 1.6;
        float cover = smoothstep(-0.2, 0.7, film) * dry;
        // sand the last waves reached stays wet, drying over a few cycles
        float upr = step(u, SURF_UP);
        float reachP = smoothstep(0.6, -0.6, sd - Rp * smoothstep(top + 0.3, top - 0.2, h)) * exp(-(u + 1.0 - SURF_UP) * 0.7);
        float reachC = (1.0 - upr) * smoothstep(0.6, -0.6, sd - R) * exp(-(u - SURF_UP) * 0.7) * dry;
        float sheen = max(max(reachP, reachC), smoothstep(SURF_R0 * rs * 0.45, SURF_R0 * rs * 0.2, sd) * 0.7);
        sheen = max(sheen, cover);
        // foam: a churning band at the leading edge on the way up, streaks dragged seawards on the way down
        float lead = exp(-max(film, 0.0) / mix(1.4, 3.0, upr)) * cover;
        float back = (1.0 - upr) * cover * ft.g * 0.5;
        float body = 0.0;
        float fa = lead * (upr * 1.1 + 0.45) + back + body;
        float fpat = ft.r * 0.7 + texture2D(tFoam, xz / 17.0 - vec2(uTime * 0.01, 0.0)).r * 0.5;
        float foam = clamp(fa * 1.3 - (1.0 - fpat), 0.0, 1.0);
        // lighting
        vec3 V = normalize(cameraPosition - vW);
        vec2 rip = (texture2D(tNC, xz / 4.0 + vec2(uTime * 0.05, uTime * 0.03)).rg * 2.0 - 1.0) * (0.12 * cover + 0.03);
        vec3 N = normalize(vec3(rip.x, 1.0, rip.y));
        float NV = max(dot(N, V), 1e-3);
        float F = min(0.02 + 0.98 * pow(1.0 - NV, 5.0), 0.55);
        vec3 Rf = reflect(-V, N); Rf.y = max(Rf.y, 0.03);
        vec3 sky = skyCol(normalize(Rf));
        vec3 H = normalize(V + uSun);
        vec3 spec = uSunCol * ggx(max(dot(N, H), 0.0), mix(0.25, 0.08, cover)) * F * 0.25 / max(NV, 0.2) * max(dot(N, uSun), 0.0);
        float gloss = max(cover, sheen * 0.55);
        vec3 col = (F * sky + spec) * gloss + vec3(0.01, 0.05, 0.05) * cover * 0.3;
        // wet sand is darker: the sheet's alpha darkens what is under it
        float a = clamp(cover * (0.42 + 0.2 * smoothstep(0.0, 4.0, film)) + sheen * 0.32 * (1.0 - cover) + F * gloss, 0.0, 1.0);
        vec3 amb = vec3(0.45, 0.55, 0.65) * 0.55;
        vec3 foamCol = vec3(0.88, 0.91, 0.93) * (amb * 1.3 + uSunCol * 0.3 * max(uSun.y, 0.0));
        col = mix(col, foamCol, foam);
        a = mix(a, 1.0, foam);
        // under the open sea the ocean surface takes over
        float k = smoothstep(-6.0, -1.5, sd);
        gl_FragColor = vec4(col * k, a * k);
        #ifdef USE_FOG
        #include <fog_fragment>
        #endif
      }`,
  });
  mat.userData.wx = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  return { mesh, uniforms };
}
