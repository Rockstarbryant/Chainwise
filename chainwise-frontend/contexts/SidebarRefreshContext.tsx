'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SidebarRefreshContextValue {
  historyRefreshTrigger: number;
  triggerHistoryRefresh: () => void;
}

const SidebarRefreshContext = createContext<SidebarRefreshContextValue>({
  historyRefreshTrigger: 0,
  triggerHistoryRefresh: () => {},
});

export function SidebarRefreshProvider({ children }: { children: ReactNode }) {
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const triggerHistoryRefresh = useCallback(() => {
    setHistoryRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <SidebarRefreshContext.Provider value={{ historyRefreshTrigger, triggerHistoryRefresh }}>
      {children}
    </SidebarRefreshContext.Provider>
  );
}

export function useSidebarRefresh() {
  return useContext(SidebarRefreshContext);
}