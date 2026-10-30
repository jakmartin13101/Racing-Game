import * as THREE from 'three';
import { Spray, SURF, surfOff, waveAmp, findSky, waterTextures, wheelSpray } from './ocean.js';

// Fresh water on Kai'ele: the Wailele river and the creek (with its ford), the 60 m falls with its plunge pool,
// mist and rainbow, and the blowhole on the Kahakai lava-rock point.
//  - Rivers are ribbons a little wider than the channel; the water's own depth over the terrain sets how clear it
//    is, so the banks come out clear and shallow and the channel deep green. Normals and foam slide downstream in
//    two cross-faded phases (as the lava does in world.js), faster where it is steep and in the gorge, with white
//    water breaking over rocks where it runs fast and shallow.
//  - The falls: a curtain on the real ballistic arc off the lip, streaked and torn as it accelerates, a churning
//    pool where it lands, and mist drifting downstream through the gorge (the jump flies through it).

const tierOf = (q) => q.ultra ? 3 : !q.aiLod ? 2 : q.terrainStep >= 4 ? 0 : 1;

const SKY = /* glsl */`
uniform sampler2D tSky; uniform float uSkyInt; uniform vec3 uHaze;
vec3 skyCol(vec3 d) {
  d.y = max(d.y, 0.0);
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 c = texture2D(tSky, uv).rgb * uSkyInt;
  float h = smoothstep(-0.04, 0.1, d.y);
  return min(mix(uHaze, c, h * h * (3.0 - 2.0 * h) * 0.7 + 0.3 * h), vec3(3.0));
}
// GGX, capped: a mirror-sharp glint must stay inside half-float range or the bloom turns it into a black hole
float ggx(float NH, float r) { float a = r * r, d = NH * NH * (a * a - 1.0) + 1.0; return min(a * a / (3.14159 * d * d), 400.0); }
`;
const PREMUL = {
  transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};

export function buildFreshWater(ctx) {
  const { world, scene, quality, sun, M } = ctx;
  const tier = tierOf(quality);
  const Wd = world.data.water;
  const T = waterTextures();
  const skyU = findSky(scene);
  const sunCol = new THREE.Vector3(1, 0.96, 0.88).multiplyScalar(ctx.sunLight?.intensity ?? 3);
  const fogU = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const common = {
    uTime: { value: 0 }, tNC: { value: T.nc }, tFoam: { value: T.foam }, tNoise: { value: M.noise },
    tSky: { value: skyU?.tSky.value ?? null }, uSkyInt: skyU?.uInt ?? { value: 0.85 }, uHaze: { value: ctx.fog.color },
    uSun: { value: sun.clone() }, uSunCol: { value: sunCol }, ...fogU,
  };
  const group = new THREE.Group();
  scene.add(group);
  const updates = [];
  const F = Wd.falls;
  const pool = F?.pool;

  // ---------------------------------------------------------------- the falls' lip
  // march along the flow from upstream until the ground drops away
  let lip = null;
  if (F) {
    const [dx, dz] = F.dir;
    let last = null;
    for (let s = -60; s < 40; s += 0.25) {
      const x = F.x + dx * s, z = F.z + dz * s;
      if (world.heightAt(x, z) >= F.top - 2.5) last = { x, z, s };
      else if (last) break;
    }
    lip = last || { x: F.x, z: F.z, s: 0 };
  }

  // ---------------------------------------------------------------- rivers
  // split a polyline into reaches the water can really lie in: not hanging in the air, not buried (where the
  // ground has not been cut for it yet), and cut at the falls' lip and around the plunge pool
  const reaches = [];
  const addRiver = (rv, isRiver) => {
    const pts = rv.points;
    let cur = [];
    const flush = () => { if (cur.length > 2) reaches.push({ pts: cur, river: isRiver }); cur = []; };
    for (let i = 0; i < pts.length; i++) {
      const [x, y, z] = pts[i];
      const hc = world.heightAt(x, z);
      let ok = y - hc < 2.6 && hc - y < 2.5;
      if (isRiver && lip) {
        const along = (x - F.x) * F.dir[0] + (z - F.z) * F.dir[1];
        // upstream of the lip: stop at it; over the drop: nothing; the pool covers the landing
        if (y > F.bottom + 20 && along > lip.s) { if (cur.length) { const p = cur[cur.length - 1]; cur.push({ x: lip.x, y: p.y, z: lip.z, w: p.w, lip: true }); } ok = false; }
        if (pool && Math.hypot(x - pool.x, z - pool.z) < pool.r - 4) ok = false;
      }
      if (y < 0.25) ok = false; // into the sea
      if (!ok) { flush(); continue; }
      // the water never sits below the bed (the ford crosses a raised road)
      cur.push({ x, y: Math.max(y, hc + 0.32), z, w: rv.width[i] });
    }
    flush();
  };
  if (Wd.river) addRiver(Wd.river, true);
  if (Wd.creek) addRiver(Wd.creek, false);

  const across = tier === 0 ? 6 : tier === 1 ? 10 : 14;
  const riverU = { ...common, uPool: { value: pool ? new THREE.Vector3(pool.x, pool.z, pool.r) : new THREE.Vector3(0, 0, -1) } };
  const riverMat = new THREE.ShaderMaterial({
    ...PREMUL, depthWrite: false, fog: true, uniforms: riverU,
    defines: { TIER: tier },
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 flow; // across -1..1, speed m/s, depth m, white water (rapids, lip, gorge)
      varying vec4 vFlow; varying vec2 vUv; varying vec3 vW;
      void main() {
        vFlow = flow; vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform sampler2D tNC, tFoam, tNoise; uniform vec3 uSun, uSunCol, uPool;
      varying vec4 vFlow; varying vec2 vUv; varying vec3 vW;
      ${SKY}
      void main() {
        if (uPool.z > 0.0 && length(vW.xz - uPool.xy) < uPool.z - 3.0) discard;
        float a = vFlow.x, depth = vFlow.z;
        // fastest down the middle, dragging at the banks
        float spd = vFlow.y * (1.0 - 0.55 * a * a);
        float P = 2.4, f0 = fract(uTime / P), f1 = fract(uTime / P + 0.5);
        float wB = abs(1.0 - 2.0 * f0);
        vec2 uA = vUv - vec2(spd * f0 * P, 0.0), uB = vUv - vec2(spd * f1 * P, 0.0) + vec2(3.1, 1.7);
        vec2 nA = texture2D(tNC, uA / vec2(7.0, 4.5)).rg * 2.0 - 1.0, nB = texture2D(tNC, uB / vec2(7.0, 4.5)).rg * 2.0 - 1.0;
        vec2 nn = mix(nA, nB, wB);
        #if TIER > 0
        vec2 mA = texture2D(tNC, uA / vec2(2.6, 1.9)).rg * 2.0 - 1.0, mB = texture2D(tNC, uB / vec2(2.6, 1.9)).rg * 2.0 - 1.0;
        nn = nn * 0.65 + mix(mA, mB, wB) * 0.45;
        #endif
        float rough = 0.25 + 0.12 * min(spd, 6.0) + vFlow.w * 0.6;
        // rocks under the surface: a fixed noise field; the water humps and breaks white over and behind them
        float rk = texture2D(tNoise, vUv / vec2(13.0, 5.0)).r;
        float rocks = smoothstep(0.56, 0.74, rk + (1.0 - smoothstep(0.1, 0.8, depth)) * 0.12);
        float ww = clamp(rocks * smoothstep(1.6, 4.5, spd) + vFlow.w + smoothstep(0.35, 0.05, depth) * smoothstep(1.5, 4.0, spd) * 0.5, 0.0, 1.5);
        vec3 fA = texture2D(tFoam, uA / vec2(5.0, 2.2)).rgb, fB = texture2D(tFoam, uB / vec2(5.0, 2.2)).rgb;
        vec3 ft = mix(fA, fB, wB);
        float fpat = ft.r * 0.6 + ft.g * 0.6;
        float foam = clamp(ww * 1.2 - (1.0 - fpat) * 1.1, 0.0, 1.0);
        // flow is along u: tangent space -> world from the screen derivatives of the uv
        vec3 dpx = dFdx(vW), dpy = dFdy(vW); vec2 dux = dFdx(vUv), duy = dFdy(vUv);
        vec3 Tg = normalize(dpx * duy.y - dpy * dux.y + 1e-6); vec3 Bt = normalize(cross(vec3(0.0, 1.0, 0.0), Tg));
        float str = (0.18 + 0.05 * min(spd, 6.0) + ww * 0.25);
        vec3 N = normalize(vec3(0.0, 1.0, 0.0) + (Tg * nn.x + Bt * nn.y) * str);
        vec3 V = normalize(cameraPosition - vW);
        float NV = max(dot(N, V), 1e-3);
        float Fr = min(0.02 + 0.98 * pow(1.0 - NV, 5.0), 0.35);
        vec3 Rr = reflect(-V, N); Rr.y = max(Rr.y, 0.0) * 0.75 + 0.1;
        vec3 sky = skyCol(normalize(Rr)) * 0.85;
        vec3 H = normalize(V + uSun);
        vec3 spec = uSunCol * ggx(max(dot(N, H), 0.0), clamp(rough * 0.35, 0.06, 0.4)) * Fr * 0.25 / max(NV, 0.2) * max(dot(N, uSun), 0.0);
        // clear at the edges, jade green in the channel
        float alpha = 1.0 - exp(-max(depth, 0.0) * 1.1);
        vec3 amb = vec3(0.45, 0.55, 0.65) * 0.5;
        vec3 body = mix(vec3(0.05, 0.2, 0.15), vec3(0.01, 0.06, 0.05), smoothstep(0.3, 2.0, depth)) * (amb + uSunCol * 0.15 * max(uSun.y, 0.0));
        vec3 col = (1.0 - Fr) * body * alpha + Fr * sky + spec * (1.0 - foam);
        float al = (1.0 - Fr) * alpha + Fr;
        vec3 foamCol = vec3(0.86, 0.9, 0.9) * (amb * 1.4 + uSunCol * 0.3 * max(dot(N, uSun), 0.2));
        col = mix(col, foamCol, foam); al = mix(al, 1.0, foam);
        // soft edges: depth at the waterline and the ribbon's own sides
        float e = smoothstep(0.02, 0.3, depth) * (1.0 - smoothstep(0.92, 1.28, abs(a)));
        gl_FragColor = vec4(col * e, al * e);
        #ifdef USE_FOG
        #include <fog_fragment>
        #endif
      }`,
  });
  riverMat.userData.wx = false;
  // centre samples of every reach, for trucks driving through the water
  const wetPts = [];
  for (const R of reaches) {
    const pts = R.pts, n = pts.length;
    // smooth the level so the surface steps gently down from point to point
    const ys = pts.map((p, i) => {
      let s = 0, w = 0;
      for (let k = -2; k <= 2; k++) { const q = pts[Math.min(Math.max(i + k, 0), n - 1)]; s += q.y; w += 1; }
      return Math.max(s / w, p.y - 0.15);
    });
    const verts = [], uvs = [], flow = [], idx = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, n - 1)], o = pts[Math.max(i - 1, 0)];
      const tx = q.x - o.x, tz = q.z - o.z, L = Math.hypot(tx, tz) || 1;
      const nx = -tz / L, nz = tx / L;
      const hw = p.w * 0.5, ext = hw + 3.5;
      const drop = Math.max(0, (o.y - q.y) / L);
      let spd = THREE.MathUtils.clamp(1.1 + drop * 70, 1.1, 7.5);
      let white = 0;
      const toLip = p.lip ? 0 : (lip && R.river && pts[n - 1].lip ? Math.hypot(p.x - lip.x, p.z - lip.z) : 1e9);
      // speeding up over the last stretch before the lip, breaking white right at it
      if (toLip < 40) { spd *= 1 + 1.8 * (1 - toLip / 40); white = Math.max(white, THREE.MathUtils.smoothstep(12 - toLip, 0, 12) * 0.8); }
      // the gorge below the falls: fast and broken
      if (pool && R.river && p.y < pool.y + 2 && p.y > pool.y - 18) {
        const dp = Math.hypot(p.x - pool.x, p.z - pool.z);
        if (dp < 260) { spd *= 1.6; white = Math.max(white, (1 - dp / 260) * 0.45 + 0.08); }
        if (dp < pool.r + 18) white = Math.max(white, 0.6 * (1 - (dp - pool.r) / 18));
      }
      for (let j = 0; j <= across; j++) {
        const a = (j / across) * 2 - 1;
        const x = p.x + nx * a * ext, z = p.z + nz * a * ext;
        // inside the channel the water follows the bed wherever the ground has not been cut down for it (a shallow
        // run over flat ground, the ford over the road); on the banks it keeps its level and fades out by depth
        const h = world.heightAt(x, z), inC = Math.abs(a * ext) <= hw;
        const y = inC ? Math.max(ys[i], h + 0.12) : ys[i];
        const dep = inC ? Math.max(ys[i] - h, 0.42 * (1 - (a * ext / hw) ** 2) ** 1.5) : ys[i] - h;
        verts.push(x, y, z);
        uvs.push(s, a * ext);
        flow.push(a * ext / hw, spd, dep, white);
      }
      wetPts.push({ x: p.x, z: p.z, y: ys[i], hw, spd });
      if (i < n - 1) s += Math.hypot(q.x - p.x, q.z - p.z);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, riverMat);
    m.renderOrder = 3;
    group.add(m);
  }

  // ---------------------------------------------------------------- the falls
  let impact = null, mist = null, lipY = 0;
  const poolU = {};
  if (F && lip) {
    const up = reaches.find((r) => r.river && r.pts[r.pts.length - 1].lip);
    lipY = up ? up.pts[up.pts.length - 1].y : F.top;
    const baseY = pool ? pool.y : F.bottom;
    const drop = lipY - baseY;
    const [dx, dz] = F.dir;
    const px = -dz, pz = dx; // across the curtain
    const v0 = 2.6, g = 9.81, Tf = Math.sqrt(2 * drop / g);
    impact = new THREE.Vector3(lip.x + dx * v0 * Tf, baseY, lip.z + dz * v0 * Tf);
    const width = F.width;
    const NX = tier === 0 ? 10 : 26, NY = tier === 0 ? 18 : 48;
    const mkSheet = (back, seed) => {
      const verts = [], uvs = [], idx = [];
      for (let j = 0; j <= NY; j++) {
        const fy = j / NY;
        const t = Tf * Math.sqrt(fy); // even in fall distance
        const fall = 0.5 * g * t * t;
        for (let i = 0; i <= NX; i++) {
          const fx = i / NX - 0.5;
          // the curtain spreads as it falls, bulges at its middle and is ragged along its edge
          const spread = 1 + 0.28 * fy;
          const wob = Math.sin(fx * 9.1 + seed) * 0.5 + Math.sin(fx * 23.0 + seed * 2.0) * 0.25;
          const out = v0 * t * (1 + 0.15 * (1 - 4 * fx * fx)) + wob * fy * 1.2 - back;
          verts.push(lip.x + px * fx * width * spread + dx * out, lipY - fall + 0.05, lip.z + pz * fx * width * spread + dz * out);
          uvs.push(fx + 0.5, fall);
        }
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };
    const fallsU = { ...common, uDrop: { value: drop }, uWidth: { value: width } };
    const fallsMat = new THREE.ShaderMaterial({
      ...PREMUL, depthWrite: false, side: THREE.DoubleSide, fog: true, uniforms: fallsU,
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        varying vec2 vUv; varying vec3 vW, vN;
        void main() {
          vUv = uv; vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime, uDrop, uWidth, uSeed; uniform sampler2D tFoam, tNC; uniform vec3 uSun, uSunCol;
        varying vec2 vUv; varying vec3 vW, vN;
        ${SKY}
        void main() {
          float d = vUv.y, x = vUv.x;
          float fy = d / uDrop;
          // water accelerates as it falls: the streak pattern runs at the local speed, sqrt(2 g d)
          float v = sqrt(2.0 * 9.81 * max(d, 0.3));
          float s1 = texture2D(tFoam, vec2((d - uTime * v * 0.9) / 11.0 + uSeed, x * uWidth / 3.2)).g;
          float s2 = texture2D(tFoam, vec2((d - uTime * v * 0.7) / 5.0 + 0.37 + uSeed, x * uWidth / 1.6 + 0.2)).g;
          float bub = texture2D(tFoam, vec2(x * uWidth / 4.0, (d - uTime * v * 0.8) / 4.0 + uSeed)).r;
          // clinging glassy water over the lip, aerated white curtain lower down, torn into gaps near the bottom
          float aer = smoothstep(0.0, 0.25, fy);
          float streak = max(s1, s2 * 0.8);
          float edge = 1.0 - smoothstep(0.36, 0.5, abs(x - 0.5) + (bub - 0.5) * 0.12 + fy * 0.03);
          float gaps = smoothstep(0.45, 0.9, fy) * (1.0 - smoothstep(0.2, 0.55, bub * 0.6 + streak * 0.6));
          float a = clamp(mix(0.82, 0.55 + streak * 0.55 + bub * 0.25, aer) - gaps * 0.6, 0.0, 1.0) * edge;
          vec3 V = normalize(cameraPosition - vW);
          vec3 N = normalize(vN * (gl_FrontFacing ? 1.0 : -1.0));
          float NL = max(dot(N, uSun), 0.0);
          vec3 amb = vec3(0.45, 0.55, 0.65) * 0.55;
          vec3 white = vec3(0.88, 0.92, 0.94) * (amb * 1.3 + uSunCol * (0.18 + 0.28 * NL));
          // light through the thin aerated sheet when the sun is behind it
          white += uSunCol * 0.12 * pow(max(dot(-V, uSun), 0.0), 4.0);
          float Fr = 0.02 + 0.98 * pow(1.0 - max(abs(dot(N, V)), 1e-3), 5.0);
          vec3 glass = vec3(0.04, 0.12, 0.1) * (amb + uSunCol * 0.2) + skyCol(reflect(-V, N)) * Fr;
          float lipFoam = smoothstep(1.8, 0.2, d) * 0.5 + streak * 0.3 * (1.0 - aer);
          vec3 col = mix(glass, white, clamp(aer * (0.55 + streak * 0.6) + lipFoam, 0.0, 1.0));
          // ropes of denser water read brighter, the thin sheet between them darker
          col *= 0.7 + 0.55 * max(streak, bub * 0.6) * aer + (1.0 - aer) * 0.3;
          gl_FragColor = vec4(col * a, a);
          #ifdef USE_FOG
          #include <fog_fragment>
          #endif
        }`,
    });
    fallsMat.userData.wx = false;
    const sheets = [[0, 0.0, 0]];
    if (tier > 0) sheets.push([0.9, 2.7, 0.43]);
    for (const [back, seed, s] of sheets) {
      const mat = s ? fallsMat.clone() : fallsMat;
      if (s) { mat.uniforms = { ...fallsU, uSeed: { value: s } }; mat.userData.wx = false; } else fallsU.uSeed = { value: 0 };
      const m = new THREE.Mesh(mkSheet(back, seed), mat);
      m.renderOrder = 4;
      group.add(m);
    }

    // ---- plunge pool: a disc of water churned white round the landing, rings and boils spreading out from it
    if (pool) {
      const RN = tier === 0 ? 10 : 22, AN = tier === 0 ? 32 : 72;
      const verts = [], dep = [], idx = [];
      for (let j = 0; j <= RN; j++) {
        const r = (j / RN) * pool.r;
        for (let i = 0; i < AN; i++) {
          const t = (i / AN) * Math.PI * 2;
          const x = pool.x + Math.cos(t) * r, z = pool.z + Math.sin(t) * r;
          verts.push(x, pool.y, z);
          dep.push(pool.y - world.heightAt(x, z), j / RN);
        }
      }
      for (let j = 0; j < RN; j++) for (let i = 0; i < AN; i++) {
        const a = j * AN + i, b = j * AN + (i + 1) % AN, c = a + AN, d = b + AN;
        idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('dep', new THREE.Float32BufferAttribute(dep, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      Object.assign(poolU, common, { uImpact: { value: impact }, uW: { value: width } });
      const poolMat = new THREE.ShaderMaterial({
        ...PREMUL, depthWrite: false, fog: true, uniforms: poolU,
        vertexShader: /* glsl */`
          #include <common>
          #include <fog_pars_vertex>
          attribute vec2 dep; varying vec2 vDep; varying vec3 vW;
          void main() {
            vDep = dep;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vW = wp.xyz;
            vec4 mvPosition = viewMatrix * wp;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */`
          #include <common>
          #include <fog_pars_fragment>
          uniform float uTime, uW; uniform sampler2D tFoam, tNC; uniform vec3 uSun, uSunCol, uImpact;
          varying vec2 vDep; varying vec3 vW;
          ${SKY}
          void main() {
            vec2 rel = vW.xz - uImpact.xz;
            float d = length(rel);
            vec2 dir = rel / max(d, 0.01);
            // the curtain lands along a line, not a point: distance to that line
            float dl = max(0.0, length(vec2(max(abs(rel.x) - uW * 0.5, 0.0), rel.y)));
            float churn = exp(-dl / 7.0);
            // boils and foam spreading outwards from the landing
            vec2 outw = dir * uTime * 1.6;
            vec3 ft = texture2D(tFoam, vW.xz / 6.0 - outw / 6.0).rgb;
            vec3 ft2 = texture2D(tFoam, vW.xz / 13.0 - outw / 13.0 * 0.6 + 0.3).rgb;
            float rings = 0.5 + 0.5 * sin((dl - uTime * 2.4) * 1.3 + ft2.r * 3.0);
            float fa = churn * 1.4 + exp(-dl / 16.0) * rings * 0.45 + ft2.g * 0.25 * exp(-dl / 22.0);
            float foam = clamp(fa * 1.2 - (1.0 - (ft.r * 0.7 + ft2.r * 0.5)), 0.0, 1.0);
            vec2 nn = texture2D(tNC, vW.xz / 4.0 - outw / 4.0).rg * 2.0 - 1.0;
            vec2 nn2 = texture2D(tNC, vW.xz / 11.0 + vec2(uTime * 0.02, 0.0)).rg * 2.0 - 1.0;
            vec3 N = normalize(vec3(0.0, 1.0, 0.0) + vec3(nn.x, 0.0, nn.y) * (0.15 + churn * 0.6) + vec3(nn2.x, 0.0, nn2.y) * 0.15);
            vec3 V = normalize(cameraPosition - vW);
            float NV = max(dot(N, V), 1e-3);
            float Fr = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
            vec3 H = normalize(V + uSun);
            vec3 spec = uSunCol * ggx(max(dot(N, H), 0.0), 0.12) * Fr * 0.25 / max(NV, 0.2) * max(dot(N, uSun), 0.0);
            float depth = vDep.x;
            float alpha = 1.0 - exp(-max(depth, 0.0) * 0.9);
            vec3 amb = vec3(0.45, 0.55, 0.65) * 0.5;
            vec3 body = mix(vec3(0.05, 0.22, 0.17), vec3(0.008, 0.05, 0.045), smoothstep(0.5, 3.0, depth)) * (amb + uSunCol * 0.15);
            vec3 col = (1.0 - Fr) * body * alpha + Fr * skyCol(reflect(-V, N)) + spec * (1.0 - foam);
            float a = (1.0 - Fr) * alpha + Fr;
            vec3 foamCol = vec3(0.88, 0.92, 0.93) * (amb * 1.4 + uSunCol * 0.3);
            col = mix(col, foamCol, foam); a = mix(a, 1.0, foam);
            float e = smoothstep(0.0, 0.15, depth) * (1.0 - smoothstep(0.9, 1.0, vDep.y));
            gl_FragColor = vec4(col * e, a * e);
            #ifdef USE_FOG
            #include <fog_fragment>
            #endif
          }`,
      });
      poolMat.userData.wx = false;
      const pm = new THREE.Mesh(geo, poolMat);
      pm.renderOrder = 3;
      group.add(pm);
    }

    // ---- mist: big slow puffs boiling up off the landing and drifting down the gorge, with the rainbow in them
    const downstream = new THREE.Vector3(dx, 0, dz).multiplyScalar(3.2);
    mist = new Spray(M, { max: tier === 0 ? 60 : 170, sun, sunCol, wind: downstream, rainbow: true, tint: [0.9, 0.93, 0.95], fog: ctx.fog });
    group.add(mist.mesh);
    const rate = tier === 0 ? 2 : 6, churnRate = tier === 0 ? 3 : 10;
    const rnd = Math.random;
    const emitMist = (t) => {
      const ox = (rnd() - 0.5) * width, oz = (rnd() - 0.3) * 8;
      const a = rnd() * Math.PI * 2;
      mist.emit(t, impact.x + px * ox + dx * oz, impact.y + 1 + rnd() * 3, impact.z + pz * ox + dz * oz,
        Math.cos(a) * (2 + rnd() * 4), 3 + rnd() * 5, Math.sin(a) * (2 + rnd() * 4),
        4 + rnd() * 4, 16 + rnd() * 9, { drag: 0.45, grow: 0.22, opacity: 0.16 + rnd() * 0.08, gravity: -0.035 });
    };
    const emitChurn = (t) => {
      const ox = (rnd() - 0.5) * width * 1.1;
      mist.emit(t, impact.x + px * ox, impact.y + 0.5, impact.z + pz * ox,
        (rnd() - 0.5) * 9, 4 + rnd() * 9, (rnd() - 0.5) * 9, 1.5 + rnd() * 2.5, 2.5 + rnd() * 2, { drag: 1.1, grow: 1.3, opacity: 0.45, gravity: 0.5 });
    };
    // already hanging there on the first frame
    for (let k = 0; k < rate * 22; k++) emitMist(-rnd() * 22);
    let accM = 0, accC = 0;
    updates.push((t, dt, camera) => {
      const far = camera && camera.position.distanceTo(impact) > 2500;
      if (!far && dt > 0) {
        accM += rate * dt; accC += churnRate * dt;
        while (accM > 1) { accM -= 1; emitMist(t); }
        while (accC > 1) { accC -= 1; emitChurn(t); }
      }
      mist.update(t);
    });
  }

  // ---------------------------------------------------------------- the blowhole
  // a lava tube under the Kahakai point: when a big wave surges into it, spray bursts out of the rock, roars up
  // twenty metres and drifts over the road
  const bh = Wd.blowhole || { x: -1270, z: 1555 };
  const bhY = world.heightAt(bh.x, bh.z) + 0.3;
  const kaTrack = ctx.tracks?.find((t) => t.id === 'kahakai');
  let toRoad = new THREE.Vector3(0.5, 0, -0.85);
  if (kaTrack) {
    const nr = kaTrack.nearest({ x: bh.x, z: bh.z });
    const c = kaTrack.at(nr.i);
    toRoad.set(c[0] - bh.x, 0, c[2] - bh.z).normalize();
  }
  const blow = new Spray(M, { max: tier === 0 ? 90 : 260, sun, sunCol, wind: toRoad.clone().multiplyScalar(3.5), rainbow: true, fog: ctx.fog });
  group.add(blow.mesh);
  let lastN = null, burstT = -1;
  const burst = (t) => {
    const rnd = Math.random, n = tier === 0 ? 30 : 80;
    for (let k = 0; k < n; k++) {
      const te = t + rnd() * 0.7;
      // the column: jets of droplets
      blow.emit(te, bh.x + (rnd() - 0.5) * 1.5, bhY, bh.z + (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 5 + toRoad.x * 1.5, 13 + rnd() * 12, (rnd() - 0.5) * 5 + toRoad.z * 1.5,
        1.4 + rnd() * 2, 2.6 + rnd() * 1.6, { drag: 0.5, grow: 1.8, opacity: 0.7, gravity: 1 });
    }
    for (let k = 0; k < n * 0.4; k++) {
      const te = t + 0.2 + rnd() * 0.9;
      // and the cloud it leaves: big puffs carried over the road by the onshore breeze
      blow.emit(te, bh.x + (rnd() - 0.5) * 2, bhY + 2 + rnd() * 10, bh.z + (rnd() - 0.5) * 2,
        toRoad.x * (4 + rnd() * 5) + (rnd() - 0.5) * 3, 4 + rnd() * 8, toRoad.z * (4 + rnd() * 5) + (rnd() - 0.5) * 3,
        5 + rnd() * 5, 6 + rnd() * 3, { drag: 0.8, grow: 1.0, opacity: 0.5, gravity: 0.1 });
    }
  };
  updates.push((t, dt, camera) => {
    // fires on the bigger waves, a beat after the bore reaches this stretch of shore
    const psi = t / SURF.T + surfOff(bh.x, bh.z) - 0.06;
    const n = Math.floor(psi);
    if (lastN !== null && n !== lastN && waveAmp(n) > 0.72 && camera && camera.position.distanceTo(new THREE.Vector3(bh.x, bhY, bh.z)) < 1800) burst(t);
    if (lastN === null && waveAmp(n) > 0.72 && psi - n < 0.25) burst(t - (psi - n) * SURF.T);
    lastN = n;
    blow.update(t);
  });

  // ---------------------------------------------------------------- trucks in the river and the ford
  const cellOf = (x, z) => `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
  const grid = new Map();
  for (const p of wetPts) { const k = cellOf(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const riverDepth = (pos) => {
    let best = null, bd = Infinity;
    const cx = Math.floor(pos.x / 20), cz = Math.floor(pos.z / 20);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const p of grid.get(`${cx + i},${cz + j}`) || []) {
        const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (!best || Math.sqrt(bd) > best.hw + 1) return 0;
    // body centre sits about 0.9 m over the ground
    const ground = pos.y - 0.9;
    return THREE.MathUtils.clamp((best.y - ground + 0.05) / 0.45, 0, 1);
  };

  if (import.meta.env.DEV) window.__water = { reaches, lip, impact, group };
  return {
    riverDepth,
    update(t, dt, camera, race) {
      for (const u of [riverU, poolU, ...group.children.map((c) => c.material?.uniforms).filter(Boolean)]) {
        if (u.uTime) u.uTime.value = t;
        if (u.fogColor) { u.fogColor.value.copy(scene.fog?.color ?? ctx.fog.color); u.fogDensity.value = scene.fog?.density ?? ctx.fog.density; }
      }
      for (const f of updates) f(t, dt, camera);
      if (race && ctx.spray && dt > 0) for (const st of race.cars) {
        const w = riverDepth(st.v.group.position);
        if (w > 0.05) wheelSpray(ctx.spray, st.v, t, dt, Math.min(1, w * 1.3), tier);
      }
    },
  };
}
