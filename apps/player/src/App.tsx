import { useState } from "react";
import { useAudioRecorder } from "./useAudioRecorder.js";

/**
 * The entire player surface is one screen: see the prompt, tap to record, send.
 * Every extra tap risks losing a player (see CLAUDE.md "engagement seam"), so
 * this stays deliberately bare. AT-Proto sign-in and prompt fetch are stubbed.
 *
 * TODO(bardcast): fetch the active prompt for the signed-in player; on send,
 * upload the audio blob to vox-pop-core as a reply to `voxPopPromptUri`.
 */
export function App() {
  // TODO(bardcast): load from the orchestrator instead of this placeholder.
  const prompt = {
    title: "Tell me about a scar you carry — where did it come from?",
    scene: "The party makes camp. Firelight catches an old mark on your skin.",
  };

  const { state, durationMs, start, stop, blob, reset } = useAudioRecorder();
  const [sent, setSent] = useState(false);

  async function send() {
    if (!blob) return;
    // TODO(bardcast): POST the blob to vox-pop-core via the uploads + reply API.
    setSent(true);
  }

  return (
    <main style={styles.main}>
      <p style={styles.scene}>{prompt.scene}</p>
      <h1 style={styles.title}>{prompt.title}</h1>

      {sent ? (
        <p style={styles.sent}>Sent. The bard will weave it in. ✨</p>
      ) : (
        <div style={styles.controls}>
          {state !== "recording" ? (
            <button style={styles.record} onClick={start}>
              {blob ? "Re-record" : "Hold the mic — tap to record"}
            </button>
          ) : (
            <button style={{ ...styles.record, background: "#a3173a" }} onClick={stop}>
              Stop ({Math.floor(durationMs / 1000)}s)
            </button>
          )}

          {blob && state !== "recording" && (
            <div style={styles.row}>
              <button style={styles.secondary} onClick={reset}>
                Discard
              </button>
              <button style={styles.primary} onClick={send}>
                Send to the DM
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
    background: "#1b1033",
    color: "#f3eefc",
    fontFamily: "system-ui, sans-serif",
  },
  scene: { opacity: 0.7, fontStyle: "italic", margin: 0 },
  title: { fontSize: "1.6rem", lineHeight: 1.2, margin: 0 },
  controls: { display: "flex", flexDirection: "column", gap: "1rem" },
  record: {
    padding: "1.1rem",
    fontSize: "1.1rem",
    borderRadius: "999px",
    border: "none",
    background: "#6d4ed6",
    color: "white",
  },
  row: { display: "flex", gap: "0.75rem" },
  secondary: { flex: 1, padding: "0.9rem", borderRadius: "12px", border: "1px solid #6d4ed6", background: "transparent", color: "#f3eefc" },
  primary: { flex: 2, padding: "0.9rem", borderRadius: "12px", border: "none", background: "#36c08f", color: "#04231a", fontWeight: 600 },
  sent: { fontSize: "1.2rem", textAlign: "center" },
};
