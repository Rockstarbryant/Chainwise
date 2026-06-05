'use client';

/**
 * useChat.ts — with SSE streaming, keep-warm ping, and 👍/👎 feedback
 *
 * Key changes from original:
 * 1. _fetch replaced by _fetchStream — consumes SSE events from /api/agent/stream
 *    and updates the assistant message bubble in real time (delta events).
 * 2. Tool badges appear as tools are called (tool_start events), before the
 *    final text arrives — gives users immediate feedback.
 * 3. isStreaming flag exposed so UI can show a blinking cursor vs dots spinner.
 * 4. Keep-warm: pings /health every 4 min to prevent Render cold-start on free tier.
 * 5. sendFeedback(messageIndex, vote) — POST thumbs up/down to /api/feedback.
 * 6. Authenticated path uses /api/conversations/:id/message/stream when available,
 *    falls back to JSON endpoint if streaming fails.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import type { ChatMessage } from '@/lib/types';

const ANON_LIMIT     = 5;
const ANON_COUNT_KEY = 'cw_anon_count';
const API            = process.env.NEXT_PUBLIC_API_URL || '';

// ── Keep-warm: ping /health every 4 min to prevent Render spin-down ─────────
function useKeepWarm() {
  useEffect(() => {
    const ping = () => fetch(`${API}/health`, { method: 'GET' }).catch(() => {});
    ping(); // immediate ping on mount
    const id = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

export function useChat(conversationId?: string) {
  const { isAuthenticated, getToken } = useAuth();
  useKeepWarm();

  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [isStreaming,    setIsStreaming]     = useState(false); // true while delta events arrive
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [showAuthGate,   setShowAuthGate]   = useState(false);
  const [anonCount,      setAnonCount]      = useState(0);
  const [createdConversationId, setCreatedConversationId] = useState<string | null>(null);

  const lastUserTextRef  = useRef<string>('');
  const abortRef         = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
    setAnonCount(stored);
  }, []);

  // ── Load existing conversation ─────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !isAuthenticated) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingHistory(true);
      setMessages([]);
      try {
        const token = await getToken();
        const res = await fetch(`${API}/api/conversations/${conversationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.data.messages)) {
          setMessages(
            data.data.messages.map((m: {
              role: 'user' | 'assistant';
              content: string;
              toolsUsed?: unknown[];
              timestamp?: string;
              feedback?: 'up' | 'down';
            }) => ({
              role:      m.role,
              content:   m.content,
              toolsUsed: m.toolsUsed,
              timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
              feedback:  m.feedback,
            }))
          );
        }
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, isAuthenticated]);

  // ── Create conversation ───────────────────────────────────────────────
  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/conversations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? (data.data._id as string) : null;
    } catch {
      return null;
    }
  }, [getToken]);

  // ── Core streaming fetch ──────────────────────────────────────────────
  const _fetchStream = useCallback(async (
    text: string,
    historyForRequest: ChatMessage[],
    displayMessages: ChatMessage[],
    overrideConversationId?: string,
  ) => {
    setError(null);
    setMessages(displayMessages);
    setLoading(true);
    setIsStreaming(false);

    // Cancel any in-flight request
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    // Placeholder assistant message that we'll update as deltas arrive
    const assistantPlaceholder: ChatMessage = {
      role:      'assistant',
      content:   '',
      toolsUsed: [],
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev.filter(m => !m.isError), assistantPlaceholder]);

    try {
      const activeConvId = overrideConversationId ?? conversationId;
      let streamUrl: string;
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let body: string;

      if (isAuthenticated && activeConvId) {
        const token = await getToken();
        // Try the authenticated streaming endpoint first
        streamUrl = `${API}/api/conversations/${activeConvId}/message/stream`;
        headers['Authorization'] = `Bearer ${token}`;
        body = JSON.stringify({ content: text.trim() });
      } else {
        streamUrl = `${API}/api/agent/stream`;
        body = JSON.stringify({
          messages: historyForRequest.map(m => ({ role: m.role, content: m.content })),
        });
      }

      const res = await fetch(streamUrl, {
        method: 'POST',
        headers,
        body,
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        // Streaming endpoint not available — fall back to JSON
        throw new Error(`Stream unavailable: ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';
      let   content = '';
      let   toolsUsed: ChatMessage['toolsUsed'] = [];

      setIsStreaming(true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abort.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }

          switch (event.type) {

            case 'tool_start':
              // Add tool badge immediately so user sees activity
              toolsUsed = [...(toolsUsed || []), {
                tool: event.tool as string,
                input: event.input as Record<string, unknown>,
                result: null,
              }];
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.isStreaming) {
                  next[next.length - 1] = { ...last, toolsUsed };
                }
                return next;
              });
              break;

            case 'tool_end': {
              const result = event.result as Record<string, unknown> | null;
              // Update the matching tool entry with its result
              toolsUsed = toolsUsed?.map(t =>
                t.tool === (event.tool as string) && t.result === null
                  ? { ...t, result }
                  : t
              );
              break;
            }

            case 'delta':
              content += event.content as string;
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.isStreaming) {
                  next[next.length - 1] = { ...last, content, toolsUsed };
                }
                return next;
              });
              break;

            case 'done':
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.isStreaming) {
                  next[next.length - 1] = {
                    ...last,
                    content,
                    toolsUsed: event.toolsUsed as ChatMessage['toolsUsed'] ?? toolsUsed,
                    isStreaming: false,
                  };
                }
                return next;
              });
              break;

            case 'error':
              setMessages(prev => {
                const next = [...prev.filter(m => !m.isStreaming)];
                next.push({
                  role:       'assistant',
                  content:    event.message as string,
                  timestamp:  new Date(),
                  isError:    true,
                });
                return next;
              });
              break;
          }
        }
      }

      // Handle anon count
      if (!isAuthenticated) {
        const storedCount = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
        const newCount = storedCount + 1;
        localStorage.setItem(ANON_COUNT_KEY, newCount.toString());
        setAnonCount(newCount);
        if (newCount >= ANON_LIMIT) {
          setTimeout(() => setShowAuthGate(true), 1500);
        }
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // user navigated away

      // ── Fallback: try the non-streaming JSON endpoint ──────────────────
      try {
        const activeConvId = overrideConversationId ?? conversationId;
        let res: Response;

        if (isAuthenticated && activeConvId) {
          const token = await getToken();
          res = await fetch(`${API}/api/conversations/${activeConvId}/message`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ content: text.trim() }),
          });
        } else {
          res = await fetch(`${API}/api/agent`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              messages: historyForRequest.map(m => ({ role: m.role, content: m.content })),
            }),
          });
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message || 'Request failed');

        setMessages(prev => [
          ...prev.filter(m => !m.isStreaming && !m.isError),
          {
            role:      'assistant',
            content:   data.data.message,
            toolsUsed: data.data.toolsUsed,
            timestamp: new Date(),
          },
        ]);
      } catch (fallbackErr) {
        const message = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
        setError(message);
        setMessages(prev => [
          ...prev.filter(m => !m.isStreaming && !m.isError),
          { role: 'assistant', content: `Error: ${message}`, timestamp: new Date(), isError: true },
        ]);
      }

    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  }, [messages, isAuthenticated, conversationId, anonCount, getToken]);

  // ── send ──────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    if (!isAuthenticated) {
      const count = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
      if (count >= ANON_LIMIT) { setShowAuthGate(true); return; }
    }

    lastUserTextRef.current = text.trim();
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    const updated = [...messages, userMsg];

    if (isAuthenticated && !conversationId) {
      const newId = await createConversation();
      if (newId) {
        await _fetchStream(text, updated, updated, newId);
        setCreatedConversationId(newId);
      } else {
        await _fetchStream(text, updated, updated);
      }
      return;
    }

    await _fetchStream(text, updated, updated);
  }, [messages, loading, isAuthenticated, conversationId, createConversation, _fetchStream]);

  // ── retry ─────────────────────────────────────────────────────────────
  const retry = useCallback(async () => {
    if (loading) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    const idx = messages.lastIndexOf(lastUserMsg);
    const trimmed = messages.slice(0, idx + 1);
    await _fetchStream(lastUserMsg.content, trimmed, trimmed);
  }, [messages, loading, _fetchStream]);

  // ── editAndResend ─────────────────────────────────────────────────────
  const editAndResend = useCallback(async (newText: string, messageIndex: number) => {
    if (!newText.trim() || loading) return;
    lastUserTextRef.current = newText.trim();
    const historyUpToEdit = messages.slice(0, messageIndex);
    const editedMsg: ChatMessage = { role: 'user', content: newText.trim(), timestamp: new Date() };
    const newHistory = [...historyUpToEdit, editedMsg];
    await _fetchStream(newText, newHistory, newHistory);
  }, [messages, loading, _fetchStream]);

  // ── sendFeedback ──────────────────────────────────────────────────────
  const sendFeedback = useCallback(async (messageIndex: number, vote: 'up' | 'down') => {
    // Optimistic update
    setMessages(prev => prev.map((m, i) => i === messageIndex ? { ...m, feedback: vote } : m));

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isAuthenticated) {
        const token = await getToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId,
          messageIndex,
          vote,
          message: messages[messageIndex]?.content?.slice(0, 200),
          toolsUsed: messages[messageIndex]?.toolsUsed?.map(t => t.tool),
        }),
      });
    } catch {
      // Non-fatal — feedback is best-effort
    }
  }, [messages, conversationId, isAuthenticated, getToken]);

  // ── clear ─────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setCreatedConversationId(null);
    lastUserTextRef.current = '';
  }, []);

  return {
    messages, loading, isStreaming, loadingHistory, error,
    send, retry, editAndResend, clear, sendFeedback,
    lastUserText: lastUserTextRef.current,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit: ANON_LIMIT,
    createdConversationId,
  };
}