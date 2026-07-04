// Composição Temporal de Índices (IV5) — motor PURO (testável em Node).
//
// Combina 2+ cenas MANTIDAS do MESMO índice numa camada composta por pixel:
// mediana (padrão, robusta a ruído), média, máximo ou mínimo — só sobre pixels
// VÁLIDOS (nuvem/sombra/fora do talhão já chegam NaN das cenas de origem).
// O alinhamento é GEO-AWARE: cada cena é reamostrada (bilinear, NaN-aware)
// para a grade de REFERÊNCIA (a de maior resolução) usando os bounds reais de
// cada uma — funciona entre sensores (S2 10 m × CBERS 2 m) e recortes que não
// batem pixel a pixel.

export type MetodoComposicao = 'mediana' | 'media' | 'maximo' | 'minimo';

export const METODOS_COMPOSICAO: { id: MetodoComposicao; rotulo: string; desc: string }[] = [
  { id: 'mediana', rotulo: 'Mediana', desc: 'padrão recomendado — robusta contra ruídos e pixels anômalos' },
  { id: 'media', rotulo: 'Média', desc: 'comportamento médio do período' },
  { id: 'maximo', rotulo: 'Máximo', desc: 'melhor vigor observado no período' },
  { id: 'minimo', rotulo: 'Mínimo', desc: 'pior condição observada no período' },
];

export const ROTULO_METODO: Record<MetodoComposicao, string> = {
  mediana: 'Mediana', media: 'Média', maximo: 'Máximo', minimo: 'Mínimo',
};

// % mínimo de pixels válidos p/ liberar a camada para Zonas de Manejo (spec:
// "percentual adequado" — abaixo disso salva como CONSULTA com aviso).
export const MIN_PCT_VALIDOS_ZONAS = 70;

export interface CenaComposicao {
  valores: Float32Array;      // decodificada (NaN = inválido/nuvem/fora)
  shape: [number, number];    // [rows, cols]
  bounds: [number, number, number, number];   // [w, s, e, n]
}

export interface ResultadoComposicao {
  valores: Float32Array;      // grid composto (NaN onde nenhuma cena tem dado)
  shape: [number, number];
  bounds: [number, number, number, number];
  pctValidos: number;         // % de px do retângulo com valor no composto
  nCenas: number;
  stats: { min: number; max: number; media: number };
  aptoZonas: boolean;         // ≥2 cenas e pctValidos ≥ MIN_PCT_VALIDOS_ZONAS
}

// Amostra bilinear NaN-aware da cena na coordenada geográfica (lng,lat).
function amostrar(c: CenaComposicao, lng: number, lat: number): number {
  const [rows, cols] = c.shape;
  const [w, s, e, n] = c.bounds;
  const fx = ((lng - w) / (e - w)) * cols - 0.5;      // centro de pixel
  const fy = ((n - lat) / (n - s)) * rows - 0.5;      // linha 0 = norte
  if (fx < -0.5 || fy < -0.5 || fx > cols - 0.5 || fy > rows - 0.5) return NaN;
  const x0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const wx = Math.max(0, Math.min(1, fx - x0));
  const wy = Math.max(0, Math.min(1, fy - y0));
  const v00 = c.valores[y0 * cols + x0], v01 = c.valores[y0 * cols + x1];
  const v10 = c.valores[y1 * cols + x0], v11 = c.valores[y1 * cols + x1];
  let num = 0, den = 0;
  const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
  if (isFinite(v00)) { num += v00 * w00; den += w00; }
  if (isFinite(v01)) { num += v01 * w01; den += w01; }
  if (isFinite(v10)) { num += v10 * w10; den += w10; }
  if (isFinite(v11)) { num += v11 * w11; den += w11; }
  return den > 0.25 ? num / den : NaN;   // exige ≥25% de peso válido (não inventa borda)
}

function mediana(arr: number[]): number {
  arr.sort((a, b) => a - b);
  const m = arr.length >> 1;
  return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
}

// Grade de referência: a cena de MAIOR resolução (mais px por grau), com teto
// de lado p/ não explodir memória (CBERS 2 m em talhão grande).
export function gradeReferencia(cenas: CenaComposicao[], maxLado = 500): { shape: [number, number]; bounds: [number, number, number, number] } {
  let ref = cenas[0];
  let melhor = -Infinity;
  for (const c of cenas) {
    const dens = (c.shape[0] * c.shape[1]) / Math.max(1e-12, (c.bounds[2] - c.bounds[0]) * (c.bounds[3] - c.bounds[1]));
    if (dens > melhor) { melhor = dens; ref = c; }
  }
  let [r, cc] = ref.shape;
  const m = Math.max(r, cc);
  if (m > maxLado) {
    const k = maxLado / m;
    r = Math.max(2, Math.round(r * k));
    cc = Math.max(2, Math.round(cc * k));
  }
  return { shape: [r, cc], bounds: ref.bounds };
}

export function compor(cenas: CenaComposicao[], metodo: MetodoComposicao): ResultadoComposicao {
  if (cenas.length < 2) throw new Error('Selecione pelo menos 2 imagens para compor.');
  const { shape, bounds } = gradeReferencia(cenas);
  const [rows, cols] = shape;
  const [w, s, e, n] = bounds;
  const out = new Float32Array(rows * cols);
  const amostraPx: number[] = [];
  let validos = 0, soma = 0, mn = Infinity, mx = -Infinity;

  for (let j = 0; j < rows; j++) {
    const lat = n - ((j + 0.5) / rows) * (n - s);
    for (let i = 0; i < cols; i++) {
      const lng = w + ((i + 0.5) / cols) * (e - w);
      amostraPx.length = 0;
      for (const c of cenas) {
        const v = amostrar(c, lng, lat);
        if (isFinite(v)) amostraPx.push(v);
      }
      let r = NaN;
      if (amostraPx.length > 0) {
        if (metodo === 'mediana') r = mediana([...amostraPx]);
        else if (metodo === 'media') r = amostraPx.reduce((a, b) => a + b, 0) / amostraPx.length;
        else if (metodo === 'maximo') r = Math.max(...amostraPx);
        else r = Math.min(...amostraPx);
      }
      out[j * cols + i] = r;
      if (isFinite(r)) { validos++; soma += r; if (r < mn) mn = r; if (r > mx) mx = r; }
    }
  }

  const pct = Math.round((100 * validos) / (rows * cols) * 10) / 10;
  return {
    valores: out, shape, bounds,
    pctValidos: pct, nCenas: cenas.length,
    stats: validos ? { min: mn, max: mx, media: soma / validos } : { min: 0, max: 0, media: 0 },
    aptoZonas: cenas.length >= 2 && pct >= MIN_PCT_VALIDOS_ZONAS,
  };
}

// Nome técnico automático (spec Salvamento): estável e legível por máquina.
export function nomeTecnico(indice: string, metodo: MetodoComposicao, datas: string[]): string {
  const ds = [...datas].sort();
  return `comp_${indice.toLowerCase()}_${metodo}_${ds[0]}_${ds[ds.length - 1]}_${ds.length}d`;
}
