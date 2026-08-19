// Numeração dos pontos da grade de ZONAS — roda: npm run teste:gradezonas
//
// O que este arquivo protege é o que o campo reclamou: a grade salva ia para o
// app numerada de 1 a 50 corrido, e o operador não sabia em que zona estava.
// O padrão é o da Inceres: `zona-sequencial` (1-1, 1-2, 2-1).
//
// E protege a regra que NÃO pode quebrar junto: o rótulo é TEXTO e nunca entra
// no campo numérico da amostra — o parser do laudo tira os não-dígitos (lab.ts),
// então "1-1" viraria 11 e "1-12"/"11-2" colidiriam em 112.

import assert from 'node:assert/strict';
import {
  numeroDaZona, numerosDasZonas, rotuloPonto, numerarPontosZonas, rotuloDoPonto, amostrasDaGrade,
  renumerarPontosZonas,
} from '../src/lib/gradeZonas.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const pt = (n) => Array.from({ length: n }, (_, i) => ({ lng: -50 + i / 1000, lat: -25 + i / 1000 }));
// Cenário do relato: 4 zonas, 50 pontos (8/11/14/17), amostra composta.
const ZONAS = [
  { id: '01', pts: pt(8) },
  { id: '02', pts: pt(11) },
  { id: '03', pts: pt(14) },
  { id: '04', pts: pt(17) },
];
const PROFS = ['00-20', '20-40'];

console.log('\nNumeração zona-sequencial\n');

t('cada ponto sai como zona-sequencial (1-1, 1-2, … 2-1)', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  assert.equal(p.length, 50);
  assert.equal(p[0].rotulo, '1-1');
  assert.equal(p[7].rotulo, '1-8');      // última da zona 1
  assert.equal(p[8].rotulo, '2-1');      // o sequencial REINICIA na zona nova
  assert.equal(p[18].rotulo, '2-11');    // 8 + 11 → índice 18 é a última da zona 2
  assert.equal(p[19].rotulo, '3-1');
  assert.equal(p[49].rotulo, '4-17');    // última de todas
});

t('o sequencial reinicia em CADA zona (nenhum 1..50 corrido)', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  for (const z of ZONAS) {
    const daZona = p.filter(x => x.zona === z.id);
    assert.equal(daZona.length, z.pts.length);
    assert.deepEqual(daZona.map(x => x.seqZona), daZona.map((_, i) => i + 1));
  }
});

t('`ordem` continua o índice global 0-based (chave das coletas já feitas)', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  assert.deepEqual(p.map(x => x.ordem), p.map((_, i) => i));
});

t('id de zona sem dígito cai na ordem (não quebra)', () => {
  const p = numerarPontosZonas([{ id: 'Alta', pts: pt(2) }, { id: 'Z7', pts: pt(1) }], 'A', PROFS);
  assert.equal(p[0].rotulo, '1-1');
  assert.equal(p[2].rotulo, '7-1');
  assert.equal(numeroDaZona('01', 0), 1);
  assert.equal(numeroDaZona('', 3), 4);
  assert.equal(rotuloPonto(2, 3), '2-3');
});

console.log('\nZona de VÁRIAS MANCHAS e rótulos que colidiriam\n');

t('nenhum rótulo se repete, aconteça o que acontecer com os ids', () => {
  const casos = [
    [['1', '01'], 'zero à esquerda'],
    [['A', '1'], 'sem dígito + com dígito'],
    [['0', '1'], 'zero não é número de zona'],
    [['01', '01'], 'id repetido'],
    [['1.5', '15'], 'pontuação vira o mesmo dígito'],
    [['01', '02', '03', '04'], 'caso normal'],
  ];
  for (const [ids, nome] of casos) {
    const zs = ids.map(id => ({ id, pts: pt(3) }));
    for (const modelo of ['A', 'B']) {
      const rots = numerarPontosZonas(zs, modelo, PROFS).map(x => x.rotulo);
      assert.equal(new Set(rots).size, rots.length, `${nome} (${modelo}): rótulo repetido em ${rots}`);
    }
  }
});

t('COMPOSTA: zonas distintas nunca dividem o mesmo nº de amostra', () => {
  const zs = [{ id: '1', pts: pt(2) }, { id: '01', pts: pt(2) }, { id: 'A', pts: pt(2) }];
  const p = numerarPontosZonas(zs, 'A', PROFS);
  const porZona = new Map();
  for (const x of p) porZona.set(x.zona, new Set([...(porZona.get(x.zona) ?? []), x.numero]));
  const numeros = [...porZona.values()].map(s => [...s][0]);
  assert.equal(new Set(numeros).size, numeros.length, `zonas dividindo o mesmo saco: ${numeros}`);
});

t('uma zona com 2 manchas é UMA zona (o sequencial corre pelas duas)', () => {
  // O agrupamento é do chamador (SimuladorZonas junta "01" e "01_2" pelo número
  // OFICIAL da zona); aqui garantimos o efeito: 1 entrada = 1 zona = 1 saco.
  const p = numerarPontosZonas([{ id: '01', pts: pt(5) }, { id: '02', pts: pt(3) }], 'A', PROFS);
  assert.deepEqual(p.filter(x => x.zona === '01').map(x => x.rotulo), ['1-1', '1-2', '1-3', '1-4', '1-5']);
  assert.equal(amostrasDaGrade(p, 'A').length, 2, 'duas manchas da mesma zona têm de ser 1 saco');
});

t('o número da zona sai do rótulo OFICIAL, nunca de um id sufixado', () => {
  // "01_2" é identidade de POLÍGONO. Se ele chegasse aqui viraria zona 12 —
  // um número que não existe no talhão. numeroDaZona é alimentado pelo oficial.
  assert.equal(numeroDaZona('01', 0), 1);
  assert.equal(numeroDaZona('01_2', 0), 12, 'confirma o perigo: por isso o chamador agrupa antes');
  assert.deepEqual(numerosDasZonas(['01', '01', '02']), [1, 2, 3], 'colisão resolvida sem repetir');
});

console.log('\nO que o laboratório recebe (numero) x o que o campo vê (rotulo)\n');

t('COMPOSTA: todo ponto da zona leva o nº da ZONA como amostra', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  assert.deepEqual([...new Set(p.map(x => x.numero))], [1, 2, 3, 4]);
  for (const x of p) assert.equal(x.numero, Number(x.zona));
});

t('INDIVIDUAL: cada ponto é uma amostra, numerada 1..N', () => {
  const p = numerarPontosZonas(ZONAS, 'B', PROFS);
  assert.deepEqual(p.map(x => x.numero), p.map((_, i) => i + 1));
  assert.equal(p[8].rotulo, '2-1');   // o rótulo segue por zona
});

t('o rótulo NUNCA vai no campo numérico (senão o laudo lê 1-1 como 11)', () => {
  for (const modelo of ['A', 'B']) {
    for (const x of numerarPontosZonas(ZONAS, modelo, PROFS)) {
      assert.equal(typeof x.numero, 'number', 'numero tem de ser NÚMERO');
      assert.ok(Number.isInteger(x.numero) && x.numero > 0, `numero inválido: ${x.numero}`);
      assert.equal(typeof x.rotulo, 'string');
    }
  }
});

t('zona com 12+ pontos não colide com outra zona (1-12 ≠ 11-2)', () => {
  const p = numerarPontosZonas([{ id: '1', pts: pt(12) }, { id: '11', pts: pt(2) }], 'B', PROFS);
  const rots = p.map(x => x.rotulo);
  assert.equal(new Set(rots).size, rots.length, 'rótulos repetidos');
  assert.ok(rots.includes('1-12') && rots.includes('11-2'));
});

console.log('\nEtiquetas (o saco que chega ao laboratório)\n');

t('COMPOSTA: uma etiqueta por ZONA — 01, 02, 03, 04', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  const a = amostrasDaGrade(p, 'A');
  assert.equal(a.length, 4, `esperava 4 sacos (um por zona), veio ${a.length}`);
  assert.deepEqual(a.map(x => x.rotulo), ['01', '02', '03', '04']);
  assert.deepEqual(a.map(x => x.numero), [1, 2, 3, 4]);
});

t('INDIVIDUAL: uma etiqueta por ponto, com o número que o app mostra', () => {
  const p = numerarPontosZonas(ZONAS, 'B', PROFS);
  const a = amostrasDaGrade(p, 'B');
  assert.equal(a.length, 50);
  assert.equal(a[0].rotulo, '1-1');
  assert.equal(a[8].rotulo, '2-1');
});

console.log('\nO que o app de campo mostra\n');

t('grade de zonas mostra o rótulo; grade comum segue no número', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS)[8];
  assert.equal(rotuloDoPonto(p), '2-1');
  assert.equal(rotuloDoPonto({ ordem: 6 }), '7');                  // grade antiga, sem número
  assert.equal(rotuloDoPonto({ ordem: 6, numero: 42 }), '42');     // grade importada
});

console.log('\nEdição manual: adicionar e remover pontos (renumerarPontosZonas)\n');

t('remover fecha o buraco do sequencial DENTRO da zona', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  // Remove o 2º ponto da zona 1 (rótulo 1-2).
  const sobra = p.filter(x => x.rotulo !== '1-2');
  const re = renumerarPontosZonas(sobra, 'A', PROFS);
  const z1 = re.filter(x => x.zona === '01');
  assert.equal(z1.length, 7, 'zona 1 ficou com 7 pontos');
  assert.deepEqual(z1.map(x => x.rotulo), ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7'], 'sem buraco');
  assert.equal(re.length, 49);
});

t('remover NÃO renumera as outras zonas (2-1 continua 2-1)', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  const re = renumerarPontosZonas(p.filter(x => x.rotulo !== '1-3'), 'A', PROFS);
  assert.equal(re.filter(x => x.zona === '02')[0].rotulo, '2-1');
  assert.equal(re.filter(x => x.zona === '04').at(-1).rotulo, '4-17');
});

t('adicionar entra como o ÚLTIMO ponto da sua zona', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  // Chega um ponto novo na zona 2 (sem seqZona ainda) — appendado ao fim da lista.
  const comNovo = [...p, { lng: -49.9, lat: -24.9, zona: '02' }];
  const re = renumerarPontosZonas(comNovo, 'A', PROFS);
  const z2 = re.filter(x => x.zona === '02');
  assert.equal(z2.length, 12, 'zona 2 passou de 11 para 12');
  assert.equal(z2.at(-1).rotulo, '2-12', 'o novo é o último da zona');
  assert.equal(re.length, 51);
});

t('COMPOSTA: ponto novo herda o nº de amostra da sua zona', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  const re = renumerarPontosZonas([...p, { lng: -49.9, lat: -24.9, zona: '03' }], 'A', PROFS);
  const novo = re.filter(x => x.zona === '03').at(-1);
  assert.equal(novo.numero, 3, 'o saco é o da zona 3');
  assert.equal(amostrasDaGrade(re, 'A').length, 4, 'continua 4 sacos');
});

t('INDIVIDUAL: remover renumera as amostras 1..N sem buraco', () => {
  const p = numerarPontosZonas(ZONAS, 'B', PROFS);
  const re = renumerarPontosZonas(p.filter(x => x.rotulo !== '1-2'), 'B', PROFS);
  assert.deepEqual(re.map(x => x.numero), re.map((_, i) => i + 1));
  assert.equal(re.length, 49);
});

t('`ordem` fecha 0..N-1 após editar (chave das coletas, sem buraco)', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  const re = renumerarPontosZonas(p.filter(x => x.rotulo !== '3-5'), 'A', PROFS);
  assert.deepEqual(re.map(x => x.ordem), re.map((_, i) => i));
});

t('PRESERVA a profundidade de cada ponto (não zera ao renumerar)', () => {
  // Regressão: editar uma grade salva SEM o Padrão selecionado passava profs=[]
  // e o renumerar zerava `profundidades` de todos → app de campo mostrava 0.
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  // Simula: cada ponto guarda sua profundidade; o "padrão" chega VAZIO.
  const re = renumerarPontosZonas(p.filter(x => x.rotulo !== '1-2'), 'A', []);
  for (const x of re) {
    assert.deepEqual(x.profundidades, PROFS, `perdeu a profundidade: ${JSON.stringify(x.profundidades)}`);
    assert.equal(x.profs, PROFS.length);
  }
});

t('ponto NOVO com profundidade herdada mantém a dele (não o padrão vazio)', () => {
  const p = numerarPontosZonas(ZONAS, 'A', PROFS);
  const novo = { lng: -49.9, lat: -24.9, zona: '02', profundidades: ['00-20'] };
  const re = renumerarPontosZonas([...p, novo], 'A', []);
  const z2ultimo = re.filter(x => x.zona === '02').at(-1);
  assert.deepEqual(z2ultimo.profundidades, ['00-20']);
  // e os antigos seguem com a sua
  assert.deepEqual(re.filter(x => x.zona === '01')[0].profundidades, PROFS);
});

t('ponto sem zona não some da lista (grade antiga / add fora de zona)', () => {
  const re = renumerarPontosZonas(
    [{ lng: -50, lat: -25, zona: '01' }, { lng: -49, lat: -24, zona: undefined }], 'A', PROFS);
  assert.equal(re.length, 2, 'os dois continuam');
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
