/**
 * types.ts — shared frontend types for ChainWise
 *
 * Replace your existing lib/types.ts with this file.
 * Key additions:
 *   - ChatMessage.isStreaming  — true while SSE delta events are arriving
 *   - ChatMessage.feedback     — 'up' | 'down' after user rates the message
 */

// ── Chat ──────────────────────────────────────────────────────────────────

export interface ToolCall {
  tool:   string;
  input:  Record<string, unknown>;
  result: Record<string, unknown> | null;
}

export interface ChatMessage {
  role:       'user' | 'assistant';
  content:    string;
  toolsUsed?: ToolCall[];
  timestamp?: Date;
  isError?:   boolean;
  /** True while SSE delta events are streaming in — hides action buttons */
  isStreaming?: boolean;
  /** Thumbs up/down set after user rates the message */
  feedback?:   'up' | 'down';
}

// ── API response shapes ────────────────────────────────────────────────────

export interface AgentResponse {
  success: boolean;
  data: {
    message:   string;
    toolsUsed: ToolCall[];
    usage?: {
      inputTokens:  number;
      outputTokens: number;
    };
  };
}

// ── Exchange fee types ─────────────────────────────────────────────────────

export interface NetworkFee {
  chain:          string;
  chainId:        string;
  withdrawFee:    number;
  withdrawFeeUSD: number | null;
  minWithdraw:    number;
  minDeposit:     number;
  depositFee:     number;
  isActive:       boolean;
}

export interface CoinFee {
  symbol:   string;
  networks: NetworkFee[];
}

export interface ExchangeFee {
  _id:          string;
  exchange:     string;
  displayName:  string;
  website:      string;
  twitterHandle: string;
  p2p:          boolean;
  p2pMinUSD:    number;
  p2pCountries: string[];
  coins:        CoinFee[];
  lastUpdated:  string;
  dataSource:   string;
}

// ── P2P ───────────────────────────────────────────────────────────────────

export interface P2PMerchant {
  name:           string;
  completionRate: number;
  orderCount:     number;
  isVerified:     boolean;
}

export interface P2PAd {
  exchange:       string;
  price:          number;
  minAmount:      number;
  maxAmount:      number;
  available:      number;
  paymentMethods: string[];
  merchant:       P2PMerchant;
}