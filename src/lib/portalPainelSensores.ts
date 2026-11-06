// Portal do Produtor v2 — contas das páginas de SENSORES: NDVI/NDRE,
// Produtividade, Condutividade elétrica e Altimetria.
//
// Módulo PURO (sem DOM, sem store, sem nuvem), no espírito de lib/portalPainel.ts
// (que ele usa): recebe os mesmos `DadosPainel` que o contexto do portal monta e
// devolve o que cada página desenha. Sem dado, devolve null/vazio — a tela
// mostra o estado vazio honesto; nada aqui inventa número.
//
// Teste: `node scripts/teste-portal-sensores.mjs`.
// Extensão .ts explícita nos imports: o teste roda em node (type-stripping).

import { anoDeData } from './periodo.ts';
import { anoDoRegistro } from './portalProdutor.ts';
import { kgParaScCheio } from './portalUnidade.ts';
import { classeDoValor, corCheiaDaClasse, type ClasseLegenda } from './legendas.ts';
import {
  mediaPonderada, variacaoPct, colheitaDoAno, normCultura, rotuloCultura, naJanela, cicloDeData, culturaEfetiva, areaColhidaPorCultura,
  type DadosPainel, type JanelaSerie, type MapaNuvemPainel, type ClasseDistribuida,
} from './portalPainel.ts';

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const areaDe = (d: DadosPainel) => (finito(d.talhao.areaHa) ? d.talhao.areaHa : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (parte: number, total: number) => (total > 0 ? r1((parte / total) * 100) : 0);
const media = (vs: number[]) => (vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null);
const numProf = (s: string): number => { const m = /(\d+)/.exec(s ?? ''); return m ? Number(m[1]) : 0; };

// ═══ NDVI / NDRE ════════════════════════════════════════════════════════════

export type FonteCena = 's2' | 'cbers';

export interface CenaSat {
  talhaoId: string;
  /** id do mapa na nuvem (`${talhão}__ndvi__NDVI__2026-03-02`) — para o mapa real. */
  itemId: string;
  atualizadoEm: string | null;
  fonte: FonteCena;
  indice: string;
  data: string;
  ano: number;
  mes: number;
  media: number;
  min: number | null;
  max: number | null;
  /** % do talhão sem nuvem/sombra na cena (0–100); null = ainda não avaliada. */
  pctLimpo: number | null;
  /** Cobertura de nuvem da cena inteira (%), quando o catálogo informou. */
  nuvem: number | null;
  plataforma: string | null;
}

type MetaCena = MapaNuvemPainel & { cena?: { data?: string | null; plataforma?: string | null; nuvem?: number | null } | null };

export const ROTULO_FONTE: Record<FonteCena, string> = { s2: 'Sentinel-2', cbers: 'CBERS-4A' };

/** Todas as cenas de índice do talhão (listagem leve da nuvem), de um ano ou
 *  de todos (ano null/undefined). Só entram as que têm data e média.
 *  `janela = 'ciclo'`: o ano é o da COLHEITA (jul/A−1 → jun/A, lib/portalPainel). */
export function cenasDoTalhao(d: DadosPainel, ano?: number | null, janela: JanelaSerie = 'ano'): CenaSat[] {
  const out: CenaSat[] = [];
  for (const m of (d.mapasNuvem ?? []) as MetaCena[]) {
    const s = m.id.split('__');
    if (s[0] !== d.talhao.id || (s[1] !== 'ndvi' && s[1] !== 'ndvicbers')) continue;
    const data = m.cena?.data;
    const med = m.stats?.media;
    if (!data || !finito(med)) continue;
    const a = anoDeData(data);
    if (a == null) continue;
    if (!naJanela(data, ano ?? null, janela)) continue;
    const mes = Number(data.slice(5, 7));
    out.push({
      talhaoId: d.talhao.id, itemId: m.id, atualizadoEm: m.atualizadoEm ?? null,
      fonte: s[1] === 'ndvicbers' ? 'cbers' : 's2',
      indice: String(m.indice || s[2] || 'NDVI').toUpperCase(), data, ano: a, mes,
      media: med, min: finito(m.stats?.min) ? m.stats!.min! : null, max: finito(m.stats?.max) ? m.stats!.max! : null,
      pctLimpo: finito(m.pctLimpo) ? m.pctLimpo : null,
      nuvem: finito(m.cena?.nuvem) ? m.cena!.nuvem! : null,
      plataforma: m.cena?.plataforma ?? null,
    });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Anos que têm ao menos uma cena (do mais novo para o mais antigo). */
export function anosComCena(dados: DadosPainel[], indice?: string): number[] {
  const anos = new Set<number>();
  for (const d of dados) for (const c of cenasDoTalhao(d)) if (!indice || c.indice === indice) anos.add(c.ano);
  return [...anos].sort((a, b) => b - a);
}

/** Ciclos (o ano da colheita, A de "A−1/A", jul→jun) que têm ao menos uma cena — do mais novo ao mais antigo. */
export function ciclosComCena(dados: DadosPainel[], indice?: string): number[] {
  const cs = new Set<number>();
  for (const d of dados) for (const c of cenasDoTalhao(d)) {
    if (indice && c.indice !== indice) continue;
    const k = cicloDeData(c.data);
    if (k != null) cs.add(k);
  }
  return [...cs].sort((a, b) => b - a);
}

/** Índices que existem nas cenas (NDVI primeiro, depois NDRE e o resto). */
export function indicesDisponiveis(dados: DadosPainel[]): string[] {
  const s = new Set<string>();
  for (const d of dados) for (const c of cenasDoTalhao(d)) s.add(c.indice);
  const ordem = ['NDVI', 'NDRE'];
  return [...s].sort((a, b) => (ordem.indexOf(a) < 0 ? 99 : ordem.indexOf(a)) - (ordem.indexOf(b) < 0 ? 99 : ordem.indexOf(b)) || a.localeCompare(b));
}

/** Média mensal de um índice: média das cenas de cada talhão no mês, depois
 *  média ponderada pela área entre os talhões. Só os meses com cena aparecem.
 *  `janela = 'ciclo'`: os 12 meses do ciclo da colheita de A (jul/A−1 → jun/A) — a
 *  chave continua sendo o mês (1–12; não se repete dentro do ciclo). */
export function serieMensal(dados: DadosPainel[], ano: number | null, indice: string, janela: JanelaSerie = 'ano'): Record<number, number> {
  const porMes = new Map<number, Array<{ valor: number; peso: number }>>();
  for (const d of dados) {
    const doTalhao = new Map<number, number[]>();
    for (const c of cenasDoTalhao(d, ano, janela)) {
      if (c.indice !== indice || !(c.mes >= 1 && c.mes <= 12)) continue;
      const l = doTalhao.get(c.mes) ?? [];
      l.push(c.media);
      doTalhao.set(c.mes, l);
    }
    for (const [mes, vs] of doTalhao) {
      const l = porMes.get(mes) ?? [];
      l.push({ valor: media(vs)!, peso: areaDe(d) || 1 });
      porMes.set(mes, l);
    }
  }
  const out: Record<number, number> = {};
  for (const [mes, l] of porMes) { const v = mediaPonderada(l); if (v != null) out[mes] = r3(v); }
  return out;
}

/** Série mensal de cada talhão separado (para comparar os talhões na linha). */
export function serieMensalPorTalhao(dados: DadosPainel[], ano: number | null, indice: string, janela: JanelaSerie = 'ano'): Array<{ talhaoId: string; nome: string; areaHa: number; valores: Record<number, number> }> {
  const out: Array<{ talhaoId: string; nome: string; areaHa: number; valores: Record<number, number> }> = [];
  for (const d of dados) {
    const s = serieMensal([d], ano, indice, janela);
    if (Object.keys(s).length) out.push({ talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d), valores: s });
  }
  return out;
}

export interface PicoSerie { mes: number; valor: number }
/** O mês de maior valor da série (o pico do ciclo). */
export function picoDaSerie(valores: Record<number, number>): PicoSerie | null {
  let melhor: PicoSerie | null = null;
  for (const [m, v] of Object.entries(valores)) if (!melhor || v > melhor.valor) melhor = { mes: Number(m), valor: v };
  return melhor;
}

export interface NdviTalhao {
  talhaoId: string; nome: string; areaHa: number;
  nCenas: number;
  /** Cenas com o talhão ≥ `limpoMin`% limpo (as confiáveis). */
  nLimpas: number;
  ultima: { data: string; media: number; pctLimpo: number | null } | null;
  /** A cena de maior média no ano. */
  pico: { data: string; valor: number } | null;
  /** Média de todas as cenas do ano. */
  mediaAno: number | null;
}

/** Corte de "cena confiável": o mesmo padrão do monitor de satélite (talhão ≥ 70% limpo). */
export const LIMPO_MIN = 70;

// A página NDVI inteira (pico, cenas, mapa, ranking) segue o CICLO da colheita
// de A (jul/A−1 → jun/A; lib/portalPainel cicloDeData): por isso a janela
// padrão das funções abaixo é 'ciclo'.

export function resumoNdviPorTalhao(dados: DadosPainel[], ano: number | null, indice: string, janela: JanelaSerie = 'ciclo'): NdviTalhao[] {
  const out: NdviTalhao[] = [];
  for (const d of dados) {
    const cs = cenasDoTalhao(d, ano, janela).filter(c => c.indice === indice);
    if (!cs.length) continue;
    const ult = cs[cs.length - 1];
    const pico = cs.reduce((a, c) => (c.media > a.media ? c : a), cs[0]);
    out.push({
      talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d),
      nCenas: cs.length, nLimpas: cs.filter(c => c.pctLimpo != null && c.pctLimpo >= LIMPO_MIN).length,
      ultima: { data: ult.data, media: ult.media, pctLimpo: ult.pctLimpo },
      pico: { data: pico.data, valor: pico.media },
      mediaAno: r3(media(cs.map(c => c.media))!),
    });
  }
  return out;
}

export interface CenaRecente extends CenaSat { nome: string; areaHa: number }

/** As cenas mais recentes entre os talhões do filtro (mais nova primeiro). */
export function cenasRecentes(dados: DadosPainel[], ano: number | null, indice: string, limite = 8, janela: JanelaSerie = 'ciclo'): CenaRecente[] {
  const todas: CenaRecente[] = [];
  for (const d of dados) for (const c of cenasDoTalhao(d, ano, janela)) if (c.indice === indice) todas.push({ ...c, nome: d.talhao.nome, areaHa: areaDe(d) });
  return todas.sort((a, b) => b.data.localeCompare(a.data) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })).slice(0, limite);
}

export interface KpisNdvi {
  nCenas: number;
  nTalhoes: number;
  ultimaData: string | null;
  /** Valor da cena mais recente de cada talhão, ponderado pela área. */
  valorUltimo: number | null;
  pico: PicoSerie | null;
  picoAnterior: PicoSerie | null;
  deltaPicoPct: number | null;
  /** % das cenas do ano com o talhão ≥ LIMPO_MIN% limpo (entre as avaliadas). */
  pctCenasLimpas: number | null;
  nAvaliadas: number;
}

export function kpisNdvi(dados: DadosPainel[], ano: number | null, indice: string, janela: JanelaSerie = 'ciclo'): KpisNdvi {
  const res = resumoNdviPorTalhao(dados, ano, indice, janela);
  const serie = serieMensal(dados, ano, indice, janela);
  const pico = picoDaSerie(serie);
  const ant = ano != null ? picoDaSerie(serieMensal(dados, ano - 1, indice, janela)) : null;
  const cenas = dados.flatMap(d => cenasDoTalhao(d, ano, janela).filter(c => c.indice === indice));
  const aval = cenas.filter(c => c.pctLimpo != null);
  const ultimaData = res.reduce<string | null>((m, r) => (r.ultima && (!m || r.ultima.data > m) ? r.ultima.data : m), null);
  return {
    nCenas: cenas.length, nTalhoes: res.length, ultimaData,
    valorUltimo: (() => { const v = mediaPonderada(res.map(r => ({ valor: r.ultima?.media ?? null, peso: r.areaHa || 1 }))); return v == null ? null : r3(v); })(),
    pico, picoAnterior: ant, deltaPicoPct: pico && ant ? variacaoPct(pico.valor, ant.valor) : null,
    pctCenasLimpas: aval.length ? Math.round((aval.filter(c => (c.pctLimpo ?? 0) >= LIMPO_MIN).length / aval.length) * 100) : null,
    nAvaliadas: aval.length,
  };
}

// ═══ Produtividade ══════════════════════════════════════════════════════════

export interface LinhaProd {
  talhaoId: string; fazendaId: string; nome: string; areaHa: number; cultura: string;
  /** Peso/área colhida do mapa (a do talhão se o mapa não trouxer). */
  peso: number;
  mediaScHa: number;
  minScHa: number | null; maxScHa: number | null;
  /** CV dentro do mapa do talhão (%). */
  cv: number | null;
  producaoSc: number | null;
  /** Mesma cultura, ano anterior. */
  anteriorScHa: number | null;
  deltaPct: number | null;
  /** Média do talhão frente à média ponderada do conjunto (% — 100 = igual). */
  pctDaMedia: number | null;
}

export interface ResumoProd {
  cultura: string;
  nTalhoes: number;
  areaHa: number;
  /** sc/ha, ponderada pela área colhida. */
  mediaScHa: number;
  anteriorScHa: number | null;
  deltaPct: number | null;
  producaoTotalSc: number;
  producaoTotalT: number;
  /** Coeficiente de variação ENTRE os talhões (%) — precisa de 2+ talhões. */
  cvEntreTalhoes: number | null;
  /** CV médio dentro dos mapas, ponderado pela área (%). */
  cvDentro: number | null;
  melhor: { talhaoId: string; nome: string; mediaScHa: number } | null;
  pior: { talhaoId: string; nome: string; mediaScHa: number } | null;
}

/** Uma linha por talhão com colheita no ano (a oficial; sem ela, a mais recente),
 *  na cultura pedida. Com a cultura em branco, só vale a PREDOMINANTE — a de
 *  maior área colhida, com a colheita escolhida por talhão E por cultura
 *  (lib/portalPainel culturaEfetiva): somar saca de soja com saca de milho não
 *  diz nada. `outras` = as demais culturas colhidas no ano. `escopo`: no painel
 *  de um talhão, a predominante da propriedade vence se o talhão a tem. */
export function linhasProdutividade(dados: DadosPainel[], ano: number | null, cultura: string, escopo?: DadosPainel[]): { linhas: LinhaProd[]; cultura: string; outrasCulturas: boolean; outras: string[] } {
  if (ano == null) return { linhas: [], cultura: '', outrasCulturas: false, outras: [] };
  const alvo = culturaEfetiva(dados, ano, cultura, escopo);
  const outras = cultura ? [] : areaColhidaPorCultura(dados, ano).map(c => c.cultura).filter(c => normCultura(c) !== normCultura(alvo));
  const escolhidos: Array<{ d: DadosPainel; c: NonNullable<ReturnType<typeof colheitaDoAno>> }> = [];
  if (alvo) for (const d of dados) { const c = colheitaDoAno(d, ano, alvo); if (c) escolhidos.push({ d, c }); }
  if (!escolhidos.length) return { linhas: [], cultura: alvo, outrasCulturas: false, outras: [] };
  const base = escolhidos.map(({ d, c }) => {
    const s = c.stats;
    const peso = finito(s.areaHa) && s.areaHa > 0 ? s.areaHa : areaDe(d);
    const kg = finito(s.producaoTotalKg) ? s.producaoTotalKg : (finito(s.mediaKgha) ? s.mediaKgha * peso : null);
    // sc/ha com precisão cheia: só a tela arredonda (lib/portalUnidade) — senão
    // 3.500 kg/ha voltava como "3.498" no padrão kg/ha.
    return { d, s, peso, mediaScHa: kgParaScCheio(s.mediaKgha), producaoSc: kg == null ? null : kg / 60 };
  });
  const mediaGeral = mediaPonderada(base.map(b => ({ valor: b.mediaScHa, peso: b.peso })));
  const linhas: LinhaProd[] = base.map(b => {
    const ant = colheitaDoAno(b.d, ano - 1, alvo);
    const antSc = ant ? kgParaScCheio(ant.stats.mediaKgha) : null;
    return {
      talhaoId: b.d.talhao.id, fazendaId: b.d.talhao.fazendaId, nome: b.d.talhao.nome, areaHa: areaDe(b.d), cultura: alvo, peso: b.peso,
      mediaScHa: b.mediaScHa,
      minScHa: finito(b.s.minKgha) ? kgParaScCheio(b.s.minKgha) : null, maxScHa: finito(b.s.maxKgha) ? kgParaScCheio(b.s.maxKgha) : null,
      cv: finito(b.s.cv) ? b.s.cv : null,
      producaoSc: b.producaoSc == null ? null : Math.round(b.producaoSc),
      anteriorScHa: antSc,
      deltaPct: variacaoPct(b.mediaScHa, antSc),
      pctDaMedia: mediaGeral && mediaGeral > 0 ? Math.round((b.mediaScHa / mediaGeral) * 100) : null,
    };
  }).sort((a, b) => b.mediaScHa - a.mediaScHa);
  return { linhas, cultura: alvo, outrasCulturas: outras.length > 0, outras };
}

export function resumoProdutividade(linhas: LinhaProd[], cultura: string, dadosAnterior: LinhaProd[] = []): ResumoProd | null {
  if (!linhas.length) return null;
  const mp = mediaPonderada(linhas.map(l => ({ valor: l.mediaScHa, peso: l.peso })));
  if (mp == null) return null;
  const ant = mediaPonderada(dadosAnterior.map(l => ({ valor: l.mediaScHa, peso: l.peso })));
  const m = mp, a = ant;
  const sc = linhas.reduce((s, l) => s + (l.producaoSc ?? 0), 0);
  const medias = linhas.map(l => l.mediaScHa);
  const mm = media(medias)!;
  const dp = Math.sqrt(medias.reduce((s, v) => s + (v - mm) ** 2, 0) / medias.length);
  const cvDentro = mediaPonderada(linhas.map(l => ({ valor: l.cv, peso: l.peso })));
  const ord = [...linhas].sort((x, y) => y.mediaScHa - x.mediaScHa);
  return {
    cultura, nTalhoes: linhas.length, areaHa: r1(linhas.reduce((s, l) => s + l.peso, 0)),
    mediaScHa: m, anteriorScHa: a, deltaPct: variacaoPct(m, a),
    producaoTotalSc: Math.round(sc), producaoTotalT: r1((sc * 60) / 1000),
    cvEntreTalhoes: linhas.length >= 2 && mm > 0 ? r1((dp / mm) * 100) : null,
    cvDentro: cvDentro == null ? null : r1(cvDentro),
    melhor: { talhaoId: ord[0].talhaoId, nome: ord[0].nome, mediaScHa: ord[0].mediaScHa },
    pior: ord.length > 1 ? { talhaoId: ord[ord.length - 1].talhaoId, nome: ord[ord.length - 1].nome, mediaScHa: ord[ord.length - 1].mediaScHa } : null,
  };
}

export interface HistoricoSafra { ano: number; cultura: string; mediaScHa: number; nTalhoes: number; areaHa: number; producaoSc: number }

/** Produtividade ano a ano, por cultura (média ponderada pela área colhida).
 *  Cada talhão entra uma vez por ano e cultura (mapa oficial/recente). */
export function historicoPorSafra(dados: DadosPainel[], culturaFiltro = ''): HistoricoSafra[] {
  const anos = new Set<number>();
  for (const d of dados) for (const c of d.colheitas ?? []) { const a = anoDoRegistro(c); if (a != null) anos.add(a); }
  const out: HistoricoSafra[] = [];
  for (const ano of [...anos].sort((a, b) => a - b)) {
    const culturas = new Map<string, string>();
    for (const d of dados) for (const c of d.colheitas ?? []) {
      if (anoDoRegistro(c) === ano && normCultura(c.cultura) && (!culturaFiltro || normCultura(c.cultura) === normCultura(culturaFiltro))) culturas.set(normCultura(c.cultura), rotuloCultura(c.cultura));
    }
    const doAno: HistoricoSafra[] = [];
    for (const [k, rotulo] of culturas) {
      const { linhas } = linhasProdutividade(dados, ano, rotulo);
      const l = linhas.filter(x => normCultura(x.cultura) === k);
      if (!l.length) continue;
      doAno.push({
        ano, cultura: rotulo,
        mediaScHa: mediaPonderada(l.map(x => ({ valor: x.mediaScHa, peso: x.peso })))!,
        nTalhoes: l.length, areaHa: r1(l.reduce((s, x) => s + x.peso, 0)), producaoSc: Math.round(l.reduce((s, x) => s + (x.producaoSc ?? 0), 0)),
      });
    }
    // Dentro do ano, a cultura de maior área primeiro.
    out.push(...doAno.sort((a, b) => b.areaHa - a.areaHa));
  }
  return out;
}

// ═══ Condutividade elétrica ═════════════════════════════════════════════════

type LevCe = NonNullable<DadosPainel['condutividade']>[number];

export interface CeProf {
  talhaoId: string; nome: string; areaHa: number;
  profundidade: string;
  /** id do levantamento usado (para o mapa real). */
  levId: string | null;
  media: number; min: number; max: number; n: number;
  valores: number[];
  data: string | null;
}

/** Profundidades que o levantamento do talhão tem (a oficial primeiro). */
function profundidadesDoLev(l: LevCe): string[] {
  const ps = [...(l.profundidades ?? [])];
  const of = l.profundidadeOficial;
  if (of && !ps.includes(of)) ps.unshift(of);
  return ps;
}

/** Levantamentos do talhão em ordem de preferência: oficial, depois o mais recente. */
function levsOrdenados(d: DadosPainel): LevCe[] {
  return [...(d.condutividade ?? [])].sort((a, b) => (Number(b.oficial) - Number(a.oficial)) || (b.data ?? b.criadoEm ?? '').localeCompare(a.data ?? a.criadoEm ?? ''));
}

/** CE do talhão numa profundidade: o primeiro levantamento (oficial antes) que a tem e traz pontos. */
export function ceNaProfundidade(d: DadosPainel, prof: string): CeProf | null {
  for (const l of levsOrdenados(d)) {
    if (!profundidadesDoLev(l).includes(prof)) continue;
    const vs = (l.pontos ?? []).map(p => p.valores?.[prof]).filter(finito);
    if (!vs.length) continue;
    return {
      talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d), profundidade: prof, levId: l.id ?? null,
      media: r2(media(vs)!), min: r2(Math.min(...vs)), max: r2(Math.max(...vs)), n: vs.length, valores: vs, data: l.data ?? null,
    };
  }
  return null;
}

/** As profundidades com dado entre os talhões do filtro, da mais rasa para a mais funda. */
export function profundidadesCe(dados: DadosPainel[]): Array<{ valor: string; nTalhoes: number }> {
  const cont = new Map<string, number>();
  for (const d of dados) {
    const vistas = new Set<string>();
    for (const l of d.condutividade ?? []) for (const p of profundidadesDoLev(l)) vistas.add(p);
    for (const p of vistas) if (ceNaProfundidade(d, p)) cont.set(p, (cont.get(p) ?? 0) + 1);
  }
  return [...cont.entries()].map(([valor, nTalhoes]) => ({ valor, nTalhoes }))
    .sort((a, b) => numProf(a.valor) - numProf(b.valor) || a.valor.localeCompare(b.valor));
}

/** A profundidade para abrir a página: a oficial mais comum entre os talhões; sem ela, a mais rasa. */
export function profundidadePadraoCe(dados: DadosPainel[]): string | null {
  const disp = profundidadesCe(dados);
  if (!disp.length) return null;
  const cont = new Map<string, number>();
  for (const d of dados) { const l = levsOrdenados(d)[0]; const p = l?.profundidadeOficial; if (p && disp.some(x => x.valor === p)) cont.set(p, (cont.get(p) ?? 0) + 1); }
  const top = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ?? disp[0].valor;
}

export interface DistribuicaoPontos {
  classes: ClasseDistribuida[];
  areaComDado: number;
  semDado: { ha: number; n: number };
  /** id do talhão → cor da classe da MÉDIA dele (mini-mapa leve). */
  corPorId: Record<string, string>;
  classePorId: Record<string, string>;
}

/** Área por classe estimada pela PROPORÇÃO DOS PONTOS: cada ponto medido cai na
 *  classe do seu valor, e a área do talhão se reparte na proporção dos pontos.
 *  É uma estimativa (não é raster), mas respeita a variação DENTRO do talhão —
 *  coisa que a média do talhão esconde. */
export function distribuirPontosEmClasses(itens: CeProf[], classes: ClasseLegenda[], todosTalhoes: Array<{ id: string; areaHa: number }> = []): DistribuicaoPontos {
  const ord = [...classes].sort((a, b) => a.ordem - b.ordem);
  const acc = new Map<string, { ha: number; n: number }>();
  const corPorId: Record<string, string> = {};
  const classePorId: Record<string, string> = {};
  let areaComDado = 0;
  for (const it of itens) {
    const a = finito(it.areaHa) ? it.areaHa : 0;
    const cont = new Map<string, number>();
    for (const v of it.valores) { const c = classeDoValor(v, ord); if (c) cont.set(c.nome, (cont.get(c.nome) ?? 0) + 1); }
    const tot = [...cont.values()].reduce((s, n) => s + n, 0);
    if (!tot) continue;
    areaComDado += a;
    for (const [nome, n] of cont) { const e = acc.get(nome) ?? { ha: 0, n: 0 }; e.ha += (a * n) / tot; acc.set(nome, e); }
    const cm = classeDoValor(it.media, ord);
    if (cm) { corPorId[it.talhaoId] = corCheiaDaClasse(cm); classePorId[it.talhaoId] = cm.nome; acc.get(cm.nome)!.n++; }
  }
  const comDado = new Set(itens.map(i => i.talhaoId));
  const sem = todosTalhoes.filter(t => !comDado.has(t.id));
  return {
    classes: ord.map(c => {
      const e = acc.get(c.nome) ?? { ha: 0, n: 0 };
      return { nome: c.nome, cor: corCheiaDaClasse(c), ordem: c.ordem, valorMin: c.valorMin, valorMax: c.valorMax, ha: r1(e.ha), pct: pct(e.ha, areaComDado), n: e.n };
    }),
    areaComDado: r1(areaComDado),
    semDado: { ha: r1(sem.reduce((s, t) => s + (finito(t.areaHa) ? t.areaHa : 0), 0)), n: sem.length },
    corPorId, classePorId,
  };
}

export interface FaixaTres { rotulo: 'Baixa' | 'Média' | 'Alta'; ha: number; pct: number; classes: string[] }

/** Resume as classes da legenda em Baixa / Média / Alta (pela posição: as das pontas
 *  e o miolo). 5 classes → 2 + 1 + 2. Com menos de 3 classes não há como dividir. */
export function agruparEmTres(classes: ClasseDistribuida[]): FaixaTres[] | null {
  const ord = [...classes].sort((a, b) => a.ordem - b.ordem);
  if (ord.length < 3) return null;
  const ponta = Math.round(ord.length / 3);
  const grupos: Array<[FaixaTres['rotulo'], ClasseDistribuida[]]> = [
    ['Baixa', ord.slice(0, ponta)], ['Média', ord.slice(ponta, ord.length - ponta)], ['Alta', ord.slice(ord.length - ponta)],
  ];
  const total = ord.reduce((s, c) => s + c.ha, 0);
  return grupos.map(([rotulo, cs]) => {
    const ha = cs.reduce((s, c) => s + c.ha, 0);
    return { rotulo, ha: r1(ha), pct: pct(ha, total), classes: cs.map(c => c.nome) };
  });
}

export interface ResumoCe {
  /** Média ponderada pela área (das médias dos talhões). */
  media: number;
  min: number; max: number;
  nTalhoes: number; nPontos: number;
  maisCondutivo: { talhaoId: string; nome: string; media: number };
  menosCondutivo: { talhaoId: string; nome: string; media: number } | null;
}

export function resumoCe(itens: CeProf[]): ResumoCe | null {
  if (!itens.length) return null;
  const m = mediaPonderada(itens.map(i => ({ valor: i.media, peso: i.areaHa || 1 })));
  if (m == null) return null;
  const ord = [...itens].sort((a, b) => b.media - a.media);
  return {
    media: r2(m), min: Math.min(...itens.map(i => i.min)), max: Math.max(...itens.map(i => i.max)),
    nTalhoes: itens.length, nPontos: itens.reduce((s, i) => s + i.n, 0),
    maisCondutivo: { talhaoId: ord[0].talhaoId, nome: ord[0].nome, media: ord[0].media },
    menosCondutivo: ord.length > 1 ? { talhaoId: ord[ord.length - 1].talhaoId, nome: ord[ord.length - 1].nome, media: ord[ord.length - 1].media } : null,
  };
}

/** Variação dentro do talhão: (máx − mín) ÷ média, em % — quanto o solo muda ali. */
export const variacaoInterna = (c: CeProf): number | null => (c.media > 0 ? Math.round(((c.max - c.min) / c.media) * 100) : null);

// ═══ Altimetria ═════════════════════════════════════════════════════════════

export interface RelevoDetalhe {
  talhaoId: string; nome: string; areaHa: number;
  mdeId: string | null;
  altMin: number; altMed: number; altMax: number; amplitude: number;
  /** Declividade em GRAUS (como na aba Altimetria do talhão). */
  declMedia: number | null; declMax: number | null;
  fonte: string;
  resolucaoM: number | null;
}

type MdeCompleto = NonNullable<DadosPainel['mdes']>[number] & { resolucaoM?: number | null };

/** Relevo do talhão: o MDE oficial; sem ele, o primeiro com estatística. */
export function relevoDetalhe(d: DadosPainel): RelevoDetalhe | null {
  const mdes = (d.mdes ?? []) as MdeCompleto[];
  const m = mdes.find(x => x.oficial && x.stats) ?? mdes.find(x => x.stats);
  const s = m?.stats;
  if (!m || !s || !finito(s.alt_min) || !finito(s.alt_max)) return null;
  return {
    talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: areaDe(d), mdeId: m.id ?? null,
    altMin: s.alt_min, altMed: finito(s.alt_med) ? s.alt_med : (s.alt_min + s.alt_max) / 2, altMax: s.alt_max,
    amplitude: finito(s.amplitude) ? s.amplitude : s.alt_max - s.alt_min,
    declMedia: finito(s.decl_media) ? s.decl_media : null, declMax: finito(s.decl_max) ? s.decl_max : null,
    fonte: m.rotuloFonte ?? '', resolucaoM: finito(m.resolucaoM) ? m.resolucaoM : null,
  };
}

/** Graus → % (tan × 100): a unidade em que se fala de declive no campo. */
export const grausParaPct = (g: number): number => Math.tan((g * Math.PI) / 180) * 100;

/** Classes de relevo da Embrapa (declive em %): plano até 3 · suave ondulado até 8 ·
 *  ondulado até 20 · forte ondulado até 45 · montanhoso até 75 · escarpado acima. */
export function classeRelevo(declPct: number | null | undefined): { rotulo: string; ordem: number } | null {
  if (!finito(declPct)) return null;
  const faixas: Array<[number, string]> = [[3, 'Plano'], [8, 'Suave ondulado'], [20, 'Ondulado'], [45, 'Forte ondulado'], [75, 'Montanhoso']];
  const i = faixas.findIndex(([lim]) => declPct <= lim);
  return i >= 0 ? { rotulo: faixas[i][1], ordem: i } : { rotulo: 'Escarpado', ordem: 5 };
}

export interface ResumoRelevoDetalhe {
  altMin: number; altMax: number;
  /** Maior altitude − menor altitude entre todos os talhões do filtro. */
  amplitude: number;
  /** Maior desnível dentro de um talhão só. */
  amplitudeMaxTalhao: { talhaoId: string; nome: string; valor: number };
  declMedia: number | null; declMax: number | null;
  nTalhoes: number;
  maisInclinado: { talhaoId: string; nome: string; declMedia: number } | null;
}

export function resumoRelevoDetalhe(rel: RelevoDetalhe[]): ResumoRelevoDetalhe | null {
  if (!rel.length) return null;
  const altMin = Math.min(...rel.map(r => r.altMin)), altMax = Math.max(...rel.map(r => r.altMax));
  const dm = mediaPonderada(rel.map(r => ({ valor: r.declMedia, peso: r.areaHa || 1 })));
  const dmax = rel.map(r => r.declMax).filter(finito);
  const maiorAmp = rel.reduce((a, r) => (r.amplitude > a.amplitude ? r : a), rel[0]);
  const inclinados = rel.filter(r => r.declMedia != null).sort((a, b) => (b.declMedia ?? 0) - (a.declMedia ?? 0));
  return {
    altMin: r1(altMin), altMax: r1(altMax), amplitude: r1(altMax - altMin),
    amplitudeMaxTalhao: { talhaoId: maiorAmp.talhaoId, nome: maiorAmp.nome, valor: r1(maiorAmp.amplitude) },
    declMedia: dm == null ? null : r1(dm), declMax: dmax.length ? r1(Math.max(...dmax)) : null,
    nTalhoes: rel.length,
    maisInclinado: inclinados[0] ? { talhaoId: inclinados[0].talhaoId, nome: inclinados[0].nome, declMedia: inclinados[0].declMedia! } : null,
  };
}
