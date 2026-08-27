// JANELA DO BOOT × GRAVAÇÃO LOCAL. Módulo PURO — npm run teste:janela.
//
// O BUG QUE ORIGINOU ESTE MÓDULO (18/08/2026): reordenar os elementos no Perfil
// (Biblioteca → Perfis → setinhas) "não persistia". A gravação local estava
// certa: quem desfazia era o BOOT da nuvem terminando DEPOIS.
//
// O boot tira um retrato da nuvem (2 idas de rede, paginadas) e só então grava
// o localStorage. Quem edita NESSE intervalo tem a edição sobrescrita pelo
// retrato — que foi tirado antes dela existir. As duas defesas que havia não
// pegavam este caso:
//   · boot COMPLETO: respeita a chave "suja" (push pendente) na hora de gravar
//     — mas o push da edição costuma CONFIRMAR antes do boot terminar, e aí a
//     chave já está limpa e o retrato velho passa por cima;
//   · boot INCREMENTAL: checa "sem pendências" ANTES da rede e não checa mais
//     nada depois — o delta é aplicado por cima de qualquer edição.
//
// Pior: a coleção só entra no delta do próximo boot quando ALGUÉM a alterou —
// e quem alterou foi o próprio usuário na sessão anterior. Por isso o problema
// se repetia sessão após sessão, sempre devolvendo a ordem da vez passada.
//
// A regra aqui é uma linha: se a chave foi gravada localmente DEPOIS que o boot
// começou, o local vence e o retrato da nuvem não a toca.

export type RegistroGravacoes = Record<string, number>;

/** Anota que `key` acabou de ser gravada localmente. */
export function marcarGravacaoLocal(reg: RegistroGravacoes, key: string, agoraMs: number): void {
  reg[key] = agoraMs;
}

/**
 * A chave foi gravada localmente depois de `inicioMs` (= início do boot)?
 *
 * Empate conta como SIM: no mesmo milissegundo não dá para saber a ordem, e
 * errar para o lado do local só mantém um dado que já está na nuvem (o push
 * roda junto) — errar para o outro lado apaga a edição do usuário.
 */
export function editadaDuranteBoot(reg: RegistroGravacoes, key: string, inicioMs: number): boolean {
  const t = reg[key];
  return t !== undefined && t >= inicioMs;
}

/**
 * Junta o registro EM MEMÓRIA (desta aba) com o PERSISTIDO (qualquer aba, e
 * sessões anteriores), ficando com a gravação mais recente de cada chave.
 *
 * Por que precisa: a memória é por aba. Com a plataforma e a coleta abertas — ou
 * duas abas da plataforma —, a aba A edita e o push confirma (limpando a
 * pendência); a aba B, que estava bootando, não vê nem a pendência nem a
 * gravação, e grava o retrato antigo por cima. Era o mesmo bug de 18/08 por uma
 * porta que a correção não cobria.
 */
export function mesclarGravacoes(
  memoria: RegistroGravacoes, persistido: RegistroGravacoes,
): RegistroGravacoes {
  const out: RegistroGravacoes = { ...persistido };
  for (const [k, t] of Object.entries(memoria)) {
    if (out[k] === undefined || t > out[k]) out[k] = t;
  }
  return out;
}

/** Todas as chaves de `keys` editadas durante o boot (para re-enviar no fim). */
export function chavesEditadasDuranteBoot(
  reg: RegistroGravacoes, keys: string[], inicioMs: number,
): string[] {
  return keys.filter(k => editadaDuranteBoot(reg, k, inicioMs));
}
