// R2H ARENA BOT POINTER (v5, 2026-10-04 - "Four Quadrants")
// Pure logic module for the PVP Arena (world 2).
//
// v5 CORE CHANGE (founder's call): the precision rim is SCRAPPED. At most
// FOUR markers exist, one per screen quadrant, each at a FIXED pixel slot:
//   TOP    centre (0.40*w, 21)      (y=12 top edge + 9)
//   BOTTOM centre (0.40*w, h-21)    (y=h-30 top edge + 9)
//   LEFT   centre (43, 0.50*h)      (x=12 left edge + 31)
//   RIGHT  centre (w-43, 0.50*h)    (x=w-74 left edge + 31)
// 0.40*w keeps top/bottom clear of the icon strip (0.609w) and skull
// (0.85w); RIGHT sits mid-height in the measured-free gap between them.
//
// DELETED with the rim (do not resurrect): railPoint ray cast + parking
// branches, spreadByEdge de-overlap (GAP 28 vs 62px wide markers was the
// jumbled-row bug in the founder's screenshot - my spec error), the
// 60-tile cull, matchScene renderer reading, fitYaw circular least-squares,
// and the on-bot sprite placement. Fixed slots cannot overlap by design.
//
// KEPT (measured + tested, still the foundation):
//   - bearingDeg with the v4.4 corrected x axis: +x is EAST, +y is SOUTH
//     (measured in-world 2026-10-04 via renderer screen-x vs world dx;
//     the v1 "x increases WEST" comment was backwards and mirrored every
//     marker's east/west since the first deploy).
//   - cameraDeg: camera yaw = ey&255 alone (cameraRotation; the minimap's
//     minimapRandom_1 term is NOT part of the camera rotation).
//   - readPosition + positionSelfCheck (bJ+du / bK+dd vs the client's own
//     absolute wilderness formula), fv===1 gate, fail-soft fetch, banded
//     tile labels, border heat colours, brightness-only hierarchy.
//
// ASSIGNMENT: screen bearing (world bearing - camera yaw) buckets into four
// 90-degree quadrants [315-45)=TOP [45-135)=RIGHT [135-225)=BOTTOM
// [225-315)=LEFT. Each occupied quadrant shows its NEAREST bot at any
// range (no cull - coarse is the point). The quadrant holding the overall
// nearest bot is highlighted; hysteresis (0.88 sticky margin) applies ONLY
// to which quadrant is bright, so the highlight does not flicker.
(function () {
  'use strict';

  var FLOOR_STRIDE = 944;

  function createR2HBotPointer(deps) {
    var FETCH_MS = deps.fetchMs || 5000;
    var TICK_MS = deps.tickMs || 500;
    var STICKY_MARGIN = 0.88;   // highlight switches only when clearly better
    var QUADS = ['top', 'right', 'bottom', 'left'];
    var lastFetch = -1;
    var bots = null;
    var stickyQuad = null;

    // ── position reading (verified 1:1 vs arena.db, both axes + signs) ──
    // LOCAL SURFACE coords (bJ+du, bK+dd) - the same base the server DB and
    // the bot list use. Do NOT add n7/i2: they are the SURFACE PLANE ORIGIN
    // constants (2304, 1776) used only by the client's absolute display math
    // (adding them was a live v4.1 regression: x out of bounds, rim hidden).
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

    // RUNTIME SELF-CHECK: the client computes its wilderness display from
    // ABSOLUTE coords d = 2203-((bK+i2)+dd), level = d>0 ? 1+floor(d/6) : 0
    // (no floor-stride term; i2 is the surface origin 1776). Our
    // wildernessLevel works on LOCAL y; both agree on the surface. If they
    // disagree, bJ/bK/du/dd drifted after a classes.js rebuild - hide
    // rather than render a confident wrong marker. Missing i2 = skip.
    function positionSelfCheck(mc, me) {
      if (!mc || !me) return false;
      if (mc.i2 === undefined || mc.i2 === null) return true;  // nothing to compare
      var clientAbsY = (Number(mc.bK) || 0) + (Number(mc.i2) || 0) + (Number(mc.dd) || 0);
      var d = 2203 - clientAbsY;
      var clientLevel = d > 0 ? 1 + Math.floor(d / 6) : 0;
      var ourLevel = wildernessLevel(me.y);
      if (clientLevel !== ourLevel) {
        try { console.warn('[r2h-bot-pointer] position self-check FAILED: client level ' + clientLevel + ' vs module ' + ourLevel + ' - hiding markers'); } catch (e) {}
        return false;
      }
      return true;
    }

    function wildernessLevel(rawY) {
      var floor = Math.floor(rawY / FLOOR_STRIDE);
      var wild = 2203 - (rawY + (1776 - (FLOOR_STRIDE * floor)));
      return wild > 0 ? 1 + Math.floor(wild / 6) : 0;
    }

    function inWorld(mc) {
      return !!(mc && Number(mc.fv) === 1);
    }

    // World bearing, degrees clockwise from north. AXES MEASURED IN-WORLD
    // 2026-10-04 (camera ey=32/yaw45, renderer p6 readout): sprites at pure
    // +dx landed screen-RIGHT (p6 +205/+133 for dx +12.5/+7.7) -> +x is EAST.
    // +y is SOUTH (anchored by the wilderness formula). Therefore:
    // bearing = atan2(dx, -dy). The v1 comment "x increases WEST" was WRONG
    // and mirrored every marker's east/west since the first deploy.
    function bearingDeg(me, bot) {
      var north = -(bot.y - me.y);
      var east = (bot.x - me.x);
      var deg = Math.atan2(east, north) * 180 / Math.PI;
      return (deg + 360) % 360;
    }

    function dist(me, bot) {
      return Math.sqrt((bot.x - me.x) * (bot.x - me.x) + (bot.y - me.y) * (bot.y - me.y));
    }

    // Camera yaw from cameraRotation ALONE (ey&255 * 360/256). p2 is
    // minimapRandom_1 (mudclient.java:9064, the MINIMAP rotation line) -
    // never part of the camera rotation (setCamera uses cameraRotation*4,
    // :5217; facing quantisation ((cameraRotation+16)/32)&7 at :6386/:6642).
    function cameraDeg(mc) {
      if (!mc || mc.ey === undefined) return null;
      var r = Number(mc.ey) & 255;          // cameraRotation ONLY. NOT + p2.
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

    // ── the four fixed slots ──
    // Screen bearing buckets (degrees clockwise from screen-up):
    //   [315,45) TOP   [45,135) RIGHT   [135,225) BOTTOM   [225,315) LEFT
    function quadrantOf(screenDeg) {
      var d = ((screenDeg % 360) + 360) % 360;
      if (d >= 315 || d < 45) return 'top';
      if (d < 135) return 'right';
      if (d < 225) return 'bottom';
      return 'left';
    }

    // FIXED slot CENTRES (wiring positions markers by centre; derived from
    // the spec's edge anchors: TOP y=12, BOTTOM y=h-30, LEFT x=12,
    // RIGHT x=w-74, 62x18 markers -> centres at +31/+9).
    function slotPos(q, w, h) {
      if (q === 'top') return { x: Math.round(0.40 * w), y: 21 };
      if (q === 'bottom') return { x: Math.round(0.40 * w), y: h - 21 };
      if (q === 'left') return { x: 43, y: Math.round(0.50 * h) };
      return { x: w - 43, y: Math.round(0.50 * h) };
    }

    function tick(mc) {
      var now = deps.now ? deps.now() : Date.now();
      var me = null;
      var showable = false;
      if (inWorld(mc)) {
        me = readPosition(mc);
        showable = !!(me && positionSelfCheck(mc, me) && wildernessLevel(me.y) > 0);
      }
      // live state for diagnostics (version, position, level, nearest bot)
      lastState.t = now;
      lastState.me = me;
      lastState.wild = me ? wildernessLevel(me.y) : -1;
      if (!showable) {
        stickyQuad = null;
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

      var yaw = cameraDeg(mc);   // null -> bucket by world bearing directly

      // nearest bot per quadrant (no range cull - coarse is the point)
      var best = {};
      var overall = null;
      var i, b, d, sa, q;
      for (i = 0; i < bots.length; i++) {
        b = bots[i];
        if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
        d = dist(me, b);
        var brg = bearingDeg(me, b);
        sa = (yaw === null) ? brg : (brg - yaw + 360) % 360;
        q = quadrantOf(sa);
        if (!best[q] || d < best[q].dist) best[q] = { bot: b, dist: d, quad: q };
        if (!overall || d < overall.dist) overall = { bot: b, dist: d, quad: q };
      }
      if (!overall) { deps.hide(); return; }
      lastState.bots = { count: bots.length, nearest: overall.bot };

      // highlight hysteresis: the bright quadrant only switches when another
      // quadrant's nearest is clearly closer (STICKY_MARGIN); a vanished
      // quadrant releases the highlight immediately
      if (stickyQuad && best[stickyQuad]) {
        if (overall.quad !== stickyQuad && overall.dist < best[stickyQuad].dist * STICKY_MARGIN) {
          stickyQuad = overall.quad;
        }
      } else {
        stickyQuad = overall.quad;
      }

      var vp = (deps.getViewport ? deps.getViewport() : null) || { w: 1280, h: 633 };
      var out = [];
      for (i = 0; i < QUADS.length; i++) {
        q = QUADS[i];
        var c = best[q];
        if (!c) continue;
        var p = slotPos(q, vp.w, vp.h);
        out.push({
          leader: q === stickyQuad,
          name: c.bot.n || '',
          combat: (typeof c.bot.cb === 'number') ? c.bot.cb : null,
          tiles: tileLabel(c.dist),
          heat: heat(c.dist),
          x: p.x, y: p.y,
          edge: q, onScreen: false, parked: false
        });
      }
      deps.show({ markers: out, yaw: yaw });
    }

    return {
      tick: tick, TICK_MS: TICK_MS,
      _wildernessLevel: wildernessLevel, _bearingDeg: bearingDeg,
      _readPosition: readPosition, _cameraDeg: cameraDeg, _positionSelfCheck: positionSelfCheck,
      _quadrantOf: quadrantOf, _slotPos: slotPos,
      _heat: heat, _tileLabel: tileLabel
    };
  }

  var VERSION = 'v5.0';
  var lastState = { version: VERSION, t: 0, me: null, wild: -1, bots: null };
  window.R2HBotPointer = { create: createR2HBotPointer, version: VERSION, getState: function () { return lastState; } };
  try { console.log('[r2h-bot-pointer] ' + VERSION + ' loaded (four fixed quadrants)'); } catch (e) {}
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { create: createR2HBotPointer };
  }
})();
