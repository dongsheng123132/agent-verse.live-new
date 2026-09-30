/**
 * Monad Metropolis showcase — static display config (pure data + types).
 *
 * A "showcase" is a set of VIRTUAL blocks painted on top of the 100×100 map: the
 * arena ("比武台"), a row of sponsor booths under it and a Monad x402 service
 * street beside it. Nothing here is written to the database. The server merges
 * these blocks into /api/grid and /api/cells (lib/showcase/index.ts), and the
 * purchase routes refuse every coordinate they cover (403 reserved_showcase).
 *
 * Footprint: 24 wide × 17 tall, fully tiled (no gaps), origin (58, 40):
 *
 *   x: 58..73 (16)                    74..81 (8)
 *   y=40..47  ARENA 16×8              STREET banner 8×2 (y=40..41)
 *                                     12 service slots 2×2 (y=42..47)
 *   y=48..50  6 sponsor booths 4×3 (x=58,62,66,70,74,78)
 *   y=51..53  6 sponsor booths 4×3
 *   y=54..56  4 sponsor booths 4×3 (x=58..73) + CTA 8×3 (x=74..81)
 *
 * Why here: chosen against the local mirror of the live map (1061 owned cells,
 * `npm run db:local`, GET /api/grid). All 408 covered cells were unowned — none
 * belong to a real user and none are 0xRESERVED / 0xAgentVerseOfficial either —
 * and the centre of the footprint is 20 cells from the map centre (50, 50), on
 * the open side of the official demo cluster at x 42..57. The server re-checks
 * this at request time (lib/showcase/index.ts resolveShowcase): a block that
 * overlaps a real user's cell is skipped and logged, real users always win.
 *
 * Text + brand colours only — no logo images anywhere.
 *
 * Sources: sponsor data from docs/monad-metropolis-guide.md (compiled from the
 * hackathon's public pages); every link below was fetched with GET on
 * 2026-09-30 and answered 200 (sponsor sites are the ones the official
 * hackathon page https://monad.xyz/developers/hackathons/metropolis links to).
 * PingBusiness has no link: its guessed domain is a parked redirect and the
 * official page cites none, so it could not be verified.
 */

export type ShowcaseKind = 'arena' | 'street' | 'service' | 'sponsor' | 'cta'

export interface ShowcaseLink {
  label: string
  url: string
}

/** What a service-street slot says about price / network, and how much to trust it. */
export interface ShowcaseListing {
  /** USDC per call as a decimal string, or null when unknown. */
  price_usdc: string | null
  /** CAIP-2 networks the listing is said to accept USDC on. */
  networks: string[]
  /** 'live-402' = read from the service's own 402 response; 'seed-claim' = as recorded in lib/market/seed.json, not verified by this site. */
  basis: 'live-402' | 'seed-claim'
  /** ISO date of the live check, when basis is 'live-402'. */
  checked_at?: string
}

export interface ShowcaseServiceSpec {
  url: string
  method: 'GET' | 'POST'
  desc: string
  category: string
  listing: ShowcaseListing
}

export interface ShowcaseBlockSpec {
  id: string
  kind: ShowcaseKind
  /** Position relative to SHOWCASE_ORIGIN. */
  rx: number
  ry: number
  w: number
  h: number
  title: string
  summary: string
  /** Border / brand colour on the map. */
  color: string
  /** Second colour (arena: gold title + outline). */
  accent?: string
  /** Short text drawn on the map when zoomed in (sponsor amount, service price). */
  tag?: string
  markdown?: string
  content_url?: string
  iframe_url?: string
  links?: ShowcaseLink[]
  /** Small print at the bottom of the detail view. */
  footnote?: string
  service?: ShowcaseServiceSpec
}

/** Absolute map coordinate of the footprint's top-left cell. */
export const SHOWCASE_ORIGIN = { x: 58, y: 40 } as const

/** Virtual owner on showcase cells (truthy, so the map treats them as taken; never a real address). */
export const SHOWCASE_OWNER = '0xShowcase'

export const MONAD_PURPLE = '#6E54FF'
export const GOLD = '#F5C542'

export const SHOWCASE_DISCLAIMER = '信息整理自黑客松公开资料，非官方合作/背书'

const MONAD = 'eip155:143'
const HACKATHON_PAGE = 'https://monad.xyz/developers/hackathons/metropolis'
const HACKATHON_PLATFORM = 'https://hackathon.monad.xyz'
const MONAD_SITE = 'https://monad.xyz'

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

const ARENA: ShowcaseBlockSpec = {
  id: 'metropolis-arena',
  kind: 'arena',
  rx: 0, ry: 0, w: 16, h: 8,
  title: 'Monad Metropolis 比武台',
  summary: 'Monad 黑客松 · 2026-09-01 → 10-14 · 总奖金 $250K+ · 4 大赛道',
  color: MONAD_PURPLE,
  accent: GOLD,
  tag: '$250K+ · 4 大赛道',
  content_url: HACKATHON_PAGE,
  links: [
    { label: '黑客松官方页面', url: HACKATHON_PAGE },
    { label: '报名 / 提交平台', url: HACKATHON_PLATFORM },
    { label: 'Monad 官网', url: MONAD_SITE },
    { label: '活动日历（Luma）', url: 'https://luma.com/monad-metropolis' },
  ],
  markdown: `## Monad Metropolis 黑客松

线上全球黑客松 · 主办方 Monad Foundation
2026-09-01 → 10-14 · 总奖金 $250,000+ USD

### 四大赛道（每个赛道 $30,000，3 个获奖团队）
1. Onchain Finance & Trading — 新资产原语、市场结构与交易体验
2. Consumer Products & Payments — 面向不自称加密用户的链上消费金融产品
3. Social, Attention & Culture — 开放社交图谱、信息流算法、社区治理
4. Trust, Identity & AI Infrastructure — 信任、溯源、用户自有数据的协议层原语

另有总冠军 $25,000；各赞助商赏金可叠加（见下方赞助商格子）。

### 时间线
- 2026-09-01  开赛
- 2026-10-14 11:59 (GMT+8)  提交截止
- 2026-10-14 ~ 10-27  评审
- 2026-11-03  公布结果

### 链接
- 黑客松官方页面: ${HACKATHON_PAGE}
- 报名 / 提交平台: ${HACKATHON_PLATFORM}
- Monad 官网: ${MONAD_SITE}
- 活动日历: https://luma.com/monad-metropolis`,
  footnote: SHOWCASE_DISCLAIMER,
}

// ---------------------------------------------------------------------------
// Monad x402 service street (banner + 12 slots of 2×2, right of the arena)
// ---------------------------------------------------------------------------

const STREET: ShowcaseBlockSpec = {
  id: 'x402-street',
  kind: 'street',
  rx: 16, ry: 0, w: 8, h: 2,
  title: 'Monad x402 服务街',
  summary: '官方收录的 Monad x402 服务 · 点格子看价格 · 一键复制给 AI',
  color: MONAD_PURPLE,
  accent: GOLD,
  tag: 'x402 · Monad',
  markdown: `## Monad x402 服务街

这一排小格是 AgentVerse 官方收录的、声称支持 Monad 主网（eip155:143）的 x402 服务。
点开任意一格：看价格 / 网络、复制「给 AI」的调用命令。
完整列表、搜索与筛选：/market （AI 可读文字版：/llms-services.txt）

状态一栏为 UNPROBED 表示本站尚未对它实测；价格若标注为「收录标注」，以服务自己的 402 响应为准。`,
  links: [
    { label: '在 /market 查看全部服务', url: '/market' },
    { label: 'AI 可读服务索引', url: '/llms-services.txt' },
  ],
}

function service(
  id: string,
  slot: number,
  title: string,
  s: ShowcaseServiceSpec,
  tag: string | undefined = s.listing.price_usdc ? `$${s.listing.price_usdc}` : undefined,
): ShowcaseBlockSpec {
  const col = slot % 4
  const row = Math.floor(slot / 4)
  return {
    id,
    kind: 'service',
    rx: 16 + col * 2, ry: 2 + row * 2, w: 2, h: 2,
    title,
    summary: s.desc,
    color: MONAD_PURPLE,
    accent: '#FBBF24',
    tag,
    service: s,
    markdown: `## ${title}

${s.desc}

- 接口: ${s.method} ${s.url}
- 价格: ${s.listing.price_usdc ? `$${s.listing.price_usdc} USDC / 次` : '未知'}（${
      s.listing.basis === 'live-402' ? `${s.listing.checked_at} 对该接口 GET 实测 402` : '收录标注，本站未实测'
    }）
- 网络: ${s.listing.networks.map((n) => (n === MONAD ? 'Monad (eip155:143)' : n)).join(' / ')}

让 AI 付款调用：
  npx moneyswitch paid_fetch ${s.url} --max-price ${s.listing.price_usdc ? `$${s.listing.price_usdc}` : '$0.10'}`,
  }
}

const SERVICES: ShowcaseBlockSpec[] = [
  {
    ...service('svc-lingqian', 0, 'Monad 灵签', {
      url: 'https://monad-lingqian.vercel.app/qian',
      method: 'GET',
      desc: '付 0.01 USDC 抽一支灵签；签号由付款交易哈希决定，任何人可用 /verify 复算。',
      category: '文化 / 娱乐',
      listing: { price_usdc: '0.01', networks: [MONAD], basis: 'live-402', checked_at: '2026-09-30' },
    }),
    iframe_url: 'https://monad-lingqian.vercel.app',
    content_url: 'https://monad-lingqian.vercel.app',
  },
  service('svc-nansen', 1, 'Nansen · Address Current Balance', {
    url: 'https://api.nansen.ai/api/v1/profiler/address/current-balance',
    method: 'GET',
    desc: 'Nansen Profiler：查询某钱包地址当前持仓余额。',
    category: '链上数据',
    listing: { price_usdc: '0.01', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-agent402-demand-radar', 2, 'agent402 · Demand Radar', {
    url: 'https://agent402.tools/api/demand-radar',
    method: 'GET',
    desc: 'agent402（x402 按次付费工具目录）收录的接口：Demand Radar。',
    category: '数据 / 工具',
    listing: { price_usdc: '0.005', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-agent402-usdc-balance', 3, 'agent402 · USDC Balance', {
    url: 'https://agent402.tools/api/usdc-balance',
    method: 'GET',
    desc: 'agent402 收录的接口：USDC Balance（查询 USDC 余额）。',
    category: '数据 / 工具',
    listing: { price_usdc: '0.003', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-orthogonal-tomba', 4, 'Orthogonal · Tomba LinkedIn', {
    url: 'https://x402.orthogonal.com/tomba/v1/linkedin',
    method: 'GET',
    desc: 'Orthogonal 网关转发的 Tomba LinkedIn 查询接口。',
    category: '数据 / 工具',
    listing: { price_usdc: '0.01', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-macropulse', 5, 'MacroPulse · Session Brief', {
    url: 'https://macropulse-alpha.vercel.app/api/session-brief',
    method: 'GET',
    desc: 'MacroPulse：交易时段宏观简报接口。',
    category: '金融数据',
    listing: { price_usdc: '0.10', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-onchainpulse', 6, 'OnchainPulse · EVM Token Scanner', {
    url: 'https://onchainpulse.theaslangroupllc.com/api/evmtoken',
    method: 'GET',
    desc: 'OnchainPulse：EVM 代币扫描接口。',
    category: '链上数据',
    listing: { price_usdc: '0.015', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-gridpulse', 7, 'GridPulse · Carbon Intensity', {
    url: 'https://gridpulse.theaslangroupllc.com/api/energy/carbon-intensity',
    method: 'GET',
    desc: 'GridPulse：电网碳强度接口。',
    category: '能源数据',
    listing: { price_usdc: '0.01', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-fetcher-twitter', 8, 'fetcher.sh · Twitter Handle', {
    url: 'https://fetcher.sh/api/twitter/handle/elonmusk',
    method: 'GET',
    desc: 'fetcher.sh：推特账号查询接口（示例路径用占位 handle）。',
    category: '社交数据',
    listing: { price_usdc: '0.005', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-glim-twitter-search', 9, 'glim.sh · Twitter Search', {
    url: 'https://glim.sh/api/v1/twitter/search',
    method: 'POST',
    desc: 'glim.sh：推特搜索接口（POST，本站不探测）。',
    category: '社交数据',
    listing: { price_usdc: '0.005', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-miroshark', 10, 'MiroShark', {
    url: 'https://x402.miroshark.xyz/run',
    method: 'POST',
    desc: 'MiroShark：x402 运行接口（POST，本站不探测）。',
    category: '工具',
    listing: { price_usdc: '1.00', networks: [MONAD], basis: 'seed-claim' },
  }),
  service('svc-hosaka-agents', 11, 'hosaka-agents', {
    url: 'https://hosaka-agents.vercel.app/contacts',
    method: 'POST',
    desc: 'hosaka-agents：contacts 接口（POST，本站不探测）。',
    category: '工具',
    listing: { price_usdc: '0.02', networks: [MONAD], basis: 'seed-claim' },
  }),
]

// ---------------------------------------------------------------------------
// Sponsor booths (4×3 each, 16 of them under the arena)
// ---------------------------------------------------------------------------

interface SponsorInput {
  id: string
  name: string
  color: string
  /** Map tag: the amount. */
  tag: string
  /** One-line pitch shown as the cell summary. */
  summary: string
  /** Category line at the top of the detail. */
  group: string
  /** Prize / perk lines (markdown list items, without the leading "- "). */
  lines: string[]
  /** Verified official site, if any. */
  url?: string
}

function sponsor(i: number, s: SponsorInput): ShowcaseBlockSpec {
  const col = i % 6
  const row = Math.floor(i / 6)
  return {
    id: `sponsor-${s.id}`,
    kind: 'sponsor',
    rx: col * 4, ry: 8 + row * 3, w: 4, h: 3,
    title: s.name,
    summary: s.summary,
    color: s.color,
    tag: s.tag,
    content_url: s.url,
    links: s.url ? [{ label: `${s.name} 官网`, url: s.url }] : undefined,
    markdown: `## ${s.name}

类别: ${s.group}

${s.lines.map((l) => `- ${l}`).join('\n')}${s.url ? `\n\n官网: ${s.url}` : ''}`,
    footnote: SHOWCASE_DISCLAIMER,
  }
}

const BOUNTY = '赏金方（现金 / 额度赏金）'
const SERVICE_REWARD = '服务奖励方（给获奖团队）'
const PERK = '技术福利'

// Laid out 6 / 6 / 4 per row (i % 6, floor(i / 6)); the CTA fills the rest of row 3.
const SPONSORS: ShowcaseBlockSpec[] = [
  sponsor(0, {
    id: 'monad-foundation', name: 'Monad Foundation', color: '#836EF9', tag: '$10K',
    group: BOUNTY, url: MONAD_SITE,
    summary: '主办方赏金：社区最佳项目 $5k + 两项 Mera 赏金各 $2.5k',
    lines: [
      'Best Community Team Project — $5,000（全赛道）：社区推荐团队的最佳项目',
      'Best Mera-Powered UX — $2,500（全赛道）：整个账户层用 Mera：无助记词、无扩展、无托管',
      'Mera: One Passkey, Many Keys — $2,500（全赛道）：最有创意的 Mera PRF 密钥非钱包用例',
    ],
  }),
  sponsor(1, {
    id: 'agora', name: 'Agora', color: '#F59E0B', tag: '$20K',
    group: BOUNTY, url: 'https://www.agora.finance/',
    summary: '跨境支付 $10k + 移动交易 $10k（均基于 Mera passkey）',
    lines: [
      'Best Cross-Border Payments App — $10,000（Consumer 赛道）：用 Mera passkey 做跨境 AUSD 支付 App',
      'Best Mobile Trading App — $10,000（Finance 赛道）：用 Mera 登录 + AUSD 余额 + Perpl 交易',
    ],
  }),
  sponsor(2, {
    id: 'nansen', name: 'Nansen', color: '#00C2A8', tag: '$5K',
    group: BOUNTY, url: 'https://nansen.ai/',
    summary: 'Best use of Nansen $5k：用 Nansen 数据 / API / MCP 做超越原始数据的产品体验',
    lines: ['Best use of Nansen — $5,000（全赛道）：用 Nansen 数据 / API / MCP，做超越原始数据展示的产品体验'],
  }),
  sponsor(3, {
    id: 'alibaba-qwen', name: '阿里云 Qwen', color: '#615CED', tag: '$5K 额度',
    group: BOUNTY, url: 'https://www.alibabacloud.com/',
    summary: 'Best Builds with Qwen 3.8 Max：$5k 额度，用通义千问做 agentic 应用',
    lines: ['Best Builds with Qwen 3.8 Max — $5,000 额度（Trust / AI 赛道）：用通义千问做 agentic 应用'],
  }),
  sponsor(4, {
    id: 'kimi', name: 'KIMI', color: '#3B82F6', tag: '$3K 额度',
    group: BOUNTY, url: 'https://www.kimi.com/',
    summary: 'Best Builds Powered by KIMI：$3k 额度，无范围限制',
    lines: ['Best Builds Powered by KIMI — $3,000 额度（全赛道）：用 KIMI 做项目，无范围限制'],
  }),
  sponsor(5, {
    id: 'aurora-intents', name: 'Aurora Intents', color: '#70D44B', tag: '$5K',
    group: BOUNTY, url: 'https://intents.aurora.dev/',
    summary: 'Bring Any-Chain Liquidity to Monad $5k：集成跨链存入 / 交换',
    lines: ['Bring Any-Chain Liquidity to Monad — $5,000（全赛道）：集成 Aurora Intents 做跨链存入 / 交换'],
  }),
  sponsor(6, {
    id: 'envio', name: 'Envio', color: '#FF7A45', tag: '$1K + 托管',
    group: `${BOUNTY} + 服务奖励`, url: 'https://envio.dev',
    summary: 'Best Use of Envio $1k，获奖团队另得云托管',
    lines: [
      'Best Use of Envio — $1,000（全赛道）：用 Envio HyperIndex / HyperSync 做核心功能',
      '服务奖励（给获奖团队）：2 个月云托管 + 第三个月 5 折，最高 $5,000',
    ],
  }),
  sponsor(7, {
    id: 'metamask', name: 'MetaMask', color: '#F6851B', tag: '$2.5K',
    group: BOUNTY, url: 'https://metamask.io/',
    summary: 'Best Agent Wallet Plugin $2.5k：给 MetaMask Agent Wallet 做插件',
    lines: ['Best Agent Wallet Plugin — $2,500（Finance 赛道）：给 MetaMask Agent Wallet 做插件'],
  }),
  sponsor(8, {
    id: 'tencent-hunyuan', name: '腾讯混元', color: '#2563EB', tag: '$2K 云券',
    group: BOUNTY, url: 'https://hunyuan.tencent.com/',
    summary: 'Build with Hunyuan：$2k 云券，用混元做多模态 / 交互体验',
    lines: ['Build with Hunyuan — $2,000 云券（Social 赛道）：用腾讯混元模型做多模态 / 交互体验'],
  }),
  sponsor(9, {
    id: 'ack3', name: 'ack3', color: '#EF4444', tag: '≤ $15K',
    group: SERVICE_REWARD, url: 'https://ack3.ai/',
    summary: '获奖团队可得安全扫描服务，最高 $15k',
    lines: ['安全扫描 — 最高 $15,000（给获奖团队）'],
  }),
  sponsor(10, {
    id: 'chainstack', name: 'Chainstack', color: '#3B82F6', tag: '≤ $10K',
    group: SERVICE_REWARD, url: 'https://chainstack.com/',
    summary: '获奖团队可得年度 Pro 计划，最高 $10k',
    lines: ['年度 Pro 计划 — 最高 $10,000（给获奖团队）'],
  }),
  sponsor(11, {
    id: 'crouton-digital', name: 'Crouton Digital', color: '#D97706', tag: '≤ $10K',
    group: SERVICE_REWARD, url: 'https://crouton.digital/',
    summary: '获奖团队可得 3 个月无限 RPC，最高 $10k',
    lines: ['3 个月无限 RPC — 最高 $10,000（给获奖团队）'],
  }),
  sponsor(12, {
    id: 'zerion', name: 'Zerion', color: '#2962EF', tag: '≤ $6K',
    group: `${SERVICE_REWARD} + ${PERK}`, url: 'https://zerion.io/',
    summary: '获奖团队 3 个月 API Builder（最高 $6k），所有团队 1 个月免费',
    lines: [
      '3 个月 Zerion API Builder — 最高 $6,000（给获奖团队）',
      '1 个月 Zerion API Builder 免费 — 约 $149（所有团队）',
    ],
  }),
  sponsor(13, {
    id: 'pingbusiness', name: 'PingBusiness', color: '#A855F7', tag: '≤ $20K',
    group: SERVICE_REWARD,
    summary: '获奖团队可得商户返现，最高 $20k',
    lines: ['商户返现 — 最高 $20,000（给获奖团队）'],
  }),
  sponsor(14, {
    id: 'quicknode', name: 'Quicknode', color: '#1FB6FF', tag: '~$147',
    group: PERK, url: 'https://www.quicknode.com/',
    summary: '所有团队 3 个月免费 Build Plan（约 $147）',
    lines: ['Quicknode Build Plan — 3 个月免费，约 $147（所有团队）'],
  }),
  sponsor(15, {
    id: 'tenderly', name: 'Tenderly', color: '#7B61FF', tag: '~$7.2K',
    group: PERK, url: 'https://tenderly.co/',
    summary: '所有团队可领 Tenderly Pro 许可证（约 $7,200）',
    lines: ['Tenderly Pro 许可证 — 约 $7,200（所有团队）'],
  }),
]

// ---------------------------------------------------------------------------
// CTA (right of the last sponsor row)
// ---------------------------------------------------------------------------

const CTA: ShowcaseBlockSpec = {
  id: 'street-cta',
  kind: 'cta',
  rx: 16, ry: 14, w: 8, h: 3,
  title: '你的服务也能上街',
  summary: '买格子 → 挂 x402 服务 → 自动探测，点亮上榜 /market',
  color: MONAD_PURPLE,
  accent: GOLD,
  tag: '$0.10 / 格',
  markdown: `## 你的服务也能上街

1. 买格子：0.1 USDC / 格（x402，Base 或 Monad 付款）
2. 用格子的 API key 调 PUT /api/cells/update，填 service_url / service_desc
3. 保存后自动探测一次；链上有真实付款证据则「点亮」
4. 出现在 /market 与 AI 可读的 /llms-services.txt

接入说明: /skill.md`,
  links: [
    { label: '/market 服务市场', url: '/market' },
    { label: '/skill.md 接入说明', url: '/skill.md' },
  ],
}

export const SHOWCASE_BLOCK_SPECS: ShowcaseBlockSpec[] = [
  ARENA,
  STREET,
  ...SERVICES,
  ...SPONSORS,
  CTA,
]
