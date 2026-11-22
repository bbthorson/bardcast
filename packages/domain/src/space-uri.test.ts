import { describe, expect, it } from "vitest";
import { AtUri } from "./ids.js";
import { isRecordUri, parseSpaceRecordUri, parseSpaceRef, rkeyOfRecordUri, spaceRecordUri, spaceRefUri } from "./space-uri.js";

const PARTS = {
  authority: "did:web:bardcast.app",
  spaceType: "game.bardcast.space.campaign",
  skey: "campaign.thornwood",
  author: "did:plc:alice",
  collection: "dev.antiphony.audio.post",
  rkey: "3k2a",
};
const URI = "at://did:web:bardcast.app/space/game.bardcast.space.campaign/campaign.thornwood/did:plc:alice/dev.antiphony.audio.post/3k2a";

describe("space record URIs", () => {
  it("builds and parses the same URI", () => {
    expect(spaceRecordUri(PARTS)).toBe(URI);
    expect(parseSpaceRecordUri(URI)).toEqual(PARTS);
  });

  it("reads no space off a flat or malformed URI", () => {
    expect(parseSpaceRecordUri("at://did:web:bardcast.app/dev.antiphony.audio.post/3k2a")).toBeNull();
    expect(parseSpaceRecordUri("at://did:web:bardcast.app/space/game.bardcast.space.campaign/campaign.thornwood")).toBeNull();
    expect(parseSpaceRecordUri(`${URI}/extra`)).toBeNull();
    expect(parseSpaceRecordUri("https://example.com/space/a/b/c/d/e")).toBeNull();
  });

  it("takes the rkey off a flat or a space URI", () => {
    expect(rkeyOfRecordUri(URI)).toBe("3k2a");
    expect(rkeyOfRecordUri("at://did:plc:alice/game.bardcast.character.sheet/3k2b")).toBe("3k2b");
  });

  it("is what AtUri validates against", () => {
    expect(isRecordUri(URI)).toBe(true);
    expect(AtUri.safeParse(URI).success).toBe(true);
    expect(AtUri.safeParse("https://example.com").success).toBe(false);
  });

  it("refuses what the parser would accept loosely", () => {
    expect(isRecordUri("did:plc:alice")).toBe(false);
    expect(isRecordUri("alice.bsky.social")).toBe(false);
    expect(isRecordUri("at://did:plc:alice/game.bardcast.character.sheet/3k2b")).toBe(true);
    expect(isRecordUri("at://did:plc:alice/x/y/z")).toBe(true); // flat, as the parser takes it
    expect(isRecordUri("at://did:/x")).toBe(false);
  });

  it("still accepts the local placeholders stores already hold", () => {
    expect(isRecordUri("at://campaign.1a2b3c4d")).toBe(true);
    expect(isRecordUri("at://campaign.1a2b3c4d/game.bardcast.campaign.seat/did:plc:alice")).toBe(true);
    expect(isRecordUri("at://c/seat")).toBe(true);
  });

  it("refuses a space URI the parser doesn't take", () => {
    expect(isRecordUri(`${URI}/extra`)).toBe(false);
    expect(isRecordUri("at://campaign.1a2b/space/x/y")).toBe(false);
  });

  // Today's spelling, the one the Spaces alpha uses. If the beta adopts
  // `at:space/…`, the `@atproto/syntax` pin bump makes these fail: update them
  // with Antiphony's contract 0.11, not before (docs/spaces-beta-readiness.md).
  it("doesn't accept the candidate at:space/ spelling yet", () => {
    const candidate = URI.replace("at://", "at:space/").replace("/space/", "/");
    expect(isRecordUri(candidate)).toBe(false);
    expect(parseSpaceRecordUri(candidate)).toBeNull();
  });
});

describe("space refs", () => {
  const SPACE = "at://did:web:bardcast.app/space/game.bardcast.space.campaign/campaign.thornwood";

  it("builds and parses a space ref", () => {
    const ref = { authority: PARTS.authority, spaceType: PARTS.spaceType, skey: PARTS.skey };
    expect(spaceRefUri(ref)).toBe(SPACE);
    expect(parseSpaceRef(SPACE)).toEqual(ref);
  });

  it("refuses a record URI, a flat URI or junk", () => {
    expect(parseSpaceRef(URI)).toBeNull();
    expect(parseSpaceRef("at://did:plc:alice/game.bardcast.character.sheet/3k2b")).toBeNull();
    expect(parseSpaceRef("nonsense")).toBeNull();
  });
});
