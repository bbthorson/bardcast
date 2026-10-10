import { PERSONALITY_TRAITS } from "@bardcast/domain";
import { describe, expect, it } from "vitest";
import { StubDecisionModel } from "../adapters/stub-decision-model.js";
import type { DecideInput, DecisionModel, DecisionQuestion } from "../ports/decision-model.js";
import { inferTraits, mergeTraits } from "./infer-traits.js";

/** A model that answers from a fixed table and records what it was asked. */
function fakeModel(table: Record<string, { choice: string; confidence: number }>) {
  const calls: DecideInput<Record<string, DecisionQuestion>>[] = [];
  const model: DecisionModel = {
    async decide(input) {
      calls.push(input);
      const answers = Object.fromEntries(
        Object.keys(input.questions).map((id) => {
          const a = table[id] ?? { choice: "unclear", confidence: 0.9 };
          return [id, { type: "choice", ...a, probabilities: { [a.choice]: a.confidence } }];
        }),
      );
      return answers as never;
    },
  };
  return { model, calls };
}

const profile = { displayName: "Alice the Bold", drives: [], createdAt: "2026-01-01T00:00:00Z" };

describe("inferTraits", () => {
  it("asks one choice question per axis and maps confidence to 0–100", async () => {
    const { model, calls } = fakeModel({
      temperament: { choice: "bold", confidence: 0.87 },
      speech: { choice: "wry", confidence: 0.42 },
    });
    const traits = await inferTraits(model, { profile, transcripts: ["I'll take the first watch.", " "] });

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!.questions).sort()).toEqual(Object.keys(PERSONALITY_TRAITS).sort());
    expect(calls[0]!.state).toMatchObject({ character: "Alice the Bold", replies: ["I'll take the first watch."] });
    expect(traits).toEqual([
      { name: "temperament", value: "bold", confidence: 87 },
      { name: "speech", value: "wry", confidence: 42 },
    ]);
  });

  it("skips the call when there are no transcripts", async () => {
    const { model, calls } = fakeModel({});
    expect(await inferTraits(model, { profile, transcripts: ["", "  "] })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("drops answers outside the vocabulary", async () => {
    const { model } = fakeModel({ temperament: { choice: "sleepy", confidence: 0.99 } });
    expect(await inferTraits(model, { profile, transcripts: ["zzz"] })).toEqual([]);
  });

  it("gets nothing past the readiness gate from the stub", async () => {
    const traits = await inferTraits(new StubDecisionModel(), { profile, transcripts: ["hello"] });
    expect(traits.every((t) => (t.confidence ?? 0) < 60)).toBe(true);
  });
});

describe("mergeTraits", () => {
  it("keeps the higher-confidence reading per trait and leaves ability scores alone", () => {
    const existing = [
      { name: "temperament", value: "cautious", confidence: 80 },
      { name: "speech", value: "terse", confidence: 30 },
      { name: "strength", value: "14", confidence: 100 },
    ];
    const merged = mergeTraits(existing, [
      { name: "temperament", value: "bold", confidence: 70 },
      { name: "speech", value: "wry", confidence: 65 },
      { name: "loyalty", value: "cause", confidence: 61 },
      { name: "Strength", value: "3", confidence: 100 },
    ]);
    expect(merged).toEqual([
      { name: "temperament", value: "cautious", confidence: 80 },
      { name: "speech", value: "wry", confidence: 65 },
      { name: "strength", value: "14", confidence: 100 },
      { name: "loyalty", value: "cause", confidence: 61 },
    ]);
  });
});

describe("ingestReplies trait inference", () => {
  it("writes inferred traits onto the campaign sheet, and survives a model failure", async () => {
    const { InMemoryStore } = await import("../adapters/in-memory-store.js");
    const { ingestReplies } = await import("./ingest-replies.js");
    const store = new InMemoryStore();
    await store.putCharacter("char.alice", profile);
    const gateway = {
      async listReplies() {
        return [{ uri: "at://reply/0", transcript: "Follow me, cowards!" }];
      },
    };
    const run = (decisions: DecisionModel) =>
      ingestReplies(
        { store, antiphony: gateway, decisions, clock: () => new Date("2026-01-01T00:00:00Z") } as never,
        { campaignId: "campaign.x", characterId: "char.alice", antiphonyPromptUri: "at://prompt/1", intent: "sheet" },
      );

    await run(fakeModel({ temperament: { choice: "bold", confidence: 0.9 } }).model);
    expect((await store.getSeat("campaign.x", "char.alice"))?.traits).toEqual([
      { name: "temperament", value: "bold", confidence: 90 },
    ]);

    await run({ decide: async () => { throw new Error("down"); } });
    const sheet = await store.getSeat("campaign.x", "char.alice");
    expect(sheet?.traits).toHaveLength(1);
    expect(sheet?.sourceReplies).toEqual(["at://reply/0"]);
  });
});
