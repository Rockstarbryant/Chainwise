'use client';

import { Plus, Menu, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSidebarOpen } from '@/contexts/SidebarOpenContext';

interface Props {
  anonCount?: number;
  anonLimit?: number;
  onNewChat?: () => void;
}

export default function Header({ anonCount = 0, anonLimit = 3, onNewChat }: Props) {
  const { isAuthenticated } = useAuth();
  const { onOpen } = useSidebarOpen();

  return (
    <header className="
      h-14 flex items-center justify-between
      px-3 sm:px-5
      border-b-4 border-blue-900
      bg-blue-600 text-white
    ">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpen}
          aria-label="Open menu"
          className="
            p-2 bg-black text-white border-2 border-black
            touch-manipulation
          "
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 bg-yellow-400 border-2 border-black flex items-center justify-center">
            <Zap className="w-4 h-4 text-black font-black" />
          </div>
          <span className="font-sans font-black text-white text-sm tracking-[0.15em] uppercase">
            CHAINWISE
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white text-black px-2 py-1.5 border-2 border-black">
        <span className="w-2.5 h-2.5 bg-emerald-500 border-2 border-black animate-pulse" />
        <span className="font-sans text-[10px] font-black tracking-widest uppercase hidden sm:inline">
          AGENT ONLINE
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {!isAuthenticated && (
          <span className="font-sans font-black text-[10px] bg-black text-white px-2 py-1.5 border-2 border-blue-900 tracking-widest uppercase hidden sm:inline">
            {anonLimit - anonCount} FREE {anonLimit - anonCount === 1 ? 'CHAT' : 'CHATS'} LEFT
          </span>
        )}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="
              flex items-center gap-1.5
              px-3 py-1.5 border-2 border-black
              bg-amber-400 text-black
              font-sans text-xs font-black
              uppercase tracking-widest
              touch-manipulation
            "
          >
            <Plus className="w-4 h-4 font-black" />
            <span className="hidden sm:inline">NEW CHAT</span>
          </button>
        )}
      </div>
    </header>
  );
}