# TASK: Generalize AIOMiner v205 → v206 (data-driven mines/banks + webwalk routing)

FILE: public/game/r2h-bot-engine.js (ONLY this file + App.tsx + index.html + GameCanvas.tsx)

A complete new data block is ALREADY GENERATED at engine_v206_data.js (in repo root) (92KB).
It contains: MINE_REGISTRY, BANK_REGISTRY, RESPAWN_BY_ROCK, ORE_ITEM_IDS, WEBWALK_DEFAULT,
WEBWALK_GUILD, webwalkGraph/parseWebwalk/webwalkSnap/webwalkDijkstra/webwalkRoute.

## STEP 1 — Insert data block

Insert the entire contents of engine_v206_data.js (in repo root) into r2h-bot-engine.js,
immediately BEFORE the line `  // Coal rock coords near wilderness mine (284, 380) — from server SceneryLocs.json`
(keep the old COAL_WILDERNESS/MINE_STAND_TILE/BANK_ROUTE/MINE_ROUTE vars — legacy scripts still reference them).

## STEP 2 — Fix rockTypeMap (line ~833, currently WRONG IDs)

Replace the existing rockTypeMap block:
```js
        var rockTypeMap = {
          Copper: [100,101], Tin: [104,105], Iron: [102,103], Clay: [114,115],
          Coal: [106,107,108,109,110,111], Silver: [112,113],
          Gold: [210,211], Mithril: [176,195,196], Adamantite: [315,496], Runite: [1030]
        };
```
with (verified against server ObjectMining.xml):
```js
        var rockTypeMap = {
          Copper: [100,101], Tin: [104,105], Iron: [102,103], Clay: [114,115],
          Coal: [110,111], Silver: [195,196],
          Gold: [112,113], Mithril: [106,107], Adamantite: [108,109], Runite: [210,211]
        };
```

## STEP 3 — Wire registry into the mining branch of startBot (line ~827)

Replace the whole `} else if (isMiningScript(scriptId)) {` block (lines ~827-848, ends `tickFn = makeGatheringScript(mineRocks, 3000, mineFallback);`) with:

```js
    } else if (isMiningScript(scriptId)) {
      // v206: full ScriptPanel mining config — camp/bank registry + webwalk routing
      var campName = runtimeConfig.campLocation || 'Wilderness';
      var mine = MINE_REGISTRY[campName] || MINE_REGISTRY['Wilderness'];
      if (runtimeConfig.customCoords && isFinite(parseInt(runtimeConfig.customX)) && isFinite(parseInt(runtimeConfig.customY))) {
        var cx = parseInt(runtimeConfig.customX), cy = parseInt(runtimeConfig.customY);
        mine = { stand: [cx, cy], rocks: mine.rocks };  // custom stand tile, same rocks
      }
      // Build rock ID list: intersection of UI selection and the camp's actual rocks
      var mineRocks = [];
      var campIds = {};
      for (var ri = 0; ri < mine.rocks.length; ri++) campIds[mine.rocks[ri][2]] = true;
      if (runtimeConfig.rocks) {
        var selectedRockTypes = [];
        var rockTypeMap = {
          Copper: [100,101], Tin: [104,105], Iron: [102,103], Clay: [114,115],
          Coal: [110,111], Silver: [195,196],
          Gold: [112,113], Mithril: [106,107], Adamantite: [108,109], Runite: [210,211]
        };
        for (var rockName in runtimeConfig.rocks) {
          if (runtimeConfig.rocks[rockName] && rockTypeMap[rockName]) {
            selectedRockTypes = selectedRockTypes.concat(rockTypeMap[rockName]);
          }
        }
        for (var si = 0; si < selectedRockTypes.length; si++) {
          if (campIds[selectedRockTypes[si]]) mineRocks.push(selectedRockTypes[si]);
        }
      }
      if (mineRocks.length === 0) mineRocks = Object.keys(campIds).map(Number);  // no selection → all camp rocks
      var mineFallback = mine.rocks.map(function(r) { return { x: r[0], y: r[1] }; });
      var bankName = runtimeConfig.mineBankLocation || 'Edgeville';
      var bankTile = BANK_REGISTRY[bankName] || BANK_REGISTRY['Edgeville'];
      var powerMine = !!runtimeConfig.mineNoBank;
      var useGuild = (campName === 'Mining Guild');
      log('Mining v206: camp=' + campName + ' stand=(' + mine.stand[0] + ',' + mine.stand[1] + ')' +
          ' rocks=[' + mineRocks.join(',') + '] bank=' + (powerMine ? 'NONE (power-mine)' : bankName + ' (' + bankTile[0] + ',' + bankTile[1] + ')'));
      tickFn = makeGatheringScript(mineRocks, 3000, mineFallback, {
        stand: mine.stand, bank: bankTile, powerMine: powerMine, useGuild: useGuild
      });
    }
```

## STEP 4 — Parameterize makeGatheringScript (line ~1344)

Change signature from `function makeGatheringScript(objectIds, actionTime, fallbackCoords) {`
to:
```js
  function makeGatheringScript(objectIds, actionTime, fallbackCoords, opts) {
    opts = opts || {};
    var MINE_STAND = opts.stand || [276, 379];       // wilderness default (v205)
    var BANK_TILE  = opts.bank  || [216, 449];       // edgeville default (v205)
    var POWER_MINE = !!opts.powerMine;
    var USE_GUILD  = !!opts.useGuild;
```

### 4a. Orientation section (~line 1379): replace BOTH occurrences of
`MINE_AREA_CENTER = {x: MINE_STAND_TILE.x, y: MINE_STAND_TILE.y};`
with
`MINE_AREA_CENTER = {x: MINE_STAND[0], y: MINE_STAND[1]};`
(first occurrence ~1384, second ~1467)

### 4b. Banking state machine (~line 1457): replace
`var EDGEVILLE_BANK = {x: 216, y: 449};`
with
`var BANK = {x: BANK_TILE[0], y: BANK_TILE[1]};`
and replace ALL references to `EDGEVILLE_BANK.x`/`EDGEVILLE_BANK.y` within the banking
state machine (lines ~1457-1612: curDist calc, trackTarget, dx/dy, walkTo calls, log strings,
'No banker nearby' walkTo) with `BANK.x`/`BANK.y`. Also update the 'Arrived at Edgeville bank'
log string to use the actual bank: `log('Arrived at bank — talking to banker');`

### 4c. Banker IDs (~line 1600): replace
`var BANKER_IDS = [95, 224, 268, 485, 540, 617];` — KEEP as is (all banker NPCs work), but the Al-Kharid bank (268) etc. already covered.

### 4d. Power-mine mode: in the banking entry check (line ~1454)
`if (getInventoryCount() >= 30 || scriptState.phase === 'banking') {`
Insert BEFORE this line:
```js
      // ── v206 POWER-MINE: drop ores instead of banking ──
      if (POWER_MINE && getInventoryCount() >= 28 && scriptState.phase !== 'banking') {
        // Drop every ore/gem in inventory (never the pickaxe slot 126/pickaxe ids)
        for (var di = 0; di < ORE_ITEM_IDS.length; di++) {
          var slot = getInventoryIndex(ORE_ITEM_IDS[di]);
          if (slot >= 0) { dropItem(slot); return 800; }  // one drop per tick
        }
        return 800;  // nothing left to drop — resume mining
      }
```
(This runs before the banking machine, so with powerMine=true the bank walk never starts.)

### 4e. Webwalk routing for long trips (replaces straight-line bank walk)
In the 'walk' sub-phase (~line 1557) and 'return_walk' sub-phase (~line 1702), the
straight-line 30-tile stepping must become webwalk-aware when the distance is > 30:
Add a helper INSIDE makeGatheringScript, right after the opts parsing:

```js
    // Webwalk route (computed once per trip leg): [{x,y,label}...]
    function routeTo(tx, ty) {
      if (scriptState._routeCache && scriptState._routeCache.t === tx + ',' + ty) return scriptState._routeCache.r;
      var r = webwalkRoute(getX(), getY(), tx, ty, USE_GUILD);
      scriptState._routeCache = { t: tx + ',' + ty, r: r };
      return r;
    }
    function invalidateRoute() { scriptState._routeCache = null; }
```

In the 'walk' phase, replace the whole walk-sending block:
```js
          if (!scriptState._bankRouteSent || scriptState._bankStuckTicks >= 3 || shouldRetreat) {
            var dx = EDGEVILLE_BANK.x - CUR_X; ... walkTo(stepX, stepY); ...
            scriptState._bankRouteSent = true; ...
            return 3000;
          }
```
with webwalk stepping (30-tile legs toward next graph node; special-edge handler when
the next node has a label):

```js
          if (!scriptState._bankRouteSent || scriptState._bankStuckTicks >= 3 || shouldRetreat) {
            invalidateRoute();
            var route = routeTo(BANK.x, BANK.y);
            var target = route ? nextRouteTarget(route, BANK.x, BANK.y) : { x: BANK.x, y: BANK.y };
            log('Walking to bank via (' + target.x + ',' + target.y + ') from (' + CUR_X + ',' + CUR_Y + ')');
            walkTo(target.x, target.y);
            scriptState._bankRouteSent = true;
            scriptState._bankStuckTicks = 0;
            scriptState._bankLastX = CUR_X;
            scriptState._bankLastY = CUR_Y;
            return 3000;
          }
```

Add this helper next to routeTo (also inside makeGatheringScript):
```js
    // Next walk target: the farthest route node within 30 tiles (Manhattan) of the
    // player along the route; handles labeled edges (ladders/gates) by triggering
    // their handlers. Returns {x,y} or {x,y,label} needing special action.
    function nextRouteTarget(route, fx, fy) {
      var px = getX(), py = getY();
      // Find our index in the route: node nearest to the player
      var bestIdx = 0, bestD = Infinity;
      for (var i = 0; i < route.length; i++) {
        var d = Math.abs(route[i].x - px) + Math.abs(route[i].y - py);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      // If the very next node carries a label, we must trigger its handler first
      var nxt = route[bestIdx + 1];
      if (nxt && nxt.label) return nxt;
      // Walk toward the farthest node within 30 tiles
      var tgt = route[route.length - 1];
      for (var j = bestIdx + 1; j < route.length; j++) {
        var dd = Math.abs(route[j].x - px) + Math.abs(route[j].y - py);
        if (dd <= 30) tgt = route[j];
        else break;
      }
      return tgt;
    }
```

Then, in both 'walk' and 'return_walk' phases, right before sending a NEW walk, check
whether the target carries a label and if so run the special handler instead of walking:

In 'walk' phase (after computing `target`):
```js
            if (target.label) { handleSpecialEdge(target); return 4000; }
```
In 'return_walk' phase apply the SAME pattern: compute route via
routeTo(scriptState.minePos.x, scriptState.minePos.y), target = nextRouteTarget(...),
if (target.label) { handleSpecialEdge(target); return 4000; } else walkTo + bookkeeping.
Replace the existing mdx/mdy/rsx/rsy straight-line block in return_walk the same way.

### 4f. handleSpecialEdge — the special-edge dispatcher (add inside makeGatheringScript after nextRouteTarget)

```js
    // v206 special edges — ports of IdleRSC CustomLabelHandlers, adapted to our
    // verified primitives (atObject/atBoundary/talkToNpc/optionAnswer/drop-free).
    // Each returns after sending the action; the caller waits 4s and re-routes.
    var _specialAt = 0;
    function handleSpecialEdge(node) {
      if (Date.now() - _specialAt < 3000) return;   // debounce: one action per 3s
      _specialAt = Date.now();
      var x = node.x, y = node.y, px = getX(), py = getY();
      switch (node.label) {
        // ── Ladders (atObject on the ladder tile; id from SceneryLocs: 6/43/5) ──
        case 'miningGuildLadder':
          atObject(py < 1000 ? 274 : 274, py < 1000 ? 566 : 3398); break;
        case 'dwarvenMineFaladorEntrance':
          atObject(py < 1000 ? 251 : 251, py < 1000 ? 537 : 3369); break;
        case 'dwarvenMineCannonEntrance':
          atObject(py < 1000 ? 279 : 279, py < 1000 ? 494 : 3326); break;
        case 'edgeDungeonLadder':
          atObject(py < 1000 ? 215 : 215, py < 1000 ? 468 : 3300); break;
        case 'dwarfTunnel':
          atObject(px > 400 ? 385 : 426, py < 1000 ? 466 : 3294); break;  // west=Catherby side x>400: 385,466; east=Taverley: 426,3294
        // ── Doors / gates (atBoundary, direction 0; object on that tile) ──
        case 'miningGuildDoor':    atBoundary(268, 3381, 0); break;
        case 'edgeDungeonDoor':    atBoundary(218, 465, 0); break;
        case 'northFallyTavGate':  atBoundary(341, 487, 0); break;
        case 'southFallyTavGate':  atBoundary(343, 581, 0); break;
        case 'lummyNorthSheepGate':   atObject(152, 615); break;
        case 'lummyNorthWheatNorthGate': atObject(177, 595); break;
        case 'lummyNorthWheatSouthGate': atObject(172, 607); break;
        case 'lummyCabbageGate':   atObject(148, 596); break;
        case 'lummyEastCowGate':   atObject(105, 619); break;
        case 'lummyNorthCowGate':  atObject(154, 593); break;
        // ── Stepping stones (walk across by interacting) ──
        case 'taverleySteppingStones':
          atObject(px < 396 ? 395 : 397, 502); break;
        // ── Al-Kharid toll gate: talk to border guard, pay 10gp ──
        case 'alkharidGate': {
          var guardId = px >= 92 ? 161 : 162;   // approaching from Lumbridge side → 161
          var g = findNpcs([guardId], 8);
          if (g.length > 0) { talkToNpc(g[0].serverIndex); scriptState._gateDialog = Date.now(); }
          break;
        }
        default:
          log('Unknown special edge "' + node.label + '" — walking onto it directly');
          walkTo(x, y);
      }
      log('Special edge: ' + node.label);
    }
```

**alkharidGate dialog handling**: after talkToNpc, the dialog needs option answers.
Add to the 'walk'/'return_walk' phases, at the top of each tick (before phase dispatch),
a small state: if `scriptState._gateDialog` and Date.now() - _gateDialog > 2500 →
optionAnswer(2) (pay 10gp) every 2.5s until crossed (px<92 or px>=92 flipped), then clear.
Insert into the banking machine (before `var bp = scriptState._bankPhase;`):

```js
        // ── Al-Kharid gate dialog: pay toll (option 2) until crossed ──
        if (scriptState._gateDialog) {
          if (Date.now() - scriptState._gateDialog > 2500) {
            optionAnswer(2);   // "Pay 10gp"
            scriptState._gateDialog = Date.now();
          }
          if (Math.abs(CUR_X - 92) < 1 && Date.now() - scriptState._gateDialog > 12000) {
            scriptState._gateDialog = 0;  // crossed (or gave up) — resume routing
            invalidateRoute();
          }
          return 2000;
        }
```

### 4g. Respawn-aware depletion blacklist

In the depletion section (~line 1802-1824), the hardcoded 30000ms must scale with the rock's
respawn time. Replace `if (!depTime || (nowMs - depTime) > 30000) {` with:
```js
        var rockIdAt = t.id || 0;
        var respawnSec = RESPAWN_BY_ROCK[rockIdAt] || 30;
        var blacklistMs = (respawnSec + 5) * 1000;
        if (!depTime || (nowMs - depTime) > blacklistMs) {
```
and the blacklist write `scriptState.depletedRocks[scriptState.lastMinedRock] = Date.now();` stays,
but the log line 'blacklisted 30s' → 'blacklisted ' + respawnSec + 's', and the depCount loop's
`< 30000` → `< (RESPAWN_BY_ROCK[t.id] || 30 + 5) * 1000` — simpler: store expiry timestamp instead:
`scriptState.depletedRocks[scriptState.lastMinedRock] = Date.now() + blacklistMs;`
then filter: `if (!depTime || nowMs > depTime)`. Update both the filter and the depCount loop accordingly.

### 4h. MINE_AREA_CENTER guard (~line 1380/1466)

`if (!MINE_AREA_CENTER) { MINE_AREA_CENTER = ... }` — keep exactly, just with MINE_STAND (4a already covers).

## STEP 5 — App.tsx: pass mining config through

In src/App.tsx the engineConfig (lines ~313-328) only carries combat fields. Change the
construction to spread the raw cfg for non-combat scripts. Replace:
```ts
                const engineConfig = {
                  npcIds: npcIds,
                  ...
                };
```
with:
```ts
                const engineConfig = {
                  ...cfg,               // v206: pass ALL script config (mining camps/banks/rocks/power-mine)
                  npcIds: npcIds,
                  ...same rest...
                };
```
(cfg contains the mining fields rocks/campLocation/mineBankLocation/mineNoBank/customCoords/customX/customY.)

## STEP 6 — Versions (bump ALL THREE)

- public/game/r2h-bot-engine.js line 26: `var VERSION = 'v205';` → `var VERSION = 'v206';`
- public/game/index.html line 214: `r2h-bot-engine.js?v=v205` → `?v=v206`
- src/components/GameClient/GameCanvas.tsx line 16: `const CLIENT_VERSION = 'v275';` → `'v276'`

## CONSTRAINTS
- NEVER sed/awk on JS/TS — use your edit tools only.
- Do NOT touch any other files. Do NOT touch server code.
- Do NOT remove legacy vars COAL_WILDERNESS/MINE_STAND_TILE/BANK_ROUTE/MINE_ROUTE (other scripts reference them).
- Preserve every v205 invariant comment.
- The engine IIFE — the data block inserts inside the same function scope as the mining code.

## VERIFICATION (do these, in order)
1. `node --check public/game/r2h-bot-engine.js` — must pass.
2. `npx tsc --noEmit` (in r2h-frontend) — must pass (App.tsx change).
3. `npm run build` — must pass.
4. Print the diff summary (git diff --stat).

IMPORTANT: before editing, read the current mining branch (lines 820-860), the banking
machine (lines 1450-1740), and the depletion section (1795-1840) so your edits anchor
on the CURRENT text.
