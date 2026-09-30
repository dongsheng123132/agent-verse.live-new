#!/usr/bin/env node
/**
 * `npm run dev:local` — next dev on port 3005 against the LOCAL database
 * started by `npm run db:local` (127.0.0.1:5433).
 *
 * DATABASE_URL is always overwritten with the local URL, so a production
 * connection string exported in the shell can never reach this server. (A
 * cross-platform wrapper because `VAR=x cmd` in an npm script does not work
 * under cmd.exe.)
 *
 * Testnet payments: set X402_NETWORK_MODE=testnet in the environment, or pass
 * `--testnet` (npm run dev:local -- --testnet). Default is mainnet.
 */
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FINAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DB_HOST = '127.0.0.1'
// Ports default to 5433 / 3005; override with LOCAL_DB_PORT / LOCAL_APP_PORT when another checkout already uses them
// (start the matching database with `npm run db:local -- --port=<LOCAL_DB_PORT>`).
const DB_PORT = Number(process.env.LOCAL_DB_PORT) || 5433
const APP_PORT = Number(process.env.LOCAL_APP_PORT) || 3005

const args = process.argv.slice(2)
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres:postgres@${DB_HOST}:${DB_PORT}/postgres`,
}
if (args.includes('--testnet')) env.X402_NETWORK_MODE = 'testnet'

function dbIsUp() {
  return new Promise((resolve) => {
    const s = net.connect({ host: DB_HOST, port: DB_PORT })
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
    s.setTimeout(2000, () => (s.destroy(), resolve(false)))
  })
}

if (!(await dbIsUp())) {
  console.error(`[dev:local] no database on ${DB_HOST}:${DB_PORT} — start it first with: npm run db:local`)
  process.exit(1)
}

console.log(`[dev:local] DATABASE_URL -> local ${DB_HOST}:${DB_PORT}; http://localhost:${APP_PORT}; X402_NETWORK_MODE=${env.X402_NETWORK_MODE || 'mainnet (default)'}`)
const nextBin = path.join(FINAL_DIR, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(APP_PORT)], { cwd: FINAL_DIR, env, stdio: 'inherit' })
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
