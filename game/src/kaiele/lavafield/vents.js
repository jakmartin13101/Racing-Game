import * as THREE from 'three';
import { mulberry } from '../../world.js';
import { clinkerGeometry, rockMaterial } from './rubble.js';

// The live features of the field: spatter cones at the streams' vents, skylights where they pour into lava tubes,
// the crater's walls and lake, and fumaroles and steaming cracks across the crust.
const tmp = new THREE.Vector3(), vel = new THREE.Vector3();

// --------------------------------------------------------------------------------------------- shared materials
// additive glow on a pit's or the crater's walls: an open cone band, brightest at the bottom, flickering
function glowBandMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uK: { value: strength }, uPulse: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */`uniform float uTime, uK, uPulse; uniform vec3 uCol; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        float h = vUv.y;
        float fl = 0.75 + 0.25 * sin(uTime * 1.7 + vUv.x * 31.0) * sin(uTime * 0.9 + vUv.x * 13.0);
        float a = pow(1.0 - h, 2.2) * smoothstep(0.0, 0.08, h) * fl * uPulse;
        // view-angle fade so the band's rim never shows as a hard line seen edge-on
        vec3 V = normalize(cameraPosition - vW);
        a *= (0.35 + 0.65 * abs(V.y)) * smoothstep(0.05, 0.5, abs(dot(normalize(vN), V)));
        gl_FragColor = vec4(uCol * a * uK, 1.0);
      }`,
  });
}

// lava pouring down into a skylight: streaks spiralling in to a dark throat, the crust cooling at the edge
function sinkMaterial(M) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uTime: { value: 0 }, tNoise: { value: M.noise }, tMolten: { value: M.molten } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform sampler2D tNoise, tMolten; varying vec2 vUv;
      void main(){
        vec2 d = vUv * 2.0 - 1.0;
        float ang = atan(d.y, d.x);
        // a ragged hole, not a circle
        float r = length(d) * (1.0 + (texture2D(tNoise, vec2(ang * 0.32, 0.17)).r - 0.5) * 0.35);
        // flows in from the upstream side, curls round and drops into the throat: streaks drawn inwards
        float sw = ang / 6.2832 + 0.22 / (r + 0.1) - uTime * 0.04;
        vec2 uv = vec2(sw * 4.0, r * 1.2 + uTime * 0.45 / (r + 0.25));
        float st = texture2D(tNoise, uv).r * 0.6 + texture2D(tNoise, uv * 2.3 + 0.3).g * 0.4;
        vec3 melt = texture2D(tMolten, uv * 0.7).rgb;
        // the lip where it tips over is hottest; beyond it, falling sheets dim into the dark
        float lip = smoothstep(0.16, 0.42, r);
        vec3 hot = mix(vec3(1.3, 0.28, 0.03), vec3(2.6, 1.1, 0.25), smoothstep(0.5, 0.85, st)) * (0.6 + melt * 0.7);
        hot *= 0.75 + 0.5 * smoothstep(0.55, 0.3, abs(r - 0.42));
        float depth = smoothstep(0.0, 0.3, r);
        vec3 throat = vec3(0.22, 0.03, 0.005) * depth * depth * (0.7 + 0.3 * sin(uTime * 2.0 + r * 20.0));
        vec3 col = mix(throat, hot, lip);
        // crust plates jostle at the rim and darken as they cool
        float crust = smoothstep(0.66, 0.95, r) * smoothstep(0.45, 0.7, texture2D(tNoise, d * 0.6 + uTime * 0.01).b + r * 0.3);
        col = mix(col, vec3(0.05, 0.02, 0.012), crust * 0.85);
        float a = 1.0 - smoothstep(0.85, 1.0, r);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

function stainTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const r = mulberry(19);
  for (let k = 0; k < 110; k++) {
    const a = r() * 6.3, d = Math.pow(r(), 0.7) * 52, s = 5 + r() * 16;
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    // sulphur yellow, gypsum white, and the rusty orange of iron oxides round the fumarole
    const c = r() < 0.5 ? '222,196,86' : r() < 0.6 ? '238,236,222' : '176,96,44';
    grd.addColorStop(0, `rgba(${c},${0.42 * (1 - d / 64)})`); grd.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grd; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// radius where the ground round (x, z) first rises dh above y, averaged over a ring of directions
function wallRadius(world, x, z, y, dh, rmax) {
  let sum = 0, n = 0;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2;
    let r = 2;
    for (; r < rmax; r += 1) if (world.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > y + dh) break;
    sum += r; n++;
  }
  return sum / n;
}

export function buildVents({ world, quality, M, lava, tex, group, fx, lights, rnd }) {
  const lite = !!quality.aiLod;
  const poolMat = lava.userData.makeMat(false);
  const sinkMat = sinkMaterial(M);
  const vents = [], skies = [];
  const rockMat = rockMaterial(tex, M);
  const spatterGeo = clinkerGeometry(51, 1, 0.2);
  const spat = [], hotSpat = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const bands = [];

  for (const rv of world.data.rivers) {
    if (rv.end !== 'skylight') continue;
    const P = rv.points;
    // ---- the vent: a spatter cone round a welling pool, throwing gobs of lava
    {
      const [x, y, z] = P[0];
      const pool = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40).rotateX(-Math.PI / 2), poolMat);
      pool.position.set(x, y + 0.18, z);
      group.add(pool);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), poolMat);
      dome.position.set(x, y + 0.1, z);
      group.add(dome);
      // agglutinated spatter on the cone: welded, rusty-black clots; some still glowing on the inner lip
      for (let k = 0; k < (lite ? 40 : 80); k++) {
        const a = rnd() * 6.3, d = 5 + Math.pow(rnd(), 0.7) * 8;
        const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
        const s = 0.18 + Math.pow(rnd(), 2.5) * 0.7;
        e.set((rnd() - 0.5) * 0.3, rnd() * 6.3, (rnd() - 0.5) * 0.3); q.setFromEuler(e);
        // flattened clots, splashed out where they landed
        sc.set(s * 1.5, s * 0.45, s * 1.2);
        p.set(sx, world.heightAt(sx, sz) - s * 0.3, sz);
        spat.push({ m: m4.compose(p, q, sc).clone(), c: rnd() < 0.4 ? [1.4, 0.75, 0.5] : [0.75, 0.7, 0.7] });
        if (d < 7.5 && rnd() < 0.5) hotSpat.push(m4.compose(tmp.set(sx, Math.max(world.heightAt(sx, sz), y) + 0.1, sz), q, sc.multiplyScalar(0.45)).clone());
      }
      const v = { x, y, z, dome, next: 1 + rnd() * 2, well: 0, burst: 0, ph: rnd() * 10 };
      v.light = { x, y: y + 4, z, color: 0xff6a22, I: 900, range: 55, k: 1 };
      lights.push(v.light);
      vents.push(v);
    }
    // ---- the skylight: the stream pours into a hole in the roof of its tube
    {
      const n = P.length, [x, y, z] = P[n - 1], o = P[Math.max(0, n - 4)];
      const tx = x - o[0], tz = z - o[2], L = Math.hypot(tx, tz) || 1;
      const w = rv.width[n - 1];
      const cx = x + tx / L * w * 0.25, cz = z + tz / L * w * 0.25;
      const R = w * 0.62;
      const sink = new THREE.Mesh(new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2), sinkMat);
      sink.rotation.y = -Math.atan2(tz, tx); // uv x runs downstream
      sink.position.set(cx, y + 0.12, cz);
      sink.renderOrder = 2;
      group.add(sink);
      // the pit's walls glow orange from below
      const rw = Math.max(R + 1, wallRadius(world, cx, cz, y, 3, 30));
      let ring = 0;
      for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; ring += world.heightAt(cx + Math.cos(a) * (rw + 4), cz + Math.sin(a) * (rw + 4)) / 12; }
      const rimH = Math.max(6, Math.min(30, ring - y));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rw + 3, Math.max(R, rw - 2), rimH + 4, 32, 1, true), glowBandMaterial(0xff5a14, 0.55));
      band.position.set(cx, y + (rimH + 4) / 2 - 0.5, cz);
      band.renderOrder = 7;
      group.add(band);
      bands.push(band);
      // a ring of collapsed roof blocks round the rim
      const s = { x: cx, y, z: cz, R, rw, rimH, band, ph: rnd() * 10, acc: 0 };
      s.light = { x: cx, y: y + 2.5, z: cz, color: 0xff5a1c, I: 1200, range: 50, k: 1 };
      lights.push(s.light);
      skies.push(s);
    }
  }
  if (spat.length) {
    const im = new THREE.InstancedMesh(spatterGeo, rockMat, spat.length);
    spat.forEach((o, i) => { im.setMatrixAt(i, o.m); im.setColorAt(i, new THREE.Color(...o.c)); });
    im.castShadow = !lite; im.receiveShadow = true; im.computeBoundingSphere();
    group.add(im);
  }
  if (hotSpat.length) {
    const hm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.55, 0.08) });
    const im = new THREE.InstancedMesh(spatterGeo, hm, hotSpat.length);
    hotSpat.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---- the crater: its walls lit orange by the lake, gas and steam pouring off it, bursts on the lake
  const lk = world.data.lake, cr = world.data.crater;
  let crater = null;
  if (lk) {
    const ly = lk.y + 1;
    const r0 = wallRadius(world, lk.x, lk.z, ly, 4, lk.r + 90);
    const r1 = wallRadius(world, lk.x, lk.z, ly, 34, lk.r + 140);
    const h = 44;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r1 + 4, r0 - 2, h, 72, 1, true), glowBandMaterial(0xff4a10, 0.16));
    band.position.set(lk.x, ly + h / 2 - 1, lk.z);
    band.renderOrder = 7;
    group.add(band);
    bands.push(band);
    crater = { ...lk, ly, r0, band, accGas: 0, next: 0.5 };
    crater.light = { x: lk.x, y: ly + 20, z: lk.z, color: 0xff5014, I: 14000, range: 380, k: 1 };
    lights.push(crater.light);
    if (cr && (cr.x !== lk.x || cr.z !== lk.z)) {
      crater.pool = cr;
    }
  }

  // ---- fumaroles and steaming cracks over the crust; more beside the rivers
  const fum = [];
  const NF = lite ? 36 : 70;
  const tracks = world.data.tracks;
  for (let k = 0; fum.length < NF && k < NF * 30; k++) {
    let x, z;
    if (rnd() < 0.55) {
      const t = tracks[Math.floor(rnd() * tracks.length)], C = t.centre, i = Math.floor(rnd() * C.length);
      const c0 = C[i], c1 = C[Math.min(i + 1, C.length - 1)], tx = c1[0] - c0[0], tz = c1[2] - c0[2], L = Math.hypot(tx, tz) || 1;
      const lat = (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 90);
      x = c0[0] - tz / L * lat; z = c0[2] + tx / L * lat;
    } else {
      const rv = world.data.rivers[Math.floor(rnd() * world.data.rivers.length)], i = Math.floor(rnd() * rv.points.length);
      const pp = rv.points[i], pn = rv.points[Math.min(i + 1, rv.points.length - 1)], tx = pn[0] - pp[0], tz = pn[2] - pp[2], L = Math.hypot(tx, tz) || 1;
      const lat = (rnd() < 0.5 ? -1 : 1) * (rv.width[i] / 2 + 6 + rnd() * 30);
      x = pp[0] - tz / L * lat; z = pp[2] + tx / L * lat;
    }
    if (fx.trackGrid.dist(x, z, 14) < 13) continue;
    const dl = fx.lavaGrid.dist(x, z, 20);
    if (fx.lavaGrid.best && dl < fx.lavaGrid.best[2] + 3) continue;
    if (fx.masks.fresh(x, z) < 0.3 || world.heightAt(x, z) < 3) continue;
    if (fum.some((f) => Math.hypot(f.x - x, f.z - z) < 30)) continue;
    const crack = rnd() < 0.55, ang = rnd() * 6.3;
    fum.push({ x, z, y: world.heightAt(x, z), crack, ang, len: crack ? 5 + rnd() * 9 : 0, rate: 1.5 + rnd() * 2.5, acc: 0, size: 1 + rnd() * 1.6 });
  }
  if (fum.length) {
    const sm = new THREE.MeshBasicMaterial({ map: stainTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), sm, fum.length);
    fum.forEach((f, i) => {
      q.setFromAxisAngle(tmp.set(0, 1, 0), f.ang);
      sc.set(f.crack ? f.len * 1.3 + 3 : 5 + f.size * 2, 1, f.crack ? 3.5 : 5 + f.size * 2);
      im.setMatrixAt(i, m4.compose(p.set(f.x, f.y + 0.25, f.z), q, sc));
    });
    im.renderOrder = 1;
    im.computeBoundingSphere();
    group.add(im);
  }

  const wind = fx.wind;
  return {
    vents, skies, fum, crater,
    update(t, dt, cam) {
      sinkMat.uniforms.uTime.value = t;
      for (const b of bands) b.material.uniforms.uTime.value = t;
      const { steam, gob, glow } = fx;
      // vents: the pool wells up into a dome and bursts, flinging gobs that arc and fall back round the cone
      for (const v of vents) {
        const d = Math.hypot(v.x - cam.x, v.z - cam.z);
        v.next -= dt;
        v.well = Math.min(1, v.well + dt * 0.7);
        if (v.next <= 0) {
          v.next = 0.6 + rnd() * 2.2;
          v.burst = 1;
          v.well = 0;
          if (d < 700) {
            const nG = lite ? 10 : 22;
            for (let k = 0; k < nG; k++) {
              const a = rnd() * 6.3, sp = 1 + rnd() * 3.5;
              gob.emit(tmp.set(v.x + (rnd() - 0.5) * 2, v.y + 0.8, v.z + (rnd() - 0.5) * 2), vel.set(Math.cos(a) * sp, 7 + rnd() * 9, Math.sin(a) * sp), 0.12 + rnd() * 0.22, t, 1.6 + rnd() * 1.2, 1, 0.75, 0.55);
            }
            glow.emit(tmp.set(v.x, v.y + 1.5, v.z), vel.set(0, 2, 0), 3 + rnd() * 2, t, 0.8, 0.9, 0.6, 0.5);
            const c = 0.42 + rnd() * 0.1;
            steam.emit(tmp.set(v.x, v.y + 3, v.z), vel.set(wind.x * 2, 3 + rnd() * 2, wind.z * 2), 3 + rnd() * 2, t, 6 + rnd() * 3, c, c * 0.97, c * 0.95);
          }
        }
        v.burst = Math.max(0, v.burst - dt * 2.5);
        const hh = 0.3 + v.well * 1.3 + Math.sin(t * 5 + v.ph) * 0.08;
        v.dome.scale.set(1.8 + v.well * 0.8, hh, 1.8 + v.well * 0.8);
        v.light.k = 0.75 + v.burst * 0.9 + Math.sin(t * 9 + v.ph) * 0.08;
        // a thin fume off the cone
        if (d < 450) {
          v.acc = (v.acc || 0) + dt * 1.2;
          while (v.acc > 1) {
            v.acc -= 1;
            const c = 0.5;
            steam.emit(tmp.set(v.x + (rnd() - 0.5) * 6, v.y + 2, v.z + (rnd() - 0.5) * 6), vel.set(wind.x * 1.5, 2 + rnd() * 2, wind.z * 1.5), 2.5 + rnd() * 2, t, 7, c, c * 0.98, c * 0.92);
          }
        }
      }
      // skylights: hot fume glowing orange as it rises out of the hole; spatter where the lava tumbles in
      for (const s of skies) {
        const d = Math.hypot(s.x - cam.x, s.z - cam.z);
        const fl = 0.85 + 0.15 * Math.sin(t * 3.1 + s.ph) * Math.sin(t * 1.7 + s.ph * 2);
        s.light.k = fl;
        s.band.material.uniforms.uPulse.value = fl;
        if (d > 600) continue;
        s.acc += dt * (lite ? 2.5 : 5);
        while (s.acc > 1) {
          s.acc -= 1;
          const a = rnd() * 6.3, r = rnd() * s.R * 0.6;
          const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
          if (rnd() < 0.5) {
            // heat-lit fume: orange low down, the sun takes over as it rises
            steam.emit(tmp.set(x, s.y + 1, z), vel.set(wind.x, 3.5 + rnd() * 2.5, wind.z), 2.5 + rnd() * 2.5, t, 5 + rnd() * 2, 1.0, 0.6, 0.42);
          } else {
            glow.emit(tmp.set(x, s.y + 1.5, z), vel.set(0, 2 + rnd() * 2, 0), 3 + rnd() * 3, t, 1.2 + rnd() * 0.8, 0.35, 0.18, 0.1);
          }
          if (rnd() < 0.25) for (let k = 0; k < 5; k++) gob.emit(tmp.set(x, s.y + 0.4, z), vel.set((rnd() - 0.5) * 3, 3 + rnd() * 4, (rnd() - 0.5) * 3), 0.1 + rnd() * 0.12, t, 0.9 + rnd() * 0.5, 1, 0.8, 0.6);
        }
      }
      // the crater lake: gas and steam pour off it, spattering bursts now and then
      if (crater) {
        const d = Math.hypot(crater.x - cam.x, crater.z - cam.z);
        crater.light.k = 0.85 + 0.12 * Math.sin(t * 0.8) + (crater.flash || 0);
        crater.flash = Math.max(0, (crater.flash || 0) - dt * 1.5);
        if (d < 1500) {
          crater.accGas += dt * (lite ? 1 : 2);
          while (crater.accGas > 1) {
            crater.accGas -= 1;
            const a = rnd() * 6.3, r = Math.sqrt(rnd()) * crater.r0 * 0.9;
            const x = crater.x + Math.cos(a) * r, z = crater.z + Math.sin(a) * r;
            // blue-grey sulphurous gas, lit orange from beneath near the lake
            const c = 0.55 + rnd() * 0.15;
            steam.emit(tmp.set(x, crater.ly + 2, z), vel.set(wind.x * 3, 7 + rnd() * 5, wind.z * 3), 4 + rnd() * 4, t, 9 + rnd() * 5, c * 0.95, c * 0.9, c * 0.86);
          }
          crater.next -= dt;
          if (crater.next <= 0 && d < 900) {
            crater.next = 1 + rnd() * 2.5;
            const a = rnd() * 6.3, r = Math.sqrt(rnd()) * crater.r0 * 0.8;
            const x = crater.x + Math.cos(a) * r, z = crater.z + Math.sin(a) * r;
            const big = rnd() < 0.3;
            for (let k = 0; k < (big ? 40 : 16); k++) {
              const b = rnd() * 6.3, sp = rnd() * (big ? 6 : 3);
              gob.emit(tmp.set(x, crater.ly + 0.5, z), vel.set(Math.cos(b) * sp, (big ? 10 : 6) + rnd() * (big ? 14 : 7), Math.sin(b) * sp), 0.25 + rnd() * 0.4, t, 2 + rnd() * 1.5, 1, 0.75, 0.5);
            }
            glow.emit(tmp.set(x, crater.ly + 2, z), vel.set(0, 3, 0), big ? 12 : 6, t, 1.2, 0.9, 0.55, 0.35);
            if (big) crater.flash = 0.6;
          }
        }
      }
      // fumaroles: steam wisps, curling downwind; the cracks breathe along their length
      for (const f of fum) {
        const d = Math.hypot(f.x - cam.x, f.z - cam.z);
        if (d > 420) continue;
        f.acc += dt * f.rate * (d < 200 ? 1 : 0.5);
        while (f.acc > 1) {
          f.acc -= 1;
          const u = f.crack ? (rnd() - 0.5) * f.len : 0;
          const x = f.x + Math.cos(f.ang) * u + (rnd() - 0.5), z = f.z + Math.sin(f.ang) * u + (rnd() - 0.5);
          const c = 0.8 + rnd() * 0.15;
          steam.emit(tmp.set(x, world.heightAt(x, z) + 0.3, z), vel.set(wind.x * (0.8 + rnd()), 1.2 + rnd() * 1.8, wind.z * (0.8 + rnd())), f.size * (0.6 + rnd() * 0.5), t, 5 + rnd() * 3, c, c, c * 0.97);
        }
      }
    },
  };
}

