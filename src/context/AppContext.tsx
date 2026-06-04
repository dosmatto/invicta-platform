'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type MapMode = 'street' | 'satellite';

interface NavContext {
  produtorId: string | null;
  produtor: string;
  fazendaId: string | null;
  fazenda: string;
  talhaoId: string | null;
  talhao: string;
  safra: string;
  area: number;
}

interface AppContextType {
  activePanel: string | null;
  setActivePanel: (panel: string | null) => void;
  nav: NavContext;
  setNav: (partial: Partial<NavContext>) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
  activeModule: string | null;
  setActiveModule: (m: string | null) => void;
}

const AppContext = createContext<AppContextType>({
  activePanel: 'dashboard',
  setActivePanel: () => {},
  nav: { produtorId: null, produtor: '', fazendaId: null, fazenda: '', talhaoId: null, talhao: '', safra: '24/25', area: 0 },
  setNav: () => {},
  mapMode: 'street',
  setMapMode: () => {},
  activeModule: null,
  setActiveModule: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<string | null>('dashboard');
  const [mapMode, setMapMode] = useState<MapMode>('street');
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [nav, setNavState] = useState<NavContext>({
    produtorId: null, produtor: '',
    fazendaId: null, fazenda: '',
    talhaoId: null, talhao: '',
    safra: '24/25', area: 0,
  });

  function setNav(partial: Partial<NavContext>) {
    setNavState(prev => ({ ...prev, ...partial }));
  }

  return (
    <AppContext.Provider value={{
      activePanel, setActivePanel,
      nav, setNav,
      mapMode, setMapMode,
      activeModule, setActiveModule,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
