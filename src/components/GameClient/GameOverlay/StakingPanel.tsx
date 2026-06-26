import { useState } from 'react';
import { useStaking } from '../../../hooks/useStaking';
import { getApy, type LockDuration } from '../../../lib/contracts/stakeContract';
import LoadingSpinner from '../../UI/LoadingSpinner';

const LOCK_OPTIONS: LockDuration[] = [7, 30, 90];

interface StakingPanelProps {
  onClose: () => void;
}

export default function StakingPanel({ onClose }: StakingPanelProps) {
  const { stakes, totalStaked, totalRewards, stake, unstake, claimRewards, isLoading, error, clearError } = useStaking();
  const [stakeAmount, setStakeAmount] = useState('');
  const [lockDuration, setLockDuration] = useState<LockDuration>(30);

  const handleStake = async () => {
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) return;

    const success = await stake(amount, lockDuration);
    if (success) setStakeAmount('');
  };

  const handleUnstake = async (stakeId: string, amount: number) => {
    await unstake(stakeId, amount);
  };

  const handleClaim = async (stakeId: string) => {
    await claimRewards(stakeId);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(10, 10, 10, 0.97)',
        border: '1px solid #333',
        borderRadius: 8,
        padding: 20,
        pointerEvents: 'auto',
        zIndex: 30,
        width: 320,
        maxHeight: 300,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#e5e5e5', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>STAKING</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <span style={{ color: '#888', fontSize: 10 }}>TOTAL STAKED</span>
          <div style={{ color: '#14F195', fontSize: 16, fontWeight: 700 }}>{totalStaked.toFixed(2)}</div>
        </div>
        <div>
          <span style={{ color: '#888', fontSize: 10 }}>REWARDS</span>
          <div style={{ color: '#14F195', fontSize: 16, fontWeight: 700, animation: totalRewards > 0 ? 'pulse 1.5s infinite' : 'none' }}>
            {totalRewards.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Active stakes */}
      {stakes.filter((s) => s.status === 'active').length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 10, fontWeight: 600 }}>ACTIVE STAKES</span>
          {stakes.filter((s) => s.status === 'active').map((s) => (
            <div key={s.stakeId} style={{ background: '#1a1a1a', borderRadius: 4, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#e5e5e5', fontSize: 12 }}>{s.amount.toFixed(2)} $R2H</div>
                <div style={{ color: '#666', fontSize: 10 }}>{s.lockDuration}d lock • {s.accumulatedRewards.toFixed(4)} rewards</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => handleClaim(s.stakeId)}
                  disabled={isLoading || s.accumulatedRewards <= 0}
                  style={{ background: 'transparent', border: '1px solid #14F195', color: '#14F195', padding: '3px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer', opacity: s.accumulatedRewards > 0 ? 1 : 0.4 }}
                >
                  CLAIM
                </button>
                <button
                  onClick={() => handleUnstake(s.stakeId, s.amount)}
                  disabled={isLoading}
                  style={{ background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', padding: '3px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer' }}
                >
                  UNSTAKE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New stake */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ color: '#888', fontSize: 10, fontWeight: 600 }}>NEW STAKE</span>
        <input
          type="text"
          placeholder="Amount"
          value={stakeAmount}
          onChange={(e) => setStakeAmount(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#e5e5e5', padding: '6px 8px', borderRadius: 4, fontSize: 12, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {LOCK_OPTIONS.map((days) => (
            <button
              key={days}
              onClick={() => setLockDuration(days)}
              style={{
                flex: 1,
                background: lockDuration === days ? '#14F195' : '#1a1a1a',
                border: `1px solid ${lockDuration === days ? '#14F195' : '#333'}`,
                color: lockDuration === days ? '#0a0a0a' : '#e5e5e5',
                padding: '6px 0',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {days}d ({getApy(days)}%)
            </button>
          ))}
        </div>
        <button
          onClick={handleStake}
          disabled={isLoading || !stakeAmount}
          style={{
            background: '#14F195',
            border: 'none',
            color: '#0a0a0a',
            padding: '8px 0',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            cursor: isLoading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: isLoading || !stakeAmount ? 0.6 : 1,
          }}
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
