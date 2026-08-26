import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { SCRIPTS, type ScriptDef, type ScriptCategory } from './scripts';

// Complete NPC drop table — extracted from server NpcDrops.java + bone/ash system
// Item IDs verified against /ref docs/openrsc-items.md (Aug 8, 2026)
const NPC_DROPS: Record<number, number[]> = {
  0: [20,466],
  3: [20,133,381],
  4: [10,11,20,34,35,36,40,41,82,87,143,183,202,273,827],
  6: [20,147,504],
  8: [20,146,502],
  11: [10,11,18,20,28,31,34,35,41,104,150,380],
  19: [20,503],
  21: [10,13,18,20,32,34,35,104,150,237,380],
  22: [10,31,38,41,42,84,88,109,115,126,142,152,181,399],
  25: [20,49],
  35: [181],
  40: [0,10,11,16,20,21,32,34,35,40,41,104,113],
  41: [0,10,20,28,31,33,36,46,60,128,166,202,270],
  43: [604],
  45: [1,5,10,12,20,32,33,41,42,46,83,113,169],
  46: [10,11,20,28,29,31,33,34,40,41,66,70,151],
  47: [20,503],
  49: [20,146,502],
  52: [10,11,12,20,33,35,36,40,70,104,150,380],
  57: [10,20,31,32,33,34,35,36,40,41,42,100,199,216,619],
  60: [10,20,31,32,33,34,35,36,40,41,42,46,100,199,216,619],
  61: [2,6,10,28,31,32,35,38,40,41,42,46,72,94,193,220,413],
  62: [10,20,32,34,36,124,186,189,190,192,193,273,827],
  63: [10,11,18,20,28,31,34,35,41,104,150,380],
  64: [10,11,18,20,28,31,34,35,41,104,150,380],
  65: [10,11,20,28,29,31,33,34,40,41,70,104,151,619],
  66: [1,6,10,20,23,34,35,36,38,41,42,46,95,138,171,189,202],
  67: [1,10,20,31,32,36,40,41,42,46,60,63,72,220,273,827,1088,1089],
  68: [1,5,10,12,20,32,33,41,42,46,83,113,169],
  72: [10,11,18,20,28,31,34,35,41,104,150,380],
  76: [0,10,11,20,31,34,35,41,42,87,100,132,146,193,201,202,293],
  78: [0,10,11,20,31,34,35,41,42,87,100,132,146,193,201,202,293],
  81: [20,184,185],
  86: [10,11,18,20,28,31,34,35,41,104,150,380],
  89: [20,209],
  94: [10,20,40,41,89,104,150,151,155,156,168,169,170,202,205],
  100: [10,11,20,28,29,31,33,34,40,41,70,104,151,619],
  102: [10,20,32,35,36,40,41,42,67,71,105,136,151,170,188,263,619],
  104: [10,33,34,38,40,41,42,46,68,105,129,155,171,179,186,198,413,432,619],
  114: [18,19,21,29,50,55,58,132,133,134,135,136,137,138,139,140,141,144,149,166,168,181,185,190,192,201,207,231,232,233,234],
  135: [10,32,35,36,38,40,42,46,67,77,88,96,126,142,153,215,249,413,433,619],
  137: [8,10,11,20,28,31,33,34,40,41,42,82,170,192,609],
  139: [20,95],
  153: [10,11,20,34,35,36,40,41,82,87,143,183,202,273,827],
  154: [10,11,20,34,35,36,40,41,82,87,143,183,202,273,827],
  158: [10,20,38,40,41,42,46,89,96,619,827],
  159: [10,11,18,20,28,31,34,35,41,104,150,380],
  177: [20,390],
  178: [391],
  179: [20,392],
  180: [20,393],
  181: [181,395],
  182: [20,394],
  184: [10,31,38,41,43,78,88,90,112,123,130,172,181,367],
  188: [20,146,502],
  189: [1,6,10,20,23,34,35,36,38,41,42,46,95,138,171,189,202],
  190: [10,20,32,33,35,38,40,41,42,46,73,109,126,155,173,319,320,414],
  195: [1,5,10,12,20,32,33,41,42,46,83,113,169],
  196: [814],
  199: [0,10,11,20,32,34,35,40,41,104,151,355,430,470],
  200: [10,20,28,31,32,34,41,42,188,220,465,566,607,608],
  201: [10,31,38,42,75,79,91,120,130,174,203,332,619,814],
  202: [10,31,32,40,42,90,111,121,130,154,203,396,555,814,1090],
  203: [413],
  214: [10,11,12,20,33,40,70,87,104,380],
  232: [10,20,32,33,35,38,40,41,42,83,88,125,155,188,619],
  234: [10,20,32,33,35,38,40,41,42,83,88,125,155,188,619],
  236: [10,20,32,35,36,40,41,42,72,109,383,535],
  237: [10,20,32,35,36,40,41,42,72,109,383,535],
  238: [10,20,32,35,36,40,41,42,72,109,383,535],
  243: [20,541],
  251: [5,10,20,38,40,41,42,46,88,89,151,155,170],
  252: [20,557],
  254: [20,556],
  264: [8,10,11,20,28,31,33,34,40,41,42,82,170,192,609],
  265: [20,595],
  266: [1,6,10,20,23,34,35,36,38,41,42,46,95,138,171,189,202],
  270: [10,20,33,34,35,36,40,42,70,464,469,1026],
  277: [1,6,10,20,23,34,35,36,38,41,42,46,95,138,171,189,202],
  288: [181],
  290: [10,31,33,41,42,90,130,174,181,373,399,400,424,428,480,619],
  291: [10,31,33,38,42,75,79,91,120,130,174,203,332,619,814],
  295: [89],
  296: [20,466],
  298: [10,20,38,41,42,46,96,286],
  311: [1,10,20,31,32,36,40,41,42,46,60,63,72,220,273,827,1088,1089],
  312: [413],
  315: [181],
  318: [10,11,18,20,28,31,34,35,41,104,150,380],
  319: [10,11,18,20,28,31,34,35,41,104,150,380],
  320: [10,11,18,20,28,31,34,35,41,104,150,380],
  321: [10,11,20,28,29,31,33,34,40,41,70,104,151,619],
  323: [10,20,32,67,72,109,173,619],
  342: [10,11,18,20,28,31,34,35,41,104,150,380],
  344: [10,31,41,42,88,126,171,223,224,373,398,413,615,619],
  351: [10,11,18,20,28,31,34,35,41,104,150,380],
  352: [10,11,18,20,28,31,34,35,41,104,150,380],
  356: [10,20,40,41,89,104,150,151,155,156,168,169,170,202,205],
  358: [10,20,31,32,33,34,35,36,40,41,42,46,100,197,619,702,703],
  359: [0,10,20,28,31,33,36,46,60,128,166,202,270],
  367: [20,503],
  420: [10,11,20,28,29,31,33,34,40,41,70,104,151,619],
  421: [10,20,40,152,220,469,569,570,574,592,827,1088,1090],
  430: [758],
  431: [762],
  432: [763],
  433: [764],
  477: [31,33,38,42,75,91,120,174,204,316,517,546,619,638,711,793,795,814],
  498: [0,10,11,16,20,21,32,34,35,40,41,104,113],
  516: [0,10,20,28,31,33,36,46,60,128,166,202,270],
  523: [10,13,40,249,413,748,827,1088],
  525: [413],
  531: [413],
  555: [10,20,31,33,34,40,42,220,423,464,469,471,473,497],
  567: [10,20,31,32,40,42,423,464,469,471,497,932],
  568: [181],
  584: [10,20,34,38,40,41,42,103,619,1089],
  594: [10,33,34,38,40,41,42,46,68,105,129,155,171,179,186,198,413,432,619],
  632: [10,20,32,67,72,109,173,619],
  633: [10,20,32,67,72,109,173,619],
  645: [181],
  646: [181],
  647: [181],
  651: [413],
  653: [20,1101],
  660: [10,11,20,34,35,36,40,41,82,87,827],
  673: [413],
  675: [413],
  676: [413],
  677: [413],
  680: [413],
  681: [413],
  682: [413],
  683: [413],
  684: [413],
  686: [413],
  687: [413],
  688: [413],
  689: [413],
  691: [413],
  694: [10,20,40,41,89,104,150,151,155,156,168,169,170,202,205],
  697: [413],
  699: [10,20,40,41,89,104,150,151,155,156,168,169,170,202,205],
  704: [413],
  706: [413],
  710: [10,11,20,28,29,31,33,34,40,41,70,104,151,619],
  769: [181],
  777: [20,1268],
  787: [10,20,33,38,46,173,216,425,565,572,619,1081,1091],
  809: [10,33,38,46,173,181,216,425,565,572,619,1081,1091,1346,1347,1363],
};

// Complete item name lookup — all 1290 entries from server ItemDefs.json
const ITEM_NAMES: Record<number, string> = {
  0:'Iron Mace',1:'Iron Short Sword',2:'Iron Kite Shield',3:'Iron Square Shield',4:'Wooden Shield',5:'Medium Iron Helmet',6:'Large Iron Helmet',7:'Iron Chain Mail Body',8:'Iron Plate Mail Body',9:'Iron Plate Mail Legs',
  10:'Coins',11:'Bronze Arrows',12:'Iron Axe',13:'Knife',14:'Logs',15:'Leather Armour',16:'Leather Gloves',17:'Boots',18:'Cabbage',19:'Egg',
  20:'Bones',21:'Bucket',22:'Milk',23:'Flour',24:'Amulet of GhostSpeak',25:'Silverlight key 1',26:'Silverlight key 2',27:'skull',28:'Iron dagger',29:'grain',
  30:'Book',31:'Fire-Rune',32:'Water-Rune',33:'Air-Rune',34:'Earth-Rune',35:'Mind-Rune',36:'Body-Rune',37:'Life-Rune',38:'Death-Rune',39:'Needle',
  40:'Nature-Rune',41:'Chaos-Rune',42:'Law-Rune',43:'Thread',44:'Holy Symbol of saradomin',45:'Unblessed Holy Symbol',46:'Cosmic-Rune',47:'key',48:'key',49:'scroll',
  50:'Water',51:'Silverlight key 3',52:'Silverlight',53:'Broken shield',54:'Broken shield',55:'Cadavaberries',56:'message',57:'Cadava',58:'potion',59:'Phoenix Crossbow',
  60:'Crossbow',61:'Certificate',62:'bronze dagger',63:'Steel dagger',64:'Mithril dagger',65:'Adamantite dagger',66:'Bronze Short Sword',67:'Steel Short Sword',68:'Mithril Short Sword',69:'Adamantite Short Sword',
  70:'Bronze Long Sword',71:'Iron Long Sword',72:'Steel Long Sword',73:'Mithril Long Sword',74:'Adamantite Long Sword',75:'Rune long sword',76:'Bronze 2-handed Sword',77:'Iron 2-handed Sword',78:'Steel 2-handed Sword',79:'Mithril 2-handed Sword',
  80:'Adamantite 2-handed Sword',81:'rune 2-handed Sword',82:'Bronze Scimitar',83:'Iron Scimitar',84:'Steel Scimitar',85:'Mithril Scimitar',86:'Adamantite Scimitar',87:'bronze Axe',88:'Steel Axe',89:'Iron battle Axe',
  90:'Steel battle Axe',91:'Mithril battle Axe',92:'Adamantite battle Axe',93:'Rune battle Axe',94:'Bronze Mace',95:'Steel Mace',96:'Mithril Mace',97:'Adamantite Mace',98:'Rune Mace',99:'Brass key',
  100:'staff',101:'Staff of Air',102:'Staff of water',103:'Staff of earth',104:'Medium Bronze Helmet',105:'Medium Steel Helmet',106:'Medium Mithril Helmet',107:'Medium Adamantite Helmet',108:'Large Bronze Helmet',109:'Large Steel Helmet',
  110:'Large Mithril Helmet',111:'Large Adamantite Helmet',112:'Large Rune Helmet',113:'Bronze Chain Mail Body',114:'Steel Chain Mail Body',115:'Mithril Chain Mail Body',116:'Adamantite Chain Mail Body',117:'Bronze Plate Mail Body',118:'Steel Plate Mail Body',119:'Mithril Plate Mail Body',
  120:'Adamantite Plate Mail Body',121:'Steel Plate Mail Legs',122:'Mithril Plate Mail Legs',123:'Adamantite Plate Mail Legs',124:'Bronze Square Shield',125:'Steel Square Shield',126:'Mithril Square Shield',127:'Adamantite Square Shield',128:'Bronze Kite Shield',129:'Steel Kite Shield',
  130:'Mithril Kite Shield',131:'Adamantite Kite Shield',132:'cookedmeat',133:'raw chicken',134:'burntmeat',135:'pot',136:'flour',137:'bread dough',138:'bread',139:'burntbread',
  140:'jug',141:'water',142:'wine',143:'grapes',144:'shears',145:'wool',146:'fur',147:'cow hide',148:'leather',149:'clay',
  150:'copper ore',151:'iron ore',152:'gold',153:'mithril ore',154:'adamantite ore',155:'coal',156:'Bronze Pickaxe',157:'uncut diamond',158:'uncut ruby',159:'uncut emerald',
  160:'uncut sapphire',161:'diamond',162:'ruby',163:'emerald',164:'sapphire',165:'Herb',166:'tinderbox',167:'chisel',168:'hammer',169:'bronze bar',
  170:'iron bar',171:'steel bar',172:'gold bar',173:'mithril bar',174:'adamantite bar',175:'Pressure gauge',176:'Fish Food',177:'Poison',178:'Poisoned fish food',179:'spinach roll',
  180:'Bad wine',181:'Ashes',182:'Apron',183:'Cape',184:'Wizards robe',185:'wizardshat',186:'Brass necklace',187:'skirt',188:'Longbow',189:'Shortbow',
  190:'Crossbow bolts',191:'Apron',192:'Chef\'s hat',193:'Beer',194:'skirt',195:'skirt',196:'Black Plate Mail Body',197:'Staff of fire',198:'Magic Staff',199:'wizardshat',
  200:'silk',201:'flier',202:'tin ore',203:'Mithril Axe',204:'Adamantite Axe',205:'bronze battle Axe',206:'Bronze Plate Mail Legs',207:'Ball of wool',208:'Oil can',209:'Cape',
  210:'Kebab',211:'Spade',212:'Closet Key',213:'rubber tube',214:'Bronze Plated Skirt',215:'Iron Plated Skirt',216:'Black robe',217:'stake',218:'Garlic',219:'Red spiders eggs',
  220:'Limpwurt root',221:'Strength Potion',222:'Strength Potion',223:'Strength Potion',224:'Strength Potion',225:'Steel Plated skirt',226:'Mithril Plated skirt',227:'Adamantite Plated skirt',228:'Cabbage',229:'Cape',
  230:'Large Black Helmet',231:'Red Bead',232:'Yellow Bead',233:'Black Bead',234:'White Bead',235:'Amulet of accuracy',236:'Redberries',237:'Rope',238:'Reddye',239:'Yellowdye',
  240:'Paste',241:'Onion',242:'Bronze key',243:'Soft Clay',244:'wig',245:'wig',246:'Half full wine jug',247:'Keyprint',248:'Black Plate Mail Legs',249:'banana',
  250:'pastry dough',251:'Pie dish',252:'cooking apple',253:'pie shell',254:'Uncooked apple pie',255:'Uncooked meat pie',256:'Uncooked redberry pie',257:'apple pie',258:'Redberry pie',259:'meat pie',
  260:'burntpie',261:'Half a meat pie',262:'Half a Redberry pie',263:'Half an apple pie',264:'Portrait',265:'Faladian Knight\'s sword',266:'blurite ore',267:'Asgarnian Ale',268:'Wizard\'s Mind Bomb',269:'Dwarven Stout',
  270:'Eye of newt',271:'Rat\'s tail',272:'Bluedye',273:'Goblin Armour',274:'Goblin Armour',275:'Goblin Armour',276:'unstrung Longbow',277:'unstrung shortbow',278:'Unfired Pie dish',279:'unfired pot',
  280:'arrow shafts',281:'Woad Leaf',282:'Orangedye',283:'Gold ring',284:'Sapphire ring',285:'Emerald ring',286:'Ruby ring',287:'Diamond ring',288:'Gold necklace',289:'Sapphire necklace',
  290:'Emerald necklace',291:'Ruby necklace',292:'Diamond necklace',293:'ring mould',294:'Amulet mould',295:'Necklace mould',296:'Gold Amulet',297:'Sapphire Amulet',298:'Emerald Amulet',299:'Ruby Amulet',
  300:'Diamond Amulet',301:'Gold Amulet',302:'Sapphire Amulet',303:'Emerald Amulet',304:'Ruby Amulet',305:'Diamond Amulet',306:'superchisel',307:'Mace of Zamorak',308:'Bronze Plate Mail top',309:'Steel Plate Mail top',
  310:'Mithril Plate Mail top',311:'Adamantite Plate Mail top',312:'Iron Plate Mail top',313:'Black Plate Mail top',314:'Sapphire Amulet of magic',315:'Emerald Amulet of protection',316:'Ruby Amulet of strength',317:'Diamond Amulet of power',318:'Karamja Rum',319:'Cheese',
  320:'Tomato',321:'Pizza Base',322:'Burnt Pizza',323:'Incomplete Pizza',324:'Uncooked Pizza',325:'Plain Pizza',326:'Meat Pizza',327:'Anchovie Pizza',328:'Half Meat Pizza',329:'Half Anchovie Pizza',
  330:'Cake',331:'Burnt Cake',332:'Chocolate Cake',333:'Partial Cake',334:'Partial Chocolate Cake',335:'Slice of Cake',336:'Chocolate Slice',337:'Chocolate Bar',338:'Cake Tin',339:'Uncooked cake',
  340:'Unfired bowl',341:'Bowl',342:'Bowl of water',343:'Incomplete stew',344:'Incomplete stew',345:'Uncooked stew',346:'Stew',347:'Burnt Stew',348:'Potato',349:'Raw Shrimp',
  350:'Shrimp',351:'Raw Anchovies',352:'Anchovies',353:'Burnt fish',354:'Raw Sardine',355:'Sardine',356:'Raw Salmon',357:'Salmon',358:'Raw Trout',359:'Trout',
  360:'Burnt fish',361:'Raw Herring',362:'Herring',363:'Raw Pike',364:'Pike',365:'Burnt fish',366:'Raw Tuna',367:'Tuna',368:'Burnt fish',369:'Raw Swordfish',
  370:'Swordfish',371:'Burnt Swordfish',372:'Raw Lobster',373:'Lobster',374:'Burnt Lobster',375:'Lobster Pot',376:'Net',377:'Fishing Rod',378:'Fly Fishing Rod',379:'Harpoon',
  380:'Fishing Bait',381:'Feather',382:'Chest key',383:'Silver',384:'silver bar',385:'Holy Symbol of saradomin',386:'Holy symbol mould',387:'Disk of Returning',388:'Monks robe',389:'Monks robe',
  390:'Red key',391:'Orange Key',392:'yellow key',393:'Blue key',394:'Magenta key',395:'black key',396:'rune dagger',397:'Rune short sword',398:'rune Scimitar',399:'Medium Rune Helmet',
  400:'Rune Chain Mail Body',401:'Rune Plate Mail Body',402:'Rune Plate Mail Legs',403:'Rune Square Shield',404:'Rune Kite Shield',405:'rune Axe',406:'Rune skirt',407:'Rune Plate Mail top',408:'Runite bar',409:'runite ore',
  410:'Plank',411:'Tile',412:'skull',413:'Big Bones',414:'Muddy key',415:'Map',416:'Map Piece',417:'Map Piece',418:'Map Piece',419:'Nails',
  420:'Anti dragon breath Shield',421:'Maze key',422:'Pumpkin',423:'Black dagger',424:'Black Short Sword',425:'Black Long Sword',426:'Black 2-handed Sword',427:'Black Scimitar',428:'Black Axe',429:'Black battle Axe',
  430:'Black Mace',431:'Black Chain Mail Body',432:'Black Square Shield',433:'Black Kite Shield',434:'Black Plated skirt',435:'Herb',436:'Herb',437:'Herb',438:'Herb',439:'Herb',
  440:'Herb',441:'Herb',442:'Herb',443:'Herb',444:'Guam leaf',445:'Marrentill',446:'Tarromin',447:'Harralander',448:'Ranarr Weed',449:'Irit Leaf',
  450:'Avantoe',451:'Kwuarm',452:'Cadantine',453:'Dwarf Weed',454:'Unfinished potion',455:'Unfinished potion',456:'Unfinished potion',457:'Unfinished potion',458:'Unfinished potion',459:'Unfinished potion',
  460:'Unfinished potion',461:'Unfinished potion',462:'Unfinished potion',463:'Unfinished potion',464:'Vial',465:'Vial',466:'Unicorn horn',467:'Blue dragon scale',468:'Pestle and mortar',469:'Snape grass',
  470:'Medium black Helmet',471:'White berries',472:'Ground blue dragon scale',473:'Ground unicorn horn',474:'attack Potion',475:'attack Potion',476:'attack Potion',477:'stat restoration Potion',478:'stat restoration Potion',479:'stat restoration Potion',
  480:'defense Potion',481:'defense Potion',482:'defense Potion',483:'restore prayer Potion',484:'restore prayer Potion',485:'restore prayer Potion',486:'Super attack Potion',487:'Super attack Potion',488:'Super attack Potion',489:'fishing Potion',
  490:'fishing Potion',491:'fishing Potion',492:'Super strength Potion',493:'Super strength Potion',494:'Super strength Potion',495:'Super defense Potion',496:'Super defense Potion',497:'Super defense Potion',498:'ranging Potion',499:'ranging Potion',
  500:'ranging Potion',501:'wine of Zamorak',502:'raw bear meat',503:'raw rat meat',504:'raw beef',505:'enchanted bear meat',506:'enchanted rat meat',507:'enchanted beef',508:'enchanted chicken meat',509:'Dramen Staff',
  510:'Dramen Branch',511:'Cape',512:'Cape',513:'Cape',514:'Cape',515:'Greendye',516:'Purpledye',517:'Iron ore certificate',518:'Coal certificate',519:'Mithril ore certificate',
  520:'silver certificate',521:'Gold certificate',522:'Dragonstone Amulet',523:'Dragonstone',524:'Dragonstone Amulet',525:'Crystal key',526:'Half of a key',527:'Half of a key',528:'Iron bar certificate',529:'steel bar certificate',
  530:'Mithril bar certificate',531:'silver bar certificate',532:'Gold bar certificate',533:'Lobster certificate',534:'Raw lobster certificate',535:'Swordfish certificate',536:'Raw swordfish certificate',537:'Diary',538:'Front door key',539:'Ball',
  540:'magnet',541:'Grey wolf fur',542:'uncut dragonstone',543:'Dragonstone ring',544:'Dragonstone necklace',545:'Raw Shark',546:'Shark',547:'Burnt Shark',548:'Big Net',549:'Casket',
  550:'Raw cod',551:'Cod',552:'Raw Mackerel',553:'Mackerel',554:'Raw Bass',555:'Bass',556:'Ice Gloves',557:'Firebird Feather',558:'Firebird Feather',559:'Poisoned Iron dagger',
  560:'Poisoned bronze dagger',561:'Poisoned Steel dagger',562:'Poisoned Mithril dagger',563:'Poisoned Rune dagger',564:'Poisoned Adamantite dagger',565:'Poisoned Black dagger',566:'Cure poison Potion',567:'Cure poison Potion',568:'Cure poison Potion',569:'Poison antidote',
  570:'Poison antidote',571:'Poison antidote',572:'weapon poison',573:'ID Paper',574:'Poison Bronze Arrows',575:'Christmas cracker',576:'Party Hat',577:'Party Hat',578:'Party Hat',579:'Party Hat',
  580:'Party Hat',581:'Party Hat',582:'Miscellaneous key',583:'Bunch of keys',584:'Whisky',585:'Candlestick',586:'Master thief armband',587:'Blamish snail slime',588:'Blamish oil',589:'Oily Fishing Rod',
  590:'lava eel',591:'Raw lava eel',592:'Poison Crossbow bolts',593:'Dragon sword',594:'Dragon axe',595:'Jail keys',596:'Dusty Key',597:'Charged Dragonstone Amulet',598:'Grog',599:'Candle',
  600:'black Candle',601:'Candle',602:'black Candle',603:'insect repellant',604:'Bat bones',605:'wax Bucket',606:'Excalibur',607:'Druids robe',608:'Druids robe',609:'Eye patch',
  610:'Unenchanted Dragonstone Amulet',611:'Unpowered orb',612:'Fire orb',613:'Water orb',614:'Battlestaff',615:'Battlestaff of fire',616:'Battlestaff of water',617:'Battlestaff of air',618:'Battlestaff of earth',619:'Blood-Rune',
  620:'Beer glass',621:'glassblowing pipe',622:'seaweed',623:'molten glass',624:'soda ash',625:'sand',626:'air orb',627:'earth orb',628:'bass certificate',629:'Raw bass certificate',
  630:'shark certificate',631:'Raw shark certificate',632:'Oak Logs',633:'Willow Logs',634:'Maple Logs',635:'Yew Logs',636:'Magic Logs',637:'Headless Arrows',638:'Iron Arrows',639:'Poison Iron Arrows',
  640:'Steel Arrows',641:'Poison Steel Arrows',642:'Mithril Arrows',643:'Poison Mithril Arrows',644:'Adamantite Arrows',645:'Poison Adamantite Arrows',646:'Rune Arrows',647:'Poison Rune Arrows',648:'Oak Longbow',649:'Oak Shortbow',
  650:'Willow Longbow',651:'Willow Shortbow',652:'Maple Longbow',653:'Maple Shortbow',654:'Yew Longbow',655:'Yew Shortbow',656:'Magic Longbow',657:'Magic Shortbow',658:'unstrung Oak Longbow',659:'unstrung Oak Shortbow',
  660:'unstrung Willow Longbow',661:'unstrung Willow Shortbow',662:'unstrung Maple Longbow',663:'unstrung Maple Shortbow',664:'unstrung Yew Longbow',665:'unstrung Yew Shortbow',666:'unstrung Magic Longbow',667:'unstrung Magic Shortbow',668:'barcrawl card',669:'bronze arrow heads',
  670:'iron arrow heads',671:'steel arrow heads',672:'mithril arrow heads',673:'adamantite arrow heads',674:'rune arrow heads',675:'flax',676:'bow string',677:'Easter egg',678:'scorpion cage',679:'scorpion cage',
  680:'scorpion cage',681:'scorpion cage',682:'Enchanted Battlestaff of fire',683:'Enchanted Battlestaff of water',684:'Enchanted Battlestaff of air',685:'Enchanted Battlestaff of earth',686:'scorpion cage',687:'scorpion cage',688:'scorpion cage',689:'scorpion cage',
  690:'gold',691:'gold bar',692:'Ruby ring',693:'Ruby necklace',694:'Family crest',695:'Crest fragment',696:'Crest fragment',697:'Crest fragment',698:'Steel gauntlets',699:'gauntlets of goldsmithing',
  700:'gauntlets of cooking',701:'gauntlets of chaos',702:'robe of Zamorak',703:'robe of Zamorak',704:'Address Label',705:'Tribal totem',706:'tourist guide',707:'spice',708:'Uncooked curry',709:'curry',
  710:'Burnt curry',711:'yew logs certificate',712:'maple logs certificate',713:'willow logs certificate',714:'lockpick',715:'Red vine worms',716:'Blanket',717:'Raw giant carp',718:'giant Carp',719:'Fishing competition Pass',
  720:'Hemenster fishing trophy',721:'Pendant of Lucien',722:'Boots of lightfootedness',723:'Ice Arrows',724:'Lever',725:'Staff of Armadyl',726:'Pendant of Armadyl',727:'Large cog',728:'Large cog',729:'Large cog',
  730:'Large cog',731:'Rat Poison',732:'shiny Key',733:'khazard Helmet',734:'khazard chainmail',735:'khali brew',736:'khazard cell keys',737:'Poison chalice',738:'magic whistle',739:'Cup of tea',
  740:'orb of protection',741:'orbs of protection',742:'Holy table napkin',743:'bell',744:'Gnome Emerald Amulet of protection',745:'magic golden feather',746:'Holy grail',747:'Script of Hazeel',748:'Pineapple',749:'Pineapple ring',
  750:'Pineapple Pizza',751:'Half pineapple Pizza',752:'Magic scroll',753:'Mark of Hazeel',754:'bloody axe of zamorak',755:'carnillean armour',756:'Carnillean Key',757:'Cattle prod',758:'Plagued sheep remains',759:'Poisoned animal feed',
  760:'Protective jacket',761:'Protective trousers',762:'Plagued sheep remains',763:'Plagued sheep remains',764:'Plagued sheep remains',765:'dwellberries',766:'Gasmask',767:'picture',768:'Book',769:'Seaslug',
  770:'chocolaty milk',771:'Hangover cure',772:'Chocolate dust',773:'Torch',774:'Torch',775:'warrant',776:'Damp sticks',777:'Dry sticks',778:'Broken glass',779:'oyster pearls',
  780:'little key',781:'Scruffy note',782:'Glarial\'s amulet',783:'Swamp tar',784:'Uncooked Swamp paste',785:'Swamp paste',786:'Oyster pearl bolts',787:'Glarials pebble',788:'book on baxtorian',789:'large key',
  790:'Oyster pearl bolt tips',791:'oyster',792:'oyster pearls',793:'oyster',794:'Soil',795:'Dragon medium Helmet',796:'Mithril seed',797:'An old key',798:'pigeon cage',799:'Messenger pigeons',
  800:'Bird feed',801:'Rotten apples',802:'Doctors gown',803:'Bronze key',804:'Distillator',805:'Glarial\'s urn',806:'Glarial\'s urn',807:'Priest robe',808:'Priest gown',809:'Liquid Honey',
  810:'Ethenea',811:'Sulphuric Broline',812:'Plague sample',813:'Touch paper',814:'Dragon Bones',815:'Herb',816:'Snake Weed',817:'Herb',818:'Ardrigal',819:'Herb',
  820:'Sito Foil',821:'Herb',822:'Volencia Moss',823:'Herb',824:'Rogues Purse',825:'Soul-Rune',826:'king lathas Amulet',827:'Bronze Spear',828:'halloween mask',829:'Dragon bitter',
  830:'Greenmans ale',831:'halloween mask',832:'halloween mask',833:'cocktail glass',834:'cocktail shaker',835:'Bone Key',836:'gnome robe',837:'gnome robe',838:'gnome robe',839:'gnome robe',
  840:'gnome robe',841:'gnomeshat',842:'gnomeshat',843:'gnomeshat',844:'gnomeshat',845:'gnomeshat',846:'gnome top',847:'gnome top',848:'gnome top',849:'gnome top',
  850:'gnome top',851:'gnome cocktail guide',852:'Beads of the dead',853:'cocktail glass',854:'cocktail glass',855:'lemon',856:'lemon slices',857:'orange',858:'orange slices',859:'Diced orange',
  860:'Diced lemon',861:'Fresh Pineapple',862:'Pineapple chunks',863:'lime',864:'lime chunks',865:'lime slices',866:'fruit blast',867:'odd looking cocktail',868:'Whisky',869:'vodka',
  870:'gin',871:'cream',872:'Drunk dragon',873:'Equa leaves',874:'SGG',875:'Chocolate saturday',876:'brandy',877:'blurberry special',878:'wizard blizzard',879:'pineapple punch',
  880:'gnomebatta dough',881:'gianne dough',882:'gnomebowl dough',883:'gnomecrunchie dough',884:'gnomebatta',885:'gnomebowl',886:'gnomebatta',887:'gnomecrunchie',888:'gnomebowl',889:'Uncut Red Topaz',
  890:'Uncut Jade',891:'Uncut Opal',892:'Red Topaz',893:'Jade',894:'Opal',895:'Swamp Toad',896:'Toad legs',897:'King worm',898:'Gnome spice',899:'gianne cook book',
  900:'gnomecrunchie',901:'cheese and tomato batta',902:'toad batta',903:'gnome batta',904:'worm batta',905:'fruit batta',906:'Veg batta',907:'Chocolate bomb',908:'Vegball',909:'worm hole',
  910:'Tangled toads legs',911:'Choc crunchies',912:'Worm crunchies',913:'Toad crunchies',914:'Spice crunchies',915:'Crushed Gemstone',916:'Blurberry badge',917:'Gianne badge',918:'tree gnome translation',919:'Bark sample',
  920:'War ship',921:'gloughs journal',922:'invoice',923:'Ugthanki Kebab',924:'special curry',925:'glough\'s key',926:'glough\'s notes',927:'Pebble',928:'Pebble',929:'Pebble',
  930:'Pebble',931:'Daconia rock',932:'Sinister key',933:'Herb',934:'Torstol',935:'Unfinished potion',936:'Jangerberries',937:'fruit blast',938:'blurberry special',939:'wizard blizzard',
  940:'pineapple punch',941:'SGG',942:'Chocolate saturday',943:'Drunk dragon',944:'cheese and tomato batta',945:'toad batta',946:'gnome batta',947:'worm batta',948:'fruit batta',949:'Veg batta',
  950:'Chocolate bomb',951:'Vegball',952:'worm hole',953:'Tangled toads legs',954:'Choc crunchies',955:'Worm crunchies',956:'Toad crunchies',957:'Spice crunchies',958:'Stone-Plaque',959:'Tattered Scroll',
  960:'Crumpled Scroll',961:'Bervirius Tomb Notes',962:'Zadimus Corpse',963:'Potion of Zamorak',964:'Potion of Zamorak',965:'Potion of Zamorak',966:'Boots',967:'Boots',968:'Boots',969:'Boots',
  970:'Boots',971:'Santa\'s hat',972:'Locating Crystal',973:'Sword Pommel',974:'Bone Shard',975:'Steel Wire',976:'Bone Beads',977:'Rashiliya Corpse',978:'ResetCrystal',979:'Bronze Wire',
  980:'Present',981:'Gnome Ball',982:'Papyrus',983:'A lump of Charcoal',984:'Arrow',985:'Lit Arrow',986:'Rocks',987:'Paramaya Rest Ticket',988:'Ship Ticket',989:'Damp cloth',
  990:'Desert Boots',991:'Orb of light',992:'Orb of light',993:'Orb of light',994:'Orb of light',995:'Railing',996:'Randas\'s journal',997:'Unicorn horn',998:'Coat of Arms',999:'Coat of Arms',
  1000:'Staff of Iban',1001:'Dwarf brew',1002:'Ibans Ashes',1003:'Cat',1004:'A Doll of Iban',1005:'Old Journal',1006:'Klank\'s gauntlets',1007:'Iban\'s shadow',1008:'Iban\'s conscience',1009:'Amulet of Othainian',
  1010:'Amulet of Doomion',1011:'Amulet of Holthion',1012:'keep key',1013:'Bronze Throwing Dart',1014:'Prototype Throwing Dart',1015:'Iron Throwing Dart',1016:'Full Water Skin',1017:'Lens mould',1018:'Lens',1019:'Desert Robe',
  1020:'Desert Shirt',1021:'Metal Key',1022:'Slaves Robe Bottom',1023:'Slaves Robe Top',1024:'Steel Throwing Dart',1025:'Astrology Book',1026:'Unholy Symbol mould',1027:'Unholy Symbol of Zamorak',1028:'Unblessed Unholy Symbol of Zamorak',1029:'Unholy Symbol of Zamorak',
  1030:'Shantay Desert Pass',1031:'Staff of Iban',1032:'Dwarf cannon base',1033:'Dwarf cannon stand',1034:'Dwarf cannon barrels',1035:'Dwarf cannon furnace',1036:'Fingernails',1037:'Powering crystal1',1038:'Mining Barrel',1039:'Ana in a Barrel',
  1040:'Stolen gold',1041:'multi cannon ball',1042:'Railing',1043:'Ogre tooth',1044:'Ogre relic',1045:'Skavid map',1046:'dwarf remains',1047:'Key',1048:'Ogre relic part',1049:'Ogre relic part',
  1050:'Ogre relic part',1051:'Ground bat bones',1052:'Unfinished potion',1053:'Ogre potion',1054:'Magic ogre potion',1055:'Tool kit',1056:'Nulodion\'s notes',1057:'cannon ammo mould',1058:'Tenti Pineapple',1059:'Bedobin Copy Key',
  1060:'Technical Plans',1061:'Rock cake',1062:'Bronze dart tips',1063:'Iron dart tips',1064:'Steel dart tips',1065:'Mithril dart tips',1066:'Adamantite dart tips',1067:'Rune dart tips',1068:'Mithril Throwing Dart',1069:'Adamantite Throwing Dart',
  1070:'Rune Throwing Dart',1071:'Prototype dart tip',1072:'info document',1073:'Instruction manual',1074:'Unfinished potion',1075:'Iron throwing knife',1076:'Bronze throwing knife',1077:'Steel throwing knife',1078:'Mithril throwing knife',1079:'Adamantite throwing knife',
  1080:'Rune throwing knife',1081:'Black throwing knife',1082:'Water Skin mostly full',1083:'Water Skin mostly empty',1084:'Water Skin mouthful left',1085:'Empty Water Skin',1086:'nightshade',1087:'Shaman robe',1088:'Iron Spear',1089:'Steel Spear',
  1090:'Mithril Spear',1091:'Adamantite Spear',1092:'Rune Spear',1093:'Cat',1094:'Seasoned Sardine',1095:'Kittens',1096:'Kitten',1097:'Wrought iron key',1098:'Cell Door Key',1099:'A free Shantay Disclaimer',
  1100:'Doogle leaves',1101:'Raw Ugthanki Meat',1102:'Tasty Ugthanki Kebab',1103:'Cooked Ugthanki Meat',1104:'Uncooked Pitta Bread',1105:'Pitta Bread',1106:'Tomato Mixture',1107:'Onion Mixture',1108:'Onion and Tomato Mixture',1109:'Onion and Tomato and Ugthanki Mix',
  1110:'Burnt Pitta Bread',1111:'Panning tray',1112:'Panning tray',1113:'Panning tray',1114:'Rock pick',1115:'Specimen brush',1116:'Specimen jar',1117:'Rock Sample',1118:'gold Nuggets',1119:'cat',
  1120:'Scrumpled piece of paper',1121:'Digsite info',1122:'Poisoned Bronze Throwing Dart',1123:'Poisoned Iron Throwing Dart',1124:'Poisoned Steel Throwing Dart',1125:'Poisoned Mithril Throwing Dart',1126:'Poisoned Adamantite Throwing Dart',1127:'Poisoned Rune Throwing Dart',1128:'Poisoned Bronze throwing knife',1129:'Poisoned Iron throwing knife',
  1130:'Poisoned Steel throwing knife',1131:'Poisoned Mithril throwing knife',1132:'Poisoned Black throwing knife',1133:'Poisoned Adamantite throwing knife',1134:'Poisoned Rune throwing knife',1135:'Poisoned Bronze Spear',1136:'Poisoned Iron Spear',1137:'Poisoned Steel Spear',1138:'Poisoned Mithril Spear',1139:'Poisoned Adamantite Spear',
  1140:'Poisoned Rune Spear',1141:'Book of experimental chemistry',1142:'Level 1 Certificate',1143:'Level 2 Certificate',1144:'Level 3 Certificate',1145:'Trowel',1146:'Stamped letter of recommendation',1147:'Unstamped letter of recommendation',1148:'Rock Sample',1149:'Rock Sample',
  1150:'Cracked rock Sample',1151:'Belt buckle',1152:'Powering crystal2',1153:'Powering crystal3',1154:'Powering crystal4',1155:'Old boot',1156:'Bunny ears',1157:'Damaged armour',1158:'Damaged armour',1159:'Rusty sword',
  1160:'Ammonium Nitrate',1161:'Nitroglycerin',1162:'Old tooth',1163:'Radimus Scrolls',1164:'chest key',1165:'broken arrow',1166:'buttons',1167:'broken staff',1168:'vase',1169:'ceramic remains',
  1170:'Broken glass',1171:'Unidentified powder',1172:'Machette',1173:'Scroll',1174:'stone tablet',1175:'Talisman of Zaros',1176:'Explosive compound',1177:'Bull Roarer',1178:'Mixed chemicals',1179:'Ground charcoal',
  1180:'Mixed chemicals',1181:'Spell scroll',1182:'Yommi tree seed',1183:'Totem Pole',1184:'Dwarf cannon base',1185:'Dwarf cannon stand',1186:'Dwarf cannon barrels',1187:'Dwarf cannon furnace',1188:'Golden Bowl',1189:'Golden Bowl with pure water',
  1190:'Raw Manta ray',1191:'Manta ray',1192:'Raw Sea turtle',1193:'Sea turtle',1194:'Annas Silver Necklace',1195:'Bobs Silver Teacup',1196:'Carols Silver Bottle',1197:'Davids Silver Book',1198:'Elizabeths Silver Needle',1199:'Franks Silver Pot',
  1200:'Thread',1201:'Thread',1202:'Thread',1203:'Flypaper',1204:'Murder Scene Pot',1205:'A Silver Dagger',1206:'Murderers fingerprint',1207:'Annas fingerprint',1208:'Bobs fingerprint',1209:'Carols fingerprint',
  1210:'Davids fingerprint',1211:'Elizabeths fingerprint',1212:'Franks fingerprint',1213:'Zamorak Cape',1214:'Saradomin Cape',1215:'Guthix Cape',1216:'Staff of zamorak',1217:'Staff of guthix',1218:'Staff of Saradomin',1219:'A chunk of crystal',
  1220:'A lump of crystal',1221:'A hunk of crystal',1222:'A red crystal',1223:'Unidentified fingerprint',1224:'Annas Silver Necklace',1225:'Bobs Silver Teacup',1226:'Carols Silver Bottle',1227:'Davids Silver Book',1228:'Elizabeths Silver Needle',1229:'Franks Silver Pot',
  1230:'A Silver Dagger',1231:'A glowing red crystal',1232:'Unidentified liquid',1233:'Radimus Scrolls',1234:'Robe',1235:'Armour',1236:'Dagger',1237:'eye patch',1238:'Booking of Binding',1239:'Holy Water Vial',
  1240:'Enchanted Vial',1241:'Scribbled notes',1242:'Scrawled notes',1243:'Scatched notes',1244:'Shamans Tome',1245:'Edible seaweed',1246:'Rough Sketch of a bowl',1247:'Burnt Manta ray',1248:'Burnt Sea turtle',1249:'Cut reed plant',
  1250:'Magical Fire Pass',1251:'Snakes Weed Solution',1252:'Ardrigal Solution',1253:'Gujuo Potion',1254:'Germinated Yommi tree seed',1255:'Dark Dagger',1256:'Glowing Dark Dagger',1257:'Holy Force Spell',1258:'Iron Pickaxe',1259:'Steel Pickaxe',
  1260:'Mithril Pickaxe',1261:'Adamantite Pickaxe',1262:'Rune Pickaxe',1263:'Sleeping Bag',1264:'A blue wizards hat',1265:'Gilded Totem Pole',1266:'Blessed Golden Bowl',1267:'Blessed Golden Bowl with Pure Water',1268:'Raw Oomlie Meat',1269:'Cooked Oomlie meat Parcel',
  1270:'Dragon Bone Certificate',1271:'Limpwurt Root Certificate',1272:'Prayer Potion Certificate',1273:'Super Attack Potion Certificate',1274:'Super Defense Potion Certificate',1275:'Super Strength Potion Certificate',1276:'Half Dragon Square Shield',1277:'Half Dragon Square Shield',1278:'Dragon Square Shield',1279:'Palm tree leaf',
  1280:'Raw Oomlie Meat Parcel',1281:'Burnt Oomlie Meat parcel',1282:'Bailing Bucket',1283:'Plank',1284:'Arcenia root',1285:'display tea',1286:'Blessed Golden Bowl with plain water',1287:'Golden Bowl with plain water',1288:'Cape of legends',1289:'Scythe',
};

// Weapon IDs — items wearable in weapon slot (isWearable=1, wearSlot=3|4).
// Extracted from server ItemDefs.json. Used to scan inventory for melee/ranged weapons.
const WEAPON_IDS = new Set([0,1,12,28,59,60,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,
  78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,100,101,102,103,
  188,189,197,198,203,204,205,265,307,396,397,398,405,423,424,425,426,427,428,429,
  430,509,559,560,561,562,563,564,565,593,594,614,615,616,617,618,648,649,650,651,
  652,653,654,655,656,657,682,683,684,685,725,754,827,1000,1013,1014,1015,1024,1031,
  1068,1069,1070,1075,1076,1077,1078,1079,1080,1081,1088,1089,1090,1091,1092,1122,
  1123,1124,1125,1126,1127,1128,1129,1130,1131,1132,1133,1134,1135,1136,1137,1138,
  1139,1140,1205,1216,1217,1218,1230,1236]);

// Complete NPC name lookup — all 794 entries from server NpcDefs.json
const NPC_NAMES: Record<number, string> = {
  0: 'Unicorn', 1: 'Bob', 2: 'Sheep', 3: 'Chicken', 4: 'Goblin', 5: 'Hans', 6: 'Cow', 7: 'Cook',
  8: 'Bear', 9: 'Priest', 10: 'Urhney', 11: 'Man', 12: 'Bartender', 13: 'Camel', 14: 'Gypsy', 15: 'Ghost',
  16: 'Sir Prysin', 17: 'Traiborn The Wizard', 18: 'Captain Rovin', 19: 'Rat', 20: 'Reldo', 21: 'Mugger', 22: 'Lesser Demon', 23: 'Giant Spider',
  24: 'Man', 25: 'Jonny The Beard', 26: 'Baraek', 27: 'Katrine', 28: 'Tramp', 29: 'Rat', 30: 'Romeo', 31: 'Juliet',
  32: 'Father Lawrence', 33: 'Apothecary', 34: 'Spider', 35: 'Delrith', 36: 'Veronica', 37: 'Weaponsmaster', 38: 'Professor Oddenstein', 39: 'Curator',
  40: 'Skeleton', 41: 'Zombie', 42: 'King', 43: 'Giant Bat', 44: 'Bartender', 45: 'Skeleton', 46: 'Skeleton', 47: 'Rat',
  48: 'Horvik The Armourer', 49: 'Bear', 50: 'Skeleton', 51: 'Shopkeeper', 52: 'Zombie', 53: 'Ghost', 54: 'Aubury', 55: 'Shopkeeper',
  56: 'Shopkeeper', 57: 'Darkwizard', 58: 'Lowe', 59: 'Thessalia', 60: 'Darkwizard', 61: 'Giant', 62: 'Goblin', 63: 'Farmer',
  64: 'Thief', 65: 'Guard', 66: 'Black Knight', 67: 'Hobgoblin', 68: 'Zombie', 69: 'Zaff', 70: 'Scorpion', 71: 'Silk Trader',
  72: 'Man', 73: 'Guide', 74: 'Giant Spider', 75: 'Peksa', 76: 'Barbarian', 77: 'Fred The Farmer', 78: 'Gunthor The Brave', 79: 'Witch',
  80: 'Ghost', 81: 'Wizard', 82: 'Shop Assistant', 83: 'Shop Assistant', 84: 'Zeke', 85: 'Louie Legs', 86: 'Warrior', 87: 'Shopkeeper',
  88: 'Shop Assistant', 89: 'Highwayman', 90: 'Kebab Seller', 91: 'Chicken', 92: 'Ernest', 93: 'Monk', 94: 'Dwarf', 95: 'Banker',
  96: 'Count Draynor', 97: 'Morgan', 98: 'Dr Harlow', 99: 'Deadly Red Spider', 100: 'Guard', 101: 'Cassie', 102: 'White Knight', 103: 'Ranael',
  104: 'Moss Giant', 105: 'Shopkeeper', 106: 'Shop Assistant', 107: 'Witch', 108: 'Black Knight', 109: 'Greldo', 110: 'Sir Amik Varze', 111: 'Guildmaster',
  112: 'Valaine', 113: 'Drogo', 114: 'Imp', 115: 'Flynn', 116: 'Wyson The Gardener', 117: 'Wizard Mizgog', 118: 'Prince Ali', 119: 'Hassan',
  120: 'Osman', 121: 'Joe', 122: 'Leela', 123: 'Lady Keli', 124: 'Ned', 125: 'Aggie', 126: 'Prince Ali', 127: 'Jailguard',
  128: 'Redbeard Frank', 129: 'Wydin', 130: 'Shop Assistant', 131: 'Brian', 132: 'Squire', 133: 'Head Chef', 134: 'Thurgo', 135: 'Ice Giant',
  136: 'King Scorpion', 137: 'Pirate', 138: 'Sir Vyvin', 139: 'Monk Of Zamorak', 140: 'Monk Of Zamorak', 141: 'Wayne', 142: 'Barmaid', 143: 'Dwarven Shopkeeper',
  144: 'Doric', 145: 'Shopkeeper', 146: 'Shop Assistant', 147: 'Guide', 148: 'Hetty', 149: 'Betty', 150: 'Bartender', 151: 'General Wartface',
  152: 'General Bentnoze', 153: 'Goblin', 154: 'Goblin', 155: 'Herquin', 156: 'Rommik', 157: 'Grum', 158: 'Ice Warrior', 159: 'Warrior',
  160: 'Thrander', 161: 'Border Guard', 162: 'Border Guard', 163: 'Customs Officer', 164: 'Luthas', 165: 'Zambo', 166: 'Captain Tobias', 167: 'Gerrant',
  168: 'Shopkeeper', 169: 'Shop Assistant', 170: 'Seaman Lorris', 171: 'Seaman Thresnor', 172: 'Tanner', 173: 'Dommik', 174: 'Abbot Langley', 175: 'Thordur',
  176: 'Brother Jered', 177: 'Rat', 178: 'Ghost', 179: 'Skeleton', 180: 'Zombie', 181: 'Lesser Demon', 182: 'Melzar The Mad', 183: 'Scavvo',
  184: 'Greater Demon', 185: 'Shopkeeper', 186: 'Shop Assistant', 187: 'Oziach', 188: 'Bear', 189: 'Black Knight', 190: 'Chaos Dwarf', 191: 'Dwarf',
  192: 'Wormbrain', 193: 'Klarense', 194: 'Ned', 195: 'Skeleton', 196: 'Dragon', 197: 'Oracle', 198: 'Duke Of Lumbridge', 199: 'Dark Warrior',
  200: 'Druid', 201: 'Red Dragon', 202: 'Blue Dragon', 203: 'Baby Blue Dragon', 204: 'Kaqemeex', 205: 'Sanfew', 206: 'Suit Of Armour', 207: 'Adventurer',
  208: 'Adventurer', 209: 'Adventurer', 210: 'Adventurer', 211: 'Leprechaun', 212: 'Monk Of Entrana', 213: 'Monk Of Entrana', 214: 'Zombie', 215: 'Monk Of Entrana',
  216: 'Tree Spirit', 217: 'Cow', 218: 'Irksol', 219: 'Fairy Lunderwin', 220: 'Jakut', 221: 'Doorman', 222: 'Fairy Shopkeeper', 223: 'Fairy Shop Assistant',
  224: 'Fairy Banker', 225: 'Giles', 226: 'Miles', 227: 'Niles', 228: 'Gaius', 229: 'Fairy Ladder Attendant', 230: 'Jatix', 231: 'Master Crafter',
  232: 'Bandit', 233: 'Noterazzo', 234: 'Bandit', 235: 'Fat Tony', 236: 'Donny The Lad', 237: 'Black Heather', 238: 'Speedy Keith', 239: 'White Wolf Sentry',
  240: 'Boy', 241: 'Rat', 242: 'Nora T Hag', 243: 'Grey Wolf', 244: 'Shapeshifter', 245: 'Shapeshifter', 246: 'Shapeshifter', 247: 'Shapeshifter',
  248: 'White Wolf', 249: 'Pack Leader', 250: 'Harry', 251: 'Thug', 252: 'Firebird', 253: 'Achetties', 254: 'Ice Queen', 255: 'Grubor',
  256: 'Trobert', 257: 'Garv', 258: 'Guard', 259: 'Grip', 260: 'Alfonse The Waiter', 261: 'Charlie The Cook', 262: 'Guard Dog', 263: 'Ice Spider',
  264: 'Pirate', 265: 'Jailer', 266: 'Lord Darquarius', 267: 'Seth', 268: 'Banker', 269: 'Helemos', 270: 'Chaos Druid', 271: 'Poison Scorpion',
  272: 'Velrak The Explorer', 273: 'Sir Lancelot', 274: 'Sir Gawain', 275: 'King Arthur', 276: 'Sir Mordred', 277: 'Renegade Knight', 278: 'Davon', 279: 'Bartender',
  280: 'Arhein', 281: 'Morgan Le Faye', 282: 'Candlemaker', 283: 'Lady', 284: 'Lady', 285: 'Lady', 286: 'Beggar', 287: 'Merlin',
  288: 'Thrantax', 289: 'Hickton', 290: 'Black Demon', 291: 'Black Dragon', 292: 'Poison Spider', 293: 'Monk Of Zamorak', 294: 'Hellhound', 295: 'Animated Axe',
  296: 'Black Unicorn', 297: 'Frincos', 298: 'Otherworldly Being', 299: 'Owen', 300: 'Thormac The Sorceror', 301: 'Seer', 302: 'Kharid Scorpion', 303: 'Kharid Scorpion',
  304: 'Kharid Scorpion', 305: 'Barbarian Guard', 306: 'Bartender', 307: 'Man', 308: 'Gem Trader', 309: 'Dimintheis', 310: 'Chef', 311: 'Hobgoblin',
  312: 'Ogre', 313: 'Boot The Dwarf', 314: 'Wizard', 315: 'Chronozon', 316: 'Captain Barnaby', 317: 'Customs Official', 318: 'Man', 319: 'Farmer',
  320: 'Warrior', 321: 'Guard', 322: 'Knight', 323: 'Paladin', 324: 'Hero', 325: 'Baker', 326: 'Silk Merchant', 327: 'Fur Trader',
  328: 'Silver Merchant', 329: 'Spice Merchant', 330: 'Gem Merchant', 331: 'Zenesha', 332: 'Kangai Mau', 333: 'Wizard Cromperty', 334: 'RPDT Employee', 335: 'Horacio',
  336: 'Aemad', 337: 'Kortan', 338: 'Zoo Keeper', 339: 'Make Over Mage', 340: 'Bartender', 341: 'Chuck', 342: 'Rogue', 343: 'Shadow Spider',
  344: 'Fire Giant', 345: 'Grandpa Jack', 346: 'Sinister Stranger', 347: 'Bonzo', 348: 'Forester', 349: 'Morris', 350: 'Brother Omad', 351: 'Thief',
  352: 'Head Thief', 353: 'Big Dave', 354: 'Joshua', 355: 'Mountain Dwarf', 356: 'Mountain Dwarf', 357: 'Brother Cedric', 358: 'Necromancer', 359: 'Zombie',
  360: 'Lucien', 361: 'The Fire Warrior Of Lesarkus', 362: 'Guardian Of Armadyl', 363: 'Guardian Of Armadyl', 364: 'Lucien', 365: 'Winelda', 366: 'Brother Kojo', 367: 'Dungeon Rat',
  368: 'Master Fisher', 369: 'Orven', 370: 'Padik', 371: 'Shopkeeper', 372: 'Lady Servil', 373: 'Guard', 374: 'Guard', 375: 'Guard',
  376: 'Guard', 377: 'Jeremy Servil', 378: 'Justin Servil', 379: 'Fightslave Joe', 380: 'Fightslave Kelvin', 381: 'Local', 382: 'Khazard Bartender', 383: 'General Khazard',
  384: 'Khazard Ogre', 385: 'Guard', 386: 'Khazard Scorpion', 387: 'Hengrad', 388: 'Bouncer', 389: 'Stankers', 390: 'Docky', 391: 'Shopkeeper',
  392: 'Fairy Queen', 393: 'Merlin', 394: 'Crone', 395: 'High Priest Of Entrana', 396: 'Elkoy', 397: 'Remsai', 398: 'Bolkoy', 399: 'Local Gnome',
  400: 'Bolren', 401: 'Black Knight Titan', 402: 'Kalron', 403: 'Brother Galahad', 404: 'Tracker 1', 405: 'Tracker 2', 406: 'Tracker 3', 407: 'Khazard Troop',
  408: 'Commander Montai', 409: 'Gnome Troop', 410: 'Khazard Warlord', 411: 'Sir Percival', 412: 'Fisher King', 413: 'Maiden', 414: 'Fisherman', 415: 'King Percival',
  416: 'Unhappy Peasant', 417: 'Happy Peasant', 418: 'Ceril', 419: 'Butler', 420: 'Carnillean Guard', 421: 'Tribesman', 422: 'Henryeta', 423: 'Philipe',
  424: 'Clivet', 425: 'Cult Member', 426: 'Lord Hazeel', 427: 'Alomone', 428: 'Khazard Commander', 429: 'Claus', 430: '1st Plague Sheep', 431: '2nd Plague Sheep',
  432: '3rd Plague Sheep', 433: '4th Plague Sheep', 434: 'Farmer Brumty', 435: 'Doctor Orbon', 436: 'Councillor Halgrive', 437: 'Edmond', 438: 'Citizen', 439: 'Citizen',
  440: 'Citizen', 441: 'Citizen', 442: 'Citizen', 443: 'Jethick', 444: 'Mourner', 445: 'Mourner', 446: 'Ted Rehnison', 447: 'Martha Rehnison',
  448: 'Billy Rehnison', 449: 'Milli Rehnison', 450: 'Alrena', 451: 'Mourner', 452: 'Clerk', 453: 'Carla', 454: 'Bravek', 455: 'Caroline',
  456: 'Holgart', 457: 'Holgart', 458: 'Holgart', 459: 'Kent', 460: 'Bailey', 461: 'Kennith', 462: 'Platform Fisherman', 463: 'Platform Fisherman',
  464: 'Platform Fisherman', 465: 'Elena', 466: 'Jinno', 467: 'Watto', 468: 'Recruiter', 469: 'Head Mourner', 470: 'Almera', 471: 'Hudon',
  472: 'Hadley', 473: 'Rat', 474: 'Combat Instructor', 475: 'Golrie', 476: 'Guide', 477: 'King Black Dragon', 478: 'Cooking Instructor', 479: 'Fishing Instructor',
  480: 'Financial Advisor', 481: 'Gerald', 482: 'Mining Instructor', 483: 'Elena', 484: 'Omart', 485: 'Bank Assistant', 486: 'Jerico', 487: 'Kilron',
  488: 'Guidor\'s Wife', 489: 'Quest Advisor', 490: 'Chemist', 491: 'Mourner', 492: 'Mourner', 493: 'Wilderness Guide', 494: 'Magic Instructor', 495: 'Mourner',
  496: 'Community Instructor', 497: 'Boatman', 498: 'Skeleton Mage', 499: 'Controls Guide', 500: 'Nurse Sarah', 501: 'Tailor', 502: 'Mourner', 503: 'Guard',
  504: 'Chemist', 505: 'Chancy', 506: 'Hops', 507: 'DeVinci', 508: 'Guidor', 509: 'Chancy', 510: 'Hops', 511: 'DeVinci',
  512: 'King Lathas', 513: 'Head Wizard', 514: 'Magic Store Owner', 515: 'Wizard Frumscone', 516: 'Target Practice Zombie', 517: 'Trufitus', 518: 'Colonel Radick', 519: 'Soldier',
  520: 'Bartender', 521: 'Jungle Spider', 522: 'Jiminua', 523: 'Jogre', 524: 'Guard', 525: 'Ogre', 526: 'Guard', 527: 'Guard',
  528: 'Shop Keeper', 529: 'Bartender', 530: 'Frenita', 531: 'Ogre Chieftan', 532: 'Rometti', 533: 'Rashiliyia', 534: 'Blurberry', 535: 'Heckel Funch',
  536: 'Aluft Gianne', 537: 'Hudo Glenfad', 538: 'Irena', 539: 'Mosol', 540: 'Gnome Banker', 541: 'King Narnode Shareen', 542: 'UndeadOne', 543: 'Drucas',
  544: 'Tourist', 545: 'King Narnode Shareen', 546: 'Hazelmere', 547: 'Glough', 548: 'Shar', 549: 'Shantay', 550: 'Charlie', 551: 'Gnome Guard',
  552: 'Gnome Pilot', 553: 'Mehman', 554: 'Ana', 555: 'Chaos Druid Warrior', 556: 'Gnome Pilot', 557: 'Shipyard Worker', 558: 'Shipyard Worker', 559: 'Shipyard Worker',
  560: 'Shipyard Foreman', 561: 'Shipyard Foreman', 562: 'Gnome Guard', 563: 'Femi', 564: 'Femi', 565: 'Anita', 566: 'Glough', 567: 'Salarin The Twisted',
  568: 'Black Demon', 569: 'Gnome Pilot', 570: 'Gnome Pilot', 571: 'Gnome Pilot', 572: 'Gnome Pilot', 573: 'Sigbert The Adventurer', 574: 'Yanille Watchman', 575: 'Tower Guard',
  576: 'Gnome Trainer', 577: 'Gnome Trainer', 578: 'Gnome Trainer', 579: 'Gnome Trainer', 580: 'Blurberry Barman', 581: 'Gnome Waiter', 582: 'Gnome Guard', 583: 'Gnome Child',
  584: 'Earth Warrior', 585: 'Gnome Child', 586: 'Gnome Child', 587: 'Gulluck', 588: 'Gunnjorn', 589: 'Zadimus', 590: 'Brimstail', 591: 'Gnome Child',
  592: 'Gnome Local', 593: 'Gnome Local', 594: 'Moss Giant', 595: 'Gnome Baller', 596: 'Goalie', 597: 'Gnome Baller', 598: 'Gnome Baller', 599: 'Gnome Baller',
  600: 'Gnome Baller', 601: 'Referee', 602: 'Gnome Baller', 603: 'Gnome Baller', 604: 'Gnome Baller', 605: 'Gnome Baller', 606: 'Gnome Baller', 607: 'Gnome Baller',
  608: 'Gnome Baller', 609: 'Gnome Baller', 610: 'Gnome Baller', 611: 'Cheerleader', 612: 'Cheerleader', 613: 'Nazastarool Zombie', 614: 'Nazastarool Skeleton', 615: 'Nazastarool Ghost',
  616: 'Fernahei', 617: 'Jungle Banker', 618: 'Cart Driver', 619: 'Cart Driver', 620: 'Obli', 621: 'Kaleb', 622: 'Yohnus', 623: 'Serevel',
  624: 'Yanni', 625: 'Official', 626: 'Koftik', 627: 'Koftik', 628: 'Koftik', 629: 'Koftik', 630: 'Blessed Vermen', 631: 'Blessed Spider',
  632: 'Paladin', 633: 'Paladin', 634: 'Slave', 635: 'Slave', 636: 'Slave', 637: 'Slave', 638: 'Slave', 639: 'Slave',
  640: 'Slave', 641: 'Kalrag', 642: 'Niloof', 643: 'Kardia The Witch', 644: 'Souless', 645: 'Othainian', 646: 'Doomion', 647: 'Holthion',
  648: 'Klank', 649: 'Iban', 650: 'Koftik', 651: 'Goblin Guard', 652: 'Observatory Professor', 653: 'Ugthanki', 654: 'Observatory Assistant', 655: 'Souless',
  656: 'Dungeon Spider', 657: 'Kamen', 658: 'Iban Disciple', 659: 'Koftik', 660: 'Goblin', 661: 'Chadwell', 662: 'Professor', 663: 'San Tojalon',
  664: 'Ghost', 665: 'Spirit Of Scorpius', 666: 'Scorpion', 667: 'Dark Mage', 668: 'Mercenary', 669: 'Mercenary Captain', 670: 'Mercenary', 671: 'Mining Slave',
  672: 'Watchtower Wizard', 673: 'Ogre Shaman', 674: 'Skavid', 675: 'Ogre Guard', 676: 'Ogre Guard', 677: 'Ogre Guard', 678: 'Skavid', 679: 'Skavid',
  680: 'Og', 681: 'Grew', 682: 'Toban', 683: 'Gorad', 684: 'Ogre Guard', 685: 'Yanille Watchman', 686: 'Ogre Merchant', 687: 'Ogre Trader',
  688: 'Ogre Trader', 689: 'Ogre Trader', 690: 'Mercenary', 691: 'City Guard', 692: 'Mercenary', 693: 'Lawgof', 694: 'Dwarf', 695: 'Lollk',
  696: 'Skavid', 697: 'Ogre Guard', 698: 'Nulodion', 699: 'Dwarf', 700: 'Al Shabim', 701: 'Bedabin Nomad', 702: 'Captain Siad', 703: 'Bedabin Nomad Guard',
  704: 'Ogre Citizen', 705: 'Rock Of Ages', 706: 'Ogre', 707: 'Skavid', 708: 'Skavid', 709: 'Skavid', 710: 'Draft Mercenary Guard', 711: 'Mining Cart Driver',
  712: 'Kolodion', 713: 'Kolodion', 714: 'Gertrude', 715: 'Shilop', 716: 'Rowdy Guard', 717: 'Shantay Pass Guard', 718: 'Rowdy Slave', 719: 'Shantay Pass Guard',
  720: 'Assistant', 721: 'Desert Wolf', 722: 'Workman', 723: 'Examiner', 724: 'Student', 725: 'Student', 726: 'Guide', 727: 'Student',
  728: 'Archaeological Expert', 729: 'Civillian', 730: 'Civillian', 731: 'Civillian', 732: 'Civillian', 733: 'Murphy', 734: 'Murphy', 735: 'Sir Radimus Erkle',
  736: 'Legends Guild Guard', 737: 'Escaping Mining Slave', 738: 'Workman', 739: 'Murphy', 740: 'Echned Zekin', 741: 'Donovan The Handyman', 742: 'Pierre The Dog Handler', 743: 'Hobbes The Butler',
  744: 'Louisa The Cook', 745: 'Mary The Maid', 746: 'Stanford The Gardener', 747: 'Guard', 748: 'Guard Dog', 749: 'Guard', 750: 'Man', 751: 'Anna Sinclair',
  752: 'Bob Sinclair', 753: 'Carol Sinclair', 754: 'David Sinclair', 755: 'Elizabeth Sinclair', 756: 'Frank Sinclair', 757: 'Kolodion', 758: 'Kolodion', 759: 'Kolodion',
  760: 'Kolodion', 761: 'Irvig Senay', 762: 'Ranalph Devere', 763: 'Poison Salesman', 764: 'Gujuo', 765: 'Jungle Forester', 766: 'Ungadulu', 767: 'Ungadulu',
  768: 'Death Wing', 769: 'Nezikchened', 770: 'Dwarf Cannon Engineer', 771: 'Dwarf Commander', 772: 'Viyeldi', 773: 'Nurmof', 774: 'Fatigue Expert', 775: 'Karamja Wolf',
  776: 'Jungle Savage', 777: 'Oomlie Bird', 778: 'Sidney Smith', 779: 'Siegfried Erkle', 780: 'Tea Seller', 781: 'Wilough', 782: 'Philop', 783: 'Kanel',
  784: 'Chamber Guardian', 785: 'Sir Radimus Erkle', 786: 'Pit Scorpion', 787: 'Shadow Warrior', 788: 'Fionella', 789: 'Battle Mage', 790: 'Battle Mage', 791: 'Battle Mage',
  792: 'Gundai', 793: 'Lundail',
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
  treeTypes?: Record<string, boolean>;   // v265: multi-select
  wcBank?: boolean;
  bankDestination?: string;
  // — Fishing (v275) —
  fishType?: string;
  fishTypes?: Record<string, boolean>;   // v280: multi-select (miner-style)
  fishSite?: string;
  fishBank?: boolean;
  fishDropJunk?: boolean;
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

type ConfigType = 'combat' | 'mining' | 'cooking' | 'woodcutting' | 'fishing' | 'magic' | 'thieving' | 'smithing' | 'fletching' | 'bones';

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

const ROCK_TYPES = ['Copper', 'Tin', 'Iron', 'Coal', 'Silver', 'Gold', 'Mithril', 'Adamantite', 'Runite'];

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

const FISH_TYPES_UI = [
  'Shrimp & Anchovies', 'Sardine & Herring', 'Trout & Salmon', 'Pike',
  'Lobster', 'Tuna & Swordfish', 'Big Net', 'Shark',
];

const FISH_SITES_UI = ['Auto (nearest)', 'Catherby Coast', 'Draynor Shore', 'Lumbridge River', 'Edgeville Shore', 'Al-Kharid Shore'];

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
const FISHING_IDS   = new Set(['AIOFisher', 'CatherbyLobs', 'ColeslawGuildFisher', 'K_FastBarbFisher', 'CasketFisher']);
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
  if (FISHING_IDS.has(script.id))   return 'fishing';
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
      return { npcIds: '', lootIds: '-1', eatAtHp: '', wander: '20', fightMode: 'Accurate', targetLevel: '-1', buryBones: false, prioritizeBones: false, openDoors: false, useMagic: false, combatSpell: COMBAT_SPELLS[0], useRanging: false, switchId: '81' };
    case 'mining':
      return { rocks: { Copper: true, Tin: true, Iron: false, Coal: false, Silver: false, Gold: false, Mithril: false, Adamantite: false, Runite: false }, mineNoBank: false, campLocation: MINING_CAMPS[0], mineBankLocation: BANK_LOCATIONS[0], customCoords: false, customX: '', customY: '' };
    case 'cooking':
      return { foodType: FOOD_TYPES[0], dropBurnt: false, gauntlets: false };
    case 'woodcutting':
      return { treeType: 'Normal', treeTypes: { Normal: true, Oak: false, Willow: false, Maple: false, Yew: false, Magic: false }, wcBank: true, bankDestination: 'Auto' };
    case 'fishing':
      return { fishType: 'Shrimp & Anchovies', fishTypes: { 'Shrimp & Anchovies': true, 'Sardine & Herring': false, 'Trout & Salmon': false, 'Pike': false, 'Lobster': false, 'Tuna & Swordfish': false, 'Big Net': false, 'Shark': false }, fishSite: 'Auto (nearest)', fishBank: true, fishDropJunk: true };
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
  const [invWeapons, setInvWeapons] = useState<{id: number, name: string}[]>([]);

  // Fetch weapons from player inventory for melee switch selection
  const fetchWeapons = useCallback(() => {
    const iframe = document.querySelector('iframe[title*="Game"]') as HTMLIFrameElement;
    const mc = (iframe?.contentWindow as any)?.__r2h_mc;
    if (!mc?.b4?.data) { setInvWeapons([]); return; }
    const count = mc.cU || 0;
    const found: {id: number, name: string}[] = [];
    for (let i = 0; i < count; i++) {
      const itemId = mc.b4.data[i] & 32767;
      if (WEAPON_IDS.has(itemId)) {
        found.push({ id: itemId, name: ITEM_NAMES[itemId] || `Weapon ${itemId}` });
      }
    }
    found.sort((a, b) => a.name.localeCompare(b.name));
    setInvWeapons(found);
  }, []);

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

  // v257: live NPC list — rescan every 15s while the panel is open so NPCs that
  // wander/spawn into view appear in the checkbox list without clicking ↻ Scan.
  useEffect(() => {
    if (!open) return;
    fetchNearbyNpcs();
    const t = setInterval(fetchNearbyNpcs, 15000);
    return () => clearInterval(t);
  }, [open, fetchNearbyNpcs]);

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

  // Custom loot item search — filter ITEM_NAMES by typed name
  const [itemSearch, setItemSearch] = useState('');
  const itemSuggestions = useMemo(() => {
    if (!itemSearch || itemSearch.length < 2) return [];
    const q = itemSearch.toLowerCase();
    return Object.entries(ITEM_NAMES)
      .filter(([, name]) => name.toLowerCase().includes(q))
      .slice(0, 10)
      .map(([id, name]) => ({ id: parseInt(id), name }));
  }, [itemSearch]);

  const updateItemSearch = (v: string) => setItemSearch(v);

  const addLootItem = (itemId: number) => {
    const current = (cfg.lootIds ?? '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (!current.includes(itemId)) {
      current.push(itemId);
      current.sort((a, b) => a - b);
    }
    set({ lootIds: current.join(',') });
    setItemSearch('');
  };

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
      {/* Visual loot chips — shows item names, click ✕ to remove */}
      {(() => {
        const lootIds = (cfg.lootIds ?? '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        return lootIds.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4, padding: 4, border: '1px solid #222', borderRadius: 3, background: 'rgba(0,0,0,0.3)' }}>
            {lootIds.map(id => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(20,241,149,0.1)', border: '1px solid rgba(20,241,149,0.3)', borderRadius: 3, padding: '1px 4px', fontSize: 9, color: '#ccc' }}>
                {ITEM_NAMES[id] || `Item ${id}`}
                <button onClick={() => { const next = lootIds.filter(x => x !== id); set({ lootIds: next.length > 0 ? next.join(',') : '-1' }); }} style={{ background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
        ) : <div style={{ fontSize: 9, color: '#555', padding: '2px 0', fontStyle: 'italic' }}>No loot items — select NPCs to auto-fill</div>;
      })()}

      {/* Custom loot item adder — search by name, auto-resolves to ID */}
      <div style={{ marginTop: 2 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            style={{ ...S_INPUT, flex: 1, fontSize: 9 }}
            value={itemSearch ?? ''}
            onChange={e => { updateItemSearch(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter' && itemSuggestions.length > 0) addLootItem(itemSuggestions[0].id); }}
            placeholder="Add item by name (e.g. Steel Arrow)..."
          />
        </div>
        {itemSearch && itemSuggestions.length > 0 && (
          <div style={{ maxHeight: 80, overflowY: 'auto', border: '1px solid #222', borderRadius: 3, marginTop: 2, background: 'rgba(0,0,0,0.5)' }}>
            {itemSuggestions.slice(0, 8).map(s => (
              <div key={s.id} onClick={() => addLootItem(s.id)}
                style={{ padding: '2px 6px', fontSize: 9, color: '#ccc', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                {s.name} <span style={{ color: '#555' }}>({s.id})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
        <div style={{ flex: 1 }}>
          <Field label="Eat at HP %">
            <input style={S_INPUT} value={cfg.eatAtHp ?? ''} onChange={e => set({ eatAtHp: e.target.value })} placeholder="50 (% of max HP)" />
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
          <Field label="Melee switch weapon">
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button onClick={fetchWeapons} style={{ background: 'rgba(20,241,149,0.1)', border: '1px solid #333', color: '#14F195', fontSize: 8, cursor: 'pointer', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>↻ Detect</button>
              <select style={{ ...S_SELECT, flex: 1 }} value={cfg.switchId ?? '81'} onChange={e => set({ switchId: e.target.value })}>
                <option value="81">Rune 2H Sword (default)</option>
                {invWeapons.map(w => (
                  <option key={w.id} value={String(w.id)}>{w.name} ({w.id})</option>
                ))}
              </select>
            </div>
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
      <CheckRow label="Don't bank (power-mine)" checked={cfg.mineNoBank ?? false} onChange={v => set({ mineNoBank: v, ...(v ? { mineBankLocation: undefined } : {}) })} />
      {cfg.customCoords ? (
        <Field label="Bank Location (custom mine)">
          <select style={S_SELECT} value={cfg.mineBankLocation} onChange={e => set({ mineBankLocation: e.target.value })}>
            {BANK_LOCATIONS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      ) : (
        <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>
          Bank: auto-selected (closest to camp)
        </div>
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
  // v265: full engine — multi-select tree types (level-gated at start),
  // bank vs power-chop, auto or manual bank choice.
  return (
    <div style={S_PANEL}>
      <Field label="Tree Types">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TREE_TYPES.map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={cfg.treeTypes?.[t] ?? (t === 'Normal')}
                onChange={e => set({ treeTypes: { ...cfg.treeTypes, [t]: e.target.checked } })}
              />
              {t}
            </label>
          ))}
        </div>
      </Field>
      <ToggleRow label="Bank logs" checked={cfg.wcBank ?? true} onChange={v => set({ wcBank: v })} />
      {cfg.wcBank && (
        <Field label="Bank Destination">
          <select style={S_SELECT} value={cfg.bankDestination ?? 'Auto'} onChange={e => set({ bankDestination: e.target.value })}>
            <option value="Auto">Auto (nearest)</option>
            {WC_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      )}
      {!cfg.wcBank && (
        <div style={{ fontSize: 11, color: '#8a8f98', lineHeight: 1.5, padding: '2px 0' }}>
          Power-chop: drops logs when inventory fills. Bring an axe (inventory or wielded) — a sleeping bag is recommended.
        </div>
      )}
    </div>
  );
}

function FishingConfig({ cfg, set }: CfgProps) {
  // v280: multi-select fish types (miner-style). Engine unions selections:
  // level/tool/bait gate per type, live-scans all selected spot ids, deposits
  // the union of fish. Single fishType still honored (APOS presets use it).
  const toolHint: Record<string, string> = {
    'Shrimp & Anchovies': 'Net 376', 'Sardine & Herring': 'Rod 377 + Bait 380',
    'Trout & Salmon': 'Fly Rod 378 + Feathers 381', 'Pike': 'Rod 377 + Bait 380',
    'Lobster': 'Lobster Pot 375', 'Tuna & Swordfish': 'Harpoon 379',
    'Big Net': 'Big Net 548', 'Shark': 'Harpoon 379 (level 76)',
  };
  const sel = cfg.fishTypes ?? {};
  const anyBigNet = sel['Big Net'] ?? false;
  return (
    <div style={S_PANEL}>
      <Field label="Fish Types">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FISH_TYPES_UI.map(f => (
            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sel[f] ?? (f === 'Shrimp & Anchovies')}
                onChange={e => set({ fishTypes: { ...sel, [f]: e.target.checked } })}
              />
              {f}
            </label>
          ))}
        </div>
      </Field>
      <div style={{ fontSize: 11, color: '#8a8f98', lineHeight: 1.4, padding: '2px 0' }}>
        Bring: {FISH_TYPES_UI.filter(f => sel[f] ?? f === 'Shrimp & Anchovies').map(f => toolHint[f]).join(' · ')}
        {' '}(tools in inventory, not equipped)
      </div>
      <Field label="Location">
        <select style={S_SELECT} value={cfg.fishSite ?? 'Auto (nearest)'} onChange={e => set({ fishSite: e.target.value })}>
          {FISH_SITES_UI.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <ToggleRow label="Bank fish" checked={cfg.fishBank ?? true} onChange={v => set({ fishBank: v })} />
      {anyBigNet && (
        <ToggleRow label="Drop junk (boots/gloves/seaweed/oyster)" checked={cfg.fishDropJunk ?? true} onChange={v => set({ fishDropJunk: v })} />
      )}
      {!cfg.fishBank && (
        <div style={{ fontSize: 11, color: '#8a8f98', lineHeight: 1.5, padding: '2px 0' }}>
          Power-fish: drops fish when inventory fills. Bring tools + a sleeping bag.
        </div>
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
    case 'fishing':     return <FishingConfig cfg={cfg} set={set} />;
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
      // Combat tab: only AIO Fighter is needed now — it handles all NPCs
      if (activeTab === 'Combat') result = result.filter(s => s.id === 'AIOFighter');
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
