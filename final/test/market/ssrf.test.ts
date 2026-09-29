import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock node:dns so hostname-based tests are offline and deterministic.
const lookupMock = vi.fn()
vi.mock('node:dns', () => ({
  default: { promises: { lookup: (...args: unknown[]) => lookupMock(...args) } },
  promises: { lookup: (...args: unknown[]) => lookupMock(...args) },
}))

const { assertPublicHttpsUrl, isPrivateOrReservedIp } = await import('../../lib/market/ssrf')

describe('lib/market/ssrf assertPublicHttpsUrl', () => {
  beforeEach(() => {
    lookupMock.mockReset()
  })

  it('rejects non-https URLs', async () => {
    const res = await assertPublicHttpsUrl('http://example.com/x')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('not_https')
  })

  it('rejects an invalid URL string', async () => {
    const res = await assertPublicHttpsUrl('not a url')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('invalid_url')
  })

  it('rejects literal loopback IP (127.0.0.1) without any DNS lookup', async () => {
    const res = await assertPublicHttpsUrl('https://127.0.0.1/secret')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('private_ip_literal')
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('rejects the AWS/GCP/Azure metadata address literal (169.254.169.254)', async () => {
    const res = await assertPublicHttpsUrl('https://169.254.169.254/latest/meta-data/')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('private_ip_literal')
  })

  it('rejects private IPv4 ranges: 10.x, 172.16-31.x, 192.168.x', async () => {
    for (const ip of ['10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.1']) {
      const res = await assertPublicHttpsUrl(`https://${ip}/`)
      expect(res.ok, `expected ${ip} to be rejected`).toBe(false)
    }
  })

  it('rejects literal IPv6 loopback and unique-local', async () => {
    const res1 = await assertPublicHttpsUrl('https://[::1]/x')
    expect(res1.ok).toBe(false)
    const res2 = await assertPublicHttpsUrl('https://[fd00::1]/x')
    expect(res2.ok).toBe(false)
  })

  it('rejects blocked hostnames (localhost, *.internal, *.local) without a DNS lookup', async () => {
    for (const host of ['localhost', 'metadata.google.internal', 'foo.internal', 'printer.local']) {
      const res = await assertPublicHttpsUrl(`https://${host}/`)
      expect(res.ok, `expected ${host} to be rejected`).toBe(false)
      expect(res.reason).toBe('blocked_hostname')
    }
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('allows a literal public IP with no DNS lookup', async () => {
    const res = await assertPublicHttpsUrl('https://8.8.8.8/')
    expect(res.ok).toBe(true)
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('resolves a hostname via DNS and allows it when every address is public', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
    const res = await assertPublicHttpsUrl('https://example.com/api')
    expect(res.ok).toBe(true)
    expect(lookupMock).toHaveBeenCalledWith('example.com', { all: true, verbatim: true })
  })

  it('rejects a hostname that DNS-rebinds to a private address (SSRF via DNS)', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
    const res = await assertPublicHttpsUrl('https://attacker-controlled.example/steal')
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/resolves_to_private_ip/)
  })

  it('rejects when ANY resolved address is private, even if another is public', async () => {
    lookupMock.mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ])
    const res = await assertPublicHttpsUrl('https://round-robin.example/')
    expect(res.ok).toBe(false)
  })

  it('rejects when DNS lookup fails', async () => {
    lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'))
    const res = await assertPublicHttpsUrl('https://does-not-exist.invalid/')
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/dns_lookup_failed/)
  })
})

describe('lib/market/ssrf isPrivateOrReservedIp', () => {
  it('flags CGNAT (100.64.0.0/10) and TEST-NET ranges', () => {
    expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('192.0.2.1')).toBe(true)
    expect(isPrivateOrReservedIp('198.51.100.1')).toBe(true)
    expect(isPrivateOrReservedIp('203.0.113.1')).toBe(true)
  })

  it('allows ordinary public IPv4/IPv6 addresses', () => {
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false)
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false)
  })
})
