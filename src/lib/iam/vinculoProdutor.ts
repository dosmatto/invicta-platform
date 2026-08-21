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
// Aqui os dois viram UMA pergunta só, com o antigo tendo preferência (é o que
// alguém escolheu explicitamente no seletor de um cliente só).

export interface RegistroComVinculo {
  clienteId?: string;
  clientesVinculados?: string[];
}

/** Todos os produtores que este usuário pode ver. Vazio = nenhum vínculo. */
export function clientesDoProdutor(reg: RegistroComVinculo | null | undefined): string[] {
  if (!reg) return [];
  if (reg.clienteId) return [reg.clienteId];
  return (reg.clientesVinculados ?? []).filter(Boolean);
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
