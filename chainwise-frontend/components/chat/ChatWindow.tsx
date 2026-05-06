'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bot } from 'lucide-react';
import Message from './Message';
import SuggestedPrompts from './SuggestedPrompts';
import MessageInput from './MessageInput';
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
    messages, loading, loadingHistory,
    send, retry, editAndResend, clear,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit,
    createdConversationId,
  } = useChat(conversationId);

  const bottomRef = useRef<HTMLDivElement>(null);

  const [editIndex, setEditIndex]     = useState<number | null>(null);
  const [editPrefill, setEditPrefill] = useState<string | undefined>(undefined);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── When useChat auto-creates a conversation, redirect to its URL ──────────
  useEffect(() => {
    if (!createdConversationId) return;
    triggerHistoryRefresh();
    router.replace(`/chat/${createdConversationId}`);
  }, [createdConversationId, router, triggerHistoryRefresh]);

  // ── Bug 1 fix: refresh sidebar after agent responds so the auto-generated
  //    title (written by the backend pre-save hook) appears in the list ──────
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    const justFinished = prevLoadingRef.current && !loading;
    prevLoadingRef.current = loading;
    if (justFinished && conversationId) {
      // 400 ms grace period — backend pre-save runs synchronously but we
      // want to ensure the document is fully committed before we re-fetch
      const t = setTimeout(() => triggerHistoryRefresh(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, conversationId, triggerHistoryRefresh]);

  // ── Handlers ──────────────────────────────────────────────────────────────

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

  // ── Bug 2 fix: navigate to /chat so conversationId becomes undefined ──────
  // Previously clear() only wiped local state but the URL stayed at
  // /chat/[id], so the next message still went to the old conversation.
  const handleNewChat = useCallback(() => {
    handleCancelEdit();
    clear();
    router.push('/chat');
  }, [clear, router]);

  const lastAssistantIndex = messages.reduce(
    (last, m, i) => (m.role === 'assistant' ? i : last),
    -1
  );

  return (
    <div className="flex flex-col h-full relative bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500 animate-pulse" />
          <span className="font-sans text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase">
            Agent Online
          </span>
        </div>
        <div className="flex items-center gap-4">
          {!isAuthenticated && (
            <span className="font-sans text-xs text-zinc-500 dark:text-zinc-400">
              {anonLimit - anonCount} free {anonLimit - anonCount === 1 ? 'chat' : 'chats'} left
            </span>
          )}
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 font-sans text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors uppercase tracking-wide"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* History loading skeleton */}
          {loadingHistory && (
            <div className="space-y-8 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className={`flex gap-4 items-start ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex-shrink-0" />
                  <div className={`space-y-2 ${i % 2 === 0 ? 'items-end' : 'items-start'} flex flex-col`} style={{ width: `${[55, 70, 45][i - 1]}%` }}>
                    <div className="h-4 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-4 w-4/5 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                    {i === 2 && <div className="h-4 w-3/5 rounded-lg bg-zinc-200 dark:bg-zinc-800" />}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingHistory && messages.length === 0 && <SuggestedPrompts onSelect={send} />}

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
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              className="flex gap-4 items-start"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-sm px-5 py-3.5">
                <div className="flex gap-1.5 items-center h-4">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <MessageInput
        onSend={handleSendOrEdit}
        loading={loading || loadingHistory}
        prefillText={editPrefill}
        onCancelEdit={editIndex !== null ? handleCancelEdit : undefined}
      />

      <AnimatePresence>
        {showAuthGate && (
          <AuthGate onClose={() => setShowAuthGate(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}