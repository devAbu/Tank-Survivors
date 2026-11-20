// Tank Survivors - rendering, input and screens. Everything is drawn with canvas shapes (no image files).
(function () {
  'use strict';
  const T = window.TXT, CFG = window.CFG, Core = window.Core, Save = window.Save, Ad = window.AdService, Snd = window.Sound;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2, VW = 360;
  let VH = 740, S = 0;
  let scene = 'menu', paused = false;
  let G = null, res = null;           // game state, run result
  let cam = { x: 0, y: 0 }, shake = 0, hurtFlash = 0, bossFlash = 0;
  let tab = 'paint', now = 0, uiT = 0;
  let stick = null, aim = { jx: 0, jy: 0 };
  let btns = [];
  let banner = null;
  const pulse = {};                   // part key -> pulse timer
  let hint = { on: false, t: 0 };

  const PCOL = { turret: '#ffcf5a', sideL: '#ff9a4a', sideR: '#ff9a4a', engine: '#5ad1ff', treads: '#ff6a3a', armor: '#8aa3ff', radar: '#5aff9a', repair: '#ff6a8a' };

  // ---------- canvas sizing ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    VH = Math.max(600, Math.min(860, VW * ch / cw));
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const ns = cv.width / VW;
    if (Math.abs(ns - S) > 0.01) { S = ns; buildSprites(); buildGround(); }
    S = ns;
  }

  // ---------- small helpers ----------
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function text(str, x, y, size, col, align, stroke) {
    ctx.font = 'bold ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (stroke !== false) { ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = col || '#fff'; ctx.fillText(str, x, y);
  }
  function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function coinIcon(x, y, r) {
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff1a8'; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.3, 0, TAU); ctx.fill();
  }
  function button(x, y, w, h, label, o, fn) {
    o = o || {};
    const dis = !!o.disabled;
    const c1 = dis ? '#3a424d' : (o.c1 || '#4fae5d'), c2 = dis ? '#2b323b' : (o.c2 || '#2f7d3d');
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, x, y + 3, w, h, 12); ctx.fill();
    ctx.fillStyle = c2; rr(ctx, x, y, w, h, 12); ctx.fill();
    ctx.fillStyle = c1; rr(ctx, x, y, w, h - 4, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, x + 4, y + 3, w - 8, (h - 4) * 0.4, 8); ctx.fill();
    text(label, x + w / 2, y + (h - 4) / 2 + (o.sub ? -6 : 1), o.size || 20, dis ? '#8a94a0' : '#fff');
    if (o.sub) text(o.sub, x + w / 2, y + h - 14, 11, dis ? '#76808c' : 'rgba(255,255,255,0.85)', 'center', false);
    if (fn && !dis) btns.push({ x: x, y: y, w: w, h: h, fn: fn });
  }
  function adLabel(p, base) {
    const st = Ad.state(p);
    if (st.status === 'ready') return { label: base, sub: T.adReady, disabled: false };
    if (st.status === 'playing') return { label: T.adWatching + (st.left ? ' ' + st.left : '...'), sub: '', disabled: true };
    return { label: T.adCooldown + ' ' + st.left + 's', sub: '', disabled: true };
  }
  function toast(title, sub, col, dur) { banner = { title: title, sub: sub, col: col || '#fff', t: dur || 2.4, max: dur || 2.4 }; }

  // ---------- sprites (pre-rendered once per scale) ----------
  let SPR = {}, groundPat = null, groundCv = null;
  function mkSprite(w, h, fn, frame) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
    const x = c.getContext('2d'); x.scale(S, S); x.translate(w / 2, h / 2); fn(x, frame);
    return c;
  }
  function flashOf(c) {
    const f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    const x = f.getContext('2d'); x.drawImage(c, 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(0, 0, f.width, f.height);
    return f;
  }
  function legs(x, n, spread, len, f, col, lw, sx) {
    x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = sx + (i - (n - 1) / 2) * spread, sw = ((i + f) % 2 ? 1 : -1) * 2.2;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px + sw, -len); x.stroke();
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px - sw, len); x.stroke();
    }
  }
  function dBeetle(x, f) {
    legs(x, 3, 4.5, 10, f, '#16432f', 1.6, 0);
    x.fillStyle = '#2f9e6a'; x.beginPath(); x.ellipse(-1, 0, 9, 6.5, 0, 0, TAU); x.fill();
    x.fillStyle = '#44c988'; x.beginPath(); x.ellipse(-2, -1.6, 6, 2.6, 0, 0, TAU); x.fill();
    x.strokeStyle = '#1b5e40'; x.lineWidth = 1; x.beginPath(); x.moveTo(-9, 0); x.lineTo(7, 0); x.stroke();
    x.fillStyle = '#1f6b47'; x.beginPath(); x.arc(8.5, 0, 4, 0, TAU); x.fill();
    x.fillStyle = '#ff4d4d'; x.beginPath(); x.arc(10, -1.8, 1.1, 0, TAU); x.arc(10, 1.8, 1.1, 0, TAU); x.fill();
  }
  function dCharger(x, f) {
    legs(x, 3, 5, 12, f, '#5a2d0e', 1.8, -1);
    x.fillStyle = '#d2742a'; x.beginPath(); x.ellipse(-1, 0, 11, 8, 0, 0, TAU); x.fill();
    x.fillStyle = '#f0a05a'; x.beginPath(); x.ellipse(-2, -2.5, 7, 3, 0, 0, TAU); x.fill();
    x.fillStyle = '#8a4414'; x.beginPath(); x.arc(10, 0, 5, 0, TAU); x.fill();
    x.fillStyle = '#ffe2a0';
    x.beginPath(); x.moveTo(9, -4); x.lineTo(19, -7); x.lineTo(13, -1); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(9, 4); x.lineTo(19, 7); x.lineTo(13, 1); x.closePath(); x.fill();
    x.fillStyle = '#ff3030'; x.beginPath(); x.arc(11, -2.2, 1.3, 0, TAU); x.arc(11, 2.2, 1.3, 0, TAU); x.fill();
  }
  function feet(x, f, y, col) {
    x.fillStyle = col; const o = f ? 3 : -3;
    rr(x, -5 + o, -y - 3, 9, 6, 2); x.fill(); rr(x, -5 - o, y - 3, 9, 6, 2); x.fill();
  }
  function dWalker(x, f) {
    feet(x, f, 11, '#4b535e');
    x.fillStyle = '#8a97a6'; rr(x, -10, -10, 20, 20, 5); x.fill();
    x.fillStyle = '#a9b6c4'; rr(x, -8, -8, 16, 6, 3); x.fill();
    x.fillStyle = '#5c6672'; rr(x, -8, 1, 8, 7, 2); x.fill();
    x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(5, 0, 3.4, 0, TAU); x.fill();
    x.fillStyle = '#fff6b0'; x.beginPath(); x.arc(4.4, -0.8, 1.2, 0, TAU); x.fill();
    x.strokeStyle = '#4b535e'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-8, -10); x.lineTo(-10, -15); x.stroke();
  }
  function dShooter(x, f) {
    feet(x, f, 10, '#3f3560');
    x.fillStyle = '#40385e'; rr(x, 3, -2.8, 15, 5.6, 2); x.fill();
    x.fillStyle = '#7a6aa6'; x.beginPath(); x.arc(0, 0, 9.5, 0, TAU); x.fill();
    x.fillStyle = '#9d8fcc'; x.beginPath(); x.arc(-1.5, -2, 6, 0, TAU); x.fill();
    x.fillStyle = '#58f0ff'; x.beginPath(); x.arc(3, 0, 3.2, 0, TAU); x.fill();
  }
  function dBrute(x, f) {
    feet(x, f, 17, '#3d434c');
    x.fillStyle = '#4f5560'; x.beginPath(); x.arc(0, -17, 9, 0, TAU); x.arc(0, 17, 9, 0, TAU); x.fill();
    x.fillStyle = '#6a7280'; rr(x, -14, -15, 28, 30, 7); x.fill();
    x.fillStyle = '#868f9e'; rr(x, -11, -12, 22, 8, 4); x.fill();
    x.strokeStyle = '#3d434c'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-14, 0); x.lineTo(14, 0); x.stroke();
    x.fillStyle = '#ff8a2a'; rr(x, 6, -5, 9, 10, 3); x.fill();
    x.fillStyle = '#ffd08a'; x.beginPath(); x.arc(11, 0, 2.2, 0, TAU); x.fill();
  }
  function dTitan(x, f) {
    feet(x, f, 30, '#30353d');
    x.fillStyle = '#434a55'; x.beginPath(); x.arc(24, -30, 14, 0, TAU); x.arc(24, 30, 14, 0, TAU); x.fill();
    x.fillStyle = '#8a929e'; x.beginPath(); x.arc(28, -31, 7, 0, TAU); x.arc(28, 31, 7, 0, TAU); x.fill();
    x.fillStyle = '#5b6370'; rr(x, -30, -28, 62, 56, 12); x.fill();
    x.fillStyle = '#767f8d'; rr(x, -26, -24, 54, 16, 8); x.fill();
    x.fillStyle = '#4a515c'; rr(x, -26, 4, 26, 20, 6); x.fill();
    x.strokeStyle = '#33383f'; x.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(-30, i * 10); x.lineTo(-38, i * 10); x.stroke(); }
    x.fillStyle = '#ff3a2a'; x.beginPath(); x.arc(14, 0, 12, 0, TAU); x.fill();
    x.fillStyle = '#ff9a7a'; x.beginPath(); x.arc(12, -2, 6, 0, TAU); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(10, -4, 2.2, 0, TAU); x.fill();
  }
  function dHive(x, f) {
    legs(x, 4, 13, 44, f, '#2c421a', 4, -2);
    x.fillStyle = '#3f6322'; x.beginPath(); x.ellipse(-22, 0, 42, 34, 0, 0, TAU); x.fill();
    x.fillStyle = '#5e8f34'; x.beginPath(); x.ellipse(-25, -8, 30, 14, 0, 0, TAU); x.fill();
    x.fillStyle = '#9dff5a';
    [[-32, 8, 7], [-14, -4, 6], [-44, -6, 5], [-26, 18, 5]].forEach(function (p) { x.beginPath(); x.arc(p[0], p[1], p[2], 0, TAU); x.fill(); });
    x.fillStyle = '#6a9c3a'; x.beginPath(); x.arc(20, 0, 20, 0, TAU); x.fill();
    x.fillStyle = '#8bc254'; x.beginPath(); x.arc(15, -5, 11, 0, TAU); x.fill();
    x.fillStyle = '#ffe9a8';
    x.beginPath(); x.moveTo(30, -10); x.quadraticCurveTo(58, -22, 52, 4); x.quadraticCurveTo(46, -8, 34, -2); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(30, 10); x.quadraticCurveTo(58, 22, 52, -4); x.quadraticCurveTo(46, 8, 34, 2); x.closePath(); x.fill();
    x.fillStyle = '#ff3030'; x.beginPath(); x.arc(30, -9, 3.6, 0, TAU); x.arc(30, 9, 3.6, 0, TAU); x.fill();
  }
  function buildSprites() {
    const defs = { beetle: [26, 26, dBeetle], charger: [38, 38, dCharger], walker: [36, 36, dWalker], shooter: [40, 40, dShooter],
      brute: [64, 64, dBrute], titan: [116, 116, dTitan], hive: [160, 140, dHive] };
    SPR = {};
    for (const k in defs) {
      const d = defs[k], a = mkSprite(d[0], d[1], d[2], 0), b = mkSprite(d[0], d[1], d[2], 1);
      SPR[k] = { f: [a, b], fl: [flashOf(a), flashOf(b)], w: d[0], h: d[1] };
    }
  }
  function buildGround() {
    const n = 128;
    groundCv = document.createElement('canvas'); groundCv.width = Math.round(n * S); groundCv.height = Math.round(n * S);
    const g = groundCv.getContext('2d'); g.scale(S, S);
    g.fillStyle = '#2b3429'; g.fillRect(0, 0, n, n);
    let sd = 11; const r = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.035)'; g.fillRect(r() * n, r() * n, 2 + r() * 5, 2 + r() * 5); }
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, n - 1, n - 1);
    groundPat = ctx.createPattern(groundCv, 'repeat');
    try { groundPat.setTransform(new DOMMatrix().scale(1 / S)); } catch (e) { /* older webview */ }
  }
  // decorations scattered over the arena (visual only)
  const DECOR = [];
  (function () {
    let sd = 7; const r = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < 120; i++) DECOR.push({ x: r() * CFG.ARENA, y: r() * CFG.ARENA, t: (r() * 4) | 0, s: 8 + r() * 18, a: r() * TAU });
  })();

  function drawDecor() {
    for (let i = 0; i < DECOR.length; i++) {
      const d = DECOR[i], x = d.x - cam.x, y = d.y - cam.y;
      if (x < -40 || y < -40 || x > VW + 40 || y > VH + 40) continue;
      if (d.t === 0) { // crater
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y, d.s, d.s * 0.8, d.a, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2; ctx.stroke();
      } else if (d.t === 1) { // rock
        ctx.fillStyle = '#4a5247'; ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = d.a + k * TAU / 6, rad = d.s * (k % 2 ? 0.7 : 0.95); ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
        ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x - d.s * 0.3, y - d.s * 0.4, d.s * 0.5, d.s * 0.25);
      } else if (d.t === 2) { // scrap
        ctx.save(); ctx.translate(x, y); ctx.rotate(d.a);
        ctx.fillStyle = '#5b5f55'; ctx.fillRect(-d.s * 0.7, -2.5, d.s * 1.4, 5);
        ctx.fillStyle = '#7a6a3c'; ctx.fillRect(-3, -d.s * 0.5, 5, d.s);
        ctx.restore();
      } else { // skid marks
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 25, y - 6); ctx.quadraticCurveTo(x, y + 8, x + 25, y - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 25, y + 5); ctx.quadraticCurveTo(x, y + 19, x + 25, y + 7); ctx.stroke();
      }
    }
  }

  // ---------- part icons ----------
  function partIcon(key, cx, cy, r, col) {
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (key) {
      case 'turret':
        ctx.beginPath(); ctx.arc(-r * 0.15, 0, r * 0.5, 0, TAU); ctx.fill(); ctx.fillRect(0, -r * 0.15, r * 0.9, r * 0.3); break;
      case 'sideL': case 'sideR': {
        const d = key === 'sideL' ? -1 : 1;
        rr(ctx, -r * 0.5, -r * 0.45, r, r * 0.9, r * 0.2); ctx.fill();
        ctx.fillRect(d > 0 ? r * 0.4 : -r * 0.95, -r * 0.14, r * 0.55, r * 0.28); break;
      }
      case 'engine':
        ctx.beginPath(); ctx.moveTo(r * 0.15, -r * 0.9); ctx.lineTo(-r * 0.5, r * 0.1); ctx.lineTo(-r * 0.02, r * 0.1); ctx.lineTo(-r * 0.2, r * 0.9);
        ctx.lineTo(r * 0.5, -r * 0.1); ctx.lineTo(r * 0.02, -r * 0.1); ctx.closePath(); ctx.fill(); break;
      case 'treads':
        rr(ctx, -r * 0.85, -r * 0.8, r * 0.55, r * 1.6, r * 0.2); ctx.fill(); rr(ctx, r * 0.3, -r * 0.8, r * 0.55, r * 1.6, r * 0.2); ctx.fill();
        ctx.fillRect(-r * 0.3, -r * 0.1, r * 0.6, r * 0.2); break;
      case 'armor':
        ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.75, -r * 0.55); ctx.lineTo(r * 0.6, r * 0.35); ctx.lineTo(0, r * 0.95);
        ctx.lineTo(-r * 0.6, r * 0.35); ctx.lineTo(-r * 0.75, -r * 0.55); ctx.closePath(); ctx.fill(); break;
      case 'radar':
        ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.18, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.55, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.95, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); break;
      case 'repair':
        ctx.fillRect(-r * 0.2, -r * 0.8, r * 0.4, r * 1.6); ctx.fillRect(-r * 0.8, -r * 0.2, r * 1.6, r * 0.4); break;
    }
    ctx.restore();
  }

  // ---------- the tank ----------
  // lv: part levels {turret,sideL,sideR,engine,treads,armor,radar,repair}; o: {od, dist, t}
  function drawDecal(id, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    switch (id) {
      case 'star': ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
      case 'stripes': ctx.fillRect(-6, -8, 3, 16); ctx.fillRect(0, -8, 3, 16); break;
      case 'bolt': ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 8); ctx.lineTo(5, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill(); break;
      case 'skull':
        ctx.beginPath(); ctx.arc(0, -1.5, 5, 0, TAU); ctx.fill(); ctx.fillRect(-2.6, 2, 5.2, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.arc(-2, -1.5, 1.4, 0, TAU); ctx.arc(2, -1.5, 1.4, 0, TAU); ctx.fill(); break;
      case 'checker': for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) ctx.fillRect(-8 + i * 4, -8 + j * 4, 4, 4); break;
      case 'flame': ctx.beginPath(); ctx.moveTo(-6, 7); ctx.quadraticCurveTo(-8, -1, -1, -8); ctx.quadraticCurveTo(0, -2, 3, -3); ctx.quadraticCurveTo(7, 2, 3, 8); ctx.quadraticCurveTo(0, 5, -2, 8); ctx.closePath(); ctx.fill(); break;
    }
  }
  function drawTank(x, y, hullAng, turAng, lv, o) {
    const pa = Save.PAINTS[Save.data.eqP] || Save.PAINTS[0], dec = Save.DECALS[Save.data.eqD] || Save.DECALS[0];
    const dist = o.dist || 0, t = o.t || 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(hullAng); if (o.scale) ctx.scale(o.scale, o.scale);
    // tracks
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = '#1c2026'; rr(ctx, -20, s * 14 - 5.5, 40, 11, 4); ctx.fill();
      ctx.fillStyle = lv.treads >= 3 ? '#ff8a3a' : '#3b424b';
      const off = dist % 6;
      for (let k = -3; k <= 3; k++) ctx.fillRect(k * 6 - off - 1, s * 14 - 5, 2, 10);
      if (lv.treads >= 3) { ctx.strokeStyle = 'rgba(255,140,60,0.8)'; ctx.lineWidth = 1.2; rr(ctx, -20, s * 14 - 5.5, 40, 11, 4); ctx.stroke(); }
    }
    // engine rear + flame
    if (o.od > 0) {
      ctx.fillStyle = 'rgba(255,170,60,0.9)'; ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(-38 - Math.random() * 8, 0); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,170,0.95)'; ctx.beginPath(); ctx.moveTo(-22, -3); ctx.lineTo(-30 - Math.random() * 4, 0); ctx.lineTo(-22, 3); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2b3139'; rr(ctx, -23, -8, 7, 16, 2); ctx.fill();
    if (lv.engine > 0) { ctx.fillStyle = lv.engine >= 3 ? '#5ad1ff' : '#8a95a3'; for (let k = -1; k <= 1; k++) ctx.fillRect(-22, k * 4 - 1, 5, 2); }
    // hull
    ctx.fillStyle = pa.c2; rr(ctx, -18, -12, 36, 24, 6); ctx.fill();
    ctx.fillStyle = pa.c1; rr(ctx, -18, -12, 36, 15, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; rr(ctx, -15, -10, 30, 5, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(12, -10, 4, 20);
    // armor plates
    if (lv.armor > 0) {
      ctx.fillStyle = lv.armor >= 3 ? '#9fb4ff' : 'rgba(255,255,255,0.35)';
      ctx.fillRect(-12, -13.5, 24, 3); ctx.fillRect(-12, 10.5, 24, 3);
      if (lv.armor >= 3) { ctx.fillStyle = '#d6e0ff'; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 5 - 2, -13.5); ctx.lineTo(k * 5, -17); ctx.lineTo(k * 5 + 2, -13.5); ctx.fill(); ctx.beginPath(); ctx.moveTo(k * 5 - 2, 13.5); ctx.lineTo(k * 5, 17); ctx.lineTo(k * 5 + 2, 13.5); ctx.fill(); } }
    }
    // decal
    ctx.save(); ctx.translate(-4, 0); ctx.rotate(Math.PI / 2); drawDecal(dec.id, 'rgba(255,255,255,0.85)'); ctx.restore();
    // radar dish
    if (lv.radar > 0) {
      ctx.save(); ctx.translate(-12, -6.5);
      ctx.fillStyle = '#3a424d'; ctx.beginPath(); ctx.arc(0, 0, lv.radar >= 3 ? 4.8 : 3.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = lv.radar >= 3 ? '#5aff9a' : '#c8d0d9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); const a = t * 3; ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.stroke();
      ctx.restore();
    }
    // repair cross
    if (lv.repair > 0) { ctx.fillStyle = lv.repair >= 3 ? '#7dffa3' : '#e8f5ec'; ctx.fillRect(-13, 4.5, 7, 2.2); ctx.fillRect(-10.4, 2, 2.2, 7); }
    // side guns
    for (let s = -1; s <= 1; s += 2) {
      const l = s < 0 ? lv.sideL : lv.sideR;
      if (l <= 0) continue;
      ctx.save(); ctx.translate(2, s * 16);
      ctx.fillStyle = '#2b3139'; rr(ctx, -6, -4, 12, 8, 3); ctx.fill();
      if (l >= 3) { ctx.fillStyle = '#5a636f'; rr(ctx, -7, s * 2 - 4, 14, 8, 2); ctx.fill(); ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(7, s * 2 - 1.5, 2, 0, TAU); ctx.arc(7, s * 2 + 1.5, 2, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#5a636f'; ctx.fillRect(-1.5, s > 0 ? 3 : -11, 3, 8); ctx.fillStyle = '#cfd6df'; ctx.fillRect(-1.5, s > 0 ? 9 : -11, 3, 2); }
      ctx.restore();
    }
    // turret
    ctx.save(); ctx.rotate(turAng - hullAng);
    const tl = lv.turret || 1, len = 17 + tl * 1.4;
    ctx.fillStyle = '#2b3139';
    if (tl >= 5) { rr(ctx, 4, -6.5, len, 4.2, 1.5); ctx.fill(); rr(ctx, 4, 2.3, len, 4.2, 1.5); ctx.fill(); }
    else { rr(ctx, 4, tl >= 3 ? -3.2 : -2.4, len, tl >= 3 ? 6.4 : 4.8, 2); ctx.fill(); }
    if (tl >= 3) { ctx.fillStyle = '#58f0ff'; ctx.fillRect(8, -0.8, len - 6, 1.6); }
    ctx.fillStyle = pa.c1; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(-2, -2.5, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = pa.c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
    ctx.fillStyle = tl >= 3 ? '#58f0ff' : '#2b3139'; ctx.beginPath(); ctx.arc(1, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  const SHOWCASE = { turret: 3, sideL: 3, sideR: 1, engine: 3, treads: 3, armor: 3, radar: 1, repair: 1 };
  const BASIC = { turret: 1, sideL: 0, sideR: 0, engine: 0, treads: 0, armor: 0, radar: 0, repair: 0 };

  // ---------- fx ----------
  const parts = [], rings = [];
  const PCOLS = ['#ffb347', '#9aa3ad', '#58f0ff', '#8ee86a', '#ff5a4a', '#ffe27a'];
  function puff(x, y, n, ci, spd, life, size) {
    for (let i = 0; i < n; i++) {
      if (parts.length > 220) parts.shift();
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random() * 0.7);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: life * (0.6 + Math.random() * 0.6), m: life, s: size * (0.6 + Math.random() * 0.8), c: ci });
    }
  }
  function ring(x, y, r, col, life) { if (rings.length < 12) rings.push({ x: x, y: y, r: r, c: col, l: life || 0.45, m: life || 0.45 }); }

  function handleEvents(s) {
    const ev = s.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e.k) {
        case 'shoot': Snd.play('shoot'); puff(e.x, e.y, 2, 5, 90, 0.12, 3); break;
        case 'sideshoot': Snd.play('side'); break;
        case 'rocket': Snd.play('rocket'); puff(e.x, e.y, 3, 0, 80, 0.2, 3); break;
        case 'hit': Snd.play('hit'); puff(e.x, e.y, 2, 5, 110, 0.15, 2.4); break;
        case 'kill': Snd.play('kill'); puff(e.x, e.y, e.a === 2 ? 14 : 7, Math.random() < 0.5 ? 0 : 3, 130, 0.45, e.a === 2 ? 5 : 3.4); if (e.a === 2) shake = Math.max(shake, 3); break;
        case 'ram': Snd.play('ram'); puff(e.x, e.y, 3, 1, 90, 0.35, 4); break;
        case 'boom': Snd.play('boom'); ring(e.x, e.y, e.a, '#ffb347', 0.35); puff(e.x, e.y, 10, 0, 160, 0.4, 4); shake = Math.max(shake, 4); break;
        case 'hurt': Snd.play('hurt'); Snd.vibrate(25); hurtFlash = 0.35; shake = Math.max(shake, 7); break;
        case 'shock': Snd.play('shock'); ring(e.x, e.y, e.a, '#8aa3ff', 0.5); shake = Math.max(shake, 8); break;
        case 'coin': Snd.play('coin'); break;
        case 'crate': {
          Snd.play('crate'); ring(e.x, e.y, 50, '#ffe27a', 0.5); puff(e.x, e.y, 12, 5, 140, 0.5, 3.5);
          pulse[e.a] = 1.2; toast(T.parts[e.a].name + '  Lv ' + G.parts[e.a].lv, T.parts[e.a].base, PCOL[e.a], 1.8);
          break;
        }
        case 'evolve':
          Snd.play('evolve'); Snd.vibrate(60); ring(e.x, e.y, 90, '#58f0ff', 0.7); ring(e.x, e.y, 60, '#ffe27a', 0.55); puff(e.x, e.y, 30, 2, 220, 0.8, 4);
          pulse[e.a] = 2; shake = Math.max(shake, 6); toast(T.evolved + '  ' + T.parts[e.a].name, T.parts[e.a].evo, '#ffe27a', 3);
          break;
        case 'boss':
          Snd.play('boss'); Snd.vibrate(120); bossFlash = 1.2; shake = Math.max(shake, 6);
          toast(e.a === 2 ? T.mainBoss : T.miniBoss, '', '#ff5a4a', 2.6); Snd.setMode('boss'); break;
        case 'bossdead': Snd.play('boom'); ring(e.x, e.y, 150, '#ffe27a', 0.8); puff(e.x, e.y, 40, 0, 260, 1.0, 6); shake = Math.max(shake, 10); toast(T.bossDown, '', '#ffe27a', 2.2); Snd.setMode('play'); break;
        case 'windup': Snd.play('windup'); break;
        case 'bossshot': Snd.play('bossshot'); break;
        case 'overdrive': puff(e.x, e.y, 8, 0, 120, 0.4, 4); break;
        case 'repair': Snd.play('repair'); ring(e.x, e.y, 40, '#7dffa3', 0.6); break;
        case 'win': Snd.play('win'); break;
        case 'lose': Snd.play('lose'); Snd.vibrate(200); ring(e.x, e.y, 120, '#ff5a4a', 0.8); puff(e.x, e.y, 40, 0, 240, 1, 6); break;
      }
    }
    ev.length = 0;
  }

  // ---------- game flow ----------
  function startRun() {
    G = Core.create(); res = null; paused = false; stick = null; aim.jx = aim.jy = 0;
    cam.x = G.tank.x - VW / 2; cam.y = G.tank.y - VH / 2;
    parts.length = 0; rings.length = 0; banner = null; shake = 0; hurtFlash = 0; bossFlash = 0;
    for (const k in pulse) delete pulse[k];
    hint = { on: !Save.data.hintDone, t: 0 };
    scene = 'play'; Snd.setMode('play');
  }
  function endRun(quit) {
    if (!G) return;
    res = Core.result(G); res.quit = !!quit; res.doubled = false;
    res.newBest = Math.floor(res.time) > Save.data.bestTime;
    Save.finishRun(res);
    scene = 'result'; Snd.setMode('menu'); Snd.engineOff();
  }
  function goMenu() { scene = 'menu'; Snd.setMode('menu'); Snd.engineOff(); }

  // ---------- input ----------
  function toLogical(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * VW / r.width, y: (e.clientY - r.top) * VH / r.height };
  }
  function down(e) {
    e.preventDefault();
    Snd.init();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = toLogical(e);
    if (scene === 'play' && !paused) {
      if (p.x > VW - 46 && p.y < 46) { paused = true; Snd.play('click'); Snd.engineOff(); return; }
      if (!stick) stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      return;
    }
    for (let i = btns.length - 1; i >= 0; i--) {
      const b = btns[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { Snd.play('click'); b.fn(); return; }
    }
  }
  function move(e) {
    if (!stick || e.pointerId !== stick.id) return;
    e.preventDefault();
    const p = toLogical(e); stick.x = p.x; stick.y = p.y;
    // drag the base along if the finger goes far, so the stick always feels responsive
    const dx = p.x - stick.ox, dy = p.y - stick.oy, d = Math.hypot(dx, dy);
    if (d > 70) { stick.ox = p.x - dx / d * 70; stick.oy = p.y - dy / d * 70; }
  }
  function up(e) { if (stick && e.pointerId === stick.id) stick = null; }
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (scene === 'play') { paused = true; Snd.engineOff(); } Snd.setMode('off'); } else if (scene === 'play') Snd.setMode(G && G.bosses.length ? 'boss' : 'play'); else Snd.setMode('menu'); });
  window.addEventListener('resize', resize);

  // ---------- scenes: drawing ----------
  function bgScroll(t) {
    ctx.fillStyle = '#0f141a'; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.translate(-(t * 12 % 128), -(t * 7 % 128)); ctx.fillStyle = groundPat; ctx.fillRect(0, 0, VW + 128, VH + 128); ctx.restore();
    ctx.fillStyle = 'rgba(8,12,16,0.55)'; ctx.fillRect(0, 0, VW, VH);
  }
  function drawMenu() {
    bgScroll(uiT);
    text(T.title, VW / 2, 92, 38, '#ffd34d');
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(VW / 2, 266, 92, 26, 0, 0, TAU); ctx.fill();
    drawTank(VW / 2, 240, -0.25 + Math.sin(uiT * 0.7) * 0.1, uiT * 0.9, SHOWCASE, { scale: 3.2, t: uiT, dist: uiT * 30 });
    button(70, 380, 220, 62, T.play, { size: 28 }, startRun);
    button(70, 456, 220, 50, T.garage, { c1: '#5b7fd1', c2: '#3a56a0' }, function () { scene = 'garage'; });
    button(70, 516, 220, 44, T.settings, { c1: '#6b7480', c2: '#464e58', size: 16 }, function () { scene = 'settings'; });
    // free coins
    const a = adLabel('free', '+50');
    button(70, VH - 120, 220, 50, T.freeCoins + ' ' + (a.disabled ? '' : '+50'), { c1: '#d19a2a', c2: '#9a6e14', size: 16, sub: a.disabled ? a.label : a.sub, disabled: a.disabled }, function () {
      Ad.show('free').then(function (ok) { if (ok) { Save.addCoins(50); Snd.play('buy'); } });
    });
    coinIcon(VW - 74, 28, 9); text(String(Save.data.coins), VW - 58, 28, 18, '#ffe27a', 'left');
    if (Save.data.bestTime > 0) text(T.best + ' ' + fmtTime(Save.data.bestTime) + '  |  ' + Save.data.bestKills + ' ' + T.kills.toLowerCase(), VW / 2, VH - 40, 13, '#b8c4d0');
  }
  function drawSettings() {
    bgScroll(uiT);
    text(T.settings, VW / 2, 64, 28, '#fff');
    const rows = [['music', T.music], ['sfx', T.sfx], ['vib', T.vibration]];
    rows.forEach(function (r, i) {
      const y = 130 + i * 74, on = Save.data[r[0]];
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, 24, y, VW - 48, 56, 12); ctx.fill();
      text(r[1], 44, y + 28, 18, '#fff', 'left');
      button(VW - 130, y + 8, 96, 40, on ? T.on : T.off, { c1: on ? '#4fae5d' : '#6b7480', c2: on ? '#2f7d3d' : '#464e58', size: 16 }, function () {
        Save.data[r[0]] = !Save.data[r[0]]; Save.commit(); Snd.applySettings(); if (r[0] === 'vib' && Save.data.vib) Snd.vibrate(30);
      });
    });
    button(70, VH - 110, 220, 52, T.back, { c1: '#6b7480', c2: '#464e58' }, goMenu);
  }
  function drawGarage() {
    bgScroll(uiT);
    text(T.garage, 28, 36, 26, '#fff', 'left');
    coinIcon(VW - 74, 36, 9); text(String(Save.data.coins), VW - 58, 36, 18, '#ffe27a', 'left');
    // tank cards
    for (let i = 0; i < 4; i++) {
      const x = 14 + i * 85, y = 62, sel = i === 0;
      ctx.fillStyle = sel ? 'rgba(255,211,77,0.18)' : 'rgba(255,255,255,0.06)'; rr(ctx, x, y, 78, 70, 10); ctx.fill();
      if (sel) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; rr(ctx, x, y, 78, 70, 10); ctx.stroke(); }
      ctx.save(); ctx.globalAlpha = sel ? 1 : 0.28;
      drawTank(x + 39, y + 28, -0.2, 0.3, sel ? BASIC : BASIC, { scale: 0.85 });
      ctx.restore();
      text(sel ? T.tankNames[i] : T.tankNames[i] + ' - ' + T.soon, x + 39, y + 58, 11, sel ? '#fff' : '#8a94a0', 'center', false);
    }
    // preview
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; rr(ctx, 14, 146, VW - 28, 190, 16); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(VW / 2, 268, 78, 20, 0, 0, TAU); ctx.fill();
    drawTank(VW / 2, 244, uiT * 0.5, uiT * 0.5 + 0.8, SHOWCASE, { scale: 3, t: uiT, dist: 0 });
    // tabs
    const tabs = [['paint', T.paint], ['decal', T.decal]];
    tabs.forEach(function (tb, i) {
      const on = tab === tb[0];
      button(14 + i * 175, 350, 157, 40, tb[1], { c1: on ? '#5b7fd1' : '#4a525d', c2: on ? '#3a56a0' : '#343a43', size: 15 }, function () { tab = tb[0]; });
    });
    const list = tab === 'paint' ? Save.PAINTS : Save.DECALS, own = tab === 'paint' ? Save.data.ownP : Save.data.ownD, eq = tab === 'paint' ? Save.data.eqP : Save.data.eqD;
    for (let i = 0; i < list.length; i++) {
      const cx = 14 + (i % 4) * 85, cy = 404 + ((i / 4) | 0) * 104, owned = own.indexOf(i) >= 0, price = list[i].price;
      ctx.fillStyle = i === eq ? 'rgba(255,211,77,0.2)' : 'rgba(255,255,255,0.07)'; rr(ctx, cx, cy, 78, 96, 10); ctx.fill();
      if (i === eq) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; rr(ctx, cx, cy, 78, 96, 10); ctx.stroke(); }
      if (tab === 'paint') {
        ctx.fillStyle = list[i].c2; ctx.beginPath(); ctx.arc(cx + 39, cy + 34, 22, 0, TAU); ctx.fill();
        ctx.fillStyle = list[i].c1; ctx.beginPath(); ctx.arc(cx + 39, cy + 31, 20, Math.PI, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 39, cy + 31, 20, 0, Math.PI); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(cx + 32, cy + 24, 8, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = Save.PAINTS[Save.data.eqP].c1; rr(ctx, cx + 15, cy + 10, 48, 48, 8); ctx.fill();
        ctx.save(); ctx.translate(cx + 39, cy + 34); ctx.scale(1.6, 1.6); drawDecal(list[i].id, 'rgba(255,255,255,0.9)'); ctx.restore();
        if (i === 0) text('-', cx + 39, cy + 34, 22, '#fff');
      }
      text(tab === 'paint' ? T.paintNames[i] : T.decalNames[i], cx + 39, cy + 70, 11, '#cfd6df', 'center', false);
      if (i === eq) text(T.equipped, cx + 39, cy + 86, 10, '#ffd34d', 'center', false);
      else if (owned) text('OK', cx + 39, cy + 86, 11, '#8ee86a', 'center', false);
      else { coinIcon(cx + 26, cy + 86, 6); text(String(price), cx + 36, cy + 86, 12, Save.data.coins >= price ? '#ffe27a' : '#ff8a7a', 'left', false); }
      btns.push({ x: cx, y: cy, w: 78, h: 96, fn: function () {
        const ok = tab === 'paint' ? Save.buyPaint(i) : Save.buyDecal(i);
        Snd.play(ok ? 'buy' : 'hurt');
      } });
    }
    button(70, VH - 70, 220, 48, T.back, { c1: '#6b7480', c2: '#464e58' }, goMenu);
  }

  // ---------- world drawing ----------
  function wsprite(k, x, y, ang, fr, flash) {
    const sp = SPR[k], img = flash ? sp.fl[fr] : sp.f[fr];
    const c = Math.cos(ang) * S, s = Math.sin(ang) * S;
    ctx.setTransform(c, s, -s, c, (x - cam.x) * S, (y - cam.y) * S);
    ctx.drawImage(img, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
  }
  function resetT() { ctx.setTransform(S, 0, 0, S, 0, 0); }

  function drawWorld(s) {
    const A = CFG.ARENA, tk = s.tank;
    // ground
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.translate(-cam.x, -cam.y);
    ctx.beginPath(); ctx.rect(0, 0, A, A); ctx.clip();
    ctx.save(); ctx.translate(cam.x - (cam.x % 128), cam.y - (cam.y % 128)); ctx.fillStyle = groundPat; ctx.fillRect(0, 0, VW + 256, VH + 256); ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,190,50,0.55)'; ctx.lineWidth = 6; ctx.setLineDash([18, 12]); ctx.strokeRect(-cam.x, -cam.y, A, A); ctx.setLineDash([]);
    drawDecor();

    // fire trail
    for (let i = 0; i < s.fires.length; i++) {
      const f = s.fires[i], x = f.x - cam.x, y = f.y - cam.y, k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, k * 1.4) * 0.45; ctx.fillStyle = '#ff5a14'; ctx.beginPath(); ctx.arc(x, y, 15 + Math.sin(now * 14 + i) * 2, 0, TAU); ctx.fill();
      ctx.globalAlpha = Math.min(1, k * 1.4) * 0.8; ctx.fillStyle = '#ffc04a'; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // coins (batched)
    ctx.fillStyle = '#ffd34d'; ctx.beginPath();
    for (let i = 0; i < s.coins.length; i++) {
      const c = s.coins[i], x = c.x - cam.x, y = c.y - cam.y;
      if (x < -10 || y < -10 || x > VW + 10 || y > VH + 10) continue;
      const r = c.v >= 5 ? 6.5 : c.v >= 2 ? 5 : 4;
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    }
    ctx.fill();
    // crates
    for (let i = 0; i < s.crates.length; i++) {
      const c = s.crates[i], x = c.x - cam.x, y = c.y - cam.y;
      if (x < -40 || y < -40 || x > VW + 40 || y > VH + 40) continue;
      const bob = Math.sin(now * 4 + i) * 2, pr = 1 + Math.sin(now * 6) * 0.08;
      ctx.fillStyle = 'rgba(255,226,122,' + (0.18 + Math.sin(now * 5) * 0.08) + ')'; ctx.beginPath(); ctx.arc(x, y, 30 * pr, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 14, 12, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a5a22'; rr(ctx, x - 13, y - 13 + bob, 26, 26, 4); ctx.fill();
      ctx.fillStyle = '#b8803a'; rr(ctx, x - 13, y - 13 + bob, 26, 18, 4); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - 13, y - 2 + bob, 26, 4); ctx.fillRect(x - 2, y - 13 + bob, 4, 26);
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(x - 3, y - 3 + bob, 6, 6);
    }
    // telegraphs
    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i];
      if (e.st === 1 && (e.type === 'charger' || e.big)) {
        const a = Math.atan2(e.dy, e.dx), len = e.big ? 330 : 120;
        ctx.save(); ctx.translate(e.x - cam.x, e.y - cam.y); ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,60,40,' + (0.12 + Math.sin(now * 30) * 0.06) + ')'; ctx.fillRect(0, -e.r, len, e.r * 2); ctx.restore();
      }
    }
    // enemies
    const fr = ((now * 7) | 0) & 1;
    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i];
      if (e.big) continue;
      const x = e.x - cam.x, y = e.y - cam.y;
      if (x < -50 || y < -50 || x > VW + 50 || y > VH + 50) continue;
      wsprite(e.type, e.x, e.y, e.ang, (fr + (e.id & 1)) & 1, e.flash > 0);
    }
    for (let i = 0; i < s.bosses.length; i++) { const e = s.bosses[i]; wsprite(e.type, e.x, e.y, e.ang, fr, e.flash > 0); }
    resetT();

    // fire/exhaust shadow + tank
    const spd = Math.hypot(tk.vx, tk.vy);
    if (!(tk.inv > 0 && ((now * 20) | 0) % 2 === 0 && s.dead === false && tk.inv > 0.3)) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(tk.x - cam.x + 3, tk.y - cam.y + 5, 26, 18, tk.ang, 0, TAU); ctx.fill();
      const lv = { turret: s.parts.turret.lv, sideL: s.parts.sideL.lv, sideR: s.parts.sideR.lv, engine: s.parts.engine.lv, treads: s.parts.treads.lv, armor: s.parts.armor.lv, radar: s.parts.radar.lv, repair: s.parts.repair.lv };
      drawTank(tk.x - cam.x, tk.y - cam.y, tk.ang, tk.tur, lv, { od: tk.od, dist: tk.dist, t: now, scale: 1.08 });
    }
    // radar sweep ring (evolved)
    if (s.st.revealBoss) { ctx.strokeStyle = 'rgba(90,255,154,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tk.x - cam.x, tk.y - cam.y, 26 + ((now * 40) % 60), 0, TAU); ctx.stroke(); }

    // player bullets
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i < s.bullets.length; i++) { const b = s.bullets[i]; if (b.big || b.rocket) continue; ctx.moveTo(b.x - cam.x - b.vx * 0.025, b.y - cam.y - b.vy * 0.025); ctx.lineTo(b.x - cam.x, b.y - cam.y); }
    ctx.stroke();
    ctx.strokeStyle = '#58f0ff'; ctx.lineWidth = 5; ctx.beginPath();
    for (let i = 0; i < s.bullets.length; i++) { const b = s.bullets[i]; if (!b.big || b.rocket) continue; ctx.moveTo(b.x - cam.x - b.vx * 0.04, b.y - cam.y - b.vy * 0.04); ctx.lineTo(b.x - cam.x, b.y - cam.y); }
    ctx.stroke();
    ctx.fillStyle = '#ff8a2a';
    for (let i = 0; i < s.bullets.length; i++) {
      const b = s.bullets[i]; if (!b.rocket) continue;
      ctx.beginPath(); ctx.arc(b.x - cam.x, b.y - cam.y, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,120,0.5)'; ctx.beginPath(); ctx.arc(b.x - cam.x - b.vx * 0.03, b.y - cam.y - b.vy * 0.03, 3.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff8a2a';
    }
    // enemy bullets
    ctx.fillStyle = 'rgba(255,90,40,0.45)'; ctx.beginPath();
    for (let i = 0; i < s.ebul.length; i++) { const b = s.ebul[i]; ctx.moveTo(b.x - cam.x + 8, b.y - cam.y); ctx.arc(b.x - cam.x, b.y - cam.y, 8, 0, TAU); }
    ctx.fill();
    ctx.fillStyle = '#ffd0a0'; ctx.beginPath();
    for (let i = 0; i < s.ebul.length; i++) { const b = s.ebul[i]; ctx.moveTo(b.x - cam.x + 4, b.y - cam.y); ctx.arc(b.x - cam.x, b.y - cam.y, 4, 0, TAU); }
    ctx.fill();
    // rings
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], k = 1 - r.l / r.m;
      ctx.globalAlpha = Math.max(0, r.l / r.m); ctx.strokeStyle = r.c; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(r.x - cam.x, r.y - cam.y, r.r * (0.2 + k * 0.8), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // particles by color
    for (let c = 0; c < PCOLS.length; c++) {
      ctx.fillStyle = PCOLS[c]; let any = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]; if (p.c !== c) continue;
        ctx.globalAlpha = Math.max(0, p.l / p.m); const sz = p.s * (0.5 + 0.5 * p.l / p.m);
        ctx.fillRect(p.x - cam.x - sz / 2, p.y - cam.y - sz / 2, sz, sz); any = true;
      }
      if (any) ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  }

  function drawArrows(s) {
    const tk = s.tank, cx = VW / 2, cy = VH / 2, list = [];
    for (let i = 0; i < s.crates.length; i++) { const c = s.crates[i]; list.push({ x: c.x, y: c.y, d: Math.hypot(c.x - tk.x, c.y - tk.y), col: '#ffe27a' }); }
    list.sort(function (a, b) { return a.d - b.d; });
    const out = list.slice(0, s.st.arrows);
    for (let i = 0; i < s.bosses.length; i++) out.push({ x: s.bosses[i].x, y: s.bosses[i].y, d: 1, col: '#ff5a4a', boss: true });
    for (let i = 0; i < out.length; i++) {
      const o = out[i], sx = o.x - cam.x, sy = o.y - cam.y;
      if (sx > 14 && sx < VW - 14 && sy > 70 && sy < VH - 70) continue;
      const a = Math.atan2(o.y - tk.y, o.x - tk.x);
      const ex = clamp(cx + Math.cos(a) * 400, 26, VW - 26), ey = clamp(cy + Math.sin(a) * 600, 78, VH - 84);
      ctx.save(); ctx.translate(ex, ey);
      ctx.globalAlpha = 0.75 + Math.sin(now * 6) * 0.2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
      ctx.rotate(a); ctx.fillStyle = o.col; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-5, -9); ctx.lineTo(-2, 0); ctx.lineTo(-5, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function drawHUD(s) {
    // HP bar
    const hp = s.tank.hp / s.tank.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, 10, 12, 124, 18, 9); ctx.fill();
    ctx.fillStyle = hp > 0.5 ? '#5cd66a' : hp > 0.25 ? '#e8c43a' : '#ff5a4a'; if (hp > 0.01) { rr(ctx, 12, 14, 120 * hp, 14, 7); ctx.fill(); }
    text(Math.ceil(s.tank.hp) + '', 72, 21, 11, '#fff', 'center');
    // timer
    const left = CFG.ROUND_SECONDS - s.t;
    text(left > 0 ? fmtTime(left) : '0:00', 180, 21, 20, s.mainSpawned ? '#ff7a6a' : '#fff');
    // coins
    coinIcon(236, 21, 8); text(String(s.coinsGot), 248, 21, 16, '#ffe27a', 'left');
    // pause
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, VW - 40, 8, 30, 30, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(VW - 31, 15, 4, 16); ctx.fillRect(VW - 23, 15, 4, 16);
    // boss bar
    if (s.bosses.length) {
      const b = s.bosses[0], k = Math.max(0, b.hp / b.mhp);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, 40, 44, VW - 80, 14, 7); ctx.fill();
      ctx.fillStyle = s.bossHit > 0 ? '#ffd0c0' : '#e5392a'; if (k > 0.005) { rr(ctx, 42, 46, (VW - 84) * k, 10, 5); ctx.fill(); }
      text(b.type === 'hive' ? T.mainBoss : T.miniBoss, VW / 2, 68, 11, '#ffb0a0', 'center');
    }
    // part strip
    const keys = Core.PART_KEYS, sw = 38, gap = 4, x0 = (VW - (keys.length * sw + (keys.length - 1) * gap)) / 2, y0 = VH - 54;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], lv = s.parts[k].lv, x = x0 + i * (sw + gap), evo = lv >= CFG.EVOLVE_LEVEL, pu = pulse[k] || 0;
      ctx.save();
      if (pu > 0) { ctx.translate(x + sw / 2, y0 + sw / 2); const sc = 1 + Math.sin(pu * 9) * 0.1 * Math.min(1, pu); ctx.scale(sc, sc); ctx.translate(-(x + sw / 2), -(y0 + sw / 2)); }
      ctx.fillStyle = lv > 0 ? 'rgba(10,14,20,0.78)' : 'rgba(10,14,20,0.45)'; rr(ctx, x, y0, sw, sw, 8); ctx.fill();
      if (evo) { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2.5; rr(ctx, x, y0, sw, sw, 8); ctx.stroke(); ctx.fillStyle = 'rgba(255,226,122,0.14)'; rr(ctx, x, y0, sw, sw, 8); ctx.fill(); }
      else if (lv > 0) { ctx.strokeStyle = PCOL[k]; ctx.lineWidth = 1.5; rr(ctx, x, y0, sw, sw, 8); ctx.stroke(); }
      partIcon(k, x + sw / 2, y0 + sw / 2 - 2, 10, lv > 0 ? PCOL[k] : 'rgba(255,255,255,0.18)');
      for (let p = 0; p < CFG.MAX_PART_LEVEL; p++) { ctx.fillStyle = p < lv ? (evo ? '#ffe27a' : PCOL[k]) : 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 4 + p * 6.4, y0 + sw - 6, 5, 3); }
      ctx.restore();
    }
  }

  function drawStick() {
    if (!stick) return;
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 52, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.stroke();
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy), k = d > 52 ? 52 / d : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(stick.ox + dx * k, stick.oy + dy * k, 24, 0, TAU); ctx.fill();
  }
  function drawHint(s) { // first run: animated ghost thumb, no words
    if (!hint.on) return;
    hint.t += 1 / 60;
    if (s.picks >= 1 || (s.tank.dist > 260 && hint.t > 5) || hint.t > 40) { hint.on = false; Save.data.hintDone = true; Save.commit(); return; }
    if (stick && s.tank.dist > 40) return;
    const bx = VW / 2, by = VH - 190, ph = (hint.t % 2.4) / 2.4, e = ph < 0.6 ? ph / 0.6 : 1, a = Math.min(1, ph < 0.1 ? ph / 0.1 : ph > 0.9 ? (1 - ph) / 0.1 : 1);
    ctx.globalAlpha = 0.9 * a;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, 52, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    const ky = by - 40 * e;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(bx, ky, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(bx + 4, ky + 6, 9, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,122,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, by - 62 - (e * 8)); ctx.lineTo(bx - 9, by - 52 - (e * 8)); ctx.moveTo(bx, by - 62 - (e * 8)); ctx.lineTo(bx + 9, by - 52 - (e * 8)); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawBanner(dt) {
    if (!banner) return;
    banner.t -= dt; if (banner.t <= 0) { banner = null; return; }
    const k = Math.min(1, banner.t / banner.max * 6, (banner.max - banner.t) * 6 + 0.001);
    ctx.globalAlpha = Math.min(1, k);
    text(banner.title, VW / 2, VH * 0.27, 26, banner.col, 'center');
    if (banner.sub) text(banner.sub, VW / 2, VH * 0.27 + 28, 14, '#fff', 'center');
    ctx.globalAlpha = 1;
  }

  function overlayDim() { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VW, VH); }
  function drawPause() {
    overlayDim();
    text(T.paused, VW / 2, VH / 2 - 120, 32, '#fff');
    button(70, VH / 2 - 60, 220, 60, T.resume, { size: 24 }, function () { paused = false; });
    button(70, VH / 2 + 20, 220, 48, T.quit, { c1: '#c8564a', c2: '#8f352c', size: 16 }, function () { paused = false; endRun(true); });
  }
  function drawRevive() {
    overlayDim();
    text(T.defeat, VW / 2, VH / 2 - 130, 34, '#ff7a6a');
    text(T.survived + ' ' + fmtTime(G.t) + '  |  ' + G.kills + ' ' + T.kills.toLowerCase(), VW / 2, VH / 2 - 88, 15, '#fff');
    const a = adLabel('revive', T.revive);
    button(50, VH / 2 - 50, 260, 64, a.label, { c1: '#4fae5d', c2: '#2f7d3d', size: 24, sub: a.sub, disabled: a.disabled }, function () {
      Ad.show('revive').then(function (ok) { if (ok && scene === 'revive') { Core.revive(G); hurtFlash = 0; scene = 'play'; Snd.setMode(G.bosses.length ? 'boss' : 'play'); } });
    });
    button(80, VH / 2 + 36, 200, 44, T.noThanks, { c1: '#6b7480', c2: '#464e58', size: 15 }, function () { endRun(false); });
  }
  function drawResult() {
    bgScroll(uiT);
    text(res.won ? T.victory : T.defeat, VW / 2, 86, 38, res.won ? '#ffe27a' : '#ff7a6a');
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, 40, 130, VW - 80, 170, 16); ctx.fill();
    text(T.survived, 62, 158, 14, '#b8c4d0', 'left'); text(fmtTime(res.time), VW - 62, 158, 20, '#fff', 'right');
    text(T.kills, 62, 192, 14, '#b8c4d0', 'left'); text(String(res.kills), VW - 62, 192, 20, '#fff', 'right');
    text(T.earned, 62, 232, 14, '#b8c4d0', 'left'); coinIcon(VW - 104, 232, 9); text(String(res.coins), VW - 62, 232, 22, '#ffe27a', 'right');
    if (res.newBest) text(T.best + '!', VW / 2, 276, 15, '#8ee86a');
    if (!res.doubled && res.coins > 0) {
      const a = adLabel('double', T.doubleCoins);
      button(50, 330, 260, 62, a.label, { c1: '#d19a2a', c2: '#9a6e14', size: 24, sub: a.sub, disabled: a.disabled }, function () {
        Ad.show('double').then(function (ok) { if (ok && scene === 'result' && !res.doubled) { Save.addCoins(res.coins); res.coins *= 2; res.doubled = true; Snd.play('buy'); } });
      });
    }
    button(50, 410, 260, 58, T.again, { size: 24 }, startRun);
    button(50, 480, 260, 46, T.menu, { c1: '#6b7480', c2: '#464e58', size: 16 }, goMenu);
    button(50, 538, 260, 46, T.garage, { c1: '#5b7fd1', c2: '#3a56a0', size: 16 }, function () { scene = 'garage'; });
  }

  // ---------- main loop ----------
  let last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; now = ts / 1000; uiT += dt;
    btns = [];
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (scene === 'play' || scene === 'revive') {
      const s = G;
      if (scene === 'play' && !paused) {
        if (stick) {
          const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy);
          const m = Math.min(1, d / 50); aim.jx = d > 4 ? dx / d * m : 0; aim.jy = d > 4 ? dy / d * m : 0;
        } else { aim.jx = 0; aim.jy = 0; }
        const steps = dt > 0.034 ? 2 : 1;
        for (let i = 0; i < steps; i++) Core.update(s, dt / steps, aim);
        handleEvents(s);
        if (s.won) { endRun(false); }
        else if (s.dead) { scene = s.revived ? 'result' : 'revive'; if (s.revived) endRun(false); stick = null; Snd.engineOff(); }
        Snd.engine(Math.min(1, Math.hypot(s.tank.vx, s.tank.vy) / 200));
        // fx
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; if (p.l <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); } }
        for (let i = rings.length - 1; i >= 0; i--) { rings[i].l -= dt; if (rings[i].l <= 0) { rings[i] = rings[rings.length - 1]; rings.pop(); } }
        for (const k in pulse) { pulse[k] -= dt; if (pulse[k] <= 0) delete pulse[k]; }
        if (shake > 0) shake = Math.max(0, shake - dt * 18);
        if (hurtFlash > 0) hurtFlash -= dt;
        if (bossFlash > 0) bossFlash -= dt;
        // exhaust dust
        if (Math.hypot(s.tank.vx, s.tank.vy) > 60 && Math.random() < 0.4) puff(s.tank.x - Math.cos(s.tank.ang) * 24, s.tank.y - Math.sin(s.tank.ang) * 24, 1, 1, 30, 0.35, 4);
      }
      // camera
      const A = CFG.ARENA, tx = s.tank.x + s.tank.vx * 0.22 - VW / 2, ty = s.tank.y + s.tank.vy * 0.22 - VH / 2;
      const k = Math.min(1, dt * 6); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
      cam.x = clamp(cam.x, -20, A - VW + 20); cam.y = clamp(cam.y, -20, A - VH + 20);
      const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
      const ox = cam.x, oy = cam.y; cam.x += sx; cam.y += sy;
      drawWorld(s);
      cam.x = ox; cam.y = oy;
      drawArrows(s);
      if (hurtFlash > 0) { ctx.fillStyle = 'rgba(255,40,30,' + (hurtFlash * 0.7) + ')'; ctx.fillRect(0, 0, VW, VH); }
      if (bossFlash > 0) { ctx.fillStyle = 'rgba(255,40,30,' + (Math.abs(Math.sin(bossFlash * 8)) * 0.25) + ')'; ctx.fillRect(0, 0, VW, VH); }
      drawHUD(s);
      if (scene === 'play') { drawHint(s); drawStick(); drawBanner(paused ? 0 : dt); }
      if (paused) drawPause();
      if (scene === 'revive') drawRevive();
    } else if (scene === 'menu') drawMenu();
    else if (scene === 'garage') drawGarage();
    else if (scene === 'settings') drawSettings();
    else if (scene === 'result') drawResult();
  }

  if (location.search.indexOf('debug') >= 0) window.__ts = { get G() { return G; }, get scene() { return scene; }, set scene(v) { scene = v; }, startRun: startRun, endRun: endRun };
  resize();
  Snd.setMode('menu'); // starts after the first touch (audio unlock)
  requestAnimationFrame(frame);
})();
