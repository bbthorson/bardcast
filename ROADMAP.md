# Bardcast MVP roadmap

Tracking doc for the path to a first real episode. Check items off as they land; keep this file
honest — it should always match what's actually in the tree. Last full audit: **2026-09-28**
(typecheck green across all workspaces, 17/17 tests passing across domain + orchestrator with in-process PGlite).

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
      (drivers for Neon HTTP, `pg`, and in-process PGlite for tests). Production backing is still open under
      the Cloudflare-only rule (D1 vs. Postgres via Hyperdrive); see `docs/hosting.md`.
- [x] Real `Store` adapter (`PostgresStore`) replacing `in-memory-store.ts`, with auto-migration (`schema.sql`)
      and bootstrap for the *Sir Gawain and the Green Knight* seed.
- [x] Persistent AT-Proto app session and OAuth session/state stores (`PostgresAppSessionStore`,
      `PostgresSessionStore`, `PostgresStateStore`).

## M3 — Campaign lifecycle API + wiring the front door

The `apps/web` screens exist but manage state client-side; give them real endpoints.

- [x] `POST /api/campaigns` — create a campaign, persist via `Store`, creator DID as DM.
- [x] `GET /api/campaigns` — list campaigns for authenticated DID.
- [x] Invite codes: `POST /api/campaigns/:campaignId/invites` mints code; `POST /api/campaigns/join`
      validates code and adds the player's DID to the roster.
- [x] Wire `CreateCampaign`, `JoinInvite`, and `Dashboard` to those endpoints; support dynamic campaign
      and character URLs with live orchestrator state.

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
  before the loop works.
