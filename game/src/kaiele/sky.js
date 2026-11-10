import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;

// Kai'ele sky: trade-wind cumulus over a deep tropical blue (Poly Haven 'kloofendal_48d_partly_cloudy_puresky',
// CC0, stored as an 8-bit dome: RGB = (L / lmax) ^ (1/2.2), from 90 degrees up to 8 below the horizon), a warm
// high sun, and haze over the ocean. Replaces the volcano's dome from fx.js and re-points the shared sun at the
// HDRI's sun (its height; the azimuth stays where the game had it, the dome is turned to match), so cloud
// lighting, shadows and reflections agree.
//
// All of the sky lives in this one function so the weather can drive it later: the returned handle has the
// dome's uniforms (uCloud 0..1 greys and dims the sky, uHaze the horizon colour, uExposure) and refreshEnv() to
// re-render the reflections after a change.
export async function buildKaieleSky(ctx) {
  const { renderer, scene, sun, fog, sunLight } = ctx;
  const [tex, info] = await Promise.all([
    new THREE.TextureLoader().loadAsync(`${BASE}textures/kaiele/sky.webp`),
    fetch(`${BASE}textures/kaiele/sky.json`).then((r) => r.json()),
  ]);
  tex.colorSpace = THREE.NoColorSpace; // decoded by hand: the encoding is a plain 2.2 power over lmax
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;

  // the HDRI's sun, in three's equirect frame; keep the game's azimuth
  const phiH = (info.u - 0.5) * Math.PI * 2;
  const phiT = Math.atan2(sun.z, sun.x);
  const el = THREE.MathUtils.degToRad(info.elev);
  sun.set(Math.cos(phiT) * Math.cos(el), Math.sin(el), Math.sin(phiT) * Math.cos(el)).normalize();

  // the volcano's dome (fx.js) would draw over the far horizon; it is the scene's only BackSide sky sphere
  scene.traverse((o) => { if (o.material?.uniforms?.tSky && o.renderOrder === -10) o.visible = false; });

  const haze = new THREE.Color(0.66, 0.79, 0.93);
  const uniforms = {
    tSky: { value: tex }, uLmax: { value: info.lmax }, uRot: { value: (phiT - phiH) / (Math.PI * 2) },
    uBelow: { value: info.below }, uSun: { value: sun }, uHaze: { value: haze },
    uSea: { value: new THREE.Color(0.03, 0.09, 0.13) }, uExposure: { value: 1.05 }, uCloud: { value: 0 }, uSunDisc: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: /* glsl */`
      uniform sampler2D tSky; uniform float uLmax, uRot, uBelow, uExposure, uCloud, uSunDisc;
      uniform vec3 uSun, uHaze, uSea; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float elv = degrees(asin(clamp(d.y, -1.0, 1.0)));
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5 - uRot, 1.0 - (90.0 - max(elv, -uBelow + 0.5)) / (90.0 + uBelow));
        // explicit gradients: the atan seam would otherwise pick the smallest mip in a one-pixel line
        vec2 gx = dFdx(uv), gy = dFdy(uv); gx.x -= floor(gx.x + 0.5); gy.x -= floor(gy.x + 0.5);
        vec3 c = pow(textureGrad(tSky, uv, gx, gy).rgb, vec3(2.2)) * uLmax;
        // tropical grade: a deeper, more saturated blue overhead, clouds kept white
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float cloud = smoothstep(0.35, 0.9, l / max(c.b, 1e-3) * 1.1);
        vec3 blue = mix(vec3(l), c, 1.45) * vec3(0.8, 0.95, 1.12);
        c = mix(blue, mix(vec3(l), c, 0.7) * vec3(1.03, 1.01, 0.98), cloud);
        // the HDRI's horizon is a hazy grey veldt; ours is open ocean under bright trade-wind haze
        float h = smoothstep(-0.5, 9.0, elv);
        c = mix(uHaze * (0.95 + 0.15 * pow(max(dot(d, uSun), 0.0), 4.0)), c, h);
        c = mix(c, uSea, smoothstep(0.0, -3.0, elv));
        // the sun: hot disc and a soft aureole (the HDRI's own sun is clipped by the 8-bit encoding)
        float cs = dot(d, uSun);
        c += vec3(1.0, 0.93, 0.8) * (smoothstep(0.99996, 0.99999, cs) * 60.0 + pow(max(cs, 0.0), 300.0) * 2.0 + pow(max(cs, 0.0), 24.0) * 0.25) * uSunDisc * (1.0 - uCloud * 0.85);
        // weather: overcast greys and dims it
        c = mix(c, vec3(l) * vec3(0.78, 0.8, 0.84) * 0.6 + uHaze * 0.15, uCloud);
        gl_FragColor = vec4(c * uExposure, 1.0);
      }`,
  });
  mat.userData.wx = false;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8500, 64, 32), mat);
  dome.renderOrder = -11;
  dome.frustumCulled = false;
  dome.onBeforeRender = (r, s, cam) => dome.position.copy(cam.position);
  scene.add(dome);

  // reflections and ambient light from the same dome, without the sun disc (the sun light brings its own)
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat);
  envScene.add(envDome);
  let envRT = null;
  const refreshEnv = () => {
    const sd = uniforms.uSunDisc.value;
    uniforms.uSunDisc.value = 0;
    envRT?.dispose();
    envRT = pm.fromScene(envScene, 0, 0.1, 200);
    uniforms.uSunDisc.value = sd;
    scene.environment = envRT.texture;
  };
  refreshEnv();
  scene.environmentIntensity = 0.75;

  // clear tropical air: blue-white haze at the horizon, a warm strong sun
  fog.color.copy(haze).multiplyScalar(0.92);
  fog.density = 0.00013;
  fog.sun = 3.3;
  sunLight?.color.setRGB(1.0, 0.95, 0.86);
  return { dome, uniforms, refreshEnv, update() {} };
}
