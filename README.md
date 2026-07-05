# Bardcast

> Turn a group of friends into characters in an ongoing RPG actual-play podcast — generated from their own voices.

Bardcast is a tabletop-RPG storytelling engine. A **Dungeon Master** sets a scene and prompts the
players; the **players** answer in their own recorded audio. Those answers do triple duty: they fill
in a character sheet, train a predictive model of how the character behaves, and provide voice samples
to clone each player's voice. Once a character is rich enough, Bardcast writes the next **chapter** of
narrative from the campaign lore and the characters, renders it as **audio in the players' cloned
voices**, and hands the DM fresh prompt ideas to keep the quest moving.

The loop:

```
DM scene + prompts ──▶ players record audio replies ──▶ readiness gate
        ▲                                                     │
        │                                              (enough signal?)
        │                                                     ▼
  new prompt ideas ◀── narrative + cloned-voice chapter ◀── generate
```

## How it's built

Bardcast does **not** reinvent audio call-and-response. It is a *consumer* of
[**vox-pop-core**](https://docs.voxpop.phonicfactory.com) (the open-source Hono `/api/v1/*` engine
that owns audio prompts, asynchronous audio replies, and storage — being renamed **Antiphony** to
delineate the engine from the VoxPop app). Bardcast adds the parts that are genuinely new:

1. **A world/narrative engine** — curated campaign canon + character data → a written, then spoken, chapter.
2. **A readiness gate** — decides when a character has enough signal (sheet + behavior + voice) to appear.
3. **A seeded dice/resolution engine** — SRD 5.1 ability checks resolve outcomes; failure is usually a
   setback, and a forbidden outcome (a PC death) backtracks to the last decision node.
4. **Its own AT-Protocol identity layer** — players authenticate by **DID** (no VoxPop identity), so a
   character can follow its player across campaigns (the "portable canon" thesis).
5. **Two human surfaces** — a low-friction player client and a richer DM console.

The architecture deliberately follows the precedent in `supper_club_secrets/protocol/ARCHITECTURE.md`:
**source-of-truth state drives a *derived* record layer** — the story drives the data, never the
reverse. In-world (fantasy-calendar) dates are stored as plain string fields, while each record's
`createdAt` carries a real ordering timestamp so a reader timeline can be scrubbed.

## Layout

| Path | Role |
| --- | --- |
| `lexicons/game/bardcast/*` | AT-Protocol record schemas (NSID root behind a single constant — see below). |
| `packages/domain` | The domain model + Zod schemas, the **readiness gate**, and the **dice/resolution engine**. The load-bearing seam everything shares. |
| `packages/voxpop-client` | Typed client for the engine's `/api/v1/*` API. |
| `packages/engagement` | The engagement **port** + a PWA adapter (live) + a Bluesky-communities adapter (stub). |
| `services/orchestrator` | Hono service: the readiness gate, chapter pipeline, prompt suggestion, and Bardcast's own AT-Proto OAuth routes. |
| `apps/player` | Mobile-first **PWA** — hear a prompt, tap to record a reply. Built for near-zero friction. |
| `apps/dm` | DM console — campaign lore, character roster, generation dashboard, prompt suggestions. |
| `content/campaigns/*` | Staff-curated, licensing-reviewed campaign canon as **OKF** bundles (seed: *Sir Gawain and the Green Knight*). |
| `docs/*` | Design docs — see [Docs](#docs). |

### Ports & adapters

The orchestrator owns the loop but delegates every external capability to a **port** (an interface),
each backed by a swappable adapter. The scaffold ships **stub** adapters so the whole system type-checks
and the seams are visible; real implementations slot in without touching the use-cases.

| Port | What it abstracts | First adapter |
| --- | --- | --- |
| `VoxPopGateway` | audio prompts + replies | `packages/voxpop-client` |
| `NarrativeWriter` | canon + characters → chapter script | LLM (stub) |
| `VoiceCloner` | player audio → voice model | ElevenLabs (stub) |
| `AudioRenderer` | chapter script + voices → audio | ElevenLabs (stub) |
| `IdentityProvider` | AT-Proto OAuth → player DID | atproto (**live**) |
| `EngagementChannel` | deliver prompts / collect replies | PWA (live-ish), Bluesky (stub) |
| `Store` | persist campaign/character state | in-memory (stub) |

## The NSID namespace is a placeholder

The lexicons use the **placeholder** root `game.bardcast.*`, wired through the single constant
`NSID_ROOT` in `packages/domain/src/nsid.ts`. Before publishing any record, swap that constant for a
domain you control. The same open decision exists in `supper_club_secrets/protocol/ARCHITECTURE.md §5`.

## Docs

Design decisions live in [`docs/`](./docs):

- [`story-engine.md`](./docs/story-engine.md) — content/canon model, staged generation, seeded SRD dice, the death-backtrack design.
- [`integration-with-core.md`](./docs/integration-with-core.md) — the two-layer identity model (DID auth + a headless engine user) and the engine requirements it implies.
- [`hosting.md`](./docs/hosting.md) — the hybrid hosting posture (Cloud Run + Cloudflare Pages/R2) and ElevenLabs.
- [`brand.md`](./docs/brand.md) — the locked visual identity ("The Tavern Table"): palette, type, voice, and the ember rule. Tokens + assets live in `packages/brand`.

## Status

**Backend, pre-UI.** Real and tested: the domain model, the **readiness gate**, the **dice/resolution
engine** (deterministic, SRD 5.1), Bardcast's own **AT-Proto identity** provider, and the first
**campaign canon** seed (Gawain, OKF). Still stubbed (marked `TODO(bardcast)`): the LLM `NarrativeWriter`,
the ElevenLabs `VoiceCloner`/`AudioRenderer`, persistence, the Bluesky channel, and the two app UIs —
which stay parked until the backend works. See [`CLAUDE.md`](./CLAUDE.md) for contributor orientation.

## Getting started

```bash
nvm use            # Node 22
npm install        # install all workspaces
npm run typecheck  # all workspaces type-check green
npm test           # domain + orchestrator tests
```

## License

MIT.
