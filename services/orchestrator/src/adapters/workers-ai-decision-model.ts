import { aiGatewayBaseUrl, aiGatewayHeaders, type AiGatewayConfig } from "./ai-gateway.js";
import type {
  DecideInput,
  DecideResult,
  DecisionModel,
  DecisionQuestion,
} from "../ports/decision-model.js";

export interface WorkersAiDecisionModelConfig {
  accountId: string;
  /** Cloudflare API token with Workers AI access. */
  apiToken: string;
  /**
   * Workers AI model id. Defaults to Clef-flash. Clef (`@cf/cloudflare/clef`)
   * and TypeSafe's Jev (`typesafe/jev`) take the same request, so switching is
   * a config change.
   */
  model?: string;
  baseUrl?: string;
  /**
   * Send decisions through a Cloudflare AI Gateway (its `workers-ai` route)
   * instead of the REST API. Same token, same response envelope. Takes
   * precedence over `baseUrl`.
   */
  gateway?: AiGatewayConfig;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_DECISION_MODEL = "@cf/cloudflare/clef-flash";

/**
 * DecisionModel over the Workers AI REST API. The orchestrator is a Node
 * service, so there is no `env.AI` binding; this calls
 * `POST /accounts/:id/ai/run/:model` with a bearer token instead, or the same
 * model through an AI Gateway when one is configured.
 */
export class WorkersAiDecisionModel implements DecisionModel {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  readonly model: string;

  constructor(private readonly config: WorkersAiDecisionModelConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.model = config.model ?? DEFAULT_DECISION_MODEL;
  }

  async decide<Q extends Record<string, DecisionQuestion>>(input: DecideInput<Q>): Promise<DecideResult<Q>> {
    const body: Record<string, unknown> = { state: input.state, questions: input.questions };
    // Clef requires a `model` selector ("clef" | "clef-flash") in the body.
    const clef = /^@cf\/cloudflare\/(clef(?:-flash)?)$/.exec(this.model);
    if (clef) body["model"] = clef[1];

    const url = this.config.gateway
      ? `${aiGatewayBaseUrl(this.config.gateway, "workers-ai")}/${this.model}`
      : `${this.baseUrl}/accounts/${this.config.accountId}/ai/run/${this.model}`;
    const res = await this.fetchImpl(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
          ...aiGatewayHeaders(this.config.gateway),
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Workers AI ${this.model} failed (${res.status}): ${err}`);
    }

    // The REST API wraps the model output in Cloudflare's { result, success } envelope.
    const json = (await res.json()) as { result?: { answers?: unknown }; answers?: unknown };
    const answers = json.result?.answers ?? json.answers;
    if (!answers || typeof answers !== "object") {
      throw new Error(`Workers AI ${this.model} returned no answers.`);
    }
    for (const id of Object.keys(input.questions)) {
      if (!(id in answers)) throw new Error(`Workers AI ${this.model} returned no answer for "${id}".`);
    }
    return answers as DecideResult<Q>;
  }
}
