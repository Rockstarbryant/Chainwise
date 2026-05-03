import type { AgentResponse, ChatMessage, ExchangeFee } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || `API error: ${res.status}`);
  }

  return data;
}

// Send messages to the agent
export async function sendToAgent(messages: ChatMessage[]): Promise<AgentResponse> {
  return apiFetch<AgentResponse>('/api/agent', {
    method: 'POST',
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });
}

// Get all exchanges
export async function getExchanges(): Promise<{ success: boolean; data: ExchangeFee[] }> {
  return apiFetch('/api/fees');
}

// Get fees for a specific exchange + coin
export async function getCoinFees(exchange: string, coin: string) {
  return apiFetch(`/api/fees/${exchange}/${coin}`);
}

// Compare fees across exchanges
export async function compareExchanges(coin: string, chain?: string, amount?: number) {
  const params = new URLSearchParams({ coin });
  if (chain)  params.set('chain', chain);
  if (amount) params.set('amount', amount.toString());
  return apiFetch(`/api/fees/compare?${params}`);
}