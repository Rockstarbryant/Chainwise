'use client';

// app/ClientLayout.tsx
import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { SidebarRefreshProvider } from '@/contexts/SidebarRefreshContext';
import { SidebarOpenProvider } from '@/contexts/SidebarOpenContext';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </SidebarOpenProvider>
    </SidebarRefreshProvider>
  );
}