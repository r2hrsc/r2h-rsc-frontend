import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatSocket, type ChatMessage } from '../Chat/useChatSocket';

// ── Phase 2 letterbox dock ───────────────────────────────────────────────
// Replaces the single ACTIVITY column with a tabbed dock: ACTIVITY | CHAT | TOP.
// Chat docks here on desktop (floating bubble retired); on mobile the bubble
// remains (no side column exists). TOP = live hiscores from the sidecar.

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

interface FeedRow {
  id: number;
  ts: number;
  text: string;
  highlight: boolean;
}

interface HighscoreRow {
  rank: number;
  username: string;
  totalLevel: number;
  totalXp: number;
}

type Tab = 'activity' | 'chat' | 'top' | 'player';

// Player lookup tab — search any player, full 18-skill profile.
// Data: sidecar GET /v1/players/:u (summary) + /v1/players/:u/skills.

interface PlayerSkill { id: number; key: string; name: string; level: number; xp: number }
interface PlayerSummary { username: string; totalLevel: number; totalXp: number; online: boolean }

function usePlayerLookup() {
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState<PlayerSummary | null>(null);
  const [skills, setSkills] = useState<PlayerSkill[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (raw: string) => {
    const u = raw.trim().toLowerCase();
    if (!u) return;
    setLoading(true); setError(''); setSummary(null); setSkills(null);
    try {
      const [sumRes, skRes] = await Promise.all([
        fetch(`${API_URL}/v1/players/${encodeURIComponent(u)}`),
        fetch(`${API_URL}/v1/players/${encodeURIComponent(u)}/skills`),
      ]);
      if (!sumRes.ok) {
        setError(sumRes.status === 404 ? 'Player not found.' : 'Lookup failed.');
        return;
      }
      setSummary(await sumRes.json());
      if (skRes.ok) {
        const d = await skRes.json();
        if (Array.isArray(d.skills)) {
          // RSC core 18 only (server extras like harvesting/runecraft stay out)
          setSkills(d.skills.filter((s: PlayerSkill) => s.id < 18));
        }
      }
    } catch {
      setError('Lookup failed — check connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { query, setQuery, summary, skills, loading, error, search };
}

function PlayerPane({ me }: { me: string | null }) {
  const { query, setQuery, summary, skills, loading, error, search } = usePlayerLookup();
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('r2h.playerLookup.recent') || '[]'); } catch { return []; }
  });

  const doSearch = (name: string) => {
    const n = name.trim().toLowerCase();
    if (!n) return;
    search(n);
    setRecent(prev => {
      const next = [n, ...prev.filter(p => p !== n)].slice(0, 5);
      try { localStorage.setItem('r2h.playerLookup.recent', JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  return (
    <div className="ld-player">
      <form className="ld-player-search" onSubmit={e => { e.preventDefault(); doSearch(query); }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search player…"
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={loading || !query.trim()} aria-label="Search">🔍</button>
      </form>

      {(recent.length > 0 || me) && (
        <div className="ld-player-recent">
          {me && (
            <button className="ld-chip ld-chip-me" onClick={() => { setQuery(me); doSearch(me); }}>{me}</button>
          )}
          {recent.map(r => (
            <button key={r} className="ld-chip" onClick={() => { setQuery(r); doSearch(r); }}>{r}</button>
          ))}
        </div>
      )}

      {loading && <div className="ld-empty">Looking up…</div>}
      {!loading && error && <div className="ld-empty">{error}</div>}

      {!loading && summary && (
        <div className="ld-player-card">
          <div className="ld-player-head">
            <span className="ld-player-name">{summary.username}</span>
            <span className={summary.online ? 'ld-online' : 'ld-offline'}>
              {summary.online ? 'online' : 'offline'}
            </span>
          </div>
          <div className="ld-player-totals">
            <span>Total <b>{summary.totalLevel}</b></span>
            <span>XP <b>{fmtNum(summary.totalXp)}</b></span>
          </div>
          {skills && (
            <div className="ld-skill-grid">
              {skills.map(s => (
                <div key={s.key} className="ld-skill" data-max={s.level >= 99 ? '1' : undefined}>
                  <span className="ld-skill-name">{s.name}</span>
                  <span className="ld-skill-lvl">{s.level}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function fmtNum(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Shared activity feed rows (from R2H_ACTIVITY postMessages). */
function useActivityFeedRows(itemNames: Record<string, string>) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const rowId = useRef(0);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'R2H_ACTIVITY') return;
      const events = e.data.events || [];
      const newRows: FeedRow[] = [];
      for (const ev of events) {
        if (ev.kind === 'level') {
          newRows.push({ id: rowId.current++, ts: Date.now(), highlight: true,
            text: `${ev.skillName} level ${ev.level}!` });
        } else if (ev.kind === 'xp') {
          newRows.push({ id: rowId.current++, ts: Date.now(), highlight: false,
            text: `+${fmtNum(ev.xpGain)} ${ev.skillName} XP` });
        } else if (ev.kind === 'lootBatch' && ev.items) {
          const parts = ev.items.slice(0, 4)
            .map((it: { itemId: number; count: number }) =>
              `${itemNames[String(it.itemId)] || 'item ' + it.itemId}${it.count > 1 ? ' ×' + it.count : ''}`);
          const more = ev.items.length > 4 ? ` +${ev.items.length - 4}` : '';
          newRows.push({ id: rowId.current++, ts: Date.now(), highlight: false,
            text: `Loot: ${parts.join(', ')}${more}` });
        }
      }
      if (newRows.length > 0) setRows(prev => [...newRows, ...prev].slice(0, 40));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [itemNames]);

  return rows;
}

/** Hiscores — first page, 60s refresh. */
function useHiscores() {
  const [rows, setRows] = useState<HighscoreRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/highscores/overall?limit=25`);
        if (!res.ok) return;
        const d = await res.json();
        if (alive && Array.isArray(d.data)) setRows(d.data);
      } catch { /* keep last */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return rows;
}

/** The dock. Absolute-positioned against the game frame, right letterbox. */
export function LetterboxDock({
  sideWidth,
  itemNames,
  username,
}: {
  sideWidth: number;
  itemNames: Record<string, string>;
  username: string | null;
}) {
  const [tab, setTab] = useState<Tab>('activity');
  const activityRows = useActivityFeedRows(itemNames);
  const hiscores = useHiscores();
  const { messages, onlineUsers, connected, error: chatError, sendMessage } = useChatSocket(username ?? undefined);

  // Auto-switch to chat tab when a new message arrives while docked
  const lastMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > lastMsgCount.current && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last && last.username !== username && tab !== 'chat' && tab !== 'top') {
        // subtle: don't yank the user out of TOP, but do announce on ACTIVITY
        setTab(t => (t === 'top' ? t : 'chat'));
      }
    }
    lastMsgCount.current = messages.length;
  }, [messages, username, tab]);

  if (sideWidth < 100) return null;

  return (
    <div
      className="letterbox-dock"
      style={{
        position: 'absolute',
        top: 0,
        right: -sideWidth - 12,
        width: sideWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
    >
      {/* Tab bar */}
      <div className="ld-tabs">
        <button className={tab === 'activity' ? 'ld-tab ld-tab-active' : 'ld-tab'} onClick={() => setTab('activity')}>ACTIVITY</button>
        <button className={tab === 'chat' ? 'ld-tab ld-tab-active' : 'ld-tab'} onClick={() => setTab('chat')}>
          CHAT{onlineUsers.length > 0 ? ` ${onlineUsers.length}` : ''}
        </button>
        <button className={tab === 'top' ? 'ld-tab ld-tab-active' : 'ld-tab'} onClick={() => setTab('top')}>TOP</button>
        <button className={tab === 'player' ? 'ld-tab ld-tab-active' : 'ld-tab'} onClick={() => setTab('player')}>PLAYER</button>
      </div>

      {/* Pane: ACTIVITY */}
      {tab === 'activity' && (
        <div className="ld-pane">
          {activityRows.length === 0 && <div className="ld-empty">Play to see your XP drops and loot here.</div>}
          {activityRows.map(r => (
            <div key={r.id} className={r.highlight ? 'ld-row ld-row-level' : 'ld-row'}>
              <span className="ld-ago">{fmtAgo(r.ts)}</span>
              <span className="ld-text">{r.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pane: CHAT */}
      {tab === 'chat' && <ChatPane messages={messages} connected={connected} error={chatError} username={username} sendMessage={sendMessage} />}

      {/* Pane: TOP (hiscores) */}
      {tab === 'top' && (
        <div className="ld-pane">
          {hiscores === null && <div className="ld-empty">Loading hiscores…</div>}
          {hiscores && hiscores.length === 0 && <div className="ld-empty">No ranked players yet.</div>}
          {hiscores && hiscores.map(h => (
            <div key={h.username} className={h.username === username ? 'ld-row ld-row-me' : 'ld-row'}>
              <span className="ld-rank">{h.rank}</span>
              <span className="ld-text">{h.username}</span>
              <span className="ld-level">{h.totalLevel}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pane: PLAYER (lookup) */}
      {tab === 'player' && <PlayerPane me={username} />}
    </div>
  );
}

/** Chat pane — reuses the same socket as the old widget; compact styling. */
function ChatPane({
  messages, connected, error, username, sendMessage,
}: {
  messages: ChatMessage[];
  connected: boolean;
  error: string | null;
  username: string | null;
  sendMessage: (content: string) => void;
}) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const c = input.trim();
    if (!c) return;
    sendMessage(c);
    setInput('');
  };

  return (
    <>
      <div className="ld-chat-warning">⚠ UNMODERATED — DO NOT TRUST ANYTHING YOU SEE</div>
      <div className="ld-pane ld-chat-log">
        {!connected && <div className="ld-empty">{error ? error : 'Connecting…'}</div>}
        {connected && messages.length === 0 && <div className="ld-empty">No messages yet. Say hello!</div>}
        {messages.map(m => (
          <div key={m.id} className="ld-chat-msg" style={{ opacity: m.shadowed ? 0.4 : 1 }}>
            <span className={m.username === username ? 'ld-chat-user ld-chat-user-me' : 'ld-chat-user'}>{m.username}</span>
            <span className="ld-chat-body">{m.content}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="ld-chat-input">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          maxLength={500}
          placeholder={connected ? 'Message…' : 'Connecting…'}
          disabled={!connected}
        />
        <button onClick={send} disabled={!connected || !input.trim()} aria-label="Send">➤</button>
      </div>
    </>
  );
}
