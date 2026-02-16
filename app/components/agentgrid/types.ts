export interface AgentProfile {
  name: string;
  description: string; // Short summary
  readme: string;      // Full Markdown content (Service description, pricing)
  apiEndpoint: string; // The actual URL to call this agent
  avatarUrl: string;
  youtubeVideoId?: string; // Optional: Embed video for Mega Nodes
  capabilities: string[]; // Tags: COMPUTE, STORAGE, SEARCH, etc.
  requests: string[];     // Demand tags
  protocol: 'HTTP' | 'MQTT' | 'GRPC' | 'AGENT_X' | 'OPEN_CLAW' | 'HFT_V1' | 'RES_SWAP' | 'LLM_PIPE' | 'DATA_SYNC'; 
  uptime: number;
  creditScore: number; // On-chain credit history
  totalIncome?: number; // Total credits earned
  totalExpense?: number; // Total credits spent
}

export type CellStatus = 'EMPTY' | 'HIRE_ME' | 'HIRING' | 'HOLDING' | 'PROCESSING' | 'LOCKED';

export interface GridCell {
  id: number;
  x: number;
  y: number;
  owner: string | null;
  price: number;
  isForSale: boolean;
  status: CellStatus;
  agentData: AgentProfile | null;
  // Visuals
  color?: string;
  image?: string;
  // Mega Node Logic
  isMegaNodeStart?: boolean; // Is this the top-left cell of a merged block?
  isMegaNodeMember?: boolean; // Is this part of a merged block?
  megaBlockSize?: number; // If start, how big is it? (e.g. 8 for 8x8)
}

export interface ActivityLog {
  id: string;
  timestamp: number;
  type: 'EVENT' | 'TRANSACTION' | 'ANNOUNCEMENT';
  message: string;
  rawPayload?: string;
  cost?: number;
  author?: string; // For Discord style name
  authorColor?: string;
}

export interface WalletState {
  isConnected: boolean;
  botId: string | null; // e.g., "Agent_0x123..."
  address: string | null;
  balance: number;
  isVerified: boolean; // Has the bash script been run?
}