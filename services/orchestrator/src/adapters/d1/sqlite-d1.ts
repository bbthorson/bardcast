import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { D1Database, D1PreparedStatement } from "./d1.js";

/**
 * Test stand-in for a D1 binding over Node's built-in SQLite, which is the same
 * engine D1 runs. Covers only the methods the D1 adapters call.
 */
// Loaded with require because vitest 2's resolver does not know `node:sqlite`.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export function sqliteD1(db: DatabaseSyncType = new DatabaseSync(":memory:")): D1Database {
  const statement = (query: string, values: unknown[] = []): D1PreparedStatement => {
    // node:sqlite numbers `?1` params positionally from the array, like D1.
    const args = values as Array<string | number | null>;
    return {
      bind: (...next: unknown[]) => statement(query, next),
      first: async <T>() => (db.prepare(query).get(...args) ?? null) as T | null,
      all: async <T>() => ({ results: db.prepare(query).all(...args) as T[] }),
      run: async () => db.prepare(query).run(...args),
    };
  };
  return {
    prepare: (query) => statement(query),
    batch: async (statements) => Promise.all(statements.map((s) => s.run())),
  };
}
