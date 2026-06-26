import { useState } from 'react';
import BalanceDisplay from './GameOverlay/BalanceDisplay';
import BottomBar from './GameOverlay/BottomBar';
import WinLossModal from './GameOverlay/WinLossModal';

interface BetResult {
  won: boolean;
  amount: number;
  betType: string;
  txSignature: string;
}

export default function GameOverlay() {
  const [betResult, setBetResult] = useState<BetResult | null>(null);

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
      <BalanceDisplay />
      <BottomBar onBetResult={setBetResult} />
      <WinLossModal result={betResult} onClose={() => setBetResult(null)} />
    </div>
  );
}
