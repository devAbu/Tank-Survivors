// Tank Survivors - game logic (no DOM, runs in Node for the sanity sim).
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const PART_KEYS = ['turret', 'sideL', 'sideR', 'engine', 'treads', 'armor', 'radar', 'repair'];
  const GS = 48; // spatial grid cell size

  const EN = {
    beetle:  { hp: 4,    spd: 88, r: 9,  dmg: 4,  coin: 1 },
    charger: { hp: 15,   spd: 62, r: 12, dmg: 11, coin: 2 },
    walker:  { hp: 22,   spd: 56, r: 13, dmg: 8,  coin: 2 },
    shooter: { hp: 16,   spd: 48, r: 12, dmg: 8,  coin: 3 },
    brute:   { hp: 80,   spd: 36, r: 21, dmg: 16, coin: 7 },
    titan:   { hp: 900,  spd: 46, r: 36, dmg: 24, coin: 60,  boss: 1 },
    hive:    { hp: 3800, spd: 38, r: 48, dmg: 26, coin: 200, boss: 2 }
  };

  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  function ev(s, k, x, y, a) { if (s.events.length < 80) s.events.push({ k: k, x: x, y: y, a: a }); }

  function create() {
    const C = root.CFG;
    const A = C.ARENA;
    const gw = Math.ceil(A / GS) + 1;
    const grid = [];
    for (let i = 0; i < gw * gw; i++) grid.push([]);
    const s = {
      t: 0, over: false, won: false, dead: false, revived: false,
      tank: { x: A / 2, y: A / 2, vx: 0, vy: 0, ang: -Math.PI / 2, tur: -Math.PI / 2, hp: C.TANK_HP, maxHp: C.TANK_HP, inv: 0,
              od: 0, odCd: 6, shockCd: 0, burstCd: 0, fireT: 0, side: [0, 0], tcd: 0, dist: 0 },
      parts: {}, st: {},
      enemies: [], efree: [], bullets: [], bfree: [], ebul: [], ebfree: [], coins: [], crates: [], fires: [],
      grid: grid, gw: gw, tmp: [], eid: 0,
      kills: 0, coinsGot: 0, picks: 0, events: [],
      spawnAcc: 0, swarmT: 30, crateT: 2.2, firstCrate: true,
      mini: 0, mainSpawned: false, bosses: [], bossHit: 0
    };
    for (const k of PART_KEYS) s.parts[k] = { lv: 0 };
    s.parts.turret.lv = 1;
    recalc(s);
    s.tank.hp = s.tank.maxHp;
    return s;
  }

  // ---------- part stats ----------
  function sideStats(lv) {
    const base = 6 * (1 + 0.34 * (lv - 1)), rate = 1.3 + 0.18 * (lv - 1);
    const rocket = lv >= root.CFG.EVOLVE_LEVEL;
    return { dmg: rocket ? base * 2.2 : base, cd: rocket ? 1.7 / rate : 1 / rate, rocket: rocket, splash: 34 + 4 * (lv - 3) };
  }
  function recalc(s) {
    const p = s.parts, st = s.st, tk = s.tank;
    const tl = p.turret.lv;
    st.tDmg = 9 * (1 + 0.38 * (tl - 1)); st.tRate = 1.5 + 0.22 * (tl - 1); st.tRange = 290;
    st.tPierce = tl >= 3 ? (tl >= 5 ? 4 : 2) : 0; st.tTwin = tl >= 5; st.sRange = 215;
    const el = p.engine.lv;
    st.acc = 420 * (1 + 0.12 * el); st.turn = 3.0 * (1 + 0.08 * el); st.od = el >= 3;
    const rl = p.treads.lv;
    st.ram = 5 * (1 + 0.7 * rl); st.grip = 4.5 + 0.9 * rl; st.fire = rl >= 3;
    const al = p.armor.lv, oldMax = tk.maxHp;
    st.maxHp = root.CFG.TANK_HP * (1 + 0.22 * al); st.red = 0.05 * al; st.shock = al >= 3;
    tk.maxHp = st.maxHp; if (st.maxHp > oldMax) tk.hp += st.maxHp - oldMax;
    const ra = p.radar.lv;
    st.arrows = ra === 0 ? 1 : ra === 1 ? 2 : ra === 2 ? 3 : 9; st.magnet = 55 + 24 * ra; st.revealBoss = ra >= 3;
    const rp = p.repair.lv;
    st.regen = 0.7 * rp; st.burst = rp >= 3;
  }

  // ---------- pools / helpers ----------
  function spawnEnemy(s, type, x, y, hpMul) {
    const d = EN[type];
    const e = s.efree.pop() || { h: 0 };
    e.id = ++s.eid; e.type = type; e.d = d; e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.kx = 0; e.ky = 0;
    e.hp = e.mhp = d.hp * hpMul; e.r = d.r; e.atk = 0; e.ram = 0; e.flash = 0; e.st = 0; e.w = 0;
    e.t = rnd(0, 6); e.cd = rnd(0.6, 2.2); e.cd2 = 6; e.dx = 0; e.dy = 0; e.dead = false; e.big = !!d.boss; e.n = 0; e.ang = 0;
    s.enemies.push(e);
    if (e.big) s.bosses.push(e);
    return e;
  }
  function spawnBullet(s, x, y, a, spd, dmg, life, o) {
    const b = s.bfree.pop() || { hit: [0, 0, 0, 0] };
    b.x = x; b.y = y; b.vx = Math.cos(a) * spd; b.vy = Math.sin(a) * spd; b.dmg = dmg; b.life = life;
    b.pierce = (o && o.pierce) || 0; b.rocket = !!(o && o.rocket); b.splash = (o && o.splash) || 0; b.big = !!(o && o.big);
    b.hit[0] = b.hit[1] = b.hit[2] = b.hit[3] = 0;
    s.bullets.push(b);
  }
  function spawnEBullet(s, x, y, a, spd, dmg, life) {
    if (s.ebul.length > 160) return;
    const b = s.ebfree.pop() || {};
    b.x = x; b.y = y; b.vx = Math.cos(a) * spd; b.vy = Math.sin(a) * spd; b.dmg = dmg; b.life = life || 4;
    s.ebul.push(b);
  }
  function addCoin(s, x, y, v) {
    if (s.coins.length >= 140) { s.coins[(Math.random() * s.coins.length) | 0].v += v; return; }
    s.coins.push({ x: x + rnd(-8, 8), y: y + rnd(-8, 8), v: v, mag: false, age: 0 });
  }
  function spawnCrate(s, x, y) {
    const A = root.CFG.ARENA;
    s.crates.push({ x: clamp(x, 40, A - 40), y: clamp(y, 40, A - 40), age: 0 });
    ev(s, 'cratespawn', x, y);
  }
  function near(s, x, y, r) { // fills s.tmp with non-boss enemies within r
    const out = s.tmp; out.length = 0;
    const gw = s.gw, g = s.grid;
    const x0 = clamp(((x - r - 24) / GS) | 0, 0, gw - 1), x1 = clamp(((x + r + 24) / GS) | 0, 0, gw - 1);
    const y0 = clamp(((y - r - 24) / GS) | 0, 0, gw - 1), y1 = clamp(((y + r + 24) / GS) | 0, 0, gw - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const c = g[cx + cy * gw];
      for (let i = 0; i < c.length; i++) {
        const e = c[i]; if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, rr = r + e.r;
        if (dx * dx + dy * dy <= rr * rr) out.push(e);
      }
    }
    return out;
  }
  function buildGrid(s) {
    const g = s.grid, gw = s.gw;
    for (let i = 0; i < g.length; i++) g[i].length = 0;
    const en = s.enemies;
    for (let i = 0; i < en.length; i++) {
      const e = en[i]; if (e.big || e.dead) continue;
      const cx = clamp((e.x / GS) | 0, 0, gw - 1), cy = clamp((e.y / GS) | 0, 0, gw - 1);
      g[cx + cy * gw].push(e);
    }
  }

  function dropCrate(s, x, y) { spawnCrate(s, x + rnd(-30, 30), y + rnd(-30, 30)); }

  function killEnemy(s, e) {
    if (e.dead) return;
    e.dead = true; s.kills++;
    const C = root.CFG;
    const v = Math.max(1, Math.round(e.d.coin * C.COIN_SCALE));
    if (e.big) {
      for (let i = 0; i < 12; i++) addCoin(s, e.x + rnd(-30, 30), e.y + rnd(-30, 30), Math.round(v / 12) || 1);
      ev(s, 'bossdead', e.x, e.y, e.d.boss);
      if (e.d.boss === 1) { dropCrate(s, e.x, e.y); dropCrate(s, e.x, e.y); }
      else { s.over = true; s.won = true; ev(s, 'win', e.x, e.y); }
    } else {
      addCoin(s, e.x, e.y, v);
      ev(s, 'kill', e.x, e.y, e.type === 'brute' ? 2 : 1);
      if (e.type === 'brute' && Math.random() < 0.18 && s.crates.length < C.MAX_CRATES + 2) dropCrate(s, e.x, e.y);
    }
  }
  function damageEnemy(s, e, dmg, kx, ky) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.07;
    if (!e.big) { const kr = e.type === 'brute' ? 0.3 : 1; e.kx += kx * kr; e.ky += ky * kr; }
    else s.bossHit = 0.1;
    if (e.hp <= 0) killEnemy(s, e);
  }
  function boom(s, x, y, r, dmg) {
    near(s, x, y, r);
    const t = s.tmp;
    for (let i = 0; i < t.length; i++) {
      const e = t[i], dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      damageEnemy(s, e, dmg, dx / d * 160, dy / d * 160);
    }
    for (let i = 0; i < s.bosses.length; i++) {
      const e = s.bosses[i]; if (e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) < r + e.r) damageEnemy(s, e, dmg, 0, 0);
    }
    ev(s, 'boom', x, y, r);
  }

  // ---------- tank damage ----------
  function hurtTank(s, dmg) {
    const tk = s.tank, st = s.st;
    if (tk.inv > 0 || s.over) return;
    dmg *= (1 - st.red);
    tk.hp -= dmg; tk.inv = 0.3;
    ev(s, 'hurt', tk.x, tk.y, dmg);
    if (st.shock && tk.shockCd <= 0) {
      tk.shockCd = 4.5;
      const r = 120 + 10 * (s.parts.armor.lv - 3), d = 22 + 9 * (s.parts.armor.lv - 3);
      boom(s, tk.x, tk.y, r, d);
      ev(s, 'shock', tk.x, tk.y, r);
    }
    if (tk.hp <= 0) { tk.hp = 0; s.over = true; s.dead = true; ev(s, 'lose', tk.x, tk.y); }
  }
  function revive(s) {
    const tk = s.tank;
    tk.hp = tk.maxHp * root.CFG.REVIVE_HP; tk.inv = 2.5; s.over = false; s.dead = false; s.revived = true;
    boom(s, tk.x, tk.y, 240, 60);
    ev(s, 'shock', tk.x, tk.y, 240);
    for (let i = 0; i < s.ebul.length; i++) s.ebfree.push(s.ebul[i]);
    s.ebul.length = 0;
  }

  // ---------- crates / upgrades ----------
  function pickPart(s) {
    const M = root.CFG.MAX_PART_LEVEL;
    let tot = 0; const w = [];
    for (const k of PART_KEYS) { const lv = s.parts[k].lv; const x = lv >= M ? 0 : 1 + lv * 1.3; w.push(x); tot += x; }
    if (tot <= 0) return null;
    let r = Math.random() * tot;
    for (let i = 0; i < PART_KEYS.length; i++) { r -= w[i]; if (r <= 0) return PART_KEYS[i]; }
    return PART_KEYS[0];
  }
  function openCrate(s, c) {
    const k = pickPart(s);
    s.picks++;
    if (!k) { addCoin(s, c.x, c.y, 25); return; }
    const p = s.parts[k]; p.lv++;
    const evolved = p.lv === root.CFG.EVOLVE_LEVEL;
    recalc(s);
    ev(s, evolved ? 'evolve' : 'crate', c.x, c.y, k);
  }

  // ---------- spawning director ----------
  const POOLS = [
    { from: 0,   w: { beetle: 6, walker: 4 } },
    { from: 40,  w: { beetle: 5, walker: 4, charger: 3 } },
    { from: 90,  w: { beetle: 4, walker: 4, charger: 3, shooter: 3 } },
    { from: 150, w: { beetle: 4, walker: 3, charger: 3, shooter: 3, brute: 2 } },
    { from: 300, w: { beetle: 3, walker: 3, charger: 3, shooter: 4, brute: 3 } }
  ];
  function pickType(t) {
    let pool = POOLS[0];
    for (const p of POOLS) if (t >= p.from) pool = p;
    let tot = 0; for (const k in pool.w) tot += pool.w[k];
    let r = Math.random() * tot;
    for (const k in pool.w) { r -= pool.w[k]; if (r <= 0) return k; }
    return 'beetle';
  }
  function spawnPos(s, dist) {
    const A = root.CFG.ARENA, tk = s.tank;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, x = tk.x + Math.cos(a) * dist, y = tk.y + Math.sin(a) * dist;
      if (x > 20 && x < A - 20 && y > 20 && y < A - 20) return [x, y];
    }
    return [clamp(tk.x + rnd(-dist, dist), 20, A - 20), clamp(tk.y + rnd(-dist, dist), 20, A - 20)];
  }
  function hpMul(s) { return 1 + (s.t / root.CFG.ROUND_SECONDS) * 2.4; }

  function director(s, dt) {
    const C = root.CFG, t = s.t;
    const calm = s.mainSpawned ? 0.12 : (s.bosses.length ? 0.55 : 1);
    s.spawnAcc += dt * (0.55 + t / 60 * 0.8) * calm;
    while (s.spawnAcc >= 1) {
      s.spawnAcc -= 1;
      if (s.enemies.length >= C.MAX_ENEMIES) { s.spawnAcc = 0; break; }
      const p = spawnPos(s, rnd(410, 470));
      const type = pickType(t);
      spawnEnemy(s, type, p[0], p[1], hpMul(s));
    }
    s.swarmT -= dt;
    if (s.swarmT <= 0 && !s.mainSpawned && t > 25) {
      s.swarmT = rnd(22, 32);
      const p = spawnPos(s, 440), n = Math.min(14, 8 + (t / 60) | 0);
      for (let i = 0; i < n && s.enemies.length < C.MAX_ENEMIES + 20; i++) spawnEnemy(s, 'beetle', p[0] + rnd(-40, 40), p[1] + rnd(-40, 40), hpMul(s));
      ev(s, 'swarm', p[0], p[1]);
    }
    // crates
    s.crateT -= dt;
    if (s.crateT <= 0 && s.crates.length < C.MAX_CRATES) {
      s.crateT = s.t < 90 ? C.CRATE_EVERY * 0.65 : C.CRATE_EVERY;
      const tk = s.tank;
      if (s.firstCrate) {
        s.firstCrate = false;
        const a = tk.ang;
        spawnCrate(s, tk.x + Math.cos(a) * 170, tk.y + Math.sin(a) * 170);
      } else {
        const p = spawnPos(s, rnd(220, 420));
        spawnCrate(s, p[0], p[1]);
      }
    } else if (s.crateT <= 0) s.crateT = 1;
    // bosses
    const nextMini = C.MINIBOSS_EVERY * (s.mini + 1);
    if (s.mini < 3 && nextMini < C.MAINBOSS_AT && t >= nextMini) {
      const p = spawnPos(s, 460);
      const e = spawnEnemy(s, 'titan', p[0], p[1], 1 + 0.8 * s.mini + 0.2 * s.mini * s.mini);
      e.n = s.mini; s.mini++;
      ev(s, 'boss', p[0], p[1], 1);
    }
    if (!s.mainSpawned && t >= C.MAINBOSS_AT) {
      s.mainSpawned = true;
      const p = spawnPos(s, 460);
      spawnEnemy(s, 'hive', p[0], p[1], 1);
      ev(s, 'boss', p[0], p[1], 2);
    }
  }

  // ---------- enemies ----------
  function fireRing(s, e, n, off, spd, dmg) {
    for (let i = 0; i < n; i++) spawnEBullet(s, e.x, e.y, off + i / n * TAU, spd, dmg, 4.5);
  }
  function bossDash(s, e, dist, nx, ny, dt, maxSpd) {
    // st: 0 chase, 1 windup, 2 dash. returns movement speed multiplier handled by caller
    if (e.st === 0) {
      e.cd2 -= dt;
      if (e.cd2 <= 0 && dist < 460) { e.st = 1; e.w = 0.9; e.dx = nx; e.dy = ny; ev(s, 'windup', e.x, e.y); }
    } else if (e.st === 1) {
      e.w -= dt;
      if (e.w <= 0) { e.st = 2; e.w = 0.75; }
    } else if (e.st === 2) {
      e.x += e.dx * maxSpd * dt; e.y += e.dy * maxSpd * dt;
      e.w -= dt;
      if (e.w <= 0) { e.st = 0; e.cd2 = 7; }
    }
  }

  function updateEnemy(s, e, dt) {
    const tk = s.tank, A = root.CFG.ARENA;
    const dx = tk.x - e.x, dy = tk.y - e.y;
    const dist = Math.hypot(dx, dy) || 1, nx = dx / dist, ny = dy / dist;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.atk > 0) e.atk -= dt;
    if (e.ram > 0) e.ram -= dt;
    let mx = 0, my = 0, sp = e.d.spd;
    e.ang = Math.atan2(ny, nx);
    switch (e.type) {
      case 'beetle': {
        const w = Math.sin(e.t * 5) * 0.55;
        mx = (nx - ny * w) * sp; my = (ny + nx * w) * sp; break;
      }
      case 'walker': case 'brute':
        mx = nx * sp; my = ny * sp; break;
      case 'charger':
        if (e.st === 0) {
          mx = nx * sp; my = ny * sp; e.cd -= dt;
          if (e.cd <= 0 && dist < 260) { e.st = 1; e.w = 0.55; e.dx = nx; e.dy = ny; }
        } else if (e.st === 1) {
          e.w -= dt; e.ang = Math.atan2(e.dy, e.dx);
          if (e.w <= 0) { e.st = 2; e.w = 0.45; }
        } else {
          mx = e.dx * 330; my = e.dy * 330; e.w -= dt; e.ang = Math.atan2(e.dy, e.dx);
          if (e.w <= 0) { e.st = 0; e.cd = rnd(2, 3.2); }
        }
        break;
      case 'shooter': {
        if (dist > 230) { mx = nx * sp; my = ny * sp; }
        else if (dist < 150) { mx = -nx * sp; my = -ny * sp; }
        else { mx = -ny * sp * 0.6; my = nx * sp * 0.6; }
        e.cd -= dt;
        if (e.cd <= 0 && dist < 320) {
          e.cd = 2.4;
          spawnEBullet(s, e.x, e.y, Math.atan2(dy, dx), 165, e.d.dmg, 3.2);
        }
        break;
      }
      case 'titan': {
        if (e.st === 0) {
          mx = nx * sp; my = ny * sp; e.cd -= dt;
          if (e.cd <= 0) {
            e.cd = 3.2; fireRing(s, e, 12 + 4 * e.n, e.t, 150, 10);
            ev(s, 'bossshot', e.x, e.y);
          }
        }
        bossDash(s, e, dist, nx, ny, dt, 340);
        break;
      }
      case 'hive': {
        const rage = e.hp < e.mhp * 0.5;
        if (e.st === 0) {
          mx = nx * sp * (rage ? 1.3 : 1); my = ny * sp * (rage ? 1.3 : 1);
          e.cd -= dt;
          if (e.cd <= 0) {
            e.cd = rage ? 1.3 : 1.8;
            const n = rage ? 9 : 7, a0 = Math.atan2(dy, dx);
            for (let i = 0; i < n; i++) spawnEBullet(s, e.x, e.y, a0 + (i - (n - 1) / 2) * 0.13, 175, 11, 4);
            ev(s, 'bossshot', e.x, e.y);
          }
          e.h = (e.h || 0) + dt;
          if (e.h > (rage ? 3.5 : 5)) {
            e.h = 0;
            if (s.enemies.length < root.CFG.MAX_ENEMIES + 20) for (let i = 0; i < 5; i++) spawnEnemy(s, 'beetle', e.x + rnd(-50, 50), e.y + rnd(-50, 50), hpMul(s));
            if (rage) fireRing(s, e, 18, rnd(0, 1), 130, 9);
          }
        }
        bossDash(s, e, dist, nx, ny, dt, 360);
        break;
      }
    }
    if (e.st !== 2 || !e.big) {
      if (e.type === 'charger' && e.st === 2) { /* dash handled via mx,my */ }
    }
    if (!(e.big && e.st === 2)) {
      e.x += (mx + e.kx) * dt; e.y += (my + e.ky) * dt;
    }
    const kd = Math.exp(-8 * dt); e.kx *= kd; e.ky *= kd;
    e.x = clamp(e.x, 10, A - 10); e.y = clamp(e.y, 10, A - 10);

    // separation among small enemies
    if (!e.big) {
      const gw = s.gw, g = s.grid;
      const cx = clamp((e.x / GS) | 0, 0, gw - 1), cy = clamp((e.y / GS) | 0, 0, gw - 1);
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(gw - 1, cy + 1); yy++) {
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(gw - 1, cx + 1); xx++) {
          const c = g[xx + yy * gw];
          for (let i = 0; i < c.length; i++) {
            const o = c[i]; if (o === e || o.dead) continue;
            const ox = e.x - o.x, oy = e.y - o.y, rr = e.r + o.r;
            const d2 = ox * ox + oy * oy;
            if (d2 < rr * rr && d2 > 0.01) {
              const d = Math.sqrt(d2), push = (rr - d) * 0.5;
              e.x += ox / d * push; e.y += oy / d * push;
            }
          }
        }
      }
    }

    // contact with the tank
    const cr = e.r + 16;
    const ddx = tk.x - e.x, ddy = tk.y - e.y;
    if (ddx * ddx + ddy * ddy < cr * cr) {
      const spd = Math.hypot(tk.vx, tk.vy);
      let plowed = false;
      if (spd > 55 && e.ram <= 0) {
        e.ram = 0.3;
        const dmg = s.st.ram * (spd / 170) * (tk.od > 0 ? 2 : 1);
        const d = Math.hypot(ddx, ddy) || 1;
        damageEnemy(s, e, dmg, -ddx / d * 220, -ddy / d * 220);
        ev(s, 'ram', e.x, e.y);
        plowed = !e.big;
      }
      if (!e.dead && !(plowed && spd > 90) && e.atk <= 0 && !(e.type === 'charger' && e.st === 1)) {
        e.atk = 0.7; hurtTank(s, e.d.dmg);
      }
    }
  }

  // ---------- main update ----------
  function update(s, dt, inp) {
    if (s.over) return;
    const C = root.CFG, st = s.st, tk = s.tank, A = C.ARENA;
    s.t += dt;
    if (tk.inv > 0) tk.inv -= dt;
    if (tk.shockCd > 0) tk.shockCd -= dt;
    if (tk.burstCd > 0) tk.burstCd -= dt;
    if (s.bossHit > 0) s.bossHit -= dt;

    // --- movement: heading turns toward the stick, throttle accelerates along heading
    const jm = Math.min(1, Math.hypot(inp.jx, inp.jy));
    let acc = st.acc, od = 1;
    if (st.od) {
      if (tk.od > 0) { tk.od -= dt; od = 1.5; if (tk.od <= 0) tk.odCd = Math.max(4, 9 - s.parts.engine.lv); }
      else { tk.odCd -= dt; if (tk.odCd <= 0 && jm > 0.4) { tk.od = 2; ev(s, 'overdrive', tk.x, tk.y); } }
    }
    let diff = 0;
    if (jm > 0.12) {
      const want = Math.atan2(inp.jy, inp.jx);
      diff = angDiff(want, tk.ang);
      const maxT = st.turn * dt;
      tk.ang += clamp(diff, -maxT, maxT);
      const align = Math.max(0, Math.cos(diff));
      const a = acc * od * jm * (0.3 + 0.7 * align);
      tk.vx += Math.cos(tk.ang) * a * dt; tk.vy += Math.sin(tk.ang) * a * dt;
    }
    {
      const fx = Math.cos(tk.ang), fy = Math.sin(tk.ang);
      let vf = tk.vx * fx + tk.vy * fy, vl = -tk.vx * fy + tk.vy * fx;
      vf *= Math.exp(-2.4 * dt); vl *= Math.exp(-st.grip * dt);
      tk.vx = fx * vf - fy * vl; tk.vy = fy * vf + fx * vl;
      const vmax = 175 * (1 + 0.12 * s.parts.engine.lv) * od, sp = Math.hypot(tk.vx, tk.vy);
      if (sp > vmax) { tk.vx *= vmax / sp; tk.vy *= vmax / sp; }
    }
    tk.x += tk.vx * dt; tk.y += tk.vy * dt;
    tk.x = clamp(tk.x, 26, A - 26); tk.y = clamp(tk.y, 26, A - 26);
    tk.dist += Math.hypot(tk.vx, tk.vy) * dt;

    // fire trail
    if (st.fire) {
      tk.fireT -= dt;
      if (tk.fireT <= 0 && Math.hypot(tk.vx, tk.vy) > 40 && s.fires.length < 60) {
        tk.fireT = 0.1;
        const lv = s.parts.treads.lv;
        s.fires.push({ x: tk.x - Math.cos(tk.ang) * 20, y: tk.y - Math.sin(tk.ang) * 20, life: 2.2 + 0.4 * (lv - 3), max: 2.2 + 0.4 * (lv - 3), tick: 0.1, dps: 9 + 5 * (lv - 3) });
      }
    }

    // repair
    if (st.regen > 0 && tk.hp < tk.maxHp) tk.hp = Math.min(tk.maxHp, tk.hp + st.regen * dt);
    if (st.burst && tk.burstCd <= 0 && tk.hp < tk.maxHp * 0.3) {
      tk.burstCd = 35; tk.hp = Math.min(tk.maxHp, tk.hp + tk.maxHp * 0.25); ev(s, 'repair', tk.x, tk.y);
    }

    director(s, dt);
    buildGrid(s);

    // --- enemies
    const en = s.enemies;
    for (let i = 0; i < en.length; i++) { const e = en[i]; if (!e.dead) updateEnemy(s, e, dt); }

    // --- turret targeting / firing
    {
      let best = null, bd = st.tRange * st.tRange;
      for (let i = 0; i < en.length; i++) {
        const e = en[i]; if (e.dead) continue;
        const dx = e.x - tk.x, dy = e.y - tk.y, d2 = dx * dx + dy * dy - (e.big ? e.r * e.r : 0);
        if (d2 < bd) { bd = d2; best = e; }
      }
      s.target = best;
      if (best) {
        const want = Math.atan2(best.y - tk.y, best.x - tk.x), d = angDiff(want, tk.tur);
        const m = 8 * dt; tk.tur += clamp(d, -m, m);
        tk.tcd -= dt;
        if (tk.tcd <= 0 && Math.abs(d) < 0.22) {
          tk.tcd = 1 / st.tRate;
          const bx = tk.x + Math.cos(tk.tur) * 24, by = tk.y + Math.sin(tk.tur) * 24;
          const o = { pierce: st.tPierce, big: st.tPierce > 0 };
          if (st.tTwin) { spawnBullet(s, bx, by, tk.tur - 0.07, 560, st.tDmg, 0.75, o); spawnBullet(s, bx, by, tk.tur + 0.07, 560, st.tDmg, 0.75, o); }
          else spawnBullet(s, bx, by, tk.tur, 540, st.tDmg, 0.75, o);
          ev(s, 'shoot', bx, by, tk.tur);
        }
      } else {
        const d = angDiff(tk.ang, tk.tur); tk.tur += clamp(d, -4 * dt, 4 * dt);
      }
    }
    // --- side cannons
    for (let side = 0; side < 2; side++) {
      const lv = s.parts[side === 0 ? 'sideL' : 'sideR'].lv;
      if (lv <= 0) continue;
      tk.side[side] -= dt;
      if (tk.side[side] > 0) continue;
      const base = tk.ang + (side === 0 ? -Math.PI / 2 : Math.PI / 2);
      const sx = tk.x + Math.cos(base) * 14, sy = tk.y + Math.sin(base) * 14;
      let best = null, bd = st.sRange * st.sRange;
      for (let i = 0; i < en.length; i++) {
        const e = en[i]; if (e.dead) continue;
        const dx = e.x - sx, dy = e.y - sy, d2 = dx * dx + dy * dy;
        if (d2 < bd && Math.abs(angDiff(Math.atan2(dy, dx), base)) < 1.4) { bd = d2; best = e; }
      }
      if (best) {
        const ss = sideStats(lv), a = Math.atan2(best.y - sy, best.x - sx);
        tk.side[side] = ss.cd;
        if (ss.rocket) spawnBullet(s, sx, sy, a, 250, ss.dmg, 1.7, { rocket: true, splash: ss.splash });
        else spawnBullet(s, sx, sy, a, 460, ss.dmg, 0.6);
        ev(s, ss.rocket ? 'rocket' : 'sideshoot', sx, sy, a);
      }
    }

    // --- player bullets
    const bl = s.bullets, gw = s.gw, g = s.grid;
    for (let i = bl.length - 1; i >= 0; i--) {
      const b = bl[i];
      if (b.rocket) { // gentle homing
        let best = null, bd = 220 * 220;
        for (let j = 0; j < en.length; j++) {
          const e = en[j]; if (e.dead) continue;
          const dx = e.x - b.x, dy = e.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (best) {
          const sp = Math.hypot(b.vx, b.vy), ca = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y - b.y, best.x - b.x);
          const na = ca + clamp(angDiff(want, ca), -4.5 * dt, 4.5 * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let remove = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > A || b.y > A;
      if (!remove) {
        const cx = clamp((b.x / GS) | 0, 0, gw - 1), cy = clamp((b.y / GS) | 0, 0, gw - 1);
        const br = b.big ? 7 : 4;
        outer:
        for (let yy = Math.max(0, cy - 1); yy <= Math.min(gw - 1, cy + 1); yy++) {
          for (let xx = Math.max(0, cx - 1); xx <= Math.min(gw - 1, cx + 1); xx++) {
            const c = g[xx + yy * gw];
            for (let k = 0; k < c.length; k++) {
              const e = c[k]; if (e.dead) continue;
              const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + br;
              if (dx * dx + dy * dy < rr * rr) {
                if (b.hit[0] === e.id || b.hit[1] === e.id || b.hit[2] === e.id || b.hit[3] === e.id) continue;
                const sp = Math.hypot(b.vx, b.vy) || 1;
                damageEnemy(s, e, b.dmg, b.vx / sp * 90, b.vy / sp * 90);
                ev(s, 'hit', b.x, b.y);
                if (b.rocket) { boom(s, b.x, b.y, b.splash, b.dmg * 0.8); remove = true; break outer; }
                if (b.pierce > 0) { b.pierce--; b.hit[(b.pierce) & 3] = e.id; }
                else { remove = true; break outer; }
              }
            }
          }
        }
        if (!remove) {
          for (let j = 0; j < s.bosses.length; j++) {
            const e = s.bosses[j]; if (e.dead) continue;
            const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + 5;
            if (dx * dx + dy * dy < rr * rr) {
              if (b.hit[0] === e.id || b.hit[1] === e.id || b.hit[2] === e.id || b.hit[3] === e.id) continue;
              damageEnemy(s, e, b.dmg, 0, 0); ev(s, 'hit', b.x, b.y);
              if (b.rocket) { boom(s, b.x, b.y, b.splash, b.dmg * 0.8); remove = true; }
              else if (b.pierce > 0) { b.pierce--; b.hit[b.pierce & 3] = e.id; }
              else remove = true;
              break;
            }
          }
        }
      }
      if (remove) { if (b.rocket && b.life <= 0) boom(s, b.x, b.y, b.splash, b.dmg * 0.6); bl[i] = bl[bl.length - 1]; bl.pop(); s.bfree.push(b); }
    }

    // --- enemy bullets
    const eb = s.ebul;
    for (let i = eb.length - 1; i >= 0; i--) {
      const b = eb[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let rm = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > A || b.y > A;
      if (!rm) {
        const dx = tk.x - b.x, dy = tk.y - b.y;
        if (dx * dx + dy * dy < 18 * 18) { hurtTank(s, b.dmg); rm = true; }
      }
      if (rm) { eb[i] = eb[eb.length - 1]; eb.pop(); s.ebfree.push(b); }
    }

    // --- fire trail damage
    for (let i = s.fires.length - 1; i >= 0; i--) {
      const f = s.fires[i];
      f.life -= dt; f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.25;
        near(s, f.x, f.y, 16);
        const t = s.tmp;
        for (let j = 0; j < t.length; j++) damageEnemy(s, t[j], f.dps * 0.25, 0, 0);
        for (let j = 0; j < s.bosses.length; j++) {
          const e = s.bosses[j];
          if (!e.dead && Math.hypot(e.x - f.x, e.y - f.y) < e.r + 16) damageEnemy(s, e, f.dps * 0.25, 0, 0);
        }
      }
      if (f.life <= 0) { s.fires[i] = s.fires[s.fires.length - 1]; s.fires.pop(); }
    }

    // --- coins
    for (let i = s.coins.length - 1; i >= 0; i--) {
      const c = s.coins[i];
      c.age += dt;
      const dx = tk.x - c.x, dy = tk.y - c.y, d = Math.hypot(dx, dy) || 1;
      if (d < st.magnet) c.mag = true;
      if (c.mag) { const sp = 260 + 200 * Math.min(1, c.age); c.x += dx / d * sp * dt; c.y += dy / d * sp * dt; }
      if (d < 22) {
        s.coinsGot += c.v; ev(s, 'coin', c.x, c.y, c.v);
        s.coins[i] = s.coins[s.coins.length - 1]; s.coins.pop();
      }
    }
    // --- crates
    for (let i = s.crates.length - 1; i >= 0; i--) {
      const c = s.crates[i];
      c.age += dt;
      const dx = tk.x - c.x, dy = tk.y - c.y;
      if (dx * dx + dy * dy < 30 * 30) {
        s.crates[i] = s.crates[s.crates.length - 1]; s.crates.pop();
        openCrate(s, c);
      }
    }

    // --- cleanup dead enemies
    let w = 0;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead) {
        s.efree.push(e);
        if (e.big) { const bi = s.bosses.indexOf(e); if (bi >= 0) s.bosses.splice(bi, 1); }
      } else en[w++] = e;
    }
    en.length = w;
  }

  // ---------- result ----------
  function result(s) {
    return { coins: s.coinsGot + (s.won ? 150 : 0), time: s.t, kills: s.kills, won: s.won };
  }

  // ---------- simple bot (used by the sanity sim) ----------
  function bot(s) {
    const tk = s.tank, A = root.CFG.ARENA;
    let vx = 0, vy = 0;
    for (const e of s.enemies) {
      const dx = tk.x - e.x, dy = tk.y - e.y, d = Math.hypot(dx, dy) || 1, R = 150 + e.r;
      if (d < R) { const w = (R - d) / R * (e.big ? 3 : 1.2); vx += dx / d * w; vy += dy / d * w; }
    }
    let target = null, bd = 1e9;
    for (const c of s.crates) { const d = Math.hypot(c.x - tk.x, c.y - tk.y); if (d < bd) { bd = d; target = c; } }
    if (target && Math.hypot(vx, vy) < 1.5) { const d = bd || 1; vx += (target.x - tk.x) / d * 0.8; vy += (target.y - tk.y) / d * 0.8; }
    for (const c of s.coins) { const d = Math.hypot(c.x - tk.x, c.y - tk.y); if (d < 120) { vx += (c.x - tk.x) / d * 0.25; vy += (c.y - tk.y) / d * 0.25; } }
    const m = 130; // stay away from walls
    if (tk.x < m) vx += (m - tk.x) / m * 1.5; if (tk.x > A - m) vx -= (tk.x - (A - m)) / m * 1.5;
    if (tk.y < m) vy += (m - tk.y) / m * 1.5; if (tk.y > A - m) vy -= (tk.y - (A - m)) / m * 1.5;
    const l = Math.hypot(vx, vy);
    if (l < 0.05) return { jx: Math.cos(s.t * 0.4), jy: Math.sin(s.t * 0.4) };
    return { jx: vx / Math.max(1, l) * Math.min(1, l * 2), jy: vy / Math.max(1, l) * Math.min(1, l * 2) };
  }

  root.Core = { create, update, revive, result, bot, recalc, sideStats, PART_KEYS, EN };
  if (typeof module !== 'undefined') module.exports = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
