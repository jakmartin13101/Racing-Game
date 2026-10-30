import * as THREE from 'three';

// Lightning: forked bolts from the cloud base to the ground, out where the camera can see them, each strike
// a few quick flickers that light up the clouds, the ground and the trucks, then thunder after the delay the
// distance gives (sound travels about 343 m/s).

const FLICKER = [[0, 1], [0.05, 0.15], [0.09, 0.85], [0.16, 0.25], [0.22, 0.6], [0.34, 0.1], [0.5, 0]];

function boltSegments(rnd, a, b, rough, out, depth = 0) {
  // midpoint displacement, sideways to the bolt, with branches peeling off
  let pts = [a.clone(), b.clone()];
  let off = a.distanceTo(b) * rough;
  for (let k = 0; k < 7; k++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const m = p.clone().lerp(q, 0.5);
      m.x += (rnd() - 0.5) * off; m.z += (rnd() - 0.5) * off; m.y += (rnd() - 0.5) * off * 0.3;
      next.push(m, q);
    }
    pts = next;
    off *= 0.5;
  }
  const w = depth === 0 ? 1 : 0.45 / depth;
  for (let i = 0; i < pts.length - 1; i++) {
    out.push([pts[i], pts[i + 1], w]);
    if (depth < 2 && rnd() < (depth === 0 ? 0.06 : 0.03) && i < pts.length * 0.8) {
      const dir = pts[i + 1].clone().sub(pts[i]).normalize();
      const len = a.distanceTo(b) * (0.15 + rnd() * 0.25) / (depth + 1);
      const end = pts[i].clone().add(new THREE.Vector3(dir.x + (rnd() - 0.5) * 1.6, -Math.abs(dir.y) - 0.3, dir.z + (rnd() - 0.5) * 1.6).normalize().multiplyScalar(len));
      boltSegments(rnd, pts[i], end, rough * 1.1, out, depth + 1);
    }
  }
}

export class Lightning {
  constructor(scene) {
    this.max = 900;
    const geo = new THREE.BufferGeometry();
    this.a = new Float32Array(this.max * 4 * 3); this.b = new Float32Array(this.max * 4 * 3); this.s = new Float32Array(this.max * 4 * 3);
    const idx = [];
    for (let i = 0; i < this.max; i++) { const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    geo.setIndex(idx);
    // position is unused by the shader but sizes the draw
    geo.setAttribute('position', new THREE.BufferAttribute(this.a, 3));
    geo.setAttribute('pa', new THREE.BufferAttribute(this.a, 3));
    geo.setAttribute('pq', new THREE.BufferAttribute(this.b, 3));
    geo.setAttribute('side', new THREE.BufferAttribute(this.s, 3));
    this.geo = geo;
    this.uniforms = { uK: { value: 0 } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec3 pa, pq, side; varying float vE; varying float vB;
        void main() {
          vec4 va = viewMatrix * vec4(pa, 1.0), vb = viewMatrix * vec4(pq, 1.0);
          vec4 v = side.y > 0.5 ? vb : va;
          vec2 d = normalize(vb.xy / -vb.z - va.xy / -va.z + 1e-6);
          // a few metres wide, so it still reads as a bright line a kilometre out
          v.xy += vec2(-d.y, d.x) * side.x * (1.0 + -v.z * 0.0025);
          vE = sign(side.x); vB = side.z;
          gl_Position = projectionMatrix * v;
        }`,
      fragmentShader: /* glsl */`
        uniform float uK; varying float vE; varying float vB;
        void main() {
          float core = 1.0 - abs(vE);
          gl_FragColor = vec4(vec3(4.0, 4.5, 6.0) * uK * vB * (0.35 + 0.65 * smoothstep(0.0, 1.0, core + 0.3)), 1.0);
        }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.flash = 0;
    this.strike = null;
    this.next = 4;
    this.thunders = [];
    this.dir = new THREE.Vector3(0, 1, 0);
  }

  build(segs) {
    let n = 0;
    for (const [p, q, w] of segs) {
      if (n >= this.max) break;
      const o = n * 4;
      // side: (edge, -1 or 1, times the half width; 0 at p, 1 at q; brightness)
      const ww = 1.6 * w + 0.5;
      for (let k = 0; k < 4; k++) {
        this.a.set([p.x, p.y, p.z], (o + k) * 3);
        this.b.set([q.x, q.y, q.z], (o + k) * 3);
        this.s.set([(k % 2 ? 1 : -1) * ww, k >= 2 ? 1 : 0, Math.min(1, w)], (o + k) * 3);
      }
      n++;
    }
    for (let i = n; i < this.max; i++) for (let k = 0; k < 4; k++) this.s.set([0, 0, 0], (i * 4 + k) * 3);
    for (const k of ['pa', 'pq', 'side', 'position']) this.geo.attributes[k].needsUpdate = true;
  }

  // rate: strikes per minute; returns the flash brightness 0..1 for lighting
  update(dt, t, cam, fwd, rate, heightAt, events) {
    if (rate > 0) this.next -= dt;
    if (rate > 0 && this.next <= 0 && !this.strike) {
      this.next = -Math.log(1 - Math.random()) * 60 / rate + 1.5;
      const ang = Math.atan2(fwd.z, fwd.x) + (Math.random() - 0.5) * 2.4;
      const dist = 260 + Math.random() * 1500;
      const gx = cam.x + Math.cos(ang) * dist, gz = cam.z + Math.sin(ang) * dist;
      const gy = heightAt ? heightAt(gx, gz) : 0;
      const top = new THREE.Vector3(gx + (Math.random() - 0.5) * 300, Math.max(cam.y, gy) + 650 + Math.random() * 250, gz + (Math.random() - 0.5) * 300);
      const segs = [];
      const rnd = Math.random;
      boltSegments(rnd, top, new THREE.Vector3(gx, gy, gz), 0.22, segs);
      this.build(segs);
      // a cloud flash alone (no visible bolt) about a third of the time
      this.mesh.visible = Math.random() > 0.3;
      this.strike = { t: 0, dist, power: 0.6 + Math.random() * 0.4 };
      this.dir.set(gx - cam.x, top.y - cam.y, gz - cam.z).normalize();
      this.thunders.push({ at: t + dist / 343, k: Math.min(1, 400 / dist) * this.strike.power });
      events?.({ type: 'lightning', x: gx, y: gy, z: gz, dist });
    }
    this.flash = 0;
    if (this.strike) {
      const s = this.strike;
      s.t += dt;
      let k = 0;
      for (let i = 0; i < FLICKER.length - 1; i++) if (s.t >= FLICKER[i][0] && s.t < FLICKER[i + 1][0]) k = FLICKER[i][1];
      this.flash = k * s.power * Math.min(1, 700 / s.dist + 0.25);
      this.uniforms.uK.value = k * s.power;
      if (s.t > FLICKER[FLICKER.length - 1][0]) { this.strike = null; this.mesh.visible = false; }
    }
    for (let i = this.thunders.length - 1; i >= 0; i--) {
      if (t >= this.thunders[i].at) { events?.({ type: 'thunder', k: this.thunders[i].k }); this.thunders.splice(i, 1); }
    }
    return this.flash;
  }
}
