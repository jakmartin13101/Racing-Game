import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { G_GROUND, tmp, tmp2, clamp, smooth, lerp, mulberry, rockGeo, basaltMaterial, canvasTex, glowTexture, signed, smoothNoise } from './util.js';
import { surfaceMaterial } from './surfaces.js';

// The three live lava streams across the road.
//  ramp   a natural rock ramp: the road climbs onto a lip of old basalt and flies the stream; boulders line it
//  bridge the road crew's temporary steel bridge: checker-plate deck on I-beam girders and steel trestles, bolted
//         W-beam barriers, amber warning beacons, sheet piling holding the banks, the lava glowing underneath
//  ridge  a ridge of cooling crust shoves the road up into a crest right at the stream's edge; its plates are
//         seamed with glowing cracks and it steams
// A truck that drops into a stream is burned out. A truck that reaches a lip at a decent speed, pointing the right
// way, is helped just enough to clear the gap (every class has to get round here, and the AI must never drop in).

const GRAV = 9.81;

// a sheet over a list of frames {x, z, nx, nz, tx, tz, along}: uv = (along, lat), y(fr, lat, x, z)
function sheet(frames, lats, y, attrs = null) {
  const P = [], UV = [], idx = [], ex = {};
  frames.forEach((fr, r) => {
    lats.forEach((lat, k) => {
      const x = fr.x + fr.nx * lat, z = fr.z + fr.nz * lat;
      P.push(x, y(fr, lat, x, z), z);
      UV.push(fr.along, lat);
      if (attrs) { const a = attrs(fr, lat, r, k); for (const key in a) (ex[key] ||= { s: a[key].length, v: [] }).v.push(...a[key]); }
    });
  });
  const m = lats.length;
  for (let r = 0; r < frames.length - 1; r++) for (let k = 0; k < m - 1; k++) {
    const a = r * m + k, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  for (const key in ex) g.setAttribute(key, new THREE.Float32BufferAttribute(ex[key].v, ex[key].s));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a profile (array of [lat, dy] points, relative to each frame's lat0 / y0) swept along frames; per-edge vertices
// so the corners stay crisp
function sweep(frames, prof, { closed = true, lat0 = 0, y0 = (fr) => fr.y } = {}) {
  const P = [], idx = [];
  const E = closed ? prof.length : prof.length - 1;
  let base = 0;
  for (let e = 0; e < E; e++) {
    const p0 = prof[e], p1 = prof[(e + 1) % prof.length];
    frames.forEach((fr) => {
      for (const [l, dy] of [p0, p1]) {
        const lat = lat0 + l;
        P.push(fr.x + fr.nx * lat, y0(fr) + dy, fr.z + fr.nz * lat);
      }
    });
    for (let r = 0; r < frames.length - 1; r++) {
      const a = base + r * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    base += frames.length * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function steelMaterial(M, { color = 0x6d6f70, low = -1e5, rust = 0.5, rough = 0.5, paint = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: paint ?? color, roughness: rough, metalness: paint != null ? 0.3 : 0.75, envMapIntensity: 0.9, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: smoothNoise() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform sampler2D tNoise;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float rs = smoothstep(0.6, 0.85, texture(tNoise, vW.xz / 3.0 + vW.y / 2.0).r * 0.7 + texture(tNoise, vec2(vW.x + vW.z, vW.y * 0.1) / 1.3).g * 0.5) * ${rust.toFixed(2)};
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.065, 0.035) * (0.7 + 0.5 * texture(tNoise, vW.xz).b), rs);
// soot and heat scale low down, over the lava
float soot = 1.0 - smoothstep(${low.toFixed(2)}, ${(low + 5).toFixed(2)}, vW.y);
diffuseColor.rgb *= mix(1.0, 0.25, soot);
roughnessFactor = mix(roughnessFactor, 0.95, max(rs, soot));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor *= 1.0 - rs * 0.8;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.28, 0.05) * pow(1.0 - smoothstep(${(low - 2).toFixed(2)}, ${(low + 3).toFixed(2)}, vW.y), 2.0) * 0.7;`);
  };
  m.customProgramCacheKey = () => `kp-steel-${low}-${rust}-${paint}`;
  return m;
}

// the deck: diamond checker plate, scuffed bright where tyres run, rusty and greasy elsewhere
function checkerTextures() {
  const N = 256;
  const draw = (g, bump) => {
    g.fillStyle = bump ? '#202020' : '#8a8c8d'; g.fillRect(0, 0, N, N);
    const r = mulberry(3);
    if (!bump) for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${90 + r() * 60},${60 + r() * 30},${40 + r() * 20},${r() * 0.12})`; g.fillRect(r() * N, r() * N, 2 + r() * 20, 2 + r() * 8); }
    const s = N / 8;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const cx = (i + 0.5) * s, cy = (j + 0.5) * s, a = (i + j) % 2 ? 0.6 : -0.6;
      g.save(); g.translate(cx, cy); g.rotate(a);
      if (bump) { const grd = g.createLinearGradient(-s * 0.36, 0, s * 0.36, 0); grd.addColorStop(0, '#606060'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#606060'); g.fillStyle = grd; }
      else g.fillStyle = 'rgba(200,200,200,0.35)';
      g.beginPath(); g.ellipse(0, 0, s * 0.38, s * 0.08, 0, 0, 6.283); g.fill();
      g.restore();
    }
  };
  const map = canvasTex(N, N, (g) => draw(g, false), { repeat: true });
  const bump = canvasTex(N, N, (g) => draw(g, true), { repeat: true, srgb: false });
  return { map, bump };
}

function signTexture(lines, { bg = '#f29a12', fg = '#141210', diamond = true } = {}) {
  return canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    g.save();
    if (diamond) { g.translate(256, 256); g.rotate(Math.PI / 4); g.fillStyle = fg; g.fillRect(-176, -176, 352, 352); g.fillStyle = bg; g.fillRect(-166, -166, 332, 332); g.restore(); }
    else { g.fillStyle = bg; g.fillRect(16, 96, 480, 320); g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(28, 108, 456, 296); g.restore(); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, k) => {
      g.font = `800 ${l.size || 58}px "Saira Condensed", Impact, sans-serif`;
      g.fillText(l.t, 256, 256 + (k - (lines.length - 1) / 2) * (l.gap || 66));
    });
    const r = mulberry(lines.length * 7);
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(60,45,30,${r() * 0.2})`; g.fillRect(r() * 512, r() * 512, 2 + r() * 10, 2 + r() * 5); }
  });
}

// a road sign on a post at (x, z) facing yaw
export function roadSign(group, world, x, z, yaw, tex, { size = 1.3, h = 2.1, post = null } = {}) {
  const g = new THREE.Group();
  const y = world.heightAt(x, z);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  const pm = post || new THREE.MeshStandardMaterial({ color: 0x8b8d8e, roughness: 0.5, metalness: 0.8 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h + 0.4, 8), pm);
  p.position.y = (h + 0.4) / 2 - 0.4;
  g.add(p);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide }));
  face.position.set(0, h, 0.05);
  face.castShadow = true;
  g.add(face);
  group.add(g);
  return g;
}

// ------------------------------------------------------------------------------------------------------------
export class Crossings {
  constructor(kp) {
    this.kp = kp;
    const hz = kp.hz, t = kp.t;
    this.list = [];
    this.burned = [];
    this.light = new THREE.PointLight(0xff5a1a, 0, 30, 2);
    kp.group.add(this.light);
    this.rockMat = basaltMaterial(hz.M, { tint: [0.5, 0.48, 0.46], scale: 4, key: 'cross-rock' });
    for (const c of t.crossings || []) {
      if (c.kind === 'bridge') this.list.push(new SteelBridge(this, c));
      else this.list.push(new JumpCrossing(this, c));
    }
  }

  // The lava surface under a crossing: the river drawn there, if it sits in the channel below the road; else the
  // channel floor plus the bake's 1.6 m, with a stream of our own laid in the channel (len: metres along the road
  // the gap spans)
  lavaFor(cx, cz, f, lineY, len) {
    const world = this.kp.world, t = this.kp.t;
    let best = null, bd = 45 * 45;
    for (const rv of world.data.rivers || []) rv.points.forEach((p, k) => {
      const d = (p[0] - cx) ** 2 + (p[2] - cz) ** 2;
      if (d < bd) {
        bd = d;
        const q = rv.points[Math.min(k + 1, rv.points.length - 1)], o = rv.points[Math.max(k - 1, 0)];
        best = { y: p[1], dx: q[0] - o[0], dz: q[2] - o[2] };
      }
    });
    const floor = world.heightAt(cx, cz);
    if (best && best.y > floor - 1 && best.y < lineY - 2.5) return best.y;
    const y = Math.min(floor + 1.6, lineY - 3.2);
    // our own stream: across the road, downhill whichever way the river (or the ground) runs
    let dx = best ? best.dx : f.nx, dz = best ? best.dz : f.nz;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const hw = t.width / 2 + 26, half = len / 2 + 4;
    const NU = 8, NV = 24, P = [], UV = [], FL = [], I = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const a = i / NU * 2 - 1, s = (j / NV * 2 - 1) * hw;
      const x = cx + dx * s - dz * a * half, z = cz + dz * s + dx * a * half;
      P.push(x, y - a * a * 0.4, z);
      UV.push(s + hw, a * half);
      FL.push(a, 3.2);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; I.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('flow', new THREE.Float32BufferAttribute(FL, 2));
    g.setIndex(I); g.computeVertexNormals();
    if (this.kp.lavaGroup?.userData?.makeMat) {
      this.lavaMat ||= this.kp.lavaGroup.userData.makeMat(true);
      this.lavaMat.side = THREE.DoubleSide;
      const m = new THREE.Mesh(g, this.lavaMat);
      this.kp.group.add(m);
    }
    this.kp.log.push(`own lava at ${Math.round(cx)},${Math.round(cz)} river ${best ? best.y.toFixed(1) : '-'} road ${lineY.toFixed(1)}`);
    return y;
  }

  pre(dt, race, time) { for (const c of this.list) c.pre?.(dt, race, time); }

  post(dt, race, time) {
    const pl = race.player.v.group.position;
    // the lava's glow under whichever crossing the player is nearest
    let best = null, bd = Infinity;
    for (const c of this.list) { const d = pl.distanceToSquared(c.centre); if (d < bd) { bd = d; best = c; } }
    if (best) {
      this.light.position.copy(best.centre).setY(best.lava + 2.2);
      this.light.intensity = (bd < 250 * 250 ? 40 : 0) * (0.85 + 0.15 * Math.sin(time * 2.3) * Math.sin(time * 0.71));
    }
    for (const c of this.list) c.post?.(dt, race, time);
    // trucks that drop into a stream
    for (const st of race.cars) {
      if (st.burned || (st.finished && !st.v.totaled) || st.dnf) continue;
      for (const c of this.list) {
        if (c.inLava(st)) { this.burn(st, race, time, c); break; }
      }
    }
  }

  burn(st, race, time, c) {
    const v = st.v, d = v.damage, hz = this.kp.hz;
    st.burned = true;
    this.kp.log.push(`burn ${v.name.slice(0, 3)}@${st.i} ${c.kind} t${race.t.toFixed(0)}`);
    this.burned.push(v.name);
    if (d) { d.level = 1; d.burning = 1; d.totaledAt = true; }
    const p = v.body.translation(), lv = v.body.linvel();
    hz.fx.explode(new THREE.Vector3(p.x, p.y + 0.5, p.z), time, 1.2, new THREE.Vector3(lv.x, lv.y, lv.z));
    // into the lava: it slows and settles into the flow
    v.body.setLinvel({ x: lv.x * 0.2, y: Math.min(lv.y, 0) * 0.3, z: lv.z * 0.2 }, true);
    v.body.setLinearDamping(3);
    v.body.setAngularDamping(3);
    hz.events?.push({ type: 'burned', st });
    race.retire(st);
  }

  debug() { return { burned: this.burned.join(','), assists: this.list.map((c) => c.assists ?? '-').join(',') }; }

  dispose() { for (const c of this.list) c.dispose?.(); }
}

// ------------------------------------------------------------------------------------------------------------
// the ramp and the ridge
class JumpCrossing {
  constructor(X, c) {
    this.X = X; this.c = c; this.kind = c.kind;
    const kp = X.kp, hz = kp.hz, t = kp.t, world = kp.world, W = t.width, hw = W / 2;
    this.kp = kp;
    this.assists = 0;
    const lip = c.at, land = c.gap[1];
    this.lip = lip; this.land = land;
    const mid = t.wrap(Math.round((c.gap[0] + c.gap[1]) / 2));
    const fm = t.frame(mid);
    this.centre = new THREE.Vector3(fm.x, t.at(mid)[1], fm.z);
    this.lava = X.lavaFor(fm.x, fm.z, fm, t.at(mid)[1], t.ahead(c.gap[0], c.gap[1]));
    const rnd = mulberry(c.at * 3 + 1);
    const ridge = c.kind === 'ridge';
    const glow = kp.glow;
    // AI: centred up for the lip (the arc is helped, below, so it need not risk the bends before it flat out);
    // respawns short of it go down on the landing side
    this.jump = { at: lip, speed: 0, flat: 0, land: t.wrap(land + 16) };
    t.jumps.push(this.jump);
    // ---- lip and landing blocks: the road surface carried crisply to the edge (the heightfield rounds it off)
    const S = kp.S;
    const fr = (i, ext = 0) => {
      const f = t.frame(i);
      const y = t.at(i)[1];
      // the line's grade at that row, for extending past it
      const g = (t.at(i)[1] - t.at(i - 2)[1]) / 2;
      return { x: f.x + f.tx * ext, z: f.z + f.tz * ext, nx: f.nx, nz: f.nz, tx: f.tx, tz: f.tz, y: y + g * ext, along: (S[i] ?? i) + ext, i };
    };
    const launchF = [], landF = [];
    for (let k = -9; k <= 0; k++) launchF.push(fr(lip + k));
    launchF.push(fr(lip, 1.1));
    landF.push(fr(land, -1.4));
    for (let k = 0; k <= 7; k++) landF.push(fr(land + k));
    this.launchF = launchF; this.landF = landF;
    const lats = [];
    for (let k = 0; k <= 16; k++) lats.push(-hw - 2 + (W + 4) * k / 16);
    const topMat = surfaceMaterial(hz.M, ridge ? 'crust' : 'rock', W, { tex: kp.tex, glow });
    topMat.transparent = false; topMat.depthWrite = true; topMat.polygonOffsetFactor = -1; topMat.polygonOffsetUnits = -1;
    topMat.customProgramCacheKey = () => `kp-surf-${ridge ? 'crust' : 'rock'}-solid`;
    this.topMat = topMat;
    const wallMat = basaltMaterial(hz.M, { tint: ridge ? [0.42, 0.36, 0.33] : [0.52, 0.5, 0.48], scale: 3.5, glow: { amp: glow, low: this.lava, range: ridge ? 9 : 5, scale: 1.2, patch: ridge ? 0.1 : 0.5, tex: kp.tex.glowCr }, heat: 1.2, side: THREE.DoubleSide, key: `wall-${c.kind}` });
    this.wallMat = wallMat;
    const bodies = [];
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const [F, dir] of [[launchF, 1], [landF, -1]]) {
      const yTop = (f, lat) => f.y + 0.16 - Math.pow(Math.max(0, Math.abs(lat) - hw) / 2, 2) * 0.25;
      const heat = (f) => [Math.exp(-Math.abs(dir > 0 ? t.ahead(f.i, lip) : t.ahead(land, f.i)) / 7), 0, 0, 1];
      const g = sheet(F, lats, (f, lat) => yTop(f, lat), (f) => ({ kp: heat(f), shade: [1] }));
      const top = new THREE.Mesh(g, topMat);
      top.receiveShadow = true; top.castShadow = true;
      top.renderOrder = 2;
      kp.group.add(top);
      // collider: the top, and just past the lip
      const P = g.attributes.position.array, I = g.index.array;
      hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(P), new Uint32Array(I)).setFriction(1).setCollisionGroups(G_GROUND), this.body);
      // side skirts of the block, down to the ground
      for (const s of [-1, 1]) {
        const lat = s * (hw + 2);
        const SP = [], SI = [];
        F.forEach((f) => {
          const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
          SP.push(x, yTop(f, lat), z, x + f.nx * s * 0.4, Math.min(world.heightAt(x, z), this.lava) - 0.6, z + f.nz * s * 0.4);
        });
        for (let r = 0; r < F.length - 1; r++) { const a = r * 2; if (s > 0) SI.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); else SI.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
        sg.setIndex(SI); sg.computeVertexNormals();
        const sm = new THREE.Mesh(sg, wallMat);
        sm.castShadow = true; sm.receiveShadow = true;
        kp.group.add(sm);
      }
      // the bank: a rough rock face from the edge down into the lava, as wide as the channel is cut
      const e = dir > 0 ? F[F.length - 1] : F[0];
      const back = dir > 0 ? F[F.length - 3] : F[2];
      const cols = [];
      for (let lat = -hw - 2; lat <= hw + 2 + 1e-3; lat += 1.25) cols.push(lat);
      for (const s of [-1, 1]) {
        for (let k = 1; k <= 16; k++) {
          const lat = s * (hw + 2 + k * 1.25);
          const x = back.x + back.nx * lat, z = back.z + back.nz * lat;
          // out to where the channel's own bank rises above the road (the wall would only be buried in it)
          if (world.heightAt(x, z) > e.y + 1.5) break;
          cols.push(lat);
        }
      }
      cols.sort((p, q) => p - q);
      const NV = 9;
      const WP = [], WI = [];
      cols.forEach((lat) => {
        const inside = Math.abs(lat) <= hw + 2.01;
        const xb = back.x + back.nx * lat, zb = back.z + back.nz * lat;
        const yT = inside ? yTop(e, lat) : clamp(world.heightAt(xb, zb), yTop(e, Math.sign(lat) * (hw + 2)) - 2, e.y + 1);
        const yB = this.lava - 1.5;
        for (let v = 0; v <= NV; v++) {
          const u = v / NV;
          const y = lerp(yT, yB, u);
          // bulges and overhangs; the top edge crumbles back a little
          const n = Math.sin(lat * 0.9 + y * 0.7 + c.at) * 0.35 + Math.sin(lat * 2.3 - y * 1.9) * 0.18 + (rnd() - 0.5) * 0.3;
          const out = (u === 0 ? 0 : n + Math.sin(u * Math.PI) * 0.5) * dir;
          const x = e.x + e.nx * lat + e.tx * out, z = e.z + e.nz * lat + e.tz * out;
          WP.push(x, y + (u === 0 ? 0 : (rnd() - 0.5) * 0.25), z);
        }
      });
      for (let col = 0; col < cols.length - 1; col++) for (let v = 0; v < NV; v++) {
        const a = col * (NV + 1) + v, b = a + 1, cc = a + NV + 1, d = cc + 1;
        if (dir > 0) WI.push(a, b, cc, cc, b, d); else WI.push(a, cc, b, cc, d, b);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(WP, 3));
      wg.setIndex(WI); wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, wallMat);
      wm.castShadow = true; wm.receiveShadow = true;
      kp.group.add(wm);
      bodies.push(wm);
    }
    // ---- dressing: basalt boulders lining the ramp, crust plates heaped along the ridge
    const lite = kp.lite;
    const N = lite ? 26 : 54;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    if (!ridge) {
      const geos = [0, 1, 2].map((k) => rockGeo(500 + k * 13 + c.at, lite ? 1 : 2, { flat: 0.7, smoothN: true }));
      const ims = geos.map((g) => new THREE.InstancedMesh(g, X.rockMat, N));
      const cnt = [0, 0, 0];
      for (let k = 0; k < N; k++) {
        const side = k % 2 ? 1 : -1;
        const onLand = rnd() < 0.35;
        const i = onLand ? land + 2 + Math.floor(rnd() * 26) : lip - Math.floor(Math.pow(rnd(), 0.7) * 48);
        const f = t.frame(i);
        const near = onLand ? 1 - t.ahead(land, i) / 30 : 1 - t.ahead(i, lip) / 50;
        const r = (0.6 + rnd() * 1.4) * (0.6 + near * 0.9);
        const lat = side * (hw + 1.4 + r * 0.7 + rnd() * 5);
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
        const y = Math.max(world.heightAt(x, z), Math.abs(signed(t, lip, i)) < 3 || Math.abs(signed(t, land, i)) < 3 ? this.lava : -1e9);
        e.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5);
        q.setFromEuler(e);
        sc.set(r * (1 + rnd() * 0.6), r * (0.6 + rnd() * 0.5), r * (1 + rnd() * 0.5));
        p.set(x, y + sc.y * 0.35, z);
        m4.compose(p, q, sc);
        const gi = k % 3;
        ims[gi].setMatrixAt(cnt[gi]++, m4);
      }
      ims.forEach((im, gi) => { im.count = cnt[gi]; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); kp.group.add(im); });
      this.geos = geos;
    } else {
      const plateMat = basaltMaterial(hz.M, { tint: [0.4, 0.34, 0.31], scale: 2.5, glow: { amp: glow, low: t.at(lip)[1] - 0.5, range: 4, scale: 1.6, patch: 0.1, tex: kp.tex.glowCr }, heat: 0, key: 'plate' });
      this.plateMat = plateMat;
      const pg = new THREE.BoxGeometry(1, 1, 1, 4, 1, 4);
      const pp = pg.attributes.position;
      for (let k = 0; k < pp.count; k++) pp.setXYZ(k, pp.getX(k) + Math.sin(pp.getZ(k) * 5) * 0.06, pp.getY(k) * (1 + Math.sin(pp.getX(k) * 7) * 0.3), pp.getZ(k) + Math.sin(pp.getX(k) * 6) * 0.06);
      pg.computeVertexNormals();
      this.geos = [pg];
      const im = new THREE.InstancedMesh(pg, plateMat, N);
      let cnt = 0;
      for (let k = 0; k < N; k++) {
        const side = k % 2 ? 1 : -1;
        const onLand = rnd() < 0.3;
        const i = onLand ? land + 1 + Math.floor(rnd() * 18) : lip - Math.floor(Math.pow(rnd(), 0.8) * 36);
        const f = t.frame(i);
        const lat = side * (hw + 1.3 + rnd() * 6);
        const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
        const y = Math.max(world.heightAt(x, z), t.at(i)[1] - 1.2);
        // shoved up on edge, tilted towards the road like plates in a pressure ridge
        e.set((rnd() - 0.5) * 0.9, f.yaw + (rnd() - 0.5) * 1.2, side * (0.35 + rnd() * 0.7));
        q.setFromEuler(e);
        sc.set(1.5 + rnd() * 2.5, 0.35 + rnd() * 0.4, 1.2 + rnd() * 2.2);
        p.set(x, y + sc.x * 0.2, z);
        m4.compose(p, q, sc);
        im.setMatrixAt(cnt++, m4);
      }
      im.count = cnt; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      kp.group.add(im);
    }
    this.rnd = rnd;
    this.lastSmoke = 0;
  }

  // the arc over the gap: a truck at the lip pointing down the road at a decent lick gets enough speed to make
  // the landing; a slow or sideways one does not (and drops in)
  pre(dt, race) {
    const t = this.kp.t;
    for (const st of race.cars) {
      const key = `kpj${this.lip}`;
      const rel = signed(t, this.lip, st.i);
      if (rel < -30 || rel > 40) { st[key] = false; continue; }
      if (st[key] || rel < -1 || rel > 2 || st.v.totaled || st.burned) continue;
      st[key] = true;
      const b = st.v.body, v = b.linvel(), p = b.translation();
      const f = t.frame(this.lip);
      const vh = v.x * f.tx + v.z * f.tz, vl = v.x * f.nx + v.z * f.nz;
      if (vh < 7 || Math.abs(vl) > vh * 0.7) continue;
      // where it has to come down: the landing, on its own line
      const lat = clamp((p.x - f.x) * f.nx + (p.z - f.z) * f.nz, -t.width / 2 + 1, t.width / 2 - 1);
      const fl = t.frame(this.land + 5);
      const D = Math.hypot(fl.x + fl.nx * lat - p.x, fl.z + fl.nz * lat - p.z);
      const yL = t.at(this.land + 5)[1] + 1.1;
      const T0 = D / vh;
      if (p.y + v.y * T0 - 0.5 * GRAV * T0 * T0 >= yL + 0.2) continue;
      // the least extra speed that makes the landing at a sane launch angle, so it doesn't fire trucks off the
      // far side into whatever bend follows
      const cap = Math.max(vh, (this.c.speed || 34) * 0.82);
      let vh2 = vh, vy = v.y;
      for (; ; vh2 = Math.min(cap, vh2 + 0.5)) {
        const T = D / vh2;
        vy = clamp((yL + 0.5 - p.y) / T + 0.5 * GRAV * T, v.y, vh2 * 0.4);
        if (p.y + vy * T - 0.5 * GRAV * T * T >= yL + 0.2 || vh2 >= cap) break;
      }
      b.setLinvel({ x: f.tx * vh2 + f.nx * vl, y: vy, z: f.tz * vh2 + f.nz * vl }, true);
      this.assists++;
    }
  }

  post(dt, race, time) {
    // heat haze, smoke and the odd ember off the stream; the ridge steams from its seams
    const hz = this.kp.hz;
    const pl = race.player.v.group.position;
    if (pl.distanceToSquared(this.centre) > 260 * 260) return;
    const f = this.kp.t.frame(Math.round((this.c.gap[0] + this.c.gap[1]) / 2));
    if (Math.random() < (hz.lite ? 0.25 : 0.5)) {
      const lat = (Math.random() - 0.5) * (this.kp.t.width + 16), al = (Math.random() - 0.5) * 14;
      const c = 0.12 + Math.random() * 0.1;
      hz.fx.smoke.emit(tmp.set(f.x + f.nx * lat + f.tx * al, this.lava + 0.6, f.z + f.nz * lat + f.tz * al), tmp2.set(0, 2 + Math.random() * 2, 0), 1.5 + Math.random() * 2, time, 4, c, c * 0.9, c * 0.85);
    }
    if (Math.random() < 0.08) hz.fx.spark.emit(tmp.set(f.x + (Math.random() - 0.5) * 10, this.lava + 0.4, f.z + (Math.random() - 0.5) * 10), tmp2.set((Math.random() - 0.5) * 2, 5 + Math.random() * 5, (Math.random() - 0.5) * 2), 0.05, time, 1.6);
    if (this.kind === 'ridge' && Math.random() < (hz.lite ? 0.2 : 0.45)) {
      const F = this.launchF[Math.floor(Math.random() * this.launchF.length)];
      const lat = (Math.random() - 0.5) * (this.kp.t.width + 8);
      const c = 0.55 + Math.random() * 0.1;
      hz.fx.smoke.emit(tmp.set(F.x + F.nx * lat, F.y + 0.2, F.z + F.nz * lat), tmp2.set(0.3, 0.8 + Math.random(), 0.2), 0.25 + Math.random() * 0.3, time, 1.8, c, c, c * 0.98);
    }
  }

  inLava(st) {
    const t = this.kp.t;
    const rel = signed(t, this.lip, st.i), span = t.ahead(this.lip, this.land);
    if (rel < -2 || rel > span + 2) return false;
    const p = st.v.body.translation();
    const f = t.frame(st.i);
    if (Math.abs((p.x - f.x) * f.nx + (p.z - f.z) * f.nz) > t.width / 2 + 18) return false;
    return p.y < this.lava + 1.7 || p.y < t.at(st.i)[1] - 5;
  }

  dispose() {
    const t = this.kp.t, j = t.jumps.indexOf(this.jump);
    if (j >= 0) t.jumps.splice(j, 1);
    this.kp.hz.phys.removeRigidBody(this.body);
    for (const g of this.geos || []) g.dispose();
  }
}

// ------------------------------------------------------------------------------------------------------------
class SteelBridge {
  constructor(X, c) {
    this.X = X; this.c = c; this.kind = 'bridge';
    const kp = X.kp, hz = kp.hz, t = kp.t, world = kp.world, W = t.width, hw = W / 2;
    this.kp = kp;
    const [a, b] = c.bridge;
    this.a = a; this.b = b;
    const n = t.ahead(a, b);
    const mid = t.wrap(a + Math.round(n / 2));
    const fm = t.frame(mid);
    this.centre = new THREE.Vector3(fm.x, t.at(mid)[1], fm.z);
    this.lava = X.lavaFor(fm.x, fm.z, fm, t.at(mid)[1], n);
    const low = this.lava;
    const S = kp.S;
    const DW = hw + 0.9; // deck half width
    const rows = [];
    for (let k = -7; k <= n + 7; k++) {
      const i = t.wrap(a + k);
      const f = t.frame(i);
      const kk = smooth(Math.min(k + 7, n + 7 - k), 0, 6);
      rows.push({ i, x: f.x, z: f.z, nx: f.nx, nz: f.nz, tx: f.tx, tz: f.tz, y: t.at(i)[1] + 0.14, k: kk, along: S[i] ?? i, yaw: f.yaw });
    }
    this.rows = rows;
    // off the span the deck eases down onto the road, but never dips into the bank the bake cut away
    const yAt = (r, l) => lerp(Math.max(world.heightAt(r.x + r.nx * l, r.z + r.nz * l) + 0.15, r.y), r.y, r.k);
    // ---- deck: checker plate
    const { map, bump } = checkerTextures();
    map.repeat.set(1, 1);
    const deckMat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.6, color: 0xb8bab9, metalness: 0.7, roughness: 0.48, envMapIntensity: 1 });
    deckMat.onBeforeCompile = (sh) => {
      sh.uniforms.tNoise = { value: smoothNoise() };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW2; varying vec2 vT2;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW2 = (modelMatrix * vec4(transformed, 1.0)).xyz; vT2 = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW2; varying vec2 vT2; uniform sampler2D tNoise;')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float lat = vT2.y, al = abs(lat);
// tyre paths polished bright, dirt and cinders packed at the sides, rust where water sits
float wt = exp(-pow((al - 2.7) / 0.9, 2.0)) + exp(-pow((al - 5.0) / 0.9, 2.0));
float dirt = smoothstep(0.4, 0.75, texture(tNoise, vW2.xz / 4.0).r + (1.0 - wt) * 0.25 + smoothstep(${(hw - 1.5).toFixed(2)}, ${(hw + 0.8).toFixed(2)}, al) * 0.5);
float rs = smoothstep(0.72, 0.9, texture(tNoise, vW2.xz / 2.3 + 0.5).g + smoothstep(${(hw - 0.5).toFixed(2)}, ${(hw + 0.8).toFixed(2)}, al) * 0.3);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.065, 0.06), dirt * 0.7);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.07, 0.04), rs * 0.6);
diffuseColor.rgb *= 1.0 + wt * 0.25;
roughnessFactor = mix(roughnessFactor - wt * 0.15, 0.95, max(dirt * 0.8, rs));`)
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - max(dirt * 0.7, rs * 0.8);');
    };
    deckMat.customProgramCacheKey = () => 'kp-checker';
    const lats = [];
    for (let k = 0; k <= 12; k++) lats.push(-DW + 2 * DW * k / 12);
    const dg = sheet(rows, lats, (r, l) => yAt(r, l));
    // uv: plate panels 1.5 m square (the texture holds one panel)
    const uv = dg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 1.5, uv.getY(k) / 1.5);
    const deck = new THREE.Mesh(dg, deckMat);
    deck.receiveShadow = true; deck.castShadow = true;
    deck.renderOrder = 3;
    kp.group.add(deck);
    // the deck shader reads lat from uv (scaled): restore metres for it
    deckMat.onBeforeCompile = ((base) => (sh) => { base(sh); sh.vertexShader = sh.vertexShader.replace('vT2 = uv;', 'vT2 = uv * 1.5;'); })(deckMat.onBeforeCompile);
    // collider: the deck
    this.body = hz.phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(dg.attributes.position.array), new Uint32Array(dg.index.array)).setFriction(1).setCollisionGroups(G_GROUND), this.body);
    // ---- girders, cross beams, edge channels
    const steel = steelMaterial(hz.M, { low, rust: 0.55 });
    const paint = steelMaterial(hz.M, { low, rust: 0.35, paint: 0xc9a227, rough: 0.6 });
    this.mats = [deckMat, steel, paint];
    const span = rows.filter((r) => r.k > 0.98);
    const y0 = (r) => r.y - 0.08;
    const I = (h, bw, tf = 0.03, tw = 0.014) => [[-bw / 2, 0], [bw / 2, 0], [bw / 2, -tf], [tw / 2, -tf], [tw / 2, -h + tf], [bw / 2, -h + tf], [bw / 2, -h], [-bw / 2, -h], [-bw / 2, -h + tf], [-tw / 2, -h + tf], [-tw / 2, -tf], [-bw / 2, -tf]];
    const girders = [];
    for (const gl of [-hw + 0.6, -hw / 3, hw / 3, hw - 0.6]) girders.push(sweep(span, I(1.1, 0.42, 0.035, 0.018), { lat0: gl, y0 }));
    // edge channels (C sections facing out) along both deck edges, the full length
    for (const s of [-1, 1]) girders.push(sweep(rows, [[0, 0.02], [s * 0.1, 0.02], [s * 0.1, -0.02], [0.012 * s, -0.02], [0.012 * s, -0.36], [s * 0.1, -0.36], [s * 0.1, -0.4], [0, -0.4]], { lat0: s * DW, y0: (r) => yAt(r, s * DW) }));
    for (const g of girders) { const m = new THREE.Mesh(g, steel); m.castShadow = true; m.receiveShadow = true; kp.group.add(m); }
    this.geos = girders;
    // cross beams every 2.5 m under the deck
    const cb = new THREE.BoxGeometry(2 * DW - 0.2, 0.28, 0.2);
    const cbm = new THREE.InstancedMesh(cb, steel, Math.ceil(span.length / 2.5) + 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let ci = 0;
    for (let k = 0; k < span.length; k += 2.5) {
      const r = span[Math.min(span.length - 1, Math.round(k))];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.yaw);
      m4.compose(p.set(r.x, y0(r) - 0.22, r.z), q, sc);
      cbm.setMatrixAt(ci++, m4);
    }
    cbm.count = ci; cbm.castShadow = true;
    kp.group.add(cbm);
    this.geos.push(cb);
    // ---- trestle bents into the channel: H-piles, a cap beam, X bracing
    const bentG = new THREE.BoxGeometry(1, 1, 1);
    this.geos.push(bentG);
    const bents = new THREE.InstancedMesh(bentG, steel, 60);
    let bi = 0;
    const put = (x, y, z, sx, sy, sz, yaw, roll = 0) => {
      q.setFromEuler(new THREE.Euler(0, yaw, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
      m4.compose(p.set(x, y, z), q, sc.set(sx, sy, sz));
      bents.setMatrixAt(bi++, m4);
    };
    for (const fr of [0.3, 0.7]) {
      const r = span[Math.round(fr * (span.length - 1))];
      if (!r) continue;
      const top = y0(r) - 1.1;
      const bot = low - 2;
      const H = top - bot;
      for (const l of [-hw + 0.6, -hw / 3, hw / 3, hw - 0.6]) {
        const x = r.x + r.nx * l, z = r.z + r.nz * l;
        // H pile: two flanges and a web
        put(x + r.tx * 0.15, bot + H / 2, z + r.tz * 0.15, 0.36, H, 0.025, r.yaw);
        put(x - r.tx * 0.15, bot + H / 2, z - r.tz * 0.15, 0.36, H, 0.025, r.yaw);
        put(x, bot + H / 2, z, 0.02, H, 0.3, r.yaw);
      }
      // cap beam
      put(r.x, top - 0.2, r.z, 2 * hw + 0.6, 0.4, 0.4, r.yaw);
      // bracing between the piles, crossing
      const bh = Math.min(H - 1, 6);
      for (const [l0, l1] of [[-hw + 0.6, -hw / 3], [-hw / 3, hw / 3], [hw / 3, hw - 0.6]]) {
        const lm = (l0 + l1) / 2, dl = l1 - l0;
        const x = r.x + r.nx * lm, z = r.z + r.nz * lm;
        const len = Math.hypot(dl, bh), ang = Math.atan2(bh, dl);
        put(x, top - 0.4 - bh / 2, z, len, 0.12, 0.08, r.yaw - Math.PI / 2, ang);
        put(x, top - 0.4 - bh / 2, z, len, 0.12, 0.08, r.yaw - Math.PI / 2, -ang);
      }
    }
    bents.count = bi; bents.castShadow = true; bents.receiveShadow = true;
    kp.group.add(bents);
    // ---- sheet piling holding each bank, down into the lava
    for (const [ri, dir] of [[7, 1], [rows.length - 8, -1]]) {
      const r = rows[ri];
      const P = [], IX = [];
      const cols = Math.ceil((2 * DW + 6) / 0.3);
      for (let k = 0; k <= cols; k++) {
        const l = -DW - 3 + k * 0.3;
        const corr = (k % 4 < 2 ? 0.18 : 0) * dir;
        for (const y of [yAt(r, clamp(l, -DW, DW)) - 0.1, low - 2]) P.push(r.x + r.nx * l + r.tx * corr, y, r.z + r.nz * l + r.tz * corr);
      }
      for (let k = 0; k < cols; k++) { const q0 = k * 2; if (dir > 0) IX.push(q0, q0 + 1, q0 + 2, q0 + 2, q0 + 1, q0 + 3); else IX.push(q0, q0 + 2, q0 + 1, q0 + 2, q0 + 3, q0 + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setIndex(IX); g.computeVertexNormals();
      const m = new THREE.Mesh(g, steel);
      m.castShadow = true; m.receiveShadow = true;
      kp.group.add(m);
      this.geos.push(g);
    }
    // ---- bolted W-beam barriers on I-section posts, yellow end terminals
    const wb = [[0, 0.17], [0.06, 0.12], [0.0, 0.05], [0.0, -0.05], [0.06, -0.12], [0, -0.17]];
    const rails = rows.filter((r) => r.k > 0.5);
    this.railGeos = [];
    const postG = new THREE.BoxGeometry(0.15, 0.95, 0.15);
    this.geos.push(postG);
    const posts = new THREE.InstancedMesh(postG, steel, 2 * Math.ceil(rails.length / 2) + 4);
    let pi = 0;
    for (const s of [-1, 1]) {
      const lat = s * (DW - 0.25);
      const prof = wb.map(([l, dy]) => [-s * l, dy]);
      const g = sweep(rails, prof, { closed: false, lat0: lat, y0: (r) => yAt(r, lat) + 0.62 });
      const rm = new THREE.Mesh(g, steel);
      rm.material = steel;
      rm.castShadow = true;
      kp.group.add(rm);
      this.geos.push(g);
      // the back of the beam too
      const g2 = sweep(rails, prof.slice().reverse(), { closed: false, lat0: lat, y0: (r) => yAt(r, lat) + 0.62 });
      kp.group.add(new THREE.Mesh(g2, steel)); this.geos.push(g2);
      for (let k = 0; k < rails.length; k += 2) {
        const r = rails[k];
        const x = r.x + r.nx * (lat + s * 0.12), z = r.z + r.nz * (lat + s * 0.12);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.yaw);
        m4.compose(p.set(x, yAt(r, lat) + 0.47, z), q, sc.set(1, 1, 1));
        posts.setMatrixAt(pi++, m4);
      }
      // hazard-striped end terminals
      for (const r of [rails[0], rails[rails.length - 1]]) {
        const tm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.4), this.endMat || (this.endMat = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6, metalness: 0.3 })));
        tm.position.set(r.x + r.nx * lat, yAt(r, lat) + 0.62, r.z + r.nz * lat);
        tm.rotation.y = r.yaw;
        tm.castShadow = true;
        kp.group.add(tm);
      }
      // a rail collider so a truck glances off rather than dropping in
      const verts = [], ti = [];
      rails.forEach((r) => { const x = r.x + r.nx * lat, z = r.z + r.nz * lat, y = yAt(r, lat); verts.push(x, y, z, x, y + 1.2, z); });
      for (let j = 0; j < rails.length - 1; j++) { const o = j * 2; ti.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      hz.phys.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(ti)).setFriction(0.3).setCollisionGroups(G_GROUND), this.body);
    }
    posts.count = pi; posts.castShadow = true;
    kp.group.add(posts);
    // ---- amber beacons at the four corners, flashing in turn
    this.beacons = [];
    const lens = new THREE.CylinderGeometry(0.11, 0.11, 0.2, 12);
    const pole = new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8);
    this.geos.push(lens, pole);
    for (const [r, ph] of [[rails[0], 0], [rails[rails.length - 1], 1]]) {
      for (const s of [-1, 1]) {
        const lat = s * (DW + 0.15);
        const x = r.x + r.nx * lat, z = r.z + r.nz * lat, y = yAt(r, s * DW);
        const pm = new THREE.Mesh(pole, steel);
        pm.position.set(x, y + 0.7, z);
        kp.group.add(pm);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5a3a08, emissive: 0xffa21a, emissiveIntensity: 0, roughness: 0.3 });
        const lm = new THREE.Mesh(lens, mat);
        lm.position.set(x, y + 1.5, z);
        kp.group.add(lm);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa41c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
        spr.scale.setScalar(2.4);
        spr.position.copy(lm.position);
        kp.group.add(spr);
        this.beacons.push({ mat, spr, ph: (ph + (s > 0 ? 0.5 : 0)) % 1 });
      }
    }
    // ---- signs on the approach
    const fs = t.frame(a - 45);
    const sl = -(hw + 2.5);
    roadSign(kp.group, world, fs.x + fs.nx * sl, fs.z + fs.nz * sl, fs.yaw + Math.PI, signTexture([{ t: 'STEEL', size: 64 }, { t: 'BRIDGE', size: 64 }, { t: 'AHEAD', size: 52 }]), { size: 1.6, h: 2.2 });
    const fs2 = t.frame(a - 12);
    roadSign(kp.group, world, fs2.x - fs2.nx * sl, fs2.z - fs2.nz * sl, fs2.yaw + Math.PI, signTexture([{ t: 'ROAD CREW', size: 60 }, { t: 'LOAD LIMIT', size: 46 }, { t: '40 T', size: 74, gap: 80 }], { bg: '#ece6d6', diamond: false }), { size: 1.5, h: 1.8 });
    this.geos.push(lens);
  }

  post(dt, race, time) {
    for (const b of this.beacons) {
      const on = ((time * 1.4 + b.ph) % 1) < 0.35 ? 1 : 0;
      b.mat.emissiveIntensity = on * 6;
      b.spr.material.opacity = on * 0.9;
    }
    const hz = this.kp.hz;
    const pl = race.player.v.group.position;
    if (pl.distanceToSquared(this.centre) > 260 * 260) return;
    if (Math.random() < (hz.lite ? 0.25 : 0.5)) {
      const r = this.rows[7 + Math.floor(Math.random() * (this.rows.length - 14))];
      const lat = (Math.random() - 0.5) * (this.kp.t.width + 16);
      const c = 0.12 + Math.random() * 0.1;
      hz.fx.smoke.emit(tmp.set(r.x + r.nx * lat, this.lava + 0.6, r.z + r.nz * lat), tmp2.set(0, 2 + Math.random() * 2, 0), 1.5 + Math.random() * 2, time, 4, c, c * 0.9, c * 0.85);
    }
  }

  inLava(st) {
    const t = this.kp.t;
    const rel = signed(t, this.a, st.i), span = t.ahead(this.a, this.b);
    if (rel < -1 || rel > span + 1) return false;
    const p = st.v.body.translation();
    return p.y < this.lava + 1.7 || p.y < t.at(st.i)[1] - 4.5;
  }

  dispose() {
    this.kp.hz.phys.removeRigidBody(this.body);
    for (const g of this.geos) g.dispose();
  }
}

function stripeTex() {
  return canvasTex(128, 64, (g) => {
    g.fillStyle = '#f0b81c'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#151311';
    for (let k = -2; k < 8; k++) { g.beginPath(); g.moveTo(k * 24, 64); g.lineTo(k * 24 + 12, 64); g.lineTo(k * 24 + 44, 0); g.lineTo(k * 24 + 32, 0); g.fill(); }
  });
}
