// Testes do IAM (lógica pura: matriz de permissões + ponte com as capacidades
// antigas). Roda: `npm run teste:iam`.
import assert from 'node:assert/strict';
import {
  MATRIZ_PADRAO, CAP_PARA_PERM, permissoesEfetivas, temPermissao, contarPermissoes,
} from '../src/lib/iam/permissoes.ts';
import { CATEGORIAS, PAPEIS, MODULOS, ACOES, chavePerm } from '../src/lib/iam/tipos.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

t('vocabulário completo (categorias, papéis, módulos, ações)', () => {
  assert.equal(CATEGORIAS.length, 9, '9 categorias do documento');
  assert.ok(PAPEIS.some(p => p.id === 'leitor'), 'papel Somente leitura');
  assert.ok(PAPEIS.some(p => p.id === 'custom'), 'papel Personalizado');
  assert.equal(ACOES.length, 8, 'visualizar/criar/editar/excluir/exportar/importar/aprovar/administrar');
  assert.ok(MODULOS.length >= 12);
});

t('owner tem tudo; leitor não altera nada', () => {
  const owner = MATRIZ_PADRAO.owner;
  for (const m of MODULOS) for (const a of ACOES) {
    assert.equal(owner[chavePerm(m.id, a.id)], true, `owner deveria ter ${m.id}.${a.id}`);
  }
  const leitor = MATRIZ_PADRAO.leitor;
  for (const m of MODULOS) {
    assert.ok(!leitor[chavePerm(m.id, 'excluir')], 'leitor não exclui');
    assert.ok(!leitor[chavePerm(m.id, 'criar')], 'leitor não cria');
  }
  assert.ok(leitor[chavePerm('fertilidade', 'visualizar')], 'leitor visualiza');
});

t('admin faz tudo, menos administrar usuários', () => {
  const a = MATRIZ_PADRAO.admin;
  assert.equal(a['usuarios.administrar'], false);
  assert.equal(a['cadastro.excluir'], true);
});

t('operador coleta mas não mexe em recomendação', () => {
  const o = MATRIZ_PADRAO.operador;
  assert.equal(o['amostragem.criar'], true);
  assert.ok(!o['recomendacoes.editar'], 'operador não edita recomendação');
  assert.equal(o['cadastro.visualizar'], true, 'precisa ver o cadastro para navegar');
});

t('papel custom nasce sem nenhuma permissão', () => {
  assert.equal(contarPermissoes(MATRIZ_PADRAO.custom), 0);
});

t('exceção do usuário SOBREPÕE o padrão do papel', () => {
  const efet = permissoesEfetivas('operador', { 'recomendacoes.editar': true, 'amostragem.criar': false });
  assert.equal(temPermissao(efet, 'recomendacoes', 'editar'), true, 'exceção concede');
  assert.equal(temPermissao(efet, 'amostragem', 'criar'), false, 'exceção revoga');
  assert.equal(temPermissao(efet, 'compactacao', 'criar'), true, 'resto segue o papel');
});

t('ponte: toda capacidade antiga tem equivalente novo', () => {
  const antigas = ['cadastro','excluirProdutor','amostragem','importarLaudo','fertilidade','ndvi',
    'recomendacoes','biblioteca','relatorios','zonasUnificar','zonasReclassificar','zonasDividir','zonasSalvar'];
  for (const c of antigas) {
    assert.ok(CAP_PARA_PERM[c], `falta mapear a capacidade "${c}"`);
    const [mod, ac] = CAP_PARA_PERM[c].split('.');
    assert.ok(MODULOS.some(m => m.id === mod), `módulo inválido em ${c}: ${mod}`);
    assert.ok(ACOES.some(a => a.id === ac), `ação inválida em ${c}: ${ac}`);
  }
});

t('comportamento ANTIGO preservado: agrônomo mantinha ndvi/recomendações/relatórios', () => {
  const ag = MATRIZ_PADRAO.agronomo;
  assert.equal(ag[CAP_PARA_PERM.ndvi], true);
  assert.equal(ag[CAP_PARA_PERM.recomendacoes], true);
  assert.equal(ag[CAP_PARA_PERM.relatorios], true);
  assert.equal(ag[CAP_PARA_PERM.zonasSalvar], true);
  // e o que ele NÃO tinha continua negado
  assert.ok(!ag[CAP_PARA_PERM.cadastro], 'agrônomo não editava cadastro');
  assert.ok(!ag[CAP_PARA_PERM.importarLaudo], 'agrônomo não importava laudo');
});

t('comportamento ANTIGO preservado: operador tinha amostragem e nada mais', () => {
  const op = MATRIZ_PADRAO.operador;
  assert.equal(op[CAP_PARA_PERM.amostragem], true);
  for (const c of ['cadastro','importarLaudo','fertilidade','ndvi','recomendacoes','biblioteca','relatorios']) {
    assert.ok(!op[CAP_PARA_PERM[c]], `operador não deveria ter ${c}`);
  }
});

t('produtor (portal) só visualiza/exporta', () => {
  const p = MATRIZ_PADRAO.produtor;
  assert.equal(p['relatorios.visualizar'], true);
  assert.ok(!p['fertilidade.criar'], 'produtor não processa');
  assert.ok(!p['cadastro.editar'], 'produtor não edita cadastro');
});

t('nenhum papel comum administra usuários', () => {
  for (const papel of ['agronomo', 'operador', 'produtor', 'prestador', 'leitor', 'custom']) {
    assert.ok(!MATRIZ_PADRAO[papel]['usuarios.administrar'], `${papel} não administra usuários`);
  }
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
