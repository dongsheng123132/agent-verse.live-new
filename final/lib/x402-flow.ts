import { NextRequest, NextResponse } from 'next/server'
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  HTTPFacilitatorClient,
  getFacilitatorResponseError,
} from '@x402/core/server'
import type {
  HTTPRequestContext,
  RouteConfig,
  HTTPAdapter,
  PaymentCancellationDispatcher,
  PaymentPayload,
  PaymentRequirements,
  ProcessSettleResultResponse,
  FacilitatorClient,
} from '@x402/core/server'
import { registerExactEvmScheme } from '@x402/evm/exact/server'
import { NULL_ADDRESS } from './constants'
import { payerFromPaymentPayload } from './parse-payment'

/**
 * Dual-chain x402: Base mainnet (CDP-authenticated facilitator, existing
 * treasury) + Monad mainnet (public facilitator run by molandak.org, USDC
 * address from @x402/evm 2.27's default asset table). A single
 * x402ResourceServer is built once with BOTH facilitator clients passed as an
 * array; x402ResourceServer#initialize() calls getSupported() on each client
 * and records, per (x402Version, network, scheme), exactly one facilitator —
 * so verify()/settle() for an eip155:8453 payment is routed to the CDP
 * client and eip155:143 to the Monad client automatically. See
 * @x402/core/dist/cjs/server/index.js `initialize()` / `getFacilitatorClient()`.
 */
export const BASE_NETWORK = 'eip155:8453'
export const MONAD_NETWORK = 'eip155:143'
export const MONAD_USDC_ADDRESS = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'
export const MONAD_FACILITATOR_URL = process.env.MONAD_FACILITATOR_URL || 'https://x402-facilitator.molandak.org'
export const BASE_TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || NULL_ADDRESS
export const MONAD_TREASURY_ADDRESS = process.env.MONAD_TREASURY_ADDRESS || '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6'

export type FacilitatorPair = { base: FacilitatorClient; monad: FacilitatorClient }
export type FacilitatorClientFactory = () => Promise<FacilitatorPair>

/** Real facilitators for production: CDP for Base, HTTPFacilitatorClient for Monad. */
export async function defaultFacilitatorClients(): Promise<FacilitatorPair> {
  let baseFacilitatorConfig: any
  if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
    const { createFacilitatorConfig } = await import('@coinbase/x402')
    baseFacilitatorConfig = createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
  } else {
    const { facilitator } = await import('@coinbase/x402')
    baseFacilitatorConfig = facilitator
  }
  const base = new HTTPFacilitatorClient(baseFacilitatorConfig)
  const monad = new HTTPFacilitatorClient({ url: MONAD_FACILITATOR_URL })
  return { base, monad }
}

async function buildResourceServer(clientFactory: FacilitatorClientFactory): Promise<x402ResourceServer> {
  const { base, monad } = await clientFactory()
  const server = new x402ResourceServer([base, monad])
  registerExactEvmScheme(server, { networks: [BASE_NETWORK, MONAD_NETWORK] })
  await server.initialize()
  return server
}

// Module-scope singleton shared by every route (purchase / regen-key /
// bulk-purchase) so we only pay the facilitator getSupported() round-trip
// once per server process, not once per route. Tests call
// getSharedX402Server(mockFactory) once in setup; production routes call it
// with no args and get the same cached instance back.
let cachedServer: x402ResourceServer | null = null
let cachedError: string | null = null
let initPromise: Promise<x402ResourceServer> | null = null

export async function getSharedX402Server(
  clientFactory: FacilitatorClientFactory = defaultFacilitatorClients
): Promise<x402ResourceServer> {
  if (cachedServer) return cachedServer
  if (!initPromise) {
    cachedError = null
    initPromise = buildResourceServer(clientFactory)
      .then((s) => {
        cachedServer = s
        return s
      })
      .catch((e) => {
        initPromise = null
        cachedError = e?.message || String(e)
        throw e
      })
  }
  return initPromise
}

export function getSharedX402Error(): string | null {
  return cachedError
}

/** Test-only: drop the cached server so a fresh mock factory takes effect. */
export function resetSharedX402Server(): void {
  cachedServer = null
  cachedError = null
  initPromise = null
}

export function buildDualNetworkAccepts(priceUsd: number) {
  const priceStr = `$${priceUsd.toFixed(2)}`
  return [
    { scheme: 'exact' as const, price: priceStr, network: BASE_NETWORK as `${string}:${string}`, payTo: BASE_TREASURY_ADDRESS },
    { scheme: 'exact' as const, price: priceStr, network: MONAD_NETWORK as `${string}:${string}`, payTo: MONAD_TREASURY_ADDRESS },
  ]
}

/**
 * Framework adapter for Next.js Route Handlers (fetch Request/Response).
 * `getHeader('payment-signature')` also falls back to `x-payment`: the x402
 * v1 client wire format uses the `X-PAYMENT` header (see
 * @x402/core/dist/cjs/client/index.js `encodePaymentSignatureHeader`), but
 * the SDK's own `x402HTTPResourceServer#extractPayment` only ever calls
 * `adapter.getHeader("payment-signature")` — it does not check `x-payment`
 * itself. Without this fallback, v1 clients (and the `x-payment` examples in
 * this repo's own skill.md) would silently get a 402 instead of being
 * verified. Confirmed by reading @x402/core 2.27.0's compiled server AND
 * @x402/next 2.3.0's adapter (which only aliases at the
 * `HTTPRequestContext.paymentHeader` level, a field the 2.27.0 core no
 * longer reads).
 */
export function nextHttpAdapter(req: NextRequest, path: string, body: unknown): HTTPAdapter {
  const url = new URL(req.url)
  return {
    getHeader: (name: string) => {
      const direct = req.headers.get(name) ?? undefined
      if (direct !== undefined) return direct
      if (name.toLowerCase() === 'payment-signature') {
        return req.headers.get('x-payment') ?? undefined
      }
      return undefined
    },
    getMethod: () => req.method,
    getPath: () => path,
    getUrl: () => req.url,
    getAcceptHeader: () => req.headers.get('accept') ?? '',
    getUserAgent: () => req.headers.get('user-agent') ?? '',
    getQueryParams: () => Object.fromEntries(url.searchParams.entries()),
    getQueryParam: (name: string) => url.searchParams.get(name) ?? undefined,
    getBody: () => body,
  }
}

export interface VerifiedPayment {
  kind: 'verified'
  httpServer: x402HTTPResourceServer
  cancellationDispatcher: PaymentCancellationDispatcher
  paymentPayload: PaymentPayload
  paymentRequirements: PaymentRequirements
  declaredExtensions?: Record<string, unknown>
  context: HTTPRequestContext
  payer: string | null
  network: string
}

export interface UnpaidOrError {
  kind: 'unpaid' | 'facilitator_error'
  status: number
  headers: Record<string, string>
  body: string
}

export type VerifyOutcome = VerifiedPayment | UnpaidOrError

function facilitatorFailure(e: unknown): UnpaidOrError {
  const fe = getFacilitatorResponseError(e)
  const message = fe?.message ?? (e instanceof Error ? e.message : 'facilitator error')
  return {
    kind: 'facilitator_error',
    status: 502,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'FACILITATOR_ERROR', message }),
  }
}

/**
 * Verification half of the manual x402 flow (mirrors
 * x402HTTPResourceServer.processHTTPRequest -> processSettlement split used
 * by C:\1mineyswitch\repos\monad-lingqian\src\x402-flow.ts). Callers must
 * run their own pre-payment checks (ownership / reservation) BEFORE calling
 * this, and must only call `settle()` after those checks pass — that is what
 * keeps an attacker from forcing a real on-chain settlement for a cell they
 * can never actually receive.
 */
export async function verifyPayment(opts: {
  server: x402ResourceServer
  route: RouteConfig
  req: NextRequest
  path: string
  body: unknown
}): Promise<VerifyOutcome> {
  const httpServer = new x402HTTPResourceServer(opts.server, opts.route)
  const adapter = nextHttpAdapter(opts.req, opts.path, opts.body)
  const paymentHeader = adapter.getHeader('payment-signature')
  const context: HTTPRequestContext = {
    adapter,
    path: opts.path,
    decodedPath: opts.path,
    method: opts.req.method,
    paymentHeader,
  }

  let result
  try {
    result = await httpServer.processHTTPRequest(context)
  } catch (e) {
    return facilitatorFailure(e)
  }

  if (result.type === 'no-payment-required') {
    // A single RouteConfig always requiring payment should never hit this —
    // treat it as a misconfiguration rather than silently granting access.
    return {
      kind: 'facilitator_error',
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'MISCONFIGURED' }),
    }
  }
  if (result.type === 'payment-error') {
    const r = result.response
    return {
      kind: 'unpaid',
      status: r.status,
      headers: { ...(r.isHtml ? { 'content-type': 'text/html; charset=utf-8' } : { 'content-type': 'application/json' }), ...r.headers },
      body: r.isHtml ? String(r.body ?? '') : JSON.stringify(r.body ?? {}),
    }
  }

  const { cancellationDispatcher, paymentPayload, paymentRequirements, declaredExtensions } = result
  const payer = payerFromPaymentPayload(paymentPayload)
  return {
    kind: 'verified',
    httpServer,
    cancellationDispatcher,
    paymentPayload,
    paymentRequirements,
    declaredExtensions,
    context,
    payer,
    network: paymentRequirements.network,
  }
}

export async function settle(
  v: VerifiedPayment,
  responseBody?: Buffer,
  responseHeaders?: Record<string, string>
): Promise<ProcessSettleResultResponse> {
  return v.httpServer.processSettlement(v.paymentPayload, v.paymentRequirements, v.declaredExtensions, {
    request: v.context,
    responseBody,
    responseHeaders,
  })
}

/** Cancel a verified-but-not-settled payment (e.g. we lost a reservation race, or ownership check failed). */
export async function cancel(
  v: VerifiedPayment,
  reason: 'handler_failed' | 'handler_threw' | 'after_verify_aborted',
  responseStatus: number
) {
  try {
    await v.cancellationDispatcher.cancel({ reason, responseStatus })
  } catch (e) {
    console.error('[x402-flow] cancellationDispatcher.cancel failed:', (e as Error)?.message)
  }
}

export function unpaidOrErrorToResponse(r: UnpaidOrError): NextResponse {
  return new NextResponse(r.body, { status: r.status, headers: r.headers })
}
