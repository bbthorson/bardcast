/**
 * A "System One" decision model: reads a state and a set of typed questions,
 * returns calibrated probabilities over the options we defined. It never writes
 * text. Cloudflare's Clef and TypeSafe's Jev share this request shape, so an
 * adapter swaps between them by changing the model, not the call site.
 *
 * Use it where the loop needs a choice among known options (trait inference,
 * later action choice in Resolve). Prose and dialogue stay with the
 * NarrativeWriter.
 */

/** Yes/no. Answer is the probability of yes. */
export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

/** Pick one of the listed options (2–255). `criteria` maps option key → meaning. */
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

/** Rate against an ordered rubric (2–10 levels, lowest first). */
export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  /** Probability the answer is yes, 0..1. */
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  /** 0..1. */
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  /** Probability-weighted level index (0 = first criterion). */
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export type DecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface DecideInput<Q extends Record<string, DecisionQuestion>> {
  /** What to evaluate: text, or structured data the model reads as JSON. */
  state: string | Record<string, unknown> | unknown[];
  /** 1–64 questions, keyed by id. Answers come back under the same ids. */
  questions: Q;
}

export type DecideResult<Q extends Record<string, DecisionQuestion>> = {
  [K in keyof Q]: Q[K] extends ChoiceQuestion
    ? ChoiceAnswer
    : Q[K] extends ScoreQuestion
      ? ScoreAnswer
      : NoulAnswer;
};

export interface DecisionModel {
  decide<Q extends Record<string, DecisionQuestion>>(input: DecideInput<Q>): Promise<DecideResult<Q>>;
}
