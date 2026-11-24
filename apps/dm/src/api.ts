import type {
  Campaign,
  CharacterProfile,
  Chapter,
  Prompt,
  PartyReadiness,
  ReadinessThresholds,
} from "@bardcast/domain";

export interface PromptSuggestion {
  title: string;
  scene: string;
  characterId: string;
  intent: "sheet" | "behavior" | "voice" | "story";
  rationale: string;
}

// Same-origin in production (served under `/dm/` on the `bardcast` Worker so
// the `bsky_sid` first-party cookie applies); local Vite dev talks to 127.0.0.1:8787.
const ORCHESTRATOR =
  (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

export interface DmSession {
  did: string;
  handle?: string | undefined;
}

export interface CampaignSummary {
  id: string;
  campaign: Campaign;
}

export interface CampaignDetail {
  id: string;
  campaign: Campaign;
  chapters: Chapter[];
  party: Array<{ player: string; id: string; profile: CharacterProfile | null }>;
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

export async function fetchSession(): Promise<DmSession | null> {
  try {
    const res = await fetch(`${ORCHESTRATOR}/atproto/session`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      authenticated?: boolean;
      did?: string;
      handle?: string;
      user?: { did?: string; handle?: string } | null;
    };
    const did = data.user?.did ?? (data.authenticated === false ? undefined : data.did);
    const handle = data.user?.handle ?? data.handle;
    return did ? { did, ...(handle ? { handle } : {}) } : null;
  } catch {
    return null;
  }
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
  thresholds?: Pick<ReadinessThresholds, "minConfidentTraits" | "minBehaviorExemplars" | "requireVoice">,
): Promise<PartyReadiness | null> {
  const params = new URLSearchParams();
  for (const c of characterIds) params.append("character", c);
  if (thresholds) {
    params.set("minTraits", String(thresholds.minConfidentTraits));
    params.set("minExemplars", String(thresholds.minBehaviorExemplars));
    params.set("requireVoice", String(thresholds.requireVoice));
  }
  try {
    const res = await fetch(
      `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/readiness?${params.toString()}`,
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

export async function createInviteApi(
  campaignId: string,
  actingDid?: string,
): Promise<{ code: string; campaignId: string }> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/invites`, {
    method: "POST",
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to generate invite code");
  }
  return (await res.json()) as { code: string; campaignId: string };
}

export async function syncCampaignApi(
  campaignId: string,
  actingDid?: string,
): Promise<{ promptsChecked: number; charactersSynced: number }> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/sync`, {
    method: "POST",
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to sync replies");
  }
  return (await res.json()) as { promptsChecked: number; charactersSynced: number };
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
  options?: {
    directorNote?: string;
    thresholds?: ReadinessThresholds;
    actingDid?: string;
  },
): Promise<{ chapter: Chapter }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options?.actingDid) headers["X-Acting-Did"] = options.actingDid;
  const res = await fetch(
    `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/chapters`,
    {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        characterIds,
        ...(options?.directorNote ? { directorNote: options.directorNote } : {}),
        ...(options?.thresholds ? { thresholds: options.thresholds } : {}),
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
