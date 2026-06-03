'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface AppContextType {
  activePanel: string | null;
  setActivePanel: (panel: string | null) => void;
  context: {
    produtor: string;
    fazenda: string;
    talhao: string;
    safra: string;
    area: number;
  };
  setContext: (ctx: Partial<AppContextType['context']>) => void;
}

const AppContext = createContext<AppContextType>({
  activePanel: null,
  setActivePanel: () => {},
  context: { produtor: '', fazenda: '', talhao: '', safra: '', area: 0 },
  setContext: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<string | null>('dashboard');
  const [context, setContextState] = useState({
    produtor: 'João Silva',
    fazenda: 'Fazenda São João',
    talhao: 'Talhão 01',
    safra: '24/25',
    area: 48.5,
  });

  function setContext(partial: Partial<typeof context>) {
    setContextState(prev => ({ ...prev, ...partial }));
  }

  return (
    <AppContext.Provider value={{ activePanel, setActivePanel, context, setContext }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
