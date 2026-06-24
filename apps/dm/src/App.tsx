import type { CharacterReadiness, PartyReadiness } from "@bardcast/domain";
import { useState } from "react";

const ORCHESTRATOR = import.meta.env["VITE_ORCHESTRATOR_URL"] ?? "http://localhost:8787";

/**
 * DM console shell. Shows the readiness gate per character, lets the DM trigger
 * chapter generation when the party is ready, and lists suggested prompts.
 *
 * TODO(bardcast): real campaign/character selection, lore editor, prompt
 * composer + publish, and chapter playback. This is a wiring shell over the
 * orchestrator's API.
 */
export function App() {
  // TODO(bardcast): select a real campaign + roster.
  const campaignId = "campaign.thornwood";
  const characterIds = ["char.alice", "char.bren"];

  const [readiness, setReadiness] = useState<PartyReadiness | null>(null);
  const [status, setStatus] = useState<string>("");

  const query = characterIds.map((c) => `character=${encodeURIComponent(c)}`).join("&");

  async function refresh() {
    const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${campaignId}/readiness?${query}`);
    setReadiness((await res.json()) as PartyReadiness);
  }

  async function generate() {
    setStatus("The audio is processing…");
    const res = await fetch(`${ORCHESTRATOR}/api/campaigns/${campaignId}/chapters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ characterIds }),
    });
    if (res.status === 409) {
      setStatus("Not ready yet — keep prompting the party.");
      return;
    }
    const { chapter } = (await res.json()) as { chapter: { title: string; status: string } };
    setStatus(`Chapter ready: “${chapter.title}” (${chapter.status})`);
  }

  return (
    <main style={styles.main}>
      <h1>Bardcast — DM Console</h1>
      <p style={styles.muted}>Campaign: {campaignId}</p>

      <div style={styles.row}>
        <button style={styles.btn} onClick={refresh}>Check readiness</button>
        <button
          style={{ ...styles.btn, background: readiness?.ready ? "#36c08f" : "#555" }}
          disabled={!readiness?.ready}
          onClick={generate}
        >
          Generate next chapter
        </button>
      </div>

      {status && <p style={styles.status}>{status}</p>}

      {readiness && (
        <section style={styles.grid}>
          {Object.entries(readiness.perCharacter).map(([id, r]) => (
            <CharacterCard key={id} id={id} r={r} />
          ))}
        </section>
      )}
    </main>
  );
}

function CharacterCard({ id, r }: { id: string; r: CharacterReadiness }) {
  return (
    <article style={{ ...styles.card, borderColor: r.ready ? "#36c08f" : "#a3173a" }}>
      <h3 style={{ margin: "0 0 0.5rem" }}>{id}</h3>
      <Axis label="Sheet" pct={r.sheet.progress} detail={r.sheet.detail} />
      <Axis label="Behavior" pct={r.behavior.progress} detail={r.behavior.detail} />
      <Axis label="Voice" pct={r.voice.progress} detail={r.voice.detail} />
      {!r.ready && r.nextFocus && (
        <p style={styles.muted}>Next: prompt for <strong>{r.nextFocus}</strong></p>
      )}
    </article>
  );
}

function Axis({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  return (
    <div style={{ marginBottom: "0.4rem" }}>
      <div style={styles.axisHead}>
        <span>{label}</span>
        <span style={styles.muted}>{detail}</span>
      </div>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${Math.round(pct * 100)}%` }} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { maxWidth: 880, margin: "0 auto", padding: "2rem", fontFamily: "system-ui, sans-serif" },
  muted: { opacity: 0.6, fontSize: "0.85rem" },
  row: { display: "flex", gap: "0.75rem", margin: "1rem 0" },
  btn: { padding: "0.7rem 1.1rem", borderRadius: 10, border: "none", color: "white", background: "#6d4ed6" },
  status: { padding: "0.75rem 1rem", background: "#f1edff", borderRadius: 8 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem", marginTop: "1rem" },
  card: { border: "2px solid", borderRadius: 12, padding: "1rem" },
  axisHead: { display: "flex", justifyContent: "space-between", fontSize: "0.85rem" },
  track: { height: 8, background: "#eee", borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", background: "#6d4ed6" },
};
