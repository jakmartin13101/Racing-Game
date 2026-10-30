import * as THREE from 'three';
import { roadMaterial, mulberry } from './world.js';

// The road breaking up in a quake: slabs of the road itself, gravel surface and all, wrenched up out of the ground
// on a skirt of torn earth and rock, crazed with cracks; cracks ripping across the road with their edges shoved
// up; and chunks of road and stone flung about. No lava in any of it: it is the ground giving way.
// dark branching cracks on a transparent canvas (the gaps in a broken road, seen from above)
export function crackCanvas(rnd, w = 512, h = 512, { main = 3, branches = 10, border = true, width = 7, cells = 0 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  const line = (x, y, ang, len, lw, depth) => {
    const pts = [[x, y]];
    for (let s = 0; s < len; s += 10) {
      ang += (rnd() - 0.5) * 0.7;
      x += Math.cos(ang) * 10; y += Math.sin(ang) * 10;
      pts.push([x, y]);
      if (depth < 2 && rnd() < 0.06) line(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.8), len * 0.4, lw * 0.55, depth + 1);
    }
    // a wide soft shadow, the dark gap, then a pale crumbled lip on one side
    for (const [lwk, col] of [[2.6, 'rgba(10,8,6,0.35)'], [1, 'rgba(6,5,4,0.95)']]) {
      g.strokeStyle = col; g.lineWidth = lw * lwk;
      g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    }
    g.strokeStyle = 'rgba(190,175,150,0.25)'; g.lineWidth = Math.max(1, lw * 0.35);
    g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px + lw * 0.6, py - lw * 0.4) : g.moveTo(px + lw * 0.6, py - lw * 0.4))); g.stroke();
  };
  // alligator crazing: the edges of irregular cells, the road surface broken into plates
  if (cells) {
    const pts = [];
    for (let k = 0; k < cells; k++) pts.push([rnd() * w, rnd() * h]);
    const img = g.getImageData(0, 0, w, h), D = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (const [px, py] of pts) {
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      if (e < 3.2) { const o = (y * w + x) * 4; D[o] = 8; D[o + 1] = 6; D[o + 2] = 5; D[o + 3] = Math.max(D[o + 3], (1 - e / 3.2) * 230); }
    }
    g.putImageData(img, 0, 0);
  }
  for (let k = 0; k < main; k++) line(rnd() * w, rnd() * h, rnd() * 6.3, (w + h) * 0.6, width, 0);
  for (let k = 0; k < branches; k++) line(rnd() * w, rnd() * h, rnd() * 6.3, 60 + rnd() * 160, width * 0.45, 1);
  if (border) {
    // the slab's broken rim: a darker crumbling band round the edge
    g.strokeStyle = 'rgba(20,16,12,0.55)'; g.lineWidth = 18; g.strokeRect(0, 0, w, h);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// torn earth and basalt for the sides of a lifted slab and the walls of a crack
export function earthMaterial(M) {
  const m = new THREE.MeshStandardMaterial({ map: M.bas.a, color: 0x8a7462, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: M.noise };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform sampler2D tNoise;')
      .replace('#include <map_fragment>', `
// soil band under the road bed, rock below it, both lumpy
vec2 uvE = vec2(vW.x + vW.z, vW.y) / 2.2;
vec4 te = texture(map, uvE);
float n = texture(tNoise, uvE * 0.4).r;
vec3 soil = vec3(0.16, 0.12, 0.09) * (0.6 + n * 0.8);
// strata: the gravel road bed on top, packed soil, then rock
float band = smoothstep(0.35, 0.65, texture(tNoise, vec2(vW.x * 0.05 + vW.z * 0.05, vW.y * 0.6)).g);
diffuseColor.rgb = mix(te.rgb * diffuse * 0.45, soil, 0.35 + band * 0.4);`);
  };
  m.customProgramCacheKey = () => 'quake-earth';
  return m;
}

// A slab of road, w wide, l long, th thick, centred on the origin with its top at +th/2: the gravel road on top,
// crazed with cracks; a ragged, raised front lip; torn earth hanging under it.
export function makeSlab(M, w, l, th, seed, roadW) {
  const rnd = mulberry(seed);
  const NX = 10, NZ = 12;
  const grp = new THREE.Group();
  const P = [], UVr = [], UVc = [], idx = [];
  const at = [];
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, v = j / NZ;
      let x = (u - 0.5) * w, z = (v - 0.5) * l, y = th / 2;
      // broken outline: the edges are bitten into, the front lip most of all
      const edge = i === 0 || i === NX || j === 0 || j === NZ;
      if (edge) {
        const bite = (rnd() - 0.2) * (j === NZ ? 0.7 : 0.35);
        if (i === 0) x += bite; else if (i === NX) x -= bite;
        if (j === 0) z += bite; else if (j === NZ) z -= Math.abs(bite) + rnd() * 0.3;
        y -= rnd() * 0.08;
      } else y += (rnd() - 0.5) * 0.05;
      // the lip buckles up where it snapped
      if (j >= NZ - 1) y += rnd() * 0.12;
      P.push(x, y, z);
      UVr.push(z + 100, x);
      UVc.push(u, v);
      at.push([x, y, z]);
    }
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(UVr, 2));
  top.setIndex(idx);
  top.computeVertexNormals();
  const road = roadMaterial(M, roadW, 1e6);
  road.transparent = false; road.depthWrite = true;
  const topMesh = new THREE.Mesh(top, road);
  topMesh.receiveShadow = true;
  grp.add(topMesh);
  // the crazing on top
  const cg = top.clone();
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(UVc, 2));
  const crackMat = new THREE.MeshBasicMaterial({ map: crackCanvas(rnd, 512, 512, { main: 3, branches: 8, cells: 26 }), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const cracks = new THREE.Mesh(cg, crackMat);
  cracks.renderOrder = 2;
  grp.add(cracks);
  // the skirt: round the outline and down, ragged at the bottom
  const ring = [];
  for (let i = 0; i <= NX; i++) ring.push(i);
  for (let j = 1; j <= NZ; j++) ring.push(j * (NX + 1) + NX);
  for (let i = NX - 1; i >= 0; i--) ring.push(NZ * (NX + 1) + i);
  for (let j = NZ - 1; j >= 0; j--) ring.push(j * (NX + 1));
  const SP = [], SI = [];
  ring.forEach((k) => {
    const [x, y, z] = at[k];
    SP.push(x, y, z);
    // under the road bed the earth breaks away unevenly and slightly inwards
    SP.push(x * 0.92, y - th - 0.4 - rnd() * 0.9, z * 0.92);
  });
  for (let k = 0; k < ring.length - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    SI.push(a, b, c, c, b, d);
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
  skirt.setIndex(SI);
  skirt.computeVertexNormals();
  const sk = new THREE.Mesh(skirt, earthMaterial(M));
  sk.material.side = THREE.DoubleSide;
  sk.castShadow = true; sk.receiveShadow = true;
  grp.add(sk);
  return grp;
}

// Stone chips and chunks of road thrown up by the ground breaking. Purely for show: they fly, bounce once and
// settle where they land, and are recycled oldest first.
export class Chips {
  constructor(world, group, mat, max = 60) {
    this.world = world;
    const g = new THREE.DodecahedronGeometry(1, 0);
    const p = g.attributes.position, r = mulberry(5);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.7 + r() * 0.6), p.getY(i) * (0.4 + r() * 0.3), p.getZ(i) * (0.7 + r() * 0.6));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    group.add(this.mesh);
    this.list = [];
    this.max = max; this.next = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.e = new THREE.Euler();
  }

  throw(pos, vel, size) {
    const c = { p: pos.clone(), v: vel.clone(), size, rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14), rest: false, bounced: false };
    if (this.list.length < this.max) this.list.push(c); else { this.list[this.next] = c; this.next = (this.next + 1) % this.max; }
  }

  update(dt) {
    const { m4, q, s, e } = this;
    this.list.forEach((c, i) => {
      if (!c.rest) {
        c.v.y -= 9.81 * dt;
        c.p.addScaledVector(c.v, dt);
        c.rot.addScaledVector(c.spin, dt);
        const g = this.world.heightAt(c.p.x, c.p.z) + c.size * 0.3;
        if (c.p.y < g) {
          c.p.y = g;
          if (c.bounced || c.v.y > -2.5) { c.rest = true; } else { c.v.multiplyScalar(0.35); c.v.y = -c.v.y * 0.5; c.spin.multiplyScalar(0.4); c.bounced = true; }
        }
      }
      e.set(c.rot.x, c.rot.y, c.rot.z);
      q.setFromEuler(e);
      s.setScalar(c.size);
      m4.compose(c.p, q, s);
      this.mesh.setMatrixAt(i, m4);
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// A crack ripped across the road (Eruption's quakes): a dark gap with its two edges shoved up into low ridges of
// road, the gravel surface carried up on them. f is the track frame, W the width covered, L the band's length
// along the road, skew how far it runs off square. Returns the meshes (in group) for disposal.
export function roadCrack(M, world, track, f, W, L, skew, rnd, group) {
  const NU = 16, NV = 6, P = [], UVr = [], UVc = [], idx = [];
  // the crack's own wander across the road
  const wob = [];
  for (let k = 0; k <= NU; k++) wob.push((rnd() - 0.5) * 0.5);
  for (let j = 0; j <= NV; j++) for (let k = 0; k <= NU; k++) {
    const lat = (k / NU - 0.5) * W, v = j / NV - 0.5;
    const al = v * L + lat * skew + wob[k];
    const x = f.x + f.nx * lat + f.tx * al, z = f.z + f.nz * lat + f.tz * al;
    // a tent: the two edges rise either side of the gap, up to 0.3 m, falling back to the road over the band
    const d = Math.abs(v) * 2;
    const lift = (d < 0.18 ? d / 0.18 : 1 - THREE.MathUtils.smoothstep(d, 0.18, 1)) * (0.18 + rnd() * 0.12) * (1 - Math.pow(Math.abs(lat) / (W / 2), 4));
    P.push(x, world.heightAt(x, z) + 0.14 + lift, z);
    UVr.push(al + 100, lat);
    UVc.push(k / NU, j / NV);
  }
  for (let j = 0; j < NV; j++) for (let k = 0; k < NU; k++) {
    const a = j * (NU + 1) + k, b = a + 1, c = a + NU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UVr, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const road = roadMaterial(M, track.width, 1e6);
  road.polygonOffsetFactor = -3; road.polygonOffsetUnits = -3;
  const ridge = new THREE.Mesh(g, road);
  ridge.renderOrder = 2;
  ridge.receiveShadow = true;
  group.add(ridge);
  // the gap itself, down the middle of the band
  const cg = g.clone();
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(UVc, 2));
  const tex = gapCanvas(rnd);
  const cm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  const gap = new THREE.Mesh(cg, cm);
  gap.renderOrder = 3;
  group.add(gap);
  return [ridge, gap];
}

// a single jagged gap running across a band (u across the road, v along it), with hairline cracks off it
function gapCanvas(rnd) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 64;
  const g = cv.getContext('2d');
  const pts = [];
  let y = 32;
  for (let x = -10; x <= 522; x += 12) { y = Math.max(20, Math.min(44, y + (rnd() - 0.5) * 12)); pts.push([x, y]); }
  g.lineJoin = 'round';
  for (const [w, col] of [[16, 'rgba(25,20,15,0.45)'], [7, 'rgba(5,4,3,0.97)']]) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); pts.forEach(([x, py], k) => (k ? g.lineTo(x, py) : g.moveTo(x, py))); g.stroke();
  }
  g.strokeStyle = 'rgba(8,6,5,0.8)'; g.lineWidth = 1.5;
  for (let k = 0; k < 18; k++) {
    let [x, py] = pts[Math.floor(rnd() * pts.length)];
    let a = (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 0.8);
    g.beginPath(); g.moveTo(x, py);
    for (let s = 0; s < 4; s++) { a += (rnd() - 0.5) * 0.6; x += Math.cos(a) * 9; py += Math.sin(a) * 6; g.lineTo(x, py); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

