// Testes da unidade de produtividade do Portal do Produtor (lib/portalUnidade):
// kg/ha · sc/ha · sc/alq, casas decimais, legendas convertidas sem mudar a
// régua e a chave da preferência no navegador.
// Roda: `node scripts/teste-portal-unidade.mjs`
import assert from 'node:assert/strict';
import {
  UNIDADES_PROD, UNIDADE_PROD_PADRAO, KG_POR_SACA, HA_POR_ALQUEIRE, ehUnidadeProd, normalizarUnidadeProd, casasDaUnidade,
  deScHa, deScHaOuNulo, deKgHa, arredondarNaUnidade, fmtNaUnidade, fmtScHa, fmtKgHa, classesNaUnidade, passoDoEixo, chaveUnidadeProd,
} from '../src/lib/portalUnidade.ts';
import { classesEmSacas, distribuirEmClasses, kpiProdutividade, produtividadePorTalhao, historicoProdutividade, resumoPorTalhao } from '../src/lib/portalPainel.ts';
import { linhasProdutividade, resumoProdutividade, historicoPorSafra } from '../src/lib/portalPainelSensores.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };
const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

console.log('portalUnidade');

t('três unidades, padrão kg/ha; saca 60 kg, alqueire 2,42 ha', () => {
  assert.deepEqual([...UNIDADES_PROD], ['kg/ha', 'sc/ha', 'sc/alq']);
  assert.equal(UNIDADE_PROD_PADRAO, 'kg/ha');
  assert.equal(KG_POR_SACA, 60);
  assert.equal(HA_POR_ALQUEIRE, 2.42);
});

t('valor salvo inválido (ou ausente) volta ao padrão kg/ha', () => {
  assert.equal(normalizarUnidadeProd('sc/alq'), 'sc/alq');
  assert.equal(normalizarUnidadeProd('sc/ha'), 'sc/ha');
  assert.equal(normalizarUnidadeProd(null), 'kg/ha');
  assert.equal(normalizarUnidadeProd(''), 'kg/ha');
  assert.equal(normalizarUnidadeProd('SC/HA'), 'kg/ha');
  assert.equal(normalizarUnidadeProd('t/ha'), 'kg/ha');
  assert.ok(ehUnidadeProd('kg/ha'));
  assert.ok(!ehUnidadeProd(42));
});

t('casas: kg/ha inteiro, sacas 1 casa', () => {
  assert.equal(casasDaUnidade('kg/ha'), 0);
  assert.equal(casasDaUnidade('sc/ha'), 1);
  assert.equal(casasDaUnidade('sc/alq'), 1);
});

t('sc/ha → kg/ha (×60), sc/ha (=), sc/alq (×2,42)', () => {
  perto(deScHa(96.4, 'kg/ha'), 5784);
  perto(deScHa(96.4, 'sc/ha'), 96.4);
  perto(deScHa(96.4, 'sc/alq'), 233.288);
  perto(deScHa(60, 'sc/alq'), 145.2);
  assert.equal(deScHaOuNulo(null, 'kg/ha'), null);
  assert.equal(deScHaOuNulo(undefined, 'sc/alq'), null);
  assert.equal(deScHaOuNulo(Number.NaN, 'sc/ha'), null);
  assert.equal(deScHaOuNulo(0, 'kg/ha'), 0);
});

t('kg/ha → sc/ha reaproveita kgParaSc (1 casa); sc/alq sem arredondar no meio', () => {
  assert.equal(deKgHa(3500, 'kg/ha'), 3500);
  assert.equal(deKgHa(3500, 'sc/ha'), 58.3);
  perto(deKgHa(3500, 'sc/alq'), (3500 / 60) * 2.42);
  perto(deKgHa(3600, 'sc/alq'), 145.2);
});

t('ida e volta: kg/ha → sc/ha → kg/ha fica dentro de meia décima de saca', () => {
  for (const kg of [1234, 3499, 3500, 3501, 5781, 14160]) {
    const volta = deScHa(deKgHa(kg, 'sc/ha'), 'kg/ha');
    assert.ok(Math.abs(volta - kg) <= 3, `${kg} → ${volta}`);
  }
});

t('arredondar nas casas da unidade', () => {
  assert.equal(arredondarNaUnidade(5783.6, 'kg/ha'), 5784);
  assert.equal(arredondarNaUnidade(233.288, 'sc/alq'), 233.3);
  assert.equal(arredondarNaUnidade(96.44, 'sc/ha'), 96.4);
});

t('formato pt-BR: "5.784 kg/ha", "96,4 sc/ha", "233,3 sc/alq"', () => {
  assert.equal(fmtScHa(96.4, 'kg/ha'), '5.784 kg/ha');
  assert.equal(fmtScHa(96.4, 'sc/ha'), '96,4 sc/ha');
  assert.equal(fmtScHa(96.4, 'sc/alq'), '233,3 sc/alq');
  assert.equal(fmtScHa(60, 'sc/ha'), '60,0 sc/ha');
  assert.equal(fmtScHa(96.4, 'kg/ha', false), '5.784');
  assert.equal(fmtScHa(null, 'kg/ha'), '—');
  assert.equal(fmtNaUnidade(14160, 'kg/ha', true), '14.160 kg/ha');
  assert.equal(fmtNaUnidade(undefined, 'sc/ha'), '—');
});

t('kg/ha da legenda → texto na unidade', () => {
  assert.equal(fmtKgHa(3600, 'kg/ha'), '3.600 kg/ha');
  assert.equal(fmtKgHa(3600, 'sc/ha'), '60,0 sc/ha');
  assert.equal(fmtKgHa(3600, 'sc/alq'), '145,2 sc/alq');
  assert.equal(fmtKgHa(null, 'sc/alq'), '—');
});

// Legenda de soja em kg/ha (forma das oficiais).
const LEG = [
  { nome: 'Muito Baixa', valorMin: null, valorMax: 2700, ordem: 1, larguraVisual: 20, corInicio: '#d7191c', corFim: '#d7191c' },
  { nome: 'Baixa', valorMin: 2700, valorMax: 3600, ordem: 2, larguraVisual: 20, corInicio: '#fdae61', corFim: '#fdae61' },
  { nome: 'Média', valorMin: 3600, valorMax: 4500, ordem: 3, larguraVisual: 20, corInicio: '#ffffbf', corFim: '#ffffbf' },
  { nome: 'Alta', valorMin: 4500, valorMax: 5400, ordem: 4, larguraVisual: 20, corInicio: '#a6d96a', corFim: '#a6d96a' },
  { nome: 'Muito Alta', valorMin: 5400, valorMax: null, ordem: 5, larguraVisual: 20, corInicio: '#1a9641', corFim: '#1a9641' },
];

t('limites da legenda convertidos (kg/ha original, sem arredondar a 58,3·60)', () => {
  assert.deepEqual(classesNaUnidade(LEG, 'kg/ha').map(c => [c.valorMin, c.valorMax]), [[null, 2700], [2700, 3600], [3600, 4500], [4500, 5400], [5400, null]]);
  assert.deepEqual(classesNaUnidade(LEG, 'sc/ha').map(c => [c.valorMin, c.valorMax]), [[null, 45], [45, 60], [60, 75], [75, 90], [90, null]]);
  const alq = classesNaUnidade(LEG, 'sc/alq');
  perto(alq[1].valorMax, 145.2);
  perto(alq[4].valorMin, 217.8);
  assert.equal(alq[0].valorMin, null);
  // Nomes, cores e ordem intactos; a legenda de entrada não é alterada.
  assert.deepEqual(alq.map(c => c.nome), LEG.map(c => c.nome));
  assert.equal(LEG[1].valorMax, 3600);
});

t('a classe de cada talhão NÃO muda com a unidade (a régua é a mesma)', () => {
  const itens = [{ id: 'a', valor: 59.9, areaHa: 10 }, { id: 'b', valor: 60, areaHa: 10 }, { id: 'c', valor: 96.4, areaHa: 10 }];
  const regua = classesEmSacas(LEG);
  const dist = distribuirEmClasses(itens, regua);
  assert.deepEqual(dist.classePorId, { a: 'Baixa', b: 'Baixa', c: 'Muito Alta' });
  // A tela só troca o TEXTO dos limites: as faixas convertidas, casadas pelo nome.
  const faixa = new Map(classesNaUnidade(LEG, 'kg/ha').map(c => [c.nome, c]));
  assert.equal(faixa.get(dist.classePorId.b).valorMax, 3600);
  assert.equal(fmtScHa(60, 'kg/ha'), '3.600 kg/ha');
});

// Mapas de colheita: o número que a tela recebe tem de ser o do mapa, sem o
// arredondamento a 1 casa de saca no meio (3.500 kg/ha virava 58,3 sc → "3.498").
const col = (ano, kgha, area, extra = {}) => ({ safra: `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`, ano, oficial: true, cultura: 'Soja', criadoEm: `${ano}-04-01T00:00:00Z`,
  stats: { mediaKgha: kgha, areaHa: area, minKgha: kgha - 700, maxKgha: kgha + 700, cv: 10, producaoTotalKg: kgha * area }, ...extra });
const tal = (id, area, cols) => ({ talhao: { id, fazendaId: 'F1', nome: id, areaHa: area, status: 'ativo' }, colheitas: cols });
const A = tal('A', 10, [col(2026, 3500, 10), col(2025, 3497, 10)]);
const B = tal('B', 10, [col(2026, 3500, 10), col(2025, 3503, 10)]);
const C = tal('C', 20, [col(2026, 5781, 20)]);

t('3.500 kg/ha sai "3.500 kg/ha" na Visão geral (KPI, mapa, Top 5, histórico, Talhões)', () => {
  const kpi = kpiProdutividade([A, B], 2026, 'Soja');
  assert.equal(fmtScHa(kpi.media, 'kg/ha'), '3.500 kg/ha');
  assert.equal(fmtScHa(kpi.anterior, 'kg/ha'), '3.500 kg/ha');
  assert.equal(fmtScHa(kpi.min, 'kg/ha'), '3.500 kg/ha');
  const um = kpiProdutividade([A], 2026, 'Soja');
  assert.equal(`${fmtScHa(um.min, 'kg/ha', false)} – ${fmtScHa(um.max, 'kg/ha')}`, '2.800 – 4.200 kg/ha');
  const prods = produtividadePorTalhao([A, C], 2026, 'Soja');
  assert.deepEqual(prods.map(p => fmtScHa(p.mediaScHa, 'kg/ha')), ['5.781 kg/ha', '3.500 kg/ha']);
  assert.deepEqual(historicoProdutividade(A, 'Soja').map(h => fmtScHa(h.mediaScHa, 'kg/ha')), ['3.497 kg/ha', '3.500 kg/ha']);
  assert.equal(fmtScHa(resumoPorTalhao([A], 2026, 'Soja')[0].prodScHa, 'kg/ha'), '3.500 kg/ha');
  // E nas sacas a tela continua com 1 casa.
  assert.equal(fmtScHa(kpi.media, 'sc/ha'), '58,3 sc/ha');
  assert.equal(fmtScHa(kpi.media, 'sc/alq'), '141,2 sc/alq');
});

t('3.500 kg/ha sai "3.500 kg/ha" no ranking e no resumo da página Produtividade', () => {
  const { linhas } = linhasProdutividade([A, B, C], 2026, 'Soja');
  assert.deepEqual(linhas.map(l => fmtScHa(l.mediaScHa, 'kg/ha')), ['5.781 kg/ha', '3.500 kg/ha', '3.500 kg/ha']);
  assert.equal(fmtScHa(linhas[1].anteriorScHa, 'kg/ha'), '3.497 kg/ha');
  assert.equal(fmtScHa(linhas[1].minScHa, 'kg/ha'), '2.800 kg/ha');
  const r = resumoProdutividade(linhasProdutividade([A, B], 2026, 'Soja').linhas, 'Soja', linhasProdutividade([A, B], 2025, 'Soja').linhas);
  assert.equal(fmtScHa(r.mediaScHa, 'kg/ha'), '3.500 kg/ha');
  assert.equal(fmtScHa(r.anteriorScHa, 'kg/ha'), '3.500 kg/ha');
  assert.equal(fmtScHa(r.melhor.mediaScHa, 'kg/ha'), '3.500 kg/ha');
  assert.deepEqual(historicoPorSafra([A, B]).map(h => fmtScHa(h.mediaScHa, 'kg/ha')), ['3.500 kg/ha', '3.500 kg/ha']);
});

t('limite exato: 3.500 kg/ha fica na classe (…, 3.500] em qualquer unidade', () => {
  const leg = [
    { nome: 'Baixa', valorMin: null, valorMax: 3500, ordem: 1, larguraVisual: 50, corInicio: '#f00', corFim: '#f00' },
    { nome: 'Alta', valorMin: 3500, valorMax: null, ordem: 2, larguraVisual: 50, corInicio: '#0f0', corFim: '#0f0' },
  ];
  const prods = produtividadePorTalhao([A, tal('D', 10, [col(2026, 3502, 10)])], 2026, 'Soja');
  const dist = distribuirEmClasses(prods.map(p => ({ id: p.talhaoId, valor: p.mediaScHa, areaHa: p.areaHa })), classesEmSacas(leg));
  assert.deepEqual(dist.classePorId, { A: 'Baixa', D: 'Alta' });
  assert.equal(fmtNaUnidade(classesNaUnidade(leg, 'kg/ha')[0].valorMax, 'kg/ha', true), '3.500 kg/ha');
});

t('passo do eixo redondo nas três escalas', () => {
  assert.equal(passoDoEixo(40), 10);
  assert.equal(passoDoEixo(80), 20);
  assert.equal(passoDoEixo(2400), 500);
  assert.equal(passoDoEixo(97), 20);
  assert.equal(passoDoEixo(0), 1);
});

t('chave do navegador por produtor', () => {
  assert.equal(chaveUnidadeProd('cli-1'), 'inv_portal_unidade_prod:cli-1');
  assert.notEqual(chaveUnidadeProd('a'), chaveUnidadeProd('b'));
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
