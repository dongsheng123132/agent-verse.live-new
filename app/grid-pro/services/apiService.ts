import { GridCell } from '../types';

const API_BASE = '';

export async function fetchGridCells(): Promise<any[]> {
  try {
    const response = await fetch(`${API_BASE}/api/grid/state`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.cells || [];
  } catch (error) {
    console.error('Failed to fetch grid:', error);
    return [];
  }
}

export async function fetchCellDetail(x: number, y: number): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/api/cells/${x},${y}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.cell;
  } catch (error) {
    console.error(`Failed to fetch cell (${x},${y}):`, error);
    return null;
  }
}

export async function createPurchase(x: number, y: number, amount: number): Promise<any> {
  const response = await fetch(`${API_BASE}/api/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, amount_usdc: amount, mode: 'wallet' })
  });
  return response.json();
}

export async function verifyPurchase(receiptId: string, txHash: string): Promise<any> {
  const url = `${API_BASE}/api/purchase/verify?receipt_id=${receiptId}&tx=${txHash}`;
  const response = await fetch(url);
  return response.json();
}

export function convertBackendCell(backendCell: any): GridCell {
  const id = backendCell.y * 100 + backendCell.x;

  let color = '#111111';
  let status: 'EMPTY' | 'HOLDING' | 'LOCKED' | 'HIRE_ME' = 'EMPTY';

  if (backendCell.status === 'LOCKED') {
    status = 'LOCKED';
    color = '#1a1a1a';
  } else if (backendCell.owner_address) {
    status = 'HOLDING';
    color = backendCell.fill_color || '#10b981';
  } else if (backendCell.is_for_sale) {
    status = 'EMPTY';
    color = '#065f46';
  }

  return {
    id,
    x: backendCell.x,
    y: backendCell.y,
    owner: backendCell.owner_address,
    price: backendCell.price_usdc || 2,
    isForSale: backendCell.is_for_sale || false,
    status,
    color,
    image: backendCell.image_url || undefined,
    isMegaNodeStart: false,
    isMegaNodeMember: false,
    agentData: backendCell.owner_address ? {
      name: backendCell.title || `Node_${backendCell.x}_${backendCell.y}`,
      description: backendCell.summary || 'Agent Node',
      readme: backendCell.markdown || `# ${backendCell.title || 'Agent'}`,
      apiEndpoint: '',
      avatarUrl: backendCell.image_url || '',
      capabilities: [],
      costPerCall: 0.001,
      inputSchema: '{}',
      outputSchema: '{}',
      protocol: 'HTTP',
      uptime: 99,
      creditScore: 100
    } : null
  };
}

export async function initializeGrid(): Promise<GridCell[]> {
  const dbCells = await fetchGridCells();

  // Generate 10,000 cells with database overlay
  const grid: GridCell[] = Array.from({ length: 10000 }, (_, i) => {
    const x = i % 100;
    const y = Math.floor(i / 100);
    const dbCell = dbCells.find((c: any) => c.x === x && c.y === y);

    if (dbCell) {
      return convertBackendCell(dbCell);
    }

    // Default terrain
    const colors = ['#0a0a0a', '#0c0c0c', '#0e0e0e', '#101010', '#111111'];
    const colorIndex = (x * 7 + y * 13) % colors.length;

    return {
      id: i,
      x,
      y,
      owner: null,
      price: 2,
      isForSale: true,
      status: 'EMPTY',
      color: colors[colorIndex],
      agentData: null
    };
  });

  return grid;
}
