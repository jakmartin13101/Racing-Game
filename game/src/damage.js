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

// How a part hangs once it is knocked loose: hinge point and axis from its bounding box, and the angle it
// reaches as its side's damage climbs from `loose` to the point it falls off.
const POSES = {
  hood: { loose: 0.25, pivot: (b) => [0, b.max.y, b.min.z], axis: [1, 0, 0], angle: -0.38, flap: 0.05, buckle: 0.16 },
  door_l: { loose: 0.22, pivot: (b) => [b.max.x, 0, b.max.z], axis: [0, 1, 0], angle: 0.62, flap: 0.22 },
  door_r: { loose: 0.22, pivot: (b) => [b.min.x, 0, b.max.z], axis: [0, 1, 0], angle: -0.62, flap: 0.22 },
  bumper_f: { loose: 0.1, pivot: (b) => [b.max.x, b.max.y, 0], axis: [0, 0, 1], angle: -0.3, flap: 0.06 },
  bumper_r: { loose: 0.1, pivot: (b) => [b.min.x, b.max.y, 0], axis: [0, 0, 1], angle: 0.3, flap: 0.06 },
  lightbar: { loose: 0.08, pivot: (b) => [0, b.min.y, b.max.z], axis: [1, 0, 0], angle: 0.32, flap: 0.08 },
  mirror_l: { loose: 0.05, pivot: (b) => [b.min.x, b.min.y, b.max.z], axis: [0, 1, 0], angle: 1.1, flap: 0.15 },
  mirror_r: { loose: 0.05, pivot: (b) => [b.max.x, b.min.y, b.max.z], axis: [0, 1, 0], angle: -1.1, flap: 0.15 },
  spare_b: { loose: 0.25, pivot: (b) => [b.max.x, b.min.y, b.min.z], axis: [0, 0, 1], angle: 0.28, flap: 0.05 },
};
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

// Damage model for one truck: zone damage, soft-body dents in the body and panels, panels working loose
// (bonnet popping, doors hanging open, bumpers sagging) before they break off, bent and lost wheels, smoke,
// fire and the engine blow-up. level 0..1; at 1 the truck is totaled. ctx.detail (0.4 low .. 1 high) scales
// how far the bodywork deforms and whether loose panels flap.
export class Damage {
  constructor(vehicle, ctx) {
    Object.assign(this, { v: vehicle, scene: ctx.scene, debris: ctx.debris, fx: ctx.fx });
    this.detail = ctx.detail ?? 1;
    this.level = 0;
    this.zone = Object.fromEntries(ZONES.map((z) => [z, 0]));
    this.lost = new Set();
    this.visuals = [];
    this.smokeT = 0;
    this.burning = 0;
    this.events = [];
    this.wheels = [0, 1, 2, 3].map(() => ({ hurt: 0, bent: 0, lost: false }));
    this.levels = [];
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
      const boxes = Object.fromEntries(Object.entries(parts).map(([k, m]) => [k, partBox(m)]));
      // everything that dents: the body shell and every panel still attached
      const skins = [lvl.body, ...Object.values(parts).flat()].filter(Boolean).map((mesh) => ({ mesh, own: false }));
      this.levels.push({ parts, fills, boxes, skins, wheels: lvl.wheels });
    }
    this.loose = {};
  }

  get totaled() { return this.level >= 1; }

  // world-space direction from the truck towards the impact, impact strength as a change of speed (m/s)
  hit(dirW, dv, pointW, ground = false) {
    if (this.v.ghost || dv < 1.4) return;
    const q = this.v.group.quaternion;
    const dir = dirW.clone().applyQuaternion(tq.copy(q).invert());
    // light knocks only dent the panels; harder ones cost health
    this.dent(dir, dv, pointW);
    const threshold = 2.4;
    if (dv < threshold) return;
    const amount = Math.min(0.6, (dv - threshold) * 0.024 * (ground ? 0.55 : 1));
    (this.log ||= []).push(`${dv.toFixed(1)}${ground ? 'g' : ''}${this.kind || ''}`);
    this.level = Math.min(1, this.level + amount);
    // zone from the dominant direction; neighbours get a share
    const ax = Math.abs(dir.x), ay = dir.y, az = Math.abs(dir.z);
    const main = ay > 0.6 ? 'top' : az >= ax ? (dir.z > 0 ? 'front' : 'rear') : (dir.x > 0 ? 'left' : 'right');
    this.zone[main] += amount * 2.4;
    for (const z of ZONES) if (z !== main) this.zone[z] += amount * 0.35;
    if (ground && main !== 'top' && this.v.up < 0.3) this.zone.top += amount * 1.6;
    if (!ground && pointW) this.hitWheel(this.v.group.worldToLocal(pointW.clone()), dv);
    this.events.push({ type: 'hit', dv });
    this.fx?.sparks(pointW || this.v.group.position, dirW.clone().negate(), this.fx.time, Math.min(30, 6 + dv * 1.5));
    for (const [name, p] of Object.entries(PARTS)) {
      if (this.lost.has(name)) continue;
      if (this.zone[p.zone] >= p.at) this.detach(name, dirW);
      else if (POSES[name] && this.zone[p.zone] >= POSES[name].loose && this.detail > 0.5) this.loosen(name, (this.zone[p.zone] - POSES[name].loose) / (p.at - POSES[name].loose));
    }
    if (this.totaled && !this.totaledAt) { this.totaledAt = true; this.events.push({ type: 'totaled' }); }
  }

  // a hard knock near a wheel bends it; a harder one tears the tyre off
  hitWheel(local, dv) {
    const pts = this.v.wheelPts;
    let best = -1, bd = 1.6;
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(local.x - pts[i][0], local.z - pts[i][2]);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || dv < 6) return;
    const w = this.wheels[best];
    if (w.lost) return;
    w.hurt += (dv - 6) * 0.06 * (1.7 - bd);
    w.bent = Math.min(0.3, w.hurt * 0.45) * (pts[best][0] > 0 ? 1 : -1);
    if (w.hurt >= 0.85) this.loseWheel(best);
    else if (w.hurt > 0.25 && !w.told) { w.told = true; this.events.push({ type: 'part', name: 'wheel', label: 'Wheel bent' }); }
  }

  loseWheel(i) {
    const w = this.wheels[i];
    if (w.lost) return;
    w.lost = true;
    (this.log ||= []).push(`W${i}`);
    const g = this.v.group;
    g.updateMatrixWorld(true);
    let spawned = false;
    for (const L of this.levels) {
      const wh = L.wheels[i];
      if (!wh) continue;
      if (!spawned) {
        spawned = true;
        wh.spin.updateMatrixWorld(true);
        const vis = new THREE.Group();
        for (const c of wh.spin.children) vis.add(c.clone());
        const pos = new THREE.Vector3().setFromMatrixPosition(wh.spin.matrixWorld);
        const quat = new THREE.Quaternion().setFromRotationMatrix(wh.spin.matrixWorld);
        vis.position.copy(pos); vis.quaternion.copy(quat);
        this.scene.add(vis);
        this.visuals.push(vis);
        const lv = this.v.body.linvel();
        const side = new THREE.Vector3(this.v.wheelPts[i][0] > 0 ? 1 : -1, 0, 0).applyQuaternion(g.quaternion);
        // the tyre keeps rolling on its own for a while
        const axle = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion);
        const spin = Math.hypot(lv.x, lv.z) / 0.5;
        this.debris.spawn({ centre: pos, quat, half: new THREE.Vector3(0.18, 0.48, 0.48), mass: 45,
          vel: { x: lv.x + side.x * 3, y: lv.y + 2, z: lv.z + side.z * 3 }, ang: { x: axle.x * spin, y: axle.y * spin + 2, z: axle.z * spin }, life: 20,
          target: { apply: (p, q) => { vis.position.copy(p); vis.quaternion.copy(q); } } });
      }
      wh.spin.visible = false;
    }
    this.v.loseWheel?.(i);
    this.events.push({ type: 'part', name: 'wheel', label: 'Tyre' });
  }

  // a panel works loose: posed about its hinge, more the closer it is to coming off
  loosen(name, t) {
    const P = POSES[name];
    const k = THREE.MathUtils.clamp(t, 0.15, 1);
    const prev = this.loose[name]?.k || 0;
    if (k <= prev) return;
    this.loose[name] = { k, phase: Math.random() * 6 };
    // the bonnet buckles up in the middle as it pops
    if (P.buckle) for (const L of this.levels) for (const m of L.parts[name] || []) this.buckle(L, m, P.buckle * (k - prev) * this.detail);
    this.applyPose(name, 0);
    if (!prev) this.events.push({ type: 'loose', name, label: PARTS[name]?.label || name });
  }

  applyPose(name, flap) {
    const P = POSES[name], st = this.loose[name];
    if (!P || !st) return;
    const a = P.angle * st.k + flap;
    for (const L of this.levels) {
      const b = L.boxes[name];
      if (!b) continue;
      const piv = new THREE.Vector3(...P.pivot(b));
      tq.setFromAxisAngle(tmp.set(...P.axis), a);
      for (const m of L.parts[name] || []) {
        m.quaternion.copy(tq);
        m.position.copy(piv).sub(piv.clone().applyQuaternion(tq));
      }
    }
  }

  ownGeometry(S) {
    if (S.own) return;
    const g = S.mesh.geometry, n = new THREE.BufferGeometry();
    n.index = g.index;
    for (const [k, a] of Object.entries(g.attributes)) n.setAttribute(k, k === 'position' || k === 'normal' || k === 'dmg' ? a.clone() : a);
    n.boundingBox = g.boundingBox; n.boundingSphere = g.boundingSphere;
    n.groups = g.groups;
    S.mesh.geometry = n;
    S.own = true;
  }

  buckle(L, mesh, amount) {
    const S = L.skins.find((s) => s.mesh === mesh);
    if (!S) return;
    this.ownGeometry(S);
    const g = mesh.geometry, pa = g.attributes.position.array;
    g.computeBoundingBox();
    const b = g.boundingBox;
    for (let i = 0; i < pa.length; i += 3) {
      const u = (pa[i + 2] - b.min.z) / (b.max.z - b.min.z || 1), w = (pa[i] - b.min.x) / (b.max.x - b.min.x || 1);
      pa[i + 1] += amount * Math.sin(u * Math.PI) ** 2 * (0.6 + 0.4 * Math.sin(w * Math.PI)) * (0.85 + 0.3 * hash(i));
    }
    g.attributes.position.needsUpdate = true;
  }

  // push the skin in around the impact, crinkle it, and scuff the paint
  dent(dir, dv, pointW) {
    const D = this.detail;
    const r = THREE.MathUtils.clamp(0.3 + dv * 0.03, 0.3, 1.1) * (0.75 + 0.25 * D);
    const depth = THREE.MathUtils.clamp(dv * 0.009, 0.01, 0.22) * D;
    const crinkle = D > 0.7 ? 0.35 : 0;
    let local = null;
    if (pointW) local = this.v.group.worldToLocal(pointW.clone());
    const rip = new THREE.Vector3(hash(dv * 3.1) - 0.5, hash(dv * 5.3) - 0.5, hash(dv * 7.7) - 0.5).normalize().multiplyScalar(26);
    const inv = new THREE.Matrix4();
    for (const L of this.levels) {
      // surface point: from the middle of the truck out along the impact direction to the body's bounding box,
      // then slid sideways towards the actual contact point
      const bb = L.skins[0].mesh.geometry.boundingBox || (L.skins[0].mesh.geometry.computeBoundingBox(), L.skins[0].mesh.geometry.boundingBox);
      const c = bb.getCenter(new THREE.Vector3());
      const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const t = Math.min(h.x / Math.max(Math.abs(dir.x), 1e-3), h.y / Math.max(Math.abs(dir.y), 1e-3), h.z / Math.max(Math.abs(dir.z), 1e-3));
      const P0 = c.clone().addScaledVector(dir, t * 0.97);
      if (local) { const d = local.clone().sub(P0); d.addScaledVector(dir, -d.dot(dir)); P0.addScaledVector(d.clampLength(0, 1.2), 0.8); }
      for (const S of L.skins) {
        const m = S.mesh;
        if (!m.visible) continue;
        // panels may be posed on their hinges: work in the mesh's own frame
        m.updateMatrix();
        inv.copy(m.matrix).invert();
        const P = P0.clone().applyMatrix4(inv);
        const dl = dir.clone().transformDirection(inv);
        const g = m.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (g.boundingSphere.center.distanceTo(P) > g.boundingSphere.radius + r) continue;
        this.ownGeometry(S);
        const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, dm = m.geometry.attributes.dmg;
        const pa = pos.array, na = nor.array, da = dm?.array;
        const r2 = r * r;
        let touched = false;
        for (let i = 0, n = pos.count; i < n; i++) {
          const dx = pa[i * 3] - P.x, dy = pa[i * 3 + 1] - P.y, dz = pa[i * 3 + 2] - P.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          touched = true;
          const w = (1 - Math.sqrt(d2) / r) ** 2;
          const ripple = 1 + crinkle * Math.sin(pa[i * 3] * rip.x + pa[i * 3 + 1] * rip.y + pa[i * 3 + 2] * rip.z);
          const j = (0.6 + 0.8 * hash(i + dv)) * ripple;
          pa[i * 3] -= dl.x * depth * w * j; pa[i * 3 + 1] -= dl.y * depth * w * j; pa[i * 3 + 2] -= dl.z * depth * w * j;
          // crumple the shading: tip normals by a noisy amount
          const k = w * 0.9 * D;
          const nx = na[i * 3] + (hash(i * 3.1 + dv) - 0.5) * k - dl.x * k * 0.4, ny = na[i * 3 + 1] + (hash(i * 5.7 + dv) - 0.5) * k, nz = na[i * 3 + 2] + (hash(i * 7.3 + dv) - 0.5) * k - dl.z * k * 0.4;
          const l = Math.hypot(nx, ny, nz) || 1;
          na[i * 3] = nx / l; na[i * 3 + 1] = ny / l; na[i * 3 + 2] = nz / l;
          if (da && da[i] < 1) da[i] = Math.min(1, da[i] + w * Math.min(1, dv / 9));
        }
        if (touched) { pos.needsUpdate = true; nor.needsUpdate = true; if (dm) dm.needsUpdate = true; }
      }
    }
  }

  detach(name, dirW, kick = 1) {
    if (this.lost.has(name)) return;
    this.lost.add(name);
    delete this.loose[name];
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
          // keep any dents and the loose pose the panel had
          cm.position.sub(c);
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

  // boost run dry: the engine lets go. Bonnet off, pistons and shrapnel out, fire.
  blowEngine() {
    if (this.blown) return;
    this.blown = true;
    this.level = 1;
    this.totaledAt = true;
    const g = this.v.group;
    g.updateMatrixWorld(true);
    const bay = this.hoodBox.getCenter(new THREE.Vector3()).applyMatrix4(g.matrixWorld);
    // the bonnet bulges, then goes
    this.detach('hood', new THREE.Vector3(0, 1, 0), 1.8);
    const upW = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion);
    const lv = this.v.body.linvel();
    const fx = this.fx;
    const fling = (vis, half, mass, up, spread, trail) => {
      vis.position.copy(bay);
      this.scene.add(vis);
      this.visuals.push(vis);
      let n = 0, age = 0;
      this.debris.spawn({ centre: bay.clone().addScaledVector(upW, 0.3), quat: g.quaternion, half, mass,
        vel: { x: lv.x * 0.9 + upW.x * up + (Math.random() - 0.5) * spread, y: lv.y + upW.y * up, z: lv.z * 0.9 + upW.z * up + (Math.random() - 0.5) * spread },
        ang: { x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 30 }, life: 18,
        target: { apply: (p, q) => {
          vis.position.copy(p); vis.quaternion.copy(q);
          age += 1 / 60;
          if (fx && trail && age < trail && n++ % 2 === 0) {
            fx.fire.emit(p, tmp.set(0, 0.3, 0), 0.26 + Math.random() * 0.2, fx.time, 0.3);
            const c = 0.06; fx.smoke.emit(p, tmp.set(0, 0.4, 0), 0.3, fx.time, 2.4, c, c, c);
          }
        } } });
    };
    // two pistons punched out through the bonnet, trailing smoke and fire, plus shrapnel
    for (let k = 0; k < 2; k++) {
      const vis = pistonMesh();
      vis.scale.setScalar(1.6);
      fling(vis, new THREE.Vector3(0.08, 0.18, 0.08), 3, 10 + Math.random() * 4 + k * 2, 5, 2.5);
    }
    for (let k = 0; k < 8; k++) {
      const s = 0.05 + Math.random() * 0.12;
      const vis = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 0.6, s * 1.4), k % 3 ? engineMats.block : engineMats.red);
      vis.castShadow = true;
      fling(vis, new THREE.Vector3(s, s * 0.3, s * 0.7), 1, 6 + Math.random() * 8, 12, k < 3 ? 1.2 : 0);
    }
    for (const L of this.levels) L.fills.hood.traverse((o) => { if (o.isMesh) o.material = engineMats.bay; });
    fx?.explode(bay, fx.time, 1.8, new THREE.Vector3(lv.x, lv.y, lv.z));
    this.burning = 1;
    this.events.push({ type: 'blown' });
  }

  update(dt, time, speedK = 0) {
    // loose panels shake and flap with speed
    if (this.detail >= 0.95) {
      const flapT = time * 9;
      for (const [name, st] of Object.entries(this.loose)) {
        const P = POSES[name];
        this.applyPose(name, Math.sin(flapT + st.phase) * P.flap * st.k * Math.min(1, speedK) + Math.sin(flapT * 2.3 + st.phase) * P.flap * 0.3 * Math.min(1, speedK));
      }
    }
    const fx = this.fx;
    if (!fx) return;
    const g = this.v.group;
    // a wheel-less corner grinds sparks off the hub
    for (let i = 0; i < 4; i++) {
      if (!this.wheels[i].lost || this.v.speed() < 4 || !this.v.vc.wheelIsInContact(i) || Math.random() > 0.6) continue;
      const cp = this.v.vc.wheelContactPoint(i);
      if (cp) fx.sparks(new THREE.Vector3(cp.x, cp.y + 0.05, cp.z), new THREE.Vector3(0, 0.5, 0), time, 2);
    }
    if (this.burning) this.char(dt);
    if (this.level < 0.45 && !this.burning) return;
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    const heavy = this.totaled || this.burning;
    this.smokeT = heavy ? 0.025 : 0.14 - this.level * 0.1;
    const lv = this.v.body.linvel();
    const p = this.hoodBox.getCenter(tmp).setY(this.hoodBox.max.y + 0.05);
    g.updateMatrix();
    p.applyMatrix4(g.matrix);
    const v = new THREE.Vector3(lv.x * 0.75 + (Math.random() - 0.5), 1.2 + Math.random(), lv.z * 0.75 + (Math.random() - 0.5));
    const c = heavy ? 0.045 : this.level > 0.75 ? 0.12 : 0.42;
    fx.smoke.emit(p, v, heavy ? 1.0 : 0.5, time, heavy ? 5 : 2.6, c, c * 0.97, c * 0.95);
    if (this.burning) {
      // flames die down a few seconds after the truck has stopped
      if (this.v.speed() < 0.5) this.burning = Math.max(0.3, this.burning - dt * 0.5);
      for (let k = 0; k < 2; k++) {
        const fp = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, -0.2, (Math.random() - 0.5) * 1.1));
        fx.flame.emit(fp, new THREE.Vector3(lv.x * 0.97 + (Math.random() - 0.5) * 0.6, 1.0 + Math.random() * 1.4, lv.z * 0.97 + (Math.random() - 0.5) * 0.6), (0.45 + Math.random() * 0.7) * this.burning, time, 0.3 + Math.random() * 0.4);
      }
      // rolling orange billows give the fire some body; dark smoke rises off their tops
      if (Math.random() < 0.5) fx.fire.emit(p.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(lv.x * 0.9, 1.4 + Math.random(), lv.z * 0.9), 0.6 * this.burning, time, 0.7 + Math.random() * 0.4);
      fx.light(p, this.burning);
    }
  }

  // fire scorches the paint around the engine bay
  char(dt) {
    this.charT = (this.charT || 0) + dt;
    if (this.charT < 0.25) return;
    this.charT = 0;
    const c = this.hoodBox.getCenter(new THREE.Vector3());
    for (const L of this.levels) {
      const S = L.skins[0];
      this.ownGeometry(S);
      const g = S.mesh.geometry, pa = g.attributes.position.array, da = g.attributes.dmg?.array;
      if (!da) continue;
      for (let i = 0, n = da.length; i < n; i++) {
        const d = Math.hypot(pa[i * 3] - c.x, (pa[i * 3 + 1] - c.y) * 1.5, pa[i * 3 + 2] - c.z);
        if (d < 2.2) da[i] = Math.min(2, Math.max(da[i], 1) + (1 - d / 2.2) * 0.04 * this.burning);
      }
      g.attributes.dmg.needsUpdate = true;
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
