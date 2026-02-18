import { NextResponse } from 'next/server'
import { generateApiKey } from '../../../../lib/api-key.js'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  const { secret, x, y } = await req.json().catch(() => ({}))
  if (secret !== 'chunwan2025setup') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const apiKey = await generateApiKey(Number(x), Number(y))
    return NextResponse.json({ ok: true, x, y, api_key: apiKey })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
