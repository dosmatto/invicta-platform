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

// ── Seleção espacialmente equilibrada de um subconjunto ──────────────────────
// Escolhe `count` pontos entre `pontos` de forma ESPACIALMENTE EQUILIBRADA
// (amostragem estratificada — família Spatially Balanced / Maximin): divide o
// conjunto em `count` estratos espaciais (k-means / Lloyd, reaproveitando a
// mesma ideia da distribuição da grade) e escolhe 1 ponto por estrato. Isso
// garante, por construção, cobertura de todo o talhão, sem concentração e sem
// grandes vazios — nunca uma seleção puramente aleatória.
//
// `variacao` (0-100) controla só o quanto o representante pode se afastar do
// centro do seu estrato, dentro da estrutura equilibrada:
//   0   = ponto mais central de cada estrato → mínima variação, resultado
//         ESTÁVEL (independe da semente);
//   100 = qualquer ponto do estrato → máxima variação, mas ainda 1 por estrato,
//         então continua equilibrado (sem agrupamento nem vazios).
// `seed` gera novas configurações ("Gerar nova distribuição") quando variacao>0.
//
// Retorna os ÍNDICES escolhidos (referentes ao array `pontos`), para casar com
// a seleção por índice usada na atribuição de profundidades.
export function selecionarBalanceado(
  pontos: { lng: number; lat: number }[],
  count: number,
  seed: number,
  variacao: number,
): Set<number> {
  const n = pontos.length;
  if (count >= n) return new Set(Array.from({ length: n }, (_, i) => i));
  if (count <= 0) return new Set();

  // coords locais (m) p/ distâncias corretas (equirretangular no centro)
  let latMin = Infinity, latMax = -Infinity;
  for (const p of pontos) { if (p.lat < latMin) latMin = p.lat; if (p.lat > latMax) latMax = p.lat; }
  const lat0 = (latMin + latMax) / 2;
  const { mLat, mLng } = fatores(lat0);
  const X = pontos.map(p => p.lng * mLng);
  const Y = pontos.map(p => p.lat * mLat);
  const v = Math.max(0, Math.min(100, variacao)) / 100;

  // Score maximin: maior distância mínima entre os escolhidos = melhor espalhado.
  const scoreMaximin = (sel: number[]): number => {
    let min = Infinity;
    for (let i = 0; i < sel.length; i++)
      for (let j = i + 1; j < sel.length; j++) {
        const d = sq(X[sel[i]] - X[sel[j]]) + sq(Y[sel[i]] - Y[sel[j]]);
        if (d < min) min = d;
      }
    return min;
  };

  // v=0 é determinístico (1 candidato); v>0 gera alguns e fica com o melhor.
  const nCand = v === 0 ? 1 : 6;
  let best: number[] | null = null, bestScore = -Infinity;
  for (let c = 0; c < nCand; c++) {
    const rng = mulberry32(((seed >>> 0) + c * 0x9e3779b1) >>> 0);
    const sel = umaSelecaoBalanceada(X, Y, count, v, rng);
    if (sel.length < count) continue;
    const s = scoreMaximin(sel);
    if (s > bestScore) { bestScore = s; best = sel; }
  }
  return new Set(best ?? Array.from({ length: count }, (_, i) => i));
}

// Uma configuração equilibrada: estratifica por k-means e pega 1 ponto/estrato.
function umaSelecaoBalanceada(X: number[], Y: number[], count: number, v: number, rng: () => number): number[] {
  const n = X.length;

  // ── init dos centros ──
  // v=0: farthest-point determinístico (começa no ponto mais central) → estável.
  // v>0: k-means++ ponderado por D² (blue-noise), variando com a semente.
  const centros: number[] = [];
  if (v === 0) {
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += X[i]; cy += Y[i]; }
    cx /= n; cy /= n;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = sq(X[i] - cx) + sq(Y[i] - cy); if (d < bd) { bd = d; bi = i; } }
    centros.push(bi);
  } else {
    centros.push(Math.floor(rng() * n) % n);
  }
  const minD = new Array(n);
  for (let i = 0; i < n; i++) minD[i] = sq(X[i] - X[centros[0]]) + sq(Y[i] - Y[centros[0]]);
  while (centros.length < count) {
    let idx = -1;
    if (v === 0) {
      let bd = -1;
      for (let i = 0; i < n; i++) if (minD[i] > bd) { bd = minD[i]; idx = i; }
    } else {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += minD[i];
      if (sum <= 0) { for (let i = 0; i < n; i++) if (minD[i] > 0) { idx = i; break; } }
      else { let r = rng() * sum; for (let i = 0; i < n; i++) { r -= minD[i]; idx = i; if (r <= 0) break; } }
    }
    if (idx < 0) break;
    centros.push(idx);
    for (let i = 0; i < n; i++) { const d = sq(X[i] - X[idx]) + sq(Y[i] - Y[idx]); if (d < minD[i]) minD[i] = d; }
  }

  // ── Lloyd: equilibra os estratos (centros contínuos) ──
  const cX = centros.map(i => X[i]), cY = centros.map(i => Y[i]);
  const k = cX.length;
  const assign = new Array(n).fill(0);
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = sq(X[i] - cX[c]) + sq(Y[i] - cY[c]); if (d < bd) { bd = d; bi = c; } }
      assign[i] = bi;
    }
    const sx = new Array(k).fill(0), sy = new Array(k).fill(0), cnt = new Array(k).fill(0);
    for (let i = 0; i < n; i++) { sx[assign[i]] += X[i]; sy[assign[i]] += Y[i]; cnt[assign[i]]++; }
    for (let c = 0; c < k; c++) if (cnt[c] > 0) { cX[c] = sx[c] / cnt[c]; cY[c] = sy[c] / cnt[c]; }
    // estrato vazio → reancorar no ponto mais mal servido pelo seu centro
    for (let c = 0; c < k; c++) if (cnt[c] === 0) {
      let bi = -1, bd = -1;
      for (let i = 0; i < n; i++) { const d = sq(X[i] - cX[assign[i]]) + sq(Y[i] - cY[assign[i]]); if (d > bd) { bd = d; bi = i; } }
      if (bi >= 0) { cX[c] = X[bi]; cY[c] = Y[bi]; }
    }
  }

  // ── 1 representante por estrato ──
  const membros: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) membros[assign[i]].push(i);
  const usados = new Set<number>();
  const sel: number[] = [];
  for (let c = 0; c < k; c++) {
    const m = membros[c];
    if (m.length === 0) continue;
    m.sort((a, b) => (sq(X[a] - cX[c]) + sq(Y[a] - cY[c])) - (sq(X[b] - cX[c]) + sq(Y[b] - cY[c])));
    let pick: number;
    if (v === 0) pick = m[0];
    else {
      // quanto maior v, mais candidatos (do centro p/ fora) entram no sorteio
      const topo = Math.max(1, Math.min(m.length, 1 + Math.floor((m.length - 1) * v)));
      pick = m[Math.floor(rng() * topo) % topo];
    }
    if (usados.has(pick)) { const alt = m.find(x => !usados.has(x)); if (alt !== undefined) pick = alt; }
    usados.add(pick); sel.push(pick);
  }

  // ── completa se faltou (estratos vazios): farthest-point entre os não usados ──
  if (sel.length < count) {
    const md = new Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) for (const s of sel) { const d = sq(X[i] - X[s]) + sq(Y[i] - Y[s]); if (d < md[i]) md[i] = d; }
    while (sel.length < count) {
      let bi = -1, bd = -1;
      for (let i = 0; i < n; i++) { if (usados.has(i)) continue; if (md[i] > bd) { bd = md[i]; bi = i; } }
      if (bi < 0) break;
      usados.add(bi); sel.push(bi);
      for (let i = 0; i < n; i++) { const d = sq(X[i] - X[bi]) + sq(Y[i] - Y[bi]); if (d < md[i]) md[i] = d; }
    }
  }
  return sel;
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


// ── Índice espacial (grade de baldes) ────────────────────────────────────────
// Usado tanto no encaixe da malha quanto no refinamento. Sem ele, um talhão
// grande materializava milhões de pares e travava a interface. Lista encadeada
// em arrays tipados: nenhuma alocação por consulta.
class BaldesXY {
  private cell: number; private x0: number; private y0: number;
  private nx: number; private ny: number;
  private head: Int32Array; private prox: Int32Array;
  constructor(px: number[], py: number[], cell: number) {
    const n = px.length;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i]; if (py[i] < y0) y0 = py[i]; if (py[i] > y1) y1 = py[i]; }
    this.cell = Math.max(1e-9, cell); this.x0 = x0; this.y0 = y0;
    this.nx = Math.max(1, Math.floor((x1 - x0) / this.cell) + 1);
    this.ny = Math.max(1, Math.floor((y1 - y0) / this.cell) + 1);
    this.head = new Int32Array(this.nx * this.ny).fill(-1);
    this.prox = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(this.nx - 1, Math.max(0, Math.floor((px[i] - x0) / this.cell)));
      const cy = Math.min(this.ny - 1, Math.max(0, Math.floor((py[i] - y0) / this.cell)));
      const c = cy * this.nx + cx;
      this.prox[i] = this.head[c]; this.head[c] = i;
    }
  }
  // preenche `out` com os índices das células que cobrem o disco de raio r
  vizinhos(x: number, y: number, r: number, out: Int32Array): number {
    const q = Math.ceil(r / this.cell);
    const cx = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.x0) / this.cell)));
    const cy = Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.y0) / this.cell)));
    const j0 = Math.max(0, cy - q), j1 = Math.min(this.ny - 1, cy + q);
    const i0 = Math.max(0, cx - q), i1 = Math.min(this.nx - 1, cx + q);
    let m = 0;
    for (let j = j0; j <= j1; j++) {
      const base = j * this.nx;
      for (let i = i0; i <= i1; i++)
        for (let p = this.head[base + i]; p !== -1; p = this.prox[p]) out[m++] = p;
    }
    return m;
  }
}

// Espaçamento típico ENTRE FUROS, a partir do bbox. Trocar isto pela mediana das
// distâncias reais foi testado e PIOROU o resultado (o bbox superestima a área
// em talhão em L / com lobos, e é justamente esse raio de busca maior que ajuda).
// Retorna 0 quando a nuvem é degenerada (todos os pontos coincidentes).
function espacamentoFuros(px: number[], py: number[]): number {
  const n = px.length;
  if (n === 0) return 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i]; if (py[i] < y0) y0 = py[i]; if (py[i] > y1) y1 = py[i]; }
  const w = x1 - x0, h = y1 - y0;
  if (w > 0 && h > 0) return Math.sqrt((w * h) / n);
  const maior = Math.max(w, h);
  if (maior > 0) return maior / n;   // pontos colineares: espaçamento em 1D
  return 0;                          // todos coincidentes
}

// ── Refinamento por troca (energia de Riesz) ─────────────────────────────────
// O encaixe da malha grossa nos furos reais distorce o espaçamento (cada nó pode
// andar até meia célula da grade fina). Aqui refinamos a ESCOLHA trocando pontos
// selecionados por furos livres vizinhos, minimizando a ENERGIA DE RIESZ entre os
// escolhidos. Essa energia dispara quando dois pontos se aproximam, então
// minimizá-la produz espaçamento regular — é o método clássico para gerar
// distribuições tipo "blue noise" / malha hexagonal.
//
// Três decisões definem a qualidade (calibradas numa bateria de 210 casos contra
// o alvo do cliente, CV(NN)≈16% e min/média≈0,77):
//  • EXPOENTE 1/d⁶ (não 1/d²): expoente alto faz a energia punir o par MAIS
//    COLADO do conjunto, em vez da soma difusa de pares distantes — e é o par
//    mais colado que derruba a razão min/média. (1/d²: nota 95,4; 1/d⁶: 98,8)
//  • RAIO DE BUSCA de 6 espaçamentos ENTRE FUROS: dá alcance para mover um ponto
//    vários furos adiante, e o custo por ponto fica constante seja qual for a
//    fração amostrada. (raio 1,3: 98,8; raio 6: 99,6)
//  • CORTE da energia em 2,5 espaçamentos: com 1/d⁶ o que está além é
//    numericamente irrelevante, e o corte troca um laço O(k) por O(1).
//
// Determinístico (sem sorteio): empates são resolvidos pelo menor índice.
const REF_RAIO = 6;      // raio de busca, em espaçamentos entre furos
const REF_CORTE = 2.5;   // corte da energia, em espaçamentos entre selecionados

function refinarUniformidade(sel: Set<number>, px: number[], py: number[], baldes: BaldesXY, espacFuro: number, iters: number): Set<number> {
  const n = px.length;
  const S = [...sel];
  const k = S.length;
  if (k < 2 || k >= n || espacFuro <= 0) return sel;

  const d2 = (a: number, b: number) => { const dx = px[a] - px[b], dy = py[a] - py[b]; return dx * dx + dy * dy; };
  const espac = espacFuro * Math.sqrt(n / k);   // espaçamento esperado entre os SELECIONADOS
  const e2 = espac * espac;
  const corte2 = sq(REF_CORTE * espac);
  const raio = REF_RAIO * espacFuro, raio2 = sq(raio);

  const ocupado = new Uint8Array(n);
  for (const s of S) ocupado[s] = 1;
  const buf = new Int32Array(n);
  const cands = new Int32Array(n);

  // energia do candidato contra os demais selecionados dentro do corte
  const energia = (cand: number, excluir: number): number => {
    let e = 0;
    const q = baldes.vizinhos(px[cand], py[cand], REF_CORTE * espac, buf);
    for (let t = 0; t < q; t++) {
      const c = buf[t];
      if (!ocupado[c] || c === excluir || c === cand) continue;
      const v = d2(cand, c);
      if (v > corte2) continue;
      if (v <= 0) { e += 1e12; continue; }
      const r = e2 / v;          // (espac/d)²
      e += r * r * r;            // ⇒ (espac/d)⁶
    }
    return e;
  };

  for (let it = 0; it < iters; it++) {
    let mudou = false;
    for (let pos = 0; pos < k; pos++) {
      const a = S[pos];
      // candidatos livres no raio (copiados: `buf` é reusado dentro de energia())
      const q = baldes.vizinhos(px[a], py[a], raio, buf);
      let nc = 0;
      for (let t = 0; t < q; t++) { const b = buf[t]; if (!ocupado[b] && d2(a, b) <= raio2) cands[nc++] = b; }
      const lista = cands.subarray(0, nc); lista.sort();   // desempate estável
      let melhorCand = -1, melhorVal = energia(a, a);
      for (let t = 0; t < nc; t++) {
        const v = energia(lista[t], a);
        if (v < melhorVal - 1e-12) { melhorVal = v; melhorCand = lista[t]; }
      }
      if (melhorCand >= 0) { ocupado[a] = 0; ocupado[melhorCand] = 1; S[pos] = melhorCand; mudou = true; }
    }
    if (!mudou) break;
  }
  return new Set(S);
}

// ── Seleção por MALHA GROSSA (distribuição coerente) ─────────────────────────
// Para as profundidades parciais (ex.: 20-40 cm) o resultado desejado NÃO é um
// sorteio: é uma MALHA própria, mais grossa, cobrindo o talhão inteiro — só que
// apoiada sobre furos que já existem na grade de 0-20 cm.
//
// Estratégia (reaproveita 100% do gerarGrid): gera uma SEGUNDA grade com a
// densidade escalada para render ~count nós — mesma rotação, mesma distância de
// borda, mesmo modo, logo a mesma coerência visual da grade principal — e então
// ENCAIXA cada nó no furo real mais próximo. O resultado tem o espaçamento
// regular de uma grade, mas todo ponto 20-40 cai em cima de um ponto 0-20.
//
// `variacao` (0-100) vira o jitter da malha grossa (o próprio gerarGrid limita a
// meia célula) e `seed` gera novas configurações — todas coerentes.
export interface MalhaSelParams {
  geojson: GeoJSON.FeatureCollection;
  densidadeHaPonto: number;
  distanciaBordaM: number;
  rotacaoGraus: number;
  modo?: ModoDistribuicao;
}

export function selecionarPorMalha(
  pontos: { lng: number; lat: number }[],
  count: number,
  p: MalhaSelParams,
  seed: number,
  variacao: number,
): Set<number> {
  const n = pontos.length;
  // saneamento do contrato (fracionário / NaN / negativo não passam adiante)
  const alvoN = Number.isNaN(count) ? 0 : Math.max(0, Math.round(count)); // +Infinity cai no guard de "todos"
  if (alvoN >= n) return new Set(Array.from({ length: n }, (_, i) => i));
  if (alvoN <= 0) return new Set();

  // 1) malha grossa com ~alvoN nós. A contagem cai ~1/densidade, então poucas
  //    iterações bastam; cada gerarGrid é caro em contorno detalhado.
  let dens = p.densidadeHaPonto * (n / alvoN);
  let melhor: GridPoint[] = [];
  const tol = Math.max(1, Math.round(alvoN * 0.03));
  for (let it = 0; it < 4; it++) {
    const alvo = gerarGrid({
      geojson: p.geojson, densidadeHaPonto: dens, distanciaBordaM: p.distanciaBordaM,
      rotacaoGraus: p.rotacaoGraus, aleatoriedade: variacao, seed, modo: p.modo ?? 'inteligente',
    });
    if (melhor.length === 0 || Math.abs(alvo.length - alvoN) < Math.abs(melhor.length - alvoN)) melhor = alvo;
    // Sobra de nós é aceitável: o encaixe fica com os alvoN pares mais curtos.
    // Perseguir o número exato custava chamadas extras de gerarGrid (caro em
    // talhão grande / contorno detalhado) sem ganho de qualidade.
    if (alvo.length >= alvoN && alvo.length <= alvoN * 1.25) break;
    if (Math.abs(alvo.length - alvoN) <= tol) break;
    if (alvo.length === 0) break;
    dens *= alvo.length / alvoN;
  }
  const nos = melhor;
  if (nos.length === 0) return selecionarBalanceado(pontos, alvoN, seed, variacao);

  const lat0 = pontos.reduce((s, q) => s + q.lat, 0) / n;
  const { mLat, mLng } = fatores(lat0);
  const px = pontos.map(q => q.lng * mLng), py = pontos.map(q => q.lat * mLat);
  const nx = nos.map(q => q.lng * mLng), ny = nos.map(q => q.lat * mLat);

  const espacFuro = espacamentoFuros(px, py);
  const baldes = new BaldesXY(px, py, espacFuro > 0 ? espacFuro : 1);

  // 2) encaixe: cada nó disputa só os furos VIZINHOS, em vez de materializar e
  //    ordenar todos os nós×furos pares (isso custava ~1 s e centenas de MB).
  const pares: { d: number; a: number; b: number }[] = [];
  const buf = new Int32Array(n);
  const base = espacFuro > 0 ? espacFuro : 1;
  for (let a = 0; a < nos.length; a++) {
    let cands: { d: number; a: number; b: number }[] = [];
    for (const mult of [2.5, 6, 15, 40]) {          // amplia só se não achar nada
      const q = baldes.vizinhos(nx[a], ny[a], base * mult, buf);
      if (q === 0) continue;
      cands = [];
      for (let t = 0; t < q; t++) cands.push({ d: sq(nx[a] - px[buf[t]]) + sq(ny[a] - py[buf[t]]), a, b: buf[t] });
      cands.sort((u, v) => u.d - v.d);
      break;
    }
    if (cands.length === 0) for (let b = 0; b < n; b++) cands.push({ d: sq(nx[a] - px[b]) + sq(ny[a] - py[b]), a, b });
    for (let i = 0; i < Math.min(10, cands.length); i++) pares.push(cands[i]);
  }
  pares.sort((u, v) => u.d - v.d);
  const noUsado = new Uint8Array(nos.length);
  const sel = new Set<number>();
  for (const par of pares) {
    if (sel.size >= alvoN) break;
    if (noUsado[par.a] || sel.has(par.b)) continue;
    noUsado[par.a] = 1; sel.add(par.b);
  }

  // 3) faltou? completa pelo furo mais distante dos já escolhidos
  if (sel.size < alvoN) {
    const md = new Float64Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) for (const s of sel) { const v = sq(px[i] - px[s]) + sq(py[i] - py[s]); if (v < md[i]) md[i] = v; }
    while (sel.size < alvoN) {
      let bi = -1, bd = -1;
      for (let i = 0; i < n; i++) { if (sel.has(i)) continue; if (md[i] > bd) { bd = md[i]; bi = i; } }
      if (bi < 0) break;
      sel.add(bi);
      for (let i = 0; i < n; i++) { const v = sq(px[i] - px[bi]) + sq(py[i] - py[bi]); if (v < md[i]) md[i] = v; }
    }
  }

  // 4) refina até o espaçamento ficar regular no mapa
  return refinarUniformidade(sel, px, py, baldes, espacFuro, n > 1200 ? 3 : 6);
}
