// A CAIXA "ESTATÍSTICAS" DA PÁGINA DE FERTILIDADE.
//
// REGRA: quando existe laudo por trás do mapa, a caixa descreve as ANÁLISES —
// exatamente os números impressos nos pontos do mapa. Antes ela descrevia o
// RASTER interpolado, e os dois não batem nunca:
//
//   Caso real (BOOK CG03, K 0-20 cm): amostras de 0,8 a 8,1 mmolc/dm³, com os
//   dois valores escritos no mapa — e a caixa dizia MÍNIMO 1,1 e MÁXIMO 7,8.
//
// A causa não é defeito de conta: a krigagem ALISA. O nó da grade não cai em
// cima do ponto amostrado, e com pepita > 0 a predição a 2,5 m do ponto já é
// puxada para a média da vizinhança. Medido neste repo em 18 combinações de
// campo (`npm run teste:honra`): o mapa guardava de 59% a 97% da amplitude das
// amostras. A interp-29 apertou a pepita e subiu isso para 76% a 100%, mas NÃO
// zera — sobra o piso geométrico do meio pixel, e o modelo gaussiano continua
// sendo o pior caso. Ou seja: bater 100% só é possível medindo as amostras.
//
// Por que isto não é "esconder o raster": o grid é limitado à faixa das amostras
// (backend/interp.py e src/lib/faixaAmostras.ts), então nenhum pixel pintado cai
// fora do mínimo/máximo que a caixa informa. A caixa é um limite externo honesto
// do que está no mapa, e é estável — não muda ao reprocessar com outro pixel,
// outro método ou outra versão do interpolador.
//
// DUAS RESSALVAS, as duas tratadas em quem chama:
//   • laudo ALTERADO depois do mapa (desmembrar/fundir): as amostras de hoje não
//     são as que geraram o raster, e a faixa delas NÃO limita aquele grid. Nesse
//     estado a caixa volta a descrever o raster (`rotulos: null`);
//   • com o "Valores" desligado no PDF, os rótulos não são desenhados — a caixa
//     segue descrevendo as análises daquele mapa, que é o que ela promete.
//
// Sem laudo por trás (índices satelitais, MDE), continua valendo a estatística
// do raster — é a única que existe.
//
// Sem dependências de propósito. Coberto por `npm run teste:estatistica`.

export type FonteEstat = 'amostras' | 'mapa' | 'servidor';

/**
 * Casas decimais do RÓTULO do ponto no mapa: o que estiver configurado em
 * Preferências de Análise; sem configuração, pH e K com 1 casa e o resto
 * inteiro.
 *
 * Uma regra só, um lugar só. Ela vale para o rótulo desenhado (aba e gerador) E
 * para o MÍNIMO/MÁXIMO da caixa — que são rótulos do mapa. Enquanto eram três
 * cópias, a caixa imprimia "144,0" onde o mapa escrevia "144": mesmo número,
 * grafia diferente, e a conferência do agrônomo travava na leitura.
 */
export function casasDoRotulo(id: string, configurado?: number): number {
  return configurado ?? ((id === 'ph' || id === 'k') ? 1 : 0);
}

export interface Estat {
  min: number;
  /** `null` quando não há como calcular (só min/máx do servidor, sem grid). */
  media: number | null;
  max: number;
  fonte: FonteEstat;
}

type FeatureLike = { properties?: Record<string, unknown> | null };
type FCLike = { features?: readonly FeatureLike[] } | null | undefined;

/**
 * Lê um número escrito em pt-BR ("1.234,5" → 1234.5). Devolve NaN no que não
 * for número — rótulo de zona vazio, divisa, traço.
 *
 * Existe porque os rótulos SALVOS junto com o mapa guardam só o texto: parsear
 * o que está impresso é o que garante que a caixa fale dos mesmos números.
 */
export function numeroPtBr(txt: unknown): number {
  if (typeof txt === 'number') return Number.isFinite(txt) ? txt : NaN;
  if (typeof txt !== 'string') return NaN;
  // O ponto só vale como separador de milhar quando separa grupos de 3 dígitos.
  // Sem esta checagem, um rótulo gravado em formato inglês ("8.1") viraria 81 em
  // silêncio. Nenhum produtor de rótulo faz isso hoje (todos passam por
  // `toLocaleString('pt-BR')`), mas é barato desarmar.
  const limpo = txt.replace(/[\s ]/g, '');
  const s = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpo)
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * Valores numéricos dos rótulos desenhados no mapa. Prefere `properties.v` (o
 * número cru, gravado junto com o texto); cai no `txt` para os mapas antigos.
 */
export function valoresDosRotulos(fc: FCLike): number[] {
  const out: number[] = [];
  for (const f of fc?.features ?? []) {
    const p = f?.properties;
    if (!p) continue;
    const v = 'v' in p ? numeroPtBr(p.v) : NaN;
    const n = Number.isFinite(v) ? v : numeroPtBr(p.txt);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** min/média/máx de uma lista de valores. `null` quando não há nenhum utilizável. */
export function statsDeAmostras(valores: readonly number[]): Estat | null {
  let n = 0, soma = 0, min = Infinity, max = -Infinity;
  for (const v of valores) {
    if (!Number.isFinite(v)) continue;
    n++; soma += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return n ? { min, media: soma / n, max, fonte: 'amostras' } : null;
}

/** min/média/máx dos pixels do raster. NaN (fora do talhão) não entra na conta. */
export function statsDeGrid(valores: ArrayLike<number> | null | undefined): Estat | null {
  if (!valores) return null;
  let n = 0, soma = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (!Number.isFinite(v)) continue;
    n++; soma += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return n ? { min, media: soma / n, max, fonte: 'mapa' } : null;
}

/**
 * A estatística da página, na ordem de precedência:
 *
 *   1. RÓTULOS — as análises impressas no mapa. É o que a caixa deve dizer.
 *   2. GRID — o raster, quando não há laudo (índice satelital) ou não sobrou
 *      rótulo numérico.
 *   3. SERVIDOR — só min/máx, sem média. Último recurso: mapa salvo "só PNG",
 *      que não tem grid para contar.
 *
 * A média do servidor NÃO é inventada. Antes daqui, o fallback devolvia
 * `(min + max) / 2` rotulado como MÉDIO — que não é média de nada e, num mapa
 * assimétrico (P, K: muitos valores baixos e poucos picos), superestima feio.
 * Agora vem `null` e a página imprime "—".
 */
export function estatisticaDaPagina(a: {
  rotulos?: FCLike;
  grid?: ArrayLike<number> | null;
  servidor?: { min?: number | null; max?: number | null } | null;
}): Estat | null {
  const das = statsDeAmostras(valoresDosRotulos(a.rotulos));
  if (das) return das;
  const doGrid = statsDeGrid(a.grid);
  if (doGrid) return doGrid;
  const s = a.servidor;
  if (s && s.min != null && s.max != null && Number.isFinite(s.min) && Number.isFinite(s.max)) {
    return { min: s.min, media: null, max: s.max, fonte: 'servidor' };
  }
  return null;
}
