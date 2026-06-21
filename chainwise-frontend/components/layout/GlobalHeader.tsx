'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Zap } from 'lucide-react';
import { useSidebarOpen } from '@/contexts/SidebarOpenContext';

export default function GlobalHeader() {
  const { onOpen } = useSidebarOpen();
  const pathname = usePathname();

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
      border-b-4 border-blue-900
      bg-blue-600 text-white
      z-20
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

        <Link href="/" className="flex items-center gap-2 border-2 border-transparent px-1">
          <div className="w-8 h-8 bg-yellow-400 border-2 border-black flex items-center justify-center">
            <Zap className="w-4 h-4 text-black font-black" />
          </div>
          <span className="font-sans font-black text-white text-sm tracking-[0.15em] uppercase">
            CHAINWISE
          </span>
        </Link>
      </div>

      <div className="hidden sm:flex bg-black text-white px-3 py-1.5 border-2 border-blue-900">
        <span className="font-sans font-black text-xs uppercase tracking-widest">
          {pageTitle}
        </span>
      </div>

      <div className="flex items-center gap-2 bg-white text-black px-2 py-1.5 border-2 border-black">
        <span className="w-2.5 h-2.5 bg-emerald-500 border-2 border-black animate-pulse" />
        <span className="font-sans text-[10px] font-black tracking-widest uppercase hidden sm:inline">
          LIVE
        </span>
      </div>
    </header>
  );
}