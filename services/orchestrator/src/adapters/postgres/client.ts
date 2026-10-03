import { neon } from "@neondatabase/serverless";
import pg from "pg";
import type { SqlClient } from "../../ports/sql-client.js";

/**
 * Creates an SqlClient using @neondatabase/serverless over HTTP.
 * Ideal for serverless and Neon deployments.
 */
export function neonSqlClient(connectionString: string): SqlClient {
  const sql = neon(connectionString);
  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> {
      return (await sql.query(text, params as unknown[])) as T[];
    },
  };
}

/**
 * Creates an SqlClient using Node `pg` Pool over standard TCP.
 * Ideal for Docker, self-hosted PostgreSQL, or Hyperdrive.
 */
export function pgSqlClient(poolOrConnectionString: pg.Pool | string): SqlClient {
  const pool =
    typeof poolOrConnectionString === "string"
      ? new pg.Pool({ connectionString: poolOrConnectionString })
      : poolOrConnectionString;

  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> {
      const res = await pool.query(text, params as unknown[]);
      return res.rows as T[];
    },
  };
}

/**
 * Creates an SqlClient using an in-process PGlite instance.
 * Ideal for unit and integration testing without network or Docker dependencies.
 */
export function pgliteSqlClient(pglite: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}): SqlClient {
  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> {
      const res = await pglite.query(text, params as unknown[]);
      return res.rows as T[];
    },
  };
}
