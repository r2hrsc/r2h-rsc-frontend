// Auto-generated from IdleRSC/APOS script library
// Source: /home/claw/Documents/AI Tools/R2HRSC/idlersc-reference/app/src/main/java/scripting/
// 123 scripts extracted from ScriptInfo metadata in Java files.
// Do NOT manually edit — regenerate from the source scripts.

export type ScriptCategory =
  | 'Combat' | 'Magic' | 'Prayer' | 'Skilling' | 'Gathering'
  | 'Money' | 'Questing' | 'Misc' | 'Uncategorized';

export interface ScriptDef {
  id: string;
  name: string;        // Display name from ScriptInfo
  author: string;      // Author from ScriptInfo
  description: string;
  categories: ScriptCategory[];
  fileName: string;    // Java class name (maps to actual script file)
  config?: any; // runtime config from ScriptPanel UI
}

export const SCRIPTS: ScriptDef[] = [
  // ═══ COMBAT ═══
  { id: 'AIOFighter', name: 'AIO Fighter', author: 'Dvorak, Seatta', description: 'All-in-one combat fighter with GUI — attack any NPC, loot, eat, bury bones, alch. Supports melee/ranged/magic/prayer.', categories: ['Combat', 'Magic', 'Prayer'], fileName: 'AIOFighter' },
  { id: 'ABC_KBDKiller', name: 'KBD Killer', author: 'abcde', description: 'A King Black Dragon fighting script.', categories: ['Combat'], fileName: 'ABC_KBDKiller' },
  { id: 'Monkz', name: 'Monks', author: 'Dvorak', description: 'Attacks monks and heals using monks.', categories: ['Combat', 'Prayer'], fileName: 'Monkz' },
  { id: 'MonkOfZamorak', name: 'Monk of Zamorak', author: 'Nugs', description: 'Fights Monks of Zamorak using TALK instead of ATTACK to avoid stat curse.', categories: ['Combat', 'Prayer'], fileName: 'MonkOfZamorak' },
  { id: 'K_EdgeMankiller', name: 'Edgeville Men', author: 'Kaila', description: 'Fights Men in Edgeville.', categories: ['Combat', 'Prayer'], fileName: 'K_EdgeMankiller' },
  { id: 'K_EdgeGiants', name: 'Edgeville Giants', author: 'Kaila', description: 'Fights Giants in the Edgeville Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_EdgeGiants' },
  { id: 'K_EdgeSkeletons', name: 'Edgeville Skeletons', author: 'Kaila', description: 'Fights Skeletons in Edgeville.', categories: ['Combat', 'Prayer'], fileName: 'K_EdgeSkeletons' },
  { id: 'K_EdgeThugs', name: 'Edgeville Thugs', author: 'Kaila', description: 'Fights Thugs in Edgeville.', categories: ['Combat', 'Prayer'], fileName: 'K_EdgeThugs' },
  { id: 'K_EdgeDungeonThugs', name: 'Edge Dungeon Thugs', author: 'Kaila', description: 'Fights Thugs in the Edgeville Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_EdgeDungeonThugs' },
  { id: 'K_EdgeHobsPlus', name: 'Edge Dungeon Hobs+', author: 'Kaila', description: 'Fights Hobgoblins, Skeletons, and Zombies in the Edgeville Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_EdgeHobsPlus' },
  { id: 'K_EdgeChaosDruids', name: 'Edge Chaos Druids', author: 'Kaila', description: 'Fights Chaos Druids in the Edgeville Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_EdgeChaosDruids' },
  { id: 'K_BoneyardSkeletons', name: 'Boneyard Skeletons', author: 'Kaila', description: 'Fights Skeletons in the Boneyard.', categories: ['Combat', 'Prayer'], fileName: 'K_BoneyardSkeletons' },
  { id: 'K_BattlefieldTrainer', name: 'Khazard Battlefield', author: 'Kaila', description: 'Fights enemies at the Khazard Battlefield. Start in Ardougne or at the Battlefield.', categories: ['Combat'], fileName: 'K_BattlefieldTrainer' },
  { id: 'K_HobsPeninsula', name: 'Hobgoblin Peninsula', author: 'Kaila', description: 'Fights Hobgoblins at the peninsula south west of Falador.', categories: ['Combat', 'Prayer'], fileName: 'K_HobsPeninsula' },
  { id: 'K_AsgarnianPirateHobs', name: 'Asgarnian Pirates & Hobs', author: 'Kaila', description: 'Fights Hobgoblins and Pirates in the Asgarnia Ice Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_AsgarnianPirateHobs' },
  { id: 'K_AsgarnianIceGiants', name: 'Asgarnian Ice Giants', author: 'Kaila', description: 'Fights Ice Giants in the Asgarnia Ice Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_AsgarnianIceGiants' },
  { id: 'K_ArdyMossGiants', name: 'Ardougne Moss Giants', author: 'Kaila', description: 'Fights Moss Giants north of Ardougne.', categories: ['Combat', 'Prayer'], fileName: 'K_ArdyMossGiants' },
  { id: 'K_ArdyChaosDruids', name: 'Ardougne Chaos Druids', author: 'Kaila', description: 'Fights Chaos Druids in the Ardougne Chaos Druid Tower.', categories: ['Combat', 'Prayer'], fileName: 'K_ArdyChaosDruids' },
  { id: 'K_WhiteUnicorns', name: 'White Unicorns', author: 'Kaila', description: 'Fights the White Unicorns near Catherby.', categories: ['Combat', 'Prayer'], fileName: 'K_WhiteUnicorns' },
  { id: 'K_BlackUnicorns', name: 'Wilderness Black Unicorns', author: 'Kaila', description: 'Fights Unicorns in the Wilderness. Start in Edgeville bank with armor.', categories: ['Combat', 'Prayer'], fileName: 'K_BlackUnicorns' },
  { id: 'K_NoBank_TavChaos', name: 'Taverley Chaos (No Bank)', author: 'Kaila', description: 'Fights Chaos Druids in Taverly without going to the bank.', categories: ['Combat', 'Prayer'], fileName: 'K_NoBank_TavChaos' },
  { id: 'K_TavChaosDruids', name: 'Taverley Chaos Druids', author: 'Kaila', description: 'Fights Chaos Druids in the Taverley Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_TavChaosDruids' },
  { id: 'K_TavDruidCircle', name: 'Taverley Druid Circle', author: 'Kaila', description: 'Fights Druids at the Druid Circle in Taverley.', categories: ['Combat', 'Prayer'], fileName: 'K_TavDruidCircle' },
  { id: 'K_TavDruidTown', name: 'Taverley Druid Town', author: 'Kaila', description: 'Fights Druids in Taverley.', categories: ['Combat', 'Prayer'], fileName: 'K_TavDruidTown' },
  { id: 'K_TavBlueDragonPipe', name: 'Taverley Blue Dragons', author: 'Kaila', description: 'Fights Blue Dragons in the Taverley Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_TavBlueDragonPipe' },
  { id: 'K_TavBlackDragonPipe', name: 'Taverley Black Dragons', author: 'Kaila', description: 'Fights Black Dragons in the Taverley Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_TavBlackDragonPipe' },
  { id: 'K_TavBlackDemonPipe', name: 'Taverley Black Demons', author: 'Kaila', description: 'Fights Black Demons in the Taverley Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_TavBlackDemonPipe' },
  { id: 'K_Waterfall_FireGiants', name: 'Waterfall Fire Giants', author: 'Kaila', description: 'Fights Fire Giants in the Waterfall Dungeon. Requires Sharks/Laws/Airs in bank.', categories: ['Combat', 'Prayer'], fileName: 'K_Waterfall_FireGiants' },
  { id: 'K_WildyFireGiants', name: 'Wilderness Fire Giants', author: 'Kaila', description: 'Fights Fire Giants in the Wilderness. Start in mage bank with armor.', categories: ['Combat', 'Prayer'], fileName: 'K_WildyFireGiants' },
  { id: 'K_YanilleBlueDrag', name: 'Yanille Blue Dragons', author: 'Kaila', description: 'Fights Blue Dragons in the Ogre Enclave.', categories: ['Combat', 'Prayer'], fileName: 'K_YanilleBlueDrag' },
  { id: 'K_YanilleChaosDruids', name: 'Yanille Chaos Druids', author: 'Kaila', description: 'Fights Chaos Druids in the Yanille Agility Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_YanilleChaosDruids' },
  { id: 'K_YanilleDruidWarriors', name: 'Yanille Druid Warriors', author: 'Kaila', description: 'Fights Chaos Druid Warriors in the Yanille Agility Dungeon.', categories: ['Combat', 'Prayer'], fileName: 'K_YanilleDruidWarriors' },
  { id: 'K_Paladins', name: 'Paladins (Thieve+Fight)', author: 'Kaila', description: 'Thieves from Paladins in the Ardougne Castle.', categories: ['Skilling', 'Combat'], fileName: 'K_Paladins' },

  // ═══ SKILLING ═══
  { id: 'AIOMiner', name: 'AIO Miner', author: 'kkoemets', description: 'An all-in-one Mining script. Enjoys the game and mines ores.', categories: ['Skilling'], fileName: 'AIOMiner' },
  { id: 'Woodcutting', name: 'Woodcutting', author: 'Searos & Kaila, Seatta', description: 'An all-in-one Woodcutting script.', categories: ['Skilling'], fileName: 'Woodcutting' },
  { id: 'PowerFletcha', name: 'Power Fletch', author: 'Dvorak', description: 'Cuts, fletches and drops bows of any log type.', categories: ['Skilling'], fileName: 'PowerFletcha' },
  { id: 'FletchnBankBows', name: 'Fletch & Bank Bows', author: 'Searos', description: 'Fletches and banks bows.', categories: ['Skilling'], fileName: 'FletchnBankBows' },
  { id: 'ArrowMaker', name: 'Arrow Maker', author: 'Searos', description: 'Make headless arrows or tipped arrows of any type.', categories: ['Skilling'], fileName: 'ArrowMaker' },
  { id: 'AIOCooker', name: 'AIO Cooker', author: 'Dvorak & Kaila', description: 'Catherby — withdraws raw food, cooks, banks.', categories: ['Skilling'], fileName: 'AIOCooker' },
  { id: 'Firemaking', name: 'Firemaker', author: 'R2H', description: 'Drops and lights logs in a fire line. Bring tinderbox + logs.', categories: ['Skilling'], fileName: 'Firemaking' },
  { id: 'AIOSmelter', name: 'AIO Smelter', author: 'Dvorak, Searos, Kaila', description: 'Standard Falador/Al-Kharid smelter script.', categories: ['Skilling'], fileName: 'AIOSmelter' },
  { id: 'SmithingVarrock', name: 'Varrock Smither', author: 'Searos & Kaila', description: 'Smiths items at the anvil in Varrock.', categories: ['Skilling'], fileName: 'SmithingVarrock' },
  { id: 'SmithGearSet', name: 'Smith Gear Sets', author: 'Searos', description: 'Smith entire gear sets.', categories: ['Skilling'], fileName: 'SmithGearSet' },
  { id: 'EssenceMiner', name: 'Essence Miner', author: 'Searos', description: 'Mines and banks rune essence.', categories: ['Skilling'], fileName: 'EssenceMiner' },
  { id: 'AIOFisher', name: 'AIO Fisher', author: 'R2H', description: 'All-in-one fishing: multi-select fish types, auto or chosen location, banking or power-fish, junk-drop.', categories: ['Skilling'], fileName: 'AIOFisher' },
  { id: 'ColeslawGuildFisher', name: 'Guild Fisher', author: 'Searos & Kaila', description: 'Fishes in the fishing guild.', categories: ['Skilling'], fileName: 'ColeslawGuildFisher' },
  { id: 'CatherbyLobs', name: 'Catherby Lobsters', author: 'SaladFork', description: 'Catches lobsters in Catherby.', categories: ['Skilling'], fileName: 'CatherbyLobs' },
  { id: 'CatherbyFishFarm', name: 'Catherby Fish & Cook', author: 'Seatta', description: 'Catherby — withdraws raw food, cooks, banks.', categories: ['Skilling'], fileName: 'CatherbyFishFarm' },
  { id: 'K_FastBarbFisher', name: 'Barbarian Fisher', author: 'Kaila', description: 'Power fishes trout/salmon in Barbarian Village.', categories: ['Skilling'], fileName: 'K_FastBarbFisher' },
  { id: 'CasketFisher', name: 'Casket Fisher', author: 'Seatta', description: 'Fishes for caskets in Catherby. Also chisels oyster pearls into bolt tips.', categories: ['Skilling'], fileName: 'CasketFisher' },
  { id: 'SpinStrings', name: 'Spin Bowstrings', author: 'Searos & Kaila', description: 'Spins bowstrings in Falador, Seers\' Village, or the Crafting Guild.', categories: ['Skilling'], fileName: 'SpinStrings' },
  { id: 'VialCrafter', name: 'Vial Crafter', author: 'Seatta & Kaila', description: 'Crafts vials on Entrana.', categories: ['Skilling'], fileName: 'VialCrafter' },
  { id: 'PotionMaker', name: 'Potion Maker', author: 'Seatta & Kaila', description: 'An all-in-one potion making script.', categories: ['Skilling'], fileName: 'PotionMaker' },
  { id: 'HerbIdentifier', name: 'Herb Identifier', author: 'Dvorak', description: 'Withdraws unidentified herbs from the bank, identifies them, deposits clean herbs.', categories: ['Skilling'], fileName: 'HerbIdentifier' },
  { id: 'DamWildyAgility', name: 'Wildy Agility', author: 'Damrau', description: 'Trains agility at the Wilderness agility course.', categories: ['Skilling'], fileName: 'DamWildyAgility' },
  { id: 'Ledger', name: 'Yanille Ledge', author: 'Dvorak', description: 'Uses the ledge in Yanille agility dungeon.', categories: ['Skilling'], fileName: 'Ledger' },
  { id: 'AgilityNet', name: 'Gnome Agility Net', author: 'Flop', description: 'Gnome Agility Net course.', categories: ['Skilling'], fileName: 'AgilityNet' },
  { id: 'AIOThiever', name: 'AIO Thiever', author: 'Dvorak & Kaila', description: 'A basic thiever that supports most things in the game.', categories: ['Skilling'], fileName: 'AIOThiever' },
  { id: 'Man', name: 'Thieve Men', author: 'G-unit', description: 'Thieves men. Supports batching.', categories: ['Skilling'], fileName: 'Man' },
  { id: 'DamRc', name: 'Rune Crafter', author: 'Damrau & Kaila', description: 'Mines ess and/or crafts runes. Coleslaw only.', categories: ['Skilling'], fileName: 'DamRc' },
  { id: 'FoulRunecraft', name: 'Foul Runecraft', author: 'Foulwerp', description: 'Mines essence and crafts runes.', categories: ['Skilling'], fileName: 'FoulRunecraft' },
  { id: 'K_NatureCrafter', name: 'Nature Crafter', author: 'Kaila', description: 'Crafts Nature runes on Karamja (coleslaw only).', categories: ['Skilling'], fileName: 'K_NatureCrafter' },
  { id: 'MiningGuild', name: 'Mining Guild', author: 'Seatta', description: 'Mines ores in the Mining Guild.', categories: ['Skilling'], fileName: 'MiningGuild' },
  { id: 'AKMiner', name: 'Al-Kharid Miner', author: 'Dvorak', description: 'A basic mining script with banking for Al-Kharid.', categories: ['Skilling'], fileName: 'AKMiner' },
  { id: 'K_HobsMiner', name: 'Hobgoblin Mine', author: 'Kaila', description: 'Mines Addy/Mith/Coal in Hobgoblin Mine and banks in Edgeville.', categories: ['Skilling'], fileName: 'K_HobsMiner' },
  { id: 'K_EdgeDungeonMine', name: 'Edge Dungeon Mine', author: 'Kaila', description: 'Mines Addy/Mith/Coal in Hobgoblin Mine and banks in Edgeville.', categories: ['Skilling'], fileName: 'K_EdgeDungeonMine' },
  { id: 'K_SkelliCoal', name: 'Skeleton Coal Mine', author: 'Kaila', description: 'Mines coal from the Wilderness skeleton coal mine, banks in edge.', categories: ['Skilling'], fileName: 'K_SkelliCoal' },
  { id: 'CraftingGuildMining', name: 'Crafting Guild Mine', author: 'Searos & Kaila', description: 'Mines gold, silver, and clay in the crafting guild.', categories: ['Skilling'], fileName: 'CraftingGuildMining' },
  { id: 'CeikPlates', name: 'Steel Platebody Smither', author: 'Ceikry', description: 'Steel Platebody Smither by Ceikry.', categories: ['Skilling'], fileName: 'CeikPlates' },
  { id: 'AIOBankTrainer', name: 'AIO Bank Trainer', author: 'Kaila', description: 'Multi-skill bank trainer.', categories: ['Skilling', 'Prayer'], fileName: 'AIOBankTrainer' },
  { id: 'AIOHarvester', name: 'AIO Harvester', author: 'Kaila', description: 'An all-in-one Harvesting script.', categories: ['Skilling'], fileName: 'AIOHarvester' },
  { id: 'HarvesterTrainer', name: 'Harvest Trainer', author: 'Dvorak, Seatta', description: 'Trains Harvesting on Coleslaw in Lumbridge and Ardougne fields.', categories: ['Skilling'], fileName: 'HarvesterTrainer' },
  { id: 'HerbHarvester', name: 'Herb Harvester', author: 'Dvorak, Seatta', description: 'Picks herbs in Taverley via harvesting. Coleslaw only.', categories: ['Skilling'], fileName: 'HerbHarvester' },
  { id: 'LimpySnapez', name: 'Limpwurt & Snape', author: 'Dvorak, Seatta', description: 'Harvests Limpwurt Roots and Snape Grass in Taverley. Coleslaw only.', categories: ['Skilling'], fileName: 'LimpySnapez' },
  { id: 'K_ArdyYewTree', name: 'Ardougne Yews', author: 'Kaila', description: 'Cuts yew trees north east of Ardougne. Requires 53+ Combat to avoid aggressive bears!', categories: ['Skilling'], fileName: 'K_ArdyYewTree' },
  { id: 'K_GnomeMagicTree', name: 'Gnome Magic Trees', author: 'Kaila', description: 'Cuts Magic trees in the Tree Gnome Stronghold.', categories: ['Skilling'], fileName: 'K_GnomeMagicTree' },
  { id: 'K_SeersMagicTree', name: "Seers' Magic Trees", author: 'Kaila', description: "Cuts Magic logs in Seers' Village.", categories: ['Skilling'], fileName: 'K_SeersMagicTree' },
  { id: 'ChickenMunch0r', name: 'ChookMunch0r', author: 'pun@ran@K@whi@rocke@ran@R', description: 'Catherby — withdraws raw food, cooks, banks.', categories: ['Skilling'], fileName: 'ChickenMunch0r' },
  { id: 'CoconutCutter', name: 'Coconut Cutter', author: 'Toast', description: 'Cuts coconuts for a living.', categories: ['Skilling'], fileName: 'CoconutCutter' },
  { id: 'PowercraftTalisman', name: 'Powercraft Talisman', author: 'Searos', description: 'Trains mining and crafting at the essence rocks.', categories: ['Skilling'], fileName: 'PowercraftTalisman' },
  { id: 'PotionDrinker', name: 'Potion Drinker', author: 'xatain, Dvorak/Seatta', description: 'Drinks potions from your bank.', categories: ['Skilling'], fileName: 'PotionDrinker' },
  { id: 'NatureClipper', name: 'Nature Clipper', author: 'Dahun', description: 'Crafts Nature runes with cursed talismans, clips herbs in Shilo.', categories: ['Skilling'], fileName: 'NatureClipper' },
  { id: 'K_FastChainLinks', name: 'Chain Link Maker', author: 'Kaila', description: 'Makes Chain Links from dragon longs for Dragon Scale Mail armor.', categories: ['Skilling'], fileName: 'K_FastChainLinks' },
  { id: 'K_NoBank_Superheat', name: 'Superheat Smith', author: 'Kaila', description: 'Mines, superheats, and smiths iron into plate bodies.', categories: ['Magic', 'Skilling'], fileName: 'K_NoBank_Superheat' },

  // ═══ MAGIC ═══
  { id: 'AIOMagic', name: 'AIO Magic', author: 'Dvorak', description: 'Performs all magic spells that require banking.', categories: ['Magic'], fileName: 'AIOMagic' },
  { id: 'AlchWheat', name: 'Alch Wheat', author: 'Dvorak', description: 'High/Low alchs wheat anywhere there\'s wheat.', categories: ['Magic'], fileName: 'AlchWheat' },
  { id: 'K_TeleWines', name: 'Telegrab Wines', author: 'Kaila', description: 'Telegrabs wines in the Chaos Temple. Start in West Falador bank.', categories: ['Magic', 'Gathering'], fileName: 'K_TeleWines' },

  // ═══ PRAYER ═══
  { id: 'BuryBone', name: 'Bury Bones', author: 'Lucid', description: 'Bury Bones.', categories: ['Prayer'], fileName: 'BuryBone' },
  { id: 'K_BoneyardBury', name: 'Boneyard Bone Burier', author: 'Kaila', description: 'Loots and buries bones from the Boneyard.', categories: ['Prayer'], fileName: 'K_BoneyardBury' },

  // ═══ GATHERING ═══
  { id: 'Flaxx0r', name: 'Flax Picker', author: 'Dvorak', description: 'Picks flax in Seers\' Village.', categories: ['Gathering'], fileName: 'Flaxx0r' },
  { id: 'GnomeFlaxx0r', name: 'Gnome Flax', author: 'Dvorak & Kaila', description: 'Picks flax, optionally spins it, in Tree Stronghold.', categories: ['Skilling'], fileName: 'GnomeFlaxx0r' },
  { id: 'AirPicker', name: 'Air Picker', author: 'Hiyadude', description: 'Picks air runes.', categories: ['Gathering'], fileName: 'AirPicker' },
  { id: 'AntiDragonShields', name: 'Anti-Dragon Shields', author: 'Dvorak & Kaila', description: 'Collects anti dragon shields from the Duke of Lumbridge.', categories: ['Gathering'], fileName: 'AntiDragonShields' },
  { id: 'Wildberries', name: 'Wild Whiteberries', author: 'Dvorak', description: 'Picks Whiteberries in the Wilderness. Needs an anti dragon shield.', categories: ['Gathering'], fileName: 'Wildberries' },
  { id: 'K_RedSpiderEggz', name: 'Red Spider Eggs', author: 'Kaila', description: 'Collects Red Spider Eggs from Edgeville Dungeon.', categories: ['Gathering'], fileName: 'K_RedSpiderEggz' },
  { id: 'K_MonkRobes', name: 'Monk Robes', author: 'Kaila', description: 'Collects Monk Robe sets from Edgeville Monastery.', categories: ['Gathering'], fileName: 'K_MonkRobes' },
  { id: 'K_Nightshade', name: 'Nightshade', author: 'Kaila', description: 'Collects Nightshade from Gu\'Tanoth.', categories: ['Gathering'], fileName: 'K_Nightshade' },

  // ═══ MONEY ═══
  { id: 'BuyFromShop', name: 'Buy From Shop', author: 'Searos & Kaila', description: 'Buys items from shops.', categories: ['Money'], fileName: 'BuyFromShop' },
  { id: 'SellToShop', name: 'Sell To Shop', author: 'Searos', description: 'Sells items to shops.', categories: ['Money'], fileName: 'SellToShop' },
  { id: 'ArrowBuyer3', name: 'Arrow Buyer', author: 'Lucid', description: 'Arrow Buyer.', categories: ['Money'], fileName: 'ArrowBuyer3' },
  { id: 'K_BuyAttackCape', name: 'Buy Attack Capes', author: 'Kaila', description: 'Buys and banks Attack Capes from Rovin.', categories: ['Money'], fileName: 'K_BuyAttackCape' },
  { id: 'K_BuyBettyShop', name: 'Buy from Betty', author: 'Kaila', description: 'Buys eyes of newt and runes from Betty in Port Sarim.', categories: ['Money'], fileName: 'K_BuyBettyShop' },
  { id: 'K_BuyDragonSwords', name: 'Buy Dragon Swords', author: 'Kaila', description: 'Buys Dragon Swords from Jakut in Zanaris.', categories: ['Money'], fileName: 'K_BuyDragonSwords' },
  { id: 'K_BuyMagicGuild', name: 'Magic Guild Buyer', author: 'Kaila', description: 'Buys runes and battlestaves from the Magic Guild in Yanille.', categories: ['Money'], fileName: 'K_BuyMagicGuild' },

  // ═══ QUESTING ═══
  { id: 'AIOQuester', name: 'AIO Quester', author: 'Seatta', description: 'An all-in-one questing script.', categories: ['Questing'], fileName: 'AIOQuester' },

  // ═══ MISC ═══
  { id: 'ShearSheep', name: 'Shear Sheep', author: 'Searos', description: 'Shears sheep and banks wool.', categories: ['Misc'], fileName: 'ShearSheep' },
  { id: 'CasketOpener', name: 'Casket Opener', author: 'Acry', description: 'Withdraws caskets from bank, opens them, banks the loot.', categories: ['Misc'], fileName: 'CasketOpener' },
  { id: 'K_CrystalKeyChest', name: 'Crystal Key Chest', author: 'Kaila', description: 'Opens the crystal chest in Taverley.', categories: ['Misc'], fileName: 'K_CrystalKeyChest' },
  { id: 'LocationWalker', name: 'Location Walker', author: 'Seatta', description: 'A simple script for walking to a location.', categories: ['Misc'], fileName: 'LocationWalker' },
  { id: 'GetMeToArdougne', name: 'Walk to Ardougne', author: 'Dvorak', description: 'Walks from Lumbridge to Ardougne.', categories: ['Misc'], fileName: 'GetMeToArdougne' },
  { id: 'WaterFiller', name: 'Water Filler', author: 'Dvorak & Kaila', description: 'Fills vials/jugs in Falador.', categories: ['Misc'], fileName: 'WaterFiller' },
  { id: 'DropEverything', name: 'Drop Everything', author: 'Dvorak', description: 'Drops everything in your inventory.', categories: ['Misc'], fileName: 'DropEverything' },
];
