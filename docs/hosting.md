# Bardcast hosting

Where Bardcast runs. Updated 2026-10-07.

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
| Database | **D1 `bardcast`**, binding `DB`. Tables are created on the first API request, including `sheet_versions`, `campaign_seats` and `campaign_actions` (the old `character_sheets` table stays in existing databases, unread) | `services/orchestrator/src/adapters/d1/d1.ts` |
| Chapter / voice audio | **No Bardcast bucket yet** | — |

**CI and deploy (2026-10-11).** `.github/workflows/ci.yml` runs typecheck, tests and the build on
every PR and every push to `main`. `.github/workflows/deploy.yml` deploys the Worker with
`wrangler deploy` only after CI is green on `main`, then smoke-checks `/healthz`. Its header lists
the one-time steps: turn off the Workers Builds Git trigger (until then `main` deploys twice, once
untested), and add the `CLOUDFLARE_API_TOKEN` secret and `CLOUDFLARE_ACCOUNT_ID` variable. There is
no Dockerfile and no non-Cloudflare deploy config.
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
  TODO(bardcast): pass a Durable Object `requestLock` before the first PDS write. That
  first write will be a character's profile and sheet versions, which also needs repo
  scopes in place of the default `atproto` scope (`docs/character-creation.md`,
  "Prerequisites").

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

**Through Cloudflare AI Gateway** (decided 2026-10-28). Set `AI_GATEWAY_ID` (with
`CLOUDFLARE_ACCOUNT_ID`) and text-to-speech goes to
`gateway.ai.cloudflare.com/v1/{account}/{gateway}/elevenlabs/...` instead of
`api.elevenlabs.io`. That gets us logs, spend next to Workers AI (Clef), rate limits, retries
and caching. Caching suits the narrator's fixed lines: the session-zero opener and name question
are the same text every time. `AI_GATEWAY_TOKEN` is only for an authenticated gateway.

- **We still use our own ElevenLabs key and account.** The gateway passes the call through, so
  the players' cloned voices work. We don't use the ElevenLabs models in the Workers AI catalog.
  When Cloudflare bills for one of those, it runs on Cloudflare's ElevenLabs account, where our
  clones don't exist. It isn't confirmed whether the catalog models take a custom voice ID with
  our own key.
- **Voice cloning goes straight to ElevenLabs.** It uploads the players' raw recordings, which
  shouldn't sit in gateway logs.
- **The gateway does log what it renders,** which is chapter and narrator text. If that's
  unwanted, turn logging off on the gateway.

## What deploy setup is automatable

Can be authored in-repo: `wrangler` configs for each Worker, R2 buckets, Queues,
secrets slots (`wrangler secret put` for the ElevenLabs key and the Antiphony service
token), and Workers Builds settings. Account-level steps stay manual: billing,
DNS/domain setup, and supplying secret *values*.

One secret lives on Antiphony's side, not ours: its deployment needs
`ANTIPHONY_PLAYBACK_SECRET` set. Every Bardcast recording goes into an atproto
space (the campaign's, or the player's own), and Antiphony refuses to create a
space when it couldn't sign the playback links that keep that audio private. So
without the secret, publishing a prompt fails rather than storing audio in the
open. Those links expire within the hour: Bardcast reads one when it needs the
audio and never stores it.
