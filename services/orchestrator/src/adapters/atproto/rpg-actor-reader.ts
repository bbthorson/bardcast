import {
  RPG_ACTOR_EMOTE_STATES,
  RPG_ACTOR_SPRITE_DEFAULTS,
  RpgActorCollections,
  RpgActorEquipmentItem,
  RpgActorProfile,
  RpgActorSpriteEmoteRecord,
  RpgActorSpriteRecord,
  blobRefCid,
  extractRpgActorDndStats,
  isRecordUri,
  type RpgActorDndStats,
  type RpgActorEmoteState,
  type RpgActorSpriteEmoteView,
  type RpgActorSpriteView,
} from "@bardcast/domain";
import type { RpgActorReader } from "../../ports/rpg-actor-reader.js";

export interface AtprotoRpgActorReaderConfig {
  /** Base URL of the PLC directory for `did:plc:*` resolution. Defaults to `https://plc.directory`. */
  plcDirectoryUrl?: string;
  /** Base URL of the rpg.actor compendium API for indexed equipment. Defaults to `https://rpg.actor`. */
  rpgActorBaseUrl?: string;
  /** Custom fetch implementation (for testing or Cloudflare Workers binding). */
  fetchImpl?: typeof fetch;
}

interface DidDocService {
  id?: string;
  type?: string;
  serviceEndpoint?: string;
}

interface DidDocument {
  service?: DidDocService[];
}

/**
 * Reads a player's public `rpg.actor` records directly from their AT Protocol PDS
 * (and verified cross-game equipment from the rpg.actor compendium index).
 *
 * Requires no OAuth scopes and no rpg.actor API key: all records are public.
 */
export class AtprotoRpgActorReader implements RpgActorReader {
  private readonly plcUrl: string;
  private readonly rpgActorBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AtprotoRpgActorReaderConfig = {}) {
    this.plcUrl = (config.plcDirectoryUrl ?? "https://plc.directory").replace(/\/+$/, "");
    this.rpgActorBaseUrl = (config.rpgActorBaseUrl ?? "https://rpg.actor").replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  async readActor(did: `did:${string}`): Promise<RpgActorProfile | null> {
    const [pdsUrl, equipment] = await Promise.all([
      this.resolvePds(did),
      this.readEquipment(did),
    ]);

    let dnd: RpgActorDndStats | null = null;
    let sprite: RpgActorSpriteView | null = null;

    if (pdsUrl) {
      [dnd, sprite] = await Promise.all([
        this.readDndStats(pdsUrl, did),
        this.readSprite(pdsUrl, did),
      ]);
    }

    if (!dnd && !sprite && equipment.length === 0) {
      return null;
    }

    return RpgActorProfile.parse({
      did,
      ...(pdsUrl ? { pdsUrl } : {}),
      ...(dnd ? { dnd } : {}),
      ...(sprite ? { sprite } : {}),
      equipment,
    });
  }

  private async resolvePds(did: `did:${string}`): Promise<string | null> {
    let url: string | null = null;
    if (did.startsWith("did:plc:")) {
      url = `${this.plcUrl}/${encodeURIComponent(did)}`;
    } else if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      if (host) url = `https://${host}/.well-known/did.json`;
    }
    if (!url) return null;

    try {
      const res = await this.fetchImpl(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const doc = (await res.json()) as DidDocument;
      const pds = doc.service?.find(
        (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
      );
      return pds?.serviceEndpoint ? pds.serviceEndpoint.replace(/\/+$/, "") : null;
    } catch {
      return null;
    }
  }

  private async getRecord(
    pdsUrl: string,
    did: string,
    collection: string,
    rkey: string,
  ): Promise<unknown | null> {
    const qs = new URLSearchParams({ repo: did, collection, rkey });
    try {
      const res = await this.fetchImpl(`${pdsUrl}/xrpc/com.atproto.repo.getRecord?${qs}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { value?: unknown };
      return body.value ?? null;
    } catch {
      return null;
    }
  }

  private async readDndStats(pdsUrl: string, did: string): Promise<RpgActorDndStats | null> {
    // Current standard: per-system rkey (`actor.rpg.stats/dnd`).
    const perSystem = await this.getRecord(pdsUrl, did, RpgActorCollections.stats, "dnd");
    const extracted = extractRpgActorDndStats(perSystem);
    if (extracted) return extracted;

    // Fallback: legacy `actor.rpg.stats/self`.
    const legacy = await this.getRecord(pdsUrl, did, RpgActorCollections.stats, "self");
    return extractRpgActorDndStats(legacy);
  }

  private async readSprite(pdsUrl: string, did: string): Promise<RpgActorSpriteView | null> {
    const raw = await this.getRecord(pdsUrl, did, RpgActorCollections.sprite, "self");
    if (!raw) return null;

    const parsed = RpgActorSpriteRecord.safeParse(raw);
    if (!parsed.success) return null;

    const sheetCid = blobRefCid(parsed.data.spriteSheet);
    if (!sheetCid) return null;

    const blobUrl = (cid: string) =>
      `${pdsUrl}/xrpc/com.atproto.sync.getBlob?${new URLSearchParams({ did, cid })}`;

    const emotesRaw = parsed.data.emotes as Record<string, unknown> | undefined;
    const emotes: Partial<Record<RpgActorEmoteState, RpgActorSpriteEmoteView>> = {};
    if (emotesRaw && typeof emotesRaw === "object") {
      for (const state of RPG_ACTOR_EMOTE_STATES) {
        const entry = RpgActorSpriteEmoteRecord.safeParse(emotesRaw[state]);
        if (!entry.success) continue;
        const emoteCid = blobRefCid(entry.data.emoteSheet);
        if (!emoteCid) continue;
        const talkCid = blobRefCid(entry.data.talkSheet);
        emotes[state] = {
          ...(entry.data.label ? { label: entry.data.label } : {}),
          emoteUrl: blobUrl(emoteCid),
          ...(talkCid ? { talkUrl: blobUrl(talkCid) } : {}),
        };
      }
    }

    const source = parsed.data.source && isRecordUri(parsed.data.source) ? parsed.data.source : undefined;

    return {
      sheetUrl: blobUrl(sheetCid),
      frameWidth: parsed.data.frameWidth ?? RPG_ACTOR_SPRITE_DEFAULTS.frameWidth,
      frameHeight: parsed.data.frameHeight ?? RPG_ACTOR_SPRITE_DEFAULTS.frameHeight,
      columns: parsed.data.columns ?? RPG_ACTOR_SPRITE_DEFAULTS.columns,
      rows: parsed.data.rows ?? RPG_ACTOR_SPRITE_DEFAULTS.rows,
      ...(source ? { source } : {}),
      ...(Object.keys(emotes).length > 0 ? { emotes } : {}),
    };
  }

  private async readEquipment(did: string): Promise<RpgActorEquipmentItem[]> {
    const url = `${this.rpgActorBaseUrl}/api/equipment?${new URLSearchParams({ player: did })}`;
    try {
      const res = await this.fetchImpl(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return [];
      const body = (await res.json()) as { items?: unknown[]; equipment?: unknown[] } | unknown[];
      const rows = Array.isArray(body)
        ? body
        : Array.isArray(body?.items)
          ? body.items
          : Array.isArray(body?.equipment)
            ? body.equipment
            : [];

      const items: RpgActorEquipmentItem[] = [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const give = typeof r.give === "string" && isRecordUri(r.give) ? r.give : undefined;
        const parsed = RpgActorEquipmentItem.safeParse({
          item: r.item,
          title: r.title,
          ...(r.kind === "layer" || r.kind === "inventory" ? { kind: r.kind } : {}),
          ...(typeof r.category === "string" ? { category: r.category } : {}),
          ...(typeof r.description === "string" ? { description: r.description } : {}),
          ...(typeof r.context === "string" ? { context: r.context } : {}),
          provider: r.provider,
          ...(give ? { give } : {}),
          verified: typeof r.verified === "boolean" ? r.verified : Boolean(give),
          ...(typeof r.assetUrl === "string" ? { assetUrl: r.assetUrl } : {}),
          ...(typeof r.iconUrl === "string" ? { iconUrl: r.iconUrl } : {}),
        });
        if (parsed.success) items.push(parsed.data);
      }
      return items;
    } catch {
      return [];
    }
  }
}
