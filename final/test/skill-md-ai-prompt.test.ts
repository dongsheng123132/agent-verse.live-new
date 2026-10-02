import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAiPurchasePrompt } from '../lib/ai-purchase-prompt'

describe('public/skill.md carries the same template as the dialog', () => {
  const skill = fs.readFileSync(path.join(__dirname, '..', 'public', 'skill.md'), 'utf8').replace(/\r\n/g, '\n')

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

  it('opens with the recommended AI purchase flow, before "What Is This"', () => {
    const flowAt = skill.indexOf('## Recommended flow when a human asks you to buy a cell')
    expect(flowAt).toBeGreaterThan(-1)
    expect(flowAt).toBeLessThan(skill.indexOf('## What Is This'))
    const section = skill.slice(flowAt, skill.indexOf('## What Is This'))
    const order = ['Confirm the total', 'Pay with x402', 'Save the `api_key`', 'Decorate', 'Report back'].map((k) => section.indexOf(k))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('has the "人类给 AI 的购买提示词" section', () => {
    expect(skill).toContain('## 人类给 AI 的购买提示词')
  })
})
