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
  const [error, setError]               = useState<string | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [anonCount, setAnonCount]       = useState(0);

  // Tracks the last user message text so retry / edit can use it
  const lastUserTextRef = useRef<string>('');

  useEffect(() => {
    const stored = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
    setAnonCount(stored);
  }, []);

  // ── Internal fetch helper — shared by send, retry, editAndResend ──────────
  const _fetch = useCallback(async (
    text: string,
    historyForRequest: ChatMessage[],   // full history to send to API
    displayMessages: ChatMessage[],     // what to show in state after success
  ) => {
    setError(null);
    setMessages(displayMessages);
    setLoading(true);

    try {
      let result;

      if (isAuthenticated && conversationId) {
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

        // Only increment anon count on a genuine new send (not retry/edit)
        // We check by whether the last message in displayMessages is the same as
        // the last stored user message
        const storedCount = parseInt(localStorage.getItem(ANON_COUNT_KEY) || '0', 10);
        // Avoid double-counting on retry — only increment when last user text changed
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
        // Remove any previous error message before adding new one
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
    await _fetch(text, updated, updated);
  }, [messages, loading, isAuthenticated, _fetch]);

  // ── retry: resend the last user message, drop the last error/assistant msg ─
  const retry = useCallback(async () => {
    if (loading) return;

    // Find the last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    // Drop all messages after (and including) the last assistant response
    const lastUserIdx = messages.lastIndexOf(lastUserMsg);
    const trimmedHistory = messages.slice(0, lastUserIdx + 1);

    await _fetch(lastUserMsg.content, trimmedHistory, trimmedHistory);
  }, [messages, loading, _fetch]);

  // ── editAndResend: replace the last user message with edited text ──────────
  const editAndResend = useCallback(async (newText: string, messageIndex: number) => {
    if (!newText.trim() || loading) return;

    lastUserTextRef.current = newText.trim();

    // Keep everything before the edited message, replace it with the new text
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
    lastUserTextRef.current = '';
  }, []);

  // Expose last user text so MessageInput can prefill the edit textarea
  const lastUserText = lastUserTextRef.current;

  return {
    messages, loading, error,
    send, retry, editAndResend, clear,
    lastUserText,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit: ANON_LIMIT,
  };
}