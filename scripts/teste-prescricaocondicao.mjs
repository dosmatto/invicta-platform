// Prescrição por condição no mapa de fertilidade (src/lib/prescricao/condicao.ts).
// Roda: `npm run teste:prescricaocondicao`.
//
// O que este arquivo protege: toda área do talhão cai em EXATAMENTE uma faixa
// (fronteira ≥/< sem lacuna nem sobreposição), manchinhas somem na vizinha sem
// apagar gleba isolada, a vetorização devolve anéis fechados e orientados, e a
// soma das áreas das faixas é a área do talhão — é ela que vira tonelada de
// adubo no caminhão.
import assert from 'node:assert/strict';
import turfArea from '@turf/area';
import {
  validarLimiares, faixaDoValor, rotuloFaixa, absorverManchas, tracarAneis, vetorizarClasse,
  prescreverPorCondicao, classificarGrid, dosesDasFaixas, dosesDaCondicao,
} from '../src/lib/prescricao/condicao.ts';
import { casarZonas } from '../src/lib/prescricao/casar.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

console.log('\nFaixas e fronteiras\n');

t('um limiar = duas faixas; 40 cai na de cima (≥), 39,999 na de baixo (<)', () => {
  assert.equal(faixaDoValor(39.999, [40]), 0);
  assert.equal(faixaDoValor(40, [40]), 1);
  assert.equal(faixaDoValor(80, [40]), 1);
  assert.equal(faixaDoValor(-5, [40]), 0);
});
t('três faixas [15, 40]: 15 e 40 abrem a faixa seguinte', () => {
  assert.deepEqual([14.99, 15, 39.99, 40, 41].map(v => faixaDoValor(v, [15, 40])), [0, 1, 1, 2, 2]);
});
t('NaN / Infinity não têm faixa', () => {
  assert.equal(faixaDoValor(NaN, [40]), -1);
  assert.equal(faixaDoValor(Infinity, [40]), -1);
});
t('limiares: vazio, não-numérico, repetido e decrescente são recusados', () => {
  assert.ok(validarLimiares([]));
  assert.ok(validarLimiares([NaN]));
  assert.ok(validarLimiares([40, 40]));
  assert.ok(validarLimiares([40, 15]));
  assert.equal(validarLimiares([15, 40]), null);
});
t('rótulos: tela com ≥/≤, arquivo em ASCII', () => {
  assert.equal(rotuloFaixa(0, [15, 40], 'P'), 'P < 15');
  assert.equal(rotuloFaixa(1, [15, 40], 'P'), '15 ≤ P < 40');
  assert.equal(rotuloFaixa(2, [15, 40], 'P'), 'P ≥ 40');
  assert.equal(rotuloFaixa(2, [15, 40], 'P', true), 'P >= 40');
  assert.equal(rotuloFaixa(1, [15, 40.5], 'P', true), '15<=P<40,5');
  assert.ok(/^[\x20-\x7E]+$/.test(rotuloFaixa(1, [15, 40], 'P', true)));
});

console.log('\nAbsorção de manchas\n');

const areaUnif = (n, a = 0.04) => new Float64Array(n).fill(a);   // célula 20 m = 0,04 ha

t('mancha de 1 célula (0,04 ha) some na vizinha com área mínima 0,5 ha', () => {
  const cls = new Int16Array(100).fill(0); cls[55] = 1;
  const n = absorverManchas(cls, 10, 10, areaUnif(100), 0.5);
  assert.equal(n, 1);
  assert.ok(cls.every(c => c === 0));
});
t('área mínima 0 desliga a absorção', () => {
  const cls = new Int16Array(100).fill(0); cls[55] = 1;
  assert.equal(absorverManchas(cls, 10, 10, areaUnif(100), 0), 0);
  assert.equal(cls[55], 1);
});
t('talhão inteiro numa faixa, menor que a área mínima: NÃO é apagado', () => {
  const cls = new Int16Array(9).fill(1);
  absorverManchas(cls, 3, 3, areaUnif(9), 0.5);
  assert.ok(cls.every(c => c === 1));
});
t('gleba isolada (sem vizinha de outra faixa) fica, mesmo pequena', () => {
  // coluna do meio fora do talhão (-1) separa duas glebas
  const cls = new Int16Array([0, -1, 1, 0, -1, 1, 0, -1, 1]);
  absorverManchas(cls, 3, 3, areaUnif(9), 10);
  assert.deepEqual([...cls], [0, -1, 1, 0, -1, 1, 0, -1, 1]);
});
t('vai para a faixa de MAIOR contato', () => {
  // 1 célula da faixa 2 encostada em 3 lados na faixa 0 e 1 lado na faixa 1
  const cls = new Int16Array([
    0, 0, 0,
    0, 2, 1,
    0, 0, 0,
  ]);
  const area = new Float64Array(9).fill(1); area[4] = 0.01; area[5] = 5;
  absorverManchas(cls, 3, 3, area, 0.5);
  assert.equal(cls[4], 0);
  assert.equal(cls[5], 1, 'a faixa 1 (5 ha) fica');
});
t('área total conservada: absorver não cria nem apaga célula do talhão', () => {
  const rows = 30, cols = 30;
  const cls = new Int16Array(rows * cols);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < cls.length; i++) cls[i] = rnd() < 0.08 ? 1 : (i % cols < 15 ? 0 : 2);
  const antes = cls.filter(c => c >= 0).length;
  absorverManchas(cls, rows, cols, areaUnif(rows * cols), 0.5);
  assert.equal(cls.filter(c => c >= 0).length, antes);
  // nenhuma mancha pequena sobrou
  assert.ok(cls.filter(c => c === 1).length === 0, 'as manchinhas da faixa 1 foram todas absorvidas');
});

console.log('\nVetorização (traçado de bordas)\n');

const fechado = a => a.length >= 5 && a[0][0] === a.at(-1)[0] && a[0][1] === a.at(-1)[1];
const areaV = anel => { let s = 0; for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) s += anel[j][1] * anel[i][0] - anel[i][1] * anel[j][0]; return s / 2; };
// em vértices (vr=linha p/ baixo, vc=coluna): x=vc, y=-vr → anti-horário no geográfico

t('uma célula = um anel fechado de 4 quinas', () => {
  const an = tracarAneis(new Int16Array([1]), 1, 1, 1);
  assert.equal(an.length, 1);
  assert.ok(fechado(an[0]));
  assert.equal(an[0].length, 5);
});
t('rosca 3×3 com furo: 1 externo anti-horário + 1 buraco horário', () => {
  const cls = new Int16Array([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  const an = tracarAneis(cls, 3, 3, 1);
  assert.equal(an.length, 2);
  assert.ok(an.every(fechado));
  const sinais = an.map(areaV).map(Math.sign).sort();
  assert.deepEqual(sinais, [-1, 1]);
  const g = vetorizarClasse(cls, { rows: 3, cols: 3, bounds: [0, 0, 2, 2] }, 1);
  assert.equal(g.coordinates.length, 1);
  assert.equal(g.coordinates[0].length, 2, 'o furo ficou dentro do externo');
});
t('sela (duas células só pela diagonal) = dois anéis separados', () => {
  const cls = new Int16Array([1, 0, 0, 1]);
  const an = tracarAneis(cls, 2, 2, 1);
  assert.equal(an.length, 2);
  assert.ok(an.every(a => a.length === 5));
});
t('forma em L sem pontos colineares sobrando', () => {
  const cls = new Int16Array([1, 0, 1, 0, 1, 1]);
  const an = tracarAneis(cls, 3, 2, 1);
  assert.equal(an.length, 1);
  assert.equal(an[0].length, 7, '6 quinas + fechamento');
});

console.log('\nPonta a ponta\n');

// Talhão quadrado de ~1 km no cerrado; grade de 20 m com coroa de 1 nó.
const LAT0 = -15.6, LON0 = -47.8;
const dLat = 20 / 110540, dLon = 20 / (111320 * Math.cos(LAT0 * Math.PI / 180));
const ladoLat = 50 * dLat, ladoLon = 50 * dLon;
const talhao = { type: 'Polygon', coordinates: [[
  [LON0, LAT0], [LON0 + ladoLon, LAT0], [LON0 + ladoLon, LAT0 + ladoLat], [LON0, LAT0 + ladoLat], [LON0, LAT0],
]] };
const areaTalhaoHa = turfArea({ type: 'Feature', geometry: talhao, properties: {} }) / 10000;
function gradeP(fn) {
  const cols = 53, rows = 53;
  const w = LON0 - dLon, n = LAT0 + ladoLat + dLat;
  const valores = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) valores[r * cols + c] = fn(r, c, rows, cols);
  return { valores, rows, cols, bounds: [w, n - (rows - 1) * dLat, w + (cols - 1) * dLon, n] };
}
// P cresce de oeste (0) para leste (~80)
const gradiente = gradeP((r, c, rows, cols) => (c / (cols - 1)) * 80);

t('exemplo do usuário: P ≥ 40 → 100 kg, abaixo → 150 kg; duas faixas ~metade cada', () => {
  const res = prescreverPorCondicao({ grid: gradiente, limiares: [40], doses: [150, 100], talhao, sigla: 'P' });
  assert.equal(res.zonas.length, 2);
  const [baixo, alto] = res.zonas;
  assert.equal(baixo.dose, 150); assert.equal(alto.dose, 100);
  assert.equal(baixo.nomeZona, 'P < 40'); assert.equal(alto.nomeZona, 'P >= 40');
  assert.ok(Math.abs(baixo.areaHa - alto.areaHa) / areaTalhaoHa < 0.06, `${baixo.areaHa} × ${alto.areaHa}`);
});
t('área total das faixas = área do talhão (±0,5%) e cada polígono tem área = areaHa', () => {
  const res = prescreverPorCondicao({ grid: gradiente, limiares: [15, 40, 60], doses: [200, 150, 100, 0], talhao, sigla: 'P' });
  const soma = res.zonas.reduce((s, z) => s + z.areaHa, 0);
  assert.ok(Math.abs(soma - areaTalhaoHa) / areaTalhaoHa < 0.005, `soma ${soma} × talhão ${areaTalhaoHa}`);
  for (const f of res.fc.features) {
    const a = turfArea(f) / 10000;
    assert.ok(Math.abs(a - f.properties.areaHa) < 1e-3);
  }
});
t('faixas não se sobrepõem (soma das áreas ≈ área da união)', () => {
  const res = prescreverPorCondicao({ grid: gradiente, limiares: [30, 50], doses: [1, 2, 3], talhao, sigla: 'P' });
  const soma = res.fc.features.reduce((s, f) => s + turfArea(f), 0) / 10000;
  assert.ok(soma <= areaTalhaoHa * 1.001);
});
t('fc casa 100% com as zonas (exportação SHP/Excel/PDF sem mudança)', () => {
  const res = prescreverPorCondicao({ grid: gradiente, limiares: [15, 40], doses: [200, 150, 100], talhao, sigla: 'P' });
  const c = casarZonas(res.fc, res.zonas);
  assert.equal(c.semZona.length, 0);
  assert.equal(c.semPoligono.length, 0);
  assert.equal(c.pares.length, res.zonas.length);
});
t('anéis da saída fechados', () => {
  const res = prescreverPorCondicao({ grid: gradiente, limiares: [40], doses: [150, 100], talhao, sigla: 'P' });
  for (const f of res.fc.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) for (const anel of p) assert.ok(fechado(anel));
  }
});
t('faixa que não ocorre no talhão: aviso, sem quebrar', () => {
  const res = prescreverPorCondicao({ grid: gradiente, limiares: [40, 500], doses: [150, 100, 50], talhao, sigla: 'P' });
  assert.equal(res.zonas.length, 2);
  assert.ok(res.avisos.some(a => a.includes('P ≥ 500')));
});
t('manchinhas do mapa ruidoso somem; sem absorção elas ficam', () => {
  // metade oeste P=10, leste P=60, com pixels isolados trocados
  const ruido = gradeP((r, c) => ((r * 7 + c * 13) % 29 === 0 ? (c < 26 ? 60 : 10) : (c < 26 ? 10 : 60)));
  const com = prescreverPorCondicao({ grid: ruido, limiares: [40], doses: [150, 100], talhao, sigla: 'P', areaMinHa: 0.5 });
  const sem = prescreverPorCondicao({ grid: ruido, limiares: [40], doses: [150, 100], talhao, sigla: 'P', areaMinHa: 0 });
  const partes = g => g.type === 'Polygon' ? 1 : g.coordinates.length;
  const nCom = com.fc.features.reduce((s, f) => s + partes(f.geometry), 0);
  const nSem = sem.fc.features.reduce((s, f) => s + partes(f.geometry), 0);
  assert.ok(com.manchasAbsorvidas > 0);
  assert.equal(nCom, 2, `com absorção: ${nCom} partes`);
  assert.ok(nSem > nCom);
  const soma = r => r.zonas.reduce((s, z) => s + z.areaHa, 0);
  assert.ok(Math.abs(soma(com) - soma(sem)) / areaTalhaoHa < 0.005, 'absorção conserva a área total');
});
t('fio de NaN na divisa do talhão herda a faixa vizinha (sem área sem dose)', () => {
  const g = gradeP((r, c, rows, cols) => (r <= 1 || c <= 1 || r >= rows - 2 || c >= cols - 2 ? NaN : (c / (cols - 1)) * 80));
  const cl = classificarGrid(g, [40], talhao);
  assert.ok(cl.preenchidos > 0);
  const res = prescreverPorCondicao({ grid: g, limiares: [40], doses: [150, 100], talhao, sigla: 'P' });
  const soma = res.zonas.reduce((s, z) => s + z.areaHa, 0);
  assert.ok(Math.abs(soma - areaTalhaoHa) / areaTalhaoHa < 0.005);
});
t('dose da zona sempre = dose da faixa (tirar limiar, pôr outro, sem regerar)', () => {
  // gerado com [20, 40] e doses [200, 150, 100]
  const res = prescreverPorCondicao({ grid: gradiente, limiares: [20, 40], doses: [200, 150, 100], talhao, sigla: 'P' });
  assert.deepEqual(res.zonas.map(z => z.dose), [200, 150, 100]);
  // remove o 40 → faixas [200, 150]; "+ limiar" → [200, 150, 150]; edita 30→40
  const faixas = [{ dose: 200 }, { dose: 150 }, { dose: 150 }];
  const zonas = dosesDasFaixas(res.zonas, faixas);
  assert.deepEqual(zonas.map(z => z.dose), [200, 150, 150], 'f3 segue a faixa, não a dose antiga');
  assert.equal(zonas[0], res.zonas[0], 'zona sem mudança não é recriada');
  // zona sem faixa correspondente mantém a dose
  assert.equal(dosesDasFaixas([{ idZona: 'f9', dose: 7 }], faixas)[0].dose, 7);
});
console.log('\nVolume travado (doses viram pesos)\n');

// 3 faixas: 10 ha, 30 ha, 60 ha; doses digitadas 200 / 150 / 100 (pesos).
const zV = [
  { idZona: 'f1', areaHa: 10, dose: 0 }, { idZona: 'f2', areaHa: 30, dose: 0 }, { idZona: 'f3', areaHa: 60, dose: 0 },
];
const fV = [{ dose: 200 }, { dose: 150 }, { dose: 100 }];
const usadoDe = (r, fb = 1) => zV.reduce((s, z) => s + r.doses[z.idZona] * z.areaHa, 0) * fb;

t('livre (ou sem cenário, prescrição antiga): aplicada = digitada', () => {
  for (const cen of [undefined, 'livre']) {
    const r = dosesDaCondicao(zV, fV, { cenario: cen, totalDisponivel: 99999, doseMin: 180 });
    assert.equal(r.travado, false);
    assert.deepEqual([r.doses.f1, r.doses.f2, r.doses.f3], [200, 150, 100]);
    assert.deepEqual(r.avisos, []);
  }
});
t('travado sem limites: o total fecha exato', () => {
  const r = dosesDaCondicao(zV, fV, { cenario: 'total', totalDisponivel: 15000 });
  assert.ok(Math.abs(usadoDe(r) - 15000) < 1e-6, `usado ${usadoDe(r)}`);
  assert.ok(Math.abs(r.usado - 15000) < 1e-6);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual([r.informadas.f1, r.informadas.f2, r.informadas.f3], [200, 150, 100], 'digitadas preservadas à parte');
});
t('travado: proporção entre as faixas preservada (k comum)', () => {
  const r = dosesDaCondicao(zV, fV, { cenario: 'total', totalDisponivel: 15000 });
  const k = r.doses.f1 / 200;
  assert.ok(Math.abs(r.doses.f2 / 150 - k) < 1e-9 && Math.abs(r.doses.f3 / 100 - k) < 1e-9);
  // 200·10 + 150·30 + 100·60 = 12.500 → k = 15.000 / 12.500 = 1,2
  assert.ok(Math.abs(k - 1.2) < 1e-9, `k ${k}`);
});
t('kg/ha médio × área = total (150 kg/ha em 100 ha = 15.000 kg)', () => {
  const area = zV.reduce((s, z) => s + z.areaHa, 0);
  const r = dosesDaCondicao(zV, fV, { cenario: 'total', totalDisponivel: 150 * area });
  const media = usadoDe(r) / area;
  assert.ok(Math.abs(media - 150) < 1e-9, `média ${media}`);
});
t('travado com fatorBase (sementes/m): Σ dose·área·fator = total', () => {
  const fb = 10_000 / 0.5;
  const r = dosesDaCondicao(zV, fV, { cenario: 'total', totalDisponivel: 60_000_000, fatorBase: fb });
  assert.ok(Math.abs(usadoDe(r, fb) - 60_000_000) < 1e-3);
});
t('travado com limites: dose máx corta e avisa quanto sobrou', () => {
  const r = dosesDaCondicao(zV, fV, { cenario: 'total', totalDisponivel: 15000, doseMax: 200 });
  assert.equal(r.doses.f1, 200);   // 240 → 200
  assert.ok(r.sobra > 0 && r.avisos.some(a => /sobrar/.test(a)), r.avisos.join(' | '));
});
t('travado com limites: dose mín eleva e avisa quanto passou', () => {
  const r = dosesDaCondicao(zV, fV, { cenario: 'total', totalDisponivel: 15000, doseMin: 150 });
  assert.equal(r.doses.f3, 150);   // 120 → 150
  assert.ok(r.falta > 0 && r.avisos.some(a => /ultrapassar/.test(a)), r.avisos.join(' | '));
});
t('travado: incremento põe na grade do passo', () => {
  const r = dosesDaCondicao(zV, fV, { cenario: 'total', totalDisponivel: 15100, incremento: 10 });
  for (const id of ['f1', 'f2', 'f3']) assert.equal(r.doses[id] % 10, 0);
});
t('travado: faixa com dose 0 fica em 0 (não aplica) e o total vai às demais', () => {
  const r = dosesDaCondicao(zV, [{ dose: 200 }, { dose: 0 }, { dose: 100 }], { cenario: 'total', totalDisponivel: 16000, doseMin: 50 });
  assert.equal(r.doses.f2, 0);
  assert.ok(Math.abs(usadoDe(r) - 16000) < 1e-6);
});
t('travado sem total ou com todas as faixas 0: aviso, sem inventar dose', () => {
  assert.ok(dosesDaCondicao(zV, fV, { cenario: 'total' }).avisos.length);
  const z = dosesDaCondicao(zV, [{ dose: 0 }, { dose: 0 }, { dose: 0 }], { cenario: 'total', totalDisponivel: 100 });
  assert.ok(z.avisos.length && z.doses.f1 === 0);
});

t('mapa todo NaN: erro claro', () => {
  const g = gradeP(() => NaN);
  assert.throws(() => prescreverPorCondicao({ grid: g, limiares: [40], doses: [1, 2], talhao, sigla: 'P' }), /não tem valores/);
});
t('doses faltando para alguma faixa: erro claro', () => {
  assert.throws(() => prescreverPorCondicao({ grid: gradiente, limiares: [15, 40], doses: [1, 2], talhao, sigla: 'P' }), /3 faixas/);
});

console.log(`\n${ok} ok, ${fail} falha(s)\n`);
if (fail) process.exit(1);
