'use client';

// Ficha do Talhão (painel lateral). Deixou de ser uma "central de trabalho"
// (isso vive na PÁGINA COMPLETA do talhão, /talhao/[id], aberta em nova aba) e
// passou a ser INFORMATIVA + 1 ação:
//   • Limite Geográfico — atualizar/substituir o polígono do talhão;
//   • Resumo da safra — o que existe na safra (grade, lab, fertilidade, compactação);
//   • Mapas definitivos — Zonas de manejo, Textura (Argila) [reais], Altimetria e
//     Produtividade [em breve], visualizáveis no mapa.

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getTalhoes, getSafras, saveSafra, updateTalhao, deleteTalhao,
  getGrades, getImportacoesLab, getImportacoesCompactacao, getLegendas, Talhao, Safra,
} from '@/lib/store';
import type { Legenda } from '@/lib/legendas';
import { parseGeoFile, normalizarZonas } from '@/lib/geo';
import { classeZona } from '@/lib/zonas';
import { cloudCarregarMapasPorPrefixo } from '@/lib/cloud';
import { descomprimirGrid, coordsFromBounds, type RespInterp } from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import {
  ChevronLeft, Layers, Upload, MapPin, CheckCircle2, AlertTriangle, Plus, X, Save,
  ExternalLink, Trash2, Pencil, Grid3x3, TestTube, Leaf, Activity, Mountain, BarChart3, Eye, Loader2,
} from 'lucide-react';

type MapaNuvem = { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm?: string };

// ── seção de limite geográfico (atualizar polígono) ──────────────────────────
function GeoSection({ talhao, onUploaded }: { talhao: Talhao | null; onUploaded: (areaHa: number) => void }) {
  const { setUploadedGeo, setUploadedBbox } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle');
  const [erroMsg, setErroMsg] = useState('');
  const [dragging, setDragging] = useState(false);

  const temGeo = !!talhao?.geojson;

  async function processar(file: File) {
    setEstado('loading'); setErroMsg('');
    try {
      const result = await parseGeoFile(file);
      updateTalhao(talhao!.id, {
        geojson: JSON.stringify(result.geojson), bbox: result.bbox,
        areaHa: result.areaHa, areaHaSemHoles: result.areaHaBruta, status: 'ativo',
      });
      setUploadedGeo(result.geojson); setUploadedBbox(result.bbox);
      setEstado('ok'); onUploaded(result.areaHa);
    } catch (e: unknown) {
      setEstado('erro'); setErroMsg(e instanceof Error ? e.message : 'Erro ao processar arquivo.');
    }
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) processar(f); e.target.value = ''; }
  function onDrop(e: React.DragEvent) { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processar(f); }

  return (
    <div style={{ borderBottom: '1px solid #1a3a6b' }}>
      <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#0a1929', borderBottom: '1px solid #0f2240' }}>
        <MapPin size={12} style={{ color: '#93c5fd' }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#93c5fd' }}>Limite do Talhão</span>
        {temGeo
          ? <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#4ade80' }}><CheckCircle2 size={11} /> {talhao!.areaHa.toLocaleString('pt-BR')} ha</span>
          : <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#fbbf24' }}><AlertTriangle size={11} /> Sem limite</span>}
      </div>

      <div className="p-3">
        <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed rounded-lg py-5 text-center cursor-pointer transition-colors"
          style={{ borderColor: dragging ? '#60a5fa' : estado === 'ok' ? '#4ade80' : '#1e3a5f', background: dragging ? '#0f2240' : 'transparent' }}>
          {estado === 'loading' ? (
            <div className="flex flex-col items-center gap-2"><Loader2 size={20} className="animate-spin" style={{ color: '#60a5fa' }} /><p className="text-[10px]" style={{ color: '#64748b' }}>Processando arquivo...</p></div>
          ) : estado === 'ok' ? (
            <div className="flex flex-col items-center gap-1"><CheckCircle2 size={20} style={{ color: '#4ade80' }} /><p className="text-[10px] font-semibold" style={{ color: '#4ade80' }}>Limite atualizado</p><p className="text-[9px]" style={{ color: '#475569' }}>Clique para substituir</p></div>
          ) : (
            <div className="flex flex-col items-center gap-1.5"><Upload size={18} style={{ color: '#475569' }} />
              <p className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>{temGeo ? 'Atualizar / substituir limite' : 'Carregar KML ou Shapefile'}</p>
              <p className="text-[9px]" style={{ color: '#475569' }}>Arraste ou clique · .kml · .zip (shapefile) · .geojson</p>
            </div>
          )}
        </div>
        {estado === 'erro' && <p className="mt-2 text-[10px] text-center" style={{ color: '#f87171' }}>{erroMsg}</p>}
        {temGeo && estado === 'idle' && (
          <button onClick={() => { try { setUploadedGeo(JSON.parse(talhao!.geojson!) as GeoJSON.FeatureCollection); setUploadedBbox(talhao!.bbox!); } catch {} }}
            className="mt-2 w-full py-1.5 rounded text-[10px] font-semibold transition-opacity hover:opacity-80" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            Mostrar no mapa
          </button>
        )}
        <input ref={inputRef} type="file" accept=".kml,.zip,.geojson,.json" className="hidden" onChange={onFileChange} />
      </div>
    </div>
  );
}

// ── resumo do que existe na safra (só leitura; edição na página completa) ─────
function ResumoSafra({ talhaoId, safra }: { talhaoId: string; safra: string }) {
  const [fert, setFert] = useState<number | null>(null);
  const grades = safra ? getGrades(talhaoId, safra).length : 0;
  const labs = safra ? getImportacoesLab(talhaoId, safra).length : 0;
  const comp = safra ? getImportacoesCompactacao(talhaoId, safra).length : 0;

  useEffect(() => {
    let cancel = false; setFert(null);
    if (!talhaoId || !safra) return;
    const imp = getImportacoesLab(talhaoId, safra).sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
    if (!imp) { setFert(0); return; }
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo(`${talhaoId}__${imp.id}__`);
      if (!cancel) setFert(carregados.length);
    })();
    return () => { cancel = true; };
  }, [talhaoId, safra]);

  const abrir = () => window.open(`/talhao/${talhaoId}`, '_blank');
  const linhas: { icon: React.ElementType; label: string; valor: string; cor: string }[] = [
    { icon: Grid3x3, label: 'Amostragem', valor: `${grades} grade${grades === 1 ? '' : 's'}`, cor: '#60a5fa' },
    { icon: TestTube, label: 'Laboratório', valor: `${labs} importaç${labs === 1 ? 'ão' : 'ões'}`, cor: '#a78bfa' },
    { icon: Leaf, label: 'Fertilidade', valor: fert == null ? '…' : `${fert} mapa${fert === 1 ? '' : 's'}`, cor: '#4ade80' },
    { icon: Activity, label: 'Compactação', valor: `${comp} importaç${comp === 1 ? 'ão' : 'ões'}`, cor: '#fb923c' },
  ];

  return (
    <div style={{ borderBottom: '1px solid #1a3a6b' }}>
      <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#0a1929', borderBottom: '1px solid #0f2240' }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Nesta safra {safra && `· ${safra}`}</span>
      </div>
      <div className="py-1">
        {linhas.map(l => (
          <button key={l.label} onClick={abrir} title="Abrir na página completa do talhão"
            className="w-full flex items-center gap-2 px-4 py-2 transition-colors" style={{ borderBottom: '1px solid #0f2240' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: l.cor + '22' }}><l.icon size={11} style={{ color: l.cor }} /></div>
            <span className="text-xs font-medium flex-1 text-left" style={{ color: '#cbd5e1' }}>{l.label}</span>
            <span className="text-[11px] font-semibold" style={{ color: '#93c5fd' }}>{l.valor}</span>
            <ExternalLink size={11} style={{ color: '#475569' }} />
          </button>
        ))}
        <p className="px-4 py-1.5 text-[9px]" style={{ color: '#475569' }}>Edição e processamento: na página completa do talhão.</p>
      </div>
    </div>
  );
}

// ── mapas definitivos do talhão ──────────────────────────────────────────────
function MapasDefinitivos({ talhao, safra, onZonas }: { talhao: Talhao | null; safra: string; onZonas: () => void }) {
  const { setZonasManejo, setMapMode, setFertilidadeOverlay, setFertilidadeLabels } = useApp();
  const zonasRef = useRef<HTMLInputElement>(null);
  const [zonaEstado, setZonaEstado] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle');
  const [zonaMsg, setZonaMsg] = useState('');
  const [argila, setArgila] = useState<{ resp: RespInterp; legenda: Legenda } | null>(null);
  const [argilaLoad, setArgilaLoad] = useState(false);

  const temZonas = !!talhao?.zonasGeojson;

  // Carrega o mapa de Argila (textura) salvo na nuvem da safra (mais recente).
  useEffect(() => {
    let cancel = false; setArgila(null);
    if (!talhao?.id || !safra) return;
    const imp = getImportacoesLab(talhao.id, safra).sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
    const leg = getLegendas().find(l => l.atributoId === 'argila');
    if (!imp || !leg) return;
    setArgilaLoad(true);
    (async () => {
      const prefixo = `${talhao.id}__${imp.id}__`;
      const carregados = await cloudCarregarMapasPorPrefixo<MapaNuvem>(prefixo);
      let achado: RespInterp | null = null;
      for (const c of carregados) {
        const partes = c.id.slice(prefixo.length).split('__');
        if (partes[partes.length - 2] !== 'argila') continue;
        const d = c.dados;
        if (d.resp?.grid?.comp === 'gz') { try { d.resp.grid = await descomprimirGrid(d.resp.grid); } catch {} }
        achado = d.resp; break;
      }
      if (!cancel) { setArgila(achado ? { resp: achado, legenda: leg } : null); setArgilaLoad(false); }
    })();
    return () => { cancel = true; };
  }, [talhao?.id, safra]);

  function publicarZonas(fc: GeoJSON.FeatureCollection) {
    const features = fc.features.filter(f => f.geometry).map(f => {
      const p = (f.properties ?? {}) as { id?: string; classe?: string };
      const cz = classeZona(String(p.classe ?? ''));
      return { type: 'Feature' as const, properties: { cor: cz.cor, rotulo: String(p.id ?? '?'), classeLabel: cz.label, selecionada: false }, geometry: f.geometry! };
    });
    setZonasManejo({ type: 'FeatureCollection', features }); setMapMode('satellite');
  }
  async function processarZonas(file: File) {
    setZonaEstado('loading'); setZonaMsg('');
    try {
      const result = await parseGeoFile(file);
      const [a, b, c, d] = result.bbox;
      if (!(a >= -180 && c <= 180 && b >= -90 && d <= 90)) throw new Error('Arquivo em coordenadas projetadas. Exporte com .prj (ou em WGS84).');
      const prep = normalizarZonas(result.geojson);
      if (prep.count === 0) throw new Error('Nenhum polígono de zona encontrado.');
      updateTalhao(talhao!.id, { zonasGeojson: JSON.stringify(prep.fc) });
      publicarZonas(prep.fc);
      setZonaMsg(`${prep.count} zonas · ${prep.classes.join(', ')}`); setZonaEstado('ok'); onZonas();
    } catch (e: unknown) { setZonaEstado('erro'); setZonaMsg(e instanceof Error ? e.message : 'Erro ao processar.'); }
  }
  function onZonaFile(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) processarZonas(f); e.target.value = ''; }

  function verArgila() {
    if (!argila) return;
    let url: string | undefined;
    if (temGrid(argila.resp)) { try { url = colorirGridComLegenda(argila.resp.grid, argila.legenda).dataUrl; } catch {} }
    if (!url && argila.resp.png) url = argila.resp.png;
    if (!url) return;
    setFertilidadeLabels(null);
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(argila.resp.bounds), opacity: 1 });
    setMapMode('satellite');
  }

  return (
    <div>
      <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#0a1929', borderBottom: '1px solid #0f2240' }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Mapas definitivos</span>
      </div>

      {/* Zonas de manejo */}
      <DefRow icon={Layers} cor="#86efac" label="Zonas de manejo"
        estado={temZonas ? 'ver' : 'upload'} carregando={zonaEstado === 'loading'}
        onVer={temZonas ? () => { try { publicarZonas(JSON.parse(talhao!.zonasGeojson!) as GeoJSON.FeatureCollection); } catch {} } : undefined}
        onUpload={() => zonasRef.current?.click()} />
      {zonaEstado === 'ok' && zonaMsg && <p className="px-4 pb-1 text-[10px]" style={{ color: '#86efac' }}>{zonaMsg}</p>}
      {zonaEstado === 'erro' && zonaMsg && <p className="px-4 pb-1 text-[10px]" style={{ color: '#f87171' }}>{zonaMsg}</p>}
      <input ref={zonasRef} type="file" accept=".kml,.zip,.geojson,.json" className="hidden" onChange={onZonaFile} />

      {/* Textura (Argila) */}
      <DefRow icon={BarChart3} cor="#f59e0b" label="Textura (Argila)"
        estado={argilaLoad ? 'load' : argila ? 'ver' : 'vazio'} onVer={verArgila} />

      {/* Em breve */}
      <DefRow icon={Mountain} cor="#94a3b8" label="Altimetria" estado="breve" />
      <DefRow icon={BarChart3} cor="#f472b6" label="Produtividade" estado="breve" />
    </div>
  );
}

function DefRow({ icon: Icon, cor, label, estado, carregando, onVer, onUpload }: {
  icon: React.ElementType; cor: string; label: string;
  estado: 'ver' | 'upload' | 'vazio' | 'breve' | 'load'; carregando?: boolean;
  onVer?: () => void; onUpload?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #0f2240' }}>
      <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: cor + '22' }}><Icon size={13} style={{ color: cor }} /></div>
      <span className="text-xs font-semibold flex-1" style={{ color: estado === 'breve' || estado === 'vazio' ? '#64748b' : '#e2e8f0' }}>{label}</span>
      {(estado === 'load' || carregando) && <Loader2 size={13} className="animate-spin" style={{ color: '#64748b' }} />}
      {estado === 'ver' && !carregando && (
        <button onClick={onVer} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Eye size={11} /> Ver no mapa</button>
      )}
      {estado === 'upload' && !carregando && (
        <button onClick={onUpload} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#86efac' }}><Upload size={11} /> Carregar</button>
      )}
      {estado === 'vazio' && <span className="text-[10px]" style={{ color: '#475569' }}>sem dados</span>}
      {estado === 'breve' && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#64748b' }}>em breve</span>}
    </div>
  );
}

// ── painel principal ─────────────────────────────────────────────────────────
export function TalhaoDetailPanel() {
  const { setActivePanel, nav, setNav, setMapMode, setUploadedGeo, setUploadedBbox, setZonasManejo } = useApp();

  const [talhao, setTalhao] = useState<Talhao | null>(null);
  const [safras, setSafras] = useState<Safra[]>([]);
  const [safra, setSafra] = useState('');
  const [mostraFormSafra, setMostraFormSafra] = useState(false);
  const [novaSafra, setNovaSafra] = useState({ anoInicio: new Date().getFullYear(), anoFim: new Date().getFullYear() + 1 });
  const [renomeando, setRenomeando] = useState(false);
  const [nomeTemp, setNomeTemp] = useState('');
  const [numDependencias, setNumDependencias] = useState(0);

  function salvarRenome() {
    const novo = nomeTemp.trim();
    if (!nav.talhaoId || !novo) { setRenomeando(false); return; }
    updateTalhao(nav.talhaoId, { nome: novo });
    setNav({ talhao: novo });
    setTalhao(t => (t ? { ...t, nome: novo } : t));
    setRenomeando(false);
  }
  function apagarTalhao() {
    if (!nav.talhaoId) return;
    if (numDependencias > 0) { alert('Este talhão tem grades/importações/mapas. Apague esses dados primeiro para poder excluir o talhão.'); return; }
    if (!confirm(`Excluir o talhão "${nav.talhao}"? Esta ação não pode ser desfeita.`)) return;
    deleteTalhao(nav.talhaoId);
    voltarFazenda();
  }

  useEffect(() => {
    if (!nav.talhaoId) return;
    const t = getTalhoes().find(x => x.id === nav.talhaoId) ?? null;
    setTalhao(t);
    setNumDependencias(getGrades(nav.talhaoId).length + getImportacoesLab(nav.talhaoId).length + getImportacoesCompactacao(nav.talhaoId).length);
    const sf = getSafras();
    setSafras(sf);
    const ativa = sf.find(s => s.ativa);
    if (ativa) setSafra(ativa.nome);
    if (t?.geojson && t.bbox) {
      try { setUploadedGeo(JSON.parse(t.geojson) as GeoJSON.FeatureCollection); setUploadedBbox(t.bbox); } catch {}
    }
  }, [nav.talhaoId, setUploadedGeo, setUploadedBbox]);

  function voltarFazenda() {
    setNav({ talhaoId: null, talhao: '', area: 0 });
    setMapMode('street'); setUploadedGeo(null); setUploadedBbox(null); setZonasManejo(null);
    setActivePanel(`fazenda-${nav.fazendaId}`);
  }
  function handleUploaded(areaHa: number) {
    const t = getTalhoes().find(x => x.id === nav.talhaoId) ?? null;
    setTalhao(t); setNav({ area: areaHa });
  }
  function handleZonas() { const t = getTalhoes().find(x => x.id === nav.talhaoId) ?? null; setTalhao(t); }

  function handleCriarSafra() {
    const { anoInicio, anoFim } = novaSafra;
    if (!anoInicio || !anoFim) return;
    const nome = `${String(anoInicio).slice(-2)}/${String(anoFim).slice(-2)}`;
    if (!getSafras().find(s => s.nome === nome)) {
      const primeira = getSafras().length === 0;
      saveSafra({ nome, anoInicio, anoFim, ativa: primeira });
    }
    setSafras(getSafras()); setSafra(nome); setMostraFormSafra(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho do talhão */}
      <div className="flex-shrink-0" style={{ background: '#0a1929', borderBottom: '1px solid #1a3a6b' }}>
        <button onClick={voltarFazenda} className="flex items-center gap-1.5 px-4 py-2 text-xs transition-colors w-full text-left"
          style={{ color: '#93c5fd', borderBottom: '1px solid #0f2240' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          <ChevronLeft size={12} /> {nav.fazenda || 'Fazenda'}
        </button>

        <div className="px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              {renomeando ? (
                <div className="flex items-center gap-1">
                  <input autoFocus value={nomeTemp} onChange={e => setNomeTemp(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') salvarRenome(); if (e.key === 'Escape') setRenomeando(false); }}
                    className="rounded px-1.5 py-0.5 text-sm font-bold outline-none" style={{ background: '#1a3a6b', color: '#fff', border: '1px solid #2e5fa3', width: 150 }} />
                  <button onClick={salvarRenome} title="Salvar" className="p-1" style={{ color: '#4ade80' }}><Save size={13} /></button>
                  <button onClick={() => setRenomeando(false)} title="Cancelar" className="p-1" style={{ color: '#94a3b8' }}><X size={13} /></button>
                </div>
              ) : (
                <p className="text-base font-bold flex items-center gap-1.5" style={{ color: '#fff' }}>
                  {nav.talhao}
                  <button onClick={() => { setNomeTemp(nav.talhao); setRenomeando(true); }} title="Renomear talhão" className="p-0.5" style={{ color: '#64748b' }}><Pencil size={12} /></button>
                </p>
              )}
              <p className="text-xs mt-0.5" style={{ color: '#93c5fd' }}>{nav.fazenda}</p>
              <p className="text-xs" style={{ color: '#64748b' }}>{nav.area > 0 ? `${nav.area.toLocaleString('pt-BR')} ha · ` : ''}{nav.produtor}</p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full font-semibold"
              style={{ background: talhao?.status === 'ativo' ? '#166534' : '#78350f', color: talhao?.status === 'ativo' ? '#86efac' : '#fde68a' }}>
              {talhao?.status === 'ativo' ? 'Ativo' : 'Incompleto'}
            </span>
          </div>

          <button onClick={() => nav.talhaoId && window.open(`/talhao/${nav.talhaoId}`, '_blank')}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--invicta-blue-mid)' }}>
            <ExternalLink size={13} /> Abrir página completa do talhão
          </button>

          <button onClick={apagarTalhao}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-semibold"
            style={{ background: numDependencias > 0 ? '#1a3a6b' : '#7f1d1d', color: numDependencias > 0 ? '#475569' : '#fca5a5' }}>
            <Trash2 size={12} /> {numDependencias > 0 ? `Exclusão bloqueada (${numDependencias} item${numDependencias > 1 ? 'ns' : ''})` : 'Apagar talhão'}
          </button>
        </div>

        {/* Seletor de Safra */}
        <div className="px-4 py-2" style={{ borderTop: '1px solid #0f2240' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: '#64748b' }}>Safra</span>
            {safras.length === 0 && !mostraFormSafra && <span className="text-[10px]" style={{ color: '#475569' }}>Nenhuma safra cadastrada</span>}
            {safras.map(s => (
              <button key={s.id} onClick={() => setSafra(s.nome)} className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                style={{ background: safra === s.nome ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: safra === s.nome ? '#fff' : '#64748b' }}>
                {s.nome}
              </button>
            ))}
            <button onClick={() => setMostraFormSafra(v => !v)} title="Cadastrar safra"
              className="px-1.5 py-1 rounded text-xs font-bold flex items-center gap-0.5 transition-colors"
              style={{ background: mostraFormSafra ? '#374151' : 'var(--invicta-green-dark)', color: '#fff' }}>
              {mostraFormSafra ? <X size={12} /> : <Plus size={12} />}
            </button>
          </div>

          {mostraFormSafra && (
            <div className="mt-2 p-2 rounded space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Ano início</label>
                  <input type="number" value={novaSafra.anoInicio} min={2000} max={2100} onChange={e => setNovaSafra(p => ({ ...p, anoInicio: Number(e.target.value) }))}
                    className="w-full rounded px-2 py-1 text-xs outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Ano fim</label>
                  <input type="number" value={novaSafra.anoFim} min={2000} max={2100} onChange={e => setNovaSafra(p => ({ ...p, anoFim: Number(e.target.value) }))}
                    className="w-full rounded px-2 py-1 text-xs outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
                </div>
              </div>
              <button onClick={handleCriarSafra} className="w-full py-1.5 rounded text-xs font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
                <Save size={11} /> Cadastrar {String(novaSafra.anoInicio).slice(-2)}/{String(novaSafra.anoFim).slice(-2)}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo informativo */}
      <div className="flex-1 overflow-y-auto">
        <GeoSection talhao={talhao} onUploaded={handleUploaded} />
        <ResumoSafra talhaoId={nav.talhaoId ?? ''} safra={safra} />
        <MapasDefinitivos talhao={talhao} safra={safra} onZonas={handleZonas} />
      </div>
    </div>
  );
}
