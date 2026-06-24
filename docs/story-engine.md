# Bardcast story engine

The content model and generation design. Decisions recorded 2026-06-24. This is
the spec the `NarrativeWriter` and related ports will be built against — today
they're stubs marked `TODO(bardcast)`.

## 1. Content library — four kinds of canon, one format

Everything is modeled as **OKF concepts** (markdown + frontmatter `type`), per the
`supper_club_secrets` precedent. Four roles:

| Canon | Role | Authored by | Mutability |
|---|---|---|---|
| **World** | places, factions, NPCs, items, lore | **Bardcast staff** (licensing-reviewed) | static |
| **Quest** | the arc/module: objectives, beats, the spine | **Bardcast staff** | semi-static |
| **Character** | the player characters (sheet, behavior, voice) | *derived from player replies* | grows |
| **Chapter** | generated output (prose + events) | *generated*, becomes new canon | append |

**Governance (v1):** world + quest canon are staff-authored and licensing-reviewed,
seeded from vetted public-domain material. They are **read-only to DM clients** — no
canon-editing UI, no user-generated-lore licensing exposure. The **DM steers** the
quest (sets scenes, paces beats, picks which thread to pull) but does not author
world lore. DM/player world-building is deferred to a later version.

**Storage:** staff seed bundles live as OKF in a vetted content catalog. Per-campaign
**character + chapter canon** live in the orchestrator `Store`, projected to OKF for
the writer's context. "Story drives the data" holds for character/chapter canon:
replies and generated chapters are the source; records are the projection.

## 2. Generation — replies are anchors, the chapter is an expansion

Player replies are **fixed points the writer must honor**, not the whole script.
Example (Chapter 1, "the party meets"): the DM prompts "you walk into the bar and
see X — what do you do?" and "a stranger offers a quest — what are you thinking?".
The handful of replies pin down *who each character is and one choice they made*.
The generated chapter extends **well past** them — connective tissue, NPC behavior,
description, consequences — invented within the curated world/quest canon and
consistent with character canon.

**Staged pipeline** (not single-shot — single-shot drifts on continuity and can't
reliably produce in-voice, speaker-separated output):

1. **Plan** — given quest beat + this round's player replies + recent state, outline the chapter's beats.
2. **Resolve** — run each beat's action through the dice engine (§3).
3. **Draft** — prose scene by scene, grounded in canon, honoring the replies as canonical.
4. **Voice** — assign dialogue to characters using their behavior exemplars so they sound like themselves.
5. **Script** — emit a **speaker-tagged script** (see §5), not freeform text.
6. **Extract** — pull `stateEvent` beats and advance character/chapter canon.

**Grounding:** feed the writer a compact *story state* (recent stateEvents, current
quest beat, location) plus **RAG over the OKF canon** for relevant lore — not the
whole corpus (token budget).

**Human-in-the-loop:** any stage may **pause** and emit an `awaiting_input` state —
either "DM, decide X" or "we need <character>'s reaction, send this prompt." This
makes the prompt loop and the generation loop the **same loop**: generation can
request more player audio or a DM decision mid-chapter.

## 3. Resolution & randomness — seeded dice

Randomness is core: good ideas should sometimes fall through, and outcomes shouldn't
be foreordained.

- **System:** explicit dice on the **D&D 5.1 SRD (CC-BY-4.0)** — a vetted, licensable
  resolution system (ability checks, DCs, advantage). No need to invent mechanics.
- **The loop that makes it cohere:** *player replies → character sheet → dice
  modifier → outcome.* The sheet traits (built from replies) are the modifiers on
  the roll. The data the players generate literally shapes their luck.
- **Determinism:** a **seeded PRNG**; each beat derives a sub-seed from a stored
  master seed. The **roll log** (seed, check, DC, result) is persisted on the
  chapter — so any run is reproducible and any branch replayable. (Narrating the
  rolls can be part of the charm.)

## 4. Outcomes, safety, and backtracking

- **Failure defaults to a setback, not death** — injury, capture, a lost item, a
  closed door. Keeps stakes real and the branch tree shallow.
- **Death is a hard constraint** that triggers rollback. When a branch reaches a
  forbidden outcome (a PC death we don't want), **backtrack to the most recent beat
  where a character had a real alternative** (a *decision node*, not just any beat),
  discard the fatal branch, and try another path. This is backtracking search over a
  narrative tree, with player-agency points as the branch points.
- **Backtrack policy:**
  - *Minor* — auto-resolve (re-roll or writer picks a safer intent).
  - *Character-ending* — **escalate to the DM/players** as a real choice ("spend a
    resource? make a different call?"). "You almost died" becomes a feature the table
    experiences, not a hidden retry.
- **Termination:** cap backtrack attempts per decision node; if exhausted, escalate
  to the DM rather than loop.

## 5. Implications for the data model / code (build TODOs)

- `Chapter.transcript` (freeform) → add a structured **`script: Array<{ speaker:
  characterId | "narrator"; text: string }>`**. The `AudioRenderer` maps each line
  to an ElevenLabs `voice_id`; the readable transcript is a render of the script.
- `Chapter` gains a **`rollLog`** and **`seed`** for reproducibility, and a
  **`beats`/checkpoint** structure for rollback.
- `ChapterStatus` gains **`awaiting_input`** (DM decision or more player audio).
- `NarrativeWriter` port likely splits into staged steps; add a **resolution
  service** (dice + SRD checks) and a **director/backtrack policy** component.
- `suggestPrompts` is powered by the writer's open quest threads + readiness gaps —
  the same staged writer drives both ends of the loop.
