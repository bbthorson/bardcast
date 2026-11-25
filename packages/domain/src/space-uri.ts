import { AtUri, SpaceRef, type DidString, type NsidString, type RecordKeyString } from "@atproto/syntax";

/**
 * The one place Bardcast reads or builds an atproto record URI.
 *
 * Bardcast doesn't spell URIs itself: everything here goes through
 * `@atproto/syntax` (`AtUri`, `SpaceRef`), pinned to the Spaces alpha
 * Antiphony runs. A record in a space is named by
 * `at:space/{authority}/{spaceType}/{skey}/{author}/{collection}/{rkey}`
 * (adopted in the 2026-11-24 Spaces alpha and Antiphony contract 0.11.0 /
 * `@antiphony/shared` 0.16.0).
 *
 * Bardcast does not mint space URIs itself: Antiphony mints them for the posts
 * it holds, and Bardcast only reads the space and author off them.
 */

function parse(s: string): AtUri | null {
  try {
    return new AtUri(s);
  } catch {
    return null;
  }
}

/**
 * Whether `s` is a record URI Bardcast accepts:
 *
 *  - a space URI, only as `@atproto/syntax` parses and prints it (so a format
 *    change follows the pin);
 *  - a flat URI that `@atproto/syntax` accepts;
 *  - or a flat local placeholder, `at://{local id}/…`, which stores already hold:
 *    `at://campaign.1a2b3c4d/…` names a campaign by its local id, and a local id
 *    whose last label starts with a digit isn't a valid handle. They never name
 *    a space record. TODO(bardcast): retire them when seats, actions and
 *    chapters are written to the campaign's space (docs/spaces-beta-readiness.md).
 */
export function isRecordUri(s: string): boolean {
  const u = parse(s);
  if (u?.isSpace) return parseSpaceRecordUri(s) !== null || parseSpaceRef(s) !== null;
  if (u?.toString() === s) return true;
  return isLocalPlaceholder(s);
}

const LOCAL_PLACEHOLDER = "at://";

function isLocalPlaceholder(s: string): boolean {
  if (!s.startsWith(LOCAL_PLACEHOLDER)) return false;
  const host = s.slice(LOCAL_PLACEHOLDER.length).split("/", 1)[0] ?? "";
  // A host that claims to be a DID must be one the parser accepts, and nothing
  // shaped like a space may get through as a placeholder.
  return host.length > 0 && !host.startsWith("did:") && !s.includes("/space/");
}

/** A space: its authority, type and key. */
export interface SpaceRefParts {
  /** The space's authority: a DID (Bardcast's today; a table's later). */
  authority: string;
  /** The space type, an NSID (`SpaceTypes`). */
  spaceType: string;
  /** The space key. */
  skey: string;
}

/** The parts of a space record URI. */
export interface SpaceRecordUriParts extends SpaceRefParts {
  /** The author segment: whose record it is. A DID. */
  author: string;
  collection: string;
  rkey: string;
}

/** Parse a space record URI, or null for a flat, space-only or malformed one. */
export function parseSpaceRecordUri(uri: string): SpaceRecordUriParts | null {
  const u = parse(uri);
  if (!u?.isSpace) return null;
  const { spaceDid, spaceType, skey, authorDid, collection, rkey } = u;
  if (!spaceDid || !spaceType || !skey || !authorDid || !collection || !rkey) return null;
  const parts = { authority: spaceDid, spaceType, skey, author: authorDid, collection, rkey };
  // The parser ignores trailing segments; rebuilding the URI refuses them.
  try {
    return spaceRecordUri(parts) === uri ? parts : null;
  } catch {
    return null;
  }
}

/**
 * Parse a reference to a space itself (`com.atproto.managedspace.checkAccess`'s
 * `space`, a `space-ref`), or null for anything else, including a record URI.
 */
export function parseSpaceRef(uri: string): SpaceRefParts | null {
  try {
    const ref = SpaceRef.parse(uri);
    return { authority: ref.spaceDid, spaceType: ref.spaceType, skey: ref.skey };
  } catch {
    return null;
  }
}

/** Build a space record URI. Tests and fixtures use this; production URIs come from Antiphony. */
export function spaceRecordUri(p: SpaceRecordUriParts): string {
  return new SpaceRef(p.authority as DidString, p.spaceType as NsidString, p.skey as RecordKeyString)
    .recordUri(p.author as DidString, p.collection as NsidString, p.rkey as RecordKeyString)
    .toString();
}

/** Build a reference to a space itself. */
export function spaceRefUri(p: SpaceRefParts): string {
  return new SpaceRef(p.authority as DidString, p.spaceType as NsidString, p.skey as RecordKeyString).toString();
}

/** A record's rkey, for a flat or a space URI alike, or "" if it names none. */
export function rkeyOfRecordUri(uri: string): string {
  return parse(uri)?.rkey ?? "";
}
