// Cálculos PUROS do relatório de COMPACTAÇÃO (penetrometria) — sem DOM, sem
// jsPDF, sem I/O. Testados em Node: npm run teste:relatoriocompactacao.
//
// O PDF (relatorioCompactacao.ts) só desenha o que sai daqui:
//   • classe de um valor pela legenda oficial (sys_compactacao, 5 classes em MPa);
//   • % de ÁREA por classe a partir do grid interpolado (ignora NaN = fora do
//     talhão/sem dado e, se vier o polígono, o centro de pixel fora dele);
//   • estatística por camada (pontos medidos) e média do mapa;
//   • a tabela pontos × camadas, com a linha de média e a paginação.

import type { ClasseLegenda } from './legendas.ts';
import type { PontoCompactacao } from './store.ts';

// ── classe ───────────────────────────────────────────────────────────────────

/**
 * Índice da classe do valor (0..n-1) ou -1 quando nenhuma classe o aceita.
 * Mesma convenção de `classeDoValor` (legendas.ts): semiaberta à esquerda —
 * v pertence à classe se (min == null || v > min) && (max == null || v <= max).
 * O valor exatamente na borda (1,5 MPa) fica na classe de BAIXO.
 */
export function indiceClasseValor(v: number, classes: ClasseLegenda[]): number {
  if (!Number.isFinite(v)) return -1;
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    const acimaMin = c.valorMin == null ? true : v > c.valorMin;
    const abaixoMax = c.valorMax == null ? true : v <= c.valorMax;
    if (acimaMin && abaixoMax) return i;
  }
  return -1;
}

const fmtNum = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** "<= 1,0" / "1,0 - 1,5" / "> 3,0" — texto só Latin-1 (fonte padrão do jsPDF). */
export function rotuloFaixaClasse(c: ClasseLegenda, casas = 1): string {
  if (c.valorMin == null && c.valorMax == null) return 'todos';
  if (c.valorMin == null) return `<= ${fmtNum(c.valorMax as number, casas)}`;
  if (c.valorMax == null) return `> ${fmtNum(c.valorMin, casas)}`;
  return `${fmtNum(c.valorMin, casas)} - ${fmtNum(c.valorMax, casas)}`;
}

// ── polígono (point-in-polygon par-ímpar, honra buracos) ────────────────────

type Poligono = GeoJSON.Polygon | GeoJSON.MultiPolygon;

function aneisDe(p: Poligono): number[][][] {
  return (p.type === 'Polygon' ? p.coordinates : p.coordinates.flat()) as number[][][];
}

/** Par-ímpar sobre TODOS os anéis: buraco dentro do polígono conta como fora. */
export function pontoNoPoligono(lng: number, lat: number, p: Poligono): boolean {
  let dentro = false;
  for (const anel of aneisDe(p)) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

// ── % de área por classe ─────────────────────────────────────────────────────

export interface AreaPorClasse {
  /** Pixels válidos (finitos e dentro do talhão). */
  nPix: number;
  /** Pixels por classe (mesma ordem da legenda). */
  pixPorClasse: number[];
  /** % da área válida por classe (soma 100 quando nPix > 0). */
  pct: number[];
  /** Área por classe em ha (nPix × pixel²) — só quando pixelM é informado. */
  ha: number[];
  /** Média dos valores do MAPA (pixels válidos), na unidade da legenda. */
  mediaMapa: number | null;
  /** Pixels finitos que não caíram em classe nenhuma (não deveria acontecer). */
  semClasse: number;
}

export interface OpcoesArea {
  /** Tamanho do pixel em metros (para a área em ha). */
  pixelM?: number;
  /** [oeste, sul, leste, norte] do grid — necessário para testar o polígono. */
  bounds?: [number, number, number, number];
  /** Contorno do talhão: pixel cujo CENTRO cai fora é ignorado. */
  poligono?: Poligono | null;
}

/**
 * Conta, a partir do grid interpolado (norte no topo, `valores[r*cols + c]`),
 * quantos pixels caem em cada classe. NaN/Infinity = nodata (fora do talhão).
 */
export function areaPorClasse(
  valores: ArrayLike<number>, rows: number, cols: number,
  classes: ClasseLegenda[], op: OpcoesArea = {},
): AreaPorClasse {
  const k = classes.length;
  const pix = new Array<number>(k).fill(0);
  let nPix = 0, semClasse = 0, soma = 0;
  const usarPoli = !!(op.poligono && op.bounds);
  const [w, s, e, n] = op.bounds ?? [0, 0, 1, 1];
  const dx = (e - w) / (cols || 1), dy = (n - s) / (rows || 1);
  for (let r = 0; r < rows; r++) {
    const lat = n - (r + 0.5) * dy;
    for (let c = 0; c < cols; c++) {
      const v = valores[r * cols + c];
      if (!Number.isFinite(v)) continue;
      if (usarPoli && !pontoNoPoligono(w + (c + 0.5) * dx, lat, op.poligono as Poligono)) continue;
      const i = indiceClasseValor(v, classes);
      if (i < 0) { semClasse++; continue; }
      pix[i]++; nPix++; soma += v;
    }
  }
  const areaPix = op.pixelM ? (op.pixelM * op.pixelM) / 10000 : 0;
  return {
    nPix,
    pixPorClasse: pix,
    pct: pix.map(p => (nPix > 0 ? (p / nPix) * 100 : 0)),
    ha: pix.map(p => p * areaPix),
    mediaMapa: nPix > 0 ? soma / nPix : null,
    semClasse,
  };
}

// ── estatística dos pontos por camada ────────────────────────────────────────

export interface EstatPontos { n: number; media: number; min: number; max: number }

export function estatisticaPontos(pontos: PontoCompactacao[], prof: string): EstatPontos | null {
  const vs = pontos.map(p => p.valores[prof]).filter((v): v is number => v != null && Number.isFinite(v));
  if (vs.length === 0) return null;
  let mn = Infinity, mx = -Infinity, soma = 0;
  for (const v of vs) { soma += v; if (v < mn) mn = v; if (v > mx) mx = v; }
  return { n: vs.length, media: soma / vs.length, min: mn, max: mx };
}

/** "idw" → "IDW"; qualquer modelo de variograma → "Krigagem (esférico)". */
export function rotuloMetodo(modelo: string | null | undefined): string {
  const m = (modelo ?? '').trim();
  if (!m) return '—';
  if (m.toLowerCase() === 'idw') return 'IDW';
  return `Krigagem (${m})`;
}

/** Método resumido (sem o modelo) — para o cabeçalho. Vários = "Krigagem / IDW". */
export function metodoGeral(modelos: Array<string | null | undefined>): string {
  const set = new Set(modelos.map(m => ((m ?? '').toLowerCase() === 'idw' ? 'IDW' : 'Krigagem')));
  return [...set].sort().join(' / ') || '—';
}

// ── prontidão ────────────────────────────────────────────────────────────────

/** Profundidades da importação que ainda NÃO têm mapa interpolado. */
export function camadasFaltando(profundidades: string[], interpoladas: Iterable<string>): string[] {
  const ok = new Set(interpoladas);
  return profundidades.filter(p => !ok.has(p));
}

// ── tabela pontos × camadas ──────────────────────────────────────────────────

export interface CelulaTabela { valor: number | null; classe: number }
export interface LinhaTabela { ponto: number; medicao: string; celulas: CelulaTabela[] }
export interface TabelaCompactacao {
  profundidades: string[];
  linhas: LinhaTabela[];
  /** Média por camada (dos pontos com leitura), com a classe da média. */
  media: CelulaTabela[];
}

export function montarTabela(
  pontos: PontoCompactacao[], profundidades: string[], classes: ClasseLegenda[],
): TabelaCompactacao {
  const linhas: LinhaTabela[] = pontos.map((p, i) => ({
    ponto: i + 1,
    medicao: (p.medicao ?? '').trim() || String(i + 1),
    celulas: profundidades.map(prof => {
      const v = p.valores[prof];
      const ok = v != null && Number.isFinite(v);
      return { valor: ok ? v : null, classe: ok ? indiceClasseValor(v, classes) : -1 };
    }),
  }));
  const media = profundidades.map(prof => {
    const e = estatisticaPontos(pontos, prof);
    return e ? { valor: e.media, classe: indiceClasseValor(e.media, classes) } : { valor: null, classe: -1 };
  });
  return { profundidades, linhas, media };
}

/** Quebra `n` linhas em páginas de até `porPagina` (a última pode ser menor). */
export function paginar<T>(itens: T[], porPagina: number): T[][] {
  const tam = Math.max(1, Math.floor(porPagina));
  if (itens.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tam) out.push(itens.slice(i, i + tam));
  return out;
}

// ── grade das miniaturas (página de resumo) ─────────────────────────────────

/** Colunas × linhas para `n` miniaturas: até 3 numa linha, 4–6 em 3×2, 7–8 em 4×2, 9 em 3×3… */
export function gradeMiniaturas(n: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 1 };
  if (n <= 3) return { cols: n, rows: 1 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 8) return { cols: 4, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  const cols = 4;
  return { cols, rows: Math.ceil(n / cols) };
}
