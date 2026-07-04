'use client';

// Aba Altimetria (MDE) — F1 Essencial (spec MDE + Análise Topográfica).
// Busca a base (Copernicus GLO-30 → SRTM, sem chave), mostra a PRÉVIA
// (hipsométrico / declividade / relevo sombreado + stats + histograma +
// avisos de qualidade) e, com a APROVAÇÃO do usuário, salva como MDE
// OFICIAL do talhão (metadados no store `inv_mde`; rasters na nuvem com
// prefixo mde__). Exporta GeoTIFF reusando o /grid-geotiff.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getLegendas, getMdes, saveMde, setMdeOficial, deleteMde, getMdeCamadasTopo, type MdeTalhao } from '@/lib/store';
import { extrairPoligono, coordsFromBounds, exportarGeotiff, gradienteCss, type Grid } from '@/lib/fertilidade';
import { colorirGridComLegenda, colorirGrid } from '@/lib/raster';
import { tocarBackend } from '@/lib/interpUrl';
import { emailUsuario } from '@/lib/auth';
import {
  buscarMde, salvarMdeNaNuvem, carregarMdeDaNuvem, excluirMdeDaNuvem, normalizarGrid0a100,
  buscarAnaliseMde, salvarCamadasTopoMde, excluirCamadasTopoMde, CAMADAS_TOPO_ZONA,
  FONTES_MDE, FONTES_MDE_INDISPONIVEIS,
  type FonteMde, type RespMde, type MdeCarregado, type RespMdeAnalise, type SensibilidadeDrenagem,
} from '@/lib/mde';
import type { Legenda } from '@/lib/legendas';
import { CruzamentoRelevo } from '@/components/talhao/CruzamentoRelevo';
import { Mountain, Loader2, Search, CheckCircle2, AlertTriangle, Trash2, Download, Star, Layers, Play, Waves, FileText } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });

// Legenda de DECLIVIDADE (graus) — classes de relevo (Embrapa) fixas. Efêmera
// (objeto local): não entra na Biblioteca; F2+ pode oficializá-la.
const LEG_DECL: Legenda = {
  id: 'mde-decl-local', nome: 'Declividade (classes de relevo)',
  atributoId: 'declividade', atributo: 'Declividade', simbolo: 'Decl.',
  unidade: '°', metodo: 'MDE', fonte: 'INVICTA', categoria: 'altimetria-elevacao',
  invertida: false, tipoEscala: 'discreta', estilo: 'segmentado',
  dominioMin: 0, dominioMax: 45,
  classes: [
    { nome: 'Plano (0–1,7°)', valorMin: null, valorMax: 1.7, corInicio: '#1a9850', corFim: '#66bd63', larguraVisual: 20, ordem: 1 },
    { nome: 'Suave ondulado (–4,6°)', valorMin: 1.7, valorMax: 4.6, corInicio: '#a6d96a', corFim: '#d9ef8b', larguraVisual: 20, ordem: 2 },
    { nome: 'Ondulado (–11°)', valorMin: 4.6, valorMax: 11, corInicio: '#fee08b', corFim: '#fdae61', larguraVisual: 20, ordem: 3 },
    { nome: 'Forte ondulado (–24°)', valorMin: 11, valorMax: 24, corInicio: '#f46d43', corFim: '#d73027', larguraVisual: 20, ordem: 4 },
    { nome: 'Montanhoso (>24°)', valorMin: 24, valorMax: null, corInicio: '#a50026', corFim: '#67001f', larguraVisual: 20, ordem: 5 },
  ],
  criadoEm: '', atualizadoEm: '',
};

// Legenda efêmera RELATIVA (minmax): estica as cores entre o mín e o máx do
// grid — serve para TPI/TRI/TWI/LS/fluxo/curvaturas (os divergentes chegam com
// range simétrico do backend, então o zero fica no centro).
function legRel(id: string, nome: string, unidade: string, cores: string[]): Legenda {
  return {
    id, nome, atributoId: id, atributo: nome, simbolo: nome, unidade, metodo: 'MDE',
    fonte: 'INVICTA', categoria: 'altimetria-elevacao', invertida: false,
    tipoEscala: 'gradiente', estilo: 'continuo', escalaRelativa: 'minmax',
    classes: cores.map((c, i) => ({
      nome: `${i + 1}`, valorMin: null, valorMax: null,
      corInicio: c, corFim: cores[i + 1] ?? c, larguraVisual: 100 / cores.length, ordem: i + 1,
    })),
    criadoEm: '', atualizadoEm: '',
  };
}

// Camadas da análise topográfica (F2+F3). Contrato com backend/mde.py.
interface CamadaAnalise {
  id: string; rotulo: string; grupo: 'Derivados' | 'Análise agronômica';
  tipo: 'grid' | 'png'; leg?: Legenda; rotMin?: string; rotMax?: string; desc?: string;
}
const DIV_AZ_VERM = ['#1d4ed8', '#93c5fd', '#f8fafc', '#fca5a5', '#b91c1c'];
const CAMADAS_ANALISE: CamadaAnalise[] = [
  { id: 'aspecto', rotulo: 'Aspecto (direção da vertente)', grupo: 'Derivados', tipo: 'grid', rotMin: 'N', rotMax: 'N', desc: 'Para onde a encosta “olha” (N→E→S→O)' },
  { id: 'curvas', rotulo: 'Curvas de nível', grupo: 'Derivados', tipo: 'png' },
  { id: 'curv_geral', rotulo: 'Curvatura geral', grupo: 'Derivados', tipo: 'grid', leg: legRel('curv_geral', 'Curvatura geral', '1/m', DIV_AZ_VERM), rotMin: 'côncavo (acúmulo)', rotMax: 'convexo (dispersão)' },
  { id: 'curv_perfil', rotulo: 'Curvatura de perfil', grupo: 'Derivados', tipo: 'grid', leg: legRel('curv_perfil', 'Curv. perfil', '1/m', DIV_AZ_VERM), rotMin: 'côncava (desacelera/deposita)', rotMax: 'convexa (acelera fluxo)' },
  { id: 'curv_plano', rotulo: 'Curvatura de plano', grupo: 'Derivados', tipo: 'grid', leg: legRel('curv_plano', 'Curv. plano', '1/m', DIV_AZ_VERM), rotMin: 'convergente (concentra água)', rotMax: 'divergente (dispersa)' },
  { id: 'tpi', rotulo: 'TPI — posição topográfica', grupo: 'Derivados', tipo: 'grid', leg: legRel('tpi', 'TPI', 'm', ['#1d4ed8', '#93c5fd', '#f8fafc', '#d7ccc8', '#6d4c41']), rotMin: 'baixada/depressão', rotMax: 'topo' },
  { id: 'tri', rotulo: 'TRI — rugosidade', grupo: 'Derivados', tipo: 'grid', leg: legRel('tri', 'TRI', 'm', ['#fef9c3', '#fbbf24', '#c2410c', '#7c2d92']), rotMin: 'suave', rotMax: 'acidentado' },
  { id: 'fluxo_log', rotulo: 'Fluxo acumulado', grupo: 'Derivados', tipo: 'grid', leg: legRel('fluxo_log', 'Fluxo', 'log₁₀ células', ['#f0f9ff', '#7dd3fc', '#0284c7', '#0c2f5e']), rotMin: 'pouco', rotMax: 'muito' },
  { id: 'twi', rotulo: 'TWI — umidade topográfica', grupo: 'Análise agronômica', tipo: 'grid', leg: legRel('twi', 'TWI', '', ['#fde68a', '#a7f3d0', '#38bdf8', '#1e3a8a']), rotMin: 'seco / escoamento', rotMax: 'acúmulo / encharcamento' },
  { id: 'ls', rotulo: 'LS Factor — risco de erosão', grupo: 'Análise agronômica', tipo: 'grid', leg: legRel('ls', 'LS', '', ['#16a34a', '#facc15', '#f97316', '#dc2626']), rotMin: 'baixo', rotMax: 'crítico' },
  { id: 'drenagem', rotulo: 'Rede de drenagem / enxurrada', grupo: 'Análise agronômica', tipo: 'png' },
  { id: 'classes', rotulo: 'Classes topográficas', grupo: 'Análise agronômica', tipo: 'png' },
];
// aspecto: rampa CIRCULAR fixa 0–360° (N azul → E verde → S amarelo → O vermelho → N azul)
const STOPS_ASPECTO: Array<[number, [number, number, number]]> = [
  [0, [59, 130, 246]], [0.25, [34, 197, 94]], [0.5, [234, 179, 8]], [0.75, [239, 68, 68]], [1, [59, 130, 246]],
];

export function AltimetriaSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const legendaAlt = useMemo<Legenda | null>(
    () => getLegendas().find(l => l.atributoId === 'altimetria' || l.categoria === 'altimetria-elevacao') ?? null, []);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const [mdes, setMdes] = useState<MdeTalhao[]>([]);
  const [fonte, setFonte] = useState<FonteMde>('auto');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [previa, setPrevia] = useState<RespMde | null>(null);       // prévia AINDA não aprovada
  const [salvando, setSalvando] = useState(false);
  const [oficialDados, setOficialDados] = useState<(MdeCarregado & { meta: MdeTalhao }) | null>(null);
  const [camada, setCamada] = useState<string>('alt');   // 'alt'|'decl'|'hs' (F1) ou 'a:<id>' (análise)
  const [exportando, setExportando] = useState<string | null>(null);
  // F2+F3 — análise topográfica (derivados + agronômicos)
  const [analise, setAnalise] = useState<RespMdeAnalise | null>(null);
  const [gerandoAnalise, setGerandoAnalise] = useState(false);
  const [sensib, setSensib] = useState<SensibilidadeDrenagem>('media');
  const [salvandoZonas, setSalvandoZonas] = useState(false);
  const [nSalvasZonas, setNSalvasZonas] = useState(0);   // camadas topo já no MEAP
  const [zonasMsg, setZonasMsg] = useState('');
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const oficial = mdes.find(m => m.oficial) ?? null;

  useEffect(() => { tocarBackend(); }, []);
  useEffect(() => {
    setPrevia(null); setErro(''); setOficialDados(null); setCamada('alt'); setAnalise(null);
    setMdes(nav.talhaoId ? getMdes(nav.talhaoId) : []);
    setNSalvasZonas(nav.talhaoId ? getMdeCamadasTopo(nav.talhaoId).length : 0); setZonasMsg('');
  }, [nav.talhaoId]);

  // Autoload da base OFICIAL (nuvem) quando não há prévia em andamento.
  useEffect(() => {
    if (!nav.talhaoId || !oficial || previa) return;
    let vivo = true;
    carregarMdeDaNuvem(nav.talhaoId, oficial.id)
      .then(d => { if (vivo && d) setOficialDados({ ...d, meta: oficial }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [nav.talhaoId, oficial?.id, previa]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  // Render da camada escolhida (prévia F1, oficial carregada, ou análise F2+F3).
  useEffect(() => {
    let url = '';
    let bounds: [number, number, number, number] | null = null;
    try {
      if (camada.startsWith('a:') && analise) {
        const key = camada.slice(2);
        bounds = analise.bounds;
        const def = CAMADAS_ANALISE.find(c => c.id === key);
        if (def?.tipo === 'png') url = analise.pngs[key as 'curvas' | 'drenagem' | 'classes'] ?? '';
        else if (key === 'aspecto') url = colorirGrid(analise.grids.aspecto, [0, 360], STOPS_ASPECTO).dataUrl;
        else if (def?.leg) {
          const g = analise.grids[key as keyof RespMdeAnalise['grids']];
          if (g) url = colorirGridComLegenda(g, def.leg).dataUrl;
        }
      } else {
        const fonteDados = previa ?? oficialDados;
        if (!fonteDados) { setFertilidadeOverlay(null); return; }
        bounds = fonteDados.bounds;
        if (camada === 'hs') {
          url = (previa ? previa.hillshade_png : oficialDados?.hillshadePng) ?? '';
        } else if (camada === 'alt' && legendaAlt) {
          const g: Grid | null = previa ? previa.elevacao : oficialDados?.elevacao ?? null;
          if (g) url = colorirGridComLegenda(normalizarGrid0a100(g), legendaAlt).dataUrl;
        } else if (camada === 'decl') {
          const g: Grid | null = previa ? previa.declividade : oficialDados?.declividade ?? null;
          if (g) url = colorirGridComLegenda(g, LEG_DECL).dataUrl;
        }
      }
    } catch { /* grid inválido */ }
    if (!url || !bounds) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(bounds), opacity: 1 });
    setFertilidadeLabels(null);
  }, [previa, oficialDados, analise, camada, legendaAlt, setFertilidadeOverlay, setFertilidadeLabels]);

  async function buscar() {
    if (!poligono || buscando) return;
    setBuscando(true); setErro(''); setPrevia(null);
    try {
      const r = await buscarMde({ poligono, fonte });
      setPrevia(r); setCamada('alt');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar o MDE.');
    } finally { setBuscando(false); }
  }

  async function aprovar() {
    if (!previa || !nav.talhaoId || salvando) return;
    // spec §19: MDE já aprovado → confirmação antes de substituir (a antiga fica no histórico).
    if (oficial && !confirm(`Este talhão já tem um MDE oficial (${oficial.rotuloFonte}). Aprovar esta base a torna a NOVA oficial — a anterior fica no histórico. Continuar?`)) return;
    setSalvando(true); setErro('');
    try {
      const meta = saveMde({
        talhaoId: nav.talhaoId, fonte: previa.fonte, rotuloFonte: previa.rotulo,
        resolucaoM: previa.resolucao_m,
        stats: { alt_min: previa.stats.alt_min, alt_med: previa.stats.alt_med, alt_max: previa.stats.alt_max, amplitude: previa.stats.amplitude, decl_media: previa.stats.decl_media, decl_max: previa.stats.decl_max },
        usuario: emailUsuario() || undefined,
        oficial: true,
      });
      await salvarMdeNaNuvem(nav.talhaoId, meta.id, previa);
      setMdes(getMdes(nav.talhaoId));
      setPrevia(null);   // o autoload assume com a oficial recém-salva
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar o MDE.');
    } finally { setSalvando(false); }
  }

  function tornarOficial(m: MdeTalhao) {
    setMdeOficial(m.id);
    setMdes(getMdes(nav.talhaoId ?? undefined));
    setOficialDados(null);  // força recarregar a nova oficial
  }

  function excluirVersao(m: MdeTalhao) {
    if (!confirm(`Excluir a versão ${m.rotuloFonte} de ${new Date(m.criadoEm).toLocaleDateString('pt-BR')}${m.oficial ? ' (OFICIAL)' : ''}? Os rasters dela na nuvem também são apagados.`)) return;
    if (nav.talhaoId) excluirMdeDaNuvem(nav.talhaoId, m.id);
    deleteMde(m.id);
    setMdes(getMdes(nav.talhaoId ?? undefined));
    if (oficialDados?.meta.id === m.id) setOficialDados(null);
  }

  // F2+F3 — gera derivados + análise agronômica a partir da FONTE da base
  // oficial (spec §6: produtos após a aprovação da base).
  async function gerarAnalise() {
    if (!poligono || !oficial || gerandoAnalise) return;
    setGerandoAnalise(true); setErro('');
    try {
      const r = await buscarAnaliseMde({ poligono, fonte: oficial.fonte, sensibilidade: sensib });
      setAnalise(r);
      setCamada('a:classes');   // abre já na camada mais interpretada
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na análise topográfica.');
    } finally { setGerandoAnalise(false); }
  }

  // F4 — envia as camadas topográficas (TPI/TWI/LS…) para as Zonas de Manejo.
  async function salvarZonas() {
    if (!analise || !nav.talhaoId || salvandoZonas) return;
    setSalvandoZonas(true); setZonasMsg('');
    try {
      await salvarCamadasTopoMde(nav.talhaoId, analise, CAMADAS_TOPO_ZONA.map(c => c.key));
      setNSalvasZonas(CAMADAS_TOPO_ZONA.length);
      setZonasMsg('✓ Relevo disponível nas Zonas de Manejo (grupo Relevo). Escolha as camadas e os pesos ao gerar as zonas.');
    } catch (e) {
      setZonasMsg(e instanceof Error ? e.message : 'Falha ao salvar para zonas.');
    } finally { setSalvandoZonas(false); }
  }
  function removerZonas() {
    if (!nav.talhaoId) return;
    excluirCamadasTopoMde(nav.talhaoId);
    setNSalvasZonas(0); setZonasMsg('Camadas topográficas removidas do MEAP (Altitude e Declividade continuam vindo da base).');
  }

  // F4.c — relatório PDF do MDE (§17). Usa a base oficial (elev/decl) + a análise.
  async function baixarPdf() {
    if (!analise || !oficial || gerandoPdf) return;
    const elev = oficialDados?.elevacao ?? previa?.elevacao ?? null;
    const decl = oficialDados?.declividade ?? previa?.declividade ?? null;
    const bb = oficialDados?.bounds ?? previa?.bounds ?? null;
    if (!elev || !decl || !bb) { setErro('Abra os mapas da base oficial (Altitude/Declividade) antes de gerar o relatório.'); return; }
    setGerandoPdf(true); setErro('');
    try {
      const { gerarPdfMde } = await import('@/lib/mdeRelatorio');
      await gerarPdfMde({ talhaoId: nav.talhaoId!, oficial, analise, elevacao: elev, declividade: decl, baseBounds: bb });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF.');
    } finally { setGerandoPdf(false); }
  }

  // GeoTIFF de uma camada GRID da análise (aspecto/tpi/twi/ls/…).
  async function baixarGeotiffAnalise(key: string) {
    if (!analise || exportando) return;
    const g = analise.grids[key as keyof RespMdeAnalise['grids']];
    if (!g) return;
    setExportando(key);
    try {
      const nomeT = getTalhoes().find(t => t.id === nav.talhaoId)?.nome ?? 'talhao';
      const base = `${nomeT}_${key}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
      const blob = await exportarGeotiff(g, analise.bounds, `${base}.tif`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${base}.tif`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao exportar GeoTIFF.');
    } finally { setExportando(null); }
  }

  async function baixarGeotiff(qual: 'alt' | 'decl') {
    const src = previa ?? oficialDados;
    if (!src || exportando) return;
    const grid = qual === 'alt'
      ? (previa ? previa.elevacao : oficialDados?.elevacao)
      : (previa ? previa.declividade : oficialDados?.declividade);
    if (!grid) return;
    setExportando(qual);
    try {
      const nomeT = getTalhoes().find(t => t.id === nav.talhaoId)?.nome ?? 'talhao';
      const base = `${nomeT}_${qual === 'alt' ? 'altitude' : 'declividade'}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
      const blob = await exportarGeotiff(grid, src.bounds, `${base}.tif`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${base}.tif`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao exportar GeoTIFF.');
    } finally { setExportando(null); }
  }

  if (!nav.talhaoId) return <div className="px-6 py-4"><Aviso texto="Abra um talhão para buscar o MDE." /></div>;

  const stats = previa?.stats ?? null;
  const temDados = !!(previa || oficialDados);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Base oficial (quando existe e não há prévia em andamento) */}
      {oficial && !previa && (
        <div className="rounded-lg p-2.5 space-y-1" style={{ background: '#0f2a1a', border: '1px solid #2a5a3a' }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} style={{ color: '#86efac' }} />
            <span className="text-[11px] font-bold" style={{ color: '#86efac' }}>MDE oficial: {oficial.rotuloFonte}</span>
          </div>
          <p className="text-[9px]" style={{ color: '#94a3b8' }}>
            {oficial.stats.alt_min}–{oficial.stats.alt_max} m (amplitude {fmt(oficial.stats.amplitude)} m)
            {oficial.stats.decl_media != null && <> · declividade média {fmt(oficial.stats.decl_media)}°</>}
            {' · '}aprovado em {new Date(oficial.criadoEm).toLocaleDateString('pt-BR')}{oficial.usuario ? ` por ${oficial.usuario}` : ''}
          </p>
          {!oficialDados && <p className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}><Loader2 size={10} className="animate-spin" /> carregando os mapas da nuvem…</p>}
        </div>
      )}

      {/* Busca */}
      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: '#93c5fd' }}><Mountain size={13} /> {oficial ? 'Buscar outra base' : 'Buscar o MDE do talhão'}</p>
        <div>
          <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Fonte</label>
          <select value={fonte} onChange={e => setFonte(e.target.value as FonteMde)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
            {FONTES_MDE.map(f => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
            {FONTES_MDE_INDISPONIVEIS.map(f => <option key={f.rotulo} disabled>{f.rotulo} — {f.motivo}</option>)}
          </select>
        </div>
        <button onClick={() => void buscar()} disabled={buscando || !poligono}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: 'var(--invicta-green-dark)' }}>
          {buscando ? <><Loader2 size={13} className="animate-spin" /> Buscando e processando (~10–30 s)…</> : <><Search size={13} /> Buscar MDE</>}
        </button>
        {!poligono && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Limite do talhão não encontrado.</p>}
        {erro && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      </div>

      {/* Prévia / visualização */}
      {temDados && (
        <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold" style={{ color: previa ? '#fbbf24' : '#86efac' }}>
              {previa ? `PRÉVIA · ${previa.rotulo}` : 'Camadas da base oficial'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => void baixarGeotiff('alt')} disabled={!!exportando} title="Baixar a altitude como GeoTIFF (EPSG:4326)" className="flex items-center gap-1 text-[9px] disabled:opacity-50" style={{ color: '#86efac' }}>
                {exportando === 'alt' ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Altitude
              </button>
              <button onClick={() => void baixarGeotiff('decl')} disabled={!!exportando} title="Baixar a declividade como GeoTIFF (EPSG:4326)" className="flex items-center gap-1 text-[9px] disabled:opacity-50" style={{ color: '#86efac' }}>
                {exportando === 'decl' ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Declividade
              </button>
            </div>
          </div>

          {/* Alternador de camada */}
          <div className="flex gap-1">
            {([['alt', 'Altitude'], ['decl', 'Declividade'], ['hs', 'Relevo sombreado']] as const).map(([v, t]) => (
              <button key={v} onClick={() => setCamada(v)} className="flex-1 py-1 rounded text-[10px] font-bold"
                style={{ background: camada === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: camada === v ? '#fff' : '#93c5fd' }}>
                {t}
              </button>
            ))}
          </div>

          {/* Legenda da camada ativa */}
          {camada === 'alt' && legendaAlt && (
            <div>
              <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(legendaAlt) }} />
              <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                <span>{stats ? `${fmt(stats.alt_min)} m` : `${fmt(oficialDados?.meta.stats.alt_min ?? 0)} m`}</span>
                <span style={{ color: '#64748b' }}>baixadas → topos (relativo à área)</span>
                <span>{stats ? `${fmt(stats.alt_max)} m` : `${fmt(oficialDados?.meta.stats.alt_max ?? 0)} m`}</span>
              </div>
            </div>
          )}
          {camada === 'decl' && (
            <div>
              <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(LEG_DECL) }} />
              <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                <span>plano</span><span>1,7°</span><span>4,6°</span><span>11°</span><span>24°</span><span>montanhoso</span>
              </div>
            </div>
          )}
          {camada === 'hs' && <p className="text-[9px]" style={{ color: '#64748b' }}>Relevo sombreado (iluminação NO 315° / 45°) — leitura visual do terreno.</p>}

          {/* Stats + histograma + avisos (prévia) */}
          {previa && stats && (
            <>
              <div className="grid grid-cols-4 gap-1 text-center">
                {([['Mínima', `${fmt(stats.alt_min)} m`], ['Média', `${fmt(stats.alt_med)} m`], ['Máxima', `${fmt(stats.alt_max)} m`], ['Amplitude', `${fmt(stats.amplitude)} m`]] as const).map(([r, v]) => (
                  <div key={r} className="rounded px-1 py-1.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
                    <p className="text-[8px]" style={{ color: '#64748b' }}>{r}</p>
                    <p className="text-[11px] font-bold" style={{ color: '#e2e8f0' }}>{v}</p>
                  </div>
                ))}
              </div>
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                Declividade média {stats.decl_media != null ? `${fmt(stats.decl_media)}°` : '—'} · máxima {stats.decl_max != null ? `${fmt(stats.decl_max)}°` : '—'} · resolução {previa.resolucao_m} m · {stats.n_px.toLocaleString('pt-BR')} px · EPSG:4326
              </p>

              {/* Histograma de altitude */}
              <div>
                <p className="text-[9px] font-semibold mb-0.5" style={{ color: '#64748b' }}>Distribuição da altitude</p>
                <div className="flex items-end gap-[1px] h-10">
                  {previa.histograma.counts.map((c, i) => {
                    const mx = Math.max(...previa.histograma.counts, 1);
                    return <div key={i} className="flex-1 rounded-t-[1px]" style={{ height: `${Math.max(2, (c / mx) * 100)}%`, background: '#2e5fa3' }} title={`${c} px`} />;
                  })}
                </div>
                <div className="flex justify-between text-[8px]" style={{ color: '#475569' }}>
                  <span>{fmt(previa.histograma.ini)} m</span><span>{fmt(previa.histograma.fim)} m</span>
                </div>
              </div>

              {previa.avisos.map((a, i) => (
                <p key={i} className="text-[9px] flex items-start gap-1" style={{ color: '#fbbf24' }}><AlertTriangle size={10} className="flex-shrink-0 mt-[1px]" /> {a}</p>
              ))}

              <button onClick={() => void aprovar()} disabled={salvando}
                className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: '#15803d' }}>
                {salvando ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> : <><CheckCircle2 size={13} /> Aprovar — virar MDE oficial do talhão</>}
              </button>
              <button onClick={() => { setPrevia(null); setErro(''); }} className="w-full py-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>
                Descartar prévia
              </button>
            </>
          )}
        </div>
      )}

      {/* F2+F3 — Análise topográfica (após a aprovação da base; spec §6) */}
      {oficial && (
        <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
            <Waves size={13} /> Análise topográfica agronômica
          </p>

          <div className="flex gap-1 items-end">
            <label className="flex-1 text-[9px]" style={{ color: '#64748b' }}>Sensibilidade da rede de drenagem
              <select value={sensib} onChange={e => setSensib(e.target.value as SensibilidadeDrenagem)} className="w-full rounded px-2 py-1.5 text-xs outline-none mt-0.5" style={inputStyle}>
                <option value="baixa">Baixa — só linhas principais (≥ 2 ha contribuindo)</option>
                <option value="media">Média — linhas intermediárias (≥ 0,75 ha)</option>
                <option value="alta">Alta — mais linhas secundárias (≥ 0,25 ha)</option>
              </select>
            </label>
            <button onClick={() => void gerarAnalise()} disabled={gerandoAnalise}
              className="px-3 py-1.5 rounded text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: 'var(--invicta-green-dark)' }}>
              {gerandoAnalise ? <><Loader2 size={12} className="animate-spin" /> Gerando…</> : <><Play size={12} /> {analise ? 'Gerar de novo' : 'Gerar análise'}</>}
            </button>
          </div>
          <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
            Gera TPI, TWI, LS Factor, curvaturas, rugosidade, fluxo, curvas de nível, rede de drenagem e a classificação do relevo — tudo derivado da base oficial ({oficial.rotuloFonte}), com buffer.
          </p>

          {analise && (
            <>
              <div>
                <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Camada no mapa</label>
                <select value={camada.startsWith('a:') ? camada : ''} onChange={e => { if (e.target.value) setCamada(e.target.value); }}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="">— escolher camada da análise —</option>
                  {(['Derivados', 'Análise agronômica'] as const).map(gr => (
                    <optgroup key={gr} label={gr}>
                      {CAMADAS_ANALISE.filter(c => c.grupo === gr).map(c => <option key={c.id} value={`a:${c.id}`}>{c.rotulo}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* F4 — enviar o relevo para as Zonas de Manejo */}
              <div className="rounded p-2 space-y-1" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
                <p className="text-[9px] leading-relaxed" style={{ color: '#94a3b8' }}>
                  <Layers size={9} className="inline mr-0.5" /> Use o relevo nas <strong>Zonas de Manejo</strong>: Altitude e Declividade já entram da base oficial; salve TPI, TWI, LS e derivados para escolhê-los (com peso) ao gerar zonas.
                </p>
                <div className="flex gap-1">
                  <button onClick={() => void salvarZonas()} disabled={salvandoZonas}
                    className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: 'var(--invicta-green-dark)' }}>
                    {salvandoZonas ? <Loader2 size={11} className="animate-spin" /> : <Layers size={11} />} {nSalvasZonas > 0 ? 'Atualizar camadas p/ Zonas' : 'Salvar para Zonas de Manejo'}
                  </button>
                  {nSalvasZonas > 0 && (
                    <button onClick={removerZonas} title="Remover as camadas topográficas do MEAP" className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#f87171' }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                {nSalvasZonas > 0 && <p className="text-[9px]" style={{ color: '#86efac' }}>{nSalvasZonas} camada(s) topográfica(s) no MEAP.</p>}
                {zonasMsg && <p className="text-[9px]" style={{ color: zonasMsg.startsWith('✓') || zonasMsg.startsWith(String(nSalvasZonas)) ? '#86efac' : '#fbbf24' }}>{zonasMsg}</p>}
              </div>

              {/* F4.b — Cruzamento por classe de relevo (§12.1) */}
              <CruzamentoRelevo analise={analise} talhaoId={nav.talhaoId!} />

              {/* F4.c — Relatório PDF do MDE (§17) */}
              <button onClick={() => void baixarPdf()} disabled={gerandoPdf}
                className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px solid #2e5fa3' }}>
                {gerandoPdf ? <><Loader2 size={11} className="animate-spin" /> Gerando PDF…</> : <><FileText size={11} /> Relatório PDF do relevo</>}
              </button>

              {/* Legenda/contexto da camada ativa da análise */}
              {camada.startsWith('a:') && (() => {
                const key = camada.slice(2);
                const def = CAMADAS_ANALISE.find(c => c.id === key);
                if (!def) return null;
                const rng = analise.meta.ranges[key];
                return (
                  <div className="space-y-1.5">
                    {key === 'aspecto' && (
                      <div>
                        <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(90deg,#3b82f6,#22c55e,#eab308,#ef4444,#3b82f6)' }} />
                        <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}><span>N</span><span>L</span><span>S</span><span>O</span><span>N</span></div>
                      </div>
                    )}
                    {def.leg && (
                      <div>
                        <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(def.leg) }} />
                        <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                          <span>{def.rotMin}{rng ? ` (${fmt(rng[0], 2)})` : ''}</span>
                          <span>{def.rotMax}{rng ? ` (${fmt(rng[1], 2)})` : ''}</span>
                        </div>
                      </div>
                    )}
                    {key === 'curvas' && <p className="text-[9px]" style={{ color: '#94a3b8' }}>Curvas de nível a cada <strong>{analise.meta.intervalo_curvas_m} m</strong> (traço marrom). Derivadas do MDE global — não substituem levantamento de precisão.</p>}
                    {key === 'drenagem' && <p className="text-[9px]" style={{ color: '#94a3b8' }}>Caminhos preferenciais da água (área contribuinte ≥ {analise.meta.limiar_drenagem_ha} ha). Linhas de enxurrada potenciais — tendência, não medição.</p>}
                    {key === 'classes' && (
                      <div className="space-y-0.5">
                        {analise.meta.classes.map(c => (
                          <div key={c.codigo} className="flex items-center gap-2 text-[9px]">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c.cor }} />
                            <span className="flex-1" style={{ color: '#cbd5e1' }}>{c.nome}</span>
                            <span style={{ color: '#94a3b8' }}>{fmt(c.ha)} ha · {fmt(c.pct)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {def.tipo === 'grid' && (
                      <button onClick={() => void baixarGeotiffAnalise(key)} disabled={!!exportando}
                        className="flex items-center gap-1 text-[9px] disabled:opacity-50" style={{ color: '#86efac' }}>
                        {exportando === key ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} GeoTIFF desta camada
                      </button>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Histórico de versões (spec §21 — nunca apagar automaticamente) */}
      {mdes.length > 1 && (
        <div className="rounded-lg p-2.5 space-y-1" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
          <p className="text-[10px] font-bold flex items-center gap-1.5" style={{ color: '#93c5fd' }}><Layers size={11} /> Versões ({mdes.length})</p>
          {mdes.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-[9px] rounded px-2 py-1" style={{ background: '#061525', border: `1px solid ${m.oficial ? '#2a5a3a' : '#1a3a6b'}` }}>
              <span className="flex-1 truncate" style={{ color: '#cbd5e1' }}>
                {m.rotuloFonte} · {new Date(m.criadoEm).toLocaleDateString('pt-BR')}
                {m.oficial && <span className="ml-1 font-bold" style={{ color: '#86efac' }}>· oficial</span>}
              </span>
              {!m.oficial && (
                <button onClick={() => tornarOficial(m)} title="Restaurar esta base como oficial" className="flex items-center gap-0.5" style={{ color: '#fbbf24' }}>
                  <Star size={10} /> Tornar oficial
                </button>
              )}
              <button onClick={() => excluirVersao(m)} title="Excluir versão" style={{ color: '#f87171' }}><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
        MDE de 30 m dá excelente visão geral, mas tem limite em talhões pequenos; TWI/fluxo (fases seguintes) são tendências, não medição de água. Bases próprias (drone/RTK) entram numa fase futura.
      </p>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
