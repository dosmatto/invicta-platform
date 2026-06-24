'use client';

import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { getPadroesAmostragem, getPadroesElementos, getSafras, getGrades, saveGrade, updateGrade, deleteGrade, marcarParaProcessar, getConfigEtiqueta, PadraoElementos, ProfundidadeConfig, GradeAmostragem, PontoAmostragem } from '@/lib/store';
import { gerarGrid, anguloMaiorDimensao, criarValidador, ModoDistribuicao } from '@/lib/grid';
import { exportarKML, exportarSHP } from '@/lib/exportGrade';
import { gerarEtiquetasPDF, itensDeGrade, LAYOUTS_ETIQUETA } from '@/lib/etiquetas';
import { pode } from '@/lib/empresa';
import { AlertTriangle, RotateCcw, Shuffle, Layers, MapPin, Save, Trash2, CheckCircle2, Circle, Pencil, Move, Plus, Eraser, X, Check, Download, Printer, Eye } from 'lucide-react';

// PRNG simples para shuffle determinístico
function shuffleSeed<T>(arr: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rng = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// Seleciona os índices que recebem uma profundidade parcial
function selecionar(n: number, percentual: number, modo: 'regular' | 'aleatorio', seed: number): Set<number> {
  if (percentual >= 100) return new Set(Array.from({ length: n }, (_, i) => i));
  const count = Math.max(1, Math.round((n * percentual) / 100));
  if (modo === 'regular') {
    const sel = new Set<number>();
    for (let k = 0; k < count; k++) sel.add(Math.floor(((k + 0.5) * n) / count));
    return sel;
  }
  return new Set(shuffleSeed(Array.from({ length: n }, (_, i) => i), seed).slice(0, count));
}

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

// Reatribui ordem 0..N-1 (labels sem buracos) mantendo a ordem do array
function resequenciar(pontos: PontoAmostragem[]): PontoAmostragem[] {
  return pontos.map((p, i) => ({ ...p, ordem: i }));
}

// Monta o FeatureCollection (com ordem/label/profs) a partir dos pontos
function fcDePontos(pontos: PontoAmostragem[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pontos.map(p => ({
      type: 'Feature',
      properties: { ordem: p.ordem, label: String(p.ordem + 1), profs: p.profs },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
}

export function SimuladorAmostragem({ safraNome: safraProp }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, setPontosSimulados,
          edicaoAtiva, setEdicaoAtiva, edicaoModo, setEdicaoModo, pontoEvent, setPontoEvent } = useApp();

  const padroes = useMemo(() => getPadroesAmostragem(), []);
  const padroesElem = useMemo<PadraoElementos[]>(() => getPadroesElementos(), []);
  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);

  const [padraoId, setPadraoId] = useState('');
  const [epoca, setEpoca] = useState<'1' | '2'>('1');
  const [densidade, setDensidade] = useState(2);
  const [profs, setProfs] = useState<ProfundidadeConfig[]>([]);
  const [rotacaoAuto, setRotacaoAuto] = useState(true);
  const [rotacaoGraus, setRotacaoGraus] = useState(0);
  const [aleatoriedade, setAleatoriedade] = useState(0);
  const [distanciaBorda, setDistanciaBorda] = useState(50);
  const [modoDist, setModoDist] = useState<ModoDistribuicao>('inteligente');
  const [modoSel, setModoSel] = useState<'regular' | 'aleatorio'>('regular');
  const [seedPos, setSeedPos] = useState(1);
  const [seedSel, setSeedSel] = useState(1);
  const [grades, setGrades] = useState<GradeAmostragem[]>([]);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState('');
  // Edição manual: pontos "congelados" + ponto extra pendente (aguardando escolha de profundidades)
  const [pontosManuais, setPontosManuais] = useState<PontoAmostragem[] | null>(null);
  const [gradeViewId, setGradeViewId] = useState<string | null>(null); // grade salva exibida no mapa
  const [addPendente, setAddPendente] = useState<{ lng: number; lat: number } | null>(null);
  const [profsExtra, setProfsExtra] = useState<boolean[]>([]);

  const padrao = padroes.find(p => p.id === padraoId) ?? null;

  // Ao escolher padrão, pré-popula densidade + profundidades
  useEffect(() => {
    if (!padrao) return;
    setDensidade(padrao.densidadeHaPonto);
    setProfs(padrao.profundidades.map(p => ({ ...p })));
    setPontosManuais(null);
    setGradeViewId(null);
    setEdicaoAtiva(false);
  }, [padrao, setEdicaoAtiva]);

  // Ângulo automático (recalcula quando geometria muda ou liga o auto)
  const anguloAuto = useMemo(() => uploadedGeo ? Math.round(anguloMaiorDimensao(uploadedGeo)) : 0, [uploadedGeo]);
  const rotacaoEfetiva = rotacaoAuto ? anguloAuto : rotacaoGraus;

  // Geração da grade + atribuição de profundidades (ao vivo, a partir dos parâmetros)
  const gerados = useMemo<PontoAmostragem[]>(() => {
    if (!uploadedGeo) return [];
    const pts = gerarGrid({ geojson: uploadedGeo, densidadeHaPonto: densidade, distanciaBordaM: distanciaBorda, rotacaoGraus: rotacaoEfetiva, aleatoriedade, seed: seedPos, modo: modoDist });
    const n = pts.length;
    const selecoes = profs.map(p => selecionar(n, p.percentual, modoSel, seedSel + p.rotulo.length));
    return pts.map((pt, i) => {
      const rotulos = profs.filter((_, pi) => selecoes[pi].has(i)).map(p => p.rotulo);
      return { ordem: i, lng: pt.lng, lat: pt.lat, profs: rotulos.length, profundidades: rotulos };
    });
  }, [uploadedGeo, densidade, distanciaBorda, rotacaoEfetiva, aleatoriedade, seedPos, profs, modoSel, seedSel, modoDist]);

  // Pontos efetivos: edição manual (se houver) tem prioridade sobre os gerados
  const pontosEfetivos = pontosManuais ?? gerados;

  // Envia pontos ao mapa. Se uma grade salva estiver em visualização, ela tem
  // prioridade sobre a simulação ao vivo.
  useEffect(() => {
    const vista = gradeViewId ? grades.find(g => g.id === gradeViewId) : null;
    const pts = vista ? vista.pontos : pontosEfetivos;
    setPontosSimulados(pts.length ? fcDePontos(pts) : null);
    return () => setPontosSimulados(null);
  }, [gradeViewId, grades, pontosEfetivos, setPontosSimulados]);

  // Aplica eventos de edição vindos do mapa (arrastar / adicionar / remover)
  useEffect(() => {
    if (!pontoEvent || !uploadedGeo) return;
    const validador = criarValidador(uploadedGeo, distanciaBorda);
    setPontosManuais(prev => {
      const base = prev ?? gerados;
      if (pontoEvent.tipo === 'mover') {
        const orig = base.find(p => p.ordem === pontoEvent.ordem);
        if (!orig) return base;
        const dest = validador.ajustar(orig.lng, orig.lat, pontoEvent.lng, pontoEvent.lat);
        return base.map(p => p.ordem === pontoEvent.ordem ? { ...p, lng: dest.lng, lat: dest.lat, manual: true } : p);
      }
      if (pontoEvent.tipo === 'remover') {
        return resequenciar(base.filter(p => p.ordem !== pontoEvent.ordem));
      }
      return base; // 'add' é tratado pelo fluxo de profundidades (addPendente)
    });
    if (pontoEvent.tipo === 'add') setAddPendente({ lng: pontoEvent.lng, lat: pontoEvent.lat });
    setPontoEvent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontoEvent]);

  // Detecta customização (parâmetros divergentes OU edições manuais)
  const customizado = (padrao ? (
    densidade !== padrao.densidadeHaPonto ||
    profs.some((p, i) => p.percentual !== padrao.profundidades[i]?.percentual)
  ) : false) || pontosManuais !== null;

  // Ao mudar qualquer parâmetro, descarta a edição manual (a grade é regerada)
  function alterarParam<T>(setter: (v: T) => void, v: T) {
    if (pontosManuais) setPontosManuais(null);
    setGradeViewId(null);
    setter(v);
  }
  function setProfPct(i: number, v: number) {
    if (pontosManuais) setPontosManuais(null);
    setGradeViewId(null);
    setProfs(prev => prev.map((p, idx) => idx === i ? { ...p, percentual: v } : p));
  }
  const nomeElem = (id: string) => padroesElem.find(p => p.id === id)?.nome ?? '—';

  // ── Edição manual ──
  function iniciarEdicao() { setGradeViewId(null); setPontosManuais(gerados.map(p => ({ ...p }))); setEdicaoModo('mover'); setEdicaoAtiva(true); }
  function concluirEdicao() { setEdicaoAtiva(false); }
  function descartarEdicao() { setPontosManuais(null); setEdicaoAtiva(false); }
  function confirmarAddPonto() {
    if (!addPendente) return;
    const rotulos = profs.filter((_, i) => profsExtra[i]).map(p => p.rotulo);
    const escolhidos = rotulos.length ? rotulos : (profs[0] ? [profs[0].rotulo] : []);
    setPontosManuais(prev => {
      const base = prev ?? gerados;
      const novo: PontoAmostragem = { ordem: base.length, lng: addPendente.lng, lat: addPendente.lat, profs: escolhidos.length, profundidades: escolhidos, manual: true };
      return resequenciar([...base, novo]);
    });
    setAddPendente(null);
    setProfsExtra([]);
  }
  // Encerra o modo edição ao desmontar o componente
  useEffect(() => () => setEdicaoAtiva(false), [setEdicaoAtiva]);

  // ── Grades salvas ──
  // safraProp (Página do Talhão) tem prioridade; sem ela, usa a ativa global.
  const safraNome = safraProp ?? safraAtiva?.nome ?? '';
  function recarregarGrades() {
    if (nav.talhaoId && safraNome) setGrades(getGrades(nav.talhaoId, safraNome, 'grid'));
  }
  useEffect(() => { recarregarGrades(); /* eslint-disable-next-line */ }, [nav.talhaoId, safraNome]);

  function salvarGrade() {
    if (!padrao || pontosEfetivos.length === 0 || !nav.talhaoId || !safraNome) return;
    const n = getGrades(nav.talhaoId, safraNome, 'grid').length + 1;
    const primeira = getGrades(nav.talhaoId, safraNome, 'grid').length === 0;
    saveGrade({
      talhaoId: nav.talhaoId, safra: safraNome, epoca, nome: `Grade ${n}`, metodo: 'grid',
      padraoAmostragemId: padrao.id, padraoNome: padrao.nome, customizado,
      densidade, distanciaBorda, rotacao: rotacaoEfetiva, aleatoriedade, modoSel,
      profundidades: profs, pontos: pontosEfetivos,
      paraProcessar: primeira, // primeira grade da safra já vira a "a processar"
    });
    setPontosManuais(null);
    setEdicaoAtiva(false);
    recarregarGrades();
  }

  function confirmarRenome(id: string) {
    if (nomeTemp.trim()) updateGrade(id, { nome: nomeTemp.trim() });
    setRenomeando(null); recarregarGrades();
  }

  function exportar(g: GradeAmostragem, formato: 'kml' | 'shp') {
    if (!uploadedGeo) return;
    const input = { talhaoNome: nav.talhao || 'Talhao', poligono: uploadedGeo, pontos: g.pontos };
    if (formato === 'kml') exportarKML(input, g.nome);
    else exportarSHP(input, g.nome).catch(err => console.error('Erro ao exportar SHP:', err));
  }

  function gerarEtiquetas(g: GradeAmostragem) {
    const cfg = getConfigEtiqueta();
    const layout = LAYOUTS_ETIQUETA.find(l => l.id === cfg.layoutId) ?? LAYOUTS_ETIQUETA[0];
    gerarEtiquetasPDF(itensDeGrade(nav.talhao || 'Talhao', g), layout, `${nav.talhao || 'talhao'}_${g.nome}_etiquetas`, { dx: cfg.dx, dy: cfg.dy })
      .catch(err => console.error('Erro ao gerar etiquetas:', err));
  }

  // ── Validações ──
  if (!uploadedGeo) {
    return (
      <div className="p-4">
        <Aviso titulo="Talhão sem limite geográfico" texto="Carregue a geometria do talhão (seção Limite Geográfico) para gerar pontos." />
      </div>
    );
  }
  if (!safraNome) {
    return (
      <div className="p-4">
        <Aviso titulo="Nenhuma safra" texto="Defina uma safra (no topo do talhão) antes de simular a amostragem." />
      </div>
    );
  }
  if (padroes.length === 0) {
    return (
      <div className="p-4">
        <Aviso titulo="Nenhum padrão de amostragem" texto="Cadastre um Padrão de Amostragem em Cadastros antes de simular." />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Safra + Época */}
      <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}>
        <span>Safra <strong style={{ color: '#86efac' }}>{safraNome}</strong></span>
        <span>·</span>
        <div className="flex gap-1">
          {(['1', '2'] as const).map(e => (
            <button key={e} onClick={() => setEpoca(e)}
              className="px-2 py-0.5 rounded font-semibold"
              style={{ background: epoca === e ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: epoca === e ? '#fff' : '#64748b' }}>
              {e}ª época
            </button>
          ))}
        </div>
      </div>
      <p className="text-[9px]" style={{ color: '#475569' }}>
        {epoca === '1' ? '1ª época: coletas até junho' : '2ª época: julho a dezembro'}
      </p>

      {/* Padrão de amostragem */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Padrão de Amostragem</label>
        <select value={padraoId} onChange={e => setPadraoId(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione…</option>
          {padroes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {padrao && (
        <>
          {!edicaoAtiva && (
          <>
          {/* Densidade */}
          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>
              Densidade (ha / ponto) {densidade !== padrao.densidadeHaPonto && <span style={{ color: '#fbbf24' }}>• alterado</span>}
            </label>
            <input type="number" step="0.1" min="0.1" value={densidade}
              onChange={e => alterarParam(setDensidade, Number(e.target.value.replace(',', '.')) || 0)}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
          </div>

          {/* Distribuição dos pontos */}
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Distribuição dos pontos</label>
            <div className="grid grid-cols-2 gap-1">
              {([['inteligente', 'Inteligente', 'cobertura + relaxação'], ['grade', 'Grade', 'malha alinhada']] as const).map(([m, t, d]) => (
                <button key={m} onClick={() => alterarParam(setModoDist, m)}
                  className="py-1.5 px-2 rounded text-left"
                  style={{ background: modoDist === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', border: `1px solid ${modoDist === m ? '#60a5fa' : '#1a3a6b'}` }}>
                  <span className="block text-[11px] font-semibold" style={{ color: modoDist === m ? '#fff' : '#93c5fd' }}>{t}</span>
                  <span className="block text-[9px]" style={{ color: modoDist === m ? '#bfdbfe' : '#64748b' }}>{d}</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] mt-1" style={{ color: '#475569' }}>
              Ambas garantem cobertura (sem regiões sem ponto) e o mínimo pela área. &quot;Inteligente&quot; espaça conforme o formato; &quot;Grade&quot; mantém a malha quadrada.
            </p>
          </div>

          {/* Distância da borda */}
          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Distância da borda (m)</label>
            <input type="number" step="5" min="0" value={distanciaBorda}
              onChange={e => alterarParam(setDistanciaBorda, Number(e.target.value))}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
          </div>

          {/* Rotação */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Rotação: {rotacaoEfetiva}°</label>
              <button onClick={() => alterarParam(setRotacaoAuto, !rotacaoAuto)}
                className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                style={{ background: rotacaoAuto ? '#166534' : '#1a3a6b', color: rotacaoAuto ? '#86efac' : '#93c5fd' }}>
                {rotacaoAuto ? 'Auto (maior dimensão)' : 'Manual'}
              </button>
            </div>
            {!rotacaoAuto && (
              <input type="range" min="0" max="180" value={rotacaoGraus}
                onChange={e => alterarParam(setRotacaoGraus, Number(e.target.value))} className="w-full accent-blue-500" />
            )}
          </div>

          {/* Aleatoriedade */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>
                Aleatoriedade: {aleatoriedade}% {aleatoriedade === 0 ? '(grid exato)' : ''}
              </label>
              {aleatoriedade > 0 && (
                <button onClick={() => alterarParam(setSeedPos, seedPos + 1)} title="Refazer posições"
                  className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                  <RotateCcw size={9} /> Refazer
                </button>
              )}
            </div>
            <input type="range" min="0" max="100" value={aleatoriedade}
              onChange={e => alterarParam(setAleatoriedade, Number(e.target.value))} className="w-full accent-blue-500" />
          </div>

          {/* Profundidades */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#64748b' }}>
                <Layers size={11} /> Profundidades
              </label>
              <div className="flex gap-1">
                {(['regular', 'aleatorio'] as const).map(m => (
                  <button key={m} onClick={() => alterarParam(setModoSel, m)}
                    className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: modoSel === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modoSel === m ? '#fff' : '#64748b' }}>
                    {m === 'regular' ? 'Regular' : 'Aleatório'}
                  </button>
                ))}
                {modoSel === 'aleatorio' && (
                  <button onClick={() => alterarParam(setSeedSel, seedSel + 1)} title="Refazer sorteio"
                    className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Shuffle size={9} />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              {profs.map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <span className="text-xs font-bold" style={{ color: '#93c5fd', minWidth: '48px' }}>{p.rotulo}</span>
                  <input type="number" min="1" max="100" value={p.percentual}
                    onChange={e => setProfPct(i, Number(e.target.value))}
                    className="w-14 rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle} />
                  <span className="text-[10px]" style={{ color: '#64748b' }}>%</span>
                  <span className="text-[10px] truncate flex-1 text-right" style={{ color: '#64748b' }}>{nomeElem(p.padraoElementosId)}</span>
                </div>
              ))}
            </div>
          </div>
          </>
          )}

          {/* Resumo */}
          <div className="p-2.5 rounded-lg" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={14} style={{ color: '#86efac' }} />
                <span className="text-sm font-bold" style={{ color: '#86efac' }}>{pontosEfetivos.length} pontos</span>
              </div>
              {customizado && (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#78350f', color: '#fde68a' }}>
                  CUSTOMIZADO
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[9px]" style={{ color: '#94a3b8' }}>
              <span className="flex items-center gap-1"><Dot c="#f59e0b" /> 1 prof.</span>
              <span className="flex items-center gap-1"><Dot c="#3b82f6" /> 2 prof.</span>
              <span className="flex items-center gap-1"><Dot c="#a855f7" /> 3+ prof.</span>
            </div>
          </div>

          {/* Edição manual */}
          {!edicaoAtiva ? (
            <button onClick={iniciarEdicao}
              className="w-full py-2 rounded text-xs font-semibold flex items-center justify-center gap-2"
              style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <Move size={13} /> Editar pontos no mapa
            </button>
          ) : (
            <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#0a1f33', border: '1px solid #2e5fa3' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#93c5fd' }}>Edição manual</p>
              <div className="grid grid-cols-3 gap-1">
                {([['mover', 'Mover', Move], ['adicionar', 'Add', Plus], ['remover', 'Remover', Eraser]] as const).map(([m, lbl, Ic]) => (
                  <button key={m} onClick={() => setEdicaoModo(m)}
                    className="py-1.5 rounded text-[10px] font-semibold flex flex-col items-center gap-0.5"
                    style={{ background: edicaoModo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: edicaoModo === m ? '#fff' : '#93c5fd' }}>
                    <Ic size={12} /> {lbl}
                  </button>
                ))}
              </div>
              <p className="text-[9px]" style={{ color: '#64748b' }}>
                {edicaoModo === 'mover' && 'Arraste os pontos no mapa. Não saem do talhão nem da borda.'}
                {edicaoModo === 'adicionar' && 'Clique no mapa para adicionar um ponto extra.'}
                {edicaoModo === 'remover' && 'Clique num ponto para removê-lo.'}
              </p>
              <div className="flex gap-2">
                <button onClick={descartarEdicao}
                  className="flex-1 py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#94a3b8' }}>
                  <X size={11} /> Descartar
                </button>
                <button onClick={concluirEdicao}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-blue-mid)' }}>
                  <Check size={11} /> Concluir
                </button>
              </div>
            </div>
          )}

          {/* Seletor de profundidades do ponto extra */}
          {addPendente && (
            <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #2e5fa3' }}>
              <p className="text-[10px] font-bold" style={{ color: '#93c5fd' }}>Profundidades do ponto extra</p>
              <div className="space-y-1">
                {profs.map((p, i) => (
                  <label key={i} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: '#e2e8f0' }}>
                    <input type="checkbox" checked={profsExtra[i] ?? false}
                      onChange={e => setProfsExtra(prev => { const n = [...prev]; n[i] = e.target.checked; return n; })}
                      className="accent-blue-500" />
                    {p.rotulo} · {nomeElem(p.padraoElementosId)}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setAddPendente(null); setProfsExtra([]); }}
                  className="flex-1 py-1.5 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#94a3b8' }}>Cancelar</button>
                <button onClick={confirmarAddPonto}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold text-white" style={{ background: 'var(--invicta-green-dark)' }}>Adicionar</button>
              </div>
            </div>
          )}

          {/* Salvar grade */}
          {pode('amostragem') && (
            <button onClick={salvarGrade}
              className="w-full py-2.5 rounded text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: 'var(--invicta-green-dark)' }}>
              <Save size={14} /> Salvar grade
            </button>
          )}
        </>
      )}

      {/* Grades salvas desta safra */}
      {grades.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>
            Grades salvas — Safra {safraNome}
          </p>
          <div className="space-y-1.5">
            {grades.map(g => (
              <div key={g.id} className="p-2 rounded-lg" style={{ background: '#061525', border: `1px solid ${gradeViewId === g.id ? '#22d3ee' : (g.paraProcessar ? '#166534' : '#1a3a6b')}` }}>
                <div className="flex items-center gap-2">
                  {/* marcar para processar */}
                  <button onClick={() => { marcarParaProcessar(g.id); recarregarGrades(); }} title="Marcar para processar">
                    {g.paraProcessar
                      ? <CheckCircle2 size={15} style={{ color: '#4ade80' }} />
                      : <Circle size={15} style={{ color: '#475569' }} />}
                  </button>
                  {renomeando === g.id ? (
                    <input autoFocus value={nomeTemp} onChange={e => setNomeTemp(e.target.value)}
                      onBlur={() => confirmarRenome(g.id)} onKeyDown={e => e.key === 'Enter' && confirmarRenome(g.id)}
                      className="flex-1 rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle} />
                  ) : (
                    <span className="text-xs font-bold flex-1" style={{ color: '#e2e8f0' }}>{g.nome}</span>
                  )}
                  {g.customizado && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: '#78350f', color: '#fde68a' }}>CUSTOM</span>}
                  <button onClick={() => setGradeViewId(id => id === g.id ? null : g.id)} title={gradeViewId === g.id ? 'Ocultar do mapa' : 'Ver no mapa'}
                    className="p-1 rounded" style={{ color: gradeViewId === g.id ? '#22d3ee' : '#93c5fd' }}><Eye size={11} /></button>
                  <button onClick={() => { setRenomeando(g.id); setNomeTemp(g.nome); }} title="Renomear"
                    className="p-1 rounded" style={{ color: '#93c5fd' }}><Pencil size={11} /></button>
                  <button onClick={() => { deleteGrade(g.id); recarregarGrades(); }} title="Excluir"
                    className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                </div>
                <p className="text-[9px] mt-1 pl-6" style={{ color: '#64748b' }}>
                  {g.pontos.length} pontos · {g.densidade} ha/pt · {g.epoca}ª época
                  {g.paraProcessar && <span style={{ color: '#86efac' }}> · a processar</span>}
                </p>
                {/* Exportar */}
                <div className="flex items-center gap-1.5 mt-2 pl-6">
                  <span className="text-[9px]" style={{ color: '#475569' }}>Exportar:</span>
                  <button onClick={() => exportar(g, 'kml')}
                    className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Download size={9} /> KML
                  </button>
                  <button onClick={() => exportar(g, 'shp')}
                    className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Download size={9} /> SHP
                  </button>
                  <button onClick={() => gerarEtiquetas(g)} title="Etiquetas (PDF)"
                    className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: '#065f46', color: '#a7f3d0' }}>
                    <Printer size={9} /> Etiquetas
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

function Dot({ c }: { c: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c, border: '1px solid #fff' }} />;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>{titulo}</p>
        <p className="text-[10px] mt-1" style={{ color: '#78350f' }}>{texto}</p>
      </div>
    </div>
  );
}
