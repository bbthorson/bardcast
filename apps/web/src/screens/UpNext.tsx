import { font } from "@bardcast/brand";
import type { Player, VoiceProfile } from "@bardcast/domain";
import { promptIsFor, type Table } from "../tables.js";
import { styles } from "../ui.js";

export interface UpNextAction {
  key: string;
  /** Small mono line above the title: where this comes from. */
  context: string;
  title: string;
  body?: string;
  cta: string;
  go: () => void;
}

/**
 * What needs you now, derived from your tables and your voice seal. Order is
 * priority: the DM's open questions to you first, then tables waiting on you
 * as DM, then your voice seal.
 *
 * TODO(bardcast): the orchestrator doesn't yet say whether you've answered a
 * prompt, so "answer" shows the newest prompt aimed at you on each table.
 */
export function upNextActions(
  player: Player,
  tables: Table[],
  voice: VoiceProfile | null,
  nav: { openCampaign: (id: string) => void; voice: () => void },
): UpNextAction[] {
  const actions: UpNextAction[] = [];

  for (const t of tables) {
    if (t.isDm) continue;
    const prompt = t.prompts.find((p) => promptIsFor(p, player.did));
    if (prompt) {
      actions.push({
        key: `answer:${t.id}`,
        context: `${t.campaign.title} · your DM asks`,
        title: prompt.title,
        ...(prompt.scene ? { body: prompt.scene } : {}),
        cta: "Answer out loud",
        go: () => nav.openCampaign(t.id),
      });
    }
  }

  for (const t of tables) {
    if (!t.isDm) continue;
    if (t.campaign.party.length === 0) {
      actions.push({
        key: `invite:${t.id}`,
        context: `${t.campaign.title} · you're the DM`,
        title: "Gather your table",
        body: "No one has joined yet. Share the invite code with your players.",
        cta: "Open the table",
        go: () => nav.openCampaign(t.id),
      });
    } else if (t.prompts.length === 0) {
      actions.push({
        key: `first-prompt:${t.id}`,
        context: `${t.campaign.title} · you're the DM`,
        title: "Ask the party their first question",
        body: `${t.campaign.party.length} ${t.campaign.party.length === 1 ? "player is" : "players are"} waiting to hear from you.`,
        cta: "Write a prompt",
        go: () => nav.openCampaign(t.id),
      });
    }
  }

  if (!voice || voice.status === "unlinked") {
    actions.push({
      key: "voice",
      context: "your voice seal",
      title: "Press your voice seal",
      body: "Bardcast tells each chapter in the party's own voices. Yours isn't set up yet.",
      cta: "Set up my voice",
      go: nav.voice,
    });
  }

  return actions;
}

/**
 * Middle tab, and home: the things waiting on you. The first one carries the
 * candle (the single next action on the page); the rest are felt.
 */
export function UpNext({
  player,
  actions,
  loading,
  hasTables,
  onCreate,
  onJoin,
}: {
  player: Player;
  actions: UpNextAction[];
  loading: boolean;
  hasTables: boolean;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const name = player.handle ?? player.did;

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Up next</p>
      <h1 style={{ ...styles.h1, overflowWrap: "anywhere" }}>
        {loading ? `Welcome back, ${name}` : actions.length > 0 ? "The table is waiting on you" : "You're all caught up"}
      </h1>

      {loading ? (
        <p style={styles.muted}>Checking your tables…</p>
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          {actions.map((a, i) => (
            <article key={a.key} style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={styles.meta}>{a.context}</span>
              <h2 style={{ ...styles.h2, fontFamily: font.display, margin: "2px 0 0" }}>{a.title}</h2>
              {a.body && <p style={{ ...styles.muted, margin: 0 }}>{a.body}</p>}
              <div style={{ marginTop: 10 }}>
                <button style={i === 0 ? styles.candle : styles.compact} onClick={a.go}>
                  {a.cta}
                </button>
              </div>
            </article>
          ))}

          {!hasTables && (
            <article style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 6 }}>
              <h2 style={styles.h2}>Find a table</h2>
              <p style={{ ...styles.muted, margin: 0 }}>
                Start a campaign as the DM, or join one with the code your DM sent you.
              </p>
              <div style={{ ...styles.row, marginTop: 10 }}>
                <button style={actions.length === 0 ? styles.candle : styles.secondary} onClick={onCreate}>
                  Start a campaign
                </button>
                <button style={styles.secondary} onClick={onJoin}>
                  Join with a code
                </button>
              </div>
            </article>
          )}

          {hasTables && actions.length === 0 && (
            <p style={styles.muted}>Nothing needs you right now. When your DM sends the next question, it shows up here.</p>
          )}
        </section>
      )}
    </div>
  );
}
