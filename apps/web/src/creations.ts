import type { AbilityScores, BackgroundIncreases, Creation, CreationStep } from "@bardcast/domain";

/**
 * The web side of session zero (docs/character-creation.md): the
 * orchestrator's `/api/creations` routes. Every call acts as the signed-in
 * player; the X-Acting-Did header only counts against the dev stub sign-in.
 */

// In production the orchestrator shares this Worker's origin (root wrangler.jsonc).
const ORCHESTRATOR =
  (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

export interface CreationView {
  id: string;
  creation: Creation;
  next: CreationStep;
}

export type CardLine =
  | { field: "concept" }
  | { field: "quote" }
  | { field: "quirk"; index: number }
  | { field: "drive"; index: number };

async function call<T>(did: string, path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Acting-Did": did };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${ORCHESTRATOR}${path}`, {
    method: init.method ?? "GET",
    headers,
    credentials: "include",
    ...(init.form ? { body: init.form } : init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Something went wrong (${res.status}).`);
  }
  return (await res.json()) as T;
}

const at = (id: string) => `/api/creations/${encodeURIComponent(id)}`;

export const creations = {
  list: (did: string) => call<{ creations: CreationView[] }>(did, "/api/creations").then((r) => r.creations),
  start: (did: string) => call<CreationView>(did, "/api/creations", { method: "POST" }),
  get: (did: string, id: string) => call<CreationView>(did, at(id)),
  answer(did: string, id: string, answer: { audio?: Blob; text?: string }) {
    if (answer.audio) {
      const form = new FormData();
      form.append("audio", answer.audio, "answer.webm");
      if (answer.text) form.append("text", answer.text);
      return call<CreationView>(did, `${at(id)}/answer`, { method: "POST", form });
    }
    return call<CreationView>(did, `${at(id)}/answer`, { method: "POST", json: { text: answer.text } });
  },
  advance: (did: string, id: string) => call<CreationView>(did, `${at(id)}/advance`, { method: "POST" }),
  pick: (did: string, id: string, attribute: string, value: string) =>
    call<CreationView>(did, `${at(id)}/pick`, { method: "POST", json: { attribute, value } }),
  name: (did: string, id: string, name: string) => call<CreationView>(did, `${at(id)}/name`, { method: "POST", json: { name } }),
  propose: (did: string, id: string) => call<CreationView>(did, `${at(id)}/propose`, { method: "POST" }),
  revise: (did: string, id: string, line: CardLine) => call<CreationView>(did, `${at(id)}/revise`, { method: "POST", json: { line } }),
  confirm: (did: string, id: string, abilities: AbilityScores, backgroundIncreases: BackgroundIncreases) =>
    call<CreationView & { characterId: string }>(did, `${at(id)}/confirm`, {
      method: "POST",
      json: { abilities, backgroundIncreases },
    }),
  /** A fresh, short-lived link to hear the narrator ask question `turn`. Play it at once; don't keep it. */
  questionAudio: (did: string, id: string, turn: number) =>
    call<{ url: string }>(did, `${at(id)}/turns/${turn}/audio`).then((r) => r.url),
};
