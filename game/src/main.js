import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, NoiseEffect, BlendFunction, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { loadWorld, loadMaterials, buildTerrain, buildTrackRibbon, buildLava, setAniso } from './world.js';
import { buildSky, buildPlume, buildAsh, Dust } from './fx.js';
import { buildProps } from './props.js';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || params.has('mobile');
const quality = mobile
  ? { terrainStep: 4, rockDetail: 3, fieldRocks: 250, shadow: 1024, ao: false, pixelRatio: Math.min(devicePixelRatio, 1.5) }
  : { terrainStep: 2, rockDetail: 4, fieldRocks: 700, shadow: 4096, ao: true, pixelRatio: Math.min(devicePixelRatio, 2) };
if (params.has('lowq')) Object.assign(quality, { terrainStep: 3, ao: params.get('ao') === '1', shadow: 2048 });

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
setAniso(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 9000);

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
const hemi = new THREE.HemisphereLight(0x9fb2c8, 0x3a2a20, 0.1);
scene.add(hemi);

const world = await loadWorld();
const M = loadMaterials();
const terrain = buildTerrain(world, M, quality);
scene.add(terrain);
const ribbon = buildTrackRibbon(world, M);
scene.add(ribbon);
const lava = buildLava(world, M);
scene.add(lava);
const plume = buildPlume(world, M, sun);
plume.material.uniforms.uFogColor.value.copy(fogColor);
plume.material.uniforms.uFogDensity.value = scene.fog.density;
scene.add(plume);
const ash = buildAsh();
scene.add(ash);
const dust = new Dust(M);
dust.mat.uniforms.uSun.value.copy(sun);
scene.add(dust.mesh);
const props = await buildProps(world, scene, M, quality);

// lava light: warm fill that follows the camera, scaled by proximity to lava
const lavaLight = new THREE.PointLight(0xff5a1a, 0, 45, 2);
scene.add(lavaLight);

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

// ---------------------------------------------------------------- game
const game = new Game({ world, scene, camera, renderer, dust, M, params, mobile });
await game.init();
document.getElementById('loading').remove();

const clock = new THREE.Clock();
let t = 0;
const tmp = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  game.update(dt, t);
  lava.userData.uniforms.uTime.value = t;
  plume.material.uniforms.uTime.value = t + 400;
  ash.material.uniforms.uTime.value = t;
  ash.material.uniforms.uCam.value.copy(camera.position);
  ash.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * 0.6;
  dust.update(t);
  props.update?.(t);
  // shadow frustum follows the focus point, texel-snapped to stop shimmering
  const focus = game.focus;
  const texel = (sc.right - sc.left) / sunLight.shadow.mapSize.x;
  tmp.copy(focus);
  tmp.x = Math.round(tmp.x / texel) * texel; tmp.z = Math.round(tmp.z / texel) * texel;
  sunLight.target.position.copy(tmp);
  sunLight.position.copy(tmp).addScaledVector(sun, 400);
  const lp = game.nearestLava(camera.position);
  lavaLight.position.copy(lp.pos);
  lavaLight.intensity = lp.strength * 120;
  composer.render(dt);
  if (!still) requestAnimationFrame(frame);
}
// ?still=N : simulate N fixed frames then render once (for offline screenshots)
const still = params.has('still') ? +params.get('still') || 1 : 0;
if (still) {
  clock.getDelta = () => 1 / 60;
  for (let i = 0; i < still - 1; i++) { t += 1 / 60; game.update(1 / 60, t); }
  frame();
  renderer.getContext().finish();
  window.__ready = true;
} else {
  window.__ready = true;
  requestAnimationFrame(frame);
}
