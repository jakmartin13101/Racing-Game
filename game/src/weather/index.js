import * as THREE from 'three';
import { WEATHERS, TIMES, resolveConditions, describe, weathersFor, timesFor, climateOf } from './conditions.js';
import { surfaceUniforms, adopt, puddleAt } from './surface.js';
import { Sky } from './sky.js';
import { Rain, Snow, Splashes } from './precip.js';
import { Lightning } from './lightning.js';
import { LensDropsEffect } from './lens.js';
import { TruckLights } from './lights.js';

export { WEATHERS, TIMES, resolveConditions, describe, weathersFor, timesFor, climateOf, adopt, puddleAt };

// How each time of day looks before the weather gets at it. Colours are linear; sun is the key light
// (the moon at night), hemi the sky and ground fill, env the strength of the sky's reflections.
const TOD = {
  morning: { el: 9, az: -1.3, sun: [1, 0.7, 0.46], sunI: 2.2, zenith: [0.16, 0.3, 0.62], horizon: [1.1, 0.72, 0.5], hemiSky: [0.62, 0.6, 0.68], hemiGround: [0.26, 0.19, 0.15], hemiI: 0.28,
    env: 0.5, fog: [0.74, 0.66, 0.6], glow: 1.5, light: 0.85, stars: 0, lamps: 0.3, cloudLit: [1.25, 0.85, 0.68] },
  day: { el: null, az: 0, sun: [1, 0.94, 0.86], sunI: 2.8, zenith: [0.22, 0.45, 1.0], horizon: [0.75, 0.85, 1.0], hemiSky: [0.62, 0.7, 0.78], hemiGround: [0.23, 0.165, 0.125], hemiI: 0.1,
    env: 0.6, fog: [0.62, 0.64, 0.66], glow: 1, light: 1, stars: 0, lamps: 0, cloudLit: [1.5, 1.5, 1.5] },
  evening: { el: 7, az: 1.25, sun: [1, 0.5, 0.24], sunI: 1.9, zenith: [0.1, 0.14, 0.36], horizon: [1.25, 0.55, 0.28], hemiSky: [0.58, 0.46, 0.55], hemiGround: [0.24, 0.15, 0.11], hemiI: 0.5,
    env: 0.6, fog: [0.7, 0.5, 0.4], glow: 1.8, light: 0.72, stars: 0.05, lamps: 0.55, cloudLit: [1.3, 0.62, 0.42] },
  night: { el: 38, az: 2.6, moon: true, sun: [0.5, 0.62, 1], sunI: 1.3, zenith: [0.004, 0.007, 0.018], horizon: [0.03, 0.04, 0.07], hemiSky: [0.3, 0.38, 0.6], hemiGround: [0.08, 0.08, 0.09], hemiI: 1.3,
    env: 0.6, fog: [0.028, 0.034, 0.05], glow: 0, light: 0.16, stars: 1, lamps: 1, cloudLit: [0.05, 0.06, 0.08] },
};
// extra reasons to run with the lights on
const LAMPS = { heavyrain: 0.5, storm: 0.55, fog: 0.6, snow: 0.35, blizzard: 0.65, rain: 0.3 };

const C = (a) => new THREE.Color(a[0], a[1], a[2]);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();

// The weather and the time of day for the whole scene. One instance lives for the life of the game;
// set() changes the conditions (at the start of a race), update() runs every frame and step() every
// physics step. See src/weather/README.md for how a track uses it.
export class Weather {
  constructor({ renderer, scene, sky, sun, sunLight, hemi, quality, heightAt, fogBase = 0.00028 }) {
    Object.assign(this, { renderer, scene, sun, sunLight, hemi, quality, heightAt, fogBase });
    this.baseSun = sun.clone();
    this.sky = new Sky(renderer, scene, sky);
    const lite = !!quality.aiLod, low = quality.name === 'low';
    const nRain = { low: 2200, medium: 4500, high: 8000, ultra: 12000 }[quality.name] ?? 4500;
    // a dense near layer and a sparse far one
    this.rain = [new Rain(Math.round(nRain * 0.6), [26, 18, 26], 3), new Rain(Math.round(nRain * 0.4), [80, 46, 80], 4)];
    this.snow = [new Snow(Math.round(nRain * 0.5), [30, 20, 30], 5), new Snow(Math.round(nRain * 0.35), [90, 50, 90], 6)];
    this.splashes = new Splashes(lite ? 250 : 600, heightAt);
    this.lightning = new Lightning(scene);
    for (const r of [...this.rain, ...this.snow]) scene.add(r.mesh);
    scene.add(this.splashes.crown, this.splashes.ring);
    this.flashLight = new THREE.DirectionalLight(0xc8d4ff, 0);
    scene.add(this.flashLight, this.flashLight.target);
    this.lights = new TruckLights(scene);
    this.lens = low ? null : new LensDropsEffect();
    this.listeners = new Map();
    this.wind = new THREE.Vector3();
    this.windDir = new THREE.Vector3(1, 0, 0.35).normalize();
    this.windTime = 0;
    this.camPrev = new THREE.Vector3();
    this.camVel = new THREE.Vector3();
    this.fogColor = new THREE.Color(0.62, 0.64, 0.66);
    this.fogDensity = fogBase;
    this.sunIntensity = 2.8;
    this.smokeLight = new THREE.Color(1, 1, 1);
    this.precipColor = new THREE.Color();
    this.flash = 0;
    this.gust = 0;
    this.set({ weather: 'clear', time: 'day' });
  }

  on(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); return this; }
  emit(e) { for (const fn of this.listeners.get(e.type) || []) fn(e); }

  // the conditions now, for the HUD
  get label() { return describe(this.cond); }
  // tyre grip on the track surface, 1 = dry
  get grip() { return this.W.grip; }

  // Make materials under root respond to rain and snow (see surface.js for the kinds)
  adopt(root, kind) { return adopt(root, kind); }

  // Grip multiplier at a point: the weather's grip, less in standing water, and less again off the
  // track (loose 0..1) where rain turns the ground to mud and snow lies deep.
  gripAt(x, z, loose = 0) {
    const W = this.W;
    const pd = puddleAt(x, z, W.puddles);
    return W.grip * (1 - pd * 0.3) * (1 - loose * W.mud);
  }
  puddleAt(x, z) { return puddleAt(x, z, this.W.puddles); }

  // Choose the conditions for a race. cond: { weather, time }, either may be 'random'; track decides what
  // its climate allows. Returns the resolved { weather, time }.
  set(cond, track = null, rnd = Math.random) {
    const c = track ? resolveConditions(track, cond, rnd) : { weather: WEATHERS[cond.weather] ? cond.weather : 'clear', time: TIMES[cond.time] ? cond.time : 'day' };
    this.cond = c;
    const W = this.W = WEATHERS[c.weather];
    const T = this.T = TOD[c.time];
    const u = this.sky.uniforms;
    const cloud = W.cloud;
    const storm = Math.max(W.rain, W.snow * 0.8) * cloud;

    // the sun (or moon) across the sky
    if (T.el == null) this.sun.copy(this.baseSun);
    else {
      const az = Math.atan2(this.baseSun.z, this.baseSun.x) + T.az, el = THREE.MathUtils.degToRad(T.el);
      this.sun.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    }
    const day = c.time === 'day';
    const useHdr = day && cloud < 0.3;
    u.uHdr.value = useHdr ? 1 : 0;
    u.uSun.value.copy(T.moon ? _v.copy(this.sun).negate() : this.sun);
    u.uMoon.value.copy(T.moon ? this.sun : _v.set(0, -1, 0));
    u.uStars.value = T.stars;
    u.uGlow.value = T.glow * (1 - cloud * 0.7);
    u.uSunCol.value.copy(C(T.sun)).multiplyScalar(T.moon ? 0 : 1.5);
    u.uCloud.value = useHdr ? 0 : cloud;
    u.uCloudDark.value = 0.35 + storm * 0.65;

    // overcast skies wash the colour out of the sky and darken it as the weather gets heavier
    const gloom = 1 - storm * 0.55 - (c.weather === 'fog' ? 0.1 : 0);
    const grey = _c.setRGB(0.5, 0.53, 0.58).multiplyScalar(T.light * gloom * (T.moon ? 0.35 : 1));
    u.uZenith.value.copy(C(T.zenith)).lerp(grey, cloud * 0.9);
    u.uHorizon.value.copy(C(T.horizon)).lerp(grey, cloud * 0.85);
    u.uCloudLit.value.copy(C(T.cloudLit)).multiplyScalar(gloom).lerp(_c2.copy(grey).multiplyScalar(1.15), cloud * 0.75);
    u.uCloudShade.value.copy(grey).multiplyScalar(0.4);

    // fog: visibility falls with the weather; its colour is the colour of the horizon
    this.fogDensity = this.fogBase * W.fog;
    this.fogColor.copy(C(T.fog)).lerp(_c2.copy(grey).multiplyScalar(0.95), cloud * 0.75);
    if (W.cover) this.fogColor.lerp(_c2.setRGB(0.7, 0.73, 0.78).multiplyScalar(T.light), 0.5);
    u.uHaze.value.copy(this.fogColor);
    u.uFogBand.value = Math.min(1, (W.fog - 1) / 10);

    // lights: overcast swaps direct sun for soft sky light
    this.sunIntensity = T.sunI * (1 - cloud * (T.moon ? 0.6 : 0.8)) * (c.weather === 'fog' ? 0.6 : 1);
    this.sunLight.color.copy(C(T.sun)).lerp(_c2.setRGB(0.9, 0.92, 0.96), cloud * 0.6);
    this.hemiBase = T.hemiI + cloud * (T.moon ? 0.4 : 0.6 * T.light);
    // (a cloudy night keeps a little blue sky glow so the road can still be read)
    this.hemi.color.copy(C(T.hemiSky)).lerp(T.moon ? _c2.setRGB(0.22, 0.25, 0.32) : grey, cloud * 0.6);
    this.hemi.groundColor.copy(C(T.hemiGround));
    if (W.cover) this.hemi.groundColor.setRGB(0.5, 0.53, 0.58).multiplyScalar(T.light);
    this.envBase = T.env * (useHdr ? 1 : 1.25);
    this.scene.environmentIntensity = this.envBase;
    // smoke and dust are lit by the same light
    this.smokeLight.setRGB(1, 1, 1).multiplyScalar(Math.max(0.12, T.light * (1 - cloud * 0.35)));
    // drops catch whatever light there is
    this.precipColor.copy(this.fogColor).multiplyScalar(1.2).addScalar(T.light * 0.08);
    if (T.moon) this.precipColor.setRGB(0.2, 0.22, 0.27);

    surfaceUniforms.wxWet.value = W.wet;
    surfaceUniforms.wxPuddle.value = W.puddles;
    surfaceUniforms.wxSnow.value = W.cover;
    surfaceUniforms.wxRipple.value = W.rain;
    surfaceUniforms.wxSun.value = T.light;
    this.lampLevel = Math.max(T.lamps, LAMPS[c.weather] || 0) * (day ? 0.8 : 1);
    this.sky.bakeEnvironment(useHdr);
    this.lightning.next = 3 + Math.random() * 6;
    this.emit({ type: 'change', cond: c });
    return c;
  }

  // the race's trucks, for their lights
  setVehicles(vehicles, player) { if (vehicles) this.lights.attach(vehicles, player); else this.lights.detach(); }

  // Once per physics step from the race: each truck's grip, gusts that shove the trucks, and water drag in
  // puddles. cars: [{ v, ... }] where v is a Vehicle.
  step(dt, cars) {
    const W = this.W;
    for (const st of cars) {
      const v = st.v, p = v.body.translation();
      v.weatherGrip = this.gripAt(p.x, p.z, v.surface || 0);
      if (!v.contacts) continue;
      const vel = v.body.linvel();
      const spd = Math.hypot(vel.x, vel.z);
      // standing water drags at the tyres
      const pd = W.puddles ? puddleAt(p.x, p.z, W.puddles) : 0;
      if (pd > 0.05 && spd > 3) { const k = -pd * 900 * dt / spd; v.body.applyImpulse({ x: vel.x * k, y: 0, z: vel.z * k }, true); }
      v.inPuddle = pd;
      // crosswind: pressure on the truck's side, F = 1/2 rho Cd A v^2
      if (W.wind > 0.5 && this.gust > 0.1) {
        const f = 0.5 * 1.2 * 1.1 * 7 * (this.gust * 18) ** 2 * dt;
        v.body.applyImpulse({ x: this.windDir.x * f, y: 0, z: this.windDir.z * f }, true);
      }
    }
  }

  // Every frame. camera: the render camera; opts: { lens: true when the camera should show drops on the
  // lens, speed: the player's speed in m/s, dust: the wheel dust pool to tint, ambient: the volcano's
  // ambient effects (rain steams off the lava), time: game time }
  update(dt, t, camera, opts = {}) {
    const W = this.W, T = this.T;
    const cam = camera.position;
    if (dt > 0) this.camVel.copy(cam).sub(this.camPrev).divideScalar(dt);
    if (this.camVel.lengthSq() > 120 * 120) this.camVel.set(0, 0, 0);
    this.camPrev.copy(cam);
    const fwd = camera.getWorldDirection(_v);
    // gusts come and go in waves
    const g = 0.55 + 0.45 * Math.sin(t * 0.31) * Math.sin(t * 0.83 + 1.3);
    this.gust = W.wind * g;
    const ws = 1.5 + W.wind * 12 * g;
    this.wind.copy(this.windDir).multiplyScalar(ws);
    // grass and trees sway faster as the wind gets up
    this.windTime += dt * (0.7 + W.wind * 1.8 * g);
    surfaceUniforms.wxTime.value = t;

    for (const r of this.rain) r.update(t, cam, this.camVel, this.wind, W.rain, this.precipColor);
    _c.copy(this.precipColor).multiplyScalar(1.6);
    for (const s of this.snow) s.update(t, cam, this.camVel, this.wind, W.snow, _c);
    this.splashes.update(t, dt, cam, fwd, W.rain, this.precipColor);

    // lightning
    const flash = this.lightning.update(dt, t, cam, fwd, W.lightning, this.heightAt, (e) => this.emit(e));
    this.flash = flash;
    const u = this.sky.uniforms;
    u.uTime.value = t;
    u.uFlash.value.setRGB(0.55, 0.6, 0.8).multiplyScalar(flash * 3);
    u.uFlashDir.value.copy(this.lightning.dir);
    this.flashLight.intensity = flash * 6;
    this.flashLight.position.copy(cam).addScaledVector(this.lightning.dir, 300);
    this.flashLight.target.position.copy(cam);
    this.flashLight.target.updateMatrixWorld();
    this.hemi.intensity = this.hemiBase + flash * 1.5;
    this.scene.environmentIntensity = this.envBase * (1 + flash * 3);

    // truck lights
    this.lights.update(this.lampLevel, Math.min(1, (W.fog - 1) / 8), cam);

    // drops on the lens
    if (this.lens) {
      const L = this.lens.uniforms;
      const k = opts.lens === false ? 0 : 1;
      const tgt = W.rain * k;
      L.get('uRain').value += (tgt - L.get('uRain').value) * Math.min(1, dt * 1.5);
      L.get('uSnow').value = W.snow * k * 0.6;
      L.get('uTime').value = t;
      L.get('uSpeed').value = THREE.MathUtils.clamp(((opts.speed || 0) - 8) / 30, 0, 1);
    }

    // wheel dust turns to spray in the wet and powder in the snow
    if (opts.dust) {
      const du = opts.dust.mat.uniforms;
      if (du.uTint) {
        const wet = Math.max(W.wet, W.cover);
        du.uTint.value.setRGB(1, 1, 1).lerp(_c.setRGB(2.6, 2.75, 2.95), wet).multiplyScalar(Math.max(0.2, T.light));
        du.uAlpha.value = 0.45 * (1 - wet * 0.35);
      }
    }
    // rain hissing into the lava rivers sends up steam
    const amb = opts.ambient;
    if (amb && W.rain > 0 && amb.riverPts?.length) {
      this.steamAcc = (this.steamAcc || 0) + dt * W.rain * 40;
      let tries = 0;
      while (this.steamAcc > 1 && tries++ < 40) {
        const p = amb.riverPts[Math.floor(Math.random() * amb.riverPts.length)];
        if (Math.hypot(p.x - cam.x, p.z - cam.z) > 380) continue;
        this.steamAcc -= 1;
        const c = 0.55 + Math.random() * 0.2;
        amb.steam.emit(_v.set(p.x + (Math.random() - 0.5) * p.w, p.y + 0.8, p.z + (Math.random() - 0.5) * p.w),
          _w.set(this.wind.x * 0.3, 2 + Math.random() * 2.5, this.wind.z * 0.3), 3 + Math.random() * 4, opts.time ?? t, 4 + Math.random() * 3, c, c, c);
      }
      this.steamAcc = Math.min(this.steamAcc, 5);
    }
    // birds shelter from rain, snow and the dark
    if (amb?.birds) amb.birds.visible = W.rain < 0.2 && W.snow < 0.2 && !T.moon;
  }
}
