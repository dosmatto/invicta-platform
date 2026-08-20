// Testes da escolha do mapa que alimenta a RECOMENDAÇÃO.
//
// Regra: a dose é calculada em 20 m. Até a v2.36.0 pegávamos o mapa fino e
// fazíamos a MÉDIA de blocos 4×4; agora a Fertilidade grava também um mapa
// interpolado NATIVAMENTE a 20 m, e é ele que tem de ser escolhido. Com DOIS
// mapas por atributo na nuvem, a regra deixou de ser "o mais recente ganha" —
// sem estes testes, um mapa fino reprocessado depois voltaria a sequestrar a
// conta em silêncio. Cobrem também o parser do id, que precisa continuar lendo
// ids legados e o segmento novo `krigefixa` (v2.34.0).
// Roda: `npm run teste:grids`.
import assert from 'node:assert/strict';
import {
  lerChaveMapa, escolherMapas, idDose20, prefixoDose20, ehAuxiliar20mPerdido,
} from '../src/lib/recomendacao/escolhaMapa.ts';
import { rasterizarZonas, rasterizarZonasDose } from '../src/lib/recomendacao/zonasGrid.ts';
import { decodeGrid } from '../src/lib/fertilidade.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const PREFIXO = 'tal1__imp1__';
const id = (metodo, pixel, modelo, nut, prof) => `${PREFIXO}${metodo}__${pixel}__${modelo}__${nut}__${prof}`;

// ── parser do id ──────────────────────────────────────────────────────────
t('id novo: extrai chave, pixel e método', () => {
  const r = lerChaveMapa(id('krige', 5, 'auto', 'satk', '0-20').slice(PREFIXO.length));
  assert.deepEqual(r, { chave: 'satk__0-20', pixel: 5, metodo: 'krige' });
});

t('Krigagem fixa: o método novo não confunde o parser', () => {
  const r = lerChaveMapa(id('krigefixa', 20, 'spherical', 'ctc', '0-20').slice(PREFIXO.length));
  assert.deepEqual(r, { chave: 'ctc__0-20', pixel: 20, metodo: 'krigefixa' });
});

t('modo zona: método "zona" é lido como qualquer outro', () => {
  const r = lerChaveMapa(id('zona', 5, '', 'k', '0-20').slice(PREFIXO.length));
  assert.equal(r.chave, 'k__0-20');
  assert.equal(r.metodo, 'zona');
});

t('id LEGADO (legenda__nut__prof): chave certa, sem pixel', () => {
  const r = lerChaveMapa('fabc_ph__ph__0-20');
  assert.deepEqual(r, { chave: 'ph__0-20' });
});

t('id curto demais: null (não vira mapa)', () => {
  assert.equal(lerChaveMapa('so-uma-parte'), null);
});

t('pixel decimal (2,5 m gravado como 2.5) é numérico e não vira 20', () => {
  const r = lerChaveMapa(id('krige', 2.5, 'auto', 'k', '0-20').slice(PREFIXO.length));
  assert.equal(r.pixel, 2.5);
});

// ── escolha entre candidatos ──────────────────────────────────────────────
t('resto de 20 m no prefixo antigo ainda perde para... não: a dose fica com ele', () => {
  // Rede de segurança para o que a v2.37.0 deixou gravado na gaveta errada.
  const itens = [
    { id: id('krige', 20, 'auto', 'satk', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krige', 5, 'auto', 'satk', '0-20'), tem: true, em: '2026-08-07T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens, 'dose')['satk__0-20'];
  assert.equal(e.indice, 0, 'deve escolher o de 20 m mesmo sendo o mais antigo');
  assert.equal(e.eh20, true);
  assert.equal(e.pixel, 20);
});

t('sem mapa de 20 m: usa o fino e marca para reamostrar', () => {
  const itens = [{ id: id('krige', 5, 'auto', 'ctc', '0-20'), tem: true, em: '2026-08-07T10:00:00Z' }];
  const e = escolherMapas(PREFIXO, itens, 'dose')['ctc__0-20'];
  assert.equal(e.eh20, false, 'eh20=false é o que liga a reamostragem em carregarGridsTalhao');
  assert.equal(e.pixel, 5);
});

t('ter grid vence ser de 20 m (mapa de 20 m só com metadados não serve)', () => {
  const itens = [
    { id: id('krige', 20, 'auto', 'k', '0-20'), tem: false, em: '2026-08-07T10:00:00Z' },
    { id: id('krige', 5, 'auto', 'k', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens, 'dose')['k__0-20'];
  assert.equal(e.indice, 1, 'sem grid não dá para calcular nada');
  assert.equal(e.eh20, false);
});

t('dois mapas de 20 m: desempata pelo mais recente', () => {
  const itens = [
    { id: id('krige', 20, 'auto', 'k', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krigefixa', 20, 'spherical', 'k', '0-20'), tem: true, em: '2026-08-07T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens, 'dose')['k__0-20'];
  assert.equal(e.indice, 1);
  assert.equal(e.metodo, 'krigefixa');
});

t('id legado nunca ganha de um mapa de 20 m', () => {
  const itens = [
    { id: `${PREFIXO}legenda__ph__0-20`, tem: true, em: '2026-08-07T10:00:00Z' },
    { id: id('krige', 20, 'auto', 'ph', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens, 'dose')['ph__0-20'];
  assert.equal(e.indice, 1, 'legado não tem pixel → eh20=false → perde');
});

t('profundidades e atributos diferentes não se misturam', () => {
  const itens = [
    { id: id('krige', 20, 'auto', 'k', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krige', 20, 'auto', 'k', '20-40'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krige', 20, 'auto', 'ctc', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
  ];
  const r = escolherMapas(PREFIXO, itens, 'dose');
  assert.deepEqual(Object.keys(r).sort(), ['ctc__0-20', 'k__0-20', 'k__20-40']);
});

// ── gaveta própria do raster de 20 m (v2.38.0) ────────────────────────────
t('GAVETA: o id de 20 m NÃO cai no prefixo dos mapas de fertilidade', () => {
  // É isto que impede a regressão: o leitor da fertilidade varre `tal__imp__`
  // e o auxiliar simplesmente não está lá.
  const aux = idDose20('tal1', 'imp1', 'krigefixa', 'spherical', 'satk', '0-20');
  assert.ok(!aux.startsWith(PREFIXO), `${aux} não pode começar com ${PREFIXO}`);
  assert.ok(aux.startsWith(prefixoDose20('tal1', 'imp1')));
});

t('GAVETA: o id novo continua legível (chave, pixel 20 e método)', () => {
  const aux = idDose20('tal1', 'imp1', 'krigefixa', 'spherical', 'satk', '0-20');
  const r = lerChaveMapa(aux.slice(prefixoDose20('tal1', 'imp1').length));
  assert.deepEqual(r, { chave: 'satk__0-20', pixel: 20, metodo: 'krigefixa' });
});

t('GAVETA: o prefixo do talhão (cascata de exclusão) alcança a gaveta', () => {
  const aux = idDose20('tal1', 'imp1', 'krige', 'auto', 'k', '0-20');
  assert.ok(aux.startsWith(prefixoDose20('tal1')), 'dose20__<talhao>__ tem de casar');
});

// ── limpeza do que a v2.37.0 gravou na gaveta errada ──────────────────────
const AUX = { labels: { type: 'FeatureCollection', features: [] }, resp: { png: '' } };
const DOUSUARIO = { labels: { type: 'FeatureCollection', features: [{}, {}] }, resp: { png: '' } };

t('LIMPEZA: reconhece o auxiliar de 20 m (pixel 20 + sem rótulos + sem PNG)', () => {
  const alvo = id('krige', 20, 'auto', 'satk', '0-20');
  assert.equal(ehAuxiliar20mPerdido(alvo, PREFIXO, AUX), true);
});

t('LIMPEZA: NÃO apaga o mapa de 20 m que o usuário escolheu (tem rótulos)', () => {
  // O seletor de pixel oferece 20 m — quem escolher isso tem um mapa legítimo,
  // com os valores dos pontos. Apagá-lo seria destruir trabalho do usuário.
  const alvo = id('krige', 20, 'auto', 'satk', '0-20');
  assert.equal(ehAuxiliar20mPerdido(alvo, PREFIXO, DOUSUARIO), false);
});

t('LIMPEZA: nunca toca num mapa fino, nem sem rótulos', () => {
  const fino = id('krige', 5, 'auto', 'satk', '0-20');
  assert.equal(ehAuxiliar20mPerdido(fino, PREFIXO, AUX), false);
});

t('LIMPEZA: id legado (sem pixel) fica de fora', () => {
  assert.equal(ehAuxiliar20mPerdido(`${PREFIXO}legenda__ph__0-20`, PREFIXO, AUX), false);
});

t('USO ZONA: entre 5 m e 20 m, o zoneamento fica com o FINO', () => {
  // A regressão que isto trava: quando a Fertilidade passou a gerar o mapa de
  // 20 m (v2.37.0), o zoneamento herdou a regra da dose e as divisas das zonas
  // saíram em escadinha de 20 m no mapa.
  const pre = 'T1__IMP1__';
  const itens = [
    { id: `${pre}krige__20__esferico__ctc__0-20`, tem: true, em: '2026-08-07T10:00:00Z' },
    { id: `${pre}krige__5__esferico__ctc__0-20`, tem: true, em: '2026-08-06T10:00:00Z' },
  ];
  const dose = escolherMapas(pre, itens, 'dose');
  assert.equal(dose['ctc__0-20'].pixel, 20, 'a dose continua em 20 m');
  const zona = escolherMapas(pre, itens, 'zona');
  assert.equal(zona['ctc__0-20'].pixel, 5, 'a zona pega o mais fino, mesmo sendo mais antigo');
});

t('USO ZONA: sem pixel no id (legado) perde para qualquer mapa com pixel', () => {
  const pre = 'T1__IMP1__';
  const zona = escolherMapas(pre, [
    { id: `${pre}legenda__ctc__0-20`, tem: true, em: '2026-08-07T10:00:00Z' },
    { id: `${pre}krige__20__esferico__ctc__0-20`, tem: true, em: '2026-01-01T10:00:00Z' },
  ], 'zona');
  assert.equal(zona['ctc__0-20'].pixel, 20);
});

t('USO ZONA: entre dois mapas do MESMO pixel, o mais recente ganha', () => {
  const pre = 'T1__IMP1__';
  const zona = escolherMapas(pre, [
    { id: `${pre}idw__5__auto__ctc__0-20`, tem: true, em: '2026-08-01T10:00:00Z' },
    { id: `${pre}krige__5__esferico__ctc__0-20`, tem: true, em: '2026-08-07T10:00:00Z' },
  ], 'zona');
  assert.equal(zona['ctc__0-20'].metodo, 'krige');
});

t('sem grid nunca ganha, em nenhum dos usos', () => {
  const pre = 'T1__IMP1__';
  const itens = [
    { id: `${pre}krige__5__esferico__ctc__0-20`, tem: false, em: '2026-08-07T10:00:00Z' },
    { id: `${pre}krige__20__esferico__ctc__0-20`, tem: true, em: '2026-01-01T10:00:00Z' },
  ];
  for (const uso of ['dose', 'zona']) {
    assert.equal(escolherMapas(pre, itens, uso)['ctc__0-20'].pixel, 20, `uso ${uso}`);
  }
});

// ── RECOMENDAÇÃO EM CIMA DE ZONAS ─────────────────────────────────────────
// O relato: "trabalho com resultados de análise na zona de manejo e a
// recomendação sai INTERPOLADA". Causa: a gaveta `dose20__` só era escrita pelo
// caminho da interpolação, então o mapa de 20 m de um processamento ANTERIOR
// continuava lá e alimentava a dose, por mais que a Fertilidade estivesse em
// modo zona. Agora o modo zona grava na gaveta também.

t('DOSE: mapa por ZONA recém-processado ganha do interpolado que ficou na gaveta', () => {
  const pre = prefixoDose20('T1', 'IMP1');
  const escolha = escolherMapas(pre, [
    // o que sobrou de um "Processar tudo" antigo, por interpolação
    { id: idDose20('T1', 'IMP1', 'krige', 'esferico', 'satk', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    // o que o usuário acabou de processar em zona
    { id: idDose20('T1', 'IMP1', 'zona', '', 'satk', '0-20'), tem: true, em: '2026-08-20T10:00:00Z' },
  ], 'dose');
  assert.equal(escolha['satk__0-20'].metodo, 'zona', 'a dose tem de sair do mapa por zona');
  assert.equal(escolha['satk__0-20'].eh20, true, 'e continua sendo um mapa de 20 m');
});

t('DOSE: reprocessar por INTERPOLAÇÃO depois volta a mandar (o mais recente vence)', () => {
  const pre = prefixoDose20('T1', 'IMP1');
  const escolha = escolherMapas(pre, [
    { id: idDose20('T1', 'IMP1', 'zona', '', 'satk', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: idDose20('T1', 'IMP1', 'krige', 'esferico', 'satk', '0-20'), tem: true, em: '2026-08-20T10:00:00Z' },
  ], 'dose');
  assert.equal(escolha['satk__0-20'].metodo, 'krige');
});

// Duas zonas coladas, valores bem distintos — se algo interpolar/borrar, aparece
// um valor que não é nem 10 nem 40 e o teste pega.
const zonaQuadrada = (x0, x1, valor) => ({
  id: String(valor), valor,
  geometry: { type: 'Polygon', coordinates: [[[x0, -25], [x1, -25], [x1, -24.99], [x0, -24.99], [x0, -25]]] },
});
const ZONAS_TESTE = [zonaQuadrada(-50, -49.995, 10), zonaQuadrada(-49.995, -49.99, 40)];

t('mapa por zona é CHAPADO: só existem os valores das zonas, nada no meio', () => {
  const r = rasterizarZonas(ZONAS_TESTE, 20);
  const { valores } = decodeGrid(r.grid);
  const distintos = [...new Set([...valores].filter(Number.isFinite))].sort((a, b) => a - b);
  assert.deepEqual(distintos, [10, 40], `apareceu valor intermediário: ${distintos}`);
});

t('rasterizar em 20 m continua chapado (é o que alimenta a DOSE)', () => {
  const r = rasterizarZonas(ZONAS_TESTE, 20);
  assert.equal(r.stats.pixel_m, 20);
  assert.equal(r.stats.modelo, 'zona');
  const { valores } = decodeGrid(r.grid);
  const distintos = [...new Set([...valores].filter(Number.isFinite))];
  assert.equal(distintos.length, 2, 'a dose por zona não pode ter degradê');
});

t('POR QUE rasterizamos de novo em vez de reamostrar: a média BORRA a divisa', () => {
  // Reamostrar (média de blocos, o fallback do aplicar.ts) mistura as duas zonas
  // na célula que cai em cima da divisa e inventa um valor que não é de zona
  // nenhuma — exatamente o "interpolado" que o usuário não quer.
  const fino = rasterizarZonas(ZONAS_TESTE, 5);
  const { valores } = decodeGrid(fino.grid);
  const [rows, cols] = fino.grid.shape;
  const f = 4;                                   // 5 m → 20 m
  const nc = Math.ceil(cols / f);
  const borrados = new Set();
  for (let r = 0; r < Math.ceil(rows / f); r++) {
    for (let c = 0; c < nc; c++) {
      let soma = 0, n = 0;
      for (let i = r * f; i < Math.min((r + 1) * f, rows); i++) {
        for (let j = c * f; j < Math.min((c + 1) * f, cols); j++) {
          const v = valores[i * cols + j];
          if (Number.isFinite(v)) { soma += v; n++; }
        }
      }
      if (n) borrados.add(soma / n);
    }
  }
  const intermediarios = [...borrados].filter(v => v !== 10 && v !== 40);
  assert.ok(intermediarios.length > 0, 'a reamostragem deveria borrar — é por isso que não a usamos');
});

// ── malha da DOSE por zona ────────────────────────────────────────────────
// A Recomendação casa os atributos POR ÍNDICE. Se cada nutriente rasterizasse a
// bbox das SUAS zonas com valor, um laudo incompleto (K em 4 zonas, CTC em 3)
// daria malhas diferentes: ou a equação quebra, ou — quando a diferença é menor
// que um pixel — os shapes batem e a dose sai deslocada em silêncio.
const TALHAO = {
  type: 'Polygon',
  coordinates: [[[-50, -25], [-49.99, -25], [-49.99, -24.99], [-50, -24.99], [-50, -25]]],
};

t('DOSE por zona: malha IGUAL mesmo com conjuntos de zonas diferentes', () => {
  const k = rasterizarZonasDose(ZONAS_TESTE, TALHAO, 20);                  // 2 zonas
  const ctc = rasterizarZonasDose([ZONAS_TESTE[0]], TALHAO, 20);           // só 1 zona
  assert.deepEqual(k.grid.shape, ctc.grid.shape, 'shapes têm de bater');
  assert.deepEqual(k.bounds, ctc.bounds, 'bounds têm de bater (senão a dose desloca)');
});

t('DOSE por zona: malha NÃO depende da bbox das zonas, e sim do talhão', () => {
  // Uma zona que cobre só um pedacinho do talhão gera a MESMA malha.
  const canto = { id: 'x', valor: 7, geometry: {
    type: 'Polygon',
    coordinates: [[[-50, -25], [-49.999, -25], [-49.999, -24.999], [-50, -24.999], [-50, -25]]],
  } };
  const a = rasterizarZonasDose(ZONAS_TESTE, TALHAO, 20);
  const b = rasterizarZonasDose([canto], TALHAO, 20);
  assert.deepEqual(a.grid.shape, b.grid.shape);
  assert.deepEqual(a.bounds, b.bounds);
});

t('DOSE por zona continua CHAPADA (a borda copia, não tira média)', () => {
  const r = rasterizarZonasDose(ZONAS_TESTE, TALHAO, 20);
  const { valores } = decodeGrid(r.grid);
  const distintos = [...new Set([...valores].filter(Number.isFinite))].sort((a, b) => a - b);
  assert.deepEqual(distintos, [10, 40], `a divisa borrou: ${distintos}`);
});

t('DOSE por zona: bounds são a extensão dos NÓS (convenção da cobertura)', () => {
  // coberturaDoGrid faz dx=(e-w)/(cols-1) e põe o nó no centro da célula. Se os
  // bounds fossem de ARESTA, a máscara ficaria meio pixel fora do raster e a
  // tonelagem/custo sairiam errados na borda.
  const r = rasterizarZonasDose(ZONAS_TESTE, TALHAO, 20);
  const [rows, cols] = r.grid.shape;
  const [w, s, e, n] = r.bounds;
  const dx = (e - w) / (cols - 1);
  const dLonEsperado = 20 / (111320 * Math.cos((-24.995 * Math.PI) / 180));
  assert.ok(Math.abs(dx - dLonEsperado) / dLonEsperado < 0.05, `passo ${dx} ≠ ~20 m`);
  assert.ok(rows > 1 && cols > 1);
  assert.ok(n > s && e > w);
});

t('DOSE por zona: a coroa cobre a borda (sem faixa sem dose na divisa)', () => {
  const r = rasterizarZonasDose(ZONAS_TESTE, TALHAO, 20);
  const { valores } = decodeGrid(r.grid);
  const [rows, cols] = r.grid.shape;
  // a linha do meio tem de estar inteira preenchida de ponta a ponta
  const meio = Math.floor(rows / 2);
  let vazios = 0;
  for (let c = 0; c < cols; c++) if (!Number.isFinite(valores[meio * cols + c])) vazios++;
  assert.equal(vazios, 0, `${vazios} células sem dose na faixa da borda`);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
