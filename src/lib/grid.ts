// Gerador de grade de amostragem sobre o polígono do talhão.
// Trabalha em coordenadas locais (metros) projetadas a partir do centro,
// o que é preciso o suficiente para a escala de um talhão.

export interface GridParams {
  geojson: GeoJSON.FeatureCollection;
  densidadeHaPonto: number;   // ha por ponto (ex: 2)
  distanciaBordaM: number;    // distância mínima da borda (m)
  rotacaoGraus: number;       // ângulo da grade (0 = N-S)
  aleatoriedade: number;      // 0-100 (% do meio-lado da célula)
  seed: number;               // semente do sorteio de posições
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

// ── Geração da grade ─────────────────────────────────────────────────────────
export function gerarGrid(params: GridParams): GridPoint[] {
  const { geojson, densidadeHaPonto, distanciaBordaM, rotacaoGraus, aleatoriedade, seed } = params;
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
  // rotaciona ponto para o espaço da grade (inverso) e de volta
  const toGrid = (x: number, y: number): [number, number] => [x * cos + y * sin, -x * sin + y * cos];
  const fromGrid = (u: number, v: number): [number, number] => [u * cos - v * sin, u * sin + v * cos];

  // bbox no espaço da grade
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (const r of aneis) for (const [x, y] of r) {
    const [u, v] = toGrid(x, y);
    if (u < minU) minU = u; if (v < minV) minV = v;
    if (u > maxU) maxU = u; if (v > maxV) maxV = v;
  }

  const rng = mulberry32(seed);
  const jitterMax = (L / 2) * (Math.max(0, Math.min(100, aleatoriedade)) / 100);

  // varre células — linha por linha (serpentina aplicada na ordenação final)
  type Cand = { x: number; y: number; row: number; col: number };
  const cands: Cand[] = [];
  let row = 0;
  for (let v = minV + L / 2; v <= maxV; v += L, row++) {
    let col = 0;
    for (let u = minU + L / 2; u <= maxU; u += L, col++) {
      const [cx, cy] = fromGrid(u, v);
      if (!valido(cx, cy, aneis, distanciaBordaM)) continue;
      // jitter RADIAL: deslocamento dentro de um círculo de raio jitterMax (= L/2 a 100%).
      // Como o raio máx é metade do espaçamento, os círculos de células vizinhas ficam
      // tangentes e os pontos nunca se cruzam. Se a posição cair inválida (borda),
      // tenta outras; senão mantém o centro (já válido).
      let px = cx, py = cy;
      if (jitterMax > 0) {
        let ok = false;
        for (let tent = 0; tent < 10 && !ok; tent++) {
          const ang2 = rng() * 2 * Math.PI;
          const raio = Math.sqrt(rng()) * jitterMax; // sqrt → distribuição uniforme na área
          const [dx, dy] = fromGrid(u + Math.cos(ang2) * raio, v + Math.sin(ang2) * raio);
          if (valido(dx, dy, aneis, distanciaBordaM)) { px = dx; py = dy; ok = true; }
        }
        // se nenhuma tentativa válida, mantém o centro (já válido)
      }
      cands.push({ x: px, y: py, row, col });
    }
  }

  // ordenação serpentina: linhas alternam direção
  cands.sort((a, b) => a.row - b.row || (a.row % 2 === 0 ? a.col - b.col : b.col - a.col));

  return cands.map((c, i) => ({
    lng: c.x / mLng + lng0,
    lat: c.y / mLat + lat0,
    ordem: i,
  }));
}
