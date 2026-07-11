import { color, font, voice } from "@bardcast/brand";
import { useState } from "react";
import { HearthMark, Wordmark, styles } from "../ui.js";

/**
 * The logged-out front door. One hero, one job: sign in with an AT-Proto handle.
 * The ember rule — the sign-in button is the single lit action on the screen.
 */
export function Landing({
  onSignIn,
  loading,
  error,
}: {
  onSignIn: (handle: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [handle, setHandle] = useState("");
  const canSubmit = handle.trim().length > 0 && !loading;

  return (
    <main style={{ ...styles.main, justifyContent: "center" }}>
      <div style={{ ...styles.page, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
        <HearthMark size={72} />
        <div>
          <Wordmark size="2.6rem" />
          {/* The tagline is canonical brand voice — reused, never re-invented. */}
          <p style={{ ...styles.lede, color: color.parchmentDim, maxWidth: 440, margin: "0.75rem auto 0" }}>
            {voice.tagline}
          </p>
        </div>

        <p style={{ ...styles.muted, maxWidth: 440 }}>
          Bardcast turns your table into characters in an ongoing actual-play podcast — told back to
          you in your own cloned voices. Sign in to start a campaign or join one you were invited to.
        </p>

        <form
          style={{ ...styles.card, width: "100%", maxWidth: 420, textAlign: "left" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSignIn(handle.trim());
          }}
        >
          <label htmlFor="handle" style={styles.label}>
            Your AT-Protocol handle
          </label>
          <input
            id="handle"
            style={styles.input}
            placeholder="you.bsky.social"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
          {error && (
            <p role="alert" style={{ color: color.hearthRed, fontSize: "0.85rem", marginTop: "0.5rem", marginBottom: 0 }}>
              {error}
            </p>
          )}
          <button type="submit" style={{ ...styles.ember, width: "100%", marginTop: "1rem", ...(canSubmit ? null : styles.disabled) }} disabled={!canSubmit}>
            {loading ? "Opening your PDS…" : "Sign in with your handle"}
          </button>
          <p style={{ ...styles.muted, fontSize: "0.8rem", marginTop: "0.75rem", marginBottom: 0 }}>
            You'll authorize Bardcast at your own PDS. We key everything on your{" "}
            <span style={{ fontFamily: font.mono, color: color.candleGold }}>did</span> — so a
            character follows you across campaigns.
          </p>
        </form>
      </div>
    </main>
  );
}
