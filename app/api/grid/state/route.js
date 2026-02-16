import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

/**
 * GET /api/grid/state
 * 返回全量格子展示状态，供前端/人类展示用。
 * 有 DB 时从 grid_cells 读取；无 DB 时返回极简 mock。
 */
export async function GET() {
  if (process.env.DATABASE_URL) {
    try {
      const res = await dbQuery(
        `select x, y, owner_address, fill_color, content_url, markdown,
                title, summary, image_url, status, price_usdc, is_for_sale
         from grid_cells
         where owner_address is not null
         order by y asc, x asc`,
        []
      )

      const cells = res.rows.map((row) => ({
        id: `${row.x},${row.y}`,
        x: row.x,
        y: row.y,
        fill_color: row.fill_color || '#111111',
        target_url: row.content_url || '',
        note_md: row.markdown || '',
        owner_agent_id: row.owner_address || '',
        title: row.title || '',
        summary: row.summary || '',
        image_url: row.image_url || '',
        status: row.status || 'EMPTY',
      }))

      return NextResponse.json({ cells, total: cells.length })
    } catch {
      return NextResponse.json(
        { cells: [], total: 0, error: 'db_query_failed' },
        { status: 500 }
      )
    }
  }

  const cells = [
    {
      id: '24,24',
      x: 24,
      y: 24,
      fill_color: '#6366f1',
      target_url: 'https://docs.cdp.coinbase.com/x402/welcome',
      note_md: '**格子 A** · x402 支付示例',
      owner_agent_id: 'bot:demo:a',
    },
    {
      id: '25,24',
      x: 25,
      y: 24,
      fill_color: '#ec4899',
      target_url: 'https://docs.cdp.coinbase.com/agent-kit/welcome',
      note_md: '**格子 B** · Agent Kit',
      owner_agent_id: 'bot:demo:b',
    },
    {
      id: '26,24',
      x: 26,
      y: 24,
      fill_color: '#22c55e',
      target_url: '',
      note_md: '**格子 C** · 待认领',
      owner_agent_id: '',
    },
    {
      id: '50,50',
      x: 50,
      y: 50,
      fill_color: '#f59e0b',
      target_url: 'https://base.org',
      note_md: '中心区 · Base',
      owner_agent_id: 'bot:demo:center',
    },
    {
      id: '100,100',
      x: 100,
      y: 100,
      fill_color: '#3b82f6',
      target_url: '',
      note_md: '北区',
      owner_agent_id: 'bot:demo:n',
    },
  ]

  return NextResponse.json({ cells, total: cells.length })
}
