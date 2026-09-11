'use client';

// Quais índices de satélite viram FONTE DE ANÁLISE (S/N — pedido do usuário).
//
// Até aqui, "Manter" fazia duas coisas ao mesmo tempo: guardava a camada E a
// jogava dentro de tudo que consome NDVI — Zonas de Manejo, Comparador,
// Produtividade, diagnóstico da IA. Quem quisesse só arquivar a imagem de uma
// data não tinha como; ela entrava na clusterização junto com as boas.
//
// Agora são duas decisões separadas:
//   ★ MANTER          — guarda a camada no banco (continua igual)
//   ◎ FONTE DE ANÁLISE — esta camada pode alimentar os cálculos
//
// REGRA: sem marcação, NADA entra. Não há herança do comportamento antigo — foi
// decisão explícita, para a regra ser uma só e não depender do histórico do
// talhão. Consequência assumida: talhão que já tinha camadas mantidas deixa de
// levá-las para as análises até alguém marcar.
//
// A marcação NÃO esconde a camada das telas onde ela é apenas listada para você
// escolher (aba NDVI, Camadas salvas, Composição Temporal, PDF do produtor,
// relatório de satélite da fazenda, app de campo). Filtrar ali tornaria
// impossível marcar o que ainda não está marcado.
//
// Persistência espelhando lib/cenaEstados.ts: cache local + doc por talhão na
// nuvem (app_kv, coleção 'inv_ndvi_fontes'), para valer em qualquer aparelho.
// Offline funciona só com o local e sincroniza na próxima abertura online.

import { usarDadosSupabase, salvarDocSupabase, carregarDocsPorCampoSupabase } from './supabaseData';
import { idFonte } from './msrSelecao.ts';

const K = 'inv_ndvi_fontes';
const COLECAO = 'inv_ndvi_fontes';

// A REGRA (idFonte/apenasFontes) mora em msrSelecao.ts, que é puro e roda em
// Node — este módulo é só a persistência. Reexportadas para quem já importa daqui.
export { idFonte, apenasFontes } from './msrSelecao.ts';

export function getFontesLocal(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(K) ?? '{}'); } catch { return {}; }
}

function saveLocal(f: Record<string, boolean>) {
  try { localStorage.setItem(K, JSON.stringify(f)); } catch { /* cota cheia: segue em memória */ }
}

/**
 * Estado do talhão vindo da nuvem, mesclado no cache local.
 *
 * A nuvem manda nas chaves DESTE talhão; o resto do cache fica como está — é o
 * mesmo contrato de carregarRejeitadas, e é o que permite chamar esta função de
 * qualquer tela sem embaralhar o estado dos outros talhões.
 */
export async function carregarFontes(talhaoId: string): Promise<Record<string, boolean>> {
  const local = getFontesLocal();
  if (usarDadosSupabase() && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const docs = await carregarDocsPorCampoSupabase<{ talhaoId: string; fontes?: Record<string, boolean> }>(COLECAO, 'talhaoId', talhaoId);
      const nuvem = docs[0]?.fontes ?? {};
      for (const k of Object.keys(local)) if (k.startsWith(talhaoId + ':')) delete local[k];
      const junto = { ...local, ...nuvem };
      saveLocal(junto);
      return junto;
    } catch { /* offline/erro: segue com o local */ }
  }
  return local;
}

export function marcarFonte(talhaoId: string, chave: string, v: boolean) {
  const f = getFontesLocal();
  const id = idFonte(talhaoId, chave);
  if (v) f[id] = true; else delete f[id];
  saveLocal(f);
  if (usarDadosSupabase() && typeof navigator !== 'undefined' && navigator.onLine) {
    const doTalhao = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith(talhaoId + ':')));
    void salvarDocSupabase(COLECAO, talhaoId, { talhaoId, fontes: doTalhao }).catch(() => {});
  }
}

/** Marca/desmarca várias de uma vez (usado na aba "Camadas salvas"). */
export function marcarFontes(talhaoId: string, chaves: string[], v: boolean) {
  const f = getFontesLocal();
  for (const c of chaves) {
    const id = idFonte(talhaoId, c);
    if (v) f[id] = true; else delete f[id];
  }
  saveLocal(f);
  if (usarDadosSupabase() && typeof navigator !== 'undefined' && navigator.onLine) {
    const doTalhao = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith(talhaoId + ':')));
    void salvarDocSupabase(COLECAO, talhaoId, { talhaoId, fontes: doTalhao }).catch(() => {});
  }
}
