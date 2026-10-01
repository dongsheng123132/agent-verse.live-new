#!/usr/bin/env node
/**
 * Run right after `npm run build`:  node scripts/check-no-mock-in-build.mjs
 *
 * Proves the DEV-ONLY mock x402 facilitator (lib/x402-mock-facilitator.ts) was
 * not bundled into the production build: its marker string must not appear in
 * any file under .next/ (server bundles AND client chunks).
 * Exit 0 = absent, 1 = found, 2 = no build to check.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FINAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// optional argv[2]: another directory to scan (used to prove the checker can fail)
const NEXT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(FINAL_DIR, '.next')

const src = fs.readFileSync(path.join(FINAL_DIR, 'lib', 'x402-mock-facilitator.ts'), 'utf8')
const marker = /MOCK_FACILITATOR_MARKER = '([^']+)'/.exec(src)?.[1]
if (!marker) {
  console.error('could not read MOCK_FACILITATOR_MARKER from lib/x402-mock-facilitator.ts')
  process.exit(2)
}
if (!fs.existsSync(path.join(NEXT_DIR, 'BUILD_ID'))) {
  console.error('no production build in .next/ (BUILD_ID missing) - run `npm run build` first')
  process.exit(2)
}

let scanned = 0
const hits = []
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'cache') continue // webpack build cache is not shipped
      walk(p)
    } else if (/\.(js|mjs|cjs|json|map|html|txt|rsc)$/.test(e.name)) {
      scanned++
      if (fs.readFileSync(p, 'utf8').includes(marker)) hits.push(path.relative(FINAL_DIR, p))
    }
  }
}
walk(NEXT_DIR)

console.log(`marker: ${marker}`)
console.log(`scanned ${scanned} files under .next/ (excluding .next/cache)`)
if (hits.length) {
  console.error(`FOUND the mock facilitator marker in ${hits.length} build file(s):\n  ${hits.join('\n  ')}`)
  process.exit(1)
}
console.log('OK: the mock facilitator marker is absent from the production build')
