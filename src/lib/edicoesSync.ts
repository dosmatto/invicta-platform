// Edições POR REGISTRO no sincronismo com a nuvem — a parte pura (sem
// browser/DOM) de lib/supabaseData.ts. Roda: npm run teste:edicoes.
//
// O BUG (31/10/2026, 1102 talhões regravados num envio só): a pendência de
// envio era por CHAVE ("inv_talhoes mudou"), não por registro. Isso obrigava a
// tratar a lista local INTEIRA como verdade:
//   · 1º envio da sessão sem espelho (boot que estourou os 12s do AppContext,
//     ou que falhou): subiam TODOS os registros locais;
//   · boot com pendência: a junção dava vitória ao local em TODOS os ids.
// Com a cópia local anterior à edição de outra pessoa/aparelho, aquela edição
// era desfeita na nuvem — o limite antigo do talhão "voltava".
//
// Agora cada gravação anota QUAIS ids mudaram em relação à última lista que o
// aparelho conhecia, e envio + junção só dão vitória ao local nesses ids.

/** Ids editados de uma chave. `todos` = modo antigo: a lista local inteira vale. */
export type IdsEditados = { up: string[]; del: string[]; todos?: true };

type ComId = { id?: unknown };

/** id → JSON do registro (registros sem id ficam de fora). */
export function mapaPorId(recs: unknown[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of recs) {
    const id = (r as ComId)?.id;
    if (id != null) m.set(String(id), JSON.stringify(r));
  }
  return m;
}

/**
 * Soma ao registro `atual` os ids que mudaram de `base` para `nova`.
 * Sem base conhecida → `todos` (não dá para saber o que mudou; preserva a
 * gravação no modo antigo). Devolve `null` quando o registro não muda.
 */
export function calcularEdicoes(
  base: Map<string, string> | undefined, nova: Map<string, string>, atual: IdsEditados | null,
): IdsEditados | null {
  if (!base) return atual?.todos ? null : { up: atual?.up ?? [], del: atual?.del ?? [], todos: true };
  const up = new Set(atual?.up ?? []);
  const del = new Set(atual?.del ?? []);
  let mudou = !atual;
  for (const [id, json] of nova) {
    if (base.get(id) !== json) {
      if (!up.has(id)) { up.add(id); mudou = true; }
      if (del.delete(id)) mudou = true;
    }
  }
  for (const id of base.keys()) {
    if (!nova.has(id)) {
      if (!del.has(id)) { del.add(id); mudou = true; }
      if (up.delete(id)) mudou = true;
    }
  }
  if (!mudou) return null;
  return { up: [...up], del: [...del], ...(atual?.todos ? { todos: true as const } : {}) };
}

/**
 * Ids que valem como "do local" na junção do boot: o registro persistido
 * MAIS o que mudou entre o retrato do início do boot (`baseInicio`) e o local
 * de agora. A segunda parte cobre a edição de OUTRA aba do mesmo navegador
 * cujo envio já confirmou (e saiu do registro) enquanto este boot rodava.
 * Pendência antiga sem registro (versão anterior) entra como os ids locais que
 * a nuvem NÃO tem — lançamento offline a preservar e a subir.
 */
export function idsParaJuncao(
  reg: IdsEditados | null, baseInicio: Map<string, string> | undefined,
  local: unknown[], nuvem: unknown[],
): IdsEditados {
  if (reg?.todos) return reg;
  const somado = baseInicio ? (calcularEdicoes(baseInicio, mapaPorId(local), reg) ?? reg) : reg;
  if (somado && !somado.todos) {
    if (reg) return somado;
    // sem registro: soma também os locais que a nuvem não tem
    const naNuvem = new Set(nuvem.map(r => String((r as ComId)?.id)));
    const up = new Set(somado.up);
    for (const r of local) { const id = (r as ComId)?.id; if (id != null && !naNuvem.has(String(id))) up.add(String(id)); }
    return { up: [...up], del: somado.del };
  }
  const naNuvem = new Set(nuvem.map(r => String((r as ComId)?.id)));
  const up: string[] = [];
  for (const r of local) { const id = (r as ComId)?.id; if (id != null && !naNuvem.has(String(id))) up.push(String(id)); }
  return { up, del: [] };
}

/**
 * Depois de um envio confirmado: tira do registro SÓ os ids enviados que não
 * mudaram de novo desde então (`atual` = JSON do registro no local agora, que é
 * compartilhado entre as abas). Um envio em `todos` confirmado encerra o modo
 * antigo. Devolve `null` quando não sobra nada.
 */
export function confirmarEnvio(
  reg: IdsEditados, upEnviados: string[], delEnviados: string[],
  enviado: Map<string, string>, atual: (id: string) => string | undefined,
): IdsEditados | null {
  const up = new Set(reg.up), del = new Set(reg.del);
  for (const id of upEnviados) if (atual(id) === enviado.get(id)) up.delete(id);
  for (const id of delEnviados) if (atual(id) === undefined) del.delete(id);
  if (!up.size && !del.size) return null;
  return { up: [...up], del: [...del] };
}

/**
 * Tira do registro os ids em que o local JÁ É IGUAL à nuvem (`nuvem` = o
 * espelho ou o retrato do boot): não há edição a preservar ali. Sem isto, um id
 * que entrou no registro e nunca precisou subir (edição desfeita; registro que
 * outra aba atualizou da nuvem; diff do início do boot contra uma base de dias
 * atrás) ficaria marcado como "do local" para sempre — e, num boot futuro com a
 * nuvem já mais nova, a cópia antiga dele voltaria a vencer. `todos` não mexe.
 */
export function podarIguaisANuvem(
  reg: IdsEditados, local: (id: string) => string | undefined, nuvem: (id: string) => string | undefined,
): IdsEditados | null {
  if (reg.todos) return reg;
  const up = reg.up.filter(id => { const l = local(id); return l === undefined || l !== nuvem(id); });
  const del = reg.del.filter(id => local(id) !== undefined || nuvem(id) !== undefined);
  if (!up.length && !del.length) return null;
  return { up, del };
}

/** União por id em que o LOCAL vence em tudo (o modo antigo). */
export function mesclarPorId(nuvem: unknown[], local: unknown[]): unknown[] {
  const mapa = new Map<string, unknown>();
  const extras: unknown[] = [];
  for (const r of nuvem) {
    const id = (r as ComId)?.id;
    if (id != null) mapa.set(String(id), r); else extras.push(r);
  }
  for (const r of local) {
    const id = (r as ComId)?.id;
    if (id != null) mapa.set(String(id), r); else extras.push(r);
  }
  return [...mapa.values(), ...extras];
}

/**
 * Junção do boot para chave com pendência: a NUVEM manda, e o local só vence
 * nos ids que este aparelho editou (e some com os que ele excluiu).
 * Sem registro de ids (pendência gravada por versão anterior): o local só
 * ACRESCENTA o que a nuvem não tem — nunca sobrescreve registro existente.
 * `todos`: modo antigo, local vence em tudo (chave que a nuvem ainda não tem).
 */
export function mesclarComEdicoes(nuvem: unknown[], local: unknown[], ids: IdsEditados | null): unknown[] {
  if (ids?.todos) return mesclarPorId(nuvem, local);
  const localPorId = new Map<string, unknown>();
  const extras: unknown[] = [];
  for (const r of local) {
    const id = (r as ComId)?.id;
    if (id != null) localPorId.set(String(id), r); else extras.push(r);
  }
  const mapa = new Map<string, unknown>();
  for (const r of nuvem) {
    const id = (r as ComId)?.id;
    if (id != null) mapa.set(String(id), r); else extras.push(r);
  }
  if (ids) {
    for (const id of ids.up) { const r = localPorId.get(id); if (r !== undefined) mapa.set(id, r); }
    for (const id of ids.del) mapa.delete(id);
  } else {
    for (const [id, r] of localPorId) if (!mapa.has(id)) mapa.set(id, r);
  }
  return [...mapa.values(), ...extras];
}

/**
 * O que um envio sobe. `espelho` = o que a nuvem tem segundo este aparelho
 * (ausente = 1º envio da sessão). Por registro, só ids editados; `todos` ou sem
 * registro = modo antigo (1º envio sobe tudo; seguintes, o diff contra o espelho).
 */
export function idsDoEnvio(
  next: Map<string, string>, espelho: Map<string, string> | undefined, ids: IdsEditados | null,
): { upsert: string[]; del: string[]; porRegistro: boolean } {
  const porRegistro = !!ids && !ids.todos;
  if (!espelho) {
    if (porRegistro) {
      return {
        upsert: ids!.up.filter(id => next.has(id)),
        del: ids!.del.filter(id => !next.has(id)),
        porRegistro,
      };
    }
    return { upsert: [...next.keys()], del: [], porRegistro };
  }
  let upsert = [...next.keys()].filter(id => espelho.get(id) !== next.get(id));
  let del = [...espelho.keys()].filter(id => !next.has(id));
  if (porRegistro) {
    const up = new Set(ids!.up), dl = new Set(ids!.del);
    upsert = upsert.filter(id => up.has(id));
    del = del.filter(id => dl.has(id));
  }
  return { upsert, del, porRegistro };
}
