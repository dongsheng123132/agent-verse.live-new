import { NextResponse } from 'next/server'
import { getMarketServices } from '../../lib/market/market'
import { ensureSchema } from '../../lib/schema'
import { PAY_TO_ADDRESS } from '../../lib/x402-flow'

// GET /llms-services.txt — dynamic service index + "how to pay" for AI
// agents. public/llms.txt stays a static file
// describing the grid itself (site-authored, rarely changes); this route is
// new and covers the *service index* (only services cell owners listed on
// cells they bought; may be empty), which
// changes as cells get probed/re-probed and can't be pre-baked into a static
// file. Deviation note: the spec offered "convert llms.txt to a dynamic
// route OR keep the static one and add a new file — pick one"; we kept the
// static public/llms.txt untouched (it has stable inbound links, e.g. from
// skill.md and README.md) and added this new route instead of replacing it.
export const dynamic = 'force-dynamic'

function formatEntry(e: Awaited<ReturnType<typeof getMarketServices>>[number]): string {
  const price = e.price_usdc ? `$${e.price_usdc}` : '?'
  const lines = [
    `- ${e.name}`,
    `  url: ${e.url}`,
    `  method: ${e.method}  price: ${price}  network: ${e.network ?? '?'}  status: ${e.status}  source: ${e.source}`,
  ]
  if (e.description) lines.push(`  description: ${e.description}`)
  return lines.join('\n')
}

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return new NextResponse('# llms-services.txt\nservice index unavailable: database not configured\n', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    await ensureSchema()
    const services = await getMarketServices({})

    const header = `# AgentVerse x402 Service Index — llms-services.txt
> AgentVerse 的 x402 服务索引：只收格子主人挂在自己格子上的服务。人看格子地图，AI 看这份索引直接调用。

## What this is
Every entry below is a paid HTTP endpoint that speaks the x402 protocol
(https://x402.org), listed by the owner of an AgentVerse cell on a cell they
bought. The index only holds services cell owners listed themselves; it can be
empty. GET it once unauthenticated: you get HTTP 402 with a
PAYMENT-REQUIRED header (or a v1 JSON body) listing which network + USDC
asset + price it accepts. Pay, retry with the payment header, get your data.

## How to pay (one command, MoneySwitch)
The fastest path for an AI agent is MoneySwitch's paid_fetch — it does the
whole 402 -> pay -> retry dance for you:

    npx moneyswitch paid_fetch <url> --max-price 0.05

Or, for x402-only endpoints without MoneySwitch installed:

    npx awal@latest x402 pay <url>

## This site's own paid endpoints
See GET /.well-known/x402 for AgentVerse's own paid endpoints (buy a cell,
bulk-buy a block, recover an API key). Pay-to address (same on both chains):
${PAY_TO_ADDRESS}

## What "status" means
It comes from one read-only GET (nothing is paid), not from on-chain history.
- can_pay: the URL returned a valid x402 v2 402 offering USDC on the network shown.
- failed: it did not (unreachable, not a 402, an x402 v1 402, or no Monad/Base USDC offer).
- unchecked: not checked: a POST service (it needs a body) or not probed yet.

## Machine-readable
GET /api/services?q=&network=&max_price=&category=&status= returns this same
list as JSON. Networks used here: eip155:8453 (Base) and eip155:143 (Monad).

## Service index (${services.length} services)
`
    const body =
      services.length > 0
        ? services.map(formatEntry).join('\n\n')
        : '(none yet: no cell owner has listed a service on a cell)'
    return new NextResponse(`${header}\n${body}\n`, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  } catch (e: any) {
    console.error('[llms-services.txt]', e)
    return new NextResponse(`# llms-services.txt\nerror building service index: ${e?.message}\n`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}
