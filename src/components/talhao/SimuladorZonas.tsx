'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getFazendas, getPadroesAmostragem, getPadroesElementos, getConfigEtiqueta, getSafras, getGrades, saveGrade, updateGrade, deleteGrade, marcarParaProcessar, garantirCodigoRemessa, ProfundidadeConfig, GradeAmostragem, PontoAmostragem } from '@/lib/store';
import { nomeExport } from '@/lib/nomeExport';
import { rotuloAno, hojeSaoPauloISO, periodoDeData, rotuloEpoca } from '@/lib/periodo';
import { classeZona, ORDEM_CLASSES } from '@/lib/zonas';
import { pode } from '@/lib/empresa';
import { gerarGrid, pontoInterno, criarValidador, ModoDistribuicao } from '@/lib/grid';
import { gerarEtiquetasPDF, cabecalhoEtiqueta, EtiquetaItem, layoutPorId } from '@/lib/etiquetas';
import { exportarKML, exportarSHP } from '@/lib/exportGrade';
import { numerarPontosZonas, renumerarPontosZonas, rotuloDoPonto, amostrasDaGrade, type ZonaComPontos } from '@/lib/gradeZonas';
import { rotuloZona } from '@/lib/meap/rotuloZona';
import { dentroGeom } from '@/lib/recomendacao/zonasGrid';
import { AlertTriangle, Layers, MapPin, Printer, RotateCcw, Save, Trash2, CheckCircle2, Circle, Pencil, Download, Eye, Move, Plus, Eraser, Check, X } from 'lucide-react';

interface ZonaFeat {
  id: string;          // identidade do POLÍGONO ("01", "01_2") — densidade, seleção
  zonaRot: string;     // o número que o MAPA mostra (lib/meap/rotuloZona): id numérico
                       // puro é ele mesmo; sufixado ("01_2") rotula pelo `zona` oficial
  classeLabel: string;
  cor: string;
  areaHa: number;
  geometry: GeoJSON.Geometry;
}

import { inputStyle } from '@/constants/ui';
const COR_PONTO = '#0f172a';

export function SimuladorZonas({ safraNome: safraProp }: { safraNome?: string } = {}) {
  const { nav, setZonasManejo, setPontosSimulados, zonaEvent, setZonaEvent,
          edicaoAtiva, setEdicaoAtiva, edicaoModo, setEdicaoModo, pontoEvent, setPontoEvent } = useApp();

  const [modelo, setModelo] = useState<'A' | 'B'>('A');
  const [dataRef, setDataRef] = useState<string>(() => hojeSaoPauloISO());
  const periodoZonas = periodoDeData(dataRef);
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
  // safraProp (Página do Talhão) tem prioridade; sem ela, usa a ativa global.
  const safraNome = safraProp ?? safraAtiva?.nome ?? '';
  const [grades, setGrades] = useState<GradeAmostragem[]>([]);
  const [gradeViewId, setGradeViewId] = useState<string | null>(null); // grade salva exibida no mapa
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState('');
  // Edição manual de posição: as posições movidas (override do grid gerado) e a
  // grade salva de ORIGEM (para salvar por cima, como faz a aba Grid).
  const [pontosManuais, setPontosManuais] = useState<PontoAmostragem[] | null>(null);
  const [gradeEditandoId, setGradeEditandoId] = useState<string | null>(null);

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
          const p = (f.properties ?? {}) as { id?: string; zona?: string; classe?: string; areaHa?: number };
          const cz = classeZona(p.classe ?? '');
          return {
            id: String(p.id ?? '?'),
            zonaRot: rotuloZona(p),
            classeLabel: cz.label, cor: cz.cor, areaHa: Number(p.areaHa ?? 0), geometry: f.geometry!,
          };
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

  // Geração de pontos por zona (grid dentro de cada zona + aleatoriedade).
  // A numeração `zona-sequencial` vem de lib/gradeZonas (pura, testada): é a
  // MESMA aqui na simulação, na grade salva, no app de campo e nas etiquetas.
  const { porZonaPts, porZona } = useMemo(() => {
    const grupos = new Map<string, { lng: number; lat: number }[]>();
    const cont: Record<string, number> = {};
    zonas.forEach(z => {
      const zonaFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: z.geometry }] };
      const dz = densidadePorZona[z.id];
      const haPonto = dz && dz > 0 ? dz : (densidade > 0 ? densidade : 1); // override da zona ou padrão geral
      let pts = gerarGrid({ geojson: zonaFC, densidadeHaPonto: haPonto, distanciaBordaM: distanciaBorda, rotacaoGraus: 0, aleatoriedade, seed, modo: modoDist });
      if (pts.length === 0) {
        const pi = pontoInterno(zonaFC, distanciaBorda);
        if (pi) pts = [{ lng: pi.lng, lat: pi.lat, ordem: 0 }];
      }
      cont[z.id] = pts.length;
      // AGRUPA PELO NÚMERO QUE O MAPA MOSTRA (rotuloZona): assim o prefixo do
      // ponto ("3-2") é o mesmo número da zona que o operador lê no mapa e no
      // app. Duas manchas da mesma zona ("01" e "01_2") caem no MESMO grupo — o
      // sequencial corre pela zona inteira e sai um saco só; agrupar pelo id
      // cru faria "01_2" virar uma "zona 12" que não existe no talhão.
      const g = grupos.get(z.zonaRot) ?? [];
      g.push(...pts.map(p => ({ lng: p.lng, lat: p.lat })));
      grupos.set(z.zonaRot, g);
    });
    return {
      porZonaPts: [...grupos].map(([id, pts]) => ({ id, pts })) as ZonaComPontos[],
      porZona: cont,
    };
  }, [zonas, densidade, densidadePorZona, aleatoriedade, distanciaBorda, seed, modoDist]);

  // memo LEVE: numeração + profundidades. Separado do de cima para trocar o
  // Padrão de Amostragem não refazer a geometria de todas as zonas.
  const pontosGrade = useMemo(
    () => numerarPontosZonas(porZonaPts, modelo, profs.map(p => p.rotulo)),
    [porZonaPts, modelo, profs],
  );
  // Posição efetiva: a edição manual (arrastar/add/remover) tem prioridade.
  const pontosEfetivos = pontosManuais ?? pontosGrade;
  // O resumo conta os pontos EFETIVOS: adicionar/remover na edição precisa
  // mudar o número na hora (senão a tela promete um total e salva outro).
  const totalPontos = pontosEfetivos.length;
  const editandoPontos = edicaoAtiva && pontosManuais != null;
  // Grade LEGADA (salva antes da numeração por zona): pontos sem `zona`. Add e
  // Remover reagrupam por zona e colapsariam tudo num saco só — nela, só Mover.
  const gradeSemZona = editandoPontos && pontosEfetivos.some(p => !p.zona);

  // Geometria de cada zona pelo número que o mapa mostra — para PRENDER o ponto
  // movido DENTRO da sua própria zona (não só do talhão). Zona multiparte junta
  // todas as manchas: o ponto pode ir para qualquer pedaço da mesma zona.
  const geomTalhao = useMemo<GeoJSON.Feature[]>(
    () => zonas.map(z => ({ type: 'Feature', properties: {}, geometry: z.geometry })),
    [zonas],
  );
  const geomPorZona = useMemo(() => {
    const m = new Map<string, GeoJSON.Feature[]>();
    for (const z of zonas) {
      const arr = m.get(z.zonaRot) ?? [];
      arr.push({ type: 'Feature', properties: {}, geometry: z.geometry });
      m.set(z.zonaRot, arr);
    }
    return m;
  }, [zonas]);

  // Eventos de edição vindos do MapView: mover, adicionar, remover.
  //
  // MOVER preserva `ordem` e o número da amostra (só muda lng/lat) — protege as
  // coletas já feitas no campo, presas por `${gradeId}__${ordem}`. O ponto fica
  // travado DENTRO da sua zona.
  //
  // ADICIONAR / REMOVER mudam a contagem da zona, então o `zona-sequencial` tem
  // de fechar sem buraco: `renumerarPontosZonas` reagrupa por zona e renumera
  // tudo (é uma edição de DESENHO, feita antes de ir a campo — o mesmo que a
  // aba Grid faz ao resequenciar).
  useEffect(() => {
    if (!pontoEvent) return;
    const profRotulos = profs.map(p => p.rotulo);
    setPontosManuais(prev => {
      const base = prev ?? pontosGrade;
      if (pontoEvent.tipo === 'mover') {
        const orig = base.find(p => p.ordem === pontoEvent.ordem);
        if (!orig) return base;
        // Prende o ponto DENTRO da sua zona. Se a zona não existe mais (grade
        // antiga / zoneamento trocado), cai para o contorno do TALHÃO — nunca
        // solto: melhor um ponto na zona vizinha que um fora da área.
        const feats = geomPorZona.get(orig.zona ?? '') ?? geomTalhao;
        const destino = feats.length
          ? criarValidador({ type: 'FeatureCollection', features: feats }, distanciaBorda)
              .ajustar(orig.lng, orig.lat, pontoEvent.lng, pontoEvent.lat)
          : { lng: pontoEvent.lng, lat: pontoEvent.lat };
        return base.map(p => p.ordem === pontoEvent.ordem
          ? { ...p, lng: destino.lng, lat: destino.lat, manual: true } : p);
      }
      // Add/Remover reagrupam por `zona`. Numa grade LEGADA (salva antes da
      // numeração por zona) os pontos não têm `zona`: reagrupar jogaria as 4
      // zonas num grupo só ('') e destruiria a grade num saco composto único.
      // Nessa grade só o Mover é seguro — barra a mudança de estrutura.
      if (base.some(p => !p.zona)) return base;
      if (pontoEvent.tipo === 'remover') {
        return renumerarPontosZonas(base.filter(p => p.ordem !== pontoEvent.ordem), modelo, profRotulos);
      }
      if (pontoEvent.tipo === 'add') {
        // Em qual zona caiu o clique? O ponto novo TEM de pertencer a uma zona
        // (é a zona que dá o prefixo e o saco). Fora de todas, ignora — não há
        // como numerá-lo. `zonaRot` é o número que o mapa mostra, a mesma chave
        // de agrupamento do resto.
        const z = zonas.find(z => dentroGeom(z.geometry, pontoEvent.lng, pontoEvent.lat));
        if (!z) return base;
        // Profundidade do ponto novo: herda de um ponto EXISTENTE (da mesma zona,
        // senão qualquer) — nunca vazia, senão o app de campo mostra 0 prof. O
        // padrão selecionado é o último recurso.
        const ref = base.find(p => p.zona === z.zonaRot) ?? base[0];
        const prof = ref?.profundidades?.length ? ref.profundidades : profRotulos;
        return renumerarPontosZonas(
          [...base, { lng: pontoEvent.lng, lat: pontoEvent.lat, zona: z.zonaRot, profundidades: prof }],
          modelo, profRotulos,
        );
      }
      return base;
    });
    setPontoEvent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontoEvent]);

  // Regerar o grid (mudar parâmetro/zona) descarta as posições manuais e sai da
  // edição — como a aba Grid. Sem isto, editar depois de mexer num slider deixava
  // as posições velhas sobre um grid novo.
  useEffect(() => {
    setPontosManuais(null); setGradeEditandoId(null); setEdicaoAtiva(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porZonaPts, modelo, profs]);

  function iniciarEdicaoPontos() {
    const vista = gradeViewId ? grades.find(g => g.id === gradeViewId) : null;
    const base = vista ? vista.pontos : pontosGrade;
    setPontosManuais(base.map(x => ({ ...x })));
    setGradeEditandoId(vista?.id ?? null);
    setEdicaoModo('mover');
    setEdicaoAtiva(true);
  }
  function concluirEdicaoPontos() { setEdicaoAtiva(false); }
  function descartarEdicaoPontos() { setPontosManuais(null); setGradeEditandoId(null); setEdicaoAtiva(false); }
  // Grava as posições movidas POR CIMA da grade de origem (como a aba Grid).
  function salvarEdicaoPontos() {
    if (!gradeEditandoId || pontosEfetivos.length === 0) return;
    updateGrade(gradeEditandoId, { pontos: pontosEfetivos, customizado: true });
    setPontosManuais(null); setGradeEditandoId(null); setEdicaoAtiva(false);
    recarregarGrades();
  }
  useEffect(() => () => setEdicaoAtiva(false), [setEdicaoAtiva]);

  // Publica os pontos no mapa. Uma grade salva em visualização tem prioridade
  // sobre a simulação ao vivo.
  useEffect(() => {
    const vista = (gradeViewId && !editandoPontos) ? grades.find(g => g.id === gradeViewId) : null;
    if (vista) {
      // Grade SALVA no mapa (o "olho"): mesmo rótulo `zona-sequencial` da
      // simulação. Antes caía em `ordem+1` e mostrava 1..50 corrido — e era
      // esse número que ia para o app de campo.
      const fcv: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: vista.pontos.map(p => ({ type: 'Feature', properties: { ordem: p.ordem, label: rotuloDoPonto(p), cor: COR_PONTO }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
      };
      setPontosSimulados(vista.pontos.length ? fcv : null);
      return () => setPontosSimulados(null);
    }
    // `ordem` em cada feature: é por ela que o mapa sabe qual ponto foi arrastado.
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pontosEfetivos.map(p => ({ type: 'Feature', properties: { ordem: p.ordem, label: rotuloDoPonto(p), cor: COR_PONTO }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    };
    setPontosSimulados(pontosEfetivos.length ? fc : null);
    return () => setPontosSimulados(null);
  }, [gradeViewId, editandoPontos, grades, pontosEfetivos, setPontosSimulados]);

  // Ao mudar a simulação ao vivo (parâmetros/zonas), sai da visualização da grade salva.
  useEffect(() => { setGradeViewId(null); }, [pontosGrade]);

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
  // Nº de sacos = o que `amostrasDaGrade` vai imprimir de fato. Contar zonas
  // fazia a tela prometer 4 e o PDF sair com 3 quando uma zona ficava sem ponto
  // (ou com manchas agrupadas).
  const numAmostras = amostrasDaGrade(pontosEfetivos, modelo).length;
  // Etiquetas = amostras × profundidades (parciais aplicadas a % das amostras)
  const totalEtiquetas = profs.reduce((s, p) => s + (p.percentual >= 100 ? numAmostras : Math.max(1, Math.round((numAmostras * p.percentual) / 100))), 0);

  const zonaSelObj = zonas.find(z => z.id === zonaSel) ?? null;
  const densidadeEfetiva = (id: string) => densidadePorZona[id] ?? densidade;
  const temOverride = (id: string) => densidadePorZona[id] != null;
  const nZonasCustom = Object.keys(densidadePorZona).length;

  // Etiquetas da AMOSTRA — o que vai colado no saco que chega ao laboratório.
  //   modelo A (composta): UMA por zona (01, 02…) — os 50 pontos da caminhada
  //     viram 4 sacos, um por zona;
  //   modelo B (individual): uma por ponto, com o mesmo `zona-sequencial` que o
  //     operador vê no app — o saco e a tela falam o mesmo número.
  // Serve tanto a simulação ao vivo quanto uma grade JÁ SALVA (passar `g`).
  function gerarEtiquetasZonas(g?: GradeAmostragem) {
    const pts = g ? g.pontos : pontosEfetivos;
    const mod = g ? (g.modelo ?? 'A') : modelo;
    const profsUso = g ? g.profundidades : profs;
    if (!profsUso.length || pts.length === 0) return;
    const titulo = talhao?.nome || 'Talhao';
    const ano = g ? rotuloAno(g.safra) : rotuloAno(safraNome);
    const ep = g ? g.epoca : (periodoZonas?.epoca ?? '1');
    // Código de remessa só quando há grade SALVA: simulação ao vivo não é um
    // lote enviado ao laboratório, e código impresso sem lote é código perdido.
    const remessa = g ? garantirCodigoRemessa(g.id) : null;
    const rod = [`${mod === 'A' ? 'Amostra composta' : 'Ponto individual'} · Ano ${ano} · ${ep}ª época`, remessa]
      .filter(Boolean).join(' · ');
    // Grade ANTIGA (salva antes da numeração por zona): os pontos não têm zona
    // nem nº de amostra, então `amostrasDaGrade` acharia 50 amostras distintas
    // e imprimiria 50 sacos para 4 compostas. Sem dado de zona, não há o que
    // reimprimir com segurança — melhor não imprimir do que imprimir errado.
    const semZona = mod === 'A' && !pts.some(p => p.zona || p.rotulo);
    if (semZona) {
      alert('Esta grade foi salva antes da numeração por zona. Gere e salve a grade de novo para imprimir as etiquetas.');
      return;
    }
    const faz0 = getFazendas().find(f => f.id === talhao?.fazendaId);
    const cabecalho = cabecalhoEtiqueta(nav.produtor, faz0?.nome ?? nav.fazenda);
    const amostras = amostrasDaGrade(pts, mod);
    const itens: EtiquetaItem[] = [];
    amostras.forEach((a, i) => {
      for (const p of profsUso) {
        const cnt = p.percentual >= 100 ? amostras.length : Math.max(1, Math.round((amostras.length * p.percentual) / 100));
        if (i < cnt) itens.push({ cabecalho, titulo, numero: a.rotulo, sub: `${p.rotulo} cm`, rodape: rod });
      }
    });
    if (itens.length === 0) return;
    const cfg = getConfigEtiqueta();
    const layout = layoutPorId(cfg.layoutId);
    const faz = getFazendas().find(f => f.id === talhao?.fazendaId);
    const nome = nomeExport({
      fazenda: faz?.nome ?? '', siglaFazenda: faz?.sigla ?? null, talhao: titulo,
      tipo: 'ETIQ', detalhe: 'zonas',
    });
    gerarEtiquetasPDF(itens, layout, nome, { dx: cfg.dx, dy: cfg.dy })
      .catch(err => console.error('Erro ao gerar etiquetas:', err));
  }

  function salvarGradeZonas() {
    if (!padrao || !safraNome || pontosEfetivos.length === 0 || !nav.talhaoId) return;
    const lista = getGrades(nav.talhaoId, safraNome, 'zonas');
    saveGrade({
      talhaoId: nav.talhaoId, safra: safraNome, epoca: periodoZonas?.epoca ?? '1', dataReferencia: dataRef, nome: `Zonas ${lista.length + 1}`, metodo: 'zonas',
      modelo, modoDist, densidadePorZona,
      padraoAmostragemId: padrao.id, padraoNome: padrao.nome,
      customizado: nZonasCustom > 0 || densidade !== padrao.densidadeHaPonto || pontosManuais !== null,
      densidade, distanciaBorda, rotacao: 0, aleatoriedade, modoSel: 'regular',
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
    if (!talhao?.zonasGeojson) return;
    let poligono: GeoJSON.FeatureCollection;
    try { poligono = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection; } catch { return; }
    const faz = getFazendas().find(f => f.id === talhao.fazendaId);
    const input = {
      talhaoNome: talhao.nome || 'Talhao', poligono, pontos: g.pontos, poligonoTipo: 'zona' as const,
      fazenda: faz?.nome ?? '', siglaFazenda: faz?.sigla ?? null, ano: g.ano, epoca: g.epoca,
    };
    if (formato === 'kml') exportarKML(input);
    else exportarSHP(input).catch(err => console.error('Erro ao exportar SHP:', err));
  }

  return (
    <div className="p-3 space-y-3">
      {/* Data de referência (define Ano e Época da grade de zonas) */}
      <div className="flex items-center gap-2 flex-wrap text-[10px]" style={{ color: '#64748b' }}>
        <span>Ano <strong style={{ color: '#86efac' }}>{rotuloAno(safraNome)}</strong></span>
        <span>· Data de referência</span>
        <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)}
          className="rounded px-1.5 py-0.5 text-[10px] outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
        <span className="font-semibold" style={{ color: periodoZonas ? '#93c5fd' : '#fbbf24' }}>{periodoZonas ? rotuloEpoca(periodoZonas.epoca) : 'data inválida'}</span>
      </div>
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
        <button onClick={() => gerarEtiquetasZonas()}
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

      {/* Edição manual dos pontos no mapa (igual à aba Grid: Mover / Add / Remover) */}
      {pode('amostragem') && pontosGrade.length > 0 && (
        !edicaoAtiva ? (
          <button onClick={iniciarEdicaoPontos}
            className="w-full py-2 rounded text-xs font-semibold flex items-center justify-center gap-2" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <Move size={13} /> Editar pontos no mapa {gradeViewId ? '(grade aberta)' : ''}
          </button>
        ) : (
          <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#0a1f33', border: '1px solid #2e5fa3' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#93c5fd' }}>Edição manual</p>
            <div className={`grid ${gradeSemZona ? 'grid-cols-1' : 'grid-cols-3'} gap-1`}>
              {(gradeSemZona
                ? [['mover', 'Mover', Move]] as const
                : [['mover', 'Mover', Move], ['adicionar', 'Add', Plus], ['remover', 'Remover', Eraser]] as const
              ).map(([m, lbl, Ic]) => (
                <button key={m} onClick={() => setEdicaoModo(m)}
                  className="py-1.5 rounded text-[10px] font-semibold flex flex-col items-center gap-0.5"
                  style={{ background: edicaoModo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: edicaoModo === m ? '#fff' : '#93c5fd' }}>
                  <Ic size={12} /> {lbl}
                </button>
              ))}
            </div>
            <p className="text-[9px]" style={{ color: '#64748b' }}>
              {gradeSemZona
                ? 'Grade antiga (sem numeração por zona): só dá para mover. Gere e salve a grade de novo para poder adicionar e remover pontos.'
                : <>
                    {edicaoModo === 'mover' && 'Arraste os pontos. Cada ponto fica preso na sua zona; o número não muda.'}
                    {edicaoModo === 'adicionar' && 'Clique dentro de uma zona para adicionar um ponto. Ele entra como o último da zona.'}
                    {edicaoModo === 'remover' && 'Clique num ponto para removê-lo. O sequencial da zona se fecha sem buraco.'}
                  </>}
            </p>
            <div className="flex gap-2">
              <button onClick={descartarEdicaoPontos}
                className="flex-1 py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#94a3b8' }}>
                <X size={11} /> Descartar
              </button>
              {gradeEditandoId ? (
                <button onClick={salvarEdicaoPontos}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
                  <Check size={11} /> Salvar alterações
                </button>
              ) : (
                <button onClick={concluirEdicaoPontos}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-blue-mid)' }}>
                  <Check size={11} /> Concluir
                </button>
              )}
            </div>
          </div>
        )
      )}

      {/* Salvar grade de zonas */}
      {!pode('amostragem') ? null : !safraNome ? (
        <p className="text-[10px] text-center" style={{ color: '#fbbf24' }}>Defina um Ano (no topo do talhão) para salvar a grade.</p>
      ) : (
        <button onClick={salvarGradeZonas} disabled={!padrao || pontosEfetivos.length === 0}
          className="w-full py-2.5 rounded text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{ background: padrao && pontosEfetivos.length ? 'var(--invicta-green-dark)' : '#1a3a6b', opacity: padrao && pontosEfetivos.length ? 1 : 0.6 }}>
          <Save size={14} /> Salvar grade de zonas
        </button>
      )}

      {/* Grades de zonas salvas */}
      {grades.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>
            Grades de zonas — Ano {rotuloAno(safraNome)}
          </p>
          <div className="space-y-1.5">
            {grades.map(g => (
              <div key={g.id} className="p-2 rounded-lg" style={{ background: '#061525', border: `1px solid ${gradeViewId === g.id ? '#22d3ee' : (g.paraProcessar ? '#166534' : '#1a3a6b')}` }}>
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
                  <button onClick={() => setGradeViewId(id => id === g.id ? null : g.id)} title={gradeViewId === g.id ? 'Ocultar do mapa' : 'Ver no mapa'}
                    className="p-1 rounded" style={{ color: gradeViewId === g.id ? '#22d3ee' : '#93c5fd' }}><Eye size={11} /></button>
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
                  {/* Etiquetas da grade SALVA — como na aba Grid. Sem isto, salvar
                      a grade tirava a única forma de reimprimir os sacos. */}
                  <button onClick={() => gerarEtiquetasZonas(g)} title="Etiquetas (PDF)"
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
