// ── Referral helpers (front page + in-game INVITE panel) ─────────────────
// Read-only against the sidecar:
//   GET /v1/referral/stats/:username   public, counts only (total, qualified)
//   GET /v1/referral/me                 Bearer access token → claimed flags too
// The access token is returned by /auth/google, /auth/wallet and
// /auth/register-username (1 h lifetime). We keep it in localStorage under
// 'r2h_access_token' and only ever use it for the SAME username it was issued
// for; if it is missing, expired or for someone else, the panel falls back to
// the public counts. Nothing here touches the game client.
import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

/** Links always point at the main domain, whichever domain the player is on. */
export const REFERRAL_BASE = 'https://runescapeclassic.gold';

/** Milestones — must match sidecar packs.ts MILESTONES (noob 3, pro 5, king 10). */
export const MILESTONES = [
  { key: 'noob', name: 'Noob pack', need: 3, cmd: '::noobpack' },
  { key: 'pro', name: 'Pro pack', need: 5, cmd: '::propack' },
  { key: 'king', name: 'King pack', need: 10, cmd: '::kingpack' },
] as const;
export type MilestoneKey = typeof MILESTONES[number]['key'];

const TOKEN_KEY = 'r2h_access_token';
const CODE_RE = /^[a-z0-9]{1,12}$/;

/** Same rule as ::refcode in ReferralClaim.java: lowercase a-z0-9, max 12. */
export function referralCodeFor(username: string | null | undefined): string | null {
  if (!username) return null;
  const code = username.trim().toLowerCase();
  return CODE_RE.test(code) ? code : null;
}

export function referralLinkFor(username: string | null | undefined): string | null {
  const code = referralCodeFor(username);
  return code ? `${REFERRAL_BASE}/?ref=${code}` : null;
}

/** Who invited this browser: ?ref= in the URL first, then the saved r2h_ref (< 7 days). */
export function readInviter(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ref')?.trim().toLowerCase();
    if (fromUrl && CODE_RE.test(fromUrl)) return fromUrl;
    const raw = localStorage.getItem('r2h_ref');
    if (!raw) return null;
    const { code, ts } = JSON.parse(raw);
    const ageDays = (Date.now() - Number(ts)) / 86_400_000;
    return typeof code === 'string' && CODE_RE.test(code) && ageDays < 7 ? code : null;
  } catch {
    return null;
  }
}

// ── access token (optional extra: claimed flags) ──

export function saveAccessToken(token: unknown): void {
  try {
    if (typeof token === 'string' && token.split('.').length === 3) localStorage.setItem(TOKEN_KEY, token);
  } catch { /* storage blocked — panel still works with public counts */ }
}

/** The stored access token, or null. Exported because the payout-wallet
 *  linking flow must authenticate as the signed-in player. */
export function readAccessToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function clearAccessToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function decodeJwtPayload(token: string): { username?: string; exp?: number } | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/** The stored token, but only if it belongs to `username` and has not expired. */
function tokenFor(username: string): string | null {
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { return null; }
  if (!token) return null;
  const p = decodeJwtPayload(token);
  if (!p || typeof p.username !== 'string') return null;
  if (p.username.toLowerCase() !== username.toLowerCase()) return null;
  if (typeof p.exp === 'number' && p.exp * 1000 < Date.now() + 5_000) return null;
  return token;
}

// ── stats hook ──

export interface ReferralView {
  loaded: boolean;
  failed: boolean;
  total: number;
  qualified: number;
  /** null when we could not ask the authed endpoint (claimed status unknown). */
  claimed: Record<MilestoneKey, boolean> | null;
}

const EMPTY: ReferralView = { loaded: false, failed: false, total: 0, qualified: 0, claimed: null };

/** Polls every 60 s while `active`. Never throws; failures just keep the last value. */
export function useReferralStats(username: string | null, active: boolean): ReferralView {
  const [view, setView] = useState<ReferralView>(EMPTY);

  useEffect(() => { setView(EMPTY); }, [username]);

  useEffect(() => {
    if (!username || !active) return;
    let alive = true;

    const load = async () => {
      const token = tokenFor(username);
      if (token) {
        try {
          const res = await fetch(`${API_URL}/v1/referral/me`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.status === 401) clearAccessToken();
          if (res.ok) {
            const j = await res.json();
            const s = j?.stats;
            if (j?.ok && s && typeof s.total === 'number') {
              if (alive) setView({
                loaded: true, failed: false, total: s.total, qualified: s.qualified,
                claimed: { noob: !!s.noobClaimed, pro: !!s.proClaimed, king: !!s.kingClaimed },
              });
              return;
            }
          }
        } catch { /* fall through to public counts */ }
      }
      try {
        const res = await fetch(`${API_URL}/v1/referral/stats/${encodeURIComponent(username)}`);
        const j = res.ok ? await res.json() : null;
        if (!alive) return;
        if (j?.ok && typeof j.total === 'number') {
          setView(v => ({ loaded: true, failed: false, total: j.total, qualified: j.qualified, claimed: v.claimed }));
        } else {
          setView(v => (v.loaded ? v : { ...v, failed: true }));
        }
      } catch {
        if (alive) setView(v => (v.loaded ? v : { ...v, failed: true }));
      }
    };

    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [username, active]);

  return view;
}

/** Clipboard with a fallback for wallet in-app browsers that block the async API. */
export async function copyText(text: string, fallbackInput?: HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* try fallback */ }
  try {
    const el = fallbackInput ?? Object.assign(document.createElement('textarea'), { value: text });
    if (!fallbackInput) {
      (el as HTMLTextAreaElement).style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(el);
    }
    el.focus();
    el.select();
    el.setSelectionRange?.(0, text.length);
    const ok = document.execCommand('copy');
    if (!fallbackInput) document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function shareText(link: string): string {
  return `Play Runescape Classic free in your browser. Sign up with my link and get a free Starter pack: ${link}`;
}

/** Injects a <style> block once (keeps the main CSS bundle — and its nginx cache-bump — byte-identical). */
export function injectStyleOnce(id: string, css: string): void {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/** Loads the landing/invite fonts once (Cinzel display, Manrope body). */
export function injectFontsOnce(): void {
  if (typeof document === 'undefined' || document.getElementById('r2h-fonts-v2')) return;
  const link = document.createElement('link');
  link.id = 'r2h-fonts-v2';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Manrope:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
}
