import * as THREE from 'three';
import { mulberry } from '../../world.js';
import { makePuffs } from './util.js';

// The crater rim start: the grid forms up on the summit rim beside the lava lake, in steam and ash. The lake
// lights the rim from below; fumaroles along the inner edge of the rim steam; banks of steam and ash roll
// across the road over the grid and the first stretch of the descent.
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

export class Rim {
  constructor(hz, sec) {
    this.hz = hz;
    const t = hz.track, W = t.width, world = hz.world;
    this.sec = sec;
    const lk = world.data.lake || world.data.crater;
    this.lake = lk;
    this.rnd = mulberry(338);
    const wd = world.data.wind;
    this.wind = wd ? new THREE.Vector3(wd[0], 0, wd[1]).normalize() : new THREE.Vector3(-0.72, 0, 0.69);
    if (lk) {
      this.glow = new THREE.PointLight(0xff6420, 0, lk.r * 4.5, 1.6);
      this.glow.position.set(lk.x, lk.y + 22, lk.z);
      hz.group.add(this.glow);
    }
    this.steam = makePuffs(hz, hz.lite ? 220 : 560, 'smoke');
    // fumaroles: on the inner side of the rim road, towards the lake
    this.vents = [];
    const [a, b] = sec;
    for (let i = a; i < b + 150; i += 38 + Math.floor(this.rnd() * 30)) {
      const f = t.frame(i);
      const s = lk ? Math.sign((lk.x - f.x) * f.nx + (lk.z - f.z) * f.nz) || 1 : 1;
      const lat = s * (W / 2 + 4 + this.rnd() * 18);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      this.vents.push({ i, p: new THREE.Vector3(x, world.heightAt(x, z) + 0.3, z), s: 0.6 + this.rnd() * 1.2, acc: 0 });
    }
  }

  update(dt, race, time) {
    const hz = this.hz, t = hz.track, W = t.width, pl = race.player, r = this.rnd;
    const [, b] = this.sec;
    const on = pl.i < b + 250;
    if (this.glow) this.glow.intensity = on ? 16000 * (0.82 + 0.18 * Math.sin(time * 1.3) * Math.sin(time * 0.47 + 1)) : 0;
    this.steam.update(time);
    if (!on) return;
    for (const v of this.vents) {
      if (Math.abs(v.i - pl.i) > 260) continue;
      v.acc += dt * (hz.lite ? 1.5 : 3.5) * v.s;
      while (v.acc > 1) {
        v.acc -= 1;
        const c = 0.72 + r() * 0.15;
        this.steam.emit(tmp.copy(v.p), tmp2.set(this.wind.x * 1.5 + (r() - 0.5), 2.5 + r() * 2.5, this.wind.z * 1.5 + (r() - 0.5)), 0.35 + v.s * 0.4 + r() * 0.4, time, 4 + r() * 2.5, c, c * 0.98, c * 0.95);
      }
    }
    // banks of steam and ash drifting across the road ahead; thickest on the grid
    const thick = pl.i < this.sec[0] + 200 ? 1 : 0.55;
    if (r() < dt * (hz.lite ? 4 : 9) * thick) {
      const f = t.frame(pl.i + 8 + Math.floor(r() * 90));
      const lat = (r() - 0.5) * (W + 24);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      const ash = r() < 0.35, c = ash ? 0.2 + r() * 0.08 : 0.55 + r() * 0.15;
      this.steam.emit(tmp.set(x, Math.max(hz.world.heightAt(x, z), f.y) + 0.8 + r() * 3, z), tmp2.set(this.wind.x * 2.2, 0.3 + r() * 0.5, this.wind.z * 2.2), 0.5 + r() * 0.6, time, 5 + r() * 2.5, c, c * 0.97, c * 0.94);
    }
  }

  dispose() { this.hz.group.remove(this.steam.mesh); this.steam.mesh.geometry.dispose(); this.steam.mat.dispose(); }
}
