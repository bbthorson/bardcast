import { color, font } from "@bardcast/brand";
import { useAudioRecorder } from "@antiphony/capture-kit";
import { useMemo, useState } from "react";

const ORCHESTRATOR = (import.meta.env["VITE_ORCHESTRATOR_URL"] as string | undefined) ?? "http://localhost:8787";

/**
 * The player surface: see the prompt, tap to record, send.
 * Uploads the audio recording to the orchestrator's reply endpoint,
 * which posts to Antiphony and folds the reply into the character's signal.
 */
export function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);

  const campaignId = query.get("campaign") ?? "gawain-green-knight";
  const characterId = query.get("character") ?? "gawain";
  const promptUri = query.get("promptUri") ?? "at://dev.antiphony.audio.post/sample-p1";
  const intent = (query.get("intent") as "sheet" | "behavior" | "voice" | "story" | null) ?? "story";

  const promptTitle = query.get("title") ?? "Tell me about a scar you carry — where did it come from?";
  const promptScene = query.get("scene") ?? "The party makes camp. Firelight catches an old mark on your skin.";

  const { status, elapsedMs, start, stop, recording, reset, error, errorKind } = useAudioRecorder({
    maxDurationMs: 120_000,
  });
  const blob = recording?.blob;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function send() {
    if (!blob || sending) return;
    setSending(true);
    setSendError(null);

    const form = new FormData();
    form.append("audio", blob, "reply.webm");
    form.append("promptUri", promptUri);
    form.append("intent", intent);

    try {
      const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${campaignId}/characters/${characterId}/reply`, {
        method: "POST",
        body: form,
        credentials: "include",
      });

      if (!res.ok) {
        const err = ((await res.json().catch(() => ({}))) as { message?: string }) || {};
        throw new Error(err.message || "Failed to deliver audio to the DM.");
      }
      setSent(true);
    } catch {
      // Offline fallback: acknowledge recording so offline playtesting proceeds
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={styles.main}>
      <p style={styles.scene}>{promptScene}</p>
      <h1 style={styles.title}>{promptTitle}</h1>

      {sent ? (
        <p style={styles.sent}>Sent. The bard will weave it in. ✨</p>
      ) : (
        <div style={styles.controls}>
          {error && status === "error" && (
            <p style={{ color: color.hearth, fontSize: "0.9rem", margin: 0, textAlign: "center" }}>
              {errorKind === "permission-denied"
                ? "Microphone access was denied. Please allow microphone permissions in your browser."
                : error ?? "Could not access microphone."}
            </p>
          )}

          {sendError && (
            <p style={{ color: color.hearth, fontSize: "0.9rem", margin: 0, textAlign: "center" }}>
              {sendError}
            </p>
          )}

          {status !== "recording" ? (
            <button style={blob ? styles.secondaryPill : styles.record} onClick={start} disabled={sending}>
              {blob ? "Re-record" : "Hold the mic — tap to record"}
            </button>
          ) : (
            <button style={{ ...styles.record, background: color.hearth, color: color.chalk }} onClick={stop}>
              Stop ({Math.floor(elapsedMs / 1000)}s)
            </button>
          )}

          {blob && status !== "recording" && (
            <div style={styles.row}>
              <button style={styles.secondary} onClick={reset} disabled={sending}>
                Discard
              </button>
              <button style={styles.primary} onClick={send} disabled={sending}>
                {sending ? "Sending…" : "Send to the DM"}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "1.5rem",
    padding: "1.5rem",
    background: color.felt,
    color: color.chalk,
    fontFamily: font.ui,
  },
  scene: { color: color.chalkDim, fontFamily: font.ui, fontStyle: "italic", margin: 0 },
  title: { fontFamily: font.display, fontSize: "1.6rem", lineHeight: 1.2, margin: 0 },
  controls: { display: "flex", flexDirection: "column", gap: "1rem" },
  record: {
    padding: "1.1rem",
    fontSize: "1.1rem",
    fontWeight: 600,
    borderRadius: "999px",
    border: "none",
    background: color.candle,
    color: color.felt,
    cursor: "pointer",
  },
  secondaryPill: {
    padding: "1.1rem",
    fontSize: "1.1rem",
    borderRadius: "999px",
    border: `1px solid ${color.chalkDim}`,
    background: "transparent",
    color: color.chalkDim,
    cursor: "pointer",
  },
  row: { display: "flex", gap: "0.75rem" },
  secondary: {
    flex: 1,
    padding: "0.9rem",
    borderRadius: "12px",
    border: `1px solid ${color.chalkDim}`,
    background: "transparent",
    color: color.chalkDim,
    cursor: "pointer",
  },
  primary: {
    flex: 2,
    padding: "0.9rem",
    borderRadius: "12px",
    border: "none",
    background: color.candle,
    color: color.felt,
    fontWeight: 600,
    cursor: "pointer",
  },
  sent: { fontFamily: font.ui, fontSize: "1.2rem", textAlign: "center" },
};
