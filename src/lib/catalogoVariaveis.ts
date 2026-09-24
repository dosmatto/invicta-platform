// Quando é SEGURO semear/migrar o catálogo de variáveis (chave de Biblioteca
// `inv_bib_preferencias-analise`). Módulo PURO — npm run teste:catalogo.
//
// O BUG QUE ORIGINOU ESTE MÓDULO (27/08/2026): a ordem dos elementos no Perfil e
// a tela "Preferências de Análise" mudavam sozinhas, esporadicamente.
//
// A raiz é uma diferença sutil para as LEGENDAS, que já passaram por isto (ver
// deveSemearLegendas em lib/legendas.ts):
//   · legenda tem id FIXO — semear na hora errada SOBRESCREVE uma linha;
//   · variável tem id ALEATÓRIO (bibCriar) e o identificador de verdade (varId)
//     mora DENTRO do conteúdo — semear na hora errada CRIA UMA SEGUNDA LINHA
//     com o mesmo varId. É uma fábrica de gêmeas.
//
// E gêmea aqui não é só lixo: a leitura deduplica por varId ficando com a de
// MENOR `ordem` e, no empate, com a que estiver primeiro no array — que muda de
// um boot para o outro (mesclar por id × delta incremental montam o array em
// ordens diferentes). Daí a lista trocar de ordem "sozinha", item a item.
//
// A regra: catálogo vazio só autoriza semear quando a nuvem JÁ RESPONDEU. Antes
// disso, vazio quer dizer "ainda não sei", não "não existe".

/** Semear o catálogo básico agora? */
export function deveSemearCatalogo(qtdLocal: number, nuvemAindaNaoHidratou: boolean): boolean {
  return qtdLocal === 0 && !nuvemAindaNaoHidratou;
}

/**
 * Rodar uma migração que REESCREVE o catálogo (ex.: a ordem padrão)?
 *
 * Precisa de catálogo MATERIALIZADO — não vale o seed em memória que a leitura
 * devolve quando não há nada gravado. A guarda antiga perguntava isso a uma
 * função com fallback embutido, então nunca era falsa: a migração rodava contra
 * o seed em memória, gravava a ordem de fábrica e queimava a flag para sempre.
 */
export function podeMigrarCatalogo(qtdMaterializada: number, nuvemAindaNaoHidratou: boolean): boolean {
  return qtdMaterializada > 0 && !nuvemAindaNaoHidratou;
}

/**
 * Gêmeas a apagar: para cada varId repetido, sobra UMA linha e as outras vão
 * embora. Fica a EDITADA POR ÚLTIMO (atualizadoEm) — é a que carrega o ajuste
 * mais recente do usuário; empate desempata por id, para dois aparelhos
 * chegarem ao mesmo resultado sem combinar nada.
 *
 * Devolve os ids a excluir (nunca o vencedor), vazio quando não há duplicata.
 */
export function gemeasAExcluir<T extends { id: string; varId: string; atualizadoEm?: string }>(
  itens: T[],
): string[] {
  const porVar = new Map<string, T[]>();
  for (const it of itens) {
    if (!porVar.has(it.varId)) porVar.set(it.varId, []);
    porVar.get(it.varId)!.push(it);
  }
  const fora: string[] = [];
  for (const grupo of porVar.values()) {
    if (grupo.length < 2) continue;
    const vencedor = [...grupo].sort((a, b) =>
      (b.atualizadoEm ?? '').localeCompare(a.atualizadoEm ?? '') || a.id.localeCompare(b.id))[0];
    for (const it of grupo) if (it.id !== vencedor.id) fora.push(it.id);
  }
  return fora;
}

// ── Cura do SEED ANTIGO ──────────────────────────────────────────────────────

/**
 * Ordem PADRÃO dos elementos de fertilidade (pedido do usuário 23/07/2026) — vira
 * a ordem do catálogo, que comanda o Perfil e o relatório. As demais variáveis
 * (micros extras, variantes, relações…) entram depois, preservando a ordem
 * relativa. Mora aqui (módulo puro) para o seed de store.ts, a cura e o teste
 * usarem a mesma lista.
 */
export const ORDEM_PADRAO_FERT: readonly string[] = [
  'mo', 'ph', 'm', 'v', 'ctc', 'p', 'k', 'satk', 'ca', 'mg', 'satca', 'satmg', 't',
  's', 'b', 'zn', 'cu', 'mn', 'fe', 'al', 'textura',
];

/**
 * Ordem com que uma variável NASCE numa conta nova: a posição dela na
 * ORDEM_PADRAO_FERT; fora da lista, depois das 21, na posição `i` de fallback.
 * Antes o seed nascia na ordem de ELEMENTOS_LAB (pH, P, K…) e dependia de
 * migrarOrdemPadraoFertV1 para virar a ordem padrão — migração com flag por
 * navegador, removida na v2.175.0 porque desfazia as setas do usuário.
 */
export function ordemDeFabrica(varId: string, i: number): number {
  const p = ORDEM_PADRAO_FERT.indexOf(varId);
  return p >= 0 ? p : ORDEM_PADRAO_FERT.length + i;
}

/** Micronutrientes que o padrão exibe com 2 casas (pendência 43, 14/09/2026). */
export const MICROS_DUAS_CASAS: readonly string[] = ['b', 's', 'zn', 'cu', 'mn', 'fe'];

/** Casas decimais com que uma variável NASCE numa conta nova (undefined = automático). */
export function casasDeFabrica(varId: string): number | undefined {
  return MICROS_DUAS_CASAS.includes(varId) ? 2 : undefined;
}

/** Sinônimos do Fe como elemento BASE (ver ELEMENTOS_LAB em lib/laudo/nucleo.ts). */
const SINONIMOS_FE: readonly string[] = ['fe', 'ferro'];

/** Variável como está gravada no catálogo (uma linha da Biblioteca). */
export interface VariavelMaterializada {
  id: string;              // id da LINHA na Biblioteca (aleatório)
  varId: string;           // chave da variável (ph, p, fe…)
  sigla?: string;
  usar?: boolean;          // undefined = ligada (como a leitura interpreta)
  ordem?: number;
  sinonimos?: string[];
  casasDecimais?: number;
}

/** Correção de UMA linha: só vem o campo que muda. */
export interface CuraVariavel {
  id: string;
  varId: string;
  usar?: true;
  sinonimos?: string[];
  ordem?: number;
  casasDecimais?: number;
}

// Comparação EXATA, como o casamento com o cabeçalho do laudo (casaCabecalho em
// lib/lab.ts compara o cabeçalho normalizado com o sinônimo tal como gravado):
// " FE " gravado não casa com a coluna "Fe", então não conta como presente.
const temSinonimoFe = (s: string[] | undefined) => (s ?? []).includes('fe');

/**
 * O catálogo tem a ASSINATURA do seed de um app de campo anterior à v2.78.0
 * (27/08/2026)? Nesse seed o Fe ainda era variável COMPLEMENTAR: nascia
 * desligado, só com o sinônimo 'ferro' e com ordem ≥ 100 (depois de todo o
 * básico), e a ordem dos básicos era a de fábrica antiga (ph = 0, p = 1…).
 *
 * Duas marcas, qualquer uma basta:
 *   A. Fe desligado E sem 'fe' nos sinônimos — o Fe base nunca nasce assim, e
 *      a migração da v2.78.0 dá os dois consertos juntos;
 *   B. Fe com ordem ≥ 100 enquanto pH, P e K estão todos abaixo de 20 — a
 *      ordem padrão põe o Fe na 19ª posição, e ninguém arrasta o Fe para depois
 *      de 100 com as setas (elas renumeram 0..n-1).
 */
export function temAssinaturaSeedAntigo(itens: VariavelMaterializada[]): boolean {
  const fes = itens.filter(i => i.varId === 'fe');
  if (fes.length === 0) return false;
  const marcaA = fes.some(f => f.usar === false && !temSinonimoFe(f.sinonimos));
  const menorOrdem = (varId: string) => {
    const os = itens.filter(i => i.varId === varId && typeof i.ordem === 'number').map(i => i.ordem as number);
    return os.length ? Math.min(...os) : undefined;
  };
  const baixo = (varId: string) => { const o = menorOrdem(varId); return o != null && o < 20; };
  const marcaB = fes.some(f => (f.ordem ?? -1) >= 100) && baixo('ph') && baixo('p') && baixo('k');
  return marcaA || marcaB;
}

/**
 * Correções para um catálogo recriado por um app de campo antigo — ou lista
 * VAZIA quando o catálogo está saudável (o caso de todo boot normal).
 *
 * Com a assinatura (ver temAssinaturaSeedAntigo):
 *   · Fe ligado e sinônimos ∪ ['fe', 'ferro'];
 *   · 2 casas decimais em B, S, Zn, Cu, Mn e Fe — SÓ onde não há valor
 *     (casasDecimais definida é escolha do usuário e fica);
 *   · ordem = ORDEM_PADRAO_FERT; as demais depois das 21, mantendo a ordem
 *     relativa (desempate por sigla) — como a antiga migrarOrdemPadraoFertV1.
 *
 * Sem a assinatura, a única coisa que se corrige é o sinônimo 'fe' faltando no
 * Fe (união, nunca remove): sem ele uma coluna "Fe" do laudo não casa com a
 * variável. Ligado/desligado, ordem e casas decimais ficam como o usuário deixou.
 *
 * Correções vêm POR LINHA: se houver gêmeas do mesmo varId, cada uma recebe a
 * sua (a leitura pode escolher qualquer uma delas).
 */
export function curaSeedAntigo(itens: VariavelMaterializada[]): CuraVariavel[] {
  if (itens.length === 0) return [];
  const seedAntigo = temAssinaturaSeedAntigo(itens);

  // Ordem-alvo por varId (só com a assinatura).
  const ordemAlvo = new Map<string, number>();
  if (seedAntigo) {
    ORDEM_PADRAO_FERT.forEach((varId, i) => ordemAlvo.set(varId, i));
    const resto = new Map<string, { ordem: number; sigla: string }>();
    for (const it of itens) {
      if (ordemAlvo.has(it.varId)) continue;
      const o = it.ordem ?? 999;
      const atual = resto.get(it.varId);
      if (!atual || o < atual.ordem) resto.set(it.varId, { ordem: o, sigla: it.sigla ?? it.varId });
    }
    [...resto.entries()]
      .sort((a, b) => a[1].ordem - b[1].ordem || a[1].sigla.localeCompare(b[1].sigla))
      .forEach(([varId], i) => ordemAlvo.set(varId, ORDEM_PADRAO_FERT.length + i));
  }

  const curas: CuraVariavel[] = [];
  for (const it of itens) {
    const c: CuraVariavel = { id: it.id, varId: it.varId };
    let mudou = false;
    if (it.varId === 'fe') {
      if (seedAntigo && it.usar === false) { c.usar = true; mudou = true; }
      const atuais = it.sinonimos ?? [];
      const faltando = SINONIMOS_FE.filter(s => !atuais.includes(s));
      if (faltando.length) { c.sinonimos = [...atuais, ...faltando]; mudou = true; }
    }
    if (seedAntigo) {
      const cf = casasDeFabrica(it.varId);
      if (cf != null && it.casasDecimais == null) { c.casasDecimais = cf; mudou = true; }
      const alvo = ordemAlvo.get(it.varId);
      if (alvo != null && it.ordem !== alvo) { c.ordem = alvo; mudou = true; }
    }
    if (mudou) curas.push(c);
  }
  return curas;
}
