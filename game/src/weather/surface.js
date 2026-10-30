// Wet and snowy surfaces. Every standard (PBR) material that is adopted gets a little extra shader code just
// before lighting: rain darkens porous surfaces and makes them glossy, water stands in puddles on flat ground
// (mirror-smooth, rippled by the drops), and snow settles on surfaces that face up. All adopted materials
// share one set of uniforms, so the weather changes everything at once without recompiling. With the
// uniforms at zero the code leaves the material exactly as it was.
//
// Kinds, set with adopt(root, kind) or material.userData.wx = kind before the weather adopts the scene:
//   ground  terrain: soaks, puddles and ripples, full snow cover
//   road    track surface: same, but trucks keep the snow packed down to slush
//   object  buildings, rocks, props (the default): wet sheen, snow on tops, no puddles
//   foliage grass, shrubs, trees: darker when wet, snow on tops
//   vehicle trucks: wet paint, a light dusting of snow on flat panels
// material.userData.wx = false (or userData.noWeather) keeps a material out, e.g. lava.

export const surfaceUniforms = {
  wxWet: { value: 0 }, wxPuddle: { value: 0 }, wxSnow: { value: 0 }, wxRipple: { value: 0 }, wxTime: { value: 0 }, wxSun: { value: 1 },
};

const KINDS = {
  ground: { wet: 1, puddles: 1, snow: 1 },
  road: { wet: 1, puddles: 1, snow: 0.55 },
  object: { wet: 0.8, puddles: 0, snow: 0.9 },
  foliage: { wet: 0.6, puddles: 0, snow: 0.8 },
  vehicle: { wet: 0.7, puddles: 0, snow: 0.45 },
};

// The puddle field: value noise in world xz, identical here and in GLSL so the puddles the tyres feel are
// the ones on screen.
const fract = (x) => x - Math.floor(x);
function hash(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
export function puddleField(x, z) {
  return noise(x / 9, z / 9) * 0.62 + noise(x / 2.7 + 17, z / 2.7 + 17) * 0.28 + noise(x / 0.9 + 5, z / 0.9 + 5) * 0.1;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const puddleThreshold = (amount) => 0.8 + (0.62 - 0.8) * amount;
// 0..1: how deep in a puddle the point is, for the given puddle amount
export function puddleAt(x, z, amount) {
  if (amount <= 0) return 0;
  const thr = puddleThreshold(amount);
  return smooth(thr, thr + 0.05, puddleField(x, z));
}

const GLSL_FUNCS = /* glsl */`
uniform float wxWet, wxPuddle, wxSnow, wxRipple, wxTime, wxSun;
float wxHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxHash(i), wxHash(i + vec2(1.0, 0.0)), u.x), mix(wxHash(i + vec2(0.0, 1.0)), wxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wxPuddleField(vec2 p) { return wxNoise(p / 9.0) * 0.62 + wxNoise(p / 2.7 + 17.0) * 0.28 + wxNoise(p / 0.9 + 5.0) * 0.1; }
// expanding rings where drops land, as a slope in xz
vec2 wxRipples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 3; k++) {
    vec2 q = p * (2.6 + float(k) * 0.9) + float(k) * 7.31;
    vec2 cell = floor(q);
    float h = wxHash(cell + float(k) * 13.7);
    vec2 c = cell + 0.3 + 0.4 * vec2(h, wxHash(cell.yx + 3.1));
    float ph = fract(t * (1.1 + h * 0.6) + h * 7.0);
    vec2 d = q - c; float L = length(d) + 1e-4;
    float r = ph * 0.45;
    float x = L - r;
    float ring = sin(x * 42.0) * exp(-x * x * 420.0) * (1.0 - ph) * (1.0 - ph);
    acc += d / L * ring;
  }
  return acc * 0.3;
}
`;

function block(k) {
  const f = (x) => x.toFixed(3);
  return /* glsl */`
{
  vec3 wxP = cameraPosition + transpose(mat3(viewMatrix)) * (-vViewPosition);
  vec3 wxNw = normalize(transpose(mat3(viewMatrix)) * normal);
  float wxUp = wxNw.y;
  float wxD = length(vViewPosition);
  vec3 wxUpV = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
  float wxW = wxWet * ${f(k.wet)};
  float wxPd = 0.0;
  if (wxW > 0.001) {
    // porous, rough surfaces soak up water and darken; everything wet turns glossy, steep faces drain a little
    float por = clamp(material.roughness * 1.4 - 0.3, 0.0, 1.0);
    float face = mix(0.6, 1.0, smoothstep(-0.2, 0.7, wxUp));
    material.diffuseColor *= 1.0 - wxW * por * 0.45 * face;
    material.roughness = mix(material.roughness, mix(0.34, 0.14, smoothstep(0.3, 0.9, wxUp)), wxW * face * 0.88);
    ${k.puddles ? `
    if (wxPuddle > 0.001) {
      float pf = wxPuddleField(wxP.xz);
      float thr = mix(0.80, 0.62, wxPuddle);
      float flat_ = smoothstep(0.93, 0.985, wxUp);
      wxPd = smoothstep(thr, thr + 0.05, pf) * flat_;
      // a dark soaked rim round each puddle
      material.diffuseColor *= 1.0 - smoothstep(thr - 0.07, thr, pf) * (1.0 - wxPd) * 0.25 * flat_ * wxPuddle;
      material.diffuseColor = mix(material.diffuseColor, material.diffuseColor * 0.3, wxPd);
      material.roughness = mix(material.roughness, 0.06, wxPd);
      material.specularColor = mix(material.specularColor, vec3(0.02), wxPd);
      normal = normalize(mix(normal, wxUpV, wxPd));
    }` : ''}
    if (wxRipple > 0.001 && wxD < 40.0) {
      vec2 rg = wxRipples(wxP.xz, wxTime) * wxRipple * (1.0 - smoothstep(14.0, 40.0, wxD));
      float rk = smoothstep(0.8, 0.95, wxUp) * (0.2 + 0.8 * wxPd);
      normal = normalize(normal + mat3(viewMatrix) * vec3(rg.x, 0.0, rg.y) * rk);
    }
  }
  float wxS = wxSnow * ${f(k.snow)};
  if (wxS > 0.001) {
    // snow lies on what faces up, drifting in patches; it hides the colour, metal and shine underneath
    float sn = wxNoise(wxP.xz / 5.0) * 0.6 + wxNoise(wxP.xz / 1.3) * 0.4;
    float cov = smoothstep(0.38, 0.72, wxUp * min(1.0, wxS * 1.2) + (sn - 0.5) * 0.55) * min(1.0, wxS * 1.5);
    vec3 snowC = vec3(0.8, 0.84, 0.9) * (0.88 + 0.12 * sn);
    material.diffuseColor = mix(material.diffuseColor, snowC, cov);
    material.roughness = mix(material.roughness, 0.58, cov);
    material.specularColor = mix(material.specularColor, vec3(0.03), cov);
    normal = normalize(mix(normal, wxUpV, cov * 0.6));
    // glints of ice close up
    float sp = step(0.988, wxHash(floor(wxP.xz * 38.0) + floor(cameraPosition.xz * 0.7)));
    totalEmissiveRadiance += vec3(sp * cov * (1.0 - smoothstep(3.0, 18.0, wxD)) * 0.5 * wxSun);
  }
}
`;
}

function inject(sh, kind) {
  const k = KINDS[kind] || KINDS.object;
  Object.assign(sh.uniforms, surfaceUniforms);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL_FUNCS}`)
    .replace('#include <lights_fragment_begin>', `${block(k)}\n#include <lights_fragment_begin>`);
}

function patch(m, kind) {
  if (!m || !m.isMeshStandardMaterial || m.userData.wxKind || m.userData.wx === false || m.userData.noWeather) return false;
  const k = KINDS[m.userData.wx] ? m.userData.wx : kind;
  m.userData.wxKind = k;
  const prevKey = m.customProgramCacheKey();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); inject(sh, k); };
  // the wrapper's source is the same for every material, so keep the original key in the cache key
  m.customProgramCacheKey = () => `${prevKey}|wx:${k}`;
  m.needsUpdate = true;
  return true;
}

// Give every standard material under root the weather; returns how many were new
export function adopt(root, kind = 'object') {
  let n = 0;
  root.traverse((o) => {
    if (!o.material || o.userData.noWeather) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) n += patch(m, kind) ? 1 : 0;
  });
  return n;
}
