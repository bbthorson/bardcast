import { playerSpace, sheetAtLevel, STANDARD_ARRAY, type SpaceKey } from "@bardcast/domain";
import { PwaEngagementChannel } from "@bardcast/engagement";
import type { AntiphonyReply } from "@bardcast/antiphony-client";
import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../adapters/in-memory-store.js";
import { StubAudioRenderer } from "../adapters/stub-audio-renderer.js";
import { StubIdentityProvider } from "../adapters/stub-identity-provider.js";
import { StubNarrativeWriter } from "../adapters/stub-narrative-writer.js";
import { StubVoiceCloner } from "../adapters/stub-voice-cloner.js";
import type { AntiphonyGateway } from "../ports/antiphony-gateway.js";
import type {
  DecideInput,
  DecideResult,
  DecisionAnswer,
  DecisionModel,
  DecisionQuestion,
} from "../ports/decision-model.js";
import type { CoreServices } from "../ports/index.js";
import {
  advanceCreation,
  answerCreation,
  confirmCharacter,
  confirmName,
  CreationError,
  pickAttribute,
  proposeCharacter,
  reviseLine,
  startCreation,
} from "./creation.js";
import { currentSheet } from "./sheets.js";

const ALICE = "did:plc:alice" as const;

/** Records every prompt and reply; transcripts are filled in by the test, as Antiphony would. */
class FakeAntiphony implements AntiphonyGateway {
  spaces: SpaceKey[] = [];
  prompts: Array<{ title: string; hasAudio: boolean; space: SpaceKey; uri: string }> = [];
  replies: AntiphonyReply[] = [];
  transcripts = new Map<string, string>();

  async ensureSpace(space: SpaceKey) {
    this.spaces.push(space);
  }
  async createPrompt(input: Parameters<AntiphonyGateway["createPrompt"]>[0]) {
    const n = this.prompts.length + 1;
    const uri = `at://did:web:bardcast/space/${input.space.type}/${input.space.skey}/did:web:bardcast/dev.antiphony.audio.post/p${n}`;
    this.prompts.push({ title: input.title, hasAudio: Boolean(input.audio), space: input.space, uri });
    return { uri, cid: `bafyp${n}`, postId: `p${n}`, title: input.title, createdAt: "2026-10-28T00:00:00Z" };
  }
  async listReplies(promptUri: string) {
    return this.replies
      .filter((r) => r.promptUri === promptUri)
      .map((r) => ({ ...r, ...(this.transcripts.has(r.uri) ? { transcript: this.transcripts.get(r.uri)! } : {}) }));
  }
  async createReply(input: Parameters<AntiphonyGateway["createReply"]>[0]) {
    const uri = `${input.promptUri}-reply`;
    this.replies.push({ uri, cid: "bafyr", promptUri: input.promptUri, author: input.actingDid, createdAt: "2026-10-28T00:00:00Z" });
    return uri;
  }
}

/**
 * A Clef stand-in. It keeps what it believes about each attribute between
 * calls, the way the real one re-reads the whole conversation, and the test
 * moves those beliefs with `hear`. Anything it hasn't heard about is unclear.
 */
class ScriptedClef implements DecisionModel {
  private beliefs: Record<string, Record<string, number>> = {};
  leanings: Record<string, number> = {};
  calls = 0;

  hear(beliefs: Record<string, Record<string, number>>) {
    Object.assign(this.beliefs, beliefs);
  }

  async decide<Q extends Record<string, DecisionQuestion>>(input: DecideInput<Q>): Promise<DecideResult<Q>> {
    this.calls++;
    const answers: Record<string, DecisionAnswer> = {};
    for (const [id, q] of Object.entries(input.questions)) {
      if (q.type === "score") {
        answers[id] = { type: "score", score: this.leanings[id] ?? 0, confidence: 0.8, probabilities: {} };
      } else if (q.type === "choice") {
        const probabilities = this.beliefs[id] ?? { unclear: 1 };
        const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]![0];
        answers[id] = { type: "choice", choice, confidence: probabilities[choice]!, probabilities };
      } else {
        answers[id] = { type: "noul", noul: 0.5 };
      }
    }
    return answers as DecideResult<Q>;
  }
}

function services(): CoreServices & { antiphony: FakeAntiphony; decisions: ScriptedClef } {
  let tick = 0;
  return {
    store: new InMemoryStore(),
    antiphony: new FakeAntiphony(),
    narrative: new StubNarrativeWriter(),
    voice: new StubVoiceCloner(),
    audio: new StubAudioRenderer(),
    identity: new StubIdentityProvider(),
    decisions: new ScriptedClef(),
    engagement: new PwaEngagementChannel({ apiBaseUrl: "http://test", sendPush: async () => {}, promptUrl: (r) => r }),
    clock: () => new Date(Date.UTC(2026, 9, 28, 0, 0, tick++)),
  };
}

const lastPrompt = (svc: { antiphony: FakeAntiphony }) => svc.antiphony.prompts.at(-1)!;

describe("session zero", () => {
  it("talks a character into being, one attribute at a time", async () => {
    const svc = services();
    const clef = svc.decisions;

    // The opener goes into the player's own space, voiced.
    const started = await startCreation(svc, { did: ALICE });
    const { id } = started;
    expect(svc.antiphony.spaces).toContainEqual(playerSpace(ALICE));
    expect(lastPrompt(svc)).toMatchObject({ title: "Who are you when nobody's watching?", hasAudio: true, space: playerSpace(ALICE) });
    expect(started.next).toEqual({ kind: "wait" });

    // The big answer settles species on the way past.
    clef.hear({
      species: { dwarf: 0.9, human: 0.05, unclear: 0.05 },
      class: { ranger: 0.38, paladin: 0.34, rogue: 0.17, unclear: 0.11 },
      background: { soldier: 0.5, sage: 0.2, unclear: 0.3 },
    });
    let v = await answerCreation(svc, {
      id,
      did: ALICE,
      text: "A dwarf who keeps watch over the orphanage. If someone hurt the kids, I'd find them.",
    });
    expect(v.creation.settled.species).toMatchObject({ value: "dwarf", by: "clef" });
    expect(lastPrompt(svc).title).toBe("And what do people call you?");

    // The name is heard, and read back for the player to confirm.
    v = await answerCreation(svc, { id, did: ALICE, text: "Wren Ashdown" });
    expect(v.creation.name.heard).toBe("Wren Ashdown");
    await confirmName(svc, { id, did: ALICE, name: "Wren Ashdown" });

    // Least settled required attribute first: class, between its top two.
    expect(v.creation.turns.at(-1)).toMatchObject({ kind: "ask", attribute: "class", candidates: ["ranger", "paladin"] });

    // A clear answer settles class, and a couple of traits with it.
    clef.hear({
      class: { paladin: 0.71, ranger: 0.14, unclear: 0.15 },
      temperament: { bold: 0.8, cautious: 0.05, unclear: 0.15 },
      morality: { principled: 0.75, pragmatic: 0.1, unclear: 0.15 },
      speech: { wry: 0.45, terse: 0.25, unclear: 0.3 },
    });
    v = await answerCreation(svc, { id, did: ALICE, text: "Judged. Out loud, in front of everyone." });
    expect(v.creation.settled.class).toMatchObject({ value: "paladin", by: "clef" });
    expect(v.creation.turns.at(-1)).toMatchObject({ kind: "ask", attribute: "background", candidates: ["soldier", "sage"] });

    // Background doesn't settle in MAX_TURNS replies: the player picks.
    v = await answerCreation(svc, { id, did: ALICE, text: "I learned a lot, here and there." });
    v = await answerCreation(svc, { id, did: ALICE, text: "Some of it with a sword, some with books." });
    expect(v.creation.turns.at(-1)).toMatchObject({ kind: "ask", attribute: "background" });
    v = await answerCreation(svc, { id, did: ALICE, text: "Hard to say." });
    expect(v.creation.turns.at(-1)).toMatchObject({ kind: "choose", attribute: "background" });
    expect(lastPrompt(svc).title).toBe("Sounds like a soldier, or maybe a sage. Which is it?");

    // A tap instead of a spoken answer, and the conversation moves on to the
    // personality axis closest to settling.
    v = await pickAttribute(svc, { id, did: ALICE, attribute: "background", value: "soldier" });
    expect(v.creation.settled.background).toMatchObject({ value: "soldier", by: "player" });
    expect(v.creation.turns.at(-1)).toMatchObject({ kind: "ask", attribute: "speech", candidates: ["wry", "terse"] });

    clef.hear({ speech: { wry: 0.7, terse: 0.1, unclear: 0.2 } });
    v = await answerCreation(svc, { id, did: ALICE, text: "Oh, I'd never joke at a time like this. Mostly." });
    expect(v.creation.status).toBe("ready");
    expect(v.next).toEqual({ kind: "done" });

    // The card, and a suggested placement of the standard array.
    clef.leanings = { strength: 4, charisma: 3.5, constitution: 3, wisdom: 2, dexterity: 1, intelligence: 0.5 };
    v = await proposeCharacter(svc, { id, did: ALICE });
    const card = v.creation.card!;
    expect(card.quote).toBe("A dwarf who keeps watch over the orphanage.");
    expect(v.creation.suggestedAbilities).toEqual({
      strength: 15,
      charisma: 14,
      constitution: 13,
      wisdom: 12,
      dexterity: 10,
      intelligence: 8,
    });

    // "Not quite" changes that line only.
    v = await reviseLine(svc, { id, did: ALICE, line: { field: "quirk", index: 0 } });
    expect(v.creation.card!.quirks[0]).not.toBe(card.quirks[0]);
    expect(v.creation.card!.concept).toBe(card.concept);

    // The player places the scores, picks the background's increases, and it's saved.
    const saved = await confirmCharacter(svc, {
      id,
      did: ALICE,
      abilities: { ...v.creation.suggestedAbilities!, wisdom: 10, dexterity: 12 },
      backgroundIncreases: { strength: 2, constitution: 1 },
    });
    expect(saved.creation.status).toBe("confirmed");
    const profile = await svc.store.getCharacter(saved.characterId);
    expect(profile).toMatchObject({ player: ALICE, displayName: "Wren Ashdown", concept: card.concept });
    const sheet = (await currentSheet(svc, saved.characterId))!;
    expect(sheet.ref).toEqual(saved.sheet);
    expect(sheet.sheet).toMatchObject({
      class: "paladin",
      species: "dwarf",
      background: "soldier",
      abilities: { strength: 17, constitution: 14, dexterity: 12, wisdom: 10 },
      traits: [
        { name: "temperament", value: "bold" },
        { name: "morality", value: "principled" },
        { name: "speech", value: "wry" },
      ],
    });
    expect(sheet.sheet.features.length).toBeGreaterThan(0);
    expect(sheetAtLevel(sheet.sheet, 1)).toBeTruthy();
  });

  it("posts a spoken answer as a reply, and waits for Antiphony to transcribe it", async () => {
    const svc = services();
    const { id } = await startCreation(svc, { did: ALICE });
    const audio = new Blob(["..."], { type: "audio/webm" });

    let v = await answerCreation(svc, { id, did: ALICE, audio });
    const replyUri = svc.antiphony.replies[0]!.uri;
    expect(svc.antiphony.replies[0]!.promptUri).toBe(svc.antiphony.prompts[0]!.uri);
    expect(v.creation.turns[0]!.reply).toMatchObject({ uri: replyUri });
    expect(v.next).toEqual({ kind: "wait" });
    expect(svc.antiphony.prompts).toHaveLength(1);
    expect(svc.decisions.calls).toBe(0);

    svc.antiphony.transcripts.set(replyUri, "Nobody you'd notice.");
    v = await advanceCreation(svc, { id, did: ALICE });
    expect(v.creation.turns[0]!.reply!.transcript).toBe("Nobody you'd notice.");
    expect(lastPrompt(svc).title).toBe("And what do people call you?");
  });

  it("is the player's alone", async () => {
    const svc = services();
    const { id } = await startCreation(svc, { did: ALICE });
    await expect(answerCreation(svc, { id, did: "did:plc:mallory", text: "hi" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(answerCreation(svc, { id, did: ALICE })).rejects.toBeInstanceOf(CreationError);
  });

  it("holds the card until the conversation is done", async () => {
    const svc = services();
    const { id } = await startCreation(svc, { did: ALICE });
    await expect(proposeCharacter(svc, { id, did: ALICE })).rejects.toMatchObject({ code: "conflict" });
  });

  it("only accepts the standard array", async () => {
    const svc = services();
    const { id } = await startCreation(svc, { did: ALICE });
    const creation = (await svc.store.getCreation(id))!;
    const settled = (value: string) => ({ value, by: "player" as const, at: creation.createdAt });
    await svc.store.putCreation(id, {
      ...creation,
      status: "ready",
      settled: { class: settled("fighter"), species: settled("human"), background: settled("soldier") },
      name: { confirmed: "Gawain" },
      card: { concept: "A knight", quirks: ["Courteous"], drives: ["Honor"], quote: "…" },
    });
    const [a, b, c, d, e, f] = STANDARD_ARRAY;
    const abilities = { strength: a, dexterity: b, constitution: c, intelligence: d, wisdom: e, charisma: f };
    await expect(
      confirmCharacter(svc, {
        id,
        did: ALICE,
        abilities: { ...abilities, charisma: 15 },
        backgroundIncreases: { strength: 2, constitution: 1 },
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      confirmCharacter(svc, { id, did: ALICE, abilities, backgroundIncreases: { charisma: 2, strength: 1 } }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
