import * as THREE from 'three';

// The sky for every time of day and weather: an atmosphere gradient with a sun or moon, drifting fbm clouds
// whose cover, colour and darkness follow the weather, stars on clear nights, the glow of lightning in the
// clouds, and the original midday HDRI blended in on clear days. The same dome is rendered into the
// environment map, so reflections and ambient light match the sky.

const VERT = /* glsl */`varying vec3 vD;
void main(){ vD = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;

const FRAG = /* glsl */`
uniform sampler2D tSky; uniform float uHdr, uInt, uEnv, uTime, uCloud, uStars, uGlow, uFogBand, uCloudDark;
uniform vec3 uHaze, uSun, uSunCol, uMoon, uZenith, uHorizon, uCloudLit, uCloudShade, uFlash, uFlashDir;
uniform vec2 uWind;
varying vec3 vD;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { s += a * vn(p); p = r * p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vD);
  float y = d.y;
  float sd = max(dot(d, uSun), 0.0);
  // atmosphere: deep at the zenith, pale and bright towards the horizon, warm around a low sun
  float hz = pow(1.0 - max(y, 0.0), 3.5);
  vec3 sky = mix(uZenith, uHorizon, hz);
  sky += uSunCol * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.5) * uGlow * (0.4 + 0.6 * hz);
  // clouds on a plane overhead, drifting with the wind, lit on the sun side and dark and heavy underneath
  float cov = 0.0;
  if (uCloud > 0.0 && y > -0.02) {
    vec2 uv = d.xz / (max(y, 0.0) + 0.09) * 0.55 + uWind * uTime;
    float n = fbm(uv);
    float n2 = fbm(uv * 2.7 + 5.0 + uWind * uTime * 0.6);
    float th = 1.0 - uCloud;
    cov = smoothstep(th - 0.12, th + 0.32, n * 0.82 + n2 * 0.25) * smoothstep(-0.02, 0.1, y);
    float dens = smoothstep(0.35, 1.0, n + uCloud * 0.35);
    vec3 cc = mix(uCloudLit, uCloudShade, dens * uCloudDark);
    // bright silver edges towards the sun
    cc += uSunCol * pow(sd, 5.0) * (1.0 - dens) * 0.6 * uGlow;
    cc *= 0.85 + 0.3 * n2;
    sky = mix(sky, cc, cov);
  }
  // lightning lights the cloud from inside
  sky += uFlash * (0.25 + 0.75 * pow(max(dot(d, uFlashDir), 0.0), 3.0)) * (0.3 + 0.7 * cov);
  if (uEnv < 0.5) {
    // the sun's disc
    float disc = smoothstep(0.99955, 0.9998, sd);
    sky += uSunCol * disc * 40.0 * uGlow * (1.0 - cov * 0.97);
    // the moon: a pale disc with darker seas, a faint halo
    float md = dot(d, uMoon);
    if (uStars > 0.0) {
      float moon = smoothstep(0.99935, 0.9996, md);
      vec3 mp = d - uMoon;
      float seas = vn(mp.xz * 900.0) * 0.5 + vn(mp.xy * 2100.0) * 0.5;
      sky += vec3(0.9, 0.93, 1.0) * moon * (1.2 - seas * 0.5) * 2.5 * (1.0 - cov * 0.9) * uStars;
      sky += vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 300.0) * 0.6 * uStars * (1.0 - cov * 0.5);
      // stars, twinkling, fading into the horizon glow
      vec3 sp = d * 260.0;
      vec3 c = floor(sp);
      float h = h31(c);
      float star = step(0.9965, h) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
      star *= 0.6 + 0.4 * sin(uTime * (2.0 + h * 9.0) + h * 80.0);
      sky += vec3(0.8, 0.85, 1.0) * star * (h - 0.9965) * 900.0 * uStars * (1.0 - cov) * smoothstep(0.02, 0.25, y);
    }
  }
  // the original midday sky
  if (uHdr > 0.0) {
    vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    vec3 c = texture2D(tSky, uv).rgb * uInt;
    float h = smoothstep(-0.04, 0.1, d.y);
    c = mix(uHaze, c, h * h * (3.0 - 2.0 * h) * 0.7 + 0.3 * step(0.0, d.y) * h);
    sky = mix(sky, c, uHdr);
  }
  // haze: the horizon melts into the fog, more so the thicker it is, and the ground below is all haze
  float band = 1.0 - smoothstep(-0.02, 0.06 + uFogBand * 0.5, y);
  sky = mix(sky, uHaze, max(band * (1.0 - uHdr), uFogBand * 0.85 * (1.0 - smoothstep(0.0, 0.9, y))));
  gl_FragColor = vec4(sky, 1.0);
}`;

export class Sky {
  // dome: the existing sky dome mesh (its material is replaced); hdr: the midday HDRI
  constructor(renderer, scene, { dome, hdr, env, pm }) {
    this.renderer = renderer;
    this.scene = scene;
    this.hdrEnv = env;
    this.pm = pm || new THREE.PMREMGenerator(renderer);
    const u = this.uniforms = {
      tSky: { value: hdr }, uHdr: { value: 1 }, uInt: { value: 0.85 }, uEnv: { value: 0 }, uTime: { value: 0 },
      uCloud: { value: 0 }, uStars: { value: 0 }, uGlow: { value: 1 }, uFogBand: { value: 0 }, uCloudDark: { value: 0.5 },
      uHaze: { value: new THREE.Color(0.62, 0.64, 0.66) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uMoon: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uFlash: { value: new THREE.Color(0, 0, 0) },
      uFlashDir: { value: new THREE.Vector3(0, 1, 0) }, uWind: { value: new THREE.Vector2(0.004, 0.0015) },
    };
    this.material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u, vertexShader: VERT, fragmentShader: FRAG });
    dome.material = this.material;
    this.dome = dome;
    // a copy of the dome alone, rendered into the environment map
    this.envScene = new THREE.Scene();
    const ed = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), this.material);
    ed.frustumCulled = false;
    this.envScene.add(ed);
    this.envRT = null;
  }

  // re-render the environment map from the current sky (once per change of conditions)
  bakeEnvironment(useHdr) {
    if (useHdr && this.hdrEnv) { this.scene.environment = this.hdrEnv; return; }
    const u = this.uniforms;
    u.uEnv.value = 1;
    const rt = this.pm.fromScene(this.envScene, 0.02, 0.1, 200);
    u.uEnv.value = 0;
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
