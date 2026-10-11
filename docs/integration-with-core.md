# Bardcast ↔ Antiphony: identity, ownership and visibility

How Bardcast relates to the call/response engine (**Antiphony**). Updated 2026-10-11, after a
design review across Antiphony, Vox Pop and Bardcast. The platform side is in Antiphony's
[`specs/atproto-authority-model.md`](https://github.com/bbthorson/antiphony/blob/main/specs/atproto-authority-model.md)
(D1, D2, D6, D8) and
[`specs/cross-repo-design.md`](https://github.com/bbthorson/antiphony/blob/main/specs/cross-repo-design.md).

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

| Records | `at://` authority | Author segment (in a space) | The player is |
| :--- | :--- | :--- | :--- |
| Campaign prompts and replies (Antiphony posts) | Bardcast's DID, in the campaign's space | Bardcast's DID | the `authorDid` facet |
| Bardcast's own campaign records: seats, actions, state events, chapters | Bardcast's DID, in the campaign's space | Bardcast's DID | named inside the record where relevant |
| Character-creation recordings | Bardcast's DID, in the player's private space | Bardcast's DID | the `authorDid` facet |
| The character: profile, sheet versions, voice profile | the player's own DID, in their own repo | — | the owner |

**Why the player's DID is never in a space URI** (decided 2026-10-11, Antiphony D8). In a space,
each author's records come with a commit signed by that author's key, and readers find them by
resolving the author's DID. A player's DID resolves to their own PDS, which doesn't hold these
records, and Antiphony must never hold a player's key. With Bardcast's DID in the author segment,
other atproto apps find the records at Antiphony and can verify them. The player is still
credited on every post, through a facet that can be corrected without rewriting anything.

This matches who keeps what: campaign recordings belong to the campaign, and creation recordings
stay with Bardcast. What is portable for a player is their character, in their own repo.

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
