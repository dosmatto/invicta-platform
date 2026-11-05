// Testes do MODO APRESENTAÇÃO (lib/modoApresentacao.ts) — owner/admin abrem a
// plataforma como o produtor vê, com o próprio login.
//
// O que a regra tem de garantir:
//   · só liga para owner/admin (ou a bancada sem login); estado que sobrou na
//     aba de outro papel é ignorado — ninguém ganha acesso com o modo;
//   · o papel efetivo é 'produtor' e o registro efetivo é o do produtor
//     vinculado ao cliente (vínculos, ajustes da matriz, plano), com a
//     identidade/status do admin;
//   · o escopo é o que o produtor veria: as fazendas dele, a do condomínio
//     marcada no registro dele, e nada de outro cliente.
// Roda: `npm run teste:modo-apresentacao`
import assert from 'node:assert/strict';
import {
  podeApresentar, lerEstado, apresentacaoValida, papelEfetivo, produtorDoCliente, montarEstado, registroEfetivo, acaoDeEscrita,
} from '../src/lib/modoApresentacao.ts';
import { podeVerTalhao } from '../src/lib/precisionfarm/acessoTalhao.ts';
import { fazendasVisiveis } from '../src/lib/iam/escopoFazendas.ts';
import { clientesDoProdutor } from '../src/lib/iam/vinculoProdutor.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// ── Fixtures ────────────────────────────────────────────────────────────────
// Frederico (C1) tem a Figueira (F1) e enxerga a Barrinha (F3) do Ricardo (C2)
// por condomínio. Ricardo (C2) tem Barrinha (F3) e Sede (F4). C3 não tem login.
const FAZ = [
  { id: 'F1', clienteId: 'C1' },
  { id: 'F2', clienteId: 'C1' },
  { id: 'F3', clienteId: 'C2' },
  { id: 'F4', clienteId: 'C2' },
  { id: 'F5', clienteId: 'C3' },
];
const TAL = [
  { id: 'T1', fazendaId: 'F1' }, { id: 'T2', fazendaId: 'F2' }, { id: 'T3', fazendaId: 'F3' },
  { id: 'T4', fazendaId: 'F4' }, { id: 'T5', fazendaId: 'F5' },
];
const ADMIN = { id: 'jhon@invicta.agr.br', email: 'jhon@invicta.agr.br', papel: 'admin', status: 'ativo' };
const FRED = {
  id: 'fred@x.com', email: 'fred@x.com', papel: 'produtor', status: 'ativo', nome: 'Frederico',
  clienteId: 'C1', planoId: 'basico', fazendasVinculadas: ['F1', 'F3'],
  permissoes: { 'amostragem.visualizar': false },
};
const FRED_ANTIGO = { id: 'fred-old@x.com', email: 'fred-old@x.com', papel: 'produtor', status: 'bloqueado', clienteId: 'C1', planoId: 'completo' };
const RICARDO = { id: 'ric@x.com', email: 'ric@x.com', papel: 'produtor', clientesVinculados: ['C2'], planoId: 'intermediario' };
const AGRO = { id: 'agro@x.com', email: 'agro@x.com', papel: 'agronomo', clientesVinculados: ['C2'] };
const REGS = [ADMIN, FRED, FRED_ANTIGO, RICARDO, AGRO];

/** Talhões que o registro enxerga, pela regra do servidor (podeVerTalhao). */
const talhoesVistos = reg => TAL.filter(tl => podeVerTalhao(reg, tl, FAZ)).map(tl => tl.id).sort();
/** Fazendas que o app lista (store.getFazendas → escopoFazendas). */
const fazendasVistas = reg => fazendasVisiveis(FAZ, new Set(clientesDoProdutor(reg)),
  reg.fazendasVinculadas?.length ? new Set(reg.fazendasVinculadas) : null).map(f => f.id).sort();

console.log('Quem pode ligar');
t('owner e admin podem; com login, os demais papéis não', () => {
  assert.equal(podeApresentar('owner', true), true);
  assert.equal(podeApresentar('admin', true), true);
  for (const p of ['agronomo', 'operador', 'produtor', 'prestador', 'leitor', 'custom', 'editor', 'viewer', null, undefined]) {
    assert.equal(podeApresentar(p, true), false, String(p));
  }
});
t('bancada sem login (sem papéis) pode', () => assert.equal(podeApresentar(null, false), true));

console.log('Estado na aba');
t('lixo, vazio ou sem cliente = desligado', () => {
  for (const b of [null, '', 'x', '{}', '[]', 'null', JSON.stringify({ clienteId: '' }), JSON.stringify({ clienteId: 3 })]) {
    assert.equal(lerEstado(b), null, String(b));
  }
});
t('estado válido é normalizado', () => {
  assert.deepEqual(lerEstado(JSON.stringify({ clienteId: 'C1', nome: 'FRED', planoId: '', produtorEmail: 'fred@x.com' })),
    { clienteId: 'C1', nome: 'FRED', planoId: null, produtorEmail: 'fred@x.com' });
});

console.log('Papel efetivo');
const EST_C1 = montarEstado({ id: 'C1', nome: 'FREDERICO' }, REGS);
t('admin/owner com o modo viram produtor', () => {
  assert.equal(papelEfetivo('admin', EST_C1, true), 'produtor');
  assert.equal(papelEfetivo('owner', EST_C1, true), 'produtor');
  assert.equal(papelEfetivo(null, EST_C1, false), 'produtor');   // bancada
});
t('sem o modo, o papel é o de verdade', () => {
  assert.equal(papelEfetivo('admin', null, true), 'admin');
  assert.equal(papelEfetivo(null, null, false), null);
});
t('estado que sobrou na aba NÃO vale para outro papel (nunca dá acesso)', () => {
  for (const p of ['agronomo', 'operador', 'prestador', 'leitor', 'produtor']) {
    assert.equal(apresentacaoValida(EST_C1, p, true), false, p);
    assert.equal(papelEfetivo(p, EST_C1, true), p, p);
  }
  assert.equal(papelEfetivo(null, EST_C1, true), null);   // logado sem papel continua bloqueado
});

console.log('Nenhum botão de escrita');
t('só ver e baixar passam; criar/editar/excluir/importar/aprovar não', () => {
  assert.equal(acaoDeEscrita('visualizar'), false);
  assert.equal(acaoDeEscrita('exportar'), false);
  for (const a of ['criar', 'editar', 'excluir', 'importar', 'aprovar', 'administrar', undefined]) assert.equal(acaoDeEscrita(a), true, String(a));
});

console.log('Produtor do cliente e plano');
t('o produtor ATIVO vinculado ganha do bloqueado', () => assert.equal(produtorDoCliente(REGS, 'C1')?.email, 'fred@x.com'));
t('vínculo pelo IAM (clientesVinculados) também conta', () => assert.equal(produtorDoCliente(REGS, 'C2')?.email, 'ric@x.com'));
t('agrônomo vinculado não é "produtor do cliente"', () => assert.equal(produtorDoCliente([AGRO], 'C2'), null));
t('cliente sem login de produtor = null', () => assert.equal(produtorDoCliente(REGS, 'C3'), null));
t('plano: o do registro do produtor', () => {
  assert.equal(EST_C1.planoId, 'basico');
  assert.equal(EST_C1.produtorEmail, 'fred@x.com');
});
t('plano: o ?plano= do preview vence; null = sem plano', () => {
  assert.equal(montarEstado({ id: 'C1', nome: 'F' }, REGS, 'completo').planoId, 'completo');
  assert.equal(montarEstado({ id: 'C1', nome: 'F' }, REGS, null).planoId, null);
});
t('sem produtor: nenhum plano (tudo liberado, como o preview)', () => {
  const e = montarEstado({ id: 'C3', nome: 'SEM LOGIN' }, REGS);
  assert.equal(e.planoId, null);
  assert.equal(e.produtorEmail, null);
});

console.log('Registro efetivo e escopo');
const REG_C1 = registroEfetivo(ADMIN, EST_C1, REGS);
t('identidade e status continuam os do admin; papel vira produtor', () => {
  assert.equal(REG_C1.email, 'jhon@invicta.agr.br');
  assert.equal(REG_C1.status, 'ativo');
  assert.equal(REG_C1.papel, 'produtor');
});
t('ajuste por usuário e plano vêm do produtor', () => {
  assert.deepEqual(REG_C1.permissoes, { 'amostragem.visualizar': false });
  assert.equal(REG_C1.planoId, 'basico');
});
t('escopo = o do produtor: a fazenda dele + a do condomínio, nada além', () => {
  assert.deepEqual(fazendasVistas(REG_C1), fazendasVistas(FRED));
  assert.deepEqual(fazendasVistas(REG_C1), ['F1', 'F3']);
  assert.deepEqual(talhoesVistos(REG_C1), talhoesVistos(FRED));
  assert.deepEqual(talhoesVistos(REG_C1), ['T1', 'T3']);
});
t('o admin sem o modo vê tudo (o modo só restringe)', () => assert.deepEqual(talhoesVistos(ADMIN), ['T1', 'T2', 'T3', 'T4', 'T5']));
t('cliente sem login: só as fazendas do próprio cliente', () => {
  const reg = registroEfetivo(ADMIN, montarEstado({ id: 'C3', nome: 'X' }, REGS), REGS);
  assert.deepEqual(talhoesVistos(reg), ['T5']);
  assert.deepEqual(reg.permissoes, {});
  assert.equal(reg.planoId, undefined);
});
t('o cliente escolhido é o principal do portal, sem perder os outros vínculos', () => {
  const ric2 = { ...RICARDO, clienteId: 'C2', clientesVinculados: ['C2', 'C3'] };
  const reg = registroEfetivo(ADMIN, montarEstado({ id: 'C3', nome: 'X' }, [ric2]), [ric2]);
  assert.equal(clientesDoProdutor(reg)[0], 'C3');
  assert.deepEqual(talhoesVistos(reg), ['T3', 'T4', 'T5']);
});
t('talhoesVinculados do produtor restringem também no modo', () => {
  const fred = { ...FRED, talhoesVinculados: ['T3'] };
  const reg = registroEfetivo(ADMIN, montarEstado({ id: 'C1', nome: 'F' }, [fred]), [fred]);
  assert.deepEqual(talhoesVistos(reg), ['T3']);
});
t('produtor apagado depois de ligar: cai no cliente só, sem os vínculos antigos', () => {
  const reg = registroEfetivo(ADMIN, EST_C1, [ADMIN]);
  assert.deepEqual(talhoesVistos(reg), ['T1', 'T2']);
  assert.deepEqual(reg.permissoes, {});
});
t('bancada (sem registro real): registro só com o produtor', () => {
  const reg = registroEfetivo(null, EST_C1, REGS);
  assert.equal(reg.papel, 'produtor');
  assert.equal(reg.email, undefined);
  assert.deepEqual(talhoesVistos(reg), ['T1', 'T3']);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
