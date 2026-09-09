// Regras PURAS do convite — sem localStorage, nuvem ou sessão, para poderem ser
// testadas de verdade (scripts/teste-convite-regras.mjs).
//
// O que está aqui decide quem entra na plataforma, então merece teste: um convite
// MULTIUSO (link por tipo, mandado num grupo) não pode se esgotar no primeiro
// cadastro — e um convite individual não pode continuar valendo depois de usado.
// Trocar essas duas coisas de lugar seria, respectivamente, um link que ninguém
// consegue usar e um link que qualquer um reaproveita.

import type { CategoriaIam, Convite, PapelIam, StatusConvite } from './tipos';

// Pendente que passou da validade vira expirado na LEITURA (não precisa de job).
export function statusAoVivo(c: Convite, agoraMs = Date.now()): StatusConvite {
  if (c.status === 'pendente' && Date.parse(c.expiraEm) < agoraMs) return 'expirado';
  return c.status;
}

export function podeUsar(c: Convite, agoraMs = Date.now()): boolean {
  return statusAoVivo(c, agoraMs) === 'pendente';
}

// ACESSO que a aprovação deve aplicar (produtores/fazendas escolhidos na hora
// de criar o convite). O cadastro normalmente já chega com os vínculos — a
// página do convite os copia —, mas quando a máquina de quem se cadastrou não
// tinha a lista de convites sincronizada eles se perdem; nesse caso vale o que
// está no convite de origem. Lista vazia = SEM restrição: quem aprova não pode
// acabar gravando "[]" por cima de um vínculo que já existia.
export function acessoDoConvite(
  cadastro?: { clientesVinculados?: string[]; fazendasVinculadas?: string[] } | null,
  convite?: Convite | null,
): { clientesVinculados: string[]; fazendasVinculadas: string[] } {
  const escolher = (a?: string[], b?: string[]) => (a?.length ? a : b?.length ? b : []);
  return {
    clientesVinculados: escolher(cadastro?.clientesVinculados, convite?.clientesVinculados),
    fazendasVinculadas: escolher(cadastro?.fazendasVinculadas, convite?.fazendasVinculadas),
  };
}

// ── LIBERAÇÃO AUTOMÁTICA ────────────────────────────────────────────────────
// O que o convite JÁ decidiu, para ser aplicado sem passar por aprovação.
//
// POR QUE EXISTE: o convite sai do administrador com categoria, papel, perfil e
// vínculos escolhidos. Perguntar de novo "aprovar como?" é pedir a MESMA decisão
// duas vezes — e, na prática, deixava gente presa na fila por dias. Quem entrou
// por um link que este administrador criou entra liberado; ponto.
//
// `null` = NÃO libere sozinho (o chamador mantém a fila de aprovação):
//   · sem convite conhecido — não dá para saber o que conceder;
//   · convite CANCELADO — o administrador derrubou o link de propósito;
//   · papel privilegiado ('owner') — promoção dessas nunca é automática.
//
// 'usado' e 'expirado' NÃO barram: o convite individual vira 'usado' no próprio
// cadastro que estamos liberando, e a fila antiga é varrida depois da validade
// vencer. O que importa é que o link existiu, era deste administrador e já dizia
// o acesso — não o relógio.
export interface LiberacaoConvite {
  papel: PapelIam;
  categoria?: CategoriaIam;      // ausente = deixa o chamador derivar do papel
  perfilId?: string;             // perfil de permissões definido no link
  clientesVinculados: string[];  // vazio = sem restrição (não sobrescrever)
  fazendasVinculadas: string[];
}

export function liberacaoDoConvite(
  cadastro?: {
    papel?: PapelIam; papelSugerido?: PapelIam; categoria?: CategoriaIam;
    perfilSugeridoId?: string;
    clientesVinculados?: string[]; fazendasVinculadas?: string[];
  } | null,
  convite?: Convite | null,
  agoraMs = Date.now(),
): LiberacaoConvite | null {
  if (!convite) return null;
  if (statusAoVivo(convite, agoraMs) === 'cancelado') return null;
  // O papel do CONVITE manda: o cadastro que caiu na fila foi gravado com
  // 'leitor' provisório (a tela do convite não sabia o que conceder), e usar o
  // do cadastro daria acesso menor do que o link prometia.
  const papel = convite.papel ?? cadastro?.papelSugerido ?? cadastro?.papel ?? 'leitor';
  if (papel === 'owner') return null;
  return {
    papel,
    // Mesma ordem: 'interno' no cadastro é o valor provisório do fallback, não
    // uma escolha — o convite é quem sabe se a pessoa é produtor ou consultor.
    categoria: convite.categoria ?? cadastro?.categoria,
    perfilId: convite.perfilId ?? cadastro?.perfilSugeridoId,
    ...acessoDoConvite(cadastro, convite),
  };
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
