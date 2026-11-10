import * as THREE from 'three';
import { mulberry } from '../world.js';

// Rain, snow and splashes, all drawn around the camera. Drops live in a box that follows the camera and
// wraps, so a fixed pool of particles fills the air wherever the camera goes.

function instancedQuad(count, seedFn) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 1, 3, 2]);
  const seeds = new Float32Array(count * 4);
  const rnd = mulberry(seedFn);
  for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  return geo;
}

// Falling rain: thin streaks stretched along their motion as the camera sees it (so they slant into the
// wind and smear past a fast truck), brighter against dark backgrounds and lit by lightning.
export class Rain {
  constructor(count, box, seed = 3) {
    this.count = count;
    this.geo = instancedQuad(count, seed);
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) },
      uFall: { value: 10 }, uWind: { value: new THREE.Vector3() }, uCamVel: { value: new THREE.Vector3() },
      uLen: { value: 0.06 }, uWidth: { value: 0.016 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0.7, 0.74, 0.8) },
    };
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 seed;
        uniform float uTime, uFall, uLen, uWidth;
        uniform vec3 uCam, uBox, uWind, uCamVel;
        varying float vA; varying float vX; varying float vY;
        void main() {
          vec3 vel = vec3(uWind.x, -uFall * (0.8 + 0.4 * seed.w), uWind.z);
          vec3 p = seed.xyz * uBox + vel * uTime;
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          vec3 rel = vel - uCamVel * 0.7;
          vec4 vh = viewMatrix * vec4(p, 1.0);
          vec4 vt = viewMatrix * vec4(p - rel * uLen, 1.0);
          vec4 v = mix(vt, vh, position.y);
          vec2 sh = vh.xy / max(-vh.z, 0.1), st = vt.xy / max(-vt.z, 0.1);
          vec2 dir = sh - st; float L = length(dir);
          dir = L > 1e-5 ? dir / L : vec2(0.0, 1.0);
          v.xy += vec2(-dir.y, dir.x) * position.x * uWidth * (1.0 + -v.z * 0.04);
          float dist = -vh.z;
          // fade the ones right at the lens and at the far side of the box
          vA = smoothstep(1.2, 4.5, dist) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p.xz - uCam.xz)));
          vA *= 0.55 + 0.45 * seed.w;
          vX = position.x; vY = position.y;
          gl_Position = projectionMatrix * v;
        }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha; uniform vec3 uColor;
        varying float vA; varying float vX; varying float vY;
        void main() {
          float a = (1.0 - vX * vX) * smoothstep(0.0, 0.35, vY) * vA * uAlpha;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }
  update(t, cam, camVel, wind, amount, color) {
    const u = this.uniforms;
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    u.uTime.value = t; u.uCam.value.copy(cam); u.uCamVel.value.copy(camVel); u.uWind.value.copy(wind);
    this.geo.instanceCount = Math.ceil(this.count * Math.min(1, 0.25 + amount * 0.75));
    u.uAlpha.value = 0.32 + amount * 0.35;
    u.uColor.value.copy(color);
  }
}

// Snow: soft flakes drifting down, swirling, driven nearly flat by a blizzard
export class Snow {
  constructor(count, box, seed = 5) {
    this.count = count;
    this.geo = instancedQuad(count, seed);
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uWind: { value: new THREE.Vector3() },
      uCamVel: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uSize: { value: 0.06 },
    };
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 seed;
        uniform float uTime, uSize; uniform vec3 uCam, uBox, uWind, uCamVel;
        varying vec2 vQ; varying float vA;
        void main() {
          vec3 vel = vec3(uWind.x, -1.1 - seed.w * 0.6, uWind.z);
          vec3 p = seed.xyz * uBox + vel * uTime;
          float ph = seed.w * 40.0;
          p += vec3(sin(uTime * 0.9 + ph) * 0.8, sin(uTime * 1.7 + ph * 1.3) * 0.25, cos(uTime * 0.7 + ph * 0.7) * 0.8);
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          // flakes smear a little along their motion relative to the camera
          vec3 rel = (viewMatrix * vec4(vel - uCamVel * 0.8, 0.0)).xyz;
          vec2 q = vec2(position.x, position.y * 2.0 - 1.0);
          // never thinner than a pixel or two, so distant flakes don't vanish
          float s = max(uSize * (0.6 + seed.x * 0.8), -mv.z * 0.0022);
          mv.xy += q * s;
          mv.xyz += rel * 0.02 * position.y;
          vQ = q;
          float dist = -mv.z;
          vA = smoothstep(0.3, 1.5, dist) * (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, length(p.xz - uCam.xz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uAlpha; uniform vec3 uColor; varying vec2 vQ; varying float vA;
        void main() {
          float a = smoothstep(1.0, 0.2, length(vQ)) * vA * uAlpha;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }
  update(t, cam, camVel, wind, amount, color) {
    const u = this.uniforms;
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    u.uTime.value = t; u.uCam.value.copy(cam); u.uWind.value.copy(wind); u.uCamVel.value.copy(camVel);
    this.geo.instanceCount = Math.ceil(this.count * Math.min(1, 0.3 + amount * 0.7));
    u.uAlpha.value = 0.75;
    u.uColor.value.copy(color);
  }
}

// Splashes where the drops hit the ground near the camera: a little crown that jumps up and a ring that
// spreads. The pool is a ring buffer filled from the CPU, since each splash needs the ground height.
export class Splashes {
  constructor(max, heightAt) {
    this.max = max; this.i = 0; this.heightAt = heightAt;
    this.rnd = mulberry(91);
    this.acc = 0;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    this.pb = new Float32Array(max * 4);
    for (let i = 0; i < max; i++) this.pb[i * 4 + 3] = -99;
    this.attr = new THREE.InstancedBufferAttribute(this.pb, 4);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('pb', this.attr);
    geo.instanceCount = max;
    this.uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.7, 0.74, 0.8) }, uAlpha: { value: 0.32 } };
    const common = { transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: this.uniforms };
    const crown = new THREE.ShaderMaterial({
      ...common,
      vertexShader: /* glsl */`
        attribute vec4 pb; uniform float uTime; varying vec2 vQ; varying float vK;
        void main() {
          float t = (uTime - pb.w) / 0.22;
          vK = t < 0.0 || t > 1.0 ? -1.0 : t;
          vec4 mv = viewMatrix * vec4(pb.xyz, 1.0);
          float s = 0.04 + 0.05 * fract(pb.x * 7.7);
          mv.xy += vec2(position.x * s * (0.6 + t), position.y * s * 1.4 * sin(min(t, 1.0) * 3.1416));
          vQ = position.xy;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uAlpha; varying vec2 vQ; varying float vK;
        void main() {
          if (vK < 0.0) discard;
          // two arms of spray thrown out to the sides
          float arm = smoothstep(0.35, 0.0, abs(abs(vQ.x) - 0.25 - vQ.y * 0.55));
          gl_FragColor = vec4(uColor, arm * (1.0 - vK) * uAlpha);
        }`,
    });
    const ring = new THREE.ShaderMaterial({
      ...common,
      vertexShader: /* glsl */`
        attribute vec4 pb; uniform float uTime; varying vec2 vQ; varying float vK;
        void main() {
          float t = (uTime - pb.w) / 0.5;
          vK = t < 0.0 || t > 1.0 ? -1.0 : t;
          float s = 0.08 + 0.22 * t;
          vec3 p = pb.xyz + vec3(position.x * s, 0.0, (position.y * 2.0 - 1.0) * s);
          vQ = vec2(position.x, position.y * 2.0 - 1.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uAlpha; varying vec2 vQ; varying float vK;
        void main() {
          if (vK < 0.0) discard;
          float r = length(vQ);
          float a = smoothstep(0.75, 0.9, r) * smoothstep(1.0, 0.9, r);
          gl_FragColor = vec4(uColor, a * (1.0 - vK) * uAlpha * 0.7);
        }`,
    });
    this.crown = new THREE.Mesh(geo, crown);
    this.ring = new THREE.Mesh(geo, ring);
    for (const m of [this.crown, this.ring]) { m.frustumCulled = false; m.renderOrder = 7; m.visible = false; }
  }
  update(t, dt, cam, fwd, amount, color) {
    const on = amount > 0.01 && !!this.heightAt;
    this.crown.visible = this.ring.visible = on;
    if (!on) return;
    this.uniforms.uTime.value = t;
    this.uniforms.uColor.value.copy(color);
    const rnd = this.rnd;
    this.acc += dt * amount * this.max * 2.2;
    let n = 0;
    while (this.acc > 1 && n++ < 400) {
      this.acc -= 1;
      // most of them in front of the camera, where they are seen
      const a = Math.atan2(fwd.z, fwd.x) + (rnd() - 0.5) * 2.2, r = 1.5 + Math.pow(rnd(), 0.7) * 26;
      const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
      const k = (this.i++ % this.max) * 4;
      this.pb[k] = x; this.pb[k + 1] = this.heightAt(x, z) + 0.14; this.pb[k + 2] = z; this.pb[k + 3] = t - rnd() * 0.02;
    }
    this.attr.needsUpdate = true;
  }
}
