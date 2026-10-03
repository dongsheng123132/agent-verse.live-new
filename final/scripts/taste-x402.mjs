#!/usr/bin/env node
/**
 * "尝一口传统 x402"：让你亲手感受一个拿着【裸私钥】的 x402 买家是怎么工作的——一条命令，脚本替你做完所有事。
 *
 *   npm run taste                     # 真实的 Monad 测试网（要一点测试网 USDC，脚本会教你去水龙头领）
 *   npm run taste -- --mock           # 不需要任何资金；用开发用的假 facilitator，不会有任何链上交易
 *   npm run taste -- --x 61 --y 72    # 指定格子（默认自动挑一个空格）
 *   npm run taste -- --mock --no-wait # 做完就退出，不等 Enter（给自动化跑用）
 *
 * 它做的事（全程中文讲解）：
 *   0. 在 %USERPROFILE%\.agentverse-taste\wallet.json 加载或新建一个一次性钱包（私钥绝不打印，只打印地址）
 *   1. 起本地数据库 + 本地开发服务器（测试网模式；--mock 时用假 facilitator），挑一个空格
 *   2. 发出原始请求，把 402 的 PAYMENT-REQUIRED 解码成一张看得懂的账单
 *   3. 签 EIP-3009 授权   4. 带着 PAYMENT-SIGNATURE 重试   5. 看 PAYMENT-RESPONSE 里的交易哈希
 *   6. 用拿到的 gk_ key 装修格子   7. 打印本地格子链接   8. 总结：这个买家手里握着整把私钥
 *   最后保持服务器开着，按 Enter 才清理自己起的进程。
 *
 * 安全闸：只会给 eip155:10143（Monad 测试网）或 eip155:84532（Base Sepolia）签名；402 若只提供别的网络，
 * 脚本拒绝并退出（退出码 2）。上限 1 USDC。只连 localhost 和测试网 RPC，不碰生产库、不碰主网。
 */
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import readline from 'node:readline'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createPublicClient, defineChain, http as viemHttp, parseAbi } from 'viem'
import {
  GuardError,
  MONAD_TESTNET,
  NETWORKS,
  chooseAccept,
  describeAuthorization,
  describeBill,
  formatUsdc,
  loadOrCreateWallet,
  makeBuyer,
  maskKey,
  networkLabel,
  payWithSignature,
  publicView,
  requestBill,
  saveCellKey,
  signBill,
} from './lib/raw-x402-buyer.mjs'

const FINAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ------------------------------------------------------------------ args
function parseArgs(argv) {
  const out = { mock: false, wait: true, x: null, y: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => (a.includes('=') ? a.split('=')[1] : argv[++i])
    if (a === '--mock') out.mock = true
    else if (a === '--no-wait') out.wait = false
    else if (a === '--help' || a === '-h') out.help = true
    else if (a === '--x' || a.startsWith('--x=')) out.x = Number(val())
    else if (a === '--y' || a.startsWith('--y=')) out.y = Number(val())
    else {
      console.error(`不认识的参数：${a}（--help 看用法）`)
      process.exit(1)
    }
  }
  return out
}
const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log('用法：npm run taste [-- --mock] [-- --x N --y N] [-- --no-wait]\n详见脚本开头的注释。')
  process.exit(0)
}
if ((args.x == null) !== (args.y == null) || [args.x, args.y].some((v) => v != null && !Number.isInteger(v))) {
  console.error('--x 和 --y 要一起给，并且是整数。')
  process.exit(1)
}

// ------------------------------------------------------------------ tiny helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const line = (s = '') => console.log(s)
const rule = () => line('─'.repeat(64))
function step(n, title) {
  line()
  rule()
  line(`第 ${n} 步  ${title}`)
  rule()
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port })
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
    s.setTimeout(1500, () => (s.destroy(), resolve(false)))
  })
}
async function pickFreePort(start) {
  let p = start
  while (await portOpen(p)) p++
  return p
}
async function waitFor(fn, { timeoutMs, everyMs = 1000, what }) {
  const t0 = Date.now()
  for (;;) {
    if (await fn()) return
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时：${what}`)
    await sleep(everyMs)
  }
}

// ------------------------------------------------------------------ the local stack (db + dev server), cleaned up on exit
const children = []
let logFile = null
function tailLog(n = 25) {
  try {
    return fs.readFileSync(logFile, 'utf8').split('\n').slice(-n).join('\n')
  } catch {
    return '(没有日志)'
  }
}
function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}
let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  for (const c of children.reverse()) killTree(c)
  if (children.length) line('已关闭本脚本启动的本地服务器和数据库。')
}
process.on('SIGINT', () => (cleanup(), process.exit(130)))
process.on('SIGTERM', () => (cleanup(), process.exit(143)))

async function startStack({ mock }) {
  logFile = path.join(os.tmpdir(), `taste-x402-${Date.now()}.log`)
  const log = fs.openSync(logFile, 'a')
  const spawnNode = (script, scriptArgs, env) => {
    const child = spawn(process.execPath, [path.join('scripts', script), ...scriptArgs], { cwd: FINAL_DIR, env, stdio: ['ignore', log, log], windowsHide: true })
    children.push(child)
    child.on('exit', (code) => {
      if (!cleaned) {
        line(`\n${script} 意外退出（代码 ${code}）。最后的日志：\n${tailLog()}`)
        cleanup()
        process.exit(1)
      }
    })
    return child
  }

  const dbPort = 5433
  if (await portOpen(dbPort)) {
    line(`  数据库：检测到 127.0.0.1:${dbPort} 上已经有一个本地数据库在跑，直接复用（脚本不会动它）。`)
  } else {
    line(`  数据库：启动本地 PGlite（127.0.0.1:${dbPort}，不从线上同步任何东西）……`)
    spawnNode('local-db.mjs', ['--no-sync', `--port=${dbPort}`], { ...process.env, LOCAL_DB_PORT: String(dbPort) })
    await waitFor(() => portOpen(dbPort), { timeoutMs: 90_000, what: '本地数据库启动' })
  }

  const wantedApp = Number(process.env.LOCAL_APP_PORT) || 3005
  const appPort = await pickFreePort(wantedApp)
  if (appPort !== wantedApp) {
    line(`  开发服务器：${wantedApp} 端口被占用，换到 ${appPort}。（若占用者是另一个 next dev，两者共用 final/.next 目录，偶尔会互相干扰，建议先关掉它。）`)
  }
  const env = { ...process.env, LOCAL_DB_PORT: String(dbPort), LOCAL_APP_PORT: String(appPort), X402_NETWORK_MODE: 'testnet' }
  if (mock) env.X402_FACILITATOR_MOCK = '1'
  else delete env.X402_FACILITATOR_MOCK
  line(`  开发服务器：启动 next dev（端口 ${appPort}，测试网模式，${mock ? '假 facilitator' : '真实 facilitator'}），第一次编译要等一会儿……`)
  spawnNode('dev-local.mjs', [], env)
  const base = `http://localhost:${appPort}`
  await waitFor(async () => {
    try {
      return (await fetch(`${base}/api/grid`, { cache: 'no-store' })).status === 200
    } catch {
      return false
    }
  }, { timeoutMs: 240_000, everyMs: 1500, what: '开发服务器就绪' })
  line(`  就绪：${base}`)
  return { base, appPort }
}

// ------------------------------------------------------------------ testnet USDC balance (read-only RPC)
const balanceAbi = parseAbi(['function balanceOf(address owner) view returns (uint256)'])
async function usdcBalance(caip2, address) {
  const n = NETWORKS[caip2]
  const client = createPublicClient({
    chain: defineChain({ id: n.chainId, name: n.name, nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [n.rpc] } } }),
    transport: viemHttp(n.rpc),
  })
  return client.readContract({ address: n.usdc, abi: balanceAbi, functionName: 'balanceOf', args: [address] })
}

async function ensureFunded(address, needAtomic) {
  const n = NETWORKS[MONAD_TESTNET]
  let bal = await usdcBalance(MONAD_TESTNET, address)
  line(`  ${n.name}上这个钱包的 USDC 余额：${formatUsdc(bal)}（买一个格子要 ${formatUsdc(needAtomic)}）`)
  if (bal >= needAtomic) return bal
  line()
  line('  余额不够，去领一点测试网 USDC（免费，不要钱）：')
  line('    1. 打开 https://faucet.circle.com')
  line('    2. 网络选 Monad Testnet，代币选 USDC')
  line(`    3. 把下面这个地址粘进去：${address}`)
  line('    4. 过一下人机验证（这一步只能你自己点），领取')
  line('  不需要 MON：gas 由 facilitator 代付。领到之后脚本会自动继续（Ctrl+C 退出）。')
  line()
  let last = bal
  process.stdout.write('  等待到账')
  for (;;) {
    await sleep(5000)
    try {
      bal = await usdcBalance(MONAD_TESTNET, address)
    } catch {
      process.stdout.write('?')
      continue
    }
    if (bal >= needAtomic) break
    if (bal !== last) {
      process.stdout.write(`[${formatUsdc(bal)}]`)
      last = bal
    } else process.stdout.write('.')
  }
  line()
  line(`  到账了：${formatUsdc(bal)} USDC`)
  return bal
}

// ------------------------------------------------------------------ main
async function main() {
  line()
  line('==== 尝一口「传统 x402」：一个拿着裸私钥的买家 ====')
  line(args.mock
    ? '【模拟模式 --mock】本次不会有任何真实转账：服务器用的是开发用的假 facilitator（只在本机校验签名、再编一个交易哈希），不需要任何资金，链上查不到这笔交易。想体验真实的 Monad 测试网付款，去掉 --mock 重新运行。'
    : '【真实 Monad 测试网】用的是测试网 USDC（没有价值），通过真实的 facilitator 结算，交易会上链、浏览器里能查到。想不花任何东西先看流程，加 --mock。')

  // 0. wallet
  line()
  const wallet = loadOrCreateWallet()
  const view = publicView(wallet)
  line(view.created ? '一次性钱包：刚为你新建了一个。' : '一次性钱包：沿用上次的那个。')
  line(`  文件   ${view.file}`)
  line(`  地址   ${view.address}`)
  line('  私钥保存在上面这个文件里（在仓库之外），脚本绝不会打印它；这个钱包只用于测试网，不要往里放真钱。')
  const buyer = makeBuyer(wallet.data.privateKey)

  // stack
  line()
  line('准备本地环境：')
  const { base } = await startStack({ mock: args.mock })
  const PRICE_ATOMIC = 100_000n
  if (!args.mock) {
    line()
    line('检查测试网 USDC 余额：')
    await ensureFunded(buyer.account.address, PRICE_ATOMIC)
  }
  const url = `${base}/api/cells/purchase`

  // 1. pick a cell
  step(1, '挑一个空格子')
  let cell = null
  const candidates = args.x != null ? [{ x: args.x, y: args.y }] : Array.from({ length: 60 }, () => ({ x: 20 + Math.floor(Math.random() * 70), y: 20 + Math.floor(Math.random() * 70) }))
  line(`  我在问服务器：这个格子能买吗？（不付款、不改任何东西，只看它回 402 还是别的）${args.x != null ? '' : '——随机试几个，跳过展示区和已被买走的。'}`)
  let warmTries = 0
  for (const c of candidates) {
    const r = await requestBill(buyer, url, c)
    if (r.status === 402) {
      cell = c
      break
    }
    if (r.status === 503 && warmTries < 15) {
      warmTries++
      await sleep(2000)
      candidates.push(c)
      continue
    }
    const why = `${r.status} ${r.json?.error || ''} ${r.json?.message || ''}`.trim()
    if (args.x != null) {
      line(`  (${c.x},${c.y}) 买不了：${why}`)
      throw new Error(`你指定的格子买不了：${why}`)
    }
    if (r.status === 503) throw new Error(`x402 服务没起来：${why}。日志：${tailLog(10)}`)
  }
  if (!cell) throw new Error('试了很多格子都没找到能买的空格，换个 --x/--y 试试。')
  line(`  选定 (${cell.x},${cell.y})：服务器回了 402 Payment Required，意思是“可以买，请先付 0.10 USDC”。`)
  await sleep(300)

  // 2. the raw request and the bill
  step(2, '发出原始请求，把 402 账单解码成人话')
  line(`  请求：POST ${url}`)
  line(`  body：${JSON.stringify(cell)}`)
  const bill = await requestBill(buyer, url, cell)
  if (bill.status !== 402) throw new Error(`原本应该是 402，实际是 ${bill.status}：${JSON.stringify(bill.json)}`)
  line(`  响应：HTTP 402 Payment Required；响应头 PAYMENT-REQUIRED 是一段 base64（${(bill.header || '').length} 字符），解码后就是这张账单：`)
  line()
  let accept
  try {
    accept = chooseAccept(bill.required)
  } catch (e) {
    if (e instanceof GuardError) {
      line(`  安全闸触发：${e.message}`)
      line('  脚本只给测试网签名，已拒绝，没有签任何东西。')
      cleanup()
      process.exit(2)
    }
    throw e
  }
  for (const l of describeBill(bill.required, accept, `POST ${url}`)) line(`  ${l}`)
  line()
  line('  这就是 AI 拿到的账单。')
  line(`  安全闸：本脚本只会给测试网（${MONAD_TESTNET} / eip155:84532）签名，且不超过 1 USDC。`)
  if (!args.mock && accept.network !== MONAD_TESTNET) {
    const bal = await usdcBalance(accept.network, buyer.account.address)
    if (bal < BigInt(accept.amount)) throw new Error(`账单要在 ${networkLabel(accept.network)} 上付款，但这个钱包在那条链上只有 ${formatUsdc(bal)} USDC。`)
  }
  await sleep(300)

  // 3. sign
  step(3, '签 EIP-3009 授权（只签名，不发交易，不花 gas）')
  const { payload, headers } = await signBill(buyer, bill.required, accept)
  line('  我用钱包私钥签了一份“转账授权”（USDC 的 transferWithAuthorization，EIP-3009）。签的内容是：')
  for (const l of describeAuthorization(payload)) line(`    ${l}`)
  line()
  line('  白话：这张授权允许收款地址在 validBefore 之前，从你的钱包里转走正好这么多 USDC，仅此一次。')
  line('  你只是签了名——没有发交易、没有花 gas。但签名本身就等于钱：谁拿到这段签名并提交，就能收款。')
  await sleep(300)

  // 4. pay
  step(4, '带着 PAYMENT-SIGNATURE 重新发同一个请求')
  const sigHeaderName = Object.keys(headers)[0]
  line(`  同一个 URL、同一个 body，多带一个请求头 ${sigHeaderName}（base64，${headers[sigHeaderName].length} 字符，里面就是上面那份授权 + 签名）。`)
  const paid = await payWithSignature(buyer, url, cell, headers)
  line(`  响应：HTTP ${paid.status}`)
  if (paid.status !== 200) {
    line(`  ${JSON.stringify(paid.json)}`)
    throw new Error(`付款没成功（HTTP ${paid.status}）。别急着重试：同一份授权不能用两次，先看上面的错误。`)
  }
  line('  服务器把授权交给 facilitator 验证并结算，成功后返回了格子和 api_key。')
  await sleep(300)

  // 5. settlement
  step(5, '看结算结果：PAYMENT-RESPONSE 里的交易哈希')
  const tx = paid.settle?.transaction || paid.json?.tx_hash || null
  const settledNet = paid.settle?.network || paid.json?.network || accept.network
  line(`  成功：${paid.settle?.success ?? true}    网络：${networkLabel(settledNet)}    付款人：${paid.settle?.payer || buyer.account.address}`)
  line(`  交易哈希：${tx || '(服务器没有返回)'}`)
  if (args.mock) {
    line('  【模拟模式】这个哈希是假 facilitator 编的，不在任何链上，下面这类链接是打不开的：')
    if (tx) line(`    ${NETWORKS[settledNet]?.explorerTx(tx) || '(无)'}`)
  } else if (tx) {
    line(`  浏览器里查：${NETWORKS[settledNet]?.explorerTx(tx) || '(未知网络)'}`)
    line('  （这个浏览器站点有时会先让你过一次 Cloudflare 的人机验证。）')
  }
  const apiKey = paid.json?.api_key
  if (typeof apiKey !== 'string' || !apiKey.startsWith('gk_')) throw new Error('付款成功了，但响应里没有 api_key。')
  saveCellKey(wallet, cell, { key: apiKey, network: settledNet, tx, mock: args.mock, owner: paid.json?.owner || buyer.account.address })
  line(`  服务器还给了这个格子的 api_key：${maskKey(apiKey)}（只显示这一次；已经存进 ${view.file}，这里只打印了打码的样子）。`)
  await sleep(300)

  // 6. decorate
  step(6, '用 gk_ key 装修这个格子')
  const color = `#${[0, 1, 2].map(() => (70 + Math.floor(Math.random() * 170)).toString(16).padStart(2, '0')).join('')}`
  const look = { title: `Taste ${cell.x},${cell.y}`, summary: '用裸私钥 + x402 买下的体验格子', fill_color: color }
  line(`  PUT ${base}/api/cells/update   Authorization: Bearer ${maskKey(apiKey)}`)
  line(`  JSON：${JSON.stringify(look)}`)
  const put = await fetch(`${base}/api/cells/update`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(look) })
  const putJson = await put.json().catch(() => null)
  line(`  响应：HTTP ${put.status} ${putJson?.ok === true ? '（装修成功）' : JSON.stringify(putJson)}`)
  if (put.status !== 200) throw new Error('装修没成功。')
  const back = await fetch(`${base}/api/cells?x=${cell.x}&y=${cell.y}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
  line(`  回读确认：标题 = ${back?.cell?.title ?? '(读不到)'}，颜色 = ${back?.cell?.color ?? back?.cell?.fill_color ?? '(读不到)'}`)

  // 7. link
  step(7, '本地格子链接')
  line(`  ${base}/?x=${cell.x}&y=${cell.y}`)
  line('  用浏览器打开它，就能看到刚买下并装修好的格子。')

  // 8. summary
  step(8, '总结：你刚刚体验的是什么')
  line('  这个买家（也就是 AI）手里握着整把私钥：')
  line('    - 没有额度上限：它想签多少就签多少，钱包里有多少就能花多少；')
  line('    - 没有人工批准：花钱不需要你点头，你只能事后看账；')
  line('    - 没有任何东西可以撤销：签出去的授权、泄露的私钥都收不回，唯一的办法是把钱转走、弃用这个钱包。')
  line('  （这个体验脚本自己加了“只签测试网、不超过 1 USDC”的保险；那是脚本的，裸私钥买家本身并没有。）')
  line('  这就是「把钱包交给 AI」的真实含义。MoneySwitch 的思路相反：AI 只拿到一把有额度的 MoneyKey，')
  line('  大额付款要你批准，私钥始终留在 MoneySwitch 里，不给 AI。')
  if (args.mock) line('  （这次是模拟模式：没有真实转账。去掉 --mock 就是真实的 Monad 测试网。）')

  // shutdown
  line()
  if (args.wait) {
    line(`本地服务器还开着（${base}）。按 Enter 关闭它和（如果是本脚本启动的）数据库……`)
    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin })
      rl.once('line', () => (rl.close(), resolve()))
      rl.once('close', resolve)
    })
  }
}

let code = 0
try {
  await main()
} catch (e) {
  code = 1
  line()
  line(`出错了：${e?.message || e}`)
  if (logFile) line(`（服务器日志：${logFile}）`)
} finally {
  cleanup()
}
process.exit(code)
