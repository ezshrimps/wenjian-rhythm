// 音效全部用 WebAudio 实时合成，取东方打击乐与弹拨乐的音色：
// 木鱼（节拍器）、磬、古筝拨弦、大鼓、锣、剑鸣。
const PENTA = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77, 1174.66];   // D 宫五声
export class Sfx {
  constructor() { this.ctx = null; this.loops = new Map(); }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext, c = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = c.createGain(); this.master.gain.value = 0.85;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
    this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  get ok() { return this.ctx && this.ctx.state === 'running'; }
  get latency() { const c = this.ctx; return c ? Math.min(0.08, c.outputLatency || c.baseLatency || 0) : 0; }

  tone(f0, dur, { type = 'sine', vol = 0.2, f1 = null, t = 0, attack = 0.002, bend = 0 } = {}) {
    const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0 * (1 + bend), t0); if (bend) o.frequency.exponentialRampToValueAtTime(f0, t0 + 0.05);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise(dur, { vol = 0.3, type = 'bandpass', f0 = 2000, f1 = null, q = 1, t = 0, attack = 0.002 } = {}) {
    const c = this.ctx, t0 = c.currentTime + t, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }
  pluck(f, vol = 0.2, t = 0, dur = 0.9) {   // 古筝：拨弦带一点下滑音
    this.tone(f, dur, { type: 'triangle', vol, t, bend: 0.035 }); this.tone(f * 2, dur * 0.5, { vol: vol * 0.35, t, bend: 0.035 }); this.tone(f * 3.01, dur * 0.25, { vol: vol * 0.15, t });
    this.noise(0.02, { vol: vol * 0.5, type: 'highpass', f0: 3000, t });
  }
  drum(vol = 0.7, t = 0, f = 95) { this.tone(f, 0.4, { vol, f1: f * 0.45, t }); this.tone(f * 1.5, 0.12, { vol: vol * 0.4, f1: f * 0.8, t }); this.noise(0.09, { vol: vol * 0.5, type: 'lowpass', f0: 900, f1: 200, t }); }
  gong(vol = 0.2, t = 0, f = 196) { for (const [k, v, d] of [[1, 1, 1.6], [1.5, 0.6, 1.3], [2.11, 0.5, 1.1], [2.96, 0.35, 0.9], [4.1, 0.2, 0.6]]) this.tone(f * k, d, { vol: vol * v, t, attack: 0.006 }); this.noise(0.5, { vol: vol * 0.8, type: 'bandpass', f0: 2600, f1: 900, q: 0.7, t }); }
  ring(f, vol, dur = 0.3, t = 0) { this.tone(f, dur, { vol, t }); this.tone(f * 1.52, dur * 0.8, { vol: vol * 0.6, t }); this.tone(f * 2.3, dur * 0.6, { vol: vol * 0.4, type: 'triangle', t }); }   // 剑鸣「铮」

  // 节拍器：木鱼；每小节第一拍加一声磬
  click(when, accent) {
    const c = this.ctx, t0 = Math.max(c.currentTime, when), o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(accent ? 880 : 660, t0); o.frequency.exponentialRampToValueAtTime(accent ? 700 : 520, t0 + 0.06);
    f.type = 'bandpass'; f.frequency.value = accent ? 820 : 620; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.34, t0 + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.11);
    if (accent) { const o2 = c.createOscillator(), g2 = c.createGain(); o2.frequency.value = 2349; g2.gain.setValueAtTime(0.0001, t0); g2.gain.exponentialRampToValueAtTime(0.05, t0 + 0.002); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5); o2.connect(g2); g2.connect(this.master); o2.start(t0); o2.stop(t0 + 0.52); }
  }
  slash() { this.noise(0.11, { vol: 0.3, f0: 8000, f1: 1800, q: 1.2 }); this.ring(2640, 0.07, 0.26); this.noise(0.14, { vol: 0.18, type: 'lowpass', f0: 1200, f1: 200, t: 0.01 }); }   // 剑斩墨火
  clang() { this.drum(0.8); this.ring(1320, 0.09, 0.5); this.noise(0.07, { vol: 0.35, type: 'highpass', f0: 2500 }); }                                                           // 盾挡巨剑：鼓 + 金铁
  thrust(crit) { this.noise(0.07, { vol: 0.28, f0: 2400, f1: 9000, q: 2 }); this.drum(0.55, 0, 150); this.ring(crit ? 3136 : 2349, crit ? 0.1 : 0.07, 0.3); if (crit) this.pluck(PENTA[8], 0.07, 0.02, 0.5); }
  // HOLD-FLICK 只有两声：按下时一声带余韵的「咚~」，甩出时一声「唰」
  chargeStart() { this.tone(104, 0.62, { vol: 0.85, f1: 58 }); this.tone(208, 0.16, { vol: 0.3, f1: 110 }); this.tone(78, 0.55, { vol: 0.28, attack: 0.03 }); this.noise(0.06, { vol: 0.35, type: 'lowpass', f0: 700, f1: 180 }); return () => { }; }
  wave() { this.noise(0.2, { vol: 0.6, f0: 1100, f1: 9500, q: 0.9 }); this.noise(0.24, { vol: 0.3, type: 'highpass', f0: 3500, f1: 9000, attack: 0.03 }); this.noise(0.1, { vol: 0.22, f0: 400, f1: 1600, q: 0.6 }); this.tone(3520, 0.2, { vol: 0.03, f1: 4700 }); }
  burst() { this.drum(1, 0, 62); this.gong(0.32, 0, 98); this.noise(1.1, { vol: 0.5, type: 'lowpass', f0: 4500, f1: 110 }); this.pluck(PENTA[0] / 2, 0.16, 0.05, 1.4); }   // 八卦阵爆散
  hurt() { this.drum(0.6, 0, 70); this.pluck(PENTA[0] / 2 * 1.06, 0.12, 0, 0.4); this.noise(0.2, { vol: 0.3, type: 'lowpass', f0: 600, f1: 120 }); }
  whiff() { this.noise(0.12, { vol: 0.07, f0: 900, f1: 400, q: 0.7 }); }
  ui() { this.pluck(PENTA[5], 0.13, 0, 0.6); this.pluck(PENTA[7], 0.09, 0.07, 0.6); }
  roar() { for (let i = 0; i < 8; i++) this.drum(0.35 + i * 0.07, i * 0.11 * (1 - i * 0.04), 60); this.gong(0.28, 0.75, 110); this.noise(1.6, { vol: 0.3, type: 'lowpass', f0: 300, f1: 2400, attack: 0.3 }); }
  finale(win) {
    if (win) { this.drum(1, 0, 60); this.gong(0.3, 0, 98); this.noise(2.0, { vol: 0.4, type: 'lowpass', f0: 5000, f1: 100 }); [0, 2, 3, 5, 7, 8, 10].forEach((k, i) => this.pluck(PENTA[k], 0.13, 1.0 + i * 0.13, 1.6)); this.gong(0.14, 2.0, 293.66); }
    else [7, 5, 3, 2, 0].forEach((k, i) => this.pluck(PENTA[k] / 2, 0.14, i * 0.28, 1.2));
  }
  // 持续音：drag（箫一样的长音：纯净的五度叠音 + 一点气声）/ grind（巨剑压盾的摩擦）
  loop(key, kind, on) {
    const c = this.ctx; let L = this.loops.get(key);
    if (on && !L) {
      const g = c.createGain(), t0 = c.currentTime; g.gain.setValueAtTime(0.0001, t0); g.connect(this.master); const nodes = [];
      if (kind === 'drag') {
        const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.2; vg.gain.value = 3.2; vib.connect(vg); vib.start(); nodes.push(vib);
        for (const [fr, v] of [[293.66, 1], [440, 0.42], [587.33, 0.2], [880, 0.07]]) { const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = fr; og.gain.value = v; vg.connect(o.frequency); o.connect(og); og.connect(g); o.start(); nodes.push(o); }
        const sn = c.createBufferSource(), f = c.createBiquadFilter(), ng = c.createGain(); sn.buffer = this.noiseBuf; sn.loop = true; f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 1.4; ng.gain.value = 0.16; sn.connect(f); f.connect(ng); ng.connect(g); sn.start(); nodes.push(sn);
        g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.09);
      } else {
        const sn = c.createBufferSource(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain(); sn.buffer = this.noiseBuf; sn.loop = true; f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 3; lfo.type = 'square'; lfo.frequency.value = 27; lg.gain.value = 1500;
        lfo.connect(lg); lg.connect(f.frequency); sn.connect(f); f.connect(g); sn.start(); lfo.start(); nodes.push(sn, lfo); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.04);
      }
      this.loops.set(key, { g, nodes });
    } else if (!on && L) {
      const t = c.currentTime; L.g.gain.cancelScheduledValues(t); L.g.gain.setValueAtTime(Math.max(L.g.gain.value, 0.0001), t); L.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); L.nodes.forEach(n => n.stop(t + 0.15)); this.loops.delete(key);
    }
  }
  killLoops() { for (const k of [...this.loops.keys()]) this.loop(k, null, false); }
}
