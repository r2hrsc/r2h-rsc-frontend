// ── Site identity ──────────────────────────────────────────────────────────
// Single source of truth for the PUBLIC SITE origin. Backend hosts
// (api./game./sidecar.r2hrsc.xyz) are deliberately NOT in here — those are
// live services on a separate domain and moving them is a DNS/ops change,
// not a find-and-replace.
//
// 2026-10-01: the public domain is runescapeclassic.gold. The old origins are
// still serving 200, so LEGACY_ORIGINS stays populated until 301 redirects are
// in place — dropping them early would break the game iframe's postMessage
// guard for anyone still arriving on an old bookmark.

export const SITE_ORIGIN = "https://runescapeclassic.gold";
export const SITE_NAME = "RuneScape Classic";

/** Absolute URL for a path on the public site. */
export const siteUrl = (path = "/") =>
  `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;

/** Square-ish logo used by wallet connect modals. Must be a real raster file —
 *  the SPA catch-all returns index.html for anything missing, so a 404 here
 *  silently feeds HTML to wallets instead of an image. */
export const SITE_LOGO = siteUrl("/logo.png");

/** Previous public origins, kept only for the postMessage allow-list. */
export const LEGACY_ORIGINS = [
  "https://r2hrsc.xyz",
  "https://www.r2hrsc.xyz",
  "https://robinscape.xyz",
  "https://www.robinscape.xyz",
] as const;

// ── Community links ────────────────────────────────────────────────────────
// 2026-10-01, measured against the live Discord API.
//
// NAME ORIGIN, corrected: "R2H" = **Runite two-handed sword**. An earlier audit
//   pass asserted it stood for "Roll2Heal" and that the founder ran that
//   nonprofit. Both claims were FALSE — a coincidence pattern-matched into an
//   origin story. Do not reintroduce it.
//
// DISCORD: `discord.gg/r2hrsc` is dead ("Unknown Invite"). `discord.gg/r2h` is
//   also NOT ours — it belongs to Roll2Heal, an unrelated third-party 501(c)(3)
//   for veterans and first responders. Never link players there.
//   Ours is the guild "RuneScape Classic Gold" (below).
//
//   ⚠️ EXPIRY: this invite is dated and expires **2026-10-24 20:43 UTC**. When it
//   lapses every "Join Discord" link on the site dies, exactly as the last one
//   did. Replace it with a permanent invite: Server Settings → Invites →
//   "Expire after: Never", then update this constant.
//
// TELEGRAM: no Telegram has ever existed. A July session mistakenly pasted the
//   Discord URL into a Telegram field. Ship this EMPTY rather than wrong —
//   render the link only when the value is non-empty.
//
// X: @runeclassicgp is current. The July-era x.com/r2hrsc is obsolete.
// Explicitly typed `string`, not the inferred literal, so `hasDiscord` below stays
// a real runtime guard — TS otherwise narrows this to its literal type and flags
// the `!== ""` check as impossible, which breaks the moment it is emptied again.
export const DISCORD_URL: string = "https://discord.gg/Nu6Df6emP"; // EXPIRES 2026-10-24
export const TELEGRAM_URL = ""; // none exists
export const X_URL = "https://x.com/runeclassicgp";

/** True only when a live Discord invite is configured. Guard every Discord
 *  link with this — an empty href renders as a link to the current page,
 *  which is worse than showing nothing. */
export const hasDiscord = DISCORD_URL !== "";

/** The contact/community link that is always valid today. */
export const CONTACT_URL = hasDiscord ? DISCORD_URL : X_URL;
export const CONTACT_LABEL = hasDiscord
  ? "Discord community"
  : "X (@runeclassicgp)";
