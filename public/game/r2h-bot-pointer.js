// R2H ARENA BOT POINTER (v3, 2026-10-03 - "Target Rim")
// Pure logic module for the PVP Arena (world 2): up to 5 level-tagged markers
// ride the viewport rim, one per nearby bot, at each bot's screen bearing.
// The LEADER (hysteresis/engage-lock winner) is larger, bright, chevroned and
// heat-coloured; alternates are smaller and dimmer. A rim of markers is a
// selection UI: the player chooses which fight to take.
//
// Architecture: NO DOM here. Factory deps {fetchBots, show, hide, now,
// getViewport}. Offline harness: tools/test-bot-pointer.cjs.
//
// VERIFIED GEOMETRY (v3, from the client Java source + live canvas probe):
//   - Canvas backing 512x345 (gameWidth 512, gameHeight 334+11), CSS-stretched
//     to viewport. Icon strip: surface x 312..509 (field_723-200..-3), y 3..35
//     -> fractions x >= 0.609w, y <= 0.101h. Skull: sprite (453, h-56), text
//     centre 465, text rows h-20/h-7 -> x 0.85..0.97w, y 0.805..0.948h.
//     The RIGHT edge between the two blocks is EMPTY and legal.
//   - Legal arc: LEFT edge full; TOP to x <= TOP_MAX; BOTTOM to x <= BOT_MAX;
//     RIGHT for RIGHT_LO <= y <= RIGHT_HI. Park branches move TOWARD the bot
//     (v2 bug: parked 129/360 bearings on the FAR side; fixed + tested).
//
// Carried unchanged from v2 (verified): mc.ey+p2 camera heading (256
// units/circle), fv===1 in-world gate, wilderness formula, fail-soft fetch,
// hysteresis STICKY_MARGIN 0.88 / LOCK_AT 2 / UNLOCK_AT 6.
(function () {
  'use strict';

  var FLOOR_STRIDE = 944;
  // furniture fractions (see header): computed from canvas, not hardcoded px
  var STRIP_X0 = 0.609, STRIP_Y1 = 0.101;   // top-right icon strip
  var SKULL_X0 = 0.850, SKULL_Y0 = 0.805;   // bottom-right skull block

  function createR2HBotPointer(deps) {
    var FETCH_MS = deps.fetchMs || 5000;
    var TICK_MS = deps.tickMs || 500;
    var STICKY_MARGIN = 0.88;
    var LOCK_AT = 2;
    var UNLOCK_AT = 6;
    var MAX_MARKERS = 5;
    var CULL_TILES = 60;
    var GAP = 28;                 // min px between markers on the same edge
    var lastFetch = -1;
    var bots = null;
    var stickyName = null;      // hysteresis state
    var lockedName = null;      // engage-lock state

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

    function bearingDeg(me, bot) {
      var north = -(bot.y - me.y);
      var east = -(bot.x - me.x);
      var deg = Math.atan2(east, north) * 180 / Math.PI;
      return (deg + 360) % 360;
    }

    function dist(me, bot) {
      return Math.sqrt((bot.x - me.x) * (bot.x - me.x) + (bot.y - me.y) * (bot.y - me.y));
    }

    function cameraDeg(mc) {
      if (!mc || mc.ey === undefined) return null;
      var r = (Number(mc.ey) + (Number(mc.p2) || 0)) & 255;
      if (!isFinite(r)) return null;
      return r * 360 / 256;
    }

    function heat(d) {
      if (d <= 5) return '#ff4444';
      if (d <= 15) return '#ff8c1a';
      if (d <= 30) return '#e8d44d';
      return '#cfc98f';
    }

    // Banded tile label: exact under 10, nearest 5 to 30, then 10s with '+'.
    function tileLabel(d) {
      var n = Math.round(d);
      if (n <= 9) return String(n);
      if (n <= 30) return String(Math.round(n / 5) * 5);
      return (Math.floor(n / 10) * 10) + '+';
    }

    // Hysteresis/lock winner among candidates (leader semantics from v2).
    function pickLeader(me, list) {
      var i, b, d;
      if (lockedName) {
        for (i = 0; i < list.length; i++) {
          if (list[i].n === lockedName) {
            d = dist(me, list[i]);
            if (d <= UNLOCK_AT) return { bot: list[i], dist: d };
            break;
          }
        }
        lockedName = null;
      }
      var best = null, bestD = Infinity;
      for (i = 0; i < list.length; i++) {
        b = list[i];
        if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
        d = dist(me, b);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (!best) { stickyName = null; return null; }
      if (stickyName && stickyName !== best.n) {
        for (i = 0; i < list.length; i++) {
          if (list[i].n === stickyName) {
            var sd = dist(me, list[i]);
            if (bestD < sd * STICKY_MARGIN) break;
            return { bot: list[i], dist: sd };
          }
        }
      }
      stickyName = best.n;
      if (bestD <= LOCK_AT) lockedName = best.n;
      return { bot: best, dist: bestD };
    }

    // Rail projection with the OPEN right edge and explicit park branches.
    // Every park branch moves the marker TOWARD the bot's bearing, never away.
    function railPoint(screenDeg, vw, vh) {
      var rad = screenDeg * Math.PI / 180;
      var dx = Math.sin(rad);
      var dy = -Math.cos(rad);
      var cx = vw / 2, cy = vh / 2;
      var INSET_X = 50;   // half the widest marker (96/2) + 2
      var INSET_Y = 22;
      var TOP_MAX = STRIP_X0 * vw - 48;   // stripLeft - leader half-width
      var BOT_MAX = SKULL_X0 * vw - 48;   // skullLeft - leader half-width
      var RIGHT_LO = STRIP_Y1 * vh + 22;  // stripBottom + marker half-height
      var RIGHT_HI = SKULL_Y0 * vh - 22;  // skullTop - marker half-height
      if (TOP_MAX < INSET_X) TOP_MAX = INSET_X;
      if (BOT_MAX < INSET_X) BOT_MAX = INSET_X;
      if (RIGHT_HI < RIGHT_LO) RIGHT_HI = RIGHT_LO;

      var tMin = Infinity, edge = null;
      if (dx > 0) { var t = (vw - INSET_X - cx) / dx; if (t < tMin) { tMin = t; edge = 'right'; } }
      if (dx < 0) { var t2 = (INSET_X - cx) / dx; if (t2 < tMin) { tMin = t2; edge = 'left'; } }
      if (dy > 0) { var t3 = (vh - INSET_Y - cy) / dy; if (t3 < tMin) { tMin = t3; edge = 'bottom'; } }
      if (dy < 0) { var t4 = (INSET_Y - cy) / dy; if (t4 < tMin) { tMin = t4; edge = 'top'; } }
      var x = cx + dx * tMin;
      var y = cy + dy * tMin;
      var parked = false;

      if (edge === 'right') {
        if (y < RIGHT_LO) {
          edge = 'top'; y = INSET_Y; x = TOP_MAX; parked = true;
        } else if (y > RIGHT_HI) {
          edge = 'bottom'; y = vh - INSET_Y; x = BOT_MAX; parked = true;
        } else {
          x = vw - INSET_X;
        }
      } else if (edge === 'top') {
        y = INSET_Y;
        if (x > TOP_MAX) { x = TOP_MAX; parked = true; }
      } else if (edge === 'bottom') {
        y = vh - INSET_Y;
        if (x > BOT_MAX) { x = BOT_MAX; parked = true; }
      } else {
        x = INSET_X; // left edge
        if (y < INSET_Y) y = INSET_Y;
        if (y > vh - INSET_Y) y = vh - INSET_Y;
      }
      return { x: Math.round(x), y: Math.round(y), edge: edge, parked: parked };
    }

    // Forward de-overlap along each edge's own axis; overflow pushes the run
    // backwards from the segment end, then clamps to the segment start.
    function spreadByEdge(markers, vw, vh) {
      var INSET_X = 50, INSET_Y = 22;
      var TOP_MAX = STRIP_X0 * vw - 48, BOT_MAX = SKULL_X0 * vw - 48;
      if (TOP_MAX < INSET_X) TOP_MAX = INSET_X;
      if (BOT_MAX < INSET_X) BOT_MAX = INSET_X;
      var edges = {};
      var i, m;
      for (i = 0; i < markers.length; i++) {
        m = markers[i];
        (edges[m.edge] = edges[m.edge] || []).push(m);
      }
      for (var e in edges) {
        var group = edges[e];
        var axis = (e === 'top' || e === 'bottom') ? 'x' : 'y';
        group.sort(function (a, b) { return a[axis] - b[axis]; });
        for (i = 1; i < group.length; i++) {
          if (group[i][axis] - group[i - 1][axis] < GAP) {
            group[i][axis] = group[i - 1][axis] + GAP;
          }
        }
        // overflow: push the run backwards from the segment's far end
        var lo, hi;
        if (axis === 'x') {
          lo = INSET_X; hi = (e === 'top') ? TOP_MAX : BOT_MAX;
        } else {
          lo = INSET_Y; hi = vh - INSET_Y;
        }
        var last = group[group.length - 1];
        if (last[axis] > hi) {
          var over = last[axis] - hi;
          for (i = group.length - 1; i >= 0; i--) group[i][axis] -= over;
        }
        for (i = 0; i < group.length; i++) {
          if (group[i][axis] < lo) group[i][axis] = lo;
        }
      }
      return markers;
    }

    function tick(mc) {
      var now = deps.now ? deps.now() : Date.now();
      var me = null;
      var showable = false;
      if (inWorld(mc)) {
        me = readPosition(mc);
        showable = !!(me && wildernessLevel(me.y) > 0);
      }
      if (!showable) {
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

      // LEADER: chosen from ALL bots, never culled — the pointer's core job
      // (v3.1 fix: v3 culled the leader too, so any spot with no bot within
      // CULL_TILES showed NOTHING where v2 showed the far bot; the founder
      // navigates by this pointer across empty wilderness).
      var leader = pickLeader(me, bots.filter(function (b2) {
        return typeof b2.x === 'number' && typeof b2.y === 'number';
      }));
      if (!leader) { deps.hide(); return; }

      // candidates for ALTERNATES: in range only (rim-noise control)
      var cand = [], i, b, d;
      for (i = 0; i < bots.length; i++) {
        b = bots[i];
        if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
        d = dist(me, b);
        if (d > CULL_TILES) continue;
        cand.push({ bot: b, dist: d });
      }
      if (cand.length === 0) { cand = [{ bot: leader.bot, dist: leader.dist }]; } // leader alone: pointer never blanks
      cand.sort(function (a, b2) { return a.dist - b2.dist; });

      // markers: leader first, then nearest alternates, max MAX_MARKERS
      var chosen = [];
      var seen = {};
      seen[leader.bot.n] = true;
      chosen.push({ bot: leader.bot, dist: leader.dist, leader: true });
      for (i = 0; i < cand.length && chosen.length < MAX_MARKERS; i++) {
        if (seen[cand[i].bot.n]) continue;
        seen[cand[i].bot.n] = true;
        chosen.push({ bot: cand[i].bot, dist: cand[i].dist, leader: false });
      }

      var cam = cameraDeg(mc);
      var vp = (deps.getViewport ? deps.getViewport() : null) || { w: 1280, h: 633 };
      var out = [];
      for (i = 0; i < chosen.length; i++) {
        var c = chosen[i];
        var world = bearingDeg(me, c.bot);
        var screen = cam === null ? world : (world - cam + 360) % 360;
        var rail = railPoint(screen, vp.w, vp.h);
        out.push({
          leader: c.leader,
          name: c.bot.n || '',
          combat: (typeof c.bot.cb === 'number') ? c.bot.cb : null,
          tiles: tileLabel(c.dist),
          heat: heat(c.dist),
          deg: screen,
          x: rail.x, y: rail.y, edge: rail.edge, parked: rail.parked
        });
      }
      spreadByEdge(out, vp.w, vp.h);
      deps.show({ markers: out, cameraRelative: cam !== null });
    }

    return {
      tick: tick, TICK_MS: TICK_MS,
      _wildernessLevel: wildernessLevel, _bearingDeg: bearingDeg,
      _readPosition: readPosition, _cameraDeg: cameraDeg,
      _pickLeader: pickLeader, _railPoint: railPoint,
      _spreadByEdge: spreadByEdge, _heat: heat, _tileLabel: tileLabel
    };
  }

  window.R2HBotPointer = { create: createR2HBotPointer };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { create: createR2HBotPointer };
  }
})();
