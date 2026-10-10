import type {
  Campaign,
  CharacterProfile,
  CampaignSeat,
  CharacterSheet,
  BehaviorModel,
  VoiceProfile,
  Prompt,
  PartyReadiness,
  Chapter,
} from "@bardcast/domain";

// In production the orchestrator shares this Worker's origin (root wrangler.jsonc),
// so the default is a relative URL; `vite dev` talks to the local Node service.
const ORCHESTRATOR =
  (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

export interface CreateCampaignParams {
  title: string;
  premise?: string;
  calendar?: string;
}

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

export interface CharacterDetailResponse {
  characterId: string;
  profile: CharacterProfile;
  /** The player's own sheet, the same at every table. */
  sheet: CharacterSheet | null;
  /** This campaign's seat: the sheet as played here, and what replies here taught us. */
  seat: CampaignSeat | null;
  behavior: BehaviorModel | null;
  voice: VoiceProfile | null;
}

export async function fetchUserCampaigns(actingDid?: string): Promise<CampaignSummary[]> {
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

export async function createCampaignApi(
  params: CreateCampaignParams,
  actingDid?: string,
): Promise<{ id: string; campaign: Campaign }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/campaigns`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to create campaign");
  }
  return (await res.json()) as { id: string; campaign: Campaign };
}

export async function createInviteApi(
  campaignId: string,
  actingDid?: string,
): Promise<{ code: string }> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${campaignId}/invites`, {
    method: "POST",
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to create invite");
  }
  return (await res.json()) as { code: string };
}

export async function joinCampaignApi(
  code: string,
  actingDid?: string,
): Promise<{ campaignId: string; campaign: Campaign }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/campaigns/join`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to join campaign");
  }
  return (await res.json()) as { campaignId: string; campaign: Campaign };
}

export async function fetchCampaignDetail(campaignId: string): Promise<CampaignDetail | null> {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${campaignId}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as CampaignDetail;
  } catch {
    return null;
  }
}

export async function fetchCharacterDetail(
  campaignId: string,
  characterId: string,
): Promise<CharacterDetailResponse | null> {
  try {
    const res = await fetch(
      `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    return (await res.json()) as CharacterDetailResponse;
  } catch {
    return null;
  }
}

export async function fetchCampaignPrompts(campaignId: string): Promise<Prompt[]> {
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

export async function fetchPartyReadiness(
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
