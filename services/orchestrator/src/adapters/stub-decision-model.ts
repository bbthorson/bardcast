import type {
  DecideInput,
  DecideResult,
  DecisionAnswer,
  DecisionModel,
  DecisionQuestion,
} from "../ports/decision-model.js";

/**
 * Stub DecisionModel — answers every question with no signal: uniform
 * probabilities, the first option, and the matching (low) confidence. Keeps
 * local dev and tests offline; nothing it returns clears the readiness gate.
 */
export class StubDecisionModel implements DecisionModel {
  async decide<Q extends Record<string, DecisionQuestion>>(input: DecideInput<Q>): Promise<DecideResult<Q>> {
    const answers: Record<string, DecisionAnswer> = {};
    for (const [id, q] of Object.entries(input.questions)) {
      answers[id] = noSignal(q);
    }
    return answers as DecideResult<Q>;
  }
}

function noSignal(q: DecisionQuestion): DecisionAnswer {
  switch (q.type) {
    case "noul":
      return { type: "noul", noul: 0.5 };
    case "choice": {
      const keys = Object.keys(q.criteria);
      const p = 1 / keys.length;
      return {
        type: "choice",
        choice: keys[0]!,
        confidence: p,
        probabilities: Object.fromEntries(keys.map((k) => [k, p])),
      };
    }
    case "score": {
      const p = 1 / q.criteria.length;
      return {
        type: "score",
        score: (q.criteria.length - 1) / 2,
        confidence: p,
        probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), p])),
      };
    }
  }
}
