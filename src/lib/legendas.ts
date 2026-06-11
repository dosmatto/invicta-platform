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

// Gradiente CSS pra UI da barra de legenda (usa larguras visuais).
export function gradienteCssDaLegenda(leg: Legenda): string {
  const partes: string[] = [];
  let acumulado = 0;
  for (const c of leg.classes) {
    const fim = acumulado + c.larguraVisual;
    partes.push(`${c.corBase} ${acumulado}%`);
    partes.push(`${c.corBase} ${fim}%`);
    acumulado = fim;
  }
  return `linear-gradient(to right, ${partes.join(', ')})`;
}

// Stops + domínio para o backend (mantém compatibilidade com a API atual).
// Estratégia: cor uniforme por classe (transições nítidas nas bordas) — o usuário
// vê faixas de cor sólidas conforme a classe agronômica.
export function stopsParaBackend(leg: Legenda): { dominio: [number, number]; stops: Array<[number, [number, number, number]]> } {
  const [vmin, vmax] = dominioDaLegenda(leg);
  const span = (vmax - vmin) || 1;
  const stops: Array<[number, [number, number, number]]> = [];
  const eps = 1e-6;
  for (let i = 0; i < leg.classes.length; i++) {
    const c = leg.classes[i];
    const rgb = hexToRgb(c.corBase);
    const inicio = c.valorMin == null ? 0 : Math.max(0, (c.valorMin - vmin) / span);
    const fim    = c.valorMax == null ? 1 : Math.min(1, (c.valorMax - vmin) / span);
    // duas paradas: começo e fim da classe com a mesma cor (faixa sólida);
    // o epsilon evita sobreposição com a classe anterior
    stops.push([Math.min(1, inicio + (i === 0 ? 0 : eps)), rgb]);
    stops.push([Math.max(0, fim - (i === leg.classes.length - 1 ? 0 : eps)), rgb]);
  }
  return { dominio: [vmin, vmax], stops };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
