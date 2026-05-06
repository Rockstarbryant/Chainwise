'use client';

import { createContext, useContext } from 'react';

interface SidebarOpenContextValue {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const SidebarOpenContext = createContext<SidebarOpenContextValue>({
  isOpen: false,
  onOpen: () => {},
  onClose: () => {},
});

export function SidebarOpenProvider({
  children,
  isOpen,
  onOpen,
  onClose,
}: { children: React.ReactNode } & SidebarOpenContextValue) {
  return (
    <SidebarOpenContext.Provider value={{ isOpen, onOpen, onClose }}>
      {children}
    </SidebarOpenContext.Provider>
  );
}

export function useSidebarOpen() {
  return useContext(SidebarOpenContext);
}