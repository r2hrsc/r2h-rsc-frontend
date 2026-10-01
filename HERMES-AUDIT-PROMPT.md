# Hermes prompt — RuneScape Classic outside-in audit (2026-10-01)

Paste everything below the line into Hermes.

---

I'm auditing my RuneScape Classic private server project for public-facing and
security flags. An outside reviewer swept the workspace and the live site today
(2026-10-01). Findings below are VERIFIED unless marked otherwise. You know this
workspace, the VPS and the deploy history intimately. I need you to (a) correct
anything wrong, and (b) answer the numbered questions, which are blocking fixes.

## VERIFIED FINDINGS

### Public surface

- `runescapeclassic.gold` resolves to `67.205.132.6` directly. Bare nginx/1.24.0,
  HTTP/1.1, no Cloudflare, no HSTS / X-Content-Type-Options / Referrer-Policy.
  `http://67.205.132.6/` returns 200 — origin IP directly reachable.
- `r2hrsc.xyz` IS behind Cloudflare (HTTP/2, CF headers, security headers present).
  `robinscape.xyz` resolves to 67.205.132.6. All three serve 200 right now.
- Live `/sitemap.xml` and `/robots.txt` on the .gold domain pointed only at
  `https://r2hrsc.xyz/`. (FIXED locally, not yet deployed.)
- `index.html` had no description / og:\* / twitter:card / canonical, so every
  link posted to X, Discord or Telegram rendered as a bare URL with no preview
  card. (FIXED locally, not yet deployed.)
- No X / Discord / Telegram links anywhere on the landing page.
- `https://discord.gg/r2hrsc` returns `{"message": "Unknown Invite", "code": 10006}`
  from the Discord API. It appears 4x in source — every "Join Discord" button on
  the site is dead. I need the real invite.
- `/logo.png` 404s into the SPA catch-all, so it returned `text/html` to wallet
  connect modals that requested it as the app icon. (FIXED locally — real PNG added.)
- `/vote` is linked twice as "Vote for Us" but has no route defined; the catch-all
  silently renders the landing page instead.
- Privacy policy text said the site is "robinscape.xyz". (FIXED locally.)
- Main JS chunk is 4.0 MB raw / 1.17 MB gzipped.

### Account model (sidecar `src/utils/username.ts`)

- `emailToRscUsername` = `"g_" + sha256(email)[0:10]` — **no secret**
- `walletToRscUsername` = `"s_" + sha256(wallet)[0:10]` — **no secret**
- `generateDeterministicPassword` = `HMAC-SHA256(PASSWORD_SECRET, externalId)`,
  hex, stripped, first 12 chars. **No per-user salt.**
- Therefore: anyone can compute any player's in-game username from their email or
  wallet address. `PASSWORD_SECRET` is a single master key to every account, and
  because passwords are deterministic they can never be rotated per-user.
- The frontend (`src/components/AccountCredentials.tsx`) displays username AND
  password with Copy buttons and the text "Your password never changes."

### Admin gate

- `src/components/Admin/AdManager.tsx` hardcoded an `ADMIN_PASSWORD` literal (value
  redacted here; it has since been rotated out of source into gitignored `.env`).
  Confirmed present in the LIVE production bundle; `/admin/ads` is publicly
  reachable and returns 200. Severity is limited because `adManager` is
  localStorage-only (a bypass edits only the attacker's own browser), but the
  password string is public and the gate becomes a real hole the moment ads move
  server-side — which the code comment says is the plan.

### Repo / workspace

- `robinscape-build` git: ~10 modified files and 13 untracked paths before this
  audit. `src/lib/worlds.ts` and `src/components/PreAuthWorldPicker.tsx` are real
  source and are not in git at all.
- 24 GB workspace, 33 backup dirs, 37 `.bak` files, 20 `node_modules` trees.
- Four near-identical OpenRSC server trees under `multiworld/`:
  `w1-pristine-build`, `w1-c4-build`, `phase2-build/server`, `phase2-build/server.orig`.
- `DEPLOY.md` describes Cloudflare Pages auto-building from GitHub
  `r2hrsc/r2h-rsc-frontend` on `main` with VITE\_\* vars in the Pages dashboard.
  This does NOT match a bare-nginx .gold origin. It also references a path that
  no longer exists (`hermes-workspace/r2h-frontend`), gives `VITE_CACHE_CDN_URL`
  as `cache.r2hrsc.xyz` while `.env` says `game.r2hrsc.xyz/rsc-client/`, and
  contains an nginx block for `game.r2hrsc.xyz` that uses the
  `/etc/letsencrypt/live/game.fuzzynuts.xyz/` certificate.
- 4 pre-existing TypeScript errors in `src/components/GameClient/BotPanel.tsx`
  (`contentWindow` on `Element`). `npm run build` does not run `tsc`, so they
  never block a deploy.

## RETRACTED (do not act on)

An earlier draft claimed `dist` accumulates stale bundles across builds (267
files, 17 `index-*.js`). That was WRONG. A controlled rebuild showed Vite empties
`dist` every time: 201 filenames replaced, 66 shared, total unchanged at 267. The
17 `index-*.js` files are legitimate per-package chunks from one build.

## QUESTIONS BLOCKING THE FIXES

1. **Deploy pipeline** — how is `runescapeclassic.gold` actually deployed today?
   Cloudflare Pages, or rsync/scp to nginx on the VPS? Is the Pages project still
   building from GitHub? Is `r2hrsc/r2h-rsc-frontend` still the source of truth or
   has local drifted ahead permanently?
2. **Deploy mechanism** — exact command. If rsync, does it use `--delete`? I need
   to know whether a rebuilt `dist` cleanly replaces what's on the server.
3. **Canonical domain** — is .gold now the one true domain? What happens to
   `r2hrsc.xyz` and `robinscape.xyz` — 301 or leave up? Do current players have
   the old domains bookmarked or pinned in Discord? (This gates when I can drop
   the legacy origins from the game iframe's postMessage allow-list.)
4. **Cloudflare** — is .gold deliberately NOT behind CF? (nameservers elsewhere,
   WebSocket proxy concerns, cost?) Any reason not to put it behind CF the way
   `r2hrsc.xyz` is?
5. **Bots + auth** — do `r2h-bots`, `arena-bots` and `crimsonvex` authenticate via
   `generateDeterministicPassword` / the sidecar? If I add a per-user salt or a
   rotation path, what breaks? Does the phase3 `account-server-mysql-flag` path
   share the same derivation?
6. **PASSWORD_SECRET** — where does it live, is it backed up off the VPS, and has
   it ever been pasted into a repo, log, chat or deploy script? If rotated, is
   there a migration path (re-derive on next login) or does every account break
   at once?
7. **Login rate limiting** — does the live RSC login have any rate limit or
   lockout? A 12-char hex password is ~2^48; that only matters if online guessing
   is cheap.
8. **Discord + Telegram** — exact invite URLs. The one in the code is dead.
   Discord invite should be set to "Expire after: Never".
9. **`ads@r2hrsc.xyz`** — is that mailbox still live? It's the only contact on the
   media kit. I deliberately did NOT change it, because moving it to .gold would
   break ad enquiries if .gold has no mail configured.
10. **`/vote`** — what is the real destination? A server-list URL, or a route that
    was never built?
11. **Brand art** — is `hermes-workspace/rune-banner.png` (1500x500) current? I
    used it as the og:image placeholder but 1200x630 is the correct ratio; 3:1
    gets cropped on Discord and X.
12. **Server trees** — which of the four `multiworld/` OpenRSC trees matches what
    is actually running on the VPS right now?

Answer directly. Where I'm wrong, say so and give the correction with evidence.
