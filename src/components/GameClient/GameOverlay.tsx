import BalanceDisplay from './GameOverlay/BalanceDisplay';

export default function GameOverlay() {
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
    </div>
  );
}
