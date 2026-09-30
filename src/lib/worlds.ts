// src/lib/worlds.ts — shared world definitions for the multiworld picker.
// Server-side contract (authoritative, from the Phase 4 coordination file,
// [CLAUDE] 2026-09-30): worlds 1,3,4,5,6,7 share MariaDB openrsc_main; the PVP
// Arena is a separate realm (its own DB, own credentials mirror).
// Ports and endpoints are HARDCODED literals — never construct these paths from
// user input (nginx has a catch-all; /world9/ would silently proxy to world 1).

export type WorldKey = 1 | 3 | 4 | 5 | 6 | 7 | 'arena';

export interface WorldDef {
  key: WorldKey;
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
  { key: 1,      port: 43594, members: true,  label: 'World 1 · Main',    loading: 'Entering World 1...' },
  { key: 3,      port: 43596, members: false, label: 'World 3 · Free',    loading: 'Entering World 3...' },
  { key: 4,      port: 43597, members: false, label: 'World 4 · Free',    loading: 'Entering World 4...' },
  { key: 5,      port: 43598, members: true,  label: 'World 5 · Members', loading: 'Entering World 5...' },
  { key: 6,      port: 43599, members: true,  label: 'World 6 · Members', loading: 'Entering World 6...' },
  { key: 7,      port: 43600, members: true,  label: 'World 7 · Members', loading: 'Entering World 7...' },
  { key: 'arena', port: 43595, members: true, label: 'PVP Arena',         loading: 'Entering PVP Arena...', isArena: true },
] as const;

export function worldDef(key: WorldKey): WorldDef {
  const d = WORLDS.find(w => w.key === key);
  if (!d) throw new Error(`unknown world key: ${key}`);
  return d;
}
