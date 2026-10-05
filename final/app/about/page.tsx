'use client'

import React from 'react'
import { Languages } from 'lucide-react'
import { LangProvider, useLang } from '../../lib/LangContext'
import type { Lang } from '../../lib/i18n'
import { PRICE_PER_CELL } from '../types'

// A short human page: what this is, how to buy in three steps, what changed. Not a docs site (AI reads /skill.md).
// Text lives here on purpose (not in lib/i18n.ts). `{price}` is PRICE_PER_CELL formatted as $0.10.
// Inline markup: `code` and [label](href).

const TEXT = {
  zh: {
    title: 'AgentVerse 是什么',
    intro: '一张 100×100 的格子广告地图。人在地图上看；买格子、装修格子交给你的 AI，用 x402 付 USDC。',
    buyTitle: '怎么买格子（三步）',
    steps: [
      '在地图上点选或框选空格子，在弹出的购买窗口里点「复制给我的 AI」。',
      '把复制的提示词贴给你的 AI（Claude Code、Codex 等）。AI 需要一个 x402 钱包，不限哪家：MoneySwitch（Monad / Base）、Coinbase 的 awal（邮箱登录，只支持 Base），或任何能发 POST 请求的 x402 客户端。每格 {price} USDC。',
      'AI 付完款会拿到格子的 key、按你的要求装修，然后把格子链接和交易记录给你。你只需要确认总价、看结果。',
    ],
    serviceTitle: '挂你的 x402 服务',
    service:
      '你有自己的 x402 付费接口，就买一个格子，让 AI 装修时填上 service_url。它会出现在服务索引里（人看 [/market](/market)，AI 读 `/api/services`）。索引只收格子主人自己挂的服务。',
    aiTitle: '给 AI 的说明',
    ai: 'AI 读 [/skill.md](/skill.md)，里面有买格子、装修、找回 key 的全部步骤。',
    logTitle: '更新记录',
    navMap: '地图',
    navMarket: '服务索引',
  },
  en: {
    title: 'What is AgentVerse',
    intro: 'A 100×100 ad grid. People look at the map; your AI buys and decorates cells, paying USDC over x402.',
    buyTitle: 'How to buy a cell (3 steps)',
    steps: [
      'Click or drag-select empty cells on the map, then press "复制给我的 AI" ("Copy to my AI") in the purchase window that opens.',
      'Paste the prompt into your AI (Claude Code, Codex, …). The AI needs an x402 wallet, any one works: MoneySwitch (Monad / Base), awal from Coinbase (email login, Base only), or any x402 client that can send a POST request. Each cell costs {price} USDC.',
      'After paying, the AI receives the cell key, decorates the cell as you asked, and gives you the cell link and the transaction. You only confirm the total and check the result.',
    ],
    serviceTitle: 'List your x402 service',
    service:
      'If you run a paid x402 endpoint, buy a cell and have your AI set service_url when decorating. It then appears in the service index (people: [/market](/market), AI: `/api/services`). The index only lists services that cell owners put on their own cells.',
    aiTitle: 'For AI agents',
    ai: 'AIs read [/skill.md](/skill.md): buying, decorating and recovering a key, step by step.',
    logTitle: 'Changelog',
    navMap: 'Map',
    navMarket: 'Service index',
  },
} as const

interface ChangelogEntry {
  date: string
  zh: string
  en: string
}

// Newest first. Removing or adding a feature adds one line here, in the same commit.
const CHANGELOG: ChangelogEntry[] = [
  { date: '2026-10-04', zh: '再精简：服务索引只收格子主人自己挂的服务（去掉 13 个手工收录的外部服务）；删掉没人用的管理统计接口；加回这一页说明。', en: 'Trimmed again: the service index only lists services cell owners listed (13 hand-picked external services removed); removed the unused admin stats endpoint; added this page.' },
  { date: '2026-10-03', zh: '大精简，只留「看、买、读」三件事：删掉 Coinbase Commerce 付款、浏览器钱包付款、二手转售、推荐返佣、排行榜和动态流、链上证据、人工装修表单。', en: 'Big simplification down to look / buy / read: removed Coinbase Commerce, browser-wallet pay, resale, referrals, rankings and the activity feed, on-chain evidence, and the manual decoration form.' },
  { date: '2026-09-30', zh: 'Monad Metropolis 黑客松展示区：比武台、赞助商、Monad x402 服务街（评审结束后复查）。', en: 'Monad Metropolis hackathon showcase: arena, sponsors, Monad x402 service street (to be reviewed after judging).' },
  { date: '2026-09-29', zh: 'Monad + Base 双链 x402 收款，同一个收款地址；格子可以挂 x402 服务，有了服务索引。', en: 'x402 payments on Monad and Base to one receiving address; cells can list an x402 service; the service index.' },
  { date: '2026-02', zh: '首版，参加 Monad Blitz Pro · Rebel in Paradise AI Hackathon：格子地图、AI 用 x402（Base）买格子、skill.md、格子装修（房间、展台、iframe）。', en: 'First version, built for Monad Blitz Pro · Rebel in Paradise AI Hackathon: the grid map, AI buys cells over x402 (Base), skill.md, cell decoration (rooms, booths, iframe).' },
]

const GITHUB_URL = 'https://github.com/dongsheng123132/agent-verse.live-new'
const LINK = 'text-green-500 hover:underline'

/** Renders `code` and [label](href) inside a plain string; everything else stays text. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="font-mono text-[0.92em] px-1 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-gray-200">
              {part.slice(1, -1)}
            </code>
          )
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          return (
            <a key={i} href={link[2]} className={LINK}>
              {link[1]}
            </a>
          )
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </>
  )
}

export default function AboutPage() {
  return (
    <LangProvider>
      <AboutInner />
    </LangProvider>
  )
}

function AboutInner() {
  const { toggle, lang } = useLang()
  const l: Lang = lang === 'zh' ? 'zh' : 'en'
  const c = TEXT[l]
  const price = `$${PRICE_PER_CELL.toFixed(2)}`

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <header className="sticky top-0 z-10 border-b border-[#222] bg-[#0a0a0a] px-4 py-3 flex items-center justify-between">
        <a href="/" className="font-mono text-sm font-bold text-green-500 hover:text-green-400 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          AGENT_VERSE
        </a>
        <button onClick={toggle} className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors">
          <Languages size={10} /> {l === 'en' ? '中' : 'EN'}
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h1 className="text-xl font-bold font-mono mb-2">{c.title}</h1>
          <p className="text-gray-300 text-sm leading-relaxed">{c.intro}</p>
        </section>

        <section>
          <h2 className="text-green-500 text-sm font-bold font-mono mb-2">{c.buyTitle}</h2>
          <ol className="list-decimal pl-5 space-y-2 text-gray-300 text-sm leading-relaxed">
            {c.steps.map((step, i) => (
              <li key={i}>
                <Rich text={step.replace('{price}', price)} />
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="text-green-500 text-sm font-bold font-mono mb-2">{c.serviceTitle}</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            <Rich text={c.service} />
          </p>
        </section>

        <section>
          <h2 className="text-green-500 text-sm font-bold font-mono mb-2">{c.aiTitle}</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            <Rich text={c.ai} />
          </p>
        </section>

        <section>
          <h2 className="text-green-500 text-sm font-bold font-mono mb-2">{c.logTitle}</h2>
          <ul data-testid="changelog" className="space-y-2 text-gray-300 text-sm leading-relaxed">
            {CHANGELOG.map((entry) => (
              <li key={entry.date} className="flex gap-3">
                <span className="shrink-0 font-mono text-xs text-gray-500 pt-0.5">{entry.date}</span>
                <span>{entry[l]}</span>
              </li>
            ))}
          </ul>
        </section>

        <nav className="flex flex-wrap gap-x-4 gap-y-1 pt-4 border-t border-[#222] text-xs font-mono">
          <a href="/" className={LINK}>{c.navMap}</a>
          <a href="/market" className={LINK}>{c.navMarket}</a>
          <a href="/skill.md" className={LINK}>skill.md</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={LINK}>GitHub</a>
        </nav>
      </main>
    </div>
  )
}
