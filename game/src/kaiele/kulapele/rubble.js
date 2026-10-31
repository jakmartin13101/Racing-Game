import * as THREE from 'three';
import { tmp, tmp2, clamp, mulberry, rockGeo, basaltMaterial, signed, inRange } from './util.js';

// ʻAʻā off the line: fields of jagged clinker either side of the road on the flats and over the lava plain, and
// lobes of smooth black pāhoehoe toes along the old highway where the flow came over it. Off the road surface in
// the ʻaʻā a truck loses its grip, is dragged back, gets shaken about, and the clinker cuts it up at speed.

export class Rubble {
  constructor(kp) {
    this.kp = kp;
    const hz = kp.hz, t = kp.t, world = kp.world, hw = t.width / 2, sec = t.sections;
    const lite = kp.lite;
    const rnd = mulberry(1312);
    // where the ʻaʻā is: [from, to, density]
    this.zones = [
      [t.wrap(sec.tube[1] + 8), t.wrap(sec.flats[1] + 10), 1],
      [t.wrap(sec.top[0] - 30), t.wrap(sec.tube[0] - 6), 0.55],
    ];
    const zoneLen = this.zones.map(([a, b]) => t.ahead(a, b));
    const geos = [0, 1, 2, 3].map((k) => rockGeo(1400 + k * 11, 1, { flat: 0.62, sharp: 0.55 }));
    this.geos = geos;
    const mats = [basaltMaterial(hz.M, { tint: [0.36, 0.3, 0.27], scale: 1.6, rough: 0.1, key: 'aa1' }), basaltMaterial(hz.M, { tint: [0.5, 0.3, 0.2], scale: 1.6, rough: 0.1, key: 'aa2' })];
    this.mats = mats;
    const N = lite ? 1800 : 4600;
    const ims = geos.map((g, k) => new THREE.InstancedMesh(g, mats[k % 2], Math.ceil(N / 4) + 40));
    const cnt = [0, 0, 0, 0];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const vents = (t.vents || []).map((v) => { const f = t.frame(v.i); return [f.x + f.nx * v.lat, f.z + f.nz * v.lat]; });
    const total = zoneLen.reduce((s, l, k) => s + l * this.zones[k][2], 0);
    for (let k = 0; k < N; k++) {
      // pick a zone by its share of the rubble
      let u = rnd() * total, zi = 0;
      while (zi < this.zones.length - 1 && u > zoneLen[zi] * this.zones[zi][2]) { u -= zoneLen[zi] * this.zones[zi][2]; zi++; }
      const [a] = this.zones[zi];
      const i = t.wrap(a + Math.floor(rnd() * zoneLen[zi]));
      if (t.at(i)[4]) continue;
      const f = t.frame(i);
      const side = rnd() < 0.5 ? -1 : 1;
      const lat = side * (hw + 1.4 + Math.pow(rnd(), 1.4) * 26);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      if (vents.some(([vx, vz]) => (vx - x) ** 2 + (vz - z) ** 2 < 16)) continue;
      // only on the lava plain, not up a cut wall or a bank
      if (Math.abs(world.heightAt(x, z) - t.at(i)[1]) > 3.5) continue;
      const big = rnd() < 0.04;
      const s = big ? 0.8 + rnd() * 0.9 : 0.12 + Math.pow(rnd(), 2) * 0.5;
      e.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3);
      q.setFromEuler(e);
      sc.set(s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.5), s * (0.8 + rnd() * 0.5));
      m4.compose(p.set(x, world.heightAt(x, z) + s * 0.15, z), q, sc);
      const gi = k % 4;
      if (cnt[gi] < ims[gi].count) ims[gi].setMatrixAt(cnt[gi]++, m4);
    }
    ims.forEach((im, k) => { im.count = cnt[k]; im.castShadow = !lite; im.receiveShadow = true; im.computeBoundingSphere(); kp.group.add(im); });
    // pāhoehoe toes along the highway's shoulders: smooth, glassy black lobes, where the surface shows a lobe
    const toeG = rockGeo(1500, lite ? 1 : 2, { flat: 0.35, smoothN: true });
    this.geos.push(toeG);
    const toeMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.38, metalness: 0.05, envMapIntensity: 1.1 });
    this.toeMat = toeMat;
    const NT = lite ? 160 : 420;
    const toes = new THREE.InstancedMesh(toeG, toeMat, NT);
    let tc = 0;
    const [ha, hb] = sec.highway;
    const hl = t.ahead(ha, hb);
    for (let k = 0; k < NT * 3 && tc < NT - 4; k++) {
      const i = t.wrap(ha + Math.floor(rnd() * (hl + 40)));
      const lb = kp.lobe ? kp.lobe(i) : [-4.5, -4.5];
      const side = rnd() < 0.5 ? -1 : 1;
      const L = side < 0 ? lb[0] : lb[1];
      if (L < -4) continue;
      const f = t.frame(i);
      // toes sit just outside the road edge, on the lobe
      const lat = side * (hw + 0.8 + rnd() * Math.max(0.5, 6 + Math.min(L, 0)));
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      if (Math.abs(world.heightAt(x, z) - t.at(i)[1]) > 2.5) continue;
      // a cluster of overlapping toes, the way a lobe's front breaks out
      const n2 = 2 + Math.floor(rnd() * 3);
      for (let c = 0; c < n2; c++) {
        const s = 0.35 + rnd() * 0.7;
        const ox = x + (rnd() - 0.5) * 2.2, oz = z + (rnd() - 0.5) * 2.2;
        e.set((rnd() - 0.5) * 0.2, rnd() * 6.3, (rnd() - 0.5) * 0.2); q.setFromEuler(e);
        sc.set(s * (1 + rnd() * 0.5), s * (0.3 + rnd() * 0.25), s * (0.9 + rnd() * 0.5));
        m4.compose(p.set(ox, world.heightAt(ox, oz) - s * 0.08, oz), q, sc);
        toes.setMatrixAt(tc++, m4);
      }
    }
    toes.count = tc; toes.castShadow = true; toes.receiveShadow = true; toes.computeBoundingSphere();
    kp.group.add(toes);
    this.hits = 0;
  }

  zoneAt(i) {
    const t = this.kp.t;
    for (const [a, b, dens] of this.zones) if (inRange(t, i, a, b)) return dens;
    return 0;
  }

  post(dt, race, time) {
    const hz = this.kp.hz, hw = this.kp.t.width / 2;
    for (const st of race.cars) {
      if (st.finished || st.burned) continue;
      const v = st.v;
      if (v.contacts < 2 || v.ghost) { st.kpAa = 0; continue; }
      const dens = this.zoneAt(st.i);
      if (!dens) continue;
      const off = st.off || 0;
      const k = clamp((off - hw - 0.8) / 2.5, 0, 1) * dens;
      if (k <= 0) { st.kpAa = 0; continue; }
      const b = v.body, lv = b.linvel();
      const spd = Math.hypot(lv.x, lv.z);
      if (spd < 1) continue;
      const m = b.mass();
      // the clinker drags: a strong rolling resistance on top of the loose-ground grip loss
      const drag = -m * k * (2.2 + spd * 0.07) * dt / spd;
      b.applyImpulse({ x: lv.x * drag, y: 0, z: lv.z * drag }, true);
      // and it is rough: random jolts under the wheels
      if (Math.random() < dt * 6 * k) {
        const p = b.translation();
        b.applyImpulseAtPoint({ x: 0, y: m * (0.08 + Math.random() * 0.14) * Math.min(1, spd / 12), z: 0 }, { x: p.x + (Math.random() - 0.5) * 1.2, y: p.y - 0.4, z: p.z + (Math.random() - 0.5) * 2.0 }, true);
      }
      // the clinker cuts it up at speed
      st.kpAa = (st.kpAa || 0) + dt;
      if (spd > 13 && st.kpAa > 0.65 && v.damage) {
        st.kpAa = 0;
        this.hits++;
        const p = b.translation();
        const dir = tmp.set((Math.random() - 0.5) * 0.6, -1, (Math.random() - 0.5) * 0.6).normalize();
        v.damage.kind = 'a';
        v.damage.hit(dir.clone(), 2.4 + spd * 0.06 * k, new THREE.Vector3(p.x, p.y - 0.5, p.z), true);
        v.damage.kind = '';
      }
      // black grit and dust thrown up
      if (Math.random() < 0.5 * k) {
        const p = b.translation(), c = 0.18;
        hz.fx.smoke.emit(tmp.set(p.x, p.y - 0.5, p.z), tmp2.set(-lv.x * 0.1, 1 + Math.random(), -lv.z * 0.1), 0.9, time, 1.6, c, c * 0.95, c * 0.9);
      }
    }
  }

  debug() { return { aa: this.hits }; }

  dispose() { for (const g of this.geos) g.dispose(); }
}
