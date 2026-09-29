/**
 * 出站代理（本地开发用）：本机常见的 Clash/v2rayN 之类客户端只设置
 * HTTPS_PROXY/HTTP_PROXY 环境变量，Node 原生 fetch 默认不认它。市场探测/证据
 * 抓取（probe.ts / rpc.ts / hypersync.ts / bazaar.ts）都请求境外地址，本地开
 * 发没有代理常常连不上。
 *
 * 只在检测到 HTTPS_PROXY / HTTP_PROXY 环境变量时才安装（Vercel 生产环境不设
 * 这两个变量，天然是 no-op，不影响 DB 连接——pg 走 TCP 不走这个 fetch
 * dispatcher）。改写自 C:\1mineyswitch\repos\lantern-city\service\src\net\install.ts
 * 的核心思路（用 undici 的 ProxyAgent + setGlobalDispatcher），但简化成单一
 * 全局 dispatcher（不跨仓库 import；原版的按 host 分流 direct/proxied、Windows
 * 注册表读取等更完整的实现留在 lantern-city，这里按 spec「只在本地开发需要」
 * 的要求做最小实现）。
 */
import { ProxyAgent, setGlobalDispatcher } from 'undici'

let installed = false
let installedUrl: string | null = null

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
    setGlobalDispatcher(new ProxyAgent(url))
    installedUrl = url
  } catch (err) {
    console.error('[lib/market/net-proxy] failed to install outbound proxy dispatcher:', (err as Error)?.message)
    installedUrl = null
  }
  return { installed: installedUrl !== null, url: installedUrl }
}

/** Test-only: resets the installed flag so a test can re-trigger installation under different env vars. */
export function resetMarketOutboundProxyForTests(): void {
  installed = false
  installedUrl = null
}
