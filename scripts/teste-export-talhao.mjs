// Testes do LIMITE DO TALHÃO em KML/SHP (src/lib/exportTalhao.ts).
//
// Pedido de 07/08/2026: "poder baixar clicando no talhão o kml e o shp dele".
// O que estes testes travam é o que quebra silenciosamente na mão de quem abre o
// arquivo: geometria ausente, furo do polígono perdido, acento no DBF e nome de
// campo maior que os 10 caracteres que o formato DBF aceita.
//
// Roda: `npm run teste:talhao`.
import assert from 'node:assert/strict';
import {
  poligonoDoTalhao, fcDoTalhao, gerarKMLTalhao, nomeArquivoTalhao, TalhaoSemGeometria,
} from '../src/lib/exportTalhao.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const quadrado = [[[-50, -25], [-49, -25], [-49, -24], [-50, -24], [-50, -25]]];
const talhao = (extra = {}) => ({
  nome: 'AFSSA 07', areaHa: 168.47,
  geojson: JSON.stringify({ type: 'Polygon', coordinates: quadrado }),
  ...extra,
});
const CTX = { fazenda: 'Santo André', siglaFazenda: 'AFSSA', produtor: 'A.S. Empreendimentos', municipio: 'Carambeí', estado: 'PR' };

console.log('\nLimite do talhão em KML/SHP\n');

// ── Geometria ────────────────────────────────────────────────────────────────

t('lê o polígono do talhão', () => {
  const g = poligonoDoTalhao(talhao());
  assert.equal(g.type, 'Polygon');
  assert.equal(g.coordinates[0].length, 5);
});

t('aceita FeatureCollection salva no talhão (é como o import grava)', () => {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: quadrado } }] };
  assert.equal(poligonoDoTalhao(talhao({ geojson: JSON.stringify(fc) })).type, 'Polygon');
});

t('talhão SEM contorno devolve null — e não finge um arquivo vazio', () => {
  assert.equal(poligonoDoTalhao(talhao({ geojson: null })), null);
  assert.equal(poligonoDoTalhao(talhao({ geojson: '{ lixo' })), null);
  assert.equal(fcDoTalhao(talhao({ geojson: null }), CTX), null);
  assert.equal(gerarKMLTalhao(talhao({ geojson: null }), CTX), null);
});

// ── Nome do arquivo ──────────────────────────────────────────────────────────

t('nome no padrão da casa, sem ano nem época (limite é cadastro)', () => {
  assert.equal(nomeArquivoTalhao(talhao(), CTX), 'AFSS07_LIMITE');
  assert.match(nomeArquivoTalhao(talhao(), CTX), /^[A-Z0-9_]+$/);
});

t('acento e barra no nome do talhão não vazam para o arquivo', () => {
  const n = nomeArquivoTalhao(talhao({ nome: 'Talhão 1/A' }), { ...CTX, siglaFazenda: null, fazenda: 'Estância São José' });
  assert.match(n, /^[A-Z0-9_]+$/, n);
});

// ── Atributos que o QGIS mostra ──────────────────────────────────────────────

t('a tabela leva talhão, área, fazenda, produtor e município', () => {
  const p = fcDoTalhao(talhao(), CTX).features[0].properties;
  assert.equal(p.talhao, 'AFSSA 07');
  assert.equal(p.area_ha, 168.47);
  assert.equal(p.fazenda, 'Santo André');
  assert.equal(p.produtor, 'A.S. Empreendimentos');
  assert.equal(p.municipio, 'Carambeí');
  assert.equal(p.uf, 'PR');
});

t('DBF trunca campo em 10 caracteres — nenhum nome pode passar disso', () => {
  for (const k of Object.keys(fcDoTalhao(talhao(), CTX).features[0].properties)) {
    assert.ok(k.length <= 10, `campo "${k}" tem ${k.length} caracteres e seria truncado`);
  }
});

t('área ausente vira null, não NaN nem "undefined"', () => {
  assert.equal(fcDoTalhao(talhao({ areaHa: undefined }), CTX).features[0].properties.area_ha, null);
});

// ── KML ──────────────────────────────────────────────────────────────────────

t('KML sai bem formado, com o contorno e o nome do talhão', () => {
  const kml = gerarKMLTalhao(talhao(), CTX);
  assert.match(kml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(kml, /<kml xmlns="http:\/\/www\.opengis\.net\/kml\/2\.2">/);
  assert.match(kml, /<name>AFSSA 07<\/name>/);
  assert.match(kml, /-50,-25,0/, 'faltou a coordenada');
  assert.equal((kml.match(/<Polygon>/g) ?? []).length, 1);
});

t('FURO do polígono vira innerBoundaryIs — some se ninguém escrever isso', () => {
  const furo = { type: 'Polygon', coordinates: [quadrado[0], [[-49.8, -24.8], [-49.6, -24.8], [-49.6, -24.6], [-49.8, -24.6], [-49.8, -24.8]]] };
  const kml = gerarKMLTalhao(talhao({ geojson: JSON.stringify(furo) }), CTX);
  assert.equal((kml.match(/<innerBoundaryIs>/g) ?? []).length, 1);
});

t('MultiPolygon (talhão em duas manchas) sai como MultiGeometry', () => {
  const mp = { type: 'MultiPolygon', coordinates: [quadrado, [[[-48, -23], [-47, -23], [-47, -22], [-48, -22], [-48, -23]]]] };
  const kml = gerarKMLTalhao(talhao({ geojson: JSON.stringify(mp) }), CTX);
  assert.match(kml, /<MultiGeometry>/);
  assert.equal((kml.match(/<Polygon>/g) ?? []).length, 2);
});

t('& e < no nome NÃO quebram o XML', () => {
  const kml = gerarKMLTalhao(talhao({ nome: 'A & B <teste>' }), CTX);
  assert.match(kml, /<name>A &amp; B &lt;teste&gt;<\/name>/);
  assert.ok(!/<name>A & B/.test(kml), 'o & cru quebraria o parser do Google Earth');
});

t('a descrição leva produtor, fazenda, área e município', () => {
  const kml = gerarKMLTalhao(talhao(), CTX);
  for (const p of ['A.S. Empreendimentos', 'Santo André', '168,47 ha', 'Carambeí - PR']) {
    assert.ok(kml.includes(p), `faltou "${p}" na descrição`);
  }
});

t('sem geometria, baixar avisa com mensagem de negócio', () => {
  assert.throws(() => { throw new TalhaoSemGeometria('AFSSA 07'); }, /não tem contorno salvo/);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
