// Testes da FUSÃO de dois talhões (lib/fundirRegras) — pendência 19.
//
// O caso real: "05A" é parte do talhão "05". As duas grades começaram no ponto
// 1, então os números COLIDEM — e duas amostras "1" na mesma grade fazem o laudo
// casar valor no ponto errado. Aqui travamos as duas garantias:
//   • a grade fundida não tem número nem ordem repetidos;
//   • os pontos do HOSPEDEIRO não mudam (a grade dele já estava certa).
// Roda: `npm run teste:fundir`
import assert from 'node:assert/strict';
import { unirPartes, fundirGrades, remapearResultados, numeroDe } from '../src/lib/fundirRegras.ts';
import { areaHaGeo } from '../src/lib/areaGeo.ts';
import { fcDePartes } from '../src/lib/desmembrarRegras.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const quad = (w, s, l, a) => [[[w, s], [w + l, s], [w + l, s + a], [w, s + a], [w, s]]];
const LNG = -50.3, LAT = -24.42;
const A = quad(LNG, LAT, 0.010, 0.008);                 // talhão 05
const ENCOSTADO = quad(LNG + 0.010, LAT, 0.004, 0.008); // 05A colada na divisa leste
const SOLTO = quad(LNG + 0.05, LAT, 0.004, 0.008);      // 05A longe
const SOBREPOSTO = quad(LNG + 0.008, LAT, 0.004, 0.008); // invade 2 milésimos de A

const p = (ordem, numero, lng, lat) => ({ ordem, numero, lng, lat, profs: 1 });

t('unirPartes: contornos que se ENCOSTAM viram uma área só', () => {
  const u = unirPartes([A], [ENCOSTADO]);
  assert.equal(u.partes.length, 1);
  assert.equal(u.dissolveu, true);
});

t('unirPartes: contornos SEPARADOS viram multipolígono, sem inventar ligação', () => {
  const u = unirPartes([A], [SOLTO]);
  assert.equal(u.partes.length, 2);
  assert.equal(u.dissolveu, false);
});

t('A ÁREA DA UNIÃO É A DO CONTORNO, não a soma — sobreposição não conta duas vezes', () => {
  const soma = areaHaGeo(fcDePartes([A], 'x')) + areaHaGeo(fcDePartes([SOBREPOSTO], 'x'));
  const unido = areaHaGeo(fcDePartes(unirPartes([A], [SOBREPOSTO]).partes, 'x'));
  assert.ok(unido < soma - 0.5, `unido ${unido} deveria ser bem menor que a soma ${soma}`);
  // Sem sobreposição, união = soma (a divisa não tem área).
  const somaEnc = areaHaGeo(fcDePartes([A], 'x')) + areaHaGeo(fcDePartes([ENCOSTADO], 'x'));
  const unidoEnc = areaHaGeo(fcDePartes(unirPartes([A], [ENCOSTADO]).partes, 'x'));
  assert.ok(Math.abs(unidoEnc - somaEnc) < 0.05, `${unidoEnc} vs ${somaEnc}`);
});

t('Sem colisão de números, NADA é renumerado', () => {
  const hosp = [p(0, 1, 0, 0), p(1, 2, 0, 0), p(2, 3, 0, 0)];
  const vis = [p(40, 41, 0, 0), p(41, 42, 0, 0)];
  const f = fundirGrades(hosp, vis);
  assert.deepEqual(f.remapeados, []);
  assert.deepEqual(f.colidiuNumero, []);
  assert.deepEqual(f.pontos.map(numeroDe), [1, 2, 3, 41, 42]);
});

t('COM colisão: só o VISITANTE é renumerado, a partir do maior número usado', () => {
  const hosp = [p(0, 1, 0, 0), p(1, 2, 0, 0), p(2, 3, 0, 0)];
  const vis = [p(0, 1, 0, 0), p(1, 2, 0, 0)];
  const f = fundirGrades(hosp, vis);
  assert.deepEqual(f.colidiuNumero, [1, 2]);
  assert.deepEqual(f.pontos.map(numeroDe), [1, 2, 3, 4, 5]);
  // os três do hospedeiro seguem intactos
  for (const n of [1, 2, 3]) {
    const pt = f.pontos.find(x => numeroDe(x) === n);
    assert.equal(pt.numeroAnterior, undefined, `ponto ${n} do hospedeiro não pode ter sido mexido`);
  }
  // e os que chegaram guardam de onde vieram
  assert.equal(f.pontos.find(x => numeroDe(x) === 4).numeroAnterior, 1);
  assert.equal(f.pontos.find(x => numeroDe(x) === 5).numeroAnterior, 2);
});

t('NENHUM número e NENHUM ordem repetido na grade fundida — a invariante', () => {
  // ordem também é chave (das coletas de campo): renumerar uma sem a outra
  // deixaria a caminhada apontando para o ponto errado.
  const hosp = Array.from({ length: 40 }, (_, i) => p(i, i + 1, 0, 0));
  const vis = Array.from({ length: 12 }, (_, i) => p(i, i + 1, 0, 0));
  const f = fundirGrades(hosp, vis);
  assert.equal(f.pontos.length, 52);
  assert.equal(new Set(f.pontos.map(numeroDe)).size, 52, 'número repetido na grade fundida');
  assert.equal(new Set(f.pontos.map(x => x.ordem)).size, 52, 'ordem repetido na grade fundida');
  assert.deepEqual(f.pontos.map(numeroDe), Array.from({ length: 52 }, (_, i) => i + 1));
});

t('O laudo é reescrito junto com a renumeração', () => {
  const hosp = [p(0, 1, 0, 0)];
  const vis = [p(0, 1, 0, 0), p(1, 2, 0, 0)];
  const f = fundirGrades(hosp, vis);
  const resultados = [{ numero: 1, valores: { pH: 5.1 } }, { numero: 2, valores: { pH: 6.2 } }];
  const novos = remapearResultados(resultados, f.remapeados);
  assert.deepEqual(novos.map(r => r.numero), [2, 3]);
  assert.equal(novos[0].valores.pH, 5.1, 'o VALOR não pode trocar de ponto');
  assert.equal(novos[1].valores.pH, 6.2);
});

t('Sem remapeamento, os resultados passam intactos (mesmo objeto)', () => {
  const resultados = [{ numero: 7, valores: {} }];
  assert.equal(remapearResultados(resultados, []), resultados);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
