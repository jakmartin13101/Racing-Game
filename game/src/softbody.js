import * as THREE from 'three';

// Soft-body crumple for a truck: a coarse lattice of nodes around the body (free-form deformation). A hit pushes
// the nodes near it in, deepest where the truck is soft (the nose and the bed crumple, the cab's cage holds better),
// buckles the panels around it outwards, and kicks the whole frame so it shudders and wobbles before it settles.
// Big side hits bow the whole chassis. The vertex shader of every material on the truck (paint, glass, lamps,
// the engine) reads the lattice from a small 3D texture and moves each vertex and its normal with it, so the
// whole model crumples together at almost no cost on the CPU; Damage.dent() adds the fine crinkles on top.

const NX = 5, NY = 5, NZ = 11;
const K = 340, C = 7.5; // elastic wobble: about 3 Hz, settles in about a second

const ONE = new THREE.Vector3(1, 1, 1);
function hash(a, b) { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }

export class Lattice {
  constructor(box) {
    this.min = box.min.clone().addScalar(-0.06);
    this.max = box.max.clone().addScalar(0.06);
    this.size = this.max.clone().sub(this.min);
    this.half = this.size.clone().multiplyScalar(0.5);
    this.centre = this.min.clone().add(this.half);
    const n = NX * NY * NZ;
    this.n = n;
    this.rest = new Float32Array(n * 3);
    this.target = new Float32Array(n * 3); // plastic (permanent) set, where the crumple is heading
    this.plastic = new Float32Array(n * 3); // plastic shown, easing towards the target so a crumple takes a moment
    this.elastic = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.stiff = new Float32Array(n);
    for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const i = this.idx(x, y, z);
      const px = this.min.x + this.size.x * x / (NX - 1), py = this.min.y + this.size.y * y / (NY - 1), pz = this.min.z + this.size.z * z / (NZ - 1);
      this.rest[i * 3] = px; this.rest[i * 3 + 1] = py; this.rest[i * 3 + 2] = pz;
      // how far this part of the truck gives: a soft nose and bed, a stiffer cab with its roll cage
      const zn = (pz - this.centre.z) / this.half.z;
      const yn = (py - this.min.y) / this.size.y;
      let s = zn > 0.36 ? 1 : zn < -0.4 ? 0.85 : 0.5;
      if (zn <= 0.36 && zn >= -0.4 && yn > 0.7) s = 0.62;
      this.stiff[i] = s;
    }
    const data = new Uint16Array(n * 4);
    this.data = data;
    this.tex = new THREE.Data3DTexture(data, NX, NY, NZ);
    this.tex.format = THREE.RGBAFormat;
    this.tex.type = THREE.HalfFloatType;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = this.tex.wrapR = THREE.ClampToEdgeWrapping;
    this.tex.unpackAlignment = 1;
    this.tex.needsUpdate = true;
    this.uniforms = {
      uLat: { value: this.tex },
      uLatMin: { value: this.min.clone() },
      uLatInv: { value: new THREE.Vector3(1 / this.size.x, 1 / this.size.y, 1 / this.size.z) },
      uLatN: { value: new THREE.Vector3(NX, NY, NZ) },
      // world to the truck's own frame, so meshes posed on hinges, spinning pulleys and the shaking engine all
      // read the lattice where they are on the truck
      uLatFrame: { value: new THREE.Matrix4() },
    };
    this.active = false;
    this.mats = new Map();
    this.seed = Math.random() * 100;
  }

  idx(x, y, z) { return (z * NY + y) * NX + x; }

  setFrame(pos, quat) { this.uniforms.uLatFrame.value.compose(pos, quat, ONE).invert(); }

  // Crumple from a hit. p: the surface point that was hit and dir: the way out of the truck towards whatever hit
  // it, both in the truck's own frame; dv: the hit as a change of speed in m/s.
  impact(p, dir, dv) {
    const s = Math.min(1.5, Math.max(0, (dv - 2.2) / 17));
    if (s <= 0) return 0;
    this.seed += 1.37;
    const depth = 0.62 * s ** 1.15;
    const r = 0.75 + 0.95 * Math.min(1.2, s);
    const kick = 2.4 + 5 * s;
    const R = this.rest, T = this.target, V = this.vel;
    let moved = 0;
    for (let i = 0; i < this.n; i++) {
      const dx = R[i * 3] - p.x, dy = R[i * 3 + 1] - p.y, dz = R[i * 3 + 2] - p.z;
      // the crumple runs deeper along the line of the hit than it spreads across the panel
      const along = -(dx * dir.x + dy * dir.y + dz * dir.z);
      const px = dx + dir.x * along, py = dy + dir.y * along, pz = dz + dir.z * along;
      const across = Math.hypot(px, py, pz);
      const d = Math.hypot(across, Math.max(0, along) * 0.62);
      if (d >= r) continue;
      const w = (1 - d / r) ** 2;
      const a = depth * w * this.stiff[i] * (0.65 + 0.7 * hash(i, this.seed));
      T[i * 3] -= dir.x * a; T[i * 3 + 1] -= dir.y * a; T[i * 3 + 2] -= dir.z * a;
      // metal pushed in has to go somewhere: the panels around the hit buckle outwards
      if (across > 1e-3) {
        const b = a * (0.22 + 0.25 * hash(i + 31, this.seed)) / across;
        T[i * 3] += px * b; T[i * 3 + 1] += py * b * 1.3; T[i * 3 + 2] += pz * b;
      }
      V[i * 3] -= dir.x * a * kick; V[i * 3 + 1] -= dir.y * a * kick; V[i * 3 + 2] -= dir.z * a * kick;
      moved += a;
    }
    // a big hit bows the whole frame: a side hit bananas it, a nose or tail hit kinks it up in the middle
    if (s > 0.4) {
      const k = (s - 0.4);
      const side = Math.abs(dir.x) > 0.6, end = Math.abs(dir.z) > 0.6;
      for (let i = 0; i < this.n; i++) {
        const zn = (R[i * 3 + 2] - this.centre.z) / this.half.z;
        const bow = 1 - zn * zn;
        if (side) T[i * 3] -= Math.sign(dir.x) * 0.16 * k * bow * (Math.abs(p.z - R[i * 3 + 2]) < 1.5 ? 1 : 0.6);
        if (end) T[i * 3 + 1] += 0.11 * k * bow;
      }
    }
    // the whole truck shudders with the blow
    for (let i = 0; i < this.n; i++) {
      V[i * 3] -= dir.x * s * 0.5; V[i * 3 + 1] -= dir.y * s * 0.5; V[i * 3 + 2] -= dir.z * s * 0.5;
      // and twists a little about the line of the hit
      const ry = R[i * 3 + 1] - this.centre.y;
      V[i * 3] += (hash(this.seed, 3) - 0.5) * s * ry * 0.9;
    }
    this.smooth(0.22);
    this.clamp();
    this.active = true;
    return moved;
  }

  // a blast inside the truck (the fuel tank going up): everything near it bulges outwards, the roof lifts
  blast(p, power) {
    const R = this.rest, T = this.target, V = this.vel;
    const r = 2.6;
    this.seed += 2.1;
    for (let i = 0; i < this.n; i++) {
      const dx = R[i * 3] - p.x, dy = R[i * 3 + 1] - p.y, dz = R[i * 3 + 2] - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= r || d < 1e-3) continue;
      const w = (1 - d / r) ** 1.5;
      const a = 0.32 * power * w * (0.6 + 0.8 * hash(i, this.seed)) / d;
      T[i * 3] += dx * a; T[i * 3 + 1] += dy * a * 1.4 + 0.05 * power * w; T[i * 3 + 2] += dz * a;
      V[i * 3] += dx * a * 9; V[i * 3 + 1] += dy * a * 9; V[i * 3 + 2] += dz * a * 9;
    }
    this.smooth(0.2);
    this.clamp();
    this.active = true;
  }

  // relax sharp spikes between neighbouring nodes
  smooth(k) {
    const T = this.target, tmp = new Float32Array(T);
    for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const i = this.idx(x, y, z);
      let n = 0, ax = 0, ay = 0, az = 0;
      for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const X = x + ox, Y = y + oy, Z = z + oz;
        if (X < 0 || Y < 0 || Z < 0 || X >= NX || Y >= NY || Z >= NZ) continue;
        const j = this.idx(X, Y, Z);
        ax += tmp[j * 3]; ay += tmp[j * 3 + 1]; az += tmp[j * 3 + 2]; n++;
      }
      T[i * 3] += (ax / n - tmp[i * 3]) * k; T[i * 3 + 1] += (ay / n - tmp[i * 3 + 1]) * k; T[i * 3 + 2] += (az / n - tmp[i * 3 + 2]) * k;
    }
  }

  // a node never folds past the middle of the truck
  clamp() {
    const T = this.target, h = this.half;
    const lx = h.x * 0.42, ly = h.y * 0.42, lz = h.z * 0.3;
    for (let i = 0; i < this.n; i++) {
      T[i * 3] = Math.max(-lx, Math.min(lx, T[i * 3]));
      T[i * 3 + 1] = Math.max(-ly, Math.min(ly, T[i * 3 + 1]));
      T[i * 3 + 2] = Math.max(-lz, Math.min(lz, T[i * 3 + 2]));
    }
  }

  update(dt) {
    if (!this.active || dt <= 0) return;
    const P = this.plastic, T = this.target, E = this.elastic, V = this.vel, D = this.data;
    const ease = Math.min(1, dt * 22);
    let energy = 0;
    const h = Math.min(dt, 1 / 30), steps = Math.ceil(dt / h);
    for (let i = 0; i < this.n * 3; i++) {
      P[i] += (T[i] - P[i]) * ease;
      for (let s = 0; s < steps; s++) {
        V[i] += (-K * E[i] - C * V[i]) * (dt / steps);
        E[i] += V[i] * (dt / steps);
      }
      energy += Math.abs(E[i]) + Math.abs(V[i]) * 0.05 + Math.abs(T[i] - P[i]);
    }
    for (let i = 0; i < this.n; i++) {
      D[i * 4] = THREE.DataUtils.toHalfFloat(P[i * 3] + E[i * 3]);
      D[i * 4 + 1] = THREE.DataUtils.toHalfFloat(P[i * 3 + 1] + E[i * 3 + 1]);
      D[i * 4 + 2] = THREE.DataUtils.toHalfFloat(P[i * 3 + 2] + E[i * 3 + 2]);
    }
    this.tex.needsUpdate = true;
    if (energy < 1e-3 * this.n) {
      E.fill(0); V.fill(0); P.set(T);
      this.active = false;
    }
  }

  // the displacement at a point in the truck's frame, as the shader works it out (plastic only, for baking)
  sample(x, y, z, out) {
    const fx = THREE.MathUtils.clamp((x - this.min.x) / this.size.x, 0, 1) * (NX - 1);
    const fy = THREE.MathUtils.clamp((y - this.min.y) / this.size.y, 0, 1) * (NY - 1);
    const fz = THREE.MathUtils.clamp((z - this.min.z) / this.size.z, 0, 1) * (NZ - 1);
    const x0 = Math.min(NX - 2, Math.floor(fx)), y0 = Math.min(NY - 2, Math.floor(fy)), z0 = Math.min(NZ - 2, Math.floor(fz));
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    out.set(0, 0, 0);
    const P = this.target;
    for (let c = 0; c < 8; c++) {
      const ox = c & 1, oy = (c >> 1) & 1, oz = (c >> 2) & 1;
      const w = (ox ? tx : 1 - tx) * (oy ? ty : 1 - ty) * (oz ? tz : 1 - tz);
      const i = this.idx(x0 + ox, y0 + oy, z0 + oz);
      out.x += P[i * 3] * w; out.y += P[i * 3 + 1] * w; out.z += P[i * 3 + 2] * w;
    }
    return out;
  }

  // copy a geometry with the crumple baked into its vertices (for a panel that breaks off and flies away);
  // matrix: the mesh's place on the truck
  bake(geo, matrix) {
    const g = geo.clone();
    const pa = g.attributes.position.array, o = new THREE.Vector3(), p = new THREE.Vector3();
    const inv = new THREE.Matrix4().copy(matrix).invert();
    for (let i = 0; i < pa.length; i += 3) {
      p.set(pa[i], pa[i + 1], pa[i + 2]).applyMatrix4(matrix);
      p.add(this.sample(p.x, p.y, p.z, o)).applyMatrix4(inv);
      pa[i] = p.x; pa[i + 1] = p.y; pa[i + 2] = p.z;
    }
    g.attributes.position.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }

  // this truck's copy of a material, its vertex shader patched to follow the lattice
  material(base) {
    if (!base) return base;
    if (this.mats.has(base)) return this.mats.get(base);
    const m = base.clone();
    const prev = base.onBeforeCompile;
    const normals = !base.isMeshDepthMaterial;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(base, sh, r);
      latticeShader(sh, this.uniforms, normals);
    };
    const key = base.customProgramCacheKey?.() || '';
    m.customProgramCacheKey = () => `${key}-lattice`;
    m.userData.base = base;
    this.mats.set(base, m);
    return m;
  }

  depthMaterial() {
    if (!this.depth) this.depth = this.material(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
    return this.depth;
  }
}

export function latticeShader(sh, uniforms, normals = true) {
  Object.assign(sh.uniforms, uniforms);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
uniform highp sampler3D uLat; uniform vec3 uLatMin, uLatInv, uLatN; uniform mat4 uLatFrame;
vec3 latD(vec3 p) { vec3 t = clamp((p - uLatMin) * uLatInv, 0.0, 1.0); return texture(uLat, (0.5 + t * (uLatN - 1.0)) / uLatN).xyz; }`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  mat4 lf = uLatFrame * modelMatrix;
  transformed += transpose(mat3(lf)) * latD((lf * vec4(position, 1.0)).xyz);
}`);
  if (normals) {
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
{
  const float e = 0.06;
  mat4 lf = uLatFrame * modelMatrix;
  mat3 lr = mat3(lf);
  vec3 lp = (lf * vec4(position, 1.0)).xyz;
  vec3 l0 = latD(lp);
  mat3 J = mat3(1.0) + mat3((latD(lp + vec3(e, 0.0, 0.0)) - l0) / e, (latD(lp + vec3(0.0, e, 0.0)) - l0) / e, (latD(lp + vec3(0.0, 0.0, e)) - l0) / e);
  objectNormal = normalize(transpose(lr) * (transpose(inverse(J)) * (lr * objectNormal)));
}`);
  }
}
