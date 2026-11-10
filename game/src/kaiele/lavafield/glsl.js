// GLSL shared by the lava field's ground decals and rocks.
export const NOISE_GLSL = /* glsl */`
vec2 lfHash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float lfHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// cellular cracks: x = distance to the nearest cell border (approx F2 - F1), y = a per-cell random
vec2 lfCells(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = lfHash2(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = lfHash(n + g); } else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}
`;
