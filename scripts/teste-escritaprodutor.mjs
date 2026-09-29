// Testes do que o PRODUTOR pode gravar (espelho no cliente da RLS
// app_kv_produtor_* de docs/seguranca-rls.sql). Roda: `npm run teste:escritaprodutor`.
import assert from 'node:assert/strict';
import {
  talhaoDoMapa, talhaoDoRegistro, colecaoGravavelProdutor, produtorPodeGravar,
} from '../src/lib/iam/escritaProdutor.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const MEUS = new Set(['tA', 'tB']);

t('talhão do mapa: compactação, composição e índices do satélite', () => {
  assert.equal(talhaoDoMapa('compactacao__tA__imp1__0-10'), 'tA');
  assert.equal(talhaoDoMapa('composicao__tA__c1'), 'tA');
  assert.equal(talhaoDoMapa('tA__ndvi__2026-09-01'), 'tA');
  assert.equal(talhaoDoMapa('tA__ndvicbers__2026-09-01'), 'tA');
});

t('mapa fora da regra não tem talhão gravável (fertilidade, CE, relevo, MDE)', () => {
  assert.equal(talhaoDoMapa('tA__imp1__krigagem__pH'), null);
  assert.equal(talhaoDoMapa('condutividade__tA__v1'), null);
  assert.equal(talhaoDoMapa('mdecam__tA__x'), null);
  assert.equal(talhaoDoMapa('tA__'), null, 'prefixo do talhão inteiro apagaria a fertilidade junto');
  assert.equal(talhaoDoMapa('compactacao__'), null, 'prefixo sem talhão');
  assert.equal(talhaoDoMapa(''), null);
});

t('prefixo de exclusão da compactação é do talhão dele', () => {
  assert.equal(talhaoDoMapa('compactacao__tA__imp1__'), 'tA');
});

t('talhão do registro pelo talhaoId do documento', () => {
  assert.equal(talhaoDoRegistro('inv_compactacao', 'i1', { talhaoId: 'tA' }), 'tA');
  assert.equal(talhaoDoRegistro('inv_grades_compact', 'g1', { talhaoId: 'tB' }), 'tB');
  assert.equal(talhaoDoRegistro('inv_composicoes', 'c1', { talhaoId: 'tA' }), 'tA');
  assert.equal(talhaoDoRegistro('inv_compactacao', 'i1', {}), null, 'sem talhaoId não passa');
  assert.equal(talhaoDoRegistro('inv_compactacao', 'i1', undefined), null);
});

t('cenas rejeitadas: o item_id é o talhão (exclusão chega sem dados)', () => {
  assert.equal(talhaoDoRegistro('inv_cenas_estado', 'tA', { talhaoId: 'tA' }), 'tA');
  assert.equal(talhaoDoRegistro('inv_cenas_estado', 'tA'), 'tA');
  assert.equal(talhaoDoRegistro('inv_cenas_estado', ''), null);
  assert.equal(talhaoDoRegistro('inv_cenas_estado', 'tX', { talhaoId: 'tA' }), null, 'item_id alheio com talhaoId meu');
});

t('coleções de consulta não são graváveis pelo produtor', () => {
  for (const c of ['inv_talhoes', 'inv_clientes', 'inv_fazendas', 'inv_lab', 'inv_grades',
    'inv_condutividade', 'inv_prescricoes', 'inv_bib_equacoes', 'inv_permissoes', 'inv_planos', 'inv_etiqueta_cfg', '__meta__']) {
    assert.equal(colecaoGravavelProdutor(c), false, c);
    assert.equal(produtorPodeGravar(c, 'x', { talhaoId: 'tA' }, MEUS), false, c);
  }
});

t('compactação e satélite: só nos talhões dele', () => {
  assert.equal(produtorPodeGravar('inv_compactacao', 'i1', { talhaoId: 'tA' }, MEUS), true);
  assert.equal(produtorPodeGravar('inv_compactacao', 'i1', { talhaoId: 'tX' }, MEUS), false);
  assert.equal(produtorPodeGravar('inv_mapas_fert', 'compactacao__tB__i__0-10', null, MEUS), true);
  assert.equal(produtorPodeGravar('inv_mapas_fert', 'compactacao__tX__i__0-10', null, MEUS), false);
  assert.equal(produtorPodeGravar('inv_mapas_fert', 'tX__ndvi__d', null, MEUS), false);
  assert.equal(produtorPodeGravar('inv_mapas_fert', 'tA__pH', null, MEUS), false, 'fertilidade é consulta');
  assert.equal(produtorPodeGravar('inv_cenas_estado', 'tX', null, MEUS), false);
});

t('produtor sem talhão no escopo não grava nada por talhão', () => {
  assert.equal(produtorPodeGravar('inv_compactacao', 'i1', { talhaoId: 'tA' }, new Set()), false);
});

t('IAM segue com as regras próprias do banco (o cliente não barra)', () => {
  for (const c of ['inv_papeis', 'inv_convites', 'inv_auditoria']) {
    assert.equal(colecaoGravavelProdutor(c), true, c);
    assert.equal(produtorPodeGravar(c, 'x', {}, new Set()), true, c);
  }
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
