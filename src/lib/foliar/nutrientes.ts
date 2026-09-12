// CATÁLOGO DOS 11 NUTRIENTES FOLIARES — e o tradutor de cabeçalho de planilha.
//
// POR QUE EXISTE: o laudo foliar chega em cinco dialetos diferentes ao mesmo
// tempo — "N (g/kg)", "Nitrogênio", "N %", "P2O5", "B (ppm)", "Boro mg/dm3".
// Se cada tela resolver isso sozinha, dois lugares do app vão discordar sobre o
// que é o "P" da amostra. Aqui a regra é única e testada.
//
// DUAS ARMADILHAS TRATADAS:
//
//  1. ÓXIDO × ELEMENTO. Laboratório que publica "P2O5" e "K2O" na folha não é
//     raro. O número precisa ser MULTIPLICADO pelo fator antes de virar P ou K
//     — sem isso o erro é de 129% no P e 20% no K. Os fatores vêm de
//     `src/lib/nutrienteBase.ts` (derivados das massas atômicas IUPAC), não de
//     tabela copiada: uma fonte só de verdade para o app inteiro (ledger 13).
//  2. UNIDADE. Macro é publicado em g/kg, dag/kg (= %) ou %; micro em mg/kg ou
//     ppm (idênticos). A unidade CANÔNICA aqui é g/kg para macro e mg/kg para
//     micro — é como Kurihara et al. (2013) e a tabela Embrapa/Sfredo publicam,
//     e é o que a norma guarda. Converter na entrada evita que uma amostra em %
//     dispare "deficiência severa" de N por erro de escala 10×.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { OXIDO_PARA_ELEMENTO } from '../nutrienteBase.ts';
import { NUTRIENTES, type NutrienteId, type TeoresFoliares, type TeoresParciais, type UnidadeTeor } from './tipos.ts';

export interface Nutriente {
  id: NutrienteId;
  simbolo: string;
  nome: string;
  unidade: UnidadeTeor;
  grupo: 'macro' | 'micro';
  /** Nomes de coluna já vistos em planilha/laudo, normalizados sem acento. */
  aliases: string[];
}

/**
 * Catálogo canônico. `aliases` guarda a forma CRUA como aparece na planilha;
 * a comparação é feita depois de `chave()` (sem acento, minúsculo, sem
 * pontuação), então "Nitrogênio" e "NITROGENIO" batem no mesmo alias.
 */
export const CATALOGO_NUTRIENTES: readonly Nutriente[] = [
  { id: 'N', simbolo: 'N', nome: 'Nitrogênio', unidade: 'g/kg', grupo: 'macro', aliases: ['n', 'nitrogenio', 'nitrogen'] },
  { id: 'P', simbolo: 'P', nome: 'Fósforo', unidade: 'g/kg', grupo: 'macro', aliases: ['p', 'fosforo', 'phosphorus', 'p2o5', 'p 2 o 5'] },
  { id: 'K', simbolo: 'K', nome: 'Potássio', unidade: 'g/kg', grupo: 'macro', aliases: ['k', 'potassio', 'potassium', 'k2o'] },
  { id: 'Ca', simbolo: 'Ca', nome: 'Cálcio', unidade: 'g/kg', grupo: 'macro', aliases: ['ca', 'calcio', 'calcium', 'cao'] },
  { id: 'Mg', simbolo: 'Mg', nome: 'Magnésio', unidade: 'g/kg', grupo: 'macro', aliases: ['mg', 'magnesio', 'magnesium', 'mgo'] },
  { id: 'S', simbolo: 'S', nome: 'Enxofre', unidade: 'g/kg', grupo: 'macro', aliases: ['s', 'enxofre', 'sulfur', 'sulphur', 's-so4', 'so4'] },
  { id: 'B', simbolo: 'B', nome: 'Boro', unidade: 'mg/kg', grupo: 'micro', aliases: ['b', 'boro', 'boron'] },
  { id: 'Cu', simbolo: 'Cu', nome: 'Cobre', unidade: 'mg/kg', grupo: 'micro', aliases: ['cu', 'cobre', 'copper'] },
  { id: 'Fe', simbolo: 'Fe', nome: 'Ferro', unidade: 'mg/kg', grupo: 'micro', aliases: ['fe', 'ferro', 'iron'] },
  { id: 'Mn', simbolo: 'Mn', nome: 'Manganês', unidade: 'mg/kg', grupo: 'micro', aliases: ['mn', 'manganes', 'manganese'] },
  { id: 'Zn', simbolo: 'Zn', nome: 'Zinco', unidade: 'mg/kg', grupo: 'micro', aliases: ['zn', 'zinco', 'zinc'] },
] as const;

const POR_ID = new Map<NutrienteId, Nutriente>(CATALOGO_NUTRIENTES.map(n => [n.id, n]));

export const nutrientePorId = (id: NutrienteId): Nutriente => POR_ID.get(id) as Nutriente;

export const unidadeDe = (id: NutrienteId): UnidadeTeor => nutrientePorId(id).unidade;

// ── Normalização de nome de coluna ──────────────────────────────────────────

/** Sem acento, minúsculo, pontuação virando espaço, espaços colapsados. */
function chave(texto: string): string {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Remove o sufixo de unidade do cabeçalho: "N (g/kg)" → "n", "B mg/dm3" → "b",
 * "P %" → "p". Sem isso o "dm3" de "mg/dm3" vira ruído e nenhum alias casa.
 */
const SUFIXOS_UNIDADE = [
  'g kg', 'mg kg', 'mg dm3', 'g dm3', 'dag kg', 'ppm', 'ppb', 'mg l', 'g l',
  'porcentagem', 'percentual', 'teor', 'foliar', 'folha', 'total',
];

function limparCabecalho(texto: string): string {
  let k = chave(texto);
  // "%" já virou espaço em chave(); trata a forma escrita por extenso e as siglas.
  for (const s of SUFIXOS_UNIDADE) {
    if (k.endsWith(' ' + s)) k = k.slice(0, -(s.length + 1)).trim();
    if (k.startsWith(s + ' ')) k = k.slice(s.length + 1).trim();
  }
  return k;
}

const ALIAS_PARA_ID = new Map<string, NutrienteId>();
for (const n of CATALOGO_NUTRIENTES) for (const a of n.aliases) ALIAS_PARA_ID.set(chave(a), n.id);

/**
 * Nome de coluna → nutriente. Devolve `null` quando não reconhece — nunca um
 * "chute": coluna não reconhecida é problema do importador resolver com o
 * usuário, não do catálogo adivinhar.
 *
 * Óxidos ("P2O5", "K2O") mapeiam para o ELEMENTO correspondente; use
 * `fatorOxidoDaColuna` para converter o VALOR, senão o teor fica 2,29× alto.
 */
export function normalizarNomeNutriente(texto: string): NutrienteId | null {
  if (!texto) return null;
  const limpo = limparCabecalho(texto);
  // Coluna que é SÓ unidade ("mg/kg") não é nutriente — sem esta guarda o
  // laço de palavras abaixo leria o "mg" como Magnésio.
  if (!limpo || SUFIXOS_UNIDADE.includes(limpo)) return null;
  const direto = ALIAS_PARA_ID.get(limpo);
  if (direto) return direto;
  // Cabeçalhos compostos: "teor de nitrogenio na folha", "nitrogenio total".
  const palavras = limpo.split(' ').filter(Boolean);
  for (const p of palavras) {
    const id = ALIAS_PARA_ID.get(p);
    if (id) return id;
  }
  return null;
}

/** 1 quando a coluna já é elementar; o fator IUPAC quando é óxido. */
export function fatorOxidoDaColuna(texto: string): number {
  const k = limparCabecalho(texto).replace(/ /g, '');
  if (k.includes('p2o5')) return OXIDO_PARA_ELEMENTO.p2o5;
  if (k.includes('k2o')) return OXIDO_PARA_ELEMENTO.k2o;
  return 1;
}

// ── Unidades ────────────────────────────────────────────────────────────────

/** Unidades de entrada aceitas num laudo foliar. */
export type UnidadeEntrada = 'g/kg' | 'mg/kg' | 'ppm' | '%' | 'dag/kg';

/** Para g/kg. % e dag/kg são a mesma coisa (1 dag/kg = 1% = 10 g/kg). */
const PARA_GKG: Record<UnidadeEntrada, number> = {
  'g/kg': 1, 'mg/kg': 0.001, ppm: 0.001, '%': 10, 'dag/kg': 10,
};

/** Converte um valor de qualquer unidade aceita para outra. */
export function converterUnidade(valor: number, de: UnidadeEntrada, para: UnidadeEntrada): number {
  if (!Number.isFinite(valor)) return NaN;
  return (valor * PARA_GKG[de]) / PARA_GKG[para];
}

/** Lê a unidade escrita no cabeçalho ("B (mg/kg)" → 'mg/kg'). `null` se não disser. */
export function unidadeDaColuna(texto: string): UnidadeEntrada | null {
  if (!texto) return null;
  if (texto.includes('%')) return '%';
  const k = chave(texto);
  if (/\bdag kg\b/.test(k)) return 'dag/kg';
  if (/\bmg (kg|dm3|l)\b/.test(k) || /\bppm\b/.test(k)) return 'mg/kg';
  if (/\bg (kg|dm3|l)\b/.test(k)) return 'g/kg';
  return null;
}

/**
 * Converte um valor para a unidade CANÔNICA do nutriente (macro g/kg, micro
 * mg/kg). Unidade desconhecida ⇒ assume que o valor já está na canônica: é a
 * hipótese menos destrutiva, e o importador avisa quando não achou unidade.
 */
export function converterParaCanonica(id: NutrienteId, valor: number, unidade?: UnidadeEntrada | null): number {
  if (!Number.isFinite(valor)) return NaN;
  const alvo = unidadeDe(id) as UnidadeEntrada;
  return unidade ? converterUnidade(valor, unidade, alvo) : valor;
}

/** Tudo que dá para extrair de um cabeçalho de planilha, de uma vez. */
export interface ColunaInterpretada {
  nutriente: NutrienteId;
  unidade: UnidadeEntrada | null;
  /** Multiplicador do valor bruto: fator do óxido × conversão de unidade. */
  fator: number;
}

export function interpretarColuna(texto: string): ColunaInterpretada | null {
  const nutriente = normalizarNomeNutriente(texto);
  if (!nutriente) return null;
  const unidade = unidadeDaColuna(texto);
  const oxido = fatorOxidoDaColuna(texto);
  const alvo = unidadeDe(nutriente) as UnidadeEntrada;
  const escala = unidade ? PARA_GKG[unidade] / PARA_GKG[alvo] : 1;
  return { nutriente, unidade, fator: oxido * escala };
}

// ── Teores ──────────────────────────────────────────────────────────────────

/** Registro completo com todos os 11 em `null` — o ponto de partida honesto. */
export function teoresVazios(): TeoresFoliares {
  const t = {} as TeoresFoliares;
  for (const id of NUTRIENTES) t[id] = null;
  return t;
}

/**
 * Completa um objeto parcial para `TeoresFoliares`. Valor não finito ou
 * negativo vira `null` — "não medido" em vez de um número que quebraria a
 * razão dual sem ninguém perceber.
 */
export function normalizarTeores(parcial: TeoresParciais | null | undefined): TeoresFoliares {
  const t = teoresVazios();
  if (!parcial) return t;
  for (const id of NUTRIENTES) {
    const v = parcial[id];
    t[id] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  }
  return t;
}

/** Os nutrientes efetivamente analisados — base do "n ajustado" do DRIS. */
export function nutrientesPresentes(teores: TeoresFoliares): NutrienteId[] {
  return NUTRIENTES.filter(id => {
    const v = teores[id];
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
  });
}

/**
 * Todos os teores em g/kg — o CND precisa somar macro com micro para fechar os
 * 1000 g/kg da matéria seca, e somar g/kg com mg/kg dá erro de 1000×.
 */
export function teoresEmGkg(teores: TeoresFoliares): Partial<Record<NutrienteId, number>> {
  const out: Partial<Record<NutrienteId, number>> = {};
  for (const id of nutrientesPresentes(teores)) {
    const v = teores[id] as number;
    out[id] = unidadeDe(id) === 'mg/kg' ? v / 1000 : v;
  }
  return out;
}
