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
  complementarNutriente, nutrienteFornecido, garantiaDe, podeComplementar,
  NUTRIENTES, ROTULO_NUTRIENTE,
} from '../src/lib/insumos.ts';

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
