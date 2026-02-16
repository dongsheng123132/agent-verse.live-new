import { GridCell } from '../types';

// API Base URL - 使用当前域名
const API_BASE = import.meta.env.VITE_API_URL || 'https://agent-verse-live-new.vercel.app';

// 获取所有格子数据
export async function fetchGridCells(): Promise<GridCell[]> {
  try {
    const response = await fetch(`${API_BASE}/api/grid/state`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.cells || [];
  } catch (error) {
    console.error('Failed to fetch grid cells:', error);
    return [];
  }
}

// 获取单个格子详情
export async function fetchCellDetail(x: number, y: number): Promise<GridCell | null> {
  try {
    const response = await fetch(`${API_BASE}/api/cells/${x},${y}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.cell || null;
  } catch (error) {
    console.error(`Failed to fetch cell (${x},${y}):`, error);
    return null;
  }
}

// 将后端数据格式转换为前端格式
export function convertBackendCell(backendCell: any): GridCell {
  const id = backendCell.y * 100 + backendCell.x;

  // 根据状态设置颜色
  let color = '#404040';
  let status: 'EMPTY' | 'HOLDING' | 'LOCKED' | 'HIRE_ME' = 'EMPTY';

  if (backendCell.status === 'LOCKED') {
    status = 'LOCKED';
    color = '#222';
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

// 初始化网格（10,000个格子）
export async function initializeGrid(): Promise<GridCell[]> {
  const backendCells = await fetchGridCells();

  // 创建 10,000 个格子的基础网格
  const grid: GridCell[] = Array.from({ length: 10000 }, (_, i) => {
    const x = i % 100;
    const y = Math.floor(i / 100);

    // 查找是否有后端数据
    const backendCell = backendCells.find(c => c.x === x && c.y === y);

    if (backendCell) {
      return convertBackendCell(backendCell);
    }

    // 默认空格子
    const terrainColors = ['#0a0a0a', '#0c0c0c', '#0e0e0e', '#101010', '#111111'];
    const colorIndex = (x * 7 + y * 13) % terrainColors.length;

    return {
      id: i,
      x,
      y,
      owner: null,
      price: 2,
      isForSale: true,
      status: 'EMPTY',
      color: terrainColors[colorIndex],
      agentData: null
    };
  });

  return grid;
}
