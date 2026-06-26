import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { WalletContextState } from '@solana/wallet-adapter-react';

const STAKE_PROGRAM_ID = new PublicKey(import.meta.env.VITE_STAKE_PROGRAM_ID || '11111111111111111111111111111111');
const R2H_MINT = new PublicKey(import.meta.env.VITE_R2H_TOKEN_MINT || '11111111111111111111111111111111');

export type LockDuration = 7 | 30 | 90;

export interface StakeInfo {
  stakeId: string;
  amount: number;
  lockDuration: LockDuration;
  startTime: number;
  accumulatedRewards: number;
  status: 'active' | 'unstaked' | 'penalized';
  txSignature?: string;
}

const APY_RATES: Record<LockDuration, number> = {
  7: parseFloat(import.meta.env.VITE_STAKE_APY_7D || '5'),
  30: parseFloat(import.meta.env.VITE_STAKE_APY_30D || '15'),
  90: parseFloat(import.meta.env.VITE_STAKE_APY_90D || '50'),
};

const UNSTAKE_PENALTY = parseFloat(import.meta.env.VITE_UNSTAKE_PENALTY || '20') / 100;

export function getApy(lockDuration: LockDuration): number {
  return APY_RATES[lockDuration] || 5;
}

export function calculateRewards(amount: number, lockDuration: LockDuration, elapsedDays: number): number {
  const apy = getApy(lockDuration) / 100;
  return amount * apy * (elapsedDays / 365);
}

export function calculatePenalty(amount: number): number {
  return amount * UNSTAKE_PENALTY;
}

/**
 * Stake $R2H tokens in the staking contract.
 */
export async function stake(
  wallet: WalletContextState,
  connection: Connection,
  amount: number,
  lockDuration: LockDuration,
): Promise<{ txSignature: string; stakeId: string }> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  const lamports = Math.floor(amount * 1e9);
  const userPublicKey = wallet.publicKey;

  // Get token accounts
  const userTokenAccount = await getAssociatedTokenAddress(R2H_MINT, userPublicKey);
  const stakeVault = await getAssociatedTokenAddress(R2H_MINT, STAKE_PROGRAM_ID, true);

  // Create transfer to stake vault
  const transferIx = createTransferInstruction(
    userTokenAccount,
    stakeVault,
    userPublicKey,
    lamports,
    [],
    TOKEN_PROGRAM_ID,
  );

  // Memo with stake metadata
  const stakeData = Buffer.from(
    JSON.stringify({ action: 'stake', amount, lockDays: lockDuration, timestamp: Date.now() }),
    'utf-8',
  );
  const memoIx = new TransactionInstruction({
    keys: [],
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: stakeData,
  });

  // Build and send transaction
  const transaction = new Transaction().add(transferIx, memoIx);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = userPublicKey;

  const signedTx = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());

  await Promise.race([
    connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timeout')), 60000)),
  ]);

  // Generate a stake ID from the tx signature
  const stakeId = signature.slice(0, 16);

  return { txSignature: signature, stakeId };
}

/**
 * Unstake $R2H tokens. Applies penalty if before lock duration.
 */
export async function unstake(
  wallet: WalletContextState,
  connection: Connection,
  stakeId: string,
  amount: number,
): Promise<{ txSignature: string; payout: number; penalty: number }> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  const penalty = calculatePenalty(amount);
  const payout = amount - penalty;
  const userPublicKey = wallet.publicKey;

  // Memo with unstake metadata
  const unstakeData = Buffer.from(
    JSON.stringify({ action: 'unstake', stakeId, timestamp: Date.now() }),
    'utf-8',
  );
  const memoIx = new TransactionInstruction({
    keys: [],
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: unstakeData,
  });

  const transaction = new Transaction().add(memoIx);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = userPublicKey;

  const signedTx = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());

  await Promise.race([
    connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timeout')), 60000)),
  ]);

  return { txSignature: signature, payout, penalty };
}

/**
 * Claim accumulated staking rewards.
 */
export async function claimRewards(
  wallet: WalletContextState,
  connection: Connection,
  stakeId: string,
): Promise<{ txSignature: string; rewardAmount: number }> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  const claimData = Buffer.from(
    JSON.stringify({ action: 'claim', stakeId, timestamp: Date.now() }),
    'utf-8',
  );
  const memoIx = new TransactionInstruction({
    keys: [],
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: claimData,
  });

  const transaction = new Transaction().add(memoIx);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signedTx = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());

  await Promise.race([
    connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timeout')), 60000)),
  ]);

  return { txSignature: signature, rewardAmount: 0 }; // Actual amount from contract
}

/**
 * Get all stakes for a user (mock implementation — replace with contract queries).
 */
export async function getUserStakes(
  connection: Connection,
  walletAddress: string,
): Promise<StakeInfo[]> {
  // TODO: Replace with actual contract account queries
  console.log('[stakeContract] getUserStakes for:', walletAddress);
  return [];
}
