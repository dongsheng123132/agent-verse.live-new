#!/usr/bin/env node
/**
 * Local Postgres for development: a PGlite database served over the Postgres
 * wire protocol (pglite-socket) on 127.0.0.1:5433, data kept in final/.local-db/.
 *
 *   npm run db:local                 # init schema, mirror the live map, serve (Ctrl+C to stop)
 *   npm run db:local -- --no-sync    # skip the live-map mirror
 *   npm run db:local -- --reset      # wipe final/.local-db/pgdata first
 *
 * What it does, in order:
 *   1. scripts/init-db.sql, then every statement in lib/schema.ts
 *      (SCHEMA_STATEMENTS) — both are idempotent, so re-running is safe.
 *   2. Mirror the current map: GET <GRID_SOURCE_URL> (default
 *      https://www.agent-verse.live/api/grid — the PUBLIC read-only endpoint)
 *      and upsert the returned cells into the LOCAL database. It never writes
 *      anywhere but the local PGlite instance, and it never opens a
 *      connection to any DATABASE_URL: the variable is deleted from this
 *      process up front so a production connection string in the shell
 *      cannot be used by accident.
 *      The public endpoint does not expose API keys, so mirrored cells have
 *      no cell_api_keys row locally: they show up on the map but cannot be
 *      decorated locally. Buy a free cell locally to get a key.
 *   3. Serve the database on 127.0.0.1:5433.
 *
 * Outbound proxy: HTTPS_PROXY / HTTP_PROXY (e.g. http://127.0.0.1:7897) is
 * honoured for step 2; if the proxied fetch fails it retries direct.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// Hard guard: nothing in this process may talk to a real DATABASE_URL.
delete process.env.DATABASE_URL

const FINAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL_DB_DIR = path.join(FINAL_DIR, '.local-db')
const DATA_DIR = path.join(LOCAL_DB_DIR, 'pgdata')
const HOST = '127.0.0.1'
const DEFAULT_PORT = 5433
const GRID_SOURCE_URL = process.env.GRID_SOURCE_URL || 'https://www.agent-verse.live/api/grid'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const portArg = args.find((a) => a.startsWith('--port='))
const PORT = portArg ? Number(portArg.slice('--port='.length)) : Number(process.env.LOCAL_DB_PORT) || DEFAULT_PORT

const log = (...m) => console.log('[local-db]', ...m)

// lib/schema.ts is TypeScript; Node >= 22.18 strips types natively. Importing
// it does not open a DB connection (lib/db.js builds its pool lazily).
async function loadSchemaStatements() {
  const mod = await import('../lib/schema.ts')
  if (!Array.isArray(mod.SCHEMA_STATEMENTS)) throw new Error('lib/schema.ts does not export SCHEMA_STATEMENTS')
  return mod.SCHEMA_STATEMENTS
}

async function applySchema(db) {
  const initSql = fs.readFileSync(path.join(FINAL_DIR, 'scripts', 'init-db.sql'), 'utf8')
  await db.exec(initSql)
  const statements = await loadSchemaStatements()
  for (const statement of statements) await db.exec(statement)
  log(`schema ready (init-db.sql + ${statements.length} statements from lib/schema.ts)`)
}

async function fetchGridOnce(dispatcher) {
  const res = await undiciFetch(GRID_SOURCE_URL, {
    method: 'GET',
    headers: { accept: 'application/json' },
    dispatcher,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${GRID_SOURCE_URL}`)
  const body = await res.json()
  // /api/grid answers [] on any server-side error, so an empty array is not
  // evidence of an empty map — treat it as a failed fetch.
  if (!Array.isArray(body) || body.length === 0) throw new Error(`unexpected/empty body from ${GRID_SOURCE_URL}`)
  return body
}

async function fetchGrid() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  const attempts = []
  if (proxy) attempts.push({ label: `via proxy ${proxy}`, make: () => new ProxyAgent(proxy) })
  attempts.push({ label: 'direct', make: () => new Agent() })
  const errors = []
  for (const a of attempts) {
    const dispatcher = a.make()
    try {
      const rows = await fetchGridOnce(dispatcher)
      log(`fetched ${rows.length} cells ${a.label}`)
      return rows
    } catch (e) {
      errors.push(`${a.label}: ${e?.cause?.code || e?.message || e}`)
    } finally {
      await dispatcher.close().catch(() => {})
    }
  }
  throw new Error(errors.join(' | '))
}

// The live /api/grid speaks the probe-only vocabulary (can_pay | failed | unchecked); the grid_cells column
// keeps its CHECK constraint (verified | candidate | failed | unprobed). An older live server sends the old words.
const STORED_PROBE_STATUS = { can_pay: 'candidate', failed: 'failed', unchecked: 'unprobed', verified: 'verified', candidate: 'candidate', unprobed: 'unprobed' }

async function syncFromLive(db) {
  const rows = await fetchGrid()
  let n = 0
  await db.transaction(async (tx) => {
    for (const c of rows) {
      const x = Number(c.x)
      const y = Number(c.y)
      if (!Number.isInteger(x) || !Number.isInteger(y) || !c.owner) continue
      await tx.query(
        `INSERT INTO grid_cells
           (id, x, y, owner_address, status, fill_color, title, summary, image_url,
            block_id, block_w, block_h, block_origin_x, block_origin_y, service_url, probe_status, last_updated)
         VALUES ($1,$2,$3,$4,'HOLDING',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15,'unprobed'),NOW())
         ON CONFLICT (x, y) DO UPDATE SET
           owner_address = EXCLUDED.owner_address, status = 'HOLDING', fill_color = EXCLUDED.fill_color, title = EXCLUDED.title,
           summary = EXCLUDED.summary, image_url = EXCLUDED.image_url, block_id = EXCLUDED.block_id,
           block_w = EXCLUDED.block_w, block_h = EXCLUDED.block_h, block_origin_x = EXCLUDED.block_origin_x,
           block_origin_y = EXCLUDED.block_origin_y, service_url = EXCLUDED.service_url,
           probe_status = EXCLUDED.probe_status, last_updated = NOW()`,
        [
          c.id ?? y * 100 + x, x, y, c.owner,
          c.color ?? null, c.title ?? null, c.summary ?? null, c.image_url ?? null,
          c.block_id ?? null, c.block_w ?? 1, c.block_h ?? 1, c.block_origin_x ?? x, c.block_origin_y ?? y,
          c.service_url ?? null, STORED_PROBE_STATUS[c.probe_status] ?? null,
        ]
      )
      n++
    }
  })
  log(`mirrored ${n} owned cells from ${GRID_SOURCE_URL} into the LOCAL database`)
}

async function main() {
  if (flag('--reset')) {
    const resolved = path.resolve(DATA_DIR)
    if (path.dirname(resolved) !== path.resolve(LOCAL_DB_DIR)) throw new Error(`refusing to delete ${resolved}`)
    fs.rmSync(resolved, { recursive: true, force: true })
    log(`--reset: removed ${resolved}`)
  }
  fs.mkdirSync(LOCAL_DB_DIR, { recursive: true })

  const db = await PGlite.create(DATA_DIR)
  await applySchema(db)

  if (!flag('--no-sync')) {
    try {
      await syncFromLive(db)
    } catch (e) {
      console.error(`[local-db] SYNC FAILED (serving the database anyway): ${e?.message || e}`)
    }
  }
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM grid_cells WHERE owner_address IS NOT NULL')
  log(`owned cells in local db: ${rows[0].n}`)

  const server = new PGLiteSocketServer({ db, host: HOST, port: PORT, maxConnections: 20 })
  await server.start()
  log(`serving PGlite on ${HOST}:${PORT}  ->  DATABASE_URL=postgresql://postgres:postgres@${HOST}:${PORT}/postgres`)
  log(`data dir: ${DATA_DIR}   (Ctrl+C to stop)`)

  let stopping = false
  const stop = async (sig) => {
    if (stopping) return
    stopping = true
    log(`${sig}: stopping`)
    try {
      await server.stop()
      await db.close()
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))
}

main().catch((e) => {
  console.error('[local-db] fatal:', e?.stack || e)
  process.exit(1)
})
