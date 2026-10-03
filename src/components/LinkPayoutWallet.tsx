import { useState, useEffect, useCallback } from 'react';
import { useAppKitAccount, useAppKitProvider, modal as walletModal } from '@reown/appkit/react';
import { readAccessToken } from '../lib/referral';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

/**
 * Links a Solana wallet to the account the player is ALREADY signed into.
 *
 * Why this exists separately from Solana login: every account created before
 * Solana support has an EVM (0x) identity. $RUNE is an SPL token, so it cannot
 * be sent to a 0x address, and the payout engine leaves those players' earnings
 * pending indefinitely. If such a player instead signed in with Solana they
 * would be treated as a brand new user and their existing username would be
 * taken — stranding everything they had already earned.
 *
 * So: they sign in however they always have, then link a Solana wallet to that
 * same account. The link is proven by an ed25519 signature over a server nonce
 * bound to BOTH the account and the address, so nobody can claim a wallet they
 * do not control, and nobody can have someone else's earnings redirected.
 */
interface Props { username: string | null | undefined; }

interface Balance { pending_tokens: number; paid_tokens: number; }

type Phase = 'idle' | 'connecting' | 'signing' | 'saving' | 'linked' | 'error';

/** Signature bytes -> base58, the form Solana tooling expects. */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
  return out || '1';
}

interface SolanaSigner { signMessage(message: Uint8Array): Promise<Uint8Array>; }

export default function LinkPayoutWallet({ username }: Props) {
  const sol = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider: solProvider } = useAppKitProvider<SolanaSigner>('solana');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [balance, setBalance] = useState<Balance | null>(null);
  const [linked, setLinked] = useState<string | null>(null);

  // Show the player what is actually waiting for them — the reason to bother.
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/v1/earn/balance/${encodeURIComponent(username)}`);
        const d = await r.json();
        if (!cancelled && d?.ok) setBalance({ pending_tokens: d.pending_tokens ?? 0, paid_tokens: d.paid_tokens ?? 0 });
      } catch { /* non-fatal: the button still works without a balance */ }
    })();
    return () => { cancelled = true; };
  }, [username, phase]);

  const link = useCallback(async () => {
    setError('');
    const token = readAccessToken();
    if (!token) { setError('Please sign in again to link a wallet.'); setPhase('error'); return; }

    // 1. Need a connected Solana wallet. Opening the modal on the solana
    //    namespace shows Phantom/Solflare rather than the EVM list.
    if (!sol.isConnected || !sol.address) {
      setPhase('connecting');
      // walletModal is undefined until initWalletKit() has run. It runs during
      // the loading screen, but guard rather than crash if this ever renders
      // earlier than that.
      if (!walletModal) { setError('Wallet not ready yet — try again in a moment.'); setPhase('error'); return; }
      try { await walletModal.open({ view: 'Connect', namespace: 'solana' } as any); }
      catch { /* user closed it */ }
      setPhase('idle');
      return; // the address arrives via the hook; the player taps again
    }
    const address = sol.address;

    try {
      // 2. Nonce, bound to this account AND this address server-side.
      setPhase('signing');
      const nr = await fetch(`${API_URL}/v1/earn/wallet/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ solana_address: address }),
      });
      const nd = await nr.json();
      if (!nr.ok || !nd.ok) throw new Error(nd.error || 'Could not start wallet linking');

      // 3. Sign the exact text the server will verify — never a local rebuild.
      if (!solProvider) throw new Error('Wallet provider unavailable — reconnect your wallet');
      const sig = await solProvider.signMessage(new TextEncoder().encode(nd.message));

      // 4. Save.
      setPhase('saving');
      const sr = await fetch(`${API_URL}/v1/earn/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ solana_address: address, signature: b58encode(sig), nonce: nd.nonce }),
      });
      const sd = await sr.json();
      if (!sr.ok || !sd.ok) throw new Error(sd.error || 'Could not link wallet');

      setLinked(address);
      setPhase('linked');
    } catch (err: any) {
      const rejected = /reject|denied|cancel|user/i.test(err?.message || '');
      setError(rejected ? 'Signature cancelled — tap Link wallet to try again.' : (err?.message || 'Could not link wallet'));
      setPhase('error');
    }
  }, [sol.isConnected, sol.address, solProvider]);

  if (!username) return null;

  const pending = balance?.pending_tokens ?? 0;
  const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

  if (phase === 'linked' && linked) {
    return (
      <div style={S.wrap}>
        <div style={S.ok}>Wallet linked — {short(linked)}</div>
        <div style={S.sub}>
          {pending > 0
            ? `Your ${pending.toLocaleString()} $RUNE will arrive within a minute.`
            : 'Future wilderness kills will pay out automatically.'}
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>
        {pending > 0 ? `${pending.toLocaleString()} $RUNE waiting` : 'Get paid for wilderness kills'}
      </div>
      <div style={S.sub}>
        {pending > 0
          ? 'You have earned $RUNE but we have no Solana wallet on file. Link one to receive it.'
          : '$RUNE is a Solana token. Link a Solana wallet to receive your rewards.'}
      </div>
      <button onClick={link} style={S.btn} disabled={phase === 'signing' || phase === 'saving'}>
        {phase === 'connecting' ? 'Opening wallet…'
          : phase === 'signing' ? 'Confirm in your wallet…'
          : phase === 'saving' ? 'Linking…'
          : sol.isConnected && sol.address ? `Link ${short(sol.address)}`
          : 'Connect Solana wallet'}
      </button>
      {error && <div style={S.err}>{error}</div>}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { border: '1px solid #14F195', borderRadius: 8, padding: '12px 14px', background: 'rgba(20,241,149,0.06)', maxWidth: 420 },
  title: { color: '#14F195', fontWeight: 700, fontSize: 14, marginBottom: 4 },
  sub: { color: '#9aa', fontSize: 12, lineHeight: 1.5, marginBottom: 10 },
  ok: { color: '#14F195', fontWeight: 700, fontSize: 14, marginBottom: 4 },
  btn: { background: '#14F195', border: 'none', color: '#04140d', padding: '9px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44, width: '100%', touchAction: 'manipulation' },
  err: { color: '#f66', fontSize: 12, marginTop: 8 },
};
