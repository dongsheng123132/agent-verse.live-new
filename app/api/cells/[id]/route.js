import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

/**
 * GET /api/cells/[id]
 * 单个格子详情，供 AI 扫描。
 * ?format=md 或 Accept: text/markdown → 返回纯 Markdown（markdown）；
 * 否则返回 JSON（fill_color, owner_agent_id, target_url, note_md, x, y）。
 */
export async function GET(req, { params }) {
  const id = params?.id ?? ''
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format')
  const accept = req.headers.get('accept') || ''

  const parts = id.split(',')
  const x = Number(parts[0])
  const y = Number(parts[1])

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  let row = null

  if (process.env.DATABASE_URL) {
    try {
      const res = await dbQuery(
        `select x, y, owner_address, fill_color, content_url, markdown
         from grid_cells
         where x = $1 and y = $2
         limit 1`,
        [x, y]
      )
      if (res.rowCount) {
        row = res.rows[0]
      }
    } catch {
      return NextResponse.json(
        { error: 'db_query_failed' },
        { status: 500 }
      )
    }
  }

  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const noteMd = row.markdown || ''
  const wantMd = format === 'md' || accept.includes('text/markdown')

  if (wantMd) {
    return new NextResponse(noteMd, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  }

  return NextResponse.json({
    id: `${row.x},${row.y}`,
    x: row.x,
    y: row.y,
    fill_color: row.fill_color || '#111111',
    owner_agent_id: row.owner_address || '',
    target_url: row.content_url || '',
    note_md: noteMd,
  })
}
