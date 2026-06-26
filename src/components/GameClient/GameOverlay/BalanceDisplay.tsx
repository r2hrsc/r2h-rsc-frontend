import { useR2HBalance } from '../../../hooks/useR2HBalance';

interface BalanceDisplayProps {
  totalStaked?: number;
}

export default function BalanceDisplay({ totalStaked = 0 }: BalanceDisplayProps) {
  const { balance, isLoading, error } = useR2HBalance();

  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        background: 'rgba(10, 10, 10, 0.85)',
        padding: '4px 8px',
        borderRadius: 3,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
      }}
    >
      <span style={{ color: '#888' }}>$R2H:</span>
      {error ? (
        <span style={{ color: '#ff4444' }}>—</span>
      ) : isLoading ? (
        <span style={{ color: '#14F195' }}>...</span>
      ) : (
        <span style={{ color: '#14F195', fontWeight: 600 }}>{balance.toFixed(2)}</span>
      )}

      {totalStaked > 0 && (
        <>
          <span style={{ color: '#333' }}>|</span>
          <span style={{ color: '#888' }}>Staked:</span>
          <span style={{ color: '#14F195' }}>{totalStaked.toFixed(2)}</span>
        </>
      )}
    </div>
  );
}
