'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { getFazendas, getTalhoes, saveTalhao, Fazenda, Talhao } from '@/lib/store';
import { ChevronLeft, ChevronRight, Plus, Map, AlertTriangle, Save, X } from 'lucide-react';
import { PanelSection, PanelButton, StatusBadge } from './_shared';

export function FazendaDetailPanel() {
  const { nav, setNav, setActivePanel, setMapMode, setUploadedGeo, setUploadedBbox, setTalhoesFazenda } = useApp();
  const [tab, setTab] = useState<'talhoes' | 'dados'>('talhoes');
  const [fazenda, setFazenda] = useState<Fazenda | null>(null);
  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm] = useState({ nome: '' });
  const [salvando, setSalvando] = useState(false);

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
            ) : (
              <>
                <div className="p-3">
                  <button onClick={() => setMostraForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--invicta-green-dark)' }}>
                    <Plus size={12} /> Novo Talhão
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
                    <button key={t.id} onClick={() => abrirTalhao(t)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
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
                        <ChevronRight size={14} style={{ color: '#64748b' }} />
                      </div>
                    </button>
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
          </PanelSection>
        )}
      </div>
    </div>
  );
}
