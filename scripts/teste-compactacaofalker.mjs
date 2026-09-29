// Leitor do arquivo da Falker (penetrômetro) — roda: npm run teste:compactacaofalker
//
// O que este arquivo protege:
//   1. Detecção do layout (cabeçalho na 3ª linha, colunas 1…N cm) sem
//      confundir com uma planilha comum de pontos.
//   2. Camada de 10 cm = MÁXIMO das leituras > 0 da faixa; zero é "sem
//      contato" e não entra; camada sem leitura fica AUSENTE (não vira 0).
//   3. kPa ÷ 1000 → MPa (a legenda oficial é em MPa).
//   4. Linha "Média" e linhas sem coordenada ignoradas.
//   5. Medições a < 3 m viram UM ponto com a MÉDIA por camada.
//   6. Nome = célula depois de "Pasta:"; data = coluna Data (dd/mm/aaaa → ISO).

import assert from 'node:assert/strict';
import {
  detectarFalker, lerFalker, numeroFalker, dataFalkerISO, distanciaM, estatisticaCamada, casarComGrade,
} from '../src/lib/compactacaoFalker.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── fixture sintética no layout Falker ───────────────────────────────────────
// 30 cm de profundidade (3 camadas), valores em kPa, TUDO como string (é o que
// lerArquivo devolve), com vírgula decimal em um deles.
const CAB = [' ', 'Medição', 'Hora', 'Data', 'Profundidade Máxima (cm)', 'Excesso de velocidade',
  'Medição completa', 'Tipo de Cone', 'Resolução (cm)', 'Latitude', 'Longitude',
  'RP Máxima (kPa)', 'Prof. da RP Máxima (cm)', 'Aquisições (kPa)',
  ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const linha = (med, data, completa, lat, lng, leituras) =>
  [' ', String(med), '10:00:00', data, '30', 'Não', completa, '2', '1', lat, lng, '0', '0', ' ',
    ...leituras.map(v => (v === '' ? '' : String(v)))];

// Ponto 1: 0-10 tem zeros no início e máx 900; 10-20 máx 2000; 20-30 máx 3500.
const L1 = [0, 0, 0, 500, 900, 800, 700, 600, 650, 700,
  1000, 1200, 2000, 1800, 1500, 1500, 1500, 1500, 1500, 1500,
  2500, 3000, 3500, 3400, 3300, 3200, 3100, 3000, 2900, '2800,5'];
// Ponto 2 (duplicado de 3, a ~1 m): 0-10 máx 1000; 10-20 máx 2000; 20-30 máx 3000.
const L2 = [100, 1000, 900, 800, 700, 600, 500, 400, 300, 200,
  2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100,
  3000, 2900, 2800, 2700, 2600, 2500, 2400, 2300, 2200, 2100];
// Ponto 3 (a ~1 m do 2): 0-10 máx 2000; 10-20 máx 4000; 20-30 tudo 0 (ausente).
const L3 = [2000, 1000, 900, 800, 700, 600, 500, 400, 300, 200,
  4000, 1900, 1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// Ponto 4: incompleto — só até 12 cm (camada 20-30 sem leitura, vazia).
const L4 = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200,
  1300, 1400, '', '', '', '', '', '', '', '',
  '', '', '', '', '', '', '', '', '', ''];
// Ponto 5: tudo zero → descartado.
const L5 = Array.from({ length: 30 }, () => 0);

const AOA = [
  ['﻿Pasta:', 'BV-5       ', '', ''],
  ['Medição de Referência:', '0'],
  CAB,
  linha(1, '01/05/2026', 'Sim', '-25.21312', '-49.968513', L1),
  linha(2, '01/05/2026', 'Sim', '-25.200000', '-49.950000', L2),
  linha(3, '01/05/2026', 'Sim', '-25.200009', '-49.950000', L3), // ~1 m ao sul do 2
  linha(4, '02/05/2026', 'Não', '-25.230000', '-49.970000', L4),
  linha(5, '01/05/2026', 'Sim', '-25.240000', '-49.980000', L5),
  linha(6, '01/05/2026', 'Sim', '', '', L1),                    // sem coordenada
  [' ', 'Média', '10:27:26', '01/05/2026', '30', 'Não', 'Sim', '2', '1', '-25.21', '-49.96', '0', '0', ' ',
    ...Array.from({ length: 30 }, () => '999')],
];

console.log('\nutilitários');
t('numeroFalker aceita número, string e vírgula', () => {
  assert.equal(numeroFalker(1), 1);
  assert.equal(numeroFalker('1'), 1);
  assert.equal(numeroFalker('1,5'), 1.5);
  assert.equal(numeroFalker('1.234,5'), 1234.5);
  assert.equal(numeroFalker(''), null);
  assert.equal(numeroFalker('abc'), null);
});
t('dataFalkerISO converte dd/mm/aaaa', () => {
  assert.equal(dataFalkerISO('01/05/2026'), '2026-05-01');
  assert.equal(dataFalkerISO('2026-05-01'), '2026-05-01');
  assert.equal(dataFalkerISO('xx'), undefined);
});
t('distanciaM: 0,000009° de latitude ≈ 1 m', () => {
  const d = distanciaM({ lng: -49.95, lat: -25.2 }, { lng: -49.95, lat: -25.200009 });
  assert.ok(d > 0.9 && d < 1.1, `d=${d}`);
});

console.log('\ndetecção');
t('reconhece o layout Falker (cabeçalho na 3ª linha)', () => {
  const lay = detectarFalker(AOA);
  assert.ok(lay);
  assert.equal(lay.linhaCabecalho, 2);
  assert.equal(lay.colunasCm.length, 30);
  assert.equal(lay.colunasCm[0].cm, 1);
});
t('planilha comum de pontos NÃO é Falker', () => {
  assert.equal(detectarFalker([['lat', 'lng', '0-20', '20-40'], ['-25', '-49', '1.2', '2.1']]), null);
});
t('lerFalker em arquivo que não é Falker lança erro', () => {
  assert.throws(() => lerFalker([['a', 'b'], ['1', '2']]));
});

console.log('\nleitura');
const R = lerFalker(AOA);
const porMed = m => R.pontos.find(p => p.medicao === m);

t('nome da Pasta com trim e data de referência ISO', () => {
  assert.equal(R.nome, 'BV-5');
  assert.equal(R.dataReferencia, '2026-05-01');
});
t('camadas 0-10, 10-20, 20-30', () => {
  assert.deepEqual(R.profundidades, ['0-10', '10-20', '20-30']);
});
t('máximo por camada, zeros ignorados, kPa ÷ 1000', () => {
  const p1 = porMed('1');
  assert.equal(p1.valores['0-10'], 0.9);
  assert.equal(p1.valores['10-20'], 2);
  assert.equal(p1.valores['20-30'], 3.5);
});
t('ponto duplicado (< 3 m) vira um só, com média por camada', () => {
  const g = porMed('2+3');
  assert.ok(g, 'grupo 2+3 existe');
  assert.equal(g.agrupados, 2);
  assert.equal(g.valores['0-10'], 1.5);   // (1,0 + 2,0) / 2
  assert.equal(g.valores['10-20'], 3);    // (2,0 + 4,0) / 2
  assert.equal(g.valores['20-30'], 3);    // só o 2 tem leitura (o 3 é todo zero)
  assert.ok(Math.abs(g.lat - -25.2000045) < 1e-7, 'centro do grupo');
});
t('camada funda sem leitura fica ausente (não vira zero)', () => {
  const p4 = porMed('4');
  assert.equal(p4.valores['0-10'], 1.2);
  assert.equal(p4.valores['10-20'], 1.4);
  assert.ok(!('20-30' in p4.valores));
  assert.equal(p4.completa, false);
  assert.equal(p4.data, '2026-05-02');
});
t('linha "Média", sem coordenada e toda zero ficam de fora', () => {
  assert.equal(R.pontos.length, 3);
  assert.ok(!R.pontos.some(p => p.valores['0-10'] === 0.999));
});
t('resumo', () => {
  assert.deepEqual(R.resumo, { nPontos: 3, nLidos: 4, agrupados: 1, incompletos: 1, descartados: 1, camadas: 3 });
});
t('passo 5 cm e agregação por média', () => {
  const r = lerFalker(AOA, { passoCm: 5, agregacao: 'media' });
  assert.equal(r.profundidades.length, 6);
  assert.equal(porMedDe(r, '1').valores['0-5'], 0.7);     // (500+900)/2 ÷ 1000
});
function porMedDe(r, m) { return r.pontos.find(p => p.medicao === m); }
t('unidade de origem MPa não divide', () => {
  const r = lerFalker(AOA, { unidadeOrigem: 'MPa' });
  assert.equal(porMedDe(r, '1').valores['0-10'], 900);
});

console.log('\nestatística da camada');
t('média/mín/máx/n só dos pontos com leitura', () => {
  const e = estatisticaCamada(R.pontos, '20-30');
  assert.equal(e.n, 2);
  assert.equal(e.min, 3);
  assert.equal(e.max, 3.5);
  assert.equal(e.media, 3.25);
  assert.equal(estatisticaCamada(R.pontos, '90-100'), null);
});

console.log('\ncobertura da grade (casarComGrade)');
// Grade de 4 pontos ~100 m apart (0,0009° de lat ≈ 100 m).
const GRADE = [
  { ordem: 0, lng: -49.95, lat: -25.2000 },
  { ordem: 1, lng: -49.95, lat: -25.2009 },
  { ordem: 2, lng: -49.95, lat: -25.2018 },
  { ordem: 3, lng: -49.95, lat: -25.2027 },
];
t('casa cada medição com o ponto mais próximo dentro do raio', () => {
  const med = [
    { lng: -49.95, lat: -25.20005 },   // ~5,6 m do C-1
    { lng: -49.95, lat: -25.20010 },   // ~11 m do C-1 (2ª medição no mesmo ponto)
    { lng: -49.95, lat: -25.20190 },   // ~11 m do C-3
    { lng: -49.95, lat: -25.2045 },    // ~200 m do C-4 → fora da grade
  ];
  const c = casarComGrade(med, GRADE, 30);
  assert.equal(c.total, 4);
  assert.equal(c.medidos, 2);
  assert.deepEqual(c.faltando, [1, 3]);
  assert.equal(c.foraDaGrade, 1);
  assert.equal(c.porPonto[0].n, 2);
  assert.ok(c.porPonto[0].distM > 5 && c.porPonto[0].distM < 6);
  assert.equal(c.porPonto[2].n, 1);
});
t('raio menor exclui a medição mais distante', () => {
  const c = casarComGrade([{ lng: -49.95, lat: -25.2001 }], GRADE, 5);   // ~11 m
  assert.equal(c.medidos, 0);
  assert.equal(c.foraDaGrade, 1);
  assert.deepEqual(c.faltando, [0, 1, 2, 3]);
});
t('grade vazia: toda medição fica fora; sem medições: tudo faltando', () => {
  assert.deepEqual(casarComGrade([{ lng: 0, lat: 0 }], [], 30), { medidos: 0, total: 0, faltando: [], foraDaGrade: 1, porPonto: {} });
  const c = casarComGrade([], GRADE);
  assert.equal(c.medidos, 0);
  assert.equal(c.faltando.length, 4);
});
t('pontos da fixture Falker contra uma grade sobre eles', () => {
  const g = R.pontos.map((p, i) => ({ ordem: i, lng: p.lng, lat: p.lat }));
  const c = casarComGrade(R.pontos, g);
  assert.equal(c.medidos, R.pontos.length);
  assert.equal(c.foraDaGrade, 0);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
