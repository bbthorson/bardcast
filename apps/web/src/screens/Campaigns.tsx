import { color, font, seal } from "@bardcast/brand";
import { useMemo } from "react";
import { campaign, party } from "../fixtures/gawain.js";
import { whereYouAre, type Table } from "../tables.js";
import { SealMark, styles } from "../ui.js";

/**
 * Left tab, the widest view: every table you sit at, as DM or player, where
 * each one is in its story, and the ways to join or start one.
 * With no tables yet, the sample Sir Gawain table stands in so there is
 * something to open.
 */
export function Campaigns({
  tables,
  loading,
  onOpenCampaign,
  onCreate,
  onJoin,
}: {
  tables: Table[];
  loading: boolean;
  onOpenCampaign: (campaignId?: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const sampleSeals = useMemo(() => party.map((p) => seal(p.id, { hue: p.hue, bars: 29 })), []);

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Campaigns</p>
      <h1 style={styles.h1}>Your tables</h1>

      {loading ? (
        <p style={styles.muted}>Gathering your tables…</p>
      ) : tables.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {tables.map((t) => {
            const { id, campaign: c, isDm } = t;
            return (
            <button key={id} onClick={() => onOpenCampaign(id)} style={cardButton}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: font.display, fontSize: 20, lineHeight: 1.2 }}>{c.title}</span>
                <span style={styles.meta}>{isDm ? "DM" : "Player"}</span>
              </div>
              {c.premise && <p style={{ ...styles.muted, margin: 0, fontSize: "0.85rem" }}>{c.premise}</p>}
              <span style={{ ...styles.meta, color: color.chalk }}>{whereYouAre(t)}</span>
              <span style={{ ...styles.muted, fontSize: 13 }}>
                {c.party.length} {c.party.length === 1 ? "player" : "players"} →
              </span>
            </button>
            );
          })}
        </section>
      ) : (
        <button
          onClick={() => onOpenCampaign()}
          style={{ ...cardButton, gap: 10, marginTop: 12, transform: "rotate(-0.8deg)", boxShadow: "0 10px 24px rgba(0,0,0,0.35)" }}
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

      <div style={{ ...styles.row, marginTop: 24 }}>
        <button style={styles.secondary} onClick={onJoin}>
          Join with a code
        </button>
        <button style={styles.secondary} onClick={onCreate}>
          Start a campaign
        </button>
      </div>
    </div>
  );
}

const cardButton = {
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
} as const;
