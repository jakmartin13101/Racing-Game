import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Damage } from './damage.js';

const WHEELS = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];
const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _up2 = new THREE.Vector3(), _q = new THREE.Quaternion();

// Trophy-truck tune. Units: metres, kg, N.
export const TUNE = {
  mass: 1650,
  half: { x: 0.98, y: 0.38, z: 2.45 },
  comY: -0.35,
  wheelX: 1.02, wheelY: -0.08, wheelZf: 1.62, wheelZr: -1.55,
  radius: 0.5,
  // Long-travel suspension. Rapier's spring force per wheel is stiffness * compression * chassis mass, so the
  // static sag is g / (wheels * stiffness): about 0.19 m here, which leaves that much droop for the wheels to
  // follow the ground down into dips and hang off the chassis in the air (about 1.1 Hz in heave, like a real
  // trophy truck). `travel` is the bump travel from full droop; the last `bump` metres of it ride on
  // progressive bump stops instead of slamming into a hard limit.
  rest: 0.72, travel: 0.54, bump: 0.14,
  stiffness: 13, compression: 1.9, relaxation: 2.7, maxForce: 60000,
  // bump stop rate (m/s^2 per m^2 of compression, per wheel) and its damping (1/s)
  bumpRate: 1500, bumpDamp: 6,
  // anti-roll bars, front and rear (same units as the springs), so the soft springs don't let the body wallow
  arbF: 9, arbR: 6,
  friction: 2.6, side: 1.1,
  engine: 6600, boost: 4300, brake: 260, reverse: 2600,
  steerMax: 0.5, topSpeed: 55,
  // six-speed sequential box: engine rpm from wheel speed, a torque curve peaking mid-range, and a short
  // power cut on every upshift
  gears: [3.2, 2.1, 1.5, 1.15, 0.92, 0.76], final: 7.0, idle: 950, redline: 7000, upshift: 6500, downshift: 2900, shiftTime: 0.16,
  // aerodynamic drag (N per (m/s)^2) and how much grip loose ground keeps compared with the track
  drag: 0.5, looseGrip: 0.82,
  // what is left of a corner once its tyre is torn off: the bare hub and brake disc on a bent arm. It sits a
  // tyre's depth lower, on a weakened spring, and gouges the ground instead of rolling.
  hub: { radius: 0.2, spring: 0.35, bend: 0.12, grip: 0.45, side: 0.3, drag: 110, plough: 140, ploughMax: 0.2 },
  // an arcade hand on the shoulder against rolling over, only past this much roll (radians) so it never holds a
  // truck up on a missing wheel or flattens normal body roll
  rollAssist: 6000, rollFree: 0.3,
};

// Wheel layout: where each wheel mounts, whether it steers, its share of drive and brake torque, and the axle it
// shares with its partner across the vehicle (for the anti-roll bar). Built from the tune for the four-wheel
// truck; other layouts (three-wheelers, bikes) only need a different list.
export function wheelLayout(T = TUNE) {
  const w = (x, z, front) => ({ pos: [x, T.wheelY, z], steer: front, drive: front ? 0.4 : 0.6, brake: front ? 0.6 : 0.4,
    hand: !front, axle: front ? 0 : 1, arb: front ? T.arbF : T.arbR });
  return [w(T.wheelX, T.wheelZf, true), w(-T.wheelX, T.wheelZf, true), w(T.wheelX, T.wheelZr, false), w(-T.wheelX, T.wheelZr, false)];
}

// engine torque against rpm, 1 at the peak (4800 rpm)
const torqueCurve = (rpm) => THREE.MathUtils.clamp(1 - ((rpm - 4800) / 5200) ** 2 * 1.4, 0.55, 1);

// Collision groups: (membership << 16) | filter. Wheel rays only see the ground, so trucks can't stand on each other's roofs.
const G_GROUND = (0x0001 << 16) | 0xffff;
// trucks also hit hazards (0x0008): volcanic bombs and boulders
const G_CAR = (0x0002 << 16) | 0x000b;
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
  const BASE = import.meta.env.BASE_URL;
  const loader = new GLTFLoader();
  const [full, lod] = await Promise.all([
    loader.loadAsync(`${BASE}models/truck.glb`), loader.loadAsync(`${BASE}models/truck_lod.glb`),
  ]);
  const mats = await truckMaterials(renderer);
  for (const root of [full.scene, lod.scene]) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      // per-vertex damage (scuffed paint), zero until the truck is dented
      if (o.name === 'body' || o.name.startsWith('part_')) o.geometry.setAttribute('dmg', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count), 1));
      const name = (o.material?.name || '').replace(/\.\d+$/, '');
      if (mats[name]) o.material = mats[name];
    });
  }
  return { full: full.scene, lod: lod.scene, mats };
}

async function truckMaterials(renderer) {
  const BASE = import.meta.env.BASE_URL;
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
// Damage scrapes the paint back to scratched steel where the `dmg` vertex attribute says the body was hit.
function paintMaterial(base, paint) {
  const key = paint.name;
  if (paintCache.has(key)) return paintCache.get(key);
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: new THREE.Vector3(paint.hue, paint.sat, paint.val) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float dmg;\nvarying float vDmg;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDmg = dmg;\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPaint;\nvarying float vDmg;\nvarying vec3 vLocal;\nfloat dHash(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float scrape = smoothstep(0.15, 0.9, vDmg * (0.55 + 0.9 * dHash(vLocal * vec3(90.0, 14.0, 90.0))));
roughnessFactor = mix(roughnessFactor, 0.42, scrape);
roughnessFactor = mix(roughnessFactor, 0.95, smoothstep(1.0, 1.6, vDmg));`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.9, smoothstep(0.15, 0.9, vDmg * (0.55 + 0.9 * dHash(vLocal * vec3(90.0, 14.0, 90.0)))));')
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
  float sc = smoothstep(0.15, 0.9, vDmg * (0.55 + 0.9 * dHash(vLocal * vec3(90.0, 14.0, 90.0))));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.35, 0.33) * (0.7 + 0.5 * dHash(vLocal * 260.0)), sc);
  diffuseColor.rgb *= 1.0 - smoothstep(0.5, 1.0, vDmg) * 0.35;
  // values above 1 are fire scorching: blistered, blackened paint
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.026) * (0.6 + 0.8 * dHash(vLocal * 140.0)), smoothstep(1.0, 1.8, vDmg) * 0.92);
}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - smoothstep(0.1, 0.6, vDmg);\n#endif');
  };
  m.customProgramCacheKey = () => `paint-${key}`;
  paintCache.set(key, m);
  return m;
}

function buildVisual(src, paint, mats) {
  const root = src.clone(true);
  const bodyMat = paintMaterial(mats.body, paint);
  let body = null;
  root.traverse((o) => {
    if (o.isMesh && o.material === mats.body) o.material = bodyMat;
    if (o.isMesh && o.name === 'body') body = o;
  });
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
  return { root, wheels, body };
}

// bare hub left on the axle when a tyre is torn off: brake disc, hub and wheel studs, in scuffed steel
let hubGeo = null;
const hubMat = new THREE.MeshStandardMaterial({ color: 0x4a4744, metalness: 0.9, roughness: 0.45 });
function hubMesh(side) {
  if (!hubGeo) {
    const disc = new THREE.CylinderGeometry(TUNE.hub.radius, TUNE.hub.radius, 0.04, 28);
    const hub = new THREE.CylinderGeometry(0.11, 0.13, 0.16, 16).translate(0, 0.08, 0);
    hubGeo = [disc, hub];
  }
  const g = new THREE.Group();
  for (const geo of hubGeo) {
    const m = new THREE.Mesh(geo, hubMat);
    m.castShadow = true;
    g.add(m);
  }
  // cylinders stand on y; lay them on the axle, hub face pointing outwards
  g.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  return g;
}

// ---------------------------------------------------------------- vehicle
export class Vehicle {
  constructor({ phys, scene, assets, paint = PAINTS[0], lodOnly = false, name = '', number = 0, isPlayer = false, crash = null }) {
    Object.assign(this, { phys, scene, name, number, isPlayer, paint });
    this.input = { throttle: 0, brake: 0, steer: 0, hand: 0, boost: 0 };
    this.boost = 1;
    this.power = 1;
    this.gear = 1; this.rpm = TUNE.idle; this.shiftT = 0;
    // 0 on the track surface, towards 1 on loose ground off it; set by the race each step
    this.surface = 0;
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
    this.damage = crash ? new Damage(this, crash) : null;
    this.skids = crash?.skids || null;
  }

  get totaled() { return !!this.damage?.totaled; }

  createBody() {
    const T = TUNE;
    const bd = RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.6);
    this.body = this.phys.createRigidBody(bd);
    // both colliders report hard contacts to the damage model
    const ev = (d) => d.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(70000);
    this.colliders = [
      this.phys.createCollider(ev(RAPIER.ColliderDesc.cuboid(T.half.x, T.half.y, T.half.z).setTranslation(0, 0.25, 0)
        .setMass(T.mass).setFriction(0.4).setRestitution(0.05).setCollisionGroups(G_CAR)), this.body),
      // cab collider so rolling over looks right
      this.phys.createCollider(ev(RAPIER.ColliderDesc.cuboid(0.8, 0.35, 0.9).setTranslation(0, 0.9, -0.1).setMass(120)
        .setCollisionGroups(G_CAR)), this.body),
    ];
    // lower centre of mass for stability
    this.body.setAdditionalMassProperties(400, { x: 0, y: T.comY, z: 0.1 },
      { x: 900, y: 1000, z: 400 }, { w: 1, x: 0, y: 0, z: 0 }, true);
    const vc = this.phys.createVehicleController(this.body);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    this.layout = wheelLayout(T);
    this.layout.forEach((L, i) => {
      const p = L.pos;
      vc.addWheel({ x: p[0], y: p[1], z: p[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, T.rest, T.radius);
      vc.setWheelSuspensionStiffness(i, T.stiffness);
      vc.setWheelMaxSuspensionTravel(i, T.travel);
      vc.setWheelSuspensionCompression(i, T.compression);
      vc.setWheelSuspensionRelaxation(i, T.relaxation);
      vc.setWheelMaxSuspensionForce(i, T.maxForce);
      vc.setWheelFrictionSlip(i, T.friction);
      vc.setWheelSideFrictionStiffness(i, T.side);
      // the partner on the same axle, across the vehicle
      L.mate = this.layout.findIndex((o, j) => j !== i && o.axle === L.axle);
    });
    this.vc = vc;
    this.wheelPts = this.layout.map((L) => L.pos);
    this.nWheels = this.layout.length;
    this.lostWheels = new Set();
    // suspension length per wheel as the geometry has it (rapier clamps its own at the end of the travel)
    this.squash = new Float32Array(this.nWheels).fill(T.rest);
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
    // a bent wheel pulls the truck to one side
    const pull = this.damage ? this.damage.wheels.reduce((a, w, i) => a + (i < 2 ? w.bent * 0.35 : w.bent * 0.15), 0) : 0;
    const steer = (I.steer * T.steerMax + pull * 0.25) * (1 - Math.min(spd / 70, 0.6));
    this.steerWheels(steer);
    let force = 0, brake = 0;
    const dead = this.totaled;
    // damage costs power and top speed; a totaled truck only coasts
    const health = 1 - (this.damage?.level || 0);
    const pw = this.power * (0.55 + 0.45 * health);
    // boost runs while the button is held; a fresh press needs a little charge
    if (!I.boost) this.boostLatch = false;
    const can = this.boostLatch || this.boost > 0.06;
    const boosting = !!I.boost && can && this.boost > 0 && I.throttle > 0 && !frozen && !dead;
    this.boostLatch = boosting;
    this.boosting = boosting;
    this.redline = boosting && this.boost < 0.1;
    if (I.throttle > 0 && !dead) force = T.engine * pw * I.throttle * (1 - Math.min(Math.max(speed, 0) / (T.topSpeed * (0.7 + 0.3 * health) * this.power * (boosting ? 1.25 : 1)), 1) ** 2);
    // gearbox: rpm follows the road speed in gear (or revs freely in the air); force follows the torque curve
    const g = this.gear, ratio = T.gears[g - 1] * T.final;
    const wheelRpm = Math.abs(speed) / T.radius * 60 / (2 * Math.PI);
    const inAir = this.contacts === 0;
    const target = inAir ? T.idle + (T.redline - T.idle) * I.throttle : Math.max(T.idle, wheelRpm * ratio);
    this.rpm += (Math.min(T.redline + 200, target) - this.rpm) * Math.min(1, dt * (inAir ? 6 : 25));
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (!inAir && speed > 0.5) {
      if (this.rpm > T.upshift && g < T.gears.length && I.throttle > 0) { this.gear++; this.shiftT = T.shiftTime; }
      else if (this.rpm < T.downshift && g > 1) { this.gear--; this.shiftT = T.shiftTime * 0.4; }
    }
    if (speed < 2 && g > 1 && !inAir) this.gear = 1;
    const gearPull = 0.85 + 0.45 * (T.gears[g - 1] - T.gears[T.gears.length - 1]) / (T.gears[0] - T.gears[T.gears.length - 1]);
    force *= torqueCurve(this.rpm) * gearPull * (this.shiftT > 0 ? 0.15 : 1);
    // bouncing off the limiter
    if (this.rpm > T.redline && !boosting) force *= 0.3;
    if (boosting) {
      force += T.boost * (0.6 + 0.4 * health);
      const before = this.boost;
      this.boost = Math.max(0, this.boost - dt * 0.22);
      // running the tank dry at full boost: one in five engines lets go
      if (before > 0 && this.boost === 0) {
        this.boostLatch = false;
        if (this.damage && (this.forceBlow || Math.random() < 0.2)) this.damage.blowEngine();
      }
    } else this.boost = Math.min(1, this.boost + dt * 0.05);
    if (I.brake > 0) {
      if (speed > 1) brake = T.brake * I.brake;
      else force = -T.reverse * I.brake;
    }
    if (frozen) { force = 0; brake = 60; }
    if (dead && I.brake > 0) { force = 0; brake = T.brake * I.brake; }
    // drive and brakes split by the layout; a bare hub gets no drive (its share goes to the wheels still on)
    const L = this.layout, lost = this.lostWheels, H = T.hub;
    let driveAll = 0, driveSum = 0;
    for (let i = 0; i < this.nWheels; i++) { driveAll += L[i].drive; if (!lost.has(i)) driveSum += L[i].drive; }
    for (let i = 0; i < this.nWheels; i++) {
      const hub = lost.has(i);
      vc.setWheelEngineForce(i, hub || !driveSum ? 0 : force * L[i].drive * driveAll / driveSum);
      vc.setWheelBrake(i, hub ? H.drag : brake * L[i].brake + (L[i].hand ? I.hand * 40 : 0));
      if (!hub) vc.setWheelSideFrictionStiffness(i, L[i].hand && I.hand ? 0.45 : T.side);
    }
    // rolling resistance and engine braking when coasting, a little more for a wreck; loose ground drags
    const loose = this.surface;
    if (!frozen && (dead ? !(I.brake > 0) : !I.throttle && !I.brake)) {
      const eb = dead ? 7 : 3 + 5 * (this.rpm / T.redline) * (T.gears[this.gear - 1] / 1.5);
      for (let i = 0; i < this.nWheels; i++) if (!lost.has(i)) vc.setWheelBrake(i, eb + loose * 4);
    }
    // grip: full on the track, less on loose ash and gravel, almost none on a bare hub
    for (let i = 0; i < this.nWheels; i++) if (!lost.has(i)) vc.setWheelFrictionSlip(i, T.friction * (1 - (1 - T.looseGrip) * loose));
    vc.updateVehicle(dt, undefined, RAY_GROUND);
    this.suspensionExtras(dt);
    // air drag, opposite the motion and growing with the square of the speed
    if (spd > 1) { const k = -T.drag * spd * dt; this.body.applyImpulse({ x: v.x * k, y: v.y * k * 0.3, z: v.z * k }, true); }

    // arcade assists: air control, self-righting, downforce
    const q = this.body.rotation();
    const qq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qq);
    let contacts = 0;
    for (let i = 0; i < this.nWheels; i++) contacts += vc.wheelIsInContact(i) ? 1 : 0;
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
      // tyres dig into loose ground
      if (loose > 0 && spd > 1) { const k = -loose * 1500 * dt / spd; this.body.applyImpulse({ x: v.x * k, y: 0, z: v.z * k }, true); }
      // only past the free band, so the truck leans in corners and sits down on a missing wheel
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(qq);
      const roll = right.y, over = Math.sign(roll) * Math.max(0, Math.abs(roll) - T.rollFree);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qq);
      const k = over * T.rollAssist * dt;
      this.body.applyTorqueImpulse({ x: fwd.x * k, y: fwd.y * k, z: fwd.z * k }, true);
    }
  }

  // Ackermann steering: the inside front wheel turns tighter than the outside one, both about the rear axle
  steerWheels(steer) {
    const L = this.layout, vc = this.vc;
    const base = Math.abs(TUNE.wheelZf - TUNE.wheelZr), t = Math.tan(steer);
    for (let i = 0; i < this.nWheels; i++) {
      if (!L[i].steer) continue;
      const x = L[i].pos[0];
      // positive steer turns towards +x (left), so the +x wheel is on the inside
      vc.setWheelSteering(i, Math.abs(t) < 1e-4 ? steer : Math.atan(base / (base / t - x)));
    }
  }

  // What rapier's ray-cast suspension leaves out: bump stops at the end of the travel (rapier just clamps the
  // spring, so a big landing would sink the wheels into the ground until the body hit) and anti-roll bars
  // across each axle, both pushing on the chassis at the wheel's mounting point along the strut; and the drag
  // of a bare hub.
  suspensionExtras(dt) {
    const T = TUNE, vc = this.vc, L = this.layout, M = this.body.mass();
    const q = this.body.rotation();
    const up = _up2.set(0, 1, 0).applyQuaternion(_q.set(q.x, q.y, q.z, q.w));
    const min = T.rest - T.travel, start = min + T.bump;
    const sq = this.squash;
    const t = this.body.translation(), lv = this.body.linvel(), w = this.body.angvel();
    for (let i = 0; i < this.nWheels; i++) {
      if (!vc.wheelIsInContact(i)) { sq[i] = T.rest; continue; }
      // true spring length from the mount to the contact point, less the wheel (or bare hub)
      const hp = vc.wheelHardPoint(i), cp = vc.wheelContactPoint(i);
      sq[i] = (hp.x - cp.x) * up.x + (hp.y - cp.y) * up.y + (hp.z - cp.z) * up.z - vc.wheelRadius(i);
      if (sq[i] >= start) continue;
      const c = Math.min(start - sq[i], T.bump);
      // how fast this corner is moving along the strut right now (negative: squashing)
      _r.set(hp.x - t.x, hp.y - t.y, hp.z - t.z);
      const vel = _v.set(w.x, w.y, w.z).cross(_r).add(_s.set(lv.x, lv.y, lv.z)).dot(up);
      // Progressive, and hydraulic: it soaks up a landing instead of springing the truck back into the air, so
      // it pushes back only a little on the way out. Past the end of the travel it is a stiff stop.
      const pen = Math.max(0, min - sq[i]);
      let imp = M * dt * (vel < 0
        ? T.bumpRate * c * c + T.bumpDamp * -vel * Math.min(1, c / T.bump) + pen * (400 + 60 * -vel)
        : 0.15 * T.bumpRate * c * c);
      // never more than stops this corner's share of the truck in one step, so a stop can't fling it back up
      if (vel < 0) imp = Math.min(imp, (M / this.nWheels) * -vel + M * dt * 0.15 * T.bumpRate * c * c);
      this.push(i, up, Math.min(imp, T.maxForce * 2 * dt));
    }
    // a bare hub digs into the ground and drags that corner back, more the faster it goes
    for (const i of this.lostWheels) {
      if (!vc.wheelIsInContact(i)) continue;
      const cp = vc.wheelContactPoint(i);
      _r.set(cp.x - t.x, cp.y - t.y, cp.z - t.z);
      _v.set(w.x, w.y, w.z).cross(_r).add(_s.set(lv.x, lv.y, lv.z)).projectOnPlane(up);
      const sp = _v.length();
      if (sp < 0.3) continue;
      const imp = -Math.min(T.hub.plough * sp, T.hub.ploughMax * M * 9.81) * dt / sp;
      this.body.applyImpulseAtPoint({ x: _v.x * imp, y: _v.y * imp, z: _v.z * imp }, cp, true);
    }
    // anti-roll bars: a pair of wheels both on the ground, neither of them a bare hub
    for (let i = 0; i < this.nWheels; i++) {
      const j = L[i].mate;
      if (j < i || !L[i].arb || this.lostWheels.has(i) || this.lostWheels.has(j)) continue;
      if (!vc.wheelIsInContact(i) || !vc.wheelIsInContact(j)) continue;
      const f = L[i].arb * M * (sq[j] - sq[i]) * dt;
      this.push(i, up, f);
      this.push(j, up, -f);
    }
  }

  push(i, dir, imp) {
    const hp = this.vc.wheelHardPoint(i);
    this.body.applyImpulseAtPoint({ x: dir.x * imp, y: dir.y * imp, z: dir.z * imp }, hp, true);
  }

  // A torn-off tyre leaves the bare hub on a bent arm: that corner drops by the depth of the tyre and sags on the
  // weakened spring, and the hub ploughs and grinds instead of rolling, dragging that side back.
  loseWheel(i) {
    const H = TUNE.hub, vc = this.vc;
    if (this.lostWheels.has(i)) return;
    vc.setWheelRadius(i, H.radius);
    vc.setWheelSuspensionStiffness(i, TUNE.stiffness * H.spring);
    vc.setWheelSuspensionRestLength(i, TUNE.rest - H.bend);
    vc.setWheelFrictionSlip(i, H.grip);
    vc.setWheelSideFrictionStiffness(i, H.side);
    this.lostWheels.add(i);
    // show the hub and disc where the wheel was, so nothing seems to float on an invisible tyre
    for (const p of this.parts) {
      const w = p.wheels[i];
      if (!w || w.hub) continue;
      w.hub = new THREE.Group();
      w.hub.add(hubMesh(this.layout[i].pos[0]));
      w.pivot.add(w.hub);
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
    for (let i = 0; i < this.nWheels; i++) {
      const susp = vc.wheelSuspensionLength(i) ?? TUNE.rest;
      const steer = vc.wheelSteering(i) ?? 0;
      const rot = vc.wheelRotation(i) ?? 0;
      for (const p of this.parts) {
        const w = p.wheels[i];
        if (!w) continue;
        w.pivot.position.set(this.wheelPts[i][0], this.wheelPts[i][1] - susp, this.wheelPts[i][2]);
        w.pivot.rotation.y = steer;
        w.pivot.rotation.z = this.damage?.wheels[i].bent || 0;
        w.spin.rotation.x = rot;
        if (w.hub) w.hub.rotation.x = rot;
      }
      if (dust && !this.lostWheels.has(i) && vc.wheelIsInContact(i) && spd > 4 && Math.random() < (0.5 + spd / 60) * emitScale) {
        const cp = vc.wheelContactPoint(i);
        const side = Math.abs(vc.wheelSideImpulse(i) ?? 0);
        const kick = new THREE.Vector3(-v.x * 0.12 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, -v.z * 0.12 + (Math.random() - 0.5) * 2);
        dust.emit(new THREE.Vector3(cp.x, cp.y + 0.2, cp.z), kick, 0.6 + spd * 0.035 + side * 0.002, time);
      }
      if (this.skids && dt > 0) this.skidMark(i);
    }
  }

  // tyre marks from sideways slide at the contact patch, wheelspin off the line, locked brakes and the handbrake
  skidMark(i) {
    const vc = this.vc;
    const id = `${this.number}-${i}`;
    if (this.lostWheels.has(i) || !vc.wheelIsInContact(i)) { this.skids.add(id, null, null, 0); return; }
    const c = vc.wheelContactPoint(i);
    const cp = _p.set(c.x, c.y, c.z);
    const t = this.body.translation(), v = this.body.linvel(), w = this.body.angvel();
    _r.set(cp.x - t.x, cp.y - t.y, cp.z - t.z);
    _v.set(w.x, w.y, w.z).cross(_r).add(_s.set(v.x, v.y, v.z));
    const q = this.group.quaternion;
    _s.set(1, 0, 0).applyAxisAngle(_up, vc.wheelSteering(i) ?? 0).applyQuaternion(q);
    const slide = Math.abs(_v.dot(_s));
    const fwdSpd = Math.hypot(v.x, v.z);
    const I = this.input;
    let k = THREE.MathUtils.smoothstep(slide, 2.2, 7);
    if (i >= 2 && I.throttle > 0.8 && this.gear === 1 && fwdSpd < 13 && fwdSpd > 0.5 && !this.totaled) k = Math.max(k, 0.55 * (1 - fwdSpd / 13));
    if (I.brake > 0.6 && fwdSpd > 6) k = Math.max(k, 0.35);
    if (i >= 2 && I.hand && fwdSpd > 4) k = Math.max(k, 0.6);
    this.skids.add(id, cp, _s, k, this.surface > 0.5);
  }

  dispose() {
    this.damage?.dispose();
    this.phys.removeVehicleController(this.vc);
    this.phys.removeRigidBody(this.body);
    this.scene.remove(this.group);
  }
}
