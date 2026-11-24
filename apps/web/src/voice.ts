import type { VoiceProfile } from "@bardcast/domain";
import { useCallback, useEffect, useState } from "react";

/**
 * Orchestrator-backed voice-clone lifecycle (docs/hosting.md, docs/character-creation.md).
 *
 * One voice profile per player (keyed by DID on the orchestrator). Consent is a
 * real, revocable gate: granting consent persists to D1, training an IVC sends
 * the player's session-zero recordings (or arms auto-cloning on first campaign
 * reply), linking a PVC imports a private ElevenLabs share link, and revoking
 * deletes the model at ElevenLabs.
 */

const ORCHESTRATOR =
  (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

function headersFor(did: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["content-type"] = "application/json";
  if (did) headers["X-Acting-Did"] = did;
  return headers;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = ((await res.json().catch(() => ({}))) as { message?: string; error?: string }) || {};
  return body.message || body.error || fallback;
}

export function useVoiceClone(did: string) {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    fetch(`${ORCHESTRATOR}/api/voice`, {
      headers: headersFor(did),
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { profile: VoiceProfile | null };
        return data.profile ?? null;
      })
      .catch(() => null)
      .then((loaded) => {
        if (!cancelled) {
          setProfile(loaded);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [did]);

  /** Give consent and mark as unlinked (ready for IVC or PVC). */
  const startClone = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${ORCHESTRATOR}/api/voice/consent`, {
        method: "POST",
        headers: headersFor(did),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Could not save voice consent."));
      const data = (await res.json()) as { profile: VoiceProfile };
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save voice consent.");
    } finally {
      setBusy(false);
    }
  }, [did]);

  /** Train an Instant Voice Clone from the player's session-zero recordings (or arm auto-clone). */
  const trainIvc = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${ORCHESTRATOR}/api/voice/ivc`, {
        method: "POST",
        headers: headersFor(did, true),
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not build voice clone."));
      const data = (await res.json()) as { profile: VoiceProfile; trained: boolean; sampleCount: number };
      setProfile(data.profile);
      if (data.trained) {
        setNotice(
          data.sampleCount > 0
            ? `Built your voice clone from ${data.sampleCount} ${data.sampleCount === 1 ? "recording" : "recordings"}.`
            : "Your voice clone is active.",
        );
      } else {
        setNotice(
          "You're all set. No recordings yet — Bardcast will build your Instant Voice Clone automatically from your first spoken answer.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build voice clone.");
    } finally {
      setBusy(false);
    }
  }, [did]);

  /** Link a user-owned ElevenLabs shared Professional Voice Clone link. */
  const linkPvc = useCallback(
    async (sharingLink: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`${ORCHESTRATOR}/api/voice/pvc`, {
          method: "POST",
          headers: headersFor(did, true),
          credentials: "include",
          body: JSON.stringify({ sharingLink }),
        });
        if (!res.ok) throw new Error(await readError(res, "Could not link ElevenLabs voice."));
        const data = (await res.json()) as { profile: VoiceProfile };
        setProfile(data.profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not link ElevenLabs voice.");
      } finally {
        setBusy(false);
      }
    },
    [did],
  );

  /** Honour a consent revocation: delete the provider clone and unlink. */
  const revoke = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${ORCHESTRATOR}/api/voice`, {
        method: "DELETE",
        headers: headersFor(did),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readError(res, "Could not revoke voice clone."));
      const data = (await res.json()) as { profile: VoiceProfile };
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke voice clone.");
    } finally {
      setBusy(false);
    }
  }, [did]);

  return { profile, loading, busy, error, notice, startClone, trainIvc, linkPvc, revoke };
}
