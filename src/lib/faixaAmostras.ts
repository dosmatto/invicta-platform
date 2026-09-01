// LIMITE NA FAIXA DAS AMOSTRAS, do lado do app.
//
// O servidor já limita (backend/interp.py, np.clip no fim de gerar_grid). Esta é
// a segunda linha, e ela existe porque o servidor NÃO é o único produtor:
//
//   • o INTERPOLADOR DESTA MÁQUINA não se atualiza sozinho. Quem tem uma versão
//     antiga instalada continua recebendo grid sem limite — foi exatamente o que
//     aconteceu no caso relatado: o usuário reprocessou, mas o cálculo foi para o
//     programa local antigo;
//   • mapas SALVOS antes da correção guardam os valores fora da faixa, e reabrir
//     não refaz a conta.
//
// A krigagem pode sair da faixa porque não é combinação convexa: os pesos podem
// ser negativos (efeito de tela). Não é defeito de implementação, é propriedade
// do método — o IDW não tem isso.
//
// Sem dependências de propósito. Coberto por `npm run teste:faixa-front`.

/** Menor e maior valor das amostras. `null` quando não há amostra utilizável. */
export function faixaDe(valores: number[]): [number, number] | null {
  let min = Infinity, max = -Infinity;
  for (const v of valores) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? [min, max] : null;
}

/**
 * Limita o grid à faixa [min, max] das amostras.
 *
 * Devolve o MESMO Float32Array quando nada precisa mudar — assim o caminho normal
 * não paga cópia, e quem compara por identidade continua funcionando. NaN é
 * preservado (é o recorte do talhão; limitar não pode preencher buraco).
 */
export function limitarNaFaixa(
  valores: Float32Array,
  faixa: [number, number] | null,
): { valores: Float32Array; alterados: number } {
  if (!faixa) return { valores, alterados: 0 };
  const [min, max] = faixa;
  let alterados = 0;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (!Number.isFinite(v)) continue;          // NaN = fora do talhão
    if (v < min || v > max) alterados++;
  }
  if (alterados === 0) return { valores, alterados: 0 };
  const out = new Float32Array(valores.length);
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    out[i] = !Number.isFinite(v) ? v : (v < min ? min : (v > max ? max : v));
  }
  return { valores: out, alterados };
}

/** Float32Array -> base64, no mesmo formato que o backend manda (little-endian). */
export function paraB64(arr: Float32Array): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  const CHUNK = 0x8000;   // em pedaços: String.fromCharCode estoura a pilha com arrays grandes
  for (let i = 0; i < u8.length; i += CHUNK) bin += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  return btoa(bin);
}

// ── Nível GRID: o que os consumidores realmente usam ────────────────────────

type Grid = { b64: string; shape: [number, number]; comp?: 'gz' };

/** Faixa das amostras de uma lista de pontos. */
export function faixaDosPontos(pontos: ReadonlyArray<{ valor: number }>): [number, number] | null {
  return faixaDe(pontos.map(p => p.valor));
}

/**
 * Faixa do laudo para uma variável+profundidade — para limitar mapas JÁ SALVOS,
 * onde não há a lista de pontos em mãos.
 *
 * Devolve null (não limita) quando o laudo foi alterado DEPOIS do mapa ter sido
 * gerado: aí a faixa atual não é a que produziu aquele mapa, e cortar por ela
 * seria inventar. Acontece no desmembrar/fundir talhão, que troca os resultados
 * sob o mesmo id e carimba `limiteAlteradoEm`.
 */
export function faixaDoLaudo(
  imp: { resultados: { profundidade: string; valores: Record<string, number> }[]; limiteAlteradoEm?: string } | null | undefined,
  nut: string,
  prof: string,
  interpoladoEm?: string,
): [number, number] | null {
  if (!imp) return null;
  if (imp.limiteAlteradoEm && interpoladoEm && interpoladoEm < imp.limiteAlteradoEm) return null;
  const vals: number[] = [];
  for (const r of imp.resultados) {
    if (r.profundidade !== prof) continue;
    const v = r.valores[nut];
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  return faixaDe(vals);
}

/** Limita um grid CRU (não comprimido) à faixa. Devolve o MESMO objeto se nada mudar. */
export function limitarGrid(grid: Grid | undefined, faixa: [number, number] | null): Grid | undefined {
  if (!grid?.b64 || grid.comp === 'gz' || !faixa) return grid;   // comprimido: quem chama descomprime antes
  const bin = atob(grid.b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const { valores, alterados } = limitarNaFaixa(new Float32Array(buf), faixa);
  if (alterados === 0) return grid;
  return { ...grid, b64: paraB64(valores) };
}

/**
 * Limita o grid E o `stats.min/max` de uma resposta de interpolação.
 *
 * O stats vem do servidor e é o FALLBACK das estatísticas do PDF — limitar só o
 * grid deixaria o relatório imprimindo "mínimo -16,1" mesmo com o mapa correto.
 */
export function limitarRespAFaixa<T extends { grid?: Grid; stats?: { min: number | null; max: number | null } }>(
  resp: T,
  faixa: [number, number] | null,
): T {
  if (!faixa) return resp;
  const grid = limitarGrid(resp.grid, faixa);
  const st = resp.stats;
  const precisaStats = !!st && ((st.min != null && st.min < faixa[0]) || (st.max != null && st.max > faixa[1]));
  if (grid === resp.grid && !precisaStats) return resp;
  return {
    ...resp,
    ...(grid !== resp.grid ? { grid } : {}),
    ...(precisaStats && st ? { stats: { ...st, min: Math.max(st.min ?? faixa[0], faixa[0]), max: Math.min(st.max ?? faixa[1], faixa[1]) } } : {}),
  };
}
