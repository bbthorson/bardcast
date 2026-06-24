# CLAUDE.md — Bardcast

Orientation for an agent or contributor working in this repo. Read this before changing anything.

## What this is

Bardcast generates an ongoing **RPG actual-play podcast** from a group of friends. A Dungeon Master
prompts the players; players answer in recorded audio; those answers build each character (sheet +
behavioral model + voice clone). When a character has enough signal, Bardcast writes a narrative
**chapter** and renders it in the players' **cloned voices**, then suggests the DM new prompts.

## The three roles this product plays

1. **vox-pop-core consumer.** Audio prompts and asynchronous audio replies are NOT ours — they belong
   to [`vox-pop-core`](https://docs.voxpop.phonicfactory.com) (`/api/v1/*` Hono API). We reach it only
   through `packages/voxpop-client` behind the `VoxPopGateway` port. Do not reimplement call/response.
2. **World/narrative engine.** Campaign lore + character state → chapter. This is the new value.
3. **AT-Protocol identity layer.** Characters are keyed on the player's **DID** so a character is
   portable across campaigns. AT-Proto OAuth is OUR job — vox-pop-core deliberately keeps OAuth in its
   closed `apps/web` tier, not in core.

## Load-bearing principles (inherited from `supper_club_secrets/protocol/ARCHITECTURE.md`)

- **State drives the derived record layer, never the reverse.** Campaign/character state is the source
  of truth; AT-Proto records in `lexicons/` shapes are a *projection*. If state changes, records
  regenerate. Never edit a record to "fix" state.
- **DID is the durable identity key.** Local stable IDs (`char.*`, `campaign.*`) map to DIDs. Character
  sheets, behavior models, and voice references hang off the DID, not a campaign-local row.
- **Fantasy time vs. real time.** In-world dates (fantasy calendars) are a plain **string** field. Each
  record's `createdAt` carries a real ISO timestamp for ordering, so a timeline can be scrubbed. Never
  put a 5-digit fantasy year in `createdAt`.
- **NSID is a placeholder.** Root `game.bardcast.*` lives in one constant (`packages/domain/src/nsid.ts`).
  Swap before publishing.

## Architecture: ports & adapters

The orchestrator's `src/use-cases/*` express the loop in terms of **ports** (interfaces in
`src/ports/`). Every external capability is a port with a swappable adapter in `src/adapters/`. To add a
real capability, write an adapter — do not reach into a use-case and call a vendor SDK directly.

Ports: `VoxPopGateway`, `NarrativeWriter`, `VoiceCloner`, `AudioRenderer`, `IdentityProvider`,
`EngagementChannel`, `Store`. All current adapters are stubs marked `TODO(bardcast)`.

## The engagement seam (why it's a port)

The player surface is decided as **PWA-first** with a **Bluesky-communities** option held open
(unreleased at time of writing). Both are adapters behind `EngagementChannel` so the choice isn't baked
into the loop. `apps/player` is the live PWA; `packages/engagement/src/adapters/bluesky.ts` is a stub.

## Stack

- npm workspaces, Node ≥ 22, TypeScript strict.
- `services/orchestrator`: **Hono** (matches vox-pop-core — lean JSON service, no framework magic).
- `apps/player`, `apps/dm`: **Vite + React** (player is a PWA).
- Validation: **Zod** (matches vox-pop-core).
- Identity: **@atproto/api** (matches vox-pop-core's AT-Proto-first tooling).

## Conventions

- Shared types live in `@bardcast/domain` and are imported everywhere. Don't redefine them per app.
- Each lexicon JSON has a matching Zod schema in `@bardcast/domain`. Keep them in sync; the Zod schema
  is what runtime code validates against.
- Mark every unimplemented seam with `TODO(bardcast): ...` so they're greppable.
- This is a sibling of `../vox-pop-core` (the engine) and `../supper_club_secrets` (the design
  precedent and an example world). Read those, don't fork them.

## Verify

```bash
npm install && npm run typecheck
```
