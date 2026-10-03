import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-ignore -- plain ESM config file
import nextConfig from '../next.config.js'

describe('/docs is gone', () => {
  it('next.config.js redirects /docs to /skill.md permanently', async () => {
    const redirects = await nextConfig.redirects()
    expect(redirects).toEqual([{ source: '/docs', destination: '/skill.md', permanent: true }])
  })

  it('the docs page file no longer exists', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'app', 'docs'))).toBe(false)
  })

  it('nothing in the app links to /docs any more', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8')
    const llms = fs.readFileSync(path.join(__dirname, '..', 'public', 'llms.txt'), 'utf8')
    expect(page).not.toMatch(/href="\/docs"/)
    expect(llms).not.toMatch(/agent-verse\.live\/docs/)
  })
})
