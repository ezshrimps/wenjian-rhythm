// 谱面：120 BPM。所有时间以「拍」书写，坐标为屏幕归一化 (x:0~1 左→右, y:0~1 上→下)。
// 每个音符标注 h: 'L' | 'R'（建议用哪只手），供自动打歌机器人与手顺校验使用。
export const BPM = 120, BEAT = 60 / BPM;
export const APPROACH = 1.0; // 音符提前出现的秒数（2 拍）
const S2 = Math.SQRT1_2;
const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], UL: [-S2, -S2], UR: [S2, -S2], DL: [-S2, S2], DR: [S2, S2] };
const ASPECT = 4 / 3;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function buildPath(pts) {
  const tab = []; const seg = pts.length - 1; const per = 16;
  for (let i = 0; i < seg; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(seg, i + 2)];
    for (let k = 0; k < per; k++) { const t = k / per; tab.push({ x: catmull(a[0], b[0], c[0], d[0], t), y: catmull(a[1], b[1], c[1], d[1], t), s: 0 }); }
  }
  tab.push({ x: pts[seg][0], y: pts[seg][1], s: 0 });
  for (let i = 1; i < tab.length; i++) tab[i].s = tab[i - 1].s + Math.hypot((tab[i].x - tab[i - 1].x) * ASPECT, tab[i].y - tab[i - 1].y);
  return tab;
}
// 匀速沿路径取点，u ∈ [0,1]
export function dragPos(n, u, out = {}) {
  const tab = n.tab, total = tab[tab.length - 1].s, s = Math.min(1, Math.max(0, u)) * total;
  let lo = 0, hi = tab.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m].s <= s) lo = m; else hi = m; }
  const a = tab[lo], b = tab[hi], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; return out;
}

export const LESSON_BEATS = { tap: 24, hold: 40, drag: 56, flick: 72 };
export const FIRST_BEAT = 20;   // 完整流程从这一拍开始（前面原本是已取消的 TOUCH 教学）
export const ACT2_BEAT = 90, ACT3_BEAT = 158;
const SPREAD_X = 1.4, SPREAD_Y = 1.5;

export function buildChart(startBeat = 0) {
  const N = [];
  const P = (kind, b, x, y, h, extra) => { const n = Object.assign({ kind, b, x, y, h }, extra); N.push(n); return n; };
  const touch = (b, x, y, h) => P('tap', b, x, y, h);      // TOUCH 已取消：原来单个的 TOUCH 改成 TAP
  const tap = (b, x, y, h) => P('tap', b, x, y, h);
  const hold = (b, len, x, y, h) => P('hold', b, x, y, h, { len });
  const drag = (b, len, pts, h) => P('drag', b, pts[0][0], pts[0][1], h, { len, pts });
  const flick = (b, x, y, d, h) => P('flick', b, x, y, h, { d });
  const row = (b, n, step, x0, y0, x1, y1, h) => drag(b, (n - 1) * step, [[x0, y0], [x1, y1]], h);   // 原来一排 TOUCH（一划而过）改成沿同一条线的 DRAG
  const EX = n => { n.ex = true; return n; };                       // 保护套：只要不漏就是极致
  const bagua = (b, len, h) => P('hold', b, .50, .46, h, { len, bagua: true });   // 八卦 HOLD：只出现在 Boss 正中，结束时把 Boss 震倒
  const L = 'L', R = 'R';

  // ───────── 第一幕：教学 ─────────
  // TAP（第 24 拍暂停讲解）
  tap(28, .50, .46, R); tap(30, .40, .50, L); tap(32, .60, .50, R);
  tap(33, .45, .38, L); tap(34, .55, .38, R); EX(tap(35, .50, .56, L));
  tap(36, .38, .48, L); tap(36, .62, .48, R);
  // HOLD（第 40 拍）
  hold(44, 2, .30, .62, L); hold(48, 2, .70, .62, R);
  hold(52, 3, .33, .56, L); hold(52, 3, .67, .56, R);
  // DRAG（第 56 拍）
  drag(60, 4, [[.25, .66], [.50, .46], [.75, .66]], R);
  drag(66, 4, [[.75, .50], [.56, .70], [.40, .46], [.25, .62]], L);
  // HOLD-FLICK（第 72 拍）
  flick(76, .50, .60, 'U', R); flick(80, .35, .56, 'R', L); flick(84, .65, .56, 'L', R);
  flick(88, .30, .60, 'UR', L); flick(88, .70, .60, 'UL', R);

  // ───────── 第二幕：双手组合 ─────────
  let S = 92;
  hold(S, 2, .25, .60, L); tap(S, .60, .42, R); tap(S + 1, .68, .50, R); touch(S + 2, .70, .65, R); tap(S + 3, .40, .45, L);
  hold(S + 4, 2, .75, .60, R); tap(S + 4, .40, .42, L); tap(S + 5, .32, .50, L); touch(S + 6, .30, .65, L); tap(S + 7, .60, .45, R);
  row(S + 8, 4, .5, .45, .70, .75, .70, R); tap(S + 10, .35, .45, L); tap(S + 10.5, .62, .45, R); tap(S + 11, .40, .55, L); tap(S + 11.5, .58, .55, R);
  flick(S + 12, .30, .60, 'R', L); touch(S + 12, .72, .40, R); touch(S + 13, .72, .62, R);
  tap(S + 14, .60, .45, R); tap(S + 14.5, .40, .45, L); tap(S + 15, .35, .50, L); tap(S + 15, .65, .50, R);
  drag(S + 16, 3, [[.55, .70], [.75, .50], [.60, .30]], R); tap(S + 16, .30, .50, L); tap(S + 17, .25, .62, L); tap(S + 18, .35, .45, L); tap(S + 19, .40, .60, L);
  drag(S + 20, 3, [[.45, .70], [.25, .50], [.40, .30]], L); tap(S + 20, .70, .50, R); tap(S + 21, .75, .62, R); tap(S + 22, .65, .45, R); tap(S + 23, .60, .60, R);
  bagua(S + 24, 1.5, R);
  touch(S + 26, .35, .45, L); touch(S + 26.5, .65, .45, R); touch(S + 27, .30, .60, L); touch(S + 27.5, .70, .60, R);
  flick(S + 28, .65, .55, 'U', R); touch(S + 28, .30, .40, L); touch(S + 29, .30, .62, L);
  flick(S + 30, .30, .60, 'UR', L); flick(S + 30, .70, .60, 'UL', R);
  tap(S + 32, .30, .60, L); tap(S + 32.5, .70, .60, R); tap(S + 33, .36, .48, L); tap(S + 33.5, .64, .48, R);
  tap(S + 34, .42, .38, L); tap(S + 34.5, .58, .38, R); tap(S + 35, .40, .55, L); tap(S + 35, .60, .55, R);
  hold(S + 36, 3, .22, .55, L); row(S + 36, 4, .5, .50, .72, .80, .72, R); tap(S + 38, .62, .40, R); tap(S + 39, .70, .50, R);
  hold(S + 40, 3, .78, .55, R); row(S + 40, 4, .5, .50, .72, .20, .72, L); tap(S + 42, .38, .40, L); tap(S + 43, .30, .50, L);
  drag(S + 44, 2, [[.50, .65], [.75, .45]], R); tap(S + 44, .30, .50, L); tap(S + 45, .30, .62, L);
  drag(S + 46, 1.5, [[.50, .65], [.25, .45]], L); tap(S + 46.5, .68, .42, R); tap(S + 47.5, .72, .60, R);
  flick(S + 48, .30, .55, 'U', L); tap(S + 48, .65, .45, R); tap(S + 49, .70, .58, R);
  flick(S + 50, .70, .55, 'U', R); tap(S + 50, .35, .45, L); tap(S + 51, .30, .58, L);
  row(S + 52, 4, .5, .45, .68, .15, .68, L); row(S + 52, 4, .5, .55, .68, .85, .68, R);
  tap(S + 54, .38, .45, L); tap(S + 54, .62, .45, R); tap(S + 55, .30, .55, L); tap(S + 55, .70, .55, R);
  hold(S + 56, 1.5, .30, .60, L); tap(S + 56, .62, .45, R); tap(S + 56.5, .70, .45, R); tap(S + 57, .62, .55, R); tap(S + 57.5, .70, .55, R);
  hold(S + 58, 1.5, .70, .60, R); tap(S + 58, .38, .45, L); tap(S + 58.5, .30, .45, L); tap(S + 59, .38, .55, L); tap(S + 59.5, .30, .55, L);
  flick(S + 60, .32, .60, 'U', L); flick(S + 60, .68, .60, 'U', R);
  tap(S + 62, .38, .45, L); tap(S + 62.5, .62, .45, R); tap(S + 63, .40, .52, L); tap(S + 63, .60, .52, R);

  // ───────── 终幕：Boss 战 ─────────
  const B = 162;
  // 1: 交替突刺
  const zl = [[.35, .60], [.30, .48], [.36, .38], [.42, .50]], zr = [[.65, .60], [.70, .48], [.64, .38], [.58, .50]];
  for (let i = 0; i < 4; i++) { tap(B + i, zl[i][0], zl[i][1], L); tap(B + i + .5, zr[i][0], zr[i][1], R); }
  // 2: 16 分火球雨（划动）+ 另一手突刺
  row(B + 4, 7, .25, .30, .70, .78, .70, R, true); tap(B + 4, .18, .45, L); tap(B + 5, .18, .58, L);
  row(B + 6, 7, .25, .70, .52, .22, .52, L, true); tap(B + 6, .86, .45, R); tap(B + 7, .86, .60, R);
  // 3-4: 单手顶盾 + 另一手连刺接剑气
  hold(B + 8, 3.5, .20, .60, L); tap(B + 8, .60, .42, R); tap(B + 8.5, .70, .42, R); tap(B + 9, .70, .55, R); tap(B + 9.5, .60, .55, R); flick(B + 10, .65, .55, 'U', R);
  hold(B + 12, 3.5, .80, .60, R); tap(B + 12, .40, .42, L); tap(B + 12.5, .30, .42, L); tap(B + 13, .30, .55, L); tap(B + 13.5, .40, .55, L); flick(B + 14, .35, .55, 'U', L);
  // 5-6: 大回旋激光 + 另一手突刺
  drag(B + 16, 3.5, [[.50, .72], [.70, .56], [.85, .40], [.70, .28], [.56, .40]], R);
  tap(B + 16, .30, .50, L); tap(B + 17, .25, .62, L); tap(B + 17.5, .33, .52, L); tap(B + 18, .35, .40, L); tap(B + 19, .28, .55, L); tap(B + 19.5, .36, .62, L);
  drag(B + 20, 3.5, [[.50, .72], [.30, .56], [.15, .40], [.30, .28], [.44, .40]], L);
  tap(B + 20, .70, .50, R); tap(B + 21, .75, .62, R); tap(B + 21.5, .67, .52, R); tap(B + 22, .65, .40, R); tap(B + 23, .72, .55, R); tap(B + 23.5, .64, .62, R);
  // 7: 双押锤击
  tap(B + 24, .35, .45, L); tap(B + 24, .65, .45, R); tap(B + 25, .25, .60, L); tap(B + 25, .75, .60, R);
  hold(B + 26, 1, .35, .62, L); hold(B + 26, 1, .65, .62, R); tap(B + 27.5, .40, .42, L); tap(B + 27.5, .60, .42, R);
  // 8: 交叉剑气 + 双手外划
  flick(B + 28, .30, .60, 'UR', L); flick(B + 28, .70, .60, 'UL', R);
  row(B + 30, 7, .25, .45, .70, .15, .70, L, true); row(B + 30, 7, .25, .55, .70, .85, .70, R, true);
  // 9: 盾与刺交错
  hold(B + 32, 1, .25, .55, L); tap(B + 32.5, .60, .42, R); tap(B + 33, .70, .50, R); tap(B + 33.5, .35, .42, L);
  hold(B + 34, 1, .75, .55, R); tap(B + 34.5, .40, .42, L); tap(B + 35, .30, .50, L); tap(B + 35.5, .65, .42, R);
  // 10: 三连火球接突刺
  row(B + 36, 3, .25, .55, .70, .71, .70, R, true); tap(B + 37, .65, .45, R);
  row(B + 37.5, 3, .25, .45, .70, .29, .70, L, true); tap(B + 38.5, .35, .45, L); tap(B + 39, .60, .50, R); tap(B + 39.5, .40, .50, L);
  // 11: 激光与剑气换手
  drag(B + 40, 1.5, [[.20, .45], [.40, .66]], L); flick(B + 40, .70, .55, 'U', R);
  drag(B + 42, 1.5, [[.80, .45], [.60, .66]], R); flick(B + 42, .30, .55, 'U', L);
  // 12: 双押连打 + 双盾
  tap(B + 44, .40, .45, L); tap(B + 44, .60, .45, R); tap(B + 44.5, .30, .58, L); tap(B + 44.5, .70, .58, R);
  tap(B + 45, .40, .45, L); tap(B + 45, .60, .45, R); tap(B + 45.5, .30, .58, L); tap(B + 45.5, .70, .58, R);
  hold(B + 46, 1.5, .30, .64, L); hold(B + 46, 1.5, .70, .64, R);
  // 13-14: 回旋连刺（高潮）
  for (let n = 0; n < 16; n++) {
    const a = Math.floor(n / 2) * Math.PI / 4, b = B + 48 + n * .5;
    if (n % 2 === 0) EX(tap(b, .32 + .09 * Math.cos(a), .50 + .12 * Math.sin(a), L));
    else EX(tap(b, .68 - .09 * Math.cos(a), .50 + .12 * Math.sin(a), R));
  }
  // 15-16: 长盾 + 火球雨 + 剑气
  hold(B + 56, 4, .18, .62, L); row(B + 56, 7, .25, .40, .72, .82, .72, R, true); tap(B + 58, .60, .42, R); tap(B + 58.5, .70, .50, R); flick(B + 59, .65, .55, 'U', R);
  hold(B + 61, 3, .82, .62, R); row(B + 60.5, 7, .25, .60, .72, .18, .72, L, true); tap(B + 62.5, .40, .42, L); flick(B + 63, .35, .55, 'U', L);
  // 17: 双激光
  drag(B + 65, 3, [[.40, .70], [.20, .50], [.38, .30]], L); drag(B + 65, 3, [[.60, .70], [.80, .50], [.62, .30]], R);
  // 18: 收束
  tap(B + 68.5, .30, .55, L); tap(B + 69, .70, .55, R); tap(B + 69.5, .36, .50, L); tap(B + 70, .64, .50, R);
  tap(B + 70.5, .42, .45, L); tap(B + 71, .58, .45, R); tap(B + 71.5, .42, .52, L); tap(B + 71.5, .58, .52, R);
  // 19: 八卦镇压 → 交叉剑气 → 终结一击
  bagua(B + 72, 2.5, R);
  EX(flick(B + 75, .35, .60, 'UR', L)); EX(flick(B + 75, .65, .60, 'UL', R));
  const fin = tap(B + 77, .50, .44, R); fin.finisher = true;

  // ───────── 铺开 ─────────
  // 谱面是按靠近中间的位置写的；这里以画面中心为基准向四周拉开，用满整块可触达的区域。
  // 横向拉伸是单调的，所以左右手不会因此交叉。八卦镇压和终结一击保持在 Boss 正中。
  const sx = x => Math.min(0.9, Math.max(0.1, 0.5 + (x - 0.5) * SPREAD_X)), sy = y => Math.min(0.86, Math.max(0.22, 0.54 + (y - 0.54) * SPREAD_Y));
  for (const n of N) { if (n.bagua || n.finisher) continue; n.x = sx(n.x); n.y = sy(n.y); if (n.pts) n.pts = n.pts.map(p => [sx(p[0]), sy(p[1])]); }

  // ───────── 后处理 ─────────
  let notes = N.filter(n => n.b >= startBeat).sort((a, b) => a.b - b.b || a.x - b.x);
  const byBeat = new Map();
  for (const n of notes) { const k = Math.round(n.b * 1000); byBeat.set(k, (byBeat.get(k) || 0) + 1); }
  notes.forEach((n, i) => {
    n.id = i; n.t = n.b * BEAT;
    n.end = n.len ? (n.b + n.len) * BEAT : n.t;
    n.attack = n.kind === 'tap' || n.kind === 'flick';
    n.double = byBeat.get(Math.round(n.b * 1000)) > 1;
    n.sec = n.b < ACT2_BEAT ? 1 : n.b < ACT3_BEAT ? 2 : 3;
    if (n.kind === 'flick') { n.tf = n.t + BEAT; n.dir = { x: DIRS[n.d][0], y: DIRS[n.d][1] }; }
    if (n.kind === 'drag') n.tab = buildPath(n.pts);
  });
  const events = [];
  for (const [key, b] of Object.entries(LESSON_BEATS)) if (b >= startBeat) events.push({ t: b * BEAT, type: 'lesson', key });
  if (startBeat <= FIRST_BEAT) events.push({ t: (FIRST_BEAT + 0.5) * BEAT, type: 'banner', act: 1 });
  if (startBeat <= ACT2_BEAT) events.push({ t: ACT2_BEAT * BEAT, type: 'banner', act: 2 });
  if (startBeat <= ACT3_BEAT) events.push({ t: ACT3_BEAT * BEAT, type: 'banner', act: 3 });
  events.sort((a, b) => a.t - b.t);
  const last = notes[notes.length - 1];
  return { notes, events, beat: BEAT, endTime: Math.max(last.end, last.tf || 0) };
}
