import { color, font } from "@bardcast/brand";
import { useState } from "react";
import { styles } from "../ui.js";

/**
 * Join-an-invite form. Stubbed: on submit we just acknowledge the code. There's
 * no invite-redemption endpoint yet.
 *
 * TODO(bardcast): POST the code to the orchestrator, which validates it, adds
 * the player's DID to the campaign's party, and returns the campaign so we can
 * route them to their character.
 */
export function JoinInvite({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState<string | null>(null);
  const canSubmit = code.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) setJoined(code.trim().toUpperCase());
  }

  if (joined) {
    return (
      <div style={styles.page}>
        <button style={styles.ghost} onClick={onBack}>← Back to your table</button>
        <p style={{ ...styles.eyebrow, marginTop: "1rem" }}>You're in</p>
        <h1 style={styles.h1}>Pull up a chair.</h1>
        <p style={styles.muted}>
          You've joined the campaign behind invite{" "}
          <span style={{ fontFamily: font.mono, color: color.candleGold }}>{joined}</span>. When the DM
          sends a prompt, you'll answer it in your own voice from the player app.
        </p>
        <p style={{ ...styles.muted, fontSize: "0.8rem", marginTop: "1rem" }}>
          Stubbed — invite redemption lands with the orchestrator.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button style={styles.ghost} onClick={onBack}>← Back</button>
      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Join with an invite</h1>
      <p style={styles.muted}>Enter the code your DM shared with you.</p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.25rem", maxWidth: 360 }}>
        <div>
          <label htmlFor="code" style={styles.label}>Invite code</label>
          <input
            id="code"
            style={{ ...styles.input, fontFamily: font.mono, letterSpacing: "0.14em", textTransform: "uppercase" }}
            placeholder="A1B2C3"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {/* The one ember action on this screen. */}
        <button type="submit" style={{ ...styles.ember, ...(canSubmit ? null : styles.disabled) }} disabled={!canSubmit}>
          Join campaign
        </button>
      </form>
    </div>
  );
}
