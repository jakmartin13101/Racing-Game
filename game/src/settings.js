// Player settings with per-platform defaults, persisted in localStorage when available.
const KEY = 'gravel-riot-settings-v1';

export const platform = (() => {
  const ua = navigator.userAgent;
  const params = new URLSearchParams(location.search);
  const desktopApp = /Electron/i.test(ua) || params.has('desktop');
  const phone = /Android|iPhone|iPod|Mobile/i.test(ua) || params.has('mobile');
  const tablet = /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const touch = phone || tablet || matchMedia('(pointer: coarse)').matches || params.has('touch');
  return { desktopApp, phone, tablet, touch, mobile: phone || tablet };
})();

// Graphics presets. Browser and phone builds run lighter and capped at 30 fps; the desktop app goes full quality.
export const PRESETS = {
  low: { terrainStep: 4, fieldRocks: 220, shadow: 1024, ao: false, pixelRatio: 1.25, aiLod: true, bloom: true, damageDetail: 0.4, blurSamples: 6 },
  medium: { terrainStep: 3, fieldRocks: 450, shadow: 2048, ao: false, pixelRatio: 1.5, aiLod: true, bloom: true, damageDetail: 0.7, blurSamples: 8 },
  high: { terrainStep: 2, fieldRocks: 700, shadow: 4096, ao: true, pixelRatio: 2, aiLod: false, bloom: true, damageDetail: 1, blurSamples: 12 },
};

function defaults() {
  return {
    quality: platform.desktopApp ? 'high' : platform.mobile ? 'low' : 'medium',
    fps: platform.desktopApp ? 0 : 30, // 0 = uncapped (vsync)
    camera: 'chase',
    touchSteer: 'buttons', // buttons | tilt
    autoGas: platform.touch,
    steerAssist: platform.touch,
    showFps: false,
    driver: 'YOU',
    paint: 0,
  };
}

let current = null;
export function settings() {
  if (current) return current;
  current = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    Object.assign(current, s);
  } catch { /* storage unavailable */ }
  const params = new URLSearchParams(location.search);
  if (params.has('lowq')) current.quality = 'low';
  if (params.has('q')) current.quality = params.get('q');
  if (params.has('fps')) current.fps = +params.get('fps');
  if (!PRESETS[current.quality]) current.quality = 'medium';
  return current;
}

export function saveSettings(patch) {
  Object.assign(settings(), patch);
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
}

export function quality() {
  const s = settings();
  const q = { ...PRESETS[s.quality] };
  const params = new URLSearchParams(location.search);
  if (params.has('ao')) q.ao = params.get('ao') === '1';
  q.pixelRatio = Math.min(devicePixelRatio, q.pixelRatio);
  return q;
}
