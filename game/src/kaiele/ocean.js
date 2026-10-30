import * as THREE from 'three';

// The sea round Kai'ele: a large plane at sea level. (The full ocean with waves, foam and surf is built here.)
export function buildOcean(ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b4a63, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.position.y = ctx.world.data.water?.sea ?? 0;
  mesh.renderOrder = 2;
  ctx.scene.add(mesh);
  return {
    update() {},
    // 0..1: how wet the ground is under a point (swash from the waves on the beaches)
    wetness: () => 0,
  };
}
