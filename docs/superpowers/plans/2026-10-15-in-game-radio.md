# In-Game Radio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give players a music control in the game page that streams licensed internet radio, with no audio files hosted anywhere.

**Architecture:** Three new modules under `src/lib/radio/` and `src/components/Radio/`, wired into the existing gear menu. Pure data separated from the audio element, separated from presentation. Audio lives in the PARENT page, never the game iframe, because the iframe remounts on reconnects and world switches.

**Tech Stack:** React + TypeScript (Vite). Tests are plain Node scripts in `tools/`, matching `tools/test-area-logic.cjs` and `tools/test-bot-pointer.cjs`. TypeScript modules are run under `npx tsx` (verified working in this repo; `tsx` is not installed locally, `npx` fetches it).

**Spec:** `docs/superpowers/specs/2026-10-15-in-game-radio-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/radio/stations.ts` | CREATE — station list + mirror URL construction. Pure data, no React, no network, no audio. |
| `src/lib/radio/useRadio.ts` | CREATE — owns one `HTMLAudioElement`, mirror fallback, persistence, error state. No layout. |
| `src/components/Radio/RadioPanel.tsx` | CREATE — presentation only. Station list, play/stop, volume, custom URL, error line. |
| `src/components/GameClient/GameControls.tsx` | MODIFY — add `onMusic` prop and one menu entry. |
| `src/App.tsx` | MODIFY — mount `RadioPanel`, add open/close state, pass `onMusic`. |
| `tools/test-radio-stations.mjs` | CREATE — tests for `stations.ts`. |
| `tools/test-radio-fallback.mjs` | CREATE — tests the mirror fallback state machine. |

---

### Task 1: Station data and URL construction

**Files:**
- Create: `src/lib/radio/stations.ts`
- Test: `tools/test-radio-stations.mjs`

- [ ] **Step 1: Write the failing test**

Create `tools/test-radio-stations.mjs`:

```javascript
// Tests for the radio station table and mirror URL construction.
// Run: npx tsx tools/test-radio-stations.mjs
import { STATIONS, MIRRORS, streamUrls } from '../src/lib/radio/stations.ts';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

ok('eight stations', STATIONS.length === 8);
ok('three mirrors', MIRRORS.length === 3);

const ids = STATIONS.map(s => s.id);
for (const want of ['thistle','folkfwd','dronezone','deepspaceone','groovesalad','darkzone','doomed','metal']) {
  ok(`station present: ${want}`, ids.includes(want));
}
ok('ids are unique', new Set(ids).size === ids.length);
ok('every station has a name', STATIONS.every(s => typeof s.name === 'string' && s.name.length > 0));
ok('every station has a blurb', STATIONS.every(s => typeof s.blurb === 'string' && s.blurb.length > 0));

const u = streamUrls('thistle');
ok('three urls returned', u.length === 3);
ok('mirror order is ice2, ice5, ice6', u[0].includes('ice2.') && u[1].includes('ice5.') && u[2].includes('ice6.'));
ok('url shape is correct', u[0] === 'https://ice2.somafm.com/thistle-128-mp3');
ok('all urls are https', u.every(x => x.startsWith('https://')));
ok('every station builds three urls', STATIONS.every(s => streamUrls(s.id).length === 3));

// An unknown id still builds urls — the custom-URL path must not depend on the table.
ok('unknown id still builds urls', streamUrls('nosuchstation').length === 3);

console.log(`\nstations: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd /home/jeetmachine/hermes-workspace/robinscape-build && npx --yes tsx tools/test-radio-stations.mjs`
Expected: FAIL — `Cannot find module '../src/lib/radio/stations.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/radio/stations.ts`:

```typescript
// Radio station table and stream URL construction.
//
// Pure data. No React, no audio, no network — so it is trivially testable and
// cannot break the game. Everything that can fail lives in useRadio.ts.
//
// Source: SomaFM, commercial-free licensed internet radio running since 2000.
// They publish permanent stream URLs and ask sites to link directly to them
// (somafm.com/linktous), so the licence is theirs and we host nothing.

export interface Station {
  /** SomaFM channel id, also the stream path segment. */
  id: string;
  name: string;
  /** One line on why it is here — shown under the name in the picker. */
  blurb: string;
}

/** Stream mirrors, in the order to try them. A dead mirror is recoverable. */
export const MIRRORS = ['ice2', 'ice5', 'ice6'] as const;

/**
 * Eight stations curated for THIS game rather than copied from SomaFM's
 * popularity list. All eight verified resolving to live streams 2026-10-15.
 */
export const STATIONS: Station[] = [
  { id: 'thistle',      name: 'ThistleRadio',    blurb: 'Celtic folk — the roots RuneScape was imitating' },
  { id: 'folkfwd',      name: 'Folk Forward',    blurb: 'Indie folk and folk classics' },
  { id: 'dronezone',    name: 'Drone Zone',      blurb: 'Atmospheric, minimal beats — for long grinds' },
  { id: 'deepspaceone', name: 'Deep Space One',  blurb: 'Deep ambient' },
  { id: 'groovesalad',  name: 'Groove Salad',    blurb: 'Chilled downtempo' },
  { id: 'darkzone',     name: 'The Dark Zone',   blurb: 'Dark ambient — the wilderness' },
  { id: 'doomed',       name: 'Doomed',          blurb: 'Dark industrial — dungeons' },
  { id: 'metal',        name: 'Metal Detector',  blurb: 'Metal — for PKing' },
];

/**
 * The three mirror URLs for a channel id, in the order to try them.
 *
 * Deliberately does NOT check the id against STATIONS: the custom-URL feature
 * and any future station must work without being in the table.
 */
export function streamUrls(id: string): string[] {
  return MIRRORS.map((m) => `https://${m}.somafm.com/${id}-128-mp3`);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx --yes tsx tools/test-radio-stations.mjs`
Expected: `stations: 16 pass, 0 fail`

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio/stations.ts tools/test-radio-stations.mjs
git commit -m "feat(radio): station table and mirror URL construction"
```

---

### Task 2: Mirror fallback logic

The fallback is the one piece of real logic in the audio layer, so it is
extracted as a pure function and tested on its own, separately from React and
from the audio element.

**Files:**
- Modify: `src/lib/radio/stations.ts` (append)
- Test: `tools/test-radio-fallback.mjs`

- [ ] **Step 1: Write the failing test**

Create `tools/test-radio-fallback.mjs`:

```javascript
// Tests for the mirror fallback state machine.
// Run: npx tsx tools/test-radio-fallback.mjs
import { nextMirror } from '../src/lib/radio/stations.ts';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

ok('first failure advances to mirror 1', nextMirror(0) === 1);
ok('second failure advances to mirror 2', nextMirror(1) === 2);
ok('third failure gives up', nextMirror(2) === null);
ok('out of range gives up', nextMirror(99) === null);
ok('negative gives up', nextMirror(-1) === null);

console.log(`\nfallback: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx --yes tsx tools/test-radio-fallback.mjs`
Expected: FAIL — `nextMirror is not a function`

- [ ] **Step 3: Write the implementation**

Append to `src/lib/radio/stations.ts`:

```typescript
/**
 * Which mirror to try after the one at `index` failed, or null when all are
 * exhausted and the failure should surface to the player.
 *
 * Extracted as a pure function so the fallback can be tested without an audio
 * element or a network.
 */
export function nextMirror(index: number): number | null {
  if (!Number.isInteger(index) || index < 0) return null;
  const next = index + 1;
  return next < MIRRORS.length ? next : null;
}
```

- [ ] **Step 4: Run both test files to confirm they pass**

Run: `npx --yes tsx tools/test-radio-stations.mjs && npx --yes tsx tools/test-radio-fallback.mjs`
Expected: `stations: 16 pass, 0 fail` then `fallback: 5 pass, 0 fail`

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio/stations.ts tools/test-radio-fallback.mjs
git commit -m "feat(radio): mirror fallback state machine"
```

---

### Task 3: The useRadio hook

**Files:**
- Create: `src/lib/radio/useRadio.ts`

No test file. This hook is a thin shell around browser audio and `localStorage`;
its one piece of real logic (`nextMirror`) is already tested in Task 2. It is
verified in the browser in Task 6.

- [ ] **Step 1: Write the implementation**

Create `src/lib/radio/useRadio.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextMirror, streamUrls } from './stations';

const LS_STATION = 'r2h_radio_station';
const LS_VOLUME = 'r2h_radio_volume';

/** localStorage is blocked in private windows and can throw. Never let it break the radio. */
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked — radio still works, it just forgets */ }
}

export interface RadioState {
  /** Station id, or 'custom', or null when nothing is selected. */
  station: string | null;
  playing: boolean;
  volume: number;
  error: string | null;
  play: (id: string) => void;
  playCustom: (url: string) => void;
  stop: () => void;
  setVolume: (v: number) => void;
}

/**
 * Owns one HTMLAudioElement for the page's lifetime.
 *
 * THIS MUST LIVE IN THE PARENT PAGE, NOT THE GAME IFRAME. The iframe remounts
 * on reconnects, world switches and the tab-away path; audio inside it would
 * cut out every time.
 *
 * Nothing here may throw into render — every browser call is guarded, because
 * the radio must never be able to break the game.
 */
export function useRadio(): RadioState {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mirrorRef = useRef(0);
  const urlsRef = useRef<string[]>([]);

  const [station, setStation] = useState<string | null>(() => lsGet(LS_STATION));
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState<number>(() => {
    const v = Number(lsGet(LS_VOLUME));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5;
  });

  // One audio element for the page's lifetime.
  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    a.volume = volume;
    audioRef.current = a;
    return () => {
      try { a.pause(); a.src = ''; } catch { /* ignore */ }
      audioRef.current = null;
    };
    // Intentionally empty deps: one element, created once, never recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attach = useCallback((urls: string[], label: string) => {
    const a = audioRef.current;
    if (!a) return;
    urlsRef.current = urls;
    mirrorRef.current = 0;
    setError(null);
    setStation(label);
    lsSet(LS_STATION, label);

    const onError = () => {
      const next = nextMirror(mirrorRef.current);
      if (next === null) {
        setPlaying(false);
        setError('Station unavailable — try another.');
        return;
      }
      mirrorRef.current = next;
      try { a.src = urlsRef.current[next]; void a.play(); } catch { /* handled by the next error event */ }
    };
    const onPlaying = () => { setPlaying(true); setError(null); };

    a.onerror = onError;
    a.onplaying = onPlaying;

    try {
      a.src = urls[0];
      void a.play().catch(() => {
        // Should not happen — play is always user-initiated — but surface it
        // rather than leaving a dead button.
        setPlaying(false);
        setError('Could not start playback.');
      });
    } catch {
      setPlaying(false);
      setError('Could not start playback.');
    }
  }, []);

  const play = useCallback((id: string) => attach(streamUrls(id), id), [attach]);

  const playCustom = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Enter a stream URL starting with http:// or https://');
      return;
    }
    // A custom URL has no mirrors — one entry, so the first failure surfaces.
    attach([trimmed], 'custom');
  }, [attach]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    try { a?.pause(); if (a) a.src = ''; } catch { /* ignore */ }
    setPlaying(false);
    setError(null);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    lsSet(LS_VOLUME, String(clamped));
    try { if (audioRef.current) audioRef.current.volume = clamped; } catch { /* ignore */ }
  }, []);

  return { station, playing, volume, error, play, playCustom, stop, setVolume };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v BotPanel`
Expected: no output for any file under `src/lib/radio/`. `BotPanel.tsx` has pre-existing errors unrelated to this work and is filtered.

- [ ] **Step 3: Commit**

```bash
git add src/lib/radio/useRadio.ts
git commit -m "feat(radio): useRadio hook with mirror fallback and persistence"
```

---

### Task 4: The radio panel

**Files:**
- Create: `src/components/Radio/RadioPanel.tsx`

- [ ] **Step 1: Write the implementation**

Create `src/components/Radio/RadioPanel.tsx`:

```typescript
import { useState } from 'react';
import { STATIONS } from '../../lib/radio/stations';
import { useRadio } from '../../lib/radio/useRadio';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Station picker, volume, and a custom stream field.
 *
 * Presentation only — all audio behaviour lives in useRadio. Renders null when
 * closed so the audio element is still created once by the hook, but nothing
 * paints.
 */
export default function RadioPanel({ open, onClose }: Props) {
  const radio = useRadio();
  const [custom, setCustom] = useState('');

  if (!open) return null;

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <span style={S.title}>♪ Radio</span>
        <button onClick={onClose} style={S.close} aria-label="Close">×</button>
      </div>

      <div style={S.list}>
        {STATIONS.map((s) => {
          const active = radio.station === s.id && radio.playing;
          return (
            <button
              key={s.id}
              onClick={() => (active ? radio.stop() : radio.play(s.id))}
              style={{ ...S.station, ...(active ? S.stationActive : null) }}
            >
              <span style={S.stationName}>{active ? '■ ' : '▶ '}{s.name}</span>
              <span style={S.stationBlurb}>{s.blurb}</span>
            </button>
          );
        })}
      </div>

      <div style={S.row}>
        <span style={S.label}>VOLUME</span>
        <input
          type="range" min={0} max={1} step={0.01} value={radio.volume}
          onChange={(e) => radio.setVolume(Number(e.target.value))}
          style={S.slider}
          aria-label="Volume"
        />
      </div>

      <div style={S.row}>
        <input
          type="url"
          placeholder="Or paste any stream URL"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={S.input}
          aria-label="Custom stream URL"
        />
        <button onClick={() => radio.playCustom(custom)} style={S.go}>Play</button>
      </div>

      {radio.error && <div style={S.err}>{radio.error}</div>}

      <p style={S.credit}>
        Stations from <a href="https://somafm.com" target="_blank" rel="noreferrer" style={S.link}>SomaFM</a> — listener-supported, commercial-free.
      </p>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed', right: 12, bottom: 12, zIndex: 9100,
    width: 'min(340px, calc(100vw - 24px))', maxHeight: '70vh', overflowY: 'auto',
    background: 'rgba(10,14,12,0.97)', border: '1px solid #14F195', borderRadius: 8,
    padding: '12px 14px',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: '#14F195', fontWeight: 700, fontSize: 14 },
  close: { background: 'none', border: 'none', color: '#888', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '0 4px' },
  list: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 },
  station: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    background: '#141414', border: '1px solid #222', borderRadius: 6,
    padding: '8px 10px', cursor: 'pointer', textAlign: 'left', minHeight: 44,
  },
  stationActive: { border: '1px solid #14F195', background: 'rgba(20,241,149,0.08)' },
  stationName: { color: '#e5e5e5', fontSize: 13, fontWeight: 600 },
  stationBlurb: { color: '#888', fontSize: 11 },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { color: '#666', fontSize: 9, letterSpacing: 1 },
  slider: { flex: 1 },
  input: {
    flex: 1, minWidth: 0, background: '#141414', border: '1px solid #222',
    borderRadius: 4, color: '#e5e5e5', padding: '7px 8px', fontSize: 12,
  },
  go: {
    background: '#14F195', border: 'none', color: '#04140d', borderRadius: 4,
    padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 32,
  },
  err: { color: '#f66', fontSize: 12, marginBottom: 6 },
  credit: { color: '#555', fontSize: 10, margin: '6px 0 0', lineHeight: 1.5 },
  link: { color: '#14F195' },
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v BotPanel`
Expected: no output for `RadioPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Radio/RadioPanel.tsx
git commit -m "feat(radio): station picker panel"
```

---

### Task 5: Wire it into the gear menu

**Files:**
- Modify: `src/components/GameClient/GameControls.tsx` (props interface ~line 15, destructure ~line 48, menu array ~line 198)
- Modify: `src/App.tsx` (import ~line 21, state ~line 753, `onMusic` ~line 929, mount ~line 983)

- [ ] **Step 1: Add the prop to GameControls**

In `src/components/GameClient/GameControls.tsx`, in `interface GameControlsProps`, immediately after the `onScripts: () => void;` line, add:

```typescript
  onMusic: () => void;
```

In the component's destructured parameters, immediately after `onScripts,`, add:

```typescript
  onMusic,
```

In the menu items array, immediately after the `{ key: "scripts", ... }` entry, add:

```typescript
      { key: "music", label: "Music", icon: <MusicIcon />, fn: onMusic },
```

- [ ] **Step 2: Add the icon**

In the same file, beside the other icon components (next to `BoltIcon`), add:

```typescript
const MusicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
```

- [ ] **Step 3: Wire App.tsx**

In `src/App.tsx`, beside the other component imports (near the `ScriptPanel` import on line 21), add:

```typescript
import RadioPanel from "./components/Radio/RadioPanel";
```

Beside `const [scriptPanelOpen, setScriptPanelOpen] = useState(false);`, add:

```typescript
  const [radioOpen, setRadioOpen] = useState(false);
```

In the `<GameControls ... />` props, immediately after `onScripts={() => setScriptPanelOpen(true)}`, add:

```typescript
          onMusic={() => setRadioOpen((o) => !o)}
```

Immediately before the `<ScriptPanel` element, add:

```typescript
        <RadioPanel open={radioOpen} onClose={() => setRadioOpen(false)} />
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit 2>&1 | grep -v BotPanel && npx vite build 2>&1 | grep -E "built in|error"`
Expected: no type errors outside `BotPanel.tsx`; build succeeds.

- [ ] **Step 5: Confirm the CSS hash did not move**

Run: `grep -oE 'assets/index-[A-Za-z0-9_-]+\.(js|css)' dist/index.html | sort -u`
Expected: the CSS filename is still `index-DpAqE8Zi.css`. The deploy process treats a changed CSS hash as a stop condition because the live CSS is hand-patched. The JS filename will be new; record it for the deploy.

- [ ] **Step 6: Commit**

```bash
git add src/components/GameClient/GameControls.tsx src/App.tsx
git commit -m "feat(radio): add Music to the gear menu and mount the panel"
```

---

### Task 6: Verify in a real browser

Local-only. No deploy in this task.

- [ ] **Step 1: Start the dev server**

Run: `npx vite --port 5174 --strictPort`

- [ ] **Step 2: Confirm the stations still stream**

In the browser console on `http://localhost:5174`, run:

```javascript
const results = {};
for (const id of ['thistle','folkfwd','dronezone','deepspaceone','groovesalad','darkzone','doomed','metal']) {
  const a = new Audio(); a.volume = 0.0001;
  a.src = `https://ice2.somafm.com/${id}-128-mp3`;
  results[id] = await new Promise(res => {
    a.addEventListener('canplay', () => res('CANPLAY'));
    a.addEventListener('error', () => res('ERROR'));
    a.play().catch(e => res('REJECTED:' + e.name));
    setTimeout(() => res('TIMEOUT'), 8000);
  });
  try { a.pause(); a.src = ''; } catch {}
}
return results;
```

Expected: `CANPLAY` for all eight. Any `ERROR` means that station id is wrong or the channel was retired — fix the table in `stations.ts` and re-run Task 1's tests.

- [ ] **Step 3: Confirm the panel renders and nothing throws**

Open the gear menu, click Music, confirm the panel opens with eight stations and the console has no new errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix(radio): corrections from browser verification"
```

(Skip if nothing needed fixing.)

---

### Task 7: Deploy

**This repo deploys through a handoff to Hermes, never directly.** See the existing `HERMES-*.md` files at `/home/jeetmachine/hermes-workspace/` for the format.

- [ ] **Step 1: Write the handoff**

Create `/home/jeetmachine/hermes-workspace/HERMES-DEPLOY-radio-20261015.md` covering:
- Source commit and the real entry JS filename read from `dist/index.html`
- CSS filename unchanged at `index-DpAqE8Zi.css`
- Bundle only — `assets/` and `index.html`. **No `/game/` change in this release.**
- Standing rules: single webroot `/var/www/runescapeclassic-frontend`, `rsync -a --ignore-existing`, never `--delete`, never sync `dist/game/`
- Verification: console shows no new errors; the served bundle contains the string `Radio`; `/game/` md5 unchanged
- Rollback: previous entry JS filename

- [ ] **Step 2: Hand it to the founder to paste**

Send the file with SendUserFile. Do not attempt to deploy directly.

---

## Non-goals

Explicitly out of scope. Do not add these while implementing:

- Hosted audio files of any kind
- Music reacting to location, combat or events
- Playlists, favourites, history, skip
- Wiring up `sounds1.mem` (authentic RSC sound effects, shipped in the client cache and currently unreferenced) — a separate feature
- Sharing or syncing what a player is listening to
