// Keyboard, gamepad and on-screen touch controls, merged into one driver input.
export class Input {
  constructor(settings) {
    this.s = settings;
    this.keys = {};
    this.touch = {};
    this.handlers = {};
    this.tilt = 0;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      const map = { KeyC: 'camera', KeyR: 'reset', Escape: 'pause', KeyP: 'pause', Enter: 'confirm' };
      if (map[e.code]) this.fire(map[e.code]);
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.touch = {}; });
    this.pad = { prev: [] };
  }

  on(name, fn) { this.handlers[name] = fn; }
  fire(name) { this.handlers[name]?.(); }

  // Multi-touch buttons: each pointer is tracked on the element it went down on.
  bindTouch(root) {
    for (const el of root.querySelectorAll('[data-k]')) {
      const k = el.dataset.k;
      const down = (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('on');
        if (k === 'camera' || k === 'pause' || k === 'reset') this.fire(k);
        else this.touch[k] = true;
      };
      const up = (e) => { e.preventDefault(); el.classList.remove('on'); this.touch[k] = false; };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }
  }

  enableTilt() {
    const onTilt = (e) => {
      const landscape = (screen.orientation?.angle ?? window.orientation ?? 0) % 180 !== 0;
      const sign = (screen.orientation?.angle ?? window.orientation ?? 0) === 270 || window.orientation === -90 ? -1 : 1;
      const a = landscape ? (e.beta || 0) * sign : (e.gamma || 0);
      this.tilt = Math.max(-1, Math.min(1, -a / 25));
    };
    const start = () => addEventListener('deviceorientation', onTilt);
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      DeviceOrientationEvent.requestPermission().then((r) => r === 'granted' && start()).catch(() => {});
    } else start();
  }

  read() {
    const k = this.keys, t = this.touch;
    let throttle = (k.KeyW || k.ArrowUp || t.gas) ? 1 : 0;
    let brake = (k.KeyS || k.ArrowDown || t.brake) ? 1 : 0;
    let steer = ((k.KeyA || k.ArrowLeft || t.left) ? 1 : 0) - ((k.KeyD || k.ArrowRight || t.right) ? 1 : 0);
    let hand = (k.Space || t.hand) ? 1 : 0;
    let boost = (k.ShiftLeft || k.ShiftRight || t.boost) ? 1 : 0;
    let analog = false;
    const gp = navigator.getGamepads?.().find((g) => g && g.connected);
    if (gp) {
      throttle = Math.max(throttle, gp.buttons[7]?.value || 0);
      brake = Math.max(brake, gp.buttons[6]?.value || 0);
      if (Math.abs(gp.axes[0]) > 0.12) { steer = -gp.axes[0]; analog = true; }
      hand = Math.max(hand, gp.buttons[0]?.value || 0);
      boost = Math.max(boost, gp.buttons[1]?.value || gp.buttons[5]?.value || 0);
      const edge = (b, name) => { const p = !!gp.buttons[b]?.pressed; if (p && !this.pad.prev[b]) this.fire(name); this.pad.prev[b] = p; };
      edge(3, 'camera'); edge(9, 'pause'); edge(8, 'reset');
    }
    const touching = this.s.touchUi;
    if (touching && this.s.touchSteer === 'tilt') { steer = this.tilt; analog = true; }
    if (touching && this.s.autoGas && !brake) throttle = 1;
    return { throttle, brake, steer, hand, boost, analog, touching };
  }
}
