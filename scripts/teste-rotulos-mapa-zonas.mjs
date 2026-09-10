// Onde o número de cada polígono é escrito no mapa (src/lib/rotulosMapa.ts).
// Roda: `npm run teste:rotulos-mapa`.
//
// O que este arquivo protege: no PDF de prescrição os números das zonas saíam
// empilhados uns sobre os outros e, em zona comprida, fora da própria mancha —
// o mapa vira adivinhação sobre qual dose é de qual talhão.
import assert from 'node:assert/strict';
import {
  poloDeInacessibilidade, posicionarRotulos, dentroDoPoligono, pontoRotuloGeo,
} from '../src/lib/rotulosMapa.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ok  ', n); } catch (e) { fail++; console.error('  FALHOU', n, '-', e.message); } };

const ret = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const AREA = { largura: 800, altura: 600 };
const cx = (p) => p.x, cy = (p) => p.y;
const caixa = (p, w, h) => ({ x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 });
const seCruzam = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

console.log('\nRotulos no mapa\n');

t('o polo cai no centro de um quadrado e o raio e a metade do lado', () => {
  const p = poloDeInacessibilidade(ret(100, 100, 200, 200));
  assert.ok(Math.abs(p.x - 200) < 6 && Math.abs(p.y - 200) < 6, `veio ${p.x},${p.y}`);
  assert.ok(Math.abs(p.raio - 100) < 6, `raio ${p.raio}`);
});

t('em poligono em C o polo fica DENTRO — a media dos vertices ficaria fora', () => {
  // C aberto para a direita
  const c = [[[0, 0], [200, 0], [200, 60], [60, 60], [60, 140], [200, 140], [200, 200], [0, 200], [0, 0]]];
  const p = poloDeInacessibilidade(c);
  assert.ok(dentroDoPoligono(p.x, p.y, c), `polo fora: ${p.x},${p.y}`);
  // a media simples dos vertices cai no vao do C
  const mx = c[0].reduce((s, v) => s + v[0], 0) / c[0].length;
  const my = c[0].reduce((s, v) => s + v[1], 0) / c[0].length;
  assert.equal(dentroDoPoligono(mx, my, c), false, 'a media deveria cair fora — e o bug antigo');
});

t('poligono com FURO: o polo nao cai dentro do buraco', () => {
  const externo = ret(0, 0, 300, 300)[0];
  const furo = [[100, 100], [200, 100], [200, 200], [100, 200], [100, 100]];
  const p = poloDeInacessibilidade([externo, furo]);
  assert.ok(dentroDoPoligono(p.x, p.y, [externo, furo]), 'polo dentro do furo');
});

t('numero que CABE fica dentro da mancha, sem traco', () => {
  const r = posicionarRotulos([{ texto: '77.764', aneis: ret(100, 100, 300, 300), largura: 60, altura: 16 }], AREA);
  assert.equal(r[0].traco, null, 'nao deveria precisar de traco');
  assert.ok(dentroDoPoligono(r[0].x, r[0].y, ret(100, 100, 300, 300)), 'texto fora da mancha');
});

t('numero que NAO CABE sai para fora COM traco apontando a mancha', () => {
  const fino = ret(100, 100, 300, 12);        // faixa de 12 px de altura
  const r = posicionarRotulos([{ texto: '76.239', aneis: fino, largura: 60, altura: 18 }], AREA);
  assert.ok(r[0].traco, 'deveria ter traco');
  assert.ok(dentroDoPoligono(r[0].traco.x, r[0].traco.y, fino), 'a ponta do traco tem de estar DENTRO do poligono');
  assert.ok(Math.abs(r[0].y - r[0].traco.y) > 8, 'o texto deveria ter saido de cima da faixa');
});

t('DOIS vizinhos apertados nao se sobrepoem — o caso do print', () => {
  const a = ret(100, 100, 90, 24);
  const b = ret(100, 128, 90, 24);
  const r = posicionarRotulos([
    { texto: '77.764', aneis: a, largura: 60, altura: 18 },
    { texto: '76.239', aneis: b, largura: 60, altura: 18 },
  ], AREA);
  assert.equal(seCruzam(caixa(r[0], 60, 18), caixa(r[1], 60, 18)), false,
    `caixas se cruzam: ${cx(r[0])},${cy(r[0])} x ${cx(r[1])},${cy(r[1])}`);
});

t('CINCO zonas grudadas: nenhuma caixa cruza com nenhuma outra', () => {
  const itens = Array.from({ length: 5 }, (_, i) => ({
    texto: `7${i}.000`, aneis: ret(120, 100 + i * 26, 100, 22), largura: 58, altura: 17,
  }));
  const r = posicionarRotulos(itens, AREA);
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      assert.equal(seCruzam(caixa(r[i], 58, 17), caixa(r[j], 58, 17)), false, `${i} cruza com ${j}`);
    }
  }
});

t('o rotulo nunca sai da imagem', () => {
  const perto = ret(2, 2, 40, 10);            // colado no canto superior esquerdo
  const r = posicionarRotulos([{ texto: '72.428', aneis: perto, largura: 60, altura: 18 }], { largura: 200, altura: 150 });
  assert.ok(r[0].x - 30 >= 0 && r[0].x + 30 <= 200, `x fora: ${r[0].x}`);
  assert.ok(r[0].y - 9 >= 0 && r[0].y + 9 <= 150, `y fora: ${r[0].y}`);
});

t('a MAIOR mancha escolhe primeiro e fica sem traco', () => {
  const grande = ret(100, 100, 300, 300);
  const pequena = ret(410, 100, 40, 14);
  const r = posicionarRotulos([
    { texto: 'pequena', aneis: pequena, largura: 60, altura: 18 },
    { texto: 'grande', aneis: grande, largura: 60, altura: 18 },
  ], AREA);
  assert.equal(r[1].traco, null, 'a grande deveria caber sem traco');
  assert.ok(r[0].traco, 'a pequena deveria sair com traco');
});

t('a ORDEM da saida acompanha a ordem da entrada (nao a de colocacao)', () => {
  const r = posicionarRotulos([
    { texto: 'A', aneis: ret(0, 0, 30, 12), largura: 20, altura: 12 },
    { texto: 'B', aneis: ret(100, 100, 300, 300), largura: 20, altura: 12 },
  ], AREA);
  assert.deepEqual(r.map(x => x.texto), ['A', 'B']);
});

t('entrada degenerada (sem texto ou sem anel) nao quebra', () => {
  const r = posicionarRotulos([
    { texto: '', aneis: ret(0, 0, 10, 10), largura: 0, altura: 12 },
    { texto: 'X', aneis: [], largura: 20, altura: 12 },
    { texto: 'Y', aneis: [[[0, 0], [1, 1]]], largura: 20, altura: 12 },
  ], AREA);
  assert.equal(r.length, 3);
  for (const p of r) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); }
});

// ── pontoRotuloGeo: onde o VALOR DA ZONA e escrito, em lon/lat ──────────────
// O mapa de fertilidade por zona escrevia o numero no centroide de AREA. Em
// zona em C/L ou em faixa o centroide encosta na divisa e, entre duas zonas
// vizinhas, os dois numeros saem grudados na mesma linha. Aqui a ancora e o
// polo: o ponto que MAIS se afasta de qualquer borda.

const LAT = -25.1, LON = -50.1;   // Ponta Grossa - PR, a escala real do caso
const K = Math.cos((LAT * Math.PI) / 180);

// Retangulo em graus a partir de um canto (dx, dy em graus).
const retGeo = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const poly = (rings) => ({ type: 'Polygon', coordinates: rings });

// Distancia ate a borda mais proxima, no MESMO plano local da funcao (x * cos(lat)).
function folgaAteBorda([lx, ly], rings) {
  const seg = (px, py, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  };
  let d = Infinity;
  for (const r of rings) {
    const p = r.map(([x, y]) => [x * K, y]);
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) d = Math.min(d, seg(lx * K, ly, p[j], p[i]));
  }
  return d;
}
// Centroide de AREA do anel externo — o que era usado antes (zonasGrid.centroideGeom).
function centroideArea(ring) {
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const w = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a2 += w; cx += (ring[j][0] + ring[i][0]) * w; cy += (ring[j][1] + ring[i][1]) * w;
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}
const dentroGeo = (p, rings) => dentroDoPoligono(p[0] * K, p[1], rings.map(r => r.map(([x, y]) => [x * K, y])));

t('zona retangular: o numero vai no centro', () => {
  const r = retGeo(LON, LAT, 0.004, 0.002);
  const p = pontoRotuloGeo(poly(r));
  assert.ok(Math.abs(p[0] - (LON + 0.002)) < 4e-4, 'lon ' + p[0]);
  assert.ok(Math.abs(p[1] - (LAT + 0.001)) < 2e-4, 'lat ' + p[1]);
});

t('O CASO DO PDF — zona em C: o polo fica DENTRO e o centroide de area nao', () => {
  // C aberto para a direita: o centroide de area cai no vao, fora da mancha.
  const anel = [
    [LON, LAT], [LON + 0.006, LAT], [LON + 0.006, LAT + 0.001],
    [LON + 0.002, LAT + 0.001], [LON + 0.002, LAT + 0.004],
    [LON + 0.006, LAT + 0.004], [LON + 0.006, LAT + 0.005], [LON, LAT + 0.005], [LON, LAT],
  ];
  const p = pontoRotuloGeo(poly([anel]));
  assert.ok(dentroGeo(p, [anel]), 'polo caiu fora da zona: ' + p);
  assert.ok(!dentroGeo(centroideArea(anel), [anel]), 'este C precisa ter o centroide FORA (teste mal montado)');
});

t('zona em AMPULHETA: o centroide cai no gargalo, o polo vai para a mancha larga', () => {
  // Duas manchas ligadas por um gargalo estreito — comum em zona de manejo.
  // O centroide de area cai no MEIO do gargalo, a 0,0002 grau da borda: o
  // numero sairia espremido entre as duas linhas. O polo vai para dentro de uma
  // das manchas, com folga de sobra.
  const p = (dx, dy) => [LON + dx, LAT + dy];
  const anel = [
    p(0, 0), p(0.003, 0), p(0.003, 0.0018), p(0.005, 0.0018), p(0.005, 0),
    p(0.008, 0), p(0.008, 0.004), p(0.005, 0.004), p(0.005, 0.0022),
    p(0.003, 0.0022), p(0.003, 0.004), p(0, 0.004), p(0, 0),
  ];
  const polo = pontoRotuloGeo(poly([anel]));
  const centro = centroideArea(anel);
  assert.ok(dentroGeo(polo, [anel]), 'polo fora da zona: ' + polo);
  assert.ok(folgaAteBorda(centro, [anel]) < 0.0003, 'o centroide precisa estar no gargalo (teste mal montado)');
  assert.ok(folgaAteBorda(polo, [anel]) > 0.001,
    'polo com pouca folga: ' + folgaAteBorda(polo, [anel]).toFixed(6));
});

t('zona em L: a folga do polo nunca fica atras da do centroide', () => {
  // O desempate pelo centro pode abrir mao de ate 3% de folga para centralizar
  // o numero; alem disso, nao.
  const anel = [
    [LON, LAT], [LON + 0.006, LAT], [LON + 0.006, LAT + 0.0012],
    [LON + 0.0012, LAT + 0.0012], [LON + 0.0012, LAT + 0.006], [LON, LAT + 0.006], [LON, LAT],
  ];
  const p = pontoRotuloGeo(poly([anel]));
  assert.ok(dentroGeo(p, [anel]), 'polo fora da zona: ' + p);
  const fPolo = folgaAteBorda(p, [anel]), fCentro = folgaAteBorda(centroideArea(anel), [anel]);
  assert.ok(fPolo >= fCentro * 0.97, 'polo ' + fPolo.toFixed(6) + ' vs centroide ' + fCentro.toFixed(6));
});

t('duas zonas vizinhas: os numeros deixam de se encostar na divisa comum', () => {
  // Faixas coladas, cada uma 0.004 x 0.0016 grau. O centroide de area de cada
  // uma esta a 0.0008 da divisa; o polo, tambem — mas o que importa e que a
  // ancora nunca fica MAIS PERTO da divisa que o centro da faixa.
  const a = retGeo(LON, LAT, 0.004, 0.0016);
  const b = retGeo(LON, LAT + 0.0016, 0.004, 0.0016);
  const pa = pontoRotuloGeo(poly(a)), pb = pontoRotuloGeo(poly(b));
  const divisa = LAT + 0.0016;
  assert.ok(Math.abs(pa[1] - divisa) > 0.0006, 'zona de baixo encostou na divisa: ' + pa[1]);
  assert.ok(Math.abs(pb[1] - divisa) > 0.0006, 'zona de cima encostou na divisa: ' + pb[1]);
});

t('multipoligono: rotula a MAIOR parte, nao a ilhota', () => {
  const grande = retGeo(LON, LAT, 0.006, 0.004);
  const ilhota = retGeo(LON + 0.02, LAT + 0.02, 0.0004, 0.0004);
  const p = pontoRotuloGeo({ type: 'MultiPolygon', coordinates: [ilhota, grande] });
  assert.ok(dentroGeo(p, grande), 'foi parar na ilhota: ' + p);
});

t('zona com FURO: o numero nao cai dentro do buraco', () => {
  const externo = retGeo(LON, LAT, 0.006, 0.006)[0];
  // Furo grande e centrado: o centro geometrico da zona esta DENTRO dele.
  const furo = [
    [LON + 0.0012, LAT + 0.0012], [LON + 0.0048, LAT + 0.0012],
    [LON + 0.0048, LAT + 0.0048], [LON + 0.0012, LAT + 0.0048], [LON + 0.0012, LAT + 0.0012],
  ];
  const p = pontoRotuloGeo(poly([externo, furo]));
  assert.ok(dentroGeo(p, [externo, furo]), 'polo caiu no furo: ' + p);
});

t('escala da longitude: em faixa QUADRADA em metros o polo nao pende para o lado', () => {
  // Em -25 graus, 1 grau de longitude vale ~0,906 grau de latitude em metros.
  // Sem a correcao por cos(lat) o polo de um quadrado METRICO sairia deslocado.
  const dLat = 0.004, dLon = dLat / K;
  const r = retGeo(LON, LAT, dLon, dLat);
  const p = pontoRotuloGeo(poly(r));
  assert.ok(Math.abs((p[0] - LON) / dLon - 0.5) < 0.06, 'lon relativa ' + ((p[0] - LON) / dLon));
  assert.ok(Math.abs((p[1] - LAT) / dLat - 0.5) < 0.06, 'lat relativa ' + ((p[1] - LAT) / dLat));
});

t('geometria que nao e poligono devolve null (o chamador cai no centroide)', () => {
  assert.equal(pontoRotuloGeo(null), null);
  assert.equal(pontoRotuloGeo({ type: 'Point', coordinates: [LON, LAT] }), null);
  assert.equal(pontoRotuloGeo({ type: 'Polygon', coordinates: [] }), null);
  assert.equal(pontoRotuloGeo({ type: 'Polygon', coordinates: [[[LON, LAT], [LON, LAT]]] }), null);
});


console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
