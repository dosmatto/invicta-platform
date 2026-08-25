// FÓRMULA AVULSA (v2.73) — o rascunho de equação da aba Recomendações.
//
// O que estes testes protegem: a fórmula editada no talhão TEM de mudar o
// número que sai, sem tocar no cadastro da Biblioteca, e TEM de gerar um
// cenário separado. A assinatura é o que garante a segunda parte — se ela
// mudar por um Enter a mais, o agrônomo passa a colecionar cenários duplicados;
// se ela NÃO mudar quando a conta muda, a fórmula avulsa grava por cima do
// cenário da equação original e o PDF sai com a conta errada.
//
// Rodar: npm run teste:formula

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rascunhoDaEquacao, equacaoComRascunho, formulaEditada, assinaturaRascunho, checarRascunho,
} from '../src/lib/recomendacao/formulaAvulsa.ts';
import { dosesPorEquacao } from '../src/lib/prescricao/equacao.ts';

/** Calagem pela saturação por bases, como está cadastrada na Biblioteca. */
const EQ = {
  produto: 'Calcário dolomítico',
  insumoId: 'ins1',
  custoTonelada: 115, freteHa: 10, aplicacaoHa: 20,
  profundidade: '0-20',
  unidadeEquacao: 'cmolc/dm3',
  unidadeTratamento: 'kg/ha',
  tratamento: 'taxa-variada',
  culturas: ['soja'], fases: [],
  naoNegativo: true, doseMinimaViavel: 0, abaixoMinimo: 'zero', doseMaxima: 0,
  constantes: [{ nome: 'PRNT', valor: 90 }],
  script: 'dose = (70 - V) / 100 * CTC * 10000 / PRNT',
  estilo: { valorMinimo: 0, classes: [], dividirAuto: true, zeroTransparente: true },
};

test('o rascunho começa igual ao cadastro — abrir a fórmula não altera nada', () => {
  const r = rascunhoDaEquacao(EQ);
  assert.equal(r.script, EQ.script);
  assert.equal(r.profundidade, '0-20');
  assert.equal(r.unidadeTratamento, 'kg/ha');
  assert.equal(formulaEditada(EQ, r), false);
});

test('espaço e linha em branco NÃO contam como edição (nem criam cenário novo)', () => {
  const r = rascunhoDaEquacao(EQ);
  const enfeitado = { ...r, script: `\n  ${EQ.script}   \n\n` };
  assert.equal(formulaEditada(EQ, enfeitado), false);
  assert.equal(assinaturaRascunho(enfeitado), assinaturaRascunho(r));
});

test('mexer na conta, na constante, na profundidade ou na unidade CONTA como edição', () => {
  const r = rascunhoDaEquacao(EQ);
  assert.equal(formulaEditada(EQ, { ...r, script: 'dose = (80 - V) / 100 * CTC * 10000 / PRNT' }), true);
  assert.equal(formulaEditada(EQ, { ...r, constantes: [{ nome: 'PRNT', valor: 85 }] }), true);
  assert.equal(formulaEditada(EQ, { ...r, profundidade: '20-40' }), true);
  assert.equal(formulaEditada(EQ, { ...r, unidadeTratamento: 't/ha' }), true);
  assert.equal(formulaEditada(EQ, { ...r, doseMaxima: 4000 }), true);
});

test('assinatura: estável para a mesma fórmula, diferente para contas diferentes', () => {
  const r = rascunhoDaEquacao(EQ);
  assert.equal(assinaturaRascunho(r), assinaturaRascunho(rascunhoDaEquacao(EQ)));
  const outra = { ...r, script: 'dose = (80 - V) / 100 * CTC * 10000 / PRNT' };
  assert.notEqual(assinaturaRascunho(r), assinaturaRascunho(outra));
  // Só a profundidade muda → cenário separado também (o laudo lido é outro).
  assert.notEqual(assinaturaRascunho(r), assinaturaRascunho({ ...r, profundidade: '20-40' }));
  assert.match(assinaturaRascunho(r), /^[0-9a-z]+$/);
});

test('a fórmula avulsa NÃO leva junto produto, custos nem estilo do cadastro', () => {
  const r = { ...rascunhoDaEquacao(EQ), script: 'dose = 100', constantes: [] };
  const c = equacaoComRascunho(EQ, r);
  assert.equal(c.script, 'dose = 100');
  assert.equal(c.produto, 'Calcário dolomítico');
  assert.equal(c.insumoId, 'ins1');
  assert.equal(c.custoTonelada, 115);
  assert.equal(c.estilo, EQ.estilo);
  // e o CADASTRO continua intacto — o merge é uma cópia
  assert.equal(EQ.script, 'dose = (70 - V) / 100 * CTC * 10000 / PRNT');
});

test('constante sem nome é descartada no merge (linha em branco da tabela)', () => {
  const r = { ...rascunhoDaEquacao(EQ), constantes: [{ nome: 'PRNT', valor: 90 }, { nome: '  ', valor: 0 }] };
  assert.equal(equacaoComRascunho(EQ, r).constantes.length, 1);
});

test('checagem acusa fórmula vazia, erro de sintaxe e atributo inexistente', () => {
  const base = rascunhoDaEquacao(EQ);
  assert.equal(checarRascunho({ ...base, script: '   ' }).ok, false);
  assert.equal(checarRascunho({ ...base, script: 'dose = (70 - V' }).ok, false);
  const inventado = checarRascunho({ ...base, script: 'dose = XYZ * 2' });
  assert.equal(inventado.ok, false);
  assert.match(inventado.erro, /não reconhecida/i);
  // a boa passa e lista os atributos que o mapa vai precisar
  const ok = checarRascunho(base);
  assert.equal(ok.ok, true);
  assert.deepEqual([...ok.vars].sort(), ['ctc', 'v']);
});

test('PONTA A PONTA: a fórmula editada muda a dose calculada', () => {
  const zonas = [{ id: 'z1' }];
  const valores = { z1: { v: 50, ctc: 8 } };
  const doseDe = (conteudo) => dosesPorEquacao(zonas, valores, {
    script: conteudo.script, constantes: conteudo.constantes,
    naoNegativo: conteudo.naoNegativo, doseMinimaViavel: conteudo.doseMinimaViavel,
    abaixoMinimo: conteudo.abaixoMinimo, doseMaxima: conteudo.doseMaxima,
  }).doses[0].dose;

  // cadastro: (70-50)/100 * 8 * 10000 / 90 = 177,77 kg/ha
  assert.ok(Math.abs(doseDe(EQ) - 177.777) < 0.01);

  // o agrônomo sobe a meta para V=80 neste talhão: (80-50)/100*8*10000/90 = 266,66
  const r = { ...rascunhoDaEquacao(EQ), script: 'dose = (80 - V) / 100 * CTC * 10000 / PRNT' };
  assert.ok(Math.abs(doseDe(equacaoComRascunho(EQ, r)) - 266.666) < 0.01);

  // e o teto da fórmula avulsa vale no resultado
  const comTeto = { ...r, doseMaxima: 200 };
  assert.equal(doseDe(equacaoComRascunho(EQ, comTeto)), 200);
});

test('PONTA A PONTA: dá para reescrever a equação inteira com outros atributos', () => {
  const zonas = [{ id: 'z1' }];
  const valores = { z1: { k: 0.12, ctc: 8 } };
  // KCl para 3% da CTC, escrita do zero no talhão (nada a ver com a calagem).
  const r = {
    ...rascunhoDaEquacao(EQ),
    script: 'dose = ((CTC * (3 / 100)) - K) * 160',
    constantes: [],
  };
  const c = equacaoComRascunho(EQ, r);
  assert.equal(checarRascunho(r).ok, true);
  const d = dosesPorEquacao(zonas, valores, {
    script: c.script, constantes: c.constantes, naoNegativo: c.naoNegativo,
    doseMinimaViavel: c.doseMinimaViavel, abaixoMinimo: c.abaixoMinimo, doseMaxima: c.doseMaxima,
  }).doses[0];
  // (8*0,03 − 0,12) × 160 = 19,2 kg/ha
  assert.ok(Math.abs(d.dose - 19.2) < 0.001, `dose=${d.dose}`);
});
