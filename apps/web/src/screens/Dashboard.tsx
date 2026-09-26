import { color, font, seal } from "@bardcast/brand";
import type { Player, VoiceProfile } from "@bardcast/domain";
import { useMemo } from "react";
import { campaign, party } from "../fixtures/gawain.js";
import { Dot, SealMark, styles } from "../ui.js";

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
 * The signed-in home. Your tables, two ways in — start a campaign or join an
 * invite — plus a strip for the player's voice clone. The candle rule: "Create
 * a campaign" is the single lit action; joining is the felt alternative, and the
 * voice strip and tables are entries, not accents.
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
  onOpenCampaign: () => void;
}) {
  const name = player.handle ?? player.did;
  const status = voice?.status ?? null;
  const seals = useMemo(() => party.map((p) => seal(p.id, { hue: p.hue, bars: 29 })), []);
  const mine = useMemo(() => seal(player.did, { hue: 35, bars: 36 }), [player.did]);

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Welcome back</p>
      <h1 style={{ ...styles.h1, overflowWrap: "anywhere" }}>{name}</h1>
      <p style={{ ...styles.lede, marginBottom: 28 }}>Pick up where the table left off, or start something new.</p>

      {/* TODO(bardcast): list the player's real campaigns from the orchestrator; this is the sample table. */}
      <button
        onClick={onOpenCampaign}
        style={{ ...styles.card, width: "100%", textAlign: "left", cursor: "pointer", border: "none", color: color.chalk, font: "inherit", display: "flex", flexDirection: "column", gap: 10, transform: "rotate(-0.8deg)", boxShadow: "0 10px 24px rgba(0,0,0,0.35)" }}
      >
        <span style={styles.meta}>sample table · ch. {campaign.currentChapter} gathering voices</span>
        <span style={{ fontFamily: font.display, fontSize: 22, lineHeight: 1.15 }}>{campaign.title}</span>
        <span style={{ display: "flex", alignItems: "center" }}>
          {seals.map((s, i) => (
            <SealMark key={party[i]!.id} seal={s} size={30} style={{ marginRight: -4 }} />
          ))}
          <span style={{ ...styles.muted, fontSize: 14, marginLeft: 12 }}>{party.length} players →</span>
        </span>
      </button>

      <section style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 28 }}>
        <article style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={styles.h2}>Start a campaign</h2>
          <p style={{ ...styles.muted, margin: "0 0 12px" }}>You're the DM. Set the premise, gather your table, and send the first prompt.</p>
          {/* The one candle on this screen. */}
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
        style={{ ...styles.card, marginTop: 16, width: "100%", textAlign: "left", cursor: "pointer", border: "none", color: color.chalk, font: "inherit", display: "flex", alignItems: "center", gap: 14 }}
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
