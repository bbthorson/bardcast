# CLAUDE.md — Bardcast

Orientation for an agent or contributor working in this repo. Read this before changing anything.

## What this is

Bardcast generates an ongoing **RPG actual-play podcast** from a group of friends. A Dungeon Master
prompts the players; players answer in recorded audio; those answers build each character (sheet +
behavioral model + voice clone). When a character has enough signal, Bardcast writes a narrative
**chapter** and renders it in the players' **cloned voices**, then suggests the DM new prompts.

## The three roles this product plays

1. **Antiphony consumer.** Audio prompts and asynchronous audio replies are NOT ours — they belong
   to [`Antiphony`](https://docs.antiphony.dev) (`/api/v1/*` Hono API). We reach it only
   through `packages/antiphony-client` behind the `AntiphonyGateway` port. Do not reimplement call/response.
2. **World/narrative engine.** Campaign lore + character state → chapter. This is the new value.
3. **AT-Protocol identity layer.** Characters are keyed on the player's **DID** so a character is
   portable across campaigns. AT-Proto OAuth is OUR job — Antiphony is a headless engine and does not handle user OAuth.

## Load-bearing principles

Inherited from [`universe-starter-kit/protocol/ARCHITECTURE.md`](https://github.com/bbthorson/universe-starter-kit/blob/main/protocol/ARCHITECTURE.md).
First proven in `supper_club_secrets`, now maintained in the public **universe-starter-kit**
(state-drives-records = §2, identity = §7, fantasy time = §8, NSID discipline = §5). Cite the
kit, not the private repo.

- **State drives the derived record layer, never the reverse.** Campaign/character state is the source
  of truth; AT-Proto records in `lexicons/` shapes are a *projection*. If state changes, records
  regenerate. Never edit a record to "fix" state.
- **DID is the durable identity key.** Local stable IDs (`char.*`, `campaign.*`) map to DIDs. A
  character's profile, behavior model, and voice reference hang off the player's DID, not a
  campaign-local row. The **character sheet is the exception**: it is campaign-scoped, one per
  (campaign, character), so mechanics can differ between concurrent campaigns. See
  `docs/character-model.md`.
- **Fantasy time vs. real time.** In-world dates (fantasy calendars) are a plain **string** field. Each
  record's `createdAt` carries a real ISO timestamp for ordering, so a timeline can be scrubbed. Never
  put a 5-digit fantasy year in `createdAt`.
- **NSID is a placeholder.** Root `game.bardcast.*` lives in one constant (`packages/domain/src/nsid.ts`).
  Swap before publishing.

## Architecture: ports & adapters

The orchestrator's `src/use-cases/*` express the loop in terms of **ports** (interfaces in
`src/ports/`). Every external capability is a port with a swappable adapter in `src/adapters/`. To add a
real capability, write an adapter — do not reach into a use-case and call a vendor SDK directly.

Ports: `AntiphonyGateway`, `NarrativeWriter`, `VoiceCloner`, `AudioRenderer`, `IdentityProvider`,
`EngagementChannel`, `Store`. All current adapters are stubs marked `TODO(bardcast)`.

## The engagement seam (why it's a port)

The player surface is decided as **PWA-first** with a **Bluesky-communities** option held open
(unreleased at time of writing). Both are adapters behind `EngagementChannel` so the choice isn't baked
into the loop. `apps/player` is the live PWA; `packages/engagement/src/adapters/bluesky.ts` is a stub.

## Stack

- npm workspaces, Node ≥ 22, TypeScript strict.
- `services/orchestrator`: **Hono** (matches Antiphony — lean JSON service, no framework magic).
- `apps/player`, `apps/dm`: **Vite + React** (player is a PWA).
- Validation: **Zod** (matches Antiphony).
- Identity: **@atproto/api** (matches Antiphony's AT-Proto-first tooling).

## Conventions

- Shared types live in `@bardcast/domain` and are imported everywhere. Don't redefine them per app.
- Each lexicon JSON has a matching Zod schema in `@bardcast/domain`. Keep them in sync; the Zod schema
  is what runtime code validates against.
- Mark every unimplemented seam with `TODO(bardcast): ...` so they're greppable.
- The visual identity is **locked** — "The Tavern Table", `docs/brand.md`. Colors, fonts, and voice
  lines come from `@bardcast/brand` (tokens + assets); never hard-code a hex in an app. The ember
  accent marks the single next action on a screen — one per screen, always.
- This is a sibling of `../antiphony` (the engine) and `../universe-starter-kit` (the
  canonical home of the canon/records conventions this repo follows — extracted from
  `../supper_club_secrets`, the original design precedent and an example world). Read those,
  don't fork them.

## Verify

```bash
npm install && npm run typecheck
```
