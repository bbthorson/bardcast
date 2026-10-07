import { z } from "zod";

/**
 * A piece of equipment. The same shape on the player's own sheet (permanent
 * equipment) and on a campaign seat (what they carry at that table).
 *
 * `srd` names an SRD 5.2 equipment entry when there is one ("longsword",
 * "chain-mail"); AC and attacks are computed from it. A `bonus` is a magic +1
 * to +3. `id` is stable within one sheet or seat, so an action can lose,
 * upgrade or equip a specific item.
 */
export const ItemKind = z.enum(["weapon", "armor", "shield", "gear"]);
export type ItemKind = z.infer<typeof ItemKind>;

/**
 * Where an item came from at this table. `start`: the table's starting kit.
 * `brought`: from the player's own equipment. The rest were picked up here.
 */
export const ItemSource = z.enum(["start", "brought", "found", "bought", "given"]);
export type ItemSource = z.infer<typeof ItemSource>;

export const Item = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: ItemKind,
  srd: z.string().max(80).optional(),
  bonus: z.number().int().min(0).max(3).default(0),
  equipped: z.boolean().default(false),
  source: ItemSource,
  note: z.string().max(300).optional(),
});
export type Item = z.infer<typeof Item>;

/**
 * What a campaign's gear policy hands a character at the door.
 * `starting` (the default): the table's starting kit, and their own equipment
 * stays home. `bring`: their own equipment, marked as brought.
 */
export const GearPolicy = z.enum(["starting", "bring"]);
export type GearPolicy = z.infer<typeof GearPolicy>;

/**
 * The player's equipment after a campaign ends. What they didn't bring stays as
 * it was. What they carried out comes home, except the table's starting kit
 * (unless it was enchanted there): a level-3 table's longsword shouldn't pile up
 * in every character's pack.
 */
export function equipmentAfter(owned: Item[], startingItems: Item[], finalItems: Item[]): Item[] {
  const broughtIds = new Set(startingItems.filter((i) => i.source === "brought").map((i) => i.id));
  const stayedHome = owned.filter((i) => !broughtIds.has(i.id));
  const carriedOut = finalItems
    .filter((i) => i.source !== "start" || i.bonus > 0)
    .map((i) => ({ ...i, equipped: false }));
  const taken = new Set(stayedHome.map((i) => i.id));
  return [...stayedHome, ...carriedOut.map((i) => (taken.has(i.id) ? { ...i, id: `${i.id}-${i.source}` } : i))];
}

/** Same items, ignoring order. */
export function sameItems(a: Item[], b: Item[]): boolean {
  const key = (xs: Item[]) => xs.map((i) => JSON.stringify([i.id, i.name, i.kind, i.srd ?? "", i.bonus, i.source, i.note ?? ""])).sort().join("\n");
  return key(a) === key(b);
}
