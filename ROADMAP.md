# Bardcast MVP roadmap

Tracking doc for the path to a first real episode. Check items off as they land; keep this file
honest — it should always match what's actually in the tree. Last full audit: **2026-07-11**
(typecheck green across all workspaces, 14/14 tests passing).

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
- **Antiphony client** (`packages/voxpop-client`) wired behind the gateway port, fetch-mock tested.
- Orchestrator loop skeleton: five use-cases with API routes, loop test runs end-to-end on stubs.
- `apps/web` front door: six screens, branded, deployed to Cloudflare Pages.
- Campaign canon seed: *Sir Gawain and the Green Knight* (OKF).

## M1 — Rename + hardening

No external dependencies; can start immediately.

- [ ] **Antiphony rename**: the engine was separated from VoxPop, so retire the old name —
      `VoxPopGateway` port → `AntiphonyGateway`, `@bardcast/voxpop-client` → `@bardcast/antiphony-client`,
      plus file names (`ports/voxpop-gateway.ts`, `adapters/voxpop-gateway.ts`) and the
      `VoxPopPrompt`/`VoxPopReply` types. Sweep docs (`README.md`, `CLAUDE.md`,
      `docs/integration-with-core.md`) in the same change.
- [ ] Zod-validate orchestrator request bodies and gate writes behind an authenticated DID session
      (`services/orchestrator/src/app.ts` TODO).
- [ ] Identity prod-hardening: mint a real signed (service-JWT) assertion over the DID; replace the
      single-instance OAuth lock with a cross-instance one; handle the cross-origin cookie posture
      (web on Cloudflare Pages, orchestrator on Cloud Run).

## M2 — Persistence

Everything downstream is fake until state survives a restart.

- [ ] Decide the `Store` backing (open: Firestore to colocate with the engine vs. Cloud SQL/Postgres
      alongside Cloud Run). Record the decision in `docs/hosting.md`.
- [ ] Real `Store` adapter replacing `in-memory-store.ts`, including bootstrap/migration for the
      Gawain seed.
- [ ] Persistent, encrypted AT-Proto session/state stores (`adapters/atproto/stores.ts` TODO).

## M3 — Campaign lifecycle API + wiring the front door

The `apps/web` screens exist but manage state client-side; give them real endpoints.

- [ ] `POST /api/campaigns` — create a campaign, persist via `Store`, creator DID as DM.
- [ ] Invite codes: mint on create; `POST` join endpoint validates the code and adds the player's
      DID to the roster.
- [ ] Wire `CreateCampaign`, `JoinInvite`, and `Dashboard` to those endpoints; remove the
      client-side stubs and the offline session fallback (`apps/web/src/session.ts` TODO).

## M4 — Voice pipeline (ElevenLabs)

- [ ] `VoiceCloner` adapter: player samples → **Professional Voice Clone** (PVC — player-owned
      custody keyed on DID; consent is a hard gate, revocation deletes the provider model).
- [ ] Orchestrator voice endpoints: train on sample add, poll status, revoke; wire the
      `apps/web` VoiceClone screen to them (`apps/web/src/voice.ts` TODO).
- [ ] `AudioRenderer` adapter: chapter script → per-speaker TTS render + stitch → R2.

## M5 — Narrative engine

> ⏳ **Waiting**: narrative-writer logic/capabilities are being extracted from another repo.
> Don't build a throwaway implementation here — hold this milestone until that lands, then adapt
> it behind the `NarrativeWriter` port.

- [ ] Real `NarrativeWriter` adapter (canon + character state → chapter script with dice
      checkpoints).
- [ ] Trait/drive inference from reply transcripts in `ingest-replies` (LLM), so the readiness gate
      runs on real signal.
- [ ] `suggest-prompts` consults the `NarrativeWriter` for story-momentum prompts instead of the
      gap-fill heuristic alone.

## M6 — Player surface + delivery

- [ ] `apps/player`: fetch the active prompt for the signed-in player; record; upload the reply via
      the Antiphony uploads + reply API.
- [ ] Web Push (VAPID) in the PWA engagement adapter so players hear about new prompts/chapters.
- [ ] Share one recorder hook between `apps/web` and `apps/player` instead of the current copies.

## M7 — DM console + first episode

- [ ] `apps/dm`: real campaign/roster selection, readiness dashboard, suggested prompts, and a
      trigger for chapter generation.
- [ ] Deploy the loop: orchestrator Dockerfile + Cloud Run config, R2 buckets, Secret Manager slots,
      GitHub Actions workflow (see the automatable list in `docs/hosting.md`).
- [ ] **MVP exit**: run one full episode loop end-to-end on the deployed stack with real players.

## Explicitly out of MVP

- Bluesky-communities engagement adapter (held open behind the port; API unreleased).
- Swapping the placeholder `game.bardcast.*` NSID root — required before *publishing* records, not
  before the loop works.
- The all-Cloudflare migration (blocked on a Workers-native AT-Proto OAuth path).
