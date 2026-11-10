import * as THREE from 'three';
import { Puffs } from '../fx.js';
import { mulberry } from '../world.js';
import { loadMasks, kTex, PointGrid } from './lavafield/common.js';
import { buildCrust } from './lavafield/crust.js';
import { buildRubble } from './lavafield/rubble.js';
import { buildVents } from './lavafield/vents.js';
import { buildOcean } from './lavafield/ocean.js';
import { buildRafts } from './lavafield/rafts.js';

// Kai'ele's active lava field on the volcano's south flank, the static dressing round both lava tracks:
//   crust     glassy ropy pahoehoe and rough 'a'a ground along the roads, hot glowing cracks near live lava,
//             black sand at the ocean entry (decals on the terrain's own vertices)
//   rubble    'a'a clinker heaps and broken crust blocks, chunked and thinned with distance
//   vents     spatter cones at the streams' vents, skylights where they drop into their tubes, the crater's
//             glowing walls, gas and lake bursts, fumaroles and steaming cracks
//   ocean     the laze plume, boiling water and littoral blasts where the river meets the sea
//   rafts     crust plates drifting down the rivers, cracking up and foundering
// A small pool of point lights follows the camera to the nearest glowing features.
export async function buildLavaField({ world, scene, M, quality, sun, lava }) {
  const group = new THREE.Group();
  group.name = 'lavafield';
  scene.add(group);
  const QP = new URLSearchParams(location.search); // ?nolf skips the lava field, ?lfoff=crust,rubble,... leaves parts out, ?lfstats logs counts (profiling)
  if (QP.has('nolf')) return { group, update() {} };
  const off = new Set((QP.get('lfoff') || '').split(','));
  const lite = !!quality.aiLod;
  const rnd = mulberry(4242);
  const masks = await loadMasks(world);
  const tex = {
    pahoehoe: kTex('pahoehoe_nh.jpg'), clinkerA: kTex('clinker_albedo.jpg', true), clinkerN: kTex('clinker_nao.jpg'),
  };
  // proximity lookups: the road centrelines, and the live lava (rivers with their half widths, the lake)
  const tpts = [];
  for (const t of world.data.tracks) for (let i = 0; i < t.centre.length; i += 3) tpts.push([t.centre[i][0], t.centre[i][2]]);
  const trackGrid = new PointGrid(tpts, 32);
  const lpts = [];
  for (const rv of world.data.rivers) rv.points.forEach((p, i) => lpts.push([p[0], p[2], rv.width[i] / 2]));
  const lk = world.data.lake;
  if (lk) for (let a = 0; a < 64; a++) lpts.push([lk.x + Math.cos(a / 64 * 6.283) * lk.r * 0.85, lk.z + Math.sin(a / 64 * 6.283) * lk.r * 0.85, lk.r * 0.15]);
  const lavaGrid = new PointGrid(lpts, 32);
  // NE trade wind, blowing out to the south-west (x east, +z south)
  const wd = world.data.wind;
  const wind = wd ? new THREE.Vector3(wd[0], 0, wd[1]).normalize() : new THREE.Vector3(-0.72, 0, 0.69);

  // features the ground detail and rubble gather round
  const features = [];
  for (const rv of world.data.rivers) {
    if (rv.end !== 'skylight') continue;
    const a = rv.points[0], b = rv.points[rv.points.length - 1];
    features.push({ x: a[0], z: a[2], r: 45, r0: 12, rubble: true });
    features.push({ x: b[0], z: b[2], r: 50, r0: 13, rubble: true });
  }
  const oe = world.data.oceanEntry;
  if (oe) features.push({ x: oe.x, z: oe.z, r: 230, r0: 30 });

  // shared particle pools for everything here
  const steam = new Puffs(M, lite ? 420 : 1100, 'smoke');
  steam.mat.uniforms.uSun.value.copy(sun);
  const gob = new Puffs(M, lite ? 260 : 700, 'spark');
  const glow = new Puffs(M, lite ? 140 : 360, 'fire');
  const ember = new Puffs(M, lite ? 120 : 320, 'fire');
  group.add(steam.mesh, gob.mesh, glow.mesh, ember.mesh);
  const fx = { steam, gob, glow, ember, wind, trackGrid, lavaGrid, masks };

  const lights = [];
  const ctx = { world, quality, masks, trackGrid, lavaGrid, features, M, tex, group, rnd, lava, sun, fx, lights };
  const none = { update() {}, mat: { userData: { u: { uTime: {} } } } };
  const crust = off.has('crust') ? none : buildCrust(ctx);
  const rubble = off.has('rubble') ? none : buildRubble(ctx);
  const vents = off.has('vents') ? none : buildVents(ctx);
  const ocean = off.has('ocean') ? none : buildOcean(ctx);
  const rafts = off.has('rafts') ? none : buildRafts(ctx);
  if (QP.has('lfstats')) console.warn('lavafield', { crustTris: crust.tris, crustChunks: crust.chunks, rocks: rubble.total, rockMeshes: rubble.meshes, rafts: rafts.count, lights: lights.length });

  // the light pool: a few point lights handed to the glowing features nearest the camera (constant count, so
  // no shader recompiles; unused ones sit at zero)
  const pool = [];
  for (let i = 0; i < (lite ? 2 : 3); i++) {
    const L = new THREE.PointLight(0xff6020, 0, 50, 2);
    L.castShadow = false;
    scene.add(L);
    pool.push({ L, src: null, w: 0 });
  }

  // embers: sparks lifting off the rivers near the camera
  const riverPts = [];
  for (const rv of world.data.rivers) rv.points.forEach((p, i) => riverPts.push({ x: p[0], y: p[1], z: p[2], w: rv.width[i] / 2 }));
  const near = [];
  let nearT = 0, emberAcc = 0;
  const tmp = new THREE.Vector3(), vel = new THREE.Vector3();

  let warm = false;
  const self = {
    group,
    update(t, dt, cam) {
      // the first frame pre-runs a few seconds, so the plumes, fumes and drifting crust are already there
      if (!warm) {
        warm = true;
        for (let k = 40; k > 0; k--) self.update(t - k * 0.2, 0.2, cam);
        for (const p of pool) p.w = 1;
      }
      dt = Math.min(dt, 0.2);
      crust.mat.userData.u.uTime.value = t;
      rubble.update(cam);
      vents.update(t, dt, cam);
      ocean?.update(t, dt, cam);
      rafts.update(t, dt, cam);

      // lights: score by distance relative to each light's reach, keep the best few
      const cand = lights.map((l) => ({ l, d: Math.hypot(l.x - cam.x, l.y - cam.y, l.z - cam.z) / l.range })).filter((c) => c.d < 2.2).sort((a, b) => a.d - b.d);
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i], c = cand[i];
        if (c) {
          p.L.position.set(c.l.x, c.l.y, c.l.z);
          p.L.color.setHex(c.l.color);
          p.L.distance = c.l.range * 2.2;
          // fade in and out at the edge of the reach so swapping sources never pops
          const fade = 1 - THREE.MathUtils.smoothstep(c.d, 1.6, 2.2);
          if (p.src !== c.l) { p.src = c.l; p.w = Math.min(p.w, 0.0); }
          p.w = Math.min(1, p.w + dt * 2);
          p.L.intensity = c.l.I * c.l.k * fade * p.w;
        } else {
          p.L.intensity = 0; p.src = null; p.w = 0;
        }
      }

      // embers off the nearest stretches of river
      if (t - nearT > 0.5) {
        nearT = t;
        near.length = 0;
        for (const p of riverPts) if (Math.abs(p.x - cam.x) + Math.abs(p.z - cam.z) < 260) near.push(p);
      }
      if (near.length) {
        emberAcc += dt * (lite ? 5 : 12);
        while (emberAcc > 1) {
          emberAcc -= 1;
          const p = near[Math.floor(rnd() * near.length)];
          const x = p.x + (rnd() - 0.5) * p.w * 1.6, z = p.z + (rnd() - 0.5) * p.w * 1.6;
          ember.emit(tmp.set(x, p.y + 0.5, z), vel.set(wind.x * 2 + (rnd() - 0.5) * 2, 2 + rnd() * 3, wind.z * 2 + (rnd() - 0.5) * 2), 0.06 + rnd() * 0.1, t, 2 + rnd() * 2.5, 1, 0.8, 0.7);
        }
      }
      steam.update(t); gob.update(t); glow.update(t); ember.update(t);
    },
  };
  return self;
}
