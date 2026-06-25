# Bardcast canon compiler — the supply side

How raw source material becomes vetted, playable Bardcast canon. Decisions recorded
2026-06-25. This is the **supply side** — the runtime engine (`product-spec.md`,
`story-engine.md`) is the *demand* side that consumes what this produces.

**The thesis:** decomposing a story into the Bardcast framework, then assessing it for
alignment and completeness, is a product in itself — a *campaign compiler*. It turns
"one hand-authored campaign" into "many vetted campaigns" without hand-authoring each,
and it operationalizes the licensing-review governance in `story-engine.md §1`.

**Not on the MVP critical path.** The MVP test stays Gawain, hand-authored. This doc
defines the scaffolding so the shape is right, and so the two hand-authored bundles
(Gawain + Journey to the West) become the **golden dataset** that later validates the
extractor and grader.

## 1. Profile on OKF, not instead of it

Canon is stored as [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(the Gawain bundle already is). But OKF **deliberately defines the interoperability
surface, not the content model**: the only required frontmatter field is `type`; type
values aren't registered centrally and consumers must tolerate unknown types; and
relationships are plain markdown links where *"the kind of relationship is conveyed by
the surrounding prose, not by the link itself."* OKF also has **no native support for
ordered sequences or graph structures**.

So the compiler is **a Bardcast profile on top of OKF**. Division of labor:

| Layer | Owns | What it provides |
|---|---|---|
| **OKF** | syntax, interchange, portability | markdown + YAML, `type`, prose links, `index.md` progressive disclosure, ships as a tarball / renders on GitHub |
| **Bardcast profile** | semantics | a fixed **type vocabulary**, a **typed frontmatter contract** that promotes load-bearing relationships and sequencing into machine-readable fields, backed by **Zod schemas in `@bardcast/domain`** |
| **Linter** | validation | the enforcement OKF deliberately omits (referential integrity, beat coverage, spine connectivity) |

The principle: **the prose body and markdown links stay human/agent-readable; the
*queryable contract* lives in typed frontmatter.** A dangling reference or an unrolled
beat must be catchable without parsing prose, because the dice engine, the writer's
grounding, and the linter all traverse the frontmatter, not the body.

(Per `story-engine.md §1`, only the static **world + quest** canon is OKF on disk. The
derived **character + chapter** canon lives in the `Store` and is *projected* to OKF for
the writer's context.)

## 2. The type vocabulary

Two layers. Each `type` value is the OKF `type` frontmatter; each gets a Zod schema in
`@bardcast/domain`.

**World layer** (static entities, a cross-linked graph):

| `type` | Carries (frontmatter) | Machine-readable links |
|---|---|---|
| `Place` | mood/description (body) | `occupants` (NPCs), `items` |
| `NPC` | `role` (Propp dramatis personae — optional), allegiance & voice (body) | `location`, `factions`, `items` |
| `Item` | properties, significance (body) | `owner`, `location` |
| `Faction` | goals (body) | `members`, `places` |
| `Lore` | what happened, in-world date | the entities it touches |

**Quest layer** (the spine — two levels):

| `type` | Carries | Machine-readable links |
|---|---|---|
| `Arc` | `sequence: plotted \| node-based` (Alexandrian) | `episodes` (ordered path or selectable pool) |
| `QuestBeat` | `central_choice` (decision node), `resolution.mode`, `function` (Propp — optional), body sections (Setting / What happens / Resolution notes) | `arc`, `location`, `npcs`, `items`, `leads_to` (plotted arcs only), `establishes` |

**Cast layer** (surfaced by authoring the JTTW bundle):

| `type` | Carries | Machine-readable links |
|---|---|---|
| `CharacterSlot` | `role: hero` (Propp), first-class `drives` | (target of a beat's `establishes`) |

A `CharacterSlot` is a **player-fillable role**, not a fixed PC — the home of the
explicit `drives` JTTW demanded, and what a beat's `establishes` points at. Gawain has
one implicitly (the knight described in the Round Table faction); it's now a first-class
type.

## 3. Fields justified by the two test cases

The whole point of two stories: a field earns its place only if a real campaign needs
it. "Demanded by" shows which one forced it — anything only one needs is optional.

| Field | Demanded by | Why |
|---|---|---|
| `location`, `npcs`, `items` (on beats) | both | grounding the writer + linter referential integrity. *Already in Gawain's beat-1 frontmatter.* |
| `leads_to` (frontmatter, not prose) | both | Gawain currently expresses this as a prose "→ leads to" link; promote it so the spine is machine-traversable |
| `Arc` + `sequence: plotted \| node-based` | **JTTW** | Gawain is a **plotted** spine (deadline chokepoints); JTTW is a **node-based** pilgrimage of self-contained, selectable episodes. Terms + theory borrowed from the Alexandrian. One story could never reveal this |
| `role` (NPC / character slot) | both | Propp **dramatis personae** (hero/villain/donor/helper/dispatcher…), **scalar or list** — a figure can hold two roles (Tripitaka = dispatcher+sought; Green Knight = villain+donor). `hero` = the player-fillable slot |
| `function` (per beat, optional) | both | Propp's 31 **functions** as a decomposition scaffold + alignment signal; folktale-specific, so optional metadata |
| `establishes` (character slots a beat introduces) | both | Gawain's beat-1 establishes each knight; JTTW's opening **assembles the party** (Wukong freed, Bajie/Wujing recruited) — both are anchor opportunities (`product-spec.md §6`) |
| `drives` (first-class on characters) | **JTTW** | JTTW's companions have explicit, divergent wants (pride, appetite, piety); Gawain's are implicit. The decomposer extracts them or flags them missing |
| `resolution.mode` (combat \| social \| trick \| puzzle) | **JTTW** | Gawain is ~one melee/social check; JTTW spans combat, transformation/trickery, and **celestial-intervention** resolutions. The mode maps each to an SRD ability/DC |
| `party_size` range (bundle-level) | both | shown at campaign selection (`product-spec.md §7`) |
| `deadline` (quest metadata) | Gawain only | Gawain has a year-and-a-day clock; JTTW doesn't → **optional**, not a required field |

Two of these (`Arc`/`sequence`, `resolution.mode`/`drives`) are genuinely structural and
would never have surfaced from Gawain alone — that's the payoff of the second case.

**Player-fillable protagonist slots** — a shared insight: both sources have named
protagonists (Gawain; Dorothy-equivalents in JTTW's companions), but the players inhabit
those roles. The source provides world + spine; `establishes` marks where a player
character slots in. The decomposition keeps world/quest canon and treats protagonists as
**slots**, not fixed characters.

## 4. The two stages

### Decompose — source → typed OKF graph

An LLM extraction job: read the source, emit OKF concepts with the profile's frontmatter.
This is a **structured-outputs** task — the Zod profile *is* the output contract.

For JTTW we author a **representative slice**, not the 100-chapter novel: the
party-assembly opening + 2–3 deliberately contrasting episodes (one combat, one
trickery/transformation, one celestial-intervention) + the framing arc. Enough to
exercise every structural axis; tractable to hand-author. **Original summary only** — no
translation reproduced (the `story-engine.md §1` licensing rule, as Gawain's `index.md`
already asserts).

### Assess — alignment + completeness

Two axes, split by *how* each is checked:

**Completeness — mechanical, deterministic (the linter, no LLM):**
- **Referential integrity** — every `location`/`npcs`/`items`/`leads_to`/`establishes`
  ref resolves to a concept that exists.
- **Beat coverage** — every `QuestBeat` has a `central_choice`, a `resolution.mode`, and
  Setting / What-happens / Resolution-notes body sections.
- **Spine connectivity** — beats form a connected path (or a complete selectable pool
  under an `Arc`); no orphans.
- **Path redundancy** (node-based arcs) — borrowing the Alexandrian **Three Clue Rule**,
  each node has ≥N ways in/out, so a node-based arc can't dead-end on a missed link.
- **Decision-node density** — ≥1 genuine `central_choice` per beat.
- **Cast fit** — `party_size` declared; every character slot has ≥1 `establishes` beat.
- **Resolution coverage** — each `resolution.mode` maps to an SRD ability/DC the dice
  engine can roll.

**Alignment — semantic, LLM-graded against a rubric (an LLM-judge):**
- **Source fidelity** — faithful to the material; original-summary only.
- **Internal consistency** — no contradictions (NPC allegiance ↔ faction; item location
  ↔ place contents; timeline coherence).
- **Tone consistency** — beats/voices match the declared tone.
- **Mechanical fit** — choices are SRD-resolvable; failure defaults to setback, death
  only where intended (the Green Knight *cannot* die at beat 1).
- **Playability** — choices are genuine (multiple viable options), not railroaded.

Output: a scored bundle + a **gap report**. This maps onto the Claude rubric/Outcome
pattern — mechanical checks gate; the LLM grader scores alignment with per-criterion
explanations. Both golden bundles must pass completeness and grade well on alignment;
they're how we later validate the automated extractor and grader.

## 5. Borrow vs. track upstream

Prior art splits by *how* we consume it. **Vendor** = copy a small, stable vocabulary
into our Zod profile and version-pin it (we own it; no runtime dependency). **Track
upstream** = depend on actively-maintained data/specs so we benefit from others'
continued work. License gates which is even possible.

| Source | Mode | License | Why |
|---|---|---|---|
| **OKF** | track upstream | open spec | new (2026) and evolving — pin a version, watch the spec; we're already built on it |
| **SRD 5.x** ability/skill/DC/monster data (e.g. Open5e, 5e-database) | track upstream | CC-BY-4.0 (attribution) | actively maintained; feeds the `resolution.mode` layer + the dice engine so we don't hand-maintain stat data |
| **Propp** dramatis personae + functions | vendor | method / PD-era text | stable since 1928 — copy the role/function vocabulary into Zod; ongoing formalization research informs but isn't a dependency |
| **Alexandrian** node-based design + Three Clue Rule | vendor (concept) | article — cite, don't copy text | copy the pattern + the redundancy check; attribute |
| **Ink / Twine / Yarn** | skip as dependency | MIT / open | runtimes assume scripted branching; we have the LLM write prose. Borrow the graph vocabulary only. (`inkjs` is MIT if we ever script.) |
| **Kanka** | taxonomy only | **AGPL** (copyleft) | its entity taxonomy validates ours, and its API could be an export/interop target later — but **don't take code** (AGPL is viral); ideas only |

**Principle:** small stable vocabularies → **vendor and version-pin** (don't make a
folktale taxonomy a live dependency); large evolving data/specs → **track upstream** so
maintenance is someone else's job. The two that genuinely pay off as live dependencies
are **OKF** (the format) and a **maintained SRD dataset** (the resolution data) — both
permissively licensed; Kanka's AGPL keeps it ideas-only.

## 6. Build sequence (and what's scaffolding-now vs. later)

| Step | When | Notes |
|---|---|---|
| 1. Lock the profile (type vocab + Zod schemas in `@bardcast/domain`) | **done** | `packages/domain/src/canon.ts` (+ `canon.test.ts`); profile version `0.1.0` |
| 2. Promote Gawain's `leads_to` to frontmatter; add missing profile fields | now | bring the existing bundle up to profile |
| 3. Author the JTTW slice into `content/campaigns/journey-to-the-west/` | now | the second golden bundle |
| 4. Completeness **linter** over both bundles, in CI | now | the cheap, deterministic half of assessment |
| 5. LLM **decomposer** (source → OKF profile) | later | validated against the two golden bundles |
| 6. LLM **alignment grader** (the rubric) | later | validated against the two golden bundles |

Steps 1–4 are the scaffolding: two profile-conformant bundles + a linter, none of which
touches the runtime or the MVP test. Steps 5–6 are the full compiler, and the golden
dataset from 1–4 is exactly what makes them buildable.
