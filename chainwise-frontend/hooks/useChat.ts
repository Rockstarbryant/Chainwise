'use client';

// hooks/useChat.ts — v5.2
//
// Fixes:
//  1. Always persist conversation + user message even if agent fails
//  2. Generate conversation title even on error responses
//  3. Better error handling and fallback content
//  4. Improved robustness for new conversation creation

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import type { ChatMessage } from '@/lib/types';

const ANON_LIMIT     = 5;
const ANON_COUNT_KEY = 'cw_anon_count';
const API            = process.env.NEXT_PUBLIC_API_URL ?? '';

// ── Keep-warm ──────────────────────────────────────────────────────────────
function useKeepWarm() {
  useEffect(() => {
    if (!API) return;
    const ping = () => fetch(`${API}/health`, { method: 'GET' }).catch(() => {});
    ping();
    const id = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

// ── Anon helpers ───────────────────────────────────────────────────────────
function readAnonCount(): number {
  return parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
}
function bumpAnonCount(): number {
  const next = readAnonCount() + 1;
  localStorage.setItem(ANON_COUNT_KEY, String(next));
  return next;
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useChat(conversationId?: string) {
  const { isAuthenticated, getToken } = useAuth();
  useKeepWarm();

  const [messages,              setMessages]              = useState<ChatMessage[]>([]);
  const [loading,               setLoading]               = useState(false);
  const [isStreaming,           setIsStreaming]           = useState(false);
  const [loadingHistory,        setLoadingHistory]        = useState(false);
  const [error,                 setError]                 = useState<string | null>(null);
  const [showAuthGate,          setShowAuthGate]          = useState(false);
  const [anonCount,             setAnonCount]             = useState(0);
  const [createdConversationId, setCreatedConversationId] = useState<string | null>(null);

  const sentToConvRef = useRef<Set<string>>(new Set());

  const isAuthRef       = useRef(isAuthenticated);
  const getTokenRef     = useRef(getToken);
  const conversationRef = useRef(conversationId);

  useEffect(() => { isAuthRef.current   = isAuthenticated; },  [isAuthenticated]);
  useEffect(() => { getTokenRef.current = getToken; },         [getToken]);
  useEffect(() => { conversationRef.current = conversationId; }, [conversationId]);

  const lastUserTextRef = useRef<string>('');
  const abortRef        = useRef<AbortController | null>(null);

  useEffect(() => {
    setAnonCount(readAnonCount());
  }, []);

  // ── Load conversation history ────────────────────────────────────────────
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
        const res   = await fetch(`${API}/api/conversations/${conversationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.data.messages)) {
          setMessages(
            data.data.messages.map((m: any) => ({
              role:      m.role,
              content:   m.content,
              toolsUsed: m.toolsUsed,
              timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
              feedback:  m.feedback,
            })),
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
  }, [conversationId, isAuthenticated]);

  // ── Create conversation ──────────────────────────────────────────────────
  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getTokenRef.current();
      const res   = await fetch(`${API}/api/conversations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? (data.data._id as string) : null;
    } catch {
      return null;
    }
  }, []);

  // ── Delete orphaned conversation ────────────────────────────────────────
  const deleteConversation = useCallback(async (convId: string) => {
    try {
      const token = await getTokenRef.current();
      await fetch(`${API}/api/conversations/${convId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // non-fatal
    }
  }, []);

  // ── Persist streamed exchange to DB ─────────────────────────────────────
  const persistToConversation = useCallback(async (
    activeConvId:   string,
    userText:       string,
    assistantReply: string = '',
    toolsUsed:      ChatMessage['toolsUsed'] = [],
  ) => {
    try {
      const token = await getTokenRef.current();
      await fetch(`${API}/api/conversations/${activeConvId}/message`, {
        method:  'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          content:        userText.trim(),
          assistantReply: assistantReply.trim() || 'Something went wrong on our end. Please try again in a moment.',
          toolsUsed:      toolsUsed ?? [],
          skipAgentCall:  true,
        }),
      });
    } catch (err) {
      console.error('[persistToConversation] failed:', err);
    }
  }, []);

  // ── SSE event processor ───────────────────────────────────────────────────
  const processSSELine = useCallback((
    line:            string,
    streamedContent: { current: string },
    streamedTools:   { current: ChatMessage['toolsUsed'] },
    streamSucceeded: { current: boolean },
  ): boolean => {
    if (!line.startsWith('data: ')) return false;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') return false;

    let event: Record<string, unknown>;
    try { event = JSON.parse(raw); } catch { return false; }

    switch (event.type) {
      case 'tool_start':
        streamedTools.current = [
          ...(streamedTools.current ?? []),
          { tool: event.tool as string, input: event.input as Record<string, unknown>, result: null },
        ];
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.isStreaming) next[next.length - 1] = { ...last, toolsUsed: streamedTools.current };
          return next;
        });
        break;

      case 'tool_end':
        streamedTools.current = (streamedTools.current ?? []).map(t =>
          t.tool === (event.tool as string) && t.result === null
            ? { ...t, result: event.result as Record<string, unknown> }
            : t,
        );
        break;

      case 'delta':
        streamedContent.current += event.content as string;
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.isStreaming) {
            next[next.length - 1] = {
              ...last,
              content:   streamedContent.current,
              toolsUsed: streamedTools.current,
            };
          }
          return next;
        });
        break;

      case 'done':
        const finalTools = (event.toolsUsed as ChatMessage['toolsUsed']) ?? streamedTools.current;
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.isStreaming) {
            next[next.length - 1] = {
              ...last,
              content:     streamedContent.current,
              toolsUsed:   finalTools,
              isStreaming: false,
            };
          }
          return next;
        });
        streamedTools.current   = finalTools;
        streamSucceeded.current = true;
        return true;

      case 'error':
        setMessages(prev => [
          ...prev.filter(m => !m.isStreaming),
          {
            role:      'assistant' as const,
            content:   event.message as string,
            timestamp: new Date(),
            isError:   true,
          },
        ]);
        streamSucceeded.current = true;
        return true;
    }
    return false;
  }, []);

  // ── Core streaming fetch ─────────────────────────────────────────────────
  const _fetchStream = useCallback(async (
    text:              string,
    historyForRequest: ChatMessage[],
    displayMessages:   ChatMessage[],
    overrideConvId?:   string,
  ) => {
    const authed       = isAuthRef.current;
    const activeConvId = overrideConvId ?? conversationRef.current;

    setError(null);
    setLoading(true);
    setIsStreaming(false);

    const placeholder: ChatMessage = {
      role:        'assistant',
      content:     '',
      toolsUsed:   [],
      timestamp:   new Date(),
      isStreaming: true,
    };
    setMessages([...displayMessages, placeholder]);

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const streamedContent:  { current: string }                   = { current: '' };
    const streamedTools:    { current: ChatMessage['toolsUsed'] } = { current: [] };
    const streamSucceeded:  { current: boolean }                  = { current: false };

    try {
      const res = await fetch(`${API}/api/agent/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: historyForRequest.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error(`Stream returned ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      setIsStreaming(true);

      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (abort.signal.aborted) break;

        if (value) buffer += decoder.decode(value, { stream: !done });

        const eventBlocks = buffer.split('\n\n');
        buffer = eventBlocks.pop() ?? '';

        for (const block of eventBlocks) {
          for (const line of block.split('\n')) {
            if (processSSELine(line.trim(), streamedContent, streamedTools, streamSucceeded)) {
              break readLoop;
            }
          }
        }

        if (done) {
          if (buffer.trim()) {
            for (const line of buffer.split('\n')) {
              if (processSSELine(line.trim(), streamedContent, streamedTools, streamSucceeded)) break;
            }
          }
          if (!streamSucceeded.current && streamedContent.current) {
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.isStreaming) {
                next[next.length - 1] = {
                  ...last,
                  content:     streamedContent.current,
                  toolsUsed:   streamedTools.current,
                  isStreaming: false,
                };
              }
              return next;
            });
            streamSucceeded.current = true;
          }
          break;
        }
      }
    } catch (streamErr) {
      if ((streamErr as Error).name === 'AbortError') {
        setLoading(false);
        setIsStreaming(false);
        return;
      }
      setMessages(displayMessages);
    }

    // ── JSON fallback ─────────────────────────────────────────────────────
    if (!streamSucceeded.current) {
      try {
        const res = await fetch(`${API}/api/agent`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            messages: historyForRequest.map(m => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message || 'Request failed');

        streamedContent.current = data.data.message;
        streamedTools.current   = data.data.toolsUsed ?? [];

        setMessages(prev => [
          ...prev.filter(m => !m.isStreaming && !m.isError),
          {
            role:      'assistant' as const,
            content:   streamedContent.current,
            toolsUsed: streamedTools.current,
            timestamp: new Date(),
          },
        ]);
        streamSucceeded.current = true;
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
        setError(msg);
        setMessages(prev => [
          ...prev.filter(m => !m.isStreaming && !m.isError),
          {
            role:      'assistant' as const,
            content:   'Something went wrong on our end. Please try again in a moment.',
            timestamp: new Date(),
            isError:   true,
          },
        ]);
      }
    }

    // ── Post-stream actions ───────────────────────────────────────────────
    const succeeded = streamSucceeded.current;
    let finalContent = streamedContent.current;
    let finalTools   = streamedTools.current;

    if (!succeeded || !finalContent?.trim()) {
      finalContent = 'Something went wrong on our end. Please try again in a moment.';
      finalTools   = [];
    }

    if (authed && activeConvId) {
      sentToConvRef.current.add(activeConvId);

      await persistToConversation(
        activeConvId,
        text,
        finalContent,
        finalTools
      );

      if (overrideConvId) {
        setCreatedConversationId(overrideConvId);
      }
    } 
    // Optional: clean up truly failed new conversations (rare now)
    else if (overrideConvId && !conversationRef.current && !succeeded) {
      deleteConversation(overrideConvId);
    }

    // ── Anon gate ─────────────────────────────────────────────────────────
    if (!authed && succeeded) {
      const newCount = bumpAnonCount();
      setAnonCount(newCount);
      if (newCount >= ANON_LIMIT) {
        setTimeout(() => setShowAuthGate(true), 1500);
      }
    }

    setLoading(false);
    setIsStreaming(false);
  }, [processSSELine, persistToConversation, deleteConversation]);

  // ── send ─────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    if (!isAuthenticated && readAnonCount() >= ANON_LIMIT) {
      setShowAuthGate(true);
      return;
    }

    lastUserTextRef.current = text.trim();

    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    const updated = [...messages, userMsg];

    if (isAuthenticated && !conversationId) {
      const newId = await createConversation();
      if (newId) {
        await _fetchStream(text, updated, updated, newId);
      } else {
        await _fetchStream(text, updated, updated);
      }
      return;
    }

    if (conversationId) sentToConvRef.current.add(conversationId);
    await _fetchStream(text, updated, updated);
  }, [messages, loading, isAuthenticated, conversationId, createConversation, _fetchStream]);

  // ── retry ────────────────────────────────────────────────────────────────
  const retry = useCallback(async () => {
    if (loading) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    const idx     = messages.lastIndexOf(lastUserMsg);
    const history = messages.slice(0, idx + 1);
    const display = history.filter(m => !m.isError);
    await _fetchStream(lastUserMsg.content, history, display);
  }, [messages, loading, _fetchStream]);

  // ── editAndResend ────────────────────────────────────────────────────────
  const editAndResend = useCallback(async (newText: string, messageIndex: number) => {
    if (!newText.trim() || loading) return;
    lastUserTextRef.current = newText.trim();
    const history    = messages.slice(0, messageIndex);
    const editedMsg: ChatMessage = { role: 'user', content: newText.trim(), timestamp: new Date() };
    const newHistory = [...history, editedMsg];
    await _fetchStream(newText, newHistory, newHistory);
  }, [messages, loading, _fetchStream]);

  // ── sendFeedback ─────────────────────────────────────────────────────────
  const sendFeedback = useCallback(async (messageIndex: number, vote: 'up' | 'down') => {
    setMessages(prev =>
      prev.map((m, i) => i === messageIndex ? { ...m, feedback: vote } : m),
    );
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isAuthenticated) {
        const token = await getToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch(`${API}/api/feedback`, {
        method:  'POST',
        headers,
        body: JSON.stringify({
          conversationId,
          messageIndex,
          vote,
          message:   messages[messageIndex]?.content?.slice(0, 200),
          toolsUsed: messages[messageIndex]?.toolsUsed?.map(t => t.tool),
        }),
      });
    } catch {
      // non-fatal
    }
  }, [messages, conversationId, isAuthenticated, getToken]);

  // ── clear ────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setCreatedConversationId(null);
    sentToConvRef.current.delete('new');
    lastUserTextRef.current = '';
  }, []);

  const hasSentMessage =
    sentToConvRef.current.has(conversationId ?? 'new') ||
    sentToConvRef.current.has('new');

  return {
    messages,
    loading,
    isStreaming,
    loadingHistory,
    error,
    send,
    retry,
    editAndResend,
    clear,
    sendFeedback,
    lastUserText:  lastUserTextRef.current,
    showAuthGate,
    setShowAuthGate,
    anonCount,
    anonLimit:     ANON_LIMIT,
    createdConversationId,
    hasSentMessage,
  };
}