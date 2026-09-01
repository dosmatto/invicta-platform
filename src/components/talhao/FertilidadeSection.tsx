'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getGrades, getImportacoesLab, getTalhoes, getFazendas, getPlantio,
  getLaboratorios, definirLaboratorioLab, nomeLaboratorioDoLaudo, fonteDoLaboratorio,
  getLegendas, getLegendasPorAtributo, ordenarLegendasDoAtributo, casasDecimaisVariavel,
  type ImportacaoLab, type GradeAmostragem,
} from '@/lib/store';
import { gerarRelatorioFertilidade, type ProfundidadeRel } from '@/lib/relatorioFertilidade';
import { estatisticaDaPagina, casasDoRotulo } from '@/lib/estatisticaMapa';
import { zonasDoTalhao } from '@/lib/zonasDoTalhao';
import { municipioDaFazenda } from '@/lib/geocodeMunicipio';
import { pontoDoPoligono } from '@/lib/relatorioDados';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono,
  comprimirGrid, descomprimirGrid,
  type RespInterp, type VariogramaManual,
} from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import { resolverGradeDoLaudo, pontosPorNumero, casarAmostrasComPontos } from '@/lib/eloGrade';
import { decodeGrid, interpoladorEfetivo, MIN_PTS_MAPA, MIN_PTS_KRIGE } from '@/lib/fertilidade';
import { rasterizarZonas, rasterizarZonasDose, centroideGeom, type ZonaValor } from '@/lib/recomendacao/zonasGrid';
import { bindingAuto, bindingPorPontos, divisasDasZonas } from '@/lib/meap/fertilidadePorZona';
import { stopsParaBackend, dominioDaLegenda, paresDaClasse, respeitarPadraoHomonima } from '@/lib/legendas';
import type { Legenda } from '@/lib/legendas';
import { Play, Layers, Loader2, Eraser, AlertTriangle, Activity, Settings, BookOpen, Save, FileDown, RotateCcw } from 'lucide-react';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo, cloudPodeGravar } from '@/lib/cloud';
import { ehBackendFora, msgBackendFora, onBackendAquecendo, tocarBackend } from '@/lib/interpUrl';
import { pode } from '@/lib/empresa';
import { listar as bibListar, criar as bibCriar, type ConteudoPerfil, type ItemBiblioteca } from '@/lib/biblioteca';

import { inputStyle } from '@/constants/ui';
import { faixaDoLaudo, limitarRespAFaixa } from '@/lib/faixaAmostras';
import { partesDoTalhao, partesSemAmostra } from '@/lib/partesTalhao';
import { simboloElemento } from '@/lib/lab';
// Resolução em que a Recomendação calcula a dose — fonte única, para o mapa que
// geramos aqui em segundo plano ser exatamente o que ela procura lá.
import {
  PIXEL_RECOMENDACAO_M as PIXEL_RECOMENDACAO,
  idDose20, prefixoDose20, ehAuxiliar20mPerdido,
} from '@/lib/recomendacao/escolhaMapa';
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
// Rótulo do valor no ponto do mapa: pH e K com 1 casa decimal; os demais inteiros.
// Casas decimais do rótulo do ponto no mapa: config da variável (Preferências de
// Análise) tem prioridade; senão pH/K = 1, demais = 0. Faz K%/Ca%/Mg% (satk…=1)
// saírem com 1 casa, como pedido.
const casasPonto = (nut: string) => casasDoRotulo(nut, casasDecimaisVariavel(nut));
const fmtPonto = (v: number, nut: string) => v.toLocaleString('pt-BR', { minimumFractionDigits: casasPonto(nut), maximumFractionDigits: casasPonto(nut) });
const OPACIDADE = 1; // fixo 100%

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm?: string };

// Arquitetura: separamos raster (interpolação cara) de renderização (cor barata).
// A chave NÃO inclui a legenda — assim, trocar legenda/estilo apenas recolore o
// grid persistido (sem ir ao backend).
// Sufixo é `nut__prof`. Mapas anteriores (v0.21.0-0.22.x) usavam `legId__nut__prof`
// no mesmo prefixo — leitura tolera ambos (legacy = qualquer legenda salva com grid).
const ck = (nut: string, prof: string) => `${nut}__${prof}`;
const prefixoNuvem = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string) =>
  `${talhaoId}__${importacaoId}__${metodo}__${pixelM}__${modeloFixo || 'auto'}__`;
const idNuvem = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string, nut: string, prof: string) =>
  `${prefixoNuvem(talhaoId, importacaoId, metodo, pixelM, modeloFixo)}${nut}__${prof}`;

// CONTRATO DA CHAVE: os DOIS ÚLTIMOS campos do id são sempre `nut__prof` — é por
// eles que a hidratação abaixo, o relatório (lib/relatorioDados) e a Recomendação
// (lib/recomendacao/aplicar) leem. Nunca acrescente nada DEPOIS deles. O miolo é
// livre e serve só para dois mapas do mesmo nut/prof feitos com configs diferentes
// não se sobrescreverem; na leitura, vence o `interpoladoEm` mais recente.

// ── Krigagem fixa ───────────────────────────────────────────────────────────
// Variograma travado nos valores de referência (editáveis na tela). Na krigagem
// ordinária só a FORMA do variograma entra na predição — a escala some na conta —,
// então o mesmo trio serve para qualquer variável, seja pH, Ca% ou P em mg/dm³.
// Contra o auto-ajuste, que refaz a estrutura espacial a cada mapa, isto dá mapas
// comparáveis entre nutrientes, profundidades e talhões.
// Strings de propósito: o campo precisa poder ficar vazio enquanto se digita.
const VARIOGRAMA_FIXO_PADRAO = { alcance: '400', patamar: '300', pepita: '10' };
type VarFixo = typeof VARIOGRAMA_FIXO_PADRAO;
type Interpolador = 'krige' | 'krige-fixo' | 'idw';
const numVar = (s: string) => Number(String(s).replace(',', '.').trim());

const fcVazio = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export function FertilidadeSection({ safraNome: safraProp }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  // safraProp (vinda da Página do Talhão) tem prioridade; sem ela, usa a ativa global.
  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraProp ?? safraAtiva?.nome ?? '';

  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const laboratorios = useMemo(() => getLaboratorios(), []);
  const [importacaoId, setImportacaoId] = useState('');
  const [nutriente, setNutriente] = useState('');
  const [profundidade, setProfundidade] = useState('');
  const [interpolador, setInterpolador] = useState<Interpolador>('krige');
  const [varFixo, setVarFixo] = useState<VarFixo>({ ...VARIOGRAMA_FIXO_PADRAO });
  // O backend só conhece 'krige' e 'idw' — a Krigagem fixa é 'krige' + variograma manual.
  const metodo: 'krige' | 'idw' = interpolador === 'idw' ? 'idw' : 'krige';
  const [pixelM, setPixelM] = useState(5);
  const [modeloFixo, setModeloFixo] = useState('');        // modo AUTO — '' = auto-ajustado
  const [modeloFixa, setModeloFixa] = useState('spherical'); // modo FIXO — sempre concreto
  const [cfgAberto, setCfgAberto] = useState(false);

  // Modelo que vai ao backend e à chave da nuvem. No modo fixo é sempre concreto:
  // ali não há auto-ajuste nenhum, então "auto" seria mentira (e o backend cairia
  // em esférico calado). Estado separado p/ a Krigagem auto não ficar pinada em
  // esférico depois de uma passagem pelo modo fixo.
  const modeloEfetivo = interpolador === 'krige-fixo' ? modeloFixa : modeloFixo;

  // Variograma fixo saneado. null = modo fixo desligado OU alcance inválido. O
  // ALCANCE é o que LIGA o modo manual no backend (`if man and man.get("alcance")`):
  // sem ele a interpolação cairia calada no auto-ajuste e a tela estaria mentindo.
  const varFixoNum = useMemo<VariogramaManual | null>(() => {
    if (interpolador !== 'krige-fixo') return null;
    const alcance = numVar(varFixo.alcance);
    if (!isFinite(alcance) || alcance <= 0) return null;
    const patamar = numVar(varFixo.patamar), pepita = numVar(varFixo.pepita);
    return {
      modelo: modeloFixa, alcance,
      ...(isFinite(patamar) && patamar > 0 ? { patamar } : {}),
      ...(isFinite(pepita) && pepita >= 0 ? { pepita } : {}),
    };
  }, [interpolador, varFixo, modeloFixa]);

  // Fora do modo fixo é sempre ok; no modo fixo, exige o alcance.
  const alcanceFixoOk = interpolador !== 'krige-fixo' || varFixoNum != null;

  // Pepita ≥ patamar não é erro (o backend capa em 99% do patamar), mas achata o
  // mapa — avisa sem bloquear.
  const avisoPepita = useMemo(() => {
    if (interpolador !== 'krige-fixo') return false;
    const p = numVar(varFixo.patamar), n = numVar(varFixo.pepita);
    return isFinite(p) && isFinite(n) && p > 0 && n >= p;
  }, [interpolador, varFixo]);

  // "Método" na chave da nuvem: o modo fixo grava sob nome próprio p/ não
  // sobrescrever o mapa da krigagem AUTOMÁTICA do mesmo nut/prof (nem o contrário).
  // Os NÚMEROS não entram na chave de propósito: calibrar variograma é iterativo
  // (400, 500, 350…) e cada tentativa deixaria um documento órfão de até ~950 KB
  // por nut/prof — e a hidratação baixa TUDO do talhão+importação. Reprocessar
  // sobrescreve a tentativa anterior, que é o que se espera ao calibrar.
  const metodoChave = interpolador === 'krige-fixo' ? 'krigefixa' : metodo;
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  // Mapas que tiveram de cair para IDW por falta de pontos na camada. Zerado a
  // cada rodada — é um aviso do que ACABOU de sair, não um estado do talhão.
  const [quedasIdw, setQuedasIdw] = useState<string[]>([]);
  const [aquecendo, setAquecendo] = useState(false);
  // Acorda o servidor de processamento (Render dorme sem uso) ao entrar na aba,
  // e mostra "aquecendo…" enquanto ele sobe (em vez de só falhar no cold start).
  useEffect(() => {
    tocarBackend();
    return onBackendAquecendo(setAquecendo);
  }, []);
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nome: string } | null>(null);
  const [debugAberto, setDebugAberto] = useState(false);

  // legendas carregadas (seed garantido ao abrir)
  const [legendas, setLegendas] = useState<Legenda[]>([]);
  // qual legenda aplicar por atributo (pH, P, K...) — o usuário escolhe
  const [legendaIdPorAtributo, setLegendaIdPorAtributo] = useState<Record<string, string>>({});

  // Perfis agronômicos (Biblioteca > Perfis) — preset opcional que pré-preenche
  // o legendaIdPorAtributo todo de uma vez.
  const [perfis, setPerfis] = useState<ItemBiblioteca<ConteudoPerfil>[]>([]);
  const [perfilId, setPerfilId] = useState('');
  useEffect(() => {
    setPerfis(bibListar<ConteudoPerfil>('perfis').filter(p => p.ativo));
    const onBib = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: string } | undefined;
      if (!d?.slug || d.slug === 'perfis') {
        setPerfis(bibListar<ConteudoPerfil>('perfis').filter(p => p.ativo));
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onBib);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onBib); };
  }, []);

  // cache de mapas: chave = legenda+nutriente+profundidade
  const [cache, setCache] = useState<Record<string, MapaPronto>>({});
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Cancelamento: aborta a interpolação em voo ao iniciar outra, ao trocar de
  // contexto ou ao sair da tela — a UI não fica presa esperando um cálculo que
  // o usuário já abandonou (o backend na nuvem é lento sob carga).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  const ehAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

  // Fila do mapa de 20 m da Recomendação (roda depois do primeiro plano, um a um).
  const fila20 = useRef<string[]>([]);
  const rodando20 = useRef(false);
  const [pendente20, setPendente20] = useState<string[]>([]);

  // Seed automático do repositório Fundação ABC + carrega legendas do store.
  // Reage a mudanças no editor de Legendas via evento custom.
  useEffect(() => {
    setLegendas(getLegendas());
    const onLeg = () => setLegendas(getLegendas());
    if (typeof window !== 'undefined') window.addEventListener('inv:legendas', onLeg);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:legendas', onLeg); };
  }, []);

  useEffect(() => {
    const recarregar = () => {
      if (nav.talhaoId && safraNome) setImportacoes(getImportacoesLab(nav.talhaoId, safraNome));
    };
    recarregar();
    // Sem isto, uma importação recém-salva só aparecia ao sair e voltar na aba.
    if (typeof window !== 'undefined') window.addEventListener('inv:lab', recarregar);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:lab', recarregar); };
  }, [nav.talhaoId, safraNome]);

  // Carregamento inteligente (Etapa 2): ao abrir o talhão, auto-seleciona a
  // importação mais recente. Isso dispara a hidratação da nuvem abaixo, então
  // os mapas já interpolados reaparecem sozinhos (sem reprocessar). Antes o
  // seletor abria vazio e o usuário precisava reescolher a importação.
  useEffect(() => {
    if (importacaoId || importacoes.length === 0) return;
    const maisRecente = [...importacoes].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
    if (maisRecente) setImportacaoId(maisRecente.id);
  }, [importacoes, importacaoId]);

  const importacao = importacoes.find(i => i.id === importacaoId) ?? null;
  const importacaoMaisRecente = useMemo(
    () => [...importacoes].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0] ?? null,
    [importacoes],
  );

  const grade = useMemo<GradeAmostragem | null>(() => {
    if (!importacao || !nav.talhaoId) return null;
    // Regra do elo laudo↔grade (eloGrade): a grade apontada quando tem pontos,
    // senão a com MAIS pontos do talhão/safra — sem isto a Fertilidade fica
    // "0 pontos" mesmo com o laudo importado corretamente. A MESMA função serve
    // o relatório: era divergir aqui que deixava o PDF sem os valores.
    return resolverGradeDoLaudo(getGrades(nav.talhaoId, safraNome), importacao.gradeId);
  }, [importacao, nav.talhaoId, safraNome]);

  const pontoPorNumero = useMemo(() => pontosPorNumero(grade), [grade]);

  // Zonas de manejo do talhão (Fase Z1). Quando a importação está ligada a uma
  // grade de zonas, o mapa é CONSTANTE por zona (sem interpolação): cada zona
  // recebe o valor da sua amostra composta.
  // Cascata das zonas (padrão salvo > mais recente > snapshot do talhão) vive em
  // lib/zonasDoTalhao.ts — compartilhada com o relatório de Produtividade.
  const zonas = useMemo(() => zonasDoTalhao(nav.talhaoId), [nav.talhaoId]);

  // MODO DO MAPA — escolha do usuário quando o talhão tem zonas de manejo:
  //   'interpolar' → krigagem/IDW, com as ferramentas de sempre;
  //   'zona'       → SEM interpolação: cada zona recebe o valor do seu ponto de
  //                  amostragem (vínculo por localização, editável na tabela).
  // Default por importação: amostragem feita POR ZONA (grade metodo 'zonas')
  // abre em 'zona'; grade de pontos abre em 'interpolar'. Sem zonas no talhão
  // não há o que preencher — fica interpolação, sem seletor.
  const [modoEscolhido, setModoEscolhido] = useState<'auto' | 'interpolar' | 'zona'>('auto');
  const modoMapa: 'interpolar' | 'zona' = zonas.length === 0
    ? 'interpolar'
    : modoEscolhido === 'auto' ? (grade?.metodo === 'zonas' ? 'zona' : 'interpolar') : modoEscolhido;
  // Sem importação não há valor para pôr na zona — o modo zona só age com laudo.
  const ehZona = modoMapa === 'zona' && !!importacao;

  // Vínculo zona ↔ nº da amostra (auto pela ordem; editável na tabela). Refaz ao
  // trocar de importação/talhão; estável dentro do mesmo par (preserva edições).
  const [mapaZonaNumero, setMapaZonaNumero] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!ehZona || !importacao) { setMapaZonaNumero({}); return; }
    // Vínculo pela LOCALIZAÇÃO: o ponto de amostragem que cai DENTRO da zona é a
    // amostra dela ("preencher com o valor do ponto"); a ordem entra só como
    // fallback p/ zona sem ponto dentro. A tabela continua editável por cima.
    const pontos = (grade?.pontos ?? []).map(p => ({ numero: p.numero ?? p.ordem + 1, lng: p.lng, lat: p.lat }));
    const nums = [...new Set(importacao.resultados.map(r => r.numero))];
    setMapaZonaNumero(pontos.length ? bindingPorPontos(zonas, pontos, nums) : bindingAuto(zonas, nums));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehZona, importacaoId, zonas, grade]);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  // só nutrientes que têm pelo menos uma legenda cadastrada. CTCe ('t') herda a
  // legenda de CTC ('ctc') enquanto não tiver a própria — assim aparece mesmo
  // antes da legenda clonada (migrarLegendaCtceV1) existir.
  const temLegenda = (id: string) =>
    legendas.some(l => l.atributoId === id) || (id === 't' && legendas.some(l => l.atributoId === 'ctc'));
  const nutrientes = useMemo(() => {
    if (!importacao) return [] as string[];
    return importacao.elementos.filter(temLegenda);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacao, legendas]);

  // O filtro acima descarta em SILÊNCIO toda variável do laudo que não tem
  // legenda cadastrada — ela some da lista de mapas sem uma palavra, e quem
  // procura por ela conclui que "o laudo não veio com isso". Foi assim que o
  // Ferro passou despercebido. Aqui juntamos as descartadas para dizer quais são
  // e o que fazer (criar a legenda em Biblioteca → Legendas).
  const semLegenda = useMemo(() => {
    if (!importacao) return [] as string[];
    return importacao.elementos.filter(e => !temLegenda(e)).map(simboloElemento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacao, legendas]);

  const profundidades = useMemo(
    () => (importacao ? [...new Set(importacao.resultados.map(r => r.profundidade).filter(Boolean))] : []),
    [importacao],
  );
  const profsAll = profundidades.length ? profundidades : [profundidade];

  // helper: legenda escolhida para um atributo (default = primeira do atributo)
  function legendaDe(atributoId: string): Legenda | undefined {
    // ordenarLegendasDoAtributo: sem escolha explícita vale a marcada como PADRÃO
    // — e nunca a "primeira que o array trouxe" (que variava a cada boot).
    let lst = ordenarLegendasDoAtributo(legendas.filter(l => l.atributoId === atributoId));
    // CTCe usa a legenda de CTC enquanto não houver uma própria.
    if (lst.length === 0 && atributoId === 't') lst = ordenarLegendasDoAtributo(legendas.filter(l => l.atributoId === 'ctc'));
    if (lst.length === 0) return undefined;
    const escolhida = legendaIdPorAtributo[atributoId];
    const alvo = lst.find(l => l.id === escolhida);
    // Perfil/escolha apontando para a gêmea não-padrão (mesmo nome) → vale a
    // padrão: é a que o usuário edita na Biblioteca e não dá pra distinguir as
    // duas no dropdown.
    return alvo ? respeitarPadraoHomonima(lst, alvo) : lst[0];
  }

  // Aplica um perfil da Biblioteca: pré-preenche legendaIdPorAtributo com o
  // mapa do perfil. Não trava — o usuário pode trocar individualmente depois.
  function aplicarPerfil(id: string) {
    setPerfilId(id);
    if (!id) return;
    const p = perfis.find(x => x.id === id);
    if (!p) return;
    setLegendaIdPorAtributo({ ...(p.conteudo.legendasPorElemento ?? {}) });
  }

  // Captura escolhas atuais (legendas por nutriente + grade.padraoAmostragemId)
  // num novo Perfil da Biblioteca. Lab fica vazio (associação por nome livre
  // não é confiável); usuário edita depois se quiser.
  function salvarComoPerfil() {
    if (!importacao) { alert('Selecione uma importação antes de salvar.'); return; }
    const nome = window.prompt('Nome do perfil:', importacao.laboratorio ? `${importacao.laboratorio} — rotina` : '')?.trim();
    if (!nome) return;
    const legPorEl: Record<string, string> = {};
    for (const n of nutrientes) {
      const l = legendaDe(n);
      if (l) legPorEl[n] = l.id;
    }
    const novo = bibCriar<ConteudoPerfil>('perfis', {
      nome,
      conteudo: {
        padraoAmostragemId: grade?.padraoAmostragemId,
        legendasPorElemento: Object.keys(legPorEl).length ? legPorEl : undefined,
      },
    });
    setPerfilId(novo.id);
    alert(`Perfil "${nome}" salvo na Biblioteca > Perfis.`);
  }

  function pontosDe(nut: string, prof: string): Ponto[] {
    if (!importacao || !nut) return [];
    // Casamento pelo NÚMERO da amostra ↔ nº do ponto, com fallback por ORDEM
    // (lab que renumerou as amostras) — em eloGrade, compartilhado com o PDF.
    const amostras = importacao.resultados
      .filter(r => r.profundidade === prof && r.valores[nut] != null && isFinite(r.valores[nut]))
      .map(r => ({ numero: r.numero, valor: r.valores[nut] }));
    return casarAmostrasComPontos(amostras, grade);
  }
  function fcLabels(pts: Ponto[], nut: string): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        // `v` = o número cru: a caixa ESTATÍSTICAS conta EXATAMENTE estes valores.
        properties: { txt: fmtPonto(p.valor, nut), v: p.valor },
      })),
    };
  }

  // Modo zona: valor da zona p/ um nutriente+profundidade, via o vínculo
  // zona↔amostra; zonas com valor; e rótulos no centroide de cada zona.
  function valorZona(zonaId: string, nut: string, prof: string): number {
    if (!importacao) return NaN;
    const num = mapaZonaNumero[zonaId];
    const r = importacao.resultados.find(x => x.numero === num && x.profundidade === prof);
    const v = r?.valores[nut];
    return v != null && isFinite(v) ? v : NaN;
  }
  function zonasComValor(nut: string, prof: string): ZonaValor[] {
    return zonas
      .map(z => ({ id: z.id, geometry: z.geometry, valor: valorZona(z.id, nut, prof) }))
      .filter(z => isFinite(z.valor));
  }
  function fcLabelsZona(nut: string, prof: string): GeoJSON.FeatureCollection {
    const feats: GeoJSON.Feature[] = [];
    for (const z of zonasComValor(nut, prof)) {
      const c = centroideGeom(z.geometry);
      // `v` cru junto do texto: a caixa de estatísticas conta o valor da zona, não o arredondado do rótulo.
      if (c) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { txt: fmtPonto(z.valor, nut), v: z.valor } });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  // defaults ao trocar de importação
  useEffect(() => {
    setNutriente(nutrientes[0] ?? '');
    setProfundidade(profundidades[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacaoId]);

  // trocar contexto: hidrata da nuvem o que estiver salvo para este talhão+importação.
  // Usa o prefixo LARGO (igual ao gerador de relatórios) — INDEPENDENTE de
  // método/pixel/modelo. Antes o prefixo incluía essas configs e, se a
  // interpolação tivesse sido feita com outras (ex.: por outro usuário), ela
  // "sumia" da aba enquanto o relatório a encontrava. A chave do cache é
  // sempre `nut__prof` (os 2 últimos campos do id, p/ ids novos e legados).
  useEffect(() => {
    abortRef.current?.abort();   // troca de contexto: cancela interpolação em voo (resultado obsoleto)
    setCache({}); setEstado('idle'); setErro(''); setQuedasIdw([]);
    fila20.current = []; setPendente20([]);   // a fila de 20 m era do talhão anterior
    if (!nav.talhaoId || !importacaoId) return;
    const prefixo = `${nav.talhaoId}__${importacaoId}__`;
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
      if (carregados.length === 0) return;
      const novo: Record<string, MapaPronto> = {};
      const perdidos: string[] = [];
      for (const c of carregados) {
        const partes = c.id.slice(prefixo.length).split('__');
        if (partes.length < 2) continue;
        const chave = `${partes[partes.length - 2]}__${partes[partes.length - 1]}`; // nut__prof
        const dados = c.dados;
        // Auxiliar de 20 m que a v2.37.0 gravou nesta gaveta por engano: ele é o
        // mais recente e sequestrava a aba e o relatório. Ignora e apaga.
        if (ehAuxiliar20mPerdido(c.id, prefixo, dados)) { perdidos.push(c.id); continue; }
        // Se houver duplicado (mesmo nut/prof salvo com configs diferentes), mantém o mais recente.
        const atual = novo[chave];
        if (atual && (atual.interpoladoEm ?? '') >= (dados.interpoladoEm ?? '')) continue;
        // Grid pode vir comprimido (gzip) — descomprime p/ o render colorir local.
        if (dados.resp?.grid?.comp === 'gz') {
          try { dados.resp.grid = await descomprimirGrid(dados.resp.grid); }
          catch (e) { console.warn('[fertilidade] falha ao descomprimir grid da nuvem:', e); }
        }
        // Mapa SALVO antes da correção de faixa guarda o valor fora dela — e
        // reabrir não refaz a conta. Limita na leitura, com a faixa do laudo, para
        // não obrigar a reprocessar tudo. `faixaDoLaudo` devolve null (não mexe)
        // quando o laudo mudou DEPOIS do mapa: aí a faixa atual não é a que o
        // gerou, e cortar por ela seria inventar.
        const [nutC, profC] = chave.split('__');
        dados.resp = limitarRespAFaixa(dados.resp, faixaDoLaudo(importacao, nutC, profC, dados.interpoladoEm));
        novo[chave] = dados;
      }
      setCache(novo);
      if (perdidos.length && cloudPodeGravar()) {
        console.warn('[fertilidade] limpando', perdidos.length, 'mapas auxiliares de 20 m gravados na gaveta errada (v2.37.0).');
        for (const id of perdidos) cloudExcluirMapasPorPrefixo(id).catch(() => {});
      }
      console.log('[fertilidade] autoload da nuvem:', Object.keys(novo).length, 'mapas —',
        Object.fromEntries(Object.entries(novo).map(([k, v]) => [k, { grid: !!v.resp?.grid, comp: v.resp?.grid?.comp ?? null, pngLen: v.resp?.png?.length ?? 0, bounds: !!v.resp?.bounds }])));
    })();
  }, [importacaoId, nav.talhaoId]);

  // exibe no mapa o mapa do nutriente+profundidade selecionados.
  // Estratégia: tenta colorir local (do grid); se falhar OU não houver grid, cai
  // pro PNG do backend (presente na sessão atual; ausente nos docs antigos da nuvem).
  const legAtual = nutriente ? legendaDe(nutriente) : undefined;
  const estiloAtual = legAtual?.estilo ?? 'segmentado';
  const legHash = useMemo(() => legAtual ? JSON.stringify({ e: legAtual.estilo, i: legAtual.invertida, c: legAtual.classes }) : '', [legAtual]);
  useEffect(() => {
    if (!legAtual) { console.log('[fert-overlay] sem legenda para', nutriente); setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    const r = cache[ck(nutriente, profundidade)];
    if (!r) { console.log('[fert-overlay] cache MISS', ck(nutriente, profundidade), '— chaves:', Object.keys(cache)); setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    let url: string | undefined;
    if (temGrid(r.resp)) {
      try { url = colorirGridComLegenda(r.resp.grid, legAtual).dataUrl; }
      catch (e) { console.warn('[fert-overlay] colorir FALHOU (grid comp=', r.resp.grid?.comp, '):', e); }
    } else {
      console.warn('[fert-overlay] sem grid utilizável — grid=', r.resp.grid, 'pngLen=', r.resp.png?.length ?? 0);
    }
    if (!url && r.resp.png) url = r.resp.png; // fallback (legacy ou sessão atual)
    if (!url) {
      console.warn('[fert-overlay] SEM URL final para', ck(nutriente, profundidade), '— overlay não exibido.');
      setFertilidadeOverlay(null); setFertilidadeLabels(null); return;
    }
    console.log('[fert-overlay] overlay DEFINIDO', ck(nutriente, profundidade), 'urlLen=', url.length, 'bounds=', r.resp.bounds);
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(r.resp.bounds), opacity: OPACIDADE });
    // Reformata os rótulos com as casas decimais por nutriente (pH/K=1, resto=0),
    // valendo também p/ mapas já salvos. Cai p/ os rótulos salvos se não houver pontos.
    if (r.resp.stats?.modelo === 'zona' && zonas.length) {
      // Mapa POR ZONA: valor no centroide de cada zona + as DIVISAS desenhadas
      // por cima do raster — sem elas, zonas vizinhas da mesma classe viravam
      // uma mancha só e não dava para ver cada zona separada.
      const zl = fcLabelsZona(nutriente, profundidade);
      const base = zl.features.length ? zl.features : (r.labels?.features ?? []);
      setFertilidadeLabels({ type: 'FeatureCollection', features: [...base, ...divisasDasZonas(zonas)] });
    } else {
      const pts = pontosDe(nutriente, profundidade);
      setFertilidadeLabels(pts.length ? fcLabels(pts, nutriente) : r.labels);
    }
  // legHash garante re-render quando o usuário edita classes/cores da legenda atual
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, nutriente, profundidade, legAtual, legHash, estiloAtual, zonas, setFertilidadeOverlay, setFertilidadeLabels]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  const pontosInterp = useMemo(() => pontosDe(nutriente, profundidade), [nutriente, profundidade, importacao, pontoPorNumero, grade]); // eslint-disable-line react-hooks/exhaustive-deps

  // Diagnóstico do casamento amostra↔grade — explica na tela um "0 pontos".
  const diagCasamento = useMemo(() => {
    if (!importacao || !nutriente || ehZona) return null;
    const amostras = importacao.resultados.filter(r => r.profundidade === profundidade && r.valores[nutriente] != null && isFinite(r.valores[nutriente]));
    let porNum = 0;
    for (const r of amostras) if (pontoPorNumero.get(r.numero)) porNum++;
    const nPontos = grade?.pontos?.length ?? 0;
    const modo: 'numero' | 'ordem' | 'nenhum' = porNum >= 3 ? 'numero' : (amostras.length >= 3 && nPontos >= amostras.length ? 'ordem' : 'nenhum');
    return { amostras: amostras.length, nPontos, porNum, modo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacao, nutriente, profundidade, pontoPorNumero, grade, ehZona]);

  // COBERTURA por parte do talhão. O diagnóstico acima é por CONTAGEM — quantas
  // amostras casaram — e por isso não vê o caso do talhão com duas áreas em que
  // uma delas ficou inteira de fora do laudo: 34 de 44 casam, tudo "verde", e a
  // área sem amostra sai chapada no mapa (a krigagem prediz a média onde não há
  // ponto por perto), parecendo medição. Aqui olhamos ONDE as amostras estão.
  const partesVazias = useMemo(() => {
    if (!importacao || !nutriente || ehZona || !poligono || !grade?.pontos?.length) return [];
    const comValor = new Set(
      importacao.resultados
        .filter(r => r.profundidade === profundidade && r.valores[nutriente] != null && isFinite(r.valores[nutriente]))
        .map(r => r.numero),
    );
    const pts = grade.pontos.map((p, i) => ({ numero: p.numero ?? i + 1, lng: p.lng, lat: p.lat }));
    return partesSemAmostra(partesDoTalhao(poligono, pts, n => comValor.has(n)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacao, nutriente, profundidade, grade, poligono, ehZona]);

  // MAPA ANTERIOR À CIRURGIA NO LIMITE. Quando uma área é separada/excluída
  // (lib/desmembrarTalhao.ts) a importação recebe `limiteAlteradoEm`. Os mapas
  // já processados não são apagados — o histórico dos ciclos que usaram a
  // geometria antiga continua válido — mas quem olha ESTA tela precisa saber
  // que o raster ainda pinta a área que saiu.
  const mapasAnterioresAoLimite = useMemo(() => {
    const marca = importacao?.limiteAlteradoEm;
    if (!marca) return 0;
    return Object.values(cache).filter(m => (m.interpoladoEm ?? '') < marca).length;
  }, [importacao, cache]);

  // Modo zona (Z1): pinta cada zona com o valor da sua amostra e salva no MESMO
  // formato/chave da interpolação (metodo='zona') → a Recomendação lê transparente.
  async function processarUmZona(nut: string, prof: string) {
    const leg = legendaDe(nut);
    if (!leg) throw new Error(`${nut}: sem legenda`);
    const zv = zonasComValor(nut, prof);
    if (zv.length === 0) throw new Error(`${leg.simbolo} ${prof}: nenhuma zona com valor`);
    const resp = rasterizarZonas(zv, pixelM);
    const labels = fcLabelsZona(nut, prof);
    const interpoladoEm = new Date().toISOString();
    setCache(c => ({ ...c, [ck(nut, prof)]: { resp, labels, interpoladoEm } }));
    if (nav.talhaoId && importacaoId) {
      const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
      const dados = { resp: { ...resp, png: '', grid: gridGz }, labels, interpoladoEm };
      cloudSalvarMapa(idNuvem(nav.talhaoId, importacaoId, 'zona', pixelM, '', nut, prof), dados);
      // E O MAPA DA DOSE — sem isto a Recomendação continuava saindo INTERPOLADA
      // mesmo com tudo processado em zona. Ela lê a gaveta `dose20__` ANTES de
      // tudo, e essa gaveta só era escrita pelo caminho da interpolação: o mapa
      // de 20 m que sobrou de um processamento anterior seguia lá e alimentava a
      // dose. Agora a zona escreve na gaveta também, com `metodo='zona'`; entre
      // dois mapas de 20 m o desempate é "o mais recente vence" (escolhaMapa),
      // então o que o usuário acabou de processar é o que vale.
      //
      // Rasterizamos DE NOVO em 20 m em vez de reamostrar o fino: a reamostragem
      // tira MÉDIA de blocos e borraria a divisa, criando na borda valores que
      // não são de zona nenhuma — exatamente o "interpolado" que queremos evitar.
      // É conta local e barata (sem backend), então sai aqui mesmo, sem fila.
      //
      // A malha é a do TALHÃO (rasterizarZonasDose), NÃO a bbox das zonas com
      // valor: a Recomendação casa os atributos por índice, e nutrientes com
      // conjuntos de zonas diferentes (o laudo não trouxe K numa zona, trouxe
      // CTC) gerariam malhas diferentes — ou a equação quebra, ou os shapes
      // batem por acaso e a conta sai deslocada, sem aviso nenhum.
      if (poligono) {
        const resp20 = rasterizarZonasDose(zv, poligono, PIXEL_RECOMENDACAO);
        const grid20 = resp20.grid ? await comprimirGrid(resp20.grid) : undefined;
        cloudSalvarMapa(
          idDose20(nav.talhaoId, importacaoId, 'zona', '', nut, prof),
          { resp: { ...resp20, png: '', grid: grid20 }, labels: fcVazio(), interpoladoEm },
        );
      }
    }
  }

  // POR QUE um mapa não sai. "menos de 3 pontos" não dizia nada acionável: o
  // usuário via 15 variáveis reprovadas numa profundidade e não tinha como saber
  // se faltava valor no laudo, se a grade estava curta ou se a numeração não
  // batia. Cada caso tem conserto DIFERENTE, então a mensagem tem de separá-los.
  function motivoSemMapa(nut: string, prof: string): string {
    if (!importacao) return 'sem importação de laboratório';
    const comValor = importacao.resultados.filter(
      r => r.profundidade === prof && r.valores[nut] != null && isFinite(r.valores[nut]),
    ).length;
    const nasProf = importacao.resultados.filter(r => r.profundidade === prof).length;
    const nPontos = grade?.pontos?.length ?? 0;
    if (comValor === 0) {
      return nasProf > 0
        ? `o laudo tem ${nasProf} linha(s) em ${prof}, mas nenhuma com valor desta variável`
        : `o laudo não tem nenhuma linha em ${prof}`;
    }
    if (comValor < 3) return `só ${comValor} amostra(s) com valor em ${prof} (o mínimo é 3)`;
    if (nPontos === 0) return 'o talhão não tem grade de amostragem com pontos';
    if (nPontos < comValor) return `${comValor} amostras para ${nPontos} pontos na grade — sobram amostras sem lugar`;
    return `os números do laudo não batem com os da grade (${comValor} amostras, ${nPontos} pontos)`;
  }

  // Devolve o rótulo do mapa que teve de cair para IDW (ou null). Quem chama
  // junta os rótulos e mostra o aviso — ver `quedasIdw`.
  async function processarUm(nut: string, prof: string): Promise<string | null> {
    if (ehZona) { await processarUmZona(nut, prof); return null; }
    const leg = legendaDe(nut);
    if (!leg) throw new Error(`${nut}: sem legenda`);
    const pts = pontosDe(nut, prof);
    if (pts.length < MIN_PTS_MAPA) throw new Error(`${leg.simbolo} ${prof}: ${motivoSemMapa(nut, prof)}`);
    // Menos de 4 pontos: a krigagem não ajustaria o variograma e o backend
    // devolveria "nao convergiu" — técnico e repetido uma vez por variável. É o
    // caso comum de laudo que amostra a camada profunda só em parte dos pontos.
    // Cai para IDW SÓ NESTE mapa (ver interpoladorEfetivo): antes o mapa era
    // reprovado e o usuário tinha de virar a chave na tela, que é global e
    // levaria junto a 0-20, que tem pontos de sobra.
    const { metodo: metodoUsado, caiuParaIdw } = interpoladorEfetivo(metodo, pts.length);
    // A chave da nuvem tem de dizer a verdade sobre o mapa gravado: um raster
    // IDW salvo sob a chave 'krige' faria a releitura comparar coisas diferentes.
    const chaveUsada = caiuParaIdw ? 'idw' : metodoChave;
    const modeloUsado = caiuParaIdw ? '' : modeloEfetivo;
    // o backend devolve grid + bounds + stats + png; só usamos grid/bounds/stats.
    // O domínio e os stops vão só pra colorir o PNG do backend (ignorado aqui).
    const { dominio, stops } = rampaDaLegenda(leg);
    const resp = await interpolar({
      pontos: pts, poligono: poligono!, dominio, stops, metodo: metodoUsado, pixelM,
      modeloFixo: modeloUsado || null,
      // Krigagem fixa: manda o variograma pronto — o backend usa estes números
      // direto, sem auto-ajuste e sem a guarda anti-degeneração. Na queda para
      // IDW não vai variograma nenhum, senão o backend recusa o par.
      variogramaManual: caiuParaIdw ? null : varFixoNum,
      signal: abortRef.current?.signal,
    });
    const labels = fcLabels(pts, nut);
    const interpoladoEm = new Date().toISOString();
    // Sessão guarda o PNG do backend como fallback (~10-30 KB). Quem economiza é a nuvem.
    setCache(c => ({ ...c, [ck(nut, prof)]: { resp, labels, interpoladoEm } }));
    if (nav.talhaoId && importacaoId) {
      // Com grid: descarta o PNG (colorimos local a partir do grid, gzipado p/
      // caber no limite de tamanho por registro da nuvem). SEM grid (backend antigo que
      // não devolve grid): MANTÉM o PNG do backend como fallback — senão o mapa
      // não renderiza (era a causa de "interpolado mas não aparece").
      const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
      let dados: { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm: string } =
        { resp: { ...resp, png: gridGz ? '' : (resp.png ?? ''), grid: gridGz }, labels, interpoladoEm };
      // Salvaguarda de tamanho: se estourar mesmo com gzip, tenta manter só o PNG
      // (ainda renderiza); se nem assim couber, salva só metadados.
      if (JSON.stringify(dados).length > 950_000) {
        const soPng = { resp: { ...resp, grid: undefined }, labels, interpoladoEm }; // mantém resp.png
        dados = JSON.stringify(soPng).length <= 950_000
          ? soPng
          : { resp: { ...resp, png: '', grid: undefined }, labels, interpoladoEm };
        console.warn(`[fertilidade] mapa grande p/ a nuvem — salvando ${dados.resp.png ? 'só PNG' : 'só metadados'} de ${nut} ${prof}.`);
      }
      cloudSalvarMapa(idNuvem(nav.talhaoId, importacaoId, chaveUsada, pixelM, modeloUsado, nut, prof), dados);
    }
    enfileirar20m(nut, prof);
    return caiuParaIdw ? `${leg.simbolo} ${prof} (${pts.length} pts)` : null;
  }

  // ── Mapa de 20 m para a Recomendação ──────────────────────────────────────
  // A dose sai sempre em 20 m (PDF e arquivo de máquina), então interpolamos de
  // verdade nos nós de 20 m — mesma superfície, amostrada mais grossa.
  //
  // Ele vai para uma GAVETA PRÓPRIA da nuvem (`dose20__…`), NUNCA para o prefixo
  // dos mapas de fertilidade. Guardá-lo lá junto custou duas regressões em dois
  // dias (zonas em escadinha, e a estatística do relatório saindo do mapa grosso):
  // todo leitor daquele prefixo desempata por "o mais recente vence", e o auxiliar
  // é sempre o mais recente. Aqui ninguém o enxerga por engano.
  async function processar20m(nut: string, prof: string) {
    const leg = legendaDe(nut);
    if (!leg || !nav.talhaoId || !importacaoId) return;
    const pts = pontosDe(nut, prof);
    if (pts.length < MIN_PTS_MAPA) return;
    // MESMA decisão do mapa fino. Se divergir, a camada com poucos pontos sai
    // por IDW na tela e falha aqui ("nao convergiu") — a Recomendação fica sem
    // mapa de 20 m justamente na profundidade que o usuário viu desenhada.
    const { metodo: metodoUsado, caiuParaIdw } = interpoladorEfetivo(metodo, pts.length);
    const chaveUsada = caiuParaIdw ? 'idw' : metodoChave;
    const modeloUsado = caiuParaIdw ? '' : modeloEfetivo;
    const { dominio, stops } = rampaDaLegenda(leg);
    const resp = await interpolar({
      pontos: pts, poligono: poligono!, dominio, stops, metodo: metodoUsado, pixelM: PIXEL_RECOMENDACAO,
      modeloFixo: modeloUsado || null,
      variogramaManual: caiuParaIdw ? null : varFixoNum,
      // A malha cobre 100% do talhão: sem isto sobrava até um pixel (20 m) sem
      // dose em toda a divisa. Cada pixel de borda leva o valor que a krigagem
      // calculou para aquele nó — nada é preenchido. O corte exato pelo contorno
      // é feito no fim, na hora de desenhar e de exportar.
      cobrirPoligono: true,
      signal: abortRef.current?.signal,
    });
    const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
    // Sem labels e sem PNG: este mapa nunca é desenhado, só entra na conta.
    cloudSalvarMapa(
      idDose20(nav.talhaoId, importacaoId, chaveUsada, modeloUsado, nut, prof),
      { resp: { ...resp, png: '', grid: gridGz }, labels: fcVazio(), interpoladoEm: new Date().toISOString() },
    );
  }

  // Fila SEQUENCIAL e em segundo plano: o backend é de um worker só, então disparar
  // tudo junto faria o lote de 20 m disputar CPU com o que o usuário está esperando.
  function enfileirar20m(nut: string, prof: string) {
    if (pixelM === PIXEL_RECOMENDACAO) return;   // o mapa fino JÁ é o da recomendação
    if (!cloudPodeGravar()) return;              // sem login não há onde salvar
    const chave = ck(nut, prof);
    if (!fila20.current.includes(chave)) fila20.current.push(chave);
    void rodarFila20();
  }

  async function rodarFila20() {
    if (rodando20.current) return;
    rodando20.current = true;
    try {
      while (fila20.current.length > 0) {
        if (abortRef.current?.signal.aborted) break;
        const chave = fila20.current[0];
        const [nut, prof] = chave.split('__');
        try {
          await processar20m(nut, prof);
          setPendente20(p => p.filter(x => x !== chave));
        } catch (e) {
          if (ehAbort(e)) break;   // deixa na fila: a próxima chamada retoma
          // Falhar aqui não desfaz nada: o mapa fino já está pronto e a Recomendação
          // ainda funciona pelo caminho antigo (reamostragem), só com menos amplitude.
          console.warn('[fertilidade] mapa de 20 m da recomendação falhou:', nut, prof, e);
          setPendente20(p => (p.includes(chave) ? p : [...p, chave]));
        }
        fila20.current.shift();
      }
    } finally { rodando20.current = false; }
  }

  async function processar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (!nutriente) { setErro('Selecione uma variável.'); setEstado('erro'); return; }
    if (!alcanceFixoOk) { setErro('Krigagem fixa: informe um Alcance maior que zero (m).'); setEstado('erro'); return; }
    abortRef.current?.abort();               // cancela um processamento anterior em voo
    abortRef.current = new AbortController();
    setEstado('processando'); setErro(''); setQuedasIdw([]);
    try {
      const queda = await processarUm(nutriente, profundidade);
      setQuedasIdw(queda ? [queda] : []);
      setEstado('pronto');
    }
    catch (e) {
      if (ehAbort(e)) return;                 // cancelado pelo usuário: não é erro
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao processar.');
    }
  }

  async function processarTodos() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (nutrientes.length === 0) return;
    if (!alcanceFixoOk) { setErro('Krigagem fixa: informe um Alcance maior que zero (m).'); setEstado('erro'); return; }
    abortRef.current?.abort();               // cancela um processamento anterior em voo
    abortRef.current = new AbortController();
    setEstado('processando'); setErro(''); setQuedasIdw([]);
    const total = nutrientes.length * profsAll.length;
    const falhas: string[] = [];
    const quedas: string[] = [];
    // motivo → variáveis que caíram nele. Listar 16 nomes soltos não ajuda ninguém;
    // agrupado, o usuário lê "todas as de 20-40 estão sem valor no laudo" e sabe o
    // que fazer.
    const porMotivo = new Map<string, string[]>();
    let backendOff = false;
    let cancelado = false;
    let i = 0;
    for (const prof of profsAll) {
      for (const nut of nutrientes) {
        i++;
        const sim = legendaDe(nut)?.simbolo ?? nut;
        setProgresso({ atual: i, total, nome: `${sim} ${prof}` });
        try { const q = await processarUm(nut, prof); if (q) quedas.push(q); }
        catch (e) {
          if (ehAbort(e)) { cancelado = true; break; }   // usuário abandonou: para tudo, sem erro
          if (ehBackendFora(e)) { backendOff = true; break; }
          falhas.push(`${sim} ${prof}`);
          const msg = e instanceof Error ? e.message : String(e);
          // a mensagem vem como "SIMBOLO PROF: motivo" — guarda só o motivo
          const motivo = msg.slice(msg.indexOf(':') + 1).trim() || 'falha ao interpolar';
          porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), `${sim} ${prof}`]);
        }
      }
      if (backendOff || cancelado) break;
    }
    setProgresso(null);
    setQuedasIdw(quedas);
    if (cancelado) return;
    if (backendOff) {
      setEstado('erro');
      setErro(msgBackendFora());
    } else {
      setEstado(falhas.length === total ? 'erro' : 'pronto');
      setErro(falhas.length
        ? [...porMotivo.entries()]
            .map(([motivo, quais]) => `Não processou (${motivo}): ${quais.join(', ')}.`)
            .join(' ')
        : '');
    }
  }

  function limpar() {
    setCache({}); setEstado('idle'); setErro(''); setQuedasIdw([]);
    if (nav.talhaoId && importacaoId) {
      // Prefixo largo — apaga TODOS os mapas deste talhão+importação (qualquer config)
      // e também os auxiliares de 20 m da Recomendação, que vivem em gaveta própria.
      cloudExcluirMapasPorPrefixo(`${nav.talhaoId}__${importacaoId}__`);
      cloudExcluirMapasPorPrefixo(prefixoDose20(nav.talhaoId, importacaoId));
    }
  }

  // A caixa ESTATÍSTICAS do PDF fala das ANÁLISES — os mesmos números impressos
  // nos pontos do mapa. A regra antiga ("nunca dos pontos", sempre o raster) não
  // fechava: a krigagem alisa e o mapa não alcança os extremos amostrados. Ver
  // src/lib/estatisticaMapa.ts.
  function pixelsDoGrid(resp: RespInterp): Float32Array | null {
    if (!temGrid(resp)) return null;
    try { return decodeGrid(resp.grid).valores; } catch { return null; }
  }

  // Gera o PDF "Layout Oficial Fertilidade V1" do atributo atual (todas as
  // profundidades já processadas, lado a lado).
  async function gerarPDF() {
    if (!legAtual || !nutriente) return;
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    const profs: ProfundidadeRel[] = [];
    for (const prof of profsAll) {
      const m = cache[ck(nutriente, prof)];
      if (!m) continue;
      const url = temGrid(m.resp) ? colorirGridComLegenda(m.resp.grid, legAtual).dataUrl : m.resp.png;
      if (!url) continue;
      // RÓTULOS FRESCOS, os MESMOS da tela (ver o efeito de :503). `m.labels` foi
      // congelado na hora da interpolação; corrigir um valor no laudo sem
      // reprocessar deixava o PDF desta aba com o número velho. Isso era invisível
      // enquanto a caixa vinha do raster — agora ela conta os rótulos, e um rótulo
      // velho aqui faria este PDF discordar do BOOK, que recalcula.
      // Mapa POR ZONA: valor no centroide de cada zona + as DIVISAS como linhas
      // (capturarMapaFertilidade desenha).
      let valores: GeoJSON.FeatureCollection;
      if (m.resp.stats?.modelo === 'zona' && zonas.length) {
        const zl = fcLabelsZona(nutriente, prof);
        const base = zl.features.length ? zl.features : (m.labels?.features ?? []);
        valores = { type: 'FeatureCollection', features: [...base, ...divisasDasZonas(zonas)] };
      } else {
        const pts = pontosDe(nutriente, prof);
        valores = pts.length ? fcLabels(pts, nutriente) : m.labels;
      }
      // LAUDO ALTERADO DEPOIS DO MAPA (desmembrar/fundir): as amostras de hoje não
      // são as que geraram este raster — que segue pintando a faixa antiga. A caixa
      // então descreve o RASTER; falar das amostras seria prometer um mínimo/máximo
      // que os pixels desenhados não cumprem. É o mesmo estado que a tela avisa em
      // `mapasAnterioresAoLimite`.
      const marca = importacao?.limiteAlteradoEm;
      const laudoMudouDepois = !!marca && (m.interpoladoEm ?? '') < marca;
      const st = estatisticaDaPagina({
        rotulos: laudoMudouDepois ? null : valores,
        grid: pixelsDoGrid(m.resp), servidor: m.resp.stats,
      });
      if (!st) continue;
      profs.push({ profundidade: prof, rasterPng: url, bounds: m.resp.bounds, valores, stats: st });
    }
    if (profs.length === 0) {
      console.warn('[relatorio] sem mapas elegíveis. nutriente=', nutriente, 'profsAll=', profsAll,
        'chaves no cache=', Object.keys(cache), 'temGrid/stats por prof=',
        profsAll.map(p => { const m = cache[ck(nutriente, p)]; return { p, existe: !!m, temGrid: m ? temGrid(m.resp) : false, rotulos: m?.labels?.features?.length ?? 0 }; }));
      // Distingue "não processou" de "processou, mas este navegador não consegue
      // ler o mapa salvo" (grid gravado comprimido + navegador sem
      // DecompressionStream). A mensagem antiga mandava fazer o que já foi feito.
      const haMapa = profsAll.some(p => !!cache[ck(nutriente, p)]);
      setErro(haMapa
        ? 'O mapa salvo não pôde ser lido neste navegador. Reprocesse o mapa (ou abra em um navegador atualizado).'
        : 'Processe o(s) mapa(s) antes de gerar o PDF.');
      setEstado('erro'); return;
    }

    const cultura = nav.talhaoId ? getPlantio(nav.talhaoId, safraNome) : '';
    const ts = profsAll.map(p => cache[ck(nutriente, p)]?.interpoladoEm).filter(Boolean).sort().pop()
      ?? importacao?.criadoEm ?? new Date().toISOString();
    const dataInterp = new Date(ts).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });

    setGerandoPdf(true); setErro('');
    try {
      // Município SEMPRE: cadastro → cache local → Nominatim (com timeout).
      const local = await municipioDaFazenda(nav.fazendaId, pontoDoPoligono(poligono));
      await gerarRelatorioFertilidade({
        fazenda: nav.fazenda, produtor: nav.produtor, talhao: nav.talhao, safra: safraNome,
        cultura, areaHa: nav.area, municipio: local.municipio, estado: local.estado,
        // só para o nome do arquivo (SA03_FERT_2026_EP01_SATCA)
        siglaFazenda: getFazendas().find(f => f.id === nav.fazendaId)?.sigla ?? null,
        ano: importacao?.ano ?? null, epoca: importacao?.epoca ?? null,
        atributo: legAtual.atributo, simbolo: legAtual.simbolo, metodo: legAtual.metodo ?? null,
        // FONTE = o LABORATÓRIO do laudo (o laudo ganha sempre); a fonte da
        // legenda é só reserva para mapa sem importação por trás.
        // FONTE é SOMENTE o laboratório que fez a análise (decisão do usuário).
        // Sem laboratório no laudo sai "—": a fonte da legenda diria "Fundação
        // ABC" mesmo num laudo da Interpartner, que é justamente o erro corrigido.
        fonte: nomeLaboratorioDoLaudo(importacao) || '—',
        unidade: legAtual.unidade, legenda: legAtual,
        dataInterpolacao: dataInterp, poligono, profundidades: profs, satelite: true, corLimite: '#ffffff',
      });
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  }

  if (!safraNome) return <div className="px-6 py-4"><Aviso texto="Defina um Ano para gerar o mapa de fertilidade." /></div>;
  if (importacoes.length === 0) return <div className="px-6 py-4"><Aviso texto="Importe resultados de laboratório (seção acima) — o mapa de fertilidade é gerado a partir deles." /></div>;

  const processando = estado === 'processando';
  const podeProcessar = pode('fertilidade');
  const podeRel = pode('relatorios');
  const mapasSalvos = Object.keys(cache).length;
  // Etapa 3: os mapas em tela são de uma importação mais antiga que a disponível
  // → podem estar desatualizados (o usuário reimportou laudo depois).
  const desatualizado = !!(
    importacao && mapasSalvos > 0 && importacaoMaisRecente &&
    importacaoMaisRecente.id !== importacao.id &&
    (importacaoMaisRecente.criadoEm ?? '') > (importacao.criadoEm ?? '')
  );
  const stats = (nutriente && profundidade) ? cache[ck(nutriente, profundidade)]?.resp.stats : undefined;
  const totalMapas = nutrientes.length * profsAll.length;
  const feitosNaProf = nutrientes.filter(n => {
    const l = legendaDe(n);
    return l && cache[ck(n, profundidade)];
  }).length;

  // legendas disponíveis pro atributo atual (pra o dropdown)
  const legendasDoAtributo = nutriente ? getLegendasPorAtributo(nutriente) : [];

  return (
    <div className="px-4 py-3 space-y-3">
      {!cloudPodeGravar() && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>
            <strong>Você não está logado</strong> — os mapas interpolados <strong>não estão sendo salvos</strong> e precisam ser reprocessados ao reabrir. Faça login para que as interpolações fiquem salvas na nuvem.
          </p>
        </div>
      )}

      {/* Importação */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Importação (laboratório / campanha)</label>
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione a importação…</option>
          {importacoes.map(i => <option key={i.id} value={i.id}>{i.laboratorio}{i.campanha ? ` · ${i.campanha}` : ''} · {i.resultados.length} amostras</option>)}
        </select>

        {/* Laboratório do laudo — é ELE que sai na coluna FONTE do relatório.
            Editável aqui de propósito: laudo importado em modo automático sem
            nome ficava gravado como "Novo laboratório" e ia impresso assim. */}
        {importacao && (
          <div className="mt-2">
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>
              Laboratório (sai como FONTE no relatório)
            </label>
            <select
              value={importacao.laboratorioId ?? ''}
              onChange={e => {
                if (!e.target.value) return;
                definirLaboratorioLab(importacao.id, e.target.value);
                setImportacoes(getImportacoesLab(nav.talhaoId!, safraNome));
              }}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}
            >
              {!importacao.laboratorioId && (
                <option value="">{importacao.laboratorio || '—'} (não cadastrado — escolha)</option>
              )}
              {laboratorios.map(l => (
                <option key={l.id} value={l.id}>
                  {l.nome}{fonteDoLaboratorio(l) !== l.nome ? ` → FONTE: ${fonteDoLaboratorio(l)}` : ''}
                </option>
              ))}
            </select>
            {laboratorios.length === 0 && (
              <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>
                Nenhum laboratório cadastrado — cadastre em Biblioteca → Laboratórios.
              </p>
            )}
          </div>
        )}
        {mapasSalvos > 0 && (
          cloudPodeGravar() ? (
            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#86efac' }}>
              <Layers size={10} /> {mapasSalvos} {mapasSalvos === 1 ? 'mapa salvo' : 'mapas salvos'} na nuvem — carregam sem reprocessar.
            </p>
          ) : (
            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#fbbf24' }}>
              <Layers size={10} /> {mapasSalvos} {mapasSalvos === 1 ? 'mapa' : 'mapas'} nesta sessão — <strong>não salvos</strong> (faça login).
            </p>
          )
        )}
      </div>

      {/* Modo zona (Z1): mapa constante por zona — vínculo zona ↔ nº da amostra. */}
      {ehZona && (
        <div className="rounded-lg p-2.5" style={{ background: '#0b1f3a', border: '1px solid #2e5fa3' }}>
          <p className="text-[11px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#93c5fd' }}>
            <Layers size={12} /> Mapa por zona (sem interpolação)
          </p>
          <p className="text-[10px] mb-2" style={{ color: '#64748b' }}>
            Cada zona recebe o valor da sua amostra composta. Confira o vínculo zona ↔ nº da amostra (sugerido pela ordem).
          </p>
          <div className="space-y-1">
            {zonas.map(z => (
              <div key={z.id} className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: 30 }}>Z{z.id}</span>
                <span className="text-[10px] flex-1 truncate" style={{ color: '#93c5fd' }}>{z.classe || '—'}</span>
                <span className="text-[10px]" style={{ color: '#64748b' }}>amostra</span>
                <select value={mapaZonaNumero[z.id] ?? ''} onChange={e => setMapaZonaNumero(prev => ({ ...prev, [z.id]: Number(e.target.value) }))}
                  className="rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                  {[...new Set((importacao?.resultados ?? []).map(r => r.numero))].sort((a, b) => a - b)
                    .map(nu => <option key={nu} value={nu}>{nu}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desatualizado (Etapa 3): existe importação mais recente que a destes mapas. */}
      {desatualizado && importacaoMaisRecente && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>
              Estes mapas são de uma importação anterior. Há uma mais recente
              {importacaoMaisRecente.campanha ? ` (${importacaoMaisRecente.campanha})` : ''} — podem estar desatualizados.
            </p>
            <button onClick={() => setImportacaoId(importacaoMaisRecente.id)}
              className="mt-1 px-2 py-1 rounded text-[10px] font-bold text-white"
              style={{ background: 'var(--invicta-blue-mid)' }}>
              Ir para a mais recente e regenerar
            </button>
          </div>
        </div>
      )}

      {/* Perfil agronômico — preset opcional (Biblioteca > Perfis). */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Perfil (preenche legendas)</label>
        <div className="flex gap-1">
          <select value={perfilId} onChange={e => aplicarPerfil(e.target.value)}
            className="flex-1 rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
            <option value="">— Manual (sem perfil)</option>
            {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <button onClick={salvarComoPerfil} disabled={!importacao}
            title="Salvar escolhas atuais como Perfil"
            className="px-2 py-1.5 rounded text-[10px] font-bold flex items-center gap-1 disabled:opacity-40"
            style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
            <Save size={11} /> Salvar
          </button>
        </div>
      </div>

      {importacao && (
        <>
          {/* MODO DO MAPA — só aparece quando o talhão tem zonas de manejo:
              Interpolação (ferramentas de sempre) × Processar em zona (cada
              zona recebe o valor do SEU ponto de amostragem, sem interpolar). */}
          {zonas.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Modo do mapa</label>
              <div className="flex gap-1">
                {([['interpolar', 'Interpolação'], ['zona', 'Processar em zona']] as const).map(([m, rot]) => (
                  <button key={m} onClick={() => setModoEscolhido(m)}
                    className="flex-1 py-1.5 rounded text-[10px] font-bold"
                    style={{ background: modoMapa === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modoMapa === m ? '#fff' : '#93c5fd' }}>
                    {rot}
                  </button>
                ))}
              </div>
              <p className="text-[9px] mt-1 leading-relaxed" style={{ color: '#475569' }}>
                {modoMapa === 'zona'
                  ? 'Sem interpolação: cada zona é preenchida com o valor do ponto de amostragem que cai dentro dela (vínculo editável abaixo), na escala de cores da legenda.'
                  : 'Krigagem/IDW nos pontos da grade — as ferramentas de interpolação ficam liberadas abaixo.'}
              </p>
            </div>
          )}

          {/* Configurações da interpolação (recolhível) — não valem no modo zona */}
          {!ehZona && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
            <button onClick={() => setCfgAberto(v => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: '#061525', color: '#93c5fd' }}>
              <span className="flex items-center gap-1"><Settings size={12} /> Configurações da interpolação</span>
              <span style={{ color: '#64748b' }}>
                {interpolador === 'idw' ? 'IDW'
                  : interpolador === 'krige-fixo' ? `Krigagem fixa · ${varFixo.alcance}/${varFixo.patamar}/${varFixo.pepita}`
                    : `Krigagem · ${modeloFixo || 'auto'}`} · {pixelM} m {cfgAberto ? '▴' : '▾'}
              </span>
            </button>
            {cfgAberto && (
              <div className="px-2.5 py-2 space-y-2" style={{ background: '#061525' }}>
                <div>
                  <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Interpolador</label>
                  {/* 3 botões numa fileira só: text-[9px] + nowrap p/ "Krigagem fixa"
                      não quebrar em duas linhas quando o painel é estreitado. */}
                  <div className="flex gap-1">
                    {([['krige', 'Krigagem'], ['krige-fixo', 'Krigagem fixa'], ['idw', 'IDW']] as const).map(([mt, rotulo]) => (
                      <button key={mt} onClick={() => setInterpolador(mt)} className="flex-1 py-1 rounded text-[9px] font-bold whitespace-nowrap"
                        style={{ background: interpolador === mt ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: interpolador === mt ? '#fff' : '#64748b' }}>
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Pixel</label>
                    <select value={pixelM} onChange={e => setPixelM(Number(e.target.value))} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                      {[2, 2.5, 3, 5, 10, 20].map(p => <option key={p} value={p}>{p} × {p} m{p === 5 ? ' (padrão)' : ''}</option>)}
                    </select>
                  </div>
                  {interpolador !== 'idw' && (
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Variograma</label>
                      {/* No modo fixo não existe auto-ajuste: "Auto (melhor)" sairia
                          esférico calado e o resumo do cabeçalho mentiria. */}
                      {interpolador === 'krige-fixo' ? (
                        <select value={modeloFixa} onChange={e => setModeloFixa(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                          <option value="spherical">Esférico</option>
                          <option value="exponential">Exponencial</option>
                          <option value="gaussian">Gaussiano</option>
                        </select>
                      ) : (
                        <select value={modeloFixo} onChange={e => setModeloFixo(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                          <option value="">Auto (melhor)</option>
                          <option value="spherical">Esférico</option>
                          <option value="exponential">Exponencial</option>
                          <option value="gaussian">Gaussiano</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>

                {/* Krigagem fixa: o trio do variograma, já preenchido e editável. */}
                {interpolador === 'krige-fixo' && (
                  <div className="space-y-1.5 pt-2" style={{ borderTop: '1px solid #0f2240' }}>
                    <div className="grid grid-cols-3 gap-1.5">
                      <CampoVar label="Alcance (m)" v={varFixo.alcance} on={s => setVarFixo(k => ({ ...k, alcance: s }))} ph="400" />
                      <CampoVar label="Patamar" v={varFixo.patamar} on={s => setVarFixo(k => ({ ...k, patamar: s }))} ph="300" />
                      <CampoVar label="Pepita" v={varFixo.pepita} on={s => setVarFixo(k => ({ ...k, pepita: s }))} ph="10" />
                    </div>
                    {!alcanceFixoOk && <p className="text-[9px]" style={{ color: '#f87171' }}>Informe um Alcance maior que zero — sem ele a krigagem fixa não roda.</p>}
                    {avisoPepita && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Pepita ≥ patamar: o servidor limita a pepita a 99% do patamar e o mapa sai liso.</p>}
                    <button onClick={() => setVarFixo({ ...VARIOGRAMA_FIXO_PADRAO })} className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: '#fbbf24' }}>
                      <RotateCcw size={10} /> Restaurar padrões (400 / 300 / 10)
                    </button>
                    <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
                      Os números vão ao servidor como estão: <strong>sem auto-ajuste</strong> e <strong>sem a proteção contra variograma degenerado</strong>. Por isso este modo também não tem RMSE de validação cruzada.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Processar */}
          {!poligono && <Aviso texto="Limite do talhão não carregado no mapa." />}
          {!podeProcessar ? (
            <Aviso texto="Seu papel não processa mapas de fertilidade (somente visualização)." />
          ) : (<>
            <button onClick={processarTodos} disabled={processando || !poligono || nutrientes.length === 0}
              className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
              style={{ background: (processando || !poligono || nutrientes.length === 0) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: (!poligono || nutrientes.length === 0) ? 0.6 : 1 }}>
              {processando && progresso
                ? <><Loader2 size={13} className="animate-spin" /> {progresso.nome} ({progresso.atual}/{progresso.total})</>
                : <><Layers size={13} /> Processar tudo ({totalMapas} mapas)</>}
            </button>
            <button onClick={processar} disabled={processando || !poligono || !nutriente}
              className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
              style={{ background: '#1a3a6b', color: '#93c5fd', opacity: (processando || !poligono || !nutriente) ? 0.6 : 1 }}>
              <Play size={10} /> Processar só o selecionado
            </button>
          </>)}

          {aquecendo && (
            <p className="text-[10px] flex items-center gap-1" style={{ color: '#fbbf24' }}>
              <Loader2 size={11} className="animate-spin" /> Aquecendo o servidor de processamento… (pode levar até ~1 min na 1ª vez)
            </p>
          )}
          {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
          {erro && estado !== 'erro' && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{erro}</p>}
          {quedasIdw.length > 0 && (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>
              Poucas amostras para krigar em {quedasIdw.join(', ')} — {quedasIdw.length === 1 ? 'esse mapa saiu' : 'esses mapas saíram'} por <b>IDW</b>. A krigagem precisa de {MIN_PTS_KRIGE} pontos para ajustar o variograma; abaixo disso ela não converge. As demais variáveis e profundidades continuam no interpolador escolhido.
            </p>
          )}
          {pendente20.length > 0 && (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>
              Mapa de 20 m da Recomendação pendente em {pendente20.length} {pendente20.length === 1 ? 'variável' : 'variáveis'} — a dose ainda sai, mas por reamostragem (extremos mais fracos). Processe de novo quando puder.
            </p>
          )}

          {/* Profundidade */}
          {profundidades.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Profundidade</label>
              <div className="flex gap-1">
                {profundidades.map(p => (
                  <button key={p} onClick={() => setProfundidade(p)} className="flex-1 py-1 rounded text-[10px] font-bold"
                    style={{ background: profundidade === p ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: profundidade === p ? '#fff' : '#64748b' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variáveis */}
          {nutrientes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma variável desta importação tem legenda cadastrada.</p>
          ) : (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Variável no mapa {feitosNaProf > 0 && <span style={{ color: '#475569' }}>· {feitosNaProf}/{nutrientes.length} prontos</span>}
              </label>
              <div className="flex flex-wrap gap-1">
                {nutrientes.map(id => {
                  const sel = id === nutriente;
                  const l = legendaDe(id);
                  const feito = l && !!cache[ck(id, profundidade)];
                  return (
                    <button key={id} onClick={() => setNutriente(id)} className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#64748b') }}>
                      {l?.simbolo ?? id}{feito ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
              {semLegenda.length > 0 && (
                <p className="text-[10px] mt-1 leading-relaxed" style={{ color: '#fbbf24' }}>
                  ⚠ {semLegenda.length === 1 ? 'Esta variável veio no laudo mas não tem legenda' : 'Estas variáveis vieram no laudo mas não têm legenda'}
                  {' '}cadastrada, então {semLegenda.length === 1 ? 'não aparece' : 'não aparecem'} acima:
                  {' '}<strong style={{ color: '#fcd34d' }}>{semLegenda.join(', ')}</strong>.
                  {' '}Crie a legenda em Biblioteca → Legendas (mesma sigla) e {semLegenda.length === 1 ? 'ela entra' : 'elas entram'} na lista.
                </p>
              )}
              <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
                {ehZona
                  ? <><strong style={{ color: '#86efac' }}>{zonas.length}</strong> zonas</>
                  : <><strong style={{ color: pontosInterp.length >= 3 ? '#86efac' : '#fbbf24' }}>{pontosInterp.length}</strong> pontos</>}
                {legAtual ? ` · ${legAtual.atributo} (${legAtual.unidade})` : ''}
              </p>
              {diagCasamento?.modo === 'ordem' && (
                <p className="text-[10px] mt-0.5" style={{ color: '#fbbf24' }}>
                  ⚠ Casando por ORDEM: os números do laudo ({diagCasamento.amostras} amostras) não batem com os da grade ({diagCasamento.nPontos} pontos). Confira a numeração na aba Amostragem.
                </p>
              )}
              {diagCasamento?.modo === 'nenhum' && diagCasamento.amostras > 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: '#f87171' }}>
                  ⚠ As {diagCasamento.amostras} amostras não casaram com a grade ({diagCasamento.nPontos} pontos). Salve/associe a grade certa na aba Amostragem (mesmo Ano) e reimporte.
                </p>
              )}
              {mapasAnterioresAoLimite > 0 && (
                <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: '#fbbf24' }}>
                  ⚠ O LIMITE DO TALHÃO MUDOU depois {mapasAnterioresAoLimite === 1 ? 'deste mapa' : `de ${mapasAnterioresAoLimite} destes mapas`} —
                  {' '}uma área foi separada ou excluída. {mapasAnterioresAoLimite === 1 ? 'Ele foi interpolado' : 'Eles foram interpolados'} com o
                  {' '}contorno antigo e ainda {mapasAnterioresAoLimite === 1 ? 'pinta' : 'pintam'} o que saiu. Reprocesse para o mapa valer o limite de hoje.
                </p>
              )}
              {partesVazias.length > 0 && (
                <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: '#fbbf24' }}>
                  ⚠ {partesVazias.length === 1 ? 'Uma área separada deste talhão está' : `${partesVazias.length} áreas separadas deste talhão estão`}
                  {' '}SEM AMOSTRA no laudo (pontos {partesVazias.map(p => p.semAmostra.join(', ')).join(' · ')}).
                  {' '}O mapa vai pintar {partesVazias.length === 1 ? 'essa área' : 'essas áreas'} de uma cor só — é a MÉDIA das outras
                  {' '}amostras, não medição. Peça {partesVazias.length === 1 ? 'essa análise' : 'essas análises'} ao laboratório e reimporte.
                </p>
              )}
            </div>
          )}

          {/* Seletor de Legenda para o atributo atual */}
          {nutriente && legendasDoAtributo.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-1 flex items-center gap-1" style={{ color: '#64748b' }}>
                <BookOpen size={11} /> Legenda
              </label>
              <select
                value={legAtual?.id ?? ''}
                onChange={e => setLegendaIdPorAtributo(m => ({ ...m, [nutriente]: e.target.value }))}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}
              >
                {legendasDoAtributo.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.nome}{l.metodo ? ` · ${l.metodo}` : ''}
                  </option>
                ))}
              </select>
              {legendasDoAtributo.length === 1 && (
                <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>Cadastre outras fontes em Configurações → Legendas (em breve).</p>
              )}
            </div>
          )}

          {/* Mapa exibido: detalhes + barra de legenda */}
          {stats && legAtual && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: stats.modelo === 'idw' ? '#93c5fd' : '#86efac' }}>
                  <Activity size={12} />
                  {stats.modelo === 'zona' ? `Por zona · ${stats.n} px`
                    : stats.modelo === 'idw' ? `IDW · ${stats.n} pts`
                      : `Krigagem${stats.variograma?.manual ? ' fixa' : ''} · ${stats.modelo} · ${stats.n} pts`}
                </div>
                <button onClick={limpar} title="Limpar mapas" className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
                  <Eraser size={11} /> Limpar
                </button>
              </div>

              <div className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
                pixel <strong style={{ color: '#94a3b8' }}>{stats.pixel_m} m</strong> · grade {stats.nx}×{stats.ny}
                {stats.variograma && <> · alcance <strong style={{ color: '#94a3b8' }}>{stats.variograma.alcance_m} m</strong> · patamar {fmt(stats.variograma.patamar)} · pepita {fmt(stats.variograma.pepita)}{stats.variograma.manual && <strong style={{ color: '#fbbf24' }}> · fixo</strong>}</>}
                {stats.rmse != null && <> · RMSE {stats.rmse}</>}
              </div>

              {/* Barra de legenda (largura visual por classe, conforme spec) */}
              <BarraLegenda leg={legAtual} />
              <p className="text-[9px]" style={{ color: '#64748b' }}>{legAtual.fonte} · {legAtual.atributo}{legAtual.metodo ? ` (${legAtual.metodo})` : ''} · {legAtual.unidade}</p>

              {/* Gerar PDF (Layout Oficial Fertilidade V1 — todas as profundidades do atributo) */}
              {podeRel && <button onClick={gerarPDF} disabled={gerandoPdf}
                className="w-full mt-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'var(--invicta-blue-mid)' }}>
                {gerandoPdf ? <><Loader2 size={13} className="animate-spin" /> Gerando PDF…</> : <><FileDown size={13} /> Gerar PDF (Fertilidade)</>}
              </button>}
            </div>
          )}

          {/* Debug temporário — ajuda a diagnosticar discrepâncias entre valor e cor */}
          {legAtual && cache[ck(nutriente, profundidade)] && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
              <button onClick={() => setDebugAberto(v => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: '#061525', color: '#fbbf24' }}>
                <span>🔬 Debug — valores vs cores</span>
                <span>{debugAberto ? '▴' : '▾'}</span>
              </button>
              {debugAberto && (
                <DebugBox leg={legAtual} resp={cache[ck(nutriente, profundidade)].resp} pontos={pontosInterp} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Barra horizontal com as classes (faixas de cor com largura visual fixa) +
// rótulos das bordas (limites) abaixo de cada divisão.
function BarraLegenda({ leg }: { leg: Legenda }) {
  return (
    <div>
      <div className="relative h-4 rounded overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(leg) }}
        title={leg.classes.map(c => `${c.nome}${c.valorMin != null ? ` · >${c.valorMin}` : ''}${c.valorMax != null ? ` · ≤${c.valorMax}` : ''}`).join('  |  ')} />
      <div className="relative h-3 text-[8px]" style={{ color: '#cbd5e1' }}>
        {(() => {
          let acumulado = 0;
          const bordas: Array<{ valor: number; pos: number }> = [];
          for (let i = 0; i < leg.classes.length - 1; i++) {
            acumulado += leg.classes[i].larguraVisual;
            const b = leg.classes[i].valorMax;
            if (b != null) bordas.push({ valor: b, pos: acumulado });
          }
          return bordas.map(b => (
            <span key={b.valor} className="absolute" style={{ left: `${b.pos}%`, transform: 'translateX(-50%)' }}>{fmt(b.valor)}</span>
          ));
        })()}
      </div>
    </div>
  );
}

// ============================================================
// DEBUG — ajuda a diagnosticar discrepâncias entre valor e cor
// ============================================================
function DebugBox({ leg, resp, pontos }: { leg: Legenda; resp: RespInterp; pontos: Array<{ lng: number; lat: number; valor: number }> }) {
  const { dominio, stops } = stopsParaBackend(leg);
  const [vmin, vmax] = dominio;
  let stats: { rows: number; cols: number; min: number; max: number; media: number; n: number } | null = null;
  if (resp.grid) {
    try {
      const { valores, rows, cols } = decodeGrid(resp.grid);
      let n = 0, soma = 0, vmin2 = Infinity, vmax2 = -Infinity;
      for (let i = 0; i < valores.length; i++) {
        const v = valores[i];
        if (!isFinite(v)) continue;
        n++; soma += v;
        if (v < vmin2) vmin2 = v;
        if (v > vmax2) vmax2 = v;
      }
      stats = { rows, cols, min: vmin2, max: vmax2, media: soma / Math.max(1, n), n };
    } catch (e) { console.warn('debug decode falhou:', e); }
  }

  // Pra cada ponto: qual cor o pipeline mapearia
  function corDoValor(v: number): string {
    const span = (vmax - vmin) || 1;
    const t = Math.max(0, Math.min(1, (v - vmin) / span));
    // mesma lógica do interpolarCor mas em hex
    if (t <= stops[0][0]) return rgbHex(stops[0][1]);
    if (t >= stops[stops.length - 1][0]) return rgbHex(stops[stops.length - 1][1]);
    let i = 0;
    while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    const k = (t - t0) / (t1 - t0 || 1);
    return rgbHex([
      Math.round(c0[0] + (c1[0] - c0[0]) * k),
      Math.round(c0[1] + (c1[1] - c0[1]) * k),
      Math.round(c0[2] + (c1[2] - c0[2]) * k),
    ]);
  }

  return (
    <div className="px-2.5 py-2 space-y-2 text-[10px]" style={{ background: '#061525', color: '#cbd5e1' }}>
      <div>
        <strong style={{ color: '#fbbf24' }}>Legenda:</strong> {leg.nome} · invertida={String(leg.invertida)} · estilo={leg.estilo ?? 'segmentado'}
      </div>
      <div>
        <strong style={{ color: '#fbbf24' }}>Domínio:</strong> [{fmt(vmin)} , {fmt(vmax)}] · span={fmt(vmax - vmin)}
      </div>
      <div>
        <strong style={{ color: '#fbbf24' }}>Stops ({stops.length}):</strong>
        <div className="space-y-0.5 mt-1">
          {stops.map(([t, [r, g, b]], i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span style={{ display: 'inline-block', width: 18, height: 10, background: `rgb(${r},${g},${b})`, border: '1px solid rgba(255,255,255,0.15)' }} />
              <span style={{ color: '#94a3b8' }}>t={t.toFixed(4)}</span>
              <span style={{ color: '#475569' }}>·</span>
              <span style={{ color: '#cbd5e1' }}>{rgbHex([r, g, b])}</span>
            </div>
          ))}
        </div>
      </div>
      {stats && (
        <div>
          <strong style={{ color: '#fbbf24' }}>Grid bruto ({stats.rows}×{stats.cols}, {stats.n} pixels válidos):</strong>
          <div>min={fmt(stats.min)} · max={fmt(stats.max)} · média={fmt(stats.media)}</div>
        </div>
      )}
      {!resp.grid && <div style={{ color: '#f87171' }}>⚠ Sem grid (mapa legacy — reprocesse para diagnóstico completo).</div>}
      <div>
        <strong style={{ color: '#fbbf24' }}>Pontos amostrais ({pontos.length}):</strong>
        <div className="space-y-0.5 mt-1 max-h-44 overflow-y-auto">
          {pontos.slice().sort((a, b) => a.valor - b.valor).map((p, i) => {
            const cor = corDoValor(p.valor);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span style={{ display: 'inline-block', width: 18, height: 10, background: cor, border: '1px solid rgba(255,255,255,0.15)' }} />
                <span style={{ color: '#94a3b8' }}>V={fmt(p.valor)}</span>
                <span style={{ color: '#475569' }}>·</span>
                <span style={{ color: '#cbd5e1' }}>{cor}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={() => {
        // log tudo no console pra inspeção
        // eslint-disable-next-line no-console
        console.log('[fertilidade/debug]', { leg, dominio, stops, stats, primeirosValores: resp.grid ? Array.from(decodeGrid(resp.grid).valores.slice(0, 20)) : null });
      }} className="w-full py-1 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
        Logar no console (F12)
      </button>
    </div>
  );
}

function rgbHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}

// Campo numérico do variograma fixo. Texto puro (não `type="number"`) p/ aceitar
// vazio enquanto se digita e a vírgula decimal do pt-BR.
function CampoVar({ label, v, on, ph }: { label: string; v: string; on: (s: string) => void; ph: string }) {
  return (
    <div>
      <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>{label}</label>
      <input value={v} onChange={e => on(e.target.value)} placeholder={ph} inputMode="decimal"
        className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
    </div>
  );
}
