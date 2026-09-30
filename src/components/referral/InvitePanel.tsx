import { useEffect, useRef, useState } from 'react';
import {
  MILESTONES, copyText, injectFontsOnce, injectStyleOnce, referralLinkFor,
  shareText, useReferralStats,
} from '../../lib/referral';

// ── INVITE panel ─────────────────────────────────────────────────────────
// Lives OUTSIDE the game frame: the left letterbox column's INVITE tab
// (desktop) and the InviteSheet dialog opened from the controls hub (all
// devices). Read-only; never talks to the game client.

const CSS = `
.inv{display:flex;flex-direction:column;gap:14px;font-family:Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ECEFEC}
.inv h2{margin:0;font-family:Cinzel,Georgia,serif;font-weight:700;font-size:19px;color:#F4F1E8;letter-spacing:.3px}
.inv-sub{margin:0;font-size:12.5px;line-height:1.5;color:#A2ABA5}
.inv-label{font-size:10.5px;font-weight:700;letter-spacing:1.2px;color:#7E8781;margin-bottom:6px;display:block}
.inv-link{width:100%;box-sizing:border-box;height:38px;padding:0 10px;border-radius:8px;border:1px solid #2A332E;background:#0F1311;color:#ECEFEC;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;outline:none}
.inv-link:focus{border-color:#E3B55A}
.inv-btns{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.inv-sheet .inv-btns{flex-direction:row}
.inv-btn{height:42px;border-radius:8px;border:none;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;flex:0 0 auto;touch-action:manipulation}
.inv-sheet .inv-btn{flex:1 1 0}
.inv-btn-gold{background:#E3B55A;color:#1A1306}
.inv-btn-gold:hover{background:#EDC473}
.inv-btn-done{background:#14F195;color:#06251a}
.inv-btn-ghost{background:transparent;color:#ECEFEC;border:1px solid #2E3833;font-weight:600}
.inv-btn-ghost:hover{border-color:#4A5750}
.inv-progress{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #1C2320;border-radius:10px;background:#0B0E0D}
.inv-big{display:flex;align-items:baseline;gap:6px}
.inv-big b{font-size:24px;font-weight:700;color:#F4F1E8}
.inv-big span{font-size:12.5px;color:#A2ABA5}
.inv-bar{position:relative;height:6px;border-radius:3px;background:#1C2320}
.inv-bar i{position:absolute;left:0;top:0;height:6px;border-radius:3px;background:#E3B55A;transition:width .4s}
.inv-bar u{position:absolute;top:-3px;width:2px;height:12px;background:#3A4540}
.inv-note{font-size:11.5px;color:#7E8781;line-height:1.5;margin:0}
.inv-ms{display:flex;flex-direction:column;gap:6px}
.inv-m{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;border:1px solid #1C2320;background:#0B0E0D}
.inv-m.ready{border-color:#5A4520;background:#16120A}
.inv-need{width:28px;height:28px;flex-shrink:0;border-radius:7px;background:#0A0C0B;border:1px solid #2A332E;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#A2ABA5}
.inv-m-txt{display:flex;flex-direction:column;gap:1px;min-width:0}
.inv-m-name{font-size:13px;font-weight:700;color:#F4F1E8}
.inv-m-st{font-size:11.5px;color:#7E8781}
.inv-m.ready .inv-m-st{color:#F1CB7E;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px}
.inv-m.claimed .inv-m-st{color:#14F195}
.inv-warn{font-size:12.5px;color:#F1CB7E;line-height:1.5;margin:0}
`;

export function InvitePanel({ username, active, variant = 'column' }: {
  username: string | null;
  active: boolean;
  variant?: 'column' | 'sheet';
}) {
  useEffect(() => { injectStyleOnce('r2h-invite-css', CSS); injectFontsOnce(); }, []);

  const link = referralLinkFor(username);
  const stats = useReferralStats(link ? username : null, active);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  if (!username) {
    return <div className={`inv inv-${variant}`}><p className="inv-sub">Sign in to get your invite link.</p></div>;
  }
  if (!link) {
    return (
      <div className={`inv inv-${variant}`}>
        <h2>Invite friends</h2>
        <p className="inv-warn">Your character name can't be used as a referral code (letters and numbers only).</p>
      </div>
    );
  }

  const onCopy = async () => {
    const ok = await copyText(link, inputRef.current);
    if (ok) setCopied(true);
    else inputRef.current?.select();
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const onShare = async () => {
    if (canNativeShare) {
      try { await navigator.share({ title: 'Runescape Classic', text: shareText(link), url: link }); } catch { /* dismissed */ }
      return;
    }
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText(link))}`, '_blank', 'noopener,noreferrer');
  };

  const q = stats.qualified;

  return (
    <div className={`inv inv-${variant}`}>
      {variant === 'column' && (
        <div>
          <h2>Invite friends</h2>
          <p className="inv-sub" style={{ marginTop: 4 }}>Friends get a Starter pack. You earn packs as they reach combat 10.</p>
        </div>
      )}

      <div>
        <label className="inv-label" htmlFor={`inv-link-${variant}`}>YOUR LINK</label>
        <input
          id={`inv-link-${variant}`}
          ref={inputRef}
          className="inv-link"
          type="text"
          readOnly
          value={link}
          onFocus={e => e.currentTarget.select()}
        />
        <div className="inv-btns">
          <button type="button" className={`inv-btn ${copied ? 'inv-btn-done' : 'inv-btn-gold'}`} onClick={onCopy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" className="inv-btn inv-btn-ghost" onClick={onShare}>
            {canNativeShare ? 'Share' : 'Share on X'}
          </button>
        </div>
      </div>

      <div className="inv-progress">
        <div className="inv-big">
          <b>{stats.loaded ? q : '–'}</b>
          <span>{q === 1 ? 'friend' : 'friends'} at combat 10</span>
        </div>
        <div className="inv-bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, q * 10)}%` }} />
          <u style={{ left: '30%' }} />
          <u style={{ left: '50%' }} />
        </div>
        <p className="inv-note">
          {stats.loaded
            ? `${stats.total} joined with your link`
            : stats.failed ? 'Stats unavailable right now. Try ::refstats in game.' : 'Loading…'}
        </p>
      </div>

      <div className="inv-ms">
        {MILESTONES.map(m => {
          const unlocked = q >= m.need;
          const claimed = stats.claimed?.[m.key] === true;
          const cls = claimed ? 'inv-m claimed' : unlocked ? 'inv-m ready' : 'inv-m';
          const status = claimed
            ? 'Claimed'
            : unlocked
              ? (stats.claimed ? `Ready · type ${m.cmd}` : `Unlocked · ${m.cmd}`)
              : `${m.need - q} more to go`;
          return (
            <div key={m.key} className={cls}>
              <div className="inv-need">{m.need}</div>
              <div className="inv-m-txt">
                <span className="inv-m-name">{m.name}</span>
                <span className="inv-m-st">{stats.loaded ? status : `${m.need} friends`}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="inv-note">Counts update when a friend logs out or the game saves. Full details in game: ::refstats</p>
    </div>
  );
}
