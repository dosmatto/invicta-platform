// Testes do IAM (lógica pura: matriz de permissões + ponte com as capacidades
// antigas). Roda: `npm run teste:iam`.
import assert from 'node:assert/strict';
import {
  MATRIZ_PADRAO, CAP_PARA_PERM, permissoesEfetivas, temPermissao, contarPermissoes,
  poderesDeAcesso, poderesSobreUsuario,
} from '../src/lib/iam/permissoes.ts';
import { CATEGORIAS, PAPEIS, MODULOS, ACOES, chavePerm } from '../src/lib/iam/tipos.ts';
import { clientesDoProdutor, clienteIdDoProdutor, produtorSemVinculo } from '../src/lib/iam/vinculoProdutor.ts';
import { statusEfetivo, podeEntrar, precisaConfirmarNaNuvem } from '../src/lib/iam/acessoEfetivo.ts';

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

// ── Poderes na Central de Acessos (quem gera convite e quem aprova) ─────────
// Checagem de permissão como a tela faz: matriz do papel, sem exceção própria.
const comoPapel = papel => (modulo, acao) =>
  papel === 'owner' ? true : MATRIZ_PADRAO[papel][`${modulo}.${acao}`] === true;

t('ADMIN gera convite e aprova cadastro (era só o Owner)', () => {
  const p = poderesDeAcesso(comoPapel('admin'));
  assert.equal(p.convidar, true, 'admin gera/renova/cancela convite');
  assert.equal(p.aprovar, true, 'admin aprova quem está pendente');
  assert.equal(p.editar, true, 'admin edita papel, vínculos e permissões');
  assert.equal(p.algum, true);
});

t('ADMIN continua fora do que é do dono', () => {
  const p = poderesDeAcesso(comoPapel('admin'));
  assert.equal(p.administrar, false, 'empresa/planos, perfis e matriz são do Owner');
  assert.equal(p.excluir, false, 'remover acesso é do Owner');
});

t('OWNER pode tudo na Central de Acessos', () => {
  const p = poderesDeAcesso(comoPapel('owner'));
  for (const k of ['convidar', 'aprovar', 'editar', 'excluir', 'administrar']) {
    assert.equal(p[k], true, `owner deveria poder ${k}`);
  }
});

t('papel sem acesso a usuários não convida nem aprova', () => {
  for (const papel of ['agronomo', 'operador', 'produtor', 'prestador', 'leitor']) {
    const p = poderesDeAcesso(comoPapel(papel));
    assert.equal(p.convidar, false, `${papel} não gera convite`);
    assert.equal(p.aprovar, false, `${papel} não aprova`);
    assert.equal(p.algum, false, `${papel} vê a tela só de leitura`);
  }
});

t('TRAVA DO DONO: admin não edita nem remove o registro do Owner', () => {
  const admin = poderesDeAcesso(comoPapel('admin'));
  const sobreOwner = poderesSobreUsuario(admin, 'owner', false);
  assert.deepEqual(sobreOwner, { podeEditar: false, podeExcluir: false },
    'senão o admin rebaixaria o dono — PAPEIS_ATRIBUIVEIS não tem "owner" de volta');
});

t('o próprio Owner mexe no registro dele', () => {
  const owner = poderesDeAcesso(comoPapel('owner'));
  assert.deepEqual(poderesSobreUsuario(owner, 'owner', true),
    { podeEditar: true, podeExcluir: true });
});

t('admin edita usuário comum normalmente (e não o remove)', () => {
  const admin = poderesDeAcesso(comoPapel('admin'));
  assert.deepEqual(poderesSobreUsuario(admin, 'agronomo', false),
    { podeEditar: true, podeExcluir: false });
});

// ── Vínculo do produtor: os DOIS campos são a mesma pergunta ────────────────
t('CASO RELATADO: vínculo só no IAM (aba Vínculos/convite) libera o produtor', () => {
  // Cadastro aprovado com "1 prod" no cartão e clienteId vazio: o Portal lia só
  // o campo antigo e mostrava "Acesso ainda não vinculado".
  const reg = { clientesVinculados: ['cli_1'] };
  assert.deepEqual(clientesDoProdutor(reg), ['cli_1']);
  assert.equal(clienteIdDoProdutor(reg), 'cli_1');
  assert.equal(produtorSemVinculo('produtor', reg), false);
});

t('o campo ANTIGO tem preferência (foi escolha explícita de um cliente só)', () => {
  const reg = { clienteId: 'cli_antigo', clientesVinculados: ['cli_novo', 'cli_outro'] };
  assert.equal(clienteIdDoProdutor(reg), 'cli_antigo');
});

t('produtor sem vínculo nenhum é sinalizado (é o que trava a entrada)', () => {
  assert.equal(produtorSemVinculo('produtor', {}), true);
  assert.equal(produtorSemVinculo('produtor', { clientesVinculados: [] }), true);
  assert.equal(produtorSemVinculo('produtor', null), true);
  assert.equal(produtorSemVinculo('agronomo', {}), false, 'só vale para o papel produtor');
});

t('vínculo múltiplo: o Portal mostra o primeiro, o escopo enxerga todos', () => {
  const reg = { clientesVinculados: ['cli_1', 'cli_2'] };
  assert.equal(clienteIdDoProdutor(reg), 'cli_1');
  assert.deepEqual(clientesDoProdutor(reg), ['cli_1', 'cli_2']);
});

t('id vazio no meio da lista não vira vínculo fantasma', () => {
  assert.deepEqual(clientesDoProdutor({ clientesVinculados: ['', 'cli_2'] }), ['cli_2']);
});

// ── Status de acesso: a nuvem manda no acesso da própria pessoa ─────────────
t('CASO RELATADO: local diz "aguardando", nuvem diz "ativo" → entra', () => {
  // Ele gravou "aguardando" no próprio aparelho ao se cadastrar; a aprovação
  // aconteceu no aparelho do administrador. Sem consultar a nuvem, ficava preso.
  const st = statusEfetivo('aguardando_aprovacao', 'ativo');
  assert.equal(st, 'ativo');
  assert.equal(podeEntrar(st), true);
});

t('bloqueio de verdade continua bloqueando', () => {
  assert.equal(podeEntrar(statusEfetivo('ativo', 'bloqueado')), false, 'nuvem bloqueou depois');
  assert.equal(podeEntrar(statusEfetivo('aguardando_aprovacao', 'aguardando_aprovacao')), false);
  assert.equal(podeEntrar(statusEfetivo('ativo', 'rejeitado')), false);
});

t('sem resposta da nuvem (offline) vale o local', () => {
  assert.equal(statusEfetivo('ativo', undefined), 'ativo');
  assert.equal(podeEntrar(statusEfetivo('bloqueado', undefined)), false);
});

t('registro antigo sem status nenhum entra (regra que já valia)', () => {
  assert.equal(podeEntrar(undefined), true);
  assert.equal(podeEntrar(''), true);
});

t('só consulta a nuvem quando o local barraria — não gasta rede à toa', () => {
  assert.equal(precisaConfirmarNaNuvem('ativo'), false);
  assert.equal(precisaConfirmarNaNuvem(undefined), false);
  assert.equal(precisaConfirmarNaNuvem('aguardando_aprovacao'), true);
  assert.equal(precisaConfirmarNaNuvem('bloqueado'), true);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
