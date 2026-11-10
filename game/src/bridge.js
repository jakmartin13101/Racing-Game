import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { roadMaterial } from './world.js';

// A road bridge carrying a track over a lava flow (Summit Sprint, over the west spill): a concrete deck on two
// piers, steel guard rails either side, its underside lit by the lava running beneath. The world bake cuts the
// ground away under the span (the rows are flagged as a gap), so the deck is the only thing holding a truck up.
const G_GROUND = (0x0001 << 16) | 0xffff;

function concreteMaterial(M, glow) {
  // weathered concrete, sooty and heat-stained low down where the lava licks it
  const m = new THREE.MeshStandardMaterial({ color: 0x8a847c, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: M.noise }; sh.uniforms.uLow = glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform sampler2D tNoise; uniform float uLow;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float n1 = texture(tNoise, vW.xz / 3.0 + vW.y / 5.0).r, n2 = texture(tNoise, vec2(vW.x + vW.z, vW.y) / 1.3).g;
float soot = 1.0 - smoothstep(uLow, uLow + 4.0, vW.y + n1 * 1.5);
diffuseColor.rgb *= (0.8 + n2 * 0.35) * mix(1.0, 0.25, soot);
// rust streaks run down from the rail fixings
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.18, 0.09), smoothstep(0.72, 0.9, texture(tNoise, vec2((vW.x + vW.z) * 0.9, vW.y * 0.04)).b) * 0.5);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * pow(1.0 - smoothstep(uLow - 1.0, uLow + 3.0, vW.y), 2.0) * 0.6;`);
  };
  return m;
}

export class Bridge {
  constructor({ phys, scene, track, world, M }) {
    const [a, b] = track.bridge;
    const W = track.width / 2 + 1.2, TH = 1.1;
    this.group = new THREE.Group();
    scene.add(this.group);
    // deck slab: a strip along the centre line from just before the gap to just after, top at road height
    const rows = [];
    // off the span the deck runs out onto the road, easing from the ground's height up to the span's
    for (let i = a - 7; i <= b + 7; i++) {
      const f = track.frame(i);
      const k = THREE.MathUtils.smoothstep(Math.min(i - (a - 7), b + 7 - i), 0, 6);
      rows.push({ x: f.x, z: f.z, y: track.at(i)[1] + 0.12, k, nx: f.nx, nz: f.nz });
    }
    const yAt = (r, l) => THREE.MathUtils.lerp(world.heightAt(r.x + r.nx * l, r.z + r.nz * l) + 0.13, r.y, r.k);
    const top = [], idx = [], vtop = [];
    // cross-section: top surface, then the slab's edges down to its soffit
    const sec = [[W, 0], [W, -TH], [-W, -TH], [-W, 0]]; // open along the top, where the road surface goes
    for (const r of rows) for (const [l, d] of sec) top.push(r.x + r.nx * l, yAt(r, l) + d, r.z + r.nz * l);
    const S = sec.length;
    for (let j = 0; j < rows.length - 1; j++) {
      for (let k = 0; k < S - 1; k++) {
        const p = j * S + k, q = p + 1, p2 = p + S, q2 = q + S;
        idx.push(p, p2, q, q, p2, q2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const low = { value: world.heightAt(rows[(rows.length / 2) | 0].x, rows[(rows.length / 2) | 0].z) + 2 };
    const topIdx = [];
    for (let j = 0; j < rows.length - 1; j++) { const p = j * S + 3, q = j * S; topIdx.push(p, p + S, q, q, p + S, q + S); }
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    tgeo.setIndex(topIdx);
    // the road shader wants metres along and across
    const uv = [];
    let along = 100;
    rows.forEach((r, j) => {
      if (j) along += Math.hypot(r.x - rows[j - 1].x, r.z - rows[j - 1].z);
      for (const [l] of sec) uv.push(along, l);
    });
    tgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tgeo.computeVertexNormals();
    const conc = concreteMaterial(M, low.value);
    const slab = new THREE.Mesh(geo, conc);
    slab.castShadow = slab.receiveShadow = true;
    const deck = new THREE.Mesh(tgeo, roadMaterial(M, track.width, 1e6));
    deck.renderOrder = 1;
    deck.receiveShadow = true;
    deck.position.y = 0.02;
    this.group.add(slab, deck);
    for (const r of rows) vtop.push(r.x - r.nx * W, yAt(r, -W), r.z - r.nz * W, r.x + r.nx * W, yAt(r, W), r.z + r.nz * W);
    const tIdx = [];
    for (let j = 0; j < rows.length - 1; j++) { const p = j * 2; tIdx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
    this.body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vtop), new Uint32Array(tIdx)).setFriction(1).setCollisionGroups(G_GROUND), this.body);
    // piers: a pair under each third of the span, down into the lava channel
    const pierG = new THREE.BoxGeometry(1.6, 1, 1.6);
    const n = rows.length;
    for (const t of [0.36, 0.64]) {
      const r = rows[Math.round(t * (n - 1))];
      for (const s of [-1, 1]) {
        const x = r.x + r.nx * s * (W - 1.6), z = r.z + r.nz * s * (W - 1.6);
        const g = world.heightAt(x, z) - 3, h = r.y - TH - g;
        const p = new THREE.Mesh(pierG, conc);
        p.scale.y = h; p.position.set(x, g + h / 2, z);
        p.castShadow = p.receiveShadow = true;
        this.group.add(p);
      }
    }
    // guard rails: posts every 2.5 m and two steel rails, both sides
    const steel = new THREE.MeshStandardMaterial({ color: 0x5b5f63, roughness: 0.45, metalness: 0.8 });
    const post = new THREE.BoxGeometry(0.16, 1.05, 0.16);
    const posts = new THREE.InstancedMesh(post, steel, 2 * Math.ceil(n / 2.5) + 4);
    const m4 = new THREE.Matrix4();
    let pi = 0;
    const span = rows.filter((r) => r.k > 0.5), ns = span.length;
    for (const s of [-1, 1]) {
      const pts = span.map((r) => new THREE.Vector3(r.x + r.nx * s * (W - 0.3), yAt(r, s * (W - 0.3)), r.z + r.nz * s * (W - 0.3)));
      for (let j = 0; j < ns; j += 2.5) {
        const r = pts[Math.min(ns - 1, Math.round(j))];
        m4.makeTranslation(r.x, r.y + 0.52, r.z);
        posts.setMatrixAt(pi++, m4);
      }
      for (const hgt of [0.65, 0.98]) {
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + hgt)));
        const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, ns * 2, 0.07, 6), steel);
        rail.castShadow = true;
        this.group.add(rail);
      }
      // a rail collider so a truck glances off the side rather than dropping in
      const verts = [], ti = [];
      pts.forEach((p) => verts.push(p.x, p.y, p.z, p.x, p.y + 1.1, p.z));
      for (let j = 0; j < ns - 1; j++) { const p = j * 2; ti.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(ti)).setFriction(0.3).setCollisionGroups(G_GROUND), this.body);
    }
    posts.count = pi;
    posts.castShadow = true;
    this.group.add(posts);
    // the lava's glow on the underside
    const mid = rows[(n / 2) | 0];
    this.light = new THREE.PointLight(0xff5a1a, 60, 26, 2);
    this.light.position.set(mid.x, mid.y - TH - 2.5, mid.z);
    this.group.add(this.light);
  }

  update(time) { this.light.intensity = 60 * (0.85 + 0.15 * Math.sin(time * 2.3) * Math.sin(time * 0.7)); }

  dispose(phys, scene) { phys.removeRigidBody(this.body); scene.remove(this.group); }
}
