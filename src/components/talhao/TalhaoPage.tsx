'use client';

// Página individual do talhão (tela cheia, rota /talhao/[id]).
// Central de trabalho organizada por SAFRA: barra de contexto fixa no topo,
// navegação por abas e o mapa do talhão embutido à direita. Reaproveita os
// módulos reais já existentes (Fertilidade, Amostragem); as demais abas entram
// como placeholders estruturados e serão preenchidas incrementalmente.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import {
  getTalhoes, getFazendas, getClientes, getSafras,
  getImportacoesLab, getGrades, getPlantio, setPlantio, CULTURAS,
  type Talhao, type Fazenda, type Cliente, type Safra,
} from '@/lib/store';
import { FertilidadeSection } from '@/components/talhao/FertilidadeSection';
import { AmostragemModulo } from '@/components/talhao/AmostragemModulo';
import { CompactacaoSection } from '@/components/talhao/CompactacaoSection';
import { CondutividadeSection } from '@/components/talhao/CondutividadeSection';
import { RecomendacaoSection } from '@/components/talhao/RecomendacaoSection';
import { ArquivosSection } from '@/components/talhao/ArquivosSection';
import { LabImportSection } from '@/components/talhao/LabImportSection';
import { ImportarGradeSection } from '@/components/talhao/ImportarGradeSection';
import { GeradorRelatorios } from '@/components/talhao/GeradorRelatorios';
import { MeapSection } from '@/components/talhao/MeapSection';
import { NdviSection } from '@/components/talhao/NdviSection';
import { ProdutividadeSection } from '@/components/talhao/ProdutividadeSection';
import { papelDoUsuario, meuRegistro, planoPorId } from '@/lib/empresa';
import { tocarBackend } from '@/lib/interpUrl';
import {
  ChevronLeft, Home, Leaf, Grid3x3, Layers, BarChart3, FileSpreadsheet,
  Activity, Satellite, FolderOpen, FileText, Clock, Zap, Mountain,
} from 'lucide-react';

const MapView = dynamic(
  () => import('@/components/map/MapView').then(m => ({ default: m.MapView })),
  { ssr: false, loading: () => <div className="w-full h-full" style={{ background: '#0a1929' }} /> },
);

type TabId =
  | 'resumo' | 'altimetria' | 'fertilidade' | 'amostragem' | 'zonas' | 'produtividade'
  | 'recomendacoes' | 'compactacao' | 'condutividade' | 'ndvi' | 'arquivos' | 'relatorios';

// Ordem de TRABALHO do talhão (não-`pronto` = "em breve", cai no placeholder EmBreve).
const TABS: Array<{ id: TabId; label: string; icon: React.ElementType; pronto: boolean }> = [
  { id: 'resumo',        label: 'Resumo',          icon: Home,            pronto: true },
  { id: 'altimetria',    label: 'Altimetria (MDE)', icon: Mountain,       pronto: false },
  { id: 'condutividade', label: 'Condutividade',   icon: Zap,             pronto: true },
  { id: 'zonas',         label: 'Zonas de Manejo', icon: Layers,          pronto: true },
  { id: 'amostragem',    label: 'Amostragem',      icon: Grid3x3,         pronto: true },
  { id: 'fertilidade',   label: 'Fertilidade',     icon: Leaf,            pronto: true },
  { id: 'recomendacoes', label: 'Recomendações',   icon: FileSpreadsheet, pronto: true },
  { id: 'arquivos',      label: 'Arquivos',        icon: FolderOpen,      pronto: true },
  { id: 'ndvi',          label: 'NDVI / Satélite', icon: Satellite,       pronto: true },
  { id: 'produtividade', label: 'Produtividade',   icon: BarChart3,       pronto: true },
  { id: 'compactacao',   label: 'Compactação',     icon: Activity,        pronto: true },
  { id: 'relatorios',    label: 'Relatórios',      icon: FileText,        pronto: true },
];

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

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
  const [tab, setTab] = useState<TabId>('resumo');

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
  const tabAtivo: TabId = tabsVisiveis.some(t => t.id === tab) ? tab : (tabsVisiveis[0]?.id ?? 'resumo');

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
          <span className="flex items-center gap-1 flex-shrink-0">
            <span style={{ color: '#64748b' }}>Cultura:</span>
            <select value={cultura} onChange={e => mudarCultura(e.target.value)} disabled={!safraSel}
              title="Cultura desta safra neste talhão"
              className="rounded px-1.5 py-0.5 text-xs outline-none disabled:opacity-50" style={inputStyle}>
              <option value="">—</option>
              {CULTURAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </span>
        </div>

        {/* Seletor de safra (filtra os trabalhos da página) */}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Safra</span>
          <select value={safraSel} onChange={e => setSafraSel(e.target.value)}
            className="rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
            {safras.length === 0 && <option value="">— sem safra —</option>}
            {safras.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
          </select>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Conteúdo (abas) */}
        <aside className="flex flex-col flex-shrink-0" style={{ width: 440, background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
          {/* Navegação por abas */}
          <nav className="flex flex-wrap gap-1 px-2 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
            {tabsVisiveis.map(t => {
              const sel = t.id === tabAtivo;
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] font-semibold transition-colors"
                  style={{ background: sel ? 'var(--invicta-blue-mid)' : '#0f2240', color: sel ? '#fff' : (t.pronto ? '#93c5fd' : '#64748b') }}>
                  <Icon size={12} /> {t.label}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto">
            {tabAtivo === 'resumo' && talhao && <ResumoTab talhao={talhao} fazenda={fazenda} safraNome={safraSel} cultura={cultura} />}
            {tabAtivo === 'fertilidade' && (
              <>
                {!ehProdutor && (
                  <>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#a78bfa' }}>Importação de Laboratório</div>
                    <LabImportSection />
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4ade80', borderTop: '1px solid #1a3a6b' }}>Mapa de Fertilidade</div>
                  </>
                )}
                <FertilidadeSection safraNome={safraSel} />
              </>
            )}
            {tabAtivo === 'amostragem' && (
              <>
                <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#22d3ee' }}>Importar Grade externa</div>
                <ImportarGradeSection />
                <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#60a5fa', borderTop: '1px solid #1a3a6b' }}>Amostragem</div>
                <AmostragemModulo safraNome={safraSel} />
              </>
            )}
            {tabAtivo === 'zonas' && talhao && <MeapSection talhao={talhao} safraNome={safraSel} />}
            {tabAtivo === 'compactacao' && <CompactacaoSection safraNome={safraSel} />}
            {tabAtivo === 'condutividade' && <CondutividadeSection />}
            {tabAtivo === 'produtividade' && <ProdutividadeSection safraNome={safraSel} />}
            {tabAtivo === 'ndvi' && <NdviSection />}
            {tabAtivo === 'recomendacoes' && <RecomendacaoSection safraNome={safraSel} />}
            {tabAtivo === 'arquivos' && <ArquivosSection safraNome={safraSel} />}
            {tabAtivo === 'relatorios' && <GeradorRelatorios safraNome={safraSel} />}
            {!['resumo', 'fertilidade', 'amostragem', 'zonas', 'compactacao', 'condutividade', 'produtividade', 'ndvi', 'recomendacoes', 'arquivos', 'relatorios'].includes(tabAtivo) && (
              <EmBreve label={TABS.find(t => t.id === tabAtivo)?.label ?? ''} />
            )}
          </div>
        </aside>

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
    { label: 'Safra', value: safraNome || '—' },
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
