import { useState, useEffect } from 'react';

type Zone = 'top' | 'left' | 'right' | 'bottom';

// Static stats — replace with API calls later
const STATS = {
  playersOnline: 23,
  uptime: '99.9%',
  build: 'v2.4.1',
  discordMembers: 847,
};

const ANNOUNCEMENTS = [
  'Welcome to R2H RSC — play in your browser, no download needed',
  'New quest guide added to the wiki — check Discord',
  'Server updated to build v2.4.1 — report bugs in #bug-reports',
  'Vote for us on RuneLocus and TopRSPS to help grow the community',
  'Join our Discord for events, giveaways and support',
];

export function CommunityHub({ zone }: { zone: Zone }) {
  const [announceIndex, setAnnounceIndex] = useState(0);

  useEffect(() => {
    if (zone !== 'bottom') return;
    const interval = setInterval(() => {
      setAnnounceIndex(i => (i + 1) % ANNOUNCEMENTS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [zone]);

  if (zone === 'top') return <TopBar />;
  if (zone === 'left') return <LeftColumn />;
  if (zone === 'right') return <RightColumn />;
  if (zone === 'bottom') return <BottomBar index={announceIndex} />;
  return null;
}

function StatDot({ color = '#14F195' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: color,
      marginRight: 6,
      boxShadow: `0 0 6px ${color}`,
      flexShrink: 0,
    }} />
  );
}

function StatLabel({ children, color = '#666' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 11,
      color,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontFamily: 'monospace',
      fontWeight: 500,
    }}>{children}</span>
  );
}

function StatValue({ children, color = '#fff' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 14,
      color,
      fontFamily: 'monospace',
      fontWeight: 700,
    }}>{children}</span>
  );
}

// ── Top bar: live stats ──
function TopBar() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
      width: '100%',
      height: '100%',
      padding: '0 16px',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatDot />
        <StatValue color="#14F195">{STATS.playersOnline}</StatValue>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginLeft: 4 }}>ONLINE</span>
      </div>

      <div style={{ width: 1, height: 24, background: '#222' }} />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatValue color="#aaa">{STATS.uptime}</StatValue>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginLeft: 4 }}>UPTIME</span>
      </div>

      <div style={{ width: 1, height: 24, background: '#222' }} />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatValue color="#aaa">{STATS.build}</StatValue>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginLeft: 4 }}>BUILD</span>
      </div>
    </div>
  );
}

// ── Left column: Discord community ──
function LeftColumn() {
  return (
    <a
      href="https://discord.gg/r2hrsc"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        height: '100%',
        textDecoration: 'none',
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* Discord mark */}
      <svg width="32" height="24" viewBox="0 0 32 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M26.5 2.5C24.5 1.6 22.4 0.9 20.2 0.5L19.9 1.1C21.9 1.5 23.7 2.1 25.4 3C23.4 2 21.2 1.3 18.8 1.3C16.4 1.3 14.2 2 12.2 3C13.9 2.1 15.7 1.5 17.7 1.1L17.4 0.5C15.2 0.9 13.1 1.6 11.1 2.5C7.2 8.4 6.2 14.2 6.7 19.9C9 21.6 11.3 22.6 13.5 23.3L14.1 22.1C12.8 21.7 11.5 21.1 10.3 20.3L10.7 20C11.8 20.5 12.9 20.9 14.1 21.2C16.9 21.9 19.9 21.9 22.7 21.2C23.9 20.9 25 20.5 26.1 20L26.5 20.3C25.3 21.1 24 21.7 22.7 22.1L23.3 23.3C25.5 22.6 27.8 21.6 30.1 19.9C30.7 13.3 29.1 7.6 26.5 2.5ZM12.5 16.3C11.1 16.3 9.9 15 9.9 13.3C9.9 11.6 11 10.3 12.5 10.3C14 10.3 15.1 11.6 15.1 13.3C15.1 15 14 16.3 12.5 16.3ZM22.3 16.3C20.9 16.3 19.7 15 19.7 13.3C19.7 11.6 20.8 10.3 22.3 10.3C23.8 10.3 24.9 11.6 24.9 13.3C24.9 15 23.8 16.3 22.3 16.3Z" fill="#5865F2"/>
      </svg>

      <StatValue color="#5865F2">{STATS.discordMembers.toLocaleString()}</StatValue>
      <StatLabel color="#444">Members</StatLabel>

      <div style={{
        marginTop: 4,
        padding: '4px 10px',
        border: '1px solid #5865F2',
        color: '#5865F2',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 1,
        whiteSpace: 'nowrap',
      }}>
        Join
      </div>
    </a>
  );
}

// ── Right column: Vote links ──
function RightColumn() {
  const voteLinks = [
    { name: 'RuneLocus', url: 'https://r2hrsc.xyz/vote' },
    { name: 'TopRSPS', url: 'https://r2hrsc.xyz/vote' },
    { name: 'RSPSList', url: 'https://r2hrsc.xyz/vote' },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      height: '100%',
      padding: 12,
      boxSizing: 'border-box',
    }}>
      <StatLabel color="#14F195">Vote for Us</StatLabel>

      <div style={{
        width: 28,
        height: 2,
        background: '#14F195',
        marginBottom: 4,
      }} />

      {voteLinks.map(link => (
        <a
          key={link.name}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#888',
            fontSize: 12,
            fontFamily: 'monospace',
            textDecoration: 'none',
            padding: '3px 8px',
            border: '1px solid #222',
            whiteSpace: 'nowrap',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#14F195';
            e.currentTarget.style.borderColor = '#1f3a2a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#888';
            e.currentTarget.style.borderColor = '#222';
          }}
        >
          {link.name}
        </a>
      ))}

      <span style={{ fontSize: 9, color: '#333', fontFamily: 'monospace', marginTop: 4, textAlign: 'center' }}>
        Help us grow
      </span>
    </div>
  );
}

// ── Bottom bar: rotating announcements ──
function BottomBar({ index }: { index: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '0 16px',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <span style={{
        fontSize: 11,
        color: '#777',
        fontFamily: 'monospace',
        textAlign: 'center',
        maxWidth: 700,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: 1,
        transition: 'opacity 0.5s',
      }}>
        <span style={{ color: '#14F195', marginRight: 8 }}>›</span>
        {ANNOUNCEMENTS[index]}
      </span>
    </div>
  );
}
