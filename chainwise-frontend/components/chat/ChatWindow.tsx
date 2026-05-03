'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
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
  const { messages, loading, send, clear, showAuthGate, setShowAuthGate, anonCount, anonLimit } = useChat(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="flex flex-col h-full relative">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-brand-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-green animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
          <span className="font-mono text-xs text-brand-muted tracking-widest">AGENT ONLINE</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Anon usage counter */}
          {!isAuthenticated && (
            <span className="font-mono text-[10px] text-brand-muted">
              {anonLimit - anonCount} free {anonLimit - anonCount === 1 ? 'chat' : 'chats'} left
            </span>
          )}
          {/* New chat */}
          <button
            onClick={() => { clear(); onNewConversation?.(); }}
            className="flex items-center gap-1.5 font-mono text-[10px] text-brand-muted hover:text-brand-green transition-colors tracking-widest"
          >
            <Plus className="w-3 h-3" />
            NEW CHAT
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && <SuggestedPrompts onSelect={send} />}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
              >
                <Message message={msg} />
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              className="flex gap-3 items-start"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-green to-brand-blue flex items-center justify-center text-sm text-black flex-shrink-0 shadow-[0_0_12px_rgba(0,255,136,0.35)]">
                ⚡
              </div>
              <div className="bg-brand-surface border border-brand-border rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center h-5">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse-dot"
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

      <MessageInput onSend={send} loading={loading} />

      {/* Auth gate overlay */}
      <AnimatePresence>
        {showAuthGate && (
          <AuthGate onClose={() => setShowAuthGate(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}