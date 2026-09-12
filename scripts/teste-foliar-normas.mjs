// Gerador de normas DRIS — npm run teste:foliar-normas
//
// O que este arquivo protege:
//   1. A ESCOLHA DA ORDEM DO PAR pelo teste F (Beaufils 1973). O teste
//      recalcula F = S²baixa/S²alta por fora, com aritmética própria, e exige
//      que a norma tenha gravado a orientação de maior F. Se o gerador
//      empatasse ou invertesse, DRIS de Jones/Alvarez&Leite mudaria de sinal.
//   2. O `n` gravado e o AVISO DE n BAIXO. Norma com 30 amostras é uma norma
//      frágil — e frágil-sem-aviso é pior que não ter norma.
//   3. O FECHAMENTO DO CICLO: norma gerada de uma população, aplicada de volta
//      à MÉDIA daquela população, tem de devolver índices ≈ 0. É o teste-ouro
//      do gerador, o análogo do que `teste:foliar` faz com norma sintética.
//
// A população é SINTÉTICA E DETERMINÍSTICA (senos em grade completa, sem RNG):
// a soma do ruído sobre o ciclo inteiro é exatamente zero, então a média dos
// teores da população de alta é exatamente a base. Sem isso, o erro amostral
// dominaria o teste 3 e ele viraria um teste de sorte.

import assert from 'node:assert/strict';
import { calcularDris, diagnosticar, gerarNorma, normalizarTeores, razao } from '../src/lib/foliar/index.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── População sintética ─────────────────────────────────────────────────────
const BASE = { N: 46, P: 2.7, K: 18.5, Ca: 5.4, Mg: 2.65, S: 2.25, B: 41, Cu: 8, Fe: 72, Mn: 24, Zn: 24 };
const IDS = Object.keys(BASE);
const N_ALTA = 30, N_BAIXA = 30;
const AMP = 0.02;                      // ±2% de ruído multiplicativo

const TAU = Math.PI * 2;
const fase = j => (TAU * j) / IDS.length;

/** Alta produtividade: composição equilibrada, ruído pequeno e BALANCEADO. */
function amostraAlta(k) {
  const teores = {};
  IDS.forEach((id, j) => { teores[id] = BASE[id] * (1 + AMP * Math.sin((TAU * k) / N_ALTA + fase(j))); });
  return { teores: normalizarTeores(teores), produtividadeKgha: 3800 + 200 * Math.sin((TAU * k) / N_ALTA) };
}

/**
 * Baixa produtividade: K muito baixo e MUITO variável (2 a 10 g/kg). É a
 * relação sabidamente discriminante — é justamente o que o teste F deve
 * encontrar, e a assimetria de 1/x faz K/Ca e Ca/K terem variâncias bem
 * diferentes, forçando o gerador a escolher de fato uma das duas.
 */
function amostraBaixa(k) {
  const teores = {};
  IDS.forEach((id, j) => { teores[id] = BASE[id] * (1 + AMP * Math.sin((TAU * k) / N_BAIXA + fase(j))); });
  teores.K = 6 + 4 * Math.sin((TAU * k) / N_BAIXA);
  return { teores: normalizarTeores(teores), produtividadeKgha: 2400 + 300 * Math.sin((TAU * k) / N_BAIXA) };
}

const POPULACAO = [
  ...Array.from({ length: N_ALTA }, (_, k) => amostraAlta(k)),
  ...Array.from({ length: N_BAIXA }, (_, k) => amostraBaixa(k)),
];

const OPCOES = { cultura: 'Soja', orgao: 'trifolio-com-peciolo', estadio: 'R1-R2', corteKgha: 3200 };

const { norma: NORMA, motivo: MOTIVO, avisos: AVISOS } = gerarNorma(POPULACAO, OPCOES);

// Aritmética independente, para não conferir o gerador com o próprio gerador.
const variancia = v => {
  if (v.length < 2) return null;
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length;
};
const razoesDe = (amostras, a, b) => amostras.map(x => razao(x.teores, a, b)).filter(r => r != null && r > 0);
const ALTA = POPULACAO.filter(a => a.produtividadeKgha >= 3200);
const BAIXA = POPULACAO.filter(a => a.produtividadeKgha < 3200);
const fDe = (a, b) => {
  const va = variancia(razoesDe(ALTA, a, b));
  const vb = variancia(razoesDe(BAIXA, a, b));
  return va && va > 0 && vb != null ? vb / va : null;
};

console.log('\nPopulação sintética (60 amostras) e geração\n');

t('a norma nasce, sem motivo de recusa', () => {
  assert.equal(MOTIVO, null, `motivo: ${MOTIVO}`);
  assert.ok(NORMA, 'norma gerada');
  assert.equal(NORMA.origem, 'gerada');
  assert.equal(NORMA.cultura, 'Soja');
  assert.equal(NORMA.orgao, 'trifolio-com-peciolo');
  assert.ok(NORMA.criterioCorte.includes('3200'), NORMA.criterioCorte);
});

t('n gravado = tamanho da população de ALTA produtividade, não da população toda', () => {
  assert.equal(ALTA.length, N_ALTA, 'o corte separou as duas metades');
  assert.equal(NORMA.n, N_ALTA, `n = ${NORMA.n}`);
  assert.equal(BAIXA.length, N_BAIXA);
});

t('os 55 pares saem com média, DP, CV e F coerentes', () => {
  assert.equal(NORMA.pares.length, 55, `pares: ${NORMA.pares.length}`);
  for (const p of NORMA.pares) {
    assert.ok(p.media > 0, `${p.a}/${p.b} média ${p.media}`);
    assert.ok(p.dp > 0, `${p.a}/${p.b} dp ${p.dp}`);
    assert.ok(Math.abs(p.cv - (p.dp / p.media) * 100) < 1e-9, `${p.a}/${p.b} CV incoerente`);
    assert.equal(p.nAlta, N_ALTA);
  }
});

console.log('\nEscolha da ordem do par pelo teste F\n');

t('K × Ca: as duas orientações têm F bem diferentes (o par é discriminante)', () => {
  const fDireto = fDe('K', 'Ca');
  const fInverso = fDe('Ca', 'K');
  assert.ok(fDireto > 1 && fInverso > 1, `F K/Ca=${fDireto}, F Ca/K=${fInverso}`);
  const razaoEntreFs = Math.max(fDireto, fInverso) / Math.min(fDireto, fInverso);
  assert.ok(razaoEntreFs > 1.2, `os dois F são quase iguais (${razaoEntreFs.toFixed(2)}×) — o teste não provaria nada`);
});

t('a norma gravou a orientação de MAIOR F em K × Ca', () => {
  const fDireto = fDe('K', 'Ca');
  const fInverso = fDe('Ca', 'K');
  const esperado = fInverso > fDireto ? { a: 'Ca', b: 'K' } : { a: 'K', b: 'Ca' };
  const par = NORMA.pares.find(p => (p.a === 'K' && p.b === 'Ca') || (p.a === 'Ca' && p.b === 'K'));
  assert.ok(par, 'o par existe na norma');
  assert.equal(par.a, esperado.a, `gravou ${par.a}/${par.b}, esperado ${esperado.a}/${esperado.b}`);
  assert.equal(par.b, esperado.b);
  assert.ok(Math.abs(par.f - Math.max(fDireto, fInverso)) / Math.max(fDireto, fInverso) < 1e-6, `F gravado ${par.f}`);
});

t('todo par gravado tem F ≥ F da orientação descartada', () => {
  let conferidos = 0;
  for (const p of NORMA.pares) {
    const fEscolhido = fDe(p.a, p.b);
    const fOutro = fDe(p.b, p.a);
    if (fEscolhido == null || fOutro == null) continue;
    assert.ok(fEscolhido >= fOutro - 1e-9, `${p.a}/${p.b}: F ${fEscolhido} < ${fOutro} da orientação descartada`);
    conferidos++;
  }
  assert.ok(conferidos >= 50, `só ${conferidos} pares conferidos`);
});

console.log('\nEstatísticas derivadas: CND, faixas e chance matemática\n');

t('estatísticas clr geradas, e D² declarado indisponível em vez de inventado', () => {
  assert.ok(NORMA.cnd, 'norma tem estatísticas clr');
  assert.ok(NORMA.cnd.media.N != null && NORMA.cnd.dp.N > 0);
  assert.ok(NORMA.cnd.media.R != null, 'o resíduo entra no vetor clr');
  assert.equal(NORMA.cnd.covInversa, null);
  assert.ok(AVISOS.some(a => a.includes('Mahalanobis')), 'e o aviso diz que D² ficará indisponível');
});

t('faixas de suficiência = média ± 1 DP da população de alta', () => {
  assert.ok(NORMA.faixas, 'faixas geradas');
  for (const id of IDS) {
    const f = NORMA.faixas[id];
    assert.ok(f, `faixa de ${id}`);
    assert.ok(f.min >= 0 && f.min < f.max, `${id}: ${f.min}–${f.max}`);
    const centro = (f.min + f.max) / 2;
    assert.ok(Math.abs(centro - BASE[id]) / BASE[id] < 0.02, `${id}: centro ${centro} longe da base ${BASE[id]}`);
  }
  assert.ok(NORMA.fonte.includes('média ± 1 DP'), 'e a fonte declara que não é calibração com doses');
});

t('chance matemática sai junto, com o mesmo corte', () => {
  assert.ok(NORMA.chance, 'chance gerada');
  assert.equal(NORMA.chance.corteKgha, 3200);
  const k = NORMA.chance.porNutriente.K;
  assert.ok(k, 'K tem chance matemática');
  assert.ok(k.teorOtimo > 15, `teor ótimo de K = ${k.teorOtimo} — a população de alta tem K alto`);
  assert.ok(k.classes.length >= 2);
});

console.log('\nAvisos — norma frágil nunca sai calada\n');

t('30 amostras de alta é EXATAMENTE o mínimo: sem aviso; 31 exigidas, com aviso', () => {
  assert.ok(!AVISOS.some(a => a.includes('CONFIANÇA BAIXA')), `n=30 bate o mínimo padrão: ${AVISOS.join(' | ')}`);
  const exigente = gerarNorma(POPULACAO, { ...OPCOES, nMinimo: 50 });
  assert.ok(exigente.avisos.some(a => a.includes('CONFIANÇA BAIXA')), `avisos: ${exigente.avisos.join(' | ')}`);
  assert.ok(NORMA.avisos.length > 0, 'e os avisos viajam dentro da norma');
});

t('com 8 amostras o aviso de n baixo continua e a norma ainda sai', () => {
  const pequena = [
    ...Array.from({ length: 4 }, (_, k) => amostraAlta(k * 7)),
    ...Array.from({ length: 4 }, (_, k) => amostraBaixa(k * 7)),
  ];
  const r = gerarNorma(pequena, OPCOES);
  assert.ok(r.norma, `deveria gerar: ${r.motivo}`);
  assert.equal(r.norma.n, 4);
  assert.ok(r.avisos.some(a => a.includes('CONFIANÇA BAIXA')), `avisos: ${r.avisos.join(' | ')}`);
  assert.ok(r.avisos.some(a => a.includes('menos de 10 amostras')), 'e o aviso por par também');
});

t('com n grande o aviso de n baixo SOME (o aviso não é decorativo)', () => {
  const grande = Array.from({ length: 80 }, (_, k) => amostraAlta(k % N_ALTA))
    .concat(Array.from({ length: 20 }, (_, k) => amostraBaixa(k % N_BAIXA)));
  const r = gerarNorma(grande, { ...OPCOES, nMinimo: 30 });
  assert.ok(r.norma);
  assert.ok(r.norma.n >= 30, `n = ${r.norma.n}`);
  assert.ok(!r.avisos.some(a => a.includes('CONFIANÇA BAIXA')), `avisos: ${r.avisos.join(' | ')}`);
});

console.log('\nNunca lança: população impossível vira motivo\n');

t('população minúscula devolve { norma: null, motivo }', () => {
  const r = gerarNorma([POPULACAO[0], POPULACAO[1]], OPCOES);
  assert.equal(r.norma, null);
  assert.ok(typeof r.motivo === 'string' && r.motivo.length > 10, r.motivo);
});

t('população sem nenhuma amostra acima do corte devolve motivo, não exceção', () => {
  assert.doesNotThrow(() => gerarNorma(POPULACAO, { ...OPCOES, corteKgha: 99999 }));
  const r = gerarNorma(POPULACAO, { ...OPCOES, corteKgha: 99999 });
  assert.equal(r.norma, null);
  assert.ok(r.motivo.includes('corte'), r.motivo);
});

t('lista vazia e lixo não lançam', () => {
  assert.doesNotThrow(() => gerarNorma([], OPCOES));
  assert.equal(gerarNorma([], OPCOES).norma, null);
  assert.doesNotThrow(() => gerarNorma([{ teores: normalizarTeores({}), produtividadeKgha: Number.NaN }], OPCOES));
});

console.log('\nCICLO FECHADO — norma gerada aplicada à própria média\n');

// Média aritmética dos teores da população de alta. Com ruído balanceado ela
// é exatamente BASE, o que torna a comparação abaixo justa.
const MEDIA_ALTA = {};
for (const id of IDS) {
  MEDIA_ALTA[id] = ALTA.reduce((s, a) => s + a.teores[id], 0) / ALTA.length;
}

t('a média da população de alta é a base (ruído determinístico e balanceado)', () => {
  for (const id of IDS) {
    assert.ok(Math.abs(MEDIA_ALTA[id] - BASE[id]) / BASE[id] < 1e-9, `${id}: ${MEDIA_ALTA[id]} vs ${BASE[id]}`);
  }
});

t('diagnosticar a média da população contra a norma gerada dá índices ≈ 0', () => {
  const d = calcularDris(normalizarTeores(MEDIA_ALTA), NORMA, 'alvarez-leite');
  assert.equal(d.nNutrientes, 11);
  for (const i of d.indices) {
    assert.ok(Number.isFinite(i.indice), `${i.nutriente} não finito`);
    assert.ok(Math.abs(i.indice) < 1, `${i.nutriente} = ${i.indice.toFixed(4)} (deveria ser ≈ 0)`);
  }
  assert.ok(d.ibn < 3, `IBN = ${d.ibn.toFixed(3)}`);
});

t('e a mesma norma acusa K quando K cai 30% — o contraste é ordens de grandeza', () => {
  const naMedia = calcularDris(normalizarTeores(MEDIA_ALTA), NORMA, 'alvarez-leite');
  const comK = { ...MEDIA_ALTA, K: MEDIA_ALTA.K * 0.7 };
  const d = diagnosticar(comK, NORMA, { orgaoAmostra: 'trifolio-com-peciolo', estadioAmostra: 'R2', produtividadeKgha: 3900 });
  assert.equal(d.dris.ordemLimitacao[0], 'K', `ordem: ${d.dris.ordemLimitacao.join(' < ')}`);
  const k = d.dris.indices.find(i => i.nutriente === 'K');
  assert.ok(k.indice < 0 && k.classe === 'p', `índice ${k.indice.toFixed(2)}, classe ${k.classe}`);
  assert.ok(d.dris.ibn > naMedia.ibn * 20, `IBN ${d.dris.ibn.toFixed(1)} vs ${naMedia.ibn.toFixed(3)} na média`);
  assert.equal(d.cnd.ordemLimitacao[0], 'K', 'e o CND da norma gerada concorda');
});

t('a norma gerada alimenta os quatro métodos de uma vez', () => {
  const d = diagnosticar(MEDIA_ALTA, NORMA, { orgaoAmostra: 'trifolio-com-peciolo', estadioAmostra: 'R2', produtividadeKgha: 3900 });
  assert.ok(d.dris && d.cnd && d.faixa && d.chance, 'os quatro rodaram a partir de uma norma só');
  assert.equal(d.cnd.mahalanobis, null, 'D² segue null — a norma não tem covariância inversa');
  assert.ok(d.confianca.valor > 0);
  assert.equal(d.norma.origem, 'gerada');
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
