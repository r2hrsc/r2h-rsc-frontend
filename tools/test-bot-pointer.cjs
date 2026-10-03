// Offline harness for r2h-bot-pointer.js v2 (Edge Rail).
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

// ── unit: wilderness / bearing / position (carried from v1) ──
const p0 = create({ now: () => clock, fetchBots: () => Promise.resolve({ bots: [] }), show: () => {}, hide: () => {} });
t('wild y=427 level 0', p0._wildernessLevel(427) === 0);
t('wild y=426 level 1', p0._wildernessLevel(426) === 1);
t('bearing N=0 E=90 S=180 W=270',
  p0._bearingDeg({x:200,y:300},{x:200,y:250}) === 0 &&
  p0._bearingDeg({x:200,y:300},{x:150,y:300}) === 90 &&
  p0._bearingDeg({x:200,y:300},{x:200,y:350}) === 180 &&
  p0._bearingDeg({x:200,y:300},{x:250,y:300}) === 270);
t('readPosition safety', p0._readPosition(null) === null && p0._readPosition({bJ:1}) === null && p0._readPosition({bJ:'x',bK:0,du:0,dd:0}) === null);

// ── camera ──
t('cameraDeg: ey=0,p2=0 -> 0', p0._cameraDeg({ ey: 0, p2: 0 }) === 0);
t('cameraDeg: ey=64 -> 90 (east)', p0._cameraDeg({ ey: 64, p2: 0 }) === 90);
t('cameraDeg: ey=128 -> 180', p0._cameraDeg({ ey: 128, p2: 0 }) === 180);
t('cameraDeg: ey=250,p2=10 -> wraps ((250+10)&255=4) -> 5.625', p0._cameraDeg({ ey: 250, p2: 10 }) === 5.625);
t('cameraDeg: null when ey absent', p0._cameraDeg({}) === null);
t('cameraDeg: p2 included (32+32 -> 90)', p0._cameraDeg({ ey: 32, p2: 32 }) === 90);

// ── rail projection ──
const vp = { w: 1280, h: 633 };
let r = p0._railPoint(0, vp.w, vp.h);
t('rail 0deg: top edge, x=centre, not parked', r.edge === 'top' && Math.abs(r.x - 640) < 40 && r.y === 22 && !r.parked, r);
r = p0._railPoint(180, vp.w, vp.h);
t('rail 180deg: bottom edge, x=centre', r.edge === 'bottom' && Math.abs(r.x - 640) < 40 && r.y === 633 - 22, r);
r = p0._railPoint(270, vp.w, vp.h);
t('rail 270deg: left edge', r.edge === 'left' && r.x === 22 && !r.parked, r);
r = p0._railPoint(90, vp.w, vp.h);
t('rail 90deg (right): parked at left corner', r.parked === true && r.x === 22 && (r.y === 22 || r.y === 633-22), r);
r = p0._railPoint(45, vp.w, vp.h);
t('rail 45deg (up-right): parked beyond 61% limit', r.parked === true, r);
r = p0._railPoint(315, vp.w, vp.h);
t('rail 315deg (up-left): top edge legal', r.edge === 'top' && !r.parked && r.x < 1280*0.61 + 1, r);

// ── heat ramp ──
t('heat bands', p0._heat(3) === '#ff4444' && p0._heat(10) === '#ff8c1a' && p0._heat(25) === '#e8d44d' && p0._heat(90) === '#cfc98f');

// ── pick: hysteresis + engage lock (behavioural) ──
const me = { x: 200, y: 300 };
const mk = (n, x, y) => ({ n, x, y, cb: 10 });
const px = create({ now: () => clock, fetchBots: () => Promise.resolve({bots:[]}), show: () => {}, hide: () => {} });
let pr = px._pick(me, [mk('A', 230, 300), mk('B', 200, 331)]);
t('pick: nearest first', pr.bot.n === 'A');
pr = px._pick(me, [mk('A', 230, 300), mk('B', 200, 329)]); // B=29 vs sticky A=30: 29 >= 30*0.88 -> stay
t('hysteresis: stays sticky within 12%', pr.bot.n === 'A');
pr = px._pick(me, [mk('A', 230, 300), mk('B', 205, 300)]); // B=5: clearly better -> switch
t('hysteresis: switches when clearly better', pr.bot.n === 'B');
pr = px._pick(me, [mk('B', 201, 300)]); // 1 tile: engage lock on B
pr = px._pick(me, [mk('B', 205, 300), mk('C', 203, 300)]); // B=5 locked vs C=3
t('engage lock holds to 6 tiles vs closer rival', pr.bot.n === 'B', pr);
pr = px._pick(me, [mk('B', 210, 300), mk('C', 203, 300)]); // B=10 > 6 -> release; C=3
t('engage lock releases past 6 tiles', pr.bot.n === 'C', pr);

// ── tick integration: fv gate + camera-relative + payload shape ──
let shown = null, hidden = 0;
const pt = create({
  now: () => clock,
  fetchBots: () => Promise.resolve({ bots: [{ n: 'plagueknight', x: 132, y: 150, cb: 65 }] }),
  show: (o) => { shown = o; },
  hide: () => { hidden++; },
  getViewport: () => ({ w: 1280, h: 633 })
});
const mcWild = { fv: 1, bJ: 0, bK: 0, du: 200, dd: 300 };
const mcTitle = { fv: 0, bJ: 0, bK: 0, du: 200, dd: 300 };
const mcWildCam = { fv: 1, bJ: 0, bK: 0, du: 200, dd: 300, ey: 64, p2: 0 };
pt.tick(mcTitle);
t('tick: hidden on title screen (fv=0)', shown === null && hidden >= 1);
pt.tick(mcWild);
setImmediate(() => {
  pt.tick(mcWild);
  const expectWorld = p0._bearingDeg({x:200,y:300},{x:132,y:150});
  t('tick: shows in wild, cameraRelative=false without ey', shown !== null && shown.cameraRelative === false, shown);
  t('tick: world bearing matches unit math', shown && Math.abs(shown.deg - expectWorld) < 0.01, { deg: shown && shown.deg, expectWorld });
  pt.tick(mcWildCam);
  t('tick: camera east subtracts 90deg', shown && Math.abs(((shown.deg - (expectWorld - 90)) % 360 + 360) % 360) < 0.01 && shown.cameraRelative === true, shown);
  t('tick: chip coords + heat + combat + parked flag', shown && typeof shown.x === 'number' && typeof shown.y === 'number' && shown.heat === '#cfc98f' && shown.combat === 65 && shown.parked === false, shown);
  done();
});
function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
