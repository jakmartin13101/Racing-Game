import * as THREE from 'three';
import { Puffs } from './fx.js';
import { mulberry, nearTrack } from './world.js';

// The living world around the tracks, on every track: steam vents hissing on the cone, smoke and spatter off the
// lava rivers and the lake, birds wheeling over the plain, and dry grass, shrubs and trees moving in the wind.
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// one clock for everything that sways; patchWind() makes a material's vertices bend with it, more the higher up
// the model they are (instanced props: each instance gets its own phase from where it stands)
export const wind = { uTime: { value: 0 } };
export function patchWind(mat, amount = 0.06) {
  if (mat.userData.wind) return;
  mat.userData.wind = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uWind = wind.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
#ifdef USE_INSTANCING
  vec2 wp = instanceMatrix[3].xz;
#else
  vec2 wp = vec2(0.0);
#endif
  float h = max(transformed.y, 0.0);
  float ph = dot(wp, vec2(0.13, 0.21));
  float gust = 0.6 + 0.4 * sin(uWind * 0.37 + wp.x * 0.004);
  transformed.x += (sin(uWind * 1.9 + ph) * 0.7 + sin(uWind * 3.7 + ph * 1.7) * 0.3) * h * h * ${amount.toFixed(3)} * gust;
  transformed.z += sin(uWind * 1.5 + ph * 1.3) * h * h * ${(amount * 0.6).toFixed(3)} * gust;
}`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + `-wind${amount}`;
  mat.needsUpdate = true;
}

// a clump of dry grass blades, drawn on a canvas: colour on an opaque ground of the same straw (so the mipmaps
// don't bleed black into the blades), and the blade shapes again, white on black, as the alpha map
function grassTextures() {
  const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; return cv; };
  const cv = mk(), av = mk();
  const g = cv.getContext('2d'), ga = av.getContext('2d');
  g.fillStyle = 'rgb(120,104,70)'; g.fillRect(0, 0, 128, 128);
  ga.fillStyle = '#000'; ga.fillRect(0, 0, 128, 128);
  const r = mulberry(51);
  for (let k = 0; k < 46; k++) {
    const x0 = 20 + r() * 88, lean = (r() - 0.5) * 50, h = 60 + r() * 66, w = 2 + r() * 3;
    const c = 0.55 + r() * 0.45;
    const grd = g.createLinearGradient(0, 128, 0, 128 - h);
    grd.addColorStop(0, `rgb(${70 * c | 0},${60 * c | 0},${38 * c | 0})`);
    grd.addColorStop(1, `rgb(${210 * c | 0},${190 * c | 0},${120 * c | 0})`);
    for (const [ctx, fill] of [[g, grd], [ga, '#fff']]) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x0 - w, 128); ctx.quadraticCurveTo(x0 + lean * 0.3, 128 - h * 0.6, x0 + lean, 128 - h);
      ctx.quadraticCurveTo(x0 + lean * 0.3 + w * 0.4, 128 - h * 0.6, x0 + w, 128);
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return { map: t, alpha: new THREE.CanvasTexture(av) };
}

function tuftGeometry() {
  // three crossed quads, 1 m wide and 1 m tall, standing on y = 0
  const g = new THREE.BufferGeometry();
  const p = [], uv = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5, o = p.length / 3;
    p.push(-c, 0, -s, c, 0, s, c, 1, s, -c, 1, -s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // blades catch the light from above rather than from their flat faces
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 0.95, n.getZ(i) * 0.3);
  return g;
}

// a bird: body and two wings that beat (vertex shader), a dark silhouette against the sky
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const p = [0, 0, 0.5, 0, 0, -0.45, 0.12, 0, 0, // body sliver
    0, 0, 0.18, 0, 0, -0.2, 1.1, 0.05, -0.15, // right wing
    0, 0, 0.18, -1.1, 0.05, -0.15, 0, 0, -0.2]; // left wing
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

export class Ambient {
  constructor({ scene, world, M, quality, tracks, sun }) {
    this.world = world;
    const lite = !!quality.aiLod;
    this.lite = lite;
    this.rnd = mulberry(8080);
    const rnd = this.rnd;
    this.group = new THREE.Group();
    scene.add(this.group);
    // own particle pools, so a big crash never starves the scenery (and the other way round)
    this.steam = new Puffs(M, lite ? 260 : 700, 'smoke');
    this.steam.mat.uniforms.uSun.value.copy(sun);
    this.glow = new Puffs(M, lite ? 120 : 320, 'spark');
    this.ember = new Puffs(M, lite ? 80 : 200, 'fire');
    this.group.add(this.steam.mesh, this.glow.mesh, this.ember.mesh);

    // steam vents: fumaroles on the cone, a few tens of metres off the roads, where the ground is not too steep
    this.vents = [];
    const cone = tracks.filter((t) => t.id !== 'village');
    for (let k = 0; this.vents.length < 26 && k < 600; k++) {
      const t = cone[Math.floor(rnd() * cone.length)], i = Math.floor(rnd() * t.n), f = t.frame(i);
      const lat = (rnd() < 0.5 ? -1 : 1) * (t.width / 2 + 14 + rnd() * 60);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      if (Math.hypot(x, z) > 720 || nearTrack(world, x, z, 12) || this.vents.some((v) => Math.hypot(v.x - x, v.z - z) < 90)) continue;
      world.normalAt(x, z, tmp);
      if (tmp.y < 0.85) continue;
      this.vents.push({ x, z, y: world.heightAt(x, z), rate: 2 + rnd() * 3, acc: 0, size: 1.5 + rnd() * 2.5 });
    }
    // fumarole crusts: pale yellow sulphur stains round each vent
    const stain = new THREE.MeshBasicMaterial({ map: sulphurTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    for (const v of this.vents) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), stain);
      m.scale.setScalar(6 + v.size * 2); m.position.set(v.x, v.y + 0.15, v.z); m.rotation.y = rnd() * 6;
      this.group.add(m);
    }

    // points along the lava rivers, for their smoke and spatter
    this.riverPts = [];
    for (const rv of world.data.rivers) rv.points.forEach((p, i) => this.riverPts.push({ x: p[0], y: p[1], z: p[2], w: rv.width[i] / 2, n: rv.points[Math.min(i + 1, rv.points.length - 1)] }));
    this.lake = world.data.lake;
    this.crater = world.data.crater;

    // dry grass on the ash plain and the lower flanks, thinning out up the cone
    const NG = { low: 9000, medium: 22000, high: 40000, ultra: 64000 }[quality.name] ?? (lite ? 9000 : 22000);
    const gt = grassTextures();
    const gmat = new THREE.MeshStandardMaterial({ map: gt.map, alphaMap: gt.alpha, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 });
    gmat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = wind.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec2 wp = instanceMatrix[3].xz;
float ph = dot(wp, vec2(0.11, 0.07));
float gust = 0.55 + 0.45 * sin(uWind * 0.5 - wp.x * 0.01 - wp.y * 0.006);
float bend = uv.y * uv.y * gust;
transformed.x += (sin(uWind * 2.3 + ph) * 0.18 + 0.12) * bend;
transformed.z += sin(uWind * 1.7 + ph * 1.4) * 0.1 * bend;`);
      // lit like the ground they grow from, whichever face of the blades is towards the camera
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
    };
    gmat.customProgramCacheKey = () => 'grass-tuft';
    const grass = new THREE.InstancedMesh(tuftGeometry(), gmat, NG);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
    let gi = 0;
    // mostly in clumps along the tracks, where they are seen; the rest scattered over the plain
    const near = tracks.filter((t) => t.n > 0);
    for (let k = 0; gi < NG && k < NG * 6; k++) {
      let cx, cz;
      if (rnd() < 0.75) {
        const t = near[Math.floor(rnd() * near.length)], f = t.frame(Math.floor(rnd() * t.n));
        const lat = (rnd() < 0.5 ? -1 : 1) * (t.width / 2 + 4 + Math.pow(rnd(), 2.2) * 110);
        cx = f.x + f.nx * lat; cz = f.z + f.nz * lat;
      } else {
        const a = rnd() * Math.PI * 2, r = 420 + Math.pow(rnd(), 0.8) * 1000;
        cx = Math.cos(a) * r; cz = Math.sin(a) * r;
      }
      // none up on the bare cone, thickening down onto the plain
      const dens = THREE.MathUtils.smoothstep(Math.hypot(cx, cz), 400, 650);
      if (rnd() > dens) continue;
      for (let j = 0; j < 18 && gi < NG; j++) {
        const x = cx + (rnd() - 0.5) * 14, z = cz + (rnd() - 0.5) * 14;
        if (nearTrack(world, x, z, 8.5)) continue;
        world.normalAt(x, z, tmp);
        if (tmp.y < 0.88) continue;
        const s = 0.7 + rnd() * 0.9;
        q.setFromAxisAngle(tmp2.set(0, 1, 0), rnd() * 6.3);
        sc.set(s * (0.9 + rnd() * 0.6), s * (0.6 + rnd() * 0.6), s);
        m4.compose(tmp.set(x, world.heightAt(x, z) - 0.05, z), q, sc);
        grass.setMatrixAt(gi, m4);
        col.setHSL(0.1 + rnd() * 0.04, 0.25 + rnd() * 0.2, 0.42 + rnd() * 0.25);
        grass.setColorAt(gi, col);
        gi++;
      }
    }
    grass.count = gi;
    grass.receiveShadow = true;
    grass.computeBoundingSphere();
    this.group.add(grass);
    this.grass = grass;

    // birds: a few loose flocks circling over the plain and the village, black against the sky
    const NB = lite ? 18 : 40;
    const bmat = new THREE.MeshBasicMaterial({ color: 0x15120f, side: THREE.DoubleSide });
    bmat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = wind.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float ph = float(gl_InstanceID) * 1.37;
float flap = sin(uWind * (7.0 + mod(ph, 2.0)) + ph) * (0.5 + 0.5 * step(0.4, fract(uWind * 0.07 + ph * 0.1)));
transformed.y += abs(transformed.x) * flap * 0.9;`);
    };
    bmat.customProgramCacheKey = () => 'bird';
    this.birds = new THREE.InstancedMesh(birdGeometry(), bmat, NB);
    this.birds.frustumCulled = false;
    this.birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const vc = world.data.tracks.find((t) => t.villageCentre)?.villageCentre || [-700, 590];
    const flocks = [[vc[0], vc[1], 70], [700, -300, 110], [-200, 950, 90], [450, 800, 140]];
    this.flock = [];
    for (let i = 0; i < NB; i++) {
      const [fx, fz, alt] = flocks[i % flocks.length];
      this.flock.push({ cx: fx + (rnd() - 0.5) * 120, cz: fz + (rnd() - 0.5) * 120, r: 40 + rnd() * 90, alt: alt + rnd() * 50,
        w: (0.12 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.3, s: 0.9 + rnd() * 0.5, base: world.heightAt(fx, fz) });
    }
    this.group.add(this.birds);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sc = new THREE.Vector3(); this.e = new THREE.Euler();
    this.acc = { river: 0, spat: 0, lake: 0 };
  }

  update(time, dt, cam) {
    wind.uTime.value = time;
    const rnd = this.rnd, w = this.world;
    dt = Math.min(dt, 0.1);
    // vents within sight puff steam continuously, leaning downwind
    for (const v of this.vents) {
      const d = Math.hypot(v.x - cam.x, v.z - cam.z);
      if (d > 650) continue;
      v.acc += dt * v.rate * (d < 300 ? 1 : 0.5);
      while (v.acc > 1) {
        v.acc -= 1;
        const c = 0.78 + rnd() * 0.15;
        this.steam.emit(tmp.set(v.x + (rnd() - 0.5) * 2, v.y + 0.4, v.z + (rnd() - 0.5) * 2), tmp2.set(0.8 + rnd() * 0.6, 1.5 + rnd() * 2.2, 0.3 + (rnd() - 0.5)),
          v.size * (0.6 + rnd() * 0.6), time, 6 + rnd() * 4, c, c, c * 0.97);
      }
    }
    // the rivers smoke where they run near, and now and then throw up a gob of molten rock
    this.acc.river += dt * (this.lite ? 10 : 24);
    this.acc.spat += dt * (this.lite ? 2 : 5);
    let tries = 0;
    while ((this.acc.river > 1 || this.acc.spat > 1) && tries++ < 60) {
      const p = this.riverPts[Math.floor(rnd() * this.riverPts.length)];
      if (Math.hypot(p.x - cam.x, p.z - cam.z) > 420) continue;
      const lat = (rnd() - 0.5) * p.w * 1.4;
      const tx = p.n[0] - p.x, tz = p.n[2] - p.z, L = Math.hypot(tx, tz) || 1;
      const x = p.x - tz / L * lat, z = p.z + tx / L * lat;
      if (this.acc.river > 1) {
        this.acc.river -= 1;
        const c = 0.18 + rnd() * 0.22;
        this.steam.emit(tmp.set(x, p.y + 0.6, z), tmp2.set(tx / L * 1.5 + 0.6, 1.2 + rnd() * 2, tz / L * 1.5), 2 + rnd() * 3, time, 5 + rnd() * 4, c * 1.1, c, c * 0.95);
      } else {
        this.acc.spat -= 1;
        for (let k = 0; k < 7; k++) this.glow.emit(tmp.set(x, p.y + 0.3, z), tmp2.set((rnd() - 0.5) * 3, 3 + rnd() * 5, (rnd() - 0.5) * 3), 0.12 + rnd() * 0.12, time, 0.8 + rnd() * 0.6, 1, 0.8, 0.6);
        this.ember.emit(tmp.set(x, p.y + 0.5, z), tmp2.set(0, 1.2, 0), 1 + rnd(), time, 0.6);
      }
    }
    // the lake and the crater pool bubble and burst
    this.acc.lake += dt * 1.6;
    while (this.acc.lake > 1) {
      this.acc.lake -= 1;
      for (const L of [this.lake, this.crater]) {
        if (!L) continue;
        const a = rnd() * 6.3, r = Math.sqrt(rnd()) * (L.r - 6);
        const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
        if (Math.hypot(x - cam.x, z - cam.z) > 600) continue;
        const y = (L === this.lake ? L.y + 1 : L.y) + 0.3;
        for (let k = 0; k < 10; k++) this.glow.emit(tmp.set(x, y, z), tmp2.set((rnd() - 0.5) * 5, 4 + rnd() * 7, (rnd() - 0.5) * 5), 0.15 + rnd() * 0.2, time, 1 + rnd() * 0.6, 1, 0.75, 0.5);
        this.ember.emit(tmp.set(x, y + 0.4, z), tmp2.set(0, 1.5, 0), 2 + rnd() * 2, time, 0.8);
        const c = 0.22; this.steam.emit(tmp.set(x, y + 1, z), tmp2.set(0.5, 2.5, 0), 4 + rnd() * 3, time, 7, c, c * 0.95, c * 0.9);
      }
    }
    this.steam.update(time); this.glow.update(time); this.ember.update(time);
    // birds wheel round their flock centres, bobbing, banked into the turn
    const { m4, q, sc, e } = this;
    this.flock.forEach((b, i) => {
      const a = b.ph + time * b.w;
      const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r;
      const y = b.base + b.alt + Math.sin(time * 0.4 + b.ph * 3) * 6;
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w));
      e.set(0, yaw, -0.35 * Math.sign(b.w), 'YXZ');
      q.setFromEuler(e);
      sc.setScalar(b.s);
      m4.compose(tmp.set(x, y, z), q, sc);
      this.birds.setMatrixAt(i, m4);
    });
    this.birds.instanceMatrix.needsUpdate = true;
  }
}

function sulphurTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const r = mulberry(9);
  for (let k = 0; k < 90; k++) {
    const a = r() * 6.3, d = Math.pow(r(), 0.7) * 54, s = 6 + r() * 18;
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    const c = r() < 0.6 ? '214,190,92' : '235,232,214';
    grd.addColorStop(0, `rgba(${c},${0.35 * (1 - d / 64)})`); grd.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grd; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
