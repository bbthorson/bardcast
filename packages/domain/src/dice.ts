/**
 * Seeded, deterministic randomness. Every roll in a chapter derives from a stored
 * master seed so a generation run is reproducible and any branch can be replayed
 * during backtracking (see docs/story-engine.md §3–4). No `Math.random()`.
 */

/** mulberry32 — small, fast, deterministic PRNG. Returns floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32. Used to derive labelled sub-seeds. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Derive a stable sub-seed from a master seed + a label (e.g. a beat id). The
 * same (master, label) always yields the same sub-seed — so re-running a beat is
 * deterministic, while different beats roll independently.
 */
export function deriveSeed(master: number, label: string): number {
  return (master ^ hashString(label)) >>> 0;
}

/** Roll a single die with `sides` faces using the given RNG. */
export function rollDie(rng: () => number, sides: number): number {
  return Math.floor(rng() * sides) + 1;
}

/** Roll a d20. */
export function rollD20(rng: () => number): number {
  return rollDie(rng, 20);
}

/** A fresh master seed for a new generation run. */
export function newMasterSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}
