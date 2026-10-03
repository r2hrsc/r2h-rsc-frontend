// R2H ARENA BOT POINTER (v2, 2026-10-03 — "Edge Rail" redesign)
// Pure logic module for the PVP Arena (world 2): a small chip that rides the
// viewport EDGE nearest to the direction of the target bot, showing a chevron
// + bracketed combat level. Distance is encoded as chevron colour (heat ramp),
// not text. Main-world pages never load the wiring, so this is inert there.
//
// Architecture (mirrors r2h-area-logic.js): NO DOM in this file. Factory
// takes {fetchBots, show, hide, now, getViewport}; caller wires DOM + mc.
// Offline harness: tools/test-bot-pointer.cjs.
//
// VERIFIED MECHANICS (v2):
//   - Player position: __r2h_mc.bJ+du / bK+dd (minified, version-specific).
//   - In-world gate: mc.fv === 1 (login/title screens must NOT show the chip;
//     v1 bug — it rendered over the title backdrop).
//   - Wilderness level (server parity): 2203-(rawY+(1776-944*floor)); >0 = wild.
//   - CAMERA: the served classes.js minimap line `f=(a.ey+a.p2|0)&255` with the
//     1024-entry sin/cos table gives, solving the projection at r=0 (up=north)
//     and r=64 (up=east): camera heading clockwise-from-north = r*360/256 where
//     r = (Number(ey)+Number(p2))&255. Screen bearing = world bearing - heading.
//     If ey/p2 are unreadable, fall back to world-absolute bearing (v1 behavior)
//     and flag cameraRelative:false — a wrong-frame arrow, but never a crash.
//   - RSC world axes: x increases WEST, y increases SOUTH (world bearing 0 = N).
//
// BEHAVIOUR (Edge Rail spec, Claude design review 2026-10-03):
//   - Target hysteresis: switch targets only when the new best is ≥12% closer
//     than the sticky one — kills 2 Hz flapping between near-equal bots.
//   - Engage lock: within 2 tiles, lock the target until it is 6+ tiles away
//     or absent from the payload — the chip must not teleport mid-fight.
//   - Rail projection: player is at viewport centre; cast a ray at the
//     screen-relative bearing; intersect with the frame inset rect; the chip
//     centres on the exit point. Legal arc: full LEFT edge; TOP edge only to
//     x ≤ 61% width; BOTTOM edge only to x ≤ 61% width (icon strip top-right,
//     skull bottom-right are reserved); RIGHT edge has NO rail — clamp to the
//     nearest legal corner and raise `parked` so the wiring shows a caption.
(function () {
  'use strict';

  var FLOOR_STRIDE = 944;

  function createR2HBotPointer(deps) {
    var FETCH_MS = deps.fetchMs || 5000;
    var TICK_MS = deps.tickMs || 500;
    var STICKY_MARGIN = 0.88;   // switch only if newBest < sticky * 0.88
    var LOCK_AT = 2;            // tiles: engage lock engages
    var UNLOCK_AT = 6;          // tiles: engage lock releases
    var lastFetch = -1;
    var bots = null;
    var stickyName = null;      // hysteresis state
    var lockedName = null;      // engage-lock state

    // Returns {x, y} or null on ANY doubt (same safety rule as the popup).
    function readPosition(mc) {
      if (!mc) return null;
      var bJ = mc.bJ, bK = mc.bK, du = mc.du, dd = mc.dd;
      if (bJ === undefined || bK === undefined || du === undefined || dd === undefined) return null;
      var x = Number(bJ) + Number(du);
      var y = Number(mc.bK) + Number(mc.dd);
      if (!isFinite(x) || !isFinite(y)) return null;
      if (x < 0 || y < 0 || x >= 944 || y >= 4 * FLOOR_STRIDE) return null;
      return { x: x, y: y };
    }

    function inWorld(mc) {
      return !!(mc && Number(mc.fv) === 1);
    }

    function wildernessLevel(rawY) {
      var floor = Math.floor(rawY / FLOOR_STRIDE);
      var wild = 2203 - (rawY + (1776 - (FLOOR_STRIDE * floor)));
      return wild > 0 ? 1 + Math.floor(wild / 6) : 0;
    }

    // World bearing, 0 = north, clockwise. RSC: x west, y south.
    function bearingDeg(me, bot) {
      var north = -(bot.y - me.y);
      var east = -(bot.x - me.x);
      var deg = Math.atan2(east, north) * 180 / Math.PI;
      return (deg + 360) % 360;
    }

    function dist(me, bot) {
      return Math.sqrt((bot.x - me.x) * (bot.x - me.x) + (bot.y - me.y) * (bot.y - me.y));
    }

    // Camera heading in degrees clockwise from north; null if unreadable.
    function cameraDeg(mc) {
      if (!mc || mc.ey === undefined) return null;
      var r = (Number(mc.ey) + (Number(mc.p2) || 0)) & 255;
      if (!isFinite(r)) return null;
      return r * 360 / 256;
    }

    // Hysteresis + engage-lock target selection. Returns {bot, dist} or null.
    function pick(me, list) {
      var i, b, d;
      // engage lock: hold while close and present
      if (lockedName) {
        for (i = 0; i < list.length; i++) {
          if (list[i].n === lockedName) {
            d = dist(me, list[i]);
            if (d <= UNLOCK_AT) return { bot: list[i], dist: d };
            break;
          }
        }
        lockedName = null; // absent or >UNLOCK_AT: release
      }
      var best = null, bestD = Infinity;
      for (i = 0; i < list.length; i++) {
        b = list[i];
        if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
        d = dist(me, b);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (!best) { stickyName = null; return null; }
      // sticky: keep previous target unless clearly beaten
      if (stickyName && stickyName !== best.n) {
        for (i = 0; i < list.length; i++) {
          if (list[i].n === stickyName) {
            var sd = dist(me, list[i]);
            if (bestD < sd * STICKY_MARGIN) break; // clearly better: switch
            return { bot: list[i], dist: sd };     // sticky wins
          }
        }
      }
      stickyName = best.n;
      if (bestD <= LOCK_AT) lockedName = best.n;
      return { bot: best, dist: bestD };
    }

    function heat(d) {
      if (d <= 5) return '#ff4444';
      if (d <= 15) return '#ff8c1a';
      if (d <= 30) return '#e8d44d';
      return '#cfc98f';
    }

    // Project a screen-relative bearing (0 = up, clockwise) from the viewport
    // centre onto the frame rect inset by `inset`. Legal arc per spec. Returns
    // {x, y, edge, parked} in viewport coordinates (chip centre).
    function railPoint(screenDeg, vw, vh) {
      var rad = screenDeg * Math.PI / 180;
      var dx = Math.sin(rad);        // 0deg=up: +x right
      var dy = -Math.cos(rad);       // 0deg=up: +y down (screen)
      var cx = vw / 2, cy = vh / 2;
      var inset = 22;                // chip half-height keeps it fully on-frame
      var tMin = Infinity, edge = null;
      if (dx > 0) { var t = (vw - inset - cx) / dx; if (t < tMin) { tMin = t; edge = 'right'; } }
      if (dx < 0) { var t2 = (inset - cx) / dx; if (t2 < tMin) { tMin = t2; edge = 'left'; } }
      if (dy > 0) { var t3 = (vh - inset - cy) / dy; if (t3 < tMin) { tMin = t3; edge = 'bottom'; } }
      if (dy < 0) { var t4 = (inset - cy) / dy; if (t4 < tMin) { tMin = t4; edge = 'top'; } }
      var x = cx + dx * tMin;
      var y = cy + dy * tMin;
      // legal arc: right edge FORBIDDEN; top/bottom only to 61% width
      var parked = false;
      var limitX = vw * 0.61;
      if (edge === 'right' || x > limitX) {
        parked = true;
        var goTop = y < vh / 2;
        x = inset;
        y = goTop ? inset : vh - inset;
        edge = goTop ? 'top' : 'bottom';
      } else if (edge === 'top' || edge === 'bottom') {
        x = Math.min(Math.max(x, inset), limitX);
      } else {
        y = Math.min(Math.max(y, inset), vh - inset);
      }
      return { x: Math.round(x), y: Math.round(y), edge: edge, parked: parked };
    }

    function tick(mc) {
      var now = deps.now ? deps.now() : Date.now();
      var showable = false;
      var me = null;
      if (inWorld(mc)) {
        me = readPosition(mc);
        showable = !!(me && wildernessLevel(me.y) > 0);
      }
      if (!showable) {
        // leaving world/wilderness releases all target state
        stickyName = null; lockedName = null;
        deps.hide();
        return;
      }
      if (bots === null || now - lastFetch >= FETCH_MS) {
        lastFetch = now;
        Promise.resolve(deps.fetchBots()).then(function (j) {
          bots = (j && j.bots && j.bots.length) ? j.bots : [];
        }).catch(function () { /* keep last good list */ });
      }
      if (!bots || bots.length === 0) { deps.hide(); return; }
      var pickR = pick(me, bots);
      if (!pickR) { deps.hide(); return; }
      var world = bearingDeg(me, pickR.bot);
      var cam = cameraDeg(mc);
      var screen = cam === null ? world : (world - cam + 360) % 360;
      var vp = (deps.getViewport ? deps.getViewport() : null) || { w: 1280, h: 633 };
      var rail = railPoint(screen, vp.w, vp.h);
      deps.show({
        deg: screen,                 // chevron rotation (screen-relative)
        heat: heat(pickR.dist),
        combat: (typeof pickR.bot.cb === 'number') ? pickR.bot.cb : null,
        name: pickR.bot.n || '',
        parked: rail.parked,
        x: rail.x,
        y: rail.y,
        cameraRelative: cam !== null
      });
    }

    return {
      tick: tick, TICK_MS: TICK_MS,
      _wildernessLevel: wildernessLevel, _bearingDeg: bearingDeg,
      _readPosition: readPosition, _cameraDeg: cameraDeg,
      _pick: pick, _railPoint: railPoint, _heat: heat
    };
  }

  window.R2HBotPointer = { create: createR2HBotPointer };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { create: createR2HBotPointer };
  }
})();
