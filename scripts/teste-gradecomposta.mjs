// Células quadráticas da AMOSTRAGEM COMPOSTA (src/lib/gradeComposta.ts).
// Roda: `npm run teste:gradecomposta`.
//
// As invariantes que este arquivo protege:
//
//   1. EXATAMENTE N células. O número que o usuário digita é o número de sacos
//      que ele vai despachar e de etiquetas que vai imprimir. Entregar 5 quando
//      ele pediu 4 é uma amostra órfã no laboratório.
//   2. COBERTURA EXCLUSIVA: todo hectare do talhão pertence a uma célula, e a
//      uma só. Buraco = área sem recomendação; sobreposição = hectare cobrado
//      duas vezes no fechamento de volume.
//   3. DETERMINISMO das células. O operador anda no campo com um mapa impresso
//      semanas antes; regerar tem de dar o mesmo desenho.
import assert from 'node:assert/strict';
import { gerarCelulasCompostas, pontosDaCelula, nMaximoCelulas } from '../src/lib/gradeComposta.ts';
import { areaM2Geo, areaHaGeo } from '../src/lib/areaGeo.ts';
import { numerarPontosZonas, renumerarPontosZonas, amostrasDaGrade, amostrasComProfundidade } from '../src/lib/gradeZonas.ts';
import { anguloMaiorDimensao } from '../src/lib/grid.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ok  ', n); } catch (e) { fail++; console.error('  FALHOU', n, '-', e.message); } };

const LAT = -24.5;   // Paraná
const fc = (...geoms) => ({ type: 'FeatureCollection', features: geoms.map(g => ({ type: 'Feature', properties: {}, geometry: g })) });
const anel = pts => [[...pts, pts[0]]];
const quad = (lng, lat, dLng, dLat) => ({
  type: 'Polygon',
  coordinates: anel([[lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat], [lng, lat + dLat]]),
});

// ~0,02° ≈ 2,0 km em lat; em lng na latitude -24,5 ≈ 2,02 km. Talhão de ~370 ha.
const QUADRADO = fc(quad(-50, LAT, 0.02, 0.02));

// Talhão em L (côncavo): quadrado grande menos o quarto superior direito.
const EM_L = fc({
  type: 'Polygon',
  coordinates: anel([
    [-50, LAT], [-49.98, LAT], [-49.98, LAT + 0.01],
    [-49.99, LAT + 0.01], [-49.99, LAT + 0.02], [-50, LAT + 0.02],
  ]),
});

// Duas manchas separadas por 1 km de estrada.
const DUAS_MANCHAS = fc({
  type: 'MultiPolygon',
  coordinates: [quad(-50, LAT, 0.01, 0.01).coordinates, quad(-49.98, LAT, 0.01, 0.01).coordinates],
});

// Retângulo 4:1 girado 30° — para a rotação automática.
function girar(poly, graus, lng0, lat0) {
  const a = (graus * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const k = Math.cos((lat0 * Math.PI) / 180);   // lng "encolhe" com a latitude
  return {
    type: 'Polygon',
    coordinates: poly.coordinates.map(r => r.map(([lng, lat]) => {
      const x = (lng - lng0) * k, y = lat - lat0;
      return [lng0 + (x * cos - y * sin) / k, lat0 + (x * sin + y * cos)];
    })),
  };
}
const GIRADO = fc(girar(quad(-50, LAT, 0.04, 0.01), 30, -50, LAT));

// ── point-in-polygon (ray casting), só para o teste ──────────────────────────
function dentroAnel(x, y, ring) {
  let d = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}
function dentroGeom(x, y, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) {
    if (!dentroAnel(x, y, p[0])) continue;
    let furo = false;
    for (let i = 1; i < p.length; i++) if (dentroAnel(x, y, p[i])) { furo = true; break; }
    if (!furo) return true;
  }
  return false;
}

const somaHa = cs => cs.reduce((s, c) => s + c.areaHa, 0);
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

console.log('\nCÉLULAS — contagem e cobertura');

t('N=1: uma célula igual ao talhão', () => {
  const r = gerarCelulasCompostas({ geojson: QUADRADO, nCelulas: 1, rotacaoGraus: 0 });
  assert.equal(r.celulas.length, 1);
  assert.equal(r.celulas[0].numero, 1);
  assert.equal(r.celulas[0].id, '01');
  perto(r.celulas[0].areaHa, areaHaGeo(QUADRADO), 0.02, 'área da célula única');
  assert.equal(r.motivoAjuste, undefined);
});

t('N=1 em talhão de duas manchas: UM saco para as duas', () => {
  const r = gerarCelulasCompostas({ geojson: DUAS_MANCHAS, nCelulas: 1, rotacaoGraus: 0 });
  assert.equal(r.celulas.length, 1);
  perto(r.celulas[0].areaHa, areaHaGeo(DUAS_MANCHAS), 0.02, 'área');
});

t('N=4 em quadrado: 4 células de área equivalente', () => {
  const r = gerarCelulasCompostas({ geojson: QUADRADO, nCelulas: 4, rotacaoGraus: 0 });
  assert.equal(r.celulas.length, 4);
  const total = areaHaGeo(QUADRADO), media = total / 4;
  for (const c of r.celulas) perto(c.areaHa, media, media * 0.03, `célula ${c.id}`);
  perto(somaHa(r.celulas), total, total * 0.005, 'soma das células');
});

t('N=9 em quadrado: 9 células, soma fecha', () => {
  const r = gerarCelulasCompostas({ geojson: QUADRADO, nCelulas: 9, rotacaoGraus: 0 });
  assert.equal(r.celulas.length, 9);
  perto(somaHa(r.celulas), areaHaGeo(QUADRADO), areaHaGeo(QUADRADO) * 0.005, 'soma');
});

t('talhão em L: contagem EXATA para N variados', () => {
  const total = areaHaGeo(EM_L);
  for (const n of [2, 3, 5, 7, 12]) {
    const r = gerarCelulasCompostas({ geojson: EM_L, nCelulas: n, rotacaoGraus: 0 });
    assert.equal(r.celulas.length, n, `N=${n} devolveu ${r.celulas.length}`);
    perto(somaHa(r.celulas), total, total * 0.005, `soma com N=${n}`);
    assert.notEqual(r.motivoAjuste, 'recorte-falhou', `N=${n} acusou recorte-falhou`);
  }
});

t('cobertura EXCLUSIVA: cada ponto do talhão em exatamente uma célula', () => {
  const r = gerarCelulasCompostas({ geojson: EM_L, nCelulas: 6, rotacaoGraus: 0 });
  let semente = 12345;
  const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const g = EM_L.features[0].geometry;
  let testados = 0;
  for (let i = 0; i < 400 && testados < 200; i++) {
    const lng = -50 + rnd() * 0.02, lat = LAT + rnd() * 0.02;
    if (!dentroGeom(lng, lat, g)) continue;
    testados++;
    const n = r.celulas.filter(c => dentroGeom(lng, lat, c.geometry)).length;
    assert.equal(n, 1, `ponto ${lng.toFixed(5)},${lat.toFixed(5)} caiu em ${n} células`);
  }
  assert.ok(testados >= 100, `só ${testados} pontos internos sorteados`);
});

console.log('\nCÉLULAS — manchas, sobras e limites');

t('duas manchas com N=2: uma célula por mancha', () => {
  const r = gerarCelulasCompostas({ geojson: DUAS_MANCHAS, nCelulas: 2, rotacaoGraus: 0 });
  assert.equal(r.celulas.length, 2);
  // centroides em manchas diferentes (lng bem distintas)
  const cx = r.celulas.map(c => {
    const pts = (c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates).flat(2);
    return pts.reduce((s, p) => s + p[0], 0) / pts.length;
  }).sort((a, b) => a - b);
  assert.ok(cx[1] - cx[0] > 0.01, `centroides muito próximos: ${cx}`);
});

t('N menor que o nº de manchas: sobe para o nº de manchas e avisa', () => {
  const tres = fc({
    type: 'MultiPolygon',
    coordinates: [
      quad(-50, LAT, 0.006, 0.006).coordinates,
      quad(-49.98, LAT, 0.006, 0.006).coordinates,
      quad(-49.96, LAT, 0.006, 0.006).coordinates,
    ],
  });
  const r = gerarCelulasCompostas({ geojson: tres, nCelulas: 2, rotacaoGraus: 0 });
  assert.equal(r.celulas.length, 3);
  assert.equal(r.motivoAjuste, 'manchas-separadas');
  assert.equal(r.nPedido, 2);
});

t('nenhuma célula vira tira fina: a sobra vai para a vizinha', () => {
  const r = gerarCelulasCompostas({ geojson: EM_L, nCelulas: 5, rotacaoGraus: 0 });
  const media = somaHa(r.celulas) / r.celulas.length;
  for (const c of r.celulas) assert.ok(c.areaHa > media * 0.15, `célula ${c.id} com ${c.areaHa} ha (média ${media.toFixed(1)})`);
});

t('N acima do que a área comporta: corta no teto e avisa', () => {
  const pequeno = fc(quad(-50, LAT, 0.002, 0.002));   // ~3,7 ha
  const teto = nMaximoCelulas(pequeno);
  const r = gerarCelulasCompostas({ geojson: pequeno, nCelulas: teto + 50, rotacaoGraus: 0 });
  assert.equal(r.motivoAjuste, 'area-insuficiente');
  assert.ok(r.celulas.length <= teto, `${r.celulas.length} células para um teto de ${teto}`);
});

t('ids e números contíguos, únicos e casados', () => {
  const r = gerarCelulasCompostas({ geojson: EM_L, nCelulas: 7, rotacaoGraus: 0 });
  const nums = r.celulas.map(c => c.numero);
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(r.celulas.map(c => c.id)).size, 7);
  for (const c of r.celulas) assert.equal(c.id, String(c.numero).padStart(2, '0'));
});

t('células são DETERMINÍSTICAS (sem sorteio)', () => {
  const a = gerarCelulasCompostas({ geojson: EM_L, nCelulas: 5, rotacaoGraus: 0 });
  const b = gerarCelulasCompostas({ geojson: EM_L, nCelulas: 5, rotacaoGraus: 0 });
  assert.equal(JSON.stringify(a.celulas), JSON.stringify(b.celulas));
});

t('talhão girado: grade acompanha a rotação pedida', () => {
  const r = gerarCelulasCompostas({ geojson: GIRADO, nCelulas: 4, rotacaoGraus: 30 });
  assert.equal(r.celulas.length, 4);
  const media = somaHa(r.celulas) / 4;
  for (const c of r.celulas) perto(c.areaHa, media, media * 0.08, `célula ${c.id} do retângulo girado`);
  perto(somaHa(r.celulas), areaHaGeo(GIRADO), areaHaGeo(GIRADO) * 0.005, 'soma');
});

t('rotação automática é aceita e fecha a contagem', () => {
  // `anguloMaiorDimensao` é a mesma da aba Grid (mede o par de vértices mais
  // distante, em graus) — aqui só se garante que a composta a consome sem
  // quebrar a contagem nem a cobertura.
  const ang = anguloMaiorDimensao(GIRADO);
  const r = gerarCelulasCompostas({ geojson: GIRADO, nCelulas: 4, rotacaoGraus: ang });
  assert.equal(r.celulas.length, 4);
  perto(somaHa(r.celulas), areaHaGeo(GIRADO), areaHaGeo(GIRADO) * 0.005, 'soma');
});

console.log('\nSUBAMOSTRAS (os furos dentro da célula)');

const celulaDe = (geojson, n = 1) => gerarCelulasCompostas({ geojson, nCelulas: n, rotacaoGraus: 0 }).celulas[0];

t('M=10 numa célula grande: exatamente 10 furos, todos dentro', () => {
  const c = celulaDe(QUADRADO, 4);
  const pts = pontosDaCelula({ celula: c, subamostras: 10, distanciaBordaM: 5, rotacaoGraus: 0, aleatoriedade: 0, seed: 7 });
  assert.equal(pts.length, 10);
  for (const p of pts) assert.ok(dentroGeom(p.lng, p.lat, c.geometry), `furo fora da célula: ${p.lng},${p.lat}`);
});

t('M=1: um furo só, dentro', () => {
  const c = celulaDe(QUADRADO, 4);
  const pts = pontosDaCelula({ celula: c, subamostras: 1, distanciaBordaM: 5, rotacaoGraus: 0, aleatoriedade: 0, seed: 3 });
  assert.equal(pts.length, 1);
  assert.ok(dentroGeom(pts[0].lng, pts[0].lat, c.geometry));
});

t('furos são determinísticos por seed, e a seed muda o desenho', () => {
  const c = celulaDe(QUADRADO, 4);
  const p = s => JSON.stringify(pontosDaCelula({ celula: c, subamostras: 8, distanciaBordaM: 5, rotacaoGraus: 0, aleatoriedade: 40, seed: s }));
  assert.equal(p(11), p(11));
  assert.notEqual(p(11), p(12));
});

t('célula minúscula com borda grossa ainda recebe furo', () => {
  const c = celulaDe(fc(quad(-50, LAT, 0.0008, 0.0008)));   // ~0,6 ha
  const pts = pontosDaCelula({ celula: c, subamostras: 10, distanciaBordaM: 40, rotacaoGraus: 0, aleatoriedade: 0, seed: 1 });
  assert.ok(pts.length >= 1, 'nenhum furo — o campo não saberia o que coletar');
  assert.ok(pts.length <= 10, `${pts.length} furos para M=10`);
  for (const p of pts) assert.ok(dentroGeom(p.lng, p.lat, c.geometry), 'furo fora da célula');
});

t('cada furo cai na SUA célula, nunca na vizinha', () => {
  const r = gerarCelulasCompostas({ geojson: EM_L, nCelulas: 4, rotacaoGraus: 0 });
  for (const c of r.celulas) {
    const pts = pontosDaCelula({ celula: c, subamostras: 6, distanciaBordaM: 5, rotacaoGraus: 0, aleatoriedade: 0, seed: 9 });
    assert.equal(pts.length, 6, `célula ${c.id} com ${pts.length} furos`);
    for (const p of pts) {
      const quantas = r.celulas.filter(x => dentroGeom(p.lng, p.lat, x.geometry));
      assert.equal(quantas.length, 1, `furo em ${quantas.length} células`);
      assert.equal(quantas[0].id, c.id, `furo da célula ${c.id} caiu na ${quantas[0].id}`);
    }
  }
});

t('área da célula bate com a geodésica da geometria', () => {
  const r = gerarCelulasCompostas({ geojson: EM_L, nCelulas: 3, rotacaoGraus: 0 });
  for (const c of r.celulas) perto(c.areaHa, areaM2Geo(c.geometry) / 10000, 0.02, `célula ${c.id}`);
});

console.log('\nCADEIA COMPLETA — célula → furo → saco → etiqueta');

// É aqui que a composta encontra o resto da plataforma: a numeração é a MESMA
// da grade de zonas modelo A (lib/gradeZonas), e é ela que liga o laudo de volta
// à área. Se este bloco quebrar, o número do saco e o número da área divergem —
// e o laudo é aplicado na célula errada, sem nada na tela denunciar.
function gradeComposta(geojson, n, m) {
  const r = gerarCelulasCompostas({ geojson, nCelulas: n, rotacaoGraus: 0 });
  const porCelula = r.celulas.map(c => ({
    id: c.id,
    pts: pontosDaCelula({ celula: c, subamostras: m, distanciaBordaM: 5, rotacaoGraus: 0, aleatoriedade: 0, seed: 1 }),
  }));
  return { celulas: r.celulas, pontos: numerarPontosZonas(porCelula, 'A', ['00-20', '20-40']) };
}

t('4 células × 10 furos: 40 pontos, ordem global sem buraco', () => {
  const { pontos } = gradeComposta(QUADRADO, 4, 10);
  assert.equal(pontos.length, 40);
  assert.deepEqual(pontos.map(p => p.ordem), [...Array(40).keys()]);
});

t('todo furo da célula k leva o NÚMERO k (é o saco que vai ao laboratório)', () => {
  const { celulas, pontos } = gradeComposta(QUADRADO, 4, 10);
  for (const c of celulas) {
    const meus = pontos.filter(p => p.zona === c.id);
    assert.equal(meus.length, 10, `célula ${c.id} com ${meus.length} furos`);
    for (const p of meus) assert.equal(p.numero, c.numero, `furo ${p.rotulo} com número ${p.numero}`);
  }
});

t('rótulo do furo é célula-sequencial (o que o app de campo mostra)', () => {
  const { pontos } = gradeComposta(QUADRADO, 3, 4);
  assert.deepEqual(pontos.slice(0, 4).map(p => p.rotulo), ['1-1', '1-2', '1-3', '1-4']);
  assert.equal(pontos[4].rotulo, '2-1');
  assert.equal(pontos[11].rotulo, '3-4');
  // O rótulo é TEXTO e nunca entra no campo numérico — senão "1-1" viraria 11.
  for (const p of pontos) assert.equal(typeof p.rotulo, 'string');
});

t('4 células = 4 sacos (não 40)', () => {
  const { pontos } = gradeComposta(QUADRADO, 4, 10);
  const amostras = amostrasDaGrade(pontos, 'A');
  assert.equal(amostras.length, 4);
  assert.deepEqual(amostras.map(a => a.numero), [1, 2, 3, 4]);
});

t('etiquetas: 4 sacos × (100% + 50%) = 6 — e a carta ao lab conta o mesmo', () => {
  const { pontos } = gradeComposta(QUADRADO, 4, 10);
  const et = amostrasComProfundidade(pontos, 'A', [
    { rotulo: '00-20', percentual: 100 }, { rotulo: '20-40', percentual: 50 },
  ]);
  assert.equal(et.length, 6);
  assert.equal(et.filter(e => e.profundidade === '20-40').length, 2);
  // a camada profunda vai nas PRIMEIRAS amostras, na ordem
  assert.deepEqual(et.filter(e => e.profundidade === '20-40').map(e => e.numero), [1, 2]);
});

t('N=1: um saco só para o talhão inteiro, com os M furos dentro', () => {
  const { celulas, pontos } = gradeComposta(EM_L, 1, 10);
  assert.equal(celulas.length, 1);
  assert.equal(pontos.length, 10);
  assert.equal(new Set(pontos.map(p => p.numero)).size, 1);
  assert.equal(amostrasDaGrade(pontos, 'A').length, 1);
  assert.equal(pontos[9].rotulo, '1-10');
});

t('remover um furo fecha o sequencial da célula sem buraco', () => {
  const { pontos } = gradeComposta(QUADRADO, 2, 5);
  const semSegundo = pontos.filter(p => p.rotulo !== '1-2');
  const re = renumerarPontosZonas(semSegundo, 'A', ['00-20', '20-40']);
  assert.deepEqual(re.filter(p => p.zona === '01').map(p => p.rotulo), ['1-1', '1-2', '1-3', '1-4']);
  // os sacos continuam dois, e a célula 2 não foi renumerada
  assert.equal(amostrasDaGrade(re, 'A').length, 2);
  assert.deepEqual(re.filter(p => p.zona === '02').map(p => p.numero), [2, 2, 2, 2, 2]);
});

console.log(`\n${ok} ok, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
