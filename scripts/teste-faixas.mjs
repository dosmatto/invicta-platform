// Testes da classificação por faixa da DOSE (mapa × tabela do plano de aplicação).
// Trava o bug de 27/07/2026: com dose mínima 1.000 e piso operacional, os pixels
// no piso (valor === 1.000) apareciam no MAPA com a cor da faixa "50–1.000"
// (roxo), enquanto a TABELA os contava em "1.000–2.000" (azul) — o mapa exibia
// cores que não existiam na legenda. Roda: `npm run teste:faixas`.
import assert from 'node:assert/strict';
import { classesVisiveis, indiceClasse } from '../src/lib/recomendacao/faixas.ts';
import { reidratarDoses, equacaoBaseDaDose, estiloUtilizavel, sufixoFormulaEditada } from '../src/lib/recomendacao/legendaViva.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Estilo real do relatório do usuário (Calcário/Gesso)
const CLASSES = [
  { cor: '#5b3fa8', limiteSuperior: 1000 },   // "50 – 1.000"  (roxo)
  { cor: '#2f7fd1', limiteSuperior: 2000 },   // "1.000 – 2.000" (azul)
  { cor: '#66c2a5', limiteSuperior: 3000 },
  { cor: '#a6d96a', limiteSuperior: 4000 },
  { cor: '#e6f598', limiteSuperior: 5000 },
  { cor: '#fee08b', limiteSuperior: 6000 },
  { cor: '#f4a582', limiteSuperior: 7000 },
  { cor: '#d6604d', limiteSuperior: 8000 },
  { cor: '#b2182b', limiteSuperior: 9000 },
  { cor: '#67001f', limiteSuperior: 10000 },  // roxo escuro
];
const corDe = (classes, v) => classes[indiceClasse(v, classes.map(c => c.limiteSuperior))].cor;

t('mínima 1.000: a faixa "50–1.000" (roxa) NÃO é visível', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  assert.equal(vis[0].limiteSuperior, 2000, 'a 1ª faixa visível deve ser 1.000–2.000');
  assert.ok(!vis.some(c => c.limiteSuperior === 1000), 'faixa 50–1.000 não deve aparecer');
});

t('BUG: pixel no PISO (v = mínima = 1.000) → azul, nunca roxo', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  assert.equal(corDe(vis, 1000), '#2f7fd1', 'v=1000 deve cair em 1.000–2.000 (azul)');
  // Sem o fix (todas as classes) daria roxo — prova de que a regressão é detectável:
  assert.equal(corDe(CLASSES, 1000), '#5b3fa8', 'sem filtrar, v=1000 daria roxo (bug)');
});

t('Gesso do relatório: 1.000–1.906 fica TODO na faixa azul (100%)', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  for (const v of [1000, 1062, 1500, 1906, 1999.9]) {
    assert.equal(corDe(vis, v), '#2f7fd1', `v=${v} deveria ser azul`);
  }
});

t('mínima 150 (caso "01"): a faixa roxa CONTINUA visível', () => {
  const vis = classesVisiveis(CLASSES, 150);
  assert.equal(vis[0].limiteSuperior, 1000, 'com mínima 150, a faixa até 1.000 ocorre');
  assert.equal(corDe(vis, 900), '#5b3fa8', 'v=900 é roxo — e a legenda mostra essa faixa');
});

t('mínima 0 = comportamento antigo (todas as classes)', () => {
  assert.equal(classesVisiveis(CLASSES, 0).length, CLASSES.length);
  assert.equal(classesVisiveis(CLASSES).length, CLASSES.length);
});

t('valores acima do maior limite caem na última faixa', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  assert.equal(corDe(vis, 99999), '#67001f');
});

t('mapa e tabela usam a MESMA faixa (não divergem em nenhum valor)', () => {
  const min = 1000;
  const vis = classesVisiveis(CLASSES, min);
  const lims = vis.map(c => c.limiteSuperior);
  for (const v of [1000, 1000.0001, 1999, 2000, 2001, 3000, 6500, 12000]) {
    const kMapa = indiceClasse(v, lims);      // colorirDose
    const kTabela = indiceClasse(v, lims);    // planoDeAplicacao
    assert.equal(kMapa, kTabela, `divergiu em v=${v}`);
    assert.ok(kMapa >= 0 && kMapa < vis.length, `índice fora do intervalo em v=${v}`);
  }
});

t('mínima acima de TODOS os limites não deixa o mapa sem cor', () => {
  const vis = classesVisiveis(CLASSES, 999999);
  assert.equal(vis.length, 1, 'mantém a última classe como salvaguarda');
});

t('classes fora de ordem/inválidas são ordenadas e filtradas', () => {
  const bagunca = [
    { cor: '#c', limiteSuperior: 3000 },
    { cor: '#a', limiteSuperior: 1000 },
    { cor: '#x', limiteSuperior: Number.NaN },
    { cor: '#b', limiteSuperior: 2000 },
  ];
  const vis = classesVisiveis(bagunca, 0);
  assert.deepEqual(vis.map(c => c.limiteSuperior), [1000, 2000, 3000]);
});

// ── Legenda VIVA (re-hidratação dos rótulos da dose) ────────────────────────
// Trava o bug de 07/08/2026: a dose guarda uma CÓPIA do estilo da equação, e o
// relatório lia essa cópia — editar as faixas na Biblioteca nunca chegava ao
// mapa do PDF. Estes casos moram aqui (e não num script próprio) porque é a
// mesma regra de faixas da dose, e para não disputar o package.json.
console.log('\nLegenda viva — rótulos vêm da equação atual\n');

const NOVO = [
  { cor: '#111111', limiteSuperior: 500 },
  { cor: '#222222', limiteSuperior: 1500 },
  { cor: '#333333', limiteSuperior: 2500 },
];
const rot = (nome, estilo, produto = 'KCL') => ({ nome, estilo: { classes: estilo }, produto });
const dose = (equacaoId, extra = {}) => ({
  equacaoId, estilo: { classes: CLASSES }, nomeEquacao: 'KCL antigo', produto: 'KCl',
  doseMinima: 1000, custoHa: 42, ...extra,
});

t('equacaoBaseDaDose tira o sufixo de passada', () => {
  assert.equal(equacaoBaseDaDose('eq1'), 'eq1');
  assert.equal(equacaoBaseDaDose('eq1__ap2'), 'eq1');
  assert.equal(equacaoBaseDaDose('eq1__ap12'), 'eq1');
  assert.equal(equacaoBaseDaDose(''), '');
});

t('BUG: dose adota o estilo ATUAL da equação (era o snapshot congelado)', () => {
  const [d] = reidratarDoses([dose('eq1')], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.deepEqual(d.estilo.classes.map(c => c.limiteSuperior), [500, 1500, 2500]);
  assert.equal(d.nomeEquacao, 'KCL novo');
  assert.equal(d.produto, 'KCL');
});

t('passadas (__apN) herdam o estilo da equação BASE', () => {
  const atuais = new Map([['eq1', rot('KCL novo', NOVO)]]);
  const out = reidratarDoses([dose('eq1__ap1'), dose('eq1__ap2'), dose('eq1__ap3')], atuais);
  for (const d of out) assert.equal(d.estilo.classes[0].limiteSuperior, 500);
});

t('renomear preserva a marcação da passada', () => {
  const d0 = dose('eq1__ap2', { nomeEquacao: 'KCL antigo — aplicação 2/3' });
  const [d] = reidratarDoses([d0], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(d.nomeEquacao, 'KCL novo — aplicação 2/3');
});

t('BUG v2.73.0: reabrir o cenário apagava a marca da FÓRMULA EDITADA', () => {
  // Todo relatório passa por descomprimirCenario → reidratarDoses, que troca o
  // nome pelo da equação atual. Sem preservar a marca, o PDF de uma dose
  // calculada com a fórmula editada no talhão saía com o nome da equação da
  // Biblioteca — ou seja, passando por recomendação oficial padrão.
  const d0 = dose('eq1', { nomeEquacao: 'KCL antigo (fórmula editada)', formulaEditada: true });
  const [d] = reidratarDoses([d0], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(d.nomeEquacao, 'KCL novo (fórmula editada)');
});

t('a marca da fórmula editada não duplica ao reabrir várias vezes', () => {
  const atuais = new Map([['eq1', rot('KCL novo', NOVO)]]);
  let [d] = reidratarDoses([dose('eq1', { nomeEquacao: 'X', formulaEditada: true })], atuais);
  [d] = reidratarDoses([d], atuais);
  [d] = reidratarDoses([d], atuais);
  assert.equal(d.nomeEquacao, 'KCL novo (fórmula editada)');
});

t('cenário salvo ANTES da bandeira (só o nome marcado) continua marcado', () => {
  const d0 = dose('eq1', { nomeEquacao: 'KCL antigo (fórmula editada)' });   // sem formulaEditada
  const [d] = reidratarDoses([d0], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(d.nomeEquacao, 'KCL novo (fórmula editada)');
});

t('dose NÃO editada não ganha marca nenhuma', () => {
  const [d] = reidratarDoses([dose('eq1')], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(d.nomeEquacao, 'KCL novo');
  assert.equal(sufixoFormulaEditada(d), '');
});

t('passada + fórmula editada: as DUAS marcas sobrevivem, nessa ordem', () => {
  const d0 = dose('eq1__ap2', { nomeEquacao: 'KCL antigo — aplicação 2/3 (fórmula editada)', formulaEditada: true });
  const [d] = reidratarDoses([d0], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(d.nomeEquacao, 'KCL novo — aplicação 2/3 (fórmula editada)');
});

t('cada equação recebe o SEU estilo (não o da primeira dose)', () => {
  const atuais = new Map([
    ['eq1', rot('KCL novo', NOVO)],
    ['eq2', rot('Calcário novo', [{ cor: '#999', limiteSuperior: 4200 }], 'Calcário')],
  ]);
  const out = reidratarDoses([dose('eq1'), dose('eq2')], atuais);
  assert.equal(out[0].estilo.classes[0].limiteSuperior, 500);
  assert.equal(out[1].estilo.classes[0].limiteSuperior, 4200);
  assert.equal(out[1].produto, 'Calcário');
});

t('equação EXCLUÍDA → mantém o snapshot (mesma referência da dose)', () => {
  const entrada = [dose('sumiu')];
  const out = reidratarDoses(entrada, new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(out[0], entrada[0]);
  assert.equal(out[0].estilo.classes[0].limiteSuperior, 1000);
});

t('estilo atual SEM classe finita → mantém o snapshot', () => {
  for (const classes of [[], [{ cor: '#a', limiteSuperior: Number.NaN }], [{ cor: '#a', limiteSuperior: Infinity }]]) {
    const [d] = reidratarDoses([dose('eq1')], new Map([['eq1', rot('X', classes)]]));
    assert.equal(d.estilo.classes[0].limiteSuperior, 1000, `devia manter o snapshot com ${JSON.stringify(classes)}`);
    assert.equal(d.nomeEquacao, 'KCL antigo');
  }
  assert.equal(estiloUtilizavel(undefined), false);
  assert.equal(estiloUtilizavel({ classes: NOVO }), true);
});

t('cura ao contrário: snapshot inválido + atual válido → adota o atual', () => {
  const [d] = reidratarDoses([dose('eq1', { estilo: { classes: [] } })], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(d.estilo.classes[0].limiteSuperior, 500);
});

t('doseMinima e custos NÃO são re-hidratados (descrevem o cálculo)', () => {
  const [d] = reidratarDoses([dose('eq1')], new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(d.doseMinima, 1000);
  assert.equal(d.custoHa, 42);
});

t('não muta a entrada e preserva a ordem', () => {
  const entrada = [dose('eq1'), dose('eq2')];
  Object.freeze(entrada); entrada.forEach(Object.freeze);
  const out = reidratarDoses(entrada, new Map([['eq1', rot('KCL novo', NOVO)]]));
  assert.equal(entrada[0].estilo.classes[0].limiteSuperior, 1000, 'a dose original não pode mudar');
  assert.equal(entrada[0].nomeEquacao, 'KCL antigo');
  assert.deepEqual(out.map(d => d.equacaoId), ['eq1', 'eq2']);
});

t('lista vazia / mapa vazio não quebram', () => {
  assert.deepEqual(reidratarDoses([], new Map()), []);
  assert.equal(reidratarDoses([dose('eq1')], new Map())[0].nomeEquacao, 'KCL antigo');
});

t('PONTA A PONTA: depois de re-hidratar, mapa e tabela usam as faixas NOVAS', () => {
  const [d] = reidratarDoses([dose('eq1')], new Map([['eq1', rot('KCL novo', NOVO)]]));
  const vis = classesVisiveis(d.estilo.classes, d.doseMinima);   // mínima 1.000
  const lims = vis.map(c => c.limiteSuperior);
  assert.deepEqual(lims, [1500, 2500], 'a faixa até 500 não ocorre com mínima 1.000');
  for (const v of [1000, 1400, 1500, 2400, 9999]) {
    assert.equal(indiceClasse(v, lims), indiceClasse(v, lims), `mapa × tabela divergiram em v=${v}`);
  }
  assert.equal(corDe(vis, 1400), '#222222');
  // Prova de que a regressão é detectável: com o snapshot antigo daria outra cor.
  assert.equal(corDe(classesVisiveis(CLASSES, 1000), 1400), '#2f7fd1');
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
