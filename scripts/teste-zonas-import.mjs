// Detecção/mapeamento do campo de classe na importação de zonas.
//
// O bug que motivou o módulo: arquivo com classe NUMÉRICA (1..5 — o que sai do
// script de taxa variável do QGIS e da maioria dos fornecedores) não era
// reconhecido; todos os polígonos caíam na mesma classe e o zoneamento entrava
// na plataforma como "1 zona · N polígonos · Único", inútil para prescrição.
//
// Rodar: npm run teste:zonas-import

import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatosClasse, mapearValoresParaClasses, aplicarMapaClasses } from '../src/lib/zonasImport.ts';

const fs = (props) => props.map(p => ({ properties: p }));

test('classe NUMÉRICA 1..5 é reconhecida como candidata (o bug original)', () => {
  const feats = fs([{ classe: 1 }, { classe: 2 }, { classe: 3 }, { classe: 4 }, { classe: 5 }]);
  const c = candidatosClasse(feats);
  assert.ok(c.length > 0, 'não pode voltar vazio — era isso que zerava as zonas');
  assert.equal(c[0].campo, 'classe');
  assert.equal(c[0].numerico, true);
  assert.equal(c[0].valores.length, 5);
});

test('classe TEXTUAL continua sendo reconhecida e ganha do resto', () => {
  const feats = fs([
    { MANEJO: 'Alta', outro: 7 }, { MANEJO: 'Média', outro: 8 }, { MANEJO: 'Baixa', outro: 9 },
  ]);
  assert.equal(candidatosClasse(feats)[0].campo, 'MANEJO');
});

test('A CLASSE ESCRITA MANDA: texto vence número mesmo com poucos polígonos', () => {
  // Regressão: com 3 polígonos, o campo numérico "zona" (nome plausível)
  // vencia o campo textual "descricao" e a classificação escrita era ignorada.
  const feats = fs([
    { zona: 1, descricao: 'Alta' }, { zona: 2, descricao: 'Média' }, { zona: 3, descricao: 'Baixa' },
  ]);
  assert.equal(candidatosClasse(feats)[0].campo, 'descricao');
});

test('texto vence número mesmo quando o numérico tem nome melhor', () => {
  const feats = fs([
    { classe: 10, obs: 'BAIXA' }, { classe: 20, obs: 'ALTA' },
  ]);
  assert.equal(candidatosClasse(feats)[0].campo, 'obs');
});

test('texto parcial (metade reconhecida) ainda vence o numérico', () => {
  const feats = fs([
    { zona: 1, txt: 'Alta' }, { zona: 2, txt: 'Baixa' }, { zona: 3, txt: 'XYZ' }, { zona: 4, txt: 'QRS' },
  ]);
  assert.equal(candidatosClasse(feats)[0].campo, 'txt');
});

test('sem nenhum texto reconhecido, o numérico assume', () => {
  const feats = fs([{ zona: 1, cod2: 'AA' }, { zona: 2, cod2: 'BB' }]);
  assert.equal(candidatosClasse(feats)[0].campo, 'zona');
});

test('campo de ID não vence o campo de classe', () => {
  // 5 polígonos com id 1..5 e zona 1..5: sem o desconto, o id empataria.
  const feats = fs([
    { id: 1, zona: 3 }, { id: 2, zona: 1 }, { id: 3, zona: 2 }, { id: 4, zona: 3 }, { id: 5, zona: 1 },
  ]);
  assert.equal(candidatosClasse(feats)[0].campo, 'zona');
});

test('campo com valores demais não é classe (é identificador)', () => {
  const feats = Array.from({ length: 30 }, (_, i) => ({ properties: { cod: `X${i}`, zona: (i % 3) + 1 } }));
  const c = candidatosClasse(feats);
  assert.ok(!c.some(x => x.campo === 'cod'), '30 valores distintos não é classe');
  assert.equal(c[0].campo, 'zona');
});

test('campo com valor único não é classe (não separa nada)', () => {
  const feats = fs([{ tudo: 'A', zona: 1 }, { tudo: 'A', zona: 2 }]);
  const c = candidatosClasse(feats);
  assert.ok(!c.some(x => x.campo === 'tudo'));
});

test('campo com buracos perde para o campo completo', () => {
  const feats = fs([
    { furado: 'Alta', zona: 1 }, { zona: 2 }, { zona: 3 }, { zona: 1 },
  ]);
  assert.equal(candidatosClasse(feats)[0].campo, 'zona');
});

test('arquivo SEM nenhum atributo devolve lista vazia (e a UI pede o campo)', () => {
  assert.deepEqual(candidatosClasse(fs([{}, {}])), []);
});

test('mapa numérico com 1 = PIOR (convenção do QGIS)', () => {
  const m = mapearValoresParaClasses(['1', '2', '3', '4', '5'], { menorEhPior: true });
  assert.equal(m['1'], 'Baixa');
  assert.equal(m['3'], 'Média');
  assert.equal(m['5'], 'Alta');
});

test('mapa numérico com 1 = MELHOR (convenção de ranking) — inverte tudo', () => {
  const m = mapearValoresParaClasses(['1', '2', '3', '4', '5'], { menorEhPior: false });
  assert.equal(m['1'], 'Alta');
  assert.equal(m['5'], 'Baixa');
});

test('3 classes numéricas usam os rótulos de 3', () => {
  const m = mapearValoresParaClasses(['1', '2', '3'], { menorEhPior: true });
  assert.deepEqual([m['1'], m['2'], m['3']], ['Baixa', 'Média', 'Alta']);
});

test('mais de 5 classes numéricas caem em "Nível N" sem quebrar', () => {
  const m = mapearValoresParaClasses(['1', '2', '3', '4', '5', '6'], { menorEhPior: true });
  assert.equal(Object.keys(m).length, 6);
  assert.ok(Object.values(m).every(v => typeof v === 'string' && v.length > 0));
});

test('numérico fora de ordem no arquivo é ORDENADO antes de rotular', () => {
  const m = mapearValoresParaClasses(['30', '10', '20'], { menorEhPior: true });
  assert.equal(m['10'], 'Baixa');
  assert.equal(m['20'], 'Média');
  assert.equal(m['30'], 'Alta');
});

test('texto passa pelo semáforo, ignorando a direção numérica', () => {
  const m = mapearValoresParaClasses(['ALTA', 'media baixa'], { menorEhPior: true });
  assert.equal(m['ALTA'], 'Alta');
  assert.equal(m['media baixa'], 'Média-baixa');
});

test('aplicar o mapa grava a classe em cada polígono', () => {
  const feats = fs([{ z: 1 }, { z: 5 }, { z: 5 }]);
  const mapa = mapearValoresParaClasses(['1', '5'], { menorEhPior: true });
  const r = aplicarMapaClasses(feats, 'z', mapa);
  assert.deepEqual(r.map(x => x.classe), ['Baixa', 'Alta', 'Alta']);
});

test('valor ausente não inventa classe', () => {
  const r = aplicarMapaClasses(fs([{}]), 'z', { '1': 'Alta' });
  assert.equal(r[0].classe, '');
});

test('CASO REAL: 5 polígonos do script do QGIS viram 5 classes, não "Único"', () => {
  const feats = fs([{ classe: 1 }, { classe: 2 }, { classe: 3 }, { classe: 4 }, { classe: 5 }]);
  const c = candidatosClasse(feats)[0];
  const mapa = mapearValoresParaClasses(c.valores, { menorEhPior: true });
  const classes = new Set(aplicarMapaClasses(feats, c.campo, mapa).map(x => x.classe));
  assert.equal(classes.size, 5, 'antes disto o resultado era 1 classe só');
});
