// R2H ARENA BOT POINTER (v4, 2026-10-03 - "True Screen Rim")
// Pure logic module for the PVP Arena (world 2).
//
// v4 CORE CHANGE (Claude review item 1, Option A - implemented via renderer
// ground truth instead of analytic projection):
//   The viewport is a PITCHED PERSPECTIVE camera (setCamera pitch=912 fixed,
//   yaw = field_133(0-7)*32 -> *4 = *128 in 1024 units, elevation+180,
//   zoom*2) - a world bearing does NOT map linearly to a screen angle
//   (v3.1's assumption; founder: "not being pointed well at all"; Claude's
//   perspective analysis confirmed by measurement).
//   Instead of reproducing the 3D pipeline, we READ the renderer's own sprite
//   screen coordinates: for every visible player the scene keeps drawables
//   (mc.u.g4) whose temp-model vertex params (fe.cJ/fe.dN) ARE the screen
//   x/y offsets (512x345 surface, cJ centred on sprite, dN at sprite base).
//   -> ON-SCREEN bot: marker placed AT the sprite. Exact by construction.
//   -> OFF-SCREEN bot: camera yaw fitted per-frame by circular least squares
//      over the visible (worldBearing -> screenAzimuth) pairs:
//         yaw = atan2( sum sin(b_i - s_i), sum cos(b_i - s_i) )
//      then screen bearing = worldBearing - yaw -> v3.1 rail clamp.
//      Self-calibrating: no sign conventions, no magic constants. Falls back
//      to the old ey*360/256 estimate only when NOTHING is visible.
//
// v4 VISUAL CHANGES (Claude review items 2+3):
//   - All markers 62x18, 10px bold monospace, four-way black outline.
//   - Chevron DELETED (rim/on-bot position carries direction); the unwrapped
//     rotation accumulator is removed with it. Distance heat moves to the
//     BORDER colour. Leader vs alternates: brightness only.
//
// Carried from v3.1: leader never culled (chosen from ALL bots; blank-rim
// regression), hysteresis 0.88 / lock 2 / unlock 6, 60-tile alternate cull,
// banded tiles, spread() de-overlap, furniture-safe rail, fv===1 gate,
// fail-soft fetch.
(function () {
  'use strict';

  var FLOOR_STRIDE = 944;
  var STRIP_X0 = 0.609, STRIP_Y1 = 0.101;   // top-right icon strip (measured)
  var SKULL_X0 = 0.850, SKULL_Y0 = 0.805;   // bottom-right skull (measured)
  var MATCH_TILES = 2.5;                    // roster<->sprite match tolerance

  function createR2HBotPointer(deps) {
    var FETCH_MS = deps.fetchMs || 5000;
    var TICK_MS = deps.tickMs || 500;
    var STICKY_MARGIN = 0.88;
    var LOCK_AT = 2;
    var UNLOCK_AT = 6;
    var MAX_MARKERS = 5;
    var CULL_TILES = 60;
    var GAP = 28;
    var lastFetch = -1;
    var bots = null;
    var stickyName = null;
    var lockedName = null;

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

    // Legacy estimate; FALLBACK ONLY when no visible sprites exist to fit.
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

    function tileLabel(d) {
      var n = Math.round(d);
      if (n <= 9) return String(n);
      if (n <= 30) return String(Math.round(n / 5) * 5);
      return (Math.floor(n / 10) * 10) + '+';
    }

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

    // ── renderer ground truth ─────────────────────────────────────────
    // deps.getScene() -> array of {wx, wz, sx, sy} for every VISIBLE player:
    // wx/wz = world 3D units (tile*128, region base added by the wiring),
    // sx/sy = 512x345 surface coords (sx centred on sprite, sy at base).
    // Returns null if the scene is unreadable this tick.

    // Match roster bots (server tiles) to visible sprites (may lag a step).
    // Greedy nearest within MATCH_TILES (Manhattan) wins; each sprite used once.
    function matchScene(botsList, me, scene) {
      var pairs = [];
      var used = {};
      var i, j, s, d, best, bestD;
      for (i = 0; i < botsList.length; i++) {
        best = null; bestD = Infinity;
        for (j = 0; j < scene.length; j++) {
          if (used[j]) continue;
          s = scene[j];
          d = Math.abs(s.wx / 128 - botsList[i].x) + Math.abs(s.wz / 128 - botsList[i].y);
          if (d < bestD) { bestD = d; best = j; }
        }
        if (best !== null && bestD <= MATCH_TILES) {
          used[best] = true;
          pairs.push({ bot: botsList[i], sx: scene[best].sx, sy: scene[best].sy });
        }
      }
      return pairs;
    }

    // Screen azimuth of a sprite: 0 = screen-up, clockwise, from (256,256).
    function screenAzimuth(sx, sy) {
      var dx = sx - 256;
      var dy = 256 - sy;
      var deg = Math.atan2(dx, dy) * 180 / Math.PI;
      return (deg + 360) % 360;
    }

    // Circular least-squares yaw fit: yaw = circular mean of (bearing - azimuth).
    function fitYaw(me, pairs) {
      if (!pairs.length) return null;
      var sinSum = 0, cosSum = 0;
      for (var i = 0; i < pairs.length; i++) {
        var b = bearingDeg(me, pairs[i].bot) * Math.PI / 180;
        var s = screenAzimuth(pairs[i].sx, pairs[i].sy) * Math.PI / 180;
        sinSum += Math.sin(b - s);
        cosSum += Math.cos(b - s);
      }
      var yaw = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
      return (yaw + 360) % 360;
    }

    // ── rim placement for OFF-screen bots (v3.1 rail, 62px geometry) ──
    function railPoint(screenDeg, vw, vh) {
      var rad = screenDeg * Math.PI / 180;
      var dx = Math.sin(rad);
      var dy = -Math.cos(rad);
      var cx = vw / 2, cy = vh / 2;
      var INSET_X = 34;   // 62/2 + 3
      var INSET_Y = 22;
      var TOP_MAX = STRIP_X0 * vw - 34;
      var BOT_MAX = SKULL_X0 * vw - 34;
      var RIGHT_LO = STRIP_Y1 * vh + 22;
      var RIGHT_HI = SKULL_Y0 * vh - 22;
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
        if (y < RIGHT_LO) { edge = 'top'; y = INSET_Y; x = TOP_MAX; parked = true; }
        else if (y > RIGHT_HI) { edge = 'bottom'; y = vh - INSET_Y; x = BOT_MAX; parked = true; }
        else { x = vw - INSET_X; }
      } else if (edge === 'top') {
        y = INSET_Y;
        if (x > TOP_MAX) { x = TOP_MAX; parked = true; }
      } else if (edge === 'bottom') {
        y = vh - INSET_Y;
        if (x > BOT_MAX) { x = BOT_MAX; parked = true; }
      } else {
        x = INSET_X;
        if (y < INSET_Y) y = INSET_Y;
        if (y > vh - INSET_Y) y = vh - INSET_Y;
      }
      return { x: Math.round(x), y: Math.round(y), edge: edge, parked: parked };
    }

    function spreadByEdge(markers, vw, vh) {
      var INSET_X = 34, INSET_Y = 22;
      var TOP_MAX = STRIP_X0 * vw - 34, BOT_MAX = SKULL_X0 * vw - 34;
      if (TOP_MAX < INSET_X) TOP_MAX = INSET_X;
      if (BOT_MAX < INSET_X) BOT_MAX = INSET_X;
      var edges = {};
      var i, m;
      for (i = 0; i < markers.length; i++) {
        m = markers[i];
        if (m.onScreen) continue;   // on-bot markers are exact; never spread them
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
        var lo, hi;
        if (axis === 'x') { lo = INSET_X; hi = (e === 'top') ? TOP_MAX : BOT_MAX; }
        else { lo = INSET_Y; hi = vh - INSET_Y; }
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

      // renderer ground truth (null any tick; degrade gracefully)
      var scene = deps.getScene ? deps.getScene() : null;
      var pairs = scene ? matchScene(bots, me, scene) : [];

      // leader from ALL bots; alternates within cull range
      var leader = pickLeader(me, bots.filter(function (b2) {
        return typeof b2.x === 'number' && typeof b2.y === 'number';
      }));
      if (!leader) { deps.hide(); return; }
      var cand = [], i, b, d;
      for (i = 0; i < bots.length; i++) {
        b = bots[i];
        if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
        d = dist(me, b);
        if (d > CULL_TILES) continue;
        cand.push({ bot: b, dist: d });
      }
      if (cand.length === 0) { cand = [{ bot: leader.bot, dist: leader.dist }]; }
      cand.sort(function (a, b2) { return a.dist - b2.dist; });

      var chosen = [];
      var seen = {};
      seen[leader.bot.n] = true;
      chosen.push({ bot: leader.bot, dist: leader.dist, leader: true });
      for (i = 0; i < cand.length && chosen.length < MAX_MARKERS; i++) {
        if (seen[cand[i].bot.n]) continue;
        seen[cand[i].bot.n] = true;
        chosen.push({ bot: cand[i].bot, dist: cand[i].dist, leader: false });
      }

      // camera yaw: fitted from visible bots, legacy estimate as fallback
      var yaw = fitYaw(me, pairs);
      if (yaw === null) yaw = cameraDeg(mc);

      var pairBy = {};
      for (i = 0; i < pairs.length; i++) pairBy[pairs[i].bot.n] = pairs[i];
      var vp = (deps.getViewport ? deps.getViewport() : null) || { w: 1280, h: 633 };
      var out = [];
      for (i = 0; i < chosen.length; i++) {
        var c = chosen[i];
        var pr = pairBy[c.bot.n];
        var world = bearingDeg(me, c.bot);
        var mk = {
          leader: c.leader,
          name: c.bot.n || '',
          combat: (typeof c.bot.cb === 'number') ? c.bot.cb : null,
          tiles: tileLabel(c.dist),
          heat: heat(c.dist)
        };
        if (pr) {
          // ON the bot: 512x345 surface -> viewport px. sy is the sprite BASE
          // (feet); lift the marker above the head by ~34 surface px.
          mk.onScreen = true;
          mk.x = pr.sx / 512 * vp.w;
          mk.y = (pr.sy - 34) / 345 * vp.h;
          mk.edge = 'bot';
          mk.parked = false;
        } else {
          var screen = (yaw === null) ? world : (world - yaw + 360) % 360;
          var rail = railPoint(screen, vp.w, vp.h);
          mk.onScreen = false;
          mk.x = rail.x; mk.y = rail.y; mk.edge = rail.edge; mk.parked = rail.parked;
        }
        out.push(mk);
      }
      spreadByEdge(out, vp.w, vp.h);
      deps.show({ markers: out, yaw: yaw, visiblePairs: pairs.length });
    }

    return {
      tick: tick, TICK_MS: TICK_MS,
      _wildernessLevel: wildernessLevel, _bearingDeg: bearingDeg,
      _readPosition: readPosition, _cameraDeg: cameraDeg,
      _pickLeader: pickLeader, _railPoint: railPoint,
      _spreadByEdge: spreadByEdge, _heat: heat, _tileLabel: tileLabel,
      _matchScene: matchScene, _fitYaw: fitYaw, _screenAzimuth: screenAzimuth
    };
  }

  window.R2HBotPointer = { create: createR2HBotPointer };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { create: createR2HBotPointer };
  }
})();
