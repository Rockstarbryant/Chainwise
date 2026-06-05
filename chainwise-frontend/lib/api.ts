// lib/api.ts
import type { AgentResponse, ChatMessage, ExchangeFee } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error: ${res.status}`);
  return data;
}

// ── Non-streaming (kept for backwards compat) ────────────────────────────────
export async function sendToAgent(messages: ChatMessage[]): Promise<AgentResponse> {
  return apiFetch<AgentResponse>('/api/agent', {
    method: 'POST',
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });
}

// ── SSE event types ──────────────────────────────────────────────────────────
export type SseEvent =
  | { type: 'tool_start'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_end';   tool: string }
  | { type: 'text';       delta: string }
  | { type: 'done';       message: string; toolsUsed: unknown[]; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error';      message: string; errorType: string };

// ── Streaming helpers ────────────────────────────────────────────────────────

/**
 * Low-level SSE reader. Calls `onEvent` for each parsed event.
 * Returns a promise that resolves when the stream ends.
 */
async function readSseStream(
  response: Response,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by "\n\n"
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? ''; // keep the incomplete trailing part

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      try {
        const event = JSON.parse(line.slice(5).trim()) as SseEvent;
        onEvent(event);
      } catch {
        // skip malformed lines
      }
    }
  }
}

/**
 * Streams a stateless agent request (anonymous / non-conversation).
 * `onEvent` is called for each SSE event.
 */
export async function streamToAgent(
  messages: ChatMessage[],
  onEvent: (event: SseEvent) => void,
  token?: string,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${BASE}/api/agent/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: { message?: string } })?.error?.message || `API error: ${response.status}`);
  }

  await readSseStream(response, onEvent);
}

/**
 * Streams a message inside an existing conversation.
 * `onEvent` is called for each SSE event.
 */
export async function streamConversationMessage(
  conversationId: string,
  content: string,
  token: string,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const response = await fetch(`${BASE}/api/conversations/${conversationId}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: { message?: string } })?.error?.message || `API error: ${response.status}`);
  }

  await readSseStream(response, onEvent);
}

// ── Other existing endpoints (unchanged) ─────────────────────────────────────
export async function getExchanges(): Promise<{ success: boolean; data: ExchangeFee[] }> {
  return apiFetch('/api/fees');
}
export async function getCoinFees(exchange: string, coin: string) {
  return apiFetch(`/api/fees/${exchange}/${coin}`);
}
export async function compareExchanges(coin: string, chain?: string, amount?: number) {
  const params = new URLSearchParams({ coin });
  if (chain)  params.set('chain', chain);
  if (amount) params.set('amount', amount.toString());
  return apiFetch(`/api/fees/compare?${params}`);
}