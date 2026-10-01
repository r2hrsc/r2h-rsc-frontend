/* test-area-logic.js — offline tests for the R2H area popup decision core.
 *
 * Feeds RECORDED position sequences (no game, no network) through
 * R2HAreaLogic.create() and asserts on the popup stream.
 *
 * Run: node tools/test-area-logic.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// load the logic module (UMD-ish: attaches to globalThis in Node)
require(path.join(__dirname, '..', 'public', 'game', 'r2h-area-logic.js'));
const { create } = globalThis.R2HAreaLogic;

const areas = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'public', 'game', 'areas.json'), 'utf8')).areas;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail === undefined ? '' : '— ' + JSON.stringify(detail)); }
}

// ---- harness helpers -------------------------------------------------------
function makeHarness(opts = {}) {
  let clock = opts.startClock || 1_000_000;
  const popups = [];   // [{t, text}]
  const posted = [];
  const events = [];
  const h = create({
    areas,
    now: () => clock,
    show: (text) => popups.push({ t: clock, text }),
    hide: () => {},
    post: (msg) => posted.push({ t: clock, ...msg }),
    onEvent: (type, detail) => events.push({ t: clock, type, detail }),
    ...opts.overrides,
  });
  return {
    h, popups, posted, events,
    advance: (ms) => { clock += ms; },
    setClock: (ms) => { clock = ms; },
    get clock() { return clock; },
  };
}

function mcAt(x, y, fv = 1) {
  // reconstruct client-shaped fields from world coords: bJ local, du base
  const floor = Math.floor(y / 944);
  const localY = y - 944 * floor;
  // pick a plausible region base (multiples of 48 within the floor)
  const du = Math.max(0, Math.floor(x / 48) * 48);
  const dd = Math.max(0, Math.floor(localY / 48) * 48) + 944 * floor;
  return { fv, bJ: String(x - du), bK: String(localY + 944 * floor - dd), du: String(du), dd: String(dd) };
}

// run the poller for `ms` at POLL_MS cadence with a position function
function runMs(env, ms, posFn, stepMs) {
  const step = stepMs || env.h.POLL_MS;
  for (let t = 0; t < ms; t += step) {
    env.h.tick(posFn(env.clock));
    env.advance(step);
  }
}

// ---- 1. spawn: settle window then exactly one "Entering <town>" -----------
{
  const env = makeHarness();
  // world entry at t0, standing still in Lumbridge (120,648)
  env.h.tick(mcAt(120, 648, 0));            // login screen (fv=0)
  env.advance(1000);
  env.h.tick(mcAt(120, 648, 1));            // world entered — settle window opens
  runMs(env, 5000, () => mcAt(120, 648, 1));
  const texts = env.popups.map(p => p.text);
  check('spawn: exactly one popup', env.popups.length === 1, texts);
  check('spawn: Entering Lumbridge', texts[0] === 'Entering Lumbridge', texts);
  check('spawn: popup not before settle window',
    env.popups.length === 0 || env.popups[0].t >= 1_000_000 + 1000 + 2500, env.popups[0]);
}

// ---- 2. walking across a border tile-by-tile, and back (no flicker) -------
{
  const env = makeHarness();
  // Edgeville (217,449) → walk NORTH across the y=426/427 wilderness boundary.
  // Phase A: one clean round-trip at 800ms/tile (genuine transitions — expect
  // the full Entering/Leaving sequence ONCE each way). Phase B: rapid border
  // oscillation (the actual flicker case) — expect at most ONE extra popup.
  env.h.tick(mcAt(217, 449, 1));            // enter world at Edgeville
  runMs(env, 4000, () => mcAt(217, 449, 1)); // settle + stable + popup
  const before = env.popups.length;

  let y = 449;
  for (let i = 0; i < 24; i++) {            // walk north to 425 (crosses 426→wilderness)
    y -= 1;
    env.h.tick(mcAt(217, y, 1));
    env.advance(800);
  }
  for (let i = 0; i < 24; i++) {            // walk back south to 449
    y += 1;
    env.h.tick(mcAt(217, y, 1));
    env.advance(800);
  }
  const textsA = env.popups.slice(before).map(p => p.text);
  const wildA = textsA.filter(t => t.startsWith('Entering Wilderness'));
  check('border walk: Entering Wilderness shown exactly once',
    wildA.length === 1, textsA);
  check('border walk: wilderness level is in the label',
    wildA.length === 1 && /Level \d+/.test(wildA[0]), wildA);
  check('border walk: clean round-trip shows the 4 genuine transitions',
    textsA.length === 4 &&
      textsA[0] === 'Leaving Edgeville' &&
      textsA[1].startsWith('Entering Wilderness') &&
      textsA[2] === 'Leaving Wilderness' &&
      textsA[3] === 'Entering Edgeville',
    textsA);

  // Phase B: rapid oscillation straddling the border tile (427/426)
  const beforeB = env.popups.length;
  for (let i = 0; i < 20; i++) {
    const yy = (i % 2 === 0) ? 426 : 427;   // flip every poll (500ms)
    env.h.tick(mcAt(217, yy, 1));
    env.advance(500);
  }
  const textsB = env.popups.slice(beforeB).map(p => p.text);
  check('border flicker: rapid oscillation produces ≤1 popup (no strobe)',
    textsB.length <= 1, textsB);
}

// ---- 3. teleport ------------------------------------------------------------
{
  const env = makeHarness();
  env.h.tick(mcAt(548, 607, 1));            // spawn in Ardougne
  runMs(env, 5000, () => mcAt(548, 607, 1));
  check('teleport: Entering Ardougne at spawn',
    env.popups.some(p => p.text === 'Entering Ardougne'), env.popups.map(p => p.text));

  const before = env.popups.length;
  // teleport: position jumps in ONE tick (Lumbridge)
  runMs(env, 4000, () => mcAt(120, 648, 1));
  const texts = env.popups.slice(before).map(p => p.text);
  check('teleport: Entering Lumbridge after jump',
    texts.includes('Entering Lumbridge'), texts);
  check('teleport: Leaving Ardougne shown (dwell > FLICKER_MS)',
    texts.includes('Leaving Ardougne'), texts);
}

// ---- 4. region/base change (du/dd shift, same world position) --------------
{
  const env = makeHarness();
  env.h.tick(mcAt(120, 648, 1));
  runMs(env, 5000, () => mcAt(120, 648, 1));
  const before = env.popups.length;

  // Same world position but expressed with a DIFFERENT region base — the raw
  // fields (bJ,bK,du,dd) all change while x,y stay (120,648).
  const alt = { fv: 1, bJ: '0', bK: '648', du: '120', dd: '0' };
  runMs(env, 4000, () => alt);
  check('region-base change: NO new popups (position identical)',
    env.popups.length === before, env.popups.slice(before).map(p => p.text));
  check('region-base change: position still posted',
    env.posted.length > 0 && env.posted[env.posted.length - 1].x === 120, env.posted.slice(-1));
}

// ---- 5. logout and login ----------------------------------------------------
{
  const env = makeHarness();
  env.h.tick(mcAt(120, 648, 1));
  runMs(env, 5000, () => mcAt(120, 648, 1));
  check('logout/login: popup at first session', env.popups.length === 1, env.popups.map(p => p.text));

  const before = env.popups.length;
  env.h.tick(mcAt(120, 648, 0));            // logout (fv=0) → state cleared
  env.advance(10_000);                       // long gap
  env.h.tick(mcAt(122, 509, 1));            // login again, now at Varrock
  runMs(env, 6000, () => mcAt(122, 509, 1));
  const texts = env.popups.slice(before).map(p => p.text);
  check('logout/login: Entering Varrock on relogin',
    texts.includes('Entering Varrock'), texts);
  check('logout/login: no Leaving popup across logout (state reset)',
    !texts.some(t => t.startsWith('Leaving')), texts);
}

// ---- 6. world hop (disconnect → reconnect quickly) --------------------------
{
  const env = makeHarness();
  env.h.tick(mcAt(120, 648, 1));
  runMs(env, 5000, () => mcAt(120, 648, 1));
  const before = env.popups.length;

  // world hop = brief fv=0 (reconnecting) then back in the SAME spot
  env.h.tick(mcAt(120, 648, 0));
  env.advance(3000);
  env.h.tick(mcAt(120, 648, 1));
  runMs(env, 6000, () => mcAt(120, 648, 1));
  const texts = env.popups.slice(before).map(p => p.text);
  // REARM_MS (12s) has not elapsed since Entering Lumbridge → silent re-entry
  check('world hop: no duplicate Entering within REARM window',
    !texts.some(t => t === 'Entering Lumbridge'), texts);
}

// ---- 7. the (x, 0) transient glitch at login --------------------------------
{
  const env = makeHarness();
  // sequence observed live: fv=1 with garbage bK/dd producing y=0 (wilderness!)
  env.h.tick(mcAt(548, 0, 1));              // transient: (548, 0) → Wilderness L72
  runMs(env, 3000, () => mcAt(548, 0, 1));
  check('glitch: NO popup during transient garbage',
    env.popups.length === 0, env.popups.map(p => p.text));

  // real position arrives
  runMs(env, 5000, () => mcAt(548, 607, 1));
  check('glitch: correct popup once real position stabilizes',
    env.popups.length === 1 && env.popups[0].text === 'Entering Ardougne',
    env.popups.map(p => p.text));
  check('glitch: transient position never posted',
    !env.posted.some(p => p.y === 0), env.posted.map(p => p.y));
}

// ---- 8. live-session bug replay (2026-09-29 observations) -------------------
// Observed on live: spawn (548,607) popup "Entering Ardougne" OK; ::tele to
// (120,648) then (217,449) — position fields changed and R2H_POSITION kept
// flowing, but NO new popup ever appeared.
{
  const env = makeHarness({ startClock: 1_000_000 });
  env.h.tick(mcAt(548, 607, 0));
  env.advance(500);
  env.h.tick(mcAt(548, 607, 1));            // world entry (settle opens)
  runMs(env, 4000, () => mcAt(548, 607, 1));
  check('replay: Entering Ardougne at spawn',
    env.popups.some(p => p.text === 'Entering Ardougne'), env.popups.map(p => p.text));

  // ::tele to Lumbridge — observed live: position jumped in ONE poll
  const before = env.popups.length;
  runMs(env, 6000, () => mcAt(120, 648, 1));
  const texts = env.popups.slice(before).map(p => p.text);
  check('replay: Entering Lumbridge after tele (THE BUG CASE)',
    texts.includes('Entering Lumbridge'), texts);

  // ::tele to Edgeville
  const before2 = env.popups.length;
  runMs(env, 6000, () => mcAt(217, 449, 1));
  const texts2 = env.popups.slice(before2).map(p => p.text);
  check('replay: Entering Edgeville after second tele',
    texts2.includes('Entering Edgeville'), texts2);
}

// ---- 9. areas matcher regression (the original 26 cases) --------------------
{
  const env = makeHarness();
  const cases = [
    [120, 648, 0, 'lumbridge'], [122, 509, 0, 'varrock'], [304, 542, 0, 'falador'],
    [214, 632, 0, 'draynor'], [217, 449, 0, 'edgeville'], [89, 693, 0, 'alkharid'],
    [233, 513, 0, 'barbarian_village'], [325, 663, 0, 'rimmington'], [269, 643, 0, 'portsarim'],
    [373, 498, 0, 'taverley'], [440, 501, 0, 'catherby'], [501, 450, 0, 'seers'],
    [549, 589, 0, 'ardougne'], [583, 747, 0, 'yanille'], [446, 694, 0, 'brimhaven'],
    [400, 850, 0, 'shilo_village'], [703, 527, 0, 'gnome_stronghold'], [425, 564, 0, 'entrana'],
    [62, 729, 0, 'shantay_pass'], [370, 685, 0, 'musa_point'],
    [220, 420, 0, 'wilderness'], [150, 300, 0, 'wilderness'],
    [293, 3339 - 2832, 3, 'dwarven_mine'], [205, 3280 - 2832, 3, 'edgeville_dungeon'],
    [146, 3260 - 2832, 3, 'varrock_sewers'], [370, 3300 - 2832, 3, 'taverley_dungeon'],
    [391, 3400 - 2832, 3, 'karamja_volcano'],
  ];
  let ok = 0;
  for (const [x, y, f, want] of cases) {
    const a = env.h.findArea(x, y, f);
    if (a && a.id === want) ok++; else console.log('  matcher miss:', x, y, f, '->', a && a.id, 'want', want);
  }
  check('matcher: all ' + cases.length + ' regression cases', ok === cases.length, { ok, total: cases.length });

  // wilderness formula parity vs server formula on a grid
  function serverWild(x, y) {
    const floor = Math.floor(y / 944);
    let wild = 2203 - (y + (1776 - 944 * floor));
    if (x + 2304 >= 2640) wild = -50;
    return wild > 0 ? 1 + Math.floor(wild / 6) : 0;
  }
  let mismatches = 0;
  for (let x = 0; x < 400; x += 7) for (let y = 0; y < 3776; y += 13) {
    const f = Math.floor(y / 944);
    if (env.h.wildernessLevel(x, y, f) !== serverWild(x, y)) mismatches++;
  }
  check('wilderness: 0 mismatches vs server formula', mismatches === 0, { mismatches });
}

// ---- 10. readPosition fail-safe matrix --------------------------------------
{
  const env = makeHarness();
  const bad = [
    null, {}, { fv: 1 },                       // missing
    { fv: 1, bJ: 'x' },                        // non-numeric
    { fv: 1, bJ: 5, bK: 5, du: 'NaN', dd: 0 }, // NaN
    { fv: 1, bJ: 99999, bK: 5, du: 0, dd: 0 }, // out of world range
    { fv: 1, bJ: 5, bK: 99999, du: 0, dd: 0 }, // out of world range
  ];
  let allNull = true;
  for (const b of bad) if (env.h.readPosition(b) !== null) allNull = false;
  check('readPosition: all malformed inputs rejected', allNull);
  const good = env.h.readPosition({ fv: 1, bJ: '120', bK: '648', du: '0', dd: '0' });
  check('readPosition: string numerics coerced (TeaVM)',
    good && good.x === 120 && good.y === 648 && good.floor === 0, good);
}

console.log(`\n${pass} pass, ${fail} fail`);

// =====================================================================
// v2 display-controller tests (fake clock; no DOM, no real timers)
// =====================================================================
(function v2DisplayTests() {
  var path = require('path');
  var modulePath = path.join(__dirname, '..', 'public', 'game', 'r2h-area-logic.js');
  require(modulePath);
  var R2H = globalThis.R2HAreaLogic;

  var passed = 0, failed = 0;
  function check(name, ok, detail) {
    if (ok) { passed++; console.log('PASS ' + name); }
    else { failed++; console.log('FAIL ' + name + (detail ? ' | ' + detail : '')); }
  }

  // ---- fake clock ----
  function FakeClock() {
    var now = 0;
    var timers = [];
    return {
      now: function () { return now; },
      setTimeout: function (fn, ms) {
        timers.push({ fn: fn, at: now + ms, id: timers.length + 1 });
        return timers.length;
      },
      clearTimeout: function (id) {
        for (var i = 0; i < timers.length; i++)
          if (timers[i].id === id) timers[i].dead = true;
      },
      advance: function (ms) {
        var target = now + ms;
        while (true) {
          var next = null;
          for (var i = 0; i < timers.length; i++)
            if (!timers[i].dead && timers[i].at <= target && (next === null || timers[i].at < next.at))
              next = timers[i];
          if (!next) break;
          now = next.at;
          next.dead = true;
          next.fn();
        }
        now = target;
      },
      pending: function () {
        return timers.filter(function (t) { return !t.dead; }).length;
      },
    };
  }

  function makeDisplay(clock) {
    var state = { text: null, opacity: null, exists: false, calls: [] };
    var d = R2H.createPopupDisplay({
      popupMs: 2600, fadeMs: 250,
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      showEl: function (t) { state.text = t; state.exists = true; state.calls.push(['show', t]); },
      fadeEl: function () { state.opacity = 0; state.calls.push(['fade']); },
      destroyEl: function () { state.text = null; state.exists = false; state.calls.push(['destroy']); },
    });
    return { display: d, state: state };
  }

  // 1. popup fully gone at 5s (fade included)
  (function () {
    var clock = FakeClock();
    var m = makeDisplay(clock);
    m.display.show('Entering Edgeville');
    check('v2: shown at t=0',
      m.state.text === 'Entering Edgeville' && m.state.exists);
    clock.advance(2600);
    check('v2: fade started at POPUP_MS', m.state.opacity === 0);
    clock.advance(310);
    check('v2: fully gone (element destroyed) at ~2.9s, well under 5s',
      !m.state.exists && m.state.text === null);
  })();

  // 2. instant replacement: new show mid-life kills the old timers
  (function () {
    var clock = FakeClock();
    var m = makeDisplay(clock);
    m.display.show('Leaving Edgeville');
    clock.advance(2400);
    m.display.show('Entering Wilderness');
    check('v2: replacement is instant (new text, still visible)',
      m.state.text === 'Entering Wilderness' && m.state.exists && m.state.opacity === null);
    check('v2: only ONE element ever (replace, not stack)',
      m.state.calls.filter(function (c) { return c[0] === 'show'; }).length === 2);
    clock.advance(2600);
    check('v2: replacement has a FRESH timer (fading at +2.6s from ITS start)',
      m.state.opacity === 0);
    clock.advance(310);
    check('v2: replacement fully gone',
      !m.state.exists && m.state.text === null);
    check('v2: no leaked timers', clock.pending() === 0);
  })();

  // 3. rapid back-and-forth across a border (leave/enter/leave/enter)
  (function () {
    var clock = FakeClock();
    var m3 = makeDisplay(clock);
    m3.display.show('Leaving Edgeville');
    clock.advance(300);
    m3.display.show('Entering Wilderness · Level 1');
    clock.advance(300);
    m3.display.show('Leaving Wilderness');
    clock.advance(300);
    m3.display.show('Entering Edgeville');
    check('v2: rapid churn — final text is the last one',
      m3.state.text === 'Entering Edgeville');
    clock.advance(2600);
    check('v2: rapid churn — fade on schedule',
      m3.state.opacity === 0);
    clock.advance(310);
    var screen = m3.state;
    check('v2: rapid churn — fully gone, no leak',
      !screen.exists && clock.pending() === 0);
  })();

  // 4. hide() is immediate and complete
  (function () {
    var clock = FakeClock();
    var m = makeDisplay(clock);
    m.display.show('Entering Varrock');
    clock.advance(1000);
    m.display.hide();
    check('v2: hide() destroys instantly',
      !m.state.exists && m.state.text === null);
    check('v2: hide() leaves no timers',
      clock.pending() === 0);
    // hide during fade window
    m.display.show('Entering Varrock');
    clock.advance(2600);
    check('v2: mid-fade popup still visible (element present)',
      m.state.exists);
    m.display.hide();
    check('v2: hide() during fade also destroys instantly',
      !m.state.exists && clock.pending() === 0);
  })();

  console.log('\nv2 display tests: ' + passed + ' pass, ' + failed + ' fail');
  if (failed > 0) process.exit(1);
})();
