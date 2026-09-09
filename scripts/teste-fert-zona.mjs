// FERTILIDADE POR ZONA — o valor que cada zona recebe do laudo.
//
// Este caminho não tinha teste nenhum: `lib/meap/fertilidadePorZona.ts` puxava
// `store`/`raster` por causa de duas funções que ninguém chamava, e por isso não
// carregava em Node. Com elas fora, o módulo é puro e dá para travar as duas
// regras que o modo "Processar em zona" promete:
//
//   1. NUNCA interpola — a zona recebe o valor ABSOLUTO da amostra vinculada;
//   2. lê o laudo com a MESMA regra da interpolação (a linha que TEM o nutriente).
//
// A regra 2 é o defeito que originou o arquivo: `valorZona` escolhia a linha só
// por número+profundidade e a interpolação filtrava por `valores[nut] != null`.
// Em laudo com mais de uma linha por amostra (macro e micro em protocolos
// diferentes — a fusão em lab.ts é por protocolo quando ele existe), a zona caía
// na linha errada e a CTCe sumia do mapa enquanto a interpolação a desenhava.
//
// Roda: npm run teste:fertzona

import assert from 'node:assert/strict';
import { bindingAuto, bindingPorPontos, valorZona, zonasComValor, divisasDasZonas, lerZonasDoTalhao } from '../src/lib/meap/fertilidadePorZona.ts';
import { calcularDerivados } from '../src/lib/laudo/nucleo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Cenário: 3 zonas em faixas verticais, 1 ponto de coleta dentro de cada ────
const faixa = (x0, x1) => ({
  type: 'Polygon',
  coordinates: [[[x0, -25.00], [x1, -25.00], [x1, -24.99], [x0, -24.99], [x0, -25.00]]],
});
const ZONAS = [
  { id: '01', classe: 'Alta',  geometry: faixa(-51.00, -50.99) },
  { id: '02', classe: 'Média', geometry: faixa(-50.99, -50.98) },
  { id: '03', classe: 'Baixa', geometry: faixa(-50.98, -50.97) },
];
const PONTOS = [
  { numero: 1, lng: -50.995, lat: -24.995 },
  { numero: 2, lng: -50.985, lat: -24.995 },
  { numero: 3, lng: -50.975, lat: -24.995 },
];

// Laudo realista: CTC pH 7,0 lida do arquivo; CTCe DERIVADA (Ca+Mg+K+Al).
// Os dois números são bem diferentes de propósito — é o par que o usuário
// confundiu, e um teste em que fossem próximos não provaria nada.
function laudo(linhas) {
  const resultados = linhas.map(l => ({ ...l, valores: { ...l.valores } }));
  for (const r of resultados) calcularDerivados(r.valores);
  return { id: 'imp1', elementos: ['ph', 'ca', 'mg', 'k', 'al', 'ctc', 't'], resultados };
}
const LAUDO = laudo([
  { numero: 1, profundidade: '0-20', valores: { ph: 5.2, ca: 30, mg: 12, k: 3.2, al: 0, ctc: 78 } },
  { numero: 2, profundidade: '0-20', valores: { ph: 5.6, ca: 45, mg: 18, k: 4.5, al: 0, ctc: 96 } },
  { numero: 3, profundidade: '0-20', valores: { ph: 4.6, ca: 18, mg: 7,  k: 1.8, al: 4, ctc: 62 } },
]);
const BIND = bindingPorPontos(ZONAS, PONTOS, [...new Set(LAUDO.resultados.map(r => r.numero))]);

console.log('\nVÍNCULO ZONA ↔ AMOSTRA');
t('o ponto que cai DENTRO da zona é a amostra dela', () => {
  assert.deepEqual(BIND, { '01': 1, '02': 2, '03': 3 });
});
t('sem pontos, o fallback pela ordem casa 1ª zona ↔ menor número', () => {
  assert.deepEqual(bindingAuto(ZONAS, [7, 3, 5]), { '01': 3, '02': 5, '03': 7 });
});

console.log('\nCTCe É CTCe — NUNCA A CTC pH 7,0');
t('a zona recebe o valor DERIVADO (Ca+Mg+K+Al), não o da coluna CTC', () => {
  // amostra 1: 30+12+3,2+0 = 45,2 · a CTC pH 7,0 dela é 78
  assert.equal(valorZona(LAUDO, BIND, '01', 't', '0-20'), 45.2);
  assert.equal(valorZona(LAUDO, BIND, '01', 'ctc', '0-20'), 78);
});
t('nenhuma zona devolve, em CTCe, o número da CTC pH 7,0', () => {
  const ctce = zonasComValor(ZONAS, LAUDO, BIND, 't', '0-20').map(z => z.valor);
  const ctc = zonasComValor(ZONAS, LAUDO, BIND, 'ctc', '0-20').map(z => z.valor);
  assert.deepEqual(ctce, [45.2, 67.5, 30.8]);
  assert.deepEqual(ctc, [78, 96, 62]);
  for (const v of ctce) assert.ok(!ctc.includes(v), `valor de CTCe ${v} coincide com um de CTC pH 7,0`);
});

console.log('\nSEM INTERPOLAÇÃO — VALOR ABSOLUTO DA AMOSTRA');
t('todo valor de zona é, literalmente, um valor do laudo', () => {
  const doLaudo = new Set(LAUDO.resultados.map(r => r.valores.t));
  for (const z of zonasComValor(ZONAS, LAUDO, BIND, 't', '0-20')) {
    assert.ok(doLaudo.has(z.valor), `${z.valor} não é o valor de nenhuma amostra — cheira a interpolação`);
  }
});
t('zona sem amostra para o nutriente fica de fora (não recebe média)', () => {
  const semK = laudo([
    { numero: 1, profundidade: '0-20', valores: { ca: 30, mg: 12, k: 3.2, al: 0, ctc: 78 } },
    { numero: 2, profundidade: '0-20', valores: { ca: 45, mg: 18, al: 0, ctc: 96 } },   // sem K → sem t
    { numero: 3, profundidade: '0-20', valores: { ca: 18, mg: 7, k: 1.8, al: 4, ctc: 62 } },
  ]);
  const zv = zonasComValor(ZONAS, semK, BIND, 't', '0-20');
  assert.deepEqual(zv.map(z => z.id), ['01', '03']);
});

console.log('\nMESMA LEITURA DA INTERPOLAÇÃO (o defeito corrigido)');
// A regra da aba Fertilidade para a interpolação, replicada aqui:
const comoInterpolacao = (imp, nut, prof) => imp.resultados
  .filter(r => r.profundidade === prof && r.valores[nut] != null && isFinite(r.valores[nut]))
  .map(r => ({ numero: r.numero, valor: r.valores[nut] }));

t('laudo com macro e micro em LINHAS SEPARADAS do mesmo ponto: a zona lê a linha que tem o nutriente', () => {
  // Protocolos distintos impedem a fusão em lab.ts → duas linhas por número+prof.
  // A linha do micro não tem Ca/Mg/K, então `calcularDerivados` APAGA o `t` dela.
  const partido = laudo([
    { numero: 1, profundidade: '0-20', valores: { b: 0.3, zn: 1.2 } },                  // micro (vem antes)
    { numero: 1, profundidade: '0-20', valores: { ca: 30, mg: 12, k: 3.2, al: 0, ctc: 78 } },
    { numero: 2, profundidade: '0-20', valores: { b: 0.4, zn: 1.0 } },
    { numero: 2, profundidade: '0-20', valores: { ca: 45, mg: 18, k: 4.5, al: 0, ctc: 96 } },
    { numero: 3, profundidade: '0-20', valores: { b: 0.2, zn: 0.9 } },
    { numero: 3, profundidade: '0-20', valores: { ca: 18, mg: 7, k: 1.8, al: 4, ctc: 62 } },
  ]);
  const porZona = zonasComValor(ZONAS, partido, BIND, 't', '0-20');
  const porInterp = comoInterpolacao(partido, 't', '0-20');
  assert.equal(porInterp.length, 3, 'a interpolação enxerga as 3 amostras');
  assert.equal(porZona.length, 3, 'a zona tem de enxergar as MESMAS 3 — antes vinha 0');
  assert.deepEqual(porZona.map(z => z.valor), porInterp.map(p => p.valor));
});

t('as duas leituras concordam em TODO nutriente e profundidade do laudo', () => {
  const profs = [...new Set(LAUDO.resultados.map(r => r.profundidade))];
  for (const nut of LAUDO.elementos) {
    for (const prof of profs) {
      const zonaVals = ZONAS.map(z => valorZona(LAUDO, BIND, z.id, nut, prof)).filter(Number.isFinite);
      const interpVals = comoInterpolacao(LAUDO, nut, prof).map(p => p.valor);
      assert.deepEqual([...zonaVals].sort((a, b) => a - b), [...interpVals].sort((a, b) => a - b),
        `divergência em ${nut} ${prof}`);
    }
  }
});

console.log('\nGEOMETRIA');
t('as divisas saem como linhas (uma por anel de cada zona)', () => {
  const d = divisasDasZonas(ZONAS);
  assert.equal(d.length, 3);
  assert.ok(d.every(f => f.geometry.type === 'LineString'));
});
t('lerZonasDoTalhao devolve as zonas ordenadas por id', () => {
  const fc = { type: 'FeatureCollection', features: ZONAS.slice().reverse().map(z => ({ type: 'Feature', geometry: z.geometry, properties: { id: z.id, classe: z.classe } })) };
  assert.deepEqual(lerZonasDoTalhao(JSON.stringify(fc)).map(z => z.id), ['01', '02', '03']);
  assert.deepEqual(lerZonasDoTalhao(undefined), []);
  assert.deepEqual(lerZonasDoTalhao('{ não é json'), []);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
