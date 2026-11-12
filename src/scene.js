// 写实 3D 世界：黄昏的城堡庭院、巨型骑士 Boss、第一人称的剑。
// 模型全部用 SDF 雕刻后网格化（gfx/sdf.js），材质是三向投影 PBR（gfx/materials.js），画面经过完整的后期处理链（gfx/post.js）。
import * as THREE from 'three';
import { dragPos, APPROACH } from './chart.js';
import { makeTextures } from './gfx/textures.js';
import { makeSky, buildCastle, SUN_DIR } from './gfx/castle.js';
import { makePost } from './gfx/post.js';
import { buildKnight } from './gfx/knight.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const PI = Math.PI, BS = 3.3, BOSS_Z = -3.4, BLOCK_DEPTH = 1.9;       // BS: Boss 的放大倍数；BLOCK_DEPTH: 格挡点离镜头的距离
const HOT = new THREE.Color(6, 2.6, 0.6), EMBER = new THREE.Color(5, 1.2, 0.15), WHITE = new THREE.Color(5, 5, 5.5), BLUE = new THREE.Color(1.2, 3, 6), GOLD = new THREE.Color(5, 3.2, 0.8), RED = new THREE.Color(6, 0.8, 0.2);
const DOWN = V3(0, -1, 0);

// ───────── 特效贴图 ─────────
function fxTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const dot = (g, x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
function makeFxTex() {
  return {
    glow: fxTex(128, (g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }),
    flare: fxTex(256, (g, S) => { g.globalCompositeOperation = 'lighter'; const c = S / 2; for (let i = 0; i < 90; i++) { const u = i / 89 * 2 - 1, w = (1 - Math.abs(u)) ** 2; dot(g, c + u * c * 0.95, c, 3 + 9 * w, 0.25 * w + 0.03); dot(g, c, c + u * c * 0.95, 3 + 9 * w, 0.25 * w + 0.03); dot(g, c + u * c * .55, c + u * c * .55, 2 + 4 * w, 0.1 * w); dot(g, c + u * c * .55, c - u * c * .55, 2 + 4 * w, 0.1 * w); } dot(g, c, c, c * 0.5, 0.9); }),
    ring: fxTex(256, (g, S) => { g.globalCompositeOperation = 'lighter'; const c = S / 2; for (let i = 0; i < 10; i++) { g.strokeStyle = `rgba(255,255,255,${0.05 + i * 0.03})`; g.lineWidth = 20 - i * 1.9; g.beginPath(); g.arc(c, c, c * 0.8, 0, 7); g.stroke(); } }),
    // 八卦阵：发光的法阵（白色蒙版，颜色由材质给）
    bagua: fxTex(1024, (g, S) => { const c = S / 2, r = c - 24; g.translate(c, c); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
      const gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.fillStyle = '#fff';
      g.lineWidth = 14; g.beginPath(); g.arc(0, 0, r - 8, 0, 7); g.stroke(); g.lineWidth = 5; for (const k of [0.86, 0.52, 0.47]) { g.beginPath(); g.arc(0, 0, r * k, 0, 7); g.stroke(); }
      const tri = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]];
      for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * PI / 4); for (let k = 0; k < 3; k++) { const y = -r * (0.58 + k * 0.085); if (tri[i][k]) g.fillRect(-78, y, 156, 24); else { g.fillRect(-78, y, 62, 24); g.fillRect(16, y, 62, 24); } } g.restore(); }
      for (let i = 0; i < 64; i++) { g.save(); g.rotate(i / 64 * PI * 2); g.fillRect(-2, -r * 0.94, 4, i % 4 ? 14 : 30); g.restore(); }
      const t = r * 0.3; g.beginPath(); g.arc(0, 0, t, -PI / 2, PI / 2); g.arc(0, t / 2, t / 2, PI / 2, -PI / 2, true); g.arc(0, -t / 2, t / 2, PI / 2, -PI / 2); g.fill(); g.lineWidth = 7; g.beginPath(); g.arc(0, 0, t, 0, 7); g.stroke(); g.beginPath(); g.arc(0, -t / 2, 16, 0, 7); g.fill(); }),
  };
}
class Particles {   // 火花 / 余烬：加色混合的光点，带重力和阻力
  constructor(n, tex) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.size0 = new Float32Array(n);
    const g = this.geo = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uScale: { value: 500 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'attribute vec3 aColor; attribute float aSize, aAlpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(.05, -mv.z); }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, texture2D(map, gl_PointCoord).a * vA); }' });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 20;
  }
  emit(p, vx, vy, vz, c, size, life, grav = 0, drag = 0) { const i = this.i, j = i * 3; this.i = (i + 1) % this.n; this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz; this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b; this.size0[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; }
  burst(p, n, speed, c, size, life, grav = 0, drag = 2, bias = null) { for (let k = 0; k < n; k++) { const u = rnd(-1, 1), a = rnd(6.28), s = Math.sqrt(1 - u * u), sp = speed * rnd(0.25, 1); this.emit(p, s * Math.cos(a) * sp + (bias ? bias.x : 0), u * sp + (bias ? bias.y : 0), s * Math.sin(a) * sp + (bias ? bias.z : 0), c, size * rnd(0.4, 1.3), life * rnd(0.5, 1), grav, drag); } }
  update(dt) {
    const { pos, vel, life, max, n } = this;
    for (let i = 0; i < n; i++) { if (life[i] <= 0) { if (this.size[i] !== 0) { this.size[i] = 0; this.alpha[i] = 0; } continue; }
      life[i] -= dt; const k = Math.max(0, 1 - this.drag[i] * dt), j = i * 3; vel[j] *= k; vel[j + 1] = vel[j + 1] * k - this.grav[i] * dt; vel[j + 2] *= k; pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < 0.02 && vel[j + 1] < 0) { pos[j + 1] = 0.02; vel[j + 1] *= -0.35; vel[j] *= 0.6; vel[j + 2] *= 0.6; }      // 火花落地会弹一下
      const f = Math.max(0, life[i] / max[i]); this.alpha[i] = Math.min(1, f * 2); this.size[i] = this.size0[i] * (0.4 + 0.6 * f); }
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}
const BEAM_VS = 'varying vec3 vN; varying vec2 vUv; void main(){ vN = normalize(normalMatrix * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const BEAM_FS = 'uniform vec3 color; uniform float alpha, time; varying vec3 vN; varying vec2 vUv; void main(){ float f = pow(abs(vN.z), 2.2); float n = .7 + .3 * sin(vUv.y * 70. - time * 50.) * sin(vUv.x * 12.56 + time * 9.); gl_FragColor = vec4(color * n, f * alpha); }';
const beamMat = (color, alpha) => new THREE.ShaderMaterial({ uniforms: { color: { value: color.clone() }, alpha: { value: alpha }, time: { value: 0 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.scene = new THREE.Scene(); this.uTime = { value: 0 };
    this.camera = new THREE.PerspectiveCamera(55, 4 / 3, 0.08, 1500); this.scene.add(this.camera);
    this.camBase = V3(0, 1.5, 6.9); this.camLook = V3(0, 4.25, BOSS_Z);
    this.T = makeTextures(r, 1024); this.FT = makeFxTex();
    this.time = 0; this.songT = 0; this.shake = 0; this.punch = 0; this.mode = 'title'; this.mood = 0; this.moodTarget = 0;
    this.w = { raise: 0, down: 0, beam: 0, lunge: 0 }; this.recoil = 0; this.stagger = 0; this.knock = 0; this.deathT = -1; this.escapeT = -1; this.glowBoost = 0;
    this.shields = new Map(); this.charging = new Set(); this.flashes = []; this.trails = []; this.strike = null; this.strike2 = null; this.beamN = null; this.baguaN = null; this.blockN = null;
    this._v = V3(); this._v2 = V3(); this._v3 = V3(); this._x = V3(); this._y = V3(); this._z = V3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._q3 = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = {};
    // 天空 + 由天空生成的环境光照
    this.sky = makeSky(); this.scene.add(this.sky.mesh);
    const pm = new THREE.PMREMGenerator(r), es = new THREE.Scene(); this.sky.mat.uniforms.uDisc.value = 0; es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.sky.mat));
    this.scene.environment = pm.fromScene(es, 0.03).texture; this.scene.environmentIntensity = 1.25; this.sky.mat.uniforms.uDisc.value = 1; pm.dispose();
    this.castle = buildCastle(this);
    const t0 = performance.now();
    const B = this.boss = buildKnight(this.T, 'tyrant', this.uTime); B.root.scale.setScalar(BS); B.root.position.set(0, -0.04 * BS, BOSS_Z); this.scene.add(B.root); B.bones.hR.add(B.sword);
    const Hr = this.hero = buildKnight(this.T, 'hero', this.uTime); Hr.root.position.set(1.25, -0.04, 4.3); Hr.root.rotation.y = PI - 0.22; this.scene.add(Hr.root); Hr.bones.hR.add(Hr.sword); Hr.sword.rotation.x = PI / 2;
    this.sculptMs = performance.now() - t0;
    this.buildViewmodel(); this.buildFx();
    this.refCam = new THREE.PerspectiveCamera();
    this.post = makePost(r, this.scene, this.camera, { ao: false, msaa: 4 });
    this.frameAvg = 16; this.frames = 0;
  }

  // 第一人称：右前臂 + 手甲 + 剑，挂在相机上
  buildViewmodel() {
    const H = this.hero, vm = this.vmRoot = new THREE.Group(); this.camera.add(vm);
    const arm = this.vmArm = new THREE.Group(); vm.add(arm);
    const fore = new THREE.Mesh(H.foreGeoR, H.M.plate); fore.position.set(0, 0.345, -0.03); fore.castShadow = false; arm.add(fore);   // 手腕在原点，前臂沿 +Y 伸向肘部
    const sw = this.vmSword = new THREE.Group(); for (const c of H.sword.children) { const m = c.clone(); m.castShadow = false; sw.add(m); } sw.rotation.x = PI / 2; arm.add(sw);             // 剑身沿手臂本地的 +Z
    this.vmRune = sw.children.find(c => c.material === H.runeMat);
    this.vm = { thrust: 0, swing: 0, aim: V3(0, 0, -1), dir: V3(1, 0, 0), charge: 0, pos: V3(0.36, -0.4, -0.85), quat: new THREE.Quaternion(), block: 0, bp: V3() };
  }
  vmPose(hand, blade, forearm, outPos, outQuat) {      // 由「手的位置、剑身方向、前臂方向」求出手臂的姿态
    const y = this._y.copy(forearm).normalize(), z = this._z.copy(blade).addScaledVector(y, -blade.dot(y)).normalize(), x = this._x.crossVectors(y, z);
    outQuat.setFromRotationMatrix(this._m.makeBasis(x, y, z)); outPos.copy(hand);
  }
  buildFx() {
    this.parts = new Particles(2600, this.FT.glow); this.scene.add(this.parts.mesh);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    const bm = (c, a) => { const m = new THREE.Mesh(this.beamGeo, beamMat(c, a)); m.visible = false; m.frustumCulled = false; m.renderOrder = 18; this.scene.add(m); return m; };
    this.beam = { halo: bm(RED, 0.9), core: bm(WHITE, 1) };
    this.sparkLight = new THREE.PointLight(new THREE.Color(1, 0.75, 0.45), 0, 12, 1.8); this.scene.add(this.sparkLight);
    // 幻影剑：双 HOLD 时第二把剑
    this.ghost = new THREE.Mesh(this.boss.bladeGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { alpha: { value: 0 } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform float alpha; varying vec3 vN; void main(){ float f = 1. - abs(vN.z); gl_FragColor = vec4(vec3(5., .9, .25) * (.35 + 1.6 * f * f), alpha); }' }));
    this.ghost.scale.setScalar(BS); this.ghost.visible = false; this.ghost.frustumCulled = false; this.scene.add(this.ghost);
    // 八卦阵：平躺在 Boss 脚下，另有一圈竖在身后
    const bg = (s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.FT.bagua, color: new THREE.Color(4.5, 3.0, 0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.scale.setScalar(s); m.visible = false; m.renderOrder = 17; this.scene.add(m); return m; };
    this.baguaFloor = bg(13); this.baguaFloor.rotation.x = -PI / 2; this.baguaFloor.position.set(0, 0.06, BOSS_Z);
    this.baguaBack = bg(11); this.baguaBack.position.set(0, 4.6, BOSS_Z - 1.6); this.baguaA = 0;
  }
  warmup() { this.update(0.016); this.render(16); }
  resize(w, h) {
    this.W = w; this.H = h; const pr = this.pixelRatio; this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.post.setSize(w, h, pr);
    this.camera.aspect = w / h; this.camera.fov = w / h < 1.5 ? 55 : 48; this.camera.updateProjectionMatrix();
    this.castle.refRT.setSize(Math.max(256, Math.round(w * pr * 0.5)), Math.max(256, Math.round(h * pr * 0.5)));
    const sc = h * pr / (2 * Math.tan(this.camera.fov * PI / 360)); this.castle.dustMat.uniforms.uScale.value = sc; this.parts.mat.uniforms.uScale.value = sc;
  }
  screenToWorld(nx, ny, depth, out = V3()) { out.set(nx * 2 - 1, 1 - ny * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize(); return out.multiplyScalar(depth).add(this.camera.position); }
  rayToBoss(nx, ny, out = V3()) { out.set(nx * 2 - 1, 1 - ny * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize(); const k = (this.boss.root.position.z + 1.1 - this.camera.position.z) / out.z; return out.multiplyScalar(k).add(this.camera.position); }
  chestPos(out) { return this.boss.bones.chest.localToWorld(out.set(0, 0.25, 0.2)); }
  addShake(v) { this.shake = Math.min(1, this.shake + v); }
  flash(tex, pos, color, s0, s1, dur, rot = 0) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, rotation: rot, fog: false })); s.position.copy(pos); s.scale.setScalar(s0); s.renderOrder = 22; this.scene.add(s); this.flashes.push({ s, t: 0, dur, s0, s1 }); }
  placeBeam(m, a, b, radius) { const d = this._v3.subVectors(b, a), len = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); m.scale.set(radius, len, radius); }
  sparks(p, n, power = 1, c = HOT) { this.parts.burst(p, n, 7 * power, c, 0.05, 0.6, 14, 1.2); this.parts.burst(p, Math.ceil(n / 3), 4 * power, WHITE, 0.035, 0.3, 9, 2); }

  // ── 判定事件 → 动作与特效 ──
  touchHit() { }
  holdHead(n) { const p = this.screenToWorld(n.x, n.y, BLOCK_DEPTH); this.flash(this.FT.flare, p, new THREE.Color(4, 3.2, 2.2), 0.5, 2.4, 0.2, rnd(3)); this.flash(this.FT.ring, p, new THREE.Color(3, 2, 1), 0.2, 1.8, 0.28); this.sparks(p, 40, 1.3); this.addShake(0.45); this.punch = Math.max(this.punch, 0.6); }
  tapHit(n, grade) {
    const hit = this.rayToBoss(n.x, n.y), big = n.finisher ? 2.4 : 1, c = grade === 0 ? GOLD : HOT;
    this.flash(this.FT.flare, hit, c, 1.2 * big, (grade === 0 ? 5 : 3.6) * big, 0.22, rnd(3)); this.flash(this.FT.ring, hit, c, 0.5, 3.5 * big, 0.28);
    this.parts.burst(hit, grade === 0 ? 34 : 22, 9, c, 0.07, 0.7, 14, 1.0, V3(0, 2, 5)); this.parts.burst(hit, 8, 5, WHITE, 0.05, 0.3, 6, 2, V3(0, 1, 3));
    this.recoil = Math.min(1.5, this.recoil + 0.6 * big); this.addShake(0.12 * big); this.punch = Math.max(this.punch, 0.5);
    this.vm.thrust = 1; this.vm.aim.copy(hit).applyMatrix4(this.camera.matrixWorldInverse).normalize();
    if (n.finisher) this.post.grade.uniforms.uFlash.value = 0.6;
  }
  chargeStart(n) { this.charging.add(n); }
  chargeEnd(n) { this.charging.delete(n); }
  // 蓄力剑气：一道剑光严格沿音符既定的方向划出去，同时推向 Boss；甩出的同一瞬间 Boss 就受击
  flickRelease(n) {
    this.charging.delete(n);
    const A = this.camera.aspect, at = (k, depth) => this.screenToWorld(n.x + n.dir.x * k / A, n.y + n.dir.y * k, depth);
    const far = this.rayToBoss(n.x + n.dir.x * 0.5 / A, n.y + n.dir.y * 0.5), d1 = far.distanceTo(this.camera.position);
    const pts = [at(-0.12, 1.4), at(0, 1.4), at(0.18, 1 / (0.67 / 1.4 + 0.33 / d1)), at(0.36, 1 / (0.33 / 1.4 + 0.67 / d1)), far];
    this.addTrail(pts, 0.1, 0.26, 2.4, BLUE, 0.55);
    const p = this.chestPos(V3()).add(V3((n.x - 0.5) * 3, rnd(-0.6, 1.2), 1.0));
    this.flash(this.FT.flare, p, BLUE, 2.5, 9, 0.35, rnd(3)); this.flash(this.FT.ring, p, BLUE, 1, 9, 0.4); this.flash(this.FT.glow, p, new THREE.Color(2, 4, 7), 3, 12, 0.4);
    this.parts.burst(p, 70, 13, BLUE, 0.09, 0.9, 10, 0.9, V3(0, 3, 5)); this.parts.burst(p, 30, 9, HOT, 0.07, 0.8, 14, 1.0, V3(0, 2, 4));
    this.stagger = 1; this.recoil = 1.5; this.addShake(0.5); this.punch = 1; this.post.grade.uniforms.uFlash.value = Math.max(this.post.grade.uniforms.uFlash.value, 0.18);
    this.vm.swing = 1; this.vm.dir.set(n.dir.x, -n.dir.y, -0.35).normalize();
  }
  // 剑光：沿曲线的带状网格，头部飞到终点后慢慢收尾淡出
  addTrail(pts, dur, w0, w1, color, linger) {
    const N = 40, samples = new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(N - 1), geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 6), uv = new Float32Array(N * 4), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 3] = 1; if (i < N - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { color: { value: color.clone() }, alpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 color; uniform float alpha; varying vec2 vUv; void main(){ float v = abs(vUv.y - .5) * 2.; float a = smoothstep(1., .0, v) * smoothstep(0., .1, vUv.x) * (.35 + .65 * vUv.x); gl_FragColor = vec4(mix(color, vec3(6.), smoothstep(.5, 0., v) * .7), a * alpha); }' });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 21; this.scene.add(mesh);
    const tr = { mesh, geo, pos, samples, N, t: 0, dur, w0, w1, linger }; this.trails.push(tr); this.updateTrail(tr, 0);
  }
  updateTrail(tr, dt) {
    tr.t += dt; const u = Math.min(1, tr.t / tr.dur), head = Math.max(0.03, u * u * (3 - 2 * u)), after = Math.max(0, (tr.t - tr.dur) / tr.linger), N = tr.N, cam = this.camera.position; if (after >= 1) return false;
    const tail = after * 0.9;
    for (let i = 0; i < N; i++) { const f = tail + (head - tail) * (i / (N - 1)), fi = f * (N - 1), i0 = Math.min(N - 2, Math.floor(fi)), a = tr.samples[i0], b = tr.samples[i0 + 1];
      const p = this._v.lerpVectors(a, b, fi - i0), tan = this._v2.subVectors(b, a).normalize(), side = this._v3.subVectors(cam, p).cross(tan).normalize(), w = (tr.w0 + (tr.w1 - tr.w0) * f) * (1 - after * 0.7) * 0.5, j = i * 6;
      tr.pos[j] = p.x + side.x * w; tr.pos[j + 1] = p.y + side.y * w; tr.pos[j + 2] = p.z + side.z * w; tr.pos[j + 3] = p.x - side.x * w; tr.pos[j + 4] = p.y - side.y * w; tr.pos[j + 5] = p.z - side.z * w; }
    tr.geo.attributes.position.needsUpdate = true; tr.mesh.material.uniforms.alpha.value = 1 - after; return true;
  }
  // 八卦镇压成功：法阵炸开，冲击波向四周散去，Boss 被震得跪倒
  baguaBurst() {
    const p = this.chestPos(V3()); p.z += 1.2;
    this.flash(this.FT.glow, p, new THREE.Color(6, 4.4, 1.6), 5, 30, 0.6); this.flash(this.FT.flare, p, GOLD, 4, 18, 0.45, rnd(3)); for (let i = 0; i < 3; i++) this.flash(this.FT.ring, p, GOLD, 2 + i * 2, 26 + i * 9, 0.6 + i * 0.25);
    for (let k = 0; k < 220; k++) { const a = rnd(6.28), sp = rnd(6, 20); this.parts.emit(p, Math.cos(a) * sp, rnd(0, 9), Math.sin(a) * sp * 0.6 + 2, Math.random() < 0.7 ? GOLD : HOT, rnd(0.06, 0.16), rnd(0.8, 1.8), 9, 0.8); }
    this.knock = 1; this.stagger = 1; this.addShake(1); this.punch = 1; this.post.grade.uniforms.uFlash.value = 0.5;
  }
  hurt() { this.addShake(0.6); }
  enrage() { this.moodTarget = 1; this.glowBoost = 2; this.addShake(0.8); const p = this.chestPos(V3()); for (let i = 0; i < 3; i++) this.flash(this.FT.ring, p, RED, 2, 30 + i * 10, 0.8 + i * 0.25); this.flash(this.FT.glow, p, RED, 4, 24, 0.8); this.parts.burst(p, 120, 12, EMBER, 0.1, 1.6, 2, 0.8); }
  death() { this.deathT = 0; }
  escape() { this.escapeT = 0; }
  reset() {
    for (const t of this.trails) { this.scene.remove(t.mesh); t.geo.dispose(); } this.trails.length = 0; this.charging.clear();
    this.deathT = -1; this.escapeT = -1; this.boss.root.visible = true; this.moodTarget = 0; this.recoil = 0; this.stagger = 0; this.knock = 0; this.glowBoost = 0;
    this.strike = this.strike2 = this.beamN = this.baguaN = this.blockN = null; this.w.raise = this.w.down = this.w.beam = this.w.lunge = 0;
  }

  // ── 从谱面里找出此刻 Boss 该做的动作 ──
  syncNotes(notes, first, t) {
    this.songT = t; let strike = null, strike2 = null, beamN = null, baguaN = null, blockN = null;
    for (let i = first; i < notes.length; i++) {
      const n = notes[i]; if (n.t - APPROACH - 0.75 > t) break; if (n.s.done) continue;
      if (n.kind === 'hold') { if (t < n.t - APPROACH || t > n.end) continue; if (n.bagua) baguaN = baguaN || n; else { if (!strike) strike = n; else if (!strike2) strike2 = n; if (n.s.cov && !blockN) blockN = n; } }
      else if (n.kind === 'drag') { if (t >= n.t - 0.75 && t <= n.end) { beamN = beamN || n; if (n.s.cov && !blockN) blockN = n; } }
    }
    this.strike = strike; this.strike2 = strike2; this.beamN = beamN; this.baguaN = baguaN; this.blockN = blockN;
  }
  notePoint(n, t, depth, out) { if (n.kind === 'drag') { dragPos(n, (t - n.t) / (n.end - n.t), this._p); return this.screenToWorld(this._p.x, this._p.y, depth, out); } return this.screenToWorld(n.x, n.y, depth, out); }
  // 让一条手臂（肩 → 手沿骨骼本地的 -Y）指向世界里的一点
  aimArm(sh, target, out) { const p = sh.parent; p.updateWorldMatrix(true, false); const loc = this._v.copy(target); p.worldToLocal(loc).sub(sh.position).normalize(); return out.setFromUnitVectors(DOWN, loc); }

  update(dt) {
    const T = this.time += dt, t = this.songT, w = this.w, B = this.boss, b = B.bones, title = this.mode === 'title'; this.uTime.value = T;
    this.mood = damp(this.mood, this.moodTarget, 1.2, dt); const mood = this.mood;
    this.sky.mat.uniforms.time.value = T; this.sky.mat.uniforms.rage.value = mood; this.castle.update(T, dt);
    this.recoil = damp(this.recoil, 0, 7, dt); this.stagger = damp(this.stagger, 0, 2.2, dt); this.knock = damp(this.knock, 0, 0.9, dt); this.glowBoost = damp(this.glowBoost, 0, 1, dt);
    const cam = this.camera;
    // ── 相机 ──
    this.shake = damp(this.shake, 0, 9, dt); this.punch = damp(this.punch, 0, 8, dt); const sh = this.shake * this.shake * 0.22;
    this.hero.root.visible = title; this.vmRoot.visible = !title;
    if (title) { const a = 0.32 + Math.sin(T * 0.09) * 0.16; cam.position.set(1.25 + Math.sin(a) * 3.0, 1.75 + Math.sin(T * 0.13) * 0.08, 4.3 + Math.cos(a) * 3.1); }
    else cam.position.set(this.camBase.x + Math.sin(T * 0.4) * 0.03, this.camBase.y + Math.sin(T * 0.7) * 0.02, this.camBase.z + this.punch * 0.12);
    cam.position.x += rnd(-1, 1) * sh; cam.position.y += rnd(-1, 1) * sh;
    cam.lookAt(this.camLook.x + rnd(-1, 1) * sh, this.camLook.y + rnd(-1, 1) * sh - w.lunge * 0.5, this.camLook.z); cam.updateMatrixWorld(); this.sky.mesh.position.copy(cam.position);

    // ── Boss ──
    const st = this.strike, u = st ? (t - (st.t - APPROACH)) / APPROACH : 0, kn = this.knock, sg = this.stagger, dy = this.deathT;
    w.raise = damp(w.raise, st && u < 0.74 ? 1 : 0, 9, dt); w.down = damp(w.down, st && u >= 0.74 ? 1 : 0, 30, dt); w.lunge = damp(w.lunge, st ? 1 : 0, st ? 5 : 3, dt); w.beam = damp(w.beam, this.beamN || this.baguaN ? 1 : 0, 8, dt);
    this.poseIdle(B, T, 1);
    const fall = dy >= 0 ? sstep(0, 1.6, dy) : 0, flat = dy >= 0 ? sstep(1.4, 2.6, dy) : 0, kneel = Math.max(sstep(0.15, 0.6, kn), fall);
    B.root.position.set(0, -0.04 * BS, BOSS_Z + w.lunge * 2.3 - this.recoil * 0.25 - sg * 0.5);
    b.hips.position.y = 1.0 + Math.sin(T * 1.1) * 0.006 - kneel * 0.4 - flat * 0.38; b.hips.rotation.x = w.down * 0.3 - w.raise * 0.12 - this.recoil * 0.07 - sg * 0.18 + kneel * 0.25 + flat * 1.05;
    b.chest.rotation.x += w.down * 0.32 - w.raise * 0.2 - this.recoil * 0.1 - sg * 0.25 + kneel * 0.35; b.chest.rotation.y += -w.raise * 0.35 + w.down * 0.3; b.chest.rotation.z = Math.sin(T * 27) * sg * 0.03;
    b.head.rotation.x += w.down * 0.25 + kneel * 0.5 - sg * 0.3;
    b.thL.rotation.x += -kneel * 1.25 - w.lunge * 0.5; b.knL.rotation.x += kneel * 1.5 + w.lunge * 0.45; b.thR.rotation.x += kneel * 0.35 + w.lunge * 0.3; b.knR.rotation.x += kneel * 1.2 + w.lunge * 0.2;
    // 右臂：待机 → 举剑过顶 → 劈向 HOLD 的落点（剑身指向落点，剑尖压到玩家面前）
    const qIdle = this._q.copy(b.shR.quaternion), qUp = this._q2.setFromEuler(this._e.set(-2.75, 0, -0.35));
    b.shR.quaternion.copy(qIdle).slerp(qUp, w.raise);
    if (st && w.down > 0.001) { const tgt = this.notePoint(st, t, BLOCK_DEPTH - 0.25, this._v2); B.root.updateMatrixWorld(true); b.shR.quaternion.slerp(this.aimArm(b.shR, tgt, this._q3), w.down); }
    b.elR.rotation.x = -0.35 * (1 - w.down) - w.raise * 0.55; B.sword.rotation.x = PI / 2 + (PI / 2) * w.down - w.raise * 0.25 - kneel * 0.9;
    b.shR.rotation.z -= kn * 0.5;
    // 左臂：DRAG 时抬手放出能量束；八卦镇压时两臂张开
    if (this.beamN && w.beam > 0.001) { const tgt = this.notePoint(this.beamN, Math.max(t, this.beamN.t), BLOCK_DEPTH, this._v2); B.root.updateMatrixWorld(true); b.shL.quaternion.slerp(this.aimArm(b.shL, tgt, this._q3), w.beam); b.elL.rotation.x = -0.3 * (1 - w.beam); }
    else if (this.baguaN) { b.shL.rotation.z += w.beam * 0.9; b.shR.rotation.z -= w.beam * 0.5; b.head.rotation.x -= w.beam * 0.3; }
    b.shL.rotation.z += kn * 0.6;
    B.root.updateMatrixWorld(true);
    this.castle.FU.uBoss.value.set(B.root.position.x, B.root.position.z, 1);
    // 发光：眼缝、胸口宝石、剑上的符文 —— 暴走后更亮更红
    const gp = 1 + mood * 1.4 + this.glowBoost + w.beam * 0.8 + Math.sin(T * 3) * 0.12 - flat * 1.2; B.glow.color.setRGB(3.2 * gp, 0.62 * gp * (1 - mood * 0.3), 0.14 * gp); B.runeMat.uniforms.power.value = Math.max(0, 0.8 + mood * 1.2 + w.down * 1.2 + this.glowBoost - flat * 2);
    // 死亡：跪倒 → 扑地，身上不断迸出余烬
    if (dy >= 0) { this.deathT += dt; const c = this.chestPos(this._v); if (dy < 2.8 && Math.random() < 0.8) this.parts.burst(c, 4, 5, EMBER, 0.08, 1.4, -1.5, 0.6);
      if (dy > 0.05 && !this.deathBurst) { this.deathBurst = true; this.post.grade.uniforms.uFlash.value = 0.8; this.addShake(1); this.flash(this.FT.glow, c, GOLD, 6, 40, 1.2); this.parts.burst(c, 260, 15, EMBER, 0.11, 2.4, 3, 0.6); } }
    else this.deathBurst = false;
    if (this.escapeT >= 0) { this.escapeT += dt; if (this.escapeT > 0.9 && B.root.visible) { B.root.visible = false; const c = this.chestPos(this._v); this.flash(this.FT.glow, c, RED, 5, 30, 0.8); this.parts.burst(c, 200, 12, EMBER, 0.1, 2, 0, 0.6); this.post.grade.uniforms.uFlash.value = 0.5; } }

    // ── 格挡点：火花、闪光、点光源 ──
    let sparkI = 0; const bn = this.blockN;
    if (bn) { const p = this.notePoint(bn, t, BLOCK_DEPTH, this._v2); for (let k = 0; k < 4; k++) this.parts.emit(p, rnd(-5, 5), rnd(-1, 6), rnd(0, 4), Math.random() < 0.7 ? HOT : WHITE, rnd(0.025, 0.06), rnd(0.2, 0.55), 14, 1.2);
      if (Math.random() < 0.3) this.flash(this.FT.flare, p, new THREE.Color(3, 2.2, 1.2), 0.2, 0.9, 0.1, rnd(3)); this.sparkLight.position.copy(p); sparkI = 30 + rnd(30); if (Math.random() < 0.3) this.addShake(0.03); }
    this.sparkLight.intensity = damp(this.sparkLight.intensity, sparkI, 30, dt);
    // 幻影剑（双 HOLD 的第二把）
    const s2 = this.strike2, G = this.ghost; G.visible = !!s2;
    if (s2) { const u2 = clamp01((t - (s2.t - APPROACH)) / APPROACH), tgt = this.notePoint(s2, t, BLOCK_DEPTH - 0.2, this._v2), dir = this._v3.set((s2.x - 0.5) * 3.5, 5.5, -6).normalize(), e = sstep(0.74, 1, u2);
      G.position.copy(tgt).addScaledVector(dir, (1 - e) * 9 + B.swordLen * BS * 0.86); G.quaternion.setFromUnitVectors(V3(0, 1, 0), this._v.copy(dir).negate()); G.material.uniforms.alpha.value = Math.min(1, u2 * 3) * 0.85; }
    // 能量束（DRAG）
    const bmN = this.beamN, bm = this.beam; bm.halo.visible = bm.core.visible = !!bmN;
    if (bmN) { const act = t >= bmN.t, pre = clamp01((t - (bmN.t - 0.75)) / 0.75), a = b.hL.getWorldPosition(this._v), e = this.notePoint(bmN, Math.max(t, bmN.t), BLOCK_DEPTH, this._v2);
      this.placeBeam(bm.halo, a, e, act ? 0.2 + 0.04 * Math.sin(T * 50) : 0.03 + 0.05 * pre); this.placeBeam(bm.core, a, e, act ? 0.07 : 0.012);
      bm.halo.material.uniforms.time.value = T; bm.halo.material.uniforms.alpha.value = act ? 1 : 0.3 * pre; bm.core.material.uniforms.alpha.value = act ? 1 : 0.25 * pre;
      if (!act && Math.random() < 0.7) { this._v3.set(rnd(-1.2, 1.2), rnd(-1.2, 1.2), rnd(-1.2, 1.2)).add(a); this.parts.emit(this._v3, (a.x - this._v3.x) * 4, (a.y - this._v3.y) * 4, (a.z - this._v3.z) * 4, RED, 0.08, 0.25); } }
    // 八卦阵
    const bgN = this.baguaN; this.baguaA = damp(this.baguaA, bgN ? (bgN.s.cov ? 1 : 0.22) : 0, bgN ? 8 : 4, dt);
    const prog = bgN ? clamp01((t - bgN.t) / (bgN.end - bgN.t)) : 0; this.baguaSpin = (this.baguaSpin || 0) + dt * (bgN && bgN.s.cov ? 1.5 + prog * 6 : 0.4);
    for (const m of [this.baguaFloor, this.baguaBack]) { m.visible = this.baguaA > 0.01; m.material.opacity = this.baguaA; }
    this.baguaFloor.rotation.z = this.baguaSpin; this.baguaBack.rotation.z = -this.baguaSpin * 0.7; this.baguaFloor.scale.setScalar(13 + prog * 4); this.baguaBack.scale.setScalar(10 + prog * 3);
    if (bgN && bgN.s.cov) { const a = rnd(6.28), rr = 5 + prog * 2; this._v.set(Math.cos(a) * rr, 0.1, BOSS_Z + Math.sin(a) * rr); this.parts.emit(this._v, 0, rnd(3, 8), 0, GOLD, 0.07, 0.9, -2, 0.4); this.addShake(0.012 + 0.02 * prog); }

    // ── 第一人称的手与剑 ──
    const vm = this.vm, tp = this._v, tq = this._q; vm.thrust = Math.max(0, vm.thrust - dt / 0.26); vm.swing = Math.max(0, vm.swing - dt / 0.3); vm.charge = damp(vm.charge, this.charging.size ? 1 : 0, 12, dt);
    const bob = Math.sin(T * 1.5) * 0.008; this.vmPose(this._v2.set(0.4, -0.46 + bob, -0.8), this._v3.set(-0.6, 0.72, -0.36), V3(0.36, -0.5, 0.8), tp, tq);
    if (vm.charge > 0.01) { const hp = V3(0.44 + rnd(-1, 1) * 0.004, -0.2 + rnd(-1, 1) * 0.004, -0.72), hq = this._q2; this.vmPose(hp, this._v3.set(0.3, 0.8, 0.5), V3(0.15, -0.8, 0.55), hp, hq); tp.lerp(hp, vm.charge); tq.slerp(hq, vm.charge); }
    if (vm.swing > 0) { const k = Math.sin(PI * (1 - vm.swing)), d = vm.dir, hp = V3(0.1 + d.x * 0.45, -0.25 + d.y * 0.35, -0.95), hq = this._q2; this.vmPose(hp, this._v3.set(d.x, d.y, -0.5), V3(0.25 - d.x * 0.5, -0.6 - d.y * 0.3, 0.75), hp, hq); tp.lerp(hp, k); tq.slerp(hq, k); }
    if (vm.thrust > 0) { const k = Math.sin(PI * Math.pow(1 - vm.thrust, 0.5)), a = vm.aim, hp = V3(a.x * 0.75 + 0.12, a.y * 0.75 - 0.2, -1.05), hq = this._q2; this.vmPose(hp, this._v3.copy(a), V3(0.3, -0.35, 0.9), hp, hq); tp.lerp(hp, k); tq.slerp(hq, k); }
    vm.block = damp(vm.block, bn ? 1 : 0, bn ? 28 : 10, dt);
    if (bn) this.notePoint(bn, t, BLOCK_DEPTH, vm.bp).applyMatrix4(cam.matrixWorldInverse);
    if (vm.block > 0.01) { const j = bn ? 0.006 : 0, bd = this._v3.set(-1, 0.1, -0.12).normalize(), hp = V3(vm.bp.x + 0.5 + rnd(-j, j), vm.bp.y - 0.05 + rnd(-j, j), vm.bp.z + 0.06), hq = this._q2; this.vmPose(hp, bd, V3(0.5, -0.62, 0.6), hp, hq); tp.lerp(hp, vm.block); tq.slerp(hq, vm.block); }   // 横剑架住
    vm.pos.lerp(tp, 1 - Math.exp(-26 * dt)); vm.quat.slerp(tq, 1 - Math.exp(-26 * dt)); this.vmArm.position.copy(vm.pos); this.vmArm.quaternion.copy(vm.quat);
    this.hero.runeMat.uniforms.power.value = 0.5 + vm.charge * 3 + vm.thrust * 1.5; this.hero.glow.color.setRGB(0.6 + vm.charge * 2, 1.6 + vm.charge * 2, 3.2 + vm.charge * 3);
    for (const n of this.charging) { const p0 = this.screenToWorld(n.x, n.y, 1.5, this._v); for (let k = 0; k < 2; k++) { const a = rnd(6.28), rr = rnd(0.3, 0.55); this._v2.set(p0.x + Math.cos(a) * rr, p0.y + Math.sin(a) * rr, p0.z); this.parts.emit(this._v2, (p0.x - this._v2.x) * 4, (p0.y - this._v2.y) * 4, 0, BLUE, 0.035, 0.25); } }

    // ── 一次性特效 ──
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; const k = f.t / f.dur; if (k >= 1) { this.scene.remove(f.s); f.s.material.dispose(); this.flashes.splice(i, 1); continue; } const e = 1 - (1 - k) * (1 - k); f.s.scale.setScalar(f.s0 + (f.s1 - f.s0) * e); f.s.material.opacity = (1 - k) * (1 - k); }
    for (let i = this.trails.length - 1; i >= 0; i--) { const tr = this.trails[i]; if (!this.updateTrail(tr, dt)) { this.scene.remove(tr.mesh); tr.geo.dispose(); tr.mesh.material.dispose(); this.trails.splice(i, 1); } }
    // 火盆的余烬
    for (const f of this.castle.fires) if (Math.random() < 0.25 + mood * 0.4) this.parts.emit(f.pos, rnd(-0.4, 0.4), rnd(1.2, 3), rnd(-0.4, 0.4), EMBER, rnd(0.02, 0.045), rnd(1, 2.4), -0.6, 0.5);
    this.parts.update(dt);

    // ── 后期参数 ──
    const sp = this._v.copy(SUN_DIR).multiplyScalar(500).add(cam.position).project(cam), fwd = this._v2.set(0, 0, -1).applyQuaternion(cam.quaternion), P = this.post;
    P.rays.uniforms.uSun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5); P.rays.uniforms.uOn.value = clamp01(fwd.dot(SUN_DIR) * 2.2 - 0.3) * (1 - mood * 0.3); P.rays.uniforms.uTime.value = T;
    P.grade.uniforms.uTime.value = T; P.grade.uniforms.uRage.value = mood; P.grade.uniforms.uFlash.value = damp(P.grade.uniforms.uFlash.value, 0, 5, dt);
  }
  // 待机姿态：微微起伏的呼吸，右手提剑、剑尖斜指地面
  poseIdle(K, T, amp) {
    const b = K.bones, br = Math.sin(T * 1.1) * amp;
    b.hips.position.y = 1.0 + br * 0.006; b.hips.rotation.set(0, 0, 0); b.chest.rotation.set(0.04 + br * 0.012, Math.sin(T * 0.4) * 0.03 * amp, 0); b.head.rotation.set(-0.08 - br * 0.01, Math.sin(T * 0.3) * 0.06 * amp, 0);
    b.shR.rotation.set(0.62 + br * 0.01, 0, -0.22); b.elR.rotation.set(-0.35, 0, 0); b.shL.rotation.set(0.1, 0, 0.2); b.elL.rotation.set(-0.3, 0, 0);
    b.padR.rotation.set(0, 0, 0.12); b.padL.rotation.set(0, 0, -0.12);
    b.thL.rotation.set(-0.06, 0, 0.07); b.thR.rotation.set(0.1, 0, -0.07); b.knL.rotation.set(0.08, 0, 0); b.knR.rotation.set(0.12, 0, 0);
    K.runeMat.uniforms.time.value = T; if (K !== this.boss) K.sword.rotation.x = PI / 2;
  }
  // 地面倒影：把相机沿地面镜像，先渲染一遍到贴图
  renderReflection() {
    const c = this.camera, rc = this.refCam, r = this.renderer, C = this.castle;
    rc.projectionMatrix.copy(c.projectionMatrix); rc.projectionMatrixInverse.copy(c.projectionMatrixInverse);
    const f = this._v.set(0, 0, -1).applyQuaternion(c.quaternion).add(c.position), up = this._v2.set(0, 1, 0).applyQuaternion(c.quaternion);
    rc.position.set(c.position.x, -c.position.y, c.position.z); rc.up.set(up.x, -up.y, up.z); rc.lookAt(f.x, -f.y, f.z); rc.updateMatrixWorld();
    C.FU.uRefMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    const vv = this.vmRoot.visible; C.floor.visible = false; this.vmRoot.visible = false;
    const au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; r.setRenderTarget(C.refRT); r.render(this.scene, rc); r.setRenderTarget(null); r.shadowMap.autoUpdate = au;
    C.floor.visible = true; this.vmRoot.visible = vv;
  }
  render(dtMs) {
    this.renderReflection(); this.post.composer.render();
    this.frameAvg += (dtMs - this.frameAvg) * 0.03; this.frames++;
    if (this.frames > 150 && this.frameAvg > 26 && this.pixelRatio > 1) { this.pixelRatio = Math.max(1, this.pixelRatio - 0.25); this.frames = 0; this.frameAvg = 16; this.resize(this.W, this.H); }
  }
}
