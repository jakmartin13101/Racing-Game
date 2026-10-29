import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Debris only collides with the ground and buildings; trucks plough through it (and kick it again, below).
export const G_DEBRIS = (0x0004 << 16) | 0x0001;
const G_SOLID = (0x0001 << 16) | 0xffff;
const UP = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qi = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
const off = new THREE.Matrix4();

// What each prop weighs and how hard it is to knock over. solid props are fixed colliders until hit fast enough.
export const BREAKABLE = {
  Barrel_01: { mass: 55 }, barrel_03: { mass: 55 }, Barrel_02: { mass: 55 }, wine_barrel_01: { mass: 70 },
  old_tyre: { mass: 14 }, wooden_crate_02: { mass: 25 }, wooden_crate_01: { mass: 20 }, propane_tank: { mass: 30 },
  metal_jerrycan: { mass: 8 }, rusted_wheel_rim_02: { mass: 10 }, painted_wooden_bench: { mass: 35 },
  wooden_picnic_table: { mass: 60 }, chevron_sign: { mass: 18 }, chevron_sign_l: { mass: 18 },
  concrete_road_barrier: { mass: 650, solid: true, breakSpeed: 13 },
  street_lamp_01: { mass: 140, solid: true, breakSpeed: 5, tall: true },
};

// Rigid debris: a dynamic body driving either an Object3D or one instance of an InstancedMesh batch.
export class Debris {
  constructor(phys) { this.phys = phys; this.list = []; this.maxActive = 70; }

  // centre: world position of the body; half: half extents; target.apply(pos, quat) moves the visual
  spawn({ centre, quat, half, mass, vel, ang, target, life = 14 }) {
    const body = this.phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(centre.x, centre.y, centre.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }).setLinearDamping(0.15).setAngularDamping(0.4).setCcdEnabled(true));
    this.phys.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.04, half.x), Math.max(0.04, half.y), Math.max(0.04, half.z))
      .setMass(mass).setFriction(0.7).setRestitution(0.2).setCollisionGroups(G_DEBRIS), body);
    body.setLinvel(vel, true);
    if (ang) body.setAngvel(ang, true);
    const d = { body, target, age: 0, life, half, mass };
    this.list.push(d);
    // keep the simulation small: the oldest pieces come to rest where they are
    while (this.list.filter((x) => x.body).length > this.maxActive) this.freeze(this.list.find((x) => x.body));
    return d;
  }

  freeze(d) {
    if (!d.body) return;
    this.phys.removeRigidBody(d.body);
    d.body = null;
    d.target.onRest?.();
  }

  clear() {
    for (const d of this.list) if (d.body) this.phys.removeRigidBody(d.body);
    this.list = [];
  }

  sync(dt) {
    for (const d of this.list) {
      if (!d.body) continue;
      d.age += dt;
      const t = d.body.translation(), r = d.body.rotation();
      v3.set(t.x, t.y, t.z); q.set(r.x, r.y, r.z, r.w);
      d.target.apply(v3, q);
      if (d.age > d.life || (d.age > 3 && d.body.isSleeping()) || t.y < -400) this.freeze(d);
    }
    this.list = this.list.filter((d) => d.body || d.keep);
  }
}

// Trackside props that trucks can knock down. Each prop is one instance of a batch from the placer.
export class Breakables {
  constructor(phys, debris, handles) {
    this.phys = phys;
    this.debris = debris;
    this.items = [];
    this.grid = new Map();
    this.fixed = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const h of handles) {
      const spec = BREAKABLE[h.name];
      if (!spec) continue;
      const box = h.model.box;
      const size = box.getSize(new THREE.Vector3()).multiply(h.scale);
      const centreL = box.getCenter(new THREE.Vector3());
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
      h.matrix.decompose(pos, quat, scl);
      const centre = centreL.clone().multiply(scl).applyQuaternion(quat).add(pos);
      const it = { ...h, spec, size, half: size.clone().multiplyScalar(0.5), centreL, quat, scl, centre, r: Math.hypot(size.x, size.z) / 2, state: 'static',
        centre0: centre.clone(), quat0: quat.clone() };
      this.addSolid(it);
      this.items.push(it);
      this.index(it);
    }
  }

  addSolid(it) {
    if (!it.spec.solid || it.collider) return;
    const c = it.centre, q0 = it.quat;
    it.collider = this.phys.createCollider(RAPIER.ColliderDesc.cuboid(it.half.x * 0.8, it.half.y, it.half.z * 0.8)
      .setTranslation(c.x, c.y, c.z).setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w })
      .setFriction(0.4).setCollisionGroups(G_SOLID), this.fixed);
  }

  // put everything back for the next race
  reset() {
    for (const it of this.items) {
      if (it.state === 'static') continue;
      it.state = 'static'; it.d = null;
      it.centre.copy(it.centre0); it.quat.copy(it.quat0);
      this.setMatrix(it, it.centre, it.quat);
      this.index(it);
      this.addSolid(it);
    }
  }

  key(x, z) { return `${Math.floor(x / 10)},${Math.floor(z / 10)}`; }
  index(it) {
    const k = this.key(it.centre.x, it.centre.z);
    if (it.cell === k) return;
    if (it.cell) { const a = this.grid.get(it.cell); a.splice(a.indexOf(it), 1); }
    it.cell = k;
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(it);
  }

  setMatrix(it, pos, quat) {
    // the body sits at the box centre; the instance matrix is the model origin
    m4.compose(pos, quat, it.scl);
    off.makeTranslation(-it.centreL.x, -it.centreL.y, -it.centreL.z);
    m4.multiply(off);
    for (const im of it.meshes) { im.setMatrixAt(it.idx, m4); im.instanceMatrix.needsUpdate = true; }
  }

  // Before the physics step: trucks that touch a prop knock it flying and lose speed by its weight.
  // onHit(car, dvEquivalent, worldPoint, localDir) reports the knock to the damage model.
  step(cars, time, onHit) {
    for (const car of cars) {
      const p = car.body.translation();
      const lv = car.body.linvel();
      const spd = Math.hypot(lv.x, lv.z);
      if (spd < 1) continue;
      const r = car.body.rotation();
      qi.set(r.x, r.y, r.z, r.w).invert();
      const cx = Math.floor(p.x / 10), cz = Math.floor(p.z / 10);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const cell = this.grid.get(`${ix},${iz}`);
        if (!cell) continue;
        for (const it of cell.slice()) {
          // the prop centre in the truck's frame, swept a step ahead
          v3.set(it.centre.x - p.x - lv.x / 120, it.centre.y - p.y, it.centre.z - p.z - lv.z / 120).applyQuaternion(qi);
          if (Math.abs(v3.x) > 1.05 + it.r * 0.8 || Math.abs(v3.z) > 2.65 + it.r * 0.8 || v3.y > 1.6 || v3.y + it.half.y < -0.9) continue;
          if (it.state === 'dynamic' && it.d?.body) { this.kick(it, lv, spd); continue; }
          if (it.spec.solid && it.state === 'static' && spd < it.spec.breakSpeed) continue;
          this.knock(it, car, lv, spd, v3.clone(), time, onHit);
        }
      }
    }
  }

  knock(it, car, lv, spd, local, time, onHit) {
    const M = 2170, m = it.state === 'static' ? it.spec.mass : it.spec.mass * 0.4;
    if (it.collider) { this.phys.removeCollider(it.collider, false); it.collider = null; }
    const dir = new THREE.Vector3(lv.x, 0, lv.z).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const lat = THREE.MathUtils.clamp(local.x / 1.5, -1, 1);
    // light things fly, heavy ones slide and tip
    const lift = THREE.MathUtils.clamp(80 / m, 0.22, 1);
    const k = (1.05 + Math.random() * 0.35) * (2 * M / (M + m)) * 0.62 * lift ** 0.3;
    const vel = { x: lv.x * k + side.x * lat * spd * 0.25, y: 1 + spd * (0.12 + Math.random() * 0.14) * lift, z: lv.z * k + side.z * lat * spd * 0.25 };
    let ang;
    if (it.spec.tall) {
      // poles snap at the base and topple the way the truck was going
      const ax = new THREE.Vector3().crossVectors(UP, dir).multiplyScalar(spd / it.size.y * 1.6);
      ang = { x: ax.x, y: (Math.random() - 0.5), z: ax.z };
      vel.x = lv.x * 0.35; vel.z = lv.z * 0.35; vel.y = 0.5;
    } else {
      ang = { x: (Math.random() - 0.5) * spd * 0.6 * lift, y: (Math.random() - 0.5) * spd * 0.4, z: (Math.random() - 0.5) * spd * 0.6 * lift };
    }
    const keep = it;
    it.state = 'dynamic';
    it.d = this.debris.spawn({
      centre: it.centre, quat: it.quat, half: it.half, mass: Math.max(5, it.spec.mass), vel, ang, life: 12,
      target: {
        apply: (pos, quat) => { keep.centre.copy(pos); keep.quat.copy(quat); this.setMatrix(keep, pos, quat); this.index(keep); },
        onRest: () => { keep.state = 'rest'; keep.d = null; },
      },
    });
    // momentum shared with the prop
    const loss = Math.min(0.45, 1.1 * m / (M + m));
    car.body.setLinvel({ x: lv.x * (1 - loss), y: lv.y, z: lv.z * (1 - loss) }, true);
    onHit?.(car, spd * m / (M + m) * 1.6, it.centre.clone(), local.normalize(), it);
  }

  kick(it, lv, spd) {
    const b = it.d.body, v = b.linvel();
    if (v.x * lv.x + v.z * lv.z > spd * spd * 0.9) return;
    b.setLinvel({ x: lv.x * 1.15, y: Math.max(v.y, 1 + spd * 0.08), z: lv.z * 1.15 }, true);
  }
}
