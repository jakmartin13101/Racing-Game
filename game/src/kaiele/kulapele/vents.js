import * as THREE from 'three';
import { Puffs } from '../../fx.js';
import { tmp, tmp2, clamp, mulberry, rockGeo, basaltMaterial, canvasTex, groundDecal } from './util.js';

// The steam vent flats: fumaroles in the ʻaʻā either side of the road, ringed with sulphur crust. Each breathes a
// steady wisp and every few seconds chuffs out a big cloud that rolls across the road on the breeze, thick enough
// to hide the line for a moment.

function sulphurTexture(seed) {
  const r = mulberry(seed);
  return canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const ring = (r0, r1, col) => {
      const grd = g.createRadialGradient(c, c, r0, c, c, r1);
      grd.addColorStop(0, col.replace('A', '0')); grd.addColorStop(0.35, col.replace('A', '0.85')); grd.addColorStop(1, col.replace('A', '0'));
      g.fillStyle = grd; g.beginPath(); g.arc(c, c, r1, 0, 6.3); g.fill();
    };
    // a halo of bleached, altered rock, then the sulphur crust, orange iron staining, and the dark wet throat
    ring(20, 128, 'rgba(205,200,180,A)');
    ring(14, 80, 'rgba(232,206,72,A)');
    for (let k = 0; k < 160; k++) {
      const a = r() * 6.283, d = 16 + Math.pow(r(), 0.7) * 92, s = 2 + r() * 9;
      g.fillStyle = r() < 0.6 ? `rgba(240,${200 + r() * 40},${40 + r() * 50},${0.3 + r() * 0.6})` : `rgba(${170 + r() * 40},${80 + r() * 40},20,${0.2 + r() * 0.4})`;
      g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, s, s * (0.4 + r() * 0.6), a, 0, 6.3); g.fill();
    }
    const th = g.createRadialGradient(c, c, 0, c, c, 26);
    th.addColorStop(0, 'rgba(10,8,6,1)'); th.addColorStop(0.7, 'rgba(25,20,14,0.9)'); th.addColorStop(1, 'rgba(25,20,14,0)');
    g.fillStyle = th; g.beginPath(); g.arc(c, c, 26, 0, 6.3); g.fill();
  });
}

export class Vents {
  constructor(kp) {
    this.kp = kp;
    const hz = kp.hz, t = kp.t, world = kp.world, hw = t.width / 2;
    const lite = kp.lite;
    this.puffs = new Puffs(hz.M, lite ? 300 : 700, 'smoke');
    const sun = hz.fx?.smoke?.mat?.uniforms?.uSun?.value;
    if (sun) this.puffs.mat.uniforms.uSun.value.copy(sun);
    // steam rises a little faster and spreads less than smoke
    this.puffs.mat.uniforms.uRise.value = 1.1;
    this.puffs.mat.uniforms.uGrow.value = 1.15;
    this.puffs.mesh.renderOrder = 5;
    kp.group.add(this.puffs.mesh);
    const rnd = mulberry(611);
    this.rnd = rnd;
    this.list = [];
    this.tex = [sulphurTexture(3), sulphurTexture(9)];
    const decalMats = this.tex.map((tx) => new THREE.MeshStandardMaterial({ map: tx, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.mats = decalMats;
    const crust = basaltMaterial(hz.M, { tint: [0.95, 0.85, 0.42], scale: 2, key: 'sulphur' });
    const dark = basaltMaterial(hz.M, { tint: [0.4, 0.34, 0.3], scale: 2, key: 'vent-rock' });
    this.rockMats = [crust, dark];
    const geos = [rockGeo(71, 1, { flat: 0.6, sharp: 0.3 }), rockGeo(72, 1, { flat: 0.55, sharp: 0.3 })];
    this.geos = geos;
    const n = (t.vents || []).length;
    const ims = [new THREE.InstancedMesh(geos[0], crust, n * 8), new THREE.InstancedMesh(geos[1], dark, n * 12)];
    const cnt = [0, 0];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (const v of t.vents || []) {
      const f = t.frame(v.i);
      // keep the vents themselves off the road
      // and on open ground: pulled in short of anything rising steeply beside the road (a cut wall)
      const sg = Math.sign(v.lat || 1);
      let la = hw + 3.5;
      for (let l = hw + 3.5; l <= Math.max(Math.abs(v.lat), hw + 3.5); l += 0.5) {
        const gx = f.x + f.nx * sg * l, gz = f.z + f.nz * sg * l;
        if (Math.abs(world.heightAt(gx, gz) - t.at(v.i)[1]) > 1.8) break;
        la = l;
      }
      const lat = sg * la;
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      const y = world.heightAt(x, z);
      kp.group.add(groundDecal(world, x, z, 9 + rnd() * 5, rnd() * 6.28, decalMats[this.list.length % 2], 0.09, 8));
      // a low rim of crusted, broken rock round the throat
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * 6.283 + rnd() * 0.4, d = 1.1 + rnd() * 1.2;
        const rx = x + Math.cos(a) * d, rz = z + Math.sin(a) * d;
        const s = 0.25 + rnd() * 0.45;
        e.set((rnd() - 0.5) * 0.8, rnd() * 6.3, (rnd() - 0.5) * 0.8); q.setFromEuler(e);
        m4.compose(p.set(rx, world.heightAt(rx, rz) + s * 0.2, rz), q, sc.set(s * 1.3, s, s * 1.1));
        const gi = k % 3 === 0 && cnt[0] < n * 8 ? 0 : 1;
        if (cnt[gi] < ims[gi].count) ims[gi].setMatrixAt(cnt[gi]++, m4);
      }
      // the breeze carries the cloud across the road: from the vent's side to the other
      const dir = new THREE.Vector3(-f.nx * Math.sign(lat), 0, -f.nz * Math.sign(lat)).addScaledVector(new THREE.Vector3(f.tx, 0, f.tz), (rnd() - 0.5) * 0.6).normalize();
      this.list.push({ i: v.i, x, y, z, lat, dir, reach: Math.abs(lat) + hw + 6, T: 1 + rnd() * 5, puff: -1, front: 0, speed: 6 + rnd() * 3 });
    }
    ims.forEach((im, k) => { im.count = cnt[k]; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); kp.group.add(im); });
    this.puffN = 0;
  }

  post(dt, race, time) {
    const pl = race.player.v.group.position;
    const lite = this.kp.lite;
    let emitted = false;
    for (const v of this.list) {
      const d2 = (v.x - pl.x) ** 2 + (v.z - pl.z) ** 2;
      if (d2 > 380 * 380) continue;
      const near = d2 < 200 * 200;
      // the steady wisp
      if (Math.random() < dt * (near ? (lite ? 4 : 8) : 2)) {
        const c = 0.86 + Math.random() * 0.08;
        this.puffs.emit(tmp.set(v.x + (Math.random() - 0.5) * 0.8, v.y + 0.3, v.z + (Math.random() - 0.5) * 0.8), tmp2.set(v.dir.x * 1.5, 2.5 + Math.random() * 1.5, v.dir.z * 1.5), 1.0 + Math.random() * 0.8, time, 3 + Math.random() * 2, c, c, c * 1.01);
        emitted = true;
      }
      // the big chuff: a cloud whose front rolls across the road
      v.T -= dt;
      if (v.T <= 0 && v.puff < 0) { v.puff = 0; v.front = 0; this.puffN++; }
      if (v.puff >= 0) {
        v.puff += dt;
        v.front = Math.min(v.reach, v.front + v.speed * dt * (v.puff < 0.4 ? 2 : 1));
        const rate = near ? (lite ? 26 : 55) : 10;
        let k = rate * dt;
        while (k > 0) {
          if (Math.random() > k) break;
          k -= 1;
          const along = Math.random() * v.front;
          const sx = v.x + v.dir.x * along + (Math.random() - 0.5) * 3, sz = v.z + v.dir.z * along + (Math.random() - 0.5) * 3;
          const gy = this.kp.world.heightAt(sx, sz);
          const c = 0.84 + Math.random() * 0.1;
          const life = 2.6 + Math.random() * 2.2;
          // dense and low near the vent, thinning and lifting as it goes
          const s = (2.0 + Math.random() * 2.0) * (1 - along / v.reach * 0.3);
          this.puffs.emit(tmp.set(sx, gy + 0.8 + Math.random() * 1.6, sz), tmp2.set(v.dir.x * (2 + Math.random() * 2), 0.6 + Math.random() * 1.2, v.dir.z * (2 + Math.random() * 2)), s, time, life, c, c, c * 1.01);
          emitted = true;
        }
        // a jet straight up out of the throat while it chuffs
        if (v.puff < 1.2 && Math.random() < (lite ? 0.5 : 0.9)) {
          const c = 0.9;
          this.puffs.emit(tmp.set(v.x, v.y + 0.4, v.z), tmp2.set(v.dir.x * 3 + (Math.random() - 0.5) * 2, 7 + Math.random() * 5, v.dir.z * 3 + (Math.random() - 0.5) * 2), 0.9 + Math.random() * 0.7, time, 2.5, c, c, c);
        }
        if (v.puff > 2.6 + (v.reach / v.speed) * 0.5) { v.puff = -1; v.T = 4 + this.rnd() * 6; }
      }
    }
    if (emitted || this.puffs.dirty) this.puffs.update(time); else this.puffs.mat.uniforms.uTime.value = time;
  }

  debug() { return { vents: `${this.list.length} puffs ${this.puffN}` }; }

  dispose() {
    this.puffs.mesh.geometry.dispose();
    this.puffs.mat.dispose();
    for (const g of this.geos) g.dispose();
  }
}
