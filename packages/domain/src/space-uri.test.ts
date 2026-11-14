import { describe, expect, it } from "vitest";
import { AtUri } from "./ids.js";
import { isRecordUri, parseSpaceRecordUri, rkeyOfRecordUri, spaceRecordUri } from "./space-uri.js";

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
});
