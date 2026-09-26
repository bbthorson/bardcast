# Bardcast brand: Felt & Vellum

**Status: current** (September 2026). This supersedes the July 2026 "Tavern Table" direction, which
was a placeholder. The direction was worked out in Claude Design (mobile home, character sheet,
campaign progress). This doc explains the choices and how to use them. Tokens, the generative marks,
and the assets are in [`packages/brand`](../packages/brand).

## The idea

The app is the game table. It combines three things: a tavern, a tabletop RPG, and the players' own
voices.

- **Felt is the table.** Navigation, the party, and ambient state sit on a dark felt ground.
- **Vellum is what you hold.** Anything you'd pick up at the table (a character sheet, an episode, a
  prompt card) is paper laid on the felt, with ink-coloured text.
- **One candle per screen.** Candle amber marks the single next action. Nothing else uses it.
- **Voices carry colour.** Colour on a screen means a person is speaking or is being described.
- **Loose, not tidy.** Things on a table get set down, not lined up. Cards sit 1–2° off, seals
  overlap, and the trail is drawn by hand. Text itself always stays straight.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| `felt` | `#111A16` | Page ground. |
| `feltRaised` | `#18231E` | Cards on felt. |
| `feltLine` | `#26352E` | Dividers, tracks, alternative buttons. |
| `feltWorn` | `#4A5C53` | The trail ahead; a chapter being gathered. |
| `chalk` | `#ECE7DB` | Text on felt; the DM; chalk handwriting. |
| `chalkDim` | `#A2AA9E` | Secondary text on felt. |
| `vellum` | `#EFE8D8` | Sheets, episodes. |
| `ink` / `inkDim` | `#1E1A15` / `#605849` | Text on vellum. |
| `pencil` | `#5A554C` | The DM's handwriting on vellum. |
| `candle` | `#EBAA4C` | **The one next action. Nothing else.** |
| `hearth` | `#C4543F` | Recording, danger, a failed roll (`hearthSoft` `#E4826E` as text on felt). |
| `moss` | `#8DBE7A` | Ready; a natural 20. |

**Voice colours** all use oklch lightness 0.76 and chroma 0.11, so no voice looks louder than another.
Only the hue changes. On vellum they drop to 0.52 / 0.12 (`voiceColor(hue, "vellum")`). There are
eight hues, one per player, so a party can have up to eight players: 35, 80, 130, 180, 220, 250, 290,
320.

## Type

| Face | Role | Sizes |
| --- | --- | --- |
| Young Serif | Display: chapter titles, character names, prompts, drives, quotes. Anything spoken in the story. | 22–44 |
| Figtree | UI: buttons, body copy, labels. Friendly and quiet. | 13–17 (17 body on mobile, never below 13) |
| DM Mono | Data: dice, durations, readiness, handles, eyebrows. Lowercase. | 11–13 |
| Kalam | The DM's hand: margin notes, asides, warnings. Chalk on felt, pencil on vellum. Never more than a line. | 18–20 |

Apps load all four from Google Fonts in `index.html`.

## Shape and texture

- **Dice shapes.** Buttons are shaped like the side of a d6, with bevelled ends (`shape.bevel(16)` at
  56px tall, `shape.bevel(13)` at 44px). Play keys, record keys, chapter stops and thrown dice are
  hexagons (`shape.hex`). Surfaces are near-square: 6px corners on cards, 3–4px on chips.
- **Texture** is pure CSS. Felt is a two-layer dot weave at 9px. Vellum is a fine 5px grain
  (`texture.felt`, `texture.vellum`, or the `.bc-felt` and `.bc-vellum` classes). Character sheets
  have a torn top edge (`tornEdge(seed)`).
- **Stains.** Allow at most one per screen, placed where nobody is reading: an ale ring on felt, a cup
  ring on sheets, blood where the story turns dangerous (`ringStain`, `splatter`).
- **Spacing** runs on 4s, with a 24px page gutter on mobile.

## Voice seals (the mark)

Each player's seal is a disc of wax pressed with their own voice. The imprint faces inward: spokes
start at the rim and reach toward the centre. Spoke lengths come from the loudness envelope of the
player's recordings. For now they are seeded placeholders (`TODO(bardcast)` in
`packages/brand/src/marks.ts`). The wax is the player's voice hue at lower lightness. The DM always
presses in bone.

- Use it as an avatar at 24–40px and as a hero at 100px and up.
- Place seals by hand: overlapping, a few degrees off-axis, never in a tidy grid.
- **The logo is a bone seal** (`seal("bardcast", { bone: true, bars: 24 })`), tilted slightly, next to
  the lowercase wordmark set in Young Serif. `assets/seal-mark.svg` and `assets/app-icon.svg` are
  generated from that call.

## Components

- **Recorder.** Recording uses hearth red. The waveform draws in the speaker's voice colour as they
  talk. It has three states: ready (moss), learning (chalk dim), and needs voice (hearth soft).
- **Episode player.** Each bar of the waveform is tinted by whoever is speaking at that moment, so you
  can scrub to your own lines (`episodeWaveform`). The part already played is full ink; the part
  ahead is at 35%.
- **Journey.** Chapters are Roman numerals on one vertical, hand-drawn trail. Stops are chalk when a
  chapter is told, worn felt while it is gathering, and dark once sealed. Story beats hang off each
  stop as dots in the colour of the character they happened to. The roll that decided a beat sits
  beside it as a thrown die: hearth for a failure, chalk for a success, moss for a natural 20.

## Voice and copy

Canonical lines are exported from `@bardcast/brand` as `voice`:

- **Tagline:** "Your table, told back in your own voices."
- **Call to action:** "Pull up a chair"
- **Prompt:** "The DM has a question for Gawain." → "Answer as Gawain"
- **Chapter release:** "Chapter Four is told — 22 minutes, all five of you."

Rules of thumb:

- Address the character, not the account: "Answer as Gawain", not "Submit reply".
- Say what happened in the story: "Chapter Two is told", not "Generation complete".
