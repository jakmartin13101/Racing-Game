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
// Instanced billboards with per-particle birth, velocity, size and life. kind 'smoke' is alpha-blended and lit,
// 'fire' is additive and runs white -> orange -> dark red over its life; 'spark' is a small hot fire streak.
export class Puffs {
  constructor(M, max, kind) {
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
    const fire = kind !== 'smoke';
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, tSmoke: { value: M.smoke }, uSun: { value: new THREE.Vector3(0, 1, 0) },
        uRise: { value: fire ? 2.2 : 1.4 }, uGrow: { value: kind === 'spark' ? 0.0 : fire ? 1.4 : 2.6 } },
      vertexShader: /* glsl */`
        attribute vec4 pb; attribute vec4 vs; attribute vec4 cl; uniform float uTime, uRise, uGrow;
        varying vec2 vUv; varying float vAge; varying vec3 vCol; varying vec3 vR, vU, vF;
        void main() {
          float t = uTime - pb.w;
          float life = cl.w;
          vAge = t < 0.0 || t > life ? 2.0 : t / life;
          // fire keeps most of its launch speed so flames ride along with a moving wreck
          float drag = ${kind === 'spark' ? '0.4' : fire ? '0.3' : '1.8'};
          vec3 p = pb.xyz + vs.xyz * (1.0 - exp(-t * drag)) / drag + vec3(0.0, t * t * ${kind === 'spark' ? '-4.0' : '0.0'} + t * uRise, 0.0);
          float size = vs.w * (1.0 + t * uGrow);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float rot = fract(pb.w * 7.31) * 6.283 + t * 0.4;
          vec2 c = vec2(cos(rot), sin(rot));
          mv.xy += vec2(position.x * c.x - position.y * c.y, position.x * c.y + position.y * c.x) * size;
          vUv = uv; vCol = cl.rgb;
          vR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          gl_Position = vAge > 1.0 ? vec4(0.0, 0.0, -2.0, 1.0) : projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tSmoke; uniform vec3 uSun; varying vec2 vUv; varying float vAge; varying vec3 vCol; varying vec3 vR, vU, vF;
        void main() {
          vec4 s = texture2D(tSmoke, vUv);
          ${fire ? `
          vec3 hot = mix(vec3(3.0, 1.9, 0.8), vec3(2.2, 0.62, 0.1), smoothstep(0.0, 0.3, vAge));
          hot = mix(hot, vec3(0.35, 0.05, 0.015), smoothstep(0.3, 1.0, vAge));
          float a = s.a * (1.0 - smoothstep(0.5, 1.0, vAge)) * smoothstep(0.0, 0.05, vAge + 0.02) * 0.55;
          gl_FragColor = vec4(hot * vCol * a, a);` : `
          vec3 n = normalize((s.r * 2.0 - 1.0) * vR + (s.g * 2.0 - 1.0) * vU + (s.b * 2.0 - 1.0) * vF);
          float lit = clamp(dot(n, uSun) * 0.5 + 0.55, 0.0, 1.0);
          float a = s.a * smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge)) * 0.8;
          gl_FragColor = vec4(vCol * mix(0.4, 1.3, lit), a);`}
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = fire ? 6 : 5;
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

// Shared crash effects: smoke, fire, sparks and a flash light for explosions.
export class CrashFx {
  constructor(M, scene, sun, lite = false) {
    this.smoke = new Puffs(M, lite ? 260 : 600, 'smoke');
    this.fire = new Puffs(M, lite ? 160 : 360, 'fire');
    this.spark = new Puffs(M, lite ? 120 : 260, 'spark');
    this.smoke.mat.uniforms.uSun.value.copy(sun);
    scene.add(this.smoke.mesh, this.fire.mesh, this.spark.mesh);
    this.flash = new THREE.PointLight(0xff7a2a, 0, 30, 2);
    scene.add(this.flash);
    this.flashT = 0;
    this.time = 0;
  }
  // carry: velocity of the thing that exploded, so the fireball travels with it
  burst(pos, time, power = 1, carry = null) {
    const v = new THREE.Vector3();
    const c = carry || new THREE.Vector3();
    for (let k = 0; k < 30 * power; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 5 * power).addScaledVector(c, 0.9);
      this.fire.emit(pos, v, 0.6 + Math.random() * 1.3 * power, time, 0.6 + Math.random() * 0.7);
    }
    for (let k = 0; k < 40 * power; k++) {
      v.set(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 14).addScaledVector(c, 0.8);
      this.spark.emit(pos, v, 0.06 + Math.random() * 0.06, time, 0.5 + Math.random() * 0.9);
    }
    for (let k = 0; k < 18 * power; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.6 + 0.3, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 3).addScaledVector(c, 0.6);
      const g = 0.05 + Math.random() * 0.05;
      this.smoke.emit(pos, v, 1.2 + Math.random() * 1.6, time + Math.random() * 0.3, 3.5 + Math.random() * 3, g, g, g);
    }
    this.flash.position.copy(pos);
    this.flashT = Math.max(this.flashT, power);
  }
  sparks(pos, dir, time, n = 8) {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.copy(dir).multiplyScalar(4 + Math.random() * 6).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(6));
      this.spark.emit(pos, v, 0.04 + Math.random() * 0.05, time, 0.3 + Math.random() * 0.5);
    }
  }
  update(time, dt) {
    this.time = time;
    this.smoke.update(time); this.fire.update(time); this.spark.update(time);
    this.flashT = Math.max(0, this.flashT - dt * 2.5);
    this.flash.intensity = this.flashT * this.flashT * 160;
  }
}

// ---------------------------------------------------------------- sense of speed
// Radial blur that grows towards the screen edges with speed, plus a chromatic split while boosting.
export class SpeedEffect extends Effect {
  constructor() {
    super('SpeedEffect', /* glsl */`
      uniform float uAmt; uniform float uAber;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec2 d = uv - vec2(0.5, 0.46);
        float r = length(d);
        float m = smoothstep(0.16, 0.72, r) * uAmt;
        vec3 acc = inputColor.rgb; float w = 1.0;
        if (m > 0.001) {
          for (int i = 1; i <= 8; i++) {
            float t = float(i) / 8.0;
            float k = 1.0 - t * 0.6;
            acc += texture2D(inputBuffer, uv - d * m * t * 0.32).rgb * k; w += k;
          }
        }
        vec3 c = acc / w;
        if (uAber > 0.001) {
          vec2 o = d * uAber * r * 0.03;
          c.r = mix(c.r, texture2D(inputBuffer, uv - o).r, 0.7);
          c.b = mix(c.b, texture2D(inputBuffer, uv + o).b, 0.7);
        }
        outputColor = vec4(c, inputColor.a);
      }`, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['uAmt', new THREE.Uniform(0)], ['uAber', new THREE.Uniform(0)]]),
    });
  }
}

// Wind streaks rushing past the camera at speed.
export class SpeedLines {
  constructor(camera, n = 90) {
    this.n = n;
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push(this.spawn(new THREE.Vector3(), true));
    this.pos = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xe8e2d8, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 8;
    camera.add(this.lines);
  }
  spawn(p, anywhere) {
    const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 6;
    return p.set(Math.cos(a) * r * 1.4, Math.sin(a) * r * 0.8 + 0.4, -(anywhere ? 4 + Math.random() * 40 : 36 + Math.random() * 10));
  }
  update(dt, spd) {
    const k = THREE.MathUtils.clamp((spd - 24) / 26, 0, 1);
    this.mat.opacity = k * 0.32;
    this.lines.visible = k > 0;
    if (!k) return;
    const len = 0.6 + spd * 0.06;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      p.z += spd * 1.15 * dt;
      if (p.z > -0.5) this.spawn(p, false);
      this.pos.set([p.x, p.y, p.z, p.x, p.y, p.z - len], i * 6);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
