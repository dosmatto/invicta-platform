// Qual PRODUTOR (cliente) um usuário de papel `produtor` enxerga.
//
// O BUG QUE ORIGINOU ESTE MÓDULO (21/08/2026): produtor recém-aprovado, ATIVO,
// com "1 prod · 1 faz" no cartão da Central de Acessos, entrava e batia em
// "Acesso ainda não vinculado — peça ao escritório para vincular". Para ele,
// era "não tenho permissão".
//
// A causa é o vínculo morar em DOIS campos que não conversavam:
//   · `clienteId` — o campo ANTIGO, de um cliente só. É o que o Portal do
//     Produtor e o escopo de leitura liam, e ele só é preenchido num lugar:
//     Acessos → abrir o usuário → aba Dados → "Produtor (cliente)".
//   · `clientesVinculados` — o campo do IAM, preenchido na aba Vínculos, no
//     convite (o acesso definido antes de aprovar) e na própria aprovação.
//     É o que o cartão conta em "1 prod".
//
// Ou seja: o administrador via o vínculo na tela, o produtor não tinha nenhum.
// Aqui os dois viram UMA pergunta só: o antigo vai na frente (é o principal —
// saudação e cabeçalho do Portal) e os demais vínculos do IAM continuam valendo.

export interface RegistroComVinculo {
  clienteId?: string;
  clientesVinculados?: string[];
}

/** Todos os produtores que este usuário pode ver. Vazio = nenhum vínculo. */
export function clientesDoProdutor(reg: RegistroComVinculo | null | undefined): string[] {
  if (!reg) return [];
  // Até 03/09/2026 o antigo DERRUBAVA a lista: produtor com dois vínculos (a
  // própria fazenda e um condomínio) só via o primeiro, porque a aprovação
  // grava clienteId = clientesVinculados[0] (iam/usuarios.ts).
  const todos = [reg.clienteId ?? '', ...(reg.clientesVinculados ?? [])].filter(Boolean);
  return [...new Set(todos)];
}

/** O produtor PRINCIPAL (o Portal mostra um: saudação, nome no cabeçalho). */
export function clienteIdDoProdutor(reg: RegistroComVinculo | null | undefined): string | null {
  return clientesDoProdutor(reg)[0] ?? null;
}

/** Produtor aprovado que não consegue entrar: papel produtor e nenhum vínculo. */
export function produtorSemVinculo(
  papel: string | undefined, reg: RegistroComVinculo | null | undefined,
): boolean {
  return papel === 'produtor' && clientesDoProdutor(reg).length === 0;
}
