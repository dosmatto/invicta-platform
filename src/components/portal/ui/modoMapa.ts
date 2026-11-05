'use client';

// Modo dos mini-mapas do portal: 'leve' (talhões coloridos pela classe/média —
// nada de rede) ou 'real' (os rasters de verdade, sob demanda). O shell
// fornece o valor (alternador no cabeçalho, persistido no navegador); o
// MiniMapa lê daqui quando não recebe `modo` por prop.

import { createContext, useContext } from 'react';

export type ModoMapa = 'leve' | 'real';

export const ModoMapaContext = createContext<ModoMapa>('leve');

export function useModoMapa(): ModoMapa {
  return useContext(ModoMapaContext);
}

/** Chaves do localStorage: uma preferência para "todos os talhões" (padrão
 *  leve) e outra para a visão de UM talhão (padrão real). */
export const CHAVE_MODO_TODOS = 'inv_portal_modo_mapa';
export const CHAVE_MODO_UM = 'inv_portal_modo_mapa_talhao';

export function lerModoSalvo(umTalhao: boolean): ModoMapa {
  try {
    const v = localStorage.getItem(umTalhao ? CHAVE_MODO_UM : CHAVE_MODO_TODOS);
    if (v === 'leve' || v === 'real') return v;
  } catch { /* navegador sem storage: fica o padrão */ }
  return umTalhao ? 'real' : 'leve';
}

export function salvarModo(umTalhao: boolean, m: ModoMapa): void {
  try { localStorage.setItem(umTalhao ? CHAVE_MODO_UM : CHAVE_MODO_TODOS, m); } catch { /* sem storage: só nesta tela */ }
}
