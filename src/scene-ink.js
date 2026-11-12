// 水墨伪 3D 世界：所有东西都是 2D 贴图（画在 canvas 上）分层摆在透视空间里，
// 再用着色器做墨色洇染、飞白、宣纸纤维。低机位仰视 Boss「墨尊」。
import * as THREE from 'three';
import { dragPos, APPROACH } from './chart.js';
import { RAD } from './judge.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const SHIELD_DEPTH = 2.4, BOSS_Z = -10, BOSS_SCALE = 1.2;   // Boss 放大到顶出画面，压迫感更强
const INK = new THREE.Color(0.085, 0.085, 0.095), RED = new THREE.Color(0.76, 0.16, 0.10), WHITE = new THREE.Color(1, 1, 1), YELLOW = new THREE.Color(0.98, 0.76, 0.14), PAPER = new THREE.Color(0.925, 0.895, 0.83);
const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*noise(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return s; }`;
const BASE = { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide };
const UV_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const FS_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

// ───────── 贴图：全部用 canvas 画 ─────────
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; draw(g, w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }
const ink = a => `rgba(20,20,23,${a})`, pale = a => `rgba(232,224,204,${a})`, red = a => `rgba(190,44,28,${a})`;
function brush(g, pts, w0, w1, color) {   // 由粗到细的一笔
  g.strokeStyle = color;
  for (let i = 1; i < pts.length; i++) { const u = i / (pts.length - 1); g.lineWidth = w0 + (w1 - w0) * u; g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
}
function curve(p0, p1, p2, n = 16) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; o.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]); } return o; }

function makeTextures() {
  const T = {};
  T.body = tex(784, 784, (g, W, H) => {       // 长袍：肩窄摆宽，下摆化入留白
    const cx = W / 2, gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, ink(0.97)); gr.addColorStop(0.5, ink(0.93)); gr.addColorStop(0.8, ink(0.6)); gr.addColorStop(1, ink(0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx - 52, 34); g.quadraticCurveTo(cx - 150, 44, cx - 196, 118);
    g.bezierCurveTo(cx - 226, 330, cx - 300, 560, cx - 390, H); g.lineTo(cx + 390, H); g.bezierCurveTo(cx + 300, 560, cx + 226, 330, cx + 196, 118); g.quadraticCurveTo(cx + 150, 44, cx + 52, 34); g.closePath(); g.fill();
    brush(g, curve([cx - 56, 40], [cx - 10, 150], [cx + 34, 300]), 9, 4, pale(0.7)); brush(g, curve([cx + 56, 40], [cx + 30, 110], [cx - 4, 168]), 9, 5, pale(0.7));   // 交领
    brush(g, curve([cx - 40, 46], [cx - 2, 150], [cx + 46, 296]), 3, 2, ink(0.9));
    g.strokeStyle = red(0.95); g.lineWidth = 24; g.beginPath(); g.moveTo(cx - 212, 300); g.quadraticCurveTo(cx, 336, cx + 212, 300); g.stroke();                       // 朱腰带
    g.strokeStyle = 'rgba(120,20,12,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 212, 312); g.quadraticCurveTo(cx, 348, cx + 212, 312); g.stroke();
    brush(g, curve([cx + 26, 326], [cx + 50, 450], [cx + 24, 600]), 15, 3, red(0.9)); brush(g, curve([cx + 4, 328], [cx - 12, 430], [cx + 6, 540]), 12, 3, red(0.8));
    for (let i = 0; i < 13; i++) { const u = (i + 0.5) / 13 * 2 - 1, x0 = cx + u * 170, x1 = cx + u * 360; brush(g, curve([x0, 350 + Math.abs(u) * 14], [(x0 + x1) / 2 + u * 20, 560], [x1, H - 20]), 3 + (i % 3) * 2, 1, i % 2 ? 'rgba(150,146,138,0.32)' : 'rgba(0,0,0,0.5)'); }   // 衣褶
    for (const s of [-1, 1]) brush(g, curve([cx + s * 150, 70], [cx + s * 120, 180], [cx + s * 150, 290]), 4, 1, 'rgba(150,146,138,0.3)');
  });
  T.head = tex(560, 336, (g, W) => {         // 仰视的斗笠：看得见笠底，脸藏在阴影里
    const cx = W / 2;
    g.fillStyle = ink(0.96); g.beginPath(); g.moveTo(cx - 34, 300); g.quadraticCurveTo(cx - 60, 250, cx - 54, 200); g.lineTo(cx + 54, 200); g.quadraticCurveTo(cx + 60, 250, cx + 34, 300); g.quadraticCurveTo(cx, 322, cx - 34, 300); g.fill();
    g.fillStyle = 'rgba(64,62,60,0.95)'; g.beginPath(); g.moveTo(cx - 34, 252); g.quadraticCurveTo(cx, 300, cx + 34, 252); g.quadraticCurveTo(cx, 268, cx - 34, 252); g.fill();
    g.fillStyle = ink(0.98); g.beginPath(); g.moveTo(cx - 150, 150); g.quadraticCurveTo(cx - 70, 96, cx - 12, 46); g.quadraticCurveTo(cx, 38, cx + 12, 46); g.quadraticCurveTo(cx + 70, 96, cx + 150, 150); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(cx, 172, 262, 64, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.ellipse(cx, 190, 190, 40, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(170,164,150,0.34)'; g.lineWidth = 1.6;
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 90, 180 + Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * 258, 172 + Math.sin(a) * 62); g.stroke(); }
    g.strokeStyle = 'rgba(190,184,168,0.5)'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, 172, 260, 62, 0, 0.15, Math.PI - 0.15); g.stroke();
    for (const s of [-1, 1]) {                // 朱眼
      const ex = cx + s * 24, ey = 226, gl = g.createRadialGradient(ex, ey, 0, ex, ey, 34); gl.addColorStop(0, 'rgba(255,80,40,0.75)'); gl.addColorStop(1, 'rgba(255,60,30,0)'); g.fillStyle = gl; g.fillRect(ex - 34, ey - 34, 68, 68);
      g.fillStyle = 'rgba(255,210,170,1)'; g.beginPath(); g.moveTo(ex - s * 14, ey + 3); g.quadraticCurveTo(ex, ey - 7, ex + s * 15, ey - 5); g.quadraticCurveTo(ex, ey + 4, ex - s * 14, ey + 3); g.fill();
    }
  });
  T.sleeve = tex(336, 448, (g, W, H) => {    // 广袖：枢轴在上
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, ink(0.97)); gr.addColorStop(0.75, ink(0.92)); gr.addColorStop(1, ink(0.55));
    g.fillStyle = gr; g.beginPath(); g.moveTo(120, 8); g.quadraticCurveTo(168, -4, 216, 8); g.bezierCurveTo(250, 150, 300, 300, 326, 400); g.quadraticCurveTo(250, 446, 168, 430); g.quadraticCurveTo(70, 446, 10, 396); g.bezierCurveTo(50, 290, 90, 150, 120, 8); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(168, 408, 120, 22, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(206,198,180,0.95)'; g.beginPath(); g.moveTo(146, 404); g.quadraticCurveTo(140, 440, 160, 446); g.lineTo(182, 446); g.quadraticCurveTo(198, 436, 190, 404); g.closePath(); g.fill();
    for (let i = 0; i < 6; i++) { const u = i / 5; brush(g, curve([130 + u * 76, 30], [100 + u * 140, 220], [40 + u * 260, 400]), 3, 1, i % 2 ? 'rgba(150,146,138,0.3)' : 'rgba(0,0,0,0.5)'); }
    g.strokeStyle = red(0.9); g.lineWidth = 6; g.beginPath(); g.moveTo(22, 396); g.quadraticCurveTo(168, 438, 316, 398); g.stroke();
  });
  T.sword = tex(128, 1024, (g, W) => {       // 巨剑：剑柄在上，剑尖在下
    const cx = W / 2, gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, ink(0.98)); gr.addColorStop(0.5, 'rgba(52,52,56,0.98)'); gr.addColorStop(0.52, ink(0.98)); gr.addColorStop(1, ink(0.98));
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx - 22, 150); g.lineTo(cx - 20, 900); g.lineTo(cx, 1016); g.lineTo(cx + 20, 900); g.lineTo(cx + 22, 150); g.closePath(); g.fill();
    g.strokeStyle = pale(0.85); g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - 20, 156); g.lineTo(cx - 18, 900); g.lineTo(cx, 1012); g.stroke();
    g.strokeStyle = 'rgba(160,156,146,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, 170); g.lineTo(cx, 860); g.stroke();
    g.fillStyle = ink(1); g.beginPath(); g.moveTo(cx - 62, 128); g.quadraticCurveTo(cx, 104, cx + 62, 128); g.lineTo(cx + 50, 156); g.quadraticCurveTo(cx, 138, cx - 50, 156); g.closePath(); g.fill();
    g.fillRect(cx - 9, 40, 18, 90); g.fillStyle = red(0.95); for (let y = 52; y < 124; y += 14) g.fillRect(cx - 10, y, 20, 6);
    g.beginPath(); g.arc(cx, 30, 14, 0, 7); g.fill(); brush(g, curve([cx + 6, 22], [cx + 46, 30], [cx + 40, 96]), 7, 1.5, red(0.9));
  });
  T.cloak = tex(640, 512, (g, W, H) => {     // 身后的披风：淡墨
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(60,60,64,0.75)'); gr.addColorStop(0.6, 'rgba(70,70,74,0.5)'); gr.addColorStop(1, 'rgba(70,70,74,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(220, 10); g.lineTo(420, 10); g.bezierCurveTo(520, 160, 600, 340, 640, H); g.lineTo(0, H); g.bezierCurveTo(40, 340, 120, 160, 220, 10); g.fill();
    for (let i = 0; i < 16; i++) { const u = i / 15; brush(g, curve([240 + u * 160, 20], [160 + u * 320, 260], [20 + u * 600, H - 10]), 5, 1, 'rgba(20,20,24,0.3)'); }
  });
  T.ribbon = tex(64, 512, (g, W, H) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, ink(0.95)); gr.addColorStop(0.7, ink(0.8)); gr.addColorStop(1, ink(0)); g.fillStyle = gr; g.beginPath(); g.moveTo(20, 0); g.lineTo(44, 0); g.quadraticCurveTo(58, 260, 36, H); g.quadraticCurveTo(10, 260, 20, 0); g.fill(); });
  T.blob = tex(128, 128, (g, S) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
  T.yball = tex(128, 128, g => { g.fillStyle = 'rgba(250,196,40,0.96)'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.strokeStyle = 'rgba(214,150,6,1)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 57, 0, 7); g.stroke(); const gr = g.createRadialGradient(48, 44, 2, 64, 64, 60); gr.addColorStop(0, 'rgba(255,240,170,0.75)'); gr.addColorStop(0.6, 'rgba(255,240,170,0)'); g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 55, 0, 7); g.fill(); });
  T.orb = tex(160, 160, (g, S) => {          // 墨火：墨团裹着朱芯
    const c = S / 2;
    for (let i = 0; i < 26; i++) { const a = rnd(6.28), r = rnd(8, 34), rr = rnd(14, 30), x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, ink(0.85)); gr.addColorStop(0.7, ink(0.5)); gr.addColorStop(1, ink(0)); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    const gr = g.createRadialGradient(c, c, 0, c, c, 30); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.35, 'rgba(232,70,34,0.95)'); gr.addColorStop(1, 'rgba(190,40,24,0)'); g.fillStyle = gr; g.fillRect(c - 30, c - 30, 60, 60);
  });
  T.slash = tex(512, 96, (g, W, H) => {      // 一笔飞白（白色蒙版，颜色由材质决定）
    for (let i = 0; i < 90; i++) { const y = H / 2 + rnd(-1, 1) * rnd(0, 1) * H * 0.42, k = 1 - Math.abs(y - H / 2) / (H * 0.45), x0 = rnd(0, W * 0.3) * (1 - k), x1 = W - rnd(0, W * 0.45) * (1.2 - k); g.strokeStyle = `rgba(255,255,255,${rnd(0.25, 0.9)})`; g.lineWidth = rnd(1, 5); g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo(W / 2, y - (y - H / 2) * 0.5, x1, H / 2 + (y - H / 2) * 0.25); g.stroke(); }
  });
  T.splash = tex(256, 256, (g, S) => {       // 泼墨
    const c = S / 2; g.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) { const a = rnd(6.28), r = rnd(20, 118), s = rnd(1.5, 9) * (1 - r / 150); g.beginPath(); g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, s * rnd(1.2, 3), s, a, 0, 7); g.fill(); }
    for (let i = 0; i < 18; i++) { const a = rnd(6.28), r = rnd(50, 110); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = rnd(1, 4); g.beginPath(); g.moveTo(c + Math.cos(a) * 26, c + Math.sin(a) * 26); g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); g.stroke(); }
    const gr = g.createRadialGradient(c, c, 0, c, c, 44); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(c - 44, c - 44, 88, 88);
  });
  T.enso = tex(256, 256, (g, S) => { const c = S / 2; for (let i = 0; i < 150; i++) { const u = i / 150, a = u * 5.9 + 0.3; g.strokeStyle = `rgba(255,255,255,${0.35 + 0.6 * (1 - u)})`; g.lineWidth = 3 + 14 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.5); g.beginPath(); g.arc(c, c, 100, a, a + 0.06); g.stroke(); } });
  T.shield = tex(512, 512, (g, S) => {       // 八卦光盾：白底墨线
    const c = S / 2; g.translate(c, c);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, c); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.78)'); gr.addColorStop(0.93, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, c, 0, 7); g.fill();
    g.strokeStyle = ink(0.9); g.lineWidth = 9; g.beginPath(); g.arc(0, 0, c * 0.9, 0.2, 6.2); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, c * 0.5, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, c * 0.8, 0, 7); g.stroke();
    const tri = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * Math.PI / 4); g.fillStyle = ink(0.88); for (let k = 0; k < 3; k++) { const y = -c * (0.58 + k * 0.065); if (tri[i][k]) g.fillRect(-34, y, 68, 9); else { g.fillRect(-34, y, 28, 9); g.fillRect(6, y, 28, 9); } } g.restore(); }
    g.fillStyle = ink(0.85); g.beginPath(); g.arc(0, 0, c * 0.3, -Math.PI / 2, Math.PI / 2); g.arc(0, c * 0.15, c * 0.15, Math.PI / 2, -Math.PI / 2, true); g.arc(0, -c * 0.15, c * 0.15, Math.PI / 2, -Math.PI / 2); g.fill();
    g.strokeStyle = ink(0.85); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, c * 0.3, 0, 7); g.stroke(); g.beginPath(); g.arc(0, -c * 0.15, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, c * 0.15, 9, 0, 7); g.fill();
  });
  T.pine = tex(1024, 512, (g) => {           // 前景松枝
    const main = curve([0, 60], [420, 60], [900, 300], 40); brush(g, main, 30, 5, ink(0.95)); brush(g, curve([330, 96], [520, 250], [700, 420], 24), 14, 3, ink(0.92)); brush(g, curve([560, 150], [720, 120], [960, 150], 20), 10, 2, ink(0.9));
    for (let i = 0; i < 60; i++) { const p = main[(Math.random() * main.length) | 0]; g.fillStyle = 'rgba(232,224,204,0.25)'; g.beginPath(); g.arc(p[0] + rnd(-8, 8), p[1] + rnd(-8, 8), rnd(2, 5), 0, 7); g.fill(); }
    const tuft = (x, y, r, rot) => { for (let i = 0; i < 26; i++) { const a = rot - Math.PI / 2 + (i / 25 - 0.5) * 2.5; g.strokeStyle = ink(rnd(0.55, 0.95)); g.lineWidth = rnd(1.2, 2.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * rnd(0.7, 1), y + Math.sin(a) * r * rnd(0.7, 1)); g.stroke(); } };
    for (const [x, y, r, rot] of [[250, 66, 80, 0], [420, 96, 86, 0.2], [600, 150, 80, 0.3], [760, 232, 74, 0.5], [890, 300, 66, 0.6], [500, 250, 70, 0.5], [640, 372, 66, 0.6], [710, 430, 56, 0.9], [700, 124, 66, -0.1], [850, 136, 66, 0], [960, 152, 56, 0.1], [130, 60, 70, -0.1]]) tuft(x, y, r, rot);
  });
  T.reed = tex(512, 512, (g, W, H) => { for (let i = 0; i < 16; i++) { const x = rnd(40, 470), h = rnd(180, 480), lean = rnd(-140, 140); brush(g, curve([x, H], [x + lean * 0.2, H - h * 0.6], [x + lean, H - h], 20), rnd(5, 9), 0.8, ink(rnd(0.5, 0.95))); } });
  T.psword = tex(128, 768, (g, W) => {       // 玩家的剑：剑尖在上，剑柄在下
    const cx = W / 2, gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0.3, 'rgba(250,250,246,1)'); gr.addColorStop(0.5, 'rgba(190,196,204,1)'); gr.addColorStop(0.52, 'rgba(244,244,240,1)'); gr.addColorStop(0.7, 'rgba(214,216,220,1)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx - 17, 610); g.lineTo(cx - 15, 80); g.lineTo(cx, 8); g.lineTo(cx + 15, 80); g.lineTo(cx + 17, 610); g.closePath(); g.fill();
    g.strokeStyle = ink(0.95); g.lineWidth = 4; g.stroke(); g.lineWidth = 2; g.strokeStyle = ink(0.5); g.beginPath(); g.moveTo(cx, 90); g.lineTo(cx, 600); g.stroke();
    g.fillStyle = ink(1); g.beginPath(); g.moveTo(cx - 54, 606); g.quadraticCurveTo(cx, 590, cx + 54, 606); g.lineTo(cx + 44, 634); g.quadraticCurveTo(cx, 622, cx - 44, 634); g.closePath(); g.fill();
    g.fillRect(cx - 9, 630, 18, 110); g.fillStyle = red(0.95); for (let y = 640; y < 730; y += 15) g.fillRect(cx - 10, y, 20, 7); g.beginPath(); g.arc(cx, 748, 14, 0, 7); g.fill();
  });
  return T;
}

// ───────── 材质 ─────────
function inkMat(map, { sway = 0, swayLen = 1, seed = rnd(50), opacity = 1 } = {}) {
  const m = new THREE.ShaderMaterial({ ...BASE,
    uniforms: { map: { value: map }, time: { value: 0 }, opacity: { value: opacity }, seed: { value: seed }, sway: { value: sway }, swayLen: { value: swayLen }, flash: { value: 0 }, flashCol: { value: PAPER.clone() } },
    vertexShader: `uniform float time,sway,swayLen,seed; varying vec2 vUv;
      void main(){ vUv=uv; vec3 p=position; float w=pow(clamp(-p.y/swayLen,0.,1.),1.4); p.x+=(sin(time*1.3+p.y*0.9+seed)+0.5*sin(time*2.1+p.y*1.7+seed*2.))*sway*w; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity,seed,flash; uniform vec3 flashCol; varying vec2 vUv; ${NOISE}
      void main(){ vec2 uv=vUv+(vec2(noise(vUv*vec2(16.,22.)+seed),noise(vUv*vec2(22.,16.)+seed+7.))-.5)*0.014;   // 边缘洇开
        vec4 t=texture2D(map,uv);
        float streak=noise(vec2(vUv.x*150.+seed,vUv.y*5.))*0.6+noise(vUv*vec2(40.,60.)+seed)*0.4;                    // 飞白
        float a=t.a*mix(smoothstep(0.1,0.62,t.a+(streak-.5)*0.7),1.,smoothstep(0.45,0.92,t.a));
        vec3 c=t.rgb*(0.9+0.2*noise(vUv*9.+seed));
        gl_FragColor=vec4(mix(c,flashCol,flash), a*opacity); }` });
  m.base = opacity; return m;
}
function fxMat(map, color, tint = 1, opacity = 1) {
  return new THREE.ShaderMaterial({ ...BASE, uniforms: { map: { value: map }, color: { value: color.clone() }, tint: { value: tint }, opacity: { value: opacity } }, vertexShader: UV_VS,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float tint,opacity; varying vec2 vUv; void main(){ vec4 t=texture2D(map,vUv); gl_FragColor=vec4(mix(t.rgb,color,tint), t.a*opacity); }` });
}
function strokeMat(edge, core) {   // 剑气 / 刀光：墨边白芯，带飞白
  return new THREE.ShaderMaterial({ ...BASE, uniforms: { time: { value: 0 }, opacity: { value: 1 }, edge: { value: edge.clone() }, core: { value: core.clone() }, seed: { value: rnd(50) }, dry: { value: 0.5 } }, vertexShader: UV_VS,
    fragmentShader: `uniform float time,opacity,seed,dry; uniform vec3 edge,core; varying vec2 vUv; ${NOISE}
      void main(){ float v=abs(vUv.y-.5)*2.; float n=noise(vec2(vUv.x*26.-time*5.,vUv.y*6.+seed));
        float taper=smoothstep(0.,0.14,vUv.x)*smoothstep(1.,0.93,vUv.x);
        float body=smoothstep(1.,0.62+0.3*n,v/max(taper,0.001));
        float streak=noise(vec2(vUv.x*5.-time*2.,vUv.y*46.+seed));
        float a=body*mix(1.,smoothstep(0.25,0.6,streak+(1.-v)*0.5),dry*(1.-0.6*vUv.x));
        vec3 c=mix(edge,core,smoothstep(0.78,0.5,v));
        gl_FragColor=vec4(c,a*opacity); }` });
}

class Particles {   // 墨点 / 朱点 / 白芒
  constructor(n) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.size0 = new Float32Array(n);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({ ...BASE, uniforms: { uScale: { value: 500 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize,aAlpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*uScale/max(0.05,-mv.z); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5)*2.; gl_FragColor=vec4(vC, smoothstep(1.,0.55,d)*vA); }` });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 34;
  }
  emit(p, vx, vy, vz, c, size, life, grav = 0, drag = 0) {
    const i = this.i, j = i * 3; this.i = (i + 1) % this.n;
    this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz; this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b;
    this.size0[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }
  burst(p, n, speed, c, size, life, grav = 0, drag = 2, bias = null) {
    for (let k = 0; k < n; k++) { const u = rnd(-1, 1), a = rnd(6.28), s = Math.sqrt(1 - u * u), sp = speed * rnd(0.25, 1); this.emit(p, s * Math.cos(a) * sp + (bias ? bias.x : 0), u * sp + (bias ? bias.y : 0), s * Math.sin(a) * sp + (bias ? bias.z : 0), c, size * rnd(0.4, 1.3), life * rnd(0.5, 1), grav, drag); }
  }
  update(dt) {
    const { pos, vel, life, max, n } = this;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) { if (this.size[i] !== 0) { this.size[i] = 0; this.alpha[i] = 0; } continue; }
      life[i] -= dt; const k = Math.max(0, 1 - this.drag[i] * dt), j = i * 3;
      vel[j] *= k; vel[j + 1] = vel[j + 1] * k - this.grav[i] * dt; vel[j + 2] *= k; pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      const f = Math.max(0, life[i] / max[i]); this.alpha[i] = Math.min(1, f * 2.5); this.size[i] = this.size0[i] * (0.5 + 0.5 * f);
    }
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setClearColor(0xece4d4, 1);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 800); this.scene.add(this.camera);
    this.camBase = V3(0, 0.8, 9); this.camLook = V3(0, 8.4, BOSS_Z);
    this.T = makeTextures(); this.mats = [];
    this.time = 0; this.shake = 0; this.punch = 0; this.mode = 'title'; this.mood = 0; this.moodTarget = 0; this.bossOpacity = 1;
    this.w = { cast: 0, raise: 0, down: 0, beam: 0, flare: 0 }; this.recoil = 0; this.stagger = 0; this.hitFlash = 0; this.deathT = -1; this.escapeT = -1; this.burstDone = false; this.knock = 0;
    this.vm = { swing: 0, dir: 1, thrust: 0, charge: 0, aimX: 0, aimY: 0, hide: 0, block: 0, bx: 0, by: 0 };
    this.objs = new Map(); this.shields = new Map(); this.flashes = []; this.trails = []; this.charging = new Set();
    this._v = V3(); this._v2 = V3(); this._v3 = V3(); this._x = V3(); this._y = V3(); this._z = V3(); this._m = new THREE.Matrix4(); this._p = {}; this._seen = new Set();
    this.buildBackdrop(); this.buildBoss(); this.buildFront(); this.buildFx();
    this.frameAvg = 16; this.frames = 0;
  }
  ink(map, o) { const m = inkMat(map, o); this.mats.push(m); return m; }
  // pivot: 0 居中；1 枢轴在上（向下垂）；-1 枢轴在下
  plane(w, h, mat, order, parent, segs = 1, pivot = 0) {
    const g = new THREE.PlaneGeometry(w, h, segs > 1 ? 4 : 1, segs); if (pivot) g.translate(0, -pivot * h / 2, 0);
    const m = new THREE.Mesh(g, mat); m.renderOrder = order; m.frustumCulled = false; (parent || this.scene).add(m); return m;
  }

  buildBackdrop() {
    const S = this.scene;
    // 宣纸底 + 天色（暴走时乌云压顶）
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { mood: { value: 0 }, time: { value: 0 }, aspect: { value: 1.33 } }, vertexShader: FS_VS,
      fragmentShader: `varying vec2 vUv; uniform float mood,time,aspect; ${NOISE}
        void main(){ vec2 p=vUv*vec2(aspect,1.); vec3 c=vec3(0.925,0.895,0.83);
          c*=0.93+0.12*fbm(p*1.5+3.);
          float sky=smoothstep(0.3,1.1,vUv.y+(fbm(p*2.1+vec2(time*0.015,0.))-.5)*0.6); c=mix(c,vec3(0.60,0.60,0.59),sky*0.26);
          float cl=fbm(p*vec2(1.6,3.2)+vec2(time*0.05,1.7));
          c=mix(c,vec3(0.17,0.15,0.15),mood*smoothstep(0.3,0.95,vUv.y)*smoothstep(0.34,0.72,cl)*0.78);
          c=mix(c,c*vec3(1.0,0.90,0.86),mood*0.7);
          gl_FragColor=vec4(c,1.); }` }));
    bg.frustumCulled = false; bg.renderOrder = 0; S.add(bg); this.bgMat = bg.material;
    // 朱日
    this.sunMat = new THREE.ShaderMaterial({ ...BASE, uniforms: { mood: { value: 0 } }, vertexShader: UV_VS,
      fragmentShader: `varying vec2 vUv; uniform float mood; ${NOISE}
        void main(){ vec2 p=vUv-.5; float r=length(p)*2.; float n=fbm(p*5.+2.);
          float a=smoothstep(0.9,0.82+0.05*n,r)*(0.78+0.22*fbm(p*14.));
          vec3 c=mix(vec3(0.80,0.20,0.12),vec3(0.62,0.08,0.06),mood)*(0.92+0.16*n);
          gl_FragColor=vec4(c,a*0.9); }` });
    this.sun = this.plane(34, 34, this.sunMat, 2); this.sun.position.set(4, 66, -66);
    // 远山三层：着色器直接画山脊与皴
    this.mtMats = [];
    const mt = (z, w, h, inkA, seed, side, freq, order) => {
      const m = new THREE.ShaderMaterial({ ...BASE, uniforms: { seed: { value: seed }, ink: { value: inkA }, side: { value: side }, freq: { value: freq }, mood: { value: 0 } }, vertexShader: UV_VS,
        fragmentShader: `varying vec2 vUv; uniform float seed,ink,side,freq,mood; ${NOISE}
          void main(){ float x=vUv.x*freq+seed;
            float pk=1.-abs(noise(vec2(x,seed))*2.-1.); float ridge=0.16+0.5*pk*pk+0.2*noise(vec2(x*2.7,seed+3.))+0.06*noise(vec2(x*9.,seed+9.));
            ridge*=mix(1.,smoothstep(0.02,0.42,abs(vUv.x-.5)),side);
            float d=ridge-vUv.y; float edge=smoothstep(0.,0.01,d);
            float tx=fbm(vec2(vUv.x*freq*14.+seed,vUv.y*9.-x));                                    // 皴
            float fold=smoothstep(0.55,0.75,noise(vec2(vUv.x*freq*5.+vUv.y*3.,vUv.y*1.5+seed)));   // 山脊暗纹
            float a=ink*(0.16+0.84*exp(-d*7.))*(0.7+0.6*tx)+ink*fold*0.35*exp(-d*3.);
            a*=edge*smoothstep(0.,0.22,vUv.y);
            gl_FragColor=vec4(mix(vec3(0.10,0.10,0.115),vec3(0.16,0.08,0.08),mood*0.6),clamp(a,0.,1.)); }` });
      this.mtMats.push(m); this.plane(w, h, m, order).position.set(0, h / 2 - 2, z);
    };
    mt(-260, 900, 110, 0.2, 3.1, 0.0, 2.6, 3); mt(-150, 560, 80, 0.36, 11.7, 0.75, 2.2, 4); mt(-80, 300, 56, 0.6, 27.3, 1.0, 1.7, 5);
    // 水面：涟漪、Boss 的倒影
    this.groundMat = new THREE.ShaderMaterial({ ...BASE, uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vW; uniform float time; ${NOISE}
        void main(){ float fade=smoothstep(130.,8.,9.-vW.z);
          float rip=smoothstep(0.56,0.66,fbm(vec2(vW.x*0.13+time*0.03,vW.z*1.5+time*0.12)));
          vec2 q=vec2(vW.x,(vW.z+10.)*2.2); float sh=exp(-dot(q,q)/70.);
          float refl=exp(-vW.x*vW.x/30.)*smoothstep(-9.,6.,vW.z)*smoothstep(9.,-4.,vW.z)*(0.22+0.2*noise(vec2(vW.x*0.8,vW.z*6.+time*0.4)));
          gl_FragColor=vec4(vec3(0.10,0.10,0.115),clamp((0.07+rip*0.2)*fade+sh*0.62+refl,0.,0.9)); }` });
    const gp = this.plane(500, 300, this.groundMat, 6); gp.rotation.x = -Math.PI / 2; gp.position.set(0, 0, -120);
  }

  buildBoss() {
    const T = this.T, boss = this.boss = new THREE.Group(); boss.position.set(0, 0, BOSS_Z); boss.rotation.x = 0.15; boss.scale.setScalar(BOSS_SCALE); this.scene.add(boss);   // 上身前倾：压过来的感觉
    const body = this.body = new THREE.Group(); boss.add(body);
    this.bossMats = [];
    const im = (map, o) => { const m = this.ink(map, o); this.bossMats.push(m); return m; };
    this.fan = [];                                                               // 身后剑阵
    for (let i = 0; i < 11; i++) { const m = this.ink(T.sword, { opacity: 0 }), p = this.plane(1.5, 12, m, 10, body, 1, 1); p.position.set(0, 10.6, -0.4); this.fan.push({ p, a: (i - 5) / 5, m, rage: i % 2 === 1 }); }
    this.cloak = this.plane(17, 13.5, im(T.cloak, { sway: 0.5, swayLen: 13 }), 11, body, 12, 1); this.cloak.position.set(0, 13, -0.3);
    this.robe = this.plane(14, 14, im(T.body), 13, body, 1, -1);
    this.arms = {};
    for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(s * 3.0, 12.5, 0.1); body.add(g); this.plane(5.4, 7.2, im(T.sleeve, { sway: 0.16, swayLen: 7 }), 14, g, 8, 1).scale.x = s; this.arms[s] = { g }; }
    const sw = this.bossSword = new THREE.Group(); sw.position.set(0, -6.9, 0.05); this.arms[1].g.add(sw);
    this.plane(1.6, 10.8, im(T.sword), 15, sw, 1, 1).position.y = 1.0;
    this.head = this.plane(10, 6, im(T.head), 16, body); this.head.position.set(0, 14.35, 0.2);
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) this.plane(0.8, 6.5 - k * 1.6, im(T.ribbon, { sway: 0.5 + k * 0.2, swayLen: 6 }), 17, body, 10, 1).position.set(s * (3.7 - k * 0.9), 14.2 - k * 0.1, 0.25);
    this.mist = [];                                                              // 雾：用纸色「留白」
    for (let i = 0; i < 16; i++) {
      const near = i < 9, p = this.plane(rnd(9, 16), rnd(2.4, 4.4), fxMat(T.blob, PAPER, 1, near ? rnd(0.55, 0.9) : rnd(0.3, 0.55)), near ? 18 : 7);
      p.position.set(rnd(-16, 16), near ? rnd(0.2, 2.2) : rnd(1, 7), near ? BOSS_Z + rnd(0.5, 3) : rnd(-60, -24)); p.userData = { x: p.position.x, sp: rnd(0.15, 0.5) * (Math.random() < 0.5 ? -1 : 1), ph: rnd(6) }; this.mist.push(p);
    }
  }

  buildFront() {
    const T = this.T, cam = this.camera;
    this.pine = this.plane(1.5, 0.75, this.ink(T.pine), 40, cam); this.reedL = this.plane(0.8, 0.8, this.ink(T.reed, { opacity: 0.85 }), 40, cam); this.reedR = this.plane(0.7, 0.7, this.ink(T.reed, { opacity: 0.8 }), 40, cam); this.reedR.scale.x = -1;
    this.sword = this.plane(0.16, 0.95, fxMat(T.psword, WHITE, 0, 1), 46, cam, 1, -1);           // 第一人称的剑
    this.aura = this.plane(1, 1, fxMat(T.enso, RED, 1, 0), 45, cam);
    // 宣纸纤维：最后整屏相乘，让一切都像画在纸上
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...BASE, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      uniforms: { aspect: { value: 1.33 }, flash: { value: 0 } }, vertexShader: FS_VS,
      fragmentShader: `varying vec2 vUv; uniform float aspect,flash; ${NOISE}
        void main(){ vec2 p=vUv*vec2(aspect,1.);
          float fib=noise(p*vec2(520.,70.))*noise(p*vec2(60.,480.)); float gr=noise(p*900.);
          vec3 c=vec3(1.)-0.075*gr-0.10*fib; c*=0.985+0.03*noise(p*6.);
          vec2 q=vUv-.5; c*=mix(vec3(1.),vec3(0.80,0.75,0.66),smoothstep(0.25,0.95,dot(q,q)*2.2));
          gl_FragColor=vec4(mix(c,vec3(1.7),flash),1.); }` }));
    m.frustumCulled = false; m.renderOrder = 100; this.scene.add(m); this.paperMat = m.material;
  }

  buildFx() {
    this.parts = new Particles(1800); this.scene.add(this.parts.mesh);
    this.unit = new THREE.PlaneGeometry(1, 1);
    this.gswordGeo = new THREE.PlaneGeometry(1.5, 11); this.gswordGeo.translate(0, 5.5, 0);   // 剑尖在原点，剑身沿 +Y
    this.beamGeo = new THREE.PlaneGeometry(1, 1); this.beamGeo.translate(0.5, 0, 0);          // 沿 +X
  }
  // 预热：让所有着色器先编译，避免游戏中途卡顿
  warmup() {
    const tmp = [new THREE.Mesh(this.unit, strokeMat(INK, WHITE)), new THREE.Mesh(this.unit, fxMat(this.T.blob, INK))];
    tmp.forEach(o => { o.scale.setScalar(0.001); o.position.set(0, 3, 0); this.scene.add(o); });
    const m = this.mode; this.mode = 'play'; this.update(0.016, 0); this.renderer.render(this.scene, this.camera); this.mode = m; tmp.forEach(o => this.scene.remove(o));
  }
  resize(w, h) {
    this.W = w; this.H = h; this.renderer.setPixelRatio(this.pixelRatio); this.renderer.setSize(w, h, false);
    const a = w / h; this.camera.aspect = a; this.camera.fov = a < 1.5 ? 60 : 54; this.camera.updateProjectionMatrix();
    this.parts.mat.uniforms.uScale.value = h * this.pixelRatio / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    this.bgMat.uniforms.aspect.value = a; this.paperMat.uniforms.aspect.value = a;
    const hh = this.hh = 2 * Math.tan(this.camera.fov * Math.PI / 360), hw = this.hw = hh * a;   // 相机前 2 个单位处的半高 / 半宽
    this.pine.position.set(-hw + 0.62, hh - 0.3, -2); this.reedL.position.set(-hw + 0.3, -hh + 0.36, -2); this.reedR.position.set(hw - 0.26, -hh + 0.32, -2);
  }

  // ── 坐标换算 ──
  screenToWorld(nx, ny, depth, out = V3()) { out.set(nx * 2 - 1, 1 - ny * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize(); return out.multiplyScalar(depth).add(this.camera.position); }
  rayToBoss(nx, ny, out = V3()) { out.set(nx * 2 - 1, 1 - ny * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize(); const k = (BOSS_Z + 1.2 - this.camera.position.z) / out.z; return out.multiplyScalar(k).add(this.camera.position); }
  handPos(out) { return this.arms[-1].g.localToWorld(out.set(0, -7.1, 0.1)); }
  eyePos(out) { return this.head.localToWorld(out.set(0, -0.95, 0.1)); }
  chestPos(out) { return this.body.localToWorld(out.set(0, 9.5, 0.4)); }
  // 让平面的 Y 轴沿 dir，同时尽量面向相机（有透视纵深的「立牌」）
  orientY(mesh, pos, dir) {
    const y = this._y.copy(dir).normalize(), z = this._z.subVectors(this.camera.position, pos).normalize(), x = this._x.crossVectors(y, z).normalize(); z.crossVectors(x, y);
    mesh.quaternion.setFromRotationMatrix(this._m.makeBasis(x, y, z)); mesh.position.copy(pos);
  }
  orientX(mesh, a, b, width) {
    const d = this._v3.subVectors(b, a), len = d.length(), x = this._x.copy(d).normalize(), z = this._z.subVectors(this.camera.position, a).normalize(), y = this._y.crossVectors(z, x).normalize(); z.crossVectors(x, y);
    mesh.quaternion.setFromRotationMatrix(this._m.makeBasis(x, y, z)); mesh.position.copy(a); mesh.scale.set(len, width, 1);
  }

  // ── 特效基元 ──
  flash(map, pos, color, s0, s1, dur, rot = 0, order = 30, sx = 1) {
    const m = new THREE.Mesh(this.unit, fxMat(map, color, 1, 1)); m.position.copy(pos); m.renderOrder = order; m.frustumCulled = false; m.scale.setScalar(0.001); this.scene.add(m);
    this.flashes.push({ m, t: 0, dur, s0, s1, rot, sx }); return m;
  }
  inkSplat(p, n, speed, bias) { this.parts.burst(p, n, speed, INK, 0.16, 0.7, 9, 1.2, bias); }
  addShake(v) { this.shake = Math.min(1, this.shake + v); }

  // ── 判定事件 → 动作与特效 ──
  touchHit(n) {
    const o = this.objs.get(n.id), p = o ? o.g.position.clone() : this.screenToWorld(n.x, n.y, SHIELD_DEPTH), rot = rnd(-0.8, 0.8) + (n.x < 0.5 ? 0 : Math.PI);
    this.flash(this.T.slash, p, INK, 1.0, 2.0, 0.24, rot, 31, 0.16); this.flash(this.T.slash, p, WHITE, 0.9, 1.8, 0.18, rot, 32, 0.07);
    this.flash(this.T.splash, p, INK, 0.3, 1.0, 0.3, rnd(6), 30);
    this.inkSplat(p, 8, 3.2); this.parts.burst(p, 12, 4, YELLOW, 0.11, 0.45, 4, 2);
    this.vm.swing = 1; this.vm.dir = n.x < 0.5 ? 1 : -1; this.vm.aimX = n.x * 2 - 1; this.vm.aimY = n.y * 2 - 1; this.addShake(0.05);
  }
  holdHead(n) {
    const p = this.screenToWorld(n.x, n.y, SHIELD_DEPTH - 0.2);
    this.flash(this.T.enso, p, INK, 0.5, 2.0, 0.34, rnd(6), 31); this.flash(this.T.splash, p, WHITE, 0.4, 1.5, 0.25, rnd(6), 32);
    this.inkSplat(p, 22, 5); this.parts.burst(p, 10, 5, WHITE, 0.08, 0.4, 3, 2); this.addShake(0.3);
  }
  tapHit(n, grade) {
    const hit = this.rayToBoss(n.x, n.y), big = n.finisher ? 2.2 : 1, rot = rnd(-0.5, 0.5) + (Math.random() < 0.5 ? 0.9 : -0.9);
    const from = this.screenToWorld(0.5 + (n.x - 0.5) * 0.6 + 0.06, 0.95, 1.2);
    this.addTrail([from, from.clone().lerp(hit, 0.5), hit], 0.09, 0.14 * big, 0.5 * big, RED, WHITE, 0.25);
    this.flash(this.T.slash, hit, RED, 3.5 * big, 6.5 * big, 0.42, rot, 31, 0.13); this.flash(this.T.slash, hit, WHITE, 3 * big, 5.5 * big, 0.2, rot, 32, 0.05);
    this.flash(this.T.splash, hit, grade === 0 ? RED : INK, 1.5, 5 * big, 0.38, rnd(6), 30);
    this.parts.burst(hit, grade === 0 ? 22 : 14, 8, RED, 0.3, 0.7, 12, 1.2, V3(0, 2, 4)); this.inkSplat(hit, 10, 7, V3(0, 2, 4));
    this.recoil = Math.min(1.4, this.recoil + 0.55 * big); this.hitFlash = 1; this.vm.thrust = 1; this.vm.aimX = n.x * 2 - 1; this.vm.aimY = n.y * 2 - 1; this.addShake(0.1 * big); this.punch = Math.max(this.punch, 0.5);
    if (n.finisher) this.paperMat.uniforms.flash.value = 0.5;
  }
  chargeStart(n) { this.charging.add(n); }
  chargeEnd(n) { this.charging.delete(n); }
  // 蓄力剑气：一笔墨痕严格沿音符既定的方向划出去（屏幕上是一条直线，同时向 Boss 所在的纵深推过去）。
  // 甩出的同一瞬间 Boss 就受击，不等剑光飞到。
  flickRelease(n) {
    this.charging.delete(n);
    const A = this.camera.aspect, at = (k, depth) => this.screenToWorld(n.x + n.dir.x * k / A, n.y + n.dir.y * k, depth);
    const far = this.rayToBoss(n.x + n.dir.x * 0.62 / A, n.y + n.dir.y * 0.62), d1 = far.distanceTo(this.camera.position);
    const pts = [at(-0.1, 1.5), at(0, 1.5), at(0.2, 1 / (0.67 / 1.5 + 0.33 / d1)), at(0.42, 1 / (0.33 / 1.5 + 0.67 / d1)), far];
    this.addTrail(pts, 0.11, 0.42, 1.6, PAPER, INK, 1.4);
    this.waveImpact(this.chestPos(V3()).add(V3((n.x - 0.5) * 3, rnd(-1, 1.5), 0.8)), n);
    this.vm.swing = 1; this.vm.dir = n.dir.x >= 0 ? -1 : 1; this.vm.aimX = n.x * 2 - 1; this.vm.hide = 0.32; this.addShake(0.14);
    this.flash(this.T.splash, pts[1], INK, 0.3, 1.3, 0.25, rnd(6), 33);
  }
  waveImpact(p, n) {
    const rot = Math.atan2(-n.dir.y, n.dir.x);
    this.flash(this.T.slash, p, PAPER, 9, 14, 1.4, rot, 31, 0.1);   // 留在 Boss 身上的一道剑痕（黑袍上用留白来画）
    this.flash(this.T.splash, p, INK, 2, 7, 0.45, rnd(6), 30);
    this.parts.burst(p, 44, 12, INK, 0.4, 1.0, 12, 1.0, V3(0, 3, 3)); this.parts.burst(p, 14, 10, RED, 0.3, 0.9, 10, 1.0, V3(0, 3, 3));
    this.stagger = 1; this.recoil = 1.4; this.hitFlash = 1; this.addShake(0.45); this.punch = 1; this.paperMat.uniforms.flash.value = Math.max(this.paperMat.uniforms.flash.value, 0.22);
  }
  // 刀光尾迹：沿曲线的带状网格。头部用 dur 秒飞到终点，之后尾巴慢慢收干、淡出
  addTrail(pts, dur, w0, w1, edge, core, linger, opacity = 1) {
    const N = 40, samples = new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(N - 1);
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 6), uv = new Float32Array(N * 4), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 3] = 1; if (i < N - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, strokeMat(edge, core)); mesh.frustumCulled = false; mesh.renderOrder = 44; this.scene.add(mesh);
    const tr = { mesh, geo, pos, samples, N, t: 0, dur, w0, w1, linger, opacity, hit: false, onHit: null }; this.trails.push(tr); this.updateTrail(tr, 0); return tr;
  }
  updateTrail(tr, dt) {
    tr.t += dt; const u = Math.min(1, tr.t / tr.dur), head = Math.max(0.02, u * u * (3 - 2 * u)), after = Math.max(0, (tr.t - tr.dur) / tr.linger), N = tr.N, cam = this.camera.position;
    if (u >= 1 && !tr.hit) { tr.hit = true; if (tr.onHit) tr.onHit(); }
    if (after >= 1) return false;
    const tail = after * after * 0.35;
    for (let i = 0; i < N; i++) {
      const f = tail + (head - tail) * (i / (N - 1)), fi = f * (N - 1), i0 = Math.min(N - 2, Math.floor(fi)), a = tr.samples[i0], b = tr.samples[i0 + 1];
      const p = this._v.lerpVectors(a, b, fi - i0), tan = this._v2.subVectors(b, a).normalize(), side = this._v3.subVectors(cam, p).cross(tan).normalize();
      const w = (tr.w0 + (tr.w1 - tr.w0) * f) * (1 - after * 0.6) * 0.5, j = i * 6;
      tr.pos[j] = p.x + side.x * w; tr.pos[j + 1] = p.y + side.y * w; tr.pos[j + 2] = p.z + side.z * w; tr.pos[j + 3] = p.x - side.x * w; tr.pos[j + 4] = p.y - side.y * w; tr.pos[j + 5] = p.z - side.z * w;
    }
    tr.geo.attributes.position.needsUpdate = true; const un = tr.mesh.material.uniforms; un.opacity.value = tr.opacity * (1 - after); un.time.value = this.time; un.dry.value = 0.5 + 0.5 * after;
    if (!tr.hit && Math.random() < 0.8) this.parts.emit(tr.samples[Math.min(N - 1, Math.round(head * (N - 1)))], rnd(-1.5, 1.5), rnd(-1.5, 1.5), rnd(-1, 1), Math.random() < 0.5 ? INK : RED, 0.12, 0.45, 3, 1);
    return true;
  }
  // 八卦 HOLD 结束：阵炸开，水墨向四周散去，Boss 被震倒
  baguaBurst() {
    const p = this.chestPos(V3()); p.z += 1.5;
    this.flash(this.T.shield, p, WHITE, 15, 30, 0.5, rnd(6), 29); this.flash(this.T.splash, p, INK, 6, 44, 1.1, rnd(6), 30); this.flash(this.T.splash, p, INK, 4, 30, 0.8, rnd(6), 30);
    for (let i = 0; i < 3; i++) this.flash(this.T.enso, p, INK, 4 + i * 2, 30 + i * 9, 0.7 + i * 0.25, rnd(6), 30);
    for (let k = 0; k < 180; k++) { const a = rnd(6.28), sp = rnd(8, 22); this.parts.emit(p, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + 2, rnd(-2, 5), Math.random() < 0.85 ? INK : RED, rnd(0.2, 0.6), rnd(0.8, 1.8), 5, 0.9); }
    this.knock = 1; this.stagger = 1; this.hitFlash = 1; this.addShake(0.9); this.punch = 1; this.paperMat.uniforms.flash.value = 0.4;
  }
  hurt() { this.addShake(0.55); }
  enrage() { this.moodTarget = 1; this.w.flare = 1.8; this.addShake(0.8); const p = this.chestPos(V3()); for (let i = 0; i < 3; i++) this.flash(this.T.enso, p, INK, 3, 34 + i * 10, 0.9 + i * 0.25, rnd(6), 9); this.flash(this.T.splash, p, INK, 4, 26, 0.9, rnd(6), 9); this.parts.burst(p, 90, 13, INK, 0.4, 1.5, 4, 0.8); }
  death() { this.deathT = 0; }
  escape() { this.escapeT = 0; }
  reset() {
    for (const o of this.objs.values()) this.scene.remove(o.g); this.objs.clear();
    for (const s of this.shields.values()) this.scene.remove(s.m); this.shields.clear();
    for (const t of this.trails) { this.scene.remove(t.mesh); t.geo.dispose(); } this.trails.length = 0;
    this.charging.clear(); this.deathT = -1; this.escapeT = -1; this.burstDone = false; this.boss.visible = true; this.boss.scale.setScalar(BOSS_SCALE); this.bossOpacity = 1;
    this.moodTarget = 0; this.recoil = 0; this.stagger = 0; this.w.flare = 0; this.knock = 0;
  }

  // ── 把谱面音符同步成场景里的东西（墨火 / 巨剑 / 剑气柱 / 光盾） ──
  syncNotes(notes, first, t, dt) {
    const tw = { cast: 0, raise: 0, down: 0, beam: 0 }, seen = this._seen, p = this._p, cam = this.camera; seen.clear(); let blockN = null;
    for (let i = first; i < notes.length; i++) {
      const n = notes[i]; if (n.t - APPROACH - 0.75 > t) break;
      if (n.s.done) continue;
      if (n.kind === 'touch') {
        if (t >= n.t - APPROACH - 0.12 && t <= n.t - APPROACH + 0.3) tw.cast = 1;
        if (t < n.t - APPROACH) continue;
        let o = this.objs.get(n.id);
        if (!o) {
          const g = new THREE.Mesh(this.unit, fxMat(this.T.yball, YELLOW, 0, 1)); g.renderOrder = 26; g.frustumCulled = false; this.scene.add(g);
          const start = this.handPos(V3()), sn = start.clone().project(cam); o = { g, kind: 'touch', sx: (sn.x + 1) / 2, sy: (1 - sn.y) / 2, d0: start.distanceTo(cam.position), rot: rnd(6) }; this.objs.set(n.id, o);
          this.inkSplat(start, 6, 2.5);
        }
        // 在屏幕空间匀速飞向落点圈（深度按 1/d 插值，匀速变大）
        const u = (t - (n.t - APPROACH)) / APPROACH, ue = Math.min(u, 1.25), d = u <= 1 ? 1 / (1 / o.d0 + (1 / SHIELD_DEPTH - 1 / o.d0) * u) : Math.max(0.3, SHIELD_DEPTH - (u - 1) * 9);
        this.screenToWorld(o.sx + (n.x - o.sx) * ue, o.sy + (n.y - o.sy) * ue - Math.sin(Math.PI * Math.min(u, 1)) * 0.05, d, o.g.position);
        o.g.quaternion.copy(cam.quaternion); o.g.scale.setScalar(RAD.vis * this.hh * SHIELD_DEPTH * 2 * (64 / 60));   // 世界尺寸固定：远小近大，u=1 时屏幕半径恰为 RAD.vis
        if (Math.random() < 0.5) this.parts.emit(o.g.position, rnd(-0.3, 0.3), rnd(-0.1, 0.5), rnd(-0.3, 0.3), YELLOW, 0.1, 0.35, -0.6, 1);
        seen.add(n.id);
      } else if (n.bagua) {      // 八卦 HOLD：按住时一座八卦阵罩住 Boss，越转越快、越转越大
        if (t < n.t - APPROACH) continue;
        if (t >= n.t - 0.6) tw.beam = 1;
        let o = this.objs.get(n.id);
        if (!o) { const g = new THREE.Mesh(this.unit, fxMat(this.T.shield, WHITE, 0, 0)); g.renderOrder = 19; g.frustumCulled = false; this.scene.add(g); o = { g, kind: 'bagua', a: 0 }; this.objs.set(n.id, o); }
        const c = this.chestPos(this._v), prog = clamp01((t - n.t) / (n.end - n.t)); c.z += 1.5;
        o.a = damp(o.a, n.s.cov ? 1 : t < n.t ? 0.22 : 0.1, 10, dt); o.g.material.uniforms.opacity.value = o.a;
        o.g.position.copy(c); o.g.quaternion.copy(cam.quaternion); o.g.rotateZ(t * 1.2 + prog * prog * 9); o.g.scale.setScalar((10 + 6 * prog) * (n.s.cov ? 1 + 0.015 * Math.sin(t * 40) : 0.9));
        if (n.s.cov) { const a = rnd(6.28), r = 5 + 3 * prog; this._v2.set(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z); this.parts.emit(this._v2, -Math.sin(a) * 6, Math.cos(a) * 6, 0, INK, 0.3, 0.5, 0, 1); this.addShake(0.012 + 0.02 * prog); }
        seen.add(n.id);
      } else if (n.kind === 'hold') {
        if (t >= n.t - APPROACH && t < n.t - 0.2) tw.raise = 1; else if (t >= n.t - 0.2 && t <= n.end) tw.down = 1;
        if (t < n.t - APPROACH) continue;
        let o = this.objs.get(n.id);
        if (!o) { const g = new THREE.Mesh(this.gswordGeo, inkMat(this.T.sword)); g.renderOrder = 24; g.frustumCulled = false; this.scene.add(g); o = { g, kind: 'hold' }; this.objs.set(n.id, o); }
        const tgt = this.screenToWorld(n.x, n.y, SHIELD_DEPTH - 0.1, this._v);
        const dir = this._v2.set(0, 1, 0).applyQuaternion(cam.quaternion).addScaledVector(this._v3.set(0, 0, -1).applyQuaternion(cam.quaternion), 0.6).normalize();   // 屏幕上是竖直的一把剑，向远处收
        const u = clamp01((t - (n.t - APPROACH)) / APPROACH), tip = this._v3.copy(tgt).addScaledVector(dir, (1 - u * u * u) * 22 - 1.1);                               // 剑身压过交点
        if (t >= n.t) {
          if (n.s.cov) {
            tip.x += rnd(-0.02, 0.02); tip.y += rnd(-0.02, 0.02); if (!blockN) blockN = n;
            for (let k = 0; k < 3; k++) { const c = Math.random(); this.parts.emit(tgt, rnd(-5, 5), rnd(-2, 6), rnd(0.5, 3), c < 0.5 ? YELLOW : c < 0.8 ? WHITE : RED, rnd(0.03, 0.08), rnd(0.15, 0.4), 12, 1.5); }   // 火花
            if (Math.random() < 0.25) this.flash(this.T.splash, tgt, Math.random() < 0.5 ? YELLOW : WHITE, 0.15, 0.6, 0.12, rnd(6), 33);
            if (Math.random() < 0.3) this.addShake(0.03);
          } else tip.addScaledVector(dir, -Math.min(1.2, (t - n.t) * 4));
        }
        o.g.material.uniforms.time.value = t; this.orientY(o.g, tip, dir);
        seen.add(n.id);
      } else if (n.kind === 'drag') {
        if (t >= n.t - 0.75) tw.beam = 1;
        let o = this.objs.get(n.id);
        if (!o) { const g = new THREE.Group(), outer = new THREE.Mesh(this.beamGeo, strokeMat(INK, WHITE)), rd = new THREE.Mesh(this.beamGeo, strokeMat(RED, RED)); outer.renderOrder = 25; rd.renderOrder = 24; outer.frustumCulled = rd.frustumCulled = false; rd.material.uniforms.opacity.value = 0.5; g.add(rd, outer); this.scene.add(g); o = { g, kind: 'drag', outer, rd }; this.objs.set(n.id, o); }
        const act = t >= n.t, pre = clamp01((t - (n.t - 0.75)) / 0.75); dragPos(n, (t - n.t) / (n.end - n.t), p);
        const a = this.eyePos(this._v2), b = this.screenToWorld(p.x, p.y, SHIELD_DEPTH - 0.1, this._v);
        this.orientX(o.outer, a, b, act ? 0.5 + 0.06 * Math.sin(t * 50) : 0.05 + 0.1 * pre); this.orientX(o.rd, a, b, act ? 0.85 : 0.12 * pre);
        o.outer.material.uniforms.time.value = t; o.rd.material.uniforms.time.value = t * 0.7; o.outer.material.uniforms.opacity.value = act ? 1 : 0.35 + 0.3 * pre; o.outer.material.uniforms.dry.value = act ? 0.35 : 0.9;
        if (act && n.s.cov) this.parts.emit(b, rnd(-2.5, 2.5), rnd(-2.5, 2.5), rnd(0, 2), Math.random() < 0.5 ? INK : WHITE, 0.07, 0.35, 3, 1);
        seen.add(n.id);
      }
    }
    for (const [id, o] of this.objs) if (!seen.has(id)) { if (o.kind === 'hold') this.inkSplat(o.g.position, 26, 5); this.scene.remove(o.g); this.objs.delete(id); }
    for (const [id, s] of this.shields) {
      s.a = damp(s.a, s.on ? 1 : 0, s.on ? 25 : 14, dt); s.pop = damp(s.pop, 0, 10, dt);
      s.m.material.uniforms.opacity.value = s.a; s.m.scale.setScalar(0.66 * (0.7 + 0.3 * s.a + 0.25 * s.pop));
      if (!s.on && s.a < 0.02) { this.scene.remove(s.m); this.shields.delete(id); } s.on = false;
    }
    this.tw = tw; this.blockN = blockN;
  }

  // ── 每帧 ──
  update(dt) {
    const T = this.time += dt, w = this.w, tw = this.tw || { cast: 0, raise: 0, down: 0, beam: 0 };
    w.cast = damp(w.cast, tw.cast, 16, dt); w.raise = damp(w.raise, tw.raise, 9, dt); w.down = damp(w.down, tw.down, 26, dt); w.beam = damp(w.beam, tw.beam, 8, dt); w.flare = damp(w.flare, 0, 1.2, dt);
    this.recoil = damp(this.recoil, 0, 7, dt); this.stagger = damp(this.stagger, 0, 2.2, dt); this.hitFlash = damp(this.hitFlash, 0, 12, dt); this.mood = damp(this.mood, this.moodTarget, 1.2, dt);
    const mood = this.mood;
    for (const m of this.mats) m.uniforms.time.value = T;
    this.bgMat.uniforms.time.value = T; this.bgMat.uniforms.mood.value = mood; this.sunMat.uniforms.mood.value = mood; this.groundMat.uniforms.time.value = T; this.mtMats.forEach(m => m.uniforms.mood.value = mood);
    this.paperMat.uniforms.flash.value = damp(this.paperMat.uniforms.flash.value, 0, 5, dt);
    this.sun.scale.setScalar(1 + mood * 0.4 + 0.015 * Math.sin(T * 0.8));

    // Boss 姿态（纸偶式的 2D 骨骼）
    const b = this.body, st = this.stagger, A = this.arms[1], B = this.arms[-1];
    b.position.set(Math.sin(T * 0.45) * 0.18, Math.sin(T * 1.1) * 0.14 - st * 0.4, -this.recoil * 0.6 - st * 1.0);
    b.rotation.z = Math.sin(T * 0.6) * 0.012 + st * Math.sin(T * 26) * 0.03; b.rotation.x = -this.recoil * 0.05 - st * 0.12 + w.down * 0.05;
    const sc = 1 + Math.sin(T * 1.1) * 0.006; b.scale.set(sc, 1 / sc, 1);
    this.head.rotation.z = Math.sin(T * 0.5) * 0.02 + st * 0.12; this.head.position.y = 14.35 + Math.sin(T * 1.1 + 0.6) * 0.05 - w.beam * 0.25 + st * 0.2;
    const lift = Math.max(w.raise, w.down);
    A.g.rotation.z = 0.75 + Math.sin(T * 0.9) * 0.02 + w.raise * 2.0 - w.down * 1.0 + w.flare * 0.2;       // 平时拄剑而立；举剑 → 斜劈
    this.knock = damp(this.knock, 0, 1.3, dt); const kn = this.knock;                                   // 被八卦阵震倒：仰面后倒，再慢慢起身
    b.rotation.x -= kn * 0.6; b.position.y -= kn * 2.4; b.position.z -= kn * 2; this.head.rotation.z += kn * 0.35; A.g.rotation.z += kn * 0.7;
    this.bossSword.rotation.z = -0.75 * (1 - lift); const ss = 1 + w.down * 0.3; this.bossSword.scale.set(ss, ss, 1);
    B.g.rotation.z = -0.4 + Math.sin(T * 0.9 + 2) * 0.02 - w.cast * 1.75 - w.beam * 0.5 - w.flare * 0.2 - kn * 0.9;
    const flare = Math.min(1, 0.3 + mood * 0.5 + w.beam * 0.4 + w.flare * 0.5), bo = this.bossOpacity;
    for (const f of this.fan) { f.p.rotation.z = Math.PI + f.a * (0.7 + flare * 0.8) + Math.sin(T * 0.7 + f.a * 3) * 0.03; f.p.scale.setScalar(0.62 + flare * 0.3); f.m.uniforms.opacity.value = bo * (f.rage ? mood : 1) * (0.24 + 0.3 * flare); }
    const hf = this.hitFlash * 0.75; for (const m of this.bossMats) { m.uniforms.flash.value = hf; m.uniforms.opacity.value = m.base * bo; }
    for (const m of this.mist) m.position.x = m.userData.x + Math.sin(T * 0.28 * m.userData.sp + m.userData.ph) * 5;
    if (this.deathT >= 0) {
      this.deathT += dt; const d = this.deathT, core = this.chestPos(this._v);
      if (d < 2.0) { b.rotation.z += Math.sin(T * 40) * 0.02; this.inkSplat(V3(rnd(-3, 3), rnd(-5, 5), 1).add(core), 3, 8); this.addShake(0.05); if (Math.random() < 0.15) this.flash(this.T.slash, V3(rnd(-3, 3), rnd(-4, 4), 1).add(core), Math.random() < 0.5 ? RED : WHITE, 3, 9, 0.3, rnd(6), 31, 0.1); }
      else {
        if (!this.burstDone) { this.burstDone = true; this.paperMat.uniforms.flash.value = 0.9; this.addShake(1); this.flash(this.T.splash, core, INK, 6, 46, 1.6, rnd(6), 30); this.flash(this.T.enso, core, INK, 4, 40, 1.3, rnd(6), 30); this.parts.burst(core, 320, 16, INK, 0.5, 2.6, 5, 0.6); this.parts.burst(core, 120, 12, RED, 0.4, 2.2, 5, 0.6); this.moodTarget = 0; }
        this.bossOpacity = Math.max(0, 1 - (d - 2.0) / 0.9); this.boss.scale.set(BOSS_SCALE * (1 + (1 - this.bossOpacity) * 0.25), BOSS_SCALE * (1 + (1 - this.bossOpacity) * 0.5), BOSS_SCALE);   // 化作一缕墨烟散去
        if (this.bossOpacity <= 0) this.boss.visible = false;
      }
    }
    if (this.escapeT >= 0) { this.escapeT += dt; this.bossOpacity = Math.max(0, 1 - this.escapeT / 1.6); if (this.bossOpacity <= 0) this.boss.visible = false; }

    // 第一人称的剑
    const vm = this.vm, s = this.sword, hh = this.hh, hw = this.hw; vm.swing = Math.max(0, vm.swing - dt / 0.26); vm.thrust = Math.max(0, vm.thrust - dt / 0.22); vm.hide = Math.max(0, vm.hide - dt); vm.charge = damp(vm.charge, this.charging.size ? 1 : 0, 14, dt);
    const sw = 1 - vm.swing, th = 1 - vm.thrust, c = vm.charge;
    let px = hw * 0.62, py = -hh * 1.04 + Math.sin(T * 1.6) * 0.012, rz = 0.5, sy = 1;
    px += (hw * 0.5 - px) * c; py += (-hh * 0.9 - py) * c; rz += (-0.55 - rz) * c; px += rnd(-1, 1) * 0.008 * c; py += rnd(-1, 1) * 0.008 * c;
    if (vm.swing > 0) { const e = 1 - (1 - sw) * (1 - sw), k = Math.sin(Math.PI * sw); rz += vm.dir * (1.4 - 3.0 * e) * (0.4 + 0.6 * k); px += (vm.aimX * hw * 0.5 - px + 0.2) * k * 0.7; py += 0.4 * k; }
    if (vm.thrust > 0) { const k = Math.sin(Math.PI * Math.pow(th, 0.55)), tx = vm.aimX * hw * 0.8, ty = -vm.aimY * hh * 0.8; rz += (Math.atan2(-(tx - px), ty - py) - rz) * k; px += (tx * 0.5 - px + hw * 0.1) * k * 0.5; py += 0.5 * k; sy = 1 - 0.45 * k; }
    // 格挡：剑横过来，剑身中段压在 HOLD 的落点上，与 Boss 的巨剑成十字
    const bn = this.blockN; if (bn) { vm.bx = (bn.x * 2 - 1) * hw; vm.by = (1 - bn.y * 2) * hh; }
    vm.block = damp(vm.block, bn ? 1 : 0, bn ? 30 : 12, dt);
    if (vm.block > 0.01) { const k = vm.block, j = bn ? 0.012 : 0; px += (vm.bx + 0.5 + rnd(-j, j) - px) * k; py += (vm.by + rnd(-j, j) - py) * k; rz += (Math.PI / 2 - rz) * k; sy += (1 - sy) * k; }
    s.position.set(px, py, -2); s.rotation.z = rz; s.scale.set(1, sy, 1); s.visible = this.mode !== 'title' && (vm.hide <= 0 || vm.block > 0.5);
    this.aura.visible = c > 0.02 && this.mode !== 'title'; this.aura.material.uniforms.opacity.value = c * 0.8; this.aura.position.set(px - Math.sin(rz) * 0.6, py + Math.cos(rz) * 0.6, -2); this.aura.rotation.z = -T * 9; this.aura.scale.setScalar(0.8 + 0.15 * Math.sin(T * 20));
    for (const n of this.charging) { const p0 = this.screenToWorld(n.x, n.y, 1.7, this._v); for (let k = 0; k < 2; k++) { const a = rnd(6.28), r = rnd(0.35, 0.65); this._v2.set(p0.x + Math.cos(a) * r, p0.y + Math.sin(a) * r, p0.z); this.parts.emit(this._v2, (p0.x - this._v2.x) * 4, (p0.y - this._v2.y) * 4, 0, Math.random() < 0.6 ? INK : RED, 0.05, 0.25); } }

    // 一次性特效
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t += dt; const u = f.t / f.dur; if (u >= 1) { this.scene.remove(f.m); f.m.material.dispose(); this.flashes.splice(i, 1); continue; }
      const e = 1 - (1 - u) * (1 - u) * (1 - u), k = f.s0 + (f.s1 - f.s0) * e; f.m.scale.set(k, k * f.sx, 1); f.m.material.uniforms.opacity.value = 1 - u * u; f.m.quaternion.copy(this.camera.quaternion); f.m.rotateZ(f.rot);
    }
    for (let i = this.trails.length - 1; i >= 0; i--) { const tr = this.trails[i]; if (!this.updateTrail(tr, dt)) { this.scene.remove(tr.mesh); tr.geo.dispose(); tr.mesh.material.dispose(); this.trails.splice(i, 1); } }
    this.parts.update(dt);

    // 相机：低机位仰视
    this.shake = damp(this.shake, 0, 9, dt); this.punch = damp(this.punch, 0, 8, dt);
    const cam = this.camera, sh = this.shake * this.shake * 0.45, title = this.mode === 'title';
    if (title) cam.position.set(Math.sin(T * 0.1) * 2.2, 1.1, 12.5); else cam.position.set(this.camBase.x + Math.sin(T * 0.4) * 0.12, this.camBase.y + Math.sin(T * 0.7) * 0.04, this.camBase.z - this.punch * 0.35);
    cam.position.x += rnd(-1, 1) * sh; cam.position.y += rnd(-1, 1) * sh;
    cam.lookAt(this.camLook.x + rnd(-1, 1) * sh, this.camLook.y + rnd(-1, 1) * sh + (title ? 0.6 : 0), this.camLook.z); cam.updateMatrixWorld();
    this.pine.rotation.z = Math.sin(T * 0.6) * 0.012; this.reedL.rotation.z = Math.sin(T * 0.9) * 0.03; this.reedR.rotation.z = Math.sin(T * 0.8 + 1) * 0.03;
  }

  render(dtMs) {
    this.renderer.render(this.scene, this.camera);
    this.frameAvg += (dtMs - this.frameAvg) * 0.03; this.frames++;   // 帧率不够时降低分辨率
    if (this.frames > 150 && this.frameAvg > 24 && this.pixelRatio > 1) { this.pixelRatio = Math.max(1, this.pixelRatio - 0.5); this.frames = 0; this.frameAvg = 16; this.resize(this.W, this.H); }
  }
}
