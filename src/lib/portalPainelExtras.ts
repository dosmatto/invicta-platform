// Contas puras das páginas EXTRAS do Portal do Produtor v2: Linhas de plantio,
// Relatórios/Recomendações e Comparativo Invicta. Sem DOM, sem rede — testado
// em `node scripts/teste-portal-extras.mjs` (imports com `.ts` explícito).
//
// Regra de ouro da tela: só mostra o que EXISTE. Aqui nada é estimado — se não
// há base para uma conta, ela devolve null e a tela diz o que falta.

import { anoDaSafra } from './periodo.ts';
import type { DadosPainel } from './portalPainel.ts';

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

// ═══════════════════════════════════════════════════════════════════════════
// LINHAS DE PLANTIO (PrecisionFarm)
// ═══════════════════════════════════════════════════════════════════════════

/** O mínimo de uma camada de linhas que a página usa (subconjunto de CamadaLinhasPF). */
export interface CamadaLinhaMin {
  resourceId: string;
  nome?: string | null;
  ciclo: string | null;
  categoria: string | null;
  espacamentoM: number | null;
  revisaoGeometria: number | null;
  arquivada: boolean;
  ultimaSincronizacao: string | null;
  situacao: 'atualizado' | 'sincronizando' | 'erro';
  revisoes: Array<{ n: number; operacao: 'upsert' | 'archive'; nFeicoes: number | null }>;
}

/** Camadas que contam como "o talhão tem linhas": com geometria e não arquivadas
 *  (mesma regra de camadasVisiveisPF, repetida aqui para o teste em node). */
export const camadasComLinhas = <T extends Pick<CamadaLinhaMin, 'revisaoGeometria' | 'arquivada'>>(c: T[]): T[] =>
  c.filter(x => x.revisaoGeometria != null && !x.arquivada);

/** Nº de feições da revisão desenhável da camada (null = o servidor não informou). */
export function feicoesDaCamada(c: CamadaLinhaMin): number | null {
  const r = c.revisoes.find(x => x.n === c.revisaoGeometria && x.operacao === 'upsert');
  return r && finito(r.nFeicoes) ? r.nFeicoes : null;
}

export interface LinhasDoTalhao { talhaoId: string; areaHa: number; camadas: CamadaLinhaMin[] }

export interface ResumoLinhas {
  /** Talhões com ao menos uma camada de linhas. */
  nTalhoes: number;
  areaHa: number;
  nCamadas: number;
  /** Espaçamentos distintos (m) com quantas camadas usam cada um, do mais comum. */
  espacamentos: Array<{ m: number; nCamadas: number }>;
  /** Sincronização mais recente (ISO) entre as camadas. */
  ultimaSincronizacao: string | null;
  /** Camadas com sincronização em andamento ou com erro (para avisar). */
  nSincronizando: number;
  nErro: number;
}

export function resumirLinhas(itens: LinhasDoTalhao[]): ResumoLinhas {
  const esp = new Map<number, number>();
  let nTalhoes = 0, areaHa = 0, nCamadas = 0, nSinc = 0, nErro = 0;
  let ultima: string | null = null;
  for (const it of itens) {
    const cs = camadasComLinhas(it.camadas);
    if (!cs.length) continue;
    nTalhoes++; areaHa += finito(it.areaHa) ? it.areaHa : 0; nCamadas += cs.length;
    for (const c of cs) {
      if (finito(c.espacamentoM)) esp.set(c.espacamentoM, (esp.get(c.espacamentoM) ?? 0) + 1);
      if (c.situacao === 'sincronizando') nSinc++;
      if (c.situacao === 'erro') nErro++;
      if (c.ultimaSincronizacao && (!ultima || c.ultimaSincronizacao > ultima)) ultima = c.ultimaSincronizacao;
    }
  }
  return {
    nTalhoes, areaHa: r1(areaHa), nCamadas,
    espacamentos: [...esp.entries()].map(([m, n]) => ({ m, nCamadas: n })).sort((a, b) => b.nCamadas - a.nCamadas || a.m - b.m),
    ultimaSincronizacao: ultima, nSincronizando: nSinc, nErro,
  };
}

/** Conta as feições da geometria: bordadura (`kind: 'headland'`) × linha guia
 *  (qualquer outro valor, como a plataforma desenha). */
export function contarFeicoes(fc: { features?: Array<{ properties?: Record<string, unknown> | null }> } | null | undefined): { guia: number; bordadura: number } {
  let guia = 0, bordadura = 0;
  for (const f of fc?.features ?? []) {
    if (f.properties && f.properties.kind === 'headland') bordadura++; else guia++;
  }
  return { guia, bordadura };
}

type Pos = number[];
/** Caminho SVG "M x y L x y…" de uma LineString/MultiLineString no quadro `ponto`,
 *  descartando vértices a menos de `minPx` do anterior (linhas de 10 mil pontos
 *  não precisam de todos para o olho). Devolve '' sem linha válida. */
export function caminhoLinhas(
  geometria: { type?: string; coordinates?: unknown } | null | undefined,
  ponto: (lng: number, lat: number) => [number, number],
  minPx = 0.6,
): string {
  if (!geometria || !Array.isArray(geometria.coordinates)) return '';
  const linhas: Pos[][] = geometria.type === 'LineString' ? [geometria.coordinates as Pos[]]
    : geometria.type === 'MultiLineString' ? geometria.coordinates as Pos[][] : [];
  let d = '';
  for (const l of linhas) {
    if (!Array.isArray(l) || l.length < 2) continue;
    let ux = NaN, uy = NaN, n = 0;
    const seg: string[] = [];
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (!Array.isArray(p) || !finito(p[0]) || !finito(p[1])) continue;
      const [x, y] = ponto(p[0], p[1]);
      const ultimo = i === l.length - 1;
      if (n > 0 && !ultimo && Math.hypot(x - ux, y - uy) < minPx) continue;
      seg.push(`${n === 0 ? 'M' : 'L'}${x} ${y}`);
      ux = x; uy = y; n++;
    }
    if (n >= 2) d += seg.join('');
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// RELATÓRIOS E RECOMENDAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

export interface DocPortal {
  talhaoId: string;
  talhaoNome: string;
  /** 'Fertilidade', 'Recomendação', 'Compactação', 'Camadas'… (relatório) ou 'Cenário' (recomendação). */
  tipo: string;
  titulo: string;
  safra: string | null;
  ano: number | null;
  /** Instante de geração (ms); null = registro sem data. */
  em: number | null;
  oficial: boolean;
}

/** geradoEm vem em ms (Date.now()) ou ISO; null se não der para ler. */
export function instanteDe(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  if (Number.isFinite(n) && /^\d{10,}$/.test(v.trim())) return n;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const ehOficial = (v: unknown) => v === true || v === 'true' || v === 1;

export interface DocsDoPortal { relatorios: DocPortal[]; cenarios: DocPortal[] }

/** Relatórios (inv_relatorios) e cenários de recomendação (inv_cenarios) dos
 *  talhões, mais recentes primeiro. `ano` filtra pela safra; null = todas as
 *  safras. Registro SEM safra só aparece em "todas" — nunca é chutado para um ano. */
export function documentosDoPortal(dados: DadosPainel[], ano: number | null): DocsDoPortal {
  const relatorios: DocPortal[] = [], cenarios: DocPortal[] = [];
  for (const d of dados) {
    for (const r of d.relatorios ?? []) {
      const a = r.safra ? anoDaSafra(r.safra) : null;
      if (ano != null && a !== ano) continue;
      relatorios.push({ talhaoId: d.talhao.id, talhaoNome: d.talhao.nome, tipo: r.tipo?.trim() || 'Relatório', titulo: r.titulo?.trim() || 'Relatório', safra: r.safra ?? null, ano: a, em: instanteDe(r.geradoEm), oficial: false });
    }
    for (const c of d.cenarios ?? []) {
      const a = c.safra ? anoDaSafra(c.safra) : null;
      if (ano != null && a !== ano) continue;
      cenarios.push({ talhaoId: d.talhao.id, talhaoNome: d.talhao.nome, tipo: 'Recomendação', titulo: c.nome?.trim() || 'Recomendação', safra: c.safra ?? null, ano: a, em: instanteDe(c.geradoEm), oficial: ehOficial(c.oficial) });
    }
  }
  const maisRecente = (a: DocPortal, b: DocPortal) => (b.em ?? -1) - (a.em ?? -1) || a.talhaoNome.localeCompare(b.talhaoNome, 'pt-BR', { numeric: true });
  return { relatorios: relatorios.sort(maisRecente), cenarios: cenarios.sort(maisRecente) };
}

export interface DocsPorTalhao { talhaoId: string; nome: string; areaHa: number; nRelatorios: number; nCenarios: number; ultimo: number | null }

/** Uma linha por talhão do escopo (inclusive os sem nada — o produtor quer ver o que FALTA). */
export function docsPorTalhao(dados: DadosPainel[], docs: DocsDoPortal): DocsPorTalhao[] {
  const rel = new Map<string, DocPortal[]>(), cen = new Map<string, DocPortal[]>();
  for (const r of docs.relatorios) (rel.get(r.talhaoId) ?? rel.set(r.talhaoId, []).get(r.talhaoId)!).push(r);
  for (const c of docs.cenarios) (cen.get(c.talhaoId) ?? cen.set(c.talhaoId, []).get(c.talhaoId)!).push(c);
  return dados.map(d => {
    const rs = rel.get(d.talhao.id) ?? [], cs = cen.get(d.talhao.id) ?? [];
    const instantes = [...rs, ...cs].map(x => x.em).filter(finito);
    return {
      talhaoId: d.talhao.id, nome: d.talhao.nome, areaHa: finito(d.talhao.areaHa) ? d.talhao.areaHa : 0,
      nRelatorios: rs.length, nCenarios: cs.length, ultimo: instantes.length ? Math.max(...instantes) : null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPARATIVO INVICTA (benchmark anônimo)
// ═══════════════════════════════════════════════════════════════════════════

/** "Top X%" = 100 − percentil (rank médio 0–100 do servidor), arredondado e
 *  nunca abaixo de 1% (ninguém é "Top 0%"). */
export function topoPct(percentil: number | null | undefined): number | null {
  if (!finito(percentil)) return null;
  return Math.min(100, Math.max(1, Math.round(100 - percentil)));
}

export interface Diferenca { abs: number; pct: number | null }

/** Você − média, em unidade e em % da média (null sem média ou média 0). */
export function diferenca(voce: number | null | undefined, media: number | null | undefined): Diferenca | null {
  if (!finito(voce) || !finito(media)) return null;
  return { abs: Math.round((voce - media) * 100) / 100, pct: media === 0 ? null : Math.round(((voce - media) / media) * 1000) / 10 };
}

/** Fração 0–1 da posição de `v` num eixo [min,max] (para marcadores em réguas). */
export function posicaoNoEixo(v: number, min: number, max: number): number {
  if (!(max > min)) return 0.5;
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

export interface LinhaFertilidade { id: 'p' | 'k' | 'v'; voce: number | null; media: number; dif: Diferenca | null }

/** P, K e V%: só entram os nutrientes em que o servidor mandou a média do escopo
 *  (cada um exige ≥ 5 produtores). `voce` pode faltar (você sem laudo no ano). */
export function linhasFertilidade(f: { medias?: { p?: number; k?: number; v?: number }; voce?: { p?: number; k?: number; v?: number } } | null | undefined): LinhaFertilidade[] {
  const out: LinhaFertilidade[] = [];
  for (const id of ['p', 'k', 'v'] as const) {
    const media = f?.medias?.[id];
    if (!finito(media)) continue;
    const voce = f?.voce?.[id];
    out.push({ id, voce: finito(voce) ? voce : null, media, dif: diferenca(voce, media) });
  }
  return out;
}

/** Ordem de exibição das culturas: a do filtro primeiro, depois as em que você
 *  tem posição, depois as demais — mantendo a ordem do servidor dentro de cada grupo. */
export function ordenarCulturasBench<T extends { cultura: string; voce?: unknown }>(itens: T[], preferida: string, norm: (s: string) => string): T[] {
  const peso = (x: T) => (preferida && norm(x.cultura) === norm(preferida) ? 0 : x.voce ? 1 : 2);
  return itens.map((x, i) => ({ x, i })).sort((a, b) => peso(a.x) - peso(b.x) || a.i - b.i).map(o => o.x);
}
