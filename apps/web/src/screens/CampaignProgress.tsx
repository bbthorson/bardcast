import { color, font, seal, shape, trail, voice, voiceColor, voiceHues, type Seal } from "@bardcast/brand";
import { useMemo, useState, useEffect } from "react";
import { campaign, dm, party, readinessOf, speakerColor, type ChapterView, type PartyMember } from "../fixtures/gawain.js";
import { Die, EpisodeWave, HandNote, HexKey, PlayGlyph, SealMark, SplatterStain, Stop, styles } from "../ui.js";
import {
  fetchCampaignDetail,
  fetchCampaignPrompts,
  fetchPartyReadiness,
  type CampaignDetail,
} from "../api.js";
import type { PartyReadiness, Prompt } from "@bardcast/domain";

/**
 * Campaign progress: the quest spine as a hand-drawn trail with a stop per
 * chapter. Told chapters carry an episode player and the beats that happened
 * (with the die that decided them); the chapter being gathered shows who's
 * ready to be heard across the readiness gate's three axes.
 *
 * Connects to the orchestrator for live campaign state while falling back
 * gracefully to the Sir Gawain fixture.
 *
 * The candle rule: "Answer as <character>" on the DM's question is the single
 * lit action on this screen.
 */
export function CampaignProgress({
  campaignId,
  onAnswer,
  onOpenCharacter,
}: {
  campaignId?: string;
  onAnswer: (promptUri?: string) => void;
  onOpenCharacter: (id: string) => void;
}) {
  const [campaignData, setCampaignData] = useState<CampaignDetail | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [readiness, setReadiness] = useState<PartyReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cId = campaignId || "gawain-green-knight";
    fetchCampaignDetail(cId).then(async (detail) => {
      if (cancelled || !detail) return;
      setCampaignData(detail);
      const charIds = detail.party.map((p) => p.id);
      const [promptList, ready] = await Promise.all([
        fetchCampaignPrompts(cId),
        charIds.length > 0 ? fetchPartyReadiness(cId, charIds) : Promise.resolve(null),
      ]);
      if (!cancelled) {
        setPrompts(promptList);
        setReadiness(ready);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const partyList: PartyMember[] = useMemo(() => {
    if (!campaignData?.party || campaignData.party.length === 0) {
      return party;
    }
    return campaignData.party.map((p, idx) => {
      const defaultFixture = party.find((fp) => fp.id === p.id);
      const r = readiness?.perCharacter[p.id];
      return {
        id: p.id,
        name: p.profile?.displayName || defaultFixture?.name || p.id,
        shortName: (p.profile?.displayName || defaultFixture?.shortName || p.id).split(" ")[0]!,
        handle: p.profile?.player
          ? `@${p.profile.player.replace(/^did:[^:]+:/, "").slice(0, 10)}`
          : defaultFixture?.handle || `@${p.id}`,
        hue: defaultFixture?.hue ?? voiceHues[idx % voiceHues.length]!,
        confidentTraits: r ? Math.round(r.sheet.progress * 5) : defaultFixture?.confidentTraits ?? 5,
        exemplars: r ? Math.round(r.behavior.progress * 8) : defaultFixture?.exemplars ?? 8,
        voice: r ? (r.voice.progress > 0 ? "ivc" : "unlinked") : defaultFixture?.voice ?? "unlinked",
      };
    });
  }, [campaignData, readiness]);

  const activePrompt = useMemo(() => {
    if (prompts.length > 0) {
      const p = prompts[prompts.length - 1]!;
      const targetId = p.audience?.[0]?.replace(/^at:\/\//, "") || partyList[0]?.id || "gawain";
      return {
        to: targetId,
        asked: `asked ${new Date(p.createdAt).toLocaleDateString()}`,
        text: p.title + (p.scene ? ` — ${p.scene}` : ""),
        seconds: 30,
        antiphonyPromptUri: p.antiphonyPromptUri,
      };
    }
    return {
      to: campaign.prompt.to,
      asked: campaign.prompt.asked,
      text: campaign.prompt.text,
      seconds: campaign.prompt.seconds,
      antiphonyPromptUri: undefined as string | undefined,
    };
  }, [prompts, partyList]);

  const chapterList: ChapterView[] = useMemo(() => {
    if (campaignData?.chapters && campaignData.chapters.length > 0) {
      const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
      return campaignData.chapters.map((ch, idx) => ({
        numeral: romanNumerals[idx] ?? String(ch.index),
        title: ch.title,
        state: ch.status === "ready" ? "told" : ch.status === "drafting" ? "sealed" : "gathering",
        when: ch.storyDate ?? (ch.status === "ready" ? "recorded" : "gathering voices"),
        minutes: Math.max(1, Math.round((ch.script.length * 4) / 60)),
        beats: ch.beats.map((b) => ({ who: ch.script[0]?.speaker ?? "narrator", text: b.summary })),
        played: ch.status === "ready" ? 1 : 0,
      }));
    }
    return campaign.chapters;
  }, [campaignData]);

  const walkedRatio = useMemo(() => {
    const told = chapterList.filter((c) => c.state === "told").length;
    return chapterList.length > 0 ? told / chapterList.length : campaign.walked;
  }, [chapterList]);

  const title = campaignData?.campaign.title || campaign.title;
  const eyebrow = campaignData?.campaign.premise || campaign.eyebrow;
  const dmHandle = campaignData?.campaign.dm
    ? `@${campaignData.campaign.dm.replace(/^did:[^:]+:/, "").slice(0, 10)}`
    : dm.handle;

  const seals = useMemo(
    () => Object.fromEntries(partyList.map((p) => [p.id, seal(p.id, { hue: p.hue, bars: 29 })])),
    [partyList],
  );
  const dmSeal = useMemo(() => seal(dm.seed, { bone: true, bars: 29 }), []);
  const path = useMemo(() => trail("trail", walkedRatio), [walkedRatio]);
  const asked = partyList.find((p) => p.id === activePrompt.to) || partyList[0]!;

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: "8px 24px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={styles.eyebrow}>{eyebrow}</span>
        <h1 style={{ ...styles.h1, fontSize: 32, margin: 0 }}>{title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <div style={{ display: "flex" }}>
            {partyList.map((p) => (
              <SealMark key={p.id} seal={seals[p.id]!} size={34} label={p.name} style={{ marginRight: -4 }} />
            ))}
          </div>
          <span style={{ fontSize: 14, color: color.chalkDim, marginLeft: 8 }}>
            {partyList.length} players · DM <span style={{ fontFamily: font.mono }}>{dmHandle}</span>
          </span>
        </div>
      </div>

      {/* The DM's question, set down a little crooked. */}
      <section style={{ ...styles.card, margin: "22px 16px 0", transform: "rotate(0.9deg)", boxShadow: "0 10px 24px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SealMark seal={dmSeal} size={36} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{voice.promptNotification(asked.shortName)}</span>
            <span style={styles.meta}>{activePrompt.asked}</span>
          </div>
        </div>
        <p style={{ fontFamily: font.display, fontSize: 20, lineHeight: 1.35, margin: 0, textWrap: "pretty" }}>{activePrompt.text}</p>
        {/* The one candle on this screen. */}
        <button style={styles.candle} onClick={() => onAnswer(activePrompt.antiphonyPromptUri)}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: color.felt }} />
          {voice.answerAs(asked.shortName)} · 0:{String(activePrompt.seconds).padStart(2, "0")}
        </button>
      </section>

      <div style={{ padding: "34px 24px 44px", position: "relative" }}>
        <svg viewBox="0 0 20 1000" preserveAspectRatio="none" aria-hidden style={{ position: "absolute", left: 34, top: 44, width: 20, height: "calc(100% - 154px)", overflow: "visible" }}>
          <path d={path.full} stroke={color.feltWorn} strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
          <path d={path.walked} stroke={color.chalk} strokeWidth={2.2} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>

        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {chapterList.map((ch, i) => (
            <li key={ch.numeral} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 14, position: "relative", marginTop: i === 0 ? 0 : i === 1 ? 26 : 30 }}>
              <Stop numeral={ch.numeral} state={ch.state} />
              {ch.state === "told" ? (
                <ToldChapter ch={ch} />
              ) : ch.state === "gathering" ? (
                <GatheringChapter ch={ch} seals={seals} partyList={partyList} onOpenCharacter={onOpenCharacter} />
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

function GatheringChapter({
  ch,
  seals,
  partyList,
  onOpenCharacter,
}: {
  ch: ChapterView;
  seals: Record<string, Seal>;
  partyList: PartyMember[];
  onOpenCharacter: (id: string) => void;
}) {
  const rows = partyList.map((p) => ({ p, r: readinessOf(p) }));
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
          return (
          <button
            key={p.id}
            onClick={() => onOpenCharacter(p.id)}
            aria-label={`${p.name}: ${r.status}`}
            style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "center", background: "transparent", border: "none", padding: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}
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
