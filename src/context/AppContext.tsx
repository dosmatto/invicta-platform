'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { seedIfEmpty } from '@/lib/seed';
import { bootCloud } from '@/lib/cloud';
import { empresaIfEmpty, adotarEmpresasLocais, garantirEmpresaInvicta, uidUsuario, ehOwner, seedPapeis, papelDoEmail, emailUsuario } from '@/lib/empresa';
import { limparBaseOperacional } from '@/lib/admin/manutencao';
import { migrarLaboratoriosV1, migrarSafrasV1, migrarGradesV1, migrarPreferenciasV1 } from '@/lib/biblioteca';
import { seedLegendasSistema } from '@/lib/store';
import { LEGENDAS_OFICIAIS } from '@/constants/legendasSeedOficial';
import { firebaseConfigurado } from '@/lib/firebase';
import { observarAuth, logout, type User } from '@/lib/auth';
import { LoginScreen } from '@/components/auth/LoginScreen';

export type MapMode = 'street' | 'satellite';

export type EdicaoModo = 'mover' | 'adicionar' | 'remover';
export type PontoEvent =
  | { tipo: 'mover'; ordem: number; lng: number; lat: number }
  | { tipo: 'add'; lng: number; lat: number }
  | { tipo: 'remover'; ordem: number };
// Clique numa zona de manejo no mapa (rótulo da zona)
export type ZonaEvent = { rotulo: string };
// Overlay raster do mapa de fertilidade (imagem interpolada recortada no talhão)
export interface FertilidadeOverlay {
  url: string; // data URL do PNG
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  opacity: number;
}

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
  // Zonas de manejo do talhão (coloridas por classe) exibidas no mapa
  zonasManejo: GeoJSON.FeatureCollection | null;
  setZonasManejo: (fc: GeoJSON.FeatureCollection | null) => void;
  // Edição manual de pontos de amostragem
  edicaoAtiva: boolean;
  setEdicaoAtiva: (v: boolean) => void;
  edicaoModo: EdicaoModo;
  setEdicaoModo: (m: EdicaoModo) => void;
  pontoEvent: PontoEvent | null;
  setPontoEvent: (e: PontoEvent | null) => void;
  // Clique numa zona de manejo (ajuste de densidade por zona)
  zonaEvent: ZonaEvent | null;
  setZonaEvent: (e: ZonaEvent | null) => void;
  // Mapa de fertilidade — raster interpolado + rótulos de valor por ponto
  fertilidadeOverlay: FertilidadeOverlay | null;
  setFertilidadeOverlay: (o: FertilidadeOverlay | null) => void;
  fertilidadeLabels: GeoJSON.FeatureCollection | null;
  setFertilidadeLabels: (fc: GeoJSON.FeatureCollection | null) => void;
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
  zonasManejo: null,
  setZonasManejo: () => {},
  edicaoAtiva: false,
  setEdicaoAtiva: () => {},
  edicaoModo: 'mover',
  setEdicaoModo: () => {},
  pontoEvent: null,
  setPontoEvent: () => {},
  zonaEvent: null,
  setZonaEvent: () => {},
  fertilidadeOverlay: null,
  setFertilidadeOverlay: () => {},
  fertilidadeLabels: null,
  setFertilidadeLabels: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<string | null>('dashboard');
  const [mapMode, setMapMode] = useState<MapMode>('satellite');

  // Login obrigatório quando o Firebase está configurado: o boot da nuvem só
  // roda depois de autenticar. Sem Firebase, modo local com seed de demo.
  const [usuario, setUsuario] = useState<User | null | undefined>(firebaseConfigurado ? undefined : null);
  const [dadosProntos, setDadosProntos] = useState(false);
  // Fase U1: e-mail sem papel atribuído (inv_papeis) = acesso bloqueado.
  const [acessoBloqueado, setAcessoBloqueado] = useState(false);
  useEffect(() => {
    function migracoesLocais() {
      empresaIfEmpty();                 // Empresa Pessoal + ativa, idempotente
      migrarLaboratoriosV1(); migrarSafrasV1(); migrarGradesV1(); migrarPreferenciasV1();
      seedLegendasSistema(LEGENDAS_OFICIAIS); // legendas oficiais (sistema)
    }

    if (!firebaseConfigurado) {
      seedIfEmpty();
      migracoesLocais();
      setDadosProntos(true);
      return;
    }

    const unsub = observarAuth(async (user) => {
      setUsuario(user);
      if (!user) { setDadosProntos(false); setAcessoBloqueado(false); return; }
      setDadosProntos(false);
      await bootCloud().catch(() => {});       // hidrata empresas/dados/papéis da nuvem
      seedPapeis();                            // garante owner/admin oficiais (idempotente)
      adotarEmpresasLocais(uidUsuario());      // empresa (cosmética, single-tenant)
      garantirEmpresaInvicta(uidUsuario());    // empresa padrão "Invicta"
      migracoesLocais();
      setAcessoBloqueado(!papelDoEmail(emailUsuario())); // e-mail sem papel = bloqueado
      setDadosProntos(true);
    });
    return () => unsub();
  }, []);

  // Console-only (sem botão, decisão do usuário): admin pode zerar a base
  // operacional com  await invLimparBase('APAGAR TUDO')  — preserva a Biblioteca.
  useEffect(() => {
    if (typeof window === 'undefined' || !dadosProntos || !ehOwner()) return;
    (window as unknown as { invLimparBase?: typeof limparBaseOperacional }).invLimparBase = limparBaseOperacional;
    console.info('[invicta] Owner: para zerar a base (mantendo a Biblioteca), rode no Console:  await invLimparBase("APAGAR TUDO")');
  }, [dadosProntos]);

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [uploadedGeo, setUploadedGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [uploadedBbox, setUploadedBbox] = useState<[number, number, number, number] | null>(null);
  const [pontosSimulados, setPontosSimulados] = useState<GeoJSON.FeatureCollection | null>(null);
  const [talhoesFazenda, setTalhoesFazenda] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zonasManejo, setZonasManejo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [edicaoAtiva, setEdicaoAtiva] = useState(false);
  const [edicaoModo, setEdicaoModo] = useState<EdicaoModo>('mover');
  const [pontoEvent, setPontoEvent] = useState<PontoEvent | null>(null);
  const [zonaEvent, setZonaEvent] = useState<ZonaEvent | null>(null);
  const [fertilidadeOverlay, setFertilidadeOverlay] = useState<FertilidadeOverlay | null>(null);
  const [fertilidadeLabels, setFertilidadeLabels] = useState<GeoJSON.FeatureCollection | null>(null);
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
      zonasManejo, setZonasManejo,
      edicaoAtiva, setEdicaoAtiva,
      edicaoModo, setEdicaoModo,
      pontoEvent, setPontoEvent,
      zonaEvent, setZonaEvent,
      fertilidadeOverlay, setFertilidadeOverlay,
      fertilidadeLabels, setFertilidadeLabels,
    }}>
      {firebaseConfigurado && usuario === undefined ? (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#061525' }}>
          <p className="text-xs font-semibold" style={{ color: '#64748b' }}>Verificando acesso…</p>
        </div>
      ) : firebaseConfigurado && usuario === null ? (
        <LoginScreen />
      ) : !dadosProntos ? (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#061525' }}>
          <p className="text-xs font-semibold" style={{ color: '#64748b' }}>Carregando dados…</p>
        </div>
      ) : acessoBloqueado ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#061525' }}>
          <div className="max-w-sm space-y-2">
            <p className="text-base font-bold" style={{ color: '#e2e8f0' }}>Acesso ainda não liberado</p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              O e-mail <strong style={{ color: '#cbd5e1' }}>{usuario?.email}</strong> não tem papel atribuído.
              Peça a um administrador para liberar seu acesso.
            </p>
          </div>
          <button onClick={() => logout()} className="px-4 py-2 rounded text-xs font-bold text-white" style={{ background: 'var(--invicta-blue-mid)' }}>
            Sair
          </button>
        </div>
      ) : children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
