import * as THREE from 'three';

// Explosion pieces that the billboard particles can't do on their own:
// - Fireballs: noise-displaced spheres that boil out white-hot, roll and rise as they cool through orange and
//   red, and turn into a dark, dissolving smoke ball. One shader does both the glow and the smoke (premultiplied
//   alpha: the fire adds light, the smoke covers what is behind it).
// - Shock: a bright ring racing out along the ground and a fast-expanding heat shell.
// - Scorch: a burnt black patch left on the ground, fading after a while.

const NOISE = /* glsl */`
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

export class Fireballs {
  constructor(scene, lite = false) {
    this.max = lite ? 10 : 22;
    this.list = [];
    const geo = new THREE.IcosahedronGeometry(1, lite ? 3 : 4);
    const oct = lite ? 2 : 4;
    for (let i = 0; i < this.max; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: { uAge: { value: 0 }, uSeed: { value: Math.random() * 50 }, uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uHot: { value: 1 } },
        vertexShader: /* glsl */`
          uniform float uAge, uSeed, uTime;
          varying vec3 vN, vV, vP; varying float vD;
          ${NOISE}
          void main() {
            vec3 p = position;
            // lumpy, boiling surface: big billows plus small turbulence, rolling upwards
            float n = snoise(p * 1.4 + vec3(uSeed, uSeed * 0.7 - uTime * 0.9, uSeed * 1.3)) * 0.5
                    + snoise(p * 2.6 + vec3(-uTime * 0.6, uSeed - uTime * 1.4, 0.0)) * 0.16;
            vD = n;
            p *= 1.0 + n * (0.24 + uAge * 0.14);
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vP = position;
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */`
          uniform float uAge, uSeed, uTime, uHot; uniform vec3 uLight;
          varying vec3 vN, vV, vP; varying float vD;
          ${NOISE}
          void main() {
            vec3 q = vP * 2.4 + vec3(uSeed, -uTime * 1.1, uSeed);
            float n = 0.0, a = 0.5;
            for (int i = 0; i < ${oct}; i++) { n += snoise(q) * a; q = q * 2.03 + 1.7; a *= 0.5; }
            n = n * 0.5 + 0.5 + vD * 0.4;
            float facing = abs(dot(normalize(vN), vV));
            // temperature: hottest in the folds facing the camera at first, cooling with age
            float heat = clamp((n * 1.7 - 0.5) * (1.0 - uAge * 1.9) * uHot + facing * 0.25 * (1.0 - uAge * 2.6), 0.0, 1.0);
            vec3 fire = mix(vec3(0.55, 0.07, 0.015), vec3(1.9, 0.7, 0.14), smoothstep(0.12, 0.55, heat));
            fire = mix(fire, vec3(3.0, 2.3, 1.4), smoothstep(0.75, 1.0, heat));
            float glow = smoothstep(0.06, 0.4, heat);
            // smoke: dark, lit a little from above, eaten away as it dissolves
            vec3 smoke = vec3(0.055, 0.05, 0.048) * (0.6 + 0.8 * n) * uLight;
            float dissolve = smoothstep(uAge * 1.25 - 0.15, uAge * 1.25 + 0.05, n * 0.85 + 0.15);
            float edge = smoothstep(0.05, 0.75, facing);
            float alpha = edge * dissolve * (1.0 - smoothstep(0.75, 1.0, uAge));
            vec3 col = mix(smoke, fire, glow);
            // premultiplied: fire is mostly light added, smoke mostly cover
            float cover = alpha * mix(0.93, 0.55, glow);
            gl_FragColor = vec4(col * alpha, cover);
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 7;
      scene.add(m);
      this.list.push({ m, t: 0, life: 1, vel: new THREE.Vector3(), r: 1, on: false });
    }
    this.i = 0;
  }

  // r: final radius; vel: drift; delay: seconds before it appears
  spawn(pos, r, vel, life = 2.6, delay = 0, hot = 1) {
    const f = this.list[this.i++ % this.max];
    f.m.position.copy(pos);
    f.vel.copy(vel);
    f.r = r; f.life = life; f.t = -delay; f.on = true; f.hot = hot;
    f.m.material.uniforms.uSeed.value = Math.random() * 50;
    f.m.material.uniforms.uHot.value = hot;
    f.m.visible = false;
  }

  update(dt, time, light) {
    for (const f of this.list) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t < 0) continue;
      const u = f.t / f.life;
      if (u >= 1) { f.on = false; f.m.visible = false; continue; }
      f.m.visible = true;
      // bursts out fast, then keeps swelling slowly as it rises and drags to a stop
      const s = f.r * (1 - Math.exp(-f.t * 7)) * (1 + u * 0.5);
      f.m.scale.set(s, s * (1 + u * 0.25), s);
      f.m.position.addScaledVector(f.vel, dt);
      f.vel.multiplyScalar(Math.exp(-dt * 2.2));
      f.vel.y += dt * (3.5 + 3 * (1 - u));
      const U = f.m.material.uniforms;
      U.uAge.value = u; U.uTime.value = time;
      if (light) U.uLight.value.copy(light);
    }
  }
}

// a bright ring racing out along the ground and a thin heat shell
export class Shock {
  constructor(scene) {
    this.list = [];
    const ringGeo = new THREE.RingGeometry(0.5, 1, 64, 2).rotateX(-Math.PI / 2);
    const shellGeo = new THREE.SphereGeometry(1, 32, 16);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uK: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uK; varying vec2 vUv;
          void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.5, 0.92, r) * (1.0 - smoothstep(0.94, 1.0, r));
            a *= a * (1.0 - uK) * (1.0 - uK);
            gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * a * 0.6, a * 0.2); }`,
      }));
      const shell = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uK: { value: 0 } },
        vertexShader: 'varying vec3 vN, vV; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: `uniform float uK; varying vec3 vN, vV;
          void main(){ float f = 1.0 - abs(dot(normalize(vN), vV)); float a = pow(f, 3.0) * (1.0 - uK) * (1.0 - uK);
            gl_FragColor = vec4(vec3(1.0, 0.85, 0.65) * a * 1.4, a * 0.5); }`,
      }));
      ring.visible = shell.visible = false;
      ring.renderOrder = shell.renderOrder = 8;
      ring.frustumCulled = shell.frustumCulled = false;
      scene.add(ring, shell);
      this.list.push({ ring, shell, t: 1, power: 1 });
    }
    this.i = 0;
  }
  spawn(pos, groundY, power) {
    const s = this.list[this.i++ % this.list.length];
    s.t = 0; s.power = power;
    s.ring.position.set(pos.x, groundY + 0.15, pos.z);
    s.shell.position.copy(pos);
    s.ring.visible = pos.y - groundY < 6;
    s.shell.visible = true;
  }
  update(dt) {
    for (const s of this.list) {
      if (s.t >= 1) continue;
      s.t = Math.min(1, s.t + dt / 0.55);
      const k = s.t;
      s.ring.scale.setScalar(1 + k ** 0.6 * 10 * s.power);
      s.ring.material.uniforms.uK.value = k;
      const ks = Math.min(1, k * 2.2);
      s.shell.scale.setScalar(0.5 + ks ** 0.5 * 7 * s.power);
      s.shell.material.uniforms.uK.value = ks;
      if (k >= 1) s.ring.visible = false;
      if (ks >= 1) s.shell.visible = false;
    }
  }
}

// burnt patches left on the ground
export class Scorch {
  constructor(scene, n = 8) {
    this.list = [];
    const geo = new THREE.PlaneGeometry(1, 1, 8, 8).rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        uniforms: { uK: { value: 1 }, uSeed: { value: Math.random() * 10 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uK, uSeed; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          void main(){
            vec2 d = vUv - 0.5; float r = length(d) * 2.0; float ang = atan(d.y, d.x);
            float n = vn(d * 9.0) * 0.5 + vn(d * 23.0) * 0.3 + vn(vec2(ang * 3.0, r * 2.0)) * 0.4;
            // ragged edge, streaks thrown outwards
            float a = 1.0 - smoothstep(0.35 + n * 0.45, 0.6 + n * 0.45, r);
            a *= 0.92 * uK;
            gl_FragColor = vec4(vec3(0.015, 0.013, 0.012) * (0.6 + n * 0.6), a);
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.list.push({ m, t: 0 });
    }
    this.i = 0;
  }
  // tilted to the ground under it, sampled with groundAt
  spawn(pos, size, groundAt) {
    const s = this.list[this.i++ % this.list.length];
    const y = groundAt(pos.x, pos.z), e = 1;
    const nx = groundAt(pos.x - e, pos.z) - groundAt(pos.x + e, pos.z), nz = groundAt(pos.x, pos.z - e) - groundAt(pos.x, pos.z + e);
    const n = new THREE.Vector3(nx, 2 * e, nz).normalize();
    s.m.position.set(pos.x, y + 0.04, pos.z);
    s.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28));
    s.m.scale.setScalar(size);
    s.m.visible = true;
    s.t = 0;
  }
  update(dt) {
    for (const s of this.list) {
      if (!s.m.visible) continue;
      s.t += dt;
      s.m.material.uniforms.uK.value = Math.min(1, s.t * 6) * (1 - THREE.MathUtils.smoothstep(s.t, 40, 60));
      if (s.t > 60) s.m.visible = false;
    }
  }
}
