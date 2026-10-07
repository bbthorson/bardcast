# Bardcast

> Turn a group of friends into characters in an ongoing RPG actual-play podcast — generated from their own voices.

Bardcast is a tabletop-RPG storytelling engine. Players **make their characters out loud** and own
them: a character and its sheet live in the player's own AT-Protocol account and come along to every
campaign. A **Dungeon Master** sets a scene and prompts the players; the **players** answer in their
own recorded audio. Those answers do triple duty: they teach Bardcast who the character is at this
table, train a predictive model of how the character behaves, and provide voice samples to clone
each player's voice. Once the party is rich enough, Bardcast writes the next **chapter** of narrative
from the campaign lore and the characters, renders it as **audio in the players' cloned voices**,
and hands the DM fresh prompt ideas to keep the quest moving.

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
[**Antiphony**](https://docs.antiphony.dev) (the open-source Hono `/api/v1/*` engine
that owns audio prompts, asynchronous audio replies, and storage). Bardcast adds the parts that are genuinely new:

1. **A world/narrative engine** — curated campaign canon + character data → a written, then spoken, chapter.
2. **A readiness gate** — decides when a character has enough signal (traits + behavior + voice) to appear.
3. **A seeded dice/resolution engine** — SRD 5.2 ability checks resolve outcomes; failure is usually a
   setback, and a forbidden outcome (a PC death) backtracks to the last decision node.
4. **Its own AT-Protocol identity layer** — players authenticate by **DID** (Antiphony is headless and has no user auth), so a
   character can follow its player across campaigns (the "portable canon" thesis). The player owns
   the character and its sheet (immutable versions); a campaign holds a **seat** branched from the
   sheet and an append-only **action log** of what happened at the table.
5. **Two human surfaces** — a low-friction player client and a richer DM console.

The architecture deliberately follows [`universe-starter-kit/protocol/ARCHITECTURE.md`](https://github.com/bbthorson/universe-starter-kit/blob/main/protocol/ARCHITECTURE.md)
(the conventions extracted from the `supper_club_secrets` precedent):
**source-of-truth state drives a *derived* record layer** — the story drives the data, never the
reverse. In-world (fantasy-calendar) dates are stored as plain string fields, while each record's
`createdAt` carries a real ordering timestamp so a reader timeline can be scrubbed.

## Layout

| Path | Role |
| --- | --- |
| `lexicons/game/bardcast/*` | AT-Protocol record schemas (NSID root behind a single constant — see below). |
| `packages/domain` | The domain model + Zod schemas, the **readiness gate**, and the **dice/resolution engine**. The load-bearing seam everything shares. |
| `packages/srd` | A typed subset of the **D&D SRD 5.2** (CC-BY-4.0): classes, species, backgrounds, feats, equipment, skills, conditions. Generated from a pinned commit by its importer; never hand-edited. |
| `packages/antiphony-client` | Typed client for the engine's `/api/v1/*` API. |
| `packages/engagement` | The engagement **port** + a PWA adapter (live) + a Bluesky-communities adapter (stub). |
| `services/orchestrator` | Hono service: the readiness gate, chapter pipeline, prompt suggestion, and Bardcast's own AT-Proto OAuth routes. |
| `apps/web` | Public **front door** (Cloudflare Workers static assets) — AT-Proto sign-in, create/join a campaign, and manage your voice clone. |
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
| `AntiphonyGateway` | audio prompts + replies | `packages/antiphony-client` |
| `NarrativeWriter` | canon + characters → chapter script | LLM (stub) |
| `VoiceCloner` | player audio → voice model | ElevenLabs (with `ELEVENLABS_API_KEY`; stub otherwise) |
| `AudioRenderer` | chapter script + voices → audio | ElevenLabs (with `ELEVENLABS_API_KEY`; stub otherwise) |
| `IdentityProvider` | AT-Proto OAuth → player DID | atproto (**live**) |
| `EngagementChannel` | deliver prompts / collect replies | PWA (live-ish), Bluesky (stub) |
| `DecisionModel` | pick among listed options (trait inference) | Clef on Workers AI (stub without credentials) |
| `Store` | persist campaign/character state | D1 (deployed), Postgres, in-memory (tests/dev) |

## The NSID namespace is a placeholder

The lexicons use the **placeholder** root `game.bardcast.*`, wired through the single constant
`NSID_ROOT` in `packages/domain/src/nsid.ts`. Before publishing any record, swap that constant for a
domain you control. The same one-constant discipline is documented in
[`universe-starter-kit/protocol/ARCHITECTURE.md` §5](https://github.com/bbthorson/universe-starter-kit/blob/main/protocol/ARCHITECTURE.md).

## Docs

Design decisions live in [`docs/`](./docs):

- [`story-engine.md`](./docs/story-engine.md) — content/canon model, staged generation, seeded SRD dice, the death-backtrack design.
- [`character-model.md`](./docs/character-model.md) — which character records live in the player's repo and which in the campaign's space.
- [`character-creation.md`](./docs/character-creation.md) — the character decisions: player-owned versioned sheets, campaign seats, the action log, gear, and the voice-driven creation flow.
- [`packages/srd/README.md`](./packages/srd/README.md) — the SRD 5.2 data: where it comes from, how to update it, attribution.
- [`integration-with-core.md`](./docs/integration-with-core.md) — the two-layer identity model (DID auth + a headless engine user) and the engine requirements it implies.
- [`hosting.md`](./docs/hosting.md) — Cloudflare-only hosting: what is deployed today, the target for the rest, and ElevenLabs.
- [`brand.md`](./docs/brand.md) — the visual identity ("Felt & Vellum"): palette, type, voice seals, dice shapes, and the candle rule. Tokens, generative marks + assets live in `packages/brand`.

## Status

**Backend first, front door live.** Real and tested: the domain model, the **readiness gate**, the
**dice/resolution engine** (deterministic, SRD 5.2, not yet wired into chapter generation), the
**character model** (player-owned sheet versions, campaign seats, the action log, gear), the
**SRD 5.2 data** (`packages/srd`), persistence (**D1** deployed, Postgres, in-memory), ElevenLabs
voice adapters, trait inference on Workers AI, Bardcast's own **AT-Proto identity**, and the first
**campaign canon** seed (Gawain, OKF). The **`apps/web` front door** runs on Cloudflare: the home page,
the `/your-data` page, sign-in, campaigns, invites and voice consent. Still stubbed (marked `TODO(bardcast)`):
the LLM `NarrativeWriter`, character creation, writing records to players' repos, the Bluesky
channel. The milestone-by-milestone path to the MVP is tracked in [`ROADMAP.md`](./ROADMAP.md). See
[`CLAUDE.md`](./CLAUDE.md) for contributor orientation.

## Getting started

```bash
nvm use            # Node 22
npm install        # install all workspaces
npm run typecheck  # all workspaces type-check green
npm test           # srd + domain + orchestrator tests
```

## License

MIT. Includes material from the D&D System Reference Document 5.2 under CC-BY-4.0; see
[`NOTICE`](./NOTICE).
