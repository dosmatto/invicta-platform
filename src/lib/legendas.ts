// Motor de Legendas Agronômicas — vide especificação técnica.
// Uma legenda é um objeto independente do mapa: pode haver várias por atributo
// (fontes/métodos diferentes) e o usuário escolhe qual aplicar.

export type CategoriaLegenda = 'fertilidade' | 'micronutriente' | 'textura' | 'outro';
export type TipoEscala = 'gradiente' | 'discreta';

export interface ClasseLegenda {
  nome: string;                  // "Muito Baixo" / "Baixo" / ...
  valorMin: number | null;       // null = sem limite inferior
  valorMax: number | null;       // null = sem limite superior
  corBase: string;               // hex
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
  profundidade?: string;         // opcional: "0-20", "20-40"
  classes: ClasseLegenda[];      // 3, 5 ou 6 classes
  observacao?: string;
  criadoEm: string;
  atualizadoEm: string;
}

// Paleta oficial recomendada (Vermelho → Amarelo → Verde → Azul → Roxo)
export const CORES_OFICIAIS_FERTILIDADE = {
  muitoBaixo: '#D7191C',
  baixo:      '#FFD92F',
  medio:      '#1A9641',
  alto:       '#2C7BB6',
  muitoAlto:  '#7B3294',
} as const;

// Para escalas invertidas (Al, m%): mesma paleta, ordem invertida
const cores5normal   = [CORES_OFICIAIS_FERTILIDADE.muitoBaixo, CORES_OFICIAIS_FERTILIDADE.baixo, CORES_OFICIAIS_FERTILIDADE.medio, CORES_OFICIAIS_FERTILIDADE.alto, CORES_OFICIAIS_FERTILIDADE.muitoAlto];
const cores5invertido = [...cores5normal].reverse();

// Distribuição visual padrão da barra (não-proporcional ao valor)
export const LARGURAS_VISUAIS_5 = [22.5, 22.5, 22.5, 22.5, 10];
const NOMES_CLASSES_5 = ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'];

// Helper para montar uma legenda padrão de fertilidade com 5 classes a partir
// das BORDAS (limites entre classes). bordas.length === 4.
export function classesFertilidade5(bordas: [number, number, number, number], invertida = false): ClasseLegenda[] {
  const cores = invertida ? cores5invertido : cores5normal;
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
    corBase: cores[i],
    larguraVisual: LARGURAS_VISUAIS_5[i],
    ordem: i + 1,
  }));
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

// Quanto clareamos no valor mínimo e quanto escurecemos no máximo dentro da classe.
// Ajuste no L do HSL — valores conservadores pra manter cor reconhecível.
const CLAREIA_L = 0.18;
const ESCURECE_L = 0.16;

// Cores de borda da classe: começa CLARA no mínimo, vai pra ESCURA no máximo.
export function coresDaClasse(corBase: string): { clara: string; escura: string } {
  return { clara: ajustarL(corBase, +CLAREIA_L), escura: ajustarL(corBase, -ESCURECE_L) };
}

// Gradiente CSS pra UI da barra de legenda (usa larguras visuais).
// Cada classe transita do tom mais claro (esquerda) ao mais escuro (direita);
// fronteiras entre classes são nítidas (stops adjacentes na mesma posição).
export function gradienteCssDaLegenda(leg: Legenda): string {
  const partes: string[] = [];
  let acumulado = 0;
  for (const c of leg.classes) {
    const { clara, escura } = coresDaClasse(c.corBase);
    const fim = acumulado + c.larguraVisual;
    partes.push(`${clara} ${acumulado}%`);
    partes.push(`${escura} ${fim}%`);
    acumulado = fim;
  }
  return `linear-gradient(to right, ${partes.join(', ')})`;
}

// Stops + domínio para o backend.
// Cada classe gera dois stops: cor CLARA no mínimo e cor ESCURA no máximo
// (degradê suave dentro da classe). Entre classes vizinhas usamos um epsilon
// curtíssimo para criar fronteira nítida (sem mistura visual).
export function stopsParaBackend(leg: Legenda): { dominio: [number, number]; stops: Array<[number, [number, number, number]]> } {
  const [vmin, vmax] = dominioDaLegenda(leg);
  const span = (vmax - vmin) || 1;
  const stops: Array<[number, [number, number, number]]> = [];
  const eps = 1e-6;
  for (let i = 0; i < leg.classes.length; i++) {
    const c = leg.classes[i];
    const { clara, escura } = coresDaClasse(c.corBase);
    const inicio = c.valorMin == null ? 0 : Math.max(0, (c.valorMin - vmin) / span);
    const fim    = c.valorMax == null ? 1 : Math.min(1, (c.valorMax - vmin) / span);
    stops.push([Math.min(1, inicio + (i === 0 ? 0 : eps)), hexToRgb(clara)]);
    stops.push([Math.max(0, fim - (i === leg.classes.length - 1 ? 0 : eps)), hexToRgb(escura)]);
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
