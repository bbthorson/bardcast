import { describe, expect, it } from "vitest";
import { buildServices } from "../adapters/index.js";
import { createApp } from "../app.js";
import type { RpgActorReader } from "../ports/rpg-actor-reader.js";
import { charactersOf } from "./seats.js";
import { currentSheet } from "./sheets.js";
import { RpgActorImportError, importRpgActorCharacter, lookupRpgActor } from "./rpg-actor.js";

function makeSvc(reader: RpgActorReader) {
  const svc = buildServices({
    appBaseUrl: "http://localhost:5173",
    orchestratorBaseUrl: "http://localhost:8787",
    auth: "stub",
  });
  return { ...svc, rpgActor: reader };
}

describe("rpg.actor use-cases", () => {
  it("looks up an actor and returns a mapped import draft", async () => {
    const svc = makeSvc({
      readActor: async (did) => ({
        did,
        dnd: {
          identity: { class: "Ranger", race: "Wood Elf", level: 3 },
          abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 15, cha: 8 },
          personality: { ideals: "Protect the borderlands" },
        },
        equipment: [],
      }),
    });

    const result = await lookupRpgActor(svc, "did:plc:alice", { displayName: "Rowan" });
    expect(result.actor?.did).toBe("did:plc:alice");
    expect(result.importDraft?.class).toBe("ranger");
    expect(result.importDraft?.displayName).toBe("Rowan");
    expect(result.importDraft?.drives).toEqual(["Protect the borderlands"]);
  });

  it("imports an rpg.actor D&D character as a Bardcast profile + immutable sheet version", async () => {
    const svc = makeSvc({
      readActor: async (did) => ({
        did,
        dnd: {
          identity: { class: "Paladin", race: "Human", background: "Noble", level: 2 },
          abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 15 },
          equipment: { weapons: "Longsword", armor: "Chain Mail" },
          personality: {
            ideals: "Keep your oath",
            traits: "Polishes his spurs when anxious",
            backstory: "Swore an oath beneath a winter oak.",
          },
        },
        equipment: [],
      }),
    });

    const imported = await importRpgActorCharacter(svc, {
      playerDid: "did:plc:alice",
      displayName: "Sir Gawain",
    });

    expect(imported.profile.displayName).toBe("Sir Gawain");
    expect(imported.profile.player).toBe("did:plc:alice");
    expect(imported.profile.sheet).toEqual(imported.sheetRef);
    expect(imported.sheet.class).toBe("paladin");
    expect(imported.sheet.abilities.strength).toBe(16);
    expect(imported.sheet.equipment.map((e) => e.name)).toEqual(["Longsword", "Chain Mail"]);

    const stored = await currentSheet(svc, imported.characterId);
    expect(stored?.ref).toEqual(imported.sheetRef);

    const mine = await charactersOf(svc, "did:plc:alice");
    expect(mine.some((c) => c.id === imported.characterId)).toBe(true);
  });

  it("rejects import when rpg.actor class is unrecognized and no override is given", async () => {
    const svc = makeSvc({
      readActor: async (did) => ({
        did,
        dnd: { identity: { class: "Artificer" } },
        equipment: [],
      }),
    });

    await expect(
      importRpgActorCharacter(svc, { playerDid: "did:plc:alice", displayName: "Tinker" }),
    ).rejects.toThrow(RpgActorImportError);

    // Providing an explicit SRD class override succeeds.
    const ok = await importRpgActorCharacter(svc, {
      playerDid: "did:plc:alice",
      displayName: "Tinker",
      class: "wizard",
    });
    expect(ok.sheet.class).toBe("wizard");
  });

  it("exposes GET /api/rpg-actor/me, GET /api/rpg-actor/:did, and POST /api/rpg-actor/import", async () => {
    const svc = makeSvc({
      readActor: async (did) => ({
        did,
        dnd: {
          identity: { class: "Cleric", race: "Dwarf", level: 1 },
          abilities: { str: 14, dex: 10, con: 15, int: 8, wis: 16, cha: 12 },
        },
        equipment: [],
      }),
    });
    const app = createApp(svc);

    const unauth = await app.request("/api/rpg-actor/me");
    expect(unauth.status).toBe(401);

    const meRes = await app.request("/api/rpg-actor/me", {
      headers: { "X-Acting-Did": "did:plc:alice" },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { actor: { did: string }; importDraft: { class: string } };
    expect(meBody.actor.did).toBe("did:plc:alice");
    expect(meBody.importDraft.class).toBe("cleric");

    const pubRes = await app.request("/api/rpg-actor/did:plc:bob");
    expect(pubRes.status).toBe(200);

    const badDid = await app.request("/api/rpg-actor/not-a-did");
    expect(badDid.status).toBe(400);

    const importRes = await app.request("/api/rpg-actor/import", {
      method: "POST",
      headers: { "X-Acting-Did": "did:plc:alice", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Bram" }),
    });
    expect(importRes.status).toBe(201);
    const imported = (await importRes.json()) as { characterId: string; sheet: { class: string } };
    expect(imported.sheet.class).toBe("cleric");
    expect(imported.characterId).toMatch(/^char\./);
  });

  it("projects a player's own character to actor.rpg.stats/dnd and actor.rpg.stats/bardcast via POST /api/rpg-actor/sync", async () => {
    const writes: Array<{ did: string; system: string; data: Record<string, unknown> }> = [];
    const svc = {
      ...makeSvc({
        readActor: async (did) => ({
          did,
          dnd: {
            identity: { class: "Bard", race: "Half-Elf", level: 1 },
            abilities: { str: 8, dex: 14, con: 12, int: 13, wis: 10, cha: 16 },
            personality: { ideals: "Every ballad deserves a witness" },
          },
          equipment: [],
        }),
      }),
      rpgActorWriter: {
        putSystemStats: async (input: { did: `did:${string}`; system: string; data: Record<string, unknown> }) => {
          writes.push({ did: input.did, system: input.system, data: input.data });
          return {
            uri: `at://${input.did}/actor.rpg.stats/${input.system}`,
            cid: `bafkrei${input.system}`,
            system: input.system,
          };
        },
      },
    };
    const imported = await importRpgActorCharacter(svc, {
      playerDid: "did:plc:alice",
      displayName: "Lyra",
    });

    const app = createApp(svc);

    // Another player cannot sync Alice's character.
    const forbidden = await app.request("/api/rpg-actor/sync", {
      method: "POST",
      headers: { "X-Acting-Did": "did:plc:bob", "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: imported.characterId }),
    });
    expect(forbidden.status).toBe(403);

    const res = await app.request("/api/rpg-actor/sync", {
      method: "POST",
      headers: { "X-Acting-Did": "did:plc:alice", "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: imported.characterId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { characterId: string; synced: Array<{ system: string; uri: string }> };
    expect(body.characterId).toBe(imported.characterId);
    expect(body.synced.map((s) => s.system)).toEqual(["dnd", "bardcast"]);

    const dndWrite = writes.find((w) => w.system === "dnd");
    const bardcastWrite = writes.find((w) => w.system === "bardcast");
    expect((dndWrite?.data.identity as { class?: string })?.class).toBe("Bard");
    expect(bardcastWrite?.data._meta).toEqual({ name: "Bardcast" });
    expect(bardcastWrite?.data.name).toBe("Lyra");
  });
});
