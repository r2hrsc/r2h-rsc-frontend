# Fishing Script — Ground Truth (SEALED v300, 2026-08-26)

> **Status: SEALED.** All sites × all types × banking + power-fish **live-verified** on
> the CDP rig (testuser) across 2026-08-24 → 08-26. Do not modify `walkTo2` or the
> fishing phases without re-running the site matrix. Committed at git tag `fishing-sealed-v300`.
> Deploy: https://r2hrsc.xyz (wrangler, `?v=v300`).

## Verified matrix (user-confirmed + rig-verified)

| Site | Types verified | Bank | Notes |
|---|---|---|---|
| Catherby Coast | Lobster; Big Net (junk-drop); Tuna & Swordfish; Shark (lvl 76); multi-select (Lobster+Big Net) | Catherby (440,494) | Full cycles incl. long shore walks |
| Draynor Shore | Sardine & Herring; Shrimp & Anchovies (net) | Draynor (220,635) | First site verified |
| Edgeville Shore | Trout & Salmon; Pike | Edgeville (216,451) | The trap fix — see below |
| Lumbridge River | Sardine & Herring; Trout & Salmon | Draynor (220,635) | 94-tile walk, 2 region-chunks per leg |
| Al-Kharid Shore | Shrimp & Anchovies | Al-Kharid (89,694) | Shortest walk |
| Modes | power-fish (drop-at-full), APOS presets (CatherbyLobs, ColeslawGuildFisher, K_FastBarbFisher, CasketFisher) | — | Presets map site+type+kit auto |

(User's "everything's working" confirms the full matrix on 2026-08-26.)

## FISH_SITES registry (engine line ~147)
```
Catherby  stand 417,501  spots 193@(418,500)(414,502)(409,504) 261@(406,505)(402,507)(399,503)(398,505)
Draynor   stand 222,661  spots 193@(224,659)(224,661)(221,664)
Lumbridge stand 126,630  spots 192@(125,629)(125,631)
Edgeville stand 211,502  spots 192@(208,501)(212,507)   ← stand 210,504 was RIVER — never use
Al-Kharid stand 87,718   spots 193@(89,718)(85,719)
```

## Kit ids: pot 375 · net 376 · rod 377 · fly rod 378 · harpoon 379 · bait 380 · feathers 381 · big net 548
Raw ids: trout 358, salmon 356, lobs 372, etc. `FISH_JUNK_IDS` = boots/gloves/seaweed/oyster (Big Net).
Bait is CONSUMED (Pike/Sardine); feathers are NOT consumed. Sardine/Herring & Pike = cmd2; Lobster/Tuna/Shark/Big Net = cmd1.

## Walk architecture — walkTo2 (v300, engine ~line 4329, fishing-only blast radius)
Measured facts on the rig:
- `Dg`/`__r2h_walk` = client walk action: `Dg(mc, startX, startZ, destX, destZ, walkToEntity)` in **LOCAL** coords; no return value — **"Dg returned: undefined" is NORMAL, not failure**.
- Client A* (`QB` inside `Ee`) only paths **within the loaded 96×96 region** (dest local coords clamped 1–94). Out-of-region → silent refusal, no packet.
- One packet carries ≤25 path steps. Re-issuing `walkTo` every ~1.5 s tick chains segments — the APOS minimap pattern.
- Raw hand-built opcode-194 packets **do NOT work** (malformed — real `Ee` writes path-delta bytes after the coords). Never resurrect them.
- Water/unreachable destinations are silently refused. **Stand tiles must be land** (Edgeville trap root cause).
- After `::tele`, the client region base (`du`/`dd`) goes STALE — full walks refuse and coordinates misread. **Always cold `location.reload()` + re-login after ::tele.**
- The 3 walk call sites are in the fishing script only (toSpot/toBank/returnSpot); sealed scripts (WC `walkToward` line ~3778, core `walkTo` line ~490) are untouched.

walkTo2 decision order (v300):
1. Dest out-of-region → **interpolated in-region waypoint** ~60 tiles along the player→dest line (clamp 4–94), re-issue per tick as the region recenters. Interpolate — never step ±60 per axis (v299 bug: west detour).
2. Else full-route `walkTo(dest)` — pathfinder routes around walls/buildings/doors.
3. Position frozen >5 s → hop mode: adaptive stride 6–8, halve on obstacle, wall-slide at stride 1. Hop mode persists for the walk (re-probe full every 30 s).
4. 6 hop fails → **dest-neighbor escape** (walk to a neighbor of the dest) — prevents water/blocked-dest oscillation ("rapid unlogical clicking" in the Edgeville coffin-house).

## Phases & mechanics (fishing script, engine ~4400–4700)
- Phases: init → toSpot → fish → toBank → bankTalk → bankOption → deposit → bankClose → returnSpot → (loop)
- `cheb≤1` to spot for OpLoc click; live spot scan first (object array can be stale — anchor rotation fallback with "Anchor dry" rotation log)
- Adjacent-land discovery: 8 candidate neighbors nearest-first; 2-stall = dead tile; cache winners per anchor; ≥4 fails escalate to next anchor (v285–287)
- Bank: miner-proven talk→option→deposit machine; `bankClose` phase re-sends close until flag clears (v291 — a silently-open bank drops ALL walk packets)
- Bait run-out → type auto-disabled; all out → stop
- Fatigue: sleep handling as in sealed scripts
- Junk drop (Big Net) sweeps before banking; power-mode drops at full inv
- Banking triggers at inv ≥30 after junk sweep; deposit via `depositAllExcept` (never deposit tools/bait/sleeping bag)
- TeaVM numeric fields are STRINGS — always `Number()` first (e.g. `(mc.bK||0)+(mc.dd||0)` concatenates)
- NPC bankers: `findNpcs(WC_BANKER_IDS, 3)` → talkToNpc → optionAnswer
- Catherby pinch (432,499) west-blocked — inland route y=496–498 always open; chunked walking handles it without special-casing
- Server log: `Bankers.onTalkNpc`, `Fishing.onOpLoc` confirmations; drop cadence 1 action / 640 ms tick

## ScriptPanel UI (fishing config)
Config keys: `fishType` (single), `fishTypes` (multi-select map), `fishSite`, `fishBank` (bool), `fishDropJunk` (bool). APOS script ids route via `FISHING_SCRIPT_IDS` + `FISHING_APOS_PRESETS` (see engine ~line 159). `CatherbyFishFarm` is NOT a fishing script — routes to cooking, untouched.

## Test rig (rebuild recipe)
Headless Chrome `--headless=new --remote-debugging-port=9223 --user-data-dir=/tmp/r2h-chrome-profile`, driver `/tmp/cdp2.py` (open|status|start|watch|stop|cmd|probe). Position = `Number(mc.bJ)+Number(mc.du)` , `Number(mc.bK)+Number(mc.dd)`; inv count = `mc.cU`. testuser/test123456 (admin: `::tele x y`, `::item id [n]`, `::setstat`). Server logs: `ssh root@67.205.132.6` → `/opt/openrsc/server/logs/fuzzynuts_1.log` (gz history — zcat). Defs: `conf/server/defs/GameObjectDef.xml` (**ids are POSITIONAL** — Nth `<GameObjectDef>` block), `locs/SceneryLocs.json` (`{sceneries:[{id,pos:{X,Y}}]}`).

## Remaining skills (next up, in order)
Cooking → Firemaking → (Mining is sealed @v259; WC @v274; Fishing @v300) — full list in the APOS porting plan (skill `r2h-bot-porting`).
