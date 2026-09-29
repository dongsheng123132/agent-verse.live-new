import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http, { type IncomingMessage, type Server } from 'node:http'
import net from 'node:net'
import type { Socket } from 'node:net'
import { Agent, setGlobalDispatcher } from 'undici'

import {
  installMarketOutboundProxyIfConfigured,
  resetMarketOutboundProxyForTests,
  closeMarketOutboundProxyForTests,
  isAlwaysDirectHost,
} from '../../lib/market/net-proxy'

/** Starts a plain HTTP "origin" server that just echoes back which path it was hit on. */
function startOriginServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ via: 'origin', path: req.url }))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, port })
    })
  })
}

/**
 * Starts a fake HTTP CONNECT proxy. It accepts a CONNECT to *any* host:port,
 * records the requested host:port, and tunnels the connection to
 * `127.0.0.1:originPort` regardless of what was asked — good enough to prove
 * "did this request go through the proxy" without needing real DNS/TLS for a
 * fake external hostname. Non-CONNECT requests (undici's ProxyAgent only
 * ever sends CONNECT here since proxyTunnel defaults to true) are rejected.
 */
function startFakeConnectProxy(originPort: number): Promise<{ server: Server; port: number; connectLog: string[] }> {
  const connectLog: string[] = []
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(405)
      res.end('CONNECT only')
    })
    server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
      connectLog.push(req.url || '')
      const upstream = net.connect(originPort, '127.0.0.1', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        upstream.write(head)
        upstream.pipe(clientSocket)
        clientSocket.pipe(upstream)
      })
      upstream.on('error', () => clientSocket.destroy())
      clientSocket.on('error', () => upstream.destroy())
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, port, connectLog })
    })
  })
}

describe('lib/market/net-proxy isAlwaysDirectHost', () => {
  it('treats localhost/loopback/RFC1918/CGNAT as always-direct', () => {
    expect(isAlwaysDirectHost('localhost')).toBe(true)
    expect(isAlwaysDirectHost('127.0.0.1')).toBe(true)
    expect(isAlwaysDirectHost('::1')).toBe(true)
    expect(isAlwaysDirectHost('10.0.0.5')).toBe(true)
    expect(isAlwaysDirectHost('172.16.0.5')).toBe(true)
    expect(isAlwaysDirectHost('192.168.1.5')).toBe(true)
    expect(isAlwaysDirectHost('100.64.0.5')).toBe(true)
  })

  it('does not treat a public-looking hostname as always-direct', () => {
    expect(isAlwaysDirectHost('external.example.test')).toBe(false)
    expect(isAlwaysDirectHost('monad-lingqian.vercel.app')).toBe(false)
    expect(isAlwaysDirectHost('8.8.8.8')).toBe(false)
  })
})

describe('lib/market/net-proxy installMarketOutboundProxyIfConfigured routing', () => {
  let origin: Awaited<ReturnType<typeof startOriginServer>>
  let proxy: Awaited<ReturnType<typeof startFakeConnectProxy>>
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(async () => {
    origin = await startOriginServer()
    proxy = await startFakeConnectProxy(origin.port)
    savedEnv.HTTPS_PROXY = process.env.HTTPS_PROXY
    savedEnv.HTTP_PROXY = process.env.HTTP_PROXY
    resetMarketOutboundProxyForTests()
  })

  afterEach(async () => {
    // Fully close whatever RoutingDispatcher this test installed (if any)
    // and put a fresh vanilla Agent back as the global dispatcher, so the
    // next test in this file starts from the same clean state Node itself
    // starts a process in — otherwise a leftover RoutingDispatcher pointed
    // at an already-torn-down fake proxy/origin could make later tests in
    // this file hang or fail for reasons unrelated to what they're testing.
    await closeMarketOutboundProxyForTests()
    resetMarketOutboundProxyForTests()
    setGlobalDispatcher(new Agent())
    process.env.HTTPS_PROXY = savedEnv.HTTPS_PROXY
    process.env.HTTP_PROXY = savedEnv.HTTP_PROXY
    await new Promise<void>((resolve) => origin.server.close(() => resolve()))
    await new Promise<void>((resolve) => proxy.server.close(() => resolve()))
  })

  it('routes a fetch to an external-looking host through the fake CONNECT proxy', async () => {
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxy.port}`
    delete process.env.HTTP_PROXY

    const result = installMarketOutboundProxyIfConfigured()
    expect(result).toEqual({ installed: true, url: `http://127.0.0.1:${proxy.port}` })

    const res = await fetch(`http://external.example.test:${origin.port}/via-proxy`)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ via: 'origin', path: '/via-proxy' })

    // The fake proxy must have seen a CONNECT for the external hostname —
    // proof the request actually traveled through it, not a direct dial.
    expect(proxy.connectLog).toContain(`external.example.test:${origin.port}`)
  })

  it('dials a local address directly, bypassing the proxy entirely', async () => {
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxy.port}`
    delete process.env.HTTP_PROXY
    installMarketOutboundProxyIfConfigured()

    const before = proxy.connectLog.length
    const res = await fetch(`http://127.0.0.1:${origin.port}/direct`)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ via: 'origin', path: '/direct' })

    // No new CONNECT was recorded — the local address never touched the proxy.
    expect(proxy.connectLog.length).toBe(before)
  })

  it('is a no-op (direct fetch still works) when no proxy env var is set', async () => {
    delete process.env.HTTPS_PROXY
    delete process.env.HTTP_PROXY

    const result = installMarketOutboundProxyIfConfigured()
    expect(result).toEqual({ installed: false, url: null })

    const res = await fetch(`http://127.0.0.1:${origin.port}/no-proxy`)
    expect(res.status).toBe(200)
    expect(proxy.connectLog.length).toBe(0)
  })
})
