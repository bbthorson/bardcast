import { color, font } from "@bardcast/brand";
import type { Player, VoiceProfile } from "@bardcast/domain";
import { styles } from "../ui.js";

const VOICE_LABEL: Record<VoiceProfile["status"], string> = {
  unlinked: "Not linked yet",
  ivc: "Instant voice clone active",
  pvc: "Professional voice clone active",
};

function voiceTone(status: VoiceProfile["status"] | null): string {
  if (status === "pvc") return color.moss;
  if (status === "ivc") return color.candleGold;
  return color.parchmentDim;
}

/**
 * The signed-in home. Two ways in — start a campaign or join an invite — plus a
 * strip for the player's voice clone. The ember rule: "Create a campaign" is the
 * single lit action; joining is the quieter alternative, and the voice strip is
 * a status/management entry, not an accent.
 */
export function Dashboard({
  player,
  voice,
  onCreate,
  onJoin,
  onManageVoice,
}: {
  player: Player;
  voice: VoiceProfile | null;
  onCreate: () => void;
  onJoin: () => void;
  onManageVoice: () => void;
}) {
  const name = player.handle ?? player.did;
  const status = voice?.status ?? null;

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Welcome back</p>
      <h1 style={styles.h1}>{name}</h1>
      <p style={styles.muted}>Pick up where the table left off, or start something new.</p>

      <section style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: "1.5rem" }}>
        <article style={styles.card}>
          <h2 style={styles.h2}>Start a campaign</h2>
          <p style={{ ...styles.muted, minHeight: "3.2em" }}>
            You're the DM. Set the premise, gather your table, and send the first prompt.
          </p>
          {/* The one ember action on this screen. */}
          <button style={{ ...styles.ember, width: "100%" }} onClick={onCreate}>
            Create a campaign
          </button>
        </article>

        <article style={styles.card}>
          <h2 style={styles.h2}>Join with an invite</h2>
          <p style={{ ...styles.muted, minHeight: "3.2em" }}>
            Got an invite code from your DM? Bring your character to the table.
          </p>
          <button style={{ ...styles.secondary, width: "100%" }} onClick={onJoin}>
            Enter an invite code
          </button>
        </article>
      </section>

      <button
        onClick={onManageVoice}
        style={{ ...styles.card, marginTop: "1rem", width: "100%", textAlign: "left", cursor: "pointer", border: `1px solid ${color.walnut}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
      >
        <span>
          <span style={{ display: "block", fontFamily: font.display, fontSize: "1.1rem", color: color.parchment }}>
            Your voice clone
          </span>
          <span style={{ ...styles.muted, display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: voiceTone(status) }} />
            {status ? VOICE_LABEL[status] : "Not set up yet"}
          </span>
        </span>
        <span style={{ color: color.candleGold, fontSize: "0.9rem" }}>Manage →</span>
      </button>
    </div>
  );
}
