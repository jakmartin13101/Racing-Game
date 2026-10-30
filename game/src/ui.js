import { PAINTS } from './vehicle.js';
import { CAMERAS } from './camera.js';
import { platform } from './settings.js';
import { regionById } from './regions.js';

const $ = (id) => document.getElementById(id);
const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
export const EVENTS = [
  { track: 'village', laps: 3, note: 'Street circuit through the village and round the fields' },
  { track: 'summit', laps: 1, note: 'Point-to-point hill climb to the lookout below the crater' },
  { track: 'caldera', laps: 2, note: 'A full lap of the volcano and the lava jump' },
  { track: 'eruption', laps: 1, note: 'The finale: up to the crater, a leap across it, and a race against the lava down the far side' },
];

export function fmt(t) {
  if (t == null || !isFinite(t)) return '–';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function paintCss(p) {
  // approximate swatch for the hue-rotated orange paint
  const base = [0.42, 0.075, 0.025];
  const k = [0.57735, 0.57735, 0.57735];
  const c = Math.cos(p.hue), s = Math.sin(p.hue);
  const d = base[0] * k[0] + base[1] * k[1] + base[2] * k[2];
  const cr = [k[1] * base[2] - k[2] * base[1], k[2] * base[0] - k[0] * base[2], k[0] * base[1] - k[1] * base[0]];
  let r = base.map((b, i) => b * c + cr[i] * s + k[i] * d * (1 - c));
  const lum = r[0] * 0.2126 + r[1] * 0.7152 + r[2] * 0.0722;
  r = r.map((v) => (lum + (v - lum) * p.sat) * p.val);
  const srgb = r.map((v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055))));
  return `rgb(${srgb.join(',')})`;
}

export function drawTrackShape(cv, track, { line = '#ffb41f', width = 4, bg = null, pad = 14 } = {}) {
  const g = cv.getContext('2d');
  const c = track.c || track.centre;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of c) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  const s = Math.min((cv.width - pad * 2) / (x1 - x0), (cv.height - pad * 2) / (z1 - z0));
  const ox = (cv.width - (x1 - x0) * s) / 2, oz = (cv.height - (z1 - z0) * s) / 2;
  const map = (x, z) => [ox + (x - x0) * s, oz + (z - z0) * s];
  g.clearRect(0, 0, cv.width, cv.height);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); }
  g.lineJoin = g.lineCap = 'round';
  for (const [w, col] of [[width + 4, 'rgba(0,0,0,.55)'], [width, line]]) {
    g.beginPath();
    for (let i = 0; i < c.length; i += 4) { const [x, y] = map(c[i][0], c[i][2]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    if (track.closed) g.closePath();
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
  }
  return map;
}

export class UI {
  constructor({ tracks, settings, save, handlers }) {
    Object.assign(this, { tracks, s: settings, save, h: handlers });
    this.root = $('ui');
    this.stack = [];
    this.quick = { track: 'caldera', laps: 2, opponents: 5, difficulty: 'normal' };
    this.champ = null;
    if (platform.desktopApp) document.body.classList.add('desktop');
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) this.go(b.dataset.go);
    });
    this.buildQuick();
    this.buildWorld();
    this.buildSettings();
    this.navKeys();
    $('foot').textContent = platform.desktopApp ? 'DESKTOP EDITION' : platform.mobile ? 'MOBILE · 30 FPS' : 'BROWSER EDITION';
  }

  show(id, push = true) {
    if (push && this.current && this.current !== id) this.stack.push(this.current);
    this.current = id;
    this.root.hidden = false;
    for (const s of this.root.querySelectorAll('.screen')) s.classList.toggle('on', s.id === `s-${id}`);
    this.focusFirst();
    if (id === 'world') this.renderEvents();
  }

  hide() { this.root.hidden = true; this.current = null; this.stack = []; }

  go(where) {
    const h = this.h;
    switch (where) {
      case 'back': { const prev = this.stack.pop() || 'title'; this.show(prev, false); h.onSettingsClosed?.(); break; }
      case 'title': this.stack = []; this.show('title', false); break;
      case 'quit': h.quit?.(); break;
      case 'start-quick': {
        const t = this.quick;
        this.champ = null;
        h.start({ track: t.track, laps: t.laps, opponents: t.opponents, difficulty: t.difficulty, paint: this.s.paint, mode: 'quick' });
        break;
      }
      case 'start-world': {
        if (!this.champ || this.champ.round >= EVENTS.length) this.champ = { round: 0, difficulty: this.quick.cdifficulty || 'normal', points: {} };
        this.startRound();
        break;
      }
      case 'resume': h.resume(); break;
      case 'restart': h.restart(); break;
      case 'quit-race': this.champ = this.champ && this.champ.round < EVENTS.length ? this.champ : null; h.quitRace(); break;
      case 'next-round': this.startRound(); break;
      case 'standings': this.showStandings(); break;
      default: this.show(where);
    }
  }

  startRound() {
    const ev = EVENTS[this.champ.round];
    this.h.start({ track: ev.track, laps: ev.laps, opponents: 7, difficulty: this.champ.difficulty, paint: this.s.paint, mode: 'world' });
  }

  // ------------------------------------------------------------ quick race
  buildQuick() {
    const cards = $('trackcards');
    cards.innerHTML = '';
    for (const t of this.tracks) {
      const b = document.createElement('button');
      b.className = 'card';
      b.dataset.track = t.id;
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 200;
      drawTrackShape(cv, t, { bg: '#1d1713', width: 5 });
      const info = document.createElement('div');
      info.innerHTML = `<b>${t.name}</b><span>${regionById(t.region || 'volcano').name} · ${t.closed ? 'Circuit' : 'Sprint'} · ${(t.n / 1000).toFixed(1)} km</span>`;
      b.append(cv, info);
      b.onclick = () => { this.quick.track = t.id; this.quick.laps = t.laps; this.refreshQuick(); };
      cards.append(b);
    }
    const step = (el, key, min, max, fmtv = (v) => v) => {
      el.innerHTML = '<button aria-label="Less">−</button><output></output><button aria-label="More">+</button>';
      const [dn, out, upb] = el.children;
      const set = (v) => { this.quick[key] = Math.max(min(), Math.min(max(), v)); out.textContent = fmtv(this.quick[key]); };
      dn.onclick = () => set(this.quick[key] - 1);
      upb.onclick = () => set(this.quick[key] + 1);
      el._refresh = () => set(this.quick[key]);
    };
    const q = (k) => this.root.querySelector(`[data-opt="${k}"]`);
    step(q('laps'), 'laps', () => 1, () => (this.trackById(this.quick.track).closed ? 6 : 1));
    step(q('opponents'), 'opponents', () => 0, () => 7);
    this.seg(q('difficulty'), ['easy', 'normal', 'hard'], () => this.quick.difficulty, (v) => { this.quick.difficulty = v; });
    this.swatches($('paints'));
    this.refreshQuick();
  }

  refreshQuick() {
    for (const c of $('trackcards').children) c.classList.toggle('sel', c.dataset.track === this.quick.track);
    for (const el of this.root.querySelectorAll('.step')) el._refresh?.();
    const lapsRow = this.root.querySelector('[data-opt="laps"]').parentElement;
    lapsRow.style.opacity = this.trackById(this.quick.track).closed ? 1 : 0.4;
  }

  trackById(id) { return this.tracks.find((t) => t.id === id); }

  seg(el, values, get, set, labels = values) {
    el.innerHTML = '';
    values.forEach((v, i) => {
      const b = document.createElement('button');
      b.textContent = labels[i];
      b.onclick = () => { set(v); [...el.children].forEach((c, j) => c.classList.toggle('sel', values[j] === get())); };
      el.append(b);
    });
    [...el.children].forEach((c, j) => c.classList.toggle('sel', values[j] === get()));
  }

  swatches(el) {
    el.innerHTML = '';
    PAINTS.forEach((p, i) => {
      const b = document.createElement('button');
      b.style.background = paintCss(p);
      b.title = p.name;
      b.setAttribute('aria-label', p.name);
      b.onclick = () => { this.save({ paint: i }); for (const sw of this.root.querySelectorAll('.swatches')) [...sw.children].forEach((c, j) => c.classList.toggle('sel', j === i)); };
      el.append(b);
    });
    [...el.children].forEach((c, j) => c.classList.toggle('sel', j === this.s.paint));
  }

  // ------------------------------------------------------------ world race
  buildWorld() {
    this.quick.cdifficulty = 'normal';
    this.seg(this.root.querySelector('[data-opt="cdifficulty"]'), ['easy', 'normal', 'hard'], () => this.quick.cdifficulty, (v) => { this.quick.cdifficulty = v; });
    this.swatches($('cpaints'));
  }

  renderEvents() {
    const ol = $('events');
    ol.innerHTML = '';
    const round = this.champ && this.champ.round < EVENTS.length ? this.champ.round : -1;
    EVENTS.forEach((ev, i) => {
      const t = this.trackById(ev.track);
      const li = document.createElement('li');
      if (round >= 0 && i < round) li.className = 'done';
      if (i === Math.max(round, 0)) li.classList.add('next');
      li.innerHTML = `<div><b>${t.name}</b><br><span>${ev.note} · ${t.closed ? `${ev.laps} laps` : 'sprint'}</span></div>`;
      ol.append(li);
    });
    $('worldbtn').textContent = round > 0 ? `Continue · Event ${round + 1}` : 'Start Championship';
  }

  // ------------------------------------------------------------ settings
  buildSettings() {
    const rows = $('settingrows');
    rows.innerHTML = '';
    const add = (label, hint, values, labels, key, after) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${label}${hint ? `<small>${hint}</small>` : ''}</span><div class="seg"></div>`;
      rows.append(row);
      this.seg(row.lastChild, values, () => this.s[key], (v) => { this.save({ [key]: v }); after?.(v); }, labels);
    };
    add('Graphics', platform.desktopApp ? 'High is the desktop default; Ultra needs a powerful graphics card' : 'Browser and phone builds default lower; Ultra needs a powerful graphics card', ['low', 'medium', 'high', 'ultra'], ['Low', 'Medium', 'High', 'Ultra'], 'quality',
      () => { $('setnote').textContent = 'Graphics change applies after a reload.'; this.h.onQualityChange?.(); });
    add('Frame rate', 'Cap saves battery on phones and laptops', [30, 60, 0], ['30', '60', 'Max'], 'fps', (v) => this.h.onFps?.(v));
    add('Camera', 'C key, Y button or CAM to cycle in a race', CAMERAS.map((c) => c.id), CAMERAS.map((c) => c.name), 'camera', (v) => this.h.onCamera?.(v));
    add('Touch steering', 'Tilt uses the phone\'s motion sensor', ['buttons', 'tilt'], ['Buttons', 'Tilt'], 'touchSteer', (v) => this.h.onTouch?.(v));
    add('Auto accelerate', 'Touch: the truck drives itself forward, brake to slow', [true, false], ['On', 'Off'], 'autoGas', () => this.h.onTouch?.());
    add('Steering assist', 'Gently keeps the truck on the racing line', [true, false], ['On', 'Off'], 'steerAssist');
    add('Show FPS', '', [true, false], ['On', 'Off'], 'showFps');
  }

  // ------------------------------------------------------------ results
  showResults(race, mode) {
    const head = $('reshead'), body = $('resbody'), act = $('resactions');
    const champ = mode === 'world' ? this.champ : null;
    $('restitle').textContent = champ ? `Event ${champ.round + 1} · ${race.track.name}` : `${race.track.name} · Results`;
    head.innerHTML = `<tr><th>Pos</th><th>Driver</th><th class="num">Time</th>${champ ? '<th class="num">Pts</th>' : ''}</tr>`;
    body.innerHTML = '';
    race.results.forEach((r, k) => {
      const pts = r.dnf ? 0 : POINTS[k] || 0;
      if (champ) champ.points[r.name] = (champ.points[r.name] || 0) + pts;
      const tr = document.createElement('tr');
      if (r.isPlayer) tr.className = 'me';
      tr.innerHTML = `<td>${r.pos}</td><td>#${r.number} ${r.name}</td><td class="num">${r.dnf ? 'DNF' : fmt(r.time)}</td>${champ ? `<td class="num">+${pts}</td>` : ''}`;
      body.append(tr);
    });
    act.innerHTML = '';
    const btn = (label, go, primary) => { const b = document.createElement('button'); b.textContent = label; b.dataset.go = go; if (primary) b.className = 'primary'; act.append(b); };
    if (champ) {
      champ.round++;
      btn('Standings', 'standings', true);
    } else {
      btn('Menu', 'title');
      btn('Race Again', 'restart', true);
    }
    this.show('results', false);
  }

  showStandings() {
    const champ = this.champ;
    const head = $('reshead'), body = $('resbody'), act = $('resactions');
    const final = champ.round >= EVENTS.length;
    $('restitle').textContent = final ? 'World Race · Final Standings' : `World Race · After Event ${champ.round}`;
    head.innerHTML = '<tr><th>Pos</th><th>Driver</th><th class="num">Points</th></tr>';
    body.innerHTML = '';
    const table = Object.entries(champ.points).sort((a, b) => b[1] - a[1]);
    table.forEach(([name, pts], k) => {
      const tr = document.createElement('tr');
      if (name === (this.s.driver || 'YOU')) tr.className = 'me';
      tr.innerHTML = `<td>${k + 1}</td><td>${name}${final && k === 0 ? ' · CHAMPION' : ''}</td><td class="num">${pts}</td>`;
      body.append(tr);
    });
    act.innerHTML = '';
    const btn = (label, go, primary) => { const b = document.createElement('button'); b.textContent = label; b.dataset.go = go; if (primary) b.className = 'primary'; act.append(b); };
    if (final) {
      const me = table.findIndex(([n]) => n === (this.s.driver || 'YOU')) + 1;
      $('restitle').textContent = me === 1 ? 'World Champion!' : `World Race · You finished P${me}`;
      this.champ = null;
      btn('Menu', 'title', true);
    } else {
      btn('Quit Championship', 'title');
      btn(`Next · ${this.trackById(EVENTS[champ.round].track).name}`, 'next-round', true);
    }
    this.show('results', false);
  }

  // ------------------------------------------------------------ keyboard / gamepad navigation
  focusables() {
    const s = this.root.querySelector('.screen.on');
    return s ? [...s.querySelectorAll('button')].filter((b) => b.offsetParent !== null) : [];
  }

  focusFirst() {
    const f = this.focusables();
    const pick = f.find((b) => b.classList.contains('primary')) || f[0];
    this.setFocus(pick);
  }

  setFocus(b) {
    for (const x of this.root.querySelectorAll('.focus')) x.classList.remove('focus');
    if (!b) return;
    b.classList.add('focus');
    b.focus({ preventScroll: false });
    this.focused = b;
  }

  move(dx, dy) {
    const f = this.focusables();
    if (!f.length) return;
    const cur = this.focused && f.includes(this.focused) ? this.focused : f[0];
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bd = Infinity;
    for (const b of f) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = dx ? x * dx : y * dy;
      if (along <= 4) continue;
      const across = dx ? Math.abs(y) : Math.abs(x);
      const d = along + across * 2.5;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.setFocus(best);
  }

  navKeys() {
    addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
      if (m) { e.preventDefault(); this.move(...m); }
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.focused?.click(); }
      if (e.code === 'Escape' || e.code === 'Backspace') {
        if (this.current === 'pause') this.go('resume');
        else if (this.current !== 'title' && this.current !== 'results') this.go(this.current === 'settings' ? 'back' : 'title');
      }
    });
    // gamepad: d-pad / stick to move, A to select, B to go back
    const prev = {};
    let held = 0;
    const poll = () => {
      requestAnimationFrame(poll);
      if (this.root.hidden) return;
      const gp = navigator.getGamepads?.().find((g) => g && g.connected);
      if (!gp) return;
      const edge = (i) => { const p = !!gp.buttons[i]?.pressed; const r = p && !prev[i]; prev[i] = p; return r; };
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const dir = edge(12) || ay < -0.6 ? [0, -1] : edge(13) || ay > 0.6 ? [0, 1] : edge(14) || ax < -0.6 ? [-1, 0] : edge(15) || ax > 0.6 ? [1, 0] : null;
      if (dir) { if (held <= 0) { this.move(...dir); held = 14; } else held--; } else held = 0;
      if (edge(0)) this.focused?.click();
      if (edge(1)) { if (this.current === 'pause') this.go('resume'); else if (this.current !== 'title') this.go('back'); }
    };
    poll();
  }
}
