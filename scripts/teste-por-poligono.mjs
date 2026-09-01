// Distribuição do insumo por ÁREA SEPARADA (src/lib/recomendacao/porPoligono.ts).
// Roda: `npm run teste:porpoligono`.
//
// A invariante que este arquivo protege: o número vira CARGA DE CAMINHÃO. Se a
// soma das partes não fechar com o total do talhão, quem despacha confere na
// calculadora e para de confiar no relatório; e se o rateio for por hectare em
// vez de pela dose, a mancha mais ácida recebe menos do que precisa.
import assert from 'node:assert/strict';
import { volumesPorParte, totaisPorProduto, parteComoPoligono, nPartes } from '../src/lib/recomendacao/porPoligono.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ok  ', n); } catch (e) { fail++; console.error('  FALHOU', n, '-', e.message); } };

// Duas manchas separadas, na latitude do Paraná. A da ESQUERDA é o dobro da
// direita em largura — área diferente de propósito.
const LAT = -24.5;
const quad = (w, larg) => [[[w, LAT], [w + larg, LAT], [w + larg, LAT + 0.02], [w, LAT + 0.02], [w, LAT]]];
const ESQ = quad(-50.00, 0.02);          // maior
const DIR = quad(-49.95, 0.01);          // menor
const TALHAO = { type: 'MultiPolygon', coordinates: [DIR, ESQ] };   // fora de ordem de propósito
const BOUNDS = [-50.00, LAT, -49.94, LAT + 0.02];
const SHAPE = [60, 120];

// Grid cujo valor depende de em qual mancha a célula cai.
function grid(doseEsq, doseDir) {
  const [rows, cols] = SHAPE;
  const v = new Float32Array(rows * cols);
  const [w, s, e, n] = BOUNDS;
  const dx = (e - w) / (cols - 1), dy = (n - s) / (rows - 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = w + c * dx, y = n - r * dy;
      const naEsq = x >= -50.00 && x <= -49.98 && y >= LAT && y <= LAT + 0.02;
      const naDir = x >= -49.95 && x <= -49.94 && y >= LAT && y <= LAT + 0.02;
      v[r * cols + c] = naEsq ? doseEsq : naDir ? doseDir : NaN;
    }
  }
  return v;
}
const dose = (produto, doseEsq, doseDir, toneladas = 100, custo = 10_000) =>
  ({ produto, valores: grid(doseEsq, doseDir), shape: SHAPE, bounds: BOUNDS, toneladas, custo });

console.log('\nDistribuicao por area separada\n');

t('area unica nao tem o que ratear', () => {
  assert.equal(nPartes({ type: 'Polygon', coordinates: ESQ }), 1);
  assert.equal(nPartes(TALHAO), 2);
  assert.equal(nPartes(null), 0);
});

t('parteComoPoligono devolve a mancha isolada, pelo indice da geometria', () => {
  const p = parteComoPoligono(TALHAO, 1);
  assert.equal(p.type, 'Polygon');
  assert.deepEqual(p.coordinates, ESQ);
});

t('as partes saem da MAIOR para a menor, rotuladas Area 1, Area 2', () => {
  const r = volumesPorParte(TALHAO, [dose('Calcario', 1000, 1000)]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(x => x.rotulo), ['Área 1', 'Área 2']);
  assert.ok(r[0].areaHa > r[1].areaHa, 'a primeira e a maior');
  assert.equal(r[0].indice, 1, 'indice preserva a posicao na geometria (a maior veio em 2o)');
});

t('SOMA DAS PARTES FECHA com o total do talhao', () => {
  const r = volumesPorParte(TALHAO, [dose('Calcario', 1500, 800, 137.4)]);
  const tot = totaisPorProduto(r);
  assert.ok(Math.abs(tot.Calcario - 137.4) < 1e-6, `somou ${tot.Calcario}, esperado 137,4`);
});

t('dose IGUAL nas duas manchas: rateio segue a area (2:1)', () => {
  const r = volumesPorParte(TALHAO, [dose('Calcario', 1000, 1000, 90)]);
  const [maior, menor] = r;
  assert.ok(Math.abs(maior.porProduto.Calcario / menor.porProduto.Calcario - 2) < 0.05,
    `esperado ~2:1, veio ${(maior.porProduto.Calcario / menor.porProduto.Calcario).toFixed(2)}`);
});

t('dose MAIOR na mancha menor puxa a tonelagem dela — nao e rateio por hectare', () => {
  // menor tem metade da area, mas o dobro da dose -> as duas empatam.
  const r = volumesPorParte(TALHAO, [dose('Calcario', 1000, 2000, 90)]);
  const [maior, menor] = r;
  assert.ok(Math.abs(maior.porProduto.Calcario - menor.porProduto.Calcario) < 2,
    `esperado empate, veio ${maior.porProduto.Calcario.toFixed(1)} x ${menor.porProduto.Calcario.toFixed(1)}`);
  // e a area continua sendo 2:1 — o que muda e a quantidade, nao o tamanho
  assert.ok(maior.areaHa / menor.areaHa > 1.8);
});

t('cada PRODUTO e rateado por conta propria', () => {
  const r = volumesPorParte(TALHAO, [
    dose('Calcario', 1000, 1000, 90, 9000),
    dose('Gesso', 1000, 4000, 50, 5000),
  ]);
  const tot = totaisPorProduto(r);
  assert.ok(Math.abs(tot.Calcario - 90) < 1e-6);
  assert.ok(Math.abs(tot.Gesso - 50) < 1e-6);
  // Gesso concentra na mancha menor (dose 4x), Calcario na maior (area 2x)
  assert.ok(r[0].porProduto.Calcario > r[1].porProduto.Calcario);
  assert.ok(r[1].porProduto.Gesso > r[0].porProduto.Gesso);
});

t('o INVESTIMENTO acompanha o mesmo rateio e fecha com o total', () => {
  const r = volumesPorParte(TALHAO, [dose('Calcario', 1000, 1000, 90, 12_345.67)]);
  const soma = r.reduce((s, p) => s + p.custo, 0);
  assert.ok(Math.abs(soma - 12_345.67) < 1e-6, `somou ${soma}`);
});

t('grid todo NaN (mapa vazio) cai no rateio por AREA, sem NaN no relatorio', () => {
  const vazio = { produto: 'Calcario', valores: new Float32Array(SHAPE[0] * SHAPE[1]).fill(NaN), shape: SHAPE, bounds: BOUNDS, toneladas: 90, custo: 900 };
  const r = volumesPorParte(TALHAO, [vazio]);
  const tot = totaisPorProduto(r);
  assert.ok(Number.isFinite(tot.Calcario), 'total nao pode virar NaN');
  assert.ok(Math.abs(tot.Calcario - 90) < 0.5, `somou ${tot.Calcario}`);
  assert.ok(r[0].porProduto.Calcario > r[1].porProduto.Calcario, 'a maior leva mais');
});

t('dose zerada nao gera NaN nem divisao por zero', () => {
  const r = volumesPorParte(TALHAO, [dose('Calcario', 0, 0, 0, 0)]);
  for (const p of r) assert.ok(Number.isFinite(p.porProduto.Calcario), 'valor finito');
});

t('talhao de area UNICA devolve uma parte com tudo', () => {
  const uni = { type: 'Polygon', coordinates: ESQ };
  const r = volumesPorParte(uni, [dose('Calcario', 1000, 1000, 90)]);
  assert.equal(r.length, 1);
  assert.ok(Math.abs(r[0].porProduto.Calcario - 90) < 1e-6);
  assert.ok(Math.abs(r[0].pct - 100) < 1e-6);
});

t('tres manchas: soma fecha e nenhuma fica de fora', () => {
  const tres = { type: 'MultiPolygon', coordinates: [ESQ, DIR, quad(-49.97, 0.005)] };
  const r = volumesPorParte(tres, [dose('Calcario', 1200, 900, 210)]);
  assert.equal(r.length, 3);
  assert.ok(Math.abs(totaisPorProduto(r).Calcario - 210) < 1e-6);
  assert.deepEqual(r.map(x => x.rotulo), ['Área 1', 'Área 2', 'Área 3']);
});


t('AREA das partes fecha com a area do CADASTRO quando ela e informada', () => {
  const r = volumesPorParte(TALHAO, [dose('Calcario', 1000, 1000, 90)], { areaTotalHa: 33.7 });
  const soma = r.reduce((s, p) => s + p.areaHa, 0);
  assert.ok(Math.abs(soma - 33.7) < 1e-6, `somou ${soma}`);
  // A PROPORCAO entre as manchas e preservada dentro do arredondamento: a soma
  // fecha EXATO em 2 casas (fatiarArea), entao a razao pode andar um centesimo.
  const semEscala = volumesPorParte(TALHAO, [dose('Calcario', 1000, 1000, 90)]);
  const razao = (x) => x[0].areaHa / x[1].areaHa;
  assert.ok(Math.abs(razao(r) - razao(semEscala)) < 0.01,
    `razao ${razao(r).toFixed(4)} x ${razao(semEscala).toFixed(4)}`);
});

t('sem area de cadastro (ou zero), usa a area geodesica da geometria', () => {
  const a = volumesPorParte(TALHAO, [dose('Calcario', 1000, 1000, 90)]);
  const b = volumesPorParte(TALHAO, [dose('Calcario', 1000, 1000, 90)], { areaTotalHa: 0 });
  assert.deepEqual(a.map(p => p.areaHa), b.map(p => p.areaHa));
});

t('reescala nao mexe na QUANTIDADE de insumo (ela ja fecha com o total da dose)', () => {
  const r = volumesPorParte(TALHAO, [dose('Calcario', 1500, 800, 137.4)], { areaTotalHa: 33.7 });
  assert.ok(Math.abs(totaisPorProduto(r).Calcario - 137.4) < 1e-6);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
