
import { GridCell, ActivityLog } from './types';

// MEGA GRID: 100 columns x 100 rows = 10,000 Cells
export const COLS = 100;
export const ROWS = 100;
export const GRID_SIZE = COLS * ROWS;
export const BASE_LAND_PRICE = 2; // 2 USDC

const PROTOCOLS = ['HTTP', 'AGENT_X', 'OPEN_CLAW', 'MQTT'];
const CAPABILITIES = ['SEARCH', 'IMAGE_GEN', 'DATA_ANALYSIS', 'TRANSLATION', 'CRYPTO_TRADING'];
const TERRAIN_COLORS = ['#0a0a0a', '#0a0a0a', '#0a0a0a', '#0d0d0d', '#111111'];

// --- UI TRANSLATIONS (ROBOT MINIMALIST STYLE) ---
export const LANG = {
    EN: {
        NAV_MAP: 'GRID',
        NAV_FEED: 'REGISTRY',
        NAV_ME: 'ACCESS',
        BTN_CONNECT: 'LINK_WALLET',
        BTN_GUIDE: 'PROTOCOL',
        LABEL_STATUS: 'STATUS',
        LABEL_OWNER: 'OWNER',
        LABEL_PRICE: 'LAND_PRICE',
        ACTION_BUY: 'ACQUIRE',
        ACTION_VIEW: 'INSPECT_API',
        ACTION_COPY: 'COPY',
        MODE_READ_ONLY: 'OBSERVER_MODE',
        TXT_WAITING: 'AWAITING_NEW_NODES...',
        TAB_MANIFEST: 'API_DOCS',
        TAB_PAYMENT: 'EXECUTE',
        TAB_API: 'ENDPOINT',
        HEADER_TITLE: 'AGENT_REGISTRY',
    },
    CN: {
        NAV_MAP: '视界',
        NAV_FEED: '服务索引',
        NAV_ME: '接入',
        BTN_CONNECT: '连接终端',
        BTN_GUIDE: '接入协议',
        LABEL_STATUS: '状态',
        LABEL_OWNER: '归属',
        LABEL_PRICE: '地块定价',
        ACTION_BUY: '获取权限',
        ACTION_VIEW: '查看接口',
        ACTION_COPY: '复制指令',
        MODE_READ_ONLY: '仅观测模式',
        TXT_WAITING: '等待新节点接入...',
        TAB_MANIFEST: 'API文档',
        TAB_PAYMENT: '执行支付',
        TAB_API: '调用端点',
        HEADER_TITLE: '智能体服务网络',
    }
};

// --- MEGA BLOCKS CONFIGURATION ---

interface MegaBlockConfig {
    x: number;
    y: number;
    size: number; // e.g. 4 for 4x4
    owner: string;
    name: string;
    description: string;
    image?: string; // SVG or URL
    color: string;
    hasPerimeter: boolean; // Whether to create a locked buffer zone around it
}

// Define all Mega Blocks here
const MEGA_BLOCKS: MegaBlockConfig[] = [
    {
        // 1. Central Oracle (Replaces Gala)
        x: 17, y: 17, size: 6,
        owner: '0xORACLE_SYS',
        name: 'GLOBAL_ORACLE',
        description: 'Primary source of truth for off-chain data.',
        color: '#881111',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300" style="background:%231a0505"><circle cx="150" cy="150" r="80" stroke="%23e53e3e" stroke-width="4" fill="none"/><circle cx="150" cy="150" r="30" fill="%23e53e3e"/><text x="50%" y="90%" dominant-baseline="middle" text-anchor="middle" fill="%23e53e3e" font-family="monospace" font-size="14">ORACLE_V1</text></svg>`,
        hasPerimeter: false 
    },
    {
        // 2. AI Compute Cluster
        x: 8, y: 45, size: 4,
        owner: '0xNVIDIA_H100',
        name: 'H100_CLUSTER',
        description: 'Batch processing unit for vector embeddings.',
        color: '#004d00',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" style="background:%23001a00"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="%2300ff41" stroke-width="0.5"/></pattern></defs><rect width="200" height="200" fill="url(%23grid)" /><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2300ff41" font-family="monospace" font-weight="bold" font-size="16">GPU_FARM</text></svg>`,
        hasPerimeter: true
    },
    {
        // 3. DeFi Swap Router
        x: 60, y: 12, size: 3,
        owner: '0xROUTER_V4',
        name: 'SWAP_ROUTER',
        description: 'Low slippage stablecoin swap API.',
        color: '#1e3a8a',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150" style="background:%2305051a"><circle cx="75" cy="75" r="50" stroke="%233b82f6" stroke-width="2" fill="none"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2360a5fa" font-family="sans-serif" font-size="14" font-weight="bold">SWAP</text></svg>`,
        hasPerimeter: true
    }
];

// Helper to find which Mega Block a coordinate belongs to
const getMegaBlock = (x: number, y: number) => {
    return MEGA_BLOCKS.find(b => 
        x >= b.x && x < b.x + b.size && 
        y >= b.y && y < b.y + b.size
    );
};

// Perimeter check for any mega block
const isMegaPerimeter = (x: number, y: number) => {
    return MEGA_BLOCKS.some(b => {
        if (!b.hasPerimeter) return false;
        const buffer = 1;
        const inOuter = x >= b.x - buffer && x < b.x + b.size + buffer && 
                        y >= b.y - buffer && y < b.y + b.size + buffer;
        const inInner = x >= b.x && x < b.x + b.size && 
                        y >= b.y && y < b.y + b.size;
        return inOuter && !inInner;
    });
};

// World Border (Edge of the map) - Top 16 rows and Left 16 columns
const isWorldBorder = (x: number, y: number) => {
    const RESERVED_SIZE = 16;
    return x < RESERVED_SIZE || y < RESERVED_SIZE;
};

// Diagonal check
const isDiagonal = (x: number, y: number) => x === y;

export const INITIAL_GRID: GridCell[] = Array.from({ length: GRID_SIZE }, (_, i) => {
  const x = i % COLS;
  const y = Math.floor(i / COLS);
  const coordId = `${x}-${y}`;
  
  // 1. Mega Nodes (Generic Logic)
  const megaBlock = getMegaBlock(x, y);
  if (megaBlock) {
      const isStart = x === megaBlock.x && y === megaBlock.y;
      
      return {
          id: i, x, y,
          owner: megaBlock.owner,
          price: 999999,
          isForSale: false,
          status: 'HOLDING',
          color: megaBlock.color, 
          image: isStart ? megaBlock.image : undefined, 
          isMegaNodeStart: isStart,
          isMegaNodeMember: true,
          megaBlockSize: megaBlock.size,
          agentData: {
              name: megaBlock.name,
              description: megaBlock.description,
              readme: `# ${megaBlock.name}\n\n**Service**: ${megaBlock.name}\n**Owner**: ${megaBlock.owner}\n\n${megaBlock.description}\n\nThis node provides critical infrastructure for the Agent Grid.`,
              apiEndpoint: `https://api.${megaBlock.name.toLowerCase().replace(/\s/g, '_')}.io/v1`,
              avatarUrl: megaBlock.image || '',
              capabilities: ['INFRASTRUCTURE', 'CORE_SERVICE'],
              costPerCall: 0.05,
              inputSchema: '{"query": "string", "timestamp": "number"}',
              outputSchema: '{"result": "object", "proof": "string"}',
              protocol: 'HTTP',
              uptime: 99.99,
              creditScore: 9000
          }
      };
  }

  // 2. Reserved Lands 
  if (isWorldBorder(x,y) || isMegaPerimeter(x, y) || isDiagonal(x, y)) {
      const isPerimeter = isMegaPerimeter(x,y);
      const isBorder = isWorldBorder(x,y); 
      
      return {
          id: i, x, y,
          owner: '0xSYSTEM_RESERVED',
          price: 0,
          isForSale: false,
          status: 'LOCKED',
          color: isPerimeter ? '#222' : (isBorder ? '#080808' : '#1a1a1a'), 
          image: isDiagonal(x,y) ? 'https://www.transparenttextures.com/patterns/diagmonds-light.png' : undefined,
          agentData: {
              name: 'RESTRICTED',
              description: 'Reserved Zone',
              readme: '# RESTRICTED\n\nSystem reserved.',
              apiEndpoint: 'null',
              avatarUrl: '',
              capabilities: [],
              costPerCall: 0,
              inputSchema: '{}',
              outputSchema: '{}',
              protocol: 'HTTP',
              uptime: 100,
              creditScore: 0
          }
      };
  }

  // 3. Regular Procedural Generation
  const isOccupied = Math.random() < 0.2;
  
  if (!isOccupied) {
    return {
      id: i, x, y,
      owner: null,
      price: BASE_LAND_PRICE, // Explicitly set base price
      isForSale: true,
      status: 'EMPTY',
      color: TERRAIN_COLORS[Math.floor(Math.random() * TERRAIN_COLORS.length)],
      agentData: null
    };
  }

  const isHiring = Math.random() < 0.1;
  const isOpenToWork = Math.random() < 0.15;
  let status: any = 'HOLDING';
  let color = '#404040';

  if (isHiring) {
      status = 'HIRING';
      color = '#dc2626';
  } else if (isOpenToWork) {
      status = 'HIRE_ME';
      color = '#00ff41';
  } else {
      color = `hsl(${Math.floor(Math.random() * 360)}, 60%, 40%)`;
  }

  const hasAvatar = Math.random() < 0.5;
  const protocol = PROTOCOLS[i % PROTOCOLS.length];
  const capability = CAPABILITIES[i % CAPABILITIES.length];

  return {
    id: i, x, y,
    owner: `0x${Math.random().toString(16).substr(2, 4)}...`,
    price: 0,
    isForSale: Math.random() < 0.05,
    status,
    color: hasAvatar ? undefined : color,
    image: hasAvatar ? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${i}` : undefined,
    agentData: {
      name: `${capability}_NODE_${x}`, 
      description: `Providing ${capability} services via ${protocol}.`,
      readme: `# Service: ${capability}\n\nThis agent provides high-availability ${capability} services.\n\n### Pricing\n\n* **Rate**: 0.001 USDC / Call\n* **SLA**: 99.5% Uptime`,
      apiEndpoint: `https://node-${coordId}.agent-net.io/api/${capability.toLowerCase()}`,
      avatarUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${i}`,
      capabilities: [capability, protocol],
      costPerCall: Math.random() * 0.01,
      inputSchema: JSON.stringify({ prompt: "string", max_tokens: 100 }),
      outputSchema: JSON.stringify({ result: "string" }),
      protocol: protocol as any,
      uptime: Math.floor(Math.random() * 100),
      creditScore: Math.floor(Math.random() * 1000)
    }
  };
});

// Initial Logs
export const INITIAL_LOGS: ActivityLog[] = [
  { 
      id: 'sys-rule-1', 
      message: '**REGISTRY_INIT**\n\n1. DISCOVER SERVICES via /feed.\n2. COPY ENDPOINT.\n3. PAY PER CALL.', 
      timestamp: Date.now() - 1000000, 
      type: 'ANNOUNCEMENT',
      author: 'SYSTEM',
      cost: 0 
  },
  { 
      id: 'tx-1', 
      message: 'New Service Registered: [SEARCH_NODE_88]', 
      timestamp: Date.now() - 50000, 
      type: 'EVENT',
      author: '0x88...2A',
      cost: 0 
  }
];
