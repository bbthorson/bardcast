import { describe, expect, it } from "vitest";
import { AtprotoRpgActorReader } from "./rpg-actor-reader.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AtprotoRpgActorReader", () => {
  it("reads per-system D&D stats, sprite + emotes, and verified equipment", async () => {
    const did = "did:plc:alice123";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url === `https://plc.directory/${encodeURIComponent(did)}`) {
        return jsonResponse({
          service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: "https://pds.example" }],
        });
      }
      if (url.includes("collection=actor.rpg.stats") && url.includes("rkey=dnd")) {
        return jsonResponse({
          value: {
            $type: "actor.rpg.stats",
            system: "dnd",
            data: {
              identity: { class: "Bard", race: "Half-Elf", level: 2 },
              abilities: { str: 10, dex: 14, con: 12, int: 13, wis: 10, cha: 16 },
            },
          },
        });
      }
      if (url.includes("collection=actor.rpg.sprite") && url.includes("rkey=self")) {
        return jsonResponse({
          value: {
            $type: "actor.rpg.sprite",
            spriteSheet: { $type: "blob", ref: { $link: "bafkreisprite1" }, mimeType: "image/png" },
            source: `at://${did}/actor.rpg.generator/self`,
            emotes: {
              happy: {
                label: "Happy",
                emoteSheet: { ref: { $link: "bafkreihappy1" } },
                talkSheet: { ref: { $link: "bafkreihappytalk1" } },
              },
            },
          },
        });
      }
      if (url.startsWith("https://rpg.actor/api/equipment?")) {
        return jsonResponse({
          items: [
            {
              item: "green_girdle",
              title: "Green Silk Girdle",
              kind: "inventory",
              description: "A braided belt of green silk and gold.",
              context: "Won at Bertilak's castle",
              provider: "did:plc:gawaindm",
              give: "at://did:plc:gawaindm/equipment.rpg.give/3k2a",
              verified: true,
            },
          ],
        });
      }
      return jsonResponse({ error: "NotFound" }, 404);
    };

    const reader = new AtprotoRpgActorReader({ fetchImpl });
    const profile = await reader.readActor(did);

    expect(profile).not.toBeNull();
    expect(profile?.did).toBe(did);
    expect(profile?.pdsUrl).toBe("https://pds.example");
    expect(profile?.dnd?.identity?.class).toBe("Bard");
    expect(profile?.dnd?.abilities?.cha).toBe(16);
    expect(profile?.sprite?.sheetUrl).toBe(
      `https://pds.example/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=bafkreisprite1`,
    );
    expect(profile?.sprite?.frameWidth).toBe(48);
    expect(profile?.sprite?.emotes?.happy?.talkUrl).toContain("cid=bafkreihappytalk1");
    expect(profile?.equipment).toHaveLength(1);
    expect(profile?.equipment[0]?.title).toBe("Green Silk Girdle");
    expect(profile?.equipment[0]?.verified).toBe(true);
  });

  it("falls back to legacy actor.rpg.stats/self when per-system dnd record is absent", async () => {
    const did = "did:plc:legacy123";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("plc.directory")) {
        return jsonResponse({
          service: [{ id: "#atproto_pds", serviceEndpoint: "https://pds.example" }],
        });
      }
      if (url.includes("rkey=self") && url.includes("actor.rpg.stats")) {
        return jsonResponse({
          value: {
            $type: "actor.rpg.stats",
            dnd: { identity: { class: "Rogue", level: 1 } },
          },
        });
      }
      return jsonResponse({ error: "NotFound" }, 404);
    };

    const reader = new AtprotoRpgActorReader({ fetchImpl });
    const profile = await reader.readActor(did);
    expect(profile?.dnd?.identity?.class).toBe("Rogue");
    expect(profile?.sprite).toBeUndefined();
    expect(profile?.equipment).toEqual([]);
  });

  it("returns null when a DID has no rpg.actor records anywhere", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ error: "NotFound" }, 404);
    const reader = new AtprotoRpgActorReader({ fetchImpl });
    expect(await reader.readActor("did:plc:nobody")).toBeNull();
  });
});
