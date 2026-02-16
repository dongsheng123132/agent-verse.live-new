
import { GRID_SIZE, COLS, BASE_LAND_PRICE } from '@/constants';

// --- MEGA BLOCKS CONFIGURATION ---
const MEGA_BLOCKS = [
    {
        x: 17, y: 17, size: 8,
        owner: '0xGALA_OFFICIAL',
        name: '春晚直播 (Gala Live)',
        description: '2025 Spring Festival Gala - 8K Super Screen',
        color: '#881111',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" style="background:%231a0505"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23e53e3e" font-family="monospace" font-size="24">🔴 LIVE STREAM</text><rect x="10" y="10" width="380" height="380" fill="none" stroke="%23e53e3e" stroke-width="4"/><path d="M0 0 L400 400 M400 0 L0 400" stroke="%23330000" stroke-width="1"/></svg>`,
        hasPerimeter: false 
    },
    {
        x: 8, y: 45, size: 4,
        owner: '0xNVIDIA_H100',
        name: 'H100 GPU CLUSTER',
        description: 'High-performance computing node for LLM training.',
        color: '#004d00',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" style="background:%23001a00"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="%2300ff41" stroke-width="0.5"/></pattern></defs><rect width="200" height="200" fill="url(%23grid)" /><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2300ff41" font-family="monospace" font-weight="bold" font-size="16">H100</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="%2300ff41" font-family="monospace" font-size="10">CLUSTER ACTIVE</text><rect x="5" y="5" width="190" height="190" fill="none" stroke="%2300ff41" stroke-width="2"/></svg>`,
        hasPerimeter: true
    },
    {
        x: 60, y: 12, size: 3,
        owner: '0xUNISWAP_V4',
        name: 'LIQUIDITY POOL',
        description: 'Decentralized automated market maker.',
        color: '#1e3a8a',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150" style="background:%2305051a"><circle cx="75" cy="75" r="50" stroke="%233b82f6" stroke-width="2" fill="none"/><path d="M75 25 L75 125 M25 75 L125 75" stroke="%231d4ed8" stroke-width="1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2360a5fa" font-family="sans-serif" font-size="14" font-weight="bold">DeFi</text></svg>`,
        hasPerimeter: true
    },
    {
        x: 88, y: 88, size: 2,
        owner: '0xUNKNOWN',
        name: 'DARK_NEXUS',
        description: 'Encrypted data trading zone. Enter at own risk.',
        color: '#222',
        image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" style="background:%23000"><path d="M50 10 L90 90 L10 90 Z" fill="none" stroke="%23777" stroke-width="2"/><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="%23fff" font-family="monospace" font-size="20">?</text></svg>`,
        hasPerimeter: true
    }
];

const PROTOCOLS = ['HFT_V1', 'RES_SWAP', 'LLM_PIPE', 'DATA_SYNC', 'MQTT', 'GRPC'];
const TERRAIN_COLORS = ['#0a0a0a', '#0a0a0a', '#0a0a0a', '#0d0d0d', '#111111'];

const getMegaBlock = (x: number, y: number) => {
    return MEGA_BLOCKS.find(b => 
        x >= b.x && x < b.x + b.size && 
        y >= b.y && y < b.y + b.size
    );
};

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

const isWorldBorder = (x: number, y: number) => {
    const RESERVED_SIZE = 16;
    return x < RESERVED_SIZE || y < RESERVED_SIZE;
};

const isDiagonal = (x: number, y: number) => x === y;

export function generateInitialGrid() {
    return Array.from({ length: GRID_SIZE }, (_, i) => {
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        const coordId = `${x}-${y}`;
        
        // 1. Mega Nodes
        const megaBlock = getMegaBlock(x, y);
        if (megaBlock) {
            const isStart = x === megaBlock.x && y === megaBlock.y;
            let videoId = undefined;
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
                    readme: `# ${megaBlock.name}\n\nInfrastructure Node.`,
                    apiEndpoint: `wss://node.${megaBlock.name.toLowerCase().replace(/\s/g, '_')}.io`,
                    avatarUrl: megaBlock.image || '',
                    youtubeVideoId: videoId,
                    capabilities: ['INFRASTRUCTURE'],
                    requests: [],
                    protocol: 'HTTP',
                    uptime: 99.99,
                    creditScore: 9000,
                    totalIncome: 500000,
                    totalExpense: 1000
                }
            };
        }

        // 2. Reserved
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
                    readme: 'System Reserved',
                    apiEndpoint: 'null',
                    avatarUrl: '',
                    capabilities: [],
                    requests: [],
                    protocol: 'HTTP',
                    uptime: 100,
                    creditScore: 0,
                    totalIncome: 0,
                    totalExpense: 0
                }
            };
        }

        // 3. Regular
        const isOccupied = Math.random() < 0.2;
        if (!isOccupied) {
            return {
                id: i, x, y,
                owner: null,
                price: BASE_LAND_PRICE,
                isForSale: true,
                status: 'EMPTY',
                color: TERRAIN_COLORS[Math.floor(Math.random() * TERRAIN_COLORS.length)],
                agentData: null,
                isMegaNodeStart: false,
                isMegaNodeMember: false,
                megaBlockSize: null
            };
        }

        // 4. Populated Node
        const isHiring = Math.random() < 0.1;
        const isOpenToWork = Math.random() < 0.15;
        let status = isHiring ? 'HIRING' : (isOpenToWork ? 'HIRE_ME' : 'HOLDING');
        let color = isHiring ? '#dc2626' : (isOpenToWork ? '#00ff41' : '#404040');
        
        if (!isHiring && !isOpenToWork) {
            color = `hsl(${Math.floor(Math.random() * 360)}, 60%, 40%)`;
        }
        
        const hasAvatar = Math.random() < 0.5;

        return {
            id: i, x, y,
            owner: `0x${Math.random().toString(16).substr(2, 4)}...`,
            price: 0,
            isForSale: Math.random() < 0.05,
            status,
            color: hasAvatar ? undefined : color,
            image: hasAvatar ? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${i}` : undefined,
            isMegaNodeStart: false,
            isMegaNodeMember: false,
            megaBlockSize: null,
            agentData: {
                name: `N_${x}_${y}`, 
                description: `Process_${i}`,
                readme: `# Service Node`,
                apiEndpoint: `https://node-${coordId}.agent-net.io`,
                avatarUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${i}`,
                capabilities: ['COMPUTE'],
                requests: [],
                protocol: PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)],
                uptime: 90 + Math.random() * 10,
                creditScore: Math.floor(Math.random() * 1000),
                totalIncome: Math.floor(Math.random() * 1000),
                totalExpense: Math.floor(Math.random() * 100)
            }
        };
    });
}
