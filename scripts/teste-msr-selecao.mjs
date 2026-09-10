// Seleção de cenas de satélite — roda: npm run teste:msr
//
// O que este arquivo protege:
//   1. Cada uma das 4 regras reprovando SOZINHA, com o motivo certo — o motivo
//      vai para a tela e para o log do robô; motivo errado manda o usuário
//      mexer no limiar errado.
//   2. O limiar batido EXATAMENTE passa ("mínimo 70%" inclui 70%). Errar a
//      borda muda silenciosamente quantas cenas entram no banco.
//   3. A ordem das checagens (do mais barato ao mais caro) — é ela que impede o
//      robô noturno de baixar banda de cena que já reprovou na nuvem.
//   4. melhoresPorJanela nunca devolve duas cenas do mesmo balde, e devolve o
//      MESMO resultado para a mesma entrada em qualquer ordem.
//
// Os vetores daqui são os mesmos que backend/agenda.py precisa reproduzir: a
// regra vive duplicada em TS e Python (o backend não importa TypeScript).

import assert from 'node:assert/strict';
import {
  avaliarRegras, melhoresPorJanela, diasEntre, estimativaMbPorCena,
  REGRAS_PADRAO, TEXTO_MOTIVO,
} from '../src/lib/msrSelecao.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Cena que passa em tudo — cada teste estraga UM campo.
const boa = (extra = {}) => ({
  id: 'S2A_boa', data: '2026-03-10', fonte: 'sentinel',
  nuvem: 5, pctLimpo: 92, ndviMedio: 0.71, ...extra,
});
const R = REGRAS_PADRAO;

console.log('\ndiasEntre');

t('conta dias inteiros e é simétrico no sinal', () => {
  assert.equal(diasEntre('2026-03-01', '2026-03-06'), 5);
  assert.equal(diasEntre('2026-03-06', '2026-03-01'), -5);
  assert.equal(diasEntre('2026-03-01', '2026-03-01'), 0);
});

t('atravessa virada de ano e ano bissexto', () => {
  assert.equal(diasEntre('2025-12-31', '2026-01-01'), 1);
  assert.equal(diasEntre('2024-02-28', '2024-03-01'), 2);   // 2024 é bissexto
});

t('não escorrega no horário de verão (conta em UTC)', () => {
  assert.equal(diasEntre('2026-10-15', '2026-10-20'), 5);
  assert.equal(diasEntre('2026-02-10', '2026-02-25'), 15);
});

console.log('\navaliarRegras — as 4 regras, uma a uma');

t('cena boa passa', () => {
  assert.deepEqual(avaliarRegras(boa(), R), { aceita: true, motivo: 'ok' });
});

t('regra 1: nuvem da cena acima do limite', () => {
  const v = avaliarRegras(boa({ nuvem: 40 }), R);
  assert.equal(v.aceita, false);
  assert.equal(v.motivo, 'nuvem_cena');
});

t('regra 2: talhão encoberto', () => {
  const v = avaliarRegras(boa({ pctLimpo: 41 }), R);
  assert.equal(v.aceita, false);
  assert.equal(v.motivo, 'pct_limpo');
});

t('regra 3: vigor abaixo do mínimo (solo nu / pós-colheita)', () => {
  const v = avaliarRegras(boa({ ndviMedio: 0.08 }), R);
  assert.equal(v.aceita, false);
  assert.equal(v.motivo, 'ndvi_min');
});

t('regra 4: colada na cena anterior já guardada', () => {
  const v = avaliarRegras(boa({ data: '2026-03-10' }), R, '2026-03-07');  // 3 dias
  assert.equal(v.aceita, false);
  assert.equal(v.motivo, 'intervalo');
});

t('regra 4 não se aplica quando não há cena anterior', () => {
  assert.equal(avaliarRegras(boa(), R, null).aceita, true);
  assert.equal(avaliarRegras(boa(), R, undefined).aceita, true);
});

console.log('\navaliarRegras — bordas exatas');

t('pctLimpo exatamente no limiar PASSA', () => {
  assert.equal(avaliarRegras(boa({ pctLimpo: R.pctLimpoMin }), R).aceita, true);
  assert.equal(avaliarRegras(boa({ pctLimpo: R.pctLimpoMin - 0.1 }), R).motivo, 'pct_limpo');
});

t('ndviMedio exatamente no limiar PASSA', () => {
  assert.equal(avaliarRegras(boa({ ndviMedio: R.ndviMin }), R).aceita, true);
  assert.equal(avaliarRegras(boa({ ndviMedio: R.ndviMin - 0.001 }), R).motivo, 'ndvi_min');
});

t('nuvem exatamente no limiar PASSA', () => {
  assert.equal(avaliarRegras(boa({ nuvem: R.nuvemMaxCena }), R).aceita, true);
  assert.equal(avaliarRegras(boa({ nuvem: R.nuvemMaxCena + 0.1 }), R).motivo, 'nuvem_cena');
});

t('intervalo exatamente no limiar PASSA', () => {
  const antes = '2026-03-05';                                   // 5 dias antes
  assert.equal(avaliarRegras(boa({ data: '2026-03-10' }), R, antes).aceita, true);
  assert.equal(avaliarRegras(boa({ data: '2026-03-09' }), R, antes).motivo, 'intervalo');
});

console.log('\navaliarRegras — cena não avaliada e sensor sem máscara');

t('sem pctLimpo → sem_avaliacao (nunca "aceita por omissão")', () => {
  assert.deepEqual(avaliarRegras(boa({ pctLimpo: null }), R),
    { aceita: false, motivo: 'sem_avaliacao' });
});

t('sem ndviMedio → sem_avaliacao', () => {
  assert.deepEqual(avaliarRegras(boa({ ndviMedio: null }), R),
    { aceita: false, motivo: 'sem_avaliacao' });
});

t('CBERS (sem máscara de nuvem) é recusado por padrão', () => {
  const c = boa({ fonte: 'cbers', semMascara: true, nuvem: null });
  assert.equal(avaliarRegras(c, R).motivo, 'sem_mascara');
  assert.equal(avaliarRegras(c, R, null, true).aceita, true);   // só se o usuário insistir
});

t('nuvem nula não reprova (o CBERS não informa)', () => {
  assert.equal(avaliarRegras(boa({ nuvem: null }), R).aceita, true);
});

console.log('\navaliarRegras — ordem das checagens (o que segura o custo do robô)');

t('nuvem alta reprova ANTES de exigir avaliação — não baixa banda à toa', () => {
  const v = avaliarRegras(boa({ nuvem: 90, pctLimpo: null, ndviMedio: null }), R);
  assert.equal(v.motivo, 'nuvem_cena', 'a checagem barata tem que vir primeiro');
});

t('talhão encoberto reprova ANTES da regra de vigor', () => {
  const v = avaliarRegras(boa({ pctLimpo: 10, ndviMedio: 0.01 }), R);
  assert.equal(v.motivo, 'pct_limpo');
});

t('todo motivo tem texto em pt-BR para a tela e o log', () => {
  for (const m of ['ok', 'sem_mascara', 'nuvem_cena', 'pct_limpo', 'ndvi_min', 'intervalo', 'sem_avaliacao']) {
    assert.ok(TEXTO_MOTIVO[m] && TEXTO_MOTIVO[m].length > 3, `motivo sem texto: ${m}`);
  }
});

console.log('\nmelhoresPorJanela');

const cena = (id, data, pctLimpo, ndviMedio = 0.5, nuvem = 5) =>
  ({ id, data, fonte: 'sentinel', nuvem, pctLimpo, ndviMedio });

t('duas boas no mesmo balde → sai a de mais talhão limpo', () => {
  const cs = [cena('a', '2026-03-01', 80), cena('b', '2026-03-04', 95)];
  assert.deepEqual(melhoresPorJanela(cs, 15, R), ['b']);
});

t('uma por balde: 3 baldes de 15 dias → 3 cenas', () => {
  const cs = [
    cena('a1', '2026-03-01', 80), cena('a2', '2026-03-05', 90),
    cena('b1', '2026-03-20', 85),
    cena('c1', '2026-04-10', 99),
  ];
  assert.deepEqual(melhoresPorJanela(cs, 15, R), ['a2', 'b1', 'c1']);
});

t('empate em pctLimpo → desempata pelo maior vigor', () => {
  const cs = [cena('a', '2026-03-01', 90, 0.30), cena('b', '2026-03-03', 90, 0.80)];
  assert.deepEqual(melhoresPorJanela(cs, 30, R), ['b']);
});

t('empate em pctLimpo e vigor → desempata pela menor nuvem de cena', () => {
  const cs = [cena('a', '2026-03-01', 90, 0.5, 18), cena('b', '2026-03-03', 90, 0.5, 2)];
  assert.deepEqual(melhoresPorJanela(cs, 30, R), ['b']);
});

t('balde só com cenas reprovadas devolve nada daquele balde', () => {
  const cs = [
    cena('ruim1', '2026-03-01', 20), cena('ruim2', '2026-03-05', 30),
    cena('boa', '2026-04-10', 95),
  ];
  assert.deepEqual(melhoresPorJanela(cs, 15, R), ['boa']);
});

t('nenhuma cena apta → lista vazia (não estoura)', () => {
  assert.deepEqual(melhoresPorJanela([cena('x', '2026-03-01', 10)], 15, R), []);
  assert.deepEqual(melhoresPorJanela([], 15, R), []);
});

t('cena única', () => {
  assert.deepEqual(melhoresPorJanela([cena('u', '2026-03-01', 95)], 15, R), ['u']);
});

t('fronteira exata do balde: dia 15 com janela 15 já é o balde seguinte', () => {
  const cs = [cena('a', '2026-03-01', 80), cena('b', '2026-03-16', 70)];
  assert.deepEqual(melhoresPorJanela(cs, 15, R), ['a', 'b']);
  const cs2 = [cena('a', '2026-03-01', 80), cena('b', '2026-03-15', 70)];
  assert.deepEqual(melhoresPorJanela(cs2, 15, R), ['a']);   // dia 14 → mesmo balde
});

t('não avaliadas são ignoradas (não podem virar "melhor")', () => {
  const cs = [
    { id: 'nova', data: '2026-03-02', fonte: 'sentinel', nuvem: 1, pctLimpo: null, ndviMedio: null },
    cena('avaliada', '2026-03-04', 75),
  ];
  assert.deepEqual(melhoresPorJanela(cs, 15, R), ['avaliada']);
});

t('resultado independe da ordem da entrada', () => {
  const cs = [
    cena('a1', '2026-03-01', 80), cena('a2', '2026-03-05', 90),
    cena('b1', '2026-03-20', 85), cena('c1', '2026-04-10', 99),
  ];
  const esperado = melhoresPorJanela(cs, 15, R);
  for (const perm of [[...cs].reverse(), [cs[2], cs[0], cs[3], cs[1]], [cs[3], cs[1], cs[2], cs[0]]]) {
    assert.deepEqual(melhoresPorJanela(perm, 15, R), esperado);
  }
});

t('janela 0 ou negativa não trava nem divide por zero', () => {
  const cs = [cena('a', '2026-03-01', 80), cena('b', '2026-03-02', 90)];
  assert.deepEqual(melhoresPorJanela(cs, 0, R), ['a', 'b']);
  assert.deepEqual(melhoresPorJanela(cs, -5, R), ['a', 'b']);
});

t('CBERS fora por padrão, dentro se o usuário aceitar', () => {
  const cs = [{ id: 'cb', data: '2026-03-01', fonte: 'cbers', nuvem: null, pctLimpo: 95, ndviMedio: 0.6, semMascara: true }];
  assert.deepEqual(melhoresPorJanela(cs, 15, R), []);
  assert.deepEqual(melhoresPorJanela(cs, 15, R, true), ['cb']);
});

t('regras mais frouxas deixam passar o que as padrão barravam', () => {
  const cs = [cena('meia', '2026-03-01', 45, 0.20)];
  assert.deepEqual(melhoresPorJanela(cs, 15, R), []);
  assert.deepEqual(melhoresPorJanela(cs, 15, { ...R, pctLimpoMin: 40 }), ['meia']);
});

console.log('\nestimativaMbPorCena');

t('cresce com a grade e com o nº de índices', () => {
  const um = estimativaMbPorCena(800, 800, 1);
  assert.ok(um > 1 && um < 2, `esperado ~1,4 MB no pior caso; veio ${um}`);
  assert.ok(Math.abs(estimativaMbPorCena(800, 800, 3) - um * 3) < 1e-9);
  assert.ok(estimativaMbPorCena(400, 400, 1) < um);
});

t('grade vazia não vira NaN nem negativo', () => {
  assert.equal(estimativaMbPorCena(0, 0, 1), 0);
  assert.equal(estimativaMbPorCena(-10, 10, 1), 0);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
