import { describe, expect, it } from "vitest";
import { backgrounds, species } from "@bardcast/srd";
import {
  applyBackgroundIncreases,
  attributeOptions,
  chooseQuestion,
  CREATION_ATTRIBUTES,
  isPlayerQuote,
  isStandardArray,
  MAX_TURNS,
  nextStep,
  placeStandardArray,
  REQUIRED_ATTRIBUTES,
  settles,
  type Creation,
  type CreationTurn,
} from "./creation.js";
import { SRD_CLASS_INDEXES } from "./sheet.js";
import { PERSONALITY_TRAITS } from "./traits.js";

const T = "2026-10-28T00:00:00Z";
const PROMPT = { uri: "at://did:web:bardcast/space/p/did:plc:alice/dev.antiphony.audio.post/1", cid: "bafyprompt" };

function turn(extra: Partial<CreationTurn> = {}): CreationTurn {
  return {
    kind: "ask",
    question: "?",
    prompt: PROMPT,
    askedAt: T,
    reply: { transcript: "an answer", at: T },
    reading: {},
    ...extra,
  };
}

function creation(turns: CreationTurn[], settled: Creation["settled"] = {}): Creation {
  return { player: "did:plc:alice", status: "talking", turns, settled, name: {}, createdAt: T, updatedAt: T };
}

const settledAll = (...attrs: string[]): Creation["settled"] =>
  Object.fromEntries(attrs.map((a) => [a, { value: "x", by: "clef" as const, at: T }]));

describe("what can be settled", () => {
  it("lists every personality axis, in traits.ts's order", () => {
    expect(CREATION_ATTRIBUTES.slice(REQUIRED_ATTRIBUTES.length)).toEqual(Object.keys(PERSONALITY_TRAITS));
  });

  it("offers the SRD's classes, species and backgrounds", () => {
    expect(Object.keys(attributeOptions("class"))).toEqual([...SRD_CLASS_INDEXES]);
    expect(Object.keys(attributeOptions("species"))).toEqual(species.map((s) => s.index));
    expect(Object.keys(attributeOptions("background"))).toEqual(backgrounds.map((b) => b.index));
  });
});

describe("settling an attribute", () => {
  it("needs a clear leader", () => {
    expect(settles({ paladin: 0.71, ranger: 0.14, unclear: 0.15 })).toEqual({ value: "paladin", confidence: 0.71 });
    expect(settles({ paladin: 0.6, ranger: 0.2 })).toBeNull(); // below SETTLE_AT
    expect(settles({ paladin: 0.66, ranger: 0.4 })).toBeNull(); // not far enough ahead
  });

  it("never settles on unclear", () => {
    expect(settles({ unclear: 0.9, bold: 0.1 })).toBeNull();
  });
});

describe("what the narrator asks next", () => {
  it("opens with the big question, then asks the name", () => {
    expect(nextStep(creation([]))).toEqual({ kind: "opener" });
    expect(nextStep(creation([turn({ kind: "opener" })]))).toEqual({ kind: "name" });
  });

  it("waits for an answer, and for it to be read", () => {
    expect(nextStep(creation([turn({ kind: "opener", reply: undefined })]))).toEqual({ kind: "wait" });
    expect(nextStep(creation([turn({ kind: "opener", reading: undefined })]))).toEqual({ kind: "wait" });
  });

  it("moves on when the player taps a pick or types the name instead of answering", () => {
    const unanswered = { reply: undefined, reading: undefined };
    const picked = creation(
      [turn({ kind: "opener" }), turn({ kind: "name" }), turn({ kind: "choose", attribute: "class", ...unanswered })],
      settledAll("class"),
    );
    expect(nextStep(picked)).toMatchObject({ kind: "ask" });
    const named = { ...creation([turn({ kind: "opener" }), turn({ kind: "name", ...unanswered })]), name: { confirmed: "Wren" } };
    expect(nextStep(named)).toMatchObject({ kind: "ask" });
  });

  it("goes to the least-settled required attribute, asking about its top two", () => {
    const step = nextStep(
      creation([
        turn({
          kind: "opener",
          reading: {
            class: { ranger: 0.38, paladin: 0.34, rogue: 0.17 },
            species: { dwarf: 0.5, elf: 0.2 },
            background: { soldier: 0.55, sage: 0.1 },
          },
        }),
        turn({ kind: "name" }),
      ]),
    );
    expect(step).toEqual({ kind: "ask", attribute: "class", candidates: ["ranger", "paladin"] });
  });

  it("stays on an attribute until it's settled, then the player picks", () => {
    const reading = { class: { ranger: 0.4, paladin: 0.35 } };
    const asks = (n: number) => Array.from({ length: n }, () => turn({ attribute: "class", reading }));
    const base = [turn({ kind: "opener" }), turn({ kind: "name" })];
    expect(nextStep(creation([...base, ...asks(MAX_TURNS - 1)]))).toMatchObject({ kind: "ask", attribute: "class" });
    expect(nextStep(creation([...base, ...asks(MAX_TURNS)]))).toEqual({
      kind: "choose",
      attribute: "class",
      candidates: ["ranger", "paladin"],
    });
    const asked = [...base, ...asks(MAX_TURNS), turn({ kind: "choose", attribute: "class", reading })];
    expect(nextStep(creation(asked))).toMatchObject({ kind: "pick", attribute: "class" });
  });

  it("moves on once an attribute is settled", () => {
    const step = nextStep(
      creation([turn({ kind: "opener" }), turn({ kind: "name" }), turn({ attribute: "class" })], settledAll("class")),
    );
    expect(step).toMatchObject({ kind: "ask" });
    expect(["species", "background"]).toContain((step as { attribute: string }).attribute);
  });

  it("asks about personality only until a few traits are settled, closest first", () => {
    const turns = [
      turn({ kind: "opener", reading: { approach: { cunning: 0.6, forthright: 0.2 }, speech: { wry: 0.3, terse: 0.25 } } }),
      turn({ kind: "name" }),
    ];
    expect(nextStep(creation(turns, settledAll(...REQUIRED_ATTRIBUTES)))).toEqual({
      kind: "ask",
      attribute: "approach",
      candidates: ["cunning", "forthright"],
    });
    expect(nextStep(creation(turns, settledAll(...REQUIRED_ATTRIBUTES, "temperament", "morality", "speech")))).toEqual({
      kind: "done",
    });
  });

  it("names the two to pick between", () => {
    expect(chooseQuestion("class", ["paladin", "ranger"])).toBe("Sounds like a paladin, or maybe a ranger. Which is it?");
    expect(chooseQuestion("species", ["elf", "orc"])).toBe("Sounds like an elf, or maybe an orc. Which is it?");
  });
});

describe("the card", () => {
  it("quotes only the player's own words", () => {
    const c = creation([turn({ reply: { transcript: "Judged. Out loud, in front of everyone.", at: T } })]);
    expect(isPlayerQuote(c, "out loud, in front of everyone")).toBe(true);
    expect(isPlayerQuote(c, "I'll have my vengeance")).toBe(false);
  });
});

describe("ability scores", () => {
  it("suggests the standard array in order of how much the character leans on each", () => {
    const placed = placeStandardArray({ strength: 3.5, charisma: 3, constitution: 2, wisdom: 1.5, dexterity: 1 });
    expect(placed).toEqual({ strength: 15, charisma: 14, constitution: 13, wisdom: 12, dexterity: 10, intelligence: 8 });
    expect(isStandardArray(placed)).toBe(true);
    expect(isStandardArray({ ...placed, intelligence: 15 })).toBe(false);
  });

  it("applies a background's increases only to its own abilities", () => {
    const scores = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };
    expect(applyBackgroundIncreases(scores, "soldier", { strength: 2, constitution: 1 })).toMatchObject({
      strength: 17,
      constitution: 14,
    });
    expect(() => applyBackgroundIncreases(scores, "soldier", { charisma: 2, strength: 1 })).toThrow(/can raise only/);
    expect(() => applyBackgroundIncreases(scores, "soldier", { strength: 2, constitution: 2 })).toThrow(/\+2 and \+1/);
  });
});
