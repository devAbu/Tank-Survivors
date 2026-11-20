// AdService - the ONLY place that knows about ads. Currently a simulation:
// button shows a short countdown, grants the reward, then a cooldown.
// To go live: replace the body of show() with the real AdMob rewarded-ad call
// (resolve true when the reward is earned) and keep state()/show() signatures.
(function (root) {
  'use strict';
  const slots = {}; // placement -> { until: ms, mode: 'playing' | 'cooldown' }

  function slot(p) { return slots[p] || (slots[p] = { until: 0, mode: 'ready' }); }

  root.AdService = {
    // -> { status: 'ready' | 'playing' | 'cooldown', left: seconds (may be 0 for a real SDK) }
    state: function (p) {
      const s = slot(p), now = Date.now();
      if (s.mode !== 'ready' && now >= s.until) {
        if (s.mode === 'playing') return { status: 'playing', left: 0 }; // waiting for show() to settle
        s.mode = 'ready';
      }
      if (s.mode === 'ready') return { status: 'ready', left: 0 };
      return { status: s.mode, left: Math.max(0, Math.ceil((s.until - now) / 1000)) };
    },
    // -> Promise<boolean>: true if the reward should be given
    show: function (p) {
      const s = slot(p);
      if (this.state(p).status !== 'ready') return Promise.resolve(false);
      const CFG = root.CFG;
      s.mode = 'playing'; s.until = Date.now() + CFG.AD_SIM_SECONDS * 1000;
      return new Promise(function (resolve) {
        setTimeout(function () {
          s.mode = 'cooldown'; s.until = Date.now() + CFG.AD_COOLDOWN * 1000;
          resolve(true);
        }, CFG.AD_SIM_SECONDS * 1000);
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
