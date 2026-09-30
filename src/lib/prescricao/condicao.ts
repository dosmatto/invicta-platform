// PRESCRIÇÃO POR CONDIÇÃO NO MAPA DE FERTILIDADE — módulo PURO.
//
// O pedido do agrônomo: "acima de 40 mg de P aplico 100 kg de 00-30-10, abaixo
// disso 150". Aqui a fonte das áreas de aplicação NÃO é um zoneamento: é o mapa
// interpolado de um nutriente, recortado nos limiares que ele digitou. Cada
// FAIXA de valor vira um (Multi)Polygon com a sua dose — e daí em diante a
// prescrição é igual a qualquer outra (zonas + fc), então SHP/Excel/PDF saem sem
// mudança nenhuma na exportação.
//
// Convenção das faixas (limiares L0 < L1 < … < Ln-1, N = n+1 faixas):
//   faixa 0   : valor <  L0
//   faixa i   : L(i-1) ≤ valor < L(i)
//   faixa n   : valor ≥ L(n-1)
// Sem lacuna nem sobreposição: todo número finito cai em exatamente uma faixa.
//
// Pipeline (tudo na malha do mapa, sem turf.union por pixel):
//   1. classifica cada nó pela faixa; nós SEM valor (NaN) que ainda tocam o
//      talhão herdam a faixa do vizinho válido mais próximo (a krigagem pode
//      deixar um fio NaN na divisa — sem isso ele viraria área sem dose);
//      nós inteiramente fora do talhão (cobertura 0) são ignorados;
//   2. absorve MANCHAS conexas (4-vizinhança) menores que a área mínima na
//      faixa vizinha de maior contato, até estabilizar. Mancha sem vizinha de
//      outra faixa (o talhão todo numa faixa só, ou uma gleba isolada) fica —
//      apagar área do talhão é pior do que deixar uma mancha pequena;
//   3. vetoriza pelo TRAÇADO DE BORDAS das células de cada faixa (anéis
//      fechados, externo anti-horário, buraco horário);
//   4. recorta cada faixa pelo contorno do talhão; a área reportada é a do
//      recorte — é ela que multiplica a dose no total do produto.
//
// Roda: npm run teste:prescricaocondicao

import turfArea from '@turf/area';
import turfIntersect from '@turf/intersect';
import { featureCollection, feature as turfFeature } from '@turf/helpers';
import { coberturaDoGrid } from '../recomendacao/cobertura.ts';
import { limparGeometria, PARTE_DEGENERADA_M2 } from '../meap/fundir.ts';
import type { ZonaDose } from './tipos.ts';
import { distribuirPorAjuste } from './calculo.ts';

type Pt = [number, number];
type Poligonal = GeoJSON.Polygon | GeoJSON.MultiPolygon;

const METRO_GRAU_LAT = 110540;
const METRO_GRAU_LON = 111320;

// ── Faixas ──────────────────────────────────────────────────────────────────

/** Erro de validação dos limiares, ou null se estão bons. */
export function validarLimiares(limiares: number[]): string | null {
  if (!limiares.length) return 'Informe ao menos um limiar (um limiar = duas faixas).';
  if (limiares.some(l => !Number.isFinite(l))) return 'Todo limiar precisa ser um número.';
  for (let i = 1; i < limiares.length; i++) {
    if (!(limiares[i] > limiares[i - 1])) return 'Os limiares precisam ser crescentes e diferentes entre si.';
  }
  return null;
}

/** Faixa de um valor: nº de limiares ≤ valor. NaN/±∞ → -1 (sem classe). */
export function faixaDoValor(v: number, limiares: number[]): number {
  if (!Number.isFinite(v)) return -1;
  let k = 0;
  while (k < limiares.length && v >= limiares[k]) k++;
  return k;
}

const fmtNum = (v: number) => {
  const s = Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  return s.replace('.', ',');
};

/**
 * Rótulo da faixa. `ascii` = só caracteres que o PDF (latin1) e o DBF desenham:
 * é o que vai no `nomeZona`, que atravessa a exportação sem mudança. A tela usa
 * a versão com ≥/≤.
 */
export function rotuloFaixa(i: number, limiares: number[], sigla: string, ascii = false): string {
  const ge = ascii ? '>=' : '≥';
  const le = ascii ? '<=' : '≤';
  const n = limiares.length;
  if (i <= 0) return `${sigla} < ${fmtNum(limiares[0])}`;
  if (i >= n) return `${sigla} ${ge} ${fmtNum(limiares[n - 1])}`;
  return ascii
    ? `${fmtNum(limiares[i - 1])}<=${sigla}<${fmtNum(limiares[i])}`
    : `${fmtNum(limiares[i - 1])} ${le} ${sigla} < ${fmtNum(limiares[i])}`;
}

// Cor da faixa: do vermelho (teor baixo) ao verde (teor alto) — a mesma leitura
// de semáforo das zonas de manejo.
const RAMPA = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#16a34a', '#0d9488', '#2563eb'];
export function corDaFaixa(i: number, nFaixas: number): string {
  if (nFaixas <= 1) return RAMPA[4];
  const t = i / (nFaixas - 1);
  return RAMPA[Math.round(t * 4)] ?? RAMPA[4];
}

// ── Raster ──────────────────────────────────────────────────────────────────

export interface GridValores {
  valores: ArrayLike<number>;           // rows*cols, linha 0 = NORTE, NaN fora
  rows: number;
  cols: number;
  /** [oeste, sul, leste, norte] = extensão dos NÓS (convenção do backend). */
  bounds: [number, number, number, number];
}

interface Geo { dx: number; dy: number; w: number; n: number }
function geoDe(g: GridValores): Geo {
  const [w, s, e, n] = g.bounds;
  const dx = g.cols > 1 ? (e - w) / (g.cols - 1) : (e - w);
  const dy = g.rows > 1 ? (n - s) / (g.rows - 1) : (n - s);
  return { dx, dy, w, n };
}

/** Área (ha) de uma célula inteira na linha r. */
function areaCelulaHa(geo: Geo, r: number): number {
  const lat = geo.n - r * geo.dy;
  return (geo.dx * METRO_GRAU_LON * Math.cos((lat * Math.PI) / 180)) * (geo.dy * METRO_GRAU_LAT) / 10_000;
}

/**
 * Classifica o grid e resolve os nós sem valor que tocam o talhão.
 * Devolve a classe por nó (-1 = fora) e o peso em ha de cada nó (fração dentro
 * do talhão × área da célula).
 */
export function classificarGrid(
  g: GridValores, limiares: number[], poligono: Poligonal,
): { classes: Int16Array; areaHa: Float64Array; valorMin: number; valorMax: number; preenchidos: number } {
  const { rows, cols } = g;
  const total = rows * cols;
  const classes = new Int16Array(total).fill(-1);
  const cob = coberturaDoGrid([rows, cols], g.bounds, poligono);
  const geo = geoDe(g);
  const areaHa = new Float64Array(total);
  let valorMin = Infinity, valorMax = -Infinity;
  for (let r = 0; r < rows; r++) {
    const aCel = areaCelulaHa(geo, r);
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      areaHa[i] = cob[i] * aCel;
      const v = Number(g.valores[i]);
      classes[i] = faixaDoValor(v, limiares);
      if (cob[i] > 0 && Number.isFinite(v)) {
        if (v < valorMin) valorMin = v;
        if (v > valorMax) valorMax = v;
      }
    }
  }
  // Preenche os NaN por BFS a partir dos nós válidos (vizinho mais próximo em
  // passos de 4-vizinhança). Só interessa a quem toca o talhão, mas o BFS
  // precisa atravessar o grid todo para alcançá-los.
  const fila = new Int32Array(total);
  let ini = 0, fim = 0;
  const cls = Int16Array.from(classes);
  for (let i = 0; i < total; i++) if (cls[i] >= 0) fila[fim++] = i;
  while (ini < fim) {
    const i = fila[ini++];
    const r = (i / cols) | 0, c = i - r * cols;
    const viz = [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1];
    for (const j of viz) {
      if (j >= 0 && cls[j] < 0) { cls[j] = cls[i]; fila[fim++] = j; }
    }
  }
  let preenchidos = 0;
  for (let i = 0; i < total; i++) {
    if (areaHa[i] <= 0) { classes[i] = -1; continue; }   // fora do talhão: ignorado
    if (classes[i] < 0 && cls[i] >= 0) preenchidos++;
    classes[i] = cls[i];
  }
  return { classes, areaHa, valorMin, valorMax, preenchidos };
}

/**
 * Absorve manchas conexas (4-vizinhança) com área < areaMinHa na faixa vizinha
 * de maior contato (em nº de lados de célula compartilhados). Muta `classes`.
 * Processa sempre a MENOR mancha primeiro e reavalia depois de cada fusão —
 * duas manchinhas vizinhas podem juntas passar do mínimo. Mancha sem vizinha
 * de outra faixa nunca é apagada. Devolve quantas manchas foram absorvidas.
 */
export function absorverManchas(
  classes: Int16Array, rows: number, cols: number, areaHa: ArrayLike<number>, areaMinHa: number,
): number {
  if (!(areaMinHa > 0)) return 0;
  const total = rows * cols;
  // 1. rotula componentes
  const rot = new Int32Array(total).fill(-1);
  const clsReg: number[] = [];
  const areaReg: number[] = [];
  const pilha: number[] = [];
  for (let i = 0; i < total; i++) {
    if (classes[i] < 0 || rot[i] >= 0) continue;
    const id = clsReg.length;
    clsReg.push(classes[i]); areaReg.push(0);
    rot[i] = id; pilha.push(i);
    while (pilha.length) {
      const k = pilha.pop()!;
      areaReg[id] += areaHa[k];
      const r = (k / cols) | 0, c = k - r * cols;
      const viz = [r > 0 ? k - cols : -1, r < rows - 1 ? k + cols : -1, c > 0 ? k - 1 : -1, c < cols - 1 ? k + 1 : -1];
      for (const j of viz) {
        if (j >= 0 && rot[j] < 0 && classes[j] === classes[i]) { rot[j] = id; pilha.push(j); }
      }
    }
  }
  const nReg = clsReg.length;
  // 2. grafo de adjacência (contato = nº de lados compartilhados)
  const adj: Array<Map<number, number>> = Array.from({ length: nReg }, () => new Map());
  const somaAdj = (a: number, b: number, n: number) => adj[a].set(b, (adj[a].get(b) ?? 0) + n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, a = rot[i];
      if (a < 0) continue;
      if (c < cols - 1) { const b = rot[i + 1]; if (b >= 0 && b !== a) { somaAdj(a, b, 1); somaAdj(b, a, 1); } }
      if (r < rows - 1) { const b = rot[i + cols]; if (b >= 0 && b !== a) { somaAdj(a, b, 1); somaAdj(b, a, 1); } }
    }
  }
  // 3. fusões
  const pai = Array.from({ length: nReg }, (_, i) => i);
  const vivo = new Array<boolean>(nReg).fill(true);
  const achar = (x: number): number => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
  /** Funde `a` dentro de `b` (b sobrevive, com a classe de b). */
  const fundir = (a: number, b: number) => {
    for (const [nb, cnt] of adj[a]) {
      if (nb === b) continue;
      adj[b].set(nb, (adj[b].get(nb) ?? 0) + cnt);
      adj[nb].delete(a);
      adj[nb].set(b, (adj[nb].get(b) ?? 0) + cnt);
    }
    adj[b].delete(a);
    adj[a].clear();
    areaReg[b] += areaReg[a];
    vivo[a] = false; pai[a] = b;
  };
  let absorvidas = 0;
  const TOL = 1e-9;
  for (;;) {
    let alvo = -1;
    for (let i = 0; i < nReg; i++) {
      if (!vivo[i] || areaReg[i] >= areaMinHa - TOL || adj[i].size === 0) continue;
      if (alvo < 0 || areaReg[i] < areaReg[alvo]) alvo = i;
    }
    if (alvo < 0) break;
    // faixa vizinha de maior contato (somando todas as manchas daquela faixa)
    const porClasse = new Map<number, number>();
    for (const [nb, cnt] of adj[alvo]) porClasse.set(clsReg[nb], (porClasse.get(clsReg[nb]) ?? 0) + cnt);
    let melhorCls = -1, melhorCnt = -1;
    for (const [k, cnt] of porClasse) {
      if (cnt > melhorCnt || (cnt === melhorCnt && k < melhorCls)) { melhorCls = k; melhorCnt = cnt; }
    }
    // entra na mancha daquela faixa com maior contato; as demais da mesma
    // faixa que encostam passam a ser UMA só (ficaram conectadas)
    let destino = -1, dCnt = -1;
    for (const [nb, cnt] of adj[alvo]) if (clsReg[nb] === melhorCls && cnt > dCnt) { destino = nb; dCnt = cnt; }
    fundir(alvo, destino);
    absorvidas++;
    for (;;) {
      const mesma = [...adj[destino].keys()].find(nb => clsReg[nb] === clsReg[destino]);
      if (mesma == null) break;
      fundir(mesma, destino);
    }
  }
  for (let i = 0; i < total; i++) if (rot[i] >= 0) classes[i] = clsReg[achar(rot[i])];
  return absorvidas;
}

// ── Vetorização ─────────────────────────────────────────────────────────────

// Direções no plano geográfico (y para cima): E, N, W, S — anti-horário.
const DV = [[0, 1], [-1, 0], [0, -1], [1, 0]] as const;   // [dvr, dvc] em vértices

/**
 * Anéis da borda das células da classe k, em índices de VÉRTICE (vr 0..rows,
 * vc 0..cols). Interior sempre à esquerda: externo anti-horário, buraco horário.
 * Em vértice de "sela" (duas células da faixa só pela diagonal) vira sempre à
 * esquerda — as células ficam em anéis separados, coerente com a 4-vizinhança.
 */
export function tracarAneis(classes: ArrayLike<number>, rows: number, cols: number, k: number): Array<Array<[number, number]>> {
  const VC = cols + 1;
  const em = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols && classes[r * cols + c] === k;
  // saídas por vértice: até 2 arestas (sela)
  const saidas = new Map<number, number[]>();   // vértice → dirs
  const add = (vr: number, vc: number, d: number) => {
    const key = vr * VC + vc;
    const l = saidas.get(key);
    if (l) l.push(d); else saidas.set(key, [d]);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!em(r, c)) continue;
      if (!em(r + 1, c)) add(r + 1, c, 0);       // base: → leste
      if (!em(r, c + 1)) add(r + 1, c + 1, 1);   // direita: → norte
      if (!em(r - 1, c)) add(r, c + 1, 2);       // topo: → oeste
      if (!em(r, c - 1)) add(r, c, 3);           // esquerda: → sul
    }
  }
  const aneis: Array<Array<[number, number]>> = [];
  for (const [chave0, dirs0] of saidas) {
    while (dirs0.length) {
      const vr0 = Math.floor(chave0 / VC), vc0 = chave0 - vr0 * VC;
      const d0 = dirs0.pop()!;
      let d = d0;
      const anel: Array<[number, number]> = [[vr0, vc0]];
      let vr = vr0, vc = vc0;
      let fechou = false;
      for (let guarda = 0; guarda < 4 * (rows + 1) * (cols + 1) + 8; guarda++) {
        vr += DV[d][0]; vc += DV[d][1];
        const noInicio = vr === vr0 && vc === vc0;
        const lista = saidas.get(vr * VC + vc) ?? [];
        // prioridade: esquerda, reto, direita. No vértice inicial, a aresta de
        // partida (já consumida) conta como candidata: se ela é a vez, fechou.
        let prox = -1;
        for (const cand of [(d + 1) % 4, d, (d + 3) % 4]) {
          if (noInicio && cand === d0) { fechou = true; break; }
          const pos = lista.indexOf(cand);
          if (pos >= 0) { prox = cand; lista.splice(pos, 1); break; }
        }
        if (fechou || prox < 0) break;
        if (prox !== d) anel.push([vr, vc]);    // só guarda as quinas
        d = prox;
      }
      // chegou ao início na mesma direção em que saiu → o vértice inicial está
      // no meio de um lado reto, não é quina
      if (fechou && d === d0) anel.shift();
      if (fechou && anel.length >= 4) { anel.push([anel[0][0], anel[0][1]]); aneis.push(anel); }
    }
  }
  return aneis;
}

const areaAssinada = (anel: Pt[]) => {
  let a = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) a += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
  return a / 2;
};
function pip(x: number, y: number, ring: Pt[]): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-300) + xi)) dentro = !dentro;
  }
  return dentro;
}

/** MultiPolygon (lon/lat) das células da classe k, ou null se não há nenhuma. */
export function vetorizarClasse(
  classes: ArrayLike<number>, g: Pick<GridValores, 'rows' | 'cols' | 'bounds'>, k: number,
): GeoJSON.MultiPolygon | null {
  const { rows, cols } = g;
  const [w, s, e, n] = g.bounds;
  const dx = cols > 1 ? (e - w) / (cols - 1) : (e - w);
  const dy = rows > 1 ? (n - s) / (rows - 1) : (n - s);
  const aneisV = tracarAneis(classes, rows, cols, k);
  if (!aneisV.length) return null;
  const toLL = ([vr, vc]: [number, number]): Pt => [w + (vc - 0.5) * dx, n - (vr - 0.5) * dy];
  const externos: Array<{ anel: Pt[]; area: number; buracos: Pt[][] }> = [];
  const buracos: Pt[][] = [];
  for (const av of aneisV) {
    const anel = av.map(toLL);
    const a = areaAssinada(anel);
    if (a > 0) externos.push({ anel, area: a, buracos: [] }); else buracos.push(anel);
  }
  for (const b of buracos) {
    // ponto de teste: meio da 1ª aresta do buraco — aresta de borda pertence a
    // UM anel só, então o ponto nunca cai sobre outro anel.
    const px = (b[0][0] + b[1][0]) / 2, py = (b[0][1] + b[1][1]) / 2;
    let dono: (typeof externos)[number] | null = null;
    for (const ex of externos) {
      if (pip(px, py, ex.anel) && (!dono || ex.area < dono.area)) dono = ex;
    }
    if (dono) dono.buracos.push(b);
  }
  return { type: 'MultiPolygon', coordinates: externos.map(ex => [ex.anel, ...ex.buracos]) };
}

/** Recorta pelo talhão; null se nada sobra. */
function recortar(geom: GeoJSON.MultiPolygon, talhao: Poligonal): Poligonal | null {
  let r: GeoJSON.Feature<Poligonal> | null = null;
  try {
    r = turfIntersect(featureCollection([turfFeature(geom), turfFeature(talhao)])) as GeoJSON.Feature<Poligonal> | null;
  } catch { r = null; }
  if (!r?.geometry) return null;
  const limpa = limparGeometria(r.geometry, PARTE_DEGENERADA_M2) as Poligonal;
  return turfArea(turfFeature(limpa)) < PARTE_DEGENERADA_M2 ? null : limpa;
}

// ── Orquestração ────────────────────────────────────────────────────────────

export interface EntradaCondicao {
  grid: GridValores;
  limiares: number[];
  /** Dose por faixa (length = limiares.length + 1), na UnidadeDose da prescrição. */
  doses: number[];
  /** Contorno do talhão (WGS84). */
  talhao: Poligonal;
  /** Manchas menores que isto (ha) são absorvidas. Padrão 0,5; 0 desliga. */
  areaMinHa?: number;
  /** Sigla do atributo para os rótulos ("P", "K", "V"…). */
  sigla: string;
}

export interface FaixaResultado {
  indice: number;
  rotulo: string;          // com ≥/≤ (tela)
  nome: string;            // ASCII (vai no nomeZona / arquivo)
  cor: string;
  dose: number;
  areaHa: number;
  geometry: Poligonal | null;
}

export interface ResultadoCondicao {
  faixas: FaixaResultado[];
  /** Só as faixas com área — prontas para a prescrição. */
  zonas: ZonaDose[];
  fc: GeoJSON.FeatureCollection;
  avisos: string[];
  valorMin: number | null;
  valorMax: number | null;
  manchasAbsorvidas: number;
}

export const AREA_MIN_PADRAO_HA = 0.5;

/**
 * A dose de cada zona de condição (`f1..fN`) é SEMPRE a da faixa nos
 * parâmetros. Editar limiares (tirar um, pôr outro) reordena as faixas sem
 * regerar a geometria; se a zona guardasse a dose por conta própria, a tabela
 * mostraria uma dose e o total/SHP usariam outra. Zona sem faixa correspondente
 * fica com a dose que tem (não inventa número).
 */
export function dosesDasFaixas<Z extends { idZona: string; dose: number }>(
  zonas: Z[], faixas: Array<{ dose: number }>,
): Z[] {
  return zonas.map(z => {
    const m = /^f(\d+)$/.exec(z.idZona);
    const f = m ? faixas[Number(m[1]) - 1] : undefined;
    return f && f.dose !== z.dose ? { ...z, dose: f.dose } : z;
  });
}

// ── Volume travado ──────────────────────────────────────────────────────────
//
// "Tenho 150 kg/ha, redistribui": no cenário 'total' as doses digitadas nas
// faixas deixam de ser a dose final e passam a ser PESOS. A dose aplicada é
//     dose_final(faixa) = k × dose_digitada(faixa)
// com k tal que Σ dose_final × área × fatorBase = total disponível — a
// proporção entre as faixas é a que o agrônomo digitou. É exatamente o cenário
// 'total' do modo ajuste (base_ef = total / (fatorBase · Σ área·fator)), com o
// fator de cada faixa = dose_digitada / referência; por isso reusa
// distribuirPorAjuste, com limites, passo da máquina e avisos de sobra/falta.
// Faixa com dose digitada 0 é "não aplica aqui": fica fora do rateio e em 0,
// mesmo com dose mínima (o piso vale para quem aplica).

export type CenarioCondicao = 'livre' | 'total';

export interface OpcoesVolumeCondicao {
  /** 'livre' (padrão): dose final = digitada. 'total': crava o total. */
  cenario?: CenarioCondicao;
  /** Na unidade-base (kg, t, sementes, L). Exigido no cenário 'total'. */
  totalDisponivel?: number;
  /** Conversão dose×ha → unidade-base (ver fatorBaseDose). Default 1. */
  fatorBase?: number;
  doseMin?: number;
  doseMax?: number;
  incremento?: number;
}

export interface DosesCondicao {
  /** idZona → dose APLICADA (a que vai para a zona, o mapa e o arquivo). */
  doses: Record<string, number>;
  /** idZona → dose DIGITADA na faixa (no cenário 'total', o peso). */
  informadas: Record<string, number>;
  travado: boolean;
  usado: number;               // unidade-base
  sobra: number;
  falta: number;
  avisos: string[];
}

export function dosesDaCondicao(
  zonas: Array<{ idZona: string; areaHa: number; dose: number }>,
  faixas: Array<{ dose: number }>,
  op: OpcoesVolumeCondicao = {},
): DosesCondicao {
  const fatorBase = op.fatorBase && op.fatorBase > 0 ? op.fatorBase : 1;
  const informadas: Record<string, number> = {};
  for (const z of dosesDasFaixas(zonas, faixas)) informadas[z.idZona] = z.dose;
  const travado = op.cenario === 'total';
  // Faixa com a dose APAGADA (vazia/NaN) não é "não aplica" — isso é o 0
  // digitado. Tratá-la como peso 0 mandava o volume dela para as outras em
  // silêncio. Aqui a zona fica sem dose (NaN) nos dois cenários: a validação
  // (dose inválida) bloqueia salvar e exportar, e o aviso diz qual faixa é.
  const semDose = zonas.filter(z => !Number.isFinite(informadas[z.idZona]) || informadas[z.idZona] < 0);
  const avisoSemDose = semDose.length
    ? [`Faixa(s) sem dose: ${semDose.map(z => z.idZona.replace(/^f/, 'faixa ')).join(', ')} — informe a dose (0 = não aplica). Sem ela não dá para salvar nem exportar.`]
    : [];
  if (!travado) {
    const usado = zonas.reduce((s, z) => s + (Number.isFinite(informadas[z.idZona]) ? informadas[z.idZona] * z.areaHa : 0), 0) * fatorBase;
    return { doses: { ...informadas }, informadas, travado, usado, sobra: 0, falta: 0, avisos: avisoSemDose };
  }
  const doses: Record<string, number> = Object.fromEntries(zonas.map(z => [z.idZona, 0]));
  for (const z of semDose) doses[z.idZona] = NaN;
  const peso = (id: string) => (Number.isFinite(informadas[id]) && informadas[id] > 0 ? informadas[id] : 0);
  const ativas = zonas.filter(z => peso(z.idZona) > 0 && z.areaHa > 0);
  const total = op.totalDisponivel ?? 0;
  if (!(total > 0)) {
    return { doses, informadas, travado, usado: 0, sobra: 0, falta: 0, avisos: [...avisoSemDose, 'Informe o volume total (kg/ha médio ou total fechado).'] };
  }
  if (!ativas.length) {
    return { doses, informadas, travado, usado: 0, sobra: total, falta: 0, avisos: [...avisoSemDose, 'Todas as faixas estão com dose 0 — informe a dose de ao menos uma faixa (ela vira o peso da redistribuição).'] };
  }
  const ref = Math.max(...ativas.map(z => peso(z.idZona)));
  const res = distribuirPorAjuste(
    ativas.map(z => ({ id: z.idZona, areaHa: z.areaHa })),
    {
      doseBase: ref, cenario: 'total', totalDisponivel: total, fatorBase,
      ajustePct: Object.fromEntries(ativas.map(z => [z.idZona, (peso(z.idZona) / ref - 1) * 100])),
      doseMin: op.doseMin, doseMax: op.doseMax, incremento: op.incremento,
    },
  );
  for (const z of ativas) doses[z.idZona] = res.doses[z.idZona] ?? 0;
  return { doses, informadas, travado, usado: res.usado, sobra: res.sobra, falta: res.falta, avisos: [...avisoSemDose, ...res.avisos] };
}

export function prescreverPorCondicao(e: EntradaCondicao): ResultadoCondicao {
  const erro = validarLimiares(e.limiares);
  if (erro) throw new Error(erro);
  const nF = e.limiares.length + 1;
  if (e.doses.length !== nF) throw new Error(`Informe a dose das ${nF} faixas.`);
  const { rows, cols } = e.grid;
  if (!(rows > 0 && cols > 0) || e.grid.valores.length < rows * cols) throw new Error('Mapa de fertilidade sem grade de valores.');

  const avisos: string[] = [];
  const { classes, areaHa, valorMin, valorMax } = classificarGrid(e.grid, e.limiares, e.talhao);
  const temValor = Number.isFinite(valorMin);
  if (!temValor) throw new Error('O mapa escolhido não tem valores dentro do talhão.');
  const areaMin = e.areaMinHa ?? AREA_MIN_PADRAO_HA;
  const manchasAbsorvidas = absorverManchas(classes, rows, cols, areaHa, areaMin);

  const faixas: FaixaResultado[] = [];
  for (let k = 0; k < nF; k++) {
    const bruto = vetorizarClasse(classes, e.grid, k);
    const geometry = bruto ? recortar(bruto, e.talhao) : null;
    const area = geometry ? turfArea(turfFeature(geometry)) / 10_000 : 0;
    faixas.push({
      indice: k,
      rotulo: rotuloFaixa(k, e.limiares, e.sigla),
      nome: rotuloFaixa(k, e.limiares, e.sigla, true),
      cor: corDaFaixa(k, nF),
      dose: e.doses[k],
      areaHa: area,
      geometry,
    });
  }
  for (const f of faixas) {
    if (!f.geometry) {
      avisos.push(`A faixa ${f.rotulo} não ocorre no talhão${manchasAbsorvidas ? ' (ou só em manchas menores que a área mínima, absorvidas pelas vizinhas)' : ''} — fica fora da prescrição.`);
    }
  }
  const com = faixas.filter(f => f.geometry);
  if (com.length === 1 && nF > 1) avisos.push('Só uma faixa ocorre no talhão — a aplicação sai em dose única.');

  const zonas: ZonaDose[] = com.map(f => ({
    idZona: `f${f.indice + 1}`,
    nomeZona: f.nome,
    classe: `Faixa ${f.indice + 1}`,
    cor: f.cor,
    areaHa: f.areaHa,
    dose: f.dose,
  }));
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: com.map(f => ({
      type: 'Feature',
      geometry: f.geometry!,
      properties: {
        id: `f${f.indice + 1}`, zona: f.nome, classe: `Faixa ${f.indice + 1}`, cor: f.cor,
        areaHa: Math.round(f.areaHa * 10_000) / 10_000,
      },
    })),
  };
  return {
    faixas, zonas, fc, avisos,
    valorMin: temValor ? valorMin : null, valorMax: temValor ? valorMax : null,
    manchasAbsorvidas,
  };
}
