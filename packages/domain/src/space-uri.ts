/**
 * The one place Bardcast knows how an atproto record URI is spelled.
 *
 * A record in a space is named today by
 * `at://{authority}/space/{spaceType}/{skey}/{author}/{collection}/{rkey}`.
 * That spelling may change before the Spaces public beta (December 2026) to
 * `at:space/{authority}/{spaceType}/{skey}/{author}/{collection}/{rkey}`
 * (the combined `at:public` / `at:space` URI proposal). Everything that
 * builds, parses or validates a URI that may name a space record goes through
 * this module, so a format change is a change to this file (and its tests).
 *
 * Bardcast does not mint space URIs itself: Antiphony mints them for the posts
 * it holds, and Bardcast only reads the space and author off them. Keep no
 * recording that must outlive a format change until the format is announced.
 */

/** Every form of record URI Bardcast accepts. Today only `at://`. */
const RECORD_URI_PREFIXES = ["at://"] as const;

/** Whether `s` is spelled like an atproto record URI (flat, or in a space). */
export function isRecordUri(s: string): boolean {
  return RECORD_URI_PREFIXES.some((p) => s.startsWith(p));
}

/** The parts of a space record URI. */
export interface SpaceRecordUriParts {
  /** The space's authority: a DID (Bardcast's today; a table's later). */
  authority: string;
  /** The space type, an NSID (`SpaceTypes`). */
  spaceType: string;
  /** The space key. */
  skey: string;
  /** The author segment: whose record it is. A DID. */
  author: string;
  collection: string;
  rkey: string;
}

/** Parse a space record URI, or null for a flat or malformed one. */
export function parseSpaceRecordUri(uri: string): SpaceRecordUriParts | null {
  if (!uri.startsWith("at://")) return null;
  const parts = uri.slice("at://".length).split("/");
  if (parts.length !== 7 || parts[1] !== "space") return null;
  const [authority, , spaceType, skey, author, collection, rkey] = parts as [string, string, string, string, string, string, string];
  if (!authority || !spaceType || !skey || !author || !collection || !rkey) return null;
  return { authority, spaceType, skey, author, collection, rkey };
}

/** Build a space record URI. Tests and fixtures use this; production URIs come from Antiphony. */
export function spaceRecordUri(p: SpaceRecordUriParts): string {
  return `at://${p.authority}/space/${p.spaceType}/${p.skey}/${p.author}/${p.collection}/${p.rkey}`;
}

/** A record's rkey: the last path segment, for a flat or a space URI alike. */
export function rkeyOfRecordUri(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}
