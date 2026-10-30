import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vehicle, PAINTS } from './vehicle.js';
import { AIDriver, DIFFICULTY } from './ai.js';
import { mulberry } from './world.js';

export const DRIVERS = [
  { name: 'R. Okafor', number: 7 }, { name: 'M. Lindqvist', number: 14 }, { name: 'J. Navarro', number: 3 },
  { name: 'K. Tanaka', number: 88 }, { name: 'D. Whitlock', number: 21 }, { name: 'S. Moreau', number: 55 },
  { name: 'A. Petrov', number: 9 }, { name: 'L. Haddad', number: 42 },
];

// One race: grid, countdown, laps or sprint distance, positions, respawns and results.
export class Race {
  constructor({ phys, scene, assets, track, opponents, difficulty, laps, playerPaint, quality, playerName, seed = 1, crash = null }) {
    Object.assign(this, { phys, scene, track, crash, laps: track.closed ? laps : 1 });
    this.substeps = quality?.substeps || 1;
    this.eq = new RAPIER.EventQueue(true);
    this.byCollider = new Map();
    this.events = [];
    const rnd = mulberry(seed * 977 + 13);
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.cars = [];
    const total = opponents + 1;
    // the player starts mid-pack in a championship, at the back of a quick race grid
    const playerSlot = Math.min(total - 1, Math.floor(total / 2));
    let ai = 0;
    const paints = PAINTS.map((p, i) => i).filter((i) => i !== playerPaint);
    for (let k = 0; k < total; k++) {
      const isPlayer = k === playerSlot;
      const d = isPlayer ? { name: playerName || 'YOU', number: 27 } : DRIVERS[ai % DRIVERS.length];
      const paint = isPlayer ? PAINTS[playerPaint] : PAINTS[paints[ai % paints.length]];
      const v = new Vehicle({ phys, scene, assets, paint, isPlayer, name: d.name, number: d.number, lodOnly: !isPlayer && quality.aiLod, crash });
      const st = { v, i: 0, lap: 0, dist: 0, lastSafe: 0, finished: false, time: 0, isPlayer, racing: false, respawn: false };
      if (!isPlayer) { st.ai = new AIDriver(v, track, this.diff, mulberry(seed * 31 + ai * 7 + 1)); ai++; }
      this.cars.push(st);
      for (const c of v.colliders) this.byCollider.set(c.handle, st);
      const slot = track.gridSlot(k);
      this.place(st, slot.i, slot.x, slot.z, slot.yaw);
    }
    this.player = this.cars[playerSlot];
    this.t = 0;
    this.clock = -3.2; // countdown: 3, 2, 1, GO at 0
    this.done = false;
    this.order = this.cars.slice();
    this.finishOrder = [];
  }

  place(st, i, x, z, yaw) {
    const y = this.track.world.heightAt(x, z) + 1.15;
    st.v.place(x, y, z, yaw);
    st.i = i;
    st.lastSafe = i;
    st.prevRel = this.track.rel(i);
    st.lap = this.track.closed && st.prevRel < 0 ? -1 : 0;
    st.dist = this.distOf(st);
  }

  distOf(st) {
    const t = this.track;
    const r = t.rel(st.i);
    if (!t.closed) return r;
    const pos = (r + t.n) % t.n;
    return st.lap * t.n + pos;
  }

  respawn(st, why = '') {
    // a wreck stays where it is
    if (st.v.totaled) { st.respawn = false; if (why === 'O' || why[0] === 'L') this.retire(st); return; }
    st.resp = (st.resp || 0) + 1;
    const t = this.track;
    (st.respLog ||= []).push(`${st.i}${why}`);
    // never respawn on the run-up to the lava gap: put the truck down on the landing side instead
    for (const j of t.jumps) {
      const ahead = t.ahead(st.lastSafe, j.at);
      if (ahead >= 0 && ahead < (j.guard ?? 160)) st.lastSafe = j.land;
    }
    const f = t.frame(st.lastSafe);
    const lat = st.isPlayer ? 0 : (st.ai?.lane ?? 0) * 0.5;
    st.v.place(f.x + f.nx * lat, t.world.heightAt(f.x, f.z) + 1.3, f.z + f.nz * lat, f.yaw);
    st.i = st.lastSafe;
    st.respawn = false;
    st.flipT = 0;
  }

  get countdown() { return this.clock < 0 ? Math.min(3, Math.ceil(-this.clock)) : 0; }

  // fixed 60 Hz step; playerInput is the merged input for the human truck
  step(dt, playerInput, assist) {
    const t = this.track;
    this.clock += dt;
    const racing = this.clock >= 0;
    if (racing && !this.done) this.t += dt;
    const playerDist = this.player.dist;
    for (const st of this.cars) {
      st.racing = racing && !st.finished;
      if (st.isPlayer) {
        const I = st.v.input;
        if (st.finished) { I.throttle = 0; I.brake = 0.4; I.boost = 0; I.hand = 0; }
        else {
          I.throttle = playerInput.throttle; I.brake = playerInput.brake; I.hand = playerInput.hand; I.boost = playerInput.boost;
          let s = playerInput.steer;
          if (assist && st.assistSteer != null) s = THREE.MathUtils.clamp(s + st.assistSteer * 0.55, -1, 1);
          const rate = playerInput.analog ? 12 : (s === 0 ? 6 : 4);
          I.steer += (s - I.steer) * Math.min(1, dt * rate);
        }
      } else if (st.ai) {
        // finished AI cruise; otherwise race, rubber-banded towards the player
        st.ai.update(dt, st, this.cars.map((c) => c.v), st.finished ? 0 : playerDist - st.dist);
        // finished trucks roll on and pull up
        if (st.finished) { st.v.input.throttle = 0; st.v.input.brake = st.v.speed() > 3 ? 0.5 : 0; st.v.input.boost = 0; }
        if (st.v.totaled) Object.assign(st.v.input, { throttle: 0, brake: 0, boost: 0, hand: 0 });
        if (st.respawn) this.respawn(st, 'S');
      }
      // the truck runs on loose ground once its centre is past the edge of the track surface
      st.v.surface = THREE.MathUtils.clamp(((st.off || 0) - (this.track.width / 2 - 0.6)) / 1.5, 0, 1);
    }
    // trucks knock trackside props flying before the solver sees them
    this.crash?.breakables?.step(this.cars.map((c) => c.v), this.t, (v, dv, p, local, it) => {
      const st = this.cars.find((c) => c.v === v);
      if (v.damage) v.damage.kind = 'p';
      v.damage?.hit(local.clone().applyQuaternion(v.group.quaternion), dv, p);
      if (v.damage) v.damage.kind = '';
      if (st?.isPlayer) this.events.push({ type: 'knock', name: it.name, dv });
    });
    this.hazards?.pre(dt, this);
    // Ultra splits each step into substeps: vehicle forces and the solver run at 120 Hz
    const sub = this.substeps, h = dt / sub;
    this.phys.timestep = h;
    for (let k = 0; k < sub; k++) {
      for (const st of this.cars) st.v.step(h, !racing);
      for (const st of this.cars) { const v = st.v.body.linvel(); (st.preV ||= new THREE.Vector3()).set(v.x, v.y, v.z); }
      this.phys.step(this.eq);
      this.impacts(h);
    }
    this.hazards?.post(dt, this);
    this.crash?.debris.sync(dt);

    for (const st of this.cars) {
      const p = st.v.body.translation();
      const near = t.nearest(p, st.i);
      st.i = near.i;
      st.off = near.d;
      const c = t.at(near.i);
      if (near.d < t.width * 0.6 && st.v.contacts >= 3 && !c[4]) st.lastSafe = near.i;
      // lava, cliffs, far off course, or upside down for two seconds
      // (a truck falling short of the crater leap is left to fall into the lake, which handles it)
      if (p.y < c[1] - 6 && !st.leap?.short) this.respawn(st, `L${(p.y - c[1]).toFixed(0)}d${near.d.toFixed(0)}`); else if (near.d > 120) this.respawn(st, 'O');
      // upside down, or beached on its side with no wheel on the ground, for a couple of seconds
      if ((st.v.up < 0.2 || (st.v.up < 0.6 && st.v.contacts <= 1)) && st.v.speed() < 3) { st.flipT = (st.flipT || 0) + dt; if (st.flipT > 2.5) this.respawn(st, 'F'); }
      else st.flipT = 0;
      // lap counting across the line
      const r = t.rel(st.i);
      if (t.closed) {
        if (st.prevRel < 0 && r >= 0 && st.prevRel > -60) st.lap++;
        else if (st.prevRel >= 0 && r < 0 && r > -60) st.lap--;
      }
      st.prevRel = r;
      st.dist = this.distOf(st);
      // totaled trucks roll on; once stopped they are out of the race
      if (st.v.totaled && !st.finished) {
        st.deadT = st.v.speed() < 0.8 ? (st.deadT || 0) + dt : 0;
        if (st.deadT > 1.5) this.retire(st);
      }
      for (const e of st.v.damage?.events.splice(0) || []) this.events.push({ ...e, st });
      if (st.isPlayer && assist) {
        const f = t.frame(st.i + 12 + Math.round(st.v.speed() * 0.4));
        const r2 = st.v.body.rotation();
        const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r2.x, r2.y, r2.z, r2.w));
        const to = new THREE.Vector3(f.x - p.x, 0, f.z - p.z).normalize();
        st.assistSteer = THREE.MathUtils.clamp(-Math.atan2(fw.x * to.z - fw.z * to.x, fw.x * to.x + fw.z * to.z) * 1.5, -1, 1);
      }
      if (!st.finished && racing) {
        const goal = t.closed ? this.laps * t.n : t.finishRel;
        if (st.dist >= goal) {
          st.finished = true;
          st.time = this.t;
          this.finishOrder.push(st);
          if (st.isPlayer) this.playerFinished = true;
        }
      }
    }
    // standings: finishers by order, the rest by distance covered
    this.order = this.cars.slice().sort((a, b) => {
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      if (a.dnf && b.dnf) return b.dist - a.dist;
      if (a.finished && b.finished) return a.time - b.time;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.dist - a.dist;
    });
    // the race ends a while after the player finishes, or once everyone has
    if (this.playerFinished && !this.done) {
      this.afterFinish = (this.afterFinish || 0) + dt;
      if (this.afterFinish > 6 || this.finishOrder.length === this.cars.length) this.finish();
    }
  }

  retire(st) {
    if (st.finished) return;
    st.finished = true;
    st.dnf = true;
    st.time = null;
    this.events.push({ type: 'dnf', st });
    if (st.isPlayer) this.playerFinished = true;
  }

  // hard contacts on the truck bodies: walls, buildings, other trucks, landing on the roof
  impacts(h = 1 / 60) {
    this.eq.drainContactForceEvents((e) => {
      const h1 = e.collider1(), h2 = e.collider2();
      const dv = e.totalForceMagnitude() * h / 2170;
      if (dv < 1.4) return;
      for (const [mine, other] of [[h1, h2], [h2, h1]]) {
        const st = this.byCollider.get(mine);
        if (!st?.v.damage) continue;
        const c1 = this.phys.getCollider(mine), c2 = this.phys.getCollider(other);
        let dir = null, pt = null;
        this.phys.contactPair(c1, c2, (man, flipped) => {
          if (dir) return;
          const n = man.normal();
          dir = new THREE.Vector3(n.x, n.y, n.z).multiplyScalar(flipped ? -1 : 1);
          if (man.numSolverContacts() > 0) { const p = man.solverContactPoint(0); pt = new THREE.Vector3(p.x, p.y, p.z); }
        });
        if (!dir) continue;
        const ground = c2.shapeType() === RAPIER.ShapeType.HeightField;
        const car = this.byCollider.get(other);
        // only closing speed counts, so trucks leaning on each other or a wall don't grind themselves to bits
        const rel = st.preV.clone();
        if (car) rel.sub(car.preV);
        const closing = rel.dot(dir);
        const hit = Math.min(dv, Math.max(0, closing) * 1.1);
        if (hit < 1.4) continue;
        st.v.damage.kind = car ? 'c' : ground ? '' : 'w';
        // another truck shares the hit
        st.v.damage.hit(dir, car ? hit * 0.6 : hit, pt, ground);
        st.v.damage.kind = '';
      }
    });
  }

  finish() {
    if (this.done) return;
    this.done = true;
    // anyone still running is classified by distance, with a time estimated from their pace
    const goal = this.track.closed ? this.laps * this.track.n : this.track.finishRel;
    for (const st of this.order) {
      if (!st.finished && st.v.totaled) { st.finished = true; st.dnf = true; st.time = null; continue; }
      if (!st.finished) {
        st.finished = true;
        st.dnf = false;
        st.time = this.t * goal / Math.max(1, st.dist);
        this.finishOrder.push(st);
      }
    }
    this.order.sort((a, b) => (a.dnf === b.dnf ? (a.dnf ? b.dist - a.dist : a.time - b.time) : a.dnf ? 1 : -1));
    this.results = this.order.map((st, k) => ({ pos: k + 1, name: st.v.name, number: st.v.number, time: st.time, isPlayer: st.isPlayer, dnf: !!st.dnf }));
  }

  positionOf(st) { return this.order.indexOf(st) + 1; }

  lapOf(st) { return Math.min(this.laps, Math.max(1, st.lap + 1)); }

  progress(st) {
    const t = this.track;
    const goal = t.closed ? this.laps * t.n : t.finishRel;
    return THREE.MathUtils.clamp(st.dist / goal, 0, 1);
  }

  sync(dt, time, dust, camPos) {
    for (const st of this.cars) {
      const d = st.v.group.position.distanceTo(camPos);
      st.v.sync(dt, time, d < 90 ? dust : null, st.isPlayer ? 1 : 0.5);
      st.v.damage?.update(dt, time, st.v.speed() / 25);
    }
  }

  dispose() {
    this.hazards?.dispose();
    for (const st of this.cars) st.v.dispose();
    this.crash?.debris.clear();
    this.crash?.breakables?.reset();
    this.eq.free();
  }
}
