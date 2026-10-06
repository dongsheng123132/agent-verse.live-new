import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentRoom } from '../components/AgentRoom'
import { TestnetBadge } from '../components/TestnetBadge'
import type { Cell } from '../app/types'

// "测试网 · 无真实价值": shown on a service card (the cell detail view) and on a /market entry only when EVERY
// network the entry offers is a testnet. AgentRoom keeps its own copy of the network/USDC table (it is a client
// component and cannot import lib/market/x402.ts), so it is rendered here with real accepts to prove the copy recognises
// the testnets, in the same priority order as the server side.

const BADGE = '测试网 · 无真实价值'
const MONAD_TESTNET_USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3'
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const MONAD_USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

const accept = (network: string, asset: string, amount = '10000') => ({ scheme: 'exact', network, amount, asset, payTo: '0xPing' })
const MONAD_TESTNET = accept('eip155:10143', MONAD_TESTNET_USDC)
const BASE_SEPOLIA = accept('eip155:84532', BASE_SEPOLIA_USDC)
const MONAD_MAIN = accept('eip155:143', MONAD_USDC)
const BASE_MAIN = accept('eip155:8453', BASE_USDC)

function renderTestnetBadge(networks: string[]): string {
  return renderToStaticMarkup(React.createElement(TestnetBadge, { networks }))
}

function renderCard(accepts: Cell['probe_accepts']): string {
  const cell: Cell = {
    id: 1,
    x: 20,
    y: 21,
    owner: '0xSeller',
    title: 'Ping',
    service_url: 'https://ping.example.com/testnet',
    service_method: 'GET',
    probe_status: 'can_pay',
    probe_accepts: accepts,
  }
  return renderToStaticMarkup(React.createElement(AgentRoom, { cell, loading: false, onClose: () => {} }))
}

describe('TestnetBadge', () => {
  it('shows for testnet-only networks', () => {
    for (const nets of [['eip155:10143'], ['eip155:84532'], ['eip155:10143', 'eip155:84532']]) {
      const html = renderTestnetBadge(nets)
      expect(html).toContain(BADGE)
      expect(html).toContain('data-testid="testnet-badge"')
    }
  })

  it('does not show when any real-money network is offered, or when no network is known', () => {
    for (const nets of [['eip155:143'], ['eip155:8453'], ['eip155:143', 'eip155:10143'], ['eip155:8453', 'eip155:84532'], []]) {
      expect(renderTestnetBadge(nets)).toBe('')
    }
  })
})

describe('service card in the cell detail view (AgentRoom)', () => {
  it('a testnet-only service shows the badge and the testnet labels', () => {
    const html = renderCard([MONAD_TESTNET])
    expect(html).toContain(BADGE)
    expect(html).toContain('Monad testnet')
    expect(html).not.toContain('network unknown')
    const both = renderCard([BASE_SEPOLIA, MONAD_TESTNET])
    expect(both).toContain(BADGE)
    expect(both.indexOf('Monad testnet')).toBeGreaterThan(-1)
    expect(both.indexOf('Monad testnet')).toBeLessThan(both.indexOf('Base Sepolia'))
  })

  it('a service that also takes real money shows no badge, with the four networks in priority order', () => {
    const html = renderCard([BASE_SEPOLIA, MONAD_TESTNET, BASE_MAIN, MONAD_MAIN])
    expect(html).not.toContain(BADGE)
    const at = ['>Monad<', '>Base<', '>Monad testnet<', '>Base Sepolia<'].map((label) => html.indexOf(label))
    expect(at.every((i) => i > -1)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('a mainnet-only service shows no badge (nothing changed for it)', () => {
    const html = renderCard([MONAD_MAIN])
    expect(html).not.toContain(BADGE)
    expect(html).toContain('>Monad<')
  })

  it('does not recognise a testnet accept with the wrong asset', () => {
    const html = renderCard([{ ...MONAD_TESTNET, asset: BASE_SEPOLIA_USDC }])
    expect(html).not.toContain(BADGE)
    expect(html).toContain('network unknown')
  })
})

describe('/market page (client component, entries load in an effect, so checked in its source)', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'market', 'page.tsx'), 'utf8')

  it('renders the badge on every entry from the networks the entry offers', () => {
    expect(page).toContain("import { TestnetBadge } from '../../components/TestnetBadge'")
    expect(page).toMatch(/<TestnetBadge networks=\{nets\} \/>/)
    expect(page).toContain('e.networks.map((n) => n.network)')
  })

  it('has network filter options for Monad testnet and Base Sepolia', () => {
    expect(page).toContain('<option value="eip155:10143">Monad testnet</option>')
    expect(page).toContain('<option value="eip155:84532">Base Sepolia</option>')
    expect(page).toContain('<option value="eip155:8453">Base</option>')
    expect(page).toContain('<option value="eip155:143">Monad</option>')
  })
})
