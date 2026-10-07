# Building a character

**Status: proposed** (2026-10-07). Revises the split in [`character-model.md`](character-model.md):
the character sheet moves from the campaign's space into the player's own repo. Nothing here is
built yet.

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
| **`campaign.seat`** (new) | Campaign's space | player DID | A character at this table: StrongRefs to the profile and to the sheet version brought in, the level the table set, and the mechanics as they stand at this table. Replaces today's campaign-scoped sheet. |
| `character.stateEvent`, `campaign.chapter` | Campaign's space | `tid` | Unchanged. |

The seat is the campaign-scoped part that `character-model.md` needed (25 AC at one table, 14 at
another). The sheet becomes the part that travels.

### Resetting to a level

A sheet can't be "set to level 3" by editing numbers. A level-8 sheet has ability-score increases and
features from levels 4–8 that must come off. So the sheet stores **level-1 choices plus an
advancement log** (one entry per level: hit points, the ability-score increase or feat, new
features). Joining a campaign replays the log up to `startingLevel`. This is a pure, deterministic
function in `@bardcast/domain` (`sheetAtLevel(sheet, level)`), tested like `resolution.ts`.

A table that starts *above* the sheet's level needs advancements the player hasn't chosen yet.
The join flow asks for them, and the DM can suggest picks.

## The experience

**Entry points.** "Make a character" on the You tab. And from an invite: "Bring a character" lists
the player's characters and offers "Make a new one". If the campaign has guidance, it shows in the
DM's hand (Kalam).

**Session zero, out loud.** Five to seven questions, one at a time, answered by voice (with a text
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
on the answers, and the player confirms or swaps them. This bends the rule in `traits.ts` that
ability scores are never inferred. The rule's intent (no silent guessing at a player's numbers) holds
because the player places every score. The rule's wording needs updating if we go this way.

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
  (`@bbthorson/atproto-cf-auth`), which proves identity but can't write records. We need granular
  repo scopes for `game.bardcast.character.*` and `game.bardcast.voice.profile`. The data-ownership
  page already promises the profile lives in the player's account, so this is overdue.
- **There is no projection layer.** No code writes any AT Protocol record yet. Per the
  state-drives-records rule, build creation against the `Store` first, and project to records
  second.
- **The corpus is still wipeable.** That makes now the cheap moment to move the sheet
  (`character-model.md`, "Why now").

## Build order

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

## Open questions

1. **Does progress come home?** If a character reaches level 6 at one table, does the player's own
   sheet gain those levels? Proposal: yes, the advancements made at the table are offered back to the
   owned sheet when the campaign ends, and the player chooses.
2. **Who asks the session-zero questions?** A Bardcast narrator voice, the DM's recorded voice when
   they've joined through an invite, or plain text to begin with.
3. **Several characters per player.** Moving the profile key to `tid` allows it. Confirm that's
   wanted, because it also changes how the voice profile (one per player) is presented.
