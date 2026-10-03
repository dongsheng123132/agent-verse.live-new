import pg from 'pg'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
const { Pool } = pg
let pool: pg.Pool | undefined

function getPool(): pg.Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}

// Rows are whatever the SQL selects, so they default to `any`; pass a row type where it is worth pinning down.
export async function dbQuery<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
  const client = await getPool().connect()
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}

/**
 * Run `fn` inside a single BEGIN/COMMIT transaction on one connection.
 * `fn` receives a client with the same `.query(text, params)` shape as `pg`'s
 * Client — callers must use that client (not `dbQuery`) for every statement
 * that needs to be part of the same transaction.
 * Throws -> ROLLBACK and rethrow. Returns -> COMMIT.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore rollback errors, original error takes priority */
    }
    throw e
  } finally {
    client.release()
  }
}
