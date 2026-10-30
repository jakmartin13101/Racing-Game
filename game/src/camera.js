import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const CAMERAS = [
  { id: 'chase', name: 'Chase' },
  { id: 'far', name: 'Far chase' },
  { id: 'hood', name: 'Hood' },
  { id: 'bumper', name: 'Bumper' },
  { id: 'tv', name: 'Trackside TV' },
];

const fwd = new THREE.Vector3(), up = new THREE.Vector3(), vel = new THREE.Vector3(), tmp = new THREE.Vector3(), aim = new THREE.Vector3();
const RAY_SOLID = (0xffff << 16) | 0x0001; // terrain, buildings and rocks; not trucks or debris
const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

export class CameraRig {
  constructor(camera, world, phys) {
    this.camera = camera;
    this.world = world;
    this.phys = phys;
    this.mode = 'chase';
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.tvSpot = null;
  }

  setMode(id) { this.mode = id; this.snap = true; this.tvSpot = null; }
  // a knock to the camera, e.g. from a crash; decays quickly
  bump(a) { this.kick = Math.min(0.5, (this.kick || 0) + a); }
  // slow-motion wreck shot from beside the bonnet
  cinematic(on) { this.cine = on ? { a: Math.random() < 0.5 ? 0.9 : -0.9 } : null; if (!on) this.snap = true; }
  // the crater leap: a run of shots across the flight, chosen by how far through it the truck is
  leapShot(L, crater) { this.leapL = L ? { L, crater, shot: -1 } : null; this.snap = true; }
  next() {
    const i = CAMERAS.findIndex((c) => c.id === this.mode);
    this.setMode(CAMERAS[(i + 1) % CAMERAS.length].id);
    return CAMERAS[(i + 1) % CAMERAS.length];
  }

  update(dt, v, track, trackI, boosting) {
    const cam = this.camera;
    const g = v.group;
    const q = g.quaternion;
    const p = g.position;
    const lv = v.body.linvel();
    vel.set(lv.x, 0, lv.z);
    const spd = vel.length();
    let fov = 62;
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 6);
    // in-car views show the truck's own detail; outside views hide nothing
    if (this.cine) {
      cam.up.set(0, 1, 0);
      this.cine.a += dt * 0.35;
      const yaw = Math.atan2(fwd.set(0, 0, 1).applyQuaternion(q).x, fwd.z);
      const a = yaw + this.cine.a;
      const pos = tmp.set(p.x + Math.sin(a) * 6.5, 0, p.z + Math.cos(a) * 6.5);
      pos.y = Math.max(p.y + 1.4, this.world.heightAt(pos.x, pos.z) + 1);
      cam.position.copy(pos);
      this.look.copy(p).addScaledVector(fwd.set(Math.sin(yaw), 0, Math.cos(yaw)), 1.5).add(up.set(0, 1.2, 0));
      cam.lookAt(this.look);
      cam.fov = 48; cam.updateProjectionMatrix();
      return;
    }
    if (this.leapL) { this.leapCam(dt, p); return; }
    if (this.mode === 'inspect') {
      // debug: fixed three-quarter view of the truck, angle from ?ia=
      const ia = +(new URLSearchParams(location.search).get('ia') || 0.8);
      const yaw = Math.atan2(fwd.set(0, 0, 1).applyQuaternion(q).x, fwd.z) + ia;
      cam.up.set(0, 1, 0);
      cam.position.set(p.x + Math.sin(yaw) * 6, p.y + 2.2, p.z + Math.cos(yaw) * 6);
      cam.lookAt(p.x, p.y + 0.4, p.z);
      cam.fov = 45; cam.updateProjectionMatrix();
      return;
    }
    if (this.mode === 'top') {
      // debug: straight down from above the truck
      cam.up.set(0, 0, -1);
      cam.position.set(p.x, p.y + 140, p.z + 0.01);
      cam.lookAt(p.x, p.y, p.z);
      cam.fov = 50; cam.updateProjectionMatrix();
      return;
    }
    if (this.mode === 'hood' || this.mode === 'bumper') {
      const local = this.mode === 'hood' ? [0, 1.55, 1.7] : [0, 0.75, 2.75];
      const lookL = this.mode === 'hood' ? [0, 1.3, 14] : [0, 0.75, 12];
      const target = tmp.set(...local).applyQuaternion(q).add(p);
      this.pos.lerp(target, this.snap ? 1 : 1 - Math.exp(-dt * 30));
      const la = new THREE.Vector3(...lookL).applyQuaternion(q).add(p);
      this.look.lerp(la, this.snap ? 1 : 1 - Math.exp(-dt * 18));
      cam.position.copy(this.pos);
      up.set(0, 1, 0).applyQuaternion(q).lerp(new THREE.Vector3(0, 1, 0), 0.6).normalize();
      cam.up.copy(up);
      cam.lookAt(this.look);
      fov = (this.mode === 'hood' ? 68 : 72) + Math.min(spd, 60) * 0.34 + (boosting ? 10 : 0);
    } else if (this.mode === 'tv') {
      cam.up.set(0, 1, 0);
      // pick a trackside spot ahead of the truck and hold it until the truck has passed, or the view is blocked
      const n = track.n;
      const ahead = (s) => (track.closed ? ((s - trackI) % n + n) % n : s - trackI);
      aim.copy(p).y += 0.9;
      if (this.tvSpot) this.tvBlocked = this.blocked(this.tvSpot.pos, aim) ? (this.tvBlocked || 0) + dt : 0;
      if (!this.tvSpot || ahead(this.tvSpot.i) < -25 || p.distanceTo(this.tvSpot.pos) > 130 || this.tvBlocked > 0.25) {
        this.tvSpot = this.pickTv(track, trackI, aim) || this.tvSpot;
        this.tvBlocked = 0;
        this.snap = true;
      }
      cam.position.copy(this.tvSpot.pos);
      // aim leads the truck slightly so a fast pass never leaves the frame
      tmp.set(vel.x, 0, vel.z).multiplyScalar(0.12).add(p); tmp.y += 0.8;
      this.look.lerp(tmp, this.snap ? 1 : 1 - Math.exp(-dt * 14));
      cam.lookAt(this.look);
      const d = cam.position.distanceTo(p);
      fov = THREE.MathUtils.clamp(2 * Math.atan(10 / d) * 180 / Math.PI + Math.min(spd, 40) * 2.5 / Math.max(d, 8), 16, 66);
      cam.fov = fov; cam.updateProjectionMatrix();
      this.snap = false;
      return;
    } else {
      cam.up.set(0, 1, 0);
      fwd.set(0, 0, 1).applyQuaternion(q);
      fwd.y *= 0.3; fwd.normalize();
      // blend toward velocity direction when moving so drifts read well
      if (spd > 5) fwd.lerp(vel.clone().normalize(), 0.35).normalize();
      const far = this.mode === 'far';
      // pulls back and drops a little as the speed builds
      const dist = (far ? 11.5 : 7.0) + spd * 0.05 + (boosting ? 1.6 : 0);
      const height = (far ? 4.2 : 2.5) - Math.min(spd, 50) * 0.014;
      const desired = p.clone().addScaledVector(fwd, -dist);
      desired.y = Math.max(p.y + height, this.world.heightAt(desired.x, desired.z) + 1.2);
      this.pos.lerp(desired, k);
      const look = p.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, far ? 1.4 : 1.1, 0));
      this.look.lerp(look, this.snap ? 1 : 1 - Math.exp(-dt * 12));
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      fov = (far ? 55 : 57) + Math.min(spd, 60) * 0.42 + (boosting ? 13 : 0);
    }
    // shake: road speed, crashes, and the engine straining in the last of the boost
    this.kick = Math.max(0, (this.kick || 0) - dt * 1.6);
    // in the last 10% of the boost the whole frame judders, a slow lurch plus a fast rattle
    this.shakeT = (this.shakeT || 0) + dt;
    const rl = v.redline ? 1 : 0;
    const amp = Math.max(0, spd - 15) * 0.0016 + rl * 0.2 + this.kick * 0.4;
    if (amp > 0) {
      const r = () => (Math.random() - 0.5) * 2;
      const T = this.shakeT;
      cam.position.add(tmp.set(r() * amp + rl * Math.sin(T * 23) * 0.12, r() * amp + rl * Math.sin(T * 31) * 0.1, r() * amp * 0.5));
      cam.rotateZ(r() * amp * 0.08 + rl * (Math.sin(T * 17) * 0.035 + r() * 0.03));
      cam.rotateX(rl * (Math.sin(T * 27) * 0.02 + r() * 0.015));
    }
    fov += rl * Math.sin(this.shakeT * 13) * 2.5;
    cam.fov += (fov - cam.fov) * (this.snap ? 1 : k);
    cam.updateProjectionMatrix();
    this.snap = false;
  }

  leapCam(dt, p) {
    const cam = this.camera, S = this.leapL, L = S.L;
    cam.up.set(0, 1, 0);
    const u = THREE.MathUtils.clamp(L.t / L.T, 0, 1);
    const dir = new THREE.Vector3(L.to.x - L.from.x, 0, L.to.z - L.from.z).normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const shot = u < 0.32 ? 0 : u < 0.68 ? 1 : 2;
    // the first shot eases in from the chase camera, so the take-off reads as one move; later shots are cuts
    const cut = S.shot >= 0 && shot !== S.shot;
    const first = S.shot < 0 || (S.shot === 0 && L.t < 0.6);
    S.shot = shot;
    let want, look, fov;
    if (shot === 0) {
      // alongside as it leaves the lip
      want = tmp.copy(p).addScaledVector(side, 13).addScaledVector(dir, 6).add(up.set(0, 0.5, 0));
      look = aim.copy(p);
      fov = 58;
    } else if (shot === 1) {
      // high on the other side, looking down past the truck at the lava lake and the fountains coming up at it
      want = tmp.copy(p).addScaledVector(side, -17).addScaledVector(dir, -5).add(up.set(0, 9, 0));
      look = aim.copy(p).addScaledVector(dir, 4).add(up.set(0, -14, 0));
      fov = 66;
    } else {
      // over the shoulder onto the landing
      want = tmp.copy(p).addScaledVector(dir, -15).add(up.set(0, 6.5, 0));
      look = aim.copy(p).addScaledVector(dir, 24).add(up.set(0, -4, 0));
      fov = 64;
    }
    if (cut) { this.pos.copy(want); this.look.copy(look); } else {
      this.pos.lerp(want, 1 - Math.exp(-dt * (first ? 4 : 10)));
      this.look.lerp(look, 1 - Math.exp(-dt * (first ? 6 : 14)));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    cam.fov = cut ? fov : cam.fov + (fov - cam.fov) * (1 - Math.exp(-dt * 5)); cam.updateProjectionMatrix();
  }

  // terrain, buildings or rocks between a and b
  blocked(a, b) {
    const d = tmp.subVectors(b, a); const L = d.length();
    if (L < 1) return false;
    d.divideScalar(L);
    // the heightfield first: cheap, and it catches hills
    for (let k = 1; k < 10; k++) {
      const f = k / 10, x = a.x + d.x * L * f, z = a.z + d.z * L * f;
      if (this.world.heightAt(x, z) > a.y + d.y * L * f - 0.3) return true;
    }
    if (!this.phys) return false;
    ray.origin = { x: a.x, y: a.y, z: a.z }; ray.dir = { x: d.x, y: d.y, z: d.z };
    return !!this.phys.castRay(ray, L - 2.5, true, undefined, RAY_SOLID);
  }

  // try trackside spots ahead, both sides, low then high; the first clear view of the truck wins
  pickTv(track, trackI, aim) {
    const pref = Math.floor(trackI / 97) % 2 ? 1 : -1;
    for (const [lead, side, h] of [[70, pref, 4.5], [70, -pref, 4.5], [50, pref, 5], [50, -pref, 5], [90, pref, 8], [35, -pref, 7], [70, pref, 12], [25, pref, 9]]) {
      const i = track.wrap(trackI + lead);
      const f = track.frame(i);
      const off = side * (track.width / 2 + 9);
      const x = f.x + f.nx * off, z = f.z + f.nz * off;
      const pos = new THREE.Vector3(x, this.world.heightAt(x, z) + h, z);
      if (pos.distanceTo(aim) > 120) continue;
      // check the truck now and the point it is heading to
      const fr = track.frame(track.wrap(trackI + lead * 0.6));
      const mid = new THREE.Vector3(fr.x, this.world.heightAt(fr.x, fr.z) + 1, fr.z);
      if (!this.blocked(pos, aim) && !this.blocked(pos, mid)) return { i, pos };
    }
    // nothing clear: hang above and behind the truck so it is always visible
    const f = track.frame(track.wrap(trackI - 8));
    return { i: track.wrap(trackI + 30), pos: new THREE.Vector3(f.x, aim.y + 14, f.z) };
  }

  // slow orbit around a point, for menus
  orbit(dt, t, centre, radius, height) {
    const cam = this.camera;
    cam.up.set(0, 1, 0);
    const a = t * 0.035;
    const x = centre.x + Math.cos(a) * radius, z = centre.z + Math.sin(a) * radius;
    cam.position.set(x, Math.max(this.world.heightAt(x, z) + 30, centre.y + height), z);
    cam.lookAt(centre.x, centre.y + 120, centre.z);
    cam.fov = 50; cam.updateProjectionMatrix();
  }
}
