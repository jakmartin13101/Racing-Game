import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { vnoise } from '../../world.js';
import { G_GROUND, tmp, tmp2, clamp, smooth, lerp, mulberry, rockGeo, basaltMaterial, signed, smoothNoise } from './util.js';

// The lava tube: the road runs through an old tube under the flow, a rough basalt arch with a lava-shelf "bathtub
// ring" along its walls, glowing cracks low down, molten drips from lavacicles, and two or three skylights where
// the roof fell in, each with a shaft of sunlight full of dust. The bake raises a ridge over the tube rows and
// cuts the road through it; this builds the roof, its rocky top (closing the cut) and the portals. Everything
// inside carries its own baked darkness (the sun's shadow map does not reach far enough down a 500 m tube), and
// the sky light is turned down while the player is inside.

export class Tube {
  constructor(kp) {
    this.kp = kp;
    const hz = kp.hz, t = kp.t, world = kp.world, W = t.width, hw = W / 2;
    const tb = t.tube || { a: t.sections.tube[0], b: t.sections.tube[1], roof: 9 };
    const a = tb.a, b = tb.b, roof = tb.roof ?? 9;
    this.a = a; this.b = b; this.roof = roof;
    const len = t.ahead(a, b);
    this.len = len;
    const lite = kp.lite;
    const rnd = mulberry(a * 7 + 3);
    // skylights: where the roof fell in
    const nSky = len > 380 ? 3 : len > 180 ? 2 : 1;
    this.skies = [];
    for (let k = 0; k < nSky; k++) {
      const fr = (k + 0.5) / nSky + (rnd() - 0.5) * 0.12;
      this.skies.push({ d: Math.round(fr * len), r: 4 + rnd() * 2.5, side: (rnd() - 0.5) * 3 });
    }
    // the light through each hole falls on the floor offset along the sun
    const sun = hz.fx?.smoke?.mat?.uniforms?.uSun?.value?.clone().normalize() || new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    this.sun = sun;
    // baked darkness: dark a little way in from each portal, lit under the skylights
    const shadeD = (d, lat) => {
      if (d < -2 || d > len + 2) return 1;
      const din = Math.min(d, len - d);
      let s = lerp(1, 0.1, smooth(din, -2, 32));
      for (const sk of this.skies) {
        const dd = d - sk.d;
        s += 0.75 * Math.exp(-(dd * dd + (lat - sk.side) ** 2 * 0.5) / (2 * (sk.r + 2) ** 2));
      }
      return clamp(s, 0.04, 1);
    };
    this.shadeD = shadeD;
    kp.tubeShade = (i, lat) => shadeD(signed(t, a, i), lat);
    // wall half widths: inside the cut, but never tighter than the road needs
    const step = lite ? 3 : 1.5;
    const rows = [];
    for (let d = -4; d <= len + 4; d += step) rows.push(t.wrap(a + Math.round(d)));
    // the walls stand inside the cut, clear of the heightfield (which would poke through them)
    const scan = (f, s) => {
      for (let l = hw + 0.5; l < hw + 7; l += 0.25) {
        const x = f.x + f.nx * s * l, z = f.z + f.nz * s * l;
        if (world.heightAt(x, z) > f.y + 0.7) return l - 1.3;
      }
      return hw + 4.2;
    };
    const raw = rows.map((i) => { const f = t.frame(i); f.y = t.at(i)[1]; return [scan(f, -1), scan(f, 1)]; });
    const half = raw.map((_, k) => {
      let L = 0, R = 0, c = 0;
      for (let j = -6; j <= 6; j++) { const r = raw[clamp(k + j, 0, raw.length - 1)]; L += r[0]; R += r[1]; c++; }
      return [clamp(Math.min(L / c, raw[k][0]), hw + 1.4, hw + 4.5), clamp(Math.min(R / c, raw[k][1]), hw + 1.4, hw + 4.5)];
    });
    // profile: angle 0 (left floor) .. PI (right floor); the walls bulge into a lava shelf a metre up
    const NP = lite ? 16 : 26;
    const prof = (phi, L, R, h) => {
      const c = Math.cos(phi), s = Math.sin(phi);
      const wdt = c > 0 ? L : R;
      let lat = -Math.sign(c) * Math.pow(Math.abs(c), 0.75) * wdt;
      const y = Math.pow(s, 0.65) * h - 0.6 * (1 - s);
      // the shelf: lava that stood at this level for a while, a ledge sticking out of the wall
      const shelf = Math.exp(-((y - 1.3) ** 2) / 0.12) * 0.55;
      lat += Math.sign(c) * shelf;
      return [lat, y];
    };
    this.prof = prof;
    const frames = rows.map((i, k) => {
      const f = t.frame(i);
      return { i, d: signed(t, a, i), x: f.x, z: f.z, nx: f.nx, nz: f.nz, tx: f.tx, tz: f.tz, y: t.at(i)[1], L: half[k][0], R: half[k][1], yaw: f.yaw };
    });
    this.frames = frames;
    // ---- interior
    const P = [], SH = [], idx = [];
    const skip = new Set();
    frames.forEach((fr, r) => {
      const h = roof + vnoise(fr.d / 23, 1.3, 0.2) * 1.2;
      for (let j = 0; j <= NP; j++) {
        const phi = j / NP * Math.PI;
        let [lat, y] = prof(phi, fr.L, fr.R, h);
        // rough rock: big lumps and small facets, pushed along the profile's normal
        const nrm = [-Math.cos(phi), Math.sin(phi)];
        // (pushed in only, low on the walls, so they never bulge out into the cut's own walls)
        let n = vnoise(fr.d / 5.5, phi * 2.1, 0.7) * 0.55 + vnoise(fr.d / 1.7, phi * 6.3, 3.1) * 0.2 + vnoise(fr.d / 13, phi * 1.1, 8.3) * 0.6;
        if (Math.sin(phi) < 0.6) n = 0.35 + Math.abs(n) * 0.6;
        lat -= nrm[0] * n * (j === 0 || j === NP ? 0 : 1); y -= nrm[1] * n;
        const x = fr.x + fr.nx * lat, z = fr.z + fr.nz * lat;
        P.push(x, fr.y + y, z);
        SH.push(shadeD(fr.d, lat) * (0.75 + 0.25 * Math.sin(phi)));
        // skylight holes in the crown
        for (const sk of this.skies) {
          const rr = Math.hypot(fr.d - sk.d, (lat - sk.side) * 0.8) + vnoise(fr.d / 2, phi * 3, 5.5) * 1.3;
          if (rr < sk.r && phi > 0.3 && phi < Math.PI - 0.3) skip.add(r * (NP + 1) + j);
        }
      }
    });
    for (let r = 0; r < frames.length - 1; r++) for (let j = 0; j < NP; j++) {
      const p = r * (NP + 1) + j, q = p + 1, p2 = p + NP + 1, q2 = p2 + 1;
      if (skip.has(p) && skip.has(q2) || skip.has(q) && skip.has(p2)) continue;
      if ((skip.has(p) + skip.has(q) + skip.has(p2) + skip.has(q2)) >= 2) continue;
      idx.push(p, p2, q, q, p2, q2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(SH, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.glowAmp = kp.glow;
    const wallMat = basaltMaterial(hz.M, { tint: [0.42, 0.4, 0.39], scale: 3.2, shade: true, side: THREE.DoubleSide,
      glow: { amp: this.glowAmp, low: -1e4, range: 1e5, scale: 1.2, patch: 0.35, tex: kp.tex.glowCr }, key: 'tube' });
    // glowing cracks only low on the walls: the shader's height test is absolute, so patch the low line per row
    // by baking it into the glow mask through the shade attribute's companion (kept simple: a global low line
    // per tube would not follow the road down the slope)
    wallMat.onBeforeCompile = ((base) => (sh) => {
      base(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float hgt; varying float vHgt;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHgt = hgt;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHgt;')
        .replace('float lowK = 1.0 - smoothstep(uLow, uLow + 100000.00, vW.y);', 'float lowK = 1.0 - smoothstep(0.2, 3.2, vHgt);');
    })(wallMat.onBeforeCompile);
    const H = [];
    for (let k = 0; k < P.length / 3; k++) { const r = Math.floor(k / (NP + 1)); H.push(P[k * 3 + 1] - frames[r].y); }
    g.setAttribute('hgt', new THREE.Float32BufferAttribute(H, 1));
    this.wallMat = wallMat;
    const interior = new THREE.Mesh(g, wallMat);
    interior.castShadow = true; interior.receiveShadow = true;
    kp.group.add(interior);
    // walls collide (up to head height), so nothing drives out through the rock
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const CJ = [];
    for (let j = 0; j <= NP; j++) { const phi = j / NP * Math.PI; if (Math.pow(Math.sin(phi), 0.65) * roof < 4.5) CJ.push(j); }
    for (const side of [CJ.filter((j) => j < NP / 2), CJ.filter((j) => j > NP / 2)]) {
      const cv = [], ci = [];
      frames.forEach((fr, r) => side.forEach((j) => { const o = (r * (NP + 1) + j) * 3; cv.push(P[o], P[o + 1], P[o + 2]); }));
      const m = side.length;
      for (let r = 0; r < frames.length - 1; r++) for (let k = 0; k < m - 1; k++) { const p = r * m + k; ci.push(p, p + m, p + 1, p + 1, p + m, p + m + 1); }
      if (m > 1) hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(cv), new Uint32Array(ci)).setFriction(0.4).setCollisionGroups(G_GROUND), this.body);
    }
    // ---- the rock over it, out to the cut's rims, with the skylight holes through it
    const outerMat = basaltMaterial(hz.M, { tint: [0.4, 0.38, 0.36], scale: 5, key: 'tube-out' });
    this.outerMat = outerMat;
    const OL = [-1, -0.75, -0.5, -0.3, -0.15, 0, 0.15, 0.3, 0.5, 0.75, 1];
    const OP = [], OI = [], oskip = new Set();
    const outerY = (fr, u) => {
      const sideW = u < 0 ? fr.L : fr.R;
      const lat = u * (sideW + 12);
      const x = fr.x + fr.nx * lat, z = fr.z + fr.nz * lat;
      const top = fr.y + roof + 1.8 + vnoise(fr.d / 9, u * 4, 2.2) * 0.8;
      const ground = world.heightAt(x, z);
      const k = smooth(Math.abs(lat), sideW * 0.55, sideW + 12);
      return [lat, lerp(top, Math.min(ground - 0.8, Math.max(top - 2, ground - 0.8)), k) + (Math.abs(u) === 1 ? 0 : 0)];
    };
    frames.forEach((fr, r) => {
      OL.forEach((u, k) => {
        const [lat, y] = outerY(fr, u);
        OP.push(fr.x + fr.nx * lat, y, fr.z + fr.nz * lat);
        for (const sk of this.skies) if (Math.hypot(fr.d - sk.d, (lat - sk.side) * 0.8) < sk.r + 0.8) oskip.add(r * OL.length + k);
      });
    });
    for (let r = 0; r < frames.length - 1; r++) for (let k = 0; k < OL.length - 1; k++) {
      const p = r * OL.length + k, q = p + 1, p2 = p + OL.length, q2 = p2 + 1;
      if (oskip.has(p) + oskip.has(q) + oskip.has(p2) + oskip.has(q2) >= 2) continue;
      OI.push(p, q, p2, q, q2, p2);
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(OP, 3));
    og.setIndex(OI); og.computeVertexNormals();
    const outer = new THREE.Mesh(og, outerMat);
    outer.castShadow = true; outer.receiveShadow = true;
    kp.group.add(outer);
    // ---- portals: a face closing the gap between the arch and the rock over it, and a broken lip of the tube
    // sticking out over the road
    for (const [fr, dir] of [[frames[0], -1], [frames[frames.length - 1], 1]]) {
      const FP = [], FI = [];
      const cols = [];
      for (let u = -1; u <= 1.0001; u += 1 / 14) cols.push(u);
      const archY = (lat) => {
        // the interior's crown height over this lat (upper half of the profile)
        let best = -0.6;
        for (let j = 0; j <= 64; j++) {
          const [l, y] = prof(j / 64 * Math.PI, fr.L, fr.R, roof);
          if (Math.abs(l - lat) < 0.5) best = Math.max(best, y);
        }
        return Math.abs(lat) > Math.max(fr.L, fr.R) ? null : best;
      };
      cols.forEach((u) => {
        const [lat, yTop] = outerY(fr, u);
        const ay = archY(lat);
        const yb = ay == null ? world.heightAt(fr.x + fr.nx * lat, fr.z + fr.nz * lat) - 1 : fr.y + ay - 0.3;
        for (const [y, push] of [[yb, 0.4], [lerp(yb, yTop, 0.5), 1.2], [yTop + 0.2, 0.3]]) {
          const o = dir * push * (0.5 + vnoise(lat / 2, y / 2, 4.4) * 0.5);
          FP.push(fr.x + fr.nx * lat + fr.tx * o, Math.max(y, yb), fr.z + fr.nz * lat + fr.tz * o);
        }
      });
      for (let k = 0; k < cols.length - 1; k++) for (let v = 0; v < 2; v++) {
        const p = k * 3 + v, q = p + 1, p2 = p + 3, q2 = p2 + 1;
        if (dir > 0) FI.push(p, p2, q, q, p2, q2); else FI.push(p, q, p2, q, q2, p2);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(FP, 3));
      fg.setIndex(FI); fg.computeVertexNormals();
      const fm = new THREE.Mesh(fg, outerMat);
      fm.material = outerMat;
      fm.castShadow = true; fm.receiveShadow = true;
      kp.group.add(fm);
    }
    // ---- breakdown: blocks fallen from the roof, heaped along the walls; boulders round the portals and holes
    const geos = [0, 1, 2].map((k) => rockGeo(900 + k * 7, lite ? 1 : 2, { flat: 0.6, sharp: 0.25 }));
    this.geos = geos;
    const rockMat = basaltMaterial(hz.M, { tint: [0.45, 0.43, 0.41], scale: 2.5, shade: true, key: 'tube-rock' });
    this.rockMat = rockMat;
    const NR = lite ? 90 : 220;
    const ims = geos.map((gg) => {
      const im = new THREE.InstancedMesh(gg, rockMat, NR);
      gg.setAttribute('shade', new THREE.InstancedBufferAttribute(new Float32Array(NR).fill(1), 1));
      return im;
    });
    const cnt = [0, 0, 0];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const place = (x, y, z, s, sh) => {
      const gi = Math.floor(rnd() * 3);
      if (cnt[gi] >= NR) return;
      e.set((rnd() - 0.5) * 0.8, rnd() * 6.3, (rnd() - 0.5) * 0.8);
      q.setFromEuler(e);
      sc.set(s * (0.8 + rnd() * 0.6), s * (0.5 + rnd() * 0.5), s * (0.8 + rnd() * 0.6));
      m4.compose(p.set(x, y + sc.y * 0.3, z), q, sc);
      ims[gi].setMatrixAt(cnt[gi], m4);
      ims[gi].geometry.attributes.shade.setX(cnt[gi], sh);
      cnt[gi]++;
    };
    for (let k = 0; k < NR * 2.2; k++) {
      const fr = frames[Math.floor(rnd() * frames.length)];
      const s = rnd() < 0.5 ? -1 : 1;
      const wl = s < 0 ? fr.L : fr.R;
      const lat = s * (wl - 0.3 - Math.pow(rnd(), 2) * (wl - hw - 0.8));
      const x = fr.x + fr.nx * lat, z = fr.z + fr.nz * lat;
      place(x, Math.max(world.heightAt(x, z), fr.y - 0.2), z, 0.25 + Math.pow(rnd(), 2.5) * 1.3, shadeD(fr.d, lat) * 0.85);
    }
    // under each skylight, the roof that fell
    for (const sk of this.skies) {
      for (let k = 0; k < (lite ? 6 : 14); k++) {
        const d = sk.d + (rnd() - 0.5) * sk.r * 2.2;
        const fr = frames[clamp(Math.round((d + 4) / step), 0, frames.length - 1)];
        const s = rnd() < 0.5 ? -1 : 1;
        const lat = s * (hw + 0.4 + rnd() * 2.5);
        const x = fr.x + fr.nx * lat, z = fr.z + fr.nz * lat;
        place(x, fr.y - 0.1, z, 0.5 + rnd() * 1.1, 0.9);
      }
    }
    ims.forEach((im, gi) => { im.count = cnt[gi]; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); kp.group.add(im); });
    // boulders round the portals and the holes, outside (normal lighting)
    const outRocks = geos.map((gg) => new THREE.InstancedMesh(gg.clone(), outerMat, 40));
    outRocks.forEach((im) => im.geometry.deleteAttribute('shade'));
    const oc = [0, 0, 0];
    const putOut = (x, y, z, s) => {
      const gi = Math.floor(rnd() * 3);
      if (oc[gi] >= 40) return;
      e.set((rnd() - 0.5) * 0.6, rnd() * 6.3, (rnd() - 0.5) * 0.6);
      q.setFromEuler(e);
      sc.set(s * (0.9 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (0.9 + rnd() * 0.5));
      m4.compose(p.set(x, y, z), q, sc);
      outRocks[gi].setMatrixAt(oc[gi]++, m4);
    };
    for (const [fr, dir] of [[frames[0], -1], [frames[frames.length - 1], 1]]) {
      for (let k = 0; k < (lite ? 10 : 22); k++) {
        const s = rnd() < 0.5 ? -1 : 1;
        const wl = s < 0 ? fr.L : fr.R;
        const lat = s * (wl + rnd() * 9);
        const al = dir * (0.5 + rnd() * 6);
        const x = fr.x + fr.nx * lat + fr.tx * al, z = fr.z + fr.nz * lat + fr.tz * al;
        const r = 0.7 + Math.pow(rnd(), 1.5) * 2.4;
        putOut(x, world.heightAt(x, z) + r * 0.2, z, r);
      }
    }
    for (const sk of this.skies) {
      const fr = frames[clamp(Math.round((sk.d + 4) / step), 0, frames.length - 1)];
      for (let k = 0; k < (lite ? 5 : 10); k++) {
        const a2 = rnd() * 6.283, rr = sk.r + 0.5 + rnd() * 2;
        const lat = sk.side + Math.cos(a2) * rr / 0.8, al = Math.sin(a2) * rr;
        const x = fr.x + fr.nx * lat + fr.tx * al, z = fr.z + fr.nz * lat + fr.tz * al;
        putOut(x, fr.y + roof + 1.6, z, 0.6 + rnd() * 1.2);
      }
    }
    outRocks.forEach((im, gi) => { im.count = oc[gi]; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); kp.group.add(im); });
    this.outRocks = outRocks;
    // ---- skylight shafts and the dust in them
    const shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: kp.tex.time, tNoise: { value: smoothNoise() } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main() { vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
      fragmentShader: `uniform float uTime; uniform sampler2D tNoise; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float edge = pow(abs(dot(normalize(vN), V)), 1.6);
  float n = texture2D(tNoise, vec2(vUv.x * 2.0 + uTime * 0.01, vUv.y * 0.6 - uTime * 0.02)).r;
  float a = edge * (0.55 + 0.6 * n) * smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y) * 0.6);
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * a * 0.22, 1.0);
}`,
    });
    this.shaftMat = shaftMat;
    this.motes = [];
    const moteMat = new THREE.PointsMaterial({ color: 0xffe9c4, size: 0.06, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    this.moteMat = moteMat;
    for (const sk of this.skies) {
      const fr = frames[clamp(Math.round((sk.d + 4) / step), 0, frames.length - 1)];
      const top = new THREE.Vector3(fr.x + fr.nx * sk.side, fr.y + roof + 1.0, fr.z + fr.nz * sk.side);
      const hgt = roof + 1.6;
      const len2 = hgt / Math.max(0.35, sun.y);
      const bot = top.clone().addScaledVector(sun, -len2);
      const geo = new THREE.CylinderGeometry(sk.r * 0.8, sk.r * 0.95, len2, 20, 1, true);
      geo.translate(0, -len2 / 2, 0);
      const m = new THREE.Mesh(geo, shaftMat);
      m.position.copy(top);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tmp.copy(sun).negate());
      m.renderOrder = 7;
      m.frustumCulled = true;
      kp.group.add(m);
      // dust motes drifting in the beam
      const NM = lite ? 120 : 320;
      const pos = new Float32Array(NM * 3);
      const seeds = [];
      for (let k = 0; k < NM; k++) {
        const u = rnd(), a2 = rnd() * 6.283, rr = Math.sqrt(rnd()) * sk.r * 0.85;
        seeds.push({ u, a: a2, r: rr, sp: 0.02 + rnd() * 0.05, ph: rnd() * 6.283 });
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, moteMat);
      pts.frustumCulled = false;
      pts.renderOrder = 8;
      kp.group.add(pts);
      this.motes.push({ top, bot, seeds, pos, pts, r: sk.r });
      sk.top = top; sk.bot = bot;
    }
    // ---- lavacicles: molten drips from the roof, glowing, splashing sparks on the floor
    this.drips = [];
    const nd = lite ? 5 : 10;
    const dropG = new THREE.SphereGeometry(0.07, 6, 4).scale(1, 2.2, 1);
    const coneG = new THREE.ConeGeometry(0.12, 0.6, 6).rotateX(Math.PI);
    this.geos.push(dropG, coneG);
    const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.25) });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, emissive: 0xff5a10, emissiveIntensity: 1.8, roughness: 0.8 });
    this.dropMat = dropMat; this.tipMat = tipMat;
    for (let k = 0; k < nd; k++) {
      const d = len * (k + 0.5) / nd + (rnd() - 0.5) * 20;
      const fr = frames[clamp(Math.round((d + 4) / step), 0, frames.length - 1)];
      if (this.skies.some((sk) => Math.abs(sk.d - fr.d) < sk.r + 4)) continue;
      const s = rnd() < 0.5 ? -1 : 1;
      const lat = s * (hw - 1 + rnd() * 2.5);
      // the crown's height over that lat
      let yy = roof * 0.8;
      for (let j = 0; j <= 40; j++) { const [l, y] = prof(j / 40 * Math.PI, fr.L, fr.R, roof); if (Math.abs(l - lat) < 0.6) yy = Math.min(yy, y); }
      const top = new THREE.Vector3(fr.x + fr.nx * lat, fr.y + Math.max(4.5, yy - 0.7), fr.z + fr.nz * lat);
      const tip = new THREE.Mesh(coneG, tipMat);
      tip.position.copy(top).setY(top.y + 0.25);
      kp.group.add(tip);
      const drop = new THREE.Mesh(dropG, dropMat);
      drop.visible = false;
      kp.group.add(drop);
      this.drips.push({ top, floor: world.heightAt(top.x, top.z) + 0.15, drop, t: rnd() * 2, vy: 0, falling: false });
    }
    // one warm light that follows the player along the hot spots of the walls
    this.light = new THREE.PointLight(0xff6a1e, 0, 26, 1.6);
    kp.group.add(this.light);
    // the sky's ambient and image light, dimmed while the player is inside
    this.scene = hz.scene;
    this.baseEnv = hz.scene.environmentIntensity ?? 1;
    this.hemis = [];
    hz.scene.traverse((o) => { if (o.isHemisphereLight || o.isAmbientLight) this.hemis.push([o, o.intensity]); });
    this.dark = 0;
  }

  pre(dt, race, time) {
    const t = this.kp.t, pl = race.player;
    const d = signed(t, this.a, pl.i);
    const inside = d > 0 && d < this.len ? smooth(Math.min(d, this.len - d), 2, 30) : 0;
    let sky = 0;
    for (const sk of this.skies) sky = Math.max(sky, Math.exp(-((d - sk.d) ** 2) / (2 * 9 * 9)));
    const goal = inside * (1 - sky * 0.6);
    this.dark += (goal - this.dark) * Math.min(1, dt * 3);
    this.scene.environmentIntensity = this.baseEnv * (1 - this.dark * 0.7);
    for (const [o, i0] of this.hemis) o.intensity = i0 * (1 - this.dark * 0.7);
  }

  post(dt, race, time) {
    const t = this.kp.t, hz = this.kp.hz, pl = race.player;
    const d = signed(t, this.a, pl.i);
    const near = d > -60 && d < this.len + 60;
    // the light: on the wall a little ahead of the player
    if (near && d > -5 && d < this.len + 5) {
      const ahead = clamp(d + 14, 0, this.len);
      const fr = this.frames[clamp(Math.round((ahead + 4) / (this.frames[1].d - this.frames[0].d || 1)), 0, this.frames.length - 1)];
      const s = Math.sin(fr.d * 0.05) > 0 ? 1 : -1;
      this.light.position.set(fr.x + fr.nx * s * (fr.L - 1.2), fr.y + 1.2, fr.z + fr.nz * s * (fr.L - 1.2));
      this.light.intensity = 45 * (0.8 + 0.2 * Math.sin(time * 3.1) * Math.sin(time * 1.7));
    } else this.light.intensity = 0;
    if (!near) return;
    // dust motes: slow swirl down the beam
    for (const m of this.motes) {
      m.seeds.forEach((s, k) => {
        s.u = (s.u + s.sp * dt * 0.1) % 1;
        const a = s.a + time * 0.05 + Math.sin(time * 0.3 + s.ph) * 0.3;
        const x = lerp(m.top.x, m.bot.x, s.u) + Math.cos(a) * s.r, y = lerp(m.top.y, m.bot.y, s.u) + Math.sin(time * 0.4 + s.ph) * 0.15, z = lerp(m.top.z, m.bot.z, s.u) + Math.sin(a) * s.r;
        m.pos[k * 3] = x; m.pos[k * 3 + 1] = y; m.pos[k * 3 + 2] = z;
      });
      m.pts.geometry.attributes.position.needsUpdate = true;
    }
    // drips
    for (const dr of this.drips) {
      if (!dr.falling) {
        dr.t -= dt;
        if (dr.t <= 0) { dr.falling = true; dr.drop.visible = true; dr.drop.position.copy(dr.top); dr.vy = 0; }
        continue;
      }
      dr.vy -= 9.81 * dt;
      dr.drop.position.y += dr.vy * dt;
      if (dr.drop.position.y < dr.floor) {
        dr.falling = false; dr.drop.visible = false; dr.t = 1.2 + Math.random() * 2.5;
        for (let k = 0; k < 5; k++) hz.fx.spark.emit(tmp.set(dr.top.x, dr.floor + 0.05, dr.top.z), tmp2.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.03, time, 0.5);
        if (Math.random() < 0.5) hz.fx.smoke.emit(tmp.set(dr.top.x, dr.floor + 0.2, dr.top.z), tmp2.set(0, 0.6, 0), 0.4, time, 2, 0.2, 0.19, 0.18);
      }
    }
  }

  debug() { return { tube: `${this.a}-${this.b} skies ${this.skies.map((s) => s.d).join(',')} dark ${this.dark.toFixed(2)}` }; }

  dispose() {
    this.kp.hz.phys.removeRigidBody(this.body);
    this.scene.environmentIntensity = this.baseEnv;
    for (const [o, i0] of this.hemis) o.intensity = i0;
    for (const g of this.geos) g.dispose();
    for (const im of this.outRocks) im.geometry.dispose();
  }
}
