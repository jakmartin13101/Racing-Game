import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';
import { terrainAxes, axisIndex, smoothstep } from './common.js';

// Fresh lava ground along the tracks and round the vents, skylights and the ocean entry: glassy black-silver ropy
// pahoehoe (lobes, ropes folded across the flow, tumulus cracks) and dark, rough 'a'a clinker, from the lava masks.
// Near live lava the cracks in the crust glow and pulse. Round the ocean entry the ground just above the sea is
// fresh black sand. Laid as decals on the terrain's own vertices (coplanar, no z-fighting), chunked for culling.
export function buildCrust({ world, quality, masks, trackGrid, lavaGrid, features, M, tex, group }) {
  const q = quality.name;
  // how far either side of the road the fresh-lava detail runs (the band frays out in lobes at its edge)
  const D = { low: 45, medium: 70, high: 90, ultra: 60 }[q] ?? 70;
  const { ax, az, ok } = terrainAxes(world, quality);
  const nx = ax.length, nz = az.length;
  const mark = new Uint8Array(nx * nz);
  const markDisc = (x, z, r) => {
    const i0 = axisIndex(ax, x - r), i1 = axisIndex(ax, x + r) + 1, j0 = axisIndex(az, z - r), j1 = axisIndex(az, z + r) + 1;
    for (let j = j0; j <= j1 && j < nz - 1; j++) for (let i = i0; i <= i1 && i < nx - 1; i++) {
      const cx = (ax[i] + ax[i + 1]) / 2, cz = (az[j] + az[j + 1]) / 2;
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) mark[j * nx + i] = 1;
    }
  };
  for (const t of world.data.tracks) {
    const C = t.centre;
    for (let k = 0; k < C.length; k += 4) if (masks.fresh(C[k][0], C[k][2]) > 0.05) markDisc(C[k][0], C[k][2], D);
  }
  for (const f of features) markDisc(f.x, f.z, f.r);

  // per-vertex data, computed once per lattice vertex
  const vidx = new Int32Array(nx * nz).fill(-1);
  const P = [], N = [], A = [], B = [];
  const nrm = new THREE.Vector3();
  const vert = (i, j) => {
    const k = j * nx + i;
    if (vidx[k] >= 0) return vidx[k];
    const x = ax[i], z = az[j], y = world.heightAt(x, z);
    world.normalAt(x, z, nrm);
    const dRoad = trackGrid.dist(x, z, 90);
    // cover: 0 in the middle of the band, 1 at its edge (features count as band too)
    let cover = dRoad / D;
    for (const f of features) cover = Math.min(cover, Math.hypot(x - f.x, z - f.z) / f.r);
    const dl = lavaGrid.dist(x, z, 60);
    const w = lavaGrid.best ? lavaGrid.best[2] : 0;
    const heat = 1 - smoothstep(-2, 16, dl - w);
    // the flow direction: down the broad fall line (smoothed, so the ropes don't swirl with every bump)
    const e = 14;
    let fx = world.heightAt(x - e, z) - world.heightAt(x + e, z), fz = world.heightAt(x, z - e) - world.heightAt(x, z + e);
    const fl = Math.hypot(fx, fz);
    if (fl < 1e-3) { fx = 0; fz = 1; } else { fx /= fl; fz /= fl; }
    const id = P.length / 3;
    P.push(x, y, z); N.push(nrm.x, nrm.y, nrm.z);
    A.push(dRoad, Math.min(cover, 1.5), heat, masks.fresh(x, z));
    B.push(masks.aa(x, z), fx, fz);
    vidx[k] = id;
    return id;
  };
  // triangles, bucketed into 256 m chunks so the camera culls whole chunks
  const CH = 256, chunks = new Map();
  const oe = world.data.oceanEntry;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!mark[j * nx + i]) continue;
    const cx = (ax[i] + ax[i + 1]) / 2, cz = (az[j] + az[j + 1]) / 2;
    if (!ok(cx, cz)) continue;
    const nearSea = oe && Math.hypot(cx - oe.x, cz - oe.z) < 260;
    if (!nearSea && masks.fresh(cx, cz) < 0.04) continue;
    if (world.heightAt(cx, cz) < -2.5) continue; // under the sea
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
    const key = `${Math.floor(cx / CH)},${Math.floor(cz / CH)}`;
    let l = chunks.get(key);
    if (!l) chunks.set(key, (l = []));
    l.push(a, c, b, b, c, d); // the terrain's own diagonal
  }
  const pos = new THREE.Float32BufferAttribute(P, 3), nor = new THREE.Float32BufferAttribute(N, 3);
  const aux = new THREE.Float32BufferAttribute(A, 4), aux2 = new THREE.Float32BufferAttribute(B, 3);

  const mat = crustMaterial(M, tex, world, D, quality);
  let tris = 0;
  for (const idx of chunks.values()) {
    // each chunk gets its own compact vertex set
    const remap = new Map(), p = [], n = [], a = [], b = [], ix = [];
    for (const v of idx) {
      let r = remap.get(v);
      if (r === undefined) {
        r = remap.size; remap.set(v, r);
        p.push(pos.getX(v), pos.getY(v), pos.getZ(v)); n.push(nor.getX(v), nor.getY(v), nor.getZ(v));
        a.push(aux.getX(v), aux.getY(v), aux.getZ(v), aux.getW(v)); b.push(aux2.getX(v), aux2.getY(v), aux2.getZ(v));
      }
      ix.push(r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('aux', new THREE.Float32BufferAttribute(a, 4));
    g.setAttribute('aux2', new THREE.Float32BufferAttribute(b, 3));
    g.setIndex(remap.size > 65535 ? new THREE.Uint32BufferAttribute(ix, 1) : new THREE.Uint16BufferAttribute(ix, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.renderOrder = 0.5;
    group.add(m);
    tris += ix.length / 3;
  }
  return { mat, tris, chunks: chunks.size };
}

function crustMaterial(M, tex, world, D, quality) {
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.5, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, envMapIntensity: 0.35,
  });
  const oe = world.data.oceanEntry || { x: 1e6, z: 1e6 };
  const u = {
    uTime: { value: 0 }, tNoise: { value: M.noise }, tPah: { value: tex.pahoehoe }, tClA: { value: tex.clinkerA }, tClN: { value: tex.clinkerN },
    tDetail: { value: M.detail }, uD: { value: D }, uHalfW: { value: 7.5 }, uSea: { value: new THREE.Vector3(oe.x, 0, oe.z) },
    uSummit: { value: new THREE.Vector2(world.data.crater?.x ?? 0, world.data.crater?.z ?? 0) },
  };
  const lowq = !!quality.aiLod;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aux; attribute vec3 aux2;
varying vec3 vW; varying vec3 vNw; varying vec4 vAux; varying vec3 vAux2;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vNw = normal; vAux = aux; vAux2 = aux2;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vNw; varying vec4 vAux; varying vec3 vAux2;
uniform float uTime, uD, uHalfW; uniform vec3 uSea; uniform vec2 uSummit;
uniform sampler2D tNoise, tPah, tClA, tClN, tDetail;
${NOISE_GLSL}
vec3 cN; float cRough; float cMetal; vec3 cEm;
// tangent normal (xy in the ground plane, x east, y south) onto a world normal
vec3 lfTop(vec3 tn, vec3 Ng) { vec3 t = vec3(tn.xy + Ng.xz, abs(tn.z) * Ng.y); return normalize(t.xzy); }`)
      .replace('#include <map_fragment>', /* glsl */`
vec3 Ng = normalize(vNw);
float camD = length(vW - cameraPosition);
float dRoad = vAux.x, cover = vAux.y, heat = vAux.z, fresh = vAux.w, aa = vAux2.x;
vec2 P = vW.xz;
// flow frame: the lava ran out radially from the summit, so polar coordinates about it give smooth, kink-free
// down-flow (x) and across-flow (y) coordinates
vec2 Q = P - uSummit;
float qr = max(length(Q), 1.0);
vec2 fdir = Q / qr;
vec2 fperp = vec2(-fdir.y, fdir.x);
vec3 nzA = texture(tNoise, P / 160.0).rgb;
vec3 nzB = texture(tNoise, P / 31.0).rgb;
vec3 nzC = texture(tNoise, P / 7.0).rgb;
// flow-aligned coordinates: x down the flow, y across it, warped so lobe margins and folds curve
vec2 fq = vec2(qr, (atan(Q.y, Q.x) - 1.3) * qr);
fq.x += (nzA.g - 0.5) * 30.0;
vec2 fqw = fq + (nzB.rg - 0.5) * 7.0 + (nzC.gb - 0.5) * 1.6;

// ---- pahoehoe: inflated lobes and toes, ropy folds where the skin was dragged, a glassy silver rind
vec2 lob = lfCells(fqw / vec2(15.0, 10.0) + nzA.rg * 2.0);
vec2 toe = lfCells(fqw / vec2(4.6, 3.4) + 7.3);
float lobeEdge = 1.0 - smoothstep(0.0, 0.1, lob.x);
float toeEdge = 1.0 - smoothstep(0.0, 0.07, toe.x);
// ropes: folds ~0.3 m apart, bowed downstream across each lobe; only in the ropy patches, faded out before they alias
float ropeK = smoothstep(0.42, 0.62, nzB.b * 0.7 + nzA.r * 0.5 + lob.y * 0.15) * smoothstep(0.02, 0.25, lob.x);
float ph = (fqw.x + 2.2 * cos(fqw.y / 3.2 + lob.y * 6.3) - lob.x * 3.0) / 0.32;
float rw = fwidth(ph);
ropeK *= 1.0 - smoothstep(0.3, 0.7, rw);
float rope = sin(ph * 6.2832);
float ropeD = cos(ph * 6.2832);
// broad hummocks and the scanned flow-striated skin on top
vec2 ru = vec2(fqw.x / 7.0, fqw.y / 5.0) + lob.y * 4.0;
vec4 R1 = texture(tPah, ru);
float rh = R1.b;
// glassy rind in broad patches: silvery where it catches the sky; elsewhere crazed, dusty and dull
float glass = smoothstep(0.45, 0.7, nzB.g * 0.7 + nzC.r * 0.3) * (1.0 - lobeEdge);
vec2 rn = (R1.rg * 2.0 - 1.0) * 0.12 * (1.0 - smoothstep(6.0, 18.0, camD)) + (nzC.rg - 0.5) * 0.5 + (nzB.gb - 0.5) * 0.6;
rn.x += ropeD * 0.75 * ropeK;
// back into world xz (texture x is down the flow)
vec2 rnW = fdir * rn.x + fperp * rn.y;
vec3 pahC = vec3(0.018, 0.019, 0.022) * (0.75 + 0.6 * rh) * (1.0 + rope * 0.3 * ropeK);
pahC = mix(pahC, vec3(0.04, 0.043, 0.05), glass * 0.5);
// faint golden-brown iron staining in older crust
pahC *= mix(vec3(1.0), vec3(1.35, 1.05, 0.8), smoothstep(0.66, 0.82, nzA.b) * 0.6);
pahC *= 1.0 - lobeEdge * 0.6 - toeEdge * 0.15;
float pahR = mix(0.74, 0.44, glass) + lobeEdge * 0.2;
vec3 pahN = vec3(rnW * (1.0 - lobeEdge * 0.5), 1.0);

// ---- 'a'a: dark rubbly clinker, rough and spiny, rusty in places
vec2 cu = P / 1.6;
vec4 cA = texture(tClA, cu), cA2 = texture(tClA, P / 5.3 + 0.4);
vec4 cP = texture(tClN, cu), cP2 = texture(tClN, P / 5.3 + 0.4);
vec3 aaC = mix(cA.rgb, cA2.rgb, 0.4) * vec3(0.42, 0.37, 0.34);
aaC *= mix(vec3(1.0), vec3(1.55, 0.95, 0.68), smoothstep(0.55, 0.8, nzB.b) * 0.7);
vec3 aaN = vec3((cP.rg * 2.0 - 1.0) * 1.2 + (cP2.rg * 2.0 - 1.0) * 0.8, 1.0);
float aaAO = cP.b * cP2.b;
float aaR = 0.95;

// mix by the 'a'a share, frayed so the two meet in ragged tongues
float wA = smoothstep(0.35, 0.65, aa + (nzB.r - 0.5) * 0.5 + (nzC.g - 0.5) * 0.2);
vec3 col = mix(pahC, aaC * aaAO, wA);
vec3 tn = normalize(mix(pahN, aaN, wA));
float rough = mix(pahR, aaR, wA);
float metal = mix(0.15 * glass, 0.0, wA);

// ---- hot cracks near live lava: incandescent in the joints, pulsing slowly as the crust breathes
vec2 hc = lfCells(fqw / vec2(3.2, 2.4) + 3.1);
float hk = smoothstep(0.35, 1.0, heat);
float crackLine = 1.0 - smoothstep(0.0, 0.025 + 0.035 * hk, hc.x);
float pulse = 0.6 + 0.4 * sin(uTime * (0.7 + hc.y) + hc.y * 40.0 + nzA.r * 20.0);
// only some joints are open to the heat; the rest have sealed over
float open = step(0.45, fract(hc.y * 7.13)) * smoothstep(0.3, 0.7, nzC.g + hk * 0.4);
cEm = vec3(1.0, 0.2, 0.025) * (crackLine * open + lobeEdge * 0.6) * hk * hk * pulse * 2.4;
// and a dull red where the crust is still very hot right against the flow
cEm += vec3(0.35, 0.045, 0.008) * smoothstep(0.9, 1.0, heat) * (0.4 + 0.6 * nzC.r) * pulse;
col *= 1.0 - crackLine * open * hk * 0.6;

// ---- fresh black sand just above the sea at the ocean entry: fine, glittering, wet at the waterline
float seaK = (1.0 - smoothstep(170.0, 240.0, length(P - uSea.xz))) * (1.0 - smoothstep(2.6, 5.0, vW.y + (nzB.g - 0.5) * 2.0));
float wet = 1.0 - smoothstep(0.3, 1.4, vW.y);
vec3 sandC = vec3(0.045, 0.043, 0.042) * mix(0.8, 1.2, nzC.b);
float glint = step(0.985, lfHash(floor(P * 9.0))) * (1.0 - wet);
sandC += glint * 0.25;
col = mix(col, sandC * (1.0 - wet * 0.45), seaK);
tn = normalize(mix(tn, vec3((nzC.rg - 0.5) * 0.3, 1.0), seaK));
rough = mix(rough, mix(0.85, 0.25, wet), seaK);
metal = mix(metal, 0.0, seaK);

// fine grit
vec3 dN = texture(tDetail, P / 1.2).xyz * 2.0 - 1.0;
tn = normalize(tn + vec3(dN.xy, 0.0) * 0.3 * wA * (1.0 - smoothstep(10.0, 40.0, camD)));
// distance: let the texture detail settle into its average so the far field doesn't sparkle
float far = smoothstep(120.0, 400.0, camD);
tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), far * 0.6));
cN = lfTop(tn, Ng);
cRough = rough; cMetal = metal;

// ---- coverage: off the road, fraying out in lobes at the band's edge, only on the fresh field (or the beach)
float lobeN = nzA.g * 0.6 + nzB.r * 0.4;
float band = 1.0 - smoothstep(0.62, 0.95, cover + (lobeN - 0.5) * 0.55);
float road = smoothstep(uHalfW + 0.8, uHalfW + 4.5, dRoad + (nzC.r - 0.5) * 2.5);
float alpha = band * road * max(smoothstep(0.05, 0.4, fresh), seaK);
diffuseColor.rgb = col;
diffuseColor.a = alpha;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cMetal;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(cN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cEm;');
  };
  mat.customProgramCacheKey = () => `kaiele-crust-${lowq}`;
  mat.userData.u = u;
  return mat;
}
