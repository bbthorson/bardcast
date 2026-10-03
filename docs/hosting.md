# Bardcast hosting

Where Bardcast runs. Updated 2026-10-03.

## Rule: Cloudflare only

Everything Bardcast hosts runs on Cloudflare. Nothing should be deployed to GCP, AWS, Vercel,
Fly or any other compute or database host, and new deploy config should target
Cloudflare (Workers, Workers Assets, R2, Hyperdrive, D1, Queues).

Third-party *APIs* we call are not hosting and are allowed: ElevenLabs (voice cloning
and TTS) and the AT-Proto network (users' PDSes, `bsky.social`).

## What is deployed today

Audited against the repo and the Cloudflare account on 2026-10-03.

| Piece | Where it runs | Source of truth |
|---|---|---|
| `apps/web` front door | **Cloudflare Worker `bardcast`** (static assets, SPA fallback) | `wrangler.jsonc` |
| Engine (Antiphony) | **Cloudflare Worker `antiphony-core-api`**, R2 `antiphony-r2-bucket` | Antiphony's own repo |
| Orchestrator API (`services/orchestrator`) | **Not deployed.** Local dev only (`npm run dev:orchestrator`) | no deploy config in repo |
| `apps/player`, `apps/dm` | **Not deployed.** Local dev only | no deploy config in repo |
| Database | **None provisioned.** Orchestrator uses its in-memory store unless `DATABASE_URL` is set | `services/orchestrator/src/index.ts` |
| Chapter / voice audio | **No Bardcast bucket yet** | — |

There is no Dockerfile, no CI workflow and no non-Cloudflare deploy config in this repo.
The `apps/web` build reads `VITE_ORCHESTRATOR_URL`; until the orchestrator is deployed,
the front door has no live API behind it.

## Target for the pieces not yet deployed

| Piece | Cloudflare target |
|---|---|
| `apps/player`, `apps/dm` | Workers static assets, same pattern as `apps/web` |
| Chapter / voice audio | R2 (zero egress, which matters for an audio product) |
| Generation pipeline (write → render) | Queues + a consumer Worker writing to R2; long renders stay async |
| Orchestrator API | A Worker with `nodejs_compat` (see the open question below) |
| Database | Open: D1, or Postgres reached through Hyperdrive (see below) |

## Open questions before the orchestrator can deploy

**AT-Proto OAuth on Workers.** `AtprotoIdentityProvider` is built on
`@atproto/oauth-client-node`. A probe on 2026-10-03 bundled the whole orchestrator as a
Worker with `nodejs_compat` (wrangler 4.147), and it served `/healthz` and
`/atproto/client-metadata.json` in local workerd. Workers now provides `node:crypto` and
`node:dns` (`resolveTxt` over DoH; `lookup` is not implemented). What is left:

- Pass a web `handleResolver` to `NodeOAuthClient`; the default one uses undici's SSRF-safe
  fetch, which does not run on Workers.
- Replace the single-instance `requestLock` with a Durable Object.
- Move the session/state stores to D1 or the Neon HTTP driver (see Database below).

A real Bluesky login from a preview Worker has not been tested yet. So the Rust → WASM
rewrite that Cloudflare's own write-up used (`blog.cloudflare.com/serverless-atproto`)
looks unnecessary, but that isn't proven.

**Database.** The `Store` port and AT-Proto session/state stores sit behind a narrow
`SqlClient` interface (`query(text, params)`), with drivers for Neon over HTTP
(`@neondatabase/serverless`), `pg`, and in-process PGlite for tests. Auto-migrations
run on boot when `DATABASE_URL` is set. A Postgres server itself would live off
Cloudflare (Hyperdrive only pools connections to it), so a strictly Cloudflare-only
store means D1, which would need a SQLite dialect of `schema.sql` and a D1
`SqlClient`.

## Audio provider: ElevenLabs

Both audio ports target **ElevenLabs**, one provider covering two roles:
- `VoiceCloner` → voice cloning: player samples → a `voice_id` stored as
  `VoiceProfile.modelRef`.
- `AudioRenderer` → TTS with those `voice_id`s; multi-character chapters render
  per-speaker and stitch (or via the dialogue API).

ElevenLabs requires consent/verification for voice clones, which makes the existing
`VoiceProfile.consent` field a real gate.

## What deploy setup is automatable

Can be authored in-repo: `wrangler` configs for each Worker, R2 buckets, Queues,
secrets slots (`wrangler secret put` for the ElevenLabs key and the Antiphony service
token), and Workers Builds settings. Account-level steps stay manual: billing,
DNS/domain setup, and supplying secret *values*.
