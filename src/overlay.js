// 2D 叠加层：音符与判定文字。规则形状，简洁易读，不带任何字：
//   HOLD        一座八卦阵：没按时静止，按住时转动；按到外面一圈细线走完（没有头判和尾判）
//   DRAG        一座小八卦阵，走在一条轨道上
//   TAP         毛笔写的红叉：一笔粗重带飞白，一笔细而带锋。白光从四端往中心收，收到中心的那一刻按下
//   HOLD-FLICK  朱红直角印章 + 一道指明方向的楔形；缩小提示是正方形框
//   双押 = 金色描边；保护套 = 白色描边
import { APPROACH, dragPos } from './chart.js';
import { RAD, GRADE_NAMES } from './judge.js';

const INK = '#1b1b1e', PAPER = '#f3ecdc', RED = '#c9301c', GOLD = '#c9a227', WHITE = '#ffffff', YELLOW = '#f2b40a';
const KAI = '"Kaiti SC","STKaiti","KaiTi","Songti SC","STSong","Noto Serif SC",serif';
const GCOL = [RED, INK, '#3f5d6e', '#7c786c', '#a39f93'];
const TAU = Math.PI * 2, SPR = 256, SPR_R = 76, SQ = 0.9, SQ_RAD = 0.24;   // SQ: 方块半边长 / R；SQ_RAD: HOLD-FLICK 的圆角 / R
const BAGUA_K = 1.45;                                                      // 八卦阵半径 / R
const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

function rrect(g, x, y, h, r) { g.beginPath(); if (r <= 0) { g.rect(x - h, y - h, h * 2, h * 2); return; } g.moveTo(x - h + r, y - h); g.arcTo(x + h, y - h, x + h, y + h, r); g.arcTo(x + h, y + h, x - h, y + h, r); g.arcTo(x - h, y + h, x - h, y - h, r); g.arcTo(x - h, y - h, x + h, y - h, r); g.closePath(); }
// ───────── 毛笔写的叉 ─────────
const sm = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// 一笔枯笔：把笔锋看成一排笔毛，每根含墨量不同。含墨多的连成一片，少的只剩一丝；两端参差不齐。
// 从 (ax,ay) 写到 (bx,by)；hw(u) 是半宽；dry(u) 是枯度（越大飞白越多）。返回这一点的不透明度。
function brushStroke(px, py, ax, ay, bx, by, hw, dry, nb, bow, seed) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, rx = px - ax, ry = py - ay;
  const u = (rx * ux + ry * uy) / len; if (u < -0.1 || u > 1.1) return 0;
  const dv = (-rx * uy + ry * ux - bow * len * Math.sin(Math.PI * Math.min(1, Math.max(0, u)))) / hw(u), ad = Math.abs(dv); if (ad > 1.4) return 0;
  const q = dv * nb * 0.5, load = vnoise(q * 1.7 + seed * 13, u * 2.2 + seed) * 0.7 + vnoise(q * 4.1 + seed, u * 6 + 3) * 0.3;
  const thr = dry(u) + 0.3 * ad * ad, line = sm(0.08, 0.55, 0.5 + 0.5 * Math.cos(q * TAU));
  const edge = sm(1.06, 0.94, ad + (vnoise(u * 30 + seed, q) - 0.5) * 0.22);
  const e0 = 0.07 * (vnoise(q * 3 + seed, 1.5) - 0.3), e1 = 1 + 0.09 * (vnoise(q * 2.5 + seed * 3, 7.5) - 0.6);    // 每根笔毛起止不一
  return edge * sm(e0 - 0.008, e0 + 0.008, u) * sm(e1 + 0.008, e1 - 0.008, u) * sm(thr - 0.05, thr + 0.05, load) * mix(line, 1, sm(thr + 0.14, thr + 0.3, load));
}
// 叉 = 一笔粗重的捺（左上 → 右下，后半段带飞白）+ 一笔细的撇（左下起笔带锋 → 右上收笔散开）
const XS = 448, XR = SPR_R * XS / SPR;   // 叉的贴图边长 / 其中 R 对应的像素
function xAlpha(px, py, seed) {
  const R = XR, x = px - XS / 2, y = py - XS / 2;
  const a = brushStroke(x, y, -0.98 * R, -0.8 * R, 0.98 * R, 0.86 * R, u => R * 0.29 * (0.92 + 0.16 * vnoise(u * 3 + seed, 2.2)), u => mix(-0.55, 0.3, sm(0.2, 1, u)), 15, 0.015, seed);
  const b = brushStroke(x, y, -1.12 * R, 0.84 * R, 1.0 * R, -0.82 * R, u => R * (0.035 + 0.15 * sm(0, 0.5, u)) * mix(1, 0.8, sm(0.75, 1, u)), u => mix(-0.5, 0.42, Math.pow(u, 1.6)), 8, -0.035, seed + 5);
  return Math.max(a, b);
}
function makeX(seed, white) {
  const cv = document.createElement('canvas'); cv.width = cv.height = XS; const g = cv.getContext('2d'), img = g.createImageData(XS, XS), d = img.data;
  for (let py = 0, i = 0; py < XS; py++) for (let px = 0; px < XS; px++, i += 4) {
    const a = xAlpha(px, py, seed), k = white ? 0 : 0.9 + 0.2 * vnoise(px * 0.03 + seed, py * 0.03);
    d[i] = white ? 255 : Math.min(255, 201 * k); d[i + 1] = white ? 255 : 46 * k; d[i + 2] = white ? 255 : 26 * k; d[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); return cv;
}
export function crossPath() { }   // （旧的四角星轮廓，已不再使用）
function makeSprites() {
  const c = SPR / 2, mk = draw => { const cv = document.createElement('canvas'); cv.width = cv.height = SPR; const g = cv.getContext('2d'); g.lineCap = 'round'; draw(g); return cv; };
  const paper = mk(g => { const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(243,236,220,0.92)'); gr.addColorStop(0.6, 'rgba(243,236,220,0.7)'); gr.addColorStop(1, 'rgba(243,236,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR); });
  const ink = mk(g => { g.fillStyle = INK; g.beginPath(); g.arc(c, c, SPR_R, 0, TAU); g.fill(); });
  const flick = mk(g => { g.fillStyle = RED; rrect(g, c, c, SPR_R * SQ, SPR_R * SQ_RAD); g.fill(); });
  const yellow = mk(g => { g.fillStyle = 'rgba(250,196,40,0.42)'; g.beginPath(); g.arc(c, c, SPR_R, 0, TAU); g.fill(); g.strokeStyle = YELLOW; g.lineWidth = SPR_R * 0.1; g.beginPath(); g.arc(c, c, SPR_R * 0.95, 0, TAU); g.stroke(); });
  // 印章：直角方块，朱色略有深浅，边角残破，里面一道细内框
  const red = mk(g => {
    const h = SPR_R * SQ; g.fillStyle = RED; g.fillRect(c - h, c - h, h * 2, h * 2);
    for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(${i % 2 ? '150,24,12' : '236,84,56'},${0.05 + 0.1 * hash(i, 1)})`; const w = 10 + 40 * hash(i, 2); g.fillRect(c - h + hash(i, 3) * (h * 2 - w), c - h + hash(i, 4) * (h * 2 - 6), w, 3 + 5 * hash(i, 5)); }   // 印泥不匀
    g.strokeStyle = PAPER; g.lineWidth = 3; g.strokeRect(c - h * 0.8, c - h * 0.8, h * 1.6, h * 1.6);                                 // 内框
    g.globalCompositeOperation = 'destination-out';                                                                                    // 残边与砂眼
    for (let i = 0; i < 44; i++) { const e = i % 4, p = hash(i, 6) * 2 - 1, r = 1.5 + 5 * hash(i, 7) * hash(i, 8); g.beginPath(); g.arc(e < 2 ? c + p * h : c + (e === 2 ? -h : h), e < 2 ? c + (e === 0 ? -h : h) : c + p * h, r, 0, TAU); g.fill(); }
    for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(c + (hash(i, 9) * 2 - 1) * h * 0.95, c + (hash(i, 10) * 2 - 1) * h * 0.95, 0.6 + 1.6 * hash(i, 11), 0, TAU); g.fill(); }
    for (const [sx, sy] of [[-1, -1], [1, 1]]) { g.beginPath(); g.moveTo(c + sx * h, c + sy * h); g.lineTo(c + sx * (h - 9), c + sy * h); g.lineTo(c + sx * h, c + sy * (h - 7)); g.fill(); }
  });
  // 八卦阵（半径占满 SPR_R*1.45 → 画在 512 的贴图上）
  const B = 512, bagua = document.createElement('canvas'); bagua.width = bagua.height = B;
  { const g = bagua.getContext('2d'), r = B / 2 - 6; g.translate(B / 2, B / 2);
    g.fillStyle = 'rgba(248,244,234,0.9)'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, r - 5, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r * 0.84, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.stroke();
    const tri = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]; g.fillStyle = INK;
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * Math.PI / 4); for (let k = 0; k < 3; k++) { const y = -r * (0.57 + k * 0.085); if (tri[i][k]) g.fillRect(-40, y, 80, 13); else { g.fillRect(-40, y, 32, 13); g.fillRect(8, y, 32, 13); } } g.restore(); }
    const t = r * 0.34; g.beginPath(); g.arc(0, 0, t, -Math.PI / 2, Math.PI / 2); g.arc(0, t / 2, t / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(0, -t / 2, t / 2, Math.PI / 2, -Math.PI / 2); g.fill();
    g.lineWidth = 4; g.beginPath(); g.arc(0, 0, t, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, -t / 2, 10, 0, TAU); g.fill(); g.fillStyle = '#f8f4ea'; g.beginPath(); g.arc(0, t / 2, 10, 0, TAU); g.fill(); }
  return { paper, bagua, ink: [ink], red: [red], flick: [flick], yellow: [yellow], x: [makeX(1.3, false), makeX(4.7, false)], xw: [makeX(1.3, true), makeX(4.7, true)] };
}

export class Overlay {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.pops = []; this.S = makeSprites(); this._p = {}; }
  resize(w, h, dpr) { this.W = w; this.H = h; this.dpr = dpr; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
  pop(n, grade, dt, part) {
    let x = n.x, y = n.y;
    if (n.kind === 'drag') { dragPos(n, 1, this._p); x = this._p.x; y = this._p.y; }
    if (part === 'flick') { x += n.dir.x * 0.07; y += n.dir.y * 0.09; }
    this.pops.push({ x, y, grade, t: 0, up: n.kind === 'hold' ? 2.3 : 1.9, fast: grade > 0 && grade < 4 && part !== 'touch' && part !== 'drag' ? (dt < 0 ? '快' : '慢') : '' });
  }
  clear() { this.pops.length = 0; }
  // 音符本体：先垫一层纸色（压在黑袍上也看得清），再画形状
  body(kind, x, y, R, a, k = 1, under = 0.9) {
    const g = this.g, hs = R * 3.2 * k, s = R * k / SPR_R * SPR;
    if (under) { g.globalAlpha = a * under; g.drawImage(this.S.paper, x - hs / 2, y - hs / 2, hs, hs); }
    g.globalAlpha = a; g.drawImage(this.S[kind][0], x - s / 2, y - s / 2, s, s);
  }
  // 描边（跟着本体的形状走）。rad < 0 表示圆；否则是方块的圆角半径
  outlines(n, x, y, R, a, rad = -1) {
    const g = this.g, shape = r => { if (rad < 0) { g.beginPath(); g.arc(x, y, r, 0, TAU); } else rrect(g, x, y, r * SQ, rad ? rad + (r - R) * SQ : 0); };
    g.globalAlpha = a; g.lineJoin = rad === 0 ? 'miter' : 'round';
    if (n.ex) { shape(R * 1.26); g.strokeStyle = INK; g.lineWidth = R * 0.2; g.stroke(); g.strokeStyle = WHITE; g.lineWidth = R * 0.13; g.stroke(); }   // 保护套：白边，下面压一道细墨线
    if (n.double) { shape(R * (n.ex ? 1.52 : 1.26)); g.strokeStyle = GOLD; g.lineWidth = R * 0.13; g.stroke(); }                                        // 双押：金边
    g.lineJoin = 'round';
  }
  // 把一个毛笔叉画到任意画布上。lit: 0~1，白光从四端往中心收的进度；1 = 收到中心 = 该按了
  stampX(g, v, x, y, r, lit, a) {
    const s = r / SPR_R * SPR;
    g.globalAlpha = a; g.drawImage(this.S.x[v], x - s / 2, y - s / 2, s, s);
    if (lit > 0) {                                                        // 被白光扫过的部分：同一个叉的白色版本，只露出外圈
      const L = r * 1.42, rin = L * (1 - Math.min(1, lit));
      g.save(); g.beginPath(); g.arc(x, y, L, 0, TAU); g.arc(x, y, rin, 0, TAU, true); g.clip(); g.drawImage(this.S.xw[v], x - s / 2, y - s / 2, s, s); g.restore();
    }
  }
  // TAP：毛笔叉 + 描边（保护套 = 白圈，双押 = 金圈）
  cross(n, x, y, R, lit, a, k = 1) {
    const g = this.g, r = R * k, hs = R * 3.7 * k;
    g.globalAlpha = a * 0.85; g.drawImage(this.S.paper, x - hs / 2, y - hs / 2, hs, hs);
    this.stampX(g, n.id % 2, x, y, r, lit, a);
    this.outlines(n, x, y, r * 1.22, a);
  }
  // 缩小圈：缩到与本体边缘重合的那一刻就是拍点
  approach(x, y, r, R, u, a, color = INK, sq = false) {
    if (u >= 1) return; const g = this.g, k = r + R * 1.75 * (1 - u); g.globalAlpha = a * (0.4 + 0.6 * u); g.strokeStyle = color; g.lineWidth = R * 0.08;
    if (sq) { g.lineJoin = 'miter'; g.strokeRect(x - k * SQ, y - k * SQ, k * SQ * 2, k * SQ * 2); g.lineJoin = 'round'; } else { g.beginPath(); g.arc(x, y, k, 0, TAU); g.stroke(); }
  }
  // 剩余时长 / 蓄力进度：外面一圈细线
  progress(x, y, r, R, frac, color, a) { const g = this.g; g.globalAlpha = a * 0.18; g.strokeStyle = INK; g.lineWidth = R * 0.08; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); if (frac > 0) { g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = R * 0.12; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac); g.stroke(); } }

  draw(notes, first, t, dt, touches, showFingers) {
    const g = this.g, W = this.W, H = this.H, R = RAD.vis * H;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, W, H); g.lineCap = 'round'; g.lineJoin = 'round';
    let last = first; while (last < notes.length && notes[last].t - APPROACH <= t) last++;
    for (let i = last - 1; i >= first; i--) {          // 从后往前画，先到的音符在最上层
      const n = notes[i], s = n.s; if (s.done) continue;
      const x = n.x * W, y = n.y * H, u = (t - (n.t - APPROACH)) / APPROACH;
      let a = Math.min(1, u * 4);
      if (t > n.t && (n.kind === 'tap' || n.kind === 'touch' || (n.kind === 'flick' && s.head === null))) a *= Math.max(0, 1 - (t - n.t) / 0.15);
      if (n.kind === 'drag') this.drawDrag(n, t, R, u, a);
      else if (n.kind === 'touch') { this.body('yellow', x, y, R, a, 1, 0.55); this.outlines(n, x, y, R, a); this.approach(x, y, R, R, u, a, YELLOW); }
      else if (n.kind === 'hold') this.drawHold(n, x, y, R, t, u, a);
      else if (n.kind === 'tap') this.cross(n, x, y, R, u, a);
      else {                                            // HOLD-FLICK
        const charging = s.head !== null && s.owner !== null, cu = Math.min(1, Math.max(0, (t - n.t) / (n.tf - n.t))), ready = charging && t >= n.tf - 0.06;
        this.drawWedge(n, x, y, R, t, a, ready); this.body('red', x, y, R, a, charging ? 1.05 + 0.03 * Math.sin(t * 40) : 1); this.outlines(n, x, y, R, a, 0);
        if (t >= n.t - 0.02) this.progress(x, y, R * 1.72, R, cu, cu >= 1 ? RED : INK, a);
        if (!charging) this.approach(x, y, R, R, u, a, INK, true);
      }
    }
    g.globalAlpha = 1;
    if (showFingers) for (const tc of touches.values()) { g.globalAlpha = 0.6; g.strokeStyle = PAPER; g.lineWidth = R * 0.1; g.beginPath(); g.arc(tc.x * W, tc.y * H, R * 0.4, 0, TAU); g.stroke(); g.strokeStyle = INK; g.lineWidth = R * 0.05; g.stroke(); }
    // 判定文字
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i]; q.t += dt; const u = q.t / 0.6; if (u >= 1) { this.pops.splice(i, 1); continue; }
      const sc = u < 0.1 ? 1.35 - 0.35 * (u / 0.1) : 1, fs = H * (q.grade === 0 ? 0.058 : 0.05) * sc, x = q.x * W, y = q.y * H - R * q.up - u * H * 0.02;
      g.globalAlpha = u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1;
      g.font = `900 ${fs}px ${KAI}`; g.lineWidth = fs * 0.22; g.strokeStyle = PAPER; g.strokeText(GRADE_NAMES[q.grade], x, y); g.fillStyle = GCOL[q.grade]; g.fillText(GRADE_NAMES[q.grade], x, y);
      if (q.fast) { g.font = `700 ${fs * 0.5}px ${KAI}`; g.fillStyle = '#6b665c'; g.lineWidth = fs * 0.12; g.strokeText(q.fast, x + fs * 1.4, y + fs * 0.1); g.fillText(q.fast, x + fs * 1.4, y + fs * 0.1); }
    }
    g.globalAlpha = 1;
  }

  // HOLD：音符本身就是八卦阵。没按时静止；按住时转起来；按到外圈细线走完
  drawHold(n, x, y, R, t, u, a) {
    const g = this.g, s = n.s, k = BAGUA_K * (n.bagua ? 1.3 : 1), r = R * k, act = t >= n.t, rem = act ? Math.max(0, 1 - (t - n.t) / (n.end - n.t)) : 1;
    const hs = r * 2.5; g.globalAlpha = a * (s.cov ? 0.2 : 0.6); g.drawImage(this.S.paper, x - hs / 2, y - hs / 2, hs, hs);
    const sc = s.cov ? 1.04 + 0.02 * Math.sin(t * 34) : 1;
    g.save(); g.translate(x, y); g.rotate(s.cov ? (t - n.t) * 4.2 + hash(n.id, 2) : hash(n.id, 2) * 0.6); g.globalAlpha = a * (s.cov ? 0.5 : 0.92); g.drawImage(this.S.bagua, -r * sc, -r * sc, r * 2 * sc, r * 2 * sc); g.restore();
    if (n.ex) { g.globalAlpha = a; g.strokeStyle = WHITE; g.lineWidth = R * 0.12; g.beginPath(); g.arc(x, y, r + R * 0.12, 0, TAU); g.stroke(); }
    if (n.double) { g.globalAlpha = a; g.strokeStyle = GOLD; g.lineWidth = R * 0.13; g.beginPath(); g.arc(x, y, r + R * (n.ex ? 0.3 : 0.12), 0, TAU); g.stroke(); }
    this.progress(x, y, r + R * 0.45, R, rem, s.cov ? RED : INK, a);
    this.approach(x, y, r, R, u, a);
  }
  // HOLD-FLICK 的方向：从方块伸出去的一道楔形，由宽到尖
  drawWedge(n, x, y, R, t, a, ready) {
    const g = this.g, L = R * (3.5 + (ready ? 0.4 : 0.15 * Math.sin(t * 8)));
    g.save(); g.translate(x, y); g.rotate(Math.atan2(n.dir.y, n.dir.x));
    for (const [col, k, al] of [[PAPER, 1.45, 0.85], [ready ? INK : RED, 1, ready ? 1 : 0.85]]) { g.globalAlpha = a * al; g.fillStyle = col; g.beginPath(); g.moveTo(R * 0.4, -R * 0.5 * k); g.lineTo(L + (k - 1) * R * 0.5, 0); g.lineTo(R * 0.4, R * 0.5 * k); g.closePath(); g.fill(); }
    g.restore();
  }
  drawDrag(n, t, R, u, a) {
    const g = this.g, W = this.W, H = this.H, tab = n.tab, f = Math.min(1, Math.max(0, (t - n.t) / (n.end - n.t))), s0 = f * tab[tab.length - 1].s, p = this._p;
    const pre = t < n.t ? 0.5 + 0.5 * Math.max(0, u) * Math.max(0, u) : 1;                // 还没开始的轨道画淡一些
    const path = () => { g.beginPath(); dragPos(n, f, p); g.moveTo(p.x * W, p.y * H); for (const q of tab) if (q.s > s0) g.lineTo(q.x * W, q.y * H); };
    g.globalAlpha = a * 0.85 * pre; g.strokeStyle = PAPER; g.lineWidth = R * 2.1; path(); g.stroke();             // 纸色托底
    g.globalAlpha = a * 0.22 * pre; g.strokeStyle = INK; g.lineWidth = R * 1.7; path(); g.stroke();               // 淡墨轨道
    g.globalAlpha = a * 0.5 * pre; g.lineWidth = R * 0.06; path(); g.stroke();                                    // 中线
    dragPos(n, f, p); const x = p.x * W, y = p.y * H;
    const r = R * 1.15, cov = n.s.cov, hs = r * 2.6;                                       // 小八卦阵：按住时转动
    g.globalAlpha = a * 0.6; g.drawImage(this.S.paper, x - hs / 2, y - hs / 2, hs, hs);
    g.save(); g.translate(x, y); g.rotate(cov ? (t - n.t) * 4.2 : hash(n.id, 2) * 0.6); g.globalAlpha = a; g.drawImage(this.S.bagua, -r, -r, r * 2, r * 2); g.restore();
    this.outlines(n, x, y, r, a);
    if (cov) { g.globalAlpha = a; g.strokeStyle = RED; g.lineWidth = R * 0.09; g.beginPath(); g.arc(x, y, r + R * 0.1, 0, TAU); g.stroke(); }
    this.approach(x, y, r, R, u, a);
  }
}
