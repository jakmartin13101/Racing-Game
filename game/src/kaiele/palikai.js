import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry, nearTrack } from '../world.js';
import { loadPropModels, makePlacer } from '../props.js';
import { pbr, plain, M, frameAt, box, cyl, tri, Merge, rockGeo, hex, mul, grime, signMaterial, Crowd, Flags, Flames,
  gantry, gridMarks, edgeAlong, kickFrame, kickMatrix, addKicker } from './kit.js';

// Pali Kai, round 3: the north-shore sprint. Set pieces: the lighthouse and keeper's cottage on the start
// headland, dry-stone walls with gaps along the sea side of the cliff-top road, lookout signs, the natural basalt
// sea arch that the rock-ramp jump flies through, sea stacks, and the beach camp at the finish on the cove (tiki
// torches, grass-roofed shelters, finish arch, crowd).
// Race events: cliff-top wind gusts that shove trucks sideways (more when light or airborne), telegraphed by the
// flags and wind streaks; rocks falling onto the switchback descent.

// wind shared by the scenery (flags lean, streaks) and the race events (the push): k 0..1, warn 0..1, yaw = the
// direction the wind blows towards
const WIND = { k: 0, warn: 0, yaw: Math.PI * 0.95, base: 0.2 };
// the rock-ramp kicker in front of the arch (see kickFrame in kit.js)
const AKICK = { len: 12, rise: 1.0, thick: 1.2 };

function materials(quality) {
  const aniso = quality.aiLod ? 4 : 8;
  const thatch = plain(0xffffff, { rough: 1, side: THREE.DoubleSide });
  thatch.userData.wx = 'foliage';
  return {
    wood: pbr('ext/v_wood', { aniso }),
    plaster: pbr('ext/v_plaster', { aniso }),
    paintw: pbr('ext/v_paint', { aniso }),
    tin: pbr('kaiele/coast/tin', { aniso, metal: 1 }),
    rtin: pbr('kaiele/coast/rtin', { aniso, metal: 1 }),
    basalt: pbr('kaiele/coast/basalt', { aniso, normal: 1.5 }),
    concrete: pbr('ext/v_concrete', { aniso }),
    dark: plain(0x0c0b0a, { rough: 0.6 }),
    paint: plain(0xffffff, { rough: 0.6 }),
    iron: plain(0xffffff, { rough: 0.5, metal: 0.7 }),
    plastic: plain(0xffffff, { rough: 0.45 }),
    thatch,
    glass: (() => { const m = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd27a, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.75, vertexColors: true }); m.userData.wx = false; return m; })(),
  };
}

// ------------------------------------------------------------------------------------------- lighthouse
function lighthouse(B, group, world, x, z, yaw, lite) {
  const y = world.heightAt(x, z) - 0.4;
  const F = frameAt(x, y, z, yaw);
  B.add('basalt', cyl(4.6, 5.0, 1.6, 10, 2), F.m(0, 0.8, 0), [0.75, 0.74, 0.72]);
  B.add('concrete', cyl(4.2, 4.2, 0.25, 24, 2), F.m(0, 1.72, 0), [0.85, 0.84, 0.8]);
  // tapered tower in bands: white with red and black rings, a black band under the gallery
  const H = 21, r0 = 3.0, r1 = 2.15;
  const bands = ['w', 'w', 'r', 'w', 'b', 'w', 'r', 'w', 'b'];
  const C = { w: [0.96, 0.95, 0.92], r: hex('#b3261e'), b: hex('#1b1b1d') };
  const bh = H / bands.length;
  bands.forEach((k, i) => {
    const ra = r0 + (r1 - r0) * i / bands.length, rb = r0 + (r1 - r0) * (i + 1) / bands.length;
    B.add('paintw', cyl(rb, ra, bh + 0.01, 28, 2), F.m(0, 1.8 + bh * (i + 0.5), 0), grime(C[k], y + 1.8, 0.25, 2));
  });
  // door, and small windows spiralling up with the stair
  B.add('dark', box(1.1, 2.1, 0.3), F.m(0, 2.9, r0 - 0.05), [1, 1, 1]);
  B.add('paint', box(1.5, 0.25, 0.5), F.m(0, 4.05, r0 + 0.05), hex('#1b1b1d'));
  for (let k = 0; k < 5; k++) {
    const a = k * 1.9 + 0.8, hy = 5 + k * 3.2;
    const rr = r0 + (r1 - r0) * (hy - 1.8) / H;
    B.add('dark', box(0.55, 0.9, 0.2), F.m(Math.sin(a) * rr, hy, Math.cos(a) * rr, a), [1, 1, 1]);
  }
  // gallery: deck, railing posts and rail
  const gy = 1.8 + H;
  B.add('iron', cyl(3.2, 3.0, 0.3, 28, 1), F.m(0, gy, 0), hex('#1b1b1d'));
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; B.add('iron', cyl(0.035, 0.035, 1.05, 5), F.m(Math.sin(a) * 3.05, gy + 0.65, Math.cos(a) * 3.05), hex('#1b1b1d')); }
  B.add('iron', new THREE.TorusGeometry(3.05, 0.05, 5, 40).rotateX(Math.PI / 2), F.m(0, gy + 1.17, 0), hex('#1b1b1d'));
  // lantern: low wall, glazing between mullions, red dome with a vent ball and lightning rod
  B.add('paintw', cyl(1.75, 1.75, 0.9, 20, 2), F.m(0, gy + 0.6, 0), C.w);
  B.add('glass', cyl(1.6, 1.6, 2.3, 16, 1, true), F.m(0, gy + 2.2, 0), [1, 1, 1]);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.add('iron', box(0.08, 2.3, 0.08), F.m(Math.sin(a) * 1.62, gy + 2.2, Math.cos(a) * 1.62), hex('#1b1b1d')); }
  B.add('iron', new THREE.SphereGeometry(1.85, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), F.m(0, gy + 3.35, 0, 0, 0, 0, 1, 0.7, 1), C.r);
  B.add('iron', new THREE.SphereGeometry(0.28, 10, 6), F.m(0, gy + 4.75, 0), C.b);
  B.add('iron', cyl(0.025, 0.04, 1.6, 5), F.m(0, gy + 5.6, 0), C.b);
  // the lamp: a glowing core and two slow-turning beams (faint by day)
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
  core.material.userData.wx = false;
  core.position.copy(F.p(0, gy + 2.2, 0));
  group.add(core);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uK: { value: 0.12 } },
    vertexShader: 'varying float vL; varying vec3 vN, vV; void main(){ vL = uv.y; vec4 w = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix * w; }',
    fragmentShader: 'uniform float uK; varying float vL; varying vec3 vN, vV; void main(){ float rim = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(vec3(1.0,0.92,0.7) * uK * rim * pow(vL, 2.0), 1.0); }',
  });
  beamMat.userData.wx = false;
  const beam = new THREE.Group();
  beam.position.copy(core.position);
  for (const s of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 90, 18, 1, true).translate(0, -45, 0).rotateZ(s * Math.PI / 2), beamMat);
    beam.add(cone);
  }
  group.add(beam);
  let light = null;
  if (!lite) { light = new THREE.PointLight(0xffd890, 8, 30, 2); light.position.copy(core.position); group.add(light); }
  return {
    collider: { x, y, z, w: 7, d: 7, h: H + 6, yaw },
    update(t) { beam.rotation.y = t * 0.6; },
  };
}

function cottage(B, world, x, z, yaw, rnd) {
  const y = world.heightAt(x, z) - 0.2;
  const W = 10, D = 6.5, H = 3.1;
  const F = frameAt(x, y, z, yaw);
  B.add('basalt', box(W + 0.4, 0.7, D + 0.4, 1.5), F.m(0, 0.15, 0), [0.6, 0.6, 0.6]);
  B.add('plaster', box(W, H, D, 2.5), F.m(0, 0.5 + H / 2, 0), grime([0.97, 0.96, 0.92], y + 0.5, 0.25, 1));
  const top = 0.5 + H, o = 0.5, rise = 2.1, half = D / 2 + o, len = Math.hypot(half, rise), a = Math.atan2(rise, half);
  for (const sz of [-1, 1]) B.add('tin', box(W + 2 * o, 0.06, len, 1.6), F.m(0, top + rise / 2, sz * half / 2, 0, sz * a), hex('#a3302a'));
  for (const sx of [-1, 1]) B.add('plaster', tri([sx * W / 2, 0, -D / 2], [sx * W / 2, 0, D / 2], [sx * W / 2, rise - 0.05, 0], 2.5), F.m(0, top, 0), [0.97, 0.96, 0.92]);
  B.add('basalt', box(0.8, 2.6, 0.8, 1), F.m(W / 2 - 1.4, top + 1.6, -0.6), [0.55, 0.55, 0.55]);
  // windows with green shutters, a door with a little porch roof
  for (const [lx, lz, f] of [[-3, D / 2, 0], [3, D / 2, 0], [-3, -D / 2, Math.PI], [1, -D / 2, Math.PI], [W / 2, 0, Math.PI / 2], [-W / 2, 0, -Math.PI / 2]]) {
    const m = F.m(lx, 2.1, lz, f);
    B.add('dark', box(1.0, 1.2, 0.06), m.clone().multiply(M(0, 0, 0.02)), [1, 1, 1]);
    B.add('paint', box(1.2, 0.12, 0.12), m.clone().multiply(M(0, 0.66, 0.04)), [0.95, 0.95, 0.92]);
    for (const s of [-1, 1]) B.add('wood', box(0.5, 1.25, 0.05), m.clone().multiply(M(s * 0.8, 0, 0.06)), hex('#2f5d4a'));
  }
  B.add('wood', box(1.0, 2.1, 0.08), F.m(0, 1.55, D / 2 + 0.02), hex('#2f5d4a'));
  B.add('tin', box(2.0, 0.05, 1.3, 1.5), F.m(0, 2.9, D / 2 + 0.6, 0, 0.2), hex('#a3302a'));
  // white picket fence round the yard
  const fx = W / 2 + 4, fz = D / 2 + 4;
  const corners = [[-fx, -fz], [fx, -fz], [fx, fz], [-fx, fz]];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
    for (let d = 0; d < L; d += 0.32) {
      if (s === 2 && Math.abs(ax + (bx - ax) * d / L) < 1.1) continue; // gate gap
      const px = ax + (bx - ax) * d / L, pz = az + (bz - az) * d / L;
      const p = F.p(px, 0, pz);
      const gy = world.heightAt(p.x, p.z);
      B.add('paint', box(0.09, 0.95, 0.03), M(p.x, gy + 0.45, p.z, yaw + ang + Math.PI / 2), [0.95, 0.95, 0.92]);
    }
    for (const ry of [0.35, 0.75]) {
      const m = F.p((ax + bx) / 2, 0, (az + bz) / 2);
      B.add('paint', box(0.05, 0.08, L), M(m.x, world.heightAt(m.x, m.z) + ry, m.z, yaw + ang), [0.92, 0.92, 0.9]);
    }
  }
  void rnd;
  const c = F.p(0, 0, 0);
  return { x: c.x, y, z: c.z, w: W + 1, d: D + 1, h: top + rise, yaw };
}

// ------------------------------------------------------------------------------------------- the sea arch
// A rough basalt band springing from two legs either side of the flight path: a tube along a half ellipse in the
// plane across the road, thick at the feet and thinner at the crown, pushed about by noise, grassed on top.
function seaArch(world, track, rnd) {
  const R = track.archRow ?? track.jump;
  let gapEnd = R + 1;
  while (track.at(gapEnd)[4] && gapEnd < R + 40) gapEnd++;
  const mid = Math.round((R + gapEnd) / 2);
  const f = track.frame(mid);
  const nrm = new THREE.Vector3(f.nx, 0, f.nz), tan = new THREE.Vector3(f.tx, 0, f.tz), up = new THREE.Vector3(0, 1, 0);
  const Rx = 19.5, Ry = 30, base = -3;
  const A = new THREE.Vector3(f.x, base, f.z);
  const SEG = 56, RAD = 18;
  const pos = [], col = [];
  const k = Array.from({ length: 8 }, () => rnd() * 6.28);
  const noise = (p) => Math.sin(p.x * 0.31 + k[0]) * Math.sin(p.y * 0.27 + k[1]) * 0.6 + Math.sin(p.z * 0.43 + p.y * 0.2 + k[2]) * 0.35
    + Math.sin(p.x * 1.1 - p.z * 0.9 + k[3]) * 0.18 + Math.sin(p.y * 1.7 + p.x * 0.6 + k[4]) * 0.1;
  const ring = [];
  for (let s = 0; s <= SEG; s++) {
    const th = -0.12 + (Math.PI + 0.24) * s / SEG;
    const c = A.clone().addScaledVector(nrm, Rx * Math.cos(th)).addScaledVector(up, Ry * Math.sin(th));
    // feet extend straight down into the sea
    if (th < 0 || th > Math.PI) c.y = base + Ry * Math.sin(th) * 1.0 - 4;
    const rdir = nrm.clone().multiplyScalar(Math.cos(th) * Ry).addScaledVector(up, Math.sin(th) * Rx).normalize(); // outward normal of the ellipse
    const crown = Math.sin(Math.max(0, Math.min(Math.PI, th)));
    const a = 8.5 - 4.2 * crown ** 1.5, b = 10.5 - 3.6 * crown ** 1.5; // radial half-thickness, half-depth along the road
    const row = [];
    for (let r = 0; r < RAD; r++) {
      const ph = r / RAD * Math.PI * 2;
      const p = c.clone().addScaledVector(rdir, Math.cos(ph) * a).addScaledVector(tan, Math.sin(ph) * b);
      const n = noise(p);
      p.addScaledVector(rdir, Math.cos(ph) * a * 0.16 * n).addScaledVector(tan, Math.sin(ph) * b * 0.16 * n);
      row.push(p);
    }
    ring.push(row);
  }
  for (let s = 0; s < SEG; s++) for (let r = 0; r < RAD; r++) {
    const a = ring[s][r], b = ring[s][(r + 1) % RAD], c = ring[s + 1][(r + 1) % RAD], d = ring[s + 1][r];
    for (const p of [a, b, c, a, c, d]) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // orientation check: make the faces point outward (flip winding if the first face points at the axis)
  {
    const n0 = new THREE.Vector3(g.attributes.normal.getX(0), g.attributes.normal.getY(0), g.attributes.normal.getZ(0));
    const out = ring[0][0].clone().sub(ring[0].reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / RAD));
    if (n0.dot(out) < 0) {
      for (let i = 0; i < pos.length; i += 9) for (let j = 0; j < 3; j++) { const t = pos[i + 3 + j]; pos[i + 3 + j] = pos[i + 6 + j]; pos[i + 6 + j] = t; }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
    }
  }
  // colours: dark wet basalt low down with a salt line, grass on the upward faces of the crown
  const nA = g.attributes.normal, pA = g.attributes.position;
  for (let i = 0; i < pA.count; i++) {
    const yv = pA.getY(i), ny = nA.getY(i);
    let c = yv < 1.5 ? [0.26, 0.26, 0.27] : yv < 3.2 ? [0.62, 0.6, 0.56] : [0.5, 0.49, 0.48];
    c = mul(c, 0.85 + 0.3 * Math.abs(Math.sin(yv * 0.7 + pA.getX(i) * 0.3)));
    if (ny > 0.62 && yv > 12) c = [0.32, 0.42, 0.16];
    col.push(...c);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // colliders: the legs only, either side of the road, well clear of the flight path
  const colliders = [];
  for (const sd of [-1, 1]) {
    const c = A.clone().addScaledVector(nrm, sd * (Rx + 1.5));
    colliders.push({ x: c.x, y: -4, z: c.z, w: 12, d: 18, h: 16, yaw: f.yaw });
  }
  return { geo: g, colliders, A, nrm, tan, f, Rx, Ry };
}

// a sea stack: a cylinder pushed about by noise with a grassy flat top
function seaStack(seed, h, r) {
  const rr = mulberry(seed);
  const g = new THREE.CylinderGeometry(r * 0.75, r, h, 14, 10).translate(0, h / 2, 0);
  const p = g.attributes.position;
  const k = [rr() * 6, rr() * 6, rr() * 6];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const n = 1 + 0.18 * Math.sin(a * 3 + k[0] + v.y * 0.1) + 0.1 * Math.sin(a * 7 + k[1] + v.y * 0.4) + 0.08 * Math.sin(v.y * 0.6 + k[2]);
    if (v.y < h - 0.01) { v.x *= n; v.z *= n; } else { v.x *= n * 0.98; v.z *= n * 0.98; }
    p.setXYZ(i, v.x, v.y + (v.y > h - 0.01 ? Math.sin(a * 2 + k[0]) * 0.8 : 0), v.z);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const col = [];
  const P = ng.attributes.position, N = ng.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const yv = P.getY(i);
    col.push(...(N.getY(i) > 0.7 && yv > h - 2 ? [0.3, 0.42, 0.15] : yv < 2 ? [0.25, 0.25, 0.26] : yv < 4 ? [0.6, 0.58, 0.54] : mul([0.5, 0.49, 0.48], 0.85 + 0.25 * Math.sin(yv * 0.9))));
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return ng;
}

// ------------------------------------------------------------------------------------------- beach camp
function hale(B, world, x, z, yaw, rnd) {
  const y = world.heightAt(x, z);
  const F = frameAt(x, y, z, yaw);
  const w = 3.2 + rnd() * 1.6, d = 3 + rnd();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('wood', cyl(0.09, 0.11, 2.5, 7), F.m(sx * w / 2, 1.15, sz * d / 2, 0, 0, 0), [0.5, 0.4, 0.3]);
  for (const sz of [-1, 1]) B.add('wood', cyl(0.07, 0.07, w + 0.4, 6), F.m(0, 2.35, sz * d / 2, 0, 0, Math.PI / 2), [0.5, 0.4, 0.3]);
  // thatched hip roof (pili grass): a squashed four-sided pyramid with a ragged fringe
  const roof = new THREE.ConeGeometry(1, 1, 4, 1, true).rotateY(Math.PI / 4);
  B.add('thatch', roof, F.m(0, 2.35 + 1.1, 0, 0, 0, 0, (w + 1.6) * 0.72, 2.2, (d + 1.6) * 0.72), [0.42, 0.32, 0.17]);
  B.add('thatch', new THREE.ConeGeometry(1, 1, 4, 1, true).rotateY(Math.PI / 4), F.m(0, 2.35 + 0.75, 0, 0, 0, 0, (w + 1.4) * 0.72, 1.5, (d + 1.4) * 0.72), [0.34, 0.26, 0.14]);
  // a bench and a cooler underneath
  B.add('wood', box(w * 0.7, 0.08, 0.45), F.m(0, 0.45, -d * 0.25), [0.55, 0.42, 0.32]);
  for (const sx of [-1, 1]) B.add('wood', box(0.08, 0.45, 0.4), F.m(sx * w * 0.3, 0.22, -d * 0.25), [0.5, 0.4, 0.3]);
  if (rnd() < 0.7) B.add('plastic', box(0.7, 0.45, 0.42), F.m(w * 0.2, 0.23, d * 0.15, rnd()), hex(['#d8443a', '#2f6fb3', '#f2f2f2'][Math.floor(rnd() * 3)]));
  return { x, y, z, w: w + 0.4, d: d + 0.4, h: 4, yaw };
}

function tikiTorch(B, flames, world, x, z, rnd) {
  const y = world.heightAt(x, z);
  const h = 2.0 + rnd() * 0.5;
  B.add('wood', cyl(0.045, 0.06, h, 6), M(x, y + h / 2, z, 0, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06), [0.62, 0.52, 0.32]);
  for (let k = 0; k < 3; k++) B.add('wood', cyl(0.055, 0.055, 0.04, 6), M(x, y + 0.5 + k * 0.6, z), [0.4, 0.32, 0.2]);
  B.add('wood', cyl(0.12, 0.07, 0.3, 7), M(x, y + h + 0.12, z), [0.42, 0.33, 0.2]);
  flames.add(x, y + h + 0.28, z, 1.1);
}

function finishArch(group, mats, world, track, row) {
  const B = new Merge();
  const f = track.frame(row);
  const span = track.width + 5;
  const y0 = world.heightAt(f.x, f.z);
  for (const sd of [-1, 1]) {
    const x = f.x + f.nx * sd * span / 2, z = f.z + f.nz * sd * span / 2;
    const yb = world.heightAt(x, z);
    // lashed bamboo: three poles per leg
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1;
      B.add('wood', cyl(0.09, 0.11, 7.4 + y0 - yb, 8), M(x + Math.cos(a) * 0.18, yb + (7.4 + y0 - yb) / 2, z + Math.sin(a) * 0.18), [0.72, 0.62, 0.38]);
    }
    for (let k = 0; k < 6; k++) B.add('wood', cyl(0.14, 0.14, 0.06, 8), M(x, yb + 1 + k * 1.1, z), [0.35, 0.27, 0.16]);
    B.add('thatch', new THREE.ConeGeometry(0.9, 1.2, 7, 1, true), M(x, y0 + 7.9, z), [0.42, 0.32, 0.17]);
  }
  for (const dy of [6.9, 7.3]) B.add('wood', cyl(0.11, 0.11, span + 1.2, 8), M(f.x, y0 + dy, f.z, f.yaw, 0, Math.PI / 2), [0.72, 0.62, 0.38]);
  B.build(mats, group);
  const sign = signMaterial([{ t: 'FINISH', size: 150 }, { t: 'PALI KAI · GRAVEL RIOT · KAIʻELE', size: 52, c: '#2f5d62' }], { w: 2048, h: 300, bg: '#f2e7cc', fg: '#1d1a17', accent: '#b3261e' });
  for (const sd of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(span - 0.8, 1.7), sign);
    p.position.set(f.x + f.tx * sd * 0.14, y0 + 5.9, f.z + f.tz * sd * 0.14);
    p.rotation.y = f.yaw + (sd < 0 ? Math.PI : 0);
    p.castShadow = true;
    group.add(p);
  }
  // chequered line on the sand
  const C = new Merge();
  const n = 14, W = track.width;
  for (let k = 0; k < n; k++) for (let r = 0; r < 2; r++) {
    const lat = -W / 2 + (k + 0.5) * W / n;
    const x = f.x + f.nx * lat + f.tx * (r - 0.5) * W / n, z = f.z + f.nz * lat + f.tz * (r - 0.5) * W / n;
    C.add('paint', new THREE.PlaneGeometry(W / n, W / n).rotateX(-Math.PI / 2), M(x, world.heightAt(x, z) + 0.2, z, f.yaw), (k + r) % 2 ? [0.08, 0.08, 0.08] : [0.95, 0.95, 0.92]);
  }
  const lm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  lm.userData.wx = 'object';
  C.build({ paint: lm }, group, { shadow: false });
}

// ------------------------------------------------------------------------------------------- build
export async function buildScenery(ctx) {
  const { scene, world, quality, track } = ctx;
  if (!track) return {};
  const lite = !!quality.aiLod;
  const rnd = mulberry(3303);
  const group = new THREE.Group();
  group.name = 'palikai';
  scene.add(group);
  const mats = materials(quality);
  const W = track.width, n = track.n;
  const B = new Merge();
  const colliders = [];
  const updates = [];
  const f = {};
  const blocked = (x, z, r = 1) => colliders.some((c) => {
    const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const lx = dx * co - dz * si, lz = dx * si + dz * co;
    return Math.abs(lx) < c.w / 2 + r && Math.abs(lz) < c.d / 2 + r;
  });
  const descent = track.descent || [1775, 3660];
  const archRow = track.archRow ?? track.jump;
  const finish = track.line + track.finishRel;

  // ---------------------------------------------------------------- headland: lighthouse and cottage
  // the lighthouse stands on the flat ground nearest the cliff edge around the start, clear of the road
  const lf = track.frame(track.line);
  let bestL = null;
  for (let a = 0; a < 24; a++) for (let r = 30; r <= 110; r += 8) {
    const x = lf.x + Math.cos(a / 24 * 6.283) * r, z = lf.z + Math.sin(a / 24 * 6.283) * r;
    if (nearTrack(world, x, z, W / 2 + 14)) continue;
    const y = world.heightAt(x, z);
    if (y < 40) continue;
    let flat = 0;
    for (let q = 0; q < 8; q++) flat = Math.max(flat, Math.abs(world.heightAt(x + Math.cos(q) * 6, z + Math.sin(q) * 6) - y));
    if (flat > 2.5) continue;
    let edge = 1e9;
    for (let q = 0; q < 12; q++) edge = Math.min(edge, edgeAlong(world, x, z, Math.cos(q / 12 * 6.283), Math.sin(q / 12 * 6.283), 120, 25) ?? 1e9);
    if (edge < 14) continue;
    const score = edge + r * 0.3;
    if (!bestL || score < bestL.score) bestL = { x, z, score };
  }
  if (!bestL) bestL = { x: lf.x - lf.nx * 40, z: lf.z - lf.nz * 40 };
  const lh = lighthouse(B, group, world, bestL.x, bestL.z, Math.atan2(lf.x - bestL.x, lf.z - bestL.z), lite);
  colliders.push(lh.collider);
  updates.push(lh.update);
  // cottage beside it, on the landward side
  {
    const dx = lf.x - bestL.x, dz = lf.z - bestL.z, L = Math.hypot(dx, dz) || 1;
    for (const off of [[16, 10], [-16, 10], [16, -6], [-16, -6], [22, 18]]) {
      const x = bestL.x + (-dz / L) * off[0] + (dx / L) * off[1], z = bestL.z + (dx / L) * off[0] + (dz / L) * off[1];
      if (nearTrack(world, x, z, W / 2 + 12) || blocked(x, z, 6)) continue;
      colliders.push(cottage(B, world, x, z, Math.atan2(dx, dz), rnd));
      break;
    }
  }

  // ---------------------------------------------------------------- start gantry and grid
  gantry(group, mats, world, track, track.line, track.name.toUpperCase(), 'GRAVEL RIOT · ROUND 3 · KAIʻELE');
  gridMarks(group, world, track);

  // ---------------------------------------------------------------- dry-stone walls along the sea side of the cliff road
  // segments of 20-60 m with gaps of 6-16 m; each stone a squashed rock from a few shared shapes (instanced)
  const stoneGeos = [11, 12, 13, 14].map((s) => {
    const g = rockGeo(s, 0, { rough: 0.25, flat: 0.9 });
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    return g;
  });
  const stones = stoneGeos.map(() => []);
  const wallEnd = descent[0] - 30;
  let segLeft = 0, gapLeft = 0, side = 0, segStart = null;
  const edges = [];
  for (let i = 8; i < wallEnd; i += 1) {
    if (i > track.line - 40 && i < track.line + 30) continue; // open at the grid
    track.frame(i, f);
    // the sea side: where the cliff edge is
    if (i % 20 === 8 || !side) {
      const eA = edgeAlong(world, f.x, f.z, f.nx, f.nz, 160, 30, 4), eB = edgeAlong(world, f.x, f.z, -f.nx, -f.nz, 160, 30, 4);
      side = eA == null && eB == null ? 0 : (eB == null || (eA != null && eA < eB)) ? 1 : -1;
      if (side) edges.push({ i, side, e: Math.min(eA ?? 1e9, eB ?? 1e9) });
    }
    if (!side) continue;
    if (gapLeft > 0) { gapLeft--; segStart = null; continue; }
    if (segLeft <= 0) { segLeft = 20 + Math.floor(rnd() * 40); gapLeft = 6 + Math.floor(rnd() * 10); }
    segLeft--;
    const lat = side * (W / 2 + 2.2);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    if (nearTrack(world, x, z, W / 2 + 1.4)) { segStart = null; continue; }
    const y = world.heightAt(x, z);
    // three courses: big footing stones, a middle course, flat capstones
    const courses = lite ? [[0.6, 0.28], [0.5, 0.72]] : [[0.62, 0.25], [0.52, 0.62], [0.46, 0.95]];
    for (const [s, h] of courses) {
      const per = Math.max(1, Math.round(1 / (s * 0.9)));
      for (let q = 0; q < per; q++) {
        const t = (q + rnd() * 0.3) / per;
        const sx = x + f.tx * t, sz = z + f.tz * t;
        const k = Math.floor(rnd() * stoneGeos.length);
        const shade = 0.55 + rnd() * 0.35;
        stones[k].push({ m: M(sx + f.nx * (rnd() - 0.5) * 0.12, world.heightAt(sx, sz) + h * (h > 0.9 ? 1 : 1) - 0.05, sz + f.nz * (rnd() - 0.5) * 0.12, rnd() * 6.28, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3,
          s * (0.8 + rnd() * 0.4), s * (h > 0.9 ? 0.4 : 0.55), s * (0.7 + rnd() * 0.3)), c: [shade, shade * 0.98, shade * 0.95] });
      }
    }
    // one collider every 6 m of wall
    if (!segStart) segStart = { x, z, y, i };
    else if (i - segStart.i >= 6 || segLeft === 0) {
      const mx = (segStart.x + x) / 2, mz = (segStart.z + z) / 2, L = Math.hypot(x - segStart.x, z - segStart.z) + 0.6;
      colliders.push({ x: mx, y: Math.min(segStart.y, y) - 0.4, z: mz, w: 0.9, d: L, h: 1.5, yaw: Math.atan2(x - segStart.x, z - segStart.z) });
      segStart = { x, z, y, i };
    }
  }
  const stoneMat = mats.basalt;
  stones.forEach((list, k) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(stoneGeos[k], stoneMat, list.length);
    list.forEach((s, i) => { im.setMatrixAt(i, s.m); im.setColorAt(i, new THREE.Color(...s.c)); });
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  });
  // lookout signs where the edge comes closest (a few, well spaced), plus flags that show the wind
  const lookouts = [];
  for (const e of edges.sort((a, b) => a.e - b.e)) {
    if (lookouts.length < 4 && lookouts.every((l) => Math.abs(l.i - e.i) > 300)) lookouts.push(e);
  }
  const flags = new Flags();
  const FLAG = ['#b3261e', '#f2c230', '#2f6fb3', '#f4f1ea'];
  const signs = [
    signMaterial([{ t: 'PALI KAI LOOKOUT', size: 120 }, { t: 'ELEV. 82 m · NO STOPPING ON THE ROAD', size: 50, c: '#2f5d62' }], { w: 1024, h: 300, bg: '#5a3b26', fg: '#f3e6c4', weather: 0.4 }),
    signMaterial([{ t: 'DANGER', size: 120, c: '#b3261e' }, { t: 'CLIFF EDGE · KAPU', size: 70 }], { w: 1024, h: 300, bg: '#f2ead6', fg: '#1d1a17', weather: 0.4 }),
    signMaterial([{ t: 'STRONG CROSSWINDS', size: 100 }, { t: 'NEXT 2 KM', size: 70, c: '#b3261e' }], { w: 1024, h: 300, bg: '#f2c230', fg: '#1d1a17', weather: 0.35 }),
  ];
  lookouts.forEach((l, k) => {
    track.frame(l.i, f);
    const lat = l.side * (W / 2 + 4.5);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    const y = world.heightAt(x, z);
    for (const s of [-1, 1]) B.add('wood', box(0.14, 2.4, 0.14), M(x + f.tx * s * 0.9, y + 1.1, z + f.tz * s * 0.9, f.yaw), [0.45, 0.36, 0.28]);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.66), signs[k % signs.length]);
    p.position.set(x - f.nx * l.side * 0.08, y + 1.85, z - f.nz * l.side * 0.08);
    p.rotation.y = Math.atan2(-f.nx * l.side, -f.nz * l.side);
    group.add(p);
    flags.add(x + f.tx * 3, y, z + f.tz * 3, 0, 4.6, FLAG[k % FLAG.length]);
  });
  for (let i = 40; i < wallEnd; i += 140) {
    track.frame(i, f);
    for (const sd of [-1, 1]) {
      const x = f.x + f.nx * sd * (W / 2 + 4), z = f.z + f.nz * sd * (W / 2 + 4);
      if (!nearTrack(world, x, z, W / 2 + 2.5) && !blocked(x, z, 0.5)) flags.add(x, world.heightAt(x, z), z, 0, 4.2, FLAG[(i / 140 + (sd > 0 ? 1 : 0)) % FLAG.length | 0]);
    }
  }
  for (let k = -5; k <= 5; k++) for (const sd of [-1, 1]) {
    track.frame(track.line + k * 12, f);
    const x = f.x + f.nx * sd * (W / 2 + 2.4), z = f.z + f.nz * sd * (W / 2 + 2.4);
    if (!nearTrack(world, x, z, W / 2 + 1.8) && !blocked(x, z, 0.5)) flags.add(x, world.heightAt(x, z), z, 0, 4.2, FLAG[(k + 5 + (sd > 0 ? 1 : 0)) % FLAG.length]);
  }

  // ---------------------------------------------------------------- the sea arch and sea stacks
  const arch = seaArch(world, track, rnd);
  const rgeoK = [5, 6].map((s) => rockGeo(s * 23, 1, { rough: 0.3 }));
  B.add('basalt', arch.geo, new THREE.Matrix4(), null, { worldUV: 6 });
  colliders.push(...arch.colliders);
  // the rock ramp ends in a basalt kicker, and the landing on the cove side is a solid rock shelf (the ground at
  // both edges of the cut channel sags)
  {
    const kf = kickFrame(world, track, archRow, AKICK);
    B.add('basalt', box(kf.width, kf.thick, kf.len, 2.5), kickMatrix(kf), [0.5, 0.49, 0.47], { worldUV: 2.5 });
    for (const sd of [-1, 1]) for (let q = 0; q < 4; q++) {
      const s = kf.R - AKICK.len + q * AKICK.len / 3;
      track.frame(Math.round(s), f);
      const x = f.x + f.nx * sd * (kf.width / 2 + 0.8), z = f.z + f.nz * sd * (kf.width / 2 + 0.8);
      const r = 1.1 + rnd() * 0.8;
      B.add('basalt', rgeoK[q % 2], M(x, kf.top(s) - r * 0.6, z, rnd() * 6, 0, 0, r * 1.4, r, r * 1.2), [0.42, 0.41, 0.4], { worldUV: 2 });
    }
    let ge = archRow + 1;
    while (track.at(ge)[4] && ge < archRow + 40) ge++;
    track.frame(ge, f);
    const top = track.at(ge)[1] + 0.02;
    const shelf = { x: f.x + f.tx * 1.8, y: -3, z: f.z + f.tz * 1.8, w: track.width + 2, d: 5, h: top + 3, yaw: f.yaw };
    colliders.push(shelf);
    B.add('basalt', box(shelf.w, shelf.h, shelf.d, 2.5), M(shelf.x, shelf.y + shelf.h / 2 - 0.04, shelf.z, f.yaw), [0.5, 0.49, 0.47], { worldUV: 2.5 });
  }
  // tumbled blocks round the feet
  const rgeo = [1, 2, 3, 4].map((s) => rockGeo(s * 17, lite ? 1 : 2, { rough: 0.3, flat: 0.6 }));
  for (const sd of [-1, 1]) for (let k = 0; k < 9; k++) {
    const c = arch.A.clone().addScaledVector(arch.nrm, sd * (arch.Rx + (rnd() - 0.3) * 12)).addScaledVector(arch.tan, (rnd() - 0.5) * 26);
    const s = 1.5 + rnd() * 3.5;
    if (nearTrack(world, c.x, c.z, W / 2 + 3 + s)) continue;
    B.add('basalt', rgeo[k % 4], M(c.x, Math.max(world.heightAt(c.x, c.z), -1.5) - s * 0.2, c.z, rnd() * 6, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, s * 1.3, s * 0.8, s), [0.4, 0.4, 0.4], { worldUV: 3 });
  }
  // stacks standing off the arch in deeper water
  let made = 0;
  for (let k = 0; k < 40 && made < 5; k++) {
    const a = rnd() * 6.283, r = 50 + rnd() * 140;
    const x = arch.f.x + Math.cos(a) * r, z = arch.f.z + Math.sin(a) * r;
    if (world.heightAt(x, z) > -0.6 || nearTrack(world, x, z, 30)) continue;
    const h = 14 + rnd() * 24, rad = 3.5 + rnd() * 5;
    B.add('basalt', seaStack(k + 1, h + 4, rad), M(x, -4, z, rnd() * 6), null, { worldUV: 4 });
    colliders.push({ x, y: -4, z, w: rad * 1.6, d: rad * 1.6, h: h + 4, yaw: 0 });
    made++;
  }

  // ---------------------------------------------------------------- beach camp at the finish
  const flames = new Flames(lite ? 0 : 4);
  for (let i = finish - 130; i < Math.min(n - 3, finish + 50); i += 10) {
    track.frame(i, f);
    for (const sd of [-1, 1]) {
      const lat = sd * (W / 2 + 2.6);
      const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
      if (!nearTrack(world, x, z, W / 2 + 2)) tikiTorch(B, flames, world, x, z, rnd);
    }
  }
  finishArch(group, mats, world, track, finish);
  // shelters, canoes and boards on the sand round the run-out
  const ff = track.frame(finish);
  let nh = 0;
  for (let k = 0; k < 60 && nh < (lite ? 4 : 7); k++) {
    const i = finish - 60 + Math.floor(rnd() * 110);
    track.frame(Math.min(i, n - 1), f);
    const sd = rnd() < 0.5 ? -1 : 1;
    const lat = sd * (W / 2 + 10 + rnd() * 18);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    if (nearTrack(world, x, z, W / 2 + 8) || blocked(x, z, 2.5) || world.heightAt(x, z) < 0.6) continue;
    colliders.push(hale(B, world, x, z, Math.atan2(ff.x - x, ff.z - z), rnd));
    nh++;
  }
  // a fire pit, picnic tables, surfboards stuck in the sand, a canoe pulled up
  const pm = await loadPropModels(['stone_fire_pit', 'wooden_picnic_table', 'Barrel_02', 'wooden_crate_01', 'old_tyre']);
  for (const m of Object.values(pm)) for (const x of m.meshes) x.mat.userData.wx ??= 'object';
  const { put, build, handles } = makePlacer(world, pm, rnd);
  const campAt = (i, lat) => { track.frame(Math.min(n - 1, i), f); return [f.x + f.nx * lat, f.z + f.nz * lat]; };
  {
    const sd = -1;
    const [x, z] = campAt(finish + 20, sd * (W / 2 + 16));
    if (!nearTrack(world, x, z, W / 2 + 6)) {
      put('stone_fire_pit', x, z, 0, 2.2);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + 0.3, px = x + Math.cos(a) * 5, pz = z + Math.sin(a) * 5;
        if (!blocked(px, pz, 1.2) && !nearTrack(world, px, pz, W / 2 + 3)) put('wooden_picnic_table', px, pz, a, 2.2);
      }
    }
  }
  const board = new THREE.SphereGeometry(1, 10, 6);
  for (let k = 0; k < 14; k++) {
    const [x, z] = campAt(finish - 40 + Math.floor(rnd() * 90), (rnd() < 0.5 ? -1 : 1) * (W / 2 + 4 + rnd() * 6));
    if (nearTrack(world, x, z, W / 2 + 3) || blocked(x, z, 0.5)) continue;
    const L = 2 + rnd() * 0.8;
    B.add('plastic', board, M(x, world.heightAt(x, z) + L * 0.32, z, rnd() * 6.28, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.2, 0.27, L / 2, 0.035),
      hex(['#f4f1ea', '#5fc3d8', '#f2c230', '#e86a4f', '#9fd3c7', '#f08fb0'][Math.floor(rnd() * 6)]));
  }
  // drums and tyres as markers on the run-out (knock-down)
  for (let i = finish + 8; i < n - 6; i += 7) {
    track.frame(i, f);
    for (const sd of [-1, 1]) {
      const x = f.x + f.nx * sd * (W / 2 + 1.4), z = f.z + f.nz * sd * (W / 2 + 1.4);
      if (!nearTrack(world, x, z, W / 2 + 0.9)) put(rnd() < 0.5 ? 'Barrel_02' : 'old_tyre', x, z, rnd() * 6, 0.9, { byHeight: true });
    }
  }
  build(group);
  // crowd: at the start, on the headland, along the finish, and on the rocks watching the arch
  const crowd = new Crowd(rnd);
  const free = (x, z) => !nearTrack(world, x, z, W / 2 + 2.6) && !blocked(x, z, 0.4) && world.heightAt(x, z) > 0.5;
  const q = lite ? 0.5 : 1;
  for (let k = 0; k < 90 * q; k++) {
    const i = track.line - 25 + Math.floor(rnd() * 55), sd = rnd() < 0.5 ? -1 : 1;
    track.frame(i, f);
    const x = f.x + f.nx * sd * (W / 2 + 3 + rnd() * 6), z = f.z + f.nz * sd * (W / 2 + 3 + rnd() * 6);
    if (free(x, z)) crowd.add(x, world.heightAt(x, z), z, f.yaw - sd * Math.PI / 2);
  }
  for (let k = 0; k < 120 * q; k++) {
    const i = finish - 70 + Math.floor(rnd() * 110), sd = rnd() < 0.5 ? -1 : 1;
    track.frame(Math.min(i, n - 1), f);
    const x = f.x + f.nx * sd * (W / 2 + 3.5 + rnd() * 9), z = f.z + f.nz * sd * (W / 2 + 3.5 + rnd() * 9);
    if (free(x, z)) crowd.add(x, world.heightAt(x, z), z, f.yaw - sd * Math.PI / 2);
  }
  // on the cove side of the arch, watching the trucks fly through
  for (let k = 0; k < 60 * q; k++) {
    const i = archRow + 20 + Math.floor(rnd() * 50), sd = rnd() < 0.5 ? -1 : 1;
    track.frame(i, f);
    const x = f.x + f.nx * sd * (W / 2 + 5 + rnd() * 10), z = f.z + f.nz * sd * (W / 2 + 5 + rnd() * 10);
    const af = arch.f;
    if (free(x, z)) crowd.add(x, world.heightAt(x, z), z, Math.atan2(af.x - x, af.z - z));
  }
  crowd.build(group);
  for (let k = -3; k <= 6; k++) for (const sd of [-1, 1]) {
    track.frame(Math.min(n - 1, finish + k * 14), f);
    const x = f.x + f.nx * sd * (W / 2 + 3.5), z = f.z + f.nz * sd * (W / 2 + 3.5);
    if (!nearTrack(world, x, z, W / 2 + 2.4) && !blocked(x, z, 0.4)) flags.add(x, world.heightAt(x, z), z, 0, 4.4, FLAG[(k + 3 + (sd > 0 ? 2 : 0)) % FLAG.length]);
  }
  flags.build(group);
  flames.build(group);
  B.build(mats, group);

  // ---------------------------------------------------------------- wind streaks: the visible cue for a gust
  const streaks = windStreaks(group, lite ? 40 : 90);
  return {
    colliders, handles,
    update(t, dt, camera, race) {
      for (const u of updates) u(t);
      flames.update(t);
      crowd.update(t, race?.cars);
      flags.update(t, WIND.yaw, Math.min(1, WIND.base + WIND.warn * 0.4 + WIND.k * 0.8));
      streaks.update(t, dt, camera, Math.max(WIND.warn * 0.5, WIND.k));
    },
  };
}

// thin pale streaks racing across the ground downwind near the camera, faint unless a gust is building
function windStreaks(group, count) {
  const geo = new THREE.PlaneGeometry(1, 0.12).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf4f7fa, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  mat.userData.wx = false;
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(im);
  const S = Array.from({ length: count }, () => ({ x: (Math.random() - 0.5) * 80, z: (Math.random() - 0.5) * 80, y: 0.3 + Math.random() * 3, L: 3 + Math.random() * 6, v: 22 + Math.random() * 14 }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0);
  return {
    update(t, dt, camera, k) {
      mat.opacity = Math.min(0.5, k * 0.55);
      im.visible = k > 0.03;
      if (!im.visible || !camera) return;
      const dx = Math.sin(WIND.yaw), dz = Math.cos(WIND.yaw);
      q.setFromAxisAngle(UPV, WIND.yaw - Math.PI / 2);
      const cx = camera.position.x, cz = camera.position.z;
      S.forEach((st, i) => {
        st.x += dx * st.v * dt; st.z += dz * st.v * dt;
        // wrap round the camera
        if (st.x * dx + st.z * dz > 40) { st.x -= dx * 80 + (Math.random() - 0.5) * 10; st.z -= dz * 80 + (Math.random() - 0.5) * 10; }
        const along = -dz * st.x + dx * st.z;
        if (Math.abs(along) > 40) { st.x += dz * along * 1.9; st.z -= dx * along * 1.9; }
        p.set(cx + st.x, camera.position.y - 2.5 + st.y + Math.sin(t * 3 + i) * 0.3, cz + st.z);
        s.set(st.L, 1, 1);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------------------------------- race events
const G_HAZARD = (0x0008 << 16) | 0x0003;
export class TrackEvents {
  constructor(hz) {
    this.hz = hz;
    this.rnd = mulberry(6060);
    const t = hz.track;
    this.top = (t.descent?.[0] ?? 1775) + 40; // the gust zone: the exposed cliff top
    this.descent = t.descent || [1775, 3660];
    this.state = 'idle'; this.T = 10 + this.rnd() * 6; this.age = 0;
    this.rocks = [];
    this.rockT = 6;
    this.group = new THREE.Group();
    hz.scene.add(this.group);
    this.geos = [1, 2, 3].map((s) => rockGeo(s * 101, hz.quality.aiLod ? 1 : 2, { rough: 0.3 }));
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x3b3835, roughness: 0.95 });
    this.rockMat.userData.wx = 'object';
    this.warned = false;
    Object.assign(WIND, { k: 0, warn: 0 });
    this.kickBody = addKicker(hz.phys, kickFrame(hz.world, t, t.archRow ?? t.jump, AKICK));
  }

  // gusts: idle -> warn (flags stream harder, streaks appear) -> blow (the push) -> idle
  gust(dt, race) {
    const anyTop = race.cars.some((c) => !c.finished && c.i < this.top);
    this.age += dt;
    if (this.state === 'idle') {
      WIND.k = Math.max(0, WIND.k - dt * 0.8); WIND.warn = Math.max(0, WIND.warn - dt);
      this.T -= dt;
      if (this.T <= 0 && anyTop && race.clock > 4) {
        this.state = 'warn'; this.age = 0;
        // mostly onshore (pushing away from the drop), sometimes offshore
        const off = this.rnd() < 0.3;
        const f = this.hz.track.frame(Math.min(this.top, race.player.i));
        const sea = this.hz.world.heightAt(f.x + f.nx * 60, f.z + f.nz * 60) < this.hz.world.heightAt(f.x - f.nx * 60, f.z - f.nz * 60) ? 1 : -1;
        const towards = off ? sea : -sea;
        this.dir = new THREE.Vector3(f.nx * towards, 0, f.nz * towards).applyAxisAngle(new THREE.Vector3(0, 1, 0), (this.rnd() - 0.5) * 0.7);
        WIND.yaw = Math.atan2(this.dir.x, this.dir.z);
        this.strength = 0.75 + this.rnd() * 0.5;
        if (race.player.i < this.top && !race.player.finished) this.hz.events.push({ type: 'toast', text: off ? 'Gust off the land: hold it!' : 'Sea gust: brace!' });
      }
    } else if (this.state === 'warn') {
      WIND.warn = Math.min(1, this.age / 1.6);
      if (this.age > 2.2) { this.state = 'blow'; this.age = 0; }
    } else {
      const env = Math.min(1, this.age / 0.5) * Math.min(1, Math.max(0, (3.0 - this.age) / 0.8));
      WIND.k = env * this.strength;
      WIND.warn = Math.max(0, 1 - this.age);
      if (this.age > 3.0) { this.state = 'idle'; this.T = 9 + this.rnd() * 9; WIND.k = 0; }
      // the push: a constant force, so lighter trucks are shoved harder (a = F / m); in the air it bites more
      for (const st of race.cars) {
        if (st.finished || st.i >= this.top) continue;
        const v = st.v, b = v.body;
        const air = v.contacts === 0 ? 2.2 : 1;
        const F = 4200 * WIND.k * air; // N, about 2.4 m/s^2 on the ground for a 1.8 t truck
        b.applyImpulse({ x: this.dir.x * F * dt, y: 0, z: this.dir.z * F * dt }, true);
        // a gentle yaw too: the wind catches the tall cab
        b.applyTorqueImpulse({ x: 0, y: (this.rnd() - 0.5) * 300 * WIND.k * dt, z: 0 }, true);
      }
    }
  }

  // rocks off the cliff above the switchbacks, a little ahead of a truck on the descent
  rockfall(dt, race) {
    this.rockT -= dt;
    if (this.rockT > 0) return;
    this.rockT = 5 + this.rnd() * 6;
    const [a, b] = this.descent;
    const on = race.cars.filter((c) => !c.finished && c.i > a - 60 && c.i < b - 60);
    if (!on.length || this.rocks.length >= (this.hz.quality.aiLod ? 4 : 8)) return;
    const st = on.find((c) => c.isPlayer && this.rnd() < 0.5) || on[Math.floor(this.rnd() * on.length)];
    const t = this.hz.track, w = this.hz.world;
    const i = Math.min(b, st.i + 35 + Math.floor(Math.min(60, st.v.speed() * 2) * this.rnd() + 20));
    const f = t.frame(i);
    const hA = w.heightAt(f.x + f.nx * 25, f.z + f.nz * 25), hB = w.heightAt(f.x - f.nx * 25, f.z - f.nz * 25);
    if (Math.abs(hA - hB) < 2) return;
    const side = hA > hB ? 1 : -1;
    const d = 18 + this.rnd() * 10;
    const x = f.x + f.nx * side * d, z = f.z + f.nz * side * d;
    const r = 0.45 + this.rnd() * 0.6;
    const y = w.heightAt(x, z) + r + 1.5;
    const body = this.hz.phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCcdEnabled(true)
      .setLinvel(-f.nx * side * 6, -1, -f.nz * side * 6).setAngularDamping(0.15));
    this.hz.phys.createCollider(RAPIER.ColliderDesc.ball(r * 0.9).setMass(600 + r * 1600).setFriction(1).setRestitution(0.3).setCollisionGroups(G_HAZARD), body);
    const mesh = new THREE.Mesh(this.geos[Math.floor(this.rnd() * this.geos.length)], this.rockMat);
    mesh.scale.setScalar(r);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.rocks.push({ body, mesh, r, age: 0 });
    const fx = this.hz.fx;
    for (let k = 0; k < 8; k++) fx.smoke.emit(new THREE.Vector3(x, y, z), new THREE.Vector3(this.rnd() * 4 - 2, 1 + this.rnd() * 2, this.rnd() * 4 - 2), 1.1, fx.time, 2.5, 0.42, 0.38, 0.33);
    if (st.isPlayer && !this.warned) { this.warned = true; this.hz.events.push({ type: 'toast', text: 'Rockfall!' }); }
  }

  pre(dt, race) {
    this.gust(dt, race);
    if (race.clock > 3) this.rockfall(dt, race);
  }

  post(dt) {
    const fx = this.hz.fx;
    for (const r of this.rocks) {
      r.age += dt;
      const p = r.body.translation(), q = r.body.rotation();
      r.mesh.position.set(p.x, p.y, p.z);
      r.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      const v = r.body.linvel();
      if (Math.hypot(v.x, v.z) > 3 && Math.random() < 0.25 && p.y - this.hz.world.heightAt(p.x, p.z) < r.r + 0.3) {
        fx.smoke.emit(new THREE.Vector3(p.x, p.y - r.r * 0.8, p.z), new THREE.Vector3(0, 0.6, 0), r.r, fx.time, 2, 0.42, 0.38, 0.33);
      }
      if (r.age > 30 || p.y < -30) r.dead = true;
    }
    for (const r of this.rocks) if (r.dead) { this.hz.phys.removeRigidBody(r.body); this.group.remove(r.mesh); }
    this.rocks = this.rocks.filter((r) => !r.dead);
  }

  dispose() {
    this.hz.phys.removeRigidBody(this.kickBody);
    for (const r of this.rocks) this.hz.phys.removeRigidBody(r.body);
    this.rocks = [];
    this.hz.scene.remove(this.group);
    Object.assign(WIND, { k: 0, warn: 0 });
  }
}
