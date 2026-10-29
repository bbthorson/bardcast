import { color, font } from "@bardcast/brand";
import type { Player } from "@bardcast/domain";
import { useEffect, useState } from "react";
import { fetchInvite, fetchMyCharacters, joinCampaignApi, type InvitePreview, type MyCharacter } from "../api.js";
import { HandNote, styles } from "../ui.js";

/**
 * Joining with an invite (docs/character-creation.md, "Entry points"): the
 * code, then who to bring. The player picks one of their own characters, who
 * sits down at the table's level, or makes someone new for this table and
 * comes back here when they're done.
 */
export function JoinInvite({
  player,
  initialCode,
  onBack,
  onMakeNew,
  onOpenCampaign,
}: {
  player: Player;
  /** Arriving from a link, or back from making a character for this table. */
  initialCode?: string | undefined;
  onBack: () => void;
  /** Start session zero for this table; the invite code comes along. */
  onMakeNew: (code: string) => Promise<void>;
  onOpenCampaign: (campaignId: string) => void;
}) {
  const [code, setCode] = useState(initialCode ?? "");
  const [invite, setInvite] = useState<(InvitePreview & { code: string }) | null>(null);
  const [mine, setMine] = useState<MyCharacter[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loading, setLoading] = useState<"invite" | "join" | "make" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function look(raw: string) {
    const clean = raw.trim().toUpperCase();
    if (!clean) return;
    setLoading("invite");
    setError(null);
    try {
      const [found, characters] = await Promise.all([fetchInvite(clean, player.did), fetchMyCharacters(player.did)]);
      if (!found) {
        setError("That code isn't one we know. Double-check it with your DM.");
        return;
      }
      setInvite({ ...found, code: clean });
      setMine(characters);
      setChosen(characters[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  // A code in the link: go straight to choosing.
  useEffect(() => {
    if (initialCode) void look(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function join() {
    if (!invite || !chosen) return;
    setLoading("join");
    setError(null);
    try {
      const res = await joinCampaignApi(invite.code, player.did, chosen);
      onOpenCampaign(res.campaignId);
    } catch (err) {
      setError((err as Error).message);
      setLoading(null);
    }
  }

  async function makeNew() {
    if (!invite) return;
    setLoading("make");
    setError(null);
    try {
      await onMakeNew(invite.code);
    } catch (err) {
      setError((err as Error).message);
      setLoading(null);
    }
  }

  if (invite && mine) {
    const name = mine.find((c) => c.id === chosen)?.profile.displayName;
    return (
      <div style={styles.page}>
        <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>
          ‹ Back
        </button>
        <p style={{ ...styles.eyebrow, marginTop: "1rem" }}>There's a seat at</p>
        <h1 style={styles.h1}>{invite.title}</h1>
        <p style={styles.muted}>
          Everyone sits down at level {invite.startingLevel}. Whoever you bring keeps their own sheet; what happens at this table stays
          here until they leave.
        </p>
        {invite.characterGuidance && (
          <div style={{ margin: "16px 0 4px" }}>
            <HandNote ground="felt">“{invite.characterGuidance}” — your DM</HandNote>
          </div>
        )}

        <p style={{ ...styles.label, marginTop: 24 }}>Who are you bringing?</p>
        <div role="radiogroup" aria-label="Who are you bringing?" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mine.map((c) => {
            const on = c.id === chosen;
            return (
              <button
                key={c.id}
                role="radio"
                aria-checked={on}
                onClick={() => setChosen(c.id)}
                style={{ ...styles.card, textAlign: "left", cursor: "pointer", border: `1px solid ${on ? color.chalk : "transparent"}`, color: color.chalk, font: "inherit" }}
              >
                <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>{c.profile.displayName}</span>
                <span style={styles.meta}>
                  level {c.level}
                  {c.profile.concept ? ` · ${c.profile.concept}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ ...styles.row, marginTop: 18 }}>
          {mine.length > 0 ? (
            <>
              <button style={styles.candle} disabled={!chosen || loading !== null} onClick={join}>
                {loading === "join" ? "Taking the seat…" : `Bring ${name ?? "them"}`}
              </button>
              <button style={styles.quiet} disabled={loading !== null} onClick={makeNew}>
                {loading === "make" ? "Pulling up a chair…" : "Make someone new"}
              </button>
            </>
          ) : (
            <button style={styles.candle} disabled={loading !== null} onClick={makeNew}>
              {loading === "make" ? "Pulling up a chair…" : "Make someone for this table"}
            </button>
          )}
        </div>
        {error && <p style={{ ...styles.muted, color: color.hearthSoft }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>
        ‹ Back
      </button>
      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Join with an invite</h1>
      <p style={styles.muted}>Enter the code your DM shared with you.</p>

      {error && <p style={{ color: color.hearthSoft, fontSize: "0.9rem" }}>{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void look(code);
        }}
        style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.25rem", maxWidth: 360 }}
      >
        <div>
          <label htmlFor="code" style={styles.label}>
            Invite code
          </label>
          <input
            id="code"
            style={{ ...styles.input, fontFamily: font.mono, letterSpacing: "0.14em", textTransform: "uppercase" }}
            placeholder="A1B2C3"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading !== null}
          />
        </div>
        <button type="submit" style={{ ...styles.candle, ...(code.trim() && !loading ? null : styles.disabled) }} disabled={!code.trim() || loading !== null}>
          {loading === "invite" ? "Finding the table…" : "Find the table"}
        </button>
      </form>
    </div>
  );
}
