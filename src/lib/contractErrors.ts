export class InsufficientBalanceError extends Error {
  constructor(message = 'Insufficient $R2H balance for this bet') {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class ContractPausedError extends Error {
  constructor(message = 'Betting is currently paused. Try again later.') {
    super(message);
    this.name = 'ContractPausedError';
  }
}

export class BetLimitExceededError extends Error {
  constructor(message = 'Bet amount exceeds the maximum limit') {
    super(message);
    this.name = 'BetLimitExceededError';
  }
}

export class TransactionTimeoutError extends Error {
  constructor(message = 'Transaction timed out. Please try again.') {
    super(message);
    this.name = 'TransactionTimeoutError';
  }
}

export class ContractError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}

// Map Solana/Anchor error codes to user-friendly messages
const ERROR_MAP: Record<number, string> = {
  6000: 'Insufficient balance for this bet',
  6001: 'Betting is currently paused',
  6002: 'Bet amount exceeds maximum limit',
  6003: 'Bet amount below minimum',
  6004: 'Invalid bet type',
  6005: 'Bet already resolved',
  6006: 'Contract is paused',
  6007: 'Unauthorized: only house can resolve',
  6008: 'Bet has expired',
};

export function getErrorMessage(error: any): string {
  // Check for known Anchor/Solana error codes
  if (error?.code || error?.error?.errorCode?.number) {
    const code = error.code || error.error.errorCode.number;
    return ERROR_MAP[code] || `Contract error (${code})`;
  }

  // Check for custom error classes
  if (error instanceof InsufficientBalanceError) return error.message;
  if (error instanceof ContractPausedError) return error.message;
  if (error instanceof BetLimitExceededError) return error.message;
  if (error instanceof TransactionTimeoutError) return error.message;

  // Check for common Solana errors
  if (error?.message?.includes('insufficient funds')) {
    return 'Insufficient SOL for transaction fees';
  }
  if (error?.message?.includes('User rejected')) {
    return 'Transaction rejected by user';
  }
  if (error?.message?.includes('timeout') || error?.message?.includes('Timeout')) {
    return 'Transaction timed out. Please try again.';
  }
  if (error?.message?.includes('0x1')) {
    return 'Insufficient $R2H balance';
  }

  // Fallback
  return error?.message || 'Unknown error occurred';
}
