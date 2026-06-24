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
[**vox-pop-core**](https://docs.voxpop.phonicfactory.com) — the open-source Hono `/api/v1/*` engine
that owns audio prompts, asynchronous audio replies, identity, and storage. Bardcast adds the parts
that are genuinely new:

1. **A world/narrative engine** — campaign lore + character data → a written, then spoken, chapter.
2. **A readiness gate** — decides when a character has enough signal (sheet + behavior + voice) to appear.
3. **An AT-Protocol identity layer** — characters are keyed on the player's **DID** so a character can
   follow its player across campaigns (the "portable canon" thesis).
4. **Two human surfaces** — a low-friction player client and a richer DM console.

The architecture deliberately follows the precedent in `supper_club_secrets/protocol/ARCHITECTURE.md`:
**source-of-truth state drives a *derived* record layer** — the story drives the data, never the
reverse. In-world (fantasy-calendar) dates are stored as plain string fields, while each record's
`createdAt` carries a real ordering timestamp so a reader timeline can be scrubbed.

## Layout

| Path | Role |
| --- | --- |
| `lexicons/game/bardcast/*` | AT-Protocol record schemas (NSID root behind a single constant — see below). |
| `packages/domain` | The domain model + Zod schemas + the **readiness gate**. The load-bearing seam everything shares. |
| `packages/voxpop-client` | Typed client for the vox-pop-core `/api/v1/*` API. |
| `packages/engagement` | The engagement **port** + a PWA adapter (live) + a Bluesky-communities adapter (stub). |
| `services/orchestrator` | Hono service: runs the readiness gate, narrative generation, the chapter pipeline, and prompt suggestion. |
| `apps/player` | Mobile-first **PWA** — hear a prompt, tap to record a reply. Built for near-zero friction. |
| `apps/dm` | DM console — campaign lore, character roster, generation dashboard, prompt suggestions. |

### Ports & adapters

The orchestrator owns the loop but delegates every external capability to a **port** (an interface),
each backed by a swappable adapter. The scaffold ships **stub** adapters so the whole system type-checks
and the seams are visible; real implementations slot in without touching the use-cases.

| Port | What it abstracts | First adapter |
| --- | --- | --- |
| `VoxPopGateway` | audio prompts + replies | `packages/voxpop-client` |
| `NarrativeWriter` | lore + characters → chapter prose | LLM (stub) |
| `VoiceCloner` | player audio → voice model | provider (stub) |
| `AudioRenderer` | chapter prose + voices → audio | TTS (stub) |
| `IdentityProvider` | AT-Proto OAuth → player DID | atproto (stub) |
| `EngagementChannel` | deliver prompts / collect replies | PWA (live-ish), Bluesky (stub) |
| `Store` | persist campaign/character state | in-memory (stub) |

## The NSID namespace is a placeholder

The lexicons use the **placeholder** root `game.bardcast.*`, wired through the single constant
`NSID_ROOT` in `packages/domain/src/nsid.ts`. Before publishing any record, swap that constant for a
domain you control. The same open decision exists in `supper_club_secrets/protocol/ARCHITECTURE.md §5`.

## Status

**Scaffolding.** Structure, domain model, schemas, ports, and runnable shells are in place. Adapter
bodies and the two clients' UIs are stubs marked with `TODO(bardcast)`. See [`CLAUDE.md`](./CLAUDE.md)
for the orientation a contributor (human or agent) needs.

## Getting started

```bash
nvm use            # Node 22
npm install        # install all workspaces
npm run typecheck  # everything should type-check green
```

## License

MIT.
