// Testes do AJUSTE DAS ZONAS AO LIMITE ATUAL (lib/meap/ajustarAoLimite) — a tesoura
// das versões de zoneamento. Travamos as garantias que o agrônomo enxerga:
//   • nada fica fora do contorno novo e nada do contorno novo fica sem zona;
//   • as zonas não se sobrepõem;
//   • o vão é dado à zona MAIS PRÓXIMA (não a uma qualquer);
//   • propriedades preservadas, areaHa recalculada, zona que sumiu vira aviso.
// Roda: `npm run teste:ajustar-limite`
import assert from 'node:assert/strict';
import turfArea from '@turf/area';
import intersect from '@turf/intersect';
import { featureCollection, feature } from '@turf/helpers';
import { ajustarZonasAoLimite } from '../src/lib/meap/ajustarAoLimite.ts';
import { areaHaGeo } from '../src/lib/areaGeo.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const LNG = -50.3, LAT = -24.42;
const D = 0.001; // ~100 m em longitude, ~111 m em latitude
const ret = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[
  [LNG + x0 * D, LAT + y0 * D], [LNG + x1 * D, LAT + y0 * D], [LNG + x1 * D, LAT + y1 * D],
  [LNG + x0 * D, LAT + y1 * D], [LNG + x0 * D, LAT + y0 * D]]] });
const zona = (geom, zona, extra = {}) => ({ type: 'Feature', properties: { zona, cor: '#000', ...extra }, geometry: geom });
const ha = (g) => turfArea(g) / 1e4;

// Zoneamento antigo: Z1 à esquerda (0–5), Z2 à direita (5–10), altura 0–10.
const antigo = featureCollection([zona(ret(0, 0, 5, 10), 'Z1', { id: 'a' }), zona(ret(5, 0, 10, 10), 'Z2', { id: 'b' })]);

t('limite DESLOCADO: corta o que passa e preenche o vão', () => {
  const limite = ret(1, 0, 12, 10); // perdeu a faixa 0–1, ganhou 10–12
  const r = ajustarZonasAoLimite(antigo, limite);
  const soma = r.fc.features.reduce((s, f) => s + ha(f), 0);
  assert.ok(Math.abs(soma - ha(limite)) / ha(limite) < 1e-3, `soma ${soma} ≠ talhão ${ha(limite)}`);
  assert.ok(r.resumo.coberturaPct > 99.9);
  assert.ok(r.resumo.areaGanhaHa > 0 && r.resumo.areaPerdidaHa > 0);
  // a faixa nova (10–12) encosta só na Z2 → vai toda para a Z2
  const z2 = r.fc.features.find(f => f.properties.zona === 'Z2');
  const faixa = intersect(featureCollection([feature(ret(10, 0, 12, 10)), z2]));
  assert.ok(faixa && Math.abs(ha(faixa) - ha(ret(10, 0, 12, 10))) / ha(ret(10, 0, 12, 10)) < 1e-3);
});

t('as zonas não se sobrepõem', () => {
  const r = ajustarZonasAoLimite(antigo, ret(-1, -1, 11, 11));
  const [a, b] = r.fc.features;
  const x = intersect(featureCollection([a, b]));
  assert.ok(!x || turfArea(x) < 1, `sobreposição de ${x && turfArea(x)} m²`);
});

t('vão no meio vai à zona mais próxima de cada lado', () => {
  // zonas antigas com um corredor vazio de 4–6 no meio
  const fc = featureCollection([zona(ret(0, 0, 4, 10), 'Z1'), zona(ret(6, 0, 10, 10), 'Z2')]);
  const r = ajustarZonasAoLimite(fc, ret(0, 0, 10, 10));
  const [z1, z2] = r.fc.features;
  assert.ok(Math.abs(ha(z1) - ha(z2)) / ha(z1) < 0.01, `${ha(z1)} vs ${ha(z2)}`);
});

t('propriedades preservadas e areaHa recalculada', () => {
  const r = ajustarZonasAoLimite(antigo, ret(1, 0, 12, 10));
  const z1 = r.fc.features.find(f => f.properties.zona === 'Z1');
  assert.equal(z1.properties.id, 'a');
  assert.equal(z1.properties.cor, '#000');
  // área elipsoidal (casa com o QGIS), não a esférica do turf; areaHaGeo arredonda a 2 casas
  assert.ok(Math.abs(z1.properties.areaHa - areaHaGeo(z1)) <= 0.005, `${z1.properties.areaHa} vs ${areaHaGeo(z1)}`);
});

t('zona inteira fora do contorno sai e vira aviso grave', () => {
  const r = ajustarZonasAoLimite(antigo, ret(5.5, 0, 10, 10));
  assert.equal(r.fc.features.length, 1);
  assert.equal(r.resumo.nZonas, 1);
  assert.ok(r.avisos.some(a => /Z1 DESAPARECEU/.test(a)));
});

t('linhas internas: uma divisa entre Z1 e Z2', () => {
  const r = ajustarZonasAoLimite(antigo, ret(1, 0, 12, 10));
  assert.equal(r.linhas.features.length, 1);
  assert.equal(r.linhas.features[0].geometry.coordinates.length, 1);
});

t('limite igual ao antigo: nada muda', () => {
  const r = ajustarZonasAoLimite(antigo, ret(0, 0, 10, 10));
  assert.equal(r.diff.features.length, 0);
  assert.equal(r.resumo.areaGanhaHa, 0);
  assert.equal(r.resumo.areaPerdidaHa, 0);
});

t('limite que não toca nenhuma zona: erro claro, nada para salvar', () => {
  assert.throws(() => ajustarZonasAoLimite(antigo, ret(20, 0, 30, 10)), /Nenhuma zona/);
});

t('parte isolada longe de toda zona: fica SEM ZONA e não conta como preenchida', () => {
  const ilha = ret(30, 0, 32, 2); // ~1,5 km a leste — fora do alcance do Voronoi
  const limite = { type: 'MultiPolygon', coordinates: [ret(0, 0, 10, 10).coordinates, ilha.coordinates] };
  const r = ajustarZonasAoLimite(antigo, limite);
  assert.equal(r.resumo.areaGanhaHa, 0);
  assert.ok(r.resumo.coberturaPct < 99);
  assert.ok(r.avisos.some(a => /SEM ZONA/.test(a)));
  assert.ok(!r.avisos.some(a => /dados à zona mais próxima/.test(a)));
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
