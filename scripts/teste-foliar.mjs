// Núcleo de Diagnose Foliar (DRIS / CND / Faixa / Chance) — npm run teste:foliar
//
// O que este arquivo protege, em ordem de importância:
//   1. O TESTE-OURO (ledger 16): amostra idêntica à média da norma ⇒ todos os
//      índices ≈ 0, IBN ≈ 0 e as 11 classes de Wadt em 'z'. É o único caso em
//      que a resposta certa é conhecida sem depender de artigo nenhum.
//   2. Deficiência conhecida ⇒ ordem de limitação previsível: K 30% abaixo da
//      média tem de ser o mais limitante NO DRIS **e** NO CND. Divergência
//      entre os dois nesse caso significa erro de sinal.
//   3. NUNCA INVENTAR NÚMERO (ledger 17): sem norma, DRIS e CND vêm `null` com
//      motivo, e nada explode.
//   4. Nutriente ausente sai da conta sem virar NaN nem zero.

import assert from 'node:assert/strict';
import {
  calcularClr, calcularCnd, calcularDris, classificarPorFaixa, classificarTeor,
  consensoMultiMetodo, diagnosticar, funcaoF, interpretarColuna, normalizarNomeNutriente,
  normalizarTeores, razao, paresDeNutrientes, calcularConfianca, unidadeDaColuna,
} from '../src/lib/foliar/index.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Fixtures ────────────────────────────────────────────────────────────────
// Médias plausíveis de soja em R2, 3º trifólio COM pecíolo (ordem de grandeza
// de Kurihara et al. 2013). Macro em g/kg, micro em mg/kg.
const MEDIA = { N: 46, P: 2.7, K: 18.5, Ca: 5.4, Mg: 2.65, S: 2.25, B: 41, Cu: 8, Fe: 72, Mn: 24, Zn: 24 };

const FAIXAS = {
  N: { min: 45.0, max: 46.9 }, P: { min: 2.5, max: 2.9 }, K: { min: 17.0, max: 20.0 },
  Ca: { min: 5.0, max: 5.8 }, Mg: { min: 2.5, max: 2.8 }, S: { min: 2.1, max: 2.4 },
  B: { min: 36, max: 46 }, Cu: { min: 7, max: 9 }, Fe: { min: 59, max: 86 },
  Mn: { min: 21, max: 28 }, Zn: { min: 21, max: 28 },
};

// Pares na ordem canônica, com média = razão das médias e CV de 10%.
const PARES = paresDeNutrientes().map(p => {
  const media = MEDIA[p.a] / MEDIA[p.b];
  return { a: p.a, b: p.b, media, dp: media * 0.10, cv: 10, f: 1.8, nAlta: 60, nBaixa: 120 };
});

// Estatísticas clr: o centro é o clr da própria média (é o que a norma seria se
// a população de referência fosse toda igual à média), com DP arbitrário > 0.
const CLR_MEDIA = calcularClr(normalizarTeores(MEDIA));
const CND_NORMA = { media: { ...CLR_MEDIA.valores }, dp: {}, covInversa: null, n: 60 };
for (const k of Object.keys(CLR_MEDIA.valores)) CND_NORMA.dp[k] = 0.05;

// Chance matemática mínima: classe ótima centrada na média de cada nutriente.
const CHANCE = { corteKgha: 3600, porNutriente: {} };
for (const [id, v] of Object.entries(MEDIA)) {
  const f = FAIXAS[id];
  CHANCE.porNutriente[id] = {
    nutriente: id,
    classes: [
      { i: 0, min: f.min * 0.5, max: f.min, n: 20, nAlta: 2, probAlta: 0.1, chance: 0.02 },
      { i: 1, min: f.min, max: f.max, n: 30, nAlta: 24, probAlta: 0.8, chance: 0.64 },
      { i: 2, min: f.max, max: f.max * 1.6, n: 10, nAlta: 4, probAlta: 0.4, chance: 0.05 },
    ],
    classeOtima: 1,
    teorOtimo: v,
    faixaOtima: { min: f.min, max: f.max },
    n: 60,
  };
}

const NORMA = {
  id: 'norma-teste', versao: 1,
  cultura: 'Soja', orgao: 'trifolio-com-peciolo', estadio: 'R1-R2',
  fonte: 'Norma sintética de teste — não usar em campo',
  origem: 'gerada', n: 60,
  criterioCorte: 'produtividade ≥ 3.600 kg/ha',
  pares: PARES, cnd: CND_NORMA, faixas: FAIXAS, chance: CHANCE,
};

console.log('\nCatálogo de nutrientes — o tradutor de cabeçalho\n');

t('reconhece símbolo, nome por extenso e unidade no cabeçalho', () => {
  assert.equal(normalizarNomeNutriente('N (g/kg)'), 'N');
  assert.equal(normalizarNomeNutriente('Nitrogênio'), 'N');
  assert.equal(normalizarNomeNutriente('B (mg/kg)'), 'B');
  assert.equal(normalizarNomeNutriente('Boro'), 'B');
  assert.equal(normalizarNomeNutriente('Mg'), 'Mg');
  assert.equal(normalizarNomeNutriente('pH em água'), null, 'coluna que não é nutriente devolve null');
  assert.equal(normalizarNomeNutriente('mg/kg'), null, 'coluna que é só unidade não vira Magnésio');
});

t('ÓXIDO: P2O5 vira P com o fator IUPAC, não com o número cru', () => {
  const c = interpretarColuna('P2O5 (g/kg)');
  assert.equal(c.nutriente, 'P');
  assert.ok(Math.abs(c.fator - 0.436427) < 1e-5, `fator ${c.fator}`);
  const k = interpretarColuna('K2O');
  assert.equal(k.nutriente, 'K');
  assert.ok(Math.abs(k.fator - 0.830151) < 1e-5, `fator ${k.fator}`);
});

t('UNIDADE: % vira g/kg (×10) e ppm é mg/kg', () => {
  assert.equal(unidadeDaColuna('N (%)'), '%');
  const n = interpretarColuna('N (%)');
  assert.equal(n.nutriente, 'N');
  assert.ok(Math.abs(4.6 * n.fator - 46) < 1e-9, '4,6% de N = 46 g/kg');
  const b = interpretarColuna('B (ppm)');
  assert.ok(Math.abs(41 * b.fator - 41) < 1e-9, 'ppm = mg/kg, sem conversão');
});

console.log('\nRazões duais — nada de NaN\n');

t('razão devolve null (não NaN) com nutriente ausente ou denominador zero', () => {
  const t1 = normalizarTeores({ N: 46, K: 0 });
  assert.equal(razao(t1, 'N', 'P'), null, 'P não analisado');
  assert.equal(razao(t1, 'N', 'K'), null, 'K = 0 no denominador');
  assert.ok(Math.abs(razao(normalizarTeores(MEDIA), 'N', 'K') - 46 / 18.5) < 1e-12);
});

t('11 nutrientes geram 55 pares e cada nutriente participa de 10', () => {
  const pares = paresDeNutrientes();
  assert.equal(pares.length, 55);
  const conta = pares.filter(p => p.a === 'K' || p.b === 'K').length;
  assert.equal(conta, 10);
});

console.log('\n(e) As quatro funções f\n');

t('as 4 funções devolvem 0 na média da norma', () => {
  const par = { a: 'N', b: 'K', media: 2.0, dp: 0.2, cv: 10, f: 1 };
  for (const fn of ['alvarez-leite', 'beaufils', 'jones', 'elwali-gascho']) {
    assert.equal(funcaoF(2.0, par, fn), 0, `${fn} na média`);
  }
});

t('as 4 funções têm o sinal correto fora da média', () => {
  const par = { a: 'N', b: 'K', media: 2.0, dp: 0.2, cv: 10, f: 1 };
  for (const fn of ['alvarez-leite', 'beaufils', 'jones', 'elwali-gascho']) {
    assert.ok(funcaoF(3.0, par, fn) > 0, `${fn} acima da média deve ser positiva`);
    assert.ok(funcaoF(1.0, par, fn) < 0, `${fn} abaixo da média deve ser negativa`);
  }
});

t('Elwali & Gascho: zona morta de ±1 DP devolve exatamente 0', () => {
  const par = { a: 'N', b: 'K', media: 2.0, dp: 0.2, cv: 10, f: 1 };
  assert.equal(funcaoF(2.15, par, 'elwali-gascho'), 0, 'dentro de ±1 DP');
  assert.ok(funcaoF(2.15, par, 'beaufils') > 0, 'e Beaufils, sem zona morta, já acusa');
  assert.ok(funcaoF(2.5, par, 'elwali-gascho') > 0, 'fora da zona morta volta a acusar');
});

t('Alvarez&Leite é exatamente 10× Jones (só muda o fator C)', () => {
  const par = { a: 'N', b: 'K', media: 2.0, dp: 0.2, cv: 10, f: 1 };
  const al = funcaoF(2.4, par, 'alvarez-leite');
  const j = funcaoF(2.4, par, 'jones');
  assert.ok(Math.abs(al - 10 * j) < 1e-12, `${al} vs ${j}`);
});

t('função f devolve null (não 0) quando a norma tem DP ou CV zero', () => {
  assert.equal(funcaoF(2.4, { a: 'N', b: 'K', media: 2, dp: 0, cv: 10, f: null }, 'alvarez-leite'), null);
  assert.equal(funcaoF(2.4, { a: 'N', b: 'K', media: 2, dp: 0.2, cv: 0, f: null }, 'beaufils'), null);
});

console.log('\n(a) TESTE-OURO — amostra igual à média da norma\n');

t('todos os índices DRIS ≈ 0, IBN ≈ 0 e as 11 classes em "z"', () => {
  const d = calcularDris(normalizarTeores(MEDIA), NORMA, 'alvarez-leite');
  assert.equal(d.nNutrientes, 11);
  for (const i of d.indices) {
    assert.ok(Number.isFinite(i.indice), `${i.nutriente} finito`);
    assert.ok(Math.abs(i.indice) < 1e-9, `${i.nutriente} = ${i.indice}`);
    assert.equal(i.classe, 'z', `${i.nutriente} deveria ser 'z'`);
    assert.equal(i.nPares, 10);
  }
  assert.ok(d.ibn < 1e-8, `IBN = ${d.ibn}`);
  assert.ok(d.ibnm < 1e-8);
});

t('vale para as quatro funções f, não só para a padrão', () => {
  for (const fn of ['alvarez-leite', 'beaufils', 'jones', 'elwali-gascho']) {
    const d = calcularDris(normalizarTeores(MEDIA), NORMA, fn);
    assert.ok(d.ibn < 1e-8, `${fn}: IBN = ${d.ibn}`);
  }
});

t('CND na média da norma: todos os IZ ≈ 0 e r² ≈ 0', () => {
  const c = calcularCnd(normalizarTeores(MEDIA), NORMA);
  assert.equal(c.indices.length, 11);
  for (const i of c.indices) assert.ok(Math.abs(i.iz) < 1e-9, `${i.nutriente} IZ = ${i.iz}`);
  assert.ok(c.r2 < 1e-12);
  assert.ok(c.residuoGkg > 0 && c.residuoGkg < 1000, `resíduo = ${c.residuoGkg}`);
  assert.equal(c.mahalanobis, null, 'sem covariância inversa na norma, D² é null — nunca inventado');
});

console.log('\n(b) Deficiência conhecida — K 30% abaixo da média\n');

const K_BAIXO = { ...MEDIA, K: MEDIA.K * 0.7 };

t('K é o mais limitante no DRIS, com índice negativo e classe p/pz', () => {
  const d = calcularDris(normalizarTeores(K_BAIXO), NORMA, 'alvarez-leite');
  assert.equal(d.ordemLimitacao[0], 'K', `ordem: ${d.ordemLimitacao.join(' < ')}`);
  const k = d.indices.find(i => i.nutriente === 'K');
  assert.ok(k.indice < 0, `índice de K = ${k.indice}`);
  assert.ok(k.classe === 'p' || k.classe === 'pz', `classe de K = ${k.classe}`);
  assert.ok(d.ibn > 1, `IBN = ${d.ibn} deveria denunciar desequilíbrio`);
});

t('o CND aponta K também — se divergisse, seria erro de sinal', () => {
  const c = calcularCnd(normalizarTeores(K_BAIXO), NORMA);
  assert.equal(c.ordemLimitacao[0], 'K', `ordem CND: ${c.ordemLimitacao.join(' < ')}`);
  const k = c.indices.find(i => i.nutriente === 'K');
  assert.ok(k.iz < 0, `IZ de K = ${k.iz}`);
  assert.ok(c.r2 > 0);
});

t('a ordem de limitação sobrevive à troca da função f', () => {
  for (const fn of ['alvarez-leite', 'beaufils', 'jones', 'elwali-gascho']) {
    const d = calcularDris(normalizarTeores(K_BAIXO), NORMA, fn);
    assert.equal(d.ordemLimitacao[0], 'K', `${fn}: ${d.ordemLimitacao.join(' < ')}`);
  }
});

console.log('\n(c) Nutriente ausente sai da conta, sem NaN\n');

t('laudo sem S: índices finitos, S fora da lista, n dos demais cai para 9', () => {
  const semS = { ...MEDIA, S: null };
  const d = calcularDris(normalizarTeores(semS), NORMA, 'alvarez-leite');
  assert.equal(d.nNutrientes, 10, 'S não recebe índice');
  assert.ok(!d.indices.some(i => i.nutriente === 'S'));
  for (const i of d.indices) {
    assert.ok(Number.isFinite(i.indice), `${i.nutriente} = ${i.indice}`);
    assert.equal(i.nPares, 9, `${i.nutriente} perdeu o par com S`);
  }
  assert.ok(Number.isFinite(d.ibn) && d.ibn < 1e-8, 'e continua equilibrado — ausência não virou deficiência');
});

t('ausência NÃO é tratada como zero', () => {
  const semS = normalizarTeores({ ...MEDIA, S: null });
  const comZero = normalizarTeores({ ...MEDIA, S: 0 });
  const a = calcularDris(semS, NORMA, 'alvarez-leite');
  const b = calcularDris(comZero, NORMA, 'alvarez-leite');
  assert.ok(a.ibn < 1e-8, 'sem S: equilibrado');
  // S = 0 também sai da conta (razão inválida), mas por outro caminho: o que
  // não pode acontecer é um dos dois virar deficiência gigante silenciosa.
  assert.ok(Number.isFinite(b.ibn), 'S = 0 não gera NaN');
});

t('laudo com um nutriente só: não explode, devolve o que dá', () => {
  const d = calcularDris(normalizarTeores({ N: 46 }), NORMA, 'alvarez-leite');
  assert.equal(d, null, 'sem par calculável, DRIS é null — não é zero');
});

console.log('\n(d) Sem norma — nada de número inventado\n');

t('diagnosticar sem norma: dris e cnd null com motivo, sem exceção', () => {
  const r = diagnosticar(MEDIA, null);
  assert.equal(r.dris, null);
  assert.equal(r.cnd, null);
  assert.equal(r.drisMotivo, 'sem norma para esta cultura/órgão');
  assert.equal(r.cndMotivo, 'sem norma para esta cultura/órgão');
  assert.equal(r.faixa, null, 'sem faixas na norma, faixa não roda');
  assert.equal(r.chance, null);
  assert.equal(r.norma, null);
  assert.equal(r.consenso.length, 11, 'os 11 continuam na lista, com consenso null');
  assert.ok(r.consenso.every(c => c.consenso === null && c.nMetodos === 0));
  assert.ok(r.avisos.length > 0);
});

t('norma sem pares: DRIS null, mas a faixa ainda roda', () => {
  const soFaixa = { ...NORMA, pares: [], cnd: null, chance: null };
  const r = diagnosticar(MEDIA, soFaixa);
  assert.equal(r.dris, null);
  assert.equal(r.drisMotivo, 'sem norma para esta cultura/órgão');
  assert.ok(r.faixa, 'faixa roda porque a norma tem faixas');
  assert.equal(r.faixa.itens.length, 11);
});

t('entrada inválida não lança', () => {
  assert.doesNotThrow(() => diagnosticar({}, null));
  assert.doesNotThrow(() => diagnosticar({ N: Number.NaN, K: -5 }, NORMA));
  const r = diagnosticar({ N: Number.NaN, K: -5 }, NORMA);
  assert.equal(r.teores.N, null, 'NaN vira null');
  assert.equal(r.teores.K, null, 'negativo vira null');
});

console.log('\n(f) Faixa de suficiência — os três estados\n');

t('classifica deficiente, adequado e excessivo com desvio do limite mais próximo', () => {
  const faixa = { min: 17, max: 20 };
  const d = classificarTeor(13.6, faixa);
  assert.equal(d.estado, 'deficiente');
  assert.ok(Math.abs(d.desvioPct - (-20)) < 1e-9, `desvio ${d.desvioPct}`);
  const a = classificarTeor(18.5, faixa);
  assert.equal(a.estado, 'adequado');
  assert.equal(a.desvioPct, 0);
  const e = classificarTeor(25, faixa);
  assert.equal(e.estado, 'excessivo');
  assert.ok(Math.abs(e.desvioPct - 25) < 1e-9, `desvio ${e.desvioPct}`);
});

t('na amostra inteira: K deficiente, Zn excessivo, o resto adequado', () => {
  const r = classificarPorFaixa(normalizarTeores({ ...MEDIA, K: 13.6, Zn: 40 }), NORMA);
  const por = Object.fromEntries(r.itens.map(i => [i.nutriente, i.estado]));
  assert.equal(por.K, 'deficiente');
  assert.equal(por.Zn, 'excessivo');
  assert.equal(por.N, 'adequado');
  assert.equal(r.itens.length, 11);
});

console.log('\n(g) Consenso multi-método\n');

t('quatro métodos concordando ⇒ concordancia = 1 e nenhum divergente', () => {
  const votos = {
    dris: { K: 'deficiente' }, cnd: { K: 'deficiente' },
    faixa: { K: 'deficiente' }, chance: { K: 'deficiente' },
  };
  const k = consensoMultiMetodo(votos).find(c => c.nutriente === 'K');
  assert.equal(k.nMetodos, 4);
  assert.equal(k.consenso, 'deficiente');
  assert.equal(k.concordancia, 1);
  assert.deepEqual(k.divergentes, []);
});

t('3 × 1 ⇒ concordancia 0,75 e o dissidente é nomeado', () => {
  const votos = {
    dris: { K: 'deficiente' }, cnd: { K: 'deficiente' },
    faixa: { K: 'adequado' }, chance: { K: 'deficiente' },
  };
  const k = consensoMultiMetodo(votos).find(c => c.nutriente === 'K');
  assert.equal(k.concordancia, 0.75);
  assert.deepEqual(k.divergentes, ['faixa']);
});

t('EMPATE 2 × 2 ⇒ consenso null (não se inventa vencedor)', () => {
  const votos = {
    dris: { K: 'deficiente' }, cnd: { K: 'deficiente' },
    faixa: { K: 'adequado' }, chance: { K: 'adequado' },
  };
  const k = consensoMultiMetodo(votos).find(c => c.nutriente === 'K');
  assert.equal(k.consenso, null);
  assert.equal(k.concordancia, 0.5);
  assert.equal(k.divergentes.length, 4);
});

t('diagnose completa com K baixo: os 4 métodos rodam e concordam em K', () => {
  const r = diagnosticar({ ...MEDIA, K: MEDIA.K * 0.7 }, NORMA, {
    orgaoAmostra: 'trifolio-com-peciolo', estadioAmostra: 'R2', produtividadeKgha: 3900,
  });
  assert.ok(r.dris && r.cnd && r.faixa && r.chance, 'os quatro métodos rodaram');
  const k = r.consenso.find(c => c.nutriente === 'K');
  assert.equal(k.nMetodos, 4, `métodos que opinaram sobre K: ${JSON.stringify(k.porMetodo)}`);
  assert.equal(k.consenso, 'deficiente');
  assert.equal(k.concordancia, 1, `divergentes: ${k.divergentes.join(', ')}`);
  assert.equal(r.dris.ordemLimitacao[0], 'K');
  assert.ok(r.avisos.some(a => a.includes('somam aproximadamente zero')), 'limitações do método viajam junto');
});

console.log('\nÍndice de confiança\n');

t('órgão diferente derruba a confiança por TETO, não por peso', () => {
  const iguais = { norma: NORMA, teores: normalizarTeores(MEDIA), orgaoAmostra: 'trifolio-com-peciolo', estadioAmostra: 'R2', produtividadeKgha: 3900 };
  const a = calcularConfianca(iguais);
  const b = calcularConfianca({ ...iguais, orgaoAmostra: 'trifolio-sem-peciolo' });
  assert.ok(a.valor > 60, `mesma folha: ${a.valor}`);
  assert.ok(b.valor <= 35, `folha diferente: ${b.valor}`);
  assert.ok(b.justificativa.includes('intercambiáveis'), 'e a justificativa diz por quê');
});

t('sem norma a confiança é limitada a 25 e o motivo é declarado', () => {
  const c = calcularConfianca({ norma: null, teores: normalizarTeores(MEDIA), produtividadeKgha: 3900 });
  assert.ok(c.valor <= 25, `valor ${c.valor}`);
  assert.ok(c.justificativa.includes('nenhuma norma'));
});

t('n da norma e completude movem o número na direção certa', () => {
  const base = { norma: NORMA, teores: normalizarTeores(MEDIA), orgaoAmostra: 'trifolio-com-peciolo', estadioAmostra: 'R2', produtividadeKgha: 3900 };
  const grande = calcularConfianca({ ...base, norma: { ...NORMA, n: 600 } });
  const pequena = calcularConfianca({ ...base, norma: { ...NORMA, n: 12 } });
  assert.ok(grande.valor > pequena.valor, `${grande.valor} vs ${pequena.valor}`);
  const incompleta = calcularConfianca({ ...base, teores: normalizarTeores({ N: 46, K: 18.5, P: 2.7 }) });
  assert.ok(incompleta.valor < calcularConfianca(base).valor, 'laudo com 3 nutrientes vale menos');
  assert.ok(incompleta.gargalo.id.length > 0);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
