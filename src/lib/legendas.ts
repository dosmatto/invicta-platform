// Motor de Legendas Agronômicas — vide especificação técnica.
// Uma legenda é um objeto independente do mapa: pode haver várias por atributo
// (fontes/métodos diferentes) e o usuário escolhe qual aplicar.

export type CategoriaLegenda = 'fertilidade' | 'micronutriente' | 'textura' | 'outro';
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

// Gradiente CSS pra UI da barra de legenda (respeita larguras visuais e estilo).
// - SEGMENTADO: fronteira nítida entre classes (epsilon entre fim_k e inicio_{k+1}).
// - CONTINUO:   sequência única de stops (transição suave nas fronteiras).
export function gradienteCssDaLegenda(leg: Legenda): string {
  const estilo: EstiloLegenda = leg.estilo ?? 'segmentado';
  const partes: string[] = [];
  let acumulado = 0;
  const epsCss = 0.001; // % — ínfimo
  for (let i = 0; i < leg.classes.length; i++) {
    const c = leg.classes[i];
    const { inicio, fim } = paresDaClasse(c);
    const fimPos = acumulado + c.larguraVisual;
    if (estilo === 'segmentado' && i > 0) {
      // força fronteira nítida com a classe anterior na mesma posição visual
      partes.push(`${inicio} ${Math.max(0, acumulado - epsCss)}%`);
      partes.push(`${inicio} ${acumulado}%`);
    } else {
      partes.push(`${inicio} ${acumulado}%`);
    }
    partes.push(`${fim} ${fimPos}%`);
    acumulado = fimPos;
  }
  return `linear-gradient(to right, ${partes.join(', ')})`;
}

// Stops + domínio para o backend (respeita estilo).
export function stopsParaBackend(leg: Legenda): { dominio: [number, number]; stops: Array<[number, [number, number, number]]> } {
  const estilo: EstiloLegenda = leg.estilo ?? 'segmentado';
  const [vmin, vmax] = dominioDaLegenda(leg);
  const span = (vmax - vmin) || 1;
  const stops: Array<[number, [number, number, number]]> = [];
  const eps = 1e-6;
  for (let i = 0; i < leg.classes.length; i++) {
    const c = leg.classes[i];
    const { inicio, fim } = paresDaClasse(c);
    const ini = c.valorMin == null ? 0 : Math.max(0, (c.valorMin - vmin) / span);
    const fimT = c.valorMax == null ? 1 : Math.min(1, (c.valorMax - vmin) / span);
    if (estilo === 'segmentado' && i > 0) {
      stops.push([Math.min(1, ini + eps), hexToRgb(inicio)]);
    } else {
      stops.push([ini, hexToRgb(inicio)]);
    }
    stops.push([fimT, hexToRgb(fim)]);
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
