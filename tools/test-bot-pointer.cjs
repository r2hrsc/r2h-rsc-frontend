// Offline harness for r2h-bot-pointer.js v5 (Four Quadrants).
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
t('bearing N E S W (axes MEASURED: +x EAST, +y SOUTH)',
  p0._bearingDeg({x:200,y:300},{x:200,y:250}) === 0 &&
  p0._bearingDeg({x:200,y:300},{x:250,y:300}) === 90 &&
  p0._bearingDeg({x:200,y:300},{x:200,y:350}) === 180 &&
  p0._bearingDeg({x:200,y:300},{x:150,y:300}) === 270);
t('readPosition safety', p0._readPosition(null) === null && p0._readPosition({bJ:1}) === null && p0._readPosition({bJ:'x',bK:0,du:0,dd:0}) === null);
t('readPosition: n7/i2 NOT applied (surface origin, not plane delta)', p0._readPosition({bJ:10, bK:20, du:100, dd:200, n7:2304, i2:1776}).x === 110);
t('self-check: agree on surface (i2=1776, local y=402 -> lvl 5)', p0._positionSelfCheck({bK:66, i2:1776, dd:336}, {x:236, y:402}) === true);
t('self-check: disagree hides (simulated field drift)', p0._positionSelfCheck({bK:66, i2:1776, dd:336}, {x:236, y:100}) === false);
t('self-check: both zero-level agree (town)', p0._positionSelfCheck({bK:34, i2:1776, dd:384}, {x:220, y:418}) === true);
t('cameraDeg: ey=64 -> 90', p0._cameraDeg({ ey: 64, p2: 0 }) === 90);
t('cameraDeg ignores p2: ey=64 p2=128 -> 90, not 270', p0._cameraDeg({ ey: 64, p2: 128 }) === 90 && p0._cameraDeg({ ey: 64, p2: 128 }) !== ((64 + 128) & 255) * 360 / 256);
t('cameraDeg: null when ey absent', p0._cameraDeg({}) === null);

// ── quadrant bucketing (boundaries land in exactly one quadrant) ──
t('quadrants: 0/10/44.9/315 -> top; 45..134.9 -> right; 135..224.9 -> bottom; 225..314.9 -> left',
  p0._quadrantOf(0) === 'top' && p0._quadrantOf(10) === 'top' && p0._quadrantOf(44.9) === 'top' &&
  p0._quadrantOf(45) === 'right' && p0._quadrantOf(90) === 'right' && p0._quadrantOf(134.9) === 'right' &&
  p0._quadrantOf(135) === 'bottom' && p0._quadrantOf(180) === 'bottom' && p0._quadrantOf(224.9) === 'bottom' &&
  p0._quadrantOf(225) === 'left' && p0._quadrantOf(270) === 'left' && p0._quadrantOf(314.9) === 'left' &&
  p0._quadrantOf(315) === 'top');
t('boundary: exactly 45 lands in RIGHT only', p0._quadrantOf(45) === 'right' && p0._quadrantOf(44.999) === 'top');
t('boundary: exactly 135 -> BOTTOM, exactly 225 -> LEFT, exactly 315 -> TOP', p0._quadrantOf(135) === 'bottom' && p0._quadrantOf(225) === 'left' && p0._quadrantOf(315) === 'top');
t('quadrantOf: negative + >360 inputs normalise', p0._quadrantOf(-45) === 'top' && p0._quadrantOf(360 + 90) === 'right' && p0._quadrantOf(-90) === 'left');

// ── fixed slots ──
{
  const sT = p0._slotPos('top', vp.w, vp.h), sB = p0._slotPos('bottom', vp.w, vp.h);
  const sL = p0._slotPos('left', vp.w, vp.h), sR = p0._slotPos('right', vp.w, vp.h);
  t('slots: TOP centre (0.40w, 21)', sT.x === 512 && sT.y === 21, sT);
  t('slots: BOTTOM centre (0.40w, h-21)', sB.x === 512 && sB.y === 612, sB);
  t('slots: LEFT centre (43, 0.50h)', sL.x === 43 && sL.y === 317, sL);
  t('slots: RIGHT centre (w-43, 0.50h)', sR.x === 1237 && sR.y === 317, sR);
  // marker box [x-31,x+31]x[y-9,y+9] must clear icon strip + skull
  const boxes = { T: [sT.x - 31, sT.y - 9, sT.x + 31, sT.y + 9], B: [sB.x - 31, sB.y - 9, sB.x + 31, sB.y + 9], L: [sL.x - 31, sL.y - 9, sL.x + 31, sL.y + 9], R: [sR.x - 31, sR.y - 9, sR.x + 31, sR.y + 9] };
  const STRIP = { x0: 0.609 * vp.w, y1: 0.101 * vp.h };
  const SKULL = { x0: 0.850 * vp.w, y0: 0.805 * vp.h, y1: 0.948 * vp.h };
  let hit = 0;
  for (const k in boxes) {
    const [x1, y1, x2, y2] = boxes[k];
    const inStrip = x2 > STRIP.x0 && y1 < STRIP.y1;
    const inSkull = x2 > SKULL.x0 && y2 > SKULL.y0 && y1 < SKULL.y1;
    if (inStrip || inSkull) hit++;
  }
  t('slots: all four clear of icon strip + skull', hit === 0, { hit, boxes });
  const ks = Object.keys(boxes);
  let overlaps = 0;
  for (let a = 0; a < ks.length; a++) for (let b2 = a + 1; b2 < ks.length; b2++) {
    const A = boxes[ks[a]], B = boxes[ks[b2]];
    if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) overlaps++;
  }
  t('slots: no two markers overlap', overlaps === 0, { overlaps });
}

// ── tick integration: at most 4, one per quadrant, nearest per quadrant ──
let shown = null;
const botsQ = [
  { n: 'northbot', x: 220, y: 390, cb: 30 },   // north (y smaller) -> TOP
  { n: 'eastbot',  x: 250, y: 418, cb: 20 },   // east (x larger)  -> RIGHT
  { n: 'southbot', x: 220, y: 450, cb: 10 },   // south (y larger) -> BOTTOM
  { n: 'westbot',  x: 190, y: 418, cb: 40 },   // west (x smaller) -> LEFT
  { n: 'farNE',    x: 400, y: 300, cb: 90 },   // far NE (also RIGHT bucket, far)
  { n: 'nearE2',   x: 240, y: 418, cb: 55 }    // east, nearer than eastbot
];
const pq = create({
  now: () => clock,
  fetchBots: () => Promise.resolve({ bots: botsQ }),
  show: (o) => { shown = o; },
  hide: () => { shown = null; },
  getViewport: () => vp
});
pq.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
setImmediate(() => {
  pq.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
  const mks = shown ? shown.markers : [];
  t('tick: at most 4 markers', mks.length <= 4, mks.length);
  const byEdge = {};
  mks.forEach(m => { byEdge[m.edge] = m; });
  t('tick: exactly the 4 occupied quadrants render', ['top','right','bottom','left'].every(e => byEdge[e]), Object.keys(byEdge));
  t('tick: contested east quadrant shows NEARER bot (cb55, not cb20 nor far cb90)', byEdge.right && byEdge.right.combat === 55, byEdge.right);
  t("tick: leader is overall nearest (nearE2 cb55 d=20)", mks.find(m => m.leader).combat === 55, mks.find(m => m.leader));
  t('tick: markers at FIXED slot pixels', mks.every(m => {
    const s = p0._slotPos(m.edge, vp.w, vp.h);
    return m.x === s.x && m.y === s.y;
  }));
  t('tick: fixed slots never overlap (tick output)', (function () {
    const bs = mks.map(m => [m.x - 31, m.y - 9, m.x + 31, m.y + 9]);
    for (let a = 0; a < bs.length; a++) for (let b2 = a + 1; b2 < bs.length; b2++)
      if (bs[a][0] < bs[b2][2] && bs[b2][0] < bs[a][2] && bs[a][1] < bs[b2][3] && bs[b2][1] < bs[a][3]) return false;
    return true;
  })());

  // camera rotated 90 (ey=64 -> yaw 90): screen bearing = world - 90
  // northbot 0->270 LEFT; nearE2 90->0 TOP; southbot 180->90 RIGHT; westbot 270->180 BOTTOM
  pq.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 64, i2: 1776 });
  setImmediate(() => {
    const byE2 = {};
    shown.markers.forEach(m => { byE2[m.edge] = m; });
    t('tick (yaw90): bots orbit correctly - north->LEFT, east->TOP, south->RIGHT, west->BOTTOM',
      byE2.left && byE2.left.combat === 30 && byE2.top && byE2.top.combat === 55 &&
      byE2.right && byE2.right.combat === 10 && byE2.bottom && byE2.bottom.combat === 40,
      byE2);

    // no cull: lone far bot still renders in its quadrant
    const pf = create({
      now: () => clock, fetchBots: () => Promise.resolve({ bots: [{ n: 'farone', x: 400, y: 300, cb: 66 }] }),
      show: (o) => { shown = o; }, hide: () => { shown = null; }, getViewport: () => vp
    });
    pf.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
    setImmediate(() => {
      pf.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
      const f = shown && shown.markers[0];
      // me(220,418) -> bot(400,300): d = hypot(180,118) ~ 215 -> "210+"
      t('no-cull: lone far bot still shows as its quadrant marker (210+)', f && f.tiles === '210+' && f.leader === true, f);

      // ── CLOSED-LOOP (kept, weaker claim): walking toward the MARKER'S
      // QUADRANT CENTRE direction reduces distance. 8 directions x 8 facings.
      {
        let closedOk = 0, closedTotal = 0;
        for (let a = 0; a < 8; a++) {
          const brg = a * 45;
          const botCL = { n: 'cl', x: 220 + Math.round(Math.sin(brg * Math.PI / 180) * 40), y: 418 + Math.round(Math.cos(brg * Math.PI / 180) * 40), cb: 20 };
          const meCL = { x: 220, y: 418 };
          for (let f2 = 0; f2 < 8; f2++) {
            const yaw = f2 * 45;
            const sa = (p0._bearingDeg(meCL, botCL) - yaw + 360) % 360;
            const quad = p0._quadrantOf(sa);
            const centreAngles = { top: 0, right: 90, bottom: 180, left: 270 };
            const worldAng = (centreAngles[quad] + yaw) % 360;
            const nx = meCL.x + Math.sin(worldAng * Math.PI / 180);   // +sin = EAST (measured)
            const ny = meCL.y - Math.cos(worldAng * Math.PI / 180);   // +y south
            const d0 = Math.hypot(botCL.x - meCL.x, botCL.y - meCL.y);
            const d1 = Math.hypot(botCL.x - nx, botCL.y - ny);
            closedTotal++;
            if (d1 < d0) closedOk++;
          }
        }
        t('closed-loop: walking toward the quadrant centre reduces distance in all 64 combos', closedOk === closedTotal, { closedOk, closedTotal });
      }

      // hysteresis: the bright quadrant sticks while near-equal, switches when clearly better
      // (clock must advance past FETCH_MS so each phase's bot list refetches)
      {
        let list = [{ n: 'aN', x: 220, y: 388, cb: 11 }, { n: 'bS', x: 220, y: 450, cb: 22 }];
        let hclock = 1000;
        const phh = create({ now: () => hclock, fetchBots: () => Promise.resolve({ bots: list }), show: (o) => { shown = o; }, hide: () => {}, getViewport: () => vp });
        phh.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
        setImmediate(() => {
          hclock += 6000;
          phh.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
          const lead1 = shown.markers.find(m => m.leader);
          list = [{ n: 'aN', x: 220, y: 388, cb: 11 }, { n: 'bS', x: 220, y: 446, cb: 22 }];  // S now 4% nearer - NOT clearly better
          hclock += 6000;
          phh.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
          setImmediate(() => {
            hclock += 6000;
            phh.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
            const lead2 = shown.markers.find(m => m.leader);
            list = [{ n: 'aN', x: 220, y: 388, cb: 11 }, { n: 'bS', x: 220, y: 422, cb: 22 }];  // S MUCH nearer -> switch
            hclock += 6000;
            phh.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
            setImmediate(() => {
              hclock += 6000;
              phh.tick({ fv: 1, bJ: 0, bK: 0, du: 220, dd: 418, ey: 0, i2: 1776 });
              const lead3 = shown.markers.find(m => m.leader);
              t('hysteresis: bright quadrant sticks while near-equal, switches when clearly better',
                lead1 && lead1.combat === 11 && lead2 && lead2.combat === 11 && lead3 && lead3.combat === 22,
                { l1: lead1 && lead1.combat, l2: lead2 && lead2.combat, l3: lead3 && lead3.combat });
              pq.tick({ fv: 0 });
              t('tick: fv=0 hides', true);
              done();
            });
          });
        });
      }
    });
  });
});
function done() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
