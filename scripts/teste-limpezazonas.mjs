// Testes da LIMPEZA de zonas (lib/meap/fundir) — pendência 57.
//
// O caso real: CKLBV 01 tem duas glebas — a principal e uma pequena ao sul.
// Com "área mínima" maior que a gleba pequena, ela sumia do zoneamento: a
// limpeza descartava PARTES menores que a área mínima. A regra agora: parte de
// talhão nunca some; só anel degenerado sai. Buraco pequeno segue preenchido.
// Roda: `npm run teste:limpezazonas`
import assert from 'node:assert/strict';
import turfArea from '@turf/area';
import { limparGeometria, unirFeatures } from '../src/lib/meap/fundir.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const anel = (w, s, l, a) => [[w, s], [w + l, s], [w + l, s + a], [w, s + a], [w, s]];
const LNG = -52.9, LAT = -27.3;
const GRANDE = anel(LNG, LAT, 0.02, 0.015);                 // ~330 ha
const PEQUENA = anel(LNG + 0.005, LAT - 0.004, 0.001, 0.002); // ~2 ha, separada
const area = g => turfArea({ type: 'Feature', geometry: g, properties: {} });
const MIN_5HA = 5 * 10000;

t('gleba pequena (< área mínima) NÃO some de uma zona multipolígono', () => {
  const g = { type: 'MultiPolygon', coordinates: [[GRANDE], [PEQUENA]] };
  const r = limparGeometria(g, MIN_5HA);
  assert.equal(r.type, 'MultiPolygon');
  assert.equal(r.coordinates.length, 2);
  assert.ok(Math.abs(area(r) - area(g)) < 1);
});

t('zona inteira menor que a área mínima continua inteira', () => {
  const g = { type: 'Polygon', coordinates: [PEQUENA] };
  const r = limparGeometria(g, MIN_5HA);
  assert.ok(Math.abs(area(r) - area(g)) < 1);
});

t('fundir zonas preserva a gleba separada', () => {
  const f = coords => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } });
  const { geometry } = unirFeatures([f(GRANDE), f(PEQUENA)], MIN_5HA);
  assert.ok(Math.abs(area(geometry) - (area(f(GRANDE).geometry) + area(f(PEQUENA).geometry))) < 5);
});

t('buraco menor que a área mínima segue preenchido', () => {
  const buraco = anel(LNG + 0.01, LAT + 0.005, 0.0005, 0.0005);  // ~0,3 ha
  const g = { type: 'Polygon', coordinates: [GRANDE, buraco.slice().reverse()] };
  const r = limparGeometria(g, MIN_5HA);
  assert.equal(r.coordinates.length, 1);
});

t('anel degenerado (área ~0) é descartado', () => {
  const lixo = anel(LNG + 0.03, LAT, 0.000001, 0.000001);  // ~0,01 m²
  const g = { type: 'MultiPolygon', coordinates: [[GRANDE], [lixo]] };
  const r = limparGeometria(g, MIN_5HA);
  assert.equal(r.type, 'Polygon');
});

// DESCONTOS: furo do TALHÃO (mata, açude) que cai inteiro numa zona vira anel
// interno dela. Menor que a área mínima, era preenchido como se fosse resquício
// — a zona engolia a mata. Só sobreviviam os furos na divisa entre zonas.
const MATA = anel(LNG + 0.01, LAT + 0.005, 0.0005, 0.0005);           // ~0,3 ha
const ESTRADA = [                                                    // furo em "C": centroide fora
  [LNG + 0.003, LAT + 0.003], [LNG + 0.006, LAT + 0.003], [LNG + 0.006, LAT + 0.0034],
  [LNG + 0.0034, LAT + 0.0034], [LNG + 0.0034, LAT + 0.0056], [LNG + 0.006, LAT + 0.0056],
  [LNG + 0.006, LAT + 0.006], [LNG + 0.003, LAT + 0.006], [LNG + 0.003, LAT + 0.003],
];
const TALHAO = { type: 'Polygon', coordinates: [GRANDE, MATA.slice().reverse(), ESTRADA.slice().reverse()] };

t('desconto do talhão dentro de uma zona NÃO é preenchido', () => {
  const g = { type: 'Polygon', coordinates: [GRANDE, MATA.slice().reverse()] };
  const r = limparGeometria(g, MIN_5HA, TALHAO);
  assert.equal(r.coordinates.length, 2);
});

t('desconto em "C" (centroide fora do furo) também fica', () => {
  const g = { type: 'Polygon', coordinates: [GRANDE, ESTRADA.slice().reverse()] };
  const r = limparGeometria(g, MIN_5HA, TALHAO);
  assert.equal(r.coordinates.length, 2);
});

t('resquício (furo DENTRO do talhão) continua preenchido com o talhão informado', () => {
  const resto = anel(LNG + 0.015, LAT + 0.01, 0.0005, 0.0005);
  const g = { type: 'Polygon', coordinates: [GRANDE, resto.slice().reverse()] };
  const r = limparGeometria(g, MIN_5HA, TALHAO);
  assert.equal(r.coordinates.length, 1);
});

t('fundir duas zonas em volta da mata mantém a mata de fora', () => {
  // metade oeste e leste do talhão, a divisa passando no meio da mata
  const meio = LNG + 0.01025;
  const tal = { type: 'Polygon', coordinates: [GRANDE, MATA.slice().reverse()] };
  // as zonas já vêm recortadas pelo talhão: a mata é um "dente" em cada uma
  const zonaO = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
    [LNG, LAT], [meio, LAT], [meio, LAT + 0.005], [LNG + 0.01, LAT + 0.005], [LNG + 0.01, LAT + 0.0055],
    [meio, LAT + 0.0055], [meio, LAT + 0.015], [LNG, LAT + 0.015], [LNG, LAT]]] } };
  const zonaL = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
    [meio, LAT], [LNG + 0.02, LAT], [LNG + 0.02, LAT + 0.015], [meio, LAT + 0.015], [meio, LAT + 0.0055],
    [LNG + 0.0105, LAT + 0.0055], [LNG + 0.0105, LAT + 0.005], [meio, LAT + 0.005], [meio, LAT]]] } };
  const { geometry } = unirFeatures([zonaO, zonaL], MIN_5HA, tal);
  assert.ok(Math.abs(area(geometry) - area(tal)) < 5, `área ${area(geometry)} × talhão ${area(tal)}`);
  const sem = unirFeatures([zonaO, zonaL], MIN_5HA).geometry;   // sem o talhão: comportamento antigo
  assert.ok(area(sem) > area(tal) + 1000);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
