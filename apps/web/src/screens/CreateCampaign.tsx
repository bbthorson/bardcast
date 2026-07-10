import { color, font } from "@bardcast/brand";
import type { Campaign, Player } from "@bardcast/domain";
import { useMemo, useState } from "react";
import { styles } from "../ui.js";

/** campaign.<slug> — a stable LocalId (packages/domain/src/ids.ts). */
function toLocalId(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `campaign.${slug || "untitled"}`;
}

/**
 * Create-a-campaign form. Stubbed: there is no create-campaign endpoint on the
 * orchestrator yet, so on submit we assemble the domain `Campaign` locally and
 * show what would be created.
 *
 * TODO(bardcast): POST this to the orchestrator, which persists via the Store
 * port and mints a real invite. The DM's DID is already the durable owner key.
 */
export function CreateCampaign({ player, onBack }: { player: Player; onBack: () => void }) {
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [calendar, setCalendar] = useState("");
  const [created, setCreated] = useState<Campaign | null>(null);

  const localId = useMemo(() => toLocalId(title), [title]);
  const canSubmit = title.trim().length > 0;
  // A throwaway invite token so the DM has something to share in the stub flow.
  const invite = useMemo(() => Math.random().toString(36).slice(2, 8).toUpperCase(), []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setCreated({
      title: title.trim(),
      dm: player.did,
      party: [],
      createdAt: new Date().toISOString(),
      ...(premise.trim() ? { premise: premise.trim() } : {}),
      ...(calendar.trim() ? { calendar: calendar.trim() } : {}),
    });
  }

  if (created) {
    return (
      <div style={styles.page}>
        <button style={styles.ghost} onClick={onBack}>← Back to your table</button>
        <p style={{ ...styles.eyebrow, marginTop: "1rem" }}>Campaign created</p>
        <h1 style={styles.h1}>{created.title}</h1>
        <p style={styles.muted}>
          Your table is set. Share this invite code with your players so they can bring their
          characters.
        </p>
        <div style={{ ...styles.card, marginTop: "1rem" }}>
          <p style={styles.label}>Invite code</p>
          <p style={{ fontFamily: font.mono, fontSize: "1.6rem", letterSpacing: "0.12em", color: color.candleGold, margin: 0 }}>
            {invite}
          </p>
          <p style={{ ...styles.muted, fontSize: "0.8rem", marginTop: "0.75rem", marginBottom: 0 }}>
            Local id <span style={{ fontFamily: font.mono }}>{toLocalId(created.title)}</span> · owner{" "}
            <span style={{ fontFamily: font.mono }}>{created.dm}</span>
          </p>
        </div>
        <p style={{ ...styles.muted, fontSize: "0.8rem", marginTop: "1rem" }}>
          Stubbed — persistence and prompt authoring land with the orchestrator.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <button style={styles.ghost} onClick={onBack}>← Back</button>
      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Start a campaign</h1>
      <p style={styles.muted}>You'll be the DM. You can change any of this later.</p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.25rem" }}>
        <div>
          <label htmlFor="title" style={styles.label}>Campaign title</label>
          <input id="title" style={styles.input} placeholder="The Thornwood Vigil" value={title} onChange={(e) => setTitle(e.target.value)} />
          {title.trim() && <p style={{ ...styles.muted, fontSize: "0.78rem", marginTop: "0.35rem" }}>id: <span style={{ fontFamily: font.mono }}>{localId}</span></p>}
        </div>
        <div>
          <label htmlFor="premise" style={styles.label}>Premise <span style={{ color: color.parchmentDim }}>(optional)</span></label>
          <textarea id="premise" style={{ ...styles.input, minHeight: 110, resize: "vertical", fontFamily: font.body }} placeholder="A hush has fallen over the northern woods, and the last patrol never came home…" value={premise} onChange={(e) => setPremise(e.target.value)} />
        </div>
        <div>
          <label htmlFor="calendar" style={styles.label}>Calendar name <span style={{ color: color.parchmentDim }}>(optional)</span></label>
          <input id="calendar" style={styles.input} placeholder="Reckoning of Ash" value={calendar} onChange={(e) => setCalendar(e.target.value)} />
        </div>
        {/* The one ember action on this screen. */}
        <button type="submit" style={{ ...styles.ember, ...(canSubmit ? null : styles.disabled) }} disabled={!canSubmit}>
          Create campaign
        </button>
      </form>
    </div>
  );
}
