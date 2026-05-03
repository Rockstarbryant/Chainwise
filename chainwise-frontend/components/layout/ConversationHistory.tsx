'use client';

import { useState, useEffect } from 'react';
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
}

export default function ConversationHistory({ onNewChat }: Props) {
  const { isAuthenticated, getToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) return;
    loadConversations();
  }, [isAuthenticated]);

  const loadConversations = async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success) setConversations(data.data);
    } catch {}
  };

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
        <p className="font-mono text-[10px] text-brand-muted tracking-widest px-2 mb-2">HISTORY</p>
        <p className="font-mono text-[11px] text-brand-muted px-2 leading-relaxed">
          Sign in to save and access your conversation history.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 flex-1 overflow-y-auto min-h-0">
      <div className="flex items-center justify-between px-2 mb-2">
        <p className="font-mono text-[9px] text-brand-muted tracking-widest">HISTORY</p>
        <button
          onClick={onNewChat}
          className="text-brand-muted hover:text-brand-green transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="font-mono text-[11px] text-brand-muted px-2">No conversations yet.</p>
      ) : (
        <div className="space-y-0.5">
          {conversations.map(conv => {
            const isActive = pathname.includes(conv._id);
            return (
              <Link
                key={conv._id}
                href={`/chat/${conv._id}`}
                className={`
                  group flex items-center gap-2 px-2 py-2 rounded-lg transition-all duration-150
                  ${isActive
                    ? 'bg-[rgba(0,255,136,0.08)] text-brand-green'
                    : 'text-brand-muted hover:text-brand-text hover:bg-[rgba(255,255,255,0.03)]'
                  }
                `}
              >
                <MessageSquare className="w-3 h-3 flex-shrink-0" />
                <span className="font-mono text-[11px] truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => deleteConversation(conv._id, e)}
                  className="opacity-0 group-hover:opacity-100 text-brand-muted hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}