import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { SCRIPTS, type ScriptDef, type ScriptCategory } from './scripts';

// Known NPC drops — auto-populates loot when NPCs are selected
// IDs verified from /ref docs/openrsc-items.md (Aug 8, 2026)
const NPC_DROPS: Record<number, number[]> = {
  3: [133,381],          // Chicken → raw chicken, feathers
  4: [82,87,827,41,40,35,34,36,11,10,10,10,10,10,202,262,143,273], // Goblin L13
  6: [147,504,20],       // Cow → cowhide, raw beef, bones
  8: [502,146],          // Bear → raw bear meat, fur
  11: [10,10,380,10,11,34,31,35,150,104,18,28,41,10], // Man
  19: [503,96],          // Rat → raw rat meat, red key
  21: [34,32,35,10,10,10,237,380,150,18,104,13], // Mugger
  40: [10,10,10,10,10,11,10,104,35,40,34,41,113,704,223,20], // Skeleton L21
  45: [10,10,10,104,169,1,10,10,32,34,41,12,40,10,83,113,46,85,20], // Skeleton L31
  46: [10,10,11,10,28,11,70,10,10,10,33,41,34,31,76,40,10,29,151,20], // Skeleton L25
  49: [502,146],         // Bear → raw bear meat, fur
  52: [380,10,36,35,10,33,11,104,10,10,10,150,70,12,40], // Zombie L19
  57: [10,241,20,250,40,41,41,242,31,10,32,33,34,35,36,31,32,33,34,35,36,40,619,10], // Darkwizard L13
  60: [10,10,10,250,40,41,242,241,31,10,32,33,34,35,36,619,31,32,33,34,35,36,40,46,401], // Darkwizard L25
  61: [10,220,10,10,10,10,193,233,28,3,34,32,40,12,104,72,10,46,40,35,41,38,20], // Giant
  62: [10,827,32,36,273,124,190,34,10,10,10,193,189,186,192], // Goblin L7
  63: [10,10,380,10,11,34,31,35,150,104,18,28,41,10], // Farmer
  64: [10,10,380,10,11,34,31,35,150,104,18,28,41,10], // Thief
  65: [10,10,10,10,28,104,10,10,11,10,33,11,34,31,70,619,41,40,29,151], // Guard
  66: [10,10,10,10,10,171,1,34,41,36,233,40,619,10,189,94,35,46,138,202,137,548,20], // Black Knight
  67: [10,220,10,10,10,10,827,1,63,40,1088,1089,36,41,31,40,32,273,8,72,46,20], // Hobgoblin L32
  68: [10,10,10,104,169,1,10,10,32,34,41,10,40,12,83,113,46,20], // Zombie L32
  76: [10,10,87,10,250,41,10,34,11,40,31,35,12,132,146,300,202,816,193], // Barbarian
  100: [10,10,10,10,28,104,10,10,11,10,33,11,34,31,70,619,41,40,29,151], // Fortress Guard
  102: [10,10,10,169,10,10,40,41,10,36,35,32,188,72,104,169,619,40,137,151,20], // White Knight
  104: [10,10,10,10,171,7,33,34,41,33,33,46,250,68,104,10,128,38,619,10,255,186,155,20], // Moss Giant
  114: [34,190,108,250,619,201,19,133,273,274,275,276,201,98,21,143,243,60,137,137,18,201,132,226], // Imp
  135: [10,10,10,10,10,345,87,580,72,33,40,36,142,40,10,129,234,319,151,46,619,38,32,20], // Ice Giant
  137: [10,609,10,82,10,10,28,41,40,10,11,11,33,34,31,112,10,192,169,40,20], // Pirate L27
  158: [10,40,41,40,46,38,0,827,234,619,604,20], // Ice Warrior
  190: [10,10,10,10,524,250,40,41,36,33,150,233,46,10,10,32,619,250,546,234,593,34,155,20], // Chaos Dwarf
  199: [10,10,10,10,10,10,11,35,104,40,32,219,12,1068,41,34,151,636,278,20], // Dark Warrior
  200: [10,465,28,1047,1046,34,10,10,220,188,34,31,41,32,40,499,20], // Druid
  232: [10,10,10,10,155,83,32,41,33,38,40,94,10,12,188,619,35,40,20], // Bandit
  270: [465,40,10,10,10,33,34,35,33,70,10,469,20], // Chaos Druid
  311: [10,220,10,10,10,10,827,1,63,40,1088,1089,36,41,31,40,32,273,8,72,46,20], // Hobgoblin L48
  323: [10,10,10,169,10,72,10,233,72,619,41,46,20], // Paladin
  344: [10,31,41,10,619,87,31,234,171,132,132,1280,8,31,40,10,226,226,20], // Fire Giant
  358: [10,10,10,250,234,40,41,1044,10,1045,31,32,33,34,35,36,31,32,33,34,35,36,619,40,46], // Necromancer
  523: [827,10,143,143,143,13,1088,40,40,40,20,413], // Jogre
  555: [226,468,31,40,10,10,34,471,220,10,63,40,33,469,220,220,465,20], // Chaos Druid Warrior
  584: [1089,797,10,34,40,41,40,38,34,619,20], // Earth Warrior
  660: [10,10,827,10,10,87,35,34,36,11,10,82,41,40,20], // Goblin L19
  787: [10,46,619,33,38,619,571,563,28,28,241,20], // Shadow Warrior
};

const NPC_NAMES: Record<number, string> = {
  0: 'Unicorn', 1: 'Bob', 2: 'Sheep', 3: 'Chicken', 4: 'Goblin', 5: 'Hans',
  6: 'Cow', 7: 'Cook', 8: 'Bear', 9: 'Priest', 10: 'Urhney', 11: 'Man',
  13: 'Camel', 15: 'Ghost', 19: 'Giant Rat', 21: 'Mugger', 22: 'Lesser Demon',
  23: 'Giant Spider', 24: 'Man (hard)', 25: 'Jonny the Beard', 28: 'Tramp',
  29: 'Rat', 34: 'Spider', 40: 'Skeleton', 41: 'Zombie', 43: 'Giant Bat',
  45: 'Skeleton', 46: 'Skeleton', 47: 'Rat', 50: 'Skeleton', 52: 'Zombie',
  57: 'Dark Wizard', 60: 'Dark Wizard', 61: 'Giant', 62: 'Goblin', 63: 'Farmer',
  64: 'Thief', 65: 'Guard', 67: 'Hobgoblin', 68: 'Zombie', 70: 'Scorpion',
  72: 'Man', 74: 'Giant Spider', 76: 'Barbarian', 79: 'Witch', 81: 'Wizard',
  86: 'Warrior', 89: 'Highwayman', 91: 'Chicken', 93: 'Monk', 94: 'Dwarf',
  95: 'Banker', 99: 'Deadly Red Spider', 100: 'Guard', 104: 'Moss Giant',
  109: 'Greldo', 114: 'Imp', 127: 'Jailguard', 137: 'Pirate', 139: 'Monk of Zamorak',
  140: 'Monk of Zamorak', 151: 'General Wartface', 152: 'General Bentnoze',
  153: 'Goblin', 154: 'Goblin', 159: 'Warrior', 177: 'Rat', 178: 'Ghost',
  179: 'Skeleton', 180: 'Zombie', 188: 'Bear', 191: 'Dwarf', 192: 'Wormbrain',
  195: 'Skeleton', 196: 'Dragon', 199: 'Dark Warrior',
};

// ═══════════════════════════════════════════════════════════════
// Category display config: icon + tab label
// ═══════════════════════════════════════════════════════════════
const CATEGORY_CONFIG: Record<ScriptCategory, { icon: string; label: string }> = {
  Combat:         { icon: '⚔️', label: 'Combat' },
  Magic:          { icon: '🔮', label: 'Magic' },
  Prayer:         { icon: '✨', label: 'Prayer' },
  Skilling:       { icon: '⛏️', label: 'Skilling' },
  Gathering:      { icon: '🌿', label: 'Gathering' },
  Money:          { icon: '💰', label: 'Money' },
  Questing:       { icon: '📜', label: 'Quests' },
  Misc:           { icon: '📦', label: 'Misc' },
  Uncategorized:  { icon: '❓', label: 'Other' },
};

const TAB_CATEGORIES: ScriptCategory[] = ['Combat', 'Skilling', 'Gathering', 'Magic', 'Money'];

// ═══════════════════════════════════════════════════════════════
// Script config type — passed to onStartScript as script.config
// ═══════════════════════════════════════════════════════════════
export interface ScriptConfig {
  // — Combat —
  npcIds?: string;
  lootIds?: string;
  eatAtHp?: string;
  wander?: string;
  fightMode?: string;
  targetLevel?: string;
  buryBones?: boolean;
  prioritizeBones?: boolean;
  openDoors?: boolean;
  useMagic?: boolean;
  combatSpell?: string;
  useRanging?: boolean;
  arrowType?: string;
  switchId?: string;
  // — Mining —
  rocks?: Record<string, boolean>;
  mineNoBank?: boolean;
  campLocation?: string;
  mineBankLocation?: string;
  customCoords?: boolean;
  customX?: string;
  customY?: string;
  // — Cooking —
  foodType?: string;
  dropBurnt?: boolean;
  gauntlets?: boolean;
  // — Woodcutting —
  treeType?: string;
  wcBank?: boolean;
  bankDestination?: string;
  // — Magic —
  magicSpell?: string;
  itemId?: string;
  barType?: string;
  jewelryType?: string;
  talismanId?: string;
  // — Thieving —
  thieveTarget?: string;
  thieveFightMode?: string;
  thieveEatHp?: string;
  thieveBank?: string;
  foodWithdraw?: string;
  // — Smithing —
  smithBarType?: string;
  itemCategory?: string;
  itemSubType?: string;
  specificItem?: string;
  quantity?: string;
  // — Fletching —
  bowType?: string;
  // — Bury Bones —
  targetPrayerLevel?: string;
}

type ConfigType = 'combat' | 'mining' | 'cooking' | 'woodcutting' | 'magic' | 'thieving' | 'smithing' | 'fletching' | 'bones';

// ═══════════════════════════════════════════════════════════════
// Option lists
// ═══════════════════════════════════════════════════════════════
const FIGHT_MODES = ['Controlled', 'Accurate', 'Aggressive', 'Defensive'];

const COMBAT_SPELLS = [
  'Wind Strike', 'Water Strike', 'Earth Strike', 'Fire Strike',
  'Wind Bolt', 'Water Bolt', 'Earth Bolt', 'Fire Bolt',
  'Crumble Undead', 'Wind Blast', 'Water Blast', 'Earth Blast',
  'Fire Blast', 'Iban Blast', 'Magic Dart', 'Stun', 'Charge',
  'Confuse', 'Weaken', 'Curse', 'Vulnerability', 'Enfeeble',
];

const ARROW_TYPES = [
  'Bronze Arrow', 'Iron Arrow', 'Steel Arrow', 'Mithril Arrow',
  'Adamantite Arrow', 'Runite Arrow',
  'Bronze Arrow (p)', 'Iron Arrow (p)', 'Steel Arrow (p)',
  'Mithril Arrow (p)', 'Adamantite Arrow (p)', 'Runite Arrow (p)',
];

const ROCK_TYPES = ['Copper', 'Tin', 'Iron', 'Coal', 'Mithril', 'Adamantite', 'Runite'];

const MINING_CAMPS = [
  'Al-Kharid', 'Dwarven Mine', 'Edgeville Dungeon', 'Mining Guild',
  'Rimmington', 'Varrock South-East', 'Varrock South-West',
  'Falador', 'Barbarian Village', 'Wilderness',
];

const BANK_LOCATIONS = [
  'Draynor', 'Varrock West', 'Varrock East', 'Edgeville',
  'Falador East', 'Falador West', 'Seers',
  'Ardougne North', 'Ardougne South', 'Yanille',
  'Al-Kharid', 'Catherby',
];

const FOOD_TYPES = [
  'Chicken', 'Shrimp', 'Anchovies', 'Sardine', 'Salmon', 'Trout',
  'Herring', 'Pike', 'Cod', 'Mackerel', 'Tuna', 'Lobster',
  'Swordfish', 'Bass', 'Shark', 'Sea Turtle', 'Manta Ray',
];

const TREE_TYPES = ['Normal', 'Oak', 'Willow', 'Maple', 'Yew', 'Magic'];

const WC_BANKS = [
  'Draynor', 'Varrock West', 'Varrock East', 'Edgeville',
  'Falador East', 'Falador West', 'Seers',
  'Ardougne North', 'Ardougne South', 'Yanille',
];

const MAGIC_SPELLS = [
  'High Alchemy', 'Superheat Item', 'Low Alchemy',
  'Enchant Lvl 1 Amulet', 'Enchant Lvl 2 Amulet', 'Enchant Lvl 3 Amulet',
  'Enchant Lvl 4 Amulet', 'Enchant Lvl 5 Amulet',
  'Varrock Teleport', 'Lumbridge Teleport', 'Falador Teleport',
  'Camelot Teleport', 'Ardougne Teleport', 'Watchtower Teleport',
  'Charge', 'Curse',
];

const BAR_TYPES = ['Bronze', 'Iron', 'Steel', 'Mithril', 'Adamantite', 'Runite'];
const JEWELRY_TYPES = ['Ring', 'Amulet', 'Necklace'];

const THIEVE_TARGETS = [
  'Man', 'Farmer', 'Warrior', 'Workman', 'Rogue',
  'Guard (Ardougne)', 'Guard (Varrock)', 'Knight', 'Watchman',
  'Paladin', 'Gnome', 'Hero',
  'All Ardougne Stalls', 'Tea Stall', 'Bakers Stall', 'Silk Stall',
  'Fur Stall', 'Silver Stall', 'Spice Stall', 'Gem Stall',
  'Nature Rune Chest', '50 Coin Chest', 'Hemenster Chest',
];

const SMITH_CATEGORIES = ['Weapon', 'Armour', 'Missile Heads'];
const SMITH_SUBTYPES: Record<string, string[]> = {
  'Weapon':       ['Dagger', 'Throwing Knife', 'Sword', 'Axe', 'Mace'],
  'Armour':       ['Medium Helmet', 'Large Helmet', 'Square Shield', 'Kite Shield', 'Chain Body', 'Chain Legs', 'Plate Body', 'Plate Legs', 'Plate Skirt'],
  'Missile Heads': ['Arrowheads'],
};
const SMITH_SPECIFIC: Record<string, string[]> = {
  'Dagger': ['Dagger'],
  'Throwing Knife': ['Throwing Knife'],
  'Sword': ['Short Sword', 'Long Sword', 'Scimitar', '2h Sword'],
  'Axe': ['Hatchet', 'Battle Axe'],
  'Mace': ['Mace'],
  'Medium Helmet': ['Medium Helmet'],
  'Large Helmet': ['Large Helmet'],
  'Square Shield': ['Square Shield'],
  'Kite Shield': ['Kite Shield'],
  'Chain Body': ['Chain Body'],
  'Chain Legs': ['Chain Legs'],
  'Plate Body': ['Plate Body'],
  'Plate Legs': ['Plate Legs'],
  'Plate Skirt': ['Plate Skirt'],
  'Arrowheads': ['Arrowheads'],
};
const SMITH_QUANTITIES = ['1', '5', '10', 'all'];

const BOW_TYPES = [
  'Arrow Shafts', 'Shortbow', 'Longbow',
  'Oak Shortbow', 'Oak Longbow', 'Willow Shortbow', 'Willow Longbow',
  'Maple Shortbow', 'Maple Longbow', 'Yew Shortbow', 'Yew Longbow',
  'Magic Shortbow', 'Magic Longbow',
];

// ═══════════════════════════════════════════════════════════════
// Config type detection
// ═══════════════════════════════════════════════════════════════
const MINING_IDS    = new Set(['AIOMiner', 'MiningGuild', 'AKMiner', 'K_HobsMiner', 'K_EdgeDungeonMine', 'K_SkelliCoal', 'CraftingGuildMining', 'EssenceMiner']);
const COOKING_IDS   = new Set(['AIOCooker', 'CatherbyFishFarm', 'ChickenMunch0r']);
const WC_IDS        = new Set(['Woodcutting', 'K_ArdyYewTree', 'K_GnomeMagicTree', 'K_SeersMagicTree']);
const MAGIC_IDS     = new Set(['AIOMagic', 'AlchWheat', 'K_TeleWines', 'K_NoBank_Superheat']);
const THIEVING_IDS  = new Set(['AIOThiever', 'Man']);
const SMITHING_IDS  = new Set(['SmithingVarrock', 'SmithGearSet', 'CeikPlates', 'K_FastChainLinks', 'AIOSmelter']);
const FLETCHING_IDS = new Set(['PowerFletcha', 'FletchnBankBows', 'ArrowMaker']);
const BONE_IDS      = new Set(['BuryBone', 'K_BoneyardBury']);

function getConfigType(script: ScriptDef): ConfigType | null {
  if (script.categories.includes('Combat')) return 'combat';
  if (MINING_IDS.has(script.id))    return 'mining';
  if (COOKING_IDS.has(script.id))   return 'cooking';
  if (WC_IDS.has(script.id))        return 'woodcutting';
  if (MAGIC_IDS.has(script.id))     return 'magic';
  if (THIEVING_IDS.has(script.id))  return 'thieving';
  if (SMITHING_IDS.has(script.id))  return 'smithing';
  if (FLETCHING_IDS.has(script.id)) return 'fletching';
  if (BONE_IDS.has(script.id))      return 'bones';
  return null;
}

function defaultConfig(ct: ConfigType): ScriptConfig {
  switch (ct) {
    case 'combat':
      return { npcIds: '', lootIds: '-1', eatAtHp: '', wander: '20', fightMode: 'Accurate', targetLevel: '-1', buryBones: false, prioritizeBones: false, openDoors: false, useMagic: false, combatSpell: COMBAT_SPELLS[0], useRanging: false, arrowType: ARROW_TYPES[0], switchId: '81' };
    case 'mining':
      return { rocks: { Copper: true, Tin: true, Iron: false, Coal: false, Mithril: false, Adamantite: false, Runite: false }, mineNoBank: false, campLocation: MINING_CAMPS[0], mineBankLocation: BANK_LOCATIONS[0], customCoords: false, customX: '', customY: '' };
    case 'cooking':
      return { foodType: FOOD_TYPES[0], dropBurnt: false, gauntlets: false };
    case 'woodcutting':
      return { treeType: TREE_TYPES[0], wcBank: true, bankDestination: WC_BANKS[0] };
    case 'magic':
      return { magicSpell: MAGIC_SPELLS[0], itemId: '118', barType: BAR_TYPES[0], jewelryType: JEWELRY_TYPES[0], talismanId: '1300' };
    case 'thieving':
      return { thieveTarget: THIEVE_TARGETS[0], thieveFightMode: FIGHT_MODES[0], thieveEatHp: '', thieveBank: 'None', foodWithdraw: '0' };
    case 'smithing':
      return { smithBarType: BAR_TYPES[0], itemCategory: SMITH_CATEGORIES[0], itemSubType: SMITH_SUBTYPES[SMITH_CATEGORIES[0]][0], specificItem: 'Dagger', quantity: 'all' };
    case 'fletching':
      return { bowType: BOW_TYPES[0] };
    case 'bones':
      return { targetPrayerLevel: '99' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Shared styling
// ═══════════════════════════════════════════════════════════════
const S_LABEL   = { fontSize: 9, color: '#888', display: 'block', marginBottom: 2 } as const;
const S_INPUT   = { width: '100%', boxSizing: 'border-box' as const, padding: '3px 5px', background: 'rgba(0,0,0,0.5)', border: '1px solid #333', color: '#ccc', fontSize: 10, fontFamily: 'monospace', outline: 'none', borderRadius: 3 };
const S_SELECT  = { ...S_INPUT, cursor: 'pointer' };
const S_CHECK   = { accentColor: '#14F195', cursor: 'pointer' } as const;
const S_PANEL   = { marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' } as const;
const S_SECTION = { fontSize: 8.5, color: '#14F195', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, margin: '6px 0 3px' } as const;

// ── Tiny form helpers ──────────────────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <label style={S_LABEL}>{label}</label>
      {children}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#aaa', cursor: 'pointer', marginBottom: 3 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={S_CHECK} />
      {label}
    </label>
  );
}

function ToggleRow({ label, checked, onChange, accent }: { label: string; checked: boolean; onChange: (v: boolean) => void; accent?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: accent ? '#14F195' : '#ccc', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={S_CHECK} />
      {label}
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════
// Per-category config renderers
// ═══════════════════════════════════════════════════════════════
type CfgProps = { cfg: ScriptConfig; set: (p: Partial<ScriptConfig>) => void };

function CombatConfig({ cfg, set }: CfgProps) {
  const [nearbyNpcs, setNearbyNpcs] = useState<{id: number, name: string, combat: number}[]>([]);
  const [selectedNpcs, setSelectedNpcs] = useState<Set<number>>(new Set());

  // Fetch nearby NPCs from the game iframe
  const fetchNearbyNpcs = useCallback(() => {
    const iframe = document.querySelector('iframe[title*="Game"]') as HTMLIFrameElement;
    const mc = (iframe?.contentWindow as any)?.__r2h_mc;
    if (!mc?.b0?.data) { setNearbyNpcs([]); return; }
    
    // Collect unique NPC types
    const npcMap: Record<number, number> = {}; // npcId → combat level (if available)
    for (let i = 0; i < mc.b0.data.length; i++) {
      const n = mc.b0.data[i];
      if (!n) continue;
      const npcId = n.bV;
      if (npcId && npcId > 0) npcMap[npcId] = npcMap[npcId] || npcId;
    }
    
    // Map to display format using the NPC_NAMES lookup
    const npcs = Object.keys(npcMap).map(Number).map(id => ({
      id,
      name: NPC_NAMES[id] || `NPC ${id}`,
      combat: 0,
    })).sort((a, b) => a.name.localeCompare(b.name));
    
    setNearbyNpcs(npcs);
  }, []);

  // Toggle an NPC selection — also auto-update loot table with known drops
  const toggleNpc = (id: number) => {
    const next = new Set(selectedNpcs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedNpcs(next);
    const idStr = Array.from(next).sort((a, b) => a - b).join(',');
    set({ npcIds: idStr });
    // Auto-populate loot based on known drops of selected NPCs
    const drops = new Set<number>();
    next.forEach(npcId => {
      (NPC_DROPS[npcId] || []).forEach(d => drops.add(d));
    });
    const lootStr = drops.size > 0 ? Array.from(drops).sort((a, b) => a - b).join(',') : '-1';
    set({ lootIds: lootStr });
  };

  // Sync selectedNpcs from the cfg.npcIds string
  useEffect(() => {
    if (cfg.npcIds && cfg.npcIds.trim()) {
      const ids = cfg.npcIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
      setSelectedNpcs(new Set(ids));
    } else {
      setSelectedNpcs(new Set());
    }
  }, [cfg.npcIds]);

  return (
    <div style={S_PANEL}>
      <div style={S_SECTION}>Targets</div>
      
      {/* NPC Selection Table — matches APOS AIOFighter UI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: '#888' }}>Nearby NPCs ({nearbyNpcs.length})</span>
        <button onClick={fetchNearbyNpcs} style={{ background: 'rgba(20,241,149,0.1)', border: '1px solid #333', color: '#14F195', fontSize: 8, cursor: 'pointer', padding: '2px 6px', borderRadius: 3 }}>↻ Scan</button>
      </div>
      {nearbyNpcs.length > 0 ? (
        <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #222', borderRadius: 3, marginBottom: 4 }}>
          {nearbyNpcs.map(npc => (
            <label key={npc.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 6px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <input
                type="checkbox"
                checked={selectedNpcs.has(npc.id)}
                onChange={() => toggleNpc(npc.id)}
                style={{ width: 12, height: 12 }}
              />
              <span style={{ fontSize: 10, color: selectedNpcs.has(npc.id) ? '#14F195' : '#aaa', flex: 1 }}>{npc.name}</span>
              <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>{npc.id}</span>
            </label>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 9, color: '#555', padding: '4px 0', fontStyle: 'italic' }}>Click "Scan" to detect nearby NPCs</div>
      )}
      <Field label="NPC IDs (manual override)">
        <input style={S_INPUT} value={cfg.npcIds ?? ''} onChange={e => set({ npcIds: e.target.value })} placeholder="auto-detect if empty" />
      </Field>

      <div style={S_SECTION}>Loot (auto-filled from NPC selection)</div>
      <Field label="Loot IDs (comma-sep)">
        <input style={S_INPUT} value={cfg.lootIds ?? ''} onChange={e => set({ lootIds: e.target.value })} placeholder="-1 for none" />
      </Field>

      <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
        <div style={{ flex: 1 }}>
          <Field label="Eat at HP">
            <input style={S_INPUT} value={cfg.eatAtHp ?? ''} onChange={e => set({ eatAtHp: e.target.value })} placeholder="auto (half HP)" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Wander (-1 off)">
            <input style={S_INPUT} value={cfg.wander ?? ''} onChange={e => set({ wander: e.target.value })} />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <div style={{ flex: 1 }}>
          <Field label="Fight Mode">
            <select style={S_SELECT} value={cfg.fightMode} onChange={e => set({ fightMode: e.target.value })}>
              {FIGHT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Target Level">
            <input style={S_INPUT} value={cfg.targetLevel ?? ''} onChange={e => set({ targetLevel: e.target.value })} placeholder="-1" />
          </Field>
        </div>
      </div>

      <div style={S_SECTION}>Options</div>
      <CheckRow label="Open doors / gates"     checked={cfg.openDoors ?? false}       onChange={v => set({ openDoors: v })} />
      <CheckRow label="Loot & bury bones"      checked={cfg.buryBones ?? false}       onChange={v => set({ buryBones: v, prioritizeBones: v ? cfg.prioritizeBones : false })} />
      {cfg.buryBones && (
        <CheckRow label="Prioritize bones over attacking" checked={cfg.prioritizeBones ?? false} onChange={v => set({ prioritizeBones: v })} />
      )}

      <div style={S_SECTION}>Ranged</div>
      <ToggleRow label="Ranging mode" checked={cfg.useRanging ?? false} onChange={v => set({ useRanging: v, useMagic: v ? false : cfg.useMagic })} accent={cfg.useRanging} />
      {cfg.useRanging && (
        <div style={{ marginLeft: 4, borderLeft: '2px solid rgba(20,241,149,0.2)', paddingLeft: 6 }}>
          <Field label="Arrow Type">
            <select style={S_SELECT} value={cfg.arrowType} onChange={e => set({ arrowType: e.target.value })}>
              {ARROW_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Melee switch weapon ID">
            <input style={S_INPUT} value={cfg.switchId ?? ''} onChange={e => set({ switchId: e.target.value })} />
          </Field>
        </div>
      )}

      <div style={S_SECTION}>Magic</div>
      <ToggleRow label="Magic mode" checked={cfg.useMagic ?? false} onChange={v => set({ useMagic: v, useRanging: v ? false : cfg.useRanging })} accent={cfg.useMagic} />
      {cfg.useMagic && (
        <div style={{ marginLeft: 4, borderLeft: '2px solid rgba(20,241,149,0.2)', paddingLeft: 6 }}>
          <Field label="Spell">
            <select style={S_SELECT} value={cfg.combatSpell} onChange={e => set({ combatSpell: e.target.value })}>
              {COMBAT_SPELLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

function MiningConfig({ cfg, set }: CfgProps) {
  const rocks = cfg.rocks ?? {};
  return (
    <div style={S_PANEL}>
      <div style={S_SECTION}>Rocks to Mine</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
        {ROCK_TYPES.map(r => (
          <CheckRow key={r} label={r} checked={rocks[r] ?? false} onChange={v => set({ rocks: { ...rocks, [r]: v } })} />
        ))}
      </div>

      <div style={S_SECTION}>Location</div>
      <Field label="Mining Camp">
        <select style={S_SELECT} value={cfg.campLocation} onChange={e => set({ campLocation: e.target.value })}>
          {MINING_CAMPS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <CheckRow label="Don't bank (power-mine)" checked={cfg.mineNoBank ?? false} onChange={v => set({ mineNoBank: v })} />
      {!cfg.mineNoBank && (
        <Field label="Bank Location">
          <select style={S_SELECT} value={cfg.mineBankLocation} onChange={e => set({ mineBankLocation: e.target.value })}>
            {BANK_LOCATIONS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      )}

      <div style={S_SECTION}>Custom Coords</div>
      <CheckRow label="Use custom coordinates" checked={cfg.customCoords ?? false} onChange={v => set({ customCoords: v })} />
      {cfg.customCoords && (
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ flex: 1 }}>
            <Field label="X"><input style={S_INPUT} value={cfg.customX ?? ''} onChange={e => set({ customX: e.target.value })} /></Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Y"><input style={S_INPUT} value={cfg.customY ?? ''} onChange={e => set({ customY: e.target.value })} /></Field>
          </div>
        </div>
      )}
    </div>
  );
}

function CookingConfig({ cfg, set }: CfgProps) {
  return (
    <div style={S_PANEL}>
      <Field label="Food Type">
        <select style={S_SELECT} value={cfg.foodType} onChange={e => set({ foodType: e.target.value })}>
          {FOOD_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <CheckRow label="Drop burnt food"      checked={cfg.dropBurnt ?? false} onChange={v => set({ dropBurnt: v })} />
      <CheckRow label="Cooking gauntlets"    checked={cfg.gauntlets ?? false} onChange={v => set({ gauntlets: v })} />
    </div>
  );
}

function WoodcuttingConfig({ cfg, set }: CfgProps) {
  return (
    <div style={S_PANEL}>
      <Field label="Tree Type">
        <select style={S_SELECT} value={cfg.treeType} onChange={e => set({ treeType: e.target.value })}>
          {TREE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <ToggleRow label="Bank logs" checked={cfg.wcBank ?? true} onChange={v => set({ wcBank: v })} />
      {cfg.wcBank && (
        <Field label="Bank Destination">
          <select style={S_SELECT} value={cfg.bankDestination} onChange={e => set({ bankDestination: e.target.value })}>
            {WC_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

function MagicConfig({ cfg, set }: CfgProps) {
  const spell = cfg.magicSpell ?? MAGIC_SPELLS[0];
  const isAlch     = spell.includes('Alchemy');
  const isSuperheat = spell === 'Superheat Item';
  const isEnchant  = spell.startsWith('Enchant');
  const isCurse    = spell === 'Curse';
  return (
    <div style={S_PANEL}>
      <Field label="Spell">
        <select style={S_SELECT} value={spell} onChange={e => set({ magicSpell: e.target.value })}>
          {MAGIC_SPELLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      {isAlch && (
        <Field label="Item ID (to alch)">
          <input style={S_INPUT} value={cfg.itemId ?? ''} onChange={e => set({ itemId: e.target.value })} />
        </Field>
      )}
      {isSuperheat && (
        <Field label="Bar Type (ore combo)">
          <select style={S_SELECT} value={cfg.barType} onChange={e => set({ barType: e.target.value })}>
            {BAR_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      )}
      {isEnchant && (
        <Field label="Jewelry Type">
          <select style={S_SELECT} value={cfg.jewelryType} onChange={e => set({ jewelryType: e.target.value })}>
            {JEWELRY_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </Field>
      )}
      {isCurse && (
        <Field label="Talisman ID (curse target)">
          <input style={S_INPUT} value={cfg.talismanId ?? ''} onChange={e => set({ talismanId: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

function ThievingConfig({ cfg, set }: CfgProps) {
  return (
    <div style={S_PANEL}>
      <Field label="Thieving Target">
        <select style={S_SELECT} value={cfg.thieveTarget} onChange={e => set({ thieveTarget: e.target.value })}>
          {THIEVE_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 5 }}>
        <div style={{ flex: 1 }}>
          <Field label="Fight Mode">
            <select style={S_SELECT} value={cfg.thieveFightMode} onChange={e => set({ thieveFightMode: e.target.value })}>
              {FIGHT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Eat at HP">
            <input style={S_INPUT} value={cfg.thieveEatHp ?? ''} onChange={e => set({ thieveEatHp: e.target.value })} placeholder="auto" />
          </Field>
        </div>
      </div>
      <Field label="Banking">
        <select style={S_SELECT} value={cfg.thieveBank} onChange={e => set({ thieveBank: e.target.value })}>
          <option value="None">None</option>
          {BANK_LOCATIONS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      {cfg.thieveBank !== 'None' && (
        <Field label="Food Withdraw Amount">
          <input style={S_INPUT} value={cfg.foodWithdraw ?? ''} onChange={e => set({ foodWithdraw: e.target.value })} placeholder="0" />
        </Field>
      )}
    </div>
  );
}

function SmithingConfig({ cfg, set }: CfgProps) {
  const cat = cfg.itemCategory ?? SMITH_CATEGORIES[0];
  const subtypes = SMITH_SUBTYPES[cat] ?? [];
  const sub = cfg.itemSubType ?? subtypes[0] ?? '';
  const specifics = SMITH_SPECIFIC[sub] ?? [sub];
  return (
    <div style={S_PANEL}>
      <Field label="Bar Type">
        <select style={S_SELECT} value={cfg.smithBarType} onChange={e => set({ smithBarType: e.target.value })}>
          {BAR_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field label="Item Category">
        <select style={S_SELECT} value={cat} onChange={e => {
          const ns = SMITH_SUBTYPES[e.target.value] ?? [];
          const nsub = ns[0] ?? '';
          set({ itemCategory: e.target.value, itemSubType: nsub, specificItem: (SMITH_SPECIFIC[nsub] ?? [nsub])[0] });
        }}>
          {SMITH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label={`${cat} Type`}>
        <select style={S_SELECT} value={sub} onChange={e => {
          const nsub = e.target.value;
          set({ itemSubType: nsub, specificItem: (SMITH_SPECIFIC[nsub] ?? [nsub])[0] });
        }}>
          {subtypes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Specific Item">
        <select style={S_SELECT} value={cfg.specificItem} onChange={e => set({ specificItem: e.target.value })}>
          {specifics.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Quantity">
        <select style={S_SELECT} value={cfg.quantity} onChange={e => set({ quantity: e.target.value })}>
          {SMITH_QUANTITIES.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </Field>
    </div>
  );
}

function FletchingConfig({ cfg, set }: CfgProps) {
  return (
    <div style={S_PANEL}>
      <Field label="Bow Type">
        <select style={S_SELECT} value={cfg.bowType} onChange={e => set({ bowType: e.target.value })}>
          {BOW_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
    </div>
  );
}

function BonesConfig({ cfg, set }: CfgProps) {
  return (
    <div style={S_PANEL}>
      <Field label="Target Prayer Level">
        <input style={S_INPUT} value={cfg.targetPrayerLevel ?? ''} onChange={e => set({ targetPrayerLevel: e.target.value })} placeholder="99" />
      </Field>
    </div>
  );
}

function ConfigPanel({ type, cfg, set }: { type: ConfigType; cfg: ScriptConfig; set: (p: Partial<ScriptConfig>) => void }) {
  switch (type) {
    case 'combat':      return <CombatConfig cfg={cfg} set={set} />;
    case 'mining':      return <MiningConfig cfg={cfg} set={set} />;
    case 'cooking':     return <CookingConfig cfg={cfg} set={set} />;
    case 'woodcutting': return <WoodcuttingConfig cfg={cfg} set={set} />;
    case 'magic':       return <MagicConfig cfg={cfg} set={set} />;
    case 'thieving':    return <ThievingConfig cfg={cfg} set={set} />;
    case 'smithing':    return <SmithingConfig cfg={cfg} set={set} />;
    case 'fletching':   return <FletchingConfig cfg={cfg} set={set} />;
    case 'bones':       return <BonesConfig cfg={cfg} set={set} />;
  }
}

// ═══════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════
interface ScriptPanelProps {
  open: boolean;
  onStartScript?: (script: ScriptDef) => void;
  onStopScript?: () => void;
  activeScriptId?: string | null;
}

export default function ScriptPanel({ open, onStartScript, onStopScript, activeScriptId }: ScriptPanelProps) {
  const [activeTab, setActiveTab] = useState<ScriptCategory>('Combat');
  const [activeId, setActiveId] = useState<string | null>(activeScriptId ?? null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, ScriptConfig>>({});

  useEffect(() => { setActiveId(activeScriptId ?? null); }, [activeScriptId]);

  const updateConfig = useCallback((scriptId: string, patch: Partial<ScriptConfig>) => {
    setConfigs(prev => ({ ...prev, [scriptId]: { ...(prev[scriptId] ?? {}), ...patch } }));
  }, []);

  const getEffectiveConfig = useCallback((script: ScriptDef): ScriptConfig => {
    const ct = getConfigType(script);
    if (!ct) return {};
    return { ...defaultConfig(ct), ...(configs[script.id] ?? {}) };
  }, [configs]);

  const handleToggle = useCallback((script: ScriptDef) => {
    if (activeId === script.id) {
      setActiveId(null);
      onStopScript?.();
    } else {
      setActiveId(script.id);
      onStartScript?.({ ...script, config: getEffectiveConfig(script) } as ScriptDef);
    }
  }, [activeId, onStartScript, onStopScript, getEffectiveConfig]);

  // Filter scripts: by tab category OR search query
  const visibleScripts = useMemo(() => {
    let result = SCRIPTS;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.fileName.toLowerCase().includes(q)
      );
    } else {
      result = result.filter(s => s.categories.includes(activeTab));
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTab, search]);

  if (!open) return null;

  // Collapsed state: small toggle button
  if (collapsed) {
    return (
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 100 }}>
        <button onClick={() => setCollapsed(false)} style={{
          background: 'rgba(15,15,15,0.96)', border: '1px solid #2a2a2a',
          color: '#14F195', fontSize: 16, padding: '6px 10px', borderRadius: 6,
          cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700,
          backdropFilter: 'blur(6px)',
        }}>
          ⚡ Scripts
        </button>
      </div>
    );
  }

  const activeScript = activeId ? SCRIPTS.find(s => s.id === activeId) : null;

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width: 240, height: '100%',
      background: 'rgba(15,15,15,0.96)', borderLeft: '1px solid #2a2a2a',
      display: 'flex', flexDirection: 'column', zIndex: 100,
      fontFamily: 'monospace', color: '#e0e0e0', overflow: 'hidden',
      backdropFilter: 'blur(6px)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px', borderBottom: '1px solid #222',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#14F195', letterSpacing: 0.5 }}>⚡ SCRIPTS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeScript && (
            <span style={{ fontSize: 10, color: '#ff0', background: 'rgba(255,255,0,0.1)', padding: '2px 6px', borderRadius: 3 }}>● RUNNING</span>
          )}
          <button onClick={() => setCollapsed(true)} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
            color: '#888', fontSize: 8, cursor: 'pointer', fontFamily: 'monospace',
            padding: '2px 8px', borderRadius: 3, fontWeight: 700,
          }} title="Collapse panel">✕ Close</button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search scripts..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '7px 10px',
          background: 'rgba(0,0,0,0.4)', border: '1px solid #222', borderBottom: '1px solid #2a2a2a',
          color: '#ccc', fontSize: 11, fontFamily: 'monospace', outline: 'none',
        }}
      />

      {/* Category tabs (hidden during search) */}
      {!search.trim() && (
        <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #222' }}>
          {TAB_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveTab(cat)} style={{
              flex: '1 0 auto', minWidth: '33%', padding: '6px 0',
              background: activeTab === cat ? 'rgba(20,241,149,0.08)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === cat ? '2px solid #14F195' : '2px solid transparent',
              color: activeTab === cat ? '#14F195' : '#555',
              fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace',
            }}>
              {CATEGORY_CONFIG[cat].icon} {CATEGORY_CONFIG[cat].label}
            </button>
          ))}
        </div>
      )}

      {/* Active script banner */}
      {activeScript && (
        <div style={{
          padding: '8px 12px', background: 'rgba(255,255,0,0.05)',
          borderBottom: '1px solid rgba(255,255,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#ff0', fontWeight: 600 }}>{activeScript.name}</div>
            <div style={{ fontSize: 9, color: '#888' }}>by {activeScript.author}</div>
          </div>
          <button onClick={() => handleToggle(activeScript)} style={{
            background: '#ff3333', border: 'none', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'monospace',
          }}>STOP</button>
        </div>
      )}

      {/* Script list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {visibleScripts.map(script => {
          const isActive = activeId === script.id;
          const configType = getConfigType(script);
          const hasConfig = configType !== null;
          const isExpanded = expandedId === script.id;
          const cfg = getEffectiveConfig(script);
          return (
            <div key={script.id} style={{
              padding: '8px 10px', marginBottom: 3,
              background: isActive ? 'rgba(20,241,149,0.1)' : 'rgba(255,255,255,0.02)',
              border: isActive ? '1px solid rgba(20,241,149,0.4)' : '1px solid transparent',
              borderRadius: 5,
            }}>
              {/* Clickable row (start/stop) */}
              <div
                onClick={() => handleToggle(script)}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {hasConfig && (
                    <button
                      onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : script.id); }}
                      title="Toggle settings"
                      style={{
                        background: isExpanded ? 'rgba(20,241,149,0.15)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid ' + (isExpanded ? 'rgba(20,241,149,0.4)' : '#333'),
                        color: isExpanded ? '#14F195' : '#888',
                        fontSize: 8, cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
                        fontFamily: 'monospace', flexShrink: 0, borderRadius: 3, fontWeight: 700,
                      }}
                    >
                      {isExpanded ? '▲ Hide' : '⚙ Settings'}
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#14F195' : '#ddd' }}>{script.name}</div>
                    <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>
                      {script.categories.map(c => CATEGORY_CONFIG[c]?.icon).join(' ')} by {script.author}
                    </div>
                  </div>
                  {isActive
                    ? <span style={{ color: '#14F195', fontSize: 12 }}>●</span>
                    : <span style={{ color: '#333', fontSize: 12 }}>▶</span>}
                </div>
                <div style={{ fontSize: 9.5, color: '#777', marginTop: 5, lineHeight: 1.35 }}>{script.description}</div>
              </div>

              {/* Expanded config panel */}
              {hasConfig && isExpanded && (
                <ConfigPanel type={configType} cfg={cfg} set={p => updateConfig(script.id, p)} />
              )}
            </div>
          );
        })}
        {visibleScripts.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#555', fontSize: 11 }}>No scripts found.</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #222', fontSize: 8.5, color: '#444', textAlign: 'center' }}>
        {SCRIPTS.length} scripts from APOS/IdleRSC
      </div>
    </div>
  );
}
