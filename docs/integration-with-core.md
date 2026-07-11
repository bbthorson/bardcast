# Bardcast ↔ Core Engine: identity & visibility

How Bardcast relates to the underlying call/response engine (**Antiphony**).

> **Update 2026-07-11 — the engine shipped this.** The requirements below
> (2026-06-24) are now satisfied by Antiphony's **v0.2.0 "core-surface trim"**,
> and its auth model is simpler than the DID-token bridge first sketched here.
> The [current model](#current-model-antiphony-v020) section is authoritative;
> the original requirements are kept for provenance.

## Current model (Antiphony v0.2.0)

Antiphony is a **headless** store for AT-Protocol-shaped audio posts. It holds no
user data — profiles live in the calling app (Bardcast, the BFF).

- **One credential: an app service token.** Every caller is an application that
  authenticates with `Authorization: Bearer <service-token>`. The token
  identifies the app and establishes its tenancy (`originAppId`). Antiphony
  verifies **no** end-user identity tokens — so the earlier `tokenForPlayer`
  DID→bearer bridge (R3) is **obsolete** on the engine path.
- **The acting player is asserted per request.** Writes (and viewer-scoped
  reads) carry `X-Antiphony-Acting-Actor: <id>` and optional
  `X-Antiphony-Acting-Actor-Did: <did>`. Bardcast asserts the player's **DID**;
  Antiphony stamps it onto the post's `authorDid`. **This is how every post is
  tied to its player.** Bardcast reaches all of this via `@bardcast/voxpop-client`
  behind the `VoxPopGateway` port (the gateway's `actingDid`).
- **One post record.** `dev.antiphony.audio.post` — a post with no `reply` is a
  prompt, a post with a `reply` (root+parent StrongRef) is a reply. Audio is a
  `dev.antiphony.embed.audio` blob uploaded first (`POST /api/v1/audio/upload`,
  multipart `file`) then referenced on the post.

### Domain setup (one-time)

1. **Register Bardcast as an app** in the Antiphony deployment's
   `ANTIPHONY_APP_TOKENS` (`appId:token`). The token becomes
   `VOXPOP_SERVICE_TOKEN`; the `appId` is Bardcast's `originAppId` (tenancy).
2. Tenancy scoping (R2) is automatic: posts are isolated by `originAppId`, so
   Bardcast content never appears in another app's surfaces.

### Contract-package caveat

`@bardcast/voxpop-client` mirrors the engine's `openapi.json` locally rather than
importing the write codecs from `@antiphony/shared`, because the published
`@antiphony/shared@0.3.0` still types the blob `ref` as a plain string while the
deployed engine uses the AT-Proto `{ $link }` object. Once the package is
republished to match, drop the local mirrors and import its codecs directly.

---

## Original requirements (2026-06-24)

The below captures decisions made 2026-06-24. Some items are **requirements on
the engine's data model**, flagged `[ENGINE]` — they belong in the engine repo,
noted here so Bardcast's assumptions are explicit. See the update above for how
the engine now satisfies them.

## The engine is not the app

`vox-pop-core` is a generic audio call/response engine. **VoxPop** is one product
built on it; **Bardcast** is another. Conflating the engine with the VoxPop app
causes the confusion this doc resolves.

**Open decision — rename the engine.** Consider giving the engine a neutral name
to delineate it from the VoxPop application — e.g. **Antiphony** (liturgical
call-and-response; on-the-nose and distinctive) or **Echo** (simpler, but heavily
overloaded as a product name). Blast radius is in the *engine* repo, not Bardcast:
package scope (`@vox-pop/*`), the lexicon NSID root (`com.voxpop.*`), the docs
domain. Bardcast only references the engine via `@bardcast/voxpop-client` + the
`VoxPopGateway` port, so a rename here is a one-package change.

## Identity: two distinct layers

These were being conflated. They are separate:

1. **Auth identity — Bardcast's own.** Players authenticate via AT-Protocol OAuth
   (their DID). Bardcast does **not** use any VoxPop identity: no VoxPop login, no
   VoxPop profile, no VoxPop inbox, no VoxPop public page. This is the
   `AtprotoIdentityProvider`.

2. **Core data principal — a headless backing user.** The engine still needs a
   *user record* to own prompt/reply data (prompts and replies belong to someone
   in the engine's model). A Bardcast player's DID maps to such a record. But that
   record is **headless**: it exists only to own data, and is never surfaced as a
   VoxPop user.

So "don't use vox-pop identity" = don't use its *auth/profile/inbox/public*
surfaces. It does **not** mean "no user row in the engine" — the data model needs
one. The token seam (`IdentityProvider.tokenForPlayer`) bridges these: DID →
bearer accepted by a Bardcast-controlled engine deployment running a DID-trusting
auth adapter, which resolves the DID to its headless core user.

### `[ENGINE]` R1 — headless / app-scoped users
The engine needs a user that owns data but has **no inbox and no public-profile
projection**. Whether modeled as a flag on the user, an "app/origin" attribute, or
membership in a non-public organization is an engine decision. Bardcast requires:
such a user can create prompts and receive replies, but never appears in VoxPop's
public/user-facing surfaces.

## Visibility: Bardcast prompts render only in Bardcast

`[ENGINE]` **R2 — prompt visibility scoping.** Prompts created by Bardcast must
**not** render in any VoxPop surface — not public pages, not feeds, not inbox.
They are visible only within Bardcast (the DM/player clients reading via
`VoxPopGateway`).

Likely mechanism (engine's call): scope Bardcast prompts to an app/organization
and have the engine's public **FeedService** + public projections **exclude**
prompts outside the public scope. The engine already has `OrganizationService` and
`FeedService` — the requirement is that public projections are opt-in by scope,
not default-all.

## Summary of engine requirements

| # | Requirement | Why |
|---|---|---|
| R1 | Headless / app-scoped users (no inbox, no public profile) | Bardcast players own data but aren't VoxPop users |
| R2 | Prompt visibility scoping; public projections exclude non-public scope | Bardcast prompts render only in Bardcast |
| R3 | DID-trusting auth adapter on the Bardcast deployment | Bridge Bardcast's AT-Proto DID → headless core user (the `DidAuthAdapter` `auth-port.ts` already anticipates) |
