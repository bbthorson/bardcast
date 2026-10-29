import { describe, expect, it } from "vitest";
import { ClaudeNarrativeWriter, NarrativeRefusedError } from "./narrative-writer.js";

interface Call {
  url: string;
  headers: Headers;
  body: Record<string, any>;
}

function message(text: string, stop_reason = "end_turn", extra: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: text ? [{ type: "text", text }] : [],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    ...extra,
  };
}

/** A fake Messages API. */
function fakeApi(reply: (body: Record<string, any>) => ReturnType<typeof message>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(input), headers: new Headers(init?.headers), body });
    return Response.json(reply(body));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const conversation = [
  { narrator: "Who are you when nobody's watching?", player: "A dwarf who keeps watch over the orphanage." },
  { narrator: "And what do people call you?", player: "Wren Ashdown" },
];

describe("ClaudeNarrativeWriter", () => {
  it("asks for one question with structured output, the narrator's style and a server-side fallback", async () => {
    const { fetchImpl, calls } = fakeApi(() => message(JSON.stringify({ question: "  When you find them, what happens next?  " })));
    const writer = new ClaudeNarrativeWriter({ apiKey: "sk-test", fetch: fetchImpl });

    const question = await writer.writeQuestion({
      conversation,
      name: "Wren Ashdown",
      attribute: "class",
      candidates: [
        { key: "paladin", meaning: "Paladin: a holy warrior bound by a sacred oath to judge and protect" },
        { key: "ranger", meaning: "Ranger: a hunter and tracker of the wilds who finds what's lost" },
      ],
    });

    expect(question).toBe("When you find them, what happens next?");
    const { url, headers, body } = calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("medium");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.system[0].text).toMatch(/friend who runs the game/);
    // The player's words arrive marked as theirs, and the question is about the candidates.
    const prompt = body.messages[0].content.map((c: { text: string }) => c.text).join("\n");
    expect(prompt).toContain("<player>A dwarf who keeps watch over the orphanage.</player>");
    expect(prompt).toContain("a holy warrior bound by a sacred oath");
  });

  it("writes a card, fitted to the domain's limits", async () => {
    const card = {
      concept: "A dwarf who keeps the orphanage's door, and its grudges.",
      quirks: ["Counts the children at every doorway.", "Hums hymns off-key.", "Keeps a list.", "One too many."],
      drives: ["To see every child grown."],
      quote: "A dwarf who keeps watch over the orphanage.",
    };
    const { fetchImpl } = fakeApi(() => message(JSON.stringify(card)));
    const writer = new ClaudeNarrativeWriter({ apiKey: "k", fetch: fetchImpl });

    const written = await writer.writeCard({ conversation, name: "Wren Ashdown", settled: { class: "Paladin" } });
    expect(written.quirks).toHaveLength(3);
    expect(written.quote).toBe(card.quote);
  });

  it("goes through the AI Gateway's anthropic route when one is configured", async () => {
    const { fetchImpl, calls } = fakeApi(() => message(JSON.stringify({ line: "Owes the baker a favour she won't name." })));
    const writer = new ClaudeNarrativeWriter({
      apiKey: "k",
      model: "claude-sonnet-5-5",
      gateway: { accountId: "acct", gatewayId: "bardcast", token: "aig" },
      fetch: fetchImpl,
    });

    await writer.reviseCardLine({
      conversation,
      name: "Wren Ashdown",
      settled: {},
      card: { concept: "c", quirks: ["q"], drives: ["d"], quote: "A dwarf" },
      line: { field: "quirk", index: 0 },
    });
    expect(calls[0]!.url).toBe("https://gateway.ai.cloudflare.com/v1/acct/bardcast/anthropic/v1/messages");
    expect(calls[0]!.headers.get("cf-aig-authorization")).toBe("Bearer aig");
    expect(calls[0]!.body.model).toBe("claude-sonnet-5-5");
  });

  it("throws when Claude declines even after the fallback", async () => {
    const { fetchImpl } = fakeApi(() => message("", "refusal", { stop_details: { type: "refusal", category: "cyber", explanation: null } }));
    const writer = new ClaudeNarrativeWriter({ apiKey: "k", fetch: fetchImpl });
    const err = await writer.writeCard({ conversation, name: "Wren", settled: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NarrativeRefusedError);
    expect((err as NarrativeRefusedError).category).toBe("cyber");
  });
});
