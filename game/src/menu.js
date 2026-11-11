// Behind the menus: cinematic stills of the game that fade slowly into one another, each drifting a little
// like a camera on a slow push or pan (the 3D world is not drawn while they show). And the track picker's
// animated map: the selected track turning slowly in 3D with its hills and drops, the pack running round it.
// The stills are rendered by tools/menu-shots.mjs into public/menu/.
const BASE = import.meta.env.BASE_URL;
export const shotUrl = (name) => `${BASE}menu/${name}.jpg`;
// stills that are not of one track in particular: smashes, fire, weather
export const EXTRA_SHOTS = ['smash', 'fireball', 'storm', 'night'];

// start and end of each drift: scale, x %, y %
const DRIFTS = [
  [1.04, 0, 0, 1.13, -1.2, -0.6], [1.13, 1.4, 0.6, 1.04, 0, 0], [1.08, -1.6, 0, 1.08, 1.6, -0.4],
  [1.05, 0.8, 0.8, 1.14, -0.6, -0.8], [1.12, -1.2, -0.6, 1.05, 0.6, 0.4], [1.08, 1.6, 0.3, 1.09, -1.6, 0],
];
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Backdrop {
  constructor(el) {
    this.el = el;
    this.layers = [0, 1].map(() => { const d = document.createElement('div'); d.className = 'bd'; el.append(d); return d; });
    this.top = 0;
    this.list = [];
    this.at = -1;
    this.n = 0;
    this.token = 0;
    this.on = false;
    this.timer = 0;
    this.current = null;
    this.missing = new Set();
  }

  // shown only in the menus; a race draws the world instead
  show(on) {
    if (on === this.on) return;
    this.on = on;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.toggle('on', on);
    clearTimeout(this.hideT);
    if (!on) { this.hideT = setTimeout(() => { this.el.hidden = true; }, 700); clearTimeout(this.timer); }
    else if (this.list.length > 1) this.queue();
  }

  // a run of stills that keep fading on, one into the next
  play(names, every = 10000) {
    if (names.join() === this.list.join() && this.every === every) return;
    this.list = names; this.every = every;
    this.at = Math.floor(Math.random() * names.length) - 1;
    this.next();
  }

  // one still, held (the track being picked)
  hold(name) {
    this.list = [name];
    clearTimeout(this.timer);
    if (this.current !== name) this.swap(name);
  }

  queue() {
    clearTimeout(this.timer);
    if (this.on && this.list.length > 1) this.timer = setTimeout(() => this.next(), this.every);
  }

  async next() {
    for (let k = 0; k < this.list.length; k++) {
      this.at = (this.at + 1) % this.list.length;
      if (this.missing.has(this.list[this.at])) continue;
      if (await this.swap(this.list[this.at]) !== null) break;
    }
    this.queue();
  }

  // fade to a still: null if it could not be loaded, false if another was asked for meanwhile
  async swap(name) {
    const token = ++this.token;
    const url = shotUrl(name);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { this.missing.add(name); return null; }
    if (token !== this.token) return false;
    const prev = this.layers[this.top];
    this.top ^= 1;
    const next = this.layers[this.top];
    // the new still starts clear on top of the old one and fades in over it
    next.style.transition = 'none';
    next.classList.remove('on');
    next.style.zIndex = 2; prev.style.zIndex = 1;
    next.style.backgroundImage = `url("${url}")`;
    for (const a of next.getAnimations?.() || []) a.cancel();
    if (!calm && next.animate) {
      const d = DRIFTS[this.n++ % DRIFTS.length];
      next.animate([{ transform: `scale(${d[0]}) translate(${d[1]}%, ${d[2]}%)` }, { transform: `scale(${d[3]}) translate(${d[4]}%, ${d[5]}%)` }],
        { duration: 26000, easing: 'ease-in-out', fill: 'both' });
    }
    void next.offsetWidth;
    next.style.transition = '';
    next.classList.add('on');
    this.current = name;
    return true;
  }
}

// ---------------------------------------------------------------- the animated track map
const AMBER = [255, 180, 31];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// A track drawn from its centre line ([x, y, z] rows). flat: a plan view with the pack lapping it (the track
// cards). Otherwise it turns slowly in 3D, its height drawn out and hung on a faint curtain, so the climbs,
// drops and jumps read at a glance.
export class TrackPreview {
  constructor(canvas, { flat = false } = {}) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.flat = flat;
    this.pts = null;
    this.raf = 0;
    this.tick = (now) => { this.raf = requestAnimationFrame(this.tick); this.draw(now); };
    // (resizing can also bring the map's panel into view, so it wakes the animation too)
    if (!flat && typeof ResizeObserver === 'function') new ResizeObserver(() => { this.fit(); this.start(); }).observe(canvas);
  }

  fit() {
    if (this.flat) return;
    const r = this.cv.getBoundingClientRect();
    const k = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * k), h = Math.round(r.height * k);
    if (w && h && (w !== this.cv.width || h !== this.cv.height)) { this.cv.width = w; this.cv.height = h; }
  }

  set(track) {
    if (track === this.track) { this.start(); return; }
    this.track = track;
    const c = track.c || track.centre;
    const step = Math.max(1, Math.round(c.length / 420));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of c) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let rad = 1;
    for (const p of c) rad = Math.max(rad, Math.hypot(p[0] - cx, p[2] - cz));
    // heights drawn out so a hill shows, but never taller than about a third of the map
    const lift = Math.min(3, 0.36 * rad / Math.max(1, y1 - y0));
    this.pts = [];
    for (let i = 0; i < c.length; i += step) this.pts.push([(c[i][0] - cx) / rad, (c[i][1] - y0) * lift / rad, (c[i][2] - cz) / rad]);
    this.box = { w: (x1 - x0) / rad, h: (z1 - z0) / rad };
    this.closed = !!track.closed;
    // the lights go out a little way along the grid
    this.u0 = track.closed ? 0 : 0.01;
    this.lap = Math.max(6, Math.min(14, c.length / 420));
    this.t0 = performance.now();
    this.start();
  }

  start() { if (!this.raf && this.pts) { this.fit(); this.raf = requestAnimationFrame(this.tick); } }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  // a point along the track, 0..1
  along(u, out) {
    const P = this.pts, n = P.length;
    const f = (this.closed ? ((u % 1) + 1) % 1 : Math.min(Math.max(u, 0), 0.9999)) * (this.closed ? n : n - 1);
    const i = Math.floor(f), a = P[i % n], b = P[(i + 1) % n], k = f - i;
    out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k;
    return out;
  }

  draw(now) {
    const { cv, g, pts: P, flat } = this;
    if (!cv.isConnected || !cv.offsetParent) { this.stop(); return; } // off screen: wait to be started again
    const W = cv.width, H = cv.height, t = (now - this.t0) / 1000;
    const px = Math.max(1, Math.min(W, H) / 300);
    g.clearRect(0, 0, W, H);
    // the view: plan, or turning slowly and looked down on at an angle
    const yaw = flat ? 0 : 0.6 + t * (calm ? 0 : 0.2), pitch = flat ? Math.PI / 2 : 0.6;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const pad = flat ? 14 * px : 22 * px;
    const s = flat ? Math.min((W - pad * 2) / this.box.w, (H - pad * 2) / this.box.h) : Math.min((W - pad * 2) / 2.4, (H - pad * 2) / 1.75);
    const ox = W / 2, oy = flat ? H / 2 : H / 2 + s * 0.15;
    const proj = (p, out) => {
      const x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy;
      const d = z * cp + p[1] * sp, k = flat ? 1 : 1 / (1 - d * 0.16);
      out[0] = ox + x * s * k; out[1] = oy + (z * sp - p[1] * cp) * s * k; out[2] = d;
      return out;
    };
    const n = P.length, last = this.closed ? n : n - 1;
    // the line draws itself in when a track is picked
    const shown = Math.min(1, t / 0.9), end = Math.floor(last * shown);
    const a = [0, 0, 0], b = [0, 0, 0], q = [0, 0, 0];
    g.lineCap = g.lineJoin = 'round';
    if (!flat) {
      // the ground under the track, and the curtain it hangs on
      g.beginPath();
      for (let i = 0; i <= end; i++) { const p = P[i % n]; proj([p[0], 0, p[2]], a); i ? g.lineTo(a[0], a[1]) : g.moveTo(a[0], a[1]); }
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 5 * px; g.stroke();
      g.strokeStyle = rgba(AMBER, 0.13); g.lineWidth = px;
      g.beginPath();
      for (let i = 0; i <= end; i += 3) { const p = P[i % n]; if (p[1] < 0.004) continue; proj(p, a); proj([p[0], 0, p[2]], b); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      g.stroke();
    }
    // the track itself: a dark edge, then the line, brighter and thicker where it is nearer
    g.beginPath();
    for (let i = 0; i <= end; i++) { proj(P[i % n], a); i ? g.lineTo(a[0], a[1]) : g.moveTo(a[0], a[1]); }
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = (flat ? 9 : 7.5) * px; g.stroke();
    if (flat) { g.strokeStyle = rgba(AMBER, 1); g.lineWidth = 5 * px; g.stroke(); }
    else {
      for (let i = 0; i < end; i++) {
        proj(P[i % n], a); proj(P[(i + 1) % n], b);
        const near = Math.min(1, Math.max(0, (a[2] + 1) / 2));
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
        g.strokeStyle = rgba(AMBER, 0.5 + near * 0.5); g.lineWidth = (2.6 + near * 2.4) * px; g.stroke();
      }
    }
    // the start line (and the finish of a sprint)
    const flag = (u, col) => {
      proj(this.along(u, q), a); proj(this.along(u + 0.004, q), b);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, w = 7 * px;
      g.beginPath(); g.moveTo(a[0] - dy / L * w, a[1] + dx / L * w); g.lineTo(a[0] + dy / L * w, a[1] - dx / L * w);
      g.strokeStyle = col; g.lineWidth = 2.5 * px; g.stroke();
    };
    flag(this.u0, 'rgba(255,255,255,.95)');
    if (!this.closed && shown >= 1) flag(0.985, 'rgba(255,255,255,.95)');
    if (shown < 1) return;
    // the pack: a leader with a glowing tail and three trucks chasing; a sprint runs start to finish and goes again
    const T = this.lap, tt = t - 0.9;
    const lead = this.closed ? tt / T : this.u0 + Math.min(1, (tt % (T + 1.2)) / T) * (0.985 - this.u0);
    for (let k = 24; k >= 1; k--) {
      const u = lead - k * 0.0028;
      if (!this.closed && u < this.u0) continue;
      proj(this.along(u, q), a); proj(this.along(u + 0.0028, q), b);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      g.strokeStyle = `rgba(255,236,190,${(1 - k / 24) * 0.85})`; g.lineWidth = (flat ? 5 : 4.5) * px; g.stroke();
    }
    const cars = [[0.022, 0.75], [0.037, 0.6], [0.061, 0.5]];
    for (const [gap, al] of cars) {
      const u = lead - gap * (1 + 0.25 * Math.sin(tt * 0.7 + gap * 90));
      if (!this.closed && u < this.u0) continue;
      proj(this.along(u, q), a);
      g.beginPath(); g.arc(a[0], a[1], 3.2 * px, 0, 6.3); g.fillStyle = `rgba(216,208,196,${al})`; g.fill();
    }
    proj(this.along(lead, q), a);
    const glow = g.createRadialGradient(a[0], a[1], 0, a[0], a[1], 16 * px);
    glow.addColorStop(0, 'rgba(255,214,120,.75)'); glow.addColorStop(1, 'rgba(255,180,31,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(a[0], a[1], 16 * px, 0, 6.3); g.fill();
    g.beginPath(); g.arc(a[0], a[1], 5 * px, 0, 6.3); g.fillStyle = '#fff3d6'; g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1.5 * px; g.stroke();
  }
}

// length and climb of a track, for the picker ("4.3 km · 115 m of climb")
export function trackFacts(track) {
  const c = track.c || track.centre;
  let up = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < c.length; i++) {
    lo = Math.min(lo, c[i][1]); hi = Math.max(hi, c[i][1]);
    if (i >= 8) up += Math.max(0, c[i][1] - c[i - 8][1]) / 8;
  }
  return { km: c.length / 1000, climb: Math.round(up), drop: Math.round(up - (c[c.length - 1][1] - c[0][1])), lo, hi };
}
