/**
 * R2H Bot Engine v71 — APOS-compatible API + AIOFighter Port
 *
 * ARCHITECTURE:
 * - ALL game actions go through I9(mc, menuIdx) — the game's own method_131
 * - Data reading uses verified obfuscated TeaVM fields on the mc object
 * - Walk uses W/Z/Y (proven working)
 * - Anti-idle sends real walk packets
 * - Combat script: full AIOFighter.java port (Dvorak/Seatta)
 * - v68: Ground item pickup fixed (opcode 252 directly, not I9 400)
 * - v68: Loot uses findGroundItems() accurate coords (not NPC death estimate)
 * - v68: Skilling scripts walk-to-location on startup (APOS PathWalkTo parity)
 *
 * GROUND ITEM COORDINATE SYSTEM (definitively traced v68):
 *   Server sends byte offset from player: offsetX = itemWorldX - playerWorldX
 *   Client reconstructs local coord: cx = playerLocalX + offsetByte
 *   World coord = cx + regionBaseX (du)
 *   findGroundItems() correctly returns: cx + du = exact world tile
 *   pickupItem sends WORLD coords to server via opcode 252
 */
(function() {
  'use strict';
  if (window.__r2h_bot_engine) return;
  window.__r2h_bot_engine = true;

  var VERSION = 'v313';
  var LOG_PREFIX = '[R2H ' + VERSION + ']';

  // ═══════════════════════════════════════════════════════════════
  // VERIFIED FIELD MAP (TeaVM obfuscated → Java name)
  // ═══════════════════════════════════════════════════════════════
  // Confirmed via classes.js opcode analysis (v33):
  //   hy = playerStatCurrent (current level, can be boosted/degraded by damage/potions)
  //   fw = playerStatBase (permanent level, e.g. 99 HP base)
  //   kN = playerStatXp (XP values, 4 bytes each)
  //   cU = actual inventory count (items present, NOT max capacity)
  //   l_ = 30 (constant: max inventory slots — NOT the count!)
  // dY/dZ were WRONG — they're length 5000 arrays (not 18-element stat arrays)
  var F = {
    regionX: 'du', regionY: 'dd', magicLoc: 'L',
    npcsRender: 'b0',
    invItemId: 'b4', invAmount: 'e2', invNoted: 'iC', invCount: 'cU',
    statCurrent: 'hy', statBase: 'fw', statXp: 'kN',
    // v80 FIX: cx/cw/cn/b9 were SCENERY data, NOT ground items!
    // Real ground item arrays (verified by dropping items and watching which arrays change):
    groundItemX: 'dY', groundItemY: 'dZ', groundItemId: 'eA', groundItemCount: null, // count = non-zero entries in eA
    gameObjectX: 'dp', gameObjectY: 'dn', gameObjectId: 'fl', gameObjectCount: 'co',
    // v71 fields (confirmed from classes.js reverse engineering):
    statFatigue: 'sq',      // LIVE fatigue (0-750, updated by opcode 202). 'sp' is only a snapshot on sleep start.
    isSleeping: 'i6',       // sleep screen flag (1=sleeping)
    fatigueSleeping: 'lf',  // fatigue string during sleep
    combatStyle: 'm7',      // v95: m7 = combat style (c8 was WRONG = messageTabSelected!)
    showDialogBank: 'lD',   // bank interface open flag
    showDialogShop: 'lv',   // shop interface open flag
    // v77: local player object and walking state
    localPlayer: 'O',       // mc.O = local player ORSCharacter
  };

  // NPC IDs — comprehensive from server NpcDefs.json
  var NPC = {
    CHICKEN: 3, COW: 6, GOBLIN_7: 62, GOBLIN_13: 4, GUARD: 65,
    GIANT: 61, GIANT_RAT: 19, GIANT_SPIDER: 23,
    // v81: common training NPCs missing from original table
    RAT: 29, SPIDER: 34, SHEEP: 2, BEAR: 8,
    SKELETON_21: 40, ZOMBIE_24: 41, GOBLIN_13_ALT: 153,
    MAN: 11, MUGGER: 21, TRAMP: 28, MONK: 93, IMP: 114,
    GIANT_SPIDER_31: 74, RAT_13: 47, RAT_8: 177,
  };

  // Item IDs
  var BONES = [20, 413, 604, 814];
  var SLEEPING_BAG = 1263;
  var LOOT_ITEMS = [20, 413, 604, 814, 38, 132, 526, 11, 41, 42, 714];

  // Woodcutting constants (pilot)
  var NORMAL_TREE_IDS = [0, 1];
  var STUMP_IDS = [4, 314];
  var AXE_IDS = [1480, 405, 204, 203, 428, 88, 12, 87];
  var LOG_ID = 14;

  // v265: FULL woodcutting registry — server-verified 2026-08-23:
  //   tree ids/log ids/req levels/fell%/respawn: ObjectWoodcutting.xml + Formulae.java
  //   grove tiles: SceneryLocs.json extraction; stands verified clear of scenery+boundaries.
  // Normals fell 100% per log (blacklist on gain); oak–magic are multi-log
  // (blacklist on miss-streak — a live tree at these rates can't miss N in a row).
  var WC_LOG_IDS = [14, 632, 633, 634, 635, 636];
  var WC_TREE_TYPES = {
    Normal: { ids: [0, 1], logId: 14, level: 1, xp: 100, fellOnGain: true, respawnMs: 45000, missLimit: 3, dryLimit: 1,
      groves: [
        { name: 'Lumbridge', stand: [118, 636], tiles: [[114,631],[122,632],[120,633],[114,634],[115,635],[118,635],[122,636],[118,637],[114,638],[117,639],[114,640],[119,640]] },
        { name: 'Seers', stand: [509, 440], tiles: [[489,425],[501,443],[516,454],[506,461],[510,485],[517,486],[526,492],[515,494],[521,497],[511,498],[503,499],[487,436],[492,442],[508,455],[489,458],[511,464],[486,468],[484,471],[492,475],[483,496],[491,496]] }
      ] },
    Oak: { ids: [306], logId: 632, level: 15, xp: 150, fellOnGain: false, respawnMs: 22000, missLimit: 6, dryLimit: 2,
      groves: [
        { name: 'Seers West', stand: [508, 446], tiles: [[508,444],[515,445],[491,447],[511,447],[488,448],[486,458],[509,460],[512,460],[486,484],[502,487],[522,509],[504,514],[523,515],[518,556],[503,558],[512,558],[508,560],[495,569],[512,582]] }
      ] },
    Willow: { ids: [307], logId: 633, level: 30, xp: 250, fellOnGain: false, respawnMs: 40000, missLimit: 6, dryLimit: 3,
      groves: [
        { name: 'Seers North', stand: [509, 440], tiles: [[500,437],[513,438],[509,439],[512,441]] }
      ] },
    Maple: { ids: [308], logId: 634, level: 45, xp: 400, fellOnGain: false, respawnMs: 75000, missLimit: 6, dryLimit: 4,
      groves: [
        { name: 'Seers', stand: [507, 455], tiles: [[506,449],[523,459],[499,461],[513,466],[520,487],[538,488],[544,536],[536,543]] }
      ] },
    Yew: { ids: [309], logId: 635, level: 60, xp: 700, fellOnGain: false, respawnMs: 125000, missLimit: 6, dryLimit: 5,
      groves: [
        { name: 'Seers', stand: [517, 474], tiles: [[519,471],[515,476],[519,476]] }
      ] },
    Magic: { ids: [310], logId: 636, level: 75, xp: 1000, fellOnGain: false, respawnMs: 245000, missLimit: 8, dryLimit: 6,
      groves: [
        { name: 'Seers', stand: [521, 491], tiles: [[524,489],[521,492],[519,494]] }
      ] }
  };
  var WC_BANKER_IDS = [95, 224, 268, 485, 540, 617];

  // ═══ v275: FISHING — server-verified registry (Aug 24, 2026) ═══
  // Sources: Fishing.java (515 lines, full read), ObjectFishing.xml,
  // GameObjectDef command lists, SceneryLocs.json, Skills.java, APOS
  // (CatherbyLobs / ColeslawGuildFisher / K_FastBarbFisher).
  // Server facts:
  //   - fishing_spots_depletable: FALSE on FuzzyNuts → spots NEVER deplete;
  //     camp-and-click like APOS (no rotation/blacklist machinery needed).
  //   - withinRange(object, 1) → must stand adjacent; walkTo(spot) lands the
  //     pathfinder's nearest reachable tile (never water).
  //   - batch_progression: false → one explicit click per catch attempt (~2.2s).
  //   - Tool check is INVENTORY-ONLY (countId) — equipped does NOT count.
  //   - Bait consumed per successful catch (bait 380 / feathers 381).
  //   - Click index varies per spot (TRAP): cmd1=atObject, cmd2=atObject2.
  //     e.g. spot 194: Harpoon=cmd1, Cage=cmd2 (CatherbyLobs: atObject2(409,504)).
  //   - FISHING = stat index 10 (Skills.java). Big net junk: 16,17,622,793.
  var FISH_TYPES = {
    'Shrimp & Anchovies': { spotId: 193, cmd: 1, tool: 376, bait: -1, level: 1,  fish: [349, 351] },
    'Sardine & Herring':  { spotId: 193, cmd: 2, tool: 377, bait: 380, level: 5,  fish: [361, 354] },
    'Trout & Salmon':     { spotId: 192, cmd: 1, tool: 378, bait: 381, level: 20, fish: [356, 358] },
    'Pike':               { spotId: 192, cmd: 2, tool: 377, bait: 380, level: 25, fish: [363] },
    'Lobster':            { spotId: 194, cmd: 2, tool: 375, bait: -1, level: 40, fish: [372] },
    'Tuna & Swordfish':   { spotId: 194, cmd: 1, tool: 379, bait: -1, level: 35, fish: [366, 369] },
    'Big Net':            { spotId: 261, cmd: 1, tool: 548, bait: -1, level: 16, fish: [552, 550, 554, 549, 17, 16, 622, 793] },
    'Shark':              { spotId: 261, cmd: 2, tool: 379, bait: -1, level: 76, fish: [545] }
  };
  // Never deposit/drop: tools, baits, sleeping bag
  var FISH_KEEP_IDS = [375, 376, 377, 378, 379, 380, 381, 548, 1263];
  var FISH_JUNK_IDS = [16, 17, 622, 793];   // gloves, boots, seaweed, oyster (APOS dropJunk)
  // Sites = spot clusters near banks (SceneryLocs extraction). 'Catherby Coast'
  // spans the docks AND the guild-shore platform west of the Fishing Guild —
  // spots never deplete, so each type just camps its matching spot.
  var FISH_SITES = {
    'Catherby Coast': { stand: [417, 501], bank: 'Catherby',
      spots: [ [193,418,500], [193,414,502], [194,409,504], [261,406,505], [261,402,507], [261,399,503], [261,398,505] ] },
    'Draynor Shore':  { stand: [222, 661], bank: 'Draynor',
      spots: [ [193,224,659], [193,224,661], [193,221,664] ] },
    'Lumbridge River': { stand: [126, 630], bank: 'Draynor',
      spots: [ [192,125,629], [192,125,631] ] },
    'Edgeville Shore': { stand: [211, 502], bank: 'Edgeville',
      spots: [ [192,208,501], [192,212,507] ] },
    'Al-Kharid Shore': { stand: [87, 718], bank: 'Al-Kharid',
      spots: [ [193,89,718], [193,85,719] ] }
  };
  // APOS script ids → fishing engine. CatherbyFishFarm is INTENTIONALLY not
  // here — it is a fish+COOK script routed in COOKING_IDS (ScriptPanel) and
  // stays untouched.
  var FISHING_SCRIPT_IDS = ['AIOFisher', 'CatherbyLobs', 'ColeslawGuildFisher', 'K_FastBarbFisher', 'CasketFisher'];
  var FISHING_APOS_PRESETS = {
    'CatherbyLobs': 'Lobster',
    'ColeslawGuildFisher': 'Big Net',
    'K_FastBarbFisher': 'Trout & Salmon',
    'CasketFisher': 'Big Net'
  };
  function isFishingScript(id) {
    return FISHING_SCRIPT_IDS.indexOf(id) >= 0;
  }

  // ═══ v301: COOKING — server-verified (ItemCookingDef.xml, ObjectCooking.java) ═══
  // batch_progression=FALSE → one item per opcode-241 click (~1.9s); burn = burntId in
  // inventory; COOKING = stat 7. Gauntlets 700, sleeping bag 1263.
  var COOK_FOODS = {
    'Chicken':     { raw: 133, cooked: 132, burnt: 134, level: 1 },
    'Shrimp':      { raw: 349, cooked: 350, burnt: 353, level: 1 },
    'Anchovies':   { raw: 351, cooked: 352, burnt: 353, level: 1 },
    'Sardine':     { raw: 354, cooked: 355, burnt: 360, level: 1 },
    'Herring':     { raw: 361, cooked: 362, burnt: 365, level: 5 },
    'Mackerel':    { raw: 552, cooked: 553, burnt: 365, level: 10 },
    'Trout':       { raw: 358, cooked: 359, burnt: 360, level: 15 },
    'Cod':         { raw: 550, cooked: 551, burnt: 365, level: 18 },
    'Pike':        { raw: 363, cooked: 364, burnt: 365, level: 20 },
    'Salmon':      { raw: 356, cooked: 357, burnt: 360, level: 25 },
    'Tuna':        { raw: 366, cooked: 367, burnt: 368, level: 30 },
    'Bass':        { raw: 554, cooked: 555, burnt: 368, level: 43 },
    'Lobster':     { raw: 372, cooked: 373, burnt: 374, level: 40 },
    'Swordfish':   { raw: 369, cooked: 370, burnt: 371, level: 45 },
    'Shark':       { raw: 545, cooked: 546, burnt: 547, level: 80 },
    'Sea Turtle':  { raw: 1192, cooked: 1193, burnt: 1248, level: 82 },
    'Manta Ray':   { raw: 1190, cooked: 1191, burnt: 1247, level: 91 }
  };
  var COOK_SITES = {
    // range coords = server SceneryLocs.json (GameObjectDef 11 "Range") — ground truth.
    // bank = BANK_REGISTRY key. NO hand-coded door tiles: v303 discovers doors
    // dynamically from the client object arrays (dp/dn/fl/ee — live-verified at
    // Al-Kharid: boundary id 1 @ (85,683) dir 1 appears with its direction).
    // Static door hint (optional) accelerates the first click.
    'Catherby':    { range: [432, 480], inside: [433, 481], bank: 'Catherby',    doorHint: { x: 435, y: 486, dir: 0 } },
    // v303: ALL non-Catherby sites use rig-verified OUTDOOR/accessible ranges —
    // tele+241 probe verified per tile (2026-08-27). No door machinery needed.
    // Al-Kharid (87,685) is an enclosed furnace-house → use outdoor (73,669).
    'Al-Kharid':   { range: [73, 669],  inside: [73, 670],  bank: 'Al-Kharid', via: [82, 671] },  // via = EAST graph node; west nodes route into the furnace-house wall
    'Varrock East':{ range: [110, 534], inside: [110, 535], bank: 'Varrock East' },
    'Falador West':{ range: [275, 638], inside: [275, 639], bank: 'Falador West' },
    'Yanille':     { range: [629, 749], inside: [630, 749], bank: 'Yanille' },
    'Seers':       { range: [524, 448], inside: [524, 449], bank: 'Seers' },   // v305: FIREPLACE 274 (cooks all standard foods — verified), 24 tiles from bank
    'Ardougne':    { range: [607, 579], inside: [607, 580], bank: 'Ardougne North' },  // v305: FIREPLACE (verified) — bank range (581,578) is behind LOCKED door 94
    'Draynor':     { range: [275, 638], inside: [275, 639], bank: 'Draynor' }
  };
  // Boundary ids that are openable doors (DoorDef name "door" — DoorAction blocklist)
  var CK_DOOR_IDS = [1, 2, 57, 60, 64, 94];
  var COOKING_SCRIPT_IDS = ['AIOCooker', 'CatherbyFishFarm', 'ChickenMunch0r', 'cooking', 'cook-meat', 'cook-fish'];
  // ChickenMunch0r: legacy APOS script ID, now routed to v301 cooking engine
  function isCookingScript(id) {
    return COOKING_SCRIPT_IDS.indexOf(id) >= 0;
  }
  // Cooked/edible food only (raw food can't be eaten). From server ItemDefs.json command=Eat/Drink.
  // Excludes potions (heal 0), raw/burnt items, and non-healing drinks.
  var FOOD = [18,132,138,142,179,193,210,228,249,257,258,259,261,262,263,267,268,269,
    319,320,325,326,327,328,329,330,332,333,334,335,336,337,346,350,352,355,357,359,
    362,364,367,370,373,422,546,551,553,555,590,598,677,709,718,735,737,739,749,750,
    751,765,770,801,829,830,855,856,857,858,859,860,861,862,863,864,865,866,871,873,
    877,878,879,885,896,897,900,901,902,903,904,905,906,907,908,909,910,911,912,913,
    914,923,924,936,1061,1086,1102,1103,1191,1193,1245,1269];

  // Wearable weapon IDs — used for inventory weapon scanning and melee switch.
  // Extracted from server ItemDefs.json: isWearable=1, wearSlot=3|4, has combat stats
  // or is a bow/staff/crossbow. 148 weapons total.
  var WEAPON_IDS = [0,1,12,28,59,60,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,
    78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,100,101,102,103,
    188,189,197,198,203,204,205,265,307,396,397,398,405,423,424,425,426,427,428,429,
    430,509,559,560,561,562,563,564,565,593,594,614,615,616,617,618,648,649,650,651,
    652,653,654,655,656,657,682,683,684,685,725,754,827,1000,1013,1014,1015,1024,1031,
    1068,1069,1070,1075,1076,1077,1078,1079,1080,1081,1088,1089,1090,1091,1092,1122,
    1123,1124,1125,1126,1127,1128,1129,1130,1131,1132,1133,1134,1135,1136,1137,1138,
    1139,1140,1205,1216,1217,1218,1230,1236];

  // Combat spell name → server spell ID (from SpellDef.xml on VPS)
  var COMBAT_SPELLS = {
    'Wind Strike': 0, 'Water Strike': 2, 'Earth Strike': 4, 'Fire Strike': 6,
    'Wind Bolt': 8, 'Water Bolt': 11, 'Earth Bolt': 14, 'Fire Bolt': 17,
    'Crumble Undead': 19, 'Wind Blast': 20, 'Water Blast': 23,
    'Earth Blast': 27, 'Fire Blast': 32, 'Iban Blast': 25,
    'Stun': 46, 'Confuse': 1, 'Weaken': 5, 'Curse': 9,
    'Vulnerability': 41, 'Enfeeble': 44,
  };

  // ═══════════════════════════════════════════════════════════════
  // CORE UTILITIES
  // ═══════════════════════════════════════════════════════════════

  function getMC() { return window.__r2h_mc; }

  function isLoggedIn() {
    // Primary check: the game's main controller object must exist.
    var mc = window.__r2h_mc;
    if (!mc) return false;
    // mc.b0 = NPCs render array — only populated when logged into the world
    if (mc.b0 && mc.b0.data && mc.b0.data.length > 0) return true;
    // Fallback: region coords non-zero means we're in-game
    var rx = mc[F.regionX] || 0;
    var ry = mc[F.regionY] || 0;
    return rx !== 0 || ry !== 0;
  }

  // ─── Action-wait system ───
  // THE FUNDAMENTAL FIX for the tick-vs-blocking mismatch.
  //
  // The RSC server uses an action model: each new packet cancels the previous
  // action via player.resetAll(). Our bot was sending a new action every tick
  // (618-1000ms), which cancelled server-side WalkToActions before they completed.
  //
  // This function detects whether the player is still walking (from a server-side
  // WalkToAction) by checking the local player's waypoint index (mc.O.eu).
  // When eu > 0, the player has pending waypoints and is moving.
  // When eu == 0, the player has arrived and the server action has completed.
  //
  // Scripts MUST call this before sending a new action. If walking, they should
  // return a short delay and wait.
  function isPlayerWalking() {
    var mc = getMC();
    if (!mc) return false;
    var lp = mc[F.localPlayer];
    if (!lp) return false;
    // v228: eu>0 does NOT drain back to 0 after arrival in this TeaVM build — it is
    // a ring-buffer waypoint index that keeps its last value when the walk ends on
    // a blocked/unreachable final tile. Live-captured 3× (2026-08-21): player parked
    // at door (218,464) with eu=3 for 30+s; ladder edge (216,468) the same; shafster
    // frozen at ladder base (215,3299) for a whole session, zero packets — the
    // special-edge handler logged "waiting for walk to finish" every second while
    // the atObject/atBoundary click below it was unreachable code.
    // Walking = eu>0 AND position actually changing. Stationary for 3.5s (≈5 game
    // ticks) with eu>0 = stale index → treat as arrived so action retries may fire.
    var now = Date.now();
    var wpx = getX(), wpy = getY();
    if (wpx !== _walkLastPos.x || wpy !== _walkLastPos.y) {
      _walkLastPos.x = wpx; _walkLastPos.y = wpy; _walkLastPos.t = now;
    }
    if ((lp.eu || 0) > 0 && (now - _walkLastPos.t) > 3500) {
      return false;   // stale eu — player is stationary, walk is dead
    }
    // eu = waypointIndexCurrent. > 0 means the player has pending waypoints.
    return (lp.eu || 0) > 0;
  }

  // position tracker for the stale-eu check above (v228)
  var _walkLastPos = { x: -9999, y: -9999, t: Date.now() };

  // Helper: wait for walking to complete (call in tick — returns true when done)
  function waitForWalk() {
    if (isPlayerWalking()) return false;  // Still walking
    return true;  // Arrived
  }

  function log(msg) { console.log(LOG_PREFIX + ' ' + msg); }

  // ═══════════════════════════════════════════════════════════════
  // I9 ACTION HANDLER — Universal game action dispatcher
  // ═══════════════════════════════════════════════════════════════
  //
  // I9 reads these menu arrays from mc:
  //   c0[menuIdx] = X coordinate (pixels for NPCs, local tiles for objects/ground items)
  //   c1[menuIdx] = Y coordinate (same units as c0)
  //   bQ[menuIdx] = serverIndex (NPCs/players) OR inventory slot (item actions)
  //   eX[menuIdx] = secondary value (usually -1, or field_204)
  //   oM[menuIdx] = itemId (for ground item pickup) or direction
  //   bn[menuIdx] = action code
  //
  // Action code reference:
  //   200  = Object command 1 (mine, chop, fish)
  //   210  = Object command 2 (prospect)
  //   400  = Ground item pickup (oM = itemId, c0/c1 = local tile coords)
  //   600  = NPC talk to (bQ = serverIndex)
  //   610  = NPC pickpocket (bQ = serverIndex)
  //   640  = Drop item (bQ = inventory slot)
  //   715  = NPC attack (bQ = serverIndex, c0/c1 = pixel coords)
  //   920  = Wield/equip item (bQ = inventory slot)
  //   1000 = Item command: eat/bury/use (bQ = inventory slot)

  function doAction(actionCode, opts) {
    var mc = getMC();
    if (!mc) { log('No mc'); return false; }

    var I9 = window.__r2h_I9;
    if (!I9) { log('ERROR: I9 not exposed'); return false; }

    var menuIdx = 0;
    mc.c0.data[menuIdx] = opts.coordX || 0;
    mc.c1.data[menuIdx] = opts.coordY || 0;
    mc.bQ.data[menuIdx] = opts.bQ !== undefined ? opts.bQ : 0;
    mc.eX.data[menuIdx] = opts.eX !== undefined ? opts.eX : -1;
    mc.oM.data[menuIdx] = opts.oM !== undefined ? opts.oM : (opts.itemId !== undefined ? opts.itemId : 0);
    mc.bn.data[menuIdx] = actionCode;

    log('doAction(' + actionCode + ') c0=' + mc.c0.data[0] + ' c1=' + mc.c1.data[0] +
        ' bQ=' + mc.bQ.data[0] + ' eX=' + mc.eX.data[0] + ' oM=' + mc.oM.data[0] +
        ' bn=' + mc.bn.data[0]);

    try {
      I9(mc, menuIdx);
      log('doAction(' + actionCode + ') I9 returned OK');
    } catch(e) {
      log('I9 ERROR (action ' + actionCode + '): ' + e.message);
      return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // ACTION METHODS
  // ═══════════════════════════════════════════════════════════════

  // ─── NPC actions ───
  // Payload177: opcode 244 = NPC_ATTACK. Server reads: putShort(serverIndex).
  // The server's AttackHandler looks up the NPC by serverIndex, creates a
  // WalkToMobAction that walks the player to melee/range distance, then
  // fires AttackNpcTrigger. No pixel coords needed — server handles pathfinding.

  function attackNpc(serverIndex) {
    return sendRaw(244, 754, function(stream, Z) {
      Z(stream, serverIndex);
    });
  }

  function talkToNpc(serverIndex) {
    // Payload177: opcode 245 = NPC_TALK_TO, Z(serverIndex)
    return sendRaw(245, 0, function(stream, Z, BO) { Z(stream, serverIndex); });
  }

  function thieveNpc(serverIndex) {
    // Payload177: opcode 195 = NPC_COMMAND (pickpocket), Z(serverIndex)
    return sendRaw(195, 0, function(stream, Z, BO) { Z(stream, serverIndex); });
  }

  // v265: WC routing graph — prune labeled edges EXCEPT the two Taverley gates,
  // the graph's only Asgarnia↔Kandarin links (cut-vertex simulation verified).
  // Routing leads the player TO the gate; the WC gate handler crosses it.
  var _webAdjNoGates = null;
  var WC_KEEP_LABELS = { northFallyTavGate: true, southFallyTavGate: true };
  function webwalkGraphNoGates() {
    if (_webAdjNoGates) return _webAdjNoGates;
    var g = webwalkGraph(false);
    var adj = {};
    for (var k in g) adj[k] = { x: g[k].x, y: g[k].y, out: [] };
    for (var k2 in g) {
      var n = g[k2];
      for (var i = 0; i < n.out.length; i++) {
        var e = n.out[i];
        if (e.label && !WC_KEEP_LABELS[e.label]) continue;
        adj[k2].out.push({ node: adj[e.node.x + ',' + e.node.y], label: e.label || null });
      }
    }
    _webAdjNoGates = adj;
    return adj;
  }
  function webwalkSnapNoGates(x, y) {
    var g = webwalkGraphNoGates(), best = null, bd = Infinity;
    for (var k in g) {
      var n = g[k];
      var d = Math.abs(n.x - x) + Math.abs(n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function webwalkDijkstraNoGates(fx, fy) {
    var g = webwalkGraphNoGates();
    var src = webwalkSnapNoGates(fx, fy);
    var dist = {}, prev = {}, pq = [[0, src.x + ',' + src.y]];
    dist[src.x + ',' + src.y] = 0;
    while (pq.length > 0) {
      pq.sort(function(a, b) { return a[0] - b[0]; });
      var top = pq.shift();
      var du = top[0], uk = top[1];
      if (du > (dist[uk] !== undefined ? dist[uk] : Infinity)) continue;
      var u = g[uk];
      if (!u) continue;
      for (var i = 0; i < u.out.length; i++) {
        var v = u.out[i].node;
        var vk = v.x + ',' + v.y;
        var nd = du + Math.max(Math.abs(v.x - u.x) + Math.abs(v.y - u.y), 1);
        if (nd < (dist[vk] !== undefined ? dist[vk] : Infinity)) {
          dist[vk] = nd; prev[vk] = uk; pq.push([nd, vk]);
        }
      }
    }
    return { dist: dist, prev: prev };
  }
  function webwalkRouteNoGates(fx, fy, tx, ty) {
    var g = webwalkGraphNoGates();
    var dst = webwalkSnapNoGates(tx, ty);
    var r = webwalkDijkstraNoGates(fx, fy);
    var dk = dst.x + ',' + dst.y;
    if (r.dist[dk] === undefined) return null;
    var chain = [];
    var cur = dk;
    while (cur) {
      var node = g[cur];
      chain.push({ x: node.x, y: node.y });
      var pk = r.prev[cur];
      if (!pk) break;
      cur = pk;
    }
    chain.reverse();
    return chain;
  }

  // ─── Object actions ───
  // Payload177: opcode 242 = OBJECT_COMMAND (mine/chop), Z(x) Z(y)
  // Payload177: opcode 230 = OBJECT_COMMAND2 (prospect/etc), Z(x) Z(y)

  function atObject(worldX, worldY) {
    return sendRaw(242, 863, function(stream, Z) {
      Z(stream, worldX); Z(stream, worldY);
    });
  }

  function atObject2(worldX, worldY) {
    return sendRaw(230, 0, function(stream, Z, BO) {
      Z(stream, worldX); Z(stream, worldY);
    });
  }

  // ─── Boundary interaction (doors, gates, walls) ───
  // Payload177: opcode 238 = INTERACT_WITH_BOUNDARY
  // Format: putShort(x), putShort(y), putByte(direction)
  function atBoundary(worldX, worldY, direction) {
    return sendRaw(238, 212, function(stream, Z, BO) {
      Z(stream, worldX);
      Z(stream, worldY);
      BO(stream, direction || 0);
    });
  }

  // ─── Ground item pickup ───
  // DEFINITIVE FIX (v68): Use sendRaw(252, 634) matching APOS Controller.pickupItem exactly.
  // Server Payload177Parser: opcode 252 → GROUND_ITEM_TAKE.
  // The handler sends WORLD coordinates (not local), matching the APOS Java:
  //   newPacket(247); putShort(x); putShort(y); putShort(itemId);  [APOS opcode numbering]
  // In Payload177: opcode 252, type 634. putShort(worldX), putShort(worldY), putShort(itemId).
  // The server's GroundItemTake handler creates a WalkToPointAction to walk the player
  // to the item, then fires onTakeObj on arrival.

  function pickupItem(worldX, worldY, itemId) {
    // Send opcode 252 (GROUND_ITEM_TAKE in Payload177) with world coords + item ID
    return sendRaw(252, 634, function(stream, Z) {
      Z(stream, worldX);
      Z(stream, worldY);
      Z(stream, itemId);
    });
  }

  // ─── Item actions ───
  // Payload177 correct opcodes (NOT the I9 opcodes which are wrong for P177):

  function useItem(slot) {
    // Opcode 246 = ITEM_COMMAND (eat/bury/sleep). Z(slot)
    return sendRaw(246, 0, function(stream, Z, BO) { Z(stream, slot); });
  }

  function wearItem(slot) {
    // Opcode 249 = ITEM_EQUIP_FROM_INVENTORY. Z(slot)
    return sendRaw(249, 0, function(stream, Z, BO) { Z(stream, slot); });
  }

  function dropItem(slot) {
    // Opcode 251 = ITEM_DROP. Z(slot)
    return sendRaw(251, 0, function(stream, Z, BO) { Z(stream, slot); });
  }

  // ─── Walk via client-side pathfinding (APOS pattern) ───
  // Uses the client's own walkToActionSource (minified as Dg, exposed as __r2h_walk).
  // This calls world.findPath() which does A* pathfinding using the client's collision map,
  // then sends collision-free waypoints as a walk packet. This is how the real client walks
  // and how APOS/IdleRSC scripts walk — no hardcoded routes needed.
  function walkTo(x, y) {
    var mc = getMC();
    if (!mc) { log('walkTo FAIL: no mc'); return false; }
    var walkFn = window.__r2h_walk;
    if (!walkFn) { log('walkTo FAIL: __r2h_walk not exposed'); return false; }
    // Dg(mc, playerLocalX, playerLocalZ, destLocalX, destLocalZ, walkToEntity)
    // World coords → local: local = world - regionBase
    var baseX = mc.du || 0;
    var baseZ = mc.dd || 0;
    var destLocalX = x - baseX;
    var destLocalZ = y - baseZ;
    var playerLocalX = mc.bJ || 0;
    var playerLocalZ = mc.bK || 0;
    log('[WALK] world(' + x + ',' + y + ') base(' + baseX + ',' + baseZ + ') local(' + destLocalX + ',' + destLocalZ + ') playerLocal(' + playerLocalX + ',' + playerLocalZ + ')');
    var result = walkFn(mc, playerLocalX, playerLocalZ, destLocalX, destLocalZ, false);
    log('[WALK] Dg returned: ' + result);
    // v290: the v288/289 raw-hop fallback is REMOVED — it was built on a false
    // premise (Dg returning undefined is NORMAL for a void method; it does not
    // mean failure). The fallback fired on every walkTo and threw inside the
    // tick (bad scope + unverified sendRaw contract), silently killing any
    // walking phase — live regression: full-inventory bot froze instead of
    // banking (shafster 02:27, Draynor). Stale-pathfinder handling belongs in
    // position-based stall detection at the script level (as the fishing
    // adjacent-tile walker already does), never here.
    return true;
  }

  // ─── Direct packet sender (for opcodes not covered by I9) ───
  // Some actions (item-on-item, spells) need raw W/Z/Y/BO

  function sendRaw(opcode, type, payloadFn) {
    var mc = getMC();
    if (!mc || !mc.c) return false;
    var stream = mc.c;
    // Try exposed functions first
    var W = window.__r2h_W, Z = window.__r2h_Z, Y = window.__r2h_Y, BO = window.__r2h_BO;
    if (W && Z && Y && BO) {
      W(stream, opcode, type || 0);
      if (payloadFn) payloadFn(stream, Z, BO);
      Y(stream);
      return true;
    }
    // If BO is missing but W/Z/Y exist, use a local putByte implementation
    if (W && Z && Y && !BO) {
      BO = function(s, val) { s.bX.data[s.W++] = val << 24 >> 24; };
      W(stream, opcode, type || 0);
      if (payloadFn) payloadFn(stream, Z, BO);
      Y(stream);
      return true;
    }
    log('[sendRaw] W/Z/Y/BO not exposed, using fallback. W=' + !!W + ' Z=' + !!Z + ' Y=' + !!Y + ' BO=' + !!BO);
    // Fallback: implement directly using stream internals
    // W(stream, opcode, type): creates packet header
    try {
      // Start a new packet — stream.tC = type, then buffer management
      // The exact behavior of W is complex (buffer management, checksums).
      // We need to use the stream's own method if available.
      // Check if stream has a method we can call:
      if (stream.newPacket) {
        stream.newPacket(opcode);
      } else {
        // Manual packet creation matching TeaVM's W function:
        stream.tC = type || 0;
      }
      // Z = putShort (big-endian)
      var putShort = function(s, val) {
        var buf = s.bX.data;
        buf[s.W++] = (val >> 8) << 24 >> 24;
        buf[s.W++] = val << 24 >> 24;
      };
      // BO = putByte
      var putByte = function(s, val) {
        s.bX.data[s.W++] = val << 24 >> 24;
      };
      if (payloadFn) payloadFn(stream, putShort, putByte);
      // Y = send packet
      // This is complex — needs to finalize the buffer and send via WebSocket
      // We can't easily replicate it. Try calling the stream's flush method.
      if (stream.flush) stream.flush();
      return true;
    } catch(e) {
      log('sendRaw fallback error: ' + e.message);
      return false;
    }
  }

  // ─── Item-on-item (fletching, gem cutting, firemaking) ───
  // Opcode 91: putShort(slot1), putShort(slot2)

  function useItemOnItem(slot1, slot2) {
    return sendRaw(91, 346, function(stream, Z) {
      Z(stream, slot1);
      Z(stream, slot2);
    });
  }

  // ─── Spells ───
  // Payload177 opcodes (verified from Payload177Parser.java):
  //   220 = CAST_ON_INVENTORY_ITEM (alchemy) — Z(spellId), Z(slot)
  //   227 = CAST_ON_SELF (teleport) — Z(spellId)
  //   225 = CAST_ON_NPC — Z(serverIndex), Z(spellId)
  function castOnItem(spellId, slot) {
    // Payload177: readShort(targetIndex=slot), readShort(spell)
    return sendRaw(220, 567, function(stream, Z) {
      Z(stream, slot);
      Z(stream, spellId);
    });
  }

  function castOnSelf(spellId) {
    return sendRaw(227, 411, function(stream, Z) {
      Z(stream, spellId);
    });
  }

  function castOnNpc(spellId, serverIndex) {
    // Payload177 case 225: readShort(serverIndex), readShort(spellId)
    return sendRaw(225, 824, function(stream, Z) {
      Z(stream, serverIndex);
      Z(stream, spellId);
    });
  }

  // ─── Prayer ───
  // Opcode 60: enable prayer — putByte(prayerId)
  function enablePrayer(prayerId) {
    return sendRaw(60, 101, function(stream, Z, BO) {
      BO(stream, prayerId);
    });
  }

  // Opcode 254: disable prayer — putByte(prayerId)
  function disablePrayer(prayerId) {
    return sendRaw(254, 120, function(stream, Z, BO) {
      BO(stream, prayerId);
    });
  }

  // ─── Use item on object at coords (cooking, smelting, smithing, spinning) ───
  // I9 action 410 → opcode 241 (772) USE_ITEM_ON_SCENERY (classes.js + Payload177Parser verified)
  // Server ItemUseOnObject.handleObject wraps a WalkToObjectAction: the server walks
  // the player to the object, then fires the cooking plugin. Send ONCE, then wait —
  // a second packet mid-walk triggers player.resetAll() and cancels it.

  function useItemOnObject(slot, worldX, worldY) {
    // I9 action 410 → opcode 241 (772) USE_ITEM_ON_SCENERY (classes.js + Payload177Parser verified)
    // Server ItemUseOnObject.handleObject wraps a WalkToObjectAction: the server walks
    // the player to the object, then fires the cooking plugin. Send ONCE, then wait —
    // a second packet mid-walk triggers player.resetAll() and cancels it.
    return sendRaw(241, 772, function(stream, Z) {
      Z(stream, worldX);
      Z(stream, worldY);
      Z(stream, slot);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // GAME STATE READING
  // ═══════════════════════════════════════════════════════════════

  // Player world position = playerLocalX (bJ) + midRegionBaseX (du)
  // Ground item coords (cx/cw) are LOCAL REGION coordinates:
  //   Server sends: byte offset = itemWorldX - playerWorldX (GameStateUpdater.java L1143)
  //   Client adds:  cx = playerLocalX(bJ) + byte_offset (classes.js, confirmed v68)
  //   World coord:   cx + du = exact world tile (= groundItemWorldX)
  //   (matches APOS PacketHandler.java L2777: groundItemX = getLocalPlayerX() + getByte())
  //   (matches APOS Controller.java offsetX(): return x + getMidRegionBaseX())
  // findGroundItems() returns worldX = cx + du = correct.
  function getX() { var mc = getMC(); return mc ? ((mc.bJ || 0) + (mc[F.regionX] || 0)) : 0; }
  function getY() { var mc = getMC(); return mc ? ((mc.bK || 0) + (mc[F.regionY] || 0)) : 0; }

  // ─── Inventory ───
  function getInventoryCount() {
    var mc = getMC();
    if (!mc) return 0;
    // v246 FIX: mc.cU desyncs from reality (live 2026-08-23 00:26: cU=1 while 30
    // slots hold items — login packet delivered a stale count; every subsequent
    // gate on cU>=30 failed → bot mined forever with a FULL inventory → every
    // rock click "unresponsive" → blacklist loop = the Al-Kharid/Varrock hang).
    // v249 FIX (source-verified, classes.js opcode 252): the inventory snapshot
    // sets cU and writes slots [0, cU) but NEVER clears slots >= cU — after a
    // bank deposit shrinks the stack, stale ore ids linger in slots [cU, 30)
    // (live: 23 real junk + 7 ghost ores = engine read "30 full" → banked with
    // nothing, looped Dwarven Mine 00:48–02:41 & 16:47–17:00). And the mirror
    // desync exists too (cU=1 with 30 real items, Al-Kharid 00:26). So:
    // count = non-zero slots within [0, cU) when that window is sane; else
    // fall back to all non-zero slots. Ghosts beyond cU are invisible.
    var arr = mc[F.invItemId];
    var cu = mc[F.invCount] || 0;
    if (arr && arr.data) {
      var nIn = 0;
      for (var i = 0; i < cu && i < 30; i++) { if (arr.data[i]) nIn++; }
      if (nIn > 0) return nIn;          // window sane → authoritative
      var nAll = 0;                      // cU desynced low → fall through
      for (var i2 = 0; i2 < 30; i2++) { if (arr.data[i2]) nAll++; }
      return nAll;
    }
    return cu;
  }

  function getInventoryId(slot) {
    var mc = getMC();
    if (!mc || !mc[F.invItemId] || !mc[F.invItemId].data) return -1;
    return mc[F.invItemId].data[slot] & 32767;
  }

  function getInventoryIndex(itemId) {
    var count = getInventoryCount();
    for (var i = 0; i < count; i++) {
      if (getInventoryId(i) === itemId) return i;
    }
    return -1;
  }

  function getEmptySlots() { return 30 - getInventoryCount(); }

  // ─── Stats ───
  function getStatBase(skill) {
    var mc = getMC();
    if (!mc || !mc[F.statBase] || !mc[F.statBase].data) return 1;
    return mc[F.statBase].data[skill] || 1;
  }

  function getStatCurrent(skill) {
    var mc = getMC();
    if (!mc || !mc[F.statCurrent] || !mc[F.statCurrent].data) return 1;
    return mc[F.statCurrent].data[skill] || 1;
  }

  function getHpPercent() {
    return Math.floor(getStatCurrent(3) / Math.max(1, getStatBase(3)) * 100);
  }

  // ─── NPC scanning ───
  // Returns NPCs matching the given type IDs, sorted by distance from player.
  // Optional maxDist limits results to within that tile distance.
  function findNpcs(npcTypeIds, maxDist) {
    var mc = getMC();
    if (!mc || !mc.b0 || !mc.b0.data) return [];

    var typeFilter = null;
    if (npcTypeIds && npcTypeIds.length > 0) {
      typeFilter = {};
      npcTypeIds.forEach(function(id) { typeFilter[parseInt(id) || 0] = true; });
    }

    var playerX = getX(), playerY = getY();
    var results = [];
    var now = Date.now();
    for (var i = 0; i < mc.b0.data.length; i++) {
      var npc = mc.b0.data[i];
      if (!npc) continue;
      var serverIndex = npc.ea;
      if (serverIndex === undefined || serverIndex < 0) continue;
      // Skip recently killed NPCs (corpse still in array during death animation).
      // Uses a per-NPC expiry map instead of a single lastKilledIndex.
      var killTime = scriptState.killedNpcs[serverIndex];
      if (killTime && (now - killTime) < 12000) continue;
      var px = npc.F || 0;
      var py = npc.E || 0;
      if (px === 0 && py === 0) continue;
      if (typeFilter) {
        var npcType = npc.bV || 0;   // NPC def index (type ID)
        if (!typeFilter[npcType]) {
          continue;
        }
      }
      var npcTileX = Math.floor(px / 128) + (mc[F.regionX] || 0);
      var npcTileY = Math.floor(py / 128) + (mc[F.regionY] || 0);
      var dist = Math.abs(npcTileX - playerX) + Math.abs(npcTileY - playerY);
      if (maxDist !== undefined && dist > maxDist) continue;
      results.push({ serverIndex: serverIndex, arrayIdx: i, pixelX: px, pixelY: py,
                     worldX: npcTileX, worldY: npcTileY, dist: dist, npcType: npc.bV });
    }
    if (typeFilter && results.length === 0) {
      log('No targets found matching [' + Object.keys(typeFilter) + ']');
    }
    results.sort(function(a, b) { return a.dist - b.dist; });
    return results;
  }

  // Find nearest NPC that is attacking the player (g8 >= 8, within 3 tiles)
  function findAttacker() {
    var mc = getMC();
    if (!mc || !mc.b0 || !mc.b0.data) return null;
    var px = getX(), py = getY();
    for (var i = 0; i < mc.b0.data.length; i++) {
      var npc = mc.b0.data[i];
      if (!npc || !npc.bV || npc.ea < 0) continue;
      var anim = npc.g8 || 0;
      if (anim >= 8) {
        var wx = Math.floor((npc.F || 0) / 128) + (mc[F.regionX] || 0);
        var wy = Math.floor((npc.E || 0) / 128) + (mc[F.regionY] || 0);
        var dist = Math.abs(px - wx) + Math.abs(py - wy);
        if (dist <= 3) return { serverIndex: npc.ea, type: npc.bV, x: wx, y: wy, dist: dist };
      }
    }
    return null;
  }

  // ─── NPC helpers ───
  // Get world position of an NPC by serverIndex (for loot walking)
  function getNpcWorldPos(serverIndex) {
    var mc = getMC();
    if (!mc || !mc.b0 || !mc.b0.data) return null;
    for (var i = 0; i < mc.b0.data.length; i++) {
      var npc = mc.b0.data[i];
      if (npc && npc.ea === serverIndex) {
        return {
          x: Math.floor((npc.F || 0) / 128) + (mc[F.regionX] || 0),
          y: Math.floor((npc.E || 0) / 128) + (mc[F.regionY] || 0)
        };
      }
    }
    return null;
  }

  // Detect if an NPC is attacking the player (combat retaliation)
  // NPC field g8 values 0-7 = movement directions (walking)
  // Values 8+ = combat animations (attacking, being hit, death)
  // Only flag NPCs with combat animations, not walking ones.
  function getAttackingNpc() {
    var mc = getMC();
    if (!mc || !mc.b0 || !mc.b0.data) return null;
    for (var i = 0; i < mc.b0.data.length; i++) {
      var npc = mc.b0.data[i];
      if (!npc || npc.ea === undefined || npc.ea < 0) continue;
      var anim = npc.g8 || 0;
      if (anim >= 8) {  // 8+ = combat animation, not movement (1-7)
        var npcType = npc.bV || 0;
        var npcWX = Math.floor((npc.F || 0) / 128) + (mc[F.regionX] || 0);
        var npcWY = Math.floor((npc.E || 0) / 128) + (mc[F.regionY] || 0);
        var dist = Math.abs(getX() - npcWX) + Math.abs(getY() - npcWY);
        if (dist <= 3) {
          return { serverIndex: npc.ea, npcType: npcType, x: npcWX, y: npcWY };
        }
      }
    }
    return null;
  }

  // ─── Ground item scanning ───
  // v80 FIX: Ground items are in dY/dZ/eA arrays (length 5000), NOT cx/cw/cn.
  // The count is determined by scanning eA for non-zero entries.
  // World coords: dY[i] + regionX (du) = world tile X. Verified live: server confirms.
  function findGroundItems(itemIds) {
    var mc = getMC();
    if (!mc) return [];
    var gx = mc[F.groundItemX], gy = mc[F.groundItemY], gid = mc[F.groundItemId];
    if (!gx || !gy || !gid || !gx.data || !gy.data || !gid.data) return [];

    var typeFilter = null;
    if (itemIds && itemIds.length > 0) {
      typeFilter = {};
      itemIds.forEach(function(id) { typeFilter[id] = true; });
    }

    var results = [];
    // Scan the full eA array for non-zero entries (actual ground items)
    var arrLen = Math.min(gid.data.length, 5000);
    for (var i = 0; i < arrLen; i++) {
      var id = gid.data[i] || 0;
      if (id === 0) continue;
      if (typeFilter && !typeFilter[id]) continue;
      results.push({
        itemId: id,
        // dY/dZ are local region coords. World = local + regionBase (du/dd).
        worldX: (gx.data[i] || 0) + (mc[F.regionX] || 0),
        worldY: (gy.data[i] || 0) + (mc[F.regionY] || 0),
        index: i,
      });
    }
    return results;
  }

  // ─── Game object scanning ───
  // Scan dp/dn/fl arrays for objects matching any of the given IDs.
  // Returns array of {worldX, worldY, id} sorted by distance from player.
  function findObjects(objectIds, maxDist) {
    var mc = getMC();
    if (!mc) return [];
    var count = mc[F.gameObjectCount] || 0;
    var ox = mc[F.gameObjectX], oy = mc[F.gameObjectY], oid = mc[F.gameObjectId];
    if (!ox || !oy || !oid || !ox.data) return [];

    var typeFilter = null;
    if (objectIds && objectIds.length > 0) {
      typeFilter = {};
      objectIds.forEach(function(id) { typeFilter[id] = true; });
    }

    var playerX = getX(), playerY = getY();
    var results = [];
    for (var i = 0; i < count; i++) {
      var id = oid.data[i] || 0;
      if (id === 0) continue;
      if (typeFilter && !typeFilter[id]) continue;
      var wx = (ox.data[i] || 0) + (mc[F.regionX] || 0);
      var wy = (oy.data[i] || 0) + (mc[F.regionY] || 0);
      var dist = Math.abs(wx - playerX) + Math.abs(wy - playerY);
      if (maxDist !== undefined && dist > maxDist) continue;
      results.push({ worldX: wx, worldY: wy, id: id, dist: dist });
    }
    results.sort(function(a, b) { return a.dist - b.dist; });
    return results;
  }

  // Common mineable rock object IDs (from server ObjectMining.xml — rocks that actually contain ore)
  var ROCK_IDS = [100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,
    176,195,196,210,211,315,496,1030];

  // ─── Combat state ───
  // v93: Match APOS exactly. isInCombat = we have an active target that's still alive.
  // No timers, no heuristics. Just check if the NPC is still in the game world.
  function isTargetAlive(targetIdx) {
    if (targetIdx < 0) return false;
    var mc = getMC();
    if (!mc || !mc.b0 || !mc.b0.data) return false;
    for (var i = 0; i < mc.b0.data.length; i++) {
      if (mc.b0.data[i] && mc.b0.data[i].ea === targetIdx) return true;
    }
    return false;
  }

  // ─── Fatigue / Sleep ───
  function getFatigue() {
    var mc = getMC();
    if (!mc) return 0;
    var raw = mc[F.statFatigue] || 0;
    return Math.floor(raw * 100 / 750);  // raw is 0-750, convert to percentage
  }

  function getIsSleeping() {
    var mc = getMC();
    return mc ? (mc[F.isSleeping] === 1 || mc[F.isSleeping] === true) : false;
  }

  // ─── Combat style ───
  // v109: Use TeaVM r2h_ API methods instead of obfuscated field names
  function getFightMode() {
    var mc = getMC();
    if (mc && typeof mc.r2h_getCombatStyle === 'function') return mc.r2h_getCombatStyle();
    return mc ? (mc[F.combatStyle] || 0) : 0;
  }

  function setFightMode(mode) {
    var mc = getMC();
    if (mc && typeof mc.r2h_setCombatStyle === 'function') {
      mc.r2h_setCombatStyle(mode);
    } else if (mc) {
      mc[F.combatStyle] = mode;
    }
    return sendRaw(231, 700, function(stream, Z, BO) {
      BO(stream, mode);
    });
  }

  // ─── Banking state ───
  function isInBank() {
    var mc = getMC();
    return mc ? (mc[F.showDialogBank] ? true : false) : false;
  }

  function isInShop() {
    var mc = getMC();
    return mc ? (mc[F.showDialogShop] ? true : false) : false;
  }

  // ─── Banking actions ───
  // Payload177: opcode 205 = BANK_DEPOSIT. putShort(itemId), putShort(amount).
  // Payload177: opcode 206 = BANK_WITHDRAW. putShort(itemId), putShort(amount).
  // Payload177: opcode 207 = BANK_CLOSE.
  function depositItem(itemId, amount) {
    return sendRaw(205, 523, function(stream, Z) {
      Z(stream, itemId);
      Z(stream, amount);
    });
  }

  function withdrawItem(itemId, amount) {
    return sendRaw(206, 655, function(stream, Z) {
      Z(stream, itemId);
      Z(stream, amount);
    });
  }

  function closeBank() {
    var mc = getMC();
    if (mc) mc[F.showDialogBank] = 0;  // Clear client-side flag
    return sendRaw(207, 886, function(stream, Z) {});
  }

  function openBank() {
    // Talk to nearest banker NPC — bankers are NPC IDs: 95, 224, 268, 485, 540, 617
    var BANKERS = [95, 224, 268, 485, 540, 617];
    var banker = findNpcs(BANKERS);
    if (banker.length > 0) {
      return talkToNpc(banker[0].serverIndex);
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // SCRIPT ENGINE
  // ═══════════════════════════════════════════════════════════════

  var botActive = false, botLoop = null, currentScript = '';
  var scriptState = {};
  var runtimeConfig = {};  // Config overrides passed from UI via postMessage

  // v84: Detect APOS combat script IDs to route them through the combat engine
  var COMBAT_SCRIPT_PREFIXES = ['AIOFighter', 'K_', 'ABC_', 'Monk', 'combat-'];
  function isCombatScript(id) {
    if (combatScriptFactories[id]) return true;
    for (var i = 0; i < COMBAT_SCRIPT_PREFIXES.length; i++) {
      if (id.indexOf(COMBAT_SCRIPT_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  // Mining APOS script IDs — routes to makeGatheringScript with ROCK_IDS
  var MINING_SCRIPT_IDS = ['AIOMiner', 'MiningGuild', 'AKMiner', 'K_HobsMiner',
    'K_EdgeDungeonMine', 'K_SkelliCoal', 'CraftingGuildMining', 'EssenceMiner'];
  function isMiningScript(id) {
    return MINING_SCRIPT_IDS.indexOf(id) >= 0;
  }

  // v264: Woodcutting APOS script IDs — route to makeWoodcuttingPilotScript.
  // MUST be checked BEFORE combatScriptFactories/isCombatScript: the 'K_' prefix
  // captures K_ArdyYewTree/K_GnomeMagicTree/K_SeersMagicTree (their NPC_COMBAT_MAP
  // entries are placeholder [0], so no factory is built for them) and would start
  // a fighter auto-attacking nearby NPCs instead of chopping.
  var WOODCUTTING_SCRIPT_IDS = ['Woodcutting', 'K_ArdyYewTree', 'K_GnomeMagicTree', 'K_SeersMagicTree'];
  function isWoodcuttingScript(id) {
    return WOODCUTTING_SCRIPT_IDS.indexOf(id) >= 0;
  }

  // v258: NON-ATTACKABLE NPC blacklist (server NpcDefs.json, attackable=0 — 518 of
  // 794 types incl. Banker 95, shopkeepers, quest NPCs). Auto-detect fed these to the
  // combat loop: the bot walked to a banker, server rejected the attack, 15s walk
  // timeout, repeat — forever. Only attackable types may enter the target list.
  var NPC_NON_ATTACKABLE = {1:true,2:true,7:true,9:true,10:true,12:true,13:true,14:true,15:true,16:true,17:true,18:true,20:true,24:true,26:true,27:true,28:true,30:true,31:true,32:true,33:true,36:true,38:true,39:true,42:true,44:true,48:true,49:true,51:true,54:true,55:true,56:true,58:true,59:true,69:true,71:true,73:true,75:true,77:true,82:true,83:true,84:true,85:true,87:true,88:true,90:true,91:true,92:true,95:true,97:true,98:true,101:true,103:true,105:true,106:true,107:true,110:true,111:true,112:true,113:true,115:true,116:true,117:true,118:true,119:true,120:true,121:true,122:true,123:true,124:true,125:true,126:true,128:true,129:true,130:true,131:true,132:true,133:true,134:true,138:true,141:true,142:true,143:true,144:true,145:true,146:true,147:true,148:true,149:true,150:true,151:true,152:true,155:true,156:true,157:true,160:true,161:true,162:true,163:true,164:true,165:true,166:true,167:true,168:true,169:true,170:true,171:true,172:true,173:true,174:true,175:true,176:true,183:true,185:true,186:true,187:true,191:true,193:true,194:true,197:true,198:true,204:true,205:true,206:true,207:true,208:true,209:true,210:true,211:true,212:true,213:true,215:true,217:true,218:true,219:true,220:true,221:true,222:true,223:true,224:true,225:true,226:true,227:true,228:true,229:true,230:true,231:true,233:true,235:true,240:true,241:true,242:true,245:true,246:true,247:true,250:true,253:true,255:true,256:true,257:true,258:true,260:true,261:true,267:true,268:true,269:true,272:true,273:true,274:true,275:true,278:true,279:true,280:true,281:true,282:true,283:true,284:true,285:true,286:true,287:true,288:true,289:true,297:true,299:true,300:true,301:true,302:true,303:true,304:true,305:true,306:true,307:true,308:true,309:true,310:true,313:true,314:true,316:true,317:true,325:true,326:true,327:true,328:true,329:true,330:true,331:true,332:true,333:true,334:true,335:true,336:true,337:true,339:true,340:true,341:true,345:true,346:true,347:true,349:true,350:true,353:true,354:true,355:true,357:true,360:true,362:true,363:true,365:true,366:true,368:true,369:true,370:true,371:true,372:true,373:true,374:true,375:true,376:true,377:true,378:true,379:true,380:true,381:true,382:true,385:true,387:true,389:true,390:true,391:true,392:true,393:true,394:true,395:true,396:true,397:true,398:true,400:true,403:true,404:true,405:true,406:true,408:true,411:true,412:true,413:true,414:true,415:true,418:true,419:true,422:true,423:true,424:true,427:true,429:true,430:true,431:true,432:true,433:true,434:true,435:true,436:true,437:true,443:true,444:true,445:true,446:true,447:true,448:true,449:true,450:true,451:true,452:true,453:true,454:true,455:true,456:true,457:true,458:true,459:true,460:true,461:true,465:true,466:true,467:true,468:true,469:true,470:true,471:true,472:true,474:true,475:true,476:true,478:true,479:true,480:true,481:true,482:true,483:true,484:true,485:true,486:true,487:true,488:true,489:true,490:true,491:true,492:true,493:true,494:true,496:true,497:true,499:true,500:true,501:true,503:true,504:true,505:true,506:true,507:true,508:true,509:true,510:true,511:true,512:true,513:true,514:true,515:true,517:true,520:true,522:true,524:true,526:true,527:true,528:true,529:true,530:true,532:true,533:true,534:true,535:true,536:true,537:true,538:true,539:true,540:true,541:true,543:true,544:true,545:true,546:true,547:true,548:true,549:true,552:true,553:true,554:true,556:true,560:true,561:true,563:true,564:true,565:true,566:true,569:true,570:true,571:true,572:true,573:true,575:true,576:true,577:true,578:true,579:true,580:true,581:true,587:true,588:true,589:true,590:true,591:true,596:true,601:true,609:true,610:true,611:true,612:true,616:true,617:true,618:true,619:true,620:true,621:true,622:true,623:true,624:true,625:true,626:true,627:true,628:true,629:true,642:true,643:true,648:true,649:true,650:true,652:true,654:true,657:true,659:true,661:true,662:true,665:true,666:true,667:true,672:true,673:true,674:true,675:true,676:true,677:true,678:true,679:true,680:true,681:true,682:true,685:true,686:true,687:true,688:true,689:true,691:true,693:true,695:true,696:true,698:true,700:true,701:true,707:true,708:true,709:true,711:true,712:true,714:true,715:true,719:true,720:true,722:true,723:true,724:true,725:true,726:true,727:true,728:true,730:true,731:true,732:true,733:true,734:true,735:true,736:true,737:true,738:true,739:true,740:true,741:true,742:true,743:true,744:true,745:true,746:true,747:true,748:true,749:true,750:true,751:true,752:true,753:true,754:true,755:true,756:true,763:true,764:true,765:true,770:true,771:true,773:true,774:true,778:true,779:true,780:true,781:true,782:true,783:true,784:true,785:true,788:true,792:true,793:true};

  // Get NPC IDs of all attackable NPCs currently visible to the player
  function getNearbyNpcIds() {
    var mc = getMC();
    if (!mc || !mc.b0 || !mc.b0.data) return [3, 29, 34, 62]; // fallback defaults
    var ids = {};
    for (var i = 0; i < mc.b0.data.length; i++) {
      var n = mc.b0.data[i];
      if (n && n.bV && !NPC_NON_ATTACKABLE[n.bV]) ids[n.bV] = true;
    }
    var result = Object.keys(ids).map(Number);
    return result.length > 0 ? result : [3, 29, 34, 62];
  }

  // v208 keepalive: screen wake lock while a bot runs. Pcap-verified failure mode
  // (2026-08-16 21:23:42): tab JS froze completely with the TCP socket held open —
  // server's 30s no-packet reaper (GameStateUpdater: curTime - lastClientActivity
  // >= 30000) then logs "Client activity time-out". Wake lock prevents the OS
  // sleep/screen-off variant. NOTE: it cannot prevent background-tab throttling —
  // keep the tab visible while botting.
  var _wakeLock = null;
  function acquireWakeLock() {
    try {
      if (navigator.wakeLock && !_wakeLock) {
        navigator.wakeLock.request('screen').then(function(l) {
          _wakeLock = l;
          log('Wake lock acquired — screen sleep prevention ON');
          l.addEventListener('release', function() { _wakeLock = null; });
        })['catch'](function() { /* not supported/denied — fine */ });
      }
    } catch (e) { /* older browsers */ }
  }
  function releaseWakeLock() {
    try { if (_wakeLock) { _wakeLock.release(); _wakeLock = null; } } catch (e) {}
  }
  document.addEventListener('visibilitychange', function() {
    if (!botActive) return;
    if (document.hidden) {
      log('WARNING: tab hidden — browser may freeze timers; server kicks after 30s without packets. Keep this tab visible.');
    } else {
      log('Tab visible again');
      acquireWakeLock();  // re-acquire (locks auto-release when hidden)
    }
  });

  function startBot(scriptId, config) {
    if (botActive) stopBot();
    currentScript = scriptId;
    botActive = true;
    acquireWakeLock();
    runtimeConfig = config || {};
    // v215: clear module-level mine center from any previous run. Without this,
    // a restart with a DIFFERENT camp keeps the old mine's stand tile — the
    // orientation walks toward the WRONG camp (restart appeared broken until
    // hard refresh, which reloads the whole engine).
    MINE_AREA_CENTER = null;
    scriptState = { phase: 'init', target: null, killCount: 0, lastAttack: 0, firstScan: true, killedNpcs: {} };
    log('Starting: ' + scriptId + (config ? ' (with config)' : ''));
    window.parent.postMessage({type: 'R2H_BOT_STATUS', status: 'running', script: scriptId}, '*');

    // Combat scripts are factories — build with runtime config if available
    var tickFn;
    if (isWoodcuttingScript(scriptId)) {
      // v265: WC APOS ids → full woodcutting (6 tree types, banking, power-chop)
      log('Woodcutting: "' + scriptId + '" → v265 full script');
      tickFn = makeWoodcuttingScript(runtimeConfig);
    } else if (isCookingScript(scriptId)) {
      log('Cooking: "' + scriptId + '" → v303 cooking engine');
      tickFn = makeCookingScript(runtimeConfig);
    } else if (isFiremakingScript(scriptId)) {
      log('Firemaking: "' + scriptId + '" → v304 firemaking engine');
      tickFn = makeFiremakingScript(runtimeConfig);
    } else if (isFishingScript(scriptId)) {
      // v275: APOS fishing ids → fishing engine; preset the fish type per id.
      // 'CatherbyFishFarm' is INTENTIONALLY excluded (it's in COOKING_IDS —
      // fish+cook script, untouched).
      var fishPreset = FISHING_APOS_PRESETS[scriptId] || 'Shrimp & Anchovies';
      var fishCfg = {};
      for (var fk in runtimeConfig) fishCfg[fk] = runtimeConfig[fk];
      if (!fishCfg.fishType) fishCfg.fishType = fishPreset;
      log('Fishing: "' + scriptId + '" → v275 fishing (' + fishCfg.fishType + ')');
      tickFn = makeFishingScript(fishCfg);
    } else if (combatScriptFactories[scriptId]) {
      tickFn = combatScriptFactories[scriptId](runtimeConfig);
    } else if (scripts[scriptId]) {
      tickFn = scripts[scriptId];
    } else if (isCombatScript(scriptId)) {
      // APOS script IDs like 'AIOFighter', 'Monkz', etc.
      // Use npcIds from config if provided, otherwise auto-detect nearby
      var npcList = (runtimeConfig.npcIds && runtimeConfig.npcIds.length > 0)
        ? runtimeConfig.npcIds
        : getNearbyNpcIds();
      log('Combat script "' + scriptId + '" → targets=[' + npcList.join(',') + ']');
      tickFn = makeCombatScript(npcList, {
        buryBones: false, eatAtHp: 10, maxWander: 20, lootIds: []
      })(runtimeConfig);
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
      // No selection at all → all camp rocks. Selection made but camp has NONE of
      // those ores → warn loudly and use all camp rocks (bot stays functional).
      if (mineRocks.length === 0) {
        if (runtimeConfig.rocks) {
          var picked = Object.keys(runtimeConfig.rocks).filter(function(k){ return runtimeConfig.rocks[k]; });
          log('WARNING: ' + campName + ' has none of the selected ores [' + picked.join(',') + '] — mining all camp rocks instead');
        }
        mineRocks = Object.keys(campIds).map(Number);
      }
      // Fallback coords MUST match the selection too — the client object arrays are
      // stale (v205 invariant), so the mining loop frequently targets rocks via this
      // server-authoritative list. Unfiltered = bot mines unselected ores.
      var mineFallback = mine.rocks.filter(function(r) { return campIds[r[2]] && mineRocks.indexOf(r[2]) >= 0; })
                                   .map(function(r) { return { x: r[0], y: r[1], id: r[2] }; });
      // ── v210 BANK SELECTION ──
      // Auto: closest bank by actual webwalk route cost (same graph the bot walks —
      // distance through gates/ladders, not straight-line). Manual choice is ONLY
      // honored for custom coordinates (arbitrary mine → user knows their bank).
      var powerMine = !!runtimeConfig.mineNoBank;
      var useGuild = (campName === 'Mining Guild');
      var bankName = null, bankTile = null;
      if (runtimeConfig.customCoords && runtimeConfig.mineBankLocation && BANK_REGISTRY[runtimeConfig.mineBankLocation]) {
        bankName = runtimeConfig.mineBankLocation;
        bankTile = BANK_REGISTRY[bankName];
        log('Bank (manual, custom coords): ' + bankName);
      } else if (!powerMine) {
        var wk = webwalkDijkstra(mine.stand[0], mine.stand[1], useGuild);
        var bestBank = null, bestCost = Infinity;
        for (var bn in BANK_REGISTRY) {
          var bt = BANK_REGISTRY[bn];
          var bnode = webwalkSnap(bt[0], bt[1], useGuild);
          var bcost = wk.dist[bnode.x + ',' + bnode.y];
          if (bcost !== undefined && bcost < bestCost) { bestCost = bcost; bestBank = bn; }
        }
        if (bestBank) {
          bankName = bestBank;
          bankTile = BANK_REGISTRY[bestBank];
          log('Bank auto-selected (closest by route): ' + bankName + ' (cost ' + bestCost + ')');
        } else {
          bankName = 'Edgeville'; bankTile = BANK_REGISTRY['Edgeville'];
          log('WARNING: no routable bank found — defaulting to Edgeville');
        }
      }
      log('Mining v210: camp=' + campName + ' stand=(' + mine.stand[0] + ',' + mine.stand[1] + ')' +
          ' rocks=[' + mineRocks.join(',') + '] bank=' + (powerMine ? 'NONE (power-mine)' : bankName + ' (' + bankTile[0] + ',' + bankTile[1] + ')'));
      tickFn = makeGatheringScript(mineRocks, 3000, mineFallback, {
        stand: mine.stand, bank: bankTile, powerMine: powerMine, useGuild: useGuild
      });
    } else {
      tickFn = scripts['_default'];
    }

    (function runTick() {
      if (!botActive) return;
      if (scriptState.phase === undefined) return;  // Guard: state was cleared
      try {
        antiIdle();
        var delay = tickFn();
        if (!botActive) return;  // Check again after tick
        botLoop = setTimeout(runTick, Math.max(200, delay || 2000));
      } catch(e) {
        // v237: log the STACK, not just the message — a throw site was nearly
        // impossible to locate from 'Error: <msg>' alone during the 2026-08-22
        // Varrock freeze investigation.
        log('Error: ' + e.message + (e.stack ? ' | ' + String(e.stack).split('\n').slice(1,3).join(' <=') : ''));
        if (botActive) botLoop = setTimeout(runTick, 3000);
      }
    })();
  }

  function stopBot() {
    botActive = false; currentScript = '';
    releaseWakeLock();
    if (botLoop) { clearTimeout(botLoop); botLoop = null; }
    scriptState = { phase: 'stopped' };  // Sentinel — runTick checks this
    log('Stopped');
    window.parent.postMessage({type: 'R2H_BOT_STATUS', status: 'stopped'}, '*');
  }

  // ═══════════════════════════════════════════════════════════════
  // COMBAT SCRIPT
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // AIOFIGHTER — Full port of AIOFighter.java (Dvorak / Seatta)
  //
  // Features ported from Java:
  //   ✓ NPC targeting by ID array (getNearestNpcByIds)
  //   ✓ Bone pickup from ground + bury from inventory (buryBones)
  //   ✓ Loot pickup by item ID list (lootTable)
  //   ✓ Food eating at absolute HP threshold (eatIfNeeded)
  //   ✓ Sleep/fatigue management via sleeping bag (sleepHandler)
  //   ✓ Wander radius — walk back to start tile (isWithinWander)
  //   ✓ Target level stop condition (hasReachedTargetLevel)
  //   ✓ Combat style selection config (fightMode) *
  //   ✓ Prioritize bones toggle (prioritizeBones)
  //
  // * fightMode config is tracked but NOT applied — the combatStyle
  //   field is missing from the TeaVM client (see skill "Missing
  //   Fields"). When the field is found, setFightMode() can be
  //   wired in. The script still functions perfectly for combat.
  //
  // Tick mapping: Java's while(isRunning()){...c.sleep(618)...}
  // → JS tick function returns ms delay. Each early return = Java's
  //   "continue" (restart loop from top on next tick).
  // ═══════════════════════════════════════════════════════════════

  function makeCombatScript(npcIds, defaults) {
    defaults = defaults || {};

    // Factory: returns the tick function, merging runtime config over defaults
    return function(runtimeCfg) {
      runtimeCfg = runtimeCfg || {};

      // ── Merge: runtime config overrides defaults (Java: setValuesFromGUI) ──
      var cfg = {
        buryBones:       runtimeCfg.buryBones !== undefined ? runtimeCfg.buryBones : (defaults.buryBones !== false),
        prioritizeBones: runtimeCfg.prioritizeBones !== undefined ? runtimeCfg.prioritizeBones : !!defaults.prioritizeBones,
        lootIds:         runtimeCfg.lootIds || defaults.lootIds || [],
        eatAtHp:         runtimeCfg.eatAtHp !== undefined ? runtimeCfg.eatAtHp : (defaults.eatAtHp || 50),
        maxWander:       runtimeCfg.maxWander !== undefined ? runtimeCfg.maxWander : (defaults.maxWander !== undefined ? defaults.maxWander : 20),
        fightMode:       runtimeCfg.fightMode !== undefined ? runtimeCfg.fightMode : (defaults.fightMode !== undefined ? defaults.fightMode : -1),
        targetLevel:     runtimeCfg.targetLevel || defaults.targetLevel || -1,
        openDoors:       runtimeCfg.openDoors !== undefined ? runtimeCfg.openDoors : !!defaults.openDoors,
        useMagic:        runtimeCfg.useMagic !== undefined ? runtimeCfg.useMagic : !!defaults.useMagic,
        combatSpell:     runtimeCfg.combatSpell || defaults.combatSpell || '',
        useRanging:      runtimeCfg.useRanging !== undefined ? runtimeCfg.useRanging : !!defaults.useRanging,
        arrowType:       runtimeCfg.arrowType || defaults.arrowType || '',
        switchId:        runtimeCfg.switchId || defaults.switchId || 0,
      };

    // Build loot table — APOS: if buryBones, add bones to loot table
    var lootTable = cfg.lootIds.slice();
    if (cfg.buryBones || cfg.prioritizeBones) {
      lootTable = lootTable.concat(BONES);
    }
    log('Loot table: [' + lootTable.join(',') + ']');

    // ── Helper: wander distance check (Java: isWithinWander) ──
    function distFromStart(x, y) {
      var dx = x - scriptState.startX, dy = y - scriptState.startY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Helper for ranging: find first ranged weapon in inventory.
    // Returns the lowest-slot bow OR crossbow — whichever comes first.
    // Arrange your inventory so your preferred weapon is in the lowest slot.
    function isRangedWeapon(id) {
      return id === 59 || id === 60 ||            // Crossbows
             id === 188 || id === 189 ||           // Basic shortbow/longbow
             (id >= 648 && id <= 657);             // Oak through Magic bows
    }
    function findRangedWeaponSlot() {
      var cnt = getInventoryCount();
      for (var ws = 0; ws < cnt; ws++) {
        if (isRangedWeapon(getInventoryId(ws))) return ws;
      }
      return -1;
    }

    return function() {
      if (!isLoggedIn()) { log('Not logged in'); return 2000; }

      // ══ PHASE: INIT (Java: scriptStart() preamble) ══
      if (scriptState.phase === 'init') {
        scriptState.startX = getX();
        scriptState.startY = getY();
        scriptState.target = -1;
        scriptState.killCount = 0;
        scriptState.bonesBuried = 0;
        scriptState.lootAttempts = {};
        scriptState.lootBlacklist = {};
        scriptState.killedNpcs = {};
        scriptState.firstScan = true;
        scriptState.phase = 'main';
        scriptState._rangingFirstTick = true;  // Skip melee scan on first tick
        var invLog = [];
        for (var di = 0; di < getInventoryCount(); di++) {
          invLog.push(getInventoryId(di));
        }
        log('AIOFighter: start=(' + scriptState.startX + ',' + scriptState.startY +
            ') npcIds=[' + npcIds.join(',') + '] bury=' + cfg.buryBones +
            ' eatAt=' + cfg.eatAtHp + ' wander=' + cfg.maxWander +
            ' fightMode=' + cfg.fightMode);
        log('Inventory [' + getInventoryCount() + '/30]: ' + invLog.join(','));
      }

      // ══ 0. FIGHT MODE — set once at init, then maintain ══
      if (cfg.fightMode >= 0 && cfg.fightMode <= 3 && cfg.targetLevel < 0) {
        if (scriptState.styleSet !== cfg.fightMode) {
          setFightMode(cfg.fightMode);
          scriptState.styleSet = cfg.fightMode;
        }
      }

      // ══ 0b. RANGING MELEE SWITCH — equip melee weapon when player is in combat ══
      // In RSC, you can't fire a bow while in melee combat. Check the PLAYER's
      // own animation (mc.O.g8 >= 8 = being attacked/in combat), not nearby NPCs.
      // NPCs can have combat animations without attacking the player.
      // Switch to melee weapon, then switch back after via inventory scan.
      // Skips the first tick after init so the bot can fire at least one ranged shot.
      if (cfg.useRanging && cfg.switchId > 0) {
        if (scriptState._rangingFirstTick) {
          scriptState._rangingFirstTick = false;
        } else {
        var inMeleeCombat = false;
        var mcRange = getMC();
        // v258 FIX: g8>=8 on the player fires for RANGED attacks too (own attack
        // animation) — the old check read our own bow shots as "melee enemy" and
        // flapped weapons. Real melee pressure = one of OUR target types adjacent
        // (<=2 tiles) AND the player in combat state.
        if (mcRange && mcRange[F.localPlayer]) {
          var playerG8 = mcRange[F.localPlayer].g8 || 0;
          if (playerG8 >= 8) {
            var adjTargets = findNpcs(npcIds, 2);
            inMeleeCombat = (adjTargets.length > 0);
          }
        }

        if (inMeleeCombat) {
          // Equip melee weapon if not already holding it
          if (!scriptState.inMeleeMode) {
            var meleeSlot = getInventoryIndex(cfg.switchId);
            if (meleeSlot >= 0) {
              log('Ranging: melee enemy detected — switching to weapon ' + cfg.switchId);
              wearItem(meleeSlot);
              scriptState.inMeleeMode = true;
            }
          }
        } else if (scriptState.inMeleeMode) {
          // No melee NPC nearby — switch back to bow by scanning inventory
          var rangedSlot = findRangedWeaponSlot();
          if (rangedSlot >= 0) {
            log('Ranging: melee ended — switching back to bow (ID ' + getInventoryId(rangedSlot) + ')');
            wearItem(rangedSlot);
          }
          scriptState.inMeleeMode = false;
        }
        } // end ranging first-tick skip
      }

      // ══ 1. SLEEP / FATIGUE ══
      // When sleeping screen is active, type the captcha word and submit
      if (getIsSleeping()) {
        if (!scriptState.sleepTyping) {
          scriptState.sleepTyping = true;
          log('Sleep screen detected — typing "asleep"');
          // Type "asleep" character by character via the canvas keydown handler
          var sleepWord = 'asleep';
          for (var ci = 0; ci < sleepWord.length; ci++) {
            window.__r2hTypeChar(sleepWord[ci]);
          }
          // Press Enter to submit
          setTimeout(function() {
            window.__r2hTypeSpecial('Enter');
            scriptState.sleepTyping = false;
          }, 500);
        }
        return 2000;  // Wait for server to process
      }
      
      var fatigue = getFatigue();
      if (fatigue >= 90) {
        var bagSlot = getInventoryIndex(SLEEPING_BAG);
        if (bagSlot >= 0) {
          log('Fatigue ' + fatigue + '% — using sleeping bag');
          useItem(bagSlot);
          return 3000;  // Wait for sleep screen to appear
        }
      }

      // ══ 2. WANDER RADIUS ══
      if (cfg.maxWander >= 0 && distFromStart(getX(), getY()) > cfg.maxWander) {
        walkTo(scriptState.startX, scriptState.startY);
        return 1500;
      }

      // ══ 2b. OPEN DOORS / GATES — server auto-open handles this ══
      // The server's processTick() auto-opens freely-openable gates when a 
      // player is adjacent. No client-side action needed.
      // Reset stuck counter when not in combat to prevent false stuck detection.
      if (scriptState.target < 0) {
        scriptState.stuckCount = 0;
      }

      // ══ 3. EAT FOOD ══
      // eatAtHp is a PERCENTAGE of max HP (e.g. 50 = eat when below 50% health)
      var currentHp = getStatCurrent(3);
      var maxHp = getStatBase(3);
      var hpPercent = Math.floor(currentHp * 100 / Math.max(1, maxHp));
      if (hpPercent <= cfg.eatAtHp && currentHp < maxHp) {
        for (var f = 0; f < FOOD.length; f++) {
          var foodSlot = getInventoryIndex(FOOD[f]);
          if (foodSlot >= 0) {
            log('Eating: HP ' + currentHp + '/' + maxHp + ' (' + hpPercent + '%, threshold ' + cfg.eatAtHp + '%)');
            useItem(foodSlot);
            return 800;
          }
        }
      }

      // ══ 3b. LOOT WALK COOLDOWN — don't send any actions while walking to loot ══
      // In magic mode, the player fights from range. pickupItem creates a server-side
      // WalkToPointAction. Any new packet (attack, cast, re-pickup) cancels it via
      // player.resetAll(). This cooldown blocks all actions until the walk completes.
      if (scriptState.lootCooldown && Date.now() < scriptState.lootCooldown) {
        return 300;
      }
      scriptState.lootCooldown = 0;

      // ══ 4. CHECK IF TARGET DIED ══
      // NPC corpses stay in b0.data during death animation.
      // Timeout distinguishes walking from combat:
      // - Walking to NPC: allow up to 15s (path around walls takes time)
      // - In combat (adjacent to NPC): allow 8s for the fight to complete
      // - Magic combat: keep casting until NPC dies or 20s timeout
      if (scriptState.target >= 0) {
        var timeSinceAttack = Date.now() - (scriptState.lastAttackTime || 0);

        if (cfg.useMagic && cfg.combatSpell && COMBAT_SPELLS[cfg.combatSpell] !== undefined) {
          // Magic mode: if target still alive and haven't timed out, re-cast
          var magicTimeInCombat = Date.now() - (scriptState.combatStartTime || scriptState.lastAttackTime || 0);
          if (isTargetAlive(scriptState.target) && magicTimeInCombat < 20000) {
            var spellId = COMBAT_SPELLS[cfg.combatSpell];
            castOnNpc(spellId, scriptState.target);
            scriptState.lastAttackTime = Date.now();
            return 1200;
          } else {
            // Target died or timed out
            var targetDied = !isTargetAlive(scriptState.target);
            if (targetDied) {
              scriptState.killedNpcs[scriptState.target] = Date.now();
              scriptState.killCount++;
            } else {
              // v259: magic timeout on an "alive-looking" target = unresponsive
              // (corpse in array / out of runes) — blacklist so we switch NPCs
              scriptState.killedNpcs[scriptState.target] = Date.now();
              log('Magic target idx ' + scriptState.target + ' unresponsive — switching monsters');
            }
            scriptState.target = -1;
            return 300;
          }
        }

        var mcCheck = getMC();
        var isAdjacent = false;
        if (mcCheck) {
          for (var ci2 = 0; ci2 < mcCheck.b0.data.length; ci2++) {
            var npcCheck = mcCheck.b0.data[ci2];
            if (npcCheck && npcCheck.ea === scriptState.target) {
              var npcWX2 = Math.floor((npcCheck.F || 0) / 128) + (mcCheck[F.regionX] || 0);
              var npcWY2 = Math.floor((npcCheck.E || 0) / 128) + (mcCheck[F.regionY] || 0);
              var distToNpc = Math.abs(getX() - npcWX2) + Math.abs(getY() - npcWY2);
              isAdjacent = (distToNpc <= 2);
              break;
            }
          }
        }
        var timeout = isAdjacent ? 8000 : 15000;
        if (isTargetAlive(scriptState.target) && timeSinceAttack < timeout) {
          return 618;
        } else {
          // Only register kill if NPC actually died (not just timeout)
          if (!isTargetAlive(scriptState.target)) {
            scriptState.killedNpcs[scriptState.target] = Date.now();
            scriptState.killCount++;
          } else if (isAdjacent) {
            // v259: ADJACENT-TIMEOUT = unresponsive target. Corpse NPC entries
            // stay in the client array (kill-on-our-tile → corpse at dist 0-1)
            // so isTargetAlive reads TRUE and the old code cleared the target
            // WITHOUT re-blacklisting → next scan re-picked the SAME corpse →
            // attackNpc → 8s timeout → repeat. Live 19:57-19:58: 7 consecutive
            // rejected attackNpc(2758) on a corpse, ~8s apart, bot "sitting
            // there". Blacklist 12s so the scan switches to a live monster.
            scriptState.killedNpcs[scriptState.target] = Date.now();
            log('Target idx ' + scriptState.target + ' unresponsive (corpse/rejected) — switching monsters');
          }
          scriptState.target = -1;
          return 300;
        }
      }

      // ══ 5. LOOT + BURY (runs before finding new target — matches APOS) ══
      if (lootTable.length > 0 && getEmptySlots() > 0) {
        var lootItems = findGroundItems(lootTable);
        if (lootItems.length > 0) {
          for (var li = 0; li < lootItems.length; li++) {
            var loot = lootItems[li];
            if (cfg.maxWander >= 0 && distFromStart(loot.worldX, loot.worldY) > cfg.maxWander) continue;
            var lootDist = Math.abs(getX() - loot.worldX) + Math.abs(getY() - loot.worldY);
            // Magic AND ranged both fight from range — allow loot pickup up to
            // 10 tiles, walk if > 1 (v258: ranged had melee's 4-tile cap while
            // shooting from 6-8 tiles → kills outside loot range were abandoned).
            var maxLootDist = ((cfg.useMagic && cfg.combatSpell) || cfg.useRanging) ? 10 : 4;
            if (lootDist > maxLootDist) continue;
            var bkey = loot.worldX + ',' + loot.worldY + ',' + loot.itemId;
            if (scriptState.lootBlacklist[bkey]) continue;
            // If far away, walk to loot first before picking up.
            // Set a cooldown to prevent the next tick from cancelling the
            // server-side WalkToPointAction with a new packet.
            if (lootDist > 1) {
              walkTo(loot.worldX, loot.worldY);
            }
            pickupItem(loot.worldX, loot.worldY, loot.itemId);
            // Block all actions while server walks player to the item.
            // 600ms per tile + 1s buffer for pickup.
            scriptState.lootCooldown = Date.now() + 600 + (lootDist * 500);
            scriptState.lootAttempts[bkey] = (scriptState.lootAttempts[bkey] || 0) + 1;
            if (scriptState.lootAttempts[bkey] >= 3) {
              scriptState.lootBlacklist[bkey] = true;
            }
            if (cfg.buryBones) {
              for (var bi = 0; bi < BONES.length; bi++) {
                var boneSlot = getInventoryIndex(BONES[bi]);
                if (boneSlot >= 0) {
                  useItem(boneSlot);
                  scriptState.bonesBuried++;
                  return 640;
                }
              }
            }
            return 618;
          }
        }
      }

      // ══ 6. FIND + ATTACK NEAREST NPC ══
      // If we were in melee mode (ranging switched to melee weapon), switch back
      // to bow now that the target is dead, before finding the next one.
      if (cfg.useRanging && cfg.switchId > 0 && scriptState.inMeleeMode) {
        var rangedSlot6 = findRangedWeaponSlot();
        if (rangedSlot6 >= 0) {
          log('Ranging: re-equipping bow for next target (ID ' + getInventoryId(rangedSlot6) + ')');
          wearItem(rangedSlot6);
        }
        scriptState.inMeleeMode = false;
      }
      // v257: LIVE TARGET RE-SCAN. Both the panel's Scan and the engine's
      // auto-detect were one-shot snapshots — NPCs that spawned/patrolled into
      // view after start were permanently invisible ("monsters around me but
      // script won't attack"). Merge newly-visible types every 30s — ONLY in
      // auto-detect mode (empty npcIds field). A hand-picked selection is the
      // user's explicit intent and is never overridden.
      if (!scriptState._autoDetect) {
        scriptState._autoDetect = !!(runtimeConfig.npcIds && runtimeConfig.npcIds.length === 0) ||
                                   runtimeConfig.npcIds === undefined;
      }
      if (scriptState._autoDetect) {
        var lastRescan = scriptState._npcRescanAt || 0;
        if (Date.now() - lastRescan > 30000) {
          scriptState._npcRescanAt = Date.now();
          var known = {};
          for (var ri2 = 0; ri2 < npcIds.length; ri2++) known[npcIds[ri2]] = true;
          var live = getNearbyNpcIds();
          var added = [];
          for (var ri3 = 0; ri3 < live.length; ri3++) {
            if (!known[live[ri3]]) { npcIds.push(live[ri3]); added.push(live[ri3]); }
          }
          if (added.length > 0) {
            log('Auto-detect: new NPC types in view → [' + added.join(',') + '] (targets now ' + npcIds.length + ')');
          }
        }
      }

      // v257: scan the full view (server sends ~40 tiles) for TARGETS; the
      // wander leash above still pulls the player back if they stray. Old
      // maxDist=cfg.maxWander(20) silently ignored monsters across the room.
      var targets = findNpcs(npcIds, 40);

      if (scriptState.firstScan) {
        log('Scan: ' + targets.length + ' targets | HP ' + currentHp + '/' + maxHp +
            ' | K=' + scriptState.killCount + ' | Bones=' + scriptState.bonesBuried);
        scriptState.firstScan = false;
      }

      if (targets.length > 0) {
        var target = targets[0];
        // Magic mode: cast spell on NPC instead of melee attack
        if (cfg.useMagic && cfg.combatSpell) {
          var spellId = COMBAT_SPELLS[cfg.combatSpell];
          if (spellId !== undefined) {
            castOnNpc(spellId, target.serverIndex);
            log('Casting ' + cfg.combatSpell + ' (id=' + spellId + ') on NPC idx=' + target.serverIndex);
            scriptState.target = target.serverIndex;
            scriptState.lastAttackTime = Date.now();
            scriptState.combatStartTime = Date.now();
            return 1200; // Spell cast cooldown
          }
          log('WARNING: Unknown spell "' + cfg.combatSpell + '" — falling back to melee');
        }
        // Melee attack
        attackNpc(target.serverIndex);
        scriptState.target = target.serverIndex;
        scriptState.lastAttackTime = Date.now();
        scriptState.combatStartTime = Date.now();
        return 600;
      }

      // ══ 7. NO TARGETS — idle ══
      return 1000;
    };
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RESOURCE SCRIPT (mining, woodcutting, fishing)
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // RESOURCE SCRIPTS (Mining, Fishing, Woodcutting)
  // ═══════════════════════════════════════════════════════════════
  // APOS scripts (AIOMiner, Woodcutting) do TWO things our old scripts didn't:
  // 1. Walk the player to the resource location on startup (the player doesn't
  //    have to be standing at the exact tile — APOS uses PathWalkTo)
  // 2. Search for the object dynamically using getNearestObjectById instead of
  //    blindly clicking hardcoded coordinates
  //
  // Our engine uses opcode 242 (OBJECT_COMMAND) which sends world coordinates.
  // The server's ObjectCommand handler walks the player to the object tile,
  // then fires the action. So the player MUST be within view range of the object.
  //
  // The fix: add a "walk-to-location" init phase that walks the player close to
  // the resource area before attempting to interact.

  function makeResourceScript(locations, actionTime) {
    return function() {
      if (!isLoggedIn()) return 5000;

      // Stop if inventory full
      if (getInventoryCount() >= 30) {
        log('Inventory full! Stop or bank.');
        return 5000;
      }

      if (scriptState.phase === 'init') {
        scriptState.resIdx = 0;
        // Record start position for anti-drift
        scriptState.startX = getX();
        scriptState.startY = getY();
        // Check if player is already near the first resource location
        var firstLoc = locations[0];
        var distToArea = Math.abs(getX() - firstLoc.x) + Math.abs(getY() - firstLoc.y);
        if (distToArea > 10) {
          log('Walking to resource area (' + firstLoc.x + ',' + firstLoc.y + ') from (' +
              getX() + ',' + getY() + ') dist=' + distToArea);
          scriptState.phase = 'walkToArea';
          scriptState.walkTarget = firstLoc;
        } else {
          scriptState.phase = 'gather';
        }
      }

      // Walk to resource area on startup (APOS: PathWalkTo)
      if (scriptState.phase === 'walkToArea') {
        var wt = scriptState.walkTarget;
        var wDist = Math.abs(getX() - wt.x) + Math.abs(getY() - wt.y);
        if (wDist <= 3) {
          log('Arrived at resource area');
          scriptState.phase = 'gather';
          return 1000;
        }
        // Keep walking — walkTo sends opcode 194 with world coords
        walkTo(wt.x, wt.y);
        return 1000;
      }

      if (scriptState.phase === 'gather') {
        var loc = locations[scriptState.resIdx % locations.length];
        // Verify player is close enough to the resource to interact
        var resDist = Math.abs(getX() - loc.x) + Math.abs(getY() - loc.y);
        if (resDist > 5) {
          // Walk closer if we've drifted away
          walkTo(loc.x, loc.y);
          return 1000;
        }
        // Send the mine/chop/fish action (opcode 242 = OBJECT_COMMAND)
        atObject(loc.x, loc.y);
        scriptState.phase = 'wait';
        scriptState.waitStart = Date.now();
        return actionTime;
      }

      if (scriptState.phase === 'wait') {
        if (Date.now() - scriptState.waitStart >= actionTime) {
          scriptState.resIdx++;
          scriptState.phase = 'gather';
          return 1000;
        }
        return 1000;
      }
      return 1000;
    };
  }

  // ─── DYNAMIC GATHERING: mine/chop/fish using object scanning ───
  // Uses findObjects() to locate resources dynamically. Falls back to hardcoded
  // coordinates when objects aren't in client arrays (static scenery rocks).
  // objectIds: game object IDs to scan for (e.g. ROCK_IDS)
  // actionTime: ms to wait after interacting
  // fallbackCoords: [{x,y},...] — server-authoritative coordinates for this area
  function makeGatheringScript(objectIds, actionTime, fallbackCoords, opts) {
    opts = opts || {};
    var MINE_STAND = opts.stand || [276, 379];       // wilderness default (v205)
    var BANK_TILE  = opts.bank  || [216, 449];       // edgeville default (v205; null under power-mine, unused)
    var POWER_MINE = !!opts.powerMine;
    var USE_GUILD  = !!opts.useGuild;
    actionTime = actionTime || 3000;
    fallbackCoords = fallbackCoords || [];

    // ── v206 webwalk routing helpers (IdleRSC graph port) ──
    // Route cache: one webwalk computation per trip leg; invalidated on re-route.
    function routeTo(tx, ty) {
      if (scriptState._routeCache && scriptState._routeCache.t === tx + ',' + ty) return scriptState._routeCache.r;
      var r = webwalkRoute(getX(), getY(), tx, ty, USE_GUILD);
      scriptState._routeCache = { t: tx + ',' + ty, r: r };
      return r;
    }
    function invalidateRoute() { scriptState._routeCache = null; scriptState._routeProgress = 0; }

    // Next walk target: the NEXT graph node only (edge-by-edge) — the exact
    // IdleRSC webwalkTowards pattern. Each graph edge is a short, walked-and-
    // verified segment. Hopping multiple edges ahead (old "farthest within 30")
    // sends long Dg pathfinder calls through obstacle-dense terrain (Lumbridge
    // forest: 21 blocking trees + farm fences), which the client pathfinder
    // FAILS SILENTLY → frozen bot (pcap-verified 2026-08-16: heartbeats only,
    // zero walk packets for 148s at (239,536)).
    // Long edges (>20 tiles, open terrain) are sub-stepped at 18 tiles.
    // finalDest: once the last node is reached, walk directly onto it.
    function nextRouteTarget(route, finalDest) {
      var px = getX(), py = getY();
      var bestIdx = 0, bestD = Infinity;
      for (var i = 0; i < route.length; i++) {
        var d = Math.abs(route[i].x - px) + Math.abs(route[i].y - py);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      // v245 FIX: monotonic route progress. Pure nearest-node indexing walked
      // BACKWARD on ties: at Falador (284,563) nodes (283,570)/(289,560) tie at
      // distance 8, `<` keeps the LOWER index → target (289,572) BEHIND the
      // player → walk east → tie breaks → next node west → tie again → player
      // ping-ponged (283-287,563) for 4+ min (live 23:17-23:21, Falador East
      // return trip). Route index must never decrease within one trip leg:
      // clamp to the highest index already achieved this leg.
      if (scriptState._routeProgress === undefined ||
          scriptState._routeTargetKey !== route[route.length-1].x + ',' + route[route.length-1].y) {
        scriptState._routeProgress = 0;
        scriptState._routeTargetKey = route[route.length-1].x + ',' + route[route.length-1].y;
      }
      if (bestIdx < scriptState._routeProgress) bestIdx = scriptState._routeProgress;
      else scriptState._routeProgress = bestIdx;
      var nxt = route[bestIdx + 1];
      if (!nxt) return { x: finalDest.x, y: finalDest.y };
      if (nxt.label) {   // special edge first — walkTo can't cross it
        // v222: attach the node BEYOND the edge (route[bestIdx+2]) so the
        // edge handler can walk through to a verified graph node after opening
        var beyond = route[bestIdx + 2];
        // v237 FIX: when the labeled edge IS the final route node there is no
        // beyond — zombie-click starvation. Live 2026-08-22 17:01 + repro 18:50:
        // Varrock East route (91,509)→(104,510,varrockEastBankDoor) ENDS at the
        // door node; node.bx undefined → the walk-first alternation (which
        // requires bx) never runs → atObject(102,509) fires from 11 tiles away
        // → the server SILENTLY drops every click (zero onOpLoc, zero
        // null-object — not even 'suspicious' spam) → FAILED after 12 →
        // re-engage → infinite loop, player frozen. APOS S_DummyTrainer's
        // on_road() does the walk FIRST (walk_to_bank: walkTo 102±2, 510+1..3)
        // and only then atObject(102,509). Synthesize the beyond from the final
        // destination: the even-attempt walk delivers the player ADJACENT to
        // the door, then the odd-attempt click executes from range.
        if (!beyond) beyond = { x: finalDest.x, y: finalDest.y };
        if (!beyond.label) {
          return { x: nxt.x, y: nxt.y, label: nxt.label, bx: beyond.x, by: beyond.y };
        }
        return nxt;
      }
      var vx2 = nxt.x - px, vy2 = nxt.y - py;
      var vlen2 = Math.max(Math.abs(vx2) + Math.abs(vy2), 1);
      // v218→v223: known-gate check. v218 measured the gate's perpendicular
      // distance to the PLAYER's hop line — position-sensitive: player at
      // (213,3272) fires (perp 0.22) but player at (213,3274) misses (perp 2.0,
      // pcap 2026-08-20 23:05: 1 packet in 100s, engine silently blocked).
      // v223 checks the gate against the GRAPH EDGE segment (nearest route node
      // → next node) instead — the edge is what the gate physically blocks:
      //   edge (211,3273)→(197,3274) passes gate (211,3272) at distance 1.
      // Player-lane-independent. Also fires when the gate lies on the hop line.
      if (!nxt.label) {
        for (var kg = 0; kg < KNOWN_GATES.length; kg++) {
          var g = KNOWN_GATES[kg];
          // v226: distance gate — engage the gate handler only when the player
          // is CLOSE (≤8 tiles). Without this, the edge-segment check fired the
          // handler from across the mining room (e.g., player (190,3296), gate
          // (186,3300) 4-7 tiles + rock walls away) — "Special edge" logged
          // before the gate was even relevant, and every tick diverted to the
          // stand-tile walk through rock terrain instead of normal corridor
          // walking. Normal node-to-node walking handles the approach; the
          // handler takes over only at the gate itself.
          var gDist = Math.abs(g.x - px) + Math.abs(g.y - py);
          if (gDist > 8) continue;
          var hit = false;
          // (a) gate near the EDGE segment (route node → next node)
          var an = route[bestIdx], ax = an.x, ay = an.y;
          var ex = nxt.x - ax, ey = nxt.y - ay;
          var elen = Math.max(Math.abs(ex) + Math.abs(ey), 1);
          var gwx = g.x - ax, gwy = g.y - ay;
          var eproj = (gwx * ex + gwy * ey) / elen;
          var eperp = Math.abs(gwx * ey - gwy * ex) / elen;
          if (eperp <= 1.5 && eproj >= 0 && eproj <= elen) hit = true;
          // (b) gate near the player's own hop line (v218 behavior — still valid
          // when the player is ON the gate row walking toward it)
          if (!hit) {
            var wx2 = g.x - px, wy2 = g.y - py;
            var proj2 = (wx2 * vx2 + wy2 * vy2) / vlen2;
            if (proj2 >= 0 && proj2 <= vlen2) {
              var perp2 = Math.abs(wx2 * vy2 - wy2 * vx2) / vlen2;
              if (perp2 <= 1.5) hit = true;
            }
          }
          // (c) v228: gate lies BETWEEN player and hop target on the gate's cross
          // axis. Live capture 2026-08-21 01:06: player (214,3276) hops to
          // (205,3275); vertical gate (211,3272/3) sits on x=211 between x=214 and
          // x=205, y within 1 — but edge-segment (a) projects backwards (nearest
          // route node IS the gate node) and hop-line (b) passes 2 tiles south of
          // the gate. Both miss; engine re-sent the same blocked walkTo forever.
          // This is the corridor-approach geometry: gate inline with the walk.
          // v229 FIX: direction-aware — the gate must be AHEAD of the player in
          // the direction of travel. Live capture 02:52: player crossed the open
          // gate (x 211→212) heading to (218,3282); check (c)'s bbox still matched
          // (gate x=211 ∈ [210,220]) → handler re-engaged on the WRONG side →
          // clicked the open gate (id 58 walkto) endlessly, server walking him
          // back to the gate column each time. Rule: engage only when the gate is
          // between, i.e. sign(target - gate) == sign(gate - player) on the axis.
          if (!hit) {
            var ahead;
            if (g.axis === 'y') {
              ahead = ((nxt.y > g.y) && (py < g.y)) || ((nxt.y < g.y) && (py > g.y)) || (py === g.y);
            } else {
              ahead = ((nxt.x > g.x) && (px < g.x)) || ((nxt.x < g.x) && (px > g.x)) || (px === g.x);
            }
            if (ahead) {
              if (g.axis === 'y' && Math.abs(g.x - px) <= 4) hit = true;   // vertical gate ahead
              if (g.axis === 'x' && Math.abs(g.y - py) <= 4) hit = true;   // horizontal gate ahead
            }
          }
          if (hit) {
            // v225 FIX: the beyond-node must NOT be a gate tile. `nxt` here is
            // frequently the node ON the gate column (211,3273 — gate 57 spans
            // y 3272-3273), so using it as the walk-through target sends the
            // player into the very wall we're opening. Use the node AFTER nxt
            // when nxt sits on the gate column; otherwise nxt itself.
            // v228 FIX: `after` can ALSO be the gate tile (surface door: route
            // ...→(216,468)→(218,464)→(218,465), nxt=(218,464), after=(218,465)
            // = the door itself), and at the route end there is no after-node at
            // all → fallback used nxt = gate tile → "walk through" = walk onto
            // our own tile → trivial success → re-click loop (live 2026-08-21
            // 01:22, player oscillating on open door tile). NEVER target the
            // gate tile or any tile within 1 of the gate on its cross axis.
            var bxx = nxt.x, byy = nxt.y;
            var after = route[bestIdx + 2];
            if (after) { bxx = after.x; byy = after.y; }
            // v228: a beyond-tile outside the client's LOADED REGION is unroutable —
            // the pathfinder (Dg) returns undefined and nothing moves (live 2026-08-21
            // 01:33: beyond (188,3275) → local x −4 → walk silently dropped while
            // the engine alternated click/walk forever). Region base = mc.du/dd,
            // usable local range ≈ [2,90].
            var mcR = getMC();
            var rBaseX = mcR ? (mcR.du || 0) : 0;
            var rBaseZ = mcR ? (mcR.dd || 0) : 0;
            var badBeyond = function(txx, tyy) {
              var lx = txx - rBaseX, lz = tyy - rBaseZ;
              if (lx < 2 || lx > 90 || lz < 2 || lz > 90) return true;
              if (Math.abs(txx - g.x) <= 1 && Math.abs(tyy - g.y) <= 1) return true;
              if (g.axis === 'y' && Math.abs(txx - g.x) <= 1 && Math.abs(tyy - g.y) <= 2) return true;
              if (g.axis === 'x' && Math.abs(tyy - g.y) <= 1 && Math.abs(txx - g.x) <= 2) return true;
              return false;
            };
            if (badBeyond(bxx, byy)) {
              // v228: find the first route node ≥4 tiles past the gate (the far
              // side, direction of travel). Route nodes sit on verified-clear
              // tiles, so this is always walkable. Axis mapping (must match
              // _edgeSide): axis 'x' gates flip side on X → beyond differs in X;
              // axis 'y' boundary doors flip side on Y → beyond differs in Y.
              var farNode = null;
              for (var fi = bestIdx + 1; fi < route.length; fi++) {
                var fn = route[fi];
                if (Math.abs(fn.x - g.x) + Math.abs(fn.y - g.y) >= 4) { farNode = fn; break; }
              }
              if (farNode && !badBeyond(farNode.x, farNode.y)) {
                bxx = farNode.x; byy = farNode.y;
              } else {
                // last resort: synthesize 2 tiles past the gate on the CROSS axis
                // (the axis _edgeSide measures — that's the direction of crossing)
                // v232 FIX: when nxt IS the gate node (nxt.y === g.y), the old
                // fallback used `py > g.y` — the PLAYER'S side — synthesizing a
                // beyond tile BEHIND the player (surface door: player south at
                // (218,466) → beyond (218,467) → walk AWAY → handler re-engages →
                // toggles the open door shut → oscillation, sim + live 01:22).
                // Derive the crossing direction from the DESTINATION side of the
                // route instead: the first node ≥4 past the gate, else the final
                // destination itself — never the player's position.
                var dirNode = route[route.length - 1];
                for (var di2 = bestIdx + 1; di2 < route.length; di2++) {
                  if (Math.abs(route[di2].x - g.x) + Math.abs(route[di2].y - g.y) >= 4) { dirNode = route[di2]; break; }
                }
                if (g.axis === 'y') {
                  var cy = (dirNode.y > g.y) ? 1 : (dirNode.y < g.y) ? -1 : ((py > g.y) ? -1 : 1);
                  bxx = g.x; byy = g.y + cy * 2;
                } else {
                  var cx = (dirNode.x > g.x) ? 1 : (dirNode.x < g.x) ? -1 : ((px > g.x) ? -1 : 1);
                  bxx = g.x + cx * 2; byy = g.y;
                }
              }
            }
            // v238 FIX: crossing-side invariant. The beyond MUST lie on the
            // opposite side of the gate from the player on the gate's cross axis.
            // Live 2026-08-22 19:40–19:45 (Barbarian return trip): hop line from
            // (218,462) to (221,473) passed 0.8 tiles from hut door (218,465)
            // (check b) → engaged; but every candidate beyond — (226,459) — was on
            // the player's OWN (north) side → the walk-through could never cross →
            // blind re-clicks toggled the OPEN door shut (onOpBound id=2 at
            // 19:41:35 / 19:44:43) → player oscillated (218,460)↔(223,457) for
            // minutes. If no opposite-side beyond exists, this route does not
            // cross the gate: do not engage at all.
            var crossPlayer = (g.axis === 'y')
                ? (py < g.y ? -1 : (py > g.y ? 1 : 0))
                : (px < g.x ? -1 : (px > g.x ? 1 : 0));
            var crossBeyond = (g.axis === 'y')
                ? (byy < g.y ? -1 : (byy > g.y ? 1 : 0))
                : (bxx < g.x ? -1 : (bxx > g.x ? 1 : 0));
            if (crossPlayer !== 0 && crossBeyond === crossPlayer) {
              continue;   // beyond on OUR side — route doesn't cross this gate
            }
            return { x: g.x, y: g.y, label: 'knownGate', bx: bxx, by: byy, axis: g.axis || 'x', boundary: !!g.boundary };
          }
        }
      }
      // v217: walk DIRECTLY to the next node. Graph nodes sit on verified-clear
      // tiles and edges were extracted from walked paths — the client pathfinder
      // routes node-to-node reliably (this is exactly what IdleRSC webwalkTowards
      // does). Straight-line sub-steps (8/12/18-tile variants) repeatedly landed
      // on blocked tiles in rock-filled rooms (pcap 2026-08-18: player ping-ponged
      // (191,3296)↔(190,3296) for 3.5 min). Sub-step ONLY genuinely long open-
      // terrain edges (>24 tiles) at 20 tiles.
      // v242b: sub-step CHOPS long edges into unverified straight-line midpoints —
      // catastrophic in the Barbarian woods where the client pathfinder happily
      // routes 40+ tiles around shifting trees but our 10-tile synthetic midpoints
      // land on tree tiles and get silently dropped (live 22:45: bank return
      // oscillated (217,447)↔(221,450) for minutes on sub-step tiles). The client
      // pathfinder is authoritative for reachability — hand it the FULL node hop
      // and let it detour. Keep a sub-step only for extreme (>48 tile) hops.
      var dd = Math.abs(nxt.x - px) + Math.abs(nxt.y - py);
      if (dd > 48) {
        return {
          x: px + Math.round((nxt.x - px) * 24 / dd),
          y: py + Math.round((nxt.y - py) * 24 / dd)
        };
      }
      return { x: nxt.x, y: nxt.y };
    }

    // Stuck-escape (v214). v213's alternating perpendicular nudge created a
    // visible ping-pong (pcap: (287,563)↔(286,562) for 5 minutes) when the hop
    // itself was unreachable. New strategy: ONE perpendicular nudge; if that
    // doesn't move us either, escape to the nearest graph NODE (not tile) that
    // lies toward the destination — graph nodes are verified walkable and
    // connected by short edges, so the next Dg call reliably paths there.
    function stuckNudge(tx, ty) {
      var px = getX(), py = getY();
      scriptState._nudgeCount = (scriptState._nudgeCount || 0) + 1;
      // v216: FIRST check for an openable door/gate blocking us (unlabeled graph
      // edges cross gates — Edgeville Dungeon Gate 57 at (186,3300) verified).
      // Cooldown 4s between open attempts (door animates + server walks us).
      // v229: skip tryOpenNearbyDoor entirely if the last attempt was rejected
      // (player still stuck at the same position 3.5s later = server "null object").
      // Without this, the engine spams atObject on a ghost/fence tile forever
      // (live: shafster at (373,558) Taverley, 03:32-03:33, 6× "null object").
      var _doorOpenPos = scriptState._doorOpenPos || { x: 0, y: 0, t: 0 };
      var _movedSinceDoor = (px !== _doorOpenPos.x || py !== _doorOpenPos.y);
      var _doorRejected = (!_movedSinceDoor && (Date.now() - _doorOpenPos.t) < 6000);
      if (_doorRejected) {
        log('Stuck — last door click rejected (null object), skipping door-opener');
      } else if (Date.now() - (scriptState._lastDoorOpen || 0) > 4000) {
        if (tryOpenNearbyDoor(tx, ty) || tryChopBlockingTree(tx, ty)) {
          scriptState._lastDoorOpen = Date.now();
          scriptState._doorOpenPos = { x: px, y: py, t: Date.now() };
          invalidateRoute();
          return;   // door opening — retry the hop next tick
        }
      }
      if (scriptState._nudgeCount <= 2) {
        var side = (scriptState._nudgeCount % 2 === 1) ? 1 : -1;
        var dx = tx - px, dy = ty - py;
        var len = Math.max(Math.abs(dx) + Math.abs(dy), 1);
        var nx = px + Math.round(-dy / len * 3 * side);
        var ny = py + Math.round(dx / len * 3 * side);
        log('Stuck on hop — nudging to (' + nx + ',' + ny + ')');
        walkTo(nx, ny);
        return;
      }
      // Nudges failed → IdleRSC unstick: "yeeting off in a random direction to
      // get unstuck" (WebWalker.java) — deterministic escapes ping-pong; random
      // ones eventually find the opening.
      var rdx = Math.floor(Math.random() * 11) - 5;   // -5..5
      var rdy = Math.floor(Math.random() * 11) - 5;
      if (scriptState._nudgeCount === 3) {
        log('Stuck — random unstick walk to (' + (getX() + rdx) + ',' + (getY() + rdy) + ')');
        walkTo(getX() + rdx, getY() + rdy);
        invalidateRoute();
        return;
      }
      // Then → walk to a graph node toward the destination
      var g = webwalkGraph(USE_GUILD);
      var bestNode = null, bestScore = Infinity;
      for (var k in g) {
        var n = g[k];
        var dNode = Math.abs(n.x - px) + Math.abs(n.y - py);
        if (dNode < 4 || dNode > 25) continue;          // reachable hop, not trivial
        var dDest = Math.abs(n.x - tx) + Math.abs(n.y - ty);
        var dHere = Math.abs(px - tx) + Math.abs(py - ty);
        if (dDest >= dHere) continue;                   // must make progress
        var score = dNode + dDest;                       // prefer near + progress
        if (score < bestScore) { bestScore = score; bestNode = n; }
      }
      if (bestNode) {
        log('Stuck — escaping to graph node (' + bestNode.x + ',' + bestNode.y + ')');
        walkTo(bestNode.x, bestNode.y);
        scriptState._nudgeCount = 0;                     // reset after escape
        invalidateRoute();                               // re-path from new position
      } else {
        // v239: last-resort ANTI-PARK escape. If no node makes forward progress
        // (pocket terrain — live 2026-08-22 20:19-20:46: shafster parked (225,459)
        // Barbarian woods 27 min, every forward hop silently dropped by the client
        // pathfinder), walking to the NEAREST node in ANY direction still moves
        // the player onto verified graph tiles, from which the router re-paths.
        // A stationary bot is the only unrecoverable state.
        var anyNode = null, anyD = Infinity;
        for (var k2 in g) {
          var n2 = g[k2];
          var d2 = Math.abs(n2.x - px) + Math.abs(n2.y - py);
          if (d2 < 2 || d2 > 30) continue;
          if (d2 < anyD) { anyD = d2; anyNode = n2; }
        }
        if (anyNode) {
          log('Stuck — no forward node; escaping to nearest node ANY direction (' + anyNode.x + ',' + anyNode.y + ')');
          walkTo(anyNode.x, anyNode.y);
          scriptState._nudgeCount = 0;
          invalidateRoute();
        } else {
          log('Stuck — no escape node found, re-pathing');
          invalidateRoute();
          scriptState._nudgeCount = 0;
        }
      }
    }

    // v216: when stuck, check nearby tiles for an openable door/gate (unlabeled
    // graph edges cross them — the pathfinder just fails). Open it with atObject.
    // v230 FIX (real): two flaws caused endless "game object wall has null object"
    // spam at Falador/Taverley (live 03:32, 04:16):
    //   (a) atObject (opcode 242) alone cannot open wall/boundary-type doors —
    //       the WORKING special-edge handler sends atBoundary + atObject together.
    //   (b) ghost tiles (client object array has scenery the server map doesn't)
    //       were re-clicked forever whenever the player moved 1 tile between stuck
    //       checks — the v230 player-position rejection never fired.
    // Fix: send BOTH opcodes, and blacklist each clicked door TILE for 30s —
    // real doors open on the first click so the cooldown never hurts a real door;
    // ghost tiles get exactly one click each, then the loop falls through to
    // nudge/escape.
    // v251: PATH CHOPPING — dynamic tree regrowth walls off mine entrances overnight
    // (live 2026-08-23 17:40-18:10: Edgeville hut ladder + door sealed by respawning
    // trees; every walk from the bank dropped; player parked at (213,465)/(225,459)
    // class pockets). Authentic solution (APOS/IdleRSC obstacle handlers): chop the
    // blocking tree. Trees are scenery ids 1/70 (GameObjectDef 'Tree', cmd1=Chop).
    // Same projection logic as doors; stump (id 4) is walkable so no re-check needed
    // beyond the standard tile blacklist.
    var CHOP_TREES = [1, 70];
    function tryChopBlockingTree(tx, ty) {
      var px = getX(), py = getY();
      var now = Date.now();
      scriptState._chopTileBlacklist = scriptState._chopTileBlacklist || {};
      for (var bk in scriptState._chopTileBlacklist) {
        if (now - scriptState._chopTileBlacklist[bk] > 60000) delete scriptState._chopTileBlacklist[bk];
      }
      var near = findObjects(CHOP_TREES, 12);
      var txv = tx, tyv = ty;
      var best = null, bestOff = Infinity;
      var vx = txv - px, vy = tyv - py;
      var vlen = Math.max(Math.abs(vx) + Math.abs(vy), 1);
      for (var i = 0; i < near.length; i++) {
        var d = near[i];
        if (scriptState._chopTileBlacklist[d.worldX + ',' + d.worldY]) continue;
        var wx = d.worldX - px, wy = d.worldY - py;
        var proj = (wx * vx + wy * vy) / vlen;
        if (proj < 0 || proj > vlen) continue;
        var cross = Math.abs(wx * vy - wy * vx) / vlen;   // perpendicular distance to line
        if (cross > 3) continue;                           // not blocking our line
        if (cross < bestOff) { bestOff = cross; best = d; }
      }
      if (best) {
        scriptState._chopTileBlacklist[best.worldX + ',' + best.worldY] = Date.now();
        log('Path blocked by tree at (' + best.worldX + ',' + best.worldY + ') — chopping');
        // v264: dead trees (obj 70) have commands [WalkTo, Chop] — Chop is command
        // index 1 → atObject2 (opcode 230). All other trees: Chop is command 0
        // (atObject, opcode 242). The old atObject(x,y,1) dropped the index and
        // sent WalkTo clicks at dead trees — never felled them.
        if (best.id === 70) atObject2(best.worldX, best.worldY);
        else atObject(best.worldX, best.worldY);
        return true;
      }
      return false;
    }

    function tryOpenNearbyDoor(tx, ty) {
      var doorFilter = {};
      for (var di = 0; di < OPENABLE_DOORS.length; di++) doorFilter[OPENABLE_DOORS[di]] = true;
      var px = getX(), py = getY();
      var now = Date.now();
      scriptState._doorTileBlacklist = scriptState._doorTileBlacklist || {};
      for (var bk in scriptState._doorTileBlacklist) {
        if (now - scriptState._doorTileBlacklist[bk] > 30000) delete scriptState._doorTileBlacklist[bk];
      }
      // Client object arrays carry only the loaded region — perfect for finding
      // the blocking door. The blocking door is the one ON the line player→target
      // (the walk failed crossing it), not necessarily adjacent. atObject makes
      // the server walk the player to the door and open it (WalkToObjectAction).
      var near = findObjects(OPENABLE_DOORS, 15);
      var txv = tx, tyv = ty;
      var bestDoor = null, bestD = Infinity;
      for (var i = 0; i < near.length; i++) {
        var d = near[i];
        if (scriptState._doorTileBlacklist[d.worldX + ',' + d.worldY]) continue;  // v230: already tried
        // is this door roughly on the line to the hop target? (projection check)
        var vx = txv - px, vy = tyv - py;
        var wx = d.worldX - px, wy = d.worldY - py;
        var vlen = Math.max(Math.abs(vx) + Math.abs(vy), 1);
        var proj = (wx * vx + wy * vy) / vlen;             // distance along the line
        if (proj < 0 || proj > vlen) continue;             // behind us / past target
        var perp = Math.abs(wx * vy - wy * vx) / vlen;     // distance from the line
        if (perp > 3) continue;                            // not blocking this line
        if (d.dist < bestD) { bestD = d.dist; bestDoor = d; }
      }
      if (bestDoor) {
        log('Opening blocking door/gate id=' + bestDoor.id + ' at (' + bestDoor.worldX + ',' + bestDoor.worldY + ')');
        atBoundary(bestDoor.worldX, bestDoor.worldY, 0);   // v230: wall-type doors need opcode 238
        atObject(bestDoor.worldX, bestDoor.worldY);
        scriptState._doorTileBlacklist[bestDoor.worldX + ',' + bestDoor.worldY] = now;
        return true;
      }
      return false;
    }

    // Find a walkable tile adjacent to (tx,ty), preferring the side facing the player.
    // Avoids any tile in the fallback rock list (unwalkable → pathfinder fails silently).
    function adjacentTileFor(tx, ty, px, py) {
      var rockTiles = {};
      for (var ri = 0; ri < fallbackCoords.length; ri++) {
        rockTiles[fallbackCoords[ri].x + ',' + fallbackCoords[ri].y] = true;
      }
      var neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      // sort by distance to player
      neighbors.sort(function(a, b) {
        var da = Math.abs(tx + a[0] - px) + Math.abs(ty + a[1] - py);
        var db = Math.abs(tx + b[0] - px) + Math.abs(ty + b[1] - py);
        return da - db;
      });
      for (var ni = 0; ni < neighbors.length; ni++) {
        var nx = tx + neighbors[ni][0], ny = ty + neighbors[ni][1];
        if (rockTiles[nx + ',' + ny]) continue;
        return { x: nx, y: ny };
      }
      return null;
    }

    // v206 special edges — ports of IdleRSC CustomLabelHandlers using our verified
    // primitives (atObject / atBoundary / talkToNpc / optionAnswer). One action,
    // then the caller waits and re-routes (position jump = edge crossed).
    // v211: compute the ACTUAL interaction tile (ladder on the player's current
    // plane), NOT the graph node. Graph nodes for ladder edges connect across
    // planes (e.g. (254,3370) underground ↔ (250,537) surface) — using the
    // destination node for the adjacency check tries to walk to the wrong plane.
    // Server-log verified: player at (254,3370), node (250,537), cheb=2833 →
    // walkTo fails silently → atObject never fires → bot frozen until manual climb.
    function edgeInteractionTile(node) {
      var py = getY();
      switch (node.label) {
        case 'miningGuildLadder':          return { x: 274, y: py < 1000 ? 566 : 3398 };
        case 'dwarvenMineFaladorEntrance': return { x: 251, y: py < 1000 ? 537 : 3369 };
        case 'dwarvenMineCannonEntrance':  return { x: 279, y: py < 1000 ? 494 : 3326 };
        case 'edgeDungeonLadder':          return { x: 215, y: py < 1000 ? 468 : 3300 };
        // v233: def-verified TRUE interaction tiles. The graph NODES are not the
        // objects — every obstacle below sits mid-edge at its own tile. Clicking
        // the node produced 'wall/action null object' spam + zombie clicks
        // (live log 2026-08-22 01:25–01:35, player oscillating mine↔(343,579)).
        // Sources: server SceneryLocs/GameObjectDef (ids/dims/dirs) + IdleRSC
        // CustomLabelHandlers.java + IdleScriptPathWalker.java ground truth.
        // dwarfTunnel ladders (def-verified: id 359 surface / 43 underground):
        //   west (Taverley)  surface (385,466) / tunnel (385,3298)
        //   east (Catherby)  surface (426,458) / tunnel (426,3290)
        case 'dwarfTunnel':
          if (getX() > 400) return { x: 426, y: py < 1000 ? 458 : 3290 };  // player at EAST end
          return { x: 385, y: py < 1000 ? 466 : 3298 };                    // player at WEST end
        // Taverley gates (scenery 138/137, type 2 — atObject, NOT atBoundary)
        case 'southFallyTavGate':          return { x: 343, y: 581 };
        case 'northFallyTavGate':          return { x: 341, y: 487 };
        // Falador west bank door (scenery 63 'doors' @ (327,552))
        case 'faladorWestBankDoor':        return { x: 327, y: 552 };
        // Varrock east bank door (scenery 63 'doors' @ (102,509) — APOS
        // S_DummyTrainer open_bank_door(): atObject(102,509) when id==64)
        case 'varrockEastBankDoor':        return { x: 102, y: 509 };
        // Boundary doors (id 1/2, mid-edge of their graph edges)
        case 'miningGuildDoor':            return { x: 268, y: 3381 };
        case 'edgeDungeonDoor':            return { x: 218, y: 465 };
        // v250: Edgeville Dungeon ladders (SceneryLocs-verified: down id6 @ (215,468),
        // up id5 @ (215,3300)). Click the ladder on the player's side of the edge.
        case 'edgeDungeonLadder':            return getY() < 1000 ? { x: 215, y: 468 } : { x: 215, y: 3300 };
        case 'catherbyChefDoor':           return { x: 435, y: 486 };
        case 'gerrantHouseDoor':           return { x: 277, y: 651 };
        case 'witchsHouseDoor':            return { x: 363, y: 494 };
        // Stepping stones: IdleRSC taverleySteppingStones() clicks the FAR stone
        // relative to approach (goingWest?395:397, 502); nodes are (391,502)/(398,500)
        case 'taverleySteppingStones':     return { x: getX() < 396 ? 395 : 397, y: 502 };
        // lummy gates: object tiles from SceneryLocs (gate id 60), not nodes
        case 'lummyNorthSheepGate':        return { x: 152, y: 615 };
        case 'lummyNorthWheatNorthGate':   return { x: 177, y: 595 };
        case 'lummyNorthWheatSouthGate':   return { x: 172, y: 607 };
        case 'lummyCabbageGate':           return { x: 148, y: 596 };
        case 'lummyEastCowGate':           return { x: 105, y: 619 };
        case 'lummyNorthCowGate':          return { x: 154, y: 593 };
        case 'lummyEastChickenGate':       return { x: 114, y: 608 };
        case 'lummyNorthChickensGate':     return { x: 158, y: 614 };
        case 'knownGate':           return { x: node.x, y: node.y };
        default: return { x: node.x, y: node.y };
      }
    }

    // v212: retry-loop special edge handler (IdleRSC climb() pattern).
    // Server GameObjectAction.java:50 silently drops atObject if player.isBusy()
    // (includes still-walking). A single atObject call after the adjacency walk is
    // often dropped → bot frozen at the ladder. IdleRSC's climb() retries every
    // ~1.3s until Y changes. We do the same: resend atObject every 1.8s until the
    // plane transitions (Y delta > 500 for ladders) or position moves past gates.
    var _specialEdgeNode = null;
    var _specialEdgeAttempts = 0;
    var _specialEdgeStartY = 0;
    var _specialEdgeStartX = 0;
    // v222: walk-first alternation state. Even attempts WALK to the beyond-node;
    // odd attempts atObject. Evidence (Aug 20 22:52:42): engine clicked an OPEN
    // gate (id 58 "close") because it never verified the gate was shut; after the
    // close, the server's walk-adjacent moved the player delta-3 → false
    // "crossed" → engine cleared the edge with the player still stuck on the
    // gate column. Never click without evidence the walk is blocked.
    var _specialEdgeStartSide = 0;   // sign of (player - gate) on the cross axis
    var _specialEdgeLastAction = ''; // v224: 'click' | 'walk' — alternate while in box
    // v236: consecutive "waiting for walk to finish" returns. The v228 stale-eu
    // fix (3.5s stationary ⇒ not walking) is defeated by periodic micro-moves
    // (antiIdle nudges / stuck-escape offsets): every position change resets the
    // stationary timer while eu stays >0 → isPlayerWalking() true forever →
    // the atObject click is unreachable code. Live 2026-08-22 17:01: player
    // frozen at (91,509) 4+ min, ZERO door clicks, drift (91,509)→(88,508) from
    // the nudges themselves. Bound the wait: after 6 consecutive waits (~6s),
    // declare the eu stale and proceed. A real walk to a stand tile completes in
    // 2-4 ticks; a server-dropped click just gets retried 1.8s later (IdleRSC
    // open() retries every 1.28s regardless of walk state).
    var _specialEdgeWaitTicks = 0;

    // v233: def-verified interaction boxes + IdleRSC enterStatic stand tiles.
    // Box = server GameObject.getObjectBoundary() for scenery type-2/3 — the
    // player MUST be inside it for atObject to execute (Mob.atObject box rule;
    // clicks from outside are zombie actions). Stand tiles taken from IdleRSC
    // CustomLabelHandlers enterStatic()/walkTo() ground truth.
    var OBSTACLE_STAND = {
      southFallyTavGate:   { minX:343, minY:580, maxX:344, maxY:582, vertical:true,  nx:343, ny:580, sx2:343, sy2:582 },
      northFallyTavGate:   { minX:341, minY:487, maxX:342, maxY:488, vertical:false, wx:341, wy:487, ex2:342, ey2:487 },
      faladorWestBankDoor: { minX:327, minY:552, maxX:328, maxY:553, vertical:false, wx:327, wy:553, ex2:328, ey2:553 },
      miningGuildDoor:     { minX:268, minY:3380, maxX:268, maxY:3381, vertical:true, nx:268, ny:3380, sx2:268, sy2:3381 },
      edgeDungeonDoor:     { minX:218, minY:464, maxX:218, maxY:466, vertical:true,  nx:218, ny:464, sx2:218, sy2:466 },
      catherbyChefDoor:    { minX:435, minY:485, maxX:435, maxY:486, vertical:true,  nx:435, ny:485, sx2:435, sy2:486 },
      gerrantHouseDoor:    { minX:277, minY:650, maxX:277, maxY:651, vertical:true,  nx:277, ny:650, sx2:277, sy2:651 },
      witchsHouseDoor:     { minX:363, minY:493, maxX:363, maxY:494, vertical:true,  nx:363, ny:493, sx2:363, sy2:494 },
      lummyNorthSheepGate:      { minX:152, minY:615, maxX:152, maxY:616, vertical:true, nx:152, ny:615, sx2:152, sy2:616 },
      lummyNorthWheatNorthGate: { minX:177, minY:595, maxX:177, maxY:596, vertical:true, nx:177, ny:595, sx2:177, sy2:596 },
      lummyNorthWheatSouthGate: { minX:172, minY:606, maxX:173, maxY:607, vertical:true, nx:172, ny:606, sx2:172, sy2:607 },
      lummyCabbageGate:         { minX:148, minY:596, maxX:148, maxY:597, vertical:true, nx:148, ny:596, sx2:148, sy2:597 },
      lummyEastCowGate:         { minX:104, minY:619, maxX:106, maxY:620, vertical:true, nx:105, ny:619, sx2:105, sy2:620 },
      lummyNorthCowGate:        { minX:154, minY:592, maxX:155, maxY:593, vertical:true, nx:154, ny:592, sx2:154, sy2:593 },
      lummyEastChickenGate:     { minX:114, minY:608, maxX:115, maxY:609, vertical:false, wx:114, wy:608, ex2:115, ey2:609 },
      lummyNorthChickensGate:   { minX:158, minY:614, maxX:158, maxY:616, vertical:true, nx:158, ny:614, sx2:158, sy2:616 }
    };

    // v233: IdleRSC-exact stand tiles — stand on OUR side, INSIDE the interaction
    // box, before clicking. Sources: CustomLabelHandlers southFallyTavGate /
    // northFallyTavGate / miningGuildDoor enterStatic params; gerrantHouseDoor /
    // catherbyChefDoor walkTo(goingNorth ? y-1 : y); lummy gates same pattern.
    // Returns null when the server walks the player itself (open() doors).
    function standTileFor(label, px, py) {
      switch (label) {
        case 'southFallyTavGate':   return py < 581   ? { x: 343, y: 580 } : { x: 343, y: 582 };
        case 'northFallyTavGate':   return px <= 341  ? { x: 341, y: 487 } : { x: 342, y: 487 };
        case 'miningGuildDoor':     return py < 3381  ? { x: 268, y: 3380 } : { x: 268, y: 3381 };
        case 'gerrantHouseDoor':    return py >= 651  ? { x: 277, y: 650 } : { x: 277, y: 651 };
        case 'catherbyChefDoor':    return py >= 486  ? { x: 435, y: 485 } : { x: 435, y: 486 };
        case 'witchsHouseDoor':     return py < 494   ? { x: 363, y: 495 } : { x: 363, y: 493 };
        case 'edgeDungeonDoor':     return py < 465   ? { x: 218, y: 464 } : { x: 218, y: 466 };
        case 'lummyNorthSheepGate':      return py >= 616 ? { x: 152, y: 615 } : { x: 152, y: 616 };
        case 'lummyNorthWheatNorthGate': return py >= 596 ? { x: 177, y: 595 } : { x: 177, y: 596 };
        case 'lummyNorthWheatSouthGate': return py >= 607 ? { x: 172, y: 606 } : { x: 172, y: 607 };
        case 'lummyCabbageGate':         return py >= 597 ? { x: 148, y: 596 } : { x: 148, y: 597 };
        case 'lummyEastCowGate':         return py >= 620 ? { x: 105, y: 619 } : { x: 105, y: 620 };
        case 'lummyNorthCowGate':        return py >= 593 ? { x: 154, y: 592 } : { x: 154, y: 593 };
        case 'lummyEastChickenGate':     return px <= 114 ? { x: 114, y: 608 } : { x: 115, y: 608 };
        case 'lummyNorthChickensGate':   return py >= 615 ? { x: 158, y: 614 } : { x: 158, y: 615 };
        // faladorWestBankDoor: scenery id 63 — server walks the player into
        // range on atObject (IdleRSC open() has no stand step) → null.
        default: return null;
      }
    }

    function handleSpecialEdge(node) {
      if (_specialEdgeNode && _specialEdgeNode.label === node.label) {
        return _trySpecialEdge();   // already retrying — continue
      }
      // v227: a KNOWN_GATES obstacle and its graph-labeled duplicate (e.g. door
      // (218,465) as knownGate + edgeDungeonDoor at (218,464)) must not fight.
      // While a knownGate for this obstacle is active, keep it and ignore the
      // labeled twin.
      if (_specialEdgeNode && _specialEdgeNode.label === 'knownGate' && node.label &&
          node.label !== 'knownGate' &&
          Math.abs(node.x - _specialEdgeNode.x) <= 2 && Math.abs(node.y - _specialEdgeNode.y) <= 2) {
        return _trySpecialEdge();
      }
      _specialEdgeNode = node;
      _specialEdgeAttempts = 0;
      _specialEdgeLastAction = '';
      _specialEdgeWaitTicks = 0;   // v236: reset wait-starvation counter per edge
      return _trySpecialEdge();
    }

    // v222→v225: which side of the gate/door is the player on? Gates block along one
    // axis; crossing means the sign flips. Raw distance deltas are NOT crossing
    // proof — the server's WalkToObjectAction walks the player 1-3 tiles
    // adjacent to the object when handling atObject, which mimics movement.
    // v225 FIX: use the gate's DECLARED axis (KNOWN_GATES.axis), not an inferred
    // one. Inference from the beyond-node direction picked the Y axis for gate
    // (211,3272) (beyond-node lies south-east), so stepping onto the stand tile
    // (210,3273) counted as a "side flip" → false crossed with the gate shut.
    // Both known gates are id 57 (1 wide, 2 tall) = VERTICAL: side = sign(px - gx).
    function _edgeSide(tile, px, py) {
      var axis = 'x';
      // v233b: def-verified axis wins. OBSTACLE_STAND.vertical=true means the
      // obstacle blocks N-S passage → sides are north/south (axis y); false
      // means E-W blocking → axis x. Inference from the beyond-node direction
      // mislabeled the south Taverley gate as X-axis on the return trip
      // (beyond (356,576) due east of the gate) → crossing never detected.
      if (_specialEdgeNode && OBSTACLE_STAND[_specialEdgeNode.label]) {
        axis = OBSTACLE_STAND[_specialEdgeNode.label].vertical ? 'y' : 'x';
      } else if (_specialEdgeNode && _specialEdgeNode.axis) axis = _specialEdgeNode.axis;
      else if (_specialEdgeNode && _specialEdgeNode.by !== undefined &&
          Math.abs(_specialEdgeNode.by - tile.y) > Math.abs(_specialEdgeNode.bx - tile.x)) {
        axis = 'y';
      }
      if (axis === 'y') return py > tile.y ? 1 : py < tile.y ? -1 : 0;
      return px > tile.x ? 1 : px < tile.x ? -1 : 0;
    }

    function _trySpecialEdge() {
      var node = _specialEdgeNode;
      if (!node) return 2000;
      var px = getX(), py = getY();
      var tile = edgeInteractionTile(node);

      // Check if we already crossed (plane transition or position moved past)
      if (_specialEdgeAttempts > 0) {
        var isLadder = (node.label === 'dwarvenMineFaladorEntrance' || node.label === 'dwarvenMineCannonEntrance' ||
            node.label === 'miningGuildLadder' || node.label === 'edgeDungeonLadder' || node.label === 'dwarfTunnel');
        if (isLadder) {
          if (Math.abs(py - _specialEdgeStartY) > 500) {
            log('Special edge ' + node.label + ': plane crossed (Y ' + _specialEdgeStartY + '→' + py + ')');
            _specialEdgeNode = null;
            invalidateRoute();
            return 2000;
          }
        } else {
          // v222: CROSSED = side flip relative to the gate. The Aug-20 failure
          // mode (click open gate → server walks player adjacent → delta≥2 →
          // false "crossed") cannot happen with side-flip: walking adjacent
          // keeps the player on the SAME side.
          // v233b: the axis comes from OBSTACLE_STAND.vertical when the label
          // is registered there (def-verified), NOT inferred from the beyond-
          // node direction. Live 2026-08-22 03:22: return trip crossed the
          // south gate (343,582)→(349,576) but the side test used axis X
          // (beyond-node (356,576) is due east) → startSide=0 → "crossed"
          // never fired → engine walked the player BACK and re-clicked the
          // open gate in a loop.
          var side = _edgeSide(tile, px, py);
          if (side !== 0 && _specialEdgeStartSide !== 0 && side !== _specialEdgeStartSide) {
            log('Special edge ' + node.label + ': crossed (side ' + _specialEdgeStartSide + '→' + side + ')');
            _specialEdgeNode = null;
            invalidateRoute();
            return 2000;
          }
          // v222: started ON the gate tile (side 0 — e.g. relogging onto a gate
          // column). Arrival near the beyond-node after a walk attempt = crossed.
          if (_specialEdgeStartSide === 0 && node.by !== undefined &&
              Math.abs(px - node.bx) + Math.abs(py - node.by) <= 3) {
            log('Special edge ' + node.label + ': crossed (was on-gate, reached beyond-node)');
            _specialEdgeNode = null;
            invalidateRoute();
            return 2000;
          }
          // v224: gate OPENED but player still on the near side (stand tile).
          // Detect: we already clicked (attempts>0) and are IN the interaction
          // box but haven't crossed. ALTERNATE click ↔ walk-through: if the last
          // action was a click, walk to the beyond-node (crosses if open); if it
          // was a walk that didn't cross (still closed), click again. This can't
          // deadlock and can't close an open gate more than once.
          var boxOk227 = node.boundary
              ? (px >= tile.x - 1 && px <= tile.x + 1 && py >= tile.y - 1 && py <= tile.y + 1)
              : (px >= tile.x - 1 && px <= tile.x + 1 && py >= tile.y && py <= tile.y + 1);
          if (node.label === 'knownGate' && _specialEdgeAttempts > 0 && node.by !== undefined && boxOk227) {
            if (_specialEdgeLastAction !== 'walk') {
              _specialEdgeLastAction = 'walk';
              log('knownGate: walking through to (' + node.bx + ',' + node.by + ')');
              walkTo(node.bx, node.by);
            } else {
              // v238: we clicked once (lastAction 'click') and the FOLLOW-UP walk
              // still didn't cross. Re-clicking is wrong twice over:
              //  (a) if the first click OPENED the door, a second click CLOSES it
              //      (boundary doors toggle — live 19:41:35/19:44:43 clicked id=2
              //      = open, shut it again) and the loop never ends;
              //  (b) if the first click did nothing, the door was never the
              //      blocker — the walk is blocked by something else.
              // Either way: DISENGAGE and let the normal walk/nudge machinery
              // find another way. (APOS open_bank_door() only ever clicks when
              // the object id says CLOSED — we have no client-side boundary
              // state, so verify-by-walk is our equivalent.)
              log('knownGate: walk blocked after click — disengaging (door not the blocker or already open)');
              _specialEdgeNode = null;
              invalidateRoute();
              return 2500;
            }
            _specialEdgeAttempts++;
            return 1800;
          }
        }
      }
      if (_specialEdgeAttempts >= 12) {
        log('Special edge ' + node.label + ': FAILED after 12 attempts');
        _specialEdgeNode = null;
        return 3000;
      }

      // v213: EXACT IdleRSC climb() pattern — do NOT walk adjacent ourselves.
      // The server's ObjectCommand handler creates a WalkToObjectAction that
      // walks the player to the object (engine comment line ~1348; WalkToAction
      // ticks until shouldExecuteInternal → atObject). Our own adjacency walk
      // makes the player isBusy() → server drops the packet (GameObjectAction:50),
      // and Dg pathfinder fails silently on blocked neighbor tiles. Correct
      // sequence: WAIT until not walking, then send atObject, repeat every ~1.5s
      // until the plane/position changes.
      if (isPlayerWalking()) {
        _specialEdgeWaitTicks++;
        if (_specialEdgeWaitTicks <= 6) {
          log('Special edge ' + node.label + ': waiting for walk to finish...');
          return 1000;
        }
        // v236: 6 consecutive waits = stale eu (see _specialEdgeWaitTicks decl).
        // Proceed to the click — the retry loop covers a genuinely-dropped one.
        log('Special edge ' + node.label + ': walk-wait exceeded 6s (stale eu) — proceeding to click');
        _specialEdgeWaitTicks = 0;
      } else {
        _specialEdgeWaitTicks = 0;
      }

      // v222: WALK-FIRST ALTERNATION for gates/doors. Even attempts try to WALK
      // to the node beyond the edge; only if that walk doesn't carry us across
      // (odd attempt) do we send the open click. This can never close an open
      // gate: if the gate is open, the walk succeeds and we cross with zero
      // clicks (side-flip detected next tick). If it's closed, the walk is
      // blocked, we send atObject, the server opens it, and the following walk
      // attempt crosses. IdleRSC enterStatic() does the same: walk → open → walk.
      var isGateOrDoor = (node.label === 'miningGuildDoor' ||
          node.label === 'edgeDungeonDoor' || node.label === 'northFallyTavGate' ||
          node.label === 'southFallyTavGate' || node.label === 'faladorWestBankDoor' ||
          node.label === 'varrockEastBankDoor' ||
          node.label === 'catherbyChefDoor' || node.label === 'gerrantHouseDoor' ||
          node.label === 'witchsHouseDoor' || node.label === 'lummyNorthSheepGate' ||
          node.label === 'lummyNorthWheatNorthGate' || node.label === 'lummyNorthWheatSouthGate' ||
          node.label === 'lummyCabbageGate' || node.label === 'lummyEastCowGate' ||
          node.label === 'lummyNorthCowGate');
      if (isGateOrDoor && node.bx !== undefined && _specialEdgeAttempts % 2 === 0) {
        // WALK attempt. v233: stand-tile discipline (IdleRSC enterStatic exact
        // pairing — stand on OUR side of the obstacle, inside its interaction
        // box, BEFORE clicking; clicks from outside the box are zombie actions,
        // harness-proven: 12 failed clicks at (343,579) with the gate box at
        // y∈[580,582]). Per-label stand pairing transcribed from IdleRSC
        // CustomLabelHandlers (southFallyTavGate/northFallyTavGate/miningGuildDoor
        // enterStatic params; others follow the same adjacent-tile rule).
        var stand = standTileFor(node.label, px, py);
        var stB = OBSTACLE_STAND[node.label];
        var inBoxNow = stB && px >= stB.minX && px <= stB.maxX && py >= stB.minY && py <= stB.maxY;
        if (stand && !inBoxNow) {
          log('Special edge ' + node.label + ': walking to stand tile (' + stand.x + ',' + stand.y + ') before clicking');
          _specialEdgeStartX = px; _specialEdgeStartY = py;
          _specialEdgeStartSide = _edgeSide(tile, px, py);
          walkTo(stand.x, stand.y);
          _specialEdgeAttempts++;
          return 1800;
        }
        // In the box already — walk through to the verified node beyond.
        log('Special edge ' + node.label + ': walk attempt through to (' + node.bx + ',' + node.by + ')');
        _specialEdgeStartX = px; _specialEdgeStartY = py;
        _specialEdgeStartSide = _edgeSide(tile, px, py);
        walkTo(node.bx, node.by);
        _specialEdgeAttempts++;
        return 1800;
      }

      // Not walking — fire atObject / atBoundary (server walks us the last tiles)
      log('Special edge: ' + node.label + ' at (' + tile.x + ',' + tile.y + ') attempt ' + (_specialEdgeAttempts + 1));
      _specialEdgeStartX = px; _specialEdgeStartY = py;
      _specialEdgeStartSide = _edgeSide(tile, px, py);
      switch (node.label) {
        case 'miningGuildLadder':
        case 'dwarvenMineFaladorEntrance':
        case 'dwarvenMineCannonEntrance':
        case 'edgeDungeonLadder':
        case 'dwarfTunnel':
          // v253b: LADDER RANGE GUARD. The server silently drops atObject from
          // beyond adjacency (Mining plugin: withinRange(obj,1); live 18:36:
          // 60+ dropped ladder clicks at (215,468) from (218,464) — 3 tiles).
          // The Falador/Dwarven ladders only worked because their preceding
          // graph node happened to sit adjacent. Walk to an adjacent tile FIRST
          // (same stand-first discipline as the doors), then click.
          if (Math.max(Math.abs(px - tile.x), Math.abs(py - tile.y)) > 1) {
            var ladX = tile.x, ladY = tile.y;
            // pick the adjacent tile on the player's side (avoid the object col)
            var ax = px < ladX ? ladX - 1 : (px > ladX ? ladX + 1 : ladX);
            var ay = py < ladY ? ladY - 1 : (py > ladY ? ladY + 1 : ladY);
            if (Math.abs(px - ladX) <= 1 && Math.abs(py - ladY) <= 1) { ax = px; ay = py; }
            if (!(ax === px && ay === py)) {
              log('Ladder ' + node.label + ': walking adjacent to (' + ax + ',' + ay + ') before clicking');
              walkTo(ax, ay);
              return 1800;
            }
          }
          atObject(tile.x, tile.y);
          break;
        // v233: scenery gates/doors (server SceneryLocs: ids 60/63/137/138/180).
        // atObject ONLY — these are scenery, not boundaries. The old
        // atBoundary+atObject fired 'wall has null object' every attempt
        // (live log 2026-08-22 01:25+, gate 138 @ (343,581) clicked at node
        // (343,579) where no wall exists). Cross-detection: side flip on the
        // gate's axis (computed below from def dims/dir).
        case 'southFallyTavGate':
        case 'northFallyTavGate':
        case 'faladorWestBankDoor':
        case 'varrockEastBankDoor':
        case 'lummyNorthSheepGate':
        case 'lummyNorthWheatNorthGate':
        case 'lummyNorthWheatSouthGate':
        case 'lummyCabbageGate':
        case 'lummyEastCowGate':
        case 'lummyNorthCowGate':
        case 'lummyEastChickenGate':
        case 'lummyNorthChickensGate':
        case 'taverleySteppingStones':
          atObject(tile.x, tile.y);
          break;
        case 'knownGate': {
          // v224: IdleRSC enterStatic() pattern — server-source-verified.
          // GameObjectAction NEVER walks the player: it only setWalkToAction().
          // GameStateUpdater ticks shouldExecuteInternal() = Mob.atObject(obj) —
          // for type-2 objects the player must be INSIDE the object's boundary
          // box (gate 57 @ (211,3272): x∈[210,212], y∈[3272,3273]). Clicking from
          // outside the box creates a ZOMBIE action — never executes, never moves
          // the player (pcap 2026-08-20 23:26: 17 clicks from (215,3273), ZERO
          // onOpLoc). All 4 logged manual gate interactions were from INSIDE the
          // box. So: WALK to the stand tile beside the gate FIRST (on our side,
          // axis-aligned, 1 tile from the gate column), then click.
          // v227: boundary doors (g.boundary, e.g. (218,465)) block on the Y axis:
          // stand tiles are directly N/S of the door tile; click atBoundary+atObject.
          if (node.boundary) {
            var bSide = (py > tile.y) ? 1 : -1;         // approaching from N or S
            var bStand = tile.y + bSide;                 // tile adjacent, our side
            var bInBox = (px >= tile.x - 1 && px <= tile.x + 1 &&
                          py >= tile.y - 1 && py <= tile.y + 1);
            if (!bInBox) {
              // v240: if the stand-tile walk itself is blocked (runtime trees —
              // live 22:02: (219,471)→(218,466) silently dropped every tick,
              // FAILED×12 loop with the disengage never firing because the walk
              // never "finished"), bail after 3 stand-walk attempts: blacklist
              // this gate 60s and let the walk machinery route around.
              scriptState._gateStandFails = (scriptState._gateStandFails || 0) + 1;
              if (scriptState._gateStandFails >= 3) {
                log('knownGate: stand tile unreachable 3× — blacklisting gate 60s');
                scriptState._doorTileBlacklist = scriptState._doorTileBlacklist || {};
                scriptState._doorTileBlacklist[tile.x + ',' + tile.y] = Date.now();
                _specialEdgeNode = null;
                scriptState._gateStandFails = 0;
                invalidateRoute();
                return 2500;
              }
              _specialEdgeStartSide = bSide;
              log('knownGate(boundary): walking to stand tile (' + tile.x + ',' + bStand + ') before clicking');
              walkTo(tile.x, bStand);
              break;
            }
            scriptState._gateStandFails = 0;
            atBoundary(tile.x, tile.y, 0);
            _specialEdgeLastAction = 'click';
            break;
          }
          // v238: NON-boundary knownGates only below. (The old unconditional
          // atObject+atBoundary pair on pure boundary doors produced the
          // 'game object action null object' spam — boundary tiles have NO
          // scenery, atObject is always a null click there.)
          var side4 = (px > tile.x) ? 1 : -1;
          // Gate 57 is vertical (h=2): stand tile = gate.x + side, y = gate.y or
          // gate.y+1 (both are in the box and both are corridor tiles)
          var standX4 = tile.x + side4;
          var standY4 = (py <= tile.y) ? tile.y : tile.y + 1;
          // clamp into the box (x∈[gx-1, gx+1])
          if (standX4 < tile.x - 1) standX4 = tile.x - 1;
          if (standX4 > tile.x + 1) standX4 = tile.x + 1;
          var inBox4 = (px >= tile.x - 1 && px <= tile.x + 1 && py >= tile.y && py <= tile.y + 1);
          if (!inBox4) {
            // Phase 1: walk to the stand tile on our side — NO click yet.
            // v225 FIX: record the approach side FIRST. Without this, the
            // v222 "was on-gate" check (StartSide===0 + near beyond-node)
            // false-fired the moment we ARRIVED at the stand tile (1 tile
            // from the gate node) and declared a crossing that never happened
            // → route resumed into the closed-gate wall → silent freeze
            // (server log 2026-08-20 23:52–23:56: player parked (197,3274),
            // zero engine packets).
            _specialEdgeStartSide = side4;
            log('knownGate: walking to stand tile (' + standX4 + ',' + standY4 + ') before clicking');
            walkTo(standX4, standY4);
            break;
          }
          // Phase 2: in the box — click the gate
          atObject(tile.x, tile.y);
          _specialEdgeLastAction = 'click';
          break;
        }
        case 'miningGuildDoor':
        case 'edgeDungeonDoor':
        case 'catherbyChefDoor':
        case 'gerrantHouseDoor':
        case 'witchsHouseDoor': {
          // v233: TRUE boundary doors (BoundaryLocs id 1/2 at the def-verified
          // tiles). atBoundary ONLY — SceneryLocs shows NO scenery on these
          // tiles, so the old unconditional atObject produced the paired
          // 'game object action null object' spam (IdleRSC open() guards:
          // atWallObject only when getWallObjectIdAtCoord != -1).
          // The server walks the player into the boundary interaction range
          // (WalkToBoundaryAction), so no same-tick walkTo before the click.
          atBoundary(tile.x, tile.y, 0);
          break;
        }
        case 'alkharidGate': {
          var guardId = px >= 92 ? 162 : 161;
          var g = findNpcs([guardId], 8);
          if (g.length > 0) { talkToNpc(g[0].serverIndex); scriptState._gateDialog = Date.now(); }
          else { walkTo(92, py); }
          break;
        }
        default: walkTo(tile.x, tile.y);
      }
      _specialEdgeAttempts++;
      return 1800;   // retry: IdleRSC climb() sleeps 1280ms between atObject calls
    }
    return function() {
      if (!isLoggedIn()) return 5000;

      // Fatigue / sleeping bag — same as combat script
      if (getIsSleeping()) {
        if (!scriptState.sleepTyping) {
          scriptState.sleepTyping = true;
          var sleepWord = 'asleep';
          for (var ci3 = 0; ci3 < sleepWord.length; ci3++) {
            window.__r2hTypeChar(sleepWord[ci3]);
          }
          setTimeout(function() {
            window.__r2hTypeSpecial('Enter');
            scriptState.sleepTyping = false;
          }, 500);
        }
        return 2000;
      }
      var fatigue = getFatigue();
      if (fatigue >= 90) {
        var bagSlot = getInventoryIndex(SLEEPING_BAG);
        if (bagSlot >= 0) {
          log('Fatigue ' + fatigue + '% — using sleeping bag');
          useItem(bagSlot);
          return 3000;
        }
      }

      // ── ORIENTATION: if the player starts the bot anywhere that isn't the mine,
      // walk to the right place first. Full inventory (or carrying ore) → go to the
      // bank. Empty inventory → go to the mine. Runs only ONCE at script start
      // (until the player reaches the mine); after that, normal gather/banking runs.
      if (!scriptState._oriented) {
        if (!MINE_AREA_CENTER) {
          // Use the server-verified clear standing tile INSIDE the mine —
          // never a computed average (rounding can land on a rock tile,
          // e.g. (277,377) IS a rock → pathfinder fails silently).
          MINE_AREA_CENTER = {x: MINE_STAND[0], y: MINE_STAND[1]};
        }
        var oX = getX(), oY = getY();
        var distToMine = Math.abs(oX - MINE_AREA_CENTER.x) + Math.abs(oY - MINE_AREA_CENTER.y);
        if (distToMine > 12) {
          // Far from the mine — need to travel first.
          // Ore in inventory → bank it. No ore → go mine.
          var hasOre = false;
          var ORE_CHECK = [155, 157, 158, 150, 202, 151, 153, 152, 154, 383, 160, 161, 162, 163];
          for (var oi0 = 0; oi0 < ORE_CHECK.length && !hasOre; oi0++) {
            if (getInventoryIndex(ORE_CHECK[oi0]) >= 0) hasOre = true;
          }
          if (hasOre) {
            log('Orientation: carrying ore far from mine — entering banking mode');
            scriptState.phase = 'banking';
            scriptState._oriented = true;  // banking state machine takes over fully
            scriptState.minePos = {x: MINE_AREA_CENTER.x, y: MINE_AREA_CENTER.y};
            scriptState._bankPhase = 'delay';
            scriptState._bankDelay = 2;
            scriptState._bankStuckTicks = 0;
            scriptState._bankRouteSent = false;
            return 1000;
          }
          // No ore — walk to the mine (re-paths in 30-tile steps via client pathfinder)
          // Combat handling: wait out the 3-round retreat restriction (~1.8s), then
          // send the walk as a server-side RETREAT to escape aggressive NPCs.
          var omc = getMC();
          var og8 = (omc && omc.O) ? (omc.O.g8 || 0) : 0;
          if (og8 >= 8) {
            if (!scriptState._orCombatSince) scriptState._orCombatSince = Date.now();
            if (Date.now() - scriptState._orCombatSince < 4000) {
              return 2000;  // Still within the no-retreat window
            }
            log('Orientation: retreating from combat');
          } else {
            scriptState._orCombatSince = 0;
          }
          if (!scriptState._toMineSent || scriptState._toMineStuck >= 3 ||
              Date.now() - (scriptState._toMineLastWalkAt || 0) > 3200) {
            // Edge-by-edge webwalk toward the mine (same fix as banking walks —
            // straight-line 30-tile hops freeze in obstacle-dense terrain)
            var oRoute = routeTo(MINE_AREA_CENTER.x, MINE_AREA_CENTER.y);
            var oTarget = oRoute ? nextRouteTarget(oRoute, MINE_AREA_CENTER) : MINE_AREA_CENTER;
            // v219: handle special edges (ladders, gates, doors) — SAME checks as
            // the banking/return walks (lines 2023/2185). Without these, the
            // orientation walk ignored edge labels and did walkTo(gateTile) /
            // walkTo(ladderTile) directly → engine never sent atObject → user had
            // to manually climb ladders and open gates (pcap 2026-08-18 02:04:36:
            // zero atObject for ladder or gate, 9 walkTo(211,3272) = gate tile).
            if (oTarget.label) { return handleSpecialEdge(oTarget); }
            if (_specialEdgeNode) { return _trySpecialEdge(); }
            if (scriptState._toMineSent && scriptState._toMineStuck >= 3) {
              stuckNudge(oTarget.x, oTarget.y);
            } else {
              log('Orientation: walking to mine via (' + oTarget.x + ',' + oTarget.y + ') dist=' + distToMine);
              walkTo(oTarget.x, oTarget.y);
            }
            scriptState._toMineSent = true;
            // v252b: do NOT reset _toMineStuck here — the 3.2s re-send ran every
            // cycle and zeroed the counter before it could reach 3, so stuckNudge
            // (and the v251 tree-chop) NEVER fired on a dropped orientation walk
            // (live 18:30: parked at (217,447), 15+ identical walkTo(216,468)).
            // The counter is reset ONLY when the player actually moves (tracking
            // block below does that).
            if (!scriptState._toMineLastX) { scriptState._toMineLastX = oX; }
            if (!scriptState._toMineLastY) { scriptState._toMineLastY = oY; }
            scriptState._toMineLastWalkAt = Date.now();
            return 3000;
          }
          // Stuck tracking for the orientation walk
          if (oX !== (scriptState._toMineLastX || 0) || oY !== (scriptState._toMineLastY || 0)) {
            scriptState._toMineStuck = 0;
            scriptState._toMineLastX = oX;
            scriptState._toMineLastY = oY;
          } else {
            scriptState._toMineStuck++;
          }
          return 1500;
        }
        // Near the mine — orientation done
        scriptState._oriented = true;
        log('Orientation complete — at the mine, starting gather');
      }

      // ── v206 POWER-MINE: drop ores instead of banking ──
      if (POWER_MINE && getInventoryCount() >= 28 && scriptState.phase !== 'banking') {
        for (var di = 0; di < ORE_ITEM_IDS.length; di++) {
          var dropSlot = getInventoryIndex(ORE_ITEM_IDS[di]);
          if (dropSlot >= 0) {
            log('Power-mine: dropping ore id=' + ORE_ITEM_IDS[di]);
            dropItem(dropSlot);
            return 800;  // one drop per tick
          }
        }
        return 800;  // nothing left to drop — resume mining
      }

      if (getInventoryCount() >= 30 && scriptState.phase !== 'banking') {
        var _heldOrePre = false;
        var _OG2 = [155, 157, 158, 150, 202, 151, 153, 152, 154, 383, 160, 161, 162, 163];
        for (var _og2 = 0; _og2 < _OG2.length && !_heldOrePre; _og2++) {
          if (getInventoryIndex(_OG2[_og2]) >= 0) _heldOrePre = true;
        }
        if (!_heldOrePre && (!scriptState._noOreWarn || Date.now() - scriptState._noOreWarn > 30000)) {
          scriptState._noOreWarn = Date.now();
          log('Inventory reads full but NO ores held (ghost slots) — skipping empty bank run');
        }
      }
      // v247 FIX: ghost-slot guard. The client inventory desyncs BOTH ways
      // (live 2026-08-23: cU=1 with 30 real items at Al-Kharid; AND 23 real
      // items reading as 30 after a deposit at Dwarven Mine — bank deposits
      // leave stale b4 slots). A count alone can never be trusted: bank ONLY
      // when a depositable ore/gem is actually HELD. This kills the empty-bank
      // loop (down→up→banker→deposit-0→repeat) in every client version.
      var _heldOre = false;
      var _ORE_GATE = [155, 157, 158, 150, 202, 151, 153, 152, 154, 383, 160, 161, 162, 163];
      for (var _ogi = 0; _ogi < _ORE_GATE.length && !_heldOre; _ogi++) {
        if (getInventoryIndex(_ORE_GATE[_ogi]) >= 0) _heldOre = true;
      }
      if ((getInventoryCount() >= 30 && _heldOre) || scriptState.phase === 'banking') {
        // ══ BANKING STATE MACHINE ══
        // Sub-phases: delay → walk → talk → option → deposit → close → return_walk → done
        var BANK = {x: BANK_TILE[0], y: BANK_TILE[1]};
        var CUR_X = getX(), CUR_Y = getY();
        var curDist = Math.abs(CUR_X - BANK.x) + Math.abs(CUR_Y - BANK.y);

        // ── INIT: enter banking mode ──
        if (scriptState.phase !== 'banking') {
          // minePos = the verified standing tile inside the mine, NOT the player's
          // position (restart mid-trip would save a wrong location) and NOT a
          // computed average (rounding can land on a rock tile → unwalkable).
          if (!MINE_AREA_CENTER) {
            MINE_AREA_CENTER = {x: MINE_STAND[0], y: MINE_STAND[1]};
          }
          scriptState.minePos = {x: MINE_AREA_CENTER.x, y: MINE_AREA_CENTER.y};
          scriptState.phase = 'banking';
          scriptState._bankPhase = 'delay';
          scriptState._bankDelay = 2;
          scriptState._bankStuckTicks = 0;
          scriptState._bankLastDist = curDist;
          scriptState._bankRouteSent = false;
          scriptState._bankWasInCombat = false;
          scriptState._bankAltTileTried = false;
          log('Inventory full — banking: return target = mine center (' + scriptState.minePos.x + ',' + scriptState.minePos.y + ')');
        }

        // ── Combat check + RETREAT: while traveling, don't fight — retreat ──
        // Scorpion/skeleton fights take 2+ min at this combat level. The server's
        // WalkRequest treats a walk packet after the first 3 combat rounds (~1.8s)
        // as a RETREAT: it breaks combat and sets CombatState.RUNNING, which gives
        // 5 ticks of NPC re-aggro immunity. So after 4s of combat we send the walk
        // anyway — the player escapes instead of grinding through each fight.
        // NOTE: we track time since combat FIRST SEEN in this engagement window,
        // not continuous combat — g8 dips between staggered skeleton attacks
        // would otherwise reset the timer forever (pcap-confirmed bug).
        var pMC = getMC();
        var playerG8 = (pMC && pMC.O) ? (pMC.O.g8 || 0) : 0;
        var inCombat = playerG8 >= 8;
        var shouldRetreat = false;
        if (inCombat) {
          if (!scriptState._combatSince) scriptState._combatSince = Date.now();
          if (!scriptState._combatUntil) scriptState._combatUntil = Date.now();
          scriptState._combatUntil = Date.now();  // extend the engagement window
          if (Date.now() - scriptState._combatSince > 4000) {
            // Past the 3-round retreat restriction — walking now = server-side retreat
            shouldRetreat = true;
          }
          if (Date.now() - scriptState._combatSince > 45000) {
            log('Combat flag stuck >45s — forcing recovery walk');
            inCombat = false;
            shouldRetreat = true;
            scriptState._combatSince = 0;
          }
        } else {
          // Combat paused — only fully reset if it's been quiet for >8s
          // (staggered skeleton re-attacks happen within ~5s of each other)
          if (scriptState._combatUntil && Date.now() - scriptState._combatUntil > 8000) {
            scriptState._combatSince = 0;
            scriptState._combatUntil = 0;
          }
        }

        // ── v206 Al-Kharid gate dialog: pay toll (option 2) until crossed ──
        if (scriptState._gateDialog) {
          if (Date.now() - scriptState._gateDialog > 2500) {
            optionAnswer(2);   // "Pay 10gp"
            scriptState._gateDialog = Date.now();
          }
          // Crossed once past x=92 in the right direction, or after 12s give up
          if (Date.now() - scriptState._gateDialog > 12000 || Math.abs(CUR_X - 92) > 4) {
            scriptState._gateDialog = 0;
            invalidateRoute();
          }
          return 2000;
        }

        // ── Determine the current target for phase-aware stuck tracking ──
        // During 'walk': target = bank. During 'return_walk': target = mine.
        var bp = scriptState._bankPhase;
        var trackTargetX = BANK.x, trackTargetY = BANK.y;
        if (bp === 'return_walk') {
          trackTargetX = scriptState.minePos.x;
          trackTargetY = scriptState.minePos.y;
        }
        var trackDist = Math.abs(CUR_X - trackTargetX) + Math.abs(CUR_Y - trackTargetY);

        // ── DISTANCE TRACKING (phase-aware, for stuck detection) ──
        // Track the player's ACTUAL position to detect real movement, not just g8.
        // g8 oscillates between combat rounds which causes false "combat ended" triggers.
        if (CUR_X !== (scriptState._bankLastX || 0) || CUR_Y !== (scriptState._bankLastY || 0)) {
          // Player actually moved — reset stuck counter
          scriptState._bankStuckTicks = 0;
          scriptState._bankLastX = CUR_X;
          scriptState._bankLastY = CUR_Y;
          scriptState._bankLastDist = trackDist;
        } else if (!inCombat && (bp === 'walk' || bp === 'return_walk')) {
          // Player hasn't moved and isn't in combat — count as stuck
          scriptState._bankStuckTicks++;
        }
        // In combat: don't increment stuck ticks

        // ── DELAY: wait 2 ticks so server's isBusy() clears ──
        if (bp === 'delay') {
          if (scriptState._bankDelay > 0) {
            scriptState._bankDelay--;
            return 1500;
          }
          scriptState._bankPhase = 'walk';
          return 500;
        }

        // ── WALK TO BANK: walk toward bank in short steps using client pathfinder ───
        // The client pathfinder can only reach within its loaded region (~48 tiles).
        // So we walk to a point ~30 tiles toward the bank each tick — close enough
        // for the pathfinder to route around obstacles, far enough to make progress.
        // No hardcoded waypoints — direction is always toward the bank coordinates.
        if (bp === 'walk') {
          // Arrived at bank?
          if (curDist <= 2) {
            log('Arrived at bank — talking to banker');
            scriptState._bankPhase = 'talk';
            scriptState._bankRouteSent = false;
            return 1000;
          }
          // During combat: wait out the 3-round retreat restriction, then the
          // walk below fires as a server-side RETREAT (breaks combat + aggro immunity)
          if (inCombat && !shouldRetreat) {
            return 2000;
          }
          if (inCombat && shouldRetreat) {
            log('Retreating from combat — walking to bank');
          }
          // Walk to a point 30 tiles toward the bank (or the bank itself if closer)
          // Edge-by-edge webwalk (IdleRSC pattern): send the next hop whenever
          // idle, and RE-SEND it every ~3s — a fresh Dg call per hop keeps every
          // pathfinder call short. If we haven't moved between sends, nudge.
          var wRoute = routeTo(BANK.x, BANK.y);
          var wTarget = wRoute ? nextRouteTarget(wRoute, { x: BANK.x, y: BANK.y }) : { x: BANK.x, y: BANK.y };
          if (wTarget.label) { return handleSpecialEdge(wTarget); }
          // If we're mid-climb (retry loop active), continue retrying
          if (_specialEdgeNode) { return _trySpecialEdge(); }
          if (!scriptState._bankRouteSent || scriptState._bankStuckTicks >= 3 || shouldRetreat ||
              Date.now() - (scriptState._bankLastWalkAt || 0) > 3200) {
            if (scriptState._bankRouteSent && !scriptState._bankMovedSinceSend) {
              stuckNudge(wTarget.x, wTarget.y);      // same hop didn't move us — offset and retry
            } else {
              log('Walking to bank via (' + wTarget.x + ',' + wTarget.y + ') from (' + CUR_X + ',' + CUR_Y + ')');
              walkTo(wTarget.x, wTarget.y);
            }
            scriptState._bankRouteSent = true;
            scriptState._bankStuckTicks = 0;
            scriptState._bankMovedSinceSend = false;
            scriptState._bankSendX = CUR_X;   // sentinel — tracker's _bankLastX is
            scriptState._bankSendY = CUR_Y;   // updated every tick, can't reuse it
            scriptState._bankLastWalkAt = Date.now();
            return 3000;
          }
          // movement since send? (compare vs position AT SEND, not the tracker's)
          if (CUR_X !== (scriptState._bankSendX || -9999) || CUR_Y !== (scriptState._bankSendY || -9999)) {
            scriptState._bankMovedSinceSend = true;
          }
          return 1500;
        }

        // ── TALK TO BANKER: find banker NPC, send talk packet ──
        if (bp === 'talk') {
          var BANKER_IDS = [95, 224, 268, 485, 540, 617];
          var banker = findNpcs(BANKER_IDS, 3);
          if (banker.length > 0) {
            scriptState._bankerMisses = 0;
            scriptState._bankerMissRounds = 0;
            log('Talking to banker (idx=' + banker[0].serverIndex + ')');
            talkToNpc(banker[0].serverIndex);
            scriptState._bankTimer = Date.now();
            scriptState._bankTalkStart = Date.now();
            scriptState._bankPhase = 'option';
            return 2000;  // Wait for dialogue to appear
          }
          log('No banker nearby — walking closer');
          walkTo(BANK.x, BANK.y);
          scriptState._bankerMisses = (scriptState._bankerMisses || 0) + 1;
          if (scriptState._bankerMisses >= 8) {
            // Bankers can be behind the bank booth — nudge one tile toward map center
            // of the bank cluster; if still nothing after 16 misses, fail loudly.
            scriptState._bankerMisses = 0;
            scriptState._bankerMissRounds = (scriptState._bankerMissRounds || 0) + 1;
            if (scriptState._bankerMissRounds >= 2) {
              log('ERROR: no banker found after 16 attempts — check bank coords');
            } else {
              walkTo(BANK.x + 1, BANK.y + 1);
            }
          }
          return 1500;
        }

        // ── SELECT BANK OPTION: send dialogue answer 0 immediately ──
        // IdleRSC pattern: talkToNpc → wait 640ms → optionAnswer(0) → wait for bank open
        if (bp === 'option') {
          if (isInBank()) {
            // Bank already open — skip to deposit
            log('[BANK DEBUG] bank is open — proceeding to deposit');
            scriptState._bankPhase = 'deposit';
            return 500;
          }
          // Resend dialogue answer every 2s until bank opens
          if (Date.now() - scriptState._bankTimer > 2000) {
            log('Sending bank dialogue option 0');
            optionAnswer(0);
            scriptState._bankTimer = Date.now();
          }
          // After 10s with no bank open, retry the whole talk
          if (Date.now() - (scriptState._bankTalkStart || 0) > 10000) {
            log('Bank still not open after 10s — retrying talk');
            scriptState._bankPhase = 'talk';
          }
          return 1500;
        }

        // ── DEPOSIT: bank should be open, deposit all ore ──
        if (bp === 'deposit') {
          if (!isInBank()) {
            // Bank not open yet — wait or retry talk
            if (Date.now() - (scriptState._bankTimer || 0) > 8000) {
              log('Bank still not open after 8s — retrying talk');
              scriptState._bankPhase = 'talk';
            }
            return 1500;
          }
          // Bank is open — deposit coal ore (ID 158) and other ores
          var ORE_IDS = [155, 157, 158, 150, 202, 151, 153, 152, 154, 383, 160, 161, 162, 163]; // v228: server ItemDefs-verified — coal 155, copper 150, tin 202, iron 151, gold 152, mith 153, addy 154, silver 383; uncut gems 157/158/160 + cut 161/162/163. REMOVED 156 (Bronze Pickaxe!) and 243 (Soft Clay) — old list banked the pickaxe.
          var deposited = 0;
          // v248 DEAD-STOP guard: bank open, nothing depositable, nothing deposited
          // last time either → this run can never produce ore (no pickaxe / wrong
          // rocks / junk-filled inventory). Lapping forever (live: 20+ empty
          // bank↔mine round-trips at Dwarven Mine 00:48–02:41) helps nobody.
          if (deposited === 0 && scriptState._lastDepositCount === 0) {
            var _heldNow = false;
            var _OG3 = [155, 157, 158, 150, 202, 151, 153, 152, 154, 383, 160, 161, 162, 163];
            for (var _og3 = 0; _og3 < _OG3.length && !_heldNow; _og3++) {
              if (getInventoryIndex(_OG3[_og3]) >= 0) _heldNow = true;
            }
            if (!_heldNow) {
              log('STOP: banked twice with zero ores — no pickaxe, wrong rock selection, or inventory full of non-ore items. Fix inventory/rocks and restart.');
              stopBot();
              return 3000;
            }
          }
          scriptState._lastDepositCount = 0;
          log('[BANK DEBUG] deposit phase: invCount=' + getInventoryCount());
          for (var oi = 0; oi < ORE_IDS.length; oi++) {
            var oreId = ORE_IDS[oi];
            for (var slot = 0; slot < getInventoryCount(); slot++) {
              if (getInventoryId(slot) === oreId) {
                log('[BANK DEBUG] depositing ore id=' + oreId + ' (found in slot ' + slot + ')');
                depositItem(oreId, 9999); // Deposit all of this type
                deposited++;
                break; // One deposit call per ore type
              }
            }
          }
          scriptState._lastDepositCount = deposited;
          log('Deposited ' + deposited + ' ore types — closing bank');
          closeBank();
          scriptState._bankPhase = 'close';
          scriptState._bankTimer = Date.now();
          return 1500;
        }

        // ── CLOSE: wait for bank to close ──
        if (bp === 'close') {
          if (isInBank() && Date.now() - (scriptState._bankTimer || 0) > 3000) {
            // Force close if still open
            closeBank();
            return 1000;
          }
          if (!isInBank() || Date.now() - (scriptState._bankTimer || 0) > 5000) {
            log('Bank closed — walking back to mine');
            scriptState._bankRouteSent = false;
            var mineDist0 = Math.abs(CUR_X - scriptState.minePos.x) + Math.abs(CUR_Y - scriptState.minePos.y);
            scriptState._bankLastDist = mineDist0;
            scriptState._bankStuckTicks = 0;
            scriptState._bankAltTileTried = false;
            // 2-tick delay before first walk — clears server's isBusy() after bank close
            scriptState._bankDelay = 2;
            scriptState._bankPhase = 'return_delay';
          }
          return 1500;
        }

        // ── RETURN DELAY: wait 2 ticks after closing bank ──
        if (bp === 'return_delay') {
          if (scriptState._bankDelay > 0) {
            scriptState._bankDelay--;
            return 1500;
          }
          scriptState._bankPhase = 'return_walk';
          return 500;
        }

        // ── RETURN WALK: walk toward mine in short steps ──
        if (bp === 'return_walk') {
          var mineDist = Math.abs(CUR_X - scriptState.minePos.x) + Math.abs(CUR_Y - scriptState.minePos.y);
          if (mineDist <= 8) {
            log('Arrived back at mine — resuming mining');
            scriptState.phase = 'gather';  // Resume gathering
            return 1000;
          }
          // During combat: wait out the 3-round restriction, then walk = retreat
          if (inCombat && !shouldRetreat) {
            return 2000;
          }
          if (inCombat && shouldRetreat) {
            log('Retreating from combat — walking to mine');
          }
          // Edge-by-edge webwalk (same as bank walk): re-send next hop ~every 3s,
          // nudge when a hop doesn't move us.
          var rRoute = routeTo(scriptState.minePos.x, scriptState.minePos.y);
          var rTarget = rRoute ? nextRouteTarget(rRoute, scriptState.minePos) : { x: scriptState.minePos.x, y: scriptState.minePos.y };
          if (rTarget.label) { return handleSpecialEdge(rTarget); }
          if (_specialEdgeNode) { return _trySpecialEdge(); }
          if (!scriptState._bankRouteSent || scriptState._bankStuckTicks >= 3 || shouldRetreat ||
              Date.now() - (scriptState._bankLastWalkAt || 0) > 3200) {
            if (scriptState._bankRouteSent && !scriptState._bankMovedSinceSend) {
              stuckNudge(rTarget.x, rTarget.y);
            } else {
              log('Walking to mine via (' + rTarget.x + ',' + rTarget.y + ') from (' + CUR_X + ',' + CUR_Y + ')');
              walkTo(rTarget.x, rTarget.y);
            }
            scriptState._bankRouteSent = true;
            scriptState._bankStuckTicks = 0;
            scriptState._bankMovedSinceSend = false;
            scriptState._bankSendX = CUR_X;
            scriptState._bankSendY = CUR_Y;
            scriptState._bankLastWalkAt = Date.now();
            return 3000;
          }
          if (CUR_X !== (scriptState._bankSendX || -9999) || CUR_Y !== (scriptState._bankSendY || -9999)) {
            scriptState._bankMovedSinceSend = true;
          }
          return 1500;
        }

        return 1500;
      }

      // ── COMBAT GUARD: server drops object-action packets while isBusy() (fighting).
      // Pcap-confirmed: mine packets sent during combat are silently discarded.
      // Engagement-window logic (same as the travel walks): skeletons attack in a
      // staggered chain, so g8 dips reset any continuous timer. We track the whole
      // engagement and after 4s total send a RETREAT walk toward the target rock's
      // adjacent tile — the server breaks combat and grants 5-tick aggro immunity.
      var gmc = getMC();
      var g8 = (gmc && gmc.O) ? (gmc.O.g8 || 0) : 0;
      if (g8 >= 8) {
        if (!scriptState._gatherCombatSince) scriptState._gatherCombatSince = Date.now();
        scriptState._gatherCombatUntil = Date.now();
        if (Date.now() - scriptState._gatherCombatSince < 4000) {
          // First 4s: wait out the 3-round no-retreat window
          if (scriptState.pendingRockCheck) scriptState.pendingRockCheck = false;
          return 2000;
        }
        // 4s+: retreat toward the nearest known rock area to break the fight chain
        if (!scriptState._gatherRetreatAt || Date.now() - scriptState._gatherRetreatAt > 5000) {
          scriptState._gatherRetreatAt = Date.now();
          var gx = getX(), gy = getY();
          // Find nearest fallback rock and walk to a tile near it (not onto it)
          var gBest = null, gBestD = Infinity;
          for (var gi = 0; gi < fallbackCoords.length; gi++) {
            var gd = Math.abs(fallbackCoords[gi].x - gx) + Math.abs(fallbackCoords[gi].y - gy);
            if (gd < gBestD) { gBestD = gd; gBest = fallbackCoords[gi]; }
          }
          if (gBest && gBestD > 2) {
            log('Gather: retreating from combat toward (' + (gBest.x + 1) + ',' + gBest.y + ')');
            walkTo(gBest.x + 1, gBest.y);  // tile beside the rock, never on it
          }
        }
        return 2500;
      } else {
        // Combat paused — reset engagement only after 8s of genuine quiet
        if (scriptState._gatherCombatUntil && Date.now() - scriptState._gatherCombatUntil > 8000) {
          scriptState._gatherCombatSince = 0;
          scriptState._gatherCombatUntil = 0;
          scriptState._gatherRetreatAt = 0;
        }
      }

      // Scan client arrays for rocks
      var targets = findObjects(objectIds, 20);

      // If no client-side objects found, use fallback coords (server-authoritative)
      if (targets.length === 0 && fallbackCoords.length > 0) {
        var px = getX(), py = getY();
        var fbList = [];
        // v256: filter fallback coords by the CONFIGURED rock ids — the coords
        // entries carry their rock id at index [2]. Live 19:23: Edgeville Dungeon
        // client arrays are sparse underground → fallback fired every tick and
        // fed SILVER rocks (195, lvl 20) to a lvl-1 test miner — 10 min of
        // rejected clicks ("unresponsive" blacklist cycle) with copper/tin
        // configured. The user's rock selection must always win.
        var idSet = {};
        for (var oi9 = 0; oi9 < objectIds.length; oi9++) idSet[objectIds[oi9]] = true;
        for (var fi = 0; fi < fallbackCoords.length; fi++) {
          var fc = fallbackCoords[fi];
          if (fc.id !== undefined && !idSet[fc.id]) continue;
          var fd = Math.abs(fc.x - px) + Math.abs(fc.y - py);
          if (fd <= 20) fbList.push({ worldX: fc.x, worldY: fc.y, dist: fd, id: fc.id });
        }
        fbList.sort(function(a,b) { return a.dist - b.dist; });
        targets = fbList;
      }

      // Check if our last mining attempt yielded ore → mark that rock depleted.
      // The client's object array is STALE (shows original scenery, not the server's
      // depleted ROCK_GENERIC id 98), so we must track depletion ourselves.
      // A rock is only blacklisted when ore was actually received (not on failed clicks).
      // Cooldown = 30s (coal respawn is 25s server-side: changeloc(respawnTime * 1000)).
      if (scriptState.pendingRockCheck && scriptState.lastMinedRock) {
        if (getInventoryCount() > (scriptState.invBeforeMine || 0)) {
          if (!scriptState.depletedRocks) scriptState.depletedRocks = {};
          var lastRockId = scriptState.lastMinedRockId || 0;
          var respSec = RESPAWN_BY_ROCK[lastRockId] || 30;
          scriptState.depletedRocks[scriptState.lastMinedRock] = Date.now() + (respSec + 5) * 1000;
          log('Rock (' + scriptState.lastMinedRock + ') depleted — blacklisted ' + respSec + 's');
        }
        scriptState.pendingRockCheck = false;
      }

      // Filter out depleted rocks
      if (!scriptState.depletedRocks) scriptState.depletedRocks = {};
      // v213 anti-spam: same rock clicked 4+ times with no gain → blacklist 15s.
      // (pcap 2026-08-17: 30+ clicks on id=98 depleted rock — stale client arrays
      // mean some depletions never produce a "gain" to trigger the normal path.)
      if (scriptState.pendingRockCheck === false && scriptState.lastMinedRock) {
        var key = scriptState.lastMinedRock;
        scriptState._rockMisses = (scriptState._rockMisses || {});
        if (getInventoryCount() === (scriptState.invBeforeMine || 0)) {
          scriptState._rockMisses[key] = (scriptState._rockMisses[key] || 0) + 1;
          if (scriptState._rockMisses[key] >= 4) {
            scriptState.depletedRocks[key] = Date.now() + 15000;
            delete scriptState._rockMisses[key];
            log('Rock ' + key + ' unresponsive after 4 clicks — blacklisted 15s');
          }
        } else {
          delete scriptState._rockMisses[key];
        }
      }
      window.__r2h_lastTargetCount = targets.length;
      var nowMs = Date.now();
      var availTargets = [];
      for (var ti = 0; ti < targets.length; ti++) {
        var t = targets[ti];
        var tkey = t.worldX + ',' + t.worldY;
        var depExpiry = scriptState.depletedRocks[tkey];
        if (!depExpiry || nowMs > depExpiry) {
          availTargets.push(t);
        }
      }
      targets = availTargets;

      if (targets.length === 0) {
        // All nearby rocks depleted — wait for respawn rather than re-clicking
        if (!scriptState._noTargetWarn || Date.now() - scriptState._noTargetWarn > 10000) {
          scriptState._noTargetWarn = Date.now();
          var depCount = 0;
          for (var dk in scriptState.depletedRocks) {
            if (Date.now() < scriptState.depletedRocks[dk]) depCount++;
          }
          log('No available rocks: raw=' + (window.__r2h_lastTargetCount || 0) + ' filtered, ' + depCount + ' blacklisted. Waiting for respawn.');
        }
        return 3000;
      }

      // Mine the nearest available rock
      var target = targets[0];

      // Server requires withinRange(rock, 1) — the player must be ADJACENT
      // (Chebyshev distance <= 1, i.e. the 8 surrounding tiles) or mining
      // silently fails (Mining.java: if (!player.withinRange(rock, 1)) return;).
      // target.dist is Manhattan; dist <= 2 guarantees Chebyshev <= 2 → may still
      // be diagonal-2, so walk whenever not strictly adjacent.
      var cheb = Math.max(Math.abs(target.worldX - getX()), Math.abs(target.worldY - getY()));
      if (cheb > 1) {
        var px2 = getX(), py2 = getY();
        // Build a set of all known rock tiles to AVOID as walk destinations —
        // a rock tile is unwalkable and the pathfinder silently fails on it.
        var rockTiles = {};
        for (var ri2 = 0; ri2 < fallbackCoords.length; ri2++) {
          rockTiles[fallbackCoords[ri2].x + ',' + fallbackCoords[ri2].y] = true;
        }
        // Also include any rocks visible in client object arrays
        var clientRocks = findObjects(objectIds, 25);
        for (var ri3 = 0; ri3 < clientRocks.length; ri3++) {
          rockTiles[clientRocks[ri3].worldX + ',' + clientRocks[ri3].worldY] = true;
        }
        var bestAdj = null, bestAdjDist = Infinity;
        var neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for (var ni = 0; ni < neighbors.length; ni++) {
          var nx = target.worldX + neighbors[ni][0];
          var ny = target.worldY + neighbors[ni][1];
          if (rockTiles[nx + ',' + ny]) continue;  // skip rock tiles — unwalkable
          var nd = Math.abs(nx - px2) + Math.abs(ny - py2);
          if (nd < bestAdjDist) { bestAdjDist = nd; bestAdj = {x: nx, y: ny}; }
        }
        if (bestAdj) {
          // v254b: rotate neighbors when the chosen approach tile proves
          // unwalkable (live 18:55: dungeon mining room — (185,3298) dropped
          // every send for 2+ min while (184,3299)/(186,3299) pathed fine;
          // rock-adjacent dead tiles aren't in any def file). Remember the
          // failed tile per rock; pick the next-best neighbor on retry.
          scriptState._adjFail = scriptState._adjFail || {};
          var rockKey = target.worldX + ',' + target.worldY;
          var failKey = rockKey + '=' + bestAdj.x + ',' + bestAdj.y;
          if (scriptState._adjSent === failKey && scriptState._adjSentAt &&
              Date.now() - scriptState._adjSentAt < 12000) {
            scriptState._adjFail[failKey] = Date.now();
          }
          // rebuild candidate list excluding recently failed tiles
          var altAdj = null, altD = Infinity;
          for (var ni2 = 0; ni2 < neighbors.length; ni2++) {
            var ax2 = target.worldX + neighbors[ni2][0];
            var ay2 = target.worldY + neighbors[ni2][1];
            if (rockTiles[ax2 + ',' + ay2]) continue;
            var fk2 = rockKey + '=' + ax2 + ',' + ay2;
            if (scriptState._adjFail[fk2] && Date.now() - scriptState._adjFail[fk2] < 60000) continue;
            var nd2 = Math.abs(ax2 - px2) + Math.abs(ay2 - py2);
            if (nd2 < altD) { altD = nd2; altAdj = {x: ax2, y: ay2}; }
          }
          if (altAdj) bestAdj = altAdj;
          log('Walking adjacent to rock (' + target.worldX + ',' + target.worldY + ') via (' + bestAdj.x + ',' + bestAdj.y + ')');
          scriptState._adjSent = rockKey + '=' + bestAdj.x + ',' + bestAdj.y;
          scriptState._adjSentAt = Date.now();
          walkTo(bestAdj.x, bestAdj.y);
          return 1500;
        }
      }

      log('Mining rock at (' + target.worldX + ',' + target.worldY + ') dist=' + target.dist);
      scriptState.lastMinedRock = target.worldX + ',' + target.worldY;
      scriptState.lastMinedRockId = target.id || 0;
      scriptState.invBeforeMine = getInventoryCount();
      scriptState.pendingRockCheck = true;
      atObject(target.worldX, target.worldY);
      return actionTime;
};
  }

  // ════════════════════════════════════════════════════════════════
  // WOODCUTTING PILOT (v260) — Normal trees only (IDs 0, 1)
  // Modeled on AIO Miner (makeGatheringScript) architecture
  // ════════════════════════════════════════════════════════════════

  function makeWoodcuttingPilotScript() {
    var CHOP_ACTION_TIME = 1200;
    var FELLED_TILE_EXPIRY = 45000;
    var STUCK_TIMEOUT = 60000;

    // v263: client object arrays are STALE (v205 invariant — same reason the miner
    // uses MINE_REGISTRY). Targeting MUST come from server SceneryLocs.json.
    // These are REAL tree tiles (ids 0/1) around Lumbridge, verified server-side
    // 2026-08-23: /opt/openrsc/server/conf/server/defs/locs/SceneryLocs.json
    var TREE_REGISTRY = [
      { x: 114, y: 631 }, { x: 122, y: 632 }, { x: 120, y: 633 },
      { x: 114, y: 634 }, { x: 115, y: 635 }, { x: 118, y: 635 },
      { x: 122, y: 636 }, { x: 118, y: 637 }, { x: 114, y: 638 },
      { x: 117, y: 639 }, { x: 114, y: 640 }, { x: 119, y: 640 }
    ];

    return function() {
      if (!isLoggedIn()) return 5000;

      // ══ PHASE: INIT ══
      if (scriptState.phase === 'init') {
        // Verify axe in inventory OR equipped (server checks CarriedItems =
        // inventory ∪ equipment — a wielded axe is valid, only banked is not)
        var hasAxe = false;
        for (var ai = 0; ai < AXE_IDS.length; ai++) {
          if (getInventoryIndex(AXE_IDS[ai]) >= 0 || isItemIdEquipped(AXE_IDS[ai])) {
            hasAxe = true;
            break;
          }
        }
        if (!hasAxe) {
          log('NO AXE — kit via ::item 405');
          stopBot();
          return 1000;
        }

        scriptState.startX = getX();
        scriptState.startY = getY();
        scriptState.logsCount = 0;
        scriptState.lastLogCount = 0;
        scriptState.felledTiles = {};
        scriptState.phase = 'gather';
        scriptState.stuckStart = Date.now();

        log('Woodcutting Pilot: start=(' + scriptState.startX + ',' + scriptState.startY + ')');
        log('Target trees: ' + NORMAL_TREE_IDS.join(',') + ' | Stumps excluded: ' + STUMP_IDS.join(','));
      }

      // ══ FATIGUE / SLEEP (reuse miner's exact logic) ══
      if (getIsSleeping()) {
        if (!scriptState.sleepTyping) {
          scriptState.sleepTyping = true;
          var sleepWord = 'asleep';
          for (var ci = 0; ci < sleepWord.length; ci++) {
            window.__r2hTypeChar(sleepWord[ci]);
          }
          setTimeout(function() {
            window.__r2hTypeSpecial('Enter');
            scriptState.sleepTyping = false;
          }, 500);
        }
        return 2000;
      }
      var fatigue = getFatigue();
      if (fatigue >= 90) {
        var bagSlot = getInventoryIndex(SLEEPING_BAG);
        if (bagSlot >= 0) {
          log('Fatigue ' + fatigue + '% — using sleeping bag');
          useItem(bagSlot);
          return 3000;
        }
      }

      // ══ INVENTORY FULL → STOP (pilot does NOT bank) ══
      var invCount = getInventoryCount();
      var logsNow = 0;
      for (var li = 0; li < invCount; li++) {
        if (getInventoryId(li) === LOG_ID) logsNow++;
      }
      scriptState.logsCount = logsNow;
      // v263: flag log gain at the tile we were chopping — drives fell detection
      if (scriptState.lastTree && logsNow > (scriptState.lastLogsSeen || 0)) {
        scriptState.gainedAtLastTree = true;
      }
      scriptState.lastLogsSeen = logsNow;

      if (invCount >= 30) {
        log('PILOT COMPLETE: inv full, ' + logsNow + ' logs');
        stopBot();
        return 1000;
      }

      // Log progress every 10 logs
      if (logsNow > 0 && logsNow % 10 === 0 && logsNow !== scriptState.lastLogCount) {
        log('Progress: ' + logsNow + ' logs');
        scriptState.lastLogCount = logsNow;
      }

      // ══ CLEAN EXPIRED FELLED TILES ══
      var now = Date.now();
      for (var ft in scriptState.felledTiles) {
        if (now - scriptState.felledTiles[ft] > FELLED_TILE_EXPIRY) {
          delete scriptState.felledTiles[ft];
        }
      }

      // ══ FIND NEAREST TREE (server-authoritative registry, NOT client scan) ══
      // v263: the client object list is stale/unreliable (v205 invariant). The
      // server IS the truth: if our chop packet hits a live tree, Woodcutting.onOpLoc
      // fires and we gain logs; if the tree is a stump, the server silently no-ops.
      // So: iterate registry tiles, skip blacklisted (felled) ones, walk adjacent, chop.
      var now = Date.now();
      var availTargets = [];
      for (var ti = 0; ti < TREE_REGISTRY.length; ti++) {
        var t = TREE_REGISTRY[ti];
        var tkey = t.x + ',' + t.y;
        if (scriptState.felledTiles[tkey]) continue;
        var tdist = Math.abs(t.x - getX()) + Math.abs(t.y - getY());
        availTargets.push({ worldX: t.x, worldY: t.y, id: 1, dist: tdist });
      }
      availTargets.sort(function(a, b) { return a.dist - b.dist; });

      if (availTargets.length === 0) {
        // No trees found — walk back toward start tile
        var distToStart = Math.abs(getX() - scriptState.startX) + Math.abs(getY() - scriptState.startY);
        if (distToStart > 5) {
          log('No trees found — walking back to start area');
          walkTo(scriptState.startX, scriptState.startY);
          return 2000;
        }
        // Stuck near start with no trees
        if (now - (scriptState.stuckStart || now) > STUCK_TIMEOUT) {
          log('No trees for 60s+ — stopping');
          stopBot();
          return 1000;
        }
        return 3000;
      }

      // Reset stuck timer when trees are available
      scriptState.stuckStart = now;

      var target = availTargets[0];

      // ══ WALK ADJACENT TO TREE (server requires withinRange 2) ══
      var cheb = Math.max(Math.abs(target.worldX - getX()), Math.abs(target.worldY - getY()));
      if (cheb > 1) {
        var px = getX(), py = getY();
        // Avoid standing on other registry trees or felled (stump) tiles
        var rockTiles = {};
        for (var fi = 0; fi < TREE_REGISTRY.length; fi++) {
          rockTiles[TREE_REGISTRY[fi].x + ',' + TREE_REGISTRY[fi].y] = true;
        }
        for (var si in scriptState.felledTiles) {
          rockTiles[si] = true;
        }
        var neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        neighbors.sort(function(a, b) {
          var da = Math.abs(target.worldX + a[0] - px) + Math.abs(target.worldY + a[1] - py);
          var db = Math.abs(target.worldX + b[0] - px) + Math.abs(target.worldY + b[1] - py);
          return da - db;
        });
        var bestAdj = null;
        for (var ni = 0; ni < neighbors.length; ni++) {
          var nx = target.worldX + neighbors[ni][0];
          var ny = target.worldY + neighbors[ni][1];
          if (rockTiles[nx + ',' + ny]) continue;
          bestAdj = {x: nx, y: ny};
          break;
        }
        if (bestAdj) {
          walkTo(bestAdj.x, bestAdj.y);
          return 1500;
        }
      }

      // ══ CHOP TREE + FELL DETECTION (inventory-based, server-authoritative) ══
      // v263: client scan can't confirm tree existence, so detect felling the way
      // the server reports it: a successful log (inv gained while chopping) is
      // ALWAYS followed by the tree felling (fell=100% for normal trees). After a
      // log gain at this tile, blacklist it for the respawn window and rotate.
      if (scriptState.lastTree && scriptState.gainedAtLastTree) {
        scriptState.felledTiles[scriptState.lastTree] = Date.now();
        log('Tree felled at (' + scriptState.lastTree + ') — rotating (logs: ' + logsNow + ')');
        scriptState.lastTree = null;
        scriptState.gainedAtLastTree = false;
        return 600;
      }
      log('Chopping tree at (' + target.worldX + ',' + target.worldY + ')');
      scriptState.lastTree = target.worldX + ',' + target.worldY;
      scriptState.invBeforeChop = invCount;
      atObject(target.worldX, target.worldY);
      return CHOP_ACTION_TIME;
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // v265: FULL WOODCUTTING — 6 tree types, banking, power-chop.
  // Config (ScriptPanel → App.tsx spread → engine):
  //   treeTypes: {Normal:bool,Oak:bool,Willow:bool,Maple:bool,Yew:bool,Magic:bool}
  //   wcBank: bool (false = power-chop/drop)
  //   bankDestination: 'Auto' | bank name (manual only sensible far from groves)
  // Registry-driven (v263 lesson: client object arrays are stale). Bank machine
  // ports the miner's proven talk→option→deposit→close sequence. Long walks use
  // the global webwalk graph; groves chosen here have NO labeled-edge (gate)
  // crossings to their banks — Seers is open terrain, Lumbridge→Draynor is gate-free.
  // ═══════════════════════════════════════════════════════════════
  function makeWoodcuttingScript(runtimeConfig) {
    var CHOP_ACTION_TIME = 850;
    var WALK_RESEND_MS = 2500;
    var cfg = runtimeConfig || {};

    // ── Tree selection ──
    var selNames = [];
    if (cfg.treeTypes) {
      for (var tk in cfg.treeTypes) if (cfg.treeTypes[tk] && WC_TREE_TYPES[tk]) selNames.push(tk);
    }
    if (selNames.length === 0 && cfg.treeType && WC_TREE_TYPES[cfg.treeType]) selNames.push(cfg.treeType);
    if (selNames.length === 0) selNames.push('Normal');

    var powerMode = (cfg.wcBank === false);
    var manualBank = (!powerMode && cfg.bankDestination && cfg.bankDestination !== 'Auto' &&
                      BANK_REGISTRY[cfg.bankDestination]) ? cfg.bankDestination : null;

    // Flatten: every registry tile of every selected type, tagged with its meta
    var TILES = [];   // {x, y, key, name, respawnMs, fellOnGain, missLimit, logId}
    var GROVES = [];  // {stand:[x,y], name}
    var seenGrove = {};
    for (var si = 0; si < selNames.length; si++) {
      var meta = WC_TREE_TYPES[selNames[si]];
      for (var gi = 0; gi < meta.groves.length; gi++) {
        var grove = meta.groves[gi];
        var gkey = grove.stand[0] + ',' + grove.stand[1];
        if (!seenGrove[gkey]) { seenGrove[gkey] = true; GROVES.push({ stand: grove.stand, name: grove.name }); }
        for (var ti = 0; ti < grove.tiles.length; ti++) {
          TILES.push({ x: grove.tiles[ti][0], y: grove.tiles[ti][1],
            key: grove.tiles[ti][0] + ',' + grove.tiles[ti][1], name: selNames[si],
            ids: meta.ids, respawnMs: meta.respawnMs, fellOnGain: meta.fellOnGain,
            missLimit: meta.missLimit, dryLimit: meta.dryLimit || 2, logId: meta.logId });
        }
      }
    }

    // Nearest graph hop toward dest — GATE-FREE routing (v265 test 1 lesson:
    // the miner's labeled-edge crossing machinery is mining-private; WC prunes
    // labeled edges instead, so Dijkstra routes around gates entirely).
    function nextHop(destX, destY) {
      var route = webwalkRouteNoGates(getX(), getY(), destX, destY);
      if (!route || route.length < 2) return { x: destX, y: destY };
      var bestIdx = 0, bestD = Infinity;
      for (var i = 0; i < route.length; i++) {
        var d = Math.abs(route[i].x - getX()) + Math.abs(route[i].y - getY());
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx >= route.length - 1) return { x: destX, y: destY };
      return { x: route[bestIdx + 1].x, y: route[bestIdx + 1].y };
    }

    // Shared long-distance walker. Returns delay; sets phase via onArrive().
    // Minimal gate-crossing for the two Taverley gates — the graph's ONLY
    // Asgarnia↔Kandarin links (verified by cut-vertex simulation). Pattern is
    // the miner's proven known-gate sequence: walk to side-specific stand tile,
    // atObject the gate, verify side-flip on the N-S axis, bounded retries.
    var WC_GATES = {
      // north gate = HORIZONTAL (E-W crossing, x-side flip); south = VERTICAL (N-S, y-side flip).
      // Click tiles + stand tiles from the miner's def-verified OBSTACLE_STAND/standTileFor.
      northFallyTavGate: { x: 341, y: 487, axis: 'x', standW: { x: 341, y: 487 }, standE: { x: 342, y: 487 } },
      southFallyTavGate: { x: 343, y: 581, axis: 'y', standN: { x: 343, y: 580 }, standS: { x: 343, y: 582 } }
    };
    // v273 STATE-AWARE GATE CROSSING. The client's object list carries the gate's
    // LIVE id: closed = 57/137/138 (cmd1 "open"), open = 58 (cmd1 WalkTo).
    // Rules that fix two live failures:
    //   - v268: clicking an ALREADY-OPEN gate (58) toggles/does nothing useful → we
    //     bounced forever. Fix: see 58 → just walk through, never click.
    //   - v269: walkTo(beyond) 1.5s after the open-click CANCELS the server's
    //     WalkToObjectAction before the click lands → zero gate packets (live:
    //     shafster frozen at north gate 22:56–22:58). Fix: after a click, STAND
    //     STILL and wait for the client to see the id flip closed→open; only then walk.
    var WC_GATE_IDS_CLOSED = [57, 137, 138];
    function wcGateOpenAt(x, y) {
      var objs = findObjects([57, 58, 137, 138], 6);
      for (var i = 0; i < objs.length; i++) {
        if (objs[i].worldX === x && objs[i].worldY === y) return objs[i].id === 58;
      }
      return null;   // not visible — client list may be stale
    }
    function wcTryGate(destX, destY) {
      var g = null, gname = '';
      for (var gn in WC_GATES) {
        if (Math.abs(getX() - WC_GATES[gn].x) <= 12 && Math.abs(getY() - WC_GATES[gn].y) <= 12) {
          g = WC_GATES[gn]; gname = gn; break;
        }
      }
      if (!g) { scriptState._wcGate = null; return 0; }
      var side, wantSide, stand;
      if (g.axis === 'y') {
        side = getY() < g.y ? -1 : (getY() > g.y ? 1 : 0);
        wantSide = destY < g.y ? -1 : 1;
        stand = side < 0 ? g.standN : g.standS;
      } else {
        side = getX() < g.x ? -1 : (getX() > g.x ? 1 : 0);
        wantSide = destX < g.x ? -1 : 1;
        stand = side < 0 ? g.standW : g.standE;
      }
      if (side === wantSide) { scriptState._wcGate = null; return 1; }
      if (side === 0) return 0;
      var beyond = g.axis === 'y'
        ? (side < 0 ? { x: g.x, y: g.y + 3 } : { x: g.x, y: g.y - 3 })
        : (side < 0 ? { x: g.x + 3, y: g.y } : { x: g.x - 3, y: g.y });

      if (!scriptState._wcGate) {
        scriptState._wcGate = { name: gname, startSide: side, stand: stand, clicked: false,
                                clickTs: 0, start: Date.now() };
        log('Gate ' + gname + ': engaging (side ' + side + ' → ' + wantSide + ')');
      }
      var st = scriptState._wcGate;
      if (st.name !== gname) { scriptState._wcGate = null; return 2; }

      // Crossed already?
      var sideNow = g.axis === 'y'
        ? (getY() < g.y ? -1 : (getY() > g.y ? 1 : 0))
        : (getX() < g.x ? -1 : (getX() > g.x ? 1 : 0));
      if (sideNow === wantSide) {
        log('Gate ' + gname + ' crossed');
        scriptState._wcGate = null;
        return 1;
      }
      if (Date.now() - st.start > 30000) {
        log('Gate ' + gname + ' FAILED after 30s — stopping. Report position.');
        stopBot();
        return 3;
      }

      var isOpen = wcGateOpenAt(g.x, g.y);
      if (isOpen === true) {
        // OPEN: walk straight through — do NOT click (clicking 58 = walkto at best)
        if (st.clicked) log('Gate ' + gname + ': now open — walking through');
        st.clicked = false;
        walkTo(beyond.x, beyond.y);
        return 2;
      }
      // CLOSED (or not visible): if we clicked recently, STAND STILL and wait for
      // the server interaction to complete — a walkTo now would cancel it.
      if (st.clicked && Date.now() - st.clickTs < 5000) {
        return 2;   // waiting on the open-click
      }
      // Click expired without opening → re-approach stand and click again
      var atStand = Math.abs(getX() - stand.x) <= 1 && Math.abs(getY() - stand.y) <= 1;
      if (!atStand) {
        walkTo(stand.x, stand.y);
        return 2;
      }
      atObject(g.x, g.y);   // closed gate 57/137/138: cmd1 = "open"
      st.clicked = true;
      st.clickTs = Date.now();
      log('Gate ' + gname + ': gate shut — clicking open');
      return 2;
    }

    function walkToward(destX, destY, onArrive, arriveDist) {
      var chebFar = Math.max(Math.abs(destX - getX()), Math.abs(destY - getY()));
      if (chebFar <= (arriveDist || 3)) { onArrive(); return 400; }
      // v271: CLOSE-range direct walk — graph snap nodes can sit ~5+ tiles from
      // the true destination, stalling arrival at cheb 5 vs threshold 4 while
      // the hop machinery drags the player away (live: 9 min, zero chops). Inside
      // 12 tiles the client pathfinder handles it — bypass the graph entirely.
      if (chebFar <= 12) {
        walkTo(destX, destY);
        return 1200;
      }
      // COMMIT to one hop until reached/stale (test-3 lesson: per-tick route
      // recompute at a graph fork ping-pongs the walk target between two hops).
      var dkey = destX + ',' + destY;
      if (scriptState._wcHopDest !== dkey) { scriptState._wcHopDest = dkey; scriptState._wcHop = null; }
      var hop = scriptState._wcHop;
      var atHop = hop && Math.max(Math.abs(hop.x - getX()), Math.abs(hop.y - getY())) <= 1;
      var hopStale = hop && Date.now() - (scriptState._wcHopTs || 0) > 25000;
      if (!hop || atHop || hopStale) {
        hop = nextHop(destX, destY);
        scriptState._wcHop = hop;
        scriptState._wcHopTs = Date.now();
        scriptState._wcLastWalk = 0;
        scriptState._wcSent = false;
        scriptState._wcSendX = -9999; scriptState._wcSendY = -9999;
      }
      var chebHop = Math.max(Math.abs(hop.x - getX()), Math.abs(hop.y - getY()));
      var now = Date.now();
      var moved = (getX() !== (scriptState._wcSendX || -9999) || getY() !== (scriptState._wcSendY || -9999));
      // Gate check FIRST: near a Taverley gate needing a cross → handle it,
      // skip normal hop-walking this tick
      var gateRes = wcTryGate(destX, destY);
      if (gateRes === 2) return 1500;      // gate handling owns this tick
      if (gateRes === 3) return 3000;      // gate failed — stopped
      if (gateRes === 1) { scriptState._wcLastWalk = 0; }  // crossed/none-needed — fresh hop next tick
      if (!scriptState._wcLastWalk || now - scriptState._wcLastWalk > WALK_RESEND_MS || (scriptState._wcSent && !moved)) {
        if (scriptState._wcSent && !moved) {
          walkTo(hop.x + 1, hop.y);  // nudge
        } else {
          walkTo(hop.x, hop.y);
        }
        scriptState._wcLastWalk = now;
        scriptState._wcSent = true;
        scriptState._wcSendX = getX(); scriptState._wcSendY = getY();
      }
      // Stuck watchdog: reset on MOVEMENT (a long legit walk never trips it);
      // 45s with zero position change → hard stop with reason
      var px2 = getX(), py2 = getY();
      if (px2 !== (scriptState._wcLastPosX || -9999) || py2 !== (scriptState._wcLastPosY || -9999)) {
        scriptState._wcLastPosX = px2; scriptState._wcLastPosY = py2;
        scriptState._wcWalkStart = now;
      } else if (now - scriptState._wcWalkStart > 45000) {
        log('STUCK walking to (' + destX + ',' + destY + ') for 45s — stopping. Report position.');
        stopBot();
        return 2000;
      }
      return 1500;
    }

    return function() {
      if (!isLoggedIn()) return 5000;

      // ══ INIT ══
      if (scriptState.phase === 'init') {
        var hasAxe = false;
        for (var ai = 0; ai < AXE_IDS.length; ai++) {
          if (getInventoryIndex(AXE_IDS[ai]) >= 0 || isItemIdEquipped(AXE_IDS[ai])) { hasAxe = true; break; }
        }
        if (!hasAxe) { log('NO AXE — kit via ::item 405'); stopBot(); return 1000; }

        // Level gate per selected type (WC = stat index 8, verified empirically)
        var wcLevel = getStatBase(8);
        var kept = [], dropped = [];
        for (var li = 0; li < selNames.length; li++) {
          if (wcLevel >= WC_TREE_TYPES[selNames[li]].level) kept.push(selNames[li]);
          else dropped.push(selNames[li] + ' (need ' + WC_TREE_TYPES[selNames[li]].level + ')');
        }
        if (dropped.length) log('Skipped for level: ' + dropped.join(', ') + ' — you are ' + wcLevel + ' WC');
        if (kept.length === 0) { log('WC level ' + wcLevel + ' too low for every selected tree — stopping'); stopBot(); return 1000; }
        // Re-filter TILES to kept types
        TILES = TILES.filter(function(t) { return kept.indexOf(t.name) >= 0; });

        // Pick starting grove: nearest stand to player
        var bestG = null, bestGD = Infinity;
        for (var gi2 = 0; gi2 < GROVES.length; gi2++) {
          var gd = Math.abs(GROVES[gi2].stand[0] - getX()) + Math.abs(GROVES[gi2].stand[1] - getY());
          if (gd < bestGD) { bestGD = gd; bestG = GROVES[gi2]; }
        }
        scriptState.wcGrove = bestG;

        // Auto-bank: nearest bank by webwalk route cost from the grove (miner's v210 logic)
        scriptState.wcBankTile = null; scriptState.wcBankName = '';
        if (!powerMode) {
          if (manualBank) {
            scriptState.wcBankName = manualBank;
            scriptState.wcBankTile = BANK_REGISTRY[manualBank];
          } else {
            var wk = webwalkDijkstraNoGates(bestG.stand[0], bestG.stand[1]);
            var bestBank = null, bestCost = Infinity;
            for (var bn in BANK_REGISTRY) {
              var bt = BANK_REGISTRY[bn];
              var bnode = webwalkSnapNoGates(bt[0], bt[1]);
              var bcost = wk.dist[bnode.x + ',' + bnode.y];
              if (bcost !== undefined && bcost < bestCost) { bestCost = bcost; bestBank = bn; }
            }
            if (bestBank) { scriptState.wcBankName = bestBank; scriptState.wcBankTile = BANK_REGISTRY[bestBank]; }
          }
        }

        scriptState.felledTiles = {};
        scriptState.logsCount = 0; scriptState.lastLogCount = 0; scriptState.lastLogsSeen = 0;
        scriptState.bankedTrips = 0;
        scriptState._wcWalkStart = 0; scriptState._wcLastWalk = 0; scriptState._wcSent = false;
        // Trees already within reach? Skip the grove-stand walk entirely — gather
        // now. (Test-2 lesson: insisting on the stand tile stranded the bot across
        // a pond from reachable trees.) Only travel when the nearest live tile is
        // genuinely far.
        var nearestTileD = Infinity;
        for (var nti = 0; nti < TILES.length; nti++) {
          var ntd = Math.max(Math.abs(TILES[nti].x - getX()), Math.abs(TILES[nti].y - getY()));
          if (ntd < nearestTileD) nearestTileD = ntd;
        }
        // v274: FULL INVENTORY AT START → bank FIRST. Restarting mid-route (e.g.
        // at a gate with 30 logs) used to send the bot grove-first — a full
        // round-trip before it noticed it needed the bank anyway.
        if (!powerMode && getInventoryCount() >= 30 && scriptState.wcBankTile) {
          scriptState.phase = 'toBank';
          log('Starting with full inventory — banking first at ' + scriptState.wcBankName);
        } else if (nearestTileD <= 20) {
          scriptState.phase = 'gather';
          log('Trees ' + nearestTileD + ' tiles away — chopping directly (skip grove walk)');
        } else {
          scriptState.phase = 'toGrove';
        }
        log('Woodcutting v265: types=[' + kept.join(',') + '] grove=' + bestG.name +
            ' mode=' + (powerMode ? 'POWER-CHOP (drop)' : 'BANK → ' + scriptState.wcBankName) +
            ' tiles=' + TILES.length + ' WClvl=' + wcLevel);
      }

      // ══ FATIGUE / SLEEP ══
      if (getIsSleeping()) {
        if (!scriptState.sleepTyping) {
          scriptState.sleepTyping = true;
          var sleepWord = 'asleep';
          for (var ci = 0; ci < sleepWord.length; ci++) window.__r2hTypeChar(sleepWord[ci]);
          setTimeout(function() {
            window.__r2hTypeSpecial('Enter');
            scriptState.sleepTyping = false;
          }, 500);
        }
        return 2000;
      }
      var fatigue = getFatigue();
      if (fatigue >= 90) {
        var bagSlot = getInventoryIndex(SLEEPING_BAG);
        if (bagSlot >= 0) { log('Fatigue ' + fatigue + '% — using sleeping bag'); useItem(bagSlot); return 3000; }
      }

      var invCount = getInventoryCount();
      var logsNow = 0;
      for (var ii = 0; ii < invCount; ii++) {
        if (WC_LOG_IDS.indexOf(getInventoryId(ii)) >= 0) logsNow++;
      }
      scriptState.logsCount = logsNow;
      if (logsNow > 0 && logsNow % 10 === 0 && logsNow !== scriptState.lastLogCount) {
        log('Progress: ' + logsNow + ' logs' + (scriptState.bankedTrips ? (' (' + scriptState.bankedTrips + ' banked trips)') : ''));
        scriptState.lastLogCount = logsNow;
      }

      // ══ PHASE: TO GROVE ══
      if (scriptState.phase === 'toGrove') {
        return walkToward(scriptState.wcGrove.stand[0], scriptState.wcGrove.stand[1], function() {
          scriptState.phase = 'gather';
          scriptState._wcWalkStart = 0; scriptState._wcLastWalk = 0; scriptState._wcSent = false;
          log('At grove ' + scriptState.wcGrove.name + ' — chopping');
        }, 4);
      }

      // ══ PHASE: TO BANK ══
      if (scriptState.phase === 'toBank') {
        return walkToward(scriptState.wcBankTile[0], scriptState.wcBankTile[1], function() {
          scriptState.phase = 'bankTalk';
          scriptState._wcWalkStart = 0; scriptState._wcLastWalk = 0; scriptState._wcSent = false;
          scriptState._wcBankerMisses = 0;
        }, 2);
      }

      // ══ PHASE: TO GROVE (return from bank) ══
      if (scriptState.phase === 'returnGrove') {
        return walkToward(scriptState.wcGrove.stand[0], scriptState.wcGrove.stand[1], function() {
          scriptState.phase = 'gather';
          scriptState._wcWalkStart = 0; scriptState._wcLastWalk = 0; scriptState._wcSent = false;
        }, 4);
      }

      // ══ BANK MACHINE (miner's proven sequence) ══
      if (scriptState.phase === 'bankTalk') {
        var banker = findNpcs(WC_BANKER_IDS, 3);
        if (banker.length > 0) {
          log('Talking to banker (idx=' + banker[0].serverIndex + ')');
          talkToNpc(banker[0].serverIndex);
          scriptState._wcBankTimer = Date.now();
          scriptState.phase = 'bankOption';
          return 2000;
        }
        walkTo(scriptState.wcBankTile[0], scriptState.wcBankTile[1]);
        scriptState._wcBankerMisses = (scriptState._wcBankerMisses || 0) + 1;
        if (scriptState._wcBankerMisses >= 12) {
          log('ERROR: no banker found near ' + scriptState.wcBankName + ' — stopping');
          stopBot(); return 2000;
        }
        return 1500;
      }
      if (scriptState.phase === 'bankOption') {
        if (isInBank()) { scriptState.phase = 'bankDeposit'; return 500; }
        if (Date.now() - scriptState._wcBankTimer > 2000) {
          optionAnswer(0);
          scriptState._wcBankTimer = Date.now();
        }
        if (Date.now() - (scriptState._wcBankTalkStart || scriptState._wcBankTimer) > 12000) {
          log('Bank not opening — retrying talk');
          scriptState.phase = 'bankTalk';
          scriptState._wcBankTalkStart = Date.now();
        }
        return 1500;
      }
      if (scriptState.phase === 'bankDeposit') {
        if (!isInBank()) {
          if (Date.now() - (scriptState._wcBankTimer || 0) > 8000) { scriptState.phase = 'bankTalk'; }
          return 1500;
        }
        var deposited = 0;
        for (var di = 0; di < WC_LOG_IDS.length; di++) {
          if (getInventoryIndex(WC_LOG_IDS[di]) >= 0) {
            depositItem(WC_LOG_IDS[di], 9999);
            deposited++;
          }
        }
        scriptState.bankedTrips++;
        log('Banked at ' + scriptState.wcBankName + ' (trip ' + scriptState.bankedTrips + ', ' + deposited + ' log types) — returning');
        closeBank();
        scriptState.phase = 'returnGrove';
        return 2000;
      }

      // ══ PHASE: GATHER ══
      if (invCount >= 30) {
        if (powerMode) {
          // Power-chop: drop one log per tick (server 1-action-per-tick)
          for (var dpi = 0; dpi < invCount; dpi++) {
            if (WC_LOG_IDS.indexOf(getInventoryId(dpi)) >= 0) {
              dropItem(dpi);
              return 700;
            }
          }
          return 600;  // full of non-logs — keep chopping anyway (axe/bag occupy)
        }
        log('Inventory full (' + logsNow + ' logs) — walking to ' + scriptState.wcBankName);
        scriptState.phase = 'toBank';
        scriptState._wcWalkStart = 0; scriptState._wcLastWalk = 0; scriptState._wcSent = false;
        return 1000;
      }

      // Log-gain detection (drives fell/miss bookkeeping)
      if (scriptState.lastTree && logsNow > (scriptState.lastLogsSeen || 0)) {
        scriptState.gainedAtLastTree = true;
        scriptState.wcTreeGains = scriptState.wcTreeGains || {};
        scriptState.wcTreeGains[scriptState.lastTree] = (scriptState.wcTreeGains[scriptState.lastTree] || 0) + 1;
      }

      // Expire blacklisted tiles (per-type respawn windows)
      var now = Date.now();
      for (var ft in scriptState.felledTiles) {
        var tileMeta = scriptState.felledTiles[ft];
        if (now - tileMeta.at > tileMeta.ms) delete scriptState.felledTiles[ft];
      }
      // Expire soft-skips (never-gained trees — likely alive, just unlucky)
      if (scriptState.wcSoftSkip) {
        for (var ss in scriptState.wcSoftSkip) {
          if (now > scriptState.wcSoftSkip[ss]) delete scriptState.wcSoftSkip[ss];
        }
      }

      // ══ v272 LIVE-STUMP SCAN ══
      // When a tree fells, the server broadcasts a scenery update — the client's
      // object list swaps the tree for a stump (id 4 normal/magic, 314 oak–yew)
      // AT that tile. Tiles the client currently shows as stumps are depleted:
      // skip them BEFORE clicking. This is the "Nothing interesting happens"
      // fast-path — it prevents the wasted swing+walk entirely instead of
      // reacting to the message afterward. Evidence trust:
      //   - we gained logs there → certain fell → full respawn blacklist
      //   - no gains there → maybe-stale client data → short 25s recheck
      var scanWant = {};
      for (var swi = 0; swi < TILES.length; swi++) {
        for (var swj = 0; swj < TILES[swi].ids.length; swj++) scanWant[TILES[swi].ids[swj]] = true;
      }
      scanWant[4] = true; scanWant[314] = true;
      var scanObjs = findObjects(Object.keys(scanWant).map(Number), 24);
      var objAt = {};
      for (var soi = 0; soi < scanObjs.length; soi++) {
        objAt[scanObjs[soi].worldX + ',' + scanObjs[soi].worldY] = scanObjs[soi].id;
      }

      // Nearest live tile
      var avail = [];
      for (var ti2 = 0; ti2 < TILES.length; ti2++) {
        var t2 = TILES[ti2];
        if (scriptState.felledTiles[t2.key]) continue;
        if (scriptState.wcSoftSkip && scriptState.wcSoftSkip[t2.key]) continue;
        var seenId = objAt[t2.key];
        if (seenId !== undefined && STUMP_IDS.indexOf(seenId) >= 0) {
          var stumpGains = (scriptState.wcTreeGains && scriptState.wcTreeGains[t2.key]) || 0;
          scriptState.felledTiles[t2.key] = { at: Date.now(), ms: stumpGains > 0 ? t2.respawnMs : 25000 };
          if (stumpGains > 0 && scriptState.wcTreeGains) delete scriptState.wcTreeGains[t2.key];
          log('Stump visible at (' + t2.key + ') ' + t2.name + ' — blacklisting ' + (stumpGains > 0 ? 'full respawn' : '25s recheck'));
          if (scriptState.lastTree === t2.key) {
            scriptState.lastTree = null; scriptState.chopRounds = 0; scriptState.gainedAtLastTree = false;
          }
          continue;
        }
        avail.push({ t: t2, d: Math.abs(t2.x - getX()) + Math.abs(t2.y - getY()),
                     live: (seenId !== undefined) ? 1 : 0 });
      }
      avail.sort(function(a, b) {
        // Confirmed-live trees first (client can see the actual tree id), then distance
        if (a.live !== b.live) return b.live - a.live;
        return a.d - b.d;
      });

      if (avail.length === 0) {
        // All blacklisted — wait at stand for respawns (or walk back to stand)
        var dStand = Math.abs(getX() - scriptState.wcGrove.stand[0]) + Math.abs(getY() - scriptState.wcGrove.stand[1]);
        if (dStand > 4) { walkTo(scriptState.wcGrove.stand[0], scriptState.wcGrove.stand[1]); return 2000; }
        if (!scriptState._wcWaitStart) scriptState._wcWaitStart = now;
        if (now - scriptState._wcWaitStart > 90000) {
          log('No live trees for 90s — stopping');
          stopBot(); return 1000;
        }
        return 3000;
      }
      scriptState._wcWaitStart = 0;

      // v270 HYSTERESIS: keep the current tree unless the best alternative is
      // 3+ tiles closer. Without this, a blacklist expiring mid-walk flips the
      // target and the bot walks in circles between two near trees.
      var target = avail[0].t;
      if (scriptState.lastTree) {
        for (var hi = 0; hi < avail.length; hi++) {
          if (avail[hi].t.key === scriptState.lastTree && avail[hi].d <= avail[0].d + 3) {
            target = avail[hi].t;
            break;
          }
        }
      }

      // v270 GAIN-AWARE FELL DETECTION:
      //  - normal trees: blacklist on first gain (fell=100%) [unchanged]
      //  - multi-log trees that GAVE a log this visit, then 2 dry swings →
      //    felled server-side (oak 10%/log) → blacklist full respawn NOW
      //    (was: burn the full 6-swing miss window clicking a stump)
      //  - never-gained tree at miss limit → soft-skip 4s (probably alive)
      if (scriptState.lastTree && target.key === scriptState.lastTree) {
        var gainsHere = (scriptState.wcTreeGains && scriptState.wcTreeGains[scriptState.lastTree]) || 0;
        if (target.fellOnGain && scriptState.gainedAtLastTree) {
          scriptState.felledTiles[target.key] = { at: Date.now(), ms: target.respawnMs };
          log('Tree felled at (' + target.key + ') — rotating (logs: ' + logsNow + ')');
          scriptState.lastTree = null; scriptState.gainedAtLastTree = false;
          scriptState.chopRounds = 0;
          return 400;
        }
        if (gainsHere > 0 && (scriptState.chopRounds || 0) >= (target.dryLimit || 2)) {
          // UNCERTAIN fell — tree paid us, then went quiet, but at high tiers
          // (magic swing-success ~35%) dry streaks happen on LIVE trees. Short
          // blacklist: if it really felled, 25s ≈ nothing lost vs the 245s
          // window; if it's alive, we're back on it fast. (v271: the flat 2-dry
          // rule falsely emptied whole magic groves — bot idled at stand while
          // two healthy trees stood there.)
          scriptState.felledTiles[target.key] = { at: Date.now(), ms: 25000 };
          if (scriptState.wcTreeGains) delete scriptState.wcTreeGains[target.key];
          log('Tree went quiet after ' + gainsHere + ' logs at (' + target.key + ') — trying others, back in 25s');
          scriptState.lastTree = null; scriptState.gainedAtLastTree = false;
          scriptState.chopRounds = 0;
          return 400;
        }
        scriptState.chopRounds = (scriptState.chopRounds || 0) + 1;
        if (scriptState.chopRounds >= target.missLimit) {
          if (gainsHere > 0) {
            scriptState.felledTiles[target.key] = { at: Date.now(), ms: target.respawnMs };
            if (scriptState.wcTreeGains) delete scriptState.wcTreeGains[target.key];
            log('No gains in ' + scriptState.chopRounds + ' swings at (' + target.key + ') — rotating');
          } else {
            scriptState.wcSoftSkip = scriptState.wcSoftSkip || {};
            scriptState.wcSoftSkip[target.key] = Date.now() + 4000;
            log('Dry spell at (' + target.key + ') — trying other trees, back in 4s');
          }
          scriptState.lastTree = null; scriptState.gainedAtLastTree = false;
          scriptState.chopRounds = 0;
          return 400;
        }
      } else if (scriptState.lastTree && target.key !== scriptState.lastTree) {
        // switched trees — reset the miss counter for the new target
        scriptState.chopRounds = 0;
      }
      scriptState.lastLogsSeen = logsNow;
      scriptState.gainedAtLastTree = false;

      // Walk adjacent to the tree (server withinRange 2)
      var cheb = Math.max(Math.abs(target.x - getX()), Math.abs(target.y - getY()));
      if (cheb > 1) {
        var occ = {};
        for (var fi = 0; fi < TILES.length; fi++) occ[TILES[fi].key] = true;
        for (var fk in scriptState.felledTiles) occ[fk] = true;
        var neigh = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        neigh.sort(function(a, b) {
          var da = Math.abs(target.x + a[0] - getX()) + Math.abs(target.y + a[1] - getY());
          var db = Math.abs(target.x + b[0] - getX()) + Math.abs(target.y + b[1] - getY());
          return da - db;
        });
        // Rotate through neighbors when one is unreachable (pond/fence between):
        // 3 stalled sends → try the next-best adjacent tile instead of hammering.
        var tries = (scriptState._wcAdjKey === target.key) ? (scriptState._wcAdjTries || 0) : 0;
        var adj = null;
        for (var ni = 0; ni < neigh.length; ni++) {
          var cand = neigh[(ni + Math.floor(tries / 3)) % neigh.length];
          var nx = target.x + cand[0], ny = target.y + cand[1];
          if (!occ[nx + ',' + ny]) { adj = { x: nx, y: ny }; break; }
        }
        if (adj) {
          if (getX() === (scriptState._wcAdjX || -9999) && getY() === (scriptState._wcAdjY || -9999)) {
            scriptState._wcAdjTries = tries + 1;
          } else {
            scriptState._wcAdjTries = 0;
            scriptState._wcAdjX = getX(); scriptState._wcAdjY = getY();
          }
          scriptState._wcAdjKey = target.key;
          walkTo(adj.x, adj.y);
          return 900;   // v270: snappy walk→chop transition
        }
      }

      log('Chopping ' + target.name + ' at (' + target.key + ')');
      scriptState.lastTree = target.key;
      atObject(target.x, target.y);
      return CHOP_ACTION_TIME;
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // v280: AIO FISHER — all fishing under one script, multi-select types
  // (miner pattern). APOS parity kept: the 4 APOS ids route here as presets.
  // Core loop = APOS getNearestObjectById before EVERY click (spots relocate);
  // NEVER walkTo(spot) — water tiles are unwalkable (returnSpot stall, v279);
  // server WalkToObjectAction pulls the player into withinRange(1) per click.
  // ═══════════════════════════════════════════════════════════════
  function makeFishingScript(runtimeConfig) {
    var CLICK_CADENCE = 2200;
    var cfg = runtimeConfig || {};

    // ── Type selection: fishTypes (multi, miner-style) else fishType (single) ──
    var typeNames = [];
    if (cfg.fishTypes) {
      for (var tk in cfg.fishTypes) if (cfg.fishTypes[tk] && FISH_TYPES[tk]) typeNames.push(tk);
    }
    if (typeNames.length === 0 && cfg.fishType && FISH_TYPES[cfg.fishType]) typeNames.push(cfg.fishType);
    if (typeNames.length === 0) typeNames.push('Shrimp & Anchovies');

    // ── Level gate + tool/bait check per type; drop unusable types loudly ──
    var toolNames = { 375: 'Lobster Pot (375)', 376: 'Net (376)', 377: 'Fishing Rod (377)',
      378: 'Fly Rod (378)', 379: 'Harpoon (379)', 548: 'Big Net (548)' };
    var lvl = getStatBase(10);   // FISHING = stat index 10 (Skills.java)
    var kept = [];
    for (var ti = 0; ti < typeNames.length; ti++) {
      var T0 = FISH_TYPES[typeNames[ti]];
      if (lvl < T0.level) { log('Skipping ' + typeNames[ti] + ' — need level ' + T0.level + ' (you are ' + lvl + ')'); continue; }
      if (getInventoryIndex(T0.tool) < 0) { log('Skipping ' + typeNames[ti] + ' — no ' + (toolNames[T0.tool] || T0.tool) + ' in inventory'); continue; }
      if (T0.bait > 0 && getInventoryIndex(T0.bait) < 0) { log('Skipping ' + typeNames[ti] + ' — no ' + (T0.bait === 381 ? 'Feathers (381)' : 'Bait (380)')); continue; }
      kept.push({ name: typeNames[ti], T: T0 });
    }
    if (kept.length === 0) {
      return function() {
        log('FISHING ERROR: no usable fish type — checked [' + typeNames.join(',') + '] at lvl ' + lvl +
            '. Each was skipped for level/tool/bait (see lines above). Kit tools via ::item 376/377/378/379/375/548.');
        stopBot();
        return 2000;
      };
    }
    var typeNamesKept = kept.map(function(k) { return k.name; }).join(',');
    var spotIds = [];
    for (var ki = 0; ki < kept.length; ki++) {
      if (spotIds.indexOf(kept[ki].T.spotId) < 0) spotIds.push(kept[ki].T.spotId);
    }
    function typeForSpot(spotId) {
      for (var i = 0; i < kept.length; i++) {
        if (kept[i].T.spotId === spotId) return kept[i];
      }
      return null;
    }
    // Deposit/drop ids: union of all kept types' fish + junk
    var depositIds = [];
    for (var ki2 = 0; ki2 < kept.length; ki2++) {
      for (var fi = 0; fi < kept[ki2].T.fish.length; fi++) {
        if (depositIds.indexOf(kept[ki2].T.fish[fi]) < 0) depositIds.push(kept[ki2].T.fish[fi]);
      }
    }
    for (var ji0 = 0; ji0 < FISH_JUNK_IDS.length; ji0++) {
      if (depositIds.indexOf(FISH_JUNK_IDS[ji0]) < 0) depositIds.push(FISH_JUNK_IDS[ji0]);
    }

    // ── Site: explicit choice if it has a selected spot; else nearest ──
    var siteName = cfg.fishSite;
    var site = (siteName && FISH_SITES[siteName] && FISH_SITES[siteName].spots.some(function(sp) { return spotIds.indexOf(sp[0]) >= 0; })) ? FISH_SITES[siteName] : null;
    if (!site) {
      var bestD = Infinity, bestS = null;
      for (var sn in FISH_SITES) {
        var s = FISH_SITES[sn];
        var has = false;
        for (var si = 0; si < s.spots.length; si++) {
          if (spotIds.indexOf(s.spots[si][0]) >= 0) { has = true; break; }
        }
        if (!has) continue;
        var d = Math.abs(s.stand[0] - getX()) + Math.abs(s.stand[1] - getY());
        if (d < bestD) { bestD = d; bestS = sn; }
      }
      siteName = bestS;
      site = bestS ? FISH_SITES[bestS] : null;
    }
    if (!site) {
      return function() {
        log('FISHING ERROR: no site has spots ' + spotIds.join('/') + ' for [' + typeNamesKept + ']');
        stopBot();
        return 2000;
      };
    }
    // Registry anchors for this site matching our spot ids (last-resort clicks).
    // v281: if filtering leaves nothing (site chosen explicitly without our
    // spots), fall back to ALL site spots — never an empty array.
    var anchors = site.spots.filter(function(sp) { return spotIds.indexOf(sp[0]) >= 0; });
    if (anchors.length === 0) anchors = site.spots;

    var powerMode = (cfg.fishBank === false);
    var dropJunk = (cfg.fishDropJunk !== false) && kept.some(function(k) { return k.name === 'Big Net'; });

    // v297: WALK v3 — PRIMARY full-route pathfinder; FALLBACK adaptive-stride
    // hops ONLY after a 5s position freeze (stale region data after ::tele —
    // measured: full-route walks silently no-op there).
    // v296 bug fixed here: hop mode reverted to full on ANY movement — but
    // hops themselves move 1 tile → oscillation → one tile every ~6s
    // (user-visible: "taking steps one tile at a time"). Now: hop mode STAYS
    // for the walk (full-route re-probed only every 30s), and hops use
    // adaptive stride — 6-8 tile bursts when clear, halving + wall-slide
    // when blocked. v295's always-hop also fixed (full routes primary again).
    function walkTo2(destX, destY) {
      var sKey = 'fsWalk_' + destX + '_' + destY;
      var st = scriptState[sKey];
      if (!st) st = scriptState[sKey] = { px: -9999, py: -9999, lastMove: Date.now(), mode: 'full', stride: 6, fails: 0, slide: 0 };
      var px = getX(), py = getY();
      if (px !== st.px || py !== st.py) {
        st.px = px; st.py = py; st.lastMove = Date.now();
      }
      // v299: OUT-OF-REGION dest → the client A* can NEVER accept it (region
      // is 96×96; dest local Y 118 was refused from the bank). Clamp an
      // intermediate waypoint INSIDE the region along the dest direction —
      // the pathfinder keeps routing around walls/buildings chunk-by-chunk
      // (classic APOS minimap-chunk walk). Hops only if even the clamped
      // dest refuses to move us (stale collision data).
      var mc0 = getMC();
      if (mc0) {
        var lx = destX - (mc0.du || 0), ly = destY - (mc0.dd || 0);
        var plx = px - (mc0.du || 0), ply = py - (mc0.dd || 0);
        var outRegion = lx < 1 || lx > 94 || ly < 1 || ly > 94;
        if (outRegion && st.mode === 'full') {
          // waypoint ON THE LINE toward dest, ~60 tiles out, clamped in-region
          // (v299 bug fixed: stepping ±60 per axis beelined off-line — live
          // detour via (196,478) when the shore was SE. Interpolate instead.)
          var ddx = destX - px, ddy = destY - py;
          var dlen = Math.max(Math.abs(ddx), Math.abs(ddy), 1);
          var step = Math.min(60, dlen);
          var t2x = plx + Math.round(ddx * (step / dlen));
          var t2y = ply + Math.round(ddy * (step / dlen));
          t2x = Math.max(4, Math.min(94, t2x));
          t2y = Math.max(4, Math.min(94, t2y));
          var wx = (mc0.du || 0) + t2x, wy = (mc0.dd || 0) + t2y;
          walkTo(wx, wy);
          log('[WALK2] dest out-of-region — chunked via (' + wx + ',' + wy + ')');
          return false;
        }
      }
      if (st.mode === 'full') {
        if (Date.now() - st.lastMove > 5000) {
          st.mode = 'hop'; st.hopSince = Date.now(); st.stride = 6; st.fails = 0;
          log('Full-route walk stalled — hop-walking (stale region?)');
        } else {
          walkTo(destX, destY);
          return false;
        }
      } else if (Date.now() - (st.hopSince || 0) > 30000) {
        // periodic probe: has the region healed? if not, hop-mode resumes on next stall
        st.mode = 'full'; st.lastMove = 0; st.hopSince = Date.now() + 30000;
        walkTo(destX, destY);
        return false;
      }
      // ── HOP MODE: adaptive stride + wall-slide ──
      var dx = destX - px, dy = destY - py;
      var dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist <= 1) { walkTo(destX, destY); return false; }
      // v298: dest frozen 6+ sends (water/blocked dest) — walk to a NEIGHBOR
      // of the dest instead of beelining into it forever. Measured on rig:
      // Edgeville stand (210,504) was RIVER → every walk refused → hop-slide
      // oscillated in the coffin-house ("rapid unlogical clicking"). A reachable
      // neighbor satisfies the callers (cheb<=2 bank / <=4 stand checks).
      if ((st.fails || 0) >= 6) {
        st.fails = 0;
        var nbrs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
        var bestN = null, bestND = Infinity;
        for (var n2 = 0; n2 < nbrs.length; n2++) {
          var nx2 = destX + nbrs[n2][0], ny2 = destY + nbrs[n2][1];
          var nd2 = Math.abs(nx2 - px) + Math.abs(ny2 - py);
          if (nd2 < bestND) { bestND = nd2; bestN = [nx2, ny2]; }
        }
        st.altDest = bestN;
        if (bestN) {
          log('Dest (' + destX + ',' + destY + ') unreachable — walking to neighbor (' + bestN[0] + ',' + bestN[1] + ')');
          walkTo2(bestN[0], bestN[1]);
          return false;
        }
      }
      if (st.markX === px && st.markY === py) {
        // no movement since last hop → obstacle
        st.fails = (st.fails || 0) + 1;
        if (st.fails >= 2) {
          st.fails = 0;
          if ((st.stride || 6) > 1) {
            st.stride = Math.max(1, Math.floor((st.stride || 6) / 2));
          } else {
            st.slide = (st.slide || 0) + 1;   // stride 1 blocked → sidestep
          }
        }
      } else {
        // movement happened → grow the stride back toward 8
        st.markX = px; st.markY = py;
        st.fails = 0; st.slide = 0;
        st.stride = Math.min(8, (st.stride || 6) + 2);
      }
      var stepX, stepY;
      if ((st.slide || 0) > 0 && (st.stride || 6) === 1) {
        var flip = (st.slide % 2 === 0);
        if (Math.abs(dx) >= Math.abs(dy)) { stepX = px; stepY = py + (flip ? 1 : -1); }
        else { stepX = px + (flip ? 1 : -1); stepY = py; }
      } else {
        var ratio = Math.min(st.stride || 6, dist) / dist;
        stepX = px + Math.round(dx * ratio);
        stepY = py + Math.round(dy * ratio);
      }
      var mc = getMC();
      if (window.__r2h_walk && mc) {
        window.__r2h_walk(mc, mc.bJ || 0, mc.bK || 0, stepX - (mc.du || 0), stepY - (mc.dd || 0), false);
      } else {
        walkTo(stepX, stepY);
      }
      return false;
    }

    function liveSpot() {
      var found = findObjects(spotIds, 24);
      return (found.length > 0) ? { x: found[0].worldX, y: found[0].worldY, id: found[0].id } : null;
    }
    function countFish() {
      var n = 0, inv = getInventoryCount();
      for (var i = 0; i < inv; i++) {
        if (depositIds.indexOf(getInventoryId(i)) >= 0) n++;
      }
      return n;
    }
    function droppableSlots() {
      var out = [], inv = getInventoryCount();
      for (var i = 0; i < inv; i++) {
        if (FISH_KEEP_IDS.indexOf(getInventoryId(i)) < 0) out.push(i);
      }
      return out;
    }

    return function() {
      if (!isLoggedIn()) return 5000;

      // ══ INIT ══
      if (scriptState.phase === 'init') {
        scriptState.fsSpot = { x: anchors[0][1], y: anchors[0][2], id: anchors[0][0] };
        scriptState.fsSite = siteName;
        scriptState.fsBankName = powerMode ? null : site.bank;
        scriptState.fsBankTile = powerMode ? null : BANK_REGISTRY[site.bank];
        scriptState.fsCatches = 0;
        scriptState.fsLastCount = countFish();
        scriptState.phase = 'toSpot';
        log('Fishing v281: [' + typeNamesKept + '] @ ' + siteName +
            ' mode=' + (powerMode ? 'POWER-FISH (drop)' : 'BANK → ' + site.bank) + ' lvl=' + lvl +
            (dropJunk ? ' junk-drop ON' : ''));
      }

      // ══ FATIGUE / SLEEP ══
      if (getIsSleeping()) {
        if (!scriptState.sleepTyping) {
          scriptState.sleepTyping = true;
          var sleepWord = 'asleep';
          for (var ci = 0; ci < sleepWord.length; ci++) window.__r2hTypeChar(sleepWord[ci]);
          setTimeout(function() {
            window.__r2hTypeSpecial('Enter');
            scriptState.sleepTyping = false;
          }, 500);
        }
        return 2000;
      }
      var fatigue = getFatigue();
      if (fatigue >= 90) {
        var bagSlot = getInventoryIndex(SLEEPING_BAG);
        if (bagSlot >= 0) { log('Fatigue ' + fatigue + '% — using sleeping bag'); useItem(bagSlot); return 3000; }
      }

      var invCount = getInventoryCount();
      var fishNow = countFish();
      if (fishNow > (scriptState.fsLastCount || 0)) {
        scriptState.fsCatches += fishNow - (scriptState.fsLastCount || 0);
        if (scriptState.fsCatches % 10 === 0) log('Catches: ' + scriptState.fsCatches);
      }
      scriptState.fsLastCount = fishNow;

      // ══ BAIT RUN-OUT: drop that type, keep the others; stop if none left ══
      for (var bi = kept.length - 1; bi >= 0; bi--) {
        if (kept[bi].T.bait > 0 && getInventoryIndex(kept[bi].T.bait) < 0) {
          log(kept[bi].name + ': out of bait — type disabled (' + scriptState.fsCatches + ' catches so far)');
          kept.splice(bi, 1);
        }
      }
      if (kept.length === 0) {
        log('All types out of bait — stopping');
        stopBot(); return 1000;
      }

      // ══ PHASE: TO SPOT — live scan first; NEVER walkTo(spot) ══
      if (scriptState.phase === 'toSpot') {
        var live0 = liveSpot();
        if (live0) {
          scriptState.phase = 'fish';
          scriptState.fsSpot = live0;
          log('Live spot id ' + live0.id + ' at (' + live0.x + ',' + live0.y + ') — clicking');
          return 400;
        }
        // v286: already ADJACENT to a matching anchor? Skip the stand walk
        // entirely — go click (live: bot at (410,503) next to spot (409,504)
        // kept walking to the stand because the scan was stale).
        for (var aai = 0; aai < anchors.length; aai++) {
          if (Math.max(Math.abs(anchors[aai][1] - getX()), Math.abs(anchors[aai][2] - getY())) <= 1) {
            scriptState.fsSpot = { x: anchors[aai][1], y: anchors[aai][2], id: anchors[aai][0] };
            scriptState.phase = 'fish';
            log('Already adjacent to anchor (' + anchors[aai][1] + ',' + anchors[aai][2] + ') — clicking');
            return 400;
          }
        }
        var dStand = Math.abs(site.stand[0] - getX()) + Math.abs(site.stand[1] - getY());
        if (dStand > 4) {
          walkTo2(site.stand[0], site.stand[1]);
          return 1500;
        }
        var bestA = null, bestAD = Infinity;
        for (var ai2 = 0; ai2 < anchors.length; ai2++) {
          var ad = Math.abs(anchors[ai2][1] - getX()) + Math.abs(anchors[ai2][2] - getY());
          if (ad < bestAD) { bestAD = ad; bestA = anchors[ai2]; }
        }
        if (bestA) {
          scriptState.fsSpot = { x: bestA[1], y: bestA[2], id: bestA[0] };
          scriptState.phase = 'fish';
          log('No live scan (object array can be stale) — starting anchor rotation at (' + bestA[1] + ',' + bestA[2] + ') id ' + bestA[0]);
          return 400;
        }
        log('FISHING ERROR: no spot at ' + siteName);
        stopBot();
        return 2000;
      }

      // ══ PHASE: TO BANK ══
      if (scriptState.phase === 'toBank') {
        var chebBank = Math.max(Math.abs(scriptState.fsBankTile[0] - getX()), Math.abs(scriptState.fsBankTile[1] - getY()));
        if (chebBank <= 2) {
          scriptState.phase = 'bankTalk';
          scriptState._wcBankerMisses = 0;
          return 400;
        }
        walkTo2(scriptState.fsBankTile[0], scriptState.fsBankTile[1]);
        return 1500;
      }

      // ══ PHASE: BANK CLOSE (v291) — verified close before walking. A single
      // closeBank() could silently fail to clear the session; with the screen
      // open server-side, ALL walk packets are dropped and the bot freezes at
      // the bank (live: shafster 23:01 Catherby — deposited, never returned).
      // Re-send close until the flag actually clears; escalate to a re-talk. ══
      if (scriptState.phase === 'bankClose') {
        if (!isInBank()) {
          log('Bank closed — returning to shore');
          scriptState.phase = 'returnSpot';
          scriptState._fsRetX = -9999; scriptState._fsRetT = 0;
          return 400;
        }
        if (Date.now() - (scriptState._fsCloseT || 0) > 1200) {
          closeBank();
          scriptState._fsCloseT = Date.now();
          scriptState._fsCloseTries = (scriptState._fsCloseTries || 0) + 1;
          if (scriptState._fsCloseTries % 4 === 0) log('Bank still open after ' + scriptState._fsCloseTries + ' close attempts');
        }
        if (scriptState._fsCloseTries > 12) {
          log('Bank will not close — restarting talk cycle');
          scriptState.phase = 'bankTalk';
          scriptState._fsCloseTries = 0;
        }
        return 800;
      }

      // ══ PHASE: RETURN — hop-walk to the stand (v294: raw 6-tile hops pass
      // doorways and dodge the client pathfinder's long-route failure) ══
      if (scriptState.phase === 'returnSpot') {
        if (isInBank()) { scriptState.phase = 'bankClose'; return 400; }
        var dStand2 = Math.abs(site.stand[0] - getX()) + Math.abs(site.stand[1] - getY());
        if (dStand2 <= 4) {
          scriptState.phase = 'fish';
          log('Back at shore — re-scanning for spot');
          return 400;
        }
        walkTo2(site.stand[0], site.stand[1]);
        return 1200;
      }

      // ══ BANK MACHINE (miner-proven talk→option→deposit) ══
      if (scriptState.phase === 'bankTalk') {
        var banker = findNpcs(WC_BANKER_IDS, 3);
        if (banker.length > 0) {
          log('Talking to banker (idx=' + banker[0].serverIndex + ')');
          talkToNpc(banker[0].serverIndex);
          scriptState._wcBankTimer = Date.now();
          scriptState.phase = 'bankOption';
          return 2000;
        }
        walkTo(scriptState.fsBankTile[0], scriptState.fsBankTile[1]);
        scriptState._wcBankerMisses = (scriptState._wcBankerMisses || 0) + 1;
        if (scriptState._wcBankerMisses >= 12) {
          log('ERROR: no banker near ' + scriptState.fsBankName + ' — stopping');
          stopBot(); return 2000;
        }
        return 1500;
      }
      if (scriptState.phase === 'bankOption') {
        if (isInBank()) { scriptState.phase = 'bankDeposit'; return 500; }
        if (Date.now() - scriptState._wcBankTimer > 2000) {
          optionAnswer(0);
          scriptState._wcBankTimer = Date.now();
        }
        if (Date.now() - (scriptState._wcBankTalkStart || scriptState._wcBankTimer) > 12000) {
          log('Bank not opening — retrying talk');
          scriptState.phase = 'bankTalk';
          scriptState._wcBankTalkStart = Date.now();
        }
        return 1500;
      }
      if (scriptState.phase === 'bankDeposit') {
        if (!isInBank()) {
          if (Date.now() - (scriptState._wcBankTimer || 0) > 8000) {
            log('Bank flag not set — retrying talk');
            scriptState.phase = 'bankTalk';
          }
          return 1500;
        }
        var deposited = 0;
        for (var di = 0; di < depositIds.length; di++) {
          if (getInventoryIndex(depositIds[di]) >= 0) {
            log('Depositing item id ' + depositIds[di] + ' x9999');
            depositItem(depositIds[di], 9999);
            deposited++;
            break;   // one deposit per tick
          }
        }
        if (deposited === 0) {
          scriptState.fsSweepSkip = scriptState.fsSweepSkip || [];
          for (var di2 = 0; di2 < getInventoryCount(); di2++) {
            var idLeft = getInventoryId(di2);
            if (idLeft > 0 && FISH_KEEP_IDS.indexOf(idLeft) < 0 && scriptState.fsSweepSkip.indexOf(idLeft) < 0) {
              // v291: an unbankable leftover loops here forever (server silently
              // rejects the deposit, item never leaves) — after 4 failed sweeps
              // of the SAME id, name it, skip it, move on.
              scriptState.fsSweepSame = (scriptState.fsSweepSameId === idLeft) ? (scriptState.fsSweepSame || 0) + 1 : 1;
              scriptState.fsSweepSameId = idLeft;
              if (scriptState.fsSweepSame >= 4) {
                log('Sweep stuck on item ' + idLeft + ' (unbankable?) — leaving it in inventory, continuing');
                scriptState.fsSweepSkip.push(idLeft);
                continue;
              }
              log('Sweeping leftover item id ' + idLeft);
              depositItem(idLeft, 9999);
              deposited++;
              break;
            }
          }
        }
        if (deposited === 0) {
          scriptState.fsTrips = (scriptState.fsTrips || 0) + 1;
          log('Banked (trip ' + scriptState.fsTrips + ', ' + scriptState.fsCatches + ' catches) — closing bank');
          closeBank();
          scriptState._fsCloseTries = 1;
          scriptState._fsCloseT = Date.now();
          scriptState.phase = 'bankClose';
        }
        return 1200;
      }

      // ══ FULL INVENTORY: junk → power-drop → bank ══
      if (invCount >= 30) {
        if (dropJunk) {
          for (var ji = 0; ji < invCount; ji++) {
            if (FISH_JUNK_IDS.indexOf(getInventoryId(ji)) >= 0) {
              dropItem(ji);
              return 700;
            }
          }
        }
        if (powerMode) {
          var slots = droppableSlots();
          if (slots.length > 0) { dropItem(slots[0]); return 700; }
          return 600;
        }
        log('Inventory full — banking at ' + scriptState.fsBankName);
        scriptState.phase = 'toBank';
        return 800;
      }

      // ══ FISH — v285: server needs withinRange(spot,1); spots are water.
      // Walk to an ADJACENT LAND tile, then click the spot. Land discovery is
      // empirical: try neighbor candidates (nearest-to-player first); a water
      // candidate produces NO movement — 2 stalled sends → next candidate.
      // Winning tile cached per anchor; cleared when the spot relocates. ══
      var chebSpot2 = Math.max(Math.abs(scriptState.fsSpot.x - getX()), Math.abs(scriptState.fsSpot.y - getY()));
      if (chebSpot2 > 1) {
        var akey = scriptState.fsSpot.x + ',' + scriptState.fsSpot.y;
        scriptState.fsAdjCache = scriptState.fsAdjCache || {};
        var adjT = scriptState.fsAdjCache[akey];
        if (!adjT) {
          var cands = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
          cands.sort(function(a, b) {
            var da = Math.abs(scriptState.fsSpot.x + a[0] - getX()) + Math.abs(scriptState.fsSpot.y + a[1] - getY());
            var db = Math.abs(scriptState.fsSpot.x + b[0] - getX()) + Math.abs(scriptState.fsSpot.y + b[1] - getY());
            return da - db;
          });
          var ci4 = (scriptState.fsAdjTry || 0) % cands.length;
          adjT = { x: scriptState.fsSpot.x + cands[ci4][0], y: scriptState.fsSpot.y + cands[ci4][1] };
        }
        var bx4 = getX(), by4 = getY();
        walkTo(adjT.x, adjT.y);
        // stall detection between ticks
        if (scriptState.fsAdjSentX === bx4 && scriptState.fsAdjSentY === by4 && scriptState.fsAdjSentX !== undefined) {
          scriptState.fsAdjStall = (scriptState.fsAdjStall || 0) + 1;
          if (scriptState.fsAdjStall >= 2) {
            delete scriptState.fsAdjCache[akey];          // this tile is dead (water/unreachable)
            scriptState.fsAdjTry = (scriptState.fsAdjTry || 0) + 1;
            scriptState.fsAdjStall = 0;
            scriptState.fsAdjFail = (scriptState.fsAdjFail || 0) + 1;
            log('Adjacent tile (' + adjT.x + ',' + adjT.y + ') unreachable — trying next');
            // v287: all neighbors failing = wrong bank / spot mid-river —
            // escalate to the NEXT ANCHOR instead of looping one spot forever
            if (scriptState.fsAdjFail >= 4 && anchors.length > 1) {
              var ci5 = -1;
              for (var rai2 = 0; rai2 < anchors.length; rai2++) {
                if (anchors[rai2][1] === scriptState.fsSpot.x && anchors[rai2][2] === scriptState.fsSpot.y) { ci5 = rai2; break; }
              }
              var nextA2 = anchors[(ci5 + 1) % anchors.length];
              scriptState.fsSpot = { x: nextA2[1], y: nextA2[2], id: nextA2[0] };
              scriptState.fsAdjFail = 0;
              scriptState.fsAdjTry = 0;
              log('All adjacents failed — switching anchor to (' + nextA2[1] + ',' + nextA2[2] + ')');
            }
          }
        } else {
          scriptState.fsAdjStall = 0;
          scriptState.fsAdjSentX = bx4; scriptState.fsAdjSentY = by4;
          if (!scriptState.fsAdjCache[akey]) scriptState.fsAdjCache[akey] = adjT;  // moving = land
        }
        return 1200;
      }
      var live = liveSpot();
      if (live) {
        scriptState.fsSpot = live;
        scriptState.fsAnchorTries = 0;
      } else {
        // STALE-ARRAY MODE: rotate anchors on a dry streak
        scriptState.fsAnchorTries = (scriptState.fsAnchorTries || 0) + 1;
        var TRIES_PER_ANCHOR = 3;
        if (scriptState.fsAnchorTries > TRIES_PER_ANCHOR && typeof scriptState.fsFishAtAnchorStart === 'number') {
          var gained = fishNow - scriptState.fsFishAtAnchorStart;
          if (gained <= 0) {
            var curIdx = -1;
            for (var rai = 0; rai < anchors.length; rai++) {
              if (anchors[rai][1] === scriptState.fsSpot.x && anchors[rai][2] === scriptState.fsSpot.y) { curIdx = rai; break; }
            }
            var nextA = anchors[(curIdx + 1) % anchors.length];
            scriptState.fsSpot = { x: nextA[1], y: nextA[2], id: nextA[0] };
            scriptState.fsAnchorTries = 0;
            scriptState.fsFishAtAnchorStart = fishNow;
            log('Anchor dry — rotating to (' + nextA[1] + ',' + nextA[2] + ') id ' + nextA[0]);
          } else {
            scriptState.fsAnchorTries = 0;
            scriptState.fsFishAtAnchorStart = fishNow;
          }
        } else if (typeof scriptState.fsFishAtAnchorStart !== 'number') {
          scriptState.fsFishAtAnchorStart = fishNow;
        }
      }
      var KT = typeForSpot(scriptState.fsSpot.id);
      if (!KT) KT = kept[0];
      if (KT.T.cmd === 2) atObject2(scriptState.fsSpot.x, scriptState.fsSpot.y);
      else atObject(scriptState.fsSpot.x, scriptState.fsSpot.y);
      return CLICK_CADENCE;
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // v308: FIREMAKING — two modes, APOS Abyte0_Firemaking as blueprint:
  //   BANK MODE  (default): nearest bank → withdraw tinderbox + selected logs →
  //                        walk to open area → light fire lines (west→east runs)
  //   CHOP MODE  (fmMode:'chop'): axe + tinderbox → find nearest tree (object
  //                        scan, NOT hardcoded paths) → chop until a log lands →
  //                        drop & light at feet → next tree. Runs for hours —
  //                        no banking at all (APOS behavior).
  // Light mechanics (v304, live-proven): drop log → op 250 tinderbox-on-ground-log
  // → XP-gain success detect (client arrays ghost) → step east. FM = stat 11.
  // ═══════════════════════════════════════════════════════════════

  function makeFiremakingScript(runtimeConfig) {
    var cfg = runtimeConfig || {};
    var FM_MODE = cfg.fmMode || 'bank';                       // 'bank' | 'chop'
    var LOG_TYPES = { normal: LOG_NORMAL, oak: LOG_OAK, willow: LOG_WILLOW, maple: LOG_MAPLE, yew: LOG_YEW, magic: LOG_MAGIC };
    // v312: log level requirements (server FiremakingDef.xml — the roll
    // hard-fails below these; live 2026-08-29 00:17: oak attempts at FM<15
    // dropped 10 logs, zero fires, looped through the bank stock)
    var FM_LOG_LEVELS = { normal: 1, oak: 15, willow: 30, maple: 45, yew: 60, magic: 75 };
    var logId = LOG_TYPES[cfg.fmLogs] || LOG_NORMAL;
    var bankName = cfg.fmBank || 'Auto (nearest)';   // v309: auto-detect default
    var FM_LIGHT_OFFSETS = {
      'Draynor': [-4, 8], 'Edgeville': [-4, 8], 'Varrock West': [-4, 8],
      'Varrock East': [4, 8], 'Falador East': [-4, 8], 'Falador West': [-4, 8],
      'Seers': [4, 8], 'Ardougne North': [-4, 8], 'Ardougne South': [-4, 8],
      'Yanille': [-4, 8], 'Al-Kharid': [-4, 8], 'Catherby': [-4, 8]
    };

    function fmXp() {
      var mc = getMC();
      return mc && mc.kN && mc.kN.data ? Number(mc.kN.data[11]) : 0;
    }
    function countLogs() {
      // v308d: same discipline as getInventoryCount (v246/v249): slots >= cU
      // hold stale ghost ids (never cleared — classes.js opcode 252). If the
      // [0,cU) window holds ANY item it is sane → count logs ONLY within it;
      // all-30 fallback is for the cU-desynced-LOW case (window empty, items real).
      var mc = getMC();
      var cu = Number(mc.cU || 0);
      var windowHasItems = false, nWindow = 0, nAll = 0;
      for (var i = 0; i < 30; i++) {
        var id = getInventoryId(i);
        if (!id) continue;
        if (i < cu) {
          windowHasItems = true;
          if (id === logId) nWindow++;
        }
        if (id === logId) nAll++;
      }
      return windowHasItems ? nWindow : nAll;
    }
    function hasKit(kitId) { return getInventoryIndex(kitId) >= 0; }
    function hasAxe() {
      for (var ai = 0; ai < AXE_IDS.length; ai++) {
        if (getInventoryIndex(AXE_IDS[ai]) >= 0 || isItemIdEquipped(AXE_IDS[ai])) return true;
      }
      return false;
    }
    // v308c: TREE REGISTRY (server SceneryLocs truth — the WC v263 lesson:
    // client object lists are stale; chop packets at registry tiles, the server
    // no-ops on stumps). 81 Draynor-woodland normal trees.
    var FM_TREES = [
      {x:190,y:625}, {x:190,y:628}, {x:190,y:631}, {x:190,y:644}, {x:190,y:665}, {x:191,y:647},
      {x:192,y:628}, {x:192,y:632}, {x:192,y:655}, {x:192,y:665}, {x:193,y:648}, {x:193,y:657},
      {x:193,y:662}, {x:193,y:667}, {x:194,y:645}, {x:194,y:651}, {x:194,y:654}, {x:194,y:660},
      {x:194,y:664}, {x:195,y:627}, {x:195,y:652}, {x:195,y:655}, {x:195,y:659}, {x:196,y:657},
      {x:196,y:665}, {x:196,y:668}, {x:197,y:628}, {x:197,y:631}, {x:197,y:645}, {x:197,y:661},
      {x:198,y:652}, {x:198,y:658}, {x:198,y:663}, {x:198,y:665}, {x:198,y:668}, {x:199,y:632},
      {x:199,y:644}, {x:199,y:659}, {x:199,y:666}, {x:199,y:669}, {x:200,y:648}, {x:200,y:650},
      {x:200,y:652}, {x:200,y:662}, {x:201,y:627}, {x:201,y:633}, {x:201,y:635}, {x:201,y:645},
      {x:201,y:646}, {x:201,y:655}, {x:201,y:657}, {x:201,y:660}, {x:201,y:663}, {x:202,y:646},
      {x:202,y:665}, {x:203,y:644}, {x:204,y:631}, {x:204,y:635}, {x:204,y:652}, {x:204,y:656},
      {x:205,y:642}, {x:206,y:634}, {x:206,y:637}, {x:206,y:639}, {x:206,y:643}, {x:206,y:658},
      {x:206,y:661}, {x:207,y:630}, {x:207,y:641}, {x:208,y:645}, {x:208,y:656}, {x:209,y:631},
      {x:210,y:639}, {x:212,y:634}, {x:212,y:638}, {x:212,y:643}, {x:213,y:636}, {x:213,y:659},
      {x:213,y:663}, {x:214,y:652}, {x:226,y:617}
    ];
    // nearest registry tree (skips known-felled)
    function nearestTree() {
      var best = null, bestD = Infinity;
      for (var i = 0; i < FM_TREES.length; i++) {
        var t = FM_TREES[i];
        var k = t.x + ',' + t.y;
        if (scriptState.fmFelled && scriptState.fmFelled[k]) continue;
        var d = Math.abs(t.x - getX()) + Math.abs(t.y - getY());
        if (d < bestD) { bestD = d; best = { worldX: t.x, worldY: t.y }; }
      }
      return best;
    }

    return function() {
      if (!isLoggedIn()) return 5000;

      // ══ INIT ══
      if (scriptState.phase === 'init') {
        var lvl = getStatBase(11);
        // v309: Auto bank — nearest bank to the player (cooking's auto-site pattern)
        if (bankName === 'Auto (nearest)') {
          var bestB = null, bestBD = Infinity;
          for (var bn in BANK_REGISTRY) {
            var bd = Math.abs(BANK_REGISTRY[bn][0] - getX()) + Math.abs(BANK_REGISTRY[bn][1] - getY());
            if (bd < bestBD) { bestBD = bd; bestB = bn; }
          }
          bankName = bestB || 'Draynor';
          log('FM bank auto-detected: ' + bankName + ' (' + bestBD + ' tiles)');
        }
        log('Firemaking v308 [' + FM_MODE + ' mode]: lvl=' + lvl + ' logs=' + (cfg.fmLogs || 'normal') + ' bank=' + bankName);
        // v312: level gate (server roll hard-fails below req — port of cooking's
        // food-level check; live: oak @ FM<15 looped zero-fire attempts)
        var needLvl = FM_LOG_LEVELS[cfg.fmLogs] || 1;
        if (lvl < needLvl) {
          log('Need Firemaking level ' + needLvl + ' for ' + (cfg.fmLogs || 'normal') + ' logs (you are ' + lvl + ') — stopping');
          stopBot(); return 2000;
        }
        scriptState.fmLit = 0; scriptState.fmFail = 0;
        scriptState.phase = (FM_MODE === 'chop') ? 'chop' : 'toBankLight';
      }

      // ══ FATIGUE / SLEEP ══
      if (getIsSleeping()) {
        if (!scriptState.sleepTyping) {
          scriptState.sleepTyping = true;
          var sw = 'asleep';
          for (var ci = 0; ci < sw.length; ci++) window.__r2hTypeChar(sw[ci]);
          setTimeout(function() {
            window.__r2hTypeSpecial('Enter');
            scriptState.sleepTyping = false;
          }, 500);
        }
        return 2000;
      }
      if (getFatigue() >= 96) {
        var bagSlot = getInventoryIndex(SLEEPING_BAG);
        if (bagSlot >= 0) { log('Fatigue ' + getFatigue() + '% — sleeping'); useItem(bagSlot); return 3000; }
      }

      // ══ LIGHT LOOP (shared core — both modes) ══
      if (scriptState.phase === 'light') {
        var nLogs = countLogs();
        if (scriptState.fmAttempt) {
          var xpNow = fmXp();
          if (xpNow > (scriptState.fmXp0 || 0)) {
            scriptState.fmLit++;
            // v311: record the lit tile — never drop on it again this session
            scriptState.fmFireTiles = scriptState.fmFireTiles || {};
            scriptState.fmFireTiles[scriptState.fmDropX + ',' + scriptState.fmDropY] = 1;
            // v313: the ground log was CONSUMED by the fire — no pending re-use
            scriptState.fmPendingDrop = null;
            if (scriptState.fmLit % 5 === 0) log('Fires lit: ' + scriptState.fmLit + ' (fails ' + (scriptState.fmFail || 0) + ')');
            scriptState.fmAttempt = 0;
            scriptState.fmLastXpT = Date.now();
            scriptState.fmXPAtLast = xpNow;
            walkTo(getX() + 1, getY());          // off the fire tile (east line)
            return 800;
          }
          if (Date.now() - scriptState.fmAttempt > 8000) {
            scriptState.fmFail++;
            scriptState.fmAttempt = 0;            // re-roll same ground log next tick
            // v312: ZERO successes + mounting fails = the log type can't light
            // (level gate missed / tile class). Cap at 12 consecutive zero-light
            // fails with NO lit fires this run → stop, don't eat the bank stock.
            if ((scriptState.fmFail || 0) >= 12 && !(scriptState.fmLit > 0)) {
              log('12 failed lights, 0 fires — logs cannot light (level? tile?) — stopping');
              stopBot(); return 2000;
            }
            if (scriptState.fmFail % 5 === 0) {
              // 5 straight fails: tile refusing (fire below/shoreline) — abandon,
              // step to a fresh tile (east, else south — shore-end safe)
              walkTo(getX() + 1, getY());
              if (scriptState.fmFail % 10 === 0) walkTo(getX(), getY() + 1);
              log('Tile refusing lights (fails ' + scriptState.fmFail + ') — stepping on');
            }
            return 600;
          }
          return 1000;
        }
        // OUT-OF-LOGS detection — inventory count GHOSTS after drops (live-proven
        // this session: logs=27 forever while XP climbed). Truth = XP stalls:
        // 45s without a gain while in light phase → the drops aren't landing →
        // no real logs left → mode transition.
        if (Date.now() - (scriptState.fmLastXpT || Date.now()) > 45000) {
          if (FM_MODE === 'chop') { scriptState.phase = 'chop'; return 400; }
          scriptState.fmBankTrips = (scriptState.fmBankTrips || 0) + 1;
          if (scriptState.fmBankTrips > 1 && (fmXp() || 0) === (scriptState.fmXPAtBank || 0)) {
            log('Bank out of logs — done. Fires lit: ' + scriptState.fmLit);
            stopBot(); return 1000;
          }
          scriptState.fmXPAtBank = fmXp();
          scriptState.fmLastXpT = Date.now();
          log('Out of logs — returning to bank');
          scriptState.phase = 'toBankLight';
          return 800;
        }
        if (nLogs === 0 && Date.now() - (scriptState.fmLastXpT || Date.now()) > 8000) {
          if (FM_MODE === 'chop') { scriptState.phase = 'chop'; return 400; }
          log('Firemaking done: ' + scriptState.fmLit + ' fires lit, ' + (scriptState.fmFail || 0) + ' failed rolls');
          stopBot(); return 1000;
        }
        if (!hasKit(TINDERBOX)) { log('Tinderbox lost — stopping'); stopBot(); return 1000; }
        var px = getX(), py = getY();
        // v311: FIRE-TILE GUARD — you may NOT drop a log on a burning tile
        // ("You can't light a fire here" / server rejects the drop target).
        // A tile is fire-blocked if (a) we lit a fire on it this session
        // (fmFireTiles — client object arrays ghost, position-tracked instead),
        // or (b) an object id 97 is visible at it. If blocked, spiral-search a
        // FREE adjacent tile and walk there first.
        function fmTileBlocked(x, y) {
          if (scriptState.fmFireTiles && scriptState.fmFireTiles[x + ',' + y]) return true;
          var objs = findObjects([97], 1);
          for (var oi = 0; oi < objs.length; oi++) {
            if (objs[oi].worldX === x && objs[oi].worldY === y) return true;
          }
          return false;
        }
        if (fmTileBlocked(px, py)) {
          // find nearest free tile (8-neighborhood, then ring 2)
          var freeT = null;
          var ring = [[1,0],[0,1],[1,1],[-1,0],[0,-1],[-1,-1],[1,-1],[-1,1],
                      [2,0],[0,2],[-2,0],[0,-2],[2,1],[1,2],[-1,2],[-2,1]];
          for (var ri = 0; ri < ring.length; ri++) {
            var cx3 = px + ring[ri][0], cy3 = py + ring[ri][1];
            if (!fmTileBlocked(cx3, cy3)) { freeT = [cx3, cy3]; break; }
          }
          if (freeT) {
            walkTo(freeT[0], freeT[1]);
            if (!scriptState.fmFreeTried || scriptState.fmFreeTried !== freeT[0] + ',' + freeT[1]) {
              scriptState.fmFreeTried = freeT[0] + ',' + freeT[1];
              log('Fire tile occupied — moving to (' + freeT[0] + ',' + freeT[1] + ')');
            }
            return 1000;
          }
          log('No free fire tile nearby — stepping east');
          walkTo(px + 1, py);
          return 1200;
        }
        var slot = getInventoryIndex(logId);
        if (slot < 0) {
          // no log in inventory AND no attempt pending — the count was ghost;
          // don't idle: chop mode → back to chopping; bank mode → resupply.
          // (The XP-stall path also covers this, but immediate = no 45s stall.)
          scriptState.fmAttempt = 0;
          if (FM_MODE === 'chop') { scriptState.phase = 'chop'; return 400; }
          scriptState.phase = 'toBankLight';
          return 800;
        }
        // v313: ONE log on the ground per tile. If a dropped log still lies at
        // our drop tile (failed light — server leaves it), RE-USE it: send the
        // tinderbox-use again, NEVER drop a second log on the pile. (Live
        // 2026-08-29 00:17: oak fails stacked logs 2-deep in the bank area.)
        if (scriptState.fmPendingDrop &&
            scriptState.fmPendingDrop.x === px && scriptState.fmPendingDrop.y === py) {
          var tS0 = getInventoryIndex(TINDERBOX);
          if (tS0 >= 0) {
            sendRaw(250, 346, function(stream, Z) {
              Z(stream, scriptState.fmPendingDrop.x);
              Z(stream, scriptState.fmPendingDrop.y);
              Z(stream, logId);
              Z(stream, tS0);
            });
            scriptState.fmAttempt = Date.now();
            scriptState.fmQuiet = Date.now() + 4000;
            return 1500;
          }
        }
        dropItem(slot);
        scriptState.fmDropX = px; scriptState.fmDropY = py;
        scriptState.fmPendingDrop = { x: px, y: py };   // v313: re-use until consumed
        scriptState.fmXp0 = fmXp();
        var tS = getInventoryIndex(TINDERBOX);
        sendRaw(250, 346, function(stream, Z) {
          Z(stream, px); Z(stream, py); Z(stream, logId); Z(stream, tS);
        });
        scriptState.fmAttempt = Date.now();
        scriptState.fmQuiet = Date.now() + 4000;
        return 1500;
      }
      if (Date.now() < (scriptState.fmQuiet || 0)) return 1000;   // post-click silence

      // ══ CHOP MODE (APOS Abyte0_Firemaking blueprint) ══
      if (scriptState.phase === 'chop') {
        if (countLogs() > 0) { scriptState.phase = 'light'; return 300; }
        if (!hasKit(TINDERBOX)) { log('No tinderbox — stopping (bring id 166)'); stopBot(); return 2000; }
        if (!hasAxe()) { log('No axe — stopping (bring any axe)'); stopBot(); return 2000; }
        // fire on our tile? step east before chopping
        var footFire = false;
        var objs97 = findObjects([97], 0);
        if (objs97.length > 0) footFire = true;
        if (footFire) { walkTo(getX() + 1, getY()); return 800; }
        var tree = nearestTree();
        if (!tree) {
          // no tree in scan range — walk toward the DENSEST verified woodland
          // cells (server SceneryLocs density map): Draynor west/southwest woods
          var cells = [[197,665],[197,655],[202,646],[207,632]];
          if (!scriptState.fmWoodsIdx || Date.now() - (scriptState.fmWoodsT || 0) > 15000) {
            scriptState.fmWoodsIdx = (scriptState.fmWoodsIdx === undefined ? 0 : (scriptState.fmWoodsIdx + 1) % cells.length);
            scriptState.fmWoodsT = Date.now();
            scriptState.fmWoodsTarget = cells[scriptState.fmWoodsIdx];
          }
          var wt = scriptState.fmWoodsTarget || cells[0];
          if (Date.now() - (scriptState.fmTreeMissT || 0) > 4000) {
            scriptState.fmTreeMissT = Date.now();
            walkTo(wt[0] + Math.floor(Math.random() * 3), wt[1] + Math.floor(Math.random() * 3));
            log('No trees nearby — heading to woodland cell ' + wt.join(','));
          }
          return 1500;
        }
        var tCheb = Math.max(Math.abs(tree.worldX - getX()), Math.abs(tree.worldY - getY()));
        if (tCheb > 1) {
          if (Date.now() - (scriptState.fmTreeWalkT || 0) > 2500) {
            scriptState.fmTreeWalkT = Date.now();
            walkTo(tree.worldX, tree.worldY);
          }
          return 1000;
        }
        atObject(tree.worldX, tree.worldY);
        // felled tracking: no log after 8s of chopping this tree → mark felled,
        // move to next (stumps are server-side no-ops); clear all marks every
        // 10 minutes (trees respawn)
        if (scriptState.fmChopTree !== tree.worldX + ',' + tree.worldY) {
          scriptState.fmChopTree = tree.worldX + ',' + tree.worldY;
          scriptState.fmChopT = Date.now();
        } else if (Date.now() - scriptState.fmChopT > 8000) {
          scriptState.fmFelled = scriptState.fmFelled || {};
          scriptState.fmFelled[scriptState.fmChopTree] = 1;
          var fc = 0;
          for (var fk in scriptState.fmFelled) fc++;
          if (fc > 60) scriptState.fmFelled = {};   // respawn cycle — reset all
          log('Tree felled/exhausted at ' + scriptState.fmChopTree + ' — next tree');
        }
        return 1200;
      }

      // ══ BANK MODE ══
      if (scriptState.phase === 'toBankLight') {
        var bt = BANK_REGISTRY[bankName];
        if (!bt) { log('Unknown bank ' + bankName + ' — stopping'); stopBot(); return 2000; }
        var cheb = Math.max(Math.abs(bt[0] - getX()), Math.abs(bt[1] - getY()));
        if (cheb <= 2) { scriptState.phase = 'fmBankTalk'; scriptState._fmBankerMisses = 0; return 400; }
        walkTo(bt[0], bt[1]);
        if (scriptState.fmBX === getX() && scriptState.fmBY === getY()) {
          if (Date.now() - (scriptState.fmBT || 0) > 4000) {
            scriptState.fmBT = Date.now();
            walkTo(bt[0] + 2, bt[1] + 2);   // nudge
          }
        } else { scriptState.fmBX = getX(); scriptState.fmBY = getY(); scriptState.fmBT = Date.now(); }
        return 1200;
      }
      if (scriptState.phase === 'fmBankTalk') {
        var BANKER_IDS = [95, 224, 268, 485, 540, 617];
        var banker = findNpcs(BANKER_IDS, 4);
        if (banker.length > 0) {
          log('Talking to banker');
          talkToNpc(banker[0].serverIndex);
          scriptState.fmBankTimer = Date.now();
          scriptState.phase = 'fmBankOption';   // cooking pattern: switch NOW,
          // option phase answers + retries; 12s no-bank → re-talk
          return 2000;
        }
        // NPC array ghost after long walks — re-walk the bank tile each miss
        // (cooking bankTalk pattern); the scan recovers within ~2 tiles
        scriptState._fmBankerMisses = (scriptState._fmBankerMisses || 0) + 1;
        if (scriptState._fmBankerMisses % 3 === 1) {
          var btM = BANK_REGISTRY[bankName];
          walkTo(btM[0], btM[1]);
        }
        if (scriptState._fmBankerMisses >= 12) { log('No banker found — stopping'); stopBot(); return 2000; }
        return 1500;
      }
      if (scriptState.phase === 'fmBankOption') {
        if (isInBank()) { scriptState.phase = 'fmWithdraw'; return 500; }
        if (Date.now() - scriptState.fmBankTimer > 2000) {
          optionAnswer(0);
          scriptState.fmBankTimer = Date.now();
        }
        if (Date.now() - scriptState.fmBankTalkStart > 12000) {
          log('Bank not opening — retrying talk');
          scriptState.phase = 'fmBankTalk';
          scriptState.fmBankTalkStart = Date.now();
        }
        return 1500;
      }
      if (scriptState.phase === 'fmWithdraw') {
        if (!isInBank()) { scriptState.phase = 'toBankLight'; return 800; }
        if (!hasKit(TINDERBOX)) { withdrawItem(TINDERBOX, 1); return 2000; }
        var have = countLogs();
        if (!scriptState.fmWdT) {
          // ONE withdraw request per visit (bank may have less than asked —
          // a repeat request loops forever when the bank is short/empty)
          withdrawItem(logId, 27);
          scriptState.fmWdT = Date.now();
          return 2000;
        }
        if (Date.now() - scriptState.fmWdT > 3500) {
          if (have === 0) {
            // nothing arrived — bank is out of logs entirely
            log('Bank has no logs — done. Fires lit: ' + (scriptState.fmLit || 0));
            closeBank();
            stopBot(); return 1000;
          }
          scriptState.fmWdT = 0;
          scriptState.phase = 'fmBankClose';
        }
        return 1500;
      }
      if (scriptState.phase === 'fmBankClose') {
        if (!isInBank()) { scriptState.phase = 'toLightArea'; return 400; }
        closeBank();
        return 1200;
      }

      // ══ TO LIGHT AREA (bank mode): try the terrain offset tile, but if the
      // walk stalls >12s, LIGHT WHERE WE STAND — fire lines work anywhere
      // fire-free; the step-east logic walks the line outward from here.
      // (User-reported: bot withdrew logs then idled at the bank forever —
      // blocked offset tile, no stall fallback.) ══
      if (scriptState.phase === 'toLightArea') {
        var bt2 = BANK_REGISTRY[bankName];
        var off = FM_LIGHT_OFFSETS[bankName] || [-4, 8];
        var lx = bt2[0] + off[0], ly = bt2[1] + off[1];
        var dL = Math.max(Math.abs(lx - getX()), Math.abs(ly - getY()));
        if (dL <= 2) { scriptState.phase = 'light'; return 400; }
        // stall detection on THIS walk
        if (scriptState.fmAreaX === getX() && scriptState.fmAreaY === getY()) {
          scriptState.fmAreaStall = (scriptState.fmAreaStall || 0) + 1;
        } else {
          scriptState.fmAreaStall = 0;
          scriptState.fmAreaX = getX(); scriptState.fmAreaY = getY();
        }
        if ((scriptState.fmAreaStall || 0) >= 8) {
          log('Light area unreachable — lighting here instead');
          scriptState.phase = 'light';
          return 400;
        }
        if (Date.now() - (scriptState.fmAreaT || 0) > 2500) {
          scriptState.fmAreaT = Date.now();
          walkTo(lx, ly);
        }
        return 1200;
      }
    };
  }

  var FIREMAKING_SCRIPT_IDS = ['Firemaking', 'AIOFiremaker', 'fm-burn'];
  function isFiremakingScript(id) {
    return FIREMAKING_SCRIPT_IDS.indexOf(id) >= 0;
  }

  // v206: MINE/BANK REGISTRY + WEBWALK ROUTING (IdleRSC graph port)
  // Rock IDs + respawn secs: server ObjectMining.xml (verified 2026-08-16)
  // Rock coords: server SceneryLocs.json per-camp extraction
  // Stand tiles: verified clear in SceneryLocs AND BoundaryLocs
  // Bank tiles: IdleRSC Location.java + NpcLocs banker spawns
  // Graph: idlersc-reference assets/map/graph.txt (boats/wild-tunnel pruned)
  // ═══════════════════════════════════════════════════════════════

  var MINE_REGISTRY = {
    'Al-Kharid': { stand:[70,582], rocks:[[68,585,195],[68,586,102],[68,588,106],[68,589,102],[68,593,110],[68,598,102],[69,582,110],[70,581,100],[70,583,104],[72,582,108],[74,582,100],[74,586,102],[75,584,102],[75,589,195],[75,597,112]] },
    'Dwarven Mine': { stand:[270,3367], rocks:[[260,3341,105],[260,3349,104],[261,3342,102],[261,3346,114],[263,3366,104],[263,3367,104],[264,3358,110],[264,3366,104],[264,3380,113],[265,3357,111],[265,3376,110],[266,3376,110],[269,3364,100],[269,3366,101],[270,3366,101],[270,3375,103],[270,3380,111],[271,3368,102],[271,3371,107],[272,3369,102],[272,3370,103],[272,3379,111],[272,3380,111],[274,3340,103],[274,3342,104],[274,3377,110],[276,3341,100],[276,3373,109],[277,3343,101],[277,3348,115],[277,3349,114],[277,3351,101],[278,3353,100]] },
    'Edgeville Dungeon': { stand:[193,3294], rocks:[[186,3296,100],[186,3297,102],[187,3302,104],[189,3297,102],[190,3298,108],[191,3294,106],[192,3294,195],[192,3298,195],[192,3302,110],[193,3302,110],[194,3294,104],[194,3295,110],[194,3301,110]] },
    'Mining Guild': { stand:[274,3395], rocks:[[265,3387,110],[265,3391,110],[265,3394,110],[265,3397,107],[266,3387,110],[266,3394,110],[267,3389,110],[267,3396,110],[267,3399,107],[268,3396,110],[268,3399,107],[269,3390,110],[269,3391,110],[270,3390,111],[271,3397,111],[272,3391,111],[272,3392,111],[272,3394,111],[272,3397,111],[273,3394,111],[273,3396,111],[275,3395,111],[275,3396,111]] },
    'Rimmington': { stand:[310,636], rocks:[[306,639,114],[308,641,104],[309,635,100],[310,635,100],[311,636,100],[311,644,102],[312,636,100],[315,645,112],[318,640,102],[318,642,102]] },
    'Varrock South-East': { stand:[73,548], rocks:[[69,544,100],[70,543,100],[70,544,100],[70,546,104],[72,549,101],[73,547,101],[73,549,101],[74,545,104],[74,549,101],[75,543,102],[75,546,101],[76,543,102],[76,544,103],[76,547,100],[78,545,105],[78,546,105],[79,546,105]] },
    'Varrock South-West': { stand:[162,535], rocks:[[161,534,115],[161,535,105],[161,538,103],[162,541,115],[163,534,105],[163,535,105],[163,536,105],[163,543,196],[163,546,196],[164,544,105],[164,547,196],[165,546,103],[167,544,105],[167,545,105],[168,544,105]] },
    'Falador': { stand:[361,550], rocks:[[359,547,111],[360,545,111],[361,544,101],[361,549,101],[362,549,105],[362,550,105],[362,551,105],[363,551,105],[365,556,103],[366,553,103],[367,554,103]] },
    'Barbarian Village': { stand:[228,517], rocks:[[225,504,110],[225,505,110],[227,507,110],[228,505,110],[228,516,104],[229,517,104],[229,518,104]] },
    'Wilderness': { stand:[276,379], rocks:[[266,378,111],[270,377,111],[270,381,111],[271,376,111],[272,377,111],[272,378,111],[273,371,111],[273,381,111],[274,374,111],[275,377,110],[276,369,110],[276,375,111],[276,378,110],[276,382,110],[277,377,110],[278,375,110],[278,379,110],[279,373,110],[279,382,110],[280,377,110],[280,380,110],[282,369,110],[282,373,110],[284,378,110],[284,382,110],[286,379,110]] }
  };
  var BANK_REGISTRY = {
    'Edgeville': [216,451],
    'Draynor': [220,635],
    'Varrock West': [150,502],
    'Varrock East': [102,512],
    'Falador East': [283,570],
    'Falador West': [328,552],
    'Seers': [501,449],
    'Ardougne North': [581,574],
    'Ardougne South': [552,613],
    'Yanille': [587,754],
    'Al-Kharid': [89,694],
    'Catherby': [440,494]
  };
  // Respawn seconds per rock object id (ObjectMining.xml). Blacklist = respawn+5s.
  var RESPAWN_BY_ROCK = { 100:4, 101:4, 102:7, 103:7, 104:4, 105:4, 106:110, 107:110, 108:220, 109:220, 110:25, 111:25, 112:70, 113:70, 114:2, 115:2, 195:70, 196:70, 210:900, 211:900 };
  // Ores+gems to deposit at bank / drop when power-mining (v205 list, unchanged)
  var ORE_ITEM_IDS = [155,157,158,150,202,151,153,152,154,383,160,161,162,163];  // v228 ItemDefs-verified (no pickaxe 156, no clay 243)

  // v216: openable doors/gates (server GameObjectAction.java openableDoors list).
  // Used by the stuck-path door opener — many graph edges cross unlabeled gates
  // (e.g. Gate id 57 at (186,3300) in Edgeville Dungeon's north corridor).
  var OPENABLE_DOORS = [57,60,64,142,180,256,260,311,356,358,371,443,450,457,465,471,472,480,486,504,513,563,577,583,611,624,626,660,702,703,704,712,722,794,869,875,914,926,958,988,989,1019,1020,1068,1079,1080,1165];

  // v218: known unlabeled gates ON graph routes — server-log verified opens
  // (2026-08-18 00:59:09 and 01:00:38, both manual). Checked geometrically
  // against every hop, no client-array/stuck dependency.
  var KNOWN_GATES = [
    { x: 186, y: 3300, axis: 'x' },   // Edgeville Dungeon mining-room west exit (gate 57, vertical)
    { x: 211, y: 3272, axis: 'x' },   // Edgeville Dungeon north corridor (gate 57, vertical)
    // v227: surface dungeon DOOR (boundary id 1/2). The graph only labels the
    // (218,464)↔(218,465) edge; the short route from the ladder side enters via
    // the UNLABELED (216,468)→(218,465) edge → door handler never fired from the
    // south → engine walked onto the shut door, drifted, and re-climbed the ladder
    // (pcap 2026-08-21 00:20: walk(218,465) then atObject(215,468) climb-downs).
    // Boundary doors block N-S here: axis 'y', open with atBoundary(+atObject).
    { x: 218, y: 465, axis: 'y', boundary: true },
    // v228: full route audit (all 120 mine↔bank pairs vs server SceneryLocs +
    // BoundaryLocs openable ids). Three MORE unlabeled obstacles sit directly on
    // graph route edges — same silent-freeze class as the Edgeville door:
    { x: 105, y: 587, axis: 'x' },   // Gate 60, Varrock SE mine west fence (Draynor/Falador routes)
    { x: 567, y: 607, axis: 'x' },   // Gate 57, Wizard Guild area (Yanille routes)
    { x: 115, y: 511, axis: 'y', boundary: true },  // door id 1, Varrock East bank approach (blocks N-S)
  ];

  // ── Webwalk graph (port of IdleRSC WebwalkGraph) ──
  // Default graph prunes boats/wild-tunnel AND guild edges (so non-guild camps
  // never route through the 60-Mining guild ladder). Guild-camp graph keeps
  // guild edges — the guild connects to the surface solely via its ladder.
  var WEBWALK_DEFAULT = "115,658,121,646,13;115,658,124,658,9;124,658,138,649,23;124,658,137,667,22;100,649,115,658,24;107,618,116,627,18;116,627,130,625,16;130,625,132,635,14;121,646,132,635,15;132,635,145,641,19;107,618,114,609,16;108,595,120,596,13;120,596,130,608,22;117,617,130,608,22;107,618,117,617,11;144,657,145,641,17;144,657,160,656,17;166,671,178,662,21;151,678,166,671,22;134,677,151,678,18;117,680,134,677,20;114,696,117,680,19;114,696,116,711,21;116,711,130,708,17;127,692,130,708,19;114,696,127,692,17;117,680,127,692,22;141,690,151,678,22;134,677,141,690,20;127,692,141,690,16;145,641,156,642,14;156,642,160,656,18;84,574,100,580,22;99,620,107,618,10,lummyEastCowGate;156,642,171,644,17;193,653,208,653,15;208,653,217,646,16;214,631,217,646,18;214,631,220,638,13;214,631,224,632,13;224,632,233,620,21;233,620,243,610,20;243,610,259,611,17;130,625,138,617,16;150,595,157,586,16,lummyNorthCowGate;142,584,157,586,17;142,584,154,574,22;154,574,169,571,18;169,571,171,584,15;157,586,171,584,16;154,574,157,586,15;138,617,153,615,17;153,615,167,611,18;190,592,199,605,22;185,577,190,592,20;185,577,185,562,17;185,562,186,547,16;186,547,196,535,22;196,535,211,529,21;211,529,218,515,21;203,512,218,515,18;186,514,203,512,19;170,510,186,514,20;162,508,170,510,10;150,509,162,508,13;134,510,150,509,17;132,521,134,510,13;131,535,132,521,15;129,549,131,535,16;124,561,129,549,17;113,570,124,561,20;98,574,113,570,19;84,574,98,574,14;129,549,140,555,17;140,555,145,567,17;134,575,145,567,161;127,585,134,575,17;120,596,127,585,18;190,592,205,591,16;205,591,211,577,20;207,562,211,577,21;207,562,211,551,15,draynorManorSouthDoor;199,605,205,591,20;199,605,210,606,12;205,591,210,606,20;210,606,212,620,16;212,620,214,631,13;210,606,223,611,18;223,611,232,610,10;232,610,233,620,11;232,610,243,610,11;259,611,260,626,16;260,626,260,642,16;269,658,275,666,10;275,666,284,676,19;283,692,284,676,17;283,692,286,703,11;286,703,295,694,12;283,692,295,694,14;283,692,295,682,22;295,682,295,694,14;295,682,309,678,18;284,676,297,665,24;297,665,309,668,15;309,668,309,678,10;260,626,273,629,18;273,629,277,644,23;277,644,284,652,15;284,652,291,659,14;291,659,297,665,12;259,611,274,611,15;274,611,283,619,17;273,629,283,619,20;203,512,204,497,16;192,486,204,497,23;202,487,204,497,12;192,486,202,487,11;202,487,203,483,5,brassKeyDoor;191,475,192,486,12;174,478,191,475,20;158,482,174,478,20;158,482,171,490,21;171,490,184,493,16;184,493,192,486,15;176,505,184,493,20;176,505,186,514,19;191,501,204,497,17;184,493,191,501,15;186,514,191,501,18;162,508,176,505,17;161,496,162,508,19;150,509,150,502,7;131,495,134,510,18;131,495,142,487,19;142,487,143,472,16;143,472,146,457,18;132,450,146,457,21;118,455,132,450,19;116,466,118,455,13;116,466,116,474,8;131,495,131,481,14,varrockPalaceFence;131,481,131,475,6;131,475,137,464,17;129,461,137,464,11;125,470,129,461,13;125,470,131,475,11;116,483,131,481,17;109,482,116,483,8;109,482,109,467,15;109,467,110,451,17;110,451,110,438,13;109,482,109,496,14;109,496,111,506,12;111,506,119,511,13;119,511,134,510,16;119,511,120,519,9;107,525,120,519,19;104,510,119,511,18;91,509,104,510,14,varrockEastBankDoor;73,452,75,442,12;91,509,99,520,19;99,520,107,525,17;118,540,129,549,20;105,541,118,540,14;89,541,105,541,16;76,541,89,541,13;72,545,76,541,8;75,528,76,541,14;75,528,83,518,18;71,560,72,545,16;71,560,83,561,13;83,561,84,574,14;83,561,90,554,14;89,541,90,554,16;105,541,109,553,16;109,553,124,561,23;140,555,152,551,12;131,535,145,539,18;145,539,152,551,13;145,539,157,533,18;157,533,163,525,14;163,525,170,518,14;170,518,170,510,12;157,533,162,545,17;152,551,162,545,11;162,545,170,554,17;155,556,170,554,17;152,551,155,556,5;170,554,173,540,17;168,529,173,540,16;163,525,168,529,9;168,529,180,522,19;180,522,186,514,14;178,533,180,522,13;173,540,178,533,12;178,533,191,526,20;191,526,201,518,18;201,518,203,512,8;218,515,219,500,16;219,500,219,486,14;;212,462,212,470,8;217,447,212,470,10;209,447,222,447,13;206,440,209,447,7;191,435,206,440,20;175,436,191,435,19;159,437,175,436,19;143,437,159,437,18;128,432,143,437,20;116,441,128,432,21;110,438,116,441,9;159,437,162,450,16;162,450,177,449,18;175,436,177,449,17;186,448,191,435,18;177,449,186,448,12;186,448,198,451,15;198,451,198,463,12;184,464,198,463,15;184,464,186,448,18;174,463,177,449,17;174,463,184,464,11;162,459,174,463,16;162,459,162,450,11;150,450,162,450,14;143,437,150,450,20;222,447,232,438,13;217,437,232,438,16;206,440,217,437,14;232,474,234,461,15;234,461,237,446,18;234,461,240,473,18;232,474,240,473,9;239,490,240,473,18;239,490,240,504,15;240,504,242,516,14;228,515,242,516,15;218,515,228,515,10;230,488,232,474,16;219,486,230,488,13;219,486,221,470,17;221,470,218,460,11;218,460,217,447,15;226,530,228,515,17;211,529,226,530,16;226,530,239,536,19;239,536,241,524,14;241,524,242,516,9;239,536,239,550,14;239,550,240,566,17;240,566,240,579,13;239,593,240,579,15;225,590,239,593,17;216,586,225,590,13;211,577,216,586,14;205,591,216,586,16;225,590,225,601,11;223,611,225,601,12;239,593,241,605,14;241,605,243,610,7;274,611,279,600,16;266,593,279,600,20;254,591,266,593,14;248,563,248,546,19;248,546,250,532,18;250,532,250,518,14;242,516,250,518,10;250,518,263,512,19;263,512,276,507,18;276,507,293,505,19;293,505,302,510,14;302,510,314,515,17;250,532,266,531,17;266,531,281,527,19;281,527,286,519,13;286,519,299,517,15;299,517,314,515,17;314,515,316,528,15;293,505,306,499,19;306,499,311,489,15;311,489,316,481,13;313,466,316,481,20;306,451,313,466,22;297,440,306,451,20;262,498,263,512,15;262,498,262,482,16;262,482,269,477,12;269,477,278,485,17;278,485,291,489,17;291,489,296,477,17;269,477,276,463,21;276,463,276,452,11;279,600,291,587,17;291,587,289,572,15;289,572,289,560,12;275,556,289,560,18;271,544,275,556,16;257,546,271,544,16;257,546,257,559,13;257,559,269,561,14;269,561,275,556,11;289,560,298,549,20;286,545,298,549,16;286,545,292,533,18;292,533,299,538,12;298,549,299,538,14;298,549,307,541,17;307,541,316,528,22;307,541,321,541,14;321,541,331,545,14;326,577,328,568,11;311,578,326,577,16;297,574,311,578,18;289,572,297,574,8;312,549,321,541,17;307,541,312,549,15;312,549,314,558,11;312,563,314,558,5;321,541,329,530,19;329,530,331,545,17;316,528,329,530,15;314,515,322,502,21;322,502,331,491,20;328,474,331,491,20;321,460,328,474,21;321,460,322,448,15;331,491,340,487,13;340,487,345,487,5,northFallyTavGate;291,587,303,587,12;303,587,318,587,15;318,587,333,585,17;333,585,343,582,10;343,579,343,582,3,southFallyTavGate;274,611,289,611,15;289,611,304,610,16;304,610,318,604,20;318,604,330,596,20;330,596,345,594,15;343,582,345,594,12;330,596,333,585,14;289,611,292,598,16;291,587,292,598,11;303,587,305,599,14;304,610,305,599,12;316,596,318,587,11;316,596,318,604,10;345,594,358,594,13;330,596,331,611,16;331,611,339,622,19;339,622,353,620,16;353,620,363,609,14;353,620,355,635,17;354,648,355,635,14;344,659,354,648,21;335,662,344,659,12;335,662,335,673,11;325,678,335,673,15;318,672,325,678,13;309,678,318,672,15;318,672,323,664,13;323,664,324,653,14;324,653,335,662,20;312,657,324,653,16;309,668,312,657,14;299,654,312,657,16;297,665,299,654,13;291,659,299,654,13;284,652,299,654,17;324,639,324,653,14;314,628,324,639,21;310,616,314,628,16;310,616,318,604,20;304,610,310,616,12;283,619,293,626,17;293,626,305,630,16;305,630,314,628,11;303,640,305,630,12;299,654,303,640,18;324,639,338,643,18;338,643,348,642,11;348,642,354,648,12;348,642,355,635,14;335,636,339,622,18;324,639,335,636,14;322,625,324,639,16;314,628,322,625,11;321,616,331,611,15;321,616,322,625,10;318,604,321,616,15;310,616,321,616,11;289,611,293,626,19;358,594,359,582,13;343,582,359,582,16;343,579,356,576,13;343,579,344,565,14;356,576,365,574,11;365,574,366,566,9;356,566,366,566,10;356,566,356,576,10;344,565,356,566,13;343,553,344,565,13;343,553,346,542,14;331,545,336,548,8;335,561,336,548,14;328,568,335,561,14;346,542,359,539,16;354,551,356,566,17;354,551,359,539,17;359,539,368,532,16;368,519,368,532,15;359,509,368,519,19;346,505,359,509,17;346,505,347,495,11;345,487,347,495,10;366,566,374,555,19;367,542,374,555,20;367,542,368,532,11;345,487,348,474,16;347,460,348,474,15;343,446,347,460,18;343,446,352,437,18;352,437,367,437,15;367,437,368,446,10;368,446,383,445,16;383,445,384,460,16;381,475,384,460,18;381,475,384,490,18;383,504,384,490,15;382,518,383,504,15;380,534,382,518,18;368,532,380,534,14;368,519,382,518,17;359,509,365,500,15;365,500,374,498,11;374,498,384,490,18;374,498,383,504,15;345,487,358,488,14;383,504,393,494,20;393,494,397,480,18;393,465,397,480,19;393,465,396,454,14;396,454,397,463,10;397,463,403,467,10;403,467,407,461,12;401,459,407,461,8;401,459,412,457,13;412,457,414,472,17;404,450,412,457,15;404,450,408,438,16;409,484,414,472,17;401,495,409,484,19;401,495,405,501,10;405,501,416,498,14;416,498,427,495,14;427,495,437,500,15;437,500,448,500,11;448,500,457,489,20;457,489,466,480,18;466,466,466,480,16;466,466,480,465,15;452,464,466,466,16;441,457,452,464,18;427,455,441,457,14;431,465,441,457,12;427,455,431,465,10;431,465,431,474,9;424,486,431,474,19;424,486,427,495,14;416,498,424,486,20;445,490,448,500,13;445,490,457,489,13;451,479,466,480,16;437,474,451,479,19;431,474,437,474,6;445,490,451,479,17;480,465,492,459,18;485,456,492,459,10;480,465,485,456,14;484,443,485,456,14;484,432,484,443,11;484,422,484,432,10;484,422,489,411,16;492,459,500,456,11;500,456,501,451,6;500,456,508,457,9;508,457,520,458,13;492,459,494,446,15;484,443,494,446,13;494,446,506,446,12;506,446,508,457,15;506,446,517,448,13;517,448,520,458,13;517,448,532,448,17;532,448,532,458,10;520,458,532,458,12;480,465,488,476,19;488,476,495,487,18;495,487,501,502,21;501,502,510,515,22;510,515,522,523,20;522,523,535,530,20;535,530,549,534,18;549,534,562,541,20;562,541,564,554,15;563,571,564,554,18;504,469,508,457,16;497,478,504,469,16;495,487,497,478,11;488,476,497,478,11;504,469,509,482,18;497,478,509,482,16;495,487,509,482,19;186,637,192,626,17;192,626,202,625,11;202,625,212,620,15;202,625,214,631,18;198,635,202,625,14;174,628,186,637,21;174,617,174,628,11;167,611,174,617,13;162,629,174,628,13;156,642,162,629,19;184,606,199,605,16;184,606,185,611,6,lummyNorthPotatoGate;184,602,184,606,4,lummyNorthGarlicGate;167,611,173,608,9;173,608,184,606,13;172,604,173,608,5,lummyNorthWheatSouthGate;172,604,178,595,15,lummyNorthWheatNorthGate;97,663,100,649,17;95,650,100,649,6;88,650,95,650,7,alkharidGate;71,682,72,694,15;84,693,92,696,11;114,609,118,607,6,lummyEastChickenGate;153,615,159,616,9,lummyNorthChickensGate;562,541,577,539,17;577,539,592,535,19;592,535,609,531,21;609,531,624,527,19;624,527,640,521,22;640,521,648,520,9;647,528,648,520,9;647,528,661,527,15;646,539,647,528,12;646,539,650,549,14;650,549,658,555,14;658,555,671,549,19;671,549,682,544,16;682,544,693,539,16;693,539,703,535,15;703,528,703,535,6,gnomeTreeGate;703,528,706,515,16;703,501,706,515,17;700,493,703,501,11;693,493,700,493,11;637,550,646,539,20;626,557,637,550,18;612,563,626,557,20;608,569,612,563,10;608,569,611,580,14;611,580,613,593,15;601,595,613,593,14;613,593,616,604,14;598,603,601,595,11;587,604,598,603,12;573,607,587,604,17;562,606,573,607,12;551,607,562,606,12;549,596,551,607,13;548,584,549,596,13;548,584,554,575,15;554,575,563,571,13;563,571,578,571,15;578,571,582,574,7;578,571,589,570,12;582,574,589,570,13;589,570,590,583,14;590,583,591,593,15;587,604,591,593,15;535,596,549,596,14;527,590,535,596,10;517,585,527,590,11;502,550,512,553,10;498,537,502,550,17;493,525,498,537,17;482,515,493,525,21;472,504,482,515,21;459,504,472,504,19;448,500,459,504,15;457,489,467,496,17;467,496,472,504,13;487,502,501,502,16;472,504,487,502,17;500,523,510,515,18;493,525,500,523,9;532,543,535,530,13;557,527,562,541,19;557,511,557,527,16;557,500,557,511,11;547,489,557,500,21;541,475,547,489,20;540,464,541,475,12;532,458,540,464,14;547,489,557,478,21;115,658,116,667,10;208,653,211,665,15;211,665,213,675,12;213,675,217,684,13;215,691,217,684,9,wizardTowerDoor;148,599,150,595,6,lummyCabbageGate;132,635,143,627,19;152,619,153,615,5,lummyNorthSheepGate;143,627,152,619,17;323,713,335,712,13;335,712,346,710,13;346,710,353,700,17;353,700,364,696,11;364,696,370,686,11;370,686,371,698,12;365,710,371,698,13;354,711,365,710,12;346,710,354,711,9;365,710,376,706,15;371,698,376,706,9;376,706,387,703,14;387,703,399,701,14;399,701,410,699,13;410,699,421,698,12;421,698,430,689,18;430,689,433,683,9;433,683,437,683,4,brimhavenKaramjaGate;437,683,448,690,18;448,690,460,689,13;460,689,473,687,15;473,687,479,678,15;479,667,479,678,11;469,659,479,667,18;467,647,469,659,14;458,662,469,659,14;437,674,437,683,9;479,667,488,673,15;488,673,497,669,9;497,658,497,669,11;486,652,497,658,19;473,687,480,694,14;476,704,480,694,14;468,713,476,704,25;464,725,468,713,20;464,725,464,737,12;464,737,464,749,12;464,749,465,760,12;463,771,465,760,13;462,783,463,771,13;458,796,462,783,17;457,810,458,796,17;446,818,457,810,19;443,829,446,818,14;443,829,447,840,15;434,815,446,818,15;421,815,434,815,13;407,815,421,815,14;394,815,407,815,13;380,816,394,815,15;371,825,380,816,18;371,825,365,815,16;365,815,380,816,16;380,816,378,803,15;378,803,380,791,14;380,791,382,779,14;382,779,384,766,15;384,766,396,766,16;396,766,407,769,14;407,769,417,763,16;417,763,420,751,15;420,751,431,746,16;431,746,439,736,18;439,736,450,735,12;450,735,455,728,8;455,728,464,725,9;448,850,448,861,13;448,861,435,863,15;435,863,421,863,14;421,863,408,862,14;408,862,396,863,13;396,863,383,860,16;383,860,383,850,10;383,850,396,851,20,shiloVillageEntrance;396,851,403,852,8;403,852,406,843,12;406,843,406,831,12;406,831,414,830,9;414,830,424,826,18;406,831,395,828,14;110,438,96,438,14;96,438,83,438,15;83,438,75,442,18;61,729,63,739,1,shantayPass;613,593,622,590,12;587,604,593,613,15;593,613,600,620,14;600,620,600,632,12;277,644,277,653,13;277,653,277,649,4,gerrantHouseDoor;600,632,609,640,17;609,640,610,652,12;610,652,610,664,12;610,664,608,677,15;608,677,595,681,17;595,681,589,691,16;589,691,585,702,15;585,702,585,715,15;585,715,594,710,14;594,710,596,698,14;596,698,589,691,14;595,681,600,692,16;600,692,596,698,10;600,692,611,694,13;611,694,621,693,11;621,693,616,682,16;616,682,608,677,15;585,715,591,726,17;591,726,601,731,15;601,731,612,731,11;612,731,625,730,14;625,730,633,729,11;591,726,581,734,18;581,734,581,746,12;581,746,587,753,9;581,746,593,746,12;593,746,602,748,11;602,748,614,746,14;614,746,626,749,15;626,749,637,753,15;637,753,637,761,8;637,761,624,764,18;624,764,612,767,15;612,767,599,767,13;599,767,587,767,12;587,767,581,753,15;581,753,581,746,7;581,746,567,746,14;567,746,556,748,13;556,748,542,748,14;542,748,534,755,15;659,750,666,740,17;666,740,667,728,13;667,728,654,728,13;654,728,642,731,15;642,731,647,742,16;567,746,568,734,13;568,734,581,734,13;568,734,569,721,14;569,721,577,711,18;577,711,575,698,15;575,698,585,702,14;575,698,563,695,15;563,695,552,701,17;552,701,539,703,15;563,695,571,686,17;571,686,568,674,21;568,674,565,661,16;565,661,565,648,13;565,648,570,636,17;570,636,571,624,13;571,624,581,627,15;581,627,591,631,14;591,631,600,632,10;591,631,589,644,15;589,644,589,652,8;589,652,598,655,12;598,655,610,652,12;589,652,575,651,17;575,651,565,648,13;562,606,560,595,13;560,595,573,593,15;573,593,582,597,13;582,597,591,593,13;560,595,549,596,12;527,590,529,602,12;529,602,527,615,15;527,615,536,616,10;536,616,546,616,12;546,616,551,607,14;527,590,514,593,13;514,593,505,584,18;505,584,499,573,17;499,573,508,566,16;508,566,512,553,13;508,566,513,577,16;513,577,517,585,8;472,504,472,517,15;472,517,477,527,15;477,527,485,536,17;485,536,498,537,14;495,487,482,488,14;482,488,471,487,12;471,487,466,480,16;471,487,467,496,19;471,487,457,489,16;506,446,496,435,21;496,435,494,446,13;496,435,484,432,15;489,411,491,399,14;609,531,609,517,14;609,517,609,504,15;609,504,610,492,15;592,535,586,524,15;586,524,586,523,4,fishingGuildEntrance;586,517,598,517,14;598,517,599,504,16;599,504,587,503,17;587,503,586,517,15;586,517,586,523,6;610,492,608,478,16;608,478,607,466,13;607,466,604,455,14;604,455,615,457,13;615,457,622,466,16;622,466,634,466,12;634,466,636,453,15;636,453,647,451,13;647,451,651,439,16;647,451,653,462,17;653,462,650,473,14;650,473,646,483,14;646,483,648,492,11;648,492,644,503,15;644,503,645,514,12;645,514,648,520,9;661,527,664,515,15;664,515,666,503,14;666,503,668,492,13;668,492,670,480,14;670,480,668,467,15;668,467,668,456,13;703,528,715,524,16;715,524,728,522,15;728,522,732,512,14;732,512,733,498,19;733,498,736,487,14;736,487,734,474,15;734,474,733,461,16;733,461,723,453,18;723,453,718,442,16;718,442,705,438,17;705,438,691,439,15;691,439,678,441,15;678,441,675,453,15;675,453,675,465,12;675,465,677,475,12;677,475,688,479,15;688,479,698,479,10;698,479,700,493,16;698,479,703,467,17;703,467,704,457,13;700,493,712,494,13;712,494,721,490,13;721,490,724,479,14;724,479,734,474,15;609,640,614,633,12;614,633,622,633,8;659,654,660,661,7;660,661,660,670,9;660,670,648,669,12;648,669,635,671,13;635,671,625,671,10;659,654,666,655,7;666,655,675,664,12;675,664,679,675,11;679,675,685,684,15;685,684,694,693,18;694,693,699,703,15;699,703,707,710,15;707,710,714,716,13;699,703,705,692,17;705,692,711,687,11;685,684,691,677,13;691,677,703,673,18;703,673,711,662,19;711,662,709,650,14;709,650,710,637,14;710,637,710,624,13;710,624,707,612,15;707,612,709,599,15;709,599,706,587,15;706,587,695,593,17;695,593,682,598,18;682,598,669,602,17;669,602,656,608,19;656,608,645,617,20;645,617,635,625,18;635,625,630,633,9;707,612,693,611,15;693,611,680,615,17;680,615,668,620,13;668,620,654,623,14;654,623,645,617,15;709,580,696,580,15;696,580,683,577,16;683,577,669,578,15;669,578,657,576,14;657,576,644,575,14;644,575,630,576,15;630,576,627,589,18;627,589,624,601,15;624,601,634,604,13;634,604,644,602,12;644,602,654,599,13;654,599,663,590,18;663,590,669,578,18;644,575,641,588,16;644,602,641,588,21;557,478,569,478,12;569,478,580,472,17;580,472,588,464,16;588,464,590,451,15;590,451,583,440,18;583,440,572,437,16;572,437,558,436,15;558,436,546,437,13;546,437,537,436,10;537,436,532,448,17;418,570,408,569,10;408,569,402,560,15;402,560,401,548,15;401,548,402,536,13;402,536,414,536,12;414,536,425,537,12;425,537,433,543,14;433,543,427,547,10;427,547,416,549,17;418,570,426,566,8;426,566,434,558,16;426,566,416,560,16;416,560,402,560,18;430,689,421,681,17;421,681,408,677,17;408,677,395,681,17;395,681,389,691,16;389,691,387,703,14;465,760,453,759,13;453,759,440,759,17;440,759,429,759,13;429,759,417,763,16;417,763,422,775,17;422,775,422,787,14;422,787,419,798,14;419,798,406,800,15;406,800,407,815,16;419,798,431,800,14;431,800,443,796,16;443,796,450,787,16;450,787,462,783,16;450,787,437,781,19;437,781,432,772,14;432,772,422,775,15;422,775,409,778,16;409,778,397,780,14;397,780,388,789,18;388,789,382,779,16;388,789,390,799,12;390,799,398,807,16;398,807,394,815,12;398,807,406,800,15;416,549,410,553,10;416,549,407,543,15;407,543,401,548,11;63,739,71,746,15;71,746,76,757,16;76,757,80,768,15;80,768,87,778,17;87,778,94,789,18;94,789,100,797,14;100,797,104,809,16;104,809,116,806,15;116,806,128,805,13;128,805,140,806,13;140,806,152,804,14;152,804,164,805,13;164,805,175,801,15;383,850,375,840,18;375,840,364,835,16;364,835,351,831,17;351,831,346,820,16;346,820,346,810,12;347,801,355,795,14;355,795,361,785,16;361,785,364,776,12;364,776,364,769,9;364,769,352,771,14;352,771,341,777,17;341,777,340,788,12;340,788,339,798,13;339,798,347,801,11;346,810,338,812,10;338,812,338,825,13;338,825,338,838,13;338,838,341,851,16;341,851,347,859,14;347,859,356,865,15;356,865,368,863,14;368,863,375,865,9;375,865,383,860,13;364,835,360,846,15;360,846,349,852,17;349,852,347,859,9;343,881,356,882,14;356,882,367,882,11;367,882,377,882,10;377,882,389,881,13;389,881,401,881,12;401,881,413,876,17;413,876,425,876,14;425,876,437,879,15;437,879,449,879,12;449,879,460,877,13;460,877,468,885,16;468,885,467,897,13;467,897,458,905,17;458,905,444,906,15;444,906,432,905,13;432,905,419,903,15;419,903,406,903,13;406,903,393,904,14;393,904,381,904,12;381,904,368,903,14;368,903,355,901,15;355,901,343,902,13;343,902,341,890,14;341,890,343,881,11;341,890,352,891,12;352,891,363,892,12;363,892,377,892,14;377,892,390,894,15;390,894,401,891,14;401,891,412,894,14;412,894,425,893,14;425,893,436,892,12;436,892,448,891,13;448,891,460,892,13;460,892,468,885,15;437,879,436,892,14;412,894,419,903,16;436,892,432,905,17;401,891,401,881,10;377,892,381,904,16;377,882,377,892,10;352,891,356,882,13;363,892,355,901,17;443,829,448,829,5;649,766,639,772,16;639,772,630,770,11;630,770,621,778,17;621,778,620,790,13;620,790,620,801,13;620,801,621,812,12;621,812,626,824,17;626,824,637,828,15;637,828,648,833,16;648,833,659,833,13;659,833,661,844,13;661,844,664,853,12;664,853,655,861,17;655,861,648,863,9;648,863,635,863,13;635,863,625,863,10;625,863,613,863,12;613,863,601,863,12;601,863,590,862,12;590,862,576,860,16;576,860,577,848,13;577,848,583,838,16;583,838,583,826,12;583,826,589,817,15;589,817,601,818,13;601,818,612,812,17;612,812,621,812,9;626,824,615,828,15;615,828,604,831,14;604,831,594,833,12;594,833,583,838,16;594,833,594,843,10;594,843,597,853,13;597,853,601,863,14;597,853,604,844,16;604,844,613,842,11;613,842,621,835,15;621,835,630,837,11;630,837,637,828,16;659,833,649,840,17;649,840,639,846,16;639,846,630,851,14;630,851,619,852,12;619,852,609,853,11;609,853,601,863,18;630,837,639,846,18;613,842,619,852,16;621,835,615,828,13;604,831,601,818,16;620,790,608,787,15;608,787,596,780,19;596,780,584,776,16;621,778,609,778,16;609,778,596,780,15;691,716,678,718,15;678,718,675,706,15;675,706,673,693,15;673,693,683,698,15;683,698,686,709,14;686,709,691,716,12;678,718,670,718,8;670,718,670,706,20;670,706,670,697,9;670,697,668,687,12;668,687,658,686,11;658,686,664,683,17;664,683,666,676,15;666,676,670,682,16;670,682,670,674,8;670,674,657,673,14;657,673,644,675,15;644,675,633,675,15;670,718,658,718,12;658,718,646,712,22;646,712,633,708,21;633,708,630,699,18;630,699,631,688,12;631,688,627,691,13;627,691,627,703,16;627,703,626,710,8;626,710,630,716,14;630,716,638,718,12;638,718,649,717,12;649,717,634,714,20;616,682,623,675,14;623,675,635,679,16;635,679,644,680,14;644,680,656,679,17;639,683,633,684,15;633,684,643,685,11;653,685,662,689,13;653,685,643,685,18;656,679,639,683,25;662,689,668,692,9;668,692,665,701,12;665,701,656,706,14;656,706,663,706,7;663,706,666,712,13;666,712,661,712,15;661,712,655,710,22;655,710,641,708,16;635,679,625,684,23;625,684,625,697,17;625,697,626,710,14;595,681,584,677,15;584,677,577,669,15;577,669,568,674,14;589,570,591,557,17;591,557,600,549,17;600,549,606,540,15;606,540,609,531,12;577,539,584,549,17;584,549,591,557,15;535,530,538,518,15;538,518,539,506,13;539,506,540,495,12;540,495,547,489,13;540,495,529,491,15;529,491,517,485,18;517,485,509,482,11;232,438,242,431,17;242,431,248,421,16;248,421,258,417,14;258,417,254,428,15;254,428,254,439,11;254,439,257,449,13;257,449,257,455,6;257,455,257,468,13;257,468,257,478,10;257,478,262,482,9;254,428,264,422,16;264,422,274,415,17;274,415,282,409,14;282,409,293,411,13;293,411,305,411,14;305,411,316,412,12;316,412,326,411,11;326,411,328,423,14;328,423,319,432,18;319,432,307,437,17;307,437,297,440,13;297,440,299,428,14;299,428,294,421,12;294,421,293,411,15;294,421,283,425,15;283,425,274,429,13;274,429,263,435,17;263,435,265,447,14;265,447,276,452,16;276,452,286,449,13;286,449,294,453,12;294,453,299,464,16;299,464,296,477,16;258,417,265,407,17;265,407,274,400,16;274,400,285,397,14;285,397,297,395,14;297,395,307,391,14;307,391,318,392,12;318,392,327,384,17;327,384,327,372,12;327,372,328,359,14;328,359,328,347,12;328,347,329,334,14;329,334,324,323,16;324,323,327,310,16;327,310,327,297,13;327,297,326,285,15;326,285,329,273,15;329,273,326,262,14;326,262,327,250,13;327,250,326,237,14;326,237,326,225,14;326,225,325,212,13;325,212,324,199,13;324,199,328,187,16;328,187,327,174,14;327,174,328,165,10;328,165,328,152,13;328,152,331,144,8;331,144,331,140,4,icePlateauGate;331,140,331,128,12;331,128,323,118,18;323,118,311,119,13;311,119,308,129,13;308,129,306,139,12;306,139,318,139,12;318,139,319,128,12;319,128,323,123,9;323,123,331,128,13;306,139,298,139,8;298,139,298,123,16,wildyAgilityGate;298,139,286,139,14;286,139,273,139,13;273,139,259,139,14;259,139,248,132,18;248,132,248,124,8;248,124,240,115,17;240,115,234,103,13;234,103,221,103,13;221,103,214,109,9;214,109,205,118,18;205,118,196,122,13;196,122,186,119,13;186,119,183,107,15;183,107,174,101,15;174,101,164,101,10;164,101,150,101,16;150,101,135,101,15;135,101,122,101,13;122,101,109,101,13;109,101,96,101,15;96,101,83,106,18;83,106,70,112,19;70,112,59,117,16;59,117,59,127,10;59,127,59,141,14;59,141,69,140,11;69,140,81,138,14;81,138,95,138,14;95,138,108,135,16;108,135,111,141,6;111,141,111,143,2,deepWildyGate;111,141,123,138,12;123,138,133,138,10;133,138,147,138,16;147,138,160,138,13;160,138,170,138,10;170,138,183,138,15;183,138,194,138,13;194,138,205,138,13;205,138,209,133,9;194,138,198,129,13;198,129,196,122,9;214,109,201,108,22;201,108,191,102,16;191,102,183,107,13;234,103,245,107,11;245,107,258,110,13;258,110,268,115,11;268,115,280,122,13;280,122,282,128,6;282,128,286,139,11;268,115,258,122,12;258,122,248,124,10;164,101,163,113,15;163,113,162,125,13;162,125,160,138,15;147,138,147,125,15;147,125,147,114,11;147,114,150,101,16;135,101,130,109,13;130,109,118,116,25;118,116,121,126,13;121,126,123,138,14;95,138,94,125,14;94,125,93,113,13;93,113,96,101,15;59,127,71,126,13;71,126,84,123,16;84,123,94,125,12;94,125,105,121,15;105,121,118,116,18;118,116,126,123,15;126,123,134,126,11;134,126,147,125,14;147,125,155,121,12;155,121,163,113,16;328,165,316,166,13;316,166,317,154,13;317,154,305,152,14;305,152,292,154,15;292,154,281,152,13;281,152,268,149,16;268,149,255,152,16;255,152,242,152,13;242,152,229,152,13;229,152,215,152,14;215,152,205,152,10;205,152,194,152,13;194,152,181,152,13;181,152,165,152,16;165,152,152,152,13;152,152,139,152,13;139,152,126,152,13;99,152,83,153,16;83,153,68,153,17;68,153,55,153,13;55,153,55,163,12;55,163,65,166,13;65,166,73,168,10;73,168,86,171,16;86,171,94,171,8;94,171,102,164,10;102,164,113,163,11;113,163,126,166,13;126,166,136,163,13;136,163,148,163,12;148,163,161,163,13;161,163,165,152,15;165,152,172,158,13;172,158,182,165,17;182,165,194,166,13;194,166,205,166,13;205,166,218,163,16;218,163,228,160,13;228,160,240,159,13;240,159,254,159,16;254,159,262,169,18;262,169,271,177,17;271,177,282,178,12;282,178,292,182,14;292,182,303,188,17;303,188,314,185,14;314,185,320,177,14;320,177,327,174,10;316,166,320,177,15;292,154,293,166,13;293,166,301,172,14;301,172,292,182,19;301,172,310,174,11;310,174,316,166,14;293,166,278,166,15;278,166,270,163,11;270,163,262,169,14;240,159,242,152,9;215,152,218,163,14;182,165,181,152,14;126,152,126,166,14;99,152,92,162,12;92,162,94,171,11;73,168,76,159,12;76,159,83,153,13;55,163,54,175,13;54,175,58,185,14;58,185,57,196,12;57,196,57,208,12;57,208,60,219,14;60,219,57,231,15;57,231,57,245,14;57,245,60,258,16;60,258,57,271,16;57,271,60,284,16;60,284,60,297,15;60,297,63,310,16;63,310,57,321,17;57,321,49,331,18;63,310,74,316,17;74,316,82,311,15;82,311,81,324,14;81,324,77,336,16;77,336,63,338,16;63,338,51,343,17;51,343,52,356,14;52,356,53,369,16;53,369,54,381,13;54,381,58,393,16;58,393,56,407,16;56,407,55,419,15;55,419,56,430,12;56,430,48,439,17;48,439,56,440,11;56,440,59,447,10;59,447,66,444,18;66,444,65,436,15;65,436,56,440,17;48,439,53,449,15;53,449,61,454,13;61,454,73,452,14;83,438,81,428,12;81,428,68,429,14;68,429,56,430,15;55,419,68,417,15;68,417,68,429,14;68,417,68,404,13;68,404,68,394,12;68,394,58,393,11;68,394,67,381,14;67,381,64,368,16;64,368,61,357,14;61,357,52,356,10;61,357,61,345,12;61,345,63,338,9;61,345,73,347,14;73,347,77,336,15;61,357,73,356,13;73,356,85,356,12;85,356,95,359,13;95,359,103,369,18;103,369,109,380,17;109,380,122,382,15;122,382,130,372,18;130,372,132,359,15;132,359,124,348,19;124,348,114,351,13;114,351,113,359,9;113,359,116,365,9;114,351,103,349,13;103,349,94,340,18;94,340,87,329,18;87,329,81,324,11;82,311,91,319,17;91,319,98,328,16;98,328,104,337,15;104,337,114,342,15;114,342,126,340,14;126,340,136,345,15;136,345,141,355,15;141,355,141,368,13;141,368,135,379,17;135,379,127,390,19;127,390,113,391,15;113,391,100,385,19;100,385,91,376,18;91,376,85,365,17;85,365,85,356,9;122,382,127,390,13;103,369,91,376,19;130,372,141,368,15;124,348,136,345,15;114,342,124,348,16;98,328,87,329,12;82,311,95,309,15;95,309,106,315,17;106,315,116,320,15;116,320,127,323,14;127,323,138,328,16;138,328,148,335,17;148,335,151,346,14;151,346,155,359,17;155,359,158,371,15;158,371,157,383,15;157,383,148,392,18;148,392,139,401,18;139,401,126,403,15;126,403,113,406,16;113,406,99,405,15;99,405,88,399,17;88,399,79,389,19;79,389,73,378,17;73,378,67,381,9;85,365,72,367,15;72,367,64,368,9;100,385,97,395,13;97,395,99,405,12;127,390,136,389,10;136,389,148,392,15;155,359,141,355,18;127,323,115,328,17;115,328,104,337,20;88,399,77,405,17;77,405,77,417,12;77,417,81,428,15;81,428,92,424,15;92,424,97,414,15;97,414,99,405,11;110,438,110,424,14;110,424,112,414,12;112,414,113,406,9;92,424,100,429,13;100,429,110,424,15;110,424,120,418,16;120,418,132,419,13;132,419,143,422,14;143,422,155,425,15;155,425,167,425,14;167,425,179,425,14;179,425,188,422,12;188,422,197,413,18;197,413,206,404,18;206,404,218,404,12;218,404,218,416,14;218,416,221,428,15;221,428,217,437,13;191,435,188,422,16;155,425,159,437,16;126,403,127,390,16;126,403,135,409,15;135,409,132,419,13;155,425,151,413,16;151,413,150,401,13;150,401,148,392,11;151,413,163,412,13;163,412,175,411,13;175,411,185,405,16;185,405,196,398,18;196,398,208,398,12;208,398,223,398,15;223,398,218,404,11;197,413,185,405,20;248,421,235,420,14;235,420,229,408,18;229,408,218,404,15;223,398,235,398,14;235,398,247,398,14;247,398,258,399,12;258,399,265,407,15;248,421,246,408,15;246,408,247,398,13;150,401,160,394,17;160,394,171,390,15;171,390,183,386,16;183,386,195,383,15;195,383,207,380,15;207,380,218,377,14;218,377,230,377,12;230,377,242,377,12;242,377,254,377,12;254,377,263,377,9;263,377,275,371,18;275,371,287,371,12;287,371,299,371,12;299,371,311,371,14;311,371,316,359,17;316,359,328,359,14;275,371,275,358,13;275,358,275,343,15;275,343,278,332,14;278,332,283,321,16;283,321,289,309,18;289,309,289,297,12;289,297,289,285,14;289,285,289,274,11;289,274,289,262,12;289,262,289,250,12;289,250,292,238,15;292,238,292,226,12;292,226,292,211,15;292,211,292,199,12;292,199,304,200,13;304,200,303,188,13;324,199,312,203,16;312,203,304,200,11;304,200,304,212,12;304,212,306,224,14;306,224,304,237,15;304,237,304,249,12;304,249,304,261,12;304,261,304,273,14;304,273,304,285,12;304,285,306,296,13;306,296,307,308,17;307,308,306,320,13;306,320,307,332,13;307,332,310,344,15;310,344,310,356,14;310,356,316,359,9;299,371,294,359,17;294,359,293,346,14;293,346,295,335,13;295,335,293,323,14;293,323,293,311,12;293,311,289,309,6;295,335,307,332,15;324,323,312,318,17;312,318,306,320,8;306,296,315,287,18;315,287,326,285,15;327,250,316,251,14;316,251,304,249,14;325,212,314,212,11;314,212,304,212,10;304,237,292,238,13;304,273,289,274,18;306,296,294,300,18;294,300,289,297,8;292,182,286,193,17;286,193,292,199,12;286,193,273,193,13;273,193,264,201,17;264,201,252,206,17;252,206,240,206,12;240,206,227,206,13;227,206,215,200,18;215,200,212,188,15;212,188,205,175,20;205,175,205,166,11;292,211,279,211,13;279,211,266,212,14;266,212,253,214,15;253,214,252,206,9;292,238,278,239,17;278,239,265,239,13;265,239,252,239,15;252,239,253,227,15;253,227,253,214,13;289,262,275,261,15;275,261,264,253,19;264,253,252,251,14;252,251,252,239,12;289,274,275,274,14;275,274,262,273,14;262,273,249,272,14;249,272,245,260,16;245,260,252,251,16;275,343,269,332,17;269,332,278,332,9;269,332,270,320,13;270,320,273,308,15;273,308,275,296,14;275,296,264,295,12;264,295,258,304,15;258,304,266,311,19;266,311,270,320,13;269,332,260,324,17;260,324,251,315,18;251,315,245,305,16;245,305,239,296,15;239,296,239,287,9;239,287,241,275,14;241,275,249,272,11;136,163,140,175,16;140,175,151,175,11;151,175,164,175,13;164,175,176,175,12;176,175,188,182,19;188,182,198,188,16;198,188,212,188,14;182,165,176,175,16;140,175,126,179,18;126,179,112,180,15;112,180,113,192,15;113,192,115,204,14;115,204,115,213,9;115,213,121,220,13;121,220,131,228,18;131,228,143,229,13;143,229,155,232,15;155,232,168,232,13;168,232,171,219,16;171,219,174,207,15;174,207,171,195,15;171,195,183,191,16;183,191,188,182,14;215,200,204,206,17;204,206,192,211,17;192,211,185,219,15;185,219,171,219,14;253,227,240,227,13;240,227,227,228,14;227,228,214,231,16;214,231,200,232,15;200,232,185,232,15;185,232,185,219,13;227,206,220,216,17;220,216,227,228,19;94,171,89,183,17;89,183,78,190,18;78,190,66,189,13;66,189,58,185,12;113,192,100,193,14;100,193,89,194,12;89,194,89,183,11;60,219,72,218,15;72,218,85,217,14;85,217,96,214,14;96,214,106,210,14;106,210,115,213,12;168,232,169,243,12;169,243,156,247,17;156,247,142,248,15;142,248,143,258,11;143,258,143,268,12;143,268,154,271,14;154,271,155,259,13;155,259,165,261,12;165,261,175,255,16;154,271,166,272,13;166,272,178,273,13;178,273,186,261,20;186,261,189,249,15;189,249,197,243,14;200,232,197,243,14;197,243,209,247,16;209,247,217,253,14;217,253,228,255,13;228,255,238,249,16;238,249,252,251,16;239,287,225,287,16;225,287,211,286,15;211,286,198,286,13;198,286,182,286,18;182,286,178,273,17;217,253,214,264,14;214,264,211,277,16;211,277,211,286,11;85,217,84,229,13;84,229,83,243,15;83,243,84,254,12;84,254,82,267,15;82,267,81,280,14;81,280,81,293,15;81,293,88,303,17;88,303,95,309,13;81,293,68,294,14;68,294,60,284,18;60,258,71,256,13;71,256,84,254,15;83,243,95,243,14;95,243,108,246,16;108,246,119,246,11;119,246,129,244,12;129,244,142,248,17;142,248,140,239,11;140,239,143,229,13;143,268,129,267,19;129,267,116,268,16;116,268,103,269,16;103,269,90,270,14;90,270,81,280,19;88,303,99,299,15;99,299,111,298,13;111,298,122,296,13;122,296,134,292,16;134,292,146,293,13;146,293,148,282,13;148,282,154,271,17;182,286,169,293,20;169,293,156,292,14;156,292,146,293,13;127,323,134,314,16;134,314,142,305,17;142,305,146,293,16;148,335,154,325,16;154,325,160,315,16;160,315,171,311,15;171,311,181,318,17;181,318,194,321,18;194,321,204,320,11;204,320,216,320,12;216,320,228,320,12;228,320,241,320,13;241,320,251,315,15;160,315,154,304,17;154,304,156,292,14;116,268,117,281,16;117,281,124,285,11;124,285,134,292,17;242,377,241,364,14;241,364,239,351,15;239,351,242,339,15;242,339,241,327,13;241,327,241,320,7;204,320,204,333,13;204,333,205,346,14;205,346,209,357,15;209,357,210,369,15;210,369,207,380,14;151,346,163,347,13;163,347,174,346,14;174,346,185,344,13;185,344,194,337,16;194,337,204,333,14;174,346,174,358,12;174,358,173,371,14;173,371,176,381,13;176,381,171,390,14;196,398,192,391,11;192,391,183,386,14;254,377,249,386,14;249,386,247,398,14;435,484,435,488,4,catherbyChefDoor;435,488,445,490,12;435,488,427,495,15;144,657,144,669,12;144,669,130,670,1;130,3545,125,3533,17;125,3533,114,3541,19;114,3541,103,3544,14;125,3533,127,3521,14;125,3533,133,3528,13;133,3528,144,3533,16;144,3533,149,3544,17;149,3544,150,3553,11;150,3553,145,3558,12;145,3558,135,3555,14;135,3555,120,3555,15;120,3555,105,3555,15;105,3555,100,3560,9;100,3560,105,3566,12;144,3533,154,3528,15;154,3528,165,3529,12;165,3529,173,3525,14;165,3529,169,3539,14;169,3539,174,3546,12;279,3327,280,493,10,dwarvenMineCannonEntrance;280,493,278,485,10;279,3327,269,3330,13;279,3327,278,3339,13;278,3339,286,3347,16;286,3347,291,3342,10;291,3342,291,3331,13;286,3347,293,3348,8;293,3348,302,3349,10;302,3349,310,3349,8;278,3339,266,3339,12;266,3339,265,3350,12;265,3350,267,3361,13;267,3361,265,3372,13;265,3372,267,3378,8;267,3378,267,3380,2;267,3381,267,3387,6;267,3387,268,3397,13;265,3372,254,3370,13;254,3370,250,537,5,dwarvenMineFaladorEntrance;248,563,252,572,13;252,572,252,581,11;252,581,254,591,12;257,546,250,537,10;61,729,68,718,18;68,718,76,709,17;76,709,83,702,14;83,702,84,693,10;84,693,83,683,11;83,683,71,682,13;71,682,70,671,12;70,671,70,660,11;70,660,69,647,14;69,647,68,634,14;68,634,67,622,13;67,622,68,610,13;68,610,70,598,14;70,598,70,586,12;71,682,61,682,10;61,682,59,694,14;61,682,58,672,13;58,672,70,671,21;83,683,82,671,15;82,671,85,659,15;85,659,88,650,12;82,671,70,671,14;88,650,81,641,16;81,641,73,631,18;73,631,67,622,15;73,631,76,619,15;76,619,78,607,14;78,607,79,594,14;79,594,78,581,14;78,607,68,610,13;78,581,73,573,13;73,573,84,574,12;73,573,71,560,15;73,573,63,573,10;44,566,32,566,16;32,566,25,568,9;57,547,60,536,14;60,536,64,525,15;64,525,67,515,13;67,515,69,503,14;69,503,68,491,13;68,491,69,479,13;69,479,73,468,15;73,468,62,464,15;62,464,50,462,14;50,462,52,473,13;52,473,48,484,15;48,484,35,489,18;35,489,22,488,14;22,488,9,488,13;48,484,47,496,13;47,496,45,508,14;45,508,45,521,15;45,521,45,533,12;45,533,37,541,16;37,541,27,549,18;27,549,16,555,17;16,555,9,559,11;9,559,14,549,15;27,549,27,560,13;27,560,39,559,13;39,559,44,566,12;46,550,37,541,18;64,525,52,521,16;52,521,45,521,7;68,491,56,488,15;56,488,48,484,12;63,573,57,573,6,digsiteGate;57,573,49,566,15;49,566,44,566,5;693,493,693,502,13;693,502,692,1448,256,gnomeAgilityClimbFirstNet;692,1448,689,2395,128,gnomeAgilityClimbTower;689,2395,685,2396,64,gnomeAgilityRopeSwing;685,2396,683,506,32,gnomeAgilityClimbDownTower;683,506,687,500,11;687,500,693,493,13;208,750,100,649,1,skipTutorial;100,649,102,638,13;102,638,107,628,15;107,628,116,627,10;107,628,107,618,10;53,558,49,566,12;57,547,53,558,15;53,558,46,550,15;137,464,141,1398,1,varrockPalaceNorthwestLadder;260,642,268,646,12;268,646,277,644,19;268,646,269,658,12;69,503,74,503,5;74,503,82,502,1,varrockEastDigsiteGate;82,502,82,491,13;82,491,82,480,11;82,480,89,470,17;82,480,80,468,18;80,468,76,458,14;76,458,73,452,9;89,470,91,459,13;91,459,99,451,16;99,451,110,451,11;99,451,96,438,16;91,509,82,502,16;91,509,83,518,17;220,3522,215,691,12,wizardTowerBasement;372,456,384,460,16;368,446,372,456,14;361,476,348,474,15;361,476,358,488,15;381,475,371,469,16;371,469,372,456,14;371,469,361,476,17;347,460,357,466,16;357,466,361,476,14;357,466,348,474,17;357,466,363,461,11;363,461,372,456,14;371,469,363,461,16;370,481,361,476,14;370,481,381,475,17;370,481,371,469,13;593,746,593,755,9;593,755,597,758,5;108,595,112,601,10;112,601,114,609,10;446,662,458,662,12;446,662,437,674,21;138,617,145,607,17;145,607,148,599,11;190,592,178,595,15;108,595,106,585,12;106,585,100,580,11;532,448,538,445,9;538,445,542,446,5,mcgroubersGate;545,455,555,460,15;555,460,567,457,15;567,457,573,463,12;567,457,567,449,8;555,460,561,466,12;561,466,573,463,15;573,463,575,450,15;575,450,567,449,9;561,466,549,468,14;549,468,545,455,17;545,455,542,446,12;384,460,386,465,7;386,465,388,3300,1,dwarfTunnel;388,3300,397,3294,15;397,3294,408,3294,11;408,3294,418,3297,13;418,3297,426,3294,11;426,3294,427,455,1,dwarfTunnel;383,504,391,502,10;391,502,398,500,10,taverleySteppingStones;398,500,405,501,8;398,500,401,495,8;391,502,393,494,10;393,494,384,490,21;368,519,374,507,18;374,507,374,498,9;383,504,374,507,12;374,507,365,500,16;374,507,382,518,19;365,500,365,494,6;365,488,365,494,6;365,488,358,488,7;365,488,370,481,12;365,488,374,498,19;365,488,374,488,9;374,488,370,481,11;374,488,374,498,10;374,488,384,490,14;365,494,361,494,4,witchsHouseDoor;319,553,312,549,11;321,541,316,528,18;331,554,326,553,6,faladorWestBankDoor;326,553,319,553,7;326,553,321,541,17;331,545,326,553,13;326,553,327,560,8;327,560,328,568,9;335,561,327,560,9;312,549,305,551,9;305,551,298,549,9;275,565,275,556,11;283,570,289,572,6;273,3398,268,3397,12;160,656,169,652,13;169,652,171,644,10;171,644,178,650,13;169,652,178,650,11;178,650,186,653,11;186,653,178,662,17;186,653,193,653,7;186,653,192,641,18;192,641,193,653,13;192,641,186,637,10;192,641,198,635,12;128,686,134,677,15;127,692,128,686,7;128,686,117,680,17;138,1610,137,667,1,lummyLadderTo2FS;138,1610,138,2555,1,lummyLadderTo3FS;138,1592,138,649,1,lummyLadderTo2FN;138,1592,138,2536,1,lummyLadderTo3FN;138,1610,136,1602,10;136,1602,138,1592,12;136,1602,132,1604,6;649,766,652,753,16;652,753,659,750,10;652,753,647,742,16;637,753,643,753,6,yanilleWestGate;643,753,646,753,3;646,753,652,753,6,yanilleWestGate;652,753,643,753,9;714,499,712,494,7;714,517,706,515,10;714,517,715,524,10;703,501,714,499,13;714,499,721,490,16;714,517,714,1461,25,gnomeStrongholdBankSouthLadder;714,499,714,1443,25,gnomeStrongholdBankNorthLadder;714,1443,712,1452,10;714,1461,712,1452,10;714,1443,716,1452,10;714,1461,716,1452,10;692,515,698,517,8;698,517,706,515,10;698,517,703,528,16;692,515,692,1459,1,gnomeStrongholdSpinningWheelLadder;534,566,534,580,14;527,590,534,580,12;532,543,529,556,13;534,566,529,556,11;508,669,497,669,11;286,703,284,710,7;284,710,284,3543,1,asgarniaLadder;284,3543,280,3540,5;280,3540,279,3527,13;279,3527,279,3522,5;279,3522,292,3521,13;303,3519,314,3524,12;279,3522,279,3517,5;279,3517,292,3515,13;303,3519,293,3519,10;293,3519,292,3515,4;293,3519,292,3521,2;610,652,621,656,11;621,656,621,672,16;621,672,625,671,4;630,633,624,639,8;624,639,622,633,6;675,664,675,650,14;675,650,677,637,13;677,637,677,625,12;677,625,668,620,10;364,696,371,698,7;264,660,269,658,5;347,600,345,594,6;347,601,347,600,1,craftingGuild;292,182,285,186,8;285,186,284,185,1,kbdGate;152,551,150,553,2;150,553,150,555,2,championsGuild;284,185,281,185,3,kbdLadder;215,3299,215,3292,7;215,3292,218,3282,10;218,3282,211,3273,11;211,3273,197,3274,14;197,3274,197,3265,9;197,3265,197,3261,4;197,3261,197,3254,7;197,3254,211,3253,14;211,3253,218,3242,13;197,3254,198,3241,13;198,3241,208,3232,13;208,3232,217,3234,9;217,3234,218,3242,8;207,3215,208,3232,17;217,3234,231,3232,14;231,3232,231,3248,16;231,3232,231,3225,7;197,3274,188,3275,9;188,3275,188,3286,11;188,3286,186,3292,6;186,3292,179,3293,7;179,3293,179,3302,9;179,3302,191,3300,12;191,3300,203,3298,12;203,3298,209,3301,6;209,3301,209,3314,13;209,3314,208,3327,13;203,3315,209,3314,6;227,105,234,103,7;221,103,227,105,6;227,105,227,110,5,wildyMageBankWebs;119,644,121,646,2;206,449,209,447,3;222,447,217,447,5;218,465,216,468,3;218,464,218,465,1,edgeDungeonDoor;216,468,215,3299,-1,edgeDungeonLadder;217,447,216,468,22;218,3282,220,3281,2,oddWall;220,3281,222,3281,2;215,3299,216,468,1,edgeDungeonLadder;325,212,331,213,6;224,110,446,3368,1,wildyMageBankLadder;224,110,227,110,3,wildyMageBankDoor;446,3368,453,3374,9;446,3368,440,3374,8;440,3374,453,3374,13;258,122,269,125,11;269,125,280,122,11;269,125,269,127,2;269,127,268,2963,1,deepWildDungeonStairs;268,2963,272,2973,10;272,2973,274,2972,2,deepWildDungeonGate1;274,2972,281,2970,7;281,2970,283,2968,2,deepWildDungeonGate2;283,2968,280,2959,9;280,2959,274,2952,9;274,2952,273,2952,1,deepWildDungeonGate3;508,669,516,666,8,brimMossGiantSwing;115,147,126,152,12;99,152,111,143,15;111,143,115,147,5;581,753,587,753,6;587,753,593,755,6";
  var WEBWALK_GUILD = "115,658,121,646,13;115,658,124,658,9;124,658,138,649,23;124,658,137,667,22;100,649,115,658,24;107,618,116,627,18;116,627,130,625,16;130,625,132,635,14;121,646,132,635,15;132,635,145,641,19;107,618,114,609,16;108,595,120,596,13;120,596,130,608,22;117,617,130,608,22;107,618,117,617,11;144,657,145,641,17;144,657,160,656,17;166,671,178,662,21;151,678,166,671,22;134,677,151,678,18;117,680,134,677,20;114,696,117,680,19;114,696,116,711,21;116,711,130,708,17;127,692,130,708,19;114,696,127,692,17;117,680,127,692,22;141,690,151,678,22;134,677,141,690,20;127,692,141,690,16;145,641,156,642,14;156,642,160,656,18;84,574,100,580,22;99,620,107,618,10,lummyEastCowGate;156,642,171,644,17;193,653,208,653,15;208,653,217,646,16;214,631,217,646,18;214,631,220,638,13;214,631,224,632,13;224,632,233,620,21;233,620,243,610,20;243,610,259,611,17;130,625,138,617,16;150,595,157,586,16,lummyNorthCowGate;142,584,157,586,17;142,584,154,574,22;154,574,169,571,18;169,571,171,584,15;157,586,171,584,16;154,574,157,586,15;138,617,153,615,17;153,615,167,611,18;190,592,199,605,22;185,577,190,592,20;185,577,185,562,17;185,562,186,547,16;186,547,196,535,22;196,535,211,529,21;211,529,218,515,21;203,512,218,515,18;186,514,203,512,19;170,510,186,514,20;162,508,170,510,10;150,509,162,508,13;134,510,150,509,17;132,521,134,510,13;131,535,132,521,15;129,549,131,535,16;124,561,129,549,17;113,570,124,561,20;98,574,113,570,19;84,574,98,574,14;129,549,140,555,17;140,555,145,567,17;134,575,145,567,161;127,585,134,575,17;120,596,127,585,18;190,592,205,591,16;205,591,211,577,20;207,562,211,577,21;207,562,211,551,15,draynorManorSouthDoor;199,605,205,591,20;199,605,210,606,12;205,591,210,606,20;210,606,212,620,16;212,620,214,631,13;210,606,223,611,18;223,611,232,610,10;232,610,233,620,11;232,610,243,610,11;259,611,260,626,16;260,626,260,642,16;269,658,275,666,10;275,666,284,676,19;283,692,284,676,17;283,692,286,703,11;286,703,295,694,12;283,692,295,694,14;283,692,295,682,22;295,682,295,694,14;295,682,309,678,18;284,676,297,665,24;297,665,309,668,15;309,668,309,678,10;260,626,273,629,18;273,629,277,644,23;277,644,284,652,15;284,652,291,659,14;291,659,297,665,12;259,611,274,611,15;274,611,283,619,17;273,629,283,619,20;203,512,204,497,16;192,486,204,497,23;202,487,204,497,12;192,486,202,487,11;202,487,203,483,5,brassKeyDoor;191,475,192,486,12;174,478,191,475,20;158,482,174,478,20;158,482,171,490,21;171,490,184,493,16;184,493,192,486,15;176,505,184,493,20;176,505,186,514,19;191,501,204,497,17;184,493,191,501,15;186,514,191,501,18;162,508,176,505,17;161,496,162,508,19;150,509,150,502,7;131,495,134,510,18;131,495,142,487,19;142,487,143,472,16;143,472,146,457,18;132,450,146,457,21;118,455,132,450,19;116,466,118,455,13;116,466,116,474,8;131,495,131,481,14,varrockPalaceFence;131,481,131,475,6;131,475,137,464,17;129,461,137,464,11;125,470,129,461,13;125,470,131,475,11;116,483,131,481,17;109,482,116,483,8;109,482,109,467,15;109,467,110,451,17;110,451,110,438,13;109,482,109,496,14;109,496,111,506,12;111,506,119,511,13;119,511,134,510,16;119,511,120,519,9;107,525,120,519,19;104,510,119,511,18;91,509,104,510,14,varrockEastBankDoor;73,452,75,442,12;91,509,99,520,19;99,520,107,525,17;118,540,129,549,20;105,541,118,540,14;89,541,105,541,16;76,541,89,541,13;72,545,76,541,8;75,528,76,541,14;75,528,83,518,18;71,560,72,545,16;71,560,83,561,13;83,561,84,574,14;83,561,90,554,14;89,541,90,554,16;105,541,109,553,16;109,553,124,561,23;140,555,152,551,12;131,535,145,539,18;145,539,152,551,13;145,539,157,533,18;157,533,163,525,14;163,525,170,518,14;170,518,170,510,12;157,533,162,545,17;152,551,162,545,11;162,545,170,554,17;155,556,170,554,17;152,551,155,556,5;170,554,173,540,17;168,529,173,540,16;163,525,168,529,9;168,529,180,522,19;180,522,186,514,14;178,533,180,522,13;173,540,178,533,12;178,533,191,526,20;191,526,201,518,18;201,518,203,512,8;218,515,219,500,16;219,500,219,486,14;;212,462,212,470,8;217,447,212,470,10;209,447,222,447,13;206,440,209,447,7;191,435,206,440,20;175,436,191,435,19;159,437,175,436,19;143,437,159,437,18;128,432,143,437,20;116,441,128,432,21;110,438,116,441,9;159,437,162,450,16;162,450,177,449,18;175,436,177,449,17;186,448,191,435,18;177,449,186,448,12;186,448,198,451,15;198,451,198,463,12;184,464,198,463,15;184,464,186,448,18;174,463,177,449,17;174,463,184,464,11;162,459,174,463,16;162,459,162,450,11;150,450,162,450,14;143,437,150,450,20;222,447,232,438,13;217,437,232,438,16;206,440,217,437,14;232,474,234,461,15;234,461,237,446,18;234,461,240,473,18;232,474,240,473,9;239,490,240,473,18;239,490,240,504,15;240,504,242,516,14;228,515,242,516,15;218,515,228,515,10;230,488,232,474,16;219,486,230,488,13;219,486,221,470,17;221,470,218,460,11;218,460,217,447,15;226,530,228,515,17;211,529,226,530,16;226,530,239,536,19;239,536,241,524,14;241,524,242,516,9;239,536,239,550,14;239,550,240,566,17;240,566,240,579,13;239,593,240,579,15;225,590,239,593,17;216,586,225,590,13;211,577,216,586,14;205,591,216,586,16;225,590,225,601,11;223,611,225,601,12;239,593,241,605,14;241,605,243,610,7;274,611,279,600,16;266,593,279,600,20;254,591,266,593,14;248,563,248,546,19;248,546,250,532,18;250,532,250,518,14;242,516,250,518,10;250,518,263,512,19;263,512,276,507,18;276,507,293,505,19;293,505,302,510,14;302,510,314,515,17;250,532,266,531,17;266,531,281,527,19;281,527,286,519,13;286,519,299,517,15;299,517,314,515,17;314,515,316,528,15;293,505,306,499,19;306,499,311,489,15;311,489,316,481,13;313,466,316,481,20;306,451,313,466,22;297,440,306,451,20;262,498,263,512,15;262,498,262,482,16;262,482,269,477,12;269,477,278,485,17;278,485,291,489,17;291,489,296,477,17;269,477,276,463,21;276,463,276,452,11;279,600,291,587,17;291,587,289,572,15;289,572,289,560,12;275,556,289,560,18;271,544,275,556,16;257,546,271,544,16;257,546,257,559,13;257,559,269,561,14;269,561,275,556,11;289,560,298,549,20;286,545,298,549,16;286,545,292,533,18;292,533,299,538,12;298,549,299,538,14;298,549,307,541,17;307,541,316,528,22;307,541,321,541,14;321,541,331,545,14;326,577,328,568,11;311,578,326,577,16;297,574,311,578,18;289,572,297,574,8;312,549,321,541,17;307,541,312,549,15;312,549,314,558,11;312,563,314,558,5;321,541,329,530,19;329,530,331,545,17;316,528,329,530,15;314,515,322,502,21;322,502,331,491,20;328,474,331,491,20;321,460,328,474,21;321,460,322,448,15;331,491,340,487,13;340,487,345,487,5,northFallyTavGate;291,587,303,587,12;303,587,318,587,15;318,587,333,585,17;333,585,343,582,10;343,579,343,582,3,southFallyTavGate;274,611,289,611,15;289,611,304,610,16;304,610,318,604,20;318,604,330,596,20;330,596,345,594,15;343,582,345,594,12;330,596,333,585,14;289,611,292,598,16;291,587,292,598,11;303,587,305,599,14;304,610,305,599,12;316,596,318,587,11;316,596,318,604,10;345,594,358,594,13;330,596,331,611,16;331,611,339,622,19;339,622,353,620,16;353,620,363,609,14;353,620,355,635,17;354,648,355,635,14;344,659,354,648,21;335,662,344,659,12;335,662,335,673,11;325,678,335,673,15;318,672,325,678,13;309,678,318,672,15;318,672,323,664,13;323,664,324,653,14;324,653,335,662,20;312,657,324,653,16;309,668,312,657,14;299,654,312,657,16;297,665,299,654,13;291,659,299,654,13;284,652,299,654,17;324,639,324,653,14;314,628,324,639,21;310,616,314,628,16;310,616,318,604,20;304,610,310,616,12;283,619,293,626,17;293,626,305,630,16;305,630,314,628,11;303,640,305,630,12;299,654,303,640,18;324,639,338,643,18;338,643,348,642,11;348,642,354,648,12;348,642,355,635,14;335,636,339,622,18;324,639,335,636,14;322,625,324,639,16;314,628,322,625,11;321,616,331,611,15;321,616,322,625,10;318,604,321,616,15;310,616,321,616,11;289,611,293,626,19;358,594,359,582,13;343,582,359,582,16;343,579,356,576,13;343,579,344,565,14;356,576,365,574,11;365,574,366,566,9;356,566,366,566,10;356,566,356,576,10;344,565,356,566,13;343,553,344,565,13;343,553,346,542,14;331,545,336,548,8;335,561,336,548,14;328,568,335,561,14;346,542,359,539,16;354,551,356,566,17;354,551,359,539,17;359,539,368,532,16;368,519,368,532,15;359,509,368,519,19;346,505,359,509,17;346,505,347,495,11;345,487,347,495,10;366,566,374,555,19;367,542,374,555,20;367,542,368,532,11;345,487,348,474,16;347,460,348,474,15;343,446,347,460,18;343,446,352,437,18;352,437,367,437,15;367,437,368,446,10;368,446,383,445,16;383,445,384,460,16;381,475,384,460,18;381,475,384,490,18;383,504,384,490,15;382,518,383,504,15;380,534,382,518,18;368,532,380,534,14;368,519,382,518,17;359,509,365,500,15;365,500,374,498,11;374,498,384,490,18;374,498,383,504,15;345,487,358,488,14;383,504,393,494,20;393,494,397,480,18;393,465,397,480,19;393,465,396,454,14;396,454,397,463,10;397,463,403,467,10;403,467,407,461,12;401,459,407,461,8;401,459,412,457,13;412,457,414,472,17;404,450,412,457,15;404,450,408,438,16;409,484,414,472,17;401,495,409,484,19;401,495,405,501,10;405,501,416,498,14;416,498,427,495,14;427,495,437,500,15;437,500,448,500,11;448,500,457,489,20;457,489,466,480,18;466,466,466,480,16;466,466,480,465,15;452,464,466,466,16;441,457,452,464,18;427,455,441,457,14;431,465,441,457,12;427,455,431,465,10;431,465,431,474,9;424,486,431,474,19;424,486,427,495,14;416,498,424,486,20;445,490,448,500,13;445,490,457,489,13;451,479,466,480,16;437,474,451,479,19;431,474,437,474,6;445,490,451,479,17;480,465,492,459,18;485,456,492,459,10;480,465,485,456,14;484,443,485,456,14;484,432,484,443,11;484,422,484,432,10;484,422,489,411,16;492,459,500,456,11;500,456,501,451,6;500,456,508,457,9;508,457,520,458,13;492,459,494,446,15;484,443,494,446,13;494,446,506,446,12;506,446,508,457,15;506,446,517,448,13;517,448,520,458,13;517,448,532,448,17;532,448,532,458,10;520,458,532,458,12;480,465,488,476,19;488,476,495,487,18;495,487,501,502,21;501,502,510,515,22;510,515,522,523,20;522,523,535,530,20;535,530,549,534,18;549,534,562,541,20;562,541,564,554,15;563,571,564,554,18;504,469,508,457,16;497,478,504,469,16;495,487,497,478,11;488,476,497,478,11;504,469,509,482,18;497,478,509,482,16;495,487,509,482,19;186,637,192,626,17;192,626,202,625,11;202,625,212,620,15;202,625,214,631,18;198,635,202,625,14;174,628,186,637,21;174,617,174,628,11;167,611,174,617,13;162,629,174,628,13;156,642,162,629,19;184,606,199,605,16;184,606,185,611,6,lummyNorthPotatoGate;184,602,184,606,4,lummyNorthGarlicGate;167,611,173,608,9;173,608,184,606,13;172,604,173,608,5,lummyNorthWheatSouthGate;172,604,178,595,15,lummyNorthWheatNorthGate;97,663,100,649,17;95,650,100,649,6;88,650,95,650,7,alkharidGate;71,682,72,694,15;84,693,92,696,11;114,609,118,607,6,lummyEastChickenGate;153,615,159,616,9,lummyNorthChickensGate;562,541,577,539,17;577,539,592,535,19;592,535,609,531,21;609,531,624,527,19;624,527,640,521,22;640,521,648,520,9;647,528,648,520,9;647,528,661,527,15;646,539,647,528,12;646,539,650,549,14;650,549,658,555,14;658,555,671,549,19;671,549,682,544,16;682,544,693,539,16;693,539,703,535,15;703,528,703,535,6,gnomeTreeGate;703,528,706,515,16;703,501,706,515,17;700,493,703,501,11;693,493,700,493,11;637,550,646,539,20;626,557,637,550,18;612,563,626,557,20;608,569,612,563,10;608,569,611,580,14;611,580,613,593,15;601,595,613,593,14;613,593,616,604,14;598,603,601,595,11;587,604,598,603,12;573,607,587,604,17;562,606,573,607,12;551,607,562,606,12;549,596,551,607,13;548,584,549,596,13;548,584,554,575,15;554,575,563,571,13;563,571,578,571,15;578,571,582,574,7;578,571,589,570,12;582,574,589,570,13;589,570,590,583,14;590,583,591,593,15;587,604,591,593,15;535,596,549,596,14;527,590,535,596,10;517,585,527,590,11;502,550,512,553,10;498,537,502,550,17;493,525,498,537,17;482,515,493,525,21;472,504,482,515,21;459,504,472,504,19;448,500,459,504,15;457,489,467,496,17;467,496,472,504,13;487,502,501,502,16;472,504,487,502,17;500,523,510,515,18;493,525,500,523,9;532,543,535,530,13;557,527,562,541,19;557,511,557,527,16;557,500,557,511,11;547,489,557,500,21;541,475,547,489,20;540,464,541,475,12;532,458,540,464,14;547,489,557,478,21;115,658,116,667,10;208,653,211,665,15;211,665,213,675,12;213,675,217,684,13;215,691,217,684,9,wizardTowerDoor;148,599,150,595,6,lummyCabbageGate;132,635,143,627,19;152,619,153,615,5,lummyNorthSheepGate;143,627,152,619,17;323,713,335,712,13;335,712,346,710,13;346,710,353,700,17;353,700,364,696,11;364,696,370,686,11;370,686,371,698,12;365,710,371,698,13;354,711,365,710,12;346,710,354,711,9;365,710,376,706,15;371,698,376,706,9;376,706,387,703,14;387,703,399,701,14;399,701,410,699,13;410,699,421,698,12;421,698,430,689,18;430,689,433,683,9;433,683,437,683,4,brimhavenKaramjaGate;437,683,448,690,18;448,690,460,689,13;460,689,473,687,15;473,687,479,678,15;479,667,479,678,11;469,659,479,667,18;467,647,469,659,14;458,662,469,659,14;437,674,437,683,9;479,667,488,673,15;488,673,497,669,9;497,658,497,669,11;486,652,497,658,19;473,687,480,694,14;476,704,480,694,14;468,713,476,704,25;464,725,468,713,20;464,725,464,737,12;464,737,464,749,12;464,749,465,760,12;463,771,465,760,13;462,783,463,771,13;458,796,462,783,17;457,810,458,796,17;446,818,457,810,19;443,829,446,818,14;443,829,447,840,15;434,815,446,818,15;421,815,434,815,13;407,815,421,815,14;394,815,407,815,13;380,816,394,815,15;371,825,380,816,18;371,825,365,815,16;365,815,380,816,16;380,816,378,803,15;378,803,380,791,14;380,791,382,779,14;382,779,384,766,15;384,766,396,766,16;396,766,407,769,14;407,769,417,763,16;417,763,420,751,15;420,751,431,746,16;431,746,439,736,18;439,736,450,735,12;450,735,455,728,8;455,728,464,725,9;448,850,448,861,13;448,861,435,863,15;435,863,421,863,14;421,863,408,862,14;408,862,396,863,13;396,863,383,860,16;383,860,383,850,10;383,850,396,851,20,shiloVillageEntrance;396,851,403,852,8;403,852,406,843,12;406,843,406,831,12;406,831,414,830,9;414,830,424,826,18;406,831,395,828,14;110,438,96,438,14;96,438,83,438,15;83,438,75,442,18;61,729,63,739,1,shantayPass;613,593,622,590,12;587,604,593,613,15;593,613,600,620,14;600,620,600,632,12;277,644,277,653,13;277,653,277,649,4,gerrantHouseDoor;600,632,609,640,17;609,640,610,652,12;610,652,610,664,12;610,664,608,677,15;608,677,595,681,17;595,681,589,691,16;589,691,585,702,15;585,702,585,715,15;585,715,594,710,14;594,710,596,698,14;596,698,589,691,14;595,681,600,692,16;600,692,596,698,10;600,692,611,694,13;611,694,621,693,11;621,693,616,682,16;616,682,608,677,15;585,715,591,726,17;591,726,601,731,15;601,731,612,731,11;612,731,625,730,14;625,730,633,729,11;591,726,581,734,18;581,734,581,746,12;581,746,587,753,9;581,746,593,746,12;593,746,602,748,11;602,748,614,746,14;614,746,626,749,15;626,749,637,753,15;637,753,637,761,8;637,761,624,764,18;624,764,612,767,15;612,767,599,767,13;599,767,587,767,12;587,767,581,753,15;581,753,581,746,7;581,746,567,746,14;567,746,556,748,13;556,748,542,748,14;542,748,534,755,15;659,750,666,740,17;666,740,667,728,13;667,728,654,728,13;654,728,642,731,15;642,731,647,742,16;567,746,568,734,13;568,734,581,734,13;568,734,569,721,14;569,721,577,711,18;577,711,575,698,15;575,698,585,702,14;575,698,563,695,15;563,695,552,701,17;552,701,539,703,15;563,695,571,686,17;571,686,568,674,21;568,674,565,661,16;565,661,565,648,13;565,648,570,636,17;570,636,571,624,13;571,624,581,627,15;581,627,591,631,14;591,631,600,632,10;591,631,589,644,15;589,644,589,652,8;589,652,598,655,12;598,655,610,652,12;589,652,575,651,17;575,651,565,648,13;562,606,560,595,13;560,595,573,593,15;573,593,582,597,13;582,597,591,593,13;560,595,549,596,12;527,590,529,602,12;529,602,527,615,15;527,615,536,616,10;536,616,546,616,12;546,616,551,607,14;527,590,514,593,13;514,593,505,584,18;505,584,499,573,17;499,573,508,566,16;508,566,512,553,13;508,566,513,577,16;513,577,517,585,8;472,504,472,517,15;472,517,477,527,15;477,527,485,536,17;485,536,498,537,14;495,487,482,488,14;482,488,471,487,12;471,487,466,480,16;471,487,467,496,19;471,487,457,489,16;506,446,496,435,21;496,435,494,446,13;496,435,484,432,15;489,411,491,399,14;609,531,609,517,14;609,517,609,504,15;609,504,610,492,15;592,535,586,524,15;586,524,586,523,4,fishingGuildEntrance;586,517,598,517,14;598,517,599,504,16;599,504,587,503,17;587,503,586,517,15;586,517,586,523,6;610,492,608,478,16;608,478,607,466,13;607,466,604,455,14;604,455,615,457,13;615,457,622,466,16;622,466,634,466,12;634,466,636,453,15;636,453,647,451,13;647,451,651,439,16;647,451,653,462,17;653,462,650,473,14;650,473,646,483,14;646,483,648,492,11;648,492,644,503,15;644,503,645,514,12;645,514,648,520,9;661,527,664,515,15;664,515,666,503,14;666,503,668,492,13;668,492,670,480,14;670,480,668,467,15;668,467,668,456,13;703,528,715,524,16;715,524,728,522,15;728,522,732,512,14;732,512,733,498,19;733,498,736,487,14;736,487,734,474,15;734,474,733,461,16;733,461,723,453,18;723,453,718,442,16;718,442,705,438,17;705,438,691,439,15;691,439,678,441,15;678,441,675,453,15;675,453,675,465,12;675,465,677,475,12;677,475,688,479,15;688,479,698,479,10;698,479,700,493,16;698,479,703,467,17;703,467,704,457,13;700,493,712,494,13;712,494,721,490,13;721,490,724,479,14;724,479,734,474,15;609,640,614,633,12;614,633,622,633,8;659,654,660,661,7;660,661,660,670,9;660,670,648,669,12;648,669,635,671,13;635,671,625,671,10;659,654,666,655,7;666,655,675,664,12;675,664,679,675,11;679,675,685,684,15;685,684,694,693,18;694,693,699,703,15;699,703,707,710,15;707,710,714,716,13;699,703,705,692,17;705,692,711,687,11;685,684,691,677,13;691,677,703,673,18;703,673,711,662,19;711,662,709,650,14;709,650,710,637,14;710,637,710,624,13;710,624,707,612,15;707,612,709,599,15;709,599,706,587,15;706,587,695,593,17;695,593,682,598,18;682,598,669,602,17;669,602,656,608,19;656,608,645,617,20;645,617,635,625,18;635,625,630,633,9;707,612,693,611,15;693,611,680,615,17;680,615,668,620,13;668,620,654,623,14;654,623,645,617,15;709,580,696,580,15;696,580,683,577,16;683,577,669,578,15;669,578,657,576,14;657,576,644,575,14;644,575,630,576,15;630,576,627,589,18;627,589,624,601,15;624,601,634,604,13;634,604,644,602,12;644,602,654,599,13;654,599,663,590,18;663,590,669,578,18;644,575,641,588,16;644,602,641,588,21;557,478,569,478,12;569,478,580,472,17;580,472,588,464,16;588,464,590,451,15;590,451,583,440,18;583,440,572,437,16;572,437,558,436,15;558,436,546,437,13;546,437,537,436,10;537,436,532,448,17;418,570,408,569,10;408,569,402,560,15;402,560,401,548,15;401,548,402,536,13;402,536,414,536,12;414,536,425,537,12;425,537,433,543,14;433,543,427,547,10;427,547,416,549,17;418,570,426,566,8;426,566,434,558,16;426,566,416,560,16;416,560,402,560,18;430,689,421,681,17;421,681,408,677,17;408,677,395,681,17;395,681,389,691,16;389,691,387,703,14;465,760,453,759,13;453,759,440,759,17;440,759,429,759,13;429,759,417,763,16;417,763,422,775,17;422,775,422,787,14;422,787,419,798,14;419,798,406,800,15;406,800,407,815,16;419,798,431,800,14;431,800,443,796,16;443,796,450,787,16;450,787,462,783,16;450,787,437,781,19;437,781,432,772,14;432,772,422,775,15;422,775,409,778,16;409,778,397,780,14;397,780,388,789,18;388,789,382,779,16;388,789,390,799,12;390,799,398,807,16;398,807,394,815,12;398,807,406,800,15;416,549,410,553,10;416,549,407,543,15;407,543,401,548,11;63,739,71,746,15;71,746,76,757,16;76,757,80,768,15;80,768,87,778,17;87,778,94,789,18;94,789,100,797,14;100,797,104,809,16;104,809,116,806,15;116,806,128,805,13;128,805,140,806,13;140,806,152,804,14;152,804,164,805,13;164,805,175,801,15;383,850,375,840,18;375,840,364,835,16;364,835,351,831,17;351,831,346,820,16;346,820,346,810,12;347,801,355,795,14;355,795,361,785,16;361,785,364,776,12;364,776,364,769,9;364,769,352,771,14;352,771,341,777,17;341,777,340,788,12;340,788,339,798,13;339,798,347,801,11;346,810,338,812,10;338,812,338,825,13;338,825,338,838,13;338,838,341,851,16;341,851,347,859,14;347,859,356,865,15;356,865,368,863,14;368,863,375,865,9;375,865,383,860,13;364,835,360,846,15;360,846,349,852,17;349,852,347,859,9;343,881,356,882,14;356,882,367,882,11;367,882,377,882,10;377,882,389,881,13;389,881,401,881,12;401,881,413,876,17;413,876,425,876,14;425,876,437,879,15;437,879,449,879,12;449,879,460,877,13;460,877,468,885,16;468,885,467,897,13;467,897,458,905,17;458,905,444,906,15;444,906,432,905,13;432,905,419,903,15;419,903,406,903,13;406,903,393,904,14;393,904,381,904,12;381,904,368,903,14;368,903,355,901,15;355,901,343,902,13;343,902,341,890,14;341,890,343,881,11;341,890,352,891,12;352,891,363,892,12;363,892,377,892,14;377,892,390,894,15;390,894,401,891,14;401,891,412,894,14;412,894,425,893,14;425,893,436,892,12;436,892,448,891,13;448,891,460,892,13;460,892,468,885,15;437,879,436,892,14;412,894,419,903,16;436,892,432,905,17;401,891,401,881,10;377,892,381,904,16;377,882,377,892,10;352,891,356,882,13;363,892,355,901,17;443,829,448,829,5;649,766,639,772,16;639,772,630,770,11;630,770,621,778,17;621,778,620,790,13;620,790,620,801,13;620,801,621,812,12;621,812,626,824,17;626,824,637,828,15;637,828,648,833,16;648,833,659,833,13;659,833,661,844,13;661,844,664,853,12;664,853,655,861,17;655,861,648,863,9;648,863,635,863,13;635,863,625,863,10;625,863,613,863,12;613,863,601,863,12;601,863,590,862,12;590,862,576,860,16;576,860,577,848,13;577,848,583,838,16;583,838,583,826,12;583,826,589,817,15;589,817,601,818,13;601,818,612,812,17;612,812,621,812,9;626,824,615,828,15;615,828,604,831,14;604,831,594,833,12;594,833,583,838,16;594,833,594,843,10;594,843,597,853,13;597,853,601,863,14;597,853,604,844,16;604,844,613,842,11;613,842,621,835,15;621,835,630,837,11;630,837,637,828,16;659,833,649,840,17;649,840,639,846,16;639,846,630,851,14;630,851,619,852,12;619,852,609,853,11;609,853,601,863,18;630,837,639,846,18;613,842,619,852,16;621,835,615,828,13;604,831,601,818,16;620,790,608,787,15;608,787,596,780,19;596,780,584,776,16;621,778,609,778,16;609,778,596,780,15;691,716,678,718,15;678,718,675,706,15;675,706,673,693,15;673,693,683,698,15;683,698,686,709,14;686,709,691,716,12;678,718,670,718,8;670,718,670,706,20;670,706,670,697,9;670,697,668,687,12;668,687,658,686,11;658,686,664,683,17;664,683,666,676,15;666,676,670,682,16;670,682,670,674,8;670,674,657,673,14;657,673,644,675,15;644,675,633,675,15;670,718,658,718,12;658,718,646,712,22;646,712,633,708,21;633,708,630,699,18;630,699,631,688,12;631,688,627,691,13;627,691,627,703,16;627,703,626,710,8;626,710,630,716,14;630,716,638,718,12;638,718,649,717,12;649,717,634,714,20;616,682,623,675,14;623,675,635,679,16;635,679,644,680,14;644,680,656,679,17;639,683,633,684,15;633,684,643,685,11;653,685,662,689,13;653,685,643,685,18;656,679,639,683,25;662,689,668,692,9;668,692,665,701,12;665,701,656,706,14;656,706,663,706,7;663,706,666,712,13;666,712,661,712,15;661,712,655,710,22;655,710,641,708,16;635,679,625,684,23;625,684,625,697,17;625,697,626,710,14;595,681,584,677,15;584,677,577,669,15;577,669,568,674,14;589,570,591,557,17;591,557,600,549,17;600,549,606,540,15;606,540,609,531,12;577,539,584,549,17;584,549,591,557,15;535,530,538,518,15;538,518,539,506,13;539,506,540,495,12;540,495,547,489,13;540,495,529,491,15;529,491,517,485,18;517,485,509,482,11;232,438,242,431,17;242,431,248,421,16;248,421,258,417,14;258,417,254,428,15;254,428,254,439,11;254,439,257,449,13;257,449,257,455,6;257,455,257,468,13;257,468,257,478,10;257,478,262,482,9;254,428,264,422,16;264,422,274,415,17;274,415,282,409,14;282,409,293,411,13;293,411,305,411,14;305,411,316,412,12;316,412,326,411,11;326,411,328,423,14;328,423,319,432,18;319,432,307,437,17;307,437,297,440,13;297,440,299,428,14;299,428,294,421,12;294,421,293,411,15;294,421,283,425,15;283,425,274,429,13;274,429,263,435,17;263,435,265,447,14;265,447,276,452,16;276,452,286,449,13;286,449,294,453,12;294,453,299,464,16;299,464,296,477,16;258,417,265,407,17;265,407,274,400,16;274,400,285,397,14;285,397,297,395,14;297,395,307,391,14;307,391,318,392,12;318,392,327,384,17;327,384,327,372,12;327,372,328,359,14;328,359,328,347,12;328,347,329,334,14;329,334,324,323,16;324,323,327,310,16;327,310,327,297,13;327,297,326,285,15;326,285,329,273,15;329,273,326,262,14;326,262,327,250,13;327,250,326,237,14;326,237,326,225,14;326,225,325,212,13;325,212,324,199,13;324,199,328,187,16;328,187,327,174,14;327,174,328,165,10;328,165,328,152,13;328,152,331,144,8;331,144,331,140,4,icePlateauGate;331,140,331,128,12;331,128,323,118,18;323,118,311,119,13;311,119,308,129,13;308,129,306,139,12;306,139,318,139,12;318,139,319,128,12;319,128,323,123,9;323,123,331,128,13;306,139,298,139,8;298,139,298,123,16,wildyAgilityGate;298,139,286,139,14;286,139,273,139,13;273,139,259,139,14;259,139,248,132,18;248,132,248,124,8;248,124,240,115,17;240,115,234,103,13;234,103,221,103,13;221,103,214,109,9;214,109,205,118,18;205,118,196,122,13;196,122,186,119,13;186,119,183,107,15;183,107,174,101,15;174,101,164,101,10;164,101,150,101,16;150,101,135,101,15;135,101,122,101,13;122,101,109,101,13;109,101,96,101,15;96,101,83,106,18;83,106,70,112,19;70,112,59,117,16;59,117,59,127,10;59,127,59,141,14;59,141,69,140,11;69,140,81,138,14;81,138,95,138,14;95,138,108,135,16;108,135,111,141,6;111,141,111,143,2,deepWildyGate;111,141,123,138,12;123,138,133,138,10;133,138,147,138,16;147,138,160,138,13;160,138,170,138,10;170,138,183,138,15;183,138,194,138,13;194,138,205,138,13;205,138,209,133,9;194,138,198,129,13;198,129,196,122,9;214,109,201,108,22;201,108,191,102,16;191,102,183,107,13;234,103,245,107,11;245,107,258,110,13;258,110,268,115,11;268,115,280,122,13;280,122,282,128,6;282,128,286,139,11;268,115,258,122,12;258,122,248,124,10;164,101,163,113,15;163,113,162,125,13;162,125,160,138,15;147,138,147,125,15;147,125,147,114,11;147,114,150,101,16;135,101,130,109,13;130,109,118,116,25;118,116,121,126,13;121,126,123,138,14;95,138,94,125,14;94,125,93,113,13;93,113,96,101,15;59,127,71,126,13;71,126,84,123,16;84,123,94,125,12;94,125,105,121,15;105,121,118,116,18;118,116,126,123,15;126,123,134,126,11;134,126,147,125,14;147,125,155,121,12;155,121,163,113,16;328,165,316,166,13;316,166,317,154,13;317,154,305,152,14;305,152,292,154,15;292,154,281,152,13;281,152,268,149,16;268,149,255,152,16;255,152,242,152,13;242,152,229,152,13;229,152,215,152,14;215,152,205,152,10;205,152,194,152,13;194,152,181,152,13;181,152,165,152,16;165,152,152,152,13;152,152,139,152,13;139,152,126,152,13;99,152,83,153,16;83,153,68,153,17;68,153,55,153,13;55,153,55,163,12;55,163,65,166,13;65,166,73,168,10;73,168,86,171,16;86,171,94,171,8;94,171,102,164,10;102,164,113,163,11;113,163,126,166,13;126,166,136,163,13;136,163,148,163,12;148,163,161,163,13;161,163,165,152,15;165,152,172,158,13;172,158,182,165,17;182,165,194,166,13;194,166,205,166,13;205,166,218,163,16;218,163,228,160,13;228,160,240,159,13;240,159,254,159,16;254,159,262,169,18;262,169,271,177,17;271,177,282,178,12;282,178,292,182,14;292,182,303,188,17;303,188,314,185,14;314,185,320,177,14;320,177,327,174,10;316,166,320,177,15;292,154,293,166,13;293,166,301,172,14;301,172,292,182,19;301,172,310,174,11;310,174,316,166,14;293,166,278,166,15;278,166,270,163,11;270,163,262,169,14;240,159,242,152,9;215,152,218,163,14;182,165,181,152,14;126,152,126,166,14;99,152,92,162,12;92,162,94,171,11;73,168,76,159,12;76,159,83,153,13;55,163,54,175,13;54,175,58,185,14;58,185,57,196,12;57,196,57,208,12;57,208,60,219,14;60,219,57,231,15;57,231,57,245,14;57,245,60,258,16;60,258,57,271,16;57,271,60,284,16;60,284,60,297,15;60,297,63,310,16;63,310,57,321,17;57,321,49,331,18;63,310,74,316,17;74,316,82,311,15;82,311,81,324,14;81,324,77,336,16;77,336,63,338,16;63,338,51,343,17;51,343,52,356,14;52,356,53,369,16;53,369,54,381,13;54,381,58,393,16;58,393,56,407,16;56,407,55,419,15;55,419,56,430,12;56,430,48,439,17;48,439,56,440,11;56,440,59,447,10;59,447,66,444,18;66,444,65,436,15;65,436,56,440,17;48,439,53,449,15;53,449,61,454,13;61,454,73,452,14;83,438,81,428,12;81,428,68,429,14;68,429,56,430,15;55,419,68,417,15;68,417,68,429,14;68,417,68,404,13;68,404,68,394,12;68,394,58,393,11;68,394,67,381,14;67,381,64,368,16;64,368,61,357,14;61,357,52,356,10;61,357,61,345,12;61,345,63,338,9;61,345,73,347,14;73,347,77,336,15;61,357,73,356,13;73,356,85,356,12;85,356,95,359,13;95,359,103,369,18;103,369,109,380,17;109,380,122,382,15;122,382,130,372,18;130,372,132,359,15;132,359,124,348,19;124,348,114,351,13;114,351,113,359,9;113,359,116,365,9;114,351,103,349,13;103,349,94,340,18;94,340,87,329,18;87,329,81,324,11;82,311,91,319,17;91,319,98,328,16;98,328,104,337,15;104,337,114,342,15;114,342,126,340,14;126,340,136,345,15;136,345,141,355,15;141,355,141,368,13;141,368,135,379,17;135,379,127,390,19;127,390,113,391,15;113,391,100,385,19;100,385,91,376,18;91,376,85,365,17;85,365,85,356,9;122,382,127,390,13;103,369,91,376,19;130,372,141,368,15;124,348,136,345,15;114,342,124,348,16;98,328,87,329,12;82,311,95,309,15;95,309,106,315,17;106,315,116,320,15;116,320,127,323,14;127,323,138,328,16;138,328,148,335,17;148,335,151,346,14;151,346,155,359,17;155,359,158,371,15;158,371,157,383,15;157,383,148,392,18;148,392,139,401,18;139,401,126,403,15;126,403,113,406,16;113,406,99,405,15;99,405,88,399,17;88,399,79,389,19;79,389,73,378,17;73,378,67,381,9;85,365,72,367,15;72,367,64,368,9;100,385,97,395,13;97,395,99,405,12;127,390,136,389,10;136,389,148,392,15;155,359,141,355,18;127,323,115,328,17;115,328,104,337,20;88,399,77,405,17;77,405,77,417,12;77,417,81,428,15;81,428,92,424,15;92,424,97,414,15;97,414,99,405,11;110,438,110,424,14;110,424,112,414,12;112,414,113,406,9;92,424,100,429,13;100,429,110,424,15;110,424,120,418,16;120,418,132,419,13;132,419,143,422,14;143,422,155,425,15;155,425,167,425,14;167,425,179,425,14;179,425,188,422,12;188,422,197,413,18;197,413,206,404,18;206,404,218,404,12;218,404,218,416,14;218,416,221,428,15;221,428,217,437,13;191,435,188,422,16;155,425,159,437,16;126,403,127,390,16;126,403,135,409,15;135,409,132,419,13;155,425,151,413,16;151,413,150,401,13;150,401,148,392,11;151,413,163,412,13;163,412,175,411,13;175,411,185,405,16;185,405,196,398,18;196,398,208,398,12;208,398,223,398,15;223,398,218,404,11;197,413,185,405,20;248,421,235,420,14;235,420,229,408,18;229,408,218,404,15;223,398,235,398,14;235,398,247,398,14;247,398,258,399,12;258,399,265,407,15;248,421,246,408,15;246,408,247,398,13;150,401,160,394,17;160,394,171,390,15;171,390,183,386,16;183,386,195,383,15;195,383,207,380,15;207,380,218,377,14;218,377,230,377,12;230,377,242,377,12;242,377,254,377,12;254,377,263,377,9;263,377,275,371,18;275,371,287,371,12;287,371,299,371,12;299,371,311,371,14;311,371,316,359,17;316,359,328,359,14;275,371,275,358,13;275,358,275,343,15;275,343,278,332,14;278,332,283,321,16;283,321,289,309,18;289,309,289,297,12;289,297,289,285,14;289,285,289,274,11;289,274,289,262,12;289,262,289,250,12;289,250,292,238,15;292,238,292,226,12;292,226,292,211,15;292,211,292,199,12;292,199,304,200,13;304,200,303,188,13;324,199,312,203,16;312,203,304,200,11;304,200,304,212,12;304,212,306,224,14;306,224,304,237,15;304,237,304,249,12;304,249,304,261,12;304,261,304,273,14;304,273,304,285,12;304,285,306,296,13;306,296,307,308,17;307,308,306,320,13;306,320,307,332,13;307,332,310,344,15;310,344,310,356,14;310,356,316,359,9;299,371,294,359,17;294,359,293,346,14;293,346,295,335,13;295,335,293,323,14;293,323,293,311,12;293,311,289,309,6;295,335,307,332,15;324,323,312,318,17;312,318,306,320,8;306,296,315,287,18;315,287,326,285,15;327,250,316,251,14;316,251,304,249,14;325,212,314,212,11;314,212,304,212,10;304,237,292,238,13;304,273,289,274,18;306,296,294,300,18;294,300,289,297,8;292,182,286,193,17;286,193,292,199,12;286,193,273,193,13;273,193,264,201,17;264,201,252,206,17;252,206,240,206,12;240,206,227,206,13;227,206,215,200,18;215,200,212,188,15;212,188,205,175,20;205,175,205,166,11;292,211,279,211,13;279,211,266,212,14;266,212,253,214,15;253,214,252,206,9;292,238,278,239,17;278,239,265,239,13;265,239,252,239,15;252,239,253,227,15;253,227,253,214,13;289,262,275,261,15;275,261,264,253,19;264,253,252,251,14;252,251,252,239,12;289,274,275,274,14;275,274,262,273,14;262,273,249,272,14;249,272,245,260,16;245,260,252,251,16;275,343,269,332,17;269,332,278,332,9;269,332,270,320,13;270,320,273,308,15;273,308,275,296,14;275,296,264,295,12;264,295,258,304,15;258,304,266,311,19;266,311,270,320,13;269,332,260,324,17;260,324,251,315,18;251,315,245,305,16;245,305,239,296,15;239,296,239,287,9;239,287,241,275,14;241,275,249,272,11;136,163,140,175,16;140,175,151,175,11;151,175,164,175,13;164,175,176,175,12;176,175,188,182,19;188,182,198,188,16;198,188,212,188,14;182,165,176,175,16;140,175,126,179,18;126,179,112,180,15;112,180,113,192,15;113,192,115,204,14;115,204,115,213,9;115,213,121,220,13;121,220,131,228,18;131,228,143,229,13;143,229,155,232,15;155,232,168,232,13;168,232,171,219,16;171,219,174,207,15;174,207,171,195,15;171,195,183,191,16;183,191,188,182,14;215,200,204,206,17;204,206,192,211,17;192,211,185,219,15;185,219,171,219,14;253,227,240,227,13;240,227,227,228,14;227,228,214,231,16;214,231,200,232,15;200,232,185,232,15;185,232,185,219,13;227,206,220,216,17;220,216,227,228,19;94,171,89,183,17;89,183,78,190,18;78,190,66,189,13;66,189,58,185,12;113,192,100,193,14;100,193,89,194,12;89,194,89,183,11;60,219,72,218,15;72,218,85,217,14;85,217,96,214,14;96,214,106,210,14;106,210,115,213,12;168,232,169,243,12;169,243,156,247,17;156,247,142,248,15;142,248,143,258,11;143,258,143,268,12;143,268,154,271,14;154,271,155,259,13;155,259,165,261,12;165,261,175,255,16;154,271,166,272,13;166,272,178,273,13;178,273,186,261,20;186,261,189,249,15;189,249,197,243,14;200,232,197,243,14;197,243,209,247,16;209,247,217,253,14;217,253,228,255,13;228,255,238,249,16;238,249,252,251,16;239,287,225,287,16;225,287,211,286,15;211,286,198,286,13;198,286,182,286,18;182,286,178,273,17;217,253,214,264,14;214,264,211,277,16;211,277,211,286,11;85,217,84,229,13;84,229,83,243,15;83,243,84,254,12;84,254,82,267,15;82,267,81,280,14;81,280,81,293,15;81,293,88,303,17;88,303,95,309,13;81,293,68,294,14;68,294,60,284,18;60,258,71,256,13;71,256,84,254,15;83,243,95,243,14;95,243,108,246,16;108,246,119,246,11;119,246,129,244,12;129,244,142,248,17;142,248,140,239,11;140,239,143,229,13;143,268,129,267,19;129,267,116,268,16;116,268,103,269,16;103,269,90,270,14;90,270,81,280,19;88,303,99,299,15;99,299,111,298,13;111,298,122,296,13;122,296,134,292,16;134,292,146,293,13;146,293,148,282,13;148,282,154,271,17;182,286,169,293,20;169,293,156,292,14;156,292,146,293,13;127,323,134,314,16;134,314,142,305,17;142,305,146,293,16;148,335,154,325,16;154,325,160,315,16;160,315,171,311,15;171,311,181,318,17;181,318,194,321,18;194,321,204,320,11;204,320,216,320,12;216,320,228,320,12;228,320,241,320,13;241,320,251,315,15;160,315,154,304,17;154,304,156,292,14;116,268,117,281,16;117,281,124,285,11;124,285,134,292,17;242,377,241,364,14;241,364,239,351,15;239,351,242,339,15;242,339,241,327,13;241,327,241,320,7;204,320,204,333,13;204,333,205,346,14;205,346,209,357,15;209,357,210,369,15;210,369,207,380,14;151,346,163,347,13;163,347,174,346,14;174,346,185,344,13;185,344,194,337,16;194,337,204,333,14;174,346,174,358,12;174,358,173,371,14;173,371,176,381,13;176,381,171,390,14;196,398,192,391,11;192,391,183,386,14;254,377,249,386,14;249,386,247,398,14;435,484,435,488,4,catherbyChefDoor;435,488,445,490,12;435,488,427,495,15;144,657,144,669,12;144,669,130,670,1;130,3545,125,3533,17;125,3533,114,3541,19;114,3541,103,3544,14;125,3533,127,3521,14;125,3533,133,3528,13;133,3528,144,3533,16;144,3533,149,3544,17;149,3544,150,3553,11;150,3553,145,3558,12;145,3558,135,3555,14;135,3555,120,3555,15;120,3555,105,3555,15;105,3555,100,3560,9;100,3560,105,3566,12;144,3533,154,3528,15;154,3528,165,3529,12;165,3529,173,3525,14;165,3529,169,3539,14;169,3539,174,3546,12;279,3327,280,493,10,dwarvenMineCannonEntrance;280,493,278,485,10;279,3327,269,3330,13;279,3327,278,3339,13;278,3339,286,3347,16;286,3347,291,3342,10;291,3342,291,3331,13;286,3347,293,3348,8;293,3348,302,3349,10;302,3349,310,3349,8;278,3339,266,3339,12;266,3339,265,3350,12;265,3350,267,3361,13;267,3361,265,3372,13;265,3372,267,3378,8;267,3378,267,3380,2;267,3380,267,3381,15,miningGuildDoor;267,3381,267,3387,6;267,3387,268,3397,13;265,3372,254,3370,13;254,3370,250,537,5,dwarvenMineFaladorEntrance;248,563,252,572,13;252,572,252,581,11;252,581,254,591,12;257,546,250,537,10;61,729,68,718,18;68,718,76,709,17;76,709,83,702,14;83,702,84,693,10;84,693,83,683,11;83,683,71,682,13;71,682,70,671,12;70,671,70,660,11;70,660,69,647,14;69,647,68,634,14;68,634,67,622,13;67,622,68,610,13;68,610,70,598,14;70,598,70,586,12;71,682,61,682,10;61,682,59,694,14;61,682,58,672,13;58,672,70,671,21;83,683,82,671,15;82,671,85,659,15;85,659,88,650,12;82,671,70,671,14;88,650,81,641,16;81,641,73,631,18;73,631,67,622,15;73,631,76,619,15;76,619,78,607,14;78,607,79,594,14;79,594,78,581,14;78,607,68,610,13;78,581,73,573,13;73,573,84,574,12;73,573,71,560,15;73,573,63,573,10;44,566,32,566,16;32,566,25,568,9;57,547,60,536,14;60,536,64,525,15;64,525,67,515,13;67,515,69,503,14;69,503,68,491,13;68,491,69,479,13;69,479,73,468,15;73,468,62,464,15;62,464,50,462,14;50,462,52,473,13;52,473,48,484,15;48,484,35,489,18;35,489,22,488,14;22,488,9,488,13;48,484,47,496,13;47,496,45,508,14;45,508,45,521,15;45,521,45,533,12;45,533,37,541,16;37,541,27,549,18;27,549,16,555,17;16,555,9,559,11;9,559,14,549,15;27,549,27,560,13;27,560,39,559,13;39,559,44,566,12;46,550,37,541,18;64,525,52,521,16;52,521,45,521,7;68,491,56,488,15;56,488,48,484,12;63,573,57,573,6,digsiteGate;57,573,49,566,15;49,566,44,566,5;693,493,693,502,13;693,502,692,1448,256,gnomeAgilityClimbFirstNet;692,1448,689,2395,128,gnomeAgilityClimbTower;689,2395,685,2396,64,gnomeAgilityRopeSwing;685,2396,683,506,32,gnomeAgilityClimbDownTower;683,506,687,500,11;687,500,693,493,13;208,750,100,649,1,skipTutorial;100,649,102,638,13;102,638,107,628,15;107,628,116,627,10;107,628,107,618,10;53,558,49,566,12;57,547,53,558,15;53,558,46,550,15;137,464,141,1398,1,varrockPalaceNorthwestLadder;260,642,268,646,12;268,646,277,644,19;268,646,269,658,12;69,503,74,503,5;74,503,82,502,1,varrockEastDigsiteGate;82,502,82,491,13;82,491,82,480,11;82,480,89,470,17;82,480,80,468,18;80,468,76,458,14;76,458,73,452,9;89,470,91,459,13;91,459,99,451,16;99,451,110,451,11;99,451,96,438,16;91,509,82,502,16;91,509,83,518,17;220,3522,215,691,12,wizardTowerBasement;372,456,384,460,16;368,446,372,456,14;361,476,348,474,15;361,476,358,488,15;381,475,371,469,16;371,469,372,456,14;371,469,361,476,17;347,460,357,466,16;357,466,361,476,14;357,466,348,474,17;357,466,363,461,11;363,461,372,456,14;371,469,363,461,16;370,481,361,476,14;370,481,381,475,17;370,481,371,469,13;593,746,593,755,9;593,755,597,758,5;108,595,112,601,10;112,601,114,609,10;446,662,458,662,12;446,662,437,674,21;138,617,145,607,17;145,607,148,599,11;190,592,178,595,15;108,595,106,585,12;106,585,100,580,11;532,448,538,445,9;538,445,542,446,5,mcgroubersGate;545,455,555,460,15;555,460,567,457,15;567,457,573,463,12;567,457,567,449,8;555,460,561,466,12;561,466,573,463,15;573,463,575,450,15;575,450,567,449,9;561,466,549,468,14;549,468,545,455,17;545,455,542,446,12;384,460,386,465,7;386,465,388,3300,1,dwarfTunnel;388,3300,397,3294,15;397,3294,408,3294,11;408,3294,418,3297,13;418,3297,426,3294,11;426,3294,427,455,1,dwarfTunnel;383,504,391,502,10;391,502,398,500,10,taverleySteppingStones;398,500,405,501,8;398,500,401,495,8;391,502,393,494,10;393,494,384,490,21;368,519,374,507,18;374,507,374,498,9;383,504,374,507,12;374,507,365,500,16;374,507,382,518,19;365,500,365,494,6;365,488,365,494,6;365,488,358,488,7;365,488,370,481,12;365,488,374,498,19;365,488,374,488,9;374,488,370,481,11;374,488,374,498,10;374,488,384,490,14;365,494,361,494,4,witchsHouseDoor;319,553,312,549,11;321,541,316,528,18;331,554,326,553,6,faladorWestBankDoor;326,553,319,553,7;326,553,321,541,17;331,545,326,553,13;326,553,327,560,8;327,560,328,568,9;335,561,327,560,9;312,549,305,551,9;305,551,298,549,9;275,565,275,556,11;283,570,289,572,6;275,565,273,3398,1,miningGuildLadder;273,3398,268,3397,12;160,656,169,652,13;169,652,171,644,10;171,644,178,650,13;169,652,178,650,11;178,650,186,653,11;186,653,178,662,17;186,653,193,653,7;186,653,192,641,18;192,641,193,653,13;192,641,186,637,10;192,641,198,635,12;128,686,134,677,15;127,692,128,686,7;128,686,117,680,17;138,1610,137,667,1,lummyLadderTo2FS;138,1610,138,2555,1,lummyLadderTo3FS;138,1592,138,649,1,lummyLadderTo2FN;138,1592,138,2536,1,lummyLadderTo3FN;138,1610,136,1602,10;136,1602,138,1592,12;136,1602,132,1604,6;649,766,652,753,16;652,753,659,750,10;652,753,647,742,16;637,753,643,753,6,yanilleWestGate;643,753,646,753,3;646,753,652,753,6,yanilleWestGate;652,753,643,753,9;714,499,712,494,7;714,517,706,515,10;714,517,715,524,10;703,501,714,499,13;714,499,721,490,16;714,517,714,1461,25,gnomeStrongholdBankSouthLadder;714,499,714,1443,25,gnomeStrongholdBankNorthLadder;714,1443,712,1452,10;714,1461,712,1452,10;714,1443,716,1452,10;714,1461,716,1452,10;692,515,698,517,8;698,517,706,515,10;698,517,703,528,16;692,515,692,1459,1,gnomeStrongholdSpinningWheelLadder;534,566,534,580,14;527,590,534,580,12;532,543,529,556,13;534,566,529,556,11;508,669,497,669,11;286,703,284,710,7;284,710,284,3543,1,asgarniaLadder;284,3543,280,3540,5;280,3540,279,3527,13;279,3527,279,3522,5;279,3522,292,3521,13;303,3519,314,3524,12;279,3522,279,3517,5;279,3517,292,3515,13;303,3519,293,3519,10;293,3519,292,3515,4;293,3519,292,3521,2;610,652,621,656,11;621,656,621,672,16;621,672,625,671,4;630,633,624,639,8;624,639,622,633,6;675,664,675,650,14;675,650,677,637,13;677,637,677,625,12;677,625,668,620,10;364,696,371,698,7;264,660,269,658,5;347,600,345,594,6;347,601,347,600,1,craftingGuild;292,182,285,186,8;285,186,284,185,1,kbdGate;152,551,150,553,2;150,553,150,555,2,championsGuild;284,185,281,185,3,kbdLadder;215,3299,215,3292,7;215,3292,218,3282,10;218,3282,211,3273,11;211,3273,197,3274,14;197,3274,197,3265,9;197,3265,197,3261,4;197,3261,197,3254,7;197,3254,211,3253,14;211,3253,218,3242,13;197,3254,198,3241,13;198,3241,208,3232,13;208,3232,217,3234,9;217,3234,218,3242,8;207,3215,208,3232,17;217,3234,231,3232,14;231,3232,231,3248,16;231,3232,231,3225,7;197,3274,188,3275,9;188,3275,188,3286,11;188,3286,186,3292,6;186,3292,179,3293,7;179,3293,179,3302,9;179,3302,191,3300,12;191,3300,203,3298,12;203,3298,209,3301,6;209,3301,209,3314,13;209,3314,208,3327,13;203,3315,209,3314,6;227,105,234,103,7;221,103,227,105,6;227,105,227,110,5,wildyMageBankWebs;119,644,121,646,2;206,449,209,447,3;222,447,217,447,5;218,465,216,468,3;218,464,218,465,1,edgeDungeonDoor;216,468,215,3299,-1,edgeDungeonLadder;217,447,216,468,22;218,3282,220,3281,2,oddWall;220,3281,222,3281,2;215,3299,216,468,1,edgeDungeonLadder;325,212,331,213,6;224,110,446,3368,1,wildyMageBankLadder;224,110,227,110,3,wildyMageBankDoor;446,3368,453,3374,9;446,3368,440,3374,8;440,3374,453,3374,13;258,122,269,125,11;269,125,280,122,11;269,125,269,127,2;269,127,268,2963,1,deepWildDungeonStairs;268,2963,272,2973,10;272,2973,274,2972,2,deepWildDungeonGate1;274,2972,281,2970,7;281,2970,283,2968,2,deepWildDungeonGate2;283,2968,280,2959,9;280,2959,274,2952,9;274,2952,273,2952,1,deepWildDungeonGate3;508,669,516,666,8,brimMossGiantSwing;115,147,126,152,12;99,152,111,143,15;111,143,115,147,5;581,753,587,753,6;587,753,593,755,6";
  var _webAdj = null, _webAdjGuild = null;
  function webwalkGraph(useGuild) {
    if (useGuild) {
      if (_webAdjGuild) return _webAdjGuild;
      _webAdjGuild = parseWebwalk(WEBWALK_GUILD);
      return _webAdjGuild;
    }
    if (_webAdj) return _webAdj;
    _webAdj = parseWebwalk(WEBWALK_DEFAULT);
    return _webAdj;
  }
  function parseWebwalk(raw) {
    var adj = {};
    var edges = raw.split(';');
    for (var i = 0; i < edges.length; i++) {
      var p = edges[i].split(',');
      if (p.length < 5) continue;
      var a = { x: +p[0], y: +p[1] }, b = { x: +p[2], y: +p[3] };
      var lab = p.length > 5 ? p[5] : null;
      var keyA = a.x + ',' + a.y, keyB = b.x + ',' + b.y;
      if (!adj[keyA]) adj[keyA] = { x: a.x, y: a.y, out: [] };
      if (!adj[keyB]) adj[keyB] = { x: b.x, y: b.y, out: [] };
      adj[keyA].out.push({ node: adj[keyB], label: lab });
      adj[keyB].out.push({ node: adj[keyA], label: lab });
    }
    return adj;
  }
  function webwalkSnap(x, y, useGuild) {
    var g = webwalkGraph(useGuild), best = null, bd = Infinity;
    for (var k in g) {
      var n = g[k];
      var d = Math.abs(n.x - x) + Math.abs(n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // Dijkstra from nearest node to (fx,fy); returns {dist,prev} maps keyed "x,y"
  function webwalkDijkstra(fx, fy, useGuild) {
    var g = webwalkGraph(useGuild);
    var src = webwalkSnap(fx, fy, useGuild);
    var dist = {}, prev = {}, pq = [[0, src.x + ',' + src.y]];
    dist[src.x + ',' + src.y] = 0;
    while (pq.length > 0) {
      pq.sort(function(a, b) { return a[0] - b[0]; });
      var top = pq.shift();
      var du = top[0], uk = top[1];
      if (du > (dist[uk] !== undefined ? dist[uk] : Infinity)) continue;
      var u = g[uk];
      if (!u) continue;
      for (var i = 0; i < u.out.length; i++) {
        var e = u.out[i], v = e.node;
        var vk = v.x + ',' + v.y;
        // label lives on the node we're entering
        var nd = du + Math.max(Math.abs(v.x - u.x) + Math.abs(v.y - u.y), 1);
        if (nd < (dist[vk] !== undefined ? dist[vk] : Infinity)) {
          dist[vk] = nd;
          prev[vk] = uk;
          pq.push([nd, vk]);
        }
      }
    }
    return { dist: dist, prev: prev };
  }
  // Route from (fx,fy) to (tx,ty): list of {x,y,label} (label = special edge
  // crossed to ENTER that node). Returns null if target unreachable.
  function webwalkRoute(fx, fy, tx, ty, useGuild) {
    var g = webwalkGraph(useGuild);
    var dst = webwalkSnap(tx, ty, useGuild);
    var r = webwalkDijkstra(fx, fy, useGuild);
    var dk = dst.x + ',' + dst.y;
    if (r.dist[dk] === undefined) return null;
    // Walk prev chain backwards, collecting edge labels
    var chain = [];
    var cur = dk;
    while (cur) {
      var node = g[cur];
      var lab = null;
      var pk = r.prev[cur];
      if (pk) {
        var pn = g[pk];
        for (var i = 0; i < pn.out.length; i++) {
          if (pn.out[i].node === node && pn.out[i].label) { lab = pn.out[i].label; break; }
        }
      }
      chain.push({ x: node.x, y: node.y, label: lab });
      if (!pk) break;
      cur = pk;
    }
    chain.reverse();
    return chain;
  }

  // Coal rock coords near wilderness mine (284, 380) — from server SceneryLocs.json
  var COAL_WILDERNESS = [{x:266,y:378},{x:270,y:377},{x:270,y:381},{x:271,y:376},
    {x:272,y:377},{x:272,y:378},{x:273,y:371},{x:273,y:381},{x:274,y:374},{x:275,y:377},
    {x:276,y:369},{x:276,y:375},{x:276,y:378},{x:276,y:382},{x:277,y:377},{x:278,y:375},
    {x:278,y:379},{x:279,y:373},{x:279,y:382},{x:280,y:377},{x:280,y:380},{x:282,y:369},
    {x:282,y:373},{x:284,y:378},{x:284,y:382},{x:286,y:379}];
  // Fixed walk-to tile INSIDE the mine — server-verified clear of all scenery
  // (SceneryLocs check: no objects at (276,379); surrounded by coal rocks on
  // 3 sides). The naive coordinate average (276,377) is clear but boxed in by
  // rocks, and step-point rounding can land ON a rock tile (277,377 IS a rock)
  // — the pathfinder silently fails on unwalkable destinations.
  var MINE_AREA_CENTER = null;
  var MINE_STAND_TILE = {x: 276, y: 379};

  // Walkable waypoints from wilderness coal mine (~280,380) to Edgeville bank (216,449).
  // The entire route goes SOUTH/SOUTHEAST — Edgeville is directly south of the wilderness mine.
  // No west/southwest needed.
  // Each waypoint is an individual walkTo target — client pathfinder navigates between them.
  var BANK_ROUTE = [
    {x:285,y:390},{x:290,y:400},{x:295,y:410},{x:298,y:420},
    {x:300,y:430},{x:300,y:440},{x:295,y:450},{x:285,y:455},
    {x:270,y:455},{x:250,y:452},{x:230,y:450},{x:216,y:449}
  ];
  // Reverse: Edgeville bank → wilderness coal mine
  var MINE_ROUTE = [
    {x:216,y:449},{x:230,y:450},{x:250,y:452},{x:270,y:455},
    {x:285,y:455},{x:295,y:450},{x:300,y:440},{x:300,y:430},
    {x:298,y:420},{x:295,y:410},{x:290,y:400},{x:285,y:390}
  ];

  // Send a fixed route as a multi-leg walk packet.
  // route: array of {x,y} — first waypoint as shorts (Z), rest as byte offsets (BO).
  // All offsets must be within -128..127 of route[0].
  function sendRouteWalk(route) {
    if (!route || route.length === 0) return false;
    // DEBUG: log the exact packet contents for diagnosis
    var debugParts = ['WP0=(' + route[0].x + ',' + route[0].y + ')'];
    for (var di = 1; di < route.length; di++) {
      debugParts.push('WP' + di + ' dx=' + (route[di].x - route[0].x) + ' dy=' + (route[di].y - route[0].y));
    }
    log('[WALK DEBUG] route: ' + debugParts.join(', '));
    var result = sendRaw(194, 770, function(stream, Z, BO) {
      var preW = stream.W;
      Z(stream, route[0].x);
      Z(stream, route[0].y);
      for (var i = 1; i < route.length; i++) {
        BO(stream, route[i].x - route[0].x);
        BO(stream, route[i].y - route[0].y);
      }
      // DEBUG: dump the raw bytes written
      var postW = stream.W;
      var bytes = [];
      for (var bi = preW; bi < postW; bi++) {
        bytes.push(stream.bX.data[bi] & 0xFF);
      }
      log('[WALK DEBUG] payload bytes (' + (postW - preW) + 'B): [' + bytes.join(',') + ']');
    });
    return result;
  }

  // Send a sub-route starting from the waypoint nearest to (fromX, fromY).
  // Used after combat or terrain stalls — avoids re-walking already-traversed tiles.
  function sendSubRouteWalk(route, fromX, fromY) {
    if (!route || route.length === 0) return false;
    var nearestIdx = 0;
    var nearestDist = Infinity;
    for (var i = 0; i < route.length; i++) {
      var d = Math.abs(route[i].x - fromX) + Math.abs(route[i].y - fromY);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    var subRoute = route.slice(nearestIdx);
    if (subRoute.length === 0) return false;
    log('Sub-route from WP' + nearestIdx + ' (dist=' + nearestDist + '), ' + subRoute.length + ' legs');
    return sendRouteWalk(subRoute);
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITY SCRIPTS
  // ═══════════════════════════════════════════════════════════════

  function utilBonesScript() {
    if (scriptState.phase === 'init') { scriptState.slot = 0; scriptState.phase = 'bury'; }
    if (scriptState.phase === 'bury') {
      if (scriptState.slot >= 30) { log('Done burying'); stopBot(); return 1000; }
      var itemId = getInventoryId(scriptState.slot);
      // Only bury if it's actually bones
      if (BONES.indexOf(itemId) >= 0) {
        log('Burying bones slot ' + scriptState.slot);
        useItem(scriptState.slot);
        scriptState.slot++;
        return 1000;
      }
      scriptState.slot++;
      return 100;
    }
return 1000;
  }

  // ═══ v301: ckWalk — private walk for cooking (copy of walkTo2 with ck state keys) ═══
  function ckWalk(destX, destY) {
    var sKey = 'ckWalk_' + destX + '_' + destY;
    var st = scriptState[sKey];
    if (!st) st = scriptState[sKey] = { px: -9999, py: -9999, lastMove: Date.now(), mode: 'full', stride: 6, fails: 0, slide: 0 };
    var px = getX(), py = getY();
    if (px !== st.px || py !== st.py) {
      st.px = px; st.py = py; st.lastMove = Date.now();
    }
    var mc0 = getMC();
    if (mc0) {
      var lx = destX - (mc0.du || 0), ly = destY - (mc0.dd || 0);
      var plx = px - (mc0.du || 0), ply = py - (mc0.dd || 0);
      var outRegion = lx < 1 || lx > 94 || ly < 1 || ly > 94;
      if (outRegion && st.mode === 'full') {
        var ddx = destX - px, ddy = destY - py;
        var dlen = Math.max(Math.abs(ddx), Math.abs(ddy), 1);
        var step = Math.min(60, dlen);
        var t2x = plx + Math.round(ddx * (step / dlen));
        var t2y = ply + Math.round(ddy * (step / dlen));
        t2x = Math.max(4, Math.min(94, t2x));
        t2y = Math.max(4, Math.min(94, t2y));
        var wx = (mc0.du || 0) + t2x, wy = (mc0.dd || 0) + t2y;
        walkTo(wx, wy);
        log('[CKWALK] dest out-of-region — chunked via (' + wx + ',' + wy + ')');
        return false;
      }
    }
    if (st.mode === 'full') {
      if (Date.now() - st.lastMove > 5000) {
        st.mode = 'hop'; st.hopSince = Date.now(); st.stride = 6; st.fails = 0;
        log('Full-route walk stalled — hop-walking (stale region?)');
      } else {
        walkTo(destX, destY);
        return false;
      }
    } else if (Date.now() - (st.hopSince || 0) > 30000) {
      st.mode = 'full'; st.lastMove = 0; st.hopSince = Date.now() + 30000;
      walkTo(destX, destY);
      return false;
    }
    var dx = destX - px, dy = destY - py;
    var dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist <= 1) { walkTo(destX, destY); return false; }
    if ((st.fails || 0) >= 6) {
      st.fails = 0;
      var nbrs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
      var bestN = null, bestND = Infinity;
      for (var n2 = 0; n2 < nbrs.length; n2++) {
        var nx2 = destX + nbrs[n2][0], ny2 = destY + nbrs[n2][1];
        var nd2 = Math.abs(nx2 - px) + Math.abs(ny2 - py);
        if (nd2 < bestND) { bestND = nd2; bestN = [nx2, ny2]; }
      }
      st.altDest = bestN;
      if (bestN) {
        log('Dest (' + destX + ',' + destY + ') unreachable — walking to neighbor (' + bestN[0] + ',' + bestN[1] + ')');
        ckWalk(bestN[0], bestN[1]);
        return false;
      }
    }
    if (st.markX === px && st.markY === py) {
      st.fails = (st.fails || 0) + 1;
      if (st.fails >= 2) {
        st.fails = 0;
        if ((st.stride || 6) > 1) {
          st.stride = Math.max(1, Math.floor((st.stride || 6) / 2));
        } else {
          st.slide = (st.slide || 0) + 1;
        }
      }
    } else {
      st.markX = px; st.markY = py;
      st.fails = 0; st.slide = 0;
      st.stride = Math.min(8, (st.stride || 6) + 2);
    }
    var stepX, stepY;
    if ((st.slide || 0) > 0 && (st.stride || 6) === 1) {
      var flip = (st.slide % 2 === 0);
      if (Math.abs(dx) >= Math.abs(dy)) { stepX = px; stepY = py + (flip ? 1 : -1); }
      else { stepX = px + (flip ? 1 : -1); stepY = py; }
    } else {
      var ratio = Math.min(st.stride || 6, dist) / dist;
      stepX = px + Math.round(dx * ratio);
      stepY = py + Math.round(dy * ratio);
    }
    var mc = getMC();
    if (window.__r2h_walk && mc) {
      window.__r2h_walk(mc, mc.bJ || 0, mc.bK || 0, stepX - (mc.du || 0), stepY - (mc.dd || 0), false);
    } else {
      walkTo(stepX, stepY);
    }
    return false;
  }

  // ═══ v303: ckFindDoor — discover a boundary door in the corridor between the
  // player and the target by scanning the LIVE client object arrays (dp/dn/fl/ee).
  // Live-verified at Al-Kharid: boundary id 1 @ (85,683) dir 1 present in arrays.
  // Corridor = bounding box of player→target inflated by 4 tiles. Returns the
  // door nearest the player, or null. ═══
  function ckFindDoor(px, py, tx, ty) {
    var mc = getMC();
    if (!mc) return null;
    var n = Number(mc.co || 0);
    if (!n || !mc.dp || !mc.dp.data) return null;
    var loX = Math.min(px, tx) - 4, hiX = Math.max(px, tx) + 4;
    var loY = Math.min(py, ty) - 4, hiY = Math.max(py, ty) + 4;
    var best = null, bestD = Infinity;
    for (var i = 0; i < n && i < 500; i++) {
      var id = Number(mc.fl.data[i]);
      if (CK_DOOR_IDS.indexOf(id) < 0) continue;
      var wx = Number(mc.dp.data[i]) + Number(mc.du || 0);
      var wy = Number(mc.dn.data[i]) + Number(mc.dd || 0);
      if (wx < loX || wx > hiX || wy < loY || wy > hiY) continue;
      var d = Math.abs(wx - px) + Math.abs(wy - py);
      if (d < bestD) { bestD = d; best = { x: wx, y: wy, dir: Number(mc.ee.data[i]) }; }
    }
    return best;
  }

  // ═══ v303: ckDoorState — read a boundary door's open state from the LIVE
  // client arrays (APOS getObjectAtCoord parity). Returns 1 (closed), 2 (open),
  // or 0 (not visible). Boundary doors swap id on toggle: 1→2 open, 2→1 closed. ═══
  function ckDoorState(x, y, dir) {
    var mc = getMC();
    if (!mc) return 0;
    var n = Number(mc.co || 0);
    if (!n || !mc.dp || !mc.dp.data) return 0;
    for (var i = 0; i < n && i < 500; i++) {
      var wx = Number(mc.dp.data[i]) + Number(mc.du || 0);
      var wy = Number(mc.dn.data[i]) + Number(mc.dd || 0);
      if (wx !== x || wy !== y) continue;
      var id = Number(mc.fl.data[i]);
      var d = Number(mc.ee.data[i]);
      if (id === 2 && CK_DOOR_IDS.indexOf(id) >= 0) return 2;   // open door
      if (id === 1 && d === dir) return 1;                       // closed door
    }
    return 0;
  }

  // ═══ v301: makeCookingScript — factory returning tick function ═══
  function makeCookingScript(runtimeConfig) {
    var cfg = runtimeConfig || {};
    var foodName = cfg.foodType || 'Anchovies';
    var food = COOK_FOODS[foodName];
    if (!food) { log('Unknown foodType: ' + foodName + ' — defaulting to Anchovies'); food = COOK_FOODS['Anchovies']; foodName = 'Anchovies'; }
    var dropBurnt = !!cfg.dropBurnt;
    var useGauntlets = !!cfg.gauntlets;
    // v302: 'Auto (nearest)' resolves at init (needs live player position)
    var siteName = cfg.cookSite || 'Auto (nearest)';
    var site = COOK_SITES[siteName];
    if (!site) { siteName = '__auto__'; site = null; }

    // ══ v305: WEBWALK ROUTING (mining-proven pattern, global graph) ══
    // Straight-line ckWalk beelines freeze in city terrain (live: Falador West
    // bank return, Yanille, Seers, Ardougne — user-reported, all door/wall
    // related). The IdleRSC webwalk graph (already used by sealed mining) holds
    // LABELED bank-door edges (faladorWestBankDoor, varrockEastBankDoor,
    // catherbyChefDoor...). Route long walks edge-by-edge; handle door edges by
    // walking to our-side node, clicking the discovered door, silence, verify
    // crossing by proximity-flip to the far node. Monotonic progress (v245
    // ping-pong lesson); 3.2s re-send; nudge on stall (v252b lesson).
    function ckRoute(tx, ty) {
      var key = 'ckR_' + tx + ',' + ty + '@' + Math.round(getX()/8) + ',' + Math.round(getY()/8);
      if (scriptState[key]) return scriptState[key];
      var r = webwalkRoute(getX(), getY(), tx, ty, false);
      // v305b: per-site VIA node — force the route through the verified approach
      // side when the destination's nearest graph node sits behind walls.
      if (!r && site.via) r = null;   // unreachable directly — caller falls back
      if (site.via) {
        var r1 = webwalkRoute(getX(), getY(), site.via[0], site.via[1], false);
        var r2 = webwalkRoute(site.via[0], site.via[1], tx, ty, false);
        if (r1 && r2 && r1.length + r2.length > 2) {
          // stitch: via-leg + dest-leg (skip duplicated via node)
          r = r1.concat(r2.slice(1));
        }
      }
      scriptState[key] = r;
      return r;
    }
    function ckRouteStep(tx, ty) {
      var route = ckRoute(tx, ty);
      if (!route || route.length < 2) return null;
      var px = getX(), py = getY();
      // nearest node with monotonic clamp (v245)
      var rk = 'ckRP_' + tx + ',' + ty;
      var bestIdx = 0, bestD = Infinity;
      for (var i = 0; i < route.length; i++) {
        var d = Math.abs(route[i].x - px) + Math.abs(route[i].y - py);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (scriptState[rk] === undefined) scriptState[rk] = 0;
      if (bestIdx < scriptState[rk]) bestIdx = scriptState[rk];
      else scriptState[rk] = bestIdx;
      var nxt = route[bestIdx + 1];
      if (!nxt) return null;   // at final node — caller beelines the rest
      var beyond = route[bestIdx + 2] || null;   // node past a labeled edge
      return { x: nxt.x, y: nxt.y, label: nxt.label || null,
               bx: beyond ? beyond.x : undefined, by: beyond ? beyond.y : undefined };
    }

    // ── ckCross (v307): GENERIC obstacle crossing — port of mining's
    // _trySpecialEdge discipline (v222-v238, battle-tested). Walk-first
    // alternation: even attempts WALK toward the beyond-tile (an open door
    // crosses with ZERO clicks — never closes an open door); only a blocked walk
    // (odd attempt) sends atBoundary. Crossing = SIDE FLIP on the door's axis
    // (doDoor dir 0/2 = wall along X → axis 'y'; dir 1/3 = wall along Y →
    // axis 'x'). Position is the only truth (client arrays ghost).
    function ckObSide(ob) {
      if (ob.axis === 'y') return getY() > ob.y ? 1 : (getY() < ob.y ? -1 : 0);
      return getX() > ob.x ? 1 : (getX() < ob.x ? -1 : 0);
    }
    function ckCross(door, bx, by, pfx) {
      var ob = scriptState.ckOb;
      if (ob && (ob.x !== door.x || ob.y !== door.y)) ob = null;   // different door
      if (!ob) {
        ob = scriptState.ckOb = { x: door.x, y: door.y, dir: door.dir,
                                  axis: (door.dir === 1 || door.dir === 3) ? 'x' : 'y',
                                  bx: bx, by: by, attempts: 0, lastAction: '' };
        ob.startSide = ckObSide(ob);
        log(pfx + 'obstacle (' + door.x + ',' + door.y + ') dir ' + door.dir +
            ' — crossing (side ' + ob.startSide + ', beyond ' + bx + ',' + by + ')');
      }
      ob.bx = bx; ob.by = by;   // refresh beyond (route may have advanced)
      var side = ckObSide(ob);
      if (side !== 0 && side !== ob.startSide) {
        log(pfx + 'crossed (' + ob.startSide + '→' + side + ') — resuming');
        scriptState.ckOb = null;
        return true;
      }
      if (ob.attempts >= 12) {
        log(pfx + 'obstacle FAILED after 12 attempts — disengaging, rerouting');
        scriptState.ckOb = null;
        // invalidate cached routes so webwalk computes a fresh path
        for (var k in scriptState) {
          if (k.indexOf('ckR_') === 0) scriptState[k] = null;
          if (k.indexOf('ckRP_') === 0) scriptState[k] = undefined;
        }
        return true;   // let the caller continue (nudge machinery takes over)
      }
      if (Date.now() < (scriptState.ckQuiet || 0)) return false;   // post-click silence
      if (ob.attempts % 2 === 0) {
        // WALK attempt — crosses if the door is open; harmless if closed
        if (ob.lastAction !== 'walk') {
          log(pfx + 'walk attempt through to (' + bx + ',' + by + ')');
          ob.lastAction = 'walk';
        }
        walkTo(bx, by);
      } else {
        // CLICK attempt — only after a walk failed (door provably shut).
        // Stand adjacent on OUR side first (server drops boundary clicks from
        // range; doDoor teleports onto the tile on the closed→open transition).
        var dCheb = Math.max(Math.abs(ob.x - getX()), Math.abs(ob.y - getY()));
        if (dCheb > 1) {
          var sxs = [[0,-1],[0,1],[-1,0],[1,0]];
          var bestS = sxs[0], bestD = Infinity;
          for (var s2 = 0; s2 < 4; s2++) {
            var cx2 = ob.x + sxs[s2][0], cy2 = ob.y + sxs[s2][1];
            var cd2 = Math.abs(cx2 - getX()) + Math.abs(cy2 - getY());
            // stay on our side of the axis
            if (ob.axis === 'y' && ((ob.startSide === 1 && cy2 < ob.y) || (ob.startSide === -1 && cy2 > ob.y))) continue;
            if (ob.axis === 'x' && ((ob.startSide === 1 && cx2 < ob.x) || (ob.startSide === -1 && cx2 > ob.x))) continue;
            if (cd2 < bestD) { bestD = cd2; bestS = sxs[s2]; }
          }
          walkTo(ob.x + bestS[0], ob.y + bestS[1]);
          if (ob.lastAction !== 'approach') {
            log(pfx + 'walking adjacent to obstacle before clicking');
            ob.lastAction = 'approach';
          }
        } else {
          atBoundary(ob.x, ob.y, ob.dir);
          scriptState.ckQuiet = Date.now() + 3000;
          ob.lastAction = 'click';
          log(pfx + 'click (door shut — expect open+teleport)');
        }
      }
      ob.attempts++;
      return false;
    }
    function ckTravelTo(tx, ty, pfx) {
      var px0 = getX(), py0 = getY();
      if (Math.max(Math.abs(tx - px0), Math.abs(ty - py0)) <= 3) return true;

      var step = ckRouteStep(tx, ty);
      if (step && step.label) {
        // ── DOOR EDGE (v307: generic ckCross) ──
        var dDoor = Math.max(Math.abs(step.x - getX()), Math.abs(step.y - getY()));
        if (dDoor > 2) {
          if (Date.now() - (scriptState.ckWalkT || 0) > 3000) {
            walkTo(step.x, step.y);
            scriptState.ckWalkT = Date.now();
          }
          return false;
        }
        var door = ckFindDoor(getX(), getY(), step.bx !== undefined ? step.bx : tx, step.by !== undefined ? step.by : ty);
        if (!door) door = site.doorHint;
        if (door && step.bx !== undefined) {
          return ckCross(door, step.bx, step.by, pfx + '[' + step.label + '] ');
        }
        // no door visible — stale arrays; walk at the beyond node to force through
        if (step.bx !== undefined && Date.now() - (scriptState.ckWalkT || 0) > 3000) {
          walkTo(step.bx, step.by);
          scriptState.ckWalkT = Date.now();
        }
        return false;
      }

      // ── normal hop: next node every 3.2s; nudge on 2-stall ──
      if (step) {
        var stall = scriptState.ckHX === getX() && scriptState.ckHY === getY();
        if (!stall || Date.now() - (scriptState.ckWalkT || 0) > 3200) {
          if (stall && (scriptState.ckHStall || 0) >= 2) {
            walkTo(step.x + 2, step.y + 2);
            scriptState.ckHStall = 0;
          } else {
            walkTo(step.x, step.y);
          }
          scriptState.ckWalkT = Date.now();
          if (stall) scriptState.ckHStall = (scriptState.ckHStall || 0) + 1;
          else scriptState.ckHStall = 0;
          scriptState.ckHX = getX(); scriptState.ckHY = getY();
        }
        return false;
      }
      ckWalk(tx, ty);
      return false;
    }

    return function() {
      if (!isLoggedIn()) return 5000;

      // ══ INIT ══
      if (scriptState.phase === 'init') {
        var lvl = getStatBase(7);
        // v302: Auto site — nearest range to the player (fishing 'Auto' pattern)
        if (siteName === '__auto__') {
          var bestD2 = Infinity, bestS = null;
          for (var sn2 in COOK_SITES) {
            var s2 = COOK_SITES[sn2];
            var dd = Math.abs(s2.range[0] - getX()) + Math.abs(s2.range[1] - getY());
            if (dd < bestD2) { bestD2 = dd; bestS = sn2; }
          }
          siteName = bestS || 'Catherby';
          site = COOK_SITES[siteName];
          log('Cooking site auto-detected: ' + siteName + ' (' + bestD2 + ' tiles to range)');
        }
        log('Cooking v302: [' + foodName + '] @ ' + siteName + ' bank=' + site.bank + ' dropBurnt=' + dropBurnt + ' gauntlets=' + useGauntlets + ' lvl=' + lvl);
        if (lvl < food.level) {
          log('Need cooking level ' + food.level + ' for ' + foodName + ' — stopping');
          stopBot();
          return 1000;
        }
        scriptState.ckCooked = 0;
        scriptState.ckBurnt = 0;
        scriptState.ckTrips = 0;
        // v306: START-TIME INVENTORY CHECK — where we begin depends on what we're
        // holding. Raw food in inventory → range as before. Empty/no raws → go to
        // the BANK first (withdraw loop takes over; "bank has no raws" stops there
        // if truly out — user-reported: walking to the range with nothing to cook).
        var startRaw = 0;
        for (var si = 0; si < 30; si++) {
          if (getInventoryId && typeof getInventoryId === 'function') {
            if (getInventoryId(si) === food.raw) startRaw++;
          }
        }
        if (startRaw === 0) {
          log('No raw ' + foodName + ' in inventory — starting at the bank (withdraw)');
          scriptState.phase = 'toBank';
        } else {
          log(startRaw + ' raw ' + foodName + ' in inventory — starting at the range');
          scriptState.phase = 'toRange';
        }
      }

      // ══ FATIGUE / SLEEP (copy fishing pattern) ══
      if (getIsSleeping()) {
        if (!scriptState.sleepTyping) {
          scriptState.sleepTyping = true;
          var sleepWord = 'asleep';
          for (var ci = 0; ci < sleepWord.length; ci++) window.__r2hTypeChar(sleepWord[ci]);
          setTimeout(function() {
            window.__r2hTypeSpecial('Enter');
            scriptState.sleepTyping = false;
          }, 500);
        }
        return 2000;
      }
      var fatigue = getFatigue();
      if (fatigue >= 90) {
        var bagSlot = getInventoryIndex(SLEEPING_BAG);
        if (bagSlot >= 0) { log('Fatigue ' + fatigue + '% — using sleeping bag'); useItem(bagSlot); return 3000; }
      }

      // ══ GLOBAL DOOR SILENCE (v303): while a door action is pending, NO other
      // packets may leave — any packet triggers server resetAll() and cancels the
      // door's WalkToObjectAction + teleport. Checked before ALL phases. ══
      if (Date.now() < (scriptState.ckQuiet || 0) || Date.now() < (scriptState.ckQuietOut || 0)) {
        if (getIsSleeping()) return 2000;
        return 1000;
      }

      // ══ TO RANGE — v305: webwalk travel for the long leg; adjacency discovery
      // only for the final approach (last ≤25 tiles) ══
      if (scriptState.phase === 'toRange') {
        var rx = site.range[0], ry = site.range[1];
        // v307: cook fast-path ONLY from the verified stand zone (cheb≤1 of the
        // INSIDE tile). ckBlocked (set on cook stall) forces the adjacency
        // machinery to MOVE the player — the flag clears once the player has
        // actually moved into the stand zone (position != stall position), then
        // cooking retries from the new side. (Never clear only on cook success —
        // that deadlocks: cook entry requires !ckBlocked.)
        if (Math.max(Math.abs(site.inside[0] - getX()), Math.abs(site.inside[1] - getY())) <= 1) {
          if (scriptState.ckBlocked) {
            if (getX() !== scriptState.ckBlockX || getY() !== scriptState.ckBlockY) {
              scriptState.ckBlocked = false;
              log('Moved off blocked tile — retrying cook from (' + getX() + ',' + getY() + ')');
            } else {
              // still on the dead tile — fall through to adjacency rotation
            }
          }
          if (!scriptState.ckBlocked) {
            scriptState.phase = 'cook'; scriptState.ckPending = 0; scriptState.ckStall = 0;
            return 400;
          }
        }
        // SILENCE GUARD: door action pending — any packet cancels it (resetAll)
        if (Date.now() < (scriptState.ckQuiet || 0)) return 1000;
        var dR = Math.abs(rx - getX()) + Math.abs(ry - getY());
        if (dR > 25) {
          // long leg — webwalk toward the VERIFIED INSIDE tile (routing to the
          // range tile itself snaps to graph nodes on the WRONG side of walls —
          // live lesson Al-Kharid: approach from west = furnace-house door trap)
          if (!ckTravelTo(site.inside[0], site.inside[1], '[→range]')) return 1500;
          // arrived (cheb≤3) — fall through to final approach below
        }
        // final approach — v305: FIRST try a direct walk to the site's verified
        // INSIDE tile (probe-proven per site; e.g. Yanille's gap at (630,749) is
        // walkable straight from outside). Only rotate range-neighbors when the
        // direct inside walk stalls (2-stall → next candidate).
          if (!scriptState.ckDoor) {
            scriptState.ckAdjCache = scriptState.ckAdjCache || {};
            var akey = 'in' + rx + ',' + ry;
            var adjT = scriptState.ckAdjCache[akey];
            if (!adjT) {
              // candidate order: verified inside tile FIRST, then 8 neighbors
              var cands = [[site.inside[0]-rx, site.inside[1]-ry],[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
              cands.sort(function(a, b) {
                var da = Math.abs(rx + a[0] - getX()) + Math.abs(ry + a[1] - getY());
                var db = Math.abs(rx + b[0] - getX()) + Math.abs(ry + b[1] - getY());
                return da - db;
              });
              var ci = (scriptState.ckAdjTry || 0) % cands.length;
              adjT = { x: rx + cands[ci][0], y: ry + cands[ci][1] };
              if ((scriptState.ckAdjTry || 0) === 0) adjT = { x: site.inside[0], y: site.inside[1] };
            }
            var bx4 = getX(), by4 = getY();
            walkTo(adjT.x, adjT.y);
            if (scriptState.ckAdjSentX === bx4 && scriptState.ckAdjSentY === by4 && scriptState.ckAdjSentX !== undefined) {
              scriptState.ckAdjStall = (scriptState.ckAdjStall || 0) + 1;
              if (scriptState.ckAdjStall >= 2) {
                var dr = null;
                if ((scriptState.ckAdjFail || 0) >= 3) {
                  dr = ckFindDoor(bx4, by4, rx, ry);
                  if (!dr && site.doorHint) dr = { x: site.doorHint.x, y: site.doorHint.y, dir: site.doorHint.dir };
                }
                if (dr) {
                  scriptState.ckDoor = dr;
                  scriptState.ckAdjStall = 0;
                  log('Door discovered @ (' + dr.x + ',' + dr.y + ') dir ' + dr.dir + ' — walking to it');
                  return 800;
                }
                delete scriptState.ckAdjCache[akey];
                scriptState.ckAdjTry = (scriptState.ckAdjTry || 0) + 1;
                scriptState.ckAdjStall = 0;
                scriptState.ckAdjFail = (scriptState.ckAdjFail || 0) + 1;
                if ((scriptState.ckAdjFail || 0) >= 12) {
                  log('Range unreachable from all neighbors — stopping');
                  stopBot(); return 2000;
                }
              }
            } else {
              scriptState.ckAdjStall = 0;
              scriptState.ckAdjSentX = bx4; scriptState.ckAdjSentY = by4;
              if (!scriptState.ckAdjCache[akey]) scriptState.ckAdjCache[akey] = adjT;
            }
            return 1500;
          }
          // ckDoor flow (v303 door mode — unchanged, proven at Catherby)
        // ── DOOR MODE → v307: delegated to generic ckCross (walk-first
        // alternation, click only when shut, side-flip crossing proof) ──
        if (scriptState.ckDoor) {
          if (!scriptState.ckBeyond) scriptState.ckBeyond = [rx + 1, ry];
          return ckCross(scriptState.ckDoor, scriptState.ckBeyond[0], scriptState.ckBeyond[1], '[→range] ') ? 1200 : 1500;
        }

        // neighbor candidates of the range, nearest-to-player first
        scriptState.ckAdjCache = scriptState.ckAdjCache || {};
        var akey = rx + ',' + ry;
        var adjT = scriptState.ckAdjCache[akey];
        if (!adjT) {
          var cands = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
          cands.sort(function(a, b) {
            var da = Math.abs(rx + a[0] - getX()) + Math.abs(ry + a[1] - getY());
            var db = Math.abs(rx + b[0] - getX()) + Math.abs(ry + b[1] - getY());
            return da - db;
          });
          var ci = (scriptState.ckAdjTry || 0) % cands.length;
          adjT = { x: rx + cands[ci][0], y: ry + cands[ci][1] };
        }
        var bx4 = getX(), by4 = getY();
        ckWalk(adjT.x, adjT.y);
        // stall detection between ticks
        if (scriptState.ckAdjSentX === bx4 && scriptState.ckAdjSentY === by4 && scriptState.ckAdjSentX !== undefined) {
          scriptState.ckAdjStall = (scriptState.ckAdjStall || 0) + 1;
          if (scriptState.ckAdjStall >= 2) {
            // Door in corridor AND multiple neighbors already failed → door mode.
            // (Last resort only: v303 live lesson — routes passing NEAR enclosed
            // buildings trigger false door mode on ordinary pathing stalls.)
            var dr = null;
            if ((scriptState.ckAdjFail || 0) >= 3) {
              dr = ckFindDoor(bx4, by4, rx, ry);
              if (!dr && site.doorHint) dr = { x: site.doorHint.x, y: site.doorHint.y, dir: site.doorHint.dir };
            }
            if (dr) {
              // v307: generic crossing — walk-first alternation, side-flip verify
              if (!scriptState.ckBeyond) scriptState.ckBeyond = [rx + (rx - bx4), ry + (ry - by4)];
              return ckCross(dr, scriptState.ckBeyond[0], scriptState.ckBeyond[1], '[→range] ') ? 1200 : 1500;
            }
            // no door → this neighbor is dead (wall/water) → next candidate
            delete scriptState.ckAdjCache[akey];
            scriptState.ckAdjTry = (scriptState.ckAdjTry || 0) + 1;
            scriptState.ckAdjStall = 0;
            scriptState.ckAdjFail = (scriptState.ckAdjFail || 0) + 1;
            if ((scriptState.ckAdjFail || 0) >= 12) {
              log('Range unreachable from all neighbors — stopping');
              stopBot(); return 2000;
            }
          }
        } else {
          scriptState.ckAdjStall = 0;
          scriptState.ckAdjSentX = bx4; scriptState.ckAdjSentY = by4;
          if (!scriptState.ckAdjCache[akey]) scriptState.ckAdjCache[akey] = adjT;
        }
        return 1500;
      }

      // ══ COOK (core) ══
      if (scriptState.phase === 'cook') {
        var invCount = getInventoryCount();
        var rawN = 0, cookedN = 0, burntN = 0;
        var rawSlot = -1, cookedSlot = -1, burntSlot = -1;
        for (var i = 0; i < invCount; i++) {
          var id = getInventoryId(i);
          if (id === food.raw) { rawN++; if (rawSlot < 0) rawSlot = i; }
          else if (id === food.cooked) { cookedN++; if (cookedSlot < 0) cookedSlot = i; }
          else if (id === food.burnt) { burntN++; if (burntSlot < 0) burntSlot = i; }
        }

        // 1. Completion accounting FIRST (before any drop hides the burnt item)
        if (scriptState.ckPending) {
          if (rawN < scriptState.ckPendingRaw) {
            if (cookedN > scriptState.ckPendingCooked) scriptState.ckCooked++;
            else if (burntN > scriptState.ckPendingBurnt) scriptState.ckBurnt++;
            scriptState.ckPending = 0;
            scriptState.ckStall = 0;
            scriptState.ckBlocked = false;   // range reachable again — clear flag
            var total = scriptState.ckCooked + scriptState.ckBurnt;
            if (total % 10 === 0) log('Cooked ' + scriptState.ckCooked + ' (burnt ' + scriptState.ckBurnt + ')');
          }
        }

        // 2. Drop burnt if enabled (after accounting saw it)
        if (dropBurnt && burntSlot >= 0) {
          dropItem(burntSlot);
          return 700;
        }

        // 3. No raws left → trip done
        if (rawN === 0) {
          log('Batch done: cooked ' + scriptState.ckCooked + ' burnt ' + scriptState.ckBurnt + ' this trip');
          scriptState.phase = 'toBank';
          return 600;
        }

        // 4. Stall detection — 241s not landing means a wall/door between us and
        // the range: fall back to toRange (adjacency discovery + door clicks)
        if (scriptState.ckPending && (Date.now() - scriptState.ckPending) > 10000) {
          scriptState.ckStall = (scriptState.ckStall || 0) + 1;
          if (scriptState.ckStall >= 2) {
            log('Range not responding — re-approaching (door/wall suspected)');
            scriptState.phase = 'toRange';
            scriptState.ckAdjTry = 0;
            scriptState.ckAdjCache = {};
            scriptState.ckBlocked = true;   // force discovery walk, skip fast-path
            scriptState.ckBlockX = getX(); scriptState.ckBlockY = getY();
            return 800;
          }
          log('Cook stall — resending (attempt ' + scriptState.ckStall + ')');
          scriptState.ckPending = 0;
        }

        // 5. Send cook packet (NOTE: do NOT reset ckStall here — the stall counter
        // must accumulate across resends so escalation to re-approach fires)
        if (!scriptState.ckPending) {
          var slot = getInventoryIndex(food.raw);
          if (slot >= 0) {
            useItemOnObject(slot, site.range[0], site.range[1]);
            scriptState.ckPending = Date.now();
            scriptState.ckPendingRaw = rawN;
            scriptState.ckPendingCooked = cookedN;
            scriptState.ckPendingBurnt = burntN;
            return 1400;
          }
        }
        return 900;
      }

      // ══ TO BANK — v305: webwalk for the long leg (door edges cross inside);
      // short approach beelines ══
      if (scriptState.phase === 'toBank') {
        var bankTile = BANK_REGISTRY[site.bank];
        var chebBank = Math.max(Math.abs(bankTile[0] - getX()), Math.abs(bankTile[1] - getY()));
        if (chebBank <= 2) {
          scriptState.phase = 'bankTalk';
          scriptState._ckBankerMisses = 0;
          scriptState.ckDoorOut = null;
          return 400;
        }
        // SILENCE GUARD (door)
        if (Date.now() < (scriptState.ckQuietOut || 0)) return 1000;
        if (Math.abs(bankTile[0] - getX()) + Math.abs(bankTile[1] - getY()) > 25) {
          if (!ckTravelTo(bankTile[0], bankTile[1], '[→bank]')) return 1500;
          // arrived (cheb≤3) — fall through to short approach
        }
        // short approach — beeline + stall-door fallback (v303 pattern)
        ckWalk(bankTile[0], bankTile[1]);
        if (scriptState.ckOutX === getX() && scriptState.ckOutY === getY()) {
          if (Date.now() - (scriptState.ckOutT || 0) > 3500) {
            var doorOut2 = null;
            if ((scriptState.ckOutStall || 0) >= 2) {
              doorOut2 = ckFindDoor(getX(), getY(), bankTile[0], bankTile[1]);
              if (!doorOut2 && site.doorHint) doorOut2 = { x: site.doorHint.x, y: site.doorHint.y, dir: site.doorHint.dir };
            }
            if (doorOut2) {
              // v307: generic exit crossing
              var bxOut = bankTile[0] + (bankTile[0] - getX()), byOut = bankTile[1] + (bankTile[1] - getY());
              return ckCross(doorOut2, bxOut, byOut, '[→bank] ') ? 1200 : 1500;
            }
            scriptState.ckOutT = Date.now();
            scriptState.ckOutStall = (scriptState.ckOutStall || 0) + 1;
          }
        } else {
          scriptState.ckOutX = getX(); scriptState.ckOutY = getY();
          scriptState.ckOutT = Date.now();
          scriptState.ckOutStall = 0;
        }
        return 1500;
      }
      // ══ BANK TALK ══
      if (scriptState.phase === 'bankTalk') {
        var banker = findNpcs(WC_BANKER_IDS, 3);
        if (banker.length > 0) {
          log('Talking to banker (idx=' + banker[0].serverIndex + ')');
          talkToNpc(banker[0].serverIndex);
          scriptState._ckBankTimer = Date.now();
          scriptState.phase = 'bankOption';
          return 2000;
        }
        var bankTile = BANK_REGISTRY[site.bank];
        walkTo(bankTile[0], bankTile[1]);
        scriptState._ckBankerMisses = (scriptState._ckBankerMisses || 0) + 1;
        if (scriptState._ckBankerMisses >= 12) {
          log('ERROR: no banker near ' + site.bank + ' — stopping');
          stopBot(); return 2000;
        }
        return 1500;
      }

      // ══ BANK OPTION ══
      if (scriptState.phase === 'bankOption') {
        if (isInBank()) { scriptState.phase = 'bankDeposit'; return 500; }
        if (Date.now() - scriptState._ckBankTimer > 2000) {
          optionAnswer(0);
          scriptState._ckBankTimer = Date.now();
        }
        if (Date.now() - (scriptState._ckBankTalkStart || scriptState._ckBankTimer) > 12000) {
          log('Bank not opening — retrying talk');
          scriptState.phase = 'bankTalk';
          scriptState._ckBankTalkStart = Date.now();
        }
        return 1500;
      }

      // ══ BANK DEPOSIT ══
      if (scriptState.phase === 'bankDeposit') {
        if (!isInBank()) {
          if (Date.now() - (scriptState._ckBankTimer || 0) > 8000) {
            log('Bank flag not set — retrying talk');
            scriptState.phase = 'bankTalk';
          }
          return 1500;
        }
        var deposited = 0;
        // deposit cooked
        if (getInventoryIndex(food.cooked) >= 0) {
          depositItem(food.cooked, 9999);
          deposited++;
        }
        // deposit burnt if not dropping
        else if (!dropBurnt && getInventoryIndex(food.burnt) >= 0) {
          depositItem(food.burnt, 9999);
          deposited++;
        }
        // sweep: deposit everything not in keep-list
        if (deposited === 0) {
          scriptState.ckSweepSkip = scriptState.ckSweepSkip || [];
          for (var di = 0; di < getInventoryCount(); di++) {
            var idLeft = getInventoryId(di);
            var keepList = [1263, 700];
            if (rawN > 0) keepList.push(food.raw);
            if (idLeft > 0 && keepList.indexOf(idLeft) < 0 && scriptState.ckSweepSkip.indexOf(idLeft) < 0) {
              scriptState.ckSweepSame = (scriptState.ckSweepSameId === idLeft) ? (scriptState.ckSweepSame || 0) + 1 : 1;
              scriptState.ckSweepSameId = idLeft;
              if (scriptState.ckSweepSame >= 4) {
                log('Sweep stuck on item ' + idLeft + ' (unbankable?) — leaving it in inventory, continuing');
                scriptState.ckSweepSkip.push(idLeft);
                continue;
              }
              depositItem(idLeft, 9999);
              deposited++;
              break;
            }
          }
        }
        if (deposited === 0) {
          // Everything banked — WITHDRAW NEXT (bank still open), close after.
          scriptState.phase = 'bankWithdraw';
          scriptState._ckWithdrawAttempts = 0;
          return 600;
        }
        return 1200;
      }

      // ══ BANK WITHDRAW (bank still open) ══
      if (scriptState.phase === 'bankWithdraw') {
        if (!isInBank()) {
          // Bank closed unexpectedly — if we have raws, go cook; else re-open.
          if (getInventoryIndex(food.raw) >= 0) {
            scriptState.phase = 'toRange';
            return 400;
          }
          scriptState.phase = 'bankTalk';
          return 800;
        }
        // a) gauntlets if needed (withdraw, equip AFTER leaving the bank)
        if (useGauntlets && getInventoryIndex(700) < 0 && !isItemIdEquipped(700)) {
          withdrawItem(700, 1);
          return 1000;
        }
        // b) withdraw raw food
        if (getInventoryIndex(food.raw) < 0) {
          if ((scriptState._ckWithdrawAttempts || 0) >= 2) {
            log('Bank has no raw ' + foodName + ' (id ' + food.raw + ') — stopping');
            stopBot();
            return 1000;
          }
          withdrawItem(food.raw, 30);
          scriptState._ckWithdrawAttempts = (scriptState._ckWithdrawAttempts || 0) + 1;
          return 1200;
        }
        // c) raws in inventory → equip gauntlets if needed, then close
        scriptState.ckTrips = (scriptState.ckTrips || 0) + 1;
        log('Withdrew raws (trip ' + scriptState.ckTrips + ') — closing bank');
        closeBank();
        scriptState._ckCloseTries = 1;
        scriptState._ckCloseT = Date.now();
        scriptState.phase = 'bankClose';
        return 800;
      }

      // ══ BANK CLOSE ══
      if (scriptState.phase === 'bankClose') {
        if (!isInBank()) {
          log('Bank closed — heading to range');
          scriptState.phase = 'leaveEquip';
          return 400;
        }
        if (Date.now() - (scriptState._ckCloseT || 0) > 1200) {
          closeBank();
          scriptState._ckCloseT = Date.now();
          scriptState._ckCloseTries = (scriptState._ckCloseTries || 0) + 1;
          if (scriptState._ckCloseTries % 4 === 0) log('Bank still open after ' + scriptState._ckCloseTries + ' close attempts');
        }
        if (scriptState._ckCloseTries > 12) {
          log('Bank will not close — restarting talk cycle');
          scriptState.phase = 'bankTalk';
          scriptState._ckCloseTries = 0;
        }
        return 800;
      }

      // ══ LEAVE + EQUIP GAUNTLETS ══
      if (scriptState.phase === 'leaveEquip') {
        if (useGauntlets && !isItemIdEquipped(700)) {
          var gSlot = getInventoryIndex(700);
          if (gSlot >= 0) {
            log('Equipping cooking gauntlets');
            wearItem(gSlot);
            return 1500;
          }
          log('Gauntlets missing — continuing without');
        }
        scriptState.phase = 'toRange';
        return 400;
      }

      return 1000;
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SCRIPT REGISTRY
  // ═══════════════════════════════════════════════════════════════

  // Item IDs
  var ORE_COPPER = 155, ORE_TIN = 156, ORE_IRON = 157, ORE_COAL = 158;
  var BAR_BRONZE = 169, BAR_IRON = 170, BAR_STEEL = 171;
  // v304: log/tinderbox ids corrected from server ItemDefs.json (old values were
  // wrong-era: 77/6 → truth 14/166). FiremakingDef.xml levels: oak 15, willow 30,
  // maple 45, yew 60, magic 75.
  var LOG_NORMAL = 14, LOG_OAK = 632, LOG_WILLOW = 633, LOG_MAPLE = 634, LOG_YEW = 635, LOG_MAGIC = 636;
  var KNIFE = 13, CHISEL = 12, TINDERBOX = 166;
  var FLAX = 675, BOW_STRING = 676;
  var GEM_SAPPHIRE = 160, GEM_EMERALD = 161, GEM_RUBY = 162, GEM_DIAMOND = 163;
  var UNCUT_SAPPHIRE = 164, UNCUT_EMERALD = 165, UNCUT_RUBY = 166, UNCUT_DIAMOND = 167;
  // Spell IDs
  var SPELL_HIGH_ALCH = 30, SPELL_LOW_ALCH = 28;
  var SPELL_VARROCK_TELE = 12, SPELL_FALADOR_TELE = 18, SPELL_LUMBRIDGE_TELE = 4;
  // Furnace location (Al Kharid)
  var FURNACE_ALKHARID = {x: 330, y: 530};
  // Anvil location (Varrock west)
  var ANVIL_VARROCK = {x: 150, y: 510};
  // Spinning wheel (Seers)
  var SPIN_WHEEL_SEERS = {x: 523, y: 617};

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 INFRASTRUCTURE: Fatigue, Batch, Options, Paths
  // ═══════════════════════════════════════════════════════════════
  // NOTE: Banking functions (openBank, depositItem, withdrawItem, closeBank,
  // isInBank) and optionAnswer are defined ABOVE (lines ~700-760). The duplicate
  // definitions that were here have been REMOVED to prevent JS hoisting shadowing.

  // ─── Combat Style (opcode 231 = COMBAT_STYLE_CHANGED) ───
  // Payload177 reads: one byte = fight mode (0=Controlled, 1=Aggressive, 2=Accurate, 3=Defensive)
  // NOTE: setFightMode is defined above (line ~547) with both mc.m7 write + opcode send.
  // This duplicate was shadowing it — only sending the opcode without updating the client UI.

  // ─── Option Menu / Question Dialog Answer (opcode 237) ───
  // Payload177 reads: one byte = option index

  function optionAnswer(optionIndex) {
    sendRaw(237, 3, function(stream, Z, BO) {
      BO(stream, optionIndex);
    });
    return true;
  }

  // ─── Fatigue ───
  // NOTE: getFatigue is defined above (line ~562) with proper 0-750→0-100 conversion.
  // This duplicate was shadowing it, returning 0 (auto-discovery failed).
  // Fatigue field 'sp' stores raw 0-750 value. getFatigue() converts to percentage.

  // ─── Batch Bars ───
  // APOS uses "batchProgressBar" reflector field.
  // We can't read the TeaVM field easily, but we CAN use a timing heuristic:
  // After atObject/useItemOnObject, set a batch timer. isBatching() returns true
  // while the timer is active. This matches APOS behavior for most use cases.
  var _batchEndTime = 0;
  function setBatchBars(enabled) {
    // No-op — batch bars are a server-side feature. We just track timing.
    log('setBatchBars(' + enabled + ') — using timing heuristic');
  }
  function isBatching() {
    return Date.now() < _batchEndTime;
  }
  function startBatch(durationMs) {
    _batchEndTime = Date.now() + (durationMs || 3200); // ~3.2s default for RSC batch
  }
  function waitForBatching() {
    // In tick-based architecture, this is just returning the remaining time
    return Math.max(0, _batchEndTime - Date.now());
  }

  // ─── Bank helpers ───
  // Deposit all items except keepIds array
  function depositAllExcept(keepIds) {
    var mc = getMC();
    if (!mc) return;
    keepIds = keepIds || [];
    var count = getInventoryCount();
    for (var i = 0; i < count; i++) {
      var itemId = getInventoryId(i);
      if (keepIds.indexOf(itemId) === -1) {
        depositItem(itemId, getInventoryAmount(i));
      }
    }
  }

  // ─── Combat style application ───
  // Checks if fight mode matches desired, sends setFightMode if not
  var _lastFightMode = -1;
  function ensureFightMode(desiredMode) {
    if (desiredMode < 0 || desiredMode === _lastFightMode) return;
    setFightMode(desiredMode);
    _lastFightMode = desiredMode;
  }

  // ─── Equip / Unequip ───
  function unequipItem(slot) {
    // APOS uses reflection. In our engine, equipping is wearItem().
    // Unequipping might use a different I9 action or opcode.
    // For now, use wearItem on the same slot (toggles equipped state in RSC)
    return wearItem(slot);
  }

  function isItemIdEquipped(itemId) {
    // Check if an item with the given ID is currently equipped/wielded
    var mc = getMC();
    if (!mc) return false;
    try {
      var equipped = mc[F.inventoryEquipped];
      if (equipped && equipped.data) {
        var count = getInventoryCount();
        for (var i = 0; i < count; i++) {
          if (getInventoryId(i) === itemId && equipped.data[i]) return true;
        }
      }
    } catch(e) {}
    return false;
  }

  // ─── Banking locations ───
  var BANK_LOCATIONS = {
    'Lumbridge':   {x: 128, y: 708, bankerNpc: 95},
    'VarrockWest': {x: 168, y: 557, bankerNpc: 95},
    'VarrockEast': {x: 147, y: 505, bankerNpc: 95},
    'Edgeville':   {x: 215, y: 450, bankerNpc: 95},
    'FaladorEast': {x: 285, y: 571, bankerNpc: 95},
    'FaladorWest': {x: 294, y: 576, bankerNpc: 95},
    'Draynor':     {x: 220, y: 635, bankerNpc: 95},
    'Seers':       {x: 503, y: 454, bankerNpc: 95},
    'ArdyNorth':   {x: 580, y: 574, bankerNpc: 95},
    'ArdySouth':   {x: 551, y: 612, bankerNpc: 95},
    'Yanille':     {x: 547, y: 718, bankerNpc: 95},
    'Catherby':    {x: 439, y: 497, bankerNpc: 95},
  };

  function findNearestBank() {
    var px = getX(), py = getY();
    var nearest = null, nearestDist = Infinity;
    for (var name in BANK_LOCATIONS) {
      var loc = BANK_LOCATIONS[name];
      var dist = Math.abs(px - loc.x) + Math.abs(py - loc.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { name: name, loc: loc };
      }
    }
    return nearest;
  }

  // ─── Door opening ───
  function openDoor(worldX, worldY) {
    // Doors in RSC are game objects with specific IDs (60, 64 are common door IDs)
    // atObject or atObject2 opens them
    return atObject(worldX, worldY);
  }

  // ─── Object at coordinate ───
  function getObjectAtCoord(worldX, worldY) {
    var mc = getMC();
    if (!mc) return -1;
    try {
      var localX = worldX - (mc[F.regionX] || 0);
      var localY = worldY - (mc[F.regionY] || 0);
      var objCount = mc[F.gameObjectCount] || 0;
      for (var i = 0; i < objCount; i++) {
        if (mc[F.gameObjectX] && mc[F.gameObjectX].data[i] === localX &&
            mc[F.gameObjectZ] && mc[F.gameObjectZ].data[i] === localY) {
          return mc[F.gameObjectID] ? mc[F.gameObjectID].data[i] : -1;
        }
      }
    } catch(e) {}
    return -1;
  }

  // Combat script factories — each returns a tick function when called with config.
  // makeCombatScript now returns a factory (function that takes runtimeCfg → tick fn).
  // startBot checks this map FIRST; if found, builds the tick fn with runtime config.

  // ═══════════════════════════════════════════════════════════════
  // APOS SCRIPT ID → ENGINE SCRIPT MAPPING
  // Maps the 123 APOS script IDs to our engine's combat/resource/cook scripts.
  // Combat scripts use makeCombatScript with NPC IDs appropriate to each location.
  // Non-combat scripts map to the best matching resource/cook/utility handler.
  // ═══════════════════════════════════════════════════════════════

  // NPC IDs for APOS combat scripts (from RSC wiki + NpcDefs)
  var NPC_COMBAT_MAP = {
    // Standard NPCs
    'AIOFighter': [], // generic — uses user's NPC selection from ScriptPanel
    'Monkz': [174], 'MonkOfZamorak': [193],
    'K_EdgeMankiller': [11, 12, 16], 'K_EdgeGiants': [203, 498],
    'K_EdgeSkeletons': [60, 499], 'K_EdgeThugs': [283],
    'K_EdgeDungeonThugs': [283], 'K_EdgeHobsPlus': [49, 60, 48],
    'K_EdgeChaosDruids': [270], 'K_BoneyardSkeletons': [60, 499],
    'K_BattlefieldTrainer': [0], // multi-NPC battlefield
    'K_HobsPeninsula': [49], 'K_AsgarnianPirateHobs': [49, 234],
    'K_AsgarnianIceGiants': [204], 'K_ArdyMossGiants': [202],
    'K_ArdyChaosDruids': [270], 'K_WhiteUnicorns': [236],
    'K_BlackUnicorns': [235], 'K_NoBank_TavChaos': [270],
    'K_TavChaosDruids': [270], 'K_TavDruidCircle': [125],
    'K_TavDruidTown': [125], 'K_TavBlueDragonPipe': [206],
    'K_TavBlackDragonPipe': [209], 'K_TavBlackDemonPipe': [210],
    'K_Waterfall_FireGiants': [208], 'K_WildyFireGiants': [208],
    'K_YanilleBlueDrag': [206], 'K_YanilleChaosDruids': [270],
    'K_YanilleDruidWarriors': [125], 'K_EdgeHobsPlus': [49, 60, 48],
    'ABC_KBDKiller': [215], 'LimpySnapez': [0], 'Man': [11, 12, 16],
    // Kaila PvM scripts with specific locations
    'K_Paladins': [312], 'K_Nightshade': [0],
    'K_RedSpiderEggz': [0], 'K_WineDrinker': [0],
    'K_SkelliCoal': [0], 'K_HobsMiner': [0],
    'K_MonkRobes': [174], 'K_NatureCrafter': [0],
    'K_NoBank_Superheat': [0], 'K_FastBarbFisher': [0],
    'K_FastChainLinks': [0], 'K_FastChainMaker': [0],
    'K_GnomeMagicTree': [0], 'K_SeersMagicTree': [0],
    'K_ArdyYewTree': [0], 'K_TeleWines': [0],
    'K_Trader': [0], 'K_GiftGiver': [0], 'K_GiftGrabber': [0],
    'K_GiftTaker': [0], 'K_IronGiftOpener': [0],
    'K_BuyAttackCape': [0], 'K_BuyBettyShop': [0],
    'K_BuyDragonSwords': [0], 'K_BuyMagicGuild': [0],
    'K_ChristmasPresents': [0], 'K_CrystalKeyChest': [0],
    'K_EdgeDungeonMine': [0], 'K_kailaScript': [0],
  };

  // Build combat script factories dynamically from the NPC map
  var combatScriptFactories = {};
  for (var aposId in NPC_COMBAT_MAP) {
    var npcIds = NPC_COMBAT_MAP[aposId];
    if (npcIds[0] > 0) {
      combatScriptFactories[aposId] = makeCombatScript(npcIds, {
        buryBones: true, eatAtHp: 15, maxWander: 25, lootIds: [20, 38, 133],
      });
    }
  }
  // Keep the old IDs as aliases
  combatScriptFactories['combat-chickens'] = makeCombatScript([NPC.CHICKEN], {
    buryBones: true, prioritizeBones: true, eatAtHp: 5, maxWander: 25, lootIds: [38],
  });
  combatScriptFactories['combat-cows'] = makeCombatScript([NPC.COW], {
    buryBones: true, eatAtHp: 10, maxWander: 20, lootIds: [147, 149],
  });
  combatScriptFactories['combat-goblins'] = makeCombatScript([NPC.GOBLIN_7, NPC.GOBLIN_13], {
    buryBones: true, prioritizeBones: true, eatAtHp: 10, maxWander: 20, lootIds: [38, 11],
  });
  combatScriptFactories['combat-guard'] = makeCombatScript([NPC.GUARD], {
    buryBones: false, eatAtHp: 20, maxWander: 20, lootIds: [10, 11, 132],
  });
  combatScriptFactories['combat-giants'] = makeCombatScript([NPC.GIANT], {
    buryBones: true, eatAtHp: 20, maxWander: 20, lootIds: [38, 132],
  });
  combatScriptFactories['combat-rats'] = makeCombatScript([NPC.GIANT_RAT, NPC.RAT, NPC.RAT_13, NPC.RAT_8], {
    buryBones: false, eatAtHp: 5, maxWander: 20, lootIds: [],
  });
  combatScriptFactories['combat-spiders'] = makeCombatScript([NPC.SPIDER, NPC.GIANT_SPIDER, NPC.GIANT_SPIDER_31], {
    buryBones: false, eatAtHp: 5, maxWander: 20, lootIds: [],
  });

  var scripts = {

    // ─── Mining ───
    'mine-copper': makeResourceScript([{x:70,y:543},{x:69,y:544},{x:75,y:546}], 2000),
    'mine-tin': makeResourceScript([{x:74,y:545},{x:78,y:545},{x:70,y:546}], 2000),
    'mine-iron': makeResourceScript([{x:72,y:570}], 2000),
    'mine-coal': makeResourceScript([{x:150,y:500}], 3000),

    // ─── Fishing ───
    'fish-net': makeResourceScript([{x:85,y:719},{x:89,y:718}], 30000),
    'fish-bait': makeResourceScript([{x:85,y:719},{x:89,y:718}], 25000),
    'fish-fly': makeResourceScript([{x:125,y:629}], 30000),
    'fish-cage': makeResourceScript([{x:350,y:700}], 35000),

    // ─── Woodcutting ───
    // NOTE: ScriptPanel (the LIVE UI — App.tsx imports ScriptPanel, NOT BotPanel)
    // sends catalog id 'Woodcutting' from scripts.ts. Register the pilot under
    // BOTH ids so the real UI path works and the explicit id stays valid.
    'Woodcutting': makeWoodcuttingScript(null),
    'skilling-woodcutting': makeWoodcuttingScript(null),

    // ─── Auto-Sleeper ───
    // Uses sleeping bag (item ID 1263) from inventory.
    // Player must have a sleeping bag in their inventory.
    'util-sleep': function() {
      if (!isLoggedIn()) return 5000;
      if (scriptState.phase === 'init') {
        var slot = getInventoryIndex(SLEEPING_BAG);
        if (slot < 0) { log('No sleeping bag in inventory! Buy one from general store.'); stopBot(); return 1000; }
        scriptState.bagSlot = slot;
        scriptState.phase = 'sleep';
        log('Using sleeping bag slot ' + slot);
      }
      if (scriptState.phase === 'sleep') {
        useItem(scriptState.bagSlot);
        scriptState.phase = 'wait';
        scriptState.waitStart = Date.now();
        return 2000;
      }
      if (scriptState.phase === 'wait') {
        // Wait for sleep to complete (server sends wake-up automatically)
        // Just retry using the bag after some time
        if (Date.now() - scriptState.waitStart > 15000) {
          scriptState.phase = 'sleep';
          return 1000;
        }
        return 3000;
      }
      return 2000;
    },

    // ─── Auto-Fletcher ───
    // Uses knife on logs to make bows. Cut logs must be in inventory.
    'fletch-bow': function() {
      if (!isLoggedIn()) return 5000;
      if (scriptState.phase === 'init') {
        var knifeSlot = getInventoryIndex(KNIFE);
        if (knifeSlot < 0) { log('No knife!'); stopBot(); return 1000; }
        scriptState.knife = knifeSlot;
        scriptState.phase = 'cut';
        scriptState.logSlot = -1;
      }
      if (scriptState.phase === 'cut') {
        // Find next log in inventory
        var logs = [LOG_NORMAL, LOG_OAK, LOG_WILLOW, LOG_YEW];
        for (var i = 0; i < logs.length; i++) {
          var slot = getInventoryIndex(logs[i]);
          if (slot >= 0) {
            log('Fletching log slot ' + slot);
            useItemOnItem(scriptState.knife, slot);
            scriptState.phase = 'wait';
            scriptState.waitStart = Date.now();
            return 3000;
          }
        }
        log('No logs to fletch!');
        stopBot();
        return 1000;
      }
      if (scriptState.phase === 'wait') {
        if (Date.now() - scriptState.waitStart > 3000) {
          scriptState.phase = 'cut';
          return 500;
        }
        return 2000;
      }
      return 2000;
    },

    // ─── Auto-Gem Cutter ───
    // Uses chisel on uncut gems.
    'craft-gems': function() {
      if (!isLoggedIn()) return 5000;
      if (scriptState.phase === 'init') {
        var chiselSlot = getInventoryIndex(CHISEL);
        if (chiselSlot < 0) { log('No chisel!'); stopBot(); return 1000; }
        scriptState.chisel = chiselSlot;
        scriptState.phase = 'cut';
      }
      if (scriptState.phase === 'cut') {
        var gems = [UNCUT_SAPPHIRE, UNCUT_EMERALD, UNCUT_RUBY, UNCUT_DIAMOND];
        for (var i = 0; i < gems.length; i++) {
          var slot = getInventoryIndex(gems[i]);
          if (slot >= 0) {
            log('Cutting gem slot ' + slot);
            useItemOnItem(scriptState.chisel, slot);
            scriptState.phase = 'wait';
            scriptState.waitStart = Date.now();
            return 2000;
          }
        }
        log('No uncut gems!');
        stopBot();
        return 1000;
      }
      if (scriptState.phase === 'wait') {
        if (Date.now() - scriptState.waitStart > 2000) {
          scriptState.phase = 'cut';
          return 500;
        }
        return 1000;
      }
      return 2000;
    },

    // ─── Auto-Alcher ───
    // High alches items from inventory. Set the item ID in script state.
    'mage-alch': function() {
      if (!isLoggedIn()) return 5000;
      if (scriptState.phase === 'init') {
        // Find first stackable item to alch (fire runes, nature runes won't work)
        // Default to alching the item in slot 0
        scriptState.alchSlot = 0;
        scriptState.phase = 'alch';
        log('High alching items. Make sure you have nature runes + fire runes!');
      }
      if (scriptState.phase === 'alch') {
        if (getInventoryCount() === 0) { log('Inventory empty'); stopBot(); return 1000; }
        castOnItem(SPELL_HIGH_ALCH, scriptState.alchSlot);
        scriptState.phase = 'wait';
        scriptState.waitStart = Date.now();
        return 2000;
      }
      if (scriptState.phase === 'wait') {
        if (Date.now() - scriptState.waitStart > 2000) {
          scriptState.phase = 'alch';
          return 500;
        }
        return 1000;
      }
      return 2000;
    },

    // ─── Auto-Teleporter ───
    // Casts Lumbridge teleport for magic XP.
    'mage-tele': function() {
      if (!isLoggedIn()) return 5000;
      castOnSelf(SPELL_LUMBRIDGE_TELE);
      return 5000; // Rune cooldown
    },

    // ─── Auto-Pickpocket ───
    // Pickpockets the nearest NPC (guards, men, farmers, etc.)
    'thieve-pickpocket': function() {
      if (!isLoggedIn()) return 5000;
      var targets = findNpcs([11, 63, 320]); // Man=11, Farmer=63, Guard=65... use common thievable NPCs
      if (targets.length === 0) { log('No NPC to pickpocket'); return 3000; }
      thieveNpc(targets[0].serverIndex);
      log('Pickpocketing NPC ' + targets[0].serverIndex);
      return 3000;
    },

    // ─── Auto-Caster (magic combat) ───
    // Casts the specified spell on NPCs for magic XP.
    'mage-cast': function() {
      if (!isLoggedIn()) return 5000;
      var targets = findNpcs([NPC.CHICKEN, NPC.COW, NPC.GIANT_RAT]);
      if (targets.length === 0) { log('No target'); return 3000; }
      // Cast wind strike (spell 0) on nearest NPC
      castOnNpc(0, targets[0].serverIndex);
      log('Casting on NPC ' + targets[0].serverIndex);
      return 3000;
    },

    // ─── Utilities ───
    'util-bones': utilBonesScript,

    // ─── Stub (requires web walking) ───
    'cook-pie': function() { log('Not implemented'); return 5000; },

    '_default': function() {
      log('Pos:(' + getX() + ',' + getY() + ') HP:' + getHpPercent() + '% Inv:' + getInventoryCount() + '/30');
      return 3000;
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // ANTI-IDLE
  // ═══════════════════════════════════════════════════════════════

  function antiIdle() {
    var mc = getMC();
    if (!mc) return;

    // Reset lastMouseAction counter — the client auto-logouts when this exceeds 4500.
    // Setting it to 0 tells the client "the user just moved the mouse."
    mc.d4 = 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'R2H_BOT_START') startBot(e.data.scriptId, e.data.config);
    else if (e.data.type === 'R2H_BOT_STOP') stopBot();
  });

  log('Engine v81 loaded — ground items fixed, combat style applied, spiders/rats added');

})();
