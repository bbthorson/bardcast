import { describe, expect, it } from "vitest";
import { WorkersAiDecisionModel } from "./workers-ai-decision-model.js";

const questions = {
  team: { type: "choice" as const, instructions: "Which team?", criteria: { billing: "Money", technical: "Outages" } },
};
const answers = {
  team: { type: "choice", choice: "technical", confidence: 0.8, probabilities: { billing: 0.1, technical: 0.9 } },
};

function fakeFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("WorkersAiDecisionModel", () => {
  it("posts the System One request to Clef-flash and unwraps the envelope", async () => {
    const { fetchImpl, calls } = fakeFetch(Response.json({ success: true, result: { model: "clef-flash", answers } }));
    const model = new WorkersAiDecisionModel({ accountId: "acct", apiToken: "tok", fetchImpl });

    const result = await model.decide({ state: "Checkout is down", questions });

    expect(result.team.choice).toBe("technical");
    expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef-flash");
    expect((calls[0]!.init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ model: "clef-flash", state: "Checkout is down", questions });
  });

  it("swaps to Jev by model id, without a Clef model selector", async () => {
    const { fetchImpl, calls } = fakeFetch(Response.json({ result: { answers } }));
    const model = new WorkersAiDecisionModel({ accountId: "acct", apiToken: "tok", model: "typesafe/jev", fetchImpl });

    await model.decide({ state: "x", questions });

    expect(calls[0]!.url).toMatch(/\/ai\/run\/typesafe\/jev$/);
    expect(JSON.parse(calls[0]!.init.body as string)).not.toHaveProperty("model");
  });

  it("throws on an HTTP error or a missing answer", async () => {
    const bad = new WorkersAiDecisionModel({
      accountId: "a", apiToken: "t", fetchImpl: fakeFetch(new Response("nope", { status: 403 })).fetchImpl,
    });
    await expect(bad.decide({ state: "x", questions })).rejects.toThrow(/403/);

    const empty = new WorkersAiDecisionModel({
      accountId: "a", apiToken: "t", fetchImpl: fakeFetch(Response.json({ result: { answers: {} } })).fetchImpl,
    });
    await expect(empty.decide({ state: "x", questions })).rejects.toThrow(/no answer for "team"/);
  });
});
