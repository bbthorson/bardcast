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
  RpgActorProfile,
  RpgActorImportDraft,
  SrdClass,
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
  /** Each player, and their character at this table (keyed by their DID if they haven't brought one). */
  party: Array<{ player: string; id: string; profile: CharacterProfile | null }>;
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

export interface InvitePreview {
  campaignId: string;
  title: string;
  startingLevel: number;
  /** The DM's note to players choosing who to bring. */
  characterGuidance?: string;
}

/** Where an invite leads, before joining. Null when the code isn't one. */
export async function fetchInvite(code: string, actingDid?: string): Promise<InvitePreview | null> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/invites/${encodeURIComponent(code)}`, { headers, credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Couldn't reach the table just now.");
  return (await res.json()) as InvitePreview;
}

export interface MyCharacter {
  id: string;
  profile: CharacterProfile;
  level: number;
}

/** The signed-in player's characters that can take a seat. */
export async function fetchMyCharacters(actingDid?: string): Promise<MyCharacter[]> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/characters`, { headers, credentials: "include" });
  if (!res.ok) throw new Error("Couldn't find your characters just now.");
  return ((await res.json()) as { characters: MyCharacter[] }).characters;
}

export async function joinCampaignApi(
  code: string,
  actingDid?: string,
  characterId?: string,
): Promise<{ campaignId: string; campaign: Campaign; characterId?: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/campaigns/join`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ code, ...(characterId ? { characterId } : {}) }),
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Failed to join campaign");
  }
  return (await res.json()) as { campaignId: string; campaign: Campaign; characterId?: string };
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

export async function submitPromptReplyApi(
  params: {
    campaignId: string;
    characterId: string;
    promptUri: string;
    intent?: "sheet" | "behavior" | "voice" | "story";
    audio: Blob;
    text?: string;
  },
  actingDid?: string,
): Promise<{ success: boolean; replyUri: string }> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const form = new FormData();
  form.append("audio", params.audio, "reply.webm");
  form.append("promptUri", params.promptUri);
  form.append("intent", params.intent ?? "story");
  if (params.text?.trim()) form.append("text", params.text.trim());

  const res = await fetch(
    `${ORCHESTRATOR}/api/campaigns/${encodeURIComponent(params.campaignId)}/characters/${encodeURIComponent(params.characterId)}/reply`,
    {
      method: "POST",
      headers,
      credentials: "include",
      body: form,
    },
  );
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string; error?: string }) || {};
    throw new Error(err.message || err.error || "Could not send your reply to the table.");
  }
  return (await res.json()) as { success: boolean; replyUri: string };
}

export interface RpgActorLookupResponse {
  actor: RpgActorProfile | null;
  importDraft: RpgActorImportDraft | null;
}

export async function fetchMyRpgActor(actingDid?: string): Promise<RpgActorLookupResponse> {
  const headers: Record<string, string> = {};
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/rpg-actor/me`, {
      headers,
      credentials: "include",
    });
    if (!res.ok) return { actor: null, importDraft: null };
    return (await res.json()) as RpgActorLookupResponse;
  } catch {
    return { actor: null, importDraft: null };
  }
}

export async function importRpgActorApi(
  params: { displayName: string; class?: SrdClass },
  actingDid?: string,
): Promise<{ characterId: string; profile: CharacterProfile; notes: string[] }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/rpg-actor/import`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Could not import your rpg.actor character.");
  }
  return (await res.json()) as { characterId: string; profile: CharacterProfile; notes: string[] };
}

export async function syncToRpgActorApi(
  characterId: string,
  actingDid?: string,
): Promise<{ characterId: string; synced: Array<{ uri: string; cid: string; system: string }> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (actingDid) headers["X-Acting-Did"] = actingDid;
  const res = await fetch(`${ORCHESTRATOR}/api/rpg-actor/sync`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
    throw new Error(err.message || "Could not sync to rpg.actor.");
  }
  return (await res.json()) as { characterId: string; synced: Array<{ uri: string; cid: string; system: string }> };
}
