import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadPropModels, makePlacer } from '../../props.js';
import { G_GROUND, clamp, mulberry, canvasTex, glowTexture, basaltMaterial } from './util.js';
import { roadSign } from './crossings.js';

// The ranger station at the line: a board-and-batten ranger hut with a green tin roof and a lanai, on a level pad
// held up by a dry-stacked basalt wall, a lookout deck with a pipe railing over the lava plain, the barricade that
// closes the road (ROAD CLOSED / LAVA FLOW), amber beacons flashing on it and on the hut, and the clutter of a
// working station. All of it beside the road past the gantry; the grid and the gantry stay clear.

const BASE = import.meta.env.BASE_URL;

function loadSet(key, rep = 1) {
  const tl = new THREE.TextureLoader();
  const T = (s, srgb) => {
    const t = tl.load(`${BASE}textures/ext/v_${key}_${s}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: T('albedo', true), normalMap: T('normal'), roughnessMap: T('orm') };
}

// a box with uvs in metres (scale) so tiled textures sit right on any size
function box(sx, sy, sz, scale = 1) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let k = 0; k < uv.count; k++) {
    const ax = Math.abs(n.getX(k)), ay = Math.abs(n.getY(k));
    const w = ax > 0.5 ? sz : sx, h = ay > 0.5 ? sz : sy;
    uv.setXY(k, uv.getX(k) * w / scale, uv.getY(k) * h / scale);
  }
  return g;
}

function stationSign() {
  return canvasTex(1024, 384, (g, w, h) => {
    g.fillStyle = '#4a3222'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e9e1cf'; g.lineWidth = 10; g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = '#efe7d4'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 54px "Saira Condensed", Georgia, serif'; g.fillText('HAWAIʻI VOLCANO RANGERS', w / 2, 100);
    g.font = '800 116px "Saira Condensed", Georgia, serif'; g.fillText('KULA PELE STATION', w / 2, 210);
    g.font = '600 46px "Saira Condensed", Georgia, serif'; g.fillText('LOOKOUT · ELEV. 1,140 FT', w / 2, 305);
    const r = mulberry(4);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(30,20,12,${r() * 0.25})`; g.fillRect(r() * w, r() * h, 2 + r() * 18, 1 + r() * 4); }
  });
}

function barricadeBoard() {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8641c';
    for (let k = -2; k < 12; k++) { g.beginPath(); g.moveTo(k * 56, h); g.lineTo(k * 56 + 28, h); g.lineTo(k * 56 + 28 + h * 0.6, 0); g.lineTo(k * 56 + h * 0.6, 0); g.fill(); }
    const r = mulberry(8);
    for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(70,55,40,${r() * 0.25})`; g.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 4); }
  });
}

function closedSign() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#15120f'; g.lineWidth = 14; g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = '#15120f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 170px "Saira Condensed", Impact, sans-serif'; g.fillText('ROAD CLOSED', w / 2, 150);
    g.fillStyle = '#b8241a';
    g.font = '800 92px "Saira Condensed", Impact, sans-serif'; g.fillText('ACTIVE LAVA FLOW', w / 2, 300);
    g.fillStyle = '#15120f';
    g.font = '700 58px "Saira Condensed", Impact, sans-serif'; g.fillText('NO ENTRY BEYOND THIS POINT', w / 2, 410);
    const r = mulberry(12);
    for (let k = 0; k < 700; k++) { g.fillStyle = `rgba(80,60,40,${r() * 0.2})`; g.fillRect(r() * w, r() * h, 2 + r() * 20, 1 + r() * 6); }
  });
}

export class Station {
  constructor(kp) {
    this.kp = kp;
    const hz = kp.hz, t = kp.t, world = kp.world, W = t.width, hw = W / 2;
    const st = t.station || { i: t.line - 2, side: -1 };
    const s = st.side || -1;
    this.s = s;
    const grp = new THREE.Group();
    kp.group.add(grp);
    this.group = grp;
    this.beacons = [];
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    // the compound sits past the gantry (row line), on the station's side
    const i0 = t.wrap(Math.max(st.i, t.line) + 8);
    const n = 26;
    const frames = [];
    for (let k = 0; k <= n; k++) { const f = t.frame(i0 + k); f.y = t.at(i0 + k)[1]; frames.push(f); }
    const F = frames[Math.round(n / 2)];
    const padY = Math.max(...frames.map((f) => f.y)) + 0.05;
    this.padY = padY;
    const lat0 = hw + 1.6, lat1 = hw + 15;
    // ---- the pad: packed cinders, level with the road, on a dry-stack basalt wall where the ground falls away
    const gravelMat = new THREE.MeshStandardMaterial({ map: hz.M.sco.a, color: 0x8a8580, roughness: 1 });
    gravelMat.map = hz.M.sco.a;
    const P = [], UV = [], I = [];
    const lats = [lat0, lat0 + 3, lat0 + 6, lat0 + 9, lat0 + 12, lat1];
    frames.forEach((f) => lats.forEach((l) => { const x = f.x + f.nx * s * l, z = f.z + f.nz * s * l; P.push(x, padY, z); UV.push(x / 3, z / 3); }));
    const m = lats.length;
    for (let r = 0; r < frames.length - 1; r++) for (let k = 0; k < m - 1; k++) { const a = r * m + k, b = a + 1, c = a + m, d = c + 1; if (s > 0) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    pg.setIndex(I); pg.computeVertexNormals();
    const pad = new THREE.Mesh(pg, gravelMat);
    pad.receiveShadow = true;
    grp.add(pad);
    hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(P), new Uint32Array(I)).setFriction(1).setCollisionGroups(G_GROUND), this.body);
    // the wall round the outside and the ends, down to the ground
    const wallMat = basaltMaterial(hz.M, { tint: [0.62, 0.58, 0.55], scale: 1.4, side: THREE.DoubleSide, key: 'drystack' });
    // dry-stack: a stone course pattern pressed into the triplanar basalt
    wallMat.onBeforeCompile = ((base) => (sh) => {
      base(sh);
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `diffuseColor.rgb *= col;
{
  vec2 c = vec2((vW.x + vW.z) / 0.55, vW.y / 0.32);
  c.x += floor(c.y) * 0.5 + texture(tNoise, floor(c) * 0.13).r * 0.6;
  vec2 f = fract(c);
  float joint = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.12, f.y) * smoothstep(1.0, 0.88, f.y);
  diffuseColor.rgb *= mix(0.25, 1.0, joint) * (0.8 + 0.4 * texture(tNoise, floor(c) * 0.37).g);
}`);
    })(wallMat.onBeforeCompile);
    this.wallMat = wallMat;
    const wallRun = (pts) => {
      const WP = [], WI = [];
      pts.forEach(([x, z]) => { WP.push(x, padY + 0.25, z, x, world.heightAt(x, z) - 1, z); });
      for (let k = 0; k < pts.length - 1; k++) { const a = k * 2; WI.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(WP, 3));
      g.setIndex(WI); g.computeVertexNormals();
      const mm = new THREE.Mesh(g, wallMat);
      mm.castShadow = true; mm.receiveShadow = true;
      grp.add(mm);
    };
    const outer = frames.map((f) => [f.x + f.nx * s * lat1, f.z + f.nz * s * lat1]);
    wallRun(outer);
    for (const f of [frames[0], frames[n]]) wallRun(lats.map((l) => [f.x + f.nx * s * l, f.z + f.nz * s * l]));
    const at = (k, l) => { const f = frames[clamp(Math.round(k), 0, n)]; return { x: f.x + f.nx * s * l, z: f.z + f.nz * s * l, yaw: f.yaw, f }; };
    // ---- the hut
    const wood = loadSet('wood'), tin = loadSet('tin'), conc = loadSet('concrete');
    this.texs = [wood, tin, conc];
    const woodMat = new THREE.MeshStandardMaterial({ ...wood, color: 0x9a8a72, roughness: 1, envMapIntensity: 0.6 });
    const trimMat = new THREE.MeshStandardMaterial({ ...wood, color: 0xd8d0bc, roughness: 1, envMapIntensity: 0.6 });
    const roofMat = new THREE.MeshStandardMaterial({ ...tin, color: 0x4f6b48, roughness: 1, metalness: 0.5, envMapIntensity: 0.7 });
    const concMat = new THREE.MeshStandardMaterial({ ...conc, color: 0xa09a90, roughness: 1, envMapIntensity: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.4 });
    const hut = new THREE.Group();
    const hc = at(n * 0.55, lat0 + 8.5);
    hut.position.set(hc.x, padY, hc.z);
    hut.rotation.y = hc.yaw + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
    // local frame: +z faces the road
    const HW = 7, HD = 4.6, HH = 2.9;
    const add = (g, mat, x, y, z, ry = 0) => { const mm = new THREE.Mesh(g, mat); mm.position.set(x, y, z); mm.rotation.y = ry; mm.castShadow = true; mm.receiveShadow = true; hut.add(mm); return mm; };
    add(box(HW + 0.6, 0.45, HD + 2.6, 1.5), concMat, 0, 0.22, 0.9);
    add(box(HW, HH, HD, 1.2), woodMat, 0, 0.45 + HH / 2, -0.4);
    // battens
    for (let k = -HW / 2; k <= HW / 2 + 1e-3; k += 0.6) add(box(0.06, HH, 0.05), trimMat, k, 0.45 + HH / 2, -0.4 + HD / 2 + 0.03);
    // windows and door on the road side, a window each end
    for (const x of [-2.2, 2.2]) { add(box(1.5, 1.1, 0.08), glassMat, x, 1.95, -0.4 + HD / 2 + 0.06); add(box(1.7, 0.1, 0.2), trimMat, x, 1.35, -0.4 + HD / 2 + 0.1); add(box(1.7, 0.1, 0.12), trimMat, x, 2.55, -0.4 + HD / 2 + 0.08); }
    add(box(1.0, 2.1, 0.08), new THREE.MeshStandardMaterial({ ...wood, color: 0x6e4e30 }), 0, 0.45 + 1.05, -0.4 + HD / 2 + 0.06);
    for (const x of [-HW / 2 - 0.04, HW / 2 + 0.04]) add(box(0.08, 1.0, 1.4), glassMat, x, 1.95, -0.6);
    // lanai: posts and a skillion roof out over the front, the main roof a low gable in tin
    for (const x of [-HW / 2 + 0.2, -1.2, 1.2, HW / 2 - 0.2]) add(box(0.16, 2.6, 0.16, 0.5), trimMat, x, 0.45 + 1.3, 2.9);
    const roof = new THREE.Group();
    hut.add(roof);
    for (const sd of [-1, 1]) {
      const pl = add(box(HW + 1.2, 0.06, HD / 2 + 0.9, 0.8), roofMat, 0, 0, 0);
      hut.remove(pl); roof.add(pl);
      pl.position.set(0, 0.45 + HH + 0.55, -0.4 + sd * (HD / 4 + 0.35));
      pl.rotation.x = sd * 0.32;
    }
    const lan = add(box(HW + 0.8, 0.05, 3.2, 0.8), roofMat, 0, 0.45 + 2.68, 1.75 + 0.5);
    lan.rotation.x = 0.12;
    add(box(HW + 0.8, 0.14, 0.14), trimMat, 0, 0.45 + 2.6, 2.95);
    // the sign over the lanai, and a lamp
    const signM = add(new THREE.PlaneGeometry(3.6, 1.35), new THREE.MeshStandardMaterial({ map: stationSign(), roughness: 0.7 }), 0, 0.45 + 3.25, 3.0);
    signM.castShadow = false;
    // a water tank on a stand, Hawaiian-style catchment
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x3f5546, roughness: 0.7, metalness: 0.2 });
    add(new THREE.CylinderGeometry(1.1, 1.1, 2.0, 18), tankMat, HW / 2 + 1.8, 0.45 + 2.0, -1.2);
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) add(box(0.12, 1.0, 0.12), trimMat, HW / 2 + 1.8 + x, 0.45 + 0.5, -1.2 + z);
    add(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), roofMat, HW / 2 + 0.6, 0.45 + 2.3, 0.4);
    // radio mast with a beacon
    add(new THREE.CylinderGeometry(0.05, 0.08, 6.5, 8), new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.8, roughness: 0.4 }), -HW / 2 + 0.4, 0.45 + HH + 3.2, -1.8);
    grp.add(hut);
    this.mats = [woodMat, trimMat, roofMat, concMat, glassMat, tankMat, gravelMat];
    hz.phys.createCollider(RAPIER.ColliderDesc.cuboid(HW / 2 + 0.3, 1.8, HD / 2 + 0.3).setTranslation(hc.x, padY + 1.8, hc.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hut.rotation.y)).setCollisionGroups(G_GROUND), this.body);
    const beaconAt = (x, y, z, ph, scale = 1) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a3a08, emissive: 0xffa21a, emissiveIntensity: 0, roughness: 0.3 });
      const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 0.22 * scale, 12), mat);
      lm.position.set(x, y, z);
      grp.add(lm);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa41c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      spr.scale.setScalar(2.6 * scale);
      spr.position.copy(lm.position);
      grp.add(spr);
      this.beacons.push({ mat, spr, ph });
    };
    hut.updateMatrixWorld(true);
    const mast = new THREE.Vector3(-HW / 2 + 0.4, 0.45 + HH + 6.55, -1.8).applyMatrix4(hut.matrixWorld);
    beaconAt(mast.x, mast.y, mast.z, 0.25, 1.3);
    // ---- the lookout deck off the end of the pad, out over the lava plain, with a pipe railing
    const pipe = new THREE.MeshStandardMaterial({ color: 0x8c8f8f, roughness: 0.4, metalness: 0.85 });
    this.mats.push(pipe);
    const railPts = (l, from, to) => { const pts = []; for (let k = from; k <= to; k += 1) { const p = at(k, l); pts.push(new THREE.Vector3(p.x, padY, p.z)); } return pts; };
    const rail = railPts(lat1 - 0.3, 1, n - 1);
    for (const h of [0.55, 1.05]) {
      const c = new THREE.CatmullRomCurve3(rail.map((p) => p.clone().setY(p.y + h)));
      const tg = new THREE.TubeGeometry(c, rail.length * 2, 0.035, 6);
      const tm = new THREE.Mesh(tg, pipe); tm.castShadow = true; grp.add(tm);
    }
    const postG = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6);
    for (let k = 0; k < rail.length; k += 2) { const pm = new THREE.Mesh(postG, pipe); pm.position.copy(rail[k]).setY(padY + 0.55); grp.add(pm); }
    // telescope viewer on the lookout
    const scope = new THREE.Group();
    const sp = at(n * 0.2, lat1 - 1.2);
    scope.position.set(sp.x, padY, sp.z);
    scope.rotation.y = sp.yaw + (s > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
    const scopeMat = new THREE.MeshStandardMaterial({ color: 0x2e4b3a, roughness: 0.5, metalness: 0.6 });
    this.mats.push(scopeMat);
    const sm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8), scopeMat); sm1.position.y = 0.55; scope.add(sm1);
    const sm2 = new THREE.Mesh(box(0.32, 0.3, 0.6), scopeMat); sm2.position.set(0, 1.25, 0); sm2.rotation.x = -0.2; scope.add(sm2);
    grp.add(scope);
    // ---- the barricade closing the road (pulled aside for the race) with its sign and beacons
    const bp = at(-2, 0);
    const boardTex = barricadeBoard();
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.7 });
    this.mats.push(boardMat, legMat);
    const barricade = (lat, along, yaw, len = 3.6) => {
      const bf = t.frame(i0 + along);
      const x = bf.x + bf.nx * s * lat, z = bf.z + bf.nz * s * lat;
      const g = new THREE.Group();
      g.position.set(x, world.heightAt(x, z), z);
      g.rotation.y = bf.yaw + yaw;
      for (const h of [0.55, 0.95, 1.35]) { const b = new THREE.Mesh(box(len, 0.22, 0.04), boardMat); b.position.set(0, h, 0); b.castShadow = true; g.add(b); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(box(0.08, 1.6, 0.08), legMat); l.position.set(sx * (len / 2 - 0.3), 0.75, sz * 0.25); l.rotation.x = sz * 0.18; g.add(l); }
      grp.add(g);
      g.updateMatrixWorld(true);
      for (const sx of [-1, 1]) { const p = new THREE.Vector3(sx * (len / 2 - 0.3), 1.62, 0).applyMatrix4(g.matrixWorld); beaconAt(p.x, p.y, p.z, sx > 0 ? 0 : 0.5); }
      return g;
    };
    barricade(hw + 2.2, 4, Math.PI / 2 * 0.15 + Math.PI / 2 * 0);
    barricade(hw + 2.6, -18 - (i0 - t.line), 0.2);
    // the closed-road sign itself, big, on two posts beside the first barricade
    const cs = new THREE.Group();
    const cf = t.frame(i0 + 9);
    const cx = cf.x + cf.nx * s * (hw + 2.6), cz = cf.z + cf.nz * s * (hw + 2.6);
    cs.position.set(cx, world.heightAt(cx, cz), cz);
    cs.rotation.y = cf.yaw + Math.PI;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: closedSign(), roughness: 0.6, side: THREE.DoubleSide }));
    face.position.set(0, 2.1, 0); face.castShadow = true; cs.add(face);
    for (const x of [-1.0, 1.0]) { const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), pipe); pm.position.set(x, 1.4, -0.05); cs.add(pm); }
    grp.add(cs);
    // a lava hazard sign on the far side of the road
    const ls = t.frame(i0 + 14);
    roadSign(grp, world, ls.x - ls.nx * s * (hw + 2.4), ls.z - ls.nz * s * (hw + 2.4), ls.yaw + Math.PI, canvasTex(512, 512, (g) => {
      g.translate(256, 256); g.rotate(Math.PI / 4); g.fillStyle = '#141210'; g.fillRect(-176, -176, 352, 352); g.fillStyle = '#f2c21c'; g.fillRect(-164, -164, 328, 328);
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#141210'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 64px "Saira Condensed", Impact, sans-serif'; g.fillText('LAVA', 256, 196); g.fillText('FLOW', 256, 262); g.font = '800 46px "Saira Condensed", Impact, sans-serif'; g.fillText('NEXT 3 MI', 256, 324);
    }), { size: 1.5, h: 2.2 });
    // ---- the rest of the station's clutter, from the shared prop models, once they have loaded
    this.disposed = false;
    const rnd = mulberry(77);
    const names = ['Barrel_01', 'wooden_crate_02', 'wooden_picnic_table', 'propane_tank', 'metal_jerrycan', 'concrete_road_barrier', 'old_tyre', 'painted_wooden_bench', 'street_lamp_01', 'shrub_02', 'shrub_03'];
    loadPropModels(names).then((models) => {
      if (this.disposed) return;
      const pl = makePlacer(world, models, rnd);
      const put = (name, k, l, yaw, size, opts = {}) => { const p = at(k, l); pl.put(name, p.x, p.z, p.yaw + yaw, size, { y: padY, ...opts }); };
      // concrete barriers along the pad's road edge, with gaps for the drive
      for (let k = 2; k < n - 1; k += 3.2) if (Math.abs(k - n * 0.55) > 2.5) put('concrete_road_barrier', k, lat0 + 0.4, 0, 2.6, { byHeight: false });
      put('wooden_picnic_table', n * 0.25, lat0 + 6, 0.3, 2.0);
      put('painted_wooden_bench', n * 0.12, lat1 - 1.8, Math.PI / 2 * s, 1.8);
      put('painted_wooden_bench', n * 0.38, lat1 - 1.8, Math.PI / 2 * s, 1.8);
      for (let k = 0; k < 3; k++) put('Barrel_01', n * 0.82 + k * 0.9, lat0 + 11 + (k % 2) * 0.8, rnd() * 6, 0.95);
      put('propane_tank', n * 0.9, lat0 + 9.6, 0, 1.1);
      put('wooden_crate_02', n * 0.78, lat0 + 13, 0.4, 1.0);
      put('wooden_crate_02', n * 0.8, lat0 + 13.1, 0.1, 1.0, { yOff: 0.95 });
      put('metal_jerrycan', n * 0.86, lat0 + 13.2, 0.7, 0.5);
      put('old_tyre', n * 0.95, lat0 + 12.5, 0, 0.8, { tilt: 0.4 });
      put('street_lamp_01', n * 0.05, lat0 + 1.2, 0, 4.2, { byHeight: true });
      put('street_lamp_01', n * 0.95, lat0 + 1.2, 0, 4.2, { byHeight: true });
      for (let k = 0; k < 6; k++) put(rnd() < 0.5 ? 'shrub_02' : 'shrub_03', rnd() * n, lat0 + 2 + rnd() * 11, rnd() * 6, 0.8 + rnd() * 0.8);
      const pg2 = new THREE.Group();
      pl.build(pg2);
      grp.add(pg2);
      this.propGroup = pg2;
    }).catch(() => {});
  }

  post(dt, race, time) {
    for (const b of this.beacons) {
      // rotating-beacon look: a quick bright sweep each turn
      const ph = (time * 1.25 + b.ph) % 1;
      const on = Math.max(0, 1 - Math.abs(ph - 0.15) / 0.15);
      b.mat.emissiveIntensity = on * 7;
      b.spr.material.opacity = on;
    }
  }

  dispose() {
    this.disposed = true;
    this.kp.hz.phys.removeRigidBody(this.body);
    for (const s of this.texs) for (const k in s) s[k].dispose();
  }
}
