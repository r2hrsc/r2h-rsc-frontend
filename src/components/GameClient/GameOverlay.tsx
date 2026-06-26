import { useState } from 'react';
import BalanceDisplay from './GameOverlay/BalanceDisplay';
import BottomBar from './GameOverlay/BottomBar';
import WinLossModal from './GameOverlay/WinLossModal';
import StakingPanel from './GameOverlay/StakingPanel';

interface BetResult {
  won: boolean;
  amount: number;
  betType: string;
  txSignature: string;
}

export default function GameOverlay() {
  const [betResult, setBetResult] = useState<BetResult | null>(null);
  const [showStakingPanel, setShowStakingPanel] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        boxSizing: 'border-box',
      }}
    >
      <BalanceDisplay onStakingClick={() => setShowStakingPanel(true)} />
      <BottomBar onBetResult={setBetResult} />
      <WinLossModal result={betResult} onClose={() => setBetResult(null)} />

      {/* Staking panel with backdrop */}
      {showStakingPanel && (
        <>
          {/* Backdrop — click to close */}
          <div
            onClick={() => setShowStakingPanel(false)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'auto',
              zIndex: 29,
            }}
          />
          <StakingPanel onClose={() => setShowStakingPanel(false)} />
        </>
      )}
    </div>
  );
}
