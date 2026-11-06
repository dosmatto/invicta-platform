'use client';

// Unidade da produtividade no portal (kg/ha · sc/ha · sc/alq): a preferência
// fica no navegador, uma por produtor (cliente), como as do modo dos mapas
// (modoMapa.ts). Padrão kg/ha. As contas e os textos são de lib/portalUnidade.

import { chaveUnidadeProd, normalizarUnidadeProd, UNIDADE_PROD_PADRAO, type UnidadeProd } from '@/lib/portalUnidade';

export function lerUnidadeSalva(clienteId: string): UnidadeProd {
  try {
    return normalizarUnidadeProd(localStorage.getItem(chaveUnidadeProd(clienteId)));
  } catch { /* navegador sem storage: fica o padrão */ }
  return UNIDADE_PROD_PADRAO;
}

export function salvarUnidade(clienteId: string, u: UnidadeProd): void {
  try { localStorage.setItem(chaveUnidadeProd(clienteId), u); } catch { /* sem storage: só nesta tela */ }
}
