import { color, font, seal, shape, tornEdge, voiceColor } from "@bardcast/brand";
import { DEFAULT_THRESHOLDS, type Register } from "@bardcast/domain";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { CharacterView } from "../fixtures/gawain.js";
import { Dot, HandNote, HexKey, PlayGlyph, RingStain, SealMark, styles, Waveform } from "../ui.js";

const REGISTER: Record<Register, string> = {
  public: "public",
  private: "private",
  "under-pressure": "under pressure",
  transition: "transition",
};

/** The confidence line: traits below it are still being learned (DEFAULT_THRESHOLDS). */
const LINE = DEFAULT_THRESHOLDS.minTraitConfidence;

/**
 * A character's sheet. The seal and name sit on the felt; the sheet itself is
 * vellum torn off a pad — light stats, what drives them, traits as heard with
 * their confidence, quotes in their own voice, and their arc so far.
 *
 * No candle on this screen: there's no single next action here, only reading.
 */
export function CharacterSheet({
  character: c,
  hue,
  chapterLabel,
  onBack,
}: {
  character: CharacterView;
  hue: number;
  chapterLabel: string;
  onBack: () => void;
}) {
  const heroSeal = useMemo(() => seal(c.id, { hue, bars: 72, amp: 15 }), [c.id, hue]);
  const torn = useMemo(() => tornEdge(`sheet-${c.id}`), [c.id]);
  const inkVoice = voiceColor(hue, "vellum");
  const pronoun = c.pronouns.startsWith("she") ? { subj: "her", poss: "Her" } : c.pronouns.startsWith("they") ? { subj: "them", poss: "Their" } : { subj: "him", poss: "His" };

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
        <button style={styles.back} onClick={onBack}>‹ The party</button>
        <span style={{ ...styles.meta, paddingRight: 12 }}>{chapterLabel}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 24px 28px", textAlign: "center" }}>
        <div style={{ position: "relative", width: 210, height: 210 }}>
          <SealMark seal={heroSeal} size={210} label={`${c.name}'s voice seal`} />
          {/* TODO(bardcast): play a short sample of the character's cloned voice. */}
          <HexKey size={64} background={color.feltLine} label={`Hear ${c.name.split(" ").pop()}'s voice`} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
            <PlayGlyph size={56} fill={color.chalk} />
          </HexKey>
        </div>
        <h1 style={{ fontFamily: font.display, fontWeight: 400, fontSize: 38, margin: "4px 0 0", lineHeight: 1 }}>{c.name}</h1>
        <p style={{ fontSize: 16, lineHeight: 1.45, color: color.chalkDim, margin: 0, maxWidth: 300, textWrap: "pretty" }}>{c.concept}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={styles.chip}>{c.pronouns}</span>
          <span style={styles.chip}>
            played by <span style={{ fontFamily: font.mono }}>{c.player}</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...styles.meta }}>
          <Dot tone={c.voice.status === "unlinked" ? color.hearthSoft : color.moss} />
          {c.voice.status === "unlinked" ? "needs voice" : `voice clone · ${c.voice.status} · ${c.voice.sampledMinutes} min sampled`}
        </div>
      </div>

      <div style={{ ...styles.vellum, borderRadius: 0, clipPath: torn, padding: "40px 22px 36px", display: "flex", flexDirection: "column", gap: 30 }}>
        {/* The one stain on this screen: a cup ring in the corner, clear of the text. */}
        <RingStain seed="cup-3" tone="tea" style={{ right: -46, top: -40, width: 180, height: 180 }} />

        <Section title="Abilities" aside={`lvl ${c.stats.level} · ac ${c.stats.ac} · hp ${c.stats.hp[0]}/${c.stats.hp[1]}`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6 }}>
            {c.stats.abilities.map(([k, v]) => {
              const mod = Math.floor((v - 10) / 2);
              return (
                <div key={k} style={{ border: `1px solid ${color.vellumLine}`, borderRadius: shape.radius.well, padding: "8px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.06em", color: color.inkDim }}>{k}</span>
                  <span style={{ fontFamily: font.display, fontSize: 22 }}>{(mod >= 0 ? "+" : "") + mod}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.inkDim }}>{v}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title={`What drives ${pronoun.subj}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: font.display, fontSize: 19, lineHeight: 1.3 }}>
            {c.drives.map((d) => (
              <span key={d}>{d}</span>
            ))}
            <HandNote ground="vellum" style={{ alignSelf: "flex-end", marginTop: 2 }}>
              {c.dmNote}
            </HandNote>
          </div>
        </Section>

        <Section title="Traits, as heard" aside="confidence" gap={14}>
          {c.traits.map(([name, conf]) => {
            const learning = conf < LINE;
            return (
              <div key={name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: color.inkDim }}>{learning ? `${conf}% · learning` : `${conf}%`}</span>
                </div>
                <div style={{ position: "relative", height: 4, background: color.vellumLine, borderRadius: 2 }} role="meter" aria-valuenow={conf} aria-valuemin={0} aria-valuemax={100} aria-label={name}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${conf}%`, background: learning ? color.learning : inkVoice, borderRadius: 2 }} />
                  <div style={{ position: "absolute", left: `${LINE}%`, top: -3, bottom: -3, width: 1, background: color.inkDim }} />
                </div>
              </div>
            );
          })}
          <span style={{ fontSize: 13, color: color.inkDim }}>Tick marks the {LINE}% line. Traits below it are still being learned.</span>
        </Section>

        <Section title={`In ${pronoun.poss.toLowerCase()} own words`}>
          {c.exemplars.map((e, i) => (
            <figure
              key={i}
              style={{ margin: 0, border: `1px solid ${color.vellumLine}`, borderRadius: shape.radius.well, padding: 16, display: "flex", flexDirection: "column", gap: 12, background: color.vellumRaised, boxShadow: "0 3px 8px rgba(60,45,25,0.18)", transform: `rotate(${e.rotate}deg)` }}
            >
              <blockquote style={{ margin: 0, fontFamily: font.display, fontSize: 18, lineHeight: 1.35 }}>“{e.quote}”</blockquote>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* TODO(bardcast): play the source reply this exemplar was mined from. */}
                <HexKey size={44} background={color.ink} label={`Play “${e.quote}”`}>
                  <PlayGlyph size={40} fill={color.vellum} />
                </HexKey>
                <Waveform seed={`ex${i + 1}`} bars={30} height={24} fill={inkVoice} />
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkDim, marginLeft: "auto" }}>{e.chapter}</span>
              </div>
            </figure>
          ))}
        </Section>

        <Section title={`${pronoun.poss} arc so far`} gap={0}>
          {c.arc.map((a) => (
            <div key={a.date} style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, padding: "12px 0", borderTop: `1px solid ${color.vellumLine}` }}>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkDim, paddingTop: 2 }}>{a.date}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 15, lineHeight: 1.4 }}>{a.state}</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.inkDim }}>{REGISTER[a.register]}</span>
              </div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, aside, gap = 12, children }: { title: string; aside?: string; gap?: number; children: ReactNode }) {
  const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: gap === 0 ? 12 : 0 };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap, position: "relative" }}>
      <div style={head}>
        <h2 style={{ ...styles.vellumEyebrow, fontWeight: 400, margin: 0 }}>{title}</h2>
        {aside && <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkDim }}>{aside}</span>}
      </div>
      {children}
    </section>
  );
}
