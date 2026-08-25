// COBERTURA do mapa de colheita: onde a máquina realmente passou.
//
// O problema que este módulo resolve: o IDW preenche TODO o polígono, inclusive
// onde não há ponto nenhum. Um talhão colhido pela metade produz um mapa
// inteiro, bonito e plausível — e a metade inventada não se distingue da medida.
// Foi o que apareceu no JCACR 02: uma mancha clara ocupando uma ponta do
// talhão, sem uma única passada de colhedora por baixo.
//
// A conta é simples de propósito: monta uma malha, marca as células que contêm
// ponto, calcula a DISTÂNCIA de cada célula até a mais próxima com ponto e
// declara "sem dado" o que estiver além do raio. Distância em células, por
// varredura em duas passadas (chanfro 3-4), que é O(células) e não depende do
// número de pontos — importa porque um mapa de colheita traz dezenas de
// milhares deles.
//
// Módulo PURO — sem DOM, sem React. npm run teste:cobertura-colheita

export interface PontoXY { lng: number; lat: number }
export type Bounds = [number, number, number, number];   // [w, s, e, n]

export interface Cobertura {
  rows: number; cols: number;
  bounds: Bounds;
  pixelM: number;
  /** Raio (m) além do qual a célula é considerada sem dado. */
  raioM: number;
  /** 1 = dentro do talhão E coberta; 0 = dentro mas sem dado; 2 = fora do talhão. */
  mascara: Uint8Array;
  nDentro: number;
  nCobertas: number;
  /** Área do talhão considerada nesta malha (ha). */
  areaHa: number;
  areaCobertaHa: number;
  areaSemDadoHa: number;
  /** 0..100 */
  pctCobertura: number;
  /** Maior vão contínuo sem dado, em hectares — um buraco só de 5 ha preocupa
   *  mais que 5 ha espalhados em franjas de borda. */
  maiorVazioHa: number;
}

/**
 * Raio padrão (m) para considerar uma célula coberta.
 *
 * ~1,5 largura de plataforma de colhedora: perto o bastante para não abrir
 * buraco ENTRE passadas vizinhas, longe o bastante para não perdoar uma faixa
 * inteira que a máquina não percorreu. É uma escolha agronômica, não um valor
 * derivado — por isso fica ajustável na tela.
 */
export const RAIO_COBERTURA_PADRAO = 15;

const FORA = 2, SEM_DADO = 0, COBERTA = 1;

/** Metros por grau de longitude/latitude na latitude central. */
export function metrosPorGrau(latC: number): { x: number; y: number } {
  return { x: 111320 * Math.cos((latC * Math.PI) / 180), y: 110540 };
}

/**
 * Distância (em células) até a célula marcada mais próxima, por chanfro 3-4.
 *
 * Duas varreduras (uma para frente, uma para trás) sobre inteiros: o erro
 * contra a distância euclidiana fica abaixo de ~2%, o que é irrelevante para
 * um limiar em metros que já é uma escolha agronômica.
 */
export function distanciaAteMarcada(marcada: Uint8Array, rows: number, cols: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(rows * cols);
  for (let i = 0; i < d.length; i++) d[i] = marcada[i] ? 0 : INF;
  const min = (a: number, b: number) => (a < b ? a : b);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (d[i] === 0) continue;
      let v = d[i];
      if (r > 0) v = min(v, d[i - cols] + 3);
      if (c > 0) v = min(v, d[i - 1] + 3);
      if (r > 0 && c > 0) v = min(v, d[i - cols - 1] + 4);
      if (r > 0 && c < cols - 1) v = min(v, d[i - cols + 1] + 4);
      d[i] = v;
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (d[i] === 0) continue;
      let v = d[i];
      if (r < rows - 1) v = min(v, d[i + cols] + 3);
      if (c < cols - 1) v = min(v, d[i + 1] + 3);
      if (r < rows - 1 && c < cols - 1) v = min(v, d[i + cols + 1] + 4);
      if (r < rows - 1 && c > 0) v = min(v, d[i + cols - 1] + 4);
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;   // chanfro 3-4 → células
  return d;
}

/** Maior componente conexa de células `alvo` (4-vizinhos), em nº de células. */
function maiorComponente(mascara: Uint8Array, rows: number, cols: number, alvo: number): number {
  const visto = new Uint8Array(rows * cols);
  const fila = new Int32Array(rows * cols);
  let maior = 0;
  for (let i0 = 0; i0 < mascara.length; i0++) {
    if (mascara[i0] !== alvo || visto[i0]) continue;
    let ini = 0, fim = 0, n = 0;
    fila[fim++] = i0; visto[i0] = 1;
    while (ini < fim) {
      const i = fila[ini++]; n++;
      const r = (i / cols) | 0, c = i % cols;
      if (r > 0 && mascara[i - cols] === alvo && !visto[i - cols]) { visto[i - cols] = 1; fila[fim++] = i - cols; }
      if (r < rows - 1 && mascara[i + cols] === alvo && !visto[i + cols]) { visto[i + cols] = 1; fila[fim++] = i + cols; }
      if (c > 0 && mascara[i - 1] === alvo && !visto[i - 1]) { visto[i - 1] = 1; fila[fim++] = i - 1; }
      if (c < cols - 1 && mascara[i + 1] === alvo && !visto[i + 1]) { visto[i + 1] = 1; fila[fim++] = i + 1; }
    }
    if (n > maior) maior = n;
  }
  return maior;
}

/**
 * Núcleo: recebe quem está DENTRO (predicado por célula) e os pontos.
 *
 * A convenção da malha é a do backend (interp.py) e a de meap/rasterStats:
 * LINHA 0 = NORTE, células no linspace sobre os bounds. Errar isso espelha o
 * mapa no eixo Y e o erro só aparece muito à frente, num mapa de cabeça para
 * baixo — por isso está escrito aqui e testado.
 */
function montar(
  dentro: (r: number, c: number, lng: number, lat: number) => boolean,
  rows: number, cols: number, bounds: Bounds, pontos: ArrayLike<PontoXY>,
  pixelM: number, raioM: number,
): Cobertura {
  const [w, s, e, n] = bounds;
  const marcada = new Uint8Array(rows * cols);
  const cellX = cols > 1 ? (e - w) / (cols - 1) : (e - w) || 1;
  const cellY = rows > 1 ? (n - s) / (rows - 1) : (n - s) || 1;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const c = Math.round((p.lng - w) / (cellX || 1));
    const r = Math.round((n - p.lat) / (cellY || 1));       // linha 0 = norte
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    marcada[r * cols + c] = 1;
  }

  const dist = distanciaAteMarcada(marcada, rows, cols);
  const limiteCelulas = pixelM > 0 ? raioM / pixelM : 0;

  const mascara = new Uint8Array(rows * cols);
  let nDentro = 0, nCobertas = 0;
  for (let r = 0; r < rows; r++) {
    const lat = rows === 1 ? (n + s) / 2 : n - (r / (rows - 1)) * (n - s);
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const lng = cols === 1 ? (w + e) / 2 : w + (c / (cols - 1)) * (e - w);
      if (!dentro(r, c, lng, lat)) { mascara[i] = FORA; continue; }
      nDentro++;
      if (dist[i] <= limiteCelulas) { mascara[i] = COBERTA; nCobertas++; }
      else mascara[i] = SEM_DADO;
    }
  }

  const pixelHa = (pixelM * pixelM) / 10000;
  const maiorVazio = maiorComponente(mascara, rows, cols, SEM_DADO);
  return {
    rows, cols, bounds, pixelM, raioM, mascara,
    nDentro, nCobertas,
    areaHa: nDentro * pixelHa,
    areaCobertaHa: nCobertas * pixelHa,
    areaSemDadoHa: (nDentro - nCobertas) * pixelHa,
    pctCobertura: nDentro > 0 ? (nCobertas / nDentro) * 100 : 0,
    maiorVazioHa: maiorVazio * pixelHa,
  };
}

/**
 * Cobertura sobre um GRID já interpolado: "dentro" = célula com valor finito
 * (o backend já recortou no polígono). Use esta versão para RECORTAR o mapa —
 * a malha é exatamente a mesma, então a máscara casa célula a célula.
 */
export function coberturaEmGrid(
  valores: ArrayLike<number>, rows: number, cols: number, bounds: Bounds,
  pontos: ArrayLike<PontoXY>, pixelM: number, raioM: number,
): Cobertura {
  return montar((r, c) => Number.isFinite(valores[r * cols + c]), rows, cols, bounds, pontos, pixelM, raioM);
}

/**
 * Cobertura sobre o POLÍGONO, sem precisar do grid — para a conferência ANTES
 * de mandar 30–60 s de processamento para o backend.
 */
export function coberturaEmPoligono(
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  pontos: ArrayLike<PontoXY>, pixelM: number, raioM: number,
  dentroDoPoligono: (lng: number, lat: number, g: GeoJSON.Geometry) => boolean,
  maxCelulas = 600_000,
): Cobertura | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const anel = (rings: number[][][]) => { for (const r of rings) for (const [x, y] of r) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } };
  if (poligono.type === 'Polygon') anel(poligono.coordinates as number[][][]);
  else for (const p of poligono.coordinates as number[][][][]) anel(p);
  if (!Number.isFinite(w)) return null;

  const mpg = metrosPorGrau((s + n) / 2);
  const largM = Math.max(1, (e - w) * mpg.x), altM = Math.max(1, (n - s) * mpg.y);
  // Talhão grande com pixel fino estoura a malha — afrouxa o pixel só para esta
  // conferência (a interpolação de verdade continua no pixel escolhido).
  let px = pixelM;
  while ((largM / px) * (altM / px) > maxCelulas) px *= 1.5;
  const cols = Math.max(2, Math.round(largM / px));
  const rows = Math.max(2, Math.round(altM / px));
  return montar((_r, _c, lng, lat) => dentroDoPoligono(lng, lat, poligono), rows, cols, [w, s, e, n], pontos, px, raioM);
}

/** Aplica a máscara ao grid: célula sem dado vira NaN. Devolve um novo array. */
export function recortarPorCobertura(valores: Float32Array, cob: Cobertura): Float32Array {
  const out = new Float32Array(valores.length);
  for (let i = 0; i < valores.length; i++) out[i] = cob.mascara[i] === COBERTA ? valores[i] : NaN;
  return out;
}

/** Veredito legível — a régua que a tela e o relatório usam. */
export type NivelCobertura = 'ok' | 'atencao' | 'ruim';
export function nivelCobertura(pct: number): NivelCobertura {
  if (pct >= 95) return 'ok';
  if (pct >= 85) return 'atencao';
  return 'ruim';
}
