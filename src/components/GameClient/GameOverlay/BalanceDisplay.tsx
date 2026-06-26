import { useR2HBalance } from '../../../hooks/useR2HBalance';
import { useStaking } from '../../../hooks/useStaking';

interface BalanceDisplayProps {
  onStakingClick?: () => void;
}

export default function BalanceDisplay({ onStakingClick }: BalanceDisplayProps) {
  const { balance, isLoading, error } = useR2HBalance();
  const { totalStaked, totalRewards } = useStaking();

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        background: 'rgba(10, 10, 10, 0.8)',
        padding: '6px 10px',
        borderRadius: 4,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <span style={{ color: '#e5e5e5', fontSize: 11, fontWeight: 500 }}>
        $R2H Balance:{' '}
        {error ? (
          <span style={{ color: '#ff4444' }}>{error}</span>
        ) : isLoading ? (
          <span style={{ color: '#14F195', animation: 'pulse 1.5s ease-in-out infinite' }}>Loading...</span>
        ) : (
          <span style={{ color: '#14F195' }}>{balance.toFixed(2)}</span>
        )}
        {totalStaked > 0 && (
          <span style={{ color: '#888' }}> | Staked: <span style={{ color: '#14F195' }}>{totalStaked.toFixed(2)}</span></span>
        )}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#e5e5e5', fontSize: 11, fontWeight: 500 }}>
          Rewards:{' '}
          <span style={{ color: '#14F195', animation: totalRewards > 0 ? 'pulse 1.5s infinite' : 'none' }}>
            {totalRewards.toFixed(4)}
          </span>
        </span>

        {onStakingClick && (
          <button
            onClick={onStakingClick}
            style={{
              background: 'transparent',
              border: '1px solid #14F195',
              color: '#14F195',
              padding: '2px 6px',
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 600,
              cursor: 'pointer',
              pointerEvents: 'auto',
              letterSpacing: 0.5,
            }}
          >
            STAKING
          </button>
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
