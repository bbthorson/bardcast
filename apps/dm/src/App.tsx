import { color, font, shape } from "@bardcast/brand";
import type { CharacterReadiness, PartyReadiness, Prompt, Chapter, ReadinessThresholds } from "@bardcast/domain";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  fetchSession,
  fetchCampaigns,
  fetchCampaignDetail,
  fetchReadiness,
  fetchPrompts,
  fetchSuggestedPrompts,
  createInviteApi,
  syncCampaignApi,
  publishPromptApi,
  generateChapterApi,
  type DmSession,
  type CampaignSummary,
  type CampaignDetail,
  type PromptSuggestion,
} from "./api.js";

const PLAYTEST_THRESHOLDS: ReadinessThresholds = {
  minConfidentTraits: 0,
  minTraitConfidence: 60,
  minBehaviorExemplars: 1,
  requireVoice: true,
};

/**
 * DM console: gives the DM full control over their table:
 * 1. Same-origin AT-Proto session check (shares cookie with apps/web).
 * 2. Campaign selection, invite code minting, reply syncing, and party readiness gate.
 * 3. Prompt station with loop-suggested prompts and prompt publishing.
 * 4. Chapter generation when the party is ready, with R2 audio playback and script viewing.
 *
 * Adheres strictly to the Felt & Vellum brand design and the Candle Rule.
 */
export function App() {
  const initialCampaign = useMemo(
    () => new URLSearchParams(window.location.search).get("campaign") ?? "",
    [],
  );

  const [session, setSession] = useState<DmSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaign);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [readiness, setReadiness] = useState<PartyReadiness | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [status, setStatus] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [playtestMode, setPlaytestMode] = useState(true);

  // Invite panel state
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isMintingInvite, setIsMintingInvite] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Prompt composer state
  const [promptTitle, setPromptTitle] = useState("");
  const [promptScene, setPromptScene] = useState("");
  const [promptIntent, setPromptIntent] = useState<"sheet" | "behavior" | "voice" | "story">("story");
  const [promptAudience, setPromptAudience] = useState<string>("all");
  const [isPublishing, setIsPublishing] = useState(false);

  // Resolve AT-Proto session (same-origin cookie from apps/web)
  useEffect(() => {
    let cancelled = false;
    fetchSession().then((s) => {
      if (!cancelled) {
        setSession(s);
        setAuthChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load campaigns for the signed-in user
  useEffect(() => {
    if (!authChecked) return;
    if (!session && !import.meta.env.DEV) return;
    let cancelled = false;
    fetchCampaigns(session?.did).then((list) => {
      if (cancelled) return;
      // Prefer campaigns where this user is DM
      const sorted = [...list].sort((a, b) => {
        const aDm = session && a.campaign.dm === session.did ? 0 : 1;
        const bDm = session && b.campaign.dm === session.did ? 0 : 1;
        return aDm - bDm;
      });
      setCampaigns(sorted);
      setSelectedCampaignId((current) => {
        if (current && sorted.some((c) => c.id === current)) return current;
        return sorted[0]?.id ?? current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authChecked, session]);

  const activeThresholds = playtestMode ? PLAYTEST_THRESHOLDS : undefined;

  // Refresh current campaign data
  const refreshCampaign = useCallback(
    async (cId: string) => {
      if (!cId) return;
      setStatus("Refreshing campaign state…");
      const detail = await fetchCampaignDetail(cId);
      setCampaignDetail(detail);

      const charIds = detail?.party.map((p) => p.id) ?? [];
      if (charIds.length > 0) {
        const [r, p, s] = await Promise.all([
          fetchReadiness(cId, charIds, activeThresholds),
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
    },
    [activeThresholds],
  );

  useEffect(() => {
    if (selectedCampaignId) {
      setInviteCode(null);
      setCopiedInvite(false);
      void refreshCampaign(selectedCampaignId);
    }
  }, [selectedCampaignId, refreshCampaign]);

  const party = useMemo(() => campaignDetail?.party ?? [], [campaignDetail]);
  const characterIds = useMemo(() => party.map((p) => p.id), [party]);
  const nameById = useMemo(
    () => Object.fromEntries(party.map((p) => [p.id, p.profile?.displayName || p.id])),
    [party],
  );
  const isOwner = !campaignDetail || !session || campaignDetail.campaign.dm === session.did;

  async function handleMintInvite() {
    if (!selectedCampaignId) return;
    setIsMintingInvite(true);
    setCopiedInvite(false);
    try {
      const { code } = await createInviteApi(selectedCampaignId, session?.did);
      setInviteCode(code);
      setStatus(`Invite code minted: ${code}`);
    } catch (err) {
      setStatus(`Could not create invite: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsMintingInvite(false);
    }
  }

  async function handleCopyInvite() {
    if (!inviteCode) return;
    const url = `${window.location.origin}/join?code=${encodeURIComponent(inviteCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
    } catch {
      setStatus(`Share this invite link: ${url}`);
    }
  }

  async function handleSyncReplies() {
    if (!selectedCampaignId) return;
    setIsSyncing(true);
    setStatus("Syncing player replies & transcripts from Antiphony…");
    try {
      const res = await syncCampaignApi(selectedCampaignId, session?.did);
      await refreshCampaign(selectedCampaignId);
      setStatus(
        `Synced ${res.promptsChecked} ${res.promptsChecked === 1 ? "prompt" : "prompts"} across ${res.charactersSynced} ${res.charactersSynced === 1 ? "character" : "characters"}.`,
      );
    } catch (err) {
      setStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleGenerate() {
    if (!readiness?.ready || characterIds.length === 0) return;
    setIsGenerating(true);
    setStatus("Writing chapter and synthesizing audio…");
    try {
      const { chapter } = await generateChapterApi(selectedCampaignId, characterIds, {
        ...(activeThresholds ? { thresholds: activeThresholds } : {}),
        ...(session?.did ? { actingDid: session.did } : {}),
      });
      setStatus(`Chapter created: “${chapter.title}” (${chapter.status})`);
      await refreshCampaign(selectedCampaignId);
    } catch (err) {
      setStatus(`Generation halted: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handlePublishPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!promptTitle.trim() || !selectedCampaignId) return;
    setIsPublishing(true);
    setStatus("Publishing prompt to the table…");
    try {
      const audience = promptAudience === "all" ? [] : [promptAudience];
      const audienceDids =
        promptAudience === "all"
          ? party.map((p) => p.player)
          : party.filter((p) => p.id === promptAudience).map((p) => p.player);
      await publishPromptApi(
        {
          campaignId: selectedCampaignId,
          title: promptTitle.trim(),
          scene: promptScene.trim() || undefined,
          intent: promptIntent,
          audience,
          audienceDids,
        },
        session?.did,
      );
      setPromptTitle("");
      setPromptScene("");
      setStatus("Prompt sent to the players.");
      await refreshCampaign(selectedCampaignId);
    } catch (err) {
      setStatus(`Failed to publish prompt: ${err instanceof Error ? err.message : String(err)}`);
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

  if (!authChecked) {
    return (
      <main style={styles.main}>
        <div style={styles.page}>
          <p style={styles.muted}>Checking your DM seat…</p>
        </div>
      </main>
    );
  }

  if (!session && !import.meta.env.DEV) {
    return (
      <main style={styles.main}>
        <div style={{ ...styles.page, maxWidth: 480, paddingTop: "5rem" }}>
          <span style={styles.eyebrow}>Console</span>
          <h1 style={styles.h1}>Bardcast — DM Table</h1>
          <p style={{ ...styles.muted, marginTop: "1rem", lineHeight: 1.5 }}>
            Sign in with your Bluesky account on Bardcast first. Your session carries straight over to the DM console.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <a
              href="/"
              style={{ ...styles.candleBtn, textDecoration: "none", display: "inline-block" }}
            >
              Sign in at Bardcast
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.page}>
        {/* Header and Campaign Selector */}
        <header style={styles.header}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <a href="/" style={{ color: color.chalkDim, fontSize: "0.85rem", textDecoration: "none" }}>
                ‹ Back to Bardcast
              </a>
              {session && (
                <span style={{ ...styles.muted, fontFamily: font.mono, fontSize: "0.75rem" }}>
                  {session.handle ? `@${session.handle}` : session.did}
                </span>
              )}
            </div>
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
                <option value="">No campaigns yet</option>
              )}
            </select>
            <button style={styles.btnSecondary} onClick={() => void refreshCampaign(selectedCampaignId)} disabled={!selectedCampaignId}>
              Refresh
            </button>
          </div>
        </header>

        {!selectedCampaignId && (
          <div style={styles.campaignMeta}>
            <p style={{ margin: 0 }}>No campaigns found for your account yet.</p>
            <p style={{ ...styles.muted, marginTop: 6, marginBottom: 0 }}>
              <a href="/campaigns/new" style={{ color: color.candle }}>
                Start a campaign in Bardcast
              </a>{" "}
              and come back here to invite players and run the table.
            </p>
          </div>
        )}

        {campaignDetail && (
          <div style={styles.campaignMeta}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "1.1rem", fontFamily: font.display }}>
                  {campaignDetail.campaign.title}
                </p>
                {campaignDetail.campaign.premise && (
                  <p style={{ ...styles.muted, margin: 0 }}>{campaignDetail.campaign.premise}</p>
                )}
                {!isOwner && (
                  <p style={{ color: color.hearthSoft, fontSize: "0.8rem", margin: "6px 0 0" }}>
                    You are viewing this table as a player; DM actions require the campaign DM account.
                  </p>
                )}
              </div>
              {isOwner && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {inviteCode ? (
                    <>
                      <span style={{ fontFamily: font.mono, fontSize: "0.95rem", letterSpacing: "0.1em", padding: "0.45rem 0.75rem", background: color.felt, borderRadius: shape.radius.chip, border: `1px solid ${color.feltLine}` }}>
                        {inviteCode}
                      </span>
                      <button style={styles.btnSecondary} onClick={() => void handleCopyInvite()}>
                        {copiedInvite ? "Copied link" : "Copy invite link"}
                      </button>
                    </>
                  ) : (
                    <button style={styles.btnSecondary} onClick={() => void handleMintInvite()} disabled={isMintingInvite}>
                      {isMintingInvite ? "Minting…" : "New invite code"}
                    </button>
                  )}
                </div>
              )}
            </div>
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
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "0.8rem", color: color.chalkDim, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playtestMode}
                  onChange={(e) => setPlaytestMode(e.target.checked)}
                />
                Playtest thresholds (1 reply + voice clone; uncheck for full 5 traits / 8 exemplars)
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                style={styles.btnSecondary}
                disabled={!selectedCampaignId || isSyncing || !isOwner}
                onClick={() => void handleSyncReplies()}
              >
                {isSyncing ? "Syncing…" : "Sync replies"}
              </button>
              {/* The Candle: single lit action when the gate is ready */}
              <button
                style={{
                  ...styles.candleBtn,
                  ...(readiness?.ready && !isGenerating && isOwner ? null : styles.candleBtnDisabled),
                }}
                disabled={!readiness?.ready || isGenerating || !isOwner}
                onClick={() => void handleGenerate()}
              >
                {isGenerating ? "Synthesizing…" : "Generate next chapter"}
              </button>
            </div>
          </div>

          {characterIds.length === 0 ? (
            <p style={styles.muted}>No characters enrolled in this campaign yet. Mint an invite code above and send it to your players.</p>
          ) : readiness ? (
            <div style={styles.grid}>
              {Object.entries(readiness.perCharacter).map(([id, r]) => (
                <CharacterCard key={id} id={id} displayName={nameById[id] ?? id} r={r} />
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
                        <span style={{ ...styles.tag, marginLeft: 6 }}>for {nameById[s.characterId] ?? s.characterId}</span>
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
          <form onSubmit={(e) => void handlePublishPrompt(e)} style={styles.composerForm}>
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
                      {nameById[cId] ?? cId}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={styles.label}>Signal intent</label>
                <select
                  value={promptIntent}
                  onChange={(e) => setPromptIntent(e.target.value as typeof promptIntent)}
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
                disabled={isPublishing || !promptTitle.trim() || !selectedCampaignId || !isOwner}
                style={{
                  ...styles.btnSecondary,
                  fontWeight: 600,
                  opacity: isPublishing || !promptTitle.trim() || !selectedCampaignId || !isOwner ? 0.5 : 1,
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
                      {p.audience && p.audience.length > 0
                        ? p.audience.map((u) => nameById[u.replace(/^at:\/\//, "")] ?? u).join(", ")
                        : "Party"}
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
                            <span style={{ fontWeight: 600, color: color.chalk }}>{nameById[line.speaker] ?? line.speaker}: </span>
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

function CharacterCard({ id, displayName, r }: { id: string; displayName: string; r: CharacterReadiness }) {
  return (
    <article style={{ ...styles.card, borderColor: r.ready ? color.moss : color.feltLine }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: font.display, fontSize: "1.1rem" }}>{displayName}</h3>
          {displayName !== id && (
            <span style={{ fontFamily: font.mono, fontSize: "0.7rem", color: color.chalkDim }}>{id}</span>
          )}
        </div>
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
