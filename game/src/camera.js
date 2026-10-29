import * as THREE from 'three';

export const CAMERAS = [
  { id: 'chase', name: 'Chase' },
  { id: 'far', name: 'Far chase' },
  { id: 'hood', name: 'Hood' },
  { id: 'bumper', name: 'Bumper' },
  { id: 'tv', name: 'Trackside TV' },
];

const fwd = new THREE.Vector3(), up = new THREE.Vector3(), vel = new THREE.Vector3(), tmp = new THREE.Vector3();

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
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
      fov = (this.mode === 'hood' ? 70 : 74) + Math.min(spd, 55) * 0.26 + (boosting ? 7 : 0);
    } else if (this.mode === 'tv') {
      cam.up.set(0, 1, 0);
      // pick a trackside spot ahead of the truck and hold it until the truck has passed
      const n = track.n;
      const ahead = (s) => (track.closed ? ((s - trackI) % n + n) % n : s - trackI);
      if (!this.tvSpot || ahead(this.tvSpot.i) < -25 || p.distanceTo(this.tvSpot.pos) > 140) {
        const i = track.wrap(trackI + 70);
        const f = track.frame(i);
        const side = (Math.floor(i / 97) % 2 ? 1 : -1) * (track.width / 2 + 9);
        const x = f.x + f.nx * side, z = f.z + f.nz * side;
        this.tvSpot = { i, pos: new THREE.Vector3(x, this.world.heightAt(x, z) + 4.5, z) };
      }
      cam.position.copy(this.tvSpot.pos);
      this.look.lerp(tmp.copy(p).add(new THREE.Vector3(0, 0.8, 0)), this.snap ? 1 : 1 - Math.exp(-dt * 8));
      cam.lookAt(this.look);
      const d = cam.position.distanceTo(p);
      fov = THREE.MathUtils.clamp(2 * Math.atan(9 / d) * 180 / Math.PI, 14, 60);
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
      const dist = (far ? 11.5 : 7.2) + spd * 0.045 + (boosting ? 0.6 : 0);
      const height = (far ? 4.2 : 2.5) - Math.min(spd, 50) * 0.008;
      const desired = p.clone().addScaledVector(fwd, -dist);
      desired.y = Math.max(p.y + height, this.world.heightAt(desired.x, desired.z) + 1.2);
      this.pos.lerp(desired, k);
      const look = p.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, far ? 1.4 : 1.1, 0));
      this.look.lerp(look, this.snap ? 1 : 1 - Math.exp(-dt * 12));
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      fov = (far ? 56 : 59) + Math.min(spd, 55) * 0.34 + (boosting ? 8 : 0);
    }
    // shake: road speed, crashes, and the engine straining in the last of the boost
    this.kick = Math.max(0, (this.kick || 0) - dt * 1.6);
    const amp = Math.max(0, spd - 18) * 0.0011 + (v.redline ? 0.075 : 0) + this.kick * 0.35;
    if (amp > 0) {
      const r = () => (Math.random() - 0.5) * 2;
      cam.position.add(tmp.set(r() * amp, r() * amp, r() * amp));
      cam.rotateZ(r() * amp * (v.redline ? 0.25 : 0.08));
    }
    cam.fov += (fov - cam.fov) * (this.snap ? 1 : k);
    cam.updateProjectionMatrix();
    this.snap = false;
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
