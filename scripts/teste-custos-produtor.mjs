// Custos por produtor/fazenda — a camada que sobrepõe a Biblioteca.
// Roda: `npm run teste:custos-produtor`.
//
// O que este arquivo protege:
//   1. vazio HERDA, preenchido VENCE, mais específico ganha (biblioteca →
//      produtor → fazenda);
//   2. 0 é zero de verdade — "não custa nada" ≠ "não informado";
//   3. linha de outra fazenda ou de outro semestre NUNCA entra na conta;
//   4. sobrescrever preço não obriga a redigitar a aplicação.
import assert from 'node:assert/strict';
import { linhasAplicaveis, precoDoInsumo, custoLavoura } from '../src/lib/custosProdutor.ts';

let ok = 0, fail = 0;
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
};

const CLI = 'cli1', FAZ = 'faz1', ANO = 2026;
const ctx = (extra = {}) => ({ clienteId: CLI, fazendaId: FAZ, ano: ANO, epoca: '2', ...extra });
const linha = (o) => ({ id: o.id ?? 'l', clienteId: CLI, ano: ANO, ...o });
const BIB = { precoT: 3000, aplicacaoHa: 50 };

console.log('\nCustos por produtor\n');

t('sem nenhuma linha, vale a Biblioteca', () => {
  const r = precoDoInsumo('kcl', BIB, []);
  assert.equal(r.precoT, 3000);
  assert.equal(r.aplicacaoHa, 50);
  assert.deepEqual(r.fonte, { preco: 'biblioteca', frete: 'nenhum', aplicacao: 'biblioteca' });
});

t('preço do PRODUTOR vence o da biblioteca', () => {
  const ls = linhasAplicaveis([linha({ insumos: { kcl: { precoT: 2500 } } })], ctx());
  const r = precoDoInsumo('kcl', BIB, ls);
  assert.equal(r.precoT, 2500);
  assert.equal(r.fonte.preco, 'produtor');
  assert.equal(r.aplicacaoHa, 50, 'aplicação continua herdando — campos são independentes');
  assert.equal(r.fonte.aplicacao, 'biblioteca');
});

t('FAZENDA vence produtor', () => {
  const ls = linhasAplicaveis([
    linha({ id: 'p', insumos: { kcl: { precoT: 2500 } } }),
    linha({ id: 'f', fazendaId: FAZ, insumos: { kcl: { precoT: 2400 } } }),
  ], ctx());
  assert.equal(precoDoInsumo('kcl', BIB, ls).precoT, 2400);
  assert.equal(precoDoInsumo('kcl', BIB, ls).fonte.preco, 'fazenda');
});

t('linha de OUTRA fazenda não entra', () => {
  const ls = linhasAplicaveis([linha({ fazendaId: 'faz9', insumos: { kcl: { precoT: 999 } } })], ctx());
  assert.deepEqual(ls, []);
  assert.equal(precoDoInsumo('kcl', BIB, ls).precoT, 3000);
});

t('linha do OUTRO semestre não entra', () => {
  const ls = linhasAplicaveis([linha({ epoca: '1', insumos: { kcl: { precoT: 999 } } })], ctx({ epoca: '2' }));
  assert.deepEqual(ls, []);
});

t('linha SEM época é o padrão do ano; a do semestre vence', () => {
  const todas = [
    linha({ id: 'ano', insumos: { kcl: { precoT: 2500 } } }),
    linha({ id: 'sem', epoca: '2', insumos: { kcl: { precoT: 2200 } } }),
  ];
  assert.equal(precoDoInsumo('kcl', BIB, linhasAplicaveis(todas, ctx({ epoca: '2' }))).precoT, 2200);
  assert.equal(precoDoInsumo('kcl', BIB, linhasAplicaveis(todas, ctx({ epoca: '1' }))).precoT, 2500,
    'no 1º semestre sobra o padrão do ano');
});

t('outro ANO não entra', () => {
  assert.deepEqual(linhasAplicaveis([linha({ ano: 2025, insumos: { kcl: { precoT: 1 } } })], ctx()), []);
});

t('ZERO é zero de verdade — "não custa nada" não é "não informado"', () => {
  const ls = linhasAplicaveis([linha({ insumos: { kcl: { aplicacaoHa: 0 } } })], ctx());
  const r = precoDoInsumo('kcl', BIB, ls);
  assert.equal(r.aplicacaoHa, 0, 'o 50 da biblioteca foi zerado de propósito');
  assert.equal(r.fonte.aplicacao, 'produtor');
});

t('aplicação PADRÃO vale só para insumo que não declarou a dele', () => {
  const ls = linhasAplicaveis([linha({
    aplicacaoPadraoHa: 45,
    insumos: { kcl: { aplicacaoHa: 80 } },
  })], ctx());
  assert.equal(precoDoInsumo('kcl', BIB, ls).aplicacaoHa, 80, 'o do insumo vence o padrão');
  assert.equal(precoDoInsumo('map', { precoT: 5000 }, ls).aplicacaoHa, 45, 'quem não tem o seu usa o padrão');
});

t('preço ausente continua NULL, nunca 0 (0 diria "de graça")', () => {
  const r = precoDoInsumo('novo', { precoT: null }, []);
  assert.equal(r.precoT, null);
  assert.equal(r.fonte.preco, 'nenhum');
  assert.equal(r.aplicacaoHa, 0, 'aplicação sem ninguém declarando soma zero');
});

t('insumo não citado na linha segue com o preço da biblioteca', () => {
  const ls = linhasAplicaveis([linha({ insumos: { kcl: { precoT: 2500 } } })], ctx());
  assert.equal(precoDoInsumo('ureia', { precoT: 4000 }, ls).precoT, 4000);
});

t('custo da lavoura: fazenda vence produtor; ausente é null', () => {
  const ls = linhasAplicaveis([
    linha({ id: 'p', custoLavouraHa: 5400 }),
    linha({ id: 'f', fazendaId: FAZ, custoLavouraHa: 5900 }),
  ], ctx());
  assert.equal(custoLavoura(ls).custoHa, 5900);
  assert.equal(custoLavoura(ls).fonte, 'fazenda');
  assert.equal(custoLavoura([]).custoHa, null);
});

t('custo da lavoura ZERO é declarado, não ausente', () => {
  const ls = linhasAplicaveis([linha({ custoLavouraHa: 0 })], ctx());
  assert.equal(custoLavoura(ls).custoHa, 0);
  assert.equal(custoLavoura(ls).fonte, 'produtor');
});

// ── Custo POR CULTURA — soja e milho não têm o mesmo custo ─────────────────
t('custo da CULTURA vence o geral da mesma linha', () => {
  const ls = linhasAplicaveis([linha({
    custoLavouraHa: 5400,
    custosLavouraPorCultura: { soja: 5900, milho: 7200 },
  })], ctx());
  assert.equal(custoLavoura(ls, 'soja').custoHa, 5900);
  assert.equal(custoLavoura(ls, 'milho').custoHa, 7200);
  assert.equal(custoLavoura(ls, 'soja').porCultura, true);
});

t('cultura sem valor próprio cai no geral', () => {
  const ls = linhasAplicaveis([linha({ custoLavouraHa: 5400, custosLavouraPorCultura: { soja: 5900 } })], ctx());
  assert.equal(custoLavoura(ls, 'trigo').custoHa, 5400);
  assert.equal(custoLavoura(ls, 'trigo').porCultura, false);
  assert.equal(custoLavoura(ls, null).custoHa, 5400, 'sem cultura informada, o geral');
});

t('cultura casa sem depender de caixa', () => {
  const ls = linhasAplicaveis([linha({ custosLavouraPorCultura: { soja: 5900 } })], ctx());
  assert.equal(custoLavoura(ls, 'SOJA').custoHa, 5900);
  assert.equal(custoLavoura(ls, ' Soja ').custoHa, 5900);
});

t('custo por cultura da FAZENDA vence o do produtor', () => {
  const ls = linhasAplicaveis([
    linha({ id: 'p', custosLavouraPorCultura: { soja: 5900 } }),
    linha({ id: 'f', fazendaId: FAZ, custosLavouraPorCultura: { soja: 6300 } }),
  ], ctx());
  assert.equal(custoLavoura(ls, 'soja').custoHa, 6300);
  assert.equal(custoLavoura(ls, 'soja').fonte, 'fazenda');
});

// ── FRETE: valor final = produto + frete (calcário, gesso) ─────────────────
t('frete SOMA ao preço e o total é o que as contas usam', () => {
  const ls = linhasAplicaveis([linha({ insumos: { calc: { precoT: 180, freteT: 95 } } })], ctx());
  const r = precoDoInsumo('calc', { precoT: 200 }, ls);
  assert.equal(r.precoT, 180, 'produto');
  assert.equal(r.freteT, 95, 'frete');
  assert.equal(r.precoTotalT, 275, 'posto na fazenda');
  assert.equal(r.fonte.frete, 'produtor');
});

t('sem frete declarado, total = preço (frete não inventa custo)', () => {
  const r = precoDoInsumo('kcl', BIB, []);
  assert.equal(r.freteT, 0);
  assert.equal(r.precoTotalT, 3000);
  assert.equal(r.fonte.frete, 'nenhum');
});

t('frete sem preço NÃO vira preço', () => {
  const ls = linhasAplicaveis([linha({ insumos: { x: { freteT: 95 } } })], ctx());
  const r = precoDoInsumo('x', { precoT: null }, ls);
  assert.equal(r.precoTotalT, null, 'total desconhecido — frete sozinho não é preço');
  assert.equal(r.freteT, 95);
});

t('frete da FAZENDA vence o do produtor (é ele que muda por distância)', () => {
  const ls = linhasAplicaveis([
    linha({ id: 'p', insumos: { calc: { precoT: 180, freteT: 95 } } }),
    linha({ id: 'f', fazendaId: FAZ, insumos: { calc: { freteT: 140 } } }),
  ], ctx());
  const r = precoDoInsumo('calc', { precoT: 200 }, ls);
  assert.equal(r.precoT, 180, 'preço continua o do produtor');
  assert.equal(r.freteT, 140);
  assert.equal(r.precoTotalT, 320);
});

t('frete ZERO é declarado (retira o frete herdado)', () => {
  const ls = linhasAplicaveis([
    linha({ id: 'p', insumos: { calc: { freteT: 95 } } }),
    linha({ id: 'f', fazendaId: FAZ, insumos: { calc: { freteT: 0 } } }),
  ], ctx());
  const r = precoDoInsumo('calc', { precoT: 200 }, ls);
  assert.equal(r.freteT, 0);
  assert.equal(r.precoTotalT, 200);
});

t('ordem de chegada não importa — a específica sempre vence', () => {
  const a = linha({ id: 'p', insumos: { kcl: { precoT: 2500 } } });
  const b = linha({ id: 'f', fazendaId: FAZ, insumos: { kcl: { precoT: 2400 } } });
  for (const todas of [[a, b], [b, a]]) {
    assert.equal(precoDoInsumo('kcl', BIB, linhasAplicaveis(todas, ctx())).precoT, 2400);
  }
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
