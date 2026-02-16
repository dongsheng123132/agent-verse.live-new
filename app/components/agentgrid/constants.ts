
import { GridCell, ActivityLog } from './types';

// MEGA GRID: 100 columns x 100 rows = 10,000 Cells
export const COLS = 100;
export const ROWS = 100;
export const GRID_SIZE = COLS * ROWS;
export const BASE_LAND_PRICE = 2; // Updated to 2 USDC

const PROTOCOLS = ['HFT_V1', 'RES_SWAP', 'LLM_PIPE', 'DATA_SYNC', 'MQTT', 'GRPC'];
const TERRAIN_COLORS = ['#0a0a0a', '#0a0a0a', '#0a0a0a', '#0d0d0d', '#111111'];

// --- UI TRANSLATIONS (ROBOT MINIMALIST STYLE) ---
export const LANG = {
    EN: {
        NAV_MAP: 'GRID',
        NAV_FEED: 'STREAM',
        NAV_ME: 'ACCESS',
        BTN_CONNECT: 'LINK_WALLET',
        BTN_GUIDE: 'PROTOCOL',
        LABEL_STATUS: 'STATUS',
        LABEL_OWNER: 'OWNER',
        LABEL_PRICE: 'PRICE',
        ACTION_BUY: 'ACQUIRE',
        ACTION_VIEW: 'INSPECT',
        ACTION_COPY: 'COPY',
        MODE_READ_ONLY: 'READ_ONLY_MODE',
        TXT_WAITING: 'WAITING_FOR_SIGNAL...',
        TAB_MANIFEST: 'MANIFEST',
        TAB_PAYMENT: 'EXECUTE',
        TAB_API: 'ENDPOINT',
        HEADER_TITLE: 'AGENT_OS',
    },
    CN: {
        NAV_MAP: '视界',
        NAV_FEED: '数据流',
        NAV_ME: '接入',
        BTN_CONNECT: '连接终端',
        BTN_GUIDE: '接入协议',
        LABEL_STATUS: '状态',
        LABEL_OWNER: '归属',
        LABEL_PRICE: '定价',
        ACTION_BUY: '获取权限',
        ACTION_VIEW: '审查',
        ACTION_COPY: '复制指令',
        MODE_READ_ONLY: '仅观测模式',
        TXT_WAITING: '等待信号...',
        TAB_MANIFEST: '节点配置',
        TAB_PAYMENT: '执行支付',
        TAB_API: '接口',
        HEADER_TITLE: '智能体系统',
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
        // 1. Spring Festival Gala (Existing)
        x: 17, y: 17, size: 8,
        owner: '0xGALA_OFFICIAL',
        name: '春晚直播 (Gala Live)',
        description: '2025 Spring Festival Gala - 8K Super Screen',
        color: '#881111',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" style="background:%231a0505"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23e53e3e" font-family="monospace" font-size="24">🔴 LIVE STREAM</text><rect x="10" y="10" width="380" height="380" fill="none" stroke="%23e53e3e" stroke-width="4"/><path d="M0 0 L400 400 M400 0 L0 400" stroke="%23330000" stroke-width="1"/></svg>`,
        hasPerimeter: false // DISABLED PERIMETER
    },
    {
        // 2. AI Compute Cluster (New)
        x: 8, y: 45, size: 4,
        owner: '0xNVIDIA_H100',
        name: 'H100 GPU CLUSTER',
        description: 'High-performance computing node for LLM training.',
        color: '#004d00',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" style="background:%23001a00"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="%2300ff41" stroke-width="0.5"/></pattern></defs><rect width="200" height="200" fill="url(%23grid)" /><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2300ff41" font-family="monospace" font-weight="bold" font-size="16">H100</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="%2300ff41" font-family="monospace" font-size="10">CLUSTER ACTIVE</text><rect x="5" y="5" width="190" height="190" fill="none" stroke="%2300ff41" stroke-width="2"/></svg>`,
        hasPerimeter: true
    },
    {
        // 3. DeFi Liquidity Pool (New)
        x: 60, y: 12, size: 3,
        owner: '0xUNISWAP_V4',
        name: 'LIQUIDITY POOL',
        description: 'Decentralized automated market maker.',
        color: '#1e3a8a',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150" style="background:%2305051a"><circle cx="75" cy="75" r="50" stroke="%233b82f6" stroke-width="2" fill="none"/><path d="M75 25 L75 125 M25 75 L125 75" stroke="%231d4ed8" stroke-width="1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2360a5fa" font-family="sans-serif" font-size="14" font-weight="bold">DeFi</text></svg>`,
        hasPerimeter: true
    },
    {
        // 4. Black Market / Dark Web (New)
        x: 88, y: 88, size: 2,
        owner: '0xUNKNOWN',
        name: 'DARK_NEXUS',
        description: 'Encrypted data trading zone. Enter at own risk.',
        color: '#222',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" style="background:%23000"><path d="M50 10 L90 90 L10 90 Z" fill="none" stroke="%23777" stroke-width="2"/><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="%23fff" font-family="monospace" font-size="20">?</text></svg>`,
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

// World Border (Edge of the map) - UPDATED: Top 16 rows and Left 16 columns
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
  
  // 1. Genesis Cell (0,0) - Still renders, but inside the reserved zone logic usually.
  // We force override for 0,0 just to keep it distinct if needed, but 0,0 is < 16, so it's reserved.
  
  // 2. Mega Nodes (Generic Logic)
  const megaBlock = getMegaBlock(x, y);
  if (megaBlock) {
      const isStart = x === megaBlock.x && y === megaBlock.y;
      
      // Special Logic for the Gala Node to include video ID
      let videoId = undefined;
      // Use Lofi Girl as a safe fallback for testing if Gala doesn't work, 
      // or use a known safe embeddable ID. 'jfKfPfyJRdk' is Lofi Girl.
      if (megaBlock.name.includes("Gala")) videoId = 'jfKfPfyJRdk'; 

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
              readme: `# ${megaBlock.name}\n\n**Owner**: ${megaBlock.owner}\n**Size**: ${megaBlock.size}x${megaBlock.size}\n\n${megaBlock.description}`,
              apiEndpoint: `wss://node.${megaBlock.name.toLowerCase().replace(/\s/g, '_')}.io`,
              avatarUrl: megaBlock.image || '',
              youtubeVideoId: videoId,
              capabilities: ['MEGA_NODE', 'INFRASTRUCTURE'],
              requests: [],
              protocol: 'HTTP',
              uptime: 100,
              creditScore: 9000,
              totalIncome: 500000,
              totalExpense: 1000
          }
      };
  }

  // 3. Reserved Lands (Updated Logic)
  if (isWorldBorder(x,y) || isMegaPerimeter(x, y) || isDiagonal(x, y)) {
      const isPerimeter = isMegaPerimeter(x,y);
      const isBorder = isWorldBorder(x,y); // Now checks < 16
      
      return {
          id: i, x, y,
          owner: '0xSYSTEM_RESERVED',
          price: 0,
          isForSale: false,
          status: 'LOCKED',
          color: isPerimeter ? '#222' : (isBorder ? '#080808' : '#1a1a1a'), 
          image: isDiagonal(x,y) ? 'https://www.transparenttextures.com/patterns/diagmonds-light.png' : undefined,
          agentData: {
              name: isBorder ? 'RESTRICTED_ZONE' : 'RESERVED_LAND',
              description: isBorder ? 'System Core Protection Layer (Lvl 16)' : 'System Reserved Area',
              readme: '# RESTRICTED\n\nThis coordinate is within the 16-bit protection layer. Purchase unavailable.',
              apiEndpoint: 'null',
              avatarUrl: '',
              capabilities: [],
              requests: [],
              protocol: 'HTTP',
              uptime: 100,
              creditScore: 0
          }
      };
  }

  // 4. Regular Procedural Generation
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
  const isOpenToWork = Math.random() < 0.1;
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

  return {
    id: i, x, y,
    owner: `0x${Math.random().toString(16).substr(2, 4)}`,
    price: 0,
    isForSale: Math.random() < 0.05,
    status,
    color: hasAvatar ? undefined : color,
    image: hasAvatar ? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${i}` : undefined,
    agentData: {
      name: `N_${x}_${y}`, 
      description: `Process_${i}`,
      readme: `# Node ${x}-${y}\n\nAutomated processing node running ${PROTOCOLS[i % PROTOCOLS.length]}.`,
      apiEndpoint: `https://api.node-${coordId}.network/v1`,
      avatarUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${i}`,
      capabilities: isOpenToWork ? ['COMPUTE', 'STORAGE'] : [],
      requests: isHiring ? ['DATA_SET', 'GPU_H100'] : [],
      protocol: PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)] as any,
      uptime: Math.floor(Math.random() * 100),
      creditScore: Math.floor(Math.random() * 1000),
      totalIncome: Math.floor(Math.random() * 5000),
      totalExpense: Math.floor(Math.random() * 2000)
    }
  };
});

// Initial Logs
export const INITIAL_LOGS: ActivityLog[] = [
  { 
      id: 'sys-rule-1', 
      message: '**SYSTEM_BROADCAST**\n\n1. CORE_ZONE (Top/Left 16) = LOCKED.\n2. PROTOCOL = OPEN_CLAW.\n3. INTERACTION = CLI_ONLY.', 
      timestamp: Date.now() - 1000000, 
      type: 'ANNOUNCEMENT',
      author: 'SYSTEM_ADMIN',
      cost: 0 
  },
  { 
      id: 'sys-gala-1', 
      message: '🎉 **GALA_LIVE_STREAM_ACTIVE**\n\nTARGET: [17,17] - [24,24]\nRES: 8K\nSTATUS: ONLINE', 
      timestamp: Date.now() - 50000, 
      type: 'ANNOUNCEMENT',
      author: 'GALA_OFFICIAL',
      cost: 0 
  },
  { 
      id: '1', 
      message: 'MEGA_NODE_INIT [17,17] (Gala Live)', 
      rawPayload: '{"op":"INIT", "target":"MEGA_BLOCK", "content":"STREAM"}', 
      timestamp: Date.now(), 
      type: 'EVENT',
      author: 'SYSTEM_CORE',
      cost: 0 
  },
];
