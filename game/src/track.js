import * as THREE from 'three';

// One racing line on the shared volcano map. centre rows are [x, y, z, bank, gap].
export class Track {
  constructor(data, world) {
    Object.assign(this, data);
    this.world = world;
    this.c = data.centre;
    this.n = this.c.length;
    // the start/finish line sits under the gantry, the grid forms up behind it
    this.line = data.start + 20;
    this.finishRel = this.closed ? this.n : this.n - 40 - this.line;
    // heading change per metre, smoothed, for AI braking and corner props
    const head = [];
    for (let i = 0; i < this.n; i++) {
      const a = this.at(i - 2), b = this.at(i + 2);
      head.push(Math.atan2(b[0] - a[0], b[2] - a[2]));
    }
    const k = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      let d = head[this.wrap(i + 1)] - head[i];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      k[i] = d;
    }
    this.curv = new Float32Array(this.n);
    const R = 6;
    for (let i = 0; i < this.n; i++) {
      let s = 0;
      for (let j = -R; j <= R; j++) s += k[this.wrap(i + j)];
      this.curv[i] = s / (2 * R + 1);
    }
  }

  wrap(i) { return this.closed ? ((i % this.n) + this.n) % this.n : Math.min(Math.max(i, 0), this.n - 1); }
  at(i) { return this.c[this.wrap(i)]; }

  frame(i, out = {}) {
    const a = this.at(i), b = this.at(i + 2), o = this.at(i - 2);
    const tx = b[0] - o[0], tz = b[2] - o[2];
    const L = Math.hypot(tx, tz) || 1;
    out.x = a[0]; out.y = a[1]; out.z = a[2];
    out.tx = tx / L; out.tz = tz / L; out.nx = -tz / L; out.nz = tx / L;
    out.yaw = Math.atan2(tx / L, tz / L);
    return out;
  }

  nearest(p, hint) {
    let best = hint ?? 0, bd = Infinity;
    const full = hint == null;
    const from = full ? 0 : -60, to = full ? this.n - 1 : 60;
    for (let k = from; k <= to; k++) {
      const i = full ? k : this.wrap(hint + k);
      const c = this.c[i];
      const d = (c[0] - p.x) ** 2 + (c[2] - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  // signed metres past the start line along the racing line (closed tracks wrap)
  rel(i) {
    if (!this.closed) return i - this.line;
    let r = i - this.line;
    if (r < -this.n / 2) r += this.n;
    if (r > this.n / 2) r -= this.n;
    return r;
  }

  // grid slot k: two abreast, 9 m rows behind the line
  gridSlot(k) {
    const row = Math.floor(k / 2), col = k % 2;
    const i = this.line - 10 - row * 9;
    const f = this.frame(i);
    const lat = (col ? 1 : -1) * this.width * 0.22 + (row % 2 ? 0.6 : -0.6);
    return { i: this.wrap(i), x: f.x + f.nx * lat, z: f.z + f.nz * lat, yaw: f.yaw };
  }

  // max heading change over the next `ahead` metres (radians), for speed planning
  turnAhead(i, from, ahead) {
    let m = 0, acc = 0;
    for (let j = from; j < ahead; j += 2) {
      acc += this.curv[this.wrap(i + j)] * 2;
      m = Math.max(m, Math.abs(this.curv[this.wrap(i + j)]) / Math.max(1, j * 0.02));
    }
    return { peak: m, total: Math.abs(acc) };
  }
}

export function lerpFrame(track, i, lat, out = new THREE.Vector3()) {
  const f = track.frame(i);
  return out.set(f.x + f.nx * lat, track.world.heightAt(f.x + f.nx * lat, f.z + f.nz * lat), f.z + f.nz * lat);
}
