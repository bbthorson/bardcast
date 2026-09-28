/**
 * SqlClient — the narrowest Postgres interface the store needs.
 *
 * Deliberately a single parameterised query method matching Antiphony's SqlClient
 * design. This enables running identically against Neon (HTTP) or standard pg Pool
 * in production, and PGlite (in-process) in tests without mocking.
 */
export interface SqlClient {
  /**
   * Run one parameterised statement and return its rows.
   * Placeholders are Postgres-native ($1, $2, ...).
   */
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
}
