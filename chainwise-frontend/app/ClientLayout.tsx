'use client';

// app/ClientLayout.tsx
// Wraps every page with the sidebar + context providers.
// On non-chat pages, also renders GlobalHeader so the hamburger is always
// accessible and the sidebar can be opened from any page in the app.

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import GlobalHeader from '@/components/layout/GlobalHeader';
import { SidebarRefreshProvider } from '@/contexts/SidebarRefreshContext';
import { SidebarOpenProvider } from '@/contexts/SidebarOpenContext';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Chat pages (/chat and /chat/[id]) have their own Header baked into
  // ChatWindow. Every other route needs GlobalHeader so the sidebar toggle
  // and branding are always present.
  const isChatPage = pathname === '/chat' || pathname.startsWith('/chat/');

  return (
    <SidebarRefreshProvider>
      <SidebarOpenProvider
        isOpen={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      >
        {/* Sidebar is always mounted; it hides/shows via CSS transforms */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/*
         * Main content column:
         * - flex-col so GlobalHeader stacks above <children>
         * - overflow-hidden on the column; individual pages control their
         *   own scrolling (the homepage and other content pages set
         *   overflow-y-auto on their root div)
         */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!isChatPage && <GlobalHeader />}
          {children}
        </main>
      </SidebarOpenProvider>
    </SidebarRefreshProvider>
  );
}