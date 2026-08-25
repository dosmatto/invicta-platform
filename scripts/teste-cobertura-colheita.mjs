// Cobertura do mapa de colheita — roda: npm run teste:cobertura-colheita
//
// O que este arquivo protege:
//   1. Talhao colhido pela metade tem de acusar ~50%, nao 100% (o defeito que
//      originou o modulo: o IDW preenche tudo e a metade inventada nao se
//      distingue da medida).
//   2. LINHA 0 = NORTE. Errar isso espelha o mapa no eixo Y e o erro so aparece
//      muito adiante, num mapa de cabeca para baixo.
//   3. O raio e em METROS e tem de escalar com o pixel.
//   4. Buraco no meio pesa diferente de franja espalhada (maiorVazioHa).

import assert from 'node:assert/strict';
import {
  coberturaEmGrid, coberturaEmPoligono, recortarPorCobertura,
  distanciaAteMarcada, nivelCobertura, metrosPorGrau,
} from '../src/lib/cobertura.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Malha 40x40 sobre ~400 x 400 m, pixel 10 m
const R = 40, C = 40;
const B = [-50.20, -25.10, -50.1960, -25.0964];   // ~400 m de lado
const dentroTudo = new Float32Array(R * C).fill(5000);
const mpg = metrosPorGrau((B[1] + B[3]) / 2);
const lngDe = c => B[0] + (c / (C - 1)) * (B[2] - B[0]);
const latDe = r => B[3] - (r / (R - 1)) * (B[3] - B[1]);   // linha 0 = norte
const pixelM = ((B[2] - B[0]) * mpg.x) / (C - 1);

console.log(`\nmalha ${R}x${C} | pixel ~${pixelM.toFixed(1)} m`);

console.log('\ndistanciaAteMarcada');

t('celula marcada tem distancia zero', () => {
  const m = new Uint8Array(9); m[4] = 1;
  const d = distanciaAteMarcada(m, 3, 3);
  assert.equal(d[4], 0);
});

t('vizinho ortogonal ~1 celula, diagonal ~1,33 (chanfro 3-4)', () => {
  const m = new Uint8Array(9); m[4] = 1;
  const d = distanciaAteMarcada(m, 3, 3);
  assert.ok(Math.abs(d[1] - 1) < 1e-6, `ortogonal=${d[1]}`);
  assert.ok(Math.abs(d[0] - 4 / 3) < 1e-6, `diagonal=${d[0]}`);
});

t('sem nenhuma marcada, tudo fica muito longe', () => {
  const d = distanciaAteMarcada(new Uint8Array(9), 3, 3);
  d.forEach(v => assert.ok(v > 1e6));
});

console.log('\ncoberturaEmGrid');

// pontos cobrindo TODA a malha
const todos = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) todos.push({ lng: lngDe(c), lat: latDe(r) });

t('todo o talhao coberto = 100%', () => {
  const cob = coberturaEmGrid(dentroTudo, R, C, B, todos, pixelM, pixelM * 1.5);
  assert.equal(cob.nDentro, R * C);
  assert.ok(Math.abs(cob.pctCobertura - 100) < 1e-6, `${cob.pctCobertura}`);
  assert.equal(cob.areaSemDadoHa, 0);
  assert.equal(cob.maiorVazioHa, 0);
});

t('metade NORTE colhida acusa ~50% (e a metade certa)', () => {
  const metade = todos.filter(p => p.lat > (B[1] + B[3]) / 2);
  const cob = coberturaEmGrid(dentroTudo, R, C, B, metade, pixelM, pixelM * 1.2);
  assert.ok(Math.abs(cob.pctCobertura - 50) < 6, `${cob.pctCobertura}%`);
  // linha 0 = norte: as PRIMEIRAS linhas tem de estar cobertas
  assert.equal(cob.mascara[0 * C + 0], 1, 'canto NO deveria estar coberto');
  assert.equal(cob.mascara[(R - 1) * C + 0], 0, 'canto SO deveria estar sem dado');
});

t('metade SUL colhida espelha o resultado (guarda do eixo Y)', () => {
  const metade = todos.filter(p => p.lat <= (B[1] + B[3]) / 2);
  const cob = coberturaEmGrid(dentroTudo, R, C, B, metade, pixelM, pixelM * 1.2);
  assert.equal(cob.mascara[0 * C + 0], 0, 'canto NO deveria estar sem dado');
  assert.equal(cob.mascara[(R - 1) * C + 0], 1, 'canto SO deveria estar coberto');
});

t('sem ponto nenhum = 0% e area toda sem dado', () => {
  const cob = coberturaEmGrid(dentroTudo, R, C, B, [], pixelM, 15);
  assert.equal(cob.pctCobertura, 0);
  assert.equal(cob.nCobertas, 0);
  assert.ok(Math.abs(cob.areaSemDadoHa - cob.areaHa) < 1e-9);
});

t('area do talhao = celulas dentro x area do pixel', () => {
  const cob = coberturaEmGrid(dentroTudo, R, C, B, todos, pixelM, 15);
  assert.ok(Math.abs(cob.areaHa - (R * C * pixelM * pixelM) / 10000) < 1e-9);
  assert.ok(Math.abs(cob.areaCobertaHa + cob.areaSemDadoHa - cob.areaHa) < 1e-9);
});

t('celula fora do talhao (NaN no grid) nao entra na conta', () => {
  const g = Float32Array.from(dentroTudo);
  for (let c = 0; c < C; c++) g[c] = NaN;             // 1a linha fora
  const cob = coberturaEmGrid(g, R, C, B, todos, pixelM, 15);
  assert.equal(cob.nDentro, R * C - C);
  assert.equal(cob.mascara[0], 2, 'fora deveria ser 2');
});

t('raio maior cobre mais — e escala com o pixel', () => {
  const esparsos = todos.filter((_, i) => i % 40 === 0);   // 1 ponto por linha
  const curto = coberturaEmGrid(dentroTudo, R, C, B, esparsos, pixelM, pixelM);
  const longo = coberturaEmGrid(dentroTudo, R, C, B, esparsos, pixelM, pixelM * 6);
  assert.ok(longo.pctCobertura > curto.pctCobertura, `${longo.pctCobertura} <= ${curto.pctCobertura}`);
});

t('buraco unico no meio aparece em maiorVazioHa', () => {
  const comBuraco = todos.filter(p => {
    const c = Math.round((p.lng - B[0]) / ((B[2] - B[0]) / (C - 1)));
    const r = Math.round((B[3] - p.lat) / ((B[3] - B[1]) / (R - 1)));
    return !(r > 14 && r < 25 && c > 14 && c < 25);      // ~10x10 celulas
  });
  const cob = coberturaEmGrid(dentroTudo, R, C, B, comBuraco, pixelM, pixelM * 0.9);
  assert.ok(cob.areaSemDadoHa > 0, 'esperava area sem dado');
  // o vazio e UM so: o maior componente tem de ser praticamente toda a falta
  assert.ok(cob.maiorVazioHa > cob.areaSemDadoHa * 0.8, `${cob.maiorVazioHa} de ${cob.areaSemDadoHa}`);
});

console.log('\nrecortarPorCobertura');

t('celula sem dado vira NaN; coberta preserva o valor', () => {
  const metade = todos.filter(p => p.lat > (B[1] + B[3]) / 2);
  const cob = coberturaEmGrid(dentroTudo, R, C, B, metade, pixelM, pixelM * 1.2);
  const out = recortarPorCobertura(dentroTudo, cob);
  let finitos = 0;
  for (let i = 0; i < out.length; i++) {
    if (cob.mascara[i] === 1) { assert.equal(out[i], 5000); finitos++; }
    else assert.ok(Number.isNaN(out[i]));
  }
  assert.equal(finitos, cob.nCobertas);
});

t('nao altera o array original', () => {
  const cob = coberturaEmGrid(dentroTudo, R, C, B, [], pixelM, 15);
  const antes = dentroTudo[0];
  recortarPorCobertura(dentroTudo, cob);
  assert.equal(dentroTudo[0], antes);
});

console.log('\ncoberturaEmPoligono');

const quadrado = {
  type: 'Polygon',
  coordinates: [[[B[0], B[1]], [B[2], B[1]], [B[2], B[3]], [B[0], B[3]], [B[0], B[1]]]],
};
// ray casting simples, so para o teste
const dentroPoly = (lng, lat, g) => {
  const anel = g.coordinates[0];
  let d = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) d = !d;
  }
  return d;
};

t('poligono cheio de pontos = cobertura alta', () => {
  const cob = coberturaEmPoligono(quadrado, todos, 10, 20, dentroPoly);
  assert.ok(cob, 'esperava resultado');
  assert.ok(cob.pctCobertura > 90, `${cob.pctCobertura}%`);
});

t('poligono sem pontos = 0%', () => {
  const cob = coberturaEmPoligono(quadrado, [], 10, 20, dentroPoly);
  assert.equal(cob.pctCobertura, 0);
});

t('pixel fino em talhao grande nao estoura a malha', () => {
  const cob = coberturaEmPoligono(quadrado, todos, 0.05, 20, dentroPoly, 50_000);
  assert.ok(cob.rows * cob.cols <= 50_000 * 1.3, `${cob.rows}x${cob.cols}`);
  assert.ok(cob.pixelM > 0.05, 'o pixel deveria ter sido afrouxado');
});

console.log('\nnivelCobertura');

t('regua: >=95 ok, >=85 atencao, abaixo ruim', () => {
  assert.equal(nivelCobertura(100), 'ok');
  assert.equal(nivelCobertura(95), 'ok');
  assert.equal(nivelCobertura(94.9), 'atencao');
  assert.equal(nivelCobertura(85), 'atencao');
  assert.equal(nivelCobertura(84.9), 'ruim');
  assert.equal(nivelCobertura(0), 'ruim');
});

console.log(`\n${ok} ok, ${fail} falhas\n`);
process.exit(fail ? 1 : 0);
