import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;
const WHEELS = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];

// Trophy-truck tune. Units: metres, kg, N.
export const TUNE = {
  mass: 1650,
  half: { x: 0.98, y: 0.38, z: 2.45 },
  comY: -0.35,
  wheelX: 1.02, wheelY: -0.08, wheelZf: 1.62, wheelZr: -1.55,
  radius: 0.5, rest: 0.6, travel: 0.42,
  stiffness: 34, compression: 3.2, relaxation: 3.8, maxForce: 60000,
  friction: 2.6, side: 1.1,
  engine: 5200, boost: 3600, brake: 260, reverse: 2600,
  steerMax: 0.5, topSpeed: 52,
};

// Collision groups: (membership << 16) | filter. Wheel rays only see the ground, so trucks can't stand on each other's roofs.
const G_GROUND = (0x0001 << 16) | 0xffff;
const G_CAR = (0x0002 << 16) | 0x0003;
const RAY_GROUND = (0xffff << 16) | 0x0001;

export const PAINTS = [
  { name: 'Ashfire Orange', hue: 0, sat: 1, val: 1 },
  { name: 'Cobalt Blue', hue: 3.55, sat: 1.0, val: 0.9 },
  { name: 'Moss Green', hue: 2.0, sat: 0.75, val: 0.75 },
  { name: 'Sulphur Yellow', hue: 0.55, sat: 1.0, val: 1.25 },
  { name: 'Ghost White', hue: 0, sat: 0.0, val: 2.6 },
  { name: 'Gunmetal', hue: 0, sat: 0.05, val: 0.5 },
  { name: 'Crimson', hue: -0.18, sat: 1.15, val: 0.8 },
  { name: 'Violet', hue: 4.6, sat: 0.8, val: 0.8 },
];

export async function initPhysics(world) {
  await RAPIER.init();
  const phys = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  phys.timestep = 1 / 60;
  // heightfield: rapier wants column-major (rows = z, cols = x)
  const g = world.grid;
  const hf = new Float32Array(g * g);
  for (let iz = 0; iz < g; iz++) for (let ix = 0; ix < g; ix++) hf[iz + ix * g] = world.heights[iz * g + ix];
  const ground = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  phys.createCollider(RAPIER.ColliderDesc.heightfield(g - 1, g - 1, hf, { x: world.extent, y: 1, z: world.extent })
    .setFriction(0.9).setCollisionGroups(G_GROUND), ground);
  return phys;
}

// Static box colliders (buildings) so trucks can't drive through walls.
export function addStaticBoxes(phys, boxes) {
  const body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const b of boxes) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
    phys.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2)
      .setTranslation(b.x, b.y + b.h / 2, b.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.3).setCollisionGroups(G_GROUND), body);
  }
}

// ---------------------------------------------------------------- truck model and materials
export async function loadTruckAssets(renderer) {
  const loader = new GLTFLoader();
  const [full, lod] = await Promise.all([
    loader.loadAsync(`${BASE}models/truck.glb`), loader.loadAsync(`${BASE}models/truck_lod.glb`),
  ]);
  const mats = await truckMaterials(renderer);
  for (const root of [full.scene, lod.scene]) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const name = (o.material?.name || '').replace(/\.\d+$/, '');
      if (mats[name]) o.material = mats[name];
    });
  }
  return { full: full.scene, lod: lod.scene, mats };
}

async function truckMaterials(renderer) {
  const tl = new THREE.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const files = ['body_col.jpg', 'body_orm.jpg', 'body_nrm.png', 'body_coat.jpg', 'wheel_col.jpg', 'wheel_orm.jpg', 'wheel_nrm.png'];
  const loaded = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await tl.loadAsync(`${BASE}models/truck/${f}`)])));
  const T = (f, srgb) => {
    const t = loaded[f];
    t.flipY = false; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const bodyORM = T('body_orm.jpg');
  const body = new THREE.MeshPhysicalMaterial({
    map: T('body_col.jpg', true), normalMap: T('body_nrm.png'),
    aoMap: bodyORM, roughnessMap: bodyORM, metalnessMap: bodyORM, roughness: 1, metalness: 1, aoMapIntensity: 1,
    clearcoat: 0.7, clearcoatMap: T('body_coat.jpg'), clearcoatRoughness: 0.18, envMapIntensity: 1.1,
  });
  const wheelORM = T('wheel_orm.jpg');
  const wheel = new THREE.MeshStandardMaterial({
    map: T('wheel_col.jpg', true), normalMap: T('wheel_nrm.png'),
    aoMap: wheelORM, roughnessMap: wheelORM, metalnessMap: wheelORM, roughness: 1, metalness: 1,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c0d0e, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.62, envMapIntensity: 1.6,
    clearcoat: 1, clearcoatRoughness: 0.05,
  });
  return {
    body, wheel, glass,
    light_lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1dd, emissiveIntensity: 2.5 }),
    light_tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1608, emissiveIntensity: 1.6 }),
    light_lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25 }),
  };
}

const paintCache = new Map();
// Re-colour the paint only: hue-rotate strongly saturated texels, so mud, decals and bare metal keep their look.
function paintMaterial(base, paint) {
  if (!paint.hue && paint.sat === 1 && paint.val === 1) return base;
  const key = paint.name;
  if (paintCache.has(key)) return paintCache.get(key);
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: new THREE.Vector3(paint.hue, paint.sat, paint.val) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPaint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 1e-4);
  float w = smoothstep(0.5, 0.78, sat) * smoothstep(0.01, 0.04, mx);
  vec3 k = vec3(0.57735);
  float cs = cos(uPaint.x), sn = sin(uPaint.x);
  vec3 r = c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
  float lum = dot(r, vec3(0.2126, 0.7152, 0.0722));
  r = mix(vec3(lum), r, uPaint.y) * uPaint.z;
  diffuseColor.rgb = mix(c, r, w);
}`);
  };
  m.customProgramCacheKey = () => `paint-${key}`;
  paintCache.set(key, m);
  return m;
}

function buildVisual(src, paint, mats) {
  const root = src.clone(true);
  const bodyMat = paintMaterial(mats.body, paint);
  root.traverse((o) => { if (o.isMesh && o.material === mats.body) o.material = bodyMat; });
  const wheels = WHEELS.map((n) => {
    const o = root.getObjectByName(n);
    if (!o) return null;
    // re-parent wheels into a spin pivot so the physics can drive them
    const pivot = new THREE.Group();
    pivot.position.copy(o.position);
    o.position.set(0, 0, 0);
    const spin = new THREE.Group();
    spin.add(o);
    pivot.add(spin);
    root.add(pivot);
    return { pivot, spin };
  });
  return { root, wheels };
}

// ---------------------------------------------------------------- vehicle
export class Vehicle {
  constructor({ phys, scene, assets, paint = PAINTS[0], lodOnly = false, name = '', number = 0, isPlayer = false }) {
    Object.assign(this, { phys, scene, name, number, isPlayer, paint });
    this.input = { throttle: 0, brake: 0, steer: 0, hand: 0, boost: 0 };
    this.boost = 1;
    this.power = 1;
    this.group = new THREE.Group();
    // full model near the camera, decimated one further out
    this.lod = new THREE.LOD();
    const parts = [];
    if (!lodOnly) { const v = buildVisual(assets.full, paint, assets.mats); this.lod.addLevel(v.root, 0); parts.push(v); }
    const lv = buildVisual(assets.lod, paint, assets.mats);
    this.lod.addLevel(lv.root, lodOnly ? 0 : 28);
    parts.push(lv);
    this.parts = parts;
    this.group.add(this.lod);
    scene.add(this.group);
    this.createBody();
  }

  createBody() {
    const T = TUNE;
    const bd = RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.6);
    this.body = this.phys.createRigidBody(bd);
    this.phys.createCollider(RAPIER.ColliderDesc.cuboid(T.half.x, T.half.y, T.half.z).setTranslation(0, 0.25, 0)
      .setMass(T.mass).setFriction(0.4).setRestitution(0.05).setCollisionGroups(G_CAR), this.body);
    // cab collider so rolling over looks right
    this.phys.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.35, 0.9).setTranslation(0, 0.9, -0.1).setMass(120)
      .setCollisionGroups(G_CAR), this.body);
    // lower centre of mass for stability
    this.body.setAdditionalMassProperties(400, { x: 0, y: T.comY, z: 0.1 },
      { x: 900, y: 1000, z: 400 }, { w: 1, x: 0, y: 0, z: 0 }, true);
    const vc = this.phys.createVehicleController(this.body);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    const pts = [
      [T.wheelX, T.wheelY, T.wheelZf], [-T.wheelX, T.wheelY, T.wheelZf],
      [T.wheelX, T.wheelY, T.wheelZr], [-T.wheelX, T.wheelY, T.wheelZr],
    ];
    pts.forEach((p, i) => {
      vc.addWheel({ x: p[0], y: p[1], z: p[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, T.rest, T.radius);
      vc.setWheelSuspensionStiffness(i, T.stiffness);
      vc.setWheelMaxSuspensionTravel(i, T.travel);
      vc.setWheelSuspensionCompression(i, T.compression);
      vc.setWheelSuspensionRelaxation(i, T.relaxation);
      vc.setWheelMaxSuspensionForce(i, T.maxForce);
      vc.setWheelFrictionSlip(i, T.friction);
      vc.setWheelSideFrictionStiffness(i, T.side);
    });
    this.vc = vc;
    this.wheelPts = pts;
  }

  place(x, y, z, yaw) {
    this.body.setTranslation({ x, y, z }, true);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.input.steer = 0;
    this.sync(0, 0);
  }

  speed() { const v = this.body.linvel(); return Math.hypot(v.x, v.y, v.z); }

  step(dt, frozen = false) {
    const T = TUNE, I = this.input, vc = this.vc;
    const speed = vc.currentVehicleSpeed();
    const v = this.body.linvel();
    const spd = Math.hypot(v.x, v.y, v.z);
    // steering lock falls off with speed
    const steer = I.steer * T.steerMax * (1 - Math.min(spd / 70, 0.6));
    vc.setWheelSteering(0, steer);
    vc.setWheelSteering(1, steer);
    let force = 0, brake = 0;
    const boosting = I.boost && this.boost > 0.02 && I.throttle > 0 && !frozen;
    this.boosting = boosting;
    if (I.throttle > 0) force = T.engine * this.power * I.throttle * (1 - Math.min(Math.max(speed, 0) / (T.topSpeed * this.power * (boosting ? 1.25 : 1)), 1) ** 2);
    if (boosting) { force += T.boost; this.boost = Math.max(0, this.boost - dt * 0.22); }
    else this.boost = Math.min(1, this.boost + dt * 0.05);
    if (I.brake > 0) {
      if (speed > 1) brake = T.brake * I.brake;
      else force = -T.reverse * I.brake;
    }
    if (frozen) { force = 0; brake = 60; }
    for (let i = 0; i < 4; i++) {
      vc.setWheelEngineForce(i, force * (i < 2 ? 0.4 : 0.6));
      vc.setWheelBrake(i, brake * (i < 2 ? 0.6 : 0.4) + (i >= 2 ? I.hand * 40 : 0));
      vc.setWheelSideFrictionStiffness(i, i >= 2 && I.hand ? 0.45 : T.side);
    }
    if (!I.throttle && !I.brake && !frozen) for (let i = 0; i < 4; i++) vc.setWheelBrake(i, 4);
    vc.updateVehicle(dt, undefined, RAY_GROUND);

    // arcade assists: air control, self-righting, downforce
    const q = this.body.rotation();
    const qq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qq);
    let contacts = 0;
    for (let i = 0; i < 4; i++) contacts += vc.wheelIsInContact(i) ? 1 : 0;
    this.contacts = contacts;
    this.up = up.y;
    if (contacts === 0) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(qq);
      const corr = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).multiplyScalar(1600);
      corr.addScaledVector(right, (I.throttle - I.brake) * 900);
      corr.y += I.steer * 900;
      this.body.applyTorqueImpulse({ x: corr.x * dt, y: corr.y * dt, z: corr.z * dt }, true);
    } else {
      this.body.applyImpulse({ x: 0, y: -spd * spd * 0.9 * dt, z: 0 }, true);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(qq);
      const roll = right.y;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qq);
      this.body.applyTorqueImpulse({ x: fwd.x * roll * 6000 * dt, y: fwd.y * roll * 6000 * dt, z: fwd.z * roll * 6000 * dt }, true);
    }
  }

  // copy physics into the visual; emits wheel dust when `dust` is given
  sync(dt, time, dust, emitScale = 1) {
    const t = this.body.translation(), q = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    const vc = this.vc;
    const v = this.body.linvel();
    const spd = Math.hypot(v.x, v.z);
    for (let i = 0; i < 4; i++) {
      const susp = vc.wheelSuspensionLength(i) ?? TUNE.rest;
      const steer = vc.wheelSteering(i) ?? 0;
      const rot = vc.wheelRotation(i) ?? 0;
      for (const p of this.parts) {
        const w = p.wheels[i];
        if (!w) continue;
        w.pivot.position.set(this.wheelPts[i][0], this.wheelPts[i][1] - susp, this.wheelPts[i][2]);
        w.pivot.rotation.y = steer;
        w.spin.rotation.x = rot;
      }
      if (dust && vc.wheelIsInContact(i) && spd > 4 && Math.random() < (0.5 + spd / 60) * emitScale) {
        const cp = vc.wheelContactPoint(i);
        const side = Math.abs(vc.wheelSideImpulse(i) ?? 0);
        const kick = new THREE.Vector3(-v.x * 0.12 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, -v.z * 0.12 + (Math.random() - 0.5) * 2);
        dust.emit(new THREE.Vector3(cp.x, cp.y + 0.2, cp.z), kick, 0.6 + spd * 0.035 + side * 0.002, time);
      }
    }
  }

  dispose() {
    this.phys.removeVehicleController(this.vc);
    this.phys.removeRigidBody(this.body);
    this.scene.remove(this.group);
  }
}
