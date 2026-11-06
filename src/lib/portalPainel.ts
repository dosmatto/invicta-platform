// Portal do Produtor v2 — os NÚMEROS dos cartões (Visão geral, Talhões e as
// páginas por tema).
//
// Módulo PURO (sem DOM, sem store, sem nuvem), como lib/portalProdutor.ts:
// recebe as listas que o store e a listagem leve da nuvem devolvem e responde
// o que o produtor vê — KPIs, distribuição em classes com ha e %, alertas da
// "Minha propriedade em números", médias ponderadas de atributos, correlação
// entre talhões, séries de índice de vegetação — e projeta os polígonos para o
// mini-mapa (com a função de projeção exposta, para os rasters e as zonas
// caírem no MESMO quadro dos talhões).
//
// Nada aqui inventa número: sem dado, a função devolve null/vazio e a tela
// mostra o estado vazio honesto. Teste: `node scripts/teste-portal-painel.mjs`.
//
// Extensão .ts explícita nos imports: o teste roda em node (type-stripping).

import { anoDeData } from './periodo.ts';
import {
  anoDoRegistro, evolucaoNutrientes,
  type DadosTalhao, type ColheitaIn, type MdeIn, type CondutividadeIn, type PrescricaoIn, type MapaNuvemIn, type LaudoIn,
} from './portalProdutor.ts';
import { classeDoValor, corCheiaDaClasse, type ClasseLegenda } from './legendas.ts';
import { fmtKgHa, kgParaScCheio, type UnidadeProd } from './portalUnidade.ts';
import { classeZona, classeReconhecida, corZonaPorPosicao, ORDEM_CLASSES } from './zonas.ts';

// ── Entradas mais ricas que as do portalProdutor (mesmos registros do store) ─

export interface ColheitaPainel extends ColheitaIn {
  id?: string;
  dataReferencia?: string;
  stats: { mediaKgha: number; minKgha?: number; maxKgha?: number; cv?: number; areaHa?: number; producaoTotalKg?: number };
  bounds?: [number, number, number, number];
}
export interface MdePainel extends MdeIn {
  id?: string;
  stats?: { alt_min: number; alt_med: number; alt_max: number; amplitude: number; decl_media: number | null; decl_max: number | null };
}
export interface CondutividadePainel extends CondutividadeIn {
  id?: string;
  profundidades?: string[];
  profundidadeOficial?: string;
  pontos?: Array<{ valores: Record<string, number> }>;
}
export interface PrescricaoPainel extends PrescricaoIn {
  tipo?: string;
  unidade?: string;
  zonas?: Array<{ areaHa: number; dose: number }>;
}
export interface MapaNuvemPainel extends MapaNuvemIn {
  indice?: string | null;
  bounds?: [number, number, number, number] | null;
  stats?: { media?: number | null; min?: number | null; max?: number | null } | null;
  pctLimpo?: number | null;
}
/** Uma feição do espelho das zonas no cadastro (`talhao.zonasGeojson`). */
export interface ZonaFeicaoPainel { classe: string; areaHa: number; zona?: string | number | null; cor?: string | null }

export interface DadosPainel extends DadosTalhao {
  colheitas?: ColheitaPainel[];
  mdes?: MdePainel[];
  condutividade?: CondutividadePainel[];
  prescricoes?: PrescricaoPainel[];
  mapasNuvem?: MapaNuvemPainel[];
  /** Zonas do padrão vigente, lidas do cadastro (nunca de getZoneamentosMeap). */
  zonasFc?: ZonaFeicaoPainel[];
}

// ── Utilitários ─────────────────────────────────────────────────────────────

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const areaDe = (d: DadosTalhao) => (finito(d.talhao.areaHa) ? d.talhao.areaHa : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Cultura para COMPARAR: minúsculas, sem acento, sem espaço sobrando. */
export function normCultura(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
/** Cultura para MOSTRAR: "SOJA" / "soja" → "Soja". */
export function rotuloCultura(s: string | null | undefined): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Média ponderada; itens sem valor finito ou com peso ≤ 0 ficam de fora. */
export function mediaPonderada(itens: Array<{ valor: number | null | undefined; peso: number }>): number | null {
  let s = 0, p = 0;
  for (const it of itens) {
    if (!finito(it.valor) || !(it.peso > 0)) continue;
    s += it.valor * it.peso; p += it.peso;
  }
  return p > 0 ? s / p : null;
}

/** Variação percentual (atual vs. anterior); null sem base. */
export function variacaoPct(atual: number | null, anterior: number | null): number | null {
  if (!finito(atual) || !finito(anterior) || anterior === 0) return null;
  return r1(((atual - anterior) / anterior) * 100);
}

const pct = (parte: number, total: number) => (total > 0 ? r1((parte / total) * 100) : 0);

// ── Culturas e colheitas ────────────────────────────────────────────────────

/** A colheita do talhão no ano (e na cultura, se pedida): a OFICIAL; sem
 *  oficial, a mais recente. */
export function colheitaDoAno(d: DadosPainel, ano: number | null, cultura = ''): ColheitaPainel | null {
  if (ano == null) return null;
  const c = normCultura(cultura);
  const lista = (d.colheitas ?? [])
    .filter(x => anoDoRegistro(x) === ano && (!c || normCultura(x.cultura) === c) && finito(x.stats?.mediaKgha))
    .sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
  return lista.find(x => x.oficial) ?? lista[0] ?? null;
}

/** Culturas do ano (plantio cadastrado OU mapa de colheita), da de maior área
 *  para a menor. O rótulo é o da primeira grafia vista. */
export function culturasDoAno(dados: DadosPainel[], ano: number | null): string[] {
  const porNome = new Map<string, { rotulo: string; area: number }>();
  const somar = (nome: string, area: number) => {
    const k = normCultura(nome);
    if (!k) return;
    const e = porNome.get(k);
    if (e) e.area += area; else porNome.set(k, { rotulo: rotuloCultura(nome), area });
  };
  for (const d of dados) {
    const vistas = new Set<string>();
    if (d.cultura) { somar(d.cultura, areaDe(d)); vistas.add(normCultura(d.cultura)); }
    for (const c of d.colheitas ?? []) {
      if (ano != null && anoDoRegistro(c) !== ano) continue;
      const k = normCultura(c.cultura);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      somar(c.cultura, areaDe(d));
    }
  }
  return [...porNome.values()].sort((a, b) => b.area - a.area).map(x => x.rotulo);
}

/** O talhão "é" da cultura no ano: plantio cadastrado ou colheita dela. */
export function talhaoDaCultura(d: DadosPainel, ano: number | null, cultura: string): boolean {
  const c = normCultura(cultura);
  if (!c) return true;
  if (normCultura(d.cultura) === c) return true;
  return (d.colheitas ?? []).some(x => (ano == null || anoDoRegistro(x) === ano) && normCultura(x.cultura) === c);
}

// ── Cultura predominante (filtro Cultura = "Todas") ─────────────────────────
// REGRA: a colheita é escolhida por TALHÃO E POR CULTURA (o mapa oficial/recente
// de cada cultura do talhão no ano — soja de mar e milho safrinha de jul no mesmo
// talhão contam os dois). A predominante é a de MAIOR ÁREA COLHIDA somando os
// talhões (área do mapa; sem ela, a do talhão). KPI, mapa, Top 5, correlação,
// alertas e benchmark usam ela e dizem qual é; nunca se mistura cultura numa
// média (saca de soja + saca de milho não diz nada).
// No painel de UM talhão a predominante é HERDADA do escopo (fazenda/produtor,
// sem o filtro de talhão): se o talhão também colheu a predominante do escopo no
// ano, é ela — a mesma cultura com que ele aparece na visão de todos. Só quando
// ele não a tem vale a de maior área dele. Assim um empate (ou quase empate) de
// área entre a soja e o milho safrinha do mesmo talhão não decide nada.

/** Área colhida por cultura no ano, da maior para a menor (cada talhão entra
 *  uma vez por cultura). */
export function areaColhidaPorCultura(dados: DadosPainel[], ano: number | null): Array<{ cultura: string; area: number; n: number }> {
  if (ano == null) return [];
  const acc = new Map<string, { cultura: string; area: number; n: number }>();
  for (const d of dados) {
    const vistas = new Set<string>();
    for (const x of d.colheitas ?? []) {
      const k = normCultura(x.cultura);
      if (!k || vistas.has(k) || anoDoRegistro(x) !== ano) continue;
      const c = colheitaDoAno(d, ano, x.cultura);
      if (!c) continue;
      vistas.add(k);
      const peso = finito(c.stats.areaHa) && c.stats.areaHa > 0 ? c.stats.areaHa : areaDe(d);
      const e = acc.get(k) ?? { cultura: rotuloCultura(c.cultura), area: 0, n: 0 };
      e.area += peso; e.n++;
      acc.set(k, e);
    }
  }
  return [...acc.values()].sort((a, b) => b.area - a.area || a.cultura.localeCompare(b.cultura, 'pt-BR')).map(e => ({ ...e, area: r2(e.area) }));
}

/** A cultura de maior área colhida no ano ('' sem colheita). */
export function culturaPredominanteDoAno(dados: DadosPainel[], ano: number | null): string {
  return areaColhidaPorCultura(dados, ano)[0]?.cultura ?? '';
}

/** A cultura que os números usam: a do filtro; em "Todas", a predominante.
 *  `escopo` = os talhões da fazenda/produtor sem o filtro de talhão: com ele, a
 *  predominante do escopo vence se `dados` também a colheu no ano (regra acima). */
export function culturaEfetiva(dados: DadosPainel[], ano: number | null, cultura = '', escopo?: DadosPainel[]): string {
  if (cultura) return rotuloCultura(cultura);
  const proprias = areaColhidaPorCultura(dados, ano);
  if (escopo && proprias.length > 1) {
    const doEscopo = normCultura(culturaPredominanteDoAno(escopo, ano));
    const herdada = proprias.find(c => normCultura(c.cultura) === doEscopo);
    if (herdada) return herdada.cultura;
  }
  return proprias[0]?.cultura ?? '';
}

/** Tooltip do KPI de produtividade quando o ano teve mais de uma cultura: diz
 *  POR QUE é aquela (herdada da propriedade no painel de um talhão, ou a de
 *  maior área) e quais ficaram de fora. */
export function tituloCulturaPredominante(o: { cultura: string; outras: string[]; anoTxt: string; um: boolean; predominanteEscopo: string }): string {
  const fim = `${o.outras.join(', ')} — escolha a cultura no filtro para ver.`;
  if (o.um && normCultura(o.cultura) === normCultura(o.predominanteEscopo)) {
    return `Mesma cultura da visão de todos os talhões (a de maior área colhida na propriedade em ${o.anoTxt}). Também colhido neste talhão: ${fim}`;
  }
  return `Cultura de maior área colhida ${o.um ? 'no talhão ' : ''}em ${o.anoTxt}. Também colhido: ${fim}`;
}

/** Talhões SEM colheita da cultura no ano — sem contar quem colheu OUTRA
 *  cultura (ou tem outra no cadastro): esse não está "sem colheita", só não é
 *  daquela cultura. */
export function talhoesSemColheita(dados: DadosPainel[], ano: number | null, cultura: string): { n: number; ha: number; ids: string[]; outraCultura: string[] } {
  const c = normCultura(cultura);
  const ids: string[] = [], outra: string[] = [];
  let ha = 0;
  for (const d of dados) {
    if (colheitaDoAno(d, ano, cultura)) continue;
    const colheuOutra = (d.colheitas ?? []).some(x => anoDoRegistro(x) === ano && normCultura(x.cultura) && normCultura(x.cultura) !== c && finito(x.stats?.mediaKgha));
    const cadastroOutra = !!normCultura(d.cultura) && normCultura(d.cultura) !== c;
    if (c && (colheuOutra || cadastroOutra)) { outra.push(d.talhao.id); continue; }
    ids.push(d.talhao.id); ha += areaDe(d);
  }
  return { n: ids.length, ha: r2(ha), ids, outraCultura: outra };
}

export interface ProdTalhao {
  talhaoId: string; fazendaId: string; nome: string; areaHa: number; cultura: string;
  mediaScHa: number; minScHa: number | null; maxScHa: number | null; cv: number | null;
  /** Área usada como peso: a colhida do mapa; sem ela, a do talhão. */
  peso: number;
}

/** Produtividade de cada talhão no ano (mapa de colheita) NUMA cultura: a pedida
 *  ou, em branco, a predominante do ano (culturaEfetiva) — nunca mistura. */
export function produtividadePorTalhao(dados: DadosPainel[], ano: number | null, cultura = ''): ProdTalhao[] {
  const alvo = culturaEfetiva(dados, ano, cultura);
  if (!alvo) return [];
  const out: ProdTalhao[] = [];
  for (const d of dados) {
    const c = colheitaDoAno(d, ano, alvo);
    if (!c) continue;
    const s = c.stats;
    out.push({
      talhaoId: d.talhao.id, fazendaId: d.talhao.fazendaId, nome: d.talhao.nome, areaHa: areaDe(d),
      cultura: rotuloCultura(c.cultura),
      // Precisão cheia: arredonda só a tela (lib/portalUnidade).
      mediaScHa: kgParaScCheio(s.mediaKgha),
      minScHa: finito(s.minKgha) ? kgParaScCheio(s.minKgha) : null,
      maxScHa: finito(s.maxKgha) ? kgParaScCheio(s.maxKgha) : null,
      cv: finito(s.cv) ? s.cv : null,
      peso: finito(s.areaHa) && s.areaHa > 0 ? s.areaHa : areaDe(d),
    });
  }
  return out.sort((a, b) => b.mediaScHa - a.mediaScHa);
}

export interface KpiProdutividade {
  cultura: string;
  /** sc/ha, média ponderada pela área colhida. */
  media: number;
  n: number;
  anterior: number | null;
  deltaPct: number | null;
  /** Amplitude: entre os talhões (vários) ou dentro do mapa (um talhão). */
  min: number | null;
  max: number | null;
  dentroDoTalhao: boolean;
  /** Havia mais de uma cultura no ano e o KPI ficou com a predominante. */
  outrasCulturas: boolean;
  /** As OUTRAS culturas colhidas no ano (só com o filtro em "Todas"). */
  outras: string[];
}

/** Produtividade média ponderada do ano + variação contra o ano anterior (mesma
 *  cultura, mesmos talhões). Sem cultura no filtro, vale a predominante (regra
 *  acima): somar saca de soja com saca de milho não diz nada. `escopo`: ver
 *  culturaEfetiva (painel de um talhão herda a predominante da propriedade). */
export function kpiProdutividade(dados: DadosPainel[], ano: number | null, cultura = '', escopo?: DadosPainel[]): KpiProdutividade | null {
  if (ano == null) return null;
  const alvo = culturaEfetiva(dados, ano, cultura, escopo);
  const prods = produtividadePorTalhao(dados, ano, alvo);
  if (!prods.length) return null;
  const outras = cultura ? [] : areaColhidaPorCultura(dados, ano).map(c => c.cultura).filter(c => normCultura(c) !== normCultura(alvo));
  const media = mediaPonderada(prods.map(p => ({ valor: p.mediaScHa, peso: p.peso })));
  if (media == null) return null;
  const ant = produtividadePorTalhao(dados, ano - 1, alvo);
  const anterior = mediaPonderada(ant.map(p => ({ valor: p.mediaScHa, peso: p.peso })));
  const um = dados.length === 1 && prods.length === 1;
  const min = um ? prods[0].minScHa : Math.min(...prods.map(p => p.mediaScHa));
  const max = um ? prods[0].maxScHa : Math.max(...prods.map(p => p.mediaScHa));
  // Sem arredondar: a tela formata na unidade escolhida (3.500 kg/ha não vira 3.498).
  return {
    cultura: alvo, media, n: prods.length,
    anterior,
    deltaPct: variacaoPct(media, anterior),
    min: finito(min) ? min : null, max: finito(max) ? max : null,
    dentroDoTalhao: um, outrasCulturas: outras.length > 0, outras,
  };
}

/** Histórico da produtividade de UM talhão, ano a ano (mapa oficial/recente). */
export function historicoProdutividade(d: DadosPainel, cultura = ''): Array<{ ano: number; mediaScHa: number; cultura: string }> {
  const anos = new Set<number>();
  for (const c of d.colheitas ?? []) { const a = anoDoRegistro(c); if (a != null) anos.add(a); }
  const out: Array<{ ano: number; mediaScHa: number; cultura: string }> = [];
  for (const ano of [...anos].sort((a, b) => a - b)) {
    // Sem cultura: em cada ano, a de maior área colhida no talhão (cada barra diz qual).
    const c = colheitaDoAno(d, ano, cultura || culturaPredominanteDoAno([d], ano));
    if (c) out.push({ ano, mediaScHa: kgParaScCheio(c.stats.mediaKgha), cultura: rotuloCultura(c.cultura) });
  }
  return out;
}

// ── KPIs da linha do topo ───────────────────────────────────────────────────

export interface KpisPainel {
  nTalhoes: number;
  areaTotal: number;
  /** Talhões com ao menos uma camada espacial (zonas, relevo, CE, colheita, mapas da nuvem). */
  areaMapeada: number;
  nMapeados: number;
  areaZonas: number;
  nZonas: number;
  pctZonas: number;
  /** Talhões com prescrição no ano ou recomendação para uso (oficial). */
  areaRecomendacao: number;
  nRecomendacao: number;
  pctRecomendacao: number;
  produtividade: KpiProdutividade | null;
}

export function temCamadaEspacial(d: DadosPainel): boolean {
  if ((d.zonasFc?.length ?? 0) > 0) return true;
  if ((d.mdes?.length ?? 0) > 0 || (d.condutividade?.length ?? 0) > 0 || (d.colheitas?.length ?? 0) > 0) return true;
  return (d.mapasNuvem ?? []).some(m => m.id.split('__')[0] === d.talhao.id);
}

export function temRecomendacaoNoAno(d: DadosPainel, ano: number | null): boolean {
  const pres = (d.prescricoes ?? []).filter(p => !p.ano || ano == null || anoDoRegistro({ safra: p.ano }) === ano);
  if (pres.length) return true;
  return (d.cenarios ?? []).some(c => (ano == null || anoDoRegistro(c) === ano) && (c.oficial === true || c.oficial === 'true'));
}

export function kpisPainel(dados: DadosPainel[], ano: number | null, cultura = '', escopo?: DadosPainel[]): KpisPainel {
  const areaTotal = dados.reduce((s, d) => s + areaDe(d), 0);
  const mapeados = dados.filter(temCamadaEspacial);
  const comZonas = dados.filter(d => (d.zonasFc?.length ?? 0) > 0);
  const comRec = dados.filter(d => temRecomendacaoNoAno(d, ano));
  const soma = (l: DadosPainel[]) => l.reduce((s, d) => s + areaDe(d), 0);
  return {
    nTalhoes: dados.length,
    areaTotal: r2(areaTotal),
    areaMapeada: r2(soma(mapeados)), nMapeados: mapeados.length,
    areaZonas: r2(soma(comZonas)), nZonas: comZonas.length, pctZonas: pct(soma(comZonas), areaTotal),
    areaRecomendacao: r2(soma(comRec)), nRecomendacao: comRec.length, pctRecomendacao: pct(soma(comRec), areaTotal),
    produtividade: kpiProdutividade(dados, ano, cultura, escopo),
  };
}

// ── Distribuição em classes (ha e %) ────────────────────────────────────────

export interface ClasseDistribuida {
  nome: string; cor: string; ordem: number;
  valorMin: number | null; valorMax: number | null;
  ha: number; pct: number; n: number;
}
export interface Distribuicao {
  classes: ClasseDistribuida[];
  /** Talhões sem valor (ou fora de todas as classes). */
  semDado: { ha: number; n: number };
  /** Área dos talhões COM valor (base do %). */
  areaComDado: number;
  /** id do talhão → cor da classe (para o mini-mapa leve). */
  corPorId: Record<string, string>;
  classePorId: Record<string, string>;
}

/** Converte as faixas de uma legenda em kg/ha para sc/ha (÷ 60), SEM arredondar:
 *  os valores também chegam com precisão cheia, então 3.500 kg/ha cai em
 *  (…, 3.500] como na legenda original (arredondar só um dos lados trocava a classe). */
export function classesEmSacas(classes: ClasseLegenda[]): ClasseLegenda[] {
  const sc = (v: number | null) => (v == null ? null : kgParaScCheio(v));
  return classes.map(c => ({ ...c, valorMin: sc(c.valorMin), valorMax: sc(c.valorMax) }));
}

/** Cada talhão entra INTEIRO na classe do seu valor (média do talhão): é a
 *  distribuição que dá para fazer sem baixar raster. O % é sobre a área com dado. */
export function distribuirEmClasses(itens: Array<{ id: string; valor: number | null | undefined; areaHa: number }>, classes: ClasseLegenda[]): Distribuicao {
  const ord = [...classes].sort((a, b) => a.ordem - b.ordem);
  const acc = new Map<string, { ha: number; n: number }>();
  const corPorId: Record<string, string> = {};
  const classePorId: Record<string, string> = {};
  let semHa = 0, semN = 0, areaComDado = 0;
  for (const it of itens) {
    const a = finito(it.areaHa) ? it.areaHa : 0;
    const c = finito(it.valor) ? classeDoValor(it.valor, ord) : undefined;
    if (!c) { semHa += a; semN++; continue; }
    areaComDado += a;
    const e = acc.get(c.nome) ?? { ha: 0, n: 0 };
    e.ha += a; e.n++;
    acc.set(c.nome, e);
    corPorId[it.id] = corCheiaDaClasse(c);
    classePorId[it.id] = c.nome;
  }
  return {
    classes: ord.map(c => {
      const e = acc.get(c.nome) ?? { ha: 0, n: 0 };
      return { nome: c.nome, cor: corCheiaDaClasse(c), ordem: c.ordem, valorMin: c.valorMin, valorMax: c.valorMax, ha: r2(e.ha), pct: pct(e.ha, areaComDado), n: e.n };
    }),
    semDado: { ha: r2(semHa), n: semN },
    areaComDado: r2(areaComDado),
    corPorId, classePorId,
  };
}

/** Rampa RELATIVA entre o menor e o maior valor dos talhões (sem legenda de
 *  valor fixo: relevo). Cor por id, em `stops` [pos 0..1, cor hex]. */
export function coresRelativas(itens: Array<{ id: string; valor: number | null | undefined }>, stops: string[]): { corPorId: Record<string, string>; min: number | null; max: number | null } {
  const vals = itens.filter(i => finito(i.valor)) as Array<{ id: string; valor: number }>;
  if (!vals.length || !stops.length) return { corPorId: {}, min: null, max: null };
  const min = Math.min(...vals.map(v => v.valor)), max = Math.max(...vals.map(v => v.valor));
  const corPorId: Record<string, string> = {};
  for (const v of vals) {
    const t = max > min ? (v.valor - min) / (max - min) : 0.5;
    corPorId[v.id] = stops[Math.min(stops.length - 1, Math.round(t * (stops.length - 1)))];
  }
  return { corPorId, min, max };
}

// ── Régua dos alertas: "abaixo do nível crítico" ────────────────────────────
// REGRA (ledger Q12): abaixo do crítico = a classe do valor é "Muito baixo" ou
// "Baixo" na legenda da Biblioteca do atributo. Identificação: pelo NOME
// (muito baixo/baixa, baixo/baixa, sem acento e sem caixa); se a legenda tiver
// nomes próprios que não batem, valem as DUAS PRIMEIRAS classes pela `ordem`.
// Legenda invertida (Al, m%) não tem "abaixo do crítico" → null.

const nomeClasse = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const ehNomeCritico = (s: string) => /^(muito )?baix[oa]$/.test(nomeClasse(s));

export function classesCriticas(classes: ClasseLegenda[], invertida = false): Set<string> | null {
  if (invertida || !classes.length) return null;
  const porNome = classes.filter(c => ehNomeCritico(c.nome));
  if (porNome.length) return new Set(porNome.map(c => c.nome));
  return new Set([...classes].sort((a, b) => a.ordem - b.ordem).slice(0, 2).map(c => c.nome));
}

export function abaixoDoCritico(v: number | null | undefined, classes: ClasseLegenda[], invertida = false): boolean | null {
  const crit = classesCriticas(classes, invertida);
  if (!crit || !finito(v)) return null;
  const c = classeDoValor(v, classes);
  return c ? crit.has(c.nome) : null;
}

// ── Fertilidade ─────────────────────────────────────────────────────────────

export interface FertTalhao {
  talhaoId: string; nome: string; areaHa: number;
  ano: number | null;
  profundidade: string | null;
  /** Média das amostras da camada mais rasa do laudo, por atributo. */
  valores: Record<string, number | null>;
  nAmostras: number;
}

const profNum = (s: string): number => { const m = /(\d+)/.exec(s ?? ''); return m ? Number(m[1]) : 0; };

/** O laudo mais recente do talhão até o ano pedido (null = qualquer ano). */
export function ultimoLaudo(laudos: LaudoIn[] | undefined, ano: number | null): LaudoIn | null {
  const lista = (laudos ?? []).filter(l => (l.resultados?.length ?? 0) > 0 && (ano == null || (anoDoRegistro(l) ?? 0) <= ano));
  lista.sort((a, b) => ((anoDoRegistro(b) ?? 0) - (anoDoRegistro(a) ?? 0))
    || (b.dataReferencia ?? b.criadoEm ?? '').localeCompare(a.dataReferencia ?? a.criadoEm ?? ''));
  return lista[0] ?? null;
}

/** Média de cada atributo na camada MAIS RASA de um laudo. */
export function mediasDoLaudo(l: LaudoIn, atributos: string[]): { profundidade: string | null; valores: Record<string, number | null>; n: number } {
  let prof: string | null = null;
  for (const r of l.resultados ?? []) if (prof == null || profNum(r.profundidade) < profNum(prof)) prof = r.profundidade;
  const rs = (l.resultados ?? []).filter(r => prof == null || profNum(r.profundidade) === profNum(prof));
  const valores: Record<string, number | null> = {};
  for (const a of atributos) {
    let s = 0, n = 0;
    for (const r of rs) { const v = r.valores?.[a]; if (finito(v)) { s += v; n++; } }
    valores[a] = n ? r2(s / n) : null;
  }
  return { profundidade: prof, valores, n: rs.length };
}

export function fertilidadePorTalhao(dados: DadosPainel[], ano: number | null, atributos: string[]): FertTalhao[] {
  const out: FertTalhao[] = [];
  for (const d of dados) {
    const l = ultimoLaudo(d.laudos, ano);
    if (!l) continue;
    const m = mediasDoLaudo(l, atributos);
    out.push({ talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d), ano: anoDoRegistro(l), profundidade: m.profundidade, valores: m.valores, nAmostras: m.n });
  }
  return out;
}

/** Média ponderada pela área de cada atributo entre os talhões com laudo. */
export function mediasPonderadasAtributos(fert: FertTalhao[], atributos: string[]): Record<string, { valor: number | null; n: number; areaHa: number }> {
  const out: Record<string, { valor: number | null; n: number; areaHa: number }> = {};
  for (const a of atributos) {
    const com = fert.filter(f => finito(f.valores[a]));
    const v = mediaPonderada(com.map(f => ({ valor: f.valores[a], peso: f.areaHa || 1 })));
    out[a] = { valor: v == null ? null : r2(v), n: com.length, areaHa: r2(com.reduce((s, f) => s + f.areaHa, 0)) };
  }
  return out;
}

/** Evolução de UM atributo por ano: média ponderada pela área entre os talhões
 *  que tiveram análise naquele ano (camada mais rasa de cada um). */
export function evolucaoAtributo(dados: DadosPainel[], atributo: string): Array<{ ano: number; valor: number; nTalhoes: number }> {
  const porAno = new Map<number, Array<{ valor: number | null; peso: number }>>();
  for (const d of dados) {
    const e = evolucaoNutrientes(d.laudos ?? [], [atributo]);
    for (const p of e.pontos) {
      const l = porAno.get(p.ano) ?? [];
      l.push({ valor: p.valores[atributo], peso: areaDe(d) || 1 });
      porAno.set(p.ano, l);
    }
  }
  return [...porAno.entries()].sort((a, b) => a[0] - b[0]).flatMap(([ano, l]) => {
    const v = mediaPonderada(l);
    return v == null ? [] : [{ ano, valor: r2(v), nTalhoes: l.filter(x => finito(x.valor)).length }];
  });
}

// ── Condutividade, relevo, zonas, satélite ──────────────────────────────────

export interface CeTalhao { talhaoId: string; areaHa: number; profundidade: string; media: number; min: number; max: number; n: number; data: string | null }

/** CE do talhão: levantamento oficial (ou o mais recente), profundidade oficial
 *  (ou a primeira), estatística dos pontos. */
export function cePorTalhao(d: DadosPainel): CeTalhao | null {
  const levs = d.condutividade ?? [];
  const lev = levs.find(l => l.oficial) ?? levs[0];
  if (!lev) return null;
  const prof = lev.profundidadeOficial ?? lev.profundidades?.[0];
  if (!prof) return null;
  const vs = (lev.pontos ?? []).map(p => p.valores?.[prof]).filter(finito);
  if (!vs.length) return null;
  return {
    talhaoId: d.talhao.id, areaHa: areaDe(d), profundidade: prof,
    media: r2(vs.reduce((s, v) => s + v, 0) / vs.length), min: r2(Math.min(...vs)), max: r2(Math.max(...vs)), n: vs.length,
    data: lev.data ?? null,
  };
}

export interface RelevoTalhao { talhaoId: string; areaHa: number; altMin: number; altMed: number; altMax: number; amplitude: number; declMedia: number | null; fonte: string }

export function relevoPorTalhao(d: DadosPainel): RelevoTalhao | null {
  const mdes = d.mdes ?? [];
  const m = mdes.find(x => x.oficial) ?? mdes[0];
  const s = m?.stats;
  if (!m || !s || !finito(s.alt_min) || !finito(s.alt_max)) return null;
  return {
    talhaoId: d.talhao.id, areaHa: areaDe(d), altMin: s.alt_min, altMed: s.alt_med, altMax: s.alt_max,
    amplitude: finito(s.amplitude) ? s.amplitude : s.alt_max - s.alt_min,
    declMedia: finito(s.decl_media) ? s.decl_media : null, fonte: m.rotuloFonte ?? '',
  };
}

export interface ResumoRelevo { altMin: number; altMax: number; amplitude: number; declMedia: number | null; n: number }

/** Relevo do conjunto: extremos entre os talhões, amplitude = máx − mín e
 *  declividade média ponderada pela área. */
export function resumoRelevo(rel: RelevoTalhao[]): ResumoRelevo | null {
  if (!rel.length) return null;
  const altMin = Math.min(...rel.map(r => r.altMin)), altMax = Math.max(...rel.map(r => r.altMax));
  const decl = mediaPonderada(rel.map(r => ({ valor: r.declMedia, peso: r.areaHa || 1 })));
  return { altMin: r1(altMin), altMax: r1(altMax), amplitude: r1(altMax - altMin), declMedia: decl == null ? null : r1(decl), n: rel.length };
}

export interface ZonaResumo { chave: string; rotulo: string; cor: string; ha: number; pct: number }

/** Área por classe de zona, somando as feições de todos os talhões (do
 *  espelho do cadastro). Classe reconhecida (Alta…Baixa) agrupa pelo nome, na
 *  ordem alta → baixa; outra classe ("Nível 3", zona numerada) vira "Zona N". */
export function resumoZonas(dados: DadosPainel[]): { zonas: ZonaResumo[]; areaTotal: number } {
  const acc = new Map<string, { rotulo: string; cor: string; ha: number; ordem: number }>();
  const outros = new Set<string>();
  for (const d of dados) for (const f of d.zonasFc ?? []) if (!classeReconhecida(f.classe ?? '')) outros.add(String(f.zona ?? f.classe ?? ''));
  const listaOutros = [...outros].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  for (const d of dados) for (const f of d.zonasFc ?? []) {
    const a = finito(f.areaHa) ? f.areaHa : 0;
    let chave: string, rotulo: string, cor: string, ordem: number;
    if (classeReconhecida(f.classe ?? '')) {
      const cz = classeZona(f.classe);
      chave = cz.label; rotulo = `Zona ${cz.label.toLowerCase()}`; cor = cz.cor; ordem = ORDEM_CLASSES.indexOf(cz.label);
    } else {
      const k = String(f.zona ?? f.classe ?? '');
      const i = listaOutros.indexOf(k);
      chave = `z:${k}`; rotulo = /^\d+$/.test(k) ? `Zona ${k}` : (k || 'Zona'); cor = f.cor || corZonaPorPosicao(i, listaOutros.length); ordem = 100 + i;
    }
    const e = acc.get(chave) ?? { rotulo, cor, ha: 0, ordem };
    e.ha += a;
    acc.set(chave, e);
  }
  const areaTotal = [...acc.values()].reduce((s, z) => s + z.ha, 0);
  const zonas = [...acc.entries()].sort((x, y) => x[1].ordem - y[1].ordem)
    .map(([chave, z]) => ({ chave, rotulo: z.rotulo, cor: z.cor, ha: r2(z.ha), pct: pct(z.ha, areaTotal) }));
  return { zonas, areaTotal: r2(areaTotal) };
}

// ── Ciclo da safra (janela de TUDO o que é satélite: NDVI/NDRE) ──────────────
// Convenção do app (lib/periodo): "Ano" é o ano CIVIL da data de referência.
// Os cartões do portal seguem essa convenção — no filtro "2026", o KPI de
// produtividade é a colheita feita EM 2026 (mapa de colheita de mar/2026, a
// lavoura de verão 25/26). O satélite muda de janela: a lavoura vai de Out a
// Abr e, no ano civil, sairia cortada em dois. Vale para a série da Visão
// geral, para a página NDVI inteira (pico, cenas, mapa, ranking) e para o pico
// da correlação. Rótulo: o filtro mostra só o ano ("2026") e o ciclo aparece
// como "jul/25–jun/26" (rotuloCicloMeses) — nunca "safra 26/27" ao lado.
//
// REGRA (ancorada na COLHEITA): o ciclo do ano A é a lavoura que gerou a
// colheita de A — de 1º/jul de A−1 a 30/jun de A (a 2ª época de A−1 mais a 1ª
// época de A, lib/periodo epocaDeMes), rotulado "A−1/A (jul–jun)": no filtro
// "2026", jul/2025 → jun/2026 = "25/26". Assim a curva ao lado do KPI é a da
// mesma lavoura. Cobre Out→Abr inteiro, com folga para plantio cedo e colheita
// tardia. Os meses aparecem na ordem do ciclo: Jul, Ago, …, Dez, Jan, …, Jun.

/** Mês (1–12) em que começa o ciclo da safra. */
export const MES_INICIO_CICLO = 7;
/** Meses na ordem do ciclo: [7, 8, …, 12, 1, …, 6]. */
export const MESES_DO_CICLO: readonly number[] = Array.from({ length: 12 }, (_, i) => ((MES_INICIO_CICLO - 1 + i) % 12) + 1);
/** Posição do mês no ciclo (Jul = 0 … Jun = 11). */
export const ordemNoCiclo = (mes: number): number => (mes - MES_INICIO_CICLO + 12) % 12;
/** Ano do ciclo (o ano da COLHEITA, o A de "A−1/A") a que pertence uma data: Jul–Dez → ano+1; Jan–Jun → o próprio ano. */
export function cicloDeData(iso: string): number | null {
  const a = anoDeData(iso);
  const mes = Number(String(iso ?? '').slice(5, 7));
  if (a == null || !(mes >= 1 && mes <= 12)) return null;
  return mes >= MES_INICIO_CICLO ? a + 1 : a;
}
/** "25/26" para o ciclo de 2026 (jul/2025 → jun/2026). */
export const rotuloCiclo = (ano: number): string => `${String(ano - 1).slice(-2)}/${String(ano).slice(-2)}`;
/** "jul/25–jun/26" para o ciclo de 2026 — o rótulo que a tela mostra (sem "safra"). */
export const rotuloCicloMeses = (ano: number): string => `jul/${String(ano - 1).slice(-2)}–jun/${String(ano).slice(-2)}`;

/** Janela de uma série: 'ano' = ano civil (convenção do app); 'ciclo' = ciclo da colheita de A (acima). */
export type JanelaSerie = 'ano' | 'ciclo';
/** A data cai na janela do ano A? (A null = sem filtro.) */
export function naJanela(iso: string, ano: number | null, janela: JanelaSerie = 'ano'): boolean {
  if (ano == null) return true;
  return (janela === 'ciclo' ? cicloDeData(iso) : anoDeData(iso)) === ano;
}

/** Cenas de índice de vegetação do talhão no ano (listagem leve da nuvem) —
 *  ou no ciclo da safra, com `janela = 'ciclo'`. */
export function cenasIndice(d: DadosPainel, ano: number | null, janela: JanelaSerie = 'ano'): Array<{ indice: string; data: string; media: number }> {
  const out: Array<{ indice: string; data: string; media: number }> = [];
  for (const m of d.mapasNuvem ?? []) {
    const s = m.id.split('__');
    if (s[0] !== d.talhao.id || (s[1] !== 'ndvi' && s[1] !== 'ndvicbers')) continue;
    const data = m.cena?.data;
    const media = m.stats?.media;
    if (!data || !finito(media)) continue;
    if (!naJanela(data, ano, janela)) continue;
    out.push({ indice: String(m.indice || s[2] || 'NDVI').toUpperCase(), data, media });
  }
  return out;
}

/** Pico de NDVI do talhão no CICLO da colheita de A (jul/A−1 → jun/A; maior
 *  média de cena) — a lavoura que gerou a colheita de A. No ano civil entraria
 *  out–dez de A, que já é a lavoura seguinte. */
export function picoNdvi(d: DadosPainel, ano: number | null): number | null {
  const vs = cenasIndice(d, ano, 'ciclo').filter(c => c.indice === 'NDVI').map(c => c.media);
  return vs.length ? Math.max(...vs) : null;
}

export interface SerieIndices { meses: number[]; series: Array<{ indice: string; valores: Record<number, number> }> }

/** NDVI/NDRE por mês: média das cenas de cada talhão no mês, depois média
 *  ponderada pela área entre os talhões. Só os meses com cena entram.
 *  `janela = 'ciclo'`: o ciclo da colheita de A (jul/A−1 → jun/A), meses na ordem do
 *  ciclo — é o que a Visão geral desenha. */
export function serieIndices(dados: DadosPainel[], ano: number | null, indices = ['NDVI', 'NDRE'], janela: JanelaSerie = 'ano'): SerieIndices {
  const meses = new Set<number>();
  const series = indices.map(indice => {
    const porMes = new Map<number, Array<{ valor: number; peso: number }>>();
    for (const d of dados) {
      const doTalhao = new Map<number, number[]>();
      for (const c of cenasIndice(d, ano, janela)) {
        if (c.indice !== indice) continue;
        const mes = Number(c.data.slice(5, 7));
        if (!(mes >= 1 && mes <= 12)) continue;
        const l = doTalhao.get(mes) ?? [];
        l.push(c.media);
        doTalhao.set(mes, l);
      }
      for (const [mes, vs] of doTalhao) {
        const l = porMes.get(mes) ?? [];
        l.push({ valor: vs.reduce((s, v) => s + v, 0) / vs.length, peso: areaDe(d) || 1 });
        porMes.set(mes, l);
      }
    }
    const valores: Record<number, number> = {};
    for (const [mes, l] of porMes) { const v = mediaPonderada(l); if (v != null) { valores[mes] = Math.round(v * 1000) / 1000; meses.add(mes); } }
    return { indice, valores };
  }).filter(s => Object.keys(s.valores).length > 0);
  const ordem = janela === 'ciclo' ? ordemNoCiclo : (m: number) => m;
  return { meses: [...meses].sort((a, b) => ordem(a) - ordem(b)), series };
}

// ── Correlação entre talhões (Pearson) ──────────────────────────────────────

export const MIN_TALHOES_CORRELACAO = 5;

// ln Γ(x) — Lanczos (g = 7, 9 termos).
function lnGama(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGama(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Fração contínua da beta incompleta (Numerical Recipes, betacf).
function betaFc(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
export function betaIncompleta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGama(a + b) - lnGama(a) - lnGama(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaFc(a, b, x)) / a : 1 - (bt * betaFc(b, a, 1 - x)) / b;
}

export interface Correlacao { r: number; n: number; p: number }

/** r de Pearson + p-valor bicaudal (t de Student, gl = n − 2). Só com n ≥ 5
 *  pares e variância nos dois lados; senão null. */
export function pearson(pares: Array<[number, number]>): Correlacao | null {
  const ps = pares.filter(([x, y]) => finito(x) && finito(y));
  const n = ps.length;
  if (n < MIN_TALHOES_CORRELACAO) return null;
  const mx = ps.reduce((s, p) => s + p[0], 0) / n, my = ps.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of ps) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx <= 0 || syy <= 0) return null;
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const gl = n - 2;
  let p: number;
  if (Math.abs(r) >= 1) p = 0;
  else {
    const t2 = (r * r * gl) / (1 - r * r);
    p = betaIncompleta(gl / (gl + t2), gl / 2, 0.5);
  }
  return { r: Math.round(r * 100) / 100, n, p: Math.max(0, Math.min(1, p)) };
}

/** "Forte e positiva", "Moderada e negativa"… (|r| < 0,3 fraca; < 0,7 moderada). */
export function interpretarR(r: number): string {
  const a = Math.abs(r);
  const forca = a >= 0.7 ? 'Forte' : a >= 0.3 ? 'Moderada' : 'Fraca';
  return a < 0.05 ? 'Sem relação' : `${forca} e ${r > 0 ? 'positiva' : 'negativa'}`;
}

/** "p < 0,01", "p = 0,03"… */
export function rotuloP(p: number): string {
  if (p < 0.001) return 'p < 0,001';
  if (p < 0.01) return 'p < 0,01';
  return `p = ${p.toFixed(2).replace('.', ',')}`;
}

export interface LinhaCorrelacao { id: 'ndvi' | 'ce' | 'altitude'; rotulo: string; n: number; resultado: Correlacao | null }

/** Variáveis × produtividade entre os talhões (média de cada talhão). */
export function correlacoes(dados: DadosPainel[], ano: number | null, cultura = ''): LinhaCorrelacao[] {
  const kpi = kpiProdutividade(dados, ano, cultura);
  const prods = kpi ? produtividadePorTalhao(dados, ano, kpi.cultura) : [];
  const prodDe = new Map(prods.map(p => [p.talhaoId, p.mediaScHa]));
  const linha = (id: LinhaCorrelacao['id'], rotulo: string, x: (d: DadosPainel) => number | null): LinhaCorrelacao => {
    const pares: Array<[number, number]> = [];
    for (const d of dados) {
      const y = prodDe.get(d.talhao.id);
      const v = x(d);
      if (finito(y) && finito(v)) pares.push([v, y]);
    }
    return { id, rotulo, n: pares.length, resultado: pearson(pares) };
  };
  return [
    linha('ndvi', 'NDVI (pico) × Produtividade', d => picoNdvi(d, ano)),
    linha('ce', 'CE × Produtividade', d => cePorTalhao(d)?.media ?? null),
    linha('altitude', 'Altitude × Produtividade', d => relevoPorTalhao(d)?.altMed ?? null),
  ];
}

// ── "Minha propriedade em números" ──────────────────────────────────────────

export type TipoAlerta = 'critico' | 'atencao' | 'info' | 'ok';
export interface AlertaPainel { id: string; tipo: TipoAlerta; destaque: string; texto: string }

export interface LegendaAlerta { classes: ClasseLegenda[]; invertida?: boolean; simbolo: string }

const fmtHaTxt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 100 ? 0 : 1 });
const fmtPctTxt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const haPct = (ha: number, total: number) => `${fmtHaTxt(ha)} ha (${fmtPctTxt(pct(ha, total))}%)`;

/** Os alertas e marcas da propriedade, só com o que há de dado. Cada um diz
 *  QUANTA área (ha e % da área dos talhões no filtro). Regras:
 *   · atributo abaixo do crítico: régua `classesCriticas` sobre a média da
 *     última análise de cada talhão (camada mais rasa);
 *   · produtividade baixa: média do talhão nas classes "Muito baixa"/"Baixa"
 *     da legenda de produtividade da cultura (mesma régua);
 *   · análise antiga: última análise há 3 anos ou mais (ou nunca);
 *   · zonas e prescrição VR: área coberta. */
export function alertasPropriedade(entrada: {
  dados: DadosPainel[];
  ano: number | null;
  cultura?: string;
  legendas: Partial<Record<'p' | 'k' | 'v', LegendaAlerta>>;
  legendaProdutividade?: { classes: ClasseLegenda[] } | null;
  liberado?: (secao: 'fertilidade' | 'produtividade' | 'recomendacoes') => boolean;
  /** Unidade do texto "< 3.600 kg/ha" (a régua é sempre a mesma). Padrão sc/ha. */
  unidade?: UnidadeProd;
}): AlertaPainel[] {
  const { dados, ano } = entrada;
  const lib = entrada.liberado ?? (() => true);
  const total = dados.reduce((s, d) => s + areaDe(d), 0);
  const out: AlertaPainel[] = [];
  if (!dados.length) return out;
  // Um talhão só no filtro: "Este talhão não tem…" no lugar de "Nenhum talhão com…".
  const um = dados.length === 1;

  if (lib('fertilidade')) {
    const fert = fertilidadePorTalhao(dados, ano, ['p', 'k', 'v']);
    const nomes: Record<'p' | 'k' | 'v', string> = { p: 'P', k: 'K', v: 'V%' };
    for (const at of ['p', 'k', 'v'] as const) {
      const leg = entrada.legendas[at];
      if (!leg) continue;
      const com = fert.filter(f => abaixoDoCritico(f.valores[at], leg.classes, leg.invertida) != null);
      if (!com.length) continue;
      const crit = com.filter(f => abaixoDoCritico(f.valores[at], leg.classes, leg.invertida));
      const ha = crit.reduce((s, f) => s + f.areaHa, 0);
      out.push(ha > 0
        ? { id: `crit-${at}`, tipo: at === 'p' ? 'critico' : 'atencao', destaque: haPct(ha, total), texto: `com ${nomes[at]} abaixo do nível crítico` }
        : um
          ? { id: `crit-${at}`, tipo: 'ok', destaque: 'Este talhão', texto: `não tem ${nomes[at]} abaixo do nível crítico` }
          : { id: `crit-${at}`, tipo: 'ok', destaque: 'Nenhum talhão', texto: `com ${nomes[at]} abaixo do nível crítico` });
    }
    if (ano != null) {
      const antigos = dados.filter(d => { const l = ultimoLaudo(d.laudos, ano); const a = l ? anoDoRegistro(l) : null; return a == null || ano - a >= 3; });
      const ha = antigos.reduce((s, d) => s + areaDe(d), 0);
      if (ha > 0) out.push({ id: 'analise-antiga', tipo: 'atencao', destaque: haPct(ha, total), texto: 'sem análise de solo nos últimos 3 anos' });
    }
  }

  if (lib('produtividade') && entrada.legendaProdutividade?.classes.length) {
    const kpi = kpiProdutividade(dados, ano, entrada.cultura ?? '');
    if (kpi) {
      const classes = classesEmSacas(entrada.legendaProdutividade.classes);
      const prods = produtividadePorTalhao(dados, ano, kpi.cultura);
      const baixos = prods.filter(p => abaixoDoCritico(p.mediaScHa, classes));
      const ha = baixos.reduce((s, p) => s + p.areaHa, 0);
      // O corte sai da legenda ORIGINAL (kg/ha) na unidade escolhida: "< 3.600 kg/ha".
      const ultimaCritica = [...classes].sort((a, b) => a.ordem - b.ordem).filter(c => classesCriticas(classes)?.has(c.nome)).pop()?.nome;
      const corteKg = entrada.legendaProdutividade.classes.find(c => c.nome === ultimaCritica)?.valorMax;
      out.push(ha > 0
        ? { id: 'prod-baixa', tipo: 'atencao', destaque: haPct(ha, total), texto: `com produtividade${corteKg != null ? ` < ${fmtKgHa(corteKg, entrada.unidade ?? 'sc/ha')}` : ' baixa'} (${kpi.cultura})` }
        : um
          ? { id: 'prod-baixa', tipo: 'ok', destaque: 'Este talhão', texto: `não tem produtividade baixa (${kpi.cultura})` }
          : { id: 'prod-baixa', tipo: 'ok', destaque: 'Nenhum talhão', texto: `com produtividade baixa (${kpi.cultura})` });
    }
  }

  const k = kpisPainel(dados, ano, entrada.cultura ?? '');
  out.push({ id: 'zonas', tipo: k.areaZonas >= total && total > 0 ? 'ok' : 'info', destaque: haPct(k.areaZonas, total), texto: 'com zonas de manejo' });
  if (lib('recomendacoes')) {
    out.push({ id: 'vr', tipo: k.areaRecomendacao >= total && total > 0 ? 'ok' : 'info', destaque: haPct(k.areaRecomendacao, total), texto: 'com recomendação ou prescrição em taxa variável no ano' });
  }
  return out;
}

// ── Lista de talhões (página Talhões) ───────────────────────────────────────

export interface ResumoTalhao {
  talhaoId: string; fazendaId: string; nome: string; areaHa: number;
  cultura: string;
  prodScHa: number | null;
  p: number | null; v: number | null; anoAnalise: number | null;
  nZonas: number;
  ce: boolean; relevo: boolean; cenas: number; recomendacao: boolean;
}

export function resumoPorTalhao(dados: DadosPainel[], ano: number | null, cultura = ''): ResumoTalhao[] {
  // Em "Todas": a colheita da cultura predominante, se o talhão a tem; senão a dele
  // (cada linha mostra a cultura e usa a legenda dela — nada é somado).
  const pred = cultura ? '' : culturaPredominanteDoAno(dados, ano);
  return dados.map(d => {
    const col = cultura ? colheitaDoAno(d, ano, cultura) : ((pred ? colheitaDoAno(d, ano, pred) : null) ?? colheitaDoAno(d, ano));
    const l = ultimoLaudo(d.laudos, ano);
    const m = l ? mediasDoLaudo(l, ['p', 'v']) : null;
    const zonas = new Set((d.zonasFc ?? []).map(f => String(f.zona ?? f.classe ?? '')));
    return {
      talhaoId: d.talhao.id, fazendaId: d.talhao.fazendaId, nome: d.talhao.nome, areaHa: areaDe(d),
      cultura: rotuloCultura(col?.cultura || d.cultura || ''),
      prodScHa: col ? kgParaScCheio(col.stats.mediaKgha) : null,
      p: m?.valores.p ?? null, v: m?.valores.v ?? null, anoAnalise: l ? anoDoRegistro(l) : null,
      nZonas: zonas.size,
      ce: !!cePorTalhao(d), relevo: !!relevoPorTalhao(d),
      cenas: new Set(cenasIndice(d, ano).map(c => c.data)).size,
      recomendacao: temRecomendacaoNoAno(d, ano),
    };
  });
}

// ── Projeção para o mini-mapa ───────────────────────────────────────────────

type Anel = number[][];

function aneisDe(geo: unknown): Anel[] {
  const out: Anel[] = [];
  const visitar = (g: unknown) => {
    if (!g || typeof g !== 'object') return;
    const o = g as { type?: string; features?: unknown[]; geometry?: unknown; coordinates?: unknown; geometries?: unknown[] };
    if (o.type === 'FeatureCollection') (o.features ?? []).forEach(visitar);
    else if (o.type === 'Feature') visitar(o.geometry);
    else if (o.type === 'GeometryCollection') (o.geometries ?? []).forEach(visitar);
    else if (o.type === 'Polygon' && Array.isArray(o.coordinates)) (o.coordinates as Anel[]).forEach(r => out.push(r));
    else if (o.type === 'MultiPolygon' && Array.isArray(o.coordinates)) (o.coordinates as Anel[][]).forEach(p => (p ?? []).forEach(r => out.push(r)));
  };
  visitar(geo);
  return out.filter(r => Array.isArray(r) && r.length >= 3 && r.every(p => Array.isArray(p) && finito(p[0]) && finito(p[1])));
}

const lerGeo = (g: unknown): unknown => {
  if (typeof g !== 'string') return g;
  try { return JSON.parse(g); } catch { return null; }
};

export interface FormaMapa { id: string; d: string; cx: number; cy: number; w: number; h: number; grupo: number }
export interface ProjecaoMapa {
  viewBox: string; largura: number; altura: number;
  formas: FormaMapa[];
  /** lng/lat → coordenada do quadro, do PRIMEIRO grupo (null sem talhão válido).
   *  Com um grupo só (o caso comum) vale para o mapa inteiro. */
  ponto: ((lng: number, lat: number) => [number, number]) | null;
  /** lng/lat → coordenada, na projeção do grupo deste talhão — use para pôr
   *  raster (bounds) e zonas de um talhão no lugar certo. */
  pontoDe: (id: string) => ((lng: number, lat: number) => [number, number]) | null;
  /** Retângulo de cada grupo no quadro (só desenhado quando há mais de um). */
  grupos: Array<{ x: number; y: number; w: number; h: number }>;
  /** Identidade da projeção (cache de caminhos: o mesmo viewBox não basta). */
  chave: string;
}

/** Distância (graus, já com a longitude corrigida) acima da qual dois talhões
 *  ficam em GRUPOS separados: ~3 km. */
const SEPARACAO_GRUPO = 0.03;

/** Projeta os talhões numa caixa `largura × altura` mantendo a proporção real
 *  (longitude × cos da latitude média), com a função `ponto` exposta para pôr
 *  rasters (bounds) e zonas no mesmo quadro.
 *
 *  GRUPOS (05/11/2026): produtor com fazendas a dezenas de km umas das outras
 *  via cada talhão virar um ponto de 8 px — o quadro enquadrava a região toda.
 *  Agora os talhões próximos (< ~3 km) formam um grupo; cada grupo ganha um
 *  quadro numa grade e todos usam a MESMA escala (os tamanhos continuam
 *  comparáveis entre grupos). Com um grupo só, é o mapa geográfico de sempre. */
export function projetarMapa(itens: Array<{ id: string; geojson?: unknown }>, largura = 600, altura = 360, margem = 10): ProjecaoMapa {
  const porTalhao: Array<{ id: string; aneis: Anel[]; cx: number; cy: number; x0: number; x1: number; y0: number; y1: number }> = [];
  const viewBox = `0 0 ${largura} ${altura}`;
  const vazio: ProjecaoMapa = { viewBox, largura, altura, formas: [], ponto: null, pontoDe: () => null, grupos: [], chave: viewBox };
  for (const it of itens) {
    const aneis = aneisDe(lerGeo(it.geojson));
    if (aneis.length) porTalhao.push({ id: it.id, aneis, cx: 0, cy: 0, x0: 0, x1: 0, y0: 0, y1: 0 });
  }
  if (!porTalhao.length) return vazio;
  let latMin = Infinity, latMax = -Infinity;
  for (const t of porTalhao) for (const r of t.aneis) for (const [, lat] of r) { if (lat < latMin) latMin = lat; if (lat > latMax) latMax = lat; }
  const k = Math.cos(((latMin + latMax) / 2) * Math.PI / 180) || 1;
  // Caixa de cada talhão em graus "planos" (x = lng·k, y = lat).
  for (const t of porTalhao) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const r of t.aneis) for (const [lng, lat] of r) { const x = lng * k; if (x < x0) x0 = x; if (x > x1) x1 = x; if (lat < y0) y0 = lat; if (lat > y1) y1 = lat; }
    Object.assign(t, { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
  }
  // Agrupa por proximidade das caixas (ligação simples; união-busca).
  const pai = porTalhao.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < porTalhao.length; i++) for (let j = i + 1; j < porTalhao.length; j++) {
    const a = porTalhao[i], b = porTalhao[j];
    const gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
    const gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
    if (Math.hypot(gx, gy) <= SEPARACAO_GRUPO) pai[raiz(i)] = raiz(j);
  }
  const porRaiz = new Map<number, number[]>();
  porTalhao.forEach((_, i) => { const r = raiz(i); porRaiz.set(r, [...(porRaiz.get(r) ?? []), i]); });
  const grupos = [...porRaiz.values()].map(ix => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of ix) { const t = porTalhao[i]; x0 = Math.min(x0, t.x0); x1 = Math.max(x1, t.x1); y0 = Math.min(y0, t.y0); y1 = Math.max(y1, t.y1); }
    return { ix, x0, x1, y0, y1, dx: (x1 - x0) || 1e-9, dy: (y1 - y0) || 1e-9 };
  });
  // Ordem de leitura: norte → sul, oeste → leste (aproximadamente geográfica).
  grupos.sort((a, b) => (b.y1 - a.y1) || (a.x0 - b.x0));
  const n = grupos.length;
  // Grade: escolhe o nº de colunas que dá a MAIOR escala comum.
  const folga = n > 1 ? 8 : 0;
  let melhor = { cols: 1, rows: n, escala: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (largura - 2 * margem) / cols, ch = (altura - 2 * margem) / rows;
    const escala = Math.min(...grupos.map(g => Math.min((cw - 2 * folga) / g.dx, (ch - 2 * folga) / g.dy)));
    if (escala > melhor.escala) melhor = { cols, rows, escala };
  }
  const { cols, rows, escala } = melhor;
  const cw = (largura - 2 * margem) / cols, ch = (altura - 2 * margem) / rows;
  const pontos: Array<(lng: number, lat: number) => [number, number]> = [];
  const caixas: ProjecaoMapa['grupos'] = [];
  grupos.forEach((g, gi) => {
    const col = gi % cols, row = Math.floor(gi / cols);
    const cx0 = margem + col * cw, cy0 = margem + row * ch;
    const offX = cx0 + (cw - g.dx * escala) / 2;
    const offY = cy0 + (ch - g.dy * escala) / 2;
    pontos.push((lng: number, lat: number): [number, number] => [
      Math.round((offX + (lng * k - g.x0) * escala) * 10) / 10,
      Math.round((offY + (g.y1 - lat) * escala) * 10) / 10,
    ]);
    caixas.push({ x: r1(cx0 + 2), y: r1(cy0 + 2), w: r1(cw - 4), h: r1(ch - 4) });
  });
  const grupoDe = new Map<string, number>();
  grupos.forEach((g, gi) => g.ix.forEach(i => grupoDe.set(porTalhao[i].id, gi)));
  const formas = porTalhao.map(t => {
    const grupo = grupoDe.get(t.id) ?? 0;
    const ponto = pontos[grupo];
    const d = caminhoDosAneis(t.aneis, ponto);
    let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
    for (const r of t.aneis) for (const [lng, lat] of r) { const [x, y] = ponto(lng, lat); if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > e) e = y; }
    return { id: t.id, d, cx: r1((a + b) / 2), cy: r1((c + e) / 2), w: r1(b - a), h: r1(e - c), grupo };
  });
  const chave = `${viewBox}|${grupos.map(g => `${g.x0.toFixed(5)},${g.y1.toFixed(5)}`).join(';')}|${escala.toFixed(3)}`;
  return {
    viewBox, largura, altura, formas, ponto: pontos[0],
    pontoDe: (id: string) => { const g = grupoDe.get(id); return g == null ? null : pontos[g]; },
    grupos: n > 1 ? caixas : [],
    chave,
  };
}

function caminhoDosAneis(aneis: Anel[], ponto: (lng: number, lat: number) => [number, number]): string {
  let d = '';
  for (const r of aneis) d += r.map(([lng, lat], i) => { const [x, y] = ponto(lng, lat); return `${i === 0 ? 'M' : 'L'}${x} ${y}`; }).join('') + 'Z';
  return d;
}

/** Caminho SVG de uma geometria qualquer (Feature/FC/Polygon…) no quadro. */
export function caminhoGeo(geo: unknown, ponto: (lng: number, lat: number) => [number, number]): string {
  return caminhoDosAneis(aneisDe(lerGeo(geo)), ponto);
}

/** Retângulo do quadro de um bounds [oeste, sul, leste, norte]. */
export function caixaDosBounds(b: [number, number, number, number], ponto: (lng: number, lat: number) => [number, number]): { x: number; y: number; w: number; h: number } {
  const [x0, y0] = ponto(b[0], b[3]);
  const [x1, y1] = ponto(b[2], b[1]);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
