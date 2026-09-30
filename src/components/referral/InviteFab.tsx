// Phones only: a small fixed "Invite" pill, bottom-left, mirroring the chat
// bubble (bottom-right). It sits in the empty space below the game in portrait
// and is not rendered in landscape/fullscreen, so it never covers the game.
// Deliberately NOT inside .game-frame (overflow:hidden on mobile) and NOT in
// the controls hub menu (a 7th item would be clipped by the short frame).
export function InviteFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Invite friends"
      style={{
        position: 'fixed',
        left: 16,
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 42,
        padding: '0 16px',
        borderRadius: 24,
        background: '#16120A',
        border: '1px solid #5A4520',
        color: '#F1CB7E',
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        cursor: 'pointer',
        touchAction: 'manipulation',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
      </svg>
      Invite
    </button>
  );
}
