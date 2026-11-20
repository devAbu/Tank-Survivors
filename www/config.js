// Balance and gameplay settings. Tweak numbers here, no other file needs to change.
(function (root) {
  'use strict';
  root.CFG = {
    ROUND_SECONDS: 600,          // 10 minutes
    MINIBOSS_EVERY: 180,         // mini-boss at 3:00, 6:00, 9:00
    MAINBOSS_AT: 600,            // final boss at 10:00
    ARENA: 1500,                 // arena is ARENA x ARENA world units
    MAX_ENEMIES: 140,
    MAX_PART_LEVEL: 5,
    EVOLVE_LEVEL: 3,             // level where a part evolves
    CRATE_EVERY: 13,             // seconds between crate spawns
    MAX_CRATES: 3,
    TANK_HP: 100,
    COIN_SCALE: 1,               // multiplier on coins earned
    REVIVE_HP: 0.6,
    AD_COOLDOWN: 30,             // seconds, simulated rewarded ads
    AD_SIM_SECONDS: 3            // simulated ad length
  };
})(typeof window !== 'undefined' ? window : globalThis);
