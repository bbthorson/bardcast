# Character model: what is durable, what is per campaign

**Status:** decided 2026-09-24. Each Bardcast campaign becomes an atproto
**space** under Bardcast's own DID, keyed by `skey` (see Antiphony's
`specs/atproto-authority-model.md`, Decision 2). This doc says which character
records live in the player's repo and which live in the campaign's space.

## The problem

`character.sheet` was keyed `literal:self` in the player's repo: one sheet per
character, everywhere. A character in two concurrent campaigns could not carry
25 AC in one and 14 AC in the other.

## The split

| Record | Where it lives | Key | Why |
|---|---|---|---|
| `character.profile` (name, concept, pronouns, **drives**) | Player's repo | `self` | Who the character is. Portable off Bardcast. |
| `voice.profile` | Player's repo | `self` | The player's voice. Same in every campaign. |
| Behavior model (app state, no lexicon yet) | Keyed on the character | — | How the character acts. Durable. |
| `character.sheet` (traits, provenance) | Campaign's space | player DID | Mechanics for **this** campaign. |
| `character.stateEvent` | Campaign's space | `tid` | A beat in this campaign's story, tied by `chapterRef`. |
| `campaign.chapter` (the episode) | Campaign's space | `tid` | Published to the party, not the public. |
| Reply recordings (Antiphony posts) | Campaign's space, held by Antiphony | — | The raw audio behind every sheet, behavior model and voice clone. The campaign keeps them. |

**A new campaign starts a fresh sheet.** Sheets are keyed by (campaign, character),
so the first ingest into a new campaign finds no sheet and creates an empty one.
Nothing is copied from another campaign's sheet; what carries over is the profile,
the behavior model and the voice. `loop.test.ts` pins this. A sheet stays
readable on its own after the campaign ends (it names its `campaign` and its
`character`), but it is the campaign's record, not the player's.

`drives` moved from the sheet to the profile: motivation is identity, not
mechanics. The sheet gained `campaign` and `character` (the profile's AT-URI) so
a sheet read out of context still says what it belongs to.

In the orchestrator, `Store.getSheet`/`putSheet` take `(campaignId,
characterId)`, the readiness gate reads the sheet from the campaign it is
gating, and ingest is `POST /api/campaigns/:campaignId/characters/:characterId/ingest`.

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
3. **One character per player.** `character.profile` is `literal:self`, so a
   player has exactly one character. Campaign-scoped sheets make that livable
   (one character, different mechanics per campaign), but a player who wants two
   different characters still can't have them.
