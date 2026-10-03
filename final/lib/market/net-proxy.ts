/**
 * 出站代理（本地开发用）：本机常见的 Clash/v2rayN 之类客户端只设置
 * HTTPS_PROXY/HTTP_PROXY 环境变量，Node 原生 fetch 默认不认它。服务探测
 * （probe.ts，经 service.ts 调用）会请求境外地址，本地开发没有代理常常连不上。
 *
 * 只在检测到 HTTPS_PROXY / HTTP_PROXY 环境变量时才安装（Vercel 生产环境不设
 * 这两个变量，天然是 no-op，不影响 DB 连接——pg 走 TCP 不走这个 fetch
 * dispatcher）。
 *
 * 2026-09-29 根因排查记录：原实现是 `setGlobalDispatcher(new ProxyAgent(url))`
 * ——把 ProxyAgent 当唯一全局 dispatcher，所有请求（包括本地/私网地址）都会
 * 经代理转发。本次收到的报告称这样会让同进程里的普通 fetch 对
 * https://monad-lingqian.vercel.app/health 报 UND_ERR_CONNECT_TIMEOUT。用
 * HTTPS_PROXY=http://127.0.0.1:7897 分别在（1）纯 node -e 脚本、（2）tsx 跑
 * 这个模块本身、（3）Node 24 原生 TS type-stripping 直接跑 .ts、（4）真实起
 * `next dev` 打一个调试路由这四种方式，用同样的旧代码（bare ProxyAgent +
 * setGlobalDispatcher）反复复现，均未能复现超时——四次都在 1.3s~5.1s 内拿到
 * 200。也就是说，本机此时此刻用旧实现直接跑 probeGetTarget() 已经能拿到期望
 * 的 candidate/eip155:143/0.01/0x4eCf9... 结果（证据见本次改动附带的验证输出）。
 * 没能力坐实"旧实现在 Node 24.19 + undici 7.30.0 下必然不生效"这个根因，只能
 * 存疑（不排除是被报告时代理客户端一次性握手抖动、或该外部服务当时的瞬时状
 * 况）。
 *
 * 但按要求仍照抄改写 C:\1mineyswitch\packages\net\src 的 RoutingDispatcher 方
 * 案（direct Agent 处理本地/私网地址，ProxyAgent 处理其余地址，不用单一
 * dispatcher 什么都塞给代理）——不跨仓库 import，这里是本地重写；同时它修复了
 * 旧实现完全没有的一个真实缺陷：旧代码把 127.0.0.1/私网地址也无差别塞给代理，
 * 如果本地代理客户端没打开或者不认本地地址，反而会把原本能直连的本地请求搞
 * 挂。bypass 判定逻辑（isAlwaysDirectHost）照抄
 * C:\1mineyswitch\packages\net\src\bypass.ts 的 loopback + RFC1918 + CGNAT
 * 判断；没有搬 NO_PROXY/ProxyOverride 支持——原版那部分是更完整的
 * resolveOutboundProxy 管线的一部分，这里仍然只是「HTTPS_PROXY/HTTP_PROXY 单
 * 环境变量最小安装器」，不在这次范围内。也没有搬原版 install.ts 里的
 * beforeExit 优雅关闭（那是修一个单独的 Windows 进程退出时的 uv_loop 崩溃，
 * 与这次的代理路由问题无关，发现了但没有顺手改——见任务报告）。
 */
import { isIP } from 'node:net'
import { Agent, Dispatcher, ProxyAgent, setGlobalDispatcher } from 'undici'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

/** 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10 (CGNAT). */
function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

/** ::1 only (与 lantern-city/moneyswitch 原版一致，「总是直连」名单里没有别的 IPv6 段)。 */
function isLoopbackIPv6(ip: string): boolean {
  return ip.toLowerCase().replace(/^\[|\]$/g, '') === '::1'
}

/**
 * 必须总是直连、不受任何代理配置影响的地址：localhost、loopback、RFC1918/CGNAT
 * 私网段。照抄 C:\1mineyswitch\packages\net\src\bypass.ts 的 isAlwaysDirectHost。
 */
export function isAlwaysDirectHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (LOOPBACK_HOSTNAMES.has(h)) return true
  const bare = h.replace(/^\[|\]$/g, '')
  const kind = isIP(bare)
  if (kind === 4) return isPrivateOrLoopbackIPv4(bare)
  if (kind === 6) return isLoopbackIPv6(bare)
  return false
}

/**
 * 按目标 host 把每个请求分流到直连 Agent 或 ProxyAgent，这样一次
 * setGlobalDispatcher 就能覆盖进程里所有出站 fetch，同时本地/私网地址仍然直
 * 连。照抄改写 C:\1mineyswitch\packages\net\src\install.ts 的 RoutingDispatcher
 * （不跨仓库 import；原版还支持 NO_PROXY/ProxyOverride 和 beforeExit 优雅关
 * 闭，这里按本模块「单环境变量最小安装器」的范围只搬了本地/私网直连这部分）。
 */
class RoutingDispatcher extends Dispatcher {
  private readonly direct = new Agent()
  private readonly proxied: ProxyAgent

  constructor(proxyUrl: string) {
    super()
    this.proxied = new ProxyAgent(proxyUrl)
  }

  private pick(opts: Dispatcher.DispatchOptions): Dispatcher {
    const originValue = opts.origin as unknown
    const originStr =
      typeof originValue === 'string' ? originValue : (originValue as { toString(): string } | undefined)?.toString() ?? ''
    let hostname = ''
    try {
      hostname = new URL(originStr).hostname
    } catch {
      hostname = ''
    }
    return isAlwaysDirectHost(hostname) ? this.direct : this.proxied
  }

  override dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    return this.pick(opts).dispatch(opts, handler)
  }

  override close(): Promise<void>
  override close(callback: () => void): void
  override close(callback?: () => void): Promise<void> | void {
    const p = Promise.all([this.direct.close(), this.proxied.close()]).then(() => undefined)
    if (callback) {
      p.then(() => callback())
      return
    }
    return p
  }

  override destroy(): Promise<void>
  override destroy(err: Error | null): Promise<void>
  override destroy(callback: () => void): void
  override destroy(err: Error | null, callback: () => void): void
  override destroy(errOrCallback?: Error | null | (() => void), callback?: () => void): Promise<void> | void {
    const err = typeof errOrCallback === 'function' ? null : errOrCallback ?? null
    const cb = typeof errOrCallback === 'function' ? errOrCallback : callback
    const p = Promise.all([this.direct.destroy(err), this.proxied.destroy(err)]).then(() => undefined)
    if (cb) {
      p.then(() => cb())
      return
    }
    return p
  }
}

let installed = false
let installedUrl: string | null = null
let installedDispatcher: RoutingDispatcher | null = null

function resolveProxyUrl(): string | null {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  )
}

/** Idempotent: safe to call from every market-fetching module's top level. No-op when no proxy env var is set. */
export function installMarketOutboundProxyIfConfigured(): { installed: boolean; url: string | null } {
  if (installed) return { installed: installedUrl !== null, url: installedUrl }
  installed = true
  const url = resolveProxyUrl()
  if (!url) return { installed: false, url: null }
  try {
    const dispatcher = new RoutingDispatcher(url)
    installedDispatcher = dispatcher
    setGlobalDispatcher(dispatcher)
    installedUrl = url
  } catch (err) {
    console.error('[lib/market/net-proxy] failed to install outbound proxy dispatcher:', (err as Error)?.message)
    installedDispatcher = null
    installedUrl = null
  }
  return { installed: installedUrl !== null, url: installedUrl }
}

/** Test-only: resets the installed flag so a test can re-trigger installation under different env vars. */
export function resetMarketOutboundProxyForTests(): void {
  installed = false
  installedUrl = null
  installedDispatcher = null
}

/** Test-only: closes the currently-installed RoutingDispatcher's sockets so a test process can exit cleanly. */
export async function closeMarketOutboundProxyForTests(): Promise<void> {
  if (installedDispatcher) {
    await installedDispatcher.close()
  }
}
