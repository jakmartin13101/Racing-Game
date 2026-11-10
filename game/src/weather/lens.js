import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';

// Rain on the lens: beads of water that gather, sit, and run down the glass, each one refracting the picture
// behind it (upside down and a little blurred, like a real drop). At speed the wind blows them back across
// the lens in streaks. Snow leaves a few melting flakes instead.
export class LensDropsEffect extends Effect {
  constructor() {
    super('LensDropsEffect', /* glsl */`
      uniform float uRain, uTime, uSpeed, uSnow;
      float lh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      // one layer of drops in a grid: xy = refraction offset, z = coverage
      vec3 layer(vec2 uv, float scale, float t, float density, float run) {
        vec2 p = uv * vec2(aspect, 1.0) * scale;
        // running drops slide down their column; columns move at their own pace
        float col = floor(p.x);
        float hc = lh(vec2(col, scale));
        p.y += t * run * (0.3 + hc * 0.7);
        vec2 id = floor(p);
        vec2 f = fract(p) - 0.5;
        float h = lh(id + scale * 3.1);
        if (h > density) return vec3(0.0);
        vec2 c = (vec2(lh(id + 1.7), lh(id + 9.3)) - 0.5) * 0.5;
        // each drop beads up, sits a while and dries away
        float life = fract(t * (0.03 + 0.08 * h) + h * 13.0);
        float r = (0.16 + 0.22 * lh(id + 4.4)) * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.75, 1.0, life));
        vec2 d = (f - c) * vec2(1.0, 1.0 + run * 0.6);
        float L = length(d);
        float m = smoothstep(r, r * 0.7, L);
        // a thin wet trail above a running drop
        float trail = run > 0.0 ? smoothstep(0.06, 0.0, abs(f.x - c.x)) * step(c.y, f.y) * smoothstep(0.5, 0.0, f.y - c.y) * 0.35 : 0.0;
        return vec3(-d / max(r, 1e-3) * m, max(m, trail * step(0.001, r)));
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        if (uRain < 0.001 && uSnow < 0.001) { outputColor = inputColor; return; }
        float t = uTime;
        vec2 wuv = uv;
        vec3 a = layer(wuv, 7.0, t, 0.35 * uRain, 0.0);
        vec3 b = layer(wuv + 0.37, 13.0, t * 1.3, 0.5 * uRain, 0.0);
        vec3 c = layer(wuv + 0.71, 5.0, t, 0.25 * uRain * (1.0 - uSpeed), 0.6);
        vec3 s = layer(uv + 0.13, 9.0, t * 0.5, 0.2 * uSnow, 0.0);
        vec2 off = a.xy * a.z + b.xy * b.z * 0.6 + c.xy * c.z;
        float cov = clamp(a.z + b.z + c.z, 0.0, 1.0);
        // streaks blown back across the lens at speed
        float streak = 0.0;
        if (uSpeed > 0.05 && uRain > 0.001) {
          vec2 q = vec2(uv.x * aspect * 40.0, uv.y * 3.0 - t * 2.5 * uSpeed);
          vec2 id = floor(q);
          float h = lh(id);
          float on = step(1.0 - 0.18 * uRain * uSpeed, h);
          float fx = abs(fract(q.x) - 0.5);
          streak = on * smoothstep(0.12, 0.0, fx) * smoothstep(0.0, 0.3, fract(q.y)) * (1.0 - fract(q.y));
          off += vec2(0.0, streak * 0.4);
        }
        vec2 suv = uv + off * 0.035;
        vec3 col = texture2D(inputBuffer, suv).rgb;
        if (cov > 0.01) {
          // drops blur what is behind them a little
          vec2 px = vec2(1.5) / resolution;
          col = mix(col, (texture2D(inputBuffer, suv + px).rgb + texture2D(inputBuffer, suv - px).rgb + texture2D(inputBuffer, suv + vec2(px.x, -px.y)).rgb + col) * 0.25, cov * 0.7);
          // a dark rim and a highlight on each bead
          col *= 1.0 - cov * 0.08 * (1.0 - length(off));
          col += vec3(0.12) * smoothstep(0.55, 0.9, -off.y) * cov;
        }
        col = mix(col, col * 0.92 + 0.06, streak * 0.4);
        // melting flakes: soft white blots
        col = mix(col, vec3(0.85, 0.88, 0.92) * (0.6 + 0.4 * dot(col, vec3(0.33))), s.z * 0.55);
        outputColor = vec4(col, inputColor.a);
      }`, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['uRain', new THREE.Uniform(0)], ['uTime', new THREE.Uniform(0)], ['uSpeed', new THREE.Uniform(0)], ['uSnow', new THREE.Uniform(0)]]),
    });
  }
}
