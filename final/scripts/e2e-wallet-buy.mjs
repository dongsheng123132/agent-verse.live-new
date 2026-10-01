#!/usr/bin/env node
/**
 * Local end-to-end of "buy a cell with a browser wallet, then decorate it".
 * Touches ONLY the local stack — never production:
 *
 *   npm run db:local -- --no-sync
 *   X402_NETWORK_MODE=testnet X402_FACILITATOR_MOCK=1 npm run dev:local
 *   node scripts/e2e-wallet-buy.mjs
 *
 * What is real: the page, the wallet-pay code, the official @x402/fetch client,
 * the server routes, the local PGlite database, EIP-3009 signatures (made by a
 * throwaway viem key and verified by the mock facilitator).
 * What is fake: the wallet (a mock EIP-1193 provider injected as window.ethereum,
 * test/helpers/mock-wallet.mjs), the facilitator (X402_FACILITATOR_MOCK=1, dev only),
 * and the chain RPC (Playwright answers the public RPC URLs with a stub balance).
 *
 * Env: E2E_BASE_URL (http://localhost:3005)  E2E_CELL_X/E2E_CELL_Y (61/61, must be free)
 *      E2E_OUT_DIR (screenshots; default <tmp>/av-wallet-e2e-<time>)  LOCAL_DB_PORT (5433)
 *      PLAYWRIGHT_DIR (folder of the `playwright` package; default tries node resolution, then the
 *      walkthrough install)  HTTPS_PROXY (only used so the Tailwind CDN script can load)
 * Exit code 0 = every check passed.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createMockWallet } from '../test/helpers/mock-wallet.mjs'

const FINAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.env.E2E_BASE_URL || 'http://localhost:3005').replace(/\/$/, '')
// the colour the e2e paints the cell with: random per run (override with E2E_COLOR) so earlier runs' cells never count
const COLOR = (process.env.E2E_COLOR || '#' + [0, 1, 2].map(() => (60 + Math.floor(Math.random() * 190)).toString(16).padStart(2, '0')).join('')).toLowerCase()
const CELL = { x: Number(process.env.E2E_CELL_X ?? 61), y: Number(process.env.E2E_CELL_Y ?? 61) }
const DB_PORT = Number(process.env.LOCAL_DB_PORT) || 5433
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = process.env.E2E_OUT_DIR || path.join(os.tmpdir(), `av-wallet-e2e-${stamp}`)
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

// ---------- tiny assertion collector ----------
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`)
}
const shots = []
async function shot(page, name) {
  const file = path.join(OUT, `${String(shots.length + 1).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
  console.log(`      screenshot: ${file}`)
}

// Map helpers. At zoom 2.5 a 1x1 cell is a pixel avatar drawn over its colour, so the colour is only readable when
// zoomed far out (cells <= 3px are plain tiles in the cell colour). Wheel zoom: zoom -= deltaY * 0.001.
async function wheelZoom(page, deltaY) {
  const box = await page.locator('main').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, deltaY)
  await page.waitForTimeout(600)
}
async function countColourPixels(page, hex, tol = 6) {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return page.evaluate(({ want, tol }) => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - want[0]) < tol && Math.abs(d[i + 1] - want[1]) < tol && Math.abs(d[i + 2] - want[2]) < tol) n++
    }
    return n
  }, { want, tol })
}

// ---------- the fake wallet + the fake chain RPC ----------
const wallet = createMockWallet({ initialChainId: 1, knownChainIds: [1], usdcBalance: 50_000n, signDelayMs: 1500 }) // starts on chain 1, 0.05 USDC
const rpcCalls = []
const RPC_HOSTS = /^(testnet-rpc\.monad\.xyz|rpc\.monad\.xyz|sepolia\.base\.org|mainnet\.base\.org)$/
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY
const browser = await chromium.launch({
  headless: true,
  ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}),
})

async function newPage(ctxOpts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {})
  await context.route((url) => RPC_HOSTS.test(url.hostname), async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = JSON.parse(req.postData() || '{}')
    rpcCalls.push({ host: new URL(req.url()).hostname, method: body.method })
    let result = '0x0'
    if (body.method === 'eth_call') result = '0x' + wallet.state.usdcBalance.toString(16).padStart(64, '0')
    if (body.method === 'eth_chainId') result = '0x' + wallet.state.chainId.toString(16)
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) })
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.__pageErrors = pageErrors
  return { context, page }
}

async function injectWallet(page) {
  await page.exposeFunction('__mockWalletRequest', async (args) => {
    try {
      return { ok: true, result: await wallet.request(args) }
    } catch (e) {
      return { ok: false, code: e.code, message: e.message }
    }
  })
  await page.addInitScript(() => {
    window.ethereum = {
      isMetaMask: true,
      request: async (args) => {
        const r = await window.__mockWalletRequest({ method: args.method, params: args.params })
        if (r.ok) return r.result
        const e = new Error(r.message)
        e.code = r.code
        throw e
      },
      on() {},
      removeListener() {},
    }
  })
}

const T = 90_000
let exitCode = 1
const localDb = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres` })

try {
  await localDb.connect()
  const free = await localDb.query('SELECT owner_address FROM grid_cells WHERE x=$1 AND y=$2', [CELL.x, CELL.y])
  if (free.rows[0]?.owner_address) throw new Error(`cell (${CELL.x},${CELL.y}) is already owned in the local DB; pick another with E2E_CELL_X/E2E_CELL_Y`)

  // =====================================================================
  // Session 1: buy
  // =====================================================================
  const { context, page } = await newPage()
  await injectWallet(page)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: T })
  await page.waitForSelector('header input[type=text]', { timeout: T })
  await page.waitForTimeout(1500)
  await shot(page, 'map-loaded')
  await wheelZoom(page, 2200) // zoom out to 0.3
  await page.mouse.move(700, 20)
  await page.waitForTimeout(500)
  const baseline = await countColourPixels(page, COLOR)
  await wheelZoom(page, -2200) // back to 2.5

  // select the cell through the coordinate search (same path as clicking it on the map)
  const search = page.locator('header input[type=text]').first()
  await search.fill(`${CELL.x},${CELL.y}`)
  await search.press('Enter')
  await page.locator(`button:has-text("(${CELL.x},${CELL.y})")`).first().click({ timeout: T })
  const modal = page.getByTestId('purchase-modal')
  await modal.waitFor({ timeout: T })
  check('purchase modal opened for the chosen cell', (await modal.innerText()).includes(`(${CELL.x}, ${CELL.y})`))
  check('price shows $0.10 USDC for 1 cell', (await page.getByTestId('total-price').innerText()).includes('0.10'))
  check('Monad is selected by default', (await page.getByTestId('net-monad').getAttribute('aria-checked')) === 'true' && (await page.getByTestId('net-base').getAttribute('aria-checked')) === 'false')
  check('primary button says 连接钱包付款', (await page.getByTestId('wallet-pay').innerText()).includes('连接钱包付款'))
  check('commerce is shown as paused and disabled', await page.getByRole('button', { name: '信用卡支付暂停' }).isDisabled())
  check('"让我的 AI 买" prompt mentions paid_fetch, the endpoint and max_price 0.10', await (async () => {
    const t = await page.getByTestId('ai-prompt').innerText()
    return t.includes('paid_fetch') && t.includes('/api/cells/purchase') && t.includes('max_price: "0.10"') && t.includes('npx awal@latest')
  })())
  check('modal says only USDC is needed, gas is paid by the facilitator', (await modal.innerText()).includes('不需要 gas'))
  await shot(page, 'purchase-modal')

  // choose Monad explicitly (as a person would), pay with too little USDC first
  await page.getByTestId('net-monad').click()
  await page.getByTestId('wallet-pay').click()
  await page.getByTestId('pay-error').waitFor({ timeout: T })
  const lowMsg = await page.getByTestId('pay-error').innerText()
  check('0.05 USDC balance: error says USDC is not enough (and no gas needed)', lowMsg.includes('USDC 不够') && lowMsg.includes('0.05') && lowMsg.includes('0.10') && lowMsg.includes('不需要 gas'), lowMsg)
  check('...and NO signature was requested from the wallet', wallet.state.signCalls === 0, `signCalls=${wallet.state.signCalls}`)
  check('...the balance came from the public RPC (testnet Monad)', rpcCalls.some((c) => c.host === 'testnet-rpc.monad.xyz' && c.method === 'eth_call'), JSON.stringify(rpcCalls))
  check('...the wallet had been moved to Monad testnet 10143 by adding the chain', wallet.state.chainId === 10143 && wallet.state.added.length === 1, `chainId=${wallet.state.chainId} added=${wallet.state.added.length}`)
  await shot(page, 'insufficient-usdc')

  // top up and pay
  wallet.state.usdcBalance = 5_000_000n
  await page.getByTestId('wallet-pay').click()
  await page.getByTestId('pay-status').filter({ hasText: '签名' }).waitFor({ timeout: T }).catch(() => {})
  await shot(page, 'waiting-for-signature')
  const success = page.getByTestId('success-modal')
  await success.waitFor({ timeout: T })
  await page.waitForTimeout(500)
  const apiKey = (await page.getByTestId('api-key').innerText()).trim()
  const txHref = await page.getByTestId('tx-link').getAttribute('href')
  const warning = await page.getByTestId('key-warning').innerText()
  check('success page shows a gk_ API key', /^gk_[0-9a-f]{32}$/.test(apiKey), apiKey)
  check('success page shows the "只显示这一次，请保存" warning', warning.includes('只显示这一次') && warning.includes('请保存'), warning)
  check('success page links the transaction on the Monad (testnet) explorer', /^https:\/\/testnet\.monadvision\.com\/tx\/0x[0-9a-f]{64}$/.test(txHref || ''), txHref)
  await shot(page, 'payment-success-key-and-tx')

  await page.getByTestId('copy-key').click()
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e.message}`)
  check('「复制 Key」 puts the key on the clipboard', clip === apiKey, clip)
  const stored = await page.evaluate(() => localStorage.getItem('agentverse.cellKeys.v1'))
  const storedObj = JSON.parse(stored || '{}')
  check('key was saved in localStorage under the cell coordinate', storedObj[`${CELL.x},${CELL.y}`]?.key === apiKey, stored)

  // wallet-side facts
  const added = wallet.state.added[0]
  check('wallet_addEthereumChain was sent with Monad testnet parameters', added?.chainId === '0x279f' && added?.rpcUrls?.[0] === 'https://testnet-rpc.monad.xyz' && added?.nativeCurrency?.symbol === 'MON' && added?.blockExplorerUrls?.[0] === 'https://testnet.monadvision.com', JSON.stringify(added))
  check('exactly one signature, for chainId 10143 and the Monad testnet USDC, value 100000', wallet.state.signCalls === 1 && wallet.state.signed[0].domain.chainId === 10143 && wallet.state.signed[0].domain.verifyingContract.toLowerCase() === '0x534b2f3a21130d7a60830c2df862319e593943a3' && wallet.state.signed[0].message.value === '100000', JSON.stringify(wallet.state.signed[0]?.domain))

  // server-side facts (local DB)
  const order = (await localDb.query('SELECT network, tx_hash, payer_address, amount_usdc FROM grid_orders WHERE x=$1 AND y=$2 ORDER BY created_at DESC LIMIT 1', [CELL.x, CELL.y])).rows[0]
  const cellRow = (await localDb.query('SELECT owner_address FROM grid_cells WHERE x=$1 AND y=$2', [CELL.x, CELL.y])).rows[0]
  check('local DB: order recorded on eip155:10143 with the tx hash shown on the page', order?.network === 'eip155:10143' && txHref?.endsWith(order?.tx_hash), JSON.stringify(order))
  check('local DB: the wallet address owns the cell', cellRow?.owner_address?.toLowerCase() === wallet.address.toLowerCase(), cellRow?.owner_address)

  // continue to decorate
  await page.getByTestId('key-saved').click()
  const form = page.getByTestId('decorate-form')
  await form.waitFor({ timeout: T })
  check('after "I saved it" the decorate form is already open for this cell', await form.isVisible())
  check('the form is pre-filled with the saved key (hidden field)', (await page.getByTestId('decorate-key').inputValue()) === apiKey)
  await shot(page, 'decorate-form-open')

  const TITLE = `E2E Wallet Cell ${CELL.x},${CELL.y}`
  await page.getByTestId('decorate-title').fill(TITLE)
  await page.getByTestId('decorate-color').fill(COLOR)
  await page.getByTestId('decorate-summary').fill('Bought with a mock browser wallet on Monad testnet')
  await page.getByTestId('decorate-save').click()
  await page.getByTestId('decorate-msg').filter({ hasText: '已保存' }).waitFor({ timeout: T })
  await shot(page, 'decorate-saved')
  const headerTitle = await page.locator('h2').filter({ hasText: TITLE }).first().innerText()
  check('detail view header shows the new title right after saving', headerTitle.includes(TITLE), headerTitle)

  const gridRow = await page.evaluate(async ({ x, y }) => (await (await fetch('/api/grid', { cache: 'no-store' })).json()).find((c) => c.x === x && c.y === y), CELL)
  check('/api/grid (what the map draws) has the new title and colour', gridRow?.title === TITLE && gridRow?.color?.toLowerCase() === COLOR, JSON.stringify(gridRow))
  const apiCell = await page.evaluate(async ({ x, y }) => (await (await fetch(`/api/cells?x=${x}&y=${y}`, { cache: 'no-store' })).json()).cell, CELL)
  check('/api/cells (detail) has the new title, colour and summary', apiCell?.title === TITLE && apiCell?.color?.toLowerCase() === COLOR && apiCell?.summary?.includes('mock browser wallet'), JSON.stringify({ t: apiCell?.title, c: apiCell?.color }))

  // close the detail and look at the map: hover tooltip shows the title, canvas pixel is the colour
  await page.mouse.click(8, 8) // the dimmed backdrop closes the detail card
  await form.waitFor({ state: 'detached', timeout: T })
  await page.waitForTimeout(500)
  const mainBox = await page.locator('main').boundingBox()
  const hx = Math.round(mainBox.x + mainBox.width / 2 + 10)
  const hy = Math.round(mainBox.y + mainBox.height / 2 + 10) // handleNavigate puts the cell's top-left at the container centre; 20px cells at zoom 2.5
  await page.mouse.move(hx - 40, hy - 40)
  await page.mouse.move(hx, hy, { steps: 6 })
  await page.waitForTimeout(600)
  const tip = await page.locator('main').innerText()
  check('map hover tooltip shows the new title', tip.includes(TITLE), tip.slice(0, 200).replace(/\s+/g, ' '))
  await shot(page, 'map-with-new-title')
  await wheelZoom(page, 2200) // zoom out: cells become plain tiles in their own colour
  await page.mouse.move(700, 20) // off the canvas, so no hover highlight sits on the tile
  let painted = 0
  for (let i = 0; i < 10 && painted - baseline < 3; i++) { // the canvas redraws on the next animation frames
    await page.waitForTimeout(400)
    painted = await countColourPixels(page, COLOR)
  }
  check(`map canvas (zoomed out): the cell now paints ${COLOR}`, painted - baseline >= 3, `${painted} pixels now vs ${baseline} before the purchase`)
  await shot(page, 'map-zoomed-out-with-new-colour')

  // reload: the cell is still there, the saved key still offers 装修
  await page.goto(`${BASE}/?x=${CELL.x}&y=${CELL.y}`, { waitUntil: 'domcontentloaded', timeout: T })
  await page.getByTestId('decorate-open').waitFor({ timeout: T })
  check('after a reload the detail shows the title and offers 装修 (key remembered in this browser)', (await page.locator('h2').filter({ hasText: TITLE }).count()) > 0)
  await shot(page, 'reload-detail-with-decorate-button')
  check('no uncaught page errors in session 1', page.__pageErrors.length === 0, page.__pageErrors.join(' | '))
  await context.close()

  // =====================================================================
  // Session 2: a browser that does NOT have the key ("我有 key" + paste)
  // =====================================================================
  const s2 = await newPage()
  await s2.page.goto(`${BASE}/?x=${CELL.x}&y=${CELL.y}`, { waitUntil: 'domcontentloaded', timeout: T })
  await s2.page.getByTestId('have-key-open').waitFor({ timeout: T })
  check('fresh browser: no 装修 button, only 「我有 key」', (await s2.page.getByTestId('decorate-open').count()) === 0)
  await s2.page.getByTestId('have-key-open').click()
  const wrong = 'gk_' + 'f'.repeat(32)
  await s2.page.getByTestId('decorate-key').fill(wrong) // paste
  await s2.page.getByTestId('decorate-title').fill('should not save')
  await s2.page.getByTestId('decorate-save').click()
  const errBox = s2.page.getByTestId('decorate-msg')
  await errBox.waitFor({ timeout: T })
  const errText = await errBox.innerText()
  check('wrong key: Chinese message about 403 not_owner', errText.includes('not_owner') && errText.includes('key'), errText)
  await shot(s2.page, 'wrong-key-403')

  await s2.page.getByTestId('decorate-key').fill(apiKey) // paste the right one
  await s2.page.getByTestId('decorate-title').fill(`${TITLE} (edited via pasted key)`)
  await s2.page.getByTestId('decorate-iframe').fill('http://insecure.example')
  await s2.page.getByTestId('decorate-save').click()
  const iframeErr = await errBox.innerText()
  check('http:// iframe is refused in Chinese before anything is sent', iframeErr.includes('iframe') && iframeErr.includes('https://'), iframeErr)
  await s2.page.getByTestId('decorate-iframe').fill('')
  await s2.page.getByTestId('decorate-save').click()
  await errBox.filter({ hasText: '已保存' }).waitFor({ timeout: T })
  const after = (await localDb.query('SELECT title FROM grid_cells WHERE x=$1 AND y=$2', [CELL.x, CELL.y])).rows[0]
  check('pasted key saves; local DB has the edited title', after?.title === `${TITLE} (edited via pasted key)`, after?.title)
  const remembered = await s2.page.evaluate(() => localStorage.getItem('agentverse.cellKeys.v1'))
  check('...and the key is now remembered in that browser too', JSON.parse(remembered || '{}')[`${CELL.x},${CELL.y}`]?.key === apiKey)
  await shot(s2.page, 'pasted-key-saved')
  check('no uncaught page errors in session 2', s2.page.__pageErrors.length === 0, s2.page.__pageErrors.join(' | '))
  await s2.context.close()

  exitCode = results.every((r) => r.ok) ? 0 : 1
} catch (e) {
  check('e2e script ran to the end', false, e?.stack || e)
  exitCode = 1
} finally {
  await browser.close().catch(() => {})
  await localDb.end().catch(() => {})
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, cell: CELL, wallet: wallet.address, results, shots, rpcCalls }, null, 2))
  const passed = results.filter((r) => r.ok).length
  console.log(`\n判决 ${passed}/${results.length}  (exit ${exitCode})`)
  console.log(`screenshots + results.json: ${OUT}`)
}
process.exit(exitCode)
