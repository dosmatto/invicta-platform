// Conversão "Transformar em Zoneamento Nativo": FeatureCollection importada →
// modelo interno da plataforma (o mesmo que sai do zoneamento GERADO).
//
// O que estes testes travam: o contrato de saída. Se `potencialRank`, `classe`,
// `cor`, `id` ou `areaHa` mudarem de forma, o editor manual, a suavização, a
// exportação e a prescrição param de enxergar a zona importada — que é
// exatamente a dor que o Zoneamento Nativo veio resolver.
//
// Rodar: npm run teste:nativo

import test from 'node:test';
import assert from 'node:assert/strict';
import { paraZoneamentoNativo, ordenarClasses } from '../src/lib/meap/nativo.ts';

// ~1,2 ha por quadrado de 0,001° perto do trópico — área exata não importa aqui,
// só ser > 0 e comparável entre polígonos.
const D = 0.001;
const quad = (col, lin) => ({
  type: 'Polygon',
  coordinates: [[
    [-47.9 + col * D, -21.2 + lin * D],
    [-47.9 + (col + 1) * D, -21.2 + lin * D],
    [-47.9 + (col + 1) * D, -21.2 + (lin + 1) * D],
    [-47.9 + col * D, -21.2 + (lin + 1) * D],
    [-47.9 + col * D, -21.2 + lin * D],
  ]],
});
const feat = (props, col = 0, lin = 0) => ({ type: 'Feature', properties: props, geometry: quad(col, lin) });
const fc = (features) => ({ type: 'FeatureCollection', features });

const props = (r) => r.fc.features.map(f => f.properties);

test('padroniza os atributos que as ferramentas exigem', () => {
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'Alta', classeOrigem: '3' }, 0, 0),
    feat({ classe: 'Baixa', classeOrigem: '1' }, 1, 0),
  ]));
  for (const p of props(r)) {
    for (const chave of ['id', 'zona', 'classe', 'cor', 'potencialRank', 'areaHa']) {
      assert.ok(p[chave] !== undefined, `faltou "${chave}" — o editor/exportação leem isso`);
    }
    assert.ok(p.areaHa > 0, 'área tem que ser recalculada, não copiada do arquivo');
  }
});

test('Alta vem antes de Baixa: rank 0 é o MAIOR potencial', () => {
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'Baixa', classeOrigem: '1' }, 0, 0),
    feat({ classe: 'Alta', classeOrigem: '3' }, 1, 0),
    feat({ classe: 'Média', classeOrigem: '2' }, 2, 0),
  ]));
  assert.deepEqual(r.classes.map(c => c.classe), ['Alta', 'Média', 'Baixa']);
  assert.deepEqual(r.classes.map(c => c.rank), [0, 1, 2]);
  assert.deepEqual(r.classes.map(c => c.num), ['01', '02', '03']);
});

test('vários polígonos da mesma classe = UMA zona oficial (não três)', () => {
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'Alta', classeOrigem: '2' }, 0, 0),
    feat({ classe: 'Alta', classeOrigem: '2' }, 1, 0),
    feat({ classe: 'Baixa', classeOrigem: '1' }, 2, 0),
  ]));
  assert.equal(r.classes.length, 2, 'manchas separadas não aumentam o nº de zonas');
  assert.equal(r.nPoligonos, 3);
  assert.equal(r.classes[0].nPolig, 2);
});

test('IDs repetidos no arquivo viram IDs únicos', () => {
  // Caso real: o arquivo numera o ID pela CLASSE, então todas as manchas da
  // zona 2 chegam com id "2". Com id repetido, editar uma some com a outra.
  const r = paraZoneamentoNativo(fc([
    feat({ id: '2', classe: 'Alta', classeOrigem: '2' }, 0, 0),
    feat({ id: '2', classe: 'Alta', classeOrigem: '2' }, 1, 0),
    feat({ id: '2', classe: 'Alta', classeOrigem: '2' }, 2, 0),
  ]));
  const ids = props(r).map(p => p.id);
  assert.equal(new Set(ids).size, 3, `ids duplicados: ${ids.join(', ')}`);
});

test('renomear um valor à mão não reordena o zoneamento', () => {
  // Pedido explícito: arquivo sem nome de classe, o usuário batiza cada valor.
  const entrada = fc([
    feat({ classe: 'Alta', classeOrigem: '3' }, 0, 0),
    feat({ classe: 'Média', classeOrigem: '2' }, 1, 0),
    feat({ classe: 'Baixa', classeOrigem: '1' }, 2, 0),
  ]);
  const r = paraZoneamentoNativo(entrada, {
    nomes: { 3: 'Cabeceira', 2: 'Meio do talhão', 1: 'Baixada' },
    ordemValores: ['3', '2', '1'],
  });
  assert.deepEqual(r.classes.map(c => c.classe), ['Cabeceira', 'Meio do talhão', 'Baixada']);
  assert.deepEqual(r.classes.map(c => c.rank), [0, 1, 2]);
  // sem nome de semáforo, a cor sai da rampa verde→vermelho por posição
  assert.notEqual(r.classes[0].cor, r.classes[2].cor);
});

test('nome livre não pode roubar a cor de outra zona', () => {
  // Achado na bancada: renomear a 4ª zona para "Baixada úmida" fazia o semáforo
  // casar /BAIX/ e devolver o MESMO vermelho de "Baixa" — duas zonas
  // indistinguíveis no mapa. Nome livre no conjunto → rampa para todas.
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'Alta', classeOrigem: '5' }, 0, 0),
    feat({ classe: 'Média-alta', classeOrigem: '4' }, 1, 0),
    feat({ classe: 'Média', classeOrigem: '3' }, 2, 0),
    feat({ classe: 'Média-baixa', classeOrigem: '2' }, 3, 0),
    feat({ classe: 'Baixa', classeOrigem: '1' }, 4, 0),
  ]), { nomes: { 2: 'Baixada úmida' }, ordemValores: ['5', '4', '3', '2', '1'] });
  const cores = r.classes.map(c => c.cor);
  assert.equal(new Set(cores).size, 5, `cores repetidas: ${cores.join(' ')}`);
});

test('a ordem explícita manda mesmo contra o nome (direção invertida)', () => {
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'Alta', classeOrigem: '1' }, 0, 0),
    feat({ classe: 'Baixa', classeOrigem: '5' }, 1, 0),
  ]), { ordemValores: ['5', '1'] });
  assert.equal(r.classes[0].valor, '5', 'quem escolheu a direção foi o usuário');
});

test('REGRESSÃO: classe CRUA ("BAIXA"/"MEDIA") não vira o maior potencial', () => {
  // Achado na bancada: arquivo antigo, colado direto no talhão, chega sem passar
  // pela normalização — a classe vem "BAIXA" em caixa alta e sem acento. Como
  // texto cru não bate com a escala canônica, todas empatavam e a ordem virava a
  // de chegada: "BAIXA" ficava rank 0 (maior potencial) COM COR VERMELHA.
  // Prescrição invertida — aplica mais onde devia aplicar menos.
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'BAIXA' }, 0, 0),
    feat({ classe: 'ALTA' }, 1, 0),
    feat({ classe: 'MEDIA' }, 2, 0),
  ]));
  assert.deepEqual(r.classes.map(c => c.classe), ['Alta', 'Média', 'Baixa']);
  assert.equal(r.classes[0].cor, '#16a34a', 'rank 0 tem que ser o verde');
  assert.equal(r.classes[2].cor, '#dc2626', 'a pior zona é a vermelha');
});

test('feição sem polígono e polígono sem área são descartados e CONTADOS', () => {
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'Alta', classeOrigem: '2' }, 0, 0),
    { type: 'Feature', properties: { classe: 'Alta' }, geometry: { type: 'Point', coordinates: [-47.9, -21.2] } },
    { type: 'Feature', properties: { classe: 'Baixa' }, geometry: { type: 'Polygon', coordinates: [[[-47.9, -21.2], [-47.9, -21.2], [-47.9, -21.2], [-47.9, -21.2]]] } },
  ]));
  assert.equal(r.nPoligonos, 1);
  assert.equal(r.descartados.semGeometria, 1);
  assert.equal(r.descartados.semArea, 1);
});

test('sem classe nenhuma o arquivo ainda entra (uma zona só, não vazio)', () => {
  const r = paraZoneamentoNativo(fc([feat({}, 0, 0), feat({}, 1, 0)]));
  assert.equal(r.nPoligonos, 2);
  assert.equal(r.classes.length, 1);
  assert.equal(r.classes[0].rank, 0);
});

test('área total = soma das zonas', () => {
  const r = paraZoneamentoNativo(fc([
    feat({ classe: 'Alta', classeOrigem: '2' }, 0, 0),
    feat({ classe: 'Baixa', classeOrigem: '1' }, 1, 0),
  ]));
  const soma = r.classes.reduce((s, c) => s + c.areaHa, 0);
  assert.ok(Math.abs(r.areaTotalHa - soma) < 0.02, `${r.areaTotalHa} ≠ ${soma}`);
});

test('"Nível 10" fica depois de "Nível 2" (ordenação numérica, não alfabética)', () => {
  assert.deepEqual(ordenarClasses(['Nível 10', 'Nível 2', 'Nível 1']), ['Nível 1', 'Nível 2', 'Nível 10']);
});

test('nomes livres preservam a ordem de chegada', () => {
  assert.deepEqual(ordenarClasses(['Brejo', 'Cabeceira', 'Areia']), ['Brejo', 'Cabeceira', 'Areia']);
});

test('CASO REAL: 5 classes numéricas do QGIS viram 5 zonas prescritíveis', () => {
  const features = [];
  for (let i = 0; i < 5; i++) {
    features.push(feat({ classe: ['Baixa', 'Média-baixa', 'Média', 'Média-alta', 'Alta'][i], classeOrigem: String(i + 1) }, i, 0));
    features.push(feat({ classe: ['Baixa', 'Média-baixa', 'Média', 'Média-alta', 'Alta'][i], classeOrigem: String(i + 1) }, i, 1));
  }
  const r = paraZoneamentoNativo(fc(features), { ordemValores: ['5', '4', '3', '2', '1'] });
  assert.equal(r.classes.length, 5);
  assert.equal(r.nPoligonos, 10);
  assert.equal(new Set(props(r).map(p => p.id)).size, 10, 'todo polígono precisa de id próprio');
  assert.equal(new Set(r.classes.map(c => c.cor)).size, 5, 'cada zona com sua cor');
});
