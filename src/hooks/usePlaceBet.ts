import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { Connection } from '@solana/web3.js';
import { placeBet as contractPlaceBet, waitForResolution, type BetType, type BetResult } from '../lib/contracts/betContract';
import { getErrorMessage } from '../lib/contractErrors';

const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface PlaceBetState {
  placeBet: (amount: number, betType: BetType) => Promise<void>;
  isPlacing: boolean;
  error: string | null;
  result: BetResult | null;
  clearResult: () => void;
}

export function usePlaceBet(): PlaceBetState {
  const { wallets } = useWallets();
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BetResult | null>(null);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const placeBet = useCallback(async (amount: number, betType: BetType) => {
    const solanaWallet = wallets.find((w) => w.chainType === 'solana');
    if (!solanaWallet) {
      setError('No Solana wallet connected');
      return;
    }

    if (amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    setIsPlacing(true);
    setError(null);
    setResult(null);

    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      console.log('[usePlaceBet] Placing bet:', amount, betType);
      const txSignature = await contractPlaceBet(solanaWallet, connection, amount, betType);
      console.log('[usePlaceBet] Transaction sent:', txSignature);

      console.log('[usePlaceBet] Waiting for resolution...');
      const betResult = await waitForResolution(connection, txSignature);

      betResult.amount = amount;
      betResult.betType = betType;
      setResult(betResult);
      console.log('[usePlaceBet] Bet resolved:', betResult);
    } catch (err: any) {
      const message = getErrorMessage(err);
      console.error('[usePlaceBet] Error:', message);
      setError(message);
    } finally {
      setIsPlacing(false);
    }
  }, [wallets]);

  return { placeBet, isPlacing, error, result, clearResult };
}
