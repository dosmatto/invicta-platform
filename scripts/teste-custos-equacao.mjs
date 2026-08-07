// FONTE ÚNICA DE CUSTO: equação × insumo (v2.42).
//
// `custosDaEquacao` tem dez linhas e decide quanto DINHEIRO vai para o campo —
// é o número que vira orçamento no PDF do cenário e escolhe o cenário
// "recomendado" (o mais barato). As bordas que ela precisa acertar não são
// óbvias: "não sei o preço" nunca pode virar "de graça", e zero digitado de
// propósito não pode ser confundido com campo vazio.
//
// Rodar: npm run teste:custos

import test from 'node:test';
import assert from 'node:assert/strict';
import { custosDaEquacao } from '../src/lib/insumos.ts';

/** Equação de calcário como ela era antes do vínculo: custo próprio embutido. */
const EQ_LEGADA = { custoTonelada: 115, freteHa: 0, aplicacaoHa: 0 };
/** Equação vinculada e limpa: os três campos herdam. */
const EQ_LIMPA = { custoTonelada: null, freteHa: null, aplicacaoHa: null };
/** Calcário cadastrado na Biblioteca depois da v2.41 (preço já em R$/t). */
const CALCARIO = { categoria: 'corretivo', precoMedio: 350, precoUnidade: 't', freteHa: 18, aplicacaoHa: 22 };

test('SEM VÍNCULO: nada muda — a equação antiga responde igual ao que respondia', () => {
  const r = custosDaEquacao(EQ_LEGADA, undefined);
  assert.equal(r.custoTonelada, 115);
  assert.equal(r.freteHa, 0);
  assert.equal(r.aplicacaoHa, 0);
  assert.equal(r.fonte.custo, 'equacao');
});

test('VINCULADA E LIMPA: os três custos vêm do insumo', () => {
  const r = custosDaEquacao(EQ_LIMPA, CALCARIO);
  assert.equal(r.custoTonelada, 350);
  assert.equal(r.freteHa, 18);
  assert.equal(r.aplicacaoHa, 22);
  assert.deepEqual(r.fonte, { custo: 'insumo', frete: 'insumo', aplicacao: 'insumo' });
});

test('INSUMO LEGADO sem precoUnidade é lido em R$/kg — 0,35/kg vira 350/t', () => {
  // Cadastro anterior à v2.41. A régua está em precoNaUnidade e o caminho novo
  // tem que passar por ela, não reimplementar a conversão.
  const r = custosDaEquacao(EQ_LIMPA, { categoria: 'corretivo', precoMedio: 0.35 });
  assert.equal(r.custoTonelada, 350);
  assert.equal(r.fonte.custo, 'insumo');
});

test('SOBRESCRITA: custo preenchido vence, e o frete continua vindo do insumo', () => {
  // O caso real: calcário de outra jazida naquele talhão, mesmo frete.
  const r = custosDaEquacao({ custoTonelada: 400, freteHa: null, aplicacaoHa: null }, CALCARIO);
  assert.equal(r.custoTonelada, 400);
  assert.equal(r.fonte.custo, 'equacao');
  assert.equal(r.freteHa, 18);
  assert.equal(r.fonte.frete, 'insumo');
});

test('ZERO EXPLÍCITO ≠ VAZIO: frete 0 digitado vence o frete 18 do insumo', () => {
  // Se 0 significasse "herda", ninguém conseguiria mais dizer "esta equação
  // não tem frete" — é por isso que os campos são `number | null`.
  const r = custosDaEquacao({ custoTonelada: null, freteHa: 0, aplicacaoHa: null }, CALCARIO);
  assert.equal(r.freteHa, 0);
  assert.equal(r.fonte.frete, 'equacao');
  assert.equal(r.aplicacaoHa, 22, 'a aplicação, essa sim vazia, herda');
});

test('VÍNCULO ÓRFÃO (insumo excluído): custo null, nunca NaN e nunca 0', () => {
  const r = custosDaEquacao(EQ_LIMPA, undefined);
  assert.equal(r.custoTonelada, null, 'null acende o aviso de "sem custo" na tela');
  assert.equal(r.freteHa, 0);
  assert.equal(r.aplicacaoHa, 0);
  assert.deepEqual(r.fonte, { custo: 'nenhum', frete: 'nenhum', aplicacao: 'nenhum' });
});

test('INSUMO SEM PREÇO: "não sei quanto custa" não vira "de graça"', () => {
  const r = custosDaEquacao(EQ_LIMPA, { categoria: 'corretivo', freteHa: 18 });
  assert.equal(r.custoTonelada, null);
  assert.equal(r.fonte.custo, 'nenhum');
  assert.equal(r.freteHa, 18, 'o frete cadastrado continua valendo');
});

test('BORDA: NaN e Infinity no cadastro não propagam para a conta', () => {
  const r = custosDaEquacao(
    { custoTonelada: NaN, freteHa: Infinity, aplicacaoHa: null },
    { categoria: 'corretivo', precoMedio: 350, precoUnidade: 't', aplicacaoHa: NaN },
  );
  assert.equal(r.custoTonelada, 350, 'NaN na equação cai para o insumo');
  assert.equal(r.freteHa, 0);
  assert.equal(r.aplicacaoHa, 0);
  assert.ok(Number.isFinite(r.freteHa) && Number.isFinite(r.aplicacaoHa));
});

test('A CONTA FECHA: custoHa = tonHa×custo + frete + aplicação (como em aplicar.ts)', () => {
  const r = custosDaEquacao(EQ_LIMPA, CALCARIO);
  const tonHa = 2.5;                                   // 2,5 t/ha de calcário
  const custoHa = tonHa * (r.custoTonelada ?? 0) + r.freteHa + r.aplicacaoHa;
  assert.equal(custoHa, 2.5 * 350 + 18 + 22);          // 915
  // E a prova do objetivo do usuário: mudou o preço no insumo, mudou aqui —
  // sem tocar em equação nenhuma.
  const depois = custosDaEquacao(EQ_LIMPA, { ...CALCARIO, precoMedio: 380 });
  assert.equal(tonHa * (depois.custoTonelada ?? 0) + depois.freteHa + depois.aplicacaoHa, 2.5 * 380 + 40);
});
