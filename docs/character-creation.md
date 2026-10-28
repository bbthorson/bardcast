# Building a character

**Status: decided 2026-10-07; session zero revised 2026-10-28.** The record model and the SRD data are built; character creation
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
13. **Session zero is a conversation, one attribute at a time** (decided 2026-10-28). The narrator
    keeps asking about an attribute until the player's answers settle it, or the player picks.
    Every follow-up is written and voiced for that player. There's no fixed script. See
    [Session zero](#session-zero-out-loud).
14. **Creation takes as long as the player takes.** They can answer in one sitting or across days, and
    a half-finished character waits on the You tab.

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

### Session zero, out loud

*Decided 2026-10-28; replaces "five to seven questions".* The Bardcast narrator talks with the
player, one voice prompt at a time, and the player answers out loud (with a text fallback). It isn't
a questionnaire. The narrator stays on an attribute, following up on what the player said, until
that attribute is settled.

```
Narrator:  "What would make you draw steel?"
Player:    "If someone hurt the kids at the orphanage, I'd... I don't know, I'd find them."
  Clef →   class: ranger .38, paladin .34, rogue .17 …   not settled
Narrator:  "When you find them, do you want them judged, or just gone?"
Player:    "Judged. Out loud, in front of everyone."
  Clef →   paladin .71, ranger .14 …                     settled: paladin
```

**Each turn:**

1. The reply is recorded into the player's space and transcribed.
2. Clef (the `DecisionModel`) reads **the whole conversation so far**, not just the latest reply,
   and gives probabilities for every attribute that's still open. One answer can settle several:
   "I'm a dwarf, obviously" settles species while we're asking about class.
3. Bardcast picks what to ask next, and the top two candidates to ask about. It stays on the
   current attribute until that's settled or the player picks. Then it moves to the
   **least-settled** of species, class and background. Once those are settled, it moves to the
   personality axis **closest to settling**: only `MIN_PERSONALITY_TRAITS` (3) are needed, and the
   rest stay unasked unless the answers settle them anyway. This choice is code (`nextStep` in
   `packages/domain/src/creation.ts`), from Clef's numbers, so nothing else decides where the
   character goes.
4. The `NarrativeWriter` writes one question, in the narrator's voice, that would tell those two
   candidates apart, and picks up the player's own details ("the orphanage"). It only phrases the
   question; it doesn't choose the topic, and it never sets an attribute.
5. The `AudioRenderer` voices it in the stock narrator voice, and it's posted as the next prompt in
   the player's space.

**Settled** means the top option has at least `SETTLE_AT` probability and leads the runner-up by at
least `SETTLE_MARGIN` (to be tuned against real answers; start at 0.65 and 0.3). A settled attribute
is shown to the player as settled, not hidden. The reveal card is where they change it ("not
quite").

**The player picks when the answers don't settle it.** After `MAX_TURNS` replies on one attribute
(start at 3), the narrator names the top two ("Sounds like a paladin, or maybe a ranger. Which is
it?"), and the player picks out loud or with a tap. So Clef settles only what the player's own words
clearly say, and the player chooses everything else. Nothing is set without the player.

**What gets settled, and how:**

| Attribute | How |
|---|---|
| Species, class, background | Clef, over the SRD 5.2 options in `@bardcast/srd` |
| Personality traits | Clef, over the closed vocabulary in `traits.ts`. Several get settled, not just one |
| Name | Asked straight out, right after the opener, so later questions can use it. The player confirms or corrects what was heard. Never inferred |
| Concept, drives, quirks, the quote | Not settled one at a time. The `NarrativeWriter` writes them for the reveal card from the whole conversation; the quote is the player's own words |
| Ability scores | Not asked about. After the rest is settled, Clef rates how much the character leans on each ability, and the standard array is suggested in that order. The player places the scores and picks their background's +2/+1 or +1/+1/+1 (decision 8) |

**The opener.** The first prompt is a big question, "Who are you when nobody's watching?", read
against every attribute like any other reply. It's a strong place to start, not a fixed step; the
opener can change without changing the flow.

**Pacing.** Creation takes as long as the player takes (decision 14). A reply might come a minute
after the prompt or a week after, so a turn can wait on transcription, Clef, the writer and the
voice render without anyone noticing. The conversation is saved after every turn, and the You tab
shows a half-made character with "Pick up where you left off."

A spoken answer goes to Antiphony as a reply, and Antiphony transcribes it. If the transcript
isn't ready yet, the turn waits. `advanceCreation` picks it up later and carries on. It's also how
a failed step (the writer, the voice render, Antiphony) is retried, since every step saves first.
A typed answer skips transcription.

**Where the conversation lives.** Today Antiphony has prompts and replies to prompts, not replies to
replies. So each narrator turn is a **new prompt** in `playerSpace(did)`, and Bardcast's `Store`
keeps the conversation: each turn's prompt, the reply it follows, the attribute it was working on
and Clef's read after it. If Antiphony adds replies to replies, the conversation can move there and
the `Store` becomes an index of it; the flow doesn't change. See [Still open](#still-open).

**Why not a script, or a bank of written questions?** A follow-up has to tell apart the two
candidates *this* player is between, in terms of what *they* said, so it can't be written ahead.
Because creation has no time limit (decision 14), writing and voicing each question as it's needed
is fine. Pinakes (which checks our campaign lore) has nothing that writes or voices questions; at
most it could later give the writer a summary of a campaign's setting when a character is made
from an invite.

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

**Decided 2026-10-07: a private space per player.** Campaign recordings belong to the campaign's
space. Creation happens outside any campaign, so its recordings need a home of their own, and none
of the existing rows in Antiphony's authority table fit (`antiphony/specs/atproto-authority-model.md`,
D6):

- **"A solo user's own post"** (authority: the user's DID) fails Antiphony's custody check, because
  a player's DID is their own Bluesky DID, pointing at their own PDS.
- **The player's repo** is public, and these are raw voice recordings used for cloning.

So each player gets a **private space** under Bardcast's DID:

- **One per player, not per character** (`SpaceTypes.player` in `packages/domain/src/nsid.ts`,
  `skey` the player's DID). Every character they make records into it.
- **Created when they start their first character**, not at sign-up, so a player who only listens
  never gets one. Later characters reuse it.
- **Only that player can read it** (`managing-app` policy; Bardcast answers yes for them alone). The
  narrator's questions are prompts in the space and the answers are replies, so they inherit it.
- **Bardcast keeps the raw audio.** What travels with the player is what's in their own repo: the
  profile, the sheet versions and the voice profile.
- **Bardcast's DID is the author segment** of every recording in the space, and the player is the
  `authorDid` facet (decided 2026-10-11, Antiphony D8; see
  [`integration-with-core.md`](integration-with-core.md)).

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

Steps 1, 2 and 4 are built. Step 1 still lacks two things: the profile-key change in the web app
(the lexicon says `tid`, but the app still keys a joined character by the player's DID), and the
NSID swap, which waits on a domain. Antiphony's spec records the model (D2, D6). `ROADMAP.md` (M3b) tracks
what's left.

1. **Model.** *Built.* Lexicons: profile keyed by `tid` with a `sheet` ref to the current version;
   the sheet as immutable versions with an advancement log, equipment and `prev`; a new
   `campaign.seat` and `campaign.action`; campaign `startingLevel`, `characterGuidance` and
   `gearPolicy`. Zod mirrors and the pure logic in `@bardcast/domain` (`sheet.ts`, `seat.ts`,
   `items.ts`, `action.ts`); the orchestrator's `use-cases/sheets.ts` and `use-cases/actions.ts`;
   insert-only sheet versions and actions, and seats, in all three `Store` adapters.
   `character-model.md`, `/your-data` and the consent copy say the sheet is yours.
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
4. **Creation use-cases.** *Built 2026-10-28* (`packages/domain/src/creation.ts`,
   `services/orchestrator/src/use-cases/creation.ts`, routes under `/api/creations`), against the
   `Store` and the ports, with fakes in tests (see [Session zero](#session-zero-out-loud)):
   - a saved **creation** with its turns: prompt, the reply, the attribute being asked about,
     and Clef's read after the reply;
   - `startCreation`: makes sure the player's space exists (`AntiphonyGateway.ensureSpace`, already
     built) and posts the opener;
   - `answerCreation`: takes a reply, asks Clef to re-read the whole conversation, settles what
     crossed the line, and either asks the next follow-up or, at `MAX_TURNS`, asks the player to pick;
   - `pickAttribute`: the player's pick when the conversation didn't settle it;
   - `proposeCharacter`: once the attributes are settled, the card's prose (`NarrativeWriter`) and
     Clef's suggested ability-score placement;
   - `reviseLine` (re-asks one line) and `confirmCharacter` (writes the profile and the first
     sheet version through `sheets.ts`);
   - `confirmName` and `advanceCreation` (fetches a pending transcript, retries a failed step);
   - port additions: `NarrativeWriter.writeQuestion`, `writeCard` and `reviseCardLine`;
     `AudioRenderer.renderLine` (ElevenLabs, in the narrator voice); an optional `audio` on
     `AntiphonyGateway.createPrompt`; and creations in all three `Store` adapters.

   Still to do here:
   - ~~**A real `NarrativeWriter`.**~~ *Built 2026-10-28* on Claude
     (`adapters/anthropic/narrative-writer.ts`). It writes the questions and the card with
     structured outputs, in the narrator's voice from `docs/brand.md`. The player's words are
     marked as theirs, never instructions. A quote that isn't word for word theirs is still replaced
     by `proposeCharacter`. Chapters stay on the stub until the story engine lands (ROADMAP M5).
   - **Starting equipment and the origin feat.** Class and background starting kits come from
     `@bardcast/srd` but aren't put on the first sheet yet.
   - **The creation recordings as voice samples.** Once the player consents, they should train the
     clone (see "Pressing the seal").
   - **Who a narrator prompt is attributed to.** It's posted with the player's DID as the acting
     actor, because it's the only DID the conversation has. Bardcast's DID is the author segment
     either way. Revisit if Antiphony gets a way to say "the app itself".
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
   `docs/brand.md`, so it sounds like the friend who runs the game, not a movie trailer. The
   `NarrativeWriter` writes its follow-ups to that note too.

3. **Replies to replies.** Session zero is a conversation, and so is a table. Antiphony has only
   prompts and replies to them, so for now each narrator turn is a new prompt and Bardcast's
   `Store` holds the conversation. If Antiphony adds replies to replies (being worked out alongside
   VoxPop), one way would follow Bluesky: every reply carries a `root` and a `parent` StrongRef,
   and lives in, and is readable under the same rules as, its root prompt's space. Then creation's
   conversation moves into Antiphony.

4. **Tuning.** `SETTLE_AT`, `SETTLE_MARGIN` and `MAX_TURNS` are starting guesses. Set them from real
   session-zero conversations once there are some.
