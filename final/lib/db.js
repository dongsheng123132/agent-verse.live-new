import pg from 'pg'
const { Pool } = pg
let pool

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}

export async function dbQuery(text, params) {
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
export async function withTransaction(fn) {
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
