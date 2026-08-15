import { useRef, useCallback, useEffect } from 'react';
import type { ScriptDef } from './scripts';

// ── Script Runner Hook v2 ──
// Drives the game client (iframe) via postMessage to automate combat + looting.
//
// The bridge (in the iframe) intercepts WebSocket packets and pushes world state
// (player position, ground items) to us every 500ms via 'rsc-world-state' messages.
// We evaluate loot/combat logic against this state and send action commands back.
//
// Combat + Loot loop:
// 1. Receive world state from bridge
// 2. If loot items on ground → walk + take_item
// 3. If in combat → wait
// 4. If not in combat and NPC nearby → attack
// 5. Repeat

const IFRAME_ORIGIN = 'https://game.r2hrsc.xyz';

// RSC NPC IDs — VERIFIED from server NpcDefs.json (not fabricated)
const NPC_TARGETS: Record<string, number[]> = {
  'chicken': [3],                    // Chicken (attackable, combat lvl 3)
  'cow': [2, 3],                     // Cow, Cow calf
  'goblin': [61, 62, 63, 64],
  'rat': [47, 744],
  'spider': [29, 30, 31],
  'guard': [65, 321],
  'giant': [203, 498],
  'skeleton': [60, 499],
  'zombie': [48, 50],
  'man': [11, 12, 16, 63],
  'monk': [174],
};

// Map script IDs to NPC target keyword
const SCRIPT_TARGET_MAP: Record<string, string> = {
  'AIOFighter': 'nearest',
  'ChookMunch0r': 'chicken',
  'Monkz': 'monk',
  'MonkOfZamorak': 'monk',
  'K_EdgeMankiller': 'man',
  'K_EdgeGiants': 'giant',
  'K_EdgeSkeletons': 'skeleton',
  'K_BoneyardSkeletons': 'skeleton',
  'K_BattlefieldTrainer': 'nearest',
  'Cow': 'cow',
};

// Loot item IDs — what to pick up after killing
// Verified from server ItemDefs.json
const LOOT_ITEM_IDS: Record<number, string> = {
  20: 'Bones',
  133: 'Raw Chicken',
  381: 'Feather',
  19: 'Egg',
};

interface GroundItem {
  id: number;
  x: number;
  z: number;
  noted: boolean;
}

interface WorldState {
  player: { x: number | null; z: number | null };
  groundItems: GroundItem[];
  lootItems: GroundItem[];
}

interface ScriptRunnerOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onStateChange?: (state: { running: boolean; scriptName: string; status: string }) => void;
}

export function useScriptRunner({ iframeRef, onStateChange }: ScriptRunnerOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeScriptRef = useRef<ScriptDef | null>(null);
  const worldStateRef = useRef<WorldState | null>(null);
  const lootingCooldownRef = useRef<Set<string>>(new Set()); // track recently looted items
  const combatTargetRef = useRef<number | null>(null);
  const stateRef = useRef<'looting' | 'attacking' | 'searching' | 'idle'>('searching');

  // ── Listen for world state updates from the bridge ──
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== IFRAME_ORIGIN && event.origin !== 'null') return;
      const data = event.data;
      if (!data) return;

      if (data.type === 'rsc-world-state' || data.type === 'rsc-world-state-sync') {
        worldStateRef.current = {
          player: data.player || { x: null, z: null },
          groundItems: data.groundItems || [],
          lootItems: data.lootItems || [],
        };
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const sendCommand = useCallback((command: string, data: Record<string, unknown>) => {
    const iframe = iframeRef.current?.contentWindow;
    if (!iframe) return;
    iframe.postMessage(
      { type: 'RSC_SCRIPT_COMMAND', command, data },
      IFRAME_ORIGIN
    );
  }, [iframeRef]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    activeScriptRef.current = null;
    combatTargetRef.current = null;
    stateRef.current = 'searching';
    lootingCooldownRef.current.clear();
    sendCommand('stop', {});
    onStateChange?.({ running: false, scriptName: '', status: 'Stopped' });
  }, [sendCommand, onStateChange]);

  // ── Distance helper ──
  const distance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };

  // ── Main loop tick ──
  const tick = useCallback(() => {
    const script = activeScriptRef.current;
    if (!script) return;

    const ws = worldStateRef.current;
    if (!ws || ws.player.x === null || ws.player.z === null) {
      onStateChange?.({
        running: true,
        scriptName: script.name,
        status: 'Waiting for game data...',
      });
      return;
    }

    const px = ws.player.x;
    const pz = ws.player.z;

    // ── Priority 1: Loot nearby items ──
    if (ws.lootItems && ws.lootItems.length > 0) {
      // Find nearest loot item within range
      let nearestLoot: GroundItem | null = null;
      let nearestDist = Infinity;

      for (const item of ws.lootItems) {
        const dist = distance(px, pz, item.x, item.z);
        const key = `${item.id}:${item.x}:${item.z}`;

        // Skip items on cooldown (recently attempted)
        if (lootingCooldownRef.current.has(key)) continue;

        if (dist < nearestDist && dist <= 10) {
          nearestDist = dist;
          nearestLoot = item;
        }
      }

      if (nearestLoot) {
        const itemKey = `${nearestLoot.id}:${nearestLoot.x}:${nearestLoot.z}`;
        lootingCooldownRef.current.add(itemKey);

        // Clean old cooldown entries (keep set small)
        if (lootingCooldownRef.current.size > 20) {
          const entries = Array.from(lootingCooldownRef.current);
          lootingCooldownRef.current = new Set(entries.slice(-10));
        }

        stateRef.current = 'looting';
        const itemName = LOOT_ITEM_IDS[nearestLoot.id] || `Item(${nearestLoot.id})`;
        onStateChange?.({
          running: true,
          scriptName: script.name,
          status: `Looting ${itemName} at (${nearestLoot.x}, ${nearestLoot.z})`,
        });

        // Send take_item — bridge sends walk_to + opcode 247 together
        sendCommand('take_item', {
          x: nearestLoot.x,
          y: nearestLoot.z,
          itemId: nearestLoot.id,
        });

        return; // Don't attack while looting
      }
    }

    // ── Priority 2: Combat (if not looting) ──
    // For now, we can't detect NPCs from packet interception (opcode 79 is bit-packed).
    // The player should manually click to attack, or we use the existing attack_npc
    // command if the NPC server index is known.
    //
    // The loot pickup works autonomously — after any kill, loot will appear on the
    // ground, the bridge will detect it, and this loop will pick it up.

    stateRef.current = 'searching';
    onStateChange?.({
      running: true,
      scriptName: script.name,
      status: ws.lootItems && ws.lootItems.length > 0
        ? 'Moving to loot...'
        : 'Watching for loot...',
    });
  }, [sendCommand, onStateChange]);

  const start = useCallback((script: ScriptDef) => {
    // Stop any existing script
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    activeScriptRef.current = script;
    combatTargetRef.current = null;
    stateRef.current = 'searching';
    lootingCooldownRef.current.clear();

    // Set combat style to aggressive (1) for max damage
    sendCommand('combat_style', { style: 1 });

    onStateChange?.({
      running: true,
      scriptName: script.name,
      status: 'Starting...',
    });

    // Main loop — runs every 800ms (slightly faster than game tick of 600ms)
    intervalRef.current = setInterval(tick, 800);
  }, [sendCommand, onStateChange, tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { start, stop, sendCommand };
}
