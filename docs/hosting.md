# Bardcast hosting

Where Bardcast runs and why. Decision recorded 2026-06-24; updated 2026-09-28 (PostgreSQL store decision). This is a starting
posture, not a lock-in — revisit as load and team preferences evolve.

## Decision: a hybrid

| Piece | Host | Why |
|---|---|---|
| Player PWA + DM console | **Cloudflare Pages** | Static Vite builds; cheap, fast, no caveats |
| Chapter / voice audio | **Cloudflare R2** | The product *is* audio streaming; R2 has **zero egress fees** |
| Orchestrator API (`services/orchestrator`) | **GCP Cloud Run** (Node) | Keeps the Node AT-Proto OAuth client as-is; colocates with the engine |
| Database / Persistence (`Store` + AT-Proto Sessions) | **PostgreSQL** (Neon / Cloud SQL) | Matches Antiphony's portable SQL choice via narrow `SqlClient` port; PGlite for tests |
| Generation pipeline (write → render) | **Async job + queue → R2** | Long audio renders exceed any edge CPU budget; async regardless |
| Engine (Antiphony) | **Cloudflare Workers / Postgres** | Headless audio store, Postgres-backed |

## Database decision: PostgreSQL via SqlClient

Decided 2026-09-28. The orchestrator's `Store` port and AT-Proto session/state stores are backed by **PostgreSQL**:
- Portability: identical to Antiphony's design, standard parameterised queries against a narrow `SqlClient` interface (`query(text, params)`).
- Multiple drivers behind one port:
  - `@neondatabase/serverless` over HTTP for Neon serverless deployments.
  - `pg` Pool for Cloud Run, Cloud SQL, Docker, or self-hosted PostgreSQL.
  - `@electric-sql/pglite` in-process for instantaneous, zero-network unit/integration test execution.
- Auto-migrations run on boot if `DATABASE_URL` is set, with seed data for *Sir Gawain and the Green Knight*.
- Fallback: `InMemoryStore` remains available for zero-config local dev when `DATABASE_URL` is unset.

## Why not all-in on Cloudflare Workers

Workers/Pages/R2 are attractive, and R2 in particular is a real win for audio. The
blocker is **identity**: there is no Workers-compatible AT-Proto OAuth client in
TypeScript. Cloudflare's own write-up (`blog.cloudflare.com/serverless-atproto`,
repo `inanna-malick/statusphere-serverless`) works around this by **rewriting the
OAuth client in Rust → WASM**, because "existing ATProto libraries assume a backend
or browser context" and the edge runtime's redirect handling is incompatible.

We just built `AtprotoIdentityProvider` on `@atproto/oauth-client-node` (Node-only:
node:crypto, DNS handle resolver, lock primitives). Running it on Workers would mean
Rust/WASM or porting the TS libs ourselves. So the orchestrator stays on a **Node
runtime (Cloud Run)** until a Workers-native TS path exists. Everything else can be
Cloudflare today.

A future "all-Cloudflare" migration is possible but costs an AT-Proto identity
rewrite — a deliberate later choice, not a starting requirement.

## Egress note

GCS charges egress; R2 does not. Even with compute on GCP, audio delivery stays on
R2 (or GCS fronted by Cloudflare CDN) so streaming bandwidth isn't a cost sink.

## Audio provider: ElevenLabs

Both stubbed audio ports target **ElevenLabs**, one provider covering two roles:
- `VoiceCloner` → voice cloning: player samples → a `voice_id` stored as
  `VoiceProfile.modelRef`.
- `AudioRenderer` → TTS with those `voice_id`s; multi-character chapters render
  per-speaker and stitch (or via the dialogue API).

ElevenLabs requires consent/verification for voice clones, which makes the existing
`VoiceProfile.consent` field a real gate. The ports were designed for this drop-in;
the adapters are the only new code.

## What deploy setup is automatable

When we're ready, the following can be authored in-repo and driven via `gcloud`
from a session **once authenticated** (`gcloud auth login` + project set):
Dockerfile for the orchestrator, Cloud Run service config, GCS/R2 buckets, Secret
Manager slots (ElevenLabs key, engine service token), and a GitHub Actions deploy
workflow. Account-level steps stay manual: billing, org policy, DNS/domain
verification, OAuth consent screen, and supplying secret *values*.
