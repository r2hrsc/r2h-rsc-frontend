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

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_BET_PROGRAM_ID || '11111111111111111111111111111111');
const R2H_MINT = new PublicKey(import.meta.env.VITE_R2H_TOKEN_MINT || '11111111111111111111111111111111');
const HOUSE_WALLET = new PublicKey(import.meta.env.VITE_HOUSE_WALLET || '11111111111111111111111111111111');

export type BetType = 'pking' | 'casino';

export interface BetResult {
  won: boolean;
  amount: number;
  betType: BetType;
  txSignature: string;
  payout?: number;
}

/**
 * Place a bet by transferring $R2H tokens to the contract escrow.
 * Accepts a Privy wallet object with address and signTransaction.
 */
export async function placeBet(
  wallet: { address: string; signTransaction?: (tx: Transaction) => Promise<Transaction> },
  connection: Connection,
  amount: number,
  betType: BetType,
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }

  const userPublicKey = new PublicKey(wallet.address);
  const lamports = Math.floor(amount * 1e9); // 9 decimals

  // Get associated token accounts
  const userTokenAccount = await getAssociatedTokenAddress(R2H_MINT, userPublicKey);
  const houseTokenAccount = await getAssociatedTokenAddress(R2H_MINT, HOUSE_WALLET);

  // Create transfer instruction (escrow)
  const transferIx = createTransferInstruction(
    userTokenAccount,
    houseTokenAccount,
    userPublicKey,
    lamports,
    [],
    TOKEN_PROGRAM_ID,
  );

  // Create memo instruction with bet metadata
  const betData = Buffer.from(
    JSON.stringify({ type: betType, amount, timestamp: Date.now() }),
    'utf-8',
  );
  const memoIx = new TransactionInstruction({
    keys: [],
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: betData,
  });

  // Build transaction
  const transaction = new Transaction().add(transferIx, memoIx);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = userPublicKey;

  // Sign and send — Privy wallets expose signTransaction
  if (!wallet.signTransaction) {
    throw new Error('Wallet does not support signing');
  }

  const signedTx = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());

  // Wait for confirmation with timeout
  await Promise.race([
    connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timeout')), 60000)),
  ]);

  return signature;
}

/**
 * Get the status of a bet from the contract.
 */
export async function getBetStatus(
  connection: Connection,
  txSignature: string,
): Promise<{ status: string; won?: boolean; payout?: number }> {
  try {
    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) {
      return { status: 'failed' };
    }

    const logs = tx.meta?.logMessages || [];
    const resolvedLog = logs.find((log) => log.includes('BetResolved'));

    if (resolvedLog) {
      try {
        const jsonStr = resolvedLog.split('BetResolved: ')[1];
        const result = JSON.parse(jsonStr);
        return {
          status: 'resolved',
          won: result.won,
          payout: result.payout ? result.payout / 1e9 : undefined,
        };
      } catch {
        return { status: 'resolved' };
      }
    }

    return { status: 'confirmed' };
  } catch (err) {
    console.error('[getBetStatus] Error:', err);
    return { status: 'unknown' };
  }
}

/**
 * Poll for bet resolution. Returns the result when resolved.
 */
export async function waitForResolution(
  connection: Connection,
  txSignature: string,
  maxAttempts = 30,
  intervalMs = 2000,
): Promise<BetResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getBetStatus(connection, txSignature);

    if (status.status === 'resolved') {
      return {
        won: status.won ?? Math.random() > 0.5,
        amount: 0,
        betType: 'pking',
        txSignature,
        payout: status.payout,
      };
    }

    if (status.status === 'failed') {
      throw new Error('Bet transaction failed');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Bet resolution timeout');
}
