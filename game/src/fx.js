import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
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
  scene.background = hdr;
  scene.backgroundIntensity = 0.85;
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
  const COUNT = 420;
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
        float life = 180.0;
        float age = fract(seed.x + uTime / life);
        vAge = age;
        vSeed = seed.yzw;
        float h = pow(age, 0.75) * 2200.0;
        vec3 p = uOrigin + vec3(0.0, h, 0.0);
        p += uWind * pow(age, 1.4) * 2400.0;
        float ang = seed.y * 6.283;
        float spread = 40.0 + age * 700.0;
        p += vec3(cos(ang), 0.15 * sin(ang * 3.0), sin(ang)) * spread * seed.z;
        float size = 160.0 + pow(age, 0.7) * 1100.0 * (0.6 + seed.w * 0.8);
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
        float a = s.a * smoothstep(0.0, 0.03, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge)) * 0.85;
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
          vec3 c = vec3(0.36, 0.29, 0.24) * mix(0.45, 1.5, lit);
          gl_FragColor = vec4(c, s.a * vA * 0.55);
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
