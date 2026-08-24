// Testes do relatório PDF de CONDUTIVIDADE por quintil.
//
// Pedido de 07/08/2026: "exportar um pdf com o mapa nos nossos padrões; a
// condutividade pode ser exportada em uma escala de quintil".
//
// O que se trava aqui é o que o leitor do PDF confere de cabeça: os rótulos das
// faixas, a soma da tabela fechando 100% e a recusa honesta quando falta dado.
// O desenho em si (jsPDF/canvas) não roda em node — ver a nota no fim do arquivo.
//
// Roda: `npm run teste:cea`.
import assert from 'node:assert/strict';
import { rotuloFaixaCea, mediaFaixaCea, validarCondutividade, nomeArquivoCondutividade } from '../src/lib/relatorioCondutividade.ts';
import { classesQuantis } from '../src/lib/quantis.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const CORES = ['#2166AC', '#67A9CF', '#F7F7F7', '#EF8A62', '#B2182B'];
const NOMES = ['Muito Baixa', 'Baixa', 'Média', 'Alta', 'Muito Alta'];
// 100 valores de 1 a 100: quintis caem em 20/40/60/80.
const valores = Float32Array.from({ length: 100 }, (_, i) => i + 1);
const q = classesQuantis(valores, { k: 5, pixelM: 5, cores: CORES, nomes: NOMES });

const base = {
  fazenda: 'Santo André', produtor: 'A.S.', talhao: 'IGEFI 03', siglaFazenda: 'AFSSA',
  areaHa: 100, municipio: 'Carambeí', estado: 'PR',
  levantamento: 'IGEFI 03_CE_BRUTA', camada: 'ce', ano: 2026,
  rasterPng: 'data:image/png;base64,AAAA', bounds: [-50, -25, -49, -24], quantis: q,
  poligono: { type: 'Polygon', coordinates: [[[-50, -25], [-49, -25], [-49, -24], [-50, -25]]] },
  unidade: 'mS/m', satelite: true, corLimite: '#fff',
  nPontos: 298, modelo: 'exponencial', pixelM: 5, rmse: 1.67, minObs: 10, maxObs: 40,
};

console.log('\nRelatório de condutividade por quintil\n');

// ── Quintil de verdade ───────────────────────────────────────────────────────

t('5 faixas, cada uma com ~20% da área — é o que "quintil" promete', () => {
  assert.equal(q.faixas.length, 5);
  for (const f of q.faixas) assert.ok(Math.abs(f.pctArea - 20) < 1.5, `faixa com ${f.pctArea}% da área`);
});

t('a tabela FECHA 100% — relatório que não fecha destrói a confiança', () => {
  const soma = q.faixas.reduce((s, f) => s + f.pctArea, 0);
  assert.ok(Math.abs(soma - 100) < 0.05, `somou ${soma}%`);
});

t('as faixas cobrem do mínimo ao máximo, sem buraco entre elas', () => {
  assert.equal(q.faixas[0].min, 1);
  assert.equal(q.faixas[4].max, 100);
  for (let i = 1; i < q.faixas.length; i++) {
    assert.equal(q.faixas[i].min, q.faixas[i - 1].max, `buraco entre a faixa ${i} e a ${i + 1}`);
  }
});

// ── A MÉDIA é o que substituiu as colunas tautológicas (ha e %) ──────────────
// No quintil toda faixa fica com ~20% da área POR CONSTRUÇÃO, então área e
// percentual saíam iguais nas cinco linhas — foi o que o usuário viu como
// "valor travado". O que varia, e informa, é o intervalo e a média.

t('a área é IGUAL em todas as faixas — é o quintil, não um valor travado', () => {
  const areas = new Set(q.faixas.map(f => f.areaHa.toFixed(4)));
  assert.equal(areas.size, 1, 'se isto falhar, a premissa da correção mudou');
});

t('a MÉDIA, ao contrário, é diferente em cada faixa', () => {
  const medias = q.faixas.map((_, i) => mediaFaixaCea(q, i));
  assert.equal(new Set(medias.map(m => m.toFixed(3))).size, medias.length, `médias repetidas: ${medias}`);
});

t('a média CRESCE da primeira à última faixa', () => {
  const m = q.faixas.map((_, i) => mediaFaixaCea(q, i));
  for (let i = 1; i < m.length; i++) assert.ok(m[i] > m[i - 1], `faixa ${i + 1} não é maior que a ${i}`);
});

t('a média de cada faixa cai DENTRO do intervalo dela', () => {
  q.faixas.forEach((f, i) => {
    const m = mediaFaixaCea(q, i);
    assert.ok(m >= f.min && m <= f.max, `média ${m} fora de [${f.min}, ${f.max}]`);
  });
});

t('valores 1..100 em quintis: as médias batem com a conta à mão', () => {
  // faixa 1 = 1..20 → média 10,5; faixa 5 = 81..100 → média 90,5
  assert.ok(Math.abs(mediaFaixaCea(q, 0) - 10.5) < 0.01);
  assert.ok(Math.abs(mediaFaixaCea(q, 4) - 90.5) < 0.01);
});

// ── Rótulos: o que o leitor lê na tabela ─────────────────────────────────────

t('a primeira faixa é "<= x" e a última "&gt;= y" — não fingem limite inventado', () => {
  assert.match(rotuloFaixaCea(q, 0), /^<= /);
  assert.match(rotuloFaixaCea(q, 4), /^>= /);
  assert.match(rotuloFaixaCea(q, 2), /^\d/, 'as do meio saem como intervalo');
  assert.match(rotuloFaixaCea(q, 2), / - /);
});

t('número em pt-BR, uma casa decimal', () => {
  assert.ok(rotuloFaixaCea(q, 2).includes(','), `sem vírgula decimal: ${rotuloFaixaCea(q, 2)}`);
});

t('faixa única (mapa uniforme) sai como intervalo, não como "<= x"', () => {
  const u = classesQuantis(Float32Array.from({ length: 50 }, () => 7), { k: 5, pixelM: 5, cores: CORES, nomes: NOMES });
  if (u) { assert.equal(u.faixas.length, 1); assert.match(rotuloFaixaCea(u, 0), / - /); }
});

// ── Recusa honesta ───────────────────────────────────────────────────────────

t('sem raster interpolado, recusa e diz o que fazer', () => {
  assert.match(validarCondutividade({ ...base, rasterPng: '' }), /Interpole o mapa/);
});

t('sem contorno do talhão, recusa — o mapa não teria como ser recortado', () => {
  assert.match(validarCondutividade({ ...base, poligono: null }), /contorno/);
});

t('com tudo em ordem, não recusa', () => {
  assert.equal(validarCondutividade(base), null);
});

// ── Nome do arquivo ──────────────────────────────────────────────────────────

t('nome no padrão da casa, com a camada no fim', () => {
  assert.equal(nomeArquivoCondutividade(base), 'AFSS03_COND_2026_CE');
  assert.match(nomeArquivoCondutividade(base), /^[A-Z0-9_]+$/);
});

t('sem ano, o nome não inventa segmento', () => {
  assert.equal(nomeArquivoCondutividade({ ...base, ano: null }), 'AFSS03_COND_CE');
});

// NOTA: o DESENHO da página (jsPDF + captura do mapa em canvas) não roda em
// node — depende de document/Image. É verificado abrindo o PDF no app.

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
