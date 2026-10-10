# Character model: what is durable, what is per campaign

**Status:** decided 2026-09-24, revised 2026-10-07 (the sheet became the
player's; see [`character-creation.md`](character-creation.md)). Each Bardcast campaign becomes an atproto
**space** under Bardcast's own DID, keyed by `skey` (see Antiphony's
`specs/atproto-authority-model.md`, Decision 2). This doc says which character
records live in the player's repo and which live in the campaign's space.

## The problem

`character.sheet` was keyed `literal:self` in the player's repo: one sheet per
character, everywhere. A character in two concurrent campaigns could not carry
25 AC in one and 14 AC in the other. The first fix (2026-09-24) moved the sheet into
each campaign's space; the second (2026-10-07) gave it back to the player and put a
**seat** in each campaign instead.

## The split

*Revised 2026-10-07: the sheet moved to the player's repo, and a campaign holds
a seat branched from it. See [`character-creation.md`](character-creation.md).*

| Record | Where it lives | Key | Why |
|---|---|---|---|
| `character.profile` (name, concept, pronouns, **drives**) | Player's repo | `tid` | Who the character is. A player can have several. Portable off Bardcast. |
| `character.sheet` (5e backbone, advancement log, traits, quirks, `prev`) | Player's repo | `tid`, one per version | The character's mechanics, owned by the player. Immutable versions; the profile's `sheet` names the current one. Travels with them. |
| `voice.profile` | Player's repo | `self` | The player's voice. Same in every campaign. |
| Behavior model (app state, no lexicon yet) | Keyed on the character | — | How the character acts. Durable. |
| `campaign.seat` (the sheet as brought, levels earned here, starting items, derived state, reply-inferred traits) | Campaign's space | player DID | The character at **this** table. |
| `character.stateEvent` | Campaign's space | `tid` | A beat in this campaign's story, tied by `chapterRef`. |
| `campaign.action` (a mechanical event and its effects) | Campaign's space | `tid` | Append-only. A seat's hit points, conditions and items are derived from it. |
| `campaign.chapter` (the episode) | Campaign's space | `tid` | Published to the party, not the public. |
| Reply recordings (Antiphony posts) | Campaign's space, held by Antiphony | — | The raw audio behind every seat, behavior model and voice clone. The campaign keeps them. |

**A new campaign starts a fresh seat.** Seats are keyed by (campaign, character).
Joining replays the player's sheet down to the table's starting level
(`joinCampaign`); a character with no sheet yet gets an empty seat on first
ingest. Nothing is copied from another campaign's seat; what carries over is the
profile, the sheet, the behavior model and the voice. Play never writes the
player's sheet: progress reaches it only when the player brings it home
(`bringHome`). `loop.test.ts` and `sheet.test.ts` pin this.

`drives` moved from the sheet to the profile: motivation is identity, not
mechanics. Sheets and seats both name their `character` (the profile's AT-URI)
so they still say what they belong to when read out of context.

In the orchestrator, sheet versions are written only through
`use-cases/sheets.ts` (`Store.putSheetVersion` is insert-only); `Store.getSeat`/`putSeat` take `(campaignId, characterId)`. The
readiness gate reads the seat of the campaign it is gating, and ingest is
`POST /api/campaigns/:campaignId/characters/:characterId/ingest`.

## Why now

Reply StrongRefs seal a URI's authority into immutable CIDs at write time. While
the corpus is wipeable, changing where a record lives is free; once we promise to
keep data, it is permanent. Getting the profile/sheet boundary right before any
kept campaign is the cheap moment.

## Open questions (not decided here)

1. **The `game.bardcast.*` NSID.** It is a placeholder (`packages/domain/src/nsid.ts`)
   and must be swapped for a domain Bardcast controls before any record is kept.
   It is also the exit hatch for cross-app portability: a profile written as
   `game.bardcast.character.profile` is only readable by apps that choose to
   read Bardcast's lexicon. Whether the durable records (profile, voice) should
   sit under a neutral, shareable namespace while campaign records stay
   Bardcast's is the real question, and the NSID swap is when it gets answered.
2. **`sourceReplies` URIs that dangle.** Sheets, behavior models, and voice
   profiles cite the Antiphony replies they were built from. If a character
   leaves Bardcast, or a campaign space is deleted, those URIs point at records
   the reader may not be able to fetch (a semi-private space) or that no longer
   exist. Options range from accepting dangling provenance, to copying a CID
   alongside each URI so the claim stays verifiable, to dropping provenance from
   the portable records entirely.
3. ~~**One character per player.**~~ Decided 2026-10-07: `character.profile` is
   keyed by `tid`, so a player can have several characters.
