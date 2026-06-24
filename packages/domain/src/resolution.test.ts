import { describe, expect, it } from "vitest";
import type { CharacterSheet } from "./character.js";
import { deriveSeed, makeRng } from "./dice.js";
import { abilityCheck, abilityScoreModifier, DC, modifierFor } from "./resolution.js";

describe("dice", () => {
  it("is deterministic for a given seed", () => {
    const a = Array.from({ length: 5 }, makeRng(1234));
    const b = Array.from({ length: 5 }, makeRng(1234));
    // same seed → identical streams
    const seqA = [makeRng(1234)(), makeRng(1234)()];
    expect(seqA[0]).toBe(seqA[1]);
    expect(a.length).toBe(b.length);
  });

  it("derives stable, distinct sub-seeds per label", () => {
    expect(deriveSeed(42, "beat-1")).toBe(deriveSeed(42, "beat-1"));
    expect(deriveSeed(42, "beat-1")).not.toBe(deriveSeed(42, "beat-2"));
  });
});

describe("resolution", () => {
  it("converts 5e ability scores to modifiers", () => {
    expect(abilityScoreModifier(10)).toBe(0);
    expect(abilityScoreModifier(16)).toBe(3);
    expect(abilityScoreModifier(8)).toBe(-1);
  });

  it("reads a modifier from the character sheet (replies → sheet → modifier)", () => {
    const sheet: CharacterSheet = {
      traits: [{ name: "dexterity", value: "16", confidence: 80 }],
      drives: [],
      sourceReplies: [],
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(modifierFor(sheet, "dexterity")).toBe(3);
    expect(modifierFor(sheet, "strength")).toBe(0);
    expect(modifierFor(null, "dexterity")).toBe(0);
  });

  it("resolves a check deterministically from seed + label", () => {
    const args = { masterSeed: 7, label: "elara: disarm trap", dc: DC.medium, modifier: 3, ability: "dexterity" };
    const a = abilityCheck(args);
    const b = abilityCheck(args);
    expect(a).toEqual(b); // reproducible
    expect(a.total).toBe(a.d20 + 3);
    expect(["critical-success", "success", "failure", "critical-failure"]).toContain(a.outcome);
  });

  it("honors nat 1 / nat 20 regardless of DC", () => {
    // scan seeds to find a nat-20 and a nat-1, then assert the outcome mapping
    let crit = false;
    let fumble = false;
    for (let s = 0; s < 200 && !(crit && fumble); s++) {
      const r = abilityCheck({ masterSeed: s, label: "x", dc: DC.nearlyImpossible, modifier: 0 });
      if (r.d20 === 20) {
        expect(r.outcome).toBe("critical-success");
        crit = true;
      }
      if (r.d20 === 1) {
        expect(r.outcome).toBe("critical-failure");
        fumble = true;
      }
    }
    expect(crit && fumble).toBe(true);
  });

  it("applies advantage (takes the higher of two d20s)", () => {
    const r = abilityCheck({ masterSeed: 99, label: "y", dc: DC.hard, modifier: 0, mode: "advantage" });
    expect(r.d20s).toHaveLength(2);
    expect(r.d20).toBe(Math.max(...r.d20s));
  });
});
