import { buildChart, BEAT, ACT2_BEAT, FIRST_BEAT } from './chart.js';
import { Engine, G } from './judge.js';
import { Bot } from './bot.js';
import { Sfx } from './audio.js';
import { World } from './scene.js';
import { Overlay, crossPath } from './overlay.js';

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search), FREEZE = +(Q.get('freeze') || 0), MUTE = !!Q.get('mute');   // ?mute=1 完全不出声（自动化测试用）
const sfx = new Sfx(), world = new World($('gl')), overlay = new Overlay($('hud'));
const snd = (fn, ...a) => sfx.ok ? sfx[fn](...a) : undefined;
let W = 1, H = 1, game = null, lastPerf = performance.now();
let vperf = null, skipRender = false;                    // 虚拟时钟（自动化测试用）
const pnow = () => vperf === null ? performance.now() : vperf;
let offsetMs = +(localStorage.getItem('tqjl.offset') || 0);

const clock = {
  running: false, anchorPerf: 0, anchorSong: 0,
  now(perf = pnow()) { return this.running ? this.anchorSong + (perf - this.anchorPerf) / 1000 : this.anchorSong; },
  start(song) { this.anchorSong = song; this.anchorPerf = pnow(); this.running = true; },
  pause(at) { this.anchorSong = at === undefined ? this.now() : at; this.running = false; },
  resume() { this.anchorPerf = pnow(); this.running = true; }
};

const LESSONS = {
  hold: { tag: '守', cls: 'def', title: '八卦 · 架', en: 'HOLD', text: '墨尊的巨剑当头压下！<b>按住八卦阵</b>，横剑架住——两剑十字相抵、火花四溅。一直按到外圈的细线走完。', steps: '· 没有起手判定，也没有收尾判定：提前按住、结束后晚点松手都可以<br>· 只看按住的时长：达到 <b>75%</b> 即为「极致」，之后每少两成降一档<br>· 出现在墨尊正中的大八卦阵是<b>八卦镇压</b>：按到底，阵会炸开，把墨尊震倒' },
  drag: { tag: '守', cls: 'def', title: '剑气 · 随', en: 'DRAG', text: '墨尊目中射出一道剑气，落点沿着<b>轨道</b>游走。手指按住那座小八卦阵，贴着它一路拖到终点。', steps: '· 只看<b>跟住的时间比例</b>，没有起手判定<br>· 稍偏一点、略快略慢，都在容错之内' },
  tap: { tag: '攻', cls: 'atk', title: '刺', en: 'TAP', text: '<b>毛笔画的红叉</b>是进攻：分数更高，并且直接削去墨尊的气势。白光从四端往中心收，<b>收到中心的那一刻点下去</b>，刺出一剑。', steps: '· 必须是一次<b>新的按下</b>，划过去不算<br>· <b>金色描边</b>＝双押：同一拍，双手同时出手<br>· <b>白色描边</b>＝护体：只要没漏掉，就算「极致」' },
  flick: { tag: '攻', cls: 'atk', title: '斩 · 蓄势', en: 'HOLD - FLICK', text: '带着一道尖角的朱红方印：方框缩到方印上的那一刻<b>按下</b>蓄势（咚——），按住<b>一拍</b>；外圈墨线走满的那一刻，顺着尖角的方向<b>甩出去</b>（唰）——剑光随手而出，在墨尊身上留下一道墨痕。', steps: '· 甩出时松不松手都可以<br>· 起手与甩出各判一次，甩出的时机比较宽松' }
};
const BANNERS = { 1: ['试剑', '先识攻守'], 2: ['交锋', '双手并用 · 攻守相生'], 3: ['决战', '墨尊暴怒 · 一剑问天'] };

// ───────── 布局 ─────────
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  world.resize(W, H); overlay.resize(W, H, Math.min(window.devicePixelRatio || 1, 2));
  if (game) game.engine.aspect = W / H;
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200)); resize(); world.warmup();

// ───────── 开始 / 结束 ─────────
function startGame({ startBeat = 0, bot = false } = {}) {
  if (!MUTE) { sfx.init(); sfx.resume(); } snd('killLoops');
  world.reset(); world.mode = 'play'; overlay.clear();
  const chart = buildChart(startBeat);
  const engine = new Engine(chart, { aspect: W / H, emit: onEvent });
  const t0 = startBeat * BEAT - (startBeat ? 0.5 : 1.0);
  game = { chart, engine, bot: bot ? new Bot(chart.notes) : null, ev: 0, nextBeat: Math.ceil(t0 / BEAT), ended: false, startBeat, charges: new Map(), hud: {} };
  if (startBeat >= 158) world.moodTarget = 1;
  for (const id of ['title', 'result', 'pause', 'lesson']) $(id).classList.add('hidden');
  $('top').classList.remove('hidden'); $('demoTag').classList.toggle('hidden', !bot);
  $('hpfill').style.width = $('hpghost').style.width = '100%';
  clock.start(t0);
}
function toTitle() {
  game = null; clock.running = false; snd('killLoops'); world.reset(); world.mode = 'title'; world.tw = null; overlay.clear(); overlay.g.clearRect(0, 0, 9999, 9999);
  for (const id of ['result', 'pause', 'lesson', 'top', 'demoTag']) $(id).classList.add('hidden');
  $('title').classList.remove('hidden');
}
function finish() {
  const e = game.engine; game.ended = true; snd('killLoops');
  const win = e.bossHp <= 0.25;
  if (win) { world.death(); $('hpfill').style.width = $('hpghost').style.width = '0%'; } else world.escape();
  snd('finale', win);
  game.resultAt = pnow() + (win ? 4200 : 2400); game.win = win;
}
function showResult(win) {
  if (!game || !game.ended) return;
  const e = game.engine, a = e.achievement, c = e.stats.counts;
  const rank = a >= 100.5 ? 'SSS+' : a >= 100 ? 'SSS' : a >= 99 ? 'SS' : a >= 97 ? 'S' : a >= 94 ? 'AAA' : a >= 90 ? 'AA' : a >= 80 ? 'A' : a >= 60 ? 'B' : 'C';
  $('rTitle').textContent = win ? '斩落墨尊' : '墨尊遁去'; $('rTitle').className = win ? 'win' : 'lose';
  $('rank').textContent = rank; $('racc').innerHTML = `${a.toFixed(4)}%<small>达成</small>`;
  $('rgrid').innerHTML = ['极致', '完美', '良好', '尚可', '失误'].map((n, i) => `<div><b>${c[i]}</b>${n}</div>`).join('');
  $('rmeta').textContent = `最大连斩 ${e.stats.maxCombo} / ${e.totalJudge}　·　偏快 ${e.stats.early}　偏慢 ${e.stats.late}　·　墨尊余势 ${(e.bossHp * 100).toFixed(0)}%` + (win ? '' : '（需削减到 25% 以下）');
  $('result').classList.remove('hidden'); $('top').classList.add('hidden'); snd('ui');
  if (Q.get('loop') && game.bot) setTimeout(() => startGame({ startBeat: game.startBeat, bot: true }), 5000);
}

// ───────── 引擎事件 → 音效 / 动作 / 界面 ─────────
function hurt() { world.hurt(); snd('hurt'); const v = $('vignette'); v.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => v.classList.remove('on'))); }
function stopCharge(n) { const s = game.charges.get(n.id); if (s) { s(); game.charges.delete(n.id); } world.chargeEnd(n); }
function onEvent(e) {
  const n = e.note;
  switch (e.type) {
    case 'judge': {
      const miss = e.grade === G.MISS;
      overlay.pop(n, e.grade, e.dt, e.part);
      if (e.part === 'touch') { if (miss) hurt(); else { world.touchHit(n, e.grade); snd('slash'); } }
      else if (e.part === 'hold') { snd('loop', 'n' + n.id, null, false); if (miss) hurt(); else if (n.bagua) { world.baguaBurst(n); snd('burst'); } }
      else if (e.part === 'drag') { snd('loop', 'n' + n.id, null, false); if (miss) hurt(); else snd('pluck', 880, 0.1, 0, 0.5); }
      else if (e.part === 'tap') { if (miss) snd('whiff'); else { world.tapHit(n, e.grade); snd('thrust', e.grade === 0); } }
      else if (e.part === 'head') { if (miss) snd('whiff'); }
      else if (e.part === 'flick') { stopCharge(n); if (miss) snd('whiff'); else { world.flickRelease(n, e.grade); snd('wave'); } }
      if (!miss) { const hp = game.engine.bossHp * 100; $('hpfill').style.width = $('hpghost').style.width = hp + '%'; }
      break;
    }
    case 'cover': snd('loop', 'n' + n.id, n.kind === 'drag' || n.bagua ? 'drag' : 'grind', e.on); if (e.on) { const s = world.shields.get(n.id); if (s) s.pop = 1; if (n.kind === 'hold' && !n.s.blocked) { n.s.blocked = true; world.holdHead(n); snd('clang'); } } break;
    case 'charge': world.chargeStart(n); if (sfx.ok) game.charges.set(n.id, sfx.chargeStart()); break;
  }
}

// ───────── 教学暂停 / 横幅 ─────────
function banner(act) {
  const b = $('banner'), [t, s] = BANNERS[act]; b.querySelector('.t').textContent = t; b.querySelector('.s').textContent = s;
  b.className = act === 3 ? 'rage' : ''; void b.offsetWidth; b.classList.add('show');
  if (act === 3) { world.enrage(); snd('roar'); }
}
function drawLessonDemo(key) {   // 教学示意：和游戏里一样的墨滴
  const c = $('lsDemo'), g = c.getContext('2d'), Hd = c.height, R = 44, INK = '#17171a', RED = '#c22e1c', y = Hd / 2; g.clearRect(0, 0, c.width, Hd); g.lineCap = 'round'; g.lineJoin = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const k = R / 76 * 256, drop = (kind, x, yy) => g.drawImage(overlay.S[kind][0], x - k / 2, yy - k / 2, k, k);
  const ring = (x, yy, r, col, w = 6) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, yy, r, 0.4, 6.4); g.stroke(); };
  const box = (x, yy, h, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'miter'; g.strokeRect(x - h, yy - h, h * 2, h * 2); g.lineJoin = 'round'; };
  const finger = (x, yy) => { g.fillStyle = 'rgba(23,23,26,.8)'; g.beginPath(); g.arc(x, yy, 15, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); };
  const arrow = (x0, y0, x1, y1) => { const a = Math.atan2(y1 - y0, x1 - x0); g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.moveTo(x1 - 18 * Math.cos(a - 0.5), y1 - 18 * Math.sin(a - 0.5)); g.lineTo(x1, y1); g.lineTo(x1 - 18 * Math.cos(a + 0.5), y1 - 18 * Math.sin(a + 0.5)); g.stroke(); };
  const label = (t, x, yy) => { g.fillStyle = INK; g.font = '700 26px "Kaiti SC","STKaiti","KaiTi",serif'; g.fillText(t, x, yy); };
  if (key === 'none') { }
  else if (key === 'hold') { g.drawImage(overlay.S.bagua, 300 - R * 1.45, y - R * 1.45, R * 2.9, R * 2.9); g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.arc(300, y, R * 1.9, -1.57, 3.0); g.stroke(); finger(300, y); label('按住，直到外圈走完', 550, y); }
  else if (key === 'drag') { g.strokeStyle = 'rgba(23,23,26,.3)'; g.lineWidth = 84; g.beginPath(); g.moveTo(110, y + 50); g.quadraticCurveTo(380, y - 130, 650, y + 50); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 74; g.stroke(); g.drawImage(overlay.S.bagua, 250 - R * 1.1, y - 22 - R * 1.1, R * 2.2, R * 2.2); finger(250, y - 22); arrow(330, y - 62, 450, y - 76); }
  else if (key === 'tap') {
    const X = (x, lit) => overlay.stampX(g, 0, x, y - 16, R, lit, 1);
    X(130, 0.45); X(310, 1); X(490, 0); ring(490, y - 16, R * 1.55, '#c9a227'); X(660, 0); ring(660, y - 16, R * 1.55, INK, 9); ring(660, y - 16, R * 1.55, '#fff', 6);
    label('白光往中心收', 130, y + 92); label('收满：按！', 310, y + 92); label('金边：双押', 490, y + 92); label('白边：护体', 660, y + 92);
  }
  else { g.fillStyle = RED; g.save(); g.translate(240, y + 16); g.rotate(-0.35); g.beginPath(); g.moveTo(14, -24); g.quadraticCurveTo(90, -18, 170, 0); g.quadraticCurveTo(90, 14, 14, 24); g.closePath(); g.fill(); g.restore(); drop('red', 240, y + 16); g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.arc(240, y + 16, R * 1.5, -1.57, 2.6); g.stroke(); finger(240, y + 16); arrow(420, y - 44, 560, y - 96); label('① 按住一拍', 250, y + 116); label('② 顺着尖角甩出', 560, y - 126); }
}
function openLesson(key) {
  const L = LESSONS[key]; game.lesson = key;
  $('lsTag').textContent = L.tag; $('lsTag').className = 'tag ' + L.cls; $('lsTitle').textContent = L.title; $('lsEn').textContent = L.en; $('lsText').innerHTML = L.text; $('lsSteps').innerHTML = L.steps; drawLessonDemo(key);
  $('lesson').classList.remove('hidden'); snd('ui');
  game.lessonAt = pnow();
}
function closeLesson() {
  if (!game || !game.lesson) return; game.lesson = null; $('lesson').classList.add('hidden'); snd('ui');
  game.nextBeat = Math.floor(clock.now() / BEAT + 1e-6) + 1; clock.resume();
}

// ───────── 暂停 ─────────
function pauseGame() { if (!game || game.ended || game.lesson || !clock.running) return; clock.pause(); snd('killLoops'); $('pause').classList.remove('hidden'); game.paused = true; }
function resumeGame() {
  $('pause').classList.add('hidden'); const c = $('count'), g = game; let k = 3; c.classList.remove('hidden'); c.textContent = k; snd('ui');
  const iv = setInterval(() => {
    if (game !== g) { clearInterval(iv); c.classList.add('hidden'); return; }
    if (--k > 0) { c.textContent = k; snd('ui'); } else { clearInterval(iv); c.classList.add('hidden'); g.paused = false; g.nextBeat = Math.floor(clock.now() / BEAT + 1e-6) + 1; clock.resume(); }
  }, 500);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && !Q.get('auto')) pauseGame(); });

// ───────── 输入 ─────────
const hud = $('hud');
const evTime = e => { if (vperf !== null) return clock.now(); const p = performance.now(), ts = e.timeStamp; return clock.now(ts > 0 && Math.abs(ts - p) < 250 ? ts : p) - offsetMs / 1000; };
const live = () => game && !game.bot && !game.ended;
hud.addEventListener('pointerdown', e => { e.preventDefault(); if (sfx.ctx) sfx.resume(); if (live() && clock.running) game.engine.down(e.pointerId, e.clientX / W, e.clientY / H, evTime(e)); });
hud.addEventListener('pointermove', e => {
  if (!live() || !clock.running) return;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (list && list.length > 1) for (const c of list) game.engine.move(e.pointerId, c.clientX / W, c.clientY / H, evTime(c));
  else game.engine.move(e.pointerId, e.clientX / W, e.clientY / H, evTime(e));
});
const up = e => { if (live()) game.engine.up(e.pointerId, evTime(e)); };
hud.addEventListener('pointerup', up); hud.addEventListener('pointercancel', up);
for (const t of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'contextmenu', 'dblclick', 'selectstart']) document.addEventListener(t, e => { if (!(e.target instanceof HTMLButtonElement)) e.preventDefault(); }, { passive: false });

// ───────── 按钮 ─────────
const on = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); fn(); });
on('btnStart', () => startGame({ startBeat: FIRST_BEAT })); on('btnSkip', () => startGame({ startBeat: ACT2_BEAT - 2 })); on('btnDemo', () => startGame({ startBeat: ACT2_BEAT - 2, bot: true }));
on('lsGo', closeLesson); on('btnPause', pauseGame); on('btnResume', resumeGame);
on('btnRestart', () => startGame({ startBeat: game.startBeat, bot: !!game.bot })); on('btnRetry', () => startGame({ startBeat: game.startBeat, bot: !!game.bot }));
on('btnQuit', toTitle); on('btnHome', toTitle);
const showOffset = () => { $('offVal').textContent = (offsetMs > 0 ? '+' : '') + offsetMs + ' ms'; localStorage.setItem('tqjl.offset', offsetMs); };
on('offDn', () => { offsetMs = Math.max(-200, offsetMs - 5); showOffset(); }); on('offUp', () => { offsetMs = Math.min(200, offsetMs + 5); showOffset(); }); showOffset();

// ───────── 主循环 ─────────
function frame(perf) {
  const dtMs = Math.min(100, perf - lastPerf), dt = dtMs / 1000; lastPerf = perf;
  let t = 0;
  if (game) {
    const { engine, chart } = game; t = clock.now(perf);
    if (game.lesson && game.bot && !Q.get('hold') && perf - game.lessonAt > 1600) closeLesson();
    if (game.resultAt && perf >= game.resultAt) { game.resultAt = 0; showResult(game.win); }
    if (clock.running) {
      while (game.ev < chart.events.length && chart.events[game.ev].t <= t) {
        const ev = chart.events[game.ev++];
        if (ev.type === 'banner') banner(ev.act);
        else if (ev.type === 'lesson') { clock.pause(ev.t); t = ev.t; openLesson(ev.key); break; }
      }
      if (FREEZE && t >= FREEZE * BEAT && clock.running) { clock.pause(FREEZE * BEAT); t = clock.now(); }
      // 节拍器：提前 150ms 在音频时钟上排程
      while (game.nextBeat * BEAT < t + 0.15 && !game.ended) {
        const bt = game.nextBeat * BEAT;
        if (sfx.ok && bt > t - 0.03 && clock.running) sfx.click(sfx.ctx.currentTime + (bt - t) - sfx.latency, ((game.nextBeat % 4) + 4) % 4 === 0);
        game.nextBeat++;
      }
      if (clock.running) {
        if (game.bot) { for (let ts = Math.max(game.lastT || t, t - 1) + 0.012; ts < t; ts += 0.012) { game.bot.step(ts, engine); engine.update(ts); } game.bot.step(t, engine); }  // 掉帧时子步进，保证演示稳定
        engine.update(t); game.lastT = t;
      }
      if (!game.ended && engine.finished && t > chart.endTime + 0.35) finish();
    }
    world.syncNotes(chart.notes, engine.first, t, dt);
    // HUD
    const h = game.hud, acc = engine.achievement.toFixed(4) + '%', combo = engine.stats.combo;
    if (h.acc !== acc) $('acc').textContent = h.acc = acc;
    if (h.combo !== combo) { h.combo = combo; $('combo').textContent = combo; const cb = $('comboBox'); cb.style.opacity = combo >= 2 ? 1 : 0; cb.classList.remove('pulse'); void cb.offsetWidth; cb.classList.add('pulse'); }
  }
  world.update(dt, t); if (!skipRender) world.render(dtMs);
  if (game) overlay.draw(game.chart.notes, game.engine.first, t, dt, game.engine.touches, !!game.bot);
}
function loop(perf) { requestAnimationFrame(loop); if (vperf === null) frame(perf); }
requestAnimationFrame(loop);

// 调试 / 自动化测试入口： ?auto=1&start=162&hold=1&loop=1
window.__game = { get state() { return game ? { t: clock.now(), beat: clock.now() / BEAT, running: clock.running, ended: game.ended, lesson: game.lesson, stats: game.engine.stats, total: game.engine.totalJudge, acc: game.engine.achievement, hp: game.engine.bossHp, fps: 1000 / world.frameAvg, pr: world.pixelRatio } : null; }, start: startGame, world, clock,
  // 以虚拟时钟同步推进 sec 秒（render=false 时只跑逻辑，用于快进）
  advance(sec, render = true, fps = 60) { if (vperf === null) { vperf = performance.now(); lastPerf = vperf; clock.anchorPerf = vperf; } skipRender = !render; const n = Math.round(sec * fps); for (let i = 0; i < n; i++) { vperf += 1000 / fps; frame(vperf); } skipRender = false; return JSON.stringify(this.state); } };
if (Q.get('auto')) setTimeout(() => startGame({ startBeat: +(Q.get('start') || 0), bot: Q.get('bot') !== '0' }), 600);
