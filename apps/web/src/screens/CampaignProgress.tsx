import { color, font, seal, shape, trail, voice, voiceColor, type Seal } from "@bardcast/brand";
import { useMemo } from "react";
import { campaign, characters, dm, party, readinessOf, speakerColor, type ChapterView } from "../fixtures/gawain.js";
import { Die, EpisodeWave, HandNote, HexKey, PlayGlyph, SealMark, SplatterStain, Stop, styles } from "../ui.js";

/**
 * Campaign progress: the quest spine as a hand-drawn trail with a stop per
 * chapter. Told chapters carry an episode player and the beats that happened
 * (with the die that decided them); the chapter being gathered shows who's
 * ready to be heard across the readiness gate's three axes.
 *
 * The candle rule: "Answer as <character>" on the DM's question is the single
 * lit action on this screen.
 */
export function CampaignProgress({ onAnswer, onOpenCharacter }: { onAnswer: () => void; onOpenCharacter: (id: string) => void }) {
  const seals = useMemo(() => Object.fromEntries(party.map((p) => [p.id, seal(p.id, { hue: p.hue, bars: 29 })])), []);
  const dmSeal = useMemo(() => seal(dm.seed, { bone: true, bars: 29 }), []);
  const path = useMemo(() => trail("trail", campaign.walked), []);
  const asked = party.find((p) => p.id === campaign.prompt.to)!;

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: "8px 24px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={styles.eyebrow}>{campaign.eyebrow}</span>
        <h1 style={{ ...styles.h1, fontSize: 32, margin: 0 }}>{campaign.title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <div style={{ display: "flex" }}>
            {party.map((p) => (
              <SealMark key={p.id} seal={seals[p.id]!} size={34} label={p.name} style={{ marginRight: -4 }} />
            ))}
          </div>
          <span style={{ fontSize: 14, color: color.chalkDim, marginLeft: 8 }}>
            {party.length} players · DM <span style={{ fontFamily: font.mono }}>{dm.handle}</span>
          </span>
        </div>
      </div>

      {/* The DM's question, set down a little crooked. */}
      <section style={{ ...styles.card, margin: "22px 16px 0", transform: "rotate(0.9deg)", boxShadow: "0 10px 24px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SealMark seal={dmSeal} size={36} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{voice.promptNotification(asked.shortName)}</span>
            <span style={styles.meta}>{campaign.prompt.asked}</span>
          </div>
        </div>
        <p style={{ fontFamily: font.display, fontSize: 20, lineHeight: 1.35, margin: 0, textWrap: "pretty" }}>{campaign.prompt.text}</p>
        {/* The one candle on this screen. */}
        <button style={styles.candle} onClick={onAnswer}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: color.felt }} />
          {voice.answerAs(asked.shortName)} · 0:{String(campaign.prompt.seconds).padStart(2, "0")}
        </button>
      </section>

      <div style={{ padding: "34px 24px 44px", position: "relative" }}>
        <svg viewBox="0 0 20 1000" preserveAspectRatio="none" aria-hidden style={{ position: "absolute", left: 34, top: 44, width: 20, height: "calc(100% - 154px)", overflow: "visible" }}>
          <path d={path.full} stroke={color.feltWorn} strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
          <path d={path.walked} stroke={color.chalk} strokeWidth={2.2} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>

        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {campaign.chapters.map((ch, i) => (
            <li key={ch.numeral} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 14, position: "relative", marginTop: i === 0 ? 0 : i === 1 ? 26 : 30 }}>
              <Stop numeral={ch.numeral} state={ch.state} />
              {ch.state === "told" ? (
                <ToldChapter ch={ch} />
              ) : ch.state === "gathering" ? (
                <GatheringChapter ch={ch} seals={seals} onOpenCharacter={onOpenCharacter} />
              ) : (
                <SealedChapter ch={ch} />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ToldChapter({ ch }: { ch: ChapterView }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 10, minWidth: 0 }}>
      <span style={styles.meta}>
        told · {ch.when} · {ch.minutes} min
      </span>
      <h2 style={{ ...styles.h2, margin: 0 }}>{ch.title}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* TODO(bardcast): play the chapter's rendered audioRef. */}
        <HexKey size={44} background={color.feltLine} label={`Play ${ch.title}`}>
          <PlayGlyph size={40} fill={color.chalk} />
        </HexKey>
        <EpisodeWave seed={`ch${ch.numeral}`} bars={46} height={30} segments={ch.segments ?? []} played={ch.played ?? 0} colorOf={speakerColor("felt")} />
      </div>
      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {ch.beats?.map((b) => {
          const who = party.find((p) => p.id === b.who);
          return (
            <li key={b.text} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.4, color: color.chalkDim }}>
              <span style={{ flex: "none", width: 6, height: 6, borderRadius: 999, background: who ? voiceColor(who.hue) : color.chalk, marginTop: 7 }} />
              {b.text}
              {b.roll && <Die {...b.roll} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GatheringChapter({ ch, seals, onOpenCharacter }: { ch: ChapterView; seals: Record<string, Seal>; onOpenCharacter: (id: string) => void }) {
  const rows = party.map((p) => ({ p, r: readinessOf(p) }));
  const ready = rows.filter((x) => x.r.ready).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <span style={styles.meta}>gathering voices · {ch.when}</span>
      <h2 style={{ ...styles.h2, margin: 0 }}>{ch.title}</h2>
      {ch.dmNote && (
        <HandNote ground="felt" rotate={-2} style={{ margin: "-2px 0 2px 6px" }}>
          {ch.dmNote}
        </HandNote>
      )}
      <section style={{ background: color.feltRaised, borderRadius: shape.radius.card, padding: 16, display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Who's ready to be heard</span>
          <span style={styles.meta}>
            {ready} of {rows.length} ready
          </span>
        </div>
        {rows.map(({ p, r }) => {
          // Rows open the character's sheet where one exists.
          const hasSheet = p.id in characters;
          return (
          <button
            key={p.id}
            onClick={hasSheet ? () => onOpenCharacter(p.id) : undefined}
            disabled={!hasSheet}
            aria-label={`${p.name}: ${r.status}`}
            style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "center", background: "transparent", border: "none", padding: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: hasSheet ? "pointer" : "default" }}
          >
            <SealMark seal={seals[p.id]!} size={32} />
            <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: r.ready ? color.moss : r.status === "needs voice" ? color.hearthSoft : color.chalkDim }}>{r.status}</span>
              </span>
              <span style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
                {r.axes.map((v, i) => (
                  <span key={i} style={{ height: 4, borderRadius: 2, background: color.feltLine, position: "relative", overflow: "hidden" }}>
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round(v * 100)}%`, background: voiceColor(p.hue) }} />
                  </span>
                ))}
              </span>
            </span>
          </button>
          );
        })}
        <div aria-hidden style={{ display: "grid", gridTemplateColumns: "32px repeat(3, minmax(0, 1fr))", gap: 4, fontFamily: font.mono, fontSize: 10, color: color.chalkDim, marginTop: -8 }}>
          <span />
          <span style={{ paddingLeft: 10 }}>sheet</span>
          <span>behavior</span>
          <span>voice</span>
        </div>
      </section>
    </div>
  );
}

function SealedChapter({ ch }: { ch: ChapterView }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={styles.meta}>{ch.when}</span>
      <h2 style={{ ...styles.h2, margin: 0, color: color.chalkDim }}>{ch.title}</h2>
      {/* The one stain on this screen: blood, where the story turns dangerous. */}
      <SplatterStain seed="chapel" style={{ right: -24, top: -58, width: 170, height: 170 }} />
    </div>
  );
}
