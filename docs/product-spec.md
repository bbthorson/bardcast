# Bardcast product spec — the MVP gameplay loop

How the product actually plays, and the requirements that fall out of it. Decisions
recorded 2026-06-24. This is the spec the orchestrator's use-cases are validated
against; `story-engine.md` covers the *generation* design beneath it.

**Goal of the MVP:** get a couple of friends playing and producing a real
**serialized actual-play podcast**. UI polish is explicitly out of scope; a *great,
cost-effective story+audio pipeline* is the bar.

## 1. Roles

| Role | Who | Responsibility |
|---|---|---|
| **DM** | a human friend | Picks the campaign, paces it, approves/edits Bardcast's prompt recommendations, and **triggers** chapter generation. Bardcast does **not** DM. |
| **Players** | a couple of friends | Define a character, then answer audio prompts asynchronously. Their replies are anchors, sheet signal, behavior signal, and voice samples. |
| **Bardcast** | this system | Builds characters from replies, writes + renders chapters, and **recommends** the DM's next move. The recommendation engine is a first-class, DM-facing feature — not a stub. |
| **Antiphony** | the audio engine (formerly vox-pop-core) | Owns audio prompts + asynchronous audio replies **with transcripts**. Bardcast is a consumer behind the `AntiphonyGateway` port. We do **not** own STT. |

## 2. The lifecycle

**Phase 0 — Campaign standup.** DM picks a curated campaign; world + quest canon
load read-only. Players are invited, each keyed to a **DID**. Nothing is generated.

**Phase 1 — Genesis = Chapter 1.** The first round of prompts simultaneously
establishes who each character is *and* becomes the first episode (per the beat-1
canon: "replies here are anchors and backstory"). There is no separate onboarding
phase — genesis and Chapter 1 are the same thing. Chapter 1 waits for the **whole
party**.

**Phase 2 — The chapter loop** (the product, repeating per episode):

```
1. DM issues prompt(s) for the current beat   (Bardcast-recommended)   → publishPrompt → Antiphony
2. Players reply in audio, asynchronously     (some reply, some don't) → ingestReplies (polls Antiphony)
3. Readiness surfaces to the DM               (who's ready? + time nudge) → checkReadiness
4. DM TRIGGERS generation                     (picks the featured party)
5. Staged write: plan → resolve(dice) → script (speaker-tagged)         → generateChapter + dice engine
6. Render multi-voice audio                   (cloned voices + narrator) → AudioRenderer (ElevenLabs)
7. Publish episode + advance state            (arc events recorded)
8. Bardcast recommends the next move          → back to 1               → suggestPrompts
```

What a player experiences: answer a prompt by talking → days later, hear *yourself*,
in your own voice, starring in the story your offhand line shaped → get the next
prompt. The reward loop is hearing the chapter.

## 3. Cadence — batch, ~days, no real-time

The first chapter lands a couple of days after the party answers. That window is
when cloning, staged generation, and rendering happen. Consequences:

- Chapter generation is a **batch job**, not a request/response. Minutes-long staged
  LLM runs are fine; no latency pressure, no streaming-to-a-listener concern.
- **Voice clones are ready before Chapter 1 renders** — the cadence gives time to
  build them. No narrator-only or stock-voice fallback is needed; the readiness floor
  simply requires a voice clone before a character can be featured.

## 4. Pacing — one quest beat = one chapter

Gawain's four beats → ~four episodes. One round of 1–3 prompts feeds one beat, and the
chapter expands well past the replies (connective tissue, NPC behavior, consequences)
within the curated canon.

## 5. Generation is DM-triggered, with hard blockers

The DM pulls the trigger; readiness is **not** an auto-fire. The DM controls *timing*
and *party* — but **cannot override the readiness floor**. If the story/background
isn't ready, generation is blocked, because it won't produce an engaging narrative.

- **Readiness surfaces to the DM** as a precondition ("2 of 3 ready") plus a **time
  nudge** ("it's been N days — generate with who's in?"). Slow players never deadlock
  the podcast: the DM just goes with whoever's ready.
- **Absent player** is resolved by the DM's **party selection at trigger time** — no
  system rule about wait-for-all vs. proceed. Absent = background, not featured.

## 6. The readiness floor (the blockers)

A trigger passes only when **both** gates clear:

**A. Signal readiness** (per featured character, cumulative — `evaluateParty` in
`packages/domain/src/readiness.ts`):

| Axis | Floor (MVP default, tunable) | Why |
|---|---|---|
| Sheet | ≥5 confident traits (confidence ≥60) | feeds dice modifiers |
| Behavior | ≥8 exemplar lines (or trained model) | lets the writer voice them |
| Voice | PVC clone ready + consent | lets us render their lines |

**B. Story readiness** (per round, per beat — *new dimension, not yet in
`readiness.ts`*):

- **Anchors** — **≥1 usable reply per featured character** for *this beat's prompt*.
  "Usable" = has a transcript, not `moderation.flagged`, status live. Stricter by
  design: no anchor for this beat → background, not featured. No anchor = ungrounded
  invention = not engaging.
- **Context** — the quest beat is defined (always true for curated campaigns) and
  prior chapter state is loaded (after Ch.1).

Thresholds are MVP defaults to **calibrate after the first real run**, not gospel.

## 7. The DM's surface is the campaign

The DM's home is a **campaign view**, not a per-chapter task list — a `getCampaignStatus`
read model that *composes* the use-cases above (no new machinery):

- **Progress** — current beat, chapters published (N of M; M = number of quest beats).
- **Roster + readiness** — each character's per-axis status and voice/consent state.
- **This round** — the live prompt(s), anchors in vs. out, and **time elapsed**.
- **What needs to happen** — the recommendation: prompt this character on this axis, or
  "ready to generate — here's featured vs. background, trigger?" (`suggestPrompts`
  surfacing through the campaign view).

**Campaign *selection*** shows the shape before committing, from loaded canon:
number of chapters (= quest beats), **recommended party-size range** (a small new canon
field), premise/tone.

## 8. Antiphony integration

The backend (vox-pop-core, being separated from the VoxPop app and renamed **Antiphony**)
provides transcripts as part of prompt/response info. We consume it behind the
`AntiphonyGateway` port. Mapping from the reply response shape:

| Bardcast needs | Antiphony field |
|---|---|
| transcript (the anchor / behavior signal) | `data.transcription` (top of `data`, **not** on `record`) |
| durable identity key | `data.author.bluesky.did` (the DID; `author.id` is a secondary actor id) |
| voice-clone audio | prefer `data.enhancedAudioUrl`, fall back to `record.audioUrl` |
| usability gate | skip if `data.moderation.flagged` or `record.status !== "live"` |
| beat association | `record.promptId` → mapped to the published beat |

Everything else in the payload (waveformPeaks, RSS, stats, badges, settings) is
UI/social — not modeled. The prompt shape should also carry a `transcript` (the DM's
spoken prompt), to match.

## 9. Voice ownership (deferred to onboarding)

Players should eventually **own** their voice clone (portable, DID-keyed). Verified
constraint: only ElevenLabs **Professional** Voice Clones can be shared/migrated;
**Instant** clones never can — so IVC forecloses ownership permanently. The data model
therefore assumes **PVC, DID-owned, with custody as a swappable field**
(`bardcast-account` now → `player-account` later). PVC needs ≥30 min clean audio +
verification + training, which the gameplay prompts won't produce — it needs a
dedicated voice-capture onboarding (define character, then read scripts aloud). **Full
design deferred to onboarding.**

## 10. Build implications (small seams this spec creates)

- `AntiphonyGateway`: the vox-pop → Antiphony rename across the consumer surface; map
  the response fields above; add `transcript` to the prompt shape.
- `readiness.ts`: add the **story-readiness** gate (anchors + context) alongside the
  existing signal gate.
- Orchestrator: hold a **prompt→beat mapping** so anchors can be found per beat.
- `NarrativeWriter`: return speaker-tagged **`script`** (not freeform `transcript`) so
  the `AudioRenderer` can map each line to a voice.
- `getCampaignStatus`: a read model composing readiness + recommendations + chapter
  progress.
- Campaign canon: add a **recommended party-size range** field.

## 11. Explicitly deferred

Death/backtrack search (failure = setback only for MVP); reactions/social; player-held
voice custody; RAG over canon (the curated corpus fits whole in context — load it all,
cache it). The death-backtrack and RAG designs live in `story-engine.md` for when we
return to them.

## 12. The MVP milestone

**"First listenable chapter"** — not "first written chapter." It requires two real
adapters, not one: the `NarrativeWriter` (staged: plan → resolve-via-dice → script) and
the ElevenLabs `AudioRenderer`. Everything else (player PWA, DM console polish, Bluesky,
identity beyond DID-keying) stays stubbed.
