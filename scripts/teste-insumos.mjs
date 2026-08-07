// Biblioteca de Insumos + motor de COMPLEMENTAÇÃO POR NUTRIENTE (Parte XIV).
//
// A conta é simples e por isso mesmo perigosa: um sinal trocado vira dose
// negativa, uma garantia zerada vira Infinity, e qualquer um dos dois chega à
// máquina como quantidade absurda de adubo. Estes testes travam o caso do
// exemplo da spec e as três bordas que a conta crua erra.
//
// Rodar: npm run teste:insumos

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  complementarNutriente, complementarPorZona, nutrienteFornecido, garantiaDe, podeComplementar,
  NUTRIENTES, ROTULO_NUTRIENTE, unidadePreco, precoNaUnidade,
} from '../src/lib/insumos.ts';
import { fmtMoeda, lerMoeda, arredMoeda } from '../src/lib/formato.ts';

test('EXEMPLO DA SPEC: meta 200 de N, MAP 200 kg/ha a 12% → 391,1 kg/ha de ureia', () => {
  const r = complementarNutriente({ metaKgHa: 200, baseGarantiaPct: 12, baseDoseKgHa: 200, compGarantiaPct: 45 });
  assert.equal(r.fornecidoKgHa, 24);
  assert.equal(r.faltanteKgHa, 176);
  assert.ok(Math.abs(r.doseCompKgHa - 391.111) < 0.01, `veio ${r.doseCompKgHa}`);
  assert.equal(r.avisos.length, 0);
});

test('sem produto base: a dose do complementar cobre a meta inteira', () => {
  const r = complementarNutriente({ metaKgHa: 90, baseGarantiaPct: 0, baseDoseKgHa: 0, compGarantiaPct: 45 });
  assert.equal(r.fornecidoKgHa, 0);
  assert.equal(r.faltanteKgHa, 90);
  assert.equal(r.doseCompKgHa, 200);
});

test('BORDA: o base já passou da meta → dose 0 e AVISO, nunca dose negativa', () => {
  // 300 kg/ha de MAP a 12% = 36 kg/ha de N para uma meta de 20.
  const r = complementarNutriente({ metaKgHa: 20, baseGarantiaPct: 12, baseDoseKgHa: 300, compGarantiaPct: 45 });
  assert.equal(r.doseCompKgHa, 0, 'aplicar "menos que nada" não existe');
  assert.equal(r.faltanteKgHa, 0);
  assert.ok(Math.abs(r.excedenteKgHa - 16) < 1e-9);
  assert.match(r.avisos.join(' '), /ACIMA da meta/);
});

test('BORDA: complementar sem garantia do nutriente → dose 0 e AVISO, não Infinity', () => {
  const r = complementarNutriente({ metaKgHa: 100, baseGarantiaPct: 0, baseDoseKgHa: 0, compGarantiaPct: 0 });
  assert.equal(r.doseCompKgHa, 0);
  assert.ok(Number.isFinite(r.doseCompKgHa));
  assert.match(r.avisos.join(' '), /não tem garantia declarada/);
});

test('BORDA: meta não informada avisa em vez de calcular sozinha', () => {
  const r = complementarNutriente({ metaKgHa: 0, baseGarantiaPct: 12, baseDoseKgHa: 200, compGarantiaPct: 45 });
  assert.equal(r.doseCompKgHa, 0);
  assert.match(r.avisos.join(' '), /Informe a meta/);
});

test('a conta fecha: dose calculada × garantia + fornecido = meta', () => {
  for (const [meta, gBase, dBase, gComp] of [[200, 12, 200, 45], [150, 18, 120, 46], [60, 0, 0, 33]]) {
    const r = complementarNutriente({ metaKgHa: meta, baseGarantiaPct: gBase, baseDoseKgHa: dBase, compGarantiaPct: gComp });
    const total = r.fornecidoKgHa + nutrienteFornecido(r.doseCompKgHa, gComp);
    assert.ok(Math.abs(total - meta) < 1e-6, `meta ${meta}: fechou em ${total}`);
  }
});

test('POR ZONA: a prescrição base tem dose diferente em cada zona', () => {
  // O caso real: o MAP já foi prescrito em taxa variável (250 na zona boa, 200
  // na média, 150 na fraca). Cada zona já recebeu uma quantidade diferente de
  // N, então o complemento também tem de variar — uma dose única jogaria fora
  // a taxa variável que já tinha sido decidida.
  const zonas = [
    { idZona: 'a', baseDoseKgHa: 250 },
    { idZona: 'b', baseDoseKgHa: 200 },
    { idZona: 'c', baseDoseKgHa: 150 },
  ];
  const r = complementarPorZona(zonas, { metaKgHa: 200, baseGarantiaPct: 12, compGarantiaPct: 45 });
  assert.deepEqual(r.map(x => x.idZona), ['a', 'b', 'c']);
  assert.deepEqual(r.map(x => Math.round(x.fornecidoKgHa)), [30, 24, 18]);
  // faltante = 170 / 176 / 182 → dose = /0,45
  assert.deepEqual(r.map(x => Math.round(x.doseCompKgHa)), [378, 391, 404]);
  // a zona mais fraca no base recebe MAIS complemento — é o esperado
  assert.ok(r[2].doseCompKgHa > r[0].doseCompKgHa);
});

test('POR ZONA: zona onde o base já passou da meta não recebe complemento', () => {
  const r = complementarPorZona(
    [{ idZona: 'a', baseDoseKgHa: 2000 }, { idZona: 'b', baseDoseKgHa: 100 }],
    { metaKgHa: 200, baseGarantiaPct: 12, compGarantiaPct: 45 },
  );
  assert.equal(r[0].doseCompKgHa, 0, 'zona saturada não leva mais nada');
  assert.ok(r[0].avisos.length > 0);
  assert.ok(r[1].doseCompKgHa > 0);
});



test('garantiaDe devolve 0 quando o nutriente não foi declarado', () => {
  const map = { categoria: 'fertilizante', garantias: { n: 11, p2o5: 52 } };
  assert.equal(garantiaDe(map, 'n'), 11);
  assert.equal(garantiaDe(map, 'k2o'), 0, 'ausente não pode virar NaN');
  assert.equal(garantiaDe({ categoria: 'fertilizante' }, 'n'), 0);
});

test('complementação é só para fertilizante mineral (regra 12.5)', () => {
  assert.equal(podeComplementar('fertilizante'), true);
  for (const c of ['corretivo', 'gesso', 'esterco', 'composto', 'semente', 'personalizado']) {
    assert.equal(podeComplementar(c), false, `${c} não complementa`);
  }
});

test('todo nutriente da lista tem rótulo (a UI monta o seletor a partir dela)', () => {
  for (const n of NUTRIENTES) assert.ok(ROTULO_NUTRIENTE[n], `sem rótulo: ${n}`);
});

// ── PREÇO: unidade por categoria e formato contábil (v2.41.0) ───────────────
//
// O preço passou a ser digitado por TONELADA em tudo que se compra a granel, e
// segue por quilo na semente. O risco aqui é de três zeros: cadastro antigo
// lido como se já fosse por tonelada, ou preço por tonelada entrando como
// custo por quilo na prescrição. Os dois erram por 1000× sem nada na tela
// denunciando.

test('semente é a única categoria cotada por quilo', () => {
  assert.equal(unidadePreco('semente'), 'kg');
  for (const c of ['fertilizante', 'corretivo', 'gesso', 'esterco', 'composto', 'personalizado']) {
    assert.equal(unidadePreco(c), 't', `${c} se compra por tonelada`);
  }
});

test('CADASTRO ANTIGO (sem precoUnidade) é R$/kg: 0,35 vira 350,00/t', () => {
  const calcario = { categoria: 'corretivo', precoMedio: 0.35 };
  assert.equal(precoNaUnidade(calcario, 't'), 350, 'ler como se já fosse /t deixaria o calcário a R$ 0,35 a tonelada');
  assert.equal(precoNaUnidade(calcario, 'kg'), 0.35);
});

test('0,35 × 1000 não pode chegar à tela como 350,00000000000006', () => {
  assert.equal(precoNaUnidade({ categoria: 'corretivo', precoMedio: 0.35 }, 't'), 350);
  assert.equal(fmtMoeda(precoNaUnidade({ categoria: 'corretivo', precoMedio: 0.35 }, 't')), '350,00');
});

test('cadastro novo já vem marcado — nada é convertido duas vezes', () => {
  const c = { categoria: 'corretivo', precoMedio: 350, precoUnidade: 't' };
  assert.equal(precoNaUnidade(c, 't'), 350, 'reabrir o cadastro não pode multiplicar de novo');
  assert.equal(precoNaUnidade(c, 'kg'), 0.35, 'é este número que vira custo numa prescrição em kg/ha');
  // idempotência: gravar o que a tela mostra e reler tem de dar o mesmo.
  const regravado = { ...c, precoMedio: precoNaUnidade(c, 't') };
  assert.equal(precoNaUnidade(regravado, 't'), 350);
});

test('semente ida e volta continua em quilo', () => {
  const s = { categoria: 'semente', precoMedio: 12.5, precoUnidade: 'kg' };
  assert.equal(precoNaUnidade(s, 'kg'), 12.5);
  assert.equal(precoNaUnidade(s, 't'), 12500);
});

test('sem preço não inventa zero', () => {
  assert.equal(precoNaUnidade({ categoria: 'corretivo' }, 't'), undefined);
  assert.equal(precoNaUnidade({ categoria: 'corretivo', precoMedio: NaN }, 't'), undefined);
  assert.equal(precoNaUnidade({ categoria: 'corretivo', precoMedio: Infinity }, 't'), undefined);
  assert.equal(precoNaUnidade({ categoria: 'corretivo', precoMedio: 0 }, 't'), 0, 'zero é um preço, não uma ausência');
});

test('fmtMoeda: padrão contábil, sempre duas casas', () => {
  assert.equal(fmtMoeda(350), '350,00');
  assert.equal(fmtMoeda(1234.5), '1.234,50');
  assert.equal(fmtMoeda(1234567.891), '1.234.567,89');
  assert.equal(fmtMoeda(0.35), '0,35');
  assert.equal(fmtMoeda(0), '0,00');
  assert.equal(fmtMoeda(NaN), '');
});

test('lerMoeda: com vírgula, o ponto é milhar', () => {
  assert.equal(lerMoeda('1.234,56'), 1234.56);
  assert.equal(lerMoeda('1.234.567,89'), 1234567.89);
  assert.equal(lerMoeda('R$ 1.250,00'), 1250);
  assert.equal(lerMoeda('350,'), 350, 'meio da digitação não pode virar NaN');
  assert.equal(lerMoeda('-1.234,50'), -1234.5);
});

test('lerMoeda: sem vírgula, ponto com 1–2 casas é decimal; o resto é milhar', () => {
  assert.equal(lerMoeda('0.35'), 0.35, 'teclado numérico digita ponto');
  assert.equal(lerMoeda('1.5'), 1.5);
  assert.equal(lerMoeda('1.234'), 1234, 'preço de três decimais não existe em nota');
  assert.equal(lerMoeda('1.234.567'), 1234567);
  assert.equal(lerMoeda('350.'), 350);
  assert.equal(lerMoeda('350'), 350);
});

test('lerMoeda: campo vazio é ausência de preço, não zero', () => {
  assert.equal(lerMoeda(''), undefined);
  assert.equal(lerMoeda('   '), undefined);
  assert.equal(lerMoeda(','), undefined);
  assert.equal(lerMoeda('-'), undefined);
  assert.equal(lerMoeda('abc'), undefined);
  assert.equal(lerMoeda('0'), 0);
});

test('o que o campo mostra é o que fica gravado (centavo)', () => {
  assert.equal(arredMoeda(lerMoeda('1.234,567')), 1234.57);
  assert.equal(arredMoeda(undefined), undefined);
  // ida e volta pela tela é estável: formatar → reler → formatar não muda nada.
  for (const v of [350, 1234.56, 0.35, 0, 1234567.89]) {
    assert.equal(fmtMoeda(arredMoeda(lerMoeda(fmtMoeda(v)))), fmtMoeda(v), `instável em ${v}`);
  }
});

test('PONTA A PONTA: R$ 350,00/t vira custo de R$ 0,35 por kg na prescrição', () => {
  // O formulário grava o que foi digitado; a prescrição em kg/ha pede o custo
  // por quilo, e a em t/ha pede por tonelada.
  const gravado = { categoria: 'corretivo', precoMedio: arredMoeda(lerMoeda('350,00')), precoUnidade: 't' };
  assert.equal(precoNaUnidade(gravado, 'kg'), 0.35);
  assert.equal(precoNaUnidade(gravado, 't'), 350);
  // 12 t/ha em 100 ha = 1.200 t → o custo tem de dar o mesmo pelos dois lados.
  assert.equal(1200 * precoNaUnidade(gravado, 't'), 1_200_000 * precoNaUnidade(gravado, 'kg'));
});
