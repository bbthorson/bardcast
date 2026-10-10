# Bardcast MVP roadmap

Tracking doc for the path to a first real episode. Check items off as they land; keep this file
honest — it should always match what's actually in the tree. Last full audit: **2026-10-07**
(typecheck green across all workspaces; 93/93 tests passing across srd (11), domain (29) and
orchestrator (53), the store tests against in-process PGlite and SQLite).

## MVP definition (exit criteria)

One full loop on real infrastructure: a DM publishes a prompt → players reply in recorded audio →
trait/voice signal accumulates → the readiness gate passes → Bardcast writes a chapter, renders it
in the players' cloned voices, and suggests the DM new prompts — with all state persisted (survives
a restart) and the loop deployed per [`docs/hosting.md`](./docs/hosting.md).

## M0 — Baseline (done)

What's real and verified today, so the checkboxes below start from an honest floor:

- Domain model + Zod schemas mirroring the lexicons; the **readiness gate**; the seeded SRD
  **dice/resolution engine** (tested).
- **AT-Proto identity**: real OAuth provider mounted at `/atproto`, consumed by `apps/web` sign-in.
- **Antiphony client** (`packages/antiphony-client`) wired behind the gateway port, fetch-mock tested.
- Orchestrator loop skeleton: five use-cases with API routes, loop test runs end-to-end on stubs.
- `apps/web` front door: six screens, branded, deployed to Cloudflare (Worker `bardcast`, static assets).
- Campaign canon seed: *Sir Gawain and the Green Knight* (OKF, Pinakes 0.9.1).

## M1 — Rename + hardening

No external dependencies; can start immediately.

- [x] **Antiphony rename**: the engine was separated from VoxPop, so retired the old name —
      `VoxPopGateway` port → `AntiphonyGateway`, `@bardcast/voxpop-client` → `@bardcast/antiphony-client`,
      the `VoxPopPrompt`/`VoxPopReply` types → `AntiphonyPrompt`/`AntiphonyReply`, the `voxpop`
      service field → `antiphony`, gateway file names, and a doc sweep. Also bumped `@antiphony/shared`
      to `^0.7.0` and dropped the local `BlobRef` mirror in favour of its `BlobRefSchema`.
- [x] **Finish the voxpop→antiphony purge**: purged `voxPopPromptUri`/
      `voxPopReplyUri` domain + engagement-port field names to `antiphonyPromptUri`/
      `antiphonyReplyUri`, the `VOXPOP_BASE_URL`/`VOXPOP_SERVICE_TOKEN` env vars to
      `ANTIPHONY_BASE_URL`/`ANTIPHONY_SERVICE_TOKEN`, updated config fields, and
      bumped `@antiphony/shared` to `^0.7.0`.
- [x] Zod-validate orchestrator request bodies and gate writes behind an authenticated DID session
      (`services/orchestrator/src/app.ts`).
- [x] Handle cross-origin cookie posture (`SameSite=None; Secure` in prod, `Lax` in dev) with CORS credentials
      support for the web app talking to the orchestrator on a separate origin.
- [ ] Identity prod-hardening: mint a real signed (service-JWT) assertion over the DID; replace the
      single-instance OAuth lock with a cross-instance one.

## M2 — Persistence

Everything downstream is fake until state survives a restart.

- [x] Decide the `Store` backing: **PostgreSQL** matching Antiphony's narrow `SqlClient` port design
      (drivers for Neon HTTP, `pg`, and in-process PGlite for tests).
- [x] Production backing under the Cloudflare-only rule: **D1** (`D1Store`, binding `DB`), deployed;
      see `docs/hosting.md`.
- [x] Real `Store` adapter (`PostgresStore`) replacing `in-memory-store.ts`, with auto-migration (`schema.sql`)
      and bootstrap for the *Sir Gawain and the Green Knight* seed.
- [x] Persistent AT-Proto sessions: now the shared `@bbthorson/atproto-cf-auth` package with a D1
      store (see `docs/hosting.md`).

## M3 — Campaign lifecycle API + wiring the front door

The `apps/web` screens exist but manage state client-side; give them real endpoints.

- [x] `POST /api/campaigns` — create a campaign, persist via `Store`, creator DID as DM.
- [x] `GET /api/campaigns` — list campaigns for authenticated DID.
- [x] Invite codes: `POST /api/campaigns/:campaignId/invites` mints code; `POST /api/campaigns/join`
      validates code and adds the player's DID to the roster.
- [x] Wire `CreateCampaign`, `JoinInvite`, and `Dashboard` to those endpoints; support dynamic campaign
      and character URLs with live orchestrator state.

## M3b — Characters

The player makes and owns their characters; a campaign seats them. Design and decisions:
[`docs/character-creation.md`](./docs/character-creation.md).

- [x] Player-owned **character sheet** as immutable versions (`prev` chain, real TID + CID refs,
      stale writes refused), written only through `use-cases/sheets.ts`.
- [x] **Campaign seat** branched from a sheet: reset to the table's starting level, starting items per
      the campaign's gear policy, levels earned at the table, reply-inferred traits.
- [x] Append-only **action log** (`campaign.action`) committed per finished chapter; seat hit points,
      conditions and items derived by replaying it.
- [x] Seats close; **bringing progress home** carries levels and gear (never hit points) back as a new
      sheet version, or asks the player when histories diverged.
- [x] **SRD 5.2 data** (`packages/srd`): generated from a pinned 5e-bits commit, validated,
      spot-checked, attributed (CC-BY-4.0).
- [ ] AC and attack math from equipped gear (SRD armor and weapons).
- [ ] Character creation: session-zero use-cases (Bardcast narrator asks, Clef suggests, the player
      confirms), then the screens (reveal card, seal press, invite flow's character picker).
- [ ] The You tab lists a player's characters; the web app stops keying a joined character by the
      player's DID (profiles are keyed by `tid` now).
- [x] Update the authority table in Antiphony's `specs/atproto-authority-model.md`: D2 says sheets
      are the player's; D6 records the character model.
- [x] Decide where character-creation recordings live: a private space per player under Bardcast's
      DID, created when they start their first character (Antiphony D6).
- [ ] **Blocker for real players:** keep no real recordings until Bardcast publishes into spaces
      (the next item) and the Antiphony deployment has `ANTIPHONY_PLAYBACK_SECRET` set. Antiphony's
      side is built: Phase 1 (2026-10-07) gave posts a space placement and space URIs, and Phase 2
      (2026-10-08, API contract 0.7.0) added the spaces API, uploads and posts into a space, and
      signed, expiring playback for that audio, so the proxy no longer plays it to anyone holding a
      link. Until Bardcast's prompts and replies actually go into a space, the privacy promises on
      the consent screen and `/your-data` still aren't true.
- [ ] Bardcast's side of spaces (Phase 4 in `antiphony/specs/spaces.md`): `AntiphonyGateway.ensureSpace`
      over `PUT /api/v1/spaces/{type}/{skey}`; recordings uploaded with `spaceType` + `skey`; prompts
      posted with `space` into the campaign's or player's space (`SpaceTypes` in
      `packages/domain/src/nsid.ts`); playback URLs fetched fresh, never stored, since they expire in
      an hour. Adopt `@antiphony/shared` 0.9.0 once it's published.
- [ ] Decide campaigns with fixed characters (the Green Knight casting Gawain): a `characterPolicy`.

## M4 — Voice pipeline (ElevenLabs)

- [x] `VoiceCloner` adapter (`ElevenLabsVoiceCloner`): IVC creation via POST /v1/voices/add using audio samples,
      shared PVC import from private link, and revocation via DELETE /v1/voices/{voice_id}.
- [x] `AudioRenderer` adapter (`ElevenLabsAudioRenderer`): speaker-tagged multi-voice TTS synthesis, binary
      audio frame concatenation, and storage persistence.
- [ ] Orchestrator voice endpoints: train on sample add, poll status, revoke; wire the
      `apps/web` VoiceClone screen to them (`apps/web/src/voice.ts` TODO).

## M5 — Narrative engine

> ⏳ **Waiting**: narrative-writer logic/capabilities are being extracted from another repo.
> Don't build a throwaway implementation here — hold this milestone until that lands, then adapt
> it behind the `NarrativeWriter` port.

- [ ] Real `NarrativeWriter` adapter (canon + character state → chapter script with dice
      checkpoints).
- [ ] Wire the Resolve stage: run beats through `abilityCheck` (today it's only called in tests;
      chapters are written with an empty `rollLog`) and commit the chapter's actions with
      `commitChapterActions` once it's ready.
- [x] Trait inference from reply transcripts in `ingest-replies`, through the `DecisionModel` port
      (Clef-flash on Workers AI) over a closed trait vocabulary. Independent of the `NarrativeWriter`.
- [ ] Drive inference from reply transcripts (onto the durable `CharacterProfile`).
- [ ] `suggest-prompts` consults the `NarrativeWriter` for story-momentum prompts instead of the
      gap-fill heuristic alone.

## M6 — Player surface + delivery

- [x] `apps/player`: upload audio replies directly to the orchestrator BFF (`POST /api/campaigns/:id/characters/:charId/reply`)
      which proxies to Antiphony and triggers character signal ingestion.
- [ ] Web Push (VAPID) in the PWA engagement adapter so players hear about new prompts/chapters.
- [ ] Share one recorder hook between `apps/web` and `apps/player` instead of the current copies.

## M7 — DM console + first episode

- [x] `apps/dm`: real campaign/roster selection, readiness dashboard, suggested prompts, prompt composer
      and publishing, and trigger for chapter generation with audio playback.
- [ ] Deploy the loop on Cloudflare: orchestrator Worker (`nodejs_compat`), player/DM static Workers,
      R2 buckets, Queues for rendering, `wrangler` secrets (see `docs/hosting.md`).
- [ ] **MVP exit**: run one full episode loop end-to-end on the deployed stack with real players.

## Explicitly out of MVP

- Bluesky-communities engagement adapter (held open behind the port; API unreleased).
- Swapping the placeholder `game.bardcast.*` NSID root — required before *publishing* records, not
  before the loop works. It blocks the next item, since OAuth repo scopes name the NSID.
- Writing records to players' repos (profile, sheet versions) and the campaign space: needs OAuth
  repo scopes and a Durable Object refresh lock (`docs/hosting.md`). State lives in the `Store`
  until then, per the state-drives-records rule.
