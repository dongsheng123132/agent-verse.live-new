import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKILL_SECTION_NAME, buildAiPurchasePrompt } from '../lib/ai-purchase-prompt'

const skill = fs.readFileSync(path.join(__dirname, '..', 'public', 'skill.md'), 'utf8').replace(/\r\n/g, '\n')

describe('public/skill.md carries the same template as the dialog', () => {
  it('the single-cell example block equals the generated prompt (cell 50,50, all five fields)', () => {
    const generated = buildAiPurchasePrompt({
      origin: 'https://www.agent-verse.live',
      cells: [{ x: 50, y: 50 }],
      decorate: {
        title: 'My Agent',
        summary: 'AI assistant, online 24/7',
        fill_color: '#6366f1',
        iframe_url: 'https://my-agent.example.com',
        service_url: 'https://api.my-agent.example.com/paid',
      },
    })
    expect(skill).toContain('```text\n' + generated + '\n```')
  })

  it('has the "人类给 AI 的购买提示词" section', () => {
    expect(skill).toContain('## 人类给 AI 的购买提示词')
  })
})

describe('public/skill.md "AI 购买" section (the one the prompt points to)', () => {
  const start = skill.indexOf(`## ${SKILL_SECTION_NAME}`)
  const end = skill.indexOf('## What Is This')
  const section = skill.slice(start, end)

  it('exists, and opens the doc before "What Is This"', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
  })

  it('walks through price -> x402 payment -> save the key -> decorate -> report, in that order', () => {
    const order = ['**Price.**', '**Pay with x402.**', '**Save the `api_key`**', '**Decorate**', '**Report back**'].map((k) => section.indexOf(k))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('pay directly when the total was already confirmed, never above it', () => {
    expect(section).toContain('pay directly and never pay more than X')
  })

  it('covers the three ways to pay with the right facts about awal', () => {
    expect(section).toContain('**MoneySwitch**')
    expect(section).toContain('`paid_fetch`')
    expect(section).toContain('`POST /v1/fetch`')
    expect(section).toContain('`approval_id`')
    expect(section).toContain('**awal**')
    expect(section).toContain('email-OTP login')
    expect(section).toContain('**Base only** (no Monad)')
    expect(section).toContain('`--scheme`, `--json` and `--chain`')
    expect(section).toContain('no method or body flags')
    expect(section).toContain('If your x402 client cannot send a POST JSON body, use one that can (e.g. `@x402/fetch`)')
    expect(section).toContain('Private key + x402 client')
    expect(section).toContain('keep only small amounts in it')
  })

  it('error handling: taken, reserved, second 402 / settlement_failed, approval', () => {
    for (const k of ['409 cell_taken', 'cells_taken', '403 reserved', 'reserved_showcase', 'settlement_failed', '**Do not pay again.**', 'approval_required', 'approval_id']) {
      expect(section, k).toContain(k)
    }
  })

  it('explains the one-block rule and the key_cell / block response fields', () => {
    expect(section).toContain('full rectangle')
    expect(section).toContain('"key_cell"')
    expect(section).toContain('"block"')
  })
})

describe('public/skill.md no longer sends anyone to the dead Commerce flow or the awal -X/-d form', () => {
  it('no Coinbase Commerce anywhere (front matter, quick actions, API reference, summary table)', () => {
    expect(skill).not.toMatch(/commerce/i)
    expect(skill).not.toContain('hosted_url')
  })

  it('no `-X POST -d` awal example anywhere; awal only appears in the explanatory table row', () => {
    expect(skill).not.toMatch(/awal@latest x402 pay [^\n]*-X POST/)
    const awalLines = skill.split('\n').filter((l) => l.includes('awal'))
    expect(awalLines).toHaveLength(1)
    expect(awalLines[0]).toContain('**Base only** (no Monad)')
  })

  it('the API reference sections are numbered without a gap after removing Commerce', () => {
    const heads = [...skill.matchAll(/^### (\d+b?)\. /gm)].map((m) => m[1])
    expect(heads).toEqual(['1', '1b', '2', '3', '4', '5', '6', '7', '8'])
  })
})
