'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getPadroesAmostragem, getPadroesElementos, getConfigEtiqueta, getSafras, getGrades, saveGrade, updateGrade, deleteGrade, marcarParaProcessar, ProfundidadeConfig, GradeAmostragem, PontoAmostragem } from '@/lib/store';
import { classeZona, ORDEM_CLASSES } from '@/lib/zonas';
import { gerarGrid, pontoInterno, ModoDistribuicao } from '@/lib/grid';
import { gerarEtiquetasPDF, EtiquetaItem, LAYOUTS_ETIQUETA } from '@/lib/etiquetas';
import { exportarKML, exportarSHP } from '@/lib/exportGrade';
import { AlertTriangle, Layers, MapPin, Printer, RotateCcw, Save, Trash2, CheckCircle2, Circle, Pencil, Download } from 'lucide-react';

interface ZonaFeat {
  id: string;
  classeLabel: string;
  cor: string;
  areaHa: number;
  geometry: GeoJSON.Geometry;
}

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const COR_PONTO = '#0f172a';

export function SimuladorZonas() {
  const { nav, setZonasManejo, setPontosSimulados, zonaEvent, setZonaEvent } = useApp();

  const [modelo, setModelo] = useState<'A' | 'B'>('A');
  const [padraoId, setPadraoId] = useState('');
  const [profs, setProfs] = useState<ProfundidadeConfig[]>([]);
  const [densidade, setDensidade] = useState(2);     // ha por ponto (padrão geral) — ex: 1 ponto a cada 2 ha
  const [densidadePorZona, setDensidadePorZona] = useState<Record<string, number>>({}); // override por zona (ha/ponto)
  const [zonaSel, setZonaSel] = useState<string | null>(null); // zona selecionada para ajuste
  const [aleatoriedade, setAleatoriedade] = useState(0);
  const [distanciaBorda, setDistanciaBorda] = useState(15);
  const [seed, setSeed] = useState(1);
  const [modoDist, setModoDist] = useState<ModoDistribuicao>('inteligente');

  // Clique numa zona (no mapa) seleciona/alterna para ajuste de densidade
  useEffect(() => {
    if (!zonaEvent) return;
    const r = zonaEvent.rotulo;
    setZonaSel(prev => (prev === r ? null : r));
    setZonaEvent(null);
  }, [zonaEvent, setZonaEvent]);

  const padroes = useMemo(() => getPadroesAmostragem(), []);
  const padroesElem = useMemo(() => getPadroesElementos(), []);
  const padrao = padroes.find(p => p.id === padraoId) ?? null;
  const nomeElem = (id: string) => padroesElem.find(p => p.id === id)?.nome ?? '—';

  const talhao = useMemo(() => getTalhoes().find(t => t.id === nav.talhaoId) ?? null, [nav.talhaoId]);

  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraAtiva?.nome ?? '';
  const [grades, setGrades] = useState<GradeAmostragem[]>([]);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState('');

  function recarregarGrades() {
    if (nav.talhaoId && safraNome) setGrades(getGrades(nav.talhaoId, safraNome, 'zonas'));
  }
  useEffect(() => { recarregarGrades(); /* eslint-disable-next-line */ }, [nav.talhaoId, safraNome]);

  // Ao escolher um padrão, herda as profundidades
  useEffect(() => {
    if (padrao) setProfs(padrao.profundidades.map(p => ({ ...p })));
  }, [padrao]);

  // Zonas com geometria
  const zonas = useMemo<ZonaFeat[]>(() => {
    if (!talhao?.zonasGeojson) return [];
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      return fc.features
        .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
        .map(f => {
          const p = (f.properties ?? {}) as { id?: string; classe?: string; areaHa?: number };
          const cz = classeZona(p.classe ?? '');
          return { id: String(p.id ?? '?'), classeLabel: cz.label, cor: cz.cor, areaHa: Number(p.areaHa ?? 0), geometry: f.geometry! };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch { return []; }
  }, [talhao]);

  // Publica as zonas coloridas no mapa
  useEffect(() => {
    if (zonas.length === 0) { setZonasManejo(null); return; }
    const features = zonas.map(z => ({
      type: 'Feature' as const,
      properties: { cor: z.cor, rotulo: z.id, classeLabel: z.classeLabel, selecionada: z.id === zonaSel },
      geometry: z.geometry,
    }));
    setZonasManejo({ type: 'FeatureCollection', features });
    return () => setZonasManejo(null);
  }, [zonas, zonaSel, setZonasManejo]);

  // Geração de pontos por zona (grid dentro de cada zona + aleatoriedade)
  const { pontos, totalPontos, porZona } = useMemo(() => {
    const out: { lng: number; lat: number; label: string }[] = [];
    const cont: Record<string, number> = {};
    let seq = 0;
    zonas.forEach((z, idxZona) => {
      const zonaFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: z.geometry }] };
      const dz = densidadePorZona[z.id];
      const haPonto = dz && dz > 0 ? dz : (densidade > 0 ? densidade : 1); // override da zona ou padrão geral
      let pts = gerarGrid({ geojson: zonaFC, densidadeHaPonto: haPonto, distanciaBordaM: distanciaBorda, rotacaoGraus: 0, aleatoriedade, seed, modo: modoDist });
      if (pts.length === 0) {
        const pi = pontoInterno(zonaFC, distanciaBorda);
        if (pi) pts = [{ lng: pi.lng, lat: pi.lat, ordem: 0 }];
      }
      cont[z.id] = pts.length;
      const amostraNum = idxZona + 1; // modelo A: 1 amostra por zona
      pts.forEach(p => {
        seq++;
        out.push({ lng: p.lng, lat: p.lat, label: modelo === 'A' ? String(amostraNum) : String(seq) });
      });
    });
    return { pontos: out, totalPontos: out.length, porZona: cont };
  }, [zonas, modelo, densidade, densidadePorZona, aleatoriedade, distanciaBorda, seed, modoDist]);

  // Publica os pontos no mapa
  useEffect(() => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pontos.map(p => ({ type: 'Feature', properties: { label: p.label, cor: COR_PONTO }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    };
    setPontosSimulados(pontos.length ? fc : null);
    return () => setPontosSimulados(null);
  }, [pontos, setPontosSimulados]);

  if (!talhao?.zonasGeojson || zonas.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Talhão sem zonas de manejo</p>
            <p className="text-[10px] mt-1" style={{ color: '#78350f' }}>Carregue o arquivo de zonas (KML/Shapefile) na seção Zonas de Manejo do talhão.</p>
          </div>
        </div>
      </div>
    );
  }

  const classesPresentes = ORDEM_CLASSES.filter(c => zonas.some(z => z.classeLabel === c));
  const areaTotal = Math.round(zonas.reduce((s, z) => s + z.areaHa, 0) * 100) / 100;
  const numAmostras = modelo === 'A' ? zonas.length : totalPontos;
  // Etiquetas = amostras × profundidades (parciais aplicadas a % das amostras)
  const totalEtiquetas = profs.reduce((s, p) => s + (p.percentual >= 100 ? numAmostras : Math.max(1, Math.round((numAmostras * p.percentual) / 100))), 0);

  const zonaSelObj = zonas.find(z => z.id === zonaSel) ?? null;
  const densidadeEfetiva = (id: string) => densidadePorZona[id] ?? densidade;
  const temOverride = (id: string) => densidadePorZona[id] != null;
  const nZonasCustom = Object.keys(densidadePorZona).length;

  function gerarEtiquetasZonas() {
    if (!padrao || numAmostras <= 0) return;
    const titulo = talhao?.nome || 'Talhao';
    const rod = modelo === 'A' ? 'Amostra composta' : 'Ponto individual';
    const itens: EtiquetaItem[] = [];
    for (let i = 1; i <= numAmostras; i++) {
      const numero = String(i).padStart(3, '0');
      for (const p of profs) {
        const cnt = p.percentual >= 100 ? numAmostras : Math.max(1, Math.round((numAmostras * p.percentual) / 100));
        if (i <= cnt) itens.push({ titulo, numero, sub: `${p.rotulo} cm`, rodape: rod });
      }
    }
    const cfg = getConfigEtiqueta();
    const layout = LAYOUTS_ETIQUETA.find(l => l.id === cfg.layoutId) ?? LAYOUTS_ETIQUETA[0];
    gerarEtiquetasPDF(itens, layout, `${titulo}_zonas_etiquetas`, { dx: cfg.dx, dy: cfg.dy })
      .catch(err => console.error('Erro ao gerar etiquetas:', err));
  }

  function pontosParaGrade(): PontoAmostragem[] {
    const rotulos = profs.map(p => p.rotulo);
    return pontos.map((p, i) => ({ ordem: i, lng: p.lng, lat: p.lat, profs: rotulos.length, profundidades: rotulos }));
  }

  function salvarGradeZonas() {
    if (!padrao || !safraAtiva || pontos.length === 0 || !nav.talhaoId) return;
    const lista = getGrades(nav.talhaoId, safraNome, 'zonas');
    saveGrade({
      talhaoId: nav.talhaoId, safra: safraNome, epoca: '1', nome: `Zonas ${lista.length + 1}`, metodo: 'zonas',
      modelo, modoDist, densidadePorZona,
      padraoAmostragemId: padrao.id, padraoNome: padrao.nome,
      customizado: nZonasCustom > 0 || densidade !== padrao.densidadeHaPonto,
      densidade, distanciaBorda, rotacao: 0, aleatoriedade, modoSel: 'regular',
      profundidades: profs, pontos: pontosParaGrade(),
      paraProcessar: lista.length === 0,
    });
    recarregarGrades();
  }

  function confirmarRenome(id: string) {
    if (nomeTemp.trim()) updateGrade(id, { nome: nomeTemp.trim() });
    setRenomeando(null); recarregarGrades();
  }

  function exportar(g: GradeAmostragem, formato: 'kml' | 'shp') {
    if (!talhao?.zonasGeojson) return;
    let poligono: GeoJSON.FeatureCollection;
    try { poligono = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection; } catch { return; }
    const input = { talhaoNome: talhao.nome || 'Talhao', poligono, pontos: g.pontos, poligonoTipo: 'zona' as const };
    if (formato === 'kml') exportarKML(input, g.nome);
    else exportarSHP(input, g.nome).catch(err => console.error('Erro ao exportar SHP:', err));
  }

  return (
    <div className="p-3 space-y-3">
      {/* Resumo */}
      <div className="flex items-center gap-2 text-xs" style={{ color: '#94a3b8' }}>
        <Layers size={14} style={{ color: '#86efac' }} />
        <span><strong style={{ color: '#e2e8f0' }}>{zonas.length}</strong> zonas · {areaTotal} ha</span>
      </div>

      {/* Modelo de coleta */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Modelo de coleta</label>
        <div className="space-y-1">
          {([['A', 'Amostra composta', '1 amostra por zona, de vários pontos'], ['B', 'Pontos individuais', 'cada ponto = 1 amostra ao laboratório']] as const).map(([m, t, d]) => (
            <button key={m} onClick={() => setModelo(m)}
              className="w-full flex items-start gap-2 p-2 rounded-lg text-left transition-colors"
              style={{ background: modelo === m ? '#0f2240' : 'transparent', border: `1px solid ${modelo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b'}` }}>
              <div className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0 flex items-center justify-center" style={{ border: `2px solid ${modelo === m ? '#60a5fa' : '#475569'}` }}>
                {modelo === m && <div className="w-2 h-2 rounded-full" style={{ background: '#60a5fa' }} />}
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: modelo === m ? '#e2e8f0' : '#94a3b8' }}>{t}</p>
                <p className="text-[10px]" style={{ color: '#475569' }}>{d}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Padrão de amostragem (profundidades para as etiquetas) */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Padrão de Amostragem</label>
        <select value={padraoId} onChange={e => setPadraoId(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione…</option>
          {padroes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {/* Profundidades do padrão */}
      {padrao && profs.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: '#64748b' }}>
            <Layers size={11} /> Profundidades
          </label>
          <div className="space-y-1">
            {profs.map((p, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <span className="text-xs font-bold" style={{ color: '#93c5fd', minWidth: '48px' }}>{p.rotulo}</span>
                <span className="text-[10px]" style={{ color: '#64748b' }}>{p.percentual}%</span>
                <span className="text-[10px] truncate flex-1 text-right" style={{ color: '#64748b' }}>{nomeElem(p.padraoElementosId)}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] mt-1" style={{ color: '#475569' }}>
            {modelo === 'A' ? 'Profundidades aplicadas por zona (amostra composta).' : 'Profundidades aplicadas por ponto.'}
          </p>
        </div>
      )}

      {/* Densidade */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Densidade (ha / ponto)</label>
        <input type="number" step="0.5" min="0.1" value={densidade}
          onChange={e => setDensidade(Number(e.target.value.replace(',', '.')) || 0)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>Ex: 2 = 1 ponto a cada 2 ha. Zonas pequenas recebem ao menos 1 ponto.</p>
      </div>

      {/* Ajuste de densidade por zona */}
      <div className="rounded-lg p-2.5" style={{ background: '#0b1f3a', border: '1px dashed #2e5fa3' }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Densidade por zona</p>
          {nZonasCustom > 0 && (
            <span className="text-[9px]" style={{ color: '#64748b' }}>{nZonasCustom} zona{nZonasCustom !== 1 ? 's' : ''} ajustada{nZonasCustom !== 1 ? 's' : ''}</span>
          )}
        </div>
        {!zonaSelObj ? (
          <p className="text-[10px]" style={{ color: '#64748b' }}>Clique numa zona (no mapa ou na lista abaixo) para usar uma densidade só dela.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: zonaSelObj.cor, border: '1px solid #fff' }} />
              <span className="text-xs font-bold" style={{ color: '#e2e8f0' }}>Zona Z{zonaSelObj.id}</span>
              <span className="text-[10px]" style={{ color: '#93c5fd' }}>{zonaSelObj.classeLabel}</span>
              <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{zonaSelObj.areaHa} ha · {porZona[zonaSelObj.id] ?? 0} pts</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" step="0.5" min="0.1" value={densidadeEfetiva(zonaSelObj.id)}
                onChange={e => { const v = Number(e.target.value.replace(',', '.')); setDensidadePorZona(prev => ({ ...prev, [zonaSelObj.id]: v > 0 ? v : 0.1 })); }}
                className="w-20 rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
              <span className="text-[10px]" style={{ color: '#64748b' }}>ha / ponto</span>
              {temOverride(zonaSelObj.id) && (
                <button onClick={() => setDensidadePorZona(prev => { const n = { ...prev }; delete n[zonaSelObj.id]; return n; })}
                  className="text-[9px] px-1.5 py-0.5 rounded font-semibold ml-auto" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                  Usar padrão geral ({densidade})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Distribuição dos pontos */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Distribuição dos pontos</label>
        <div className="grid grid-cols-2 gap-1">
          {([['inteligente', 'Inteligente', 'cobertura + relaxação'], ['grade', 'Grade', 'malha alinhada']] as const).map(([m, t, d]) => (
            <button key={m} onClick={() => setModoDist(m)}
              className="py-1.5 px-2 rounded text-left"
              style={{ background: modoDist === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', border: `1px solid ${modoDist === m ? '#60a5fa' : '#1a3a6b'}` }}>
              <span className="block text-[11px] font-semibold" style={{ color: modoDist === m ? '#fff' : '#93c5fd' }}>{t}</span>
              <span className="block text-[9px]" style={{ color: modoDist === m ? '#bfdbfe' : '#64748b' }}>{d}</span>
            </button>
          ))}
        </div>
        <p className="text-[9px] mt-1" style={{ color: '#475569' }}>
          Cada zona recebe ao menos os pontos do seu tamanho e nenhuma região fica sem ponto.
        </p>
      </div>

      {/* Distância da borda */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Distância da borda da zona (m)</label>
        <input type="number" step="5" min="0" value={distanciaBorda}
          onChange={e => setDistanciaBorda(Number(e.target.value) || 0)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
      </div>

      {/* Aleatoriedade */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>
            Aleatoriedade: {aleatoriedade}% {aleatoriedade === 0 ? '(grid exato)' : ''}
          </label>
          {aleatoriedade > 0 && (
            <button onClick={() => setSeed(s => s + 1)} title="Refazer posições"
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <RotateCcw size={9} /> Refazer
            </button>
          )}
        </div>
        <input type="range" min="0" max="100" value={aleatoriedade}
          onChange={e => setAleatoriedade(Number(e.target.value))} className="w-full accent-blue-500" />
      </div>

      {/* Resumo da geração */}
      <div className="p-2.5 rounded-lg" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
        <div className="flex items-center gap-2">
          <MapPin size={14} style={{ color: '#86efac' }} />
          <span className="text-sm font-bold" style={{ color: '#86efac' }}>{numAmostras} amostra{numAmostras !== 1 ? 's' : ''}</span>
          <span className="text-[10px]" style={{ color: '#64748b' }}>· {totalPontos} pontos de coleta</span>
        </div>
        <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>
          {modelo === 'A' ? '1 amostra composta por zona' : 'cada ponto vira uma amostra'}
          {padrao && ` · ${totalEtiquetas} etiquetas (com profundidades)`}
        </p>
        {!padrao && <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>Selecione um Padrão de Amostragem para as etiquetas com profundidade.</p>}
      </div>

      {/* Etiquetas (modelo de folha em Configurações) */}
      {padrao && numAmostras > 0 && (
        <button onClick={gerarEtiquetasZonas}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-2" style={{ background: '#065f46' }}>
          <Printer size={13} /> Etiquetas (PDF) · {totalEtiquetas}
        </button>
      )}

      {/* Legenda das classes */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Classes</p>
        <div className="flex flex-wrap gap-2">
          {classesPresentes.map(c => (
            <span key={c} className="flex items-center gap-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: zonas.find(z => z.classeLabel === c)!.cor, border: '1px solid #fff' }} />
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Lista de zonas (clicável p/ ajustar densidade) */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Zonas</p>
        <div className="space-y-1">
          {zonas.map(z => {
            const sel = z.id === zonaSel;
            const ov = temOverride(z.id);
            return (
              <button key={z.id} onClick={() => setZonaSel(prev => prev === z.id ? null : z.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors"
                style={{ background: sel ? '#0f2240' : '#061525', border: `1px solid ${sel ? '#22d3ee' : '#1a3a6b'}` }}>
                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: z.cor, border: '1px solid #fff' }} />
                <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: '34px' }}>Z{z.id}</span>
                <span className="text-[11px]" style={{ color: '#93c5fd' }}>{z.classeLabel}</span>
                {ov && <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: '#1e3a8a', color: '#bfdbfe' }}>{densidadePorZona[z.id]} ha/pt</span>}
                <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{porZona[z.id] ?? 0} pts · {z.areaHa} ha</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Salvar grade de zonas */}
      {!safraAtiva ? (
        <p className="text-[10px] text-center" style={{ color: '#fbbf24' }}>Defina uma safra ativa (no topo do talhão) para salvar a grade.</p>
      ) : (
        <button onClick={salvarGradeZonas} disabled={!padrao || pontos.length === 0}
          className="w-full py-2.5 rounded text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{ background: padrao && pontos.length ? 'var(--invicta-green-dark)' : '#1a3a6b', opacity: padrao && pontos.length ? 1 : 0.6 }}>
          <Save size={14} /> Salvar grade de zonas
        </button>
      )}

      {/* Grades de zonas salvas */}
      {grades.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>
            Grades de zonas — Safra {safraNome}
          </p>
          <div className="space-y-1.5">
            {grades.map(g => (
              <div key={g.id} className="p-2 rounded-lg" style={{ background: '#061525', border: `1px solid ${g.paraProcessar ? '#166534' : '#1a3a6b'}` }}>
                <div className="flex items-center gap-2">
                  <button onClick={() => { marcarParaProcessar(g.id); recarregarGrades(); }} title="Marcar para processar">
                    {g.paraProcessar ? <CheckCircle2 size={15} style={{ color: '#4ade80' }} /> : <Circle size={15} style={{ color: '#475569' }} />}
                  </button>
                  {renomeando === g.id ? (
                    <input autoFocus value={nomeTemp} onChange={e => setNomeTemp(e.target.value)}
                      onBlur={() => confirmarRenome(g.id)} onKeyDown={e => e.key === 'Enter' && confirmarRenome(g.id)}
                      className="flex-1 rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle} />
                  ) : (
                    <span className="text-xs font-bold flex-1" style={{ color: '#e2e8f0' }}>{g.nome}</span>
                  )}
                  <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: '#0f2a1a', color: '#86efac' }}>{g.modelo === 'A' ? 'Composta' : 'Individual'}</span>
                  <button onClick={() => { setRenomeando(g.id); setNomeTemp(g.nome); }} title="Renomear" className="p-1 rounded" style={{ color: '#93c5fd' }}><Pencil size={11} /></button>
                  <button onClick={() => { deleteGrade(g.id); recarregarGrades(); }} title="Excluir" className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                </div>
                <p className="text-[9px] mt-1 pl-6" style={{ color: '#64748b' }}>
                  {g.pontos.length} pontos · {g.modoDist === 'grade' ? 'grade' : 'inteligente'}
                  {g.paraProcessar && <span style={{ color: '#86efac' }}> · a processar</span>}
                </p>
                <div className="flex items-center gap-1.5 mt-2 pl-6">
                  <span className="text-[9px]" style={{ color: '#475569' }}>Exportar:</span>
                  <button onClick={() => exportar(g, 'kml')} className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Download size={9} /> KML
                  </button>
                  <button onClick={() => exportar(g, 'shp')} className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Download size={9} /> SHP
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
