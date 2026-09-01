// Testes da caixa ESTATÍSTICAS da página de fertilidade (lib/estatisticaMapa).
//
// O que se garante aqui: o MÍNIMO e o MÁXIMO impressos são os mesmos números
// escritos nos pontos do mapa. Caso que motivou (BOOK CG03, K 0-20 cm):
// amostras de 0,8 a 8,1 desenhadas no mapa, e a caixa dizia 1,1 a 7,8 — porque
// descrevia o RASTER, e a krigagem alisa (nunca alcança os extremos amostrados).
//
// Roda: `npm run teste:estatistica`
import assert from 'node:assert/strict';
import {
  numeroPtBr, valoresDosRotulos, statsDeAmostras, statsDeGrid, estatisticaDaPagina, casasDoRotulo,
} from '../src/lib/estatisticaMapa.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const pt = (props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: props });
const fc = (feats) => ({ type: 'FeatureCollection', features: feats });

// ── numeroPtBr ───────────────────────────────────────────────────────────────

t('numeroPtBr: lê o rótulo como ele é impresso', () => {
  assert.equal(numeroPtBr('0,8'), 0.8);
  // ponto só é milhar quando separa 3 dígitos — "8.1" não pode virar 81
  assert.equal(numeroPtBr('8.1'), 8.1);
  assert.equal(numeroPtBr('1.234.567,89'), 1234567.89);
  assert.equal(numeroPtBr('144'), 144);
  assert.equal(numeroPtBr('1.234,5'), 1234.5);
  assert.equal(numeroPtBr('-16,1'), -16.1);
  assert.equal(numeroPtBr(5.25), 5.25);
});

t('numeroPtBr: o que não é número vira NaN (divisa, traço, vazio)', () => {
  for (const v of ['—', '', 'zona 3', null, undefined, NaN, '1,2,3']) {
    assert.ok(Number.isNaN(numeroPtBr(v)), `deveria ser NaN: ${String(v)}`);
  }
});

// ── valoresDosRotulos ────────────────────────────────────────────────────────

t('valoresDosRotulos: prefere o número cru (v) ao texto', () => {
  // txt arredondado para inteiro, v com a precisão real: a conta usa v.
  assert.deepEqual(valoresDosRotulos(fc([pt({ txt: '144', v: 144.37 })])), [144.37]);
});

t('valoresDosRotulos: mapa antigo só com txt — lê o que está impresso', () => {
  assert.deepEqual(valoresDosRotulos(fc([pt({ txt: '0,8' }), pt({ txt: '8,1' })])), [0.8, 8.1]);
});

t('valoresDosRotulos: ignora feature sem propriedade e rótulo não numérico', () => {
  const zona = fc([
    pt({ txt: '3,4', v: 3.4 }),
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: null },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
  ]);
  assert.deepEqual(valoresDosRotulos(zona), [3.4]);
  assert.deepEqual(valoresDosRotulos(null), []);
  assert.deepEqual(valoresDosRotulos({ features: [] }), []);
});

// ── as três fontes ───────────────────────────────────────────────────────────

t('statsDeAmostras: min/média/máx e null sem valor utilizável', () => {
  assert.deepEqual(statsDeAmostras([4, 2, 9]), { min: 2, media: 5, max: 9, fonte: 'amostras' });
  assert.deepEqual(statsDeAmostras([NaN, 3, Infinity]), { min: 3, media: 3, max: 3, fonte: 'amostras' });
  assert.equal(statsDeAmostras([]), null);
  assert.equal(statsDeAmostras([NaN]), null);
});

t('statsDeGrid: NaN (fora do talhão) não entra na conta', () => {
  const g = Float32Array.from([NaN, 2, 4, NaN, 6]);
  assert.deepEqual(statsDeGrid(g), { min: 2, media: 4, max: 6, fonte: 'mapa' });
  assert.equal(statsDeGrid(Float32Array.from([NaN, NaN])), null);
  assert.equal(statsDeGrid(null), null);
});

// ── a garantia ───────────────────────────────────────────────────────────────

t('CAIXA = RÓTULOS: o caso do BOOK CG03 (K 0-20 cm)', () => {
  // Rótulos impressos no mapa; o raster, alisado pela krigagem, fica por dentro.
  const rotulos = fc([0.8, 1.2, 2.6, 3.3, 6.4, 8.1].map(v => pt({ txt: String(v).replace('.', ','), v })));
  const grid = Float32Array.from([1.1, 2.0, 3.0, 5.5, 7.8]);
  const st = estatisticaDaPagina({ rotulos, grid, servidor: { min: 1.1, max: 7.8 } });
  assert.equal(st.fonte, 'amostras');
  assert.equal(st.min, 0.8, 'o mínimo tem de ser o menor rótulo, não o do raster');
  assert.equal(st.max, 8.1, 'o máximo tem de ser o maior rótulo, não o do raster');
});

t('CAIXA ⊋ MAPA: a caixa é ESTRITAMENTE mais larga que o raster alisado', () => {
  // O grid já chega limitado à faixa das amostras (faixaAmostras/interp-29+), e a
  // krigagem alisa, então ele fica por DENTRO. Exigir "estritamente" é o que faz
  // este teste falhar se a caixa voltar a ser a do raster — com `>=` ele passava
  // nos dois mundos, porque lá os dois números eram o mesmo.
  const vals = [0.8, 1.2, 2.6, 8.1];
  const rotulos = fc(vals.map(v => pt({ txt: String(v), v })));
  const grid = Float32Array.from([0.81, 3.4, 7.96, NaN]);
  const st = estatisticaDaPagina({ rotulos, grid });
  const doMapa = statsDeGrid(grid);
  assert.equal(st.fonte, 'amostras');
  assert.ok(doMapa.min > st.min, 'o raster tem de ficar acima do mínimo amostrado');
  assert.ok(doMapa.max < st.max, 'o raster tem de ficar abaixo do máximo amostrado');
});

t('MODO ZONA: conta os rótulos das zonas e ignora as divisas', () => {
  const zona = fc([
    pt({ txt: '3,4', v: 3.4 }),
    pt({ txt: '7,0', v: 7.0 }),
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] }, properties: {} },
  ]);
  const st = estatisticaDaPagina({ rotulos: zona, grid: Float32Array.from([3.4, 5, 7]) });
  assert.equal(st.fonte, 'amostras');
  assert.deepEqual([st.min, st.max, st.media], [3.4, 7.0, 5.2]);
});

t('LAUDO ALTERADO DEPOIS DO MAPA: a caixa volta a descrever o raster', () => {
  // Quem chama passa `rotulos: null` nesse estado (relatorioDados/FertilidadeSection):
  // a faixa de hoje não limitou aquele grid, então prometê-la seria mentir.
  const grid = Float32Array.from([0.8, 4, 8.1]);
  const st = estatisticaDaPagina({ rotulos: null, grid, servidor: { min: 0.8, max: 8.1 } });
  assert.equal(st.fonte, 'mapa');
  assert.ok(Math.abs(st.min - 0.8) < 1e-6 && Math.abs(st.max - 8.1) < 1e-6);
});

t('MESMA GRAFIA: a caixa escreve o extremo igual ao rótulo do ponto', () => {
  // A promessa que quebrava: caixa "144,0" onde o mapa escreve "144".
  const fmtPt = (v, casas) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  for (const [id, cfg, valor] of [['ctc', undefined, 144], ['ph', undefined, 4.1], ['k', undefined, 0.8], ['p', 2, 26.35]]) {
    const casas = casasDoRotulo(id, cfg);
    const rotulos = fc([pt({ txt: fmtPt(valor, casas), v: valor })]);
    const st = estatisticaDaPagina({ rotulos });
    assert.equal(fmtPt(st.min, casas), fmtPt(valor, casas), `${id}: caixa e rótulo com grafias diferentes`);
  }
});

t('casasDoRotulo: a regra é uma só (config > pH/K = 1 > inteiro)', () => {
  assert.equal(casasDoRotulo('ctc', undefined), 0);
  assert.equal(casasDoRotulo('ph', undefined), 1);
  assert.equal(casasDoRotulo('k', undefined), 1);
  assert.equal(casasDoRotulo('ph', 3), 3);
  assert.equal(casasDoRotulo('satk', 1), 1);
});

t('média das amostras, não do raster (mapa assimétrico não distorce)', () => {
  const rotulos = fc([1, 1, 1, 9].map(v => pt({ txt: String(v), v })));
  const st = estatisticaDaPagina({ rotulos, grid: Float32Array.from([1, 9]) });
  assert.equal(st.media, 3);        // média real das amostras
});

// ── precedência e o fallback honesto ─────────────────────────────────────────

t('sem rótulo numérico cai no raster (índice satelital, MDE)', () => {
  const st = estatisticaDaPagina({ rotulos: fc([]), grid: Float32Array.from([0.2, 0.9]) });
  assert.equal(st.fonte, 'mapa');
  // Float32 não guarda 0,2 exato — a comparação é por tolerância, como no PDF.
  assert.ok(Math.abs(st.min - 0.2) < 1e-6);
  assert.ok(Math.abs(st.max - 0.9) < 1e-6);
});

t('sem grid, o servidor entra SEM média inventada', () => {
  const st = estatisticaDaPagina({ grid: null, servidor: { min: 2, max: 10 } });
  assert.equal(st.fonte, 'servidor');
  assert.equal(st.min, 2);
  assert.equal(st.max, 10);
  assert.equal(st.media, null, '(min+max)/2 não é média de nada — tem de vir null');
});

t('sem nada utilizável, devolve null (a página é descartada)', () => {
  assert.equal(estatisticaDaPagina({}), null);
  assert.equal(estatisticaDaPagina({ rotulos: fc([]), grid: null, servidor: { min: null, max: null } }), null);
  assert.equal(estatisticaDaPagina({ servidor: { min: 3, max: NaN } }), null);
});

t('ESTABILIDADE: trocar o raster não mexe na caixa', () => {
  const rotulos = fc([2, 7].map(v => pt({ txt: String(v), v })));
  const a = estatisticaDaPagina({ rotulos, grid: Float32Array.from([2.1, 6.9]) });   // pixel 5 m
  const b = estatisticaDaPagina({ rotulos, grid: Float32Array.from([2.4, 6.2]) });   // pixel 20 m
  assert.deepEqual(a, b);
});

console.log(`\n${fail ? '✗' : '✓'} estatística do mapa: ${ok} ok, ${fail} falhou`);
process.exit(fail ? 1 : 0);
