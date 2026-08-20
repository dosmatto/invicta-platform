// RECOMENDAÇÃO POR ZONA — O CAMINHO INTEIRO, DE PONTA A PONTA, EM NODE.
//
// Os testes que já existem (teste-dose-zona.mjs, teste-grids-recomendacao.mjs)
// olham uma peça de cada vez. Este aqui monta um talhão parecido com o do campo
// — 96 ha, forma irregular com uma ponta, 8 zonas de manejo, uma delas partida
// em duas manchas — e percorre a MESMA sequência que `calcularDosePorZona`
// (aplicar.ts:299) percorre na tela, conferindo o resultado de CADA etapa.
//
// O que ele protege, em uma frase: que "Recomendação por zona de manejo" saia
// como UMA TAXA POR ZONA, e não como um mosaico interpolado. Se em algum ponto
// da corrente aparecer um valor que não é a taxa de nenhuma zona, é interpolação
// se reintroduzindo — e é isso que manda um número errado para a máquina.
//
// `aplicar.ts` NÃO é importado de propósito: ele puxa `../cloud`, que não roda
// fora do browser. A sequência de `calcularDosePorZona` está replicada abaixo,
// linha a linha, para poder ser exercitada em node puro.
//
// Roda: node scripts/teste-zona-ponta-a-ponta.mjs

import assert from 'node:assert/strict';
import { agruparPorRotulo } from '../src/lib/recomendacao/dosePorZona.ts';
import { dosesDiretasPorZona, nutrientesDaEquacao } from '../src/lib/recomendacao/doseZonaDireta.ts';
import { rasterizarZonasDose, dentroGeom } from '../src/lib/recomendacao/zonasGrid.ts';
import { coberturaDoGrid } from '../src/lib/recomendacao/cobertura.ts';
import { compilar, executar, ajustarDose, atributoPorToken, validar } from '../src/lib/recomendacao/motor.ts';
import { decodeGrid } from '../src/lib/fertilidade.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));

// ─────────────────────────────────────────────────────────────────────────────
// CENÁRIO — um talhão de verdade, não um quadradinho.
//
// Trabalho em METROS e converto para grau só no fim: assim a área sai redonda e
// o desenho é conferível na mão. Origem no canto sudoeste, latitude -25 (Paraná),
// onde 1° lat = 111.320 m e 1° lon = 111.320·cos(25°) m.
// ─────────────────────────────────────────────────────────────────────────────
const LON0 = -51.0, LAT0 = -25.0;
const M_LAT = 111320;
const M_LON = 111320 * Math.cos((25 * Math.PI) / 180);
const P = (x, y) => [LON0 + x / M_LON, LAT0 + y / M_LAT];
const poly = (pts) => ({ type: 'Polygon', coordinates: [[...pts.map(([x, y]) => P(x, y)), P(...pts[0])]] });

// Talhão: retângulo 1150×800 m (92 ha) com uma PONTA triangular no leste (4 ha).
// Os vértices em x=1150 antes e depois da ponta deixam a forma CÔNCAVA — é a
// geometria que faz o raster ter célula de borda pela metade e o centroide da
// zona cair fora dela, os dois casos que o código diz tratar.
const TALHAO = poly([
  [0, 0], [1150, 0], [1150, 300], [1550, 400], [1150, 500], [1150, 800], [0, 800],
]);

// 3×3 células sobre o retângulo = 9 manchas; a do meio-leste engole a ponta.
const CX = [0, 1150 / 3, (1150 * 2) / 3, 1150];
const CY = [0, 800 / 3, (800 * 2) / 3, 800];
const cel = (i, j) => poly([[CX[i], CY[j]], [CX[i + 1], CY[j]], [CX[i + 1], CY[j + 1]], [CX[i], CY[j + 1]]]);
// Meio-leste com a ponta: a ponta (y 300..500) cabe inteira nesta faixa de y
// (266,7..533,3), então as zonas continuam ladrilhando o talhão sem sobra.
const CEL_PONTA = poly([
  [CX[2], CY[1]], [CX[3], CY[1]], [1150, 300], [1550, 400], [1150, 500], [CX[3], CY[2]], [CX[2], CY[2]],
]);

// 9 POLÍGONOS, 8 ZONAS: "01" e "01_2" são manchas do mesmo saco composto.
const MANCHAS = [
  { id: '01',   rotulo: '1', geometry: cel(0, 0) },   // sudoeste
  { id: '02',   rotulo: '2', geometry: cel(1, 0) },
  { id: '03',   rotulo: '3', geometry: cel(2, 0) },
  { id: '04',   rotulo: '4', geometry: cel(0, 1) },
  { id: '05',   rotulo: '5', geometry: cel(1, 1) },
  { id: '06',   rotulo: '6', geometry: CEL_PONTA }, // leste, com a ponta
  { id: '07',   rotulo: '7', geometry: cel(0, 2) },
  { id: '08',   rotulo: '8', geometry: cel(1, 2) },
  { id: '01_2', rotulo: '1', geometry: cel(2, 2) },  // 2ª mancha da zona 1 (nordeste)
];

// Laudo por zona: V entre 40 e 62, CTC entre 7 e 14 — faixa agronômica plausível
// para solo de cerrado/planalto em correção.
const LAUDO = {
  '1': { v: 42, ctc: 12.0 },
  '2': { v: 48, ctc: 9.5 },
  '3': { v: 55, ctc: 8.0 },
  '4': { v: 61, ctc: 7.2 },
  '5': { v: 40, ctc: 13.5 },
  '6': { v: 52, ctc: 10.4 },
  '7': { v: 58, ctc: 7.8 },
  '8': { v: 62, ctc: 14.0 },
};

// Equação de CALCÁRIO: necessidade de calagem clássica, V2 como constante.
const EQ = {
  script: 'dose = (V2 - V) * CTC / 100',
  constantes: [{ nome: 'V2', valor: 70 }],
  naoNegativo: true,
  doseMinimaViavel: 0,
  abaixoMinimo: 'zero',
  doseMaxima: 0,
  unidadeTratamento: 't/ha',
};
const PIXEL_M = 20;   // = PIXEL_RECOMENDACAO_M (escolhaMapa.ts:27)

// Área (ha) de uma geometria em graus, com o mesmo fator métrico do cenário.
function areaHa(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let a = 0;
  for (const rings of polys) {
    rings.forEach((r, i) => {
      let s = 0;
      for (let k = 0, j = r.length - 1; k < r.length; j = k++) s += r[j][0] * r[k][1] - r[k][0] * r[j][1];
      a += (i === 0 ? 1 : -1) * Math.abs(s) / 2;
    });
  }
  return (a * M_LON * M_LAT) / 10000;
}
const AREA_TALHAO = areaHa(TALHAO);

console.log('\n═══ CENÁRIO ═══');
console.log(`  talhão: ${AREA_TALHAO.toFixed(2)} ha, côncavo, com ponta a leste`);
console.log(`  ${MANCHAS.length} manchas → ${new Set(MANCHAS.map(m => m.rotulo)).size} zonas de manejo`);
console.log(`  equação: "${EQ.script}" com V2=70, naoNegativo, ${EQ.unidadeTratamento}`);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ ETAPA 1 — quem é UMA zona (agruparPorRotulo) ═══\n');
// A tela chama isto ANTES de tudo (RecomendacaoSection.tsx:243). Se as manchas
// não se juntarem aqui, "01" e "01_2" viram duas zonas, disputam dois números de
// amostra e a mesma zona sai do talhão com duas taxas diferentes.

const ZONAS = agruparPorRotulo(MANCHAS);

t('9 manchas viram 8 zonas', () => {
  assert.equal(ZONAS.length, 8);
});

t('a zona partida vira UM MultiPolygon, com as duas manchas', () => {
  const z1 = ZONAS.find(z => z.rotulo === '1');
  assert.equal(z1.id, '01', 'a identidade que segue é a da primeira mancha');
  assert.equal(z1.geometry.type, 'MultiPolygon');
  assert.equal(z1.geometry.coordinates.length, 2);
});

t('as zonas ladrilham o talhão (soma das áreas = área do talhão)', () => {
  // Se sobrasse buraco entre zonas, o raster teria célula sem dose no MIOLO, não
  // só na divisa — e a média ponderada mentiria para menos.
  const soma = ZONAS.reduce((s, z) => s + areaHa(z.geometry), 0);
  assert.ok(Math.abs(soma - AREA_TALHAO) < 0.01, `zonas ${soma.toFixed(3)} ha vs talhão ${AREA_TALHAO.toFixed(3)} ha`);
});

const AREA_ZONA = Object.fromEntries(ZONAS.map(z => [z.rotulo, areaHa(z.geometry)]));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ ETAPA 2 — a taxa de cada zona sai DIRETO da equação ═══\n');
// dosesDiretasPorZona roda a equação uma vez por zona com o laudo daquela zona.
// Nenhum pixel entra nessa conta — é a mesma que o agrônomo faria na calculadora.

const VALORES = ZONAS.map(z => ({ id: z.id, porNutriente: { ...LAUDO[z.rotulo] } }));
const { doses: DOSES, erroCompilacao } = dosesDiretasPorZona(VALORES, EQ);

t('a equação compila e devolve UMA taxa por zona', () => {
  assert.equal(erroCompilacao, undefined);
  assert.equal(DOSES.length, ZONAS.length, 'uma linha por zona, nem mais nem menos');
  assert.equal(new Set(DOSES.map(d => d.id)).size, ZONAS.length);
});

t('a equação declara os nutrientes que a tela tem de buscar no laudo', () => {
  assert.deepEqual(nutrientesDaEquacao(EQ.script, EQ.constantes).sort(), ['ctc', 'v']);
  // V2 é constante da equação, NÃO pode virar nutriente procurado no laboratório
  assert.ok(!nutrientesDaEquacao(EQ.script, EQ.constantes).includes('v2'));
});

t('cada taxa bate com a conta feita À MÃO neste teste', () => {
  for (const z of ZONAS) {
    const { v, ctc } = LAUDO[z.rotulo];
    const naMao = (70 - v) * ctc / 100;
    const d = DOSES.find(x => x.id === z.id);
    assert.ok(Number.isFinite(d.dose), `zona ${z.rotulo} ficou sem taxa: ${d.erro}`);
    assert.ok(Math.abs(d.dose - naMao) < 1e-12, `zona ${z.rotulo}: motor ${d.dose} ≠ mão ${naMao}`);
  }
});

t('o motor por outro caminho (compilar+executar+ajustarDose) dá o MESMO número', () => {
  // Confere que dosesDiretasPorZona não faz nada por fora do motor: mesma AST,
  // mesmo pós-processamento (motor.ts:345).
  const c = compilar(EQ.script, EQ.constantes);
  assert.ok(c.ok, c.erro);
  const opts = { naoNegativo: true, doseMinima: 0, abaixoMinimo: 'zero', doseMaxima: 0 };
  for (const z of ZONAS) {
    const lab = LAUDO[z.rotulo];
    const ext = (nome) => lab[atributoPorToken(nome)?.nut ?? nome.toLowerCase()] ?? NaN;
    const esperado = ajustarDose(executar(c.prog, EQ.constantes, ext), opts);
    assert.equal(DOSES.find(x => x.id === z.id).dose, esperado);
  }
});

t('a zona partida em duas manchas sai com UMA TAXA SÓ', () => {
  // O ponto do pedido: "01" e "01_2" são o mesmo saco composto.
  const daZona1 = DOSES.filter(d => d.id === '01' || d.id === '01_2');
  assert.equal(daZona1.length, 1, 'depois do agrupamento existe UMA entrada para a zona 1');
  assert.equal(daZona1[0].dose, (70 - 42) * 12.0 / 100);
});

const DOSE_POR_ROTULO = Object.fromEntries(ZONAS.map(z => [z.rotulo, DOSES.find(d => d.id === z.id).dose]));
console.log('\n  taxa por zona (t/ha de calcário):');
for (const z of ZONAS) {
  const l = LAUDO[z.rotulo];
  console.log(`    zona ${z.rotulo}: V=${l.v} CTC=${l.ctc} → ${DOSE_POR_ROTULO[z.rotulo].toFixed(3)} t/ha  (${AREA_ZONA[z.rotulo].toFixed(2)} ha)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ ETAPA 3 — o raster nasce DAS TAXAS, e tem de sair CHAPADO ═══\n');
// Aqui é onde a interpolação voltaria de fininho: o raster existe só para mapa,
// PDF e média. Se dentro de uma zona aparecer mais de um valor, ou se surgir um
// valor que não é a taxa de zona nenhuma, é média/suavização de volta.

const COM_DOSE = ZONAS
  .map(z => ({ z, d: DOSE_POR_ROTULO[z.rotulo] }))
  .filter(x => Number.isFinite(x.d));
const RESP = rasterizarZonasDose(
  COM_DOSE.map(x => ({ id: x.z.id, geometry: x.z.geometry, valor: x.d })),
  TALHAO, PIXEL_M,
);
const { valores: PX, rows: ROWS, cols: COLS } = decodeGrid(RESP.grid);

console.log(`  malha: ${ROWS}×${COLS} = ${ROWS * COLS} células, pixel ${RESP.stats.pixel_m} m`);

t('o grid decodifica no tamanho que o shape anuncia', () => {
  assert.equal(PX.length, ROWS * COLS);
  assert.deepEqual(RESP.grid.shape, [ROWS, COLS]);
});

// Índice → lon/lat pela convenção do pipeline: bounds = extensão dos NÓS,
// linha 0 = norte (zonasGrid.ts:201, cobertura.ts:105).
const [W, S, E, N] = RESP.bounds;
const DX = COLS > 1 ? (E - W) / (COLS - 1) : (E - W);
const DY = ROWS > 1 ? (N - S) / (ROWS - 1) : (N - S);
const lonDe = (c) => W + c * DX;
const latDe = (r) => N - r * DY;

// Para cada célula, a zona que contém o CENTRO dela (mesma regra e mesma ordem
// da rasterização: a primeira zona que contém, zonasGrid.ts:175).
const zonaDaCelula = new Array(ROWS * COLS).fill(null);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    for (const { z } of COM_DOSE) {
      if (dentroGeom(z.geometry, lonDe(c), latDe(r))) { zonaDaCelula[r * COLS + c] = z.rotulo; break; }
    }
  }
}

t('dentro de CADA zona só existe UM valor distinto', () => {
  for (const z of ZONAS) {
    const vs = new Set();
    for (let i = 0; i < PX.length; i++) if (zonaDaCelula[i] === z.rotulo) vs.add(PX[i]);
    assert.equal(vs.size, 1, `zona ${z.rotulo} tem ${vs.size} valores: ${[...vs].join(', ')}`);
    // e esse valor é a taxa da zona (em float32, que é como o raster guarda)
    assert.equal([...vs][0], Math.fround(DOSE_POR_ROTULO[z.rotulo]));
  }
});

t('o conjunto GLOBAL de valores é exatamente o das taxas — nada intermediário', () => {
  const noRaster = new Set();
  for (const v of PX) if (Number.isFinite(v)) noRaster.add(v);
  const dasZonas = new Set(ZONAS.map(z => Math.fround(DOSE_POR_ROTULO[z.rotulo])));
  const intrusos = [...noRaster].filter(v => !dasZonas.has(v));
  assert.deepEqual(intrusos, [], `valores que não são taxa de zona nenhuma: ${intrusos.map(f2).join(', ')}`);
  assert.equal(noRaster.size, dasZonas.size, 'toda zona tem de aparecer no raster');
});

t('nenhum valor do raster fica ENTRE duas taxas vizinhas (assinatura de interpolação)', () => {
  // Teste redundante de propósito: se um dia a cópia da borda virar média, o
  // conjunto acima muda e este aqui diz POR QUE mudou.
  const taxas = [...new Set(ZONAS.map(z => Math.fround(DOSE_POR_ROTULO[z.rotulo])))].sort((a, b) => a - b);
  for (const v of PX) {
    if (!Number.isFinite(v)) continue;
    assert.ok(taxas.includes(v), `valor ${f2(v)} não é taxa de zona (fica entre ${f2(taxas.filter(x => x < v).pop())} e ${f2(taxas.find(x => x > v))})`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ ETAPA 4 — média ponderada pela cobertura (tonelagem e custo) ═══\n');

const PESOS = coberturaDoGrid(RESP.grid.shape, RESP.bounds, TALHAO);
let sp = 0, sw = 0, mn = Infinity, mx = -Infinity, n = 0;
for (let i = 0; i < PX.length; i++) {
  const v = PX[i], w = PESOS[i];
  if (!isFinite(v) || !(w > 0)) continue;
  sp += v * w; sw += w; n++;
  if (v < mn) mn = v; if (v > mx) mx = v;
}
const MEDIA = sw > 0 ? sp / sw : 0;
const MENOR = Math.min(...ZONAS.map(z => DOSE_POR_ROTULO[z.rotulo]));
const MAIOR = Math.max(...ZONAS.map(z => DOSE_POR_ROTULO[z.rotulo]));
// A referência honesta: média das taxas ponderada pela ÁREA de cada zona.
const MEDIA_AREA = ZONAS.reduce((s, z) => s + DOSE_POR_ROTULO[z.rotulo] * AREA_ZONA[z.rotulo], 0) / AREA_TALHAO;

console.log(`  min ${f2(mn)} | média ponderada ${f2(MEDIA)} | max ${f2(mx)} t/ha  (${n} células com peso)`);
console.log(`  média por ÁREA das zonas: ${f2(MEDIA_AREA)} t/ha  → desvio ${((MEDIA / MEDIA_AREA - 1) * 100).toFixed(2)}%`);
console.log(`  tonelagem: ${(MEDIA * AREA_TALHAO).toFixed(1)} t   (área ${AREA_TALHAO.toFixed(2)} ha)`);

t('a média fica entre a menor e a maior taxa', () => {
  assert.ok(MEDIA > MENOR && MEDIA < MAIOR, `${f2(MEDIA)} fora de [${f2(MENOR)}, ${f2(MAIOR)}]`);
});

t('min/max do raster são exatamente a menor e a maior taxa', () => {
  assert.equal(mn, Math.fround(MENOR));
  assert.equal(mx, Math.fround(MAIOR));
});

t('a média ponderada bate com a média por ÁREA das zonas (< 2%)', () => {
  // Não é para ser igual: o raster de 20 m discretiza a divisa. Mas um desvio
  // grande aqui significa que a malha está deslocada ou que a coroa de fora do
  // talhão entrou na conta — os dois mexem na tonelagem do PDF.
  const desvio = Math.abs(MEDIA / MEDIA_AREA - 1);
  assert.ok(desvio < 0.02, `desvio de ${(desvio * 100).toFixed(2)}%`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ ETAPA 5 — buracos: célula do talhão que ficou SEM dose ═══\n');
// A cópia da zona mais próxima (RAIO=2, zonasGrid.ts:180) existe para não deixar
// faixa sem dose na divisa. Onde ela não alcança, a máquina recebe "sem taxa".

let buracos = 0, buracoPesoTotal = 0, dentroTalhao = 0, nanTotal = 0, herdadas = 0;
for (let i = 0; i < PX.length; i++) {
  if (!isFinite(PX[i])) nanTotal++;
  if (!(PESOS[i] > 0)) continue;
  dentroTalhao++;
  if (!isFinite(PX[i])) { buracos++; buracoPesoTotal += PESOS[i]; }
  // célula do talhão cujo CENTRO não cai em zona nenhuma (divisa, borda, ponta
  // fina): o valor dela veio da CÓPIA da zona mais próxima, não da zona certa.
  else if (zonaDaCelula[i] == null) herdadas++;
}
const areaCelHa = (DX * M_LON) * (DY * M_LAT) / 10000;
console.log(`  células com algum pedaço dentro do talhão: ${dentroTalhao}`);
console.log(`  células SEM valor dentro do talhão (buraco): ${buracos}`);
console.log(`  área do buraco: ${(buracoPesoTotal * areaCelHa).toFixed(3)} ha de ${AREA_TALHAO.toFixed(2)} ha`);
console.log(`  células NaN no raster inteiro (inclui a coroa fora do talhão): ${nanTotal} de ${ROWS * COLS}`);
console.log(`  células do talhão preenchidas por CÓPIA da zona mais próxima: ${herdadas} (${(herdadas / dentroTalhao * 100).toFixed(1)}%)`);

t('o buraco dentro do talhão é desprezível (< 0,1% da área)', () => {
  const frac = (buracoPesoTotal * areaCelHa) / AREA_TALHAO;
  assert.ok(frac < 0.001, `${(frac * 100).toFixed(3)}% do talhão sem dose`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ ETAPA 6 — os dois tropeços do mundo real ═══\n');

// (a) PROFUNDIDADE que não bate. A ponte laudo→zona é `valorZona`
// (meap/fertilidadePorZona.ts:84) e ela compara a profundidade por IGUALDADE
// EXATA de string. Aqui está replicada — o módulo original importa `store`, que
// puxa nuvem/localStorage e não roda em node.
const valorZonaReplica = (imp, binding, zonaId, nut, prof) => {
  const num = binding[zonaId];
  const r = imp.resultados.find(x => x.numero === num && x.profundidade === prof);
  const v = r?.valores[nut];
  return v != null && isFinite(v) ? v : NaN;
};
const valoresDasZonasReplica = (imp, binding, zonas, nutrientes, prof) =>
  zonas.map(z => {
    const porNutriente = {};
    for (const nut of nutrientes) {
      const v = valorZonaReplica(imp, binding, z.id, nut, prof);
      if (Number.isFinite(v)) porNutriente[nut] = v;
    }
    return { id: z.id, porNutriente };
  });

// Laudo importado com a profundidade grafada "0-20" (uma amostra por zona).
const BINDING = Object.fromEntries(ZONAS.map((z, i) => [z.id, i + 1]));
const IMP = {
  resultados: ZONAS.map((z, i) => ({
    numero: i + 1, profundidade: '0-20', valores: { ...LAUDO[z.rotulo] },
  })),
};
const NUTS = nutrientesDaEquacao(EQ.script, EQ.constantes);

t('profundidade IGUAL à do laudo ("0-20"): todas as zonas recebem valor', () => {
  const vals = valoresDasZonasReplica(IMP, BINDING, ZONAS, NUTS, '0-20');
  assert.ok(vals.every(v => Object.keys(v.porNutriente).length === 2));
  const { doses } = dosesDiretasPorZona(vals, EQ);
  assert.ok(doses.every(d => Number.isFinite(d.dose)));
});

for (const prof of ['00-20', '0-20 cm', '0–20']) {
  t(`profundidade "${prof}" (grafia diferente): NENHUMA zona acha o laudo`, () => {
    const vals = valoresDasZonasReplica(IMP, BINDING, ZONAS, NUTS, prof);
    assert.ok(vals.every(v => Object.keys(v.porNutriente).length === 0),
      'a comparação é ===, sem normalizar');
    const { doses } = dosesDiretasPorZona(vals, EQ);
    assert.ok(doses.every(d => Number.isNaN(d.dose)), 'toda zona sai sem taxa');
    assert.match(doses[0].erro, /faltou o valor de/i);
  });
}

t('com todas as zonas sem laudo, o caminho da tela LANÇA erro (não mapa vazio)', () => {
  // Réplica de aplicar.ts:317-323 — é este `throw` que vira a linha vermelha em
  // "Falhas" na Recomendação, em vez de um mapa em branco sem explicação.
  const vals = valoresDasZonasReplica(IMP, BINDING, ZONAS, NUTS, '00-20');
  const { doses } = dosesDiretasPorZona(vals, EQ);
  const comDose = doses.filter(d => Number.isFinite(d.dose));
  assert.equal(comDose.length, 0);
  const motivo = doses.find(d => d.erro)?.erro ?? 'nenhuma zona tem o valor de laudo que a equação pede';
  assert.throws(() => { throw new Error(`Calcário: ${motivo}`); }, /Faltou o valor de/i);
  console.log(`      → mensagem que o usuário lê: "Calcário: ${motivo}"`);
});

// (b) UMA zona sem resultado no laudo — o resto do talhão continua.
const SEM_UMA = ZONAS.map(z => ({
  id: z.id,
  porNutriente: z.rotulo === '5' ? {} : { ...LAUDO[z.rotulo] },   // zona 5 (miolo) sem laudo
}));
const { doses: DOSES_SEM } = dosesDiretasPorZona(SEM_UMA, EQ);
const COM_DOSE_SEM = ZONAS
  .map(z => ({ z, d: DOSES_SEM.find(d => d.id === z.id).dose }))
  .filter(x => Number.isFinite(x.d));

t('zona sem laudo fica SEM taxa e com motivo; as outras 7 seguem', () => {
  const z5 = DOSES_SEM.find(d => d.id === ZONAS.find(z => z.rotulo === '5').id);
  assert.ok(Number.isNaN(z5.dose));
  assert.match(z5.erro, /v|ctc/i);
  assert.equal(COM_DOSE_SEM.length, 7);
});

const RESP_SEM = rasterizarZonasDose(
  COM_DOSE_SEM.map(x => ({ id: x.z.id, geometry: x.z.geometry, valor: x.d })),
  TALHAO, PIXEL_M,
);
const { valores: PX_SEM } = decodeGrid(RESP_SEM.grid);
const rot5 = ZONAS.find(z => z.rotulo === '5').rotulo;
let celulas5 = 0, celulas5ComValor = 0;
const valoresNaZona5 = new Set();
for (let i = 0; i < PX_SEM.length; i++) {
  if (zonaDaCelula[i] !== rot5) continue;
  celulas5++;
  if (isFinite(PX_SEM[i])) { celulas5ComValor++; valoresNaZona5.add(PX_SEM[i]); }
}
console.log(`\n  zona 5 sem laudo → ${celulas5} células dela no raster, ${celulas5ComValor} receberam valor de VIZINHA`);
console.log(`  valores que caíram lá dentro: ${[...valoresNaZona5].map(f2).join(', ') || '(nenhum)'}`);

t('ACHADO: a zona sem laudo não fica vazia no raster — herda a taxa da vizinha', () => {
  // A cópia da zona mais próxima (RAIO=2) não distingue "borda do talhão" de
  // "zona que ficou de fora por falta de laudo". O painel mostra a zona 5 com
  // "sem taxa", mas o MAPA e o arquivo da máquina recebem número de outra zona.
  assert.ok(celulas5ComValor > 0, 'documenta o comportamento REAL, não o desejado');
});

t('a zona sem laudo não some da lista `porZona` que a tela exibe', () => {
  // aplicar.ts:314 monta porZona a partir de TODAS as zonas, não só das com dose.
  const porId = new Map(DOSES_SEM.map(d => [d.id, d]));
  const porZona = ZONAS.map(z => ({ rotulo: z.rotulo, dose: porId.get(z.id)?.dose ?? NaN, erro: porId.get(z.id)?.erro }));
  assert.equal(porZona.length, 8);
  assert.ok(porZona.find(p => p.rotulo === '5').erro);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
