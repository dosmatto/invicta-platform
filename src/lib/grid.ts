// Gerador de grade de amostragem sobre o polígono do talhão.
// Trabalha em coordenadas locais (metros) projetadas a partir do centro,
// o que é preciso o suficiente para a escala de um talhão.

import turfArea from '@turf/area';

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

function valido(x: number, y: number, aneis: Ring[], distMin: number): boolean {
  return dentro(x, y, aneis) && distBorda(x, y, aneis) >= distMin;
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

// ── Geração da grade ─────────────────────────────────────────────────────────
// Distribuição por cobertura: amostra o polígono em "sondas" válidas, fixa o
// alvo de pontos pela área (mínimo round(área/densidade)), e garante que cada
// região receba ponto — inclusive braços estreitos que a malha quadrada perde.
export function gerarGrid(params: GridParams): GridPoint[] {
  const { geojson, densidadeHaPonto, distanciaBordaM, rotacaoGraus, aleatoriedade, seed } = params;
  const modo: ModoDistribuicao = params.modo ?? 'inteligente';
  const aneisLL = coletarAneis(geojson);
  if (aneisLL.length === 0 || densidadeHaPonto <= 0) return [];

  // origem local = centro do bbox
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const r of aneisLL) for (const [lng, lat] of r) {
    if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
  }
  const lat0 = (minLat + maxLat) / 2;
  const lng0 = (minLng + maxLng) / 2;
  const { mLat, mLng } = fatores(lat0);

  // anéis em metros locais
  const aneis: Ring[] = aneisLL.map(r => r.map(([lng, lat]) => [(lng - lng0) * mLng, (lat - lat0) * mLat] as [number, number]));

  const L = Math.sqrt(densidadeHaPonto * 10000); // lado da célula (m)
  const ang = (rotacaoGraus * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const toGrid = (x: number, y: number): [number, number] => [x * cos + y * sin, -x * sin + y * cos];
  const fromGrid = (u: number, v: number): [number, number] => [u * cos - v * sin, u * sin + v * cos];

  // bbox no espaço da grade
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (const r of aneis) for (const [x, y] of r) {
    const [u, v] = toGrid(x, y);
    if (u < minU) minU = u; if (v < minV) minV = v;
    if (u > maxU) maxU = u; if (v > maxV) maxV = v;
  }

  // alvo de pontos pela área (mínimo 1)
  let areaM2 = 0;
  try { areaM2 = turfArea(geojson as Parameters<typeof turfArea>[0]); } catch { areaM2 = 0; }
  let N = Math.max(1, Math.round((areaM2 / 10000) / densidadeHaPonto));

  // ── conjunto de sondas válidas ──
  // Passo fino o suficiente para RESOLVER a faixa de borda (≤ borda/2); senão a
  // escada de borda abaixo colapsaria à toa e os pontos encostariam na borda.
  const TETO = 12000;
  let passo = Math.max(2, Math.min(L / 4, distanciaBordaM > 0 ? distanciaBordaM / 2 : L / 4));
  const larguraU = Math.max(passo, maxU - minU), larguraV = Math.max(passo, maxV - minV);
  while ((larguraU / passo) * (larguraV / passo) > TETO) passo *= 1.4;
  const probesPorCelula = Math.max(1, (L / passo) * (L / passo));

  // escada de borda: reduz a distância só se o polígono não comportar nenhuma sonda
  let probes: Probe[] = [];
  let dUsada = distanciaBordaM;
  for (const d of [distanciaBordaM, distanciaBordaM / 2, distanciaBordaM / 4, 0]) {
    probes = [];
    for (let v = minV + passo / 2; v <= maxV; v += passo) {
      for (let u = minU + passo / 2; u <= maxU; u += passo) {
        const [x, y] = fromGrid(u, v);
        if (!dentro(x, y, aneis)) continue;
        const db = distBorda(x, y, aneis);
        if (db < d) continue;
        probes.push({ x, y, u, v, db });
      }
    }
    if (probes.length > 0) { dUsada = d; break; }
  }
  if (probes.length === 0) return [];
  N = Math.min(N, probes.length);

  // ── seleção dos centros ──
  let centros: Probe[];
  if (modo === 'grade') {
    // Malha ALINHADA: um nó por célula com cobertura suficiente, no CENTRO da
    // célula. Se o centro cair fora/dentro da faixa de borda, encaixa na sonda
    // válida mais próxima do centro (mantém a grade, sem furos na borda).
    const celulas = new Map<string, Probe[]>();
    for (const p of probes) {
      const ci = Math.floor((p.u - minU) / L), cj = Math.floor((p.v - minV) / L);
      const k = ci + '_' + cj;
      const arr = celulas.get(k); if (arr) arr.push(p); else celulas.set(k, [p]);
    }
    const minProbes = Math.max(1, probesPorCelula * 0.18);
    centros = [];
    for (const [k, arr] of celulas) {
      if (arr.length < minProbes) continue;
      const part = k.split('_');
      const cu = minU + (Number(part[0]) + 0.5) * L, cv = minV + (Number(part[1]) + 0.5) * L;
      const [ccx, ccy] = fromGrid(cu, cv);
      const dbCentro = dentro(ccx, ccy, aneis) ? distBorda(ccx, ccy, aneis) : -1;
      if (dbCentro >= dUsada) {
        centros.push({ x: ccx, y: ccy, u: cu, v: cv, db: dbCentro });
      } else {
        let best = arr[0], bd = Infinity;
        for (const p of arr) { const d = sq(p.x - ccx) + sq(p.y - ccy); if (d < bd) { bd = d; best = p; } }
        centros.push(best);
      }
    }
    // toda zona recebe ao menos N pontos (zona pequena não pode ficar sem ponto)
    if (centros.length === 0) centros = semearMaisDistante(probes, N);
    else if (centros.length < N) centros = completarAteN(centros, probes, N);
  } else {
    centros = semearMaisDistante(probes, N);
    centros = preencherOrfaos(centros, probes, L);
    centros = lloyd(centros, probes, 4);
    if (centros.length < N) { centros = completarAteN(centros, probes, N); centros = lloyd(centros, probes, 2); }
  }

  // ── jitter RADIAL (aleatoriedade) ≤ L/2; reclampa para dentro ──
  const rng = mulberry32(seed);
  const jitterMax = (L / 2) * (Math.max(0, Math.min(100, aleatoriedade)) / 100);
  const pts = centros.map(c => {
    if (jitterMax <= 0) return { x: c.x, y: c.y };
    for (let tent = 0; tent < 8; tent++) {
      const a2 = rng() * 2 * Math.PI;
      const raio = Math.sqrt(rng()) * jitterMax;
      const dx = c.x + Math.cos(a2) * raio, dy = c.y + Math.sin(a2) * raio;
      if (dentro(dx, dy, aneis) && distBorda(dx, dy, aneis) >= dUsada) return { x: dx, y: dy };
    }
    return { x: c.x, y: c.y };
  });

  // ── numeração serpentina (linhas no espaço da grade alternam direção) ──
  const arr = pts.map(p => { const [u, v] = toGrid(p.x, p.y); return { p, row: Math.round((v - minV) / L), u }; });
  arr.sort((a, b) => a.row - b.row || (a.row % 2 === 0 ? a.u - b.u : b.u - a.u));

  return arr.map((c, i) => ({
    lng: c.p.x / mLng + lng0,
    lat: c.p.y / mLat + lat0,
    ordem: i,
  }));
}
