// Estatística da validação — o que o CV sozinho não conta.
//
// O CV é uma razão entre dois números (desvio ÷ média) e vai por água abaixo
// nos casos que mais importam: dois outliers de colhedora inflam o desvio e
// condenam uma zona boa; uma zona com média perto de zero (NDVI, saldo de
// nutriente) devolve CV absurdo ou infinito. Por isso aqui entram, junto:
// mediana, IQR, percentis e contagem de outliers — medidas que não se movem
// com um ponto ruim — e a SEPARAÇÃO entre zonas, que é a pergunta que o CV nem
// tenta responder ("estas duas zonas são coisas diferentes?").
//
// Módulo PURO — sem DOM, sem React. npm run teste:validacao

import type { ResumoValores } from './tipos.ts';

/** Quantil por interpolação linear (tipo 7, o do R/numpy). Vetor JÁ ordenado. */
export function quantil(ordenados: number[], q: number): number {
  const n = ordenados.length;
  if (!n) return NaN;
  if (n === 1) return ordenados[0];
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(pos);
  const resto = pos - base;
  const a = ordenados[base];
  const b = ordenados[Math.min(base + 1, n - 1)];
  return a + (b - a) * resto;
}

/**
 * Resumo completo de um conjunto de valores (pixels de uma zona, por exemplo).
 *
 * Desvio POPULACIONAL: são todos os pixels da zona, não uma amostra dela — e a
 * diferença para o amostral em milhares de pixels é irrelevante, mas em 3
 * pixels o n-1 inflaria o CV de uma zona minúscula.
 */
export function resumoValores(valores: ArrayLike<number>): ResumoValores | null {
  const vals: number[] = [];
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (Number.isFinite(v)) vals.push(v);
  }
  const n = vals.length;
  if (!n) return null;
  vals.sort((a, b) => a - b);

  let soma = 0;
  for (const v of vals) soma += v;
  const media = soma / n;
  let acc = 0;
  for (const v of vals) acc += (v - media) ** 2;
  const desvio = Math.sqrt(acc / n);

  const p5 = quantil(vals, 0.05), p25 = quantil(vals, 0.25);
  const mediana = quantil(vals, 0.5);
  const p75 = quantil(vals, 0.75), p95 = quantil(vals, 0.95);
  const iqr = p75 - p25;

  // Cerca de Tukey (1,5·IQR) — o critério clássico e o mesmo que a limpeza de
  // mapa de colheita já usa por percentil.
  const lo = p25 - 1.5 * iqr, hi = p75 + 1.5 * iqr;
  let outliers = 0;
  for (const v of vals) if (v < lo || v > hi) outliers++;

  // CV só faz sentido com média longe de zero: |média| < 1% da amplitude é o
  // caso do índice centrado (NDVI diferença, saldo) — ali ele explode.
  const amplitude = vals[n - 1] - vals[0];
  const cv = Math.abs(media) > Math.max(1e-9, amplitude * 0.01)
    ? (desvio / Math.abs(media)) * 100
    : null;

  return {
    n, media, mediana, min: vals[0], max: vals[n - 1], amplitude, desvio, cv,
    p5, p25, p75, p95, iqr,
    outliers, pctOutliers: (outliers / n) * 100,
  };
}

// ── Separação entre zonas ───────────────────────────────────────────────────

export interface ParSeparacao {
  a: string;
  b: string;
  /** d de Cohen — distância entre as médias em desvios-padrão. */
  d: number;
  /** true quando |d| < 0,5: as duas zonas são estatisticamente a mesma coisa. */
  sobrepostas: boolean;
}

export interface Separacao {
  /** η² (eta ao quadrado): fração da variância total explicada pelas zonas. 0..1 */
  eta2: number;
  /** F = variância entre zonas ÷ variância dentro das zonas. */
  f: number | null;
  nZonas: number;
  nTotal: number;
  pares: ParSeparacao[];
  /** Pares que não se separam — o motivo mais comum de "zonas demais". */
  paresSobrepostos: number;
  /** Fração dos pares VIZINHOS (na ordem das médias) que se distinguem. 0..1 */
  distincao: number;
  /** Vizinhos que se confundem, na ordem das médias — os candidatos a fusão. */
  vizinhosConfundidos: ParSeparacao[];
}

/**
 * Quanto das diferenças de valor a divisão em zonas explica.
 *
 * η² = SQ entre zonas ÷ SQ total. Um zoneamento que separa de verdade concentra
 * a variação ENTRE as zonas; um que só picotou o talhão deixa quase tudo
 * DENTRO delas — e aí mais zonas não significa mais informação, só mais
 * trabalho para a máquina. O d de Cohen par a par mostra QUAIS zonas se
 * confundem, que é o que permite recomendar "junte a 3 com a 4".
 */
export function separacaoEntreZonas(grupos: Array<{ id: string; valores: ArrayLike<number> }>): Separacao | null {
  const limpos = grupos
    .map(g => {
      const v: number[] = [];
      for (let i = 0; i < g.valores.length; i++) if (Number.isFinite(g.valores[i])) v.push(g.valores[i]);
      return { id: g.id, v };
    })
    .filter(g => g.v.length >= 2);
  if (limpos.length < 2) return null;

  const nTotal = limpos.reduce((s, g) => s + g.v.length, 0);
  const somaTotal = limpos.reduce((s, g) => s + g.v.reduce((a, b) => a + b, 0), 0);
  const mediaGeral = somaTotal / nTotal;

  let sqEntre = 0, sqDentro = 0;
  const stats = limpos.map(g => {
    const m = g.v.reduce((a, b) => a + b, 0) / g.v.length;
    let acc = 0;
    for (const x of g.v) acc += (x - m) ** 2;
    sqEntre += g.v.length * (m - mediaGeral) ** 2;
    sqDentro += acc;
    return { id: g.id, n: g.v.length, media: m, varr: acc / g.v.length };
  });

  const sqTotal = sqEntre + sqDentro;
  const eta2 = sqTotal > 0 ? sqEntre / sqTotal : 0;
  const k = limpos.length;
  const glEntre = k - 1, glDentro = nTotal - k;
  const f = glDentro > 0 && sqDentro > 0 ? (sqEntre / glEntre) / (sqDentro / glDentro) : null;

  const pares: ParSeparacao[] = [];
  for (let i = 0; i < stats.length; i++) {
    for (let j = i + 1; j < stats.length; j++) {
      const A = stats[i], B = stats[j];
      // desvio combinado (pooled) — a régua em que a distância é medida
      const sp = Math.sqrt(((A.n - 1) * A.varr + (B.n - 1) * B.varr) / Math.max(1, A.n + B.n - 2));
      const dif = Math.abs(A.media - B.media);
      // Régua zerada (zonas perfeitamente uniformes — acontece com zona vinda de
      // mapa já classificado): médias diferentes ⇒ separação total, não zero.
      // Sem esta guarda, dividir por 0 marcava TODOS os pares como sobrepostos
      // e o validador reprovava justamente o mapa mais limpo. 99 em vez de
      // Infinity para o número continuar serializável (JSON/Excel/PDF).
      const d = sp > 0 ? dif / sp : (dif > 1e-12 ? 99 : 0);
      pares.push({ a: A.id, b: B.id, d, sobrepostas: d < 0.5 });
    }
  }

  // Vizinhos na ORDEM DAS MÉDIAS: é entre eles que "zona demais" aparece. O η²
  // sozinho não vê isso — ele SEMPRE sobe quando se criam mais grupos, então um
  // k-means de 6 zonas sobre 3 padrões reais pontua tão bem quanto o de 3. O
  // que denuncia o excesso é o vizinho que não se distingue do vizinho.
  const ordenados = [...stats].sort((a, b) => a.media - b.media);
  const vizinhos: ParSeparacao[] = [];
  for (let i = 1; i < ordenados.length; i++) {
    const A = ordenados[i - 1], B = ordenados[i];
    const par = pares.find(p => (p.a === A.id && p.b === B.id) || (p.a === B.id && p.b === A.id));
    if (par) vizinhos.push(par);
  }
  const distintos = vizinhos.filter(v => !v.sobrepostas).length;

  return {
    eta2, f, nZonas: k, nTotal, pares,
    paresSobrepostos: pares.filter(p => p.sobrepostas).length,
    distincao: vizinhos.length ? distintos / vizinhos.length : 1,
    vizinhosConfundidos: vizinhos.filter(v => v.sobrepostas),
  };
}

// ── Normalização para escores 0..100 ────────────────────────────────────────

/**
 * Régua linear com saturação: `zero` vira 0, `cem` vira 100, o resto interpola,
 * fora da faixa gruda no extremo. Os dois âncoras podem estar em qualquer
 * ordem — é o que permite escrever "5 m é ótimo, 30 m é ruim" sem inverter
 * sinal na mão.
 */
export function normalizar(v: number, zero: number, cem: number): number {
  if (!Number.isFinite(v)) return 0;
  if (cem === zero) return v === zero ? 0 : 100;
  const t = (v - zero) / (cem - zero);
  return Math.min(100, Math.max(0, t * 100));
}

/** Escore em que MAIOR é pior: `bom` → 0, `ruim` → 100. */
export function escoreRuim(v: number, bom: number, ruim: number): number {
  if (!Number.isFinite(v)) return 100;    // não medido conta como pior caso aqui
  return normalizar(v, bom, ruim);
}

/** Escore em que MAIOR é melhor: `ruim` → 0, `bom` → 100. */
export function escoreBom(v: number, ruim: number, bom: number): number {
  return normalizar(v, ruim, bom);
}

/** Correlação de postos (Spearman) — usada na repetibilidade entre safras. */
export function spearman(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const postos = (v: number[]): number[] => {
    const idx = v.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
    const r = new Array<number>(v.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].x === idx[i].x) j++;   // empates: posto médio
      const posto = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k].i] = posto;
      i = j + 1;
    }
    return r;
  };
  const ra = postos(a.slice(0, n)), rb = postos(b.slice(0, n));
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  const den = Math.sqrt(va * vb);
  return den > 0 ? cov / den : null;
}
