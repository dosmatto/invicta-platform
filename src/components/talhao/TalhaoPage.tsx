'use client';

// Página individual do talhão (tela cheia, rota /talhao/[id]).
// Central de trabalho organizada por SAFRA: barra de contexto fixa no topo,
// TRILHO de módulos à esquerda (64px) e o mapa ocupando todo o resto.
//
// O trilho substituiu a grade de 13 botões que quebrava em 3-4 linhas dentro de
// um painel de 440px travado: em notebook de 1024px aquilo comia 43% da largura
// o tempo todo, mesmo quando o agrônomo só queria olhar o mapa. Agora o painel
// do módulo ABRE ao clicar, FECHA no segundo clique (ou no X) e a borda é
// arrastável. Ele empurra o mapa em vez de flutuar por cima porque quase todo
// módulo daqui desenha uma camada no mapa — os dois têm que ser lidos juntos.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import {
  getTalhoes, getFazendas, getClientes, getSafras,
  getImportacoesLab, getGrades, getPlantio, setPlantio, CULTURAS,
  type Talhao, type Fazenda, type Cliente, type Safra,
} from '@/lib/store';
import { rotuloAno } from '@/lib/periodo';
import { FertilidadeSection } from '@/components/talhao/FertilidadeSection';
import { AmostragemModulo } from '@/components/talhao/AmostragemModulo';
import { CompactacaoSection } from '@/components/talhao/CompactacaoSection';
import { CondutividadeSection } from '@/components/talhao/CondutividadeSection';
import { AltimetriaSection } from '@/components/talhao/AltimetriaSection';
import { DiagnosticoIaCard } from '@/components/talhao/DiagnosticoIaCard';
import { ChatTalhaoCard } from '@/components/talhao/ChatTalhaoCard';
import { RecomendacaoSection } from '@/components/talhao/RecomendacaoSection';
import { PrescricoesSection } from '@/components/talhao/PrescricoesSection';
import { ArquivosSection } from '@/components/talhao/ArquivosSection';
import { LabImportSection } from '@/components/talhao/LabImportSection';
import { ImportarGradeSection } from '@/components/talhao/ImportarGradeSection';
import { GeradorRelatorios } from '@/components/talhao/GeradorRelatorios';
import { MeapSection } from '@/components/talhao/MeapSection';
import { NdviSection } from '@/components/talhao/NdviSection';
import { ProdutividadeSection } from '@/components/talhao/ProdutividadeSection';
import { papelDoUsuario, meuRegistro, planoPorId } from '@/lib/empresa';
import { tocarBackend } from '@/lib/interpUrl';
import { APP_VERSION } from '@/constants/version';
import {
  ChevronLeft, ChevronsLeft, ChevronsRight, X, Home, Leaf, Grid3x3, Layers, BarChart3, FileSpreadsheet,
  Activity, Satellite, FolderOpen, FileText, Clock, Zap, Mountain, SlidersHorizontal,
} from 'lucide-react';

const MapView = dynamic(
  () => import('@/components/map/MapView').then(m => ({ default: m.MapView })),
  { ssr: false, loading: () => <div className="w-full h-full" style={{ background: '#0a1929' }} /> },
);

type TabId =
  | 'resumo' | 'altimetria' | 'fertilidade' | 'amostragem' | 'zonas' | 'produtividade'
  | 'recomendacoes' | 'prescricoes' | 'compactacao' | 'condutividade' | 'ndvi' | 'arquivos' | 'relatorios';

// Ordem de TRABALHO do talhão (não-`pronto` = "em breve", cai no placeholder EmBreve).
// `curto` é o rótulo do TRILHO (64px de largura): nome inteiro só no cabeçalho
// do painel e no title do botão, senão a palavra quebra em três linhas e o
// trilho fica mais alto que a tela de 768px.
const TABS: Array<{ id: TabId; label: string; curto: string; icon: React.ElementType; pronto: boolean }> = [
  { id: 'resumo',        label: 'Resumo',           curto: 'Resumo',      icon: Home,            pronto: true },
  { id: 'altimetria',    label: 'Altimetria (MDE)', curto: 'Altimetria',  icon: Mountain,        pronto: true },
  { id: 'condutividade', label: 'Condutividade',    curto: 'Condut.',     icon: Zap,             pronto: true },
  { id: 'zonas',         label: 'Zonas de Manejo',  curto: 'Zonas',       icon: Layers,          pronto: true },
  { id: 'amostragem',    label: 'Amostragem',       curto: 'Amostrag.',   icon: Grid3x3,         pronto: true },
  { id: 'fertilidade',   label: 'Fertilidade',      curto: 'Fertilid.',   icon: Leaf,            pronto: true },
  { id: 'recomendacoes', label: 'Recomendações',    curto: 'Recom.',      icon: FileSpreadsheet, pronto: true },
  { id: 'prescricoes',   label: 'Prescrições',      curto: 'Prescr.',     icon: SlidersHorizontal, pronto: true },
  { id: 'arquivos',      label: 'Arquivos',         curto: 'Arquivos',    icon: FolderOpen,      pronto: true },
  { id: 'ndvi',          label: 'NDVI / Satélite',  curto: 'NDVI',        icon: Satellite,       pronto: true },
  { id: 'produtividade', label: 'Produtividade',    curto: 'Produtiv.',   icon: BarChart3,       pronto: true },
  { id: 'compactacao',   label: 'Compactação',      curto: 'Compact.',    icon: Activity,        pronto: true },
  { id: 'relatorios',    label: 'Relatórios',       curto: 'Relatórios',  icon: FileText,        pronto: true },
];

// ── Trilho + painel ──────────────────────────────────────────────────────────
const TRILHO_ABERTO = 64;   // ícone + rótulo (padrão)
const TRILHO_COMPACTO = 44; // só ícone, rótulo no title
const PAINEL_MIN = 320;     // abaixo disso as tabelas dos módulos quebram
const PAINEL_MAX = 760;
const MAPA_MIN = 300;       // o mapa nunca some: em 1024px ele ainda respira
const K_LARGURA = 'invicta.talhao.painel.largura';
const K_COMPACTO = 'invicta.talhao.trilho.compacto';

// Largura possível para o painel NESTA janela. É recalculada no arrasto e a
// cada resize — num notebook de 1024px o teto cai sozinho em vez de deixar o
// mapa virar uma tira.
function limitarLargura(px: number, trilho: number) {
  const teto = Math.max(PAINEL_MIN, Math.min(PAINEL_MAX, window.innerWidth - trilho - MAPA_MIN));
  return Math.round(Math.min(teto, Math.max(PAINEL_MIN, px)));
}

import { inputStyle } from '@/constants/ui';

export function TalhaoPage({ id }: { id: string }) {
  const router = useRouter();
  const { setNav, setMapMode, setUploadedGeo, setUploadedBbox, setZonasManejo } = useApp();

  const [talhao, setTalhao] = useState<Talhao | null>(null);
  const [fazenda, setFazenda] = useState<Fazenda | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [carregado, setCarregado] = useState(false);

  const [safras, setSafras] = useState<Safra[]>([]);
  const [safraSel, setSafraSel] = useState('');
  const [cultura, setCultura] = useState('');
  // `null` = painel fechado, mapa inteiro. Clicar de novo no item aberto fecha.
  const [tab, setTab] = useState<TabId | null>('resumo');
  const [trilhoCompacto, setTrilhoCompacto] = useState(false);
  const [larguraPainel, setLarguraPainel] = useState(440);
  const larguraTrilho = trilhoCompacto ? TRILHO_COMPACTO : TRILHO_ABERTO;

  // Carrega o talhão e a cadeia cliente/fazenda; alimenta o nav + geometria para
  // que MapView e os módulos reaproveitados funcionem como dentro do app.
  useEffect(() => {
    const t = getTalhoes().find(x => x.id === id) ?? null;
    const f = t ? getFazendas().find(x => x.id === t.fazendaId) ?? null : null;
    const c = f ? getClientes().find(x => x.id === f.clienteId) ?? null : null;
    setTalhao(t); setFazenda(f); setCliente(c);
    setCarregado(true);

    if (t) {
      setNav({
        talhaoId: t.id, talhao: t.nome,
        fazendaId: t.fazendaId, fazenda: f?.nome ?? '',
        produtorId: c?.id ?? null, produtor: c?.nome ?? '',
        area: t.areaHa,
      });
      setMapMode('satellite');
      if (t.geojson && t.bbox) {
        try { setUploadedGeo(JSON.parse(t.geojson) as GeoJSON.FeatureCollection); setUploadedBbox(t.bbox); }
        catch { /* geometria inválida — segue sem overlay */ }
      } else { setUploadedGeo(null); setUploadedBbox(null); }
      if (t.zonasGeojson) {
        // mantém limpo aqui; as zonas são publicadas pelos módulos quando usados
      }
    }
  }, [id, setNav, setMapMode, setUploadedGeo, setUploadedBbox]);

  // O servidor da nuvem adormece sem uso — o 1º toque já dispara a subida,
  // para os módulos (fertilidade, zonas, satélite…) o encontrarem acordado.
  useEffect(() => { tocarBackend(); }, []);

  // Safras: começa pela ativa (ou a primeira).
  useEffect(() => {
    const sf = getSafras();
    setSafras(sf);
    setSafraSel(prev => prev || sf.find(s => s.ativa)?.nome || sf[0]?.nome || '');
  }, []);

  // Cultura por talhão+safra (carrega ao trocar de safra).
  useEffect(() => { setCultura(safraSel ? getPlantio(id, safraSel) : ''); }, [id, safraSel]);

  function mudarCultura(v: string) {
    setCultura(v);
    if (safraSel) setPlantio(id, safraSel, v);
  }

  // Limpa os canais do mapa ao sair da página.
  useEffect(() => () => { setUploadedGeo(null); setUploadedBbox(null); setZonasManejo(null); }, [setUploadedGeo, setUploadedBbox, setZonasManejo]);

  // Preferências de layout (largura do painel e trilho compacto). Só depois da
  // hidratação: `window` não existe no servidor. Sem preferência salva, a tela
  // pequena já entra com um painel menor em vez de comer metade do mapa.
  useEffect(() => {
    let compacto = false;
    let largura = 0;
    try {
      compacto = localStorage.getItem(K_COMPACTO) === '1';
      largura = Number(localStorage.getItem(K_LARGURA)) || 0;
    } catch { /* modo privado: segue no padrão */ }
    setTrilhoCompacto(compacto);
    setLarguraPainel(limitarLargura(largura || (window.innerWidth <= 1100 ? 380 : 440),
      compacto ? TRILHO_COMPACTO : TRILHO_ABERTO));
  }, []);

  // Janela encolheu (ou girou o tablet): reaperta o painel para o mapa sobrar.
  useEffect(() => {
    function aoRedimensionar() { setLarguraPainel(w => limitarLargura(w, larguraTrilho)); }
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, [larguraTrilho]);

  function alternarTrilho() {
    setTrilhoCompacto(v => {
      const novo = !v;
      try { localStorage.setItem(K_COMPACTO, novo ? '1' : '0'); } catch { /* ignora */ }
      setLarguraPainel(w => limitarLargura(w, novo ? TRILHO_COMPACTO : TRILHO_ABERTO));
      return novo;
    });
  }

  // Arrasto da borda do painel. O valor final é guardado no `soltar` a partir
  // de uma variável local — ler o estado ali devolveria a largura de antes do
  // arrasto (a closure é do render em que o arrasto começou).
  function iniciarArrasto(e: React.MouseEvent) {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = larguraPainel;
    let atual = w0;
    function mover(ev: MouseEvent) {
      atual = limitarLargura(w0 + ev.clientX - x0, larguraTrilho);
      setLarguraPainel(atual);
    }
    function soltar() {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(K_LARGURA, String(atual)); } catch { /* ignora */ }
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  }

  function voltar() { router.push('/painel'); }

  if (carregado && !talhao) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3" style={{ background: '#061525' }}>
        <p className="text-sm" style={{ color: '#94a3b8' }}>Talhão não encontrado.</p>
        <button onClick={voltar} className="px-3 py-1.5 rounded text-xs font-bold text-white" style={{ background: 'var(--invicta-blue-mid)' }}>
          Voltar ao mapa
        </button>
      </div>
    );
  }

  // Produtor: read-only e só vê as abas que o plano de assinatura libera.
  const ehProdutor = papelDoUsuario() === 'produtor';
  const plano = ehProdutor ? planoPorId(meuRegistro()?.planoId) : null;
  const tabsVisiveis = ehProdutor ? TABS.filter(t => !!plano?.secoes?.[t.id]) : TABS;
  // Painel fechado é `null`; aba lembrada que o plano não libera cai na primeira.
  const tabAtivo: TabId | null = tab === null ? null
    : (tabsVisiveis.some(t => t.id === tab) ? tab : (tabsVisiveis[0]?.id ?? null));
  const abaAtual = tabAtivo ? tabsVisiveis.find(t => t.id === tabAtivo) ?? null : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#061525' }}>
      {/* Barra de contexto fixa */}
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5" style={{ background: 'var(--invicta-blue-dark)', borderBottom: '1px solid #1a3a6b' }}>
        <button onClick={ehProdutor ? () => router.push('/portal') : voltar} title={ehProdutor ? 'Voltar ao portal' : 'Voltar ao mapa da fazenda'}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold flex-shrink-0"
          style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <ChevronLeft size={14} /> {ehProdutor ? 'Portal' : 'Mapa'}
        </button>

        <div className="flex items-center gap-2 text-xs min-w-0" style={{ color: '#cbd5e1' }}>
          <Ctx label="Cliente" value={cliente?.nome ?? '—'} />
          <Sep /> <Ctx label="Fazenda" value={fazenda?.nome ?? '—'} />
          <Sep /> <Ctx label="Talhão" value={talhao?.nome ?? '—'} forte />
          <Sep /> <Ctx label="Área" value={talhao ? `${talhao.areaHa.toLocaleString('pt-BR')} ha` : '—'} />
          <Sep />
          {/* Ano ANTES da Cultura: é ele que manda: trocar o ano recarrega a
              cultura daquele ano (ver o efeito acima). Lado a lado e nesta
              ordem, o cabeçalho se lê como a pergunta que o usuário faz —
              "que ano? que cultura?" — em vez de deixar o Ano longe, na ponta
              direita, onde ninguém achava. */}
          <span className="flex items-center gap-1 flex-shrink-0">
            <span style={{ color: '#64748b' }}>Ano:</span>
            <select value={safraSel} onChange={e => setSafraSel(e.target.value)}
              title="Ano dos trabalhos exibidos neste talhão"
              className="rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle}>
              {safras.length === 0 && <option value="">— sem ano —</option>}
              {safras.map(s => <option key={s.id} value={s.nome}>{rotuloAno(s.nome)}</option>)}
            </select>
          </span>
          <Sep />
          <span className="flex items-center gap-1 flex-shrink-0">
            <span style={{ color: '#64748b' }}>Cultura:</span>
            <select value={cultura} onChange={e => mudarCultura(e.target.value)} disabled={!safraSel}
              title="Cultura deste ano neste talhão"
              className="rounded px-1.5 py-0.5 text-xs outline-none disabled:opacity-50" style={inputStyle}>
              <option value="">—</option>
              {CULTURAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Trilho de módulos — sempre visível, largura fixa. Clicar no módulo
            já aberto FECHA o painel e devolve a tela inteira ao mapa. */}
        <nav className="flex flex-col flex-shrink-0 overflow-y-auto py-1"
          style={{ width: larguraTrilho, background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
          {tabsVisiveis.map(t => {
            const sel = t.id === tabAtivo;
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(a => a === t.id ? null : t.id)}
                title={sel ? `Fechar ${t.label}` : t.label}
                className="flex flex-col items-center gap-1 w-full px-1 py-2 transition-colors flex-shrink-0"
                style={{
                  background: sel ? 'var(--invicta-blue)' : 'transparent',
                  color: sel ? '#fff' : (t.pronto ? 'var(--sidebar-text)' : '#475569'),
                  borderLeft: sel ? '3px solid var(--invicta-green)' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'; }}
                onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                <Icon size={18} />
                {!trilhoCompacto && (
                  <span className="text-[9px] font-medium leading-tight text-center" style={{ maxWidth: 56 }}>{t.curto}</span>
                )}
              </button>
            );
          })}

          <button onClick={alternarTrilho} title={trilhoCompacto ? 'Mostrar nomes' : 'Recolher menu'}
            className="flex items-center justify-center gap-1 w-full px-1 py-2 mt-auto flex-shrink-0 text-[9px] font-medium"
            style={{ color: '#64748b', borderTop: '1px solid #0f2240' }}>
            {trilhoCompacto ? <ChevronsRight size={14} /> : <><ChevronsLeft size={14} /> Recolher</>}
          </button>
        </nav>

        {/* Painel do módulo — só existe quando há módulo aberto */}
        {tabAtivo && (
        <aside className="flex flex-col flex-shrink-0 relative" style={{ width: larguraPainel, background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
          <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
            {abaAtual && <abaAtual.icon size={14} style={{ color: 'var(--invicta-green)' }} />}
            <h2 className="text-[11px] font-bold uppercase tracking-wider flex-1 truncate" style={{ color: '#fff' }}>
              {abaAtual?.label ?? ''}
            </h2>
            <button onClick={() => setTab(null)} title="Fechar e ver o mapa inteiro"
              className="p-1 rounded hover:bg-white/10 transition-colors">
              <X size={14} style={{ color: 'var(--sidebar-text)' }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tabAtivo === 'resumo' && talhao && <ResumoTab talhao={talhao} fazenda={fazenda} safraNome={safraSel} cultura={cultura} />}
            {tabAtivo === 'fertilidade' && (
              <>
                {!ehProdutor && (
                  <>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#a78bfa' }}>Importação de Laboratório</div>
                    <LabImportSection safraNome={safraSel} />
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4ade80', borderTop: '1px solid #1a3a6b' }}>Mapa de Fertilidade</div>
                  </>
                )}
                <FertilidadeSection safraNome={safraSel} />
              </>
            )}
            {tabAtivo === 'amostragem' && (
              <>
                <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#22d3ee' }}>Importar Grade externa</div>
                <ImportarGradeSection safraNome={safraSel} />
                <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#60a5fa', borderTop: '1px solid #1a3a6b' }}>Amostragem</div>
                <AmostragemModulo safraNome={safraSel} />
              </>
            )}
            {tabAtivo === 'zonas' && talhao && <MeapSection talhao={talhao} safraNome={safraSel} />}
            {tabAtivo === 'compactacao' && <CompactacaoSection safraNome={safraSel} />}
            {tabAtivo === 'condutividade' && <CondutividadeSection />}
            {tabAtivo === 'altimetria' && <AltimetriaSection />}
            {tabAtivo === 'produtividade' && <ProdutividadeSection safraNome={safraSel} />}
            {tabAtivo === 'ndvi' && <NdviSection safraNome={safraSel} />}
            {tabAtivo === 'recomendacoes' && <RecomendacaoSection safraNome={safraSel} />}
            {tabAtivo === 'prescricoes' && <PrescricoesSection safraNome={safraSel} />}
            {tabAtivo === 'arquivos' && <ArquivosSection safraNome={safraSel} />}
            {tabAtivo === 'relatorios' && <GeradorRelatorios safraNome={safraSel} />}
            {!['resumo', 'fertilidade', 'amostragem', 'zonas', 'compactacao', 'condutividade', 'altimetria', 'produtividade', 'ndvi', 'recomendacoes', 'prescricoes', 'arquivos', 'relatorios'].includes(tabAtivo) && (
              <EmBreve label={TABS.find(t => t.id === tabAtivo)?.label ?? ''} />
            )}
          </div>

          <p className="text-center text-[10px] py-1.5 flex-shrink-0" style={{ color: '#334155', borderTop: '1px solid #0f2240' }}>
            INVICTA Platform · v{APP_VERSION}
          </p>

          {/* Borda arrastável — a faixa é maior que o traço para o ponteiro
              não precisar de pontaria de 1px. */}
          <div onMouseDown={iniciarArrasto} title="Arraste para mudar a largura"
            className="absolute top-0 right-0 h-full"
            style={{ width: 6, marginRight: -3, cursor: 'col-resize', zIndex: 20 }} />
        </aside>
        )}

        {/* Mapa do talhão */}
        <div className="flex-1 relative overflow-hidden">
          <MapView />
        </div>
      </div>
    </div>
  );
}

function Ctx({ label, value, forte }: { label: string; value: string; forte?: boolean }) {
  return (
    <span className="truncate">
      <span style={{ color: '#64748b' }}>{label}: </span>
      <span style={{ color: forte ? '#fff' : '#cbd5e1', fontWeight: forte ? 700 : 600 }}>{value}</span>
    </span>
  );
}
function Sep() { return <span style={{ color: '#2e3f5c' }}>·</span>; }

// ── Aba Resumo ───────────────────────────────────────────────────────────────
function ResumoTab({ talhao, fazenda, safraNome, cultura }: { talhao: Talhao; fazenda: Fazenda | null; safraNome: string; cultura: string }) {
  const importacoes = useMemo(() => getImportacoesLab(talhao.id, safraNome), [talhao.id, safraNome]);
  const grades = useMemo(() => getGrades(talhao.id, safraNome), [talhao.id, safraNome]);

  const cards = [
    { label: 'Área', value: talhao.areaHa > 0 ? `${talhao.areaHa.toLocaleString('pt-BR')} ha` : '—' },
    { label: 'Cultura', value: cultura || '—' },
    { label: 'Ano', value: rotuloAno(safraNome) },
    { label: 'Importações de laboratório', value: String(importacoes.length) },
    { label: 'Grades de amostragem', value: String(grades.length) },
    { label: 'Status do limite', value: talhao.status === 'ativo' ? 'Definido' : 'Pendente' },
  ];

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map(c => (
          <div key={c.label} className="p-3 rounded-lg" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>{c.label}</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: '#e2e8f0' }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* IA F1 — Diagnóstico Inteligente por Talhão (mostra o salvo; gerar é manual) */}
      <DiagnosticoIaCard talhaoId={talhao.id} safraNome={safraNome} />
      {/* IA F3 — Chat: perguntar sobre este talhão */}
      <ChatTalhaoCard talhaoId={talhao.id} safraNome={safraNome} />

      <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
        <Clock size={13} style={{ color: '#93c5fd' }} className="mt-0.5 flex-shrink-0" />
        <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>
          Use as abas acima para acessar os trabalhos desta safra em <strong style={{ color: '#cbd5e1' }}>{fazenda?.nome ?? 'esta fazenda'}</strong>.
          A safra selecionada no topo filtra os dados da página.
        </p>
      </div>
    </div>
  );
}

// ── Placeholder estruturado para abas ainda não implementadas ────────────────
function EmBreve({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center gap-2">
      <Clock size={26} style={{ color: '#2e3f5c' }} />
      <p className="text-sm font-semibold" style={{ color: '#94a3b8' }}>{label}</p>
      <p className="text-[11px]" style={{ color: '#475569' }}>
        Esta aba será habilitada em uma próxima etapa. A estrutura por talhão + safra já está pronta para recebê-la.
      </p>
    </div>
  );
}
