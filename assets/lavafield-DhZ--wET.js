import{$n as e,$t as t,A as n,At as r,Bn as i,C as a,E as o,H as s,Jt as c,Lt as l,Mt as u,N as d,Ot as f,Q as p,V as m,Wn as h,at as g,br as _,bt as v,cr as y,ir as b,it as x,jt as S,o as C,q as w,qn as T,qt as E,rr as D,rt as O,sr as k,tt as A,u as j,v as M,w as N,x as P,y as F,yr as I,yt as L}from"./world-BTOCbtk8.js";import{i as R}from"./fx-Ca_oJzFL.js";var z=`./`,B=new b;function V(e,t=!1,n=!0){let r=B.load(`${z}textures/kaiele/${e}`);return n&&(r.wrapS=r.wrapT=i),r.anisotropy=8,t&&(r.colorSpace=h),r}async function H(e){let t=`${z}${e.dir||`world`}/lava_masks.png`,n=await new Promise(e=>{let n=new Image;n.onload=()=>e(n),n.onerror=()=>e(null),n.src=t}),r=n?n.width:1,i=new Uint8Array(1),a=new Uint8Array(1);if(n){let e=document.createElement(`canvas`);e.width=e.height=r;let t=e.getContext(`2d`,{willReadFrequently:!0});t.drawImage(n,0,0);let o=t.getImageData(0,0,r,r).data;i=new Uint8Array(r*r),a=new Uint8Array(r*r);for(let e=0,t=0;e<r*r;e++,t+=4)i[e]=o[t],a[e]=o[t+1]}let o=n?new D(n):new d(new Uint8Array([255,0,0,255]),1,1);o.needsUpdate=!0,o.wrapS=o.wrapT=N,o.minFilter=v,o.magFilter=L;let s=e.extent,c=e.half,l=(e,t,a)=>{if(!n)return+(e===i);let o=(t+c)/s*r-.5,l=(a+c)/s*r-.5,u=Math.max(0,Math.min(r-2,Math.floor(o))),d=Math.max(0,Math.min(r-2,Math.floor(l))),f=Math.min(1,Math.max(0,o-u)),p=Math.min(1,Math.max(0,l-d)),m=d*r+u;return((e[m]*(1-f)+e[m+1]*f)*(1-p)+(e[m+r]*(1-f)+e[m+r+1]*f)*p)/255};return{tex:o,fresh:(e,t)=>l(i,e,t),aa:(e,t)=>l(a,e,t)}}var ee=class{constructor(e,t=32){this.cell=t,this.map=new Map;for(let n of e){let e=`${Math.floor(n[0]/t)},${Math.floor(n[1]/t)}`,r=this.map.get(e);r||this.map.set(e,r=[]),r.push(n)}}dist(e,t,n){let r=this.cell,i=Math.ceil(n/r),a=Math.floor(e/r),o=Math.floor(t/r),s=n*n;this.best=null;for(let n=-i;n<=i;n++)for(let r=-i;r<=i;r++){let i=this.map.get(`${a+n},${o+r}`);if(i)for(let n of i){let r=(n[0]-e)**2+(n[1]-t)**2;r<s&&(s=r,this.best=n)}}return Math.sqrt(s)}};function U(e,t){let{half:n,extent:r,data:i}=e,a=Math.round(r/64),o=Math.max(e.res,t.terrainStep||3),s=64/Math.max(2,Math.round(64/o)),c=[];for(let e=-n;e<=n+1e-6;e+=s)c.push(e);let l=new Uint8Array(a*a);for(let e of i.tracks)for(let t=0;t<e.centre.length;t+=4){let r=e.centre[t][0],i=e.centre[t][2],o=Math.max(0,Math.floor((r-150+n)/64)),s=Math.min(a-1,Math.floor((r+150+n)/64)),c=Math.max(0,Math.floor((i-150+n)/64)),u=Math.min(a-1,Math.floor((i+150+n)/64));for(let e=c;e<=u;e++)for(let t=o;t<=s;t++){let o=Math.max(-n+t*64-r,0,r-(-n+(t+1)*64)),s=Math.max(-n+e*64-i,0,i-(-n+(e+1)*64));o*o+s*s<22500&&(l[e*a+t]=1)}}return{ax:c,az:c,ok:(e,t)=>{let r=Math.floor((e+n)/64),i=Math.floor((t+n)/64);return r>=0&&i>=0&&r<a&&i<a&&l[i*a+r]===1}}}function W(e,t){let n=0,r=e.length-1;if(t<=e[0])return 0;if(t>=e[r])return r-1;for(;r-n>1;){let i=n+r>>1;e[i]<=t?n=i:r=i}return n}function G(e){return e.data.rivers.map(e=>{let t=e.points,n=t.length,r=new Float32Array(n),i=new Float32Array(n);for(let e=0;e<n;e++){e&&(r[e]=r[e-1]+Math.hypot(t[e][0]-t[e-1][0],t[e][2]-t[e-1][2]));let a=t[Math.min(e+1,n-1)],o=t[Math.max(e-1,0)],s=(o[1]-a[1])/(Math.hypot(a[0]-o[0],a[2]-o[2])||1);i[e]=f.clamp(2.2+s*30,2.2,9)}return{rv:e,P:t,s:r,spd:i,len:r[n-1],sample:(a,o)=>{a=Math.max(0,Math.min(r[n-1]-.001,a));let s=0,c=n-1;for(;c-s>1;){let e=s+c>>1;r[e]<=a?s=e:c=e}let l=(a-r[s])/(r[c]-r[s]||1),u=t[s],d=t[c];o.x=u[0]+(d[0]-u[0])*l,o.y=u[1]+(d[1]-u[1])*l,o.z=u[2]+(d[2]-u[2])*l;let f=Math.hypot(d[0]-u[0],d[2]-u[2])||1;return o.tx=(d[0]-u[0])/f,o.tz=(d[2]-u[2])/f,o.w=(e.width[s]*(1-l)+e.width[c]*l)*.5,o.spd=i[s]*(1-l)+i[c]*l,o}}})}function K(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}var q=`
vec2 lfHash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float lfHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// cellular cracks: x = distance to the nearest cell border (approx F2 - F1), y = a per-cell random
vec2 lfCells(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = lfHash2(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = lfHash(n + g); } else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}
`;function te({world:e,quality:t,masks:n,trackGrid:r,lavaGrid:i,features:a,M:o,tex:s,group:c}){let l={low:45,medium:70,high:90,ultra:60}[t.name]??70,{ax:u,az:d,ok:f}=U(e,t),p=u.length,m=d.length,h=new Uint8Array(p*m),g=(e,t,n)=>{let r=W(u,e-n),i=W(u,e+n)+1,a=W(d,t-n),o=W(d,t+n)+1;for(let s=a;s<=o&&s<m-1;s++)for(let a=r;a<=i&&a<p-1;a++){let r=(u[a]+u[a+1])/2,i=(d[s]+d[s+1])/2;(r-e)**2+(i-t)**2<n*n&&(h[s*p+a]=1)}};for(let t of e.data.tracks){let e=t.centre;for(let t=0;t<e.length;t+=4)n.fresh(e[t][0],e[t][2])>.05&&g(e[t][0],e[t][2],l)}for(let e of a)g(e.x,e.z,e.r);let v=new Int32Array(p*m).fill(-1),b=[],x=[],C=[],T=[],E=new _,D=(t,o)=>{let s=o*p+t;if(v[s]>=0)return v[s];let c=u[t],f=d[o],m=e.heightAt(c,f);e.normalAt(c,f,E);let h=r.dist(c,f,90),g=h/l;for(let e of a)g=Math.min(g,Math.hypot(c-e.x,f-e.z)/e.r);let _=1-K(-2,16,i.dist(c,f,60)-(i.best?i.best[2]:0)),y=e.heightAt(c-14,f)-e.heightAt(c+14,f),S=e.heightAt(c,f-14)-e.heightAt(c,f+14),w=Math.hypot(y,S);w<.001?(y=0,S=1):(y/=w,S/=w);let D=b.length/3;return b.push(c,m,f),x.push(E.x,E.y,E.z),C.push(h,Math.min(g,1.5),_,n.fresh(c,f)),T.push(n.aa(c,f),y,S),v[s]=D,D},O=new Map,A=e.data.oceanEntry;for(let t=0;t<m-1;t++)for(let r=0;r<p-1;r++){if(!h[t*p+r])continue;let i=(u[r]+u[r+1])/2,a=(d[t]+d[t+1])/2;if(!f(i,a)||!(A&&Math.hypot(i-A.x,a-A.z)<260)&&n.fresh(i,a)<.04||e.heightAt(i,a)<-2.5)continue;let o=D(r,t),s=D(r+1,t),c=D(r,t+1),l=D(r+1,t+1),m=`${Math.floor(i/256)},${Math.floor(a/256)}`,g=O.get(m);g||O.set(m,g=[]),g.push(o,c,s,s,c,l)}let j=new w(b,3),M=new w(x,3),N=new w(C,4),P=new w(T,3),I=ne(o,s,e,l,t),L=0;for(let e of O.values()){let t=new Map,n=[],r=[],i=[],a=[],o=[];for(let s of e){let e=t.get(s);e===void 0&&(e=t.size,t.set(s,e),n.push(j.getX(s),j.getY(s),j.getZ(s)),r.push(M.getX(s),M.getY(s),M.getZ(s)),i.push(N.getX(s),N.getY(s),N.getZ(s),N.getW(s)),a.push(P.getX(s),P.getY(s),P.getZ(s))),o.push(e)}let s=new F;s.setAttribute(`position`,new w(n,3)),s.setAttribute(`normal`,new w(r,3)),s.setAttribute(`aux`,new w(i,4)),s.setAttribute(`aux2`,new w(a,3)),s.setIndex(t.size>65535?new y(o,1):new k(o,1)),s.computeBoundingSphere();let l=new S(s,I);l.receiveShadow=!0,l.renderOrder=.5,c.add(l),L+=o.length/3}return{mat:I,tris:L,chunks:O.size}}function ne(e,t,n,r,i){let a=new l({roughness:.5,metalness:0,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-1,polygonOffsetUnits:-1,envMapIntensity:.35}),o=n.data.oceanEntry||{x:1e6,z:1e6},s={uTime:{value:0},tNoise:{value:e.noise},tPah:{value:t.pahoehoe},tClA:{value:t.clinkerA},tClN:{value:t.clinkerN},tDetail:{value:e.detail},uD:{value:r},uHalfW:{value:7.5},uSea:{value:new _(o.x,0,o.z)},uSummit:{value:new I(n.data.crater?.x??0,n.data.crater?.z??0)}},c=!!i.aiLod;return a.onBeforeCompile=e=>{Object.assign(e.uniforms,s),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec4 aux; attribute vec3 aux2;
varying vec3 vW; varying vec3 vNw; varying vec4 vAux; varying vec3 vAux2;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vNw = normal; vAux = aux; vAux2 = aux2;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vW; varying vec3 vNw; varying vec4 vAux; varying vec3 vAux2;
uniform float uTime, uD, uHalfW; uniform vec3 uSea; uniform vec2 uSummit;
uniform sampler2D tNoise, tPah, tClA, tClN, tDetail;
${q}
vec3 cN; float cRough; float cMetal; vec3 cEm;
// tangent normal (xy in the ground plane, x east, y south) onto a world normal
vec3 lfTop(vec3 tn, vec3 Ng) { vec3 t = vec3(tn.xy + Ng.xz, abs(tn.z) * Ng.y); return normalize(t.xzy); }`).replace(`#include <map_fragment>`,`
vec3 Ng = normalize(vNw);
float camD = length(vW - cameraPosition);
float dRoad = vAux.x, cover = vAux.y, heat = vAux.z, fresh = vAux.w, aa = vAux2.x;
vec2 P = vW.xz;
// flow frame: the lava ran out radially from the summit, so polar coordinates about it give smooth, kink-free
// down-flow (x) and across-flow (y) coordinates
vec2 Q = P - uSummit;
float qr = max(length(Q), 1.0);
vec2 fdir = Q / qr;
vec2 fperp = vec2(-fdir.y, fdir.x);
vec3 nzA = texture(tNoise, P / 160.0).rgb;
vec3 nzB = texture(tNoise, P / 31.0).rgb;
vec3 nzC = texture(tNoise, P / 7.0).rgb;
// flow-aligned coordinates: x down the flow, y across it, warped so lobe margins and folds curve
vec2 fq = vec2(qr, (atan(Q.y, Q.x) - 1.3) * qr);
fq.x += (nzA.g - 0.5) * 30.0;
vec2 fqw = fq + (nzB.rg - 0.5) * 7.0 + (nzC.gb - 0.5) * 1.6;

// ---- pahoehoe: inflated lobes and toes, ropy folds where the skin was dragged, a glassy silver rind
vec2 lob = lfCells(fqw / vec2(15.0, 10.0) + nzA.rg * 2.0);
vec2 toe = lfCells(fqw / vec2(4.6, 3.4) + 7.3);
float lobeEdge = 1.0 - smoothstep(0.0, 0.1, lob.x);
float toeEdge = 1.0 - smoothstep(0.0, 0.07, toe.x);
// ropes: folds ~0.3 m apart, bowed downstream across each lobe; only in the ropy patches, faded out before they alias
float ropeK = smoothstep(0.42, 0.62, nzB.b * 0.7 + nzA.r * 0.5 + lob.y * 0.15) * smoothstep(0.02, 0.25, lob.x);
float ph = (fqw.x + 2.2 * cos(fqw.y / 3.2 + lob.y * 6.3) - lob.x * 3.0) / 0.32;
float rw = fwidth(ph);
ropeK *= 1.0 - smoothstep(0.3, 0.7, rw);
float rope = sin(ph * 6.2832);
float ropeD = cos(ph * 6.2832);
// broad hummocks and the scanned flow-striated skin on top
vec2 ru = vec2(fqw.x / 7.0, fqw.y / 5.0) + lob.y * 4.0;
vec4 R1 = texture(tPah, ru);
float rh = R1.b;
// glassy rind in broad patches: silvery where it catches the sky; elsewhere crazed, dusty and dull
float glass = smoothstep(0.45, 0.7, nzB.g * 0.7 + nzC.r * 0.3) * (1.0 - lobeEdge);
vec2 rn = (R1.rg * 2.0 - 1.0) * 0.12 * (1.0 - smoothstep(6.0, 18.0, camD)) + (nzC.rg - 0.5) * 0.5 + (nzB.gb - 0.5) * 0.6;
rn.x += ropeD * 0.75 * ropeK;
// back into world xz (texture x is down the flow)
vec2 rnW = fdir * rn.x + fperp * rn.y;
vec3 pahC = vec3(0.018, 0.019, 0.022) * (0.75 + 0.6 * rh) * (1.0 + rope * 0.3 * ropeK);
pahC = mix(pahC, vec3(0.04, 0.043, 0.05), glass * 0.5);
// faint golden-brown iron staining in older crust
pahC *= mix(vec3(1.0), vec3(1.35, 1.05, 0.8), smoothstep(0.66, 0.82, nzA.b) * 0.6);
pahC *= 1.0 - lobeEdge * 0.6 - toeEdge * 0.15;
float pahR = mix(0.74, 0.44, glass) + lobeEdge * 0.2;
vec3 pahN = vec3(rnW * (1.0 - lobeEdge * 0.5), 1.0);

// ---- 'a'a: dark rubbly clinker, rough and spiny, rusty in places
vec2 cu = P / 1.6;
vec4 cA = texture(tClA, cu), cA2 = texture(tClA, P / 5.3 + 0.4);
vec4 cP = texture(tClN, cu), cP2 = texture(tClN, P / 5.3 + 0.4);
vec3 aaC = mix(cA.rgb, cA2.rgb, 0.4) * vec3(0.42, 0.37, 0.34);
aaC *= mix(vec3(1.0), vec3(1.55, 0.95, 0.68), smoothstep(0.55, 0.8, nzB.b) * 0.7);
vec3 aaN = vec3((cP.rg * 2.0 - 1.0) * 1.2 + (cP2.rg * 2.0 - 1.0) * 0.8, 1.0);
float aaAO = cP.b * cP2.b;
float aaR = 0.95;

// mix by the 'a'a share, frayed so the two meet in ragged tongues
float wA = smoothstep(0.35, 0.65, aa + (nzB.r - 0.5) * 0.5 + (nzC.g - 0.5) * 0.2);
vec3 col = mix(pahC, aaC * aaAO, wA);
vec3 tn = normalize(mix(pahN, aaN, wA));
float rough = mix(pahR, aaR, wA);
float metal = mix(0.15 * glass, 0.0, wA);

// ---- hot cracks near live lava: incandescent in the joints, pulsing slowly as the crust breathes
vec2 hc = lfCells(fqw / vec2(3.2, 2.4) + 3.1);
float hk = smoothstep(0.35, 1.0, heat);
float crackLine = 1.0 - smoothstep(0.0, 0.025 + 0.035 * hk, hc.x);
float pulse = 0.6 + 0.4 * sin(uTime * (0.7 + hc.y) + hc.y * 40.0 + nzA.r * 20.0);
// only some joints are open to the heat; the rest have sealed over
float open = step(0.45, fract(hc.y * 7.13)) * smoothstep(0.3, 0.7, nzC.g + hk * 0.4);
cEm = vec3(1.0, 0.2, 0.025) * (crackLine * open + lobeEdge * 0.6) * hk * hk * pulse * 2.4;
// and a dull red where the crust is still very hot right against the flow
cEm += vec3(0.35, 0.045, 0.008) * smoothstep(0.9, 1.0, heat) * (0.4 + 0.6 * nzC.r) * pulse;
col *= 1.0 - crackLine * open * hk * 0.6;

// ---- fresh black sand just above the sea at the ocean entry: fine, glittering, wet at the waterline
float seaK = (1.0 - smoothstep(170.0, 240.0, length(P - uSea.xz))) * (1.0 - smoothstep(2.6, 5.0, vW.y + (nzB.g - 0.5) * 2.0));
float wet = 1.0 - smoothstep(0.3, 1.4, vW.y);
vec3 sandC = vec3(0.045, 0.043, 0.042) * mix(0.8, 1.2, nzC.b);
float glint = step(0.985, lfHash(floor(P * 9.0))) * (1.0 - wet);
sandC += glint * 0.25;
col = mix(col, sandC * (1.0 - wet * 0.45), seaK);
tn = normalize(mix(tn, vec3((nzC.rg - 0.5) * 0.3, 1.0), seaK));
rough = mix(rough, mix(0.85, 0.25, wet), seaK);
metal = mix(metal, 0.0, seaK);

// fine grit
vec3 dN = texture(tDetail, P / 1.2).xyz * 2.0 - 1.0;
tn = normalize(tn + vec3(dN.xy, 0.0) * 0.3 * wA * (1.0 - smoothstep(10.0, 40.0, camD)));
// distance: let the texture detail settle into its average so the far field doesn't sparkle
float far = smoothstep(120.0, 400.0, camD);
tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), far * 0.6));
cN = lfTop(tn, Ng);
cRough = rough; cMetal = metal;

// ---- coverage: off the road, fraying out in lobes at the band's edge, only on the fresh field (or the beach)
float lobeN = nzA.g * 0.6 + nzB.r * 0.4;
float band = 1.0 - smoothstep(0.62, 0.95, cover + (lobeN - 0.5) * 0.55);
float road = smoothstep(uHalfW + 0.8, uHalfW + 4.5, dRoad + (nzC.r - 0.5) * 2.5);
float alpha = band * road * max(smoothstep(0.05, 0.4, fresh), seaK);
diffuseColor.rgb = col;
diffuseColor.a = alpha;
`).replace(`#include <roughnessmap_fragment>`,`float roughnessFactor = cRough;`).replace(`#include <metalnessmap_fragment>`,`float metalnessFactor = cMetal;`).replace(`#include <normal_fragment_maps>`,`normal = normalize((viewMatrix * vec4(cN, 0.0)).xyz);`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
totalEmissiveRadiance += cEm;`)},a.customProgramCacheKey=()=>`kaiele-crust-${c}`,a.userData.u=s,a}function J(e,t=1,n=.45){let r=new A(1,t),i=r.attributes.position,a=C(e),o=[a()*50,a()*50,a()*50],s=new Map;for(let e=0;e<i.count;e++){let t=i.getX(e),r=i.getY(e),c=i.getZ(e),l=`${t.toFixed(4)},${r.toFixed(4)},${c.toFixed(4)}`,u=s.get(l);if(u===void 0){let e=j(t*1.3+o[0],r*1.3+o[1],c*1.3+o[2]),i=j(t*3.1+o[1],r*3.1+o[2],c*3.1+o[0]),d=a()<.18?n*(.5+a()):-a()*.12;u=1+e*.35+i*.18+d,s.set(l,u)}i.setXYZ(e,t*u*1.1,r*u*.72,c*u)}let c=r.index?r.toNonIndexed():r;c.computeVertexNormals();let l=c.attributes.position,u=new Float32Array(l.count*2),d=new _,f=new _,p=new _,m=new _;for(let e=0;e<l.count;e+=3){d.fromBufferAttribute(l,e),f.fromBufferAttribute(l,e+1),p.fromBufferAttribute(l,e+2),m.subVectors(p,f).cross(d.clone().sub(f));let t=Math.abs(m.x),n=Math.abs(m.y),r=Math.abs(m.z);for(let i=0;i<3;i++){let a=[d,f,p][i],[o,s]=t>n&&t>r?[a.z,a.y]:n>r?[a.x,a.z]:[a.x,a.y];u[(e+i)*2]=o*.5,u[(e+i)*2+1]=s*.5}}return c.setAttribute(`uv`,new M(u,2)),c.translate(0,.25,0),c}function Y(e,t){let n=new l({map:e.clinkerA,roughness:.92,metalness:0,envMapIntensity:.7}),r={tClN:{value:e.clinkerN},uTime:{value:0}};return n.onBeforeCompile=e=>{Object.assign(e.uniforms,r),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vRP; varying vec2 vRuv;`).replace(`#include <uv_vertex>`,`#include <uv_vertex>
vRuv = uv;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vRP = position;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
uniform sampler2D tClN; varying vec3 vRP; varying vec2 vRuv;`).replace(`#include <map_fragment>`,`
vec4 tc = texture2D(map, vRuv);
// darken and cool the scanned rock to fresh basalt; rusty oxidised faces on some blocks (instance colour)
vec3 rc = tc.rgb * vec3(0.5, 0.47, 0.45);
diffuseColor.rgb *= rc;
float rAO = texture2D(tClN, vRuv).b;
// the undersides sit in the rubble's shadow
diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(-0.2, 0.6, vRP.y)) * mix(0.6, 1.0, rAO);`).replace(`#include <normal_fragment_maps>`,`#include <normal_fragment_maps>
{
  vec3 tnr = texture2D(tClN, vRuv).xyz * 2.0 - 1.0;
  vec3 dx = dFdx(vViewPosition), dy = dFdy(vViewPosition);
  vec2 ux = dFdx(vRuv), uy = dFdy(vRuv);
  vec3 T = normalize(dx * uy.y - dy * ux.y), B = normalize(-dx * uy.x + dy * ux.x);
  normal = normalize(normal + (T * tnr.x + B * tnr.y) * 0.9);
}`)},n.customProgramCacheKey=()=>`kaiele-clinker`,n}function re({world:e,quality:n,masks:i,trackGrid:a,lavaGrid:c,features:l,M:u,tex:d,group:f,rnd:p}){let m=n.name,h=!!n.aiLod,v=Y(d,u),y={low:5e3,medium:9e3,high:16e3,ultra:26e3}[m]??9e3,b=[J(11,1,.5),J(23,1,.35),J(37,+!h,.25)],x=h?448:320,S=new Map,C=new r,w=new t,T=new s,E=new _,D=new _,O=new _,k=new _(0,1,0),A=new t,j=new o,M=l.filter(e=>e.rubble),N=(t,n,r,i)=>{let a=`${Math.floor(t/x)},${Math.floor(n/x)}`,o=S.get(a);o||S.set(a,o={list:[],x:(Math.floor(t/x)+.5)*x,z:(Math.floor(n/x)+.5)*x}),e.normalAt(t,n,O),T.set((p()-.5)*.7,p()*6.3,(p()-.5)*.7),w.setFromEuler(T),A.setFromUnitVectors(k,O.lerp(k,.4).normalize()),w.premultiply(A);let s=i===2?.45+p()*.3:.7+p()*.5;E.set(r*(.8+p()*.5),r*s,r*(.8+p()*.5)),D.set(t,e.heightAt(t,n)-r*.2,n),C.compose(D,w,E);let c=p();c<.12?j.setRGB(1.25,.82,.62):c<.3?j.setRGB(.85,.85,.95):j.setRGB(.95+p()*.1,.95,.93),j.multiplyScalar(.8+p()*.45),o.list.push({m:C.clone(),c:j.clone(),s:r,g:i})},P=e.data.tracks,F=0;for(let t=0;F<y&&t<y*8;t++){let t,n,r,o=p();if(o<.72){let e=P[Math.floor(p()*P.length)].centre,i=Math.floor(p()*e.length),a=e[i],o=e[Math.min(i+1,e.length-1)],s=o[0]-a[0],c=o[2]-a[2],l=Math.hypot(s,c)||1,u=(p()<.5?-1:1)*(11+p()**1.6*110);t=a[0]-c/l*u,n=a[2]+s/l*u,r=!0}else if(o<.8&&M.length){let e=M[Math.floor(p()*M.length)],i=p()*6.3,a=e.r0+p()**1.5*e.r;t=e.x+Math.cos(i)*a,n=e.z+Math.sin(i)*a,r=!0}else t=-600+p()*2600,n=-60+p()*2060,r=!1;let s=i.fresh(t,n);if(s<.2)continue;let l=i.aa(t,n),u=a.dist(t,n,40);if(u<11)continue;let d=c.dist(t,n,40);if(c.best&&d<c.best[2]+2.5||e.heightAt(t,n)<1.5||(e.normalAt(t,n,O),O.y<.6))continue;let f=(.08+.92*K(.25,.7,l))*s;if(p()>f)continue;let m=.25+p()**3.2*(l>.4?2.2:1.4);if(r||(m=.9+p()**2*2.6),m*=K(10,22,u)*.6+.4,N(t,n,m,l>.4?0:2),l>.45&&r){let e=1+Math.floor(p()*(h?2:4));for(let r=0;r<e&&F<y;r++){let e=p()*6.3,r=m*(.8+p()*1.8),i=t+Math.cos(e)*r,o=n+Math.sin(e)*r;a.dist(i,o,12)<10.5||(N(i,o,m*(.3+p()*.5),0),F++)}}F++}let I=[],L=0;for(let e of S.values())for(let t=0;t<b.length;t++){let n=e.list.filter(e=>e.g===t).sort((e,t)=>t.s-e.s);if(!n.length)continue;let r=t===0&&Math.floor(e.x/x)+Math.floor(e.z/x)&1?b[1]:b[t],i=new g(r,v,n.length);n.forEach((e,t)=>{i.setMatrixAt(t,e.m),i.setColorAt(t,e.c)}),i.castShadow=!h,i.receiveShadow=!0,i.computeBoundingSphere(),i.userData.sizes=n.map(e=>e.s),i.userData.cx=e.x,i.userData.cz=e.z,f.add(i),I.push(i),L+=n.length}let R={low:160,medium:230,high:320,ultra:420}[m]??230,z=0;return{total:L,meshes:I.length,update(e){if(!(z++&7))for(let t of I){let n=Math.max(0,Math.hypot(t.userData.cx-e.x,t.userData.cz-e.z)-x*.7)/R,r=t.userData.sizes,i=0,a=r.length;for(;i<a;){let e=i+a>>1;r[e]>=n?i=e+1:a=e}t.count=i,t.visible=i>0}}}}var X=new _,Z=new _;function ie(e,t){return new T({transparent:!0,depthWrite:!1,blending:2,side:2,fog:!1,uniforms:{uTime:{value:0},uCol:{value:new o(e)},uK:{value:t},uPulse:{value:1}},vertexShader:`varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,fragmentShader:`uniform float uTime, uK, uPulse; uniform vec3 uCol; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        float h = vUv.y;
        float fl = 0.75 + 0.25 * sin(uTime * 1.7 + vUv.x * 31.0) * sin(uTime * 0.9 + vUv.x * 13.0);
        float a = pow(1.0 - h, 2.2) * smoothstep(0.0, 0.08, h) * fl * uPulse;
        // view-angle fade so the band's rim never shows as a hard line seen edge-on
        vec3 V = normalize(cameraPosition - vW);
        a *= (0.35 + 0.65 * abs(V.y)) * smoothstep(0.05, 0.5, abs(dot(normalize(vN), V)));
        gl_FragColor = vec4(uCol * a * uK, 1.0);
      }`})}function ae(e){return new T({transparent:!0,depthWrite:!1,fog:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2,uniforms:{uTime:{value:0},tNoise:{value:e.noise},tMolten:{value:e.molten}},vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`uniform float uTime; uniform sampler2D tNoise, tMolten; varying vec2 vUv;
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
      }`})}function oe(){let e=document.createElement(`canvas`);e.width=e.height=128;let t=e.getContext(`2d`),n=C(19);for(let e=0;e<110;e++){let e=n()*6.3,r=n()**.7*52,i=5+n()*16,a=64+Math.cos(e)*r,o=64+Math.sin(e)*r,s=t.createRadialGradient(a,o,0,a,o,i),c=n()<.5?`222,196,86`:n()<.6?`238,236,222`:`176,96,44`;s.addColorStop(0,`rgba(${c},${.42*(1-r/64)})`),s.addColorStop(1,`rgba(${c},0)`),t.fillStyle=s,t.fillRect(a-i,o-i,i*2,i*2)}let r=new P(e);return r.colorSpace=h,r}function se(e,t,n,r,i,a){let o=0,s=0;for(let c=0;c<16;c++){let l=c/16*Math.PI*2,u=2;for(;u<a&&!(e.heightAt(t+Math.cos(l)*u,n+Math.sin(l)*u)>r+i);u+=1);o+=u,s++}return o/s}function ce({world:i,quality:c,M:l,lava:d,tex:f,group:p,fx:m,lights:h,rnd:v}){let y=!!c.aiLod,b=d.userData.makeMat(!1),x=ae(l),C=[],w=[],T=Y(f,l),D=J(51,1,.2),O=[],k=[],A=new r,j=new t,M=new s,N=new _,P=new _,F=[];for(let t of i.data.rivers){if(t.end!==`skylight`)continue;let r=t.points;{let[t,n,o]=r[0],s=new S(new a(5.6,40).rotateX(-Math.PI/2),b);s.position.set(t,n+.18,o),p.add(s);let c=new S(new e(1,20,8,0,Math.PI*2,0,Math.PI/2),b);c.position.set(t,n+.1,o),p.add(c);for(let e=0;e<(y?40:80);e++){let e=v()*6.3,r=5+v()**.7*8,a=t+Math.cos(e)*r,s=o+Math.sin(e)*r,c=.18+v()**2.5*.7;M.set((v()-.5)*.3,v()*6.3,(v()-.5)*.3),j.setFromEuler(M),N.set(c*1.5,c*.45,c*1.2),P.set(a,i.heightAt(a,s)-c*.3,s),O.push({m:A.compose(P,j,N).clone(),c:v()<.4?[1.4,.75,.5]:[.75,.7,.7]}),r<7.5&&v()<.5&&k.push(A.compose(X.set(a,Math.max(i.heightAt(a,s),n)+.1,s),j,N.multiplyScalar(.45)).clone())}let l={x:t,y:n,z:o,dome:c,next:1+v()*2,well:0,burst:0,ph:v()*10};l.light={x:t,y:n+4,z:o,color:16738850,I:900,range:55,k:1},h.push(l.light),C.push(l)}{let e=r.length,[o,s,c]=r[e-1],l=r[Math.max(0,e-4)],u=o-l[0],d=c-l[2],f=Math.hypot(u,d)||1,m=t.width[e-1],g=o+u/f*m*.25,_=c+d/f*m*.25,y=m*.62,b=new S(new a(y,48).rotateX(-Math.PI/2),x);b.rotation.y=-Math.atan2(d,u),b.position.set(g,s+.12,_),b.renderOrder=2,p.add(b);let C=Math.max(y+1,se(i,g,_,s,3,30)),T=0;for(let e=0;e<12;e++){let t=e/12*6.283;T+=i.heightAt(g+Math.cos(t)*(C+4),_+Math.sin(t)*(C+4))/12}let E=Math.max(6,Math.min(30,T-s)),D=new S(new n(C+3,Math.max(y,C-2),E+4,32,1,!0),ie(16734740,.55));D.position.set(g,s+(E+4)/2-.5,_),D.renderOrder=7,p.add(D),F.push(D);let O={x:g,y:s,z:_,R:y,rw:C,rimH:E,band:D,ph:v()*10,acc:0};O.light={x:g,y:s+2.5,z:_,color:16734748,I:1200,range:50,k:1},h.push(O.light),w.push(O)}}if(O.length){let e=new g(D,T,O.length);O.forEach((t,n)=>{e.setMatrixAt(n,t.m),e.setColorAt(n,new o(...t.c))}),e.castShadow=!y,e.receiveShadow=!0,e.computeBoundingSphere(),p.add(e)}if(k.length){let e=new u({color:new o(2.2,.55,.08)}),t=new g(D,e,k.length);k.forEach((e,n)=>t.setMatrixAt(n,e)),t.computeBoundingSphere(),p.add(t)}let I=i.data.lake,L=i.data.crater,R=null;if(I){let e=I.y+1,t=se(i,I.x,I.z,e,4,I.r+90),r=se(i,I.x,I.z,e,34,I.r+140),a=new S(new n(r+4,t-2,44,72,1,!0),ie(16730640,.16));a.position.set(I.x,e+22-1,I.z),a.renderOrder=7,p.add(a),F.push(a),R={...I,ly:e,r0:t,band:a,accGas:0,next:.5},R.light={x:I.x,y:e+20,z:I.z,color:16732180,I:14e3,range:380,k:1},h.push(R.light),L&&(L.x!==I.x||L.z!==I.z)&&(R.pool=L)}let z=[],B=y?36:70,V=i.data.tracks;for(let e=0;z.length<B&&e<B*30;e++){let e,t;if(v()<.55){let n=V[Math.floor(v()*V.length)].centre,r=Math.floor(v()*n.length),i=n[r],a=n[Math.min(r+1,n.length-1)],o=a[0]-i[0],s=a[2]-i[2],c=Math.hypot(o,s)||1,l=(v()<.5?-1:1)*(16+v()*90);e=i[0]-s/c*l,t=i[2]+o/c*l}else{let n=i.data.rivers[Math.floor(v()*i.data.rivers.length)],r=Math.floor(v()*n.points.length),a=n.points[r],o=n.points[Math.min(r+1,n.points.length-1)],s=o[0]-a[0],c=o[2]-a[2],l=Math.hypot(s,c)||1,u=(v()<.5?-1:1)*(n.width[r]/2+6+v()*30);e=a[0]-c/l*u,t=a[2]+s/l*u}if(m.trackGrid.dist(e,t,14)<13)continue;let n=m.lavaGrid.dist(e,t,20);if(m.lavaGrid.best&&n<m.lavaGrid.best[2]+3||m.masks.fresh(e,t)<.3||i.heightAt(e,t)<3||z.some(n=>Math.hypot(n.x-e,n.z-t)<30))continue;let r=v()<.55,a=v()*6.3;z.push({x:e,z:t,y:i.heightAt(e,t),crack:r,ang:a,len:r?5+v()*9:0,rate:1.5+v()*2.5,acc:0,size:1+v()*1.6})}if(z.length){let e=new u({map:oe(),transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),t=new g(new E(1,1).rotateX(-Math.PI/2),e,z.length);z.forEach((e,n)=>{j.setFromAxisAngle(X.set(0,1,0),e.ang),N.set(e.crack?e.len*1.3+3:5+e.size*2,1,e.crack?3.5:5+e.size*2),t.setMatrixAt(n,A.compose(P.set(e.x,e.y+.25,e.z),j,N))}),t.renderOrder=1,t.computeBoundingSphere(),p.add(t)}let H=m.wind;return{vents:C,skies:w,fum:z,crater:R,update(e,t,n){x.uniforms.uTime.value=e;for(let t of F)t.material.uniforms.uTime.value=e;let{steam:r,gob:a,glow:o}=m;for(let i of C){let s=Math.hypot(i.x-n.x,i.z-n.z);if(i.next-=t,i.well=Math.min(1,i.well+t*.7),i.next<=0&&(i.next=.6+v()*2.2,i.burst=1,i.well=0,s<700)){let t=y?10:22;for(let n=0;n<t;n++){let t=v()*6.3,n=1+v()*3.5;a.emit(X.set(i.x+(v()-.5)*2,i.y+.8,i.z+(v()-.5)*2),Z.set(Math.cos(t)*n,7+v()*9,Math.sin(t)*n),.12+v()*.22,e,1.6+v()*1.2,1,.75,.55)}o.emit(X.set(i.x,i.y+1.5,i.z),Z.set(0,2,0),3+v()*2,e,.8,.9,.6,.5);let n=.42+v()*.1;r.emit(X.set(i.x,i.y+3,i.z),Z.set(H.x*2,3+v()*2,H.z*2),3+v()*2,e,6+v()*3,n,n*.97,n*.95)}i.burst=Math.max(0,i.burst-t*2.5);let c=.3+i.well*1.3+Math.sin(e*5+i.ph)*.08;if(i.dome.scale.set(1.8+i.well*.8,c,1.8+i.well*.8),i.light.k=.75+i.burst*.9+Math.sin(e*9+i.ph)*.08,s<450)for(i.acc=(i.acc||0)+t*1.2;i.acc>1;){--i.acc;let t=.5;r.emit(X.set(i.x+(v()-.5)*6,i.y+2,i.z+(v()-.5)*6),Z.set(H.x*1.5,2+v()*2,H.z*1.5),2.5+v()*2,e,7,t,t*.98,t*.92)}}for(let i of w){let s=Math.hypot(i.x-n.x,i.z-n.z),c=.85+.15*Math.sin(e*3.1+i.ph)*Math.sin(e*1.7+i.ph*2);if(i.light.k=c,i.band.material.uniforms.uPulse.value=c,!(s>600))for(i.acc+=t*(y?2.5:5);i.acc>1;){--i.acc;let t=v()*6.3,n=v()*i.R*.6,s=i.x+Math.cos(t)*n,c=i.z+Math.sin(t)*n;if(v()<.5?r.emit(X.set(s,i.y+1,c),Z.set(H.x,3.5+v()*2.5,H.z),2.5+v()*2.5,e,5+v()*2,1,.6,.42):o.emit(X.set(s,i.y+1.5,c),Z.set(0,2+v()*2,0),3+v()*3,e,1.2+v()*.8,.35,.18,.1),v()<.25)for(let t=0;t<5;t++)a.emit(X.set(s,i.y+.4,c),Z.set((v()-.5)*3,3+v()*4,(v()-.5)*3),.1+v()*.12,e,.9+v()*.5,1,.8,.6)}}if(R){let i=Math.hypot(R.x-n.x,R.z-n.z);if(R.light.k=.85+.12*Math.sin(e*.8)+(R.flash||0),R.flash=Math.max(0,(R.flash||0)-t*1.5),i<1500){for(R.accGas+=t*(y?1:2);R.accGas>1;){--R.accGas;let t=v()*6.3,n=Math.sqrt(v())*R.r0*.9,i=R.x+Math.cos(t)*n,a=R.z+Math.sin(t)*n,o=.55+v()*.15;r.emit(X.set(i,R.ly+2,a),Z.set(H.x*3,7+v()*5,H.z*3),4+v()*4,e,9+v()*5,o*.95,o*.9,o*.86)}if(R.next-=t,R.next<=0&&i<900){R.next=1+v()*2.5;let t=v()*6.3,n=Math.sqrt(v())*R.r0*.8,r=R.x+Math.cos(t)*n,i=R.z+Math.sin(t)*n,s=v()<.3;for(let t=0;t<(s?40:16);t++){let t=v()*6.3,n=v()*(s?6:3);a.emit(X.set(r,R.ly+.5,i),Z.set(Math.cos(t)*n,(s?10:6)+v()*(s?14:7),Math.sin(t)*n),.25+v()*.4,e,2+v()*1.5,1,.75,.5)}o.emit(X.set(r,R.ly+2,i),Z.set(0,3,0),s?12:6,e,1.2,.9,.55,.35),s&&(R.flash=.6)}}}for(let a of z){let o=Math.hypot(a.x-n.x,a.z-n.z);if(!(o>420))for(a.acc+=t*a.rate*(o<200?1:.5);a.acc>1;){--a.acc;let t=a.crack?(v()-.5)*a.len:0,n=a.x+Math.cos(a.ang)*t+(v()-.5),o=a.z+Math.sin(a.ang)*t+(v()-.5),s=.8+v()*.15;r.emit(X.set(n,i.heightAt(n,o)+.3,o),Z.set(H.x*(.8+v()),1.2+v()*1.8,H.z*(.8+v())),a.size*(.6+v()*.5),e,5+v()*3,s,s,s*.97)}}}}}var Q=new _,$=new _;function le(e,t,n,r,i){let a=new E(1,1),s=new x;s.index=a.index,s.attributes.position=a.attributes.position,s.attributes.uv=a.attributes.uv;let c=new Float32Array(i*4),l=C(1745);for(let e=0;e<i;e++)c[e*4]=l(),c[e*4+1]=l(),c[e*4+2]=l(),c[e*4+3]=l();s.setAttribute(`seed`,new O(c,4)),s.instanceCount=i;let u=new T({transparent:!0,depthWrite:!1,uniforms:{uTime:{value:0},tSmoke:{value:e.smoke},uSun:{value:t.clone()},uOrigin:{value:n.clone()},uWind:{value:r.clone()},uFogColor:{value:new o(.62,.64,.66)},uFogDensity:{value:28e-5}},vertexShader:`
      attribute vec4 seed;
      uniform float uTime; uniform vec3 uOrigin, uWind;
      varying vec2 vUv; varying float vAge; varying vec3 vSeed; varying float vFogDepth; varying vec3 vRight, vUp, vFwd; varying float vH;
      void main() {
        float life = 55.0;
        float age = fract(seed.x + uTime / life);
        vAge = age;
        vSeed = seed.yzw;
        // billows up fast off the water, then bends over and streams away downwind along the coast
        float h = (1.0 - exp(-age * 4.0)) * 420.0 + age * 120.0;
        vec3 p = uOrigin + vec3(0.0, h, 0.0);
        p += uWind * pow(age, 1.4) * 1500.0;
        float ang = seed.y * 6.283;
        float spread = 8.0 + pow(age, 0.9) * 260.0;
        p += vec3(cos(ang), 0.35 * sin(ang * 2.0), sin(ang)) * spread * seed.z;
        // the base: a broad churning skirt along the entry
        p.xz += vec2(cos(ang * 3.0), sin(ang * 3.0)) * 30.0 * (1.0 - smoothstep(0.0, 0.08, age)) * seed.w;
        vH = h;
        float size = 40.0 + pow(age, 0.7) * 380.0 * (0.6 + seed.w * 0.8);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float rot = seed.w * 6.283 + uTime * 0.02 * (seed.y - 0.5);
        vec2 c = vec2(cos(rot), sin(rot));
        mv.xy += vec2(position.x * c.x - position.y * c.y, position.x * c.y + position.y * c.x) * size;
        vUv = uv;
        vRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vFwd = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        vRight = vRight * c.x + vUp * c.y; vUp = cross(vFwd, vRight);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      uniform sampler2D tSmoke; uniform vec3 uSun, uFogColor; uniform float uFogDensity;
      varying vec2 vUv; varying float vAge; varying vec3 vSeed; varying float vFogDepth; varying vec3 vRight, vUp, vFwd; varying float vH;
      void main() {
        vec4 s = texture2D(tSmoke, vUv);
        vec3 n = normalize((s.r * 2.0 - 1.0) * vRight + (s.g * 2.0 - 1.0) * vUp + (s.b * 2.0 - 1.0) * vFwd);
        float lit = clamp(dot(n, uSun) * 0.55 + 0.5, 0.0, 1.0);
        // bright white steam, cooler grey in its own shadow; a faint yellow-brown acid haze downwind
        vec3 col = mix(vec3(0.42, 0.45, 0.5), vec3(1.0, 0.98, 0.95) * 1.15, lit);
        col = mix(col, col * vec3(1.0, 0.94, 0.82), smoothstep(0.35, 0.9, vAge) * 0.6);
        // lit from below by the lava at the waterline
        col += vec3(1.6, 0.45, 0.08) * (1.0 - smoothstep(4.0, 60.0, vH)) * (0.5 + 0.5 * (1.0 - lit));
        float a = min(1.0, s.a * 1.3) * smoothstep(0.0, 0.02, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge)) * mix(1.0, 0.6, vAge);
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth * 0.25);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, a);
      }`}),d=new S(s,u);return d.frustumCulled=!1,d.renderOrder=5,d}function ue(e){return new T({transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-4,polygonOffsetUnits:-4,uniforms:{uTime:{value:0},tNoise:{value:e.noise},uDir:{value:new I(0,1)}},vertexShader:`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,fragmentShader:`uniform float uTime; uniform sampler2D tNoise; uniform vec2 uDir; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 d = vUv * 2.0 - 1.0; float r = length(d);
        // the hot water spreads out in front of the entry
        vec2 P = vW.xz;
        float n1 = texture2D(tNoise, P / 9.0 + vec2(uTime * 0.05, -uTime * 0.03)).r;
        float n2 = texture2D(tNoise, P / 3.5 - vec2(uTime * 0.11, uTime * 0.07)).g;
        float boil = smoothstep(0.45, 0.75, n1 * 0.6 + n2 * 0.6 - r * 0.35);
        float foam = smoothstep(0.55, 0.7, n2 + (1.0 - r) * 0.25) * (1.0 - smoothstep(0.55, 1.0, r));
        vec3 col = mix(vec3(0.62, 0.66, 0.66), vec3(0.95, 0.97, 0.96), foam);
        // brown-green turbid water stirred with glass sand
        col = mix(vec3(0.16, 0.2, 0.17), col, max(boil, foam));
        // incandescent glow right at the entry, seen through the shallow water
        float hot = (1.0 - smoothstep(0.0, 0.32, r)) * (0.6 + 0.4 * n2);
        col += vec3(2.2, 0.6, 0.1) * hot * (0.6 + 0.4 * sin(uTime * 3.0 + n1 * 9.0));
        float a = (1.0 - smoothstep(0.6, 1.0, r)) * (0.35 + 0.6 * max(boil, foam)) + hot * 0.5;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`})}function de({world:e,quality:t,M:n,sun:r,group:i,fx:o,lights:s,rnd:c}){if(!e.data.oceanEntry)return null;let l=!!t.aiLod,u=e.data.seaLevel??0,d=(e.data.rivers.find(e=>e.id===`ahi`)||e.data.rivers[0]).points,f=d.length,p=d[f-1],m=d[Math.max(0,f-6)],h=p[0]-m[0],g=p[2]-m[2],v=Math.hypot(h,g)||1,y=h/v,b=g/v,x=p[0]+y*6,C=p[2]+b*6,w=o.wind,T=le(n,r,new _(x,u+4,C),w,l?170:320);i.add(T);let E=new S(new a(48,48).rotateX(-Math.PI/2),ue(n));E.position.set(x+y*18,u+.08,C+b*18),E.renderOrder=3,i.add(E);let D={ex:x,ez:C,ux:y,uz:b,sea:u,acc:0,blast:1,plume:T,boil:E};return D.light={x,y:u+6,z:C,color:16737312,I:5e3,range:140,k:1},s.push(D.light),{plume:T,update(e,t,n){T.material.uniforms.uTime.value=e,E.material.uniforms.uTime.value=e;let r=Math.hypot(x-n.x,C-n.z);if(D.flash=Math.max(0,(D.flash||0)-t*2),D.light.k=.8+.2*Math.sin(e*2.3)*Math.sin(e*.7)+D.flash,r>1400)return;let{steam:i,gob:a,glow:s}=o;for(D.acc+=t*(l?3:6)*(r<500?1:.4);D.acc>1;){--D.acc;let t=(c()-.5)*40,n=c()*30,r=x+y*n-b*t,a=C+b*n+y*t,o=.9+c()*.1;i.emit(Q.set(r,u+.5,a),$.set(w.x*3+(c()-.5)*2,6+c()*6,w.z*3+(c()-.5)*2),2.5+c()*2,e,5+c()*3,o,o,o)}if(D.blast-=t,D.blast<=0){D.blast=.8+c()*2.5,D.flash=.7;let t=(c()-.5)*16,n=x-b*t,r=C+y*t;for(let t=0;t<(l?14:30);t++){let t=c()*6.3,i=2+c()*6;a.emit(Q.set(n,u+.5,r),$.set(Math.cos(t)*i+y*3,6+c()*12,Math.sin(t)*i+b*3),.1+c()*.2,e,1.5+c(),1,.7,.5)}s.emit(Q.set(n,u+1.5,r),$.set(0,3,0),5+c()*4,e,.6,1,.6,.4);for(let t=0;t<3;t++)i.emit(Q.set(n+(c()-.5)*6,u+1,r+(c()-.5)*6),$.set((c()-.5)*6,9+c()*8,(c()-.5)*6),3+c()*2,e,4+c()*2,.95,.95,.95)}}}}function fe(e){let t=C(e),n=[];for(let e=0;e<11;e++)n.push(.75+t()*.45);let r=[],i=[],a=[],o=[];r.push(0,.16,0),i.push(0),a.push(.5,.5);for(let e=0;e<11;e++){let o=e/11*Math.PI*2,s=Math.cos(o)*n[e],c=Math.sin(o)*n[e]*.8;r.push(s*.55,.12+t()*.05,c*.55),i.push(.45),a.push(.5+s*.25,.5+c*.25),r.push(s,.05+t()*.06,c),i.push(1),a.push(.5+s*.5,.5+c*.5),r.push(s*1.04,-.3,c*1.04),i.push(1.3),a.push(.5+s*.52,.5+c*.52)}for(let e=0;e<11;e++){let t=1+e*3,n=1+(e+1)%11*3;o.push(0,n,t),o.push(t,n,t+1,n,n+1,t+1),o.push(t+1,n+1,t+2,n+1,n+2,t+2)}let s=new F;return s.setAttribute(`position`,new w(r,3)),s.setAttribute(`edge`,new w(i,1)),s.setAttribute(`uv`,new w(a,2)),s.setIndex(o),s.computeVertexNormals(),s}function pe({world:e,quality:n,M:i,group:a,rnd:c}){let u=!!n.aiLod,d=G(e),f=[];for(let e of d){let t=e.rv.id===`ahi`,n=Math.floor(e.len/(t?11:13)*(u?.55:1));for(let r=0;r<n;r++)f.push(me(e,c,c()*e.len,t,!0))}let p=u?60:140,h=[];for(let e=0;e<p;e++)h.push({on:!1});let v=f.length+p,y=new l({map:i.lava.a,normalMap:i.lava.n,roughness:.85,metalness:0,vertexColors:!1});y.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute float edge; varying float vEdge; varying vec3 vRW;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vEdge = edge;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying float vEdge; varying vec3 vRW;`).replace(`#include <color_fragment>`,`
// instance colour: r = crust brightness, g = heat (new crust glows, old crust only at its torn rim)
float rHeat = vColor.g;
diffuseColor.rgb *= vec3(0.28, 0.25, 0.24) * vColor.r;`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
{
  // the rim glows only where it is torn and the melt wells up against it; the skirt below the melt line is hidden
  float torn = smoothstep(0.45, 0.7, texture2D(map, vRW.xz / 2.3 + 0.5).g);
  float rim = smoothstep(0.85, 1.05, vEdge) * (1.0 - smoothstep(1.1, 1.3, vEdge)) * (0.25 + 0.75 * torn);
  float crk = smoothstep(0.66, 0.72, texture2D(map, vRW.xz / 3.0).r) * (1.0 - rim);
  totalEmissiveRadiance += vec3(1.0, 0.26, 0.035) * (rim * (0.5 + 1.6 * rHeat) + crk * rHeat * 1.2 + rHeat * rHeat * 0.25);
}`)},y.customProgramCacheKey=()=>`kaiele-raft`;let b=new g(fe(7),y,v);b.instanceMatrix.setUsage(m),b.frustumCulled=!1,b.receiveShadow=!0;let x=new o;for(let e=0;e<v;e++)b.setColorAt(e,x.setRGB(1,0,0));b.instanceColor.setUsage(m),a.add(b);let S=new r,C=new t,w=new s,T=new _,E=new _,D={},O=new t,k=new r().makeScale(0,0,0),A=(e,t,n,r,i,a,o,s,c)=>{t.sample(n,D);let l=r*D.w,u=D.x-D.tz*l,d=D.z+D.tx*l,f=D.y-r*r*.4+.06-o;t.sample(n+3,D);let p=Math.atan2(D.y-(f+o-.06+r*r*.4),3);w.set(0,a,0,`YXZ`),C.setFromEuler(w);let m=O.setFromAxisAngle(E.set(-D.tz,0,D.tx),p);C.premultiply(m),T.set(i,i*.8,i),S.compose(E.set(u,f,d),C,T),b.setMatrixAt(e,S),b.setColorAt(e,x.setRGB(c,s,0))},j=e=>{let t=0;for(let n of h){if(n.on)continue;let r=c()*6.3;if(Object.assign(n,{on:!0,path:e.path,s:e.s+Math.cos(r)*e.size*.4,a:e.a,da:Math.sin(r)*.025,size:e.size*(.35+c()*.25),yaw:e.yaw+c()*3,spin:(c()-.5)*.6,age:0,life:2.5+c()*2,bright:e.bright}),++t>=2+Math.floor(c()*2))break}},M=0;return{count:f.length,update(e,t,n){t=Math.min(t,.1);let r=!!(M++&3);f.forEach((e,i)=>{e.path.sample(e.s,D);let a=Math.abs(D.x-n.x)+Math.abs(D.z-n.z);if(a>900&&r)return;let o=a>900?t*4:t,s=D.spd*(1-.7*e.a*e.a);e.s+=s*o,e.age+=o,e.yaw+=e.spin*o,(e.age>e.life||e.s>e.path.len-4)&&(e.s<e.path.len-4&&a<600&&j(e),Object.assign(e,me(e.path,c,c()*e.path.len*.95,e.main,!1)));let l=Math.min(1,e.age/2.5),u=Math.max(0,1-e.age/8)*.9+.1;A(i,e.path,e.s,e.a,e.size*(.3+.7*l),e.yaw,0,u,e.bright)}),h.forEach((e,n)=>{let r=f.length+n;if(!e.on){b.setMatrixAt(r,k);return}e.path.sample(e.s,D),e.s+=D.spd*(1-.7*e.a*e.a)*t,e.a=Math.max(-.9,Math.min(.9,e.a+e.da*t*10)),e.age+=t,e.yaw+=e.spin*t;let i=e.age/e.life;i>=1||e.s>e.path.len-2?(e.on=!1,b.setMatrixAt(r,k)):A(r,e.path,e.s,e.a,e.size*(1-i*.6),e.yaw,i*.35,.3+i*.7,e.bright)}),b.instanceMatrix.needsUpdate=!0,b.instanceColor.needsUpdate=!0}}}function me(e,t,n,r,i){return{path:e,main:r,s:n,a:(t()-.5)*1.5,size:(r?1.6:1.1)+t()*(r?3.2:1.8),yaw:t()*6.3,spin:(t()-.5)*.12,age:i?t()*20:0,life:14+t()*30,bright:.75+t()*.5}}async function he({world:e,scene:t,M:n,quality:r,sun:i,lava:a}){let o=new p;o.name=`lavafield`,t.add(o);let s=new URLSearchParams(location.search);if(s.has(`nolf`))return{group:o,update(){}};let l=new Set((s.get(`lfoff`)||``).split(`,`)),u=!!r.aiLod,d=C(4242),m=await H(e),h={pahoehoe:V(`pahoehoe_nh.jpg`),clinkerA:V(`clinker_albedo.jpg`,!0),clinkerN:V(`clinker_nao.jpg`)},g=[];for(let t of e.data.tracks)for(let e=0;e<t.centre.length;e+=3)g.push([t.centre[e][0],t.centre[e][2]]);let v=new ee(g,32),y=[];for(let t of e.data.rivers)t.points.forEach((e,n)=>y.push([e[0],e[2],t.width[n]/2]));let b=e.data.lake;if(b)for(let e=0;e<64;e++)y.push([b.x+Math.cos(e/64*6.283)*b.r*.85,b.z+Math.sin(e/64*6.283)*b.r*.85,b.r*.15]);let x=new ee(y,32),S=e.data.wind,w=S?new _(S[0],0,S[1]).normalize():new _(-.72,0,.69),T=[];for(let t of e.data.rivers){if(t.end!==`skylight`)continue;let e=t.points[0],n=t.points[t.points.length-1];T.push({x:e[0],z:e[2],r:45,r0:12,rubble:!0}),T.push({x:n[0],z:n[2],r:50,r0:13,rubble:!0})}let E=e.data.oceanEntry;E&&T.push({x:E.x,z:E.z,r:230,r0:30});let D=new R(n,u?420:1100,`smoke`);D.mat.uniforms.uSun.value.copy(i);let O=new R(n,u?260:700,`spark`),k=new R(n,u?140:360,`fire`),A=new R(n,u?120:320,`fire`);o.add(D.mesh,O.mesh,k.mesh,A.mesh);let j={steam:D,gob:O,glow:k,ember:A,wind:w,trackGrid:v,lavaGrid:x,masks:m},M=[],N={world:e,quality:r,masks:m,trackGrid:v,lavaGrid:x,features:T,M:n,tex:h,group:o,rnd:d,lava:a,sun:i,fx:j,lights:M},P={update(){},mat:{userData:{u:{uTime:{}}}}},F=l.has(`crust`)?P:te(N),I=l.has(`rubble`)?P:re(N),L=l.has(`vents`)?P:ce(N),z=l.has(`ocean`)?P:de(N),B=l.has(`rafts`)?P:pe(N);s.has(`lfstats`)&&console.warn(`lavafield`,{crustTris:F.tris,crustChunks:F.chunks,rocks:I.total,rockMeshes:I.meshes,rafts:B.count,lights:M.length});let U=[];for(let e=0;e<(u?2:3);e++){let e=new c(16736288,0,50,2);e.castShadow=!1,t.add(e),U.push({L:e,src:null,w:0})}let W=[];for(let t of e.data.rivers)t.points.forEach((e,n)=>W.push({x:e[0],y:e[1],z:e[2],w:t.width[n]/2}));let G=[],K=0,q=0,ne=new _,J=new _,Y=!1,X={group:o,update(e,t,n){if(!Y){Y=!0;for(let t=40;t>0;t--)X.update(e-t*.2,.2,n);for(let e of U)e.w=1}t=Math.min(t,.2),F.mat.userData.u.uTime.value=e,I.update(n),L.update(e,t,n),z?.update(e,t,n),B.update(e,t,n);let r=M.map(e=>({l:e,d:Math.hypot(e.x-n.x,e.y-n.y,e.z-n.z)/e.range})).filter(e=>e.d<2.2).sort((e,t)=>e.d-t.d);for(let e=0;e<U.length;e++){let n=U[e],i=r[e];if(i){n.L.position.set(i.l.x,i.l.y,i.l.z),n.L.color.setHex(i.l.color),n.L.distance=i.l.range*2.2;let e=1-f.smoothstep(i.d,1.6,2.2);n.src!==i.l&&(n.src=i.l,n.w=Math.min(n.w,0)),n.w=Math.min(1,n.w+t*2),n.L.intensity=i.l.I*i.l.k*e*n.w}else n.L.intensity=0,n.src=null,n.w=0}if(e-K>.5){K=e,G.length=0;for(let e of W)Math.abs(e.x-n.x)+Math.abs(e.z-n.z)<260&&G.push(e)}if(G.length)for(q+=t*(u?5:12);q>1;){--q;let t=G[Math.floor(d()*G.length)],n=t.x+(d()-.5)*t.w*1.6,r=t.z+(d()-.5)*t.w*1.6;A.emit(ne.set(n,t.y+.5,r),J.set(w.x*2+(d()-.5)*2,2+d()*3,w.z*2+(d()-.5)*2),.06+d()*.1,e,2+d()*2.5,1,.8,.7)}D.update(e),O.update(e),k.update(e),A.update(e)}};return X}export{he as buildLavaField};