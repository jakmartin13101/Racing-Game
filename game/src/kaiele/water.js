import * as THREE from 'three';

// Fresh water: the Wailele river, the creek, the 60 m falls and the plunge pool. (Filled in by the water work.)
export function buildFreshWater(ctx) {
  const { world, scene } = ctx;
  const W = world.data.water;
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a5a48, roughness: 0.1, transparent: true, opacity: 0.85 });
  for (const rv of [W.river, W.creek]) {
    const verts = [], idx = [];
    const pts = rv.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const tx = q[0] - o[0], tz = q[2] - o[2], L = Math.hypot(tx, tz) || 1;
      const w = rv.width[i] * 0.5;
      verts.push(p[0] - tz / L * w, p[1] + 0.2, p[2] + tx / L * w, p[0] + tz / L * w, p[1] + 0.2, p[2] - tx / L * w);
      if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.material.side = THREE.DoubleSide;
    scene.add(m);
  }
  return { update() {} };
}
