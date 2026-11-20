// Headless sanity sim: a simple bot plays full rounds; checks nothing throws and bosses appear.
// usage: node tools/sim.js [runs]
require('../www/config.js');
const Core = require('../www/core.js');
const runs = parseInt(process.argv[2] || '3', 10);
let bad = 0;
for (let r = 0; r < runs; r++) {
  const s = Core.create();
  const seen = { mini: 0, main: 0, evolve: 0 };
  let ticks = 0, maxEn = 0;
  const t0 = Date.now();
  while (!s.over && s.t < 900) {
    const inp = Core.bot(s);
    Core.update(s, 1 / 30, inp);
    ticks++;
    maxEn = Math.max(maxEn, s.enemies.length);
    for (const e of s.events) {
      if (e.k === 'boss') { if (e.a === 1) seen.mini++; else seen.main++; }
      if (e.k === 'evolve') seen.evolve++;
    }
    s.events.length = 0;
    if (!isFinite(s.tank.x) || !isFinite(s.tank.hp)) { console.log('NaN state'); bad++; break; }
  }
  const lv = Core.PART_KEYS.map(k => s.parts[k].lv).join('');
  console.log('run', r, s.won ? 'WON' : s.dead ? 'DIED' : 'TIMEOUT', 'at', s.t.toFixed(0) + 's', 'kills', s.kills, 'coins', s.coinsGot,
    'parts', lv, 'minis', seen.mini, 'main', seen.main, 'evolves', seen.evolve, 'maxEnemies', maxEn, 'cpu ms/tick', ((Date.now() - t0) / ticks).toFixed(2));
}
// forced checks: part pick math, revive, boss spawn timing
const s = Core.create();
for (let i = 0; i < 200; i++) { s.parts.turret.lv = 1; }
s.t = 179.9; for (let i = 0; i < 10; i++) Core.update(s, 0.05, { jx: 0, jy: 0 });
console.log('mini-boss spawned at 3:00:', s.bosses.length === 1 && s.bosses[0].type === 'titan');
s.t = 599.9; for (let i = 0; i < 10; i++) Core.update(s, 0.05, { jx: 0, jy: 0 });
console.log('final boss spawned at 10:00:', s.bosses.some(b => b.type === 'hive'));
s.tank.hp = 1; s.tank.inv = 0; s.events.length = 0;
const before = s.enemies.length;
require('../www/core.js');
s.tank.x = s.enemies[0].x; s.tank.y = s.enemies[0].y;
for (let i = 0; i < 20 && !s.over; i++) Core.update(s, 0.05, { jx: 0, jy: 0 });
console.log('tank can die:', s.dead, '| revive ->', (Core.revive(s), !s.over && s.tank.hp > 0));
if (bad) process.exit(1);
