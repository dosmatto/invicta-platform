'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { seedIfEmpty } from '@/lib/seed';
import { bootCloud } from '@/lib/cloud';
import { empresaIfEmpty, adotarEmpresasLocais, garantirEmpresaInvicta, uidUsuario, ehOwner, seedPapeis, seedPermissoes, seedPlanos, papelDoEmail, papelDoUsuario, emailUsuario, precisaTrocarSenha, meuRegistro, loginExpirado } from '@/lib/empresa';
import { limparBaseOperacional } from '@/lib/admin/manutencao';
import { TrocaSenhaObrigatoria } from '@/components/auth/TrocaSenhaObrigatoria';
import { migrarLaboratoriosV1, migrarSafrasV1, migrarGradesV1, migrarPreferenciasV1, reKeyDonoBiblioteca } from '@/lib/biblioteca';
import { seedLegendasSistema, migrarAreasGeodesicasV1, migrarNomesMaiusculosV1, migrarGradesDuplicadasV1, migrarBboxTalhoesV1 } from '@/lib/store';
import { LEGENDAS_OFICIAIS } from '@/constants/legendasSeedOficial';
import { authConfigurado, observarAuth, logout, type User } from '@/lib/auth';
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
  // MEAP — camada de FUNDO (raster) sob as zonas + opacidade das zonas (comparação)
  zonasFundo: FertilidadeOverlay | null;
  setZonasFundo: (o: FertilidadeOverlay | null) => void;
  zonasOpacidade: number;
  setZonasOpacidade: (v: number) => void;
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
  zonasFundo: null,
  setZonasFundo: () => {},
  zonasOpacidade: 0.5,
  setZonasOpacidade: () => {},
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

export function AppProvider({ children, redirectProdutorParaPortal }: { children: ReactNode; redirectProdutorParaPortal?: boolean }) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<string | null>('dashboard');
  const [mapMode, setMapMode] = useState<MapMode>('satellite');

  // Login obrigatório quando a auth (Supabase) está configurada: o boot da nuvem
  // só roda depois de autenticar. Sem auth, modo local com seed de demo.
  const [usuario, setUsuario] = useState<User | null | undefined>(authConfigurado ? undefined : null);
  const [dadosProntos, setDadosProntos] = useState(false);
  // Fase U1: e-mail sem papel atribuído (inv_papeis) = acesso bloqueado.
  const [acessoBloqueado, setAcessoBloqueado] = useState(false);
  // Fase U3: 1º acesso com senha provisória → troca obrigatória.
  const [trocaSenha, setTrocaSenha] = useState(false);
  // Prestador com validade de login vencida → bloqueado com mensagem própria.
  const [validadeExpirada, setValidadeExpirada] = useState(false);
  const [dataExpiracao, setDataExpiracao] = useState<string | null>(null);
  useEffect(() => {
    function migracoesLocais() {
      empresaIfEmpty();                 // Empresa Pessoal + ativa, idempotente
      migrarLaboratoriosV1(); migrarSafrasV1(); migrarGradesV1(); migrarPreferenciasV1();
      migrarAreasGeodesicasV1();               // areas dos talhoes -> geodesico (igual QGIS)
      migrarBboxTalhoesV1();                   // bbox de talhao antigo (evita parse do poligono a cada abertura)
      migrarNomesMaiusculosV1();               // nomes cliente/fazenda/talhao -> CAIXA ALTA
      migrarGradesDuplicadasV1();              // remove grades salvas em duplicidade (ex.: duplo clique)
      seedLegendasSistema(LEGENDAS_OFICIAIS); // legendas oficiais (sistema)
    }

    if (!authConfigurado) {
      seedIfEmpty();
      migracoesLocais();
      setDadosProntos(true);
      return;
    }

    const unsub = observarAuth(async (user) => {
      setUsuario(user);
      if (!user) { setDadosProntos(false); setAcessoBloqueado(false); setTrocaSenha(false); setValidadeExpirada(false); setDataExpiracao(null); return; }
      setDadosProntos(false);
      // Hidrata da nuvem com TEMPO-LIMITE: se o Supabase estiver degradado
      // (pendurado), entra com os dados locais em vez de prender o usuário no
      // "Verificando acesso…". Seguro: sem boot íntegro NÃO há poda (v1.86) e
      // gravações locais ficam pendentes/mescladas até confirmar (v1.87). Se o
      // boot lento terminar depois, ele completa a hidratação em 2º plano.
      await Promise.race([
        bootCloud().catch(() => {}),
        new Promise<void>(res => setTimeout(() => {
          console.warn('[nuvem] boot demorou >20s — entrando com dados locais; hidratação segue em 2º plano.');
          res();
        }, 20_000)),
      ]);
      seedPapeis();                            // garante owner/admin oficiais (idempotente)
      seedPermissoes();                        // semeia as permissões padrão por papel
      seedPlanos();                            // semeia os planos de assinatura (Básico/Interm./Completo)
      adotarEmpresasLocais(uidUsuario());      // empresa (cosmética, single-tenant)
      garantirEmpresaInvicta(uidUsuario());    // empresa padrão "Invicta"
      reKeyDonoBiblioteca();                   // A3.4: dono da Biblioteca pessoal uid→e-mail (idempotente)
      migracoesLocais();
      const autorizado = !!papelDoEmail(emailUsuario());
      // Validade de login (prestador): papel existe mas venceu → bloqueio próprio.
      const reg = meuRegistro();
      const expirado = autorizado && loginExpirado(reg);
      setAcessoBloqueado(!autorizado);                 // e-mail sem papel = bloqueado
      setValidadeExpirada(expirado);                   // login com validade vencida
      setDataExpiracao(expirado ? (reg?.validadeAte ?? null) : null);
      setTrocaSenha(autorizado && !expirado && precisaTrocarSenha()); // convidado no 1º acesso
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

  // Produtor não usa o app do mapa — vai direto pro portal (read-only).
  useEffect(() => {
    if (!dadosProntos || !redirectProdutorParaPortal) return;
    if (papelDoUsuario() === 'produtor') router.replace('/portal');
  }, [dadosProntos]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [uploadedGeo, setUploadedGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [uploadedBbox, setUploadedBbox] = useState<[number, number, number, number] | null>(null);
  const [pontosSimulados, setPontosSimulados] = useState<GeoJSON.FeatureCollection | null>(null);
  const [talhoesFazenda, setTalhoesFazenda] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zonasManejo, setZonasManejo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zonasFundo, setZonasFundo] = useState<FertilidadeOverlay | null>(null);
  const [zonasOpacidade, setZonasOpacidade] = useState(0.5);
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

  // useCallback: setNav PRECISA ser estável. Sem isso, recriava-se a cada render
  // e qualquer useEffect que o tem como dependência (ex.: TalhaoPage) re-rodava
  // sem parar → "Maximum update depth exceeded" → a página/mapa travava.
  const setNav = useCallback((partial: Partial<NavContext>) => {
    setNavState(prev => ({ ...prev, ...partial }));
  }, []);

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
      zonasFundo, setZonasFundo,
      zonasOpacidade, setZonasOpacidade,
      edicaoAtiva, setEdicaoAtiva,
      edicaoModo, setEdicaoModo,
      pontoEvent, setPontoEvent,
      zonaEvent, setZonaEvent,
      fertilidadeOverlay, setFertilidadeOverlay,
      fertilidadeLabels, setFertilidadeLabels,
    }}>
      {authConfigurado && usuario === undefined ? (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#061525' }}>
          <p className="text-xs font-semibold" style={{ color: '#64748b' }}>Verificando acesso…</p>
        </div>
      ) : authConfigurado && usuario === null ? (
        <LoginScreen />
      ) : !dadosProntos ? (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#061525' }}>
          <p className="text-xs font-semibold" style={{ color: '#64748b' }}>Carregando dados…</p>
        </div>
      ) : trocaSenha ? (
        <TrocaSenhaObrigatoria email={usuario?.email ?? ''} onDone={() => setTrocaSenha(false)} />
      ) : validadeExpirada ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#061525' }}>
          <div className="max-w-sm space-y-2">
            <p className="text-base font-bold" style={{ color: '#e2e8f0' }}>Acesso expirado</p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Seu acesso expirou em <strong style={{ color: '#cbd5e1' }}>
                {dataExpiracao ? new Date(dataExpiracao).toLocaleDateString('pt-BR') : '—'}
              </strong>. Fale com o administrador para renovar.
            </p>
          </div>
          <button onClick={() => logout()} className="px-4 py-2 rounded text-xs font-bold text-white" style={{ background: 'var(--invicta-blue-mid)' }}>
            Sair
          </button>
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
