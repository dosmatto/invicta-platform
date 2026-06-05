'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { seedIfEmpty } from '@/lib/seed';

export type MapMode = 'street' | 'satellite';

export type EdicaoModo = 'mover' | 'adicionar' | 'remover';
export type PontoEvent =
  | { tipo: 'mover'; ordem: number; lng: number; lat: number }
  | { tipo: 'add'; lng: number; lat: number }
  | { tipo: 'remover'; ordem: number };

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
  uploadedGeo: GeoJSON.FeatureCollection | null;
  setUploadedGeo: (geo: GeoJSON.FeatureCollection | null) => void;
  uploadedBbox: [number, number, number, number] | null;
  setUploadedBbox: (bb: [number, number, number, number] | null) => void;
  pontosSimulados: GeoJSON.FeatureCollection | null;
  setPontosSimulados: (fc: GeoJSON.FeatureCollection | null) => void;
  // Polígonos dos talhões da fazenda aberta (clicáveis no mapa)
  talhoesFazenda: GeoJSON.FeatureCollection | null;
  setTalhoesFazenda: (fc: GeoJSON.FeatureCollection | null) => void;
  // Edição manual de pontos de amostragem
  edicaoAtiva: boolean;
  setEdicaoAtiva: (v: boolean) => void;
  edicaoModo: EdicaoModo;
  setEdicaoModo: (m: EdicaoModo) => void;
  pontoEvent: PontoEvent | null;
  setPontoEvent: (e: PontoEvent | null) => void;
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
  uploadedGeo: null,
  setUploadedGeo: () => {},
  uploadedBbox: null,
  setUploadedBbox: () => {},
  pontosSimulados: null,
  setPontosSimulados: () => {},
  talhoesFazenda: null,
  setTalhoesFazenda: () => {},
  edicaoAtiva: false,
  setEdicaoAtiva: () => {},
  edicaoModo: 'mover',
  setEdicaoModo: () => {},
  pontoEvent: null,
  setPontoEvent: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<string | null>('dashboard');
  const [mapMode, setMapMode] = useState<MapMode>('satellite');

  // Pré-carrega dados de teste (uma vez) em qualquer navegador/plataforma
  useEffect(() => { seedIfEmpty(); }, []);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [uploadedGeo, setUploadedGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [uploadedBbox, setUploadedBbox] = useState<[number, number, number, number] | null>(null);
  const [pontosSimulados, setPontosSimulados] = useState<GeoJSON.FeatureCollection | null>(null);
  const [talhoesFazenda, setTalhoesFazenda] = useState<GeoJSON.FeatureCollection | null>(null);
  const [edicaoAtiva, setEdicaoAtiva] = useState(false);
  const [edicaoModo, setEdicaoModo] = useState<EdicaoModo>('mover');
  const [pontoEvent, setPontoEvent] = useState<PontoEvent | null>(null);
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
      uploadedGeo, setUploadedGeo,
      uploadedBbox, setUploadedBbox,
      pontosSimulados, setPontosSimulados,
      talhoesFazenda, setTalhoesFazenda,
      edicaoAtiva, setEdicaoAtiva,
      edicaoModo, setEdicaoModo,
      pontoEvent, setPontoEvent,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
