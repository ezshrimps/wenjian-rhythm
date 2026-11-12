// 城堡庭院：黄昏逆光的天空、SDF 雕出来的城墙 / 拱门 / 拱廊 / 立柱、带积水倒影的石板地、火盆、旗帜、灯光。
import * as THREE from 'three';
import * as S from './sdf.js';
import { triMat } from './materials.js';

export const SUN_DIR = new THREE.Vector3(-0.1, 0.285, -0.955).normalize();   // 太阳在城门后方偏左、低空
const PI = Math.PI;
const repX = (f, per, lo, hi) => (x, y, z) => f(x - per * Math.min(hi, Math.max(lo, Math.round(x / per))), y, z);
const repZ = (f, per, lo, hi) => (x, y, z) => f(x, y, z - per * Math.min(hi, Math.max(lo, Math.round(z / per))));

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return s; }`;

// ───────── 天空（HDR）─────────
export function makeSky() {
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR }, time: { value: 0 }, rage: { value: 0 }, uDisc: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `precision highp float; varying vec3 vDir; uniform vec3 sunDir; uniform float time, rage, uDisc; ${NOISE}
      float dens(vec2 uv){ return smoothstep(.42,.86, fbm(uv*1.1)*.75 + fbm(uv*3.3+7.)*.3); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y, sd = max(dot(d, sunDir), 0.), t = clamp(h, 0., 1.);
        vec3 zen = mix(vec3(.030,.075,.19), vec3(.05,.03,.06), rage), mid = mix(vec3(.13,.21,.38), vec3(.16,.09,.11), rage);
        vec3 hor = mix(vec3(.30,.27,.34), mix(vec3(1.15,.56,.24), vec3(1.2,.3,.1), rage), pow(sd, 1.5));
        vec3 col = mix(hor, mid, smoothstep(0., .22, t)); col = mix(col, zen, smoothstep(.18, .85, t));
        col += mix(vec3(1.,.55,.25), vec3(1.,.3,.12), rage) * pow(sd, 8.) * .55 + vec3(1.,.78,.5) * pow(sd, 60.) * 1.3 + vec3(1.,.9,.7) * pow(sd, 500.) * 9.;
        if (h > -.02) {
          vec2 uv = d.xz / (max(h, 0.) + .16) * 1.25 + vec2(time * .006, time * .002);
          float c = dens(uv), cl = dens(uv + normalize(sunDir.xz) * .16);                        // 朝太阳方向再取一次：前面云越少，这里越亮
          float lit = exp(-cl * 2.4);
          vec3 base = mix(vec3(.075,.085,.13), vec3(.07,.04,.05), rage), sunlit = mix(vec3(1.9,.95,.42), vec3(1.9,.5,.2), rage) * (.25 + 2.2 * pow(sd, 2.5));
          vec3 cc = base + sunlit * lit * (.35 + .65 * c) + vec3(.16,.2,.3) * (1. - pow(sd, .5)) * .6;
          col = mix(col, cc, c * smoothstep(-.02, .12, h) * .93);
        } else col = mix(hor * .5, vec3(.05,.045,.05), smoothstep(0., -.25, h));
        col += vec3(1.,.86,.62) * smoothstep(.99955, .9998, sd) * 70. * uDisc;
        gl_FragColor = vec4(col, 0.);     // alpha = 0：标记「这里是天空」，体积光只从这里取光
      }` });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), mat); mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, mat };
}

// ───────── 火焰（十字交叉的两片，着色器里滚动噪声）─────────
const fireMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { time: { value: 0 }, seed: { value: Math.random() * 20 }, power: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `varying vec2 vUv; uniform float time, seed, power; ${NOISE}
    void main(){ vec2 uv = vUv; float y = uv.y; float n = fbm(vec2(uv.x * 3.2 + seed, y * 2.4 - time * 2.6 + seed)) * .7 + fbm(vec2(uv.x * 7. + seed, y * 5. - time * 4.2)) * .3;
      float w = abs(uv.x - .5 + (n - .5) * .22 * y) * 2.; float body = (1. - w / mix(.9, .12, pow(y, .7))) ; float f = clamp(body, 0., 1.) * smoothstep(1., .25, y + (1. - n) * .45) * smoothstep(0., .06, y);
      f = pow(f, 1.25) * (.7 + .6 * n);
      vec3 c = mix(vec3(1.,.16,.02), vec3(1.,.55,.1), smoothstep(.1,.5,f)); c = mix(c, vec3(1.,.9,.6), smoothstep(.5,.95,f));
      gl_FragColor = vec4(c * f * 5.5 * power, f); }` });

export function buildCastle(W) {
  const { scene, T } = W, out = { fires: [], lights: [], update: null };
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  const wallMat = triMat({ set: T.stone, scale: 0.24, nStr: 1.5, color: 0x7d7466, roughness: 0.92, wear: 0.6, wearColor: 0xbdb39c, wearMetal: 0, wearRough: 0.85, dirt: 1, dirtColor: 0x2a241c, tint: 0.95, macro: 1.25 });
  const rockMat = triMat({ set: T.rock, scale: 0.42, nStr: 1.4, color: 0x8d8475, roughness: 0.9, wear: 0.6, wearColor: 0xc2b8a2, wearMetal: 0, wearRough: 0.8, dirt: 1, dirtColor: 0x15120d, tint: 0.5, macro: 0.6 });
  const ironMat = triMat({ set: T.metal, scale: 1.2, nStr: 1.2, color: 0x1d1c1b, metalness: 1, roughness: 0.62, wear: 0.7, wearColor: 0x7c7468, wearRough: 0.35, dirt: 1, dirtColor: 0x0a0705 });
  out.mats = { wallMat, rockMat, ironMat };

  // ── 正面城墙 + 城门 ──（世界坐标直接雕）
  const WZ = -17.6, arch = (w, hgt, z, depth) => S.union(S.at(S.box(w, hgt / 2, depth), 0, hgt / 2, z), S.at(S.cyl(w, depth), 0, hgt, z, PI / 2, 0, 0));
  const hole = arch(3.2, 6.6, WZ, 4);
  const back = S.rough(S.sub(
    S.sunion(0.06,
      S.at(S.box(17.5, 7.3, 1.3), 0, 7.3, WZ),
      S.inter(S.sub(arch(3.95, 6.6, WZ, 2.1), hole), S.plane(0, 0, 1, 15.2)),                                      // 门框：比墙面凸出一圈
      S.inter(S.sub(arch(4.6, 6.6, WZ, 1.75)), S.sub(S.plane(0, 0, 1, 15.6), arch(4.15, 6.6, WZ, 5))),              // 第二道线脚
      S.mirrorX(S.sunion(0.05, S.at(S.box(1.8, 8.6, 2.0), 6.9, 8.6, WZ + 1.0), S.at(S.box(2.1, 0.32, 2.3), 6.9, 17.3, WZ + 1.0), S.at(S.box(2.0, 0.28, 2.2), 6.9, 5.2, WZ + 1.0), S.at(S.box(2.15, 0.6, 2.35), 6.9, 0.6, WZ + 1.0))),   // 两侧扶壁塔
      S.at(S.box(17.5, 0.3, 1.55), 0, 11.6, WZ),                                                                      // 腰线
      repX(S.at(S.box(0.52, 0.6, 1.3), 0, 15.1, WZ), 1.7, -10, 10),                                                   // 垛口
      S.mirrorX(repX(S.at(S.box(0.45, 0.5, 2.0), 0, 18.1, WZ + 1.0), 1.4, 4, 6))),
    hole,
    S.mirrorX(S.at(S.box(0.2, 1.3, 4), 6.9, 10.2, WZ + 1.0)), S.mirrorX(S.at(S.box(0.2, 1.0, 4), 6.9, 14.3, WZ + 1.0)),   // 箭窗
    S.mirrorX(repX(S.at(arch(0.6, 1.6, WZ + 1.3, 0.5), 0, 6.4, 0), 2.6, 4, 5))), 0.055, 1.25);                              // 墙上的壁龛
  add(S.meshSDF(back, [-18, 0, -19.4, 18, 19, -13.4], 0.105, { ao: [0.3, 0.9, 2.2], wear: 0.22 }), wallMat);
  // 台阶
  const steps = S.rough(S.union(S.at(S.box(5.2, 0.22, 1.5), 0, 0.22, -14.6), S.at(S.box(4.7, 0.22, 1.1), 0, 0.66, -15.0), S.at(S.box(4.2, 0.22, 0.75), 0, 1.1, -15.35)), 0.035, 1.6);
  add(S.meshSDF(steps, [-5.6, 0, -16.4, 5.6, 1.5, -12.9], 0.06, { ao: [0.2, 0.6, 1.4], wear: 0.14 }), wallMat);
  // ── 侧面拱廊（雕一侧，镜像出另一侧）──
  const niche = S.union(S.at(S.box(1.6, 2.3, 1.35), 12.6, 2.3, 0), S.at(S.cyl(1.35, 1.6), 12.6, 4.6, 0, 0, 0, PI / 2));
  const side = S.rough(S.sub(
    S.sunion(0.06, S.at(S.box(1.5, 6.0, 15.5), 14.1, 6.0, -3.5), repZ(S.at(S.box(0.3, 6.0, 0.48), 12.5, 6.0, 2.2), 4.4, -4, 2), S.at(S.box(1.75, 0.3, 15.5), 14.1, 7.3, -3.5), S.at(S.box(1.8, 0.35, 15.5), 14.1, 12.0, -3.5),
      repZ(S.at(S.box(1.5, 0.55, 0.5), 14.1, 12.9, 0), 1.7, -11, 7)),
    repZ(niche, 4.4, -4, 2), repZ(S.at(S.box(1.2, 1.0, 0.35), 12.9, 9.6, 0), 4.4, -4, 2)), 0.055, 1.25);
  const sideGeo = S.meshSDF(side, [12, 0, -19.2, 16, 14, 12.2], 0.11, { ao: [0.3, 0.9, 2.2], wear: 0.22 });
  add(sideGeo, wallMat); add(S.mirrorGeo(sideGeo), wallMat);
  // ── 立柱与火盆 ──
  const pillar = S.rough(S.sunion(0.05, S.cyl(0.52, 2.3, 0.03), S.at(S.box(0.82, 0.22, 0.82, 0.04), 0, -2.08, 0), S.at(S.box(0.72, 0.16, 0.72, 0.04), 0, 2.14, 0), S.at(S.torus(0.56, 0.085), 0, -1.7, 0), S.at(S.torus(0.56, 0.085), 0, 1.86, 0), S.at(S.torus(0.54, 0.05), 0, 0.2, 0)), 0.045, 2.6);
  const pillarGeo = S.meshSDF(pillar, [-0.95, -2.35, -0.95, 0.95, 2.35, 0.95], 0.03, { ao: [0.08, 0.25, 0.6], wear: 0.07 });
  const bowl = S.sunion(0.02, S.sub(S.sphere(0.62), S.at(S.sphere(0.56), 0, 0.03, 0), S.at(S.box(1, 0.5, 1), 0, 0.58, 0)), S.at(S.torus(0.6, 0.045), 0, 0.08, 0), S.at(S.cyl(0.1, 0.3), 0, -0.75, 0), S.polar(S.at(S.capsule(0, -0.5, 0, 0.42, -1.0, 0, 0.035), 0, 0, 0), 3), S.at(S.torus(0.3, 0.035), 0, -0.9, 0));
  const bowlGeo = S.meshSDF(bowl, [-0.72, -1.08, -0.72, 0.72, 0.2, 0.72], 0.016);
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 1, emissive: new THREE.Color(2.4, 0.5, 0.06) });
  const brazier = (x, z, onPillar) => {
    const y = onPillar ? 4.6 : 0;
    if (onPillar) { const p = add(pillarGeo, rockMat); p.position.set(x, 2.3, z); p.rotation.y = Math.random() * 6; }
    const b = add(bowlGeo, ironMat); b.position.set(x, y + 1.05, z); b.rotation.y = Math.random() * 6;
    const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), coalMat); coal.position.set(x, y + 1.05, z); scene.add(coal);
    const fm = fireMat(), fg = new THREE.Group(); fg.position.set(x, y + 1.0, z);
    for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2), fm); q.position.y = 1.05; q.rotation.y = i * PI / 3; q.renderOrder = 5; fg.add(q); }
    scene.add(fg);
    const l = new THREE.PointLight(new THREE.Color(1, 0.48, 0.16), 42, 20, 1.8); l.position.set(x, y + 1.9, z); scene.add(l);
    out.fires.push({ fm, l, base: 42, ph: Math.random() * 10, pos: new THREE.Vector3(x, y + 1.5, z) });
  };
  brazier(-5.6, -10.8, true); brazier(5.6, -10.8, true); brazier(-8.6, -2.2, true); brazier(8.6, -2.2, true); brazier(-4.2, 2.6, false); brazier(4.4, 2.2, false);
  // 断柱与碎石
  const stump = S.rough(S.sub(S.sunion(0.05, S.cyl(0.52, 1.0, 0.03), S.at(S.box(0.82, 0.22, 0.82, 0.04), 0, -0.8, 0)), S.at(S.box(2, 1, 2), 0.2, 1.55, 0, 0.35, 0.3, 0.25)), 0.09, 2.2);
  const stumpGeo = S.meshSDF(stump, [-0.95, -1.05, -0.95, 0.95, 1.1, 0.95], 0.03, { ao: [0.08, 0.25, 0.6], wear: 0.07 });
  for (const [x, z, r] of [[-10.6, 5.2, 0.4], [10.2, 6.4, 2.1], [-11.2, -8.4, 1.0]]) { const m = add(stumpGeo, rockMat); m.position.set(x, 1.0, z); m.rotation.y = r; }
  const rocks = [0, 1, 2].map(i => S.meshSDF(S.rough(S.sunion(0.1, S.ellipsoid(0.42, 0.28, 0.36), S.at(S.box(0.2, 0.16, 0.24, 0.05), 0.2, 0.05, 0.1, i, i * 2, 0.4)), 0.3, 2.3 + i), [-0.8, -0.6, -0.8, 0.8, 0.6, 0.8], 0.03, { ao: [0.08, 0.25, 0.6], wear: 0.07 }));
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = 9 + Math.random() * 3.2, m = add(rocks[i % 3], rockMat), s = 0.35 + Math.random() * 1.1; m.position.set(Math.cos(a) * r * 1.1, 0.12 * s, -3.5 + Math.sin(a) * r * 1.25); m.scale.setScalar(s); m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); }

  // ── 地面：湿石板 + 镜面倒影 ──
  const refRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const floorMat = triMat({ set: T.flag, scale: 0.26, nStr: 1.5, color: 0x6f675b, roughness: 0.86, bake: false, dirt: 0.9, dirtColor: 0x0f0c09, tint: 0.6, envMapIntensity: 0.35 });
  const FU = { tRef: { value: refRT.texture }, uRefMat: { value: new THREE.Matrix4() }, uRefOn: { value: 1 }, uBoss: { value: new THREE.Vector3(0, -3.4, 1) } };
  const base = floorMat.onBeforeCompile;
  floorMat.onBeforeCompile = sh => {
    base(sh); Object.assign(sh.uniforms, FU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tRef; uniform mat4 uRefMat; uniform float uRefOn; uniform vec3 uBoss; varying vec3 vWP; float tPud;')
      .replace('reflectedLight.directSpecular *= mix(1., tAO, .5);', `reflectedLight.directSpecular *= mix(1., tAO, .5);
        // 地面的接触阴影（解析）：靠近墙根、柱脚、Boss 脚下的地方更暗
        float fAO = mix(.3, 1., smoothstep(0., 2.8, 12.5 - abs(vWP.x))) * mix(.3, 1., smoothstep(0., 2.8, vWP.z + 16.3 + step(abs(vWP.x), 3.2) * 4.));
        fAO *= mix(.35, 1., smoothstep(.7, 2.2, length(vec2(abs(vWP.x), vWP.z) - vec2(5.6, -10.8)))) * mix(.35, 1., smoothstep(.7, 2.2, length(vec2(abs(vWP.x), vWP.z) - vec2(8.6, -2.2))));
        fAO *= mix(.4, 1., smoothstep(.6, 3.4, length(vWP.xz - uBoss.xy)));
        reflectedLight.indirectDiffuse *= fAO; reflectedLight.indirectSpecular *= fAO; reflectedLight.directDiffuse *= mix(1., fAO, .4);`)
      .replace('roughnessFactor = mix(roughnessFactor, .06, uWet * smoothstep(.3, .9, tnO.y));', `
        tPud = smoothstep(.5, .64, texture2D(tM, vWP.xz * .021 + .13).g * .62 + texture2D(tM, vWP.xz * .083).g * .38 + tmk.a * .16 - .02);   // 积水：低洼处 + 石缝
        diffuseColor.rgb *= mix(1., .42, tPud);
        roughnessFactor = mix(roughnessFactor, .035, tPud);`)
      .replace('normal = normalize(vNM * tnB) * (gl_FrontFacing ? 1. : -1.);', 'normal = normalize(vNM * normalize(mix(tnB, vec3(0., 1., 0.) + vec3(tnB.x, 0., tnB.z) * .05, tPud * .96)));')
      .replace('#include <opaque_fragment>', `
        { vec3 vdir = normalize(vViewPosition); float ndv = clamp(dot(normal, vdir), 0., 1.), fr = .03 + .97 * pow(1. - ndv, 5.);
          vec4 rc = uRefMat * vec4(vWP, 1.); vec2 ruv = rc.xy / rc.w + (vNM * tnB).xy * mix(.035, .006, tPud);
          vec3 rcol = texture2D(tRef, ruv, mix(4.5, .6, tPud)).rgb;
          outgoingLight += rcol * uRefOn * mix(fr * .22 * (1. - roughnessFactor), fr * .96 + .02, tPud); }
        #include <opaque_fragment>`);
  };
  floorMat.customProgramCacheKey = () => 'floor';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat); floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
  out.floor = floor; out.refRT = refRT; out.FU = FU;

  // ── 远山剪影 ──
  const ridge = (z, hgt, col, seed) => { const n = 120, sh = new THREE.Shape(); sh.moveTo(-400, -20); for (let i = 0; i <= n; i++) { const x = -400 + i / n * 800, y = hgt * (0.35 + 0.65 * Math.abs(S.fbm3(i * 0.09 + seed, seed, 1.3, 4) * 2 - 0.9)); sh.lineTo(x, y); } sh.lineTo(400, -20);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: col, fog: false })); m.position.z = z; scene.add(m); return m; };
  ridge(-420, 95, new THREE.Color(0.20, 0.13, 0.12), 3.1); ridge(-260, 52, new THREE.Color(0.10, 0.075, 0.075), 9.7);

  // ── 旗帜 ──
  const bannerMat = triMat({ set: T.cloth, scale: 1.4, nStr: 1.2, color: 0x6e0f0c, roughness: 0.9, bake: false, dirt: 0.7, dirtColor: 0x120403, tint: 0.5, side: THREE.DoubleSide });
  const bb = bannerMat.onBeforeCompile; bannerMat.onBeforeCompile = sh => { bb(sh); sh.uniforms.uTime = W.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      float bw = clamp((2.6 - position.y) / 5.2, 0., 1.); transformed.z += (sin(uTime * 1.3 + position.y * 1.4 + position.x * 2.) * .16 + sin(uTime * 2.3 + position.y * 3.1) * .05) * bw; transformed.x += sin(uTime * .9 + position.y * 1.1) * .05 * bw;`); };
  bannerMat.customProgramCacheKey = () => 'banner';
  for (const x of [-4.9, 4.9, -10.2, 10.2]) { const g = new THREE.PlaneGeometry(1.5, 5.2, 10, 30), m = new THREE.Mesh(g, bannerMat); m.position.set(x, Math.abs(x) > 6 ? 7.6 : 8.4, Math.abs(x) > 6 ? -16.0 : -15.55); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8), ironMat); rod.rotation.z = PI / 2; rod.position.set(x, m.position.y + 2.62, m.position.z); scene.add(rod); }

  // ── 空气里的浮尘 ──
  const n = 900, dp = new Float32Array(n * 3), ds = new Float32Array(n);
  for (let i = 0; i < n; i++) { dp[i * 3] = (Math.random() - 0.5) * 30; dp[i * 3 + 1] = Math.random() * 12; dp[i * 3 + 2] = -16 + Math.random() * 26; ds[i] = Math.random() * 6.28; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aPh', new THREE.BufferAttribute(ds, 1));
  out.dustMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime: W.uTime, uScale: { value: 600 } },
    vertexShader: `attribute float aPh; uniform float uTime, uScale; varying float vA;
      void main(){ vec3 p = position; p.x += sin(uTime * .21 + aPh) * 1.4; p.y = mod(p.y + uTime * .12 + aPh, 12.); p.z += cos(uTime * .17 + aPh * 1.7) * 1.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = (.02 + .02 * fract(aPh * 3.7)) * uScale / max(.4, -mv.z); vA = (.35 + .65 * sin(uTime * 1.7 + aPh * 5.)) * smoothstep(.5, 3., -mv.z); }`,
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vec3(1.,.72,.42) * 1.6, smoothstep(1., .2, d) * vA * .55); }' });
  const dust = new THREE.Points(dg, out.dustMat); dust.frustumCulled = false; scene.add(dust);

  // ── 雾霭：几团被夕阳染暖的薄雾，把 Boss 和城墙在纵深上分开 ──
  const hazeMat = () => new THREE.SpriteMaterial({ map: W.FT.glow, color: new THREE.Color(0.5, 0.26, 0.14), opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  out.haze = [];
  for (let i = 0; i < 12; i++) { const sp = new THREE.Sprite(hazeMat()), low = i < 6; sp.position.set((Math.random() - 0.5) * 24, low ? 0.6 + Math.random() * 1.2 : 3 + Math.random() * 6, low ? -7 - Math.random() * 7 : -10 - Math.random() * 5); sp.scale.set(low ? 16 + Math.random() * 10 : 12 + Math.random() * 8, low ? 2.4 + Math.random() * 2 : 6 + Math.random() * 5, 1); sp.material.opacity = low ? 0.55 : 0.3; sp.renderOrder = 4; sp.userData = { x: sp.position.x, ph: Math.random() * 6, sp: 0.03 + Math.random() * 0.05 }; scene.add(sp); out.haze.push(sp); }

  // ── 灯光 ──
  const sun = out.sun = new THREE.DirectionalLight(new THREE.Color(1, 0.6, 0.32), 5.2); sun.position.copy(SUN_DIR).multiplyScalar(60).add(new THREE.Vector3(0, 0, -4)); sun.target.position.set(0, 2, -4); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 24; sc.bottom = -16; sc.near = 10; sc.far = 130; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  const fill = out.fill = new THREE.DirectionalLight(new THREE.Color(0.62, 0.72, 1.0), 0.55); fill.position.set(5, 10, 14); fill.target.position.set(0, 3, -5); scene.add(fill, fill.target);   // 天光补面
  // 主光：从镜头左前方打向 Boss 的暖光（被夕阳照亮的地面与火盆的反弹），把甲胄的正面塑出来；右后方再补一道冷色的轮廓光
  const key = out.key = new THREE.SpotLight(new THREE.Color(1, 0.78, 0.56), 230, 40, 0.34, 0.7, 1.6); key.position.set(-5.5, 4.2, 7.5); key.target.position.set(0, 3.6, -3.4); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 2; key.shadow.camera.far = 30; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04;
  const rim = out.rim = new THREE.SpotLight(new THREE.Color(0.5, 0.7, 1.0), 210, 40, 0.5, 0.7, 1.6); rim.position.set(8.5, 7.5, -7.5); rim.target.position.set(0, 4, -3.4); scene.add(rim, rim.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.42, 0.5, 0.75), new THREE.Color(0.75, 0.42, 0.22), 0.5); scene.add(hemi);   // 天光 + 被夕阳照暖的地面反弹光
  scene.fog = new THREE.FogExp2(new THREE.Color(0.30, 0.19, 0.14), 0.016);

  out.update = (T2, dt) => { for (const h of out.haze) h.position.x = h.userData.x + Math.sin(T2 * h.userData.sp + h.userData.ph) * 3; for (const f of out.fires) { f.fm.uniforms.time.value = T2; f.l.intensity = f.base * (0.78 + 0.22 * Math.sin(T2 * 11 + f.ph) * Math.sin(T2 * 7.3 + f.ph * 2) + 0.1 * Math.sin(T2 * 23 + f.ph)); } };
  return out;
}
