'use client';

// components/layout/GlobalHeader.tsx
// Shown on every page EXCEPT /chat routes (those use ChatWindow's own Header).
// Provides the hamburger that opens the sidebar so nav is always accessible.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Zap } from 'lucide-react';
import { useSidebarOpen } from '@/contexts/SidebarOpenContext';

export default function GlobalHeader() {
  const { onOpen } = useSidebarOpen();
  const pathname = usePathname();

  // Derive a readable page title from the current path
  const pageTitle = (() => {
    if (pathname.startsWith('/fees'))      return 'Fee Tables';
    if (pathname.startsWith('/coins'))     return 'Coin Explorer';
    if (pathname.startsWith('/p2p'))       return 'P2P Market';
    if (pathname.startsWith('/giveaways')) return 'Giveaways';
    if (pathname.startsWith('/admin'))     return 'Admin';
    if (pathname.startsWith('/login'))     return 'Sign In';
    return 'ChainWise';
  })();

  return (
    <header className="
      h-14 flex-shrink-0
      flex items-center justify-between
      px-3 sm:px-5
      border-b border-zinc-200 dark:border-zinc-800
      bg-white dark:bg-zinc-950
      transition-colors duration-200
      z-20
    ">
      {/* Left — hamburger + logo */}
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

        {/* Logo mark — always visible */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-zinc-950" />
          </div>
          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-500 text-sm tracking-[0.12em]">
            CHAINWISE
          </span>
        </Link>
      </div>

      {/* Centre — current page label */}
      <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.14em] hidden sm:inline">
        {pageTitle}
      </span>

      {/* Right — live indicator */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide uppercase hidden sm:inline">
          Live
        </span>
      </div>
    </header>
  );
}