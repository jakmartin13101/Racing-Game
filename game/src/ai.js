import * as THREE from 'three';

const fwd = new THREE.Vector3(), to = new THREE.Vector3(), q = new THREE.Quaternion();

export const DIFFICULTY = {
  // lava, slack (Eruption): the flow's pace as a share of a clean, quick truck's, and how far clear of it the
  // player may get before it speeds up to close in. Each step up leaves less room to lose time or crash.
  easy: { grip: 7.5, pace: 0.86, band: 0.10, mistakes: 0.5, lava: 0.66, slack: 150, grace: 13 },
  normal: { grip: 9.0, pace: 0.95, band: 0.07, mistakes: 0.25, lava: 0.83, slack: 105, grace: 9 },
  hard: { grip: 10.5, pace: 1.02, band: 0.04, mistakes: 0.08, lava: 0.95, slack: 70, grace: 6 },
};

// Racing-line follower: pure pursuit for steering, a braking-distance speed plan for throttle and brake,
// lane offsets for overtaking, and stuck recovery.
export class AIDriver {
  constructor(vehicle, track, diff, seed) {
    Object.assign(this, { v: vehicle, track, diff });
    this.rnd = seed;
    this.skill = diff.pace * (0.96 + this.rnd() * 0.08);
    this.lanePref = (this.rnd() - 0.5) * track.width * 0.35;
    this.lane = this.lanePref;
    this.phase = this.rnd() * 10;
    this.stuck = 0;
    this.reverse = 0;
    this.boostTaste = 0.3 + this.rnd() * 0.6;
  }

  update(dt, state, others, leaderGap) {
    const v = this.v, t = this.track, I = v.input;
    const p = v.body.translation();
    const r = v.body.rotation();
    q.set(r.x, r.y, r.z, r.w);
    fwd.set(0, 0, 1).applyQuaternion(q);
    const spd = v.speed();
    const i = state.i;

    // drift the preferred lane a little so the pack doesn't run single file
    this.phase += dt * 0.15;
    let laneGoal = this.lanePref + Math.sin(this.phase) * t.width * 0.12;
    // overtaking: look for a truck just ahead in our lane and move out of its way
    for (const o of others) {
      if (o === v) continue;
      const op = o.body.translation();
      const dx = op.x - p.x, dz = op.z - p.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      if (ahead < 0 || ahead > 16) continue;
      const side = dx * fwd.z - dz * fwd.x; // + means the other truck is to our left
      if (Math.abs(side) < 2.6) laneGoal += (side > 0 ? -1 : 1) * t.width * 0.3;
    }
    // straighten up through tight corners
    const turn = t.turnAhead(i, 0, 40);
    laneGoal *= 1 - Math.min(1, turn.total / 0.9) * 0.7;
    // rocks lying on the road (Eruption's descent): pick the side with more room and go round
    let dodge = false;
    for (const o of t.obstacles || []) {
      const ahead = o.i - i;
      if (ahead < 3 || ahead > 80) continue;
      const clear = o.r + 2.5;
      if (Math.abs(laneGoal - o.lat) < clear) { laneGoal = o.lat + (o.lat > 0 ? -clear : clear); dodge = true; }
    }
    const lim = t.width * 0.36;
    laneGoal = Math.max(-lim, Math.min(lim, laneGoal));
    for (const j of t.jumps) { const dj = t.ahead(state.i, j.at); if (dj >= 0 && dj < 200) laneGoal = 0; }
    this.lane += (laneGoal - this.lane) * Math.min(1, dt * (dodge ? 3 : 1.2));

    // steering: pure pursuit on a point ahead along the line
    const look = Math.round(7 + spd * 0.5);
    const f = t.frame(i + look);
    to.set(f.x + f.nx * this.lane - p.x, 0, f.z + f.nz * this.lane - p.z).normalize();
    const cross = fwd.x * to.z - fwd.z * to.x;
    const dot = fwd.x * to.x + fwd.z * to.z;
    let steer = THREE.MathUtils.clamp(-Math.atan2(cross, dot) * 2.4, -1, 1);

    // speed plan: the slowest speed any corner ahead allows given our braking
    // in the wet or the snow the corners and the braking both come down with the grip
    const wg = v.weatherGrip ?? 1;
    const grip = this.diff.grip * this.skill * wg;
    // braking is weaker going downhill (Eruption's descent is steep), stronger uphill
    const grade = (t.at(t.wrap(i + 40))[1] - t.at(i)[1]) / 40;
    const decel = THREE.MathUtils.clamp(6 + 9.81 * grade, 2.5, 8) * (0.4 + 0.6 * wg);
    const horizon = Math.min(220, 30 + spd * spd / (2 * decel));
    let target = 60;
    for (let j = 6; j < horizon; j += 3) {
      const k = Math.abs(t.curv[t.wrap(i + j)]);
      const vmax = Math.sqrt(grip / Math.max(k, 1e-4));
      target = Math.min(target, Math.sqrt(vmax * vmax + 2 * decel * j));
    }
    target *= this.skill;
    // keep off the brakes on the lava jump approach so it clears the gap
    let jumping = false;
    for (const j of t.jumps) {
      const dj = t.ahead(i, j.at);
      if (dj > 0 && dj < 220) { target = Math.max(target, dj < 140 ? j.flat : j.speed); jumping ||= dj < 160 && j.flat >= 50; }
      // a heave ramp with nothing to clear: take it steady rather than flying it flat out
      if (j.max && dj > 0 && dj < 160) target = Math.min(target, j.max);
    }
    // occasional small mistakes on easier settings
    if (this.rnd() < this.diff.mistakes * dt * 0.2) this.lift = 0.6 + this.rnd() * 0.8;
    if (this.lift > 0) { this.lift -= dt; target *= 0.75; }

    let throttle = spd < target ? 1 : 0;
    let brake = spd > target + 1 ? THREE.MathUtils.clamp((spd - target) / 4, 0.25, 1) : 0;
    // boost on straights, and always for the lava jump run-up
    // AI drivers lift off before the tank runs dry, so their engines survive
    const boost = ((target > spd + 8 && v.boost > 1 - this.boostTaste && Math.abs(steer) < 0.25) || jumping) && v.boost > 0.07 ? 1 : 0;

    // rubber band: a few percent of power, towards the player
    v.power = 1 + THREE.MathUtils.clamp(leaderGap / 350, -1, 1) * this.diff.band;

    // stuck recovery
    if (this.reverse > 0) {
      this.reverse -= dt;
      throttle = 0; brake = 1; steer = -steer;
    } else if (spd < 1.5 && state.racing) {
      this.stuck += dt;
      if (this.stuck > 2.2) { this.reverse = 1.4; this.stuck = 0; this.tries = (this.tries || 0) + 1; }
    } else {
      this.stuck = 0;
      if (spd > 6) this.tries = 0;
    }
    if (this.tries >= 3) { this.tries = 0; state.respawn = true; }

    I.throttle = throttle; I.brake = brake; I.boost = boost; I.hand = 0;
    I.steer += (steer - I.steer) * Math.min(1, dt * 6);
  }
}
