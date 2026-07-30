// Motor das Prescrições (src/lib/prescricao) — roda: `npm run teste:prescricao`.
//
// A invariante que este arquivo existe para proteger: a redistribuição por
// estoque NUNCA usa mais produto do que existe — nem por arredondamento, nem
// por incremento de máquina, nem com estoque insuficiente. Prescrição vai para
// a máquina no campo; estourar estoque aqui vira caminhão faltando lá.
import assert from 'node:assert/strict';
import { redistribuirPorEstoque, distribuirProporcional, resumoDoses, nutrientesPorZona, pesoDoRank, fatorBaseDose } from '../src/lib/prescricao/calculo.ts';
import { fatorCampo, sementesPorHa, metricasSementes, estoqueTotalSementes, distribuirSementes } from '../src/lib/prescricao/sementes.ts';
import { dosesPorEquacao, variaveisDaEquacao } from '../src/lib/prescricao/equacao.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
const usadoDe = (zonas, doses) => zonas.reduce((s, z) => s + (doses[z.id] ?? 0) * z.areaHa, 0);

console.log('\nRedistribuição por estoque\n');

const Z3 = [
  { id: 'alta', areaHa: 10, peso: 3 },
  { id: 'media', areaHa: 20, peso: 2 },
  { id: 'baixa', areaHa: 10, peso: 1 },
];

t('exemplo do esterco: 400 t, 40 ha, min 5 / máx 15 t/ha — usa TUDO, prioridade manda', () => {
  const r = redistribuirPorEstoque(Z3, 400, { doseMin: 5, doseMax: 15 });
  assert.ok(Math.abs(r.usado - 400) < 1e-6, `usado=${r.usado}`);
  assert.ok(Math.abs(r.sobra) < 1e-6);
  assert.equal(r.falta, 0);
  assert.ok(r.doses.alta > r.doses.media && r.doses.media > r.doses.baixa, 'peso maior → dose maior');
  for (const z of Z3) { assert.ok(r.doses[z.id] >= 5 - 1e-9 && r.doses[z.id] <= 15 + 1e-9); }
});

t('NUNCA ultrapassa o estoque — nem com teto folgado', () => {
  for (const total of [1, 37, 123.45, 399.99, 400, 1000]) {
    const r = redistribuirPorEstoque(Z3, total, { doseMin: 0, doseMax: 50 });
    assert.ok(r.usado <= total + 1e-6, `total=${total} usado=${r.usado}`);
    assert.ok(Math.abs(usadoDe(Z3, r.doses) - r.usado) < 1e-6);
  }
});

t('estoque não cabe no máximo → sobra reportada, doses no teto', () => {
  const r = redistribuirPorEstoque(Z3, 1000, { doseMin: 5, doseMax: 15 });
  assert.ok(Math.abs(r.usado - 600) < 1e-6);          // 15 t/ha × 40 ha
  assert.ok(Math.abs(r.sobra - 400) < 1e-6);
  assert.ok(r.avisos.some(a => /sobrar/i.test(a)));
});

t('estoque INSUFICIENTE para o mínimo → falta reportada e NINGUÉM acima do piso', () => {
  const r = redistribuirPorEstoque(Z3, 100, { doseMin: 5, doseMax: 15 });   // piso custa 200
  assert.ok(Math.abs(r.falta - 100) < 1e-6);
  assert.ok(r.usado <= 100 + 1e-6);
  for (const z of Z3) assert.ok(r.doses[z.id] <= 5 + 1e-9, 'com falta, ninguém passa do mínimo');
  assert.ok(r.avisos.some(a => /insuficiente/i.test(a)));
});

t('incremento da máquina: doses na grade e conservação mantida', () => {
  const r = redistribuirPorEstoque(Z3, 400, { doseMin: 5, doseMax: 15, incremento: 0.5 });
  for (const z of Z3) {
    const passos = (r.doses[z.id] - 5) / 0.5;
    assert.ok(Math.abs(passos - Math.round(passos)) < 1e-6, `dose ${r.doses[z.id]} fora da grade`);
  }
  assert.ok(r.usado <= 400 + 1e-6);
  assert.ok(r.sobra < 0.5 * 40, 'troco distribuído: sobra menor que 1 passo na área toda');
});

t('peso 0 trava a zona no mínimo', () => {
  const r = redistribuirPorEstoque(
    [{ id: 'a', areaHa: 10, peso: 0 }, { id: 'b', areaHa: 10, peso: 1 }],
    300, { doseMin: 5, doseMax: 30 });
  assert.ok(Math.abs(r.doses.a - 5) < 1e-9);
  assert.ok(Math.abs(r.doses.b - 25) < 1e-9);
});

console.log('\nDistribuição proporcional\n');

t('média ponderada EXATA e direção direta/inversa', () => {
  const zonas = [
    { id: 'a', areaHa: 10, valorBase: 3 },
    { id: 'b', areaHa: 30, valorBase: 2 },
    { id: 'c', areaHa: 10, valorBase: 1 },
  ];
  const d = distribuirProporcional(zonas, { doseMedia: 100, variacaoPct: 20, relacao: 'direta' });
  const media = usadoDe(zonas, d.doses) / 50;
  assert.ok(Math.abs(media - 100) < 1e-6, `média=${media}`);
  assert.ok(d.doses.a > d.doses.b && d.doses.b > d.doses.c);
  const i = distribuirProporcional(zonas, { doseMedia: 100, variacaoPct: 20, relacao: 'inversa' });
  assert.ok(i.doses.a < i.doses.b && i.doses.b < i.doses.c);
});

t('valores-base iguais → dose uniforme = média', () => {
  const zonas = [{ id: 'a', areaHa: 5, valorBase: 2 }, { id: 'b', areaHa: 15, valorBase: 2 }];
  const d = distribuirProporcional(zonas, { doseMedia: 80, variacaoPct: 25, relacao: 'direta' });
  assert.ok(Math.abs(d.doses.a - 80) < 1e-9 && Math.abs(d.doses.b - 80) < 1e-9);
});

console.log('\nSementes\n');

const PS = { germinacaoPct: 90, purezaPct: 98, sobrevivenciaPct: 95, pmsG: 180, espacamentoM: 0.5, sementesPorSaco: 60_000 };

t('taxa de semeadura desconta germinação/pureza/sobrevivência', () => {
  const fator = fatorCampo(PS);
  assert.ok(Math.abs(fator - 0.9 * 0.98 * 0.95) < 1e-12);
  const taxa = sementesPorHa(300_000, PS);
  assert.ok(Math.abs(taxa - 300_000 / fator) < 1e-6);
  assert.ok(taxa > 300_000, 'semeia-se mais do que a população desejada');
});

t('métricas: sementes/m, kg/ha, sacos', () => {
  const m = metricasSementes(400_000, 25, PS);
  assert.ok(Math.abs(m.sementesPorMetro - 400_000 * 0.5 / 10_000) < 1e-9);   // 20/m
  assert.ok(Math.abs(m.kgHa - 400_000 * 180 / 1e6) < 1e-9);                  // 72 kg/ha
  assert.ok(Math.abs(m.totalSementes - 10_000_000) < 1e-3);
  assert.ok(Math.abs(m.sacos - 10_000_000 / 60_000) < 1e-9);
  assert.ok(Math.abs(m.populacaoFinal - 400_000 * fatorCampo(PS)) < 1e-6);
});

t('estoque em kg/sacos/milhões/população média converte certo', () => {
  assert.equal(estoqueTotalSementes({ sementes: 5e6 }, PS, 30), 5e6);
  assert.ok(Math.abs(estoqueTotalSementes({ kg: 900 }, PS, 30) - 900 * 1e6 / 180) < 1e-6);   // 5M
  assert.equal(estoqueTotalSementes({ sacos: 10 }, PS, 30), 600_000);
  assert.equal(estoqueTotalSementes({ milhoes: 2.5 }, PS, 30), 2_500_000);
  const porMedia = estoqueTotalSementes({ populacaoMediaHa: 285_000 }, PS, 30);
  assert.ok(Math.abs(porMedia - sementesPorHa(285_000, PS) * 30) < 1e-6);
  assert.throws(() => estoqueTotalSementes({}, PS, 30));
});

t('EXEMPLO DA SPEC: média 285 mil → Alta acima, Baixa abaixo, total EXATO', () => {
  const zonas = [
    { id: 'alta', areaHa: 10, potencialRank: 1 },
    { id: 'media', areaHa: 10, potencialRank: 2 },
    { id: 'baixa', areaHa: 10, potencialRank: 3 },
  ];
  const sem100 = { germinacaoPct: 100 };   // fator 1: população == sementes (didático)
  const estoque = 285_000 * 30;
  const r = distribuirSementes(zonas, estoque, { ...sem100, populacaoMin: 255_000, populacaoMax: 305_000 }, 'direta');
  assert.ok(r.usado <= estoque + 1e-6);
  assert.ok(Math.abs(r.usado - estoque) < 1, 'consome praticamente todo o estoque');
  assert.ok(Math.abs(r.populacaoMedia - 285_000) < 1);
  assert.ok(r.populacaoPorZona.alta > r.populacaoPorZona.media && r.populacaoPorZona.media > r.populacaoPorZona.baixa);
  for (const z of zonas) {
    assert.ok(r.populacaoPorZona[z.id] >= 255_000 - 1e-6 && r.populacaoPorZona[z.id] <= 305_000 + 1e-6);
  }
});

t('margem de segurança reserva a fração e avisa', () => {
  const zonas = [{ id: 'a', areaHa: 10, potencialRank: 1 }];
  const r = distribuirSementes(zonas, 1_000_000, { germinacaoPct: 100, margemPct: 2 }, 'direta');
  assert.ok(Math.abs(r.usado - 980_000) < 1e-6);
  assert.ok(r.avisos.some(a => /margem/i.test(a)));
});

console.log('\nSementes por metro linear (fatorBaseDose)\n');

t('fator /ha é 1; sementes/m exige espaçamento e converte por 10.000/E', () => {
  assert.equal(fatorBaseDose('kg/ha'), 1);
  assert.equal(fatorBaseDose('sementes/ha'), 1);
  assert.equal(fatorBaseDose('sementes/m', 0.5), 20_000);   // 0,5 m entre linhas
  assert.ok(Math.abs(fatorBaseDose('sementes/m', 0.45) - 10000 / 0.45) < 1e-9);
  assert.throws(() => fatorBaseDose('sementes/m'));         // sem espaçamento
  assert.throws(() => fatorBaseDose('sementes/m', 0));
});

t('resumo com dose em sementes/m: total = dose × (10.000/E) × área', () => {
  // 3,5 sem/m, espaçamento 0,5 m → 70.000 sem/ha; em 10 ha → 700.000 sementes.
  const fator = fatorBaseDose('sementes/m', 0.5);
  const rs = resumoDoses([{ areaHa: 10, dose: 3.5 }], undefined, fator);
  assert.ok(Math.abs(rs.usado - 700_000) < 1e-6, `usado=${rs.usado}`);
  assert.ok(Math.abs(rs.doseMedia - 3.5) < 1e-9, 'doseMedia fica em sem/m');
  // custo por unidade-base (por semente) multiplica o TOTAL, não a dose
  const rc = resumoDoses([{ areaHa: 10, dose: 3.5 }], 0.0001, fator);
  assert.ok(Math.abs(rc.custo - 70) < 1e-6);
});

console.log('\nPrescrição por EQUAÇÃO (reusa o motor da Recomendação)\n');

const EQ = {
  script: 'dose = (70 - V) / 100 * CTC * 10',   // calagem clássica
  constantes: [],
  naoNegativo: true, doseMinimaViavel: 0, abaixoMinimo: 'zero', doseMaxima: 0,
};

t('detecta as variáveis externas da equação', () => {
  const vars = variaveisDaEquacao(EQ.script).sort();
  assert.deepEqual(vars, ['ctc', 'v']);
});

t('calcula a dose por zona a partir dos valores de cada zona', () => {
  const zonas = [{ id: 'a' }, { id: 'b' }];
  const vals = { a: { v: 50, ctc: 8 }, b: { v: 60, ctc: 6 } };
  const { doses } = dosesPorEquacao(zonas, vals, EQ);
  // a: (70-50)/100*8*10 = 16 ; b: (70-60)/100*6*10 = 6
  assert.ok(Math.abs(doses.find(d => d.id === 'a').dose - 16) < 1e-9);
  assert.ok(Math.abs(doses.find(d => d.id === 'b').dose - 6) < 1e-9);
});

t('zona sem o valor de uma variável sinaliza erro SEM derrubar as outras', () => {
  const { doses } = dosesPorEquacao([{ id: 'a' }, { id: 'b' }], { a: { v: 50, ctc: 8 } }, EQ);
  assert.ok(Number.isFinite(doses.find(d => d.id === 'a').dose));
  const b = doses.find(d => d.id === 'b');
  assert.ok(Number.isNaN(b.dose) && /Faltou/.test(b.erro));
});

t('respeita naoNegativo e doseMaxima da equação', () => {
  const eqLim = { ...EQ, naoNegativo: true, doseMaxima: 10 };
  const { doses } = dosesPorEquacao([{ id: 'x' }, { id: 'y' }],
    { x: { v: 80, ctc: 8 }, y: { v: 40, ctc: 8 } }, eqLim);
  assert.equal(doses.find(d => d.id === 'x').dose, 0);    // (70-80) negativo → 0
  assert.equal(doses.find(d => d.id === 'y').dose, 10);   // (70-40)/100*8*10=24 → teto 10
});

t('equação inválida não lança — reporta erro de compilação', () => {
  const { erroCompilacao, doses } = dosesPorEquacao([{ id: 'a' }], { a: {} }, { ...EQ, script: 'dose = (70 - ' });
  assert.ok(erroCompilacao && doses.every(d => Number.isNaN(d.dose)));
});

console.log('\nResumo e nutrientes\n');

t('resumo: média ponderada e custo', () => {
  const rs = resumoDoses([{ areaHa: 10, dose: 12 }, { areaHa: 30, dose: 8 }], 2);
  assert.equal(rs.areaHa, 40);
  assert.ok(Math.abs(rs.usado - 360) < 1e-9);
  assert.ok(Math.abs(rs.doseMedia - 9) < 1e-9);
  assert.equal(rs.doseMin, 8); assert.equal(rs.doseMax, 12);
  assert.ok(Math.abs(rs.custo - 720) < 1e-9);
});

t('nutrientes do orgânico por zona (kg/ha)', () => {
  const nz = nutrientesPorZona([{ id: 'a', areaHa: 10, dose: 4 }], { n: 8, p2o5: 6, k2o: 10 });
  assert.ok(Math.abs(nz.a.n - 32) < 1e-9);
  assert.ok(Math.abs(nz.a.p2o5 - 24) < 1e-9);
  assert.ok(Math.abs(nz.a.k2o - 40) < 1e-9);
  assert.equal(nz.a.ca, 0);
});

t('pesoDoRank: direta favorece rank 1; inversa favorece o pior', () => {
  assert.ok(pesoDoRank(1, 3, 'direta') > pesoDoRank(3, 3, 'direta'));
  assert.ok(pesoDoRank(3, 3, 'inversa') > pesoDoRank(1, 3, 'inversa'));
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
