import { useState, useEffect, useCallback } from 'react';
import { useAppKitAccount, modal as walletModal } from '@reown/appkit/react';
import { readAccessToken } from '../lib/referral';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

/**
 * Binds a Solana wallet to the account the player is ALREADY signed into.
 *
 * WHY THIS EXISTS. $RUNE is an SPL token, so it can only be sent to a Solana
 * address. Every account created before Solana login has an EVM (0x) identity,
 * and a 0x address cannot be converted to a Solana one — different curves. The
 * payout engine never looks at how you log in; it looks for a Solana address
 * attached to your account. Without one, your kills sit unpaid forever.
 *
 * And they cannot simply sign in with Solana instead: findExistingUsername
 * ('solana', addr) would return null, they would be treated as a NEW user, and
 * registration fails username_taken against their own name. Everything already
 * earned would be stranded under the old account.
 *
 * NO SIGNATURE, DELIBERATELY. The endpoint accepts a signed link too, and a
 * signed address becomes a real credential ('solana'). Unsigned addresses go to
 * 'solana_payout', which can NEVER be used to sign in. For a payout destination
 * that is the right trade: the address comes from the player's own connected
 * wallet, and the only thing at stake if it were somehow wrong is their own
 * rewards. Making them approve a signature prompt to receive money they have
 * already earned costs more players than it protects. Do not "harden" this into
 * a signature step without also moving it out of the payout-only namespace.
 *
 * variant 'banner' renders NOTHING unless rewards are actually waiting, so it
 * can be mounted unconditionally and will only interrupt someone who is owed.
 */
interface Props {
  username: string | null | undefined;
  variant?: 'panel' | 'banner';
}

type Phase = 'idle' | 'connecting' | 'saving' | 'linked' | 'error';

export default function LinkPayoutWallet({ username, variant = 'panel' }: Props) {
  const sol = useAppKitAccount({ namespace: 'solana' });
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // A pending balance above zero IS the signal that no wallet is on file: the
  // engine settles within ~15s of a wallet existing, so anything still pending
  // means it has nowhere to send. No extra endpoint needed to ask.
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/v1/earn/balance/${encodeURIComponent(username)}`);
        const d = await r.json();
        if (!cancelled && d?.ok) setPending(d.pending_tokens ?? 0);
      } catch { /* non-fatal; the panel still works without a balance */ }
    })();
    return () => { cancelled = true; };
  }, [username, phase]);

  const link = useCallback(async () => {
    setError('');
    const token = readAccessToken();
    if (!token) { setError('Please sign in again to link a wallet.'); setPhase('error'); return; }

    if (!sol.isConnected || !sol.address) {
      setPhase('connecting');
      if (!walletModal) { setError('Wallet not ready yet — try again in a moment.'); setPhase('error'); return; }
      try { await walletModal.open({ view: 'Connect', namespace: 'solana' } as any); }
      catch { /* player closed it */ }
      setPhase('idle');
      return; // address arrives via the hook; the button then says "Link <addr>"
    }

    try {
      setPhase('saving');
      const r = await fetch(`${API_URL}/v1/earn/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ solana_address: sol.address }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not link wallet');
      setLinked(sol.address);
      setPhase('linked');
    } catch (err: any) {
      setError(err?.message || 'Could not link wallet');
      setPhase('error');
    }
  }, [sol.isConnected, sol.address]);

  // Auto-link the moment a Solana wallet becomes available, so the common case
  // is a single tap: press the button, pick the wallet, done.
  useEffect(() => {
    if (phase === 'idle' && sol.isConnected && sol.address && !linked && pending !== null && pending > 0) {
      void link();
    }
  }, [sol.isConnected, sol.address, phase, linked, pending, link]);

  if (!username) return null;
  const owed = pending ?? 0;
  const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

  // Banner mode stays out of the way unless there is money waiting.
  if (variant === 'banner' && (dismissed || (owed <= 0 && phase !== 'linked'))) return null;

  const body = phase === 'linked' && linked ? (
    <>
      <div style={S.ok}>Wallet linked — {short(linked)}</div>
      <div style={S.sub}>
        {owed > 0 ? `Your ${owed.toLocaleString()} $RUNE will arrive within a minute.`
                  : 'Wilderness kills will now pay out automatically.'}
      </div>
    </>
  ) : (
    <>
      <div style={S.title}>
        {owed > 0 ? `${owed.toLocaleString()} $RUNE waiting` : 'Get paid for wilderness kills'}
      </div>
      <div style={S.sub}>
        {owed > 0
          ? 'You have earned $RUNE but we have no Solana wallet on file. Connect one to receive it.'
          : '$RUNE is a Solana token. Connect a Solana wallet to receive your rewards.'}
      </div>
      <button onClick={link} style={S.btn} disabled={phase === 'saving'}>
        {phase === 'connecting' ? 'Opening wallet…'
          : phase === 'saving' ? 'Linking…'
          : sol.isConnected && sol.address ? `Link ${short(sol.address)}`
          : 'Connect Solana wallet'}
      </button>
      {error && <div style={S.err}>{error}</div>}
    </>
  );

  if (variant === 'banner') {
    return (
      <div style={S.banner}>
        <button onClick={() => setDismissed(true)} style={S.dismiss} aria-label="Dismiss">×</button>
        {body}
      </div>
    );
  }
  return <div style={S.wrap}>{body}</div>;
}

const card: React.CSSProperties = {
  border: '1px solid #14F195', borderRadius: 8, padding: '12px 14px',
  background: 'rgba(10,26,20,0.96)',
};
const S: Record<string, React.CSSProperties> = {
  wrap: { ...card, background: 'rgba(20,241,149,0.06)', maxWidth: 420 },
  banner: {
    ...card, position: 'fixed', right: 12, bottom: 12, zIndex: 9000,
    width: 'min(340px, calc(100vw - 24px))',
    boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
  },
  dismiss: {
    position: 'absolute', top: 4, right: 6, background: 'none', border: 'none',
    color: '#678', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '2px 6px',
  },
  title: { color: '#14F195', fontWeight: 700, fontSize: 14, marginBottom: 4, paddingRight: 18 },
  sub: { color: '#9aa', fontSize: 12, lineHeight: 1.5, marginBottom: 10 },
  ok: { color: '#14F195', fontWeight: 700, fontSize: 14, marginBottom: 4, paddingRight: 18 },
  btn: {
    background: '#14F195', border: 'none', color: '#04140d', padding: '9px 14px',
    borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    minHeight: 44, width: '100%', touchAction: 'manipulation',
  },
  err: { color: '#f66', fontSize: 12, marginTop: 8 },
};
