// 三向投影（triplanar）的 PBR 材质：不需要 UV，直接按模型空间坐标把贴图从三个方向投上去。
// 在标准 PBR 材质上再叠四样东西：细节法线、边缘磨损（露出底下的亮金属/浅色石头）、缝隙积灰、烘焙的环境光遮蔽。
import * as THREE from 'three';

// opts:
//   set        一套贴图 { N, M }（见 textures.js）
//   scale      贴图密度（每米重复几次）；nStr 法线强度
//   wear / wearColor / wearMetal / wearRough   凸边处的磨损：强度、露出的颜色、金属度、粗糙度
//   dirt / dirtColor                            缝隙与脏污：强度、颜色
//   tint       大块明暗变化的强度；ao 烘焙遮蔽的强度；bake=false 表示这个网格没有烘焙数据
export function triMat({ set, scale = 1, nStr = 1, color = 0x888888, metalness = 0, roughness = 0.6, wear = 0, wearColor = 0xffffff, wearMetal = 1, wearRough = 0.25,
  dirt = 0.5, dirtColor = 0x0c0a08, tint = 0.3, macro = 0, ao = 1, bake = true, roughVar = 0.5, emissive = 0x000000, emissiveIntensity = 1, envMapIntensity = 1, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity, envMapIntensity, side });
  const U = m.userData.tri = { tN: { value: set.N }, tM: { value: set.M }, uTri: { value: new THREE.Vector4(scale, nStr, wear, dirt) }, uTri2: { value: new THREE.Vector4(tint, ao, roughVar, wearRough) },
    uWearCol: { value: new THREE.Color(wearColor) }, uDirtCol: { value: new THREE.Color(dirtColor) }, uWearMetal: { value: wearMetal }, uWet: { value: 0 }, uMacro: { value: macro } };
  m.defines = { ...(m.defines || {}), TRI_BAKE: bake ? 1 : 0 };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n#if TRI_BAKE == 1\nattribute vec3 bake;\n#endif\nvarying vec3 vOP; varying vec3 vON; varying vec3 vBake; varying mat3 vNM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal; vNM = normalMatrix;\n#if TRI_BAKE == 1\nvBake = bake;\n#else\nvBake = vec3(1.,0.,0.);\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tN, tM; uniform vec4 uTri, uTri2; uniform vec3 uWearCol, uDirtCol; uniform float uWearMetal, uWet, uMacro;
        varying vec3 vOP; varying vec3 vON; varying vec3 vBake; varying mat3 vNM;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 tnO = normalize(vON); vec3 tw = pow(abs(tnO), vec3(4.)); tw /= (tw.x + tw.y + tw.z);
        vec2 tuX = vOP.zy * uTri.x, tuY = vOP.xz * uTri.x, tuZ = vOP.xy * uTri.x;
        vec4 tmk = texture2D(tM, tuX) * tw.x + texture2D(tM, tuY) * tw.y + texture2D(tM, tuZ) * tw.z;
        vec4 tmk2 = texture2D(tM, tuX * .23 + .37) * tw.x + texture2D(tM, tuY * .23 + .37) * tw.y + texture2D(tM, tuZ * .23 + .37) * tw.z;   // 大尺度的第二层，打破重复感
        float tWear = smoothstep(.42, .8, vBake.g * 1.15 + (tmk.r - .35) * .55 + (tmk2.g - .5) * .35) * uTri.z;
        float tCav = max(vBake.b * 1.1, tmk.a);                                                        // 凹处：烘焙出来的缝 + 贴图里的砖缝/凹坑/裂纹
        float tDirt = clamp(smoothstep(.18, .75, tCav + (1. - vBake.r) * .55 + (tmk2.g - .5) * .7 + (tmk.g - .5) * .3) * uTri.w, 0., 1.);
        diffuseColor.rgb *= 1. + (tmk2.g - .5) * uTri2.x * 1.4 + (tmk.b - .5) * uTri2.x * .6 + (tmk.r - .5) * uTri2.x * .5;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol, tDirt * .85);
        // 大尺度的风化（只给建筑用）：顺着墙面往下淌的水痕、墙根的积污、整面墙的冷暖深浅变化
        float tStreak = texture2D(tM, vec2((vOP.x + vOP.z) * .11, vOP.y * .012)).g * .6 + texture2D(tM, vec2((vOP.x - vOP.z) * .31, vOP.y * .03)).g * .4;
        float tMac = clamp((smoothstep(.5, .72, tStreak) * .65 + smoothstep(2.4, 0., vOP.y) * .5) * uMacro, 0., 1.);
        diffuseColor.rgb *= 1. + (texture2D(tM, vOP.xy * .013 + vOP.zz * .011).g - .5) * uMacro * .7;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol * 2.2, tMac * .62);
        diffuseColor.rgb = mix(diffuseColor.rgb, uWearCol, tWear * (1. - tMac * .7));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1. + (tmk.b - .5) * uTri2.z * 1.3 + (tmk2.b - .5) * uTri2.z) + tDirt * .3 + tmk.r * .12, .04, 1.);
        roughnessFactor = mix(roughnessFactor, uTri2.w, tWear);
        roughnessFactor = mix(roughnessFactor, .06, uWet * smoothstep(.3, .9, tnO.y));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor * (1. - tDirt * .75), uWearMetal, tWear);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 tnx = texture2D(tN, tuX).xyz * 2. - 1., tny = texture2D(tN, tuY).xyz * 2. - 1., tnz = texture2D(tN, tuZ).xyz * 2. - 1.;
        tnx.xy *= uTri.y; tny.xy *= uTri.y; tnz.xy *= uTri.y;
        tnx = vec3(tnx.xy + tnO.zy, abs(tnx.z) * tnO.x); tny = vec3(tny.xy + tnO.xz, abs(tny.z) * tnO.y); tnz = vec3(tnz.xy + tnO.xy, abs(tnz.z) * tnO.z);
        vec3 tnB = normalize(tnx.zyx * tw.x + tny.xzy * tw.y + tnz.xyz * tw.z);
        normal = normalize(vNM * tnB) * (gl_FrontFacing ? 1. : -1.);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float tAO = mix(1., vBake.r, uTri2.y) * (1. - tDirt * .25) * (1. - tmk.a * .55);
        reflectedLight.indirectDiffuse *= tAO; reflectedLight.indirectSpecular *= mix(1., tAO, .9) * tAO; reflectedLight.directDiffuse *= mix(1., tAO, .35); reflectedLight.directSpecular *= mix(1., tAO, .5);`);
  };
  m.customProgramCacheKey = () => 'tri' + (bake ? 1 : 0);
  return m;
}
