# Bardcast ↔ Antiphony: identity, ownership and visibility

How Bardcast relates to the call/response engine (**Antiphony**). Updated 2026-10-11, after a
design review across Antiphony, Vox Pop and Bardcast. The platform side is in Antiphony's
[`specs/atproto-authority-model.md`](https://github.com/bbthorson/antiphony/blob/master/specs/atproto-authority-model.md)
(D1, D2, D6, D8, replaced in part by `audio-service-and-groups.md`) and
[`specs/cross-repo-design.md`](https://github.com/bbthorson/antiphony/blob/master/specs/cross-repo-design.md).

## Calling Antiphony

Antiphony is a **headless** store for AT-Protocol-shaped audio posts. It holds no user data and
does no user sign-in: AT-Proto OAuth is Bardcast's job (`@bbthorson/atproto-cf-auth`).

- **One credential: an app service token.** Bardcast authenticates with
  `Authorization: Bearer <service-token>`, which also establishes its tenancy (`originAppId`).
- **The acting player is asserted per request.** Writes carry `X-Antiphony-Acting-Actor` and
  `X-Antiphony-Acting-Actor-Did`, both the player's DID. Antiphony stamps it on the post as
  `authorId` / `authorDid`. This is how every post is tied to its player.
- **One post record.** `dev.antiphony.audio.post`: no `reply` makes it a prompt, a `reply`
  (root and parent StrongRefs) makes it a reply. Audio is uploaded first
  (`POST /api/v1/audio/upload`), then referenced as a `dev.antiphony.embed.audio`.
- **One way in.** Bardcast reaches Antiphony only through `packages/antiphony-client`, behind the
  `AntiphonyGateway` port. The client imports the canonical codecs and NSIDs from
  `@antiphony/shared`.

## Who keeps what

**Decided 2026-11-01** (Antiphony's [`specs/audio-service-and-groups.md`](https://github.com/bbthorson/antiphony/blob/master/specs/audio-service-and-groups.md)): **members own what they write, and work Bardcast
generates belongs to the table.** A table (the friends who play together) is an atmospheric group
with its own DID. Each campaign is a space under the table's DID, keyed by the campaign.

| Records | `at://` authority | Author segment (in a space) | Kept by |
| :--- | :--- | :--- | :--- |
| A DM's campaign prompts | the table's DID, in the campaign's space | the DM's DID | the DM |
| A player's campaign replies | the table's DID, in the campaign's space | the player's DID | the player: if they delete one or leave, it goes |
| Chapters, seats, the action log, state events | the table's DID, in the campaign's space | the table's DID | the table, including after a player leaves |
| Character-creation recordings | the player's DID, in their personal space | the player's DID | the player |
| The character: profile, sheet versions, voice profile | the player's own DID, in their own repo | — | the player |

- **Chapters belong to the table.** Bardcast writes and renders them in the players' cloned voices,
  and they stay when a player leaves. The join flow must say so before a player takes a seat.
- **Hosting moves; URIs don't.** Most players' PDSes can't hold space records yet, so their replies
  and creation recordings are hosted for them (by Antiphony, or Bardcast for its own collections)
  and served only to Bardcast. Once a player's PDS supports spaces, Bardcast writes the same
  records there with their OAuth session, and the URI and CID stay the same.
- **A deleted reply a chapter used** leaves a dangling reference in the action log; the chapter
  stays.

**What the code does today.** It still follows the earlier rule, Antiphony D8. Every recording is
under Bardcast's DID, with Bardcast's DID as the author segment and the player as the `authorDid`
facet. The switch to player authorship has to land in Antiphony and here before Bardcast keeps its
first recording. It's listed in `ROADMAP.md`. Table DIDs wait on choosing a group host.

## Visibility

Every recording goes into a space (`packages/domain/src/spaces.ts`): a campaign's prompts and
replies in `campaignSpace(campaignId)`, a player's creation recordings in `playerSpace(did)`.
Bardcast creates each space with `managing-app` read and write policies: it is the managing app,
and decides who hears what. Audio in a space plays only from signed links that expire within the
hour, so a playback URL is used at once and never stored.

Bardcast content never appears in another app's surfaces: posts are isolated by `originAppId`.

## Setup (one-time per deployment)

1. **Register Bardcast as an app** in the Antiphony deployment's `ANTIPHONY_APP_TOKENS`
   (`appId:token`). The token is Bardcast's `ANTIPHONY_SERVICE_TOKEN`.
2. **Pin Bardcast's DID** in `ANTIPHONY_APP_DIDS`. Its DID document must name Antiphony as space
   host (`#atproto_space_host`). Bardcast is not yet a tenant in production.
3. **The deployment needs `ANTIPHONY_PLAYBACK_SECRET`**, or creating a space fails and so does
   publishing a prompt (see `docs/hosting.md`).

## Open

- **Hosting Bardcast's own campaign records** for third-party readers. Today they live in
  Bardcast's state (D1 database). When another atproto app needs to read a campaign, Bardcast
  serves them as the repo host for its own DID in that space (Antiphony's cross-repo design,
  Phase 3).

The engine's original requirements from 2026-06-24 (headless users, prompt visibility scoping, a
DID-trusting auth adapter) were met by Antiphony v0.2.0 and are no longer tracked here.
