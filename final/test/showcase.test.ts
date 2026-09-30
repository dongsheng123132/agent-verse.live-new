import { describe, expect, it, vi, beforeEach } from 'vitest'
import seed from '../lib/market/seed.json'
import {
  SHOWCASE_BLOCK_SPECS,
  SHOWCASE_DISCLAIMER,
  SHOWCASE_ORIGIN,
  SHOWCASE_OWNER,
  MONAD_PURPLE,
} from '../lib/showcase/metropolis'
import {
  SHOWCASE_BLOCKS,
  SHOWCASE_BOUNDS,
  blockContains,
  findShowcaseBlockAt,
  isRealUserOwner,
  isShowcaseReserved,
  logSkippedShowcase,
  mergeShowcaseIntoGrid,
  resetShowcaseSkipLog,
  resolveShowcase,
  showcaseFitsMap,
  virtualCellDetail,
  virtualGridCells,
} from '../lib/showcase/index'
import { isReserved } from '../app/types'

const byKind = (k: string) => SHOWCASE_BLOCKS.filter((b) => b.kind === k)
const cellsOf = (b: { x: number; y: number; w: number; h: number }) => {
  const out: [number, number][] = []
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) out.push([b.x + dx, b.y + dy])
  return out
}

/** Every link the showcase shows, all fetched with GET on 2026-09-30 and answering 200. */
const VERIFIED_LINKS = new Set([
  'https://monad.xyz',
  'https://monad.xyz/developers/hackathons/metropolis',
  'https://hackathon.monad.xyz',
  'https://luma.com/monad-metropolis',
  'https://www.agora.finance/',
  'https://nansen.ai/',
  'https://www.alibabacloud.com/',
  'https://www.kimi.com/',
  'https://intents.aurora.dev/',
  'https://envio.dev',
  'https://metamask.io/',
  'https://hunyuan.tencent.com/',
  'https://ack3.ai/',
  'https://chainstack.com/',
  'https://crouton.digital/',
  'https://zerion.io/',
  'https://www.quicknode.com/',
  'https://tenderly.co/',
  'https://monad-lingqian.vercel.app',
])
const INTERNAL_LINKS = new Set(['/market', '/skill.md', '/llms-services.txt'])

describe('showcase config', () => {
  it('sits at the chosen coordinates and fits on the 100x100 map', () => {
    expect(SHOWCASE_ORIGIN).toEqual({ x: 58, y: 40 })
    expect(SHOWCASE_BOUNDS).toEqual({ x0: 58, y0: 40, x1: 81, y1: 56 })
    expect(showcaseFitsMap()).toBe(true)
  })

  it('has unique block ids, no overlapping blocks, and tiles its footprint exactly (no purchasable holes)', () => {
    const ids = SHOWCASE_BLOCKS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    const seen = new Set<string>()
    for (const b of SHOWCASE_BLOCKS) {
      for (const [x, y] of cellsOf(b)) {
        const k = `${x},${y}`
        expect(seen.has(k), `cell ${k} covered twice`).toBe(false)
        seen.add(k)
      }
    }
    const area = (SHOWCASE_BOUNDS.x1 - SHOWCASE_BOUNDS.x0 + 1) * (SHOWCASE_BOUNDS.y1 - SHOWCASE_BOUNDS.y0 + 1)
    expect(seen.size).toBe(area)
  })

  it('arena: 16x8, Monad purple + gold, four tracks, timeline and verified links', () => {
    const [arena] = byKind('arena')
    expect(byKind('arena')).toHaveLength(1)
    expect([arena.w, arena.h]).toEqual([16, 8])
    expect(arena.title).toBe('Monad Metropolis 比武台')
    expect(arena.summary).toBe('Monad 黑客松 · 2026-09-01 → 10-14 · 总奖金 $250K+ · 4 大赛道')
    expect(arena.color).toBe(MONAD_PURPLE)
    expect(arena.color).toBe('#6E54FF')
    expect(arena.accent).toBe('#F5C542')
    for (const track of [
      'Onchain Finance & Trading',
      'Consumer Products & Payments',
      'Social, Attention & Culture',
      'Trust, Identity & AI Infrastructure',
    ]) {
      expect(arena.markdown).toContain(track)
    }
    expect(arena.markdown).toContain('10-14 11:59 (GMT+8)')
    expect(arena.markdown).toContain('10-14 ~ 10-27')
    expect(arena.markdown).toContain('11-03')
    expect(arena.links!.length).toBeGreaterThan(0)
  })

  it('sponsors: 16 booths of 4x3 in rows directly under the arena, each with the disclaimer', () => {
    const [arena] = byKind('arena')
    const sponsors = byKind('sponsor')
    expect(sponsors).toHaveLength(16)
    for (const s of sponsors) {
      expect([s.w, s.h]).toEqual([4, 3])
      expect(s.y).toBeGreaterThanOrEqual(arena.y + arena.h)
      expect(s.footnote).toBe(SHOWCASE_DISCLAIMER)
      expect(SHOWCASE_DISCLAIMER).toBe('信息整理自黑客松公开资料，非官方合作/背书')
      expect(s.tag).toBeTruthy()
    }
    expect(Math.min(...sponsors.map((s) => s.y))).toBe(arena.y + arena.h)
    expect(new Set(sponsors.map((s) => s.y)).size).toBe(3) // 6 / 6 / 4 per row
    const names = sponsors.map((s) => s.title)
    for (const n of [
      'Monad Foundation', 'Nansen', '阿里云 Qwen', 'KIMI', 'Envio', 'Agora', 'Aurora Intents', 'MetaMask', '腾讯混元',
      'ack3', 'Chainstack', 'Crouton Digital', 'Zerion', 'PingBusiness', 'Quicknode', 'Tenderly',
    ]) {
      expect(names).toContain(n)
    }
  })

  it('sponsor amounts match the guide', () => {
    const md = (t: string) => byKind('sponsor').find((s) => s.title === t)!.markdown!
    expect(md('Monad Foundation')).toContain('Best Community Team Project — $5,000')
    expect(md('Monad Foundation')).toContain('Best Mera-Powered UX — $2,500')
    expect(md('Monad Foundation')).toContain('Mera: One Passkey, Many Keys — $2,500')
    expect(md('Nansen')).toContain('$5,000')
    expect(md('阿里云 Qwen')).toContain('Qwen 3.8 Max')
    expect(md('阿里云 Qwen')).toContain('$5,000 额度')
    expect(md('KIMI')).toContain('$3,000 额度')
    expect(md('Envio')).toContain('Best Use of Envio — $1,000')
    expect(md('Agora')).toContain('$10,000')
    expect(md('Aurora Intents')).toContain('$5,000')
    expect(md('MetaMask')).toContain('$2,500')
    expect(md('腾讯混元')).toContain('$2,000 云券')
  })

  it('service street: 2x2 slots to the right of the arena incl. 灵签 / Nansen / agent402, all taken from the seed list', () => {
    const [arena] = byKind('arena')
    const services = byKind('service')
    expect(services.length).toBeGreaterThanOrEqual(3)
    for (const s of services) {
      expect([s.w, s.h]).toEqual([2, 2])
      expect(s.x).toBeGreaterThanOrEqual(arena.x + arena.w)
      expect(s.service).toBeTruthy()
      expect(s.footnote).toBeUndefined()
    }
    const ling = services.find((s) => s.title === 'Monad 灵签')!
    expect(ling.iframe_url).toBe('https://monad-lingqian.vercel.app')
    expect(ling.service!.url).toBe('https://monad-lingqian.vercel.app/qian')
    expect(services.some((s) => s.title.startsWith('Nansen'))).toBe(true)
    expect(services.some((s) => s.title.startsWith('agent402'))).toBe(true)
    const seedUrls = new Set((seed as { url: string }[]).map((e) => e.url))
    for (const s of services) expect(seedUrls.has(s.service!.url), s.service!.url).toBe(true)
  })

  it('only shows verified links, and no logo / image assets', () => {
    for (const b of SHOWCASE_BLOCKS) {
      const urls = [b.content_url, b.iframe_url, ...(b.links ?? []).map((l) => l.url)].filter(Boolean) as string[]
      for (const u of urls) expect(VERIFIED_LINKS.has(u) || INTERNAL_LINKS.has(u), `${b.id}: ${u}`).toBe(true)
    }
    const pingbusiness = byKind('sponsor').find((s) => s.title === 'PingBusiness')!
    expect(pingbusiness.content_url).toBeUndefined()
    expect(pingbusiness.links).toBeUndefined()
    expect(JSON.stringify(SHOWCASE_BLOCK_SPECS)).not.toMatch(/image|logo|\.png|\.svg|\.jpe?g|\.webp/i)
  })

  it('service listing prices are labelled with how far to trust them', () => {
    for (const s of byKind('service')) {
      expect(['live-402', 'seed-claim']).toContain(s.service!.listing.basis)
      if (s.service!.listing.basis === 'live-402') expect(s.service!.listing.checked_at).toBe('2026-09-30')
    }
  })
})

describe('isShowcaseReserved', () => {
  it('is true for every covered cell, false just outside, and independent of the SYS zone', () => {
    for (const b of SHOWCASE_BLOCKS) for (const [x, y] of cellsOf(b)) expect(isShowcaseReserved(x, y)).toBe(true)
    const { x0, y0, x1, y1 } = SHOWCASE_BOUNDS
    for (const [x, y] of [[x0 - 1, y0], [x1 + 1, y0], [x0, y0 - 1], [x0, y1 + 1], [x1 + 1, y1 + 1], [5, 5], [50, 50]]) {
      expect(isShowcaseReserved(x, y)).toBe(false)
    }
    expect(isReserved(5, 5)).toBe(true)
    expect(isReserved(58, 40)).toBe(false)
  })
})

describe('resolveShowcase (runtime validation against real users)', () => {
  const arenaCell = { x: 60, y: 42 }
  const nansen = SHOWCASE_BLOCKS.find((b) => b.id === 'sponsor-nansen')!

  it('shows every block when nobody owns a covered cell', () => {
    const r = resolveShowcase([{ x: 10, y: 10, owner: '0xUser' }])
    expect(r.active).toHaveLength(SHOWCASE_BLOCKS.length)
    expect(r.skipped).toEqual([])
  })

  it('0xRESERVED / 0xAgentVerseOfficial cells do not block a showcase block (any case)', () => {
    const r = resolveShowcase([
      { ...arenaCell, owner: '0xRESERVED' },
      { x: 61, y: 42, owner: '0xAgentVerseOfficial' },
      { x: 62, y: 42, owner: '0xagentverseofficial' },
    ])
    expect(r.active).toHaveLength(SHOWCASE_BLOCKS.length)
    expect(isRealUserOwner('0xRESERVED')).toBe(false)
    expect(isRealUserOwner('0xAgentVerseOfficial')).toBe(false)
    expect(isRealUserOwner('0xabc')).toBe(true)
    expect(isRealUserOwner(null)).toBe(false)
  })

  it('skips exactly the block that overlaps a real user cell, and reports the conflict', () => {
    const r = resolveShowcase([{ x: nansen.x + 1, y: nansen.y + 1, owner: '0x5c5869bceb4c4eb3fa1dcdeebd84e9890dbc01af' }])
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0].block.id).toBe('sponsor-nansen')
    expect(r.skipped[0].conflicts).toEqual([{ x: nansen.x + 1, y: nansen.y + 1 }])
    expect(r.active).toHaveLength(SHOWCASE_BLOCKS.length - 1)
    expect(r.active.find((b) => b.id === 'sponsor-nansen')).toBeUndefined()
  })

  it('a stray 0xx402 / 0xCommerce style owner counts as a real user', () => {
    const r = resolveShowcase([{ ...arenaCell, owner: '0xx402' }])
    expect(r.skipped.map((s) => s.block.id)).toEqual(['metropolis-arena'])
  })
})

describe('logSkippedShowcase', () => {
  beforeEach(() => resetShowcaseSkipLog())

  it('logs each skipped block once per distinct conflict set', () => {
    const nansen = SHOWCASE_BLOCKS.find((b) => b.id === 'sponsor-nansen')!
    const { skipped } = resolveShowcase([{ x: nansen.x, y: nansen.y, owner: '0xUser' }])
    const log = vi.fn()
    logSkippedShowcase(skipped, log)
    logSkippedShowcase(skipped, log)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('[showcase] skipping block "sponsor-nansen"')
    expect(log.mock.calls[0][0]).toContain(`(${nansen.x},${nansen.y})`)
    // a different conflict set logs again
    const again = resolveShowcase([{ x: nansen.x + 1, y: nansen.y, owner: '0xUser' }]).skipped
    logSkippedShowcase(again, log)
    expect(log).toHaveBeenCalledTimes(2)
  })
})

describe('virtual cells', () => {
  it('one row per covered cell, owned by the virtual owner, shaped like /api/grid rows', () => {
    const rows = virtualGridCells(SHOWCASE_BLOCKS)
    const area = (SHOWCASE_BOUNDS.x1 - SHOWCASE_BOUNDS.x0 + 1) * (SHOWCASE_BOUNDS.y1 - SHOWCASE_BOUNDS.y0 + 1)
    expect(rows).toHaveLength(area)
    for (const r of rows) {
      expect(r.showcase).toBe(true)
      expect(r.owner).toBe(SHOWCASE_OWNER)
      expect(r.id).toBe(r.y * 100 + r.x)
      const b = findShowcaseBlockAt(r.x, r.y)!
      expect(r.block_origin_x).toBe(b.x)
      expect(r.block_origin_y).toBe(b.y)
      expect([r.block_w, r.block_h]).toEqual([b.w, b.h])
      expect(r.summary !== undefined).toBe(r.x === b.x && r.y === b.y)
    }
  })

  it('detail: origin carries markdown / links / footnote; other cells of the block do not', () => {
    const sponsor = SHOWCASE_BLOCKS.find((b) => b.id === 'sponsor-nansen')!
    const origin = virtualCellDetail(sponsor, sponsor.x, sponsor.y)
    expect(origin.markdown).toContain('Best use of Nansen')
    expect(origin.content_url).toBe('https://nansen.ai/')
    expect(origin.showcase_footnote).toBe(SHOWCASE_DISCLAIMER)
    const other = virtualCellDetail(sponsor, sponsor.x + 1, sponsor.y)
    expect(other.markdown).toBeUndefined()
    expect(other.block_origin_x).toBe(sponsor.x)
  })

  it('detail of a service slot exposes the service fields the service card reads', () => {
    const ling = SHOWCASE_BLOCKS.find((b) => b.id === 'svc-lingqian')!
    const d = virtualCellDetail(ling, ling.x, ling.y)
    expect(d.service_url).toBe('https://monad-lingqian.vercel.app/qian')
    expect(d.iframe_url).toBe('https://monad-lingqian.vercel.app')
    expect(d.probe_status).toBe('unprobed')
    expect(d.showcase_listing).toEqual({ price_usdc: '0.01', networks: ['eip155:143'], basis: 'live-402', checked_at: '2026-09-30' })
  })
})

describe('mergeShowcaseIntoGrid', () => {
  it('replaces official / reserved rows under an active block, keeps real users, adds the virtual cells', () => {
    const resolved = resolveShowcase([])
    const rows = [
      { x: 60, y: 42, owner: '0xRESERVED' },
      { x: 61, y: 42, owner: '0xAgentVerseOfficial' },
      { x: 10, y: 60, owner: '0xUserFarAway' },
    ]
    const merged = mergeShowcaseIntoGrid(rows, resolved)
    const at = (x: number, y: number) => merged.filter((c) => c.x === x && c.y === y)
    expect(at(60, 42)).toHaveLength(1)
    expect(at(60, 42)[0].owner).toBe(SHOWCASE_OWNER)
    expect(at(61, 42)[0].owner).toBe(SHOWCASE_OWNER)
    expect(at(10, 60)[0].owner).toBe('0xUserFarAway')
    expect(merged).toHaveLength(virtualGridCells(SHOWCASE_BLOCKS).length + 1)
  })

  it('a real user row inside an active block (should not happen) still wins', () => {
    const merged = mergeShowcaseIntoGrid([{ x: 60, y: 42, owner: '0xUser' }], { active: SHOWCASE_BLOCKS, skipped: [] })
    expect(merged.filter((c) => c.x === 60 && c.y === 42).some((c) => c.owner === '0xUser')).toBe(true)
  })

  it('blockContains is half-open', () => {
    const arena = SHOWCASE_BLOCKS[0]
    expect(blockContains(arena, arena.x, arena.y)).toBe(true)
    expect(blockContains(arena, arena.x + arena.w - 1, arena.y + arena.h - 1)).toBe(true)
    expect(blockContains(arena, arena.x + arena.w, arena.y)).toBe(false)
  })
})
