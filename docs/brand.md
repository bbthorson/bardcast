# Bardcast brand: The Tavern Table

**Status: locked** (July 2026). This is the decision record and usage guide. Tokens and assets
live in [`packages/brand`](../packages/brand); this doc says *why* and *how*, the package says *what*.

## The decision

Three directions were explored — the Tavern Table (cozy, candlelit, friends-around-a-table), the
Illuminated Chronicle (vellum-and-leaf-gold manuscript), and the Arcane Signal (dark audio-product
UI with one glowing accent). **The Tavern Table won**, because it is the only direction whose warmth
is aimed at the players rather than at the genre or the technology. Two moves were kept from the
losing directions:

1. **From the Chronicle:** chapter titles open with an illuminated drop-cap in candle gold
   (`.bc-dropcap` in `tokens.css`), so each release feels like a page added to the group's book.
2. **From the Arcane Signal:** SRD dice results and readiness stats are set in mono as an
   instrument-panel readout (`.bc-dice-log`), so the resolution engine is visible without being loud.

## The four truths (test all brand work against these)

| Truth | Meaning |
| --- | --- |
| Friends first, fantasy second | The magic ingredient is the group, not the genre. Warmth beats epicness everywhere they conflict. |
| The story is theirs | Players hear *themselves*. Bardcast is the teller, never the author. |
| Thirty seconds, no ceremony | Replies happen on a phone between things. No surface may add reverence to the recording moment. |
| An ongoing campaign | Chapters arrive over weeks; releases get the ritual weight (that's what the drop-cap is for). |

## The mark

The **hearth-mark**: a waveform in which one bar has caught fire, set above the table line — the
group's voices feeding the story-fire, at the table where the game is actually played.

- `packages/brand/assets/hearth-mark.svg` — ringed badge, for feeds, embeds, and anywhere freestanding.
- `packages/brand/assets/app-icon.svg` — full-bleed 512 square on walnut for PWA/maskable icons
  (no ring; the OS supplies the shape).
- The **wordmark** is the name set lowercase in the display face: `bardcast`. Lowercase is the brand's
  register — a name said across a table, not announced from a stage. There is no wordmark SVG yet;
  cut one only once the Fraunces webfont is actually bundled, never with a fallback font.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| Walnut | `#241A12` | Primary dark ground — app backgrounds, the table itself. |
| Walnut raised | `#2E2218` | Cards and raised surfaces on walnut. |
| Parchment | `#F0E3C9` | Primary text on dark grounds. |
| Parchment dim | `#B9A98C` | Muted text — a real color, not an opacity. |
| Ember | `#E07B39` | **The accent. Reserved for the single next action on any screen.** |
| Candle gold | `#D9A441` | Secondary accent — drop-caps, progress, highlights, the mark's flame. |
| Hearth red | `#9C3F2E` | Danger, recording-live, not-ready. |
| Moss | `#6D7A50` | Success, ready. |

The load-bearing rule is the ember rule: **ember appears once per screen, on the one thing to do
next**. If two elements are ember, one of them is wrong. Semantic states (moss/hearth red) are not
accents and don't count against it.

## Typography

| Role | Face (target webfont) | Interim stack ships in tokens | Used for |
| --- | --- | --- | --- |
| Display | Fraunces (soft optical sizes) | Iowan Old Style → Palatino → Georgia | Chapter titles, headings, the wordmark. |
| Body | Source Serif 4 | Iowan Old Style → Palatino → Georgia | Chapter text, show notes — anything read at length. |
| UI | system humanist sans | Seravek → Avenir Next → system-ui | Buttons, timers, metadata. Quiet on purpose. |
| Data | mono | SF Mono → Menlo → Consolas | Dice logs, readiness stats. |

Webfonts are `TODO(bardcast)`: bundle Fraunces + Source Serif 4 (both OFL) with the apps when UI
work starts — the token stacks already name them first, so no code changes will be needed.

## Voice

Warm, second person, unhurried; the app talks like a friend at the table, never like a system.
Canonical lines (also exported from `@bardcast/brand` as `voice`, so adapters reuse rather than
re-invent the tone):

- **Tagline:** "Pull up a chair. The story's already started."
- **Prompt notification:** "The DM has a question for Torvald. Thirty seconds by the fire?"
- **Chapter release:** "Chapter Four is told — 22 minutes, all five of you."

Rules of thumb: name the character, not the user. Say what happens, not what the system did
("Chapter Four is told", not "Generation complete"). Numbers spelled out in prose, digits in UI meta.

## Where it applies

- **`apps/player`** — dark walnut ground, parchment text, ember on the single next action
  (record → send). The recording-live state is hearth red.
- **`apps/dm`** — same ground; readiness axes fill in candle gold, ready/not-ready read as
  moss/hearth red; dice output uses `.bc-dice-log`.
- **Podcast cover art & chapter pages** — display serif, drop-cap ritual, hearth-mark badge.
  (Cover art production is still open — see the direction board for the approved comp.)
