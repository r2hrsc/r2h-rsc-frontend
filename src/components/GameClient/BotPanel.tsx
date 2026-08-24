import { useState, useCallback, useEffect } from 'react';

// ── Script Definitions ──
// Organized by skill category, matching classic RSC botting scripts.

interface BotScript {
  id: string;
  name: string;
  description: string;
  category: ScriptCategory;
  isCombat?: boolean;
  requiredLevel?: number;
  requiredItems?: string[];
}

type ScriptCategory = 'Combat' | 'Mining' | 'Smithing' | 'Fishing' | 'Woodcutting' | 'Cooking' | 'Magic' | 'Crafting' | 'Thieving' | 'Utility';

// ── Combat config that gets sent to the engine ──
interface CombatConfig {
  buryBones: boolean;
  prioritizeBones: boolean;
  eatAtHp: number;
  maxWander: number;
  fightMode: number;   // -1=skip, 0=controlled, 1=aggressive, 2=accurate, 3=defensive
  targetLevel: number; // -1=disabled
}

// Default combat config — all fields start as undefined so script defaults take priority.
// When the user opens a config panel, the UI is populated from the MERGED config
// (script defaults + any prior user overrides).
const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  buryBones: true,
  prioritizeBones: false,
  eatAtHp: 10,
  maxWander: 20,
  fightMode: -1,
  targetLevel: -1,
};

// Per-script default overrides (from the engine's combatScriptFactories)
const SCRIPT_DEFAULTS: Record<string, Partial<CombatConfig>> = {
  'combat-chickens': { buryBones: true, prioritizeBones: true, eatAtHp: 5, maxWander: 25 },
  'combat-rats':     { buryBones: false, eatAtHp: 5, maxWander: 20 },
  'combat-spiders':  { buryBones: false, eatAtHp: 5, maxWander: 20 },
  'combat-cows':     { buryBones: true, eatAtHp: 10, maxWander: 20 },
  'combat-goblins':  { buryBones: true, prioritizeBones: true, eatAtHp: 10, maxWander: 20 },
  'combat-guard':    { buryBones: false, eatAtHp: 20, maxWander: 20 },
  'combat-giants':   { buryBones: true, eatAtHp: 20, maxWander: 20 },
};

const FIGHT_MODES = [
  { value: -1, label: 'Default' },
  { value: 0, label: 'Controlled' },
  { value: 1, label: 'Aggressive (Str)' },
  { value: 2, label: 'Accurate (Atk)' },
  { value: 3, label: 'Defensive (Def)' },
];

const SCRIPTS: BotScript[] = [
  // Combat (AIOFighter — configurable: bone bury, loot pickup, food eating, fatigue sleep)
  { id: 'combat-chickens', name: 'Attack Chickens', description: 'Fights chickens. Auto-loots feathers, eats food, manages fatigue.', category: 'Combat', isCombat: true },
  { id: 'combat-rats', name: 'Attack Rats/Spiders', description: 'Fights rats and spiders. Good low-level training.', category: 'Combat', isCombat: true },
  { id: 'combat-spiders', name: 'Attack Spiders', description: 'Fights spiders. Good low-level training.', category: 'Combat', isCombat: true },
  { id: 'combat-cows', name: 'Attack Cows', description: 'Fights cows. Loots cowhide + meat. Bring food.', category: 'Combat', isCombat: true },
  { id: 'combat-goblins', name: 'Attack Goblins', description: 'Fights goblins. Loots coins + items. Bone bury optional.', category: 'Combat', isCombat: true },
  { id: 'combat-guard', name: 'Attack Guards', description: 'Fights Varrock guards. Higher XP. Bring food!', category: 'Combat', isCombat: true, requiredLevel: 20 },
  { id: 'combat-giants', name: 'Attack Hill Giants', description: 'Fights hill giants. Big bones + rune drops.', category: 'Combat', isCombat: true, requiredLevel: 35 },

  // Mining
  { id: 'mine-copper', name: 'Mine Copper', description: 'Mines copper ore in the Varrock mine.', category: 'Mining' },
  { id: 'mine-tin', name: 'Mine Tin', description: 'Mines tin ore in the Varrock mine.', category: 'Mining' },
  { id: 'mine-iron', name: 'Mine Iron', description: 'Power-mine iron for fast XP.', category: 'Mining', requiredLevel: 15 },
  { id: 'mine-coal', name: 'Mine Coal', description: 'Mines coal. Banks ore.', category: 'Mining', requiredLevel: 30 },

  // Smithing
  { id: 'smith-smelt', name: 'Smelt Bars', description: 'Smelts ore into bars at the Al Kharid furnace.', category: 'Smithing' },
  { id: 'smith-anvil', name: 'Smith Items', description: 'Smiths bars into items on an anvil. Bring hammer.', category: 'Smithing' },

  // Fishing
  { id: 'fish-net', name: 'Net Shrimp', description: 'Catches shrimp with a small net.', category: 'Fishing' },
  { id: 'fish-bait', name: 'Bait Fish', description: 'Catches sardine and herring.', category: 'Fishing', requiredLevel: 5 },
  { id: 'fish-fly', name: 'Fly Fish', description: 'Catches trout and salmon. Fast XP.', category: 'Fishing', requiredLevel: 20 },
  { id: 'fish-cage', name: 'Cage Lobster', description: 'Catches lobsters in Karamja.', category: 'Fishing', requiredLevel: 40 },

  // Woodcutting
  { id: 'wc-normal', name: 'Chop Trees', description: 'Chops regular trees around Lumbridge.', category: 'Woodcutting' },
  { id: 'wc-oak', name: 'Chop Oaks', description: 'Chops oak trees east of Varrock.', category: 'Woodcutting', requiredLevel: 15 },
  { id: 'wc-willow', name: 'Chop Willows', description: 'Chops willow trees in Draynor.', category: 'Woodcutting', requiredLevel: 30 },
  { id: 'wc-yew', name: 'Chop Yews', description: 'Chops yew trees. High value.', category: 'Woodcutting', requiredLevel: 60 },
  { id: 'skilling-woodcutting', name: 'Normal Tree Woodcutting (pilot)', description: 'Dynamic tree scanning, felled-tile rotation, axe check, fatigue handling. Stops at full inventory.', category: 'Woodcutting' },

  // Cooking
  { id: 'cook-meat', name: 'Cook Meat', description: 'Cooks raw meat on a range.', category: 'Cooking' },
  { id: 'cook-fish', name: 'Cook Fish', description: 'Cooks raw fish on a range.', category: 'Cooking', requiredLevel: 5 },
  { id: 'cook-pie', name: 'Bake Pies', description: 'Bakes pies from ingredients.', category: 'Cooking', requiredLevel: 20 },

  // Magic
  { id: 'mage-cast', name: 'Cast Spells', description: 'Casts combat spells on chickens.', category: 'Magic', requiredLevel: 3 },
  { id: 'mage-alch', name: 'High Alch', description: 'Alchemizes items for magic XP.', category: 'Magic', requiredLevel: 21 },
  { id: 'mage-tele', name: 'Teleport (Lumbridge)', description: 'Casts Lumbridge teleport for XP.', category: 'Magic', requiredLevel: 25 },

  // Crafting
  { id: 'fletch-bow', name: 'Fletch Bows', description: 'Uses knife on logs to make bows.', category: 'Crafting' },
  { id: 'craft-gems', name: 'Cut Gems', description: 'Uses chisel on uncut gems.', category: 'Crafting' },
  { id: 'craft-flax', name: 'Spin Flax', description: 'Spins flax into bow strings.', category: 'Crafting' },

  // Thieving
  { id: 'thieve-pickpocket', name: 'Pickpocket', description: 'Pickpockets nearby NPCs.', category: 'Thieving' },

  // Utility
  { id: 'util-bones', name: 'Bury Bones', description: 'Buries all bones in inventory for prayer XP.', category: 'Utility' },
  { id: 'util-sleep', name: 'Use Sleeping Bag', description: 'Uses sleeping bag to reduce fatigue.', category: 'Utility' },
];

const CATEGORIES: ScriptCategory[] = ['Combat', 'Mining', 'Smithing', 'Fishing', 'Woodcutting', 'Cooking', 'Magic', 'Crafting', 'Thieving', 'Utility'];

const CATEGORY_ICONS: Record<ScriptCategory, string> = {
  Combat: '⚔️',
  Mining: '⛏️',
  Smithing: '🔨',
  Fishing: '🎣',
  Woodcutting: '🪓',
  Cooking: '🍳',
  Magic: '✨',
  Crafting: '🧵',
  Thieving: '🤏',
  Utility: '📦',
};

interface BotPanelProps {
  isLoggedIn: boolean;
}

export default function BotPanel({ isLoggedIn }: BotPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ScriptCategory>('Combat');
  const [activeScript, setActiveScript] = useState<string | null>(null);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [combatConfig, setCombatConfig] = useState<CombatConfig>(DEFAULT_COMBAT_CONFIG);
  const [runtime, setRuntime] = useState(0);

  useEffect(() => {
    if (!activeScript) { setRuntime(0); return; }
    const interval = setInterval(() => setRuntime(r => r + 1), 1000);
    return () => clearInterval(interval);
  }, [activeScript]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Build combat config for a specific script — merges defaults with user overrides
  const getCombatConfig = useCallback((scriptId: string): CombatConfig => {
    const scriptDefaults = SCRIPT_DEFAULTS[scriptId] || {};
    return { ...DEFAULT_COMBAT_CONFIG, ...scriptDefaults, ...combatConfig };
  }, [combatConfig]);

  const startScript = useCallback((scriptId: string) => {
    const script = SCRIPTS.find(s => s.id === scriptId);
    if (!script) return;

    // Build config payload for combat scripts
    const config = script.isCombat ? getCombatConfig(scriptId) : undefined;

    console.log('[BotPanel] Starting script:', scriptId, config ? { config } : '');
    setActiveScript(scriptId);
    setRuntime(0);

    const gameFrame = document.querySelector('.game-frame iframe');
    const iframe = gameFrame || document.querySelector('iframe[title*="Game"]');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'R2H_BOT_START',
        scriptId,
        scriptName: script.name,
        category: script.category,
        config,  // ← runtime config overrides sent to engine
      }, '*');
    }
  }, [getCombatConfig]);

  const stopScript = useCallback(() => {
    const gameFrame = document.querySelector('.game-frame iframe');
    const iframe = gameFrame || document.querySelector('iframe[title*="Game"]');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'R2H_BOT_STOP' }, '*');
    }
    setActiveScript(null);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'R2H_BOT_STATUS') {
        if (e.data.status === 'stopped' || e.data.status === 'error') setActiveScript(null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!isLoggedIn) return null;

  const activeScriptData = activeScript ? SCRIPTS.find(s => s.id === activeScript) : null;
  const categoryScripts = SCRIPTS.filter(s => s.category === activeCategory);

  // When expanding a combat script, reset config to that script's defaults + user overrides
  const handleExpand = (scriptId: string) => {
    setExpandedScript(expandedScript === scriptId ? null : scriptId);
    // Always reset to this script's defaults when expanding
    const defaults = SCRIPT_DEFAULTS[scriptId] || {};
    setCombatConfig({ ...DEFAULT_COMBAT_CONFIG, ...defaults });
  };

  return (
    <>
      {/* Floating Bot Toggle Button */}
      {!isOpen && (
        <button
          className="bot-toggle"
          onClick={() => setIsOpen(true)}
          title="Open bot panel"
          aria-label="Open bot panel"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* Active Script Badge */}
      {!isOpen && activeScriptData && (
        <div className="bot-active-badge">
          <span className="bot-active-dot" />
          <span className="bot-active-name">{activeScriptData.name}</span>
          <span className="bot-active-time">{formatTime(runtime)}</span>
        </div>
      )}

      {/* Bot Panel */}
      {isOpen && (
        <div className="bot-panel">
          {/* Header */}
          <div className="bot-header">
            <h3 className="bot-title">Scripts</h3>
            {activeScriptData && (
              <div className="bot-running-tag">
                <span className="bot-active-dot" />
                {activeScriptData.name} · {formatTime(runtime)}
              </div>
            )}
            <button className="bot-close-btn" onClick={() => setIsOpen(false)} aria-label="Close bot panel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Category Tabs */}
          <div className="bot-categories">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`bot-cat-tab ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => { setActiveCategory(cat); setExpandedScript(null); }}
              >
                <span className="bot-cat-icon">{CATEGORY_ICONS[cat]}</span>
                <span className="bot-cat-label">{cat}</span>
              </button>
            ))}
          </div>

          {/* Script List */}
          <div className="bot-script-list">
            {categoryScripts.map(script => {
              const isActive = activeScript === script.id;
              const isExpanded = expandedScript === script.id;
              const cfg = script.isCombat ? getCombatConfig(script.id) : null;
              return (
                <div key={script.id} className={`bot-script-card ${isActive ? 'running' : ''} ${isExpanded ? 'expanded' : ''}`}>
                  <div className="bot-script-row">
                    <div className="bot-script-info" onClick={() => script.isCombat && handleExpand(script.id)}>
                      <div className="bot-script-name">
                        {script.name}
                        {script.isCombat && (
                          <span className="bot-config-indicator" title="Click to configure">
                            {isExpanded ? '▲' : '⚙️'}
                          </span>
                        )}
                      </div>
                      <div className="bot-script-desc">{script.description}</div>
                      {script.requiredLevel && (
                        <div className="bot-script-req">Requires level {script.requiredLevel}</div>
                      )}
                      {/* Show active config summary when running */}
                      {isActive && cfg && (
                        <div className="bot-config-summary">
                          Bones: {cfg.buryBones ? 'bury' : 'off'}
                          {cfg.buryBones && cfg.prioritizeBones ? ' (priority)' : ''}
                          {' · '}Eat@{cfg.eatAtHp}HP
                          {' · '}Wander:{cfg.maxWander}
                        </div>
                      )}
                    </div>
                    <button
                      className={`bot-script-btn ${isActive ? 'stop' : 'start'}`}
                      onClick={() => isActive ? stopScript() : startScript(script.id)}
                    >
                      {isActive ? 'Stop' : 'Start'}
                    </button>
                  </div>

                  {/* Combat Config Panel — APOS AIOFighter style */}
                  {script.isCombat && isExpanded && !isActive && (
                    <div className="bot-config-panel">
                      <div className="bot-config-section">
                        <label className="bot-config-toggle">
                          <input
                            type="checkbox"
                            checked={combatConfig.buryBones}
                            onChange={e => setCombatConfig({...combatConfig, buryBones: e.target.checked})}
                          />
                          <span>Bury bones</span>
                          <small className="bot-config-hint">Pick up bones from ground and bury for Prayer XP</small>
                        </label>
                        {combatConfig.buryBones && (
                          <label className="bot-config-toggle bot-config-sub">
                            <input
                              type="checkbox"
                              checked={combatConfig.prioritizeBones}
                              onChange={e => setCombatConfig({...combatConfig, prioritizeBones: e.target.checked})}
                            />
                            <span>Prioritize bones over attacking</span>
                          </label>
                        )}
                      </div>

                      <div className="bot-config-row">
                        <div className="bot-config-field">
                          <label>Eat at HP ≤</label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={combatConfig.eatAtHp}
                            onChange={e => setCombatConfig({...combatConfig, eatAtHp: parseInt(e.target.value) || 10})}
                          />
                        </div>
                        <div className="bot-config-field">
                          <label>Wander radius</label>
                          <input
                            type="number"
                            min={-1}
                            max={50}
                            value={combatConfig.maxWander}
                            onChange={e => setCombatConfig({...combatConfig, maxWander: parseInt(e.target.value) || 20})}
                          />
                        </div>
                      </div>

                      <div className="bot-config-row">
                        <div className="bot-config-field">
                          <label>Combat style</label>
                          <select
                            value={combatConfig.fightMode}
                            onChange={e => setCombatConfig({...combatConfig, fightMode: parseInt(e.target.value)})}
                          >
                            {FIGHT_MODES.map(m => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="bot-config-field">
                          <label>Target level (stop)</label>
                          <input
                            type="number"
                            min={-1}
                            max={99}
                            value={combatConfig.targetLevel}
                            onChange={e => setCombatConfig({...combatConfig, targetLevel: parseInt(e.target.value) || -1})}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Stop bar */}
          {activeScript && (
            <button className="bot-stop-all" onClick={stopScript}>
              Stop Script
            </button>
          )}
        </div>
      )}
    </>
  );
}
