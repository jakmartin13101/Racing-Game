import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadPropModels } from './props.js';
import { mulberry, nearTrack } from './world.js';

// Volcano dressing along the cone tracks: scoria fields and cinder blocks, a burnt forest of charred snags,
// stumps and fallen logs round the lava, embers lifting off the flows, and ash flakes tumbling down (thickest on
// Eruption once the mountain blows). All instanced and kept off the roads: none of it collides.
const BASE = import.meta.env.BASE_URL;
const tmp = new THREE.Vector3(), N = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const COUNTS = {
  low: { rocks: 1600, snags: 70, logs: 16, embers: 300, ash: 500 },
  medium: { rocks: 3200, snags: 150, logs: 30, embers: 600, ash: 1000 },
  high: { rocks: 6000, snags: 260, logs: 50, embers: 1000, ash: 1800 },
  ultra: { rocks: 10000, snags: 420, logs: 80, embers: 1600, ash: 3000 },
};

// the masks.png the terrain shades with (r: lava heat, g: road, b: burn), read back so placement agrees with it
async function loadMask(extent) {
  const img = new Image();
  img.src = `${BASE}world/masks.png`;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
  return (x, z, c = 0) => {
    const i = Math.min(W - 1, Math.max(0, Math.floor((x / extent + 0.5) * W)));
    const j = Math.min(H - 1, Math.max(0, Math.floor((z / extent + 0.5) * H)));
    return d[(j * W + i) * 4 + c] / 255;
  };
}

// a lump of scoria: a lumpy, slightly flattened ball; or a cinder block: an angular broken slab
function lumpGeometry(seed, angular) {
  const g = angular ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, r = mulberry(seed);
  const k = [r() * 6, r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    tmp.fromBufferAttribute(p, i);
    const n = angular ? 1 + 0.12 * Math.sin(tmp.x * 4 + k[0]) * Math.sin(tmp.z * 3 + k[1])
      : 1 + 0.2 * Math.sin(tmp.x * 3.1 + k[0]) * Math.sin(tmp.y * 2.7 + k[1]) + 0.12 * Math.sin(tmp.z * 5.3 + k[2]) + 0.07 * Math.sin((tmp.x + tmp.y) * 9 + k[3]);
    tmp.multiplyScalar(n);
    tmp.y *= angular ? 0.55 : 0.78;
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  // hard facets on the blocks, soft on the lumps
  // (the dodecahedron comes unindexed, so its facets stay hard)
  g.computeVertexNormals();
  return g;
}

// a dead tree burnt to a snag: tapered, leaning trunk with a root flare, a broken top and a few branch stubs;
// stump = just the base, snapped off low
function snagGeometry(seed, stump) {
  const r = mulberry(seed);
  const h = stump ? 0.7 + r() * 0.9 : 4 + r() * 5;
  const r0 = 0.14 + r() * 0.14;
  const parts = [];
  const trunk = new THREE.CylinderGeometry(stump ? r0 * 0.9 : r0 * 0.3, r0, h, 8, stump ? 2 : 6).translate(0, h / 2, 0);
  const lean = (r() - 0.5) * 0.5, lz = (r() - 0.5) * 0.3, p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), u = y / h;
    // bend with height; the top edge snapped off ragged
    p.setX(i, p.getX(i) + lean * u * u * h * 0.25 + Math.sin(u * 7 + seed) * 0.04);
    p.setZ(i, p.getZ(i) + lz * u * u * h * 0.25);
    if (u > 0.99) p.setY(i, y - r() * (stump ? 0.35 : 0.6));
  }
  parts.push(trunk);
  parts.push(new THREE.CylinderGeometry(r0 * 0.9, r0 * 1.7, 0.45, 8, 1, true).translate(0, 0.2, 0));
  const nb = stump ? 0 : 2 + Math.floor(r() * 4);
  for (let b = 0; b < nb; b++) {
    const L = 0.6 + r() * 1.8, y = h * (0.4 + r() * 0.5), br = r0 * (0.35 - 0.2 * (y / h));
    const g = new THREE.CylinderGeometry(br * 0.35, br, L, 5, 1).translate(0, L / 2, 0);
    g.rotateZ(-(0.5 + r() * 0.7)).rotateY(r() * 6.3).translate(lean * (y / h) ** 2 * h * 0.25, y, lz * (y / h) ** 2 * h * 0.25);
    parts.push(g);
  }
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  geo.computeVertexNormals();
  return geo;
}

// shared GLSL for the dressing: where an instance stands on the lava-heat mask
const MASK_VS = /* glsl */`
uniform sampler2D tMask; uniform float uExtent;
varying vec3 vObj; varying vec3 vWp; varying vec3 vWn; varying float vHeat;`;
function maskVertex(sh) {
  return sh.vertexShader.replace('#include <common>', `#include <common>\n${MASK_VS}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vObj = position;
mat4 vM = modelMatrix;
#ifdef USE_INSTANCING
vM = modelMatrix * instanceMatrix;
#endif
vWp = (vM * vec4(transformed, 1.0)).xyz;
vWn = normalize(mat3(vM) * objectNormal);
vHeat = texture(tMask, vM[3].xz / uExtent + 0.5).r;`);
}

// charred wood: the bark map turned to charcoal, split into the alligator blocks of a burnt trunk; near the lava
// the cracks between the blocks still smoulder
function charMaterial(map, U, logs) {
  const m = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = maskVertex(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tMask, tNoise; uniform float uExtent, uTime;
varying vec3 vObj; varying vec3 vWp; varying vec3 vWn; varying float vHeat;
float cEm;`)
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
// blocks: rows around the trunk, staggered; on a log they run along it instead
vec2 q = ${logs ? 'vec2(vObj.x * 5.0, atan(vObj.z, vObj.y + 1e-4) * 1.4)' : 'vec2(atan(vObj.z, vObj.x + 1e-4) * 1.6, vObj.y * 4.0)'};
q.x += floor(q.y) * 0.5 + texture(tNoise, q * 0.05).r * 1.5;
vec2 f = abs(fract(q) - 0.5);
float crack = 1.0 - smoothstep(0.36, 0.46, max(f.x * 0.8, f.y));
float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
float n = texture(tNoise, q * 0.13 + vObj.xz).g;
// charcoal, with a silvery sheen of ash on the block faces
vec3 coal = vec3(0.05, 0.045, 0.04) * (0.6 + lum * 1.4);
coal = mix(coal, vec3(0.2, 0.19, 0.18), smoothstep(0.55, 0.75, n) * 0.6);
diffuseColor.rgb = mix(coal, vec3(0.01), crack * 0.85);
float hot = smoothstep(0.45, 0.85, vHeat);
float flick = 0.55 + 0.45 * sin(uTime * 3.1 + n * 30.0) * sin(uTime * 1.7 + vObj.y * 5.0);
cEm = crack * hot * flick * smoothstep(0.45, 0.6, n) * (${logs ? '1.0' : '1.0 - smoothstep(0.3, 2.5, vObj.y)'});`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.28, 0.04) * cEm * 2.5;');
  };
  m.customProgramCacheKey = () => `char-${logs}`;
  return m;
}

// scoria and cinder: the boulder material, tinted per instance; rock lying near the lava keeps glowing seams,
// rock that has lain cold for years grows lichen on its upper faces
function rockMaterial(base, U) {
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = maskVertex(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tMask, tNoise; uniform float uExtent, uTime;
varying vec3 vObj; varying vec3 vWp; varying vec3 vWn; varying float vHeat;
float rEm;`)
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
vec3 rn = texture(tNoise, vObj.xz * 0.6 + vObj.y * 0.3 + vWp.xz * 0.01).rgb;
// vesicles: dark pits all over the scoria
diffuseColor.rgb *= mix(1.0, 0.45, smoothstep(0.62, 0.7, texture(tNoise, vObj.xy * 2.3 + vObj.z).b));
float lichK = smoothstep(0.35, 0.8, vWn.y) * (1.0 - smoothstep(0.02, 0.15, vHeat)) * (1.0 - smoothstep(160.0, 280.0, vWp.y));
float lich = smoothstep(0.55, 0.62, rn.r + rn.g * 0.3 - 0.15) * lichK;
diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.34, 0.36, 0.28), vec3(0.45, 0.31, 0.12), step(0.68, rn.b)) * (0.7 + rn.g * 0.5), lich * 0.7);
float seamN = texture(tNoise, vObj.xz * 0.9 + vObj.y * 0.4).r;
rEm = (1.0 - smoothstep(0.0, 0.025, abs(seamN - 0.53))) * smoothstep(0.75, 0.95, vHeat) * (0.6 + 0.4 * sin(uTime * 1.2 + rn.g * 20.0));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * rEm * 2.0;');
  };
  m.customProgramCacheKey = () => 'volcano-rock';
  return m;
}

export class Volcano {
  constructor({ scene, world, M, quality, tracks, terrain, rockMat, renderer, sun }) {
    Object.assign(this, { scene, world, M, quality, tracks, rockMat, renderer, sun });
    this.U = terrain.userData.uniforms;
    this.C = COUNTS[quality.name] || COUNTS.medium;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rnd = mulberry(5150);
    this.density = null;
  }

  async load() {
    const { world, rnd, C, U } = this;
    this.mask = await loadMask(world.extent);
    const heatAt = (x, z) => this.mask(x, z, 0);
    const cone = this.tracks.filter((t) => t.id !== 'village');
    const vc = world.data.tracks.find((t) => t.villageCentre)?.villageCentre || [-700, 590];
    const clear = (x, z, r) => !nearTrack(world, x, z, r) && Math.hypot(x - vc[0], z - vc[1]) > 330 && heatAt(x, z) < 0.93;
    // lava points: the rivers, sampled every few metres, plus the rims of the lake and the crater pool
    this.lavaPts = [];
    for (const rv of world.data.rivers) rv.points.forEach((p, i) => this.lavaPts.push([p[0], p[1], p[2], rv.width[i] / 2]));
    for (const L of [world.data.lake, world.data.crater]) if (L) this.lavaPts.push([L.x, L.y, L.z, L.r]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color(), e = new THREE.Euler();

    // ------------------------------------------------- scoria fields and cinder blocks
    // in clumps by the cone roads (a few metres to ~80 m off), denser round the lava where fresh spatter fell
    const geos = [lumpGeometry(3, false), lumpGeometry(8, true)];
    const rmat = rockMaterial(this.rockMat || new THREE.MeshStandardMaterial({ color: 0x3a342f, roughness: 0.95 }), U);
    const rocks = geos.map((g) => new THREE.InstancedMesh(g, rmat, C.rocks));
    const ri = [0, 0];
    for (let k = 0; ri[0] + ri[1] < C.rocks && k < C.rocks; k++) {
      let cx, cz;
      if (rnd() < 0.3) {
        const p = this.lavaPts[Math.floor(rnd() * this.lavaPts.length)], a = rnd() * 6.3, d = p[3] + 4 + rnd() * 50;
        cx = p[0] + Math.cos(a) * d; cz = p[2] + Math.sin(a) * d;
      } else {
        const t = cone[Math.floor(rnd() * cone.length)], f = t.frame(Math.floor(rnd() * t.n));
        const lat = (rnd() < 0.5 ? -1 : 1) * (t.width / 2 + 5 + Math.pow(rnd(), 2.2) * 75);
        cx = f.x + f.nx * lat; cz = f.z + f.nz * lat;
      }
      if (Math.hypot(cx, cz) > 1100) continue;
      // a field: one kind dominates (red oxidised scoria, or black cinder), sizes mostly small with a few big ones
      const R = 3 + rnd() * 9, n = 15 + Math.floor(rnd() * 45), red = rnd() < 0.3, blocky = rnd() < 0.35;
      for (let j = 0; j < n && ri[0] + ri[1] < C.rocks; j++) {
        const a = rnd() * 6.3, d = Math.sqrt(rnd()) * R;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (!clear(x, z, 10.5)) continue;
        const s = 0.15 + Math.pow(rnd(), 2.6) * 1.4;
        const kind = rnd() < (blocky ? 0.7 : 0.15) ? 1 : 0;
        world.normalAt(x, z, N);
        q.setFromUnitVectors(UP, N);
        e.set((rnd() - 0.5) * 0.8, rnd() * 6.3, (rnd() - 0.5) * 0.8);
        q.multiply(q2.setFromEuler(e));
        sc.set(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.5));
        m4.compose(tmp.set(x, world.heightAt(x, z) - s * 0.25, z), q, sc);
        rocks[kind].setMatrixAt(ri[kind], m4);
        if (red) col.setRGB(0.75 + rnd() * 0.2, 0.4 + rnd() * 0.12, 0.28 + rnd() * 0.08);
        else { const v = 0.2 + rnd() * 0.25; col.setRGB(v, v * 0.95, v * 0.92); }
        rocks[kind].setColorAt(ri[kind], col);
        ri[kind]++;
      }
    }
    rocks.forEach((im, i) => {
      im.count = ri[i];
      im.castShadow = !this.quality.aiLod; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    });
    this.rocks = rocks;

    // ------------------------------------------------- the burnt forest
    // standing snags and stumps in groves on the lower slopes round the lava, logs lying where they fell
    const models = await loadPropModels(['dead_tree_trunk', 'dead_tree_trunk_02']);
    const bark = models.dead_tree_trunk.meshes[0].mat.map;
    const smat = charMaterial(bark, U, false);
    const sgeos = [snagGeometry(1, false), snagGeometry(2, false), snagGeometry(5, false), snagGeometry(7, true), snagGeometry(9, true)];
    const snags = sgeos.map((g) => new THREE.InstancedMesh(g, smat, C.snags));
    const si = sgeos.map(() => 0);
    const logs = ['dead_tree_trunk', 'dead_tree_trunk_02'].map((nm) => {
      const { geo, mat } = models[nm].meshes[0];
      return new THREE.InstancedMesh(geo, charMaterial(mat.map, U, true), C.logs);
    });
    const li = [0, 0];
    const groves = Math.ceil(C.snags / 4);
    for (let k = 0, tries = 0; k < groves && tries < groves * 20; tries++) {
      // round the lava (30-150 m out) or on the burnt flanks beside the cone roads
      let gx, gz;
      if (rnd() < 0.6) {
        const p = this.lavaPts[Math.floor(rnd() * this.lavaPts.length)], a = rnd() * 6.3, d = p[3] + 15 + rnd() * 110;
        gx = p[0] + Math.cos(a) * d; gz = p[2] + Math.sin(a) * d;
      } else {
        const t = cone[Math.floor(rnd() * cone.length)], f = t.frame(Math.floor(rnd() * t.n));
        const lat = (rnd() < 0.5 ? -1 : 1) * (t.width / 2 + 12 + rnd() * 90);
        gx = f.x + f.nx * lat; gz = f.z + f.nz * lat;
      }
      // trees never grew up on the bare summit cone
      const rr = Math.hypot(gx, gz);
      if (rr < 260 || rr > 1050 || world.heightAt(gx, gz) > 330) continue;
      k++;
      const n = 4 + Math.floor(rnd() * 12), R = 8 + rnd() * 22;
      for (let j = 0; j < n; j++) {
        const a = rnd() * 6.3, d = Math.sqrt(rnd()) * R;
        const x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
        if (!clear(x, z, 12)) continue;
        world.normalAt(x, z, N);
        if (N.y < 0.8) continue;
        const y = world.heightAt(x, z);
        const pick = rnd();
        if (pick < 0.12) {
          // a fallen log, laid along the slope
          const kind = rnd() < 0.5 ? 0 : 1;
          if (li[kind] >= C.logs) continue;
          const mdl = models[kind ? 'dead_tree_trunk_02' : 'dead_tree_trunk'];
          const s = (3 + rnd() * 3) / mdl.size.x;
          q.setFromUnitVectors(UP, N).multiply(new THREE.Quaternion().setFromAxisAngle(UP, rnd() * 6.3));
          m4.compose(tmp.set(x, y - mdl.box.min.y * s - 0.08, z), q, sc.setScalar(s));
          logs[kind].setMatrixAt(li[kind]++, m4);
          continue;
        }
        const kind = pick < 0.45 ? 3 + Math.floor(rnd() * 2) : Math.floor(rnd() * 3);
        if (si[kind] >= C.snags) continue;
        // snags stand plumb, whatever the slope; sunk a little so the flare meets the ground
        q.setFromAxisAngle(UP, rnd() * 6.3);
        const s = 0.75 + rnd() * 0.6;
        m4.compose(tmp.set(x, y - 0.15, z), q, sc.set(s, s * (0.85 + rnd() * 0.3), s));
        snags[kind].setMatrixAt(si[kind]++, m4);
      }
    }
    for (const [list, idx] of [[snags, si], [logs, li]]) list.forEach((im, i) => {
      im.count = idx[i];
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    });
    this.snags = snags; this.logs = logs;

    this.buildEmbers();
    this.buildAsh();
    this.counts = { rocks: ri[0] + ri[1], snags: si.reduce((a, b) => a + b, 0), logs: li[0] + li[1] };
  }

  // embers lifting off the lava: a cloud of points that wraps round the camera, each shown only while it is over
  // hot ground (the heat mask, looked up in the vertex shader), rising and fading as it climbs
  buildEmbers() {
    const n = this.C.embers, rnd = this.rnd;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = rnd() * 140; pos[i * 3 + 1] = rnd() * 40; pos[i * 3 + 2] = rnd() * 140; seed[i] = rnd(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.emberU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 400 }, uBaseY: { value: 0 },
      tMask: this.U.tMask, uExtent: this.U.uExtent };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.emberU,
      vertexShader: /* glsl */`
        attribute float seed; uniform float uTime, uScale, uBaseY, uExtent; uniform vec3 uCam; uniform sampler2D tMask;
        varying float vA; varying float vT;
        void main() {
          float rise = 1.2 + seed * 2.8;
          vec3 p = position + vec3(uTime * 1.3 + sin(uTime * 0.7 + seed * 40.0) * 2.5, uTime * rise, uTime * 0.5 + cos(uTime * 0.55 + seed * 23.0) * 2.5);
          p.xz = mod(p.xz - uCam.xz + 70.0, 140.0) + uCam.xz - 70.0;
          float h = mod(p.y, 40.0);
          p.y = uBaseY + h;
          float heat = texture(tMask, p.xz / uExtent + 0.5).r;
          vT = fract(seed * 13.7 + uTime * (0.4 + seed));
          vA = smoothstep(0.82, 0.98, heat) * smoothstep(0.0, 1.5, h) * (1.0 - smoothstep(10.0, 38.0, h));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = vA > 0.01 ? clamp((0.09 + seed * 0.08) * uScale / -mv.z, 1.0, 7.0) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA; varying float vT;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA * (0.6 + 0.4 * sin(vT * 6.28));
          gl_FragColor = vec4(vec3(3.0, 0.95, 0.25) * a, a);
        }`,
    });
    this.embers = new THREE.Points(geo, mat);
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
  }

  // ash fall: small grey flakes tumbling down round the camera, lit on whichever face turns to the sun.
  // uDens is the share of them shown (set per track, and rising with Eruption's sky)
  buildAsh() {
    const n = this.C.ash, rnd = this.rnd;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    const off = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { off[i * 4] = rnd() * 60; off[i * 4 + 1] = rnd() * 60; off[i * 4 + 2] = rnd() * 60; off[i * 4 + 3] = rnd(); }
    geo.setAttribute('off', new THREE.InstancedBufferAttribute(off, 4));
    geo.instanceCount = n;
    this.ashU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDens: { value: 0 }, uSun: { value: this.sun.clone() },
      uTint: { value: new THREE.Color(0.3, 0.29, 0.28) } };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: this.ashU,
      vertexShader: /* glsl */`
        attribute vec4 off; uniform float uTime, uDens; uniform vec3 uCam, uSun;
        varying float vA; varying float vL; varying vec2 vUv;
        void main() {
          float s = off.w;
          vUv = uv;
          if (s > uDens) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vA = 0.0; return; }
          vec3 p = off.xyz + vec3(uTime * (1.2 + s) + sin(uTime * 1.3 + s * 50.0) * 0.7, -uTime * (0.6 + s * 0.9), uTime * 0.6 + cos(uTime * 1.1 + s * 31.0) * 0.7);
          p = mod(p - uCam + 30.0, 60.0) + uCam - 30.0;
          // tumble
          float a = uTime * (1.5 + s * 4.0) + s * 20.0, b = uTime * (1.1 + s * 2.5) + s * 9.0;
          mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(a), sin(a), 0.0, -sin(a), cos(a));
          mat3 ry = mat3(cos(b), 0.0, -sin(b), 0.0, 1.0, 0.0, sin(b), 0.0, cos(b));
          vec3 lp = ry * rx * vec3(position.xy * (0.03 + s * 0.045), 0.0);
          vec3 nrm = ry * rx * vec3(0.0, 0.0, 1.0);
          vL = 0.35 + 0.65 * abs(dot(nrm, uSun));
          vec4 mv = viewMatrix * vec4(p + lp, 1.0);
          float d = -mv.z;
          vA = smoothstep(2.0, 4.5, d) * (1.0 - smoothstep(18.0, 29.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTint; varying float vA; varying float vL; varying vec2 vUv;
        void main() {
          vec2 c = vUv - 0.5;
          // ragged edge
          float r = length(c) * (1.0 + 0.35 * sin(c.x * 17.0 + 1.0) * cos(c.y * 13.0));
          float a = smoothstep(0.5, 0.3, r) * vA;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uTint * vL, a * 0.9);
        }`,
    });
    this.ash = new THREE.Mesh(geo, mat);
    this.ash.frustumCulled = false;
    this.ash.renderOrder = 3;
    this.group.add(this.ash);
  }

  update(time, dt, cam, race) {
    this.U.uTime.value = time;
    if (!this.embers) return;
    // embers rise from the nearest lava surface
    let best = Infinity, by = 0;
    for (const p of this.lavaPts) {
      const d = (p[0] - cam.x) ** 2 + (p[2] - cam.z) ** 2;
      if (d < best) { best = d; by = p[1]; }
    }
    const E = this.emberU;
    E.uTime.value = time; E.uCam.value.copy(cam); E.uBaseY.value = by;
    E.uScale.value = innerHeight * this.renderer.getPixelRatio() * 0.6;
    this.embers.visible = best < 260 * 260;
    // ash: a light fall on the cone, heavy on Eruption as the sky closes in
    const id = race?.track?.id, env = race?.hazards?.env ?? 0;
    const goal = id === 'eruption' ? 0.45 + env * 0.55 : id === 'summit' ? 0.18 : id === 'caldera' ? 0.08 : id === 'village' ? 0.12 : 0.05;
    this.density = this.density == null ? goal : this.density + (goal - this.density) * Math.min(1, Math.min(dt, 0.1) * 0.5);
    const A = this.ashU;
    A.uTime.value = time; A.uCam.value.copy(cam); A.uDens.value = this.density;
    A.uTint.value.setRGB(0.3 + env * 0.04, 0.29 - env * 0.04, 0.28 - env * 0.07); // warmer under the burning sky
    this.ash.visible = this.density > 0.01;
  }
}
