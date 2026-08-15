# R2H Bot Engine APOS API Mapping

## TeaVM Obfuscated Field Names (probe-verified Jul 28 2026)

### MC Object Fields
| Obfuscated | Java Name | Type | Notes |
|---|---|---|---|
| mc.bz | knownNPCs[500] | GameCharacter[] | All known NPCs (may be stale) |
| mc.b0 | NPCs rendering array | GameCharacter[] | Currently visible NPCs (use this!) |
| mc.du | regionX | int | Region base X (e.g. 96) |
| mc.dd | regionY | int | Region base Y (e.g. 576) |
| mc.L | magicLoc | int | Tile-to-pixel multiplier (128) |
| mc.c | packet stream | DP/E4 object | Has bX (buffer), dD (connection) |
| mc.gu | npcCount | int | Can be stale |
| mc.ey | camera angle | int | NOT player position! |

### NPC Object Fields (GameCharacter)
| Obfuscated | Java Name | Type |
|---|---|---|
| npc.ea | serverIndex/pid | int |
| npc.eu | npcTypeId/appearanceId | int (3=chicken, loads async) |
| npc.F | currentX (pixel) | int |
| npc.E | currentY (pixel) | int |
| npc.sV | active/visible flag | int (1=visible) |

### TeaVM Exposed Functions
| Exposed As | TeaVM Name | Java Equivalent |
|---|---|---|
| __r2h_W | W(stream, opcode, type) | newPacket(opcode) |
| __r2h_Z | Z(stream, value) | putShort(value) |
| __r2h_BO | BO(stream, value) | putByte(value) |
| __r2h_Y | Y(stream) | finishPacket() |
| __r2h_Ft | Ft(stream) | finishPacket() + flushPacket() |
| __r2h_Hx | Hx(stream, b) | flushPacket(force) |
| __r2h_I9 | I9(mc, menuIdx) | method_131 — action handler |
| __r2h_Dg | Dg(mc, bJ, bK, x, y, flag) | method_98 — walk to position |

## I9 Action Codes (bn array values)
| Code | Action | Menu Arrays Needed |
|---|---|---|
| 200 | Object command 1 (mine/chop/fish) | c0,c1=pixel pos |
| 210 | Object command 2 (prospect) | c0,c1=pixel pos |
| 300 | Wall object command 1 (door) | c0,c1=pixel pos |
| 310 | Wall object command 2 | c0,c1=pixel pos |
| 400 | Ground item use | c0,c1=pos, bQ=itemId |
| 600 | NPC talk to | bQ=serverIdx |
| 610 | NPC 2nd option (pickpocket) | bQ=serverIdx |
| 640 | Item drop | eX=slot |
| 650 | Item select for use | eX=slot |
| 660 | Item drop confirm | eX=slot |
| 700 | Player attack | bQ=serverIdx |
| 710 | NPC cast spell | bQ=serverIdx |
| 715 | NPC attack | bQ=serverIdx, c0,c1=pixel pos |
| 720 | NPC command (trade) | bQ=serverIdx |
| 725 | NPC 3rd command | bQ=serverIdx |
| 800 | Player cast spell | bQ=serverIdx |
| 900 | Item command (eat/bury/use) | eX=slot |
| 920 | Item wear/wield | eX=slot |
| 1000 | Item use on X | eX=slot |

## I9 Menu Array Fields (on mc)
| Field | Purpose |
|---|---|
| mc.c0.data[idx] | Pixel X of target |
| mc.c1.data[idx] | Pixel Y of target |
| mc.bQ.data[idx] | Server index or item ID |
| mc.eX.data[idx] | Inventory slot (-1 if none) |
| mc.oM.data[idx] | Opcode/flag (usually 0) |
| mc.bn.data[idx] | Action code |

## Java Field Names (from mudclient.java, NOT yet mapped to TeaVM)
- inventoryItemId[30], inventoryItemStack[30]
- playerStatBase[18], playerStatCurrent[18]
- groundItemX[], groundItemY[], groundItemId[], groundItemCount
- gameObjectInstanceCount, gameObjectInstanceID[], gameObjectInstanceX[], gameObjectInstanceZ[]
- wallObjectInstanceCount, wallObjectInstanceX[], wallObjectInstanceZ[], wallObjectInstanceDir[]
- showDialogBank (boolean), showDialogShop (boolean)
- combatStyle (int 0-3), fatigue, fatigueSleeping
- tradeRecipientName, tradeRecipientAccepted
- selectedItemInventoryIndex
- serverMessage
- shopItemCount[], shopCategoryID[], shopItemPrice[]

## Key Rule
ALL game actions MUST go through I9(mc, menuIdx). Manual W/Z/Y packets
fail for attack (opcode/ISAAC issue). I9 uses the game's own code path
which handles everything correctly.
