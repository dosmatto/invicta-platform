// Motor das Prescrições (src/lib/prescricao) — roda: `npm run teste:prescricao`.
//
// A invariante que este arquivo existe para proteger: a redistribuição por
// estoque NUNCA usa mais produto do que existe — nem por arredondamento, nem
// por incremento de máquina, nem com estoque insuficiente. Prescrição vai para
// a máquina no campo; estourar estoque aqui vira caminhão faltando lá.
import assert from 'node:assert/strict';
import { redistribuirPorEstoque, distribuirProporcional, distribuirPorAjuste, resumoDoses, nutrientesPorZona, pesoDoRank, fatorBaseDose, arredondarDose } from '../src/lib/prescricao/calculo.ts';
import { fatorCampo, sementesPorHa, metricasSementes, estoqueTotalSementes, distribuirSementes, doseCompensada } from '../src/lib/prescricao/sementes.ts';
import { dosesPorEquacao, variaveisDaEquacao } from '../src/lib/prescricao/equacao.ts';
import { converterDose, prescricaoEmUnidade, podeConverter, precisaEspacamento, UNIDADES_SEMENTE } from '../src/lib/prescricao/unidade.ts';
import { casarZonas } from '../src/lib/prescricao/casar.ts';
import { montarResumoPdf, temCompensacao, totalDoArquivo, kgDeSementes, doseArquivo as doseArquivoDe, fmtRel, arredRel, corDaDose } from '../src/lib/prescricao/resumo.ts';
import { fmtHa, arredHa } from '../src/lib/formato.ts';

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

const PS = { germinacaoPct: 90, pmsG: 180, espacamentoM: 0.5, sementesPorSaco: 60_000 };

t('taxa de semeadura desconta a germinação', () => {
  const fator = fatorCampo(PS);
  assert.ok(Math.abs(fator - 0.9) < 1e-12);
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

console.log('\nAjuste percentual por zona\n');

// Mapa-molde: 3 zonas de 10 ha. Ajustes −20% / 0% / +20% sobre uma base de 100.
const ZA = [{ id: 'baixa', areaHa: 10 }, { id: 'media', areaHa: 10 }, { id: 'alta', areaHa: 10 }];
const AJ3 = { baixa: -20, media: 0, alta: 20 };

t('cenário livre: dose = base × fator, total é consequência', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 100, ajustePct: AJ3, cenario: 'livre' });
  assert.equal(r.doses.baixa, 80);
  assert.equal(r.doses.media, 100);
  assert.equal(r.doses.alta, 120);
  assert.ok(Math.abs(r.usado - 3000) < 1e-9, '80·10 + 100·10 + 120·10');
});

t('cenário total: consome EXATAMENTE o disponível', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 999, ajustePct: AJ3, cenario: 'total', totalDisponivel: 3000 });
  assert.ok(Math.abs(r.usado - 3000) < 1e-6, 'o total dado manda; a doseBase é só partida');
  assert.ok(Math.abs(r.sobra) < 1e-6);
});

t('cenário total: preserva as PROPORÇÕES entre zonas', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 1, ajustePct: AJ3, cenario: 'total', totalDisponivel: 6000 });
  assert.ok(Math.abs(r.doses.alta / r.doses.baixa - 120 / 80) < 1e-9);
  assert.ok(Math.abs(r.doses.media / r.doses.baixa - 100 / 80) < 1e-9);
});

t('cenário total respeita a ÁREA de cada zona (mapa desbalanceado)', () => {
  const zonas = [{ id: 'a', areaHa: 5 }, { id: 'b', areaHa: 45 }];
  const r = distribuirPorAjuste(zonas, { doseBase: 1, ajustePct: { a: 50, b: 0 }, cenario: 'total', totalDisponivel: 1000 });
  assert.ok(Math.abs(r.usado - 1000) < 1e-6);
  assert.ok(Math.abs(r.doses.a / r.doses.b - 1.5) < 1e-9);
});

t('ajuste ausente vale 0% (zona fica na dose base)', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 50, ajustePct: { alta: 10 }, cenario: 'livre' });
  assert.equal(r.doses.baixa, 50);
  assert.equal(r.doses.media, 50);
  assert.ok(Math.abs(r.doses.alta - 55) < 1e-9);   // 50×1,1 em IEEE754 não é exato
});

t('ajuste de −100% zera a zona (não aplicar ali)', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 100, ajustePct: { ...AJ3, baixa: -100 }, cenario: 'livre' });
  assert.equal(r.doses.baixa, 0);
});

t('ajuste abaixo de −100% NÃO gera dose negativa', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 100, ajustePct: { baixa: -180 }, cenario: 'livre' });
  assert.equal(r.doses.baixa, 0, 'trava em 0, não inverte o sinal');
  assert.ok(r.usado >= 0);
});

t('sementes/m: o fatorBase entra na conta do total', () => {
  // espaçamento 0,5 m → 20.000 m de linha por ha → fatorBase 20.000.
  const fb = fatorBaseDose('sementes/m', 0.5);
  assert.equal(fb, 20000);
  const r = distribuirPorAjuste([{ id: 'a', areaHa: 10 }],
    { doseBase: 1, ajustePct: {}, cenario: 'total', totalDisponivel: 2_000_000, fatorBase: fb });
  assert.ok(Math.abs(r.usado - 2_000_000) < 1e-3);
  assert.ok(Math.abs(r.doses.a - 10) < 1e-9, '2.000.000 / (20.000 · 10 ha) = 10 sementes/m');
});

t('limites e incremento aplicam — e o desvio do total é AVISADO', () => {
  const r = distribuirPorAjuste(ZA, {
    doseBase: 1, ajustePct: AJ3, cenario: 'total', totalDisponivel: 3000, doseMax: 90,
  });
  assert.ok(r.doses.alta <= 90, 'o teto vale');
  assert.ok(r.avisos.length > 0, 'o usuário precisa saber que a conta não fechou exata');
});

t('incremento coloca as doses na grade da máquina', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 100, ajustePct: AJ3, cenario: 'livre', incremento: 25 });
  for (const d of Object.values(r.doses)) assert.equal(d % 25, 0);
});

t('total sem quantidade informada não inventa dose', () => {
  const r = distribuirPorAjuste(ZA, { doseBase: 100, ajustePct: AJ3, cenario: 'total' });
  assert.ok(Object.values(r.doses).every(d => d === 0));
  assert.ok(r.avisos.length > 0);
});

t('todos os ajustes em −100%: avisa em vez de dividir por zero', () => {
  const r = distribuirPorAjuste(ZA, {
    doseBase: 100, ajustePct: { baixa: -100, media: -100, alta: -100 },
    cenario: 'total', totalDisponivel: 1000,
  });
  assert.ok(r.avisos.length > 0);
  assert.ok(Number.isFinite(r.usado));
});

t('zona sem área não entra na conta', () => {
  const r = distribuirPorAjuste([{ id: 'a', areaHa: 10 }, { id: 'vazia', areaHa: 0 }],
    { doseBase: 100, ajustePct: {}, cenario: 'total', totalDisponivel: 1000 });
  assert.equal(r.doses.vazia, 0);
  assert.ok(Math.abs(r.usado - 1000) < 1e-6, 'o total inteiro vai para a zona com área');
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

console.log('\nDose legível e compensação da germinação\n');

t('arredondarDose: grande fica inteiro, pequeno com no máx. 2 casas', () => {
  // A distribuição fecha o total exato e devolve dízima: "84352,78766265
  // sementes/ha" não se regula em máquina nenhuma e esconde a ordem de grandeza.
  assert.equal(arredondarDose(84352.78766265), 84353);
  assert.equal(arredondarDose(80518.57004164), 80519);
  assert.equal(arredondarDose(2.4567), 2.46);
  assert.equal(arredondarDose(0.756), 0.76);
  assert.equal(arredondarDose(999.999), 1000);   // vira grande e some a casa
  assert.equal(arredondarDose(-1500.4), -1500);
  assert.ok(Number.isNaN(arredondarDose(NaN)));
});

t('compensação: 80.000 plantas/ha com 90% de germinação → 88.889 sementes/ha', () => {
  const p = { germinacaoPct: 90 };
  const taxa = doseCompensada(80_000, p, true);
  assert.ok(Math.abs(taxa - 80_000 / 0.9) < 1e-6, `veio ${taxa}`);
  // e a taxa devolve a população pedida no campo
  assert.ok(Math.abs(taxa * fatorCampo(p) - 80_000) < 1e-6);
});

t('sem o marcador, a dose vai INTACTA para o arquivo', () => {
  // Prescrição de fertilizante não pode ser "compensada" por germinação.
  assert.equal(doseCompensada(300, { germinacaoPct: 90 }, false), 300);
  assert.equal(doseCompensada(300, undefined, true), 300);
});

t('germinação 100% não muda a dose', () => {
  assert.equal(doseCompensada(80_000, { germinacaoPct: 100 }, true), 80_000);
});

t('resumo do PDF: os dois totais nomeados, em sementes e em quilos', () => {
  // O resumo antigo empilhava "usada", "disponível" e "no arquivo" sem dizer
  // qual era população e qual era semente — ninguém sabia o que comprar.
  const zonas = [{ idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 10, dose: 80_000 }];
  const p = {
    unidade: 'sementes/ha', tipo: 'sementes', produto: 'x', nome: 'x',
    params: { doseEhPopulacao: true, sementes: { germinacaoPct: 90, pmsG: 180 } },
    zonas, fc: { type: 'FeatureCollection', features: [] },
  };
  const r = { areaHa: 10, nZonas: 1, usado: 800_000, doseMin: 80_000, doseMax: 80_000, doseMedia: 80_000, custo: null };
  const linhas = montarResumoPdf(p, r, 1, 1).map(l => l.txt);
  const texto = linhas.join(' | ');
  assert.match(texto, /Total SEM ajuste.*800\.000/, `sem ajuste ausente: ${texto}`);
  assert.match(texto, /Total COM ajuste de germinação \(90%\).*888\.889/, `com ajuste ausente: ${texto}`);
  assert.match(texto, /Diferença a mais para comprar.*88\.889/);
  // PMS 180 g → 800.000 sementes = 144 kg; 888.889 = 160 kg
  assert.match(texto, /144 kg/, `kg sem ajuste ausente: ${texto}`);
  assert.match(texto, /160 kg/, `kg com ajuste ausente: ${texto}`);
  assert.match(texto, /arquivo de aplicação JÁ SAI com o ajuste/);
});

t('resumo sem compensação não inventa duas contas', () => {
  const zonas = [{ idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 10, dose: 2.5 }];
  const p = { unidade: 't/ha', tipo: 'corretivo', produto: 'x', nome: 'x', params: {}, zonas, fc: { type: 'FeatureCollection', features: [] } };
  const r = { areaHa: 10, nZonas: 1, usado: 25, doseMin: 2.5, doseMax: 2.5, doseMedia: 2.5, custo: null };
  const texto = montarResumoPdf(p, r, 1, 1).map(l => l.txt).join(' | ');
  assert.ok(!/ajuste de germinação/.test(texto), texto);
  assert.match(texto, /Quantidade usada: 25 t/);
  assert.match(texto, /sai com a dose exatamente como está na tabela/);
});

t('ADUBO não fala em população nem em germinação', () => {
  // Achado no uso real: o marcador de "a dose é população" ficava ligado de uma
  // prescrição de semente e o relatório de um MAP passava a dizer "população
  // desejada" e "ajuste de germinação (97%)" — números certos, texto sem
  // sentido agronômico. Adubo não germina: quem decide é a UNIDADE.
  const zonas = [{ idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 10, dose: 200 }];
  const p = {
    unidade: 'kg/ha', tipo: 'fertilizante', produto: 'MAP', nome: 'x',
    params: { doseEhPopulacao: true, sementes: { germinacaoPct: 97 } },   // marcador ligado de propósito
    zonas, fc: { type: 'FeatureCollection', features: [] },
  };
  assert.equal(temCompensacao(p), false, 'adubo não pode ter compensação');
  assert.equal(doseArquivoDe(p, 200), 200, 'a dose do arquivo não pode subir');
  const texto = montarResumoPdf(p, { areaHa: 10, nZonas: 1, usado: 2000, doseMin: 200, doseMax: 200, doseMedia: 200, custo: null }, 1, 1)
    .map(l => l.txt).join(' | ');
  assert.ok(!/[Pp]opulação/.test(texto), `falou em população: ${texto}`);
  assert.ok(!/germinação/.test(texto), `falou em germinação: ${texto}`);
  assert.match(texto, /Dose: mín 200 /);
  assert.match(texto, /Quantidade usada: 2\.000 kg/);
});

t('semente com o mesmo marcador CONTINUA compensando', () => {
  const zonas = [{ idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 10, dose: 80_000 }];
  const p = {
    unidade: 'sementes/ha', tipo: 'sementes', produto: 'x', nome: 'x',
    params: { doseEhPopulacao: true, sementes: { germinacaoPct: 97 } },
    zonas, fc: { type: 'FeatureCollection', features: [] },
  };
  assert.equal(temCompensacao(p), true);
  assert.ok(Math.abs(doseArquivoDe(p, 80_000) - 80_000 / 0.97) < 1e-6);
});

t('resumo do PDF traz a conta da complementação (Parte XIV §11)', () => {
  const p = {
    unidade: 'kg/ha', tipo: 'fertilizante', produto: 'Ureia', nome: 'x', modo: 'complemento',
    params: { complemento: {
      nutriente: 'n', metaKgHa: 200,
      baseNome: 'MAP', baseGarantiaPct: 12, baseDoseKgHa: 200,
      compNome: 'Ureia', compGarantiaPct: 45,
    } },
    zonas: [{ idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 10, dose: 391.1 }],
    fc: { type: 'FeatureCollection', features: [] },
  };
  const texto = montarResumoPdf(p, { areaHa: 10, nZonas: 1, usado: 3911, doseMin: 391.1, doseMax: 391.1, doseMedia: 391.1, custo: null }, 1, 1)
    .map(l => l.txt).join(' | ');
  assert.match(texto, /referência: N, meta 200 kg\/ha/);
  assert.match(texto, /MAP.*garantia 12%.*fornece 24 kg\/ha de N/);
  assert.match(texto, /Faltante: 200 - 24 = 176/);
  assert.match(texto, /Ureia.*45%.*391 kg\/ha/);
});

t('relatório: número grande sem decimal, número pequeno com', () => {
  // Acima de 100 a casa decimal não informa nada; abaixo dela é o dado —
  // sementes por metro é 12,52, e arredondar para 13 erra a população em ~4%.
  assert.equal(fmtRel(391.111), '391');
  assert.equal(fmtRel(4102.7), '4.103');
  assert.equal(fmtRel(100), '100');
  assert.equal(fmtRel(99.99), '99,99');
  assert.equal(fmtRel(12.52), '12,52');
  assert.equal(fmtRel(2.5), '2,5', 'sem zero à toa');
  assert.equal(fmtRel(0.756), '0,76');
  assert.equal(fmtRel(-150.4), '-150');
  assert.equal(fmtRel(NaN), '—');
});

t('arredRel devolve NÚMERO com a mesma regra (Excel/SHP)', () => {
  assert.equal(arredRel(391.111), 391);
  assert.equal(arredRel(12.526), 12.53);
  assert.equal(arredRel(99.999), 100);
  assert.equal(arredRel(2.5), 2.5);
});

t('cor da dose: rampa VERDE (menor) → AMARELO → VERMELHO (maior)', () => {
  // O mapa e o quadradinho da tabela leem a mesma função: se ela inverter, o
  // relatório inteiro passa a dizer o contrário do que a dose diz.
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const min = rgb(corDaDose(100, 100, 200));
  const meio = rgb(corDaDose(150, 100, 200));
  const max = rgb(corDaDose(200, 100, 200));
  assert.ok(min[1] > min[0], `dose mínima tem de puxar para o verde: ${min}`);
  assert.ok(max[0] > max[1] * 2, `dose máxima tem de puxar para o vermelho: ${max}`);
  assert.ok(meio[0] > 200 && meio[1] > 200 && meio[2] < 180, `meio da rampa é amarelo: ${meio}`);
  // O "quanto de vermelho" (R - G) cresce SEM voltar atrás ao longo da rampa.
  // Os canais isolados não servem de invariante: passando pelo amarelo, tanto R
  // quanto G sobem — é a diferença entre eles que ordena as cores.
  let antes = -1e9;
  for (let i = 0; i <= 20; i++) {
    const [r, g] = rgb(corDaDose(100 + i * 5, 100, 200));
    assert.ok(r - g > antes, `rampa voltou atrás em t=${i / 20}: ${r - g} <= ${antes}`);
    antes = r - g;
  }
});

t('cor da dose: dose única (min == max) não vira NaN nem cor inválida', () => {
  const cor = corDaDose(300, 300, 300);
  assert.match(cor, /^#[0-9a-f]{6}$/, cor);
  // fora da faixa não estoura a rampa
  assert.match(corDaDose(1000, 100, 200), /^#[0-9a-f]{6}$/);
  assert.match(corDaDose(-50, 100, 200), /^#[0-9a-f]{6}$/);
});

t('ÁREA é EXCEÇÃO: sempre 2 casas, inclusive o zero final', () => {
  // Área não segue a regra por magnitude: é o número do contrato e da
  // matrícula. "159 ha" num relatório e "159,38 ha" no vizinho vira dúvida, e
  // "159,4" parece truncado — o zero final também informa.
  assert.equal(fmtHa(159.38), '159,38');
  assert.equal(fmtHa(159.4), '159,40');
  assert.equal(fmtHa(159), '159,00');
  assert.equal(fmtHa(1234.5), '1.234,50');
  assert.equal(fmtHa(0.05), '0,05');
  assert.equal(fmtHa(NaN), '—');
  assert.notEqual(fmtHa(159.4), fmtRel(159.4), 'a regra da área não é a dos demais números');
  assert.equal(arredHa(159.384), 159.38);
  assert.equal(arredHa(159.4), 159.4, 'no Excel o zero final é FORMATO da célula, não valor');
});

t('resumo do PDF: a linha da Área sai com 2 casas', () => {
  const zonas = [
    { idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 100, dose: 200 },
    { idZona: 'b', nomeZona: '02', classe: 'Baixa', cor: '#111', areaHa: 59.4, dose: 100 },
  ];
  const p = { unidade: 'kg/ha', tipo: 'fertilizante', produto: 'MAP', nome: 'x', params: {}, zonas, fc: { type: 'FeatureCollection', features: [] } };
  const linhas = montarResumoPdf(p, { areaHa: 159.4, nZonas: 2, usado: 15940, doseMin: 100, doseMax: 200, doseMedia: 150, custo: null }, 1, 2);
  const area = linhas.find(l => l.txt.startsWith('Área:'));
  assert.ok(area, 'sem linha de área');
  assert.match(area.txt, /^Área: 159,40 ha/, `veio "${area.txt}"`);
});

t('resumo: base em TAXA VARIÁVEL não escreve "0 kg/ha"', () => {
  // A base vinda de uma prescrição salva tem dose por zona; imprimir a dose
  // única (que não existe) dava "MAP · 0,0 kg/ha · fornece 0,0" no relatório.
  const zonas = [
    { idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 10, dose: 400 },
    { idZona: 'b', nomeZona: '02', classe: 'Baixa', cor: '#000', areaHa: 10, dose: 420 },
  ];
  const p = {
    unidade: 'kg/ha', tipo: 'fertilizante', produto: 'Ureia', nome: 'x', modo: 'complemento',
    params: { complemento: {
      nutriente: 'n', metaKgHa: 180,
      baseNome: 'MAP', basePrescricaoNome: 'Dose de fertilizante (v3)',
      baseGarantiaPct: 12, baseDosePorZona: { a: 208.7, b: 172.3 },
      compNome: 'Ureia', compGarantiaPct: 45,
    } },
    zonas, fc: { type: 'FeatureCollection', features: [] },
  };
  const texto = montarResumoPdf(p, { areaHa: 20, nZonas: 2, usado: 8200, doseMin: 400, doseMax: 420, doseMedia: 410, custo: null })
    .map(l => l.txt).join(' | ');
  assert.ok(!/0 kg\/ha de N/.test(texto), `ainda diz 0: ${texto}`);
  assert.match(texto, /TAXA VARIÁVEL/);
  assert.match(texto, /Dose de fertilizante \(v3\)/);
  assert.match(texto, /172 a 209 kg\/ha/, texto);          // faixa do base
  assert.match(texto, /ZONA A ZONA/);
  // sem caracteres que a fonte do PDF não desenha (sumiriam do relatório)
  assert.ok(!/[−÷→₀₁₂₃₄₅₆₇₈₉]/.test(texto), `caractere fora do WinAnsi: ${texto}`);
});

t('símbolo do nutriente vai em ASCII para o PDF (P2O5, não P₂O₅)', () => {
  const p = {
    unidade: 'kg/ha', tipo: 'fertilizante', produto: 'Super', nome: 'x', modo: 'complemento',
    params: { complemento: { nutriente: 'p2o5', metaKgHa: 90, baseGarantiaPct: 0, baseDoseKgHa: 0, compNome: 'Super', compGarantiaPct: 18 } },
    zonas: [{ idZona: 'a', nomeZona: '01', classe: 'A', cor: '#000', areaHa: 10, dose: 500 }],
    fc: { type: 'FeatureCollection', features: [] },
  };
  const texto = montarResumoPdf(p, { areaHa: 10, nZonas: 1, usado: 5000, doseMin: 500, doseMax: 500, doseMedia: 500, custo: null }).map(l => l.txt).join(' | ');
  assert.match(texto, /P2O5/);
  assert.ok(!/₂|₅/.test(texto), `subscrito sobreviveu: ${texto}`);
});

console.log('\nConversão de unidade (população <-> sementes por metro)\n');

t('EXEMPLO DO CAMPO: 80.000 sementes/ha com espaçamento 0,50 m = 4 sementes/m', () => {
  assert.equal(converterDose(80_000, 'sementes/ha', 'sementes/m', 0.5), 4);
  assert.equal(converterDose(4, 'sementes/m', 'sementes/ha', 0.5), 80_000);
  // milho a 0,45 m: 60.000 pl/ha = 2,7 sementes por metro
  assert.ok(Math.abs(converterDose(60_000, 'sementes/ha', 'sementes/m', 0.45) - 2.7) < 1e-9);
});

t('ida e volta não perde valor (a conversão é exata)', () => {
  for (const esp of [0.45, 0.5, 0.76, 0.9]) {
    for (const pop of [45_000, 80_000, 320_000]) {
      const m = converterDose(pop, 'sementes/ha', 'sementes/m', esp);
      const volta = converterDose(m, 'sementes/m', 'sementes/ha', esp);
      assert.ok(Math.abs(volta - pop) < 1e-6, `esp ${esp}, pop ${pop} -> ${volta}`);
    }
  }
});

t('sem espaçamento, NÃO converte — chute vira população errada no campo', () => {
  assert.equal(podeConverter('sementes/ha', 'sementes/m', undefined), false);
  assert.equal(podeConverter('sementes/ha', 'sementes/m', 0), false);
  assert.equal(podeConverter('sementes/ha', 'sementes/ha', undefined), true, 'mesma unidade não precisa de nada');
  assert.throws(() => converterDose(80_000, 'sementes/ha', 'sementes/m', undefined), /espaçamento/i);
});

t('adubo não entra nessa conversão', () => {
  assert.equal(podeConverter('kg/ha', 'sementes/m', 0.5), false);
  assert.throws(() => converterDose(200, 'kg/ha', 'sementes/m', 0.5), /não existe/);
});

t('SEMENTES POR METRO QUADRADO: 80.000 pl/ha = 8 sementes/m2, sem espaçamento', () => {
  // 1 ha = 10.000 m². Esta régua não depende do espaçamento entre linhas — é a
  // única das três que converte mesmo com o campo em branco.
  assert.equal(converterDose(80_000, 'sementes/ha', 'sementes/m2', undefined), 8);
  assert.equal(converterDose(8, 'sementes/m2', 'sementes/ha', undefined), 80_000);
  assert.equal(podeConverter('sementes/ha', 'sementes/m2', undefined), true);
  assert.equal(precisaEspacamento('sementes/m2'), false);
  assert.equal(precisaEspacamento('sementes/m'), true);
});

t('metro linear <-> metro quadrado passa pelo espaçamento', () => {
  // 4 sementes/m a 0,50 m = 80.000/ha = 8/m²
  assert.equal(converterDose(4, 'sementes/m', 'sementes/m2', 0.5), 8);
  assert.equal(converterDose(8, 'sementes/m2', 'sementes/m', 0.5), 4);
  assert.equal(podeConverter('sementes/m', 'sementes/m2', undefined), false, 'sem espaçamento não dá');
});

t('as três réguas fecham no MESMO total de sementes', () => {
  const zonas = [{ idZona: 'a', nomeZona: '01', classe: 'A', cor: '#000', areaHa: 12.5, dose: 80_000 }];
  const p = {
    unidade: 'sementes/ha', tipo: 'sementes', produto: 'Milho', nome: 'x', zonas,
    params: { sementes: { germinacaoPct: 95, espacamentoM: 0.45 } },
    fc: { type: 'FeatureCollection', features: [] },
  };
  const totais = UNIDADES_SEMENTE.map(u => {
    const q = prescricaoEmUnidade(p, u);
    return resumoDoses(q.zonas, undefined, fatorBaseDose(q.unidade, 0.45)).usado;
  });
  for (const t2 of totais) assert.ok(Math.abs(t2 - 1_000_000) < 1e-6, `totais: ${totais.join(' / ')}`);
});

t('prescricaoEmUnidade converte doses e LIMITES, e preserva o total absoluto', () => {
  const zonas = [
    { idZona: 'a', nomeZona: '01', classe: 'Alta', cor: '#000', areaHa: 10, dose: 80_000 },
    { idZona: 'b', nomeZona: '02', classe: 'Baixa', cor: '#111', areaHa: 10, dose: 60_000 },
  ];
  const p = {
    unidade: 'sementes/ha', tipo: 'sementes', produto: 'Milho', nome: 'x', zonas,
    params: { doseMin: 50_000, doseMax: 90_000, totalDisponivel: 1_400_000, sementes: { germinacaoPct: 95, espacamentoM: 0.5 } },
    fc: { type: 'FeatureCollection', features: [] },
  };
  const m = prescricaoEmUnidade(p, 'sementes/m');
  assert.equal(m.unidade, 'sementes/m');
  assert.deepEqual(m.zonas.map(z => z.dose), [4, 3]);
  assert.equal(m.params.doseMin, 2.5);
  assert.equal(m.params.doseMax, 4.5);
  assert.equal(m.params.totalDisponivel, 1_400_000, 'estoque é absoluto: não muda com a régua');
  assert.equal(p.zonas[0].dose, 80_000, 'a prescrição original não pode ser tocada');

  // o TOTAL usado tem de bater nas duas unidades
  const totalHa = resumoDoses(p.zonas, undefined, fatorBaseDose(p.unidade, 0.5)).usado;
  const totalM = resumoDoses(m.zonas, undefined, fatorBaseDose(m.unidade, 0.5)).usado;
  assert.ok(Math.abs(totalHa - totalM) < 1e-6, `${totalHa} x ${totalM}`);
  assert.equal(totalHa, 1_400_000);
});

t('mesma unidade devolve a MESMA referência (sem cópia à toa)', () => {
  const p = { unidade: 'sementes/m', zonas: [], params: {}, fc: { type: 'FeatureCollection', features: [] } };
  assert.equal(prescricaoEmUnidade(p, 'sementes/m'), p);
});

t('pedir conversão sem espaçamento explica o que falta', () => {
  const p = { unidade: 'sementes/ha', zonas: [], params: { sementes: { germinacaoPct: 95 } }, fc: { type: 'FeatureCollection', features: [] } };
  assert.throws(() => prescricaoEmUnidade(p, 'sementes/m'), /espaçamento entre linhas/i);
});

console.log('\nCasamento polígono <-> zona (o arquivo que vai para a máquina)\n');

const featZona = (id, zona) => ({ type: 'Feature', properties: { id, zona }, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } });

t('caso normal: todo polígono acha a sua zona', () => {
  const zonas = [
    { idZona: '01', nomeZona: '01' }, { idZona: '02', nomeZona: '02' }, { idZona: '03', nomeZona: '03' },
  ];
  const fc = { type: 'FeatureCollection', features: ['01', '02', '03'].map(i => featZona(i, i)) };
  const c = casarZonas(fc, zonas);
  assert.equal(c.pares.length, 3);
  assert.equal(c.semZona.length, 0);
  assert.equal(c.semPoligono.length, 0);
});

t('POLÍGONO PARTIDO no editor ("03_2") continua achando a zona pelo rótulo', () => {
  // O corte por linha cria 03_2, 03_3… Se a prescrição foi montada antes, o
  // idZona é "03" e o casamento por id sozinho jogaria os recortes fora — o SHP
  // saía com um pedaço do talhão só, que foi o relato.
  const zonas = [{ idZona: '03', nomeZona: '03' }];
  const fc = { type: 'FeatureCollection', features: [featZona('03', '03'), featZona('03_2', '03'), featZona('03_3', '03')] };
  const c = casarZonas(fc, zonas);
  assert.equal(c.pares.length, 3, 'os três pedaços entram no arquivo');
  assert.equal(c.semZona.length, 0);
});

t('polígono ÓRFÃO é reportado (não sai calado do arquivo)', () => {
  const zonas = [{ idZona: '01', nomeZona: '01' }];
  const fc = { type: 'FeatureCollection', features: [featZona('01', '01'), featZona('09', '09')] };
  const c = casarZonas(fc, zonas);
  assert.equal(c.pares.length, 1);
  assert.equal(c.semZona.length, 1, 'quem não casou tem de aparecer para a validação bloquear');
});

t('zona sem polígono também é reportada', () => {
  const zonas = [{ idZona: '01', nomeZona: '01' }, { idZona: '02', nomeZona: '02' }];
  const fc = { type: 'FeatureCollection', features: [featZona('01', '01')] };
  const c = casarZonas(fc, zonas);
  assert.equal(c.semPoligono.length, 1);
  assert.equal(c.semPoligono[0].idZona, '02');
});

t('feature SEM geometria não vira polígono no shapefile', () => {
  const zonas = [{ idZona: '01', nomeZona: '01' }];
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: '01' }, geometry: null }] };
  const c = casarZonas(fc, zonas);
  assert.equal(c.pares.length, 0);
  assert.equal(c.semZona.length, 0, 'sem geometria não é órfão — simplesmente não existe no mapa');
});

t('fc vazio ou nulo não quebra', () => {
  assert.equal(casarZonas(null, [{ idZona: '01', nomeZona: '01' }]).pares.length, 0);
  assert.equal(casarZonas({ type: 'FeatureCollection', features: [] }, []).semPoligono.length, 0);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
