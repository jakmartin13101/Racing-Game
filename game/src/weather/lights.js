import * as THREE from 'three';

// Truck lights for the dark and the murk: glowing headlamps and a roof light bar on every truck, tail lights
// that flare under braking, a pool of light thrown on the road ahead of each AI truck, and real spotlights
// for the player's truck. The spotlights stay in the scene all the time (dimmed to zero when off), so turning
// them on never changes the light count and never recompiles a shader.

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

function poolTexture() {
  // a long oval of light, brightest a few metres ahead and fading out down the road
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  const img = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = (x - 31.5) / 32, v = y / 127;
    const w = 0.35 + v * 0.65;
    const k = Math.max(0, 1 - (u / w) ** 2) * Math.sin(Math.PI * Math.min(1, v * 1.25)) ** 0.7 * (1 - v) ** 0.6;
    const o = (y * 64 + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(255 * Math.min(1, k * 1.3));
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
}

// where the lamps sit on the trophy truck (local space, +z forward)
const HEAD = [[0.62, 0.42, 2.42], [-0.62, 0.42, 2.42]];
const BAR = [[0.45, 1.42, 0.72], [0.15, 1.42, 0.74], [-0.15, 1.42, 0.74], [-0.45, 1.42, 0.72]];
const TAIL = [[0.7, 0.55, -2.45], [-0.7, 0.55, -2.45]];

export class TruckLights {
  constructor(scene) {
    this.scene = scene;
    const glow = glowTexture();
    this.headMat = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1, 0.93, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.tailMat = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1, 0.06, 0.02), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: new THREE.Color(1, 0.9, 0.75), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.poolMat.userData.noWeather = true;
    this.poolGeo = new THREE.PlaneGeometry(9, 26).rotateX(-Math.PI / 2).translate(0, 0, 14.5);
    // the player's lamps: a wide low beam and a long roof-bar beam
    this.spots = [new THREE.SpotLight(0xfff0d8, 0, 70, 0.62, 0.55, 1.4), new THREE.SpotLight(0xffffff, 0, 130, 0.32, 0.6, 1.2)];
    this.targets = this.spots.map(() => new THREE.Object3D());
    this.spots.forEach((s, i) => { s.target = this.targets[i]; scene.add(s, this.targets[i]); });
    this.trucks = [];
    this.level = 0;
    this.m4 = new THREE.Matrix4();
    this.v = new THREE.Vector3();
    this.d = new THREE.Vector3();
  }

  // the race's trucks; the player's gets the spotlights
  attach(vehicles, player) {
    this.detach();
    for (const v of vehicles) {
      const g = new THREE.Group();
      g.name = 'truck-lights';
      const heads = [...HEAD, ...BAR].map((p, i) => { const s = new THREE.Sprite(this.headMat); s.position.set(...p); s.userData.bar = i >= 2; g.add(s); return s; });
      const tails = TAIL.map((p) => { const s = new THREE.Sprite(this.tailMat.clone()); s.position.set(...p); g.add(s); return s; });
      let pool = null;
      if (v !== player) { pool = new THREE.Mesh(this.poolGeo, this.poolMat); pool.position.y = -0.4; pool.renderOrder = 2; g.add(pool); }
      g.visible = false;
      v.group.add(g);
      this.trucks.push({ v, g, heads, tails, pool });
    }
    this.player = player;
  }

  detach() {
    for (const t of this.trucks) t.v.group.remove(t.g);
    this.trucks = [];
    this.player = null;
    for (const s of this.spots) s.intensity = 0;
  }

  // level: 0 off, 1 full night; fogK thickens the glow halos
  update(level, fogK = 0, cam = null) {
    this.level = level;
    const on = level > 0.02;
    for (const t of this.trucks) {
      const alive = !t.v.totaled && !t.v.damage?.blown;
      t.g.visible = on && alive;
      if (!t.g.visible) continue;
      // lamps only glare towards where they point: headlamps from in front, tail lights from behind
      let front = 0;
      if (cam) { this.v.set(0, 0, 1).applyQuaternion(t.v.group.quaternion); front = this.v.dot(this.d.copy(cam).sub(t.v.group.position).normalize()); }
      const fk = THREE.MathUtils.smoothstep(front, -0.15, 0.6), bk = THREE.MathUtils.smoothstep(-front, -0.3, 0.4);
      const hs = 0.55 + fogK * 0.5;
      for (const s of t.heads) { s.scale.setScalar((s.userData.bar ? 0.5 : hs) * (0.7 + level * 0.5) * fk); s.visible = fk > 0.01; }
      const brake = t.v.input.brake > 0.1 && t.v.speed() > 1 ? 1 : 0;
      for (const s of t.tails) { s.scale.setScalar((0.16 + brake * 0.14) * (0.4 + 0.6 * bk)); s.material.color.setRGB(1, 0.05, 0.02).multiplyScalar(1.2 + brake * 2.5); }
      if (t.pool) t.pool.material.opacity = 0.35 * level;
    }
    this.headMat.color.setRGB(1, 0.93, 0.8).multiplyScalar(2 + level * 3);
    // the player's beams follow the truck
    const p = this.player;
    const sOn = on && p && !p.totaled;
    this.spots[0].intensity = sOn ? 260 * level : 0;
    this.spots[1].intensity = sOn ? 420 * level : 0;
    if (p) {
      p.group.updateMatrixWorld();
      const m = p.group.matrixWorld;
      this.spots[0].position.set(0, 0.5, 2.3).applyMatrix4(m);
      this.targets[0].position.set(0, -1.2, 16).applyMatrix4(m);
      this.spots[1].position.set(0, 1.45, 0.8).applyMatrix4(m);
      this.targets[1].position.set(0, -0.5, 40).applyMatrix4(m);
      for (const o of this.targets) o.updateMatrixWorld();
    }
  }
}
