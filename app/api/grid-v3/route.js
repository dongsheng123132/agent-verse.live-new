import { NextResponse } from 'next/server';
import { dbQuery } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json([]);
    }
    // 只获取有主人的格子（已购买的）
    const res = await dbQuery(
      `SELECT id, x, y, owner_address as owner, price_usdc as price,
              is_for_sale as "isForSale", status, fill_color as color,
              image_url as image, title, summary
       FROM grid_cells
       WHERE owner_address IS NOT NULL
       ORDER BY y ASC, x ASC`,
      []
    );

    // 转换数据格式
    const cells = res.rows.map(row => ({
      ...row,
      agentData: row.owner ? {
        name: row.title || `Node_${row.x}_${row.y}`,
        description: row.summary || 'Agent Node',
        readme: `# ${row.title || 'Agent'}\n\n${row.summary || ''}`,
        apiEndpoint: '',
        avatarUrl: row.image || '',
        capabilities: [],
        costPerCall: 0.001,
        inputSchema: '{}',
        outputSchema: '{}',
        protocol: 'HTTP',
        uptime: 99,
        creditScore: 100
      } : null
    }));

    return NextResponse.json(cells);
  } catch (error) {
    console.error("[API ERROR] Grid fetch failed:", error);
    // 无 DB 或连接失败时返回空数组，避免页面卡在 loading
    return NextResponse.json([]);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { cellIds, agentData, status, isForSale, price } = body;

    if (!cellIds || !Array.isArray(cellIds)) {
      return NextResponse.json({ error: "Invalid cellIds" }, { status: 400 });
    }

    // 更新数据库
    for (const id of cellIds) {
      const x = id % 100;
      const y = Math.floor(id / 100);

      await dbQuery(
        `UPDATE grid_cells
         SET status = $1, is_for_sale = $2, price_usdc = $3, last_updated = NOW()
         WHERE x = $4 AND y = $5`,
        [status, isForSale, price, x, y]
      );
    }

    return NextResponse.json({ success: true, count: cellIds.length });
  } catch (error) {
    console.error("[API ERROR] Update failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
