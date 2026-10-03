// Offline harness for r2h-bot-pointer.js — mirrors tools/test-area-logic.cjs.
// Run: node tools/test-bot-pointer.cjs   (project is ESM; harness must be .cjs)
// Cases: wilderness gate, bearing math vs RSC axes, nearest selection,
// position-field safety, empty/failed fetches, floor>0 wilderness.
'use strict';
const path = require('path');
const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'game', 'r2h-bot-pointer.js'), 'utf8');
// evaluate in a sandbox with a fake window
const vm = require('vm');
const sandbox = { window: {}, module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { create } = sandbox.module.exports;

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); }
}

// fake clock
let clock = 1000;
const p = create({
  now: () => clock,
  fetchBots: () => Promise.resolve({ bots: [
    { n: 'plagueknight', x: 132, y: 150, cb: 65 },
    { n: 'emberveil', x: 172, resolves: true, y: 274, cb: 40 }
  ] }),
  show: () => {},
  hide: () => {}
});

// 1. wilderness formula floor 0: y=427 -> lvl 0 (boundary), 426 -> 1, 368 -> 10
t('wild y=427 level 0', p._wildernessLevel(427) === 0);
t('wild y=426 level 1', p._wildernessLevel(426) === 1);
t('wild y=368 level 10', p._wildernessLevel(368) === 10);
t('wild y=150 level 47 (arena parity 1+(427-150)/6)', p._wildernessLevel(150) === 1 + Math.floor((427 - 150) / 6));

// 2. bearing: bot due north (smaller y) -> 0deg (arrow up)
const me = { x: 200, y: 300 };
t('bearing north = 0', p._bearingDeg(me, { x: 200, y: 250 }) === 0);
t('bearing east (bot x smaller) = 90', p._bearingDeg(me, { x: 150, y: 300 }) === 90);
t('bearing south = 180', p._bearingDeg(me, { x: 200, y: 350 }) === 180);
t('bearing west (bot x larger) = 270', p._bearingDeg(me, { x: 250, y: 300 }) === 270);
t('bearing NE = 45', Math.abs(p._bearingDeg(me, { x: 150, y: 250 }) - 45) < 1e-9);

// 3. nearest selection
const near = p._nearest(me, [
  { n: 'far', x: 132, y: 150 },
  { n: 'near', x: 205, y: 305 }
]);
t('nearest picks closest', near && near.bot.n === 'near');
t('nearest distance rounded', near && near.dist === 7);

// 4. position reader safety
t('readPosition null on missing mc', p._readPosition(null) === null);
t('readPosition null on undefined fields', p._readPosition({ bJ: 1 }) === null);
t('readPosition sums base+offset', JSON.stringify(p._readPosition({ bJ: 100, bK: 200, du: 5, dd: 7 })) === '{"x":105,"y":207}');
t('readPosition rejects NaN/out-of-range', p._readPosition({ bJ: 'x', bK: 0, du: 0, dd: 0 }) === null && p._readPosition({ bJ: 5000, bK: 0, du: 0, dd: 0 }) === null);

// 5. tick gating: hide outside wilderness even with bots cached
let shown = 0, hidden = 0, lastShown = null;
const p2 = create({
  now: () => clock,
  fetchBots: () => Promise.resolve({ bots: [{ n: 'b', x: 132, y: 150, cb: 65 }] }),
  show: (o) => { shown++; lastShown = o; },
  hide: () => { hidden++; }
});
const mcWild = { bJ: 0, bK: 0, du: 200, dd: 300 };   // (200,300) wild lvl 3
const mcTown = { bJ: 0, bK: 0, du: 200, dd: 500 };   // (200,500) safe strip
p2.tick(mcWild);
// promise fetch resolves on microtask; tick again after flush
setImmediate(() => {
  p2.tick(mcWild);
  // bot (132,150) from (200,300): lower x = EAST of me, lower y = north -> ~24.4deg
  t('tick shows pointer in wilderness', shown === 1 && Math.abs(lastShown.deg - 24.4) < 0.1, lastShown);
  t('tick passes name+combat', lastShown.name === 'b' && lastShown.combat === 65);
  p2.tick(mcTown);
  // hide fires each tick nothing is showable: once pre-fetch (bots null) + once in town
  t('tick hides pointer in town', hidden >= 2);
  // empty bot list -> hide
  const p3 = create({ now: () => clock, fetchBots: () => Promise.resolve({ bots: [] }), show: (o) => { shown++; }, hide: () => { hidden++; } });
  p3.tick(mcWild);
  setImmediate(() => {
    p3.tick(mcWild);
    t('empty bots -> hide (not show)', hidden >= 2);
    // fetch failure keeps last good list (no crash)
    const p4 = create({ now: () => clock, fetchBots: () => Promise.reject(new Error('down')), show: () => {}, hide: () => {} });
    p4.tick(mcWild);
    setImmediate(() => { p4.tick(mcWild); t('fetch rejection does not throw', true); done(); });
  });
});
function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
