// Gerador de grade de amostragem sobre o polígono do talhão.
// Trabalha em coordenadas locais (metros) projetadas a partir do centro,
// o que é preciso o suficiente para a escala de um talhão.

export type ModoDistribuicao = 'grade' | 'inteligente';

export interface GridParams {
  geojson: GeoJSON.FeatureCollection;
  densidadeHaPonto: number;   // ha por ponto (ex: 2)
  distanciaBordaM: number;    // distância mínima da borda (m)
  rotacaoGraus: number;       // ângulo da grade (0 = N-S)
  aleatoriedade: number;      // 0-100 (% do meio-lado da célula)
  seed: number;               // semente do sorteio de posições
  modo?: ModoDistribuicao;    // 'grade' (alinhado) | 'inteligente' (cobertura+relaxação). default 'inteligente'
}

export interface GridPoint {
  lng: number;
  lat: number;
  ordem: number;              // índice serpentina (0-based)
}

type Ring = [number, number][]; // [x,y] em metros locais

// ── PRNG determinístico (mulberry32) ─────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Extrai anéis (outer + holes) de todas as feições ─────────────────────────
function coletarAneis(fc: GeoJSON.FeatureCollection): [number, number][][] {
  const aneis: [number, number][][] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') g.coordinates.forEach(r => aneis.push(r as [number, number][]));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => aneis.push(r as [number, number][])));
  }
  return aneis;
}

// ── Conversão lng/lat <-> metros locais ──────────────────────────────────────
function fatores(lat0: number) {
  const mLat = 111320;
  const mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return { mLat, mLng };
}

// ── Ponto dentro do polígono (ray casting, todos os anéis: holes invertem) ────
function dentro(x: number, y: number, aneis: Ring[]): boolean {
  let cruz = 0;
  for (const r of aneis) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if ((yi > y) !== (yj > y)) {
        const xint = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (x < xint) cruz++;
      }
    }
  }
  return cruz % 2 === 1;
}

// ── Distância de um ponto ao segmento ────────────────────────────────────────
function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function distBorda(x: number, y: number, aneis: Ring[]): number {
  let min = Infinity;
  for (const r of aneis) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const d = distSeg(x, y, r[i][0], r[i][1], r[j][0], r[j][1]);
      if (d < min) min = d;
    }
  }
  return min;
}

// ── Ângulo da maior dimensão (rotação automática) ────────────────────────────
// Retorna graus. Usa o par de vértices mais distantes do contorno.
export function anguloMaiorDimensao(fc: GeoJSON.FeatureCollection): number {
  const aneisLL = coletarAneis(fc);
  if (aneisLL.length === 0) return 0;
  // junta todos os vértices
  const pts = aneisLL.flat();
  if (pts.length < 2) return 0;
  // amostra para limitar custo se houver muitos vértices
  const passo = Math.max(1, Math.floor(pts.length / 200));
  const amostra = pts.filter((_, i) => i % passo === 0);
  let maxD = -1, a = amostra[0], b = amostra[1];
  for (let i = 0; i < amostra.length; i++) {
    for (let j = i + 1; j < amostra.length; j++) {
      const dx = amostra[i][0] - amostra[j][0];
      const dy = amostra[i][1] - amostra[j][1];
      const d = dx * dx + dy * dy;
      if (d > maxD) { maxD = d; a = amostra[i]; b = amostra[j]; }
    }
  }
  // ângulo em graus do segmento mais longo
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return ang;
}

// ── Validador de posição (para edição manual de pontos) ──────────────────────
export interface Validador {
  valido(lng: number, lat: number): boolean;
  // dado um movimento de orig (válido) para novo (talvez inválido), retorna a
  // posição válida mais próxima de "novo" ao longo do segmento.
  ajustar(origLng: number, origLat: number, novoLng: number, novoLat: number): { lng: number; lat: number };
}

export function criarValidador(geojson: GeoJSON.FeatureCollection, distanciaBordaM: number): Validador {
  const aneisLL = coletarAneis(geojson);
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const r of aneisLL) for (const [lng, lat] of r) {
    if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
  }
  const lat0 = (minLat + maxLat) / 2, lng0 = (minLng + maxLng) / 2;
  const { mLat, mLng } = fatores(lat0);
  const aneis: Ring[] = aneisLL.map(r => r.map(([lng, lat]) => [(lng - lng0) * mLng, (lat - lat0) * mLat] as [number, number]));

  const val = (lng: number, lat: number) => {
    const x = (lng - lng0) * mLng, y = (lat - lat0) * mLat;
    return dentro(x, y, aneis) && distBorda(x, y, aneis) >= distanciaBordaM;
  };
  const ajustar = (oLng: number, oLat: number, nLng: number, nLat: number) => {
    if (val(nLng, nLat)) return { lng: nLng, lat: nLat };
    let lo = 0, hi = 1; // lo válido (orig), hi inválido (novo)
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (val(oLng + (nLng - oLng) * mid, oLat + (nLat - oLat) * mid)) lo = mid; else hi = mid;
    }
    return { lng: oLng + (nLng - oLng) * lo, lat: oLat + (nLat - oLat) * lo };
  };
  return { valido: val, ajustar };
}

// Retorna um ponto válido dentro do polígono (para garantir ≥1 ponto em zona
// pequena). Reduz a distância da borda progressivamente até achar.
export function pontoInterno(geojson: GeoJSON.FeatureCollection, distanciaBordaM: number): { lng: number; lat: number } | null {
  const aneisLL = coletarAneis(geojson);
  if (aneisLL.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const r of aneisLL) for (const [lng, lat] of r) {
    if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
  }
  for (const d of [distanciaBordaM, distanciaBordaM / 2, distanciaBordaM / 4, 0]) {
    const v = criarValidador(geojson, d);
    const cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2;
    if (v.valido(cx, cy)) return { lng: cx, lat: cy };
    const N = 16;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const lng = minLng + ((maxLng - minLng) * i) / N;
      const lat = minLat + ((maxLat - minLat) * j) / N;
      if (v.valido(lng, lat)) return { lng, lat };
    }
  }
  return null;
}

// ── Helpers da distribuição por cobertura ────────────────────────────────────
// Sonda válida do polígono (amostra discreta usada para cobertura e relaxação).
// x,y = metros locais; u,v = espaço da grade (rotacionado); db = distância da borda.
type Probe = { x: number; y: number; u: number; v: number; db: number };
const sq = (n: number) => n * n;

function distSqAoConjunto(p: Probe, cs: Probe[]): number {
  let min = Infinity;
  for (const c of cs) { const d = sq(p.x - c.x) + sq(p.y - c.y); if (d < min) min = d; }
  return min;
}

// Amostragem por "ponto mais distante" (farthest-point): espalha N centros.
// Começa pelo mais interno (determinístico) e adiciona sempre o mais distante.
function semearMaisDistante(probes: Probe[], n: number): Probe[] {
  if (probes.length === 0 || n <= 0) return [];
  let start = probes[0];
  for (const p of probes) if (p.db > start.db) start = p;
  const chosen: Probe[] = [start];
  const minD = probes.map(p => sq(p.x - start.x) + sq(p.y - start.y));
  while (chosen.length < n) {
    let bi = -1, bd = -1;
    for (let i = 0; i < probes.length; i++) if (minD[i] > bd) { bd = minD[i]; bi = i; }
    if (bi < 0 || bd <= 0) break;
    const np = probes[bi]; chosen.push(np);
    for (let i = 0; i < probes.length; i++) { const d = sq(probes[i].x - np.x) + sq(probes[i].y - np.y); if (d < minD[i]) minD[i] = d; }
  }
  return chosen;
}

// Completa até n centros pegando sempre o ponto mais distante dos já escolhidos.
function completarAteN(centros: Probe[], probes: Probe[], n: number): Probe[] {
  const chosen = centros.slice();
  if (chosen.length >= n || probes.length === 0) return chosen;
  const minD = probes.map(p => distSqAoConjunto(p, chosen));
  while (chosen.length < n) {
    let bi = -1, bd = -1;
    for (let i = 0; i < probes.length; i++) if (minD[i] > bd) { bd = minD[i]; bi = i; }
    if (bi < 0 || bd <= 0) break;
    const np = probes[bi]; chosen.push(np);
    for (let i = 0; i < probes.length; i++) { const d = sq(probes[i].x - np.x) + sq(probes[i].y - np.y); if (d < minD[i]) minD[i] = d; }
  }
  return chosen;
}

// Garante cobertura: nenhuma sonda válida fica a mais de ~1,4·L de um ponto.
// Preenche braços/lóbulos que a malha regular não alcança (pode passar de N).
function preencherOrfaos(centros: Probe[], probes: Probe[], L: number): Probe[] {
  const chosen = centros.slice();
  if (probes.length === 0) return chosen;
  const limite = sq(1.4 * L);
  const minD = probes.map(p => chosen.length ? distSqAoConjunto(p, chosen) : Infinity);
  for (;;) {
    let bi = -1, bd = limite;
    for (let i = 0; i < probes.length; i++) if (minD[i] > bd) { bd = minD[i]; bi = i; }
    if (bi < 0) break;
    const np = probes[bi]; chosen.push(np);
    for (let i = 0; i < probes.length; i++) { const d = sq(probes[i].x - np.x) + sq(probes[i].y - np.y); if (d < minD[i]) minD[i] = d; }
  }
  return chosen;
}

// Relaxação de Lloyd discreta (k-means sobre as sondas): move cada centro para
// a sonda mais próxima do centróide do seu agrupamento → espaçamento uniforme
// que se conforma ao formato. Não cria nem remove pontos.
function lloyd(centros: Probe[], probes: Probe[], iters: number): Probe[] {
  let cs = centros.slice();
  for (let it = 0; it < iters; it++) {
    const sumx = new Array(cs.length).fill(0), sumy = new Array(cs.length).fill(0), cnt = new Array(cs.length).fill(0);
    for (const p of probes) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < cs.length; i++) { const d = sq(p.x - cs[i].x) + sq(p.y - cs[i].y); if (d < bd) { bd = d; bi = i; } }
      sumx[bi] += p.x; sumy[bi] += p.y; cnt[bi]++;
    }
    const used = new Set<Probe>();
    cs = cs.map((c, i) => {
      if (cnt[i] === 0) { used.add(c); return c; }
      const mx = sumx[i] / cnt[i], my = sumy[i] / cnt[i];
      let best = c, bd = Infinity;
      for (const p of probes) { if (used.has(p)) continue; const d = sq(p.x - mx) + sq(p.y - my); if (d < bd) { bd = d; best = p; } }
      used.add(best); return best;
    });
  }
  return cs;
}

// ── Componentes e campos ─────────────────────────────────────────────────────
// Componente = anel externo + buracos (1 polígono). MultiPolygon vira N
// componentes. Componentes que se TOCAM formam um "campo" (tratado como uma
// região só, borda = contorno externo). Componentes DISJUNTOS são campos
// separados, cada um com alvo e borda próprios → todo pedaço recebe ponto.
type Parte = Ring[]; // [externo, ...buracos]

function coletarComponentes(fc: GeoJSON.FeatureCollection): [number, number][][][] {
  const comps: [number, number][][][] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') comps.push(g.coordinates as [number, number][][]);
    else if (g.type === 'MultiPolygon') (g.coordinates as [number, number][][][]).forEach(p => comps.push(p));
  }
  return comps;
}

// Área planar (m²) de uma parte (externo − buracos), coords locais em metros.
function areaComponente(aneis: Ring[]): number {
  const shoelace = (r: Ring) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(s) / 2; };
  if (aneis.length === 0) return 0;
  let a = shoelace(aneis[0]);
  for (let i = 1; i < aneis.length; i++) a -= shoelace(aneis[i]);
  return Math.max(0, a);
}

// Agrupa partes que se tocam (vértices a < eps) num mesmo campo (union-find).
function agruparCampos(partes: Parte[], eps: number): Parte[][] {
  const n = partes.length;
  const pai = Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => { while (pai[a] !== a) { pai[a] = pai[pai[a]]; a = pai[a]; } return a; };
  const eps2 = eps * eps;
  const verts = partes.map(p => p.flat());
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (find(i) === find(j)) continue;
    let toca = false;
    for (const a of verts[i]) { for (const b of verts[j]) { if (sq(a[0] - b[0]) + sq(a[1] - b[1]) <= eps2) { toca = true; break; } } if (toca) break; }
    if (toca) pai[find(i)] = find(j);
  }
  const grupos = new Map<number, Parte[]>();
  for (let i = 0; i < n; i++) { const r = find(i); const g = grupos.get(r); if (g) g.push(partes[i]); else grupos.set(r, [partes[i]]); }
  return [...grupos.values()];
}

// Segmentos do CONTORNO externo de um campo: arestas que aparecem só 1 vez
// (as compartilhadas entre partes vizinhas são divisas internas — ignoradas).
function bordasDoCampo(campo: Parte[]): number[][] {
  const mapa = new Map<string, { s: number[]; n: number }>();
  for (const parte of campo) for (const ring of parte) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      const ka = `${a[0].toFixed(1)},${a[1].toFixed(1)}`, kb = `${b[0].toFixed(1)},${b[1].toFixed(1)}`;
      const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const e = mapa.get(key); if (e) e.n++; else mapa.set(key, { s: [a[0], a[1], b[0], b[1]], n: 1 });
    }
  }
  const out: number[][] = [];
  for (const e of mapa.values()) if (e.n === 1) out.push(e.s);
  return out;
}

function distBordas(x: number, y: number, segs: number[][]): number {
  let min = Infinity;
  for (const s of segs) { const d = distSeg(x, y, s[0], s[1], s[2], s[3]); if (d < min) min = d; }
  return min;
}

interface Frame {
  minU: number; minV: number; L: number; passo: number; probesPorCelula: number; cos: number; sin: number;
}

// Centros (já com jitter) de UM campo. dentro = união dos anéis; borda = contorno
// externo (segs). Escada de borda e alvo N próprios → campo pequeno garante ≥1.
function centrosDeComponente(aneis: Ring[], segs: number[][], N: number, modo: ModoDistribuicao, distanciaBordaM: number, aleatoriedade: number, rng: () => number, f: Frame): { x: number; y: number }[] {
  const { minU, minV, L, passo, probesPorCelula, cos, sin } = f;
  const fromGrid = (u: number, v: number): [number, number] => [u * cos - v * sin, u * sin + v * cos];
  const toGrid = (x: number, y: number): [number, number] => [x * cos + y * sin, -x * sin + y * cos];

  // sub-bbox do campo no espaço da grade, na fase global (células alinhadas)
  let cMinU = Infinity, cMinV = Infinity, cMaxU = -Infinity, cMaxV = -Infinity;
  for (const r of aneis) for (const [x, y] of r) {
    const [u, v] = toGrid(x, y);
    if (u < cMinU) cMinU = u; if (v < cMinV) cMinV = v;
    if (u > cMaxU) cMaxU = u; if (v > cMaxV) cMaxV = v;
  }
  const baseU = minU + passo / 2, baseV = minV + passo / 2;
  const startU = baseU + Math.max(0, Math.ceil((cMinU - baseU) / passo)) * passo;
  const startV = baseV + Math.max(0, Math.ceil((cMinV - baseV) / passo)) * passo;

  // escada de borda própria do campo (contorno externo)
  let probes: Probe[] = [];
  let dUsada = distanciaBordaM;
  for (const d of [distanciaBordaM, distanciaBordaM / 2, distanciaBordaM / 4, 0]) {
    probes = [];
    for (let v = startV; v <= cMaxV; v += passo) {
      for (let u = startU; u <= cMaxU; u += passo) {
        const [x, y] = fromGrid(u, v);
        if (!dentro(x, y, aneis)) continue;
        const db = distBordas(x, y, segs);
        if (db < d) continue;
        probes.push({ x, y, u, v, db });
      }
    }
    if (probes.length > 0) { dUsada = d; break; }
  }
  if (probes.length === 0) return [];
  const n = Math.min(N, probes.length);

  let centros: Probe[];
  if (modo === 'grade') {
    // Malha ALINHADA: um nó no CENTRO de cada célula coberta; se o centro cai
    // fora/na faixa de borda, encaixa na sonda válida mais próxima do centro.
    const celulas = new Map<string, Probe[]>();
    for (const p of probes) {
      const k = Math.floor((p.u - minU) / L) + '_' + Math.floor((p.v - minV) / L);
      const arr = celulas.get(k); if (arr) arr.push(p); else celulas.set(k, [p]);
    }
    const minProbes = Math.max(1, probesPorCelula * 0.18);
    centros = [];
    for (const [k, arr] of celulas) {
      if (arr.length < minProbes) continue;
      const part = k.split('_');
      const cu = minU + (Number(part[0]) + 0.5) * L, cv = minV + (Number(part[1]) + 0.5) * L;
      const [ccx, ccy] = fromGrid(cu, cv);
      const dbCentro = dentro(ccx, ccy, aneis) ? distBordas(ccx, ccy, segs) : -1;
      if (dbCentro >= dUsada) centros.push({ x: ccx, y: ccy, u: cu, v: cv, db: dbCentro });
      else { let best = arr[0], bd = Infinity; for (const p of arr) { const d = sq(p.x - ccx) + sq(p.y - ccy); if (d < bd) { bd = d; best = p; } } centros.push(best); }
    }
    if (centros.length === 0) centros = semearMaisDistante(probes, n);
    else if (centros.length < n) centros = completarAteN(centros, probes, n);
  } else {
    centros = semearMaisDistante(probes, n);
    centros = preencherOrfaos(centros, probes, L);
    centros = lloyd(centros, probes, 4);
    if (centros.length < n) { centros = completarAteN(centros, probes, n); centros = lloyd(centros, probes, 2); }
  }

  // jitter RADIAL ≤ L/2 (reclampa para dentro do campo)
  const jitterMax = (L / 2) * (Math.max(0, Math.min(100, aleatoriedade)) / 100);
  return centros.map(c => {
    if (jitterMax <= 0) return { x: c.x, y: c.y };
    for (let tent = 0; tent < 8; tent++) {
      const a2 = rng() * 2 * Math.PI;
      const raio = Math.sqrt(rng()) * jitterMax;
      const dx = c.x + Math.cos(a2) * raio, dy = c.y + Math.sin(a2) * raio;
      if (dentro(dx, dy, aneis) && distBordas(dx, dy, segs) >= dUsada) return { x: dx, y: dy };
    }
    return { x: c.x, y: c.y };
  });
}

// ── Geração da grade ─────────────────────────────────────────────────────────
// Por CAMPO (componentes que se tocam = 1 campo; disjuntos = campos separados):
// cada campo recebe alvo próprio máx(1, round(área/densidade)), borda = contorno
// externo (divisas internas entre partes vizinhas não contam) e escada de borda
// própria → nenhum pedaço fica sem ponto. Grade alinhada de forma contínua.
export function gerarGrid(params: GridParams): GridPoint[] {
  const { geojson, densidadeHaPonto, distanciaBordaM, rotacaoGraus, aleatoriedade, seed } = params;
  const modo: ModoDistribuicao = params.modo ?? 'inteligente';
  const aneisLL = coletarAneis(geojson);
  if (aneisLL.length === 0 || densidadeHaPonto <= 0) return [];

  // origem local = centro do bbox (lng/lat)
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const r of aneisLL) for (const [lng, lat] of r) {
    if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
  }
  const lat0 = (minLat + maxLat) / 2, lng0 = (minLng + maxLng) / 2;
  const { mLat, mLng } = fatores(lat0);
  const projetar = (rings: [number, number][][]): Ring[] => rings.map(r => r.map(([lng, lat]) => [(lng - lng0) * mLng, (lat - lat0) * mLat] as [number, number]));

  const L = Math.sqrt(densidadeHaPonto * 10000); // lado da célula (m)
  const ang = (rotacaoGraus * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const toGrid = (x: number, y: number): [number, number] => [x * cos + y * sin, -x * sin + y * cos];

  // componentes (anéis em metros locais)
  const partes: Parte[] = coletarComponentes(geojson).map(projetar).filter(p => p.length > 0);
  if (partes.length === 0) return [];

  // bbox global no espaço da grade (referencial compartilhado p/ alinhar a grade)
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (const parte of partes) for (const r of parte) for (const [x, y] of r) {
    const [u, v] = toGrid(x, y);
    if (u < minU) minU = u; if (v < minV) minV = v;
    if (u > maxU) maxU = u; if (v > maxV) maxV = v;
  }

  // passo fino o bastante para resolver a faixa de borda (≤ borda/2), com teto
  const TETO = 12000;
  let passo = Math.max(2, Math.min(L / 4, distanciaBordaM > 0 ? distanciaBordaM / 2 : L / 4));
  const larguraU = Math.max(passo, maxU - minU), larguraV = Math.max(passo, maxV - minV);
  while ((larguraU / passo) * (larguraV / passo) > TETO) passo *= 1.4;
  const probesPorCelula = Math.max(1, (L / passo) * (L / passo));

  const frame: Frame = { minU, minV, L, passo, probesPorCelula, cos, sin };
  const rng = mulberry32(seed);

  // agrupa partes que se tocam em campos; cada campo é gerado isolado
  const campos = agruparCampos(partes, 3); // partes a < 3 m = mesmo campo
  const todos: { x: number; y: number }[] = [];
  for (const campo of campos) {
    const aneis = campo.flat();
    const segs = bordasDoCampo(campo);
    const area = campo.reduce((s, parte) => s + areaComponente(parte), 0);
    const N = Math.max(1, Math.round(area / (densidadeHaPonto * 10000)));
    for (const c of centrosDeComponente(aneis, segs, N, modo, distanciaBordaM, aleatoriedade, rng, frame)) todos.push(c);
  }
  if (todos.length === 0) return [];

  // numeração serpentina global (linhas no espaço da grade alternam direção)
  const arr = todos.map(p => { const [u, v] = toGrid(p.x, p.y); return { p, row: Math.round((v - minV) / L), u }; });
  arr.sort((a, b) => a.row - b.row || (a.row % 2 === 0 ? a.u - b.u : b.u - a.u));

  return arr.map((c, i) => ({ lng: c.p.x / mLng + lng0, lat: c.p.y / mLat + lat0, ordem: i }));
}
