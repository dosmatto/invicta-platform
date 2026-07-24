// Testes das exportações de Zonas de Manejo (derivação de linhas internas,
// áreas, GeoJSON e KML). Node 22+ (type-stripping): `npm run teste:zonas`.
import assert from 'node:assert/strict';
import {
  derivarLinhasInternas, montarDadosZonas, geojsonPoligonos, geojsonLinhas, gerarKMLZonas,
} from '../src/lib/exportZonas.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const W = -47.90, S = -21.20, D = 0.01;
const quad = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

// Cobertura 2×1: duas zonas adjacentes compartilhando a aresta x=W+D
const zonaA = { idZona: 'A', geometry: quad(W, S, W + D, S + D) };
const zonaB = { idZona: 'B', geometry: quad(W + D, S, W + 2 * D, S + D) };

t('2 zonas adjacentes → 1 divisa interna', () => {
  const linhas = derivarLinhasInternas([zonaA, zonaB]);
  assert.equal(linhas.length, 1, `esperava 1 divisa, veio ${linhas.length}`);
  assert.equal(linhas[0].zonaEsq, 'A');
  assert.equal(linhas[0].zonaDir, 'B');
  assert.equal(linhas[0].geometry.type, 'LineString');
  const c = linhas[0].geometry.coordinates;
  assert.equal(c.length, 2, `esperava 2 vértices, veio ${c.length}`);
  // a divisa é a aresta compartilhada em x=W+D
  assert.ok(c.every(p => Math.abs(p[0] - (W + D)) < 1e-9), 'divisa deve estar em x=W+D');
});

t('2 zonas separadas (sem aresta comum) → 0 divisas', () => {
  const zonaC = { idZona: 'C', geometry: quad(W + 3 * D, S, W + 4 * D, S + D) };
  assert.equal(derivarLinhasInternas([zonaA, zonaC]).length, 0);
});

t('grade 2×2 (4 zonas) → 4 divisas internas', () => {
  const Wm = W + D, Sm = S + D;
  const A = { idZona: 'A', geometry: quad(W, S, Wm, Sm) };
  const B = { idZona: 'B', geometry: quad(Wm, S, W + 2 * D, Sm) };
  const C = { idZona: 'C', geometry: quad(W, Sm, Wm, S + 2 * D) };
  const Dz = { idZona: 'D', geometry: quad(Wm, Sm, W + 2 * D, S + 2 * D) };
  const linhas = derivarLinhasInternas([A, B, C, Dz]);
  assert.equal(linhas.length, 4, `esperava 4 divisas, veio ${linhas.length}`);
  const pares = linhas.map(l => `${l.zonaEsq}${l.zonaDir}`).sort();
  assert.deepEqual(pares, ['AB', 'AC', 'BD', 'CD']);
});

t('montarDadosZonas: áreas, % somam 100, total', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { id: 'A', zona: '1', classe: 'Alta', cor: '#16a34a', areaHa: 30 }, geometry: zonaA.geometry },
      { type: 'Feature', properties: { id: 'B', zona: '2', classe: 'Baixa', cor: '#dc2626', areaHa: 10 }, geometry: zonaB.geometry },
    ],
  };
  const d = montarDadosZonas(fc, {
    idMapa: 'm1', nomeMapa: 'Zoneamento 1', produtor: 'Fazendão Ção', fazenda: 'Faz. Álamo',
    talhao: 'T-01', dataMapa: '2026-05-10T12:00:00Z', externo: quad(W, S, W + 2 * D, S + D),
  });
  assert.equal(d.zonas.length, 2);
  assert.equal(d.areaTotalHa, 40);
  assert.ok(Math.abs(d.zonas[0].pctArea - 75) < 1e-6, `A deveria ser 75%, veio ${d.zonas[0].pctArea}`);
  assert.ok(Math.abs(d.zonas.reduce((s, z) => s + z.pctArea, 0) - 100) < 1e-6, '% devem somar 100');
  assert.equal(d.linhas.length, 1);
  assert.ok(d.areaTalhaoHa > 0);
});

t('geojsonPoligonos: 1 registro por zona + campos do spec', () => {
  const fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { id: 'A', zona: '1', classe: 'Alta', areaHa: 30 }, geometry: zonaA.geometry },
    { type: 'Feature', properties: { id: 'B', zona: '2', classe: 'Baixa', areaHa: 10 }, geometry: zonaB.geometry },
  ] };
  const d = montarDadosZonas(fc, { idMapa: 'm1', nomeMapa: 'Z1', produtor: 'P', fazenda: 'F', talhao: 'T', dataMapa: '2026-05-10T00:00:00Z', externo: null });
  const g = geojsonPoligonos(d);
  assert.equal(g.features.length, 2);
  const p = g.features[0].properties;
  for (const campo of ['id_zona', 'nome_zona', 'id_mapa', 'produtor', 'fazenda', 'talhao', 'area_ha', 'classe', 'data_mapa']) {
    assert.ok(campo in p, `faltou campo ${campo}`);
  }
  assert.equal(p.data_mapa, '2026-05-10');
  const gl = geojsonLinhas(d);
  for (const campo of ['id_linha', 'id_mapa', 'tipo', 'zona_esq', 'zona_dir']) {
    assert.ok(campo in gl.features[0].properties, `faltou campo de linha ${campo}`);
  }
});

t('KML: pastas Zonas + Linhas internas, acentos escapados/preservados, WGS84', () => {
  const fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { id: 'A', zona: '1', classe: 'Alta', cor: '#16a34a', areaHa: 30 }, geometry: zonaA.geometry },
    { type: 'Feature', properties: { id: 'B', zona: '2', classe: 'Baixa', cor: '#dc2626', areaHa: 10 }, geometry: zonaB.geometry },
  ] };
  const d = montarDadosZonas(fc, { idMapa: 'm1', nomeMapa: 'Zôna & Cia <teste>', produtor: 'João Ção', fazenda: 'Álamo', talhao: 'T-01', dataMapa: '2026-05-10T00:00:00Z', externo: quad(W, S, W + 2 * D, S + D) });
  const kml = gerarKMLZonas(d);
  assert.ok(kml.includes('encoding="UTF-8"'));
  assert.ok(kml.includes('<name>Zonas</name>'));
  assert.ok(kml.includes('<name>Linhas internas</name>'));
  assert.ok(kml.includes('João Ção'), 'acentos preservados');
  assert.ok(kml.includes('&amp;') && kml.includes('&lt;teste&gt;'), 'XML escapado');
  assert.ok(kml.includes('<LineString>'), 'tem linhas internas');
  assert.ok(!/undefined|NaN/.test(kml), 'sem undefined/NaN');
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
