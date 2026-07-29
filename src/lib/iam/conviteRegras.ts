// Regras PURAS do convite — sem localStorage, nuvem ou sessão, para poderem ser
// testadas de verdade (scripts/teste-convite-regras.mjs).
//
// O que está aqui decide quem entra na plataforma, então merece teste: um convite
// MULTIUSO (link por tipo, mandado num grupo) não pode se esgotar no primeiro
// cadastro — e um convite individual não pode continuar valendo depois de usado.
// Trocar essas duas coisas de lugar seria, respectivamente, um link que ninguém
// consegue usar e um link que qualquer um reaproveita.

import type { Convite, StatusConvite } from './tipos';

// Pendente que passou da validade vira expirado na LEITURA (não precisa de job).
export function statusAoVivo(c: Convite, agoraMs = Date.now()): StatusConvite {
  if (c.status === 'pendente' && Date.parse(c.expiraEm) < agoraMs) return 'expirado';
  return c.status;
}

export function podeUsar(c: Convite, agoraMs = Date.now()): boolean {
  return statusAoVivo(c, agoraMs) === 'pendente';
}

// Aplica UM cadastro ao convite e devolve a versão nova (não muta a entrada).
// Multiuso: conta o uso e SEGUE pendente. Individual: consome.
export function aplicarUso(c: Convite, email: string, agoraIso: string): Convite {
  const usadoPor = email.trim().toLowerCase();
  if (c.multiuso) {
    return { ...c, usos: (c.usos ?? 0) + 1, usadoEm: agoraIso, usadoPor };
  }
  return { ...c, status: 'usado', usadoEm: agoraIso, usadoPor };
}
