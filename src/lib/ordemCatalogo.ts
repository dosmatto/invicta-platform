// ORDEM do catálogo de variáveis (as setinhas de "Legendas por elemento").
//
// Mora fora do store de propósito: store.ts arrasta cloud/supabase e não carrega
// em Node, então esta conta ficaria sem teste — e ela já errou feio uma vez.
//
// O BUG QUE ORIGINOU ESTE MÓDULO (07/08/2026): subir o pH um degrau jogava o pH
// para o TOPO. A implementação antiga PERMUTAVA os dois valores de `ordem` entre
// os vizinhos, e isso só funciona quando todo mundo tem `ordem` distinta. Com
// empate — várias variáveis na mesma `ordem`, ou o mesmo varId duplicado — quem
// decide a posição na tela é o desempate por sigla, não a `ordem`; aí o valor
// recebido na permuta levava o item para qualquer lugar da lista.
//
// A saída é não permutar valor nenhum: reordena a LISTA e renumera todo mundo
// 0..n-1. Sem empate possível, o resultado é sempre "andou exatamente um degrau".
//
// Módulo PURO. npm run teste:ordem

export interface ItemOrdenavel { id: string; usar: boolean }

/**
 * Move `id` UM degrau (entre os itens VISÍVEIS) dentro da lista completa.
 *
 * As setinhas operam sobre os itens ativos, mas os inativos continuam na lista e
 * precisam manter a posição relativa — por isso a troca acontece nos índices da
 * lista COMPLETA, pulando os inativos que estiverem no caminho.
 *
 * Devolve null quando não há para onde ir (ponta da lista ou id inexistente),
 * para o chamador não gravar nada.
 */
export function moverNaOrdem<T extends ItemOrdenavel>(todas: T[], id: string, dir: -1 | 1): T[] | null {
  const visiveis: number[] = [];
  todas.forEach((v, i) => { if (v.usar) visiveis.push(i); });
  const pos = visiveis.findIndex(i => todas[i].id === id);
  if (pos < 0) return null;
  const destino = pos + dir;
  if (destino < 0 || destino >= visiveis.length) return null;

  const out = [...todas];
  const a = visiveis[pos], b = visiveis[destino];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/**
 * Renumera 0..n-1 e devolve SÓ quem mudou de número — para não reescrever o
 * catálogo inteiro (cada gravação é um push para a nuvem e um re-render).
 */
export function renumerar<T extends { id: string; ordem: number }>(lista: T[]): Array<{ item: T; ordem: number }> {
  const mudou: Array<{ item: T; ordem: number }> = [];
  lista.forEach((item, i) => { if (item.ordem !== i) mudou.push({ item, ordem: i }); });
  return mudou;
}
