import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry } from './world.js';

// Impact craters left by the volcanic bombs, kept for the whole race. Each is a ragged bowl with a raised rim of
// thrown-up earth and a splash of dark ejecta around it, sized from the rock's size and how fast it hit. The
// floor sits on the ground (the heightfield can't be dug into mid-race), so the rim gives it its depth; a
// collider over the rim means a truck that runs through one gets bumped. On the road the crater sits on the
// road surface and the ejecta is spattered over the asphalt.
const G_GROUND = (0x0001 << 16) | 0xffff;

function craterMaterial(M) {
  const m = new THREE.MeshStandardMaterial({ map: M.burnt.a, roughness: 0.95, metalness: 0, transparent: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.userData.heat = { value: 1 };
  m.userData.wx = 'ground'; // weather: wets and dusts like the ground around it
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: M.noise }; sh.uniforms.tRock = { value: M.bas.a }; sh.uniforms.uHeat = m.userData.heat;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 cr; varying vec3 vC; varying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vC = cr;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vC; varying vec3 vW; uniform sampler2D tNoise, tRock; uniform float uHeat;')
      .replace('#include <map_fragment>', /* glsl */`
// vC: x radius over the crater radius, y angle round the rim (0..1), z the crater's size in metres
float u = vC.x, ang = vC.y;
vec4 nz = texture(tNoise, vW.xz / 2.3);
vec3 burnt = texture(map, vW.xz / 3.0).rgb, rock = texture(tRock, vW.xz / 2.0 + nz.rg * 0.3).rgb;
// rays of thrown earth: streaks out from the rim, broken up so the splash ends raggedly
float rays = texture(tNoise, vec2(ang * 3.0, u * 0.12 + vC.z * 0.37)).r;
float splash = smoothstep(0.35, 0.75, rays + nz.b * 0.5 - (u - 1.0) * 0.55);
// inside: scorched, fused black soil; the rim: churned, paler earth and broken rock; outside: dark spatter
vec3 floorC = mix(burnt * 0.3, vec3(0.035, 0.03, 0.026), 0.4 + 0.5 * (1.0 - smoothstep(0.1, 0.7, u))) * (0.7 + nz.g * 0.6);
vec3 soil = vec3(0.13, 0.095, 0.07) * (0.6 + nz.g * 0.7);
vec3 rimC = mix(mix(burnt * 0.55, soil, 0.55), rock * 0.32, smoothstep(0.55, 0.8, nz.r));
vec3 ejC = mix(vec3(0.045, 0.038, 0.033), soil, 0.2) * (0.75 + nz.a * 0.5);
vec3 col = mix(floorC, rimC, smoothstep(0.55, 0.95, u));
col = mix(col, ejC, smoothstep(1.05, 1.35, u));
diffuseColor.rgb = col;
diffuseColor.a = u < 1.1 ? 1.0 : splash * (1.0 - smoothstep(1.6, 2.0, u));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.75, 1.0, smoothstep(0.2, 0.8, vC.x));')
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
// fresh: glowing veins in the fused floor, brightest at the centre where the rock burst, cooling over half a minute
float vein = 1.0 - abs(texture(tNoise, vW.xz / 2.2).g + texture(tNoise, vW.xz / 0.8).b * 0.35 - 0.67) * 5.0;
float hot = uHeat * (1.0 - smoothstep(0.0, 0.75, u)) * clamp(max(vein, (1.0 - smoothstep(0.0, 0.45, u)) * 0.8 * uHeat), 0.0, 1.0);
totalEmissiveRadiance += vec3(1.0, 0.25, 0.03) * hot * 3.0;`);
  };
  m.customProgramCacheKey = () => 'bomb-crater';
  return m;
}

export class Craters {
  constructor({ world, track, group, M, phys, lite }) {
    Object.assign(this, { world, track, group, M, phys, lite });
    this.list = [];
    this.max = lite ? 90 : 220;
    this.body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.rnd = mulberry(4242);
  }

  // where the drivable surface is: the road ribbon sits 0.12 m over the ground across 0.8 of its width each side
  baseAt(x, z, hint) {
    const t = this.track, g = this.world.heightAt(x, z);
    const n = t.nearest({ x, z }, hint).i, f = t.frame(n);
    const lat = Math.abs((x - f.x) * f.nx + (z - f.z) * f.nz);
    if (t.c[n][4]) return g; // no road over the crater gap
    return g + 0.12 * THREE.MathUtils.smoothstep(t.width * 0.8 + 0.5, t.width * 0.8 - 0.3, lat);
  }

  // R the crater's radius, h its rim height, i a track row near it
  add(p, R, h, i) {
    if (this.list.length >= this.max) {
      // past the budget only big ones count, and they replace the oldest small dents
      const k = this.list.findIndex((c) => c.R < R * 0.6);
      if (k < 0) return;
      this.remove(this.list[k]);
      this.list.splice(k, 1);
    }
    const rnd = this.rnd, seed = rnd() * 50;
    const NR = this.lite ? 10 : 16, NA = this.lite ? 20 : (R > 2 ? 40 : 28);
    const P = [], C = [], G = [], idx = [];
    // an irregular outline: the rim wanders in and out, and a low-angle hit throws more one way
    const k1 = rnd() * 6.28, k2 = rnd() * 6.28, lob = rnd() * 6.28, lobK = 0.12 + rnd() * 0.15;
    const rimAt = (a) => 1 + 0.09 * Math.sin(a * 3 + k1) + 0.06 * Math.sin(a * 7 + k2) + lobK * Math.cos(a - lob);
    const base = (x, z) => this.baseAt(x, z, i);
    const b0 = base(p.x, p.z);
    for (let r = 0; r <= NR; r++) {
      // rings packed close round the rim, where the shape changes fastest
      const s = r / NR, u = s < 0.6 ? s / 0.6 * 1.05 : 1.05 + ((s - 0.6) / 0.4) ** 1.3 * 0.95;
      for (let a = 0; a <= NA; a++) {
        const ang = a / NA * Math.PI * 2;
        const rr = rimAt(ang);
        const x = p.x + Math.cos(ang) * u * R * rr, z = p.z + Math.sin(ang) * u * R * rr;
        // bowl rising to the rim, then the thrown-out apron falling away; lumpy all over
        const lump = 0.12 * Math.sin(ang * 11 + seed + u * 5) * Math.sin(u * 9 + seed);
        let y;
        if (u <= 1) y = h * (u ** 2.6) * (1 + lump);
        else { const v = (u - 1) / 1; y = h * Math.exp(-v * 4.2) * (1 - v * v) * (1 + lump * 2) * (0.75 + 0.25 * Math.cos(ang - lob)); }
        const g = r === 0 ? b0 : base(x, z);
        P.push(x, g + 0.03 + Math.max(0, y), z);
        G.push(g + Math.min(0.22, Math.max(0, y) * 0.45));
        C.push(u, a / NA, R);
      }
    }
    for (let r = 0; r < NR; r++) for (let a = 0; a < NA; a++) {
      const p0 = r * (NA + 1) + a, p1 = p0 + 1, p2 = p0 + NA + 1, p3 = p2 + 1;
      idx.push(p0, p1, p2, p1, p3, p2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('cr', new THREE.Float32BufferAttribute(C, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = craterMaterial(this.M);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    const c = { mesh, mat, R, age: 0 };
    // a truck feels the rim as a jolt: the collider follows it, flattened so a racing truck bucks over it rather
    // than being thrown (the floor is the ground itself)
    if (h > 0.12) {
      const r0 = Math.floor(NR * 0.35), r1 = Math.round(NR * 0.8);
      const v = [], ti = [];
      for (let r = r0; r <= r1; r++) for (let a = 0; a <= NA; a++) { const o = r * (NA + 1) + a; v.push(P[o * 3], G[o], P[o * 3 + 2]); }
      const nr = r1 - r0;
      for (let r = 0; r < nr; r++) for (let a = 0; a < NA; a++) {
        const p0 = r * (NA + 1) + a, p1 = p0 + 1, p2 = p0 + NA + 1, p3 = p2 + 1;
        ti.push(p0, p1, p2, p1, p3, p2);
      }
      c.col = this.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(ti)).setFriction(0.9)
        .setCollisionGroups(G_GROUND), this.body);
    }
    this.list.push(c);
    return c;
  }

  update(dt) {
    for (const c of this.list) {
      if (c.age > 60) continue;
      c.age += dt;
      c.mat.userData.heat.value = Math.max(0, 1 - c.age / (14 + c.R * 6)) ** 1.5;
    }
  }

  remove(c) {
    this.group.remove(c.mesh);
    c.mesh.geometry.dispose(); c.mat.dispose();
    if (c.col) this.phys.removeCollider(c.col, false);
  }

  dispose() {
    for (const c of this.list) this.remove(c);
    this.list = [];
    this.phys.removeRigidBody(this.body);
  }
}
