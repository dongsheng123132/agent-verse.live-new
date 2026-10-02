#!/usr/bin/env node
/**
 * Local Playwright run of the "buy it with my AI" purchase dialog (AI-first since 2026-10-02).
 * Touches ONLY the local stack — never production:
 *
 *   npm run db:local -- --no-sync
 *   npm run dev:local                      # any port: LOCAL_APP_PORT=3006 npm run dev:local
 *   node scripts/e2e-ai-purchase.mjs       # E2E_BASE_URL=http://localhost:3006 for another port
 *
 * What it does: opens the dialog for one free cell and for a dragged 3x2 block, fills the optional
 * look fields, copies the prompt (real clipboard), saves the prompt text + screenshots, then plays
 * the part of the AI by INSERTing the cell as owned straight into the local database (no payment is
 * made) and presses 「我让 AI 买完了」 to check that the map refreshes and the cell opens for review.
 *
 * Env: E2E_BASE_URL (http://localhost:3005)  E2E_CELL_X/E2E_CELL_Y (40/62, single cell; the 3x2 block
 *      starts at x+2)  E2E_OUT_DIR (default <tmp>/av-ai-purchase-<time>)  LOCAL_DB_PORT (5433)
 *      PLAYWRIGHT_DIR (folder of the `playwright` package)  HTTPS_PROXY (only so the Tailwind CDN loads)
 * Exit code 0 = every check passed.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const FINAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.E2E_BASE_URL || 'http://localhost:3005').replace(/\/$/, '')
const ONE = { x: Number(process.env.E2E_CELL_X ?? 40), y: Number(process.env.E2E_CELL_Y ?? 62) }
const BLOCK = { x: ONE.x + 2, y: ONE.y, w: 3, h: 2 }
const DB_PORT = Number(process.env.LOCAL_DB_PORT) || 5433
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = process.env.E2E_OUT_DIR || path.join(os.tmpdir(), `av-ai-purchase-${stamp}`)
fs.mkdirSync(OUT, { recursive: true })

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`refusing to run against ${BASE}: this e2e is local-only`)
  process.exit(2)
}

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_DIR, 'playwright', 'C:/1mineyswitch/.data/walkthrough/node_modules/playwright'].filter(Boolean)
  const errs = []
  for (const c of candidates) {
    try {
      return createRequire(path.join(FINAL_DIR, 'noop.js'))(c)
    } catch (e) {
      errs.push(`${c}: ${e.code || e.message}`)
    }
  }
  console.error(`playwright not found. Set PLAYWRIGHT_DIR. Tried:\n  ${errs.join('\n  ')}`)
  process.exit(2)
}
const { chromium } = loadPlaywright()

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${String(detail).slice(0, 300)}` : ''}`)
}
const shots = []
async function shot(page, name) {
  const file = path.join(OUT, `${String(shots.length + 1).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
  console.log(`      screenshot: ${file}`)
}
function saveText(name, text) {
  const file = path.join(OUT, name)
  fs.writeFileSync(file, text, 'utf8')
  console.log(`      text: ${file}`)
  return file
}

const T = 60_000
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY
const browser = await chromium.launch({
  headless: true,
  ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}),
})
const localDb = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres` })
let exitCode = 1
let activePage = null

async function newPage() {
  // tall enough that the whole dialog fits in a screenshot
  const context = await browser.newContext({ viewport: { width: 1440, height: 1250 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {})
  // WorldMap switches drag from box-select to pan whenever navigator.maxTouchPoints > 0 (true on touch-screen laptops,
  // incl. the one this was written on) — pretend to be a plain mouse desktop so the 3x2 drag select works.
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 0 }))
  const page = await context.newPage()
  activePage = page
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.__pageErrors = pageErrors
  return { context, page }
}

async function openMap(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: T })
  await page.waitForSelector('header input[type=text]', { timeout: T })
  await page.waitForTimeout(1500)
}

async function searchCell(page, x, y) {
  const search = page.locator('header input[type=text]').first()
  await search.fill(`${x},${y}`)
  await search.press('Enter')
  await page.locator(`button:has-text("(${x},${y})")`).first().click({ timeout: T })
}

async function freeCheck(cells) {
  for (const c of cells) {
    const r = await localDb.query('SELECT owner_address FROM grid_cells WHERE x=$1 AND y=$2', [c.x, c.y])
    if (r.rows[0]?.owner_address) throw new Error(`cell (${c.x},${c.y}) is already owned in the local DB; pick another with E2E_CELL_X/E2E_CELL_Y`)
  }
}

async function copyAndRead(page) {
  await page.getByTestId('copy-for-ai').click()
  await page.waitForTimeout(300)
  // the Windows clipboard hands text back with CRLF line ends; the app's string uses LF
  const raw = await page.evaluate(() => navigator.clipboard.readText())
  return raw.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
}

try {
  await localDb.connect()
  const block = []
  for (let dy = 0; dy < BLOCK.h; dy++) for (let dx = 0; dx < BLOCK.w; dx++) block.push({ x: BLOCK.x + dx, y: BLOCK.y + dy })
  await freeCheck([ONE, ...block])

  // =====================================================================
  // 1) one cell
  // =====================================================================
  const { context, page } = await newPage()
  await openMap(page)
  await searchCell(page, ONE.x, ONE.y)
  const modal = page.getByTestId('purchase-modal')
  await modal.waitFor({ timeout: T })
  const text0 = await modal.innerText()
  check('dialog opened for the chosen cell, shows its coordinates', text0.includes(`(${ONE.x}, ${ONE.y})`))
  check('total 0.10 USDC, 0.1 x 1', (await page.getByTestId('total-price').innerText()).includes('0.10 USDC'))
  check('shows the receiving address', (await page.getByTestId('pay-to').innerText()).trim() === '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6')
  check('shows Monad (eip155:143) before Base (eip155:8453)', (() => { const a = text0.indexOf('eip155:143'); const b = text0.indexOf('eip155:8453'); return a > -1 && b > a })())
  const walletBtn = page.getByTestId('wallet-pay')
  check('wallet button is present but disabled', await walletBtn.isDisabled())
  check('wallet button carries the paused wording', (await walletBtn.innerText()).includes('钱包直付（暂停：钱包安全插件会把付款签名误报为风险）'))
  check('no credit-card button, no network picker', (await page.getByRole('button', { name: '信用卡支付暂停' }).count()) === 0 && (await page.getByTestId('net-monad').count()) === 0)
  check('"还没有 AI 钱包？" help with the MoneySwitch link', text0.includes('还没有 AI 钱包？') && (await page.locator('a[href="https://github.com/dongsheng123132/moneyswitch"]').count()) === 1)

  // an http:// iframe is refused up front and blocks the copy button
  await page.getByTestId('ai-iframe').fill('http://insecure.example')
  check('http:// iframe_url shows an error and disables 复制给我的 AI', (await page.getByTestId('ai-err-iframe_url').count()) === 1 && (await page.getByTestId('copy-for-ai').isDisabled()))

  const TITLE = 'Moon Cafe'
  await page.getByTestId('ai-title').fill(TITLE)
  await page.getByTestId('ai-summary').fill('A tiny cafe run by an AI barista')
  await page.getByTestId('ai-color-picker').fill('#7c3aed')
  await page.getByTestId('ai-iframe').fill('https://moon-cafe.example.com')
  await page.getByTestId('ai-service-url').fill('https://api.moon-cafe.example.com/paid')
  check('colour picker fills the fill_color field', (await page.getByTestId('ai-fill-color').inputValue()).toLowerCase() === '#7c3aed')
  check('copy button is enabled once the fields are valid', await page.getByTestId('copy-for-ai').isEnabled())
  await shot(page, 'single-filled')

  const copied1 = await copyAndRead(page)
  const file1 = saveText('prompt-single.txt', copied1)
  await shot(page, 'single-copied')
  check('button says 已复制 after copying', (await page.getByTestId('copy-for-ai').innerText()).includes('已复制'))
  const previewText = await page.getByTestId('ai-prompt').evaluate((el) => el.textContent)
  check('clipboard text equals the preview shown in the dialog', copied1 === previewText)
  const origin = new URL(BASE).origin
  check('prompt uses this page origin', copied1.includes(`- url: ${origin}/api/cells/purchase`) && copied1.includes(`说明文档：${origin}/skill.md`))
  check('prompt lists the cell, 0.10 total, confirm-before-paying, max_price', copied1.includes(`(${ONE.x},${ONE.y})`) && copied1.includes('总价 0.10 USDC') && copied1.includes('付款前先向我确认总价') && copied1.includes('- max_price: "0.10"'))
  check('prompt has both methods, key handling, report-back and the error cases', ['paid_fetch', 'npx awal@latest x402 pay', '私钥交给 AI', 'gk_ 开头', '告诉我保存在哪', 'monadvision.com/tx/', 'basescan.org/tx/', '409 cell_taken', '403 reserved / reserved_showcase', '不要重复付款', 'approval_id'].every((k) => copied1.includes(k)))
  check('PUT JSON has exactly the five filled-in fields', copied1.includes(`JSON: ${JSON.stringify({ title: TITLE, summary: 'A tiny cafe run by an AI barista', fill_color: '#7c3aed', iframe_url: 'https://moon-cafe.example.com', service_url: 'https://api.moon-cafe.example.com/paid' })}`))

  await page.getByText('查看将要复制的提示词').click()
  await page.getByTestId('ai-prompt').scrollIntoViewIfNeeded()
  await shot(page, 'single-prompt-preview')

  // clearing every field drops the PUT step
  for (const id of ['ai-title', 'ai-summary', 'ai-fill-color', 'ai-iframe', 'ai-service-url']) await page.getByTestId(id).fill('')
  const copiedEmpty = await copyAndRead(page)
  saveText('prompt-single-no-fields.txt', copiedEmpty)
  check('no fields filled -> prompt has no PUT /api/cells/update call', !copiedEmpty.includes('PUT ') && copiedEmpty.includes('我这次没有指定装修内容'))

  // 我让 AI 买完了 before anything was bought
  await page.getByTestId('ai-done').click()
  await page.getByTestId('ai-done-msg').waitFor({ timeout: T })
  const notYet = await page.getByTestId('ai-done-msg').innerText()
  check('before the purchase: 我让 AI 买完了 says nothing was bought yet and keeps the dialog', notYet.includes('还没看到') && (await modal.isVisible()), notYet)
  await shot(page, 'ai-done-not-yet')

  // play the AI: the cell becomes owned (local DB insert, no payment is made)
  const AI_OWNER = '0x00000000000000000000000000000000000a1a1a'
  await localDb.query(
    `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_id, block_w, block_h, block_origin_x, block_origin_y, title, summary, fill_color, last_updated)
     VALUES ($1,$2,$3,$4,'HOLDING',false,$5,1,1,$2,$3,$6,$7,$8,NOW())
     ON CONFLICT (x, y) DO UPDATE SET owner_address = EXCLUDED.owner_address, title = EXCLUDED.title, summary = EXCLUDED.summary, fill_color = EXCLUDED.fill_color`,
    [ONE.y * 100 + ONE.x, ONE.x, ONE.y, AI_OWNER, `blk_${ONE.x}_${ONE.y}_1x1`, TITLE, 'A tiny cafe run by an AI barista', '#7c3aed']
  )
  await page.getByTestId('ai-done').click()
  await modal.waitFor({ state: 'detached', timeout: T })
  check('after the cell is owned: 我让 AI 买完了 closes the dialog', (await page.getByTestId('purchase-modal').count()) === 0)
  await page.getByText(TITLE).first().waitFor({ timeout: T })
  const detailText = await page.locator('body').innerText()
  check('...and opens the cell for review (title, summary, coordinates)', detailText.includes(TITLE) && detailText.includes('A tiny cafe run by an AI barista') && detailText.includes(`(${ONE.x},${ONE.y})`))
  check('...with the 我有 key（装修）entry for the human', (await page.getByTestId('have-key-open').count()) === 1)
  await shot(page, 'ai-done-review')
  check('no uncaught page errors (single-cell session)', page.__pageErrors.length === 0, page.__pageErrors.join(' | '))
  await context.close()

  // =====================================================================
  // 2) several cells (dragged rectangle, 3 x 2)
  // =====================================================================
  const s2 = await newPage()
  const p2 = s2.page
  await openMap(p2)
  await searchCell(p2, BLOCK.x, BLOCK.y) // centres the map: this cell's top-left corner sits at the centre of <main>
  const modal2 = p2.getByTestId('purchase-modal')
  await modal2.waitFor({ timeout: T })
  await modal2.locator('button').first().click() // the X: closes the dialog and clears the selection
  await modal2.waitFor({ state: 'detached', timeout: T })
  const box = await p2.locator('main').boundingBox()
  const cell = 8 * 2.5 // CELL_PX x default zoom
  const x0 = box.x + box.width / 2 + cell / 2
  const y0 = box.y + box.height / 2 + cell / 2
  await p2.mouse.move(x0, y0)
  await p2.mouse.down()
  await p2.mouse.move(x0 + cell * (BLOCK.w - 1), y0 + cell * (BLOCK.h - 1), { steps: 8 })
  await p2.mouse.up()
  await modal2.waitFor({ timeout: T })
  const expectedList = block.map((c) => `(${c.x},${c.y})`).join(' ')
  check('drag selects the 3x2 block; dialog lists the six cells', (await p2.getByTestId('selected-cells').innerText()).includes(expectedList), await p2.getByTestId('selected-cells').innerText())
  check('total 0.60 USDC for six cells', (await p2.getByTestId('total-price').innerText()).includes('0.60 USDC'))
  await p2.getByTestId('ai-title').fill('Four-plus-two billboard')
  await p2.getByTestId('ai-color-picker').fill('#ff8800')
  await shot(p2, 'multi-filled')
  const copied2 = await copyAndRead(p2)
  saveText('prompt-multi.txt', copied2)
  const bodyLine = copied2.split('\n').find((l) => l.startsWith('- body: '))
  let bodyCells = null
  try { bodyCells = JSON.parse(bodyLine.slice('- body: '.length)).cells } catch { /* checked below */ }
  check('multi prompt: bulk-purchase endpoint, six cells in the body, max_price 0.60', copied2.includes(`- url: ${origin}/api/cells/bulk-purchase`) && Array.isArray(bodyCells) && bodyCells.length === 6 && bodyCells[0].x === BLOCK.x && copied2.includes('- max_price: "0.60"'))
  check('multi prompt: key belongs to the first cell, PUT JSON has only title + fill_color', copied2.includes(`只对应 body 里的第一格 (${BLOCK.x},${BLOCK.y})`) && copied2.includes('JSON: {"title":"Four-plus-two billboard","fill_color":"#ff8800"}'))
  await p2.getByTestId('ai-done').click()
  await p2.getByTestId('ai-done-msg').waitFor({ timeout: T })
  check('multi: 我让 AI 买完了 with nothing bought keeps the dialog', (await modal2.isVisible()))
  check('no uncaught page errors (multi-cell session)', p2.__pageErrors.length === 0, p2.__pageErrors.join(' | '))
  await s2.context.close()

  exitCode = results.every((r) => r.ok) ? 0 : 1
} catch (e) {
  check('e2e script ran to the end', false, e?.stack || e)
  exitCode = 1
  if (activePage) await shot(activePage, 'failure-state').catch(() => {})
} finally {
  await browser.close().catch(() => {})
  // leave the local database as it was: the simulated purchase is removed again
  await localDb.query('DELETE FROM grid_cells WHERE x=$1 AND y=$2 AND owner_address=$3', [ONE.x, ONE.y, '0x00000000000000000000000000000000000a1a1a']).catch(() => {})
  await localDb.end().catch(() => {})
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, one: ONE, block: BLOCK, results, shots }, null, 2))
  const passed = results.filter((r) => r.ok).length
  console.log(`\n判决 ${passed}/${results.length}  (exit ${exitCode})`)
  console.log(`screenshots + prompt txt + results.json: ${OUT}`)
}
process.exit(exitCode)
