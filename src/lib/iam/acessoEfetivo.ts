// Qual STATUS de acesso vale na hora de deixar (ou não) a pessoa entrar.
//
// O BUG QUE ORIGINOU ESTE MÓDULO (21/08/2026): produtor aprovado — ATIVO na
// Central de Acessos, no aparelho do administrador — continuava vendo
// "Cadastro aguardando aprovação" no celular dele, indefinidamente. Aprovar de
// novo não mudava nada e "Tentar de novo" só relia a mesma resposta.
//
// A assimetria que causa isso: quem se cadastra grava "aguardando aprovação" no
// PRÓPRIO aparelho; quem aprova escreve no aparelho DELE. Se a cópia local do
// cadastrado vencer o merge do boot — o que acontece enquanto 'inv_papeis'
// estiver pendente de envio, porque aí o boot mescla com o local por cima —,
// o aparelho dele fica repetindo para sempre um estado que a nuvem já mudou.
//
// Regra: no acesso da PRÓPRIA pessoa a nuvem é a autoridade. O local só decide
// quando não há resposta da nuvem (offline, primeira abertura).

export const STATUS_QUE_ENTRA = 'ativo';

/** Status que vale: o da nuvem quando existe; senão o local. */
export function statusEfetivo(local?: string, nuvem?: string): string | undefined {
  return nuvem ?? local;
}

/** Sem status (registro antigo) = ativo — é a regra que já valia no app. */
export function podeEntrar(status?: string): boolean {
  return !status || status === STATUS_QUE_ENTRA;
}

/**
 * Vale a pena perguntar à nuvem? Só quando o local barraria a entrada — não se
 * gasta uma ida de rede em quem já está liberado.
 */
export function precisaConfirmarNaNuvem(statusLocal?: string): boolean {
  return !podeEntrar(statusLocal);
}
