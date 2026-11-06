// Portal do Produtor — UNIDADE da produtividade (kg/ha · sc/ha · sc/alq).
//
// O produtor escolhe no cabeçalho do portal em que unidade quer ler a
// produtividade; o padrão é kg/ha. Os números do portal (lib/portalPainel,
// lib/portalPainelSensores, o benchmark do servidor) continuam em sc/ha — com
// PRECISÃO CHEIA (kgParaScCheio, sem arredondar no meio: 3.500 kg/ha tem de
// voltar "3.500", não "3.498") — e a conversão/arredondamento é só na TELA:
//   · saca = 60 kg;
//   · alqueire paulista = 2,42 ha (padrão do PR/SP, região dos clientes);
//   · kg/ha sai inteiro com milhar ("5.784 kg/ha"); sc/ha e sc/alq, 1 casa.
// As legendas de classe são cadastradas em kg/ha: os LIMITES mostrados vêm da
// legenda original convertida (classesNaUnidade), mas a classificação segue a
// mesma régua de sempre (classesEmSacas) — trocar a unidade nunca muda a classe
// de um talhão.
//
// Módulo PURO (sem DOM): a preferência fica no navegador, gravada pelo portal
// (components/portal/ui/unidadeProd.ts). Teste: `node scripts/teste-portal-unidade.mjs`.
//
// Extensão .ts explícita nos imports: o teste roda em node (type-stripping).

import { kgParaSc } from './portalProdutor.ts';

export type UnidadeProd = 'kg/ha' | 'sc/ha' | 'sc/alq';

export const UNIDADES_PROD: readonly UnidadeProd[] = ['kg/ha', 'sc/ha', 'sc/alq'];
export const UNIDADE_PROD_PADRAO: UnidadeProd = 'kg/ha';
export const KG_POR_SACA = 60;
export const HA_POR_ALQUEIRE = 2.42;

/** Para o seletor e o tooltip. */
export const DESCRICAO_UNIDADE: Record<UnidadeProd, string> = {
  'kg/ha': 'quilos por hectare',
  'sc/ha': 'sacas de 60 kg por hectare',
  'sc/alq': 'sacas de 60 kg por alqueire paulista (2,42 ha)',
};

export function ehUnidadeProd(v: unknown): v is UnidadeProd {
  return typeof v === 'string' && (UNIDADES_PROD as readonly string[]).includes(v);
}

/** Valor salvo (ou qualquer coisa) → uma unidade válida; o resto vira o padrão. */
export function normalizarUnidadeProd(v: unknown): UnidadeProd {
  return ehUnidadeProd(v) ? v : UNIDADE_PROD_PADRAO;
}

/** Casas decimais da unidade: kg/ha inteiro, sacas com 1 casa. */
export function casasDaUnidade(u: UnidadeProd): number {
  return u === 'kg/ha' ? 0 : 1;
}

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** kg/ha → sc/ha SEM arredondar: é o que as contas do portal carregam até a
 *  tela (arredondar a 1 casa no meio fazia 3.500 kg/ha voltar como "3.498"). */
export const kgParaScCheio = (kg: number): number => kg / KG_POR_SACA;

/** sc/ha (o que o portal calcula) → a unidade. Sem arredondar (a tela arredonda). */
export function deScHa(sc: number, u: UnidadeProd): number {
  if (u === 'kg/ha') return sc * KG_POR_SACA;
  if (u === 'sc/alq') return sc * HA_POR_ALQUEIRE;
  return sc;
}

/** Igual a deScHa, aceitando vazio (null/undefined/NaN → null). */
export function deScHaOuNulo(sc: number | null | undefined, u: UnidadeProd): number | null {
  return finito(sc) ? deScHa(sc, u) : null;
}

/** kg/ha (o que a legenda e o mapa de colheita guardam) → a unidade. */
export function deKgHa(kg: number, u: UnidadeProd): number {
  if (u === 'kg/ha') return kg;
  if (u === 'sc/ha') return kgParaSc(kg);
  return (kg / KG_POR_SACA) * HA_POR_ALQUEIRE;
}

/** Arredonda nas casas da unidade (para comparar e testar). */
export function arredondarNaUnidade(v: number, u: UnidadeProd): number {
  const f = 10 ** casasDaUnidade(u);
  return Math.round(v * f) / f;
}

/** Número JÁ na unidade → texto pt-BR com as casas dela ("5.784", "96,4"). */
export function fmtNaUnidade(v: number | null | undefined, u: UnidadeProd, comUnidade = false): string {
  if (!finito(v)) return '—';
  const casas = casasDaUnidade(u);
  const txt = v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return comUnidade ? `${txt} ${u}` : txt;
}

/** sc/ha → texto na unidade, com o rótulo dela por padrão ("5.784 kg/ha"). */
export function fmtScHa(sc: number | null | undefined, u: UnidadeProd, comUnidade = true): string {
  return fmtNaUnidade(deScHaOuNulo(sc, u), u, comUnidade);
}

/** kg/ha → texto na unidade ("3.600 kg/ha", "60,0 sc/ha", "145,2 sc/alq"). */
export function fmtKgHa(kg: number | null | undefined, u: UnidadeProd, comUnidade = true): string {
  return fmtNaUnidade(finito(kg) ? deKgHa(kg, u) : null, u, comUnidade);
}

/** Faixas de uma legenda cadastrada em kg/ha, na unidade (só para MOSTRAR os
 *  limites; a classe de cada talhão continua vindo de classesEmSacas). */
export function classesNaUnidade<T extends { valorMin: number | null; valorMax: number | null }>(classesKg: T[], u: UnidadeProd): T[] {
  const conv = (v: number | null) => (v == null ? null : deKgHa(v, u));
  return classesKg.map(c => ({ ...c, valorMin: conv(c.valorMin), valorMax: conv(c.valorMax) }));
}

/** Passo "redondo" de um eixo (1, 2, 2,5 ou 5 × 10ⁿ) para ~`alvo` divisões. */
export function passoDoEixo(amplitude: number, alvo = 5): number {
  if (!finito(amplitude) || amplitude <= 0) return 1;
  const bruto = amplitude / alvo;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  return ([1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= bruto) ?? pot * 10);
}

/** Chave do navegador da preferência — uma por produtor (cliente). */
export const CHAVE_UNIDADE_PROD = 'inv_portal_unidade_prod';
export const chaveUnidadeProd = (clienteId: string): string => `${CHAVE_UNIDADE_PROD}:${clienteId}`;
