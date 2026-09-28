import type {
  Campaign,
  CharacterProfile,
  Chapter,
  Prompt,
  PartyReadiness,
} from "@bardcast/domain";

export interface PromptSuggestion {
  title: string;
  scene: string;
  characterId: string;
  intent: "sheet" | "behavior" | "voice" | "story";
  rationale: string;
}

const ORCHESTRATOR =
  (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ?? "http://localhost:8787";

export interface CampaignSummary {
  id: string;
  campaign: Campaign;
}

export interface CampaignDetail {
  id: string;
  campaign: Campaign;
  chapters: Chapter[];
  party: Array<{ id: string; profile: CharacterProfile | null }>;
}

export interface PublishPromptParams {
  campaignId: string;
  title: string;
  scene?: string | undefined;
  audience?: string[] | undefined;
  audienceDids?: string[] | undefined;
  intent?: ("sheet" | "behavior" | "voice" | "story") | undefined;
  dmDid?: string | undefined;
}

export async function fetchCampaigns(actingDid?: string): Promise<CampaignSummary[]> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/campaigns`, {
      headers,
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { campaigns: CampaignSummary[] };
    return data.campaigns ?? [];
  } catch {
    return [];
  }
}

export async function fetchCampaignDetail(campaignId: string): Promise<CampaignDetail | null> {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as CampaignDetail;
  } catch {
    return null;
  }
}

export async function fetchReadiness(
  campaignId: string,
  characterIds: string[],
): Promise<PartyReadiness | null> {
  const query = characterIds.map((c) => `character=${encodeURIComponent(c)}`).join("&");
  try {
    const res = await fetch(
      `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/readiness?${query}`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    return (await res.json()) as PartyReadiness;
  } catch {
    return null;
  }
}

export async function fetchPrompts(campaignId: string): Promise<Prompt[]> {
  try {
    const res = await fetch(
      `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/prompts`,
      { credentials: "include" },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { prompts: Prompt[] };
    return data.prompts ?? [];
  } catch {
    return [];
  }
}

export async function fetchSuggestedPrompts(
  campaignId: string,
  characterIds: string[],
): Promise<PromptSuggestion[]> {
  const query = characterIds.map((c) => `character=${encodeURIComponent(c)}`).join("&");
  try {
    const res = await fetch(
      `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/suggested-prompts?${query}`,
      { credentials: "include" },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions: PromptSuggestion[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

export async function publishPromptApi(
  params: PublishPromptParams,
  actingDid?: string,
): Promise<Prompt> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(
    `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(params.campaignId)}/prompts`,
    {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        title: params.title,
        ...(params.scene ? { scene: params.scene } : {}),
        audience: params.audience ?? [],
        audienceDids: params.audienceDids ?? [],
        intent: params.intent ?? "story",
        ...(params.dmDid ? { dmDid: params.dmDid } : {}),
      }),
    },
  );
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to publish prompt");
  }
  return (await res.json()) as Prompt;
}

export async function generateChapterApi(
  campaignId: string,
  characterIds: string[],
  directorNote?: string,
): Promise<{ chapter: Chapter }> {
  const res = await fetch(
    `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/chapters`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        characterIds,
        ...(directorNote ? { directorNote } : {}),
      }),
    },
  );
  if (res.status === 409) {
    const err = ((await res.json().catch(() => ({}))) as { error?: string }) || {};
    throw new Error(err.error === "not_ready" ? "The party is not ready yet" : "Readiness conflict");
  }
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to generate chapter");
  }
  return (await res.json()) as { chapter: Chapter };
}
