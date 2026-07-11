import { color, font } from "@bardcast/brand";
import type { VoiceProfile } from "@bardcast/domain";
import { useAudioRecorder } from "../useAudioRecorder.js";
import { styles } from "../ui.js";

interface VoiceActions {
  profile: VoiceProfile | null;
  startClone: () => void;
  addSample: () => void;
  retrain: () => void;
  revoke: () => void;
  samplesForReady: number;
}

/**
 * Voice-clone management. Full lifecycle over the domain `VoiceProfile`:
 * consent → collect samples → training → ready, plus retrain and revoke. Consent
 * is a real gate (docs/hosting.md: ElevenLabs requires it before a clone exists).
 * We capture real mic audio for the feel of it, but the stub only counts samples;
 * no audio leaves the browser.
 */
export function VoiceClone({ profile, startClone, addSample, retrain, revoke, samplesForReady, onBack }: VoiceActions & { onBack: () => void }) {
  const status = profile?.status ?? null;

  return (
    <div style={styles.page}>
      <button style={styles.ghost} onClick={onBack}>← Back to your table</button>
      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Your voice clone</h1>
      <p style={styles.muted}>
        Your recorded replies train a model of your voice, so chapters can be told back to you in it.
        You're always in control — revoke consent and the model is deleted.
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        {(status === null || status === "revoked") && <ConsentGate revoked={status === "revoked"} onConsent={startClone} />}
        {status === "collecting" && <Collecting have={profile!.sampleReplies.length} need={samplesForReady} onAdd={addSample} />}
        {status === "training" && <Training />}
        {status === "ready" && <Ready profile={profile!} onRetrain={retrain} onDone={onBack} />}
      </div>

      {profile && profile.consent && (
        <div style={{ marginTop: "2rem", borderTop: `1px solid ${color.walnutRaised}`, paddingTop: "1rem" }}>
          <button style={styles.danger} onClick={revoke}>Revoke consent &amp; delete my voice</button>
        </div>
      )}
    </div>
  );
}

function ConsentGate({ revoked, onConsent }: { revoked: boolean; onConsent: () => void }) {
  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>{revoked ? "Start over" : "Consent to a voice clone"}</h2>
      <p style={styles.muted}>
        {revoked
          ? "Your previous voice was deleted. You can build a new one whenever you're ready."
          : "We'll only ever store an opaque model reference and this consent — never your raw audio or any biometric data. You can revoke at any time."}
      </p>
      {/* The one ember action on this screen. */}
      <button style={{ ...styles.ember, marginTop: "0.5rem" }} onClick={onConsent}>
        I consent — start my voice clone
      </button>
    </article>
  );
}

function Collecting({ have, need, onAdd }: { have: number; need: number; onAdd: () => void }) {
  const { state, durationMs, blob, error, start, stop, reset } = useAudioRecorder();
  const pct = Math.min(1, have / need);

  function add() {
    onAdd();
    reset();
  }

  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>Collect a few samples</h2>
      <p style={styles.muted}>
        Read a line or just talk for a moment — {need} short clips is enough to get started.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", margin: "0.75rem 0 0.35rem" }}>
        <span>Samples</span>
        <span style={{ fontFamily: font.mono, color: color.candleGold }}>{have} / {need}</span>
      </div>
      <div style={{ height: 8, background: color.walnut, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round(pct * 100)}%`, background: color.candleGold }} />
      </div>

      <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {state === "recording" ? (
          <button style={{ ...styles.ember, background: color.hearthRed, color: color.parchment }} onClick={stop}>
            Stop ({Math.floor(durationMs / 1000)}s)
          </button>
        ) : blob ? (
          <div style={styles.row}>
            <button style={{ ...styles.secondary, flex: 1 }} onClick={reset}>Re-record</button>
            {/* Once there's a take, adding it is the next action. */}
            <button style={{ ...styles.ember, flex: 2 }} onClick={add}>Add this sample</button>
          </div>
        ) : (
          <button style={styles.ember} onClick={start}>Record a sample</button>
        )}
        {error && <p style={{ color: color.hearthRed, fontSize: "0.85rem", margin: 0 }}>{error}</p>}
      </div>
    </article>
  );
}

function Training() {
  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>Training your voice…</h2>
      <p style={styles.muted}>This takes a moment. We'll mark it ready as soon as the model is built.</p>
      <div style={{ marginTop: "1rem", height: 8, background: color.walnut, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "66%", background: color.candleGold, opacity: 0.7 }} />
      </div>
    </article>
  );
}

function Ready({ profile, onRetrain, onDone }: { profile: VoiceProfile; onRetrain: () => void; onDone: () => void }) {
  return (
    <article style={{ ...styles.card, borderColor: color.moss, borderWidth: 1, borderStyle: "solid" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: color.moss }} />
        <h2 style={{ ...styles.h2, margin: 0 }}>Your voice is ready</h2>
      </div>
      <p style={{ ...styles.muted, marginTop: "0.75rem" }}>
        Chapters can now be told in your voice. Trained on {profile.sampleReplies.length} samples.
      </p>
      <p style={{ ...styles.muted, fontSize: "0.78rem" }}>
        model <span style={{ fontFamily: font.mono, color: color.candleGold }}>{profile.modelRef}</span>
      </p>
      <div style={{ ...styles.row, marginTop: "1rem" }}>
        <button style={styles.secondary} onClick={onRetrain}>Re-train</button>
        {/* Nothing is pressing here — the lit action is simply "done". */}
        <button style={styles.ember} onClick={onDone}>Done</button>
      </div>
    </article>
  );
}
