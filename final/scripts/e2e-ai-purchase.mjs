#!/usr/bin/env node
/**
 * Local Playwright run of the "buy it with my AI" purchase dialog (AI-first since 2026-10-02).
 * Touches ONLY the local stack — never production, never a real chain:
 *
 *   npm run db:local -- --no-sync
 *   X402_NETWORK_MODE=testnet X402_FACILITATOR_MOCK=1 npm run dev:local     # LOCAL_APP_PORT=3006 for another port
 *   node scripts/e2e-ai-purchase.mjs                                         # E2E_BASE_URL=http://localhost:3006
 *
 * What it does:
 *   1. one cell: fills the look fields, copies the prompt through the real clipboard, then plays the AI for real —
 *      a throwaway-key x402 buyer (scripts/lib/raw-x402-buyer.mjs) POSTs the prompt's own body to the dev server
 *      (mock facilitator: signature checked locally, nothing on-chain) and PUTs the prompt's own decoration JSON
 *      with the returned key; then 「我让 AI 买完了」 must refresh the map and open the cell.
 *   2. a 3x2 block: touch drag pans (CDP touch events), a real mouse drag box-selects EVEN THOUGH the browser reports
 *      touch points (no maxTouchPoints spoof), the AI buys the whole rectangle in one payment, ONE key decorates all
 *      six cells, and the map shows it as one merged block (screenshot + pixel check).
 * Screenshots and the prompt texts are written to the system temp dir. The cells it buys stay in the LOCAL database
 * (it picks a free area itself every run).
 *
 * Env: E2E_BASE_URL (http://localhost:3005)  E2E_CELL_X/E2E_CELL_Y (force the single cell; the block starts at x+2)
 *      E2E_OUT_DIR (default <tmp>/av-ai-purchase-<time>)  LOCAL_DB_PORT (5433)
 *      PLAYWRIGHT_DIR (folder of the `playwright` package)  HTTPS_PROXY (only so the Tailwind CDN loads)
 * Exit code 0 = every check passed.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { generatePrivateKey } from 'viem/accounts'
import { buyOnce, makeBuyer, requestBill } from './lib/raw-x402-buyer.mjs'

const FINAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.E2E_BASE_URL || 'http://localhost:3005').replace(/\/$/, '')
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
async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${String(shots.length + 1).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, ...opts })
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

async function newPage(ctxOpts = {}) {
  // tall enough that the whole dialog fits in a screenshot
  const context = await browser.newContext({ viewport: { width: 1440, height: 1250 }, ...ctxOpts })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {})
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

async function copyAndRead(page) {
  await page.getByTestId('copy-for-ai').click()
  await page.waitForTimeout(300)
  // the Windows clipboard hands text back with CRLF line ends; the app's string uses LF
  const raw = await page.evaluate(() => navigator.clipboard.readText())
  return raw.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
}

const promptLines = (p) => p.split(String.fromCharCode(10))
/** The request body exactly as the prompt states it (`body: {...}`). */
function bodyFromPrompt(p) {
  const l = promptLines(p).find((x) => x.startsWith('body: '))
  return JSON.parse(l.slice('body: '.length))
}
/** The decoration JSON exactly as the prompt states it (the line after 【装修】买到后 PUT …). */
function putJsonFromPrompt(p) {
  const ls = promptLines(p)
  const i = ls.findIndex((x) => x.startsWith('【装修】买到后 PUT'))
  return i >= 0 ? JSON.parse(ls[i + 1]) : null
}

async function ownedSet() {
  const r = await localDb.query('SELECT x, y FROM grid_cells WHERE owner_address IS NOT NULL')
  return new Set(r.rows.map((a) => `${a.x},${a.y}`))
}
/** First area where one cell and the 3x2 block two columns to its right are all free (map can centre on it). */
async function findFreeArea() {
  if (process.env.E2E_CELL_X != null && process.env.E2E_CELL_Y != null) return { x: Number(process.env.E2E_CELL_X), y: Number(process.env.E2E_CELL_Y) }
  const owned = await ownedSet()
  for (let y = 58; y <= 69; y++) {
    for (let x = 34; x <= 64; x++) {
      let ok = true
      for (let dx = 0; dx < 6 && ok; dx++) for (let dy = 0; dy < 2 && ok; dy++) if (owned.has(`${x + dx},${y + dy}`)) ok = false
      if (ok) return { x, y }
    }
  }
  throw new Error('no free 6x2 area left in the local database (x 34-64, y 58-69); reset it with `npm run db:local -- --reset`')
}

/** The AI part: a throwaway-key x402 buyer. Returns the parsed response of the paid request. */
async function aiBuys(endpoint, body) {
  const buyer = makeBuyer(generatePrivateKey())
  const r = await buyOnce(buyer, `${BASE}${endpoint}`, body)
  if (r.stage !== 'paid' || r.status !== 200) throw new Error(`AI purchase failed: stage=${r.stage} status=${r.status} ${JSON.stringify(r.json)}`)
  return r
}
async function aiDecorates(apiKey, json) {
  const res = await fetch(`${BASE}/api/cells/update`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(json) })
  return { status: res.status, json: await res.json().catch(() => null) }
}

async function hoverCell(page, x, y) {
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
  const t = await page.locator('div.fixed.pointer-events-none').first().innerText({ timeout: 5000 }).catch(() => '')
  const m = t.match(/\[(\d+), (\d+)\]/)
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}

async function touchDrag(cdp, from, to, steps = 8) {
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y) }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps) })
    await new Promise((r) => setTimeout(r, 30))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** Colour pixels inside a window around the map centre (where the searched cell's top-left corner sits), so blocks from earlier runs don't count. */
async function orangeBox(page, hex, cellPx) {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return page.evaluate(({ want, cellPx }) => {
    const c = [...document.querySelectorAll('main canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0
    const sc = c.width / c.clientWidth
    const x0 = Math.max(0, Math.floor((c.clientWidth / 2 - 14) * sc)), x1 = Math.min(c.width, Math.ceil((c.clientWidth / 2 + 3 * cellPx + 14) * sc))
    const y0 = Math.max(0, Math.floor((c.clientHeight / 2 - 14) * sc)), y1 = Math.min(c.height, Math.ceil((c.clientHeight / 2 + 2 * cellPx + 24) * sc))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * c.width + x) * 4
        if (Math.abs(d[i] - want[0]) < 8 && Math.abs(d[i + 1] - want[1]) < 8 && Math.abs(d[i + 2] - want[2]) < 8) {
          n++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const scale = c.width / c.clientWidth
    // the pixel just inside the top border, in the middle of the frame: a merged block is dark there, six separate tiles would be solid colour
    const px = Math.round(minX + (maxX - minX) / 2)
    const py = Math.round(minY + 16 * scale)
    const i = (py * c.width + px) * 4
    return { n, scale, w: n ? (maxX - minX + 1) / scale : 0, h: n ? (maxY - minY + 1) / scale : 0, inside: n ? [d[i], d[i + 1], d[i + 2]] : null }
  }, { want, cellPx })
}

try {
  await localDb.connect()
  const area = await findFreeArea()
  const ONE = { x: area.x, y: area.y }
  const BLOCK = { x: area.x + 2, y: area.y, w: 3, h: 2 }
  const blockCells = []
  for (let dy = 0; dy < BLOCK.h; dy++) for (let dx = 0; dx < BLOCK.w; dx++) blockCells.push({ x: BLOCK.x + dx, y: BLOCK.y + dy })
  const owned0 = await ownedSet()
  for (const c of [ONE, ...blockCells]) if (owned0.has(`${c.x},${c.y}`)) throw new Error(`cell (${c.x},${c.y}) is already owned in the local DB; pick another with E2E_CELL_X/E2E_CELL_Y`)
  console.log(`      free area: single (${ONE.x},${ONE.y}), block (${BLOCK.x},${BLOCK.y}) ${BLOCK.w}x${BLOCK.h}`)

  // the dev server must be the testnet + mock-facilitator one: a throwaway key can only pay a fake settler
  const probe = await requestBill(makeBuyer(generatePrivateKey()), `${BASE}/api/cells/purchase`, ONE)
  const offered = (probe.required?.accepts || []).map((a) => a.network)
  if (probe.status !== 402 || !offered.includes('eip155:10143')) {
    throw new Error(`the dev server must run in testnet mode (X402_NETWORK_MODE=testnet X402_FACILITATOR_MOCK=1 npm run dev:local); its 402 offered [${offered.join(', ')}] with status ${probe.status}`)
  }

  // =====================================================================
  // 1) one cell
  // =====================================================================
  const { context, page } = await newPage()
  await openMap(page)
  console.log(`      browser reports navigator.maxTouchPoints = ${await page.evaluate(() => navigator.maxTouchPoints)}`)

  // The simplified product (2026-10-03): the map is full width, there is no FEED / sidebar / DOCS, and the removed surface answers 404.
  const headerText = await page.locator('header').innerText()
  check('header: no FEED tab, no /docs link, one link to skill.md', !/FEED|动态/.test(headerText) && (await page.locator('header a[href="/docs"]').count()) === 0 && (await page.locator('header a[href="/skill.md"]').count()) === 1, headerText.replace(/\s+/g, ' '))
  const mainBox = await page.locator('main').boundingBox()
  check('the desktop map takes the full window width (no sidebar)', !!mainBox && Math.abs(mainBox.width - 1440) <= 2, JSON.stringify(mainBox))
  const answers = {}
  for (const p of ['/api/rankings', '/api/events', '/api/referral/stats', '/api/commerce/create', '/api/cells/for-sale', '/api/cells/list-for-sale', '/api/cells/buy-resale', '/api/admin/payout', '/.well-known/ai-plugin.json']) {
    answers[p] = (await fetch(`${BASE}${p}`, { redirect: 'manual' })).status
  }
  check('removed endpoints and the ai-plugin manifest answer 404', Object.values(answers).every((s) => s === 404), JSON.stringify(answers))
  const docs = await fetch(`${BASE}/docs`, { redirect: 'manual' })
  check('/docs redirects permanently to /skill.md', docs.status === 308 && new URL(docs.headers.get('location'), BASE).pathname === '/skill.md', `${docs.status} ${docs.headers.get('location')}`)
  const sw = await (await fetch(`${BASE}/sw.js`)).text()
  check('/sw.js is the self-unregistering worker (no fetch handler)', sw.includes('registration.unregister()') && !sw.includes("'fetch'"))
  const services = await (await fetch(`${BASE}/api/services`)).json()
  const statuses = new Set((services.services || []).map((s) => s.status))
  check('/api/services statuses are only can_pay / failed / unchecked, no evidence fields, no sellers', [...statuses].every((s) => ['can_pay', 'failed', 'unchecked'].includes(s)) && !('sellers' in services) && (services.services || []).every((s) => !('evidence' in s) && !('evidence_by_network' in s)), [...statuses].join(','))
  const purchaseGet = await (await fetch(`${BASE}/api/cells/purchase`)).json()
  check('GET /api/cells/purchase reports no unavailable x402 network', Array.isArray(purchaseGet.x402_unavailable_networks) && purchaseGet.x402_unavailable_networks.length === 0, JSON.stringify(purchaseGet.x402_unavailable_networks))

  await searchCell(page, ONE.x, ONE.y)
  const modal = page.getByTestId('purchase-modal')
  await modal.waitFor({ timeout: T })
  const text0 = await modal.innerText()
  check('dialog opened for the chosen cell, shows its coordinates', text0.includes(`(${ONE.x}, ${ONE.y})`))
  check('total 0.10 USDC, 0.1 x 1', (await page.getByTestId('total-price').innerText()).includes('0.10 USDC'))
  check('shows the receiving address', (await page.getByTestId('pay-to').innerText()).trim() === '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6')
  check('shows Monad (eip155:143) before Base (eip155:8453)', (() => { const a = text0.indexOf('eip155:143'); const b = text0.indexOf('eip155:8453'); return a > -1 && b > a })())
  check('no browser-wallet button, no credit-card button, no network picker', (await page.getByTestId('wallet-pay').count()) === 0 && (await page.getByTestId('net-monad').count()) === 0 && (await page.getByRole('button', { name: '信用卡支付暂停' }).count()) === 0)
  const helper = await page.getByTestId('ai-helper').innerText()
  check('helper text: AI pays the confirmed total directly, never more', helper.includes('AI 直接付款') && helper.includes('不会超过') && !helper.includes('先向你确认'), helper)
  const optTexts = await Promise.all(['moneyswitch', 'awal', 'rawkey'].map((k) => page.getByTestId(`wallet-opt-${k}`).innerText()))
  check('"还没有 AI 钱包？" lists MoneySwitch / awal / raw key + x402 client with the right facts',
    optTexts[0].includes('MoneySwitch') && optTexts[0].includes('AI 拿不到私钥') &&
    optTexts[1].includes('Coinbase') && optTexts[1].includes('邮箱登录') && optTexts[1].includes('只支持 Base') &&
    optTexts[2].includes('私钥 + x402 客户端') && optTexts[2].includes('把整个钱包交给 AI'), optTexts.join(' | '))
  check('MoneySwitch link present', (await page.locator('a[href="https://github.com/dongsheng123132/moneyswitch"]').count()) === 1)

  await page.getByTestId('ai-iframe').fill('http://insecure.example')
  check('http:// iframe_url shows an error and disables 复制给我的 AI', (await page.getByTestId('ai-err-iframe_url').count()) === 1 && (await page.getByTestId('copy-for-ai').isDisabled()))
  const TITLE = 'Moon Cafe'
  await page.getByTestId('ai-title').fill(TITLE)
  await page.getByTestId('ai-summary').fill('A tiny cafe run by an AI barista')
  await page.getByTestId('ai-color-picker').fill('#7c3aed')
  await page.getByTestId('ai-iframe').fill('https://moon-cafe.example.com')
  await page.getByTestId('ai-service-url').fill('https://example.com/paid')
  check('colour picker fills the fill_color field', (await page.getByTestId('ai-fill-color').inputValue()).toLowerCase() === '#7c3aed')
  await shot(page, 'single-filled')

  const copied1 = await copyAndRead(page)
  saveText('prompt-single.txt', copied1)
  await shot(page, 'single-copied')
  check('button says 已复制 after copying', (await page.getByTestId('copy-for-ai').innerText()).includes('已复制'))
  check('clipboard text equals the preview shown in the dialog', copied1 === (await page.getByTestId('ai-prompt').evaluate((el) => el.textContent)))
  const origin = new URL(BASE).origin
  check(`prompt is short: ${promptLines(copied1).length} lines (<= 15)`, promptLines(copied1).length <= 15)
  check('prompt: confirmed total, pay directly, never more; no second confirmation', copied1.includes('总价 0.10 USDC 我已确认，直接付款；实际付款不得超过 0.10 USDC') && !copied1.includes('付款前先向我确认'))
  check('prompt: request, payTo check, networks, key rule, report-back, skill.md pointer',
    copied1.includes(`【请求】POST ${origin}/api/cells/purchase`) && copied1.includes('payTo 不一致就先停下来问我') && copied1.includes('Monad eip155:143 优先') &&
    copied1.includes('【api_key】gk_ 开头，只返回一次') && copied1.includes('monadvision.com/tx/') && copied1.includes('basescan.org/tx/') &&
    copied1.includes(`先读 ${origin}/skill.md 的「AI 购买」一节`))
  check('prompt: no awal command, no private-key claim, no inlined how-to / error tables', !/awal|-X POST|私钥|paid_fetch|cell_taken|方式一/.test(copied1))
  const putJson1 = putJsonFromPrompt(copied1)
  check('PUT JSON has exactly the five filled-in fields', JSON.stringify(putJson1) === JSON.stringify({ title: TITLE, summary: 'A tiny cafe run by an AI barista', fill_color: '#7c3aed', iframe_url: 'https://moon-cafe.example.com', service_url: 'https://example.com/paid' }), JSON.stringify(putJson1))
  await page.getByText('查看将要复制的提示词').click()
  await page.getByTestId('ai-prompt').scrollIntoViewIfNeeded()
  await shot(page, 'single-prompt-preview')

  for (const id of ['ai-title', 'ai-summary', 'ai-fill-color', 'ai-iframe', 'ai-service-url']) await page.getByTestId(id).fill('')
  const copiedEmpty = await copyAndRead(page)
  saveText('prompt-single-no-fields.txt', copiedEmpty)
  check('no fields filled -> no PUT call in the prompt', !copiedEmpty.includes('PUT ') && copiedEmpty.includes('我这次没有指定装修内容') && promptLines(copiedEmpty).length <= 15)

  await page.getByTestId('ai-done').click()
  await page.getByTestId('ai-done-msg').waitFor({ timeout: T })
  const notYet = await page.getByTestId('ai-done-msg').innerText()
  check('before the purchase: 我让 AI 买完了 says nothing was bought yet and keeps the dialog', notYet.includes('还没看到') && (await modal.isVisible()), notYet)
  await shot(page, 'ai-done-not-yet')

  // the AI, for real: the prompt's own request body, then the prompt's own decoration JSON
  const paid1 = await aiBuys('/api/cells/purchase', bodyFromPrompt(copied1))
  check('AI paid the 402 on Monad testnet (mock facilitator) and got a gk_ key + tx hash', paid1.accept.network === 'eip155:10143' && /^gk_[0-9a-f]{32}$/.test(paid1.json.api_key) && /^0x[0-9a-f]{64}$/.test(paid1.settle?.transaction || ''))
  const dec1 = await aiDecorates(paid1.json.api_key, putJson1)
  check('AI decorated the cell with the prompt\'s JSON (PUT 200)', dec1.status === 200 && dec1.json?.ok === true, JSON.stringify(dec1.json))
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
  // 2) a 3x2 block — touch panning, mouse box-select, one block, one key
  // =====================================================================
  const s2 = await newPage({ hasTouch: true }) // a touch-capable browser: maxTouchPoints > 0, no spoofing
  const p2 = s2.page
  await openMap(p2)
  const touchPoints = await p2.evaluate(() => navigator.maxTouchPoints)
  check('this browser reports touch points (maxTouchPoints > 0) and nothing is spoofed', touchPoints > 0, `maxTouchPoints=${touchPoints}`)
  await searchCell(p2, BLOCK.x, BLOCK.y) // centres the map: this cell's top-left corner sits at the centre of <main>
  const modal2 = p2.getByTestId('purchase-modal')
  await modal2.waitFor({ timeout: T })
  await modal2.locator('button').first().click() // the X: closes the dialog and clears the selection
  await modal2.waitFor({ state: 'detached', timeout: T })
  const box = await p2.locator('main').boundingBox()
  const cell = 8 * 2.5 // CELL_PX x default zoom
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // touch drag = pan (finger moves 100px left -> the map slides left -> 5 cells further right is under the same screen point)
  const before = await hoverCell(p2, cx + cell / 2, cy + cell / 2)
  const cdp = await s2.context.newCDPSession(p2)
  await touchDrag(cdp, { x: cx + 200, y: cy + 10 }, { x: cx + 100, y: cy + 10 })
  await p2.waitForTimeout(300)
  const after = await hoverCell(p2, cx + cell / 2, cy + cell / 2)
  check('touch drag pans the map: the cell under the same screen point moved ~5 columns', !!before && !!after && after.x - before.x >= 4 && after.x - before.x <= 6 && after.y === before.y, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
  check('...and a touch drag did NOT start a selection or open the dialog', (await p2.getByTestId('purchase-modal').count()) === 0)

  // re-centre, then a real mouse drag box-selects the 3x2 block
  await searchCell(p2, BLOCK.x, BLOCK.y)
  await modal2.waitFor({ timeout: T })
  await modal2.locator('button').first().click()
  await modal2.waitFor({ state: 'detached', timeout: T })
  const x0 = cx + cell / 2
  const y0 = cy + cell / 2
  await p2.mouse.move(x0, y0)
  await p2.mouse.down()
  await p2.mouse.move(x0 + cell * (BLOCK.w - 1), y0 + cell * (BLOCK.h - 1), { steps: 8 })
  await p2.mouse.up()
  await modal2.waitFor({ timeout: T })
  const expectedList = blockCells.map((c) => `(${c.x},${c.y})`).join(' ')
  const selText = await p2.getByTestId('selected-cells').innerText()
  check('mouse drag box-selects the 3x2 block although the browser has touch points', selText.includes(expectedList), selText)
  check('total 0.60 USDC for six cells', (await p2.getByTestId('total-price').innerText()).includes('0.60 USDC'))
  const BLOCK_COLOR = '#ff8800'
  await p2.getByTestId('ai-title').fill('Four-plus-two billboard')
  await p2.getByTestId('ai-color-picker').fill(BLOCK_COLOR)
  await shot(p2, 'multi-filled')
  const copied2 = await copyAndRead(p2)
  saveText('prompt-multi.txt', copied2)
  const body2 = bodyFromPrompt(copied2)
  check('multi prompt: bulk-purchase endpoint, six cells row-major in the body, total 0.60 confirmed', copied2.includes(`【请求】POST ${origin}/api/cells/bulk-purchase`) && Array.isArray(body2.cells) && body2.cells.length === 6 && body2.cells[0].x === BLOCK.x && body2.cells[0].y === BLOCK.y && copied2.includes('总价 0.60 USDC 我已确认，直接付款；实际付款不得超过 0.60 USDC'))
  check('multi prompt: says the whole 3×2 block is decorated together under the top-left key', copied2.includes(`多格是一整块 3×2：api_key 对应左上角 (${BLOCK.x},${BLOCK.y})，一次装修整块一起变`), promptLines(copied2).filter((l) => l.includes('整块')).join(' / '))
  check(`multi prompt is short: ${promptLines(copied2).length} lines (<= 15)`, promptLines(copied2).length <= 15)
  const putJson2 = putJsonFromPrompt(copied2)
  check('multi prompt: PUT JSON has only title + fill_color', JSON.stringify(putJson2) === JSON.stringify({ title: 'Four-plus-two billboard', fill_color: BLOCK_COLOR }), JSON.stringify(putJson2))

  // the AI buys the whole rectangle in ONE payment, then ONE PUT decorates all six cells
  const paid2 = await aiBuys('/api/cells/bulk-purchase', body2)
  check('AI paid once for six cells (0.60 USDC) and the response says one block', paid2.accept.amount === '600000' && JSON.stringify(paid2.json.block) === JSON.stringify({ x: BLOCK.x, y: BLOCK.y, w: 3, h: 2 }) && JSON.stringify(paid2.json.key_cell) === JSON.stringify({ x: BLOCK.x, y: BLOCK.y }), JSON.stringify({ block: paid2.json.block, key_cell: paid2.json.key_cell }))
  const dec2 = await aiDecorates(paid2.json.api_key, putJson2)
  check('ONE PUT with the one key (PUT 200)', dec2.status === 200 && dec2.json?.ok === true)
  const rows = (await localDb.query('SELECT x, y, title, fill_color, block_id, block_w, block_h, block_origin_x, block_origin_y FROM grid_cells WHERE x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4 ORDER BY y, x', [BLOCK.x, BLOCK.x + 2, BLOCK.y, BLOCK.y + 1])).rows
  check('local DB: all six cells share one block_id / 3x2 / origin and the new title + colour', rows.length === 6 && rows.every((r) => r.block_id === `blk_${BLOCK.x}_${BLOCK.y}_3x2` && r.block_w === 3 && r.block_h === 2 && r.block_origin_x === BLOCK.x && r.block_origin_y === BLOCK.y && r.title === 'Four-plus-two billboard' && r.fill_color === BLOCK_COLOR), JSON.stringify(rows.map((r) => [r.x, r.y, r.title, r.block_id])))
  const keys = (await localDb.query('SELECT x, y FROM cell_api_keys WHERE x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4', [BLOCK.x, BLOCK.x + 2, BLOCK.y, BLOCK.y + 1])).rows
  check('local DB: exactly one key row, for the origin cell', keys.length === 1 && keys[0].x === BLOCK.x && keys[0].y === BLOCK.y, JSON.stringify(keys))

  await p2.getByTestId('ai-done').click()
  await modal2.waitFor({ state: 'detached', timeout: T })
  await p2.getByText('Four-plus-two billboard').first().waitFor({ timeout: T })
  check('multi: 我让 AI 买完了 closes the dialog and opens the block\'s first cell', (await p2.locator('body').innerText()).includes('Four-plus-two billboard'))
  await shot(p2, 'multi-ai-done-review')

  // the map: one merged block (zoom in, centre on it, look at the canvas)
  await p2.mouse.click(8, 600) // backdrop of the detail card: closes it
  await p2.waitForTimeout(300)
  await p2.mouse.move(cx, cy)
  await p2.mouse.wheel(0, -1500) // zoom 2.5 -> 4.0
  await p2.waitForTimeout(600)
  await searchCell(p2, BLOCK.x, BLOCK.y) // the cell is owned now: recentres and opens its detail
  await p2.getByText('Four-plus-two billboard').first().waitFor({ timeout: T })
  await p2.mouse.click(8, 600)
  await p2.mouse.move(box.x + 40, box.y + box.height - 40) // park the pointer away from the block (no hover frame)
  await p2.waitForTimeout(600)
  const cellPx = 8 * 4.0
  const ob = await orangeBox(p2, BLOCK_COLOR, cellPx)
  // one merged block = ONE dark-filled frame in the block colour, 3 cells wide (its lower border sits under the title strip, so the
  // colour box is shorter than 2 cells); six separate 1x1 tiles would be ~6 x cell^2 pixels of solid colour
  check('the map draws the six cells as ONE merged 3x2 block (a 3-cell-wide colour frame, dark inside, far fewer colour pixels than six solid tiles)',
    ob.n > 50 && Math.abs(ob.w - 3 * cellPx) <= 10 && ob.h >= 1.2 * cellPx && ob.n < 0.25 * 6 * cellPx * cellPx && ob.inside && Math.max(...ob.inside) < 60,
    `colour bbox ${ob.w.toFixed(0)} x ${ob.h.toFixed(0)} px (3 cells = ${3 * cellPx}px wide), ${ob.n} colour px (six solid tiles would be ${6 * cellPx * cellPx}), inside pixel rgb ${JSON.stringify(ob.inside)}`)
  await shot(p2, 'block-merged-map')
  await shot(p2, 'block-merged-map-zoom', { clip: { x: Math.round(cx - 170), y: Math.round(cy - 130), width: 480, height: 330 } })
  check('no uncaught page errors (block session)', p2.__pageErrors.length === 0, p2.__pageErrors.join(' | '))
  await s2.context.close()

  exitCode = results.every((r) => r.ok) ? 0 : 1
} catch (e) {
  check('e2e script ran to the end', false, e?.stack || e)
  exitCode = 1
  if (activePage) await shot(activePage, 'failure-state').catch(() => {})
} finally {
  await browser.close().catch(() => {})
  await localDb.end().catch(() => {})
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, results, shots }, null, 2))
  const passed = results.filter((r) => r.ok).length
  console.log(`\n判决 ${passed}/${results.length}  (exit ${exitCode})`)
  console.log(`screenshots + prompt txt + results.json: ${OUT}`)
}
process.exit(exitCode)
