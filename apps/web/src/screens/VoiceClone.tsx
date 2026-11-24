import { useState } from "react";
import { color, font } from "@bardcast/brand";
import type { VoiceProfile } from "@bardcast/domain";
import { styles } from "../ui.js";

interface VoiceActions {
  profile: VoiceProfile | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  startClone: () => Promise<void>;
  trainIvc: () => Promise<void>;
  linkPvc: (sharingLink: string) => Promise<void>;
  revoke: () => Promise<void>;
}

export function VoiceClone({
  profile,
  loading,
  busy,
  error,
  notice,
  startClone,
  trainIvc,
  linkPvc,
  revoke,
  onBack,
}: VoiceActions & { onBack: () => void }) {
  const status = profile?.status ?? "unlinked";
  const [role, setRole] = useState<"player" | "dm">("player");

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>‹ Back to your table</button>
        <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.8rem", background: color.felt, padding: "0.25rem 0.5rem", borderRadius: 4 }}>
          <button
            style={{ border: "none", background: role === "player" ? color.chalk : "transparent", color: role === "player" ? color.felt : color.chalk, borderRadius: 2, padding: "2px 6px", cursor: "pointer" }}
            onClick={() => setRole("player")}
          >
            Player Flow
          </button>
          <button
            style={{ border: "none", background: role === "dm" ? color.chalk : "transparent", color: role === "dm" ? color.felt : color.chalk, borderRadius: 2, padding: "2px 6px", cursor: "pointer" }}
            onClick={() => setRole("dm")}
          >
            DM Flow
          </button>
        </div>
      </div>

      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Your voice clone</h1>
      <p style={styles.muted}>
        Your character speaks in your voice. Whether that happens is up to you, and you can change your mind.
      </p>

      {error && (
        <p style={{ color: color.hearthSoft, fontSize: "0.9rem", margin: "0.75rem 0 0" }}>{error}</p>
      )}
      {notice && (
        <p style={{ color: color.moss, fontSize: "0.9rem", margin: "0.75rem 0 0" }}>{notice}</p>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        {loading ? (
          <p style={styles.muted}>Checking your voice seal…</p>
        ) : !profile?.consent ? (
          <ConsentGate busy={busy} onConsent={() => void startClone()} />
        ) : status === "unlinked" ? (
          role === "dm" ? (
            <DmOrientation busy={busy} onLink={(link) => void linkPvc(link)} onRevoke={() => void revoke()} />
          ) : (
            <PlayerOrientation
              busy={busy}
              onTrainIvc={() => void trainIvc()}
              onLink={(link) => void linkPvc(link)}
              onRevoke={() => void revoke()}
            />
          )
        ) : (
          <Ready
            status={status}
            modelRef={profile.modelRef || ""}
            busy={busy}
            onRevoke={() => void revoke()}
            onDone={onBack}
          />
        )}
      </div>
    </div>
  );
}

/** What cloning takes, in plain words. Consent copy stays literal (docs/brand.md, "Don't show the machine"). */
const CONSENT_TERMS: { title: string; body: string }[] = [
  {
    title: "Your recordings",
    body: "Every answer you record is stored by Antiphony, the audio service Bardcast is built on. Answers at the table go in your campaign's private space: your DM and your party can hear them, nobody else can, and they stay with the campaign. Answers while you make a character go in a private space only you can hear. Either way they're kept whether or not you clone your voice.",
  },
  {
    title: "Your clone",
    body: "If you say yes, we send your recordings to ElevenLabs, which builds a voice clone from them. Bardcast keeps a reference to that clone, never a copy of it.",
  },
  {
    title: "Your episodes",
    body: "Chapters told in your voice are published to the campaign's space, for the party only.",
  },
  {
    title: "Taking it back",
    body: "Revoke whenever you like. We delete the clone at ElevenLabs and stop using your voice in new chapters. Chapters already told stay as they are, and your recordings stay where they are.",
  },
];

function ConsentGate({ busy, onConsent }: { busy: boolean; onConsent: () => void }) {
  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>Before we clone your voice</h2>
      <p style={{ ...styles.muted, marginTop: 0 }}>Here is exactly what it takes.</p>
      <dl style={{ margin: "1rem 0 0", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {CONSENT_TERMS.map((t) => (
          <div key={t.title}>
            <dt style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</dt>
            <dd style={{ ...styles.muted, margin: "0.2rem 0 0" }}>{t.body}</dd>
          </div>
        ))}
      </dl>
      <button style={{ ...styles.candle, marginTop: "1.25rem", ...(busy ? styles.disabled : null) }} disabled={busy} onClick={onConsent}>
        {busy ? "Saving consent…" : "I consent — clone my voice"}
      </button>
    </article>
  );
}

function DmOrientation({
  busy,
  onLink,
  onRevoke,
}: {
  busy: boolean;
  onLink: (link: string) => void;
  onRevoke: () => void;
}) {
  const [linkInput, setLinkInput] = useState("");

  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>DM Setup: Professional Voice Clone</h2>
      <p style={styles.muted}>
        As the DM/Narrator, you carry the voice weight. Link your ElevenLabs Professional Voice Clone:
      </p>
      <ol style={{ ...styles.muted, paddingLeft: "1.25rem", margin: "0.5rem 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <li>Go to ElevenLabs.io and create a Creator account.</li>
        <li>Upload 30+ minutes of clean voice recordings.</li>
        <li>Verify your voice in the ElevenLabs console.</li>
        <li>Enable private sharing on the voice and copy the sharing link.</li>
      </ol>
      <div style={{ marginTop: "1rem" }}>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.35rem" }}>Paste private ElevenLabs sharing link:</label>
        <input
          type="text"
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          placeholder="https://elevenlabs.io/app/share/..."
          disabled={busy}
          style={{ ...styles.input, marginBottom: 12 }}
        />
        <div style={{ ...styles.row, gap: "0.5rem" }}>
          <button style={styles.candle} onClick={() => onLink(linkInput)} disabled={!linkInput.trim() || busy}>
            {busy ? "Linking…" : "Link my Narrator voice"}
          </button>
          <button style={styles.secondary} onClick={onRevoke} disabled={busy}>
            Revoke consent
          </button>
        </div>
      </div>
    </article>
  );
}

function PlayerOrientation({
  busy,
  onTrainIvc,
  onLink,
  onRevoke,
}: {
  busy: boolean;
  onTrainIvc: () => void;
  onLink: (link: string) => void;
  onRevoke: () => void;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [linkInput, setLinkInput] = useState("");

  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>Player Setup: Instant Voice Clone</h2>
      <p style={styles.muted}>
        Your consent is saved. If you answered Session Zero out loud, build your Instant Voice Clone now — otherwise Bardcast will build it automatically from your first spoken answer at the table.
      </p>

      <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button style={styles.candle} onClick={onTrainIvc} disabled={busy}>
          {busy ? "Building voice clone…" : "Build my voice clone now"}
        </button>
        <button style={styles.secondary} onClick={() => setShowOverride(!showOverride)} disabled={busy}>
          Link PVC instead
        </button>
        <button style={styles.quiet} onClick={onRevoke} disabled={busy}>
          Revoke consent
        </button>
      </div>

      {showOverride && (
        <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${color.feltLine}`, paddingTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.35rem" }}>Paste private ElevenLabs sharing link:</label>
          <input
            type="text"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://elevenlabs.io/app/share/..."
            disabled={busy}
            style={{ ...styles.input, marginBottom: 12 }}
          />
          <button style={styles.compact} onClick={() => onLink(linkInput)} disabled={!linkInput.trim() || busy}>
            {busy ? "Linking…" : "Link PVC Voice"}
          </button>
        </div>
      )}
    </article>
  );
}

function Ready({
  status,
  modelRef,
  busy,
  onRevoke,
  onDone,
}: {
  status: "ivc" | "pvc";
  modelRef: string;
  busy: boolean;
  onRevoke: () => void;
  onDone: () => void;
}) {
  return (
    <article style={{ ...styles.card, borderColor: color.moss, borderWidth: 1, borderStyle: "solid" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: color.moss }} />
        <h2 style={{ ...styles.h2, margin: 0 }}>
          Voice active ({status.toUpperCase()})
        </h2>
      </div>
      <p style={{ ...styles.muted, marginTop: "0.75rem" }}>
        {status === "ivc"
          ? "Your Instant Voice Clone is active and ready for chapters."
          : "Your Professional Voice Clone has been linked to your account."}
      </p>
      <p style={{ ...styles.muted, fontSize: "0.78rem" }}>
        Reference: <span style={{ fontFamily: font.mono, color: color.chalk }}>{modelRef}</span>
      </p>
      <p style={{ ...styles.muted, fontSize: 14 }}>
        Revoking deletes the clone at ElevenLabs. Chapters already told keep your voice, and your recordings stay where they are in Antiphony.
      </p>
      <div style={{ ...styles.row, marginTop: "1rem", gap: "0.5rem" }}>
        <button style={styles.danger} onClick={onRevoke} disabled={busy}>
          {busy ? "Revoking…" : "Revoke consent & unlink"}
        </button>
        <button style={styles.candle} onClick={onDone} disabled={busy}>Done</button>
      </div>
    </article>
  );
}
