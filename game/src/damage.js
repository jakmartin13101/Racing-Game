import * as THREE from 'three';
import { Lattice } from './softbody.js';
import { buildEngine, pistonMesh, coverMesh, ENGINE_MATS } from './engine.js';

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
// points round the body that grind on the ground when the truck is on its side or roof (cage, roof, sills)
const SCRAPE = [[0.8, 1.85, 0.4], [-0.8, 1.85, 0.4], [0.8, 1.85, -0.9], [-0.8, 1.85, -0.9], [1.1, 0.9, 0.3], [-1.1, 0.9, 0.3],
  [1.12, -0.1, 1.6], [-1.12, -0.1, 1.6], [1.12, -0.1, -1.6], [-1.12, -0.1, -1.6], [1.1, 0.5, -2.2], [-1.1, 0.5, -2.2], [0, 0.4, 2.5], [0, 0.5, -2.7]];

// The truck's glass: crazes into a web of cracks round each window as it is hit (milky, catching the light),
// and each window can be blown out entirely. uCrack and uGone: front, rear, left, right.
function glassMaterial(base) {
  if (!base) return base;
  const m = base.clone();
  const u = { uCrack: { value: new THREE.Vector4() }, uGone: { value: new THREE.Vector4() } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGl = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec4 uCrack, uGone; varying vec3 vGl;
vec3 gHash(vec3 p) { p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
// distance to the nearest crack: the edges between Voronoi cells, plus the cell's own random
vec2 gCells(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z), h = gHash(i + o); vec3 r = o + h - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
vec4 gMask = vec4(smoothstep(0.25, 0.55, vGl.z), smoothstep(-0.15, -0.35, vGl.z), smoothstep(0.62, 0.85, vGl.x), smoothstep(-0.62, -0.85, vGl.x));
if (dot(gMask, uGone) > 0.5) discard;
float gK = clamp(dot(gMask, uCrack), 0.0, 1.6);`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
if (gK > 0.02) {
  vec2 c = gCells(vGl * 7.0);
  vec2 c2 = gCells(vGl * 23.0 + 3.1);
  float web = (1.0 - smoothstep(0.0, 0.035, c.x)) * step(c.y, gK * 1.1) + (1.0 - smoothstep(0.0, 0.05, c2.x)) * smoothstep(0.5, 1.3, gK) * 0.7;
  web = clamp(web, 0.0, 1.0);
  vec3 craze = vec3(0.78, 0.8, 0.8) * (0.6 + 0.4 * c.y);
  gl_FragColor.rgb = mix(gl_FragColor.rgb + vec3(0.05) * gK, craze, web * 0.85);
  gl_FragColor.a = max(gl_FragColor.a, max(web * 0.95, min(0.9, gK * 0.35)));
}`);
  };
  m.customProgramCacheKey = () => 'truck-glass-crack';
  return m;
}
const tmp = new THREE.Vector3(), tq = new THREE.Quaternion(), tm = new THREE.Matrix4();

function hash(i) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }

// Damage model for one truck: zone damage, soft-body dents in the body and panels, panels working loose
// (bonnet popping, doors hanging open, bumpers sagging) before they break off, bent and lost wheels, smoke,
// fire and the engine blow-up. level 0..1; at 1 the truck is totaled. ctx.detail (0.4 low .. 1 high) scales
// how far the bodywork deforms and whether loose panels flap.
export class Damage {
  constructor(vehicle, ctx) {
    Object.assign(this, { v: vehicle, scene: ctx.scene, debris: ctx.debris, fx: ctx.fx });
    this.detail = ctx.detail ?? 1;
    this.boomAfter = ctx.boomT ?? null;
    this.level = 0;
    this.zone = Object.fromEntries(ZONES.map((z) => [z, 0]));
    this.lost = new Set();
    this.visuals = [];
    this.smokeT = 0;
    this.burning = 0;
    this.events = [];
    this.wheels = vehicle.wheelPts.map(() => ({ hurt: 0, bent: 0, lost: false }));
    this.levels = [];
    // soft-body crumple: one lattice for the whole truck, read by every material on it (both LOD levels)
    const bodyGeo = vehicle.parts[0].body.geometry;
    if (!bodyGeo.boundingBox) bodyGeo.computeBoundingBox();
    this.lattice = new Lattice(bodyGeo.boundingBox);
    const lat = this.lattice, mats = vehicle.mats || {};
    const latMat = (m) => lat.material(m);
    // the truck's own glass (it cracks and shatters) and lamps (they break and go dark)
    this.glass = glassMaterial(mats.glass);
    this.lamps = { head: mats.light_lamp?.clone(), bar: mats.light_lamp?.clone(), tail: mats.light_tail?.clone() };
    this.broken = { head: 0, tail: 0, bar: 0 };
    this.crack = new THREE.Vector4(); // front, rear, left, right windows: 0 whole .. 1 crazed; > 1.6 gone
    // each LOD level: its body mesh, its breakable part meshes, and filler panels for the holes they leave
    vehicle.parts.forEach((lvl, li) => {
      const parts = {};
      lvl.root.traverse((o) => {
        if (!o.isMesh) return;
        // multi-material parts load as several meshes named part_<name>_<n>
        const key = (o.name.startsWith('part_') ? o.name : o.parent?.name || '').replace(/^part_/, '');
        const k = Object.keys(PARTS).find((p) => key === p || key.startsWith(`${p}_`));
        if (k && (o.name.startsWith('part_') || o.parent?.name.startsWith('part_'))) (parts[k] ||= []).push(o);
      });
      // every mesh but the wheels follows the lattice
      lvl.root.traverse((o) => {
        if (!o.isMesh || o.material === mats.wheel) return;
        let m = o.material;
        if (m === mats.glass) m = this.glass;
        else if (m === mats.light_tail) m = this.lamps.tail;
        else if (m === mats.light_lamp) m = (o.name.includes('lightbar') || o.parent?.name.includes('lightbar')) ? this.lamps.bar : this.lamps.head;
        o.material = latMat(m);
        o.customDepthMaterial = lat.depthMaterial();
      });
      const fills = {};
      for (const side of ['door_l', 'door_r']) {
        const box = partBox(parts[side]);
        if (!box) continue;
        const s = side === 'door_l' ? 1 : -1;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(box.max.z - box.min.z, box.max.y - box.min.y), latMat(ENGINE_MATS.bay));
        m.rotation.y = s * Math.PI / 2;
        m.position.set(s * (Math.min(Math.abs(box.min.x), Math.abs(box.max.x)) - 0.05), (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
        m.visible = false;
        lvl.root.add(m);
        fills[side] = m;
      }
      const hb = partBox(parts.hood) || new THREE.Box3(new THREE.Vector3(-0.84, 0.26, 1.02), new THREE.Vector3(0.84, 0.37, 2.31));
      // the engine under the bonnet: the detailed one on the near model, a cut-down one on the far one
      const engine = buildEngine(li === 0 && vehicle.parts.length > 1, latMat);
      engine.group.visible = false;
      for (const o of engine.group.children) o.customDepthMaterial = lat.depthMaterial();
      lvl.root.add(engine.group);
      fills.hood = engine.group;
      this.hoodBox = this.hoodBox || hb;
      const boxes = Object.fromEntries(Object.entries(parts).map(([k, m]) => [k, partBox(m)]));
      // everything that dents: the body shell and every panel still attached
      const skins = [lvl.body, ...Object.values(parts).flat()].filter(Boolean).map((mesh) => ({ mesh, own: false }));
      this.levels.push({ parts, fills, boxes, skins, wheels: lvl.wheels, engine });
    });
    this.loose = {};
    this.spinA = 0;
  }

  get totaled() { return this.level >= 1; }

  // world-space direction from the truck towards the impact, impact strength as a change of speed (m/s)
  hit(dirW, dv, pointW, ground = false) {
    if (this.v.ghost || dv < 1.4) return;
    const q = this.v.group.quaternion;
    const dir = dirW.clone().applyQuaternion(tq.copy(q).invert());
    const local = pointW ? this.v.group.worldToLocal(pointW.clone()) : null;
    // light knocks only dent the panels; harder ones crumple the body and cost health
    const P0 = this.surfacePoint(dir, local);
    this.dent(dir, dv, P0);
    // landings on the wheels hardly crumple the underside; rolling onto the side or roof does
    this.lattice.impact(P0, dir, ground ? dv * (dir.y < -0.6 ? 0.35 : 0.85) : dv);
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
    if (!ground && pointW) this.hitWheel(local, dv);
    this.events.push({ type: 'hit', dv });
    const fx = this.fx;
    const at = pointW || this.v.group.position;
    fx?.sparks(at, dirW.clone().negate(), fx.time, Math.min(40, 6 + dv * 2));
    // a hard hit throws off bits of trim, paint flakes and grit
    if (fx?.chips && dv > 5) fx.chips(at, dirW.clone().negate(), this.v.body.linvel(), fx.time, Math.min(24, Math.round((dv - 4) * 1.6)));
    this.breakGlass(main, dv, at, ground);
    this.breakLamps(dv, at);
    for (const [name, p] of Object.entries(PARTS)) {
      if (this.lost.has(name)) continue;
      if (this.zone[p.zone] >= p.at) this.detach(name, dirW);
      else if (POSES[name] && this.zone[p.zone] >= POSES[name].loose && this.detail > 0.5) this.loosen(name, (this.zone[p.zone] - POSES[name].loose) / (p.at - POSES[name].loose));
    }
    if (this.totaled && !this.totaledAt) {
      this.totaledAt = true;
      this.events.push({ type: 'totaled' });
      // a wreck catches fire in the engine bay, and a moment later the fuel tank goes up
      if (!this.blown) { this.burning = Math.max(this.burning, 0.55); this.boomT = this.boomAfter ?? 1.3 + Math.random() * 1.7; }
    }
  }

  // where on the skin a hit lands: from the middle of the truck out along the hit to the body's box, slid
  // sideways towards the actual contact point
  surfacePoint(dir, local) {
    const g = this.levels[0].skins[0].mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const c = bb.getCenter(new THREE.Vector3());
    const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const t = Math.min(h.x / Math.max(Math.abs(dir.x), 1e-3), h.y / Math.max(Math.abs(dir.y), 1e-3), h.z / Math.max(Math.abs(dir.z), 1e-3));
    const P0 = c.clone().addScaledVector(dir, t * 0.97);
    if (local) { const d = local.clone().sub(P0); d.addScaledVector(dir, -d.dot(dir)); P0.addScaledVector(d.clampLength(0, 1.2), 0.8); }
    return P0;
  }

  // the windows on the side that was hit craze, then burst into a shower of glass
  breakGlass(zone, dv, at, ground) {
    const C = this.crack, U = this.glass.userData.u;
    const k = zone === 'front' ? 0 : zone === 'rear' ? 1 : zone === 'left' ? 2 : zone === 'right' ? 3 : -1;
    const add = Math.max(0, (dv - 4.5) * 0.09);
    if (!add) return;
    if (k >= 0) C.setComponent(k, C.getComponent(k) + add);
    // a roll onto the roof crazes all of it
    if (zone === 'top' || (ground && this.v.up < 0.2)) for (let i = 0; i < 4; i++) C.setComponent(i, C.getComponent(i) + add * 0.6);
    for (let i = 0; i < 4; i++) {
      const was = U.uGone.value.getComponent(i);
      if (!was && C.getComponent(i) > 1.6) { U.uGone.value.setComponent(i, 1); this.shatter(i); }
    }
    U.uCrack.value.copy(C);
  }

  // all windows at once (the wreck exploding)
  shatterAll() {
    const U = this.glass.userData.u;
    for (let i = 0; i < 4; i++) if (!U.uGone.value.getComponent(i)) { U.uGone.value.setComponent(i, 1); this.shatter(i, 1.6); }
    this.crack.set(2, 2, 2, 2);
    U.uCrack.value.copy(this.crack);
  }

  // a burst of glass from one window: front, rear, left or right
  shatter(i, power = 1) {
    const fx = this.fx;
    if (!fx?.glass) return;
    const L = [[0, 0.75, 0.75], [0, 0.72, -0.45], [0.9, 0.72, 0.25], [-0.9, 0.72, 0.25]][i];
    const g = this.v.group;
    const p = new THREE.Vector3(...L).applyQuaternion(g.quaternion).add(g.position);
    const out = new THREE.Vector3(...L).setY(0.3).normalize().applyQuaternion(g.quaternion);
    fx.glass(p, out, this.v.body.linvel(), fx.time, Math.round((fx.lite ? 22 : 46) * power), i < 2 ? 0.7 : 0.45);
  }

  // headlamps and tail lights smash in a hard hit at their end of the truck; the light bar goes with the bar
  breakLamps(dv, at) {
    const B = this.broken, fx = this.fx;
    const go = (key, z) => {
      if (B[key] >= 1) return;
      B[key] = 1;
      this.lampT = 0.6;
      const m = this.lamps[key];
      if (m) { m.userData.dead = true; }
      if (fx?.glass) {
        const g = this.v.group;
        for (const x of [-0.62, 0.62]) fx.glass(new THREE.Vector3(x, 0.32, z).applyQuaternion(g.quaternion).add(g.position), new THREE.Vector3(0, 0.2, Math.sign(z)).applyQuaternion(g.quaternion), this.v.body.linvel(), fx.time, 10, 0.3, z > 0 ? 1 : 0);
      }
    };
    if (this.zone.front > 0.32 && dv > 6) go('head', 2.45);
    if (this.zone.rear > 0.32 && dv > 6) go('tail', -2.6);
  }

  // a hard knock near a wheel bends it; a harder one tears the tyre off
  hitWheel(local, dv) {
    const pts = this.v.wheelPts;
    let best = -1, bd = 1.6;
    for (let i = 0; i < pts.length; i++) {
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

  // push the skin in around the impact, crinkle it, and scuff the paint (the fine detail; the lattice does the
  // big crumple). P0: the surface point hit, in the truck's frame
  dent(dir, dv, P0) {
    const D = this.detail;
    const r = THREE.MathUtils.clamp(0.3 + dv * 0.03, 0.3, 1.1) * (0.75 + 0.25 * D);
    const depth = THREE.MathUtils.clamp(dv * 0.006, 0.01, 0.13) * D;
    const crinkle = D > 0.7 ? 0.45 : 0;
    const rip = new THREE.Vector3(hash(dv * 3.1) - 0.5, hash(dv * 5.3) - 0.5, hash(dv * 7.7) - 0.5).normalize().multiplyScalar(26);
    const inv = new THREE.Matrix4();
    for (const L of this.levels) {
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
          // keep any dents, the crumple and the loose pose the panel had; off the truck it no longer follows the lattice
          m.updateMatrix();
          cm.geometry = this.lattice.bake(m.geometry, m.matrix);
          if (cm.material.userData.base) cm.material = cm.material.userData.base;
          // lamps torn off with their part go dark
          if (cm.material.emissiveIntensity > 0.5) { cm.material = cm.material.clone(); cm.material.emissiveIntensity = 0; cm.material.color.setRGB(0.12, 0.12, 0.12); }
          cm.customDepthMaterial = undefined;
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

  // boost run dry: the engine lets go. Bonnet off, pistons, a valve cover and shrapnel out, fire.
  blowEngine() {
    if (this.blown) return;
    this.blown = true;
    this.level = 1;
    this.totaledAt = true;
    this.boomT = 0;
    const g = this.v.group;
    g.updateMatrixWorld(true);
    const bay = this.hoodBox.getCenter(new THREE.Vector3()).applyMatrix4(g.matrixWorld);
    // the bonnet bulges, then goes
    this.detach('hood', new THREE.Vector3(0, 1, 0), 1.8);
    this.lattice.blast(this.hoodBox.getCenter(new THREE.Vector3()).setY(0), 0.55);
    const upW = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion);
    const lv = this.v.body.linvel();
    const fx = this.fx;
    // two pistons punched out through the bonnet, trailing smoke and fire, a valve cover and shrapnel
    for (let k = 0; k < 2; k++) {
      const vis = pistonMesh();
      vis.scale.setScalar(1.5);
      this.fling(vis, bay, upW, lv, new THREE.Vector3(0.08, 0.2, 0.08), 3, 10 + Math.random() * 4 + k * 2, 5, 2.5);
    }
    this.fling(coverMesh(), bay, upW, lv, new THREE.Vector3(0.1, 0.04, 0.29), 4, 8 + Math.random() * 3, 7, 1.5);
    this.shrapnel(bay, upW, lv, 8);
    // the engine left in the bay is scorched black, the headers glow
    for (const L of this.levels) L.engine.group.traverse((o) => { if (o.isMesh && o.material.color && o.material !== L.engine.header) o.material.color.multiplyScalar(0.25); });
    fx?.explode(bay, fx.time, 1.8, new THREE.Vector3(lv.x, lv.y, lv.z));
    this.burning = 1;
    this.events.push({ type: 'blown' });
  }

  // a wreck's fuel tank goes up: a fireball out of the bed, the body bulges, the last panels and the glass are
  // blown out, and the truck is thrown up and over
  explodeWreck() {
    if (this.exploded) return;
    this.exploded = true;
    const g = this.v.group, fx = this.fx;
    g.updateMatrixWorld(true);
    const tankL = new THREE.Vector3(0, 0.15, -1.55);
    const tank = tankL.clone().applyMatrix4(g.matrixWorld);
    const lv = this.v.body.linvel();
    fx?.explode(tank, fx.time, 2.4, new THREE.Vector3(lv.x, lv.y, lv.z));
    this.lattice.blast(tankL, 1.1);
    this.shatterAll();
    for (const k of ['head', 'tail', 'bar']) { this.broken[k] = 1; if (this.lamps[k]) this.lamps[k].userData.dead = true; }
    const out = new THREE.Vector3();
    for (const name of Object.keys(PARTS)) {
      if (this.lost.has(name)) continue;
      if (Math.random() < 0.75) this.detach(name, out.set(Math.random() - 0.5, 1, Math.random() - 0.5), 2.2);
    }
    const upW = new THREE.Vector3(0, 1, 0);
    this.shrapnel(tank, upW, lv, 10);
    // thrown up off the ground, tail first, turning over
    const body = this.v.body, M = body.mass();
    const side = new THREE.Vector3(Math.random() < 0.5 ? -0.5 : 0.5, 0, 0).applyQuaternion(g.quaternion);
    body.applyImpulseAtPoint({ x: side.x * M, y: M * (5.5 + Math.random() * 2), z: side.z * M }, { x: tank.x + side.x, y: tank.y, z: tank.z + side.z }, true);
    this.burning = 1;
    this.char(1, 1.2);
    this.events.push({ type: 'exploded' });
  }

  fling(vis, from, upW, lv, half, mass, up, spread, trail) {
    const fx = this.fx;
    vis.position.copy(from);
    this.scene.add(vis);
    this.visuals.push(vis);
    let n = 0, age = 0;
    this.debris.spawn({ centre: from.clone().addScaledVector(upW, 0.3), quat: this.v.group.quaternion, half, mass,
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
  }

  shrapnel(from, upW, lv, n) {
    for (let k = 0; k < n; k++) {
      const s = 0.05 + Math.random() * 0.12;
      const mat = [ENGINE_MATS.alu, ENGINE_MATS.red, ENGINE_MATS.steel, ENGINE_MATS.black][k % 4];
      const vis = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 0.5, s * 1.4), mat);
      vis.castShadow = true;
      this.fling(vis, from, upW, lv, new THREE.Vector3(s, s * 0.25, s * 0.7), 1, 6 + Math.random() * 8, 12, k < 3 ? 1.2 : 0);
    }
  }

  update(dt, time, speedK = 0) {
    const g = this.v.group;
    // the crumple and the wobble of the frame
    this.lattice.setFrame(g.position, g.quaternion);
    this.lattice.update(dt);
    // loose panels shake and flap with speed
    if (this.detail >= 0.95) {
      const flapT = time * 9;
      for (const [name, st] of Object.entries(this.loose)) {
        const P = POSES[name];
        this.applyPose(name, Math.sin(flapT + st.phase) * P.flap * st.k * Math.min(1, speedK) + Math.sin(flapT * 2.3 + st.phase) * P.flap * 0.3 * Math.min(1, speedK));
      }
    }
    this.engineTick(dt, time);
    this.lampTick(dt, time);
    const fx = this.fx;
    if (!fx) return;
    // the fuel tank of a burning wreck goes up
    if (this.boomT > 0) { this.boomT -= dt; if (this.boomT <= 0) this.explodeWreck(); }
    // a wheel-less corner grinds sparks off the hub
    for (let i = 0; i < this.wheels.length; i++) {
      if (!this.wheels[i].lost || this.v.speed() < 4 || !this.v.vc.wheelIsInContact(i) || Math.random() > 0.6) continue;
      const cp = this.v.vc.wheelContactPoint(i);
      if (cp) fx.sparks(new THREE.Vector3(cp.x, cp.y + 0.05, cp.z), new THREE.Vector3(0, 0.5, 0), time, 2);
    }
    this.scrape(time);
    if (this.burning) this.char(dt);
    if (this.level < 0.3 && !this.burning) return;
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    const heavy = this.totaled || this.burning;
    this.smokeT = heavy ? 0.025 : 0.16 - this.level * 0.1;
    const lv = this.v.body.linvel();
    const p = this.hoodBox.getCenter(tmp).setY(this.hoodBox.max.y + 0.05);
    g.updateMatrix();
    p.applyMatrix4(g.matrix);
    const v = new THREE.Vector3(lv.x * 0.75 + (Math.random() - 0.5), 1.2 + Math.random(), lv.z * 0.75 + (Math.random() - 0.5));
    // first white coolant steam from a holed radiator, then grey, then thick black oil smoke
    if (!heavy && this.zone.front > 0.25 && this.level < 0.6) {
      const c = 0.78 + Math.random() * 0.1;
      fx.smoke.emit(p, v.multiplyScalar(1.2), 0.35, time, 1.6, c, c, c * 1.02);
      return;
    }
    const c = heavy ? 0.045 : this.level > 0.75 ? 0.12 : 0.42;
    fx.smoke.emit(p, v, heavy ? 1.0 : 0.5, time, heavy ? 5 : 2.6, c, c * 0.97, c * 0.95);
    if (this.burning) {
      // flames die down a few seconds after the truck has stopped
      if (this.v.speed() < 0.5) this.burning = Math.max(0.3, this.burning - dt * 0.5);
      for (let k = 0; k < 2; k++) {
        const fp = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, -0.2, (Math.random() - 0.5) * 1.1));
        fx.flame.emit(fp, new THREE.Vector3(lv.x * 0.97 + (Math.random() - 0.5) * 0.6, 1.0 + Math.random() * 1.4, lv.z * 0.97 + (Math.random() - 0.5) * 0.6), (0.45 + Math.random() * 0.7) * this.burning, time, 0.3 + Math.random() * 0.4);
      }
      // a wreck that has gone up burns along its whole length
      if (this.exploded && Math.random() < 0.6) {
        const fp = new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.3, -2 + Math.random() * 2.6).applyMatrix4(g.matrix);
        fx.flame.emit(fp, new THREE.Vector3(lv.x * 0.97, 1.2 + Math.random() * 1.6, lv.z * 0.97), 0.6 + Math.random() * 0.8, time, 0.35 + Math.random() * 0.4);
        if (Math.random() < 0.3) fx.smoke.emit(fp, new THREE.Vector3(lv.x * 0.7, 1.6, lv.z * 0.7), 1.1, time, 5, 0.04, 0.04, 0.04);
      }
      // rolling orange billows give the fire some body; dark smoke rises off their tops
      if (Math.random() < 0.5) fx.fire.emit(p.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(lv.x * 0.9, 1.4 + Math.random(), lv.z * 0.9), 0.6 * this.burning, time, 0.7 + Math.random() * 0.4);
      fx.light(p, this.burning);
    }
  }

  // the engine shows once the bonnet has popped or gone: it rocks on its mounts, the pulleys and fan turn with
  // the revs, and the headers glow at high revs or in a fire
  engineTick(dt, time) {
    const show = this.lost.has('hood') || (this.loose.hood?.k || 0) > 0.2;
    const rpm = this.blown ? 0 : this.v.rpm || 900;
    this.spinA += rpm / 60 * Math.PI * 2 * dt;
    const heat = this.blown || this.exploded ? 1.6 * Math.max(0.4, this.burning) : this.burning ? 0.9 : THREE.MathUtils.smoothstep(rpm, 5200, 7200) * 0.55;
    for (const L of this.levels) {
      const E = L.engine;
      E.group.visible = show;
      if (!show) continue;
      for (const s of E.spin) s.o.rotation.z = this.spinA * s.k;
      const shake = this.blown ? 0 : 0.0016 + rpm / 7000 * 0.001;
      E.group.position.set(E.rest.x + Math.sin(time * rpm * 0.21) * shake, E.rest.y + Math.sin(time * rpm * 0.13 + 1) * shake * 0.7, E.rest.z);
      E.group.rotation.z = Math.sin(time * 9 + rpm * 0.0003) * shake * 2;
      E.header.emissiveIntensity = heat * (0.85 + 0.15 * Math.sin(time * 13));
    }
  }

  // smashed lamps flicker for a moment, then die
  lampTick(dt, time) {
    if (!(this.lampT > -1)) return;
    this.lampT -= dt;
    for (const k of ['head', 'tail', 'bar']) {
      const m = this.lamps[k];
      if (!m) continue;
      const dead = m.userData.dead || (k === 'bar' && this.lost.has('lightbar'));
      if (!dead) continue;
      const base = k === 'tail' ? 1.6 : 2.5;
      const lat = this.lattice.mats.get(m) || m;
      lat.emissiveIntensity = this.lampT > 0 ? base * (Math.random() < 0.45 ? 0.15 : 0.9) : 0;
      if (this.lampT <= 0) lat.color.setRGB(0.08, 0.08, 0.08);
    }
    if (this.lampT <= 0) this.lampT = -2;
  }

  // on its side or roof the truck grinds along in a shower of sparks
  scrape(time) {
    const fx = this.fx, v = this.v;
    if (!fx.ground || v.up > 0.55 || v.speed() < 3.5) return;
    const g = v.group;
    const lv = v.body.linvel();
    const pts = SCRAPE;
    for (let i = 0; i < pts.length; i++) {
      if (Math.random() > 0.5) continue;
      const p = tmp.set(pts[i][0], pts[i][1], pts[i][2]).applyQuaternion(g.quaternion).add(g.position);
      const gy = fx.ground(p.x, p.z);
      if (p.y - gy > 0.28) continue;
      const at = new THREE.Vector3(p.x, gy + 0.05, p.z);
      fx.sparks(at, new THREE.Vector3(-lv.x, 0, -lv.z).normalize().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.4, 0)), time, 3);
      if (Math.random() < 0.1) { const c = 0.32; fx.smoke.emit(at, new THREE.Vector3(-lv.x * 0.1, 0.6, -lv.z * 0.1), 0.4, time, 1.6, c, c * 0.95, c * 0.9); }
    }
  }

  // fire scorches the paint around the engine bay; once the tank has gone up, along the whole truck.
  // now: a one-off scorch of that strength instead of the slow creep
  char(dt, now = 0) {
    this.charT = (this.charT || 0) + dt;
    if (this.charT < 0.25 && !now) return;
    this.charT = 0;
    const c = this.hoodBox.getCenter(new THREE.Vector3());
    const rad = this.exploded ? 3.6 : 2.2;
    if (this.exploded) c.z = 0.2;
    const k = now || 0.04 * this.burning;
    for (const L of this.levels) {
      const S = L.skins[0];
      this.ownGeometry(S);
      const g = S.mesh.geometry, pa = g.attributes.position.array, da = g.attributes.dmg?.array;
      if (!da) continue;
      for (let i = 0, n = da.length; i < n; i++) {
        const d = Math.hypot(pa[i * 3] - c.x, (pa[i * 3 + 1] - c.y) * 1.5, (pa[i * 3 + 2] - c.z) * (this.exploded ? 0.75 : 1));
        if (d < rad) da[i] = Math.min(2, Math.max(da[i], 1) + (1 - d / rad) * k * (0.6 + 0.8 * hash(i)));
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
