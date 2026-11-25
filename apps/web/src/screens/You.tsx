import { color, font, seal } from "@bardcast/brand";
import { SRD_CLASS_INDEXES, type Player, type SrdClass, type VoiceProfile } from "@bardcast/domain";
import { useMemo, useState } from "react";
import type { MyCharacter, RpgActorLookupResponse } from "../api.js";
import { RpgActorSprite } from "../components/RpgActorSprite.js";
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
  ownedCharacters,
  rpgActor,
  making,
  makeError,
  importingRpgActor,
  importRpgActorError,
  syncingCharacterId,
  syncedCharacterId,
  syncRpgActorError,
  onMakeCharacter,
  onImportRpgActor,
  onSyncRpgActor,
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
  /** Characters with a saved sheet (including any imported from rpg.actor). */
  ownedCharacters?: MyCharacter[];
  /** Public rpg.actor presence for this player's DID, if any. */
  rpgActor?: RpgActorLookupResponse | null;
  making: boolean;
  makeError: string | null;
  importingRpgActor?: boolean;
  importRpgActorError?: string | null;
  syncingCharacterId?: string | null;
  syncedCharacterId?: string | null;
  syncRpgActorError?: string | null;
  onMakeCharacter: () => void;
  onImportRpgActor?: (params: { displayName: string; class?: SrdClass }) => void;
  onSyncRpgActor?: (characterId: string) => void;
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
  const [fallbackClass, setFallbackClass] = useState<SrdClass>("fighter");

  const creationCharIds = useMemo(
    () => new Set((characters ?? []).map((c) => c.creation.character).filter(Boolean)),
    [characters],
  );
  const importedOnly = useMemo(
    () => (ownedCharacters ?? []).filter((c) => !creationCharIds.has(c.id)),
    [ownedCharacters, creationCharIds],
  );
  const totalCharacters = (characters?.length ?? 0) + importedOnly.length;

  const actor = rpgActor?.actor ?? null;
  const draft = rpgActor?.importDraft ?? null;
  const verifiedKeepsakes = actor?.equipment.filter((item) => item.verified) ?? [];

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <SealMark seal={mine} size={56} rotate={-6} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={styles.eyebrow}>You</p>
          <h1 style={{ ...styles.h1, fontSize: 28, margin: "4px 0 0", overflowWrap: "anywhere" }}>
            {player.handle ?? player.did}
          </h1>
        </div>
        {actor?.sprite && (
          <RpgActorSprite
            sprite={actor.sprite}
            size={48}
            alt={`${player.handle ?? "Your"} rpg.actor sprite`}
          />
        )}
      </div>

      <p style={{ ...styles.label, marginTop: 28 }}>Your characters</p>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(characters ?? []).map(({ id, creation }) => {
          const name = creation.name.confirmed ?? creation.name.heard;
          const kept = creation.status === "confirmed";
          const charId = creation.character;
          return (
            <div key={id} style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => onOpenCreation(id)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: color.chalk,
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: "100%",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>{name ?? "Someone new"}</span>
                  <span style={styles.meta}>
                    {kept ? creation.card?.concept ?? "yours" : creation.status === "ready" ? "ready to meet" : "pick up where you left off"}
                  </span>
                </span>
                <span style={{ color: color.chalkDim }}>›</span>
              </button>
              {kept && charId && onSyncRpgActor && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    style={styles.compact}
                    disabled={syncingCharacterId === charId}
                    onClick={() => onSyncRpgActor(charId)}
                  >
                    {syncingCharacterId === charId
                      ? "Syncing to rpg.actor…"
                      : syncedCharacterId === charId
                        ? "Synced to rpg.actor"
                        : "Sync to rpg.actor"}
                  </button>
                  {syncedCharacterId === charId && (
                    <span style={{ ...styles.meta, color: color.moss }}>written to actor.rpg.stats</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {importedOnly.map((c) => (
          <div key={c.id} style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>{c.profile.displayName}</span>
              <span style={styles.meta}>
                level {c.level}
                {c.profile.concept ? ` · ${c.profile.concept}` : " · ready for a table"}
              </span>
            </span>
            {onSyncRpgActor && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  style={styles.compact}
                  disabled={syncingCharacterId === c.id}
                  onClick={() => onSyncRpgActor(c.id)}
                >
                  {syncingCharacterId === c.id
                    ? "Syncing to rpg.actor…"
                    : syncedCharacterId === c.id
                      ? "Synced to rpg.actor"
                      : "Sync to rpg.actor"}
                </button>
                {syncedCharacterId === c.id && (
                  <span style={{ ...styles.meta, color: color.moss }}>written to actor.rpg.stats</span>
                )}
              </div>
            )}
          </div>
        ))}
        {syncRpgActorError && (
          <p style={{ ...styles.meta, color: color.hearthSoft, margin: 0 }}>{syncRpgActorError}</p>
        )}
        <button
          style={characters !== null && totalCharacters === 0 ? styles.candle : styles.compact}
          disabled={making}
          onClick={onMakeCharacter}
        >
          {making ? "Pulling up a chair…" : "Make a character"}
        </button>
        {makeError && <p style={{ ...styles.meta, color: color.hearthSoft, margin: 0 }}>{makeError}</p>}
      </section>

      {actor && (
        <>
          <p style={{ ...styles.label, marginTop: 28 }}>From rpg.actor</p>
          <div style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {actor.sprite && (
                <RpgActorSprite
                  sprite={actor.sprite}
                  size={48}
                  alt="Your rpg.actor sprite"
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>
                  {draft?.displayName ?? player.handle ?? "rpg.actor character"}
                </span>
                <span style={styles.meta}>
                  {draft
                    ? [
                        draft.species,
                        draft.class ?? actor.dnd?.identity?.class,
                        `lvl ${draft.level}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "sprite linked on your PDS"}
                  {verifiedKeepsakes.length > 0
                    ? ` · ${verifiedKeepsakes.length} verified ${verifiedKeepsakes.length === 1 ? "keepsake" : "keepsakes"}`
                    : ""}
                </span>
              </div>
            </div>
            {draft && onImportRpgActor && (
              <>
                {!draft.class && (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, ...styles.meta }}>
                    <span>SRD 5.2 class</span>
                    <select
                      value={fallbackClass}
                      onChange={(e) => setFallbackClass(e.target.value as SrdClass)}
                      style={{
                        background: color.felt,
                        color: color.chalk,
                        border: `1px solid ${color.feltLine}`,
                        borderRadius: 4,
                        padding: "4px 8px",
                        font: "inherit",
                      }}
                    >
                      {SRD_CLASS_INDEXES.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  style={styles.compact}
                  disabled={importingRpgActor}
                  onClick={() =>
                    onImportRpgActor({
                      displayName: draft.displayName ?? player.handle ?? "Adventurer",
                      ...(draft.class ? {} : { class: fallbackClass }),
                    })
                  }
                >
                  {importingRpgActor ? "Bringing them to the table…" : "Bring from rpg.actor"}
                </button>
                {importRpgActorError && (
                  <p style={{ ...styles.meta, color: color.hearthSoft, margin: 0 }}>{importRpgActorError}</p>
                )}
              </>
            )}
          </div>
        </>
      )}

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
