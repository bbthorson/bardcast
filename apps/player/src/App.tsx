import { color, font } from "@bardcast/brand";
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
            // The ember rule (docs/brand.md): the accent marks the single next
            // action — record until there's a take, then send.
            <button style={blob ? styles.secondaryPill : styles.record} onClick={start}>
              {blob ? "Re-record" : "Hold the mic — tap to record"}
            </button>
          ) : (
            <button style={{ ...styles.record, background: color.hearthRed, color: color.parchment }} onClick={stop}>
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
    background: color.walnut,
    color: color.parchment,
    fontFamily: font.ui,
  },
  scene: { color: color.parchmentDim, fontFamily: font.body, fontStyle: "italic", margin: 0 },
  title: { fontFamily: font.display, fontSize: "1.6rem", lineHeight: 1.2, margin: 0 },
  controls: { display: "flex", flexDirection: "column", gap: "1rem" },
  record: {
    padding: "1.1rem",
    fontSize: "1.1rem",
    fontWeight: 600,
    borderRadius: "999px",
    border: "none",
    background: color.ember,
    color: color.walnut,
  },
  secondaryPill: {
    padding: "1.1rem",
    fontSize: "1.1rem",
    borderRadius: "999px",
    border: `1px solid ${color.candleGold}`,
    background: "transparent",
    color: color.candleGold,
  },
  row: { display: "flex", gap: "0.75rem" },
  secondary: { flex: 1, padding: "0.9rem", borderRadius: "12px", border: `1px solid ${color.candleGold}`, background: "transparent", color: color.candleGold },
  primary: { flex: 2, padding: "0.9rem", borderRadius: "12px", border: "none", background: color.ember, color: color.walnut, fontWeight: 600 },
  sent: { fontFamily: font.body, fontSize: "1.2rem", textAlign: "center" },
};
