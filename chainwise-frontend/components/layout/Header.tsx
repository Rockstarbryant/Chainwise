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
      flex-shrink-0 h-14
      flex items-center justify-between
      px-3 sm:px-5
      border-b border-zinc-200 dark:border-zinc-800
      bg-white/90 dark:bg-zinc-950/90
      backdrop-blur-sm
      sticky top-0 z-30
    ">
      {/* Left — hamburger + mobile logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpen}
          aria-label="Open menu"
          className="
            p-2 -ml-1 rounded-lg
            text-zinc-500 dark:text-zinc-400
            hover:bg-zinc-100 dark:hover:bg-zinc-800
            active:bg-zinc-200 dark:active:bg-zinc-700
            transition-colors duration-150
            touch-manipulation
          "
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo — mobile only */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-7 h-7 rounded-md bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-zinc-950" />
          </div>
          <span className="font-sans font-bold text-emerald-600 dark:text-emerald-500 text-sm tracking-[0.12em]">
            CHAINWISE
          </span>
        </div>
      </div>

      {/* Centre — status pill */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-sans text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase hidden sm:inline">
          Agent Online
        </span>
      </div>

      {/* Right — anon counter + new chat */}
      <div className="flex items-center gap-2 sm:gap-3">
        {!isAuthenticated && (
          <span className="font-sans text-xs text-zinc-400 dark:text-zinc-500 hidden sm:inline">
            {anonLimit - anonCount} free {anonLimit - anonCount === 1 ? 'chat' : 'chats'} left
          </span>
        )}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="
              flex items-center gap-1.5
              px-2.5 sm:px-3 py-1.5 rounded-lg
              font-sans text-xs font-medium
              text-zinc-500 dark:text-zinc-400
              hover:text-zinc-900 dark:hover:text-zinc-100
              hover:bg-zinc-100 dark:hover:bg-zinc-800
              active:bg-zinc-200 dark:active:bg-zinc-700
              transition-colors duration-150
              uppercase tracking-wide
              touch-manipulation
            "
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        )}
      </div>
    </header>
  );
}