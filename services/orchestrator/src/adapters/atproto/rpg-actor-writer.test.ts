import { describe, expect, it } from "vitest";
import { RpgActorWriteError } from "../../ports/rpg-actor-writer.js";
import { AtprotoRpgActorWriter } from "./rpg-actor-writer.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AtprotoRpgActorWriter", () => {
  it("writes a per-system actor.rpg.stats record and preserves existing createdAt", async () => {
    const calls: Array<{ pathname: string; method?: string; body?: unknown }> = [];
    const writer = new AtprotoRpgActorWriter({
      restoreSession: async () => ({
        fetchHandler: async (pathname, init) => {
          const parsedBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
          calls.push({ pathname, ...(init?.method ? { method: init.method } : {}), body: parsedBody });
          if (pathname.startsWith("/xrpc/com.atproto.repo.getRecord")) {
            return jsonResponse({ value: { createdAt: "2026-01-01T00:00:00.000Z" } });
          }
          if (pathname === "/xrpc/com.atproto.repo.putRecord") {
            return jsonResponse({
              uri: "at://did:plc:alice/actor.rpg.stats/dnd",
              cid: "bafkreistats1",
            });
          }
          return jsonResponse({ error: "NotFound" }, 404);
        },
      }),
    });

    const result = await writer.putSystemStats({
      did: "did:plc:alice",
      system: "dnd",
      data: { identity: { class: "Fighter", level: 2 } },
      now: "2026-11-25T12:00:00.000Z",
    });

    expect(result).toEqual({
      uri: "at://did:plc:alice/actor.rpg.stats/dnd",
      cid: "bafkreistats1",
      system: "dnd",
    });

    const putCall = calls.find((c) => c.pathname === "/xrpc/com.atproto.repo.putRecord");
    expect(putCall?.body).toEqual({
      repo: "did:plc:alice",
      collection: "actor.rpg.stats",
      rkey: "dnd",
      record: {
        $type: "actor.rpg.stats",
        system: "dnd",
        data: { identity: { class: "Fighter", level: 2 } },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-11-25T12:00:00.000Z",
      },
    });
  });

  it("throws unauthorized when no OAuth session can be restored", async () => {
    const writer = new AtprotoRpgActorWriter({ restoreSession: async () => null });
    await expect(
      writer.putSystemStats({
        did: "did:plc:alice",
        system: "dnd",
        data: {},
        now: "2026-11-25T12:00:00.000Z",
      }),
    ).rejects.toMatchObject({ name: "RpgActorWriteError", code: "unauthorized" });
  });

  it("maps 403 / InvalidScope from PDS into scope_missing", async () => {
    const writer = new AtprotoRpgActorWriter({
      restoreSession: async () => ({
        fetchHandler: async (pathname) => {
          if (pathname.startsWith("/xrpc/com.atproto.repo.getRecord")) {
            return jsonResponse({ error: "RecordNotFound" }, 400);
          }
          return jsonResponse({ error: "InvalidScope", message: "Missing repo:actor.rpg.stats" }, 403);
        },
      }),
    });

    await expect(
      writer.putSystemStats({
        did: "did:plc:alice",
        system: "bardcast",
        data: { _meta: { name: "Bardcast" } },
        now: "2026-11-25T12:00:00.000Z",
      }),
    ).rejects.toSatisfy((err: unknown) => err instanceof RpgActorWriteError && err.code === "scope_missing");
  });
});
