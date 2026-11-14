# Spaces public beta readiness

The Spaces public beta starts on **2026-12-01**. That day the reference PDS and Bluesky's PDS
fleet switch to the November 12 alpha protocol, and earlier alphas stop working with them. This
page records what Bardcast had to do for it, as audited on 2026-11-14. Sources: the
[announcement](https://atproto.com/blog/getting-ready-for-the-spaces-public-beta), the protocol's
[November 12 migration prompt](https://github.com/bluesky-social/atproto/blob/permissioned-data/alpha-migrations/prompt-11-12-26.md),
and Antiphony's `specs/spaces-beta-readiness.md` (Antiphony PR #252).

## What Bardcast does itself, and what others do for it

- **Antiphony does the protocol work.** Bardcast reaches spaces only through Antiphony's REST API
  (`packages/antiphony-client`, contract `0.10.9`, unchanged): it puts spaces
  (`PUT /api/v1/spaces/{type}/{skey}`, with `managing-app` read and write policies), uploads audio
  into them, and posts prompts and replies with `spaceAuthor`. Antiphony holds the records, mints
  the space URIs and moved itself onto the beta protocol. The names `readPolicy`, `writePolicy`
  and `managing-app` are Antiphony's and never reach another host.
- **Sign-in** (`@bbthorson/atproto-cf-auth`) asks for the scopes in
  `services/orchestrator/src/adapters/atproto/scopes.ts`. It detects a PDS that serves spaces from
  `describeServer`'s method list, looking for `com.atproto.space.getDelegationToken`, which the
  beta keeps.
- **Bardcast doesn't** create spaces on a PDS or group host, serve `checkAccess` /
  `checkUserAccess`, mint delegation tokens, register remote posts, read space records itself, or
  publish space type lexicons.

## Checklist

| § | Applies? | Result |
| :--- | :--- | :--- |
| 1. Dependencies | No | No `@atproto/*` or `@atproto-labs/*` alpha package anywhere in the tree. The stable ones (`oauth-client`, `common-web`, `lex-cbor`, and transitive deps of `atproto-cf-auth`) don't touch spaces. No Dependabot or Renovate config to guard. |
| 2. Scopes, space type lexicons | Checked, no change | Every space scope is positional, so the `type` → `spaceType` rename doesn't touch it. No space type lexicon is published (see below). |
| 3. Creating spaces | Antiphony only | Unchanged. Bardcast asks for `rpc:fyi.opensocial.createSpace?aud=*` but never calls it. |
| 4. Managing app | No | Bardcast serves no `checkUserAccess`. |
| 5. Delegation tokens, reading spaces | No | — |
| 6. Antiphony calls | Posts in Antiphony spaces only | `spaceAuthor` is right everywhere (`docs/integration-with-core.md`). No remote posts or recheck webhooks. |
| 7. Space URIs | Yes | Centralized in `packages/domain/src/space-uri.ts` (below). |
| 8. Alpha infrastructure | No | No `pds-spaces-alpha` image, no accounts on `spaces-alpha.host.bsky.network`. |

### Scopes

Unchanged, before and after:

```
atproto repo:game.bardcast.character.profile repo:game.bardcast.character.sheet repo:game.bardcast.voice.profile
```

and, only on a PDS that serves spaces:

```
rpc:fyi.opensocial.provisionGroup?aud=* rpc:fyi.opensocial.createSpace?aud=*
rpc:fyi.opensocial.requestJoin?aud=* rpc:fyi.opensocial.leaveGroup?aud=*
space:fyi.opensocial.members?authority=*&skey=*&collection=fyi.opensocial.acceptance&action=read&action=create&action=update&action=delete
```

When the campaign and player space scopes are added (the `TODO(bardcast)` in `scopes.ts`, waiting
on the real NSID root), use the positional form or name the parameter `spaceType`, and publish the
space type lexicons with `title` / `title:lang`, not `name`. A session that will read other
members' records needs a `read` grant, not `read_self`.

### Space URIs (§7)

Antiphony mints every space URI Bardcast holds. Bardcast parses, validates and stores them; it
builds them only in tests. The space URI format may change before the beta, from
`at://{authority}/space/{type}/{skey}/{author}/{collection}/{rkey}` to
`at:space/{authority}/{type}/{skey}/{author}/{collection}/{rkey}`
([proposal](https://discourse.atmosphere.community/t/combined-uri-syntax-proposal-at-public-and-at-space/1393)).
**Keep no recording until the format is announced.**

All format knowledge now lives in `packages/domain/src/space-uri.ts`: `isRecordUri`,
`parseSpaceRecordUri`, `spaceRecordUri` and `rkeyOfRecordUri`. What goes through it:

- `packages/antiphony-client/src/types.ts`: `spaceOfUri` (a reply's audio goes to its prompt's
  space) and `authorSegmentOfUri` (the `SPACE_AUTHOR_IGNORED` check).
- `packages/antiphony-client/src/client.ts`: `postIdFromUri`.
- `packages/domain/src/ids.ts`: the `AtUri` schema, and with it `StrongRef` and every record
  field that holds an Antiphony URI (`Prompt.antiphonyPromptUri`, `sourceReplies`, a creation
  turn's prompt and reply).
- `services/orchestrator/src/app.ts`: the `antiphonyPromptUri` body field and the reply route's
  `promptUri` check, which used to test `startsWith("at://")` themselves.
- `ingest-replies.ts`, `creation.ts`: the `` `at://${string}` `` types are now `AtUri`.

Stored as text, with no format check in SQL: the store's prompt and creation rows
(`adapters/d1`, `adapters/postgres`) hold Antiphony URIs inside JSON, and `sheet_versions.uri` and
`campaign_actions.uri` are `TEXT PRIMARY KEY` columns (flat URIs today). They are opaque there,
so a format change needs no schema migration, only that nothing kept was written in the old
format.

Not space URIs, left alone: the flat placeholders `` `at://${campaignId}` ``,
`` `at://${did}` `` and `` `at://${repo}/${collection}/${rkey}` `` in `use-cases/` and the stores.
They name local ids and players' own repos. The seat and action URIs (`sheets.ts`, `actions.ts`)
will become space URIs when those records are written to the campaign's space; build them with
`spaceRecordUri` then. Test fixtures that spell out space URIs (`*.test.ts`) would need updating
with a format change too.

## Blocked on others

- **The group host.** On 2026-11-14 `opensocial.fyi` still ran the pre-November-12 alpha:
  `describeServer` reported `spacesAlpha: true`, it served `com.atproto.space.getSpaceCredential`
  and `com.atproto.memberspace.putMember`, and answered `MethodNotImplemented` for
  `authorizeSpaceSync`, `putMembers` and `managedspace.checkAccess`. Whether
  `fyi.opensocial.createSpace` and its siblings change for the beta isn't published. Bardcast
  calls none of them yet, so nothing breaks today, but tables as groups (`ROADMAP.md`) wait on
  the host's upgrade. Check again before building on it.
- **Players' PDSes.** Antiphony reads a member's record against the writer's `#atproto_kem` key,
  which only upgraded PDSes publish. Bardcast doesn't register remote posts today. When it does,
  `422 REMOTE_RECORD_INVALID` naming `#atproto_kem` must fall back to the pushed path
  (`POST /api/v1/audio/upload` with `remoteSpace`, then `PUT /api/v1/remote-posts` with the
  record), not fail.

## Not now, but noted

- **Member records on players' own PDSes** (step 7 of Antiphony's `audio-service-and-groups.md`)
  becomes possible from 2026-12-01. Blockers: no space scopes for Bardcast's own space types yet
  (they need the real NSID root and published lexicons); campaigns are still spaces under
  Bardcast's DID, not a table's; and "the URI stays the same when hosting moves" holds only once
  the URI format settles.
- **Join consent.** The join flow (`apps/web/src/screens/JoinInvite.tsx`) does not yet say that
  chapters stay with the table when a player leaves. Its only line on leaving, "what happens at
  this table stays here until they leave", is about the seat and can be read as the opposite.
  Still open in `ROADMAP.md`.
