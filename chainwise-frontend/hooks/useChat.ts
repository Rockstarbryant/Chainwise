'use client';

// hooks/useChat.ts
//
// KEY FIX (was the root cause of the empty-state / suggested-prompts bug):
//
//   BEFORE (broken):
//     setCreatedConversationId(newId);       ← triggers router.replace immediately
//     await _fetch(text, updated, updated, newId);  ← saves message AFTER redirect
//
//   The redirect mounted a fresh ChatWindow which called GET /conversations/newId
//   from the DB — but the message hadn't been written yet, so it got an empty
//   array and rendered SuggestedPrompts. The _fetch completion was then discarded
//   because it landed in the already-unmounted component.
//
//   AFTER (fixed):
//     await _fetch(text, updated, updated, newId);  ← message saved first
//     setCreatedConversationId(newId);              ← THEN redirect
//
//   Now when the new ChatWindow mounts and loads the conversation from the DB,
//   the first user message + assistant reply are already persisted and render
//   correctly with no flash of the empty state.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import type { ChatMessage } from '@/lib/types';

const ANON_LIMIT     = 5;
const ANON_COUNT_KEY = 'cw_anon_count';

export function useChat(conversationId?: string) {
  const { isAuthenticated, getToken } = useAuth();
  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [loading, setLoading]               = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [showAuthGate, setShowAuthGate]     = useState(false);
  const [anonCount, setAnonCount]           = useState(0);

  // Emitted AFTER the first message is saved so the caller can safely redirect
  const [createdConversationId, setCreatedConversationId] = useState<string | null>(null);

  const lastUserTextRef = useRef<string>('');

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
    setAnonCount(stored);
  }, []);

  // ── Load existing messages when opening a saved conversation ─────────────
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
        // non-fatal — show empty chat
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, isAuthenticated]);

  // ── Creates a new conversation on the backend ─────────────────────────────
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

  // ── Internal fetch helper ─────────────────────────────────────────────────
  const _fetch = useCallback(async (
    text: string,
    historyForRequest: ChatMessage[],
    displayMessages: ChatMessage[],
    overrideConversationId?: string,
  ) => {
    setError(null);
    setMessages(displayMessages);
    setLoading(true);

    try {
      let result;
      const activeConvId = overrideConversationId ?? conversationId;

      if (isAuthenticated && activeConvId) {
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

        const storedCount = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
        const isNewMessage =
          text.trim() !== lastUserTextRef.current ||
          (displayMessages.filter(m => m.role === 'user').length >
           messages.filter(m => m.role === 'user').length);

        if (isNewMessage) {
          const newCount = storedCount + 1;
          localStorage.setItem(ANON_COUNT_KEY, newCount.toString());
          setAnonCount(newCount);
          if (newCount >= ANON_LIMIT) {
            setTimeout(() => setShowAuthGate(true), 1500);
          }
        }
      }

      setMessages(prev => [
        ...prev.filter(m => !m.isError),
        {
          role: 'assistant',
          content: result.message,
          toolsUsed: result.toolsUsed,
          timestamp: new Date(),
        },
      ]);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setMessages(prev => [
        ...prev.filter(m => !m.isError),
        {
          role: 'assistant',
          content: `Error: ${message}`,
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, isAuthenticated, conversationId, anonCount, getToken]);

  // ── send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

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

    if (isAuthenticated && !conversationId) {
      // Auto-create conversation for authenticated users on a blank /chat page.
      const newId = await createConversation();
      if (newId) {
        // ─────────────────────────────────────────────────────────────────
        // FIX: await _fetch FIRST so the message is persisted to the DB,
        // THEN set createdConversationId to trigger the redirect.
        //
        // Previously, setCreatedConversationId fired before _fetch resolved,
        // so the new ChatWindow loaded an empty conversation from the DB and
        // showed the SuggestedPrompts screen until a manual page reload.
        // ─────────────────────────────────────────────────────────────────
        await _fetch(text, updated, updated, newId);
        setCreatedConversationId(newId);
      } else {
        // Couldn't create a conversation — fall back to stateless agent
        await _fetch(text, updated, updated);
      }
      return;
    }

    await _fetch(text, updated, updated);
  }, [messages, loading, isAuthenticated, conversationId, createConversation, _fetch]);

  // ── retry ─────────────────────────────────────────────────────────────────
  const retry = useCallback(async () => {
    if (loading) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    const lastUserIdx = messages.lastIndexOf(lastUserMsg);
    const trimmedHistory = messages.slice(0, lastUserIdx + 1);
    await _fetch(lastUserMsg.content, trimmedHistory, trimmedHistory);
  }, [messages, loading, _fetch]);

  // ── editAndResend ─────────────────────────────────────────────────────────
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

  // ── clear ─────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setCreatedConversationId(null);
    lastUserTextRef.current = '';
  }, []);

  return {
    messages, loading, loadingHistory, error,
    send, retry, editAndResend, clear,
    lastUserText: lastUserTextRef.current,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit: ANON_LIMIT,
    createdConversationId,
  };
}
