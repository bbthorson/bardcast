import { describe, expect, it } from "vitest";
import {
  ArcConcept,
  CampaignConcept,
  CharacterSlotConcept,
  Concept,
  NpcConcept,
  QuestBeatConcept,
} from "./canon.js";

describe("canon profile", () => {
  it("accepts a Campaign concept with a party_size range", () => {
    const c = CampaignConcept.parse({
      type: "Campaign",
      id: "campaign.jttw",
      title: "Journey to the West",
      party_size: { min: 3, ideal: 4, max: 5 },
    });
    expect(c.party_size?.ideal).toBe(4);
    expect(c.tags).toEqual([]); // defaulted
  });

  it("normalizes a scalar role to a list", () => {
    const n = NpcConcept.parse({ type: "NPC", id: "npc.guanyin", title: "Guanyin", role: "donor" });
    expect(n.role).toEqual(["donor"]);
  });

  it("accepts a dual role as a list (the JTTW-surfaced delta)", () => {
    const n = NpcConcept.parse({
      type: "NPC",
      id: "npc.tripitaka",
      title: "Tripitaka",
      role: ["dispatcher", "sought"],
    });
    expect(n.role).toEqual(["dispatcher", "sought"]);
  });

  it("defaults a CharacterSlot's role to hero and keeps drives", () => {
    const s = CharacterSlotConcept.parse({
      type: "CharacterSlot",
      id: "slot.unruly-adept",
      title: "The Unruly Adept",
      drives: ["pride", "freedom"],
    });
    expect(s.role).toEqual(["hero"]);
    expect(s.drives).toContain("pride");
  });

  it("accepts a node-based Arc and a beat with a resolution mode", () => {
    const a = ArcConcept.parse({
      type: "Arc",
      id: "arc.tribulations",
      title: "The Tribulations",
      sequence: "node-based",
      episodes: ["beat.jttw.t1-demon-of-the-ridge"],
    });
    expect(a.sequence).toBe("node-based");

    const b = QuestBeatConcept.parse({
      type: "QuestBeat",
      id: "beat.jttw.t3-the-borrowed-beast",
      title: "The Borrowed Beast",
      arc: "arc.tribulations",
      resolution: { mode: "celestial" },
      establishes: [],
    });
    expect(b.resolution?.mode).toBe("celestial");
    expect(b.leads_to).toEqual([]); // defaulted; node-based arcs need none
  });

  it("rejects a malformed concept id", () => {
    expect(() => NpcConcept.parse({ type: "NPC", id: "NPC.Guanyin", title: "x" })).toThrow();
  });

  it("rejects an unknown resolution mode", () => {
    expect(() =>
      QuestBeatConcept.parse({
        type: "QuestBeat",
        id: "beat.x.1",
        title: "x",
        resolution: { mode: "interpretive-dance" },
      }),
    ).toThrow();
  });

  it("discriminates concepts by type", () => {
    const parsed = Concept.parse({
      type: "Item",
      id: "item.golden-fillet",
      title: "The Golden Fillet",
      owner: "npc.tripitaka",
    });
    expect(parsed.type).toBe("Item");
  });
});
