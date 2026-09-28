import { color, font, seal } from "@bardcast/brand";
import type { Player, VoiceProfile } from "@bardcast/domain";
import { useEffect, useMemo, useState } from "react";
import { campaign, party } from "../fixtures/gawain.js";
import { Dot, SealMark, styles } from "../ui.js";
import { fetchUserCampaigns, type CampaignSummary } from "../api.js";

const VOICE_LABEL: Record<VoiceProfile["status"], string> = {
  unlinked: "Not linked yet",
  ivc: "Instant voice clone active",
  pvc: "Professional voice clone active",
};

function voiceTone(status: VoiceProfile["status"] | null): string {
  if (status === "pvc" || status === "ivc") return color.moss;
  return color.chalkDim;
}

/**
 * The signed-in home. Lists the player's active tables from the orchestrator,
 * with quick actions to start a new campaign, join with an invite code, or manage their voice seal.
 */
export function Dashboard({
  player,
  voice,
  onCreate,
  onJoin,
  onManageVoice,
  onOpenCampaign,
}: {
  player: Player;
  voice: VoiceProfile | null;
  onCreate: () => void;
  onJoin: () => void;
  onManageVoice: () => void;
  onOpenCampaign: (campaignId?: string) => void;
}) {
  const name = player.handle ?? player.did;
  const status = voice?.status ?? null;
  const sampleSeals = useMemo(() => party.map((p) => seal(p.id, { hue: p.hue, bars: 29 })), []);
  const mine = useMemo(() => seal(player.did, { hue: 35, bars: 36 }), [player.did]);

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchUserCampaigns(player.did).then((list) => {
      if (!cancelled) {
        setCampaigns(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [player.did]);

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Welcome back</p>
      <h1 style={{ ...styles.h1, overflowWrap: "anywhere" }}>{name}</h1>
      <p style={{ ...styles.lede, marginBottom: 28 }}>Pick up where the table left off, or start something new.</p>

      {/* User's active campaigns */}
      {campaigns.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <p style={styles.label}>Your campaigns</p>
          {campaigns.map(({ id, campaign: c }) => (
            <button
              key={id}
              onClick={() => onOpenCampaign(id)}
              style={{
                ...styles.card,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                color: color.chalk,
                font: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: font.display, fontSize: 20, lineHeight: 1.2 }}>{c.title}</span>
                <span style={styles.meta}>{c.dm === player.did ? "DM" : "Player"}</span>
              </div>
              {c.premise && <p style={{ ...styles.muted, margin: 0, fontSize: "0.85rem" }}>{c.premise}</p>}
              <span style={{ ...styles.muted, fontSize: 13 }}>
                {c.party.length} {c.party.length === 1 ? "player" : "players"} in roster →
              </span>
            </button>
          ))}
        </section>
      ) : (
        /* The sample table when no active campaigns exist */
        <button
          onClick={() => onOpenCampaign()}
          style={{
            ...styles.card,
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            border: "none",
            color: color.chalk,
            font: "inherit",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            transform: "rotate(-0.8deg)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
          }}
        >
          <span style={styles.meta}>sample table · ch. {campaign.currentChapter} gathering voices</span>
          <span style={{ fontFamily: font.display, fontSize: 22, lineHeight: 1.15 }}>{campaign.title}</span>
          <span style={{ display: "flex", alignItems: "center" }}>
            {sampleSeals.map((s, i) => (
              <SealMark key={party[i]!.id} seal={s} size={30} style={{ marginRight: -4 }} />
            ))}
            <span style={{ ...styles.muted, fontSize: 14, marginLeft: 12 }}>{party.length} players →</span>
          </span>
        </button>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 28 }}>
        <article style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={styles.h2}>Start a campaign</h2>
          <p style={{ ...styles.muted, margin: "0 0 12px" }}>You're the DM. Set the premise, gather your table, and send the first prompt.</p>
          <button style={styles.candle} onClick={onCreate}>
            Create a campaign
          </button>
        </article>

        <article style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={styles.h2}>Join with an invite</h2>
          <p style={{ ...styles.muted, margin: "0 0 12px" }}>Got an invite code from your DM? Bring your character to the table.</p>
          <button style={styles.secondary} onClick={onJoin}>
            Enter an invite code
          </button>
        </article>
      </section>

      <button
        onClick={onManageVoice}
        style={{
          ...styles.card,
          marginTop: 16,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          border: "none",
          color: color.chalk,
          font: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <SealMark seal={mine} size={40} rotate={-6} />
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontFamily: font.display, fontSize: 18 }}>Your voice seal</span>
          <span style={{ ...styles.meta, display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Dot tone={voiceTone(status)} />
            {status ? VOICE_LABEL[status].toLowerCase() : "not set up yet"}
          </span>
        </span>
        <span style={{ color: color.chalkDim, fontSize: 15 }}>Manage ›</span>
      </button>
    </div>
  );
}
