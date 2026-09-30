import { useEffect } from 'react';
import { InvitePanel } from './InvitePanel';
import { injectStyleOnce } from '../../lib/referral';

// Dialog (desktop) / bottom sheet (phones) opened from the game controls hub.
// position:fixed overlay at the same z-level as the PVP Arena confirm dialog;
// it only exists while open, so the game frame and its layout are untouched.

const CSS = `
.invs-back{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}
.invs-card{width:380px;max-width:92vw;max-height:88vh;overflow-y:auto;box-sizing:border-box;padding:18px 20px 20px;background:#0F1311;border:1px solid #2A332E;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.8)}
.invs-head{display:flex;align-items:center;margin-bottom:6px}
.invs-head h2{margin:0;font-family:Cinzel,Georgia,serif;font-size:21px;font-weight:700;color:#F4F1E8}
.invs-x{margin-left:auto;width:40px;height:40px;border:none;background:none;color:#A2ABA5;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:8px}
.invs-x:hover{background:#161B18;color:#ECEFEC}
.invs-sub{margin:0 0 14px;font-family:Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:#A2ABA5}
@media (max-width:600px){
  .invs-back{align-items:flex-end}
  .invs-card{width:100%;max-width:100%;max-height:85vh;border-radius:18px 18px 0 0;border-bottom:none;padding-bottom:calc(20px + env(safe-area-inset-bottom))}
}
`;

export function InviteSheet({ username, onClose }: { username: string | null; onClose: () => void }) {
  useEffect(() => { injectStyleOnce('r2h-invite-sheet-css', CSS); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="invs-back" onClick={onClose}>
      <div className="invs-card" role="dialog" aria-modal="true" aria-labelledby="invs-title" onClick={e => e.stopPropagation()}>
        <div className="invs-head">
          <h2 id="invs-title">Invite friends</h2>
          <button type="button" className="invs-x" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="invs-sub">Friends get a Starter pack. You earn packs as they reach combat 10.</p>
        <InvitePanel username={username} active variant="sheet" />
      </div>
    </div>
  );
}
