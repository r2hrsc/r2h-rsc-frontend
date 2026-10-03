// R2H ARENA BOT POINTER (v1, 2026-10-03)
// Pure logic module for the PVP Arena (world 2): a small compass arrow at the
// very top-centre of the game screen that points toward the NEAREST arena bot
// while the local player is inside the Wilderness. Main-world pages never load
// the wiring, so this module is inert there.
//
// Architecture (mirrors r2h-area-logic.js):
//   - NO DOM in this file. Factory takes {fetchBots, show, hide, now} and the
//     caller (index.html wiring) supplies DOM callbacks + window.__r2h_mc.
//   - Offline-testable in Node (see tools/test-bot-pointer.cjs).
//
// Verified mechanics carried in from r2h-area-logic.js (2026-09-30 session):
//   - Player position: window.__r2h_mc with MINIFIED, version-specific fields
//     bJ/bK (region base) + du/dd (region offset); x = bJ+du, y = bK+dd.
//     Re-verify after ANY classes.js rebuild before trusting the pointer.
//   - Wilderness level (server parity): floor = floor(rawY/944);
//     wild = 2203 - (rawY + (1776 - 944*floor)); lvl = wild>0 ? 1+int(wild/6) : 0.
//     On floor 0 this reduces to 427 - y, matching the arena bounds plugin.
//   - RSC compass: y DECREASES northward; x INCREASES westward.
//
// Data source: GET {apiBase}/v1/arena/bots -> { ts, bots: [{n, x, y, cb}] }
// (roster-filtered, read-only, server-cached). The client cannot see bots
// outside its viewport, hence the sidecar endpoint.
(function () {
  'use strict';

  var FLOOR_STRIDE = 944;

  function createR2HBotPointer(deps) {
    var FETCH_MS = deps.fetchMs || 5000;   // bot list refresh cadence
    var TICK_MS = deps.tickMs || 500;      // render cadence
    var lastFetch = -1;
    var bots = null;                       // null = never fetched; [] = none

    // Returns {x, y} or null on ANY doubt (same safety rule as the popup).
    function readPosition(mc) {
      if (!mc) return null;
      var bJ = mc.bJ, bK = mc.bK, du = mc.du, dd = mc.dd;
      if (bJ === undefined || bK === undefined || du === undefined || dd === undefined) return null;
      var x = Number(bJ) + Number(du);
      var y = Number(bK) + Number(dd);
      if (!isFinite(x) || !isFinite(y)) return null;
      if (x < 0 || y < 0 || x >= 944 || y >= 4 * FLOOR_STRIDE) return null;
      return { x: x, y: y };
    }

    function wildernessLevel(rawY) {
      var floor = Math.floor(rawY / FLOOR_STRIDE);
      var wild = 2203 - (rawY + (1776 - (FLOOR_STRIDE * floor)));
      return wild > 0 ? 1 + Math.floor(wild / 6) : 0;
    }

    // Bearing for a CSS triangle that points UP at 0deg, clockwise positive.
    // dx>0: bot west of us. dy>0: bot south of us. north=-dy, east=-dx.
    function bearingDeg(me, bot) {
      var north = -(bot.y - me.y);
      var east = -(bot.x - me.x);
      var deg = Math.atan2(east, north) * 180 / Math.PI;
      return (deg + 360) % 360;
    }

    function nearest(me, list) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
        var d = Math.sqrt((b.x - me.x) * (b.x - me.x) + (b.y - me.y) * (b.y - me.y));
        if (d < bestD) { bestD = d; best = b; }
      }
      return best ? { bot: best, dist: Math.round(bestD) } : null;
    }

    function tick(mc) {
      var now = deps.now ? deps.now() : Date.now();
      var me = readPosition(mc);
      var inWild = !!(me && wildernessLevel(me.y) > 0);

      // Refresh the bot list (only while it can be shown; fail-soft).
      if (inWild && (bots === null || now - lastFetch >= FETCH_MS)) {
        lastFetch = now;
        Promise.resolve(deps.fetchBots()).then(function (j) {
          bots = (j && j.bots && j.bots.length) ? j.bots : [];
        }).catch(function () { /* keep last good list */ });
      }

      if (!inWild || !bots || bots.length === 0) { deps.hide(); return; }
      var pick = nearest(me, bots);
      if (!pick) { deps.hide(); return; }
      deps.show({
        deg: bearingDeg(me, pick.bot),
        dist: pick.dist,
        name: pick.bot.n || '',
        combat: (typeof pick.bot.cb === 'number') ? pick.bot.cb : null
      });
    }

    return { tick: tick, TICK_MS: TICK_MS, _wildernessLevel: wildernessLevel, _bearingDeg: bearingDeg, _nearest: nearest, _readPosition: readPosition };
  }

  window.R2HBotPointer = { create: createR2HBotPointer };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { create: createR2HBotPointer };
  }
})();
