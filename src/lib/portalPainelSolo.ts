// Portal do Produtor v2 — os NÚMEROS das páginas do SOLO: Fertilidade,
// Nutrientes, Zonas de manejo, Prescrições (VR) e Compactação.
//
// Módulo PURO (sem DOM, sem store, sem nuvem), como lib/portalPainel.ts — que é
// a base: aqui só entram as contas que as páginas por tema precisam e a Visão
// geral não faz (resumo de UM atributo com talhão a talhão, evolução pareada,
// zonas por talhão, doses e totais de prescrição, perfil de compactação por
// camada). Nada inventa número: sem dado, devolve null/vazio e a tela mostra o
// estado vazio honesto.
//
// Teste: `node scripts/teste-portal-solo.mjs`.
// Extensão .ts explícita nos imports: o teste roda em node (type-stripping).

import { anoDoRegistro, evolucaoNutrientes, fmtDataCurta, type LaudoIn } from './portalProdutor.ts';
import { classeDoValor, corCheiaDaClasse, type ClasseLegenda } from './legendas.ts';
import {
  mediaPonderada, variacaoPct, ultimoLaudo, mediasDoLaudo, classesCriticas, distribuirEmClasses, resumoZonas,
  type DadosPainel, type Distribuicao,
} from './portalPainel.ts';
import { resumoDoses, fatorBaseDose } from './prescricao/calculo.ts';
import { totalDoArquivo, temCompensacao } from './prescricao/resumo.ts';
import { UNIDADE_TOTAL, type Prescricao } from './prescricao/tipos.ts';

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const areaDe = (d: DadosPainel) => (finito(d.talhao.areaHa) ? d.talhao.areaHa : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (parte: number, total: number) => (total > 0 ? r1((parte / total) * 100) : 0);
const profNum = (s: string): number => { const m = /(\d+)/.exec(s ?? ''); return m ? Number(m[1]) : 0; };
const nomeClasse = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// ═══════════════════════════════════════════════════════════════════════════
// FERTILIDADE
// ═══════════════════════════════════════════════════════════════════════════

/** Atributos do seletor da página (ids do laudo), na ordem que o produtor pede. */
export const ATRIBUTOS_SOLO: Array<{ id: string; rotulo: string; casas: number }> = [
  { id: 'p', rotulo: 'P', casas: 1 },
  { id: 'k', rotulo: 'K', casas: 2 },
  { id: 'v', rotulo: 'V%', casas: 0 },
  { id: 'ph', rotulo: 'pH', casas: 1 },
  { id: 'mo', rotulo: 'MO', casas: 1 },
  { id: 'ca', rotulo: 'Ca', casas: 1 },
  { id: 'mg', rotulo: 'Mg', casas: 1 },
];

/** Limite do nível crítico = o topo da última classe crítica (a régua do ledger
 *  Q12: "Muito baixo" + "Baixo" da legenda da Biblioteca). Acima dele o atributo
 *  está fora do crítico — é a "Referência" da tabela de atributos. null para
 *  legenda invertida ou sem limite superior nas classes críticas. */
export function limiteCritico(classes: ClasseLegenda[], invertida = false): number | null {
  const crit = classesCriticas(classes, invertida);
  if (!crit) return null;
  const topos = classes.filter(c => crit.has(c.nome) && finito(c.valorMax)).map(c => c.valorMax as number);
  return topos.length ? Math.max(...topos) : null;
}

export interface LinhaFert {
  talhaoId: string; nome: string; areaHa: number;
  valor: number | null;
  classe: string | null; cor: string | null;
  /** null quando não dá para dizer (sem valor, sem legenda ou legenda invertida). */
  critico: boolean | null;
  anoAnalise: number | null;
  profundidade: string | null;
  nAmostras: number;
  /** A análise é antiga (3 anos ou mais antes da safra do filtro). */
  antiga: boolean;
  /** Variação contra a análise anterior do próprio talhão (mesma camada). */
  anterior: { ano: number; valor: number; delta: number } | null;
}

export interface ResumoAtributo {
  linhas: LinhaFert[];
  /** Média ponderada pela área entre os talhões com valor. */
  media: number | null;
  classeMedia: { nome: string; cor: string } | null;
  nComValor: number;
  areaComValor: number;
  areaTotal: number;
  nCriticos: number;
  areaCritica: number;
  /** % da área TOTAL dos talhões no filtro (a mesma base dos alertas da Visão geral). */
  pctCritica: number;
  nAntigos: number;
  areaAntigos: number;
  anos: [number, number] | null;
  dist: Distribuicao;
  /** Δ% da média ponderada, só entre os talhões com 2+ análises (última × anterior). */
  deltaMedia: { atual: number; anterior: number; pct: number | null; n: number } | null;
  limite: number | null;
}

/** Pontos (por ano) de UM atributo de UM talhão, só com laudos até `ano`. */
export function pontosAteAno(d: DadosPainel, atributo: string, ano: number | null): Array<{ ano: number; valor: number }> {
  const laudos = (d.laudos ?? []).filter(l => ano == null || (anoDoRegistro(l) ?? 0) <= ano) as LaudoIn[];
  const e = evolucaoNutrientes(laudos, [atributo]);
  return e.pontos.flatMap(p => (finito(p.valores[atributo]) ? [{ ano: p.ano, valor: p.valores[atributo] as number }] : []));
}

/** Tudo da página de Fertilidade para UM atributo: o valor da última análise de
 *  cada talhão (camada mais rasa), a classe na legenda da Biblioteca, quem está
 *  abaixo do crítico, o que é análise antiga e como a média mudou. */
export function resumoAtributo(dados: DadosPainel[], ano: number | null, atributo: string, classes: ClasseLegenda[], invertida = false): ResumoAtributo {
  const crit = classesCriticas(classes, invertida);
  const areaTotal = dados.reduce((s, d) => s + areaDe(d), 0);
  const linhas: LinhaFert[] = dados.map(d => {
    const l = ultimoLaudo(d.laudos, ano);
    const m = l ? mediasDoLaudo(l, [atributo]) : null;
    const valor = m?.valores[atributo] ?? null;
    const c = finito(valor) ? classeDoValor(valor, classes) : undefined;
    const anoAn = l ? anoDoRegistro(l) : null;
    const pts = pontosAteAno(d, atributo, ano);
    const ant = pts.length >= 2 ? pts[pts.length - 2] : null;
    const ult = pts.length ? pts[pts.length - 1] : null;
    return {
      talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d),
      valor: finito(valor) ? valor : null,
      classe: c?.nome ?? null, cor: c ? corCheiaDaClasse(c) : null,
      critico: crit && c ? crit.has(c.nome) : null,
      anoAnalise: anoAn, profundidade: m?.profundidade ?? null, nAmostras: m?.n ?? 0,
      antiga: ano != null && (anoAn == null || ano - anoAn >= 3),
      anterior: ant && ult && finito(valor) ? { ano: ant.ano, valor: ant.valor, delta: r2(valor - ant.valor) } : null,
    };
  });
  const com = linhas.filter(l => l.valor != null);
  const media = mediaPonderada(com.map(l => ({ valor: l.valor, peso: l.areaHa || 1 })));
  const cm = media != null ? classeDoValor(media, classes) : undefined;
  const criticos = linhas.filter(l => l.critico);
  const antigos = linhas.filter(l => l.antiga);
  const anosAn = linhas.map(l => l.anoAnalise).filter((a): a is number => a != null);

  // Variação pareada: só entram talhões com a última E a anterior análise.
  const pares = linhas.filter(l => l.anterior && l.valor != null);
  let deltaMedia: ResumoAtributo['deltaMedia'] = null;
  if (pares.length) {
    const atual = mediaPonderada(pares.map(l => ({ valor: l.valor, peso: l.areaHa || 1 })));
    const anterior = mediaPonderada(pares.map(l => ({ valor: l.anterior!.valor, peso: l.areaHa || 1 })));
    if (atual != null && anterior != null) deltaMedia = { atual: r2(atual), anterior: r2(anterior), pct: variacaoPct(r2(atual), r2(anterior)), n: pares.length };
  }

  return {
    linhas,
    media: media == null ? null : r2(media),
    classeMedia: cm ? { nome: cm.nome, cor: corCheiaDaClasse(cm) } : null,
    nComValor: com.length, areaComValor: r2(com.reduce((s, l) => s + l.areaHa, 0)), areaTotal: r2(areaTotal),
    nCriticos: criticos.length, areaCritica: r2(criticos.reduce((s, l) => s + l.areaHa, 0)),
    pctCritica: pct(criticos.reduce((s, l) => s + l.areaHa, 0), areaTotal),
    nAntigos: antigos.length, areaAntigos: r2(antigos.reduce((s, l) => s + l.areaHa, 0)),
    anos: anosAn.length ? [Math.min(...anosAn), Math.max(...anosAn)] : null,
    dist: distribuirEmClasses(linhas.map(l => ({ id: l.talhaoId, valor: l.valor, areaHa: l.areaHa })), classes),
    deltaMedia,
    limite: limiteCritico(classes, invertida),
  };
}

/** Evolução de UM atributo, ano a ano, até a safra do filtro: média ponderada
 *  pela área entre os talhões que tiveram análise naquele ano. */
export function evolucaoPonderada(dados: DadosPainel[], atributo: string, ano: number | null): Array<{ ano: number; valor: number; nTalhoes: number }> {
  const porAno = new Map<number, Array<{ valor: number; peso: number }>>();
  for (const d of dados) for (const p of pontosAteAno(d, atributo, ano)) {
    const l = porAno.get(p.ano) ?? [];
    l.push({ valor: p.valor, peso: areaDe(d) || 1 });
    porAno.set(p.ano, l);
  }
  return [...porAno.entries()].sort((a, b) => a[0] - b[0]).flatMap(([a, l]) => {
    const v = mediaPonderada(l);
    return v == null ? [] : [{ ano: a, valor: r2(v), nTalhoes: l.length }];
  });
}

/** Valores das amostras da camada mais rasa do último laudo do talhão — para a
 *  visão de UM talhão (distribuição das amostras nas classes, mín e máx). */
export function amostrasDoLaudo(l: LaudoIn | null, atributo: string): number[] {
  if (!l) return [];
  let prof: string | null = null;
  for (const r of l.resultados ?? []) if (prof == null || profNum(r.profundidade) < profNum(prof)) prof = r.profundidade;
  return (l.resultados ?? [])
    .filter(r => prof == null || profNum(r.profundidade) === profNum(prof))
    .map(r => r.valores?.[atributo])
    .filter(finito);
}

export interface DistribuicaoAmostras {
  n: number; min: number | null; max: number | null; media: number | null;
  classes: Array<{ nome: string; cor: string; n: number; pct: number }>;
}

/** Quantas AMOSTRAS caem em cada classe (não é área: é a leitura do laboratório). */
export function distribuirAmostras(valores: number[], classes: ClasseLegenda[]): DistribuicaoAmostras {
  const ord = [...classes].sort((a, b) => a.ordem - b.ordem);
  const cont = new Map<string, number>();
  let n = 0;
  for (const v of valores) {
    const c = classeDoValor(v, ord);
    if (!c) continue;
    n++;
    cont.set(c.nome, (cont.get(c.nome) ?? 0) + 1);
  }
  return {
    n: valores.length,
    min: valores.length ? Math.min(...valores) : null,
    max: valores.length ? Math.max(...valores) : null,
    media: valores.length ? r2(valores.reduce((s, v) => s + v, 0) / valores.length) : null,
    classes: ord.map(c => ({ nome: c.nome, cor: corCheiaDaClasse(c), n: cont.get(c.nome) ?? 0, pct: pct(cont.get(c.nome) ?? 0, n) })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NUTRIENTES (evolução ano a ano)
// ═══════════════════════════════════════════════════════════════════════════

export type Direcao = 'subiu' | 'caiu' | 'estavel' | 'sem-base';

/** Subiu/caiu/estável entre a primeira e a última análise do talhão. Estável =
 *  variação de até 5% do valor inicial (ruído de amostragem, não tendência). */
export function direcao(primeiro: number | null, ultimo: number | null, variacao: number | null, tolerancia = 0.05): Direcao {
  if (variacao == null || primeiro == null || ultimo == null) return 'sem-base';
  const lim = Math.abs(primeiro) * tolerancia;
  if (Math.abs(variacao) <= lim) return 'estavel';
  return variacao > 0 ? 'subiu' : 'caiu';
}

export function contarDirecoes(itens: Direcao[]): Record<Direcao, number> {
  const out: Record<Direcao, number> = { subiu: 0, caiu: 0, estavel: 0, 'sem-base': 0 };
  for (const d of itens) out[d]++;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONAS DE MANEJO
// ═══════════════════════════════════════════════════════════════════════════

export interface ParteZona { chave: string; rotulo: string; cor: string; ha: number; pct: number }
export interface ZonasDoTalhao {
  talhaoId: string; nome: string; areaHa: number;
  areaZonas: number;
  nZonas: number;
  partes: ParteZona[];
  /** A zona de maior área do talhão. */
  dominante: ParteZona | null;
  /** Prescrições vigentes do talhão no ano (para o link "Ver prescrição"). */
  nPrescricoes: number;
}

/** Potencial da zona pelo nome da classe (Alta → alto…); null se a classe é numerada. */
export function potencialDaZona(chave: string): string | null {
  const m: Record<string, string> = { 'Alta': 'alto', 'Média-alta': 'médio-alto', 'Média': 'médio', 'Média-baixa': 'médio-baixo', 'Baixa': 'baixo' };
  return m[chave] ?? null;
}

/** As zonas de cada talhão com a MESMA chave/cor do resumo geral (zona "Alta" tem
 *  a mesma cor no mapa, na legenda e na barra do talhão). */
export function zonasPorTalhao(dados: DadosPainel[], ano: number | null): { geral: ParteZona[]; areaGeral: number; talhoes: ZonasDoTalhao[] } {
  const g = resumoZonas(dados);
  const corDe = new Map(g.zonas.map(z => [z.chave, z]));
  const talhoes: ZonasDoTalhao[] = dados.map(d => {
    const r = resumoZonas([d]);
    const partes: ParteZona[] = r.zonas.map(z => ({ chave: z.chave, rotulo: corDe.get(z.chave)?.rotulo ?? z.rotulo, cor: corDe.get(z.chave)?.cor ?? z.cor, ha: z.ha, pct: z.pct }));
    const dom = [...partes].sort((a, b) => b.ha - a.ha)[0] ?? null;
    return {
      talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d), areaZonas: r.areaTotal,
      nZonas: partes.length, partes, dominante: dom,
      nPrescricoes: prescricoesVigentes(d, ano).length,
    };
  });
  return { geral: g.zonas.map(z => ({ chave: z.chave, rotulo: z.rotulo, cor: z.cor, ha: z.ha, pct: z.pct })), areaGeral: g.areaTotal, talhoes };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESCRIÇÕES (VR)
// ═══════════════════════════════════════════════════════════════════════════

/** As prescrições vigentes do talhão no ano. Cada prescrição tem VERSÕES (registros
 *  que apontam para a V1 por `origemId`): vale a de maior versão. A que a Lavra
 *  retirou da programação não vale mais. Mesmo critério de ano de kpisPainel
 *  (sem ano gravado, entra em qualquer safra). */
export function prescricoesVigentes(d: DadosPainel, ano: number | null): Prescricao[] {
  const todas = (d.prescricoes ?? []) as unknown as Prescricao[];
  const doAno = todas.filter(p => !p.ano || ano == null || anoDoRegistro({ safra: p.ano }) === ano);
  const porCadeia = new Map<string, Prescricao>();
  for (const p of doAno) {
    const k = p.origemId ?? p.id;
    const atual = porCadeia.get(k);
    if (!atual || (p.versao ?? 1) > (atual.versao ?? 1)
      || ((p.versao ?? 1) === (atual.versao ?? 1) && (p.atualizadoEm ?? '') > (atual.atualizadoEm ?? ''))) porCadeia.set(k, p);
  }
  return [...porCadeia.values()]
    .filter(p => !p.origemLavra?.removida)
    .sort((a, b) => (b.atualizadoEm ?? '').localeCompare(a.atualizadoEm ?? ''));
}

export interface ResumoPresc {
  id: string;
  talhaoId: string; talhaoNome: string;
  nome: string; produto: string; unidade: string; unidadeTotal: string;
  tipo: string;
  versao: number;
  ano: string | null;
  atualizadoEm: string;
  areaHa: number;
  nZonas: number;
  /** Dose média ponderada pela área, na unidade da dose. */
  doseMedia: number | null;
  doseMin: number | null;
  doseMax: number | null;
  /** Quanto produto o arquivo consome (já com a compensação de germinação). null se faltar o espaçamento. */
  total: number | null;
  comAjusteGerminacao: boolean;
  exportes: Array<{ formato: string; arquivo: string; em: string }>;
  daLavra: boolean;
  zonas: Array<{ idZona: string; nomeZona: string; areaHa: number; dose: number }>;
}

/** Chave do produto para agrupar (e nunca misturar unidades). */
export const chaveProduto = (p: { produto?: string; unidade?: string }) => `${nomeClasse(p.produto ?? '')}|${p.unidade ?? ''}`;

export function resumirPrescricao(p: Prescricao, talhaoNome: string): ResumoPresc {
  const zonas = (p.zonas ?? []).filter(z => finito(z.areaHa) && z.areaHa > 0 && finito(z.dose));
  const r = resumoDoses(zonas.map(z => ({ areaHa: z.areaHa, dose: z.dose })), undefined, 1);
  let total: number | null = null;
  try { total = zonas.length ? r2(totalDoArquivo({ ...p, zonas } as Prescricao, fatorBaseDose(p.unidade, p.params?.sementes?.espacamentoM))) : null; } catch { total = null; }
  return {
    id: p.id, talhaoId: p.talhaoId, talhaoNome,
    nome: p.nome, produto: p.produto ?? '', unidade: p.unidade, unidadeTotal: UNIDADE_TOTAL[p.unidade] ?? '',
    tipo: p.tipo, versao: p.versao ?? 1, ano: p.ano ?? null, atualizadoEm: p.atualizadoEm,
    areaHa: r2(r.areaHa), nZonas: zonas.length,
    doseMedia: zonas.length ? r2(r.doseMedia) : null,
    doseMin: zonas.length ? r.doseMin : null, doseMax: zonas.length ? r.doseMax : null,
    total,
    comAjusteGerminacao: temCompensacao(p),
    exportes: (p.exportes ?? []).map(e => ({ formato: e.formato, arquivo: e.arquivo, em: e.em })),
    daLavra: !!p.origemLavra,
    zonas: zonas.map(z => ({ idZona: z.idZona, nomeZona: z.nomeZona, areaHa: z.areaHa, dose: z.dose })),
  };
}

export interface ProdutoPresc { chave: string; produto: string; unidade: string; unidadeTotal: string; nPresc: number; nTalhoes: number; areaHa: number; total: number | null }

/** Produtos prescritos (um por produto+unidade), do de maior área ao de menor. */
export function produtosPrescritos(lista: ResumoPresc[]): ProdutoPresc[] {
  const m = new Map<string, ProdutoPresc & { _t: Set<string>; _tot: number; _semTotal: boolean }>();
  for (const r of lista) {
    const k = chaveProduto(r);
    const e = m.get(k) ?? { chave: k, produto: r.produto || r.nome, unidade: r.unidade, unidadeTotal: r.unidadeTotal, nPresc: 0, nTalhoes: 0, areaHa: 0, total: null, _t: new Set<string>(), _tot: 0, _semTotal: false };
    e.nPresc++; e.areaHa += r.areaHa; e._t.add(r.talhaoId);
    if (r.total == null) e._semTotal = true; else e._tot += r.total;
    m.set(k, e);
  }
  return [...m.values()].map(e => ({ chave: e.chave, produto: e.produto, unidade: e.unidade, unidadeTotal: e.unidadeTotal, nPresc: e.nPresc, nTalhoes: e._t.size, areaHa: r2(e.areaHa), total: e._semTotal ? null : r2(e._tot) }))
    .sort((a, b) => b.areaHa - a.areaHa);
}

/** Rampa das doses: clara (menor dose) → escura (maior dose). Funciona nos dois temas. */
export const RAMPA_DOSE = ['#d9f0a3', '#addd8e', '#78c679', '#31a354', '#006837'];

export interface FaixaDose { idx: number; rotulo: string; min: number; max: number; cor: string }
export interface EscalaDose {
  faixas: FaixaDose[];
  faixaDe: (dose: number) => number;
  corDe: (dose: number) => string;
}

const corNaRampa = (i: number, n: number) => RAMPA_DOSE[n <= 1 ? RAMPA_DOSE.length - 1 : Math.round((i / (n - 1)) * (RAMPA_DOSE.length - 1))];

/** Escala das doses de UM produto. Prescrição em taxa variável costuma ter poucas
 *  doses distintas — com até 6 delas, cada dose é uma faixa (a legenda mostra a
 *  dose exata); com mais, 5 faixas de igual largura entre a menor e a maior. */
export function escalaDeDoses(doses: number[]): EscalaDose {
  const vs = doses.filter(finito);
  if (!vs.length) return { faixas: [], faixaDe: () => -1, corDe: () => RAMPA_DOSE[0] };
  const unicas = [...new Set(vs.map(v => r2(v)))].sort((a, b) => a - b);
  let faixas: FaixaDose[];
  let faixaDe: (d: number) => number;
  if (unicas.length <= 6) {
    faixas = unicas.map((v, i) => ({ idx: i, rotulo: String(v), min: v, max: v, cor: corNaRampa(i, unicas.length) }));
    faixaDe = d => unicas.indexOf(r2(d));
  } else {
    const min = unicas[0], max = unicas[unicas.length - 1], larg = (max - min) / 5;
    faixas = Array.from({ length: 5 }, (_, i) => ({ idx: i, rotulo: '', min: r2(min + larg * i), max: r2(i === 4 ? max : min + larg * (i + 1)), cor: corNaRampa(i, 5) }));
    faixaDe = d => Math.max(0, Math.min(4, Math.floor(((d - min) / (max - min || 1)) * 5)));
  }
  return { faixas, faixaDe, corDe: d => { const i = faixaDe(d); return i < 0 ? RAMPA_DOSE[0] : faixas[i].cor; } };
}

export interface DistribuicaoDoses { faixas: Array<FaixaDose & { ha: number; pct: number; n: number }>; areaTotal: number }

/** Área em cada faixa de dose, somando as zonas das prescrições (ha e %). */
export function distribuirDoses(lista: ResumoPresc[], escala: EscalaDose): DistribuicaoDoses {
  const ha = escala.faixas.map(() => 0), n = escala.faixas.map(() => 0);
  let tot = 0;
  for (const r of lista) for (const z of r.zonas) {
    const i = escala.faixaDe(z.dose);
    if (i < 0) continue;
    ha[i] += z.areaHa; n[i]++; tot += z.areaHa;
  }
  return { faixas: escala.faixas.map((f, i) => ({ ...f, ha: r2(ha[i]), n: n[i], pct: pct(ha[i], tot) })), areaTotal: r2(tot) };
}

/** Dose média ponderada de um conjunto de prescrições do MESMO produto/unidade. */
export function doseMediaDoConjunto(lista: ResumoPresc[]): number | null {
  return mediaPonderada(lista.map(r => ({ valor: r.doseMedia, peso: r.areaHa })));
}

/** Resumo dos arquivos gerados: formato → quantidade e o mais recente. */
export function resumoExportes(lista: ResumoPresc[]): Array<{ formato: string; n: number; ultimo: string | null }> {
  const m = new Map<string, { n: number; ultimo: string | null }>();
  for (const r of lista) for (const e of r.exportes) {
    const x = m.get(e.formato) ?? { n: 0, ultimo: null };
    x.n++;
    if (!x.ultimo || e.em > x.ultimo) x.ultimo = e.em;
    m.set(e.formato, x);
  }
  return [...m.entries()].map(([formato, x]) => ({ formato, ...x })).sort((a, b) => b.n - a.n);
}

/** "SHP · 12/10/26" — rótulo de um arquivo gerado. */
export const rotuloExporte = (e: { formato: string; em: string }) => `${e.formato.toUpperCase()} · ${fmtDataCurta(e.em)}`;

// ═══════════════════════════════════════════════════════════════════════════
// COMPACTAÇÃO (penetrometria, MPa por camada)
// ═══════════════════════════════════════════════════════════════════════════

/** Forma mínima da importação de penetrometria (registro do store). */
export interface ImportacaoCompIn {
  id: string; nome?: string; profundidades: string[];
  pontos: Array<{ valores: Record<string, number> }>;
  ano?: number; safra?: string; dataReferencia?: string; criadoEm: string;
}

/** Classes que contam como "camada crítica": as mais ALTAS da legenda de
 *  compactação — "Alto" e "Muito alto" pelo nome (> 2,0 MPa na legenda oficial);
 *  se os nomes forem outros, as duas últimas pela `ordem`. */
export function classesCriticasCompactacao(classes: ClasseLegenda[]): Set<string> | null {
  if (!classes.length) return null;
  const ord = [...classes].sort((a, b) => a.ordem - b.ordem);
  const porNome = ord.filter(c => /^(muito )?alt[oa]$/.test(nomeClasse(c.nome)));
  return new Set((porNome.length ? porNome : ord.slice(-2)).map(c => c.nome));
}

/** Início da faixa crítica (MPa): acima deste valor a camada é crítica. */
export function limiteCompactacao(classes: ClasseLegenda[]): number | null {
  const crit = classesCriticasCompactacao(classes);
  if (!crit) return null;
  const mins = classes.filter(c => crit.has(c.nome) && finito(c.valorMin)).map(c => c.valorMin as number);
  return mins.length ? Math.min(...mins) : null;
}

export interface CamadaMedida { prof: string; n: number; media: number; min: number; max: number; pctCritico: number; critica: boolean; classe: string | null; cor: string | null }
export interface MedicaoComp {
  talhaoId: string; nome: string; areaHa: number;
  importacaoId: string; levantamento: string;
  ano: number | null; data: string | null;
  nPontos: number;
  camadas: CamadaMedida[];
  /** Camadas cuja MÉDIA cai em classe crítica. */
  criticas: string[];
  /** A camada de maior resistência média. */
  pior: CamadaMedida | null;
}

/** A medição do talhão: a importação mais recente até o ano do filtro, com média,
 *  mínimo, máximo e % de pontos críticos por camada. null sem penetrometria. */
export function medicaoDoTalhao(d: DadosPainel, ano: number | null, classes: ClasseLegenda[]): MedicaoComp | null {
  const lista = ((d.compactacao ?? []) as unknown as ImportacaoCompIn[])
    .filter(i => Array.isArray(i.pontos) && i.pontos.length > 0 && (i.profundidades?.length ?? 0) > 0 && (ano == null || (anoDoRegistro(i) ?? 0) <= ano))
    .sort((a, b) => ((anoDoRegistro(b) ?? 0) - (anoDoRegistro(a) ?? 0)) || (b.dataReferencia ?? b.criadoEm ?? '').localeCompare(a.dataReferencia ?? a.criadoEm ?? ''));
  const imp = lista[0];
  if (!imp) return null;
  const crit = classesCriticasCompactacao(classes);
  const ord = [...classes].sort((a, b) => a.ordem - b.ordem);
  const camadas: CamadaMedida[] = [];
  for (const prof of [...imp.profundidades].sort((a, b) => profNum(a) - profNum(b))) {
    const vs = imp.pontos.map(p => p.valores?.[prof]).filter(finito);
    if (!vs.length) continue;
    const media = vs.reduce((s, v) => s + v, 0) / vs.length;
    const cMedia = classeDoValor(media, ord);
    const nCrit = crit ? vs.filter(v => { const c = classeDoValor(v, ord); return !!c && crit.has(c.nome); }).length : 0;
    camadas.push({
      prof, n: vs.length, media: r2(media), min: r2(Math.min(...vs)), max: r2(Math.max(...vs)),
      pctCritico: pct(nCrit, vs.length),
      critica: !!(crit && cMedia && crit.has(cMedia.nome)),
      classe: cMedia?.nome ?? null, cor: cMedia ? corCheiaDaClasse(cMedia) : null,
    });
  }
  if (!camadas.length) return null;
  return {
    talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d),
    importacaoId: imp.id, levantamento: imp.nome ?? '', ano: anoDoRegistro(imp), data: imp.dataReferencia ?? null,
    nPontos: imp.pontos.length, camadas,
    criticas: camadas.filter(c => c.critica).map(c => c.prof),
    pior: [...camadas].sort((a, b) => b.media - a.media)[0] ?? null,
  };
}

/** Camadas medidas em algum talhão, da mais rasa à mais funda. */
export function camadasDasMedicoes(ms: MedicaoComp[]): string[] {
  return [...new Set(ms.flatMap(m => m.camadas.map(c => c.prof)))].sort((a, b) => profNum(a) - profNum(b));
}

export interface PerfilCamada { prof: string; nTalhoes: number; media: number; min: number; max: number; pctCritico: number; critica: boolean; classe: string | null; cor: string | null }

/** Perfil por camada do conjunto: média ponderada pela área, extremos entre os
 *  pontos de todos os talhões e % de pontos críticos (ponderado pelo nº de pontos). */
export function perfilPorCamada(ms: MedicaoComp[], classes: ClasseLegenda[]): PerfilCamada[] {
  const crit = classesCriticasCompactacao(classes);
  const ord = [...classes].sort((a, b) => a.ordem - b.ordem);
  return camadasDasMedicoes(ms).map(prof => {
    const itens = ms.flatMap(m => { const c = m.camadas.find(x => x.prof === prof); return c ? [{ m, c }] : []; });
    const media = mediaPonderada(itens.map(x => ({ valor: x.c.media, peso: x.m.areaHa || 1 }))) ?? 0;
    const nPts = itens.reduce((s, x) => s + x.c.n, 0);
    const pctCrit = nPts ? pct(itens.reduce((s, x) => s + (x.c.pctCritico / 100) * x.c.n, 0), nPts) : 0;
    const c = classeDoValor(media, ord);
    return {
      prof, nTalhoes: itens.length, media: r2(media),
      min: Math.min(...itens.map(x => x.c.min)), max: Math.max(...itens.map(x => x.c.max)),
      pctCritico: pctCrit,
      critica: !!(crit && c && crit.has(c.nome)),
      classe: c?.nome ?? null, cor: c ? corCheiaDaClasse(c) : null,
    };
  });
}

/** A camada com a maior resistência média (a que o produtor olha primeiro). */
export function camadaMaisResistente(perfil: PerfilCamada[]): PerfilCamada | null {
  return [...perfil].sort((a, b) => b.media - a.media)[0] ?? null;
}
