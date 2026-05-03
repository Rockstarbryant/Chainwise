export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: ToolCall[];
  timestamp?: Date;
  isError?: boolean;
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
}

export interface AgentResponse {
  success: boolean;
  data?: {
    message: string;
    toolsUsed: ToolCall[];
    usage: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  error?: { message: string };
}

export interface ExchangeFee {
  exchange: string;
  displayName: string;
  website: string;
  twitterHandle: string;
  p2p: boolean;
  p2pMinUSD: number | null;
  p2pCountries: string[];
  lastUpdated: string;
  coins: CoinFee[];
}

export interface CoinFee {
  symbol: string;
  networks: NetworkFee[];
}

export interface NetworkFee {
  chain: string;
  chainId: string;
  withdrawFee: number;
  withdrawFeeUSD: number;
  minWithdraw: number;
  depositFee: number;
  minDeposit: number;
  arrivalMins: number;
  isActive: boolean;
}