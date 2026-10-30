import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;

// Kai'ele ground: one heightfield mesh (finer near the tracks), shaded from the bake's biome mask
// (R sand, G sand whiteness, B vegetation, A bare lava rock) plus height and slope.
export function buildIslandTerrain(world, M, quality) {
  const { extent, half } = world;
  const step = Math.max(3, quality.terrainStep * 2.5);
  const n = Math.round(extent / step) + 1;
  const pos = new Float32Array(n * n * 3);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const z = -half + j * step;
    for (let i = 0; i < n; i++) {
      const x = -half + i * step;
      pos[k++] = x; pos[k++] = world.heightAt(x, z); pos[k++] = z;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  k = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const biome = new THREE.TextureLoader().load(`${BASE}${world.dir}/biome.png`);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const uniforms = { tBiome: { value: biome }, tNoise: { value: M.noise }, uExtent: { value: extent } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vNw;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz; vNw = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vNw; uniform sampler2D tBiome, tNoise; uniform float uExtent;')
      .replace('#include <map_fragment>', `
vec4 bm = texture(tBiome, vW.xz / uExtent + 0.5);
float nz = texture(tNoise, vW.xz / 60.0).r;
float slope = 1.0 - normalize(vNw).y;
vec3 grass = mix(vec3(0.16, 0.24, 0.07), vec3(0.24, 0.3, 0.1), nz);
vec3 jungle = mix(vec3(0.05, 0.12, 0.03), vec3(0.09, 0.17, 0.05), nz);
vec3 dirt = vec3(0.36, 0.17, 0.09);
vec3 rock = vec3(0.1, 0.095, 0.09);
vec3 col = mix(dirt, grass, smoothstep(0.1, 0.4, bm.b));
col = mix(col, jungle, smoothstep(0.5, 0.9, bm.b));
col = mix(col, rock, max(bm.a, smoothstep(0.5, 0.9, slope)));
vec3 sand = mix(vec3(0.07, 0.065, 0.06), vec3(0.78, 0.72, 0.6), bm.g);
col = mix(col, sand, bm.r);
col = mix(col, vec3(0.9), smoothstep(600.0, 640.0, vW.y + nz * 30.0) * (1.0 - slope));
diffuseColor.rgb = col;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
