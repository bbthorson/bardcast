import { color, font } from "@bardcast/brand";
import type { VoiceProfile } from "@bardcast/domain";
import { useAudioRecorder } from "../useAudioRecorder.js";
import { styles } from "../ui.js";

interface VoiceActions {
  profile: VoiceProfile | null;
  startClone: () => void;
  linkPvc: (sharingLink: string) => void;
  setIvc: (voiceId: string) => void;
  revoke: () => void;
}

export function VoiceClone({ profile, startClone, linkPvc, setIvc, revoke, onBack }: VoiceActions & { onBack: () => void }) {
  const status = profile?.status ?? "unlinked";
  
  // Local role toggle for previewing the onboarding flows
  const [role, setRole] = useState<"player" | "dm">("player");

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button style={styles.ghost} onClick={onBack}>← Back to your table</button>
        <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.8rem", background: color.walnut, padding: "0.25rem 0.5rem", borderRadius: 4 }}>
          <button style={{ border: "none", background: role === "player" ? color.candleGold : "transparent", color: role === "player" ? color.inkBlack : color.parchment, borderRadius: 2, padding: "2px 6px", cursor: "pointer" }} onClick={() => setRole("player")}>Player Flow</button>
          <button style={{ border: "none", background: role === "dm" ? color.candleGold : "transparent", color: role === "dm" ? color.inkBlack : color.parchment, borderRadius: 2, padding: "2px 6px", cursor: "pointer" }} onClick={() => setRole("dm")}>DM Flow</button>
        </div>
      </div>

      <h1 style={{ ...styles.h1, marginTop: "0.75rem" }}>Your voice clone</h1>
      <p style={styles.muted}>
        Bardcast brings your RPG characters to life using cloned voices. You are always in control of your voice model.
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        {!profile?.consent ? (
          <ConsentGate onConsent={startClone} />
        ) : status === "unlinked" ? (
          role === "dm" ? (
            <DmOrientation onLink={linkPvc} />
          ) : (
            <PlayerOrientation onAutoIvc={() => setIvc("auto-ivc-" + Math.floor(Math.random() * 1000))} onLink={linkPvc} />
          )
        ) : (
          <Ready status={status} modelRef={profile.modelRef || ""} onRevoke={revoke} onDone={onBack} />
        )}
      </div>
    </div>
  );
}

import { useState } from "react";

function ConsentGate({ onConsent }: { onConsent: () => void }) {
  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>Consent to voice cloning</h2>
      <p style={styles.muted}>
        Bardcast uses voice clones so chapters are read back to your group in your own voices. We only store an opaque ElevenLabs reference, never raw biometrics. You can revoke this permission at any time.
      </p>
      <button style={{ ...styles.ember, marginTop: "0.5rem" }} onClick={onConsent}>
        I consent — set up my voice clone
      </button>
    </article>
  );
}

function DmOrientation({ onLink }: { onLink: (link: string) => void }) {
  const [linkInput, setLinkInput] = useState("");

  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>DM Setup: Professional Voice Clone</h2>
      <p style={styles.muted}>
        As the DM/Narrator, you carry the voice weight. Let's create your Professional Voice Clone:
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
          style={{ width: "100%", padding: "0.5rem", borderRadius: 4, border: `1px solid ${color.walnutRaised}`, background: color.inkBlack, color: color.parchment, marginBottom: "0.5rem" }}
        />
        <button style={styles.ember} onClick={() => onLink(linkInput)} disabled={!linkInput}>
          Link my Narrator voice
        </button>
      </div>
    </article>
  );
}

function PlayerOrientation({ onAutoIvc, onLink }: { onAutoIvc: () => void; onLink: (link: string) => void }) {
  const [showOverride, setShowOverride] = useState(false);
  const [linkInput, setLinkInput] = useState("");

  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>Player Setup: Zero Friction</h2>
      <p style={styles.muted}>
        You don't need to configure anything. Bardcast will automatically build an <strong>Instant Voice Clone</strong> for you from your very first in-game prompt reply.
      </p>
      
      <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem" }}>
        <button style={styles.ember} onClick={onAutoIvc}>
          Continue (Use Auto-Clone)
        </button>
        <button style={styles.secondary} onClick={() => setShowOverride(!showOverride)}>
          Link PVC instead
        </button>
      </div>

      {showOverride && (
        <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${color.walnutRaised}`, paddingTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.35rem" }}>Paste private ElevenLabs sharing link:</label>
          <input 
            type="text" 
            value={linkInput} 
            onChange={(e) => setLinkInput(e.target.value)} 
            placeholder="https://elevenlabs.io/app/share/..."
            style={{ width: "100%", padding: "0.5rem", borderRadius: 4, border: `1px solid ${color.walnutRaised}`, background: color.inkBlack, color: color.parchment, marginBottom: "0.5rem" }}
          />
          <button style={styles.ember} onClick={() => onLink(linkInput)} disabled={!linkInput}>
            Link PVC Voice
          </button>
        </div>
      )}
    </article>
  );
}

function Ready({ status, modelRef, onRevoke, onDone }: { status: "ivc" | "pvc"; modelRef: string; onRevoke: () => void; onDone: () => void }) {
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
          ? "Your voice clone is currently set to use your in-game replies automatically." 
          : "Your Professional Voice Clone has been linked to your account."}
      </p>
      <p style={{ ...styles.muted, fontSize: "0.78rem" }}>
        Reference: <span style={{ fontFamily: font.mono, color: color.candleGold }}>{modelRef}</span>
      </p>
      <div style={{ ...styles.row, marginTop: "1rem", gap: "0.5rem" }}>
        <button style={styles.danger} onClick={onRevoke}>Revoke consent &amp; unlink</button>
        <button style={styles.ember} onClick={onDone}>Done</button>
      </div>
    </article>
  );
}

