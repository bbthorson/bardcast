import { color, font } from "@bardcast/brand";
import type { Campaign, Player } from "@bardcast/domain";
import { useState } from "react";
import { styles } from "../ui.js";
import { createCampaignApi, createInviteApi } from "../api.js";

/**
 * Create-a-campaign form. Persists the campaign on the orchestrator via
 * POST /api/campaigns, mints an invite code, and displays it to the DM.
 */
export function CreateCampaign({
  player,
  onBack,
  onOpenCampaign,
}: {
  player: Player;
  onBack: () => void;
  onOpenCampaign?: (campaignId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [calendar, setCalendar] = useState("");
  const [created, setCreated] = useState<{ id: string; campaign: Campaign; inviteCode: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const res = await createCampaignApi(
        {
          title: title.trim(),
          ...(premise.trim() ? { premise: premise.trim() } : {}),
          ...(calendar.trim() ? { calendar: calendar.trim() } : {}),
        },
        player.did,
      );

      const inv = await createInviteApi(res.id, player.did);
      setCreated({ id: res.id, campaign: res.campaign, inviteCode: inv.code });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create campaign. Make sure you're signed in and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    const shareUrl = `${window.location.origin}/join?code=${encodeURIComponent(created.inviteCode)}`;
    return (
      <div style={styles.page}>
        <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>‹ Back to your table</button>
        <p style={{ ...styles.eyebrow, marginTop: "1rem" }}>Campaign created</p>
        <h1 style={styles.h1}>{created.campaign.title}</h1>
        <p style={styles.muted}>
          Your table is set. Share this invite code (or link) with your players so they can bring their
          characters.
        </p>
        <div style={{ ...styles.card, marginTop: "1rem" }}>
          <p style={styles.label}>Invite code</p>
          <p style={{ fontFamily: font.mono, fontSize: "1.6rem", letterSpacing: "0.12em", color: color.chalk, margin: 0 }}>
            {created.inviteCode}
          </p>
          <p style={{ ...styles.muted, fontSize: "0.8rem", marginTop: "0.5rem", marginBottom: 0, overflowWrap: "anywhere" }}>
            Link: <span style={{ fontFamily: font.mono }}>{shareUrl}</span>
          </p>
          <p style={{ ...styles.muted, fontSize: "0.8rem", marginTop: "0.5rem", marginBottom: 0 }}>
            Campaign id <span style={{ fontFamily: font.mono }}>{created.id}</span> · owner{" "}
            <span style={{ fontFamily: font.mono }}>{created.campaign.dm}</span>
          </p>
        </div>
        <div style={{ ...styles.row, marginTop: "1rem", flexWrap: "wrap" }}>
          <a
            href={`/dm/?campaign=${encodeURIComponent(created.id)}`}
            style={{ ...styles.candle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Open DM Console
          </a>
          {onOpenCampaign && (
            <button style={styles.secondary} onClick={() => onOpenCampaign(created.id)}>
              View table
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>‹ Back</button>
      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Start a campaign</h1>
      <p style={styles.muted}>You'll be the DM. You can change any of this later.</p>

      {error && <p style={{ color: color.hearth, fontSize: "0.9rem" }}>{error}</p>}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.25rem" }}>
        <div>
          <label htmlFor="title" style={styles.label}>Campaign title</label>
          <input
            id="title"
            style={styles.input}
            placeholder="The Thornwood Vigil"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="premise" style={styles.label}>Premise <span style={{ color: color.chalkDim }}>(optional)</span></label>
          <textarea
            id="premise"
            style={{ ...styles.input, minHeight: 110, resize: "vertical", fontFamily: font.ui }}
            placeholder="A hush has fallen over the northern woods, and the last patrol never came home…"
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="calendar" style={styles.label}>Calendar name <span style={{ color: color.chalkDim }}>(optional)</span></label>
          <input
            id="calendar"
            style={styles.input}
            placeholder="Reckoning of Ash"
            value={calendar}
            onChange={(e) => setCalendar(e.target.value)}
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          style={{ ...styles.candle, ...(canSubmit ? null : styles.disabled) }}
          disabled={!canSubmit}
        >
          {loading ? "Creating table…" : "Create campaign"}
        </button>
      </form>
    </div>
  );
}
