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
 *
 * 2026-09-29：本市场是 Monad 优先市场，一个服务可能两条链都能付
 * （probe.networks，见 probe.ts）。证据查询对每个支持的网络分别查（Monad 走
 * 现有 Monad 路径；Base 路径不变，继续标注未实测——见 rpc.ts/hypersync.ts 头
 * 注释），`networks` 按网络分组保留每条链自己的证据；总体 status 取「最好的
 * 那条」——任一网络有 ≥1 笔「付款人 ≠ 收款地址」的付款就是 verified。顶层
 * `evidence` 字段（向后兼容旧的单网络展示）取 payers_7d 最高的那个网络的证据
 * （Monad 优先网络打平时赢），使它和顶层 status 互相印证，不会出现「显示
 * VERIFIED 但 evidence 却是 0 payers」的自相矛盾。
 */
import { probeCellService } from './probe'
import type { ProbeNetworkResult } from './probe'
import { scanPayToEvidence, getLatestBlockNumber, NETWORK_RPC } from './rpc'
import { scanPayToViaHyperSync } from './hypersync'
import { installMarketOutboundProxyIfConfigured } from './net-proxy'
import { buildMarketEvidence, computeStatusByNetwork } from './evidence'
import type { X402Accept } from './x402'
import type { MarketEvidence, MarketNetworkOffer, MarketStatus } from './types'

/** 一个受支持网络的报价 + 该网络自己的链上证据（见文件头注释「evidence 按网络分组」）。 */
export interface NetworkEvidenceResult extends ProbeNetworkResult {
  evidence: MarketEvidence | null
}

export interface ServiceProbeResult {
  status: MarketStatus
  accepts: X402Accept[] | null
  /** 主显示网络（Monad 优先）的字段——向后兼容旧的单网络展示。 */
  network: string | null
  price_usdc: string | null
  pay_to: string | null
  /** 每个受支持网络各自的报价 + 证据；只有 candidate/verified 时非 null。 */
  networks: NetworkEvidenceResult[] | null
  /** "任一网络最好的那条"证据——向后兼容旧的单网络展示（见 evidence_by_network 的诚实按网络拆分）。 */
  evidence: MarketEvidence | null
  /** 每个受支持网络各自的证据，只包含真的查到证据的网络；只有 candidate/verified 时可能非 null。 */
  evidence_by_network: Record<string, MarketEvidence> | null
  /** 每个受支持网络各自的状态（只看该网络自己的证据）；只有 candidate/verified 时可能非 null。 */
  status_by_network: Record<string, MarketStatus> | null
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
        evidence: buildMarketEvidence({
          network,
          payers: hs.evidence.distinctPayers,
          transfers: hs.evidence.transfers,
          lastTx: hs.evidence.lastTx,
          lastAt: hs.evidence.lastAt,
          source: 'hypersync',
          windowBlocks: hs.windowBlocks,
        }),
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
      evidence: buildMarketEvidence({
        network,
        payers: evidence.distinctPayers,
        transfers: evidence.transfers,
        lastTx: evidence.lastTx,
        lastAt: evidence.lastAt,
        source: 'rpc-short-window',
        windowBlocks: evidence.windowBlocks,
      }),
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

  if (probe.status !== 'candidate' || !probe.network || !probe.payTo || !probe.networks || probe.networks.length === 0) {
    return {
      status: probe.status,
      accepts: probe.accepts,
      network: probe.network,
      price_usdc: probe.price_usdc,
      pay_to: probe.payTo,
      networks: null,
      evidence: null,
      evidence_by_network: null,
      status_by_network: null,
      probed_at: probe.probedAt,
      note: probe.note,
    }
  }

  // Query each supported network's own evidence separately (Monad via the
  // existing Monad path, Base via the existing — still-unverified-in-real-
  // traffic — Base path), keyed to that network's own payTo (accepts can, in
  // principle, list a different payTo per network).
  const perNetwork = await Promise.all(
    probe.networks.map(async (net): Promise<{ result: NetworkEvidenceResult; note: string }> => {
      if (!net.payTo) {
        return { result: { ...net, evidence: null }, note: `${net.network}: 无 payTo，跳过证据查询` }
      }
      const { evidence, note } = await gatherEvidence(net.network, net.payTo, opts)
      return { result: { ...net, evidence }, note: note ? `${net.network}: ${note}` : '' }
    })
  )

  const networks = perNetwork.map((n) => n.result)
  // "最好的那条"：任一网络有 >=1 个非自转付款人就整体 verified。这仍然是顶层
  // `status`（向后兼容字段）的定义；每个网络自己算不算 verified 看
  // status_by_network（下面），调用方筛某一条网络时应该用那个，不是这个。
  const status: MarketStatus = networks.some((n) => n.evidence && n.evidence.payers >= 1) ? 'verified' : 'candidate'
  // 顶层 evidence 字段取 payers 最高的网络（Monad 优先网络打平时赢，因为
  // probe.networks 本身已经是 Monad-优先排序，reduce 用 > 而非 >= 保留先出现
  // 的那个），让它和上面算出的 status 互相印证。
  const bestNetwork = networks.reduce<NetworkEvidenceResult | null>((best, cur) => {
    const curPayers = cur.evidence?.payers ?? -1
    const bestPayers = best?.evidence?.payers ?? -1
    return curPayers > bestPayers ? cur : best
  }, null)

  const evidence_by_network: Record<string, MarketEvidence> = {}
  for (const n of networks) {
    if (n.evidence) evidence_by_network[n.network] = n.evidence
  }
  const networkOffers: MarketNetworkOffer[] = networks.map((n) => ({
    network: n.network,
    price_usdc: n.price_usdc,
    payTo: n.payTo,
    asset: n.asset,
  }))
  const status_by_network = computeStatusByNetwork(networkOffers, evidence_by_network)

  return {
    status,
    accepts: probe.accepts,
    network: probe.network,
    price_usdc: probe.price_usdc,
    pay_to: probe.payTo,
    networks,
    evidence: bestNetwork?.evidence ?? null,
    evidence_by_network: Object.keys(evidence_by_network).length > 0 ? evidence_by_network : null,
    status_by_network,
    probed_at: probe.probedAt,
    note: [probe.note, ...perNetwork.map((n) => n.note)].filter(Boolean).join(' '),
  }
}
