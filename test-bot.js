#!/usr/bin/env node
/**
 * R2H Bot Engine — Local Test Harness
 *
 * Simulates the TeaVM game client so we can test bot logic OFFLINE.
 * No deploying blind guesses. Run: node test-bot.js
 *
 * The harness creates a mock `window.__r2h_mc` with realistic game state,
 * then runs the actual engine tick function and shows what the bot does.
 */

const fs = require('fs');
const path = require('path');

// ─── Mock TeaVM typed arrays (match the real classes.js structure) ───
function makeTypedArray(size) {
  return { data: new Int32Array(size), length: size };
}

// ─── Simulated Game World ───
class GameWorld {
  constructor() {
    this.tick = 0;
    this.realTime = Date.now();

    // Player state
    this.playerWorldX = 120;
    this.playerWorldY = 605;
    this.playerLocalX = 55;  // bJ
    this.playerLocalY = 53;  // bK
    this.regionBaseX = 65;   // du
    this.regionBaseY = 552;  // dd
    this.hp = 99;
    this.fatigue = 0;
    this.sleeping = false;
    this.combatStyle = 0;

    // Inventory
    this.invCount = 5;
    this.invItems = [87, 166, 170, 32, 1263]; // pickaxe, etc + sleeping bag

    // NPCs — simulate chicken pen at Lumbridge
    // NPC type 3 = chicken. Pixels = tile * 128 + offset
    this.npcs = [];
    this.spawnChickens(8);

    // Ground items
    this.groundItems = [];
    this.groundItemCounter = 0;

    // Packets sent by the bot (for verification)
    this.packetsSent = [];
    this.actionsLog = [];
  }

  spawnChickens(count) {
    for (let i = 0; i < count; i++) {
      const tileX = this.playerLocalX + Math.floor(Math.random() * 6) - 2;
      const tileY = this.playerLocalY + Math.floor(Math.random() * 6) - 2;
      this.npcs.push({
        ea: 1000 + this.npcs.length,  // serverIndex
        bV: 3,                         // NPC type (chicken)
        F: tileX * 128,               // pixelX
        E: tileY * 128,               // pixelY
        alive: true,
        deathTick: -1,                // set when killed
      });
    }
  }

  // Drop loot when NPC dies
  dropLoot(npc) {
    const tileX = Math.floor(npc.F / 128);
    const tileY = Math.floor(npc.E / 128);
    // Chickens drop: bones(20), feathers(38), raw chicken(133)
    this.groundItems.push({
      id: 20,  // bones
      cx: tileX,  // local X (what the client stores)
      cw: tileY,  // local Z
      index: this.groundItemCounter++,
    });
    this.groundItems.push({
      id: 38,  // feathers
      cx: tileX,
      cw: tileY,
      index: this.groundItemCounter++,
    });
  }

  // Called when bot sends attackNpc
  onAttackNpc(serverIndex) {
    const npc = this.npcs.find(n => n.ea === serverIndex && n.alive);
    if (!npc) { this.actionsLog.push(`ATTACK ${serverIndex} → NPC not found!`); return; }
    // Walk player to NPC (instant in sim, takes ~1 tick in real game)
    this.playerLocalX = Math.floor(npc.F / 128);
    this.playerLocalY = Math.floor(npc.E / 128);
    // NPC dies 1-2 ticks later (simulating 99 combat 1-hitting chickens)
    npc.deathTick = this.tick + 2;
    this.actionsLog.push(`ATTACK ${serverIndex} → walking to NPC, will die in 2 ticks`);
  }

  // Called when bot sends pickupItem
  onPickupItem(worldX, worldY, itemId) {
    const localX = worldX - this.regionBaseX;
    const localY = worldY - this.regionBaseY;
    const itemIdx = this.groundItems.findIndex(g =>
      g.cx === localX && g.cw === localY && g.id === itemId
    );
    if (itemIdx >= 0) {
      const item = this.groundItems[itemIdx];
      this.groundItems.splice(itemIdx, 1);
      // Add to inventory
      this.invItems.push(itemId);
      this.invCount++;
      this.actionsLog.push(`PICKUP item ${itemId} at (${worldX},${worldY}) → added to inventory`);
    } else {
      this.actionsLog.push(`PICKUP item ${itemId} at (${worldX},${worldY}) → NOT FOUND (stale coords?)`);
    }
  }

  // Called when bot sends useItem (eat/bury)
  onUseItem(slot) {
    if (slot < this.invItems.length) {
      const itemId = this.invItems[slot];
      this.actionsLog.push(`USE_ITEM slot ${slot} (item ${itemId})`);
      if (itemId === 20 || itemId === 413 || itemId === 604 || itemId === 814) {
        // Bury bones — removes from inventory
        this.invItems.splice(slot, 1);
        this.invCount--;
      }
    }
  }

  // Advance the simulation by one game tick
  advance() {
    this.tick++;
    this.realTime += 600;

    // Process NPC deaths
    for (const npc of this.npcs) {
      if (npc.alive && npc.deathTick === this.tick) {
        npc.alive = false;
        this.dropLoot(npc);
        this.actionsLog.push(`NPC ${npc.ea} DIED → dropped bones(20) + feathers(38)`);
      }
    }

    // Remove dead NPCs from the render array after 2 ticks (death animation)
    this.npcs = this.npcs.filter(n => n.alive || n.deathTick > this.tick - 2);
  }

  // Build the mock mc object that the engine reads
  getMC() {
    const self = this;
    return {
      // Coordinate fields
      bJ: this.playerLocalX,
      bK: this.playerLocalY,
      du: this.regionBaseX,
      dd: this.regionBaseY,

      // Inventory
      cU: this.invCount,
      b4: { data: new Int32Array(30).map((_, i) => self.invItems[i] || 0), length: 30 },

      // Stats
      hy: { data: new Int32Array(18).fill(99), length: 18 },
      fw: { data: new Int32Array(18).fill(99), length: 18 },

      // Fatigue / sleep
      sp: this.fatigue,
      i6: this.sleeping ? 1 : 0,
      c8: this.combatStyle,

      // NPCs
      b0: {
        data: this.npcs.filter(n => n.alive).map(n => ({
          ea: n.ea,
          bV: n.bV,
          F: n.F,
          E: n.E,
        })),
        length: this.npcs.filter(n => n.alive).length,
      },

      // Ground items
      b9: this.groundItems.length,
      cx: { data: new Int32Array(1500).map((_, i) => self.groundItems[i]?.cx || 0), length: 1500 },
      cw: { data: new Int32Array(1500).map((_, i) => self.groundItems[i]?.cw || 0), length: 1500 },
      cn: { data: new Int32Array(1500).map((_, i) => self.groundItems[i]?.id || 0), length: 1500 },

      // Game objects (empty for combat test)
      co: 0,
      dp: { data: new Int32Array(500), length: 500 },
      dn: { data: new Int32Array(500), length: 500 },
      fl: { data: new Int32Array(500), length: 500 },

      // Anti-idle
      d4: 0,

      // Client stream (for walk/packet sending)
      c: { bX: true },

      // Dialog flags
      lD: 0, lv: 0,
    };
  }
}

// ─── Test Runner ───
async function runTest() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  R2H Bot Engine — Offline Test Harness');
  console.log('═══════════════════════════════════════════════════\n');

  const world = new GameWorld();

  // Mock window with all the functions the engine expects
  const packets = [];
  global.window = {
    __r2h_bot_engine: false,
    __r2h_mc: world.getMC(),
    __r2h_I9: function(mc, idx) {
      // I9 not used for combat in current engine (uses sendRaw)
    },
    __r2h_W: function(stream, opcode, type) {
      packets.push({ opcode, type });
    },
    __r2h_Z: function(stream, value) {
      const pkt = packets[packets.length - 1];
      if (pkt) {
        pkt.payload = pkt.payload || [];
        pkt.payload.push(value);
      }
    },
    __r2h_Y: function(stream) {
      // finishPacket — process the action
      const pkt = packets[packets.length - 1];
      if (!pkt) return;

      // Interpret the packet
      if (pkt.opcode === 244) {
        // NPC_ATTACK
        const serverIndex = pkt.payload[0];
        world.onAttackNpc(serverIndex);
      } else if (pkt.opcode === 252) {
        // GROUND_ITEM_TAKE
        const [wx, wy, itemId] = pkt.payload;
        world.onPickupItem(wx, wy, itemId);
      } else if (pkt.opcode === 246) {
        // ITEM_COMMAND (eat/bury)
        const slot = pkt.payload[0];
        world.onUseItem(slot);
      } else if (pkt.opcode === 194) {
        // WALK
        world.actionsLog.push(`WALK to (${pkt.payload[0]},${pkt.payload[1]})`);
      }
    },
    __r2h_BO: function(stream, value) {
      const pkt = packets[packets.length - 1];
      if (pkt) {
        pkt.payload = pkt.payload || [];
        pkt.payload.push(value);
      }
    },
    addEventListener: function(event, handler) {
      if (event === 'message') {
        this._messageHandler = handler;
      }
    },
    postMessage: function(msg) {
      // Engine sends status updates — we can log them
    },
    parent: {
      postMessage: function(msg) {
        if (msg.type === 'R2H_BOT_STATUS') {
          // Status update
        }
      }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console,
  };

  // Load the engine
  const enginePath = process.env.ENGINE_PATH || path.join(__dirname, 'public', 'game', 'r2h-bot-engine.js');
  const engineCode = fs.readFileSync(enginePath, 'utf-8');
  eval(engineCode);

  console.log('Engine loaded. Starting combat test...\n');

  // Start the AIOFighter script
  window._messageHandler({ data: { type: 'R2H_BOT_START', scriptId: 'AIOFighter', config: {} } });

  // Run simulation for 100 ticks (100 game ticks ≈ 60 seconds of gameplay)
  console.log('Simulating 100 game ticks (≈60 seconds)...\n');
  console.log('Initial state: ' + world.npcs.filter(n => n.alive).length + ' chickens alive');
  console.log('Player at (' + world.playerWorldX + ',' + world.playerWorldY + ')\n');

  // We need to advance time manually since setTimeout uses real time
  // Let's run with real setTimeout but fast-forward by overriding Date.now
  const originalDateNow = Date.now;
  let simulatedTime = Date.now();

  // Override Date.now to use our simulated time
  Date.now = () => simulatedTime;

  // Run ticks with real setTimeout (the engine uses setTimeout internally)
  return new Promise((resolve) => {
    let ticksRun = 0;
    const maxTicks = 50;

    function runNextTick() {
      if (ticksRun >= maxTicks) {
        Date.now = originalDateNow;
        resolve();
        return;
      }

      // Update the mc object before each tick
      global.window.__r2h_mc = world.getMC();

      // Advance simulation
      world.advance();

      // Advance simulated time by ~700ms per tick
      simulatedTime += 700;

      // Log what happened this tick
      if (world.actionsLog.length > 0) {
        for (const action of world.actionsLog) {
          console.log(`  [T${world.tick}] ${action}`);
        }
        world.actionsLog = [];
      }

      // Log packets sent
      while (packets.length > 0) {
        const pkt = packets.shift();
        console.log(`  [T${world.tick}] PACKET opcode=${pkt.opcode} payload=[${pkt.payload?.join(',') || ''}]`);
      }

      ticksRun++;

      // Wait for the real setTimeout to fire
      setTimeout(runNextTick, 10); // Fast — 10ms real time per simulated tick
    }

    // Give the engine a moment to start
    setTimeout(runNextTick, 100);
  }).then(() => {
    Date.now = originalDateNow;

    // Final report
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  TEST RESULTS');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Chickens alive:      ${world.npcs.filter(n => n.alive).length}`);
    console.log(`  Ground items left:   ${world.groundItems.length}`);
    console.log(`  Inventory count:     ${world.invCount}`);
    console.log(`  Inventory items:     [${world.invItems.join(',')}]`);
    console.log(`  Packets sent total:  ${packets.length}`);
    console.log('═══════════════════════════════════════════════════\n');
  });
}

runTest().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
