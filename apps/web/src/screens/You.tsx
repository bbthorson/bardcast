import { color, font, seal } from "@bardcast/brand";
import type { Player, VoiceProfile } from "@bardcast/domain";
import { useMemo } from "react";
import type { CreationView } from "../creations.js";
import type { Table } from "../tables.js";
import { Dot, SealMark, styles } from "../ui.js";

const VOICE_LABEL: Record<VoiceProfile["status"], string> = {
  unlinked: "not linked yet",
  ivc: "instant voice clone active",
  pvc: "professional voice clone active",
};

/**
 * Right tab: your characters (made in session zero, and any still being made),
 * who you are at each table, your voice seal, and account settings
 * (docs/character-creation.md, "Navigation").
 */
export function You({
  player,
  tables,
  voice,
  simulated,
  characters,
  making,
  makeError,
  onMakeCharacter,
  onOpenCreation,
  onOpenCharacter,
  onManageVoice,
  onOpenData,
  onSignOut,
}: {
  player: Player;
  tables: Table[];
  voice: VoiceProfile | null;
  simulated: boolean;
  /** Characters made and being made, newest first. Null while loading. */
  characters: CreationView[] | null;
  making: boolean;
  makeError: string | null;
  onMakeCharacter: () => void;
  onOpenCreation: (id: string) => void;
  onOpenCharacter: (campaignId: string, characterId: string | null) => void;
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

      <p style={{ ...styles.label, marginTop: 28 }}>Your characters</p>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(characters ?? []).map(({ id, creation }) => {
          const name = creation.name.confirmed ?? creation.name.heard;
          const kept = creation.status === "confirmed";
          return (
            <button key={id} onClick={() => onOpenCreation(id)} style={rowButton}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>{name ?? "Someone new"}</span>
                <span style={styles.meta}>
                  {kept ? creation.card?.concept ?? "yours" : creation.status === "ready" ? "ready to meet" : "pick up where you left off"}
                </span>
              </span>
              <span style={{ color: color.chalkDim }}>›</span>
            </button>
          );
        })}
        <button
          style={characters && characters.length === 0 ? styles.candle : styles.compact}
          disabled={making}
          onClick={onMakeCharacter}
        >
          {making ? "Pulling up a chair…" : "Make a character"}
        </button>
        {makeError && <p style={{ ...styles.meta, color: color.hearthSoft, margin: 0 }}>{makeError}</p>}
      </section>

      <p style={{ ...styles.label, marginTop: 28 }}>At your tables</p>
      {playing.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {playing.map((t) => (
            <button key={t.id} onClick={() => onOpenCharacter(t.id, t.myCharacterId)} style={rowButton}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>Sheet at {t.campaign.title}</span>
                <span style={styles.meta}>traits, behaviour and voice for this table</span>
              </span>
              <span style={{ color: color.chalkDim }}>›</span>
            </button>
          ))}
        </section>
      ) : (
        <p style={{ ...styles.muted, margin: 0 }}>You're not sitting at a table yet. An invite from your DM brings you to one.</p>
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
