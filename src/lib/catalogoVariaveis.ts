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
