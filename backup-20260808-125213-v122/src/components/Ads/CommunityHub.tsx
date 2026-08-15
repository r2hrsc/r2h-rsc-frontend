import { useState, useEffect } from 'react';

type Zone = 'top' | 'left' | 'right' | 'bottom';

const WELCOME_TEXT = 'Welcome to R2H RSC — play in your browser, no download needed';

export function CommunityHub({ zone }: { zone: Zone }) {
  const [liveStats, setLiveStats] = useState({ playersOnline: 0, uptime: '99.9%', build: 'v2.4.1', discordMembers: 847 });

  useEffect(() => {
    const sid = import.meta.env.VITE_SIDECAR_URL || 'https://sidecar.r2hrsc.xyz';
    fetch(sid + '/players').then(r => r.json()).then(d => {
      if (d.playersOnline !== undefined) setLiveStats(s => ({...s, playersOnline: d.playersOnline}));
    }).catch(() => {});
  }, []);

  if (zone === 'top') return <TopBar liveStats={liveStats} />;
  if (zone === 'left') return null;
  if (zone === 'right') return null;
  if (zone === 'bottom') return <BottomBar />;
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
function TopBar({ liveStats }: { liveStats: { playersOnline: number; uptime: string; build: string; discordMembers: number } }) {
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
        <StatValue color="#14F195">{liveStats.playersOnline}</StatValue>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginLeft: 4 }}>ONLINE</span>
      </div>

      <div style={{ width: 1, height: 24, background: '#222' }} />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatValue color="#aaa">{liveStats.uptime}</StatValue>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginLeft: 4 }}>UPTIME</span>
      </div>

      <div style={{ width: 1, height: 24, background: '#222' }} />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatValue color="#aaa">{liveStats.build}</StatValue>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginLeft: 4 }}>BUILD</span> <a href="https://classic.runescape.wiki" target="_blank" rel="noopener noreferrer" style={{ color: '#14F195', fontSize: 10, marginLeft: 6, textDecoration: 'none' }}>WIKI</a>
      </div>
    </div>
  );
}

// ── Bottom bar: static welcome + RSC wiki link ──
function BottomBar() {
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
      }}>
        <span style={{ color: '#14F195', marginRight: 8 }}>›</span>
        {WELCOME_TEXT}
        {'  '}
        <a
          href="https://classic.runescape.wiki"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#14F195', textDecoration: 'none', marginLeft: 12 }}
        >
          RSC Wiki
        </a>
      </span>
    </div>
  );
}
