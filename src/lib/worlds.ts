// src/lib/worlds.ts — shared world definitions for the multiworld picker.
// Server-side contract (authoritative, from the Phase 4 coordination file,
// [CLAUDE] 2026-09-30): worlds 1,3,4,5,6,7 share MariaDB openrsc_main; the PVP
// Arena is a separate realm (its own DB, own credentials mirror).
// Ports and endpoints are HARDCODED literals — never construct these paths from
// user input (nginx has a catch-all; /world9/ would silently proxy to world 1).

export type WorldKey = 1 | 3 | 4 | 5 | 6 | 7 | 'arena';

export interface WorldDef {
  /** REAL server world number. Drives the port and everything the game server
   *  knows. Never renumber this — only `display` below is cosmetic. */
  key: WorldKey;
  /** What players are shown. Deliberately NOT the same as `key`: world 2 is the
   *  PVP Arena (port 43595), which players see as "A1" instead, so the normal
   *  worlds are presented as an unbroken W1..W6 run (founder decision,
   *  2026-10-01). Mapping: W1→1, W2→3, W3→4, W4→5, W5→6, W6→7, A1→arena.
   *  Support note: a player saying "W4" means SERVER WORLD 5. Each tile carries
   *  its real world number in its tooltip. */
  display: string;
  /** Internal server port — goes into the iframe hash; the /game/ shim maps it
   *  to the public wss endpoint. Literal, never derived. */
  port: 43594 | 43595 | 43596 | 43597 | 43598 | 43599 | 43600;
  /** First hash token: 'members' sets the client's members flag (classes.js
   *  compares arg0 against the literal "members"); 'free' leaves it unset. */
  members: boolean;
  /** Short label in the switch menu. */
  label: string;
  /** Loading-screen text while entering. */
  loading: string;
  /** True for the PVP Arena (separate realm, confirm dialog, beta pill). */
  isArena?: boolean;
}

export const WORLDS: readonly WorldDef[] = [
  { key: 1,      display: 'W1', port: 43594, members: true,  label: 'World 1 · Main',         loading: 'Entering World 1...' },
  { key: 3,      display: 'W2', port: 43596, members: false, label: 'World 2 · F2P Version',  loading: 'Entering World 2...' },
  { key: 4,      display: 'W3', port: 43597, members: false, label: 'World 3 · F2P Version',  loading: 'Entering World 3...' },
  { key: 5,      display: 'W4', port: 43598, members: true,  label: 'World 4 · Members',      loading: 'Entering World 4...' },
  { key: 6,      display: 'W5', port: 43599, members: true,  label: 'World 5 · Members',      loading: 'Entering World 5...' },
  { key: 7,      display: 'W6', port: 43600, members: true,  label: 'World 6 · Members',      loading: 'Entering World 6...' },
  { key: 'arena', display: 'A1', port: 43595, members: true, label: 'A1 · PVP Arena',         loading: 'Entering the PVP Arena...', isArena: true },
] as const;

/** Display label ("W2", "A1") for a real server world number. Used by the
 *  landing page so the online breakdown speaks the same numbers as the tiles. */
export function displayForWorldNumber(n: number): string {
  return WORLDS.find(w => w.key === n)?.display ?? `World ${n}`;
}

export function worldDef(key: WorldKey): WorldDef {
  const d = WORLDS.find(w => w.key === key);
  if (!d) throw new Error(`unknown world key: ${key}`);
  return d;
}
