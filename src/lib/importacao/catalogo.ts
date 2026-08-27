// CASAMENTO CONTRA CATÁLOGO (propósito, cultivar, cultura). Puro — sem DOM, sem I/O.
//
// Diferente de produtor/fazenda/talhão: aqui o universo é pequeno e fechado (4
// propósitos, 4 culturas, algumas dezenas de cultivares), e o que a planilha
// traz quase nunca é o nome — é uma SIGLA COMERCIAL. "55I57RSF IPRO" é o
// Brasmax Zeus IPRO; "5995I2X" é o nome mesmo.
//
// A regra que sustenta o ganho de tempo: NUNCA adivinhar o nome de um cultivar.
// Errar o nome é pior que não ter — o dado entra bonito e errado, e ninguém
// confere depois. O que este módulo faz é (a) casar contra o que já foi
// confirmado antes, (b) extrair o que a própria planilha já entrega de graça, e
// (c) sugerir a marca para poupar digitação no cadastro novo. O nome vem do
// usuário, uma vez, e fica gravado como sinônimo para sempre.

import { chave, na, similaridade } from './texto.ts';
import { montarCasamento } from './identidade.ts';
import type { Casamento, Motivo } from './identidade.ts';

/** Qualquer item de catálogo com nome e apelidos aprendidos. */
export interface ItemCatalogo {
  nome: string;
  sinonimos?: string[];
  ativo?: boolean;
}

/** Piso para SUGERIR um item de catálogo. Abaixo disso, é cadastro novo. */
export const PISO_CATALOGO_SUGESTAO = 0.75;

/**
 * Casa um valor da planilha contra um catálogo.
 *
 * A cascata é curta de propósito — catálogo pequeno não comporta heurística
 * solta:
 *   1. nome idêntico
 *   2. sinônimo/sigla já confirmado  ← é aqui que mora o ganho de tempo
 *   3. nome comercial entre parênteses ("DP155100886 (P25300PWU)")
 *   4. parecido o bastante para sugerir → confirmar
 *   5. nada → criar
 */
export function casarCatalogo<T extends ItemCatalogo>(
  valorPlanilha: string,
  catalogo: T[] | null | undefined,
  nomeDe: (t: T) => string = (t) => t.nome,
  sinonimosDe: (t: T) => string[] | undefined = (t) => t.sinonimos,
): Casamento<T> {
  const entrada = String(valorPlanilha ?? '');
  const lista = (catalogo ?? []).filter(t => t?.ativo !== false);
  const k = chave(entrada);
  if (!k || !lista.length) return montarCasamento<T>(entrada, 'nenhum', null, 0);

  const exatos = lista.filter(t => chave(nomeDe(t)) === k);
  if (exatos.length === 1) return montarCasamento(entrada, 'exato', exatos[0], 1);

  const porSin = lista.filter(t => (sinonimosDe(t) ?? []).some(s => chave(s) === k));
  if (porSin.length === 1) return montarCasamento(entrada, 'sinonimo', porSin[0], 1);
  if (porSin.length > 1) {
    return montarCasamento(entrada, 'ambiguo', null, 1,
      porSin.map(t => ({ alvo: t, score: 1, motivo: 'sinonimo' as Motivo })));
  }

  // A planilha às vezes já entrega o nome comercial entre parênteses. Dois dos
  // 49 cultivares vêm assim, e resolvem sozinhos sem ninguém digitar nada.
  const comercial = nomeComercial(entrada);
  if (comercial) {
    const kc = chave(comercial);
    const achados = lista.filter(t => chave(nomeDe(t)) === kc || (sinonimosDe(t) ?? []).some(s => chave(s) === kc));
    if (achados.length === 1) return montarCasamento(entrada, 'sinonimo', achados[0], 1);
  }

  const pontuados = lista
    .map(t => ({ alvo: t, score: similaridade(k, chave(nomeDe(t))) }))
    .filter(x => x.score >= PISO_CATALOGO_SUGESTAO)
    .sort((a, b) => b.score - a.score);

  if (!pontuados.length) return montarCasamento<T>(entrada, 'nenhum', null, 0);
  return montarCasamento(entrada, 'similar', pontuados[0].alvo, pontuados[0].score,
    pontuados.slice(1).map(x => ({ ...x, motivo: 'similar' as Motivo })));
}

/**
 * O nome comercial que a planilha já traz entre parênteses.
 *
 * `DP155100886 (P25300PWU)` → `P25300PWU`
 * `7602PRO4 (AS 1901 PRO4)` → `AS 1901 PRO4`
 *
 * Só vale quando há texto fora E dentro do parêntese — "(Mauri)" sozinho é
 * apelido de talhão, não código de cultivar.
 */
export function nomeComercial(sigla: string): string {
  const m = /^\s*(\S[^(]*?)\s*\(([^)]+)\)\s*$/.exec(String(sigla ?? ''));
  return m ? m[2].trim() : '';
}

/**
 * Marca provável, deduzida do prefixo do código comercial. É SUGESTÃO para
 * pré-preencher o cadastro novo — nunca decide nada sozinha.
 *
 * Só prefixos que identificam uma marca sem ambiguidade. Códigos numéricos
 * (`5995I2X`, `581 E`, `55I57RSF IPRO`) ficam de fora de propósito: são de vários
 * obtentores e chutar ali só geraria cadastro errado.
 */
const MARCAS: { prefixo: RegExp; marca: string }[] = [
  { prefixo: /^AG\d/, marca: 'Agroceres' },
  { prefixo: /^DKB\d/, marca: 'Dekalb' },
  { prefixo: /^AS\s?\d/, marca: 'Agroeste' },
  { prefixo: /^IPR\b/, marca: 'IAPAR' },
  { prefixo: /^IAC\b/, marca: 'IAC' },
  { prefixo: /^BRS\s?\d/, marca: 'Embrapa' },
  { prefixo: /^NS\d/, marca: 'Nidera' },
];

export function marcaProvavel(sigla: string): string {
  const s = na(sigla);
  return MARCAS.find(m => m.prefixo.test(s))?.marca ?? '';
}

/**
 * Aprende: acrescenta a sigla da planilha aos sinônimos do item confirmado, sem
 * duplicar e sem apagar o que já havia.
 *
 * É esta função, chamada uma vez por confirmação do usuário, que faz a próxima
 * planilha casar sozinha — os 47 cultivares que hoje exigem decisão viram
 * esforço único, não recorrente.
 */
export function aprenderSinonimo(sinonimosAtuais: string[] | undefined, novaSigla: string): string[] {
  const atuais = sinonimosAtuais ?? [];
  const nova = na(novaSigla);
  if (!nova) return atuais;
  if (atuais.some(s => chave(s) === chave(nova))) return atuais;
  return [...atuais, nova];
}
