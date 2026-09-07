import { useState, useMemo } from 'react';
import { ZoomPanel } from './ZoomPanel';

// ── Left letterbox column ────────────────────────────────────────────────
// Reference panel: welcome + RSC Wiki links + XP calculator (real RSC
// formula — xp for level L = sum floor(L-1 + 300*2^((L-1)/7)) / 4, capped 99)
// and a self-XP readout fed from the game page's activity monitor.

const WIKI = 'https://classic.runescape.wiki';

const WIKI_LINKS: { label: string; href: string; desc: string }[] = [
  { label: 'Skills', href: `${WIKI}/w/Skills`, desc: 'training guides & mechanics' },
  { label: 'Quests', href: `${WIKI}/w/Quests`, desc: 'walkthroughs & requirements' },
  { label: 'Items', href: `${WIKI}/w/Items`, desc: 'equipment & values' },
  { label: 'XP Table', href: `${WIKI}/w/Experience`, desc: 'levels → experience' },
  { label: 'World Map', href: `${WIKI}/w/World_Map`, desc: 'locations & travel' },
];

// Real RSC xp math — matches the wiki table exactly (verified: L2=83, L50=101333, L99=13034431)
// xp(L) = floor( Σ_{i=1}^{L-1} floor(i + 300·2^(i/7)) / 4 )
const XP_TABLE: number[] = (() => {
  const t: number[] = [0, 0]; // index 0 unused, level 1 = 0 xp
  let points = 0;
  for (let i = 1; i <= 98; i++) {
    points += Math.floor(i + 300 * Math.pow(2, i / 7));
    t[i + 1] = Math.floor(points / 4);
  }
  return t;
})();

function xpForLevel(level: number): number {
  return XP_TABLE[Math.max(1, Math.min(99, Math.round(level)))] || 0;
}

function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i <= 99; i++) if (xp >= XP_TABLE[i]) lvl = i;
  return lvl;
}

const SKILL_NAMES = ['Attack', 'Defense', 'Strength', 'Hits', 'Ranged', 'Prayer', 'Magic',
  'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing',
  'Mining', 'Herblaw', 'Agility', 'Thieving'];

type Section = 'welcome' | 'calc';

export function LeftColumn({ sideWidth }: { sideWidth: number }) {
  const [section, setSection] = useState<Section>('welcome');

  if (sideWidth < 100) return null;

  return (
    <div
      className="left-col"
      style={{
        position: 'absolute',
        // v395: span the FULL viewport vertically (see LetterboxDock note)
        top: 'calc(50% - 50vh)',
        height: '100vh',
        left: -sideWidth - 12,
        width: sideWidth,
        pointerEvents: 'auto',
      }}
    >
      {/* Content at constant physical size — column CSS px grow as the game
          shrinks under browser zoom-out; ZoomPanel fills it at 100%-zoom scale */}
      <ZoomPanel className="left-col-inner">
      <div className="lc-tabs">
        <button className={section === 'welcome' ? 'lc-tab lc-tab-active' : 'lc-tab'} onClick={() => setSection('welcome')}>GUIDE</button>
        <button className={section === 'calc' ? 'lc-tab lc-tab-active' : 'lc-tab'} onClick={() => setSection('calc')}>XP CALC</button>
      </div>

      {section === 'welcome' && <WelcomePane />}
      {section === 'calc' && <CalcPane />}
      </ZoomPanel>
    </div>
  );
}

function WelcomePane() {
  return (
    <div className="lc-pane">
      <div className="lc-welcome">
        <span className="lc-welcome-mark">›</span>
        <span>Welcome to <b>Robinscape</b> — play in your browser, no download needed.</span>
      </div>

      <div className="lc-section-title">RSC WIKI</div>
      {WIKI_LINKS.map(l => (
        <a key={l.href} className="lc-link" href={l.href} target="_blank" rel="noopener noreferrer">
          <span className="lc-link-label">{l.label}</span>
          <span className="lc-link-desc">{l.desc}</span>
        </a>
      ))}
    </div>
  );
}

function CalcPane() {
  const [xp, setXp] = useState('');
  const parsed = useMemo(() => {
    const n = parseInt(xp.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }, [xp]);

  const lvl = parsed !== null ? levelForXp(parsed) : null;
  const nextXp = lvl !== null && lvl < 99 ? xpForLevel(lvl + 1) : null;
  const remaining = nextXp !== null && parsed !== null ? nextXp - parsed : null;

  return (
    <div className="lc-pane">
      <div className="lc-section-title">XP → LEVEL</div>
      <input
        className="lc-calc-input"
        type="text"
        inputMode="numeric"
        value={xp}
        onChange={e => setXp(e.target.value)}
        placeholder="Enter experience…"
        autoComplete="off"
      />
      {parsed !== null && (
        <div className="lc-calc-result">
          <div className="lc-calc-big">{lvl}<span> level</span></div>
          {remaining !== null && remaining > 0 ? (
            <div className="lc-calc-next">{remaining.toLocaleString()} XP to level {lvl! + 1}</div>
          ) : (
            <div className="lc-calc-next lc-calc-max">Max level reached</div>
          )}
        </div>
      )}
      {parsed !== null && lvl !== null && (
        <>
          <div className="lc-section-title" style={{ marginTop: 10 }}>LEVEL MILESTONES</div>
          {[50, 60, 70, 80, 90, 99].filter(m => m > lvl).slice(0, 4).map(m => (
            <div key={m} className="lc-key-row">
              <kbd className="lc-kbd">{m}</kbd>
              <span className="lc-key-desc">{(xpForLevel(m) - parsed).toLocaleString()} XP away</span>
            </div>
          ))}
        </>
      )}
      <div className="lc-calc-note">
        Formula matches the RSC XP table. Skill XP comes from actions — see the{' '}
        <a href={`${WIKI}/w/Experience`} target="_blank" rel="noopener noreferrer">wiki XP page</a>.
      </div>
      <div className="lc-calc-skillhint">{SKILL_NAMES.length} skills · cap 99</div>
    </div>
  );
}
