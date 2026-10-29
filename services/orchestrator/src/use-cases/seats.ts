import { joinCampaign, type CampaignSeat, type CharacterProfile } from "@bardcast/domain";
import type { CoreServices } from "../ports/index.js";
import { currentSheet } from "./sheets.js";

/**
 * Taking a seat (docs/character-creation.md, "Joining"): a player brings one
 * of their own characters to a table, and the table branches a seat from that
 * character's current sheet, reset to the table's starting level. The party
 * lists players; which character each one brought is on their seat.
 */

export class SeatError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "conflict",
  ) {
    super(message);
    this.name = "SeatError";
  }
}

export interface PartyMember {
  /** The player. */
  player: `did:${string}`;
  /** Their character at this table. A player who joined before choosing one is keyed by their DID. */
  id: string;
  profile: CharacterProfile | null;
  seat: CampaignSeat | null;
}

/** The player's character at this table, if they've taken a seat. */
export async function seatOf(
  svc: CoreServices,
  campaignId: string,
  did: string,
): Promise<{ characterId: string; seat: CampaignSeat; profile: CharacterProfile } | null> {
  for (const { characterId, seat } of await svc.store.listSeats(campaignId)) {
    const profile = await svc.store.getCharacter(characterId);
    if (profile?.player === did) return { characterId, seat, profile };
  }
  return null;
}

/** Every player at the table and the character they brought. */
export async function partyOf(svc: CoreServices, campaignId: string): Promise<PartyMember[]> {
  const campaign = await svc.store.getCampaign(campaignId);
  if (!campaign) return [];
  return Promise.all(
    campaign.party.map(async (uri): Promise<PartyMember> => {
      const player = uri.replace(/^at:\/\//, "") as `did:${string}`;
      const seated = await seatOf(svc, campaignId, player);
      if (seated) return { player, id: seated.characterId, profile: seated.profile, seat: seated.seat };
      // Before character creation, a player's character was keyed by their DID.
      return { player, id: player, profile: await svc.store.getCharacter(player), seat: await svc.store.getSeat(campaignId, player) };
    }),
  );
}

/**
 * Sit `characterId` down at the table. The player joins the party if they
 * weren't in it. One seat per player per table: bringing the same character
 * again is a no-op, bringing a different one is refused.
 */
export async function takeSeat(
  svc: CoreServices,
  input: { campaignId: string; did: `did:${string}`; characterId: string },
): Promise<{ characterId: string; seat: CampaignSeat }> {
  const campaign = await svc.store.getCampaign(input.campaignId);
  if (!campaign) throw new SeatError(`no campaign ${input.campaignId}`, "not_found");
  const profile = await svc.store.getCharacter(input.characterId);
  if (!profile) throw new SeatError(`no character ${input.characterId}`, "not_found");
  if (profile.player !== input.did) throw new SeatError("that character belongs to another player", "forbidden");

  const existing = await seatOf(svc, input.campaignId, input.did);
  if (existing) {
    if (existing.characterId === input.characterId) return { characterId: existing.characterId, seat: existing.seat };
    throw new SeatError(`you're already at this table as ${existing.profile.displayName}`, "conflict");
  }

  const current = await currentSheet(svc, input.characterId);
  if (!current) throw new SeatError(`${profile.displayName} has no sheet yet`, "conflict");

  const seat = joinCampaign({
    campaign: `at://${input.campaignId}`,
    sheet: current.sheet,
    sheetRef: current.ref,
    startingLevel: campaign.startingLevel ?? 1,
    ...(campaign.gearPolicy ? { gearPolicy: campaign.gearPolicy } : {}),
    // TODO(bardcast): the table's starting kit, from the class and background kits in @bardcast/srd.
    startingKit: [],
    createdAt: svc.clock().toISOString(),
  });
  await svc.store.putSeat(input.campaignId, input.characterId, seat);

  const playerUri = `at://${input.did}` as const;
  if (!campaign.party.includes(playerUri)) {
    await svc.store.putCampaign(input.campaignId, { ...campaign, party: [...campaign.party, playerUri] });
  }
  return { characterId: input.characterId, seat };
}

/** The player's own characters that can take a seat: saved, with a sheet. */
export async function charactersOf(
  svc: CoreServices,
  did: string,
): Promise<Array<{ id: string; profile: CharacterProfile; level: number }>> {
  const made = (await svc.store.listCreations(did)).flatMap(({ creation }) => (creation.character ? [creation.character] : []));
  const out: Array<{ id: string; profile: CharacterProfile; level: number }> = [];
  for (const id of made) {
    const [profile, sheet] = await Promise.all([svc.store.getCharacter(id), currentSheet(svc, id)]);
    if (profile?.player === did && sheet) out.push({ id, profile, level: 1 + sheet.sheet.advancements.length });
  }
  return out;
}
