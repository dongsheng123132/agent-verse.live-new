import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  // Simple secret check
  const { secret } = await req.json().catch(() => ({}))
  if (secret !== 'chunwan2025setup') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const ORIGIN_X = 22
  const ORIGIN_Y = 0
  const BLOCK_W = 8
  const BLOCK_H = 8
  const BLOCK_ID = `blk_${ORIGIN_X}_${ORIGIN_Y}_${BLOCK_W}x${BLOCK_H}`
  const OWNER = '0xRESERVED'

  const TITLE = '🏮 2025春晚直播'
  const SUMMARY = 'CCTV Spring Festival Gala — 央视春晚直播入口'
  const FILL_COLOR = '#dc2626'
  const IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/CCTV_logo.svg/200px-CCTV_logo.svg.png'
  const CONTENT_URL = 'https://tv.cctv.com/live/cctv1/'
  const MARKDOWN = `## 🏮 2025 CCTV 春节联欢晚会

### 📺 直播入口

- **CCTV-1 直播**: [tv.cctv.com/live/cctv1](https://tv.cctv.com/live/cctv1/)
- **央视频 App**: [yangshipin.cn](https://www.yangshipin.cn/)
- **YouTube (海外)**: [CCTV春晚频道](https://www.youtube.com/@CCTVSpringFestivalGala)

### 🎭 节目亮点

> 🐍 2025蛇年春晚 | 除夕夜 20:00 (北京时间)

- 歌舞、相声、小品、杂技、魔术
- 全球华人同步观看
- AI 互动创新节目

### 🔴 关于春晚

央视春节联欢晚会（Spring Festival Gala）是全球收视率最高的电视节目之一。每年除夕夜播出，是中国人过年最重要的文化活动。

---

**AgentVerse 祝大家新春快乐，蛇年大吉！** 🧧`

  try {
    let inserted = 0
    for (let dy = 0; dy < BLOCK_H; dy++) {
      for (let dx = 0; dx < BLOCK_W; dx++) {
        const cx = ORIGIN_X + dx
        const cy = ORIGIN_Y + dy
        const cellId = cy * 100 + cx

        await dbQuery(`
          INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_id, block_w, block_h, block_origin_x, block_origin_y,
            fill_color, title, summary, image_url, content_url, markdown, last_updated)
          VALUES ($1, $2, $3, $4, 'HOLDING', false, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT (x, y) DO UPDATE SET
            owner_address = EXCLUDED.owner_address,
            status = EXCLUDED.status,
            block_id = EXCLUDED.block_id,
            block_w = EXCLUDED.block_w,
            block_h = EXCLUDED.block_h,
            block_origin_x = EXCLUDED.block_origin_x,
            block_origin_y = EXCLUDED.block_origin_y,
            fill_color = EXCLUDED.fill_color,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            image_url = EXCLUDED.image_url,
            content_url = EXCLUDED.content_url,
            markdown = EXCLUDED.markdown,
            last_updated = NOW()
        `, [
          cellId, cx, cy, OWNER, BLOCK_ID, BLOCK_W, BLOCK_H, ORIGIN_X, ORIGIN_Y,
          FILL_COLOR, TITLE, SUMMARY, IMAGE_URL, CONTENT_URL, MARKDOWN,
        ])
        inserted++
      }
    }

    return NextResponse.json({
      ok: true,
      message: `春晚活动区域创建成功`,
      area: `(${ORIGIN_X},${ORIGIN_Y}) to (${ORIGIN_X + BLOCK_W - 1},${ORIGIN_Y + BLOCK_H - 1})`,
      cells: inserted,
      block_id: BLOCK_ID,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
