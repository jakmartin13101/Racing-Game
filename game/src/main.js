import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, NoiseEffect, BlendFunction, SMAAPreset, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { loadWorld, loadMaterials, buildTerrain, buildTrackRibbon, buildLava, setAniso } from './world.js';
import { buildSky, buildPlume, buildAsh, Dust, CrashFx, MotionBlurEffect } from './fx.js';
import { Hazards } from './hazards.js';
import { patchHeightFog, SunShafts, Focus, SkidMarks } from './ultra.js';
import { Debris, Breakables } from './crash.js';
import { buildProps } from './props.js';
import { buildVillage } from './village.js';
import { Ambient } from './ambient.js';
import { initPhysics, loadTruckAssets, addStaticBoxes } from './vehicle.js';
import { Track } from './track.js';
import { Race } from './race.js';
import { AIDriver, DIFFICULTY } from './ai.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { UI, fmt, drawTrackShape } from './ui.js';
import { settings, saveSettings, quality as qualityPreset, platform } from './settings.js';
import { mulberry } from './world.js';
import { loadTrackIndex, pickRegion, switchRegion } from './regions.js';
import { buildKaiele, KaieleHazards } from './kaiele/region.js';

const params = new URLSearchParams(location.search);
// ?trace: every half second, each truck's row, speed and wheels down (for headless test runs)
// look=x,y,z,tx,ty,tz: a fixed camera, for screenshots of the scenery
const LOOK = params.has('look') ? params.get('look').split(',').map(Number) : null;
const TRACE = params.has('trace') ? (window.__trace = { n: 0, rows: [] }) : null;
if (params.has('ltrace')) window.__ltrace = [];
const SLOW = params.has('slow') ? (window.__slow = { min: 1, real: 0, slowFor: 0 }) : null;
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
const ULTRA = !!quality.ultra;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 9000);

loadStep(0.05, 'LOADING SKY…');
const { sun } = await buildSky(renderer, scene);
// Ultra: ash haze that pools in the valleys and glows towards the sun (patches shaders before any compile)
if (ULTRA && !params.has('nofog')) patchHeightFog(sun);
const fogColor = new THREE.Color(0.62, 0.64, 0.66), fogHot = new THREE.Color(0.5, 0.33, 0.27);
const fogBase = { color: fogColor, density: 0.00028, sun: 2.8 };
scene.fog = new THREE.FogExp2(fogColor, fogBase.density);

const sunLight = new THREE.DirectionalLight(0xfff0dc, 2.8);
sunLight.castShadow = true;
const shadowRes = Math.min(quality.shadow, renderer.capabilities.maxTextureSize);
sunLight.shadow.mapSize.set(shadowRes, shadowRes);
const sc = sunLight.shadow.camera;
const SR = quality.shadowRange || 70;
sc.left = -SR; sc.right = SR; sc.top = SR; sc.bottom = -SR; sc.near = 1; sc.far = 900;
if (ULTRA) sunLight.shadow.radius = 2;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight, sunLight.target);
scene.add(new THREE.HemisphereLight(0x9fb2c8, 0x3a2a20, 0.1));

// one region (baked world) is loaded at a time; the menus list every region's tracks
const trackIndex = await loadTrackIndex();
const { region, pending } = pickRegion(params, trackIndex);
const ISLAND = region.id === 'kaiele';
loadStep(0.15, region.loading);
const world = await loadWorld(region.dir);
const tracks = world.data.tracks.map((t) => new Track(t, world));
const trackById = (id) => tracks.find((t) => t.id === id) || tracks[0];
const menuTracks = trackIndex.map((t) => tracks.find((x) => x.id === t.id) || t);
const M = loadMaterials();
loadStep(0.3, 'BUILDING TERRAIN…');
// Kai'ele builds its own ground, roads, sea, plants and set pieces (src/kaiele/)
const island = ISLAND ? await buildKaiele({ renderer, scene, world, M, quality, tracks, sun, sunLight, camera, loadStep, fog: fogBase }) : null;
if (!ISLAND) {
  scene.add(buildTerrain(world, M, quality));
  for (const t of tracks) scene.add(buildTrackRibbon(world, M, t));
}
const lava = buildLava(world, M);
scene.add(lava);
const plume = buildPlume(world, M, sun);
// the plume rises over the region's own crater
if (world.data.crater) plume.material.uniforms.uOrigin.value.set(world.data.crater.x, plume.material.uniforms.uOrigin.value.y, world.data.crater.z);
plume.material.uniforms.uFogColor.value.copy(fogColor);
plume.material.uniforms.uFogDensity.value = scene.fog.density;
scene.add(plume);
const ash = buildAsh();
ash.visible = !ISLAND;
scene.add(ash);
const dust = new Dust(M, 700);
dust.mat.uniforms.uSun.value.copy(sun);
scene.add(dust.mesh);
const ambient = ISLAND ? island.ambient : new Ambient({ scene, world, M, quality, tracks, sun });
loadStep(0.45, 'PLACING ROCKS AND PROPS…');
const props = ISLAND ? island.props : await buildProps(world, scene, M, quality, tracks);
loadStep(0.6, ISLAND ? 'BUILDING THE COAST…' : 'BUILDING ASHFALL VILLAGE…');
const village = ISLAND ? { colliders: [], handles: [] } : await buildVillage(world, scene, M, quality, tracks);
loadStep(0.72, 'STARTING PHYSICS…');
const phys = await initPhysics(world);
addStaticBoxes(phys, [...village.colliders, ...(island?.colliders || [])]);
// knock-down props, flying debris, and the smoke and fire of wrecks
const debris = new Debris(phys);
const breakables = new Breakables(phys, debris, [...props.handles, ...village.handles]);
const crashFx = new CrashFx(M, scene, sun, !!quality.aiLod);
const skids = new SkidMarks(scene, params.has('noskid') ? 1 : quality.skids || 1000);
const crash = { scene, debris, fx: crashFx, breakables, detail: quality.damageDetail, skids };
scene.add(camera);
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
  ao.configuration.halfRes = !quality.aoUltra;
  ao.configuration.gammaCorrection = false;
  if (quality.aoUltra) { ao.setQualityMode('Ultra'); ao.configuration.halfRes = false; }
  composer.addPass(ao);
}
const bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
const grade = new HueSaturationEffect({ saturation: 0.05 });
const contrast = new BrightnessContrastEffect({ contrast: 0.12, brightness: -0.02 });
const vignette = new VignetteEffect({ darkness: 0.45, offset: 0.3 });
const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
grain.blendMode.opacity.value = 0.06;
// Ultra adds sun shafts through the ash and depth of field to the bloom pass
const shafts = ULTRA && !params.has('noshafts') ? new SunShafts(camera, sun) : null;
const focusFx = ULTRA && !params.has('nodof') ? new Focus(camera) : null;
composer.addPass(new EffectPass(camera, ...(focusFx ? [focusFx.effect] : []), bloom, ...(shafts ? [shafts.effect] : [])));
const mblur = new MotionBlurEffect(quality.blurSamples);
composer.addPass(new EffectPass(camera, mblur));
composer.addPass(new EffectPass(camera, tone, grade, contrast, vignette, grain, new SMAAEffect({ preset: ULTRA ? SMAAPreset.ULTRA : SMAAPreset.MEDIUM })));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- game state
const rig = new CameraRig(camera, world, phys);
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
  time: $('time'), best: $('best'), lavagap: $('lavagap'), speed: $('speed'), gear: $('gear'), rpm: $('rpmbar'), boost: $('boostbar'), dmg: $('dmgbar'), boostWrap: $('boost'), msg: $('msg'), board: $('board'), map: $('map'), fps: $('fps'), toast: $('toast'),
};
let mapBase = null, mapFn = null;

const ui = new UI({
  tracks: menuTracks, settings: S, save: saveSettings,
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
  // a track in another region: reload into it
  const other = trackIndex.find((t) => t.id === cfg.track && t.region !== region.id);
  if (other) { switchRegion(cfg, other.region); return; }
  raceCfg = cfg;
  race?.dispose();
  skids.clear();
  const track = trackById(cfg.track);
  race = new Race({
    phys, scene, assets, track, opponents: cfg.opponents, difficulty: cfg.difficulty, laps: cfg.laps,
    playerPaint: cfg.paint ?? 0, quality, playerName: S.driver || 'YOU', seed: (cfg.seed ?? Date.now()) & 0xffff, crash,
  });
  race.hazards = ISLAND ? new KaieleHazards({ phys, scene, world, track, fx: crashFx, M, lava, island, quality, events: race.events, breakables })
    : new Hazards({ phys, scene, world, track, fx: crashFx, M, lava, rockMat: props.models.boulder_01?.meshes[0]?.mat, quality, events: race.events });
  slowT = 0; timeScale = 1; leapSlow = null; rig.cinematic(false); rig.leapShot(null);
  hud.dmg.style.width = '0%';
  hud.msg.dataset.fin = '';
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
    hud.msg.textContent = st.dnf ? (st.burned ? 'CAUGHT BY THE LAVA' : 'DNF') : p === 1 ? 'WINNER!' : `P${p}`;
    hud.msg.classList.remove('pop'); void hud.msg.offsetWidth; hud.msg.classList.add('pop');
  }
  if (!st.finished) hud.msg.dataset.fin = '';
  hud.dmg.style.width = `${Math.round((st.v.damage?.level || 0) * 100)}%`;
  hud.boostWrap.classList.toggle('red', st.v.boost < 0.1);
  hud.speed.textContent = Math.round(st.v.speed() * 3.6);
  hud.gear.textContent = st.v.speed() < 1 && st.v.input.brake > 0 ? 'R' : st.v.gear;
  hud.rpm.style.width = `${Math.round(Math.min(1, st.v.rpm / 7000) * 100)}%`;
  hud.boost.style.width = `${Math.round(st.v.boost * 100)}%`;
  // Eruption's descent: how far back the lava is
  const lg = race.hazards?.lavaGap ?? race.hazards?.erupt?.gap;
  hud.lavagap.hidden = lg == null;
  if (lg != null) { hud.lavagap.textContent = `LAVA ${Math.round(lg)} M`; hud.lavagap.classList.toggle('near', lg < 45); }
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
  if (msgT > 0) { msgT -= dt; if (msgT <= 0 && !st.finished) hud.msg.textContent = ''; }
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let t = 0, accum = 0, lastFrame = 0, fpsAvg = 60;
// slow motion for the player's engine blowing: slowT counts down in real seconds
let slowT = 0, timeScale = 1;
// the crater leap: slow motion for the whole flight, slowest over the middle of the crater
let leapSlow = null;
let msgT = 0, blurAmt = 0;
function bigMsg(txt, hold = 2.2) { hud.msg.textContent = txt; hud.msg.classList.remove('pop'); void hud.msg.offsetWidth; hud.msg.classList.add('pop'); msgT = hold; }
function raceEvents() {
  for (const e of race.events.splice(0)) {
    const me = e.st ? e.st.isPlayer : true;
    if (e.type === 'knock') rig.bump(Math.min(0.25, 0.04 + e.dv * 0.03));
    else if (e.type === 'hit' && me) rig.bump(Math.min(0.5, e.dv * 0.025));
    else if (e.type === 'part' && me && !e.st.v.damage.blown) toast(`${e.label} torn off`);
    else if (e.type === 'blown') {
      if (me) { slowT = 6; rig.cinematic(true); bigMsg('ENGINE BLOWN'); }
      else toast(`${e.st.v.name} blew the engine`);
    } else if (e.type === 'totaled') {
      if (me && !e.st.v.damage.blown) bigMsg('TOTALED');
      else if (!me && !e.st.v.damage.blown) toast(`${e.st.v.name} is wrecked`);
    } else if (e.type === 'dnf' && me) { if (!e.st.burned) bigMsg('DNF'); }
    else if (e.type === 'leap') {
      if (me) { leapSlow = e.leap; rig.leapShot(e.leap, e.focus ?? world.data.crater); if (e.leap.short) bigMsg('TOO SLOW!', 3); }
      rig.bump(me ? 0.35 : 0.08);
    } else if (e.type === 'landed' && me) { if (leapSlow) leapSlow.done = true; rig.leapShot(null); rig.bump(0.3); }
    else if (e.type === 'burned') {
      if (me) { slowT = 6; rig.cinematic(true); bigMsg('CAUGHT BY THE LAVA', 4); }
      else toast(`${e.st.v.name} was caught by the lava`);
    } else if (e.type === 'erupt') { toast('The volcano is erupting!'); rig.bump(0.4); }
    else if (e.type === 'flow') { toast('Lava over the rim! Go!'); rig.bump(0.3); }
    else if (e.type === 'heave' && race.player.i < e.i && e.i - race.player.i < 260) { toast('The ground is splitting!'); rig.bump(0.25); }
    else if (e.type === 'quake') rig.bump(Math.min(0.35, e.k ?? 0.15));
    else if (e.type === 'breakout') { toast('Lava breakout ahead!'); rig.bump(0.3); }
    else if (e.type === 'loose' && me && e.label) toast(`${e.label} hanging loose`);
    else if (e.type === 'tyre' && me) toast('Lost a wheel!');
    else if (e.type === 'toast' && me && e.text) toast(e.text); // track events (Kai'ele gusts, rockfall)
  }
}
const tmp = new THREE.Vector3();
const focus = new THREE.Vector3();
const menuCentre = ISLAND ? new THREE.Vector3(-300, 0, 600) : new THREE.Vector3(-150, 0, 120);

function simulate(dt) {
  if (state === 'race' && race) {
    const raw = input.read();
    accum += dt;
    let n = 0;
    // in slow motion the fixed step shrinks with time, so the physics still advances every frame
    const h = (1 / 60) * THREE.MathUtils.clamp(timeScale, 0.2, 1);
    while (accum >= h - 1e-9 && n++ < 5) {
      if (race.player.ai) race.player.ai.update(h, race.player, race.cars.map((c) => c.v), 0);
      const pin = race.player.ai ? { ...race.player.v.input, analog: true } : raw;
      if (params.has('blow') && race.clock > 1.5) { race.player.v.forceBlow = true; pin.boost = 1; pin.throttle = 1; if (race.player.v.boost > 0.12) race.player.v.boost = 0.12; }
      race.step(h, pin, S.steerAssist && !race.player.ai);
      if (TRACE && (TRACE.n++ % 30) === 0) TRACE.rows.push(`${race.t.toFixed(1)} F${race.hazards?.erupt?.flow.front.toFixed(0) ?? ""} ` + race.cars.map((c) => `${c.i}:${c.v.speed().toFixed(0)}:${c.v.contacts}${c.leap ? "L" : ""}:${(c.off ?? 0).toFixed(0)}:${(c.v.body.translation().y - race.track.at(c.i)[1]).toFixed(1)}`).join(' '));
      accum -= h;
    }
    raceEvents();
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

function slowMotion(real) {
  // engine blow: about three seconds at a fifth of normal speed, easing back over the next three
  if (slowT > 0) {
    slowT = Math.max(0, slowT - real);
    timeScale = slowT > 2.6 ? 0.2 : 0.2 + 0.8 * (1 - slowT / 2.6) ** 2;
    if (slowT === 0) { timeScale = 1; rig.cinematic(false); }
  }
  if (leapSlow && state !== 'paused') {
    const u = leapSlow.done ? 1 : THREE.MathUtils.clamp(leapSlow.t / leapSlow.T, 0, 1);
    const goal = leapSlow.done ? 1 : 0.74 - 0.42 * Math.sin(Math.PI * u);
    timeScale += (goal - timeScale) * Math.min(1, real * (leapSlow.done ? 4 : 5));
    if (leapSlow.done && timeScale > 0.97) { timeScale = 1; leapSlow = null; }
  }
}

function frame(real) {
  slowMotion(real);
  const dt = state === 'paused' ? real : real * timeScale;
  t += dt;
  simulate(dt);
  if (race && (state === 'race' || state === 'paused' || state === 'results')) {
    race.sync(dt, t, dust, camera.position);
    if (state !== 'paused') rig.update(real, race.player.v, race.track, race.player.i, race.player.v.boosting);
    const pv = race.player.v, spd = pv.speed();
    const inCar = rig.cine || rig.leapL ? 0 : 1;
    // camera motion blur grows with speed; boost adds a radial streak, redline adds colour fringing
    const fast = THREE.MathUtils.clamp((spd - 12) / 40, 0, 1);
    mblur.uniforms.get('uRadial').value = inCar * (fast * 0.012 + (pv.boosting ? 0.03 : 0));
    mblur.uniforms.get('uAber').value = inCar * ((pv.boosting ? 0.6 : 0) + (pv.redline ? 1.4 : 0));
    blurAmt = rig.cine || rig.leapL ? 0.25 : 0.55 + fast * 0.35;
    focus.copy(race.player.v.group.position);
    updateHud(real);
  } else {
    menuT += dt;
    rig.orbit(dt, menuT + 40, menuCentre, ISLAND ? 1500 : 1150, ISLAND ? 320 : 260);
    mblur.uniforms.get('uRadial').value = 0; mblur.uniforms.get('uAber').value = 0;
    blurAmt = 0.3;
    focus.set(camera.position.x * 0.5, 0, camera.position.z * 0.5);
  }
  if (LOOK) { camera.position.set(LOOK[0], LOOK[1], LOOK[2]); camera.up.set(0, 1, 0); camera.lookAt(LOOK[3], LOOK[4], LOOK[5]); camera.updateMatrixWorld(); }
  // Eruption: the sky closes in as the pack climbs and burns red once the volcano blows
  const envK = race?.hazards?.env ?? 0;
  scene.fog.color.copy(fogColor).lerp(fogHot, envK * 0.55);
  scene.fog.density = fogBase.density * (1 + envK * 0.8);
  sunLight.intensity = fogBase.sun * (1 - envK * 0.3);
  plume.material.uniforms.uFogColor.value.copy(scene.fog.color);
  plume.material.uniforms.uFogDensity.value = scene.fog.density;
  lava.userData.uniforms.uTime.value = t;
  plume.material.uniforms.uTime.value = t + 400;
  ash.material.uniforms.uTime.value = t;
  ash.material.uniforms.uCam.value.copy(camera.position);
  ash.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * 0.6;
  dust.update(t);
  crashFx.update(t, dt);
  ambient.update(t, dt, camera.position);
  props.update?.(t);
  island?.update(t, dt, camera, race);
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
  // heat shimmer near lava (Ultra)
  mblur.uniforms.get('uHaze').value = ULTRA ? Math.min(1.2, lp.strength * 1.6 + (race?.hazards?.lava?.front?.value > 0 ? 0.3 : 0)) : 0;
  mblur.uniforms.get('uTime').value = t;
  if (shafts) shafts.update(camera);
  if (focusFx) focusFx.update(race && state !== 'menu' ? race.player.v.group.position : focus, !!rig.cine, race ? rig.mode : 'menu');
  mblur.track(camera, blurAmt);
  composer.render(dt);
  if (S.showFps) { fpsAvg += (1 / Math.max(real, 1e-3) - fpsAvg) * 0.05; hud.fps.textContent = `${Math.round(fpsAvg)} FPS`; }
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
    const yaw = f.yaw + +(params.get('yaw') || 0);
    race.place(race.player, race.track.wrap(+params.get('at')), f.x, f.z, yaw);
    race.clock = 0;
    // ?lava=N sets Eruption's lava flow running N m behind the truck, for screenshots
    const er = race.hazards?.erupt;
    if (er && params.has('lava')) Object.assign(er.flow, { state: 'run', runT: 9, front: race.player.i - +params.get('lava') }).mesh.visible = true;
    // ?ram=N launches the truck straight ahead at N m/s, for crash tests
    if (params.has('ram')) {
      const sp = +params.get('ram');
      race.player.v.body.setLinvel({ x: Math.sin(yaw) * sp, y: 0, z: Math.cos(yaw) * sp }, true);
      race.player.v.ghost = false;
    }
  }
} else if (pending) {
  startRace(pending);
} else {
  ui.show(params.get('screen') || 'title');
}

const still = params.has('still') ? +params.get('still') || 1 : 0;
if (still) {
  for (let i = 0; i < still - 1; i++) frameNoRender(1 / 60);
  frame(1 / 60);
  renderer.getContext().finish();
  window.__state = race && { fxn: [crashFx.smoke.i, crashFx.fire.i, crashFx.spark.i, crashFx.time, t], t: race.t, done: race.done, player: race.positionOf(race.player),
    order: race.order.map((c) => ({ name: c.v.name, dist: Math.round(c.dist), lap: c.lap, fin: c.finished, dnf: !!c.dnf, time: c.time && +c.time.toFixed(1), resp: (c.respLog || []).join(' '),
      dmg: +(c.v.damage?.level || 0).toFixed(2), lost: [...(c.v.damage?.lost || [])].join(','), blown: !!c.v.damage?.blown, log: (c.v.damage?.log || []).join(' ') })),
    hz: race.hazards?.bombs && { bombs: race.hazards.bombs.length, marks: race.hazards.marks.length, boulders: race.hazards.boulders.length, rolled: race.hazards.nBoulders || 0, dropped: race.hazards.nBombs || 0, lava: race.hazards.lava?.state, hits: race.hazards.hits || 0 },
    er: race.hazards?.erupt && { flow: race.hazards.erupt.flow.state, front: Math.round(race.hazards.erupt.flow.front), heaves: race.hazards.erupt.heaves.map((h) => `${h.i0}:${h.state}`).join(' '),
      fiss: race.hazards.erupt.fissures.length, rocks: race.track.obstacles.map((o) => o.i).join(','), leapt: race.cars.filter((c) => c.leapt).length,
      burned: (race.hazards.erupt.flow.log || []).join(' '), erupting: !!race.hazards.erupt.erupting },
    knocked: breakables.items.filter((i) => i.state !== 'static').length, props: breakables.items.length, debris: debris.list.length };
  window.__race = race; window.__fx = crashFx; window.__skids = skids;
  window.__ready = true;
} else {
  window.__ready = true;
  requestAnimationFrame(loop);
}
function frameNoRender(real) {
  // ?slow: headless runs play slow motion too (normally they skip it, to simulate faster)
  if (SLOW) { slowMotion(real); SLOW.min = Math.min(SLOW.min, timeScale); SLOW.real += real; if (timeScale < 0.99) SLOW.slowFor += real; }
  const dt = SLOW ? real * timeScale : real;
  t += dt;
  simulate(dt);
  if (race) { race.sync(dt, t, null, camera.position); rig.update(dt, race.player.v, race.track, race.player.i, false); }
  if (LOOK) camera.position.set(LOOK[0], LOOK[1], LOOK[2]);
  crashFx.update(t, dt);
  ambient.update(t, dt, camera.position);
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
