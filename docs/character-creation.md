# Building a character

**Status: decided, not built** (2026-10-07). Revises the split in
[`character-model.md`](character-model.md): the character sheet moves from the campaign's space into
the player's own repo, and a campaign holds a **seat** that branches from it.

## What we decided

1. **Characters are made outside a campaign.** A player builds a character first, then joins a
   campaign with it. A DM can offer guidance (setting, starting level, a few suggested concepts), but
   the character isn't the campaign's.
2. **Creation is driven by voice.** The player builds the character by answering questions out
   loud, so creation also starts their voice profile.
3. **The sheet is 5e underneath and story on top.** The SRD 5.1 sheet is the backbone and can always
   be surfaced. A player sees a narrative card first: who the character is, their quirks, what
   drives them, and a line in their voice.
4. **Players own every sheet.** A player keeps all their characters' sheets and brings one into a
   campaign. The campaign resets it to the level the campaign starts at.
5. **A player can have several characters.** The You tab (far right) lists them, the way the
   Campaigns tab (far left) lists campaigns.
6. **Progress comes home.** What a character earns at a table can be carried back to the player's
   own sheet. The table's state is kept either way.
7. **The Bardcast narrator asks the session-zero questions.** It's one stock narrator voice, not the
   DM's and not the player's.
8. **Clef may suggest ability scores during creation; the player places them.** This replaces "ability
   scores are never inferred" with "never set without the player": nothing guesses a player's numbers
   silently.

## The record model

The current model puts `character.sheet` in the campaign's space, so the sheet can't exist apart
from a campaign. We already have a campaign lexicon (`campaign.campaign`). What's missing is a
record that joins a player-owned sheet to a campaign. Call it a **seat**.

| Record | Where it lives | Key | Change |
|---|---|---|---|
| `character.profile` | Player's repo | `tid` (was `self`) | A player can have more than one character. |
| `character.sheet` | Player's repo (was the campaign's space) | same rkey as its profile | The player's sheet: the 5e backbone, the narrative layer, and an advancement log. |
| `voice.profile` | Player's repo | `self` | Unchanged. One voice per player, used by all their characters. |
| `campaign.campaign` | Campaign's space | `tid` | Gains `startingLevel` and `characterGuidance`. |
| **`campaign.seat`** (new) | Campaign's space | player DID | A character at this table: a StrongRef to the sheet version brought in, a snapshot of it reset to the table's level, the levels and state earned here, and reply-inferred traits. Replaces the old campaign-scoped sheet. |
| `character.stateEvent`, `campaign.chapter` | Campaign's space | `tid` | Unchanged. |

The seat is the campaign-scoped part that `character-model.md` needed (25 AC at one table, 14 at
another). The sheet becomes the part that travels.

### A seat is a branch, not a copy

A seat doesn't clone the sheet. It holds:

- **where it branched from:** a StrongRef (URI + CID) to the exact sheet version the player brought,
  and the table's `startingLevel`;
- **what the table added:** its own advancement entries (the levels earned here);
- **the table's running state:** hit points, conditions, gear, anything that only makes sense at this
  table.

The sheet in play is computed:
`sheetAtLevel(source, startingLevel) + table advancements + table state`. So two concurrent
campaigns are two branches off the same character, each with its own history, and the source sheet
never changes underneath them, because the CID pins it.

### Bringing progress home

When a player carries a character's progress back (at the campaign's end, or whenever they choose),
the table's advancements are appended to the owned sheet's log:

- **The owned sheet hasn't moved since the branch:** append the table's levels. It's a fast-forward.
- **It has moved** (they levelled at another table too): the two histories disagree about the same
  levels. The player picks which one the character keeps ("the Saltmarsh Gawain or the Thornwood
  Gawain"). The other stays in its campaign's seat, untouched.

The seat is never deleted or rewritten by bringing progress home. Campaign state is kept.

### Who writes where

- **The player's repo** (profile, sheet) is written only while the player is present: creating a
  character, editing it, bringing progress home. Bardcast writes with the player's OAuth session and
  needs no long-lived access to their account.
- **The campaign's space** (seats, state events, chapters) is written by Bardcast under its own
  authority as play happens, including in the background during chapter generation. No player token
  is involved.

### Resetting to a level

A sheet can't be "set to level 3" by editing numbers. A level-8 sheet has ability-score increases and
features from levels 4–8 that must come off. So the sheet stores **level-1 choices plus an
advancement log** (one entry per level: hit points, the ability-score increase or feat, new
features). Joining a campaign replays the log up to `startingLevel`. This is a pure, deterministic
function in `@bardcast/domain` (`sheetAtLevel(sheet, level)`), tested like `resolution.ts`.

A table that starts *above* the sheet's level needs advancements the player hasn't chosen yet.
The join flow asks for them, and the DM can suggest picks.

## The experience

**Entry points.** The You tab lists the player's characters, with "Make a character" at the end. And from an invite: "Bring a character" lists
the player's characters and offers "Make a new one". If the campaign has guidance, it shows in the
DM's hand (Kalam).

**Session zero, out loud.** The Bardcast narrator asks five to seven questions, one at a time, answered by voice (with a text
fallback). Example questions:

- "Who are you when nobody's watching?"
- "What did you leave behind?"
- "What would make you draw steel?"
- "Say something the way they'd say it."

Each answer is recorded, transcribed, and read by the `DecisionModel` (Clef), which picks from
options we list: a class leaning, background, species, and personality traits from the closed
vocabulary in `traits.ts`. It never writes text.

**The reveal.** A vellum card, front side: name, a one-line concept, three quirks, drives, and a
quote pulled from their answers. Every line has "not quite", which re-asks for that line only.
Turning the card over shows the 5e backbone: class, level 1, ability scores, proficiencies.

**Ability scores.** These come from the standard array. Clef *suggests* where each score goes, based
on the answers, and the player confirms or swaps them. Nothing is set without the player
(decision 8).

**Pressing the seal.** The answers are the first voice samples. The consent card comes next (the one
on `VoiceClone.tsx`). If the player says yes, the creation recordings train the clone, and their seal
is pressed from the loudness of those recordings. This is where the `TODO(bardcast)` in
`packages/brand/src/marks.ts` gets real data. If they say no, the character is still saved, and the
seal stays unpressed.

**Joining.** The player picks a character, the seat is created at the table's level, and the DM sees
them arrive.

## Where creation recordings live

Campaign recordings belong to the campaign's space. Creation happens outside any campaign, so those
recordings should belong to the player. In Antiphony's authority table, that's "a solo user's own
post: authority the user's DID", which is marked *to confirm before it's built*
(`antiphony/specs/atproto-authority-model.md`, D2). **This plan depends on that row.**

## Prerequisites (true today)

- **Nothing writes to a player's repo.** Sign-in requests only the default `atproto` scope
  (`@bbthorson/atproto-cf-auth`), which proves identity but can't write records. Pass `scope` to
  `createBlueskyAuth` to ask for repo permission on `game.bardcast.character.profile`,
  `game.bardcast.character.sheet` and `game.bardcast.voice.profile`, then write with
  `new Agent(await auth.getOAuthSession(request))`. **No app password**: this is ordinary AT
  Protocol OAuth, and the player sees the collections on their provider's consent screen. Two
  catches. Existing sessions must sign in again to grant the new scope. And scopes name the NSID,
  so swap the placeholder `game.bardcast.*` (`packages/domain/src/nsid.ts`) *before* players grant
  it, or they'll have to grant again.
- **There is no projection layer.** No code writes any AT Protocol record yet. Per the
  state-drives-records rule, build creation against the `Store` first, and project to records
  second.
- **The corpus is still wipeable.** That makes now the cheap moment to move the sheet
  (`character-model.md`, "Why now").

## Build order

Step 1 is built except the profile-key change in the app (the lexicon says `tid`, but the web app
still keys a joined character by the player's DID) and the NSID swap, which waits on a domain.
`sheet.ts` and `seat.ts` in `@bardcast/domain` hold the sheet, the seat, `sheetAtLevel`,
`joinCampaign` and `bringHome`; the `Store` has owned sheets and seats.

1. **Model.** Lexicons (profile keyed by `tid`, a player-owned sheet with an advancement log, a new
   `campaign.seat`, and campaign `startingLevel`/`characterGuidance`). Zod mirrors in
   `@bardcast/domain`. `Store` gets `getSeat`/`putSeat` and owned-sheet methods. Rewrite
   `character-model.md`, the `/your-data` page and the consent copy so they say the sheet is yours.
   Update the D2 row in Antiphony's spec to include sheets.
2. **5e core.** An SRD 5.1 subset in `@bardcast/domain`: classes, backgrounds, species, the standard
   array, derived stats, and `sheetAtLevel`. Pure and tested.
3. **Creation use-cases.** `startCreation`, `answerCreation`, `proposeCharacter` (`DecisionModel`
   choices), `reviseLine`, and `confirmCharacter` (writes the profile and sheet). Prose for the card
   goes through `NarrativeWriter`.
4. **Screens.** Session zero (reuse the recorder), the reveal card with front and back, the seal
   press, and the invite flow's character picker.
5. **Projection.** Write profile, sheet and seat records once repo scopes land.

## Navigation

The bottom nav keeps its three tabs. **Campaigns** (left) lists campaigns. **You** (right) lists
characters, each a small vellum card with the character's seal, name, concept and the tables they sit
at, with "Make a character" at the end. Voice and account settings stay on You, below the list.

## Still open

1. **Campaigns with fixed characters.** A campaign like the Green Knight may cast its own
   characters (Gawain, not a player's invention) and not accept generated ones. Such a campaign
   would offer pre-made sheets to claim instead of "Bring a character". That needs a campaign-level
   setting (`characterPolicy`: bring your own, pre-made only, or either) and a way for a pre-made
   sheet to become, or not become, the player's own. To decide later.

2. **The narrator's voice.** Pick a stock ElevenLabs voice and give it a short style note in
   `docs/brand.md`, so it sounds like the friend who runs the game, not a movie trailer.
