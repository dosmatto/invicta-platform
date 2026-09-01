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
