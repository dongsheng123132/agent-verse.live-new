/**
 * SSRF guard for cell-service probing (MONAD-MARKET-SPEC.md P2): before we
 * ever fetch a URL a cell owner supplied, reject anything that isn't a public
 * HTTPS endpoint. Only a hostname string passing this check gets fetched.
 *
 * Checks, in order:
 *  1. Must parse as a URL with protocol exactly `https:`.
 *  2. Hostname must not be a literal loopback/private/link-local/metadata
 *     address or an obviously-local name (localhost, *.local, etc).
 *  3. The hostname is resolved via DNS (dns.promises.lookup, all addresses,
 *     both families) and EVERY resolved address is checked again — this is
 *     what stops "looks-public-but-resolves-to-127.0.0.1" DNS rebinding /
 *     attacker-controlled-DNS SSRF, not just the literal-IP case.
 *
 * This module never makes an HTTP request itself — lib/market/probe.ts calls
 * `assertPublicHttpsUrl()` before its own fetch.
 */
import dns from 'node:dns'
import net from 'node:net'

const dnsPromises = dns.promises

export interface SsrfCheckResult {
  ok: boolean
  reason: string | null
}

/** Cloud metadata / obviously-internal hostnames, rejected regardless of what they resolve to. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
])

function isBlockedHostnameLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(h)) return true
  if (h.endsWith('.local')) return true
  if (h.endsWith('.internal')) return true
  return false
}

/** IPv4 dotted-quad -> 4 octets, or null if not a valid IPv4 literal. */
function parseIPv4(addr: string): number[] | null {
  if (net.isIPv4(addr)) {
    return addr.split('.').map((p) => Number(p))
  }
  return null
}

/** Reject private/loopback/link-local/CGNAT/multicast/reserved/unspecified IPv4 ranges (incl. 169.254.169.254 metadata). */
function isPrivateOrReservedIPv4(addr: string): boolean {
  const o = parseIPv4(addr)
  if (!o) return false
  const [a, b] = o
  if (a === 0) return true // 0.0.0.0/8 (unspecified/"this network")
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (AWS/GCP/Azure metadata: 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && o[2] === 0) return true // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && o[2] === 2) return true // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && o[2] === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && o[2] === 113) return true // TEST-NET-3
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  return false
}

/** Reject loopback/link-local/unique-local/unspecified/IPv4-mapped-private IPv6 ranges. */
function isPrivateOrReservedIPv6(addr: string): boolean {
  const a = addr.toLowerCase()
  if (a === '::1') return true // loopback
  if (a === '::') return true // unspecified
  if (a.startsWith('fe80:') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) return true // fe80::/10 link-local
  if (a.startsWith('fc') || a.startsWith('fd')) return true // fc00::/7 unique local
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) — check the embedded IPv4.
  const v4Match = a.match(/(?:^::ffff:|^64:ff9b::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4Match && isPrivateOrReservedIPv4(v4Match[1])) return true
  return false
}

export function isPrivateOrReservedIp(addr: string): boolean {
  if (net.isIPv4(addr)) return isPrivateOrReservedIPv4(addr)
  if (net.isIPv6(addr)) return isPrivateOrReservedIPv6(addr)
  return false
}

/**
 * Resolve + validate a hostname is safe to fetch. Does NOT itself fetch
 * anything. Resolves both A and AAAA records (`dns.promises.lookup` with
 * `{ all: true, verbatim: true }`) and rejects if ANY resolved address is
 * private/reserved — a hostname that round-robins between a public and a
 * private address is treated as unsafe.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<SsrfCheckResult> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'not_https' }
  }
  // WHATWG URL keeps IPv6 literals bracketed in `.hostname` (e.g. "[::1]"),
  // which net.isIP()/dns.lookup() don't recognize — strip the brackets first.
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname
  if (!hostname) {
    return { ok: false, reason: 'invalid_url' }
  }
  if (isBlockedHostnameLiteral(hostname)) {
    return { ok: false, reason: 'blocked_hostname' }
  }
  // Literal IP in the URL itself (e.g. https://169.254.169.254/...).
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, reason: 'private_ip_literal' }
    }
    return { ok: true, reason: null }
  }
  // Hostname: resolve and check every address it maps to.
  let addresses: { address: string }[]
  try {
    addresses = await dnsPromises.lookup(hostname, { all: true, verbatim: true })
  } catch (err: any) {
    return { ok: false, reason: `dns_lookup_failed: ${err?.message || String(err)}` }
  }
  if (addresses.length === 0) {
    return { ok: false, reason: 'dns_no_records' }
  }
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      return { ok: false, reason: `resolves_to_private_ip: ${address}` }
    }
  }
  return { ok: true, reason: null }
}
