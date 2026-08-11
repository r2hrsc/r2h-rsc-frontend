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

  var VERSION = 'v177';
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
    // eu = waypointIndexCurrent. > 0 means the player has pending waypoints.
    return (lp.eu || 0) > 0;
  }

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

  // ─── Walk via W/Z/Y (proven working) ───

  function walkTo(x, y) {
    var mc = getMC();
    if (!mc || !mc.c) { log('walkTo FAIL: no mc or stream'); return false; }
    var stream = mc.c;
    if (!mc.c.bX) { log('walkTo FAIL: stream.bX missing'); return false; }
    var W = window.__r2h_W, Z = window.__r2h_Z, Y = window.__r2h_Y;
    if (!W || !Z || !Y) { log('walkTo FAIL: W/Z/Y not exposed'); return false; }
    W(stream, 194, 770);
    Z(stream, x);
    Z(stream, y);
    Y(stream);
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
    if (W && Z && Y) {
      W(stream, opcode, type || 0);
      if (payloadFn) payloadFn(stream, Z, BO);
      Y(stream);
      return true;
    }
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
  // I9 action 900: W(221,545), Z(localX), Z(localY), Z(slot)

  function useItemOnObject(slot, worldX, worldY) {
    var mc = getMC();
    if (!mc) return false;
    var localX = worldX - (mc[F.regionX] || 0);
    var localY = worldY - (mc[F.regionY] || 0);
    return doAction(900, { coordX: localX, coordY: localY, bQ: slot });
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
    return mc ? (mc[F.invCount] || 0) : 0;
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

  // Get NPC IDs of all attackable NPCs currently visible to the player
  function getNearbyNpcIds() {
    var mc = getMC();
    if (!mc || !mc.b0 || !mc.b0.data) return [3, 29, 34, 62]; // fallback defaults
    var ids = {};
    for (var i = 0; i < mc.b0.data.length; i++) {
      var n = mc.b0.data[i];
      if (n && n.bV) ids[n.bV] = true;
    }
    var result = Object.keys(ids).map(Number);
    return result.length > 0 ? result : [3, 29, 34, 62];
  }

  function startBot(scriptId, config) {
    if (botActive) stopBot();
    currentScript = scriptId;
    botActive = true;
    runtimeConfig = config || {};
    scriptState = { phase: 'init', target: null, killCount: 0, lastAttack: 0, firstScan: true, killedNpcs: {} };
    log('Starting: ' + scriptId + (config ? ' (with config)' : ''));
    window.parent.postMessage({type: 'R2H_BOT_STATUS', status: 'running', script: scriptId}, '*');

    // Combat scripts are factories — build with runtime config if available
    var tickFn;
    if (combatScriptFactories[scriptId]) {
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
      tickFn = makeGatheringScript(ROCK_IDS, 3000, COAL_WILDERNESS);
      log('Mining script "' + scriptId + '" → scanning for rocks (26 coal coords as fallback)');
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
        log('Error: ' + e.message);
        if (botActive) botLoop = setTimeout(runTick, 3000);
      }
    })();
  }

  function stopBot() {
    botActive = false; currentScript = '';
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
        // Check player's own combat state: g8 >= 8 means the player is in melee
        if (mcRange && mcRange[F.localPlayer]) {
          var playerG8 = mcRange[F.localPlayer].g8 || 0;
          inMeleeCombat = (playerG8 >= 8);
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
            // Magic fights from range — allow loot pickup up to 10 tiles, walk if > 3
            var maxLootDist = (cfg.useMagic && cfg.combatSpell) ? 10 : 4;
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
      var targets = findNpcs(npcIds, cfg.maxWander >= 0 ? cfg.maxWander : undefined);

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
  function makeGatheringScript(objectIds, actionTime, fallbackCoords) {
    actionTime = actionTime || 3000;
    fallbackCoords = fallbackCoords || [];
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

      if (getInventoryCount() >= 30) {
        // ══ BANKING STATE MACHINE ══
        // Sub-phases: delay → walk → talk → option → deposit → close → return_walk → done
        var EDGEVILLE_BANK = {x: 216, y: 449};
        var CUR_X = getX(), CUR_Y = getY();
        var curDist = Math.abs(CUR_X - EDGEVILLE_BANK.x) + Math.abs(CUR_Y - EDGEVILLE_BANK.y);

        // ── INIT: enter banking mode ──
        if (scriptState.phase !== 'banking') {
          scriptState.minePos = {x: CUR_X, y: CUR_Y};
          scriptState.phase = 'banking';
          scriptState._bankPhase = 'delay';
          scriptState._bankDelay = 2;
          scriptState._bankStuckTicks = 0;
          scriptState._bankLastDist = curDist;
          scriptState._bankRouteSent = false;
          log('Inventory full — banking: saved minePos (' + CUR_X + ',' + CUR_Y + ')');
        }

        // ── Combat check: don't count stuck ticks while fighting ──
        var pMC = getMC();
        var playerG8 = (pMC && pMC.O) ? (pMC.O.g8 || 0) : 0;
        var inCombat = playerG8 >= 8;

        // ── DISTANCE TRACKING (for stuck detection) ──
        if (!inCombat && curDist < scriptState._bankLastDist) {
          scriptState._bankStuckTicks = 0;
          scriptState._bankLastDist = curDist;
        } else if (!inCombat) {
          scriptState._bankStuckTicks++;
        } else {
          // Reset: being in combat is expected, not "stuck"
          scriptState._bankStuckTicks = 0;
        }

        var bp = scriptState._bankPhase;

        // ── DELAY: wait 2 ticks so server's isBusy() clears ──
        if (bp === 'delay') {
          if (scriptState._bankDelay > 0) {
            scriptState._bankDelay--;
            return 1500;
          }
          scriptState._bankPhase = 'walk';
          return 500;
        }

        // ── WALK TO BANK: send fixed route multi-leg walk ──
        if (bp === 'walk') {
          // Arrived?
          if (curDist <= 2) {
            log('Arrived at Edgeville bank — talking to banker');
            scriptState._bankPhase = 'talk';
            scriptState._bankRouteSent = false;
            return 1000;
          }
          // Stuck detection: no progress for 15+ ticks while NOT in combat
          if (scriptState._bankStuckTicks > 15 && !inCombat) {
            log('Stuck (' + scriptState._bankStuckTicks + ' ticks) — resending route');
            scriptState._bankStuckTicks = 0;
            scriptState._bankRouteSent = false;
          }
          // Send route once
          if (!scriptState._bankRouteSent) {
            var ok = sendRouteWalk(ROUTE_TO_BANK);
            log('Sent ' + ROUTE_TO_BANK.length + '-leg walk to bank, ok=' + ok);
            scriptState._bankRouteSent = true;
            scriptState._bankLastDist = curDist;
          }
          return 1500;
        }

        // ── TALK TO BANKER: find banker NPC, send talk packet ──
        if (bp === 'talk') {
          var BANKER_IDS = [95, 224, 268, 485, 540, 617];
          var banker = findNpcs(BANKER_IDS, 3);
          if (banker.length > 0) {
            log('Talking to banker (idx=' + banker[0].serverIndex + ')');
            talkToNpc(banker[0].serverIndex);
            scriptState._bankTimer = Date.now();
            scriptState._bankPhase = 'option';
            return 3000;  // Wait for dialogue to appear
          }
          log('No banker nearby — walking closer');
          walkTo(EDGEVILLE_BANK.x, EDGEVILLE_BANK.y);
          return 1500;
        }

        // ── SELECT BANK OPTION: dialogue answer 0 ──
        if (bp === 'option') {
          if (isInBank()) {
            // Bank already open — skip to deposit
            scriptState._bankPhase = 'deposit';
            return 500;
          }
          if (Date.now() - scriptState._bankTimer > 4000) {
            // Timeout: resend dialogue answer
            log('Sending bank dialogue option 0');
            optionAnswer(0);
            scriptState._bankTimer = Date.now();
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
          var ORE_IDS = [158, 155, 156, 157, 150, 202, 151, 153, 152, 154, 243]; // coal, copper, tin, iron, etc.
          var deposited = 0;
          for (var oi = 0; oi < ORE_IDS.length; oi++) {
            var oreId = ORE_IDS[oi];
            for (var slot = 0; slot < getInventoryCount(); slot++) {
              if (getInventoryId(slot) === oreId) {
                depositItem(oreId, 9999); // Deposit all of this type
                deposited++;
                break; // One deposit call per ore type
              }
            }
          }
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
            scriptState._bankPhase = 'return_walk';
            scriptState._bankRouteSent = false;
            scriptState._bankLastDist = Math.abs(CUR_X - scriptState.minePos.x) + Math.abs(CUR_Y - scriptState.minePos.y);
            scriptState._bankStuckTicks = 0;
          }
          return 1500;
        }

        // ── RETURN WALK: walk back to mine using reverse route ──
        if (bp === 'return_walk') {
          var mineDist = Math.abs(CUR_X - scriptState.minePos.x) + Math.abs(CUR_Y - scriptState.minePos.y);
          if (mineDist <= 8) {
            log('Arrived back at mine — resuming mining');
            scriptState.phase = 'gather';  // Resume gathering
            return 1000;
          }
          if (scriptState._bankStuckTicks > 15 && !inCombat) {
            log('Stuck on return (' + scriptState._bankStuckTicks + ' ticks) — resending');
            scriptState._bankStuckTicks = 0;
            scriptState._bankRouteSent = false;
          }
          if (!scriptState._bankRouteSent) {
            var ok2 = sendRouteWalk(ROUTE_FROM_BANK);
            log('Sent return route (' + ROUTE_FROM_BANK.length + ' legs), ok=' + ok2);
            scriptState._bankRouteSent = true;
            scriptState._bankLastDist = mineDist;
          }
          // Track progress toward mine
          if (!inCombat && mineDist < scriptState._bankLastDist) {
            scriptState._bankStuckTicks = 0;
            scriptState._bankLastDist = mineDist;
          }
          return 1500;
        }

        return 1500;
      }

      // Try scanning client arrays first (works for respawned rocks)
      var targets = findObjects(objectIds, 20);

      // If no client-side objects, use server-authoritative fallback coords
      if (targets.length === 0 && fallbackCoords.length > 0) {
        if (!scriptState.recentCoords) scriptState.recentCoords = {};
        var now2 = Date.now();
        var px = getX(), py = getY();
        var fbList = [];
        for (var fi = 0; fi < fallbackCoords.length; fi++) {
          var fc = fallbackCoords[fi];
          var fd = Math.abs(fc.x - px) + Math.abs(fc.y - py);
          if (fd <= 20) fbList.push({ worldX: fc.x, worldY: fc.y, dist: fd });
        }
        fbList.sort(function(a,b) { return a.dist - b.dist; });
        targets = fbList;
      }

      // Skip recently-mined rocks in ALL target lists (fallback + findObjects)
      if (!scriptState.recentCoords) { scriptState.recentCoords = {}; log('Init recentCoords tracker'); }
      var now3 = Date.now();
      var freshTargets = [];
      var skippedCount = 0;
      for (var ti = 0; ti < targets.length; ti++) {
        var t = targets[ti];
        var tkey = t.worldX + ',' + t.worldY;
        if (!scriptState.recentCoords[tkey] || (now3 - scriptState.recentCoords[tkey] >= 30000)) {
          freshTargets.push(t);
        } else {
          skippedCount++;
        }
      }
      if (skippedCount > 0) log('Skipped ' + skippedCount + ' recently-mined rocks');
      targets = freshTargets;

      if (targets.length === 0) {
        log('No rocks found nearby. Move closer to the mining area.');
        return 3000;
      }

      var target = targets[0];
      if (target.dist > 15) {
        walkTo(target.worldX, target.worldY);
        return 1500;
      }
      if (target.dist > 3) {
        walkTo(target.worldX, target.worldY);
        return 1200;
      }

      // Mark this rock as recently mined so we move to the next one
      if (!scriptState.recentCoords) scriptState.recentCoords = {};
      var markKey = target.worldX + ',' + target.worldY;
      scriptState.recentCoords[markKey] = Date.now();
      log('Mining rock at (' + target.worldX + ',' + target.worldY + ') dist=' + target.dist);
      atObject(target.worldX, target.worldY);
      return actionTime;
    };
  }

  // Coal rock coords near wilderness mine (284, 380) — from server SceneryLocs.json
  var COAL_WILDERNESS = [{x:266,y:378},{x:270,y:377},{x:270,y:381},{x:271,y:376},
    {x:272,y:377},{x:272,y:378},{x:273,y:371},{x:273,y:381},{x:274,y:374},{x:275,y:377},
    {x:276,y:369},{x:276,y:375},{x:276,y:378},{x:276,y:382},{x:277,y:377},{x:278,y:375},
    {x:278,y:379},{x:279,y:373},{x:279,y:382},{x:280,y:377},{x:280,y:380},{x:282,y:369},
    {x:282,y:373},{x:284,y:378},{x:284,y:382},{x:286,y:379}];

  // Fixed walkable route from wilderness coal mine (~273,382) to Edgeville bank (216,449).
  // All 17 waypoints verified clear of scenery and boundaries via server SceneryLocs.json
  // and BoundaryLocs.json. Each waypoint ~7-10 tiles apart on open walkable ground.
  // Server A* pathfinds between waypoints — no straight diagonals through walls.
  var ROUTE_TO_BANK = [
    {x:273,y:382},{x:274,y:390},{x:277,y:398},{x:279,y:405},
    {x:279,y:413},{x:279,y:421},{x:278,y:429},{x:276,y:436},
    {x:279,y:441},{x:274,y:446},{x:265,y:447},{x:256,y:448},
    {x:247,y:448},{x:237,y:449},{x:227,y:450},{x:220,y:449},
    {x:216,y:449}  // Edgeville bank
  ];
  // Reverse route: Edgeville bank → wilderness coal mine
  var ROUTE_FROM_BANK = [{x:216,y:449},{x:220,y:449},{x:227,y:450},
    {x:237,y:449},{x:247,y:448},{x:256,y:448},{x:265,y:447},
    {x:274,y:446},{x:279,y:441},{x:276,y:436},{x:278,y:429},
    {x:279,y:421},{x:279,y:413},{x:279,y:405},{x:277,y:398},
    {x:274,y:390},{x:273,y:382}];

  // Send a fixed route as a multi-leg walk packet.
  // route: array of {x,y} — first waypoint as shorts (Z), rest as byte offsets (BO).
  // All offsets must be within -128..127 of route[0].
  function sendRouteWalk(route) {
    if (!route || route.length === 0) return false;
    return sendRaw(194, 770, function(stream, Z, BO) {
      Z(stream, route[0].x);
      Z(stream, route[0].y);
      for (var i = 1; i < route.length; i++) {
        BO(stream, route[i].x - route[0].x);
        BO(stream, route[i].y - route[0].y);
      }
    });
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

  // ═══════════════════════════════════════════════════════════════
  // COOK/SMELT/SPIN SCRIPT (use item on object)
  // ═══════════════════════════════════════════════════════════════

  function makeCookScript(stationLoc, itemIds) {
    return function() {
      if (!isLoggedIn()) return 5000;

      if (scriptState.phase === 'init') {
        scriptState.phase = 'cook';
      }

      if (scriptState.phase === 'cook') {
        var slot = -1;
        for (var i = 0; i < itemIds.length; i++) {
          slot = getInventoryIndex(itemIds[i]);
          if (slot >= 0) break;
        }
        if (slot < 0) { log('No items to process!'); stopBot(); return 1000; }

        log('Processing slot ' + slot + ' at (' + stationLoc.x + ',' + stationLoc.y + ')');
        useItemOnObject(slot, stationLoc.x, stationLoc.y);
        scriptState.phase = 'wait';
        scriptState.waitStart = Date.now();
        return 3000;
      }

      if (scriptState.phase === 'wait') {
        if (Date.now() - scriptState.waitStart > 3000) {
          scriptState.phase = 'cook';
          return 500;
        }
        return 1000;
      }
      return 1000;
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SCRIPT REGISTRY
  // ═══════════════════════════════════════════════════════════════

  // Item IDs
  var RAW_FOOD = [345, 343, 350, 352, 355, 357, 359, 362, 364, 367, 370, 373, 349, 351, 353, 356, 358, 360, 361, 363, 365, 366, 368, 369, 371, 372, 374];
  var ORE_COPPER = 155, ORE_TIN = 156, ORE_IRON = 157, ORE_COAL = 158;
  var BAR_BRONZE = 169, BAR_IRON = 170, BAR_STEEL = 171;
  var LOG_NORMAL = 77, LOG_OAK = 183, LOG_WILLOW = 185, LOG_YEW = 187;
  var KNIFE = 13, CHISEL = 12, TINDERBOX = 6;
  var FLAX = 675, BOW_STRING = 676;
  var GEM_SAPPHIRE = 160, GEM_EMERALD = 161, GEM_RUBY = 162, GEM_DIAMOND = 163;
  var UNCUT_SAPPHIRE = 164, UNCUT_EMERALD = 165, UNCUT_RUBY = 166, UNCUT_DIAMOND = 167;
  // Spell IDs
  var SPELL_HIGH_ALCH = 30, SPELL_LOW_ALCH = 28;
  var SPELL_VARROCK_TELE = 12, SPELL_FALADOR_TELE = 18, SPELL_LUMBRIDGE_TELE = 4;
  // Cooking range locations (Lumbridge)
  var RANGE_LUMBRIDGE = {x: 123, y: 640};
  // Furnace location (Al Kharid)
  var FURNACE_ALKHARID = {x: 330, y: 530};
  // Anvil location (Varrock west)
  var ANVIL_VARROCK = {x: 150, y: 510};
  // Spinning wheel (Seers)
  var SPIN_WHEEL_SEERS = {x: 523, y: 617};

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 INFRASTRUCTURE: Banking, Fatigue, Batch, Options, Paths
  // ═══════════════════════════════════════════════════════════════

  // ─── Banking (opcodes 205=deposit, 206=withdraw, 207=close) ───
  // Payload177 reads: catalogID=short, amount=short

  function openBank(bankerServerIndex) {
    // Talk to banker NPC to open bank interface (I9 action 600 = NPC talk)
    return doAction(600, { bQ: bankerServerIndex, eX: -1, oM: 0 });
  }

  function depositItem(itemId, amount) {
    sendRaw(205, 523, function(stream, Z, BO) {
      Z(stream, itemId);
      Z(stream, amount);
    });
    return true;
  }

  function withdrawItem(itemId, amount) {
    sendRaw(206, 655, function(stream, Z, BO) {
      Z(stream, itemId);
      Z(stream, amount);
    });
    return true;
  }

  function closeBank() {
    sendRaw(207, 886, function(stream, Z, BO) {});
    return true;
  }

  // Probe mc object for showDialogBank field (set by server bank-open opcode)
  // The field is a boolean that's true when the bank interface is showing.
  // We'll cache it after first successful probe.
  var _bankDialogField = null;
  function isInBank() {
    var mc = getMC();
    if (!mc) return false;
    return mc.lD ? true : false;  // showDialogBank field
  }

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
    'ABC_KBDKiller': [215], 'ChickenMunch0r': [3],
    'LimpySnapez': [0], 'Man': [11, 12, 16],
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
    'wc-normal': makeResourceScript([{x:112,y:603},{x:113,y:571},{x:115,y:570}], 10000),
    'wc-oak': makeResourceScript([{x:120,y:550}], 17000),
    'wc-willow': makeResourceScript([{x:200,y:600}], 35000),
    'wc-yew': makeResourceScript([{x:200,y:500}], 120000),

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

    // ─── Auto-Cooker ───
    // Cooks raw food on a range. Player must stand near a range.
    // Uses action 900 (use item on object) with the range coords.
    'cook-meat': makeCookScript(RANGE_LUMBRIDGE, RAW_FOOD),
    'cook-fish': makeCookScript(RANGE_LUMBRIDGE, RAW_FOOD),

    // ─── Auto-Smelter ───
    // Smelts ore into bars at a furnace.
    'smith-smelt': makeCookScript(FURNACE_ALKHARID, [ORE_COPPER, ORE_TIN, ORE_IRON]),

    // ─── Auto-Smither ───
    // Smiths bars into items on an anvil.
    'smith-anvil': makeCookScript(ANVIL_VARROCK, [BAR_BRONZE, BAR_IRON, BAR_STEEL]),

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

    // ─── Auto-Flax Spinner ───
    // Uses flax on spinning wheel to make bow strings.
    'craft-flax': makeCookScript(SPIN_WHEEL_SEERS, [FLAX]),

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
