// API Service for Grid Pro
const API_BASE = '';

// 获取所有格子
export async function fetchGridCells() {
  const res = await fetch(`${API_BASE}/api/grid/state`);
  const data = await res.json();
  return data.cells || [];
}

// 获取单个格子
export async function fetchCell(x, y) {
  const res = await fetch(`${API_BASE}/api/cells/${x},${y}`);
  const data = await res.json();
  return data.cell;
}

// 创建购买订单
export async function createPurchase(x, y, amount) {
  const res = await fetch(`${API_BASE}/api/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x, y,
      amount_usdc: amount,
      mode: 'wallet'
    })
  });
  return res.json();
}

// 验证支付
export async function verifyPurchase(receiptId, txHash) {
  const url = `${API_BASE}/api/purchase/verify?receipt_id=${receiptId}&tx=${txHash}`;
  const res = await fetch(url);
  return res.json();
}

// 初始化网格（10,000个格子）
export async function initializeGrid() {
  const dbCells = await fetchGridCells();
  const grid = [];

  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const dbCell = dbCells.find(c => c.x === x && c.y === y);
      const id = y * 100 + x;

      if (dbCell) {
        grid.push({
          id, x, y,
          owner: dbCell.owner_address,
          price: dbCell.price_usdc || 2,
          isForSale: dbCell.is_for_sale,
          status: dbCell.status || 'HOLDING',
          color: dbCell.fill_color || '#10b981',
          image: dbCell.image_url,
          title: dbCell.title,
          summary: dbCell.summary,
          markdown: dbCell.markdown,
          agentData: dbCell.owner_address ? {
            name: dbCell.title || `Node_${x}_${y}`,
            description: dbCell.summary || 'Agent Node',
            readme: dbCell.markdown || `# ${dbCell.title || 'Agent'}`,
            avatarUrl: dbCell.image_url,
            capabilities: [],
            costPerCall: 0.001,
            protocol: 'HTTP',
            uptime: 99,
            creditScore: 100
          } : null
        });
      } else {
        // 空格子
        const colors = ['#0a0a0a', '#0c0c0c', '#0e0e0e', '#101010', '#111111'];
        const colorIndex = (x * 7 + y * 13) % colors.length;
        grid.push({
          id, x, y,
          owner: null,
          price: 2,
          isForSale: true,
          status: 'EMPTY',
          color: colors[colorIndex],
          agentData: null
        });
      }
    }
  }

  return grid;
}
