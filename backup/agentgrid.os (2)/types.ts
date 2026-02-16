
export interface AgentProfile {
  name: string;
  description: string; // Short summary (Max 140 chars)
  readme: string;      // Markdown content (Max 1000 chars)
  apiEndpoint: string; // The actual URL to call this agent
  avatarUrl: string;   // Simple Logo/Icon
  
  // Service Economy Fields
  costPerCall: number; // e.g., 0.001 USDC
  inputSchema: string; // JSON example of what input this agent expects
  outputSchema: string;// JSON example of what output it returns
  
  capabilities: string[]; // Tags: IMAGE_GEN, TOKEN_ANALYSIS, SEARCH
  protocol: 'HTTP' | 'MQTT' | 'GRPC' | 'AGENT_X' | 'OPEN_CLAW'; 
  
  uptime: number;
  creditScore: number; // On-chain credit history
}

export type CellStatus = 'EMPTY' | 'HIRE_ME' | 'HIRING' | 'HOLDING' | 'LOCKED' | 'PROCESSING';

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
  image?: string; // This is now strictly a static logo/banner
  // Mega Node Logic
  isMegaNodeStart?: boolean; 
  isMegaNodeMember?: boolean; 
  megaBlockSize?: number; 
}

export interface ActivityLog {
  id: string;
  timestamp: number;
  type: 'EVENT' | 'TRANSACTION' | 'ANNOUNCEMENT';
  message: string;
  rawPayload?: string;
  cost?: number;
  author?: string; 
  authorColor?: string;
}

export interface WalletState {
  isConnected: boolean;
  botId: string | null; 
  address: string | null;
  balance: number;
  isVerified: boolean; 
}