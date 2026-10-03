// Offline harness for r2h-bot-pointer.js v3 (Target Rim).
// Run: node tools/test-bot-pointer.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'game', 'r2h-bot-pointer.js'), 'utf8');
const sandbox = { window: {}, module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { create } = sandbox.module.exports;

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

let clock = 1000;
const vp = { w: 1280, h: 633 };

const p0 = create({ now: () => clock, fetchBots: () => Promise.resolve({ bots: [] }), show: () => {}, hide: () => {} });
t('wild y=427 level 0', p0._wildernessLevel(427) === 0);
t('wild y=426 level 1', p0._wildernessLevel(426) === 1);
t('bearing N E S W',
  p0._bearingDeg({x:200,y:300},{x:200,y:250}) === 0 &&
  p0._bearingDeg({x:200,y:300},{x:150,y:300}) === 90 &&
  p0._bearingDeg({x:200,y:300},{x:200,y:350}) === 180 &&
  p0._bearingDeg({x:200,y:300},{x:250,y:300}) === 270);
t('readPosition safety', p0._readPosition(null) === null && p0._readPosition({bJ:1}) === null && p0._readPosition({bJ:'x',bK:0,du:0,dd:0}) === null);
t('cameraDeg: ey=64 -> 90', p0._cameraDeg({ ey: 64, p2: 0 }) === 90);
t('cameraDeg: ey=250,p2=10 -> 5.625', p0._cameraDeg({ ey: 250, p2: 10 }) === 5.625);
t('cameraDeg: null when ey absent', p0._cameraDeg({}) === null);

// Claude test class 1: parked marker never lands on the far side from the bot
let parkedCount = 0, wrongSide = 0, offFrame = 0, inNogo = 0;
const STRIP = { x0: 0.609 * vp.w, y1: 0.101 * vp.h };
const SKULL = { x0: 0.850 * vp.w, y0: 0.805 * vp.h, y1: 0.948 * vp.h };
for (let b = 0; b < 360; b++) {
  const rr = p0._railPoint(b, vp.w, vp.h);
  const dx = Math.sin(b * Math.PI / 180);
  if (rr.parked) parkedCount++;
  if (dx > 0.1 && rr.x <= 640) { wrongSide++; console.log('  wrong-side at', b, JSON.stringify(rr)); }
  if (dx < -0.1 && rr.x >= 640) { wrongSide++; console.log('  wrong-side at', b, JSON.stringify(rr)); }
  if (rr.x - 48 < 0 || rr.x + 48 > vp.w || rr.y - 11 < 0 || rr.y + 11 > vp.h) offFrame++;
  const inStrip = (rr.x + 48 > STRIP.x0 + 2) && (rr.y - 11 < STRIP.y1 + 4);
  const inSkull = (rr.x + 48 > SKULL.x0 + 2) && (rr.y + 11 > SKULL.y0 - 2) && (rr.y - 11 < SKULL.y1 + 2);
  if (inStrip || inSkull) { inNogo++; console.log('  nogo at', b, JSON.stringify(rr)); }
}
t('C1: 0/360 wrong side (v2 had 129)', wrongSide === 0, { wrongSide });
t('C1: 0/360 off-frame at own width', offFrame === 0, { offFrame });
t('C1: 0/360 inside strip/skull no-go', inNogo === 0, { inNogo });
t('C1: parked fraction < 25%', parkedCount / 360 < 0.25, { parkedCount });

let r = p0._railPoint(90, vp.w, vp.h);
t('rail 90 east: right edge exact', r.edge === 'right' && !r.parked && r.x === vp.w - 50, r);
r = p0._railPoint(270, vp.w, vp.h);
t('rail 270 west: left edge', r.edge === 'left' && r.x === 50 && !r.parked, r);
r = p0._railPoint(0, vp.w, vp.h);
t('rail 0 north: top centre exact', r.edge === 'top' && !r.parked && Math.abs(r.x - 640) < 40, r);
r = p0._railPoint(180, vp.w, vp.h);
t('rail 180 south: bottom exact', r.edge === 'bottom' && !r.parked, r);
r = p0._railPoint(60, vp.w, vp.h);
t('rail 60: parks TOP at TOP_MAX (toward bot)', r.parked && r.edge === 'top' && r.x > 640, r);
r = p0._railPoint(120, vp.w, vp.h);
t('rail 120: parks BOTTOM at BOT_MAX (toward bot)', r.parked && r.edge === 'bottom' && r.x > 640, r);

// C4: spread enforces 28px along the edge axis
{
  const markers = [
    { x: 600, y: 22, edge: 'top', leader: true },
    { x: 610, y: 22, edge: 'top', leader: false }
  ];
  p0._spreadByEdge(markers, vp.w, vp.h);
  t('C4: 10px apart -> spread to >=28px', markers[1].x - markers[0].x >= 28, markers);
}

// C5: leader is the hysteresis/lock winner, not feed[0]
{
  const px2 = create({ now: () => clock, fetchBots: () => Promise.resolve({bots:[]}), show: () => {}, hide: () => {} });
  const me = { x: 200, y: 300 };
  const mk = (n, x, y) => ({ n: n, x: x, y: y, cb: 10 });
  let pr = px2._pickLeader(me, [mk('A', 230, 300), mk('B', 200, 331)]);
  t('C5a: nearest first', pr.bot.n === 'A');
  pr = px2._pickLeader(me, [mk('A', 230, 300), mk('B', 200, 329)]);
  t('C5b: sticky within 12%', pr.bot.n === 'A');
  pr = px2._pickLeader(me, [mk('A', 230, 300), mk('B', 205, 300)]);
  t('C5c: switches when clearly better', pr.bot.n === 'B');
  px2._pickLeader(me, [mk('B', 201, 300)]);
  pr = px2._pickLeader(me, [mk('B', 205, 300), mk('C', 203, 300)]);
  t('C5d: engage lock holds vs closer rival', pr.bot.n === 'B');
  pr = px2._pickLeader(me, [mk('B', 210, 300), mk('C', 196, 300)]);
  t('C5e: lock releases past 6 tiles', pr.bot.n === 'C');
}

// ── REGRESSION v3.1: leader survives the 60-tile cull (the founder blank-rim
//    bug: v3 hid EVERYTHING when no bot was within CULL_TILES) ──
{
  let shown31 = null;
  const far = { n: 'farleader', x: 132, y: 150, cb: 65 }; // ~187 tiles away
  const p31 = create({
    now: () => clock,
    fetchBots: () => Promise.resolve({ bots: [far] }),
    show: (o) => { shown31 = o; },
    hide: () => { shown31 = null; },
    getViewport: () => vp
  });
  p31.tick({ fv: 1, bJ: 0, bK: 0, du: 200, dd: 300 });
  setImmediate(() => {
    p31.tick({ fv: 1, bJ: 0, bK: 0, du: 200, dd: 300 });
    t('v3.1 REGRESSION: far-only bot still shows as leader (no blank rim)', shown31 && shown31.markers.length === 1 && shown31.markers[0].leader === true && shown31.markers[0].name === 'farleader', shown31);
    t('v3.1 REGRESSION: far leader tiles banded (30+/40+/etc)', shown31 && /^[0-9]+\+$/.test(shown31.markers[0].tiles), shown31 && shown31.markers[0]);

// ── rim integration through tick() ──
let shown = null, hidden = 0;
const bots5 = [
  { n: 'northbot', x: 200, y: 250, cb: 20 },
  { n: 'eastbot', x: 150, y: 300, cb: 30 },
  { n: 'westbot', x: 250, y: 300, cb: 40 },
  { n: 'southbot', x: 200, y: 350, cb: 50 },
  { n: 'farbot', x: 260, y: 360, cb: 60 },
  { n: 'superfar', x: 350, y: 500, cb: 70 }
];
const pt = create({
  now: () => clock,
  fetchBots: () => Promise.resolve({ bots: bots5 }),
  show: (o) => { shown = o; },
  hide: () => { hidden++; },
  getViewport: () => vp
});
const mcWild = { fv: 1, bJ: 0, bK: 0, du: 200, dd: 300 };
const mcTitle = { fv: 0, bJ: 0, bK: 0, du: 200, dd: 300 };
pt.tick(mcTitle);
t('tick: hidden on title screen', shown === null && hidden >= 1);
pt.tick(mcWild);
setImmediate(() => {
  pt.tick(mcWild);
  t('tick: rim shows 4 markers (60-tile cull)', shown && shown.markers.length === 4, shown && shown.markers.map(function(m){return m.name;}));
  const leader = shown && shown.markers.find(function(m){return m.leader;});
  const alts = shown && shown.markers.filter(function(m){return !m.leader;});
  t('tick: exactly one leader', !!(leader && alts && shown.markers.length - alts.length === 1));
  t('tick: leader is nearest (northbot, banded 50+)', !!(leader && leader.name === 'northbot' && leader.tiles === '50+'), leader);
  t('tick: markers on >=3 distinct edges', !!(shown && new Set(shown.markers.map(function(m){return m.edge;})).size >= 3), shown && shown.markers.map(function(m){return m.edge;}));
  t('tick: all on-frame', !!(shown && shown.markers.every(function(m){return m.x - 48 >= 0 && m.x + 48 <= vp.w && m.y - 11 >= 0 && m.y + 11 <= vp.h;})));
  t('tick: cameraRelative=false without ey', !!(shown && shown.cameraRelative === false));
  let nogo = 0;
  shown.markers.forEach(function(m) {
    const inStrip = (m.x + 48 > STRIP.x0) && (m.y - 11 < STRIP.y1 + 4);
    const inSkull = (m.x + 48 > SKULL.x0) && (m.y + 11 > SKULL.y0 - 2) && (m.y - 11 < SKULL.y1 + 2);
    if (inStrip || inSkull) nogo++;
  });
  t('tick: no marker intersects furniture', nogo === 0, { nogo: nogo });
  pt.tick({ fv: 1, bJ: 0, bK: 0, du: 200, dd: 300, ey: 64, p2: 0 });
  t('tick: camera east rotates rim (northbot -> left edge)', !!(shown && shown.markers.find(function(m){return m.name === 'northbot';}).edge === 'left'), shown && shown.markers);
    done();
  });
  });
}
function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
