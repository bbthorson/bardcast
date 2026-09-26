import { color, font, seal, shape, voice, voiceColor } from "@bardcast/brand";
import { useMemo, type CSSProperties } from "react";
import { campaign, party, speakerColor } from "../fixtures/gawain.js";
import { EpisodeWave, HexKey, PlayGlyph, RingStain, SealMark, styles, Waveform } from "../ui.js";

/** Where each seal is set down on the hero, as a share of the column width (placed by hand). */
const HERO: Record<string, { left: string; top: number; size: number; rotate: number; bars: number; z: number }> = {
  morwen: { left: "57%", top: 26, size: 128, rotate: 14, bars: 43, z: 1 },
  cadoc: { left: "10%", top: 196, size: 104, rotate: -11, bars: 40, z: 2 },
  ysolde: { left: "60%", top: 176, size: 118, rotate: -4, bars: 43, z: 3 },
  gawain: { left: "15%", top: 34, size: 176, rotate: 6, bars: 58, z: 4 },
};

const STEPS = [
  { n: "01", title: "The DM sets the scene", body: "A question lands on your phone, addressed to your character." },
  { n: "02", title: "You answer, in character", body: "Every reply fills in your sheet and teaches Bardcast your voice." },
  { n: "03", title: "The chapter is told", body: "The dice fall where they fall, and the episode lands in your feed." },
];

/**
 * The public home page. Tonight's table is a scatter of wax seals, each pressed
 * from a player's voice; below it, how a week at the table works, and a sheet of
 * vellum with a released chapter to listen to.
 *
 * The candle rule: "Pull up a chair" is the single lit action on this screen;
 * the header "Sign in" is its quieter, always-present twin.
 */
export function Landing({ onOpenLogin }: { onOpenLogin: () => void }) {
  const seals = useMemo(() => Object.fromEntries(party.map((p) => [p.id, seal(p.id, { hue: p.hue, bars: HERO[p.id]!.bars })])), []);
  const gawainHue = party[0]!.hue;

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <div style={{ position: "relative", height: 340, marginTop: 8 }} aria-hidden>
        {party.map((p) => {
          const h = HERO[p.id]!;
          const shadow = h.size > 150 ? "0 6px 8px rgba(0,0,0,0.55)" : "0 4px 6px rgba(0,0,0,0.5)";
          return <SealMark key={p.id} seal={seals[p.id]!} size={h.size} rotate={h.rotate} shadow={shadow} style={{ position: "absolute", left: h.left, top: h.top, zIndex: h.z }} />;
        })}
        <span style={{ position: "absolute", left: "38%", top: 300, zIndex: 5, fontFamily: font.mono, fontSize: 12, color: color.chalkDim, transform: "rotate(-3deg)" }}>
          tonight's table · {party.length} voices
        </span>
      </div>

      <div style={{ padding: "8px 24px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 style={{ ...styles.h1, margin: 0 }}>{voice.tagline}</h1>
        <p style={styles.lede}>
          Each week your DM asks the party a few questions. You answer out loud, thirty seconds at a time. Bardcast plays the whole
          session back as a podcast, voiced by all of you.
        </p>
        {/* The one candle on this screen. */}
        <button style={{ ...styles.candle, marginTop: 8 }} onClick={onOpenLogin}>
          {voice.cta}
        </button>
        <span style={{ fontSize: 13, color: color.chalkDim, textAlign: "center" }}>
          Sign in with your <span style={{ fontFamily: font.mono, color: color.chalk }}>AT Protocol</span> handle
        </span>
      </div>

      <ol style={{ margin: "40px 24px 0", padding: 0, listStyle: "none", borderTop: `1px solid ${color.feltLine}` }}>
        {STEPS.map((s, i) => (
          <li key={s.n} style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 12, padding: "20px 0", borderBottom: i < STEPS.length - 1 ? `1px solid ${color.feltLine}` : "none" }}>
            <span style={{ fontFamily: font.mono, fontSize: 13, color: color.chalkDim, paddingTop: 3 }}>{s.n}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: s.n === "02" ? 10 : 4 }}>
              <span style={{ fontFamily: font.display, fontSize: 20 }}>{s.title}</span>
              <span style={styles.muted}>{s.body}</span>
              {s.n === "02" && <RecordingSample hue={gawainHue} />}
            </div>
          </li>
        ))}
      </ol>

      <EpisodeCard />

      <p style={{ fontSize: 13, lineHeight: 1.5, color: color.chalkDim, textAlign: "center", padding: "28px 40px 40px", margin: 0 }}>
        Your character is yours, and comes with you to every campaign.
      </p>

      {/* The one stain on this screen: an ale ring, off to the side of the steps. */}
      <RingStain seed="ale" tone="ale" style={{ right: -66, top: 580, width: 210, height: 210 }} />
    </div>
  );
}

/** An illustration of a reply being recorded — hearth-red key, waveform in the speaker's voice. */
function RecordingSample({ hue }: { hue: number }) {
  return (
    <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 10, background: color.feltRaised, borderRadius: shape.radius.well, padding: "8px 14px 8px 8px", alignSelf: "flex-start" }}>
      <span style={{ width: 28, height: 28, background: color.hearth, clipPath: shape.hex, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: color.chalk }} />
      </span>
      <Waveform seed="rec" bars={24} height={24} fill={voiceColor(hue)} />
      <span style={{ fontFamily: font.mono, fontSize: 13 }}>0:18</span>
    </div>
  );
}

/** "Listen to a table": a released chapter on vellum, set down slightly crooked. */
function EpisodeCard() {
  const s = campaign.sample;
  const speakers: Array<[string, string]> = [["DM", "narrator"], ...party.map((p): [string, string] => [p.shortName, p.id])];
  const ink = speakerColor("vellum");
  const card: CSSProperties = {
    ...styles.vellum,
    margin: "24px 20px 0",
    transform: "rotate(-1.6deg)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };
  return (
    <section style={card} aria-label="Listen to a table">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={styles.vellumEyebrow}>Listen to a table</span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkDim }}>{s.minutes} min</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, color: color.inkDim }}>{campaign.title}</span>
        <span style={{ fontFamily: font.display, fontSize: 24, lineHeight: 1.15 }}>{s.chapter}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* TODO(bardcast): play the released chapter's audioRef once a public sample is rendered. */}
        <HexKey size={48} background={color.ink} label={`Play ${s.chapter}`}>
          <PlayGlyph size={48} fill={color.vellum} />
        </HexKey>
        <EpisodeWave seed="ch1" bars={52} step={5} barWidth={3} height={36} segments={s.segments} played={s.played} colorOf={ink} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {speakers.map(([name, id]) => (
          <span key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: color.inkDim }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: ink(id) }} />
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
