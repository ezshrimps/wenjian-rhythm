// 判定引擎（纯逻辑，无 DOM 依赖，可在 node 里跑）。
// 距离单位：屏幕高度 H（x 方向乘以宽高比）。时间单位：秒（窗口用毫秒书写）。
import { dragPos } from './chart.js';

export const G = { CP: 0, P: 1, GR: 2, GD: 3, MISS: 4 };
export const GRADE_NAMES = ['极致', '完美', '良好', '尚可', '失误'];
export const WINDOWS = [16.67, 50, 100, 150];       // 舞萌式：Critical Perfect / Perfect / Great / Good
export const FLICK_WINDOWS = [50, 100, 170, 250];   // 剑气释放（滑动动作）更宽松
export const RAD = { vis: 0.075, tap: 0.17, touch: 0.15, hold: 0.21, drag: 0.23, catch: 0.26 };
const DRAG_LENIENCY = 0.11;  // 激光：手指略快/略慢 0.11s 内都算跟住
const MULT = [1, 1, 0.8, 0.5, 0];
const WEIGHT = { touch: 1, hold: 2, drag: 3, tap: 5, head: 5, flick: 5 };
const DMG = { tap: 1, head: 0.6, flick: 2.4 };
const DMULT = [1, 0.9, 0.6, 0.3, 0];
const BAGUA_DMG = 4;   // 八卦 HOLD 镇压成功也会削减 Boss
const DRAG_RATIO = [0.9, 0.75, 0.55, 0.3];
const HOLD_RATIO = [0.75, 0.55, 0.35, 0.15];   // HOLD 没有头判也没有尾判：按住 75% 以上即为极致，之后每少 20% 降一档

export function gradeFor(dtMs, win = WINDOWS) {
  const a = Math.abs(dtMs);
  for (let i = 0; i < 4; i++) if (a <= win[i]) return i;
  return G.MISS;
}

export class Engine {
  constructor(chart, { aspect = 4 / 3, emit = () => { } } = {}) {
    this.notes = chart.notes; this.aspect = aspect; this.emit = emit;
    this.touches = new Map(); this.first = 0; this._p = {};
    let tw = 0, an = 0, td = 0, tj = 0;
    for (const n of this.notes) {
      n.s = { done: false, head: null, headDt: 0, held: 0, lastT: null, cov: false, lastInside: -1e9, owner: null, flickDone: false, headLate: false, result: null };
      if (n.kind === 'flick') { tw += WEIGHT.head + WEIGHT.flick; an += 2; td += DMG.head + DMG.flick; tj += 2; }
      else { tw += WEIGHT[n.kind]; tj++; if (n.kind === 'tap') { an++; td += DMG.tap; } if (n.bagua) td += BAGUA_DMG; }
    }
    this.totalW = tw; this.attackN = an; this.totalDmg = td; this.totalJudge = tj;
    this.stats = { counts: [0, 0, 0, 0, 0], combo: 0, maxCombo: 0, score: 0, bonus: 0, dmg: 0, early: 0, late: 0, judged: 0 };
  }
  get achievement() { return 100 * this.stats.score / this.totalW + (this.attackN ? this.stats.bonus / this.attackN : 0); }
  get bossHp() { return Math.max(0, 1 - this.stats.dmg / this.totalDmg); }
  get finished() { return this.stats.judged >= this.totalJudge; }

  dist(ax, ay, bx, by) { return Math.hypot((ax - bx) * this.aspect, ay - by); }
  segDist(px, py, ax, ay, bx, by) {
    const A = this.aspect, vx = (bx - ax) * A, vy = by - ay, wx = (px - ax) * A, wy = py - ay;
    const l2 = vx * vx + vy * vy; let t = l2 > 0 ? (wx * vx + wy * vy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(wx - vx * t, wy - vy * t);
  }

  judge(n, part, grade, dt = 0) {
    const s = this.stats;
    if (n.ex && grade < G.MISS) grade = G.CP;        // 保护套：只要不是失误就是极致
    s.counts[grade]++; s.judged++;
    if (grade < G.MISS) { s.combo++; if (s.combo > s.maxCombo) s.maxCombo = s.combo; } else s.combo = 0;
    s.score += WEIGHT[part] * MULT[grade];
    if (DMG[part]) { s.bonus += grade === 0 ? 1 : grade === 1 ? 0.5 : 0; s.dmg += DMG[part] * DMULT[grade]; }
    if (n.bagua) s.dmg += BAGUA_DMG * DMULT[grade];
    if (grade > 0 && grade < 4) { if (dt < 0) s.early++; else s.late++; }
    n.s.result = grade;
    this.emit({ type: 'judge', note: n, part, grade, dt });
  }

  // ── 输入 ──
  down(id, x, y, ts) {
    const tc = { id, x, y, downT: ts, hist: [{ t: ts, x, y }] };
    this.touches.set(id, tc);
    let best = null, bestD = 0, bestDt = 0;
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - ts > 0.2) break;
      if (n.s.done || n.s.head !== null || (n.kind !== 'tap' && n.kind !== 'flick')) continue;   // 只有进攻音符需要「新按下」
      const dt = (ts - n.t) * 1000; if (Math.abs(dt) > WINDOWS[3]) continue;
      const d = this.dist(x, y, n.x, n.y); if (d > RAD.tap) continue;
      if (!best || n.t < best.t - 1e-6 || (Math.abs(n.t - best.t) < 1e-6 && d < bestD)) { best = n; bestD = d; bestDt = dt; }
    }
    if (best) {
      const g = gradeFor(bestDt), s = best.s;
      if (best.kind === 'tap') { s.done = true; this.judge(best, 'tap', g, bestDt); }
      else { s.head = g; s.owner = id; this.judge(best, 'head', g, bestDt); this.emit({ type: 'charge', note: best }); }
    }
    this.sample(x, y, x, y, ts);
  }
  move(id, x, y, ts) {
    const tc = this.touches.get(id); if (!tc) return;
    this.sample(tc.x, tc.y, x, y, ts);
    tc.x = x; tc.y = y; tc.hist.push({ t: ts, x, y });
    while (tc.hist.length > 2 && tc.hist[1].t < ts - 0.13) tc.hist.shift();
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i]; if (n.t - ts > 0.2) break;
      if (n.kind === 'flick' && !n.s.done && n.s.owner === id) this.checkFlick(n, tc, ts, false);
    }
  }
  up(id, ts) {
    const tc = this.touches.get(id); if (!tc) return;
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i]; if (n.t - ts > 0.2) break;
      if (n.kind === 'flick' && !n.s.done && n.s.owner === id) {
        if (!this.checkFlick(n, tc, ts, true)) { n.s.done = true; this.judge(n, 'flick', G.MISS); }
      }
    }
    this.touches.delete(id);
  }
  checkFlick(n, tc, ts, release) {
    const ref = tc.hist[0];
    const dx = (tc.x - ref.x) * this.aspect, dy = tc.y - ref.y, mag = Math.hypot(dx, dy);
    const proj = dx * n.dir.x + dy * n.dir.y;
    if (proj < (release ? 0.03 : 0.06) || proj / mag < 0.5) return false;
    const dt = (ts - n.tf) * 1000;
    if (dt < -FLICK_WINDOWS[3]) return false;      // 太早：忽略，继续蓄力
    n.s.flickDone = true; n.s.done = true;
    this.judge(n, 'flick', gradeFor(dt, FLICK_WINDOWS), dt);
    return true;
  }
  // 一段手指轨迹（或静止点）对 TOUCH 的存在检测
  sample(x0, y0, x1, y1, ts) {
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i]; if (n.t - ts > 0.4) break;
      if (n.kind !== 'touch' || n.s.done) continue;
      if (this.segDist(n.x, n.y, x0, y0, x1, y1) > RAD.touch) continue;
      if (ts >= n.t) {
        if (ts - n.t <= WINDOWS[3] / 1000) {
          const dt = n.s.lastInside >= n.t - 0.06 ? 0 : (ts - n.t) * 1000;  // 已经停在圈上 → 视为准点
          n.s.done = true; this.judge(n, 'touch', gradeFor(dt), dt);
        }
      } else n.s.lastInside = ts;
    }
  }
  anyTouchNear(x, y, r) { for (const tc of this.touches.values()) if (this.dist(tc.x, tc.y, x, y) <= r) return tc; return null; }
  cover(n, now, covered) {
    const s = n.s, a = Math.max(s.lastT === null ? n.t : s.lastT, n.t), b = Math.min(now, n.end);
    if (covered && b > a) s.held += b - a;
    s.lastT = now;
    const on = covered && now >= n.t && now <= n.end;
    if (on !== s.cov) { s.cov = on; this.emit({ type: 'cover', note: n, on }); }
  }

  // ── 每帧 ──
  update(now) {
    for (const tc of this.touches.values()) this.sample(tc.x, tc.y, tc.x, tc.y, now);
    while (this.first < this.notes.length && this.notes[this.first].s.done) this.first++;
    const late = WINDOWS[3] / 1000, p = this._p;
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i], s = n.s;
      if (n.t - now > 0.5) break;
      if (s.done) continue;
      switch (n.kind) {
        case 'touch':
          if (now >= n.t) {
            if (s.lastInside >= n.t - 0.1) { s.done = true; this.judge(n, 'touch', s.lastInside >= n.t - 0.03 ? G.CP : G.P, 0); }
            else if (now > n.t + late) { s.done = true; this.judge(n, 'touch', G.MISS); }
          }
          break;
        case 'tap':
          if (now > n.t + late) { s.done = true; this.judge(n, 'tap', G.MISS); }
          break;
        case 'hold': {      // 没有头判，也没有尾判：只看按住的时长
          this.cover(n, now, !!this.anyTouchNear(n.x, n.y, RAD.hold));
          if (now >= n.end) {
            const ratio = Math.min(1, s.held / Math.max(0.05, n.end - n.t - 0.1));
            let g = G.MISS; for (let k = 0; k < 4; k++) if (ratio >= HOLD_RATIO[k]) { g = k; break; }
            s.done = true; s.ratio = ratio; this.judge(n, 'hold', g);
          }
          break;
        }
        case 'drag': {
          const dur = n.end - n.t; let cov = false;
          for (const off of [0, -DRAG_LENIENCY, DRAG_LENIENCY]) {
            dragPos(n, (now + off - n.t) / dur, p);
            if (this.anyTouchNear(p.x, p.y, RAD.drag)) { cov = true; break; }
          }
          this.cover(n, now, cov);
          if (now >= n.end) {
            const ratio = Math.min(1, s.held / Math.max(0.05, dur - 0.1));
            let g = G.MISS; for (let k = 0; k < 4; k++) if (ratio >= DRAG_RATIO[k]) { g = k; break; }
            s.done = true; s.ratio = ratio; this.judge(n, 'drag', g);
          }
          break;
        }
        case 'flick':
          if (s.head === null && now > n.t + late) { s.head = G.MISS; this.judge(n, 'head', G.MISS); }
          if (s.head === G.MISS && s.owner === null) {   // 起手漏了，按住也能补救后半段
            const tc = this.anyTouchNear(n.x, n.y, RAD.catch);
            if (tc) { s.owner = tc.id; tc.hist = [{ t: now, x: tc.x, y: tc.y }]; this.emit({ type: 'charge', note: n }); }
          }
          if (now > n.tf + FLICK_WINDOWS[3] / 1000) { s.done = true; this.judge(n, 'flick', G.MISS); }
          break;
      }
    }
  }
}
