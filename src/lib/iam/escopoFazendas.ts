// IAM — qual FAZENDA um usuário de escopo restrito enxerga. Lógica pura (sem
// store) para `npm run teste:iam` cobrir; store.ts aplica em getClientes /
// getFazendas / getTalhoes.
//
// O CASO QUE ORIGINOU ESTE MÓDULO (03/09/2026): produtor com a própria fazenda
// e mais uma que NÃO está no nome dele (condomínio). O administrador marcou a
// segunda na aba Vínculos e o Portal mostrava só a primeira. Duas causas:
//   · o vínculo por fazenda era um FILTRO dentro dos produtores vinculados —
//     fazenda de outro cadastro caía fora antes de ser considerada;
//   · o campo antigo `clienteId` derrubava a lista `clientesVinculados` para
//     um produtor só (ver vinculoProdutor.ts).
//
// Regra, em uma frase: marcar nunca REDUZ o que foi marcado.
//   1. Fazenda marcada em `fazendasVinculadas` entra sempre, mesmo que o
//      cadastro dela seja de outro produtor.
//   2. Produtor vinculado com alguma fazenda dele marcada: só as marcadas.
//   3. Produtor vinculado sem fazenda dele marcada: todas as dele.
//   4. Sem produtor vinculado (escopo de cliente aberto) e com fazendas
//      marcadas: só as marcadas — como antes.
// `esc`/`escF` = null significa "sem restrição" (owner/admin/editor).

export interface FazendaEscopo { id: string; clienteId: string }

/** Produtores que têm alguma fazenda marcada explicitamente. */
export function clientesComFazendaMarcada(fazendas: FazendaEscopo[], escF: Set<string> | null): Set<string> {
  const s = new Set<string>();
  if (!escF) return s;
  for (const f of fazendas) if (escF.has(f.id)) s.add(f.clienteId);
  return s;
}

export function fazendaVisivel(
  f: FazendaEscopo, esc: Set<string> | null, escF: Set<string> | null, marcados: Set<string>,
): boolean {
  if (escF?.has(f.id)) return true;                                 // 1
  if (escF && (!esc || marcados.has(f.clienteId))) return false;    // 2 e 4
  return !esc || esc.has(f.clienteId);                              // 3 (ou sem restrição)
}

/** As fazendas visíveis, na ordem em que vieram. */
export function fazendasVisiveis<T extends FazendaEscopo>(fazendas: T[], esc: Set<string> | null, escF: Set<string> | null): T[] {
  if (!esc && !escF) return fazendas;
  const marcados = clientesComFazendaMarcada(fazendas, escF);
  return fazendas.filter(f => fazendaVisivel(f, esc, escF, marcados));
}
