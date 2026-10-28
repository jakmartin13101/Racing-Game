import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;
const WHEELS = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];

// Trophy-truck tune. Units: metres, kg, N.
const TUNE = {
  mass: 1650,
  half: { x: 0.98, y: 0.38, z: 2.45 },
  comY: -0.35,
  wheelX: 1.02, wheelY: -0.08, wheelZf: 1.62, wheelZr: -1.55,
  radius: 0.5, rest: 0.6, travel: 0.42,
  stiffness: 34, compression: 3.2, relaxation: 3.8, maxForce: 60000,
  friction: 2.6, side: 1.1,
  engine: 5200, boost: 3600, brake: 70, reverse: 2600,
  steerMax: 0.5, topSpeed: 52,
};

export class Game {
  constructor({ world, scene, camera, renderer, dust, M, params, mobile }) {
    Object.assign(this, { world, scene, camera, renderer, dust, M, params, mobile });
    this.focus = new THREE.Vector3();
    this.keys = {};
    this.input = { throttle: 0, brake: 0, steer: 0, hand: 0, boost: 0 };
    this.lap = { started: false, t: 0, best: null, cp: 0, done: false };
    this.boost = 1;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camVel = new THREE.Vector3();
  }

  async init() {
    await RAPIER.init();
    const w = this.world;
    this.phys = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.phys.timestep = 1 / 60;
    // heightfield: rapier wants column-major (rows = z, cols = x)
    const g = w.grid;
    const hf = new Float32Array(g * g);
    for (let iz = 0; iz < g; iz++) for (let ix = 0; ix < g; ix++) hf[iz + ix * g] = w.heights[iz * g + ix];
    const ground = this.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.phys.createCollider(RAPIER.ColliderDesc.heightfield(g - 1, g - 1, hf, { x: w.extent, y: 1, z: w.extent })
      .setFriction(0.9), ground);

    await this.loadVehicle();
    this.createVehicle();
    this.setupCheckpoints();
    this.bindInput();
    this.hud = {
      speed: document.getElementById('speed'), time: document.getElementById('time'), best: document.getElementById('best'),
      boost: document.getElementById('boostbar'), msg: document.getElementById('msg'), lap: document.getElementById('lap'),
    };
    this.photo = this.params.get('photo');
    const at = this.params.has('at') ? +this.params.get('at') : this.world.track.start;
    this.resetTo(at);
    this.accum = 0;
  }

  async loadVehicle() {
    const loader = new GLTFLoader();
    let root;
    try {
      const gltf = await loader.loadAsync(`${BASE}models/truck.glb`);
      root = gltf.scene;
    } catch (e) {
      console.warn('truck.glb missing, using placeholder', e);
      root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4.8), new THREE.MeshStandardMaterial({ color: 0x884422 }));
      body.name = 'body'; body.position.y = 0.5; root.add(body);
      for (const n of WHEELS) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 24).rotateZ(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0x111111 }));
        wh.name = n; root.add(wh);
      }
    }
    await applyTruckMaterials(root, this.renderer);
    this.car = new THREE.Group();
    this.car.add(root);
    this.wheels = WHEELS.map((n) => {
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
      return { pivot, spin, rest: pivot.position.clone() };
    });
    this.scene.add(this.car);
  }

  createVehicle() {
    const T = TUNE;
    const bd = RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.6);
    this.body = this.phys.createRigidBody(bd);
    const col = RAPIER.ColliderDesc.cuboid(T.half.x, T.half.y, T.half.z).setTranslation(0, 0.25, 0)
      .setMass(T.mass).setFriction(0.4).setRestitution(0.05);
    this.phys.createCollider(col, this.body);
    // cab collider so rolling over looks right
    this.phys.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.35, 0.9).setTranslation(0, 0.9, -0.1).setMass(120), this.body);
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

  setupCheckpoints() {
    const c = this.world.track.centre;
    this.cps = [];
    for (let i = 0; i < c.length; i += 150) this.cps.push(i);
    this.lastSafe = this.world.track.start;
  }

  trackIndexNear(p, hint) {
    const c = this.world.track.centre;
    let best = hint ?? 0, bd = Infinity;
    const scan = hint == null ? c.length : 80;
    for (let k = -scan; k <= scan; k++) {
      const i = (((hint ?? 0) + k) % c.length + c.length) % c.length;
      const d = (c[i][0] - p.x) ** 2 + (c[i][2] - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  resetTo(i) {
    this.resets = (this.resets || 0) + 1;
    const c = this.world.track.centre;
    const n = c.length;
    const p = c[i % n], q = c[(i + 4) % n];
    const yaw = Math.atan2(q[0] - p[0], q[2] - p[2]);
    const y = this.world.heightAt(p[0], p[2]) + 1.2;
    this.body.setTranslation({ x: p[0], y, z: p[2] }, true);
    const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.trackI = i % n;
    this.camPos.set(p[0] - Math.sin(yaw) * 9, y + 3.5, p[2] - Math.cos(yaw) * 9);
    this.camLook.set(p[0], y, p[2]);
  }

  bindInput() {
    addEventListener('keydown', (e) => { this.keys[e.code] = true; if (e.code === 'KeyR') this.resetTo(this.lastSafe); });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    if (this.mobile || matchMedia('(pointer: coarse)').matches) {
      const t = document.getElementById('touch');
      t.style.display = 'block';
      const bindBtn = (id, key) => {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[key] = true; });
        el.addEventListener('touchend', (e) => { e.preventDefault(); this.keys[key] = false; });
      };
      bindBtn('tl', 'ArrowLeft'); bindBtn('tr2', 'ArrowRight'); bindBtn('tb', 'ArrowDown'); bindBtn('tg', 'ArrowUp');
    }
  }

  readInput(dt) {
    const k = this.keys;
    let thr = (k.KeyW || k.ArrowUp) ? 1 : 0;
    let brk = (k.KeyS || k.ArrowDown) ? 1 : 0;
    let st = ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0);
    let hand = k.Space ? 1 : 0;
    let boost = (k.ShiftLeft || k.ShiftRight) ? 1 : 0;
    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      thr = Math.max(thr, gp.buttons[7]?.value || 0);
      brk = Math.max(brk, gp.buttons[6]?.value || 0);
      if (Math.abs(gp.axes[0]) > 0.12) st = -gp.axes[0];
      hand = Math.max(hand, gp.buttons[0]?.value || 0);
      boost = Math.max(boost, gp.buttons[1]?.value || 0);
    }
    if (this.params.has('auto')) { thr = 1; st = this.autoSteer(); }
    const I = this.input;
    I.throttle = thr; I.brake = brk; I.hand = hand; I.boost = boost;
    I.steer += (st - I.steer) * Math.min(1, dt * (st === 0 ? 6 : 4));
  }

  // simple pure-pursuit used by the attract/auto mode and screenshot runs
  autoSteer() {
    const c = this.world.track.centre;
    const t = this.body.translation();
    const look = c[(this.trackI + 22) % c.length];
    const q = this.body.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const to = new THREE.Vector3(look[0] - t.x, 0, look[2] - t.z).normalize();
    const cross = fwd.x * to.z - fwd.z * to.x;
    return THREE.MathUtils.clamp(-cross * 2.5, -1, 1);
  }

  step(dt) {
    const T = TUNE, I = this.input, vc = this.vc;
    const speed = vc.currentVehicleSpeed();
    const v = this.body.linvel();
    const spd = Math.hypot(v.x, v.y, v.z);
    // steering lock falls off with speed
    const steer = I.steer * T.steerMax * (1 - Math.min(spd / 70, 0.6));
    vc.setWheelSteering(0, steer);
    vc.setWheelSteering(1, steer);
    let force = 0, brake = 0;
    const boosting = I.boost && this.boost > 0.02 && I.throttle > 0;
    if (I.throttle > 0) force = T.engine * I.throttle * (1 - Math.min(Math.max(speed, 0) / (T.topSpeed * (boosting ? 1.25 : 1)), 1) ** 2);
    if (boosting) { force += T.boost; this.boost = Math.max(0, this.boost - dt * 0.22); }
    else this.boost = Math.min(1, this.boost + dt * 0.05);
    if (I.brake > 0) {
      if (speed > 1) brake = T.brake * I.brake;
      else force = -T.reverse * I.brake;
    }
    for (let i = 0; i < 4; i++) {
      vc.setWheelEngineForce(i, force * (i < 2 ? 0.4 : 0.6));
      vc.setWheelBrake(i, brake * (i < 2 ? 0.6 : 0.4) + (i >= 2 ? I.hand * 40 : 0));
      vc.setWheelSideFrictionStiffness(i, i >= 2 && I.hand ? 0.45 : T.side);
    }
    if (!I.throttle && !I.brake) for (let i = 0; i < 4; i++) vc.setWheelBrake(i, 4);
    vc.updateVehicle(dt);

    // arcade assists: air control, self-righting, downforce
    const q = this.body.rotation();
    const qq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qq);
    let contacts = 0;
    for (let i = 0; i < 4; i++) contacts += vc.wheelIsInContact(i) ? 1 : 0;
    this.contacts = contacts;
    const av = this.body.angvel();
    if (contacts === 0) {
      // in the air: level out gently and allow pitch/yaw input
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(qq);
      const corr = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).multiplyScalar(1600);
      corr.addScaledVector(right, (I.throttle - I.brake) * 900);
      corr.y += I.steer * 900;
      this.body.applyTorqueImpulse({ x: corr.x * dt, y: corr.y * dt, z: corr.z * dt }, true);
    } else {
      this.body.applyImpulse({ x: 0, y: -spd * spd * 0.9 * dt, z: 0 }, true);
      // anti-roll
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(qq);
      const roll = right.y;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qq);
      this.body.applyTorqueImpulse({ x: fwd.x * roll * 6000 * dt, y: fwd.y * roll * 6000 * dt, z: fwd.z * roll * 6000 * dt }, true);
    }
    if (up.y < 0.2 && spd < 3) { this.flipT = (this.flipT || 0) + dt; if (this.flipT > 2) { this.flipT = 0; this.resetTo(this.lastSafe); } }
    else this.flipT = 0;
    this.phys.step();
  }

  update(dt, time) {
    this.readInput(dt);
    if (this.photo) return this.photoCam();
    this.accum += dt;
    let n = 0;
    while (this.accum >= 1 / 60 && n++ < 4) { this.step(1 / 60); this.accum -= 1 / 60; }
    this.syncVisuals(dt, time);
    this.raceLogic(dt);
    this.chaseCam(dt);
    if (this.params.has('orbit')) {
      // ?orbit=dx,dy,dz[,fov] camera in the truck's local frame (x left, z forward), for beauty shots
      const [dx, dy, dz, fov = 40] = this.params.get('orbit').split(',').map(Number);
      const o = new THREE.Vector3(dx, dy, dz).applyQuaternion(this.car.quaternion).add(this.car.position);
      this.camera.position.copy(o);
      this.camera.lookAt(this.car.position.clone().add(new THREE.Vector3(0, 0.1, 0)));
      this.camera.fov = fov; this.camera.updateProjectionMatrix();
    }
  }

  syncVisuals(dt, time) {
    const t = this.body.translation(), q = this.body.rotation();
    this.car.position.set(t.x, t.y, t.z);
    this.car.quaternion.set(q.x, q.y, q.z, q.w);
    this.focus.copy(this.car.position);
    const vc = this.vc;
    const v = this.body.linvel();
    const spd = Math.hypot(v.x, v.z);
    this.wheels.forEach((w, i) => {
      if (!w) return;
      const susp = vc.wheelSuspensionLength(i) ?? TUNE.rest;
      w.pivot.position.set(this.wheelPts[i][0], this.wheelPts[i][1] - susp, this.wheelPts[i][2]);
      w.pivot.rotation.y = vc.wheelSteering(i) ?? 0;
      w.spin.rotation.x = vc.wheelRotation(i) ?? 0;
      if (vc.wheelIsInContact(i) && spd > 4 && Math.random() < 0.5 + spd / 60) {
        const cp = vc.wheelContactPoint(i);
        const side = Math.abs(vc.wheelSideImpulse(i) ?? 0);
        const kick = new THREE.Vector3(-v.x * 0.12 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, -v.z * 0.12 + (Math.random() - 0.5) * 2);
        this.dust.emit(new THREE.Vector3(cp.x, cp.y + 0.2, cp.z), kick, 0.6 + spd * 0.035 + side * 0.002, time);
      }
    });
  }

  raceLogic(dt) {
    const p = this.car.position;
    const near = this.trackIndexNear(p, this.trackI);
    const c = this.world.track.centre;
    const n = c.length;
    const prev = this.trackI;
    this.trackI = near.i;
    if (near.d < this.world.track.width * 0.6 && this.contacts >= 3 && !c[near.i][4]) this.lastSafe = near.i;
    // lava / out of bounds
    if (p.y < c[near.i][1] - 6 || (near.d > 220)) this.resetTo(this.lastSafe);
    const L = this.lap;
    const start = this.world.track.start;
    const rel = (i) => (i - start + n) % n;
    if (!L.started && this.input.throttle) { L.started = true; L.t = 0; L.max = 0; }
    if (L.started && !L.done) {
      L.t += dt;
      const r = rel(this.trackI);
      if (r > L.max && r - L.max < 200) L.max = r;
      if (L.max > n * 0.9 && rel(prev) > n * 0.9 && r < n * 0.1) {
        L.done = true;
        this.hud.msg.textContent = 'FINISH ' + fmt(L.t);
        L.best = L.best ? Math.min(L.best, L.t) : L.t;
        this.hud.best.textContent = 'BEST ' + fmt(L.best);
        setTimeout(() => { L.done = false; L.started = false; L.t = 0; this.hud.msg.textContent = ''; }, 5000);
      }
    }
    this.hud.time.textContent = fmt(L.t);
    window.__state = { i: this.trackI, t: L.t, resets: this.resets, max: L.max, y: p.y, done: L.done, best: L.best };
    const v = this.body.linvel();
    this.hud.speed.textContent = Math.round(Math.hypot(v.x, v.y, v.z) * 3.6);
    this.hud.boost.style.width = `${Math.round(this.boost * 100)}%`;
  }

  chaseCam(dt) {
    const q = this.car.quaternion;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    fwd.y *= 0.3; fwd.normalize();
    const v = this.body.linvel();
    const vel = new THREE.Vector3(v.x, 0, v.z);
    const spd = vel.length();
    // blend toward velocity direction when moving so drifts read well
    if (spd > 5) fwd.lerp(vel.normalize(), 0.35).normalize();
    const p = this.car.position;
    const dist = 7.6 + spd * 0.03;
    const desired = p.clone().addScaledVector(fwd, -dist);
    desired.y = Math.max(p.y + 2.5, this.world.heightAt(desired.x, desired.z) + 1.2);
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(desired, k);
    const look = p.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, 1.1, 0));
    this.camLook.lerp(look, 1 - Math.exp(-dt * 12));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const fov = 62 + Math.min(spd, 50) * 0.22 + (this.input.boost ? 4 : 0);
    this.camera.fov += (fov - this.camera.fov) * k;
    this.camera.updateProjectionMatrix();
  }

  photoCam() {
    if (this.photo.startsWith('cam:')) {
      const [x, y, z, lx, ly, lz] = this.photo.slice(4).split(',').map(Number);
      this.camera.position.set(x, this.world.heightAt(x, z) + y, z);
      this.camera.lookAt(lx, ly, lz);
      this.focus.set(x, this.world.heightAt(x, z), z);
      return;
    }
    // ?photo=index,side,height,dist,lookAhead  -> static framing of a track point
    const [i, side = 0, h = 3, d = 10, ahead = 20] = this.photo.split(',').map(Number);
    const c = this.world.track.centre;
    const n = c.length;
    const p = c[i % n], q = c[(i + ahead) % n], o = c[(i - 3 + n) % n];
    const dx = p[0] - o[0], dz = p[2] - o[2];
    const L = Math.hypot(dx, dz);
    const cam = new THREE.Vector3(p[0] - dx / L * d + (-dz / L) * side, 0, p[2] - dz / L * d + (dx / L) * side);
    cam.y = this.world.heightAt(cam.x, cam.z) + h;
    this.camera.position.copy(cam);
    this.camera.lookAt(q[0], this.world.heightAt(q[0], q[2]) + 1.5, q[2]);
    this.focus.set(p[0], p[1], p[2]);
    // keep the car parked where the photo is if requested
    const t = this.body.translation(), r = this.body.rotation();
    this.car.position.set(t.x, t.y, t.z); this.car.quaternion.set(r.x, r.y, r.z, r.w);
  }

  nearestLava(pos) {
    if (!this._lavaPts) {
      this._lavaPts = [];
      for (const r of this.world.track.rivers) for (let i = 0; i < r.points.length; i += 3) this._lavaPts.push(r.points[i]);
      const lk = this.world.track.lake;
      this._lavaPts.push([lk.x, lk.y, lk.z]);
    }
    let best = null, bd = Infinity;
    for (const p of this._lavaPts) {
      const d = (p[0] - pos.x) ** 2 + (p[2] - pos.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    const d = Math.sqrt(bd);
    return { pos: new THREE.Vector3(best[0], best[1] + 4, best[2]), strength: Math.max(0, 1 - d / 90) };
  }
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// Baked atlases from tools/truck/bake.py are bound here by material name.
async function applyTruckMaterials(root, renderer) {
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
  const mats = {
    body, wheel, glass,
    light_lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1dd, emissiveIntensity: 2.5 }),
    light_tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1608, emissiveIntensity: 1.6 }),
    light_lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25 }),
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const name = (o.material?.name || '').replace(/\.\d+$/, '');
    if (mats[name]) o.material = mats[name];
  });
}
