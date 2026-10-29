import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Effect, EffectAttribute } from 'postprocessing';
import { mulberry } from './world.js';

// ---------------------------------------------------------------- sky + sun + env
// Poly Haven 'clarens_midday' HDRI drives the background, reflections and ambient light.
export async function buildSky(renderer, scene) {
  const BASE = import.meta.env.BASE_URL;
  const [hdr, info] = await Promise.all([
    new HDRLoader().loadAsync(`${BASE}env/sky.hdr`),
    fetch(`${BASE}env/sky.json`).then((r) => r.json()),
  ]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  // sky dome: HDRI above the horizon, fading into the haze below it (the HDRI's
  // own ground is grassland, which must never show past the volcano terrain)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8500, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { tSky: { value: hdr }, uHaze: { value: new THREE.Color(0.62, 0.64, 0.66) }, uInt: { value: 0.85 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform sampler2D tSky; uniform vec3 uHaze; uniform float uInt; varying vec3 vD;
      void main(){ vec3 d = normalize(vD);
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        vec3 c = texture2D(tSky, uv).rgb * uInt;
        float h = smoothstep(-0.04, 0.1, d.y);
        c = mix(uHaze, c, h * h * (3.0 - 2.0 * h) * 0.7 + 0.3 * step(0.0, d.y) * h);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.onBeforeRender = (r, s, cam) => dome.position.copy(cam.position);
  scene.add(dome);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.6;
  // three's equirect lookup: u = atan(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5
  const phi = (info.u - 0.5) * Math.PI * 2;
  const el = THREE.MathUtils.degToRad(info.elev);
  const sun = new THREE.Vector3(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el)).normalize();
  return { sun };
}

// ---------------------------------------------------------------- volcanic plume
// Large lit billboards; each puff rises, expands and drifts downwind.
export function buildPlume(world, M, sunDir) {
  const COUNT = 700;
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  const seeds = new Float32Array(COUNT * 4);
  const rnd = mulberry(5);
  for (let i = 0; i < COUNT; i++) {
    seeds[i * 4] = rnd(); seeds[i * 4 + 1] = rnd(); seeds[i * 4 + 2] = rnd(); seeds[i * 4 + 3] = rnd();
  }
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = COUNT;
  const top = world.heightAt(0, 0) + 60;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, tSmoke: { value: M.smoke }, uSun: { value: sunDir.clone() },
      uOrigin: { value: new THREE.Vector3(0, top, 0) }, uWind: { value: new THREE.Vector3(1, 0, 0.35).normalize() },
      uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec4 seed;
      uniform float uTime; uniform vec3 uOrigin, uWind;
      varying vec2 vUv; varying float vAge; varying vec3 vSeed; varying float vFogDepth; varying vec3 vRight, vUp, vFwd;
      void main() {
        float life = 150.0;
        float age = fract(seed.x + uTime / life);
        vAge = age;
        vSeed = seed.yzw;
        float h = pow(age, 0.85) * 2600.0;
        vec3 p = uOrigin + vec3(0.0, h, 0.0);
        p += uWind * pow(age, 1.8) * 2600.0;
        float ang = seed.y * 6.283;
        float spread = 25.0 + pow(age, 1.3) * 650.0;
        p += vec3(cos(ang), 0.15 * sin(ang * 3.0), sin(ang)) * spread * seed.z;
        float size = 70.0 + pow(age, 0.9) * 900.0 * (0.6 + seed.w * 0.8);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float rot = seed.w * 6.283 + uTime * 0.01 * (seed.y - 0.5);
        vec2 c = vec2(cos(rot), sin(rot));
        vec2 off = vec2(position.x * c.x - position.y * c.y, position.x * c.y + position.y * c.x);
        mv.xy += off * size;
        vUv = uv;
        vRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vFwd = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        // rotate the fake sphere normal basis with the sprite
        vRight = vRight * c.x + vUp * c.y; vUp = cross(vFwd, vRight);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tSmoke; uniform vec3 uSun; uniform vec3 uFogColor; uniform float uFogDensity;
      varying vec2 vUv; varying float vAge; varying vec3 vSeed; varying float vFogDepth; varying vec3 vRight, vUp, vFwd;
      void main() {
        vec4 s = texture2D(tSmoke, vUv);
        vec3 n = normalize((s.r * 2.0 - 1.0) * vRight + (s.g * 2.0 - 1.0) * vUp + (s.b * 2.0 - 1.0) * vFwd);
        float lit = clamp(dot(n, uSun) * 0.6 + 0.45, 0.0, 1.0);
        // dark ash-laden column near the vent, paler and thinner as it disperses
        vec3 dark = vec3(0.07, 0.065, 0.062), pale = vec3(0.55, 0.52, 0.5);
        vec3 col = mix(dark, pale, smoothstep(0.05, 0.7, vAge) * 0.55 + vSeed.x * 0.15);
        vec3 sunC = vec3(1.0, 0.86, 0.68);
        col *= mix(vec3(0.35, 0.36, 0.42), sunC * 1.25, lit);
        // glow from the crater lights the base of the column
        col += vec3(1.0, 0.3, 0.06) * (1.0 - smoothstep(0.0, 0.02, vAge)) * 0.6;
        float a = s.a * smoothstep(0.0, 0.015, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge));
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth * 0.25);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

// ---------------------------------------------------------------- drifting ash & embers near the camera
export function buildAsh() {
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const s = new Float32Array(N);
  const rnd = mulberry(77);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rnd() * 120 - 60; pos[i * 3 + 1] = rnd() * 50; pos[i * 3 + 2] = rnd() * 120 - 60;
    s[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime; uniform vec3 uCam; uniform float uScale; varying float vS; varying float vEmber;
      void main() {
        vec3 p = position + vec3(uTime * 2.5, -uTime * (0.6 + seed), uTime * 1.2);
        p.x += sin(uTime * 0.7 + seed * 30.0) * 1.5;
        p = mod(p - uCam + vec3(60.0, 25.0, 60.0), vec3(120.0, 50.0, 120.0)) + uCam - vec3(60.0, 25.0, 60.0);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vS = seed;
        vEmber = step(0.86, seed);
        gl_PointSize = clamp((vEmber > 0.5 ? 0.06 : 0.035) * uScale / -mv.z, 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vS; varying float vEmber;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 c = vEmber > 0.5 ? vec3(3.0, 0.9, 0.2) * (0.6 + 0.4 * sin(vS * 50.0)) : vec3(0.18, 0.17, 0.16);
        gl_FragColor = vec4(c * a, a * (vEmber > 0.5 ? 1.0 : 0.5));
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- wheel dust
export class Dust {
  constructor(M, max = 400) {
    this.max = max;
    this.i = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.p = new Float32Array(max * 4); // xyz, birth time
    this.v = new Float32Array(max * 4); // velocity, size
    this.pa = new THREE.InstancedBufferAttribute(this.p, 4);
    this.va = new THREE.InstancedBufferAttribute(this.v, 4);
    this.pa.setUsage(THREE.DynamicDrawUsage); this.va.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('pb', this.pa);
    geo.setAttribute('vs', this.va);
    geo.instanceCount = max;
    for (let i = 0; i < max; i++) this.p[i * 4 + 3] = -999;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, tSmoke: { value: M.smoke }, uSun: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: /* glsl */`
        attribute vec4 pb; attribute vec4 vs; uniform float uTime;
        varying vec2 vUv; varying float vA; varying vec3 vR, vU, vF;
        void main() {
          float t = uTime - pb.w;
          float life = 2.6;
          vA = t < 0.0 || t > life ? 0.0 : (1.0 - t / life);
          vec3 p = pb.xyz + vs.xyz * (1.0 - exp(-t * 1.6)) / 1.6 + vec3(0.0, t * 0.8, 0.0);
          float size = vs.w * (1.0 + t * 2.2);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          mv.xy += position.xy * size;
          vUv = uv;
          vR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tSmoke; uniform vec3 uSun; varying vec2 vUv; varying float vA; varying vec3 vR, vU, vF;
        void main() {
          vec4 s = texture2D(tSmoke, vUv);
          vec3 n = normalize((s.r * 2.0 - 1.0) * vR + (s.g * 2.0 - 1.0) * vU + (s.b * 2.0 - 1.0) * vF);
          float lit = clamp(dot(n, uSun) * 0.5 + 0.55, 0.0, 1.0);
          vec3 c = vec3(0.21, 0.185, 0.165) * mix(0.45, 1.4, lit);
          gl_FragColor = vec4(c, s.a * vA * 0.45);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
  emit(pos, vel, size, time) {
    const i = this.i++ % this.max;
    this.p[i * 4] = pos.x; this.p[i * 4 + 1] = pos.y; this.p[i * 4 + 2] = pos.z; this.p[i * 4 + 3] = time;
    this.v[i * 4] = vel.x; this.v[i * 4 + 1] = vel.y; this.v[i * 4 + 2] = vel.z; this.v[i * 4 + 3] = size;
    this.dirty = true;
  }
  update(time) {
    this.mat.uniforms.uTime.value = time;
    if (this.dirty) { this.pa.needsUpdate = true; this.va.needsUpdate = true; this.dirty = false; }
  }
}

// ---------------------------------------------------------------- crash smoke, fire and sparks
// Procedural flame tongue: hot narrow core, ragged edges, brighter at the base.
function flameTexture() {
  const W = 128, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const rnd = mulberry(91);
  const noise = Array.from({ length: 64 }, () => rnd());
  const n1 = (x) => { const i = Math.floor(x) & 63, f = x - Math.floor(x); return noise[i] * (1 - f) + noise[(i + 1) & 63] * f; };
  for (let y = 0; y < H; y++) {
    const v = y / H; // 0 top .. 1 base
    const width = 0.12 + 0.32 * Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.62) ** 1.2;
    for (let x = 0; x < W; x++) {
      const u = (x / W - 0.5) + (n1(v * 9 + 3) - 0.5) * 0.14 * (1 - v);
      const edge = Math.abs(u) / width;
      let a = Math.max(0, 1 - edge * edge) * Math.min(1, v * 3.5) * (0.75 + 0.5 * n1(x * 0.21 + v * 17));
      a *= Math.min(1, (1 - v) * 6 + 0.25);
      const k = (y * W + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  return t;
}

// Instanced billboards with per-particle birth, velocity, size and life.
// kinds: 'smoke' alpha-blended and lit; 'fire' additive puffs white -> orange -> dark red;
// 'flame' additive tongues stretched upwards; 'spark' small hot streaks stretched along their motion.
export class Puffs {
  constructor(M, max, kind, tex = M.smoke) {
    this.max = max; this.i = 0; this.kind = kind;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.p = new Float32Array(max * 4); this.v = new Float32Array(max * 4); this.c = new Float32Array(max * 4);
    const mk = (arr, name) => { const a = new THREE.InstancedBufferAttribute(arr, 4); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    this.attrs = [mk(this.p, 'pb'), mk(this.v, 'vs'), mk(this.c, 'cl')];
    geo.instanceCount = max;
    for (let i = 0; i < max; i++) this.p[i * 4 + 3] = -999;
    const hot = kind !== 'smoke';
    const drag = kind === 'spark' ? '0.5' : kind === 'flame' ? '0.2' : kind === 'fire' ? '0.9' : '1.8';
    const grav = kind === 'spark' ? '-9.0' : '0.0';
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, tTex: { value: tex }, uSun: { value: new THREE.Vector3(0, 1, 0) },
        uRise: { value: kind === 'fire' ? 2.4 : kind === 'flame' ? 0.6 : kind === 'spark' ? 0 : 1.4 },
        uGrow: { value: kind === 'spark' ? 0.0 : kind === 'flame' ? 0.3 : kind === 'fire' ? 1.6 : 2.6 } },
      vertexShader: /* glsl */`
        attribute vec4 pb; attribute vec4 vs; attribute vec4 cl; uniform float uTime, uRise, uGrow;
        varying vec2 vUv; varying float vAge; varying vec3 vCol; varying vec3 vR, vU, vF; varying float vSeed;
        void main() {
          float t = uTime - pb.w;
          float life = cl.w;
          vAge = t < 0.0 || t > life ? 2.0 : t / life;
          float drag = ${drag};
          vec3 p = pb.xyz + vs.xyz * (1.0 - exp(-t * drag)) / drag + vec3(0.0, 0.5 * ${grav} * t * t + t * uRise, 0.0);
          float size = vs.w * (1.0 + t * uGrow);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vSeed = fract(pb.w * 7.31 + pb.x * 0.37);
          ${kind === 'spark' ? `
          // streak along the screen-space direction of travel
          vec3 vel = vs.xyz * exp(-t * drag) + vec3(0.0, ${grav} * t, 0.0);
          vec2 d = (viewMatrix * vec4(vel, 0.0)).xy;
          float L = length(d);
          vec2 dir = L > 1e-3 ? d / L : vec2(0.0, 1.0);
          vec2 perp = vec2(-dir.y, dir.x);
          mv.xy += perp * position.x * size + dir * position.y * (size + L * 0.035);` : kind === 'flame' ? `
          // tongues stand upright, base at the emitter, flickering in width
          float fl = 0.85 + 0.3 * sin(uTime * 23.0 + vSeed * 40.0);
          mv.xy += vec2(position.x * size * fl, (position.y + 0.45) * size * 1.9);` : `
          float rot = vSeed * 6.283 + t * 0.4;
          vec2 c = vec2(cos(rot), sin(rot));
          mv.xy += vec2(position.x * c.x - position.y * c.y, position.x * c.y + position.y * c.x) * size;`}
          vUv = uv; vCol = cl.rgb;
          vR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          gl_Position = vAge > 1.0 ? vec4(0.0, 0.0, -2.0, 1.0) : projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tTex; uniform vec3 uSun; uniform float uTime;
        varying vec2 vUv; varying float vAge; varying vec3 vCol; varying vec3 vR, vU, vF; varying float vSeed;
        void main() {
          ${kind === 'spark' ? `
          float a = (1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5))) * (1.0 - smoothstep(0.6, 1.0, vAge));
          gl_FragColor = vec4(vec3(4.0, 2.2, 0.8) * vCol * a, a);` : kind === 'flame' ? `
          vec2 uv = vUv + vec2(sin(vUv.y * 9.0 + uTime * 14.0 + vSeed * 20.0) * 0.05 * vUv.y, 0.0);
          float a = texture2D(tTex, uv).a * (1.0 - smoothstep(0.55, 1.0, vAge)) * smoothstep(0.0, 0.08, vAge);
          // white-yellow at the root, orange body, deep red tips
          vec3 c = mix(vec3(2.0, 1.25, 0.5), vec3(1.7, 0.48, 0.07), smoothstep(0.08, 0.45, vUv.y));
          c = mix(c, vec3(0.5, 0.06, 0.01), smoothstep(0.5, 1.0, vUv.y) + vAge * 0.5);
          gl_FragColor = vec4(c * vCol * a * 0.5, a);` : kind === 'fire' ? `
          vec4 s = texture2D(tTex, vUv);
          vec3 hot = mix(vec3(3.4, 2.4, 1.2), vec3(2.4, 0.68, 0.1), smoothstep(0.0, 0.25, vAge));
          hot = mix(hot, vec3(0.3, 0.04, 0.01), smoothstep(0.25, 0.9, vAge));
          float a = s.a * (1.0 - smoothstep(0.45, 1.0, vAge)) * smoothstep(0.0, 0.04, vAge + 0.02) * 0.6;
          gl_FragColor = vec4(hot * vCol * a, a);` : `
          vec4 s = texture2D(tTex, vUv);
          vec3 n = normalize((s.r * 2.0 - 1.0) * vR + (s.g * 2.0 - 1.0) * vU + (s.b * 2.0 - 1.0) * vF);
          float lit = clamp(dot(n, uSun) * 0.5 + 0.55, 0.0, 1.0);
          float a = s.a * smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge)) * 0.85;
          gl_FragColor = vec4(vCol * mix(0.4, 1.3, lit), a);`}
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = hot ? 6 : 5;
  }
  emit(pos, vel, size, time, life = 2, r = 1, g = 1, b = 1) {
    const i = this.i++ % this.max, k = i * 4;
    this.p[k] = pos.x; this.p[k + 1] = pos.y; this.p[k + 2] = pos.z; this.p[k + 3] = time;
    this.v[k] = vel.x; this.v[k + 1] = vel.y; this.v[k + 2] = vel.z; this.v[k + 3] = size;
    this.c[k] = r; this.c[k + 1] = g; this.c[k + 2] = b; this.c[k + 3] = life;
    this.dirty = true;
  }
  update(time) {
    this.mat.uniforms.uTime.value = time;
    if (this.dirty) { for (const a of this.attrs) a.needsUpdate = true; this.dirty = false; }
  }
}

// Shared crash effects: smoke, fire, flames, sparks, an explosion flash light and a flickering fire light.
export class CrashFx {
  constructor(M, scene, sun, lite = false) {
    this.lite = lite;
    this.smoke = new Puffs(M, lite ? 320 : 800, 'smoke');
    this.fire = new Puffs(M, lite ? 200 : 480, 'fire');
    this.flame = new Puffs(M, lite ? 160 : 360, 'flame', flameTexture());
    this.spark = new Puffs(M, lite ? 160 : 400, 'spark');
    this.smoke.mat.uniforms.uSun.value.copy(sun);
    scene.add(this.smoke.mesh, this.fire.mesh, this.flame.mesh, this.spark.mesh);
    this.flash = new THREE.PointLight(0xff7a2a, 0, 34, 2);
    this.fireLight = new THREE.PointLight(0xff6a1a, 0, 16, 2);
    scene.add(this.flash, this.fireLight);
    this.flashT = 0;
    this.time = 0;
    this.fireK = 0;
  }
  // carry: velocity of the thing that exploded, so the fireball travels with it
  burst(pos, time, power = 1, carry = null) {
    const v = new THREE.Vector3();
    const c = carry || new THREE.Vector3();
    for (let k = 0; k < 24 * power; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 5 * power).addScaledVector(c, 0.9);
      this.fire.emit(pos, v, 0.6 + Math.random() * 1.2 * power, time, 0.6 + Math.random() * 0.7);
    }
    for (let k = 0; k < 36 * power; k++) {
      v.set(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 14).addScaledVector(c, 0.8);
      this.spark.emit(pos, v, 0.05 + Math.random() * 0.05, time, 0.5 + Math.random() * 0.9);
    }
    for (let k = 0; k < 16 * power; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.6 + 0.3, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 3).addScaledVector(c, 0.6);
      const g = 0.05 + Math.random() * 0.05;
      this.smoke.emit(pos, v, 1.2 + Math.random() * 1.6, time + Math.random() * 0.3, 3.5 + Math.random() * 3, g, g, g);
    }
    this.flash.position.copy(pos);
    this.flashT = Math.max(this.flashT, power * 0.8);
  }
  // a full engine explosion: white core flash, rolling fireball, flame tongues, shrapnel sparks,
  // a ground-hugging dust ring and a thick black column
  explode(pos, time, power = 1.5, carry = null) {
    const v = new THREE.Vector3();
    const c = carry || new THREE.Vector3();
    const n = this.lite ? 0.6 : 1;
    for (let k = 0; k < 4; k++) this.fire.emit(pos, v.copy(c).multiplyScalar(0.95), 2.2 * power, time, 0.22, 1.4, 1.3, 1.2);
    for (let k = 0; k < 44 * power * n; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.35, Math.random() - 0.5).normalize().multiplyScalar(2.5 + Math.random() * 6 * power).addScaledVector(c, 0.9);
      this.fire.emit(pos, v, 0.8 + Math.random() * 1.6 * power, time + Math.random() * 0.12, 0.7 + Math.random() * 0.9);
    }
    for (let k = 0; k < 24 * n; k++) {
      v.set((Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3).addScaledVector(c, 0.95);
      this.flame.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2)), v, 0.7 + Math.random() * 1.1, time + Math.random() * 0.3, 0.6 + Math.random() * 0.6);
    }
    for (let k = 0; k < 90 * n; k++) {
      v.set(Math.random() - 0.5, Math.random() * 1.3, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 20).addScaledVector(c, 0.8);
      this.spark.emit(pos, v, 0.035 + Math.random() * 0.05, time, 0.6 + Math.random() * 1.2);
    }
    for (let k = 0; k < 26 * n; k++) {
      const a = (k / 26) * Math.PI * 2;
      v.set(Math.cos(a) * 9, 0.4, Math.sin(a) * 9).addScaledVector(c, 0.5);
      const g = 0.26 + Math.random() * 0.06;
      this.smoke.emit(pos.clone().add(new THREE.Vector3(0, -0.8, 0)), v, 0.9 + Math.random() * 0.6, time, 2.2 + Math.random(), g, g * 0.92, g * 0.85);
    }
    for (let k = 0; k < 36 * n; k++) {
      v.set((Math.random() - 0.5) * 2.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 2.5).addScaledVector(c, 0.55);
      const g = 0.03 + Math.random() * 0.04;
      this.smoke.emit(pos, v, 1.3 + Math.random() * 2, time + 0.1 + Math.random() * 0.6, 5 + Math.random() * 4, g, g, g);
    }
    this.flash.position.copy(pos);
    this.flashT = Math.max(this.flashT, power);
  }
  sparks(pos, dir, time, n = 8) {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.copy(dir).multiplyScalar(4 + Math.random() * 6).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(6));
      this.spark.emit(pos, v, 0.03 + Math.random() * 0.04, time, 0.3 + Math.random() * 0.5);
    }
  }
  // a burning wreck lights its surroundings; the brightest caller this frame wins
  light(pos, k) {
    if (k < this.fireK) return;
    this.fireK = k;
    this.fireLight.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
  }
  update(time, dt) {
    this.time = time;
    this.smoke.update(time); this.fire.update(time); this.flame.update(time); this.spark.update(time);
    this.flashT = Math.max(0, this.flashT - dt * 2.5);
    this.flash.intensity = this.flashT * this.flashT * 180;
    this.fireLight.intensity = this.fireK * (26 + Math.sin(time * 31) * 6 + Math.sin(time * 17.3) * 5 + Math.random() * 6);
    this.fireK = 0;
  }
}

// ---------------------------------------------------------------- sense of speed
// Camera motion blur: each pixel's world position (from depth) is reprojected with last frame's camera, and the
// image is smeared along the difference. The truck moves with the camera, so it stays sharp while the ground
// streams past. Adds a little radial zoom blur while boosting and a chromatic split in the boost redline.
export class MotionBlurEffect extends Effect {
  constructor(samples = 10) {
    super('MotionBlurEffect', /* glsl */`
      uniform mat4 uInvProj, uCamWorld, uPrevVP;
      uniform float uAmount, uRadial, uAber, uHaze, uTime;
      void mainImage(const in vec4 inputColor, const in vec2 uvIn, const in float depth, out vec4 outputColor) {
        // heat shimmer over hot ground: a small wobble of the image, strongest low in the frame and far away
        vec2 uv = uvIn;
        if (uHaze > 0.001) {
          float w = uHaze * smoothstep(0.75, 0.25, uvIn.y) * smoothstep(0.96, 0.995, depth);
          uv += w * 0.0022 * vec2(sin(uvIn.y * 160.0 + uTime * 7.0) + 0.5 * sin(uvIn.x * 93.0 - uTime * 5.0),
                                  cos(uvIn.x * 120.0 + uTime * 6.0));
        }
        vec4 base = uHaze > 0.001 ? texture2D(inputBuffer, uv) : inputColor;
        vec4 ndc = vec4(uvIn * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 view = uInvProj * ndc; view /= view.w;
        vec4 world = uCamWorld * view;
        vec4 prev = uPrevVP * world;
        vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
        vec2 vel = (uvIn - prevUv) * uAmount;
        vec2 d = uv - vec2(0.5, 0.46);
        vel += d * uRadial * smoothstep(0.1, 0.6, length(d));
        float L = length(vel);
        if (L > 0.07) vel *= 0.07 / L;
        vec3 acc = base.rgb; float w = 1.0;
        if (L > 0.0008) {
          for (int i = 1; i < SAMPLES; i++) {
            float t = float(i) / float(SAMPLES - 1) - 0.5;
            acc += texture2D(inputBuffer, uv - vel * t).rgb; w += 1.0;
          }
        }
        vec3 c = acc / w;
        if (uAber > 0.001) {
          vec2 o = d * uAber * length(d) * 0.035;
          c.r = mix(c.r, texture2D(inputBuffer, uv - o).r, 0.7);
          c.b = mix(c.b, texture2D(inputBuffer, uv + o).b, 0.7);
        }
        outputColor = vec4(c, base.a);
      }`, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      defines: new Map([['SAMPLES', String(samples)]]),
      uniforms: new Map([
        ['uInvProj', new THREE.Uniform(new THREE.Matrix4())], ['uCamWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['uPrevVP', new THREE.Uniform(new THREE.Matrix4())], ['uAmount', new THREE.Uniform(0)],
        ['uRadial', new THREE.Uniform(0)], ['uAber', new THREE.Uniform(0)], ['uHaze', new THREE.Uniform(0)], ['uTime', new THREE.Uniform(0)],
      ]),
    });
    this.prevVP = new THREE.Matrix4();
    this.prevPos = new THREE.Vector3();
    this.first = true;
  }
  // call once per frame before rendering, after the camera has moved
  track(camera, amount) {
    camera.updateMatrixWorld();
    const u = this.uniforms;
    u.get('uInvProj').value.copy(camera.projectionMatrixInverse);
    u.get('uCamWorld').value.copy(camera.matrixWorld);
    u.get('uPrevVP').value.copy(this.prevVP);
    // camera cuts would smear the whole screen
    const jump = camera.position.distanceTo(this.prevPos) > 25;
    u.get('uAmount').value = this.first || jump ? 0 : amount;
    this.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.prevPos.copy(camera.position);
    this.first = false;
  }
}
