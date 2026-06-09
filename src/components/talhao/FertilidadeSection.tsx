'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getSafras, getGrades, getImportacoesLab, getTalhoes, type ImportacaoLab, type GradeAmostragem } from '@/lib/store';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono, legendaPorId,
  type RespInterp,
} from '@/lib/fertilidade';
import { Play, Loader2, Eraser, AlertTriangle, Activity } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function FertilidadeSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraAtiva?.nome ?? '';

  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [nutriente, setNutriente] = useState('');
  const [profundidade, setProfundidade] = useState('');
  const [opacity, setOpacity] = useState(0.75);
  const [metodo, setMetodo] = useState<'krige' | 'idw'>('krige');
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ resp: RespInterp; labels: GeoJSON.FeatureCollection } | null>(null);

  useEffect(() => {
    if (nav.talhaoId && safraNome) setImportacoes(getImportacoesLab(nav.talhaoId, safraNome));
  }, [nav.talhaoId, safraNome]);

  const importacao = importacoes.find(i => i.id === importacaoId) ?? null;

  const grade = useMemo<GradeAmostragem | null>(() => {
    if (!importacao || !nav.talhaoId) return null;
    return getGrades(nav.talhaoId, safraNome).find(g => g.id === importacao.gradeId) ?? null;
  }, [importacao, nav.talhaoId, safraNome]);

  // número da amostra (numero = ordem + 1) -> coordenada do ponto na grade
  const pontoPorNumero = useMemo(() => {
    const m = new Map<number, { lng: number; lat: number }>();
    (grade?.pontos ?? []).forEach(p => m.set(p.numero ?? p.ordem + 1, { lng: p.lng, lat: p.lat }));
    return m;
  }, [grade]);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    // fallback: limite salvo no próprio talhão (ex.: talhão-teste / importado)
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const nutrientes = useMemo(() => (importacao?.elementos ?? []).filter(id => !!legendaPorId(id)), [importacao]);
  const profundidades = useMemo(
    () => (importacao ? [...new Set(importacao.resultados.map(r => r.profundidade).filter(Boolean))] : []),
    [importacao],
  );

  // defaults ao trocar de importação
  useEffect(() => {
    setNutriente(nutrientes[0] ?? '');
    setProfundidade(profundidades[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacaoId]);

  // pontos efetivos (valor presente + número casado na grade + profundidade)
  const pontosInterp = useMemo(() => {
    if (!importacao || !nutriente) return [];
    const out: { lng: number; lat: number; valor: number }[] = [];
    for (const r of importacao.resultados) {
      if (r.profundidade !== profundidade) continue;
      const v = r.valores[nutriente];
      if (v == null || !isFinite(v)) continue;
      const pt = pontoPorNumero.get(r.numero);
      if (!pt) continue;
      out.push({ lng: pt.lng, lat: pt.lat, valor: v });
    }
    return out;
  }, [importacao, nutriente, profundidade, pontoPorNumero]);

  // limpa o mapa quando a seleção muda (evita raster desatualizado)
  useEffect(() => { setResultado(null); setEstado('idle'); setErro(''); }, [importacaoId, nutriente, profundidade, metodo]);

  // publica/atualiza overlay+rótulos no mapa conforme resultado/opacidade
  useEffect(() => {
    if (resultado) {
      setFertilidadeOverlay({ url: resultado.resp.png, coordinates: coordsFromBounds(resultado.resp.bounds), opacity });
      setFertilidadeLabels(resultado.labels);
    } else {
      setFertilidadeOverlay(null);
      setFertilidadeLabels(null);
    }
  }, [resultado, opacity, setFertilidadeOverlay, setFertilidadeLabels]);

  // limpa o mapa ao desmontar
  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  const leg = nutriente ? legendaPorId(nutriente) : undefined;
  const ramp = leg ? rampaDaLegenda(leg) : null;

  async function processar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (!leg || !ramp) { setErro('Selecione uma variável com legenda na Base Agronômica.'); setEstado('erro'); return; }
    if (pontosInterp.length < 3) { setErro('Mínimo de 3 pontos com valor para interpolar.'); setEstado('erro'); return; }
    setEstado('processando'); setErro('');
    try {
      const resp = await interpolar({ pontos: pontosInterp, poligono, dominio: ramp.dominio, stops: ramp.stops, metodo });
      const labels: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: pontosInterp.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { txt: fmt(p.valor) },
        })),
      };
      setResultado({ resp, labels });
      setEstado('pronto');
    } catch (e) {
      setEstado('erro');
      setErro(e instanceof Error ? e.message : 'Falha ao processar a interpolação.');
    }
  }

  if (!safraAtiva) return <div className="px-6 py-4"><Aviso texto="Defina uma safra ativa (no topo do talhão) para gerar o mapa de fertilidade." /></div>;
  if (importacoes.length === 0) return <div className="px-6 py-4"><Aviso texto="Importe resultados de laboratório (seção acima) — o mapa de fertilidade é gerado a partir deles." /></div>;

  const stats = resultado?.resp.stats;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Importação */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Importação (laboratório / campanha)</label>
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione a importação…</option>
          {importacoes.map(i => <option key={i.id} value={i.id}>{i.laboratorio}{i.campanha ? ` · ${i.campanha}` : ''} · {i.resultados.length} amostras</option>)}
        </select>
      </div>

      {importacao && (
        <>
          {/* Variável */}
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Variável</label>
            {nutrientes.length === 0 ? (
              <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma variável desta importação tem legenda na Base Agronômica.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {nutrientes.map(id => {
                  const sel = id === nutriente;
                  return (
                    <button key={id} onClick={() => setNutriente(id)} className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : '#64748b' }}>
                      {legendaPorId(id)?.simbolo ?? id}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Profundidade */}
          {profundidades.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Profundidade (uma interpolação por profundidade)</label>
              <select value={profundidade} onChange={e => setProfundidade(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                {profundidades.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          {/* Interpolador (escolha explícita; sem troca automática) */}
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Interpolador</label>
            <div className="flex gap-1">
              {(['krige', 'idw'] as const).map(mt => (
                <button key={mt} onClick={() => setMetodo(mt)} className="flex-1 py-1 rounded text-[10px] font-bold"
                  style={{ background: metodo === mt ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: metodo === mt ? '#fff' : '#64748b' }}>
                  {mt === 'krige' ? 'Krigagem' : 'IDW'}
                </button>
              ))}
            </div>
          </div>

          {/* status de pontos / grade */}
          {!poligono && <Aviso texto="Limite do talhão não carregado no mapa." />}
          {!grade && importacao.gradeId && <Aviso texto="Grade vinculada a esta importação não foi encontrada." />}
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>
            <strong style={{ color: pontosInterp.length >= 3 ? '#86efac' : '#fbbf24' }}>{pontosInterp.length}</strong> pontos com valor
            {leg ? ` · ${leg.nome} (${leg.unidade})` : ''}
          </p>

          {/* Processar / Limpar */}
          <div className="flex gap-2">
            <button onClick={processar} disabled={estado === 'processando' || pontosInterp.length < 3 || !poligono}
              className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
              style={{ background: (estado === 'processando' || pontosInterp.length < 3 || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: (pontosInterp.length < 3 || !poligono) ? 0.6 : 1 }}>
              {estado === 'processando' ? <><Loader2 size={11} className="animate-spin" /> Interpolando…</> : <><Play size={11} /> Processar mapa</>}
            </button>
            {resultado && (
              <button onClick={() => setResultado(null)} title="Limpar do mapa" className="px-2.5 py-1.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                <Eraser size={11} /> Limpar
              </button>
            )}
          </div>

          {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

          {/* Resultado: legenda em gradiente + opacidade + variograma */}
          {stats && ramp && leg && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: stats.modelo === 'idw' ? '#93c5fd' : '#86efac' }}>
                <Activity size={12} />
                {stats.modelo === 'idw'
                  ? `IDW · ${stats.n} pts`
                  : `Krigagem · variograma ${stats.modelo} · ${stats.n} pts`}
              </div>

              {/* barra de gradiente com limites das classes */}
              <div>
                <div className="relative h-3 rounded" style={{ background: gradienteCss(ramp.stops) }}>
                  {leg.classes.map(c => c.max).filter((m): m is number => m != null).slice(0, -1).map((b) => {
                    const t = (b - ramp.dominio[0]) / ((ramp.dominio[1] - ramp.dominio[0]) || 1);
                    return <span key={b} className="absolute top-0 h-3" style={{ left: `${t * 100}%`, width: 1, background: 'rgba(255,255,255,0.7)' }} />;
                  })}
                </div>
                <div className="flex justify-between text-[9px] mt-0.5" style={{ color: '#64748b' }}>
                  <span>{fmt(ramp.dominio[0])}</span>
                  <span>{leg.unidade}</span>
                  <span>{fmt(ramp.dominio[1])}</span>
                </div>
              </div>

              {/* opacidade */}
              <div className="flex items-center gap-2">
                <span className="text-[9px]" style={{ color: '#64748b' }}>Opacidade</span>
                <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="flex-1 accent-green-500" />
                <span className="text-[9px] w-8 text-right" style={{ color: '#94a3b8' }}>{Math.round(opacity * 100)}%</span>
              </div>
            </div>
          )}
        </>
      )}
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
