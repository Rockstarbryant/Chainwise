'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bot } from 'lucide-react';
import Message from './Message';
import SuggestedPrompts from './SuggestedPrompts';
import MessageInput from './MessageInput';
import AuthGate from '@/components/auth/AuthGate';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  conversationId?: string;
  onNewConversation?: () => void;
}

export default function ChatWindow({ conversationId, onNewConversation }: Props) {
  const { isAuthenticated } = useAuth();
  const {
    messages, loading,
    send, retry, editAndResend, clear,
    showAuthGate, setShowAuthGate,
    anonCount, anonLimit,
  } = useChat(conversationId);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Edit state — tracks which message is being edited and its current text
  const [editIndex, setEditIndex]   = useState<number | null>(null);
  const [editPrefill, setEditPrefill] = useState<string | undefined>(undefined);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
      // editAndResend replaces message at editIndex with new text
      editAndResend(text, editIndex);
      setEditIndex(null);
      setEditPrefill(undefined);
    } else {
      send(text);
    }
  };

  const handleNewChat = () => {
    handleCancelEdit();
    clear();
    onNewConversation?.();
  };

  // Determine which message index is the last assistant message (for retry button)
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
          {messages.length === 0 && <SuggestedPrompts onSelect={send} />}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
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
        loading={loading}
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