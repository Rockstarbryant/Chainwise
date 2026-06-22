'use client';

// app/ClientLayout.tsx
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import GlobalHeader from '@/components/layout/GlobalHeader';
import { SidebarRefreshProvider } from '@/contexts/SidebarRefreshContext';
import { SidebarOpenProvider } from '@/contexts/SidebarOpenContext';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isChatPage = pathname === '/chat' || pathname.startsWith('/chat/');

  return (
    <SidebarRefreshProvider>
      <SidebarOpenProvider
        isOpen={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      >
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/*
         * Chat pages: overflow-hidden + h-screen so ChatWindow can manage
         *             its own internal scroll with h-full / flex-1.
         * Other pages: overflow-y-auto so long pages (giveaways, fees, etc)
         *             scroll normally.
         */}
        <main
          className={
            isChatPage
              ? 'flex-1 flex flex-col min-w-0 overflow-hidden h-screen'
              : 'flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden'
          }
        >
          {!isChatPage && <GlobalHeader />}
          {children}
        </main>
      </SidebarOpenProvider>
    </SidebarRefreshProvider>
  );
}