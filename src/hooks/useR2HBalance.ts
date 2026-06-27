import { useState, useEffect, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

const R2H_TOKEN_MINT = import.meta.env.VITE_R2H_TOKEN_MINT || '';
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const POLL_INTERVAL = 30_000; // 30 seconds

interface BalanceState {
  balance: number;
  isLoading: boolean;
  error: string | null;
}

export function useR2HBalance(): BalanceState {
  const { wallets } = useWallets();
  const [state, setState] = useState<BalanceState>({ balance: 0, isLoading: false, error: null });

  // Find the first Solana wallet from Privy
  const solanaWallet = wallets.find((w) => w.chainType === 'solana');
  const address = solanaWallet?.address;

  const fetchBalance = useCallback(async () => {
    if (!address || !R2H_TOKEN_MINT) {
      setState({ balance: 0, isLoading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const publicKey = new PublicKey(address);
      const mint = new PublicKey(R2H_TOKEN_MINT);
      const tokenAccount = await getAssociatedTokenAddress(mint, publicKey);
      const accountInfo = await getAccount(connection, tokenAccount);
      const balance = Number(accountInfo.amount) / 1e9; // 9 decimals
      setState({ balance, isLoading: false, error: null });
    } catch (err: any) {
      if (err.message?.includes('could not find account')) {
        setState({ balance: 0, isLoading: false, error: null });
      } else {
        console.error('[useR2HBalance] Error:', err.message);
        setState({ balance: 0, isLoading: false, error: 'Balance unavailable' });
      }
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();

    if (!address) return;

    const interval = setInterval(fetchBalance, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [address, fetchBalance]);

  return state;
}
