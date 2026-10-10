import { color, font, seal } from "@bardcast/brand";
import type { Player, VoiceProfile } from "@bardcast/domain";
import { useMemo } from "react";
import type { Table } from "../tables.js";
import { Dot, SealMark, styles } from "../ui.js";

const VOICE_LABEL: Record<VoiceProfile["status"], string> = {
  unlinked: "not linked yet",
  ivc: "instant voice clone active",
  pvc: "professional voice clone active",
};

/**
 * Right tab: who you are at each table, your voice seal, and account settings.
 * A player has one character (keyed by their DID), carried into every table
 * they join; each table keeps its own sheet for it.
 */
export function You({
  player,
  tables,
  voice,
  simulated,
  onOpenCharacter,
  onManageVoice,
  onOpenData,
  onSignOut,
}: {
  player: Player;
  tables: Table[];
  voice: VoiceProfile | null;
  simulated: boolean;
  onOpenCharacter: (campaignId: string) => void;
  onManageVoice: () => void;
  onOpenData: () => void;
  onSignOut: () => void;
}) {
  const mine = useMemo(() => seal(player.did, { hue: 35, bars: 36 }), [player.did]);
  const playing = tables.filter((t) => !t.isDm);
  const running = tables.filter((t) => t.isDm);
  const status = voice?.status ?? null;

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <SealMark seal={mine} size={56} rotate={-6} />
        <div style={{ minWidth: 0 }}>
          <p style={styles.eyebrow}>You</p>
          <h1 style={{ ...styles.h1, fontSize: 28, margin: "4px 0 0", overflowWrap: "anywhere" }}>
            {player.handle ?? player.did}
          </h1>
        </div>
      </div>

      <p style={{ ...styles.label, marginTop: 28 }}>Your character</p>
      {playing.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {playing.map((t) => (
            <button key={t.id} onClick={() => onOpenCharacter(t.id)} style={rowButton}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>Sheet at {t.campaign.title}</span>
                <span style={styles.meta}>traits, behaviour and voice for this table</span>
              </span>
              <span style={{ color: color.chalkDim }}>›</span>
            </button>
          ))}
        </section>
      ) : (
        <p style={{ ...styles.muted, margin: 0 }}>Your character takes shape once you join a table and answer its first prompt.</p>
      )}

      {running.length > 0 && (
        <p style={{ ...styles.meta, marginTop: 10 }}>
          You run {running.length} {running.length === 1 ? "table" : "tables"} as DM.
        </p>
      )}

      <p style={{ ...styles.label, marginTop: 28 }}>Voice</p>
      <button onClick={onManageVoice} style={rowButton}>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>Your voice seal</span>
          <span style={{ ...styles.meta, display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Dot tone={status === "ivc" || status === "pvc" ? color.moss : color.chalkDim} />
            {status ? VOICE_LABEL[status] : "not set up yet"}
          </span>
        </span>
        <span style={{ color: color.chalkDim }}>Manage ›</span>
      </button>

      <p style={{ ...styles.label, marginTop: 28 }}>Account</p>
      <div style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={styles.meta}>signed in with AT Protocol{simulated ? " · demo session" : ""}</span>
        <span style={{ ...styles.meta, color: color.chalk, overflowWrap: "anywhere" }}>{player.did}</span>
        <div style={styles.row}>
          <button style={styles.compact} onClick={onOpenData}>
            What's yours
          </button>
          <button style={styles.compact} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const rowButton = {
  ...styles.card,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  border: "none",
  color: color.chalk,
  font: "inherit",
  display: "flex",
  alignItems: "center",
  gap: 14,
} as const;
