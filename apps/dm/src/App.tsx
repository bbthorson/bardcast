import { color, font, shape } from "@bardcast/brand";
import type { CharacterReadiness, PartyReadiness, Prompt, Chapter } from "@bardcast/domain";
import { useEffect, useState, useCallback } from "react";
import {
  fetchCampaigns,
  fetchCampaignDetail,
  fetchReadiness,
  fetchPrompts,
  fetchSuggestedPrompts,
  publishPromptApi,
  generateChapterApi,
  type CampaignSummary,
  type CampaignDetail,
  type PromptSuggestion,
} from "./api.js";

/**
 * DM console: gives the DM full control over their table:
 * 1. Campaign selection and party readiness gate.
 * 2. Prompt station with loop-suggested prompts and prompt publishing.
 * 3. Chapter generation when the party is ready, with audio playback and script viewing.
 *
 * Adheres strictly to the Felt & Vellum brand design and the Candle Rule.
 */
export function App() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("gawain-green-knight");
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [readiness, setReadiness] = useState<PartyReadiness | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [status, setStatus] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Prompt composer state
  const [promptTitle, setPromptTitle] = useState("");
  const [promptScene, setPromptScene] = useState("");
  const [promptIntent, setPromptIntent] = useState<"sheet" | "behavior" | "voice" | "story">("story");
  const [promptAudience, setPromptAudience] = useState<string>("all");
  const [isPublishing, setIsPublishing] = useState(false);

  // Load initial campaigns list
  useEffect(() => {
    let cancelled = false;
    fetchCampaigns().then((list) => {
      if (!cancelled && list.length > 0) {
        setCampaigns(list);
        if (!list.some((c) => c.id === selectedCampaignId)) {
          setSelectedCampaignId(list[0]!.id);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh current campaign data
  const refreshCampaign = useCallback(async (cId: string) => {
    setStatus("Refreshing campaign state…");
    const detail = await fetchCampaignDetail(cId);
    setCampaignDetail(detail);

    const charIds = detail?.party.map((p) => p.id) ?? [];
    if (charIds.length > 0) {
      const [r, p, s] = await Promise.all([
        fetchReadiness(cId, charIds),
        fetchPrompts(cId),
        fetchSuggestedPrompts(cId, charIds),
      ]);
      setReadiness(r);
      setPrompts(p);
      setSuggestions(s);
    } else {
      setReadiness(null);
      const p = await fetchPrompts(cId);
      setPrompts(p);
      setSuggestions([]);
    }
    setStatus("");
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      refreshCampaign(selectedCampaignId);
    }
  }, [selectedCampaignId, refreshCampaign]);

  const characterIds = campaignDetail?.party.map((p) => p.id) ?? [];

  async function handleGenerate() {
    if (!readiness?.ready || characterIds.length === 0) return;
    setIsGenerating(true);
    setStatus("Writing chapter and synthesizing audio…");
    try {
      const { chapter } = await generateChapterApi(selectedCampaignId, characterIds);
      setStatus(`Chapter created: “${chapter.title}” (${chapter.status})`);
      await refreshCampaign(selectedCampaignId);
    } catch (err: any) {
      setStatus(`Generation halted: ${err.message || String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handlePublishPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!promptTitle.trim()) return;
    setIsPublishing(true);
    setStatus("Publishing prompt to the table…");
    try {
      const audience = promptAudience === "all" ? [] : [promptAudience];
      await publishPromptApi({
        campaignId: selectedCampaignId,
        title: promptTitle.trim(),
        scene: promptScene.trim() || undefined,
        intent: promptIntent,
        audience,
      });
      setPromptTitle("");
      setPromptScene("");
      setStatus("Prompt sent to the players.");
      await refreshCampaign(selectedCampaignId);
    } catch (err: any) {
      setStatus(`Failed to publish prompt: ${err.message || String(err)}`);
    } finally {
      setIsPublishing(false);
    }
  }

  function applySuggestion(s: PromptSuggestion) {
    setPromptTitle(s.title);
    setPromptScene(s.scene);
    setPromptIntent(s.intent);
    if (s.characterId) {
      setPromptAudience(s.characterId);
    } else {
      setPromptAudience("all");
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.page}>
        {/* Header and Campaign Selector */}
        <header style={styles.header}>
          <div>
            <span style={styles.eyebrow}>Console</span>
            <h1 style={styles.h1}>Bardcast — DM Table</h1>
          </div>
          <div style={styles.campaignPicker}>
            <label htmlFor="campaign-select" style={styles.muted}>
              Campaign:
            </label>
            <select
              id="campaign-select"
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              style={styles.select}
            >
              {campaigns.length > 0 ? (
                campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign.title} ({c.id})
                  </option>
                ))
              ) : (
                <option value={selectedCampaignId}>{selectedCampaignId}</option>
              )}
            </select>
            <button style={styles.btnSecondary} onClick={() => refreshCampaign(selectedCampaignId)}>
              Refresh
            </button>
          </div>
        </header>

        {campaignDetail && (
          <div style={styles.campaignMeta}>
            <p style={{ margin: "0 0 4px", fontSize: "1.1rem", fontFamily: font.display }}>
              {campaignDetail.campaign.title}
            </p>
            {campaignDetail.campaign.premise && (
              <p style={{ ...styles.muted, margin: 0 }}>{campaignDetail.campaign.premise}</p>
            )}
          </div>
        )}

        {status && <div style={styles.statusBar}>{status}</div>}

        {/* Readiness Gate Section */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.h2}>Party Readiness Gate</h2>
              <p style={{ ...styles.muted, margin: 0 }}>
                {readiness?.ready
                  ? "All party members meet the thresholds. The table is ready for the next chapter."
                  : "Gathering character voices, sheets, and behaviors."}
              </p>
            </div>
            {/* The Candle: single lit action when the gate is ready */}
            <button
              style={{
                ...styles.candleBtn,
                ...(readiness?.ready && !isGenerating ? null : styles.candleBtnDisabled),
              }}
              disabled={!readiness?.ready || isGenerating}
              onClick={handleGenerate}
            >
              {isGenerating ? "Synthesizing…" : "Generate next chapter"}
            </button>
          </div>

          {characterIds.length === 0 ? (
            <p style={styles.muted}>No characters enrolled in this campaign yet.</p>
          ) : readiness ? (
            <div style={styles.grid}>
              {Object.entries(readiness.perCharacter).map(([id, r]) => (
                <CharacterCard key={id} id={id} r={r} />
              ))}
            </div>
          ) : (
            <p style={styles.muted}>Checking party signals…</p>
          )}
        </section>

        {/* Prompt Station: Compose & Suggestions */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Prompt Station</h2>
          <p style={{ ...styles.muted, marginTop: 0 }}>
            Send voice prompts to players to mine character traits, establish behaviors, or advance the narrative.
          </p>

          {/* Suggestions from the loop */}
          {suggestions.length > 0 && (
            <div style={styles.suggestionsContainer}>
              <span style={styles.label}>Suggested by character focus:</span>
              <div style={styles.suggestionList}>
                {suggestions.map((s, idx) => (
                  <div key={idx} style={styles.suggestionCard}>
                    <div style={{ flex: 1 }}>
                      <span style={styles.tag}>{s.intent}</span>
                      {s.characterId && (
                        <span style={{ ...styles.tag, marginLeft: 6 }}>for {s.characterId}</span>
                      )}
                      <p style={{ margin: "6px 0 2px", fontWeight: 500 }}>{s.title}</p>
                      <p style={{ ...styles.muted, margin: 0, fontSize: "0.8rem" }}>{s.rationale}</p>
                    </div>
                    <button style={styles.btnSmall} onClick={() => applySuggestion(s)}>
                      Use prompt
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prompt composer form */}
          <form onSubmit={handlePublishPrompt} style={styles.composerForm}>
            <div style={styles.formRow}>
              <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={styles.label}>Prompt title / question *</label>
                <input
                  type="text"
                  placeholder="e.g. What memory made you swear never to back down?"
                  value={promptTitle}
                  onChange={(e) => setPromptTitle(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={styles.label}>Target audience</label>
                <select
                  value={promptAudience}
                  onChange={(e) => setPromptAudience(e.target.value)}
                  style={styles.select}
                >
                  <option value="all">Whole Party</option>
                  {characterIds.map((cId) => (
                    <option key={cId} value={cId}>
                      {cId}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={styles.label}>Signal intent</label>
                <select
                  value={promptIntent}
                  onChange={(e) => setPromptIntent(e.target.value as any)}
                  style={styles.select}
                >
                  <option value="story">Story</option>
                  <option value="sheet">Character Sheet</option>
                  <option value="behavior">Behavior / Arc</option>
                  <option value="voice">Voice Sample</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={styles.label}>Scene / Context (optional setting)</label>
              <textarea
                placeholder="Set the scene or provide ambient context for the player..."
                value={promptScene}
                onChange={(e) => setPromptScene(e.target.value)}
                rows={2}
                style={styles.textarea}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={isPublishing || !promptTitle.trim()}
                style={{
                  ...styles.btnSecondary,
                  fontWeight: 600,
                  opacity: isPublishing || !promptTitle.trim() ? 0.5 : 1,
                }}
              >
                {isPublishing ? "Sending…" : "Publish prompt to party"}
              </button>
            </div>
          </form>

          {/* Published Prompts Log */}
          {prompts.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <span style={styles.label}>Published Prompts ({prompts.length})</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {prompts.map((p, i) => (
                  <div key={i} style={styles.promptItem}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 500, fontSize: "0.95rem" }}>{p.title}</span>
                      <span style={styles.tag}>{p.intent}</span>
                    </div>
                    {p.scene && <p style={{ ...styles.muted, margin: "4px 0 0", fontSize: "0.85rem" }}>{p.scene}</p>}
                    <span style={{ ...styles.muted, fontSize: "0.75rem", marginTop: 4, display: "block" }}>
                      {new Date(p.createdAt).toLocaleString()} · Audience:{" "}
                      {p.audience && p.audience.length > 0 ? p.audience.join(", ") : "Party"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Chronicle / Chapters Section */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Chronicle & Chapters</h2>
          <p style={{ ...styles.muted, marginTop: 0 }}>
            Rendered chapters from the table, complete with voice synthesis, rolls, and beat scripts.
          </p>

          {campaignDetail?.chapters && campaignDetail.chapters.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {campaignDetail.chapters.map((ch: Chapter) => (
                <article key={ch.index} style={styles.chapterCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <span style={styles.eyebrow}>Chapter {ch.index}</span>
                      <h3 style={{ margin: "2px 0 6px", fontFamily: font.display, fontSize: "1.3rem" }}>
                        {ch.title}
                      </h3>
                    </div>
                    <span
                      style={{
                        ...styles.tag,
                        background: ch.status === "ready" ? color.moss : color.hearthSoft,
                        color: color.felt,
                      }}
                    >
                      {ch.status}
                    </span>
                  </div>

                  {/* Audio player if audio is rendered */}
                  {ch.audioRef ? (
                    <div style={{ margin: "10px 0" }}>
                      <audio controls src={ch.audioRef} style={{ width: "100%" }} />
                    </div>
                  ) : (
                    <p style={{ ...styles.muted, fontSize: "0.85rem", margin: "6px 0" }}>
                      Audio status: {ch.status === "ready" ? "Audio ready" : "Audio rendering pending"}
                    </p>
                  )}

                  {/* Beats preview */}
                  {ch.beats && ch.beats.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ ...styles.muted, fontSize: "0.8rem" }}>Story Beats:</span>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: color.chalkDim, fontSize: "0.85rem" }}>
                        {ch.beats.map((b, bi) => (
                          <li key={bi} style={{ marginBottom: 2 }}>
                            {b.summary}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Script dialogue excerpts */}
                  {ch.script && ch.script.length > 0 && (
                    <details style={{ marginTop: 10, cursor: "pointer" }}>
                      <summary style={{ ...styles.muted, fontSize: "0.85rem" }}>
                        View script excerpt ({ch.script.length} lines)
                      </summary>
                      <div style={styles.scriptBox}>
                        {ch.script.map((line, li) => (
                          <div key={li} style={{ marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, color: color.chalk }}>{line.speaker}: </span>
                            <span style={{ color: color.chalkDim }}>{line.text}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p style={styles.muted}>No chapters have been generated for this campaign yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function CharacterCard({ id, r }: { id: string; r: CharacterReadiness }) {
  return (
    <article style={{ ...styles.card, borderColor: r.ready ? color.moss : color.feltLine }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
        <h3 style={{ margin: 0, fontFamily: font.display, fontSize: "1.1rem" }}>{id}</h3>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: "0.75rem",
            color: r.ready ? color.moss : color.chalkDim,
          }}
        >
          {r.ready ? "ready" : "gathering"}
        </span>
      </div>
      <Axis label="Sheet" pct={r.sheet.progress} detail={r.sheet.detail} />
      <Axis label="Behavior" pct={r.behavior.progress} detail={r.behavior.detail} />
      <Axis label="Voice" pct={r.voice.progress} detail={r.voice.detail} />
      {!r.ready && r.nextFocus && (
        <p style={{ ...styles.muted, margin: "8px 0 0", fontSize: "0.8rem" }}>
          Next focus: <strong style={{ color: color.chalk }}>{r.nextFocus}</strong>
        </p>
      )}
    </article>
  );
}

function Axis({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  return (
    <div style={{ marginBottom: "0.4rem" }}>
      <div style={styles.axisHead}>
        <span>{label}</span>
        <span style={styles.muted}>{detail}</span>
      </div>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${Math.round(pct * 100)}%` }} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: color.felt, color: color.chalk, fontFamily: font.ui },
  page: { maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem 4rem" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "1rem",
    borderBottom: `1px solid ${color.feltLine}`,
    paddingBottom: "1.5rem",
  },
  eyebrow: {
    fontFamily: font.mono,
    fontSize: "0.75rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: color.chalkDim,
    display: "block",
  },
  h1: { fontFamily: font.display, fontWeight: 400, fontSize: "2rem", margin: "4px 0 0" },
  h2: { fontFamily: font.display, fontWeight: 400, fontSize: "1.4rem", margin: "0 0 4px" },
  campaignPicker: { display: "flex", alignItems: "center", gap: "0.5rem" },
  campaignMeta: {
    padding: "1rem 1.25rem",
    background: color.feltRaised,
    borderRadius: shape.radius.card,
    margin: "1.25rem 0",
    border: `1px solid ${color.feltLine}`,
  },
  section: {
    marginTop: "2rem",
    padding: "1.5rem",
    background: color.feltRaised,
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "1rem",
    marginBottom: "1.25rem",
  },
  muted: { color: color.chalkDim, fontSize: "0.85rem" },
  statusBar: {
    padding: "0.75rem 1rem",
    background: color.feltRaised,
    color: color.candle,
    borderRadius: 8,
    border: `1px solid ${color.candle}`,
    margin: "1rem 0",
    fontSize: "0.9rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: "1rem",
  },
  card: {
    border: `1px solid ${color.feltLine}`,
    borderRadius: shape.radius.card,
    padding: "1rem",
    background: color.felt,
  },
  axisHead: { display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 3 },
  track: { height: 6, background: color.feltLine, borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", background: color.moss },
  candleBtn: {
    padding: "0.75rem 1.25rem",
    borderRadius: shape.radius.card,
    border: "none",
    color: color.felt,
    background: color.candle,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: `0 0 16px rgba(235, 170, 76, 0.35)`,
    transition: "transform 0.1s ease",
  },
  candleBtnDisabled: {
    background: color.feltLine,
    color: color.chalkDim,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  btnSecondary: {
    padding: "0.6rem 1rem",
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
    color: color.chalk,
    background: color.feltRaised,
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  btnSmall: {
    padding: "0.35rem 0.65rem",
    borderRadius: shape.radius.chip,
    border: `1px solid ${color.feltLine}`,
    color: color.chalk,
    background: color.feltLine,
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  suggestionsContainer: {
    background: color.felt,
    padding: "1rem",
    borderRadius: shape.radius.card,
    margin: "1rem 0",
    border: `1px solid ${color.feltLine}`,
  },
  suggestionList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  suggestionCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.6rem 0.8rem",
    background: color.feltRaised,
    borderRadius: shape.radius.card,
  },
  tag: {
    fontFamily: font.mono,
    fontSize: "0.7rem",
    padding: "2px 6px",
    borderRadius: shape.radius.chip,
    background: color.feltLine,
    color: color.chalkDim,
    textTransform: "uppercase",
  },
  label: { fontSize: "0.8rem", fontFamily: font.mono, color: color.chalkDim },
  composerForm: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginTop: "1.25rem",
    background: color.felt,
    padding: "1.25rem",
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
  },
  formRow: { display: "flex", gap: "1rem", flexWrap: "wrap" },
  input: {
    padding: "0.65rem 0.85rem",
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
    background: color.feltRaised,
    color: color.chalk,
    fontFamily: font.ui,
    fontSize: "0.9rem",
  },
  select: {
    padding: "0.65rem 0.85rem",
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
    background: color.feltRaised,
    color: color.chalk,
    fontFamily: font.ui,
    fontSize: "0.85rem",
  },
  textarea: {
    padding: "0.65rem 0.85rem",
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
    background: color.feltRaised,
    color: color.chalk,
    fontFamily: font.ui,
    fontSize: "0.9rem",
    resize: "vertical",
  },
  promptItem: {
    padding: "0.75rem 1rem",
    background: color.felt,
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
  },
  chapterCard: {
    padding: "1.25rem",
    background: color.felt,
    borderRadius: shape.radius.card,
    border: `1px solid ${color.feltLine}`,
  },
  scriptBox: {
    marginTop: 8,
    padding: "0.75rem 1rem",
    background: color.feltRaised,
    borderRadius: shape.radius.well,
    maxHeight: 200,
    overflowY: "auto",
    fontSize: "0.85rem",
    lineHeight: 1.4,
  },
};
