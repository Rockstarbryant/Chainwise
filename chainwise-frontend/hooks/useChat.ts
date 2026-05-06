'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import type { ChatMessage } from '@/lib/types';

const ANON_LIMIT     = 5;
const ANON_COUNT_KEY = 'cw_anon_count';

export function useChat(conversationId?: string) {
  const { isAuthenticated, getToken } = useAuth();
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [loading, setLoading]           = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false); // loading existing msgs
  const [error, setError]               = useState<string | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [anonCount, setAnonCount]       = useState(0);

  // Emitted when a new conversation is auto-created so the caller can redirect
  const [createdConversationId, setCreatedConversationId] = useState<string | null>(null);

  // Tracks the last user message text so retry / edit can use it
  const lastUserTextRef = useRef<string>('');

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
    setAnonCount(stored);
  }, []);

  // ── Load existing messages when opening a saved conversation ─────────────
  // Runs whenever conversationId changes (user clicks a different chat in sidebar)
  useEffect(() => {
    if (!conversationId || !isAuthenticated) {
      // No id = new blank chat; reset messages so old chat doesn't bleed through
      setMessages([]);
      return;
    }

    let cancelled = false; // prevent stale setState if id changes mid-fetch

    const load = async () => {
      setLoadingHistory(true);
      setMessages([]); // clear previous conversation while loading
      try {
        const token = await getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${conversationId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.data.messages)) {
          setMessages(
            data.data.messages.map((m: {
              role: 'user' | 'assistant';
              content: string;
              toolsUsed?: unknown[];
              timestamp?: string;
            }) => ({
              role: m.role,
              content: m.content,
              toolsUsed: m.toolsUsed,
              timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
            }))
          );
        }
      } catch {
        // non-fatal — just show empty chat
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };

    load();

    return () => { cancelled = true; };
  // Only re-run when conversationId changes — intentionally omitting getToken
  // to avoid re-fetching on every render (getToken is stable but not memoised)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, isAuthenticated]);

  // ── Creates a new conversation on the backend and returns its id ──────────
  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json();
      if (!data.success) return null;
      return data.data._id as string;
    } catch {
      return null;
    }
  }, [getToken]);

  // ── Internal fetch helper — shared by send, retry, editAndResend ──────────
  const _fetch = useCallback(async (
    text: string,
    historyForRequest: ChatMessage[],   // full history to send to API
    displayMessages: ChatMessage[],     // what to show in state after success
    overrideConversationId?: string,    // used when we just auto-created one
  ) => {
    setError(null);
    setMessages(displayMessages);
    setLoading(true);

    try {
      let result;

      // Resolve which conversation id to use for this request
      const activeConvId = overrideConversationId ?? conversationId;

      if (isAuthenticated && activeConvId) {
        // ── Authenticated + conversation exists → persist to DB ────────────
        const token = await getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${activeConvId}/message`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content: text.trim() }),
          }
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message || 'Request failed');
        result = data.data;
      } else {
        // ── Anonymous → stateless agent ───────────────────────────────────
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/agent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: historyForRequest.map(m => ({ role: m.role, content: m.content })),
            }),
          }
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message || 'Request failed');
        result = data.data;

        // Only increment anon count on a genuine new send (not retry/edit)
        const storedCount = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
        const isNewMessage = text.trim() !== lastUserTextRef.current ||
          (displayMessages.filter(m => m.role === 'user').length >
           (messages.filter(m => m.role === 'user').length));

        if (isNewMessage) {
          const newCount = storedCount + 1;
          localStorage.setItem(ANON_COUNT_KEY, newCount.toString());
          setAnonCount(newCount);
          if (newCount >= ANON_LIMIT) {
            setTimeout(() => setShowAuthGate(true), 1500);
          }
        }
      }

      setMessages(prev => [...prev.filter(m => !m.isError), {
        role: 'assistant',
        content: result.message,
        toolsUsed: result.toolsUsed,
        timestamp: new Date(),
      }]);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setMessages(prev => {
        const withoutError = prev.filter(m => !m.isError);
        return [...withoutError, {
          role: 'assistant',
          content: `Error: ${message}`,
          timestamp: new Date(),
          isError: true,
        }];
      });
    } finally {
      setLoading(false);
    }
  }, [messages, isAuthenticated, conversationId, anonCount, getToken]);

  // ── send: normal new message ──────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // Block anonymous users who've hit the limit
    if (!isAuthenticated) {
      const count = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
      if (count >= ANON_LIMIT) {
        setShowAuthGate(true);
        return;
      }
    }

    lastUserTextRef.current = text.trim();

    const userMsg: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    const updated = [...messages, userMsg];

    // Authenticated user with no conversationId yet → auto-create then send
    if (isAuthenticated && !conversationId) {
      const newId = await createConversation();
      if (newId) {
        setCreatedConversationId(newId);
        await _fetch(text, updated, updated, newId);
      } else {
        // Fallback: couldn't create conversation, use stateless agent
        await _fetch(text, updated, updated);
      }
      return;
    }

    await _fetch(text, updated, updated);
  }, [messages, loading, isAuthenticated, conversationId, createConversation, _fetch]);

  // ── retry: resend the last user message ───────────────────────────────────
  const retry = useCallback(async () => {
    if (loading) return;

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const lastUserIdx = messages.lastIndexOf(lastUserMsg);
    const trimmedHistory = messages.slice(0, lastUserIdx + 1);

    await _fetch(lastUserMsg.content, trimmedHistory, trimmedHistory);
  }, [messages, loading, _fetch]);

  // ── editAndResend: replace a user message with edited text ────────────────
  const editAndResend = useCallback(async (newText: string, messageIndex: number) => {
    if (!newText.trim() || loading) return;

    lastUserTextRef.current = newText.trim();

    const historyUpToEdit = messages.slice(0, messageIndex);
    const editedMsg: ChatMessage = {
      role: 'user',
      content: newText.trim(),
      timestamp: new Date(),
    };
    const newHistory = [...historyUpToEdit, editedMsg];

    await _fetch(newText, newHistory, newHistory);
  }, [messages, loading, _fetch]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setCreatedConversationId(null);
    lastUserTextRef.current = '';
  }, []);

  const lastUserText = lastUserTextRef.current;

  return {
    messages, loading, loadingHistory, error,
    send, retry, editAndResend, clear,
    lastUserText,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit: ANON_LIMIT,
    createdConversationId,
  };
}