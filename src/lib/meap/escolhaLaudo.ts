// Qual LAUDO alimenta as camadas de fertilidade das Zonas de Manejo.
//
// Até aqui a regra era uma linha em `carregarCamadas`: `getImportacoesLab(id)[0]`
// — o laudo mais recente por `criadoEm`, e ponto. Bastava existir um laudo mais
// novo ainda SEM mapa interpolado (um laudo de outro ano recém-importado, por
// exemplo) para a fertilidade inteira sumir da lista de camadas: os mapas
// continuavam salvos na nuvem, mas o zoneamento olhava para a gaveta errada e
// só sobravam EC, NDVI e relevo. O usuário via "Camadas a usar (0/1)".
//
// A regra agora tem duas partes, e só a primeira é testável sem nuvem:
//   (1) ORDEM de tentativa — esta função;
//   (2) parar no primeiro laudo que devolve mapa — `carregarCamadas`.
//
// Módulo separado de propósito: `gerar.ts` arrasta cloud/store e não carrega em
// Node, então a ordem ficaria sem teste. Coberto por `npm run teste:laudo-zonas`.

/** Só o que a ordenação precisa saber de um laudo. */
export interface LaudoCandidato { id: string }

/**
 * Ordem em que os laudos são tentados:
 *   1º os do ANO selecionado na tela (mais recente primeiro);
 *   2º os demais, na ordem em que o store já entrega (mais recente primeiro).
 *
 * Preferir o ano selecionado é o que faz a tela responder ao seletor de Ano; a
 * segunda fila é o que impede a fertilidade de sumir quando o ano escolhido
 * ainda não tem laudo processado — o zoneamento cai no laudo anterior em vez de
 * mostrar zero camadas.
 *
 * `max` limita as tentativas porque cada uma é uma consulta de prefixo na nuvem.
 */
export function ordemLaudosParaZonas<T extends LaudoCandidato>(
  todos: T[], doAno: T[], max: number,
): T[] {
  const idsAno = new Set(doAno.map(i => i.id));
  return [...doAno, ...todos.filter(i => !idsAno.has(i.id))].slice(0, max);
}

/** Quantos laudos o zoneamento tenta antes de desistir da fertilidade. */
export const MAX_LAUDOS_TENTADOS = 6;
