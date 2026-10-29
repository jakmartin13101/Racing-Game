import * as THREE from 'three';

// Parts that can break off, the side of the truck they hang on, and how much damage that side takes before they go.
export const PARTS = {
  mirror_l: { zone: 'left', at: 0.12, mass: 3, label: 'Mirror' },
  mirror_r: { zone: 'right', at: 0.12, mass: 3, label: 'Mirror' },
  bumper_f: { zone: 'front', at: 0.28, mass: 28, label: 'Front bumper' },
  bumper_r: { zone: 'rear', at: 0.28, mass: 24, label: 'Rear bumper' },
  lightbar: { zone: 'top', at: 0.2, mass: 14, label: 'Light bar' },
  spare_b: { zone: 'rear', at: 0.45, mass: 30, label: 'Spare tyre' },
  door_l: { zone: 'left', at: 0.5, mass: 26, label: 'Door' },
  door_r: { zone: 'right', at: 0.5, mass: 26, label: 'Door' },
  spare_a: { zone: 'rear', at: 0.7, mass: 30, label: 'Spare tyre' },
  hood: { zone: 'front', at: 0.8, mass: 18, label: 'Bonnet' },
};
const ZONES = ['front', 'rear', 'left', 'right', 'top'];
const MASS = 2170;
const tmp = new THREE.Vector3(), tq = new THREE.Quaternion(), tm = new THREE.Matrix4();

const engineMats = {
  bay: new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.85, metalness: 0.3, side: THREE.DoubleSide }),
  block: new THREE.MeshStandardMaterial({ color: 0x3a3734, roughness: 0.45, metalness: 0.85 }),
  red: new THREE.MeshStandardMaterial({ color: 0x8a1d12, roughness: 0.4, metalness: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8d6d2, roughness: 0.18, metalness: 1 }),
};

// Engine bay shown once the bonnet is gone: floor, V8 block with red rocker covers, air box.
function engineBay(box) {
  const g = new THREE.Group();
  const w = box.max.x - box.min.x, d = box.max.z - box.min.z, zc = (box.min.z + box.max.z) / 2;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(w * 0.98, 0.04, d * 0.98), engineMats.bay, 0, box.min.y - 0.32, zc);
  add(new THREE.BoxGeometry(0.62, 0.34, 0.78), engineMats.block, 0, box.min.y - 0.14, zc - 0.05);
  for (const s of [-1, 1]) {
    const cover = add(new THREE.BoxGeometry(0.16, 0.07, 0.72), engineMats.red, s * 0.22, box.min.y + 0.06, zc - 0.05);
    cover.rotation.z = s * 0.35;
  }
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 24), engineMats.chrome, 0, box.min.y + 0.08, zc - 0.05);
  add(new THREE.BoxGeometry(0.5, 0.2, 0.12), engineMats.bay, 0, box.min.y - 0.1, box.max.z - 0.12);
  g.position.y = -0.1;
  g.visible = false;
  return g;
}

function pistonMesh() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.075, 20), engineMats.chrome);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.018), engineMats.block);
  rod.position.y = -0.12;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 16), engineMats.block);
  eye.position.y = -0.22;
  for (const m of [crown, rod, eye]) { m.castShadow = true; g.add(m); }
  return g;
}

function hash(i) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }

// Damage model for one truck: zone damage, dents in the body mesh, parts breaking off, smoke and fire,
// and the engine blow-up. level 0..1; at 1 the truck is totaled.
export class Damage {
  constructor(vehicle, ctx) {
    Object.assign(this, { v: vehicle, scene: ctx.scene, debris: ctx.debris, fx: ctx.fx });
    this.level = 0;
    this.zone = Object.fromEntries(ZONES.map((z) => [z, 0]));
    this.lost = new Set();
    this.visuals = [];
    this.smokeT = 0;
    this.burning = 0;
    this.events = [];
    // each LOD level: its body mesh, its breakable part meshes, and filler panels for the holes they leave
    for (const lvl of vehicle.parts) {
      const parts = {};
      lvl.root.traverse((o) => {
        if (!o.isMesh) return;
        // multi-material parts load as several meshes named part_<name>_<n>
        const key = (o.name.startsWith('part_') ? o.name : o.parent?.name || '').replace(/^part_/, '');
        const k = Object.keys(PARTS).find((p) => key === p || key.startsWith(`${p}_`));
        if (k && (o.name.startsWith('part_') || o.parent?.name.startsWith('part_'))) (parts[k] ||= []).push(o);
      });
      const fills = {};
      for (const side of ['door_l', 'door_r']) {
        const box = partBox(parts[side]);
        if (!box) continue;
        const s = side === 'door_l' ? 1 : -1;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(box.max.z - box.min.z, box.max.y - box.min.y), engineMats.bay);
        m.rotation.y = s * Math.PI / 2;
        m.position.set(s * (Math.min(Math.abs(box.min.x), Math.abs(box.max.x)) - 0.05), (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
        m.visible = false;
        lvl.root.add(m);
        fills[side] = m;
      }
      const hb = partBox(parts.hood) || new THREE.Box3(new THREE.Vector3(-0.8, 0.3, 1.05), new THREE.Vector3(0.8, 0.39, 2.3));
      fills.hood = engineBay(hb);
      lvl.root.add(fills.hood);
      this.hoodBox = this.hoodBox || hb;
      this.levels = this.levels || [];
      this.levels.push({ body: lvl.body, parts, fills, own: false });
    }
  }

  get totaled() { return this.level >= 1; }

  // world-space direction from the truck towards the impact, impact strength as a change of speed (m/s)
  hit(dirW, dv, pointW, ground = false) {
    const threshold = 2.4;
    if (dv < threshold || this.v.ghost) return;
    const q = this.v.group.quaternion;
    const dir = dirW.clone().applyQuaternion(tq.copy(q).invert());
    const amount = Math.min(0.6, (dv - threshold) * 0.024 * (ground ? 0.55 : 1));
    (this.log ||= []).push(`${dv.toFixed(1)}${ground ? 'g' : ''}${this.kind || ''}`);
    this.level = Math.min(1, this.level + amount);
    // zone from the dominant direction; neighbours get a share
    const ax = Math.abs(dir.x), ay = dir.y, az = Math.abs(dir.z);
    const main = ay > 0.6 ? 'top' : az >= ax ? (dir.z > 0 ? 'front' : 'rear') : (dir.x > 0 ? 'left' : 'right');
    this.zone[main] += amount * 2.4;
    for (const z of ZONES) if (z !== main) this.zone[z] += amount * 0.35;
    if (ground && main !== 'top' && this.v.up < 0.3) this.zone.top += amount * 1.6;
    this.dent(dir, dv, pointW);
    this.events.push({ type: 'hit', dv });
    this.fx?.sparks(pointW || this.v.group.position, dirW.clone().negate(), this.fx.time, Math.min(24, 4 + dv * 1.2));
    for (const [name, p] of Object.entries(PARTS)) {
      if (!this.lost.has(name) && this.zone[p.zone] >= p.at) this.detach(name, dirW);
    }
    if (this.totaled && !this.totaledAt) { this.totaledAt = true; this.events.push({ type: 'totaled' }); }
  }

  ownGeometry(L) {
    if (L.own) return;
    const g = L.body.geometry, n = new THREE.BufferGeometry();
    n.index = g.index;
    for (const [k, a] of Object.entries(g.attributes)) n.setAttribute(k, k === 'position' || k === 'normal' || k === 'dmg' ? a.clone() : a);
    n.boundingBox = g.boundingBox; n.boundingSphere = g.boundingSphere;
    L.body.geometry = n;
    L.own = true;
  }

  // push the body skin in around the impact and scuff the paint
  dent(dir, dv, pointW) {
    const r = THREE.MathUtils.clamp(0.35 + dv * 0.025, 0.35, 0.95);
    const depth = THREE.MathUtils.clamp(dv * 0.0065, 0.012, 0.15);
    // surface point: from the middle of the truck out along the impact direction to the body's bounding box,
    // then slid sideways towards the actual contact point
    let local = null;
    if (pointW) local = this.v.group.worldToLocal(pointW.clone());
    for (const L of this.levels) {
      this.ownGeometry(L);
      const g = L.body.geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const c = bb.getCenter(new THREE.Vector3());
      const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const t = Math.min(h.x / Math.max(Math.abs(dir.x), 1e-3), h.y / Math.max(Math.abs(dir.y), 1e-3), h.z / Math.max(Math.abs(dir.z), 1e-3));
      const P = c.clone().addScaledVector(dir, t * 0.97);
      if (local) { const d = local.clone().sub(P); d.addScaledVector(dir, -d.dot(dir)); P.addScaledVector(d.clampLength(0, 1.2), 0.8); }
      const pos = g.attributes.position, nor = g.attributes.normal, dm = g.attributes.dmg;
      const pa = pos.array, na = nor.array, da = dm?.array;
      const r2 = r * r;
      for (let i = 0, n = pos.count; i < n; i++) {
        const dx = pa[i * 3] - P.x, dy = pa[i * 3 + 1] - P.y, dz = pa[i * 3 + 2] - P.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const w = (1 - Math.sqrt(d2) / r) ** 2;
        const j = 0.6 + 0.8 * hash(i + dv);
        pa[i * 3] -= dir.x * depth * w * j; pa[i * 3 + 1] -= dir.y * depth * w * j; pa[i * 3 + 2] -= dir.z * depth * w * j;
        // crumple the shading: tip normals by a noisy amount
        const k = w * 0.9;
        let nx = na[i * 3] + (hash(i * 3.1) - 0.5) * k - dir.x * k * 0.4, ny = na[i * 3 + 1] + (hash(i * 5.7) - 0.5) * k, nz = na[i * 3 + 2] + (hash(i * 7.3) - 0.5) * k - dir.z * k * 0.4;
        const l = Math.hypot(nx, ny, nz) || 1;
        na[i * 3] = nx / l; na[i * 3 + 1] = ny / l; na[i * 3 + 2] = nz / l;
        if (da) da[i] = Math.min(1, da[i] + w * Math.min(1, dv / 10));
      }
      pos.needsUpdate = true; nor.needsUpdate = true;
      if (dm) dm.needsUpdate = true;
    }
  }

  detach(name, dirW, kick = 1) {
    if (this.lost.has(name)) return;
    this.lost.add(name);
    const g = this.v.group;
    g.updateMatrixWorld(true);
    let spawned = false;
    for (const L of this.levels) {
      const meshes = L.parts[name] || [];
      if (!spawned && meshes.length) {
        spawned = true;
        const box = partBox(meshes);
        const c = box.getCenter(new THREE.Vector3());
        const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const vis = new THREE.Group();
        for (const m of meshes) {
          const cm = m.clone();
          cm.position.sub(c);
          cm.material = Array.isArray(m.material) ? m.material : m.material;
          vis.add(cm);
        }
        const centre = c.clone().applyMatrix4(g.matrixWorld);
        vis.position.copy(centre); vis.quaternion.copy(g.quaternion);
        this.scene.add(vis);
        this.visuals.push(vis);
        const lv = this.v.body.linvel();
        const out = centre.clone().sub(g.position).normalize();
        const up = name === 'hood' ? 10 + Math.random() * 5 * kick : 1.5 + Math.random() * 2.5;
        const vel = { x: lv.x * 0.85 + out.x * (2 + Math.random() * 3) * kick, y: lv.y * 0.5 + up, z: lv.z * 0.85 + out.z * (2 + Math.random() * 3) * kick };
        const ang = { x: (Math.random() - 0.5) * 12 * kick, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 12 * kick };
        this.debris.spawn({ centre, quat: g.quaternion, half, mass: PARTS[name]?.mass || 10, vel, ang, life: 16,
          target: { apply: (p, q) => { vis.position.copy(p); vis.quaternion.copy(q); } } });
      }
      for (const m of meshes) m.visible = false;
      if (L.fills[name]) L.fills[name].visible = true;
    }
    this.events.push({ type: 'part', name, label: PARTS[name]?.label || name });
  }

  // boost run dry: the engine lets go. Bonnet off, pistons out, fire.
  blowEngine() {
    if (this.blown) return;
    this.blown = true;
    this.level = 1;
    this.totaledAt = true;
    const g = this.v.group;
    g.updateMatrixWorld(true);
    const bay = this.hoodBox.getCenter(new THREE.Vector3()).applyMatrix4(g.matrixWorld);
    this.detach('hood', new THREE.Vector3(0, 1, 0), 1.6);
    const upW = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion);
    const lv = this.v.body.linvel();
    // two pistons punched out through the bonnet, trailing smoke and fire
    const fx = this.fx;
    for (let k = 0; k < 2; k++) {
      const vis = pistonMesh();
      vis.scale.setScalar(1.6);
      vis.position.copy(bay);
      this.scene.add(vis);
      this.visuals.push(vis);
      const s = 4 + Math.random() * 3, up = 10 + Math.random() * 4 + k * 2;
      let n = 0, age = 0;
      this.debris.spawn({ centre: bay.clone().addScaledVector(upW, 0.3), quat: g.quaternion, half: new THREE.Vector3(0.08, 0.18, 0.08), mass: 3,
        vel: { x: lv.x * 0.9 + upW.x * up + (Math.random() - 0.5) * s, y: lv.y + upW.y * up, z: lv.z * 0.9 + upW.z * up + (Math.random() - 0.5) * s },
        ang: { x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 30 }, life: 18,
        target: { apply: (p, q) => {
          vis.position.copy(p); vis.quaternion.copy(q);
          age += 1 / 60;
          if (fx && age < 2.5 && n++ % 2 === 0) {
            fx.fire.emit(p, tmp.set(0, 0.3, 0), 0.22 + Math.random() * 0.15, fx.time, 0.35);
            const c = 0.07; fx.smoke.emit(p, tmp.set(0, 0.4, 0), 0.25, fx.time, 2.2, c, c, c);
          }
        } } });
    }
    for (const L of this.levels) L.fills.hood.traverse((o) => { if (o.isMesh) o.material = engineMats.bay; });
    this.fx?.burst(bay, this.fx.time, 1.8, new THREE.Vector3(lv.x, lv.y, lv.z));
    this.burning = 1;
    this.events.push({ type: 'blown' });
  }

  update(dt, time) {
    const fx = this.fx;
    if (!fx) return;
    const g = this.v.group;
    if (this.level < 0.45 && !this.burning) return;
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    const heavy = this.totaled || this.burning;
    this.smokeT = heavy ? 0.03 : 0.14 - this.level * 0.1;
    const lv = this.v.body.linvel();
    const p = this.hoodBox.getCenter(tmp).setY(this.hoodBox.max.y + 0.05);
    g.updateMatrix();
    p.applyMatrix4(g.matrix);
    const v = new THREE.Vector3(lv.x * 0.75 + (Math.random() - 0.5), 1.2 + Math.random(), lv.z * 0.75 + (Math.random() - 0.5));
    const c = heavy ? 0.05 : this.level > 0.75 ? 0.12 : 0.42;
    fx.smoke.emit(p, v, heavy ? 0.9 : 0.5, time, heavy ? 4.5 : 2.6, c, c * 0.97, c * 0.95);
    if (this.burning) {
      // flames die down a few seconds after the truck has stopped
      if (this.v.speed() < 0.5) this.burning = Math.max(0.25, this.burning - dt * 0.8);
      // flames ride along with the truck
      for (let k = 0; k < 3; k++) {
        const fp = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.15, (Math.random() - 0.5) * 0.8));
        fx.fire.emit(fp, new THREE.Vector3(lv.x * 0.97, 0.8 + Math.random() * 1.4, lv.z * 0.97), (0.45 + Math.random() * 0.6) * this.burning, time, 0.35 + Math.random() * 0.3);
      }
    }
  }

  dispose() {
    for (const v of this.visuals) this.scene.remove(v);
    this.visuals = [];
  }
}

function partBox(meshes) {
  if (!meshes?.length) return null;
  const b = new THREE.Box3();
  for (const m of meshes) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox); }
  return b;
}
