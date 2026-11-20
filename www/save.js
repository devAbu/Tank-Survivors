// Local progress: coins, best results, settings, cosmetics. Stored in localStorage only.
(function (root) {
  'use strict';
  const KEY = 'ts_save_v1';

  // Cosmetics have no effect on gameplay. Prices in coins.
  const PAINTS = [
    { c1: '#6f8f3a', c2: '#46602a', price: 0 },
    { c1: '#c9ad6a', c2: '#8f7a42', price: 60 },
    { c1: '#cfe0ea', c2: '#8aa3b3', price: 90 },
    { c1: '#c8443a', c2: '#8a2620', price: 120 },
    { c1: '#8a63d2', c2: '#59399a', price: 160 },
    { c1: '#2fa99c', c2: '#1b6b63', price: 160 },
    { c1: '#e0b53a', c2: '#a37a14', price: 260 },
    { c1: '#3a4558', c2: '#1c222d', price: 320 }
  ];
  const DECALS = [
    { id: 'none', price: 0 }, { id: 'star', price: 80 }, { id: 'stripes', price: 100 }, { id: 'bolt', price: 140 },
    { id: 'skull', price: 200 }, { id: 'checker', price: 220 }, { id: 'flame', price: 280 }
  ];

  function fresh() {
    return {
      coins: 0, runs: 0, wins: 0, bestTime: 0, bestKills: 0, hintDone: false,
      ownP: [0], ownD: [0], eqP: 0, eqD: 0,
      music: true, sfx: true, vib: true
    };
  }
  let data = fresh();
  try {
    const raw = root.localStorage && root.localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); data = Object.assign(fresh(), o); }
  } catch (e) { /* ignore */ }

  function commit() { try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }

  root.Save = {
    data: data, PAINTS: PAINTS, DECALS: DECALS, commit: commit,
    addCoins: function (n) { data.coins += n; commit(); },
    buyPaint: function (i) {
      if (data.ownP.indexOf(i) >= 0) { data.eqP = i; commit(); return true; }
      if (data.coins < PAINTS[i].price) return false;
      data.coins -= PAINTS[i].price; data.ownP.push(i); data.eqP = i; commit(); return true;
    },
    buyDecal: function (i) {
      if (data.ownD.indexOf(i) >= 0) { data.eqD = i; commit(); return true; }
      if (data.coins < DECALS[i].price) return false;
      data.coins -= DECALS[i].price; data.ownD.push(i); data.eqD = i; commit(); return true;
    },
    finishRun: function (res) {
      data.runs++; if (res.won) data.wins++;
      data.bestTime = Math.max(data.bestTime, Math.floor(res.time));
      data.bestKills = Math.max(data.bestKills, res.kills);
      data.coins += res.coins; commit();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
