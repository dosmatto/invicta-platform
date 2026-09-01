// Testes do limite na faixa das amostras, no lado do app (lib/faixaAmostras).
//
// Segunda linha de defesa. A primeira é o servidor (backend/interp.py), mas ele
// não é o único produtor: o INTERPOLADOR DESTA MÁQUINA não se atualiza sozinho —
// no caso relatado o usuário reprocessou e o cálculo foi para o programa local
// antigo, sem limite — e mapas SALVOS antes da correção guardam o valor fora da
// faixa, já que reabrir não refaz a conta.
// Roda: `npm run teste:faixa-front`
import assert from 'node:assert/strict';
import { faixaDe, limitarNaFaixa, faixaDoLaudo, limitarGrid, limitarRespAFaixa, faixaDaResposta } from '../src/lib/faixaAmostras.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };
const f32 = (a) => Float32Array.from(a);

t('faixaDe: menor e maior das amostras', () => {
  assert.deepEqual(faixaDe([7, 4, 26, 10]), [4, 26]);
});

t('faixaDe: ignora NaN/Infinity e devolve null sem amostra utilizável', () => {
  assert.deepEqual(faixaDe([NaN, 5, Infinity, 9]), [5, 9]);
  assert.equal(faixaDe([]), null);
  assert.equal(faixaDe([NaN, NaN]), null);
});

t('O CASO REAL: negativo vira o mínimo amostrado', () => {
  // mapa de P: amostras 4..70, grid com -16,1 (o que o usuário viu)
  const { valores, alterados } = limitarNaFaixa(f32([-16.1, 8, 22, 70]), [4, 70]);
  assert.equal(valores[0], 4, '-16,1 tem de virar 4');
  assert.equal(alterados, 1);
});

t('acima do máximo também é limitado', () => {
  const { valores, alterados } = limitarNaFaixa(f32([4, 87.1, 30]), [4, 70]);
  assert.equal(valores[1], 70);
  assert.equal(alterados, 1);
});

t('valores DENTRO da faixa ficam idênticos, bit a bit', () => {
  const orig = f32([4, 8.25, 22.5, 70]);
  const { valores, alterados } = limitarNaFaixa(orig, [4, 70]);
  assert.equal(alterados, 0);
  assert.equal(valores, orig, 'sem alteração tem de devolver o MESMO array');
});

t('NaN é preservado (é o recorte do talhão, não pode virar valor)', () => {
  const { valores } = limitarNaFaixa(f32([NaN, -5, NaN, 100]), [4, 70]);
  assert.ok(Number.isNaN(valores[0]) && Number.isNaN(valores[2]), 'NaN tem de continuar NaN');
  assert.equal(valores[1], 4);
  assert.equal(valores[3], 70);
});

t('sem faixa (nenhuma amostra) devolve o grid intocado', () => {
  const orig = f32([-16.1, 8]);
  const { valores, alterados } = limitarNaFaixa(orig, null);
  assert.equal(valores, orig, 'sem saber a faixa, não inventa limite');
  assert.equal(alterados, 0);
});

t('amostra única: min = max, tudo colapsa nesse valor', () => {
  const { valores } = limitarNaFaixa(f32([-3, 7, 99]), faixaDe([7]));
  assert.deepEqual([...valores], [7, 7, 7]);
});

t('faixa negativa legítima é respeitada (ex.: temperatura, saldo)', () => {
  // Se a AMOSTRA é negativa, o negativo é legítimo e não pode ser cortado.
  const { valores, alterados } = limitarNaFaixa(f32([-12, -3, 5]), [-12, 5]);
  assert.equal(alterados, 0, 'nada a limitar — a faixa das amostras inclui negativo');
  assert.equal(valores[0], -12);
});

t('conta quantos pixels foram corrigidos (para a tela poder avisar)', () => {
  const { alterados } = limitarNaFaixa(f32([-1, -2, 5, 99, 100]), [0, 50]);
  assert.equal(alterados, 4);
});

// ── Nível GRID e faixa do laudo (v2.104.0) ───────────────────────────────────
// A garantia agora vale em QUATRO portas: interpolar() (todo grid novo, de
// qualquer servidor) e as três hidratações de mapa já salvo — aba Fertilidade,
// gerador de relatórios e o caminho da DOSE.
const enc = (arr) => {
  const u8 = new Uint8Array(Float32Array.from(arr).buffer);
  let bin = ''; for (const b of u8) bin += String.fromCharCode(b);
  return Buffer.from(bin, 'binary').toString('base64');
};
const dec = (b64) => {
  const buf = Buffer.from(b64, 'base64');
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
};
const LAUDO = { resultados: [
  { profundidade: '0-20', valores: { p: 4 } },
  { profundidade: '0-20', valores: { p: 26 } },
  { profundidade: '0-20', valores: { p: 70 } },
  { profundidade: '20-40', valores: { p: 2 } },
] };

t('faixaDoLaudo: usa só a profundidade pedida', () => {
  assert.deepEqual(faixaDoLaudo(LAUDO, 'p', '0-20'), [4, 70]);
  assert.deepEqual(faixaDoLaudo(LAUDO, 'p', '20-40'), [2, 2]);
});

t('faixaDoLaudo: variável sem valor no laudo devolve null (não inventa limite)', () => {
  assert.equal(faixaDoLaudo(LAUDO, 'k', '0-20'), null);
  assert.equal(faixaDoLaudo(null, 'p', '0-20'), null);
});

t('faixaDoLaudo: laudo alterado DEPOIS do mapa → não limita', () => {
  // desmembrar/fundir talhão troca os resultados sob o mesmo id e carimba
  // limiteAlteradoEm. A faixa atual não é a que gerou aquele mapa — cortar por
  // ela seria inventar.
  const alterado = { ...LAUDO, limiteAlteradoEm: '2026-09-01T12:00:00Z' };
  assert.equal(faixaDoLaudo(alterado, 'p', '0-20', '2026-08-30T10:00:00Z'), null);
  assert.deepEqual(faixaDoLaudo(alterado, 'p', '0-20', '2026-09-02T10:00:00Z'), [4, 70]);
});

t('limitarGrid: corrige o b64 e devolve o MESMO objeto quando nada muda', () => {
  const fora = { b64: enc([-16.1, 8, 87.1]), shape: [1, 3] };
  const lim = limitarGrid(fora, [4, 70]);
  assert.deepEqual(dec(lim.b64).map(v => Math.round(v * 10) / 10), [4, 8, 70]);
  const dentro = { b64: enc([4, 8, 70]), shape: [1, 3] };
  assert.equal(limitarGrid(dentro, [4, 70]), dentro, 'sem alteração, mesmo objeto');
});

t('limitarGrid: grid COMPRIMIDO não é tocado (quem chama descomprime antes)', () => {
  const gz = { b64: 'qualquer', shape: [1, 1], comp: 'gz' };
  assert.equal(limitarGrid(gz, [4, 70]), gz);
});

t('limitarRespAFaixa: corrige TAMBÉM o stats — é o fallback do PDF', () => {
  // Sem isto o relatório imprimiria "mínimo -16,1" mesmo com o mapa já correto.
  const resp = { grid: { b64: enc([-16.1, 30]), shape: [1, 2] }, stats: { min: -30.69, max: 87.08 } };
  const lim = limitarRespAFaixa(resp, [4, 70]);
  assert.equal(lim.stats.min, 4);
  assert.equal(lim.stats.max, 70);
  assert.deepEqual(dec(lim.grid.b64).map(v => Math.round(v)), [4, 30]);
});

t('limitarRespAFaixa: tudo dentro da faixa devolve a MESMA resposta', () => {
  const resp = { grid: { b64: enc([4, 30, 70]), shape: [1, 3] }, stats: { min: 4, max: 70 } };
  assert.equal(limitarRespAFaixa(resp, [4, 70]), resp);
});

t('limitarRespAFaixa: sem faixa e sem procedência, não mexe em nada', () => {
  const resp = { grid: { b64: enc([-16.1]), shape: [1, 1] }, stats: { min: -16.1, max: -16.1 } };
  assert.equal(limitarRespAFaixa(resp, null), resp);
});

t('limitarRespAFaixa: sem faixa, usa a que a RESPOSTA carrega (interp-29+)', () => {
  // Laudo alterado depois do mapa (desmembrar/fundir) → `faixaDoLaudo` devolve
  // null. Antes o mapa ficava sem limite NENHUM justamente aí; agora a faixa das
  // amostras que geraram o grid viaja junto com ele.
  const resp = {
    grid: { b64: enc([-16.1, 30, 200]), shape: [1, 3] },
    stats: { min: -16.1, max: 200, faixa_amostras: [4, 70] },
  };
  const lim = limitarRespAFaixa(resp, null);
  assert.deepEqual(dec(lim.grid.b64).map(v => Math.round(v)), [4, 30, 70]);
  assert.equal(lim.stats.min, 4);
  assert.equal(lim.stats.max, 70);
});

t('faixaDaResposta: procedência ausente ou inválida devolve null', () => {
  assert.deepEqual(faixaDaResposta({ stats: { faixa_amostras: [4, 70] } }), [4, 70]);
  assert.equal(faixaDaResposta({ stats: {} }), null);
  assert.equal(faixaDaResposta({}), null);
  assert.equal(faixaDaResposta({ stats: { faixa_amostras: [70, 4] } }), null);
  assert.equal(faixaDaResposta({ stats: { faixa_amostras: [NaN, 70] } }), null);
});

t('a faixa PEDIDA ganha da procedência (laudo é a fonte, quando confiável)', () => {
  const resp = { grid: { b64: enc([1, 50]), shape: [1, 2] }, stats: { min: 1, max: 50, faixa_amostras: [0, 100] } };
  const lim = limitarRespAFaixa(resp, [10, 20]);
  assert.deepEqual(dec(lim.grid.b64).map(v => Math.round(v)), [10, 20]);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
