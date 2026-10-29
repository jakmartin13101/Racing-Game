import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, NoiseEffect, BlendFunction, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { loadWorld, loadMaterials, buildTerrain, buildTrackRibbon, buildLava, setAniso } from './world.js';
import { buildSky, buildPlume, buildAsh, Dust } from './fx.js';
import { buildProps } from './props.js';
import { buildVillage } from './village.js';
import { initPhysics, loadTruckAssets, addStaticBoxes } from './vehicle.js';
import { Track } from './track.js';
import { Race } from './race.js';
import { AIDriver, DIFFICULTY } from './ai.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { UI, fmt, drawTrackShape } from './ui.js';
import { settings, saveSettings, quality as qualityPreset, platform } from './settings.js';
import { mulberry } from './world.js';

const params = new URLSearchParams(location.search);
const S = settings();
const quality = qualityPreset();
const $ = (id) => document.getElementById(id);
const loadStep = (frac, txt) => { $('loadbar').style.width = `${Math.round(frac * 100)}%`; if (txt) $('loadtxt').textContent = txt; };

// ---------------------------------------------------------------- renderer and scene
const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
setAniso(Math.min(renderer.capabilities.getMaxAnisotropy(), quality.terrainStep > 3 ? 4 : 16));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 9000);

loadStep(0.05, 'LOADING SKY…');
const { sun } = await buildSky(renderer, scene);
const fogColor = new THREE.Color(0.62, 0.64, 0.66);
scene.fog = new THREE.FogExp2(fogColor, 0.00028);

const sunLight = new THREE.DirectionalLight(0xfff0dc, 2.8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(quality.shadow, quality.shadow);
const sc = sunLight.shadow.camera;
sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 900;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight, sunLight.target);
scene.add(new THREE.HemisphereLight(0x9fb2c8, 0x3a2a20, 0.1));

loadStep(0.15, 'LOADING VOLCANIC REGION…');
const world = await loadWorld();
const tracks = world.data.tracks.map((t) => new Track(t, world));
const trackById = (id) => tracks.find((t) => t.id === id) || tracks[0];
const M = loadMaterials();
loadStep(0.3, 'BUILDING TERRAIN…');
scene.add(buildTerrain(world, M, quality));
for (const t of tracks) scene.add(buildTrackRibbon(world, M, t));
const lava = buildLava(world, M);
scene.add(lava);
const plume = buildPlume(world, M, sun);
plume.material.uniforms.uFogColor.value.copy(fogColor);
plume.material.uniforms.uFogDensity.value = scene.fog.density;
scene.add(plume);
const ash = buildAsh();
scene.add(ash);
const dust = new Dust(M, 700);
dust.mat.uniforms.uSun.value.copy(sun);
scene.add(dust.mesh);
loadStep(0.45, 'PLACING ROCKS AND PROPS…');
const props = await buildProps(world, scene, M, quality, tracks);
loadStep(0.6, 'BUILDING ASHFALL VILLAGE…');
const village = await buildVillage(world, scene, M, quality, tracks);
loadStep(0.72, 'STARTING PHYSICS…');
const phys = await initPhysics(world);
addStaticBoxes(phys, village.colliders);
loadStep(0.8, 'LOADING TRUCKS…');
const assets = await loadTruckAssets(renderer);

// lava light: warm fill near the camera, scaled by proximity to lava
const lavaLight = new THREE.PointLight(0xff5a1a, 0, 45, 2);
scene.add(lavaLight);
const lavaPts = [];
for (const r of world.data.rivers) for (let i = 0; i < r.points.length; i += 3) lavaPts.push(r.points[i]);
lavaPts.push([world.data.lake.x, world.data.lake.y, world.data.lake.z]);
function nearestLava(pos) {
  let best = lavaPts[0], bd = Infinity;
  for (const p of lavaPts) {
    const d = (p[0] - pos.x) ** 2 + (p[2] - pos.z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return { pos: new THREE.Vector3(best[0], best[1] + 4, best[2]), strength: Math.max(0, 1 - Math.sqrt(bd) / 90) };
}

// ---------------------------------------------------------------- post-processing
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
if (quality.ao) {
  const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  ao.configuration.aoRadius = 2.5;
  ao.configuration.distanceFalloff = 1.2;
  ao.configuration.intensity = 2.2;
  ao.configuration.halfRes = true;
  ao.configuration.gammaCorrection = false;
  composer.addPass(ao);
}
const bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
const grade = new HueSaturationEffect({ saturation: 0.05 });
const contrast = new BrightnessContrastEffect({ contrast: 0.12, brightness: -0.02 });
const vignette = new VignetteEffect({ darkness: 0.45, offset: 0.3 });
const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
grain.blendMode.opacity.value = 0.06;
composer.addPass(new EffectPass(camera, bloom));
composer.addPass(new EffectPass(camera, tone, grade, contrast, vignette, grain, new SMAAEffect()));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- game state
const rig = new CameraRig(camera, world);
rig.setMode(S.camera);
const input = new Input(S);
const touchEl = $('touch');
S.touchUi = platform.touch;
function refreshTouch() {
  touchEl.classList.toggle('tilt', S.touchSteer === 'tilt');
  touchEl.classList.toggle('autogas', !!S.autoGas);
  document.body.classList.toggle('touchui', !!S.touchUi);
}
input.bindTouch(touchEl);
refreshTouch();
if (S.touchUi && S.touchSteer === 'tilt') input.enableTilt();

let race = null, raceCfg = null, state = 'menu', menuT = 0;
const hud = {
  root: $('hud'), pos: $('pos'), poscount: $('poscount'), lap: $('lap'), laps: $('laps'), lapline: $('lapline'), track: $('trackname'),
  time: $('time'), best: $('best'), speed: $('speed'), boost: $('boostbar'), msg: $('msg'), board: $('board'), map: $('map'), fps: $('fps'), toast: $('toast'),
};
let mapBase = null, mapFn = null;

const ui = new UI({
  tracks, settings: S, save: saveSettings,
  handlers: {
    start: startRace,
    resume: () => setPaused(false),
    restart: () => raceCfg && startRace(raceCfg),
    quitRace: () => toMenu(),
    quit: () => window.close(),
    onCamera: (v) => rig.setMode(v),
    onTouch: () => { refreshTouch(); if (S.touchSteer === 'tilt') input.enableTilt(); },
    onQualityChange: () => {},
    onSettingsClosed: () => {
      if (S.quality !== loadedQuality) {
        // graphics presets rebuild the terrain and shadow maps, so reload into the menu
        location.reload();
      }
    },
  },
});
const loadedQuality = S.quality;

input.on('camera', () => { if (state === 'race') { const c = rig.next(); toast(`${c.name} camera`); saveSettings({ camera: c.id }); } });
input.on('pause', () => { if (state === 'race') setPaused(true); else if (state === 'paused' && ui.current === 'pause') setPaused(false); });
input.on('reset', () => { if (state === 'race' && race && race.clock > 0) race.respawn(race.player); });

let toastT = 0;
function toast(t) { hud.toast.textContent = t; hud.toast.classList.add('on'); toastT = 1.6; }

function setPaused(p) {
  if (!race) return;
  state = p ? 'paused' : 'race';
  if (p) ui.show('pause', false); else ui.hide();
  touchEl.hidden = p || !S.touchUi;
}

function toMenu() {
  race?.dispose();
  race = null;
  state = 'menu';
  hud.root.hidden = true;
  touchEl.hidden = true;
  ui.show(ui.champ && ui.champ.round > 0 ? 'world' : 'title', false);
}

function startRace(cfg) {
  raceCfg = cfg;
  race?.dispose();
  const track = trackById(cfg.track);
  race = new Race({
    phys, scene, assets, track, opponents: cfg.opponents, difficulty: cfg.difficulty, laps: cfg.laps,
    playerPaint: cfg.paint ?? 0, quality, playerName: S.driver || 'YOU', seed: (cfg.seed ?? Date.now()) & 0xffff,
  });
  if (params.has('auto')) race.player.ai = new AIDriver(race.player.v, track, DIFFICULTY.hard, mulberry(99));
  state = 'race';
  ui.hide();
  hud.root.hidden = false;
  touchEl.hidden = !S.touchUi;
  hud.track.textContent = track.name;
  hud.lapline.style.display = track.closed ? '' : 'none';
  hud.laps.textContent = race.laps;
  hud.poscount.textContent = race.cars.length;
  hud.best.textContent = '';
  hud.msg.textContent = '';
  // minimap base drawing
  mapBase = document.createElement('canvas');
  mapBase.width = hud.map.width; mapBase.height = hud.map.height;
  mapFn = drawTrackShape(mapBase, track, { line: 'rgba(255,236,210,.85)', width: 4 });
  rig.setMode(S.camera);
  lastCount = null;
  lapStart = 0; bestLap = null; lastLap = 0;
}

let lastCount = null, lapStart = 0, bestLap = null, lastLap = 0;
function updateHud(dt) {
  const st = race.player;
  const cd = race.countdown;
  if (race.clock < 0.9) {
    const txt = cd > 0 ? String(cd) : 'GO!';
    if (txt !== lastCount) { hud.msg.textContent = txt; hud.msg.classList.remove('pop'); void hud.msg.offsetWidth; hud.msg.classList.add('pop'); lastCount = txt; }
  } else if (lastCount === 'GO!') { hud.msg.textContent = ''; lastCount = ''; }
  hud.pos.textContent = race.positionOf(st);
  hud.lap.textContent = race.lapOf(st);
  hud.time.textContent = fmt(st.finished ? st.time : race.t);
  // lap timing for circuits
  if (race.track.closed && st.lap > lastLap && st.lap >= 1) {
    const lt = race.t - lapStart;
    lapStart = race.t;
    bestLap = bestLap ? Math.min(bestLap, lt) : lt;
    hud.best.textContent = `BEST LAP ${fmt(bestLap)}`;
    if (st.lap === race.laps - 1) toast('Final lap');
  }
  lastLap = Math.max(lastLap, st.lap);
  if (st.finished && hud.msg.dataset.fin !== '1') {
    hud.msg.dataset.fin = '1';
    const p = race.positionOf(st);
    hud.msg.textContent = p === 1 ? 'WINNER!' : `P${p}`;
    hud.msg.classList.remove('pop'); void hud.msg.offsetWidth; hud.msg.classList.add('pop');
  }
  if (!st.finished) hud.msg.dataset.fin = '';
  hud.speed.textContent = Math.round(st.v.speed() * 3.6);
  hud.boost.style.width = `${Math.round(st.v.boost * 100)}%`;
  // running order, top four plus the player
  let html = '';
  race.order.forEach((c, k) => {
    if (k < 4 || c === st) html += `<div class="${c === st ? 'me' : ''}"><b>${k + 1}</b>${c.isPlayer ? (S.driver || 'YOU') : c.v.name}</div>`;
  });
  if (html !== hud.board._html) { hud.board.innerHTML = html; hud.board._html = html; }
  // minimap
  const g = hud.map.getContext('2d');
  g.clearRect(0, 0, hud.map.width, hud.map.height);
  g.drawImage(mapBase, 0, 0);
  for (const c of race.cars) {
    if (c === st) continue;
    const p = c.v.group.position;
    const [x, y] = mapFn(p.x, p.z);
    g.fillStyle = '#d8d0c4'; g.beginPath(); g.arc(x, y, 4.5, 0, 6.3); g.fill();
  }
  const pp = st.v.group.position;
  const [x, y] = mapFn(pp.x, pp.z);
  g.fillStyle = '#ffb41f'; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, 7, 0, 6.3); g.fill(); g.stroke();
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.toast.classList.remove('on'); }
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let t = 0, accum = 0, lastFrame = 0, fpsAvg = 60;
const tmp = new THREE.Vector3();
const focus = new THREE.Vector3();
const menuCentre = new THREE.Vector3(-150, 0, 120);

function simulate(dt) {
  if (state === 'race' && race) {
    const raw = input.read();
    accum += dt;
    let n = 0;
    while (accum >= 1 / 60 && n++ < 5) {
      if (race.player.ai) race.player.ai.update(1 / 60, race.player, race.cars.map((c) => c.v), 0);
      const pin = race.player.ai ? { ...race.player.v.input, analog: true } : raw;
      race.step(1 / 60, pin, S.steerAssist && !race.player.ai);
      accum -= 1 / 60;
    }
    if (race.done && !race.shownResults) {
      race.shownResults = true;
      setTimeout(() => {
        if (!race) return;
        state = 'results';
        touchEl.hidden = true;
        ui.showResults(race, raceCfg.mode);
      }, 1200);
    }
  }
}

function frame(dt) {
  t += dt;
  simulate(dt);
  if (race && (state === 'race' || state === 'paused' || state === 'results')) {
    race.sync(dt, t, dust, camera.position);
    if (state !== 'paused') rig.update(dt, race.player.v, race.track, race.player.i, race.player.v.boosting);
    focus.copy(race.player.v.group.position);
    updateHud(dt);
  } else {
    menuT += dt;
    rig.orbit(dt, menuT + 40, menuCentre, 1150, 260);
    focus.set(camera.position.x * 0.5, 0, camera.position.z * 0.5);
  }
  lava.userData.uniforms.uTime.value = t;
  plume.material.uniforms.uTime.value = t + 400;
  ash.material.uniforms.uTime.value = t;
  ash.material.uniforms.uCam.value.copy(camera.position);
  ash.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * 0.6;
  dust.update(t);
  props.update?.(t);
  // shadow frustum follows the focus point, texel-snapped to stop shimmering
  const texel = (sc.right - sc.left) / sunLight.shadow.mapSize.x;
  tmp.copy(focus);
  tmp.x = Math.round(tmp.x / texel) * texel; tmp.z = Math.round(tmp.z / texel) * texel;
  tmp.y = world.heightAt(tmp.x, tmp.z);
  sunLight.target.position.copy(tmp);
  sunLight.position.copy(tmp).addScaledVector(sun, 400);
  const lp = nearestLava(camera.position);
  lavaLight.position.copy(lp.pos);
  lavaLight.intensity = lp.strength * 120;
  composer.render(dt);
  if (S.showFps) { fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05; hud.fps.textContent = `${Math.round(fpsAvg)} FPS`; }
  else hud.fps.textContent = '';
}

loadStep(1, 'READY');
$('loading').remove();

// URL shortcuts for testing and screenshots: ?race=village&ai=7&laps=1&auto, ?still=N renders one frame after N steps
if (params.has('race')) {
  startRace({ track: params.get('race'), laps: +(params.get('laps') || trackById(params.get('race')).laps), opponents: +(params.get('ai') ?? 5),
    difficulty: params.get('diff') || 'normal', paint: +(params.get('paint') || S.paint || 0), mode: 'quick', seed: 7 });
  if (params.has('cam')) rig.setMode(params.get('cam'));
  if (params.has('at')) {
    const f = race.track.frame(+params.get('at'));
    race.place(race.player, race.track.wrap(+params.get('at')), f.x, f.z, f.yaw);
    race.clock = 0;
  }
} else {
  ui.show(params.get('screen') || 'title');
}

const still = params.has('still') ? +params.get('still') || 1 : 0;
if (still) {
  for (let i = 0; i < still - 1; i++) frameNoRender(1 / 60);
  frame(1 / 60);
  renderer.getContext().finish();
  window.__state = race && { t: race.t, done: race.done, player: race.positionOf(race.player),
    order: race.order.map((c) => ({ name: c.v.name, dist: Math.round(c.dist), lap: c.lap, fin: c.finished, time: c.time && +c.time.toFixed(1), resp: (c.respLog || []).join(' ') })) };
  window.__ready = true;
} else {
  window.__ready = true;
  requestAnimationFrame(loop);
}
function frameNoRender(dt) {
  t += dt;
  simulate(dt);
  if (race) { race.sync(dt, t, null, camera.position); rig.update(dt, race.player.v, race.track, race.player.i, false); }
}

// frame cap: browser and phone builds default to 30 fps, the desktop app runs uncapped
function loop(now) {
  requestAnimationFrame(loop);
  const cap = S.fps || 0;
  if (cap && now - lastFrame < 1000 / cap - 2) return;
  const dt = Math.min(clock.getDelta(), 1 / 15);
  lastFrame = now;
  frame(dt);
  window.__state = race && { i: race.player.i, lap: race.player.lap, dist: race.player.dist, t: race.t, pos: race.positionOf(race.player),
    done: race.done, order: race.order.map((c) => `${c.v.name}:${Math.round(c.dist)}`) };
}
