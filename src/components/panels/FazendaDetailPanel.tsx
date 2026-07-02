'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { getFazendas, getTalhoes, saveTalhao, importarTalhoesLote, updateFazenda, Fazenda, Talhao } from '@/lib/store';
import { pode } from '@/lib/empresa';
import { detectarMunicipiosFazenda } from '@/lib/geocode';
import { prepararTalhoesEmMassa, CandidatoTalhao } from '@/lib/geo';
import { ChevronLeft, ChevronRight, Plus, Map, AlertTriangle, Save, X, ExternalLink, MapPin, Loader2, Upload, CheckCircle2 } from 'lucide-react';
import { PanelSection, PanelButton, StatusBadge } from './_shared';

export function FazendaDetailPanel() {
  const { nav, setNav, setActivePanel, setMapMode, setUploadedGeo, setUploadedBbox, setTalhoesFazenda } = useApp();
  const [tab, setTab] = useState<'talhoes' | 'dados'>('talhoes');
  const [fazenda, setFazenda] = useState<Fazenda | null>(null);
  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [mostraForm, setMostraForm] = useState(false);
  const [mostraImport, setMostraImport] = useState(false);
  const [form, setForm] = useState({ nome: '' });
  const [salvando, setSalvando] = useState(false);
  const [detectando, setDetectando] = useState(false);
  const [msgMunicipio, setMsgMunicipio] = useState('');

  async function detectarMunicipio() {
    if (!nav.fazendaId || detectando) return;
    setMsgMunicipio(''); setDetectando(true);
    try {
      const r = await detectarMunicipiosFazenda(nav.fazendaId);
      if (!r) { setMsgMunicipio('Não consegui detectar — talhões sem geometria ou serviço indisponível.'); return; }
      updateFazenda(nav.fazendaId, { municipio: r.municipios.join(' / '), ...(r.uf ? { estado: r.uf } : {}) });
      setFazenda(getFazendas().find(f => f.id === nav.fazendaId) ?? null);
      setMsgMunicipio(`Detectado: ${r.municipios.join(' / ')}${r.uf ? ` (${r.uf})` : ''}.`);
    } finally { setDetectando(false); }
  }

  // Monta a camada de polígonos dos talhões da fazenda para o mapa.
  // Robusto: aceita o geojson salvo como FeatureCollection, Feature, Geometry
  // ou GeometryCollection — extrai todos os Polygon/MultiPolygon de qualquer um.
  function publicarTalhoesNoMapa(lista: Talhao[]) {
    const features: GeoJSON.Feature[] = [];

    for (const t of lista) {
      if (!t.geojson) continue;
      let obj: unknown;
      try { obj = JSON.parse(t.geojson); } catch { continue; }

      const geoms: GeoJSON.Geometry[] = [];
      const visitGeom = (g: GeoJSON.Geometry | null | undefined) => {
        if (!g) return;
        if (g.type === 'Polygon' || g.type === 'MultiPolygon') geoms.push(g);
        else if (g.type === 'GeometryCollection') g.geometries.forEach(visitGeom);
      };
      const o = obj as { type?: string; features?: { geometry?: GeoJSON.Geometry }[]; geometry?: GeoJSON.Geometry };
      if (o?.type === 'FeatureCollection' && Array.isArray(o.features)) o.features.forEach(f => visitGeom(f?.geometry));
      else if (o?.type === 'Feature') visitGeom(o.geometry);
      else visitGeom(obj as GeoJSON.Geometry); // geometria direta

      for (const g of geoms) {
        features.push({ type: 'Feature', properties: { talhaoId: t.id, nome: t.nome, area: t.areaHa }, geometry: g });
      }
    }
    setTalhoesFazenda({ type: 'FeatureCollection', features });
  }

  useEffect(() => {
    if (!nav.fazendaId) return;
    const todas = getFazendas();
    setFazenda(todas.find(f => f.id === nav.fazendaId) ?? null);
    const lista = getTalhoes(nav.fazendaId);
    setTalhoes(lista);
    // ao abrir a fazenda, mostra os talhões dela no mapa (limpa geometria de talhão anterior)
    setUploadedGeo(null);
    setUploadedBbox(null);
    setMapMode('satellite');
    publicarTalhoesNoMapa(lista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.fazendaId]);

  // Ao sair da fazenda, limpa a camada
  useEffect(() => () => setTalhoesFazenda(null), [setTalhoesFazenda]);

  function reload() {
    if (!nav.fazendaId) return;
    const lista = getTalhoes(nav.fazendaId);
    setTalhoes(lista);
    publicarTalhoesNoMapa(lista);
  }

  function abrirTalhao(t: Talhao) {
    setNav({ talhaoId: t.id, talhao: t.nome, area: t.areaHa });
    setMapMode('satellite');
    setActivePanel(`talhao-${t.id}`);
  }

  function voltarProdutor() {
    setNav({ fazendaId: null, fazenda: '', talhaoId: null, talhao: '' });
    setActivePanel(`produtor-${nav.produtorId}`);
  }

  function handleSalvarTalhao() {
    if (!form.nome.trim() || !nav.fazendaId) return;
    setSalvando(true);
    setTimeout(() => {
      saveTalhao({ fazendaId: nav.fazendaId!, nome: form.nome.trim(), areaHa: 0, status: 'incompleto' });
      reload();
      setForm({ nome: '' });
      setMostraForm(false);
      setSalvando(false);
    }, 300);
  }

  const incompletos = talhoes.filter(t => t.status === 'incompleto').length;

  if (!fazenda) return (
    <div className="flex items-center justify-center p-8">
      <p className="text-xs" style={{ color: '#64748b' }}>Carregando...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Voltar */}
      <button onClick={voltarProdutor}
        className="flex items-center gap-1.5 px-4 py-2 text-xs w-full text-left transition-colors flex-shrink-0"
        style={{ color: '#93c5fd', borderBottom: '1px solid #0f2240' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
        <ChevronLeft size={12} /> {nav.produtor}
      </button>

      {/* Header da fazenda */}
      <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b', background: '#0a1929' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#166534' }}>
            <Map size={18} style={{ color: '#86efac' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold truncate" style={{ color: '#fff' }}>{fazenda.nome}</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{fazenda.municipio} · {fazenda.estado}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: '#86efac' }}>
              {talhoes.length} talhão{talhoes.length !== 1 ? 'ões' : ''}
              {fazenda.car ? ` · CAR: ${fazenda.car}` : ''}
            </p>
          </div>
        </div>

        {incompletos > 0 && (
          <div className="mt-3 flex items-center gap-2 p-2 rounded text-xs"
            style={{ background: '#78350f', color: '#fde68a' }}>
            <AlertTriangle size={12} />
            {incompletos} talhão(ões) sem limite geográfico
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        {[{ id: 'talhoes', label: `Talhões (${talhoes.length})` }, { id: 'dados', label: 'Dados' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: tab === t.id ? '#fff' : '#64748b',
              borderBottom: tab === t.id ? '2px solid var(--invicta-green)' : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'talhoes' && (
          <>
            {mostraForm ? (
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Novo Talhão</p>
                <div>
                  <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nome do Talhão *</label>
                  <input value={form.nome} placeholder="Ex: Talhão A1"
                    onChange={e => setForm({ nome: e.target.value })}
                    className="w-full rounded px-3 py-2 text-xs outline-none"
                    style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
                </div>
                <p className="text-[10px]" style={{ color: '#475569' }}>
                  O limite geográfico pode ser carregado depois via KML / shapefile.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setMostraForm(false)}
                    className="flex-1 py-2 rounded text-xs font-semibold flex items-center justify-center gap-1"
                    style={{ background: '#1a3a6b', color: '#94a3b8' }}>
                    <X size={12} /> Cancelar
                  </button>
                  <button onClick={handleSalvarTalhao} disabled={!form.nome.trim() || salvando}
                    className="flex-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40"
                    style={{ background: 'var(--invicta-green-dark)' }}>
                    <Save size={12} /> {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            ) : mostraImport ? (
              <ImportadorTalhoes fazendaId={nav.fazendaId!} existentes={talhoes}
                onFechar={() => setMostraImport(false)} onImportado={reload} />
            ) : (
              <>
                <div className="p-3 space-y-2">
                  <button onClick={() => setMostraForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--invicta-green-dark)' }}>
                    <Plus size={12} /> Novo Talhão
                  </button>
                  <button onClick={() => setMostraImport(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Upload size={12} /> Importar em massa (KML / SHP)
                  </button>
                </div>

                {talhoes.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Map size={28} className="mx-auto mb-2" style={{ color: '#2e3f5c' }} />
                    <p className="text-xs" style={{ color: '#475569' }}>Nenhum talhão cadastrado.</p>
                    <p className="text-xs mt-1" style={{ color: '#2e3f5c' }}>Clique em "Novo Talhão" acima.</p>
                  </div>
                ) : (
                  talhoes.map(t => (
                    <div key={t.id} role="button" tabIndex={0} onClick={() => abrirTalhao(t)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid #0f2240' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: t.status === 'ativo' ? '#166534' : '#78350f' }}>
                        <Map size={14} style={{ color: t.status === 'ativo' ? '#86efac' : '#fde68a' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{t.nome}</p>
                        <p className="text-[11px]" style={{ color: '#64748b' }}>
                          {t.areaHa > 0 ? `${t.areaHa.toLocaleString('pt-BR')} ha` : 'Área não definida'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={t.status} />
                        <button onClick={e => { e.stopPropagation(); window.open(`/talhao/${t.id}`, '_blank'); }}
                          title="Abrir página completa do talhão (nova aba)"
                          className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: '#93c5fd' }}>
                          <ExternalLink size={14} />
                        </button>
                        <ChevronRight size={14} style={{ color: '#64748b' }} />
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            <div className="mx-4 my-3 p-3 rounded text-xs" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              🛰 Ao entrar em um talhão, o mapa troca automaticamente para visão de satélite.
            </div>
          </>
        )}

        {tab === 'dados' && (
          <PanelSection>
            {[
              { label: 'Nome', value: fazenda.nome },
              { label: 'Município', value: fazenda.municipio || '—' },
              { label: 'Estado', value: fazenda.estado },
              { label: 'CAR', value: fazenda.car || '—' },
              { label: 'NIRF', value: fazenda.nirf || '—' },
              { label: 'Cadastrada em', value: new Date(fazenda.criadoEm).toLocaleDateString('pt-BR') },
            ].map(d => (
              <div key={d.label} className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: '1px solid #0f2240' }}>
                <p className="text-xs" style={{ color: '#64748b' }}>{d.label}</p>
                <p className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>{d.value}</p>
              </div>
            ))}
            {pode('cadastro') && (
              <div className="px-4 py-3">
                <button onClick={detectarMunicipio} disabled={detectando}
                  className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'var(--invicta-blue-mid)' }}>
                  {detectando ? <><Loader2 size={13} className="animate-spin" /> Detectando…</> : <><MapPin size={13} /> Detectar município (pelos talhões)</>}
                </button>
                {msgMunicipio && <p className="text-[10px] mt-1.5" style={{ color: '#94a3b8' }}>{msgMunicipio}</p>}
                <p className="text-[9px] mt-1" style={{ color: '#475569' }}>Usa o OpenStreetMap a partir do polígono dos talhões.</p>
              </div>
            )}
          </PanelSection>
        )}
      </div>
    </div>
  );
}

// ── Importação de talhões em massa (#31) ─────────────────────────────────────
// Vários KML/SHP/GeoJSON de uma vez → revisão (nome editável, área, novo ×
// atualiza limite) → grava tudo. Nome igual a talhão existente = atualiza o
// limite dele em vez de criar duplicado.

type LinhaImport = CandidatoTalhao & { incluir: boolean; existenteId: string | null };

function normNome(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function ImportadorTalhoes({ fazendaId, existentes, onFechar, onImportado }: {
  fazendaId: string; existentes: Talhao[]; onFechar: () => void; onImportado: () => void;
}) {
  const { setUploadedGeo, setUploadedBbox } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaImport[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resumo, setResumo] = useState('');

  const casarExistente = (nome: string) =>
    existentes.find(t => normNome(t.nome) === normNome(nome))?.id ?? null;

  async function processar(files: File[]) {
    if (!files.length) return;
    setLendo(true); setResumo('');
    const r = await prepararTalhoesEmMassa(files);
    const novas = r.candidatos.map(c => ({ ...c, incluir: true, existenteId: casarExistente(c.nome) }));
    setLinhas(prev => [...prev, ...novas]);
    setErros(prev => [...prev, ...r.erros]);
    setLendo(false);
  }

  // pré-visualização no mapa: todos os candidatos marcados
  useEffect(() => {
    const inc = linhas.filter(l => l.incluir);
    if (!inc.length) return;
    setUploadedGeo({ type: 'FeatureCollection', features: inc.flatMap(l => l.geojson.features) });
    let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
    inc.forEach(l => {
      a = Math.min(a, l.bbox[0]); b = Math.min(b, l.bbox[1]);
      c = Math.max(c, l.bbox[2]); d = Math.max(d, l.bbox[3]);
    });
    setUploadedBbox([a, b, c, d]);
  }, [linhas, setUploadedGeo, setUploadedBbox]);

  function setLinha(i: number, patch: Partial<LinhaImport>) {
    setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function limparPreview() { setUploadedGeo(null); setUploadedBbox(null); }

  async function importar() {
    if (importando) return;
    setImportando(true); setResumo('');
    await new Promise(r => setTimeout(r, 30)); // deixa o "Importando…" aparecer
    try {
      const novos: Parameters<typeof importarTalhoesLote>[0] = [];
      const atualizacoes: Parameters<typeof importarTalhoesLote>[1] = [];
      for (const l of linhas) {
        if (!l.incluir) continue;
        const dados = {
          geojson: JSON.stringify(l.geojson), bbox: l.bbox,
          areaHa: l.areaHa, areaHaSemHoles: l.areaHaBruta, status: 'ativo' as const,
        };
        if (l.existenteId) atualizacoes.push({ id: l.existenteId, data: dados });
        else novos.push({ fazendaId, nome: l.nome, ...dados });
      }
      const r = importarTalhoesLote(novos, atualizacoes);
      limparPreview();
      setLinhas([]); setErros([]);
      setResumo(`✓ ${r.criados} talhão(ões) criado(s)${r.atualizados ? ` · ${r.atualizados} limite(s) atualizado(s)` : ''}.`);
      onImportado();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'erro inesperado';
      setResumo(/quota/i.test(msg)
        ? '⚠ Sem espaço no navegador para gravar tudo — importe em lotes menores.'
        : `⚠ Falha ao importar: ${msg}`);
    }
    setImportando(false);
  }

  const incluidos = linhas.filter(l => l.incluir);
  const areaTotal = incluidos.reduce((s, l) => s + l.areaHa, 0);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Importar talhões em massa</p>
        <button onClick={() => { limparPreview(); onFechar(); }} className="p-1 rounded hover:bg-white/10" style={{ color: '#64748b' }}>
          <X size={14} />
        </button>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); processar([...e.dataTransfer.files]); }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-lg py-4 text-center cursor-pointer transition-colors"
        style={{ borderColor: dragging ? '#60a5fa' : '#1e3a5f', background: dragging ? '#0f2240' : 'transparent' }}>
        {lendo ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={18} className="animate-spin" style={{ color: '#60a5fa' }} />
            <p className="text-[10px]" style={{ color: '#64748b' }}>Processando arquivos...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload size={18} style={{ color: '#475569' }} />
            <p className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>Arraste VÁRIOS arquivos ou clique</p>
            <p className="text-[9px] px-3" style={{ color: '#475569' }}>
              .kml · .zip (shapefile) · .geojson — 1 arquivo por talhão, ou 1 arquivo com vários talhões nomeados (glebas com o mesmo nome viram um talhão só)
            </p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" multiple accept=".kml,.zip,.geojson,.json" className="hidden"
        onChange={e => { processar([...(e.target.files ?? [])]); e.target.value = ''; }} />

      {erros.map((er, i) => (
        <p key={i} className="text-[10px]" style={{ color: '#f87171' }}>⚠ {er}</p>
      ))}
      {resumo && (
        <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: '#4ade80' }}>
          <CheckCircle2 size={13} /> {resumo}
        </p>
      )}

      {linhas.length > 0 && (
        <>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
            {linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg"
                style={{ background: '#0b1d3a', border: '1px solid #1a3a6b', opacity: l.incluir ? 1 : 0.45 }}>
                <input type="checkbox" checked={l.incluir} onChange={e => setLinha(i, { incluir: e.target.checked })}
                  className="flex-shrink-0 accent-green-600" />
                <div className="flex-1 min-w-0">
                  <input value={l.nome}
                    onChange={e => setLinha(i, { nome: e.target.value, existenteId: casarExistente(e.target.value) })}
                    className="w-full bg-transparent text-xs font-semibold outline-none"
                    style={{ color: '#e2e8f0', borderBottom: '1px dashed #1a3a6b' }} />
                  <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                    {l.areaHa.toLocaleString('pt-BR')} ha · {l.arquivo}
                  </p>
                </div>
                {l.existenteId ? (
                  <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#78350f', color: '#fde68a' }}>
                    atualiza limite
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#166534', color: '#86efac' }}>
                    novo
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px]" style={{ color: '#94a3b8' }}>
            <span>{incluidos.length} de {linhas.length} selecionado(s)</span>
            <span className="font-bold" style={{ color: '#86efac' }}>
              {areaTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { limparPreview(); onFechar(); }}
              className="flex-1 py-2 rounded text-xs font-semibold" style={{ background: '#1a3a6b', color: '#94a3b8' }}>
              Cancelar
            </button>
            <button onClick={() => void importar()} disabled={incluidos.length === 0 || importando}
              className="flex-1 py-2 rounded text-xs font-bold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
              style={{ background: 'var(--invicta-green-dark)' }}>
              {importando
                ? <><Loader2 size={12} className="animate-spin" /> Importando…</>
                : <>Importar {incluidos.length} talhão(ões)</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
