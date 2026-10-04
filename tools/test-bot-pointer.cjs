// Offline harness for r2h-bot-pointer.js v4 (True Screen Rim).
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

const p0 = create({ now: () => clock, fetchBots: () => Promise.resolve({ bots: [] }), show: () => {}, hide: () => {}, getScene: () => null });
t('wild y=427 level 0', p0._wildernessLevel(427) === 0);
t('wild y=426 level 1', p0._wildernessLevel(426) === 1);
t('bearing N E S W',
  p0._bearingDeg({x:200,y:300},{x:200,y:250}) === 0 &&
  p0._bearingDeg({x:200,y:300},{x:150,y:300}) === 90 &&
  p0._bearingDeg({x:200,y:300},{x:200,y:350}) === 180 &&
  p0._bearingDeg({x:200,y:300},{x:250,y:300}) === 270);
t('readPosition safety', p0._readPosition(null) === null && p0._readPosition({bJ:1}) === null && p0._readPosition({bJ:'x',bK:0,du:0,dd:0}) === null);
// v4.1: self-check uses the client's ABSOLUTE formula (i2 = surface origin)
t('self-check: agree on surface (i2=1776, local y=402 -> lvl 5)', p0._positionSelfCheck({bK:66, i2:1776, dd:336}, {x:236, y:402}) === true);
t('self-check: disagree hides (simulated field drift)', p0._positionSelfCheck({bK:66, i2:1776, dd:336}, {x:236, y:100}) === false);
t('self-check: both zero-level agree (town)', p0._positionSelfCheck({bK:34, i2:1776, dd:384}, {x:220, y:418}) === true);
t('readPosition: n7/i2 NOT applied (surface origin, not plane delta)', p0._readPosition({bJ:10, bK:20, du:100, dd:200, n7:2304, i2:1776}).x === 110);
t('cameraDeg fallback: ey=64 -> 90', p0._cameraDeg({ ey: 64, p2: 0 }) === 90);
t('cameraDeg fallback: null when ey absent', p0._cameraDeg({}) === null);
// 2026-10-04: the minimap-term bug - cameraDeg must IGNORE p2 (minimapRandom_1)
t('cameraDeg ignores p2: ey=64 p2=128 -> 90, not 270', p0._cameraDeg({ ey: 64, p2: 128 }) === 90 && p0._cameraDeg({ ey: 64, p2: 128 }) !== ((64 + 128) & 255) * 360 / 256);
t('cameraDeg ignores p2: ey=64 p2=200 -> 90', p0._cameraDeg({ ey: 64, p2: 200 }) === 90);

// ── screenAzimuth + fitYaw: the v4 core ──
t('screenAzimuth: up=0 right=90 down=180 left=270',
  p0._screenAzimuth(256, 100) === 0 &&
  Math.abs(p0._screenAzimuth(400, 256) - 90) < 0.01 &&
  Math.abs(p0._screenAzimuth(256, 400) - 180) < 0.01 &&
  Math.abs(p0._screenAzimuth(100, 256) - 270) < 0.01);

// Camera-state projection assertion (Claude's demanded test): simulate a
// camera yaw of 45deg via synthetic sprites. Bot due world-north (brg 0)
// appears at screen azimuth 315 (bearing - yaw), etc.
{
  const me = { x: 220, y: 420 };
  const bots = [
    { n: 'n1', x: 220, y: 410, cb: 10 },
    { n: 'e1', x: 210, y: 420, cb: 10 },
    { n: 's1', x: 220, y: 430, cb: 10 }
  ];
  const az2xy = (az) => ({ x: 256 + 60 * Math.sin(az * Math.PI / 180), y: 256 - 60 * Math.cos(az * Math.PI / 180) });
  const a0 = az2xy(315), a90 = az2xy(45), a180 = az2xy(135);
  const scene = [
    { wx: 220 * 128, wz: 410 * 128, sx: a0.x, sy: a0.y },
    { wx: 210 * 128, wz: 420 * 128, sx: a90.x, sy: a90.y },
    { wx: 220 * 128, wz: 430 * 128, sx: a180.x, sy: a180.y }
  ];
  const pairs = p0._matchScene(bots, me, scene);
  t('matchScene: all 3 bots matched', pairs.length === 3, pairs);
  const yaw = p0._fitYaw(me, pairs);
  t('fitYaw: recovers 45deg camera from 3 pairs', yaw !== null && Math.abs(yaw - 45) < 0.5, yaw);
}
{
  // fitYaw robustness: one bad pair must not wreck the estimate
  const me = { x: 220, y: 420 };
  const bots = [
    { n: 'a', x: 220, y: 410, cb: 1 },
    { n: 'b', x: 210, y: 420, cb: 1 },
    { n: 'c', x: 200, y: 430, cb: 1 }
  ];
  const az2xy = (az) => ({ x: 256 + 60 * Math.sin(az * Math.PI / 180), y: 256 - 60 * Math.cos(az * Math.PI / 180) });
  const brg = (b) => p0._bearingDeg(me, b);
  const y0 = az2xy(brg(bots[0]) - 90), y1 = az2xy(brg(bots[1]) - 90), y2 = az2xy(brg(bots[2]) - 30);
  const scene = [
    { wx: 220 * 128, wz: 410 * 128, sx: y0.x, sy: y0.y },
    { wx: 210 * 128, wz: 420 * 128, sx: y1.x, sy: y1.y },
    { wx: 200 * 128, wz: 430 * 128, sx: y2.x, sy: y2.y }
  ];
  const yaw = p0._fitYaw(me, p0._matchScene(bots, me, scene));
  t('fitYaw: majority pulls toward 90 (70.9 exact circular mean), away from outlier 30', yaw !== null && Math.abs(yaw - 70.89) < 0.5 && Math.abs(yaw - 90) < Math.abs(yaw - 30), yaw);
  t('fitYaw: null with no pairs', p0._fitYaw(me, []) === null);
}

// ── rail sweep (v4 62px geometry: half-width 31, half-height 9) ──
let parkedCount = 0, wrongSide = 0, offFrame = 0, inNogo = 0;
const STRIP = { x0: 0.609 * vp.w, y1: 0.101 * vp.h };
const SKULL = { x0: 0.850 * vp.w, y0: 0.805 * vp.h, y1: 0.948 * vp.h };
for (let b = 0; b < 360; b++) {
  const rr = p0._railPoint(b, vp.w, vp.h);
  const dx = Math.sin(b * Math.PI / 180);
  if (rr.parked) parkedCount++;
  if (dx > 0.1 && rr.x <= 640) wrongSide++;
  if (dx < -0.1 && rr.x >= 640) wrongSide++;
  if (rr.x - 31 < 0 || rr.x + 31 > vp.w || rr.y - 9 < 0 || rr.y + 9 > vp.h) offFrame++;
  const inStrip = (rr.x + 31 > STRIP.x0 + 2) && (rr.y - 9 < STRIP.y1 + 4);
  const inSkull = (rr.x + 31 > SKULL.x0 + 2) && (rr.y + 9 > SKULL.y0 - 2) && (rr.y - 9 < SKULL.y1 + 2);
  if (inStrip || inSkull) inNogo++;
}
t('rail: 0/360 wrong side', wrongSide === 0, { wrongSide });
t('rail: 0/360 off-frame at 62px', offFrame === 0, { offFrame });
t('rail: 0/360 in furniture no-go', inNogo === 0, { inNogo });
t('rail: parked fraction < 25%', parkedCount / 360 < 0.25, { parkedCount });

// ── spread: rim markers spaced; on-screen markers untouched ──
{
  const markers = [
    { x: 600, y: 22, edge: 'top', leader: true, onScreen: false },
    { x: 610, y: 22, edge: 'top', leader: false, onScreen: false },
    { x: 700, y: 300, edge: 'bot', leader: false, onScreen: true }
  ];
  p0._spreadByEdge(markers, vp.w, vp.h);
  t('spread: rim markers >=28px apart', markers[1].x - markers[0].x >= 28, markers);
  t('spread: on-screen marker untouched', markers[2].x === 700 && markers[2].y === 300, markers[2]);
}

// ── C5: leader hysteresis/lock (carried) ──
{
  const px2 = create({ now: () => clock, fetchBots: () => Promise.resolve({bots:[]}), show: () => {}, hide: () => {}, getScene: () => null });
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
  t('C5d: engage lock holds', pr.bot.n === 'B');
  pr = px2._pickLeader(me, [mk('B', 210, 300), mk('C', 196, 300)]);
  t('C5e: lock releases past 6', pr.bot.n === 'C');
}

// ── tick integration: on-bot placement + rim fallback + far leader ──
let shown = null, hidden = 0;
const bots5 = [
  { n: 'visbot', x: 215, y: 413, cb: 29 },
  { n: 'offbot', x: 260, y: 400, cb: 41 },
  { n: 'farleader', x: 132, y: 150, cb: 65 }
];
const pt = create({
  now: () => clock,
  fetchBots: () => Promise.resolve({ bots: bots5 }),
  show: (o) => { shown = o; },
  hide: () => { hidden++; },
  getScene: () => [ { wx: 215 * 128, wz: 413 * 128, sx: 300, sy: 200 } ],
  getViewport: () => vp
});
pt.tick({ fv: 0 });
t('tick: fv=0 hides', shown === null && hidden >= 1);
pt.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 415 });
setImmediate(() => {
  pt.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 415 });
  const vis = shown && shown.markers.find(m => m.name === 'visbot');
  t('tick: visible bot marker ON the sprite', vis && vis.onScreen === true && Math.abs(vis.x - 300 / 512 * 1280) < 1 && Math.abs(vis.y - (200 - 34) / 345 * 633) < 1, vis);
  const off = shown && shown.markers.find(m => m.name === 'offbot');
  t('tick: off-screen bot on the rim', off && off.onScreen === false && off.edge !== 'bot', off);
  t('tick: yaw fitted (visiblePairs >= 1)', shown && shown.yaw !== null && shown.visiblePairs >= 1, shown && { yaw: shown.yaw, visiblePairs: shown.visiblePairs });
  const pf = create({
    now: () => clock, fetchBots: () => Promise.resolve({ bots: [{ n: 'farleader', x: 132, y: 150, cb: 65 }] }),
    show: (o) => { shown = o; }, hide: () => { hidden++; },
    getScene: () => null, getViewport: () => vp
  });
  pf.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 415 });
  setImmediate(() => {
    pf.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 415 });
    t('tick: far-only leader still shows (v3.1 regression held)', shown && shown.markers.length === 1 && shown.markers[0].leader === true, shown);
    t('tick: no scene + no ey -> yaw null, world-absolute degrade (no crash)', shown !== null && shown.yaw === null);
    // ── 2026-10-04: ZERO-SPRITE fallback path (the founder's condition) ──
    // No sprites in view at all -> fitYaw null -> cameraDeg fallback must
    // carry the marker, and the rim bearing must equal worldBearing - cameraDeg.
    // RSC axes: x WEST, y SOUTH. Bot at LARGER x = due WEST of me = brg 270.
    {
      const meF = { x: 220, y: 418 };
      const botF = { n: 'lonebot', x: 223, y: 418, cb: 55 };   // due WEST (brg 270)
      t('zero-sprite: fitYaw null on empty pairs', p0._fitYaw(meF, []) === null);
      t('zero-sprite: fallback yaw = ey alone (p2 ignored)', p0._cameraDeg({ ey: 64, p2: 128 }) === 90);
      // camera facing EAST (ey=64): west bot is BEHIND -> screen 180 -> bottom
      const rimBehind = p0._railPoint((p0._bearingDeg(meF, botF) - 90 + 360) % 360, 1280, 633);
      t('zero-sprite: bot behind (camera east, bot west) -> BOTTOM rail', rimBehind.edge === 'bottom', rimBehind);
      // camera facing WEST (ey=192): same bot is AHEAD -> screen 0 -> top
      const rimAhead = p0._railPoint((p0._bearingDeg(meF, botF) - 270 + 360) % 360, 1280, 633);
      t('zero-sprite: bot ahead (camera west) -> TOP rail', rimAhead.edge === 'top', rimAhead);
      // camera facing NORTH (ey=0): west bot is to the LEFT -> screen 270 -> left
      const rimLeft = p0._railPoint((p0._bearingDeg(meF, botF) - 0 + 360) % 360, 1280, 633);
      t('zero-sprite: bot left (camera north) -> LEFT rail', rimLeft.edge === 'left', rimLeft);
    }
    done();
  });
});
function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
