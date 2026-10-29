// Testes da TRAVA DE UTM no import (lib/coordenadasProjetadas). Travamos:
//   • arquivo em graus passa intacto (mesmo objeto, sem aviso);
//   • UTM com EPSG declarado é reprojetado no fuso do EPSG;
//   • UTM sem EPSG é reprojetado no fuso da REFERÊNCIA (talhão/fazenda);
//   • a ida e volta UTM ↔ graus erra menos de 1 cm;
//   • recusa: sem fuso e sem referência, SAD69, fora da referência, nem grau nem UTM.
// Caso real: talhão 115 da NHAZINHA (Ponta Grossa, 22S), importado em 28/10/2026.
// Roda: `npm run teste:utm`
import assert from 'node:assert/strict';
import { garantirGraus, deUtm, fusoDoEpsg, epsgDeclarado, referenciaDeBboxes } from '../src/lib/coordenadasProjetadas.ts';
import { paraUtm } from '../src/lib/precisionfarm/compararLimite.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const F22S = { zona: 22, sul: true };
// quadrado de ~100 m em Ponta Grossa, em graus e em UTM 22S
const graus = [[-50.1148, -25.3083], [-50.1138, -25.3083], [-50.1138, -25.3073], [-50.1148, -25.3073], [-50.1148, -25.3083]];
const utm = graus.map(([lon, lat]) => paraUtm(lon, lat, F22S));
const fc = (anel, extra = {}) => ({ type: 'FeatureCollection', ...extra,
  features: [{ type: 'Feature', properties: { Talhao: '115' }, geometry: { type: 'Polygon', coordinates: [anel] } }] });
const REF_FAZENDA = [-50.11, -25.30];

const pertoDe = (a, b, tolGraus = 1e-7) => a.every((v, i) => Math.abs(v - b[i]) < tolGraus); // 1e-7° ≈ 1 cm

t('ida e volta UTM ↔ graus erra menos de 1 cm', () => {
  for (const p of graus) assert.ok(pertoDe(deUtm(...paraUtm(p[0], p[1], F22S), F22S), p), `ponto ${p}`);
  // longe do meridiano central e no outro hemisfério também
  for (const [p, f] of [[[-53.9, -25.5], F22S], [[-47.1, -15.8], { zona: 23, sul: true }], [[-60.0, 2.5], { zona: 20, sul: false }]]) {
    assert.ok(pertoDe(deUtm(...paraUtm(p[0], p[1], f), f), p), `ponto ${p}`);
  }
});

t('arquivo em graus passa intacto', () => {
  const entrada = fc(graus);
  const r = garantirGraus(entrada, REF_FAZENDA);
  assert.equal(r.fc, entrada);
  assert.equal(r.aviso, null);
});

t('UTM sem EPSG + referência da fazenda → reprojeta no 22S (caso do talhão 115)', () => {
  const r = garantirGraus(fc(utm), REF_FAZENDA);
  const anel = r.fc.features[0].geometry.coordinates[0];
  anel.forEach((p, i) => assert.ok(pertoDe(p, graus[i]), `vértice ${i}: ${p}`));
  assert.match(r.aviso, /UTM 22S/);
  assert.deepEqual(r.fc.features[0].properties, { Talhao: '115' });
});

t('UTM com EPSG:31982 declarado reprojeta mesmo sem referência', () => {
  const r = garantirGraus(fc(utm, { crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::31982' } } }), null);
  assert.ok(pertoDe(r.fc.features[0].geometry.coordinates[0][0], graus[0]));
  assert.match(r.aviso, /EPSG:31982/);
});

t('EPSG declarado vence a referência', () => {
  // arquivo do 23S declarado, referência no 22S próxima (Ponta Grossa ↔ divisa)
  const p23 = [[-47.9, -15.8], [-47.89, -15.8], [-47.89, -15.79], [-47.9, -15.8]];
  const u23 = p23.map(([a, b]) => paraUtm(a, b, { zona: 23, sul: true }));
  const r = garantirGraus(fc(u23, { crs: { properties: { name: 'EPSG:31983' } } }), [-47.9, -15.8]);
  assert.ok(pertoDe(r.fc.features[0].geometry.coordinates[0][0], p23[0]));
});

t('recusa: UTM sem EPSG e sem referência', () => {
  assert.throws(() => garantirGraus(fc(utm), null), /sem indicação do fuso/);
});

t('recusa: SAD69', () => {
  assert.throws(() => garantirGraus(fc(utm, { crs: { properties: { name: 'EPSG:29192' } } }), REF_FAZENDA), /SAD69/);
});

t('recusa: reprojetado cai longe da referência', () => {
  // referência em Mato Grosso (fuso 21S): o arquivo do 22S cai a centenas de km
  assert.throws(() => garantirGraus(fc(utm), [-55.5, -12.5]), /km do talhão/);
});

t('recusa: nem grau nem UTM', () => {
  assert.throws(() => garantirGraus(fc([[5e6, 1], [5e6 + 10, 1], [5e6, 11], [5e6, 1]]), REF_FAZENDA), /não são graus nem UTM/);
});

t('origem do fuso: E 500 km no meridiano central, N 10.000 km no equador (sul)', () => {
  assert.ok(pertoDe(deUtm(500000, 10_000_000, F22S), [-51, 0], 1e-9));
  assert.ok(pertoDe(deUtm(500000, 0, { zona: 22, sul: false }), [-51, 0], 1e-9));
});

t('fusoDoEpsg / epsgDeclarado', () => {
  assert.deepEqual(fusoDoEpsg(31978), { zona: 18, sul: true });
  assert.deepEqual(fusoDoEpsg(31985), { zona: 25, sul: true });
  assert.deepEqual(fusoDoEpsg(31976), { zona: 21, sul: false });
  assert.deepEqual(fusoDoEpsg(32722), { zona: 22, sul: true });
  assert.equal(fusoDoEpsg(29192), 'sad69');
  assert.equal(fusoDoEpsg(3857), null);
  assert.equal(epsgDeclarado({ crs: { properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } } }), 4326);
  assert.equal(epsgDeclarado({ crs: { properties: { name: 'EPSG:31982' } } }), 31982);
  assert.equal(epsgDeclarado({}), null);
});

t('referenciaDeBboxes pula bbox em UTM (o talhão quebrado) e usa o primeiro em graus', () => {
  const quebrado = [588607.8, 7200155.9, 589699.0, 7201402.0];
  assert.deepEqual(referenciaDeBboxes([quebrado, undefined, [-50.12, -25.31, -50.10, -25.30]]), [-50.11, -25.305]);
  assert.equal(referenciaDeBboxes([quebrado]), null);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
