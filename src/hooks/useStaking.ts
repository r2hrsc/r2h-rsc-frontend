import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  stake as contractStake,
  unstake as contractUnstake,
  claimRewards as contractClaimRewards,
  getUserStakes,
  type LockDuration,
  type StakeInfo,
} from '../lib/contracts/stakeContract';
import { getErrorMessage } from '../lib/contractErrors';

const REFRESH_INTERVAL = 60_000; // 60 seconds

interface UseStakingState {
  stakes: StakeInfo[];
  totalStaked: number;
  totalRewards: number;
  stake: (amount: number, lockDuration: LockDuration) => Promise<boolean>;
  unstake: (stakeId: string, amount: number) => Promise<boolean>;
  claimRewards: (stakeId: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useStaking(): UseStakingState {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useWallet();
  const [stakes, setStakes] = useState<StakeInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refreshStakes = useCallback(async () => {
    if (!publicKey) {
      setStakes([]);
      return;
    }

    try {
      const userStakes = await getUserStakes(connection, publicKey.toBase58());
      setStakes(userStakes);
    } catch (err: any) {
      console.error('[useStaking] Failed to fetch stakes:', err.message);
    }
  }, [publicKey, connection]);

  // Fetch stakes on mount and poll
  useEffect(() => {
    refreshStakes();
    const interval = setInterval(refreshStakes, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshStakes]);

  const totalStaked = stakes
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + s.amount, 0);

  const totalRewards = stakes
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + s.accumulatedRewards, 0);

  const stake = useCallback(async (amount: number, lockDuration: LockDuration): Promise<boolean> => {
    if (!publicKey) {
      setError('Wallet not connected');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await contractStake(wallet, connection, amount, lockDuration);
      console.log('[useStaking] Staked:', result);
      await refreshStakes();
      return true;
    } catch (err: any) {
      const message = getErrorMessage(err);
      console.error('[useStaking] Stake error:', message);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [wallet, connection, publicKey, refreshStakes]);

  const unstake = useCallback(async (stakeId: string, amount: number): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await contractUnstake(wallet, connection, stakeId, amount);
      console.log('[useStaking] Unstaked:', result);
      await refreshStakes();
      return true;
    } catch (err: any) {
      const message = getErrorMessage(err);
      console.error('[useStaking] Unstake error:', message);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [wallet, connection, refreshStakes]);

  const claimRewards = useCallback(async (stakeId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await contractClaimRewards(wallet, connection, stakeId);
      console.log('[useStaking] Claimed rewards:', result);
      await refreshStakes();
      return true;
    } catch (err: any) {
      const message = getErrorMessage(err);
      console.error('[useStaking] Claim error:', message);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [wallet, connection, refreshStakes]);

  return {
    stakes,
    totalStaked,
    totalRewards,
    stake,
    unstake,
    claimRewards,
    isLoading,
    error,
    clearError,
  };
}
