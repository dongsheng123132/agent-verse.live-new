/**
 * 单个服务（一个格子挂的服务，或市场里的一条官方收录）的「探测 + 链上证据」
 * 编排：先只读 402 探测（probe.ts，内含 SSRF 检查），命中 candidate 后再查链
 * 上证据（有 ENVIO_API_TOKEN 用 hypersync.ts 查 7 天，没有/失败就回退 rpc.ts
 * 短窗口）。至少 1 笔「付款人 ≠ 收款地址」的付款 -> verified（点亮）。
 *
 * 这是本仓库新写的编排层（lantern-city 的 market.ts 是批量聚合 + 10 分钟内存
 * 缓存，形状对不上这里「单个格子保存后立即探测一次」的需求，所以没有照抄
 * market.ts 本身，只复用了它拆出来的 probe/rpc/hypersync/bazaar/x402/
 * concurrency 几个模块）。
 */
import { probeCellService } from './probe'
import { scanPayToEvidence, getLatestBlockNumber, NETWORK_RPC } from './rpc'
import { scanPayToViaHyperSync } from './hypersync'
import { installMarketOutboundProxyIfConfigured } from './net-proxy'
import type { X402Accept } from './x402'
import type { MarketEvidence, MarketStatus } from './types'

export interface ServiceProbeResult {
  status: MarketStatus
  accepts: X402Accept[] | null
  network: string | null
  price_usdc: string | null
  pay_to: string | null
  evidence: MarketEvidence | null
  probed_at: string | null
  note: string
}

export interface ProbeServiceOptions {
  fetchImpl?: typeof fetch
  /** Test hook: replace the chain-evidence step with a canned result instead of hitting rpc.ts/hypersync.ts. */
  evidenceFetchImpl?: typeof fetch
}

async function gatherEvidence(
  network: string,
  payTo: string,
  opts: ProbeServiceOptions
): Promise<{ evidence: MarketEvidence | null; note: string }> {
  const apiToken = process.env.ENVIO_API_TOKEN
  const evFetch = opts.evidenceFetchImpl ?? opts.fetchImpl
  if (apiToken) {
    try {
      const hs = await scanPayToViaHyperSync(payTo, { network, apiToken, fetchImpl: evFetch })
      return {
        evidence: {
          payers_7d: hs.evidence.distinctPayers,
          transfers_7d: hs.evidence.transfers,
          last_tx: hs.evidence.lastTx,
          last_at: hs.evidence.lastAt,
          source: 'hypersync',
          window_blocks: hs.windowBlocks,
        },
        note: hs.warnings.length ? `HyperSync 警告：${hs.warnings.join('; ')}` : '',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Fall through to RPC short window — see hypersync.ts's own comment on why
      // this is not retried here.
      const fallback = await gatherEvidenceViaRpc(network, payTo, opts)
      return { evidence: fallback.evidence, note: `HyperSync 失败（${msg}），回退 RPC 短窗口。${fallback.note}` }
    }
  }
  return gatherEvidenceViaRpc(network, payTo, opts)
}

async function gatherEvidenceViaRpc(
  network: string,
  payTo: string,
  opts: ProbeServiceOptions
): Promise<{ evidence: MarketEvidence | null; note: string }> {
  const cfg = NETWORK_RPC[network]
  if (!cfg) return { evidence: null, note: `不支持的网络：${network}` }
  const evFetch = opts.evidenceFetchImpl ?? opts.fetchImpl
  try {
    const latestBlock = await getLatestBlockNumber({ rpcUrl: cfg.rpcUrl, fetchImpl: evFetch })
    const { evidence, warnings } = await scanPayToEvidence(payTo, { network, latestBlock, fetchImpl: evFetch })
    return {
      evidence: {
        payers_7d: evidence.distinctPayers,
        transfers_7d: evidence.transfers,
        last_tx: evidence.lastTx,
        last_at: evidence.lastAt,
        source: 'rpc-short-window',
        window_blocks: evidence.windowBlocks,
      },
      note: warnings.length ? `RPC 警告：${warnings.join('; ')}` : '',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { evidence: null, note: `RPC 短窗口查询失败：${msg}` }
  }
}

/**
 * 探测一个服务 URL 并（如果探测出 candidate）尝试拿链上证据。method !== 'GET'
 * 一律 unprobed，绝不发起 POST 或付款。
 */
export async function probeServiceAndEvidence(
  url: string,
  method: string,
  opts: ProbeServiceOptions = {}
): Promise<ServiceProbeResult> {
  installMarketOutboundProxyIfConfigured()
  const probe = await probeCellService({ url, method }, { fetchImpl: opts.fetchImpl })

  if (probe.status !== 'candidate' || !probe.network || !probe.payTo) {
    return {
      status: probe.status,
      accepts: probe.accepts,
      network: probe.network,
      price_usdc: probe.price_usdc,
      pay_to: probe.payTo,
      evidence: null,
      probed_at: probe.probedAt,
      note: probe.note,
    }
  }

  const { evidence, note: evNote } = await gatherEvidence(probe.network, probe.payTo, opts)
  const status: MarketStatus = evidence && evidence.payers_7d >= 1 ? 'verified' : 'candidate'

  return {
    status,
    accepts: probe.accepts,
    network: probe.network,
    price_usdc: probe.price_usdc,
    pay_to: probe.payTo,
    evidence,
    probed_at: probe.probedAt,
    note: [probe.note, evNote].filter(Boolean).join(' '),
  }
}
