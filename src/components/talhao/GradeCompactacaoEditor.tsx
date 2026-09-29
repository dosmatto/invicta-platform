'use client';

// ── Grade de compactação (coleta em campo) ───────────────────────────────────
// Cria a grade de pontos NA PLATAFORMA (gerarGrid, o mesmo motor da Amostragem)
// com pré-visualização ao vivo no mapa e edição manual (mover/adicionar/remover),
// e exporta KML/SHP para o GPS da Falker ou do celular. O app de campo
// (/coleta → Compactação) navega até cada ponto; nas grades 'manual' o operador
// digita as leituras por profundidade e aqui elas viram um levantamento.
//
// Canal do mapa: usa `pontosSimulados` (o mesmo da Amostragem) SÓ enquanto está
// gerando uma grade ou mostrando uma salva — e limpa ao sair. Na aba Compactação
// divide o canal com a conferência de cobertura: um dono por vez (coberturaNoMapa
// / onUsarMapa), e cada um só limpa o que ele mesmo publicou. Grava só em
// inv_grades_compact (saveGradeCompactacao): nada de saveGrade/paraProcessar.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getFazendas, getGradesCompactacao, saveGradeCompactacao, deleteGradeCompactacao,
  saveImportacaoCompactacao, type GradeCompactacao, type PontoGradeCompact,
} from '@/lib/store';
import { gerarGrid, anguloMaiorDimensao, criarValidador, type ModoDistribuicao } from '@/lib/grid';
import { getLeiturasCompact, pullLeiturasCompact } from '@/lib/coleta';
import { leiturasParaPontos } from '@/lib/compactacao';
import { exportarKML, exportarSHP, pontosDeGradeCompactacao, type ExportInput } from '@/lib/exportGrade';
import { periodoParaNome } from '@/lib/nomeExport';
import { inputStyle } from '@/constants/ui';
import {
  Loader2, Save, Trash2, Plus, Grid3x3, RefreshCw, MapPin, ChevronDown, ChevronUp,
  Move, Eraser, Check, X, Download, Pencil, Upload,
} from 'lucide-react';

const PROFS_PADRAO = '0-10, 10-20, 20-30, 30-40';
const COR_PONTO = '#f97316';        // laranja: grade de compactação no mapa

type ModoRegistro = 'falker' | 'manual';

const num = (s: string) => parseFloat(s.replace(',', '.'));
const resequenciar = (pts: PontoGradeCompact[]): PontoGradeCompact[] => pts.map((p, i) => ({ ...p, ordem: i }));

// FeatureCollection no formato da camada 'pontos-amos' do MapView: `ordem`
// (edição), `label` (texto) e `cor` explícita.
function fcGrade(pts: PontoGradeCompact[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pts.map(p => ({
      type: 'Feature',
      properties: { ordem: p.ordem, label: `C-${p.ordem + 1}`, profs: 1, cor: COR_PONTO },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
}

// Próximo "Grade compactação N" livre: depois de excluir uma grade, o número
// não se repete (o export usa o número no nome do arquivo: GRADE<n>).
function proximoNomeGrade(grades: GradeCompactacao[]): string {
  const usados = new Set(grades.map(g => g.nome.match(/^Grade compactação (\d+)$/)?.[1]).filter(Boolean).map(Number));
  let n = 1;
  while (usados.has(n)) n++;
  return `Grade compactação ${n}`;
}

export function GradeCompactacaoEditor({ talhaoId, safra, poligono, podeExcluir, onLevantamentoCriado, onGradesMudaram, onImportarFalker, coberturaNoMapa = false, onUsarMapa }: {
  talhaoId: string;
  safra: string;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  podeExcluir: boolean;
  onLevantamentoCriado: (importacaoId: string) => void;
  onGradesMudaram?: () => void;
  // Grade 'falker': abre a importação do arquivo da Falker já conferindo a cobertura contra esta grade.
  onImportarFalker?: (gradeId: string) => void;
  // Posse do canal pontosSimulados na aba Compactação: um dono por vez.
  // coberturaNoMapa = a conferência (verde/vermelho) está no mapa → este editor
  // solta o canal (tira a grade vista e não publica). onUsarMapa = este editor
  // vai publicar → a cobertura sai do mapa.
  coberturaNoMapa?: boolean;
  onUsarMapa?: () => void;
}) {
  const { nav, setPontosSimulados, edicaoAtiva, setEdicaoAtiva, edicaoModo, setEdicaoModo, pontoEvent, setPontoEvent } = useApp();

  const [aberto, setAberto] = useState(false);
  const [grades, setGrades] = useState<GradeCompactacao[]>([]);
  const [criando, setCriando] = useState(false);
  const [gradeVistaId, setGradeVistaId] = useState<string | null>(null);

  // Parâmetros
  const [densidade, setDensidade] = useState('1');       // ha por ponto
  const [borda, setBorda] = useState('10');              // m
  const [rotacaoAuto, setRotacaoAuto] = useState(true);
  const [rotacaoManual, setRotacaoManual] = useState('0');
  const [modo, setModo] = useState<ModoDistribuicao>('inteligente');
  const [modoRegistro, setModoRegistro] = useState<ModoRegistro>('falker');
  const [profsTxt, setProfsTxt] = useState(PROFS_PADRAO);
  const [unidade, setUnidade] = useState('MPa');

  // Edição manual (pontos "congelados" a partir da simulação)
  const [pontosManuais, setPontosManuais] = useState<PontoGradeCompact[] | null>(null);

  const [msg, setMsg] = useState('');
  const [buscando, setBuscando] = useState<string | null>(null);
  const [leituras, setLeituras] = useState<Record<string, { coletadas: number; total: number }>>({});

  const recarregarGrades = () => setGrades(getGradesCompactacao(talhaoId, safra));
  useEffect(() => { recarregarGrades(); setLeituras({}); setGradeVistaId(null); }, [talhaoId, safra]); // eslint-disable-line react-hooks/exhaustive-deps

  const fc = useMemo<GeoJSON.FeatureCollection | null>(() => poligono
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: poligono }] }
    : null, [poligono]);

  const anguloAuto = useMemo(() => fc ? Math.round(anguloMaiorDimensao(fc)) : 0, [fc]);
  const dens = num(densidade);
  const bordaM = num(borda) || 0;
  const rotacaoEfetiva = rotacaoAuto ? anguloAuto : (num(rotacaoManual) || 0);

  // Simulação ao vivo (só enquanto o formulário está aberto)
  const gerados = useMemo<PontoGradeCompact[]>(() => {
    if (!criando || !fc || !isFinite(dens) || dens <= 0) return [];
    return gerarGrid({
      geojson: fc, densidadeHaPonto: dens, distanciaBordaM: bordaM,
      rotacaoGraus: rotacaoEfetiva, aleatoriedade: 0, seed: 1, modo,
    }).map(p => ({ ordem: p.ordem, lng: p.lng, lat: p.lat }));
  }, [criando, fc, dens, bordaM, rotacaoEfetiva, modo]);

  const pontosEfetivos = pontosManuais ?? gerados;
  const gradeVista = gradeVistaId ? grades.find(g => g.id === gradeVistaId) ?? null : null;

  // Publica no mapa SÓ enquanto este editor está ativo e é o dono do canal; ao
  // sair, limpa só se o que está no mapa ainda for o que ele publicou.
  useEffect(() => {
    if (coberturaNoMapa) return;
    const pts = criando ? pontosEfetivos : gradeVista?.pontos ?? null;
    if (!pts) return;
    const publicado = pts.length ? fcGrade(pts) : null;
    setPontosSimulados(publicado);
    return () => setPontosSimulados(cur => (cur === publicado ? null : cur));
  }, [coberturaNoMapa, criando, pontosEfetivos, gradeVista, setPontosSimulados]);

  // A cobertura tomou o mapa: a grade vista sai (o ícone reflete) e a edição
  // no mapa para — os cliques cairiam nos pontos da cobertura.
  useEffect(() => {
    if (!coberturaNoMapa) return;
    setGradeVistaId(null);
    setEdicaoAtiva(false);
  }, [coberturaNoMapa, setEdicaoAtiva]);

  // Encerra a edição ao desmontar
  useEffect(() => () => setEdicaoAtiva(false), [setEdicaoAtiva]);

  // Eventos de edição vindos do mapa (arrastar / adicionar / remover)
  useEffect(() => {
    if (!pontoEvent || !criando || !edicaoAtiva || !fc) return;
    const validador = criarValidador(fc, bordaM);
    const ev = pontoEvent;
    setPontoEvent(null);
    setPontosManuais(prev => {
      const base = prev ?? gerados;
      if (ev.tipo === 'mover') {
        const orig = base.find(p => p.ordem === ev.ordem);
        if (!orig) return base;
        const dest = validador.ajustar(orig.lng, orig.lat, ev.lng, ev.lat);
        return base.map(p => p.ordem === ev.ordem ? { ...p, lng: dest.lng, lat: dest.lat } : p);
      }
      if (ev.tipo === 'remover') return resequenciar(base.filter(p => p.ordem !== ev.ordem));
      if (!validador.valido(ev.lng, ev.lat)) {
        setMsg(`Ponto fora do talhão ou a menos de ${bordaM} m da borda — não adicionado.`);
        return base;
      }
      return resequenciar([...base, { ordem: base.length, lng: ev.lng, lat: ev.lat }]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontoEvent]);

  // Mudar parâmetro regenera a grade — avisa se há edições manuais não salvas.
  function alterar<T>(setter: (v: T) => void, v: T) {
    if (pontosManuais && !confirm('Você tem edições manuais de pontos NÃO salvas. Mudar este parâmetro regenera a grade e DESCARTA as edições. Continuar?')) return;
    setPontosManuais(null);
    setEdicaoAtiva(false);
    setter(v);
  }

  function abrirCriacao() {
    setGradeVistaId(null);
    setPontosManuais(null);
    setCriando(true);
    setMsg('');
    onUsarMapa?.();
  }
  function fecharCriacao() {
    setCriando(false);
    setPontosManuais(null);
    setEdicaoAtiva(false);
  }
  function cancelar() {
    if (pontosManuais && !confirm('Descartar a grade em edição?')) return;
    fecharCriacao();
  }

  function iniciarEdicao() {
    onUsarMapa?.();
    setPontosManuais(pontosEfetivos.map(p => ({ ...p })));
    setEdicaoModo('mover');
    setEdicaoAtiva(true);
  }
  function descartarEdicao() { setPontosManuais(null); setEdicaoAtiva(false); }

  function salvarGrade() {
    if (!poligono) { setMsg('Limite do talhão não encontrado.'); return; }
    if (!isFinite(dens) || dens <= 0) { setMsg('Densidade inválida (ha por ponto).'); return; }
    const profundidades = modoRegistro === 'falker' ? [] : profsTxt.split(',').map(s => s.trim()).filter(Boolean);
    if (modoRegistro === 'manual' && profundidades.length === 0) { setMsg('Informe ao menos uma profundidade.'); return; }
    if (pontosEfetivos.length === 0) { setMsg('Nenhum ponto coube no talhão com esses parâmetros.'); return; }
    const nova = saveGradeCompactacao({
      talhaoId, safra, nome: proximoNomeGrade(getGradesCompactacao(talhaoId, safra)),
      profundidades, unidade: modoRegistro === 'falker' ? 'MPa' : unidade,
      densidade: dens, distanciaBorda: bordaM,
      pontos: resequenciar(pontosEfetivos).map(p => ({ ordem: p.ordem, lng: p.lng, lat: p.lat })),
      modoRegistro, rotacaoGraus: rotacaoEfetiva, modo,
    });
    fecharCriacao();
    setMsg(`✓ Grade criada com ${nova.pontos.length} pontos — sincronize o app de campo para coletar.`);
    recarregarGrades();
    setGradeVistaId(nova.id);
    onUsarMapa?.();
    onGradesMudaram?.();
  }

  function excluirGrade(g: GradeCompactacao) {
    if (!confirm(`Excluir a grade "${g.nome}" (${g.pontos.length} pontos)? As leituras já coletadas no campo não são apagadas.`)) return;
    deleteGradeCompactacao(g.id);
    if (gradeVistaId === g.id) setGradeVistaId(null);
    recarregarGrades();
    onGradesMudaram?.();
  }

  // Recolher o painel tira a grade do mapa (e cancela a criação em andamento).
  function alternarAberto() {
    if (aberto) {
      if (pontosManuais && !confirm('Descartar a grade em edição?')) return;
      fecharCriacao();
      setGradeVistaId(null);
    }
    setAberto(a => !a);
  }

  function alternarVista(g: GradeCompactacao) {
    if (criando) return;
    if (gradeVistaId !== g.id) onUsarMapa?.();
    setGradeVistaId(id => id === g.id ? null : g.id);
  }

  function exportar(g: GradeCompactacao, formato: 'kml' | 'shp') {
    if (!fc) { setMsg('Limite do talhão não encontrado.'); return; }
    const faz = getFazendas().find(f => f.id === nav.fazendaId);
    const per = periodoParaNome({ dataReferencia: g.dataReferencia, ano: g.ano });
    const input: ExportInput = {
      talhaoNome: nav.talhao || 'Talhao', poligono: fc,
      pontos: pontosDeGradeCompactacao(g.pontos, g.profundidades.length),
      fazenda: nav.fazenda, siglaFazenda: faz?.sigla ?? null, ano: per.ano, epoca: per.epoca,
      tipoArquivo: 'COMPACT', detalheArquivo: `GRADE${g.nome.match(/\d+/)?.[0] ?? ''}`,
      titulo: `Compactação · ${g.nome}`, pastaPontos: 'Pontos de compactação', semZona: true,
    };
    if (formato === 'kml') exportarKML(input);
    else exportarSHP(input).catch(err => { console.error('Erro ao exportar SHP:', err); setMsg('Falha ao gerar o Shapefile.'); });
  }

  async function buscarLeituras(g: GradeCompactacao) {
    setBuscando(g.id); setMsg('');
    try { await pullLeiturasCompact(g.id); } catch { /* offline: usa o local */ }
    const ls = getLeiturasCompact(g.id);
    const coletadas = ls.filter(l => l.status === 'coletado').length;
    setLeituras(prev => ({ ...prev, [g.id]: { coletadas, total: g.pontos.length } }));
    if (coletadas === 0) setMsg(g.modoRegistro === 'falker'
      ? 'Nenhum ponto marcado como medido ainda (o app de campo precisa sincronizar).'
      : 'Nenhuma leitura coletada ainda para esta grade (o app de campo precisa sincronizar).');
    setBuscando(null);
  }

  function virarLevantamento(g: GradeCompactacao) {
    const pontos = leiturasParaPontos(getLeiturasCompact(g.id), g.pontos);
    if (pontos.length === 0) { setMsg('Nenhuma leitura coletada com valores — nada para importar.'); return; }
    const nova = saveImportacaoCompactacao({ talhaoId, safra, nome: `Campo · ${g.nome}`, profundidades: g.profundidades, pontos });
    setMsg(`✓ Levantamento criado com ${pontos.length} pontos — interpole as profundidades abaixo.`);
    onLevantamentoCriado(nova.id);
  }

  const btnSeg = (ativo: boolean) => ({ background: ativo ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: ativo ? '#fff' : '#93c5fd' });

  return (
    <div className="rounded-lg p-2.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
      <button onClick={alternarAberto} className="w-full flex items-center justify-between text-[10px] font-semibold" style={{ color: '#93c5fd' }}>
        <span className="flex items-center gap-1.5"><Grid3x3 size={12} /> Grade de compactação (coleta em campo){grades.length > 0 ? ` · ${grades.length}` : ''}</span>
        {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {aberto && (
        <div className="mt-2 space-y-2">
          <p className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
            Crie a grade de pontos aqui e leve para o campo pelo <strong>app de campo</strong> (módulo Compactação) ou exporte KML/SHP para o GPS.
            Com a <strong>Falker</strong>, o penetrômetro grava as camadas e o arquivo dele é importado abaixo; no modo <strong>manual</strong>, o operador digita as leituras por profundidade e aqui elas viram um levantamento.
          </p>

          {grades.map(g => {
            const info = leituras[g.id];
            const falker = g.modoRegistro === 'falker';
            const vista = gradeVistaId === g.id;
            return (
              <div key={g.id} className="rounded px-2 py-1.5 space-y-1" style={{ background: '#061525', border: `1px solid ${vista ? COR_PONTO : '#1a3a6b'}` }}>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold flex-1 truncate" style={{ color: '#e2e8f0' }}>{g.nome}</span>
                  <button onClick={() => alternarVista(g)} disabled={criando} title={vista ? 'Tirar do mapa' : 'Ver os pontos no mapa'} className="p-1 rounded disabled:opacity-40" style={{ color: vista ? COR_PONTO : '#93c5fd' }}><MapPin size={12} /></button>
                  <button onClick={() => exportar(g, 'kml')} title="Exportar KML" className="px-1 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5" style={{ color: '#93c5fd' }}><Download size={10} />KML</button>
                  <button onClick={() => exportar(g, 'shp')} title="Exportar Shapefile (.zip)" className="px-1 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5" style={{ color: '#93c5fd' }}><Download size={10} />SHP</button>
                  {podeExcluir && <button onClick={() => excluirGrade(g)} title="Excluir grade" className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={12} /></button>}
                </div>
                <p className="text-[9px]" style={{ color: '#64748b' }}>
                  {g.pontos.length} pontos · {g.densidade} ha/ponto · {falker ? 'Falker (camadas do arquivo)' : `manual · prof.: ${g.profundidades.join(' · ')} (${g.unidade})`}
                  {info && <span style={{ color: info.coletadas > 0 ? '#86efac' : '#fbbf24' }}> · {info.coletadas}/{info.total} {falker ? 'marcados como medidos' : 'coletados'}</span>}
                </p>
                {falker && info && (
                  <div className="h-1 rounded overflow-hidden" style={{ background: '#1a3a6b' }} title={`${info.coletadas}/${info.total} marcados como medidos no app de campo`}>
                    <div className="h-full" style={{ width: `${info.total ? Math.round(100 * info.coletadas / info.total) : 0}%`, background: '#22c55e' }} />
                  </div>
                )}
                <div className="flex gap-1">
                  <button onClick={() => void buscarLeituras(g)} disabled={buscando === g.id}
                    className="flex-1 py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    {buscando === g.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Buscar leituras do campo
                  </button>
                  {falker && onImportarFalker && (
                    <button onClick={() => onImportarFalker(g.id)} title="Abre a importação do arquivo da Falker já conferindo a cobertura contra esta grade"
                      className="flex-1 py-1 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
                      <Upload size={11} /> Importar arquivo da Falker desta grade
                    </button>
                  )}
                  {!falker && info && info.coletadas > 0 && (
                    <button onClick={() => virarLevantamento(g)}
                      className="flex-1 py-1 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
                      <Save size={11} /> Virar levantamento
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {criando ? (
            <div className="rounded px-2 py-2 space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div>
                <p className="text-[9px] mb-0.5" style={{ color: '#64748b' }}>Registro das leituras</p>
                <div className="grid grid-cols-2 gap-1">
                  {([['falker', 'Falker (arquivo)'], ['manual', 'Manual (digitado)']] as const).map(([m, lbl]) => (
                    <button key={m} onClick={() => setModoRegistro(m)} className="py-1 rounded text-[10px] font-semibold" style={btnSeg(modoRegistro === m)}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[9px]" style={{ color: '#64748b' }}>Densidade (ha por ponto)
                  <input value={densidade} onChange={e => alterar(setDensidade, e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle} />
                </label>
                <label className="text-[9px]" style={{ color: '#64748b' }}>Distância da borda (m)
                  <input value={borda} onChange={e => alterar(setBorda, e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle} />
                </label>
              </div>
              <div>
                <p className="text-[9px] mb-0.5" style={{ color: '#64748b' }}>Distribuição</p>
                <div className="grid grid-cols-2 gap-1">
                  {([['inteligente', 'Inteligente'], ['grade', 'Grade alinhada']] as const).map(([m, lbl]) => (
                    <button key={m} onClick={() => alterar(setModo, m)} className="py-1 rounded text-[10px] font-semibold" style={btnSeg(modo === m)}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-1.5">
                <label className="text-[9px] flex items-center gap-1 pb-1.5" style={{ color: '#64748b' }}>
                  <input type="checkbox" checked={rotacaoAuto} onChange={e => alterar(setRotacaoAuto, e.target.checked)} />
                  Rotação automática ({anguloAuto}°)
                </label>
                {!rotacaoAuto && (
                  <label className="text-[9px] flex-1" style={{ color: '#64748b' }}>Rotação (graus)
                    <input value={rotacaoManual} onChange={e => alterar(setRotacaoManual, e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle} />
                  </label>
                )}
              </div>
              {modoRegistro === 'manual' ? (
                <>
                  <label className="text-[9px] block" style={{ color: '#64748b' }}>Profundidades (cm, separadas por vírgula)
                    <input value={profsTxt} onChange={e => setProfsTxt(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle} />
                  </label>
                  <label className="text-[9px] block" style={{ color: '#64748b' }}>Unidade da leitura
                    <select value={unidade} onChange={e => setUnidade(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle}>
                      <option value="MPa">MPa</option>
                      <option value="kgf/cm²">kgf/cm²</option>
                    </select>
                  </label>
                </>
              ) : (
                <p className="text-[9px]" style={{ color: '#64748b' }}>As camadas (0-10, 10-20 … cm, em MPa) vêm do arquivo da Falker — não há o que digitar no campo.</p>
              )}

              <p className="text-[10px] font-semibold" style={{ color: pontosEfetivos.length ? '#86efac' : '#fbbf24' }}>
                {pontosEfetivos.length} pontos{pontosManuais ? ' (editados)' : ''} · pré-visualização no mapa
              </p>

              {edicaoAtiva ? (
                <div className="p-2 rounded space-y-1.5" style={{ background: '#0a1f33', border: '1px solid #2e5fa3' }}>
                  <div className="grid grid-cols-3 gap-1">
                    {([['mover', 'Mover', Move], ['adicionar', 'Add', Plus], ['remover', 'Remover', Eraser]] as const).map(([m, lbl, Ic]) => (
                      <button key={m} onClick={() => setEdicaoModo(m)} className="py-1.5 rounded text-[10px] font-semibold flex flex-col items-center gap-0.5" style={btnSeg(edicaoModo === m)}>
                        <Ic size={12} /> {lbl}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px]" style={{ color: '#64748b' }}>
                    {edicaoModo === 'mover' && 'Arraste os pontos no mapa. Não saem do talhão nem da borda.'}
                    {edicaoModo === 'adicionar' && 'Clique no mapa para adicionar um ponto.'}
                    {edicaoModo === 'remover' && 'Clique num ponto para removê-lo. A numeração se fecha sem buraco.'}
                  </p>
                  <div className="flex gap-1">
                    <button onClick={descartarEdicao} className="flex-1 py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#94a3b8' }}><X size={11} /> Descartar edições</button>
                    <button onClick={() => setEdicaoAtiva(false)} className="flex-1 py-1 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-blue-mid)' }}><Check size={11} /> Concluir edição</button>
                  </div>
                </div>
              ) : (
                <button onClick={iniciarEdicao} disabled={pontosEfetivos.length === 0}
                  className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                  <Pencil size={11} /> Editar pontos no mapa
                </button>
              )}

              <div className="flex gap-1">
                <button onClick={salvarGrade} disabled={pontosEfetivos.length === 0}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold text-white disabled:opacity-40 flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
                  <Save size={11} /> Salvar grade ({pontosEfetivos.length} pontos)
                </button>
                <button onClick={cancelar} className="px-3 py-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={abrirCriacao} disabled={!poligono}
              className="w-full py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40" style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px dashed #2e5fa3' }}>
              <Plus size={11} /> Nova grade de compactação
            </button>
          )}

          {msg && <p className="text-[9px]" style={{ color: msg.startsWith('✓') ? '#86efac' : '#fbbf24' }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
