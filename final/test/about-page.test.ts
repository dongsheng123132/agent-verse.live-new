import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PRICE_PER_CELL } from '../app/types'

// renderToStaticMarkup never runs effects, so the real LangProvider always renders 'en'.
// Swap in a provider whose language the test controls; useLang() keeps its real shape.
const langHolder = vi.hoisted(() => ({ lang: 'en' as 'en' | 'zh' }))
vi.mock('../lib/LangContext', async () => {
  const { t } = await import('../lib/i18n')
  return {
    LangProvider: ({ children }: { children: unknown }) => children,
    useLang: () => ({ lang: langHolder.lang, toggle: () => {}, t: (k: Parameters<typeof t>[0]) => t(k, langHolder.lang) }),
  }
})

const { default: AboutPage } = await import('../app/about/page')

function render(lang: 'en' | 'zh'): string {
  langHolder.lang = lang
  return renderToStaticMarkup(React.createElement(AboutPage))
}

const PRICE = `$${PRICE_PER_CELL.toFixed(2)}`

describe('/about page', () => {
  for (const lang of ['en', 'zh'] as const) {
    describe(lang, () => {
      const html = render(lang)

      it('shows the price from PRICE_PER_CELL, with no placeholder left', () => {
        expect(PRICE).toBe('$0.10')
        expect(html).toContain(`${PRICE} USDC`)
        expect(html).not.toContain('{price}')
      })

      it('links to /skill.md, the map, /market and GitHub', () => {
        expect(html).toContain('href="/skill.md"')
        expect(html).toContain('href="/"')
        expect(html).toContain('href="/market"')
        expect(html).toContain('href="https://github.com/dongsheng123132/agent-verse.live-new"')
      })

      it('links nowhere else', () => {
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
        const allowed = new Set(['/', '/market', '/skill.md', 'https://github.com/dongsheng123132/agent-verse.live-new'])
        expect(hrefs.filter((h) => !allowed.has(h))).toEqual([])
      })

      it('is read-only: no form, no input, no submit', () => {
        expect(html).not.toMatch(/<(form|input|textarea|select)\b/)
      })

      it('keeps the history in the changelog, newest first (new lines go on top)', () => {
        const dates = [...html.matchAll(/<span class="[^"]*">(\d{4}-\d{2}(?:-\d{2})?)<\/span>/g)].map((m) => m[1])
        expect(dates.slice(-5)).toEqual(['2026-10-04', '2026-10-03', '2026-09-30', '2026-09-29', '2026-02'])
        expect([...dates].sort().reverse()).toEqual(dates)
      })
    })
  }

  it('speaks the chosen language', () => {
    expect(render('en')).toContain('What is AgentVerse')
    expect(render('zh')).toContain('AgentVerse 是什么')
    expect(render('zh')).toContain('怎么买格子（三步）')
    expect(render('en')).toContain('How to buy a cell (3 steps)')
  })

  it('names the button that really exists in the purchase window', () => {
    const modal = fs.readFileSync(path.join(__dirname, '..', 'components', 'PurchaseModal.tsx'), 'utf8')
    expect(modal).toContain('复制给我的 AI')
    expect(render('zh')).toContain('复制给我的 AI')
    expect(render('en')).toContain('复制给我的 AI')
  })
})
