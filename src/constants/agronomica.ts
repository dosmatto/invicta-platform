// Base Agronômica — configuração central de legendas e classes por nutriente

export interface ClasseNutriente {
  nome: string;
  min: number | null; // null = sem limite inferior
  max: number | null; // null = sem limite superior
}

export interface LegendaNutriente {
  id: string;
  simbolo: string;
  nome: string;
  unidade: string;
  invertido: boolean; // true = Al, m% (alta concentração = ruim)
  classes: ClasseNutriente[];
  metodologia: string;
  observacao?: string;
}

// Paleta de cores padrão (5 classes)
// Normal:   MB=vermelho, B=laranja, M=amarelo, A=azul, MA=roxo
// Invertido: MB=roxo,    B=azul,    M=amarelo, A=laranja, MA=vermelho
export const CORES_CLASSES = {
  normal: {
    'Muito Baixo': '#cc0000',
    'Baixo':       '#f46d43',
    'Médio':       '#fee090',
    'Alto':        '#4575b4',
    'Muito Alto':  '#762a83',
  },
  invertido: {
    'Muito Baixo': '#762a83',
    'Baixo':       '#4575b4',
    'Médio':       '#fee090',
    'Alto':        '#f46d43',
    'Muito Alto':  '#cc0000',
  },
};

export const GRADIENTE_NORMAL =
  'linear-gradient(to right, #cc0000 0%, #f46d43 20%, #fee090 45%, #74c476 60%, #4575b4 80%, #762a83 100%)';

export const GRADIENTE_INVERTIDO =
  'linear-gradient(to right, #762a83 0%, #4575b4 20%, #74c476 45%, #fee090 60%, #f46d43 80%, #cc0000 100%)';

// Dados base com valores Embrapa Cerrado como padrão inicial
export const LEGENDAS_PADRAO: LegendaNutriente[] = [
  {
    id: 'ph',
    simbolo: 'pH',
    nome: 'pH do Solo',
    unidade: 'CaCl₂',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 4.4 },
      { nome: 'Baixo',       min: 4.4,  max: 5.0 },
      { nome: 'Médio',       min: 5.0,  max: 5.5 },
      { nome: 'Alto',        min: 5.5,  max: 6.0 },
      { nome: 'Muito Alto',  min: 6.0,  max: null },
    ],
  },
  {
    id: 'p',
    simbolo: 'P',
    nome: 'Fósforo',
    unidade: 'mg/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    observacao: 'Extrator Mehlich-1',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 4.0 },
      { nome: 'Baixo',       min: 4.0,  max: 8.0 },
      { nome: 'Médio',       min: 8.0,  max: 15.0 },
      { nome: 'Alto',        min: 15.0, max: 25.0 },
      { nome: 'Muito Alto',  min: 25.0, max: null },
    ],
  },
  {
    id: 'k',
    simbolo: 'K',
    nome: 'Potássio',
    unidade: 'mmolc/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 0.7 },
      { nome: 'Baixo',       min: 0.7,  max: 1.5 },
      { nome: 'Médio',       min: 1.5,  max: 3.0 },
      { nome: 'Alto',        min: 3.0,  max: 6.0 },
      { nome: 'Muito Alto',  min: 6.0,  max: null },
    ],
  },
  {
    id: 'ca',
    simbolo: 'Ca',
    nome: 'Cálcio',
    unidade: 'mmolc/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 3.0 },
      { nome: 'Baixo',       min: 3.0,  max: 7.0 },
      { nome: 'Médio',       min: 7.0,  max: 15.0 },
      { nome: 'Alto',        min: 15.0, max: 30.0 },
      { nome: 'Muito Alto',  min: 30.0, max: null },
    ],
  },
  {
    id: 'mg',
    simbolo: 'Mg',
    nome: 'Magnésio',
    unidade: 'mmolc/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 2.0 },
      { nome: 'Baixo',       min: 2.0,  max: 5.0 },
      { nome: 'Médio',       min: 5.0,  max: 9.0 },
      { nome: 'Alto',        min: 9.0,  max: 15.0 },
      { nome: 'Muito Alto',  min: 15.0, max: null },
    ],
  },
  {
    id: 'al',
    simbolo: 'Al',
    nome: 'Alumínio',
    unidade: 'mmolc/dm³',
    invertido: true,
    metodologia: 'Embrapa Cerrado',
    observacao: 'Invertido: valores altos são prejudiciais',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 1.0 },
      { nome: 'Baixo',       min: 1.0,  max: 3.0 },
      { nome: 'Médio',       min: 3.0,  max: 6.0 },
      { nome: 'Alto',        min: 6.0,  max: 10.0 },
      { nome: 'Muito Alto',  min: 10.0, max: null },
    ],
  },
  {
    id: 'ctc',
    simbolo: 'CTC',
    nome: 'Capacidade de Troca Catiônica',
    unidade: 'mmolc/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 40.0 },
      { nome: 'Baixo',       min: 40.0, max: 60.0 },
      { nome: 'Médio',       min: 60.0, max: 80.0 },
      { nome: 'Alto',        min: 80.0, max: 120.0 },
      { nome: 'Muito Alto',  min: 120.0, max: null },
    ],
  },
  {
    id: 'v',
    simbolo: 'V%',
    nome: 'Saturação de Bases',
    unidade: '%',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 25.0 },
      { nome: 'Baixo',       min: 25.0, max: 45.0 },
      { nome: 'Médio',       min: 45.0, max: 60.0 },
      { nome: 'Alto',        min: 60.0, max: 75.0 },
      { nome: 'Muito Alto',  min: 75.0, max: null },
    ],
  },
  {
    id: 'm',
    simbolo: 'm%',
    nome: 'Saturação de Alumínio',
    unidade: '%',
    invertido: true,
    metodologia: 'Embrapa Cerrado',
    observacao: 'Invertido: valores altos indicam toxidez',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 5.0 },
      { nome: 'Baixo',       min: 5.0,  max: 15.0 },
      { nome: 'Médio',       min: 15.0, max: 25.0 },
      { nome: 'Alto',        min: 25.0, max: 50.0 },
      { nome: 'Muito Alto',  min: 50.0, max: null },
    ],
  },
  {
    id: 'mo',
    simbolo: 'MO',
    nome: 'Matéria Orgânica',
    unidade: 'g/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 10.0 },
      { nome: 'Baixo',       min: 10.0, max: 20.0 },
      { nome: 'Médio',       min: 20.0, max: 30.0 },
      { nome: 'Alto',        min: 30.0, max: 45.0 },
      { nome: 'Muito Alto',  min: 45.0, max: null },
    ],
  },
  {
    id: 's',
    simbolo: 'S',
    nome: 'Enxofre',
    unidade: 'mg/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 3.0 },
      { nome: 'Baixo',       min: 3.0,  max: 6.0 },
      { nome: 'Médio',       min: 6.0,  max: 10.0 },
      { nome: 'Alto',        min: 10.0, max: 20.0 },
      { nome: 'Muito Alto',  min: 20.0, max: null },
    ],
  },
  {
    id: 'b',
    simbolo: 'B',
    nome: 'Boro',
    unidade: 'mg/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 0.2 },
      { nome: 'Baixo',       min: 0.2,  max: 0.5 },
      { nome: 'Médio',       min: 0.5,  max: 1.0 },
      { nome: 'Alto',        min: 1.0,  max: 2.0 },
      { nome: 'Muito Alto',  min: 2.0,  max: null },
    ],
  },
  {
    id: 'zn',
    simbolo: 'Zn',
    nome: 'Zinco',
    unidade: 'mg/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 0.5 },
      { nome: 'Baixo',       min: 0.5,  max: 1.2 },
      { nome: 'Médio',       min: 1.2,  max: 2.0 },
      { nome: 'Alto',        min: 2.0,  max: 5.0 },
      { nome: 'Muito Alto',  min: 5.0,  max: null },
    ],
  },
  {
    id: 'cu',
    simbolo: 'Cu',
    nome: 'Cobre',
    unidade: 'mg/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 0.2 },
      { nome: 'Baixo',       min: 0.2,  max: 0.5 },
      { nome: 'Médio',       min: 0.5,  max: 1.0 },
      { nome: 'Alto',        min: 1.0,  max: 3.0 },
      { nome: 'Muito Alto',  min: 3.0,  max: null },
    ],
  },
  {
    id: 'mn',
    simbolo: 'Mn',
    nome: 'Manganês',
    unidade: 'mg/dm³',
    invertido: false,
    metodologia: 'Embrapa Cerrado',
    classes: [
      { nome: 'Muito Baixo', min: null, max: 1.5 },
      { nome: 'Baixo',       min: 1.5,  max: 5.0 },
      { nome: 'Médio',       min: 5.0,  max: 12.0 },
      { nome: 'Alto',        min: 12.0, max: 25.0 },
      { nome: 'Muito Alto',  min: 25.0, max: null },
    ],
  },
];

// Análises físicas (não-nutrientes) selecionáveis nos Padrões de Elementos.
// A textura/granulometria não segue o modelo de classes dos nutrientes.
export const ANALISES_FISICAS = [
  { id: 'textura', simbolo: 'Text', nome: 'Textura (granulometria)' },
];
