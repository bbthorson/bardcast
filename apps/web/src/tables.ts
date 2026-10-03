import type { Prompt } from "@bardcast/domain";
import { useEffect, useState } from "react";
import { fetchCampaignPrompts, fetchUserCampaigns, type CampaignSummary } from "./api.js";

export interface Table extends CampaignSummary {
  /** Whether the signed-in player runs this table. */
  isDm: boolean;
  /** Newest first. */
  prompts: Prompt[];
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
          const prompts = await fetchCampaignPrompts(t.id);
          prompts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return { ...t, isDm: t.campaign.dm === did, prompts };
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

/** A player's character at a table is keyed by their DID (see JoinInvite). */
export function promptIsFor(prompt: Prompt, did: string): boolean {
  return prompt.audience.length === 0 || prompt.audience.some((uri) => uri.includes(did));
}
