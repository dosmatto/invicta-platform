// RECOMENDAÇÃO POR ZONA — um valor único por zona. Roda: npm run teste:dosezona
//
// O que este arquivo protege: o pedido do campo é que a recomendação em cima de
// zonas de manejo saia como UMA taxa por zona, não como um mosaico de 20 m. A
// taxa tem de ser EXATAMENTE a que a equação deu para aquela zona — se aqui
// entrar uma média mal feita, a prescrição vai para a máquina com o número
// errado e ninguém percebe olhando o mapa.

import assert from 'node:assert/strict';
import { dosesDasZonas, decidirPorZona } from '../src/lib/recomendacao/dosePorZona.ts';
import { dosesDiretasPorZona, nutrientesDaEquacao } from '../src/lib/recomendacao/doseZonaDireta.ts';
import { rasterizarZonasDose } from '../src/lib/recomendacao/zonasGrid.ts';
import { decodeGrid } from '../src/lib/fertilidade.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const quadrado = (x0, x1, y0 = -25, y1 = -24.99) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const TALHAO = quadrado(-50, -49.99);
// Duas zonas coladas, metade do talhão cada.
const ZONAS = [
  { id: '01', rotulo: '1', geometry: quadrado(-50, -49.995) },
  { id: '02', rotulo: '2', geometry: quadrado(-49.995, -49.99) },
];
// O mesmo, como valor de fertilidade, para gerar um mapa chapado de verdade.
const zv = (v1, v2) => [
  { id: '01', valor: v1, geometry: ZONAS[0].geometry },
  { id: '02', valor: v2, geometry: ZONAS[1].geometry },
];

const gridDe = (resp) => {
  const { valores } = decodeGrid(resp.grid);
  return [valores, resp.grid.shape, resp.bounds];
};

console.log('\nA taxa de cada zona\n');

t('cada zona sai com UM valor, e é o valor dela', () => {
  const [v, shape, bounds] = gridDe(rasterizarZonasDose(zv(120, 380), TALHAO, 20));
  const ds = dosesDasZonas(ZONAS, v, shape, bounds).zonas;
  assert.equal(ds.length, 2);
  assert.equal(ds[0].dose, 120, `zona 1 deveria ser 120, veio ${ds[0].dose}`);
  assert.equal(ds[1].dose, 380, `zona 2 deveria ser 380, veio ${ds[1].dose}`);
});

t('a zona é marcada como CHAPADA (é o esperado no modo zona)', () => {
  const [v, shape, bounds] = gridDe(rasterizarZonasDose(zv(120, 380), TALHAO, 20));
  const ds = dosesDasZonas(ZONAS, v, shape, bounds).zonas;
  assert.ok(ds.every(d => d.chapada), 'nenhuma zona podia variar por dentro');
});

t('a taxa é EXATA, não uma média que o float arredonda', () => {
  // 333.33 não é representável em float32; se devolvêssemos soma/n o valor
  // andaria no último decimal e a prescrição sairia diferente do mapa.
  const [v, shape, bounds] = gridDe(rasterizarZonasDose(zv(333.33, 333.33), TALHAO, 20));
  const ds = dosesDasZonas(ZONAS, v, shape, bounds).zonas;
  const doGrid = [...v].find(Number.isFinite);
  assert.equal(ds[0].dose, doGrid, 'a taxa tem de ser o número que está no mapa');
});

t('toda célula da zona entrou na conta (nenhuma zona sai vazia)', () => {
  const [v, shape, bounds] = gridDe(rasterizarZonasDose(zv(10, 20), TALHAO, 20));
  const ds = dosesDasZonas(ZONAS, v, shape, bounds).zonas;
  for (const d of ds) assert.ok(d.celulas > 0, `zona ${d.rotulo} sem célula nenhuma`);
});

console.log('\nZona de VÁRIAS MANCHAS\n');

t('duas manchas da MESMA zona viram UMA taxa só', () => {
  // "01" e "01_2" são o mesmo número de zona no mapa — a prescrição não pode
  // mandar taxas diferentes para pedaços que o agrônomo tratou como uma zona.
  const manchas = [
    { id: '01', rotulo: '1', geometry: quadrado(-50, -49.997) },
    { id: '02', rotulo: '2', geometry: quadrado(-49.997, -49.993) },
    { id: '01_2', rotulo: '1', geometry: quadrado(-49.993, -49.99) },
  ];
  const valores = [
    { id: '01', valor: 100, geometry: manchas[0].geometry },
    { id: '02', valor: 200, geometry: manchas[1].geometry },
    { id: '01_2', valor: 100, geometry: manchas[2].geometry },
  ];
  const [v, shape, bounds] = gridDe(rasterizarZonasDose(valores, TALHAO, 20));
  const ds = dosesDasZonas(manchas, v, shape, bounds).zonas;
  assert.equal(ds.length, 2, 'as duas manchas da zona 1 têm de ser UMA entrada');
  const z1 = ds.find(d => d.rotulo === '1');
  assert.equal(z1.dose, 100);
  assert.equal(z1.geometry.type, 'MultiPolygon', 'a zona partida sai como MultiPolygon');
  assert.equal(z1.geometry.coordinates.length, 2, 'com as duas manchas');
});

console.log('\nQuando a dose NÃO é chapada (equação com atributo interpolado)\n');

t('dose que varia dentro da zona: média + aviso `chapada: false`', () => {
  // Monta à mão um grid que varia dentro da zona 1.
  const rows = 4, cols = 4;
  const v = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    v[r * cols + c] = c < 2 ? (r < 2 ? 100 : 200) : 50;   // zona 1 varia, zona 2 não
  }
  const bounds = [-50, -25, -49.99, -24.99];
  const ds = dosesDasZonas(ZONAS, v, [rows, cols], bounds).zonas;
  const z1 = ds.find(d => d.rotulo === '1');
  const z2 = ds.find(d => d.rotulo === '2');
  assert.equal(z1.chapada, false, 'tem de avisar que a zona não é uniforme');
  assert.ok(z1.dose > 100 && z1.dose < 200, `a média devia ficar entre 100 e 200, veio ${z1.dose}`);
  assert.equal(z2.chapada, true);
});

console.log('\nCasos de borda\n');

t('zona fora do mapa: dose NaN, sem quebrar', () => {
  const [v, shape, bounds] = gridDe(rasterizarZonasDose(zv(10, 20), TALHAO, 20));
  const fora = [{ id: 'X', rotulo: '9', geometry: quadrado(-40, -39.99, -20, -19.99) }];
  const ds = dosesDasZonas(fora, v, shape, bounds).zonas;
  assert.equal(ds.length, 1);
  assert.ok(Number.isNaN(ds[0].dose));
  assert.equal(ds[0].celulas, 0);
});

t('grid vazio/inválido devolve uma entrada por zona, com NaN', () => {
  const ds = dosesDasZonas(ZONAS, new Float32Array(0), [0, 0], [0, 0, 0, 0]).zonas;
  assert.equal(ds.length, 2);
  assert.ok(ds.every(d => Number.isNaN(d.dose)));
});

t('a ordem das zonas na saída é a ordem que entrou', () => {
  const [v, shape, bounds] = gridDe(rasterizarZonasDose(zv(10, 20), TALHAO, 20));
  const ds = dosesDasZonas(ZONAS, v, shape, bounds).zonas;
  assert.deepEqual(ds.map(d => d.rotulo), ['1', '2']);
});

console.log('\nA DECISÃO: este arquivo pode sair por zona?\n');
// Reprovar por padrão. O arquivo vai para o monitor do trator e aplica insumo:
// entre errar e não gerar, não gerar é o barato.

const ZONA_ZONA = ['zona', 'zona'];
const leitura = (zonas, resp, pol) => {
  const [v, shape, bounds] = gridDe(resp);
  return dosesDasZonas(zonas, v, shape, bounds, pol);
};

t('caminho feliz: fertilidade por zona, zonas cobrindo o talhão → aprova', () => {
  const d = decidirPorZona(ZONA_ZONA, leitura(ZONAS, rasterizarZonasDose(zv(120, 380), TALHAO, 20), TALHAO));
  assert.equal(d.porZona, true, d.motivo);
  assert.equal(d.zonas.length, 2);
});

t('REPROVA se a dose não veio do modo zona (mesmo saindo uniforme)', () => {
  // O caso que a revisão reproduziu: mapa INTERPOLADO com a dose saturada no
  // teto sai uniforme. A taxa até estaria certa, mas a área do arquivo passaria
  // a ser a do zoneamento, e uma taxa fixa seria entregue como prescrição por
  // zona. O método do atributo é o sinal que não deixa isso passar.
  const l = leitura(ZONAS, rasterizarZonasDose(zv(2000, 2000), TALHAO, 20), TALHAO);
  for (const m of [['krige', 'krige'], ['zona', 'krige'], [], undefined]) {
    const d = decidirPorZona(m, l);
    assert.equal(d.porZona, false, `${JSON.stringify(m)} não podia aprovar`);
  }
});

t('REPROVA se alguma zona ficou sem dose (a máquina passaria em branco)', () => {
  // Zona 3 do snapshot cai fora do mapa da dose.
  const comFantasma = [...ZONAS, { id: '03', rotulo: '3', geometry: quadrado(-40, -39.99, -20, -19.99) }];
  const d = decidirPorZona(['zona', 'zona'], leitura(comFantasma, rasterizarZonasDose(zv(100, 300), TALHAO, 20), TALHAO));
  assert.equal(d.porZona, false);
  assert.match(d.motivo, /sem dose na zona 3/);
});

t('REPROVA se a dose varia dentro de uma zona', () => {
  const rows = 4, cols = 4;
  const v = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) v[r * cols + c] = c < 2 ? (r < 2 ? 100 : 200) : 50;
  const l = dosesDasZonas(ZONAS, v, [rows, cols], [-50, -25, -49.99, -24.99], TALHAO);
  const d = decidirPorZona(ZONA_ZONA, l);
  assert.equal(d.porZona, false);
  assert.match(d.motivo, /varia dentro/);
});

t('REPROVA se o zoneamento cobre só parte do talhão', () => {
  // Zoneamento de meio talhão: a outra metade sairia sem prescrição nenhuma.
  const meio = [{ id: '01', rotulo: '1', geometry: quadrado(-50, -49.995) }];
  const zvMeio = [{ id: '01', valor: 100, geometry: meio[0].geometry }];
  // O mapa da dose cobre o talhão TODO (a coroa espalha o valor do vizinho).
  const d = decidirPorZona(['zona'], leitura(meio, rasterizarZonasDose(zvMeio, TALHAO, 20), TALHAO));
  assert.equal(d.porZona, false, 'meio talhão sem zona tinha de reprovar');
  assert.match(d.motivo, /cobre só/);
});

t('sem zoneamento nenhum → reprova com motivo claro', () => {
  const d = decidirPorZona(ZONA_ZONA, dosesDasZonas([], new Float32Array(4), [2, 2], [-50, -25, -49.99, -24.99], TALHAO));
  assert.equal(d.porZona, false);
  assert.match(d.motivo, /não tem zoneamento/);
});

t('a franja da divisa (menos de 2%) NÃO reprova', () => {
  // As zonas quase nunca encostam com exatidão no contorno; se qualquer sobra
  // reprovasse, o caminho por zona nunca sairia na prática.
  const l = leitura(ZONAS, rasterizarZonasDose(zv(120, 380), TALHAO, 20), TALHAO);
  assert.ok(l.celulasForaDeZona / Math.max(1, l.celulasNoTalhao) <= 0.02,
    `franja de ${l.celulasForaDeZona}/${l.celulasNoTalhao} passou do tolerado`);
});

console.log('\nDOSE DIRETA DA EQUAÇÃO (sem passar por mapa nenhum)\n');
// "o valor que deve ser atrelado a cada zona é o valor REAL dele utilizando a
// equação diretamente, nada de interpolar e fazer média para o ponto."

const EQ_CALC = {
  // Necessidade de calagem clássica: NC = (V2 - V1) * CTC / 100  (t/ha)
  script: '(70 - V) * CTC / 100',
  constantes: [], naoNegativo: true, doseMinimaViavel: 0, abaixoMinimo: 'zero', doseMaxima: 0,
};

t('a taxa é a conta da equação com o valor do laudo daquela zona', () => {
  const valores = [
    { id: '01', porNutriente: { v: 45, ctc: 8 } },
    { id: '02', porNutriente: { v: 60, ctc: 10 } },
  ];
  const { doses } = dosesDiretasPorZona(valores, EQ_CALC);
  // conta na mão: (70-45)*8/100 = 2.0 ; (70-60)*10/100 = 1.0
  assert.equal(doses.find(d => d.id === '01').dose, 2, 'zona 1: (70-45)*8/100');
  assert.equal(doses.find(d => d.id === '02').dose, 1, 'zona 2: (70-60)*10/100');
});

t('o decimal sai EXATO — não passa por float32 de raster', () => {
  // 0.3675 sobrevive à conta direta; via grid float32 voltaria 0.36750000715…
  const { doses } = dosesDiretasPorZona([{ id: '01', porNutriente: { v: 65.1, ctc: 7.5 } }], EQ_CALC);
  assert.equal(doses[0].dose, (70 - 65.1) * 7.5 / 100);
});

t('zona sem o valor de um atributo fica SEM dose, com o motivo', () => {
  const { doses } = dosesDiretasPorZona([
    { id: '01', porNutriente: { v: 45, ctc: 8 } },
    { id: '02', porNutriente: { v: 50 } },            // faltou CTC no laudo
  ], EQ_CALC);
  assert.equal(doses.find(d => d.id === '01').dose, 2);
  const z2 = doses.find(d => d.id === '02');
  assert.ok(Number.isNaN(z2.dose), 'não pode inventar taxa');
  assert.match(z2.erro, /ctc/i);
});

t('cada zona é independente: erro numa não contamina as outras', () => {
  const { doses } = dosesDiretasPorZona([
    { id: '01', porNutriente: {} },
    { id: '02', porNutriente: { v: 40, ctc: 12 } },
  ], EQ_CALC);
  assert.ok(Number.isNaN(doses[0].dose));
  assert.equal(doses[1].dose, (70 - 40) * 12 / 100);
});

t('a equação diz quais nutrientes buscar no laudo', () => {
  assert.deepEqual(nutrientesDaEquacao(EQ_CALC.script, []).sort(), ['ctc', 'v']);
});

t('piso/teto da equação são respeitados (mesmo motor da Recomendação)', () => {
  const comTeto = { ...EQ_CALC, doseMaxima: 1.5 };
  const { doses } = dosesDiretasPorZona([{ id: '01', porNutriente: { v: 20, ctc: 10 } }], comTeto);
  assert.equal(doses[0].dose, 1.5, '(70-20)*10/100 = 5 → grampeado no teto 1,5');
});

t('naoNegativo: solo já corrigido não vira dose negativa', () => {
  const { doses } = dosesDiretasPorZona([{ id: '01', porNutriente: { v: 85, ctc: 9 } }], EQ_CALC);
  assert.equal(doses[0].dose, 0, 'V acima do alvo → 0, não negativo');
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
