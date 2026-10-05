# Bardcast hosting

Where Bardcast runs. Updated 2026-10-04.

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
| Orchestrator API (`services/orchestrator`) | **The same Worker**, for `/api/*`, `/atproto/*` and `/healthz` (`run_worker_first`) | `services/orchestrator/src/worker.ts` |
| Engine (Antiphony) | **Cloudflare Worker `antiphony-core-api`**, R2 `antiphony-r2-bucket` | Antiphony's own repo |
| `apps/player`, `apps/dm` | **Not deployed.** Local dev only | no deploy config in repo |
| Database | **D1 `bardcast`**, binding `DB`. Tables are created on the first API request | `services/orchestrator/src/adapters/d1/d1.ts` |
| Chapter / voice audio | **No Bardcast bucket yet** | — |

There is no Dockerfile, no CI workflow and no non-Cloudflare deploy config in this repo.
`npm run dev:orchestrator` still runs the orchestrator under Node for local development,
with its in-memory store (or Postgres when `DATABASE_URL` is set).

## Sign-in (AT-Proto OAuth) on Workers

Sign-in uses [`@bbthorson/atproto-cf-auth`](https://github.com/bbthorson/atproto-cf-auth),
the package Brad's Bluesky apps share. Its README covers how it works. In Bardcast:

- **Server.** `AtprotoIdentityProvider` creates the package's auth with `basePath: "/atproto"`
  and a `d1Store` on the `DB` binding (one `bsky_auth` table, created on first use).
  Everything stored is sealed under the `SESSION_SECRET` Worker secret. Without that
  secret, the API answers `503 server_not_configured`. Changing it signs everyone out.
- **Browser.** `apps/web/src/session.ts` uses the package's headless client, and reads a
  failed sign-in back from `?auth_error=`.
- **One origin.** The web app and the orchestrator share an origin, so the `bsky_sid`
  session cookie is first-party (`SameSite=Lax`), and the web build calls the API with
  relative URLs. `VITE_ORCHESTRATOR_URL` overrides that.
- **Local dev.** Sign in through `npx wrangler dev` and open the app at `http://127.0.0.1:8787`,
  not `localhost`: Bluesky's development client redirects to the loopback IP. `vite dev`
  points at `http://127.0.0.1:8787`.
- **`X-Acting-Did`** is honoured only with the stub identity provider (local dev and
  tests). With real sign-in on, only the session cookie names the caller.
- **Lock.** The package's default refresh lock is per-isolate. Bardcast does not yet call
  a player's PDS with their OAuth session, so nothing contends for it.
  TODO(bardcast): pass a Durable Object `requestLock` before the first PDS write.

## Target for the pieces not yet deployed

| Piece | Cloudflare target |
|---|---|
| `apps/player`, `apps/dm` | Workers static assets, same pattern as `apps/web` |
| Chapter / voice audio | R2 (zero egress, which matters for an audio product) |
| Generation pipeline (write → render) | Queues + a consumer Worker writing to R2; long renders stay async |

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
