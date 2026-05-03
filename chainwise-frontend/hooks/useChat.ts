'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import type { ChatMessage } from '@/lib/types';

const ANON_LIMIT = 5;
const ANON_COUNT_KEY = 'cw_anon_count';

export function useChat(conversationId?: string) {
  const { isAuthenticated, getToken } = useAuth();
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [anonCount, setAnonCount]   = useState(0);

  // Load anon count on mount
  useEffect(() => {
    const stored = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
    setAnonCount(stored);
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // Auth gate check for anonymous users
    if (!isAuthenticated) {
      const count = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
      if (count >= ANON_LIMIT) {
        setShowAuthGate(true);
        return;
      }
    }

    setError(null);
    const userMsg: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      let result;

      if (isAuthenticated && conversationId) {
        // Authenticated: use conversation endpoint (persists history)
        const token = await getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${conversationId}/message`,
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
        if (!data.success) throw new Error(data.error?.message);
        result = data.data;
      } else {
        // Anonymous: use stateless agent endpoint
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/agent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
            }),
          }
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        result = data.data;

        // Increment anon count
        const newCount = anonCount + 1;
        localStorage.setItem(ANON_COUNT_KEY, newCount.toString());
        setAnonCount(newCount);

        // Show gate after this message if limit reached
        if (newCount >= ANON_LIMIT) {
          setTimeout(() => setShowAuthGate(true), 1500);
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.message,
        toolsUsed: result.toolsUsed,
        timestamp: new Date(),
      }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${message}`,
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, isAuthenticated, conversationId, anonCount, getToken]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages, loading, error,
    send, clear,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit: ANON_LIMIT,
  };
}