// Testes da prévia de volumes por zona (recomendacao/volumesPorZona.ts).
//
// A tabela "quanto produto vai para cada zona" tem duas origens: a taxa exata
// do laudo (`porZona`) e a leitura do mapa da dose (média ponderada dos pixels
// cujo centro cai na zona). Estes testes travam as duas contas, a conversão de
// kg para toneladas, a área fatiada do talhão e o aviso de zona sem valor.
// Roda: `npm run teste:volzona`
import assert from 'node:assert/strict';
import { volumesPorZona } from '../src/lib/recomendacao/volumesPorZona.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const quadrado = (w, s, e, n) => ({
  type: 'Polygon',
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});
// Grid Float32 → base64 cru (o mesmo formato que `decodeGrid` lê).
function grid(rows, cols, f) {
  const arr = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) arr[r * cols + c] = f(r, c);
  const u8 = new Uint8Array(arr.buffer);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return { b64: btoa(bin), shape: [rows, cols] };
}
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// Talhão de 0,01° × 0,01° perto do equador (~1,11 km × 1,11 km ≈ 123 ha),
// dividido em zona OESTE (rótulo "1") e LESTE (rótulo "2"), metade cada.
const talhao = quadrado(0, 0, 0.01, 0.01);
const bounds = [0, 0, 0.01, 0.01];
const zonas = [
  { id: '01', rotulo: '1', geometry: quadrado(0, 0, 0.005, 0.01) },
  { id: '02', rotulo: '2', geometry: quadrado(0.005, 0, 0.01, 0.01) },
];
const AREA = 120; // ha cadastrados — a régua das fatias

t('sem zonas → null; sem porZona e sem mapa → null', () => {
  assert.equal(volumesPorZona({ zonas: [], areaTalhaoHa: AREA, unidade: 'kg/ha' }), null);
  assert.equal(volumesPorZona({ zonas, areaTalhaoHa: AREA, unidade: 'kg/ha' }), null);
});

t('origem laudo: taxa exata × área fatiada, kg → t', () => {
  const r = volumesPorZona({
    zonas, areaTalhaoHa: AREA, unidade: 'kg/ha',
    porZona: [{ rotulo: '1', dose: 1000 }, { rotulo: '2', dose: 2000 }],
  });
  assert.equal(r.origem, 'laudo');
  assert.equal(r.zonas.length, 2);
  perto(r.zonas[0].areaHa, 60, 0.02, 'área da zona 1 é metade do talhão');
  perto(r.zonas[1].areaHa, 60, 0.02, 'área da zona 2 é metade do talhão');
  perto(r.totalAreaHa, AREA, 0.011, 'as fatias somam a área do talhão');
  assert.equal(r.zonas[0].dose, 1000);
  assert.equal(r.zonas[1].dose, 2000);
  perto(r.zonas[0].toneladas, 60, 0.02, '1000 kg/ha × 60 ha = 60 t');
  perto(r.zonas[1].toneladas, 120, 0.04, '2000 kg/ha × 60 ha = 120 t');
  perto(r.totalToneladas, 180, 0.06, 'total');
  assert.equal(r.zonas[0].varia, false);
  assert.deepEqual(r.semDose, []);
});

t('origem laudo em t/ha: não divide por 1000', () => {
  const r = volumesPorZona({
    zonas, areaTalhaoHa: AREA, unidade: 't/ha',
    porZona: [{ rotulo: '1', dose: 2 }, { rotulo: '2', dose: 3 }],
  });
  perto(r.zonas[0].toneladas, 120, 0.04, '2 t/ha × 60 ha');
  perto(r.zonas[1].toneladas, 180, 0.06, '3 t/ha × 60 ha');
});

t('origem laudo: zona sem taxa (NaN ou ausente) vai para semDose e não entra no total', () => {
  const r = volumesPorZona({
    zonas, areaTalhaoHa: AREA, unidade: 'kg/ha',
    porZona: [{ rotulo: '1', dose: 1000 }, { rotulo: '2', dose: NaN }],
  });
  assert.equal(r.zonas[1].dose, null);
  assert.equal(r.zonas[1].toneladas, null);
  assert.deepEqual(r.semDose, ['2']);
  perto(r.totalToneladas, 60, 0.02, 'só a zona 1 soma');
});

t('origem mapa, mapa CHAPADO por zona: a média é o valor da zona e não "varia"', () => {
  // 10 colunas: centros em 0, 0.00111 … 0.01 → 5 a oeste de 0.005 e 5 a leste.
  const g = grid(10, 10, (r, c) => (c <= 4 ? 100 : 300));
  const r = volumesPorZona({ zonas, areaTalhaoHa: AREA, unidade: 'kg/ha', grid: g, bounds, poligono: talhao });
  assert.equal(r.origem, 'mapa');
  perto(r.zonas[0].dose, 100, 1e-6, 'zona oeste');
  perto(r.zonas[1].dose, 300, 1e-6, 'zona leste');
  assert.equal(r.zonas[0].varia, false);
  assert.equal(r.zonas[1].varia, false);
  perto(r.zonas[0].toneladas, 6, 0.01, '100 kg/ha × 60 ha = 6 t');
  perto(r.zonas[1].toneladas, 18, 0.01, '300 kg/ha × 60 ha = 18 t');
  assert.deepEqual(r.semDose, []);
});

t('origem mapa, mapa INTERPOLADO: média ponderada, faixa min–max e "varia"', () => {
  // gradiente oeste→leste: 100, 200, …, 1000 por coluna
  const g = grid(10, 10, (r, c) => 100 * (c + 1));
  const r = volumesPorZona({ zonas, areaTalhaoHa: AREA, unidade: 'kg/ha', grid: g, bounds, poligono: talhao });
  // Zona oeste tem colunas 0..4 (100..500). A coluna 0 está na borda e pesa
  // menos (cobertura ~0,5), então a média fica ACIMA de 300 — mas dentro da faixa.
  assert.equal(r.zonas[0].min, 100);
  assert.equal(r.zonas[0].max, 500);
  assert.ok(r.zonas[0].dose > 300 && r.zonas[0].dose < 400, `média oeste plausível: ${r.zonas[0].dose}`);
  assert.equal(r.zonas[0].varia, true);
  assert.equal(r.zonas[1].min, 600);
  // A coluna 9 tem o centro EXATAMENTE na divisa leste (x = 0,01): o ponto-em-
  // polígono deixa a borda de fora, então o máximo lido é o da coluna 8. Num
  // talhão real o raster transborda o contorno e nenhum centro cai na linha.
  assert.equal(r.zonas[1].max, 900);
  assert.equal(r.zonas[1].varia, true);
});

t('origem mapa: NaN fora do talhão não entra; zona sem pixel vai para semDose', () => {
  const g = grid(10, 10, (r, c) => (c <= 4 ? 100 : NaN));   // só o oeste tem valor
  const r = volumesPorZona({ zonas, areaTalhaoHa: AREA, unidade: 'kg/ha', grid: g, bounds, poligono: talhao });
  perto(r.zonas[0].dose, 100, 1e-6, 'oeste');
  assert.equal(r.zonas[1].dose, null);
  assert.deepEqual(r.semDose, ['2']);
});

t('origem mapa sem contorno do talhão: ainda lê (peso 1 por pixel)', () => {
  const g = grid(10, 10, (r, c) => (c <= 4 ? 100 : 300));
  const r = volumesPorZona({ zonas, areaTalhaoHa: AREA, unidade: 'kg/ha', grid: g, bounds, poligono: null });
  perto(r.zonas[0].dose, 100, 1e-6, 'oeste');
  perto(r.zonas[1].dose, 300, 1e-6, 'leste');
});

t('porZona presente ganha do mapa (a taxa exata manda)', () => {
  const g = grid(10, 10, () => 999);
  const r = volumesPorZona({
    zonas, areaTalhaoHa: AREA, unidade: 'kg/ha',
    porZona: [{ rotulo: '1', dose: 10 }, { rotulo: '2', dose: 20 }],
    grid: g, bounds, poligono: talhao,
  });
  assert.equal(r.origem, 'laudo');
  assert.equal(r.zonas[0].dose, 10);
  assert.equal(r.zonas[1].dose, 20);
});

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
