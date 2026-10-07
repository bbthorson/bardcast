# Building a character

**Status: decided 2026-10-07.** The record model and the SRD data are built; character creation
isn't yet (see [Build order](#build-order)). Revises the split in
[`character-model.md`](character-model.md): the character sheet moves from the campaign's space into
the player's own repo, and a campaign holds a **seat** that branches from it.

## What we decided

1. **Characters are made outside a campaign.** A player builds a character first, then joins a
   campaign with it. A DM can offer guidance (setting, starting level, a few suggested concepts), but
   the character isn't the campaign's.
2. **Creation is driven by voice.** The player builds the character by answering questions out
   loud, so creation also starts their voice profile.
3. **The sheet is 5e underneath and story on top.** The SRD 5.2 sheet is the backbone and can always
   be surfaced. A player sees a narrative card first: who the character is, their quirks, what
   drives them, and a line in their voice.
4. **Players own every sheet.** A player keeps all their characters' sheets and brings one into a
   campaign. The campaign resets it to the level the campaign starts at.
5. **A player can have several characters.** The You tab (far right) lists them, the way the
   Campaigns tab (far left) lists campaigns.
6. **Progress comes home.** What a character earns at a table can be carried back to the player's
   own sheet once their seat closes (decision 9). The table's state is kept either way.
7. **The Bardcast narrator asks the session-zero questions.** It's one stock narrator voice, not the
   DM's and not the player's.
8. **Clef may suggest ability scores during creation; the player places them.** This replaces "ability
   scores are never inferred" with "never set without the player": nothing guesses a player's numbers
   silently.
9. **What happens at the table stays at the table until it's over.** Hit points go up and down in the
   campaign and never touch the player's sheet. Levels, weapon and armor upgrades, and anything found
   stay with the campaign until the seat closes (the campaign ends or the character leaves). Then
   levels and gear can come home; hit points and conditions never do.
10. **Actions are an append-only log.** Each mechanical event is its own immutable record in the
    campaign's space, posted when its chapter is finished. A seat's state is derived from the log.
11. **A campaign sets a gear policy.** "Starting gear only" (the default) hands everyone the table's
    starting kit; "bring your gear" lets them carry their own equipment in.
12. **SRD 5.2** (the 2024 rules), not 5.1.

## The record model

Before this, `character.sheet` lived in the campaign's space, so a sheet couldn't exist apart
from a campaign. We already had a campaign lexicon (`campaign.campaign`). What was missing was a
record that joins a player-owned sheet to a campaign: the **seat**.

| Record | Where it lives | Key | Change |
|---|---|---|---|
| `character.profile` | Player's repo | `tid` (was `self`) | A player can have more than one character. |
| `character.sheet` | Player's repo (was the campaign's space) | `tid`, one record per version | One version of the player's sheet: the 5e backbone, the narrative layer, an advancement log, and `prev`. Never edited. |
| `voice.profile` | Player's repo | `self` | Unchanged. One voice per player, used by all their characters. |
| `campaign.campaign` | Campaign's space | `tid` | Gains `startingLevel`, `characterGuidance` and `gearPolicy`. |
| **`campaign.seat`** (new) | Campaign's space | player DID | A character at this table: a StrongRef to the sheet version brought in, a snapshot of it reset to the table's level, the levels and state earned here, and reply-inferred traits. Replaces the old campaign-scoped sheet. |
| **`campaign.action`** (new) | Campaign's space | `tid` | One mechanical event: who acted, the roll, and its effects on seats (hit points, conditions, items). Append-only. |
| `character.stateEvent`, `campaign.chapter` | Campaign's space | `tid` | Unchanged. Story beats stay stateEvents; mechanics are actions. |

The seat is the campaign-scoped part that `character-model.md` needed (25 AC at one table, 14 at
another). The sheet becomes the part that travels.

### Versions, not edits

*Decided 2026-10-07.* A sheet record is never edited. Every change is a new record whose `prev`
(a StrongRef) points at the version it replaces, the way a Bluesky reply points at its parent. The
character's profile carries a `sheet` StrongRef to the current version; it's the one field that moves.

```
v1 (level 1) ← v2 (level 2) ← v3 (level 3) ← v4 (level 4, brought home from Thornwood)
                                  ↖ v4′ (level 4, levelled at home), superseded
```

- **History is walkable** by following `prev` from the current version (`sheetHistory`).
- **Nothing is lost.** A superseded version stays in the repo; choosing one history over another
  makes a new version, it doesn't delete the other.
- **Concurrent writes can't silently fork.** A new version must name the current one as its `prev`,
  or it's refused (`StaleSheetError`): re-read, then try again.
- **Refs are real.** Each version's rkey is a TID and its CID is the record's dag-cbor CID (with
  `$type`), computed when it's written to the `Store`, so a seat's StrongRef stays valid when the
  record is published to the player's repo.

Why not edit one record and look up old versions by CID? AT Protocol repos don't keep history: the
current repo format dropped the link from each commit to the one before, and a PDS needn't keep a
record's old blocks (Bluesky's doesn't). Bluesky threads look like history only because each reply
is its own record.

**Sheets are public.** Records in a player's repo can be read by anyone, like Bluesky posts. So a
character's sheet, and every earlier version of it, is visible to the world. Only the campaign's
space is private. `/your-data` says so.

### A seat is a branch

A seat holds:

- **where it branched from:** a StrongRef to the exact sheet version the player brought, and the
  table's `startingLevel`;
- **a snapshot of that version, reset to the table's level** (`brought`). The version lives in the
  player's repo, and players can delete their own records; a campaign, and the episodes built on a
  character, mustn't break because someone tidied up. The StrongRef proves provenance; the
  snapshot keeps the table playable;
- **what the table added:** its own advancement entries (the levels earned here);
- **what they sat down with:** `startingItems`, the table's starting kit or their own equipment,
  per the campaign's gear policy;
- **the table's running state:** hit points, conditions and items, as a snapshot derived from
  `startingItems` and the action log (below). It's refreshed whenever a chapter's actions are
  committed, and can be rebuilt from the log at any time;
- **when it closed** (`closedAt`): the campaign ended or the character left.

The sheet in play is `brought + table advancements`, and the character in play adds the running
state. Two concurrent campaigns are two branches off the same character, each with its own history.

### Actions

A chapter is written as beats, and the beats contain actions: an attack, a check, damage, a rest, a
sword re-edged by the smith. Each one becomes a `campaign.action` record:

- **who acted** (a character, or an NPC by name), **what kind** of action, a one-line label, and
  **the roll** that decided it;
- **its effects** on characters at the table: hit points up or down (kept between 0 and the
  maximum), a full restore, conditions added or removed, items gained, lost or changed (an upgrade,
  equipping).

The log is append-only, like sheet versions: an action is never edited. A seat's state is what you
get by replaying the log from the seat's starting items at full health (`applyActions`), so a DM can
always see *why* Gawain is at 3 hit points.

**Posted when the chapter is finished, not while it's drafted.** The story engine can backtrack out
of a branch (a PC death, `story-engine.md` §4). Actions are held with the draft and committed
together once the chapter is ready (`commitChapterActions`), so a discarded branch never reaches
the log. A chapter is validated whole before any of it is written.

The chapter's `rollLog` is kept for now, for reproducing a generation run; once the engine writes
actions, the rolls that mattered live on the actions.

### Bringing progress home

Progress comes home only from a **closed** seat (`closeSeat`), so levels and gear stay with the
campaign until it ends or the character leaves. Then `bringProgressHome` compares the table's
history with the current version:

- **The current version hasn't moved since the branch:** a new version with the table's levels,
  `prev` pointing at the current one and `fromSeat` naming the seat. It's a fast-forward.
- **It has moved** (they levelled at another table, or at home): the two histories disagree about the
  same levels. The player picks which one the character keeps ("the Saltmarsh Gawain or the
  Thornwood Gawain"). Choosing the table's makes a new version; choosing their own writes nothing.
- **The table is behind their sheet:** no levels to bring.

**Gear comes home either way.** What they didn't bring stays as it was. What they carried out
comes home, except the table's plain starting kit: a starting longsword the smith made +1 comes
home, an untouched one doesn't. Something they brought and lost at the table stays lost. Hit points
and conditions never come home.

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

**Entry points.** The You tab lists the player's characters, with "Make a character" at the end.
And from an invite: "Bring a character" lists the player's characters and offers "Make a new one".
If the campaign has guidance, it shows in the DM's hand (Kalam).

**Session zero, out loud.** The Bardcast narrator asks five to seven questions, one at a time,
answered by voice (with a text fallback). Example questions:

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

Steps 1 and 2 are built. Step 1 still lacks three things: the profile-key change in the web app
(the lexicon says `tid`, but the app still keys a joined character by the player's DID), the D2
row in Antiphony's spec, and the NSID swap, which waits on a domain. `ROADMAP.md` (M3b) tracks
what's left.

1. **Model.** *Built.* Lexicons: profile keyed by `tid` with a `sheet` ref to the current version;
   the sheet as immutable versions with an advancement log, equipment and `prev`; a new
   `campaign.seat` and `campaign.action`; campaign `startingLevel`, `characterGuidance` and
   `gearPolicy`. Zod mirrors and the pure logic in `@bardcast/domain` (`sheet.ts`, `seat.ts`,
   `items.ts`, `action.ts`); the orchestrator's `use-cases/sheets.ts` and `use-cases/actions.ts`;
   insert-only sheet versions and actions, and seats, in all three `Store` adapters.
   `character-model.md`, `/your-data` and the consent copy say the sheet is yours. Still to do:
   update the D2 row in Antiphony's spec to include sheets.
2. **5e core.** *Built 2026-10-07* (`packages/srd`; see its README). An SRD 5.2 subset: classes,
   species, backgrounds, feats, equipment (weapons with damage, properties and mastery; armor with AC, Dex cap, Strength minimum
   and stealth), starting kits, skills and conditions. Spells, monsters and magic items wait.
   - **Source:** `5e-bits/5e-srd-api`, `packages/5e-database/src/2024/en` (checked 2026-10-07 at
     `05c109ea1f6b`). Its 2024 data is structured, not just prose: 12 classes with level tables and
     starting kits as item references, the 4 SRD backgrounds with ability options, feat and kit, 9
     species, 17 feats, 182 equipment entries. The older `5e-bits/5e-database` repo is archived.
   - **How:** an import script reads a pinned commit, validates every entry with Zod (it's outside
     data), keeps only the fields we use, and writes typed TS modules that are checked in. No
     runtime API, and every data change is a reviewable diff.
   - **Licensing:** 5e-bits' code is MIT; the content is Wizards' SRD 5.2, CC-BY-4.0. Their README
     still cites OGL 1.0a, which is out of date for 5.2, so our attribution cites SRD 5.2 under
     CC-BY-4.0 directly, plus the MIT notice for their compilation. It goes in `NOTICE` and on a
     credits line in the app.
   - **Source errors found and corrected** (`CORRECTIONS` in the importer, pinned by tests): Hide
     Armor is tagged light armor (SRD: medium), and Human is Medium only (SRD: Medium or Small). The
     source also has some UTF-8 damage ("artisanâ€™s"), repaired on import.
   - Spot-check against the SRD itself in tests (longsword 1d8 slashing, versatile 1d10, mastery
     Sap; chain mail AC 16, Strength 13, stealth disadvantage).
3. **AC and attacks.** Armor class and attack and damage bonuses from equipped items, read from
   `@bardcast/srd` (armor category, Dex cap, shield, weapon damage and properties), with the
   +1 to +3 bonus on top.
4. **Creation use-cases.** `startCreation`, `answerCreation`, `proposeCharacter` (`DecisionModel`
   choices), `reviseLine`, and `confirmCharacter` (writes the profile and sheet). Prose for the card
   goes through `NarrativeWriter`.
5. **Screens.** Session zero (reuse the recorder), the reveal card with front and back, the seal
   press, and the invite flow's character picker.
6. **Projection.** Write profile, sheet and seat records once repo scopes land.

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
