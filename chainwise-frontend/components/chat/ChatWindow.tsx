'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { triggerHistoryRefresh } = useSidebarRefresh();

  const {
    messages, loading, isStreaming, loadingHistory,
    send, retry, editAndResend, clear, sendFeedback,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit,
    createdConversationId,
    hasSentMessage,           // ← now comes from hook (ref-backed, survives remounts)
  } = useChat(conversationId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const [editIndex,   setEditIndex]   = useState<number | null>(null);
  const [editPrefill, setEditPrefill] = useState<string | undefined>(undefined);

  /* ── Auto-scroll ─────────────────────────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /* ── Redirect after stream succeeds on a new conversation ────────────── */
  useEffect(() => {
    if (!createdConversationId) return;
    triggerHistoryRefresh();
    router.replace(`/chat/${createdConversationId}`);
  }, [createdConversationId, router, triggerHistoryRefresh]);

  /* ── Refresh sidebar after agent responds ─────────────────────────────── */
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    const justFinished = prevLoadingRef.current && !loading;
    prevLoadingRef.current = loading;
    if (justFinished && conversationId) {
      const t = setTimeout(() => triggerHistoryRefresh(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, conversationId, triggerHistoryRefresh]);

  /* ── Handlers ────────────────────────────────────────────────────────── */
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

  // Hide suggested prompts if:
  // - history is loading
  // - we have messages
  // - user has already sent a message in this session (ref survives redirect)
  // - still loading a response
  // - we just created a conv and are about to redirect
  const showSuggestedPrompts =
    !loadingHistory &&
    messages.length === 0 &&
    !hasSentMessage &&
    !loading &&
    !createdConversationId;

  const hasStreamingMessage = messages.some(m => m.isStreaming);
  const showTypingIndicator = loading && !hasStreamingMessage;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 z-30">
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
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex-shrink-0" />
                  <div
                    className={`space-y-2 ${i % 2 === 0 ? 'items-end' : 'items-start'} flex flex-col`}
                    style={{ width: `${[55, 70, 45][i - 1]}%` }}
                  >
                    <div className="h-3.5 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3.5 w-4/5 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                    {i === 2 && <div className="h-3.5 w-3/5 rounded-lg bg-zinc-200 dark:bg-zinc-800" />}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {showSuggestedPrompts && (
            <SuggestedPrompts onSelect={(prompt) => {
              send(prompt);
            }} />
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
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 flex-shrink-0">
                <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-sm px-4 sm:px-5 py-3 sm:py-3.5">
                <div className="flex gap-1.5 items-center h-4">
                  {[0, 1, 2].map(j => (
                    <span
                      key={j}
                      className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse"
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