import { useState } from 'react';
import { usePlaceBet, BetResult } from '../../../hooks/usePlaceBet';
import LoadingSpinner from '../../UI/LoadingSpinner';

const QUICK_BETS = ['1k', '10k', '100k', 'MAX'];

interface BottomBarProps {
  onBetResult?: (result: BetResult) => void;
}

export default function BottomBar({ onBetResult }: BottomBarProps) {
  const [betAmount, setBetAmount] = useState('');
  const { placeBet, isPlacing, error, result, clearResult } = usePlaceBet();

  const handleConfirm = async () => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) return;

    await placeBet(amount, 'pking');
  };

  // Pass result up to parent when it arrives
  if (result && onBetResult) {
    onBetResult(result);
    clearResult();
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'auto',
        flexWrap: 'wrap',
      }}
    >
      {/* Bet amount input */}
      <input
        type="text"
        placeholder="Amount"
        value={betAmount}
        onChange={(e) => setBetAmount(e.target.value)}
        disabled={isPlacing}
        className="game-overlay-button"
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          color: '#e5e5e5',
          padding: '6px 8px',
          borderRadius: 4,
          fontSize: 12,
          width: 70,
          outline: 'none',
          minHeight: 44,
          touchAction: 'manipulation',
          opacity: isPlacing ? 0.5 : 1,
        }}
      />

      {/* Quick bet buttons */}
      {QUICK_BETS.map((label) => (
        <button
          key={label}
          onClick={() => setBetAmount(label === 'MAX' ? 'MAX' : label)}
          disabled={isPlacing}
          className="game-overlay-button"
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            color: '#e5e5e5',
            padding: '6px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: isPlacing ? 'wait' : 'pointer',
            minHeight: 44,
            touchAction: 'manipulation',
            opacity: isPlacing ? 0.5 : 1,
          }}
        >
          {label}
        </button>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Confirm bet */}
      <button
        onClick={handleConfirm}
        disabled={isPlacing || !betAmount}
        className="game-overlay-button"
        style={{
          background: '#14F195',
          border: 'none',
          color: '#0a0a0a',
          padding: '6px 14px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          cursor: isPlacing ? 'wait' : 'pointer',
          letterSpacing: 0.5,
          minHeight: 44,
          touchAction: 'manipulation',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: isPlacing || !betAmount ? 0.6 : 1,
        }}
      >
        {isPlacing && <LoadingSpinner size="sm" />}
        {isPlacing ? 'Placing Bet...' : 'CONFIRM BET'}
      </button>

      {/* Error message */}
      {error && (
        <span style={{ color: '#ff4444', fontSize: 10, width: '100%', textAlign: 'right', marginTop: -2 }}>
          Bet failed: {error}
        </span>
      )}
    </div>
  );
}
