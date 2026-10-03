import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const swSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8')

/** Run public/sw.js against a fake ServiceWorkerGlobalScope and hand back the listeners it registered. */
function loadSw(opts: { cacheKeys?: string[]; windows?: Array<{ url: string; navigate: (u: string) => Promise<unknown> }> } = {}) {
  const listeners: Record<string, (event: any) => void> = {}
  const deleted: string[] = []
  const self: any = {
    addEventListener: (type: string, fn: (event: any) => void) => { listeners[type] = fn },
    skipWaiting: vi.fn(),
    registration: { unregister: vi.fn(async () => true) },
    clients: { matchAll: vi.fn(async () => opts.windows ?? []), claim: vi.fn() },
  }
  const caches = {
    keys: async () => opts.cacheKeys ?? [],
    delete: async (k: string) => { deleted.push(k); return true },
    open: vi.fn(),
  }
  new Function('self', 'caches', swSource)(self, caches)
  return { self, listeners, deleted, caches }
}

describe('public/sw.js is a self-unregistering worker', () => {
  it('only listens to install and activate (no fetch handler, so it never serves anything from a cache)', () => {
    const { listeners } = loadSw()
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'install'])
  })

  it('install: skipWaiting', () => {
    const { self, listeners } = loadSw()
    listeners.install({ waitUntil: () => {} })
    expect(self.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('activate: deletes ALL caches, then unregisters, then reloads every window client', async () => {
    const nav1 = vi.fn(async () => null)
    const nav2 = vi.fn(async () => null)
    const { self, listeners, deleted } = loadSw({
      cacheKeys: ['agentverse-v2', 'agentverse-v1', 'something-else'],
      windows: [{ url: 'https://www.agent-verse.live/', navigate: nav1 }, { url: 'https://www.agent-verse.live/market', navigate: nav2 }],
    })
    let work: Promise<unknown> = Promise.resolve()
    listeners.activate({ waitUntil: (p: Promise<unknown>) => { work = p } })
    await work
    expect(deleted).toEqual(['agentverse-v2', 'agentverse-v1', 'something-else'])
    expect(self.registration.unregister).toHaveBeenCalledTimes(1)
    expect(self.clients.matchAll).toHaveBeenCalledWith({ type: 'window' })
    expect(nav1).toHaveBeenCalledWith('https://www.agent-verse.live/')
    expect(nav2).toHaveBeenCalledWith('https://www.agent-verse.live/market')
  })

  it('a tab that refuses to navigate does not stop the others or the unregister', async () => {
    const good = vi.fn(async () => null)
    const { self, listeners } = loadSw({
      windows: [{ url: 'https://x/a', navigate: async () => { throw new Error('nope') } }, { url: 'https://x/b', navigate: good }],
    })
    let work: Promise<unknown> = Promise.resolve()
    listeners.activate({ waitUntil: (p: Promise<unknown>) => { work = p } })
    await work
    expect(self.registration.unregister).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledWith('https://x/b')
  })
})

describe('the app no longer registers a service worker', () => {
  it('app/layout.tsx has no serviceWorker registration', () => {
    const layout = fs.readFileSync(path.join(__dirname, '..', 'app', 'layout.tsx'), 'utf8')
    expect(layout).not.toMatch(/serviceWorker/)
    expect(layout).not.toMatch(/register-sw/)
  })
})
