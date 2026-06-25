import { z } from "zod";

/**
 * The Bardcast **canon profile** — Zod schemas for the typed frontmatter of an
 * OKF canon bundle (see `docs/canon-compiler.md`). OKF owns syntax/interchange;
 * this profile owns semantics: a fixed `type` vocabulary and the machine-readable
 * relations/fields the linter and engine traverse. These validate canon
 * *concepts* (the markdown frontmatter), distinct from the protocol *record*
 * schemas (e.g. the `Campaign` record in `campaign.ts`).
 *
 * Pure (no fs / YAML). The linter reads files, splits frontmatter, and validates
 * against these — plus the cross-concept checks (referential integrity, spine
 * connectivity, path redundancy) that live above the per-concept contract.
 *
 * Versioned so bundles can pin a profile (`docs/canon-compiler.md §5`).
 */
export const CANON_PROFILE_VERSION = "0.1.0";

/**
 * A stable concept id: `kind.slug`, dotted namespaces allowed
 * (`place.camelot`, `beat.jttw.00-freed-adept`). More permissive than `LocalId`
 * in `ids.ts` (which is single-segment) — canon ids namespace by campaign/arc.
 */
export const ConceptId = z
  .string()
  .regex(/^[a-z]+(\.[a-z0-9-]+)+$/, "ConceptId must look like 'kind.slug', e.g. 'npc.guanyin'");
export type ConceptId = z.infer<typeof ConceptId>;

/** The bundle's fixed `type` vocabulary. */
export const ConceptType = z.enum([
  "Campaign",
  "Location",
  "NPC",
  "Item",
  "Faction",
  "CharacterSlot",
  "Arc",
  "QuestBeat",
]);
export type ConceptType = z.infer<typeof ConceptType>;

/** Propp dramatis personae — borrowed role vocabulary (`docs/canon-compiler.md §5`). */
export const ProppRole = z.enum([
  "hero",
  "villain",
  "donor",
  "helper",
  "dispatcher",
  "sought",
  "false-hero",
]);
export type ProppRole = z.infer<typeof ProppRole>;

/**
 * `role` accepts a scalar or a list and normalizes to a list — some figures hold
 * two roles (a dispatcher who is also the protected; a villain who is also the
 * donor). Schema delta surfaced by authoring the JTTW bundle.
 */
export const RoleField = z
  .union([ProppRole, z.array(ProppRole).min(1)])
  .transform((r) => (Array.isArray(r) ? r : [r]));

/** Which kind of SRD check a beat keys off — informs the dice engine + writer. */
export const ResolutionMode = z.enum(["combat", "social", "trick", "puzzle", "celestial"]);
export type ResolutionMode = z.infer<typeof ResolutionMode>;

export const Resolution = z.object({
  mode: ResolutionMode,
});
export type Resolution = z.infer<typeof Resolution>;

/**
 * Arc sequencing (Alexandrian, `docs/canon-compiler.md §5`):
 * - `plotted` — strictly ordered; flow via each beat's `leads_to`.
 * - `node-based` — a selectable pool; flow via the Arc's `episodes` + DM choice,
 *   so member beats need no `leads_to` (the linter checks path redundancy instead).
 */
export const ArcSequence = z.enum(["plotted", "node-based"]);
export type ArcSequence = z.infer<typeof ArcSequence>;

/** OKF base fields (required `type` via each concept; recommended title/desc/tags/timestamp) + our `id`. */
const base = {
  id: ConceptId,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(60)).default([]),
  timestamp: z.string().datetime({ offset: true }).optional(),
};

export const CampaignConcept = z.object({
  ...base,
  type: z.literal("Campaign"),
  calendar: z.string().max(120).optional(),
  party_size: z
    .object({
      min: z.number().int().min(1),
      ideal: z.number().int().min(1).optional(),
      max: z.number().int().min(1),
    })
    .optional(),
});
export type CampaignConcept = z.infer<typeof CampaignConcept>;

export const PlaceConcept = z.object({
  ...base,
  type: z.literal("Location"),
  occupants: z.array(ConceptId).default([]),
  items: z.array(ConceptId).default([]),
});
export type PlaceConcept = z.infer<typeof PlaceConcept>;

export const NpcConcept = z.object({
  ...base,
  type: z.literal("NPC"),
  role: RoleField.optional(),
  location: ConceptId.optional(),
  factions: z.array(ConceptId).default([]),
  items: z.array(ConceptId).default([]),
});
export type NpcConcept = z.infer<typeof NpcConcept>;

export const ItemConcept = z.object({
  ...base,
  type: z.literal("Item"),
  owner: ConceptId.optional(),
  location: ConceptId.optional(),
});
export type ItemConcept = z.infer<typeof ItemConcept>;

export const FactionConcept = z.object({
  ...base,
  type: z.literal("Faction"),
  members: z.array(ConceptId).default([]),
  places: z.array(ConceptId).default([]),
});
export type FactionConcept = z.infer<typeof FactionConcept>;

/**
 * A player-fillable role (first-class type surfaced by the JTTW authoring). Home
 * of `drives` (explicit wants → sheet traits → dice modifiers) and the target of
 * a beat's `establishes`. Always a Propp `hero`.
 */
export const CharacterSlotConcept = z.object({
  ...base,
  type: z.literal("CharacterSlot"),
  role: RoleField.default(["hero"]),
  drives: z.array(z.string().max(120)).default([]),
});
export type CharacterSlotConcept = z.infer<typeof CharacterSlotConcept>;

export const ArcConcept = z.object({
  ...base,
  type: z.literal("Arc"),
  sequence: ArcSequence,
  episodes: z.array(ConceptId).default([]),
});
export type ArcConcept = z.infer<typeof ArcConcept>;

export const QuestBeatConcept = z.object({
  ...base,
  type: z.literal("QuestBeat"),
  arc: ConceptId.optional(),
  location: ConceptId.optional(),
  npcs: z.array(ConceptId).default([]),
  items: z.array(ConceptId).default([]),
  /** Character slots this beat introduces (anchor opportunities). */
  establishes: z.array(ConceptId).default([]),
  /** Next beats — meaningful for `plotted` arcs only (see `ArcSequence`). */
  leads_to: z.array(ConceptId).default([]),
  central_choice: z.string().max(600).optional(),
  /** Propp function — optional annotation; open vocabulary for now. */
  function: z.string().max(80).optional(),
  resolution: Resolution.optional(),
});
export type QuestBeatConcept = z.infer<typeof QuestBeatConcept>;

/** Any canon concept, discriminated by `type`. The linter parses with this. */
export const Concept = z.discriminatedUnion("type", [
  CampaignConcept,
  PlaceConcept,
  NpcConcept,
  ItemConcept,
  FactionConcept,
  CharacterSlotConcept,
  ArcConcept,
  QuestBeatConcept,
]);
export type Concept = z.infer<typeof Concept>;
