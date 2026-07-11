import { color, font, voice } from "@bardcast/brand";
import { HearthMark, Wordmark, styles } from "../ui.js";

/**
 * The public landing page — visible to everyone, signed in or not. Login is a
 * header button (and the hero CTA here), not a gate, so a first-time visitor
 * actually sees what Bardcast is before signing in.
 *
 * The ember rule: the hero CTA is the single lit action on this screen; the
 * header "Sign in" is the quieter, always-present twin.
 */
export function Landing({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <div style={styles.page}>
      <section style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", padding: "2rem 0 1rem" }}>
        <HearthMark size={72} />
        <div>
          <Wordmark size="2.6rem" />
          {/* The tagline is canonical brand voice — reused, never re-invented. */}
          <p style={{ ...styles.lede, color: color.parchmentDim, maxWidth: 460, margin: "0.75rem auto 0" }}>
            {voice.tagline}
          </p>
        </div>
        <p style={{ ...styles.muted, maxWidth: 460 }}>
          Bardcast turns your table into characters in an ongoing actual-play podcast — generated
          from your own recorded replies and told back to you in your own cloned voices.
        </p>
        {/* The one ember action on this screen. */}
        <button style={{ ...styles.ember, marginTop: "0.25rem" }} onClick={onOpenLogin}>
          Sign in to begin
        </button>
        <p style={{ ...styles.muted, fontSize: "0.8rem" }}>
          with your{" "}
          <span style={{ fontFamily: font.mono, color: color.candleGold }}>AT-Protocol</span> handle
        </p>
      </section>

      <section style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: "1.5rem" }}>
        <ValueCard title="Start a campaign">
          You're the DM. Set the premise, gather your table, and send the first prompt.
        </ValueCard>
        <ValueCard title="Join an invite">
          Got a code from your DM? Bring your character to a table you were invited to.
        </ValueCard>
        <ValueCard title="Your voice, cloned">
          Your recorded replies build your character and train a model of your voice — so chapters
          are told in it.
        </ValueCard>
      </section>

      <p style={{ ...styles.muted, fontSize: "0.8rem", textAlign: "center", marginTop: "2rem" }}>
        Your character is keyed to your{" "}
        <span style={{ fontFamily: font.mono, color: color.candleGold }}>did</span> — so it follows
        you across campaigns.
      </p>
    </div>
  );
}

function ValueCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article style={styles.card}>
      <h2 style={{ ...styles.h2, fontSize: "1.15rem" }}>{title}</h2>
      <p style={{ ...styles.muted, margin: 0 }}>{children}</p>
    </article>
  );
}
