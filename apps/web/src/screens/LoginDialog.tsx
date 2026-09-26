import { color, font } from "@bardcast/brand";
import { useEffect, useRef, useState } from "react";
import { styles } from "../ui.js";

/**
 * The sign-in dialog. Login lives behind a header button now (not a full-page
 * gate), so the marketing landing stays visible behind this overlay. The candle
 * rule applies to the dialog while it's open — the submit is the single lit
 * action.
 */
export function LoginDialog({
  onSignIn,
  loading,
  error,
  onClose,
}: {
  onSignIn: (handle: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [handle, setHandle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canSubmit = handle.trim().length > 0 && !loading;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={overlay}
      onMouseDown={(e) => {
        // Close only when the backdrop itself is clicked, not the dialog.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Sign in to Bardcast" style={{ ...styles.card, width: "100%", maxWidth: 420, position: "relative" }}>
        <button aria-label="Close" onClick={onClose} style={closeBtn}>
          ×
        </button>
        <h2 style={{ ...styles.h2, marginBottom: "0.25rem" }}>Sign in</h2>
        <p style={{ ...styles.muted, marginTop: 0 }}>Use your AT-Protocol handle to pull up a chair.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSignIn(handle.trim());
          }}
        >
          <label htmlFor="handle" style={styles.label}>
            Your AT Protocol handle
          </label>
          <input
            ref={inputRef}
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
            <p role="alert" style={{ color: color.hearthSoft, fontSize: "0.85rem", marginTop: "0.5rem", marginBottom: 0 }}>
              {error}
            </p>
          )}
          {/* The one candle while the dialog is open. */}
          <button type="submit" style={{ ...styles.candle, width: "100%", marginTop: "1rem", ...(canSubmit ? null : styles.disabled) }} disabled={!canSubmit}>
            {loading ? "Opening your PDS…" : "Sign in with your handle"}
          </button>
          <p style={{ ...styles.muted, fontSize: "0.8rem", marginTop: "0.75rem", marginBottom: 0 }}>
            You'll authorize Bardcast at your own PDS. We key everything on your{" "}
            <span style={{ fontFamily: font.mono, color: color.chalk }}>did</span> — so a
            character follows you across campaigns.
          </p>
        </form>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(11, 17, 14, 0.8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  zIndex: 50,
};

const closeBtn: React.CSSProperties = {
  position: "absolute",
  top: "0.5rem",
  right: "0.75rem",
  background: "transparent",
  border: "none",
  color: color.chalkDim,
  fontSize: "1.6rem",
  lineHeight: 1,
  cursor: "pointer",
};
