import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

const R2H_TOKEN_MINT = import.meta.env.VITE_R2H_TOKEN_MINT || '';
const POLL_INTERVAL = 30_000; // 30 seconds

interface BalanceState {
  balance: number;
  isLoading: boolean;
  error: string | null;
}

export function useR2HBalance(): BalanceState {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<BalanceState>({ balance: 0, isLoading: false, error: null });

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !R2H_TOKEN_MINT) {
      setState({ balance: 0, isLoading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const mint = new PublicKey(R2H_TOKEN_MINT);
      const tokenAccount = await getAssociatedTokenAddress(mint, publicKey);
      const accountInfo = await getAccount(connection, tokenAccount);
      const balance = Number(accountInfo.amount) / 1e9; // 9 decimals
      setState({ balance, isLoading: false, error: null });
    } catch (err: any) {
      // Token account may not exist yet (user has no $R2H)
      if (err.message?.includes('could not find account')) {
        setState({ balance: 0, isLoading: false, error: null });
      } else {
        console.error('[useR2HBalance] Error:', err.message);
        setState({ balance: 0, isLoading: false, error: 'Balance unavailable' });
      }
    }
  }, [publicKey, connection]);

  useEffect(() => {
    fetchBalance();

    if (!publicKey) return;

    const interval = setInterval(fetchBalance, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [publicKey, fetchBalance]);

  return state;
}
