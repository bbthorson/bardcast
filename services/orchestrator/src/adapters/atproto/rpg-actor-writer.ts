import { RpgActorCollections } from "@bardcast/domain";
import { RpgActorWriteError, type RpgActorWriteResult, type RpgActorWriter } from "../../ports/rpg-actor-writer.js";

/** Minimal subset of `@atproto/oauth-client`'s `OAuthSession` needed for XRPC writes. */
export interface OAuthSessionLike {
  fetchHandler(pathname: string, init?: RequestInit): Promise<Response>;
}

export interface AtprotoRpgActorWriterConfig {
  /** Restore the player's authenticated AT Protocol OAuth session for PDS writes. */
  restoreSession: (did: string) => Promise<OAuthSessionLike | null>;
}

/**
 * Writes per-system `actor.rpg.stats/<system>` records to a player's own PDS
 * via their signed-in AT Protocol OAuth session (`com.atproto.repo.putRecord`).
 */
export class AtprotoRpgActorWriter implements RpgActorWriter {
  constructor(private readonly config: AtprotoRpgActorWriterConfig) {}

  async putSystemStats(input: {
    did: `did:${string}`;
    system: string;
    data: Record<string, unknown>;
    now: string;
  }): Promise<RpgActorWriteResult> {
    const session = await this.config.restoreSession(input.did);
    if (!session) {
      throw new RpgActorWriteError(
        "unauthorized",
        "Sign in with your AT Protocol account to sync to rpg.actor.",
      );
    }

    // Preserve existing createdAt when updating an existing per-system stats record.
    let existingCreatedAt: string | undefined;
    try {
      const qs = new URLSearchParams({
        repo: input.did,
        collection: RpgActorCollections.stats,
        rkey: input.system,
      });
      const existing = await session.fetchHandler(`/xrpc/com.atproto.repo.getRecord?${qs}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (existing.ok) {
        const body = (await existing.json()) as { value?: { createdAt?: unknown } };
        if (typeof body.value?.createdAt === "string") {
          existingCreatedAt = body.value.createdAt;
        }
      }
    } catch {
      // Ignore read errors; fall back to `now` for createdAt.
    }

    const record = {
      $type: RpgActorCollections.stats,
      system: input.system,
      data: input.data,
      createdAt: existingCreatedAt ?? input.now,
      updatedAt: input.now,
    };

    const res = await session.fetchHandler("/xrpc/com.atproto.repo.putRecord", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        repo: input.did,
        collection: RpgActorCollections.stats,
        rkey: input.system,
        record,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.status === 401) {
        throw new RpgActorWriteError("unauthorized", "Your AT Protocol session expired; sign in again.");
      }
      if (res.status === 403 || errBody.error === "InvalidScope" || errBody.error === "InsufficientScope") {
        throw new RpgActorWriteError(
          "scope_missing",
          "Sign out and back in to grant permission to write actor.rpg.stats on your PDS.",
        );
      }
      throw new RpgActorWriteError(
        "upstream",
        errBody.message || errBody.error || `PDS putRecord failed (${res.status})`,
      );
    }

    const written = (await res.json()) as { uri: string; cid: string };
    return {
      uri: written.uri,
      cid: written.cid,
      system: input.system,
    };
  }
}
