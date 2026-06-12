// Seed inicial — Repositório Fundação ABC (11 legendas + 1 micronutriente exemplo).
// Limites exatos da especificação técnica; cores oficiais (V→A→V→A→R);
// larguras visuais 22,5/22,5/22,5/22,5/10. Para escalas invertidas (Al, m%),
// as cores são invertidas (Roxo no Muito Baixo, Vermelho no Muito Alto).

import { classesFertilidade5, type Legenda, PARES_OFICIAIS_5 } from '@/lib/legendas';

const dtIso = '2026-06-11T00:00:00.000Z';
const base = { fonte: 'Fundação ABC', categoria: 'fertilidade' as const, tipoEscala: 'gradiente' as const, estilo: 'segmentado' as const, criadoEm: dtIso, atualizadoEm: dtIso };

export const LEGENDAS_SEED_ABC: Legenda[] = [
  {
    ...base, id: 'fabc_ph_cacl2',
    nome: 'Fundação ABC - pH CaCl₂',
    atributoId: 'ph', atributo: 'pH', simbolo: 'pH',
    unidade: 'CaCl₂', metodo: 'CaCl₂', invertida: false,
    classes: classesFertilidade5([4.3, 5.0, 5.5, 6.0]),
  },
  {
    ...base, id: 'fabc_aluminio',
    nome: 'Fundação ABC - Alumínio',
    atributoId: 'al', atributo: 'Alumínio', simbolo: 'Al³⁺',
    unidade: 'mmolc/dm³', metodo: null, invertida: true,
    observacao: 'Valores altos = toxidez',
    classes: classesFertilidade5([0.3, 0.7, 1.5, 2.5], true),
  },
  {
    ...base, id: 'fabc_calcio',
    nome: 'Fundação ABC - Cálcio',
    atributoId: 'ca', atributo: 'Cálcio', simbolo: 'Ca²⁺',
    unidade: 'mmolc/dm³', metodo: null, invertida: false,
    classes: classesFertilidade5([10, 20, 35, 50]),
  },
  {
    ...base, id: 'fabc_magnesio',
    nome: 'Fundação ABC - Magnésio',
    atributoId: 'mg', atributo: 'Magnésio', simbolo: 'Mg²⁺',
    unidade: 'mmolc/dm³', metodo: null, invertida: false,
    classes: classesFertilidade5([5, 10, 20, 30]),
  },
  {
    ...base, id: 'fabc_ctc_ph7',
    nome: 'Fundação ABC - CTC pH 7,0',
    atributoId: 'ctc', atributo: 'CTC pH 7,0', simbolo: 'CTC',
    unidade: 'mmolc/dm³', metodo: 'pH 7,0', invertida: false,
    classes: classesFertilidade5([50, 70, 140, 240]),
  },
  {
    ...base, id: 'fabc_ctc_efetiva',
    nome: 'Fundação ABC - CTC Efetiva',
    atributoId: 't', atributo: 'CTC Efetiva', simbolo: 't',
    unidade: 'mmolc/dm³', metodo: null, invertida: false,
    classes: classesFertilidade5([10, 20, 40, 80]),
  },
  {
    ...base, id: 'fabc_v',
    nome: 'Fundação ABC - Saturação por Bases',
    atributoId: 'v', atributo: 'Saturação por Bases', simbolo: 'V%',
    unidade: '%', metodo: null, invertida: false,
    classes: classesFertilidade5([30, 45, 60, 80]),
  },
  {
    ...base, id: 'fabc_m',
    nome: 'Fundação ABC - Saturação por Alumínio',
    atributoId: 'm', atributo: 'Saturação por Alumínio', simbolo: 'm%',
    unidade: '%', metodo: null, invertida: true,
    observacao: 'Valores altos = toxidez',
    classes: classesFertilidade5([5, 10, 20, 50], true),
  },
  {
    ...base, id: 'fabc_materia_organica',
    nome: 'Fundação ABC - Matéria Orgânica',
    atributoId: 'mo', atributo: 'Matéria Orgânica', simbolo: 'M.O.',
    unidade: '%', metodo: null, invertida: false,
    classes: classesFertilidade5([1.4, 2.4, 3.4, 4.5]),
  },
  {
    ...base, id: 'fabc_fosforo_resina',
    nome: 'Fundação ABC - Fósforo Resina',
    atributoId: 'p', atributo: 'Fósforo', simbolo: 'P',
    unidade: 'mg/dm³', metodo: 'Resina', invertida: false,
    classes: classesFertilidade5([6, 15, 40, 80]),
  },
  {
    ...base, id: 'fabc_potassio',
    nome: 'Fundação ABC - Potássio',
    atributoId: 'k', atributo: 'Potássio', simbolo: 'K',
    unidade: 'mmolc/dm³', metodo: null, invertida: false,
    classes: classesFertilidade5([0.7, 1.5, 3.0, 6.0]),
  },
  // Exemplo de micronutriente (3 classes — Zn DTPA, conforme spec)
  {
    ...base, id: 'fabc_zinco_dtpa',
    nome: 'Fundação ABC - Zinco DTPA',
    atributoId: 'zn', atributo: 'Zinco', simbolo: 'Zn',
    unidade: 'mg/dm³', metodo: 'DTPA', categoria: 'micronutriente',
    invertida: false,
    classes: [
      { nome: 'Baixo', valorMin: null, valorMax: 0.6, corInicio: PARES_OFICIAIS_5[0].inicio, corFim: PARES_OFICIAIS_5[0].fim, larguraVisual: 30, ordem: 1 },
      { nome: 'Médio', valorMin: 0.6,  valorMax: 1.2, corInicio: PARES_OFICIAIS_5[2].inicio, corFim: PARES_OFICIAIS_5[2].fim, larguraVisual: 35, ordem: 2 },
      { nome: 'Alto',  valorMin: 1.2,  valorMax: null, corInicio: PARES_OFICIAIS_5[3].inicio, corFim: PARES_OFICIAIS_5[3].fim, larguraVisual: 35, ordem: 3 },
    ],
  },
];
