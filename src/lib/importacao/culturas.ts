// CULTURA da planilha → cultura da plataforma. Puro — sem DOM, sem I/O.
//
// DECISÃO DO USUÁRIO (27/08/2026): manter a lista fixa `CULTURAS` de
// `store.ts:109` e descartar o qualificador de transgenia. "SOJA TRANSGENICA"
// entra como "Soja".
//
// A plataforma não tem — e por esta decisão não vai ter — o nível de subcultura.
// Como o texto original é dado do cliente que não volta, ele é PRESERVADO no
// registro do cultivo (`culturaOrigem`) em vez de ser jogado fora: se um dia a
// subcultura existir, a informação está lá para migrar, e enquanto isso o
// relatório de conferência consegue mostrar exatamente o que veio na planilha.
//
// A lista não é editável aqui de propósito: quem manda é `CULTURAS`. Este módulo
// só decide QUAL das dez o texto da planilha significa.

import { na, chave, similaridade } from './texto.ts';

/**
 * Sinônimos por cultura da lista fixa. Escritos já normalizados (sem acento,
 * maiúsculo) porque é assim que a comparação acontece.
 *
 * BRACHIARIA cai em "Pastagem": é a única das dez que descreve forrageira. Na
 * planilha de referência a única linha de braquiária tem propósito "Cobertura" e
 * é consórcio com milho — ou seja, o dado interessante ali é o propósito, não a
 * cultura.
 */
export const SINONIMOS_CULTURA: Record<string, string[]> = {
  'Soja': ['SOJA', 'SOJA TRANSGENICA', 'SOJA CONVENCIONAL', 'SOJA RR', 'SOJA IPRO', 'SOJA I2X'],
  'Milho': ['MILHO', 'MILHO TRANSGENICO', 'MILHO CONVENCIONAL', 'MILHO BT', 'MILHO SAFRINHA', 'MILHO SILAGEM'],
  'Trigo': ['TRIGO', 'TRIGO MOURISCO'],
  'Feijão': ['FEIJAO', 'FEIJAO PRETO', 'FEIJAO CARIOCA'],
  'Algodão': ['ALGODAO'],
  'Aveia': ['AVEIA', 'AVEIA BRANCA', 'AVEIA PRETA'],
  'Sorgo': ['SORGO', 'SORGO FORRAGEIRO'],
  'Cevada': ['CEVADA'],
  'Pastagem': ['PASTAGEM', 'BRACHIARIA', 'BRAQUIARIA', 'BRAQUIARIA RUZIZIENSIS', 'CAPIM', 'AZEVEM'],
  'Outra': ['OUTRA', 'OUTRO'],
};

/** Piso para SUGERIR uma cultura. Abaixo disso a tela pergunta. */
export const PISO_CULTURA_SUGESTAO = 0.7;

export interface CulturaCasada {
  /** Um dos valores de `CULTURAS`, ou '' quando não deu para decidir. */
  cultura: string;
  /** O texto exatamente como veio da planilha. Nunca é descartado. */
  origem: string;
  /** true = pode gravar sem perguntar. */
  automatico: boolean;
  /** Sugestões ordenadas, quando não foi automático. */
  opcoes: string[];
}

/**
 * Decide qual das dez culturas da plataforma o texto da planilha significa.
 *
 * Casamento por sinônimo é automático; "contém" e similaridade viram sugestão.
 * "MILHO 2ª SAFRA" não está na lista de sinônimos, mas contém "MILHO" — vira
 * sugestão forte em vez de erro.
 */
export function casarCultura(textoPlanilha: string, culturasValidas: string[]): CulturaCasada {
  const origem = String(textoPlanilha ?? '');
  const k = chave(origem);
  const vazio: CulturaCasada = { cultura: '', origem, automatico: false, opcoes: [] };
  if (!k) return vazio;

  for (const c of culturasValidas) {
    if (chave(c) === k) return { cultura: c, origem, automatico: true, opcoes: [] };
    if ((SINONIMOS_CULTURA[c] ?? []).some(s => chave(s) === k)) {
      return { cultura: c, origem, automatico: true, opcoes: [] };
    }
  }

  const alvo = na(origem);
  const contem = culturasValidas.filter(c =>
    [c, ...(SINONIMOS_CULTURA[c] ?? [])].some(s => na(s).length > 3 && alvo.includes(na(s))));
  if (contem.length === 1) return { cultura: contem[0], origem, automatico: false, opcoes: contem };

  const pontuadas = culturasValidas
    .map(c => ({ c, s: Math.max(...[c, ...(SINONIMOS_CULTURA[c] ?? [])].map(x => similaridade(k, chave(x)))) }))
    .filter(x => x.s >= PISO_CULTURA_SUGESTAO)
    .sort((a, b) => b.s - a.s);

  return { ...vazio, opcoes: [...new Set([...contem, ...pontuadas.map(x => x.c)])].slice(0, 4) };
}
