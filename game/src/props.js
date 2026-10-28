import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mulberry, nearTrack } from './world.js';

const BASE = import.meta.env.BASE_URL;
const ENV = `${BASE}models/env`;

async function loadModel(loader, name) {
  const g = await loader.loadAsync(`${ENV}/${name}/${name}_lod.glb`);
  const meshes = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (o.isMesh) {
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      meshes.push({ geo, mat: o.material });
    }
  });
  const box = new THREE.Box3();
  for (const m of meshes) { m.geo.computeBoundingBox(); box.union(m.geo.boundingBox); }
  return { meshes, box, size: box.getSize(new THREE.Vector3()) };
}

// Collects transforms per model and turns them into InstancedMeshes.
class Scatter {
  constructor(model) { this.model = model; this.list = []; }
  add(m) { this.list.push(m.clone()); }
  build(group, shadows = true) {
    if (!this.list.length) return;
    for (const { geo, mat } of this.model.meshes) {
      const im = new THREE.InstancedMesh(geo, mat, this.list.length);
      this.list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadows; im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  }
}

export async function buildProps(world, scene, M, quality) {
  const loader = new GLTFLoader();
  const names = ['boulder_01', 'rock_09', 'namaqualand_boulder_02', 'namaqualand_cliff_02', 'Barrel_01', 'barrel_03',
    'old_tyre', 'wooden_crate_02', 'concrete_road_barrier', 'metal_jerrycan', 'propane_tank', 'rusted_wheel_rim_02'];
  const models = {};
  await Promise.all(names.map(async (n) => { models[n] = await loadModel(loader, n); }));
  for (const m of Object.values(models)) for (const { mat } of m.meshes) {
    mat.envMapIntensity = 0.8;
    if (mat.map) mat.map.anisotropy = 8;
  }
  const group = new THREE.Group();
  scene.add(group);
  const S = Object.fromEntries(names.map((n) => [n, new Scatter(models[n])]));
  const rnd = mulberry(1234);
  const c = world.track.centre;
  const n = c.length;
  const W = world.track.width;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), N = new THREE.Vector3();
  const frame = (i) => {
    const a = c[(i + n) % n], b = c[(i + 2 + n) % n];
    const tx = b[0] - a[0], tz = b[2] - a[2];
    const L = Math.hypot(tx, tz) || 1;
    return { x: a[0], z: a[2], tx: tx / L, tz: tz / L, nx: -tz / L, nz: tx / L, yaw: Math.atan2(tx / L, tz / L) };
  };
  // place a model: size = target largest dimension (m); align = tilt to terrain normal
  const put = (name, x, z, yaw, size, { align = 0, sink = 0.02, tilt = 0, yOff = 0, scaleY = 1 } = {}) => {
    const mdl = models[name];
    const s = size / Math.max(mdl.size.x, mdl.size.y, mdl.size.z);
    const y = world.heightAt(x, z);
    q.setFromAxisAngle(up, yaw);
    if (align > 0) {
      world.normalAt(x, z, N);
      const qa = new THREE.Quaternion().setFromUnitVectors(up, N.lerp(up, 1 - align).normalize());
      q.premultiply(qa);
    }
    if (tilt) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * tilt, 0, (rnd() - 0.5) * tilt)));
    sc.set(s, s * scaleY, s);
    p.set(x, y - mdl.box.min.y * s - sink * size + yOff, z);
    m4.compose(p, q, sc);
    S[name].add(m4);
  };

  // --------------------------------------------------------- rocks along the track and across the slopes
  const rocks = ['boulder_01', 'rock_09', 'namaqualand_boulder_02'];
  for (let i = 0; i < n; i += 5) {
    const f = frame(i);
    for (const side of [-1, 1]) {
      if (rnd() > 0.5) continue;
      const lat = side * (W / 2 + 3.5 + Math.pow(rnd(), 1.8) * 50);
      const x = f.x + f.nx * lat + (rnd() - 0.5) * 4, z = f.z + f.nz * lat + (rnd() - 0.5) * 4;
      if (nearTrack(world, x, z, W / 2 + 2.5)) continue;
      const nearEdge = Math.abs(lat) < W / 2 + 9;
      const size = nearEdge ? 0.5 + rnd() * 1.3 : 1 + Math.pow(rnd(), 2.5) * 7;
      put(rocks[Math.floor(rnd() * rocks.length)], x, z, rnd() * 6.28, size, { align: 0.6, sink: 0.12, tilt: 0.4 });
    }
  }
  for (let i = 0; i < quality.fieldRocks; i++) {
    const a = rnd() * Math.PI * 2, r = 150 + Math.pow(rnd(), 0.7) * 950;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (nearTrack(world, x, z, W / 2 + 6)) continue;
    put(rocks[Math.floor(rnd() * rocks.length)], x, z, rnd() * 6.28, 1.2 + Math.pow(rnd(), 4) * 16, { align: 0.7, sink: 0.15, tilt: 0.5 });
  }
  // big cliff outcrops lining cuttings
  for (let i = 0; i < (quality.cliffs ? n : 0); i += 37) {
    const f = frame(i);
    for (const side of [-1, 1]) {
      const lat = side * (W / 2 + 14 + rnd() * 25);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      const hTrack = c[i][1];
      const hHere = world.heightAt(x, z);
      if (hHere - hTrack > 3 && !nearTrack(world, x, z, W / 2 + 8)) {
        put('namaqualand_cliff_02', x, z, f.yaw + (side > 0 ? 0 : Math.PI) + (rnd() - 0.5), 14 + rnd() * 14, { align: 0.3, sink: 0.25 });
      }
    }
  }

  // --------------------------------------------------------- start straight: barriers, paddock clutter
  const st = world.track.start;
  for (let k = -70; k <= 90; k += 4) {
    const f = frame(st + k);
    for (const side of [-1, 1]) {
      const lat = side * (W / 2 + 1.6);
      put('concrete_road_barrier', f.x + f.nx * lat, f.z + f.nz * lat, f.yaw + Math.PI / 2, 2.0, { align: 1, sink: 0.0 });
    }
  }
  // paddock beside the start: barrels, tyre stacks, crates, gas bottles
  const pad = frame(st + 10);
  const padX = pad.x - pad.nx * (W / 2 + 16), padZ = pad.z - pad.nz * (W / 2 + 16);
  for (let k = 0; k < 40; k++) {
    const a = rnd() * 6.28, r = 3 + rnd() * 26;
    const x = padX + Math.cos(a) * r, z = padZ + Math.sin(a) * r;
    if (nearTrack(world, x, z, W / 2 + 3)) continue;
    const pick = rnd();
    if (pick < 0.3) put(rnd() < 0.5 ? 'Barrel_01' : 'barrel_03', x, z, rnd() * 6.28, 0.9, { align: 1 });
    else if (pick < 0.55) {
      const h = 1 + Math.floor(rnd() * 4);
      for (let t = 0; t < h; t++) put('old_tyre', x, z, rnd() * 6.28, 0.85, { align: 1, yOff: t * 0.27 });
    } else if (pick < 0.75) put('wooden_crate_02', x, z, rnd() * 6.28, 1.1, { align: 1 });
    else if (pick < 0.88) put('propane_tank', x, z, rnd() * 6.28, 1.1, { align: 1 });
    else put('metal_jerrycan', x, z, rnd() * 6.28, 0.45, { align: 1 });
  }
  // tyre walls on the outside of tight corners
  for (let i = 0; i < n; i += 6) {
    const a = frame(i - 10), b = frame(i + 10);
    const turn = a.tx * b.tz - a.tz * b.tx;
    if (Math.abs(turn) < 0.25) continue;
    const f = frame(i);
    const side = turn > 0 ? -1 : 1;
    for (let t = 0; t < 3; t++) {
      const lat = side * (W / 2 + 2.2 + t * 0.0);
      put('old_tyre', f.x + f.nx * lat + f.tx * (t - 1) * 0.9, f.z + f.nz * lat + f.tz * (t - 1) * 0.9, rnd() * 6, 0.85, { align: 1 });
      put('old_tyre', f.x + f.nx * lat + f.tx * (t - 1) * 0.9, f.z + f.nz * lat + f.tz * (t - 1) * 0.9, rnd() * 6, 0.85, { align: 1, yOff: 0.27 });
    }
  }
  // wreckage and scrap rims scattered around
  for (let k = 0; k < 30; k++) {
    const f = frame(Math.floor(rnd() * n));
    const lat = (rnd() < 0.5 ? -1 : 1) * (W / 2 + 4 + rnd() * 12);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    if (!nearTrack(world, x, z, W / 2 + 3)) put('rusted_wheel_rim_02', x, z, rnd() * 6.28, 0.7, { align: 1, tilt: 2.5 });
  }
  for (const s of Object.values(S)) s.build(group);

  // --------------------------------------------------------- start gantry with banner
  const gate = buildGate(M, frame(st + 20), world, W);
  group.add(gate);
  const shed = buildShed(world, padX - pad.tx * 18, padZ - pad.tz * 18, pad.yaw);
  group.add(shed);
  return { group, update() {} };
}

function bannerTexture(text, w = 2048, h = 256) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#16120f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffb41f'; g.fillRect(0, h - 26, w, 26);
  g.fillStyle = '#efe9dd';
  g.font = `800 ${h * 0.62}px "Saira Condensed", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h * 0.45);
  // grime
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(60,50,40,${Math.random() * 0.18})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 24, 2 + Math.random() * 10);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildGate(M, f, world, W) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.55, metalness: 0.8 });
  const span = W + 6;
  const h = 7.5;
  const y0 = world.heightAt(f.x, f.z);
  for (const side of [-1, 1]) {
    const x = f.x + f.nx * side * span / 2, z = f.z + f.nz * side * span / 2;
    const yb = world.heightAt(x, z);
    // lattice truss leg: four chords + diagonal bracing
    const leg = new THREE.Group();
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h + y0 - yb + 0.6, 10), steel);
      m.position.set(dx, (h + y0 - yb) / 2, dz);
      leg.add(m);
    }
    for (let k = 0; k < 8; k++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), steel);
      m.position.set(0.3 * (k % 2 ? 1 : -1), 0.5 + k * 0.95, 0);
      m.rotation.x = Math.PI / 4;
      leg.add(m);
    }
    leg.position.set(x, yb, z);
    leg.rotation.y = f.yaw;
    g.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.8, 0.6, 0.6), steel);
  beam.position.set(f.x, y0 + h, f.z);
  beam.rotation.y = f.yaw;
  g.add(beam);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(span - 1, 1.6),
    new THREE.MeshStandardMaterial({ map: bannerTexture('GRAVEL RIOT · CALDERA LOOP'), roughness: 0.85, side: THREE.FrontSide }));
  banner.position.set(f.x - f.tx * 0.32, y0 + h - 1.2, f.z - f.tz * 0.32);
  banner.rotation.y = f.yaw + Math.PI;
  const back = banner.clone();
  back.position.set(f.x + f.tx * 0.32, y0 + h - 1.2, f.z + f.tz * 0.32);
  back.rotation.y = f.yaw;
  g.add(banner, back);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function buildShed(world, x, z, yaw) {
  const tl = new THREE.TextureLoader();
  const T = (f, srgb) => {
    const t = tl.load(`${BASE}textures/ext/${f}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.5);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const orm = T('shed_orm.jpg');
  const mat = new THREE.MeshStandardMaterial({ map: T('shed_albedo.jpg', true), normalMap: T('shed_normal.jpg'),
    roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, color: 0xb8a89a });
  const rust = T('rust_albedo.jpg', true);
  const g = new THREE.Group();
  const y = world.heightAt(x, z);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 4.5, 8), mat);
  walls.position.set(0, 2.25, 0);
  const roofMat = new THREE.MeshStandardMaterial({ map: rust, roughness: 0.8, metalness: 0.5 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.15, 9.2), roofMat);
  roof.position.set(0, 4.7, 0); roof.rotation.z = 0.06;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.6), new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 1 }));
  door.position.set(0, 1.8, 4.01);
  g.add(walls, roof, door);
  g.position.set(x, y - 0.2, z);
  g.rotation.y = yaw;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
