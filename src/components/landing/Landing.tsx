import { useEffect, useRef, useState, type ReactNode } from 'react';
import { injectFontsOnce, injectStyleOnce, readInviter } from '../../lib/referral';
import { displayForWorldNumber } from '../../lib/worlds';

// ── Front page (signed-out screen) ───────────────────────────────────────
// Pure presentation. AuthOverlay owns every sign-in handler and passes the
// real Google button + wallet callback in. The page is a position:fixed,
// full-viewport, self-scrolling layer at the SAME z-index the old auth card
// used (1039), so everything that stacked above/below the old card still
// does. The game iframe keeps loading underneath exactly as before.
// Styles are injected at runtime (not in the CSS bundle) so the deployed CSS
// file and its nginx cache-bump stay byte-identical.

/** Drop a screenshot in /public and set its path here, e.g. '/img/hero.jpg'. */
const HERO_IMAGE: string | null = null;

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

// --- $RUNE token identity -----------------------------------------------------
// The contract address is the one string on this site where a single wrong
// character costs a visitor real money. It is written here EXACTLY ONCE; the
// truncated label and both outbound links are all derived from this constant,
// so there is no second copy that can drift out of sync with it.
const TOKEN_MINT = 'B4cqDdBWDf6hgy1rma8u4JpoTnoycDQyg33aR48mfFvE';
const TOKEN_TICKER = 'RUNE';
// Token-level DexScreener URL: resolves to whichever pool holds the real
// liquidity, so it keeps working if the market ever migrates.
const DEXSCREENER_URL = `https://dexscreener.com/solana/${TOKEN_MINT}`;
const GRANDEXCHANGE_URL = `https://grandexchange.gold/item/${TOKEN_MINT}`;
const TOKEN_MINT_SHORT = `${TOKEN_MINT.slice(0, 4)}…${TOKEN_MINT.slice(-4)}`;

const CSS = `
.lp{position:fixed;inset:0;z-index:1039;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#0A0C0B;color:#ECEFEC;font-family:Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
.lp *{box-sizing:border-box}
.lp a{color:inherit;text-decoration:none}
.lp-wrap{width:100%;max-width:1200px;margin:0 auto;padding:0 32px}
.lp-nav{position:sticky;top:0;z-index:2;background:rgba(10,12,11,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid #1C2320}
.lp-nav .lp-wrap{height:68px;display:flex;align-items:center;gap:36px}
.lp-logo{display:flex;align-items:center;gap:11px;font-family:Cinzel,Georgia,serif;font-weight:700;font-size:17px;letter-spacing:2.4px;color:#F4F1E8;white-space:nowrap;background:none;border:none;cursor:pointer;padding:0}
.lp-links{display:flex;gap:28px;font-size:14px;font-weight:500}
.lp-links button,.lp-links a{background:none;border:none;padding:0;font:inherit;color:#A2ABA5;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap}
.lp-links button:hover,.lp-links a:hover{color:#F4F1E8}
.lp-online{margin-left:auto;display:flex;align-items:center;gap:8px;height:32px;padding:0 14px;border:1px solid #1C2320;border-radius:999px;background:#0F1311;font-size:13px;color:#A2ABA5;white-space:nowrap}
.lp-online b{color:#ECEFEC;font-weight:600}
.lp-dot{width:8px;height:8px;border-radius:50%;background:#14F195;box-shadow:0 0 0 3px rgba(20,241,149,.15)}
.lp-hero{padding-top:96px;padding-bottom:88px;text-align:center;display:flex;flex-direction:column;align-items:center}
.lp-eyebrow{font-size:12.5px;font-weight:700;letter-spacing:2.2px;color:#E3B55A}
.lp-h1{margin:20px 0 0;font-family:Cinzel,Georgia,serif;font-weight:700;font-size:64px;line-height:1.06;letter-spacing:.4px;color:#F4F1E8;max-width:860px}
.lp-lead{margin:22px 0 0;font-size:18px;line-height:1.6;color:#A2ABA5;max-width:560px}
.lp-invited{margin-top:28px;display:flex;gap:12px;align-items:center;text-align:left;padding:13px 16px;border:1px solid #5A4520;border-radius:12px;background:#16120A;font-size:14px;line-height:1.5;color:#E9DDC2;max-width:560px}
.lp-invited b{color:#F1CB7E}
.lp-invited svg{flex-shrink:0}
.lp-mono{font-family:'JetBrains Mono',ui-monospace,monospace;color:#F1CB7E}
.lp-cta{margin-top:32px;display:flex;gap:12px;align-items:center;justify-content:center}
.lp-google{min-height:44px;display:flex;align-items:center;justify-content:center}
.lp-wallet{height:44px;min-width:220px;padding:0 20px;border:1px solid #2E3833;border-radius:6px;background:#111513;color:#ECEFEC;font-family:inherit;font-size:14.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;touch-action:manipulation}
.lp-wallet:hover{border-color:#4A5750;background:#151A17}
.lp-hint{margin-top:16px;font-size:13px;color:#7E8781}
.lp-error{margin-top:16px;font-size:13.5px;color:#FF6B6B;max-width:520px}
.lp-shot{margin-top:56px;width:100%;max-width:1000px;border:1px solid #2A332E;border-radius:14px;overflow:hidden;background:#0F1311}
.lp-shot img{display:block;width:100%;height:auto}
.lp-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;padding-bottom:88px}
.lp-card{padding:28px;border:1px solid #1C2320;border-radius:14px;background:#0F1311;display:flex;flex-direction:column;gap:12px}
.lp-card h3{margin:0;font-size:18px;font-weight:700;color:#F4F1E8;display:flex;align-items:center;gap:10px}
.lp-card p{margin:0;font-size:15px;line-height:1.6;color:#A2ABA5}
.lp-beta{font-size:10.5px;font-weight:700;letter-spacing:1px;padding:3px 7px;border-radius:5px;border:1px solid #2E3833;color:#A2ABA5}
.lp-ref{padding:56px;border:1px solid #2A2418;border-radius:20px;background:#0E0D0A;display:flex;flex-direction:column;gap:32px}
.lp-ref-top{display:flex;align-items:flex-end;gap:40px}
.lp-ref-top>div{display:flex;flex-direction:column;gap:12px;max-width:640px}
.lp-h2{margin:0;font-family:Cinzel,Georgia,serif;font-weight:700;font-size:40px;line-height:1.15;color:#F4F1E8}
.lp-ref-top p{margin:0;font-size:16px;line-height:1.6;color:#A2ABA5}
.lp-gold{margin-left:auto;flex-shrink:0;height:48px;padding:0 24px;border:none;border-radius:10px;background:#E3B55A;color:#1A1306;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer}
.lp-gold:hover{background:#EDC473}
.lp-packs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.lp-pack{padding:24px;border-radius:14px;border:1px solid #1C2320;background:#0F1311;display:flex;flex-direction:column;gap:10px}
.lp-pack.friend{border-color:#5A4520;background:#16120A}
.lp-req{font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:#A2ABA5}
.lp-pack.friend .lp-req{color:#E3B55A}
.lp-pack h3{margin:0;font-family:Cinzel,Georgia,serif;font-size:22px;font-weight:700;color:#F4F1E8}
.lp-pack p{margin:0;font-size:14px;line-height:1.6;color:#A2ABA5;flex-grow:1}
.lp-cmd{align-self:flex-start;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;padding:6px 10px;border-radius:6px;background:#0A0C0B;border:1px solid #1C2320;color:#F1CB7E}
.lp-small{font-size:13px;color:#7E8781;line-height:1.6}
.lp-foot{margin-top:96px;border-top:1px solid #1C2320}
.lp-foot .lp-wrap{min-height:88px;display:flex;align-items:center;gap:28px;font-size:13px;color:#7E8781;flex-wrap:wrap;padding-top:20px;padding-bottom:20px}
.lp-foot nav{margin-left:auto;display:flex;gap:24px}
.lp-foot a:hover{color:#ECEFEC}
@media (max-width:900px){
  .lp-links{display:none}
  .lp-features{grid-template-columns:1fr;gap:12px;padding-bottom:56px}
  .lp-packs{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .lp-ref{padding:32px 24px}
  .lp-ref-top{flex-direction:column;align-items:stretch;gap:20px}
  .lp-gold{margin-left:0}
}
@media (max-width:600px){
  .lp-wrap{padding-left:20px;padding-right:20px}
  .lp-nav .lp-wrap{height:58px}
  .lp-logo{font-size:14px;letter-spacing:1.8px}
  .lp-online{height:28px;padding:0 10px;font-size:12px}
  .lp-hero{padding-top:48px;padding-bottom:48px;align-items:stretch;text-align:left}
  .lp-h1{font-size:38px;line-height:1.1}
  .lp-lead{font-size:16px}
  .lp-cta{flex-direction:column;align-items:stretch}
  .lp-wallet{width:100%;max-width:300px;height:44px;align-self:center}
  .lp-hint{text-align:center}
  .lp-card{padding:20px}
  .lp-card p{font-size:14px}
  .lp-h2{font-size:28px}
  .lp-pack{padding:14px;gap:6px}
  .lp-pack h3{font-size:17px}
  .lp-pack p{display:none}
  .lp-req{font-size:10.5px}
  .lp-foot{margin-top:48px}
  .lp-foot nav{margin-left:0;flex-wrap:wrap;gap:18px}
}
.lp-ca{margin-left:auto;display:flex;align-items:center;gap:1px;height:32px;padding:0 3px;border:1px solid #1C2320;border-radius:999px;background:#0F1311;white-space:nowrap}
/* .lp-ca takes over the auto margin that used to push .lp-online to the right */
.lp-ca ~ .lp-online{margin-left:0}
.lp-ca-link{display:flex;align-items:center;gap:7px;height:26px;padding:0 9px;border-radius:999px;font-size:12.5px}
.lp-ca-link:hover{background:#171D1A}
.lp-ca-tick{font-weight:700;color:#E3B55A;letter-spacing:.5px}
.lp-ca-mint{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#A2ABA5}
.lp-ca-link:hover .lp-ca-mint{color:#ECEFEC}
.lp-ca-copy{display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:50%;background:none;color:#7E8781;cursor:pointer}
.lp-ca-copy:hover{background:#171D1A;color:#ECEFEC}
.lp-ca-copy[data-copied="true"]{color:#14F195}
.lp-ca-rank{display:flex;align-items:center;height:26px;padding:0 10px 0 9px;font-size:12.5px;font-weight:600;color:#ECEFEC;border-left:1px solid #1C2320;border-radius:0 999px 999px 0}
.lp-ca-rank:hover{color:#E3B55A;background:#171D1A}
.lp-ca-rank-of{font-weight:400;color:#7E8781}
@media (min-width:901px) and (max-width:1100px){
  /* Links are still visible here and the bar is tight: drop the address text
     but keep the ticker, the copy button and the rank. */
  .lp-ca-mint{display:none}
}
@media (max-width:600px){
  /* The 58px bar has no spare width at 375px, so the token chip wraps onto its
     own full-width row under the logo rather than squeezing the nav. */
  /* 36px between logo and pill is a desktop figure; at 375px it is what pushed
     the online pill onto its own row once the count reached two digits. */
  .lp-nav .lp-wrap{height:auto;flex-wrap:wrap;row-gap:0;column-gap:12px;padding-top:9px;padding-bottom:9px}
  .lp-ca{order:3;width:100%;margin-left:0;margin-top:9px;height:30px;justify-content:center}
  .lp-ca ~ .lp-online{margin-left:auto}
  .lp-ca-mint{font-size:11.5px}
}
`;

const PACKS = [
  { friend: true, req: 'FOR YOUR FRIEND', name: 'Starter pack', cmd: '::starterpack',
    text: 'Iron armour, iron and steel 2-handers, strength amulet, 12 tuna and 10,000 coins.' },
  { friend: false, req: 'YOU · 3 FRIENDS', name: 'Noob pack', cmd: '::noobpack',
    text: 'Steel and black armour, black and mithril 2-handers, 12 lobsters and 20,000 coins.' },
  { friend: false, req: 'YOU · 5 FRIENDS', name: 'Pro pack', cmd: '::propack',
    text: 'Mithril or adamant armour, adamant 2-hander, 12 swordfish and 40,000 coins.' },
  { friend: false, req: 'YOU · 10 FRIENDS', name: 'King pack', cmd: '::kingpack',
    text: 'Rune armour, rune 2-hander, diamond amulet, 12 sharks and 80,000 coins.' },
];

type WorldRow = { worldNumber: number; playersOnline: number };

// Everyone online across every world, not just world 1. The PVP Arena is a
// separate realm on its own database, so its players are not included here.
function useOnlineCount(): { total: number; breakdown: string } | null {
  const [v, setV] = useState<{ total: number; breakdown: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/worlds`);
        if (!res.ok) return;
        const d = await res.json();
        if (!alive || !Array.isArray(d)) return;
        const rows = (d as WorldRow[]).filter((w) => typeof w?.playersOnline === 'number');
        if (!rows.length) return;
        const total = rows.reduce((n, w) => n + w.playersOnline, 0);
        const busy = rows
          .filter((w) => w.playersOnline > 0)
          .map((w) => `${displayForWorldNumber(w.worldNumber)}: ${w.playersOnline}`);
        setV({ total, breakdown: busy.length ? busy.join(' · ') : 'Nobody online right now' });
      } catch { /* offline — hide the pill */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return v;
}

type GeRank = { rank: number; total: number };

// Market-cap rank on grandexchange.gold. Their API sends no CORS header, so a
// browser cannot read it directly; the sidecar proxies and caches it. Same
// shape as useOnlineCount: on any failure we return null and render nothing,
// never a zero or a dash.
function useGeRank(): GeRank | null {
  const [r, setR] = useState<GeRank | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/token/ge`);
        if (!res.ok) return;
        const d = await res.json();
        if (alive && typeof d?.rank === 'number' && typeof d?.total === 'number') {
          setR({ rank: d.rank, total: d.total });
        }
      } catch { /* unreachable — hide the rank */ }
    };
    load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return r;
}

const CopyGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
const CheckGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Sword = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#E3B55A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" />
  </svg>
);
const IconProps = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: '#E3B55A', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export function Landing({ googleButton, onConnectWallet, error, worldPicker }: {
  googleButton: ReactNode;
  onConnectWallet: () => void;
  error: string;
  worldPicker?: ReactNode;
}) {
  useEffect(() => { injectStyleOnce('r2h-landing-css', CSS); injectFontsOnce(); }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const referRef = useRef<HTMLDivElement>(null);
  const [inviter] = useState(readInviter);
  const online = useOnlineCount();
  const geRank = useGeRank();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const copyMint = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_MINT);
    } catch {
      // Older browsers and non-secure contexts have no clipboard API.
      const ta = document.createElement('textarea');
      ta.value = TOKEN_MINT;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more we can do */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  };

  const scrollTo = (el: HTMLElement | null) => {
    const root = rootRef.current;
    if (!root) return;
    root.scrollTo({ top: el ? Math.max(0, el.offsetTop - 80) : 0, behavior: 'smooth' });
  };

  return (
    <div className="lp" ref={rootRef}>
      <header className="lp-nav">
        <div className="lp-wrap">
          <button type="button" className="lp-logo" onClick={() => scrollTo(null)} aria-label="Runescape Classic, back to top">
            <Sword /> RUNESCAPE CLASSIC
          </button>
          <nav className="lp-links">
            <button type="button" onClick={() => scrollTo(featuresRef.current)}>Features</button>
            <button type="button" onClick={() => scrollTo(referRef.current)}>Refer a friend</button>
            <a href="https://classic.runescape.wiki" target="_blank" rel="noopener noreferrer">
              Wiki
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>
            </a>
          </nav>
          <div className="lp-ca">
            <a
              className="lp-ca-link"
              href={DEXSCREENER_URL}
              target="_blank"
              rel="noopener noreferrer"
              title={`${TOKEN_TICKER} on DexScreener — ${TOKEN_MINT}`}
            >
              <span className="lp-ca-tick">${TOKEN_TICKER}</span>
              <span className="lp-ca-mint">{TOKEN_MINT_SHORT}</span>
            </a>
            <button
              type="button"
              className="lp-ca-copy"
              onClick={copyMint}
              data-copied={copied ? 'true' : 'false'}
              aria-label={copied ? 'Contract address copied' : 'Copy contract address'}
            >
              {copied ? <CheckGlyph /> : <CopyGlyph />}
            </button>
            {geRank && (
              <a
                className="lp-ca-rank"
                href={GRANDEXCHANGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Market-cap rank on grandexchange.gold"
              >
                #{geRank.rank}<span className="lp-ca-rank-of">&nbsp;of {geRank.total}</span>
              </a>
            )}
          </div>

          {online !== null && (
            <div className="lp-online" title={online.breakdown}>
              <span className="lp-dot" />
              <span><b>{online.total}</b> online</span>
            </div>
          )}
        </div>
      </header>

      <section className="lp-wrap lp-hero">
        <div className="lp-eyebrow">FREE TO PLAY · IN YOUR BROWSER</div>
        <h1 className="lp-h1">Classic RuneScape, live again.</h1>
        <p className="lp-lead">No download, no install. Sign in with Google or a crypto wallet and you're in Lumbridge in seconds.</p>

        {inviter && (
          <div className="lp-invited">
            <svg {...IconProps} width={20} height={20} strokeWidth={1.8}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
            <span>Invited by <b>{inviter}</b>. Create your character, then type <span className="lp-mono">::starterpack</span> in game for a free Starter pack.</span>
          </div>
        )}

        <div className="lp-cta">
          <div className="lp-google">{googleButton}</div>
          <button type="button" className="lp-wallet" onClick={onConnectWallet}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
            Connect wallet
          </button>
        </div>
        {error && <p className="lp-error" role="alert">{error}</p>}
        {worldPicker}
        <p className="lp-hint">New here? Signing in creates your character. Wallets: MetaMask · Phantom · Trust</p>

        {HERO_IMAGE && (
          <div className="lp-shot"><img src={HERO_IMAGE} alt="Runescape Classic gameplay" /></div>
        )}
      </section>

      <section className="lp-wrap lp-features" ref={featuresRef}>
        <div className="lp-card">
          <svg {...IconProps}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          <h3>Play in any browser</h3>
          <p>Desktop, phone, or your wallet's built-in browser. Nothing to install, and your character is waiting wherever you sign in.</p>
        </div>
        <div className="lp-card">
          <svg {...IconProps}><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" /><path d="M9 3v15" /><path d="M15 6v15" /></svg>
          <h3>The world you remember</h3>
          <p>18 skills, the classic quests and the original map, on a live server with other players.</p>
        </div>
        <div className="lp-card">
          <svg {...IconProps}><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /><path d="M14.5 6.5 18 3h3v3l-3.5 3.5" /><path d="m5 14 4 4" /><path d="m7 17-3 3" /><path d="m3 19 2 2" /></svg>
          <h3>PvP Arena <span className="lp-beta">BETA</span></h3>
          <p>A separate PvP realm with the same login. Pick your levels and fight in the Wilderness. Your main character is untouched.</p>
        </div>
      </section>

      <section className="lp-wrap" ref={referRef}>
        <div className="lp-ref">
          <div className="lp-ref-top">
            <div>
              <div className="lp-eyebrow">REFER A FRIEND</div>
              <h2 className="lp-h2">Bring friends. Earn packs.</h2>
              <p>Share your link. Friends who join get a Starter pack right away. Every friend who reaches combat level 10 counts toward your rewards, and each pack is yours to claim once.</p>
            </div>
            <button type="button" className="lp-gold" onClick={() => scrollTo(null)}>Sign in to get your link</button>
          </div>
          <div className="lp-packs">
            {PACKS.map(p => (
              <div key={p.cmd} className={p.friend ? 'lp-pack friend' : 'lp-pack'}>
                <div className="lp-req">{p.req}</div>
                <h3>{p.name}</h3>
                <p>{p.text}</p>
                <div className="lp-cmd">{p.cmd}</div>
              </div>
            ))}
          </div>
          <div className="lp-small">
            Every pack also includes runes and big bones, and goes straight to your bank. Once you're in, your link is in the Invite panel, or type <span className="lp-mono">::refcode</span> in game.
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span style={{ fontFamily: 'Cinzel, Georgia, serif', fontWeight: 700, letterSpacing: 2, color: '#A2ABA5' }}>RUNESCAPE CLASSIC</span>
          <span>runescapeclassic.gold</span>
          <nav>
            <a href="/about">About</a>
            <a href="/privacy-policy">Privacy</a>
            <a href="/terms-of-service">Terms</a>
            <a href="/media-kit">Media kit</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
