// src/routes/arena.ts
// GET /v1/arena/bots — live positions of the arena bot fleet for the in-game
// bot pointer (arena /game/ page, world 2 only). Read-only against arena.db
// (the SAME read-only rules as every other game-DB reader: better-sqlite3
// readonly:true, mode=ro URI — this file NEVER writes any database).
//
// Bot identity: the 70-name roster at /opt/openrsc/arena-bots/arena-roster.json
// (same source the earn engine uses via loadBotNames — see earn/routes.ts).
// Response is filtered to roster names so we never leak a random player's
// position, and carries only what the pointer needs: name, x, y, combat.
//
// Caching: 3s TTL — the pointer polls every 5s per client; one DB read every
// 3s regardless of player count. Rate limit inherited from the global config.
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

const ARENA_DB_PATH =
  process.env.ARENA_DB_PATH || "/opt/openrsc/arena/inc/sqlite/arena.db";
const ROSTER_PATH =
  process.env.ARENA_BOT_ROSTER_PATH || "/opt/openrsc/arena-bots/arena-roster.json";

// Lazy singletons: the DB handle and the roster are read once per process.
let rosterLower: Set<string> | null = null;
let db: Database.Database | null = null;

function getRoster(): Set<string> {
  if (rosterLower) return rosterLower;
  try {
    const roster = JSON.parse(readFileSync(ROSTER_PATH, "utf8"));
    rosterLower = new Set(
      (roster as Array<{ username: string }>)
        .map((b) => String(b.username).toLowerCase()),
    );
  } catch {
    rosterLower = new Set(); // empty = endpoint returns empty list, fail-safe
  }
  return rosterLower;
}

function getDb(): Database.Database | null {
  if (db) return db;
  try {
    db = new Database(ARENA_DB_PATH, { readonly: true, fileMustExist: true });
  } catch {
    db = null; // arena down / moved: serve the cache until it returns
  }
  return db;
}

let cache: { ts: number; data: object } | null = null;
const CACHE_MS = 3000;

export function registerArenaRoutes(app: FastifyInstance) {
  app.get("/v1/arena/bots", async () => {
    const now = Date.now();
    if (cache && now - cache.ts < CACHE_MS) {
      return cache.data;
    }
    const roster = getRoster();
    const handle = getDb();
    let bots: Array<{ n: string; x: number; y: number; cb: number }> = [];
    if (handle && roster.size > 0) {
      // One pass over ONLINE players; roster filter in JS (70 names, trivial).
      // LOWER(username) because roster names are stored lowercase.
      const rows = handle
        .prepare(
          "SELECT username, x, y, combat FROM players WHERE online = 1",
        )
        .all() as Array<{ username: string; x: number; y: number; combat: number | string }>;
      for (const r of rows) {
        if (!roster.has(String(r.username).toLowerCase())) continue;
        const x = Number(r.x), y = Number(r.y), cb = Number(r.combat);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        bots.push({ n: String(r.username), x, y, cb: Number.isFinite(cb) ? cb : 0 });
      }
    }
    const data = { ts: now, count: bots.length, bots };
    cache = { ts: now, data };
    return data;
  });
}
