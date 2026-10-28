// Integração PrecisionFarm — LIMITE do talhão publicado pela PF: leitura
// DEFENSIVA da geometria do payload. Núcleo PURO (sem rede, sem node:*, sem
// turf): roda no servidor (rota do limite), no navegador (comparação) e no
// teste em Node (imports com `.ts`).
//
// O contrato 0.2.0 não descreve o payload de 'boundary' (só o das linhas, em
// exemplo-linhas.json: `payload.geometry` = FeatureCollection). Por isso aceita
// as variações plausíveis — e nada além delas:
//   • onde: payload.geometry → payload.boundary → payload.geojson → o próprio
//     payload, se ele já for GeoJSON (tem `type`); texto JSON também é lido;
//   • o quê: Polygon, MultiPolygon, Feature, FeatureCollection ou
//     GeometryCollection — tudo de POLÍGONO. Várias partes viram UM
//     MultiPolygon, na ordem em que vieram (sem dissolver, sem mexer em vértice).
// Contrato §4: coordenadas WGS84 [longitude, latitude] SEM arredondamento;
// furos e multipartes preservados; geometria inválida é RECUSADA com o motivo,
// nunca reparada em silêncio (o saneamento do upload — sanearLimites — NÃO
// passa por aqui de propósito).

export type GeometriaLimite = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type Pos = GeoJSON.Position;

/** Mesmos tetos do contrato §4 (contrato.ts tem node:crypto — não importável
 *  no navegador, por isso repetidos aqui). */
export const MAX_VERTICES_LIMITE = 1_000_000;
export const MAX_FEICOES_LIMITE = 100_000;

export interface ContagemLimite { partes: number; furos: number; vertices: number }

export type LeituraLimite =
  | ({ ok: true; geometria: GeometriaLimite } & ContagemLimite)
  | { ok: false; erro: string };

const CRS_WGS84 = new Set(['urn:ogc:def:crs:OGC:1.3:CRS84', 'urn:ogc:def:crs:OGC::CRS84', 'EPSG:4326', 'urn:ogc:def:crs:EPSG::4326']);

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

class GeometriaInvalida extends Error {}

function posicaoOk(p: unknown): p is Pos {
  return Array.isArray(p) && (p.length === 2 || p.length === 3)
    && p.every(n => typeof n === 'number' && Number.isFinite(n))
    && Math.abs(p[0] as number) <= 180 && Math.abs(p[1] as number) <= 90;
}

/** Área plana (graus²) com sinal — só para "o anel tem área?". */
function areaAssinada(anel: Pos[]): number {
  let s = 0;
  for (let i = 0, n = anel.length - 1; i < n; i++) s += anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1];
  return s / 2;
}

/** Ponto dentro do anel (raio horizontal). Ponto exatamente na borda pode cair
 *  para qualquer lado — quem chama trata disso. */
function pontoNoAnel(p: Pos, anel: Pos[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function validarAnel(anel: unknown, onde: string): Pos[] {
  if (!Array.isArray(anel)) throw new GeometriaInvalida(`${onde} não é uma lista de posições.`);
  for (const p of anel) if (!posicaoOk(p)) throw new GeometriaInvalida(`${onde} tem posição fora de WGS84 [longitude, latitude].`);
  const a = anel as Pos[];
  if (a.length < 4) throw new GeometriaInvalida(`${onde} tem ${a.length} posições (mínimo 4, com o fechamento).`);
  const [p0, pn] = [a[0], a[a.length - 1]];
  if (p0[0] !== pn[0] || p0[1] !== pn[1]) throw new GeometriaInvalida(`${onde} não fecha (a última posição difere da primeira).`);
  const distintos = new Set(a.map(p => `${p[0]},${p[1]}`));
  if (distintos.size < 3) throw new GeometriaInvalida(`${onde} tem menos de 3 vértices distintos.`);
  if (areaAssinada(a) === 0) throw new GeometriaInvalida(`${onde} não tem área (vértices alinhados).`);
  return a;
}

// ── Cruzamento de arestas ───────────────────────────────────────────────────
// Grade de cubos (≈ O(n)) — o contrato aceita até 1 milhão de vértices, e o
// par a par seria quadrático. O que conta:
//   • DENTRO do mesmo anel, o anel tem de ser SIMPLES: cruzar (gravata-
//     borboleta), voltar sobre si numa aresta (espícula de vai-e-volta, arestas
//     sobrepostas) ou encostar em si num ponto (figura 8) é inválido;
//   • ENTRE anéis (furo × externo, partes), só o cruzamento PRÓPRIO: encostar
//     num ponto (furo que toca a borda num vértice) ou numa divisa comum de
//     duas partes é válido.
// Vértice repetido em sequência não é defeito: é ignorado na conta.

type Seg = { ax: number; ay: number; bx: number; by: number; anel: number; i: number; n: number };
export type ProblemaArestas = 'cruza' | 'espicula' | 'toca';

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

/** p colinear com a aresta ab e dentro da caixa dela (= sobre a aresta). */
const sobreAresta = (px: number, py: number, ax: number, ay: number, bx: number, by: number) =>
  orient(ax, ay, bx, by, px, py) === 0
  && px >= Math.min(ax, bx) && px <= Math.max(ax, bx) && py >= Math.min(ay, by) && py <= Math.max(ay, by);

function problema(s: Seg, t: Seg): ProblemaArestas | null {
  const o1 = orient(s.ax, s.ay, s.bx, s.by, t.ax, t.ay);
  const o2 = orient(s.ax, s.ay, s.bx, s.by, t.bx, t.by);
  const o3 = orient(t.ax, t.ay, t.bx, t.by, s.ax, s.ay);
  const o4 = orient(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
  const proprio = o1 * o2 < 0 && o3 * o4 < 0;
  if (s.anel !== t.anel) return proprio ? 'cruza' : null;

  const d = Math.abs(s.i - t.i);
  if (d === 1 || d === s.n - 1) {
    // Vizinhas: dividem um vértice V. Só é defeito se a segunda VOLTA pela
    // primeira (colinear e no mesmo sentido a partir de V) — a espícula.
    const [vx, vy, px, py, qx, qy] = s.bx === t.ax && s.by === t.ay
      ? [s.bx, s.by, s.ax, s.ay, t.bx, t.by]
      : [s.ax, s.ay, s.bx, s.by, t.ax, t.ay];
    return orient(px, py, vx, vy, qx, qy) === 0 && (px - vx) * (qx - vx) + (py - vy) * (qy - vy) > 0 ? 'espicula' : null;
  }
  if (proprio) return 'cruza';
  if (o1 === 0 && o2 === 0) {
    // Colineares: sobreposição com comprimento = arestas sobrepostas; só um ponto = toque.
    const eixoX = Math.abs(s.bx - s.ax) >= Math.abs(s.by - s.ay);
    const [s0, s1] = eixoX ? [Math.min(s.ax, s.bx), Math.max(s.ax, s.bx)] : [Math.min(s.ay, s.by), Math.max(s.ay, s.by)];
    const [t0, t1] = eixoX ? [Math.min(t.ax, t.bx), Math.max(t.ax, t.bx)] : [Math.min(t.ay, t.by), Math.max(t.ay, t.by)];
    const sobra = Math.min(s1, t1) - Math.max(s0, t0);
    return sobra > 0 ? 'espicula' : sobra === 0 ? 'toca' : null;
  }
  // Não vizinhas que se encostam (vértice repetido mais adiante, vértice sobre
  // outra aresta): o anel passa duas vezes pelo mesmo ponto — figura 8.
  if (sobreAresta(t.ax, t.ay, s.ax, s.ay, s.bx, s.by) || sobreAresta(t.bx, t.by, s.ax, s.ay, s.bx, s.by)
    || sobreAresta(s.ax, s.ay, t.ax, t.ay, t.bx, t.by) || sobreAresta(s.bx, s.by, t.ax, t.ay, t.bx, t.by)) return 'toca';
  return null;
}

/** Primeiro defeito entre as arestas dos anéis de UM polígono, ou null. */
export function cruzamentoNosAneis(aneis: Pos[][]): { anelA: number; anelB: number; tipo: ProblemaArestas } | null {
  const segs: Seg[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  aneis.forEach((bruto, k) => {
    // Sem vértices repetidos em sequência (a vizinhança das arestas é contada
    // neste anel limpo). Só para a conta — a geometria devolvida não muda.
    const a = bruto.filter((p, i) => i === 0 || p[0] !== bruto[i - 1][0] || p[1] !== bruto[i - 1][1]);
    const n = a.length - 1;
    for (let i = 0; i < n; i++) {
      const s = { ax: a[i][0], ay: a[i][1], bx: a[i + 1][0], by: a[i + 1][1], anel: k, i, n };
      segs.push(s);
      minX = Math.min(minX, s.ax, s.bx); maxX = Math.max(maxX, s.ax, s.bx);
      minY = Math.min(minY, s.ay, s.by); maxY = Math.max(maxY, s.ay, s.by);
    }
  });
  if (segs.length < 2) return null;
  const lado = Math.max(1, Math.ceil(Math.sqrt(segs.length)));
  const cw = (maxX - minX) / lado || 1, ch = (maxY - minY) / lado || 1;
  const cel = (v: number, min: number, c: number) => Math.min(lado - 1, Math.max(0, Math.floor((v - min) / c)));
  const faixa = segs.map(s => [
    cel(Math.min(s.ax, s.bx), minX, cw), cel(Math.min(s.ay, s.by), minY, ch),
    cel(Math.max(s.ax, s.bx), minX, cw), cel(Math.max(s.ay, s.by), minY, ch),
  ]);
  const cubos = new Map<number, number[]>();
  segs.forEach((_, k) => {
    const [x0, y0, x1, y1] = faixa[k];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const c = y * lado + x;
      const l = cubos.get(c);
      if (l) l.push(k); else cubos.set(c, [k]);
    }
  });
  for (const [c, lista] of cubos) {
    const cx = c % lado, cy = Math.floor(c / lado);
    for (let a = 0; a < lista.length; a++) {
      for (let b = a + 1; b < lista.length; b++) {
        const i = lista[a], j = lista[b];
        // O par é testado UMA vez: no primeiro cubo que os dois dividem.
        if (Math.max(faixa[i][0], faixa[j][0]) !== cx || Math.max(faixa[i][1], faixa[j][1]) !== cy) continue;
        const tipo = problema(segs[i], segs[j]);
        if (tipo) return { anelA: segs[i].anel, anelB: segs[j].anel, tipo };
      }
    }
  }
  return null;
}

// ── Leitura ─────────────────────────────────────────────────────────────────

function validarPoligono(coords: unknown, onde: string): Pos[][] {
  if (!Array.isArray(coords) || !coords.length) throw new GeometriaInvalida(`${onde} está vazio.`);
  const aneis = coords.map((a, k) => validarAnel(a, k === 0 ? `${onde}, anel externo,` : `${onde}, furo ${k},`));
  const x = cruzamentoNosAneis(aneis);
  if (x) {
    const qual = (k: number) => (k === 0 ? 'o anel externo' : `o furo ${k}`);
    if (x.anelA !== x.anelB) throw new GeometriaInvalida(`${onde}: ${qual(x.anelA)} cruza ${qual(x.anelB)}.`);
    const q = qual(x.anelA);
    throw new GeometriaInvalida(
      x.tipo === 'espicula' ? `${onde}: ${q} volta sobre si mesmo numa aresta (espícula / arestas sobrepostas).`
        : x.tipo === 'toca' ? `${onde}: ${q} encosta em si mesmo num ponto (figura 8) — cada laço deveria ser uma parte.`
          : `${onde}: ${q} cruza a si mesmo (auto-interseção).`);
  }
  // Sem cruzamento, um furo está todo dentro ou todo fora do externo: basta um
  // vértice dele estritamente dentro (vértice na borda é ambíguo — por isso "algum").
  for (let k = 1; k < aneis.length; k++) {
    if (!aneis[k].some(p => pontoNoAnel(p, aneis[0]))) throw new GeometriaInvalida(`${onde}: o furo ${k} está fora do anel externo.`);
  }
  // Furo dentro de outro furo (ou repetido): a área seria descontada duas vezes.
  // Mesma regra das partes: vértice idêntico ao do outro furo não conta.
  for (let a = 1; a < aneis.length; a++) {
    for (let b = 1; b < aneis.length; b++) {
      if (a !== b && verticeLivreDentro(aneis[a], [aneis[b]], (p, y) => pontoNoAnel(p, y[0]))) {
        throw new GeometriaInvalida(`${onde}: o furo ${a} está dentro do furo ${b} (a área seria descontada duas vezes).`);
      }
    }
  }
  return aneis;
}

/** Ponto dentro da ÁREA do polígono (dentro do externo e fora dos furos). */
const pontoNaArea = (p: Pos, aneis: Pos[][]) => pontoNoAnel(p, aneis[0]) && !aneis.slice(1).some(f => pontoNoAnel(p, f));

/** O anel `x` está dentro de `y` (pelo `teste`)? Sem cruzamento entre eles,
 *  basta um vértice LIVRE dentro — vértice idêntico a um de `y` (encostar) não
 *  conta; todos idênticos = anel repetido, também "dentro". */
function verticeLivreDentro(x: Pos[], y: Pos[][], teste: (p: Pos, y: Pos[][]) => boolean): boolean {
  const vy = new Set(y.flat().map(p => `${p[0]},${p[1]}`));
  const livres = x.filter(p => !vy.has(`${p[0]},${p[1]}`));
  return livres.length === 0 || livres.some(p => teste(p, y));
}

const caixa = (aneis: Pos[][]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of aneis[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};

/**
 * Partes de um MultiPolygon não podem se sobrepor (a área contaria duas vezes).
 * Duas partes se sobrepõem se as bordas se CRUZAM ou se uma está DENTRO da
 * área da outra (ilha dentro de um furo é válida). Encostar — divisa comum,
 * vértices compartilhados — é válido: vértice idêntico a um da outra parte não
 * entra na conta de "dentro".
 */
function sobreposicaoEntrePartes(polis: Pos[][][]): [number, number] | null {
  if (polis.length < 2) return null;
  const cx = polis.map(caixa);
  for (let a = 0; a < polis.length; a++) {
    for (let b = a + 1; b < polis.length; b++) {
      const [ax0, ay0, ax1, ay1] = cx[a], [bx0, by0, bx1, by1] = cx[b];
      if (ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) continue;
      if (cruzamentoNosAneis([...polis[a], ...polis[b]])) return [a, b];
      if (verticeLivreDentro(polis[b][0], polis[a], pontoNaArea) || verticeLivreDentro(polis[a][0], polis[b], pontoNaArea)) return [a, b];
    }
  }
  return null;
}

/** Junta os polígonos de qualquer GeoJSON de limite (sem validar). Linha,
 *  ponto ou feição sem geometria → erro: limite é polígono. */
function coletarPoligonos(g: unknown, saida: { coords: unknown; onde: string }[], onde: string, prof = 0): void {
  if (prof > 4) throw new GeometriaInvalida('GeoJSON aninhado demais.');
  if (!ehObjeto(g)) throw new GeometriaInvalida(`${onde} não é um objeto GeoJSON.`);
  if (g.crs != null) {
    const crs = ehObjeto(g.crs) && ehObjeto(g.crs.properties) ? String(g.crs.properties.name ?? '') : '';
    if (!CRS_WGS84.has(crs)) throw new GeometriaInvalida(`Sistema de coordenadas "${crs || 'desconhecido'}" — o contrato exige WGS84 [longitude, latitude].`);
  }
  switch (g.type) {
    case 'Polygon': saida.push({ coords: g.coordinates, onde }); return;
    case 'MultiPolygon': {
      const cs = g.coordinates;
      if (!Array.isArray(cs) || !cs.length) throw new GeometriaInvalida(`${onde} é um MultiPolygon vazio.`);
      cs.forEach((p, k) => saida.push({ coords: p, onde: cs.length > 1 ? `${onde}, parte ${k + 1}` : onde }));
      return;
    }
    case 'Feature':
      if (g.geometry == null) throw new GeometriaInvalida(`${onde} não tem geometria.`);
      coletarPoligonos(g.geometry, saida, onde, prof + 1);
      return;
    case 'FeatureCollection': {
      const fs = g.features;
      if (!Array.isArray(fs) || !fs.length) throw new GeometriaInvalida('A FeatureCollection do limite está vazia.');
      if (fs.length > MAX_FEICOES_LIMITE) throw new GeometriaInvalida(`O limite tem ${fs.length} feições; o contrato aceita até ${MAX_FEICOES_LIMITE}.`);
      fs.forEach((f, k) => coletarPoligonos(f, saida, fs.length > 1 ? `Feição ${k + 1}` : 'O limite', prof + 1));
      return;
    }
    case 'GeometryCollection': {
      const gs = g.geometries;
      if (!Array.isArray(gs) || !gs.length) throw new GeometriaInvalida('A GeometryCollection do limite está vazia.');
      gs.forEach((x, k) => coletarPoligonos(x, saida, `${onde}, geometria ${k + 1}`, prof + 1));
      return;
    }
    default:
      throw new GeometriaInvalida(`${onde} é ${g.type == null ? 'sem tipo' : String(g.type)}; limite só aceita Polygon ou MultiPolygon.`);
  }
}

/** Contagem para a tela: partes, furos e vértices (sem a posição de
 *  fechamento de cada anel). */
export function contarLimite(g: GeometriaLimite): ContagemLimite {
  const polis = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let furos = 0, vertices = 0;
  for (const p of polis) {
    furos += Math.max(0, p.length - 1);
    for (const a of p) vertices += Math.max(0, a.length - 1);
  }
  return { partes: polis.length, furos, vertices };
}

/**
 * Lê e VALIDA a geometria de um limite (qualquer das formas aceitas) e devolve
 * UMA geometria: Polygon se veio uma parte, MultiPolygon se vieram várias.
 * Coordenadas são as mesmas referências recebidas — nada é arredondado,
 * reordenado ou "consertado".
 */
export function lerGeometriaLimite(geojson: unknown): LeituraLimite {
  try {
    let g = geojson;
    if (typeof g === 'string') {
      try { g = JSON.parse(g); } catch { throw new GeometriaInvalida('A geometria do limite veio como texto que não é JSON.'); }
    }
    const partes: { coords: unknown; onde: string }[] = [];
    coletarPoligonos(g, partes, 'O limite');
    const polis = partes.map(p => validarPoligono(p.coords, p.onde));
    const sob = sobreposicaoEntrePartes(polis);
    if (sob) throw new GeometriaInvalida(`as partes ${sob[0] + 1} e ${sob[1] + 1} se sobrepõem (a área contaria duas vezes).`);
    const geometria: GeometriaLimite = polis.length === 1
      ? { type: 'Polygon', coordinates: polis[0] }
      : { type: 'MultiPolygon', coordinates: polis };
    const c = contarLimite(geometria);
    if (c.vertices > MAX_VERTICES_LIMITE) return { ok: false, erro: `O limite passa de ${MAX_VERTICES_LIMITE.toLocaleString('pt-BR')} vértices (limite do contrato).` };
    return { ok: true, geometria, ...c };
  } catch (e) {
    if (e instanceof GeometriaInvalida) return { ok: false, erro: `Limite da PrecisionFarm inválido: ${e.message}` };
    throw e;
  }
}

/** Onde está o GeoJSON dentro do payload de uma revisão 'boundary'. */
export function geojsonDoPayload(payload: unknown): unknown {
  if (!ehObjeto(payload)) return undefined;
  for (const k of ['geometry', 'boundary', 'geojson'] as const) {
    if (payload[k] != null) return payload[k];
  }
  // O próprio payload já é GeoJSON (Feature/FeatureCollection/Polygon…).
  return typeof payload.type === 'string' ? payload : undefined;
}

/** Payload de uma revisão 'boundary' → geometria validada. */
export function lerPayloadLimite(payload: unknown): LeituraLimite {
  if (!ehObjeto(payload)) return { ok: false, erro: 'Limite da PrecisionFarm sem payload.' };
  const g = geojsonDoPayload(payload);
  if (g === undefined) {
    if (payload.asset != null) return { ok: false, erro: 'O limite da PrecisionFarm veio como arquivo anexo (asset), formato que a Invicta ainda não lê — o contrato espera GeoJSON no payload.' };
    return { ok: false, erro: 'Limite da PrecisionFarm sem geometria (payload.geometry ausente).' };
  }
  return lerGeometriaLimite(g);
}
