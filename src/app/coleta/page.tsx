'use client';

// App de Coleta de Solo em campo (PWA, mobile-first).
// Fluxo: seleção (produtor → fazenda → talhão → ciclo → área de coleta) →
// mapa com navegação GPS → coleta no raio permitido → sincronização.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  getClientes, getFazendas, getTalhoes, getSafras, getGrades,
  Talhao, GradeAmostragem, PontoAmostragem,
} from '@/lib/store';
import { emailUsuario, logout, modoOffline } from '@/lib/auth';
import { bootCloud } from '@/lib/cloud';
import {
  RegistroColeta, StatusPonto, COR_STATUS, ROTULO_STATUS,
  getColetas, upsertColeta, idColeta, pushColetasPendentes, pullColetas, pushMedicoesPendentes,
  pushLeiturasCompactPendentes, contarLeiturasPendentesSync,
  contarPendentesSync, contarFotosPendentes, salvarFoto, fotosDaColeta,
  comprimirFoto, subirFotosPendentes, distanciaM, formatarDist, avisoDentroRaio,
  baixarTilesOffline, baixarTilesVarios, registrarSWColeta, getConfigColeta, saveConfigColeta,
  StatusGrade, ROTULO_GRADE, COR_GRADE, statusGrade, gradeTemPendencia,
  ultimoSync, marcarUltimoSync,
  TipoFoto, FotoColeta,
} from '@/lib/coleta';
import type { PosOperador } from '@/components/coleta/MapaColeta';
import { useGps } from '@/components/coleta/useGps';
import { SyncBadge } from '@/components/shared/SyncBadge';
import { APP_VERSION } from '@/constants/version';
import {
  ChevronLeft, ChevronRight, MapPin, Crosshair, Layers, List, Download,
  RefreshCw, LogOut, Settings, Camera, CheckCircle2, X, Wifi, WifiOff,
  Loader2, AlertTriangle, Navigation, CloudUpload, Maximize2, Ruler, Grid3x3,
  Search, DownloadCloud, Eye, Satellite, Gauge,
} from 'lucide-react';

const MapaColeta = dynamic(
  () => import('@/components/coleta/MapaColeta').then(m => ({ default: m.MapaColeta })),
  { ssr: false, loading: () => <div className="absolute inset-0" style={{ background: '#0a1929' }} /> },
);
const MedicaoScreen = dynamic(
  () => import('@/components/coleta/MedicaoScreen').then(m => ({ default: m.MedicaoScreen })),
  { ssr: false, loading: () => <div className="fixed inset-0" style={{ background: '#0a1929' }} /> },
);
const ManchaScreen = dynamic(
  () => import('@/components/coleta/ManchaScreen').then(m => ({ default: m.ManchaScreen })),
  { ssr: false, loading: () => <div className="fixed inset-0" style={{ background: '#0a1929' }} /> },
);
const CompactacaoScreen = dynamic(
  () => import('@/components/coleta/CompactacaoScreen').then(m => ({ default: m.CompactacaoScreen })),
  { ssr: false, loading: () => <div className="fixed inset-0" style={{ background: '#0a1929' }} /> },
);

const AZUL_ESC = '#061525', AZUL = '#0a1929', BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#64748b';
// Ponto de AMOSTRAGEM pendente com 2+ profundidades (ex.: 00-20 e 20-40): cor
// à parte pra dar pra enxergar de longe, no satélite, onde vai coletar mais de
// uma camada. Só se aplica enquanto pendente — coletado mantém a cor de status
// (o status importa mais que a profundidade). Não conflita com COR_STATUS nem
// com o azul de "selecionado" (#60a5fa).
const COR_MULTI_PROF = '#a78bfa';

function codigoPonto(p: PontoAmostragem): string {
  return `P-${String(p.numero ?? p.ordem + 1).padStart(3, '0')}`;
}

// geojson do talhão pode estar salvo como FC, Feature ou Geometry
function talhaoComoFC(t: Talhao | null): GeoJSON.FeatureCollection | null {
  if (!t?.geojson) return null;
  try {
    const o = JSON.parse(t.geojson);
    if (o?.type === 'FeatureCollection') return o;
    if (o?.type === 'Feature') return { type: 'FeatureCollection', features: [o] };
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: o }] };
  } catch { return null; }
}

interface Selecao {
  produtorId: string | null; produtor: string;
  fazendaId: string | null; fazenda: string;
  talhaoId: string | null; talhao: string;
  safra: string | null;
  gradeId: string | null;
}

const SEL_VAZIA: Selecao = {
  produtorId: null, produtor: '', fazendaId: null, fazenda: '',
  talhaoId: null, talhao: '', safra: null, gradeId: null,
};

export default function ColetaPage() {
  const [modulo, setModulo] = useState<'amostragem' | 'medicao' | 'mancha' | 'compactacao' | null>(null);
  const [sel, setSel] = useState<Selecao>(SEL_VAZIA);
  const [reload, setReload] = useState(0);
  const [online, setOnline] = useState(true);
  const [pend, setPend] = useState({ regs: 0, fotos: 0 });
  const [msgSync, setMsgSync] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [instalar, setInstalar] = useState<(() => void) | null>(null);
  const sincronizarRef = useRef<(() => Promise<void>) | null>(null);

  // service worker + estado online + prompt de instalação
  useEffect(() => {
    registrarSWColeta();
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void sincronizarRef.current?.(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      const ev = e as Event & { prompt: () => void };
      setInstalar(() => () => { ev.prompt(); setInstalar(null); });
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
    };
  }, []);

  const atualizarPendentes = useCallback(async () => {
    setPend({ regs: contarPendentesSync() + contarLeiturasPendentesSync(), fotos: await contarFotosPendentes().catch(() => 0) });
  }, []);
  useEffect(() => { void atualizarPendentes(); }, [reload, atualizarPendentes]);

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine) { setMsgSync('Sem internet — os dados ficam guardados no aparelho.'); return; }
    if (modoOffline()) {
      setMsgSync('Você entrou no modo offline. Agora que há internet, saia e entre de novo para enviar os dados.');
      return;
    }
    setSincronizando(true); setMsgSync('');
    try {
      const enviados = await pushColetasPendentes();
      const fotos = await subirFotosPendentes();
      const medicoes = await pushMedicoesPendentes().catch(() => 0);
      const leituras = await pushLeiturasCompactPendentes().catch(() => 0);
      await bootCloud().catch(() => {});
      let recebidas = 0;
      if (sel.gradeId) recebidas = await pullColetas(sel.gradeId).catch(() => 0);
      marcarUltimoSync();
      setMsgSync(
        `✓ ${enviados} coleta(s) e ${fotos.enviadas} foto(s) enviadas` +
        (medicoes ? ` · ${medicoes} medição(ões)` : '') +
        (leituras ? ` · ${leituras} leitura(s) de compactação` : '') +
        (recebidas ? ` · ${recebidas} recebida(s)` : '') +
        (fotos.erro ? ` — ⚠ ${fotos.erro}` : ''),
      );
    } catch {
      setMsgSync('⚠ Falha ao sincronizar — tente novamente.');
    }
    setSincronizando(false);
    setReload(x => x + 1);
  }, [sel.gradeId]);
  sincronizarRef.current = sincronizar;

  // ao abrir uma grade: puxa coletas já feitas por outros aparelhos
  useEffect(() => {
    if (sel.gradeId && navigator.onLine) {
      void pullColetas(sel.gradeId).then(n => { if (n) setReload(x => x + 1); }).catch(() => {});
    }
  }, [sel.gradeId]);

  if (modulo === 'medicao') {
    return <MedicaoScreen onVoltar={() => setModulo(null)} />;
  }
  if (modulo === 'mancha') {
    return <ManchaScreen onVoltar={() => setModulo(null)} />;
  }
  if (modulo === 'compactacao') {
    return <CompactacaoScreen onVoltar={() => setModulo(null)} />;
  }
  if (modulo !== 'amostragem') {
    return <TelaInicio online={online} pend={pend} sincronizar={sincronizar}
      sincronizando={sincronizando} msgSync={msgSync} instalar={instalar} onEscolher={setModulo} />;
  }
  if (!sel.gradeId) {
    return <TelaSelecao sel={sel} setSel={setSel} online={online} pend={pend}
      sincronizar={sincronizar} sincronizando={sincronizando} msgSync={msgSync} instalar={instalar}
      onHome={() => setModulo(null)} />;
  }
  return <TelaMapa sel={sel} setSel={setSel} online={online} pend={pend} reload={reload}
    setReload={setReload} sincronizar={sincronizar} sincronizando={sincronizando} msgSync={msgSync} />;
}

// ═══ Tela 0 — Início (módulos do app de campo) ════════════════════════════════

type ModuloId = 'amostragem' | 'medicao' | 'mancha' | 'compactacao';
const MODULOS: { id: ModuloId; icone: React.ElementType; cor: string; corIcone: string; titulo: string; desc: string }[] = [
  { id: 'amostragem', icone: Grid3x3, cor: '#166534', corIcone: '#86efac', titulo: 'Amostragem de Solo', desc: 'Navegue por GPS até os pontos da grade e registre as coletas (offline)' },
  { id: 'medicao', icone: Ruler, cor: '#1e3a8a', corIcone: '#93c5fd', titulo: 'Medição', desc: 'Meça áreas (polígono) e distâncias (linha) tocando no mapa ou caminhando com o GPS' },
  { id: 'mancha', icone: Satellite, cor: '#3730a3', corIcone: '#a5b4fc', titulo: 'NDVI / Mancha', desc: 'Baixe o mapa de NDVI no Wi-Fi e navegue por GPS até a mancha no campo (offline)' },
  { id: 'compactacao', icone: Gauge, cor: '#78350f', corIcone: '#fbbf24', titulo: 'Compactação', desc: 'Navegue até os pontos da grade e registre as leituras do penetrômetro por profundidade (offline)' },
];

function TelaInicio({ online, pend, sincronizar, sincronizando, msgSync, instalar, onEscolher }: {
  online: boolean; pend: { regs: number; fotos: number };
  sincronizar: () => Promise<void>; sincronizando: boolean; msgSync: string;
  instalar: (() => void) | null;
  onEscolher: (m: ModuloId) => void;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: AZUL_ESC }}>
      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: AZUL, borderBottom: `1px solid ${BORDA}` }}>
        <Image src="/images/logo-branca.png" alt="Invicta" width={88} height={26} priority
          style={{ objectFit: 'contain', height: 26, width: 'auto' }} />
        <div className="flex items-center gap-2">
          {online
            ? <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#4ade80' }}><Wifi size={13} /> Online</span>
            : <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#fbbf24' }}><WifiOff size={13} /> Offline</span>}
          <button onClick={() => logout()} className="p-1.5 rounded" style={{ color: '#93c5fd' }} title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ background: '#0b1d3a', borderBottom: `1px solid ${BORDA}` }}>
        <button onClick={() => void sincronizar()} disabled={sincronizando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--invicta-blue-mid)' }}>
          {sincronizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar
        </button>
        {(pend.regs > 0 || pend.fotos > 0) && (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#fbbf24' }}>
            <CloudUpload size={12} /> {pend.regs} coleta(s) · {pend.fotos} foto(s) a enviar
          </span>
        )}
        {instalar && (
          <button onClick={instalar} className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-bold"
            style={{ background: '#166534', color: '#86efac' }}>
            📲 Instalar app
          </button>
        )}
      </div>
      {msgSync && <p className="px-4 py-1.5 text-[10px]" style={{ color: '#94a3b8', background: '#0b1d3a' }}>{msgSync}</p>}

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#93c5fd' }}>Módulos de campo</p>
        {MODULOS.map(m => (
          <button key={m.id} onClick={() => onEscolher(m.id)}
            className="w-full flex items-center gap-4 px-4 py-5 rounded-2xl text-left active:opacity-70"
            style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: m.cor }}>
              <m.icone size={22} style={{ color: m.corIcone }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold" style={{ color: TXT }}>{m.titulo}</p>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: SUB }}>{m.desc}</p>
            </div>
            <ChevronRight size={18} style={{ color: SUB }} className="flex-shrink-0" />
          </button>
        ))}
        <p className="text-[10px] pt-1" style={{ color: '#334155' }}>
          Mais módulos chegam aqui conforme forem liberados.
        </p>
      </main>

      <p className="flex items-center justify-center gap-2 text-[10px] py-2" style={{ color: '#334155' }}>
        {emailUsuario() || ''} · INVICTA Campo · v{APP_VERSION}
        <SyncBadge />
      </p>
    </div>
  );
}

// ═══ Tela 1 — Seleção ═════════════════════════════════════════════════════════

function TelaSelecao({ sel, setSel, online, pend, sincronizar, sincronizando, msgSync, instalar, onHome }: {
  sel: Selecao; setSel: (s: Selecao) => void; online: boolean;
  pend: { regs: number; fotos: number };
  sincronizar: () => Promise<void>; sincronizando: boolean; msgSync: string;
  instalar: (() => void) | null;
  onHome: () => void;
}) {
  const produtores = useMemo(() => getClientes(), []);
  const fazendas = useMemo(() => sel.produtorId ? getFazendas(sel.produtorId) : [], [sel.produtorId]);
  const talhoes = useMemo(() => sel.fazendaId ? getTalhoes(sel.fazendaId).filter(t => t.geojson) : [], [sel.fazendaId]);
  const safras = useMemo(() => getSafras(), []);
  const grades = useMemo(
    () => sel.talhaoId && sel.safra ? getGrades(sel.talhaoId, sel.safra) : [],
    [sel.talhaoId, sel.safra],
  );
  const [aba, setAba] = useState<'navegar' | 'grades'>('navegar');
  const ult = ultimoSync();

  const passos = [
    { rotulo: 'Produtor', valor: sel.produtor },
    { rotulo: 'Fazenda', valor: sel.fazenda },
    { rotulo: 'Talhão', valor: sel.talhao },
    { rotulo: 'Ciclo', valor: sel.safra ?? '' },
  ].filter(p => p.valor);

  function voltar() {
    if (sel.safra) setSel({ ...sel, safra: null });
    else if (sel.talhaoId) setSel({ ...sel, talhaoId: null, talhao: '' });
    else if (sel.fazendaId) setSel({ ...sel, fazendaId: null, fazenda: '' });
    else if (sel.produtorId) setSel({ ...sel, produtorId: null, produtor: '' });
    else onHome();
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: AZUL_ESC }}>
      {/* topo */}
      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: AZUL, borderBottom: `1px solid ${BORDA}` }}>
        <Image src="/images/logo-branca.png" alt="Invicta" width={88} height={26} priority
          style={{ objectFit: 'contain', height: 26, width: 'auto' }} />
        <div className="flex items-center gap-2">
          {online
            ? <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#4ade80' }}><Wifi size={13} /> Online</span>
            : <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#fbbf24' }}><WifiOff size={13} /> Offline</span>}
          <button onClick={() => logout()} className="p-1.5 rounded" style={{ color: '#93c5fd' }} title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* barra de sincronização */}
      <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ background: '#0b1d3a', borderBottom: `1px solid ${BORDA}` }}>
        <button onClick={() => void sincronizar()} disabled={sincronizando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--invicta-blue-mid)' }}>
          {sincronizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar
        </button>
        {(pend.regs > 0 || pend.fotos > 0) && (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#fbbf24' }}>
            <CloudUpload size={12} /> {pend.regs} coleta(s) · {pend.fotos} foto(s) a enviar
          </span>
        )}
        {instalar && (
          <button onClick={instalar} className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-bold"
            style={{ background: '#166534', color: '#86efac' }}>
            📲 Instalar app
          </button>
        )}
      </div>
      {msgSync && <p className="px-4 py-1.5 text-[10px]" style={{ color: '#94a3b8', background: '#0b1d3a' }}>{msgSync}</p>}
      {ult && (
        <p className="px-4 py-1 text-[10px] flex-shrink-0" style={{ color: '#475569', background: '#0a1929' }}>
          Última atualização em {new Date(ult).toLocaleString('pt-BR')}
        </p>
      )}

      {/* abas: navegar (passo a passo) | grades (lista filtrável) */}
      <div className="flex gap-1.5 px-4 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDA}` }}>
        {([['navegar', 'Navegar'], ['grades', 'Grades']] as const).map(([id, r]) => (
          <button key={id} onClick={() => setAba(id)}
            className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold"
            style={{ background: aba === id ? '#2e5fa3' : BORDA, color: aba === id ? '#fff' : '#94a3b8' }}>
            {r}
          </button>
        ))}
      </div>

      {aba === 'grades' ? (
        <AbaGrades sel={sel} setSel={setSel} />
      ) : (
        <>
          {/* breadcrumb */}
          <div className="px-4 py-2.5 flex items-center gap-1.5 text-[11px] flex-wrap" style={{ borderBottom: `1px solid ${BORDA}` }}>
            <button onClick={voltar} className="p-1 rounded mr-1" style={{ background: BORDA, color: '#93c5fd' }}>
              <ChevronLeft size={14} />
            </button>
            {passos.length === 0 && <span style={{ color: SUB }}>Selecione o produtor para começar</span>}
            {passos.map((p, i) => (
              <span key={p.rotulo} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={11} style={{ color: SUB }} />}
                <span style={{ color: SUB }}>{p.rotulo}:</span>
                <span className="font-bold" style={{ color: TXT }}>{p.valor}</span>
              </span>
            ))}
          </div>

          {/* lista do passo atual */}
          <main className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {!sel.produtorId ? (
              <Lista titulo="Produtor" vazio="Nenhum produtor sincronizado — conecte e sincronize."
                itens={produtores.map(p => ({ id: p.id, nome: p.nome }))}
                onEscolher={it => setSel({ ...sel, produtorId: it.id, produtor: it.nome })} />
            ) : !sel.fazendaId ? (
              <Lista titulo="Fazenda" vazio="Nenhuma fazenda deste produtor."
                itens={fazendas.map(f => ({ id: f.id, nome: f.nome, sub: f.municipio || undefined }))}
                onEscolher={it => setSel({ ...sel, fazendaId: it.id, fazenda: it.nome })} />
            ) : !sel.talhaoId ? (
              <Lista titulo="Talhão" vazio="Nenhum talhão com limite geográfico nesta fazenda."
                itens={talhoes.map(t => ({ id: t.id, nome: t.nome, sub: `${t.areaHa.toLocaleString('pt-BR')} ha` }))}
                onEscolher={it => {
                  const t = talhoes.find(x => x.id === it.id)!;
                  setSel({ ...sel, talhaoId: t.id, talhao: t.nome });
                }} />
            ) : !sel.safra ? (
              <Lista titulo="Ciclo (safra)" vazio="Nenhuma safra cadastrada."
                itens={safras.map(s => ({ id: s.nome, nome: s.nome, sub: s.ativa ? 'safra ativa' : undefined }))}
                onEscolher={it => setSel({ ...sel, safra: it.id })} />
            ) : (
              <Lista titulo="Área de coleta (grade)" vazio="Nenhuma grade de amostragem deste talhão nesta safra — gere a grade na plataforma e sincronize."
                itens={grades.map(g => ({
                  id: g.id, nome: g.nome,
                  sub: `${g.pontos.length} pontos · ${g.profundidades.map(p => p.rotulo).join(' / ')} · ${g.metodo === 'zonas' ? 'por zonas' : 'grade'}`,
                }))}
                onEscolher={it => setSel({ ...sel, gradeId: it.id })} />
            )}
          </main>
        </>
      )}

      <p className="flex items-center justify-center gap-2 text-[10px] py-2" style={{ color: '#334155' }}>
        {emailUsuario() || ''} · INVICTA Coleta de Solo · v{APP_VERSION}
        <SyncBadge />
      </p>
    </div>
  );
}

// ── Aba Grades: lista plana filtrável (safra + busca + status + sync) ─────────
function selDaGrade(g: GradeAmostragem): Selecao {
  const t = getTalhoes().find(x => x.id === g.talhaoId) ?? null;
  const f = t ? getFazendas().find(x => x.id === t.fazendaId) ?? null : null;
  const c = f ? getClientes().find(x => x.id === f.clienteId) ?? null : null;
  return {
    produtorId: c?.id ?? null, produtor: c?.nome ?? '',
    fazendaId: f?.id ?? null, fazenda: f?.nome ?? '',
    talhaoId: g.talhaoId, talhao: t?.nome ?? '',
    safra: g.safra, gradeId: g.id,
  };
}

function AbaGrades({ sel, setSel }: { sel: Selecao; setSel: (s: Selecao) => void }) {
  const safras = useMemo(() => getSafras(), []);
  const [safraSel, setSafraSel] = useState(
    sel.safra || safras.find(s => s.ativa)?.nome || safras[0]?.nome || '',
  );
  const [busca, setBusca] = useState('');
  const [fStatus, setFStatus] = useState<'todas' | StatusGrade>('todas');
  const [fSync, setFSync] = useState<'todas' | 'sinc' | 'pend'>('todas');
  const [baixando, setBaixando] = useState<{ feitos: number; total: number } | null>(null);
  const [msg, setMsg] = useState('');

  // talhões visíveis (getTalhoes já vem filtrado pelo escopo do usuário)
  const talhoesVis = useMemo(() => {
    const m = new Map<string, Talhao>();
    for (const t of getTalhoes()) m.set(t.id, t);
    return m;
  }, []);

  const linhas = useMemo(() => {
    return getGrades(undefined, safraSel)
      .filter(g => talhoesVis.has(g.talhaoId))
      .map(g => {
        const t = talhoesVis.get(g.talhaoId)!;
        const cols = getColetas(g.id);
        return {
          g, t,
          st: statusGrade(cols, g.pontos.length),
          feitos: cols.filter(c => c.status !== 'pendente').length,
          pend: gradeTemPendencia(cols),
        };
      });
  }, [safraSel, talhoesVis]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(l => {
      if (q && !`${l.g.nome} ${l.t.nome}`.toLowerCase().includes(q)) return false;
      if (fStatus !== 'todas' && l.st !== fStatus) return false;
      if (fSync === 'sinc' && l.pend) return false;
      if (fSync === 'pend' && !l.pend) return false;
      return true;
    });
  }, [linhas, busca, fStatus, fSync]);

  async function baixarUma(t: Talhao) {
    if (!t.bbox || baixando) return;
    setBaixando({ feitos: 0, total: 1 }); setMsg('');
    const r = await baixarTilesOffline(t.bbox, (f, tot) => setBaixando({ feitos: f, total: tot }));
    setBaixando(null);
    setMsg(`Mapa de ${t.nome}: ${r.ok}/${r.total} imagens no aparelho.`);
  }
  async function baixarTodas() {
    const bboxes = [...new Map(
      filtradas.filter(l => l.t.bbox).map(l => [l.t.id, l.t.bbox!]),
    ).values()];
    if (bboxes.length === 0 || baixando) return;
    setBaixando({ feitos: 0, total: 1 }); setMsg('');
    const r = await baixarTilesVarios(bboxes, (f, tot) => setBaixando({ feitos: f, total: tot }));
    setBaixando(null);
    setMsg(`Mapas de ${bboxes.length} talhão(ões): ${r.ok}/${r.total} imagens no aparelho.`);
  }

  const chip = (ativo: boolean) => ({
    background: ativo ? '#2e5fa3' : BORDA, color: ativo ? '#fff' : '#94a3b8',
  });

  return (
    <>
      {/* safra + baixar todos */}
      <div className="px-4 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: `1px solid #0f2240` }}>
        <select value={safraSel} onChange={e => setSafraSel(e.target.value)}
          className="flex-1 rounded-lg px-2 py-2 text-xs font-bold outline-none"
          style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
          {safras.map(s => <option key={s.nome} value={s.nome}>{s.nome}{s.ativa ? ' (ativa)' : ''}</option>)}
        </select>
        <button onClick={() => void baixarTodas()} disabled={!!baixando || filtradas.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-40"
          style={{ background: '#166534' }} title="Baixar os mapas de todos os talhões da lista">
          {baixando ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
          Baixar todos
        </button>
      </div>

      {/* busca */}
      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: BORDA, border: '1px solid #2e5fa3' }}>
          <Search size={13} style={{ color: SUB }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar pelo nome da grade ou talhão"
            className="flex-1 bg-transparent text-xs outline-none" style={{ color: TXT }} />
        </div>
      </div>

      {/* filtros de status + sincronização */}
      <div className="px-4 pb-2 flex gap-1.5 flex-wrap flex-shrink-0">
        {([['todas', 'Todas'], ['nova', 'Nova'], ['iniciada', 'Iniciada'], ['finalizada', 'Finalizada']] as const).map(([id, r]) => (
          <button key={id} onClick={() => setFStatus(id)} className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={chip(fStatus === id)}>{r}</button>
        ))}
        <span className="w-px my-0.5" style={{ background: BORDA }} />
        {([['sinc', 'Sincronizadas'], ['pend', 'Pendentes']] as const).map(([id, r]) => (
          <button key={id} onClick={() => setFSync(fSync === id ? 'todas' : id)} className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={chip(fSync === id)}>{r}</button>
        ))}
      </div>

      {baixando && (
        <p className="px-4 py-1 text-[10px] flex-shrink-0" style={{ color: '#86efac' }}>
          Baixando mapas… {baixando.feitos}/{baixando.total}
        </p>
      )}
      {msg && <p className="px-4 py-1 text-[10px] flex-shrink-0" style={{ color: '#94a3b8' }}>{msg}</p>}

      <main className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {filtradas.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: SUB }}>
            Nenhuma grade nesta safra com esses filtros. Gere a grade na plataforma e sincronize.
          </p>
        ) : filtradas.map(({ g, t, st, feitos, pend }) => (
          <div key={g.id} className="flex items-center gap-3 px-3.5 py-3 rounded-xl"
            style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COR_GRADE[st] }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: TXT }}>{g.nome}</p>
              <p className="text-[10px] truncate" style={{ color: SUB }}>
                {t.nome} · {g.pontos.length} pts · {feitos}/{g.pontos.length}
                <span style={{ color: COR_GRADE[st] }}> · {ROTULO_GRADE[st]}</span>
                {pend ? <span style={{ color: '#fbbf24' }}> · a enviar</span> : ''}
              </p>
            </div>
            <button onClick={() => setSel(selDaGrade(g))} title="Abrir no mapa"
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }}>
              <Eye size={15} />
            </button>
            <button onClick={() => void baixarUma(t)} disabled={!t.bbox || !!baixando} title="Baixar mapa offline"
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-40" style={{ background: BORDA, color: '#86efac' }}>
              <Download size={15} />
            </button>
          </div>
        ))}
      </main>
    </>
  );
}

function Lista({ titulo, itens, vazio, onEscolher }: {
  titulo: string; vazio: string;
  itens: { id: string; nome: string; sub?: string }[];
  onEscolher: (it: { id: string; nome: string }) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#93c5fd' }}>{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: SUB }}>{vazio}</p>
      ) : (
        <div className="space-y-2">
          {itens.map(it => (
            <button key={it.id} onClick={() => onEscolher(it)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left active:opacity-70"
              style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
              <MapPin size={16} style={{ color: '#86efac' }} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: TXT }}>{it.nome}</p>
                {it.sub && <p className="text-[10px] mt-0.5" style={{ color: SUB }}>{it.sub}</p>}
              </div>
              <ChevronRight size={16} style={{ color: SUB }} className="flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ Tela 2 — Mapa + navegação + coleta ═══════════════════════════════════════

const FILTROS: (StatusPonto | 'todos')[] = ['todos', 'pendente', 'coletado', 'pulado', 'cancelado'];

function TelaMapa({ sel, setSel, online, pend, reload, setReload, sincronizar, sincronizando, msgSync }: {
  sel: Selecao; setSel: (s: Selecao) => void; online: boolean;
  pend: { regs: number; fotos: number }; reload: number;
  setReload: (fn: (x: number) => number) => void;
  sincronizar: () => Promise<void>; sincronizando: boolean; msgSync: string;
}) {
  const grade: GradeAmostragem | null = useMemo(
    () => getGrades(sel.talhaoId!, sel.safra!).find(g => g.id === sel.gradeId) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel.gradeId, reload],
  );
  const talhao = useMemo(
    () => getTalhoes().find(t => t.id === sel.talhaoId) ?? null,
    [sel.talhaoId],
  );
  const talhaoFC = useMemo(() => talhaoComoFC(talhao), [talhao]);

  // bbox pra enquadrar: o do talhão, ou (fallback) o dos pontos da grade
  const bboxArea = useMemo<[number, number, number, number] | null>(() => {
    if (talhao?.bbox) return talhao.bbox;
    if (!grade || grade.pontos.length === 0) return null;
    let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of grade.pontos) {
      a = Math.min(a, p.lng); b = Math.min(b, p.lat);
      c = Math.max(c, p.lng); d = Math.max(d, p.lat);
    }
    const mLng = (c - a) * 0.1 || 0.002, mLat = (d - b) * 0.1 || 0.002;
    return [a - mLng, b - mLat, c + mLng, d + mLat];
  }, [talhao, grade]);
  const coletas = useMemo(() => (sel.gradeId ? getColetas(sel.gradeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel.gradeId, reload]);

  const [cfg, setCfg] = useState(() => getConfigColeta());
  const [modo, setModo] = useState<'sat' | 'ruas'>('sat');
  const [seguir, setSeguir] = useState(false);
  const [pedidoGps, setPedidoGps] = useState(0);
  const [pedidoEnquadrar, setPedidoEnquadrar] = useState(0);
  const [filtro, setFiltro] = useState<StatusPonto | 'todos'>('todos');
  const [alvoOrdem, setAlvoOrdem] = useState<number | null>(null);
  const { userPos, velKmH, gpsErro } = useGps();
  const [mostraLista, setMostraLista] = useState(false);
  const [mostraCfg, setMostraCfg] = useState(false);
  const [coletando, setColetando] = useState(false);
  const [baixando, setBaixando] = useState<{ feitos: number; total: number } | null>(null);
  const avisadoRef = useRef(false);

  // tela ligada durante o trabalho (quando o navegador suporta)
  useEffect(() => {
    type NavWakeLock = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    let lock: { release: () => Promise<void> } | null = null;
    const pedir = () => {
      (navigator as NavWakeLock).wakeLock?.request('screen')
        .then(l => { lock = l; })
        .catch(() => {});
    };
    pedir();
    const onVis = () => { if (document.visibilityState === 'visible') pedir(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  const statusDe = useCallback((ordem: number): StatusPonto =>
    coletas.find(c => c.ordem === ordem)?.status ?? 'pendente', [coletas]);

  const pontosFC: GeoJSON.FeatureCollection = useMemo(() => {
    if (!grade) return { type: 'FeatureCollection', features: [] };
    const feats: GeoJSON.Feature[] = grade.pontos
      .filter(p => filtro === 'todos' || statusDe(p.ordem) === filtro || p.ordem === alvoOrdem)
      .map(p => {
        const status = statusDe(p.ordem);
        const multiProf = (p.profundidades?.length ?? 0) > 1;
        const cor = p.ordem === alvoOrdem
          ? '#60a5fa'
          : (multiProf && status === 'pendente') ? COR_MULTI_PROF : COR_STATUS[status];
        return {
          type: 'Feature' as const,
          properties: {
            ordem: p.ordem,
            codigo: codigoPonto(p),
            cor,
            sel: p.ordem === alvoOrdem,
          },
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        };
      });
    return { type: 'FeatureCollection', features: feats };
  }, [grade, filtro, alvoOrdem, statusDe]);

  const alvoPonto = useMemo(
    () => (grade && alvoOrdem != null ? grade.pontos.find(p => p.ordem === alvoOrdem) ?? null : null),
    [grade, alvoOrdem],
  );
  const dist = userPos && alvoPonto ? distanciaM(userPos.lng, userPos.lat, alvoPonto.lng, alvoPonto.lat) : null;
  const dentroRaio = dist != null && dist <= cfg.raioM;

  // vibra + apita ao ENTRAR no raio (uma vez por entrada)
  useEffect(() => {
    if (dentroRaio && !avisadoRef.current) { avisadoRef.current = true; avisoDentroRaio(); }
    if (!dentroRaio) avisadoRef.current = false;
  }, [dentroRaio]);

  // grade tem algum ponto com 2+ profundidades? (só então mostra a legenda da cor)
  const temMultiProf = useMemo(
    () => grade?.pontos.some(p => (p.profundidades?.length ?? 0) > 1) ?? false,
    [grade],
  );

  const progresso = useMemo(() => {
    if (!grade) return { feitos: 0, total: 0 };
    const feitos = grade.pontos.filter(p => statusDe(p.ordem) === 'coletado').length;
    return { feitos, total: grade.pontos.length };
  }, [grade, statusDe]);

  function marcarStatus(ordem: number, status: StatusPonto, extra?: Partial<RegistroColeta>) {
    if (!grade) return;
    const p = grade.pontos.find(x => x.ordem === ordem);
    if (!p) return;
    upsertColeta({
      id: idColeta(grade.id, ordem), gradeId: grade.id, talhaoId: grade.talhaoId,
      safra: grade.safra, ordem, codigo: codigoPonto(p), status,
      operador: emailUsuario() || undefined,
      horario: new Date().toISOString(),
      lngReal: userPos?.lng, latReal: userPos?.lat, precisaoM: userPos?.acc,
      distanciaAlvoM: dist ?? undefined,
      ...extra,
    });
    setReload(x => x + 1);
  }

  async function baixarMapa() {
    if (!talhao?.bbox || baixando) return;
    setBaixando({ feitos: 0, total: 1 });
    const r = await baixarTilesOffline(talhao.bbox, (feitos, total) => setBaixando({ feitos, total }));
    setBaixando(null);
    alert(`Mapa offline: ${r.ok} de ${r.total} imagens baixadas.`);
  }

  if (!grade) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: AZUL_ESC }}>
        <p className="text-xs" style={{ color: SUB }}>Grade não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: AZUL }}>
      <MapaColeta
        talhaoGeo={talhaoFC} bbox={bboxArea} pontos={pontosFC}
        userPos={userPos} alvo={alvoPonto ? { lng: alvoPonto.lng, lat: alvoPonto.lat } : null}
        raioM={cfg.raioM} modo={modo} seguirGps={seguir}
        pedidoGps={pedidoGps} pedidoEnquadrar={pedidoEnquadrar}
        onSelecionarPonto={ordem => { setAlvoOrdem(ordem); avisadoRef.current = false; }}
        onGestoUsuario={() => setSeguir(false)}
      />

      {/* topo: voltar + contexto + sync */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
        style={{ background: 'rgba(6,21,37,0.92)', borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <button onClick={() => setSel({ ...sel, gradeId: null })}
          className="p-1.5 rounded-lg flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: TXT }}>{sel.talhao} · {grade.nome}</p>
          <p className="text-[10px]" style={{ color: SUB }}>
            {progresso.feitos}/{progresso.total} coletados · {sel.safra}
          </p>
        </div>
        {online
          ? <Wifi size={14} style={{ color: '#4ade80' }} className="flex-shrink-0" />
          : <WifiOff size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0" />}
        <button onClick={() => void sincronizar()} disabled={sincronizando}
          className="relative p-1.5 rounded-lg flex-shrink-0 disabled:opacity-50" style={{ background: BORDA, color: '#93c5fd' }}>
          {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {pend.regs + pend.fotos > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center"
              style={{ background: '#f59e0b', color: '#000' }}>{pend.regs + pend.fotos}</span>
          )}
        </button>
      </div>

      {/* leitura de GPS */}
      <div className="absolute left-3 flex flex-col gap-1" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        {alvoPonto && dist != null && (
          <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(6,21,37,0.92)', border: `1px solid ${dentroRaio ? '#4ade80' : BORDA}` }}>
            <p className="text-[9px] font-bold uppercase" style={{ color: dentroRaio ? '#4ade80' : '#93c5fd' }}>
              {dentroRaio ? '✓ Dentro do raio' : `→ ${codigoPonto(alvoPonto)}`}
            </p>
            <p className="text-2xl font-black leading-tight" style={{ color: dentroRaio ? '#4ade80' : '#fff' }}>
              {formatarDist(dist)}
            </p>
          </div>
        )}
        {userPos && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
            style={{ background: 'rgba(6,21,37,0.85)', color: userPos.acc <= 8 ? '#4ade80' : userPos.acc <= 20 ? '#fbbf24' : '#f87171' }}>
            GPS ±{Math.round(userPos.acc)} m{velKmH != null && velKmH > 0.7 ? ` · ${velKmH.toFixed(0)} km/h` : ''}
          </div>
        )}
        {gpsErro && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1"
            style={{ background: '#78350f', color: '#fde68a' }}>
            <AlertTriangle size={11} /> {gpsErro}
          </div>
        )}
      </div>

      {/* botões laterais */}
      <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        <BotaoMapa ativo={seguir}
          onClick={() => { setSeguir(true); setPedidoGps(x => x + 1); }}
          titulo="Ir para onde estou (GPS)"><Crosshair size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => { setSeguir(false); setPedidoEnquadrar(x => x + 1); }}
          titulo="Ver a área de coleta"><Maximize2 size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => setModo(m => (m === 'sat' ? 'ruas' : 'sat'))} titulo="Satélite / Ruas"><Layers size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => setMostraLista(true)} titulo="Lista de pontos"><List size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => void baixarMapa()} titulo="Baixar mapa offline">
          {baixando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        </BotaoMapa>
        <BotaoMapa onClick={() => setMostraCfg(true)} titulo="Configurações"><Settings size={18} /></BotaoMapa>
      </div>
      {baixando && (
        <div className="absolute right-3 px-2 py-1 rounded text-[9px] font-bold"
          style={{ top: 'calc(56px + env(safe-area-inset-top) + 220px)', background: 'rgba(6,21,37,0.9)', color: '#93c5fd' }}>
          {baixando.feitos}/{baixando.total}
        </div>
      )}

      {/* filtros + painel do ponto */}
      <div className="absolute bottom-0 left-0 right-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {msgSync && (
          <p className="mx-3 mb-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'rgba(6,21,37,0.92)', color: '#94a3b8' }}>{msgSync}</p>
        )}
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto">
          {FILTROS.map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
              style={{
                background: filtro === f ? '#2e5fa3' : 'rgba(6,21,37,0.85)',
                color: filtro === f ? '#fff' : '#94a3b8',
                border: `1px solid ${filtro === f ? '#60a5fa' : BORDA}`,
              }}>
              {f === 'todos' ? 'Todos' : ROTULO_STATUS[f]}
            </button>
          ))}
        </div>
        {temMultiProf && (
          <p className="px-3 pb-1.5 -mt-1 flex items-center gap-1 text-[9px]" style={{ color: SUB }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COR_MULTI_PROF }} />
            2+ profundidades
          </p>
        )}

        <div style={{ background: 'rgba(6,21,37,0.95)', borderTop: `1px solid ${BORDA}` }}>
          {!alvoPonto ? (
            <p className="text-[11px] text-center py-3.5" style={{ color: SUB }}>
              Toque em um ponto do mapa (ou use a lista) para navegar até ele.
            </p>
          ) : (
            <PainelPonto
              grade={grade} ponto={alvoPonto} coleta={coletas.find(c => c.ordem === alvoPonto.ordem) ?? null}
              dentroRaio={dentroRaio} dist={dist} gpsOk={!!userPos}
              onIniciar={() => setColetando(true)}
              onPular={() => { if (confirm(`Pular o ponto ${codigoPonto(alvoPonto)}?`)) { marcarStatus(alvoPonto.ordem, 'pulado'); } }}
              onCancelar={() => { if (confirm(`Cancelar o ponto ${codigoPonto(alvoPonto)}?`)) { marcarStatus(alvoPonto.ordem, 'cancelado'); } }}
              onReabrir={() => marcarStatus(alvoPonto.ordem, 'pendente')}
              onFechar={() => setAlvoOrdem(null)}
            />
          )}
        </div>
      </div>

      {/* modais */}
      {mostraLista && (
        <ListaPontos grade={grade} statusDe={statusDe} userPos={userPos}
          onEscolher={ordem => { setAlvoOrdem(ordem); setMostraLista(false); avisadoRef.current = false; }}
          onFechar={() => setMostraLista(false)} />
      )}
      {mostraCfg && (
        <ConfigDialog cfg={cfg} onSalvar={c => { setCfg(c); saveConfigColeta(c); setMostraCfg(false); }}
          onFechar={() => setMostraCfg(false)} />
      )}
      {coletando && alvoPonto && (
        <ColetaDialog grade={grade} ponto={alvoPonto}
          onConfirmar={(dados) => {
            marcarStatus(alvoPonto.ordem, 'coletado', dados);
            setColetando(false);
            setAlvoOrdem(null);
          }}
          onFechar={() => setColetando(false)} />
      )}
    </div>
  );
}

function BotaoMapa({ children, onClick, titulo, ativo }: {
  children: React.ReactNode; onClick: () => void; titulo: string; ativo?: boolean;
}) {
  return (
    <button onClick={onClick} title={titulo}
      className="w-11 h-11 rounded-xl flex items-center justify-center active:opacity-70"
      style={{
        background: ativo ? '#2e5fa3' : 'rgba(6,21,37,0.92)',
        color: ativo ? '#fff' : '#93c5fd',
        border: `1px solid ${ativo ? '#60a5fa' : BORDA}`,
      }}>
      {children}
    </button>
  );
}

// ── painel do ponto selecionado ───────────────────────────────────────────────

function PainelPonto({ grade, ponto, coleta, dentroRaio, dist, gpsOk, onIniciar, onPular, onCancelar, onReabrir, onFechar }: {
  grade: GradeAmostragem; ponto: PontoAmostragem; coleta: RegistroColeta | null;
  dentroRaio: boolean; dist: number | null; gpsOk: boolean;
  onIniciar: () => void; onPular: () => void; onCancelar: () => void; onReabrir: () => void; onFechar: () => void;
}) {
  const status = coleta?.status ?? 'pendente';
  const profs = ponto.profundidades ?? grade.profundidades.map(p => p.rotulo);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COR_STATUS[status] }} />
        <p className="text-sm font-black" style={{ color: TXT }}>{codigoPonto(ponto)}</p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: BORDA, color: COR_STATUS[status] }}>
          {ROTULO_STATUS[status]}{coleta && !coleta.syncPendente && status === 'coletado' ? ' ✓ sinc.' : ''}
        </span>
        <button onClick={onFechar} className="ml-auto p-1" style={{ color: SUB }}><X size={16} /></button>
      </div>
      <p className="text-[10px] mt-1" style={{ color: SUB }}>
        Prof.: {profs.join(' / ')} · {ponto.lat.toFixed(6)}, {ponto.lng.toFixed(6)}
        {coleta?.horario ? ` · ${new Date(coleta.horario).toLocaleString('pt-BR')}` : ''}
      </p>

      {status === 'coletado' ? (
        <div className="flex gap-2 mt-2.5">
          <button onClick={onReabrir} className="flex-1 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: BORDA, color: '#93c5fd' }}>
            Reabrir ponto
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mt-2.5">
          <button onClick={onIniciar} disabled={!dentroRaio || !gpsOk}
            className="flex-[2] py-3 rounded-xl text-sm font-black text-white disabled:opacity-40"
            style={{ background: dentroRaio ? '#16a34a' : '#374151' }}>
            {dentroRaio ? '● Iniciar coleta' : dist != null ? `Aproxime-se (${formatarDist(dist)})` : 'Aguardando GPS…'}
          </button>
          <button onClick={onPular} className="flex-1 py-3 rounded-xl text-xs font-bold"
            style={{ background: BORDA, color: '#cbd5e1' }}>
            Pular
          </button>
          <button onClick={onCancelar} className="flex-1 py-3 rounded-xl text-xs font-bold"
            style={{ background: '#7f1d1d', color: '#fca5a5' }}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ── lista de pontos ───────────────────────────────────────────────────────────

function ListaPontos({ grade, statusDe, userPos, onEscolher, onFechar }: {
  grade: GradeAmostragem; statusDe: (ordem: number) => StatusPonto;
  userPos: PosOperador | null;
  onEscolher: (ordem: number) => void; onFechar: () => void;
}) {
  const [porDist, setPorDist] = useState(!!userPos);
  const itens = useMemo(() => {
    const arr = grade.pontos.map(p => ({
      p,
      dist: userPos ? distanciaM(userPos.lng, userPos.lat, p.lng, p.lat) : null,
    }));
    if (porDist && userPos) arr.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
    else arr.sort((a, b) => a.p.ordem - b.p.ordem);
    return arr;
  }, [grade, userPos, porDist]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: AZUL_ESC }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <p className="text-sm font-bold flex-1" style={{ color: TXT }}>Pontos — {grade.nome}</p>
        <button onClick={() => setPorDist(d => !d)} disabled={!userPos}
          className="px-2.5 py-1 rounded-full text-[10px] font-bold disabled:opacity-40"
          style={{ background: porDist ? '#2e5fa3' : BORDA, color: porDist ? '#fff' : '#94a3b8' }}>
          <Navigation size={10} className="inline mr-1" />mais próximo
        </button>
        <button onClick={onFechar} className="p-1.5" style={{ color: SUB }}><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {itens.map(({ p, dist }) => {
          const st = statusDe(p.ordem);
          return (
            <button key={p.ordem} onClick={() => onEscolher(p.ordem)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:opacity-70"
              style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COR_STATUS[st] }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: TXT }}>{codigoPonto(p)}</p>
                <p className="text-[10px]" style={{ color: SUB }}>
                  {ROTULO_STATUS[st]}{(p.profundidades ?? []).length ? ` · ${p.profundidades!.join(' / ')}` : ''}
                </p>
              </div>
              {dist != null && <span className="text-[11px] font-bold flex-shrink-0" style={{ color: '#93c5fd' }}>{formatarDist(dist)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── configurações ─────────────────────────────────────────────────────────────

function ConfigDialog({ cfg, onSalvar, onFechar }: {
  cfg: { raioM: number }; onSalvar: (c: { raioM: number }) => void; onFechar: () => void;
}) {
  const [raio, setRaio] = useState(cfg.raioM);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onFechar}>
      <div className="w-full max-w-md rounded-t-2xl p-5 space-y-4" style={{ background: AZUL, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold" style={{ color: TXT }}>Configurações</p>
        <div>
          <label className="text-[11px] font-semibold block mb-1" style={{ color: '#93c5fd' }}>
            Raio permitido para coletar: <strong>{raio} m</strong>
          </label>
          <input type="range" min={5} max={50} step={1} value={raio}
            onChange={e => setRaio(Number(e.target.value))} className="w-full" />
          <p className="text-[10px] mt-1" style={{ color: SUB }}>
            A coleta só habilita quando você está a até {raio} m do ponto planejado.
          </p>
        </div>
        <button onClick={() => onSalvar({ raioM: raio })}
          className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--invicta-green-dark)' }}>
          Salvar
        </button>
      </div>
    </div>
  );
}

// ── diálogo de coleta (profundidade, pesquisa, fotos, confirmação) ───────────

const TIPOS_FOTO: { tipo: TipoFoto; rotulo: string }[] = [
  { tipo: 'antes', rotulo: 'Antes' },
  { tipo: 'durante', rotulo: 'Durante' },
  { tipo: 'depois', rotulo: 'Após' },
];

function ColetaDialog({ grade, ponto, onConfirmar, onFechar }: {
  grade: GradeAmostragem; ponto: PontoAmostragem;
  onConfirmar: (dados: Partial<RegistroColeta>) => void; onFechar: () => void;
}) {
  const coletaId = idColeta(grade.id, ponto.ordem);
  const profsPonto = ponto.profundidades ?? grade.profundidades.map(p => p.rotulo);
  const [profs, setProfs] = useState<string[]>(profsPonto);
  const [umidade, setUmidade] = useState('');
  const [compactacao, setCompactacao] = useState('');
  const [problemas, setProblemas] = useState('');
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState<FotoColeta[]>([]);
  const [salvandoFoto, setSalvandoFoto] = useState<TipoFoto | null>(null);

  useEffect(() => {
    void fotosDaColeta(coletaId).then(setFotos).catch(() => {});
  }, [coletaId]);

  async function tirarFoto(tipo: TipoFoto, file: File | undefined) {
    if (!file) return;
    setSalvandoFoto(tipo);
    try {
      const blob = await comprimirFoto(file);
      await salvarFoto(coletaId, tipo, blob);
      setFotos(await fotosDaColeta(coletaId));
    } catch { alert('Não consegui salvar a foto.'); }
    setSalvandoFoto(null);
  }

  function toggleProf(rotulo: string) {
    setProfs(p => (p.includes(rotulo) ? p.filter(x => x !== rotulo) : [...p, rotulo]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-md rounded-t-2xl flex flex-col" style={{ background: AZUL, maxHeight: '92dvh' }}>
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: `1px solid ${BORDA}` }}>
          <p className="text-sm font-black flex-1" style={{ color: TXT }}>Coleta — {codigoPonto(ponto)}</p>
          <button onClick={onFechar} className="p-1" style={{ color: SUB }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* profundidades */}
          <div>
            <p className="text-[11px] font-bold uppercase mb-1.5" style={{ color: '#93c5fd' }}>Profundidades coletadas *</p>
            <div className="flex gap-2 flex-wrap">
              {profsPonto.map(r => (
                <button key={r} onClick={() => toggleProf(r)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold"
                  style={{
                    background: profs.includes(r) ? '#16a34a' : BORDA,
                    color: profs.includes(r) ? '#fff' : '#94a3b8',
                  }}>
                  {r} cm {profs.includes(r) ? '✓' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* pesquisa de campo */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Umidade do solo</label>
              <select value={umidade} onChange={e => setUmidade(e.target.value)}
                className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
                <option value="">—</option>
                <option>Seco</option><option>Úmido</option><option>Muito úmido</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Compactação aparente</label>
              <select value={compactacao} onChange={e => setCompactacao(e.target.value)}
                className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
                <option value="">—</option>
                <option>Baixa</option><option>Média</option><option>Alta</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Problemas encontrados</label>
            <input value={problemas} onChange={e => setProblemas(e.target.value)} placeholder="Ex.: pedras, raízes, encharcado…"
              className="w-full rounded-lg px-3 py-2 text-xs outline-none"
              style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }} />
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none"
              style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }} />
          </div>

          {/* fotos */}
          <div>
            <p className="text-[11px] font-bold uppercase mb-1.5" style={{ color: '#93c5fd' }}>Fotos do ponto</p>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS_FOTO.map(({ tipo, rotulo }) => {
                const daColeta = fotos.filter(f => f.tipo === tipo);
                return (
                  <label key={tipo} className="rounded-xl py-3 flex flex-col items-center gap-1 cursor-pointer active:opacity-70"
                    style={{ background: BORDA, border: '1px dashed #2e5fa3' }}>
                    {salvandoFoto === tipo
                      ? <Loader2 size={18} className="animate-spin" style={{ color: '#60a5fa' }} />
                      : daColeta.length > 0
                        ? <CheckCircle2 size={18} style={{ color: '#4ade80' }} />
                        : <Camera size={18} style={{ color: '#93c5fd' }} />}
                    <span className="text-[10px] font-bold" style={{ color: daColeta.length ? '#4ade80' : '#94a3b8' }}>
                      {rotulo}{daColeta.length ? ` (${daColeta.length})` : ''}
                    </span>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { void tirarFoto(tipo, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                );
              })}
            </div>
            <p className="text-[9px] mt-1" style={{ color: '#475569' }}>As fotos ficam no aparelho e sobem na sincronização.</p>
          </div>
        </div>

        <div className="px-5 py-3.5" style={{ borderTop: `1px solid ${BORDA}`, paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => onConfirmar({ profundidades: profs, umidade: umidade || undefined, compactacao: compactacao || undefined, problemas: problemas || undefined, obs: obs || undefined, fotos: fotos.length })}
            disabled={profs.length === 0}
            className="w-full py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
            style={{ background: '#16a34a' }}>
            ✓ Confirmar coleta
          </button>
        </div>
      </div>
    </div>
  );
}
