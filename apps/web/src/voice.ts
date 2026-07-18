import type { AtUri, VoiceProfile } from "@bardcast/domain";
import { useCallback, useEffect, useState } from "react";

/**
 * Client-side stub of the voice-clone lifecycle. Mirrors the orchestrator's
 * `VoiceCloner` port and `StubVoiceCloner`: a voice advances
 * collecting → training → ready once it has enough samples, and consent is a
 * real, revocable gate (docs/hosting.md — ElevenLabs requires it). We store only
 * the `VoiceProfile` shape (a modelRef + consent + sample URIs), never raw audio.
 *
 * TODO(bardcast): replace this with calls to the orchestrator — `train` on add,
 * `status` polling while training, `revoke` on revoke — uploading each sample to
 * vox-pop-core and passing its reply AT-URI here. This hook keeps the front door
 * walkable until those endpoints exist.
 */

const SAMPLES_FOR_READY = 3; // matches StubVoiceCloner.SAMPLES_FOR_READY
const TRAIN_MS = 1500; // pretend the provider takes a moment
const key = (did: string) => `bardcast.web.voice.${did}`;

function load(did: string): VoiceProfile | null {
  try {
    const raw = localStorage.getItem(key(did));
    return raw ? (JSON.parse(raw) as VoiceProfile) : null;
  } catch {
    return null;
  }
}

export function useVoiceClone(did: string) {
  const [profile, setProfile] = useState<VoiceProfile | null>(() => load(did));

  useEffect(() => {
    setProfile(load(did));
  }, [did]);

  const persist = useCallback(
    (next: VoiceProfile | null) => {
      setProfile(next);
      try {
        if (next) localStorage.setItem(key(did), JSON.stringify(next));
        else localStorage.removeItem(key(did));
      } catch {
        /* private mode — state lives only in memory */
      }
    },
    [did],
  );

  /** Give consent and mark as unlinked. */
  const startClone = useCallback(() => {
    persist({ status: "unlinked", consent: true, createdAt: new Date().toISOString() });
  }, [persist]);

  /** Link a user-owned ElevenLabs shared voice link. */
  const linkPvc = useCallback(
    (sharingLink: string) => {
      if (!profile || !profile.consent) return;
      persist({
        ...profile,
        status: "pvc",
        modelRef: `elevenlabs:${sharingLink.split("/").pop() || "unknown"}`,
      });
    },
    [profile, persist],
  );

  /** Backend creates/assigns an IVC automatically. */
  const setIvc = useCallback(
    (voiceId: string) => {
      if (!profile || !profile.consent) return;
      persist({
        ...profile,
        status: "ivc",
        modelRef: `elevenlabs-ivc:${voiceId}`,
      });
    },
    [profile, persist],
  );

  /** Honour a consent revocation: drop the model, mark the profile unlinked/revoked. */
  const revoke = useCallback(() => {
    persist({
      status: "unlinked",
      consent: false,
      createdAt: profile?.createdAt ?? new Date().toISOString(),
    });
  }, [profile, persist]);

  return { profile, startClone, linkPvc, setIvc, revoke };
}

