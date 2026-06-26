import { useState } from 'react';
import { useStaking } from '../../../hooks/useStaking';
import { getApy, type LockDuration } from '../../../lib/contracts/stakeContract';
import LoadingSpinner from '../../UI/LoadingSpinner';

const LOCK_OPTIONS: LockDuration[] = [7, 30, 90];

export default function StakingPanel() {
  const { stakes, totalStaked, totalRewards, stake, unstake, claimRewards, isLoading, error, clearError } = useStaking();
  const [stakeAmount, setStakeAmount] = useState('');
  const [lockDuration, setLockDuration] = useState<LockDuration>(30);

  const handleStake = async () => {
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) return;
    const success = await stake(amount, lockDuration);
    if (success) setStakeAmount('');
  };

  return (
    <div style={container}>
      {/* Header */}
      <div style={header}>
        <span style={title}>STAKING</span>
        <div style={summaryRow}>
          <div style={summaryItem}>
            <span style={label}>STAKED</span>
            <span style={value}>{totalStaked.toFixed(2)}</span>
          </div>
          <div style={summaryItem}>
            <span style={label}>REWARDS</span>
            <span style={{ ...value, animation: totalRewards > 0 ? 'pulse 1.5s infinite' : 'none' }}>
              {totalRewards.toFixed(4)}
            </span>
          </div>
        </div>
      </div>

      {/* Active stakes */}
      {stakes.filter((s) => s.status === 'active').length > 0 && (
        <div style={section}>
          <span style={sectionTitle}>ACTIVE STAKES</span>
          {stakes.filter((s) => s.status === 'active').map((s) => (
            <div key={s.stakeId} style={stakeRow}>
              <div>
                <div style={{ color: '#e5e5e5', fontSize: 12 }}>{s.amount.toFixed(2)} $R2H</div>
                <div style={{ color: '#666', fontSize: 10 }}>{s.lockDuration}d lock • {s.accumulatedRewards.toFixed(4)} rewards</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => claimRewards(s.stakeId)}
                  disabled={isLoading || s.accumulatedRewards <= 0}
                  style={{ ...btnSmall, border: '1px solid #14F195', color: '#14F195', opacity: s.accumulatedRewards > 0 ? 1 : 0.4 }}
                >
                  CLAIM
                </button>
                <button
                  onClick={() => unstake(s.stakeId, s.amount)}
                  disabled={isLoading}
                  style={{ ...btnSmall, border: '1px solid #ff4444', color: '#ff4444' }}
                >
                  UNSTAKE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New stake */}
      <div style={section}>
        <span style={sectionTitle}>NEW STAKE</span>
        <input
          type="text"
          placeholder="Amount"
          value={stakeAmount}
          onChange={(e) => setStakeAmount(e.target.value)}
          style={input}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {LOCK_OPTIONS.map((days) => (
            <button
              key={days}
              onClick={() => setLockDuration(days)}
              style={{
                ...lockBtn,
                background: lockDuration === days ? '#14F195' : '#1a1a1a',
                border: `1px solid ${lockDuration === days ? '#14F195' : '#333'}`,
                color: lockDuration === days ? '#0a0a0a' : '#e5e5e5',
              }}
            >
              {days}d ({getApy(days)}%)
            </button>
          ))}
        </div>
        <button
          onClick={handleStake}
          disabled={isLoading || !stakeAmount}
          style={{ ...stakeBtn, opacity: isLoading || !stakeAmount ? 0.6 : 1 }}
        >
          {isLoading && <LoadingSpinner size="sm" />}
          {isLoading ? 'Staking...' : 'STAKE'}
        </button>
      </div>

      {/* Warning */}
      <span style={{ color: '#ff4444', fontSize: 10, textAlign: 'center' }}>
        ⚠ Early unstake incurs 20% penalty (tokens burned)
      </span>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#ff4444', fontSize: 10 }}>{error}</span>
          <button onClick={clearError} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 10 }}>dismiss</button>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

// Styles
const container: React.CSSProperties = {
  background: '#111',
  border: '1px solid #222',
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: '100%',
  maxWidth: 512,
  boxSizing: 'border-box',
};

const header: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const title: React.CSSProperties = {
  color: '#e5e5e5',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1,
};

const summaryRow: React.CSSProperties = {
  display: 'flex',
  gap: 20,
};

const summaryItem: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const label: React.CSSProperties = {
  color: '#666',
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: 0.5,
};

const value: React.CSSProperties = {
  color: '#14F195',
  fontSize: 16,
  fontWeight: 700,
};

const section: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const sectionTitle: React.CSSProperties = {
  color: '#666',
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: 0.5,
};

const stakeRow: React.CSSProperties = {
  background: '#1a1a1a',
  borderRadius: 4,
  padding: '8px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const btnSmall: React.CSSProperties = {
  background: 'transparent',
  padding: '3px 8px',
  borderRadius: 3,
  fontSize: 10,
  cursor: 'pointer',
  border: 'none',
};

const input: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  color: '#e5e5e5',
  padding: '8px 10px',
  borderRadius: 4,
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const lockBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px 0',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

const stakeBtn: React.CSSProperties = {
  background: '#14F195',
  border: 'none',
  color: '#0a0a0a',
  padding: '10px 0',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};
