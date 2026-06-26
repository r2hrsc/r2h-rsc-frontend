import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { placeBet as contractPlaceBet, waitForResolution, type BetType, type BetResult } from '../lib/contracts/betContract';
import { getErrorMessage } from '../lib/contractErrors';

interface PlaceBetState {
  placeBet: (amount: number, betType: BetType) => Promise<void>;
  isPlacing: boolean;
  error: string | null;
  result: BetResult | null;
  clearResult: () => void;
}

export function usePlaceBet(): PlaceBetState {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BetResult | null>(null);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const placeBet = useCallback(async (amount: number, betType: BetType) => {
    if (!wallet.publicKey) {
      setError('Wallet not connected');
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
      // Step 1: Send bet transaction to smart contract
      console.log('[usePlaceBet] Placing bet:', amount, betType);
      const txSignature = await contractPlaceBet(wallet, connection, amount, betType);
      console.log('[usePlaceBet] Transaction sent:', txSignature);

      // Step 2: Wait for contract to resolve the bet
      console.log('[usePlaceBet] Waiting for resolution...');
      const betResult = await waitForResolution(connection, txSignature);

      // Step 3: Update result with actual data
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
  }, [wallet, connection]);

  return { placeBet, isPlacing, error, result, clearResult };
}
