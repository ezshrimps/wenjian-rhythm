// 自动打歌机器人：把谱面翻译成左右两只「虚拟手指」的手势，再通过与真人相同的输入接口打出去。
import { dragPos } from './chart.js';
const ASPECT = 4 / 3, FLICK_DIST = 0.16;

export function buildGestures(notes) {
  const out = [];
  for (const hand of ['L', 'R']) {
    const list = notes.filter(n => n.h === hand);
    let prevEnd = -1e9;
    for (let i = 0; i < list.length; i++) {
      const n = list[i]; let g;
      if (n.kind === 'tap') g = { t0: n.t, t1: n.t + 0.07, pos: () => [n.x, n.y] };
      else if (n.kind === 'hold') g = { t0: n.t, t1: n.end + 0.02, pos: () => [n.x, n.y] };
      else if (n.kind === 'drag') {
        const p = {};
        g = { t0: n.t - 0.12, t1: n.end + 0.03, pos: t => { dragPos(n, (t - n.t) / (n.end - n.t), p); return [p.x, p.y]; } };
      } else if (n.kind === 'flick') {
        const ex = n.x + n.dir.x * FLICK_DIST / ASPECT, ey = n.y + n.dir.y * FLICK_DIST;
        g = { t0: n.t, t1: n.tf + 0.08, pos: t => t >= n.tf ? [ex, ey] : [n.x, n.y], exact: [{ t: n.tf, x: ex, y: ey }] };
      } else { // touch：把同一只手连续的火球合成一次划动
        const grp = [n];
        while (i + 1 < list.length && list[i + 1].kind === 'touch' && list[i + 1].t - grp[grp.length - 1].t <= 0.26) grp.push(list[++i]);
        g = {
          t0: grp[0].t - 0.1, t1: grp[grp.length - 1].t + 0.05, pos: t => {
            if (t <= grp[0].t) return [grp[0].x, grp[0].y];
            for (let k = 1; k < grp.length; k++) if (t <= grp[k].t) {
              const a = grp[k - 1], b = grp[k], f = (t - a.t) / (b.t - a.t);
              return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
            }
            const l = grp[grp.length - 1]; return [l.x, l.y];
          }
        };
      }
      g.hand = hand; g.note = n; g.t0 = Math.max(g.t0, prevEnd + 0.02); prevEnd = g.t1;
      out.push(g);
    }
  }
  out.sort((a, b) => a.t0 - b.t0);
  out.forEach((g, i) => { g.id = 1000 + i; g.state = 0; g.ei = 0; });
  return out;
}

export class Bot {
  constructor(notes) { this.g = buildGestures(notes); this.i0 = 0; }
  step(now, api) {
    const gs = this.g;
    while (this.i0 < gs.length && gs[this.i0].state === 2) this.i0++;
    for (let i = this.i0; i < gs.length; i++) {
      const g = gs[i]; if (g.t0 > now) break;
      if (g.state === 2) continue;
      if (g.state === 0) { const p = g.pos(g.t0); api.down(g.id, p[0], p[1], g.t0); g.state = 1; g.lx = p[0]; g.ly = p[1]; }
      if (g.exact) while (g.ei < g.exact.length && g.exact[g.ei].t <= now) { const e = g.exact[g.ei++]; api.move(g.id, e.x, e.y, e.t); g.lx = e.x; g.ly = e.y; }
      if (now >= g.t1) { api.up(g.id, g.t1); g.state = 2; continue; }
      const p = g.pos(now);
      if (p[0] !== g.lx || p[1] !== g.ly) { api.move(g.id, p[0], p[1], now); g.lx = p[0]; g.ly = p[1]; }
    }
  }
}

// 手顺校验：同手不重叠、移动速度合理、双手不交叉。返回问题列表。
export function validateHands(notes) {
  const gs = buildGestures(notes), problems = [];
  for (const hand of ['L', 'R']) {
    const list = gs.filter(g => g.hand === hand);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (b.note.t < a.t1 - 0.021 || b.t0 < a.t1) { problems.push(`同手重叠 ${hand} 拍${a.note.b}→${b.note.b}`); continue; }
      const pa = a.pos(a.t1), pb = b.pos(b.t0), d = Math.hypot((pa[0] - pb[0]) * ASPECT, pa[1] - pb[1]);
      const gap = b.note.t - (a.t1 - 0.07);
      if (d / Math.max(gap, 0.01) > 2.6) problems.push(`同手移动过快 ${hand} 拍${a.note.b}→${b.note.b} (${(d / gap).toFixed(2)} H/s)`);
      if (b.note.kind !== 'touch' && a.note.kind !== 'touch' && b.note.t - a.note.t < 0.249) problems.push(`同手过密 ${hand} 拍${b.note.b}`);
    }
  }
  const Ls = gs.filter(g => g.hand === 'L'), Rs = gs.filter(g => g.hand === 'R'), M = 0.12;
  const end = Math.max(...gs.map(g => g.t1));
  const find = (list, t) => list.find(g => t >= g.t0 - M && t <= g.t1 + M);
  for (let t = 0; t < end; t += 0.05) {
    const l = find(Ls, t), r = find(Rs, t); if (!l || !r) continue;
    const pl = l.pos(Math.min(Math.max(t, l.t0), l.t1)), pr = r.pos(Math.min(Math.max(t, r.t0), r.t1));
    if (pl[0] > pr[0] + 0.02) { problems.push(`双手交叉 拍${(t * 2).toFixed(2)} L.x=${pl[0].toFixed(2)} R.x=${pr[0].toFixed(2)}`); t += 0.5; }
  }
  return problems;
}
