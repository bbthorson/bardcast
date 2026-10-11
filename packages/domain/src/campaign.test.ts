import { describe, expect, it } from "vitest";
import { Prompt } from "./campaign.js";

describe("Prompt", () => {
  const draft = { campaign: "at://campaign.thornwood", title: "A scar you carry", createdAt: "2026-10-11T00:00:00Z" };
  const uri = "at://did:web:bardcast.app/space/game.bardcast.space.campaign/campaign.thornwood/did:web:bardcast.app/dev.antiphony.audio.post/p1";

  it("is valid unpublished, or published with both its uri and CID", () => {
    expect(Prompt.safeParse(draft).success).toBe(true);
    expect(Prompt.safeParse({ ...draft, antiphonyPromptUri: uri, antiphonyPromptCid: "bafyprompt" }).success).toBe(true);
  });

  it("refuses a published uri without its CID, since no reply could name it", () => {
    expect(Prompt.safeParse({ ...draft, antiphonyPromptUri: uri }).success).toBe(false);
    expect(Prompt.safeParse({ ...draft, antiphonyPromptCid: "bafyprompt" }).success).toBe(false);
    expect(Prompt.safeParse({ ...draft, antiphonyPromptUri: uri, antiphonyPromptCid: "" }).success).toBe(false);
  });
});
