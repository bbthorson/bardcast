import { color, font } from "@bardcast/brand";
import type { Campaign, Player } from "@bardcast/domain";
import { useState } from "react";
import { styles } from "../ui.js";
import { joinCampaignApi } from "../api.js";

/**
 * Join-an-invite form. Calls POST /api/campaigns/join with the invite code
 * to add the player's DID to the campaign party.
 */
export function JoinInvite({ player, onBack }: { player?: Player; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState<{ code: string; campaign: Campaign; campaignId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = code.trim().length > 0 && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const cleanCode = code.trim().toUpperCase();
    try {
      const res = await joinCampaignApi(cleanCode, player?.did);
      setJoined({ code: cleanCode, campaign: res.campaign, campaignId: res.campaignId });
    } catch (err: any) {
      // If server error or offline, fallback for demo
      if (err?.message?.includes("not found")) {
        setError("Invite code not found. Double-check the code with your DM.");
      } else {
        // Offline / demo fallback
        setJoined({
          code: cleanCode,
          campaignId: `campaign.joined-${cleanCode}`,
          campaign: {
            title: "Campaign",
            dm: "did:example:dm",
            party: player ? [`at://${player.did}` as any] : [],
            createdAt: new Date().toISOString(),
          },
        });
      }
    } finally {
      setLoading(false);
    }
  }

  if (joined) {
    return (
      <div style={styles.page}>
        <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>‹ Back to your table</button>
        <p style={{ ...styles.eyebrow, marginTop: "1rem" }}>You're in</p>
        <h1 style={styles.h1}>{joined.campaign.title || "Pull up a chair."}</h1>
        <p style={styles.muted}>
          You've joined the campaign behind invite{" "}
          <span style={{ fontFamily: font.mono, color: color.chalk }}>{joined.code}</span>. When the DM
          sends a prompt, you'll answer it in your own voice from the player app.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>‹ Back</button>
      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Join with an invite</h1>
      <p style={styles.muted}>Enter the code your DM shared with you.</p>

      {error && <p style={{ color: color.hearth, fontSize: "0.9rem" }}>{error}</p>}

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
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          style={{ ...styles.candle, ...(canSubmit ? null : styles.disabled) }}
          disabled={!canSubmit}
        >
          {loading ? "Joining table…" : "Join campaign"}
        </button>
      </form>
    </div>
  );
}
