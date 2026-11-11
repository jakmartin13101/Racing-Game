const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./kahakai-CxuW0rtK.js","./world-BTOCbtk8.js","./props-B5tO7s4k.js","./kit-B2ema2Yb.js","./wailele-BSek1cNA.js","./surfaces-CT7A3RTN.js","./palikai-Ey_RFzUi.js","./lavaevents--oOzjFU4.js","./preload-helper-Cdkdtwrk.js","./fx-Ca_oJzFL.js"])))=>i.map(i=>d[i]);
import{$ as e,$n as t,$t as n,A as r,At as i,Bn as a,E as o,F as s,Ft as c,Gt as l,H as u,It as d,J as f,Jt as p,Kn as m,Lt as h,Mt as g,N as _,Nt as v,Ot as y,Q as b,Qn as x,R as S,Rn as C,S as w,T,Tr as E,Ut as D,V as O,Vn as ee,Wn as k,Wt as te,Y as ne,Z as re,_ as A,a as ie,an as ae,ar as j,at as oe,br as M,bt as se,cr as ce,er as le,et as ue,ft as de,g as fe,gt as pe,hr as me,i as he,in as ge,ir as _e,it as ve,j as ye,jt as N,l as be,lr as xe,n as Se,nr as Ce,o as we,or as Te,pt as Ee,q as P,qn as F,qt as De,r as Oe,rt as ke,s as Ae,sr as je,t as Me,tr as Ne,tt as Pe,u as Fe,ur as Ie,v as Le,vt as Re,w as ze,x as Be,xr as Ve,y as I,yr as He,yt as L,z as Ue,zt as We}from"./world-BTOCbtk8.js";import{A as Ge,C as Ke,D as qe,E as Je,O as Ye,S as Xe,T as Ze,_ as Qe,a as $e,b as et,c as tt,d as nt,f as rt,g as it,h as at,j as ot,k as st,l as ct,m as lt,n as ut,o as dt,p as ft,r as pt,s as mt,t as ht,u as gt,v as _t,w as vt,x as yt,y as bt}from"./fx-Ca_oJzFL.js";import{a as xt,i as St,n as Ct,o as wt,r as Tt,t as Et}from"./preload-helper-Cdkdtwrk.js";import{a as Dt,i as Ot,l as kt,n as At,o as jt,r as Mt,s as Nt,t as Pt}from"./props-B5tO7s4k.js";import{t as Ft}from"./surfaces-CT7A3RTN.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function R(e){return e&&e.__esModule?e.default:e}var It=new class extends I{boundingSphere=new x;constructor(){super(),this.setAttribute(`position`,new Le(new Float32Array([-1,-1,3,-1,-1,3]),2)),this.setAttribute(`uv`,new Le(new Float32Array([0,0,2,0,0,2]),2))}computeBoundingSphere(){}},Lt=new te,Rt=class{constructor(e){this._mesh=new N(It,e),this._mesh.frustumCulled=!1}render(e){e.render(this._mesh,Lt)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}dispose(){this._mesh.material.dispose(),this._mesh.geometry.dispose()}},zt={uniforms:{sceneDiffuse:{value:null},sceneDepth:{value:null},sceneNormal:{value:null},projMat:{value:new i},viewMat:{value:new i},projViewMat:{value:new i},projectionMatrixInv:{value:new i},viewMatrixInv:{value:new i},cameraPos:{value:new M},resolution:{value:new He},biasAdjustment:{value:new He},time:{value:0},samples:{value:[]},bluenoise:{value:null},distanceFalloff:{value:1},radius:{value:5},near:{value:.1},far:{value:1e3},ortho:{value:!1},screenSpaceRadius:{value:!1},frame:{value:0}},depthWrite:!1,depthTest:!1,vertexShader:`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1);
}`,fragmentShader:`
    #define SAMPLES 16
    #define FSAMPLES 16.0
uniform sampler2D sceneDiffuse;
uniform highp sampler2D sceneNormal;
uniform highp sampler2D sceneDepth;
uniform mat4 projectionMatrixInv;
uniform mat4 viewMatrixInv;
uniform mat4 projMat;
uniform mat4 viewMat;
uniform mat4 projViewMat;
uniform vec3 cameraPos;
uniform vec2 resolution;
uniform vec2 biasAdjustment;
uniform float time;
uniform vec3[SAMPLES] samples;
uniform float radius;
uniform float distanceFalloff;
uniform float near;
uniform float far;
uniform float frame;
uniform bool ortho;
uniform bool screenSpaceRadius;
uniform sampler2D bluenoise;
    varying vec2 vUv;
    highp float linearize_depth(highp float d, highp float zNear,highp float zFar)
    {
        return (zFar * zNear) / (zFar - d * (zFar - zNear));
    }
    highp float linearize_depth_ortho(highp float d, highp float nearZ, highp float farZ) {
      return nearZ + (farZ - nearZ) * d;
    }
    highp float linearize_depth_log(highp float d, highp float nearZ,highp float farZ) {
      float depth = pow(2.0, d * log2(farZ + 1.0)) - 1.0;
      float a = farZ / (farZ - nearZ);
      float b = farZ * nearZ / (nearZ - farZ);
      float linDepth = a + b / depth;
      /*return ortho ? linearize_depth_ortho(
        linDepth,
        nearZ,
        farZ
      ) :linearize_depth(linDepth, nearZ, farZ);*/
       #ifdef ORTHO

       return linearize_depth_ortho(d, nearZ, farZ);

        #else
        return linearize_depth(linDepth, nearZ, farZ);
        #endif
    }

    vec3 getWorldPosLog(vec3 posS) {
      vec2 uv = posS.xy;
      float z = posS.z;
      float nearZ =near;
      float farZ = far;
      float depth = pow(2.0, z * log2(farZ + 1.0)) - 1.0;
      float a = farZ / (farZ - nearZ);
      float b = farZ * nearZ / (nearZ - farZ);
      float linDepth = a + b / depth;
      vec4 clipVec = vec4(uv, linDepth, 1.0) * 2.0 - 1.0;
      vec4 wpos = projectionMatrixInv * clipVec;
      return wpos.xyz / wpos.w;
    }
    float depthToClipZ(float depth) {
      #ifdef REVERSEDEPTH
        return depth;
      #else
        return depth * 2.0 - 1.0;
      #endif
    }
    bool isBackgroundDepth(float depth) {
      #ifdef REVERSEDEPTH
        return depth == 0.0;
      #else
        return depth == 1.0;
      #endif
    }
    vec3 getWorldPos(float depth, vec2 coord) {
      #ifdef LOGDEPTH
        #ifndef ORTHO
          return getWorldPosLog(vec3(coord, depth));
        #endif
      #endif
      #ifdef ORTHO
        float z = depthToClipZ(depth);
        vec4 clipSpacePosition = vec4(coord * 2. - 1., z, 1.);
        vec4 viewSpacePosition = projectionMatrixInv * clipSpacePosition;
        viewSpacePosition.xyz /= viewSpacePosition.w;
        return viewSpacePosition.xyz;
      #else
        vec2 ndc = coord * 2. - 1.;
        float ndcZ = depthToClipZ(depth);
        mat4 Q = projectionMatrixInv;
        vec3 view = vec3(Q[0][0] * ndc.x + Q[3][0], Q[1][1] * ndc.y + Q[3][1], Q[3][2]);
        float invW = 1. / (Q[2][3] * ndcZ + Q[3][3]);
        return view * invW;
      #endif
  }

  vec3 computeNormal(vec3 worldPos, vec2 vUv) {
    ivec2 p = ivec2(vUv * resolution);
    float c0 = texelFetch(sceneDepth, p, 0).x;
    float l2 = texelFetch(sceneDepth, p - ivec2(2, 0), 0).x;
    float l1 = texelFetch(sceneDepth, p - ivec2(1, 0), 0).x;
    float r1 = texelFetch(sceneDepth, p + ivec2(1, 0), 0).x;
    float r2 = texelFetch(sceneDepth, p + ivec2(2, 0), 0).x;
    float b2 = texelFetch(sceneDepth, p - ivec2(0, 2), 0).x;
    float b1 = texelFetch(sceneDepth, p - ivec2(0, 1), 0).x;
    float t1 = texelFetch(sceneDepth, p + ivec2(0, 1), 0).x;
    float t2 = texelFetch(sceneDepth, p + ivec2(0, 2), 0).x;

    float dl = abs((2.0 * l1 - l2) - c0);
    float dr = abs((2.0 * r1 - r2) - c0);
    float db = abs((2.0 * b1 - b2) - c0);
    float dt = abs((2.0 * t1 - t2) - c0);

    vec3 ce = getWorldPos(c0, vUv).xyz;

    vec3 dpdx = (dl < dr) ? ce - getWorldPos(l1, (vUv - vec2(1.0 / resolution.x, 0.0))).xyz
                          : -ce + getWorldPos(r1, (vUv + vec2(1.0 / resolution.x, 0.0))).xyz;
    vec3 dpdy = (db < dt) ? ce - getWorldPos(b1, (vUv - vec2(0.0, 1.0 / resolution.y))).xyz
                          : -ce + getWorldPos(t1, (vUv + vec2(0.0, 1.0 / resolution.y))).xyz;

    return normalize(cross(dpdx, dpdy));
}

mat3 makeRotationZ(float theta) {
	float c = cos(theta);
	float s = sin(theta);
	return mat3(c, - s, 0,
			s,  c, 0,
			0,  0, 1);
  }

void main() {
      vec4 diffuse = texture2D(sceneDiffuse, vUv);
      float depth = texture2D(sceneDepth, vUv).x;
      if (isBackgroundDepth(depth)) {
        gl_FragColor = vec4(vec3(1.0), 1.0);
        return;
      }
      vec3 worldPos = getWorldPos(depth, vUv);
      #ifdef HALFRES
        vec3 normal = texture2D(sceneNormal, vUv).rgb;
      #else
        vec3 normal = computeNormal(worldPos, vUv);
      #endif
      vec4 noise = texture2D(bluenoise, gl_FragCoord.xy / 128.0);
      vec2 harmoniousNumbers = vec2(
        1.618033988749895,
        1.324717957244746
      );
      noise.rg += harmoniousNumbers * frame;
      noise.rg = fract(noise.rg);
        vec3 helperVec = vec3(0.0, 1.0, 0.0);
        if (dot(helperVec, normal) > 0.99) {
          helperVec = vec3(1.0, 0.0, 0.0);
        }
        vec3 tangent = normalize(cross(helperVec, normal));
        vec3 bitangent = cross(normal, tangent);
        mediump mat3 tbn = mat3(tangent, bitangent, normal) *  makeRotationZ( noise.r * 3.1415962 * 2.0) ;

      mediump float occluded = 0.0;
      mediump float totalWeight = 0.0;
      float radiusToUse = screenSpaceRadius ? distance(
        worldPos,
        getWorldPos(depth, vUv +
          vec2(radius, 0.0) / resolution)
      ) : radius;
      float distanceFalloffToUse =screenSpaceRadius ?
          radiusToUse * distanceFalloff
      : radiusToUse * distanceFalloff * 0.2;
      float bias = (min(
        0.1,
        distanceFalloffToUse * 0.1
      ) / near) * fwidth(distance(worldPos, cameraPos)) / radiusToUse;
      bias = biasAdjustment.x + biasAdjustment.y * bias;
      mediump float offsetMove = noise.g;
      mediump float offsetMoveInv = 1.0 / FSAMPLES;
      float farTimesNear = far * near;
      float farMinusNear = far - near;
      
      for(int i = 0; i < SAMPLES; i++) {
        mediump vec3 sampleDirection = tbn * samples[i];

        float moveAmt = fract(offsetMove);
        offsetMove += offsetMoveInv;
        vec3 samplePos = worldPos + radiusToUse * moveAmt * sampleDirection;
        vec4 offset = projMat * vec4(samplePos, 1.0);
        offset.xyz /= offset.w;
        offset.xy = offset.xy * 0.5 + 0.5;
        #ifndef REVERSEDEPTH
        offset.z = offset.z * 0.5 + 0.5;
        #endif
        
        if (all(greaterThan(offset.xyz * (1.0 - offset.xyz), vec3(0.0)))) {
          float sampleDepth = textureLod(sceneDepth, offset.xy, 0.0).x;

          /*#ifdef LOGDEPTH
          float distSample = linearize_depth_log(sampleDepth, near, far);
      #else
          #ifdef ORTHO
              float distSample = near + farMinusNear * sampleDepth;
          #else
              float distSample = (farTimesNear) / (far - sampleDepth * farMinusNear);
          #endif
      #endif*/
      #ifdef REVERSEDEPTH
          float distSample = -getWorldPos(sampleDepth, offset.xy).z;
      #else
        #ifdef ORTHO
          float distSample = near + sampleDepth * farMinusNear;
        #else
          #ifdef LOGDEPTH
              float distSample = linearize_depth_log(sampleDepth, near, far);
          #else
              float distSample = (farTimesNear) / (far - sampleDepth * farMinusNear);
          #endif
        #endif
      #endif
      
      #ifdef REVERSEDEPTH
          float distWorld = -samplePos.z;
      #else
        #ifdef ORTHO
          float distWorld = near + offset.z * farMinusNear;
        #else
          float distWorld = (farTimesNear) / (far - offset.z * farMinusNear);
        #endif
      #endif
          
          mediump float rangeCheck = smoothstep(0.0, 1.0, distanceFalloffToUse / (abs(distSample - distWorld)));
          vec2 diff = gl_FragCoord.xy - floor(offset.xy * resolution);
          occluded += rangeCheck * float(distSample != distWorld) * float(sampleDepth != depth) * step(distSample + bias, distWorld) * step(
            1.0,
            dot(diff, diff)
          );
          
          totalWeight ++;
        }
      }
      float occ = clamp(1.0 - occluded / (totalWeight == 0.0 ? 1.0 : totalWeight), 0.0, 1.0);
      gl_FragColor = vec4(occ, 0.5 + 0.5 * normal);
}`},Bt={uniforms:{sceneDiffuse:{value:null},sceneDepth:{value:null},tDiffuse:{value:null},transparencyDWFalse:{value:null},transparencyDWTrue:{value:null},transparencyDWTrueDepth:{value:null},transparencyAware:{value:!1},projMat:{value:new i},viewMat:{value:new i},projectionMatrixInv:{value:new i},resolution:{value:new He},color:{value:new M(0,0,0)},blueNoise:{value:null},downsampledDepth:{value:null},time:{value:0},intensity:{value:10},renderMode:{value:0},gammaCorrection:{value:!1},ortho:{value:!1},near:{value:.1},far:{value:1e3},screenSpaceRadius:{value:!1},radius:{value:0},distanceFalloff:{value:1},fog:{value:!1},fogExp:{value:!1},fogDensity:{value:0},fogNear:{value:1/0},fogFar:{value:1/0},colorMultiply:{value:!0},aoTones:{value:0}},depthWrite:!1,depthTest:!1,vertexShader:`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = vec4(position, 1);
		}`,fragmentShader:`
		uniform sampler2D sceneDiffuse;
    uniform highp sampler2D sceneDepth;
    uniform highp sampler2D downsampledDepth;
    uniform highp sampler2D transparencyDWFalse;
    uniform highp sampler2D transparencyDWTrue;
    uniform highp sampler2D transparencyDWTrueDepth;
    uniform sampler2D tDiffuse;
    uniform sampler2D blueNoise;
    uniform vec2 resolution;
    uniform vec3 color;
    uniform mat4 projectionMatrixInv;
    uniform float intensity;
    uniform float renderMode;
    uniform float near;
    uniform float far;
    uniform float aoTones;
    uniform bool gammaCorrection;
    uniform bool ortho;
    uniform bool screenSpaceRadius;
    uniform bool fog;
    uniform bool fogExp;
    uniform bool colorMultiply;
    uniform bool transparencyAware;
    uniform float fogDensity;
    uniform float fogNear;
    uniform float fogFar;
    uniform float radius;
    uniform float distanceFalloff;
    varying vec2 vUv;
    highp float linearize_depth(highp float d, highp float zNear,highp float zFar)
    {
        return (zFar * zNear) / (zFar - d * (zFar - zNear));
    }
    highp float linearize_depth_ortho(highp float d, highp float nearZ, highp float farZ) {
      return nearZ + (farZ - nearZ) * d;
    }
    highp float linearize_depth_log(highp float d, highp float nearZ,highp float farZ) {
      float depth = pow(2.0, d * log2(farZ + 1.0)) - 1.0;
      float a = farZ / (farZ - nearZ);
      float b = farZ * nearZ / (nearZ - farZ);
      float linDepth = a + b / depth;
      return ortho ? linearize_depth_ortho(
        linDepth,
        nearZ,
        farZ
      ) :linearize_depth(linDepth, nearZ, farZ);
    }
    vec3 getWorldPosLog(vec3 posS) {
        vec2 uv = posS.xy;
        float z = posS.z;
        float nearZ =near;
        float farZ = far;
        float depth = pow(2.0, z * log2(farZ + 1.0)) - 1.0;
        float a = farZ / (farZ - nearZ);
        float b = farZ * nearZ / (nearZ - farZ);
        float linDepth = a + b / depth;
        vec4 clipVec = vec4(uv, linDepth, 1.0) * 2.0 - 1.0;
        vec4 wpos = projectionMatrixInv * clipVec;
        return wpos.xyz / wpos.w;
      }
      float depthToClipZ(float depth) {
        #ifdef REVERSEDEPTH
          return depth;
        #else
          return depth * 2.0 - 1.0;
        #endif
      }
      bool isBackgroundDepth(float depth) {
        #ifdef REVERSEDEPTH
          return depth == 0.0;
        #else
          return depth == 1.0;
        #endif
      }
      vec3 getWorldPos(float depth, vec2 coord) {
        #ifdef LOGDEPTH
          #ifndef ORTHO
            return getWorldPosLog(vec3(coord, depth));
          #endif
        #endif
      //  }
        #ifdef ORTHO
          float z = depthToClipZ(depth);
          vec4 clipSpacePosition = vec4(coord * 2. - 1., z, 1.);
          vec4 viewSpacePosition = projectionMatrixInv * clipSpacePosition;
          viewSpacePosition.xyz /= viewSpacePosition.w;
          return viewSpacePosition.xyz;
        #else
          vec2 ndc = coord * 2. - 1.;
          float ndcZ = depthToClipZ(depth);
          mat4 Q = projectionMatrixInv;
          vec3 view = vec3(Q[0][0] * ndc.x + Q[3][0], Q[1][1] * ndc.y + Q[3][1], Q[3][2]);
          float invW = 1. / (Q[2][3] * ndcZ + Q[3][3]);
          return view * invW;
        #endif
    }
  
    vec3 computeNormal(vec3 worldPos, vec2 vUv) {
      ivec2 p = ivec2(vUv * resolution);
      float c0 = texelFetch(sceneDepth, p, 0).x;
      float l2 = texelFetch(sceneDepth, p - ivec2(2, 0), 0).x;
      float l1 = texelFetch(sceneDepth, p - ivec2(1, 0), 0).x;
      float r1 = texelFetch(sceneDepth, p + ivec2(1, 0), 0).x;
      float r2 = texelFetch(sceneDepth, p + ivec2(2, 0), 0).x;
      float b2 = texelFetch(sceneDepth, p - ivec2(0, 2), 0).x;
      float b1 = texelFetch(sceneDepth, p - ivec2(0, 1), 0).x;
      float t1 = texelFetch(sceneDepth, p + ivec2(0, 1), 0).x;
      float t2 = texelFetch(sceneDepth, p + ivec2(0, 2), 0).x;
  
      float dl = abs((2.0 * l1 - l2) - c0);
      float dr = abs((2.0 * r1 - r2) - c0);
      float db = abs((2.0 * b1 - b2) - c0);
      float dt = abs((2.0 * t1 - t2) - c0);
  
      vec3 ce = getWorldPos(c0, vUv).xyz;
  
      vec3 dpdx = (dl < dr) ? ce - getWorldPos(l1, (vUv - vec2(1.0 / resolution.x, 0.0))).xyz
                            : -ce + getWorldPos(r1, (vUv + vec2(1.0 / resolution.x, 0.0))).xyz;
      vec3 dpdy = (db < dt) ? ce - getWorldPos(b1, (vUv - vec2(0.0, 1.0 / resolution.y))).xyz
                            : -ce + getWorldPos(t1, (vUv + vec2(0.0, 1.0 / resolution.y))).xyz;
  
      return normalize(cross(dpdx, dpdy));
  }

    #include <common>
    #include <dithering_pars_fragment>
    void main() {
        //vec4 texel = texture2D(tDiffuse, vUv);//vec3(0.0);
        vec4 sceneTexel = texture2D(sceneDiffuse, vUv);
        float depth = texture2D(sceneDepth, vUv).x;
        #ifdef HALFRES 
        vec4 texel = vec4(0.0);
        if (isBackgroundDepth(depth)) {
            texel = vec4(1.0, 0.0, 0.0, 1.0);
        } else {
        vec3 worldPos = getWorldPos(depth, vUv);
        vec3 normal = computeNormal(getWorldPos(depth, vUv), vUv);
       // vec4 texel = texture2D(tDiffuse, vUv);
       // Find closest depth;
       float totalWeight = 0.0;
       float radiusToUse = screenSpaceRadius ? distance(
        worldPos,
        getWorldPos(depth, vUv +
          vec2(radius, 0.0) / resolution)
      ) : radius;
      float distanceFalloffToUse =screenSpaceRadius ?
          radiusToUse * distanceFalloff
      : distanceFalloff;
        for(float x = -1.0; x <= 1.0; x++) {
            for(float y = -1.0; y <= 1.0; y++) {
                vec2 offset = vec2(x, y);
                ivec2 p = ivec2(
                    (vUv * resolution * 0.5) + offset
                );
                vec2 pUv = vec2(p) / (resolution * 0.5);
                float sampleDepth = texelFetch(downsampledDepth,p, 0).x;
                vec4 sampleInfo = texelFetch(tDiffuse, p, 0);
                vec3 normalSample = sampleInfo.gba * 2.0 - 1.0;
                vec3 worldPosSample = getWorldPos(sampleDepth, pUv);
                float tangentPlaneDist = abs(dot(worldPosSample - worldPos, normal));
                float rangeCheck = exp(-1.0 * tangentPlaneDist * (1.0 / distanceFalloffToUse)) * max(dot(normal, normalSample), 0.0);
                float weight = rangeCheck;
                totalWeight += weight;
                texel += sampleInfo * weight;
            }
        }
        if (totalWeight == 0.0) {
            texel = texture2D(tDiffuse, vUv);
        } else {
            texel /= totalWeight;
        }
    }
        #else
        vec4 texel = texture2D(tDiffuse, vUv);
        #endif

        #ifdef LOGDEPTH
        texel.r = clamp(texel.r, 0.0, 1.0);
        if (texel.r == 0.0) {
          texel.r = 1.0;
        }
        #endif
     
        float finalAo = pow(texel.r, intensity);
        if (aoTones > 0.0) {
            finalAo = ceil(finalAo * aoTones) / aoTones;
        }
        float fogFactor = 0.0;
        if (fog) {
            float fogDepth = -getWorldPos(depth, vUv).z;
            if (fogExp) {
                fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );
            } else {
                fogFactor = smoothstep( fogNear, fogFar, fogDepth );
            }
        }
        if (transparencyAware) {
            float transparencyDWOff = texture2D(transparencyDWFalse, vUv).a;
            float transparencyDWOn = texture2D(transparencyDWTrue, vUv).a;
            float adjustmentFactorOff = transparencyDWOff;
            float depthSample = texture2D(sceneDepth, vUv).r;
            float trueDepthSample = texture2D(transparencyDWTrueDepth, vUv).r;
            float adjustmentFactorOn = (1.0 - transparencyDWOn) * (
                trueDepthSample == depthSample ? 1.0 : 0.0
            );
            float adjustmentFactor = max(adjustmentFactorOff, adjustmentFactorOn);
            finalAo = mix(finalAo, 1.0, adjustmentFactor);
        }
        finalAo = mix(finalAo, 1.0, fogFactor);
        vec3 aoApplied = color * mix(vec3(1.0), sceneTexel.rgb, float(colorMultiply));
        if (renderMode == 0.0) {
            gl_FragColor = vec4( mix(sceneTexel.rgb, aoApplied, 1.0 - finalAo), sceneTexel.a);
        } else if (renderMode == 1.0) {
            gl_FragColor = vec4( mix(vec3(1.0), aoApplied, 1.0 - finalAo), sceneTexel.a);
        } else if (renderMode == 2.0) {
            gl_FragColor = vec4( sceneTexel.rgb, sceneTexel.a);
        } else if (renderMode == 3.0) {
            if (vUv.x < 0.5) {
                gl_FragColor = vec4( sceneTexel.rgb, sceneTexel.a);
            } else if (abs(vUv.x - 0.5) < 1.0 / resolution.x) {
                gl_FragColor = vec4(1.0);
            } else {
                gl_FragColor = vec4( mix(sceneTexel.rgb, aoApplied, 1.0 - finalAo), sceneTexel.a);
            }
        } else if (renderMode == 4.0) {
            if (vUv.x < 0.5) {
                gl_FragColor = vec4( sceneTexel.rgb, sceneTexel.a);
            } else if (abs(vUv.x - 0.5) < 1.0 / resolution.x) {
                gl_FragColor = vec4(1.0);
            } else {
                gl_FragColor = vec4( mix(vec3(1.0), aoApplied, 1.0 - finalAo), sceneTexel.a);
            }
        }
        #include <dithering_fragment>
        if (gammaCorrection) {
            gl_FragColor = sRGBTransferOETF(gl_FragColor);
        }
    }
    `},z={};z=JSON.parse(`{"architecture":"attention-v3-int8","formatVersion":3,"globalBias":[-0.32877659797668457,0.4370867609977722,-0.05251404270529747,1.3072023391723633,0.0477047860622406,0.24477416276931763,0.009111796505749226,-0.17459993064403534],"globalFeatureInverseStandardDeviation":[10.771836280822754,1.9548665285110474,1.612365484237671],"globalFeatureMean":[0.9198138117790222,-0.49808526039123535,0.03374629095196724],"globalWeights":[101,-4,7,-127,6,-11,3,1,0,-16,-7,8,-8,-1,7,-4,0,0,-12,-3,-13,1,0,2],"headBias":[-0.15895532071590424,0.007501596584916115,-0.47742825746536255,0.01632097363471985,-0.48355796933174133,-0.1052703931927681,-0.8414919376373291,-0.21046382188796997],"headWeights":[-45,-7,-45,-20,7,-13,120,-24,-15,-26,-19,1,27,-48,-4,-10,1,-5,-24,64,91,-1,-68,39,54,39,101,-40,-127,64,-41,-17,-23,-19,3,35,-2,33,3,9,-64,-32,30,42,-112,12,28,-11,15,2,-4,-7,7,-3,-5,1,76,48,-34,-67,103,-40,-26,1,58,-11,46,-41,5,-6,-17,-8,13,17,-35,45,27,-17,-28,7,-53,12,-51,6,-32,-5,58,-9,-28,-21,37,-12,1,20,2,2,11,7,-4,-9,2,-15,-1,-8,16,12,-27,-1,61,-5,-1,4,-7,-2,7,4,1,4,-2,4,-18,-16,28,6,-65,16,3,-3,-5,-2,0,-40,-21,-22,14,30,-21,49,15,-64,43,19,23,18,5,-15,21,21,30,17,-11,-6,22,-38,-20,97,-46,-5,-13,-59,26,-13,11,-2,-10,-8,2,-15,-17,-27,-9,26,7,-7,6,9,-32,5,-9,12,49,17,-1,24,20,35,14,-33,-50,-1,-4,-26,11,11,9,-80,30,9,36,6,-12,-4,-7,39,-10,-30,-49,1,-43,-20,-34,76,-36,-10,15,-8,43,31,38,-42,39,37,-7,7,8,16,28,-83,32,9,23,-13,39,119,23,-127,-24,8,-48,-29,-7,-33,-12,58,-24,-29,-19,12,-55,-90,0,126,26,42,54,22],"keyProjectionWeights":[0,-1,-1,1,1,1,1,1,-64,32,49,23,-25,4,27,-22,0,1,-1,-1,-1,1,1,0,-34,38,64,88,13,-53,-41,58,-7,-4,79,-41,27,26,14,2,-2,1,1,1,-1,-1,1,1,1,-1,-1,-1,-1,-1,1,1,4,-3,126,42,-40,-116,35,20],"name":"residual-attention-v3-50m-qat-int8-epoch-25-zo-278w","outputBias":-0.0005526235327124596,"outputWeights":[11,11,14,-27,9,-22,127,6],"quantization":{"scales":{"globalWeight":0.021090541950849095,"headWeight":0.04935851140909355,"keyWeight":0.1733924937791441,"outputWeight":0.0030087142047955295,"tapInputWeight":0.1096231754049479,"tapOutputWeight":0.017949438644286102,"valueWeight":0.013986751242596301},"scheme":"symmetric-int8-per-tensor","zeroPoint":0},"summaryQueries":[0.0038647791370749474,0.09565000981092453,0.002756686182692647,-0.08183622360229492,-0.15209506452083588,-0.0006105066277086735,0.0010439646430313587,-0.03020688332617283,0.005065929610282183,0.14488759636878967,0.003160916268825531,-0.0855727270245552,-0.3123375475406647,0.00039022407145239413,0.0037786494940519333,0.1451321840286255,-0.002009483054280281,0.0597594790160656,0.0045239729806780815,-0.08765853196382523,-0.13884992897510529,-0.0021647117100656033,0.003985927440226078,0.09727758169174194,0.007170629221946001,0.0786278173327446,0.004103775601834059,-0.1198369711637497,-0.2925199568271637,-0.002055276418104768,0.0030450925696641207,0.14401987195014954],"supportedDenoiseSamples":[4,8,16],"tapFeatureInverseStandardDeviation":[2.283243417739868,0.8810898065567017,0.8210930228233337,3.752316474914551,3.6375720500946045,2.670454978942871,10.249449729919434,0.12639354169368744,100],"tapFeatureMean":[0.010318092070519924,0.01364430133253336,0.13411010801792145,-0.004725644364953041,0.10053129494190216,0.8384788632392883,0.9203217625617981,1.7139031887054443,1],"tapInputBias":[0.4780646860599518,-0.45214661955833435,0.289407879114151,0.34804567694664,-0.1320028454065323,0.17722633481025696,0.011480014771223068,-0.26692497730255127],"tapInputWeights":[0,1,7,0,-1,-7,0,31,-2,-1,14,-126,0,0,-1,2,26,-2,0,66,-73,0,0,0,-12,22,-3,0,-76,-90,0,-1,-7,-3,58,-1,0,2,6,0,0,3,4,-40,0,0,3,-13,0,0,1,-7,-13,0,0,-7,10,0,-2,-7,0,-39,-2,0,-13,-19,0,-2,20,-1,3,-1],"tapOutputBias":[-0.3867710530757904,0.1349504142999649,0.35706064105033875,-0.5938405394554138,-0.031154220923781395,1.4079623222351074,-1.9221038818359375,0.6029739379882812],"tapOutputWeights":[18,-4,47,19,74,-94,-21,-9,73,-59,88,-10,-3,71,-7,24,20,74,24,-31,-12,-10,-15,-45,-126,2,-4,27,-5,24,35,-11,-4,9,-8,26,-10,27,26,-20,17,-50,5,-35,0,-5,12,-71,89,-58,22,-83,-115,7,-16,-89,89,22,1,-20,-22,-25,-26,44],"valueProjectionWeights":[-16,-6,40,-17,84,-76,59,51,-10,-2,-10,-1,-23,74,-70,23,-5,4,4,-7,-77,127,20,-48,-36,4,-17,-12,-4,10,29,-27,-2,11,-47,-50,-54,-3,14,11,-23,-1,109,31,4,-100,-33,-36,-19,0,-8,20,-35,-24,79,2,44,2,5,7,22,-70,-67,-35]}`);var Vt=[[`tapInputWeight`,`tapInputWeights`,8,9],[`tapOutputWeight`,`tapOutputWeights`,8,8],[`globalWeight`,`globalWeights`,8,3],[`keyWeight`,`keyProjectionWeights`,8,8],[`valueWeight`,`valueProjectionWeights`,8,8],[`headWeight`,`headWeights`,8,32],[`outputWeight`,`outputWeights`,1,8]],Ht=e=>{let t=R(z).quantization?.scales?.[e];if(!(t>0)||!Number.isFinite(t))throw Error(`The bundled N8AO neural model has no valid ${e} scale.`);return t};if(R(z).architecture!==`attention-v3-int8`||R(z).formatVersion!==3||R(z).quantization?.scheme!==`symmetric-int8-per-tensor`||R(z).quantization?.zeroPoint!==0||R(z).supportedDenoiseSamples?.join(`,`)!==`4,8,16`||Vt.some(([,e,t,n])=>R(z)[e]?.length!==t*n||R(z)[e].some(e=>!Number.isInteger(e)||e<-127||e>127)))throw Error(`The bundled N8AO neural denoise model has an unsupported layout.`);var Ut=e=>{if(!Number.isFinite(e))throw Error(`The bundled N8AO neural model contains a non-finite value.`);if(Object.is(e,-0))return`0.0`;let t=Number(e).toString();return/[.eE]/.test(t)?t:`${t}.0`},Wt=[`x`,`y`,`z`,`w`],Gt=e=>[...Wt.map(t=>`${e}.lo.${t}`),...Wt.map(t=>`${e}.hi.${t}`)],Kt=(e,t)=>e===0?null:e===1?t:e===-1?`(-${t})`:e<0?`(-${Ut(-e)} * ${t})`:`${Ut(e)} * ${t}`,qt=(e,t)=>e===0?null:`${Ut(e)} * ${t}`,Jt=e=>e.filter(Boolean).join(` + `)||`0.0`,Yt=(e,t,n,r,i,a)=>{let o=r.map((r,i)=>Kt(e[t*n+i],r));return`${Ut(i)} * (${Jt(o)}) + ${Ut(a[t])}`},Xt=(e,t=`        `)=>`vec4(\n${e.map(e=>`${t}    ${e}`).join(`,
`)}\n${t})`,Zt=({functionName:e,scaleName:t,weights:n,bias:r,width:i=8,relu:a=!1})=>{let o=Gt(`inputToken`),s=Ht(t),c=Array.from({length:8},(e,t)=>Yt(n,t,i,o,s,r)),l=Xt(c.slice(0,4)),u=Xt(c.slice(4)),d=e=>a?`max(${e}, vec4(0.0))`:e;return`
    NeuralToken neural${e[0].toUpperCase()}${e.slice(1)}(NeuralToken inputToken) {
        return NeuralToken(
            ${d(l)},
            ${d(u)}
        );
    }
`},Qt=(e,t,n,r,i,a,o,s={})=>Array.from({length:i},(i,c)=>{let l=t[c];for(let t=0;t<a;t++){let i=e[c*a+t]*o;l-=i*r[t]*n[t],Object.hasOwn(s,t)&&(l+=i*r[t]*s[t])}return l}),$t=Ht(`tapInputWeight`),en=Qt(R(z).tapInputWeights,R(z).tapInputBias,R(z).tapFeatureMean,R(z).tapFeatureInverseStandardDeviation,8,9,$t,{8:1}),tn=Gt(`scaledInput`),nn=Array.from({length:8},(e,t)=>Yt(R(z).tapInputWeights,t,9,tn,$t,en)),rn=`
    NeuralToken neuralTapInput(NeuralToken raw) {
        NeuralToken scaledInput = NeuralToken(
            raw.lo * ${Xt(R(z).tapFeatureInverseStandardDeviation.slice(0,4),`            `)},
            raw.hi * ${Xt(R(z).tapFeatureInverseStandardDeviation.slice(4,8),`            `)}
        );
        return NeuralToken(
            max(${Xt(nn.slice(0,4))}, vec4(0.0)),
            max(${Xt(nn.slice(4))}, vec4(0.0))
        );
    }
`,an=Ht(`globalWeight`),on=Qt(R(z).globalWeights,R(z).globalBias,R(z).globalFeatureMean,R(z).globalFeatureInverseStandardDeviation,8,3,an),sn=Wt.slice(0,3).map(e=>`scaledInput.${e}`),cn=Array.from({length:8},(e,t)=>Yt(R(z).globalWeights,t,3,sn,an,on)),ln=`
    NeuralToken neuralEncodeGlobal(vec4 raw) {
        vec3 scaledInput = raw.xyz * vec3(
            ${R(z).globalFeatureInverseStandardDeviation.map(Ut).join(`, `)}
        );
        return NeuralToken(
            max(${Xt(cn.slice(0,4))}, vec4(0.0)),
            max(${Xt(cn.slice(4))}, vec4(0.0))
        );
    }
`,un=Gt(`key`),dn=`
    vec4 neuralQueryScores(NeuralToken key) {
        return ${Xt(Array.from({length:4},(e,t)=>Jt(un.map((e,n)=>qt(R(z).summaryQueries[t*8+n],e)))))};
    }
`,fn=[];for(let e=0;e<4;e++)fn.push(...Wt.map(t=>`runningSummaryLo[${e}].${t}`),...Wt.map(t=>`runningSummaryHi[${e}].${t}`));var pn=Ht(`headWeight`),mn=Array.from({length:8},(e,t)=>Yt(R(z).headWeights,t,32,fn,pn,R(z).headBias)),hn=`
    NeuralToken neuralHead(
        vec4 runningSummaryLo[4],
        vec4 runningSummaryHi[4]
    ) {
        return NeuralToken(
            max(${Xt(mn.slice(0,4))}, vec4(0.0)),
            max(${Xt(mn.slice(4))}, vec4(0.0))
        );
    }
`,gn=`
    float neuralOutput(NeuralToken head) {
        return ${Yt(R(z).outputWeights,0,8,Gt(`head`),Ht(`outputWeight`),[R(z).outputBias])};
    }
`,_n=[rn,Zt({functionName:`tapOutput`,scaleName:`tapOutputWeight`,weights:R(z).tapOutputWeights,bias:R(z).tapOutputBias,relu:!0}),ln,Zt({functionName:`keyProject`,scaleName:`keyWeight`,weights:R(z).keyProjectionWeights,bias:Array(8).fill(0)}),Zt({functionName:`valueProject`,scaleName:`valueWeight`,weights:R(z).valueProjectionWeights,bias:Array(8).fill(0)}),dn,hn,gn].join(`
`);Vt.reduce((e,[,t])=>e+R(z)[t].length,0),Vt.reduce((e,[,t])=>e+R(z)[t].filter(e=>e!==0).length,0);var vn={uniforms:{sceneDiffuse:{value:null},sceneDepth:{value:null},tDiffuse:{value:null},projMat:{value:new i},viewMat:{value:new i},projectionMatrixInv:{value:new i},viewMatrixInv:{value:new i},cameraPos:{value:new M},resolution:{value:new He},time:{value:0},r:{value:5},blueNoise:{value:null},radius:{value:12},worldRadius:{value:5},index:{value:0},poissonDisk:{value:[]},distanceFalloff:{value:1},near:{value:.1},far:{value:1e3},screenSpaceRadius:{value:!1}},depthWrite:!1,depthTest:!1,vertexShader:`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = vec4(position, 1.0);
		}`,fragmentShader:`
		uniform sampler2D sceneDiffuse;
    uniform highp sampler2D sceneDepth;
    uniform sampler2D tDiffuse;
    uniform sampler2D blueNoise;
    uniform mat4 projectionMatrixInv;
    uniform mat4 viewMatrixInv;
    uniform vec2 resolution;
    uniform float r;
    uniform float radius;
     uniform float worldRadius;
    uniform float index;
     uniform float near;
     uniform float far;
     uniform float distanceFalloff;
    uniform bool screenSpaceRadius;
    varying vec2 vUv;

    highp float linearize_depth(highp float d, highp float zNear,highp float zFar)
    {
        highp float z_n = 2.0 * d - 1.0;
        return 2.0 * zNear * zFar / (zFar + zNear - z_n * (zFar - zNear));
    }
    highp float linearize_depth_log(highp float d, highp float nearZ,highp float farZ) {
     float depth = pow(2.0, d * log2(farZ + 1.0)) - 1.0;
     float a = farZ / (farZ - nearZ);
     float b = farZ * nearZ / (nearZ - farZ);
     float linDepth = a + b / depth;
     return linearize_depth(linDepth, nearZ, farZ);
   }
   highp float linearize_depth_ortho(highp float d, highp float nearZ, highp float farZ) {
     return nearZ + (farZ - nearZ) * d;
   }
   float depthToClipZ(float depth) {
     #ifdef REVERSEDEPTH
       return depth;
     #else
       return depth * 2.0 - 1.0;
     #endif
   }
   bool isBackgroundDepth(float depth) {
     #ifdef REVERSEDEPTH
       return depth == 0.0;
     #else
       return depth == 1.0;
     #endif
   }
   vec3 getWorldPosLog(vec3 posS) {
     vec2 uv = posS.xy;
     float z = posS.z;
     float nearZ =near;
     float farZ = far;
     float depth = pow(2.0, z * log2(farZ + 1.0)) - 1.0;
     float a = farZ / (farZ - nearZ);
     float b = farZ * nearZ / (nearZ - farZ);
     float linDepth = a + b / depth;
     vec4 clipVec = vec4(uv, linDepth, 1.0) * 2.0 - 1.0;
     vec4 wpos = projectionMatrixInv * clipVec;
     return wpos.xyz / wpos.w;
   }
    vec3 getWorldPos(float depth, vec2 coord) {
     #ifdef LOGDEPTH
      #ifndef ORTHO
          return getWorldPosLog(vec3(coord, depth));
      #endif
     #endif
        
        #ifdef ORTHO
          float z = depthToClipZ(depth);
          vec4 clipSpacePosition = vec4(coord * 2. - 1., z, 1.);
          vec4 viewSpacePosition = projectionMatrixInv * clipSpacePosition;
          viewSpacePosition.xyz /= viewSpacePosition.w;
          return viewSpacePosition.xyz;
        #else
          vec2 ndc = coord * 2. - 1.;
          float ndcZ = depthToClipZ(depth);
          mat4 Q = projectionMatrixInv;
          vec3 view = vec3(Q[0][0] * ndc.x + Q[3][0], Q[1][1] * ndc.y + Q[3][1], Q[3][2]);
          float invW = 1.0 / (Q[2][3] * ndcZ + Q[3][3]);
          return view * invW;
        #endif
    }

#ifdef NEURAL_DENOISE
    struct NeuralToken {
        highp vec4 lo;
        highp vec4 hi;
    };

    ${_n}

    vec3 neuralSafeNormalize(vec3 value, vec3 fallback) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 1e-12 ? value * inversesqrt(lengthSquared) : fallback;
    }

    mat3 neuralLocalFrame(vec3 inputNormal) {
        vec3 frameNormal = neuralSafeNormalize(inputNormal, vec3(0.0, 0.0, 1.0));
        vec3 helper = abs(frameNormal.z) < 0.999
            ? vec3(0.0, 0.0, 1.0)
            : vec3(0.0, 1.0, 0.0);
        vec3 tangent = neuralSafeNormalize(
            cross(helper, frameNormal),
            vec3(1.0, 0.0, 0.0)
        );
        vec3 bitangent = cross(frameNormal, tangent);
        return transpose(mat3(tangent, bitangent, frameNormal));
    }

    void neuralConsumeToken(
        NeuralToken token,
        inout vec4 runningMaximum,
        inout vec4 runningDenominator,
        inout vec4 runningSummaryLo[4],
        inout vec4 runningSummaryHi[4]
    ) {
        NeuralToken key = neuralKeyProject(token);
        NeuralToken value = neuralValueProject(token);
        vec4 score = neuralQueryScores(key) * 0.3535533905932738;
        vec4 newMaximum = max(runningMaximum, score);
        vec4 oldScale = exp(runningMaximum - newMaximum);
        vec4 newScale = exp(score - newMaximum);

        runningSummaryLo[0] = runningSummaryLo[0] * oldScale.x + value.lo * newScale.x;
        runningSummaryHi[0] = runningSummaryHi[0] * oldScale.x + value.hi * newScale.x;
        runningSummaryLo[1] = runningSummaryLo[1] * oldScale.y + value.lo * newScale.y;
        runningSummaryHi[1] = runningSummaryHi[1] * oldScale.y + value.hi * newScale.y;
        runningSummaryLo[2] = runningSummaryLo[2] * oldScale.z + value.lo * newScale.z;
        runningSummaryHi[2] = runningSummaryHi[2] * oldScale.z + value.hi * newScale.z;
        runningSummaryLo[3] = runningSummaryLo[3] * oldScale.w + value.lo * newScale.w;
        runningSummaryHi[3] = runningSummaryHi[3] * oldScale.w + value.hi * newScale.w;
        runningDenominator = runningDenominator * oldScale + newScale;
        runningMaximum = newMaximum;
    }

    void neuralEncodeTap(
        NeuralToken raw,
        inout vec4 runningMaximum,
        inout vec4 runningDenominator,
        inout vec4 runningSummaryLo[4],
        inout vec4 runningSummaryHi[4]
    ) {
        NeuralToken first = neuralTapInput(raw);
        NeuralToken token = neuralTapOutput(first);
        neuralConsumeToken(
            token,
            runningMaximum,
            runningDenominator,
            runningSummaryLo,
            runningSummaryHi
        );
    }

    float neuralFinish(
        float baselineAO,
        inout vec4 runningMaximum,
        inout vec4 runningDenominator,
        inout vec4 runningSummaryLo[4],
        inout vec4 runningSummaryHi[4]
    ) {
        vec4 raw = vec4(
            baselineAO,
            log(max(worldRadius, 1e-6)),
            log(max(distanceFalloff, 1e-6)),
            0.0
        );
        NeuralToken token = neuralEncodeGlobal(raw);
        neuralConsumeToken(
            token,
            runningMaximum,
            runningDenominator,
            runningSummaryLo,
            runningSummaryHi
        );

        vec4 inverseDenominator = 1.0 / max(runningDenominator, vec4(1e-12));
        runningSummaryLo[0] *= inverseDenominator.x;
        runningSummaryHi[0] *= inverseDenominator.x;
        runningSummaryLo[1] *= inverseDenominator.y;
        runningSummaryHi[1] *= inverseDenominator.y;
        runningSummaryLo[2] *= inverseDenominator.z;
        runningSummaryHi[2] *= inverseDenominator.z;
        runningSummaryLo[3] *= inverseDenominator.w;
        runningSummaryHi[3] *= inverseDenominator.w;

        NeuralToken head = neuralHead(runningSummaryLo, runningSummaryHi);
        return neuralOutput(head);
    }
#endif

    #include <common>
    #define NUM_SAMPLES __N8AO_DENOISE_SAMPLES__
    uniform vec2 poissonDisk[NUM_SAMPLES];
    void main() {
        const float pi = 3.14159;
        vec2 texelSize = vec2(1.0 / resolution.x, 1.0 / resolution.y);
        vec2 uv = vUv;
        vec4 data = texture2D(tDiffuse, vUv);
        float occlusion = data.r;
        float baseOcc = data.r;
        vec3 normal = data.gba * 2.0 - 1.0;
        float count = 1.0;
        float d = texture2D(sceneDepth, vUv).x;
        if (isBackgroundDepth(d)) {
          gl_FragColor = data;
          return;
        }
        vec3 worldPos = getWorldPos(d, vUv);
        float size = radius;
        float angle;
#ifdef NEURAL_DENOISE
        // The neural material is only bound for denoise iteration two.
        angle = texture2D(blueNoise, gl_FragCoord.xy / 128.0).z * PI2;
#else
        if (index == 0.0) {
             angle = texture2D(blueNoise, gl_FragCoord.xy / 128.0).w * PI2;
        } else if (index == 1.0) {
             angle = texture2D(blueNoise, gl_FragCoord.xy / 128.0).z * PI2;
        } else if (index == 2.0) {
             angle = texture2D(blueNoise, gl_FragCoord.xy / 128.0).y * PI2;
        } else {
             angle = texture2D(blueNoise, gl_FragCoord.xy / 128.0).x * PI2;
        }
#endif

        mat2 rotationMatrix = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        float radiusToUse = screenSpaceRadius ? distance(
          worldPos,
          getWorldPos(d, vUv +
            vec2(worldRadius, 0.0) / resolution)
        ) : worldRadius;
        float distanceFalloffToUse =screenSpaceRadius ?
        radiusToUse * distanceFalloff
    : radiusToUse * distanceFalloff * 0.2;

        float invDistance = (1.0 / distanceFalloffToUse);
#ifdef NEURAL_DENOISE
        mat3 neuralWorldToLocal = neuralLocalFrame(normal);
        float neuralInverseRadius = 1.0 / max(radiusToUse, 1e-6);
        float neuralInverseDistance = 1.0 / max(distanceFalloffToUse, 1e-6);
        vec4 neuralMaximum = vec4(-1e30);
        vec4 neuralDenominator = vec4(0.0);
        vec4 neuralSummaryLo[4];
        vec4 neuralSummaryHi[4];
        for (int query = 0; query < 4; query++) {
            neuralSummaryLo[query] = vec4(0.0);
            neuralSummaryHi[query] = vec4(0.0);
        }
#endif
        for(int i = 0; i < NUM_SAMPLES; i++) {
            vec2 offset = (rotationMatrix * poissonDisk[i]) * texelSize * size;
            vec4 dataSample = texture2D(tDiffuse, uv + offset);
            float occSample = dataSample.r;
            vec3 normalSample = dataSample.gba * 2.0 - 1.0;
            float dSample = texture2D(sceneDepth, uv + offset).x;
            vec3 worldPosSample = getWorldPos(dSample, uv + offset);
            float tangentPlaneDist = abs(dot(worldPosSample - worldPos, normal));
            float rangeCheck = float(!isBackgroundDepth(dSample)) * exp(-1.0 * tangentPlaneDist * invDistance ) * max(dot(normal, normalSample), 0.0);
            occlusion += occSample * rangeCheck;
            count += rangeCheck;
#ifdef NEURAL_DENOISE
            if (!isBackgroundDepth(dSample)) {
                vec3 localDelta = (neuralWorldToLocal * (worldPosSample - worldPos))
                    * neuralInverseRadius;
                vec3 localNormal = neuralWorldToLocal
                    * neuralSafeNormalize(normalSample, vec3(0.0, 0.0, 1.0));
                NeuralToken rawTap = NeuralToken(
                    vec4(localDelta, localNormal.x),
                    vec4(
                        localNormal.y,
                        localNormal.z,
                        occSample,
                        tangentPlaneDist * neuralInverseDistance
                    )
                );
                neuralEncodeTap(
                    rawTap,
                    neuralMaximum,
                    neuralDenominator,
                    neuralSummaryLo,
                    neuralSummaryHi
                );
            }
#endif
        }
        if (count > 0.0) {
          occlusion /= count;
        }
        occlusion = clamp(occlusion, 0.0, 1.0);
        if (occlusion == 0.0) {
          occlusion = 1.0;
        }
#ifdef NEURAL_DENOISE
        occlusion = clamp(
            occlusion + neuralFinish(
                occlusion,
                neuralMaximum,
                neuralDenominator,
                neuralSummaryLo,
                neuralSummaryHi
            ),
            0.0,
            1.0
        );
#endif
        gl_FragColor = vec4(occlusion, 0.5 + 0.5 * normal);
    }
    `},yn={uniforms:{sceneDepth:{value:null},resolution:{value:new He},near:{value:.1},far:{value:1e3},viewMatrixInv:{value:new i},projectionMatrixInv:{value:new i},logDepth:{value:!1},ortho:{value:!1}},depthWrite:!1,depthTest:!1,vertexShader:`
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1);
    }`,fragmentShader:`
    uniform highp sampler2D sceneDepth;
    uniform vec2 resolution;
    uniform float near;
    uniform float far;
    uniform bool logDepth;
    uniform bool ortho;
    uniform mat4 viewMatrixInv;
    uniform mat4 projectionMatrixInv;
    varying vec2 vUv;
    layout(location = 1) out vec4 gNormal;
    vec3 getWorldPosLog(vec3 posS) {
        vec2 uv = posS.xy;
        float z = posS.z;
        float nearZ =near;
        float farZ = far;
        float depth = pow(2.0, z * log2(farZ + 1.0)) - 1.0;
        float a = farZ / (farZ - nearZ);
        float b = farZ * nearZ / (nearZ - farZ);
        float linDepth = a + b / depth;
        vec4 clipVec = vec4(uv, linDepth, 1.0) * 2.0 - 1.0;
        vec4 wpos = projectionMatrixInv * clipVec;
        return wpos.xyz / wpos.w;
      }
      vec3 getWorldPos(float depth, vec2 coord) {
        if (logDepth && !ortho) {
          return getWorldPosLog(vec3(coord, depth));
        }
        if (ortho) {
          #ifdef REVERSEDEPTH
          float z = depth;
          #else
          float z = depth * 2. - 1.;
          #endif
          vec4 clipSpacePosition = vec4(coord * 2. - 1., z, 1.);
          vec4 viewSpacePosition = projectionMatrixInv * clipSpacePosition;
          viewSpacePosition.xyz /= viewSpacePosition.w;
          return viewSpacePosition.xyz;
        }
        vec2 ndc = coord * 2. - 1.;
        #ifdef REVERSEDEPTH
        float ndcZ = depth;
        #else
        float ndcZ = depth * 2. - 1.;
        #endif
        mat4 Q = projectionMatrixInv;
        vec3 view = vec3(Q[0][0] * ndc.x + Q[3][0], Q[1][1] * ndc.y + Q[3][1], Q[3][2]);
        float invW = 1. / (Q[2][3] * ndcZ + Q[3][3]);
        return view * invW;
    }
  
    vec3 computeNormal(vec3 worldPos, vec2 vUv) {
      ivec2 p = ivec2(vUv * resolution);
      float c0 = texelFetch(sceneDepth, p, 0).x;
      float l2 = texelFetch(sceneDepth, p - ivec2(2, 0), 0).x;
      float l1 = texelFetch(sceneDepth, p - ivec2(1, 0), 0).x;
      float r1 = texelFetch(sceneDepth, p + ivec2(1, 0), 0).x;
      float r2 = texelFetch(sceneDepth, p + ivec2(2, 0), 0).x;
      float b2 = texelFetch(sceneDepth, p - ivec2(0, 2), 0).x;
      float b1 = texelFetch(sceneDepth, p - ivec2(0, 1), 0).x;
      float t1 = texelFetch(sceneDepth, p + ivec2(0, 1), 0).x;
      float t2 = texelFetch(sceneDepth, p + ivec2(0, 2), 0).x;
  
      float dl = abs((2.0 * l1 - l2) - c0);
      float dr = abs((2.0 * r1 - r2) - c0);
      float db = abs((2.0 * b1 - b2) - c0);
      float dt = abs((2.0 * t1 - t2) - c0);
  
      vec3 ce = getWorldPos(c0, vUv).xyz;
  
      vec3 dpdx = (dl < dr) ? ce - getWorldPos(l1, (vUv - vec2(1.0 / resolution.x, 0.0))).xyz
                            : -ce + getWorldPos(r1, (vUv + vec2(1.0 / resolution.x, 0.0))).xyz;
      vec3 dpdy = (db < dt) ? ce - getWorldPos(b1, (vUv - vec2(0.0, 1.0 / resolution.y))).xyz
                            : -ce + getWorldPos(t1, (vUv + vec2(0.0, 1.0 / resolution.y))).xyz;
  
      return normalize(cross(dpdx, dpdy));
  }
    void main() {
        vec2 uv = vUv - vec2(0.5) / resolution;
        vec2 pixelSize = vec2(1.0) / resolution;
        highp vec2[4] uvSamples;
        uvSamples[0] = uv;
        uvSamples[1] = uv + vec2(pixelSize.x, 0.0);
        uvSamples[2] = uv + vec2(0.0, pixelSize.y);
        uvSamples[3] = uv + pixelSize;
        float depth00 = texture2D(sceneDepth, uvSamples[0]).r;
        float depth10 = texture2D(sceneDepth, uvSamples[1]).r;
        float depth01 = texture2D(sceneDepth, uvSamples[2]).r;
        float depth11 = texture2D(sceneDepth, uvSamples[3]).r;
        float minDepth = min(min(depth00, depth10), min(depth01, depth11));
        float maxDepth = max(max(depth00, depth10), max(depth01, depth11));
        float targetDepth = minDepth;
        // Checkerboard pattern to avoid artifacts
        if (mod(gl_FragCoord.x + gl_FragCoord.y, 2.0) > 0.5) { 
            targetDepth = maxDepth;
        }
        int chosenIndex = 0;
        float[4] samples;
        samples[0] = depth00;
        samples[1] = depth10;
        samples[2] = depth01;
        samples[3] = depth11;
        for(int i = 0; i < 4; ++i) {
            if (samples[i] == targetDepth) {
                chosenIndex = i;
                break;
            }
        }
        gl_FragColor = vec4(samples[chosenIndex], 0.0, 0.0, 1.0);
        gNormal = vec4(computeNormal(
            getWorldPos(samples[chosenIndex], uvSamples[chosenIndex]), uvSamples[chosenIndex]
        ), 0.0);
    }`},bn=Uint8Array.from(atob(`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`),e=>e.charCodeAt(0)),xn=parseInt(`180`.replace(/\D+/g,``))>=162?class extends E{constructor(e=1,t=1,n=1,r={}){super(e,t,{...r,count:n}),this.isWebGLMultipleRenderTargets=!0}get texture(){return this.textures}}:class extends E{constructor(e=1,t=1,n=1,r={}){super(e,t,r),this.isWebGLMultipleRenderTargets=!0;let i=this.texture;this.texture=[];for(let e=0;e<n;e++)this.texture[e]=i.clone(),this.texture[e].isRenderTargetTexture=!0}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let r=0,i=this.texture.length;r<i;r++)this.texture[r].image.width=e,this.texture[r].image.height=t,this.texture[r].image.depth=n;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}copy(e){this.dispose(),this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.texture.length=0;for(let t=0,n=e.texture.length;t<n;t++)this.texture[t]=e.texture[t].clone(),this.texture[t].isRenderTargetTexture=!0;return this}};function Sn(e,t,n){if(t.getQueryParameter(e,t.QUERY_RESULT_AVAILABLE)){let r=t.getQueryParameter(e,t.QUERY_RESULT)/1e6;n.lastTime=n.lastTime===0?r:n.timeRollingAverage*n.lastTime+(1-n.timeRollingAverage)*r}else setTimeout(()=>{Sn(e,t,n)},1)}var Cn=class extends yt{constructor(t,n,r=512,s=512){super(),this.width=Math.floor(r),this.height=Math.floor(s),this.clear=!0,this._neuralDenoiseWarningKey=null,this.camera=n,this.scene=t,this.autosetGamma=!0,this.configuration=new Proxy({aoSamples:16,aoRadius:5,aoTones:0,denoiseSamples:8,denoiseRadius:12,distanceFalloff:1,intensity:5,denoiseIterations:2,renderMode:0,biasOffset:0,biasMultiplier:0,color:new o(0,0,0),gammaCorrection:!0,depthBufferType:wn.Default,screenSpaceRadius:!1,halfRes:!1,depthAwareUpsampling:!0,colorMultiply:!0,transparencyAware:!1,accumulate:!1,neuralDenoise:!1},{set:(e,t,n)=>{let r=e[t];if(e[t]=n,n.equals?n.equals(r)||this.firstFrame():r!==n&&this.firstFrame(),t===`aoSamples`&&r!==n&&this.configureAOPass(this.configuration.depthBufferType,this.camera.isOrthographicCamera),t===`denoiseSamples`&&r!==n&&this.configureDenoisePass(this.configuration.depthBufferType,this.camera.isOrthographicCamera),t===`neuralDenoise`&&r!==n){let t=n&&(e.aoSamples!==16||e.halfRes),r=n&&e.halfRes;n&&(e.aoSamples=16,[4,8,16].includes(e.denoiseSamples)||(e.denoiseSamples=8),e.denoiseRadius=12,e.denoiseIterations=2,e.halfRes=!1),t&&this.configureAOPass(this.configuration.depthBufferType,this.camera.isOrthographicCamera),r&&(this.configureHalfResTargets(),this.configureEffectCompositer(this.configuration.depthBufferType,this.camera.isOrthographicCamera),this.setSize(this.width,this.height)),this.configureDenoisePass(this.configuration.depthBufferType,this.camera.isOrthographicCamera)}return t===`halfRes`&&r!==n&&(this.configureAOPass(this.configuration.depthBufferType,this.camera.isOrthographicCamera),this.configureHalfResTargets(),this.configureEffectCompositer(this.configuration.depthBufferType,this.camera.isOrthographicCamera),this.setSize(this.width,this.height)),t===`depthAwareUpsampling`&&r!==n&&this.configureEffectCompositer(this.configuration.depthBufferType,this.camera.isOrthographicCamera),t===`gammaCorrection`&&(this.autosetGamma=!1),t===`transparencyAware`&&r!==n&&(this.autoDetectTransparency=!1,this.configureTransparencyTarget()),!0}}),this.samples=[],this.samplesDenoise=[],this.autoDetectTransparency=!0,this.frames=0,this.lastViewMatrix=new i,this.lastProjectionMatrix=new i,this.configureEffectCompositer(this.configuration.depthBufferType),this.configureSampleDependentPasses(),this.configureHalfResTargets(),this.detectTransparency(),this.configureTransparencyTarget(),this.copyQuad=new Rt(new F({uniforms:{tDiffuse:{value:null}},depthWrite:!1,vertexShader:`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1);
            }
            `,fragmentShader:`
            uniform sampler2D tDiffuse;
            varying vec2 vUv;
            void main() {
                gl_FragColor = texture2D(tDiffuse, vUv);
            }
            `})),this.writeTargetInternal=new E(this.width,this.height,{minFilter:L,magFilter:L,depthBuffer:!1,format:ae}),this.readTargetInternal=new E(this.width,this.height,{minFilter:L,magFilter:L,depthBuffer:!1,format:ae}),this.outputTargetInternal=new E(this.width,this.height,{minFilter:L,magFilter:L,depthBuffer:!1}),this.accumulationRenderTarget=new E(this.width,this.height,{minFilter:L,magFilter:L,depthBuffer:!1,format:ae,type:e,stencilBuffer:!1,depthBuffer:!1,alpha:!0}),this.accumulationQuad=new Rt(new F({uniforms:{frame:{value:0},tDiffuse:{value:null}},transparent:!0,opacity:1,vertexShader:`
             varying vec2 vUv;
             void main() {
                 vUv = uv;
                 gl_Position = vec4(position, 1);
             }`,fragmentShader:`
             uniform sampler2D tDiffuse;
             uniform float frame;
                varying vec2 vUv;
                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    gl_FragColor = vec4(color.rgb, 1.0 / (frame + 1.0));
                }
                `})),this.bluenoise=new _(bn,128,128),this.bluenoise.colorSpace=``,this.bluenoise.wrapS=a,this.bluenoise.wrapT=a,this.bluenoise.minFilter=We,this.bluenoise.magFilter=We,this.bluenoise.needsUpdate=!0,this.lastTime=0,this.timeRollingAverage=.99,this.needsDepthTexture=!0,this.needsSwap=!0,this._r=new He,this._c=new o}configureHalfResTargets(){this.firstFrame(),this.configuration.halfRes?(this.depthDownsampleTarget=new xn(Math.floor(this.width/2),Math.floor(this.height/2),2),this.depthDownsampleTarget.textures[0].format=C,this.depthDownsampleTarget.textures[0].type=f,this.depthDownsampleTarget.textures[0].minFilter=We,this.depthDownsampleTarget.textures[0].magFilter=We,this.depthDownsampleTarget.textures[0].depthBuffer=!1,this.depthDownsampleTarget.textures[1].format=ae,this.depthDownsampleTarget.textures[1].type=e,this.depthDownsampleTarget.textures[1].minFilter=We,this.depthDownsampleTarget.textures[1].magFilter=We,this.depthDownsampleTarget.textures[1].depthBuffer=!1,this.depthDownsampleQuad=new Rt(new F(yn))):(this.depthDownsampleTarget&&=(this.depthDownsampleTarget.dispose(),null),this.depthDownsampleQuad&&=(this.depthDownsampleQuad.dispose(),null))}detectTransparency(){if(this.autoDetectTransparency){let e=!1;this.scene.traverse(t=>{t.material&&t.material.transparent&&(e=!0)}),e&&(this.configuration.transparencyAware=!0)}}configureTransparencyTarget(){this.configuration.transparencyAware?(this.transparencyRenderTargetDWFalse=new E(this.width,this.height,{minFilter:L,magFilter:We,type:e,format:ae}),this.transparencyRenderTargetDWTrue=new E(this.width,this.height,{minFilter:L,magFilter:We,type:e,format:ae}),this.transparencyRenderTargetDWTrue.depthTexture=new S(this.width,this.height,me),this.depthCopyPass=new Rt(new F({uniforms:{depthTexture:{value:this.depthTexture},reverseDepthBuffer:{value:this.configuration.depthBufferType===wn.Reverse}},vertexShader:`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1);
            }`,fragmentShader:`
            uniform sampler2D depthTexture;
            uniform bool reverseDepthBuffer;
            varying vec2 vUv;
            void main() {
                if (reverseDepthBuffer) {
               float d = 1.0 - texture2D(depthTexture, vUv).r;
           
               d += 0.00001;
               gl_FragDepth = 1.0 - d;
            } else {
                float d = texture2D(depthTexture, vUv).r;
                d += 0.00001;
                gl_FragDepth = d;
            }
               gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            }
            `}))):(this.transparencyRenderTargetDWFalse&&=(this.transparencyRenderTargetDWFalse.dispose(),null),this.transparencyRenderTargetDWTrue&&=(this.transparencyRenderTargetDWTrue.dispose(),null),this.depthCopyPass&&=(this.depthCopyPass.dispose(),null))}renderTransparency(e){let t=this.scene.background,n=e.getClearColor(new o),r=e.getClearAlpha(),i=new Map,a=e.autoClearDepth;this.scene.traverse(e=>{i.set(e,e.visible)}),this.scene.background=null,e.autoClearDepth=!1,e.setClearColor(new o(0,0,0),0),this.depthCopyPass.material.uniforms.depthTexture.value=this.depthTexture,this.depthCopyPass.material.uniforms.reverseDepthBuffer.value=this.configuration.depthBufferType===wn.Reverse,e.setRenderTarget(this.transparencyRenderTargetDWFalse),this.scene.traverse(e=>{e.material&&(e.visible=i.get(e)&&(e.material.transparent&&!e.material.depthWrite&&!e.userData.treatAsOpaque||!!e.userData.cannotReceiveAO))}),e.clear(!0,!0,!0),this.depthCopyPass.render(e),e.render(this.scene,this.camera),e.setRenderTarget(this.transparencyRenderTargetDWTrue),this.scene.traverse(e=>{e.material&&(e.visible=i.get(e)&&e.material.transparent&&e.material.depthWrite&&!e.userData.treatAsOpaque)}),e.clear(!0,!0,!0),this.depthCopyPass.render(e),e.render(this.scene,this.camera),this.scene.traverse(e=>{e.visible=i.get(e)}),e.setClearColor(n,r),this.scene.background=t,e.autoClearDepth=a}configureSampleDependentPasses(){this.configureAOPass(this.configuration.depthBufferType,this.camera.isOrthographicCamera),this.configureDenoisePass(this.configuration.depthBufferType,this.camera.isOrthographicCamera)}configureAOPass(e=wn.Default,t=!1){this.firstFrame(),this.samples=this.generateHemisphereSamples(this.configuration.aoSamples);let n={...zt};n.fragmentShader=n.fragmentShader.replace(`16`,this.configuration.aoSamples).replace(`16.0`,this.configuration.aoSamples+`.0`),e===wn.Log?n.fragmentShader=`#define LOGDEPTH
`+n.fragmentShader:e===wn.Reverse&&(n.fragmentShader=`#define REVERSEDEPTH
`+n.fragmentShader),t&&(n.fragmentShader=`#define ORTHO
`+n.fragmentShader),this.configuration.halfRes&&(n.fragmentShader=`#define HALFRES
`+n.fragmentShader),this.effectShaderQuad?(this.effectShaderQuad.material.dispose(),this.effectShaderQuad.material=new F(n)):this.effectShaderQuad=new Rt(new F(n))}configureDenoisePass(e=wn.Default,t=!1){this.firstFrame(),this.samplesDenoise=this.generateDenoiseSamples(this.configuration.denoiseSamples,11);let n={...vn};n.fragmentShader=n.fragmentShader.replace(`__N8AO_DENOISE_SAMPLES__`,this.configuration.denoiseSamples),e===wn.Log?n.fragmentShader=`#define LOGDEPTH
`+n.fragmentShader:e===wn.Reverse&&(n.fragmentShader=`#define REVERSEDEPTH
`+n.fragmentShader),t&&(n.fragmentShader=`#define ORTHO
`+n.fragmentShader),this.standardDenoiseMaterial&&this.standardDenoiseMaterial.dispose(),this.neuralDenoiseMaterial&&this.neuralDenoiseMaterial.dispose(),this.standardDenoiseMaterial=new F(n),this.neuralDenoiseMaterial=this.configuration.neuralDenoise&&[4,8,16].includes(this.configuration.denoiseSamples)?new F({...n,glslVersion:re,fragmentShader:`#define NEURAL_DENOISE
layout(location = 0) out highp vec4 neuralFragColor;
#define gl_FragColor neuralFragColor
`+n.fragmentShader}):null,this.poissonBlurQuad?this.poissonBlurQuad.material=this.standardDenoiseMaterial:this.poissonBlurQuad=new Rt(this.standardDenoiseMaterial)}shouldUseNeuralDenoise(){if(!this.configuration.neuralDenoise)return this._neuralDenoiseWarningKey=null,!1;let e=[];if(this.configuration.aoSamples!==16&&e.push(`aoSamples is ${this.configuration.aoSamples} (expected 16)`),[4,8,16].includes(this.configuration.denoiseSamples)||e.push(`denoiseSamples is ${this.configuration.denoiseSamples} (expected 4, 8, or 16)`),this.configuration.denoiseRadius!==12&&e.push(`denoiseRadius is ${this.configuration.denoiseRadius} (expected 12)`),this.configuration.denoiseIterations!==2&&e.push(`denoiseIterations is ${this.configuration.denoiseIterations} (expected 2)`),this.configuration.halfRes&&e.push(`halfRes is enabled (expected full resolution)`),e.length>0){let t=e.join(`; `);return t!==this._neuralDenoiseWarningKey&&(console.warn(`[N8AO] neuralDenoise is enabled but cannot run: ${t}. Neural denoising has been disabled; standard denoising will be used.`),this._neuralDenoiseWarningKey=t),!1}return this._neuralDenoiseWarningKey=null,this.neuralDenoiseMaterial!==null}configureEffectCompositer(e=wn.Default,t=!1){this.firstFrame();let n={...Bt};e===wn.Log?n.fragmentShader=`#define LOGDEPTH
`+n.fragmentShader:e===wn.Reverse&&(n.fragmentShader=`#define REVERSEDEPTH
`+n.fragmentShader),t&&(n.fragmentShader=`#define ORTHO
`+n.fragmentShader),this.configuration.halfRes&&this.configuration.depthAwareUpsampling&&(n.fragmentShader=`#define HALFRES
`+n.fragmentShader),this.effectCompositerQuad?(this.effectCompositerQuad.material.dispose(),this.effectCompositerQuad.material=new F(n)):this.effectCompositerQuad=new Rt(new F(n))}generateHemisphereSamples(e){let t=[];for(let n=0;n<e;n++){let r=2.399963*n,i=Math.sqrt(n+.5)/Math.sqrt(e),a=i*Math.cos(r),o=i*Math.sin(r),s=Math.sqrt(1-(a*a+o*o));t.push(new M(a,o,s))}return t}generateDenoiseSamples(e,t){let n=2*Math.PI*t/e,r=1/e,i=r,a=[],o=r,s=0;for(let t=0;t<e;t++)a.push(new He(Math.cos(s),Math.sin(s)).multiplyScalar(o**.75)),o+=i,s+=n;return a}setSize(e,t){this.firstFrame(),this.width=Math.floor(e),this.height=Math.floor(t);let n=this.configuration.halfRes?Math.floor(this.width/2):this.width,r=this.configuration.halfRes?Math.floor(this.height/2):this.height;this.writeTargetInternal.setSize(n,r),this.readTargetInternal.setSize(n,r),this.accumulationRenderTarget.setSize(n,r),this.configuration.halfRes&&this.depthDownsampleTarget.setSize(n,r),this.configuration.transparencyAware&&(this.transparencyRenderTargetDWFalse.setSize(this.width,this.height),this.transparencyRenderTargetDWTrue.setSize(this.width,this.height)),this.outputTargetInternal.setSize(this.width,this.height)}setDepthTexture(e){this.depthTexture=e}firstFrame(){this.needsFrame=!0}render(e,t,n){let r=e.xr.enabled;e.xr.enabled=!1;let i=e.capabilities.reversedDepthBuffer===!0||e.capabilities.reverseDepthBuffer===!0?wn.Reverse:e.capabilities.logarithmicDepthBuffer?wn.Log:wn.Default;this.configuration.depthBufferType!==i&&(this.configuration.depthBufferType=i,this.configureAOPass(this.configuration.depthBufferType,this.camera.isOrthographicCamera),this.configureDenoisePass(this.configuration.depthBufferType,this.camera.isOrthographicCamera),this.configureEffectCompositer(this.configuration.depthBufferType,this.camera.isOrthographicCamera)),this.detectTransparency(),(t.texture.type!==this.outputTargetInternal.texture.type||t.texture.format!==this.outputTargetInternal.texture.format)&&(this.outputTargetInternal.texture.type=t.texture.type,this.outputTargetInternal.texture.format=t.texture.format,this.outputTargetInternal.texture.needsUpdate=!0),this.camera.updateMatrixWorld(),this.lastViewMatrix.equals(this.camera.matrixWorldInverse)&&this.lastProjectionMatrix.equals(this.camera.projectionMatrix)&&this.configuration.accumulate&&!this.needsFrame?this.frame++:(this.configuration.accumulate&&(e.setRenderTarget(this.accumulationRenderTarget),e.clear(!0,!0,!0)),this.frame=0,this.needsFrame=!1),this.lastViewMatrix.copy(this.camera.matrixWorldInverse),this.lastProjectionMatrix.copy(this.camera.projectionMatrix);let a,o,s;this.debugMode&&(a=e.getContext(),o=a.getExtension(`EXT_disjoint_timer_query_webgl2`),o===null&&(console.error(`EXT_disjoint_timer_query_webgl2 not available, disabling debug mode.`),this.debugMode=!1)),this.debugMode&&(s=a.createQuery(),a.beginQuery(o.TIME_ELAPSED_EXT,s)),this.configuration.transparencyAware&&this.renderTransparency(e),this._r.set(this.width,this.height);let c=this.configuration.aoRadius;if(this.configuration.halfRes&&this.configuration.screenSpaceRadius&&(c*=.5),this.frame<1024/this.configuration.aoSamples){this.configuration.halfRes&&(e.setRenderTarget(this.depthDownsampleTarget),this.depthDownsampleQuad.material.uniforms.sceneDepth.value=this.depthTexture,this.depthDownsampleQuad.material.uniforms.resolution.value=this._r,this.depthDownsampleQuad.material.uniforms.near.value=this.camera.near,this.depthDownsampleQuad.material.uniforms.far.value=this.camera.far,this.depthDownsampleQuad.material.uniforms.projectionMatrixInv.value=this.camera.projectionMatrixInverse,this.depthDownsampleQuad.material.uniforms.viewMatrixInv.value=this.camera.matrixWorld,this.depthDownsampleQuad.material.uniforms.logDepth.value=this.configuration.depthBufferType===wn.Log,this.depthDownsampleQuad.material.uniforms.ortho.value=this.camera.isOrthographicCamera,this.depthDownsampleQuad.render(e)),this.effectShaderQuad.material.uniforms.sceneDiffuse.value=t.texture,this.effectShaderQuad.material.uniforms.sceneDepth.value=this.configuration.halfRes?this.depthDownsampleTarget.textures[0]:this.depthTexture,this.effectShaderQuad.material.uniforms.sceneNormal.value=this.configuration.halfRes?this.depthDownsampleTarget.textures[1]:null,this.effectShaderQuad.material.uniforms.projMat.value=this.camera.projectionMatrix,this.effectShaderQuad.material.uniforms.viewMat.value=this.camera.matrixWorldInverse,this.effectShaderQuad.material.uniforms.projViewMat.value=this.camera.projectionMatrix.clone().multiply(this.camera.matrixWorldInverse.clone()),this.effectShaderQuad.material.uniforms.projectionMatrixInv.value=this.camera.projectionMatrixInverse,this.effectShaderQuad.material.uniforms.viewMatrixInv.value=this.camera.matrixWorld,this.effectShaderQuad.material.uniforms.cameraPos.value=this.camera.getWorldPosition(new M),this.effectShaderQuad.material.uniforms.biasAdjustment.value=new He(this.configuration.biasOffset,this.configuration.biasMultiplier),this.effectShaderQuad.material.uniforms.resolution.value=this.configuration.halfRes?this._r.clone().multiplyScalar(.5).floor():this._r,this.effectShaderQuad.material.uniforms.time.value=performance.now()/1e3,this.effectShaderQuad.material.uniforms.samples.value=this.samples,this.effectShaderQuad.material.uniforms.bluenoise.value=this.bluenoise,this.effectShaderQuad.material.uniforms.radius.value=c,this.effectShaderQuad.material.uniforms.distanceFalloff.value=this.configuration.distanceFalloff,this.effectShaderQuad.material.uniforms.near.value=this.camera.near,this.effectShaderQuad.material.uniforms.far.value=this.camera.far,this.effectShaderQuad.material.uniforms.ortho.value=this.camera.isOrthographicCamera,this.effectShaderQuad.material.uniforms.screenSpaceRadius.value=this.configuration.screenSpaceRadius,this.effectShaderQuad.material.uniforms.frame.value=this.frame,e.setRenderTarget(this.writeTargetInternal),this.effectShaderQuad.render(e);let n=this.shouldUseNeuralDenoise();for(let t=0;t<this.configuration.denoiseIterations;t++)[this.writeTargetInternal,this.readTargetInternal]=[this.readTargetInternal,this.writeTargetInternal],this.poissonBlurQuad.material=n&&t===1?this.neuralDenoiseMaterial:this.standardDenoiseMaterial,this.poissonBlurQuad.material.uniforms.tDiffuse.value=this.readTargetInternal.texture,this.poissonBlurQuad.material.uniforms.sceneDepth.value=this.configuration.halfRes?this.depthDownsampleTarget.textures[0]:this.depthTexture,this.poissonBlurQuad.material.uniforms.projMat.value=this.camera.projectionMatrix,this.poissonBlurQuad.material.uniforms.viewMat.value=this.camera.matrixWorldInverse,this.poissonBlurQuad.material.uniforms.projectionMatrixInv.value=this.camera.projectionMatrixInverse,this.poissonBlurQuad.material.uniforms.viewMatrixInv.value=this.camera.matrixWorld,this.poissonBlurQuad.material.uniforms.cameraPos.value=this.camera.getWorldPosition(new M),this.poissonBlurQuad.material.uniforms.resolution.value=this.configuration.halfRes?this._r.clone().multiplyScalar(.5).floor():this._r,this.poissonBlurQuad.material.uniforms.time.value=performance.now()/1e3,this.poissonBlurQuad.material.uniforms.blueNoise.value=this.bluenoise,this.poissonBlurQuad.material.uniforms.radius.value=this.configuration.denoiseRadius*(this.configuration.halfRes?.5:1),this.poissonBlurQuad.material.uniforms.worldRadius.value=c,this.poissonBlurQuad.material.uniforms.distanceFalloff.value=this.configuration.distanceFalloff,this.poissonBlurQuad.material.uniforms.index.value=t,this.poissonBlurQuad.material.uniforms.poissonDisk.value=this.samplesDenoise,this.poissonBlurQuad.material.uniforms.near.value=this.camera.near,this.poissonBlurQuad.material.uniforms.far.value=this.camera.far,this.poissonBlurQuad.material.uniforms.screenSpaceRadius.value=this.configuration.screenSpaceRadius,e.setRenderTarget(this.writeTargetInternal),this.poissonBlurQuad.render(e);e.setRenderTarget(this.accumulationRenderTarget);let r=e.autoClear;e.autoClear=!1,this.accumulationQuad.material.uniforms.tDiffuse.value=this.writeTargetInternal.texture,this.accumulationQuad.material.uniforms.frame.value=this.frame,this.accumulationQuad.render(e),e.autoClear=r}this.configuration.transparencyAware&&(this.effectCompositerQuad.material.uniforms.transparencyDWFalse.value=this.transparencyRenderTargetDWFalse.texture,this.effectCompositerQuad.material.uniforms.transparencyDWTrue.value=this.transparencyRenderTargetDWTrue.texture,this.effectCompositerQuad.material.uniforms.transparencyDWTrueDepth.value=this.transparencyRenderTargetDWTrue.depthTexture,this.effectCompositerQuad.material.uniforms.transparencyAware.value=!0),this.effectCompositerQuad.material.uniforms.sceneDiffuse.value=t.texture,this.effectCompositerQuad.material.uniforms.sceneDepth.value=this.depthTexture,this.effectCompositerQuad.material.uniforms.aoTones.value=this.configuration.aoTones,this.effectCompositerQuad.material.uniforms.near.value=this.camera.near,this.effectCompositerQuad.material.uniforms.far.value=this.camera.far,this.effectCompositerQuad.material.uniforms.projectionMatrixInv.value=this.camera.projectionMatrixInverse,this.effectCompositerQuad.material.uniforms.ortho.value=this.camera.isOrthographicCamera,this.effectCompositerQuad.material.uniforms.downsampledDepth.value=this.configuration.halfRes?this.depthDownsampleTarget.textures[0]:this.depthTexture,this.effectCompositerQuad.material.uniforms.resolution.value=this._r,this.effectCompositerQuad.material.uniforms.blueNoise.value=this.bluenoise,this.effectCompositerQuad.material.uniforms.intensity.value=this.configuration.intensity,this.effectCompositerQuad.material.uniforms.renderMode.value=this.configuration.renderMode,this.effectCompositerQuad.material.uniforms.screenSpaceRadius.value=this.configuration.screenSpaceRadius,this.effectCompositerQuad.material.uniforms.radius.value=c,this.effectCompositerQuad.material.uniforms.distanceFalloff.value=this.configuration.distanceFalloff,this.effectCompositerQuad.material.uniforms.gammaCorrection.value=this.autosetGamma?this.renderToScreen:this.configuration.gammaCorrection,this.effectCompositerQuad.material.uniforms.tDiffuse.value=this.accumulationRenderTarget.texture,this.effectCompositerQuad.material.uniforms.color.value=this._c.copy(this.configuration.color).convertSRGBToLinear(),this.effectCompositerQuad.material.uniforms.colorMultiply.value=this.configuration.colorMultiply,this.effectCompositerQuad.material.uniforms.fog.value=!!this.scene.fog,this.scene.fog&&(this.scene.fog.isFog?(this.effectCompositerQuad.material.uniforms.fogExp.value=!1,this.effectCompositerQuad.material.uniforms.fogNear.value=this.scene.fog.near,this.effectCompositerQuad.material.uniforms.fogFar.value=this.scene.fog.far):this.scene.fog.isFogExp2?(this.effectCompositerQuad.material.uniforms.fogExp.value=!0,this.effectCompositerQuad.material.uniforms.fogDensity.value=this.scene.fog.density):console.error(`Unsupported fog type ${this.scene.fog.constructor.name} in SSAOPass.`)),e.setRenderTarget(this.outputTargetInternal),this.effectCompositerQuad.render(e),e.setRenderTarget(this.renderToScreen?null:n),this.copyQuad.material.uniforms.tDiffuse.value=this.outputTargetInternal.texture,this.copyQuad.render(e),this.debugMode&&(a.endQuery(o.TIME_ELAPSED_EXT),Sn(s,a,this)),e.xr.enabled=r}enableDebugMode(){this.debugMode=!0}disableDebugMode(){this.debugMode=!1}setDisplayMode(e){this.configuration.renderMode=[`Combined`,`AO`,`No AO`,`Split`,`Split AO`].indexOf(e)}setQualityMode(e){e===`Performance`?(this.configuration.neuralDenoise=!1,this.configuration.aoSamples=8,this.configuration.denoiseSamples=4,this.configuration.denoiseRadius=12):e===`Low`?(this.configuration.neuralDenoise=!1,this.configuration.aoSamples=16,this.configuration.denoiseSamples=4,this.configuration.denoiseRadius=12):e===`Medium`?(this.configuration.neuralDenoise=!1,this.configuration.aoSamples=16,this.configuration.denoiseSamples=8,this.configuration.denoiseRadius=12):e===`High`?(this.configuration.neuralDenoise=!1,this.configuration.aoSamples=64,this.configuration.denoiseSamples=8,this.configuration.denoiseRadius=6):e===`Ultra`?(this.configuration.neuralDenoise=!1,this.configuration.aoSamples=64,this.configuration.denoiseSamples=16,this.configuration.denoiseRadius=6):[`Neural-Low`,`Neural-Medium`,`Neural-High`].includes(e)&&(this.configuration.aoSamples=16,this.configuration.denoiseSamples={"Neural-Low":4,"Neural-Medium":8,"Neural-High":16}[e],this.configuration.denoiseRadius=12,this.configuration.denoiseIterations=2,this.configuration.halfRes=!1,this.configuration.neuralDenoise=!0)}},wn={Default:1,Log:2,Reverse:3},Tn={clear:{label:`Sunny`,cloud:.12,rain:0,snow:0,wet:0,puddles:0,cover:0,fog:1,grip:1,mud:0,wind:.15,lightning:0},cloudy:{label:`Overcast`,cloud:.82,rain:0,snow:0,wet:.08,puddles:0,cover:0,fog:1.6,grip:.99,mud:0,wind:.3,lightning:0},lightrain:{label:`Light rain`,cloud:.78,rain:.28,snow:0,wet:.55,puddles:.35,cover:0,fog:2.2,grip:.88,mud:.06,wind:.3,lightning:0},rain:{label:`Rain`,cloud:.9,rain:.6,snow:0,wet:.85,puddles:.7,cover:0,fog:3.2,grip:.8,mud:.1,wind:.4,lightning:0},heavyrain:{label:`Heavy rain`,cloud:.97,rain:1,snow:0,wet:1,puddles:1,cover:0,fog:5,grip:.72,mud:.16,wind:.55,lightning:.6},storm:{label:`Thunderstorm`,cloud:1,rain:.9,snow:0,wet:1,puddles:1,cover:0,fog:4.4,grip:.7,mud:.16,wind:1,lightning:7},fog:{label:`Fog`,cloud:.7,rain:0,snow:0,wet:.3,puddles:.1,cover:0,fog:20,grip:.95,mud:.02,wind:.05,lightning:0},snow:{label:`Snow`,cloud:.88,rain:0,snow:.6,wet:.2,puddles:0,cover:1,fog:4,grip:.62,mud:.12,wind:.3,lightning:0},blizzard:{label:`Blizzard`,cloud:1,rain:0,snow:1,wet:.2,puddles:0,cover:1,fog:11,grip:.55,mud:.15,wind:1,lightning:0}},En={morning:{label:`Morning`,hour:7.2},day:{label:`Midday`,hour:12.5},evening:{label:`Evening`,hour:18.3},night:{label:`Night`,hour:23.5}},Dn={volcanic:{weathers:{clear:4,cloudy:2,lightrain:1.5,rain:1.5,heavyrain:1,storm:1.2,fog:1},times:{morning:1,day:2,evening:1.2,night:1}},tropical:{weathers:{clear:4,cloudy:1.5,lightrain:2.5,rain:1.6,heavyrain:1,storm:1.4,fog:.5},times:{morning:1,day:2,evening:1.3,night:1}},temperate:{weathers:{clear:3,cloudy:2.5,lightrain:2,rain:1.5,heavyrain:.8,storm:.8,fog:1.2},times:{morning:1,day:2,evening:1,night:1}},desert:{weathers:{clear:7,cloudy:1.5,lightrain:.4,storm:.5,fog:.3},times:{morning:1,day:2,evening:1.2,night:1}},alpine:{weathers:{clear:3,cloudy:2,lightrain:1,rain:.8,fog:1.2,snow:2.5,blizzard:1},times:{morning:1,day:2,evening:1,night:1}},arctic:{weathers:{clear:2,cloudy:2,fog:1.2,snow:4,blizzard:2},times:{morning:1,day:2,evening:1,night:1}}},On={volcano:`volcanic`,kaiele:`tropical`,hawaii:`tropical`,hawaiian:`tropical`,island:`tropical`,desert:`desert`,canyon:`desert`,mesa:`desert`,alpine:`alpine`,mountain:`alpine`,snow:`arctic`,arctic:`arctic`,tundra:`arctic`,forest:`temperate`,bayou:`temperate`,swamp:`temperate`};function kn(e){let t=e?.climate||On[e?.region]||`volcanic`;return Dn[t]?t:`volcanic`}function An(e){let t=Dn[kn(e)].weathers;return Object.keys(Tn).filter(e=>t[e]>0)}function jn(e){let t=Dn[kn(e)].times;return Object.keys(En).filter(e=>t[e]>0)}function Mn(e,t){let n=Object.keys(e).filter(t=>e[t]>0),r=0;for(let t of n)r+=e[t];let i=t()*r;for(let t of n)if(i-=e[t],i<=0)return t;return n[n.length-1]}function Nn(e,{weather:t=`random`,time:n=`random`}={},r=Math.random){let i=Dn[kn(e)];return{weather:t!==`random`&&i.weathers[t]>0?t:Mn(i.weathers,r),time:n!==`random`&&i.times[n]>0?n:Mn(i.times,r)}}function Pn({weather:e,time:t}){return`${Tn[e]?.label??e} · ${En[t]?.label??t}`}var Fn={wxWet:{value:0},wxPuddle:{value:0},wxSnow:{value:0},wxRipple:{value:0},wxTime:{value:0},wxSun:{value:1}},In={ground:{wet:1,puddles:1,snow:1},road:{wet:1,puddles:1,snow:.55},object:{wet:.8,puddles:0,snow:.9},foliage:{wet:.6,puddles:0,snow:.8},vehicle:{wet:.7,puddles:0,snow:.45}},Ln=e=>e-Math.floor(e);function Rn(e,t){let n=Ln(e*.1031),r=Ln(t*.1031),i=Ln(e*.1031),a=n*(r+33.33)+r*(i+33.33)+i*(n+33.33);return n+=a,r+=a,i+=a,Ln((n+r)*i)}function zn(e,t){let n=Math.floor(e),r=Math.floor(t),i=e-n,a=t-r,o=i*i*(3-2*i),s=a*a*(3-2*a),c=Rn(n,r),l=Rn(n+1,r),u=Rn(n,r+1),d=Rn(n+1,r+1);return(c+(l-c)*o)*(1-s)+(u+(d-u)*o)*s}function Bn(e,t){return zn(e/9,t/9)*.62+zn(e/2.7+17,t/2.7+17)*.28+zn(e/.9+5,t/.9+5)*.1}var Vn=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)},Hn=e=>.8+(.62-.8)*e;function Un(e,t,n){if(n<=0)return 0;let r=Hn(n);return Vn(r,r+.05,Bn(e,t))}var Wn=`
uniform float wxWet, wxPuddle, wxSnow, wxRipple, wxTime, wxSun;
float wxHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxHash(i), wxHash(i + vec2(1.0, 0.0)), u.x), mix(wxHash(i + vec2(0.0, 1.0)), wxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wxPuddleField(vec2 p) { return wxNoise(p / 9.0) * 0.62 + wxNoise(p / 2.7 + 17.0) * 0.28 + wxNoise(p / 0.9 + 5.0) * 0.1; }
// expanding rings where drops land, as a slope in xz
vec2 wxRipples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 3; k++) {
    vec2 q = p * (2.6 + float(k) * 0.9) + float(k) * 7.31;
    vec2 cell = floor(q);
    float h = wxHash(cell + float(k) * 13.7);
    vec2 c = cell + 0.3 + 0.4 * vec2(h, wxHash(cell.yx + 3.1));
    float ph = fract(t * (1.1 + h * 0.6) + h * 7.0);
    vec2 d = q - c; float L = length(d) + 1e-4;
    float r = ph * 0.45;
    float x = L - r;
    float ring = sin(x * 42.0) * exp(-x * x * 420.0) * (1.0 - ph) * (1.0 - ph);
    acc += d / L * ring;
  }
  return acc * 0.3;
}
`;function Gn(e){let t=e=>e.toFixed(3);return`
{
  vec3 wxP = cameraPosition + transpose(mat3(viewMatrix)) * (-vViewPosition);
  vec3 wxNw = normalize(transpose(mat3(viewMatrix)) * normal);
  float wxUp = wxNw.y;
  float wxD = length(vViewPosition);
  vec3 wxUpV = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
  float wxW = wxWet * ${t(e.wet)};
  float wxPd = 0.0;
  if (wxW > 0.001) {
    // porous, rough surfaces soak up water and darken; everything wet turns glossy, steep faces drain a little
    float por = clamp(material.roughness * 1.4 - 0.3, 0.0, 1.0);
    float face = mix(0.6, 1.0, smoothstep(-0.2, 0.7, wxUp));
    material.diffuseColor *= 1.0 - wxW * por * 0.45 * face;
    material.roughness = mix(material.roughness, mix(0.34, 0.14, smoothstep(0.3, 0.9, wxUp)), wxW * face * 0.88);
    ${e.puddles?`
    if (wxPuddle > 0.001) {
      float pf = wxPuddleField(wxP.xz);
      float thr = mix(0.80, 0.62, wxPuddle);
      float flat_ = smoothstep(0.93, 0.985, wxUp);
      wxPd = smoothstep(thr, thr + 0.05, pf) * flat_;
      // a dark soaked rim round each puddle
      material.diffuseColor *= 1.0 - smoothstep(thr - 0.07, thr, pf) * (1.0 - wxPd) * 0.25 * flat_ * wxPuddle;
      material.diffuseColor = mix(material.diffuseColor, material.diffuseColor * 0.3, wxPd);
      material.roughness = mix(material.roughness, 0.06, wxPd);
      material.specularColor = mix(material.specularColor, vec3(0.02), wxPd);
      normal = normalize(mix(normal, wxUpV, wxPd));
    }`:``}
    if (wxRipple > 0.001 && wxD < 40.0) {
      vec2 rg = wxRipples(wxP.xz, wxTime) * wxRipple * (1.0 - smoothstep(14.0, 40.0, wxD));
      float rk = smoothstep(0.8, 0.95, wxUp) * (0.2 + 0.8 * wxPd);
      normal = normalize(normal + mat3(viewMatrix) * vec3(rg.x, 0.0, rg.y) * rk);
    }
  }
  float wxS = wxSnow * ${t(e.snow)};
  if (wxS > 0.001) {
    // snow lies on what faces up, drifting in patches; it hides the colour, metal and shine underneath
    float sn = wxNoise(wxP.xz / 5.0) * 0.6 + wxNoise(wxP.xz / 1.3) * 0.4;
    float cov = smoothstep(0.38, 0.72, wxUp * min(1.0, wxS * 1.2) + (sn - 0.5) * 0.55) * min(1.0, wxS * 1.5);
    vec3 snowC = vec3(0.8, 0.84, 0.9) * (0.88 + 0.12 * sn);
    material.diffuseColor = mix(material.diffuseColor, snowC, cov);
    material.roughness = mix(material.roughness, 0.58, cov);
    material.specularColor = mix(material.specularColor, vec3(0.03), cov);
    normal = normalize(mix(normal, wxUpV, cov * 0.6));
    // glints of ice close up
    float sp = step(0.988, wxHash(floor(wxP.xz * 38.0) + floor(cameraPosition.xz * 0.7)));
    totalEmissiveRadiance += vec3(sp * cov * (1.0 - smoothstep(3.0, 18.0, wxD)) * 0.5 * wxSun);
  }
}
`}function Kn(e,t){let n=In[t]||In.object;Object.assign(e.uniforms,Fn),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${Wn}`).replace(`#include <lights_fragment_begin>`,`${Gn(n)}\n#include <lights_fragment_begin>`)}function qn(e,t){if(!e||!e.isMeshStandardMaterial||e.userData.wxKind||e.userData.wx===!1||e.userData.noWeather)return!1;let n=In[e.userData.wx]?e.userData.wx:t;e.userData.wxKind=n;let r=e.customProgramCacheKey(),i=e.onBeforeCompile;return e.onBeforeCompile=function(e,t){i.call(this,e,t),Kn(e,n)},e.customProgramCacheKey=()=>`${r}|wx:${n}`,e.needsUpdate=!0,!0}function Jn(e,t=`object`){let n=0;return e.traverse(e=>{if(e.material&&!e.userData.noWeather)for(let r of Array.isArray(e.material)?e.material:[e.material])n+=+!!qn(r,t)}),n}var Yn=`varying vec3 vD;
void main(){ vD = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,Xn=`
uniform sampler2D tSky; uniform float uHdr, uInt, uEnv, uTime, uCloud, uStars, uGlow, uFogBand, uCloudDark;
uniform vec3 uHaze, uSun, uSunCol, uMoon, uZenith, uHorizon, uCloudLit, uCloudShade, uFlash, uFlashDir;
uniform vec2 uWind;
varying vec3 vD;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { s += a * vn(p); p = r * p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vD);
  float y = d.y;
  float sd = max(dot(d, uSun), 0.0);
  // atmosphere: deep at the zenith, pale and bright towards the horizon, warm around a low sun
  float hz = pow(1.0 - max(y, 0.0), 3.5);
  vec3 sky = mix(uZenith, uHorizon, hz);
  sky += uSunCol * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.5) * uGlow * (0.4 + 0.6 * hz);
  // clouds on a plane overhead, drifting with the wind, lit on the sun side and dark and heavy underneath
  float cov = 0.0;
  if (uCloud > 0.0 && y > -0.02) {
    vec2 uv = d.xz / (max(y, 0.0) + 0.09) * 0.55 + uWind * uTime;
    float n = fbm(uv);
    float n2 = fbm(uv * 2.7 + 5.0 + uWind * uTime * 0.6);
    float th = 1.0 - uCloud;
    cov = smoothstep(th - 0.12, th + 0.32, n * 0.82 + n2 * 0.25) * smoothstep(-0.02, 0.1, y);
    float dens = smoothstep(0.35, 1.0, n + uCloud * 0.35);
    vec3 cc = mix(uCloudLit, uCloudShade, dens * uCloudDark);
    // bright silver edges towards the sun
    cc += uSunCol * pow(sd, 5.0) * (1.0 - dens) * 0.6 * uGlow;
    cc *= 0.85 + 0.3 * n2;
    sky = mix(sky, cc, cov);
  }
  // lightning lights the cloud from inside
  sky += uFlash * (0.25 + 0.75 * pow(max(dot(d, uFlashDir), 0.0), 3.0)) * (0.3 + 0.7 * cov);
  if (uEnv < 0.5) {
    // the sun's disc
    float disc = smoothstep(0.99955, 0.9998, sd);
    sky += uSunCol * disc * 40.0 * uGlow * (1.0 - cov * 0.97);
    // the moon: a pale disc with darker seas, a faint halo
    float md = dot(d, uMoon);
    if (uStars > 0.0) {
      float moon = smoothstep(0.99935, 0.9996, md);
      vec3 mp = d - uMoon;
      float seas = vn(mp.xz * 900.0) * 0.5 + vn(mp.xy * 2100.0) * 0.5;
      sky += vec3(0.9, 0.93, 1.0) * moon * (1.2 - seas * 0.5) * 2.5 * (1.0 - cov * 0.9) * uStars;
      sky += vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 300.0) * 0.6 * uStars * (1.0 - cov * 0.5);
      // stars, twinkling, fading into the horizon glow
      vec3 sp = d * 260.0;
      vec3 c = floor(sp);
      float h = h31(c);
      float star = step(0.9965, h) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
      star *= 0.6 + 0.4 * sin(uTime * (2.0 + h * 9.0) + h * 80.0);
      sky += vec3(0.8, 0.85, 1.0) * star * (h - 0.9965) * 900.0 * uStars * (1.0 - cov) * smoothstep(0.02, 0.25, y);
    }
  }
  // the original midday sky
  if (uHdr > 0.0) {
    vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    vec3 c = texture2D(tSky, uv).rgb * uInt;
    float h = smoothstep(-0.04, 0.1, d.y);
    c = mix(uHaze, c, h * h * (3.0 - 2.0 * h) * 0.7 + 0.3 * step(0.0, d.y) * h);
    sky = mix(sky, c, uHdr);
  }
  // haze: the horizon melts into the fog, more so the thicker it is, and the ground below is all haze
  float band = 1.0 - smoothstep(-0.02, 0.06 + uFogBand * 0.5, y);
  sky = mix(sky, uHaze, max(band * (1.0 - uHdr), uFogBand * 0.85 * (1.0 - smoothstep(0.0, 0.9, y))));
  gl_FragColor = vec4(sky, 1.0);
}`,Zn=class{constructor(e,n,{dome:r,hdr:i,env:a,pm:s}){this.renderer=e,this.scene=n,this.hdrEnv=a,this.pm=s||new Ye(e);let c=this.uniforms={tSky:{value:i},uHdr:{value:1},uInt:{value:.85},uEnv:{value:0},uTime:{value:0},uCloud:{value:0},uStars:{value:0},uGlow:{value:1},uFogBand:{value:0},uCloudDark:{value:.5},uHaze:{value:new o(.62,.64,.66)},uSun:{value:new M(0,1,0)},uSunCol:{value:new o(1,1,1)},uMoon:{value:new M(0,1,0)},uZenith:{value:new o},uHorizon:{value:new o},uCloudLit:{value:new o},uCloudShade:{value:new o},uFlash:{value:new o(0,0,0)},uFlashDir:{value:new M(0,1,0)},uWind:{value:new He(.004,.0015)}};this.material=new F({side:1,depthWrite:!1,fog:!1,uniforms:c,vertexShader:Yn,fragmentShader:Xn}),r.material=this.material,this.dome=r,this.envScene=new m;let l=new N(new t(50,48,24),this.material);l.frustumCulled=!1,this.envScene.add(l),this.envRT=null}bakeEnvironment(e){if(e&&this.hdrEnv){this.scene.environment=this.hdrEnv;return}let t=this.uniforms;t.uEnv.value=1;let n=this.pm.fromScene(this.envScene,.02,.1,200);t.uEnv.value=0,this.envRT?.dispose(),this.envRT=n,this.scene.environment=n.texture}};function Qn(e,t){let n=new ve;n.setAttribute(`position`,new P([-1,0,0,1,0,0,-1,1,0,1,1,0],3)),n.setIndex([0,1,2,1,3,2]);let r=new Float32Array(e*4),i=we(t);for(let t=0;t<e*4;t++)r[t]=i();return n.setAttribute(`seed`,new ke(r,4)),n.instanceCount=e,n}var $n=class{constructor(e,t,n=3){this.count=e,this.geo=Qn(e,n),this.uniforms={uTime:{value:0},uCam:{value:new M},uBox:{value:new M(...t)},uFall:{value:10},uWind:{value:new M},uCamVel:{value:new M},uLen:{value:.06},uWidth:{value:.016},uAlpha:{value:0},uColor:{value:new o(.7,.74,.8)}},this.mat=new F({transparent:!0,depthWrite:!1,fog:!1,side:2,uniforms:this.uniforms,vertexShader:`
        attribute vec4 seed;
        uniform float uTime, uFall, uLen, uWidth;
        uniform vec3 uCam, uBox, uWind, uCamVel;
        varying float vA; varying float vX; varying float vY;
        void main() {
          vec3 vel = vec3(uWind.x, -uFall * (0.8 + 0.4 * seed.w), uWind.z);
          vec3 p = seed.xyz * uBox + vel * uTime;
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          vec3 rel = vel - uCamVel * 0.7;
          vec4 vh = viewMatrix * vec4(p, 1.0);
          vec4 vt = viewMatrix * vec4(p - rel * uLen, 1.0);
          vec4 v = mix(vt, vh, position.y);
          vec2 sh = vh.xy / max(-vh.z, 0.1), st = vt.xy / max(-vt.z, 0.1);
          vec2 dir = sh - st; float L = length(dir);
          dir = L > 1e-5 ? dir / L : vec2(0.0, 1.0);
          v.xy += vec2(-dir.y, dir.x) * position.x * uWidth * (1.0 + -v.z * 0.04);
          float dist = -vh.z;
          // fade the ones right at the lens and at the far side of the box
          vA = smoothstep(1.2, 4.5, dist) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p.xz - uCam.xz)));
          vA *= 0.55 + 0.45 * seed.w;
          vX = position.x; vY = position.y;
          gl_Position = projectionMatrix * v;
        }`,fragmentShader:`
        uniform float uAlpha; uniform vec3 uColor;
        varying float vA; varying float vX; varying float vY;
        void main() {
          float a = (1.0 - vX * vX) * smoothstep(0.0, 0.35, vY) * vA * uAlpha;
          gl_FragColor = vec4(uColor, a);
        }`}),this.mesh=new N(this.geo,this.mat),this.mesh.frustumCulled=!1,this.mesh.renderOrder=8,this.mesh.visible=!1}update(e,t,n,r,i,a){let o=this.uniforms;this.mesh.visible=i>.01,this.mesh.visible&&(o.uTime.value=e,o.uCam.value.copy(t),o.uCamVel.value.copy(n),o.uWind.value.copy(r),this.geo.instanceCount=Math.ceil(this.count*Math.min(1,.25+i*.75)),o.uAlpha.value=.32+i*.35,o.uColor.value.copy(a))}},er=class{constructor(e,t,n=5){this.count=e,this.geo=Qn(e,n),this.uniforms={uTime:{value:0},uCam:{value:new M},uBox:{value:new M(...t)},uWind:{value:new M},uCamVel:{value:new M},uAlpha:{value:0},uColor:{value:new o(1,1,1)},uSize:{value:.06}},this.mat=new F({transparent:!0,depthWrite:!1,fog:!1,side:2,uniforms:this.uniforms,vertexShader:`
        attribute vec4 seed;
        uniform float uTime, uSize; uniform vec3 uCam, uBox, uWind, uCamVel;
        varying vec2 vQ; varying float vA;
        void main() {
          vec3 vel = vec3(uWind.x, -1.1 - seed.w * 0.6, uWind.z);
          vec3 p = seed.xyz * uBox + vel * uTime;
          float ph = seed.w * 40.0;
          p += vec3(sin(uTime * 0.9 + ph) * 0.8, sin(uTime * 1.7 + ph * 1.3) * 0.25, cos(uTime * 0.7 + ph * 0.7) * 0.8);
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          // flakes smear a little along their motion relative to the camera
          vec3 rel = (viewMatrix * vec4(vel - uCamVel * 0.8, 0.0)).xyz;
          vec2 q = vec2(position.x, position.y * 2.0 - 1.0);
          // never thinner than a pixel or two, so distant flakes don't vanish
          float s = max(uSize * (0.6 + seed.x * 0.8), -mv.z * 0.0022);
          mv.xy += q * s;
          mv.xyz += rel * 0.02 * position.y;
          vQ = q;
          float dist = -mv.z;
          vA = smoothstep(0.3, 1.5, dist) * (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, length(p.xz - uCam.xz)));
          gl_Position = projectionMatrix * mv;
        }`,fragmentShader:`
        uniform float uAlpha; uniform vec3 uColor; varying vec2 vQ; varying float vA;
        void main() {
          float a = smoothstep(1.0, 0.2, length(vQ)) * vA * uAlpha;
          gl_FragColor = vec4(uColor, a);
        }`}),this.mesh=new N(this.geo,this.mat),this.mesh.frustumCulled=!1,this.mesh.renderOrder=8,this.mesh.visible=!1}update(e,t,n,r,i,a){let o=this.uniforms;this.mesh.visible=i>.01,this.mesh.visible&&(o.uTime.value=e,o.uCam.value.copy(t),o.uWind.value.copy(r),o.uCamVel.value.copy(n),this.geo.instanceCount=Math.ceil(this.count*Math.min(1,.3+i*.7)),o.uAlpha.value=.75,o.uColor.value.copy(a))}},tr=class{constructor(e,t){this.max=e,this.i=0,this.heightAt=t,this.rnd=we(91),this.acc=0;let n=new ve;n.setAttribute(`position`,new P([-1,0,0,1,0,0,-1,1,0,1,1,0],3)),n.setIndex([0,1,2,1,3,2]),this.pb=new Float32Array(e*4);for(let t=0;t<e;t++)this.pb[t*4+3]=-99;this.attr=new ke(this.pb,4),this.attr.setUsage(O),n.setAttribute(`pb`,this.attr),n.instanceCount=e,this.uniforms={uTime:{value:0},uColor:{value:new o(.7,.74,.8)},uAlpha:{value:.32}};let r={transparent:!0,depthWrite:!1,fog:!1,side:2,uniforms:this.uniforms},i=new F({...r,vertexShader:`
        attribute vec4 pb; uniform float uTime; varying vec2 vQ; varying float vK;
        void main() {
          float t = (uTime - pb.w) / 0.22;
          vK = t < 0.0 || t > 1.0 ? -1.0 : t;
          vec4 mv = viewMatrix * vec4(pb.xyz, 1.0);
          float s = 0.04 + 0.05 * fract(pb.x * 7.7);
          mv.xy += vec2(position.x * s * (0.6 + t), position.y * s * 1.4 * sin(min(t, 1.0) * 3.1416));
          vQ = position.xy;
          gl_Position = projectionMatrix * mv;
        }`,fragmentShader:`
        uniform vec3 uColor; uniform float uAlpha; varying vec2 vQ; varying float vK;
        void main() {
          if (vK < 0.0) discard;
          // two arms of spray thrown out to the sides
          float arm = smoothstep(0.35, 0.0, abs(abs(vQ.x) - 0.25 - vQ.y * 0.55));
          gl_FragColor = vec4(uColor, arm * (1.0 - vK) * uAlpha);
        }`}),a=new F({...r,vertexShader:`
        attribute vec4 pb; uniform float uTime; varying vec2 vQ; varying float vK;
        void main() {
          float t = (uTime - pb.w) / 0.5;
          vK = t < 0.0 || t > 1.0 ? -1.0 : t;
          float s = 0.08 + 0.22 * t;
          vec3 p = pb.xyz + vec3(position.x * s, 0.0, (position.y * 2.0 - 1.0) * s);
          vQ = vec2(position.x, position.y * 2.0 - 1.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,fragmentShader:`
        uniform vec3 uColor; uniform float uAlpha; varying vec2 vQ; varying float vK;
        void main() {
          if (vK < 0.0) discard;
          float r = length(vQ);
          float a = smoothstep(0.75, 0.9, r) * smoothstep(1.0, 0.9, r);
          gl_FragColor = vec4(uColor, a * (1.0 - vK) * uAlpha * 0.7);
        }`});this.crown=new N(n,i),this.ring=new N(n,a);for(let e of[this.crown,this.ring])e.frustumCulled=!1,e.renderOrder=7,e.visible=!1}update(e,t,n,r,i,a){let o=i>.01&&!!this.heightAt;if(this.crown.visible=this.ring.visible=o,!o)return;this.uniforms.uTime.value=e,this.uniforms.uColor.value.copy(a);let s=this.rnd;this.acc+=t*i*this.max*2.2;let c=0;for(;this.acc>1&&c++<400;){--this.acc;let t=Math.atan2(r.z,r.x)+(s()-.5)*2.2,i=1.5+s()**.7*26,a=n.x+Math.cos(t)*i,o=n.z+Math.sin(t)*i,c=this.i++%this.max*4;this.pb[c]=a,this.pb[c+1]=this.heightAt(a,o)+.14,this.pb[c+2]=o,this.pb[c+3]=e-s()*.02}this.attr.needsUpdate=!0}},nr=[[0,1],[.05,.15],[.09,.85],[.16,.25],[.22,.6],[.34,.1],[.5,0]];function rr(e,t,n,r,i,a=0){let o=[t.clone(),n.clone()],s=t.distanceTo(n)*r;for(let t=0;t<7;t++){let t=[o[0]];for(let n=0;n<o.length-1;n++){let r=o[n],i=o[n+1],a=r.clone().lerp(i,.5);a.x+=(e()-.5)*s,a.z+=(e()-.5)*s,a.y+=(e()-.5)*s*.3,t.push(a,i)}o=t,s*=.5}let c=a===0?1:.45/a;for(let s=0;s<o.length-1;s++)if(i.push([o[s],o[s+1],c]),a<2&&e()<(a===0?.06:.03)&&s<o.length*.8){let c=o[s+1].clone().sub(o[s]).normalize(),l=t.distanceTo(n)*(.15+e()*.25)/(a+1),u=o[s].clone().add(new M(c.x+(e()-.5)*1.6,-Math.abs(c.y)-.3,c.z+(e()-.5)*1.6).normalize().multiplyScalar(l));rr(e,o[s],u,r*1.1,i,a+1)}}var ir=class{constructor(e){this.max=900;let t=new I;this.a=new Float32Array(this.max*4*3),this.b=new Float32Array(this.max*4*3),this.s=new Float32Array(this.max*4*3);let n=[];for(let e=0;e<this.max;e++){let t=e*4;n.push(t,t+1,t+2,t+1,t+3,t+2)}t.setIndex(n),t.setAttribute(`position`,new Le(this.a,3)),t.setAttribute(`pa`,new Le(this.a,3)),t.setAttribute(`pq`,new Le(this.b,3)),t.setAttribute(`side`,new Le(this.s,3)),this.geo=t,this.uniforms={uK:{value:0}},this.mesh=new N(t,new F({transparent:!0,depthWrite:!1,blending:2,fog:!1,side:2,uniforms:this.uniforms,vertexShader:`
        attribute vec3 pa, pq, side; varying float vE; varying float vB;
        void main() {
          vec4 va = viewMatrix * vec4(pa, 1.0), vb = viewMatrix * vec4(pq, 1.0);
          vec4 v = side.y > 0.5 ? vb : va;
          vec2 d = normalize(vb.xy / -vb.z - va.xy / -va.z + 1e-6);
          // a few metres wide, so it still reads as a bright line a kilometre out
          v.xy += vec2(-d.y, d.x) * side.x * (1.0 + -v.z * 0.0025);
          vE = sign(side.x); vB = side.z;
          gl_Position = projectionMatrix * v;
        }`,fragmentShader:`
        uniform float uK; varying float vE; varying float vB;
        void main() {
          float core = 1.0 - abs(vE);
          gl_FragColor = vec4(vec3(4.0, 4.5, 6.0) * uK * vB * (0.35 + 0.65 * smoothstep(0.0, 1.0, core + 0.3)), 1.0);
        }`})),this.mesh.frustumCulled=!1,this.mesh.renderOrder=3,this.mesh.visible=!1,e.add(this.mesh),this.flash=0,this.strike=null,this.next=4,this.thunders=[],this.dir=new M(0,1,0)}build(e){let t=0;for(let[n,r,i]of e){if(t>=this.max)break;let e=t*4,a=1.6*i+.5;for(let t=0;t<4;t++)this.a.set([n.x,n.y,n.z],(e+t)*3),this.b.set([r.x,r.y,r.z],(e+t)*3),this.s.set([(t%2?1:-1)*a,+(t>=2),Math.min(1,i)],(e+t)*3);t++}for(let e=t;e<this.max;e++)for(let t=0;t<4;t++)this.s.set([0,0,0],(e*4+t)*3);for(let e of[`pa`,`pq`,`side`,`position`])this.geo.attributes[e].needsUpdate=!0}update(e,t,n,r,i,a,o){if(i>0&&(this.next-=e),i>0&&this.next<=0&&!this.strike){this.next=-Math.log(1-Math.random())*60/i+1.5;let e=Math.atan2(r.z,r.x)+(Math.random()-.5)*2.4,s=260+Math.random()*1500,c=n.x+Math.cos(e)*s,l=n.z+Math.sin(e)*s,u=a?a(c,l):0,d=new M(c+(Math.random()-.5)*300,Math.max(n.y,u)+650+Math.random()*250,l+(Math.random()-.5)*300),f=[],p=Math.random;rr(p,d,new M(c,u,l),.22,f),this.build(f),this.mesh.visible=Math.random()>.3,this.strike={t:0,dist:s,power:.6+Math.random()*.4},this.dir.set(c-n.x,d.y-n.y,l-n.z).normalize(),this.thunders.push({at:t+s/343,k:Math.min(1,400/s)*this.strike.power}),o?.({type:`lightning`,x:c,y:u,z:l,dist:s})}if(this.flash=0,this.strike){let t=this.strike;t.t+=e;let n=0;for(let e=0;e<nr.length-1;e++)t.t>=nr[e][0]&&t.t<nr[e+1][0]&&(n=nr[e][1]);this.flash=n*t.power*Math.min(1,700/t.dist+.25),this.uniforms.uK.value=n*t.power,t.t>nr[nr.length-1][0]&&(this.strike=null,this.mesh.visible=!1)}for(let e=this.thunders.length-1;e>=0;e--)t>=this.thunders[e].at&&(o?.({type:`thunder`,k:this.thunders[e].k}),this.thunders.splice(e,1));return this.flash}},ar=class extends ft{constructor(){super(`LensDropsEffect`,`
      uniform float uRain, uTime, uSpeed, uSnow;
      float lh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      // one layer of drops in a grid: xy = refraction offset, z = coverage
      vec3 layer(vec2 uv, float scale, float t, float density, float run) {
        vec2 p = uv * vec2(aspect, 1.0) * scale;
        // running drops slide down their column; columns move at their own pace
        float col = floor(p.x);
        float hc = lh(vec2(col, scale));
        p.y += t * run * (0.3 + hc * 0.7);
        vec2 id = floor(p);
        vec2 f = fract(p) - 0.5;
        float h = lh(id + scale * 3.1);
        if (h > density) return vec3(0.0);
        vec2 c = (vec2(lh(id + 1.7), lh(id + 9.3)) - 0.5) * 0.5;
        // each drop beads up, sits a while and dries away
        float life = fract(t * (0.03 + 0.08 * h) + h * 13.0);
        float r = (0.16 + 0.22 * lh(id + 4.4)) * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.75, 1.0, life));
        vec2 d = (f - c) * vec2(1.0, 1.0 + run * 0.6);
        float L = length(d);
        float m = smoothstep(r, r * 0.7, L);
        // a thin wet trail above a running drop
        float trail = run > 0.0 ? smoothstep(0.06, 0.0, abs(f.x - c.x)) * step(c.y, f.y) * smoothstep(0.5, 0.0, f.y - c.y) * 0.35 : 0.0;
        return vec3(-d / max(r, 1e-3) * m, max(m, trail * step(0.001, r)));
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        if (uRain < 0.001 && uSnow < 0.001) { outputColor = inputColor; return; }
        float t = uTime;
        vec2 wuv = uv;
        vec3 a = layer(wuv, 7.0, t, 0.35 * uRain, 0.0);
        vec3 b = layer(wuv + 0.37, 13.0, t * 1.3, 0.5 * uRain, 0.0);
        vec3 c = layer(wuv + 0.71, 5.0, t, 0.25 * uRain * (1.0 - uSpeed), 0.6);
        vec3 s = layer(uv + 0.13, 9.0, t * 0.5, 0.2 * uSnow, 0.0);
        vec2 off = a.xy * a.z + b.xy * b.z * 0.6 + c.xy * c.z;
        float cov = clamp(a.z + b.z + c.z, 0.0, 1.0);
        // streaks blown back across the lens at speed
        float streak = 0.0;
        if (uSpeed > 0.05 && uRain > 0.001) {
          vec2 q = vec2(uv.x * aspect * 40.0, uv.y * 3.0 - t * 2.5 * uSpeed);
          vec2 id = floor(q);
          float h = lh(id);
          float on = step(1.0 - 0.18 * uRain * uSpeed, h);
          float fx = abs(fract(q.x) - 0.5);
          streak = on * smoothstep(0.12, 0.0, fx) * smoothstep(0.0, 0.3, fract(q.y)) * (1.0 - fract(q.y));
          off += vec2(0.0, streak * 0.4);
        }
        vec2 suv = uv + off * 0.035;
        vec3 col = texture2D(inputBuffer, suv).rgb;
        if (cov > 0.01) {
          // drops blur what is behind them a little
          vec2 px = vec2(1.5) / resolution;
          col = mix(col, (texture2D(inputBuffer, suv + px).rgb + texture2D(inputBuffer, suv - px).rgb + texture2D(inputBuffer, suv + vec2(px.x, -px.y)).rgb + col) * 0.25, cov * 0.7);
          // a dark rim and a highlight on each bead
          col *= 1.0 - cov * 0.08 * (1.0 - length(off));
          col += vec3(0.12) * smoothstep(0.55, 0.9, -off.y) * cov;
        }
        col = mix(col, col * 0.92 + 0.06, streak * 0.4);
        // melting flakes: soft white blots
        col = mix(col, vec3(0.85, 0.88, 0.92) * (0.6 + 0.4 * dot(col, vec3(0.33))), s.z * 0.55);
        outputColor = vec4(col, inputColor.a);
      }`,{attributes:lt.CONVOLUTION,uniforms:new Map([[`uRain`,new xe(0)],[`uTime`,new xe(0)],[`uSpeed`,new xe(0)],[`uSnow`,new xe(0)]])})}};function or(){let e=document.createElement(`canvas`);e.width=e.height=64;let t=e.getContext(`2d`),n=t.createRadialGradient(32,32,0,32,32,32);return n.addColorStop(0,`rgba(255,255,255,1)`),n.addColorStop(.15,`rgba(255,255,255,0.8)`),n.addColorStop(.4,`rgba(255,255,255,0.18)`),n.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=n,t.fillRect(0,0,64,64),new Be(e)}function sr(){let e=document.createElement(`canvas`);e.width=64,e.height=128;let t=e.getContext(`2d`),n=t.createImageData(64,128);for(let e=0;e<128;e++)for(let t=0;t<64;t++){let r=(t-31.5)/32,i=e/127,a=.35+i*.65,o=Math.max(0,1-(r/a)**2)*Math.sin(Math.PI*Math.min(1,i*1.25))**.7*(1-i)**.6,s=(e*64+t)*4;n.data[s]=n.data[s+1]=n.data[s+2]=255,n.data[s+3]=Math.round(255*Math.min(1,o*1.3))}return t.putImageData(n,0,0),new Be(e)}var cr=[[.62,.42,2.42],[-.62,.42,2.42]],lr=[[.45,1.42,.72],[.15,1.42,.74],[-.15,1.42,.74],[-.45,1.42,.72]],ur=[[.7,.55,-2.45],[-.7,.55,-2.45]],dr=class{constructor(e){this.scene=e;let t=or();this.headMat=new Ce({map:t,color:new o(1,.93,.8),blending:2,depthWrite:!1,transparent:!0}),this.tailMat=new Ce({map:t,color:new o(1,.06,.02),blending:2,depthWrite:!1,transparent:!0}),this.poolMat=new g({map:sr(),color:new o(1,.9,.75),blending:2,depthWrite:!1,transparent:!0,polygonOffset:!0,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),this.poolMat.userData.noWeather=!0,this.poolGeo=new De(9,26).rotateX(-Math.PI/2).translate(0,0,14.5),this.spots=[new le(16773336,0,70,.62,.55,1.4),new le(16777215,0,130,.32,.6,1.2)],this.targets=this.spots.map(()=>new D),this.spots.forEach((t,n)=>{t.target=this.targets[n],e.add(t,this.targets[n])}),this.trucks=[],this.level=0,this.m4=new i,this.v=new M,this.d=new M}attach(e,t){this.detach();for(let n of e){let e=new b;e.name=`truck-lights`;let r=[...cr,...lr].map((t,n)=>{let r=new Ne(this.headMat);return r.position.set(...t),r.userData.bar=n>=2,e.add(r),r}),i=ur.map(t=>{let n=new Ne(this.tailMat.clone());return n.position.set(...t),e.add(n),n}),a=null;n!==t&&(a=new N(this.poolGeo,this.poolMat),a.position.y=-.4,a.renderOrder=2,e.add(a)),e.visible=!1,n.group.add(e),this.trucks.push({v:n,g:e,heads:r,tails:i,pool:a})}this.player=t}detach(){for(let e of this.trucks)e.v.group.remove(e.g);this.trucks=[],this.player=null;for(let e of this.spots)e.intensity=0}update(e,t=0,n=null){this.level=e;let r=e>.02;for(let i of this.trucks){let a=!i.v.totaled&&!i.v.damage?.blown;if(i.g.visible=r&&a,!i.g.visible)continue;let o=0;n&&(this.v.set(0,0,1).applyQuaternion(i.v.group.quaternion),o=this.v.dot(this.d.copy(n).sub(i.v.group.position).normalize()));let s=y.smoothstep(o,-.15,.6),c=y.smoothstep(-o,-.3,.4),l=.55+t*.5,u=i.v.damage?.broken||{},d=u.bar||i.v.damage?.lost.has(`lightbar`);for(let t of i.heads)t.scale.setScalar((t.userData.bar?.5:l)*(.7+e*.5)*s),t.visible=s>.01&&!(t.userData.bar?d:u.head);let f=+(i.v.input.brake>.1&&i.v.speed()>1);for(let e of i.tails)e.visible=!u.tail,e.scale.setScalar((.16+f*.14)*(.4+.6*c)),e.material.color.setRGB(1,.05,.02).multiplyScalar(1.2+f*2.5);i.pool&&(i.pool.material.opacity=.35*e)}this.headMat.color.setRGB(1,.93,.8).multiplyScalar(2+e*3);let i=this.player,a=r&&i&&!i.totaled,o=i?.damage?.broken||{};if(this.spots[0].intensity=a&&!o.head?260*e:0,this.spots[1].intensity=a&&!o.bar&&!i.damage?.lost.has(`lightbar`)?420*e:0,i){i.group.updateMatrixWorld();let e=i.group.matrixWorld;this.spots[0].position.set(0,.5,2.3).applyMatrix4(e),this.targets[0].position.set(0,-1.2,16).applyMatrix4(e),this.spots[1].position.set(0,1.45,.8).applyMatrix4(e),this.targets[1].position.set(0,-.5,40).applyMatrix4(e);for(let e of this.targets)e.updateMatrixWorld()}}},fr={morning:{el:9,az:-1.3,sun:[1,.7,.46],sunI:2.2,zenith:[.16,.3,.62],horizon:[1.1,.72,.5],hemiSky:[.62,.6,.68],hemiGround:[.26,.19,.15],hemiI:.28,env:.5,fog:[.74,.66,.6],glow:1.5,light:.85,stars:0,lamps:.3,cloudLit:[1.25,.85,.68]},day:{el:null,az:0,sun:[1,.94,.86],sunI:2.8,zenith:[.22,.45,1],horizon:[.75,.85,1],hemiSky:[.62,.7,.78],hemiGround:[.23,.165,.125],hemiI:.1,env:.6,fog:[.62,.64,.66],glow:1,light:1,stars:0,lamps:0,cloudLit:[1.5,1.5,1.5]},evening:{el:7,az:1.25,sun:[1,.5,.24],sunI:1.9,zenith:[.1,.14,.36],horizon:[1.25,.55,.28],hemiSky:[.58,.46,.55],hemiGround:[.24,.15,.11],hemiI:.5,env:.6,fog:[.7,.5,.4],glow:1.8,light:.72,stars:.05,lamps:.55,cloudLit:[1.3,.62,.42]},night:{el:38,az:2.6,moon:!0,sun:[.5,.62,1],sunI:1.3,zenith:[.004,.007,.018],horizon:[.03,.04,.07],hemiSky:[.3,.38,.6],hemiGround:[.08,.08,.09],hemiI:1.3,env:.6,fog:[.028,.034,.05],glow:0,light:.16,stars:1,lamps:1,cloudLit:[.05,.06,.08]}},pr={heavyrain:.5,storm:.55,fog:.6,snow:.35,blizzard:.65,rain:.3},mr=e=>new o(e[0],e[1],e[2]),hr=new M,gr=new M,_r=new o,vr=new o,yr=class{constructor({renderer:e,scene:t,sky:n,sun:r,sunLight:i,hemi:a,quality:s,heightAt:c,fogBase:l=28e-5}){Object.assign(this,{renderer:e,scene:t,sun:r,sunLight:i,hemi:a,quality:s,heightAt:c,fogBase:l}),this.baseSun=r.clone(),this.sky=new Zn(e,t,n);let u=!!s.aiLod,d=s.name===`low`,f={low:2200,medium:4500,high:8e3,ultra:12e3}[s.name]??4500;this.rain=[new $n(Math.round(f*.6),[26,18,26],3),new $n(Math.round(f*.4),[80,46,80],4)],this.snow=[new er(Math.round(f*.5),[30,20,30],5),new er(Math.round(f*.35),[90,50,90],6)],this.splashes=new tr(u?250:600,c),this.lightning=new ir(t);for(let e of[...this.rain,...this.snow])t.add(e.mesh);t.add(this.splashes.crown,this.splashes.ring),this.flashLight=new Ue(13161727,0),t.add(this.flashLight,this.flashLight.target),this.lights=new dr(t),this.lens=d?null:new ar,this.listeners=new Map,this.wind=new M,this.windDir=new M(1,0,.35).normalize(),this.windTime=0,this.camPrev=new M,this.camVel=new M,this.fogColor=new o(.62,.64,.66),this.fogDensity=l,this.sunIntensity=2.8,this.smokeLight=new o(1,1,1),this.precipColor=new o,this.flash=0,this.gust=0,this.set({weather:`clear`,time:`day`})}on(e,t){return(this.listeners.get(e)||this.listeners.set(e,[]).get(e)).push(t),this}emit(e){for(let t of this.listeners.get(e.type)||[])t(e)}get label(){return Pn(this.cond)}get grip(){return this.W.grip}adopt(e,t){return Jn(e,t)}gripAt(e,t,n=0){let r=this.W,i=Un(e,t,r.puddles);return r.grip*(1-i*.3)*(1-n*r.mud)}puddleAt(e,t){return Un(e,t,this.W.puddles)}set(e,t=null,n=Math.random){let r=t?Nn(t,e,n):{weather:Tn[e.weather]?e.weather:`clear`,time:En[e.time]?e.time:`day`};this.cond=r;let i=this.W=Tn[r.weather],a=this.T=fr[r.time],o=this.sky.uniforms,s=i.cloud,c=Math.max(i.rain,i.snow*.8)*s;if(a.el==null)this.sun.copy(this.baseSun);else{let e=Math.atan2(this.baseSun.z,this.baseSun.x)+a.az,t=y.degToRad(a.el);this.sun.set(Math.cos(e)*Math.cos(t),Math.sin(t),Math.sin(e)*Math.cos(t)).normalize()}let l=r.time===`day`,u=l&&s<.3;o.uHdr.value=+!!u,o.uSun.value.copy(a.moon?hr.copy(this.sun).negate():this.sun),o.uMoon.value.copy(a.moon?this.sun:hr.set(0,-1,0)),o.uStars.value=a.stars,o.uGlow.value=a.glow*(1-s*.7),o.uSunCol.value.copy(mr(a.sun)).multiplyScalar(a.moon?0:1.5),o.uCloud.value=u?0:s,o.uCloudDark.value=.35+c*.65;let d=1-c*.55-(r.weather===`fog`?.1:0),f=_r.setRGB(.5,.53,.58).multiplyScalar(a.light*d*(a.moon?.35:1));return o.uZenith.value.copy(mr(a.zenith)).lerp(f,s*.9),o.uHorizon.value.copy(mr(a.horizon)).lerp(f,s*.85),o.uCloudLit.value.copy(mr(a.cloudLit)).multiplyScalar(d).lerp(vr.copy(f).multiplyScalar(1.15),s*.75),o.uCloudShade.value.copy(f).multiplyScalar(.4),this.fogDensity=this.fogBase*i.fog,this.fogColor.copy(mr(a.fog)).lerp(vr.copy(f).multiplyScalar(.95),s*.75),i.cover&&this.fogColor.lerp(vr.setRGB(.7,.73,.78).multiplyScalar(a.light),.5),o.uHaze.value.copy(this.fogColor),o.uFogBand.value=Math.min(1,(i.fog-1)/10),this.sunIntensity=a.sunI*(1-s*(a.moon?.6:.8))*(r.weather===`fog`?.6:1),this.sunLight.color.copy(mr(a.sun)).lerp(vr.setRGB(.9,.92,.96),s*.6),this.hemiBase=a.hemiI+s*(a.moon?.4:.6*a.light),this.hemi.color.copy(mr(a.hemiSky)).lerp(a.moon?vr.setRGB(.22,.25,.32):f,s*.6),this.hemi.groundColor.copy(mr(a.hemiGround)),i.cover&&this.hemi.groundColor.setRGB(.5,.53,.58).multiplyScalar(a.light),this.envBase=a.env*(u?1:1.25),this.scene.environmentIntensity=this.envBase,this.smokeLight.setRGB(1,1,1).multiplyScalar(Math.max(.12,a.light*(1-s*.35))),this.precipColor.copy(this.fogColor).multiplyScalar(1.2).addScalar(a.light*.08),a.moon&&this.precipColor.setRGB(.2,.22,.27),Fn.wxWet.value=i.wet,Fn.wxPuddle.value=i.puddles,Fn.wxSnow.value=i.cover,Fn.wxRipple.value=i.rain,Fn.wxSun.value=a.light,this.lampLevel=Math.max(a.lamps,pr[r.weather]||0)*(l?.8:1),this.sky.bakeEnvironment(u),this.lightning.next=3+Math.random()*6,this.emit({type:`change`,cond:r}),r}setVehicles(e,t){e?this.lights.attach(e,t):this.lights.detach()}step(e,t){let n=this.W;for(let r of t){let t=r.v,i=t.body.translation();if(t.weatherGrip=this.gripAt(i.x,i.z,t.surface||0),!t.contacts)continue;let a=t.body.linvel(),o=Math.hypot(a.x,a.z),s=n.puddles?Un(i.x,i.z,n.puddles):0;if(s>.05&&o>3){let n=-s*900*e/o;t.body.applyImpulse({x:a.x*n,y:0,z:a.z*n},!0)}if(t.inPuddle=s,n.wind>.5&&this.gust>.1){let n=4.62*(this.gust*18)**2*e;t.body.applyImpulse({x:this.windDir.x*n,y:0,z:this.windDir.z*n},!0)}}}update(e,t,n,r={}){let i=this.W,a=this.T,o=n.position;e>0&&this.camVel.copy(o).sub(this.camPrev).divideScalar(e),this.camVel.lengthSq()>14400&&this.camVel.set(0,0,0),this.camPrev.copy(o);let s=n.getWorldDirection(hr),c=.55+.45*Math.sin(t*.31)*Math.sin(t*.83+1.3);this.gust=i.wind*c;let l=1.5+i.wind*12*c;this.wind.copy(this.windDir).multiplyScalar(l),this.windTime+=e*(.7+i.wind*1.8*c),Fn.wxTime.value=t;for(let e of this.rain)e.update(t,o,this.camVel,this.wind,i.rain,this.precipColor);_r.copy(this.precipColor).multiplyScalar(1.6);for(let e of this.snow)e.update(t,o,this.camVel,this.wind,i.snow,_r);this.splashes.update(t,e,o,s,i.rain,this.precipColor);let u=this.lightning.update(e,t,o,s,i.lightning,this.heightAt,e=>this.emit(e));this.flash=u;let d=this.sky.uniforms;if(d.uTime.value=t,d.uFlash.value.setRGB(.55,.6,.8).multiplyScalar(u*3),d.uFlashDir.value.copy(this.lightning.dir),this.flashLight.intensity=u*6,this.flashLight.position.copy(o).addScaledVector(this.lightning.dir,300),this.flashLight.target.position.copy(o),this.flashLight.target.updateMatrixWorld(),this.hemi.intensity=this.hemiBase+u*1.5,this.scene.environmentIntensity=this.envBase*(1+u*3),this.lights.update(this.lampLevel,Math.min(1,(i.fog-1)/8),o),this.lens){let n=this.lens.uniforms,a=r.lens===!1?0:1,o=i.rain*a;n.get(`uRain`).value+=(o-n.get(`uRain`).value)*Math.min(1,e*1.5),n.get(`uSnow`).value=i.snow*a*.6,n.get(`uTime`).value=t,n.get(`uSpeed`).value=y.clamp(((r.speed||0)-8)/30,0,1)}if(r.dust){let e=r.dust.mat.uniforms;if(e.uTint){let t=Math.max(i.wet,i.cover);e.uTint.value.setRGB(1,1,1).lerp(_r.setRGB(2.6,2.75,2.95),t).multiplyScalar(Math.max(.2,a.light)),e.uAlpha.value=.45*(1-t*.35)}}let f=r.ambient;if(f&&i.rain>0&&f.riverPts?.length){this.steamAcc=(this.steamAcc||0)+e*i.rain*40;let n=0;for(;this.steamAcc>1&&n++<40;){let e=f.riverPts[Math.floor(Math.random()*f.riverPts.length)];if(Math.hypot(e.x-o.x,e.z-o.z)>380)continue;--this.steamAcc;let n=.55+Math.random()*.2;f.steam.emit(hr.set(e.x+(Math.random()-.5)*e.w,e.y+.8,e.z+(Math.random()-.5)*e.w),gr.set(this.wind.x*.3,2+Math.random()*2.5,this.wind.z*.3),3+Math.random()*4,r.time??t,4+Math.random()*3,n,n,n)}this.steamAcc=Math.min(this.steamAcc,5)}f?.birds&&(f.birds.visible=i.rain<.2&&i.snow<.2&&!a.moon)}};function br(e,{base:t=180,falloff:n=.006,amount:r=.6}={}){let i=e=>e.toFixed(6),a=st;a.fog_pars_vertex=`#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`,a.fog_vertex=`#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`,a.fog_pars_fragment=`#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`,a.fog_fragment=`#ifdef USE_FOG
  #ifdef FOG_EXP2
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = length(fogRay);
    float fogK = ${i(n)};
    float fogHc = cameraPosition.y - ${i(t)}, fogHp = vFogWorld.y - ${i(t)};
    float fogDh = fogHp - fogHc;
    float fogInt = abs(fogDh) > 0.5 ? (exp(-fogK * fogHc) - exp(-fogK * fogHp)) / (fogK * fogDh) : exp(-fogK * fogHc);
    float fogFactor = 1.0 - exp(-fogDensity * ${i(r)} * fogDist * min(fogInt, 8.0));
    // the far horizon still fades out whatever its height
    fogFactor = max(fogFactor, 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist * 0.5));
    float fogSun = pow(max(dot(fogRay / max(fogDist, 1e-3), vec3(${i(e.x)}, ${i(e.y)}, ${i(e.z)})), 0.0), 6.0);
    // (dimmed with the fog itself, so night and storm haze don't glow)
    vec3 fogCol = fogColor + vec3(0.45, 0.3, 0.12) * fogSun * clamp(dot(fogColor, vec3(0.6)) - 0.15, 0.0, 1.0);
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    vec3 fogCol = fogColor;
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`}var xr=class{constructor(e,n){this.sun=n.clone().normalize(),this.disc=new N(new t(210,24,12),new g({color:16769712,transparent:!0,depthWrite:!1,fog:!1})),this.disc.frustumCulled=!1,this.effect=new Qe(e,this.disc,{blendFunction:ct.SCREEN,samples:80,density:.97,decay:.93,weight:.32,exposure:.42,clampMax:.85,kernelSize:bt.SMALL,resolutionScale:.5,blur:!0})}update(e){this.disc.position.copy(e.position).addScaledVector(this.sun,6e3),this.disc.updateMatrixWorld()}},Sr=class{constructor(e){this.target=new M,this.effect=new rt(e,{focusDistance:8,focusRange:120,bokehScale:1.6,resolutionScale:.5}),this.effect.target=this.target}update(e,t,n){this.target.copy(e);let r=t?6:n===`hood`||n===`bumper`?220:n===`tv`?40:150,i=this.effect.cocMaterial;i.focusRange+=(r-i.focusRange)*.1,this.effect.bokehScale=t?3.2:1.6}},Cr=class{constructor(e,t=2e3){this.max=t;let n=new Float32Array(t*4*3),r=new Float32Array(t*4*4),i=new Uint32Array(t*6);for(let e=0;e<t;e++)i.set([e*4,e*4+2,e*4+1,e*4+1,e*4+2,e*4+3],e*6);let a=new I;a.setAttribute(`position`,new Le(n,3).setUsage(O)),a.setAttribute(`color`,new Le(r,4).setUsage(O)),a.setIndex(new Le(i,1)),this.mat=new g({color:16777215,vertexColors:!0,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2,fog:!0}),this.mat.blending=5,this.mat.blendSrc=200,this.mat.blendDst=205,this.mesh=new N(a,this.mat),this.mesh.frustumCulled=!1,this.mesh.renderOrder=1,e.add(this.mesh),this.i=0,this.last=new Map}add(e,t,n,r,i){let a=this.last.get(e),o=.2;if(!a||r<=.02){this.last.set(e,r>.02?{p:t.clone(),side:n.clone(),k:r}:null);return}if(a.p.distanceToSquared(t)<.09)return;if(a.p.distanceToSquared(t)>9){this.last.set(e,{p:t.clone(),side:n.clone(),k:r});return}let s=this.mesh.geometry,c=s.attributes.position.array,l=s.attributes.color.array,u=this.i,d=[a.p.clone().addScaledVector(a.side,-.2),a.p.clone().addScaledVector(a.side,o),t.clone().addScaledVector(n,-.2),t.clone().addScaledVector(n,o)],f=Math.min(.75,a.k)*(i?.6:1),p=Math.min(.75,r)*(i?.6:1);d.forEach((e,t)=>{c.set([e.x,e.y+.03,e.z],(u*4+t)*3),l.set([0,0,0,t<2?f:p],(u*4+t)*4)}),s.attributes.position.needsUpdate=!0,s.attributes.color.needsUpdate=!0,this.i=(u+1)%this.max,this.last.set(e,{p:t.clone(),side:n.clone(),k:r})}clear(){this.mesh.geometry.attributes.color.array.fill(0),this.mesh.geometry.attributes.color.needsUpdate=!0,this.last.clear()}},wr=`./`;function Tr(e,t){let n=new _e,r=(r,i)=>{let o=n.load(`${wr}textures/ext/v_${e}_${r}.jpg`);return o.wrapS=o.wrapT=a,o.anisotropy=t,i&&(o.colorSpace=k),o},i=r(`orm`);return new h({map:r(`albedo`,!0),normalMap:r(`normal`),aoMap:i,roughnessMap:i,metalnessMap:i,roughness:1,metalness:+(e===`tin`),vertexColors:!0,envMapIntensity:.7})}var Er=class{constructor(){this.b={}}buf(e){return this.b[e]||={p:[],n:[],uv:[],c:[],uv1:[]}}quad(e,t,n,r,i,a,o,{u0:s=0,v0:c=0,dark:l=0}={}){let u=this.buf(e),d=new M().subVectors(n,t),f=new M().subVectors(i,t),p=new M().crossVectors(d,f).normalize(),m=d.length(),h=f.length(),g=[[s,c],[s+m/a,c],[s+m/a,c+h/a],[s,c+h/a]],_=[t,n,r,i],v=e=>{let n=_[e].y-t.y,r=l?1-l*Math.max(0,1-n/1.1):1;return[o[0]*r,o[1]*r,o[2]*r]};for(let e of[0,1,2,0,2,3])u.p.push(_[e].x,_[e].y,_[e].z),u.n.push(p.x,p.y,p.z),u.uv.push(g[e][0],g[e][1]),u.c.push(...v(e))}box(e,t,n,r,i,a,o,s={}){let c=[n/2,r/2,i/2],l=(e,n,r)=>new M(e*c[0],n*c[1],r*c[2]).applyMatrix4(t);[[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]].forEach((t,n)=>{s.skipBottom&&n===5||this.quad(e,l(...t[0]),l(...t[1]),l(...t[2]),l(...t[3]),a,o,s)})}build(e,t){for(let[n,r]of Object.entries(this.b)){let i=new I;i.setAttribute(`position`,new P(r.p,3)),i.setAttribute(`normal`,new P(r.n,3)),i.setAttribute(`uv`,new P(r.uv,2)),i.setAttribute(`color`,new P(r.c,3));let a=new N(i,e[n]);a.castShadow=!0,a.receiveShadow=!0,t.add(a)}}},Dr=[[1,.98,.94],[.98,.88,.7],[.95,.82,.76],[.85,.86,.84],[.9,.8,.62],[1,.95,.85]],Or=[[.25,.42,.33],[.28,.4,.55],[.55,.3,.22],[.5,.45,.38],[.6,.55,.42]];function kr(e,t,n){let r=t.yaw,a=new i().makeRotationY(r).setPosition(t.x,t.y-.3,t.z),o=(e,t,n)=>new M(e,t,n).applyMatrix4(a),s=(e,t,n)=>new i().makeRotationY(r).setPosition(o(e,t,n)),c=t.kind,l=!!t.farm,u=t.floors,d=u*3+.5,f=t.w,p=t.d,m=l?n()<.5?`wood`:`concrete`:[`plaster`,`paint`,`brick`,`plaster`,`concrete`,`paint`][c],h=l?[.85,.8,.72]:Dr[Math.floor(n()*Dr.length)],g=.85+n()*.15,_=h.map(e=>e*g),v=[o(-f/2,0,p/2),o(f/2,0,p/2),o(f/2,0,-p/2),o(-f/2,0,-p/2)];for(let t=0;t<4;t++){let n=v[t],r=v[(t+1)%4],i=new M(0,d,0);e.quad(m,n,r,r.clone().add(i),n.clone().add(i),2.6,_,{dark:.45})}e.box(`concrete`,s(0,.25,0),f+.2,.5,p+.2,2,[.55,.53,.5]);let y=Or[Math.floor(n()*Or.length)];for(let t of[1,-1]){let a=Math.max(1,Math.floor((f-1.5)/2.6));for(let s=0;s<u;s++)for(let l=0;l<a;l++){let u=-f/2+(l+.5)*(f/a),d=s===0,m=d&&t===1&&l===Math.floor(a/2),h=d?m?1.55:2.05:.5+s*3+1.45,g=m?1.1:1,_=m?2.1:1.3,v=t*(p/2+.01),b=new i().makeRotationY(r+(t>0?0:Math.PI)).setPosition(o(u,h,v));if(e.box(`dark`,b,g,_,.05,1,[1,1,1]),e.box(`wood`,new i().multiplyMatrices(b,new i().makeTranslation(0,_/2+.12,.04)),g+.3,.18,.12,1.5,[.72,.68,.62]),m||e.box(`concrete`,new i().multiplyMatrices(b,new i().makeTranslation(0,-_/2-.06,.08)),g+.25,.1,.2,1,[.8,.78,.74]),m){e.box(`wood`,new i().multiplyMatrices(b,new i().makeTranslation(0,0,.03)),g*.9,_*.95,.06,1.2,y.map(e=>e*.8));continue}let x=n();if(x<.65){let t=x<.4;for(let r of[-1,1]){if(n()<.12)continue;let a=new i().multiplyMatrices(b,new i().makeTranslation(r*(t?g*.5+g*.25+.06:g*.25),0,.07));e.box(`wood`,a,g*.5,_,.05,1.2,y)}}if(s>=1&&t===1&&c%2==0&&l===Math.floor(a/2)){let t=new i().multiplyMatrices(b,new i().makeTranslation(0,-_/2-.1,.55));e.box(`concrete`,t,g+1.2,.14,1.1,1,[.78,.76,.72]);for(let n=-2;n<=2;n++)e.box(`iron`,new i().multiplyMatrices(t,new i().makeTranslation(n*(g+1.1)/4,.5,.5)),.035,.95,.035,1,[.2,.19,.18]);e.box(`iron`,new i().multiplyMatrices(t,new i().makeTranslation(0,.98,.5)),g+1.15,.05,.05,1,[.2,.19,.18])}}}let b=(n()<.5?[.9,.75,.68]:[1,.85,.75]).map(e=>e*(.7+n()*.25));if(l||c===5){let t=.4,n=d+.9,r=d,i=o(-f/2-t,r,p/2+t),a=o(f/2+t,r,p/2+t),s=o(f/2+t,n,-p/2-t),c=o(-f/2-t,n,-p/2-t);e.quad(`tin`,i,a,s,c,2.2,[.8,.72,.64]),e.quad(`tin`,c,s,a,i,2.2,[.5,.45,.4]),e.quad(m,o(-f/2,d,-p/2),o(-f/2,d,p/2),o(-f/2,r+0,p/2),o(-f/2,n-.4,-p/2),2.6,_)}else if(c===3||c===4){e.box(`concrete`,s(0,d+.08,0),f,.16,p,2.5,[.62,.6,.57]);for(let[t,n,r,i]of[[0,p/2,f+.3,.3],[0,-p/2,f+.3,.3],[f/2,0,.3,p],[-f/2,0,.3,p]])e.box(m,s(t,d+.45,n),r,.9,i,2.6,_);if(n()<.7){let t=(n()-.5)*(f-3),r=(n()-.5)*(p-3);e.box(`tin`,s(t,d+1.25,r),1.4,1.2,1.4,1.5,[.7,.68,.64]);for(let[n,i]of[[-.6,-.6],[.6,-.6],[-.6,.6],[.6,.6]])e.box(`iron`,s(t+n,d+.45,r+i),.08,.7,.08,1,[.25,.22,.2])}}else{let t=.45,a=Math.min(f,p)*.28,c=f>=p,l=(c?p:f)/2+t,u=(c?f:p)/2+t,h=(e,t,n)=>c?o(e,n,t):o(t,n,e),g=d,v=d+a,y=[h(-u,l,g),h(u,l,g),h(u,0,v),h(-u,0,v)],x=[h(u,-l,g),h(-u,-l,g),h(-u,0,v),h(u,0,v)];c||(y.reverse(),x.reverse()),e.quad(`roof`,...y,1.6,b),e.quad(`roof`,...x,1.6,b),e.quad(`dark`,y[3],y[2],y[1],y[0],2,[1,1,1]),e.quad(`dark`,x[3],x[2],x[1],x[0],2,[1,1,1]);let S=(c?p:f)/2;for(let t of[-1,1]){let n=t*(c?f:p)/2,r=h(n,-S,g),i=h(n,S,g),a=h(n,0,v),o=t*(c?1:-1)>0?[r,a,i]:[i,a,r],s=e.buf(m),l=new M().crossVectors(new M().subVectors(o[1],o[0]),new M().subVectors(o[2],o[0])).normalize();for(let e of o)s.p.push(e.x,e.y,e.z),s.n.push(l.x,l.y,l.z),s.uv.push((e.x+e.z)/2.6,e.y/2.6),s.c.push(..._)}e.box(`roof`,c?s(0,v+.05,0):new i().makeRotationY(r+Math.PI/2).setPosition(o(0,v+.05,0)),u*2,.16,.36,1,b.map(e=>e*.85)),n()<.6&&e.box(`brick`,s((n()-.5)*f*.5,v-.2,(n()-.5)*p*.3),.6,1.6,.6,1.5,[.7,.66,.62])}return{x:t.x,y:t.y-.3,z:t.z,w:f,d:p,h:d+.5,yaw:r}}async function Ar(e,t,n,r,a){let o=a.find(e=>e.id===`village`),s=new b;t.add(s);let c=[];if(!o)return{group:s,colliders:c,handles:[]};let l=we(4242),u=Math.min(8,r.terrainStep>3?4:8),d=Object.fromEntries([`plaster`,`paint`,`brick`,`roof`,`tin`,`wood`,`concrete`].map(e=>[e,Tr(e,u)]));d.dark=new h({color:723465,roughness:.6,metalness:.1,vertexColors:!0}),d.iron=new h({color:16777215,roughness:.6,metalness:.7,vertexColors:!0});let f=new Er;for(let t of e.data.buildings)c.push(kr(f,t,l));f.build(d,s);let p=[`dead_tree_trunk`,`dead_tree_trunk_02`,`island_tree_01`,`dry_branches_medium_01`,`shrub_01`,`shrub_02`,`shrub_03`,`shrub_04`,`street_lamp_01`,`painted_wooden_bench`,`wooden_crate_01`,`Barrel_02`,`wine_barrel_01`,`stone_fire_pit`,`wooden_picnic_table`],m=await At(p);for(let e of p.filter(e=>/shrub|tree|branches/.test(e)))for(let{mat:t}of m[e].meshes)xt(t,.03/Math.max(.3,m[e].size.y));let{put:g,build:_,handles:v}=Mt(e,m,l),y=o.villageCentre,x=o.width,S=(e,t)=>Math.hypot(e-y[0],t-y[1])<190,C=(e,t,n)=>c.some(r=>Math.abs(r.x-e)<r.w/2+n+1&&Math.abs(r.z-t)<r.d/2+n+1&&Math.hypot(...jr(e-r.x,t-r.z,r.yaw).map((e,t)=>Math.max(0,Math.abs(e)-(t?r.d:r.w)/2)))<n);for(let t=0;t<o.n;t+=24){let n=o.frame(t);if(!S(n.x,n.z))continue;let r=t/24%2?1:-1,i=n.x+n.nx*r*(x/2+1.2),a=n.z+n.nz*r*(x/2+1.2);C(i,a,.6)||Ae(e,i,a,x/2+.6)||g(`street_lamp_01`,i,a,n.yaw+(r>0?Math.PI/2:-Math.PI/2),4.6,{byHeight:!0})}for(let t=0;t<900;t++){let t=Math.floor(l()*o.n),n=o.frame(t),r=l()<.5?-1:1,i=S(n.x,n.z),a=x/2+(i?1.3+l()*2.2:3+l()*30),s=n.x+n.nx*r*a,u=n.z+n.nz*r*a;if(Ae(e,s,u,x/2+.8)||C(s,u,.8))continue;let d=l(),f=n.yaw+(r>0?-Math.PI/2:Math.PI/2);i?d<.15?g(`painted_wooden_bench`,s,u,f,1.8):d<.3?g(l()<.5?`Barrel_02`:`wine_barrel_01`,s,u,l()*6.3,.95,{byHeight:!0}):d<.42?g(`wooden_crate_01`,s,u,l()*6.3,.8):d<.5&&g([`shrub_01`,`shrub_02`,`shrub_03`,`shrub_04`][Math.floor(l()*4)],s,u,l()*6.3,1.2+l(),{byHeight:!0}):d<.06?g(l()<.5?`dead_tree_trunk`:`dead_tree_trunk_02`,s,u,l()*6.3,3+l()*1.5,{align:.8,sink:.08}):d<.12?(g(`island_tree_01`,s,u,l()*6.3,5+l()*4,{byHeight:!0,sink:.01}),c.push({x:s,y:e.heightAt(s,u),z:u,w:.7,d:.7,h:4,yaw:0})):d<.32?g([`shrub_01`,`shrub_02`,`shrub_03`,`shrub_04`][Math.floor(l()*4)],s,u,l()*6.3,.8+l()*1.6,{byHeight:!0}):d<.4&&g(`dry_branches_medium_01`,s,u,l()*6.3,1.5+l()*2)}g(`stone_fire_pit`,y[0],y[1],0,2.2);for(let t=0;t<4;t++){let n=t*1.57+.4,r=y[0]+Math.cos(n)*6,i=y[1]+Math.sin(n)*6;Ae(e,r,i,x/2+1)||g(`wooden_picnic_table`,r,i,n,2.2)}_(s);let w=new Er;for(let t=0;t<o.n;t+=3){let n=o.frame(t);if(!S(n.x,n.z))for(let r of[-1,1]){let a=x/2+7,o=n.x+n.nx*r*a,s=n.z+n.nz*r*a;if(Ae(e,o,s,x/2+5)||C(o,s,1)||Math.floor(t/60)%3==0)continue;let c=e.heightAt(o,s),u=new i().makeRotationY(n.yaw).setPosition(o,c+.55,s);w.box(`wood`,u,.12,1.1+(l()-.5)*.15,.12,1,[.75,.7,.62]);let d=new i().makeRotationY(n.yaw).setPosition(o,c+.85,s+0);w.box(`wood`,new i().multiplyMatrices(d,new i().makeTranslation(0,0,1.5)),.05,.12,3,1.5,[.7,.66,.6]),w.box(`wood`,new i().multiplyMatrices(d,new i().makeTranslation(0,-.4,1.5)),.05,.12,3,1.5,[.7,.66,.6])}}let T=[];for(let t=0;t<o.n;t+=38){let n=o.frame(t),r=x/2+4.5,a=n.x-n.nx*r,s=n.z-n.nz*r;if(Ae(e,a,s,x/2+2)||C(a,s,1)){T.push(null);continue}let l=e.heightAt(a,s);w.box(`wood`,new i().makeRotationY(n.yaw).setPosition(a,l+4,s),.24,8,.24,2,[.6,.55,.5]),w.box(`wood`,new i().makeRotationY(n.yaw).setPosition(a,l+7.6,s),1.8,.14,.14,2,[.6,.55,.5]),T.push(new M(a,l+7.7,s).add(new M(n.tx,0,n.tz).multiplyScalar(0))),T[T.length-1].nx=n.nx,T[T.length-1].nz=n.nz,c.push({x:a,y:l,z:s,w:.4,d:.4,h:8,yaw:0})}w.build(d,s);let E=[];for(let e=0;e+1<T.length;e++){let t=T[e],n=T[e+1];if(t&&n)for(let e of[-.8,.8]){let r=t.clone().add(new M(t.nz*0+t.nx*e,0,t.nz*e)),i=n.clone().add(new M(n.nx*e,0,n.nz*e));for(let e=0;e<12;e++){let t=e/12,n=(e+1)/12,a=e=>r.clone().lerp(i,e).add(new M(0,-Math.sin(Math.PI*e)*.9,0));E.push(a(t),a(n))}}}if(E.length){let e=new Re(new I().setFromPoints(E),new pe({color:1315344}));s.add(e)}return{group:s,colliders:c,handles:v}}function jr(e,t,n){let r=Math.cos(n),i=Math.sin(n);return[e*r-t*i,e*i+t*r]}var Mr=5,Nr=5,Pr=11,Fr=7.5,Ir=new M(1,1,1);function Lr(e,t){let n=Math.sin(e*127.1+t*311.7)*43758.5453;return n-Math.floor(n)}var Rr=class{constructor(t){this.min=t.min.clone().addScalar(-.06),this.max=t.max.clone().addScalar(.06),this.size=this.max.clone().sub(this.min),this.half=this.size.clone().multiplyScalar(.5),this.centre=this.min.clone().add(this.half),this.n=275,this.rest=new Float32Array(825),this.target=new Float32Array(825),this.plastic=new Float32Array(825),this.elastic=new Float32Array(825),this.vel=new Float32Array(825),this.stiff=new Float32Array(275);for(let e=0;e<Pr;e++)for(let t=0;t<Nr;t++)for(let n=0;n<Mr;n++){let r=this.idx(n,t,e),i=this.min.x+this.size.x*n/4,a=this.min.y+this.size.y*t/4,o=this.min.z+this.size.z*e/10;this.rest[r*3]=i,this.rest[r*3+1]=a,this.rest[r*3+2]=o;let s=(o-this.centre.z)/this.half.z,c=(a-this.min.y)/this.size.y,l=s>.36?1:s<-.4?.85:.5;s<=.36&&s>=-.4&&c>.7&&(l=.62),this.stiff[r]=l}let n=new Uint16Array(1100);this.data=n,this.tex=new ye(n,Mr,Nr,Pr),this.tex.format=ae,this.tex.type=e,this.tex.minFilter=this.tex.magFilter=L,this.tex.wrapS=this.tex.wrapT=this.tex.wrapR=ze,this.tex.unpackAlignment=1,this.tex.needsUpdate=!0,this.uniforms={uLat:{value:this.tex},uLatMin:{value:this.min.clone()},uLatInv:{value:new M(1/this.size.x,1/this.size.y,1/this.size.z)},uLatN:{value:new M(Mr,Nr,Pr)},uLatFrame:{value:new i}},this.active=!1,this.mats=new Map,this.seed=Math.random()*100}idx(e,t,n){return(n*Nr+t)*Mr+e}setFrame(e,t){this.uniforms.uLatFrame.value.compose(e,t,Ir).invert()}impact(e,t,n){let r=Math.min(1.5,Math.max(0,(n-2.2)/17));if(r<=0)return 0;this.seed+=1.37;let i=.62*r**1.15,a=.75+.95*Math.min(1.2,r),o=2.4+5*r,s=this.rest,c=this.target,l=this.vel,u=0;for(let n=0;n<this.n;n++){let r=s[n*3]-e.x,d=s[n*3+1]-e.y,f=s[n*3+2]-e.z,p=-(r*t.x+d*t.y+f*t.z),m=r+t.x*p,h=d+t.y*p,g=f+t.z*p,_=Math.hypot(m,h,g),v=Math.hypot(_,Math.max(0,p)*.62);if(v>=a)continue;let y=i*(1-v/a)**2*this.stiff[n]*(.65+.7*Lr(n,this.seed));if(c[n*3]-=t.x*y,c[n*3+1]-=t.y*y,c[n*3+2]-=t.z*y,_>.001){let e=y*(.22+.25*Lr(n+31,this.seed))/_;c[n*3]+=m*e,c[n*3+1]+=h*e*1.3,c[n*3+2]+=g*e}l[n*3]-=t.x*y*o,l[n*3+1]-=t.y*y*o,l[n*3+2]-=t.z*y*o,u+=y}if(r>.4){let n=r-.4,i=Math.abs(t.x)>.6,a=Math.abs(t.z)>.6;for(let r=0;r<this.n;r++){let o=(s[r*3+2]-this.centre.z)/this.half.z,l=1-o*o;i&&(c[r*3]-=Math.sign(t.x)*.16*n*l*(Math.abs(e.z-s[r*3+2])<1.5?1:.6)),a&&(c[r*3+1]+=.11*n*l)}}for(let e=0;e<this.n;e++){l[e*3]-=t.x*r*.5,l[e*3+1]-=t.y*r*.5,l[e*3+2]-=t.z*r*.5;let n=s[e*3+1]-this.centre.y;l[e*3]+=(Lr(this.seed,3)-.5)*r*n*.9}return this.smooth(.22),this.clamp(),this.active=!0,u}blast(e,t){let n=this.rest,r=this.target,i=this.vel,a=2.6;this.seed+=2.1;for(let o=0;o<this.n;o++){let s=n[o*3]-e.x,c=n[o*3+1]-e.y,l=n[o*3+2]-e.z,u=Math.hypot(s,c,l);if(u>=a||u<.001)continue;let d=(1-u/a)**1.5,f=.32*t*d*(.6+.8*Lr(o,this.seed))/u;r[o*3]+=s*f,r[o*3+1]+=c*f*1.4+.05*t*d,r[o*3+2]+=l*f,i[o*3]+=s*f*9,i[o*3+1]+=c*f*9,i[o*3+2]+=l*f*9}this.smooth(.2),this.clamp(),this.active=!0}smooth(e){let t=this.target,n=new Float32Array(t);for(let r=0;r<Pr;r++)for(let i=0;i<Nr;i++)for(let a=0;a<Mr;a++){let o=this.idx(a,i,r),s=0,c=0,l=0,u=0;for(let[e,t,o]of[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){let d=a+e,f=i+t,p=r+o;if(d<0||f<0||p<0||d>=Mr||f>=Nr||p>=Pr)continue;let m=this.idx(d,f,p);c+=n[m*3],l+=n[m*3+1],u+=n[m*3+2],s++}t[o*3]+=(c/s-n[o*3])*e,t[o*3+1]+=(l/s-n[o*3+1])*e,t[o*3+2]+=(u/s-n[o*3+2])*e}}clamp(){let e=this.target,t=this.half,n=t.x*.42,r=t.y*.42,i=t.z*.3;for(let t=0;t<this.n;t++)e[t*3]=Math.max(-n,Math.min(n,e[t*3])),e[t*3+1]=Math.max(-r,Math.min(r,e[t*3+1])),e[t*3+2]=Math.max(-i,Math.min(i,e[t*3+2]))}update(e){if(!this.active||e<=0)return;let t=this.plastic,n=this.target,r=this.elastic,i=this.vel,a=this.data,o=Math.min(1,e*22),c=0,l=Math.ceil(e/Math.min(e,1/30));for(let a=0;a<this.n*3;a++){t[a]+=(n[a]-t[a])*o;for(let t=0;t<l;t++)i[a]+=(-340*r[a]-Fr*i[a])*(e/l),r[a]+=i[a]*(e/l);c+=Math.abs(r[a])+Math.abs(i[a])*.05+Math.abs(n[a]-t[a])}for(let e=0;e<this.n;e++)a[e*4]=s.toHalfFloat(t[e*3]+r[e*3]),a[e*4+1]=s.toHalfFloat(t[e*3+1]+r[e*3+1]),a[e*4+2]=s.toHalfFloat(t[e*3+2]+r[e*3+2]);this.tex.needsUpdate=!0,c<.001*this.n&&(r.fill(0),i.fill(0),t.set(n),this.active=!1)}sample(e,t,n,r){let i=y.clamp((e-this.min.x)/this.size.x,0,1)*4,a=y.clamp((t-this.min.y)/this.size.y,0,1)*4,o=y.clamp((n-this.min.z)/this.size.z,0,1)*10,s=Math.min(3,Math.floor(i)),c=Math.min(3,Math.floor(a)),l=Math.min(9,Math.floor(o)),u=i-s,d=a-c,f=o-l;r.set(0,0,0);let p=this.target;for(let e=0;e<8;e++){let t=e&1,n=e>>1&1,i=e>>2&1,a=(t?u:1-u)*(n?d:1-d)*(i?f:1-f),o=this.idx(s+t,c+n,l+i);r.x+=p[o*3]*a,r.y+=p[o*3+1]*a,r.z+=p[o*3+2]*a}return r}bake(e,t){let n=e.clone(),r=n.attributes.position.array,a=new M,o=new M,s=new i().copy(t).invert();for(let e=0;e<r.length;e+=3)o.set(r[e],r[e+1],r[e+2]).applyMatrix4(t),o.add(this.sample(o.x,o.y,o.z,a)).applyMatrix4(s),r[e]=o.x,r[e+1]=o.y,r[e+2]=o.z;return n.attributes.position.needsUpdate=!0,n.computeBoundingBox(),n.computeBoundingSphere(),n}material(e){if(!e)return e;if(this.mats.has(e))return this.mats.get(e);let t=e.clone(),n=e.onBeforeCompile,r=!e.isMeshDepthMaterial;t.onBeforeCompile=(t,i)=>{n?.call(e,t,i),zr(t,this.uniforms,r)};let i=e.customProgramCacheKey?.()||``;return t.customProgramCacheKey=()=>`${i}-lattice`,t.userData.base=e,this.mats.set(e,t),t}depthMaterial(){return this.depth||=this.material(new v({depthPacking:ge})),this.depth}};function zr(e,t,n=!0){Object.assign(e.uniforms,t),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
uniform highp sampler3D uLat; uniform vec3 uLatMin, uLatInv, uLatN; uniform mat4 uLatFrame;
vec3 latD(vec3 p) { vec3 t = clamp((p - uLatMin) * uLatInv, 0.0, 1.0); return texture(uLat, (0.5 + t * (uLatN - 1.0)) / uLatN).xyz; }`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
{
  mat4 lf = uLatFrame * modelMatrix;
  transformed += transpose(mat3(lf)) * latD((lf * vec4(position, 1.0)).xyz);
}`),n&&(e.vertexShader=e.vertexShader.replace(`#include <beginnormal_vertex>`,`#include <beginnormal_vertex>
{
  const float e = 0.06;
  mat4 lf = uLatFrame * modelMatrix;
  mat3 lr = mat3(lf);
  vec3 lp = (lf * vec4(position, 1.0)).xyz;
  vec3 l0 = latD(lp);
  mat3 J = mat3(1.0) + mat3((latD(lp + vec3(e, 0.0, 0.0)) - l0) / e, (latD(lp + vec3(0.0, e, 0.0)) - l0) / e, (latD(lp + vec3(0.0, 0.0, e)) - l0) / e);
  objectNormal = normalize(transpose(lr) * (transpose(inverse(J)) * (lr * objectNormal)));
}`))}var Br=new M;function Vr(e,t,n,r,i,a){let o=2*Math.PI*i/4,s=Math.max(a-2*i,0),c=Math.PI/4;Br.copy(t),Br[r]=0,Br.normalize();let l=.5*o/(o+s),u=1-Br.angleTo(e)/c;return Math.sign(Br[n])===1?u*l:s/(o+s)+l+l*(1-u)}var Hr=class e extends A{constructor(e=1,t=1,n=1,r=2,i=.1){let a=r*2+1;if(i=Math.min(e/2,t/2,n/2,i),super(1,1,1,a,a,a),this.type=`RoundedBoxGeometry`,this.parameters={width:e,height:t,depth:n,segments:r,radius:i},a===1)return;let o=this.toNonIndexed();this.index=null,this.attributes.position=o.attributes.position,this.attributes.normal=o.attributes.normal,this.attributes.uv=o.attributes.uv;let s=new M,c=new M,l=new M(e,t,n).divideScalar(2).subScalar(i),u=this.attributes.position.array,d=this.attributes.normal.array,f=this.attributes.uv.array,p=u.length/6,m=new M,h=.5/a;for(let r=0,a=0;r<u.length;r+=3,a+=2)switch(s.fromArray(u,r),c.copy(s),c.x-=Math.sign(c.x)*h,c.y-=Math.sign(c.y)*h,c.z-=Math.sign(c.z)*h,c.normalize(),u[r+0]=l.x*Math.sign(s.x)+c.x*i,u[r+1]=l.y*Math.sign(s.y)+c.y*i,u[r+2]=l.z*Math.sign(s.z)+c.z*i,d[r+0]=c.x,d[r+1]=c.y,d[r+2]=c.z,Math.floor(r/p)){case 0:m.set(1,0,0),f[a+0]=Vr(m,c,`z`,`y`,i,n),f[a+1]=1-Vr(m,c,`y`,`z`,i,t);break;case 1:m.set(-1,0,0),f[a+0]=1-Vr(m,c,`z`,`y`,i,n),f[a+1]=1-Vr(m,c,`y`,`z`,i,t);break;case 2:m.set(0,1,0),f[a+0]=1-Vr(m,c,`x`,`z`,i,e),f[a+1]=Vr(m,c,`z`,`x`,i,n);break;case 3:m.set(0,-1,0),f[a+0]=1-Vr(m,c,`x`,`z`,i,e),f[a+1]=1-Vr(m,c,`z`,`x`,i,n);break;case 4:m.set(0,0,1),f[a+0]=1-Vr(m,c,`x`,`y`,i,e),f[a+1]=1-Vr(m,c,`y`,`x`,i,t);break;case 5:m.set(0,0,-1),f[a+0]=Vr(m,c,`x`,`y`,i,e),f[a+1]=1-Vr(m,c,`y`,`x`,i,t)}}static fromJSON(t){return new e(t.width,t.height,t.depth,t.segments,t.radius)}},Ur=1.5,Wr=-.13,Gr={bay:new h({color:1776152,roughness:.8,metalness:.35,side:2,name:`eng_bay`}),alu:new h({color:10789532,roughness:.48,metalness:.92,name:`eng_alu`}),black:new h({color:1315860,roughness:.62,metalness:.35,name:`eng_black`}),red:new d({color:10360848,roughness:.32,metalness:.35,clearcoat:.6,clearcoatRoughness:.2,name:`eng_red`}),chrome:new h({color:15131872,roughness:.1,metalness:1,name:`eng_chrome`}),rubber:new h({color:855309,roughness:.88,metalness:0,name:`eng_rubber`}),steel:new h({color:6775646,roughness:.4,metalness:.9,name:`eng_steel`}),header:new h({color:16777215,vertexColors:!0,roughness:.38,metalness:.9,emissive:16726538,emissiveIntensity:0,name:`eng_header`}),plastic:new h({color:16777215,vertexColors:!0,roughness:.55,metalness:.05,name:`eng_plastic`}),radiator:null};function Kr(){let e=document.createElement(`canvas`);e.width=64,e.height=64;let t=e.getContext(`2d`);t.fillStyle=`#26282a`,t.fillRect(0,0,64,64);for(let e=0;e<64;e+=4)t.fillStyle=`#6d6e6c`,t.fillRect(0,e,64,1),t.fillStyle=`#111`,t.fillRect(0,e+2,64,1);for(let e=0;e<64;e+=16)t.fillStyle=`#3c3d3d`,t.fillRect(e,0,2,64);let n=new Be(e);return n.wrapS=n.wrapT=a,n.repeat.set(8,5),n.colorSpace=k,new h({map:n,roughness:.6,metalness:.7,name:`eng_radiator`})}var qr=new u,Jr=new i,Yr=new n,Xr=new M(1,1,1);function B(e,t,n,r,i=0,a=0,o=0){return Jr.compose(new M(t,n,r),Yr.setFromEuler(qr.set(i,a,o)),Xr),e.applyMatrix4(Jr),e}function Zr(e,t,n,r=.015,i=2){return new Hr(e,t,n,i,Math.min(r,e/2.1,t/2.1,n/2.1))}function Qr(e,t,n){return new A(e,t,n)}function $r(e,t,n=20,i=e){return new r(e,i,t,n).rotateX(Math.PI/2)}function ei(e,t,n=20,i=e){return new r(e,i,t,n)}function ti(e,t){return new r(e,e,t,6)}function ni(e,t,n=24,r=8,i=!1){let a=new w(e.map(e=>new M(...e)),i,`centripetal`);return new Te(a,n,t,r,i)}function ri(e,t,n=4){let r=[new He(.012,-t/2),new He(e*.96,-t/2)];for(let i=0;i<=n*2;i++){let a=i/(n*2);r.push(new He(i%2?e*.9:e,-t/2+t*.08+a*t*.84))}return r.push(new He(e*.96,t/2),new He(e*.35,t/2),new He(e*.3,t/2+.012),new He(.012,t/2+.012)),new Ee(r,28).rotateX(Math.PI/2)}function ii(e,t){let n=e.attributes.position.count,r=new Float32Array(n*3),i=new o(t);for(let e=0;e<n;e++)r[e*3]=i.r,r[e*3+1]=i.g,r[e*3+2]=i.b;return e.setAttribute(`color`,new Le(r,3)),e}function ai(e){let t=e.map(e=>{let t=e.index?e.toNonIndexed():e;for(let e of Object.keys(t.attributes))[`position`,`normal`,`uv`,`color`].includes(e)||t.deleteAttribute(e);return t.attributes.uv||t.setAttribute(`uv`,new Le(new Float32Array(t.attributes.position.count*2),2)),t});if(t.some(e=>e.attributes.color))for(let e of t)e.attributes.color||ii(e,16777215);let n=Nt(t,!1);return n.computeBoundingSphere(),n}var oi=Math.PI/4;function si(e){let t={bay:[],alu:[],black:[],red:[],chrome:[],rubber:[],steel:[],header:[],plastic:[],radiator:[]};t.bay.push(B(Qr(1.66,.6,.02),0,-.06,1.04));for(let e of[-1,1])t.bay.push(B(Qr(.02,.5,1.1),e*.8,-.02,1.6,0,0,e*.12));t.bay.push(B(Qr(1.5,.02,1.15),0,-.44,1.62)),t.black.push(B(Zr(.36,.13,.56,.03),0,-.36,1.48)),t.alu.push(B(Zr(.44,.17,.62,.02),0,-.22,Ur)),t.alu.push(B(Zr(.3,.26,.04,.02),0,-.06,1.82)),t.alu.push(B($r(.25,.12,28,.2),0,-.14,1.12));for(let n of[-1,1]){let r=-n*oi,i=(e,t=0)=>[Math.sin(n*oi)*e+n*Math.cos(oi)*t,Wr+Math.cos(oi)*e-Math.sin(oi)*t,0],[a,o]=i(.17);t.alu.push(B(Zr(.2,.22,.6,.02),a,o,Ur,0,0,r));let[s,c]=i(.31);t.alu.push(B(Zr(.22,.07,.62,.012),s,c,Ur,0,0,r));let[l,u]=i(.375);if(t.red.push(B(Zr(.19,.07,.58,.03,3),l,u,Ur,0,0,r)),e){for(let e=-2;e<=2;e++){let[n,a]=i(.413,e*.03);t.red.push(B(Zr(.012,.016,.44,.005,1),n,a,Ur,0,0,r))}for(let e of[-1,1])for(let n=0;n<4;n++){let[a,o]=i(.405,e*.083);t.steel.push(B(ti(.011,.016),a,o,1.26+n*.16,0,0,r))}let[e,a]=i(.42,-.04);t.black.push(B(ei(.03,.03,16),e,a,Ur+(n>0?.17:-.17),0,0,r));for(let e=0;e<5;e++){let[a,o]=i(.33,.115);t.steel.push(B(ti(.012,.018),a,o,1.24+e*.13,0,0,r-n*Math.PI/2))}}for(let a=0;a<4;a++){let o=1.28+a*.147,[s,c]=i(.29,.13),l=[[s,c,o],[s+n*.07,c-.03,o],[s+n*.12,c-.14,o-.02-a*.01],[n*.5,-.3,o-.1-a*.04],[n*.44,-.4,1.08],[n*.4,-.42,1]];(e||a%2==0)&&t.header.push(ci(ni(l,.021,e?30:10,e?8:5))),e&&t.steel.push(B(Zr(.012,.06,.07,.006,1),s+n*.005,c,o,0,0,r+n*Math.PI/2))}if(t.header.push(ci(ni([[n*.4,-.42,1.02],[n*.37,-.43,.8],[n*.3,-.45,.9]],.04,8,10),.9)),e)for(let e=0;e<4;e++){let a=1.35+e*.147,[o,s]=i(.275,.12);t.plastic.push(ii(B(ei(.009,.04,8),o+n*.02,s+.01,a,0,0,r-n*1.1),15262940)),t.rubber.push(B(ei(.013,.04,8),o+n*.04,s+.02,a,0,0,r-n*1.1));let c=ni([[o+n*.055,s+.03,a],[o+n*.08,s+.14,a-.02],[n*.18,.22,1.2+e*.03],[n*.04,.2,1.16]],.0065,18,5);t.plastic.push(ii(c,11736076))}}if(t.alu.push(B(Zr(.25,.1,.5,.03,3),0,.12,Ur)),e){for(let e of[-1,1])for(let n=0;n<4;n++){let r=1.28+n*.147;t.alu.push(ni([[e*.1,.13,r],[e*.17,.12,r],[e*.22,.06,r]],.024,8,8))}for(let e=0;e<3;e++)t.steel.push(B(ti(.012,.02),.09,.175,1.35+e*.15),B(ti(.012,.02),-.09,.175,1.35+e*.15))}t.alu.push(B($r(.05,.08,24),0,.14,1.79)),t.black.push(ni([[0,.14,1.83],[.06,.15,1.92],[.22,.14,1.96],[.38,.1,1.92]],.045,16,12));let n=ei(.11,.13,e?72:20);if(e){let e=n.attributes.position;for(let t=0;t<e.count;t++){let n=e.getX(t),r=e.getZ(t);if(Math.hypot(n,r)<.105)continue;let i=1+.045*Math.cos(Math.atan2(r,n)*36);e.setX(t,n*i),e.setZ(t,r*i)}n.computeVertexNormals()}t.plastic.push(ii(B(n,.45,.08,1.92),10164754)),t.chrome.push(B(ei(.122,.02,32),.45,.155,1.92),B(ei(.122,.02,32),.45,.005,1.92)),t.chrome.push(B(ei(.018,.02,12),.45,.17,1.92)),t.black.push(B(ei(.05,.06,20),0,.2,1.16),B(ei(.03,.08,14),0,.15,1.16));let i=[{x:0,y:Wr,r:.095,w:.05},{x:0,y:.03,r:.07,w:.04},{x:.25,y:.07,r:.04,w:.04},{x:.12,y:-.03,r:.035,w:.035},{x:-.25,y:.04,r:.06,w:.04},{x:-.11,y:.14,r:.035,w:.035}];if(t.alu.push(B($r(.075,.13,24),.25,.07,1.7799999999999998)),e)for(let e=0;e<12;e++){let n=e/12*Math.PI*2;t.black.push(B(Qr(.008,.02,.06),.25+Math.cos(n)*.072,.07+Math.sin(n)*.072,1.7799999999999998,0,0,n))}t.alu.push(B($r(.05,.1,18),-.25,.04,1.7899999999999998)),t.black.push(B(ei(.04,.07,18),-.25,.14,1.7599999999999998)),t.alu.push(B(Zr(.12,.12,.08,.02),0,.02,1.8199999999999998)),t.steel.push(B(Qr(.06,.04,.2),.2,0,1.73,0,0,.4),B(Qr(.06,.04,.18),-.2,0,1.7399999999999998,0,0,-.4));{let n=i.reduce((e,t)=>e+t.x,0)/i.length,r=i.reduce((e,t)=>e+t.y,0)/i.length,a=[...i].sort((e,t)=>Math.atan2(e.y-r,e.x-n)-Math.atan2(t.y-r,t.x-n)),o=[];for(let e of a){let t=Math.atan2(e.y-r,e.x-n);for(let n of[-.55,0,.55])o.push([e.x+Math.cos(t+n)*(e.r+.006),e.y+Math.sin(t+n)*(e.r+.006),1.89])}let s=ni(o,.007,e?120:40,4,!0);s.scale(1,1,1),t.rubber.push(s)}if(t.steel.push(B(Qr(1.12,.05,.07),0,.2,2.13),B(Qr(1.12,.05,.07),0,-.3,2.13)),t.steel.push(B(Qr(.05,.5,.07),.56,-.05,2.13),B(Qr(.05,.5,.07),-.56,-.05,2.13)),t.radiator.push(B(Qr(1.06,.45,.05),0,-.05,2.13)),t.black.push(B(Zr(.5,.42,.04,.02),0,-.05,2.08)),t.black.push(B(new r(.2,.2,.09,32,1,!0).rotateX(Math.PI/2),0,-.05,2.03)),t.rubber.push(ni([[.42,.16,2.09],[.38,.2,1.98],[.15,.2,1.9],[.02,.16,1.8]],.024,20,10)),t.rubber.push(ni([[-.42,-.25,2.09],[-.3,-.25,1.98],[-.1,-.12,1.92],[-.02,-.02,1.8399999999999999]],.026,20,10)),t.chrome.push(B($r(.03,.01,12),.42,.16,2.08),B($r(.032,.01,12),-.42,-.25,2.08)),t.plastic.push(ii(B(Zr(.25,.17,.17,.012),-.56,-.05,1.22),1908514)),t.plastic.push(ii(B(Zr(.25,.012,.17,.004),-.56,.035,1.22),3108789)),t.plastic.push(ii(B(ei(.016,.03,10),-.48,.05,1.18),12589338),ii(B(ei(.016,.03,10),-.64,.05,1.18),1118481)),t.plastic.push(ii(B(Zr(.12,.15,.1,.02),.58,-.02,1.95),14210248)),t.plastic.push(ii(B(ei(.022,.03,12),.58,.07,1.95),2763306)),t.alu.push(B($r(.04,.16,16),.45,.1,1.12)),t.plastic.push(ii(B(Zr(.1,.07,.06,.015),.45,.17,1.13),13683112),ii(B(ei(.022,.02,12),.45,.215,1.13),1447446)),t.plastic.push(ii(B(Zr(.16,.08,.12,.01),-.55,.02,1.52),1381653)),t.plastic.push(ii(B(new j(.02,.006,6,14),.2,.09,1.3,0,Math.PI/2,0),15908884)),e){t.plastic.push(ii(ni([[-.48,.05,1.18],[-.4,.12,1.4],[.1,.12,1.75],[.25,.1,1.71]],.008,30,5),10818576)),t.plastic.push(ii(ni([[-.64,.05,1.18],[-.7,-.1,1.3],[-.5,-.3,1.4],[-.25,-.3,Ur]],.009,24,5),1118481));for(let e of[-1,1])t.plastic.push(ii(ni([[e*.72,.12,1.1],[e*.74,.1,1.5],[e*.7,.08,1.9],[e*.5,0,2.05]],.011,24,6),1447446))}let a={};for(let[e,n]of Object.entries(t))n.length&&(a[e]=ai(n));return{geos:a,pulleys:i.map(e=>({...e,z:1.88}))}}function ci(e,t=0){let n=e.attributes.position.count,r=e.attributes.uv,i=new Float32Array(n*3),a=[[0,[.86,.75,.52]],[.18,[.78,.55,.3]],[.36,[.42,.33,.55]],[.55,[.3,.36,.55]],[.8,[.42,.42,.44]],[1,[.36,.35,.35]]];for(let e=0;e<n;e++){let n=Math.min(1,t+r.getX(e)*(1-t)),o=0;for(;o<a.length-2&&n>a[o+1][0];)o++;let[s,c]=a[o],[l,u]=a[o+1],d=y.clamp((n-s)/(l-s),0,1);for(let t=0;t<3;t++)i[e*3+t]=c[t]+(u[t]-c[t])*d}return e.setAttribute(`color`,new Le(i,3)),e}var li={};function ui(e){return Gr.radiator||=Kr(),li[e]||=(()=>{let{geos:t,pulleys:n}=si(e),r=new Map;for(let t of n)r.has(t.r)||r.set(t.r,ri(t.r,t.w,e?4:1));let i=[];for(let e=0;e<7;e++){let t=e/7*Math.PI*2;i.push(B(Zr(.07,.17,.008,.004,1),Math.cos(t)*.1,Math.sin(t)*.1,0,.35,0,t-Math.PI/2))}return i.push($r(.05,.05,20)),{geos:t,pulleys:n,pg:r,fan:ai(i)}})()}function di(e,t=e=>e){let n=ui(e),r=new b;r.name=`engine`;let i=(e,n)=>{let i=new N(e,t(n));return i.castShadow=!0,i.receiveShadow=!0,r.add(i),i};for(let[e,t]of Object.entries(n.geos))i(t,Gr[e]);let a=[];for(let e of n.pulleys){let t=i(n.pg.get(e.r),e.r>.08?Gr.black:Gr.alu);t.position.set(e.x,e.y,e.z),a.push({o:t,k:.095/e.r})}let o=i(n.fan,Gr.black);return o.position.set(0,-.05,2),a.push({o,k:1.15}),{group:r,spin:a,header:t(Gr.header),rest:r.position.clone()}}var fi=null;function pi(){if(!fi){let e=new Ee([[0,.04],[.048,.04],[.052,.035],[.052,.028],[.049,.026],[.049,.02],[.052,.018],[.052,.012],[.049,.01],[.049,.004],[.052,.002],[.052,-.04],[.046,-.042]].map(([e,t])=>new He(e,t)),28),t=$r(.016,.1,12).rotateY(Math.PI/2).translate(0,-.02,0),n=[Zr(.03,.2,.016,.006,1).translate(0,-.12,0),Zr(.01,.2,.026,.004,1).translate(.012,-.12,0),Zr(.01,.2,.026,.004,1).translate(-.012,-.12,0)],r=new j(.022,.009,8,16).translate(0,-.02,0),i=new j(.036,.011,8,20).translate(0,-.24,0),a=[ti(.008,.04).translate(.04,-.26,0),ti(.008,.04).translate(-.04,-.26,0)];fi={crown:ai([e,t]),rod:ai([...n,r,i,...a])}}let e=new b;for(let[t,n]of[[fi.crown,Gr.chrome],[fi.rod,Gr.steel]]){let r=new N(t,n);r.castShadow=!0,e.add(r)}return e}function mi(){let e=new b,t=new N(ai([Zr(.19,.07,.58,.03,3),...[-2,-1,0,1,2].map(e=>B(Zr(.012,.016,.44,.005,1),e*.03,.038,0))]),Gr.red);return t.castShadow=!0,e.add(t),e}var hi={mirror_l:{zone:`left`,at:.12,mass:3,label:`Mirror`},mirror_r:{zone:`right`,at:.12,mass:3,label:`Mirror`},bumper_f:{zone:`front`,at:.28,mass:28,label:`Front bumper`},bumper_r:{zone:`rear`,at:.28,mass:24,label:`Rear bumper`},lightbar:{zone:`top`,at:.2,mass:14,label:`Light bar`},spare_b:{zone:`rear`,at:.45,mass:30,label:`Spare tyre`},door_l:{zone:`left`,at:.5,mass:26,label:`Door`},door_r:{zone:`right`,at:.5,mass:26,label:`Door`},spare_a:{zone:`rear`,at:.7,mass:30,label:`Spare tyre`},hood:{zone:`front`,at:.8,mass:18,label:`Bonnet`}},gi=[`front`,`rear`,`left`,`right`,`top`],_i={hood:{loose:.25,pivot:e=>[0,e.max.y,e.min.z],axis:[1,0,0],angle:-.38,flap:.05,buckle:.16},door_l:{loose:.22,pivot:e=>[e.max.x,0,e.max.z],axis:[0,1,0],angle:.62,flap:.22},door_r:{loose:.22,pivot:e=>[e.min.x,0,e.max.z],axis:[0,1,0],angle:-.62,flap:.22},bumper_f:{loose:.1,pivot:e=>[e.max.x,e.max.y,0],axis:[0,0,1],angle:-.3,flap:.06},bumper_r:{loose:.1,pivot:e=>[e.min.x,e.max.y,0],axis:[0,0,1],angle:.3,flap:.06},lightbar:{loose:.08,pivot:e=>[0,e.min.y,e.max.z],axis:[1,0,0],angle:.32,flap:.08},mirror_l:{loose:.05,pivot:e=>[e.min.x,e.min.y,e.max.z],axis:[0,1,0],angle:1.1,flap:.15},mirror_r:{loose:.05,pivot:e=>[e.max.x,e.min.y,e.max.z],axis:[0,1,0],angle:-1.1,flap:.15},spare_b:{loose:.25,pivot:e=>[e.max.x,e.min.y,e.min.z],axis:[0,0,1],angle:.28,flap:.05}},vi=[[.8,1.85,.4],[-.8,1.85,.4],[.8,1.85,-.9],[-.8,1.85,-.9],[1.1,.9,.3],[-1.1,.9,.3],[1.12,-.1,1.6],[-1.12,-.1,1.6],[1.12,-.1,-1.6],[-1.12,-.1,-1.6],[1.1,.5,-2.2],[-1.1,.5,-2.2],[0,.4,2.5],[0,.5,-2.7]];function yi(e){if(!e)return e;let t=e.clone(),n={uCrack:{value:new Ve},uGone:{value:new Ve}};return t.userData.u=n,t.onBeforeCompile=e=>{Object.assign(e.uniforms,n),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vGl;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vGl = position;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
uniform vec4 uCrack, uGone; varying vec3 vGl;
vec3 gHash(vec3 p) { p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
// distance to the nearest crack: the edges between Voronoi cells, plus the cell's own random
vec2 gCells(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z), h = gHash(i + o); vec3 r = o + h - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}`).replace(`#include <clipping_planes_fragment>`,`#include <clipping_planes_fragment>
vec4 gMask = vec4(smoothstep(0.25, 0.55, vGl.z), smoothstep(-0.15, -0.35, vGl.z), smoothstep(0.62, 0.85, vGl.x), smoothstep(-0.62, -0.85, vGl.x));
if (dot(gMask, uGone) > 0.5) discard;
float gK = clamp(dot(gMask, uCrack), 0.0, 1.6);`).replace(`#include <dithering_fragment>`,`#include <dithering_fragment>
if (gK > 0.02) {
  vec2 c = gCells(vGl * 7.0);
  vec2 c2 = gCells(vGl * 23.0 + 3.1);
  float web = (1.0 - smoothstep(0.0, 0.035, c.x)) * step(c.y, gK * 1.1) + (1.0 - smoothstep(0.0, 0.05, c2.x)) * smoothstep(0.5, 1.3, gK) * 0.7;
  web = clamp(web, 0.0, 1.0);
  vec3 craze = vec3(0.78, 0.8, 0.8) * (0.6 + 0.4 * c.y);
  gl_FragColor.rgb = mix(gl_FragColor.rgb + vec3(0.05) * gK, craze, web * 0.85);
  gl_FragColor.a = max(gl_FragColor.a, max(web * 0.95, min(0.9, gK * 0.35)));
}`)},t.customProgramCacheKey=()=>`truck-glass-crack`,t}var bi=new M,xi=new n;new i;function Si(e){let t=Math.sin(e*12.9898)*43758.5453;return t-Math.floor(t)}var Ci=class{constructor(e,t){Object.assign(this,{v:e,scene:t.scene,debris:t.debris,fx:t.fx}),this.detail=t.detail??1,this.boomAfter=t.boomT??null,this.level=0,this.zone=Object.fromEntries(gi.map(e=>[e,0])),this.lost=new Set,this.visuals=[],this.smokeT=0,this.burning=0,this.events=[],this.wheels=e.wheelPts.map(()=>({hurt:0,bent:0,lost:!1})),this.levels=[];let n=e.parts[0].body.geometry;n.boundingBox||n.computeBoundingBox(),this.lattice=new Rr(n.boundingBox);let r=this.lattice,i=e.mats||{},a=e=>r.material(e);this.glass=yi(i.glass),this.lamps={head:i.light_lamp?.clone(),bar:i.light_lamp?.clone(),tail:i.light_tail?.clone()},this.broken={head:0,tail:0,bar:0},this.crack=new Ve,e.parts.forEach((t,n)=>{let o={};t.root.traverse(e=>{if(!e.isMesh)return;let t=(e.name.startsWith(`part_`)?e.name:e.parent?.name||``).replace(/^part_/,``),n=Object.keys(hi).find(e=>t===e||t.startsWith(`${e}_`));n&&(e.name.startsWith(`part_`)||e.parent?.name.startsWith(`part_`))&&(o[n]||=[]).push(e)}),t.root.traverse(e=>{if(!e.isMesh||e.material===i.wheel)return;let t=e.material;t===i.glass?t=this.glass:t===i.light_tail?t=this.lamps.tail:t===i.light_lamp&&(t=e.name.includes(`lightbar`)||e.parent?.name.includes(`lightbar`)?this.lamps.bar:this.lamps.head),e.material=a(t),e.customDepthMaterial=r.depthMaterial()});let s={};for(let e of[`door_l`,`door_r`]){let n=wi(o[e]);if(!n)continue;let r=e===`door_l`?1:-1,i=new N(new De(n.max.z-n.min.z,n.max.y-n.min.y),a(Gr.bay));i.rotation.y=r*Math.PI/2,i.position.set(r*(Math.min(Math.abs(n.min.x),Math.abs(n.max.x))-.05),(n.min.y+n.max.y)/2,(n.min.z+n.max.z)/2),i.visible=!1,t.root.add(i),s[e]=i}let c=wi(o.hood)||new fe(new M(-.84,.26,1.02),new M(.84,.37,2.31)),l=di(n===0&&e.parts.length>1,a);l.group.visible=!1;for(let e of l.group.children)e.customDepthMaterial=r.depthMaterial();t.root.add(l.group),s.hood=l.group,this.hoodBox=this.hoodBox||c;let u=Object.fromEntries(Object.entries(o).map(([e,t])=>[e,wi(t)])),d=[t.body,...Object.values(o).flat()].filter(Boolean).map(e=>({mesh:e,own:!1}));this.levels.push({parts:o,fills:s,boxes:u,skins:d,wheels:t.wheels,engine:l})}),this.loose={},this.spinA=0}get totaled(){return this.level>=1}hit(e,t,n,r=!1){if(this.v.ghost||t<1.4)return;let i=this.v.group.quaternion,a=e.clone().applyQuaternion(xi.copy(i).invert()),o=n?this.v.group.worldToLocal(n.clone()):null,s=this.surfacePoint(a,o);this.dent(a,t,s),this.lattice.impact(s,a,r?t*(a.y<-.6?.35:.85):t);let c=2.4;if(t<c)return;let l=Math.min(.6,(t-c)*.024*(r?.55:1));(this.log||=[]).push(`${t.toFixed(1)}${r?`g`:``}${this.kind||``}`),this.level=Math.min(1,this.level+l);let u=Math.abs(a.x),d=a.y,f=Math.abs(a.z),p=d>.6?`top`:f>=u?a.z>0?`front`:`rear`:a.x>0?`left`:`right`;this.zone[p]+=l*2.4;for(let e of gi)e!==p&&(this.zone[e]+=l*.35);r&&p!==`top`&&this.v.up<.3&&(this.zone.top+=l*1.6),!r&&n&&this.hitWheel(o,t),this.events.push({type:`hit`,dv:t});let m=this.fx,h=n||this.v.group.position;m?.sparks(h,e.clone().negate(),m.time,Math.min(40,6+t*2)),m?.chips&&t>5&&m.chips(h,e.clone().negate(),this.v.body.linvel(),m.time,Math.min(24,Math.round((t-4)*1.6))),this.breakGlass(p,t,h,r),this.breakLamps(t,h);for(let[t,n]of Object.entries(hi))this.lost.has(t)||(this.zone[n.zone]>=n.at?this.detach(t,e):_i[t]&&this.zone[n.zone]>=_i[t].loose&&this.detail>.5&&this.loosen(t,(this.zone[n.zone]-_i[t].loose)/(n.at-_i[t].loose)));this.totaled&&!this.totaledAt&&(this.totaledAt=!0,this.events.push({type:`totaled`}),this.blown||(this.burning=Math.max(this.burning,.55)))}surfacePoint(e,t){let n=this.levels[0].skins[0].mesh.geometry;n.boundingBox||n.computeBoundingBox();let r=n.boundingBox,i=r.getCenter(new M),a=r.getSize(new M).multiplyScalar(.5),o=Math.min(a.x/Math.max(Math.abs(e.x),.001),a.y/Math.max(Math.abs(e.y),.001),a.z/Math.max(Math.abs(e.z),.001)),s=i.clone().addScaledVector(e,o*.97);if(t){let n=t.clone().sub(s);n.addScaledVector(e,-n.dot(e)),s.addScaledVector(n.clampLength(0,1.2),.8)}return s}breakGlass(e,t,n,r){let i=this.crack,a=this.glass.userData.u,o=e===`front`?0:e===`rear`?1:e===`left`?2:e===`right`?3:-1,s=Math.max(0,(t-4.5)*.09);if(s){if(o>=0&&i.setComponent(o,i.getComponent(o)+s),e===`top`||r&&this.v.up<.2)for(let e=0;e<4;e++)i.setComponent(e,i.getComponent(e)+s*.6);for(let e=0;e<4;e++)!a.uGone.value.getComponent(e)&&i.getComponent(e)>1.6&&(a.uGone.value.setComponent(e,1),this.shatter(e));a.uCrack.value.copy(i)}}shatterAll(){let e=this.glass.userData.u;for(let t=0;t<4;t++)e.uGone.value.getComponent(t)||(e.uGone.value.setComponent(t,1),this.shatter(t,1.6));this.crack.set(2,2,2,2),e.uCrack.value.copy(this.crack)}shatter(e,t=1){let n=this.fx;if(!n?.glass)return;let r=[[0,.75,.75],[0,.72,-.45],[.9,.72,.25],[-.9,.72,.25]][e],i=this.v.group,a=new M(...r).applyQuaternion(i.quaternion).add(i.position),o=new M(...r).setY(.3).normalize().applyQuaternion(i.quaternion);n.glass(a,o,this.v.body.linvel(),n.time,Math.round((n.lite?22:46)*t),e<2?.7:.45)}breakLamps(e,t){let n=this.broken,r=this.fx,i=(e,t)=>{if(n[e]>=1)return;n[e]=1,this.lampT=.6;let i=this.lamps[e];if(i&&(i.userData.dead=!0),r?.glass){let e=this.v.group;for(let n of[-.62,.62])r.glass(new M(n,.32,t).applyQuaternion(e.quaternion).add(e.position),new M(0,.2,Math.sign(t)).applyQuaternion(e.quaternion),this.v.body.linvel(),r.time,10,.3,+(t>0))}};this.zone.front>.32&&e>6&&i(`head`,2.45),this.zone.rear>.32&&e>6&&i(`tail`,-2.6)}hitWheel(e,t){let n=this.v.wheelPts,r=-1,i=1.6;for(let t=0;t<n.length;t++){let a=Math.hypot(e.x-n[t][0],e.z-n[t][2]);a<i&&(i=a,r=t)}if(r<0||t<6)return;let a=this.wheels[r];a.lost||(a.hurt+=(t-6)*.06*(1.7-i),a.bent=Math.min(.3,a.hurt*.45)*(n[r][0]>0?1:-1),a.hurt>=.85?this.loseWheel(r):a.hurt>.25&&!a.told&&(a.told=!0,this.events.push({type:`part`,name:`wheel`,label:`Wheel bent`})))}loseWheel(e){let t=this.wheels[e];if(t.lost)return;t.lost=!0,(this.log||=[]).push(`W${e}`);let r=this.v.group;r.updateMatrixWorld(!0);let i=!1;for(let t of this.levels){let a=t.wheels[e];if(a){if(!i){i=!0,a.spin.updateMatrixWorld(!0);let t=new b;for(let e of a.spin.children)t.add(e.clone());let o=new M().setFromMatrixPosition(a.spin.matrixWorld),s=new n().setFromRotationMatrix(a.spin.matrixWorld);t.position.copy(o),t.quaternion.copy(s),this.scene.add(t),this.visuals.push(t);let c=this.v.body.linvel(),l=new M(this.v.wheelPts[e][0]>0?1:-1,0,0).applyQuaternion(r.quaternion),u=new M(1,0,0).applyQuaternion(r.quaternion),d=Math.hypot(c.x,c.z)/.5;this.debris.spawn({centre:o,quat:s,half:new M(.18,.48,.48),mass:45,vel:{x:c.x+l.x*3,y:c.y+2,z:c.z+l.z*3},ang:{x:u.x*d,y:u.y*d+2,z:u.z*d},life:20,target:{apply:(e,n)=>{t.position.copy(e),t.quaternion.copy(n)}}})}a.spin.visible=!1}}this.v.loseWheel?.(e),this.events.push({type:`part`,name:`wheel`,label:`Tyre`})}loosen(e,t){let n=_i[e],r=y.clamp(t,.15,1),i=this.loose[e]?.k||0;if(!(r<=i)){if(this.loose[e]={k:r,phase:Math.random()*6},n.buckle)for(let t of this.levels)for(let a of t.parts[e]||[])this.buckle(t,a,n.buckle*(r-i)*this.detail);this.applyPose(e,0),i||this.events.push({type:`loose`,name:e,label:hi[e]?.label||e})}}applyPose(e,t){let n=_i[e],r=this.loose[e];if(!n||!r)return;let i=n.angle*r.k+t;for(let t of this.levels){let r=t.boxes[e];if(!r)continue;let a=new M(...n.pivot(r));xi.setFromAxisAngle(bi.set(...n.axis),i);for(let n of t.parts[e]||[])n.quaternion.copy(xi),n.position.copy(a).sub(a.clone().applyQuaternion(xi))}}ownGeometry(e){if(e.own)return;let t=e.mesh.geometry,n=new I;n.index=t.index;for(let[e,r]of Object.entries(t.attributes))n.setAttribute(e,e===`position`||e===`normal`||e===`dmg`?r.clone():r);n.boundingBox=t.boundingBox,n.boundingSphere=t.boundingSphere,n.groups=t.groups,e.mesh.geometry=n,e.own=!0}buckle(e,t,n){let r=e.skins.find(e=>e.mesh===t);if(!r)return;this.ownGeometry(r);let i=t.geometry,a=i.attributes.position.array;i.computeBoundingBox();let o=i.boundingBox;for(let e=0;e<a.length;e+=3){let t=(a[e+2]-o.min.z)/(o.max.z-o.min.z||1),r=(a[e]-o.min.x)/(o.max.x-o.min.x||1);a[e+1]+=n*Math.sin(t*Math.PI)**2*(.6+.4*Math.sin(r*Math.PI))*(.85+.3*Si(e))}i.attributes.position.needsUpdate=!0}dent(e,t,n){let r=this.detail,a=y.clamp(.3+t*.03,.3,1.1)*(.75+.25*r),o=y.clamp(t*.006,.01,.13)*r,s=r>.7?.45:0,c=new M(Si(t*3.1)-.5,Si(t*5.3)-.5,Si(t*7.7)-.5).normalize().multiplyScalar(26),l=new i;for(let i of this.levels)for(let u of i.skins){let i=u.mesh;if(!i.visible)continue;i.updateMatrix(),l.copy(i.matrix).invert();let d=n.clone().applyMatrix4(l),f=e.clone().transformDirection(l),p=i.geometry;if(p.boundingSphere||p.computeBoundingSphere(),p.boundingSphere.center.distanceTo(d)>p.boundingSphere.radius+a)continue;this.ownGeometry(u);let m=i.geometry.attributes.position,h=i.geometry.attributes.normal,g=i.geometry.attributes.dmg,_=m.array,v=h.array,y=g?.array,b=a*a,x=!1;for(let e=0,n=m.count;e<n;e++){let n=_[e*3]-d.x,i=_[e*3+1]-d.y,l=_[e*3+2]-d.z,u=n*n+i*i+l*l;if(u>b)continue;x=!0;let p=(1-Math.sqrt(u)/a)**2,m=1+s*Math.sin(_[e*3]*c.x+_[e*3+1]*c.y+_[e*3+2]*c.z),h=(.6+.8*Si(e+t))*m;_[e*3]-=f.x*o*p*h,_[e*3+1]-=f.y*o*p*h,_[e*3+2]-=f.z*o*p*h;let g=p*.9*r,S=v[e*3]+(Si(e*3.1+t)-.5)*g-f.x*g*.4,C=v[e*3+1]+(Si(e*5.7+t)-.5)*g,w=v[e*3+2]+(Si(e*7.3+t)-.5)*g-f.z*g*.4,T=Math.hypot(S,C,w)||1;v[e*3]=S/T,v[e*3+1]=C/T,v[e*3+2]=w/T,y&&y[e]<1&&(y[e]=Math.min(1,y[e]+p*Math.min(1,t/9)))}x&&(m.needsUpdate=!0,h.needsUpdate=!0,g&&(g.needsUpdate=!0))}}detach(e,t,n=1){if(this.lost.has(e))return;this.lost.add(e),delete this.loose[e];let r=this.v.group;r.updateMatrixWorld(!0);let i=!1;for(let t of this.levels){let a=t.parts[e]||[];if(!i&&a.length){i=!0;let t=wi(a),o=t.getCenter(new M),s=t.getSize(new M).multiplyScalar(.5),c=new b;for(let e of a){let t=e.clone();e.updateMatrix(),t.geometry=this.lattice.bake(e.geometry,e.matrix),t.material.userData.base&&(t.material=t.material.userData.base),t.material.emissiveIntensity>.5&&(t.material=t.material.clone(),t.material.emissiveIntensity=0,t.material.color.setRGB(.12,.12,.12)),t.customDepthMaterial=void 0,t.position.sub(o),c.add(t)}let l=o.clone().applyMatrix4(r.matrixWorld);c.position.copy(l),c.quaternion.copy(r.quaternion),this.scene.add(c),this.visuals.push(c);let u=this.v.body.linvel(),d=l.clone().sub(r.position).normalize(),f=e===`hood`?10+Math.random()*5*n:1.5+Math.random()*2.5,p={x:u.x*.85+d.x*(2+Math.random()*3)*n,y:u.y*.5+f,z:u.z*.85+d.z*(2+Math.random()*3)*n},m={x:(Math.random()-.5)*12*n,y:(Math.random()-.5)*8,z:(Math.random()-.5)*12*n};this.debris.spawn({centre:l,quat:r.quaternion,half:s,mass:hi[e]?.mass||10,vel:p,ang:m,life:16,target:{apply:(e,t)=>{c.position.copy(e),c.quaternion.copy(t)}}})}for(let e of a)e.visible=!1;t.fills[e]&&(t.fills[e].visible=!0)}this.events.push({type:`part`,name:e,label:hi[e]?.label||e})}blowEngine(){if(this.blown)return;this.blown=!0,this.level=1,this.totaledAt=!0,this.boomT=this.boomAfter??1+Math.random()*.5;let e=this.v.group;e.updateMatrixWorld(!0);let t=this.hoodBox.getCenter(new M).applyMatrix4(e.matrixWorld);this.detach(`hood`,new M(0,1,0),1.8),this.lattice.blast(this.hoodBox.getCenter(new M).setY(0),.55);let n=new M(0,1,0).applyQuaternion(e.quaternion),r=this.v.body.linvel(),i=this.fx;for(let e=0;e<2;e++){let i=pi();i.scale.setScalar(1.5),this.fling(i,t,n,r,new M(.08,.2,.08),3,10+Math.random()*4+e*2,5,2.5)}this.fling(mi(),t,n,r,new M(.1,.04,.29),4,8+Math.random()*3,7,1.5),this.shrapnel(t,n,r,8);for(let e of this.levels)e.engine.group.traverse(t=>{t.isMesh&&t.material.color&&t.material!==e.engine.header&&t.material.color.multiplyScalar(.25)});i?.explode(t,i.time,1.8,new M(r.x,r.y,r.z)),this.burning=1,this.events.push({type:`blown`})}explodeWreck(){if(this.exploded)return;this.exploded=!0;let e=this.v.group,t=this.fx;e.updateMatrixWorld(!0);let n=new M(0,.15,-1.55),r=n.clone().applyMatrix4(e.matrixWorld),i=this.v.body.linvel();t?.explode(r,t.time,2.4,new M(i.x,i.y,i.z)),this.lattice.blast(n,1.1),this.shatterAll();for(let e of[`head`,`tail`,`bar`])this.broken[e]=1,this.lamps[e]&&(this.lamps[e].userData.dead=!0);let a=new M;for(let e of Object.keys(hi))this.lost.has(e)||Math.random()<.75&&this.detach(e,a.set(Math.random()-.5,1,Math.random()-.5),2.2);let o=new M(0,1,0);this.shrapnel(r,o,i,10);let s=this.v.body,c=s.mass(),l=new M(Math.random()<.5?-.5:.5,0,0).applyQuaternion(e.quaternion);s.applyImpulseAtPoint({x:l.x*c,y:c*(5.5+Math.random()*2),z:l.z*c},{x:r.x+l.x,y:r.y,z:r.z+l.z},!0),this.burning=1,this.char(1,1.2),this.events.push({type:`exploded`})}fling(e,t,n,r,i,a,o,s,c){let l=this.fx;e.position.copy(t),this.scene.add(e),this.visuals.push(e);let u=0,d=0;this.debris.spawn({centre:t.clone().addScaledVector(n,.3),quat:this.v.group.quaternion,half:i,mass:a,vel:{x:r.x*.9+n.x*o+(Math.random()-.5)*s,y:r.y+n.y*o,z:r.z*.9+n.z*o+(Math.random()-.5)*s},ang:{x:(Math.random()-.5)*30,y:(Math.random()-.5)*20,z:(Math.random()-.5)*30},life:18,target:{apply:(t,n)=>{if(e.position.copy(t),e.quaternion.copy(n),d+=1/60,l&&c&&d<c&&u++%2==0){l.fire.emit(t,bi.set(0,.3,0),.26+Math.random()*.2,l.time,.3);let e=.06;l.smoke.emit(t,bi.set(0,.4,0),.3,l.time,2.4,e,e,e)}}}})}shrapnel(e,t,n,r){for(let i=0;i<r;i++){let r=.05+Math.random()*.12,a=[Gr.alu,Gr.red,Gr.steel,Gr.black][i%4],o=new N(new A(r*2,r*.5,r*1.4),a);o.castShadow=!0,this.fling(o,e,t,n,new M(r,r*.25,r*.7),1,6+Math.random()*8,12,i<3?1.2:0)}}update(e,t,n=0){let r=this.v.group;if(this.lattice.setFrame(r.position,r.quaternion),this.lattice.update(e),this.detail>=.95){let e=t*9;for(let[t,r]of Object.entries(this.loose)){let i=_i[t];this.applyPose(t,Math.sin(e+r.phase)*i.flap*r.k*Math.min(1,n)+Math.sin(e*2.3+r.phase)*i.flap*.3*Math.min(1,n))}}this.engineTick(e,t),this.lampTick(e,t),this.totaled&&!this.exploded&&(this.boomT??=this.boomAfter??.9+Math.random()*1.1,this.boomT-=e,this.boomT<=0&&this.explodeWreck());let i=this.fx;if(!i)return;for(let e=0;e<this.wheels.length;e++){if(!this.wheels[e].lost||this.v.speed()<4||!this.v.vc.wheelIsInContact(e)||Math.random()>.6)continue;let n=this.v.vc.wheelContactPoint(e);n&&i.sparks(new M(n.x,n.y+.05,n.z),new M(0,.5,0),t,2)}if(this.scrape(t),this.burning&&this.char(e),this.level<.3&&!this.burning||(this.smokeT-=e,this.smokeT>0))return;let a=this.totaled||this.burning;this.smokeT=a?.025:.16-this.level*.1;let o=this.v.body.linvel(),s=this.hoodBox.getCenter(bi).setY(this.hoodBox.max.y+.05);r.updateMatrix(),s.applyMatrix4(r.matrix);let c=new M(o.x*.75+(Math.random()-.5),1.2+Math.random(),o.z*.75+(Math.random()-.5));if(!a&&this.zone.front>.25&&this.level<.6){let e=.78+Math.random()*.1;i.smoke.emit(s,c.multiplyScalar(1.2),.35,t,1.6,e,e,e*1.02);return}let l=a?.045:this.level>.75?.12:.42;if(i.smoke.emit(s,c,a?1:.5,t,a?5:2.6,l,l*.97,l*.95),this.burning){this.v.speed()<.5&&(this.burning=Math.max(.3,this.burning-e*.5));for(let e=0;e<2;e++){let e=s.clone().add(new M((Math.random()-.5)*1.1,-.2,(Math.random()-.5)*1.1));i.flame.emit(e,new M(o.x*.97+(Math.random()-.5)*.6,1+Math.random()*1.4,o.z*.97+(Math.random()-.5)*.6),(.45+Math.random()*.7)*this.burning,t,.3+Math.random()*.4)}if(this.exploded&&Math.random()<.6){let e=new M((Math.random()-.5)*1.4,.3,-2+Math.random()*2.6).applyMatrix4(r.matrix);i.flame.emit(e,new M(o.x*.97,1.2+Math.random()*1.6,o.z*.97),.6+Math.random()*.8,t,.35+Math.random()*.4),Math.random()<.3&&i.smoke.emit(e,new M(o.x*.7,1.6,o.z*.7),1.1,t,5,.04,.04,.04)}Math.random()<.5&&i.fire.emit(s.clone().add(new M(0,.2,0)),new M(o.x*.9,1.4+Math.random(),o.z*.9),.6*this.burning,t,.7+Math.random()*.4),i.light(s,this.burning)}}engineTick(e,t){let n=this.lost.has(`hood`)||(this.loose.hood?.k||0)>.2,r=this.blown?0:this.v.rpm||900;this.spinA+=r/60*Math.PI*2*e;let i=this.blown||this.exploded?1.6*Math.max(.4,this.burning):this.burning?.9:y.smoothstep(r,5200,7200)*.55;for(let e of this.levels){let a=e.engine;if(a.group.visible=n,!n)continue;for(let e of a.spin)e.o.rotation.z=this.spinA*e.k;let o=this.blown?0:.0016+r/7e3*.001;a.group.position.set(a.rest.x+Math.sin(t*r*.21)*o,a.rest.y+Math.sin(t*r*.13+1)*o*.7,a.rest.z),a.group.rotation.z=Math.sin(t*9+r*3e-4)*o*2,a.header.emissiveIntensity=i*(.85+.15*Math.sin(t*13))}}lampTick(e,t){if(this.lampT>-1){this.lampT-=e;for(let e of[`head`,`tail`,`bar`]){let t=this.lamps[e];if(!t||!(t.userData.dead||e===`bar`&&this.lost.has(`lightbar`)))continue;let n=e===`tail`?1.6:2.5,r=this.lattice.mats.get(t)||t;r.emissiveIntensity=this.lampT>0?n*(Math.random()<.45?.15:.9):0,this.lampT<=0&&r.color.setRGB(.08,.08,.08)}this.lampT<=0&&(this.lampT=-2)}}scrape(e){let t=this.fx,n=this.v;if(!t.ground||n.up>.55||n.speed()<3.5)return;let r=n.group,i=n.body.linvel(),a=vi;for(let n=0;n<a.length;n++){if(Math.random()>.5)continue;let o=bi.set(a[n][0],a[n][1],a[n][2]).applyQuaternion(r.quaternion).add(r.position),s=t.ground(o.x,o.z);if(o.y-s>.28)continue;let c=new M(o.x,s+.05,o.z);if(t.sparks(c,new M(-i.x,0,-i.z).normalize().multiplyScalar(.6).add(new M(0,.4,0)),e,3),Math.random()<.1){let n=.32;t.smoke.emit(c,new M(-i.x*.1,.6,-i.z*.1),.4,e,1.6,n,n*.95,n*.9)}}}char(e,t=0){if(this.charT=(this.charT||0)+e,this.charT<.25&&!t)return;this.charT=0;let n=this.hoodBox.getCenter(new M),r=this.exploded?3.6:2.2;this.exploded&&(n.z=.2);let i=t||.04*this.burning;for(let e of this.levels){let t=e.skins[0];this.ownGeometry(t);let a=t.mesh.geometry,o=a.attributes.position.array,s=a.attributes.dmg?.array;if(s){for(let e=0,t=s.length;e<t;e++){let t=Math.hypot(o[e*3]-n.x,(o[e*3+1]-n.y)*1.5,(o[e*3+2]-n.z)*(this.exploded?.75:1));t<r&&(s[e]=Math.min(2,Math.max(s[e],1)+(1-t/r)*i*(.6+.8*Si(e))))}a.attributes.dmg.needsUpdate=!0}}}dispose(){for(let e of this.visuals)this.scene.remove(e);this.visuals=[]}};function wi(e){if(!e?.length)return null;let t=new fe;for(let n of e)n.geometry.computeBoundingBox(),t.union(n.geometry.boundingBox);return t}var Ti=[`wheel_FL`,`wheel_FR`,`wheel_RL`,`wheel_RR`],Ei=new M,Di=new M,Oi=new M,ki=new M,Ai=new M(0,1,0),ji=new M,Mi=new n,Ni={mass:1650,half:{x:.98,y:.38,z:2.45},comY:-.35,wheelX:1.02,wheelY:-.08,wheelZf:1.62,wheelZr:-1.55,radius:.5,rest:.72,travel:.54,bump:.14,stiffness:13,compression:1.9,relaxation:2.7,maxForce:6e4,bumpRate:1500,bumpDamp:6,arbF:9,arbR:6,friction:2.6,side:1.1,engine:6600,boost:4300,brake:260,reverse:2600,steerMax:.5,topSpeed:55,gears:[3.2,2.1,1.5,1.15,.92,.76],final:7,idle:950,redline:7e3,upshift:6500,downshift:2900,shiftTime:.16,drag:.5,looseGrip:.82,hub:{radius:.2,spring:.35,bend:.12,grip:.45,side:.3,drag:110,plough:140,ploughMax:.2},rollAssist:6e3,rollFree:.3};function Pi(e=Ni){let t=(t,n,r)=>({pos:[t,e.wheelY,n],steer:r,drive:r?.4:.6,brake:r?.6:.4,hand:!r,axle:+!r,arb:r?e.arbF:e.arbR});return[t(e.wheelX,e.wheelZf,!0),t(-e.wheelX,e.wheelZf,!0),t(e.wheelX,e.wheelZr,!1),t(-e.wheelX,e.wheelZr,!1)]}var Fi=e=>y.clamp(1-((e-4800)/5200)**2*1.4,.55,1),Ii=131071,Li=131083,Ri=-65535,zi=[{name:`Ashfire Orange`,hue:0,sat:1,val:1},{name:`Cobalt Blue`,hue:3.55,sat:1,val:.9},{name:`Moss Green`,hue:2,sat:.75,val:.75},{name:`Sulphur Yellow`,hue:.55,sat:1,val:1.25},{name:`Ghost White`,hue:0,sat:0,val:2.6},{name:`Gunmetal`,hue:0,sat:.05,val:.5},{name:`Crimson`,hue:-.18,sat:1.15,val:.8},{name:`Violet`,hue:4.6,sat:.8,val:.8}];async function Bi(e){await kt.init();let t=new kt.World({x:0,y:-9.81,z:0});t.timestep=1/60;let n=e.grid,r=new Float32Array(n*n);for(let t=0;t<n;t++)for(let i=0;i<n;i++)r[t+i*n]=e.heights[t*n+i];let i=t.createRigidBody(kt.RigidBodyDesc.fixed());return t.createCollider(kt.ColliderDesc.heightfield(n-1,n-1,r,{x:e.extent,y:1,z:e.extent}).setFriction(.9).setCollisionGroups(Ii),i),t}function Vi(e,t){let r=e.createRigidBody(kt.RigidBodyDesc.fixed());for(let i of t){let t=new n().setFromAxisAngle(new M(0,1,0),i.yaw);e.createCollider(kt.ColliderDesc.cuboid(i.w/2,i.h/2,i.d/2).setTranslation(i.x,i.y+i.h/2,i.z).setRotation({x:t.x,y:t.y,z:t.z,w:t.w}).setFriction(.3).setCollisionGroups(Ii),r)}}async function Hi(e){let t=new jt,[n,r]=await Promise.all([t.loadAsync(`./models/truck.glb`),t.loadAsync(`./models/truck_lod.glb`)]),i=await Ui(e);for(let e of[n.scene,r.scene])e.traverse(e=>{if(!e.isMesh)return;e.castShadow=!0,e.receiveShadow=!0,(e.name===`body`||e.name.startsWith(`part_`))&&e.geometry.setAttribute(`dmg`,new Le(new Float32Array(e.geometry.attributes.position.count),1));let t=(e.material?.name||``).replace(/\.\d+$/,``);i[t]&&(e.material=i[t])});return{full:n.scene,lod:r.scene,mats:i}}async function Ui(e){let t=new _e,n=e.capabilities.getMaxAnisotropy(),r=Object.fromEntries(await Promise.all([`body_col.jpg`,`body_orm.jpg`,`body_nrm.png`,`body_coat.jpg`,`wheel_col.jpg`,`wheel_orm.jpg`,`wheel_nrm.png`].map(async e=>[e,await t.loadAsync(`./models/truck/${e}`)]))),i=(e,t)=>{let i=r[e];return i.flipY=!1,i.anisotropy=n,t&&(i.colorSpace=k),i.needsUpdate=!0,i},a=i(`body_orm.jpg`),o=new d({map:i(`body_col.jpg`,!0),normalMap:i(`body_nrm.png`),aoMap:a,roughnessMap:a,metalnessMap:a,roughness:1,metalness:1,aoMapIntensity:1,clearcoat:.7,clearcoatMap:i(`body_coat.jpg`),clearcoatRoughness:.18,envMapIntensity:1.1}),s=i(`wheel_orm.jpg`);return{body:o,wheel:new h({map:i(`wheel_col.jpg`,!0),normalMap:i(`wheel_nrm.png`),aoMap:s,roughnessMap:s,metalnessMap:s,roughness:1,metalness:1}),glass:new d({color:789774,roughness:.06,metalness:0,transparent:!0,opacity:.62,envMapIntensity:1.6,clearcoat:1,clearcoatRoughness:.05}),light_lamp:new h({color:16777215,emissive:16773597,emissiveIntensity:2.5}),light_tail:new h({color:5570560,emissive:16717320,emissiveIntensity:1.6}),light_lens:new d({color:16777215,roughness:.05,transparent:!0,opacity:.25})}}var Wi=new Map;function Gi(e,t){let n=t.name;if(Wi.has(n))return Wi.get(n);let r=e.clone();return r.onBeforeCompile=e=>{e.uniforms.uPaint={value:new M(t.hue,t.sat,t.val)},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute float dmg;
varying float vDmg;
varying vec3 vLocal;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vDmg = dmg;
vLocal = position;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
uniform vec3 uPaint;
varying float vDmg;
varying vec3 vLocal;
float dHash(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
float scrape = smoothstep(0.15, 0.9, vDmg * (0.55 + 0.9 * dHash(vLocal * vec3(90.0, 14.0, 90.0))));
roughnessFactor = mix(roughnessFactor, 0.42, scrape);
roughnessFactor = mix(roughnessFactor, 0.95, smoothstep(1.0, 1.6, vDmg));`).replace(`#include <metalnessmap_fragment>`,`#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.9, smoothstep(0.15, 0.9, vDmg * (0.55 + 0.9 * dHash(vLocal * vec3(90.0, 14.0, 90.0)))));`).replace(`#include <map_fragment>`,`#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 1e-4);
  float w = smoothstep(0.5, 0.78, sat) * smoothstep(0.01, 0.04, mx);
  vec3 k = vec3(0.57735);
  float cs = cos(uPaint.x), sn = sin(uPaint.x);
  vec3 r = c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
  float lum = dot(r, vec3(0.2126, 0.7152, 0.0722));
  r = mix(vec3(lum), r, uPaint.y) * uPaint.z;
  diffuseColor.rgb = mix(c, r, w);
  float sc = smoothstep(0.15, 0.9, vDmg * (0.55 + 0.9 * dHash(vLocal * vec3(90.0, 14.0, 90.0))));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.35, 0.33) * (0.7 + 0.5 * dHash(vLocal * 260.0)), sc);
  diffuseColor.rgb *= 1.0 - smoothstep(0.5, 1.0, vDmg) * 0.35;
  // values above 1 are fire scorching: blistered, blackened paint
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.026) * (0.6 + 0.8 * dHash(vLocal * 140.0)), smoothstep(1.0, 1.8, vDmg) * 0.92);
}`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_physical_fragment>`,`#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= 1.0 - smoothstep(0.1, 0.6, vDmg);
#endif`)},r.customProgramCacheKey=()=>`paint-${n}`,Wi.set(n,r),r}function Ki(e,t,n){let r=e.clone(!0),i=Gi(n.body,t),a=null;return r.traverse(e=>{e.isMesh&&e.material===n.body&&(e.material=i),e.isMesh&&e.name===`body`&&(a=e)}),{root:r,wheels:Ti.map(e=>{let t=r.getObjectByName(e);if(!t)return null;let n=new b;n.position.copy(t.position),t.position.set(0,0,0);let i=new b;return i.add(t),n.add(i),r.add(n),{pivot:n,spin:i}}),body:a}}var qi=null,Ji=new h({color:4867908,metalness:.9,roughness:.45});function Yi(e){qi||=[new r(Ni.hub.radius,Ni.hub.radius,.04,28),new r(.11,.13,.16,16).translate(0,.08,0)];let t=new b;for(let e of qi){let n=new N(e,Ji);n.castShadow=!0,t.add(n)}return t.rotation.z=e>0?-Math.PI/2:Math.PI/2,t}var Xi=class{constructor({phys:e,scene:t,assets:n,paint:r=zi[0],lodOnly:i=!1,name:a=``,number:o=0,isPlayer:s=!1,crash:c=null}){Object.assign(this,{phys:e,scene:t,name:a,number:o,isPlayer:s,paint:r}),this.mats=n.mats,this.input={throttle:0,brake:0,steer:0,hand:0,boost:0},this.boost=1,this.power=1,this.gear=1,this.rpm=Ni.idle,this.shiftT=0,this.surface=0,this.group=new b,this.lod=new de;let l=[];if(!i){let e=Ki(n.full,r,n.mats);this.lod.addLevel(e.root,0),l.push(e)}let u=Ki(n.lod,r,n.mats);this.lod.addLevel(u.root,i?0:28),l.push(u),this.parts=l,this.group.add(this.lod),t.add(this.group),this.createBody(),this.damage=c?new Ci(this,c):null,this.skids=c?.skids||null}get totaled(){return!!this.damage?.totaled}createBody(){let e=Ni,t=kt.RigidBodyDesc.dynamic().setCanSleep(!1).setLinearDamping(.05).setAngularDamping(.6);this.body=this.phys.createRigidBody(t);let n=e=>e.setActiveEvents(kt.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(7e4);this.colliders=[this.phys.createCollider(n(kt.ColliderDesc.cuboid(e.half.x,e.half.y,e.half.z).setTranslation(0,.25,0).setMass(e.mass).setFriction(.4).setRestitution(.05).setCollisionGroups(Li)),this.body),this.phys.createCollider(n(kt.ColliderDesc.cuboid(.8,.35,.9).setTranslation(0,.9,-.1).setMass(120).setCollisionGroups(Li)),this.body)],this.body.setAdditionalMassProperties(400,{x:0,y:e.comY,z:.1},{x:900,y:1e3,z:400},{w:1,x:0,y:0,z:0},!0);let r=this.phys.createVehicleController(this.body);r.indexUpAxis=1,r.setIndexForwardAxis=2,this.layout=Pi(e),this.layout.forEach((t,n)=>{let i=t.pos;r.addWheel({x:i[0],y:i[1],z:i[2]},{x:0,y:-1,z:0},{x:-1,y:0,z:0},e.rest,e.radius),r.setWheelSuspensionStiffness(n,e.stiffness),r.setWheelMaxSuspensionTravel(n,e.travel),r.setWheelSuspensionCompression(n,e.compression),r.setWheelSuspensionRelaxation(n,e.relaxation),r.setWheelMaxSuspensionForce(n,e.maxForce),r.setWheelFrictionSlip(n,e.friction),r.setWheelSideFrictionStiffness(n,e.side),t.mate=this.layout.findIndex((e,r)=>r!==n&&e.axle===t.axle)}),this.vc=r,this.wheelPts=this.layout.map(e=>e.pos),this.nWheels=this.layout.length,this.lostWheels=new Set,this.squash=new Float32Array(this.nWheels).fill(e.rest)}place(e,t,r,i){this.body.setTranslation({x:e,y:t,z:r},!0);let a=new n().setFromAxisAngle(new M(0,1,0),i);this.body.setRotation({x:a.x,y:a.y,z:a.z,w:a.w},!0),this.body.setLinvel({x:0,y:0,z:0},!0),this.body.setAngvel({x:0,y:0,z:0},!0),this.input.steer=0,this.sync(0,0)}speed(){let e=this.body.linvel();return Math.hypot(e.x,e.y,e.z)}step(e,t=!1){let r=Ni,i=this.input,a=this.vc,o=a.currentVehicleSpeed(),s=this.body.linvel(),c=Math.hypot(s.x,s.y,s.z),l=this.damage?this.damage.wheels.reduce((e,t,n)=>e+(n<2?t.bent*.35:t.bent*.15),0):0,u=(i.steer*r.steerMax+l*.25)*(1-Math.min(c/70,.6));this.steerWheels(u);let d=0,f=0,p=this.totaled,m=1-(this.damage?.level||0),h=this.power*(.55+.45*m);i.boost||(this.boostLatch=!1);let g=this.boostLatch||this.boost>.06,_=!!i.boost&&g&&this.boost>0&&i.throttle>0&&!t&&!p;this.boostLatch=_,this.boosting=_,this.redline=_&&this.boost<.1,i.throttle>0&&!p&&(d=r.engine*h*i.throttle*(1-Math.min(Math.max(o,0)/(r.topSpeed*(.7+.3*m)*this.power*(_?1.25:1)),1)**2));let v=this.gear,y=r.gears[v-1]*r.final,b=Math.abs(o)/r.radius*60/(2*Math.PI),x=this.contacts===0,S=x?r.idle+(r.redline-r.idle)*i.throttle:Math.max(r.idle,b*y);this.rpm+=(Math.min(r.redline+200,S)-this.rpm)*Math.min(1,e*(x?6:25)),this.shiftT=Math.max(0,this.shiftT-e),!x&&o>.5&&(this.rpm>r.upshift&&v<r.gears.length&&i.throttle>0?(this.gear++,this.shiftT=r.shiftTime):this.rpm<r.downshift&&v>1&&(this.gear--,this.shiftT=r.shiftTime*.4)),o<2&&v>1&&!x&&(this.gear=1);let C=.85+.45*(r.gears[v-1]-r.gears[r.gears.length-1])/(r.gears[0]-r.gears[r.gears.length-1]);if(d*=Fi(this.rpm)*C*(this.shiftT>0?.15:1),this.rpm>r.redline&&!_&&(d*=.3),_){d+=r.boost*(.6+.4*m);let t=this.boost;this.boost=Math.max(0,this.boost-e*.22),t>0&&this.boost===0&&(this.boostLatch=!1,this.damage&&(this.forceBlow||Math.random()<.2)&&this.damage.blowEngine())}else this.boost=Math.min(1,this.boost+e*.05);i.brake>0&&(o>1?f=r.brake*i.brake:d=-r.reverse*i.brake),t&&(d=0,f=60),p&&i.brake>0&&(d=0,f=r.brake*i.brake);let w=this.layout,T=this.lostWheels,E=r.hub,D=0,O=0;for(let e=0;e<this.nWheels;e++)D+=w[e].drive,T.has(e)||(O+=w[e].drive);for(let e=0;e<this.nWheels;e++){let t=T.has(e);a.setWheelEngineForce(e,t||!O?0:d*w[e].drive*D/O),a.setWheelBrake(e,t?E.drag:f*w[e].brake+(w[e].hand?i.hand*40:0)),t||a.setWheelSideFrictionStiffness(e,w[e].hand&&i.hand?.45:r.side)}let ee=this.surface;if(!t&&(p?!(i.brake>0):!i.throttle&&!i.brake)){let e=p?7:3+5*(this.rpm/r.redline)*(r.gears[this.gear-1]/1.5);for(let t=0;t<this.nWheels;t++)T.has(t)||a.setWheelBrake(t,e+ee*4)}let k=this.weatherGrip??1;for(let e=0;e<this.nWheels;e++)T.has(e)||a.setWheelFrictionSlip(e,r.friction*k*(1-(1-r.looseGrip)*ee)*(this.surfGrip??1));if(a.updateVehicle(e,void 0,Ri),this.suspensionExtras(e),c>1){let t=-r.drag*c*e;this.body.applyImpulse({x:s.x*t,y:s.y*t*.3,z:s.z*t},!0)}let te=this.body.rotation(),ne=new n(te.x,te.y,te.z,te.w),re=new M(0,1,0).applyQuaternion(ne),A=0;for(let e=0;e<this.nWheels;e++)A+=+!!a.wheelIsInContact(e);if(this.contacts=A,this.up=re.y,A===0){let t=new M(1,0,0).applyQuaternion(ne),n=new M().crossVectors(re,new M(0,1,0)).multiplyScalar(1600);n.addScaledVector(t,(i.throttle-i.brake)*900),n.y+=i.steer*900,this.body.applyTorqueImpulse({x:n.x*e,y:n.y*e,z:n.z*e},!0)}else{if(this.body.applyImpulse({x:0,y:-c*c*.9*e,z:0},!0),ee>0&&c>1){let t=-ee*1500*e/c;this.body.applyImpulse({x:s.x*t,y:0,z:s.z*t},!0)}if(this.surfDrag&&c>1){let t=-this.surfDrag*e/c;this.body.applyImpulse({x:s.x*t,y:0,z:s.z*t},!0)}let t=new M(1,0,0).applyQuaternion(ne).y,n=Math.sign(t)*Math.max(0,Math.abs(t)-r.rollFree),i=new M(0,0,1).applyQuaternion(ne),a=n*r.rollAssist*e;this.body.applyTorqueImpulse({x:i.x*a,y:i.y*a,z:i.z*a},!0)}}steerWheels(e){let t=this.layout,n=this.vc,r=Math.abs(Ni.wheelZf-Ni.wheelZr),i=Math.tan(e);for(let a=0;a<this.nWheels;a++){if(!t[a].steer)continue;let o=t[a].pos[0];n.setWheelSteering(a,Math.abs(i)<1e-4?e:Math.atan(r/(r/i-o)))}}suspensionExtras(e){let t=Ni,n=this.vc,r=this.layout,i=this.body.mass(),a=this.body.rotation(),o=ji.set(0,1,0).applyQuaternion(Mi.set(a.x,a.y,a.z,a.w)),s=t.rest-t.travel,c=s+t.bump,l=this.squash,u=this.body.translation(),d=this.body.linvel(),f=this.body.angvel();for(let r=0;r<this.nWheels;r++){if(!n.wheelIsInContact(r)){l[r]=t.rest;continue}let a=n.wheelHardPoint(r),p=n.wheelContactPoint(r);if(l[r]=(a.x-p.x)*o.x+(a.y-p.y)*o.y+(a.z-p.z)*o.z-n.wheelRadius(r),l[r]>=c)continue;let m=Math.min(c-l[r],t.bump);Di.set(a.x-u.x,a.y-u.y,a.z-u.z);let h=Oi.set(f.x,f.y,f.z).cross(Di).add(ki.set(d.x,d.y,d.z)).dot(o),g=Math.max(0,s-l[r]),_=i*e*(h<0?t.bumpRate*m*m+t.bumpDamp*-h*Math.min(1,m/t.bump)+g*(400+60*-h):.15*t.bumpRate*m*m);h<0&&(_=Math.min(_,i/this.nWheels*-h+i*e*.15*t.bumpRate*m*m)),this.push(r,o,Math.min(_,t.maxForce*2*e))}for(let r of this.lostWheels){if(!n.wheelIsInContact(r))continue;let a=n.wheelContactPoint(r);Di.set(a.x-u.x,a.y-u.y,a.z-u.z),Oi.set(f.x,f.y,f.z).cross(Di).add(ki.set(d.x,d.y,d.z)).projectOnPlane(o);let s=Oi.length();if(s<.3)continue;let c=-Math.min(t.hub.plough*s,t.hub.ploughMax*i*9.81)*e/s;this.body.applyImpulseAtPoint({x:Oi.x*c,y:Oi.y*c,z:Oi.z*c},a,!0)}for(let t=0;t<this.nWheels;t++){let a=r[t].mate;if(a<t||!r[t].arb||this.lostWheels.has(t)||this.lostWheels.has(a)||!n.wheelIsInContact(t)||!n.wheelIsInContact(a))continue;let s=r[t].arb*i*(l[a]-l[t])*e;this.push(t,o,s),this.push(a,o,-s)}}push(e,t,n){let r=this.vc.wheelHardPoint(e);this.body.applyImpulseAtPoint({x:t.x*n,y:t.y*n,z:t.z*n},r,!0)}loseWheel(e){let t=Ni.hub,n=this.vc;if(!this.lostWheels.has(e)){n.setWheelRadius(e,t.radius),n.setWheelSuspensionStiffness(e,Ni.stiffness*t.spring),n.setWheelSuspensionRestLength(e,Ni.rest-t.bend),n.setWheelFrictionSlip(e,t.grip),n.setWheelSideFrictionStiffness(e,t.side),this.lostWheels.add(e);for(let t of this.parts){let n=t.wheels[e];n&&!n.hub&&(n.hub=new b,n.hub.add(Yi(this.layout[e].pos[0])),n.pivot.add(n.hub))}}}sync(e,t,n,r=1){let i=this.body.translation(),a=this.body.rotation();this.group.position.set(i.x,i.y,i.z),this.group.quaternion.set(a.x,a.y,a.z,a.w);let o=this.vc,s=this.body.linvel(),c=Math.hypot(s.x,s.z);for(let i=0;i<this.nWheels;i++){let a=o.wheelSuspensionLength(i)??Ni.rest,l=o.wheelSteering(i)??0,u=o.wheelRotation(i)??0;for(let e of this.parts){let t=e.wheels[i];t&&(t.pivot.position.set(this.wheelPts[i][0],this.wheelPts[i][1]-a,this.wheelPts[i][2]),t.pivot.rotation.y=l,t.pivot.rotation.z=this.damage?.wheels[i].bent||0,t.spin.rotation.x=u,t.hub&&(t.hub.rotation.x=u))}if(n&&!this.lostWheels.has(i)&&o.wheelIsInContact(i)&&c>4&&Math.random()<(.5+c/60)*r){let e=o.wheelContactPoint(i),r=Math.abs(o.wheelSideImpulse(i)??0),a=new M(-s.x*.12+(Math.random()-.5)*2,.8+Math.random()*1.2,-s.z*.12+(Math.random()-.5)*2);n.emit(new M(e.x,e.y+.2,e.z),a,.6+c*.035+r*.002,t)}this.skids&&e>0&&this.skidMark(i)}}skidMark(e){let t=this.vc,n=`${this.number}-${e}`;if(this.lostWheels.has(e)||!t.wheelIsInContact(e)){this.skids.add(n,null,null,0);return}let r=t.wheelContactPoint(e),i=Ei.set(r.x,r.y,r.z),a=this.body.translation(),o=this.body.linvel(),s=this.body.angvel();Di.set(i.x-a.x,i.y-a.y,i.z-a.z),Oi.set(s.x,s.y,s.z).cross(Di).add(ki.set(o.x,o.y,o.z));let c=this.group.quaternion;ki.set(1,0,0).applyAxisAngle(Ai,t.wheelSteering(e)??0).applyQuaternion(c);let l=Math.abs(Oi.dot(ki)),u=Math.hypot(o.x,o.z),d=this.input,f=y.smoothstep(l,2.2,7);e>=2&&d.throttle>.8&&this.gear===1&&u<13&&u>.5&&!this.totaled&&(f=Math.max(f,.55*(1-u/13))),d.brake>.6&&u>6&&(f=Math.max(f,.35)),e>=2&&d.hand&&u>4&&(f=Math.max(f,.6)),this.skids.add(n,i,ki,f,this.surface>.5)}dispose(){this.damage?.dispose(),this.phys.removeVehicleController(this.vc),this.phys.removeRigidBody(this.body),this.scene.remove(this.group)}},Zi=class{constructor(e,t){Object.assign(this,e),this.world=t,this.c=e.centre,this.n=this.c.length,this.line=e.start+20,this.finishRel=this.closed?this.n:this.n-(e.runout??40)-this.line,this.jumps=[];let n=e.jump??e.loopJump;if(n!=null){let e=n;for(let t=0;t<40&&!this.at(e)[4];t++)e=this.wrap(e+1);for(this.at(e)[4]||(e=n);this.at(e)[4];)e=this.wrap(e+1);this.jumps.push({at:n,speed:38,flat:60,land:this.wrap(e+20)})}e.lip!=null&&this.jumps.push({at:e.lip,speed:0,flat:0,land:(e.leap?.td??e.land+13)+12,guard:45,crater:!0}),this.sharedRows=e.shared||[];let r=[];for(let e=0;e<this.n;e++){let t=this.at(e-2),n=this.at(e+2);r.push(Math.atan2(n[0]-t[0],n[2]-t[2]))}let i=new Float32Array(this.n);for(let e=0;e<this.n;e++){let t=r[this.wrap(e+1)]-r[e];t=Math.atan2(Math.sin(t),Math.cos(t)),i[e]=t}this.curv=new Float32Array(this.n);for(let e=0;e<this.n;e++){let t=0;for(let n=-6;n<=6;n++)t+=i[this.wrap(e+n)];this.curv[e]=t/13}}isShared(e){return this.sharedRows.some(([t,n])=>e>=t&&e<n)}ahead(e,t){return this.closed?this.wrap(t-e):t-e}wrap(e){return this.closed?(e%this.n+this.n)%this.n:Math.min(Math.max(e,0),this.n-1)}at(e){return this.c[this.wrap(e)]}frame(e,t={}){let n=this.at(e),r=this.at(e+2),i=this.at(e-2),a=r[0]-i[0],o=r[2]-i[2],s=Math.hypot(a,o)||1;return t.x=n[0],t.y=n[1],t.z=n[2],t.tx=a/s,t.tz=o/s,t.nx=-o/s,t.nz=a/s,t.yaw=Math.atan2(a/s,o/s),t}nearest(e,t){let n=t??0,r=1/0,i=t==null,a=i?0:-60,o=i?this.n-1:60;for(let s=a;s<=o;s++){let a=i?s:this.wrap(t+s),o=this.c[a],c=(o[0]-e.x)**2+(o[2]-e.z)**2;c<r&&(r=c,n=a)}return{i:n,d:Math.sqrt(r)}}rel(e){if(!this.closed)return e-this.line;let t=e-this.line;return t<-this.n/2&&(t+=this.n),t>this.n/2&&(t-=this.n),t}gridSlot(e){let t=Math.floor(e/2),n=e%2,r=this.line-10-t*9,i=this.frame(r),a=(n?1:-1)*this.width*.22+(t%2?.6:-.6);return{i:this.wrap(r),x:i.x+i.nx*a,z:i.z+i.nz*a,yaw:i.yaw}}turnAhead(e,t,n){let r=0,i=0;for(let a=t;a<n;a+=2)i+=this.curv[this.wrap(e+a)]*2,r=Math.max(r,Math.abs(this.curv[this.wrap(e+a)])/Math.max(1,a*.02));return{peak:r,total:Math.abs(i)}}},Qi=new M,$i=new M,ea=new n,ta={easy:{grip:7.5,pace:.86,band:.1,mistakes:.5,lava:.66,slack:150,grace:13},normal:{grip:9,pace:.95,band:.07,mistakes:.25,lava:.83,slack:105,grace:9},hard:{grip:10.5,pace:1.02,band:.04,mistakes:.08,lava:.95,slack:70,grace:6}},na=class{constructor(e,t,n,r){Object.assign(this,{v:e,track:t,diff:n}),this.rnd=r,this.skill=n.pace*(.96+this.rnd()*.08),this.lanePref=(this.rnd()-.5)*t.width*.35,this.lane=this.lanePref,this.phase=this.rnd()*10,this.stuck=0,this.reverse=0,this.boostTaste=.3+this.rnd()*.6}update(e,t,n,r){let i=this.v,a=this.track,o=i.input,s=i.body.translation(),c=i.body.rotation();ea.set(c.x,c.y,c.z,c.w),Qi.set(0,0,1).applyQuaternion(ea);let l=i.speed(),u=t.i;this.phase+=e*.15;let d=this.lanePref+Math.sin(this.phase)*a.width*.12;for(let e of n){if(e===i)continue;let t=e.body.translation(),n=t.x-s.x,r=t.z-s.z,o=n*Qi.x+r*Qi.z;if(o<0||o>16)continue;let c=n*Qi.z-r*Qi.x;Math.abs(c)<2.6&&(d+=(c>0?-1:1)*a.width*.3)}let f=a.turnAhead(u,0,40);d*=1-Math.min(1,f.total/.9)*.7;let p=!1;for(let e of a.obstacles||[]){let t=e.i-u;if(t<3||t>80)continue;let n=e.r+2.5;Math.abs(d-e.lat)<n&&(d=e.lat+(e.lat>0?-n:n),p=!0)}let m=a.width*.36;d=Math.max(-m,Math.min(m,d));for(let e of a.jumps){let n=a.ahead(t.i,e.at);n>=0&&n<200&&(d=0)}this.lane+=(d-this.lane)*Math.min(1,e*(p?3:1.2));let h=Math.round(7+l*.5),g=a.frame(u+h);$i.set(g.x+g.nx*this.lane-s.x,0,g.z+g.nz*this.lane-s.z).normalize();let _=Qi.x*$i.z-Qi.z*$i.x,v=Qi.x*$i.x+Qi.z*$i.z,b=y.clamp(-Math.atan2(_,v)*2.4,-1,1),x=i.weatherGrip??1,S=this.diff.grip*this.skill*x,C=(a.at(a.wrap(u+40))[1]-a.at(u)[1])/40,w=y.clamp(6+9.81*C,2.5,8)*(.4+.6*x),T=Math.min(220,30+l*l/(2*w)),E=60;for(let e=6;e<T;e+=3){let t=Math.abs(a.curv[a.wrap(u+e)]),n=Math.sqrt(S/Math.max(t,1e-4));E=Math.min(E,Math.sqrt(n*n+2*w*e))}E*=this.skill;let D=!1;for(let e of a.jumps){let t=a.ahead(u,e.at);t>0&&t<220&&(E=Math.max(E,t<140?e.flat:e.speed),D||=t<160&&e.flat>=50),e.max&&t>0&&t<160&&(E=Math.min(E,e.max))}this.rnd()<this.diff.mistakes*e*.2&&(this.lift=.6+this.rnd()*.8),this.lift>0&&(this.lift-=e,E*=.75);let O=+(l<E),ee=l>E+1?y.clamp((l-E)/4,.25,1):0,k=(E>l+8&&i.boost>1-this.boostTaste&&Math.abs(b)<.25||D)&&i.boost>.07?1:0;i.power=1+y.clamp(r/350,-1,1)*this.diff.band,this.reverse>0?(this.reverse-=e,O=0,ee=1,b=-b):l<1.5&&t.racing?(this.stuck+=e,this.stuck>2.2&&(this.reverse=1.4,this.stuck=0,this.tries=(this.tries||0)+1)):(this.stuck=0,l>6&&(this.tries=0)),this.tries>=3&&(this.tries=0,t.respawn=!0),o.throttle=O,o.brake=ee,o.boost=k,o.hand=0,o.steer+=(b-o.steer)*Math.min(1,e*6)}},ra=[{name:`R. Okafor`,number:7},{name:`M. Lindqvist`,number:14},{name:`J. Navarro`,number:3},{name:`K. Tanaka`,number:88},{name:`D. Whitlock`,number:21},{name:`S. Moreau`,number:55},{name:`A. Petrov`,number:9},{name:`L. Haddad`,number:42}],ia=class{constructor({phys:e,scene:t,assets:n,track:r,opponents:i,difficulty:a,laps:o,playerPaint:s,quality:c,playerName:l,seed:u=1,crash:d=null}){Object.assign(this,{phys:e,scene:t,track:r,crash:d,laps:r.closed?o:1}),this.substeps=c?.substeps||1,this.eq=new kt.EventQueue(!0),this.byCollider=new Map,this.events=[],we(u*977+13),this.diff=ta[a]||ta.normal,this.cars=[];let f=i+1,p=Math.min(f-1,Math.floor(f/2)),m=0,h=zi.map((e,t)=>t).filter(e=>e!==s);for(let i=0;i<f;i++){let a=i===p,o=a?{name:l||`YOU`,number:27}:ra[m%ra.length],f=new Xi({phys:e,scene:t,assets:n,paint:a?zi[s]:zi[h[m%h.length]],isPlayer:a,name:o.name,number:o.number,lodOnly:!a&&c.aiLod,crash:d}),g={v:f,i:0,lap:0,dist:0,lastSafe:0,finished:!1,time:0,isPlayer:a,racing:!1,respawn:!1};a||(g.ai=new na(f,r,this.diff,we(u*31+m*7+1)),m++),this.cars.push(g);for(let e of f.colliders)this.byCollider.set(e.handle,g);let _=r.gridSlot(i);this.place(g,_.i,_.x,_.z,_.yaw)}this.player=this.cars[p],this.t=0,this.clock=-3.2,this.done=!1,this.order=this.cars.slice(),this.finishOrder=[]}place(e,t,n,r,i){let a=this.track.world.heightAt(n,r)+1.15;e.v.place(n,a,r,i),e.i=t,e.lastSafe=t,e.prevRel=this.track.rel(t),e.lap=this.track.closed&&e.prevRel<0?-1:0,e.dist=this.distOf(e)}distOf(e){let t=this.track,n=t.rel(e.i);if(!t.closed)return n;let r=(n+t.n)%t.n;return e.lap*t.n+r}respawn(e,t=``){if(e.v.totaled){e.respawn=!1,(t===`O`||t[0]===`L`)&&this.retire(e);return}e.resp=(e.resp||0)+1;let n=this.track;(e.respLog||=[]).push(`${e.i}${t}`);for(let t of n.jumps){let r=n.ahead(e.lastSafe,t.at);r>=0&&r<(t.guard??160)&&(e.lastSafe=t.land)}let r=n.frame(e.lastSafe),i=e.isPlayer?0:(e.ai?.lane??0)*.5;e.v.place(r.x+r.nx*i,n.world.heightAt(r.x,r.z)+1.3,r.z+r.nz*i,r.yaw),e.i=e.lastSafe,e.respawn=!1,e.flipT=0}get countdown(){return this.clock<0?Math.min(3,Math.ceil(-this.clock)):0}step(e,t,r){let i=this.track;this.clock+=e;let a=this.clock>=0;a&&!this.done&&(this.t+=e);let o=this.player.dist;for(let n of this.cars){if(n.racing=a&&!n.finished,n.isPlayer){let i=n.v.input;if(n.finished)i.throttle=0,i.brake=.4,i.boost=0,i.hand=0;else{i.throttle=t.throttle,i.brake=t.brake,i.hand=t.hand,i.boost=t.boost;let a=t.steer;r&&n.assistSteer!=null&&(a=y.clamp(a+n.assistSteer*.55,-1,1));let o=t.analog?12:a===0?6:4;i.steer+=(a-i.steer)*Math.min(1,e*o)}}else n.ai&&(n.ai.update(e,n,this.cars.map(e=>e.v),n.finished?0:o-n.dist),n.finished&&(n.v.input.throttle=0,n.v.input.brake=n.v.speed()>3?.5:0,n.v.input.boost=0),n.v.totaled&&Object.assign(n.v.input,{throttle:0,brake:0,boost:0,hand:0}),n.respawn&&this.respawn(n,`S`));n.v.surface=y.clamp(((n.off||0)-(this.track.width/2-.6))/1.5,0,1)}this.crash?.breakables?.step(this.cars.map(e=>e.v),this.t,(e,t,n,r,i)=>{let a=this.cars.find(t=>t.v===e);e.damage&&(e.damage.kind=`p`),e.damage?.hit(r.clone().applyQuaternion(e.group.quaternion),t,n),e.damage&&(e.damage.kind=``),a?.isPlayer&&this.events.push({type:`knock`,name:i.name,dv:t})}),this.weather?.step(e,this.cars),this.hazards?.pre(e,this);let s=this.substeps,c=e/s;this.phys.timestep=c;for(let e=0;e<s;e++){for(let e of this.cars)e.v.step(c,!a);for(let e of this.cars){let t=e.v.body.linvel();(e.preV||=new M).set(t.x,t.y,t.z)}this.phys.step(this.eq),this.impacts(c)}this.hazards?.post(e,this),this.crash?.debris.sync(e);for(let t of this.cars){let o=t.v.body.translation(),s=i.nearest(o,t.i);t.i=s.i,t.off=s.d;let c=i.at(s.i);s.d<i.width*.6&&t.v.contacts>=3&&!c[4]&&(t.lastSafe=s.i),o.y<c[1]-6&&!t.leap?.short?this.respawn(t,`L${(o.y-c[1]).toFixed(0)}d${s.d.toFixed(0)}`):s.d>120&&this.respawn(t,`O`),(t.v.up<.2||t.v.up<.6&&t.v.contacts<=1)&&t.v.speed()<3?(t.flipT=(t.flipT||0)+e,t.flipT>2.5&&this.respawn(t,`F`)):t.flipT=0;let l=i.rel(t.i);i.closed&&(t.prevRel<0&&l>=0&&t.prevRel>-60?t.lap++:t.prevRel>=0&&l<0&&l>-60&&t.lap--),t.prevRel=l,t.dist=this.distOf(t),t.v.totaled&&!t.finished&&(t.deadT=t.v.speed()<.8?(t.deadT||0)+e:0,t.deadT>1.5&&this.retire(t));for(let e of t.v.damage?.events.splice(0)||[])this.events.push({...e,st:t});if(t.isPlayer&&r){let e=i.frame(t.i+12+Math.round(t.v.speed()*.4)),r=t.v.body.rotation(),a=new M(0,0,1).applyQuaternion(new n(r.x,r.y,r.z,r.w)),s=new M(e.x-o.x,0,e.z-o.z).normalize();t.assistSteer=y.clamp(-Math.atan2(a.x*s.z-a.z*s.x,a.x*s.x+a.z*s.z)*1.5,-1,1)}if(!t.finished&&a){let e=i.closed?this.laps*i.n:i.finishRel;t.dist>=e&&(t.finished=!0,t.time=this.t,this.finishOrder.push(t),t.isPlayer&&(this.playerFinished=!0))}}this.order=this.cars.slice().sort((e,t)=>e.dnf===t.dnf?e.dnf&&t.dnf?t.dist-e.dist:e.finished&&t.finished?e.time-t.time:e.finished===t.finished?t.dist-e.dist:e.finished?-1:1:e.dnf?1:-1),this.playerFinished&&!this.done&&(this.afterFinish=(this.afterFinish||0)+e,(this.afterFinish>6||this.finishOrder.length===this.cars.length)&&this.finish())}retire(e){e.finished||(e.finished=!0,e.dnf=!0,e.time=null,this.events.push({type:`dnf`,st:e}),e.isPlayer&&(this.playerFinished=!0))}impacts(e=1/60){this.eq.drainContactForceEvents(t=>{let n=t.collider1(),r=t.collider2(),i=t.totalForceMagnitude()*e/2170;if(!(i<1.4))for(let[e,t]of[[n,r],[r,n]]){let n=this.byCollider.get(e);if(!n?.v.damage)continue;let r=this.phys.getCollider(e),a=this.phys.getCollider(t),o=null,s=null;if(this.phys.contactPair(r,a,(e,t)=>{if(o)return;let n=e.normal();if(o=new M(n.x,n.y,n.z).multiplyScalar(t?-1:1),e.numSolverContacts()>0){let t=e.solverContactPoint(0);s=new M(t.x,t.y,t.z)}}),!o)continue;let c=a.shapeType()===kt.ShapeType.HeightField,l=this.byCollider.get(t),u=n.preV.clone();l&&u.sub(l.preV);let d=u.dot(o),f=Math.min(i,Math.max(0,d)*1.1);f<1.4||(n.v.damage.kind=l?`c`:c?``:`w`,n.v.damage.hit(o,l?f*.6:f,s,c),n.v.damage.kind=``)}})}finish(){if(this.done)return;this.done=!0;let e=this.track.closed?this.laps*this.track.n:this.track.finishRel;for(let t of this.order)!t.finished&&t.v.totaled?(t.finished=!0,t.dnf=!0,t.time=null):t.finished||(t.finished=!0,t.dnf=!1,t.time=this.t*e/Math.max(1,t.dist),this.finishOrder.push(t));this.order.sort((e,t)=>e.dnf===t.dnf?e.dnf?t.dist-e.dist:e.time-t.time:e.dnf?1:-1),this.results=this.order.map((e,t)=>({pos:t+1,name:e.v.name,number:e.v.number,time:e.time,isPlayer:e.isPlayer,dnf:!!e.dnf}))}positionOf(e){return this.order.indexOf(e)+1}lapOf(e){return Math.min(this.laps,Math.max(1,e.lap+1))}progress(e){let t=this.track,n=t.closed?this.laps*t.n:t.finishRel;return y.clamp(e.dist/n,0,1)}sync(e,t,n,r){for(let i of this.cars){let a=i.v.group.position.distanceTo(r);i.v.sync(e,t,a<90?n:null,i.isPlayer?1:.5),i.v.damage?.update(e,t,i.v.speed()/25)}}dispose(){this.hazards?.dispose();for(let e of this.cars)e.v.dispose();this.crash?.debris.clear(),this.crash?.breakables?.reset(),this.eq.free()}},aa=[{id:`chase`,name:`Chase`},{id:`far`,name:`Far chase`},{id:`hood`,name:`Hood`},{id:`bumper`,name:`Bumper`},{id:`tv`,name:`Trackside TV`}],oa=new M,sa=new M,ca=new M,la=new M,ua=new M,da=-65535,fa=new kt.Ray({x:0,y:0,z:0},{x:0,y:1,z:0}),pa=class{constructor(e,t,n){this.camera=e,this.world=t,this.phys=n,this.mode=`chase`,this.pos=new M,this.look=new M,this.tvSpot=null}setMode(e){this.mode=e,this.snap=!0,this.tvSpot=null}bump(e){this.kick=Math.min(.5,(this.kick||0)+e)}cinematic(e){this.cine=e?{a:Math.random()<.5?.9:-.9}:null,e||(this.snap=!0)}leapShot(e,t){this.leapL=e?{L:e,crater:t,shot:-1}:null,this.snap=!0}next(){let e=aa.findIndex(e=>e.id===this.mode);return this.setMode(aa[(e+1)%aa.length].id),aa[(e+1)%aa.length]}update(e,t,n,r,i){let a=this.camera,o=t.group,s=o.quaternion,c=o.position,l=t.body.linvel();ca.set(l.x,0,l.z);let u=ca.length(),d=62,f=this.snap?1:1-Math.exp(-e*6);if(this.cine){a.up.set(0,1,0),this.cine.a+=e*.35;let t=Math.atan2(oa.set(0,0,1).applyQuaternion(s).x,oa.z),n=t+this.cine.a,r=this.cineDist||6.5,i=la.set(c.x+Math.sin(n)*r,0,c.z+Math.cos(n)*r);i.y=Math.max(c.y+(this.cineH??1.4),this.world.heightAt(i.x,i.z)+1),a.position.copy(i),this.look.copy(c).addScaledVector(oa.set(Math.sin(t),0,Math.cos(t)),1.5).add(sa.set(0,this.cineLook??1.2,0)),a.lookAt(this.look),a.fov=this.cineFov||48,a.updateProjectionMatrix();return}if(this.leapL){this.leapCam(e,c);return}if(this.mode===`inspect`){let e=+(new URLSearchParams(location.search).get(`ia`)||.8),t=Math.atan2(oa.set(0,0,1).applyQuaternion(s).x,oa.z)+e;a.up.set(0,1,0),a.position.set(c.x+Math.sin(t)*6,c.y+2.2,c.z+Math.cos(t)*6),a.lookAt(c.x,c.y+.4,c.z),a.fov=45,a.updateProjectionMatrix();return}if(this.mode===`top`){a.up.set(0,0,-1),a.position.set(c.x,c.y+140,c.z+.01),a.lookAt(c.x,c.y,c.z),a.fov=50,a.updateProjectionMatrix();return}if(this.mode===`hood`||this.mode===`bumper`){let t=this.mode===`hood`?[0,1.55,1.7]:[0,.75,2.75],n=this.mode===`hood`?[0,1.3,14]:[0,.75,12],r=la.set(...t).applyQuaternion(s).add(c);this.pos.lerp(r,this.snap?1:1-Math.exp(-e*30));let o=new M(...n).applyQuaternion(s).add(c);this.look.lerp(o,this.snap?1:1-Math.exp(-e*18)),a.position.copy(this.pos),sa.set(0,1,0).applyQuaternion(s).lerp(new M(0,1,0),.6).normalize(),a.up.copy(sa),a.lookAt(this.look),d=(this.mode===`hood`?68:72)+Math.min(u,60)*.34+(i?10:0)}else if(this.mode===`tv`){a.up.set(0,1,0);let t=n.n,i=e=>n.closed?((e-r)%t+t)%t:e-r;ua.copy(c).y+=.9,this.tvSpot&&(this.tvBlocked=this.blocked(this.tvSpot.pos,ua)?(this.tvBlocked||0)+e:0),(!this.tvSpot||i(this.tvSpot.i)<-25||c.distanceTo(this.tvSpot.pos)>130||this.tvBlocked>.25)&&(this.tvSpot=this.pickTv(n,r,ua)||this.tvSpot,this.tvBlocked=0,this.snap=!0),a.position.copy(this.tvSpot.pos),la.set(ca.x,0,ca.z).multiplyScalar(.12).add(c),la.y+=.8,this.look.lerp(la,this.snap?1:1-Math.exp(-e*14)),a.lookAt(this.look);let o=a.position.distanceTo(c);d=y.clamp(2*Math.atan(10/o)*180/Math.PI+Math.min(u,40)*2.5/Math.max(o,8),16,66),a.fov=d,a.updateProjectionMatrix(),this.snap=!1;return}else{a.up.set(0,1,0),oa.set(0,0,1).applyQuaternion(s),oa.y*=.3,oa.normalize(),u>5&&oa.lerp(ca.clone().normalize(),.35).normalize();let t=this.mode===`far`,n=(t?11.5:7)+u*.05+(i?1.6:0),r=(t?4.2:2.5)-Math.min(u,50)*.014,o=c.clone().addScaledVector(oa,-n);o.y=Math.max(c.y+r,this.world.heightAt(o.x,o.z)+1.2),this.pos.lerp(o,f);let l=c.clone().addScaledVector(oa,3).add(new M(0,t?1.4:1.1,0));this.look.lerp(l,this.snap?1:1-Math.exp(-e*12)),a.position.copy(this.pos),a.lookAt(this.look),d=(t?55:57)+Math.min(u,60)*.42+(i?13:0)}this.kick=Math.max(0,(this.kick||0)-e*1.6),this.shakeT=(this.shakeT||0)+e;let p=+!!t.redline,m=Math.max(0,u-15)*.0016+p*.2+this.kick*.4;if(m>0){let e=()=>(Math.random()-.5)*2,t=this.shakeT;a.position.add(la.set(e()*m+p*Math.sin(t*23)*.12,e()*m+p*Math.sin(t*31)*.1,e()*m*.5)),a.rotateZ(e()*m*.08+p*(Math.sin(t*17)*.035+e()*.03)),a.rotateX(p*(Math.sin(t*27)*.02+e()*.015))}d+=p*Math.sin(this.shakeT*13)*2.5,a.fov+=(d-a.fov)*(this.snap?1:f),a.updateProjectionMatrix(),this.snap=!1}leapCam(e,t){let n=this.camera,r=this.leapL,i=r.L;n.up.set(0,1,0);let a=y.clamp(i.t/i.T,0,1),o=new M(i.to.x-i.from.x,0,i.to.z-i.from.z).normalize(),s=new M(o.z,0,-o.x),c=a<.32?0:a<.68?1:2,l=r.shot>=0&&c!==r.shot,u=r.shot<0||r.shot===0&&i.t<.6;r.shot=c;let d,f,p;c===0?(d=la.copy(t).addScaledVector(s,13).addScaledVector(o,6).add(sa.set(0,.5,0)),f=ua.copy(t),p=58):c===1?(d=la.copy(t).addScaledVector(s,-17).addScaledVector(o,-5).add(sa.set(0,9,0)),f=ua.copy(t).addScaledVector(o,4).add(sa.set(0,-14,0)),p=66):(d=la.copy(t).addScaledVector(o,-15).add(sa.set(0,6.5,0)),f=ua.copy(t).addScaledVector(o,24).add(sa.set(0,-4,0)),p=64),l?(this.pos.copy(d),this.look.copy(f)):(this.pos.lerp(d,1-Math.exp(-e*(u?4:10))),this.look.lerp(f,1-Math.exp(-e*(u?6:14)))),n.position.copy(this.pos),n.lookAt(this.look),n.fov=l?p:n.fov+(p-n.fov)*(1-Math.exp(-e*5)),n.updateProjectionMatrix()}blocked(e,t){let n=la.subVectors(t,e),r=n.length();if(r<1)return!1;n.divideScalar(r);for(let t=1;t<10;t++){let i=t/10,a=e.x+n.x*r*i,o=e.z+n.z*r*i;if(this.world.heightAt(a,o)>e.y+n.y*r*i-.3)return!0}return this.phys?(fa.origin={x:e.x,y:e.y,z:e.z},fa.dir={x:n.x,y:n.y,z:n.z},!!this.phys.castRay(fa,r-2.5,!0,void 0,da)):!1}pickTv(e,t,n){let r=Math.floor(t/97)%2?1:-1;for(let[i,a,o]of[[70,r,4.5],[70,-r,4.5],[50,r,5],[50,-r,5],[90,r,8],[35,-r,7],[70,r,12],[25,r,9]]){let r=e.wrap(t+i),s=e.frame(r),c=a*(e.width/2+9),l=s.x+s.nx*c,u=s.z+s.nz*c,d=new M(l,this.world.heightAt(l,u)+o,u);if(d.distanceTo(n)>120)continue;let f=e.frame(e.wrap(t+i*.6)),p=new M(f.x,this.world.heightAt(f.x,f.z)+1,f.z);if(!this.blocked(d,n)&&!this.blocked(d,p))return{i:r,pos:d}}let i=e.frame(e.wrap(t-8));return{i:e.wrap(t+30),pos:new M(i.x,n.y+14,i.z)}}orbit(e,t,n,r,i){let a=this.camera;a.up.set(0,1,0);let o=t*.035,s=n.x+Math.cos(o)*r,c=n.z+Math.sin(o)*r;a.position.set(s,Math.max(this.world.heightAt(s,c)+30,n.y+i),c),a.lookAt(n.x,n.y+120,n.z),a.fov=50,a.updateProjectionMatrix()}},ma=class{constructor(e){this.s=e,this.keys={},this.touch={},this.handlers={},this.tilt=0,addEventListener(`keydown`,e=>{if(e.repeat)return;this.keys[e.code]=!0;let t={KeyC:`camera`,KeyR:`reset`,Escape:`pause`,KeyP:`pause`,Enter:`confirm`};t[e.code]&&this.fire(t[e.code])}),addEventListener(`keyup`,e=>{this.keys[e.code]=!1}),addEventListener(`blur`,()=>{this.keys={},this.touch={}}),this.pad={prev:[]}}on(e,t){this.handlers[e]=t}fire(e){this.handlers[e]?.()}bindTouch(e){for(let t of e.querySelectorAll(`[data-k]`)){let e=t.dataset.k,n=n=>{n.preventDefault(),t.setPointerCapture?.(n.pointerId),t.classList.add(`on`),e===`camera`||e===`pause`||e===`reset`?this.fire(e):this.touch[e]=!0},r=n=>{n.preventDefault(),t.classList.remove(`on`),this.touch[e]=!1};t.addEventListener(`pointerdown`,n),t.addEventListener(`pointerup`,r),t.addEventListener(`pointercancel`,r),t.addEventListener(`lostpointercapture`,r)}}enableTilt(){let e=e=>{let t=(screen.orientation?.angle??window.orientation??0)%180!=0,n=(screen.orientation?.angle??window.orientation??0)===270||window.orientation===-90?-1:1,r=t?(e.beta||0)*n:e.gamma||0;this.tilt=Math.max(-1,Math.min(1,-r/25))},t=()=>addEventListener(`deviceorientation`,e);typeof DeviceOrientationEvent<`u`&&DeviceOrientationEvent.requestPermission?DeviceOrientationEvent.requestPermission().then(e=>e===`granted`&&t()).catch(()=>{}):t()}read(){let e=this.keys,t=this.touch,n=e.KeyW||e.ArrowUp||t.gas?1:0,r=e.KeyS||e.ArrowDown||t.brake?1:0,i=(e.KeyA||e.ArrowLeft||t.left?1:0)-(e.KeyD||e.ArrowRight||t.right?1:0),a=e.Space||t.hand?1:0,o=e.ShiftLeft||e.ShiftRight||t.boost?1:0,s=!1,c=navigator.getGamepads?.().find(e=>e&&e.connected);if(c){n=Math.max(n,c.buttons[7]?.value||0),r=Math.max(r,c.buttons[6]?.value||0),Math.abs(c.axes[0])>.12&&(i=-c.axes[0],s=!0),a=Math.max(a,c.buttons[0]?.value||0),o=Math.max(o,c.buttons[1]?.value||c.buttons[5]?.value||0);let e=(e,t)=>{let n=!!c.buttons[e]?.pressed;n&&!this.pad.prev[e]&&this.fire(t),this.pad.prev[e]=n};e(3,`camera`),e(9,`pause`),e(8,`reset`)}let l=this.s.touchUi;return l&&this.s.touchSteer===`tilt`&&(i=this.tilt,s=!0),l&&this.s.autoGas&&!r&&(n=1),{throttle:n,brake:r,steer:i,hand:a,boost:o,analog:s,touching:l}}},ha=`gravel-riot-settings-v1`,ga=(()=>{let e=navigator.userAgent,t=new URLSearchParams(location.search),n=/Electron/i.test(e)||t.has(`desktop`),r=/Android|iPhone|iPod|Mobile/i.test(e)||t.has(`mobile`),i=/iPad|Tablet/i.test(e)||/Macintosh/.test(e)&&navigator.maxTouchPoints>1;return{desktopApp:n,phone:r,tablet:i,touch:r||i||matchMedia(`(pointer: coarse)`).matches||t.has(`touch`),mobile:r||i}})(),_a={low:{terrainStep:4,fieldRocks:220,shadow:1024,ao:!1,pixelRatio:1.25,aiLod:!0,bloom:!0,damageDetail:.4,blurSamples:6,skids:600},medium:{terrainStep:3,fieldRocks:450,shadow:2048,ao:!1,pixelRatio:1.5,aiLod:!0,bloom:!0,damageDetail:.7,blurSamples:8,skids:1200},high:{terrainStep:2,fieldRocks:700,shadow:4096,ao:!0,pixelRatio:2,aiLod:!1,bloom:!0,damageDetail:1,blurSamples:12,skids:2e3},ultra:{terrainStep:1.25,fieldRocks:1500,shadow:8192,shadowRange:110,ao:!0,aoUltra:!0,pixelRatio:2,minPixelRatio:1.5,aiLod:!1,bloom:!0,damageDetail:1,blurSamples:16,skids:4e3,ultra:!0,substeps:2}};function va(){return{quality:ga.desktopApp?`high`:ga.mobile?`low`:`medium`,fps:ga.desktopApp?0:30,camera:`chase`,touchSteer:`buttons`,autoGas:ga.touch,steerAssist:ga.touch,showFps:!1,driver:`YOU`,paint:0,lensDrops:!0}}var ya=null;function ba(){if(ya)return ya;ya=va();try{let e=JSON.parse(localStorage.getItem(ha)||`{}`);Object.assign(ya,e)}catch{}let e=new URLSearchParams(location.search);return e.has(`lowq`)&&(ya.quality=`low`),e.has(`q`)&&(ya.quality=e.get(`q`)),e.has(`fps`)&&(ya.fps=+e.get(`fps`)),_a[ya.quality]||(ya.quality=`medium`),ya}function xa(e){Object.assign(ba(),e);try{localStorage.setItem(ha,JSON.stringify(ya))}catch{}}function Sa(){let e=ba(),t={..._a[e.quality],name:e.quality},n=new URLSearchParams(location.search);return n.has(`ao`)&&(t.ao=n.get(`ao`)===`1`),n.has(`sub`)&&(t.substeps=+n.get(`sub`)),t.pixelRatio=Math.max(Math.min(devicePixelRatio,t.pixelRatio),t.minPixelRatio||0),t}var Ca=`./`,wa=[{id:`volcano`,name:`Volcano`,dir:`world`,loading:`LOADING VOLCANIC REGION…`},{id:`kaiele`,name:`Kai'ele`,dir:`world/kaiele`,loading:`LOADING KAI'ELE…`}],Ta=e=>wa.find(t=>t.id===e)||wa[0],Ea=`gravel-riot-pending-race`,Da=`gravel-riot-region`,Oa=(()=>{try{return window.sessionStorage}catch{return null}})();async function ka(){return(await Promise.all(wa.map(async e=>{try{return(await fetch(`${Ca}${e.dir}/track.json`).then(e=>e.json())).tracks.map(t=>({id:t.id,name:t.name,closed:t.closed,laps:t.laps,region:e.id,c:t.centre,n:t.centre.length}))}catch{return[]}}))).flat()}function Aa(e,t){let n=null;try{n=JSON.parse(Oa?.getItem(Ea)||`null`),Oa?.removeItem(Ea)}catch{n=null}let r=e=>t.find(t=>t.id===e)?.region,i=Ta(e.get(`region`)||e.has(`race`)&&r(e.get(`race`))||n&&r(n.track)||Oa?.getItem(Da)||`volcano`);try{Oa?.setItem(Da,i.id)}catch{}return{region:i,pending:n&&r(n.track)===i.id?n:null}}function ja(e,t){try{Oa?.setItem(Ea,JSON.stringify(e)),Oa?.setItem(Da,t)}catch{}let n=new URLSearchParams(location.search);n.delete(`race`),n.set(`region`,t),location.search=n.toString()}var Ma=`./`,Na=e=>`${Ma}menu/${e}.jpg`,Pa=[`smash`,`fireball`,`storm`,`night`],Fa=[[1.04,0,0,1.13,-1.2,-.6],[1.13,1.4,.6,1.04,0,0],[1.08,-1.6,0,1.08,1.6,-.4],[1.05,.8,.8,1.14,-.6,-.8],[1.12,-1.2,-.6,1.05,.6,.4],[1.08,1.6,.3,1.09,-1.6,0]],Ia=typeof matchMedia==`function`&&matchMedia(`(prefers-reduced-motion: reduce)`).matches,La=class{constructor(e){this.el=e,this.layers=[0,1].map(()=>{let t=document.createElement(`div`);return t.className=`bd`,e.append(t),t}),this.top=0,this.list=[],this.at=-1,this.n=0,this.token=0,this.on=!1,this.timer=0,this.current=null,this.missing=new Set}show(e){e!==this.on&&(this.on=e,this.el.hidden=!1,this.el.offsetWidth,this.el.classList.toggle(`on`,e),clearTimeout(this.hideT),e?this.list.length>1&&this.queue():(this.hideT=setTimeout(()=>{this.el.hidden=!0},700),clearTimeout(this.timer)))}play(e,t=1e4){(e.join()!==this.list.join()||this.every!==t)&&(this.list=e,this.every=t,this.at=Math.floor(Math.random()*e.length)-1,this.next())}hold(e){this.list=[e],clearTimeout(this.timer),this.current!==e&&this.swap(e)}queue(){clearTimeout(this.timer),this.on&&this.list.length>1&&(this.timer=setTimeout(()=>this.next(),this.every))}async next(){for(let e=0;e<this.list.length&&(this.at=(this.at+1)%this.list.length,this.missing.has(this.list[this.at])||await this.swap(this.list[this.at])===null);e++);this.queue()}async swap(e){let t=++this.token,n=Na(e),r=new Image;r.src=n;try{await r.decode()}catch{return this.missing.add(e),null}if(t!==this.token)return!1;let i=this.layers[this.top];this.top^=1;let a=this.layers[this.top];a.style.transition=`none`,a.classList.remove(`on`),a.style.zIndex=2,i.style.zIndex=1,a.style.backgroundImage=`url("${n}")`;for(let e of a.getAnimations?.()||[])e.cancel();if(!Ia&&a.animate){let e=Fa[this.n++%Fa.length];a.animate([{transform:`scale(${e[0]}) translate(${e[1]}%, ${e[2]}%)`},{transform:`scale(${e[3]}) translate(${e[4]}%, ${e[5]}%)`}],{duration:26e3,easing:`ease-in-out`,fill:`both`})}return a.offsetWidth,a.style.transition=``,a.classList.add(`on`),this.current=e,!0}},Ra=[255,180,31],za=(e,t)=>`rgba(${e[0]},${e[1]},${e[2]},${t})`,Ba=class{constructor(e,{flat:t=!1}={}){this.cv=e,this.g=e.getContext(`2d`),this.flat=t,this.pts=null,this.raf=0,this.tick=e=>{this.raf=requestAnimationFrame(this.tick),this.draw(e)},!t&&typeof ResizeObserver==`function`&&new ResizeObserver(()=>{this.fit(),this.start()}).observe(e)}fit(){if(this.flat)return;let e=this.cv.getBoundingClientRect(),t=Math.min(2,devicePixelRatio||1),n=Math.round(e.width*t),r=Math.round(e.height*t);n&&r&&(n!==this.cv.width||r!==this.cv.height)&&(this.cv.width=n,this.cv.height=r)}set(e){if(e===this.track){this.start();return}this.track=e;let t=e.c||e.centre,n=Math.max(1,Math.round(t.length/420)),r=1/0,i=-1/0,a=1/0,o=-1/0,s=1/0,c=-1/0;for(let e of t)r=Math.min(r,e[0]),i=Math.max(i,e[0]),a=Math.min(a,e[1]),o=Math.max(o,e[1]),s=Math.min(s,e[2]),c=Math.max(c,e[2]);let l=(r+i)/2,u=(s+c)/2,d=1;for(let e of t)d=Math.max(d,Math.hypot(e[0]-l,e[2]-u));let f=Math.min(3,.36*d/Math.max(1,o-a));this.pts=[];for(let e=0;e<t.length;e+=n)this.pts.push([(t[e][0]-l)/d,(t[e][1]-a)*f/d,(t[e][2]-u)/d]);this.box={w:(i-r)/d,h:(c-s)/d},this.closed=!!e.closed,this.u0=e.closed?0:.01,this.lap=Math.max(6,Math.min(14,t.length/420)),this.t0=performance.now(),this.start()}start(){!this.raf&&this.pts&&(this.fit(),this.raf=requestAnimationFrame(this.tick))}stop(){cancelAnimationFrame(this.raf),this.raf=0}along(e,t){let n=this.pts,r=n.length,i=(this.closed?(e%1+1)%1:Math.min(Math.max(e,0),.9999))*(this.closed?r:r-1),a=Math.floor(i),o=n[a%r],s=n[(a+1)%r],c=i-a;return t[0]=o[0]+(s[0]-o[0])*c,t[1]=o[1]+(s[1]-o[1])*c,t[2]=o[2]+(s[2]-o[2])*c,t}draw(e){let{cv:t,g:n,pts:r,flat:i}=this;if(!t.isConnected||!t.offsetParent){this.stop();return}let a=t.width,o=t.height,s=(e-this.t0)/1e3,c=Math.max(1,Math.min(a,o)/300);n.clearRect(0,0,a,o);let l=i?0:.6+s*(Ia?0:.2),u=i?Math.PI/2:.6,d=Math.cos(l),f=Math.sin(l),p=Math.cos(u),m=Math.sin(u),h=i?14*c:22*c,g=i?Math.min((a-h*2)/this.box.w,(o-h*2)/this.box.h):Math.min((a-h*2)/2.4,(o-h*2)/1.75),_=a/2,v=i?o/2:o/2+g*.15,y=(e,t)=>{let n=e[0]*d-e[2]*f,r=e[0]*f+e[2]*d,a=r*p+e[1]*m,o=i?1:1/(1-a*.16);return t[0]=_+n*g*o,t[1]=v+(r*m-e[1]*p)*g*o,t[2]=a,t},b=r.length,x=this.closed?b:b-1,S=Math.min(1,s/.9),C=Math.floor(x*S),w=[0,0,0],T=[0,0,0],E=[0,0,0];if(n.lineCap=n.lineJoin=`round`,!i){n.beginPath();for(let e=0;e<=C;e++){let t=r[e%b];y([t[0],0,t[2]],w),e?n.lineTo(w[0],w[1]):n.moveTo(w[0],w[1])}n.strokeStyle=`rgba(0,0,0,.5)`,n.lineWidth=5*c,n.stroke(),n.strokeStyle=za(Ra,.13),n.lineWidth=c,n.beginPath();for(let e=0;e<=C;e+=3){let t=r[e%b];t[1]<.004||(y(t,w),y([t[0],0,t[2]],T),n.moveTo(w[0],w[1]),n.lineTo(T[0],T[1]))}n.stroke()}n.beginPath();for(let e=0;e<=C;e++)y(r[e%b],w),e?n.lineTo(w[0],w[1]):n.moveTo(w[0],w[1]);if(n.strokeStyle=`rgba(0,0,0,.6)`,n.lineWidth=(i?9:7.5)*c,n.stroke(),i)n.strokeStyle=za(Ra,1),n.lineWidth=5*c,n.stroke();else for(let e=0;e<C;e++){y(r[e%b],w),y(r[(e+1)%b],T);let t=Math.min(1,Math.max(0,(w[2]+1)/2));n.beginPath(),n.moveTo(w[0],w[1]),n.lineTo(T[0],T[1]),n.strokeStyle=za(Ra,.5+t*.5),n.lineWidth=(2.6+t*2.4)*c,n.stroke()}let D=(e,t)=>{y(this.along(e,E),w),y(this.along(e+.004,E),T);let r=T[0]-w[0],i=T[1]-w[1],a=Math.hypot(r,i)||1,o=7*c;n.beginPath(),n.moveTo(w[0]-i/a*o,w[1]+r/a*o),n.lineTo(w[0]+i/a*o,w[1]-r/a*o),n.strokeStyle=t,n.lineWidth=2.5*c,n.stroke()};if(D(this.u0,`rgba(255,255,255,.95)`),!this.closed&&S>=1&&D(.985,`rgba(255,255,255,.95)`),S<1)return;let O=this.lap,ee=s-.9,k=this.closed?ee/O:this.u0+Math.min(1,ee%(O+1.2)/O)*(.985-this.u0);for(let e=24;e>=1;e--){let t=k-e*.0028;!this.closed&&t<this.u0||(y(this.along(t,E),w),y(this.along(t+.0028,E),T),n.beginPath(),n.moveTo(w[0],w[1]),n.lineTo(T[0],T[1]),n.strokeStyle=`rgba(255,236,190,${(1-e/24)*.85})`,n.lineWidth=(i?5:4.5)*c,n.stroke())}for(let[e,t]of[[.022,.75],[.037,.6],[.061,.5]]){let r=k-e*(1+.25*Math.sin(ee*.7+e*90));!this.closed&&r<this.u0||(y(this.along(r,E),w),n.beginPath(),n.arc(w[0],w[1],3.2*c,0,6.3),n.fillStyle=`rgba(216,208,196,${t})`,n.fill())}y(this.along(k,E),w);let te=n.createRadialGradient(w[0],w[1],0,w[0],w[1],16*c);te.addColorStop(0,`rgba(255,214,120,.75)`),te.addColorStop(1,`rgba(255,180,31,0)`),n.fillStyle=te,n.beginPath(),n.arc(w[0],w[1],16*c,0,6.3),n.fill(),n.beginPath(),n.arc(w[0],w[1],5*c,0,6.3),n.fillStyle=`#fff3d6`,n.fill(),n.strokeStyle=`#000`,n.lineWidth=1.5*c,n.stroke()}};function Va(e){let t=e.c||e.centre,n=0,r=1/0,i=-1/0;for(let e=0;e<t.length;e++)r=Math.min(r,t[e][1]),i=Math.max(i,t[e][1]),e>=8&&(n+=Math.max(0,t[e][1]-t[e-8][1])/8);return{km:t.length/1e3,climb:Math.round(n),drop:Math.round(n-(t[t.length-1][1]-t[0][1])),lo:r,hi:i}}var V=e=>document.getElementById(e),Ha=[10,8,6,5,4,3,2,1],Ua=[{track:`village`,laps:3,note:`Street circuit through the village and round the fields`},{track:`summit`,laps:1,note:`Point-to-point hill climb to the lookout below the crater`},{track:`caldera`,laps:2,note:`A full lap of the volcano and the lava jump`},{track:`eruption`,laps:1,note:`The finale: up to the crater, a leap across it, and a race against the lava down the far side`}];function Wa(e){if(e==null||!isFinite(e))return`–`;let t=Math.floor(e/60);return`${t}:${(e-t*60).toFixed(2).padStart(5,`0`)}`}function Ga(e){let t=[.42,.075,.025],n=[.57735,.57735,.57735],r=Math.cos(e.hue),i=Math.sin(e.hue),a=t[0]*n[0]+t[1]*n[1]+t[2]*n[2],o=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]],s=t.map((e,t)=>e*r+o[t]*i+n[t]*a*(1-r)),c=s[0]*.2126+s[1]*.7152+s[2]*.0722;return s=s.map(t=>(c+(t-c)*e.sat)*e.val),`rgb(${s.map(e=>Math.round(255*Math.min(1,Math.max(0,e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055)))).join(`,`)})`}function Ka(e,t,{line:n=`#ffb41f`,width:r=4,bg:i=null,pad:a=14}={}){let o=e.getContext(`2d`),s=t.c||t.centre,c=1/0,l=-1/0,u=1/0,d=-1/0;for(let e of s)c=Math.min(c,e[0]),l=Math.max(l,e[0]),u=Math.min(u,e[2]),d=Math.max(d,e[2]);let f=Math.min((e.width-a*2)/(l-c),(e.height-a*2)/(d-u)),p=(e.width-(l-c)*f)/2,m=(e.height-(d-u)*f)/2,h=(e,t)=>[p+(e-c)*f,m+(t-u)*f];o.clearRect(0,0,e.width,e.height),i&&(o.fillStyle=i,o.fillRect(0,0,e.width,e.height)),o.lineJoin=o.lineCap=`round`;for(let[e,i]of[[r+4,`rgba(0,0,0,.55)`],[r,n]]){o.beginPath();for(let e=0;e<s.length;e+=4){let[t,n]=h(s[e][0],s[e][2]);e?o.lineTo(t,n):o.moveTo(t,n)}t.closed&&o.closePath(),o.strokeStyle=i,o.lineWidth=e,o.stroke()}return h}var qa=class{constructor({tracks:e,settings:t,save:n,handlers:r,gpu:i}){Object.assign(this,{tracks:e,s:t,save:n,h:r,gpu:i}),this.root=V(`ui`),this.stack=[],this.quick={track:`caldera`,laps:2,opponents:5,difficulty:`normal`,weather:`random`,time:`random`},this.champ=null,ga.desktopApp&&document.body.classList.add(`desktop`),this.backdrop=new La(V(`backdrop`)),this.shots=[],e.forEach((e,t)=>{this.shots.push(e.id),t%2==1&&Pa[(t-1)/2]&&this.shots.push(Pa[(t-1)/2])}),this.preview=new Ba(V(`trackanim`)),this.menuOn=!1,this.root.addEventListener(`click`,e=>{let t=e.target.closest(`[data-go]`);t&&this.go(t.dataset.go)}),this.buildQuick(),this.buildWorld(),this.buildSettings(),this.navKeys(),V(`foot`).textContent=ga.desktopApp?`DESKTOP EDITION`:ga.mobile?`MOBILE · 30 FPS`:`BROWSER EDITION`}show(e,t=!0){t&&this.current&&this.current!==e&&this.stack.push(this.current),this.current=e,this.root.hidden=!1,this.root.dataset.screen=e;for(let t of this.root.querySelectorAll(`.screen`))t.classList.toggle(`on`,t.id===`s-${e}`);this.focusFirst(),e===`world`&&this.renderEvents(),this.dress(e)}hide(){this.root.hidden=!0,this.current=null,this.stack=[],this.menuOn=!1,this.backdrop.show(!1),this.preview.stop(),this.cardAnim?.stop()}dress(e){let t=e===`title`||e===`quick`||e===`world`?!0:e===`settings`?this.menuOn||!this.stack.includes(`pause`):!1;t!==this.menuOn&&(this.menuOn=t,this.h.onMenu?.(t)),this.backdrop.show(t),t&&(e===`quick`?(this.backdrop.hold(this.quick.track),this.preview.start(),this.cardAnim?.start()):e===`world`?this.backdrop.play(Ua.map(e=>e.track),8e3):e!==`title`&&this.backdrop.list.length||this.backdrop.play(this.shots))}go(e){let t=this.h;switch(e){case`back`:{let e=this.stack.pop()||`title`;this.show(e,!1),t.onSettingsClosed?.();break}case`title`:this.stack=[],this.show(`title`,!1);break;case`quit`:t.quit?.();break;case`start-quick`:{let e=this.quick;this.champ=null,t.start({track:e.track,laps:e.laps,opponents:e.opponents,difficulty:e.difficulty,weather:e.weather,time:e.time,paint:this.s.paint,mode:`quick`});break}case`start-world`:(!this.champ||this.champ.round>=Ua.length)&&(this.champ={round:0,difficulty:this.quick.cdifficulty||`normal`,points:{}}),this.startRound();break;case`resume`:t.resume();break;case`restart`:t.restart();break;case`quit-race`:this.champ=this.champ&&this.champ.round<Ua.length?this.champ:null,t.quitRace();break;case`next-round`:this.startRound();break;case`standings`:this.showStandings();break;default:this.show(e)}}startRound(){let e=Ua[this.champ.round];this.h.start({track:e.track,laps:e.laps,opponents:7,difficulty:this.champ.difficulty,weather:`random`,time:`random`,paint:this.s.paint,mode:`world`})}buildQuick(){let e=V(`trackcards`);e.innerHTML=``;for(let t of this.tracks){let n=document.createElement(`button`);n.className=`card`,n.dataset.track=t.id;let r=document.createElement(`canvas`);r.width=320,r.height=200,Ka(r,t,{bg:`#1d1713`,width:5});let i=document.createElement(`div`);i.innerHTML=`<b>${t.name}</b><span>${Ta(t.region||`volcano`).name} · ${t.closed?`Circuit`:`Sprint`} · ${(t.n/1e3).toFixed(1)} km</span>`,n.append(r,i),n.onclick=()=>{this.quick.track=t.id,this.quick.laps=t.laps,this.refreshQuick()},e.append(n)}let t=(e,t,n,r,i=e=>e)=>{e.innerHTML=`<button aria-label="Less">−</button><output></output><button aria-label="More">+</button>`;let[a,o,s]=e.children,c=e=>{this.quick[t]=Math.max(n(),Math.min(r(),e)),o.textContent=i(this.quick[t])};a.onclick=()=>c(this.quick[t]-1),s.onclick=()=>c(this.quick[t]+1),e._refresh=()=>c(this.quick[t])},n=e=>this.root.querySelector(`[data-opt="${e}"]`);t(n(`laps`),`laps`,()=>1,()=>this.trackById(this.quick.track).closed?6:1),t(n(`opponents`),`opponents`,()=>0,()=>7),this.seg(n(`difficulty`),[`easy`,`normal`,`hard`],()=>this.quick.difficulty,e=>{this.quick.difficulty=e}),this.cycle(n(`weather`),`weather`,()=>[`random`,...An(this.trackById(this.quick.track))],e=>e===`random`?`Random`:Tn[e].label),this.cycle(n(`time`),`time`,()=>[`random`,...jn(this.trackById(this.quick.track))],e=>e===`random`?`Random`:En[e].label),this.swatches(V(`paints`)),this.refreshQuick()}refreshQuick(){let e=this.trackById(this.quick.track);for(let t of V(`trackcards`).children){let n=t.dataset.track===e.id,r=t.firstChild;t.classList.toggle(`sel`,n),n&&this.cardAnim?.cv!==r&&(this.cardAnim&&(this.cardAnim.stop(),Ka(this.cardAnim.cv,this.cardAnim.track,{bg:`#1d1713`,width:5})),this.cardAnim=new Ba(r,{flat:!0}),this.cardAnim.set(e))}this.preview.set(e);let t=Va(e);V(`tv-name`).textContent=e.name,V(`tv-facts`).textContent=`${Ta(e.region||`volcano`).name} · ${e.closed?`Circuit`:`Sprint`} · ${t.km.toFixed(1)} km · ${e.closed?`${t.climb} m of climb a lap`:t.climb>=t.drop?`${t.climb} m of climb`:`${t.drop} m of descent`}`,this.current===`quick`&&this.backdrop.hold(e.id);for(let e of this.root.querySelectorAll(`.step`))e._refresh?.();let n=this.root.querySelector(`[data-opt="laps"]`).parentElement;n.style.opacity=this.trackById(this.quick.track).closed?1:.4}trackById(e){return this.tracks.find(t=>t.id===e)}cycle(e,t,n,r){e.innerHTML=`<button aria-label="Previous">‹</button><output></output><button aria-label="Next">›</button>`;let[i,a,o]=e.children,s=e=>{let i=n();this.quick[t]=i.includes(e)?e:i[0],a.textContent=r(this.quick[t])},c=e=>{let r=n();s(r[(r.indexOf(this.quick[t])+e+r.length)%r.length])};i.onclick=()=>c(-1),o.onclick=()=>c(1),e._refresh=()=>s(this.quick[t])}seg(e,t,n,r,i=t){e.innerHTML=``,t.forEach((a,o)=>{let s=document.createElement(`button`);s.textContent=i[o],s.onclick=()=>{r(a),[...e.children].forEach((e,r)=>e.classList.toggle(`sel`,t[r]===n()))},e.append(s)}),[...e.children].forEach((e,r)=>e.classList.toggle(`sel`,t[r]===n()))}swatches(e){e.innerHTML=``,zi.forEach((t,n)=>{let r=document.createElement(`button`);r.style.background=Ga(t),r.title=t.name,r.setAttribute(`aria-label`,t.name),r.onclick=()=>{this.save({paint:n});for(let e of this.root.querySelectorAll(`.swatches`))[...e.children].forEach((e,t)=>e.classList.toggle(`sel`,t===n))},e.append(r)}),[...e.children].forEach((e,t)=>e.classList.toggle(`sel`,t===this.s.paint))}buildWorld(){this.quick.cdifficulty=`normal`,this.seg(this.root.querySelector(`[data-opt="cdifficulty"]`),[`easy`,`normal`,`hard`],()=>this.quick.cdifficulty,e=>{this.quick.cdifficulty=e}),this.swatches(V(`cpaints`))}renderEvents(){let e=V(`events`);e.innerHTML=``;let t=this.champ&&this.champ.round<Ua.length?this.champ.round:-1;Ua.forEach((n,r)=>{let i=this.trackById(n.track),a=document.createElement(`li`);t>=0&&r<t&&(a.className=`done`),r===Math.max(t,0)&&a.classList.add(`next`),a.innerHTML=`<div><b>${i.name}</b><br><span>${n.note} · ${i.closed?`${n.laps} laps`:`sprint`}</span></div>`,e.append(a)}),V(`worldbtn`).textContent=t>0?`Continue · Event ${t+1}`:`Start Championship`}buildSettings(){let e=V(`settingrows`);e.innerHTML=``;let t=(t,n,r,i,a,o)=>{let s=document.createElement(`div`);s.className=`row`,s.innerHTML=`<span>${t}${n?`<small>${n}</small>`:``}</span><div class="seg"></div>`,e.append(s),this.seg(s.lastChild,r,()=>this.s[a],e=>{this.save({[a]:e}),o?.(e)},i)};t(`Graphics`,ga.desktopApp?`High is the desktop default; Ultra needs a powerful graphics card`:`Browser and phone builds default lower; Ultra needs a powerful graphics card`,[`low`,`medium`,`high`,`ultra`],[`Low`,`Medium`,`High`,`Ultra`],`quality`,()=>{V(`setnote`).textContent=`Graphics change applies after a reload.`,this.h.onQualityChange?.()}),t(`Frame rate`,`Cap saves battery on phones and laptops`,[30,60,0],[`30`,`60`,`Max`],`fps`,e=>this.h.onFps?.(e)),t(`Camera`,`C key, Y button or CAM to cycle in a race`,aa.map(e=>e.id),aa.map(e=>e.name),`camera`,e=>this.h.onCamera?.(e)),t(`Touch steering`,`Tilt uses the phone's motion sensor`,[`buttons`,`tilt`],[`Buttons`,`Tilt`],`touchSteer`,e=>this.h.onTouch?.(e)),t(`Auto accelerate`,`Touch: the truck drives itself forward, brake to slow`,[!0,!1],[`On`,`Off`],`autoGas`,()=>this.h.onTouch?.()),t(`Steering assist`,`Gently keeps the truck on the racing line`,[!0,!1],[`On`,`Off`],`steerAssist`),t(`Rain on lens`,`Drops on the camera in the wet`,[!0,!1],[`On`,`Off`],`lensDrops`),t(`Show FPS`,``,[!0,!1],[`On`,`Off`],`showFps`),this.gpuNote()}gpuNote(e){e&&(this.gpuExtra=e);let t=this.gpu;t?.name&&(V(`gpuline`).textContent=`${t.software?`No graphics card in use: drawing in software`:`Graphics card: ${t.name}`}${this.gpuExtra?` · ${this.gpuExtra}`:``}`)}showResults(e,t){let n=V(`reshead`),r=V(`resbody`),i=V(`resactions`),a=t===`world`?this.champ:null;V(`restitle`).textContent=a?`Event ${a.round+1} · ${e.track.name}`:`${e.track.name} · Results`,n.innerHTML=`<tr><th>Pos</th><th>Driver</th><th class="num">Time</th>${a?`<th class="num">Pts</th>`:``}</tr>`,r.innerHTML=``,e.results.forEach((e,t)=>{let n=e.dnf?0:Ha[t]||0;a&&(a.points[e.name]=(a.points[e.name]||0)+n);let i=document.createElement(`tr`);e.isPlayer&&(i.className=`me`),i.innerHTML=`<td>${e.pos}</td><td>#${e.number} ${e.name}</td><td class="num">${e.dnf?`DNF`:Wa(e.time)}</td>${a?`<td class="num">+${n}</td>`:``}`,r.append(i)}),i.innerHTML=``;let o=(e,t,n)=>{let r=document.createElement(`button`);r.textContent=e,r.dataset.go=t,n&&(r.className=`primary`),i.append(r)};a?(a.round++,o(`Standings`,`standings`,!0)):(o(`Menu`,`title`),o(`Race Again`,`restart`,!0)),this.show(`results`,!1)}showStandings(){let e=this.champ,t=V(`reshead`),n=V(`resbody`),r=V(`resactions`),i=e.round>=Ua.length;V(`restitle`).textContent=i?`World Race · Final Standings`:`World Race · After Event ${e.round}`,t.innerHTML=`<tr><th>Pos</th><th>Driver</th><th class="num">Points</th></tr>`,n.innerHTML=``;let a=Object.entries(e.points).sort((e,t)=>t[1]-e[1]);a.forEach(([e,t],r)=>{let a=document.createElement(`tr`);e===(this.s.driver||`YOU`)&&(a.className=`me`),a.innerHTML=`<td>${r+1}</td><td>${e}${i&&r===0?` · CHAMPION`:``}</td><td class="num">${t}</td>`,n.append(a)}),r.innerHTML=``;let o=(e,t,n)=>{let i=document.createElement(`button`);i.textContent=e,i.dataset.go=t,n&&(i.className=`primary`),r.append(i)};if(i){let e=a.findIndex(([e])=>e===(this.s.driver||`YOU`))+1;V(`restitle`).textContent=e===1?`World Champion!`:`World Race · You finished P${e}`,this.champ=null,o(`Menu`,`title`,!0)}else o(`Quit Championship`,`title`),o(`Next · ${this.trackById(Ua[e.round].track).name}`,`next-round`,!0);this.show(`results`,!1)}focusables(){let e=this.root.querySelector(`.screen.on`);return e?[...e.querySelectorAll(`button`)].filter(e=>e.offsetParent!==null):[]}focusFirst(){let e=this.focusables(),t=e.find(e=>e.classList.contains(`primary`))||e[0];this.setFocus(t)}setFocus(e){for(let e of this.root.querySelectorAll(`.focus`))e.classList.remove(`focus`);e&&(e.classList.add(`focus`),e.focus({preventScroll:!1}),this.focused=e)}move(e,t){let n=this.focusables();if(!n.length)return;let r=this.focused&&n.includes(this.focused)?this.focused:n[0],i=r.getBoundingClientRect(),a=i.left+i.width/2,o=i.top+i.height/2,s=null,c=1/0;for(let i of n){if(i===r)continue;let n=i.getBoundingClientRect(),l=n.left+n.width/2-a,u=n.top+n.height/2-o,d=e?l*e:u*t;if(d<=4)continue;let f=d+Math.abs(e?u:l)*2.5;f<c&&(c=f,s=i)}s&&this.setFocus(s)}navKeys(){addEventListener(`keydown`,e=>{if(this.root.hidden)return;let t={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.code];t&&(e.preventDefault(),this.move(...t)),(e.code===`Enter`||e.code===`Space`)&&(e.preventDefault(),this.focused?.click()),(e.code===`Escape`||e.code===`Backspace`)&&(this.current===`pause`?this.go(`resume`):this.current!==`title`&&this.current!==`results`&&this.go(this.current===`settings`?`back`:`title`))});let e={},t=0,n=()=>{if(requestAnimationFrame(n),this.root.hidden)return;let r=navigator.getGamepads?.().find(e=>e&&e.connected);if(!r)return;let i=t=>{let n=!!r.buttons[t]?.pressed,i=n&&!e[t];return e[t]=n,i},a=r.axes[0]||0,o=r.axes[1]||0,s=i(12)||o<-.6?[0,-1]:i(13)||o>.6?[0,1]:i(14)||a<-.6?[-1,0]:i(15)||a>.6?[1,0]:null;s?t<=0?(this.move(...s),t=14):t--:t=0,i(0)&&this.focused?.click(),i(1)&&(this.current===`pause`?this.go(`resume`):this.current!==`title`&&this.go(`back`))};n()}},Ja=`./`,Ya=new _e,Xa={};function Za(e,t=8){if(Xa[e])return Xa[e];let n=(e,n)=>{let r=Ya.load(`${Ja}textures/kaiele/${e}`);return r.wrapS=r.wrapT=a,r.anisotropy=t,n&&(r.colorSpace=k),r};return Xa[e]={a:n(`${e}_ar.webp`,!0),p:n(e===`sand`?`sand_nn.webp`:`${e}_nao.jpg`)}}var Qa=null;function $a(e){if(Qa)return Qa;let t=1024,n=e.extent/t,r=e.half,i=new Float32Array(t*t);for(let a=0;a<t;a++)for(let o=0;o<t;o++)i[a*t+o]=e.heightAt(-r+(o+.5)*n,-r+(a+.5)*n);let a=1e4,o=new Float32Array(t*t).fill(a),s=new Float32Array(t*t).fill(a);for(let e=1;e<1023;e++)for(let r=1;r<1023;r++){let a=e*t+r,c=i[a]>0;if(i[a-1]>0!==c||i[a+1]>0!==c||i[a-t]>0!==c||i[a+t]>0!==c){let e=Math.max(Math.hypot(i[a+1]-i[a-1],i[a+t]-i[a-t])/(2*n),.02),r=Math.min(Math.abs(i[a])/e,n);c?(s[a]=r,o[a]=0):(o[a]=r,s[a]=0)}else c?o[a]=0:s[a]=0}let c=n,l=n*Math.SQRT2,u=e=>{for(let n=1;n<1023;n++)for(let r=1;r<1023;r++){let i=n*t+r;e[i]=Math.min(e[i],e[i-1]+c,e[i-t]+c,e[i-t-1]+l,e[i-t+1]+l)}for(let n=1022;n>0;n--)for(let r=1022;r>0;r--){let i=n*t+r;e[i]=Math.min(e[i],e[i+1]+c,e[i+t]+c,e[i+t+1]+l,e[i+t-1]+l)}};u(o),u(s);let d=Math.round(60/n),f=e=>{let n=new Float32Array(t*t),r=new Float32Array(t*t);for(let r=0;r<t;r++){let i=0;for(let n=-d;n<=d;n++)i+=e[r*t+Math.min(Math.max(n,0),1023)];for(let a=0;a<t;a++)n[r*t+a]=i,i+=e[r*t+Math.min(a+d+1,1023)]-e[r*t+Math.max(a-d,0)]}for(let e=0;e<t;e++){let i=0;for(let r=-d;r<=d;r++)i+=n[Math.min(Math.max(r,0),1023)*t+e];for(let a=0;a<t;a++)r[a*t+e]=i,i+=n[Math.min(a+d+1,1023)*t+e]-n[Math.max(a-d,0)*t+e]}return r},p=new Float32Array(t*t),m=new Float32Array(t*t);for(let e=0;e<t*t;e++)p[e]=Math.max(-i[e],0),m[e]=+(i[e]<=0);let h=f(p),g=f(m),v=new Uint8Array(t*t*4);for(let e=0;e<t*t;e++){let t=i[e]>0?s[e]:-o[e],n=g[e]>.5?Math.min(Math.max((h[e]/g[e]-.1)/.65,.22),1.2):.22;v[e*4]=Math.round(Math.min(Math.max((t+8)*4,0),255)),v[e*4+1]=Math.round(n/1.25*255),v[e*4+3]=255}return Qa=new _(v,t,t,ae),Qa.magFilter=L,Qa.minFilter=L,Qa.needsUpdate=!0,Qa.userData.at=(e,i)=>{let a=Math.min(Math.max((e+r)/n-.5,0),1022.999),o=Math.min(Math.max((i+r)/n-.5,0),1022.999),s=Math.floor(a),c=Math.floor(o),l=a-s,u=o-c,d=(c*t+s)*4,f=e=>(v[d+e]*(1-l)+v[d+4+e]*l)*(1-u)+(v[d+t*4+e]*(1-l)+v[d+t*4+4+e]*l)*u;return[f(0)/4-8,f(1)/255*1.25]},Qa}var eo=`
vec4 texAT(sampler2D t, vec2 uv, float n) {
  // two decorrelated lookups blended by low-frequency noise breaks visible tiling
  vec4 a = texture(t, uv);
  vec4 b = texture(t, uv * 0.43 + vec2(0.37, 0.71));
  return mix(a, b, smoothstep(0.35, 0.65, n));
}
vec3 unpackNP(vec4 c) { vec2 xy = c.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
vec3 topToWorld(vec3 tn, vec3 N) { vec3 t = vec3(tn.xy + N.xz, abs(tn.z) * N.y); return normalize(t.xzy); }
float lum3(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
`,to=`
const vec2 WIND = vec2(-0.7071, 0.7071); // the trade wind blows towards the south-west
float hash12(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(p.xyx * vec3(0.1031, 0.103, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
struct Sand { vec3 col; vec3 tn; float ao; float rgh; float wet; };
Sand sandAt(sampler2D sA, sampler2D sN, sampler2D tN, vec3 p, float sd, float rs, float white, float trod, float camD, float wetX) {
  Sand s;
  vec2 xz = p.xz;
  vec3 nb = texture(tN, xz / 31.0).rgb, nm = texture(tN, xz / 8.3).rgb;
  // ---- grain: the 2.6 m scan anti-tiled, plus a rotated 1.1 m copy close up
  vec2 uv = xz / 2.6;
  vec4 A = texAT(sA, uv, nb.g), G = texAT(sN, uv, nb.g);
  vec3 tn = unpackNP(G);
  tn.xy *= mix(0.65, 0.4, white); // coral sand is finer and rounder
  float hgt = A.a;
  float L = lum3(A.rgb);
  vec3 hue = A.rgb / max(L, 1e-3) / vec3(1.256, 0.973, 0.586); // grain-to-grain hue around the scan's mean
#ifndef SAND_LO
  float nearK = 1.0 - smoothstep(6.0, 28.0, camD);
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * xz / 1.1;
  vec4 A2 = texture(sA, uv2), G2 = texture(sN, uv2);
  tn.xy += unpackNP(G2).xy * 0.4 * nearK;
  L = mix(L, L * lum3(A2.rgb) / 0.268, 0.4 * nearK);
  hgt = mix(hgt, A2.a, 0.3 * nearK);
#endif
  L /= 0.268; // 1 = the scan's mean
  float ao = mix(0.62, 1.05, hgt);
  // ---- colour. Black sand: basalt and volcanic glass, charcoal with brown, grey and pale grains. White sand:
  // coral and shell, warm cream with pink and tan fragments. Broad patches of coarser and finer sand.
  vec3 blk = vec3(0.064, 0.06, 0.057) * pow(L, 1.25) * mix(vec3(1.0), hue, 0.7);
  vec3 wht = vec3(0.78, 0.7, 0.56) * mix(1.0, L, 0.3) * mix(vec3(1.0), hue, 0.5);
  vec3 col = mix(blk, wht, white);
#ifndef SAND_LO
  // single grains close up: pale feldspar, olivine and coral grit in the black sand, dark basalt in the white
  vec2 gq = floor(xz / 0.004);
  float gh = hash12(gq);
  float gk = (1.0 - smoothstep(2.0, 9.0, camD));
  col = mix(col, mix(vec3(0.2, 0.19, 0.16), vec3(0.05, 0.045, 0.04), white), step(mix(0.965, 0.992, white), gh) * gk);
  col = mix(col, vec3(0.06, 0.08, 0.035), step(0.993, gh) * gk * (1.0 - white));
#endif
  col *= mix(0.86, 1.1, smoothstep(0.3, 0.75, nb.r)) * mix(0.93, 1.05, nm.g);
  // ---- run-up: 0 at the waterline, 1 at the reach of the biggest sets (by distance, or height on a steep beach)
  float R = 24.0 * rs;
  float q = max(sd / (R * 1.2), p.y / (1.3 + 1.32 * rs)) + (nb.g - 0.5) * 0.14 + (nm.b - 0.5) * 0.05;
  float film = 1.0 - smoothstep(0.03, 0.09, q + (nm.r - 0.5) * 0.04);
  float damp = 1.0 - smoothstep(0.3, 0.52, q + (0.5 - hgt) * 0.05);
  float wet = max(max(damp, film), wetX);
  float dryK = smoothstep(1.02, 1.25, q);
  float back = smoothstep(1.5, 2.3, q) * smoothstep(-2.0, 12.0, sd - 18.0);
  // ---- trampled: footprints and old wheel marks dimple the dry sand in broad patches
  vec2 fq = xz / 0.9;
  float f0 = texture(tN, fq).r, f1 = texture(tN, fq + vec2(0.015, 0.0)).r, f2 = texture(tN, fq + vec2(0.0, 0.015)).r;
  float stomp = (1.0 - damp) * smoothstep(0.42, 0.62, nb.r * 0.6 + nm.b * 0.5) * (1.0 - back * 0.5) * (1.0 - trod);
  tn.xy += vec2(f0 - f1, f0 - f2) * 9.0 * stomp;
  ao *= mix(1.0, 0.85 + 0.3 * f0, stomp);
  // ---- wind ripples on the dry sand, meandering, worn away in patches; troughs gather the heavy dark grains
  vec2 rot = vec2(WIND.y, -WIND.x);
  vec2 ru = vec2(dot(xz, rot), dot(xz, WIND)) + (vec2(nm.r, nm.b) - 0.5) * 0.9;
  vec4 X = texture(sN, ru / 3.4);
  float ripK = dryK * (1.0 - trod) * smoothstep(0.3, 0.52, nb.b + nm.g * 0.25) * (1.0 - back * 0.4) * (1.0 - stomp * 0.7);
  vec2 rn = X.ba * 2.0 - 1.0;
  tn.xy += (rn.x * rot + rn.y * WIND) * ripK * 1.4;
  col *= mix(1.0, 1.0 + rn.y * mix(0.35, 0.15, white), ripK);
#ifndef SAND_LO
  // larger, more irregular ripples a little off the wind
  vec4 X2 = texture(sN, mat2(0.97, 0.26, -0.26, 0.97) * ru / 8.5 + 0.31);
  vec2 rn2 = X2.ba * 2.0 - 1.0;
  float rip2 = dryK * (1.0 - trod) * smoothstep(0.45, 0.7, nm.g * 0.7 + nb.r * 0.5);
  vec2 r2 = mat2(0.97, -0.26, 0.26, 0.97) * rn2;
  tn.xy += (r2.x * rot + r2.y * WIND) * rip2 * 0.9;
  col *= mix(1.0, 1.0 + rn2.y * 0.2, rip2);
#endif
  // ---- dune hummocks at the back of the beach: wind-scoured pale crests, sheltered hollows with plant litter
  vec2 hq = xz / 9.0;
  float h0 = texture(tN, hq).g, hx = texture(tN, hq + vec2(0.012, 0.0)).g, hz = texture(tN, hq + vec2(0.0, 0.012)).g;
  back *= smoothstep(0.3, 0.6, nb.r + nm.g * 0.3); // in patches, not everywhere
  tn.xy += vec2(h0 - hx, h0 - hz) * 12.0 * back;
  col *= mix(1.0, mix(0.82, 1.1, smoothstep(0.35, 0.65, h0)), back);
  col = mix(col, col * vec3(0.78, 0.7, 0.58), back * smoothstep(0.55, 0.35, h0) * smoothstep(0.5, 0.7, nm.r) * 0.6);
  ao *= mix(1.0, mix(0.75, 1.0, smoothstep(0.3, 0.6, h0)), back);
  // ---- swash marks: thin arcs of fine grains and foam scum left at each run-up's limit
  float sy = (q + (nm.g - 0.5) * 0.06) * 9.0;
  float sw = fwidth(sy) + 1e-4;
  float sm = fract(sy);
  float swl = smoothstep(0.0, 0.03 + sw, sm) * (1.0 - smoothstep(0.04, 0.09 + sw * 2.0, sm));
  swl *= smoothstep(0.08, 0.15, q) * (1.0 - smoothstep(0.9, 1.0, q)) * smoothstep(0.42, 0.6, nm.b + nb.g * 0.3) * (1.0 - trod) * (1.0 - smoothstep(0.05, 0.25, sw));
  col = mix(col, mix(vec3(0.1, 0.095, 0.09), col * 0.72, white), swl * 0.5);
  // ---- the wrack line: limu, twigs, palm fibre, shells and coral grit dropped by the highest waves; an older,
  // patchier line from the last big swell further up
  float wr = exp(-pow((q - 1.0) / 0.06, 2.0)) + 0.6 * exp(-pow((q - 1.3) / 0.045, 2.0)) * step(0.45, nb.b);
  float clump = smoothstep(0.42, 0.66, texture(tN, xz / 1.4).r * 0.7 + nm.g * 0.5);
  float wrack = clamp(wr * clump, 0.0, 1.0) * (1.0 - trod);
  float fib = texture(tN, mat2(0.6, 0.8, -0.8, 0.6) * xz * vec2(3.0, 0.9)).b;
  // fresh limu dark olive, sun-dried limu and palm fibre tan, twigs bleached grey
  vec3 limu = mix(vec3(0.05, 0.04, 0.02), vec3(0.035, 0.05, 0.02), smoothstep(0.4, 0.6, nm.r));
  limu = mix(limu, vec3(0.2, 0.15, 0.085), smoothstep(0.5, 0.62, fib) * smoothstep(0.3, 0.6, nb.r + 0.2));
  limu = mix(limu, vec3(0.32, 0.3, 0.27), smoothstep(0.68, 0.74, fib));
  float wk = wrack * smoothstep(0.36, 0.52, fib + clump * 0.2);
  col = mix(col, limu, wk);
  tn.xy += (vec2(fib, texture(tN, xz * 1.7).g) - 0.5) * 1.6 * wk;
  ao *= 1.0 - wk * 0.35;
  // shell and coral grit strewn along the line
  float grit = step(0.9, hash12(floor(xz / 0.018))) * clamp(wr, 0.0, 1.0) * (1.0 - trod) * (1.0 - smoothstep(10.0, 30.0, camD));
  col = mix(col, vec3(0.62, 0.58, 0.5), grit * 0.8);
  float rgh = 0.92;
  // ---- pebbles: rounded lava pebbles on the black beach, coral rubble and shells on the white one, gathered on the
  // swash slope and along the wrack, sparse elsewhere; domed normals and contact shadows
  float pebK = (0.03 + 0.45 * wr + 0.18 * damp * (1.0 - film)) * smoothstep(0.35, 0.65, nm.b * 0.6 + nb.r * 0.6) * (1.0 - trod);
#ifndef SAND_LO
  if (camD < 70.0 && pebK > 0.01) {
    vec2 gp = xz / 0.24, gi = floor(gp), gf = fract(gp);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = gi + vec2(i, j);
      float r = hash12(id);
      if (r > pebK) continue;
      vec2 hh = hash22(id + 17.0);
      vec2 d = gf - vec2(i, j) - 0.2 - hh * 0.6;
      float an = hh.x * 6.283, rad = 0.08 + 0.2 * fract(r * 37.0);
      d = mat2(cos(an), sin(an), -sin(an), cos(an)) * d * vec2(1.0, 1.5);
      float qd = length(d) / rad;
      if (qd < 1.35) {
        float kind = fract(r * 91.0 + hh.y);
        // black beach: mostly lava pebbles, a few coral bits; white beach the other way round
        bool lava = kind < mix(0.85, 0.15, white);
        vec3 pc = lava ? vec3(0.03, 0.029, 0.028) * (0.7 + hh.y * 0.8) : mix(vec3(0.7, 0.66, 0.58), vec3(0.72, 0.52, 0.47), step(0.8, fract(kind * 7.0)));
        float in1 = 1.0 - smoothstep(0.85, 1.0, qd);
        float dome = sqrt(max(0.0, 1.0 - qd * qd));
        col = mix(col, pc, in1);
        tn.xy = mix(tn.xy, d / rad * 0.7 / max(dome, 0.25), in1);
        ao *= mix(1.0, 0.55 + 0.45 * smoothstep(1.0, 1.35, qd), 1.0 - in1);
        rgh = mix(rgh, lava ? mix(0.5, 0.12, wet) : mix(0.7, 0.3, wet), in1);
      }
    }
  }
  // ---- glints: now and then a grain's facet catches the sun (volcanic glass more than coral)
  vec2 gc = floor(xz / 0.011);
  float gl = step(0.985, hash12(gc)) * (1.0 - wet) * (1.0 - smoothstep(3.0, 18.0, camD)) * mix(1.0, 0.4, white);
  tn.xy = mix(tn.xy, (hash22(gc + 5.3) - 0.5) * 1.2, gl);
  rgh = mix(rgh, 0.08, gl);
#endif
  // ---- wet: darker, smoother, glossy; where the last wave drained a film of water mirrors the sky
  col *= mix(1.0, mix(0.5, 0.62, white), wet);
  col *= mix(1.0, mix(0.8, 0.88, white), film);
  rgh = mix(rgh, mix(0.24, 0.34, white) - (hgt - 0.5) * 0.2, wet);
  rgh = mix(rgh, 0.05, film);
  tn.xy *= mix(1.0, 0.3, wet) * mix(1.0, 0.3, film);
  ao = mix(ao, 1.0, film * 0.6);
  s.col = col; s.tn = normalize(vec3(tn.xy, max(tn.z, 0.2))); s.ao = ao; s.rgh = rgh; s.wet = wet;
  return s;
}
`;async function no(e,t){try{let n=await fetch(`${Ja}${e.dir}/lava_masks.png`);if(!n.ok||!(n.headers.get(`content-type`)||``).startsWith(`image`))return null;let r=await createImageBitmap(await n.blob(),{premultiplyAlpha:`none`,colorSpaceConversion:`none`}),i=document.createElement(`canvas`);i.width=i.height=t;let a=i.getContext(`2d`,{willReadFrequently:!0});return a.drawImage(r,0,0,t,t),a.getImageData(0,0,t,t).data}catch{return null}}async function ro(e){let{heights:t,grid:n,res:r}=e,i=n-1,a=await no(e,i),o=new Uint8Array(i*i*4);for(let e=0;e<i;e++)for(let s=0;s<i;s++){let c=e*n+s,l=(t[c+1]+t[c+n+1]-t[c]-t[c+n])*.5,u=(t[c+n]+t[c+n+1]-t[c]-t[c+1])*.5,d=Math.hypot(l,r,u),f=(e*i+s)*4;o[f]=(-l/d*.5+.5)*255,o[f+1]=(-u/d*.5+.5)*255,a&&(o[f+2]=a[f],o[f+3]=a[f+1])}let s=new _(o,i,i,ae);return s.magFilter=L,s.minFilter=se,s.generateMipmaps=!0,s.needsUpdate=!0,s}function io(e,t){let{half:n,extent:r,data:i}=e,a=Math.round(r/64),o=Math.max(e.res,t.terrainStep),s=new Uint8Array(a*a).fill(3),c=(e,t,r,i)=>{let o=Math.max(0,Math.floor((e-r+n)/64)),c=Math.min(a-1,Math.floor((e+r+n)/64)),l=Math.max(0,Math.floor((t-r+n)/64)),u=Math.min(a-1,Math.floor((t+r+n)/64));for(let d=l;d<=u;d++)for(let l=o;l<=c;l++){let o=Math.max(-n+l*64-e,0,e-(-n+(l+1)*64)),c=Math.max(-n+d*64-t,0,t-(-n+(d+1)*64));o*o+c*c<r*r&&(s[d*a+l]=Math.min(s[d*a+l],i))}};for(let e of i.tracks)for(let t=0;t<e.centre.length;t+=4){let n=e.centre[t];c(n[0],n[2],150,0),c(n[0],n[2],450,1)}let l=[o,o*2.5,16,32],u=[],d=a/8,f=[0,0,0,0],p=new M;for(let t=0;t<d;t++)for(let r=0;r<d;r++){let i=[],o=[],c=[];for(let u=t*8;u<(t+1)*8;u++)for(let t=r*8;t<(r+1)*8;t++){let r=s[u*a+t],d=-n+t*64,m=-n+u*64;if(r>=2){let t=-1e9;for(let n=0;n<=8;n++)for(let r=0;r<=8;r++)t=Math.max(t,e.heightAt(d+n*8,m+r*8));r=t<-15?3:2}let h=Math.max(2,Math.round(64/l[r]));f[r]++;let g=64/h,_=i.length/3;for(let t=0;t<=h;t++)for(let n=0;n<=h;n++){let r=d+n*g,a=m+t*g;i.push(r,e.heightAt(r,a),a),e.normalAt(r,a,p),o.push(p.x,p.y,p.z)}for(let e=0;e<h;e++)for(let t=0;t<h;t++){let n=_+e*(h+1)+t,r=n+1,i=n+h+1,a=i+1;c.push(n,i,r,r,i,a)}let v=.6+g*.6,y=e=>{let t=i.length/3;for(let t=0;t<=h;t++){let n=e(t);i.push(i[n*3],i[n*3+1]-v,i[n*3+2]),o.push(o[n*3],o[n*3+1],o[n*3+2])}for(let n=0;n<h;n++){let r=e(n),i=e(n+1),a=t+n,o=t+n+1;c.push(r,a,i,i,a,o,r,i,a,i,o,a)}};y(e=>_+e),y(e=>_+h*(h+1)+e),y(e=>_+e*(h+1)),y(e=>_+e*(h+1)+h)}let d=new I;d.setAttribute(`position`,new P(i,3)),d.setAttribute(`normal`,new P(o,3)),d.setIndex(i.length/3>65535?new ce(c,1):new je(c,1)),d.computeBoundingSphere(),d.computeBoundingBox(),u.push(d)}return console.info(`kaiele terrain chunks by level`,f.join(`/`),`fine step`,o),u}async function ao(e,t,n){let{extent:r}=e,i=n.aiLod?4:8,a=await ro(e),o=await Ya.loadAsync(`${Ja}${e.dir}/biome.png`);o.premultiplyAlpha=!1,o.needsUpdate=!0,o.flipY=!1;let s={sand:Za(`sand`,i),grass:Za(`grass`,i),litter:Za(`litter`,i),dirt:Za(`dirt`,i),rock:Za(`rock`,i)},c=new h({roughness:1,metalness:0,envMapIntensity:.8});c.userData.wx=`ground`;let l={tNH:{value:a},tBiome:{value:o},tNoise:{value:t.noise},uExtent:{value:r},sandA:{value:s.sand.a},sandP:{value:s.sand.p},grsA:{value:s.grass.a},grsP:{value:s.grass.p},litA:{value:s.litter.a},litP:{value:s.litter.p},dirA:{value:s.dirt.a},dirP:{value:s.dirt.p},rokA:{value:s.rock.a},rokP:{value:s.rock.p},tShore:{value:$a(e)},uWet:{value:0},uSnowLine:{value:600}};c.userData.uniforms=l,n.terrainStep>3&&(c.defines={SAND_LO:``}),c.onBeforeCompile=e=>{Object.assign(e.uniforms,l),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vW;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vW = (modelMatrix * vec4(transformed,1.0)).xyz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vW;
// 14 samplers + shadow map + environment: the 16 units many GPUs allow
uniform sampler2D tNH, tBiome, tNoise, tShore, sandA, sandP, grsA, grsP, litA, litP, dirA, dirP, rokA, rokP;
uniform float uExtent, uWet, uSnowLine;
${eo}
${to}
vec3 gN; float gAO; float gR;`).replace(`#include <map_fragment>`,`
vec2 wuv = vW.xz / uExtent + 0.5;
vec4 nh = texture(tNH, wuv);
vec3 Ng = vec3(nh.r * 2.0 - 1.0, 0.0, nh.g * 2.0 - 1.0); Ng.y = sqrt(max(0.0, 1.0 - dot(Ng.xz, Ng.xz)));
// the 2 m field is rough; ground cover follows the slope of the land around (mip 3, ~16 m)
vec4 nhS = texture(tNH, wuv, 3.0);
vec2 sxz = nhS.rg * 2.0 - 1.0;
float slope = 1.0 - Ng.y, slopeS = 1.0 - sqrt(max(0.0, 1.0 - dot(sxz, sxz)));
float slopeM = mix(slope, slopeS, 0.6);
float fresh = nh.b, aa = nh.a;
vec4 bm = texture(tBiome, wuv);
vec3 nz = texture(tNoise, vW.xz / 240.0).rgb;
vec3 nz2 = texture(tNoise, vW.xz / 37.0).rgb;
vec3 nzm = texture(tNoise, vW.xz / 7.0).rgb;
float y = vW.y;
float camD = length(vW - cameraPosition);

// ---- erosion: rain cuts gullies straight down the slopes; noise stretched along the fall line
vec2 fall = normalize(sxz + vec2(1e-4));
vec2 gq = vec2(dot(vW.xz, vec2(-fall.y, fall.x)) / 14.0, dot(vW.xz, fall) / 110.0);
float gully = clamp((texture(tNoise, gq).r * 0.6 + texture(tNoise, gq * vec2(3.1, 2.0)).g * 0.4 - 0.52) * 3.5 + 0.5, 0.0, 1.0);
float gK = smoothstep(0.08, 0.3, slopeM);

// ---- layer weights
float land = smoothstep(-0.6, 1.2, y);
// beaches: the bake's sand mask, and any gentle shore below ~4 m (sand runs on out under the water)
float shore = (1.0 - smoothstep(2.5, 5.5, y + (nz2.g - 0.5) * 3.0)) * (1.0 - smoothstep(0.16, 0.3, slopeS)) * smoothstep(-9.0, -3.0, y);
float wSand = max(smoothstep(0.12, 0.45, bm.r + (nz2.g - 0.5) * 0.12), shore);
// the bake's rock mask is right on the coast (lava point, tide pools); inland it follows a noisy 2 m slope, so
// only keep it as scattered outcrops there
float coast = 1.0 - smoothstep(10.0, 28.0, y);
float wRockB = bm.a * mix(0.3 * smoothstep(0.55, 0.75, nz2.r + bm.a * 0.3), 1.0, coast);
wSand *= 1.0 - smoothstep(0.3, 0.7, wRockB);
float wCliff = smoothstep(0.44, 0.6, slopeM + (nz2.r - 0.5) * 0.12);
float vegP = land * smoothstep(2.0, 9.0, y + nz2.b * 4.0) * (1.0 - smoothstep(uSnowLine - 90.0, uSnowLine - 20.0, y + nz.r * 50.0));
float veg = max(bm.b, vegP * mix(0.75, 1.0, nz.g));
// trade winds blow from the north-east: the leeward south-west lowlands are drier, golden grass and red earth
float dry = smoothstep(-300.0, 1300.0, (vW.z - vW.x) * 0.7 + (nz.r - 0.5) * 500.0) * (1.0 - smoothstep(0.3, 0.7, bm.b)) * (1.0 - smoothstep(250.0, 420.0, y));
float wJungle = clamp(smoothstep(0.4, 0.85, bm.b) + smoothstep(0.6, 0.85, gully) * gK * 0.5 * smoothstep(40.0, 120.0, y), 0.0, 1.0);
// red laterite: bare banks, steep-ish slopes, gully floors and worn patches on the uplands
float wDirt = smoothstep(0.18, 0.34, slopeM + (nz2.g - 0.5) * 0.22 + (gully - 0.5) * 0.25 * gK);
wDirt = max(wDirt, smoothstep(0.7, 0.82, nz.b * 0.7 + nzm.g * 0.35) * 0.8);
wDirt = max(wDirt, dry * smoothstep(0.62, 0.75, nz2.r * 0.7 + nzm.g * 0.4) * 0.85);
wDirt *= 1.0 - smoothstep(0.6, 0.95, bm.b) * 0.7;
float snow = smoothstep(uSnowLine, uSnowLine + 40.0, y + nz.r * 40.0 + nz2.g * 10.0) * (1.0 - wCliff * 0.6) * (1.0 - fresh);

// ---- sand: black volcanic on the south beach, white coral at the north cove, wet and glossy at the waterline
vec2 sh = texture(tShore, wuv).rg;
Sand sd = sandAt(sandA, sandP, tNoise, vW, sh.r * 64.0 - 8.0, sh.g * 1.25, smoothstep(0.2, 0.7, bm.g), 0.0, camD, uWet);
vec3 sandC = sd.col;
float sandR = sd.rgh;
vec3 sandN = sd.tn;

// ---- grass on the headlands and plateau, two tones, yellowing on the dry upper slopes
vec2 uvG = vW.xz / 3.0;
vec4 gA = texAT(grsA, uvG, nz2.r); vec4 gP = texAT(grsP, uvG, nz2.r);
vec3 grassC = gA.rgb * mix(vec3(0.72, 0.98, 0.55), vec3(0.95, 1.0, 0.62), smoothstep(0.35, 0.7, nz.r));
// clumps: darker lush patches and paler worn ones break up the lawn look
grassC *= mix(0.72, 1.12, smoothstep(0.25, 0.75, nzm.g * 0.6 + nz2.b * 0.6 - 0.1));
grassC = mix(grassC, gA.rgb * vec3(1.15, 1.0, 0.55), smoothstep(320.0, 520.0, y + nz.g * 80.0) * 0.6);
grassC = mix(grassC, vec3(lum3(gA.rgb)) * vec3(1.6, 1.25, 0.6), dry * smoothstep(0.3, 0.6, nz2.g + nzm.b * 0.3) * 0.75);
// ---- jungle floor: dark soil, leaf litter, moss
vec2 uvJ = vW.xz / 3.5;
vec4 jA = texAT(litA, uvJ, nz2.b); vec4 jP = texAT(litP, uvJ, nz2.b);
vec3 jungleC = jA.rgb * vec3(0.7, 0.72, 0.6);
jungleC = mix(jungleC, gA.rgb * vec3(0.45, 0.62, 0.3), smoothstep(0.5, 0.75, nzm.b) * 0.55);
// ---- Hawaiian red dirt
vec2 uvD = vW.xz / 4.5;
vec4 dA = texAT(dirA, uvD, nz2.r); vec4 dP = texAT(dirP, uvD, nz2.r);
vec3 dTN = unpackNP(dP);
if (slopeM > 0.2) {
  // banks: side projections, or the top projection smears down the slope
  vec2 w2 = pow(abs(Ng.xz), vec2(4.0)); w2 /= (w2.x + w2.y + 1e-4);
  float wt = smoothstep(0.2, 0.32, slopeM);
  vec4 aX = texture(dirA, vW.zy / 4.5), aZ = texture(dirA, vW.xy / 4.5);
  vec4 pX = texture(dirP, vW.zy / 4.5), pZ = texture(dirP, vW.xy / 4.5);
  dA = mix(dA, aX * w2.x + aZ * w2.y, wt);
  dP = mix(dP, pX * w2.x + pZ * w2.y, wt);
  // side normals are in the face's plane; approximate them as top-tangent so they still read as relief
  dTN = normalize(mix(dTN, unpackNP(dP), wt));
}
vec3 dirtC = mix(dA.rgb, vec3(lum3(dA.rgb)) * vec3(1.75, 0.72, 0.42), 0.55);
dirtC = mix(dirtC, dirtC * vec3(0.8, 0.62, 0.55), smoothstep(0.55, 0.8, nzm.r) * 0.6);

// ---- rock: top projected for the shelves, triplanar layered basalt for the cliffs
vec2 uvR = vW.xz / 5.0;
vec4 rA = texAT(rokA, uvR, nz2.g); vec4 rP = texAT(rokP, uvR, nz2.g);
vec3 rockTopC = vec3(pow(lum3(rA.rgb), 0.75) * 0.42) * vec3(2.4, 2.3, 2.2);
vec3 rockTopN = unpackNP(rP);
// tide pools: still water left in the hollows of the coastal shelves
float pool = smoothstep(0.66, 0.72, texture(tNoise, vW.xz / 9.0).b) * coast * (1.0 - smoothstep(1.2, 2.2, y));

vec3 cliffC = vec3(0.0); vec3 cliffN = Ng; float cliffAO = 1.0, cliffR = 0.85;
if (wCliff > 0.005) {
  vec3 bw = pow(abs(Ng), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float rs = 1.0 / 9.0;
  vec2 uX = vW.zy * rs, uY = vW.xz * rs, uZ = vW.xy * rs;
  vec4 cX = texture(rokA, uX), cY = texture(rokA, uY), cZ = texture(rokA, uZ);
  vec4 pX = texture(rokP, uX), pY = texture(rokP, uY), pZ = texture(rokP, uZ);
  cliffC = vec3(pow(lum3(cX.rgb * bw.x + cY.rgb * bw.y + cZ.rgb * bw.z), 0.75) * 0.42);
  cliffAO = pX.b * bw.x + pY.b * bw.y + pZ.b * bw.z;
  vec3 tnX = unpackNP(pX), tnY = unpackNP(pY), tnZ = unpackNP(pZ);
  tnX = vec3(tnX.xy + Ng.zy, abs(tnX.z) * Ng.x);
  tnY = vec3(tnY.xy + Ng.xz, abs(tnY.z) * Ng.y);
  tnZ = vec3(tnZ.xy + Ng.xy, abs(tnZ.z) * Ng.z);
  cliffN = normalize(tnX.zyx * bw.x + tnY.xzy * bw.y + tnZ.xyz * bw.z);
  // stacked lava flows: dense grey-black basalt beds split by thin rusty clinker and ash layers
  float yb = y + texture(tNoise, vW.xz / 160.0).r * 18.0;
  // (the noise is sampled blurred: a 1D line through it is otherwise full of hairline stripes)
  float bed = texture(tNoise, vec2(yb / 9.0, 0.37), 2.0).r;
  float seam = smoothstep(0.6, 0.7, texture(tNoise, vec2(yb / 24.0, 0.71), 2.5).g);
  cliffC *= mix(vec3(1.9, 1.85, 1.8), vec3(2.5, 2.4, 2.3), smoothstep(0.3, 0.7, bed));
  cliffC = mix(cliffC, vec3(0.16, 0.08, 0.05) * (0.8 + bed * 0.4), seam * 0.4);
  // Hawaiian valley walls are draped in green: ferns and moss over the rock except on the sheerest faces
  float ledge = smoothstep(0.45, 0.75, Ng.y + (nzm.g - 0.5) * 0.4 + (nz2.b - 0.5) * 0.3) * smoothstep(8.0, 40.0, y) * (1.0 - snow);
  // velvet-green ridges: all but the sheerest faces carry a skin of ferns and moss, opening in patches
  float drape = smoothstep(0.35, 0.7, veg) * smoothstep(8.0, 40.0, y) * (1.0 - snow);
  ledge = max(ledge, drape * max(1.0 - smoothstep(0.55, 0.78, slopeM + (nz2.b - 0.5) * 0.2), smoothstep(0.5, 0.72, nz2.b * 0.6 + nzm.r * 0.5)));
  cliffC = mix(cliffC, mix(grassC * 0.6, jungleC * 0.9, wJungle), ledge * 0.9);
  float runoff = texture(tNoise, vec2(dot(vW.xz, vec2(-Ng.z, Ng.x)) / 3.0, yb / 70.0)).r;
  cliffC *= mix(0.75, 1.15, runoff);
  cliffN = normalize(mix(cliffN, Ng, seam * 0.4));
  cliffR = 0.8 + (cX.a * bw.x + cY.a * bw.y + cZ.a * bw.z) * 0.15;
}

// ---- compose the top layers
vec3 col = mix(dirtC, grassC, veg);
vec3 tn = normalize(mix(dTN, unpackNP(gP), veg));
float ao = mix(dP.b, gP.b, veg);
float rgh = mix(0.95, 0.9, veg);
col = mix(col, jungleC, wJungle * veg);
tn = normalize(mix(tn, unpackNP(jP), wJungle * veg)); ao = mix(ao, jP.b, wJungle * veg);
col = mix(col, dirtC, wDirt * land);
tn = normalize(mix(tn, dTN, wDirt * land)); ao = mix(ao, dP.b, wDirt * land);
// sea floor near the shore: dark sand and silt
float sub = 1.0 - land;
col = mix(col, sandC * 0.8, sub);
// old lava rock and the reef shelf (wet algae on rock just under and at sea level)
float wRock = max(wRockB, sub * 0.5 * smoothstep(0.4, 0.7, nz2.r));
float reef = (1.0 - smoothstep(0.1, 0.9, y)) * smoothstep(-5.0, -0.6, y) * max(bm.a, 1.0 - wSand);
vec3 rockC = rockTopC;
rockC = mix(rockC, rockTopC * vec3(0.7, 1.05, 0.55) + vec3(0.03, 0.05, 0.01) * smoothstep(0.4, 0.7, nzm.g), reef);
rockC *= mix(1.0, 0.55, coast * (1.0 - smoothstep(0.6, 2.0, y)));
col = mix(col, rockC, wRock);
tn = normalize(mix(tn, rockTopN, wRock)); ao = mix(ao, rP.b, wRock);
rgh = mix(rgh, mix(0.75, 0.25, max(reef, coast * (1.0 - smoothstep(0.6, 2.0, y)))), wRock);
col = mix(col, sandC, wSand);
tn = normalize(mix(tn, sandN, wSand)); ao = mix(ao, sd.ao, wSand); rgh = mix(rgh, sandR, wSand);
col = mix(col, col * vec3(0.25, 0.3, 0.32), pool * wRock); rgh = mix(rgh, 0.05, pool * wRock);
tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), pool * wRock));

// fresh lava from the lava thread: glassy black pahoehoe where smooth, broken clinker where 'a'a
if (fresh > 0.01) {
  float rope = texture(tNoise, vW.xz / 1.6 + texture(tNoise, vW.xz / 11.0).rg * 0.6).r;
  vec3 pahoe = vec3(0.035, 0.033, 0.032) * (0.7 + rope * 0.6) + vec3(0.02, 0.016, 0.014) * smoothstep(0.7, 0.85, nzm.r);
  vec3 clink = rockTopC * 0.45 + vec3(0.03, 0.012, 0.006) * smoothstep(0.5, 0.8, nzm.b);
  vec3 lavC = mix(pahoe, clink, aa);
  vec3 ropeN = normalize(vec3((texture(tNoise, vW.xz / 1.6 + vec2(0.01, 0.0)).r - rope) * 9.0, (texture(tNoise, vW.xz / 1.6 + vec2(0.0, 0.01)).r - rope) * 9.0, 1.0));
  col = mix(col, lavC, fresh);
  tn = normalize(mix(tn, mix(ropeN, normalize(rockTopN * vec3(2.0, 2.0, 1.0)), aa), fresh));
  rgh = mix(rgh, mix(0.28, 0.97, aa), fresh);
}

// macro tonal variation so the slopes don't read flat at distance; erosion streaks down the fall line
col *= mix(0.8, 1.12, nz.g) * mix(0.9, 1.07, nz2.r);
col *= mix(1.0, mix(0.7, 1.25, smoothstep(0.3, 0.75, gully)), gK * (1.0 - wSand) * 0.8);
float midK = smoothstep(12.0, 40.0, camD) * (1.0 - smoothstep(150.0, 400.0, camD));
col *= mix(1.0, mix(0.82, 1.1, nzm.r) * mix(0.93, 1.05, nzm.b), midK);
// near: grit and pebbles
float grit = texture(tNoise, vW.xz / 0.55).g;
col *= mix(1.0, mix(0.8, 1.15, smoothstep(0.35, 0.8, grit)), (1.0 - smoothstep(6.0, 30.0, camD)) * 0.5 * (1.0 - wSand));

// snow on the summit
vec3 snowC = vec3(0.86, 0.88, 0.92) * mix(0.9, 1.04, nzm.g);
col = mix(col, snowC, snow);
tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), snow * 0.6));
rgh = mix(rgh, 0.55, snow);

vec3 wN = topToWorld(tn, Ng);
wN = normalize(mix(wN, cliffN, wCliff));
// the gully sides catch the light
float gd = (texture(tNoise, gq + vec2(0.01, 0.0)).r - texture(tNoise, gq - vec2(0.01, 0.0)).r) * 3.0;
wN = normalize(wN + vec3(-fall.y, 0.0, fall.x) * gd * 2.5 * gK * (1.0 - wCliff));
col = mix(col, mix(cliffC, snowC, snow * 0.7), wCliff);
ao = mix(ao, cliffAO, wCliff);
rgh = mix(rgh, cliffR, wCliff);
// the sea floor fades into deep blue water with depth (the sky dome below the horizon matches)
col = mix(col, vec3(0.012, 0.04, 0.06), smoothstep(-1.0, -25.0, y));
// weather: rain darkens and glosses everything but the sea floor
col *= mix(1.0, 0.7, uWet * land);
rgh = mix(rgh, rgh * 0.45, uWet * land);
gN = wN; gAO = ao; gR = rgh;
diffuseColor.rgb = col;
`).replace(`#include <roughnessmap_fragment>`,`float roughnessFactor = clamp(gR, 0.04, 1.0);`).replace(`#include <normal_fragment_maps>`,`normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);`).replace(`#include <aomap_fragment>`,`
float ambientOcclusion = gAO;
reflectedLight.indirectDiffuse *= ambientOcclusion;
reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, 0.5);
reflectedLight.indirectSpecular *= ambientOcclusion;`)},c.customProgramCacheKey=()=>`kaiele-ground`;let u=new b;for(let t of io(e,n)){let e=new N(t,c);e.receiveShadow=!0,u.add(e)}return u.userData.material=c,u}var oo={0:`coral`,1:`sand`,2:`wetsand`,3:`lavarock`,4:`dirt`,5:`mud`,6:`wetrock`,7:`planks`,8:`grass`,9:`reef`,10:`whitesand`,11:`coral`},so={coral:`coral`,sand:`sand`,wetsand:`sand`,whitesand:`sand`,lavarock:`rock`,wetrock:`rock`,reef:`rock`,dirt:`dirt`,mud:`mud`,planks:`planks`,grass:`grass`},co=8,lo=10,uo=[-1.6,-1.25,-1,-.85,-.7,-.55,-.4,-.25,-.12,0,.12,.25,.4,.55,.7,.85,1,1.25,1.6];function fo(e,t,n,r){let i=n.centre,a=i.length,o=n.width,s=n.closed,c=n.shared||[],l=n.surf||[],u=.12+Math.max(0,r.terrainStep-2)*.06,d=s?a+1:a,f=uo.length,p=new Float32Array(d*f*3),m=new Float32Array(d),h=0;for(let t=0;t<d;t++){let n=i[t%a],r=s?i[(t+1)%a]:i[Math.min(t+1,a-1)],c=s?i[(t-1+a)%a]:i[Math.max(t-1,0)],l=r[0]-c[0],g=r[2]-c[2],_=Math.hypot(l,g)||1,v=-g/_,y=l/_;uo.forEach((r,i)=>{let a=n[0]+v*r*o/2,s=n[2]+y*r*o/2;p.set([a,e.heightAt(a,s)+u,s],(t*f+i)*3)}),m[t]=h,t<d-1&&(h+=Math.hypot(r[0]-n[0],r[2]-n[2]))}let g=h,_=e=>oo[l[e]??0]||`coral`,v=[];for(let e=0;e<a;e++){let t=_(e);v.length&&v[v.length-1].k===t?v[v.length-1].b=e+1:v.push({k:t,a:e,b:e+1})}for(let e=0;e<2;e++){let e=[];for(let t of v)e.length&&(t.b-t.a<lo||e[e.length-1].k===t.k)?e[e.length-1].b=t.b:e.push({...t});v=e}if(s&&v.length>1&&v[0].k===v[v.length-1].k){let e=v.pop();v[0].a=e.a-a}let x=s&&v.length===1,S={};for(let e of v){let t=S[e.k]||={pos:[],uv:[],fade:[],idx:[]},n=x?0:e.a-co,r=x?a:e.b+co,l=t.pos.length/3;for(let i=n;i<=r;i++){let n=i;n=s?(i%a+a)%a:Math.min(Math.max(i,0),a-1);let r=x?1:Math.min(y.smoothstep(i,e.a-co,e.a+co),1-y.smoothstep(i,e.b-co,e.b+co));!s&&(i<=0||i>=a-1)&&(r=0);let c=x&&i===a?a:n;for(let e=0;e<f;e++){let l=(c*f+e)*3;t.pos.push(p[l],p[l+1],p[l+2]),t.uv.push(s?m[n]+Math.floor(i/a)*g:m[n],uo[e]*o/2),t.fade.push(r)}}let u=r-n+1;for(let e=0;e<u-1;e++){let r=s?((n+e)%a+a)%a:Math.min(Math.max(n+e,0),a-1),o=s?(r+1)%a:Math.min(r+1,a-1);if(r!==o&&!(i[r][4]&&i[o][4])&&!c.some(([e,t])=>r>=e&&r+1<t))for(let n=0;n<f-1;n++){let r=l+e*f+n,i=r+1,a=r+f,o=a+1;t.idx.push(r,i,a,i,o,a)}}}let C=new b;for(let[n,i]of Object.entries(S)){if(!i.idx.length)continue;let a=new I;a.setAttribute(`position`,new P(i.pos,3)),a.setAttribute(`uv`,new P(i.uv,2)),a.setAttribute(`fade`,new P(i.fade,1)),a.setIndex(i.idx),a.computeVertexNormals(),a.computeBoundingSphere();let s=new N(a,yo(e,t,n,o,r));s.receiveShadow=!0,s.renderOrder=1,C.add(s)}return C}var po={coral:`
vec2 uv = vec2(along, lat) / 3.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
// crushed coral and limestone: bright, packed grey-white in the wheel tracks, loose and whiter on the crown
col = mix(A.rgb, vec3(lum3(A.rgb)), 0.3) * vec3(0.55, 0.52, 0.47);
col *= mix(1.0, 0.72, clamp(rut, 0.0, 1.0) * 0.7);
col = mix(col, col * vec3(0.95, 0.85, 0.75), smoothstep(0.55, 0.8, nzf.g) * 0.5); // red dirt worked up through it
tn = normalize(mix(unpackNP(Pk), vec3(0, 0, 1), clamp(rut, 0.0, 1.0) * 0.6));
tn.y += rutD * 0.05;
ao = Pk.b; rgh = mix(A.a * 0.3 + 0.65, 0.6, clamp(rut, 0.0, 1.0));
float stones = smoothstep(0.72, 0.8, texture(tNoise, vW.xz / 0.7).r) * (1.0 - clamp(rut, 0.0, 1.0));
col = mix(col, vec3(0.85, 0.84, 0.8), stones * 0.5);
POTHOLES(0.62, 0.55, 0.48)
edgeW = 1.0;`,sand:`
SANDKIND
float ax = abs(lat);
float onRoad = 1.0 - smoothstep(uHalfW * 0.8, uHalfW * 1.15, ax + (nzf.b - 0.5) * 2.0);
float trod = onRoad * 0.92;
vec2 sh = texture(tX, vW.xz / uExtent + 0.5).rg;
Sand sd = sandAt(tA, tP, tNoise, vW, sh.r * 64.0 - 8.0, sh.g * 1.25, white, trod, camD, wetX);
// relief h (m) and its slope along and across; tread fades out once a lug is under a pixel
float hR = 0.0, hL = 0.0, hA = 0.0, tr = 0.0;
float lugK = 1.0 - smoothstep(0.012, 0.035, fwidth(along));
for (int k = 0; k < 4; k++) for (int m = 0; m < 3; m++) {
  // each wheel line: three trucks' tracks wandering about it (sines: no texture lookups in the loop)
  float fk = float(k), fm = float(m);
  float off = (fk - 1.5) * 1.75 + (k > 1 ? 0.25 : -0.25) + (sin(along / (23.0 + fk * 3.0) + fk * 1.7 + fm * 2.3) * 0.45 + sin(along / (9.1 + fm) + fm * 4.1 + fk) * 0.15) * (0.4 + fm * 0.5);
  float w = 0.19 + 0.04 * fm;
  float dep = (0.055 + 0.02 * sin(along / 6.3 + fk * 2.0 + fm)) * (1.0 - fm * 0.25);
  float d = l - off;
  float g = exp(-d * d / (w * w));
  float bw = w * 0.7, bd = (abs(d) - w * 1.6) / bw, be = exp(-bd * bd) * 0.55;
  hR += -g * dep + be * dep;
  hL += (2.0 * d / (w * w) * g - 2.0 * bd / bw * sign(d) * be) * dep;
  // lugs: a chevron across the tyre, 11 cm pitch, printed in the rut's floor (crisp only in the latest track)
  float ph = (along + abs(d) * 0.7 + fm * 0.05) * 6.283 / 0.11;
  hA += cos(ph) * 6.283 / 0.11 * 0.0035 * smoothstep(0.5, 0.9, g) * lugK * (1.0 - fm * 0.6); // older tracks: worn lugs
  tr = max(tr, g * (1.0 - fm * 0.2));
}
// churned sand between the ruts, and the loose heaps along the edges
vec2 cq = vW.xz / 0.7;
float c0 = texture(tNoise, cq).r, cx = texture(tNoise, cq + vec2(0.02, 0.0)).r, cz = texture(tNoise, cq + vec2(0.0, 0.02)).r;
float churn = onRoad * (0.5 + 0.5 * nzf.g) * (1.0 - tr * 0.5);
float ed = (ax - uHalfW * (0.82 + 0.12 * nzf.r)) / 0.9, heap = exp(-ed * ed) * (0.6 + 0.8 * nzf.g);
hL += -2.0 * ed / 0.9 * heap * 0.08 * sign(lat);
float relief = onRoad * RELIEF;
tn = normalize(vec3(-hA * relief, -hL * relief, 1.0));
rW = sd.tn.xy + vec2(c0 - cx, c0 - cz) * (churn * 4.5 + heap * 4.0) * (1.0 - wetX * 0.75); // packed wet sand barely churns
col = sd.col;
// rut floors are packed and a shade darker (damper sand from below); berms and heaps loose, dry, a touch paler
col *= mix(1.0, RUTCOL * (0.8 + 0.4 * c0), tr * onRoad);
col *= 1.0 + (heap * 0.12 + max(hR, 0.0) * 2.0) * (1.0 - sd.wet);
ao = sd.ao * (1.0 - tr * onRoad * 0.2) * (1.0 - heap * 0.1);
rgh = mix(sd.rgh, RUTRGH, tr * onRoad);
gritK = 0.0;
// the ground's macro breakup (terrain.js), so the colour matches across the soft edge
col *= mix(0.8, 1.12, texture(tNoise, vW.xz / 240.0).g) * mix(0.9, 1.07, texture(tNoise, vW.xz / 37.0).r);
vec3 nzm7 = texture(tNoise, vW.xz / 7.0).rgb;
col *= mix(1.0, mix(0.82, 1.1, nzm7.r) * mix(0.93, 1.05, nzm7.b), smoothstep(12.0, 40.0, camD) * (1.0 - smoothstep(150.0, 400.0, camD)));
edgeW = 4.5;`,dirt:`
vec2 uv = vec2(along, lat) / 4.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
col = mix(A.rgb, vec3(lum3(A.rgb)) * vec3(1.8, 0.7, 0.4), 0.6);
col *= mix(1.0, 0.7, clamp(rut, 0.0, 1.0) * 0.8);
tn = normalize(mix(unpackNP(Pk), vec3(0, 0, 1), clamp(rut, 0.0, 1.0) * 0.5));
tn.y += rutD * 0.1;
ao = Pk.b; rgh = mix(0.9, 0.7, clamp(rut, 0.0, 1.0));
// the jungle floor creeps in from the verges: leaf litter and roots at the edge
col = mix(col, col * vec3(0.55, 0.5, 0.35), smoothstep(uHalfW - 2.5, uHalfW, abs(lat) + (nzf.b - 0.5) * 2.0) * 0.7);
PUDDLES(0.62, 0.17, 0.09, 0.05)
edgeW = 1.5;`,mud:`
vec2 uv = vec2(along, lat) / 3.5;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
col = mix(A.rgb, vec3(lum3(A.rgb)) * vec3(1.5, 0.75, 0.5), 0.5) * 0.7;
float sq = texture(tNoise, vec2(lat / 0.9, along / 2.5)).g;
tn = normalize(unpackNP(Pk) * vec3(1.0, 1.0, 0.7) + vec3(0.0, (sq - 0.5) * 0.6, 0.0));
tn.y += rutD * 0.2;
col *= mix(1.0, 0.65, clamp(rut, 0.0, 1.0));
ao = Pk.b; rgh = mix(0.45, 0.22, clamp(rut, 0.0, 1.0));
PUDDLES(0.5, 0.12, 0.07, 0.045)
edgeW = 2.0;`,grass:`
vec2 uv = vec2(along, lat) / 3.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
vec4 B = texAT(tB, uv * 0.8, nzf.g), Bp = texAT(tBP, uv * 0.8, nzf.g);
vec3 grass = A.rgb * vec3(0.78, 0.98, 0.6);
vec3 dirt = mix(B.rgb, vec3(lum3(B.rgb)) * vec3(1.7, 0.75, 0.45), 0.55) * 0.85;
// a double track: worn red-dirt wheel lines with grass between and on the crown, flattened grass beside them
float worn = clamp(rut * 1.3 - 0.15 + (nzf.r - 0.5) * 0.5, 0.0, 1.0);
col = mix(grass, dirt, worn);
col = mix(col, grass * vec3(1.12, 1.05, 0.8), (1.0 - worn) * smoothstep(0.4, 0.0, rut) * 0.3);
tn = normalize(mix(unpackNP(Pk), unpackNP(Bp), worn));
tn.y += rutD * 0.08;
ao = mix(Pk.b, Bp.b, worn); rgh = 0.9;
edgeW = 3.0;`,rock:`
vec2 uv = vec2(along, lat) / 5.0;
vec4 A = texAT(tA, uv, nzf.r), Pk = texAT(tP, uv, nzf.r);
col = vec3(pow(lum3(A.rgb), 0.75) * 0.42) * vec3(2.3, 2.2, 2.1);
tn = unpackNP(Pk) * vec3(1.4, 1.4, 1.0);
ao = Pk.b; rgh = 0.8;
ROCKKIND
edgeW = 2.5;`,planks:`
// boards laid across the line of travel
vec2 uv = vec2(lat / 3.0, along / 3.0);
vec4 A = texture(tA, uv), Pk = texture(tP, uv);
col = A.rgb * vec3(0.95, 0.9, 0.85) * mix(1.0, 0.75, clamp(rut, 0.0, 1.0) * 0.6);
tn = unpackNP(Pk);
ao = Pk.b; rgh = mix(A.a, 0.6, 0.4);
edgeW = 0.6;`},mo={lavarock:`col *= 0.9; rgh = 0.92;`,wetrock:`col *= 0.55; rgh = 0.22; tn = normalize(mix(tn, vec3(0,0,1), 0.3));`,reef:`col = mix(col * vec3(0.75, 1.05, 0.6), col * vec3(1.1, 0.95, 0.7), smoothstep(0.4, 0.7, nzf.g)) * 0.75 + vec3(0.01, 0.025, 0.005) * smoothstep(0.5, 0.8, texture(tNoise, vW.xz / 1.7).r);
rgh = 0.25;
float pool = smoothstep(0.64, 0.7, texture(tNoise, vec2(along / 7.0, lat / 7.0 + 0.3)).b);
col = mix(col, col * vec3(0.3, 0.4, 0.42), pool); rgh = mix(rgh, 0.04, pool); tn = normalize(mix(tn, vec3(0,0,1), pool));`},ho={sand:{k:`float white = 0.0, wetX = 0.0;`,relief:`2.4`,rutcol:`0.85`,rutrgh:`sd.rgh * 0.9`},wetsand:{k:`float white = 0.0, wetX = 0.75;`,relief:`1.0`,rutcol:`0.7`,rutrgh:`0.06`},whitesand:{k:`float white = 1.0, wetX = 0.0;`,relief:`2.4`,rutcol:`0.86`,rutrgh:`sd.rgh * 0.9`}},go=(e,t,n)=>`
float ph = texture(tNoise, vec2(along / 9.0, lat / 9.0 + 0.6)).b;
float pot = smoothstep(0.7, 0.8, ph) * (1.0 - clamp(rut, 0.0, 1.0) * 0.7) * (1.0 - smoothstep(uHalfW - 1.5, uHalfW, abs(lat)));
col = mix(col, col * vec3(${e}, ${t}, ${n}), pot * 0.6);
vec2 pg = vec2(texture(tNoise, vec2((along + 0.3) / 9.0, lat / 9.0 + 0.6)).b - ph, texture(tNoise, vec2(along / 9.0, (lat + 0.3) / 9.0 + 0.6)).b - ph);
tn = normalize(tn + vec3(pg * 6.0 * smoothstep(0.65, 0.8, ph), 0.0));`,_o=(e,t,n,r)=>`
float pw = texture(tNoise, vec2(along / 11.0, lat / 6.0 + 0.2)).b * 0.75 + clamp(rut, 0.0, 1.0) * 0.3 + uWet * 0.25;
float pud = smoothstep(${e} + 0.12, ${e} + 0.16, pw) * (1.0 - smoothstep(uHalfW - 2.0, uHalfW, abs(lat)));
float rim = smoothstep(${e} + 0.06, ${e} + 0.12, pw) - pud;
col = mix(col, col * 0.6, rim); rgh = mix(rgh, 0.35, rim);
col = mix(col, vec3(${t}, ${n}, ${r}) * 0.6, pud); rgh = mix(rgh, 0.03, pud); tn = normalize(mix(tn, vec3(0,0,1), pud)); ao = mix(ao, 1.0, pud);`,vo={grass:`dirt`};function yo(e,t,n,r,i){let a=i.aiLod?4:8,o=Za(so[n],a),s=new h({side:2,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2,envMapIntensity:.9});s.userData.wx=`road`;let c={tA:{value:o.a},tP:{value:o.p},tNoise:{value:t.noise},uHalfW:{value:r/2},uWet:{value:0}};if(vo[n]){let e=Za(vo[n],a);c.tB={value:e.a},c.tBP={value:e.p}}let l=!!ho[n];l&&Object.assign(c,{tX:{value:$a(e)},uExtent:{value:e.extent}}),s.userData.uniforms=c,l&&i.terrainStep>3&&(s.defines={SAND_LO:``});let u=po[po[n]?n:ho[n]?`sand`:`rock`].replace(`SANDKIND`,ho[n]?.k||``).replace(/RELIEF/g,ho[n]?.relief||`1.0`).replace(`RUTCOL`,ho[n]?.rutcol||`1.0`).replace(`RUTRGH`,ho[n]?.rutrgh||`rgh`).replace(`ROCKKIND`,mo[n]||``).replace(/POTHOLES\(([^)]*)\)/,(e,t)=>go(...t.split(`,`).map(e=>e.trim()))).replace(/PUDDLES\(([^)]*)\)/,(e,t)=>_o(...t.split(`,`).map(e=>e.trim())));return s.onBeforeCompile=e=>{Object.assign(e.uniforms,c),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute float fade; varying vec3 vW; varying vec2 vT; varying float vFade;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vW = (modelMatrix * vec4(transformed,1.0)).xyz; vT = uv; vFade = fade;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vW; varying vec2 vT; varying float vFade;
uniform sampler2D tNoise, tA, tP${vo[n]?`, tB, tBP`:``}${l?`, tX`:``}; uniform float uHalfW, uWet${l?`, uExtent`:``};
${eo}
${l?to:``}
vec3 rN; float rAO; float rR; vec2 rW = vec2(0.0);`).replace(`#include <map_fragment>`,`
float along = vT.x, lat = vT.y;
vec3 nz = texture(tNoise, vec2(along / 300.0, 0.3)).rgb;
vec3 nzf = texture(tNoise, vW.xz / 23.0).rgb;
// racing lines wander slowly along the lap; four wheel tracks
float l = lat - (nz.r - 0.5) * 5.0;
float rut = 0.0, rutD = 0.0;
for (int k = 0; k < 4; k++) {
  float off = (float(k) - 1.5) * 1.75 + (k > 1 ? 0.25 : -0.25);
  float w = 0.32 + 0.12 * nzf.g;
  float g = exp(-pow((l - off) / w, 2.0));
  rut += g;
  rutD += -2.0 * (l - off) / (w * w) * g;
}
vec3 col; vec3 tn; float ao = 1.0, rgh = 0.9, edgeW = 1.0, gritK = 1.0;
float camD = length(vW - cameraPosition);
${u}
// close detail: grit
col *= mix(1.0, mix(0.85, 1.12, texture(tNoise, vW.xz / 0.45).g), (1.0 - smoothstep(5.0, 25.0, camD)) * 0.6 * gritK);
// weather: wet roads darken and gloss
col *= mix(1.0, 0.72, uWet); rgh = mix(rgh, rgh * 0.4, uWet);
rN = normalize(tn); rAO = ao; rR = rgh;
diffuseColor.rgb = col;
float fadeE = 1.0 - smoothstep(uHalfW + 0.3 - edgeW * 0.3, uHalfW + edgeW, abs(lat) + (nzf.b - 0.5) * (2.0 + edgeW));
// always gone before the ribbon's own edge (1.6 half-widths out), or a wide soft edge shows as a hard line
fadeE *= 1.0 - smoothstep(uHalfW * 1.6 - 1.2, uHalfW * 1.6 - 0.15, abs(lat));
diffuseColor.a = fadeE * vFade;
`).replace(`#include <roughnessmap_fragment>`,`float roughnessFactor = clamp(rR, 0.03, 1.0);`).replace(`#include <normal_fragment_maps>`,`
// ribbon uv: x along track, y across. Build TBN from screen derivatives.
vec3 q0 = dFdx(vW), q1 = dFdy(vW);
vec2 st0 = dFdx(vT), st1 = dFdy(vT);
vec3 Nw = normalize(cross(q0, q1)); if (Nw.y < 0.0) Nw = -Nw;
vec3 q1p = cross(q1, Nw), q0p = cross(Nw, q0);
vec3 Tt = q1p * st0.x + q0p * st1.x;
vec3 Bt = q1p * st0.y + q0p * st1.y;
float det = max(dot(Tt, Tt), dot(Bt, Bt));
float isc = det == 0.0 ? 0.0 : inversesqrt(det);
vec3 wn = normalize(Tt * isc * rN.x + Bt * isc * rN.y + Nw * rN.z);
wn = normalize(wn + vec3(rW.x, 0.0, rW.y) * Nw.y); // world-space detail (the beach sand's ripples and grain)
normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`).replace(`#include <aomap_fragment>`,`
reflectedLight.indirectDiffuse *= rAO;
reflectedLight.indirectSpecular *= mix(rAO, 1.0, 0.5);`)},s.customProgramCacheKey=()=>`kaiele-road-${n}`,s}var bo=`./`;async function xo(e){let{renderer:n,scene:r,sun:i,fog:s,sunLight:c}=e,[l,u]=await Promise.all([new _e().loadAsync(`${bo}textures/kaiele/sky.webp`),fetch(`${bo}textures/kaiele/sky.json`).then(e=>e.json())]);l.colorSpace=``,l.wrapS=a,l.generateMipmaps=!0,l.minFilter=se,l.anisotropy=4;let d=(u.u-.5)*Math.PI*2,f=Math.atan2(i.z,i.x),p=y.degToRad(u.elev);i.set(Math.cos(f)*Math.cos(p),Math.sin(p),Math.sin(f)*Math.cos(p)).normalize(),r.traverse(e=>{e.material?.uniforms?.tSky&&e.renderOrder===-10&&(e.visible=!1)});let h=new o(.66,.79,.93),g={tSky:{value:l},uLmax:{value:u.lmax},uRot:{value:(f-d)/(Math.PI*2)},uBelow:{value:u.below},uSun:{value:i},uHaze:{value:h},uSea:{value:new o(.03,.09,.13)},uExposure:{value:1.05},uCloud:{value:0},uSunDisc:{value:1}},_=new F({side:1,depthWrite:!1,fog:!1,uniforms:g,vertexShader:`varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,fragmentShader:`
      uniform sampler2D tSky; uniform float uLmax, uRot, uBelow, uExposure, uCloud, uSunDisc;
      uniform vec3 uSun, uHaze, uSea; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float elv = degrees(asin(clamp(d.y, -1.0, 1.0)));
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5 - uRot, 1.0 - (90.0 - max(elv, -uBelow + 0.5)) / (90.0 + uBelow));
        // explicit gradients: the atan seam would otherwise pick the smallest mip in a one-pixel line
        vec2 gx = dFdx(uv), gy = dFdy(uv); gx.x -= floor(gx.x + 0.5); gy.x -= floor(gy.x + 0.5);
        vec3 c = pow(textureGrad(tSky, uv, gx, gy).rgb, vec3(2.2)) * uLmax;
        // tropical grade: a deeper, more saturated blue overhead, clouds kept white
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float cloud = smoothstep(0.35, 0.9, l / max(c.b, 1e-3) * 1.1);
        vec3 blue = mix(vec3(l), c, 1.45) * vec3(0.8, 0.95, 1.12);
        c = mix(blue, mix(vec3(l), c, 0.7) * vec3(1.03, 1.01, 0.98), cloud);
        // the HDRI's horizon is a hazy grey veldt; ours is open ocean under bright trade-wind haze
        float h = smoothstep(-0.5, 9.0, elv);
        c = mix(uHaze * (0.95 + 0.15 * pow(max(dot(d, uSun), 0.0), 4.0)), c, h);
        c = mix(c, uSea, smoothstep(0.0, -3.0, elv));
        // the sun: hot disc and a soft aureole (the HDRI's own sun is clipped by the 8-bit encoding)
        float cs = dot(d, uSun);
        c += vec3(1.0, 0.93, 0.8) * (smoothstep(0.99996, 0.99999, cs) * 60.0 + pow(max(cs, 0.0), 300.0) * 2.0 + pow(max(cs, 0.0), 24.0) * 0.25) * uSunDisc * (1.0 - uCloud * 0.85);
        // weather: overcast greys and dims it
        c = mix(c, vec3(l) * vec3(0.78, 0.8, 0.84) * 0.6 + uHaze * 0.15, uCloud);
        gl_FragColor = vec4(c * uExposure, 1.0);
      }`});_.userData.wx=!1;let v=new N(new t(8500,64,32),_);v.renderOrder=-11,v.frustumCulled=!1,v.onBeforeRender=(e,t,n)=>v.position.copy(n.position),r.add(v);let b=new Ye(n),x=new m,S=new N(new t(50,48,24),_);x.add(S);let C=null,w=()=>{let e=g.uSunDisc.value;g.uSunDisc.value=0,C?.dispose(),C=b.fromScene(x,0,.1,200),g.uSunDisc.value=e,r.environment=C.texture};return w(),r.environmentIntensity=.75,s.color.copy(h).multiplyScalar(.92),s.density=13e-5,s.sun=3.3,c?.color.setRGB(1,.95,.86),{dome:v,uniforms:g,refreshEnv:w,update(){}}}var So=`./`,Co={T:7,L:34,R0:24,UP:.36},wo=(e,t)=>.35*Math.sin(e*.0047+t*.0031)+.25*Math.sin(e*.0123-t*.0094+1.7)+.12*Math.sin(e*.031+t*.027),To=e=>{let t=.5+.5*Math.sin(e*.8976);return .55+.2*(.5+.5*Math.sin(e*2.39996+.5))+.45*t*t*t},Eo=(e,t)=>e<Co.UP?t*(1-(1-e/Co.UP)**2):t*(1-((e-Co.UP)/(1-Co.UP))**1.6),Do=(e,t)=>1.3+1.1*e*t,Oo=`
#define SURF_T ${Co.T.toFixed(3)}
#define SURF_L ${Co.L.toFixed(3)}
#define SURF_R0 ${Co.R0.toFixed(3)}
#define SURF_UP ${Co.UP.toFixed(3)}
float surfOff(vec2 p) { return 0.35 * sin(p.x * 0.0047 + p.y * 0.0031) + 0.25 * sin(p.x * 0.0123 - p.y * 0.0094 + 1.7) + 0.12 * sin(p.x * 0.031 + p.y * 0.027); }
float waveAmp(float n) { float s = 0.5 + 0.5 * sin(n * 0.8976); return 0.55 + 0.2 * (0.5 + 0.5 * sin(n * 2.39996 + 0.5)) + 0.45 * s * s * s; }
float swashFront(float u, float R) { return u < SURF_UP ? R * (1.0 - pow(1.0 - u / SURF_UP, 2.0)) : R * (1.0 - pow((u - SURF_UP) / (1.0 - SURF_UP), 1.6)); }
float swashTop(float amp, float rs) { return 1.3 + 1.1 * amp * rs; }
`,ko=`
uniform sampler2D tSky; uniform float uSkyInt; uniform vec3 uHaze;
vec3 skyCol(vec3 d) {
  d.y = max(d.y, 0.0);
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 c = texture2D(tSky, uv).rgb * uSkyInt;
  float h = smoothstep(-0.04, 0.1, d.y);
  c = mix(uHaze, c, h * h * (3.0 - 2.0 * h) * 0.7 + 0.3 * h);
  return min(c, vec3(3.0));
}
// GGX, capped: a mirror-sharp glint must stay inside half-float range or the bloom turns it into a black hole
float ggx(float NH, float r) { float a = r * r, d = NH * NH * (a * a - 1.0) + 1.0; return min(a * a / (3.14159 * d * d), 400.0); }
`;function Ao(e){let t=null;return e.traverse(e=>{!t&&e.material?.uniforms?.tSky&&(t=e.material.uniforms)}),t}var jo=e=>e.ultra?3:e.aiLod?e.terrainStep>=4?0:1:2,Mo=null;function No(){if(Mo)return Mo;let e=new _e,t=t=>{let n=e.load(`${So}textures/kaiele/water/${t}`);return n.wrapS=n.wrapT=a,n.anisotropy=4,n};return Mo={nc:t(`water_nc.jpg`),foam:t(`water_foam.jpg`)},Mo}function Po(t,n,r){let{extent:i,half:a}=t,o=i/n,c=new Float32Array(n*n);for(let e=0;e<n;e++){let r=-a+(e+.5)*o;for(let i=0;i<n;i++)c[e*n+i]=t.heightAt(-a+(i+.5)*o,r)}let l=e=>{let t=new Float32Array(n*n);for(let r=0;r<n*n;r++)t[r]=e(r)?0:1e6;let r=Math.SQRT2;for(let e=0;e<n;e++)for(let i=0;i<n;i++){let a=e*n+i,o=t[a];o&&(i>0&&(o=Math.min(o,t[a-1]+1)),e>0&&(o=Math.min(o,t[a-n]+1),i>0&&(o=Math.min(o,t[a-n-1]+r)),i<n-1&&(o=Math.min(o,t[a-n+1]+r))),t[a]=o)}for(let e=n-1;e>=0;e--)for(let i=n-1;i>=0;i--){let a=e*n+i,o=t[a];o&&(i<n-1&&(o=Math.min(o,t[a+1]+1)),e<n-1&&(o=Math.min(o,t[a+n]+1),i<n-1&&(o=Math.min(o,t[a+n+1]+r)),i>0&&(o=Math.min(o,t[a+n-1]+r))),t[a]=o)}return t},u=l(e=>c[e]<=0),d=l(e=>c[e]>0),f=new Float32Array(n*n);for(let e=0;e<n;e++)for(let t=0;t<n;t++){let r=e*n+t,i=(c[r]>0?u[r]-.5:-(d[r]-.5))*o;if(Math.abs(i)<2.5*o&&t>0&&e>0&&t<n-1&&e<n-1){let e=(c[r+1]-c[r-1])/(2*o),t=(c[r+n]-c[r-n])/(2*o),a=Math.hypot(e,t);if(a>.001){let e=y.clamp(c[r]/a,-2.5*o,2.5*o);i=y.lerp(e,i,y.smoothstep(Math.abs(i),o,2.5*o))}}f[r]=y.clamp(i,-400,400)}let p=Math.max(2,Math.round(60/o)),m=e=>{let t=new Float32Array(n*n),r=new Float32Array(n*n);for(let r=0;r<n;r++){let i=0;for(let t=-p;t<=p;t++)i+=e[r*n+Math.min(Math.max(t,0),n-1)];for(let a=0;a<n;a++)t[r*n+a]=i,i+=e[r*n+Math.min(a+p+1,n-1)]-e[r*n+Math.max(a-p,0)]}for(let e=0;e<n;e++){let i=0;for(let r=-p;r<=p;r++)i+=t[Math.min(Math.max(r,0),n-1)*n+e];for(let a=0;a<n;a++)r[a*n+e]=i,i+=t[Math.min(a+p+1,n-1)*n+e]-t[Math.max(a-p,0)*n+e]}return r},h=new Float32Array(n*n),g=new Float32Array(n*n);for(let e=0;e<n*n;e++)h[e]=Math.max(-c[e],0),g[e]=+(c[e]<=0);let v=m(h),b=m(g),x=new Float32Array(n*n),S=new Float32Array(n*n),C=Math.max(1,Math.round(10/o));for(let e=0;e<n;e++)for(let t=0;t<n;t++){let r=e*n+t,i=b[r]>.5?v[r]/b[r]:0;x[r]=y.clamp((i-.1)/.65,.22,1.2);let a=Math.max(t-C,0),s=Math.min(t+C,n-1),l=Math.max(e-C,0),u=Math.min(e+C,n-1),d=(c[e*n+s]-c[e*n+a])/((s-a)*o),f=(c[u*n+t]-c[l*n+t])/((u-l)*o);S[r]=y.smoothstep(Math.hypot(d,f),.12,.55)}let w=x.slice(),T=new Float32Array(n*n);for(let e of r||[]){if(!e.reef)continue;let t=Math.ceil(70/o);for(let r=e.reef[0];r<=e.reef[1];r+=3){let i=e.at(r),s=Math.floor((i[0]+a)/o),c=Math.floor((i[2]+a)/o);for(let e=Math.max(c-t,0);e<=Math.min(c+t,n-1);e++)for(let r=Math.max(s-t,0);r<=Math.min(s+t,n-1);r++){let t=-a+(r+.5)*o,s=-a+(e+.5)*o,c=1-y.smoothstep(Math.hypot(t-i[0],s-i[2]),40,70),l=e*n+r;c>(T[l]||0)&&(x[l]=y.lerp(w[l],.52,c),T[l]=c)}}}let E=new Uint16Array(n*n*4),D=s.toHalfFloat;for(let e=0;e<n*n;e++)E[e*4]=D(c[e]),E[e*4+1]=D(f[e]),E[e*4+2]=D(x[e]),E[e*4+3]=D(S[e]);let O=new _(E,n,n,ae,e);return O.magFilter=O.minFilter=L,O.wrapS=O.wrapT=ze,O.needsUpdate=!0,{N:n,cell:o,h:c,sd:f,rs:x,steep:S,tex:O,sample:(e,t,r)=>{let i=(t+a)/o-.5,s=(r+a)/o-.5,c=Math.min(Math.max(Math.floor(i),0),n-2),l=Math.min(Math.max(Math.floor(s),0),n-2),u=y.clamp(i-c,0,1),d=y.clamp(s-l,0,1),f=l*n+c;return(e[f]*(1-u)+e[f+1]*u)*(1-d)+(e[f+n]*(1-u)+e[f+n+1]*u)*d}}}var Fo=class{constructor(e,{max:t=400,sun:n,sunCol:r,wind:i=new M(1.5,0,-.8),rainbow:a=!1,tint:s=[.86,.9,.93],fog:c}={}){this.max=t,this.i=0;let l=new De(1,1),u=new ve;u.index=l.index,u.attributes.position=l.attributes.position,u.attributes.uv=l.attributes.uv,this.a=new Float32Array(t*4),this.b=new Float32Array(t*4),this.c=new Float32Array(t*4),this.d=new Float32Array(t*2);for(let e=0;e<t;e++)this.a[e*4+3]=-1e4,this.c[e*4]=1,this.c[e*4+1]=1;let d=(e,t)=>{let n=new ke(e,t);return n.setUsage(O),n};this.attrs=[d(this.a,4),d(this.b,4),d(this.c,4),d(this.d,2)],u.setAttribute(`pa`,this.attrs[0]),u.setAttribute(`pb`,this.attrs[1]),u.setAttribute(`pc`,this.attrs[2]),u.setAttribute(`pd`,this.attrs[3]),u.instanceCount=t,this.fog=c,this.mat=new F({transparent:!0,depthWrite:!1,defines:a?{RAINBOW:1}:{},uniforms:{uTime:{value:0},tSmoke:{value:e.smoke},uSun:{value:n.clone()},uSunCol:{value:r.clone()},uWind:{value:i.clone()},uTint:{value:new o(...s)},uFogC:{value:new o(.66,.76,.86)},uFogD:{value:16e-5}},vertexShader:`
        attribute vec4 pa, pb, pc; attribute vec2 pd; uniform float uTime; uniform vec3 uWind;
        varying vec2 vUv; varying float vA; varying vec3 vR, vU, vF, vW; varying float vDepth, vSeed;
        void main() {
          float t = uTime - pa.w;
          float life = pc.x, k = pc.y;
          vA = t < 0.0 || t > life ? 0.0 : pow(1.0 - t / life, 1.4) * smoothstep(0.0, 0.06 * life + 0.02, t) * pc.w;
          vec3 W = vec3(uWind.x, -9.81 * pd.x / k, uWind.z);
          vec3 p = pa.xyz + W * t + (pb.xyz - W) * (1.0 - exp(-k * t)) / k;
          float size = min(pb.w * (1.0 + pc.z * t), 24.0);
          // turn with the seed so neighbouring puffs don't repeat the same sprite
          float ang = pd.y * 6.283 + t * (pd.y - 0.5) * 0.6;
          vec2 q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * position.xy;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          // fade puffs that reach the camera instead of letting the near plane slice them
          vDepth = -mv.z;
          // (a puff wrapped round the camera would also cost a full screen of fill: drop it)
          vA *= smoothstep(0.3 * size + 0.3, 0.8 * size + 0.6, vDepth);
          mv.xy += q * size;
          vUv = uv; vSeed = pd.y;
          vR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          vW = (inverse(viewMatrix) * mv).xyz;
          gl_Position = projectionMatrix * mv;
          if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,fragmentShader:`
        uniform sampler2D tSmoke; uniform vec3 uSun, uSunCol, uTint, uFogC; uniform float uFogD;
        varying vec2 vUv; varying float vA; varying vec3 vR, vU, vF, vW; varying float vDepth, vSeed;
        vec3 hue(float h) { return clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0); }
        void main() {
          vec4 s = texture2D(tSmoke, vUv);
          float a = s.a * vA;
          if (a < 0.004) discard;
          vec3 n = normalize((s.r * 2.0 - 1.0) * vR + (s.g * 2.0 - 1.0) * vU + (s.b * 2.0 - 1.0) * vF);
          vec3 ray = normalize(vW - cameraPosition);
          float lit = clamp(dot(n, uSun) * 0.5 + 0.55, 0.0, 1.0);
          // water droplets scatter strongly forwards: spray glows when you look towards the sun through it
          float fwd = pow(max(dot(ray, uSun), 0.0), 6.0);
          vec3 c = uTint * (vec3(0.42, 0.5, 0.6) + uSunCol * (0.32 * lit + 0.9 * fwd));
          #ifdef RAINBOW
          float th = degrees(acos(clamp(dot(ray, -uSun), -1.0, 1.0)));
          float p1 = smoothstep(40.2, 41.0, th) * (1.0 - smoothstep(42.1, 42.7, th));
          float p2 = smoothstep(50.2, 51.0, th) * (1.0 - smoothstep(53.0, 53.8, th));
          vec3 bow = hue(clamp((42.5 - th) / 2.2, 0.0, 1.0) * 0.78) * p1 + hue(clamp((th - 50.3) / 3.4, 0.0, 1.0) * 0.78) * p2 * 0.4;
          c += bow * uSunCol * 0.32 * step(0.0, uSun.y);
          #endif
          float fog = 1.0 - exp(-uFogD * uFogD * vDepth * vDepth);
          c = mix(c, uFogC, fog);
          gl_FragColor = vec4(c, a);
        }`}),this.mat.userData.wx=!1,this.mesh=new N(u,this.mat),this.mesh.frustumCulled=!1,this.mesh.renderOrder=6}emit(e,t,n,r,i,a,o,s,c,{drag:l=1.2,grow:u=.6,opacity:d=.6,gravity:f=1}={}){let p=this.i++%this.max;this.a.set([t,n,r,e],p*4),this.b.set([i,a,o,s],p*4),this.c.set([c,l,u,d],p*4),this.d[p*2]=f,this.d[p*2+1]=Math.random(),this.dirty=!0}update(e){if(this.mat.uniforms.uTime.value=e,this.fog&&(this.mat.uniforms.uFogC.value.copy(this.fog.color),this.mat.uniforms.uFogD.value=this.fog.density),this.dirty){for(let e of this.attrs)e.needsUpdate=!0;this.dirty=!1}}},Io=new M,Lo=new M,Ro=[[1.02,1.62],[-1.02,1.62],[1.02,-1.55],[-1.02,-1.55]];function zo(e,t,n,r,i,a){let o=t.speed();if(o<2.5||i<.05||r<=0)return;let s=t.body.linvel(),c=Math.random,l=i*Math.min(o,40)*(a===0?.6:1.6)*r,u=Math.min(1,o/18);Ro.forEach(([r,i],o)=>{if(t.lostWheels?.has(o))return;let d=l*(.5+c());for(;d>c();){--d,Io.set(r,-.55,i),t.group.localToWorld(Io),Lo.set(r>0?1:-1,0,0).transformDirection(t.group.matrixWorld);let a=1.5+c()*3.5*u;e.emit(n,Io.x,Io.y,Io.z,s.x*.45+Lo.x*a+(c()-.5)*2,1.5+c()*3.5*u,s.z*.45+Lo.z*a+(c()-.5)*2,.35+c()*.6,.7+c()*.7,{drag:1.4,grow:1.6,opacity:.55,gravity:1})}a>0&&c()<l*.12&&(Io.set(r,-.3,i),t.group.localToWorld(Io),e.emit(n,Io.x,Io.y,Io.z,s.x*.3,1+c(),s.z*.3,1.2+c(),1.4+c(),{drag:2.5,grow:1.4,opacity:.28,gravity:.05}))})}function Bo(e){let{world:t,scene:n,quality:r,sun:i,M:a}=e,o=jo(r),s=t.data.water?.sea??0,c=Po(t,o>=2?2048:1024,e.tracks);e.coast=c;let l=No(),u=Ao(n),d=new M(1,.96,.88).multiplyScalar(e.sunLight?.intensity??3),f=new _e().load(`${So}${t.dir}/biome.png`),p=o===0?3:o===1?5:7,m=[[95,.42,3.75],[61,.3,3.4],[40,.2,4.15],[27,.13,3],[17,.075,4.6],[11,.045,2.6],[7,.025,4]].slice(0,p).map(([e,t,n],r)=>{let i=2*Math.PI/e;return new Ve(Math.cos(n),Math.sin(n),i,t)}),h=m.map(e=>Math.sqrt(9.81*e.z)),g=o===0?900:1400,_={uTime:{value:0},uExtent:{value:t.extent},uCell:{value:c.cell},uSea:{value:s},tCoast:{value:c.tex},tNC:{value:l.nc},tFoam:{value:l.foam},tBiome:{value:f},tSky:{value:u?.tSky.value??null},uSkyInt:u?.uInt??{value:.85},uHaze:{value:e.fog.color},uSun:{value:i.clone()},uSunCol:{value:d},uWave:{value:m},uOmega:{value:h},uNear:{value:g},...Ie.clone(Ge.fog)},v={NW:p,TIER:o},b=`
    #include <common>
    #include <fog_pars_vertex>
    uniform sampler2D tCoast; uniform float uTime, uExtent, uSea, uNear;
    uniform vec4 uWave[NW]; uniform float uOmega[NW];
    varying vec3 vW; varying float vH;
    ${Oo}
    // the shore wave: crest profile over one cycle (crest at f = 0), steep front, long back
    float crest(float f) { return f > 0.84 ? pow((f - 0.84) / 0.16, 2.0) : pow(1.0 - min(f / 0.55, 1.0), 2.0); }
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float r = length(wp.xz - cameraPosition.xz);
      vec3 p = vec3(wp.x, uSea, wp.z);
      #ifndef FAR
      vec4 c = texture2D(tCoast, wp.xz / uExtent + 0.5);
      float depth = uSea - c.r, sd = c.g;
      float fade = 1.0 - smoothstep(uNear * 0.6, uNear * 0.95, r);
      // swell flattens out over the shallows
      float att = smoothstep(0.6, 14.0, depth) * fade;
      vec3 d = vec3(0.0);
      for (int i = 0; i < NW; i++) {
        vec4 w = uWave[i];
        float th = w.z * dot(w.xy, wp.xz) - uOmega[i] * uTime + float(i) * 1.7;
        float q = min(0.6 / (w.z * w.w * float(NW)), 1.0);
        d.xz += q * w.w * w.xy * cos(th);
        d.y += w.w * sin(th);
      }
      p += d * att;
      // shore waves: shoal (grow) inside ~8 m of depth, break once the face is too tall for the water under it
      float zone = smoothstep(-190.0, -70.0, sd) * fade;
      float ph = uTime / SURF_T - sd / SURF_L + surfOff(wp.xz);
      float n = floor(ph + 0.5), f = fract(ph);
      float A0 = 0.42 * waveAmp(n) * (1.0 + 0.7 * smoothstep(8.0, 1.5, depth));
      float A = min(A0, 0.42 * max(depth, 0.0) + 0.06);
      p.y += A * (crest(f) - 0.24) * zone;
      #endif
      vW = p;
      vH = p.y - uSea;
      vec4 mvPosition = viewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,x=`
    #include <common>
    #include <fog_pars_fragment>
    uniform sampler2D tCoast, tNC, tFoam, tBiome; uniform float uTime, uExtent, uCell, uSea, uNear;
    uniform vec3 uSun, uSunCol;
    uniform vec4 uWave[NW]; uniform float uOmega[NW];
    varying vec3 vW; varying float vH;
    ${Oo}
    ${ko}
    float crest(float f) { return f > 0.84 ? pow((f - 0.84) / 0.16, 2.0) : pow(1.0 - min(f / 0.55, 1.0), 2.0); }
    float dcrest(float f) { return f > 0.84 ? 2.0 * (f - 0.84) / 0.0256 : -2.0 * (1.0 - min(f / 0.55, 1.0)) / 0.55 * step(f, 0.55); }
    void main() {
      vec2 xz = vW.xz;
      vec3 V = cameraPosition - vW;
      float dist = length(V); V /= dist;
      vec2 uvC = xz / uExtent + 0.5;
      vec4 c = texture2D(tCoast, uvC);
      float sd = c.g, steep = c.a;
      float depth = uSea + vH - c.r;
      float far = smoothstep(150.0, 1800.0, dist);
      // fine detail fades out early, harder at grazing angles, before it aliases into glitter
      float fine = smoothstep(40.0, 500.0, dist) + smoothstep(0.8, 0.985, 1.0 - V.y) * 0.5;
      // ---- shore waves (same phase as the vertex shader and the swash)
      float zone = smoothstep(-190.0, -70.0, sd);
      float ph = uTime / SURF_T - sd / SURF_L + surfOff(xz);
      float n = floor(ph + 0.5), f = fract(ph);
      float amp = waveAmp(n);
      float A0 = 0.42 * amp * (1.0 + 0.7 * smoothstep(8.0, 1.5, depth));
      float A = min(A0, 0.42 * max(depth, 0.0) + 0.06);
      // breaking is strongest where the wave first trips; far shallower (reef flats) only small bores are left
      float bx = 2.0 * A0 / max(depth, 0.05);
      float brk = smoothstep(0.75, 1.25, bx) * (1.0 - 0.7 * smoothstep(2.5, 6.0, bx)) * zone;
      // ---- normal: swell slopes, shore wave slope along the distance gradient, two scales of chop
      vec2 sl = vec2(0.0);
      float att = smoothstep(0.6, 14.0, depth) * (1.0 - far * 0.85);
      for (int i = 0; i < NW; i++) {
        vec4 w = uWave[i];
        float th = w.z * dot(w.xy, xz) - uOmega[i] * uTime + float(i) * 1.7;
        sl += w.xy * (w.w * w.z * cos(th)) * (i > 2 ? max(1.0 - fine, 0.0) : 1.0);
      }
      sl *= att;
      float e = uCell * 1.5;
      vec2 gsd = vec2(texture2D(tCoast, uvC + vec2(e / uExtent, 0.0)).g - texture2D(tCoast, uvC - vec2(e / uExtent, 0.0)).g,
                      texture2D(tCoast, uvC + vec2(0.0, e / uExtent)).g - texture2D(tCoast, uvC - vec2(0.0, e / uExtent)).g) / (2.0 * e);
      sl += gsd * (-A * dcrest(f) / SURF_L) * zone * (1.0 - far);
      float tt = uTime;
      vec2 n1 = texture2D(tNC, xz / 21.0 + vec2(tt * 0.011, tt * 0.017)).rg * 2.0 - 1.0;
      vec2 n2 = texture2D(tNC, xz / 6.7 + vec2(-tt * 0.031, tt * 0.022)).rg * 2.0 - 1.0;
      #if TIER > 0
      vec2 n3 = texture2D(tNC, xz / 83.0 + vec2(tt * 0.004, -tt * 0.006)).rg * 2.0 - 1.0;
      #else
      vec2 n3 = vec2(0.0);
      #endif
      float chop = mix(0.2, 0.06, min(fine, 1.0)) * (1.0 - 0.6 * smoothstep(1.5, 0.0, depth));
      sl += (n1 * 0.6 * (1.0 - 0.5 * min(fine, 1.0)) + n2 * 0.25 * max(1.0 - fine, 0.0) + n3 * 0.7) * chop;
      vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
      // ---- foam
      float u = fract(uTime / SURF_T + surfOff(xz));
      float foamAmt = brk * (smoothstep(0.80, 0.985, f) * 1.1 + exp(-f * 6.0) * 1.2 + exp(-f * 2.2) * 0.35);
      // rocks and cliffs: the surge slams in as each bore arrives, then drains off as lacy foam
      foamAmt += steep * smoothstep(-22.0, -1.0, sd) * (1.0 - smoothstep(0.0, 3.0, sd)) * (0.35 + 1.4 * exp(-u * 4.0) * amp);
      // a ribbon of foam always clings to the waterline
      foamAmt += smoothstep(-5.0, -0.5, sd) * 0.45;
      vec2 fdrift = -normalize(gsd + 1e-5) * uTime * 0.25;
      vec3 ft = texture2D(tFoam, xz / 13.0 + fdrift * 0.08 + N.xz * 0.15).rgb;
      vec3 ft2 = texture2D(tFoam, xz / 37.0 - fdrift * 0.03).rgb;
      float fpat = mix(max(ft.r, ft2.r * 0.8) * 0.75 + ft.g * 0.25, ft2.r * 0.6 + 0.3, smoothstep(30.0, 250.0, dist));
      float foam = smoothstep(0.0, 0.45, foamAmt * 1.25 - (1.0 - fpat) * 1.1) * (1.0 - far * 0.6);
      foam = max(foam, clamp(foamAmt - 0.9, 0.0, 1.0) * 0.6);
      // and a soft milky wash of old foam and churned sand over the surf zone, never thresholded into speckle
      float lace = zone * smoothstep(2.5, 0.4, depth) * (0.25 + 0.5 * exp(-f * 3.0)) * (0.5 + 0.5 * fpat) * (1.0 - far);
      // ---- light
      vec3 L = uSun;
      float NV = max(dot(N, V), 1e-3);
      // capped: a rough sea never turns into a perfect mirror even at grazing angles
      float F = min(0.02 + 0.98 * pow(1.0 - NV, 5.0), 0.4);
      vec3 R = reflect(-V, N);
      // the unresolved small waves tilt towards the viewer, so a distant sea reflects sky well above the horizon
      // haze: lift the reflected ray instead of mirroring the white horizon
      R.y = max(R.y, 0.0) * 0.75 + 0.1;
      vec3 sky = skyCol(normalize(R)) * 0.85;
      vec3 H = normalize(V + L);
      float rough = mix(0.13, 0.22, far);
      float NL = max(dot(N, L), 0.0);
      vec3 spec = uSunCol * ggx(max(dot(N, H), 0.0), rough) * F * 0.25 / max(NV, 0.2) * NL * (1.0 - foam);
      // water body. Plain alpha blending can't absorb red more than blue, so the shader paints the sea floor itself
      // (its colour estimated from the same biome mask the terrain uses) filtered through the water column, and
      // lets the real terrain show through only in the first few tens of centimetres. Turquoise over white sand,
      // teal-black over the black sand and lava shelves, navy offshore.
      float dpt = max(depth, 0.0);
      vec3 amb = vec3(0.45, 0.55, 0.65) * 0.55;
      vec3 light = amb + uSunCol * 0.2 * max(L.y, 0.0);
      vec3 scatter = mix(vec3(0.02, 0.26, 0.27), vec3(0.003, 0.022, 0.06), 1.0 - exp(-dpt / 9.0)) * light;
      vec3 Tr = exp(-dpt * vec3(0.85, 0.16, 0.11));
      vec4 bm = texture2D(tBiome, uvC);
      vec3 sand = mix(vec3(0.07, 0.065, 0.06), vec3(0.78, 0.72, 0.6), bm.g);
      vec3 floorC = mix(vec3(0.13, 0.12, 0.1), sand, bm.r) * (amb + uSunCol * 0.3 * max(L.y, 0.0));
      #if TIER > 0
      vec2 cuv = (xz + N.xz * 0.6) / 5.5;
      float caus = min(texture2D(tNC, cuv + vec2(tt * 0.025, tt * 0.01)).b, texture2D(tNC, cuv * 0.83 - vec2(tt * 0.018, -tt * 0.02)).b);
      floorC += floorC * caus * 3.0 * uSunCol.r * 0.33 * max(L.y, 0.0) * smoothstep(0.05, 0.5, dpt) * exp(-dpt * 0.25) * (1.0 - far);
      #endif
      float Tm = dot(Tr, vec3(0.333));
      // the floor is lit through the water and seen back up through it: absorbed twice
      vec3 inside = floorC * Tr * Tr + scatter * (1.0 - Tm);
      // light through the thin top of a wave as it rears up, seen against the sun
      #if TIER > 1
      vec3 ray = -V;
      float back = pow(max(dot(normalize(ray.xz + 1e-4), normalize(L.xz)), 0.0), 3.0) * smoothstep(0.0, 0.6, vH);
      inside += vec3(0.04, 0.4, 0.3) * uSunCol * 0.08 * back * (1.0 - far);
      #endif
      float alpha = 1.0 - exp(-dpt * 3.5);
      vec3 water = inside * alpha;
      vec3 col = (1.0 - F) * water + F * sky + spec;
      float a = (1.0 - F) * alpha + F;
      vec3 foamCol = vec3(0.86, 0.9, 0.92) * (amb * 1.3 + uSunCol * 0.32 * (0.4 + 0.6 * NL));
      col = mix(col, foamCol, foam + lace * 0.22 * (1.0 - foam));
      a = mix(a, 1.0, foam + lace * 0.22 * (1.0 - foam));
      // soften the waterline where the surface meets the sand
      float edge = smoothstep(-0.02, 0.3, depth);
      col *= edge; a *= edge;
      gl_FragColor = vec4(col, a);
      #ifdef USE_FOG
      #include <fog_fragment>
      #endif
    }`,S=e=>{let t=new F({uniforms:_,defines:e?{...v,FAR:1}:v,vertexShader:b,fragmentShader:x,fog:!0,transparent:!0,depthWrite:!0,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205});return t.userData.wx=!1,t},C=o===0?96:o===1?160:256,w=2*Math.PI/C*.95,T=(o===0?1.2:o===1?.9:.7)/(Math.exp(w)-1),E=Math.ceil(Math.log(g/T+1)/w),D=[],O=[];for(let e=0;e<=E;e++){let t=Math.min(g,T*(Math.exp(w*e)-1));for(let e=0;e<C;e++){let n=e/C*Math.PI*2;D.push(Math.cos(n)*t,0,Math.sin(n)*t)}}for(let e=0;e<E;e++)for(let t=0;t<C;t++){let n=e*C+t,r=e*C+(t+1)%C,i=n+C,a=r+C;O.push(n,r,i,r,a,i)}let k=new I;k.setAttribute(`position`,new P(D,3)),k.setIndex(O);let te=new N(k,S(!1)),ne=new N(new ee(g*.97,8800,128,1).rotateX(-Math.PI/2),S(!0));for(let e of[te,ne])e.frustumCulled=!1,e.renderOrder=2,e.onBeforeRender=(t,n,r)=>{e.position.set(r.position.x,0,r.position.z),e.updateMatrixWorld()},n.add(e);let re=Vo(e,c,l,u,d,o);n.add(re.mesh);let A=new Fo(a,{max:o===0?260:900,sun:i,sunCol:d,fog:e.fog});n.add(A.mesh),e.spray=A;let ie=[];if(o>0){let e=new Set,{N:n,cell:r}=c;for(let i=1;i<n-1;i++)for(let a=1;a<n-1;a++){let o=i*n+a;if(c.steep[o]<.6||Math.abs(c.sd[o]+r)>r*.7)continue;let s=-t.half+(a+.5)*r,l=-t.half+(i+.5)*r,u=`${Math.floor(s/34)},${Math.floor(l/34)}`;e.has(u)||(e.add(u),ie.push({x:s,z:l,n:0,s:c.steep[o]}))}}let ae=0,j=Math.random,oe=(e,t)=>{let n=c.sample(c.sd,e.x,e.z);if(n>45)return 0;let r=c.sample(c.h,e.x,e.z),i=y.clamp((s-r)*3,0,1),a=c.sample(c.rs,e.x,e.z),o=t/Co.T+wo(e.x,e.z),l=Math.floor(o),u=To(l),d=Eo(o-l,Co.R0*a*u),f=Do(u,a),p=y.smoothstep(d-n,-.3,2.5)*y.smoothstep(f+.3-r,0,.5);return Math.max(p,i)},se=e=>oe(e,ae);return{wetness:se,coast:c,spray:A,update(r,i,a,c){if(ae=r,_.uTime.value=r,_.fogColor.value.copy(n.fog?.color??e.fog.color),_.fogDensity.value=n.fog?.density??e.fog.density,re.uniforms.uTime.value=r,re.uniforms.fogColor.value.copy(_.fogColor.value),re.uniforms.fogDensity.value=_.fogDensity.value,c&&i>0)for(let e of c.cars){let t=e.v,n=t.group.position;if(t.speed()<2.5)continue;let a=se(n);a<.08||zo(A,t,r,i,a,o)}if(ie.length&&a){let e=a.position.x,n=a.position.z;for(let i of ie){let a=i.x-e,o=i.z-n;if(a*a+o*o>176400)continue;let c=r/Co.T+wo(i.x,i.z),l=Math.floor(c);if(l===i.n)continue;let u=i.n===0;i.n=l;let d=To(l);if(u||d<.62)continue;let f=Math.max(t.heightAt(i.x,i.z),s)+.3,p=Math.round((4+10*(d-.55))*i.s);for(let e=0;e<p;e++){let e=(5+j()*9)*d;A.emit(r+j()*.25,i.x+(j()-.5)*12,f,i.z+(j()-.5)*12,(j()-.5)*3,e,(j()-.5)*3,1.5+j()*2.5,2.2+j()*1.6,{drag:.9,grow:1.1,opacity:.5,gravity:.6})}}}A.update(r)}}}function Vo(e,t,n,r,i,a){let{world:o,sun:s}=e,{N:c,cell:l}=t,u=Math.max(1,Math.round((a===0?6:4)/l)),d=Math.floor(c/u),f=(e,t)=>t*u*c+e*u,p=e=>t.sd[e]>-7&&t.sd[e]<Co.R0*1.25*t.rs[e]+6&&t.h[e]<3.6&&t.h[e]>-1.5,m=new Int32Array(d*d).fill(-1),h=[],g=[],_=[],v=(e,n)=>{let r=n*d+e;if(m[r]>=0)return m[r];let i=f(e,n),a=-o.half+(e*u+.5)*l,s=-o.half+(n*u+.5)*l,c=o.heightAt(a,s);return h.push(a,Math.max(c,-.4)+.17,s),g.push(t.sd[i],t.rs[i],c),m[r]=h.length/3-1,m[r]};for(let e=0;e<d-1;e++)for(let t=0;t<d-1;t++){if(!(p(f(t,e))||p(f(t+1,e))||p(f(t,e+1))||p(f(t+1,e+1))))continue;let n=v(t,e),r=v(t+1,e),i=v(t,e+1),a=v(t+1,e+1);_.push(n,i,r,r,i,a)}let y=new I;y.setAttribute(`position`,new P(h,3)),y.setAttribute(`sw`,new P(g,3)),y.setIndex(_),y.computeBoundingSphere();let b={uTime:{value:0},tNC:{value:n.nc},tFoam:{value:n.foam},tSky:{value:r?.tSky.value??null},uSkyInt:r?.uInt??{value:.85},uHaze:{value:e.fog.color},uSun:{value:s.clone()},uSunCol:{value:i},...Ie.clone(Ge.fog)},x=new F({uniforms:b,fog:!0,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-1,polygonOffsetUnits:-4,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205,vertexShader:`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 sw; varying vec3 vSw; varying vec3 vW;
      void main() {
        vSw = sw;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,fragmentShader:`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform sampler2D tNC, tFoam; uniform vec3 uSun, uSunCol;
      varying vec3 vSw; varying vec3 vW;
      ${Oo}
      ${ko}
      void main() {
        float sd = vSw.x, rs = vSw.y, h = vSw.z;
        vec2 xz = vW.xz;
        float psi = uTime / SURF_T + surfOff(xz);
        float n = floor(psi), u = psi - n;
        float amp = waveAmp(n), ampP = waveAmp(n - 1.0);
        float R = SURF_R0 * rs * amp, Rp = SURF_R0 * rs * ampP;
        float Fr = swashFront(u, R);
        float top = swashTop(amp, rs);
        float dry = smoothstep(top + 0.3, top - 0.2, h);
        // a ragged front: bubbles and fingers of water run ahead of the sheet
        vec3 ft = texture2D(tFoam, xz / 6.0 + vec2(0.0, uTime * 0.02)).rgb;
        float film = Fr - sd + (ft.r - 0.5) * 1.6;
        float cover = smoothstep(-0.2, 0.7, film) * dry;
        // sand the last waves reached stays wet, drying over a few cycles
        float upr = step(u, SURF_UP);
        float reachP = smoothstep(0.6, -0.6, sd - Rp * smoothstep(top + 0.3, top - 0.2, h)) * exp(-(u + 1.0 - SURF_UP) * 0.7);
        float reachC = (1.0 - upr) * smoothstep(0.6, -0.6, sd - R) * exp(-(u - SURF_UP) * 0.7) * dry;
        float sheen = max(max(reachP, reachC), smoothstep(SURF_R0 * rs * 0.45, SURF_R0 * rs * 0.2, sd) * 0.7);
        sheen = max(sheen, cover);
        // foam: a churning band at the leading edge on the way up, streaks dragged seawards on the way down
        float lead = exp(-max(film, 0.0) / mix(1.4, 3.0, upr)) * cover;
        float back = (1.0 - upr) * cover * ft.g * 0.5;
        float body = 0.0;
        float fa = lead * (upr * 1.1 + 0.45) + back + body;
        // two scales of bubble cells, offset so their edges never line up into a crackle pattern
        vec3 ft3 = texture2D(tFoam, xz / 17.0 - vec2(uTime * 0.01, 0.0) + 0.37).rgb;
        float fpat = ft.r * 0.45 + ft3.r * 0.35 + ft3.g * 0.25 + ft.b * 0.15;
        float foam = smoothstep(0.0, 0.55, fa * 1.3 - (1.0 - fpat) * 0.9);
        // lighting
        vec3 V = normalize(cameraPosition - vW);
        vec2 rip = (texture2D(tNC, xz / 4.0 + vec2(uTime * 0.05, uTime * 0.03)).rg * 2.0 - 1.0) * (0.12 * cover + 0.03);
        vec3 N = normalize(vec3(rip.x, 1.0, rip.y));
        float NV = max(dot(N, V), 1e-3);
        float F = min(0.02 + 0.98 * pow(1.0 - NV, 5.0), 0.55);
        vec3 Rf = reflect(-V, N); Rf.y = max(Rf.y, 0.03);
        vec3 sky = skyCol(normalize(Rf));
        vec3 H = normalize(V + uSun);
        vec3 spec = uSunCol * ggx(max(dot(N, H), 0.0), mix(0.3, 0.18, cover)) * F * 0.25 / max(NV, 0.2) * max(dot(N, uSun), 0.0);
        float gloss = max(cover, sheen * 0.55);
        vec3 col = (F * sky + spec) * gloss + vec3(0.01, 0.05, 0.05) * cover * 0.3;
        // wet sand is darker: the sheet's alpha darkens what is under it
        float a = clamp(cover * (0.42 + 0.2 * smoothstep(0.0, 4.0, film)) + sheen * 0.32 * (1.0 - cover) + F * gloss, 0.0, 1.0);
        vec3 amb = vec3(0.45, 0.55, 0.65) * 0.55;
        vec3 foamCol = vec3(0.88, 0.91, 0.93) * (amb * 1.3 + uSunCol * 0.3 * max(uSun.y, 0.0));
        col = mix(col, foamCol, foam);
        a = mix(a, 1.0, foam);
        // under the open sea the ocean surface takes over
        float k = smoothstep(-6.0, -1.5, sd);
        gl_FragColor = vec4(col * k, a * k);
        #ifdef USE_FOG
        #include <fog_fragment>
        #endif
      }`});x.userData.wx=!1;let S=new N(y,x);return S.renderOrder=3,{mesh:S,uniforms:b}}var Ho=e=>e.ultra?3:e.aiLod?e.terrainStep>=4?0:1:2,Uo=`
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
`,Wo={transparent:!0,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205};function Go(e){let{world:t,scene:n,quality:r,sun:i,M:a}=e,o=Ho(r),s=t.data.water,c=No(),l=Ao(n),u=new M(1,.96,.88).multiplyScalar(e.sunLight?.intensity??3),d=Ie.clone(Ge.fog),f={uTime:{value:0},tNC:{value:c.nc},tFoam:{value:c.foam},tNoise:{value:a.noise},tSky:{value:l?.tSky.value??null},uSkyInt:l?.uInt??{value:.85},uHaze:{value:e.fog.color},uSun:{value:i.clone()},uSunCol:{value:u},...d},p=new b;n.add(p);let m=[],h=s.falls,g=h?.pool,_=null;if(h){let[e,n]=h.dir,r=null;for(let i=-60;i<40;i+=.25){let a=h.x+e*i,o=h.z+n*i;if(t.heightAt(a,o)>=h.top-2.5)r={x:a,z:o,s:i};else if(r)break}_=r||{x:h.x,z:h.z,s:0}}let v=[],x=(e,n)=>{let r=e.points,i=[],a=()=>{i.length>2&&v.push({pts:i,river:n}),i=[]};for(let o=0;o<r.length;o++){let[s,c,l]=r[o],u=t.heightAt(s,l),d=c-u<2.6&&u-c<2.5;if(n&&_){let e=(s-h.x)*h.dir[0]+(l-h.z)*h.dir[1];if(c>h.bottom+20&&e>_.s){if(i.length){let e=i[i.length-1];i.push({x:_.x,y:e.y,z:_.z,w:e.w,lip:!0})}d=!1}g&&Math.hypot(s-g.x,l-g.z)<g.r-4&&(d=!1)}c<.25&&(d=!1),d?i.push({x:s,y:Math.max(c,u+.32),z:l,w:e.width[o]}):a()}a()};s.river&&x(s.river,!0),s.creek&&x(s.creek,!1);let S=o===0?6:o===1?10:14,C={...f,uPool:{value:g?new M(g.x,g.z,g.r):new M(0,0,-1)}},w=new F({...Wo,depthWrite:!1,fog:!0,uniforms:C,defines:{TIER:o},vertexShader:`
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
      }`,fragmentShader:`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform sampler2D tNC, tFoam, tNoise; uniform vec3 uSun, uSunCol, uPool;
      varying vec4 vFlow; varying vec2 vUv; varying vec3 vW;
      ${Uo}
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
      }`});w.userData.wx=!1;let T=[];for(let e of v){let n=e.pts,r=n.length,i=n.map((e,t)=>{let i=0,a=0;for(let e=-2;e<=2;e++){let o=n[Math.min(Math.max(t+e,0),r-1)];i+=o.y,a+=1}return Math.max(i/a,e.y-.15)}),a=[],o=[],s=[],c=[],l=0;for(let c=0;c<r;c++){let u=n[c],d=n[Math.min(c+1,r-1)],f=n[Math.max(c-1,0)],p=d.x-f.x,m=d.z-f.z,h=Math.hypot(p,m)||1,v=-m/h,b=p/h,x=u.w*.5,C=x+3.5,w=Math.max(0,(f.y-d.y)/h),E=y.clamp(1.1+w*70,1.1,7.5),D=0,O=u.lip?0:_&&e.river&&n[r-1].lip?Math.hypot(u.x-_.x,u.z-_.z):1e9;if(O<40&&(E*=1+1.8*(1-O/40),D=Math.max(D,y.smoothstep(12-O,0,12)*.8)),g&&e.river&&u.y<g.y+2&&u.y>g.y-18){let e=Math.hypot(u.x-g.x,u.z-g.z);e<260&&(E*=1.6,D=Math.max(D,(1-e/260)*.45+.08)),e<g.r+18&&(D=Math.max(D,.6*(1-(e-g.r)/18)))}for(let e=0;e<=S;e++){let n=e/S*2-1,r=u.x+v*n*C,d=u.z+b*n*C,f=t.heightAt(r,d),p=Math.abs(n*C)<=x,m=p?Math.max(i[c],f+.12):i[c],h=p?Math.max(i[c]-f,.42*(1-(n*C/x)**2)**1.5):i[c]-f;a.push(r,m,d),o.push(l,n*C),s.push(n*C/x,E,h,D)}T.push({x:u.x,z:u.z,y:i[c],hw:x,spd:E}),c<r-1&&(l+=Math.hypot(d.x-u.x,d.z-u.z))}for(let e=0;e<r-1;e++)for(let t=0;t<S;t++){let n=e*(S+1)+t,r=n+1,i=n+S+1,a=i+1;c.push(n,r,i,r,a,i)}let u=new I;u.setAttribute(`position`,new P(a,3)),u.setAttribute(`uv`,new P(o,2)),u.setAttribute(`flow`,new P(s,4)),u.setIndex(c),u.computeBoundingSphere();let d=new N(u,w);d.renderOrder=3,p.add(d)}let E=null,D=null,O=0,ee={};if(h&&_){let n=v.find(e=>e.river&&e.pts[e.pts.length-1].lip);O=n?n.pts[n.pts.length-1].y:h.top;let r=g?g.y:h.bottom,s=O-r,[c,l]=h.dir,d=-l,y=c,b=2.6,x=9.81,S=Math.sqrt(2*s/x);E=new M(_.x+c*b*S,r,_.z+l*b*S);let C=h.width,w=o===0?10:26,T=o===0?18:48,k=(e,t)=>{let n=[],r=[],i=[];for(let i=0;i<=T;i++){let a=i/T,o=S*Math.sqrt(a),s=.5*x*o*o;for(let i=0;i<=w;i++){let u=i/w-.5,f=1+.28*a,p=Math.sin(u*9.1+t)*.5+Math.sin(u*23+t*2)*.25,m=b*o*(1+.15*(1-4*u*u))+p*a*1.2-e;n.push(_.x+d*u*C*f+c*m,O-s+.05,_.z+y*u*C*f+l*m),r.push(u+.5,s)}}for(let e=0;e<T;e++)for(let t=0;t<w;t++){let n=e*(w+1)+t,r=n+1,a=n+w+1,o=a+1;i.push(n,a,r,r,a,o)}let a=new I;return a.setAttribute(`position`,new P(n,3)),a.setAttribute(`uv`,new P(r,2)),a.setIndex(i),a.computeVertexNormals(),a},te={...f,uDrop:{value:s},uWidth:{value:C}},ne=new F({...Wo,depthWrite:!1,side:2,fog:!0,uniforms:te,vertexShader:`
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
        }`,fragmentShader:`
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime, uDrop, uWidth, uSeed; uniform sampler2D tFoam, tNC; uniform vec3 uSun, uSunCol;
        varying vec2 vUv; varying vec3 vW, vN;
        ${Uo}
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
        }`});ne.userData.wx=!1;let re=[[0,0,0]];o>0&&re.push([.9,2.7,.43]);for(let[e,t,n]of re){let r=n?ne.clone():ne;n?(r.uniforms={...te,uSeed:{value:n}},r.userData.wx=!1):te.uSeed={value:0};let i=new N(k(e,t),r);i.renderOrder=4,p.add(i)}if(g){let e=o===0?10:22,n=o===0?32:72,r=[],i=[],a=[];for(let a=0;a<=e;a++){let o=a/e*g.r;for(let s=0;s<n;s++){let c=s/n*Math.PI*2,l=g.x+Math.cos(c)*o,u=g.z+Math.sin(c)*o;r.push(l,g.y,u),i.push(g.y-t.heightAt(l,u),a/e)}}for(let t=0;t<e;t++)for(let e=0;e<n;e++){let r=t*n+e,i=t*n+(e+1)%n,o=r+n,s=i+n;a.push(r,i,o,i,s,o)}let s=new I;s.setAttribute(`position`,new P(r,3)),s.setAttribute(`dep`,new P(i,2)),s.setIndex(a),s.computeBoundingSphere(),Object.assign(ee,f,{uImpact:{value:E},uW:{value:C}});let c=new F({...Wo,depthWrite:!1,fog:!0,uniforms:ee,vertexShader:`
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
          }`,fragmentShader:`
          #include <common>
          #include <fog_pars_fragment>
          uniform float uTime, uW; uniform sampler2D tFoam, tNC; uniform vec3 uSun, uSunCol, uImpact;
          varying vec2 vDep; varying vec3 vW;
          ${Uo}
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
          }`});c.userData.wx=!1;let l=new N(s,c);l.renderOrder=3,p.add(l)}let A=new M(c,0,l).multiplyScalar(3.2);D=new Fo(a,{max:o===0?60:170,sun:i,sunCol:u,wind:A,rainbow:!0,tint:[.9,.93,.95],fog:e.fog}),p.add(D.mesh);let ie=o===0?2:6,ae=o===0?3:10,j=Math.random,oe=e=>{let t=(j()-.5)*C,n=(j()-.3)*8,r=j()*Math.PI*2;D.emit(e,E.x+d*t+c*n,E.y+1+j()*3,E.z+y*t+l*n,Math.cos(r)*(2+j()*4),3+j()*5,Math.sin(r)*(2+j()*4),4+j()*4,16+j()*9,{drag:.45,grow:.22,opacity:.16+j()*.08,gravity:-.035})},se=e=>{let t=(j()-.5)*C*1.1;D.emit(e,E.x+d*t,E.y+.5,E.z+y*t,(j()-.5)*9,4+j()*9,(j()-.5)*9,1.5+j()*2.5,2.5+j()*2,{drag:1.1,grow:1.3,opacity:.45,gravity:.5})};for(let e=0;e<ie*22;e++)oe(-j()*22);let ce=0,le=0;m.push((e,t,n)=>{if(!(n&&n.position.distanceTo(E)>2500)&&t>0){for(ce+=ie*t,le+=ae*t;ce>1;)--ce,oe(e);for(;le>1;)--le,se(e)}D.update(e)})}let k=s.blowhole||{x:-1270,z:1555},te=t.heightAt(k.x,k.z)+.3,ne=e.tracks?.find(e=>e.id===`kahakai`),re=new M(.5,0,-.85);if(ne){let e=ne.nearest({x:k.x,z:k.z}),t=ne.at(e.i);re.set(t[0]-k.x,0,t[2]-k.z).normalize()}let A=new Fo(a,{max:o===0?90:260,sun:i,sunCol:u,wind:re.clone().multiplyScalar(3.5),rainbow:!0,fog:e.fog});p.add(A.mesh);let ie=null,ae=e=>{let t=Math.random,n=o===0?30:80;for(let r=0;r<n;r++){let n=e+t()*.7;A.emit(n,k.x+(t()-.5)*1.5,te,k.z+(t()-.5)*1.5,(t()-.5)*5+re.x*1.5,13+t()*12,(t()-.5)*5+re.z*1.5,1.4+t()*2,2.6+t()*1.6,{drag:.5,grow:1.8,opacity:.7,gravity:1})}for(let r=0;r<n*.4;r++){let n=e+.2+t()*.9;A.emit(n,k.x+(t()-.5)*2,te+2+t()*10,k.z+(t()-.5)*2,re.x*(4+t()*5)+(t()-.5)*3,4+t()*8,re.z*(4+t()*5)+(t()-.5)*3,5+t()*5,6+t()*3,{drag:.8,grow:1,opacity:.5,gravity:.1})}};m.push((e,t,n)=>{let r=e/Co.T+wo(k.x,k.z)-.06,i=Math.floor(r);ie!==null&&i!==ie&&To(i)>.72&&n&&n.position.distanceTo(new M(k.x,te,k.z))<1800&&ae(e),ie===null&&To(i)>.72&&r-i<.25&&ae(e-(r-i)*Co.T),ie=i,A.update(e)});let j=(e,t)=>`${Math.floor(e/20)},${Math.floor(t/20)}`,oe=new Map;for(let e of T){let t=j(e.x,e.z);oe.has(t)||oe.set(t,[]),oe.get(t).push(e)}let se=e=>{let t=null,n=1/0,r=Math.floor(e.x/20),i=Math.floor(e.z/20);for(let a=-1;a<=1;a++)for(let o=-1;o<=1;o++)for(let s of oe.get(`${r+a},${i+o}`)||[]){let r=(s.x-e.x)**2+(s.z-e.z)**2;r<n&&(n=r,t=s)}if(!t||Math.sqrt(n)>t.hw+1)return 0;let a=e.y-.9;return y.clamp((t.y-a+.05)/.45,0,1)};return{riverDepth:se,update(t,r,i,a){for(let r of[C,ee,...p.children.map(e=>e.material?.uniforms).filter(Boolean)])r.uTime&&(r.uTime.value=t),r.fogColor&&(r.fogColor.value.copy(n.fog?.color??e.fog.color),r.fogDensity.value=n.fog?.density??e.fog.density);for(let e of m)e(t,r,i);if(a&&e.spray&&r>0)for(let n of a.cars){let i=se(n.v.group.position);i>.05&&zo(e.spray,n.v,t,r,Math.min(1,i*1.3),o)}}}}var H=(e=0,t=0,n=0)=>new M(e,t,n),Ko=H(0,1,0),qo=2048,Jo=(e,t,n,r)=>({u0:e/qo+.001,u1:(e+n)/qo-.001,v0:1-(t+r)/qo+.001,v1:1-t/qo-.002}),U={palm:Jo(0,0,512,1024),palmOld:Jo(0,1024,512,1024),fern:Jo(512,0,512,1024),banana:Jo(512,1024,512,1024),canopy:Jo(1024,0,512,512),kukui:Jo(1536,0,512,512),monstera:Jo(1024,512,512,512),ti:Jo(1536,512,512,512),grass:Jo(1024,1024,512,512),naupaka:Jo(1536,1024,512,512),bamboo:Jo(1024,1536,512,512),vine:Jo(1536,1536,256,512),ginger:Jo(1792,1536,256,512)},Yo={palm:0,bark:1,fern:2,bamboo:3,banana:4,husk:5,root:6,sheath:7},Xo=class{constructor(e){this.H=e,this.p=[],this.n=[],this.uv=[],this.c=[],this.w=[],this.i=[]}bend(e){let t=Math.max(0,e)/this.H;return t*t*this.H/10}v(e,t,n,r,i,a=0){return this.p.push(e.x,e.y,e.z),this.n.push(t.x,t.y,t.z),this.uv.push(n,r),this.c.push(i[0],i[1],i[2]),this.w.push(this.bend(e.y),a),this.p.length/3-1}tri(e,t,n){this.i.push(e,t,n)}quad(e,t,n,r){this.i.push(e,t,n,e,n,r)}geometry(){if(!this.i.length)return null;let e=new I;return e.setAttribute(`position`,new P(this.p,3)),e.setAttribute(`normal`,new P(this.n,3)),e.setAttribute(`uv`,new P(this.uv,2)),e.setAttribute(`color`,new P(this.c,3)),e.setAttribute(`aw`,new P(this.w,2)),e.setIndex(this.i),e.computeBoundingBox(),e.computeBoundingSphere(),e}tube(e,t,n,r,i,a=.12,o=!1){let s=r/8+.002,c=1/8-.004,l=[],u=[];for(let t=0;t<e.length;t++)l.push(e[Math.min(t+1,e.length-1)].clone().sub(e[Math.max(t-1,0)]).normalize());let d=Math.abs(l[0].y)<.95?H(0,1,0).cross(l[0]).normalize():H(1,0,0);for(let t=0;t<e.length;t++){if(t){let e=l[t-1].clone().cross(l[t]);e.lengthSq()>1e-8&&d.applyAxisAngle(e.normalize(),l[t-1].angleTo(l[t]))}u.push(d.clone())}let f=0,p=this.p.length/3;for(let r=0;r<e.length;r++){r&&(f+=e[r].distanceTo(e[r-1]));let o=r/(e.length-1),d=l[r].clone().cross(u[r]);for(let l=0;l<=n;l++){let p=l/n*Math.PI*2,m=u[r].clone().multiplyScalar(Math.cos(p)).addScaledVector(d,Math.sin(p)),h=t(o,p),g=.7+.3*Math.min(1,e[r].y/2+.2);this.v(e[r].clone().addScaledVector(m,h),m,s+c*l/n,f*a,[i[0]*g,i[1]*g,i[2]*g])}}for(let t=0;t<e.length-1;t++)for(let e=0;e<n;e++){let r=p+t*(n+1)+e,i=r+n+1;this.quad(r,r+1,i+1,i)}if(o){let t=this.v(e[e.length-1],l[l.length-1],s+c/2,f*a,i),r=p+(e.length-1)*(n+1);for(let e=0;e<n;e++)this.tri(r+e,r+e+1,t)}}ribbon(e,t,n,r,{fold:i=.3,foldTip:a=null,centre:o=null,bentK:s=.55,flut:c=1,side:l=null,roll:u=0,aoBase:d=1}={}){let f=e.length-1,p=[];for(let m=0;m<=f;m++){let h=m/f,g=e[Math.min(m+1,f)].clone().sub(e[Math.max(m-1,0)]).normalize(),_=l?l.clone():g.clone().cross(Ko);_.lengthSq()<1e-4&&_.set(1,0,0),_.addScaledVector(g,-_.dot(g)).normalize(),u&&_.applyAxisAngle(g,u*h);let v=_.clone().cross(g).normalize();v.y>0&&v.negate();let y=t*(m===0?.6:1),b=a===null?i:i+(a-i)*h,x=e[m].clone().addScaledVector(_,y).addScaledVector(v,b*y),S=e[m].clone().addScaledVector(_,-y).addScaledVector(v,b*y),C=v.clone().negate();o&&C.multiplyScalar(1-s).add(e[m].clone().sub(o).normalize().multiplyScalar(s)).add(H(0,.3,0)).normalize();let w=n.v0+(n.v1-n.v0)*h,T=(n.u0+n.u1)/2,E=c*h**1.3,D=d+(1-d)*Math.min(1,h*2.2),O=[r[0]*D,r[1]*D,r[2]*D];p.push([this.v(x,C,n.u0,w,O,E),this.v(e[m],C,T,w,O,E*.6),this.v(S,C,n.u1,w,O,E)])}for(let e=0;e<f;e++){let t=p[e],n=p[e+1];this.quad(t[0],t[1],n[1],n[0]),this.quad(t[1],t[2],n[2],n[1])}}card(e,t,n,r,i,{centre:a=null,crown:o=null,flut:s=.6,n:c=null,centred:l=!1}={}){let u=l?e.clone().addScaledVector(n,-.5):e,d=c||t.clone().cross(n).normalize(),f=e=>{if(!a)return d;let t=e.clone().sub(a).normalize();return o&&t.multiplyScalar(.35).add(e.clone().sub(o.c).divide(o.r).normalize().multiplyScalar(.65)),t.add(H(0,.3,0)).normalize()},p=u.clone().addScaledVector(t,-.5),m=u.clone().addScaledVector(t,.5),h=m.clone().add(n),g=p.clone().add(n),_=this.v(p,f(p),r.u0,r.v0,i,s*.3),v=this.v(m,f(m),r.u1,r.v0,i,s*.3),y=this.v(h,f(h),r.u1,r.v1,i,s),b=this.v(g,f(g),r.u0,r.v1,i,s);this.quad(_,v,y,b)}sphere(e,t,n,r){let i=new Pe(1,1).attributes.position,a=n/8+.01;for(let n=0;n<i.count;n+=3){let o=[];for(let s=0;s<3;s++){let c=H(i.getX(n+s),i.getY(n+s),i.getZ(n+s));o.push(this.v(e.clone().addScaledVector(c,t),c,a+(c.x*.5+.5)*.1,c.y*.2,r))}this.tri(o[0],o[1],o[2])}}},Zo=class{constructor(e){this.hi=new Xo(e),this.lo=new Xo(e)}tube(e,t,n,r,i,a,o,s=!0){if(this.hi.tube(e,t,n,r,i,a,o),!s)return;let c=e.length>3?e.filter((t,n)=>n%2==0||n===e.length-1):e;(n>=5||e.length>3)&&this.lo.tube(c,t,Math.max(4,Math.round(n*.6)),r,i,a,o)}ribbon(e,t,n,r,i,a=!0){if(this.hi.ribbon(e,t,n,r,i),!a)return;let o=e.length-1,s=Math.min(o,3);this.lo.ribbon(Array.from({length:s+1},(t,n)=>e[Math.round(n/s*o)]),t*1.15,n,r,i)}card(e,t,n,r,i,a={},o=!0){this.hi.card(e,t,n,r,i,a),o&&this.lo.card(e,t.clone().multiplyScalar(1.3),n.clone().multiplyScalar(1.3),r,i,a)}sphere(e,t,n,r){this.hi.sphere(e,t,n,r)}out(e,t,n){return{bark:e?.hi.geometry(),leaves:t?.hi.geometry(),lo:{bark:e?.lo.geometry(),leaves:t?.lo.geometry()},...n}}},Qo=(e,t,n=.12)=>t.map(t=>t*(1-n+e()*2*n)),$o=(e,t)=>H(Math.cos(t)*Math.cos(e),Math.sin(t),Math.cos(t)*Math.sin(e));function es(e,t,n,r,i,a){let o=[e.clone()],s=e.clone();for(let e=1;e<=a;e++){let c=n-i*(e/a)**1.4;s=s.clone().addScaledVector($o(t,c),r/a),o.push(s)}return o}function ts(e,{H:t=14,lean:n=.25,detail:r=1}={}){let i=new Zo(t),a=new Zo(t),o=[],s=H(),c=n,l=e()*6.28,u=.6+e()*.5;for(let e=0;e<=14;e++){let r=e/14;o.push(s.clone()),c=n*(1.15-u*r*r)+.035*Math.sin(r*7+l),s=s.clone().add(H(Math.sin(c),Math.cos(c),.06*Math.sin(r*4+l)).multiplyScalar(t/14/Math.cos(n*.6)))}let d=.15+e()*.04;i.tube(o,e=>d*(1+.85*(1-e)**14+.15*(1-e)**3)*(1-.22*e),10,Yo.palm,Qo(e,[1,1,1],.06),.1);let f=o[14].clone(),p=o[14].clone().sub(o[13]).normalize();i.tube([f.clone().addScaledVector(p,-.6),f.clone(),f.clone().addScaledVector(p,.5)],e=>d*(1.2+.45*Math.sin(e*Math.PI)),8,Yo.sheath,[.85,.8,.72],.4,!0);let m=f.clone().addScaledVector(p,.3),h=1+Math.floor(e()*2.5);for(let t=0;t<h;t++){let t=e()*6.28,n=4+Math.floor(e()*7),r=[[.85,1.05,.55],[1.3,1.15,.5],[.75,.6,.4]][Math.floor(e()*3)];for(let a=0;a<n;a++){let n=t+(e()-.5)*1.4,a=.22+e()*.18;i.sphere(m.clone().add(H(Math.cos(n)*a,-.3-e()*.45,Math.sin(n)*a)),.13+e()*.05,Yo.husk,Qo(e,r,.08))}}let g=24+Math.floor(e()*7),_=Math.min(1.1,.6+t/22);for(let t=0;t<g;t++){let n=t/(g-1),r=t*2.39996+e()*.3,i=y.lerp(1.2,-.35,n)+(e()-.5)*.25,o=(4.3+e()*1.6)*_*(n<.12?.65:1),s=.5+1.1*n+e()*.35,c=es(m.clone().add($o(r,0).multiplyScalar(.12)),r,i,o,s,9),l=n>.85&&e()<.55,u=l?Qo(e,[1,.93,.78],.1):Qo(e,[.96,1,.92],.12);a.ribbon(c,o*.21,l?U.palmOld:U.palm,u,{fold:.5,foldTip:1.25,centre:m,bentK:.5,flut:1,roll:(e()-.5)*.7,aoBase:.55},t%3!=2)}let v=Math.floor(e()*4);for(let t=0;t<v;t++){let n=e()*6.28,r=3+e(),i=es(m.clone().add($o(n,0).multiplyScalar(.2)),n,-1.25-e()*.25,r,.15,3);a.ribbon(i,r*.12,U.palmOld,[.62,.45,.3],{fold:.2,centre:m,flut:.3,roll:e()*2},t===0)}return Zo.prototype.out(i,a,{H:f.y+1.5,trunkR:d*1.4})}function ns(e,{H:t=22,spread:n=9,pale:r=!1,over:i=0,lean:a=0,vines:o=0,detail:s=1,clusterK:c=1,low:l=!1}={}){let u=new Zo(t),d=new Zo(t),f=t*(l?.28+e()*.08:.5+e()*.12),p=.28+t*.016,m=[],h=e()*6.28;for(let e=0;e<=8;e++){let t=e/8;m.push(H(Math.sin(a)*f*t*t+.25*Math.sin(t*4+h),f*1.12*t,.25*Math.cos(t*3+h)))}let g=4+Math.floor(e()*3),_=e()*6.28;u.tube(m,(e,t)=>{let n=p*(1-.35*e),r=Math.max(0,1-e/.22);return n*(1+2.2*r*r*Math.max(0,Math.cos(g*t/2+_))**4+.35*r)},10,Yo.bark,Qo(e,[1,1,1],.08),.12);let v=m[8],b=[],x=(2.6+t*.08)*c,S=4+Math.floor(e()*3),C=(t,n,r,i,a,o)=>{let s=[t];for(let t=1;t<=3;t++)s.push(s[t-1].clone().addScaledVector($o(n+(e()-.5)*.3,r*(1-.5*t/3)),i/3));if(u.tube(s,e=>a*(1-.6*e)+.03,o?o>1?3:4:6,Yo.root,[1,1,1],.2,!1,o===0),o>=2)b.push(s[3]);else{b.push(s[2].clone().add(H(0,x*.3,0)));for(let t of[-1,1])C(s[3],n+t*(.45+e()*.4),r*.8+.15,i*(.45+e()*.15),a*.45,o+1)}};for(let t=0;t<S;t++){let r=t/S*6.28+e()*.6;i>0&&t<S-1&&(r=(e()-.5)*2.2);let a=n*(.42+e()*.3)*(i>0&&t<S-1?1+i:1),o=l?.3+e()*.3:.55+e()*.4;C(v.clone().add(H(0,-f*.12*e(),0)),r,o,a,p*.55,0)}b.push(v.clone().add(H(0,t-v.y-x*.6,0)));let w=new fe().setFromPoints(b),T={c:w.getCenter(H()),r:w.getSize(H()).multiplyScalar(.5).addScalar(x*.8)};T.c.y-=x*.2;let E=l?4:7;for(let t=0;t<E;t++){let t=e()*6.28,n=Math.sqrt(e())*.75;b.push(T.c.clone().add(H(Math.cos(t)*n*T.r.x,(e()*.9-.2)*T.r.y,Math.sin(t)*n*T.r.z)))}let D=r?U.kukui:U.canopy;for(let t of b){let n=x*(.5+e()*.3);for(let r=0;r<7;r++){let i=e()*6.28,a=Math.acos(1-2*e()**.6),o=n*(.35+.65*e()),s=H(Math.sin(a)*Math.cos(i)*o,Math.cos(a)*o*.8,Math.sin(a)*Math.sin(i)*o),c=t.clone().add(s),l=s.clone().normalize().add(H(0,.6,0)).add(H(e()-.5,e()-.5,e()-.5).multiplyScalar(1)).normalize(),u=l.clone().cross(H(e()-.5,e()-.5,e()-.5).normalize()).normalize(),f=u.clone().cross(l).normalize(),p=n*(1+e()*.5),m=c.clone().sub(T.c).divide(T.r),h=(.38+.62*y.clamp(m.length(),0,1)**1.4)*(.72+.28*y.clamp(m.y*.5+.6,0,1)),g=Qo(e,[h,h,h*.95],.1);d.card(c,u.multiplyScalar(p),f.multiplyScalar(p),D,g,{centre:t.clone().add(H(0,-n*.3,0)),crown:T,flut:.7,centred:!0},r%2==0)}}let O=l?1:2+Math.floor(e()*4);for(let t=0;t<O;t++){let n=e()*6.28,r=e()*f*.25,i=f*(.45+e()*.5),a=H(Math.cos(n),0,Math.sin(n)),o=m[Math.min(8,Math.round((r+i/2)/(f*1.12)*8))],s=H(o.x,r,o.z).addScaledVector(a,p*1.15);d.card(s,a.clone().cross(Ko).multiplyScalar(1.1),H(0,i,0),U.vine,Qo(e,[.55,.62,.52],.1),{flut:.3,n:a.clone().add(H(0,.3,0)).normalize()},t===0)}for(let t=0;t<o;t++){let t=b[Math.floor(e()*b.length)],n=2.5+e()*3.5,r=e()*6.28,i=t.clone().add(H((e()-.5)*2,-x*.35-n,(e()-.5)*2));d.card(i,H(Math.cos(r),0,Math.sin(r)).multiplyScalar(.9),H(0,n,0),U.vine,Qo(e,[.75,.82,.75],.1),{flut:1.2,n:H(Math.sin(r),.4,-Math.cos(r)).normalize()})}return Zo.prototype.out(u,d,{H:t,trunkR:p*1.3,crownLow:f})}function rs(e,{trunkH:t=3,L:n=3,detail:r=1}={}){let i=t+n*.8,a=new Zo(i),o=new Zo(i),s=H();if(t>.2){let n=[],r=(e()-.5)*.3;for(let e=0;e<=4;e++)n.push(H(Math.sin(r)*t*(e/4)**2,t*e/4,0));a.tube(n,e=>.22+.14*(1-e)**2+.05*e*e,7,Yo.fern,Qo(e,[1,1,1],.1),.25,!0),s=n[4]}let c=14+Math.floor(e()*6);for(let t=0;t<c;t++){let r=t*2.39996+e()*.4,i=t<2,a=i?1.3:.5+e()*.6,c=n*(i?.55:.85+e()*.3),l=es(s.clone().add($o(r,0).multiplyScalar(.1)),r,a,c,i?.2:1+e()*.7,6);o.ribbon(l,c*.25,U.fern,Qo(e,i?[1.1,1.15,.9]:[1,1,1],.1),{fold:.12,foldTip:.5,centre:s.clone().add(H(0,-.3,0)),flut:1,aoBase:.6},t%3!=2)}return Zo.prototype.out(a,o,{H:i,trunkR:.25})}function is(e,{H:t=4,detail:n=1}={}){let r=new Zo(t+1.5),i=new Zo(t+1.5),a=1+Math.floor(e()*3);for(let n=0;n<a;n++){let a=t*(n?.45+e()*.4:1),o=n?H((e()-.5)*1.2,0,(e()-.5)*1.2):H(),s=o.clone().add(H((e()-.5)*.3,a,(e()-.5)*.3));r.tube([o,o.clone().lerp(s,.5),s],e=>.15*(1-.4*e)*Math.sqrt(a/t)+.03,7,Yo.banana,Qo(e,[1,1,1],.1),.25);let c=7+Math.floor(e()*4);for(let n=0;n<c;n++){let r=n*2.39996+e()*.5,o=n===c-1&&e()<.6,l=(o?1.5:1.7+e()*1)*Math.sqrt(a/t),u=es(s.clone(),r,o?-.6:.95+e()*.4,l,o?.6:.9+e()*.8,5);i.ribbon(u,l*.29,U.banana,o?[.8,.6,.35]:Qo(e,[1,1,1],.1),{fold:.15,foldTip:.35,centre:s,flut:1.1,roll:(e()-.5)*.8,aoBase:.7},n%2==0||o)}}return Zo.prototype.out(r,i,{H:t+1.5,trunkR:.2})}function as(e,{H:t=11,R:n=1.8,detail:r=1}={}){let i=new Zo(t),a=new Zo(t),o=16+Math.floor(e()*10);for(let r=0;r<o;r++){let r=e()*6.28,o=n*Math.sqrt(e()),s=t*(.65+e()*.35),c=H(Math.cos(r),0,Math.sin(r)),l=[];for(let e=0;e<=6;e++){let t=e/6;l.push(H(Math.cos(r)*o,0,Math.sin(r)*o).addScaledVector(c,s*(.08*t+.32*t*t*t)).add(H(0,s*t*(1-.12*t*t),0)))}i.tube(l,()=>.045+e()*0,5,Yo.bamboo,Qo(e,[1,1,1],.12),.7);for(let t=0;t<6;t++){let n=.45+.55*(t+e())/6,i=Math.min(5,Math.floor(n*6)),o=l[i].clone().lerp(l[i+1],n*6-i),c=r+(e()-.5)*2.4,u=H(Math.cos(c),-.3-e()*.4,Math.sin(c)).normalize(),d=1.2+e()*.8,f=u.clone().cross(Ko).normalize().multiplyScalar(d);a.card(o.clone().addScaledVector(u,d*.45),f,u.clone().cross(f).normalize().multiplyScalar(-d*.9),U.bamboo,Qo(e,[1,1,1],.12),{centre:H(0,s*.6,0),flut:1.2,centred:!0},t%2==0)}}return Zo.prototype.out(i,a,{H:t,trunkR:n})}function os(e,t,{k:n=3,w:r=1,h:i=1,up:a=!1,tilt:o=0,colour:s=[1,1,1]}={}){let c=new Xo(i),l=H(0,i*.35,0);for(let u=0;u<n;u++){let d=u*Math.PI/n+e()*.3,f=H(Math.cos(d)*r,0,Math.sin(d)*r),p=H(Math.sin(d)*o*(e()-.5),i,-Math.cos(d)*o*(e()-.5));c.card(H((e()-.5)*r*.15,-.03,(e()-.5)*r*.15),f,p,t,Qo(e,s,.08),a?{n:H(Math.cos(d)*.15,1,Math.sin(d)*.15).normalize(),flut:1}:{centre:l,flut:.8})}return{leaves:c.geometry(),H:i}}function ss(e,t,{n=7,s:r=1.1,detail:i=1}={}){let a=new Xo(r*1.4),o=H(0,.2,0),s=n;for(let n=0;n<s;n++){let i=n*2.39996+e()*.5,s=.8+e()*.5,c=r*(.75+e()*.5),l=$o(i,s),u=H(Math.cos(i)*.12,-.05+e()*.15*r,Math.sin(i)*.12),d=l.clone().cross(Ko).normalize().multiplyScalar(c*.9),f=d.clone().cross(l).normalize();f.y<0&&f.negate();let p=l.clone().multiplyScalar(Math.cos(.3)).addScaledVector(f,.3).normalize().multiplyScalar(c);a.card(u,d,p,t,Qo(e,[1,1,1],.1),{centre:o,flut:.8})}return{leaves:a.geometry(),H:r*1.4}}function cs(e,t,{n=14,R:r=1.6,s:i=1}={}){let a=new Xo(.6*i);for(let o=0;o<n;o++){let n=e()*6.28,s=r*Math.sqrt(e()),c=e()*6.28,l=.15+e()*.45,u=i*(.7+e()*.6),d=H(Math.cos(c)*Math.cos(l),Math.sin(l),Math.sin(c)*Math.cos(l)).multiplyScalar(u),f=H(-Math.sin(c),0,Math.cos(c)).multiplyScalar(u*.9),p=.6+.4*s/r;a.card(H(Math.cos(n)*s,.02,Math.sin(n)*s).addScaledVector(d,-.35),f,d,t[o%t.length],Qo(e,[p,p,p],.12),{n:H(Math.cos(c)*.15,1,Math.sin(c)*.15).normalize(),flut:.5})}return{leaves:a.geometry(),H:.6*i}}function ls(e,t,{n=22,R:r=1.2,h:i=1,s:a=.9}={}){let o=new Xo(i),s={c:H(0,i*.35,0),r:H(r,i*.75,r)};for(let c=0;c<n;c++){let n=e()*6.28,c=Math.acos(1-1.15*e()),l=.55+.45*e(),u=H(Math.sin(c)*Math.cos(n),Math.cos(c),Math.sin(c)*Math.sin(n)),d=H(u.x*r*l,Math.max(.1*i,i*.35+u.y*i*.65*l),u.z*r*l),f=u.clone().add(H(e()-.5,e()-.5,e()-.5).multiplyScalar(.8)).normalize(),p=f.clone().cross(H(e()-.5,e()-.5,e()-.5).normalize()).normalize(),m=p.clone().cross(f).normalize(),h=a*(.8+e()*.5),g=(.5+.5*l)*(.7+.3*Math.max(0,u.y));o.card(d,p.multiplyScalar(h),m.multiplyScalar(h),t,Qo(e,[g,g,g],.1),{centre:s.c,crown:s,flut:.6,centred:!0})}return{leaves:o.geometry(),H:i}}var us=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)},ds=new i,fs=new n,ps=new u,ms=new M,hs=new M;function gs(){let e=[],t=[],n=(n,r,i,a=0,o=0,s=0)=>{e.push(...n,...r,...i),t.push(a,o,s)};n([0,0,.45],[0,.06,-.1],[0,0,-.4]),n([0,0,.45],[0,-.07,0],[0,0,-.4]),n([0,0,.45],[.07,0,0],[0,0,-.4]),n([0,0,.45],[-.07,0,0],[0,0,-.4]);for(let e of[1,-1])n([0,0,.18],[.45*e,.02,.1],[0,0,-.12],0,.4,0),n([0,0,-.12],[.45*e,.02,.1],[.45*e,.02,-.12],0,.4,.4),n([.45*e,.02,.1],[1.05*e,.05,-.18],[.45*e,.02,-.12],.4,1,.4),n([0,0,-.35],[.05*e,0,-.95],[.01*e,0,-.4]);let r=new I;r.setAttribute(`position`,new P(e,3)),r.setAttribute(`flap`,new P(t,1));let i=[];for(let t=0;t<e.length/3;t++){let n=Math.abs(e[t*3]),r=e[t*3+2],a=n>.85||r<-.6?.25:1;i.push(a,a,a)}r.setAttribute(`color`,new P(i,3)),r.computeVertexNormals();let a=r.attributes.normal;for(let e=0;e<a.count;e++)a.setXYZ(e,a.getX(e)*.3,1,a.getZ(e)*.3);return r}function _s(){let e=new c({vertexColors:!0,side:2});return e.userData.wx=!1,e.onBeforeCompile=e=>{e.uniforms.uTime=wt.uTime,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uTime; attribute float flap; attribute vec2 aFlap;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
// aFlap: (phase, how hard it beats: 0 gliding, 1 flapping)
float beat = sin(uTime * (9.0 + aFlap.x * 0.3) + aFlap.x * 6.0);
transformed.y += flap * (beat * 0.55 * aFlap.y + 0.08 * (1.0 - aFlap.y)) * (0.6 + abs(transformed.x));`)},e.customProgramCacheKey=()=>`kaiele-bird`,e}function vs(){let e=[],t=(t,r,a,o,s,c,l=0,d=0)=>{let f=new A(t,r,a);f.applyMatrix4(new i().compose(new M(o,s,c),new n().setFromEuler(new u(0,l,d)),new M(1,1,1))),e.push(f)};t(.16,.05,.12,0,.08,0),t(.12,.03,.09,0,.115,-.005);for(let e of[1,-1]){t(.012,.05,.012,.04*e,.13,.05),t(.06,.035,.04,.09*e,.08,.08,.5*e);for(let n=0;n<4;n++)t(.13,.012,.014,.12*e,.05,.035-n*.035,(n-1.5)*.25*e,-.5*e)}return Nt(e.map(e=>e.deleteAttribute(`uv`)&&e))}async function ys(e,t){let{scene:n,world:r,quality:i,tracks:a}=e,{F:s}=t,c=we(777),l=!!i.aiLod,u=new b;u.name=`kaiele-life`,n.add(u);let d=[],f=(e,t)=>{let n=s.cellOf(e,t),r=s.G,i=s.coast[Math.min(n+1,s.coast.length-1)]-s.coast[Math.max(n-1,0)],a=s.coast[Math.min(n+r,s.coast.length-1)]-s.coast[Math.max(n-r,0)],o=Math.hypot(i,a)||1;return[-i/o,-a/o]};for(let e of a){if(e.id!==`kahakai`&&e.id!==`palikai`)continue;let t=l?420:260;for(let n=0;n<e.n;n+=t){let t=e.c[n];if(s.coast[s.cellOf(t[0],t[2])]>220)continue;let[r,i]=f(t[0],t[2]),a=50+c()*60,o=t[0]+r*a,u=t[2]+i*a,p=e.id===`palikai`&&t[1]>40,m=(l?3:5)+Math.floor(c()*3);for(let e=0;e<m;e++){let e=c()<(p?.8:.45);d.push({kind:`sea`,cx:o+(c()-.5)*40,cz:u+(c()-.5)*40,r:25+c()*55,w:(.15+c()*.15)*(c()<.5?-1:1),ph:c()*6.28,alt:p?25+c()*70:12+c()*45,s:.55+c()*.35,col:e?[.95,.95,.92]:[.2,.19,.18],flapPh:c()*10})}}}let p=[],m=a.find(e=>e.id===`wailele`);if(m){let e=t.tunnelRows.length?t.tunnelRows:[],n=[];for(let e=60;e<m.n;e+=l?420:260)n.push(e);for(let t of n){let n=m.frame(t),r=c()<.5?-1:1,i=r*(m.width/2+9+c()*8),a=n.x+n.nx*i,o=n.z+n.nz*i;if(s.waterAt(a,o)<3)continue;let u=s.groundAt(a,o)+(e.includes(t)?22:16)+c()*4,f={x:a,z:o,y:u,row:t,out:[n.nx*r,n.nz*r],t:-1,cool:0,birds:[]},h=l?6:11;for(let e=0;e<h;e++){let e={kind:`egret`,site:f,px:a+(c()-.5)*9,pz:o+(c()-.5)*9,py:u+(c()-.5)*2,ph:c()*6.28,r:18+c()*22,w:.5+c()*.25,alt:14+c()*14,delay:c()*.6,s:.42+c()*.1,col:[.97,.96,.92],flapPh:c()*10};f.birds.push(e),d.push(e)}p.push(f)}}let g=new oe(gs(),_s(),Math.max(1,d.length));g.frustumCulled=!1,g.instanceMatrix.setUsage(O);let _=new ke(new Float32Array(Math.max(1,d.length)*2),2).setUsage(O);g.geometry.setAttribute(`aFlap`,_),d.forEach((e,t)=>g.setColorAt(t,new o(...e.col))),g.count=d.length,u.add(g);let v=[],y=a.find(e=>e.id===`kahakai`);if(y){let e=l?40:90;for(let t=0;v.length<e&&t<4e3;t++){let e=Math.floor(c()*y.n),t=y.frame(e),n=(c()<.5?-1:1)*(y.width/2+3+c()*22),i=t.x+t.nx*n,a=t.z+t.nz*n,o=r.heightAt(i,a);o<.45||o>4||s.coast[s.cellOf(i,a)]>60||v.push({hx:i,hz:a,x:i,z:a,yaw:c()*6.28,state:`idle`,t:c()*4,vx:0,vz:0,sink:0,s:.8+c()*.5})}}let x=new h({color:13219990,roughness:.6,metalness:0});x.userData.wx=`object`;let S=new oe(vs(),x,Math.max(1,v.length));S.frustumCulled=!1,S.instanceMatrix.setUsage(O),S.count=0,S.castShadow=!0,u.add(S);let C=[];return{update(e,t,n,r){let i=n?.position;if(!i)return;if(C.length=0,r)for(let e of r.cars)e.v?.group&&C.push(e.v.group.position);t=Math.min(t,.1);for(let e of p)e.t<0?(e.cool-=t,e.cool<=0&&C.some(t=>(t.x-e.x)**2+(t.z-e.z)**2<1444)&&(e.t=0)):(e.t+=t,e.t>22&&(e.t=-1,e.cool=6));d.forEach((t,n)=>{let r,i,a,o,s=0,c=0;if(t.kind===`sea`){let n=t.ph+e*t.w*(60/(t.r+30));r=t.cx+Math.cos(n)*t.r,a=t.cz+Math.sin(n)*t.r,i=t.alt+Math.sin(e*.3+t.ph*3)*5;let l=-Math.sin(n)*Math.sign(t.w),u=Math.cos(n)*Math.sign(t.w);o=Math.atan2(l,u),s=-.45*Math.sign(t.w),c=+(Math.sin(e*.5+t.flapPh)>.75)}else{let e=t.site,l=e.t-t.delay;if(e.t<0||l<=0){r=t.px,i=t.py,a=t.pz,o=t.ph,c=0,ds.compose(ms.set(r,i,a),fs.setFromEuler(ps.set(0,o,0,`YXZ`)),hs.set(t.s*.45,t.s*.9,t.s*.8)),g.setMatrixAt(n,ds),_.setXY(n,t.flapPh,0);return}let u=us(0,2.2,l)*(1-us(17,21.5,l)),d=t.ph+l*t.w,f=e.x+e.out[0]*30+Math.cos(d)*t.r,p=e.z+e.out[1]*30+Math.sin(d)*t.r,m=Math.exp(-l*.8)*12;r=t.px+(f-t.px)*u+e.out[0]*m,a=t.pz+(p-t.pz)*u+e.out[1]*m,i=t.py+(t.alt+Math.sin(l*.9+t.ph)*3)*u+(1-Math.exp(-l*2))*3*(1-u);let h=-Math.sin(d)*u+e.out[0]*(1-u)+.001,v=Math.cos(d)*u+e.out[1]*(1-u);o=Math.atan2(h,v),s=-.35*u,c=l<4||l>16?1:.4}ds.compose(ms.set(r,i,a),fs.setFromEuler(ps.set(0,o,s,`YXZ`)),hs.setScalar(t.s)),g.setMatrixAt(n,ds),_.setXY(n,t.flapPh,c)}),g.instanceMatrix.needsUpdate=!0,_.needsUpdate=!0;let a=0;for(let n of v){let r=(n.x-i.x)**2+(n.z-i.z)**2;n.t-=t;let o=1e9,l=0,u=0;for(let e of C){let t=(e.x-n.x)**2+(e.z-n.z)**2;t<o&&(o=t,l=e.x,u=e.z)}if(n.state===`hidden`){if(n.t<=0&&o>900)n.state=`idle`,n.x=n.hx+(c()-.5)*6,n.z=n.hz+(c()-.5)*6,n.sink=1,n.t=2+c()*4;else continue}if(n.state!==`flee`&&o<225){let e=Math.sqrt(o)||1,t=4.5+c()*2;n.vx=(n.x-l)/e*t,n.vz=(n.z-u)/e*t,n.state=`flee`,n.t=.8+c()*.8,n.yaw=Math.atan2(n.vx,n.vz)+Math.PI/2}if(n.state===`flee`)n.x+=n.vx*t,n.z+=n.vz*t,(n.t<=0||o<2)&&(n.state=`dive`,n.t=.35);else if(n.state===`dive`){if(n.sink=Math.min(1.5,n.sink+t*4),n.t<=0){n.state=`hidden`,n.t=12+c()*20;continue}}else{if(n.sink=Math.max(0,n.sink-t*2),n.t<=0){let e=c()*6.28,t=1+c()*1.5;n.vx=Math.cos(e)*t,n.vz=Math.sin(e)*t,n.t=.3+c()*.6,n.yaw=e,n.dash=n.t}n.dash>0&&(n.dash-=t,n.x+=n.vx*t,n.z+=n.vz*t,n.dash<=0&&(n.t=1+c()*5)),(n.x-n.hx)**2+(n.z-n.hz)**2>100&&(n.vx=(n.hx-n.x)*.3,n.vz=(n.hz-n.z)*.3)}if(r>25600)continue;let d=s.groundAt(n.x,n.z);if(d<.15){n.state=`hidden`,n.t=5;continue}let f=n.state===`flee`?Math.abs(Math.sin(e*40+n.hx))*.02:0;ds.compose(ms.set(n.x,d-n.sink*.12+f,n.z),fs.setFromAxisAngle(hs.set(0,1,0),n.yaw),hs.setScalar(n.s)),S.setMatrixAt(a++,ds)}S.count=a,S.instanceMatrix.needsUpdate=!0}}}var bs=`./`,xs=`${bs}textures/kaiele/plants`,W=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)},Ss={strength:{value:1},dir:{value:new He(-.7,.7).normalize()}},Cs={low:{near:85,full:0,far:900,small:.45,trees:.75,detail:0,tex:`_1k`},medium:{near:120,full:.4,far:1300,small:.7,trees:.9,detail:1,tex:`_1k`},high:{near:155,full:.45,far:1800,small:1,trees:1,detail:1,tex:``},ultra:{near:230,full:.45,far:2600,small:1.4,trees:1,detail:1,tex:``}},ws=`
float kDither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`,Ts=`
#ifdef USE_INSTANCING
  float kDist = distance(instanceMatrix[3].xz, cameraPosition.xz);
  float kFade = smoothstep(ifd.x, ifd.y, kDist) * (1.0 - smoothstep(ifd.z, ifd.w, kDist));
#else
  float kFade = 1.0;
#endif`;function Es(e,{leaf:t=!1,texSize:n=2048,depth:r=!1,lite:i=!1}={}){e.userData.wx=`foliage`;let a=e.onBeforeCompile;e.onBeforeCompile=(o,s)=>{a?.call(e,o,s),Object.assign(o.uniforms,{uWind:wt.uTime,uWindK:Ss.strength,uWindDir:Ss.dir}),o.vertexShader=o.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uWind, uWindK; uniform vec2 uWindDir; attribute vec2 aw; attribute vec2 iw; attribute vec4 ifd;
varying float vFade; varying float vAoH;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
{
${r?`  float kFade = 1.0;`:Ts}
#ifdef USE_INSTANCING
  vec3 wpos = (instanceMatrix * vec4(transformed, 1.0)).xyz; vec2 wp = instanceMatrix[3].xz; float ex = iw.x * uWindK;
#else
  vec3 wpos = transformed; vec2 wp = vec2(0.0); float ex = uWindK;
#endif
  float ph = dot(wp, vec2(0.13, 0.21));
  float gust = 0.55 + 0.45 * sin(uWind * 0.35 + dot(wp, vec2(0.004, 0.003))) * sin(uWind * 0.11 + wp.y * 0.002 + 1.3);
  float b = aw.x * 0.28 * ex;
  float sway = b * (0.45 + 0.55 * gust) * (0.75 + 0.25 * sin(uWind * 1.6 + ph) + 0.12 * sin(uWind * 3.1 + ph * 1.7));
  vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y) * sway + vec3(-uWindDir.y, 0.0, uWindDir.x) * b * 0.22 * sin(uWind * 1.2 + ph * 1.3);
  d.y -= sway * sway * 0.08;
  float fl = max(aw.y, 0.0) * 0.06 * ex * (0.5 + gust);
  d += vec3(sin(uWind * 6.3 + ph + wpos.y * 1.7 + wpos.x), 0.7 * sin(uWind * 8.1 + ph * 1.3 + wpos.z * 1.9), cos(uWind * 7.2 + ph + wpos.z * 1.3 + wpos.y)) * fl;
#ifdef USE_INSTANCING
  transformed += inverse(mat3(instanceMatrix)) * d;
  // grass sinks into the ground at the edge of its range rather than dissolving
  if (iw.y > 0.5) { transformed.y *= kFade; kFade = 1.0; }
#else
  transformed += d;
#endif
  vAoH = clamp(position.y / 1.6, 0.0, 1.0);
  vFade = kFade;
  // fully faded out: collapse it so it costs no fill
  if (kFade <= 0.0) transformed = vec3(0.0);
}`),o.fragmentShader=o.fragmentShader.replace(`#include <common>`,`#include <common>
varying float vFade; varying float vAoH;${ws}`),o.fragmentShader=t?o.fragmentShader.replace(`#include <alphatest_fragment>`,`
  float kD = kDither(gl_FragCoord.xy);
#ifdef USE_MAP
  { vec2 dd = fwidth(vMapUv * ${n.toFixed(1)}); diffuseColor.a *= 1.0 + max(0.0, log2(max(dd.x, dd.y))) * 0.3; }
#endif
#ifdef USE_ALPHATEST
  ${i?`if (diffuseColor.a < alphaTest) discard;`:`{ float ea = (diffuseColor.a - alphaTest) / clamp(fwidth(diffuseColor.a), 1e-3, 0.05) + 0.5; if (ea < kD) discard; }`}
#endif
  if (vFade < kD) discard;
  diffuseColor.a = 1.0;`):o.fragmentShader.replace(`#include <alphatest_fragment>`,`#include <alphatest_fragment>
  if (vFade < kDither(gl_FragCoord.xy)) discard;`),!r&&(o.fragmentShader=o.fragmentShader.replace(`#include <color_fragment>`,`#include <color_fragment>
  diffuseColor.rgb *= mix(0.62, 1.0, vAoH);`),t&&o.fragmentShader.includes(`#include <normal_fragment_begin>`)&&(o.fragmentShader=o.fragmentShader.replace(`#include <normal_fragment_begin>`,st.normal_fragment_begin.replaceAll(`normal *= faceDirection;`,``)).replace(`#include <lights_fragment_end>`,`#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
  {
    float nl = dot(normal, directLight.direction);
    float wrap = clamp((nl + 0.5) / 1.5, 0.0, 1.0) - clamp(nl, 0.0, 1.0);
    float back = pow(max(dot(normalize(-vViewPosition), directLight.direction), 0.0), 4.0);
    float trans = back * 0.85 + max(-nl, 0.0) * 0.3;
    reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * RECIPROCAL_PI * (wrap * 0.55 + trans * vec3(1.05, 1.1, 0.55));
  }
#endif
  // light bounced about inside the canopy: shaded leaves are deep green, never black
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.05, 0.065, 0.035);`)))};let o=e.customProgramCacheKey?.bind(e);return e.customProgramCacheKey=()=>(o?o():``)+(t?`-kplant2-leaf`:`-kplant2`)+(r?`-d`:``)+(i?`-l`:``),e}function Ds(e){return Es(new v({depthPacking:ge,map:e.map,alphaTest:e.alphaTest,side:2}),{leaf:!!e.map&&e.alphaTest>0,depth:!0,lite:!0})}var Os=8,ks=3,As=35*Math.PI/180;function js(e,t,n){let r=new h({map:e,alphaTest:.45,side:2,vertexColors:!0,roughness:.9,metalness:0,envMapIntensity:.4});r.userData.wx=`foliage`;let i=new Ve(...t.tile);return r.onBeforeCompile=e=>{Object.assign(e.uniforms,{uImpC:{value:t.c},uImpR:{value:t.R},uTile:{value:i}}),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
uniform vec3 uImpC; uniform float uImpR; uniform vec4 uTile; attribute vec2 iw; attribute vec4 ifd;
varying vec2 vUvA, vUvB; varying float vW, vFade, vAoH;`).replace(`#include <beginnormal_vertex>`,`
${Ts}
  vec3 ip = instanceMatrix[3].xyz; float sc = length(instanceMatrix[0].xyz);
  vec3 ax = instanceMatrix[0].xyz / sc, az = instanceMatrix[2].xyz / sc;
  vec3 C = ip + (ax * uImpC.x + az * uImpC.z) * sc + vec3(0.0, uImpC.y * sc, 0.0);
  vec3 f = normalize(cameraPosition - C);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f)), u = cross(f, r);
  vec3 bbP = C + (r * position.x + u * position.y) * uImpR * sc;
  // the frames either side of the view azimuth (in the tree's own frame), and the nearest elevation
  vec3 lf = vec3(dot(f, ax), f.y, dot(f, az));
  float fa = atan(lf.z, lf.x) / 6.2831853 * ${Os.toFixed(1)};
  fa = fa < 0.0 ? fa + ${Os.toFixed(1)} : fa;
  float a0 = floor(fa); vW = fa - a0; float a1 = mod(a0 + 1.0, ${Os.toFixed(1)});
  float row = clamp(floor(asin(clamp(lf.y, -1.0, 1.0)) / ${As.toFixed(5)} + 0.5), 0.0, ${2 .toFixed(1)});
  vec2 q = position.xy * 0.5 + 0.5;
  vUvA = uTile.xy + (vec2(a0, row) + q) * uTile.zw; vUvB = uTile.xy + (vec2(a1, row) + q) * uTile.zw;
  vec3 bbN = normalize(f * 0.6 + (r * position.x + u * position.y) * 0.75 + vec3(0.0, 0.45, 0.0));
  vFade = kFade; vAoH = 1.0;
  if (kFade <= 0.0) bbP = vec3(0.0);
  vec3 objectNormal = bbN;`).replace(`#include <defaultnormal_vertex>`,`vec3 transformedNormal = normalize((viewMatrix * vec4(bbN, 0.0)).xyz);`).replace(`#include <begin_vertex>`,`vec3 transformed = bbP;`).replace(`#include <project_vertex>`,`vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
gl_Position = projectionMatrix * mvPosition;`).replace(`#include <worldpos_vertex>`,`vec4 worldPosition = vec4(transformed, 1.0);`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec2 vUvA, vUvB; varying float vW, vFade, vAoH;${ws}`).replace(`#include <map_fragment>`,`
  vec4 sampledDiffuseColor = mix(texture2D(map, vUvA), texture2D(map, vUvB), vW);
  diffuseColor *= sampledDiffuseColor;`).replace(`#include <alphatest_fragment>`,`
  float kD = kDither(gl_FragCoord.xy);
  { vec2 dd = fwidth(vUvA * ${(1/t.tile[2]*(n?128:256)).toFixed(1)}); diffuseColor.a *= 1.0 + max(0.0, log2(max(dd.x, dd.y))) * 0.35; }
  ${n?`if (diffuseColor.a < alphaTest) discard;`:`{ float ea = (diffuseColor.a - alphaTest) / clamp(fwidth(diffuseColor.a), 1e-3, 0.05) + 0.5; if (ea < kD) discard; }`}
  if (vFade < kD) discard;
  diffuseColor.a = 1.0;`).replace(`#include <normal_fragment_begin>`,st.normal_fragment_begin.replaceAll(`normal *= faceDirection;`,``)).replace(`#include <lights_fragment_end>`,`#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
  {
    float nl = dot(normal, directLight.direction);
    float wrap = clamp((nl + 0.5) / 1.5, 0.0, 1.0) - clamp(nl, 0.0, 1.0);
    float back = pow(max(dot(normalize(-vViewPosition), directLight.direction), 0.0), 4.0);
    reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * RECIPROCAL_PI * (wrap * 0.55 + back * 0.5 * vec3(1.05, 1.1, 0.55));
  }
#endif`)},r.customProgramCacheKey=()=>`kimp2-${n?`l`:`h`}`,r}function Ms(e,t,n,r){let i=r?128:256,a=Os*i,s=ks*i*t.length,c=new E(a,s,{generateMipmaps:!0,minFilter:se,magFilter:L});c.texture.colorSpace=k,c.texture.anisotropy=4;let l=new m,u=new g({map:n.leaf.map,alphaTest:.5,vertexColors:!0,side:2}),d=new g({map:n.bark.map,vertexColors:!0}),f=new te(-1,1,1,-1,.1,1e3),p={rt:e.getRenderTarget(),auto:e.autoClear,col:e.getClearColor(new o),a:e.getClearAlpha(),shadow:e.shadowMap.autoUpdate};e.setRenderTarget(c),e.setClearColor(2900512,0),e.clear(),e.autoClear=!1,e.shadowMap.autoUpdate=!1,t.forEach((t,n)=>{let r=[];t.model.bark&&r.push(new N(t.model.bark,d)),t.model.leaves&&r.push(new N(t.model.leaves,u));for(let e of r)l.add(e);let o=new fe;for(let e of r)o.union(e.geometry.boundingBox);let p=o.getCenter(new M),m=0;for(let e of r){let t=e.geometry.attributes.position;for(let e=0;e<t.count;e++)m=Math.max(m,Math.hypot(t.getX(e)-p.x,t.getY(e)-p.y,t.getZ(e)-p.z))}t.c=p,t.R=m,t.tile=[0,n*ks*i/s,i/a,i/s],f.left=-m,f.right=m,f.top=m,f.bottom=-m,f.updateProjectionMatrix();for(let t=0;t<ks;t++)for(let r=0;r<Os;r++){let a=r/Os*Math.PI*2,o=t*As,s=new M(Math.cos(a)*Math.cos(o),Math.sin(o),Math.sin(a)*Math.cos(o));f.position.copy(p).addScaledVector(s,300),f.up.set(0,1,0),f.lookAt(p),f.updateMatrixWorld();let u=r*i,d=(n*ks+t)*i;c.viewport.set(u,d,i,i),c.scissor.set(u,d,i,i),c.scissorTest=!0,e.setRenderTarget(c),e.render(l,f)}for(let e of r)l.remove(e)}),c.scissorTest=!1,c.viewport.set(0,0,a,s),e.setRenderTarget(p.rt),e.autoClear=p.auto,e.setClearColor(p.col,p.a),e.shadowMap.autoUpdate=p.shadow,u.dispose(),d.dispose();let h=new I;h.setAttribute(`position`,new P([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3)),h.setAttribute(`normal`,new P([0,0,1,0,0,1,0,0,1,0,0,1],3)),h.setAttribute(`uv`,new P([0,0,1,0,1,1,0,1],2)),h.setAttribute(`color`,new P([1,1,1,1,1,1,1,1,1,1,1,1],3)),h.setIndex([0,1,2,0,2,3]);for(let e of t)e.geo=h,e.mat=js(c.texture,e,r);return c}function Ns(e,t){if(e.groundAt)return e.groundAt;let n=Math.max(3,t.terrainStep*2.5),r=e.half;return(t,i)=>{let a=(t+r)/n,o=(i+r)/n,s=Math.floor(a),c=Math.floor(o),l=a-s,u=o-c,d=-r+s*n,f=-r+c*n,p=e.heightAt(d+n,f),m=e.heightAt(d,f+n);if(l+u<=1){let t=e.heightAt(d,f);return t+(p-t)*l+(m-t)*u}let h=e.heightAt(d+n,f+n);return h+(m-h)*(1-l)+(p-h)*(1-u)}}async function Ps(e){try{let t=new Image;t.src=e,await t.decode();let n=document.createElement(`canvas`).getContext(`webgl2`,{premultipliedAlpha:!1});if(!n)return null;let r=n.createTexture();n.bindTexture(n.TEXTURE_2D,r),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,n.NONE),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!1),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t);let i=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,i),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,r,0);let a=new Uint8Array(t.width*t.height*4);return n.readPixels(0,0,t.width,t.height,n.RGBA,n.UNSIGNED_BYTE,a),n.getExtension(`WEBGL_lose_context`)?.loseContext(),{data:a,w:t.width,h:t.height}}catch{return null}}function Fs(e,t,n,r){let i=e.half,a=e.extent/512,o=new Float32Array(262144);for(let t=0;t<512;t++)for(let n=0;n<512;n++)o[t*512+n]=e.heightAt(-i+(n+.5)*a,-i+(t+.5)*a);let s=e=>{let t=a,n=a*Math.SQRT2;for(let r=0;r<512;r++)for(let i=0;i<512;i++){let a=r*512+i,o=e[a];i&&(o=Math.min(o,e[a-1]+t)),r&&(o=Math.min(o,e[a-512]+t),i&&(o=Math.min(o,e[a-512-1]+n)),i<511&&(o=Math.min(o,e[a-512+1]+n))),e[a]=o}for(let r=511;r>=0;r--)for(let i=511;i>=0;i--){let a=r*512+i,o=e[a];i<511&&(o=Math.min(o,e[a+1]+t)),r<511&&(o=Math.min(o,e[a+512]+t),i<511&&(o=Math.min(o,e[a+512+1]+n)),i&&(o=Math.min(o,e[a+512-1]+n))),e[a]=o}return e},c=(e,t)=>{let n=Math.min(511,Math.max(0,Math.floor((e+i)/a)));return Math.min(511,Math.max(0,Math.floor((t+i)/a)))*512+n},l=new Float32Array(262144).fill(1e9);for(let e=0;e<262144;e++)o[e]<.2&&(l[e]=0);s(l);let u=e.data.water||{},d=new Float32Array(262144).fill(1e9),f=[];for(let e of[u.river,u.creek].filter(Boolean)){let t=e.points;for(let n=0;n<t.length-1;n++){let r=Math.hypot(t[n+1][0]-t[n][0],t[n+1][2]-t[n][2]),i=Math.max(1,Math.ceil(r/2));for(let r=0;r<i;r++){let a=r/i,o=t[n][0]+(t[n+1][0]-t[n][0])*a,s=t[n][2]+(t[n+1][2]-t[n][2])*a,l=(e.width[n]??8)/2;f.push([o,s,l]),d[c(o,s)]=0}}}let p=u.falls?.pool;if(p)for(let e=0;e<64;e++)for(let t=0;t<=p.r;t+=4)d[c(p.x+Math.cos(e/64*6.283)*t,p.z+Math.sin(e/64*6.283)*t)]=0;s(d);let m=new Float32Array(262144).fill(1e9),h=e.data.tracks;for(let e of h)for(let t of e.centre)m[c(t[0],t[2])]=0;s(m);let g=e=>({cs:e,m:new Map}),_=(e,t,n,r)=>{let i=Math.floor(t/e.cs)*4096+Math.floor(n/e.cs),a=e.m.get(i);a||e.m.set(i,a=[]),a.push(r)},v=g(16);for(let e of f)_(v,e[0],e[1],e);let y=g(24);h.forEach((e,t)=>{for(let n=0;n<e.centre.length;n+=2)_(y,e.centre[n][0],e.centre[n][2],[e.centre[n][0],e.centre[n][2],t,n,e.width])});let b=(e,t,n,r)=>{let i=Math.floor(t/e.cs),a=Math.floor(n/e.cs);for(let t=-1;t<=1;t++)for(let n=-1;n<=1;n++){let o=e.m.get((i+t)*4096+a+n);if(o)for(let e of o)r(e)}},x=(e,t)=>{let n=1e9;return b(v,e,t,r=>{n=Math.min(n,Math.hypot(r[0]-e,r[1]-t)-r[2])}),p&&(n=Math.min(n,Math.hypot(p.x-e,p.z-t)-p.r)),n},S={edge:1e9,d:1e9,t:-1,i:-1},C=(e,t)=>{if(S.edge=1e9,S.d=1e9,S.t=-1,S.i=-1,m[c(e,t)]>34)return S;let n=Math.floor(e/y.cs),r=Math.floor(t/y.cs);for(let i=-1;i<=1;i++)for(let a=-1;a<=1;a++){let o=y.m.get((n+i)*4096+r+a);if(o)for(let n=0;n<o.length;n++){let r=o[n],i=r[0]-e,a=r[1]-t,s=i*i+a*a,c=S.edge+r[4]/2;if(s>=c*c)continue;let l=Math.sqrt(s);S.edge=l-r[4]/2,S.d=l,S.t=r[2],S.i=r[3]}}return S},w=(t,n,r,i)=>{if(!t)return 0;let a=Math.min(t.w-1,Math.max(0,Math.floor((n/e.extent+.5)*t.w))),o=Math.min(t.h-1,Math.max(0,Math.floor((r/e.extent+.5)*t.h)));return t.data[(o*t.w+a)*4+i]/255},T=new M;return{G:512,CS:a,half:i,h:o,coast:l,river:d,track:m,cellOf:c,waterAt:x,trackAt:C,vegAt:(i,a,o,s,c)=>{e.normalAt(i,a,T);let l=Math.sqrt(Math.max(0,1-T.y*T.y))/Math.max(.05,T.y),u=Fe(i/700,.5,a/700),d=W(20,140,s)*(1-W(.65,1,l))*(1-W(520,640,o+u*40));d*=.55+.45*W(-.3,.6,u),d=Math.max(d,(1-W(0,420,c))*W(5,30,s)*.95);let f=w(t,i,a,3),p=Math.max(w(n,i,a,0),w(r,i,a,2));return d=Math.max(d*(1-f*.8),w(t,i,a,2)),{v:d*(1-p),slope:l,rock:f,fresh:p}},sample:w}}var Is=class{constructor(e,t,{near:n=1,imp:r=null,shadow:i=!1,shrink:a=!1}={}){Object.assign(this,{name:e,model:t,near:n,imp:r,shadow:i,shrink:a}),this.list=[]}add(e,t,n,r,i,a,o){this.list.push([e,t,n,r,i,a,o])}};new M(0,1,0);var Ls=6,Rs=28,zs=class{constructor(e,t,n,r){this.P=n,this.kinds=e.filter(e=>e.list.length),this.imps=t,this.CELL=64,this.GN=64;for(let e of this.kinds){let t=e=>Math.min(63,Math.max(0,Math.floor((e[2]+2048)/64)))*64+Math.min(63,Math.max(0,Math.floor((e[0]+2048)/64)));e.list.sort((e,n)=>t(e)-t(n));let i=e.list.length;e.start=new Int32Array(4097);for(let n of e.list)e.start[t(n)+1]++;for(let t=0;t<4096;t++)e.start[t+1]+=e.start[t];e.pos=new Float32Array(i*2),e.tr=new Float32Array(i*5),e.col=new Float32Array(i*3),e.ex=new Float32Array(i),e.list.forEach((t,n)=>{e.pos[n*2]=t[0],e.pos[n*2+1]=t[2],e.tr.set([t[0],t[1],t[2],Math.cos(t[3])*t[4],Math.sin(t[3])*t[4]],n*5),e.col.set(t[6],n*3),e.ex[n]=t[5]}),e.list=null;let a=e.model.loParts?.length?e.model.loParts:null;e.full=a?n.full:1,e.r=n.near*e.near,e.b1=Math.min(8,e.r*e.full*.15),e.b2=Math.max(5,e.r*(e.imp?.08:.12));let o=Math.min(i,this.capacity(e,e.r+Ls));e.meshes=e.full>0?this.makeMesh(e.model.parts,o,r,e.shadow):[],e.meshesLo=a?this.makeMesh(a,o,r,e.shadow&&(e.full===0||e.r*e.full<50)):[]}for(let e of t){let t=this.kinds.filter(t=>t.imp?.type===e).reduce((e,t)=>e+Math.min(t.pos.length/2,this.capacity(t,n.far)),0);e.meshes=t?this.makeMesh([{geo:e.geo,mat:e.mat}],t,r,!1):[]}this.nearAt=null,this.farAt=null}capacity(e,t){let{GN:n,CELL:r}=this,i=Math.ceil(t/r),a=0;for(let t=0;t<n;t++)for(let r=0;r<n;r++){let o=0;for(let a=Math.max(0,t-i);a<=Math.min(n-1,t+i);a++)o+=e.start[a*n+Math.min(n-1,r+i)+1]-e.start[a*n+Math.max(0,r-i)];o>a&&(a=o)}return Math.max(16,a)}makeMesh(e,t,n,r){let[i,a,o,s]=this.buffers(t);return e.map(({geo:e,mat:t})=>{let c=e.clone();c.setAttribute(`iw`,o),c.setAttribute(`ifd`,s);let l=new oe(c,t,0);return l.instanceMatrix=i,l.instanceColor=a,l.count=0,l.visible=!1,l.frustumCulled=!1,l.castShadow=r,l.receiveShadow=!0,t.userData.depth&&(l.customDepthMaterial=t.userData.depth),n.add(l),l})}buffers(e){return[new ke(new Float32Array(e*16),16),new ke(new Float32Array(e*3),3),new ke(new Float32Array(e*2),2),new ke(new Float32Array(e*4),4)].map(e=>e.setUsage(O))}writer(e){if(!e.length)return null;let t=e[0].geometry;return{meshes:e,A:e[0].instanceMatrix.array,C:e[0].instanceColor.array,E:t.attributes.iw.array,F:t.attributes.ifd.array,n:0}}put(e,t,n,r,i=1){e.n*16>=e.A.length&&this.grow(e);let a=e.n++,o=a*16,s=t.tr,c=n*5,l=s[c+3]*i,u=s[c+4]*i,d=e.A;d[o]=l,d[o+1]=0,d[o+2]=-u,d[o+3]=0,d[o+4]=0,d[o+5]=Math.hypot(l,u),d[o+6]=0,d[o+7]=0,d[o+8]=u,d[o+9]=0,d[o+10]=l,d[o+11]=0,d[o+12]=s[c],d[o+13]=s[c+1],d[o+14]=s[c+2],d[o+15]=1,e.C[a*3]=t.col[n*3],e.C[a*3+1]=t.col[n*3+1],e.C[a*3+2]=t.col[n*3+2],e.E[a*2]=t.ex[n],e.E[a*2+1]=+!!t.shrink,e.F[a*4]=r[0],e.F[a*4+1]=r[1],e.F[a*4+2]=r[2],e.F[a*4+3]=r[3]}grow(e){let[t,n,r,i]=this.buffers(e.A.length/8);t.array.set(e.A),n.array.set(e.C),r.array.set(e.E),i.array.set(e.F);for(let a of e.meshes)a.instanceMatrix=t,a.instanceColor=n,a.geometry.setAttribute(`iw`,r),a.geometry.setAttribute(`ifd`,i);e.A=t.array,e.C=n.array,e.E=r.array,e.F=i.array}done(e){if(!e)return;let t=e.meshes[0];for(let n of[t.instanceMatrix,t.instanceColor,t.geometry.attributes.iw,t.geometry.attributes.ifd])n.clearUpdateRanges(),n.addUpdateRange(0,e.n*n.itemSize),n.needsUpdate=!0;for(let t of e.meshes)t.count=e.n,t.visible=e.n>0}walk(e,t,n,r,i){let{CELL:a,GN:o}=this,s=Math.max(0,Math.floor((t-r+2048)/a)),c=Math.min(o-1,Math.floor((t+r+2048)/a)),l=Math.max(0,Math.floor((n-r+2048)/a)),u=Math.min(o-1,Math.floor((n+r+2048)/a)),d=r*r,f=e.pos;for(let r=l;r<=u;r++){let a=e.start[r*o+s],l=e.start[r*o+c+1];for(let e=a;e<l;e++){let r=f[e*2]-t,a=f[e*2+1]-n,o=r*r+a*a;o<d&&i(e,o)}}}update(e,t=!1){let n=e.x,r=e.z,i=this.P,a=0;if(t||!this.nearAt||Math.hypot(n-this.nearAt.x,r-this.nearAt.z)>Ls){this.nearAt={x:n,z:r};for(let e of this.kinds){let t=this.writer(e.meshes),i=this.writer(e.meshesLo),o=e.r,s=o*e.full,c=o-e.b2,l=i?[-2,-1,s-e.b1,s]:[-2,-1,c,o],u=t?[s-e.b1,s,c,o]:[-2,-1,c,o],d=t&&i?(s+Ls)**2:1/0,f=t?Math.max(0,s-e.b1-Ls)**2:-1;this.walk(e,n,r,o+Ls,(n,r)=>{t&&r<d&&this.put(t,e,n,l),i&&r>f&&this.put(i,e,n,u)}),this.done(t),this.done(i),a+=(t?.n||0)+(i?.n||0)}this.nearCount=a,this.drawn=Object.fromEntries(this.kinds.map(e=>[e.name,[e.meshes[0]?.count||0,e.meshesLo[0]?.count||0]]))}let o=t?this.imps.length:1;for(let e of this.imps){if(!o)break;if(!t&&e.at&&Math.hypot(n-e.at.x,r-e.at.z)<Rs)continue;o--,e.at={x:n,z:r};let a=this.writer(e.meshes);if(a){for(let t of this.kinds){if(t.imp?.type!==e)continue;let o=Math.max(0,t.r-t.b2-Rs-4),s=o*o,c=[t.r-t.b2,t.r,i.far*.9,i.far];this.walk(t,n,r,i.far,(e,n)=>{n>=s&&this.put(a,t,e,c,t.imp.scale)})}this.done(a),e.count=a.n}}}};async function Bs(e){let{renderer:t,scene:n,world:r,quality:i,tracks:o}=e,s=Cs[i.name]||(i.aiLod?Cs.low:Cs.high),c=we(90210),l=new _e,[u,d,f,p,m,g]=await Promise.all([l.loadAsync(`${xs}/foliage${s.tex}.webp`),l.loadAsync(`${xs}/bark.jpg`),l.loadAsync(`${xs}/bark_n.jpg`),Ps(`${bs}${r.dir}/biome.png`),Ps(`${bs}${r.dir}/lava_masks.png`),Ps(`${bs}${r.dir}/masks.png`)]);u.colorSpace=k,u.anisotropy=4,d.colorSpace=k;for(let e of[d,f])e.wrapS=e.wrapT=a,e.anisotropy=4;let _={leaf:Es(new h({map:u,alphaTest:.42,side:2,vertexColors:!0,roughness:.72,metalness:0,envMapIntensity:.6}),{leaf:!0,texSize:u.image.width,lite:!s.detail}),bark:Es(new h({map:d,normalMap:f,vertexColors:!0,roughness:.92,metalness:0,envMapIntensity:.65}),{lite:!s.detail})};for(let e of Object.values(_))e.userData.depth=Ds(e);let v=new b;v.name=`kaiele-vegetation`,n.add(v);let x=performance.now(),S=Fs(r,p,m,g),C=Ns(r,i);S.groundAt=C;let w=s.detail,T=(e,t)=>[e&&{geo:e,mat:_.bark},t&&{geo:t,mat:_.leaf}].filter(Boolean),E=e=>({...e,parts:T(e.bark,e.leaves),loParts:e.lo?T(e.lo.bark,e.lo.leaves):null}),D=w?1:.5,O=e=>Math.max(1,Math.round(e*D)),ee=Array.from({length:O(6)},(e,t)=>E(ts(c,{H:13+c()*3,lean:t%2?.32+c()*.18:.06+c()*.12,detail:w}))),te=Array.from({length:O(3)},()=>E(ns(c,{H:22,spread:9+c()*4,vines:w?3:1,detail:w}))),ne=Array.from({length:O(2)},()=>E(ns(c,{H:18,spread:8+c()*2,pale:!0,vines:0,detail:w}))),re=Array.from({length:O(2)},(e,t)=>E(ns(c,{H:9,spread:6,pale:t===1,vines:0,detail:w,clusterK:.85,low:!0}))),A=[E(ns(c,{H:24,spread:9,over:.6,lean:.12,vines:w?6:2,detail:w})),E(ns(c,{H:26,spread:10,over:.7,lean:.18,vines:0,detail:w})),E(ns(c,{H:22,spread:8,over:.5,lean:.08,pale:!0,vines:w?4:1,detail:w}))];for(let e of A){let t=e.leaves.attributes.position;e.reach=0,e.lowOver=1e9;for(let n=0;n<t.count;n++)e.reach=Math.max(e.reach,t.getX(n)),t.getX(n)>2.5&&(e.lowOver=Math.min(e.lowOver,t.getY(n)))}let ie=Array.from({length:O(3)},()=>E(rs(c,{trunkH:2.5+c()*2.5,L:2.6+c()*.8,detail:w}))),ae=Array.from({length:O(2)},()=>E(rs(c,{trunkH:0,L:1.2+c()*.4,detail:w}))),j=Array.from({length:O(2)},()=>E(is(c,{H:3.5+c(),detail:w}))),oe=Array.from({length:O(2)},()=>E(as(c,{H:11+c()*3,R:1.5+c(),detail:w}))),se=[E(ss(c,U.monstera,{n:8,s:1.1,detail:w}))],ce=[E(os(c,U.ti,{k:3,w:1.4,h:1.7}))],le=[E(os(c,U.ginger,{k:3,w:.9,h:1.9}))],ue=Array.from({length:O(3)},()=>E(os(c,U.grass,{k:4,w:.8+c()*.4,h:.6+c()*.3,up:!0,tilt:.5}))),de=Array.from({length:O(3)},(e,t)=>E(cs(c,[[U.fern,U.monstera,U.canopy],[U.fern,U.vine,U.kukui],[U.monstera,U.fern,U.ti]][t],{n:12+Math.floor(c()*6),R:1.8,s:1.1}))),fe=Array.from({length:O(2)},()=>E(ls(c,U.naupaka,{n:w?22:14,R:1.1,h:.9,s:.95}))),pe=[{model:ee[ee.length-1]},{model:te[0]},{model:ne[0]},{model:oe[0]},{model:re[0]}];Ms(t,pe,_,!s.detail);for(let e of pe)e.H=e.model.H;let[me,he,ge,ve,ye]=pe,N=[],be=(e,t)=>e.map((e,n)=>{let r=t.imp?{type:t.imp,scale:e.H/t.imp.H}:null,i=new Is(`${t.name}${n}`,e,{...t,imp:r});return N.push(i),i}),xe=be(ee,{name:`palm`,near:1,imp:me,shadow:!0}),Se=be(te,{name:`tree`,near:.8,imp:he,shadow:!0}),Ce=be(ne,{name:`pale`,near:.8,imp:ge,shadow:!0}),Te=[be([re[0]],{name:`small`,near:.75,imp:ye,shadow:!0})[0],be([re[re.length-1]],{name:`smallp`,near:.75,imp:ye,shadow:!0})[0]],Ee=be(A,{name:`tunnel`,near:1.15,imp:he,shadow:!0}),P=be(ie,{name:`fern`,near:.75,shadow:!0}),F=be(ae,{name:`gfern`,near:.4}),De=be(j,{name:`banana`,near:.6,shadow:!0}),Oe=be(oe,{name:`bamboo`,near:1,imp:ve,shadow:!0}),ke=be(se,{name:`monstera`,near:.4}),Ae=be(ce,{name:`ti`,near:.4}),je=be(le,{name:`ginger`,near:.4}),Me=be(ue,{name:`grass`,near:.3,shrink:!0}),Ne=be(de,{name:`carpet`,near:.36}),Pe=be(fe,{name:`naupaka`,near:.5}),Ie=e=>e[Math.floor(c()*e.length)],Le=r.data,Re=o.map(e=>{let t=new Uint8Array(e.n);for(let n=0;n<e.n;n++)if(e.c[n][4])for(let r=-30;r<=30;r++)t[e.wrap(n+r)]=1;for(let n of e.jumps||[])for(let r=-40;r<=40;r++)t[e.wrap(n.at+r)]=1;return t}),ze=e=>o.findIndex(t=>t.id===Le.tracks[e]?.id),Be=[];for(let e of o){let t=e.c[e.wrap(e.line??e.start)];if(e.id===`wailele`&&Be.push([t[0],t[2],60]),e.id===`palikai`){Be.push([e.c[0][0],e.c[0][2],50]);let t=e.c[e.n-1];Be.push([t[0],t[2],40])}e.id===`kahakai`&&Be.push([t[0],t[2],30])}for(let e of Le.buildings||[])Be.push([e.x,e.z,Math.max(e.w,e.d)/2+3.5]);let Ve=new Uint8Array(S.G*S.G);for(let[e,t,n]of Be)for(let r=-n-16;r<=n+16;r+=4)for(let i=-n-16;i<=n+16;i+=4)Ve[S.cellOf(e+i,t+r)]=1;let I=(e,t,n=0)=>Ve[S.cellOf(e,t)]===1&&Be.some(([r,i,a])=>(e-r)**2+(t-i)**2<Math.max(0,a+n)**2),He=e=>Le.tracks[e]?.id===`wailele`,L=(e,t)=>{if(e.t<0)return!0;let n=ze(e.t),r=n>=0&&Re[n][e.i],i=t===`tree`?r?9:He(e.t)?2.8:3.8:t===`bush`?r?4:He(e.t)?1.2:1.8:1.1;return e.edge>i},Ue=[],We=(e,t,n,r,i,a=6)=>{let o=S.trackAt(e,n);if(o.t<0||o.d>Le.tracks[o.t].width/2+15)return;let s=Math.max(.35,r*1.6);Ue.push({x:e,y:t-.6,z:n,w:s,d:s,h:a,yaw:i})},Ge=(e,t,n,r)=>{let i=1+.5*(1-W(0,250,r));return t<-1150&&(i+=1.5*W(35,75,n)*(1-W(150,500,r))),i},Ke=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],qe=(e,t)=>Math.atan2(-t,e),Je=[],Ye=new M,Xe=o.find(e=>e.id===`wailele`);if(Xe&&Xe.gorge&&Xe.trestle){let e=Xe.gorge.land+12,t=Xe.trestle[0]-8,n=-1,i=0,a=e+60+c()*50;for(let o=e;o<t;o+=5+c()*4){let e=Math.round(o);Je.push(e),e>a&&(n=e+10+c()*14,i=c()<.4?0:c()<.5?-1:1,a=e+80+c()*60);let t=Xe.frame(e),s=Xe.c[e][1];for(let a of[-1,1])if(!(e<n&&(i===0||i===a)))for(let[e,n]of[[3,6.5],[6.5,10],[2.8,4]]){let i=a*(Xe.width/2+e+c()*(n-e)),o=t.x+t.nx*i+t.tx*(c()-.5)*2,l=t.z+t.nz*i+t.tz*(c()-.5)*2;if(!L(S.trackAt(o,l),`tree`)||S.waterAt(o,l)<4||I(o,l)||r.normalAt(o,l,Ye).y<.35)continue;let u=C(o,l)-(1-Ye.y)*4,d=Math.floor(c()*Ee.length),f=y.clamp((Math.abs(i)+1.5+c()*2)/A[d].reach,.75,1.3);if(u+A[d].lowOver*f<s+6.5&&(d=1,u+A[1].lowOver*f<s+6.5))continue;let p=qe(-t.nx*a,-t.nz*a)+(c()-.5)*.3;Ee[d].add(o,u-.3,l,p,f,.8,Ke([1,1,1],[.85,.95,.8],c())),We(o,u,l,A[d].trunkR*f,p,8);break}}}let{G:Ze,CS:Qe,half:$e}=S,et=performance.now(),tt=Math.round(et-x),nt=0;for(let e=0;e<Ze;e++)for(let t=0;t<Ze;t++){let n=e*Ze+t,i=S.h[n];if(i<.4)continue;let a=S.coast[n],o=S.river[n],l=S.track[n],u=-$e+(t+.5)*Qe,d=-$e+(e+.5)*Qe,f=S.vegAt(u,d,i,a,o),m=f.v,h=d<-1150?W(25,60,i)*(1-W(250,600,a)):0,g=(1-W(18,60,i))*(1-W(250,600,a))*W(60,160,o),_=W(.45,.85,m)*W(15,60,a)*(1-.9*h)*(1-.92*g),v=Qe*Qe,y=l<130,b=(e,t,n=1.4)=>{let i=Math.floor(e*v+c());for(;i-->0;){let e=u+(c()-.5)*Qe,i=d+(c()-.5)*Qe;nt++,r.normalAt(e,i,Ye),!(Ye.y<1/Math.sqrt(1+n*n))&&t(e,i,C(e,i))}},x=(e,t,n)=>o>30||S.waterAt(e,t)>n,w=(1-W(70,140,a))*W(4,12,a)*(1-W(18,30,i))*(1-W(.35,.6,f.slope)),T=(1-W(250,550,a))*(1-W(30,70,i))*(1-h),E=W(-.15,.45,Fe(u/70,3.3,d/70)),D=(w*E*1.2+T*(.04+(y?.5:.15)*E))/110*s.trees;D>0&&b(D,(e,t,n)=>{if(n<1.2||!x(e,t,4)||I(e,t))return;let r=S.trackAt(e,t);if(!L(r,`tree`))return;let i=S.coast[S.cellOf(e+Qe,t)]-S.coast[S.cellOf(e-Qe,t)],o=S.coast[S.cellOf(e,t+Qe)]-S.coast[S.cellOf(e,t-Qe)],s=1-W(20,120,a),l=+(c()<.5+s*.4)+2*Math.floor(c()*Math.ceil(xe.length/2)),u=Math.min(xe.length-1,l),d=9+c()*12,f=(Math.hypot(i,o)>.1?qe(-i,-o):c()*6.28)+(c()-.5)*.9,p=d/ee[u].H;xe[u].add(e,n-.15,t,f,p,Ge(e,t,n,a),Ke([1,1,1],[1.05,1,.85],c())),We(e,n,t,ee[u].trunkR*p,f,4)},.7);let O=(1-W(45,90,a))*W(3,8,a)*(1-W(14,25,i))*(y?1:.25);O>0&&b(O/22*s.small,(e,t,n)=>{n<.9||!x(e,t,2)||L(S.trackAt(e,t),`bush`)&&!I(e,t)&&Pe[Math.floor(c()*Pe.length)].add(e,n-.15,t,c()*6.28,1.1+c()*1.1,Ge(e,t,n,a),Ke([1,1,1],[1.1,1.05,.85],c()))},.9);let k=l>500?.55:1,te=(_/(l<70?58:32)+W(.15,.4,m)*(1-_)/700)*s.trees*k;te>0&&b(te,(e,t,n)=>{if(!x(e,t,4)||I(e,t))return;let r=S.trackAt(e,t);if(!L(r,`tree`))return;let i=_>.3&&c()<.85,o=c()<(i?.18:.4)+.2*(1-W(50,200,S.river[S.cellOf(e,t)])),s,l;if(i){let e=o?Ce:Se;s=e[Math.floor(c()*e.length)],l=s.model}else s=Te[+!!o],l=s.model;let u=(i?(11+c()*17)*(.8+.2*_):6+c()*7)/l.H;if(!i&&r.t>=0&&r.edge<7.5*u+1)return;let d=c()*6.28;s.add(e,n-.3-(1-Ye.y)*4,t,d,u,(i?.85:1.1)*Ge(e,t,n,a),Ke(o?[.8,.86,.78]:[.78,.9,.74],o?[.95,.97,.86]:[1.05,1.02,.86],c())),We(e,n,t,l.trunkR*u,d)},1.2);let ne=_*(1+1.5*(1-W(40,200,o))+(l<60?1.5:0))/90*s.trees*(1-W(150,260,l));ne>0&&b(ne,(e,t,n)=>{if(!x(e,t,2)||I(e,t))return;let r=S.trackAt(e,t);if(!L(r,`bush`)||r.edge<2)return;let i=Ie(P),a=.7+c()*.6;i.add(e,n-.2,t,c()*6.28,a,1,Ke([1,1,1],[.85,1,.8],c())),We(e,n,t,.22*a,0,4)},1);let re=(1-W(15,110,o))*W(10,30,a)*W(.2,.5,m)*(1-W(300,450,l));re>0&&(b(re/260*s.trees,(e,t,n)=>{x(e,t,3)&&!I(e,t)&&L(S.trackAt(e,t),`bush`)&&Ie(De).add(e,n-.1,t,c()*6.28,.8+c()*.5,1.1,Ke([1,1,1],[1.1,1.05,.8],c()))},.9),b(re*E/1400*s.trees,(e,t,n)=>{x(e,t,5)&&!I(e,t)&&(S.trackAt(e,t).edge<5.5||Ie(Oe).add(e,n-.2,t,c()*6.28,.85+c()*.3,1,Ke([1,1,1],[1.1,1.08,.8],c())))},.8));let A=l<40&&Xe&&Math.hypot(u-0,d-200)<700?.8:0,ie=Math.max(_,A);if(y&&ie>.15&&(b(ie*(l<30?2.2:1)/14*s.small,(e,t,n)=>{if(!x(e,t,1)||I(e,t))return;let r=S.trackAt(e,t);if(!L(r,`bush`))return;let i=c(),a=.8,o=Ke([1,1,1],[.8,.9,.75],c());i<.4?Ie(F).add(e,n-.05,t,c()*6.28,.7+c()*.7,a,o):i<.62?ke[0].add(e,n-.05,t,c()*6.28,.7+c()*.6,a,o):i<.82?Ae[0].add(e,n-.05,t,c()*6.28,.7+c()*.6,a,Ke([1,1,1],[1.25,.7,.75],c()**2)):je[0].add(e,n-.05,t,c()*6.28,.7+c()*.5,a,o)},1.1),b(ie*(l<30?1.3:.8)/9*s.small,(e,t,n)=>{x(e,t,.5)&&!I(e,t)&&L(S.trackAt(e,t),`grass`)&&Ie(Ne).add(e,n-.03,t,c()*6.28,.8+c()*.5,.6,Ke([.85,.9,.8],[1.05,1,.85],c()))},1.3)),l<110){let e=Math.max(S.sample(p,u,d,0),(1-W(25,60,a))*(1-W(5,9,i))),t=(.35+.65*W(.1,.35,m))*(1-.75*_)*(1-e*.9)*(1-f.rock*.85)*(1-f.fresh*.9),n=l<40?2.4:1.2,r=W(-.1,.5,Fe(u/45,7.7,d/45));t>.02&&b(t*n/3*s.small,(e,t,n)=>{if(n<.8||!x(e,t,.5))return;let i=S.trackAt(e,t);L(i,`grass`)&&!I(e,t,-10)&&Ie(Me).add(e,n-.04,t,c()*6.28,.6+c()*.8,Ge(e,t,n,a),Ke([.85,.95,.8],[1.2,1.08,.68],Math.min(1,c()*.5+r*(.3+.4*(1-m)))))}),(f.rock>.4||f.fresh>.3)&&b(.012*s.small,(e,t,n)=>{L(S.trackAt(e,t),`bush`)&&Ie(F).add(e,n-.05,t,c()*6.28,.4+c()*.4,1,Ke([1,1,1],[1.2,.9,.7],c()))})}}let rt=Object.fromEntries(N.map(e=>[e.name,e.list.length])),it=N.reduce((e,t)=>e+t.list.length,0);console.info(`kaiele vegetation: ${it} plants (${nt} tried) in ${Math.round(performance.now()-et)} ms (fields, models, impostors ${tt} ms)`,JSON.stringify(rt),`${Ue.length} trunk colliders`);let at=new zs(N,pe,s,v),ot=e.camera?.position||new M;at.update(ot,!0);let st=await ys(e,{F:S,tunnelRows:Je,palms:xe,trees:[...Se,...Ee]}),ct=new URLSearchParams(location.search).has(`vegstats`)?window.__veg={renderer:t,lod:at,ms:0,counts:rt}:null;return{colliders:Ue,group:v,update(e,n,r,i){if(wt.uTime.value=e,r){ct&&(t.info.autoReset=!1,t.info.reset());let e=ct&&performance.now();at.update(r.position),ct&&(ct.ms=Math.max(ct.ms,performance.now()-e))}st?.update(e,n,r,i)}}}var Vs=96,Hs={pebble:{r:45,cast:!1},coral:{r:45,cast:!1},shell:{r:30,cast:!1},limu:{r:60,cast:!1},stick:{r:110,cast:!0},nut:{r:110,cast:!0},grass:{r:120,cast:!1}},Us=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)};function Ws(e,t,n=5,r=.25){let i=new Pe(1,1),a=i.attributes.position,o=new M,s=Array.from({length:n},()=>[new M(e()-.5,e()-.5,e()-.5).normalize(),(e()-.4)*r]);for(let e=0;e<a.count;e++){o.fromBufferAttribute(a,e);let n=1;for(let[e,t]of s)n+=t*Math.max(0,o.dot(e))**3;o.multiplyScalar(n),o.y=o.y*t+t*.55,a.setXYZ(e,o.x,o.y,o.z)}return i.computeVertexNormals(),i}function Gs(e,t,n){let r=e.attributes.position,i=new Float32Array(r.count*3),a=1e-4;for(let e=0;e<r.count;e++)a=Math.max(a,r.getY(e));for(let e=0;e<r.count;e++){let o=Math.min(1,Math.max(0,r.getY(e)/a));for(let r=0;r<3;r++)i[e*3+r]=n[r]+(t[r]-n[r])*o}return e.setAttribute(`color`,new Le(i,3)),e}function Ks(){let e=new t(1,10,5,0,Math.PI*2,0,Math.PI/2),n=e.attributes.position;for(let e=0;e<n.count;e++){let t=n.getX(e),r=n.getY(e),i=n.getZ(e),a=1+.08*Math.cos(Math.atan2(i,t)*9);n.setXYZ(e,t*a*.62,r*.45,i*a)}return e.computeVertexNormals(),Gs(e,[1,1,1],[.8,.78,.74])}function qs(e){let t=[];for(let n=0;n<4;n++){let i=new r(.12,.16,1,5,1);i.rotateZ(Math.PI/2+(e()-.5)*.6),i.rotateY(n*1.4+e()),i.translate((e()-.5)*.4,.12,(e()-.5)*.4),t.push(i)}return Gs(Xs(t),[1,.97,.92],[.82,.78,.72])}function Js(e){let t=new r(.6,1,1,6,4,!1),n=t.attributes.position,i=(e()-.5)*.5;for(let e=0;e<n.count;e++){let t=n.getY(e);n.setX(e,n.getX(e)+i*(t*t-.25)*8)}return t.rotateZ(Math.PI/2),t.translate(0,.8,0),t.computeVertexNormals(),Gs(t,[.62,.58,.52],[.42,.38,.33])}function Ys(e){let t=[],n=[],r=[];for(let i=0;i<16;i++){let i=e()*Math.PI*2,a=.25+e()*.6,o=.55+e()*.45,s=.02+e()*.012,c=Math.cos(i),l=Math.sin(i),u=-l*s,d=c*s,f=t.length/3;for(let e=0;e<=3;e++){let r=e/3,i=a*r*r*.9+.03,s=o*(r-a*.35*r*r),f=1-r*.92;t.push(c*i-u*f,s,l*i-d*f,c*i+u*f,s,l*i+d*f);let p=[.16+r*.32,.22+r*.26,.08+r*.12];n.push(...p,...p)}for(let e=0;e<3;e++){let t=f+e*2;r.push(t,t+1,t+2,t+1,t+3,t+2)}}let i=new I;i.setAttribute(`position`,new P(t,3)),i.setAttribute(`color`,new P(n,3)),i.setIndex(r),i.computeVertexNormals();let a=i.attributes.normal;for(let e=0;e<a.count;e++){let t=Math.abs(a.getY(e))+1.2;a.setXYZ(e,a.getX(e)*.4,t,a.getZ(e)*.4)}for(let e=0;e<a.count;e++){let t=new M().fromBufferAttribute(a,e).normalize();a.setXYZ(e,t.x,t.y,t.z)}return i}function Xs(e){let t=[],n=[],r=[];for(let i of e){let e=i.index?i:i.toNonIndexed(),a=t.length/3;if(t.push(...e.attributes.position.array),n.push(...e.attributes.normal.array),e.index)for(let t of e.index.array)r.push(a+t)}let i=new I;return i.setAttribute(`position`,new P(t,3)),i.setAttribute(`normal`,new P(n,3)),i.setIndex(r),i}function Zs(e){let{scene:t,world:r,quality:a,tracks:s}=e,c=a.terrainStep>3,l=c?.35:a.ultra?1.4:1,d=we(9157),f=$a(r).userData.at,p={rock:new h({vertexColors:!0,roughness:.55,metalness:0}),bone:new h({vertexColors:!0,roughness:.75,metalness:0}),limu:new h({vertexColors:!0,roughness:.35,metalness:0}),wood:new h({vertexColors:!0,roughness:.95,metalness:0}),grass:new h({vertexColors:!0,roughness:.85,metalness:0,side:2})};p.grass.onBeforeCompile=e=>{Object.assign(e.uniforms,{uWind:wt.uTime,uWindK:Ss.strength,uWindDir:Ss.dir}),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uWind, uWindK; uniform vec2 uWindDir;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
{
  vec2 wp = instanceMatrix[3].xz;
  float k = transformed.y * transformed.y * uWindK;
  float g = 0.6 + 0.4 * sin(uWind * 1.9 + dot(wp, vec2(0.3, 0.21))) * sin(uWind * 0.7 + wp.x * 0.05);
  vec2 d = uWindDir * k * (0.18 + 0.12 * g);
  transformed += inverse(mat3(instanceMatrix)) * vec3(d.x, -k * 0.05, d.y);
}`)},p.grass.customProgramCacheKey=()=>`kaiele-beachgrass`;let m={pebble:[Gs(Ws(d,.55),[1,1,1],[.75,.75,.75]),Gs(Ws(d,.4,7,.4),[1,1,1],[.7,.7,.7])],coral:[qs(d),Gs(Ws(d,.6,9,.5),[1,.98,.94],[.8,.77,.72])],shell:[Ks()],limu:[Gs(Ws(d,.14,9,.7),[1,1,1],[.6,.6,.6])],stick:[Js(d),Js(d)],nut:[Gs(Ws(d,.85,4,.15),[1,1,1],[.7,.7,.7])],grass:[Ys(d),Ys(d)]},g={pebble:p.rock,coral:p.bone,shell:p.bone,limu:p.limu,stick:p.wood,nut:p.wood,grass:p.grass},_=new Map,v=(e,t,n,i,a,o,s,c=.15)=>{let l=`${Math.floor(t/Vs)},${Math.floor(n/Vs)}`,u=_.get(l);u||_.set(l,u={x:(Math.floor(t/Vs)+.5)*Vs,z:(Math.floor(n/Vs)+.5)*Vs,items:{}});let f=Math.floor(d()*m[e].length);(u.items[e]||=m[e].map(()=>[]))[f].push([t,r.heightAt(t,n),n,i,a,o,s,c])},y=new Map,x=s.filter(e=>e.surf&&e.c.some((t,n)=>[1,2,10].includes(e.surf[n])));for(let e of x)for(let t=0;t<e.n;t+=2){let n=e.c[t],r=`${Math.floor(n[0]/8)},${Math.floor(n[2]/8)}`;(y.get(r)||y.set(r,[]).get(r)).push([n[0],n[2],e.width/2])}let S=(e,t,n)=>{let r=Math.floor(e/8),i=Math.floor(t/8);for(let a=i-2;a<=i+2;a++)for(let i=r-2;i<=r+2;i++)for(let[r,o,s]of y.get(`${i},${a}`)||[])if(Math.hypot(e-r,t-o)<s+n)return!1;return!0},C=new Set,w=0;for(let e of x)for(let t=0;t<e.n;t+=6){if(![1,2,10].includes(e.surf[t]))continue;let n=e.frame(t),i=e.surf[t]===10,a=`${Math.floor(n.x/24)},${Math.floor(n.z/24)}`;if(!C.has(a)){C.add(a);for(let e=-3;e<=3;e++)for(let t=-3;t<=3;t++){let a=`${Math.floor(n.x/24)+t},${Math.floor(n.z/24)+e}`;if(C.has(`c`+a))continue;C.add(`c`+a);let o=(Math.floor(n.x/24)+t)*24,s=(Math.floor(n.z/24)+e)*24,c=Math.round(600*l);for(let e=0;e<c;e++){let e=o+d()*24,t=s+d()*24,n=r.heightAt(e,t);if(n<.15||n>14)continue;let[a,c]=f(e,t);if(a<1||a>70||r.normalAt(e,t,new M).y<.93)continue;let l=Math.max(a/(24*c*1.2),n/(1.3+1.32*c)),u=d(),p=Math.exp(-(((l-1)/.06)**2))+.5*Math.exp(-(((l-1.3)/.05)**2));if(!S(e,t,l>1.4?2.5:1.2))continue;let m=(.08+.5*p+.25*Us(.15,.4,l)*(1-Us(.8,1,l)))*(l<1.8?1:.15);if(u<m*.35){let n=d()<(i?.15:.85),r=.025+d()**2*.09,a=n?.035+d()*.03:.6+d()*.15;v(n?`pebble`:`coral`,e,t,r,r,d()*6.28,n?[a,a*.97,a*.95]:[a,a*.95,a*.86]),w++}else if(u<m*.35+(.05+.3*p)*.12){let n=.015+d()*.03,r=d();v(`shell`,e,t,n,n,d()*6.28,r<.6?[.85,.8,.72]:r<.85?[.8,.6,.52]:[.55,.42,.3],.3),w++}else if(p>.25&&u<.6+p*.08){let n=d();if(n<.55){let n=.12+d()*.3,r=d();v(`limu`,e,t,n,n,d()*6.28,[.05+r*.04,.045+r*.03,.02])}else if(n<.8){let n=.3+d()**2*1.6;v(`stick`,e,t,n,.015+d()*.03+n*.02,d()*6.28,[.9+d()*.3,.9+d()*.25,.85+d()*.2],.08)}else if(n<.86){let n=d()<.5;v(`nut`,e,t,.1+d()*.03,.1,d()*6.28,n?[.32,.22,.13]:[.42,.36,.14],.3)}w++}else if(l>1.45&&a>14){let n=.5+.5*Math.sin(e*.21+Math.sin(t*.13)*2)*Math.sin(t*.17+Math.sin(e*.11)*2);if(u<.5*Us(1.45,2.2,l)*Us(.45,.8,n)){let n=.3+d()*.35,r=d();v(`grass`,e,t,n,n*(.8+d()*.5),d()*6.28,[.75+r*.5,.8+r*.35,.6+r*.2],.1),w++}}}}}}let T=new b,E=new i,D=new n,O=new u,ee=new o,k=[];for(let e of _.values()){e.meshes=[];for(let[t,n]of Object.entries(e.items))n.forEach((n,r)=>{if(!n.length)return;let i=new oe(m[t][r],g[t],n.length);n.forEach(([e,n,r,a,o,s,c,l],u)=>{O.set((d()-.5)*l,s,(d()-.5)*l),D.setFromEuler(O);let f=t===`stick`?[a,o,o]:[a,o,a*(.8+d()*.4)],p=t===`grass`?.05:t===`stick`?o*.6:o*.25;E.compose(new M(e,n-p,r),D,new M(...f)),i.setMatrixAt(u,E),i.setColorAt(u,ee.setRGB(c[0],c[1],c[2]))}),i.castShadow=Hs[t].cast&&!c,i.receiveShadow=!0,i.computeBoundingSphere(),i.userData.r=Hs[t].r*(c?.7:1),i.visible=!1,T.add(i),e.meshes.push(i)});k.push(e)}return t.add(T),console.info(`kaiele beach detail: ${w} pieces in ${_.size} tiles`),{update(e,t,n){if(!n)return;let r=n.position.x,i=n.position.z;for(let e of k){let t=Math.hypot(Math.max(Math.abs(r-e.x)-Vs/2,0),Math.max(Math.abs(i-e.z)-Vs/2,0));for(let n of e.meshes)n.visible=t<n.userData.r}}}}var Qs={kahakai:()=>Et(()=>import(`./kahakai-CxuW0rtK.js`),__vite__mapDeps([0,1,2,3]),import.meta.url),wailele:()=>Et(()=>import(`./wailele-BSek1cNA.js`),__vite__mapDeps([4,1,2,5]),import.meta.url),palikai:()=>Et(()=>import(`./palikai-Ey_RFzUi.js`),__vite__mapDeps([6,1,2,3]),import.meta.url),kulapele:()=>Et(()=>import(`./lavaevents--oOzjFU4.js`),__vite__mapDeps([7,1,8,9,2]),import.meta.url),ahikekai:()=>Et(()=>import(`./lavaevents--oOzjFU4.js`),__vite__mapDeps([7,1,8,9,2]),import.meta.url)},$s=class{constructor(e){Object.assign(this,e),this.events=e.events,this.mod=e.island.events?.[e.track.id]?new e.island.events[e.track.id](this):null,e.track.bridge&&!e.island.ownBridges?.has(e.track.id)&&(this.bridge=new Tt({phys:e.phys,scene:e.scene,track:e.track,world:e.world,M:e.M}))}get lavaGap(){return this.mod?.lavaGap}get env(){return this.mod?.env}pre(e,t){for(let e of t.cars){let t=Ft(this.track,e.i),n=e.v,r=this.island.wetness?this.island.wetness(n.group.position,this.track,e.i):0;n.surfGrip=t.grip*(1-r*.12),n.surfDrag=t.drag+r*600,n.surfName=t.name}this.mod?.pre(e,t)}post(e,t){this.mod?.post(e,t),this.bridge?.update(this.fx.time)}dispose(){this.mod?.dispose(),this.bridge?.dispose(this.phys,this.scene)}};async function ec(e){let{scene:t,world:n,M:r,quality:i,tracks:a,fog:o}=e;e.rnd=we(4242),o.color.setRGB(.66,.76,.86),o.density=16e-5,o.sun=3.1,e.sky=await xo(e),t.add(await ao(n,r,i));for(let e of n.data.tracks)t.add(fo(n,r,e,i));let s=[],c=Bo(e);s.push(c),e.loadStep?.(.36,`FILLING THE RIVERS…`),s.push(Go(e)),e.loadStep?.(.4,`GROWING THE JUNGLE…`),n.groundAt=n.heightAt;let l=await Bs(e);s.push(l),s.push(Zs(e));let u={handles:[],models:{},update(){}},d=[...l.colliders||[]],f={};for(let[t,n]of Object.entries(Qs)){if(!a.some(e=>e.id===t))continue;let r=await n(),i=await r.buildScenery?.({...e,track:a.find(e=>e.id===t)})||{};s.push(i),i.handles&&u.handles.push(...i.handles),i.colliders&&d.push(...i.colliders),r.TrackEvents&&(f[t]=r.TrackEvents)}return{props:u,colliders:d,events:f,sky:e.sky,ambient:{update(){}},ownBridges:new Set([`wailele`]),wetness:(e,t,n)=>c.wetness(e,t,n),update(e,t,n,r){for(let i of s)i.update?.(e,t,n,r)}}}var G=new URLSearchParams(location.search),tc=G.has(`look`)?G.get(`look`).split(`,`).map(Number):null,nc=G.has(`trace`)?window.__trace={n:0,rows:[]}:null;G.has(`ltrace`)&&(window.__ltrace=[]);var rc=G.has(`slow`)?window.__slow={min:1,real:0,slowFor:0}:null,ic=ba(),ac=Sa(),K=e=>document.getElementById(e),oc=(e,t)=>{K(`loadbar`).style.width=`${Math.round(e*100)}%`,t&&(K(`loadtxt`).textContent=t)},sc=new ot({powerPreference:`high-performance`,antialias:!1,stencil:!1,depth:!0});sc.setPixelRatio(ac.pixelRatio),sc.setSize(innerWidth,innerHeight),sc.shadowMap.enabled=!0,sc.shadowMap.type=2,sc.outputColorSpace=k,document.body.appendChild(sc.domElement),be(Math.min(sc.capabilities.getMaxAnisotropy(),ac.terrainStep>3?4:16));var cc=(()=>{try{let e=sc.getContext(),t=e.getExtension(`WEBGL_debug_renderer_info`),n=String(e.getParameter(t?t.UNMASKED_RENDERER_WEBGL:e.RENDERER)||``),r=n.match(/^ANGLE \([^,]*, (.*), [^,]*\)$/),i=(r?r[1]:n).replace(/^ANGLE Metal Renderer: /,``).replace(/ \(0x[0-9a-f]+\)/i,``).replace(/ (Direct3D|OpenGL|Vulkan)\b.*$/i,``).replace(/\s+/g,` `).trim(),a=/swiftshader|llvmpipe|basic render|software/i.test(n);return{name:a?`software renderer`:i,software:a}}catch{return{name:``,software:!1}}})(),lc=!!ac.ultra,q=new m,J=new l(62,innerWidth/innerHeight,.25,9e3);oc(.05,`LOADING SKY…`);var uc=await tt(sc,q),{sun:dc}=uc;lc&&!G.has(`nofog`)&&br(dc);var fc=new o(.62,.64,.66),pc=new o(.5,.33,.27),mc={color:fc,density:28e-5,sun:2.8};q.fog=new ne(fc,mc.density);var hc=new Ue(16773340,2.8);hc.castShadow=!0;var gc=Math.min(ac.shadow,sc.capabilities.maxTextureSize);hc.shadow.mapSize.set(gc,gc);var _c=hc.shadow.camera,vc=ac.shadowRange||70;_c.left=-vc,_c.right=vc,_c.top=vc,_c.bottom=-vc,_c.near=1,_c.far=900,lc&&(hc.shadow.radius=2),hc.shadow.bias=-4e-4,hc.shadow.normalBias=.04,q.add(hc,hc.target);var yc=new ue(10465992,3811872,.1);q.add(yc);var bc=await ka(),{region:xc,pending:Sc}=Aa(G,bc),Cc=xc.id===`kaiele`;oc(.15,xc.loading);var Y=await ie(xc.dir),wc=Y.data.tracks.map(e=>new Zi(e,Y)),Tc=e=>wc.find(t=>t.id===e)||wc[0],Ec=bc.map(e=>wc.find(t=>t.id===e.id)||e),Dc=he();oc(.3,`BUILDING TERRAIN…`);var Oc=Cc?await ec({renderer:sc,scene:q,world:Y,M:Dc,quality:ac,tracks:wc,sun:dc,sunLight:hc,camera:J,loadStep:oc,fog:mc}):null;if(!Cc){q.add(Se(Y,Dc,ac));for(let e of wc)q.add(Oe(Y,Dc,e))}var kc=Me(Y,Dc);q.add(kc);var Ac=mt(Y,Dc,dc);Y.data.crater&&Ac.material.uniforms.uOrigin.value.set(Y.data.crater.x,Ac.material.uniforms.uOrigin.value.y,Y.data.crater.z),Ac.material.uniforms.uFogColor.value.copy(fc),Ac.material.uniforms.uFogDensity.value=q.fog.density,q.add(Ac);var jc=dt();jc.visible=!Cc,q.add(jc);var Mc=new ut(Dc,700);Mc.mat.uniforms.uSun.value.copy(dc),q.add(Mc.mesh);var Nc=Cc?Oc.ambient:new St({scene:q,world:Y,M:Dc,quality:ac,tracks:wc,sun:dc});oc(.45,`PLACING ROCKS AND PROPS…`);var Pc=Cc?Oc.props:await Pt(Y,q,Dc,ac,wc);oc(.6,Cc?`BUILDING THE COAST…`:`BUILDING ASHFALL VILLAGE…`);var Fc=Cc?{colliders:[],handles:[]}:await Ar(Y,q,Dc,ac,wc);oc(.72,`STARTING PHYSICS…`);var Ic=await Bi(Y);Vi(Ic,[...Fc.colliders,...Oc?.colliders||[]]);var Lc=new Dt(Ic),Rc=new Ot(Ic,Lc,[...Pc.handles,...Fc.handles]),zc=new ht(Dc,q,dc,!!ac.aiLod);zc.ground=Y.heightAt;var Bc=new Cr(q,G.has(`noskid`)?1:ac.skids||1e3),Vc={scene:q,debris:Lc,fx:zc,breakables:Rc,detail:ac.damageDetail,skids:Bc,boomT:G.has(`boomt`)?+G.get(`boomt`):null};q.add(J),oc(.8,`LOADING TRUCKS…`);var Hc=await Hi(sc),X=new yr({renderer:sc,scene:q,sky:uc,sun:dc,sunLight:hc,hemi:yc,quality:ac,heightAt:Y.heightAt,fogBase:mc.density});X.adopt(q),X.on(`thunder`,e=>{Q&&fl===`race`&&Z.bump(Math.min(.3,e.k*.35))}),X.on(`change`,()=>{Ac.material.uniforms.uSun.value.copy(dc),Mc.mat.uniforms.uSun.value.copy(dc),Nc.steam?.mat.uniforms.uSun.value.copy(dc),zc.smoke.mat.uniforms.uSun.value.copy(dc),el&&(el.sun.copy(dc),el.disc.material.color.setRGB(1,.886,.69).multiplyScalar(Math.min(1,X.sunIntensity/2.8)*+!X.T.moon)),$e.value.copy(X.smokeLight),jc.visible=!Cc&&X.W.rain<.5&&X.W.snow===0;let e=Oc?.sky;if(e){let t=X.cond.weather===`clear`&&X.cond.time===`day`;e.uniforms.uCloud.value=X.W.cloud,e.uniforms.uExposure.value=1.05*Math.max(.06,X.T.light),e.haze0||=e.uniforms.uHaze.value.clone(),e.uniforms.uHaze.value.copy(t?e.haze0:X.fogColor),e.refreshEnv()}});var Uc=new p(16734746,0,45,2);q.add(Uc);var Wc=[];for(let e of Y.data.rivers)for(let t=0;t<e.points.length;t+=3)Wc.push(e.points[t]);Wc.push([Y.data.lake.x,Y.data.lake.y,Y.data.lake.z]);function Gc(e){let t=Wc[0],n=1/0;for(let r of Wc){let i=(r[0]-e.x)**2+(r[2]-e.z)**2;i<n&&(n=i,t=r)}return{pos:new M(t[0],t[1]+4,t[2]),strength:Math.max(0,1-Math.sqrt(n)/90)}}var Kc=new at(sc,{frameBufferType:e});Kc.addPass(new Xe(q,J));var qc=null;if(ac.ao){qc=new Cn(q,J,innerWidth,innerHeight);for(let e of[qc.copyQuad,qc.accumulationQuad])e?.material&&(e.material.depthTest=!1,e.material.depthWrite=!1);G.has(`breakao`)&&(qc.copyQuad.material.colorWrite=!1),qc.configuration.aoRadius=2.5,qc.configuration.distanceFalloff=1.2,qc.configuration.intensity=2.2,qc.configuration.halfRes=!ac.aoUltra,qc.configuration.gammaCorrection=!1,ac.aoUltra&&(qc.setQualityMode(`Ultra`),qc.configuration.halfRes=!1),Kc.addPass(qc)}var Jc=new gt({intensity:1.1,luminanceThreshold:1,luminanceSmoothing:.25,mipmapBlur:!0,radius:.7}),Yc=new Ze({mode:Je.ACES_FILMIC}),Xc=new _t({saturation:.05}),Zc=new nt({contrast:.12,brightness:-.02}),Qc=new qe({darkness:.45,offset:.3}),$c=new et({blendFunction:ct.OVERLAY,premultiply:!1});$c.blendMode.opacity.value=.06;var el=lc&&!G.has(`noshafts`)?new xr(J,dc):null,tl=lc&&!G.has(`nodof`)?new Sr(J):null,nl=new it(J,...tl?[tl.effect]:[],Jc,...el?[el.effect]:[]);Kc.addPass(nl);var rl=new pt(ac.blurSamples),il=new it(J,rl);Kc.addPass(il);var al=X.lens?new it(J,X.lens):null;al&&(al.enabled=!1,Kc.addPass(al));var ol=new it(J,Yc,Xc,Zc,Qc,$c,new Ke({preset:lc?vt.ULTRA:vt.MEDIUM}));Kc.addPass(ol),G.get(`breakao`)===`all`&&(ol.fullscreenMaterial.colorWrite=!1);var sl=!1;addEventListener(`resize`,()=>{J.aspect=innerWidth/innerHeight,J.updateProjectionMatrix(),sc.setSize(innerWidth,innerHeight),Kc.setSize(innerWidth,innerHeight)});var Z=new pa(J,Y,Ic);Z.setMode(ic.camera);var cl=new ma(ic),ll=K(`touch`);ic.touchUi=ga.touch;function ul(){ll.classList.toggle(`tilt`,ic.touchSteer===`tilt`),ll.classList.toggle(`autogas`,!!ic.autoGas),document.body.classList.toggle(`touchui`,!!ic.touchUi)}cl.bindTouch(ll),ul(),ic.touchUi&&ic.touchSteer===`tilt`&&cl.enableTilt();var Q=null,dl=null,fl=`menu`,pl=0,$={root:K(`hud`),pos:K(`pos`),poscount:K(`poscount`),lap:K(`lap`),laps:K(`laps`),lapline:K(`lapline`),track:K(`trackname`),time:K(`time`),best:K(`best`),lavagap:K(`lavagap`),speed:K(`speed`),gear:K(`gear`),rpm:K(`rpmbar`),boost:K(`boostbar`),dmg:K(`dmgbar`),boostWrap:K(`boost`),msg:K(`msg`),board:K(`board`),map:K(`map`),fps:K(`fps`),toast:K(`toast`)},ml=null,hl=null,gl=new qa({tracks:Ec,settings:ic,save:xa,gpu:cc,handlers:{start:Cl,resume:()=>bl(!1),restart:()=>dl&&Cl(dl),quitRace:()=>Sl(),onMenu:e=>{e&&xl()},quit:()=>window.close(),onCamera:e=>Z.setMode(e),onTouch:()=>{ul(),ic.touchSteer===`tilt`&&cl.enableTilt()},onQualityChange:()=>{},onSettingsClosed:()=>{ic.quality!==_l&&location.reload()}}}),_l=ic.quality;cl.on(`camera`,()=>{if(fl===`race`){let e=Z.next();yl(`${e.name} camera`),xa({camera:e.id})}}),cl.on(`pause`,()=>{fl===`race`?bl(!0):fl===`paused`&&gl.current===`pause`&&bl(!1)}),cl.on(`reset`,()=>{fl===`race`&&Q&&Q.clock>0&&Q.respawn(Q.player)});var vl=0;function yl(e){$.toast.textContent=e,$.toast.classList.add(`on`),vl=1.6}function bl(e){Q&&(fl=e?`paused`:`race`,e?gl.show(`pause`,!1):gl.hide(),ll.hidden=e||!ic.touchUi)}function xl(){Q?.dispose(),Q=null,X.setVehicles(null),fl=`menu`,$.root.hidden=!0,ll.hidden=!0}function Sl(){xl(),gl.show(gl.champ&&gl.champ.round>0?`world`:`title`,!1)}function Cl(e){let t=bc.find(t=>t.id===e.track&&t.region!==xc.id);if(t){ja(e,t.region);return}dl=e,Q?.dispose(),Bc.clear();let n=Tc(e.track);Q=new ia({phys:Ic,scene:q,assets:Hc,track:n,opponents:e.opponents,difficulty:e.difficulty,laps:e.laps,playerPaint:e.paint??0,quality:ac,playerName:ic.driver||`YOU`,seed:(e.seed??Date.now())&65535,crash:Vc}),Q.weather=X;let r=G.has(`anywx`)?null:n;e.conditions||=X.set({weather:e.weather||G.get(`weather`)||`random`,time:e.time||G.get(`time`)||`random`},r),X.cond!==e.conditions&&X.set(e.conditions,r),X.setVehicles(Q.cars.map(e=>e.v),Q.player.v);for(let e of Q.cars)X.adopt(e.v.group,`vehicle`);Q.hazards=Cc?new $s({phys:Ic,scene:q,world:Y,track:n,fx:zc,M:Dc,lava:kc,island:Oc,quality:ac,events:Q.events,breakables:Rc}):new Ct({phys:Ic,scene:q,world:Y,track:n,fx:zc,M:Dc,lava:kc,rockMat:Pc.models.boulder_01?.meshes[0]?.mat,quality:ac,events:Q.events}),X.adopt(q),Fl=0,Ll=0,Il=1,zl=null,Z.cinematic(!1),Z.leapShot(null),$.dmg.style.width=`0%`,$.msg.dataset.fin=``,G.has(`auto`)&&(Q.player.ai=new na(Q.player.v,n,ta.hard,we(99))),fl=`race`,gl.hide(),$.root.hidden=!1,ll.hidden=!ic.touchUi,$.track.textContent=`${n.name} · ${X.label}`,$.lapline.style.display=n.closed?``:`none`,$.laps.textContent=Q.laps,$.poscount.textContent=Q.cars.length,$.best.textContent=``,$.msg.textContent=``,ml=document.createElement(`canvas`),ml.width=$.map.width,ml.height=$.map.height,hl=Ka(ml,n,{line:`rgba(255,236,210,.85)`,width:4}),Z.setMode(ic.camera),Tl=null,El=0,Dl=null,Ol=0,wl()}function wl(){let e=[...Q.cars.flatMap(e=>e.v.damage?.levels.map(e=>e.engine.group)||[]),...zc.hidden()],t=e.map(e=>e.visible);for(let t of e)t.visible=!0;try{sc.compile(q,J)}catch(e){console.warn(`shader warm-up`,e)}e.forEach((e,n)=>{e.visible=t[n]})}var Tl=null,El=0,Dl=null,Ol=0;function kl(e){let t=Q.player,n=Q.countdown;if(Q.clock<.9){let e=n>0?String(n):`GO!`;e!==Tl&&($.msg.textContent=e,$.msg.classList.remove(`pop`),$.msg.offsetWidth,$.msg.classList.add(`pop`),Tl=e)}else Tl===`GO!`&&($.msg.textContent=``,Tl=``);if($.pos.textContent=Q.positionOf(t),$.lap.textContent=Q.lapOf(t),$.time.textContent=Wa(t.finished?t.time:Q.t),Q.track.closed&&t.lap>Ol&&t.lap>=1){let e=Q.t-El;El=Q.t,Dl=Dl?Math.min(Dl,e):e,$.best.textContent=`BEST LAP ${Wa(Dl)}`,t.lap===Q.laps-1&&yl(`Final lap`)}if(Ol=Math.max(Ol,t.lap),t.finished&&$.msg.dataset.fin!==`1`){$.msg.dataset.fin=`1`;let e=Q.positionOf(t);$.msg.textContent=t.dnf?t.burned?`CAUGHT BY THE LAVA`:`DNF`:e===1?`WINNER!`:`P${e}`,$.msg.classList.remove(`pop`),$.msg.offsetWidth,$.msg.classList.add(`pop`)}t.finished||($.msg.dataset.fin=``),$.dmg.style.width=`${Math.round((t.v.damage?.level||0)*100)}%`,$.boostWrap.classList.toggle(`red`,t.v.boost<.1),$.speed.textContent=Math.round(t.v.speed()*3.6),$.gear.textContent=t.v.speed()<1&&t.v.input.brake>0?`R`:t.v.gear,$.rpm.style.width=`${Math.round(Math.min(1,t.v.rpm/7e3)*100)}%`,$.boost.style.width=`${Math.round(t.v.boost*100)}%`;let r=Q.hazards?.lavaGap??Q.hazards?.erupt?.gap;$.lavagap.hidden=r==null,r!=null&&($.lavagap.textContent=`LAVA ${Math.round(r)} M`,$.lavagap.classList.toggle(`near`,r<45));let i=``;Q.order.forEach((e,n)=>{(n<4||e===t)&&(i+=`<div class="${e===t?`me`:``}"><b>${n+1}</b>${e.isPlayer?ic.driver||`YOU`:e.v.name}</div>`)}),i!==$.board._html&&($.board.innerHTML=i,$.board._html=i);let a=$.map.getContext(`2d`);a.clearRect(0,0,$.map.width,$.map.height),a.drawImage(ml,0,0);for(let e of Q.cars){if(e===t)continue;let n=e.v.group.position,[r,i]=hl(n.x,n.z);a.fillStyle=`#d8d0c4`,a.beginPath(),a.arc(r,i,4.5,0,6.3),a.fill()}let o=t.v.group.position,[s,c]=hl(o.x,o.z);a.fillStyle=`#ffb41f`,a.strokeStyle=`#000`,a.lineWidth=2,a.beginPath(),a.arc(s,c,7,0,6.3),a.fill(),a.stroke(),vl>0&&(vl-=e,vl<=0&&$.toast.classList.remove(`on`)),Bl>0&&(Bl-=e,Bl<=0&&!t.finished&&($.msg.textContent=``))}var Al=new T,jl=0,Ml=0,Nl=0,Pl=60,Fl=0,Il=1,Ll=0,Rl=-99,zl=null,Bl=0,Vl=0;function Hl(e,t=2.2){$.msg.textContent=e,$.msg.classList.remove(`pop`),$.msg.offsetWidth,$.msg.classList.add(`pop`),Bl=t}function Ul(){for(let e of Q.events.splice(0)){let t=!e.st||e.st.isPlayer;e.type===`knock`?Z.bump(Math.min(.25,.04+e.dv*.03)):e.type===`hit`&&t?(Z.bump(Math.min(.5,e.dv*.025)),e.dv>13&&!Fl&&!zl&&jl-Rl>5&&!e.st.v.damage.blown&&(Rl=jl,Ll=1.3)):e.type===`part`&&t&&!e.st.v.damage.blown?yl(`${e.label} torn off`):e.type===`blown`?t?(Fl=6,Z.cinematic(!0),Hl(`ENGINE BLOWN`)):yl(`${e.st.v.name} blew the engine`):e.type===`totaled`?t&&!e.st.v.damage.blown?(Hl(`TOTALED`),Ll=0,Fl=6,Z.cinematic(!0)):!t&&!e.st.v.damage.blown&&yl(`${e.st.v.name} is wrecked`):e.type===`dnf`&&t?e.st.burned||Hl(`DNF`):e.type===`leap`?(t&&(zl=e.leap,Z.leapShot(e.leap,e.focus??Y.data.crater),e.leap.short&&Hl(`TOO SLOW!`,3)),Z.bump(t?.35:.08)):e.type===`landed`&&t?(zl&&(zl.done=!0),Z.leapShot(null),Z.bump(.3)):e.type===`burned`?t?(Fl=6,Z.cinematic(!0),Hl(`CAUGHT BY THE LAVA`,4)):yl(`${e.st.v.name} was caught by the lava`):e.type===`erupt`?(yl(`The volcano is erupting!`),Z.bump(.4)):e.type===`flow`?(yl(`Lava over the rim! Go!`),Z.bump(.3)):e.type===`heave`&&Q.player.i<e.i&&e.i-Q.player.i<260?(yl(`The ground is splitting!`),Z.bump(.25)):e.type===`quake`?Z.bump(Math.min(.35,e.k??.15)):e.type===`breakout`?(yl(`Lava breakout ahead!`),Z.bump(.3)):e.type===`loose`&&t&&e.label?yl(`${e.label} hanging loose`):e.type===`tyre`&&t?yl(`Lost a wheel!`):e.type===`exploded`&&!t?yl(`${e.st.v.name} went up in flames`):e.type===`toast`&&t&&e.text&&yl(e.text)}}var Wl=new M,Gl=new M,Kl=null,ql=Cc?new M(-300,0,600):new M(-150,0,120);function Jl(e){if(fl===`race`&&Q){let t=cl.read();Ml+=e;let n=0,r=1/60*y.clamp(Il,.2,1);for(;Ml>=r-1e-9&&n++<5;){Q.player.ai&&Q.player.ai.update(r,Q.player,Q.cars.map(e=>e.v),0);let e=Q.player.ai?{...Q.player.v.input,analog:!0}:t;G.has(`blow`)&&Q.clock>1.5&&(Q.player.v.forceBlow=!0,e.boost=1,e.throttle=1,Q.player.v.boost>.12&&(Q.player.v.boost=.12)),G.has(`lose`)&&Q.clock>1&&!Q.player.v.lostWheels.size&&Q.player.v.damage?.loseWheel(+G.get(`lose`)),G.has(`dent`)&&Q.clock>1&&Xl(Q.player.v),Q.step(r,e,ic.steerAssist&&!Q.player.ai),nc&&nc.n++%30==0&&nc.rows.push(`${Q.t.toFixed(1)} F${Q.hazards?.erupt?.flow.front.toFixed(0)??``} `+Q.cars.map(e=>`${e.i}:${e.v.speed().toFixed(0)}:${e.v.contacts}${e.leap?`L`:``}:${(e.off??0).toFixed(0)}:${(e.v.body.translation().y-Q.track.at(e.i)[1]).toFixed(1)}`).join(` `)),Ml-=r}Ul(),Q.done&&!Q.shownResults&&(Q.shownResults=!0,setTimeout(()=>{Q&&(fl=`results`,ll.hidden=!0,gl.showResults(Q,dl.mode))},1200))}}var Yl=G.has(`dent`)?G.get(`dent`).split(`,`).map(e=>e.split(`:`)):[];function Xl(e){let t=Yl.shift();if(!t||!e.damage)return;let n={front:[0,0,1],rear:[0,0,-1],left:[1,0,0],right:[-1,0,0],top:[0,1,0],fl:[.6,0,.8],fr:[-.6,0,.8]},r=new M(...n[t[0]]||n.front),i=r.clone().applyQuaternion(e.group.quaternion),a=r.clone().multiplyScalar(2.6).applyMatrix4(e.group.matrixWorld);e.damage.hit(i,+t[1]||12,a,t[0]===`top`)}function Zl(e){if(Fl>0&&(Fl=Math.max(0,Fl-e),Il=Fl>2.6?.2:.2+.8*(1-Fl/2.6)**2,Fl===0&&(Il=1,Z.cinematic(!1))),Ll>0&&!Fl&&(Ll=Math.max(0,Ll-e),Il=Ll>.6?.28:.28+.72*(1-Ll/.6)**2,Ll===0&&(Il=1)),zl&&fl!==`paused`){let t=zl.done?1:y.clamp(zl.t/zl.T,0,1),n=zl.done?1:.74-.42*Math.sin(Math.PI*t);Il+=(n-Il)*Math.min(1,e*(zl.done?4:5)),zl.done&&Il>.97&&(Il=1,zl=null)}}function Ql(e){Zl(e);let t=fl===`paused`?e:e*Il;if(jl+=t,Jl(t),Q&&(fl===`race`||fl===`paused`||fl===`results`)){Q.sync(t,jl,Mc,J.position),Kl=Q.cars[window.__follow]||Q.player,fl!==`paused`&&Z.update(e,Kl.v,Q.track,Kl.i,Kl.v.boosting);let n=Q.player.v,r=n.speed(),i=Z.cine||Z.leapL?0:1,a=y.clamp((r-12)/40,0,1);rl.uniforms.get(`uRadial`).value=i*(a*.012+(n.boosting?.03:0)),rl.uniforms.get(`uAber`).value=i*((n.boosting?.6:0)+(n.redline?1.4:0)),Vl=Z.cine||Z.leapL?.25:.55+a*.35,Gl.copy(Kl.v.group.position),kl(e)}else pl+=t,Z.orbit(t,pl+40,ql,Cc?1500:1150,Cc?320:260),rl.uniforms.get(`uRadial`).value=0,rl.uniforms.get(`uAber`).value=0,Vl=.3,Gl.set(J.position.x*.5,0,J.position.z*.5);tc&&(J.position.set(tc[0],tc[1],tc[2]),J.up.set(0,1,0),J.lookAt(tc[3],tc[4],tc[5]),J.updateMatrixWorld());let n=Q?.hazards?.env??0,r=Cc&&X.cond?.weather===`clear`&&X.cond?.time===`day`;q.fog.color.copy(r?mc.color:X.fogColor).lerp(pc,n*.55*X.T.light),q.fog.density=(r?mc.density:X.fogDensity)*(1+n*.8),hc.intensity=(r?mc.sun:X.sunIntensity)*(1-n*.3),Ac.material.uniforms.uFogColor.value.copy(q.fog.color),Ac.material.uniforms.uFogDensity.value=q.fog.density,kc.userData.uniforms.uTime.value=jl,Ac.material.uniforms.uTime.value=jl+400,jc.material.uniforms.uTime.value=jl,jc.material.uniforms.uCam.value.copy(J.position),jc.material.uniforms.uScale.value=innerHeight*sc.getPixelRatio()*.6,Mc.update(jl),zc.update(jl,t);for(let e of zc.booms.splice(0))Z.bump(Math.min(.5,e.power*.4/(1+J.position.distanceTo(e.pos)/18)));Nc.update(jl,t,J.position),X.update(t,jl,J,{lens:ic.lensDrops!==!1&&!!Q&&fl!==`menu`&&Z.mode!==`tv`&&!Z.cine&&!Z.leapL,speed:Q?Q.player.v.speed():0,dust:Mc,ambient:Nc,time:jl}),wt.uTime.value=X.windTime,al&&(al.enabled=X.lens.uniforms.get(`uRain`).value>.002||X.lens.uniforms.get(`uSnow`).value>.002),Pc.update?.(jl),Oc?.update(jl,t,J,Q);let i=(_c.right-_c.left)/hc.shadow.mapSize.x;Wl.copy(Gl),Wl.x=Math.round(Wl.x/i)*i,Wl.z=Math.round(Wl.z/i)*i,Wl.y=Y.heightAt(Wl.x,Wl.z),hc.target.position.copy(Wl),hc.position.copy(Wl).addScaledVector(dc,400);let a=Gc(J.position);Uc.position.copy(a.pos),Uc.intensity=a.strength*120,rl.uniforms.get(`uHaze`).value=lc?Math.min(1.2,a.strength*1.6+(Q?.hazards?.lava?.front?.value>0?.3:0)):0,rl.uniforms.get(`uTime`).value=jl,el&&el.update(J),tl&&tl.update(Gl,!!Z.cine,Q?Z.mode:`menu`),rl.track(J,Vl),sl?sc.render(q,J):Kc.render(t),ic.showFps?(Pl+=(1/Math.max(e,.001)-Pl)*.05,$.fps.textContent=`${Math.round(Pl)} FPS`):$.fps.textContent=``}function $l(){let e=sc.getContext(),t=e.drawingBufferWidth,n=e.drawingBufferHeight,r=new Uint8Array(256);for(let[i,a]of[[.5,.5],[.2,.3],[.8,.3],[.2,.75],[.8,.75],[.5,.85],[.5,.15]]){e.readPixels(Math.floor(t*i),Math.floor(n*a),8,8,e.RGBA,e.UNSIGNED_BYTE,r);for(let e=0;e<r.length;e+=4)if(r[e]+r[e+1]+r[e+2]>6)return!1}return!0}if(!G.has(`still`)){oc(.96,`WARMING UP…`),await new Promise(e=>setTimeout(e,30));try{if(Ql(1/60),$l()){let e=[[qc,`ambient shadows`],[il,`motion blur`],[nl,`bloom and depth of field`]].filter(([e])=>e),t=[];for(let[n,r]of e)if(n.enabled=!1,t.push(r),Kc.render(1/60),!$l())break;let n=t.join(`, `);if($l()){for(let[t]of e)t.enabled=!0;sl=!0,sc.toneMapping=4,sc.render(q,J),n=`the screen effects`,$l()&&(sl=!1,sc.toneMapping=0,n=``)}console.warn(`graphics: the picture came out black on ${cc.name}; ${n?`fixed by switching off ${n}`:`switching the effects off did not help`}`),n&&gl.gpuNote(`${n} switched off (they draw black on this driver)`)}}catch(e){console.warn(`warm-up frame`,e)}}if(oc(1,`READY`),K(`loading`).remove(),G.has(`race`)){if(Cl({track:G.get(`race`),laps:+(G.get(`laps`)||Tc(G.get(`race`)).laps),opponents:+(G.get(`ai`)??5),difficulty:G.get(`diff`)||`normal`,paint:+(G.get(`paint`)||ic.paint||0),mode:`quick`,seed:7}),G.has(`cam`)&&Z.setMode(G.get(`cam`)),G.has(`cine`)&&(Z.cinematic(!0),Z.cine.a=+G.get(`cine`),Z.cineDist=+(G.get(`cined`)||6.5),Z.cineH=+(G.get(`cineh`)||1.4),Z.cineLook=+(G.get(`cinel`)||1.2)),G.has(`at`)){let e=Q.track.frame(+G.get(`at`)),t=e.yaw+ +(G.get(`yaw`)||0);Q.place(Q.player,Q.track.wrap(+G.get(`at`)),e.x,e.z,t),Q.clock=0;let n=Q.hazards?.erupt;if(n&&G.has(`lava`)&&(Object.assign(n.flow,{state:`run`,runT:9,front:Q.player.i-+G.get(`lava`)}).mesh.visible=!0),G.has(`ram`)){let e=+G.get(`ram`);Q.player.v.body.setLinvel({x:Math.sin(t)*e,y:0,z:Math.cos(t)*e},!0),Q.player.v.ghost=!1}}}else Sc?Cl(Sc):((G.has(`weather`)||G.has(`time`))&&X.set({weather:G.get(`weather`)||`clear`,time:G.get(`time`)||`day`}),gl.show(G.get(`screen`)||`title`));var eu=G.has(`still`)?+G.get(`still`)||1:0;if(eu){for(let e=0;e<eu-1;e++)tu(1/60);Ql(1/60),sc.getContext().finish(),window.__state=Q&&{fxn:[zc.smoke.i,zc.fire.i,zc.spark.i,zc.time,jl],t:Q.t,done:Q.done,player:Q.positionOf(Q.player),order:Q.order.map(e=>({name:e.v.name,dist:Math.round(e.dist),lap:e.lap,fin:e.finished,dnf:!!e.dnf,time:e.time&&+e.time.toFixed(1),resp:(e.respLog||[]).join(` `),dmg:+(e.v.damage?.level||0).toFixed(2),lost:[...e.v.damage?.lost||[]].join(`,`),blown:!!e.v.damage?.blown,log:(e.v.damage?.log||[]).join(` `)})),hz:Q.hazards?.bombs&&{bombs:Q.hazards.bombs.length,marks:Q.hazards.marks.length,boulders:Q.hazards.boulders.length,rolled:Q.hazards.nBoulders||0,dropped:Q.hazards.nBombs||0,lava:Q.hazards.lava?.state,hits:Q.hazards.hits||0},er:Q.hazards?.erupt&&{flow:Q.hazards.erupt.flow.state,front:Math.round(Q.hazards.erupt.flow.front),heaves:Q.hazards.erupt.heaves.map(e=>`${e.i0}:${e.state}`).join(` `),fiss:Q.hazards.erupt.fissures.length,rocks:Q.track.obstacles.map(e=>e.i).join(`,`),leapt:Q.cars.filter(e=>e.leapt).length,burned:(Q.hazards.erupt.flow.log||[]).join(` `),erupting:!!Q.hazards.erupt.erupting},knocked:Rc.items.filter(e=>e.state!==`static`).length,props:Rc.items.length,debris:Lc.list.length},window.__race=Q,window.__fx=zc,window.__skids=Bc,window.__weather=X,window.__frame=Ql,window.__step=tu,window.__rig=Z,window.__ready=!0}else window.__ready=!0,window.__weather=X,requestAnimationFrame(nu);function tu(e){rc&&(Zl(e),rc.min=Math.min(rc.min,Il),rc.real+=e,Il<.99&&(rc.slowFor+=e));let t=rc?e*Il:e;if(jl+=t,Jl(t),Q){Q.sync(t,jl,null,J.position);let e=Q.cars[window.__follow]||Q.player;Z.update(t,e.v,Q.track,e.i,!1)}tc&&J.position.set(tc[0],tc[1],tc[2]),zc.update(jl,t),zc.booms.length=0,Nc.update(jl,t,J.position),X.update(t,jl,J,{lens:ic.lensDrops!==!1&&!!Q,speed:Q?Q.player.v.speed():0,time:jl})}function nu(e){if(requestAnimationFrame(nu),fl===`menu`){Al.getDelta();return}let t=ic.fps||0;if(t&&e-Nl<1e3/t-2)return;let n=Math.min(Al.getDelta(),1/15);Nl=e,Ql(n),window.__state=Q&&{i:Q.player.i,lap:Q.player.lap,dist:Q.player.dist,t:Q.t,pos:Q.positionOf(Q.player),done:Q.done,order:Q.order.map(e=>`${e.v.name}:${Math.round(e.dist)}`)}}