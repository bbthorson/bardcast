import type { Chapter, PartyReadiness, Prompt } from "@bardcast/domain";
import { useEffect, useState } from "react";
import {
  fetchCampaignDetail,
  fetchCampaignPrompts,
  fetchPartyReadiness,
  fetchUserCampaigns,
  type CampaignSummary,
} from "./api.js";

export interface Table extends CampaignSummary {
  /** Whether the signed-in player runs this table. */
  isDm: boolean;
  /** Newest first. */
  prompts: Prompt[];
  chapters: Chapter[];
  /** Null when the orchestrator couldn't say. */
  readiness: PartyReadiness | null;
}

/**
 * The signed-in player's tables with their prompts, loaded once for the shell
 * so all three tabs read the same list.
 */
export function useTables(did: string): { tables: Table[]; loading: boolean } {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const list = await fetchUserCampaigns(did);
      const withPrompts = await Promise.all(
        list.map(async (t): Promise<Table> => {
          const characterIds = t.campaign.party.map((uri) => uri.replace(/^at:\/\//, ""));
          const [prompts, detail, readiness] = await Promise.all([
            fetchCampaignPrompts(t.id),
            fetchCampaignDetail(t.id),
            characterIds.length > 0 ? fetchPartyReadiness(t.id, characterIds) : Promise.resolve(null),
          ]);
          prompts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return { ...t, isDm: t.campaign.dm === did, prompts, chapters: detail?.chapters ?? [], readiness };
        }),
      );
      if (!cancelled) {
        setTables(withPrompts);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [did]);

  return { tables, loading };
}

/**
 * Where a table is in its story, in one line: chapters told, and how close the
 * next one is (characters whose replies have cleared the readiness gate).
 */
export function whereYouAre(t: Table): string {
  const told = t.chapters.filter((c) => c.status === "ready").length;
  const inFlight = t.chapters.some((c) => c.status === "writing" || c.status === "rendering");
  const next = told + 1;
  if (t.campaign.party.length === 0) return t.isDm ? "Invite your players to join" : "Waiting for players to join";
  if (inFlight) return `Ch. ${next} being told now`;
  if (t.prompts.length === 0) {
    const waiting = t.isDm ? "your players are waiting on your question" : "waiting on the DM's question";
    return told === 0 ? waiting[0]!.toUpperCase() + waiting.slice(1) : `${told} told · ${waiting}`;
  }
  const total = t.campaign.party.length;
  const ready = t.readiness ? total - t.readiness.blocking.length : null;
  const gathering = ready === null ? "gathering voices" : t.readiness?.ready ? "ready to tell" : `${ready} of ${total} voices in`;
  return `${told > 0 ? `${told} told · ` : ""}Ch. ${next}: ${gathering}`;
}

/** A player's character at a table is keyed by their DID (see JoinInvite). */
export function promptIsFor(prompt: Prompt, did: string): boolean {
  return prompt.audience.length === 0 || prompt.audience.some((uri) => uri.includes(did));
}
