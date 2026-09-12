// INTERPRETAÇÃO — de índice para decisão agronômica.
//
// O índice DRIS sozinho não diz nada ao agrônomo: −8,3 é muito ou pouco?
// Depende de quão desequilibrada a planta está como um todo. Wadt (1996)
// resolve isso comparando |índice| com o IBNm (IBN médio) da PRÓPRIA amostra —
// a régua é interna, não uma constante universal.
//
// REGRA DAS CLASSES DE POTENCIAL DE RESPOSTA À ADUBAÇÃO (PRA), implementada em
// `classeWadt` exatamente nesta ordem:
//
//   z   — |índice| ≤ LIMIAR_ZERO ................ equilibrado, resposta nula
//   p   — índice < 0 e |índice| >  IBNm ......... deficiente, alta chance de resposta positiva
//   pz  — índice < 0 e |índice| ≤  IBNm ......... tendência à deficiência, resposta pouco provável
//   zp  — índice > 0 e  índice  ≤  IBNm ......... tendência ao excesso, resposta negativa pouco provável
//   e   — índice > 0 e  índice  >  IBNm ......... excesso, alta chance de resposta negativa
//
// POR QUE O 'z' VEM PRIMEIRO: quando a amostra é idêntica à média da norma,
// todos os índices e o IBNm são zero, e as comparações "> IBNm" ficariam
// ambíguas (0 > 0 é falso, mas 0 < 0 também). O teste de zero à frente resolve
// e é o que faz o teste-ouro devolver 'z' para os 11 nutrientes (ledger 16).
//
// POR QUE 'pz'/'zp' VIRAM 'adequado' NO CONSENSO: a leitura de Wadt é que só
// 'p' e 'e' indicam potencial REAL de resposta; as intermediárias são ruído de
// equilíbrio. Colapsar 'pz' em "deficiente" faria o DRIS discordar da faixa de
// suficiência em quase toda amostra e destruiria o valor do consenso.
//
// Fontes: Wadt, P.G.S. (1996); aplicações em cupuaçu e eucalipto citadas em
// `.workflow/scratch/dris-ciencia.md` §5.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import {
  type ClassePRA, type ConsensoNutriente, type EstadoNutricional,
  type MetodoDiagnose, NUTRIENTES, type NutrienteId,
} from './tipos.ts';

/**
 * Abaixo disto o índice é "zero" para efeito de classe. Absoluto e minúsculo
 * de propósito: serve para absorver erro de ponto flutuante (1e-15 vindo de
 * somas de razões), não para criar uma zona morta agronômica — quem quer zona
 * morta usa a função de Elwali & Gascho em `dris.ts`.
 */
export const LIMIAR_ZERO = 1e-6;

export function classeWadt(indice: number, ibnm: number): ClassePRA {
  if (!Number.isFinite(indice)) return 'z';
  const abs = Math.abs(indice);
  if (abs <= LIMIAR_ZERO) return 'z';
  const regua = Number.isFinite(ibnm) ? Math.abs(ibnm) : 0;
  if (indice < 0) return abs > regua ? 'p' : 'pz';
  return abs > regua ? 'e' : 'zp';
}

/** Colapsa a classe de Wadt na linguagem comum dos quatro métodos. */
export function estadoDaClasse(classe: ClassePRA): EstadoNutricional {
  if (classe === 'p') return 'deficiente';
  if (classe === 'e') return 'excessivo';
  return 'adequado';
}

/**
 * Ordem de limitação: do índice MAIS NEGATIVO (mais limitante) ao mais
 * positivo. Empate desempata pela ordem canônica dos nutrientes para que duas
 * execuções da mesma amostra nunca troquem as posições de lugar.
 */
export function ordenarPorLimitacao<T extends { nutriente: NutrienteId; indice: number }>(itens: T[]): T[] {
  return [...itens].sort((x, y) =>
    x.indice - y.indice || NUTRIENTES.indexOf(x.nutriente) - NUTRIENTES.indexOf(y.nutriente));
}

// ── Consenso multi-método ───────────────────────────────────────────────────

/** O que cada método concluiu, por nutriente. Método ausente simplesmente não vota. */
export type VotosPorMetodo = Partial<Record<MetodoDiagnose, Partial<Record<NutrienteId, EstadoNutricional>>>>;

const ORDEM_METODOS: MetodoDiagnose[] = ['dris', 'cnd', 'faixa', 'chance'];

/**
 * Onde os métodos concordam e onde divergem, nutriente a nutriente.
 *
 * `concordancia` = nº de votos iguais à maioria ÷ nº de métodos que votaram.
 * Com 4 métodos concordando dá 1; com 3×1 dá 0,75; com 2×2 há EMPATE e o
 * consenso é `null` — inventar um vencedor no empate seria dar ao agrônomo uma
 * certeza que os dados não têm, que é exatamente o que este módulo existe para
 * evitar. No empate, `divergentes` traz todos os métodos, porque nenhum pode
 * ser tratado como referência.
 *
 * Um nutriente sem voto nenhum devolve concordancia 0 e consenso null — e
 * continua na lista, porque sumir da tela esconde o buraco (regra 2 do módulo
 * de validação, replicada aqui).
 */
export function consensoMultiMetodo(votos: VotosPorMetodo, nutrientes: readonly NutrienteId[] = NUTRIENTES): ConsensoNutriente[] {
  return nutrientes.map(nutriente => {
    const porMetodo: Partial<Record<MetodoDiagnose, EstadoNutricional>> = {};
    for (const m of ORDEM_METODOS) {
      const v = votos[m]?.[nutriente];
      if (v) porMetodo[m] = v;
    }
    const metodos = ORDEM_METODOS.filter(m => porMetodo[m] != null);
    const nMetodos = metodos.length;
    if (!nMetodos) {
      return { nutriente, porMetodo, consenso: null, concordancia: 0, divergentes: [], nMetodos: 0 };
    }

    const contagem = new Map<EstadoNutricional, number>();
    for (const m of metodos) {
      const e = porMetodo[m] as EstadoNutricional;
      contagem.set(e, (contagem.get(e) ?? 0) + 1);
    }
    const maxVotos = Math.max(...contagem.values());
    const lideres = [...contagem.entries()].filter(([, c]) => c === maxVotos).map(([e]) => e);
    const empate = lideres.length > 1;
    const consenso = empate ? null : lideres[0];

    const divergentes = empate ? metodos : metodos.filter(m => porMetodo[m] !== consenso);
    return {
      nutriente,
      porMetodo,
      consenso,
      concordancia: maxVotos / nMetodos,
      divergentes,
      nMetodos,
    };
  });
}
