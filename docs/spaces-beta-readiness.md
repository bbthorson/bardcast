# Spaces public beta readiness

The Spaces public beta starts on **2026-12-01**. That day the reference PDS and Bluesky's PDS
fleet switch to the November 12 protocol, and earlier alphas stop working with them. This page
records what Bardcast had to do for it. It was first audited on 2026-11-14 and redone on
2026-11-22, against Antiphony contract `0.10.9` / `@antiphony/shared` `0.14.1` and the
`0.0.0-spaces-alpha-20261117141222` packages. Sources: the
[announcement](https://atproto.com/blog/getting-ready-for-the-spaces-public-beta), the protocol's
[November 12 migration prompt](https://github.com/bluesky-social/atproto/blob/permissioned-data/alpha-migrations/prompt-11-12-26.md),
Antiphony's `specs/spaces-beta-readiness.md` (its name table, and plan step 5 for tenants), and
the reference PDS at the alpha pin (`space-policy/manager.js`, for how a host calls
`checkAccess`).

## Who does what

- **Antiphony holds Bardcast's audio.** Bardcast reaches spaces through Antiphony's REST API
  (`packages/antiphony-client`): it puts spaces (`PUT /api/v1/spaces/{type}/{skey}`, with
  `managing-app` read and write policies), uploads audio into them, and posts prompts and
  replies with `spaceAuthor`. Antiphony mints the space URIs. The names `readPolicy`,
  `writePolicy` and `managing-app` are Antiphony's own and never reach a PDS, so those calls
  are unchanged.
- **Bardcast is the managing app of its spaces.** It answers
  `com.atproto.managedspace.checkAccess` for a space host (below).
- **Sign-in** (`@bbthorson/atproto-cf-auth`) asks for the scopes in
  `services/orchestrator/src/adapters/atproto/scopes.ts`. It asks for the space scopes only on a
  PDS whose `community.lexicon.service.describe` lists `com.atproto.space.getDelegationToken`
  (`pdsServesMethod`), a method the beta keeps.
- **Bardcast doesn't** create spaces on a PDS or group host, add or remove members, mint
  delegation tokens, register remote posts, or read space records itself.

## Checklist (2026-11-22)

| Item | Result |
| :--- | :--- |
| `simplespace.checkUserAccess` → `managedspace.checkAccess` | **Built.** Bardcast never served the old method. It now serves `GET /xrpc/com.atproto.managedspace.checkAccess?space=&repo=&clientId=`, which answers `{ read, write }` (below). |
| `putMember` / `removeMember` → `memberspace.putMembers` / `removeMembers` | Not used. Bardcast manages no member lists. |
| Space type declarations: `name` → `title` | None exist. There's no space type lexicon in `lexicons/`, and none can be published under the placeholder `game.bardcast`. |
| Named OAuth scopes: `type` → `spaceType` | No named scope existed: the members scope was positional. **Scopes are now built with `@atproto/oauth-scopes`** (`RepoPermission`, `RpcPermission`, `SpacePermission`), and `scopes.test.ts` checks each one parses and grants exactly what Bardcast needs. The library writes the members scope in canonical form, `space:fyi.opensocial.members?authority=*&collection=fyi.opensocial.acceptance`, which drops the defaults (`skey=*`, the four actions). It grants the same as before, but the string differs, so a player signing in on a spaces PDS is asked to consent again. The library refuses `space?type=…` outright. |
| Policies on creating spaces | Bardcast sends no policy to a PDS. Its Antiphony spaces keep `readPolicy` / `writePolicy` (Antiphony's API). When Bardcast creates a space on a group host, use `com.atproto.managedspace.policy` with `managingApp: managingAppRef(BARDCAST_DID)` (`{did}#bardcast_spaces`, `packages/domain/src/spaces.ts`). |
| Error names (`InvalidSpaceMac`, `AccountNotAuthorized`, `NotAuthorized`) | None of the old names appear. `checkAccess` answers `NotAuthorized` when the caller isn't the space's authority. |
| `@atproto/*` packages | **Added, pinned exactly to `0.0.0-spaces-alpha-20261117141222`:** `@atproto/syntax` (domain, orchestrator), `@atproto/oauth-scopes`, `@atproto/crypto`, `@atproto-labs/did-resolver` (orchestrator). Bardcast never used `AtUri.makeSpace` or `createSpaceToken`. `space-uri.ts` builds with `SpaceRef#recordUri` now. The stable ones Bardcast already had stay on their exact stable pins, because they don't touch spaces: `@atproto/common-web` (TIDs), `@atproto/lex-cbor` (`cidForLex`, whose output is sealed into sheet versions), `@atproto/oauth-client` (tests). So do the transitive ones under `atproto-cf-auth` and `pinakes`. No Dependabot or Renovate config exists to guard the alpha pins. |
| Space URIs | **Parsing moved onto `@atproto/syntax`**, and the one parse that a response field could replace now uses the caller's space (below). |
| Remote posts on a delegation, `#atproto_kem` fallback | Not used. Bardcast registers no remote posts (below). |
| Alpha infrastructure | Nothing in the repo points at an alpha PDS or `spaces-alpha.host.bsky.network`. Bardcast has no tables as groups yet, so no group lives on any host. Production D1 wasn't inspected from here. |

## Bardcast as managing app: `checkAccess`

A space whose policy is `com.atproto.managedspace.policy` names its managing app as
`managingApp`, a `did#serviceId`. Its host resolves that service's endpoint from the DID document
and calls `GET {endpoint}/xrpc/com.atproto.managedspace.checkAccess`. The call carries service
auth signed with the space authority's `#atproto` key (`iss` = the space's DID), with
`aud` = the `managingApp` string and `lxm` = `com.atproto.managedspace.checkAccess`.

- **Route:** `services/orchestrator/src/app.ts`. **Decision:** `use-cases/space-access.ts`. **Service auth:**
  `adapters/atproto/service-auth.ts` behind the `ServiceAuthVerifier` port. It follows
  `@atproto/xrpc-server`'s `verifyJwt` (which pulls in an Express server, so it isn't used), and
  also refuses a token with no `exp`.
- **Answers:** a campaign's DM and party may read and write its space, and a player may read and write
  their own. Without `repo` (public reads), and for a space Bardcast isn't the authority of or
  doesn't know, the answer is `{ read: false, write: false }`. `clientId` is not checked.
- **Only the space's authority may ask** (`iss` must equal the space's DID): 403 `NotAuthorized`.
- **A failure is never a denial.** Bad service auth answers 401. A store or DID-resolution
  failure answers 500 `InternalServerError`. The host reports either as `UpstreamFailure`, and so
  does a timeout (the reference PDS waits 10 seconds). Only a 200 is an answer.
- **Off until configured.** With no `BARDCAST_DID` (Worker var), the method answers 501
  `MethodNotImplemented`. `wrangler.jsonc` now routes `/xrpc/*` to the Worker.
- **Nobody calls it yet.** Antiphony hosts Bardcast's spaces and doesn't call back for a tenant's
  own reads (its `specs/spaces.md`: "Reads through the tenant need no callback"). No space on a
  PDS names Bardcast as `managingApp`. It's ready for the first one.

To turn it on, Bardcast's DID document must publish the service. That document lives wherever
Antiphony's tenant registration pinned it, not in this repo:

```json
{ "id": "#bardcast_spaces", "type": "BardcastManagingApp", "serviceEndpoint": "https://{Bardcast's origin}" }
```

Then set `BARDCAST_DID` on the Worker. The service's `type` isn't read by the reference PDS,
which matches on `id` alone.

## Space URIs

Today: `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}`. Possibly from
the beta: `at:space/{spaceDid}/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}`, in which case
Antiphony switches outright in contract 0.11, with no overlap. As of 2026-11-21 it's undecided,
and the answer is expected with the beta. **Keep no recording until it's announced; revisit
around 2026-12-05.**

Every read and build of a record URI is in `packages/domain/src/space-uri.ts`, which now goes
through `@atproto/syntax` (`AtUri`, `SpaceRef`) instead of splitting strings. A format change
arrives with the pin bump, and the tests that spell today's form out fail until they're updated
(one test asserts the candidate form is refused today). Where each use stands:

| Where | What it reads | Now |
| :--- | :--- | :--- |
| `antiphony-client` `createReply` | The prompt's space, to upload the reply's audio there | **Changed:** the caller names the space (`campaignSpace(campaignId)` in the reply route, `playerSpace(did)` in creation). `spaceOfUri` is gone. |
| `antiphony-client` `assertAuthorSegment` (`SPACE_AUTHOR_IGNORED`) | The author segment of a post Bardcast just made | Still read off the URI, through `@atproto/syntax`. **Can't change:** Antiphony's post view has `authorDid` (who recorded it) but no field for the author segment (contract 0.10.9). If the format changes before Bardcast bumps the pin, this throws for every member's post. That's loud, and acceptable while nothing is kept. |
| `antiphony-client` `postIdFromUri` (`getPost`, `listReplies`, `playbackUrl`) | The rkey, which is the Antiphony post id | Through `@atproto/syntax`. **Not changed:** the rkey is the last segment in both forms, and stored prompts keep only the URI, not the post id. |
| `domain` `AtUri` schema (`isRecordUri`), and the reply route's `promptUri` check | Whether a string is a record URI | A space URI must parse with `@atproto/syntax`; a flat one must too, or be a local placeholder (below). Two test fixtures that weren't valid space URIs (a non-NSID space type, a missing skey) were corrected. |
| Store: `prompts` and creation rows (JSON), the reply route's `antiphonyPromptUri === promptUri` lookup, the ingest dedupe | Antiphony URIs held as opaque strings and compared for equality | **Not changed.** Nothing parses them, and an equality check doesn't care about spelling as long as nothing old is kept. |
| `sheet_versions.uri`, `campaign_actions.uri` (`TEXT PRIMARY KEY`); `Campaign.party`; `fromSeat`; chapter and action `campaign` fields | Flat placeholders spelled by hand: `` `at://${repo}/${collection}/${rkey}` ``, `` `at://${did}` ``, `` `at://${campaignId}/…` `` | **Not changed, and can't move to `@atproto/syntax` as they are.** A campaign id like `campaign.1a2b3c4d` isn't a valid handle (its last label starts with a digit), so the library refuses them. `isRecordUri` still accepts them as local placeholders, never for anything shaped like a space. They become real URIs when seats, actions and chapters are written to the campaign's space. Build them with `spaceRecordUri` then. |

## Remote posts (step 4 of the migration brief)

Bardcast doesn't register remote posts: nothing calls `PUT /api/v1/remote-posts`, mints
`com.atproto.space.getDelegationToken`, or uploads with `remoteSpace`. Every Bardcast recording
is a post Antiphony hosts, so there's no fallback to add yet. When members' records move to
their own PDSes (below), registration needs both paths:

1. Mint `getDelegationToken` from a member's session right before `PUT /api/v1/remote-posts` with
   `uri`, `cid` and `delegationToken`. The token is single use and lasts 60 seconds.
2. On `422 REMOTE_RECORD_INVALID` naming `#atproto_kem` (a writer whose PDS isn't upgraded),
   push instead: `POST /api/v1/audio/upload` with `remoteSpace` (the space ref), then
   `PUT /api/v1/remote-posts` with `uri`, `cid` and `record`. A pushed record's deletion is
   Bardcast's to send (`deletionCheck: "tenant"`).

It also needs space read scopes for `game.bardcast.space.*`, which wait on the real NSID root.

## `opensocial.fyi` (checked read-only, 2026-11-22)

Unauthenticated `GET`s only. A known procedure answers "Incorrect HTTP method"; an unknown method
answers `501 MethodNotImplemented`. Nothing was written.

| Method | Answer | |
| :--- | :--- | :--- |
| `com.atproto.memberspace.putMembers`, `removeMembers` | 400, expects POST | **New names served** |
| `com.atproto.space.authorizeSpaceSync`, `space.createSpace` | 400, expects POST | **New names served** |
| `com.atproto.space.getDelegationToken`, `space.getSpace` | 400, missing `space` | Served |
| `com.atproto.memberspace.putMember`, `removeMember` | 501 | **Old names gone** |
| `com.atproto.space.getSpaceCredential`, `simplespace.createSpace` | 501 | **Old names gone** |
| `fyi.opensocial.createSpace`, `provisionGroup` | 400, expects POST | Served |

So the host has moved to the November 12 protocol since 2026-11-14. Its `describeServer` still
reports `spacesAlpha: true`. Whether `fyi.opensocial.createSpace` takes the new policy objects
can't be told without creating a space, which wasn't done.

## Where Bardcast assumes a record lives with the space's authority

From 2026-12-01, members' records can move to their own PDSes as those PDSes gain Spaces
support (Antiphony's `audio-service-and-groups.md` step 7). Not built. These are the places
that assume a space record is hosted with the authority (Antiphony, under Bardcast's DID), for
planning that move:

- **`antiphony-client` `createPrompt` / `createReply`.** Every prompt and reply, a member's included, is
  a post Antiphony hosts (`POST /api/v1/posts` with `spaceAuthor: "actor"`). A member's record
  on their own PDS is written there through their session, then registered as a remote post (above).
- **`listReplies` and `getPost`** (`antiphony-gateway.ts`: `listReplies`, `playbackUrl`, and through them
  `ingest-replies.ts` and `creation.ts` `transcriptOf`). They read hosted posts by post id. Remote
  replies are read with `getRemoteThread` / `GET /api/v1/remote-posts`, keyed by URI.
- **`postIdFromUri`.** It takes the rkey to be Antiphony's post id, which holds only for hosted posts.
- **`assertAuthorSegment`.** It assumes Antiphony seals the URI, which it won't for a record written
  on the member's PDS.
- **`ensureSpace` (`PUT /api/v1/spaces`).** It assumes the space is Antiphony's under Bardcast's DID. A
  table's space would be created on the group host with `managedspace.policy`.
- **`checkSpaceAccess`.** It answers only for spaces under Bardcast's DID (`TODO(bardcast)` for
  table DIDs).
- **`sheets.ts`, `actions.ts`.** Their seat and action URIs are flat placeholders under the campaign id.
  They become records in the table's repo, in the campaign's space.
- **Scopes.** There are no space scopes for `game.bardcast.space.*` yet, so Bardcast can't write to a
  player's repo in a space.

## Still open

- **Join consent.** The join flow (`apps/web/src/screens/JoinInvite.tsx`) doesn't yet say that
  chapters stay with the table when a player leaves. Still open in `ROADMAP.md`.
