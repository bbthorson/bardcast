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

  /** Give consent and open the profile for collecting samples. */
  const startClone = useCallback(() => {
    persist({ sampleReplies: [], status: "collecting", consent: true, createdAt: new Date().toISOString() });
  }, [persist]);

  /** Add one training sample; advance to training → ready at the threshold. */
  const addSample = useCallback(() => {
    setProfile((cur) => {
      if (!cur || !cur.consent) return cur;
      const sampleReplies = [
        ...cur.sampleReplies,
        `at://${did}/game.bardcast.voice.profile/sample-${cur.sampleReplies.length + 1}` as AtUri,
      ];
      const enough = sampleReplies.length >= SAMPLES_FOR_READY;
      const next: VoiceProfile = { ...cur, sampleReplies, status: enough ? "training" : "collecting" };
      try {
        localStorage.setItem(key(did), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (enough) {
        window.setTimeout(() => {
          persist({ ...next, status: "ready", modelRef: `stub-voice:${did}` });
        }, TRAIN_MS);
      }
      return next;
    });
  }, [did, persist]);

  /** Re-train from the current samples (ready → training → ready). */
  const retrain = useCallback(() => {
    setProfile((cur) => {
      if (!cur) return cur;
      const training: VoiceProfile = { ...cur, status: "training" };
      window.setTimeout(() => persist({ ...training, status: "ready", modelRef: `stub-voice:${did}` }), TRAIN_MS);
      return training;
    });
  }, [did, persist]);

  /** Honour a consent revocation: drop the model, mark the profile revoked. */
  const revoke = useCallback(() => {
    setProfile((cur) => {
      const next: VoiceProfile = {
        sampleReplies: [],
        status: "revoked",
        consent: false,
        createdAt: cur?.createdAt ?? new Date().toISOString(),
      };
      try {
        localStorage.setItem(key(did), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [did]);

  return { profile, startClone, addSample, retrain, revoke, samplesForReady: SAMPLES_FOR_READY };
}
