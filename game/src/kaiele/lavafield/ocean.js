import * as THREE from 'three';
import { mulberry } from '../../world.js';

// The ocean entry: where the river pours off the new delta into the sea the water boils, littoral blasts throw
// spatter and black glass, and a huge white plume of laze (steam, acid and glass shards) billows up and away
// downwind, lit orange from below at its base. Built to be seen from the crater rim.
const tmp = new THREE.Vector3(), vel = new THREE.Vector3();

function lazePlume(M, sun, origin, wind, count) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  const seeds = new Float32Array(count * 4);
  const rnd = mulberry(1745);
  for (let i = 0; i < count; i++) { seeds[i * 4] = rnd(); seeds[i * 4 + 1] = rnd(); seeds[i * 4 + 2] = rnd(); seeds[i * 4 + 3] = rnd(); }
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, tSmoke: { value: M.smoke }, uSun: { value: sun.clone() }, uOrigin: { value: origin.clone() },
      uWind: { value: wind.clone() }, uFogColor: { value: new THREE.Color(0.62, 0.64, 0.66) }, uFogDensity: { value: 0.00028 },
    },
    vertexShader: /* glsl */`
      attribute vec4 seed;
      uniform float uTime; uniform vec3 uOrigin, uWind;
      varying vec2 vUv; varying float vAge; varying vec3 vSeed; varying float vFogDepth; varying vec3 vRight, vUp, vFwd; varying float vH;
      void main() {
        float life = 55.0;
        float age = fract(seed.x + uTime / life);
        vAge = age;
        vSeed = seed.yzw;
        // billows up fast off the water, then bends over and streams away downwind along the coast
        float h = (1.0 - exp(-age * 4.0)) * 420.0 + age * 120.0;
        vec3 p = uOrigin + vec3(0.0, h, 0.0);
        p += uWind * pow(age, 1.4) * 1500.0;
        float ang = seed.y * 6.283;
        float spread = 8.0 + pow(age, 0.9) * 260.0;
        p += vec3(cos(ang), 0.35 * sin(ang * 2.0), sin(ang)) * spread * seed.z;
        // the base: a broad churning skirt along the entry
        p.xz += vec2(cos(ang * 3.0), sin(ang * 3.0)) * 30.0 * (1.0 - smoothstep(0.0, 0.08, age)) * seed.w;
        vH = h;
        float size = 40.0 + pow(age, 0.7) * 380.0 * (0.6 + seed.w * 0.8);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float rot = seed.w * 6.283 + uTime * 0.02 * (seed.y - 0.5);
        vec2 c = vec2(cos(rot), sin(rot));
        mv.xy += vec2(position.x * c.x - position.y * c.y, position.x * c.y + position.y * c.x) * size;
        vUv = uv;
        vRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vFwd = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        vRight = vRight * c.x + vUp * c.y; vUp = cross(vFwd, vRight);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tSmoke; uniform vec3 uSun, uFogColor; uniform float uFogDensity;
      varying vec2 vUv; varying float vAge; varying vec3 vSeed; varying float vFogDepth; varying vec3 vRight, vUp, vFwd; varying float vH;
      void main() {
        vec4 s = texture2D(tSmoke, vUv);
        vec3 n = normalize((s.r * 2.0 - 1.0) * vRight + (s.g * 2.0 - 1.0) * vUp + (s.b * 2.0 - 1.0) * vFwd);
        float lit = clamp(dot(n, uSun) * 0.55 + 0.5, 0.0, 1.0);
        // bright white steam, cooler grey in its own shadow; a faint yellow-brown acid haze downwind
        vec3 col = mix(vec3(0.42, 0.45, 0.5), vec3(1.0, 0.98, 0.95) * 1.15, lit);
        col = mix(col, col * vec3(1.0, 0.94, 0.82), smoothstep(0.35, 0.9, vAge) * 0.6);
        // lit from below by the lava at the waterline
        col += vec3(1.6, 0.45, 0.08) * (1.0 - smoothstep(4.0, 60.0, vH)) * (0.5 + 0.5 * (1.0 - lit));
        float a = min(1.0, s.a * 1.3) * smoothstep(0.0, 0.02, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge)) * mix(1.0, 0.6, vAge);
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

// boiling, foaming water round the entry, glowing where the lava runs in under it
function boilMaterial(M) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { uTime: { value: 0 }, tNoise: { value: M.noise }, uDir: { value: new THREE.Vector2(0, 1) } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform sampler2D tNoise; uniform vec2 uDir; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 d = vUv * 2.0 - 1.0; float r = length(d);
        // the hot water spreads out in front of the entry
        vec2 P = vW.xz;
        float n1 = texture2D(tNoise, P / 9.0 + vec2(uTime * 0.05, -uTime * 0.03)).r;
        float n2 = texture2D(tNoise, P / 3.5 - vec2(uTime * 0.11, uTime * 0.07)).g;
        float boil = smoothstep(0.45, 0.75, n1 * 0.6 + n2 * 0.6 - r * 0.35);
        float foam = smoothstep(0.55, 0.7, n2 + (1.0 - r) * 0.25) * (1.0 - smoothstep(0.55, 1.0, r));
        vec3 col = mix(vec3(0.62, 0.66, 0.66), vec3(0.95, 0.97, 0.96), foam);
        // brown-green turbid water stirred with glass sand
        col = mix(vec3(0.16, 0.2, 0.17), col, max(boil, foam));
        // incandescent glow right at the entry, seen through the shallow water
        float hot = (1.0 - smoothstep(0.0, 0.32, r)) * (0.6 + 0.4 * n2);
        col += vec3(2.2, 0.6, 0.1) * hot * (0.6 + 0.4 * sin(uTime * 3.0 + n1 * 9.0));
        float a = (1.0 - smoothstep(0.6, 1.0, r)) * (0.35 + 0.6 * max(boil, foam)) + hot * 0.5;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
  });
}

export function buildOcean({ world, quality, M, sun, group, fx, lights, rnd }) {
  const oe = world.data.oceanEntry;
  if (!oe) return null;
  const lite = !!quality.aiLod;
  const sea = world.data.seaLevel ?? 0;
  // where the river actually reaches the water: its last point, and its direction there
  const ahi = world.data.rivers.find((r) => r.id === 'ahi') || world.data.rivers[0];
  const P = ahi.points, n = P.length, last = P[n - 1], prev = P[Math.max(0, n - 6)];
  const dx = last[0] - prev[0], dz = last[2] - prev[2], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  // the water's edge: a little way past the end of the ribbon
  const ex = last[0] + ux * 6, ez = last[2] + uz * 6;
  const wind = fx.wind;
  const plume = lazePlume(M, sun, new THREE.Vector3(ex, sea + 4, ez), wind, lite ? 170 : 320);
  group.add(plume);
  const boil = new THREE.Mesh(new THREE.CircleGeometry(48, 48).rotateX(-Math.PI / 2), boilMaterial(M));
  boil.position.set(ex + ux * 18, sea + 0.08, ez + uz * 18);
  boil.renderOrder = 3;
  group.add(boil);
  const o = { ex, ez, ux, uz, sea, acc: 0, blast: 1, plume, boil };
  o.light = { x: ex, y: sea + 6, z: ez, color: 0xff6420, I: 5000, range: 140, k: 1 };
  lights.push(o.light);
  return {
    plume,
    update(t, dt, cam) {
      plume.material.uniforms.uTime.value = t;
      boil.material.uniforms.uTime.value = t;
      const d = Math.hypot(ex - cam.x, ez - cam.z);
      o.flash = Math.max(0, (o.flash || 0) - dt * 2);
      o.light.k = 0.8 + 0.2 * Math.sin(t * 2.3) * Math.sin(t * 0.7) + o.flash;
      if (d > 1400) return;
      const { steam, gob, glow } = fx;
      // rolling white steam right along the waterline
      o.acc += dt * (lite ? 3 : 6) * (d < 500 ? 1 : 0.4);
      while (o.acc > 1) {
        o.acc -= 1;
        const s = (rnd() - 0.5) * 40, f = rnd() * 30;
        const x = ex + ux * f - uz * s, z = ez + uz * f + ux * s;
        const c = 0.9 + rnd() * 0.1;
        steam.emit(tmp.set(x, sea + 0.5, z), vel.set(wind.x * 3 + (rnd() - 0.5) * 2, 6 + rnd() * 6, wind.z * 3 + (rnd() - 0.5) * 2), 2.5 + rnd() * 2, t, 5 + rnd() * 3, c, c, c);
      }
      // littoral blasts: water flashing to steam throws black glass and molten spatter
      o.blast -= dt;
      if (o.blast <= 0) {
        o.blast = 0.8 + rnd() * 2.5;
        o.flash = 0.7;
        const s = (rnd() - 0.5) * 16;
        const x = ex - uz * s, z = ez + ux * s;
        for (let k = 0; k < (lite ? 14 : 30); k++) {
          const a = rnd() * 6.3, sp = 2 + rnd() * 6;
          gob.emit(tmp.set(x, sea + 0.5, z), vel.set(Math.cos(a) * sp + ux * 3, 6 + rnd() * 12, Math.sin(a) * sp + uz * 3), 0.1 + rnd() * 0.2, t, 1.5 + rnd(), 1, 0.7, 0.5);
        }
        glow.emit(tmp.set(x, sea + 1.5, z), vel.set(0, 3, 0), 5 + rnd() * 4, t, 0.6, 1, 0.6, 0.4);
        for (let k = 0; k < 3; k++) steam.emit(tmp.set(x + (rnd() - 0.5) * 6, sea + 1, z + (rnd() - 0.5) * 6), vel.set((rnd() - 0.5) * 6, 9 + rnd() * 8, (rnd() - 0.5) * 6), 3 + rnd() * 2, t, 4 + rnd() * 2, 0.95, 0.95, 0.95);
      }
    },
  };
}
