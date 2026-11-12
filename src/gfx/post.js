// 后期处理链：HDR 渲染 → 环境光遮蔽（GTAO）→ 体积光（太阳光柱）→ 泛光 → 色调映射 → 电影调色（锐化、色差、分离色调、暗角、胶片颗粒）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';

export function makePost(renderer, scene, camera, { ao = true, msaa = 4 } = {}) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (ao) {
    gtao = new GTAOPass(scene, camera, 4, 4); gtao.blendIntensity = 1;
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.2, thickness: 1.2, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  // 体积光：把画面里特别亮的天空朝太阳方向做径向拖影
  const rays = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.7) }, uOn: { value: 1 }, uAspect: { value: 1.33 }, uTime: { value: 0 }, tDepth: { value: gtao ? gtao.depthTexture : null }, uHasDepth: { value: gtao ? 1 : 0 }, uNF: { value: new THREE.Vector2(camera.near, camera.far) } }, vertexShader: VS,
    fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform vec2 uSun, uNF; uniform float uOn, uAspect, uTime, uHasDepth; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      // 只有天空才是光柱的光源：用深度把甲胄上的高光、火焰等近处的亮点排除掉
      // 天空着色器把 alpha 写成 0，其它物体都是 1，所以 1 - alpha 就是天空遮罩
      void main(){ vec3 col = texture2D(tDiffuse, vUv).rgb; if (uOn < .001) { gl_FragColor = vec4(col, 1.); return; }
        const int N = 56; vec2 d = (vUv - uSun) * (.92 / float(N)); vec2 uv = vUv - d * hash(vUv * 731. + uTime); float w = 1.; vec3 acc = vec3(0.);
        for (int i = 0; i < N; i++) { uv -= d; vec3 s = texture2D(tDiffuse, clamp(uv, 0., 1.)).rgb; float l = max(s.r, max(s.g, s.b)); vec4 s4 = texture2D(tDiffuse, clamp(uv, 0., 1.)); acc += s * smoothstep(2.4, 8., l) * clamp(1. - s4.a, 0., 1.) * w; w *= .972; }
        float fall = smoothstep(1.5, .15, length((vUv - uSun) * vec2(uAspect, 1.)));
        gl_FragColor = vec4(col + acc * (.05 * uOn) * (.35 + .65 * fall), 1.); }` });
  composer.addPass(rays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.7, 1.4); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uPx: { value: new THREE.Vector2(1 / 1024, 1 / 768) }, uTime: { value: 0 }, uFlash: { value: 0 }, uRage: { value: 0 }, uFade: { value: 1 } }, vertexShader: VS,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uPx; uniform float uTime, uFlash, uRage, uFade; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec2 c = vUv - .5; float r2 = dot(c, c);
        vec3 col = vec3(texture2D(tDiffuse, vUv + c * r2 * .005).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * r2 * .005).b);      // 镜头色差
        vec3 blur = (texture2D(tDiffuse, vUv + vec2(uPx.x, 0.)).rgb + texture2D(tDiffuse, vUv - vec2(uPx.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(0., uPx.y)).rgb + texture2D(tDiffuse, vUv - vec2(0., uPx.y)).rgb) * .25;
        col += (col - blur) * .55;                                                                                                              // 锐化
        float l = dot(col, vec3(.2126, .7152, .0722));
        col = mix(vec3(l), col, .97);
        col = mix(col, col * col * (3. - 2. * col), .38);                                                                                        // S 形对比
        col += mix(vec3(-.012, .006, .03), vec3(.03, .008, -.03), smoothstep(.15, .75, l)) * (1. - uRage * .4);                                   // 暗部偏青、亮部偏暖
        col = mix(col, col * vec3(1.08, .9, .86), uRage * .5);
        col *= 1. - smoothstep(.12, .62, r2) * .62;                                                                                             // 暗角
        col += (hash(vUv * 913. + fract(uTime) * 71.) - .5) * .035 * (1. - l * .6);                                                               // 胶片颗粒
        col = mix(col, vec3(1., .95, .86), uFlash); col *= uFade;
        gl_FragColor = vec4(max(col, 0.), 1.); }` });
  composer.addPass(grade);
  return { composer, gtao, rays, bloom, grade,
    setSize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); grade.uniforms.uPx.value.set(1 / (w * pr), 1 / (h * pr)); rays.uniforms.uAspect.value = w / h; } };
}
