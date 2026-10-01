/* r2h-area-logic.js — R2H area popup decision core (v1, 2026-09-30).
 *
 * Pure logic, no DOM: the browser (public/game/index.html) supplies
 * show(text) and post(msg) callbacks plus a now() clock; the Node test
 * harness (tools/test-area-logic.js) supplies fakes. This file is loaded
 * by the game page BEFORE the inline wiring script — same pattern as
 * r2h-bot-engine.js.
 *
 * ⚠️ FIELD NAMES ARE MINIFIED AND VERSION-SPECIFIC: bJ/bK = player local
 * tile, du/dd = region base offsets. Verified against classes.js v232 /
 * bot engine v423 (getX/getY). After ANY client rebuild, re-verify:
 *   window.__r2h_mc && [__r2h_mc.bJ, __r2h_mc.du, __r2h_mc.bK, __r2h_mc.dd]
 * readPosition() fails safe (returns null) on missing/non-numeric/out-of-
 * range fields — the caller must then show NOTHING.
 *
 * Wilderness level uses the server's own formula (Point.wildernessLevel):
 *   wild = 2203 - (rawY + (1776 - 944*floor)); level = wild>0 ? 1+floor(wild/6) : 0
 */
(function (global) {
  'use strict';

  var FLOOR_STRIDE = 944;
  var WORLD_MAX_X = 944;    // server Constants MAX_WIDTH=1008; practical playable < 944
  var WORLD_MAX_Y = 3776;   // 4 floors * 944

  function createR2HAreaLogic(deps) {
    var areas = deps.areas || [];
    var now = deps.now || function () { return Date.now(); };
    var show = deps.show || function () {};
    var post = deps.post || function () {};
    var onEvent = deps.onEvent || null; // optional test hook: (type, detail)

    var POLL_MS = deps.pollMs || 500;
    var POPUP_MS = deps.popupMs || 2600;   // how long the label stays visible
    var REARM_MS = deps.rearmMs || 12000;  // min time before the SAME area re-pops
    var FLICKER_MS = 1500;                 // dwell before "Leaving X" is worth showing
    var STABLE_N = 2;                      // consecutive identical readings required
    var SETTLE_MS = 2500;                  // blind window after world entry

    var s = {
      // area tracking
      lastAreaId: null,
      lastAreaSince: 0,
      popupHistory: {},   // areaId -> last shown timestamp
      // stabilization
      wasInWorld: false,
      worldEnteredAt: 0,
      stablePos: null,
      stableCount: 0,
      // visible-state mirror (tests read this)
      visible: null,      // {text, until} or null
      lastPosted: null,
    };

    function areasReady() { return areas.length > 0; }

    function findArea(x, localY, floor) {
      if (!areasReady()) return null;
      var best = null, bestPri = -1;
      for (var i = 0; i < areas.length; i++) {
        var a = areas[i];
        if (floorsMatch(a, floor) &&
            x >= a.x1 && x <= a.x2 && localY >= a.y1 && localY <= a.y2) {
          // NOTE: banks are map-labels only (popup:false) — never win the popup.
          var pri = a.type === 'wilderness' ? 5 :
                    a.type === 'dungeon' ? 3 :
                    a.type === 'town' ? 2 :
                    a.type === 'kingdom' ? 1 : 0;
          if (a.popup === false) continue;
          if (pri > bestPri) { best = a; bestPri = pri; }
        }
      }
      return best;
    }

    function floorsMatch(a, floor) {
      for (var i = 0; i < a.floors.length; i++) if (a.floors[i] === floor) return true;
      return false;
    }

    function wildernessLevel(x, rawY, floor) {
      if (x + 2304 >= 2640) return 0; // server: x >= 336 is never wilderness
      var wild = 2203 - (rawY + (1776 - (FLOOR_STRIDE * floor)));
      return wild > 0 ? 1 + Math.floor(wild / 6) : 0;
    }

    function areaDisplayName(a, x, rawY, floor) {
      if (a.type === 'wilderness') {
        var lvl = wildernessLevel(x, rawY, floor);
        return lvl > 0 ? ('Wilderness \u00b7 Level ' + lvl) : 'Wilderness';
      }
      return a.name;
    }

    function areaById(id) {
      for (var i = 0; i < areas.length; i++) if (areas[i].id === id) return areas[i];
      return null;
    }

    function showPopup(text) {
      s.visible = { text: text, until: now() + POPUP_MS };
      show(text);
    }

    function hidePopup() {
      s.visible = null;
      if (deps.hide) deps.hide();
    }

    // Read + validate the player's position from the client fields.
    // Returns {x, y, floor, localY} or null on ANY doubt.
    function readPosition(mc) {
      try {
        if (!mc) return null;
        var bJ = mc.bJ, bK = mc.bK, du = mc.du, dd = mc.dd;
        if (bJ === undefined || bK === undefined || du === undefined || dd === undefined) return null;
        var x = Number(bJ) + Number(du);
        var y = Number(bK) + Number(dd);
        if (!isFinite(x) || !isFinite(y)) return null;
        x = Math.trunc(x); y = Math.trunc(y);
        var floor = Math.floor(y / FLOOR_STRIDE);
        var localY = y - FLOOR_STRIDE * floor;
        if (x < 0 || x > WORLD_MAX_X) return null;
        if (y < 0 || y > WORLD_MAX_Y) return null;
        if (floor < 0 || floor > 3) return null;
        return { x: x, y: y, floor: floor, localY: localY };
      } catch (e) { return null; }
    }

    function handleArea(a, pos) {
      var t = now();
      var id = a ? a.id : null;
      if (id !== s.lastAreaId) {
        if (s.lastAreaId !== null) {
          var prevDef = areaById(s.lastAreaId);
          if (prevDef && prevDef.popup && (t - s.lastAreaSince) >= FLICKER_MS) {
            showPopup('Leaving ' + prevDef.name);
          }
        }
        if (a && a.popup) {
          var lastShown = s.popupHistory[id] || 0;
          if (t - lastShown >= REARM_MS) {
            showPopup('Entering ' + areaDisplayName(a, pos.x, pos.y, pos.floor));
            s.popupHistory[id] = t;
          }
        }
        if (onEvent) onEvent('area-change', { from: s.lastAreaId, to: id, at: t });
        s.lastAreaId = id;
        s.lastAreaSince = t;
      }
    }

    function maybeLeaving() {
      if (s.lastAreaId !== null) {
        s.lastAreaId = null;
        s.lastAreaSince = 0;
      }
      s.stablePos = null;
      s.stableCount = 0;
      hidePopup();
    }

    // One poller tick. mcLike = {fv, bJ, bK, du, dd} (the mudclient or a stub).
    function tick(mcLike) {
      try {
        var inWorld = !!(mcLike && mcLike.fv === 1);
        if (inWorld && !s.wasInWorld) {
          s.worldEnteredAt = now();
          s.stablePos = null;
          s.stableCount = 0;
          if (onEvent) onEvent('world-enter', { at: s.worldEnteredAt });
        }
        s.wasInWorld = inWorld;
        if (!inWorld) { maybeLeaving(); return; }
        if (now() - s.worldEnteredAt < SETTLE_MS) return; // settle window

        var pos = readPosition(mcLike);
        if (!pos) {
          // FAIL SAFE: bad/transient fields → hide, reset stability, post nothing.
          s.stablePos = null;
          s.stableCount = 0;
          maybeLeaving();
          return;
        }
        if (!s.stablePos) {
          s.stablePos = { x: pos.x, y: pos.y };
          s.stableCount = 1;
          return;
        }
        var dx = Math.abs(pos.x - s.stablePos.x);
        var dy = Math.abs(pos.y - s.stablePos.y);
        if (dx === 0 && dy === 0) {
          s.stableCount++;
        } else if (dx <= 3 && dy <= 3) {
          // WALKING-speed movement (≤3 tiles/poll): credible — keep area
          // tracking live WITHOUT resetting stability. Suppressing popups
          // while walking was a real bug (border crossing on foot never
          // fired "Entering Wilderness").
          s.stablePos = { x: pos.x, y: pos.y };
        } else {
          // Teleport-scale jump: distrust until the position repeats once.
          s.stablePos = { x: pos.x, y: pos.y };
          s.stableCount = 1;
          return;
        }
        if (s.stableCount < STABLE_N) return;

        handleArea(findArea(pos.x, pos.localY, pos.floor), pos);
        s.lastPosted = { x: pos.x, y: pos.y, floor: pos.floor };
        post({ type: 'R2H_POSITION', x: pos.x, y: pos.y, floor: pos.floor });
      } catch (e) {
        // never break the game page; tests can observe via onEvent('error')
        if (onEvent) onEvent('error', String(e));
      }
    }

    return {
      tick: tick,
      findArea: findArea,
      readPosition: readPosition,
      wildernessLevel: wildernessLevel,
      state: s,
      SETTLE_MS: SETTLE_MS,
      STABLE_N: STABLE_N,
      POLL_MS: POLL_MS,
      POPUP_MS: POPUP_MS,
      REARM_MS: REARM_MS,
    };
  }

  // ---- Popup display controller (v2) ---------------------------------
  // Owns the FULL lifetime of the on-screen popup: show → visible for
  // POPUP_MS → fade → element DESTROYED (removed from the DOM, text gone).
  // The pre-v2 wiring only set opacity:0 and left the element in the DOM
  // with stale text + a live timer — that was the "text persists" bug.
  // Pure orchestration: no DOM here. The caller supplies DOM actions.
  function createPopupDisplay(deps) {
    var st = deps.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    var ct = deps.clearTimeout || function (id) { return clearTimeout(id); };
    var POPUP_MS = deps.popupMs || 2600;   // fully visible, then fade starts
    var FADE_MS = deps.fadeMs || 250;      // CSS fade length (wiring matches)
    var hideT = null, fadeT = null, gen = 0;

    function cancel() {
      if (hideT !== null) { ct(hideT); hideT = null; }
      if (fadeT !== null) { ct(fadeT); fadeT = null; }
    }

    // Show text NOW; the previous popup (if any) is replaced instantly and
    // its pending timers are discarded. Never two popups at once.
    function show(text) {
      cancel();
      var g = ++gen;
      deps.showEl(text);
      hideT = st(function () {
        hideT = null;
        deps.fadeEl();
        fadeT = st(function () {
          fadeT = null;
          if (g !== gen) return;   // a newer popup owns the element now
          deps.destroyEl();        // fully gone: element + text removed
        }, FADE_MS + 60);
      }, POPUP_MS);
    }

    // Immediate, complete removal (logout, world hop, bad position).
    function hide() {
      cancel();
      gen++;                       // invalidate any in-flight callbacks
      deps.destroyEl();
    }

    return { show: show, hide: hide, POPUP_MS: POPUP_MS, FADE_MS: FADE_MS };
  }

  global.R2HAreaLogic = {
    create: createR2HAreaLogic,
    createPopupDisplay: createPopupDisplay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
