// Tank Survivors - sounds and music, all synthesized with Web Audio (no files, works offline).
(function (root) {
  'use strict';

  let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
  let engOsc = null, engGain = null, engOsc2 = null;
  let mode = 'off', timer = null, nextTime = 0, step = 0, active = 0;
  const last = {};
  const S = root.Save;

  const midi = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = S.data.sfx ? 1 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = S.data.music ? 0.3 : 0; musBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engine hum: two detuned saws through a lowpass
    engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 42;
    engOsc2 = ctx.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 21;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    engGain = ctx.createGain(); engGain.gain.value = 0;
    engOsc.connect(lp); engOsc2.connect(lp); lp.connect(engGain); engGain.connect(sfxBus);
    engOsc.start(); engOsc2.start();
    if (mode !== 'off' && !timer) { nextTime = ctx.currentTime + 0.05; step = 0; timer = setInterval(scheduleMusic, 80); }
    return true;
  }

  function tone(o) {
    const t = o.t !== undefined ? o.t : ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    let out = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); out = f; }
    out.connect(o.dest || sfxBus);
    osc.start(t); osc.stop(t + o.dur + 0.05);
    return osc;
  }
  function noise(o) {
    const t = o.t !== undefined ? o.t : ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.ftype || 'lowpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.05);
  }

  // name -> [min gap seconds, fn]
  const SFX = {
    shoot: [0.05, function () { tone({ type: 'square', f0: 260, f1: 90, dur: 0.1, gain: 0.12, lp: 1400 }); noise({ f0: 2200, f1: 500, dur: 0.06, gain: 0.08 }); }],
    side: [0.07, function () { tone({ type: 'triangle', f0: 420, f1: 180, dur: 0.07, gain: 0.07 }); }],
    rocket: [0.1, function () { noise({ f0: 1200, f1: 300, dur: 0.3, gain: 0.12 }); tone({ type: 'sawtooth', f0: 180, f1: 420, dur: 0.25, gain: 0.05, lp: 900 }); }],
    hit: [0.04, function () { tone({ type: 'square', f0: 700, f1: 380, dur: 0.035, gain: 0.04 }); }],
    kill: [0.045, function () { tone({ type: 'sine', f0: 380, f1: 120, dur: 0.12, gain: 0.1 }); noise({ f0: 900, f1: 200, dur: 0.1, gain: 0.07 }); }],
    ram: [0.08, function () { tone({ type: 'sine', f0: 130, f1: 55, dur: 0.12, gain: 0.2 }); }],
    boom: [0.08, function () { noise({ f0: 1400, f1: 90, dur: 0.35, gain: 0.22 }); tone({ type: 'sine', f0: 110, f1: 40, dur: 0.3, gain: 0.25 }); }],
    hurt: [0.1, function () { tone({ type: 'sawtooth', f0: 220, f1: 70, dur: 0.22, gain: 0.2, lp: 900 }); noise({ f0: 700, f1: 120, dur: 0.18, gain: 0.14 }); }],
    coin: [0.035, function () { tone({ type: 'triangle', f0: 1200 + Math.random() * 200, f1: 1700, dur: 0.07, gain: 0.05 }); }],
    crate: [0.1, function () { [72, 76, 79].forEach(function (n, i) { tone({ type: 'triangle', f0: midi(n), dur: 0.14, gain: 0.12, t: ctx.currentTime + i * 0.06 }); }); }],
    evolve: [0.3, function () { [60, 64, 67, 72, 76, 79, 84].forEach(function (n, i) { tone({ type: 'square', f0: midi(n), dur: 0.2, gain: 0.08, lp: 3000, t: ctx.currentTime + i * 0.07 }); }); noise({ f0: 400, f1: 4000, dur: 0.5, gain: 0.06 }); }],
    shock: [0.2, function () { noise({ f0: 3000, f1: 80, dur: 0.5, gain: 0.25 }); tone({ type: 'sine', f0: 160, f1: 30, dur: 0.5, gain: 0.3 }); }],
    boss: [0.5, function () { [0, 0.35, 0.7].forEach(function (d) { tone({ type: 'sawtooth', f0: 98, f1: 90, dur: 0.32, gain: 0.2, lp: 500, t: ctx.currentTime + d }); }); }],
    windup: [0.3, function () { tone({ type: 'sawtooth', f0: 90, f1: 330, dur: 0.8, gain: 0.1, lp: 800 }); }],
    bossshot: [0.15, function () { tone({ type: 'square', f0: 200, f1: 70, dur: 0.2, gain: 0.1, lp: 900 }); }],
    repair: [0.5, function () { [67, 71, 74].forEach(function (n, i) { tone({ type: 'sine', f0: midi(n), dur: 0.25, gain: 0.1, t: ctx.currentTime + i * 0.08 }); }); }],
    click: [0.05, function () { tone({ type: 'square', f0: 520, f1: 780, dur: 0.05, gain: 0.07 }); }],
    buy: [0.1, function () { tone({ type: 'triangle', f0: 600, f1: 1200, dur: 0.12, gain: 0.1 }); }],
    win: [1, function () { [60, 64, 67, 72, 67, 72, 76, 84].forEach(function (n, i) { tone({ type: 'square', f0: midi(n), dur: 0.22, gain: 0.1, lp: 3000, t: ctx.currentTime + i * 0.12 }); }); }],
    lose: [1, function () { [67, 63, 58, 55].forEach(function (n, i) { tone({ type: 'sawtooth', f0: midi(n), dur: 0.35, gain: 0.1, lp: 800, t: ctx.currentTime + i * 0.2 }); }); }]
  };

  function play(name) {
    if (!ctx || !S.data.sfx) return;
    const d = SFX[name]; if (!d) return;
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < d[0]) return;
    if (active > 14) return;
    last[name] = now; active++;
    try { d[1](); } catch (e) { /* ignore */ }
    setTimeout(function () { active = Math.max(0, active - 1); }, 220);
  }

  // ---------- music: small procedural loop ----------
  const BASS = [38, 38, 41, 38, 43, 43, 41, 36];
  const ARP = [0, 7, 12, 7, 3, 10, 15, 10];
  function scheduleMusic() {
    if (!ctx || mode === 'off') return;
    const bpm = mode === 'boss' ? 150 : mode === 'play' ? 128 : 92, spb = 60 / bpm / 2;
    while (nextTime < ctx.currentTime + 0.25) {
      const t = nextTime, b = BASS[(step >> 2) % BASS.length];
      if (step % 4 === 0) tone({ type: 'sawtooth', f0: midi(b), dur: spb * 3.5, gain: 0.16, lp: 420, dest: musBus, t: t });
      if (mode !== 'menu' && step % 2 === 0) noise({ f0: 6000, f1: 3000, dur: 0.03, gain: 0.05, ftype: 'highpass', dest: musBus, t: t });
      if (mode !== 'menu' && step % 8 === 0) tone({ type: 'sine', f0: 120, f1: 45, dur: 0.14, gain: 0.3, dest: musBus, t: t });
      const root = mode === 'boss' ? b + 12 : b + 24;
      if (mode !== 'menu' || step % 2 === 0) tone({ type: 'square', f0: midi(root + ARP[step % ARP.length] + (mode === 'boss' ? 0 : 0)), dur: spb * 0.8, gain: 0.05, lp: 1800, dest: musBus, t: t });
      nextTime += spb; step++;
    }
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    if (!ctx) return;
    if (m === 'off') { if (timer) { clearInterval(timer); timer = null; } return; }
    if (!timer) { nextTime = ctx.currentTime + 0.05; step = 0; timer = setInterval(scheduleMusic, 80); }
  }

  root.Sound = {
    init: init, play: play, setMode: setMode,
    engine: function (frac) {
      if (!ctx || !engGain) return;
      const t = ctx.currentTime;
      engGain.gain.setTargetAtTime(S.data.sfx ? 0.05 + frac * 0.07 : 0, t, 0.1);
      engOsc.frequency.setTargetAtTime(38 + frac * 36, t, 0.15);
      engOsc2.frequency.setTargetAtTime(19 + frac * 18, t, 0.15);
    },
    engineOff: function () { if (ctx && engGain) engGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
    applySettings: function () {
      if (!ctx) return;
      sfxBus.gain.value = S.data.sfx ? 1 : 0;
      musBus.gain.value = S.data.music ? 0.3 : 0;
    },
    vibrate: function (ms) { if (S.data.vib && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
