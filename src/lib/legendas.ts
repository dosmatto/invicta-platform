// Motor de Legendas Agronômicas — vide especificação técnica.
// Uma legenda é um objeto independente do mapa: pode haver várias por atributo
// (fontes/métodos diferentes) e o usuário escolhe qual aplicar.

// Classificação interna da Legenda (aplicação). Define onde a curva pode ser
// usada e gera o agrupamento dentro da Biblioteca → Legendas.
export type CategoriaLegenda =
  | 'fertilidade' | 'micronutriente' | 'textura'
  | 'produtividade-colheita' | 'ndvi' | 'condutividade'
  | 'altimetria-elevacao' | 'compactacao' | 'pragas' | 'outro';

export const CATEGORIAS_LEGENDA: Array<{ id: CategoriaLegenda; nome: string }> = [
  { id: 'fertilidade',            nome: 'Fertilidade' },
  { id: 'micronutriente',         nome: 'Micronutriente' },
  { id: 'textura',                nome: 'Textura' },
  { id: 'produtividade-colheita', nome: 'Produtividade / Colheita' },
  { id: 'ndvi',                   nome: 'NDVI' },
  { id: 'condutividade',          nome: 'Condutividade' },
  { id: 'altimetria-elevacao',    nome: 'Altimetria / Elevação' },
  { id: 'compactacao',            nome: 'Compactação' },
  { id: 'pragas',                 nome: 'Pragas' },
  { id: 'outro',                  nome: 'Outro' },
];
export type TipoEscala = 'gradiente' | 'discreta';
// Estilo da apresentação visual da barra (não muda valores/limites/unidades).
export type EstiloLegenda = 'segmentado' | 'continuo';

export interface ClasseLegenda {
  nome: string;                  // "Muito Baixo" / "Baixo" / ...
  valorMin: number | null;       // null = sem limite inferior
  valorMax: number | null;       // null = sem limite superior
  corInicio?: string;            // cor no valor mínimo (esquerda) — preferido
  corFim?: string;               // cor no valor máximo (direita) — preferido
  /** @deprecated mantido para retrocompatibilidade; se ausente, derivar de corInicio/corFim */
  corBase?: string;
  larguraVisual: number;         // 0..100; soma das classes = 100
  ordem: number;                 // 1..N
}

export interface Legenda {
  id: string;
  nome: string;                  // "Fundação ABC - Fósforo Resina"
  atributoId: string;            // 'ph', 'p', 'k', 'ca'... casa com lab.ts
  atributo: string;              // "Fósforo"
  simbolo: string;               // "P"
  unidade: string;               // "mg/dm³"
  metodo: string | null;         // "Resina", "DTPA", ...
  fonte: string;                 // "Fundação ABC"
  categoria: CategoriaLegenda;
  invertida: boolean;            // true para Al, m%, etc.
  tipoEscala: TipoEscala;
  /** Estilo da barra: segmentado (faixas separadas) | continuo (gradiente único). Default: segmentado. */
  estilo?: EstiloLegenda;
  /** Limites de VALOR das pontas (classes abertas). Ex: NDVI 0..1, Textura 0..100, V%/m% 0..100.
   *  Se ausente, a ponta usa meia-classe interna (evita o colapso das extremas no mapa). */
  dominioMin?: number;
  dominioMax?: number;
  /** Escopo de governança. 'sistema' = legenda oficial visível a todos (read-only). Ausente = legado/empresa. */
  escopo?: 'meu' | 'empresa' | 'sistema';
  profundidade?: string;         // opcional: "0-20", "20-40"
  classes: ClasseLegenda[];      // 3, 5 ou 6 classes
  observacao?: string;
  criadoEm: string;
  atualizadoEm: string;
}

// Paleta oficial (referência visual da especificação): cada classe tem PAR
// de cores (início → fim). Direção interna é "esquerda → direita" na barra.
export const PARES_OFICIAIS_5 = [
  { inicio: '#B00000', fim: '#FF0000' }, // Muito Baixo
  { inicio: '#D4A800', fim: '#FFD600' }, // Baixo
  { inicio: '#7CFC00', fim: '#006400' }, // Médio
  { inicio: '#66CCFF', fim: '#003D99' }, // Alto
  { inicio: '#C77DFF', fim: '#5A189A' }, // Muito Alto
] as const;

// Compatibilidade com código antigo (cor única por classe — usa o "fim").
export const CORES_OFICIAIS_FERTILIDADE = {
  muitoBaixo: PARES_OFICIAIS_5[0].fim,
  baixo:      PARES_OFICIAIS_5[1].fim,
  medio:      PARES_OFICIAIS_5[2].fim,
  alto:       PARES_OFICIAIS_5[3].fim,
  muitoAlto:  PARES_OFICIAIS_5[4].fim,
} as const;

// Distribuição visual padrão da barra (não-proporcional ao valor)
export const LARGURAS_VISUAIS_5 = [22.5, 22.5, 22.5, 22.5, 10];
const NOMES_CLASSES_5 = ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'];

// Helper para montar uma legenda padrão de fertilidade com 5 classes a partir
// das BORDAS (limites entre classes). bordas.length === 4. Para escalas
// invertidas, a ORDEM dos pares é invertida (Muito Baixo recebe o par roxo etc.).
export function classesFertilidade5(bordas: [number, number, number, number], invertida = false): ClasseLegenda[] {
  const pares = invertida ? [...PARES_OFICIAIS_5].reverse() : PARES_OFICIAIS_5;
  const [b1, b2, b3, b4] = bordas;
  const minmax: Array<[number | null, number | null]> = [
    [null, b1],
    [b1, b2],
    [b2, b3],
    [b3, b4],
    [b4, null],
  ];
  return NOMES_CLASSES_5.map((nome, i) => ({
    nome,
    valorMin: minmax[i][0],
    valorMax: minmax[i][1],
    corInicio: pares[i].inicio,
    corFim:    pares[i].fim,
    larguraVisual: LARGURAS_VISUAIS_5[i],
    ordem: i + 1,
  }));
}

// Monta 5 classes com PARES de cor explícitos — para paletas não-oficiais
// (Textura, Altimetria, NDVI). bordas.length === 4.
export function classesComPares(
  bordas: [number, number, number, number],
  pares: Array<{ inicio: string; fim: string }>,
  nomes: string[],
  larguras: number[] = LARGURAS_VISUAIS_5,
): ClasseLegenda[] {
  const [b1, b2, b3, b4] = bordas;
  const minmax: Array<[number | null, number | null]> = [
    [null, b1], [b1, b2], [b2, b3], [b3, b4], [b4, null],
  ];
  return nomes.map((nome, i) => ({
    nome,
    valorMin: minmax[i][0],
    valorMax: minmax[i][1],
    corInicio: pares[i].inicio,
    corFim: pares[i].fim,
    larguraVisual: larguras[i],
    ordem: i + 1,
  }));
}

// Resolve as cores início/fim de uma classe (com fallback derivando de corBase).
export function paresDaClasse(c: ClasseLegenda): { inicio: string; fim: string } {
  if (c.corInicio && c.corFim) return { inicio: c.corInicio, fim: c.corFim };
  // fallback: deriva de corBase (claro → escuro)
  const base = c.corBase ?? '#888888';
  return { inicio: ajustarL(base, +0.18), fim: ajustarL(base, -0.16) };
}

// Encontra a classe à qual o valor pertence (com fronteiras semi-abertas).
// Convenção: valor pertence à classe k se (min == null OR v > min) AND (max == null OR v <= max).
export function classeDoValor(v: number, classes: ClasseLegenda[]): ClasseLegenda | undefined {
  for (const c of classes) {
    const acimaMin = c.valorMin == null ? true : v > c.valorMin;
    const abaixoMax = c.valorMax == null ? true : v <= c.valorMax;
    if (acimaMin && abaixoMax) return c;
  }
  return undefined;
}

// Domínio numérico (primeira borda finita -> última borda finita)
export function dominioDaLegenda(leg: Legenda): [number, number] {
  const bordas = leg.classes
    .flatMap(c => [c.valorMin, c.valorMax])
    .filter((b): b is number => b != null);
  if (bordas.length < 2) return [0, 1];
  return [Math.min(...bordas), Math.max(...bordas)];
}

// ── Colorização por POSIÇÃO VISUAL (barra = mapa) ─────────────────────────
// A barra usa larguras visuais fixas (22,5/22,5/22,5/22,5/10). O mapa passa a
// usar a MESMA lógica: o valor define a classe + a fração dentro dela, e a cor
// vem da posição visual acumulada. Assim as classes das pontas (abertas) não
// colapsam e a barra bate com o mapa, nos dois estilos.

// Largura de VALOR média das classes internas (fechadas) — dá largura às
// pontas abertas quando não há dominioMin/Max explícito.
function larguraValorMediaInterna(leg: Legenda): number {
  const larguras = leg.classes
    .filter(c => c.valorMin != null && c.valorMax != null)
    .map(c => (c.valorMax as number) - (c.valorMin as number));
  if (larguras.length === 0) return 1;
  return larguras.reduce((a, b) => a + b, 0) / larguras.length;
}

// Faixa de VALOR efetiva de cada classe (pontas ancoradas em dominioMin/Max
// ou em meia-classe interna).
export function bordasEfetivas(leg: Legenda): Array<[number, number]> {
  const meia = larguraValorMediaInterna(leg) / 2;
  return leg.classes.map(c => {
    let lo = c.valorMin;
    let hi = c.valorMax;
    if (lo == null) lo = leg.dominioMin ?? ((c.valorMax ?? 0) - meia);
    if (hi == null) hi = leg.dominioMax ?? ((c.valorMin ?? 0) + meia);
    if (hi <= lo) hi = lo + (meia || 1);
    return [lo, hi] as [number, number];
  });
}

// Posições visuais acumuladas [start,end] de cada classe, normalizadas 0..1.
export function posicoesVisuais(leg: Legenda): Array<[number, number]> {
  const total = leg.classes.reduce((s, c) => s + (c.larguraVisual || 0), 0) || 1;
  const out: Array<[number, number]> = [];
  let acc = 0;
  for (const c of leg.classes) {
    const start = acc / total;
    acc += c.larguraVisual || 0;
    out.push([start, acc / total]);
  }
  return out;
}

// Valor → posição visual [0..1] (coordenada da rampa). Fora do domínio satura.
export function valorParaPosicaoVisual(v: number, leg: Legenda): number {
  const n = leg.classes.length;
  if (n === 0) return 0;
  const bordas = bordasEfetivas(leg);
  const vis = posicoesVisuais(leg);
  if (v <= bordas[0][0]) return vis[0][0];
  if (v > bordas[n - 1][1]) return vis[n - 1][1];
  for (let k = 0; k < n; k++) {
    const [lo, hi] = bordas[k];
    if (v > lo && v <= hi) {
      const f = (v - lo) / ((hi - lo) || 1);
      const [vs, ve] = vis[k];
      return vs + f * (ve - vs);
    }
  }
  return vis[n - 1][1];
}

const mediaRgb = (a: [number, number, number], b: [number, number, number]): [number, number, number] =>
  [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2)];

// Stops [posVisual, rgb] da rampa — FONTE ÚNICA para barra e mapa.
// - SEGMENTADO: gradiente interno claro→escuro por classe + fronteira NÍTIDA.
// - CONTINUO:   escala natural suave — uma cor representativa por classe (o tom
//   "cheio" = média do par) no centro da sua faixa proporcional; o gradiente
//   interpola suave entre elas. Sem "dentes": a sequência de cores das classes
//   (ex.: vermelho→amarelo→verde→azul→roxo) flui naturalmente, e cada cor ocupa
//   a proporção da sua classe (22,5/22,5/22,5/22,5/10).
export function rampaVisualStops(leg: Legenda): Array<[number, [number, number, number]]> {
  const estilo: EstiloLegenda = leg.estilo ?? 'segmentado';
  const vis = posicoesVisuais(leg);
  const stops: Array<[number, [number, number, number]]> = [];
  const n = leg.classes.length;

  if (estilo === 'continuo') {
    for (let i = 0; i < n; i++) {
      const { inicio, fim } = paresDaClasse(leg.classes[i]);
      const cor = mediaRgb(hexToRgb(inicio), hexToRgb(fim));
      const [vs, ve] = vis[i];
      if (i === 0) stops.push([0, cor]);          // ancora a 1ª cor no começo
      stops.push([(vs + ve) / 2, cor]);            // cor no centro da faixa proporcional
      if (i === n - 1) stops.push([1, cor]);       // ancora a última cor no fim
    }
    return stops;
  }

  const eps = 1e-5;
  for (let i = 0; i < n; i++) {
    const { inicio, fim } = paresDaClasse(leg.classes[i]);
    const [vs, ve] = vis[i];
    if (i > 0) stops.push([Math.min(1, vs + eps), hexToRgb(inicio)]); // fronteira nítida
    else stops.push([vs, hexToRgb(inicio)]);
    stops.push([ve, hexToRgb(fim)]);
  }
  return stops;
}

// Interpolação linear de cor numa lista de stops [pos, rgb] ordenada por pos.
export function interpRgb(stops: Array<[number, [number, number, number]]>, p: number): [number, number, number] {
  const n = stops.length;
  if (n === 0) return [0, 0, 0];
  if (p <= stops[0][0]) return stops[0][1];
  if (p >= stops[n - 1][0]) return stops[n - 1][1];
  let i = 0;
  while (i < n - 1 && stops[i + 1][0] < p) i++;
  const [p0, c0] = stops[i];
  const [p1, c1] = stops[i + 1];
  const k = (p - p0) / ((p1 - p0) || 1);
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * k),
    Math.round(c0[1] + (c1[1] - c0[1]) * k),
    Math.round(c0[2] + (c1[2] - c0[2]) * k),
  ];
}

// Gradiente CSS pra barra da UI — derivado da MESMA rampa visual do mapa.
export function gradienteCssDaLegenda(leg: Legenda): string {
  const stops = rampaVisualStops(leg);
  const partes = stops.map(([p, [r, g, b]]) => `rgb(${r},${g},${b}) ${(p * 100).toFixed(3)}%`);
  return `linear-gradient(to right, ${partes.join(', ')})`;
}

// Stops + domínio para o backend (fallback PNG). Amostra a rampa visual em N
// pontos ao longo do domínio de VALOR efetivo, reproduzindo a mesma curva.
export function stopsParaBackend(leg: Legenda): { dominio: [number, number]; stops: Array<[number, [number, number, number]]> } {
  const bordas = bordasEfetivas(leg);
  const vmin = bordas[0][0];
  const vmax = bordas[bordas.length - 1][1];
  const span = (vmax - vmin) || 1;
  const visStops = rampaVisualStops(leg);
  const M = 32;
  const stops: Array<[number, [number, number, number]]> = [];
  for (let j = 0; j < M; j++) {
    const t = j / (M - 1);
    const v = vmin + t * span;
    stops.push([t, interpRgb(visStops, valorParaPosicaoVisual(v, leg))]);
  }
  return { dominio: [vmin, vmax], stops };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Ajuste de luminosidade via HSL. delta em [-1..+1] (positivo clareia).
export function ajustarL(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const { h, s, l } = rgbParaHsl(r, g, b);
  const novoL = Math.max(0, Math.min(1, l + delta));
  const [nr, ng, nb] = hslParaRgb(h, s, novoL);
  return '#' + [nr, ng, nb].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function rgbParaHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [conv(h + 1 / 3) * 255, conv(h) * 255, conv(h - 1 / 3) * 255];
}
