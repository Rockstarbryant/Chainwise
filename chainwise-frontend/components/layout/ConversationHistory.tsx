'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Trash2, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Conversation {
  _id: string;
  title: string;
  messageCount: number;
  lastActive: string;
}

interface Props {
  onNewChat: () => void;
  refreshTrigger?: number; // increment this from the parent to force a reload
}

export default function ConversationHistory({ onNewChat, refreshTrigger }: Props) {
  const { isAuthenticated, getToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const pathname = usePathname();

  const loadConversations = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success) setConversations(data.data);
    } catch {}
  }, [getToken]);

  // Load on mount / auth change
  useEffect(() => {
    if (!isAuthenticated) return;
    loadConversations();
  }, [isAuthenticated, loadConversations]);

  // Reload whenever the parent signals a new conversation was created or title updated.
  // Use a small delay so the backend pre-save hook (which writes the title) has
  // fully committed the document before we re-fetch the list.
  useEffect(() => {
    if (!isAuthenticated || refreshTrigger === undefined || refreshTrigger === 0) return;
    const t = setTimeout(() => loadConversations(), 300);
    return () => clearTimeout(t);
  }, [refreshTrigger, isAuthenticated, loadConversations]);

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const token = await getToken();
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      setConversations(prev => prev.filter(c => c._id !== id));
    } catch {}
  };

  if (!isAuthenticated) {
    return (
      <div className="px-3 py-4">
        <p className="font-sans text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase px-2 mb-2">HISTORY</p>
        <p className="font-sans text-sm text-zinc-500 dark:text-zinc-400 px-2 leading-relaxed">
          Sign in to save and access your conversation history.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 flex-1 overflow-y-auto min-h-0">
      <div className="flex items-center justify-between px-2 mb-2">
        <p className="font-sans text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase">HISTORY</p>
        <button
          onClick={onNewChat}
          className="text-zinc-500 dark:text-zinc-400"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="font-sans text-sm text-zinc-500 dark:text-zinc-400 px-2">No conversations yet.</p>
      ) : (
        <div className="space-y-0.5">
          {conversations.map(conv => {
            const isActive = pathname.includes(conv._id);
            return (
              <Link
                key={conv._id}
                href={`/chat/${conv._id}`}
                className={`
                  flex items-center gap-2 px-2 py-2 rounded-lg transition-colors duration-200
                  ${isActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'
                    : 'text-zinc-500 dark:text-zinc-400'
                  }
                `}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-sans text-sm truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => deleteConversation(conv._id, e)}
                  className="text-zinc-400 dark:text-zinc-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}