import * as THREE from 'three';
import { GodRaysEffect, DepthOfFieldEffect, BlendFunction, KernelSize } from 'postprocessing';

// Ultra graphics extras: height fog with sun glare, sun shafts through the ash, depth of field, skid marks.

// Replaces three's exponential fog with fog that thins with height, so valleys fill with ash haze and the
// summit stays clear, and that glows warm when looking towards the sun. Patches the shared shader chunks,
// so it has to run before any material compiles.
export function patchHeightFog(sun, { base = 180, falloff = 0.006, amount = 0.6 } = {}) {
  const f = (x) => x.toFixed(6);
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n  varying float vFogDepth;\n  varying vec3 vFogWorld;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n  vFogDepth = - mvPosition.z;\n  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif';
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = length(fogRay);
    float fogK = ${f(falloff)};
    float fogHc = cameraPosition.y - ${f(base)}, fogHp = vFogWorld.y - ${f(base)};
    float fogDh = fogHp - fogHc;
    float fogInt = abs(fogDh) > 0.5 ? (exp(-fogK * fogHc) - exp(-fogK * fogHp)) / (fogK * fogDh) : exp(-fogK * fogHc);
    float fogFactor = 1.0 - exp(-fogDensity * ${f(amount)} * fogDist * min(fogInt, 8.0));
    // the far horizon still fades out whatever its height
    fogFactor = max(fogFactor, 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist * 0.5));
    float fogSun = pow(max(dot(fogRay / max(fogDist, 1e-3), vec3(${f(sun.x)}, ${f(sun.y)}, ${f(sun.z)})), 0.0), 6.0);
    vec3 fogCol = fogColor + vec3(0.45, 0.3, 0.12) * fogSun;
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    vec3 fogCol = fogColor;
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;
}

// Sun shafts: a bright disc far out along the sun direction, ray-marched in screen space and masked by the
// terrain, so light streams over ridges and around the trucks when the camera looks towards the sun.
export class SunShafts {
  constructor(camera, sun) {
    this.sun = sun.clone().normalize();
    this.disc = new THREE.Mesh(new THREE.SphereGeometry(210, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, depthWrite: false, fog: false }));
    this.disc.frustumCulled = false;
    this.effect = new GodRaysEffect(camera, this.disc, {
      blendFunction: BlendFunction.SCREEN, samples: 80, density: 0.97, decay: 0.93, weight: 0.32, exposure: 0.42,
      clampMax: 0.85, kernelSize: KernelSize.SMALL, resolutionScale: 0.5, blur: true,
    });
  }
  update(camera) {
    this.disc.position.copy(camera.position).addScaledVector(this.sun, 6000);
    this.disc.updateMatrixWorld();
  }
}

// Depth of field: the truck stays sharp and the far hills soften; the slow-motion wreck shot pulls a tight focus.
export class Focus {
  constructor(camera) {
    this.target = new THREE.Vector3();
    this.effect = new DepthOfFieldEffect(camera, { focusDistance: 8, focusRange: 120, bokehScale: 1.6, resolutionScale: 0.5 });
    this.effect.target = this.target;
  }
  update(pos, cinematic, mode) {
    this.target.copy(pos);
    const inCar = mode === 'hood' || mode === 'bumper';
    const range = cinematic ? 6 : inCar ? 220 : mode === 'tv' ? 40 : 150;
    const coc = this.effect.cocMaterial;
    coc.focusRange += (range - coc.focusRange) * 0.1;
    this.effect.bokehScale = cinematic ? 3.2 : 1.6;
  }
}

// Tyre marks: dark quads laid behind sliding, spinning or locked wheels; darker on the track, lighter
// grooves on loose ground. A ring buffer, so the oldest marks give way to new ones.
export class SkidMarks {
  constructor(scene, max = 2000) {
    this.max = max;
    const pos = new Float32Array(max * 4 * 3), col = new Float32Array(max * 4 * 4), idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    this.mat.blending = THREE.CustomBlending;
    this.mat.blendSrc = THREE.ZeroFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.i = 0;
    this.last = new Map();
  }
  // key names one wheel; p is its contact point, side its sideways unit vector, k 0..1 strength
  add(key, p, side, k, loose) {
    const prev = this.last.get(key);
    const w = 0.2;
    if (!prev || k <= 0.02) { this.last.set(key, k > 0.02 ? { p: p.clone(), side: side.clone(), k } : null); return; }
    if (prev.p.distanceToSquared(p) < 0.09) return;
    if (prev.p.distanceToSquared(p) > 9) { this.last.set(key, { p: p.clone(), side: side.clone(), k }); return; }
    const g = this.mesh.geometry, P = g.attributes.position.array, C = g.attributes.color.array;
    const i = this.i;
    const pts = [prev.p.clone().addScaledVector(prev.side, -w), prev.p.clone().addScaledVector(prev.side, w),
      p.clone().addScaledVector(side, -w), p.clone().addScaledVector(side, w)];
    const a0 = Math.min(0.75, prev.k) * (loose ? 0.6 : 1), a1 = Math.min(0.75, k) * (loose ? 0.6 : 1);
    pts.forEach((q, j) => {
      P.set([q.x, q.y + 0.03, q.z], (i * 4 + j) * 3);
      C.set([0, 0, 0, j < 2 ? a0 : a1], (i * 4 + j) * 4);
    });
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    this.i = (i + 1) % this.max;
    this.last.set(key, { p: p.clone(), side: side.clone(), k });
  }
  clear() {
    this.mesh.geometry.attributes.color.array.fill(0);
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.last.clear();
  }
}
