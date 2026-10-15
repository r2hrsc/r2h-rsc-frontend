# In-game radio — design

**Date:** 2026-10-15
**Status:** approved, ready for implementation plan

## Goal

Let players put music on while they play, from a control inside the game page.

## Decision: stream, don't host

Audio files were the obvious first idea and are the wrong one. Five tracks loop
inside twenty minutes, cost bandwidth on every listen, and need curating. A
licensed internet radio station gives unlimited variety, costs nothing to serve,
and needs no curation.

**SomaFM** is the source. Running since 2000, 51 channels, commercial-free,
listener-funded, and it publishes permanent stream URLs while explicitly asking
sites to link directly to them (somafm.com/linktous). The licence is theirs.

Verified before committing to this, not assumed:

- A plain `<audio>` element reached `CANPLAY` on `https://runescapeclassic.gold`
  against `ice6.somafm.com/thistle-128-mp3` — cross-origin, no proxy, no key.
- Streams return `Access-Control-Allow-Origin: *`.
- Each station's `.pls` lists three mirrors (ice2 / ice5 / ice6), so a dead
  mirror is recoverable rather than fatal.
- `somafm.com/channels.json` is a public JSON API carrying titles, descriptions,
  listener counts and current track.

A bare `curl` of a stream 302s to `somafm.com/alert.mp3` — their anti-scraping
response to a non-browser client. Browsers get the stream. Do not treat that
redirect as a failure when testing by hand.

## Stations

Eight, curated for this game rather than copied from the popularity list.

| id | name | why |
|---|---|---|
| `thistle` | ThistleRadio | Celtic folk — the musical ancestry RuneScape was imitating |
| `folkfwd` | Folk Forward | Indie folk and folk classics |
| `dronezone` | Drone Zone | Atmospheric, minimal beats — long grinding sessions |
| `deepspaceone` | Deep Space One | Deep ambient |
| `groovesalad` | Groove Salad | Chilled downtempo, their flagship |
| `darkzone` | The Dark Zone | Dark ambient — the wilderness |
| `doomed` | Doomed | Dark industrial — dungeons |
| `metal` | Metal Detector | Metal — for PKing |

Stream URL pattern, confirmed for all eight:
`https://ice{2,5,6}.somafm.com/{id}-128-mp3`

Station metadata is fetched from `channels.json` at open so names and listener
counts stay live. **The eight ids above are hardcoded as the fallback list** —
if the API is unreachable the picker still works, it just shows static names.

## Architecture

### Where it lives: the parent page, NOT the game iframe

Non-negotiable, and the reason is specific to this codebase. The game iframe
remounts on reconnects, world switches and the tab-away path. Audio inside it
would cut out every time. In the parent it plays uninterrupted across all of
that.

### Components

**`src/lib/radio/stations.ts`**
Pure data and URL construction. The eight stations, the mirror list, and
`streamUrls(id)` returning the three mirror URLs in order. No React, no audio,
no network. Trivially testable.

**`src/lib/radio/useRadio.ts`**
A hook owning one `HTMLAudioElement` for the page's lifetime. Exposes
`{ station, playing, volume, error, play(id), stop(), setVolume(v), playCustom(url) }`.
Owns mirror fallback, persistence and error state. Knows nothing about layout.

**`src/components/Radio/RadioPanel.tsx`**
Presentation only. Station list, play/stop, volume slider, custom URL field,
error line. Takes everything from the hook as props.

**`src/components/GameClient/GameControls.tsx`** — add a "Music" entry beside
Scripts and Keyboard. One line plus a handler, matching the existing pattern.

**`src/App.tsx`** — mount `RadioPanel` next to the existing panels, with its own
open/closed state, matching how ScriptPanel is already wired.

### Data flow

```
GameControls "Music" → App opens RadioPanel
RadioPanel → useRadio.play(id)
useRadio → stations.streamUrls(id) → audio.src = mirror[0]
  on error → mirror[1] → mirror[2] → surface error
volume / station id → localStorage
```

## Error handling

Each case has a defined behaviour. None of them may break the game.

| case | behaviour |
|---|---|
| mirror unreachable | try the next; only after all three show "Station unavailable" |
| stream dies mid-play | same fallback chain, then stop and surface it |
| autoplay blocked | cannot happen — play is always a click. If `play()` rejects anyway, surface it rather than failing silently |
| `channels.json` unreachable | use the hardcoded eight; picker still works |
| custom URL not audio | the audio element errors; show "Could not play that URL" and keep the previous station selectable |
| `localStorage` blocked | wrap every read and write in try/catch; the radio works, it just forgets |

**The radio must never be able to break the game.** All audio work stays in its
own module behind try/catch; nothing in `useRadio` may throw into App's render.

## Persistence

`localStorage`, per-viewer, best-effort:
- `r2h_radio_station` — last station id
- `r2h_radio_volume` — 0..1

Restored on open. **Never auto-plays** — restoring a station selects it, the
player still presses play. Browsers block autoplay regardless, and a game that
makes noise unprompted is worse than one that doesn't.

## Testing

- `stations.ts` — unit: every id yields three well-formed mirror URLs in order.
- `useRadio` — the mirror fallback drives off `<audio>` error events; test with a
  stub audio object, asserting the sequence mirror0 → mirror1 → mirror2 → error.
- Live check, in a real browser on the real origin: `CANPLAY` against at least
  two stations. This is the check that actually matters and it was the first
  thing done for this design — repeat it after implementation.
- Confirm music survives a game remount: start playing, switch worlds, confirm
  audio continues.

## Non-goals

Deliberately excluded. Each is a separate feature:

- Hosted audio files of any kind
- Music that reacts to location, combat or events
- Playlists, favourites, track history, skip
- Sound effects. `sounds1.mem` ships in the client cache and nothing references
  it; wiring up authentic RSC sound effects is unrelated to this and should not
  be folded in.
- Sharing or syncing what you're listening to
