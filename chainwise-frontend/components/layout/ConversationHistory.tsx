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
  refreshTrigger?: number; 
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

  useEffect(() => {
    if (!isAuthenticated) return;
    loadConversations();
  }, [isAuthenticated, loadConversations]);

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
      <div className="px-3 py-4 bg-red-100 dark:bg-red-950 border-y-4 border-red-600">
        <p className="font-sans text-xs font-black text-red-900 dark:text-red-300 tracking-widest uppercase mb-2 border-b-2 border-red-900 pb-1">HISTORY</p>
        <p className="font-sans text-sm font-bold text-red-800 dark:text-red-200 leading-relaxed">
          SIGN IN TO SAVE AND ACCESS YOUR CONVERSATION HISTORY.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-4 flex-1 overflow-y-auto min-h-0 bg-slate-200 dark:bg-slate-900">
      <div className="flex items-center justify-between mb-4 border-b-4 border-black pb-2">
        <p className="font-sans text-xs font-black text-black dark:text-white tracking-widest uppercase">HISTORY</p>
        <button
          onClick={onNewChat}
          className="bg-black text-white p-1 border-2 border-black touch-manipulation"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="font-sans text-sm font-bold text-slate-600 dark:text-slate-400 p-2 border-2 border-slate-400 border-dashed text-center uppercase">
          NO CONVERSATIONS YET
        </p>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => {
            const isActive = pathname.includes(conv._id);
            return (
              <Link
                key={conv._id}
                href={`/chat/${conv._id}`}
                className={`
                  flex items-center gap-2 px-2.5 py-2.5 border-2 
                  ${isActive
                    ? 'bg-fuchsia-600 text-white border-fuchsia-900'
                    : 'bg-white dark:bg-slate-800 text-black dark:text-white border-black dark:border-slate-500'
                  }
                `}
              >
                <div className={`p-1 border-2 ${isActive ? 'border-white/50' : 'border-black dark:border-slate-500'}`}>
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                </div>
                <span className="font-sans font-bold text-[13px] truncate flex-1 uppercase">{conv.title}</span>
                <button
                  onClick={(e) => deleteConversation(conv._id, e)}
                  className="bg-red-600 text-white p-1.5 border-2 border-red-900 touch-manipulation"
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