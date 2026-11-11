// Renders the cinematic stills that fade behind the menus and the track picker (public/menu/*.jpg).
//   npm run dev                              (in another terminal)
//   node tools/menu-shots.mjs [name …]       all the shots, or just the named ones
// Each shot is a ?race=… test URL (see the README) stepped headlessly to the moment wanted, then drawn once from
// a camera placed round one of the trucks, and saved from the game's own canvas (so no HUD). Options, as
// environment variables: URL=http://… OUT=dir Q=ultra|high W=1920 H=1080 GPU=1 (use the machine's graphics card
// rather than the software renderer; much faster, and the same pictures).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright'); // (a global install works too)
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL || 'http://127.0.0.1:5173/';
const OUT = process.env.OUT || path.join(here, '..', 'public', 'menu');
const Q = process.env.Q || 'ultra';
const W = +(process.env.W || 1920), H = +(process.env.H || 1080);

// name: { q: the race, step: physics steps (60 a second) before the picture, car: which truck the camera is on
// (0 is pole; default the player's), cam: 'tv' for the trackside camera or { a: angle round from the nose (rad),
// d: distance, h: height, l: look-at height, fov } }. One per track, named after it (the track picker shows it
// behind the track), then the smashes and the weather (EXTRA_SHOTS in src/menu.js).
export const SHOTS = {
  caldera: { q: 'race=caldera&ai=7&auto&weather=clear&time=day', step: 420, cam: { a: 0.35, d: 9, h: 0.8, l: 1.2, fov: 40 } },
  summit: { q: 'race=summit&ai=7&auto&weather=clear&time=day', step: 1100, car: 0, cam: { a: -0.5, d: 8, h: 1.2, l: 1 } },
  village: { q: 'race=village&ai=7&auto&weather=clear&time=evening', step: 1100, car: 0, cam: { a: -0.5, d: 8, h: 1.2, l: 1 } },
  // (the leap across the crater: placed just short of the lip at launch speed, caught mid-flight over the lava lake)
  eruption: { q: 'race=eruption&ai=0&at=3185&ram=34&auto&weather=clear&time=evening', step: 115, cam: { a: 2.9, d: 10, h: 5, l: -3, fov: 60 } },
  kahakai: { q: 'race=kahakai&ai=7&auto&weather=clear&time=day', step: 1300, car: 0, cam: { a: 0.45, d: 8, h: 0.9, l: 1.1, fov: 42 } },
  wailele: { q: 'race=wailele&ai=7&auto&weather=clear&time=day', step: 520, car: 0, cam: { a: 0.5, d: 7, h: 1, l: 1 } },
  palikai: { q: 'race=palikai&ai=7&auto&weather=clear&time=evening', step: 520, car: 0, cam: { a: 0.5, d: 7, h: 1, l: 1 } },
  kulapele: { q: 'race=kulapele&ai=7&auto&weather=clear&time=day', step: 520, car: 0, cam: { a: 0.5, d: 7, h: 1, l: 1 } },
  ahikekai: { q: 'race=ahikekai&ai=7&auto&weather=clear&time=evening', step: 520, car: 0, cam: { a: 0.5, d: 7, h: 1, l: 1 } },
  // a wall at 108 km/h, a wreck's fuel tank going up, a thunderstorm in the village, the lava field at night
  smash: { q: 'race=village&ai=0&at=100&yaw=1.5&ram=30&weather=clear&time=day', step: 151, cam: { a: 1.47, d: 7, h: 2.2, l: 0.5 } },
  fireball: { q: 'race=caldera&ai=0&at=60&dent=front:30,left:26,rear:26&boomt=1.2&weather=clear&time=day', step: 146, cam: { a: 3.25, d: 14, h: 2.5, l: 1.5 } },
  storm: { q: 'race=village&ai=7&auto&weather=storm&time=evening', step: 520, car: 0, cam: { a: 0.5, d: 7, h: 1, l: 1 } },
  night: { q: 'race=kulapele&ai=7&auto&weather=clear&time=night', step: 520, car: 0, cam: { a: 0.5, d: 7, h: 1, l: 1 } },
};

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(SHOTS);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: process.env.GPU ? ['--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const name of names) {
  const shot = SHOTS[name];
  if (!shot) { console.log(`${name}: no such shot`); continue; }
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${BASE}?${shot.q}&still=1&q=${Q}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  const jpeg = await page.evaluate(({ step, car, cam }) => {
    window.__follow = car ?? null;
    for (let i = 0; i < step - 3; i++) window.__step(1 / 60);
    const rig = window.__rig;
    if (typeof cam === 'string') { rig.cinematic(false); rig.setMode(cam); } else {
      rig.cinematic(true);
      Object.assign(rig, { cineDist: cam.d ?? 6.5, cineH: cam.h ?? 1.4, cineLook: cam.l ?? 1.2, cineFov: cam.fov || 0 });
      rig.cine.a = cam.a;
    }
    // two frames: the first settles the camera, so the motion blur is of the trucks moving and not of the cut
    window.__frame(1 / 60); window.__frame(1 / 60);
    const cv = document.createElement('canvas');
    cv.width = innerWidth; cv.height = innerHeight;
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(document.querySelector('body > canvas'), 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  }, shot);
  const file = path.join(OUT, `${name}.jpg`);
  writeFileSync(file, Buffer.from(jpeg.split(',')[1], 'base64'));
  console.log(`${name}: ${file} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  await page.close();
}
await browser.close();
