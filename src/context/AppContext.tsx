'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { seedIfEmpty } from '@/lib/seed';
import { bootCloud, bootCloudCampo } from '@/lib/cloud';
import { empresaIfEmpty, adotarEmpresasLocais, garantirEmpresaInvicta, uidUsuario, ehOwner, seedPapeis, seedPermissoes, seedPlanos, papelDoEmail, papelDoUsuario, emailUsuario, precisaTrocarSenha, meuRegistro, loginExpirado } from '@/lib/empresa';
import { limparBaseOperacional } from '@/lib/admin/manutencao';
import { TrocaSenhaObrigatoria } from '@/components/auth/TrocaSenhaObrigatoria';
import { migrarLaboratoriosV1, migrarSafrasV1, migrarGradesV1, migrarPreferenciasV1, reKeyDonoBiblioteca } from '@/lib/biblioteca';
import { seedLegendasSistema, migrarLegendaCtceV1, auditoriaCadastro, migrarAreasGeodesicasV1, migrarNomesMaiusculosV1, migrarGradesDuplicadasV1, migrarBboxTalhoesV1 } from '@/lib/store';
import { LEGENDAS_OFICIAIS } from '@/constants/legendasSeedOficial';
import { authConfigurado, observarAuth, logout, type User } from '@/lib/auth';
import { hidratarCachePesado } from '@/lib/localComprimido';
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

export function AppProvider({ children, redirectProdutorParaPortal, modoCampo }: { children: ReactNode; redirectProdutorParaPortal?: boolean; modoCampo?: boolean }) {
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
      // [entrada] cronômetro por passo — revela qual seed/migração pesa na
      // abertura da Início (só loga o que passar de 30ms).
      const t = performance.now();
      const passo = (nome: string, fn: () => void) => {
        const a = performance.now(); fn(); const d = performance.now() - a;
        if (d > 30) console.info(`[entrada] ${nome}: ${Math.round(d)}ms`);
      };
      passo('empresaIfEmpty', empresaIfEmpty);
      passo('migrarLaboratoriosV1', migrarLaboratoriosV1);
      passo('migrarSafrasV1', migrarSafrasV1);
      passo('migrarGradesV1', migrarGradesV1);
      passo('migrarPreferenciasV1', migrarPreferenciasV1);
      passo('migrarAreasGeodesicasV1', migrarAreasGeodesicasV1);   // parse de geojson dos talhões
      passo('migrarBboxTalhoesV1', migrarBboxTalhoesV1);           // parse de geojson dos talhões
      passo('migrarNomesMaiusculosV1', migrarNomesMaiusculosV1);
      passo('migrarGradesDuplicadasV1', migrarGradesDuplicadasV1);
      passo('seedLegendasSistema', () => seedLegendasSistema(LEGENDAS_OFICIAIS));
      passo('migrarLegendaCtceV1', migrarLegendaCtceV1);   // legenda de CTCe clonando a de CTC (p/ interpolar/equações)
      console.info(`[entrada] migrações/seeds locais: ${Math.round(performance.now() - t)}ms`);
    }

    // Hidrata o cache das chaves PESADAS (IndexedDB → memória) ANTES de qualquer
    // leitura pesada: seeds/migrações locais e, no modo com auth, o boot da nuvem
    // (bootIncremental compara counts com o local; gravarSeMudou faz diff da
    // string crua — ler antes da hidratação devolveria "vazio" e podaria dados).
    // Singleton: só espera de verdade na primeira vez.
    const hidrata = hidratarCachePesado();

    if (!authConfigurado) {
      hidrata.then(() => {
        seedIfEmpty();
        migracoesLocais();
        setDadosProntos(true);
      });
      return;
    }

    const unsub = observarAuth(async (user) => {
      setUsuario(user);
      if (!user) { setDadosProntos(false); setAcessoBloqueado(false); setTrocaSenha(false); setValidadeExpirada(false); setDataExpiracao(null); return; }
      setDadosProntos(false);
      await hidrata;   // pesadas em memória antes do boot da nuvem (ver acima)
      const tLogin = performance.now();   // [entrada] cronômetro total até a tela liberar
      // Hidrata da nuvem com TEMPO-LIMITE: se o Supabase estiver degradado
      // (pendurado), entra com os dados locais em vez de prender o usuário no
      // "Verificando acesso…". Seguro: sem boot íntegro NÃO há poda (v1.86) e
      // gravações locais ficam pendentes/mescladas até confirmar (v1.87). Se o
      // boot lento terminar depois, ele completa a hidratação em 2º plano.
      // O timer é CANCELADO quando o boot ganha a corrida — senão ele dispara
      // 20s depois mesmo com o boot já concluído (v1.98: aviso falso no console).
      // Teto de 12s (era 20s): quando o Supabase está degradado (522 do Cloudflare
      // leva ~19,5s), 20s prendia o usuário. Um boot NORMAL é ~1,3s (incremental)
      // ou ~10s (completo da reconciliação 24h) — 12s cobre esses e corta a espera
      // nas quedas. A hidratação continua em 2º plano se o boot terminar depois.
      let timerBoot: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        (modoCampo ? bootCloudCampo() : bootCloud()).catch(() => {}),
        new Promise<void>(res => { timerBoot = setTimeout(() => {
          console.warn('[nuvem] boot demorou >12s — entrando com dados locais; hidratação segue em 2º plano.');
          res();
        }, 12_000); }),
      ]);
      if (timerBoot) clearTimeout(timerBoot);
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
      console.info(`[entrada] boot+seeds+migrações até liberar a tela: ${Math.round(performance.now() - tLogin)}ms`);
      setDadosProntos(true);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoCampo]);

  // Console-only (sem botão, decisão do usuário): admin pode zerar a base
  // operacional com  await invLimparBase('APAGAR TUDO')  — preserva a Biblioteca.
  useEffect(() => {
    if (typeof window === 'undefined' || !dadosProntos) return;
    // Auditoria do cadastro (read-only): confere os KPIs do Início e aponta
    // ids repetidos / órfãos / duplicatas por nome. Disponível a qualquer login.
    (window as unknown as { invAuditoria?: typeof auditoriaCadastro }).invAuditoria = auditoriaCadastro;
    console.info('[invicta] Para conferir os números do Início (duplicidade/órfãos), rode no Console:  invAuditoria()');
    if (!ehOwner()) return;
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
