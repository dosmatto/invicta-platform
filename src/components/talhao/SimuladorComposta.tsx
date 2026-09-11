'use client';

// AMOSTRAGEM COMPOSTA — a quarta forma de planejar a coleta.
//
// Para o talhão pequeno de pouca variabilidade: a sobra que o pivô não irriga,
// o talhão que o produtor só quer amostrar por obrigação. Em vez de uma grade
// de 30 pontos, N amostras COMPOSTAS — o operador anda a célula, dá M furos,
// mistura num saco só e manda UMA amostra ao laboratório. O resultado vale para
// a célula inteira, e é isso que fecha os volumes por área.
//
// Por dentro é a grade de zonas MODELO A com zonas quadráticas geradas
// automaticamente: a numeração (`numerarPontosZonas`), as etiquetas
// (`amostrasComProfundidade`), a edição manual (`useEdicaoPontosZona`) e o mapa
// por zona são exatamente os mesmos. O que é novo mora em lib/gradeComposta.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getFazendas, getPadroesAmostragem, getPadroesElementos, getConfigEtiqueta, getSafras, getGrades, saveGrade, updateGrade, deleteGrade, marcarParaProcessar, garantirCodigoRemessa, ProfundidadeConfig, GradeAmostragem } from '@/lib/store';
import { nomeExport } from '@/lib/nomeExport';
import { rotuloAno, hojeSaoPauloISO, periodoDeData, rotuloEpoca } from '@/lib/periodo';
import { pode } from '@/lib/empresa';
import { areaHaGeo } from '@/lib/areaGeo';
import { anguloMaiorDimensao, ModoDistribuicao } from '@/lib/grid';
import { gerarCelulasCompostas, pontosDaCelula, nMaximoCelulas, CORES_CELULA, DIST_BORDA_COMPOSTA, SUBAMOSTRAS_PADRAO, type CelulaComposta } from '@/lib/gradeComposta';
import { numerarPontosZonas, rotuloDoPonto, amostrasDaGrade, amostrasComProfundidade, type ZonaComPontos } from '@/lib/gradeZonas';
import { gerarEtiquetasPDF, cabecalhoEtiqueta, EtiquetaItem, layoutPorId } from '@/lib/etiquetas';
import { exportarKML, exportarSHP } from '@/lib/exportGrade';
import { exportarRelatorioZonasXlsx } from '@/lib/relatorioGrade';
import { useEdicaoPontosZona } from './useEdicaoPontosZona';
import { EdicaoPontosBarra } from './EdicaoPontosBarra';
import { inputStyle } from '@/constants/ui';
import { AlertTriangle, LayoutGrid, MapPin, Printer, RotateCcw, Save, Trash2, CheckCircle2, Circle, Pencil, Download, Eye, Move, FileSpreadsheet, Layers } from 'lucide-react';

const COR_PONTO = '#0f172a';

/** As células como o mapa e a edição as consomem. */
const celulasComoFeatures = (celulas: CelulaComposta[], sel: string | null): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: celulas.map((c, i) => ({
    type: 'Feature',
    properties: {
      cor: CORES_CELULA[i % CORES_CELULA.length],
      rotulo: c.id,
      classeLabel: `${c.areaHa} ha`,
      selecionada: c.id === sel,
    },
    geometry: c.geometry,
  })),
});

export function SimuladorComposta({ safraNome: safraProp }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, setZonasManejo, setPontosSimulados, zonaEvent, setZonaEvent, edicaoAtiva } = useApp();

  const [dataRef, setDataRef] = useState<string>(() => hojeSaoPauloISO());
  const periodo = useMemo(() => periodoDeData(dataRef), [dataRef]);
  const [padraoId, setPadraoId] = useState('');
  const [profs, setProfs] = useState<ProfundidadeConfig[]>([]);
  // Quantas amostras vão ao laboratório: número fixo, ou ha por amostra.
  const [modoN, setModoN] = useState<'fixo' | 'densidade'>('fixo');
  const [nAmostras, setNAmostras] = useState(1);
  const [haPorAmostra, setHaPorAmostra] = useState(20);
  const [subamostras, setSubamostras] = useState(SUBAMOSTRAS_PADRAO);
  const [distanciaBorda, setDistanciaBorda] = useState(DIST_BORDA_COMPOSTA);
  const [rotacaoAuto, setRotacaoAuto] = useState(true);
  const [rotacaoGraus, setRotacaoGraus] = useState(0);
  const [aleatoriedade, setAleatoriedade] = useState(0);
  const [seed, setSeed] = useState(1);
  const [modoDist, setModoDist] = useState<ModoDistribuicao>('inteligente');
  const [celulaSel, setCelulaSel] = useState<string | null>(null);

  const [grades, setGrades] = useState<GradeAmostragem[]>([]);
  const [gradeViewId, setGradeViewId] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState('');

  const podeAmostrar = pode('amostragem');
  const padroes = useMemo(() => getPadroesAmostragem(), []);
  const padroesElem = useMemo(() => getPadroesElementos(), []);
  const padrao = padroes.find(p => p.id === padraoId) ?? null;
  const nomeElem = (id: string) => padroesElem.find(p => p.id === id)?.nome ?? '—';

  const talhao = useMemo(() => getTalhoes().find(t => t.id === nav.talhaoId) ?? null, [nav.talhaoId]);
  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraProp ?? safraAtiva?.nome ?? '';

  function recarregarGrades() {
    if (nav.talhaoId && safraNome) setGrades(getGrades(nav.talhaoId, safraNome, 'composta'));
  }
  useEffect(() => { recarregarGrades(); /* eslint-disable-next-line */ }, [nav.talhaoId, safraNome]);

  useEffect(() => {
    if (padrao) setProfs(padrao.profundidades.map(p => ({ ...p })));
  }, [padrao]);

  // Clique numa célula (no mapa) seleciona/alterna.
  useEffect(() => {
    if (!zonaEvent) return;
    const r = zonaEvent.rotulo;
    setCelulaSel(prev => (prev === r ? null : r));
    setZonaEvent(null);
  }, [zonaEvent, setZonaEvent]);

  const areaHa = useMemo(() => (uploadedGeo ? areaHaGeo(uploadedGeo) : 0), [uploadedGeo]);
  const teto = useMemo(() => (uploadedGeo ? nMaximoCelulas(uploadedGeo) : 0), [uploadedGeo]);
  const nEfetivo = modoN === 'fixo'
    ? Math.max(1, Math.round(nAmostras || 1))
    : Math.max(1, Math.round(areaHa / (haPorAmostra > 0 ? haPorAmostra : 1)));

  const anguloAuto = useMemo(() => (uploadedGeo ? Math.round(anguloMaiorDimensao(uploadedGeo)) : 0), [uploadedGeo]);
  const rotacaoEfetiva = rotacaoAuto ? anguloAuto : rotacaoGraus;

  // AS CÉLULAS. Caro (recorta polígono por polígono), e sem sorteio nenhum:
  // não depende de seed nem de aleatoriedade, só da geometria, de N e do ângulo.
  const resultado = useMemo(() => {
    if (!uploadedGeo) return null;
    return gerarCelulasCompostas({ geojson: uploadedGeo, nCelulas: nEfetivo, rotacaoGraus: rotacaoEfetiva });
  }, [uploadedGeo, nEfetivo, rotacaoEfetiva]);
  const celulas = useMemo(() => resultado?.celulas ?? [], [resultado]);

  // OS FUROS dentro de cada célula. Memo separado: mexer no nº de subamostras
  // não refaz o recorte das células.
  const porCelulaPts = useMemo<ZonaComPontos[]>(() => celulas.map(c => ({
    id: c.id,
    pts: pontosDaCelula({
      celula: c, subamostras, distanciaBordaM: distanciaBorda,
      rotacaoGraus: rotacaoEfetiva, aleatoriedade, seed, modo: modoDist,
    }),
  })), [celulas, subamostras, distanciaBorda, rotacaoEfetiva, aleatoriedade, seed, modoDist]);

  // Numeração: MODELO A (composta). Todo furo da célula 2 leva `numero` 2 — é o
  // número do saco que o laboratório recebe — e `rotulo` "2-3", que é o que o
  // operador vê no app. A mesma função da aba Zona de Manejo.
  const pontosGrade = useMemo(
    () => numerarPontosZonas(porCelulaPts, 'A', profs.map(p => p.rotulo)),
    [porCelulaPts, profs],
  );

  const gradeVista = useMemo(
    () => (gradeViewId ? grades.find(g => g.id === gradeViewId) ?? null : null),
    [gradeViewId, grades],
  );
  const areas = useMemo(() => celulas.map(c => ({ chave: c.id, geometry: c.geometry as GeoJSON.Geometry })), [celulas]);
  const edicao = useEdicaoPontosZona({
    pontosGrade, areas, distanciaBorda, modelo: 'A', profs, gradeVista, aoSalvar: recarregarGrades,
  });
  const { pontosEfetivos, editandoPontos, gradeSemZona, gradeEditandoId } = edicao;

  // Células no mapa. Uma grade salva em visualização mostra AS CÉLULAS DELA —
  // não as da simulação: o recorte pode ter mudado desde que ela foi salva, e
  // ver a divisa nova sobre os pontos velhos seria uma mentira silenciosa.
  useEffect(() => {
    const cs = gradeVista?.celulas?.length ? gradeVista.celulas : celulas;
    if (cs.length === 0) { setZonasManejo(null); return; }
    setZonasManejo(celulasComoFeatures(cs, celulaSel));
    return () => setZonasManejo(null);
  }, [celulas, gradeVista, celulaSel, setZonasManejo]);

  // Pontos no mapa (a grade salva tem prioridade sobre a simulação ao vivo).
  useEffect(() => {
    const pts = (gradeVista && !editandoPontos) ? gradeVista.pontos : pontosEfetivos;
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature',
        properties: { ordem: p.ordem, label: rotuloDoPonto(p), cor: COR_PONTO },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    };
    setPontosSimulados(pts.length ? fc : null);
    return () => setPontosSimulados(null);
  }, [gradeVista, editandoPontos, pontosEfetivos, setPontosSimulados]);

  // Mudou a simulação ao vivo: sai da visualização da grade salva.
  useEffect(() => { setGradeViewId(null); }, [pontosGrade]);

  if (!uploadedGeo) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Talhão sem contorno</p>
            <p className="text-[10px] mt-1" style={{ color: '#78350f' }}>A amostragem composta recorta o contorno do talhão em células. Carregue a geometria primeiro.</p>
          </div>
        </div>
      </div>
    );
  }

  const numAmostras = amostrasDaGrade(pontosEfetivos, 'A').length;
  const totalFuros = pontosEfetivos.length;
  const totalEtiquetas = profs.reduce(
    (s, p) => s + (p.percentual >= 100 ? numAmostras : Math.max(1, Math.round((numAmostras * p.percentual) / 100))), 0);
  const furosPorCelula = new Map(porCelulaPts.map(z => [z.id, z.pts.length]));
  const celulaComFalta = celulas.filter(c => (furosPorCelula.get(c.id) ?? 0) < subamostras);

  const aviso = resultado?.motivoAjuste === 'area-insuficiente'
    ? `O talhão tem ${areaHa} ha e comporta no máximo ${teto} amostras. Foram geradas ${celulas.length}.`
    : resultado?.motivoAjuste === 'manchas-separadas'
      ? `O talhão tem áreas separadas: não dá para fazer menos de ${celulas.length} amostras sem juntar num saco só terra de manchas que o operador não percorre seguido.`
      : resultado?.motivoAjuste === 'recorte-falhou'
        ? 'O contorno do talhão não fechou o recorte das células (limite auto-interceptante). Confira a geometria antes de ir a campo.'
        : null;

  // ETIQUETAS — uma por célula (o saco composto), expandidas por profundidade.
  // A MESMA função da carta ao laboratório: divergirem faria o laboratório
  // receber N sacos e uma planilha de outro tamanho.
  function gerarEtiquetasComposta(g?: GradeAmostragem) {
    const pts = g ? g.pontos : pontosEfetivos;
    const profsUso = g ? g.profundidades : profs;
    if (!profsUso.length || pts.length === 0) return;
    const titulo = talhao?.nome || 'Talhao';
    const ano = rotuloAno(g ? g.safra : safraNome);
    const ep = g ? g.epoca : (periodo?.epoca ?? '1');
    // Código de remessa só na grade SALVA: simulação ao vivo não é um lote.
    const remessa = g ? garantirCodigoRemessa(g.id) : null;
    const rod = [`Amostra composta · Ano ${ano} · ${ep}ª época`, remessa].filter(Boolean).join(' · ');
    const faz = getFazendas().find(f => f.id === talhao?.fazendaId);
    const cabecalho = cabecalhoEtiqueta(nav.produtor, faz?.nome ?? nav.fazenda);
    const itens: EtiquetaItem[] = amostrasComProfundidade(pts, 'A', profsUso).map(a => ({
      cabecalho, titulo, numero: a.rotulo, sub: `${a.profundidade} cm`, rodape: rod,
    }));
    if (itens.length === 0) return;
    const cfg = getConfigEtiqueta();
    const nome = nomeExport({
      fazenda: faz?.nome ?? '', siglaFazenda: faz?.sigla ?? null, talhao: titulo,
      tipo: 'ETIQ', detalhe: 'composta',
    });
    gerarEtiquetasPDF(itens, layoutPorId(cfg.layoutId), nome, { dx: cfg.dx, dy: cfg.dy })
      .catch(err => console.error('Erro ao gerar etiquetas:', err));
  }

  function exportarCarta(g: GradeAmostragem) {
    const gr = { ...g, codigoRemessa: garantirCodigoRemessa(g.id) ?? g.codigoRemessa };
    const faz = getFazendas().find(f => f.id === talhao?.fazendaId);
    const analisePorProfundidade: Record<string, string> = {};
    for (const p of gr.profundidades) analisePorProfundidade[p.rotulo] = nomeElem(p.padraoElementosId);
    exportarRelatorioZonasXlsx({
      produtor: nav.produtor || '—',
      municipio: faz?.municipio || '—',
      fazenda: faz?.nome || nav.fazenda || '—',
      siglaFazenda: faz?.sigla ?? null,
      talhao: talhao?.nome || nav.talhao || '—',
      analisePorProfundidade,
    }, gr).catch(err => {
      console.error('Erro ao gerar a carta da composta:', err);
      alert('Não foi possível gerar a carta: ' + (err instanceof Error ? err.message : String(err)));
    });
  }

  function salvarGradeComposta() {
    if (!padrao || !safraNome || pontosEfetivos.length === 0 || !nav.talhaoId || celulas.length === 0) return;
    const lista = getGrades(nav.talhaoId, safraNome, 'composta');
    saveGrade({
      talhaoId: nav.talhaoId, safra: safraNome, epoca: periodo?.epoca ?? '1', dataReferencia: dataRef,
      nome: `Composta ${lista.length + 1}`,
      metodo: 'composta', modelo: 'A', modoDist,
      celulas, subamostrasPorCelula: subamostras,
      padraoAmostragemId: padrao.id, padraoNome: padrao.nome,
      customizado: edicao.pontosManuais !== null,
      // `densidade` aqui é ha POR AMOSTRA — é o que o cartão e os relatórios
      // imprimem, e é a leitura certa para a composta (não ha por furo).
      densidade: celulas.length ? Math.round((areaHa / celulas.length) * 100) / 100 : areaHa,
      distanciaBorda, rotacao: rotacaoEfetiva, aleatoriedade, modoSel: 'regular',
      profundidades: profs, pontos: pontosEfetivos,
      paraProcessar: lista.length === 0,
    });
    recarregarGrades();
  }

  function confirmarRenome(id: string) {
    if (nomeTemp.trim()) updateGrade(id, { nome: nomeTemp.trim() });
    setRenomeando(null); recarregarGrades();
  }

  function exportar(g: GradeAmostragem, formato: 'kml' | 'shp') {
    // O polígono exportado são AS CÉLULAS DA GRADE — é a divisa que diz de qual
    // saco é cada furo. Sem ela, o arquivo que vai para o campo tem 40 pontos
    // soltos e nenhuma pista de onde um saco começa e o outro termina.
    const cs = g.celulas ?? [];
    if (cs.length === 0) return;
    const poligono: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cs.map(c => ({ type: 'Feature', properties: { id: c.id, classe: `${c.areaHa} ha` }, geometry: c.geometry })),
    };
    const faz = getFazendas().find(f => f.id === talhao?.fazendaId);
    const input = {
      talhaoNome: talhao?.nome || 'Talhao', poligono, pontos: g.pontos, poligonoTipo: 'celula' as const,
      fazenda: faz?.nome ?? '', siglaFazenda: faz?.sigla ?? null, ano: g.ano, epoca: g.epoca,
    };
    if (formato === 'kml') exportarKML(input);
    else exportarSHP(input).catch(err => console.error('Erro ao exportar SHP:', err));
  }

  return (
    <div className="p-3 space-y-3">
      {/* Data de referência (define Ano e Época) */}
      <div className="flex items-center gap-2 flex-wrap text-[10px]" style={{ color: '#64748b' }}>
        <span>Ano <strong style={{ color: '#86efac' }}>{rotuloAno(safraNome)}</strong></span>
        <span>· Data de referência</span>
        <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)}
          className="rounded px-1.5 py-0.5 text-[10px] outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
        <span className="font-semibold" style={{ color: periodo ? '#93c5fd' : '#fbbf24' }}>{periodo ? rotuloEpoca(periodo.epoca) : 'data inválida'}</span>
      </div>

      <div className="flex items-center gap-2 text-xs" style={{ color: '#94a3b8' }}>
        <LayoutGrid size={14} style={{ color: '#86efac' }} />
        <span><strong style={{ color: '#e2e8f0' }}>{areaHa}</strong> ha no talhão</span>
      </div>

      {/* Quantas amostras vão ao laboratório */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Amostras de laboratório</label>
        <div className="grid grid-cols-2 gap-1 mb-1.5">
          {([['fixo', 'Número fixo'], ['densidade', 'ha por amostra']] as const).map(([m, lbl]) => (
            <button key={m} onClick={() => setModoN(m)}
              className="py-1.5 rounded text-[11px] font-semibold"
              style={{ background: modoN === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modoN === m ? '#fff' : '#93c5fd' }}>
              {lbl}
            </button>
          ))}
        </div>
        {modoN === 'fixo' ? (
          <input type="number" min="1" step="1" value={nAmostras}
            onChange={e => setNAmostras(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        ) : (
          <>
            <input type="number" min="0.5" step="0.5" value={haPorAmostra}
              onChange={e => setHaPorAmostra(Number(e.target.value.replace(',', '.')) || 0)}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
            <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
              {areaHa} ha ÷ {haPorAmostra || '—'} = <strong style={{ color: '#93c5fd' }}>{nEfetivo}</strong> amostra{nEfetivo !== 1 ? 's' : ''}
            </p>
          </>
        )}
        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
          O talhão é recortado em células quadráticas de área equivalente — uma amostra por célula.
        </p>
      </div>

      {/* Subamostras por célula */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Subamostras por célula (furos)</label>
        <input type="number" min="1" step="1" value={subamostras}
          onChange={e => setSubamostras(Math.max(1, Number(e.target.value) || 1))}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
          Os furos que o operador dá dentro da célula e mistura num saco só ·
          total <strong style={{ color: '#93c5fd' }}>{celulas.length * subamostras}</strong> furos
        </p>
      </div>

      {/* Padrão de amostragem */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Padrão de Amostragem</label>
        <select value={padraoId} onChange={e => setPadraoId(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione…</option>
          {padroes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

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
          <p className="text-[9px] mt-1" style={{ color: '#475569' }}>Profundidades aplicadas por célula (amostra composta).</p>
        </div>
      )}

      {/* Distribuição dos furos */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Distribuição dos furos</label>
        <div className="grid grid-cols-2 gap-1">
          {([['inteligente', 'Inteligente', 'cobertura + relaxação'], ['grade', 'Grade', 'malha alinhada']] as const).map(([m, tt, d]) => (
            <button key={m} onClick={() => setModoDist(m)}
              className="py-1.5 px-2 rounded text-left"
              style={{ background: modoDist === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', border: `1px solid ${modoDist === m ? '#60a5fa' : '#1a3a6b'}` }}>
              <span className="block text-[11px] font-semibold" style={{ color: modoDist === m ? '#fff' : '#93c5fd' }}>{tt}</span>
              <span className="block text-[9px]" style={{ color: modoDist === m ? '#bfdbfe' : '#64748b' }}>{d}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Distância da borda */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Distância da borda da célula (m)</label>
        <input type="number" step="1" min="0" value={distanciaBorda}
          onChange={e => setDistanciaBorda(Number(e.target.value) || 0)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
          É a divisa da CÉLULA, não a do talhão: um valor alto numa célula pequena não deixa espaço para os furos.
        </p>
      </div>

      {/* Rotação da grade de células */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Rotação das células</label>
          <label className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
            <input type="checkbox" checked={rotacaoAuto} onChange={e => setRotacaoAuto(e.target.checked)} className="accent-blue-500" />
            automática ({anguloAuto}°)
          </label>
        </div>
        {!rotacaoAuto && (
          <input type="number" step="1" min="0" max="180" value={rotacaoGraus}
            onChange={e => setRotacaoGraus(Number(e.target.value) || 0)}
            className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        )}
      </div>

      {/* Aleatoriedade (só dos furos) */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>
            Aleatoriedade dos furos: {aleatoriedade}% {aleatoriedade === 0 ? '(grid exato)' : ''}
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
        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>Mexe só nos furos — o desenho das células é sempre o mesmo.</p>
      </div>

      {aviso && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>{aviso}</p>
        </div>
      )}

      {/* Resumo */}
      <div className="p-2.5 rounded-lg" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
        <div className="flex items-center gap-2">
          <MapPin size={14} style={{ color: '#86efac' }} />
          <span className="text-sm font-bold" style={{ color: '#86efac' }}>{numAmostras} amostra{numAmostras !== 1 ? 's' : ''}</span>
          <span className="text-[10px]" style={{ color: '#64748b' }}>· {totalFuros} furos</span>
          {resultado && <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>≈ {resultado.ladoM} × {resultado.ladoM} m</span>}
        </div>
        <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>
          1 amostra composta por célula{padrao && ` · ${totalEtiquetas} etiquetas (com profundidades)`}
        </p>
        {!padrao && <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>Selecione um Padrão de Amostragem para as etiquetas com profundidade.</p>}
        {celulaComFalta.length > 0 && (
          <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>
            {celulaComFalta.length} célula{celulaComFalta.length !== 1 ? 's' : ''} não comporta{celulaComFalta.length !== 1 ? 'm' : ''} os {subamostras} furos (área ou distância da borda).
          </p>
        )}
      </div>

      {padrao && numAmostras > 0 && (
        <button onClick={() => gerarEtiquetasComposta()}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-2" style={{ background: '#065f46' }}>
          <Printer size={13} /> Etiquetas (PDF) · {totalEtiquetas}
        </button>
      )}

      {/* Lista de células */}
      {celulas.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Células</p>
          <div className="space-y-1">
            {celulas.map((c, i) => {
              const sel = c.id === celulaSel;
              const furos = furosPorCelula.get(c.id) ?? 0;
              return (
                <button key={c.id} onClick={() => setCelulaSel(prev => prev === c.id ? null : c.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors"
                  style={{ background: sel ? '#0f2240' : '#061525', border: `1px solid ${sel ? '#22d3ee' : '#1a3a6b'}` }}>
                  <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: CORES_CELULA[i % CORES_CELULA.length], border: '1px solid #fff' }} />
                  <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: '28px' }}>{c.id}</span>
                  <span className="text-[11px]" style={{ color: '#93c5fd' }}>{c.areaHa} ha</span>
                  <span className="text-[10px] ml-auto" style={{ color: furos < subamostras ? '#fbbf24' : '#64748b' }}>{furos} furos</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Edição manual dos furos no mapa */}
      {podeAmostrar && pontosGrade.length > 0 && (
        !edicaoAtiva ? (
          <button onClick={edicao.iniciar}
            className="w-full py-2 rounded text-xs font-semibold flex items-center justify-center gap-2" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <Move size={13} /> Editar furos no mapa {gradeViewId ? '(grade aberta)' : ''}
          </button>
        ) : (
          <EdicaoPontosBarra
            somenteMover={gradeSemZona} termo="célula" temGradeEmEdicao={!!gradeEditandoId}
            aoDescartar={edicao.descartar} aoSalvar={edicao.salvar} aoConcluir={edicao.concluir} />
        )
      )}

      {/* Salvar */}
      {!podeAmostrar ? null : !safraNome ? (
        <p className="text-[10px] text-center" style={{ color: '#fbbf24' }}>Defina um Ano (no topo do talhão) para salvar a grade.</p>
      ) : (
        <button onClick={salvarGradeComposta} disabled={!padrao || pontosEfetivos.length === 0}
          className="w-full py-2.5 rounded text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{ background: padrao && pontosEfetivos.length ? 'var(--invicta-green-dark)' : '#1a3a6b', opacity: padrao && pontosEfetivos.length ? 1 : 0.6 }}>
          <Save size={14} /> Salvar amostragem composta
        </button>
      )}

      {/* Grades salvas */}
      {grades.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>
            Amostragens compostas — Ano {rotuloAno(safraNome)}
          </p>
          <div className="space-y-1.5">
            {grades.map(g => (
              <div key={g.id} className="p-2 rounded-lg" style={{ background: '#061525', border: `1px solid ${gradeViewId === g.id ? '#22d3ee' : (g.paraProcessar ? '#166534' : '#1a3a6b')}` }}>
                <div className="flex items-center gap-2">
                  {podeAmostrar && (
                    <button onClick={() => { marcarParaProcessar(g.id); recarregarGrades(); }} title="Marcar para processar">
                      {g.paraProcessar ? <CheckCircle2 size={15} style={{ color: '#4ade80' }} /> : <Circle size={15} style={{ color: '#475569' }} />}
                    </button>
                  )}
                  {renomeando === g.id ? (
                    <input autoFocus value={nomeTemp} onChange={e => setNomeTemp(e.target.value)}
                      onBlur={() => confirmarRenome(g.id)} onKeyDown={e => e.key === 'Enter' && confirmarRenome(g.id)}
                      className="flex-1 rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle} />
                  ) : (
                    <span className="text-xs font-bold flex-1" style={{ color: '#e2e8f0' }}>{g.nome}</span>
                  )}
                  <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: '#0f2a1a', color: '#86efac' }}>Composta</span>
                  <button onClick={() => setGradeViewId(id => id === g.id ? null : g.id)} title={gradeViewId === g.id ? 'Ocultar do mapa' : 'Ver no mapa'}
                    className="p-1 rounded" style={{ color: gradeViewId === g.id ? '#22d3ee' : '#93c5fd' }}><Eye size={11} /></button>
                  {podeAmostrar && <button onClick={() => { setRenomeando(g.id); setNomeTemp(g.nome); }} title="Renomear" className="p-1 rounded" style={{ color: '#93c5fd' }}><Pencil size={11} /></button>}
                  {podeAmostrar && <button onClick={() => { deleteGrade(g.id); recarregarGrades(); }} title="Excluir" className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={11} /></button>}
                </div>
                <p className="text-[9px] mt-1 pl-6" style={{ color: '#64748b' }}>
                  {(g.celulas?.length ?? 0)} células · {g.pontos.length} furos
                  {g.subamostrasPorCelula ? ` · ${g.subamostrasPorCelula} por célula` : ''}
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
                  <button onClick={() => gerarEtiquetasComposta(g)} title="Etiquetas (PDF)"
                    className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: '#065f46', color: '#a7f3d0' }}>
                    <Printer size={9} /> Etiquetas
                  </button>
                  <button onClick={() => exportarCarta(g)}
                    title="Carta para o laboratório (Excel) — uma linha por amostra × profundidade"
                    className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: '#1e3a2f', color: '#86efac' }}>
                    <FileSpreadsheet size={9} /> Carta
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
