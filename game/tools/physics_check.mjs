// Headless checks of the truck's suspension and lost-wheel behaviour on flat ground, using the game's own
// Vehicle class with a stand-in model. Run from game/: node tools/physics_check.mjs
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vehicle, TUNE } from '../src/vehicle.js';

await RAPIER.init();

function rig(y = 1.6, opts = {}) {
  const phys = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  phys.timestep = 1 / 60;
  // flat ground on the ground collision group, plus an optional ramp
  const g = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  phys.createCollider(RAPIER.ColliderDesc.cuboid(2000, 1, 2000).setTranslation(0, -1, 0).setCollisionGroups((1 << 16) | 0xffff), g);
  if (opts.bump) phys.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.15, 0.4).setTranslation(-3.5, 0.15, 60).setCollisionGroups((1 << 16) | 0xffff), g);
  const model = new THREE.Group();
  for (const n of ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR']) { const o = new THREE.Group(); o.name = n; model.add(o); }
  const mat = new THREE.MeshStandardMaterial();
  const v = new Vehicle({ phys, scene: new THREE.Scene(), assets: { full: model, lod: model, mats: { body: mat } }, lodOnly: true });
  v.place(0, y, 0, 0);
  return { phys, v };
}
const run = (r, n, each) => { for (let s = 0; s < n; s++) { r.v.step(1 / 60); r.phys.step(); r.v.sync(1 / 60, s / 60); each?.(s); } };
const corners = (v) => v.wheelPts.map((p) => new THREE.Vector3(p[0], -0.13, p[2]).applyMatrix4(v.group.matrixWorld).y);
const len = (v) => v.wheelPts.map((_, i) => v.vc.wheelSuspensionLength(i).toFixed(3)).join(' ');
const out = [];

// 1. settle: ride height and static sag
{
  const r = rig(); run(r, 240);
  r.v.group.updateMatrixWorld();
  out.push(`settled: body y ${r.v.body.translation().y.toFixed(3)}, spring lengths ${len(r.v)}, mass ${r.v.body.mass().toFixed(0)} kg`);
}
// 2. droop: lift the truck clear and see the wheels hang to full droop
{
  const r = rig(); run(r, 240);
  r.v.body.setTranslation({ x: 0, y: 4, z: 0 }, true); r.v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  run(r, 2);
  out.push(`airborne: contacts ${r.v.contacts}, spring lengths ${len(r.v)} (rest ${TUNE.rest})`);
}
// 3. drops: deepest compression, whether the body touched the ground, how fast it settles
for (const h of [1, 3, 8, 20]) {
  const r = rig(h + 1.2); let minL = 9, minBody = 9, settle = 0, prevY = 0, peak = 0;
  run(r, 600, (s) => {
    for (let i = 0; i < 4; i++) if (r.v.vc.wheelIsInContact(i)) minL = Math.min(minL, r.v.squash?.[i] ?? r.v.vc.wheelSuspensionLength(i));
    r.v.group.updateMatrixWorld(); minBody = Math.min(minBody, ...corners(r.v));
    const y = r.v.body.translation().y; if (Math.abs(y - prevY) > 0.002) settle = s; prevY = y;
    if (minL < 9 && s > 0) peak = Math.max(peak, y);
  });
  out.push(`${h} m drop: shortest spring ${minL.toFixed(3)} (end of travel ${(TUNE.rest - TUNE.travel).toFixed(2)}), lowest body corner ${minBody.toFixed(3)} m, settled after ${(settle / 60).toFixed(2)} s`);
}
// 4. steady turn: body roll
{
  const r = rig(); run(r, 120);
  r.v.input.throttle = 1; run(r, 360);
  r.v.input.throttle = 0.35; r.v.input.steer = 0.5; let roll = 0;
  run(r, 240, () => { const right = new THREE.Vector3(1, 0, 0).applyQuaternion(r.v.group.quaternion); roll = Math.max(roll, Math.abs(Math.asin(right.y))); });
  out.push(`half-lock turn at ${r.v.speed().toFixed(1)} m/s: peak body roll ${(roll * 57.3).toFixed(1)} deg`);
}
// 4b. full lock at speed, then flick the other way: does it stay on its wheels?
{
  const r = rig(); run(r, 60); r.v.input.throttle = 1; run(r, 420); const sp = r.v.speed();
  let minUp = 1; r.v.input.steer = 1; run(r, 90, () => { minUp = Math.min(minUp, r.v.up); });
  r.v.input.steer = -1; run(r, 120, () => { minUp = Math.min(minUp, r.v.up); });
  out.push(`flick at ${sp.toFixed(1)} m/s: lowest up ${minUp.toFixed(2)} (1 = level, 0 = on its side)`);
}
// 5. lose the front-left wheel parked, then while driving
for (const drive of [0, 1]) {
  const r = rig(); run(r, 240);
  r.v.group.updateMatrixWorld(); const before = corners(r.v);
  r.v.input.throttle = drive; run(r, drive ? 300 : 120);
  const v0 = r.v.body.translation();
  r.v.loseWheel(0);
  const sp0 = r.v.speed();
  run(r, 240);
  r.v.group.updateMatrixWorld(); const after = corners(r.v);
  const v1 = r.v.body.translation();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(r.v.group.quaternion);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(r.v.group.quaternion);
  out.push(`${drive ? 'driving' : 'parked'}, front-left tyre lost: corner drops FL ${(before[0] - after[0]).toFixed(3)} FR ${(before[1] - after[1]).toFixed(3)} RL ${(before[2] - after[2]).toFixed(3)} RR ${(before[3] - after[3]).toFixed(3)} m, roll ${(Math.asin(right.y) * 57.3).toFixed(1)} deg, pitch ${(Math.asin(fwd.y) * 57.3).toFixed(1)} deg` +
    (drive ? `, heading drift ${(Math.atan2(fwd.x, fwd.z) * 57.3).toFixed(1)} deg over ${Math.hypot(v1.x - v0.x, v1.z - v0.z).toFixed(0)} m, ${sp0.toFixed(1)} -> ${r.v.speed().toFixed(1)} m/s` : ''));
}
// 6. hit a 30 cm kerb on one side at speed
{
  const r = rig(1.6, { bump: true }); run(r, 60); r.v.input.throttle = 1; let maxRoll = 0, minL = 9;
  run(r, 300, () => { const right = new THREE.Vector3(1, 0, 0).applyQuaternion(r.v.group.quaternion); maxRoll = Math.max(maxRoll, Math.abs(Math.asin(right.y))); for (let i = 0; i < 4; i++) if (r.v.vc.wheelIsInContact(i)) minL = Math.min(minL, r.v.squash?.[i] ?? r.v.vc.wheelSuspensionLength(i)); });
  out.push(`one-side kerb: peak roll ${(maxRoll * 57.3).toFixed(1)} deg, shortest spring ${minL.toFixed(3)}, up ${r.v.up.toFixed(2)}`);
}
console.log(out.join('\n'));
