import { color, font, shape, voice } from "@bardcast/brand";
import { useEffect, type ReactNode } from "react";
import { styles } from "../ui.js";

/**
 * The data-ownership page: what lives in the player's own AT Protocol account,
 * what belongs to the campaign, and who else touches it. The home page carries
 * a short version and links here.
 *
 * Keep this in step with docs/character-model.md (where each record lives) and
 * the consent copy in VoiceClone.tsx. Every line here is a promise; if the code
 * changes where something lives, this page changes in the same PR.
 */
export function YourData({ signedIn, onBack, onOpenLogin }: { signedIn: boolean; onBack: () => void; onOpenLogin: () => void }) {
  // Arriving from the home page's long scroll, start at the top.
  useEffect(() => window.scrollTo(0, 0), []);

  return (
    <div style={{ ...styles.page, maxWidth: 640, paddingBottom: 96 }}>
      <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>
        ‹ {signedIn ? "Back to your table" : "Back to the table"}
      </button>

      <header style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <p style={styles.eyebrow}>your data</p>
        <h1 style={{ ...styles.h1, fontSize: "clamp(32px,6vw,44px)", lineHeight: 1.1, margin: 0 }}>What's yours, and what belongs to the table.</h1>
        <p style={styles.lede}>
          Bardcast is built on the AT Protocol, the open network behind Bluesky. Some of what you make here lives in your own account and goes wherever you
          go. Some of it belongs to the campaign you made it in. Here's the whole map.
        </p>
      </header>

      <Section title="Signing in">
        <p style={para}>
          You sign in with your Bluesky or AT Protocol handle. Your password stays with your own provider; Bardcast never sees it. There's no new account
          to make and nothing to forget.
        </p>
      </Section>

      <Section title="Yours, wherever you go">
        <Item name="Your characters">
          Every one you make: name, concept, pronouns, and what drives them. Written to your own AT Protocol account, not ours. If you leave Bardcast, they
          leave with you.
        </Item>
        <Item name="Their character sheets">
          Quirks and personality up front, the 5e numbers underneath, and every level they've earned. Also in your own account. Each change is saved as a
          new version, so the whole history is there. A campaign never edits them; it plays from its own copy.
        </Item>
        <Item name="Your voice profile">
          Whether you've agreed to a voice clone, and a reference to it. Also in your own account.
        </Item>
        <Item name="How your character behaves">
          What Bardcast learns from your answers about how your character talks and acts. We keep it with your character rather than with any one campaign,
          so it follows you to every table.
        </Item>
        <p style={para}>
          One thing to know: what's in your AT Protocol account is public, like a Bluesky post. Anyone can look up your characters and their sheets. What
          happens at the table stays private.
        </p>
      </Section>

      <Section title="The table's">
        <p style={para}>Each campaign has its own private space on the AT Protocol. Your DM and your party can see what's in it. Nobody else can.</p>
        <Item name="Your recordings">
          Every answer you record is stored by Antiphony, the audio service Bardcast is built on, in the campaign's space. They stay with the campaign.
        </Item>
        <Item name="Your seat">
          When you join, your sheet sits down at the table's starting level, so a veteran can join a table of beginners. Hit points rise and fall here and
          never touch your own sheet. Levels and gear earned here stay with the campaign until it ends, then you can bring them home.
        </Item>
        <Item name="The episodes">Every chapter is published to the campaign's space, for the party only.</Item>
      </Section>

      <Section title="Your voice">
        <p style={para}>
          Bardcast only clones your voice if you say yes. When you do, we send your recordings to ElevenLabs, which builds the clone. We keep a reference to it,
          never a copy.
        </p>
        <p style={para}>
          You can take it back whenever you like. We delete the clone at ElevenLabs and stop using your voice in new chapters. Chapters already told stay as
          they are, and your recordings stay with the campaign.
        </p>
      </Section>

      <Section title="Who else is at the table">
        {/* TODO(bardcast): add the story writer once NarrativeWriter has a real adapter. */}
        <Item name="Antiphony">Stores the DM's questions and your recorded answers.</Item>
        <Item name="ElevenLabs">Builds your voice clone, with your consent, and speaks your lines in it.</Item>
        <Item name="Cloudflare">Hosts Bardcast, and reads the transcripts of your answers to work out your character's traits.</Item>
      </Section>

      {!signedIn && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, marginTop: 48 }}>
          <p style={{ fontFamily: font.display, fontSize: 24, margin: 0 }}>There's an open seat at the table.</p>
          <button style={{ ...styles.candle, padding: "0 40px" }} onClick={onOpenLogin}>
            {voice.cta}
          </button>
        </div>
      )}
    </div>
  );
}

const para = { ...styles.muted, fontSize: 16, margin: 0 } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontFamily: font.display, fontWeight: 400, fontSize: 24, margin: 0, paddingBottom: 10, borderBottom: `1px solid ${color.feltLine}` }}>{title}</h2>
      {children}
    </section>
  );
}

function Item({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div style={{ background: color.feltRaised, borderRadius: shape.radius.card, padding: "14px 16px" }}>
      <p style={{ fontWeight: 600, fontSize: 16, margin: 0, color: color.chalk }}>{name}</p>
      <p style={{ ...para, marginTop: 4 }}>{children}</p>
    </div>
  );
}
