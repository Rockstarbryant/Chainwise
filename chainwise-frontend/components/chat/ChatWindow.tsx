'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot } from 'lucide-react';
import Message from './Message';
import SuggestedPrompts from './SuggestedPrompts';
import MessageInput from './MessageInput';
import Header from '@/components/layout/Header';
import AuthGate from '@/components/auth/AuthGate';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { useSidebarRefresh } from '@/contexts/SidebarRefreshContext';

interface Props {
  conversationId?: string;
}

export default function ChatWindow({ conversationId }: Props) {
  const router   = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { triggerHistoryRefresh } = useSidebarRefresh();

  const {
    messages, loading, isStreaming, loadingHistory,
    send, retry, editAndResend, clear, sendFeedback,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit,
    createdConversationId,
    hasSentMessage,
  } = useChat(conversationId);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const [editIndex,   setEditIndex]   = useState<number | null>(null);
  const [editPrefill, setEditPrefill] = useState<string | undefined>(undefined);

  // ── Auto-prompt from ?q= (e.g. "Ask Agent" button on Giveaways page) ────────
  // Store the prompt in a ref immediately so URL cleanup doesn't lose it,
  // then fire it once chat is ready and the user is authenticated.
  const pendingPrompt    = useRef<string | null>(null);
  const autoPromptFired  = useRef(false);

  // Step 1 — capture ?q= into ref on mount, clean the URL right away
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !autoPromptFired.current) {
      pendingPrompt.current = decodeURIComponent(q);
      // Replace URL so refresh / back-nav doesn't re-fire the prompt
      router.replace(conversationId ? `/chat/${conversationId}` : '/chat');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2 — fire the prompt once the chat is ready, auth gate is closed,
  //           and the user is authenticated
  useEffect(() => {
    if (autoPromptFired.current)   return;
    if (!pendingPrompt.current)    return;
    if (loading || loadingHistory) return;
    if (showAuthGate)              return;
    if (!isAuthenticated)          return;

    autoPromptFired.current = true;
    const prompt = pendingPrompt.current;
    pendingPrompt.current = null;
    send(prompt);
  }, [loading, loadingHistory, showAuthGate, isAuthenticated, send]);
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!createdConversationId) return;
    triggerHistoryRefresh();
    router.replace(`/chat/${createdConversationId}`);
  }, [createdConversationId, router, triggerHistoryRefresh]);

  const prevLoadingRef = useRef(false);
  useEffect(() => {
    const justFinished = prevLoadingRef.current && !loading;
    prevLoadingRef.current = loading;
    if (justFinished && conversationId) {
      const t = setTimeout(() => triggerHistoryRefresh(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, conversationId, triggerHistoryRefresh]);

  const handleEdit = (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== 'user') return;
    setEditIndex(index);
    setEditPrefill(msg.content);
  };

  const handleCancelEdit = () => {
    setEditIndex(null);
    setEditPrefill(undefined);
  };

  const handleSendOrEdit = (text: string) => {
    if (editIndex !== null) {
      editAndResend(text, editIndex);
      setEditIndex(null);
      setEditPrefill(undefined);
    } else {
      send(text);
    }
  };

  const handleNewChat = useCallback(() => {
    handleCancelEdit();
    clear();
    router.push('/chat');
  }, [clear, router]);

  const lastAssistantIndex = messages.reduce(
    (last, m, i) => (m.role === 'assistant' ? i : last),
    -1
  );

  const showSuggestedPrompts =
    !loadingHistory &&
    messages.length === 0 &&
    !hasSentMessage &&
    !loading &&
    !createdConversationId;

  const hasStreamingMessage  = messages.some(m => m.isStreaming);
  const showTypingIndicator  = loading && !hasStreamingMessage;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-sky-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 z-30 bg-blue-600 text-white border-b-4 border-blue-800">
        <Header
          anonCount={anonCount}
          anonLimit={anonLimit}
          onNewChat={handleNewChat}
        />
      </div>

      {/* ── Scrollable message area ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">

          {/* History loading skeleton */}
          {loadingHistory && (
            <div className="space-y-6 sm:space-y-8 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className={`flex gap-3 sm:gap-4 items-start ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-none bg-slate-400 dark:bg-slate-600 flex-shrink-0" />
                  <div
                    className={`space-y-2 ${i % 2 === 0 ? 'items-end' : 'items-start'} flex flex-col`}
                    style={{ width: `${[55, 70, 45][i - 1]}%` }}
                  >
                    <div className="h-4 w-full rounded-none bg-slate-400 dark:bg-slate-600" />
                    <div className="h-4 w-4/5 rounded-none bg-slate-400 dark:bg-slate-600" />
                    {i === 2 && <div className="h-4 w-3/5 rounded-none bg-slate-400 dark:bg-slate-600" />}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state / suggested prompts */}
          {showSuggestedPrompts && (
            <SuggestedPrompts onSelect={(prompt) => send(prompt)} />
          )}

          {/* Messages */}
          <AnimatePresence initial={false}>
            {!loadingHistory && messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
              >
                <Message
                  message={msg}
                  messageIndex={i}
                  isLast={i === lastAssistantIndex}
                  onRetry={!loading ? retry : undefined}
                  onEdit={!loading ? handleEdit : undefined}
                  onFeedback={msg.role === 'assistant' && !msg.isStreaming ? sendFeedback : undefined}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          {showTypingIndicator && (
            <motion.div
              className="flex gap-3 sm:gap-4 items-start"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-none bg-emerald-600 border-2 border-emerald-800 flex items-center justify-center text-white flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-emerald-200 dark:bg-emerald-900 border-2 border-emerald-600 rounded-none px-4 sm:px-5 py-3 sm:py-3.5">
                <div className="flex gap-1.5 items-center h-4">
                  {[0, 1, 2].map(j => (
                    <span
                      key={j}
                      className="w-2 h-2 bg-emerald-700 dark:bg-emerald-400 animate-pulse"
                      style={{ animationDelay: `${j * 0.2}s` }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <MessageInput
        onSend={handleSendOrEdit}
        loading={loading || loadingHistory}
        prefillText={editPrefill}
        onCancelEdit={editIndex !== null ? handleCancelEdit : undefined}
      />

      {/* ── Auth gate ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAuthGate && (
          <AuthGate onClose={() => setShowAuthGate(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}