// Linhagem de versões de um zoneamento (spec §5).
//
// O que estes testes travam: a RECONSTRUÇÃO da história a partir do id de
// origem. Se a numeração, a ordem ou o pai saírem errados, a tela de versões
// conta uma história falsa — e é com ela que se decide qual mapa vai para a
// máquina. O caso mais perigoso é a versão órfã (o pai foi excluído): ela não
// pode sumir da tela levando junto o trabalho que veio depois.
//
// Rodar: npm run teste:versoes

import test from 'node:test';
import assert from 'node:assert/strict';
import { montarLinhagens, tipoDaVersao, nomeBase, nomeCurto, resumoDaVersao, nomeVersaoRestaurada } from '../src/lib/meap/versoes.ts';

const META = { camadas: [], algoritmo: 'fcm', nPotenciais: 3, areaMinHa: 0, nZonas: 3 };
// t = minuto de criação, só para ordenar de forma legível nos testes
const z = (id, nome, t, meta = {}) => ({
  id, talhaoId: 'T1', nome, padrao: false,
  fc: { type: 'FeatureCollection', features: [] },
  meta: { ...META, ...meta },
  criadoEm: `2026-08-05T10:${String(t).padStart(2, '0')}:00.000Z`,
});

const suav = (origemId, origemNome) => ({ suavizacao: { nivel: 'leve', toleranciaM: 3, iteracoes: 1, manterLimiteExterno: true, fragMinHa: 0, larguraMinM: 0, diffTotalHa: 1.2, maiorDiffPct: 2, vertAntes: 1240, vertDepois: 380, origemId, origemNome, data: '2026-08-05T10:10:00.000Z' } });
const edit = (origemId, origemNome) => ({ edicaoManual: { operacoes: [], nUnificacoes: 2, nReclassificacoes: 1, nDivisoes: 0, origemId, origemNome, data: '2026-08-05T10:20:00.000Z' } });
const imp = () => ({ importacao: { arquivo: 'mapa.geojson', campoClasse: 'ZONA', menorEhPior: true, mapa: {}, data: '2026-08-05T10:00:00.000Z' } });

test('V1 → V2 → V3: uma linhagem, numerada por data', () => {
  const ls = montarLinhagens([
    z('a', 'Zoneamento 1', 0),
    z('b', 'Zoneamento 1 — Suavização leve', 10, suav('a', 'Zoneamento 1')),
    z('c', 'Zoneamento 1 — Suavização leve — Ajuste manual', 20, edit('b', 'Zoneamento 1 — Suavização leve')),
  ]);
  assert.equal(ls.length, 1, 'as três são a MESMA linhagem');
  assert.deepEqual(ls[0].versoes.map(v => v.rotulo), ['V1 Gerada', 'V2 Suavizada', 'V3 Ajuste manual']);
  assert.deepEqual(ls[0].versoes.map(v => v.origemNumero), [undefined, 1, 2]);
  assert.equal(ls[0].nome, 'Zoneamento 1', 'o cabeçalho mostra o nome, não a pilha de operações');
});

test('a ordem de entrada não muda a numeração (é por data)', () => {
  const ls = montarLinhagens([
    z('c', 'X — Ajuste manual', 20, edit('b', 'X — Suavização leve')),
    z('a', 'X', 0),
    z('b', 'X — Suavização leve', 10, suav('a', 'X')),
  ]);
  assert.deepEqual(ls[0].versoes.map(v => v.z.id), ['a', 'b', 'c']);
});

test('zoneamentos independentes = linhagens separadas', () => {
  const ls = montarLinhagens([
    z('a', 'Zoneamento 1', 0),
    z('b', 'Zoneamento 2', 5),
    z('c', 'Zoneamento 1 — Suavização leve', 10, suav('a', 'Zoneamento 1')),
  ]);
  assert.equal(ls.length, 2);
  assert.deepEqual(ls.map(l => l.versoes.length), [2, 1], 'a mais antiga vem primeiro');
  assert.deepEqual(ls[0].versoes.map(v => v.numero), [1, 2]);
});

test('cada linhagem tem a SUA contagem (não é global do talhão)', () => {
  const ls = montarLinhagens([
    z('a', 'Zoneamento 1', 0),
    z('b', 'Zoneamento 2', 5),
    z('c', 'Zoneamento 2 — Suavização leve', 10, suav('b', 'Zoneamento 2')),
  ]);
  const l2 = ls.find(l => l.nome === 'Zoneamento 2');
  assert.deepEqual(l2.versoes.map(v => v.numero), [1, 2], 'a V1 da linhagem 2 é a 1, não a 3');
});

test('versão ÓRFÃ (pai excluído) não some — vira raiz e diz de onde veio', () => {
  // Excluir a V1 não pode apagar da tela o ajuste manual que veio depois dela.
  const ls = montarLinhagens([
    z('b', 'Zoneamento 1 — Suavização leve', 10, suav('sumiu', 'Zoneamento 1')),
    z('c', 'Zoneamento 1 — Suavização leve — Ajuste manual', 20, edit('b', 'Zoneamento 1 — Suavização leve')),
  ]);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].versoes[0].orfa, true);
  assert.equal(ls[0].versoes[0].origemNome, 'Zoneamento 1', 'precisa dizer qual pai sumiu');
  assert.equal(ls[0].versoes[0].numero, 1, 'a órfã assume a V1 da linhagem');
  assert.equal(ls[0].versoes[1].origemNumero, 1, 'e a filha segue apontando para ela');
});

test('origem circular não trava a tela', () => {
  const a = z('a', 'A', 0, suav('b', 'B'));
  const b = z('b', 'B', 1, suav('a', 'A'));
  const ls = montarLinhagens([a, b]);
  assert.ok(ls.length >= 1, 'tem que devolver algo em vez de rodar para sempre');
  assert.equal(ls.reduce((s, l) => s + l.versoes.length, 0), 2, 'nenhuma versão pode sumir');
});

test('tipo da versão: restaurada > ajuste > suavizada > importada > gerada', () => {
  // A ordem importa porque editar/restaurar CARREGA a meta do pai: um ajuste
  // manual sobre uma suavização tem as duas metas, e o que vale é o que ESTA
  // versão fez.
  assert.equal(tipoDaVersao(z('x', 'x', 0)), 'gerada');
  assert.equal(tipoDaVersao(z('x', 'x', 0, imp())), 'importada');
  assert.equal(tipoDaVersao(z('x', 'x', 0, suav('a'))), 'suavizada');
  assert.equal(tipoDaVersao(z('x', 'x', 0, { ...suav('a'), ...edit('b') })), 'ajuste-manual');
  assert.equal(tipoDaVersao(z('x', 'x', 0, { ...edit('b'), restauracao: { origemId: 'a', data: 'x' } })), 'restaurada');
});

test('a linhagem sabe se a versão oficial está nela', () => {
  const a = z('a', 'A', 0); const b = z('b', 'B', 5); b.padrao = true;
  const ls = montarLinhagens([a, b]);
  assert.deepEqual(ls.map(l => l.temPadrao), [false, true]);
});

test('resumo diz o que a versão FEZ, não o que ela é', () => {
  assert.match(resumoDaVersao(z('x', 'x', 0, suav('a'))), /suavização leve.*1240→380 vértices/);
  assert.match(resumoDaVersao(z('x', 'x', 0, edit('a'))), /2 unificação/);
  assert.match(resumoDaVersao(z('x', 'x', 0, imp())), /mapa\.geojson.*ZONA/);
});

test('nomeBase tira os sufixos empilhados', () => {
  assert.equal(nomeBase('Zoneamento 1 — Suavização leve — Ajuste manual'), 'Zoneamento 1');
  assert.equal(nomeBase('Mapa do cliente — V1 Importada'), 'Mapa do cliente');
  assert.equal(nomeBase('Zoneamento 2'), 'Zoneamento 2');
});

test('nomeCurto mostra o que ESTA versão fez, não a pilha inteira', () => {
  assert.equal(nomeCurto('Mapa 1 — Suavização leve', 'Mapa 1'), 'Suavização leve');
  assert.equal(nomeCurto('Mapa 1 — V1 Importada — Suavização moderada — Ajuste manual', 'Mapa 1'), 'Ajuste manual');
  assert.equal(nomeCurto('Mapa 1', 'Mapa 1'), '', 'sem sobra → a linha usa o rótulo');
  assert.equal(nomeCurto('Outro mapa', 'Mapa 1'), 'Outro mapa', 'nome de fora não é mutilado');
  assert.equal(nomeCurto('Mapa 1 — plantio 2026', 'Mapa 1'), 'plantio 2026', 'nome dado à mão sobrevive');
});

test('nome da restauração nunca sobrescreve outro', () => {
  const usados = ['X — Restaurada da V2'];
  assert.equal(nomeVersaoRestaurada('X', 2, usados), 'X — Restaurada da V2 (2)');
  assert.equal(nomeVersaoRestaurada('X', 3, usados), 'X — Restaurada da V3');
});
