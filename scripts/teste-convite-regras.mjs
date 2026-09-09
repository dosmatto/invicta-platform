// Regras do convite (src/lib/iam/conviteRegras.ts) — o que decide quem consegue
// se cadastrar na plataforma. Roda: `npm run teste:convite-regras`.
//
// Trava as duas trocas que seriam desastrosas em direções opostas:
//   · link POR TIPO que se esgota no 1º cadastro → o resto do grupo fica de fora;
//   · convite INDIVIDUAL que sobrevive ao uso → o link vira acesso reaproveitável.
import assert from 'node:assert/strict';
import { statusAoVivo, podeUsar, aplicarUso, acessoDoConvite, liberacaoDoConvite } from '../src/lib/iam/conviteRegras.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const AGORA = Date.parse('2026-07-29T12:00:00.000Z');
const emDias = d => new Date(AGORA + d * 86400_000).toISOString();
const individual = (extra = {}) => ({
  id: 'tok1', email: 'a@b.com', status: 'pendente',
  criadoEm: emDias(-1), criadoPor: 'admin', expiraEm: emDias(7), ...extra,
});
const tipo = (extra = {}) => individual({ email: '', multiuso: true, rotulo: 'Produtores', usos: 0, ...extra });

console.log('\nRegras do convite\n');

t('convite individual é CONSUMIDO no uso', () => {
  const depois = aplicarUso(individual(), 'Fulano@Email.com ', emDias(0));
  assert.equal(depois.status, 'usado');
  assert.equal(depois.usadoPor, 'fulano@email.com');   // normaliza
  assert.equal(podeUsar(depois, AGORA), false);
});

t('convite ABERTO (sem e-mail, não multiuso) é consumido em UM cadastro', () => {
  // O link individual sem e-mail: a pessoa informa o dela e o link se esgota.
  const depois = aplicarUso(individual({ email: '' }), 'produtor@x.com', emDias(0));
  assert.equal(depois.status, 'usado');
  assert.equal(depois.usadoPor, 'produtor@x.com');
  assert.equal(podeUsar(depois, AGORA), false);
});

t('LINK POR TIPO não se esgota — segue valendo para os próximos', () => {
  let c = tipo();
  c = aplicarUso(c, 'um@x.com', emDias(0));
  assert.equal(c.status, 'pendente');
  assert.equal(c.usos, 1);
  assert.equal(podeUsar(c, AGORA), true);
  c = aplicarUso(c, 'dois@x.com', emDias(0));
  assert.equal(c.usos, 2);
  assert.equal(podeUsar(c, AGORA), true, 'o link tem que continuar aberto');
});

t('aplicarUso não muta o convite original', () => {
  const orig = tipo();
  aplicarUso(orig, 'x@y.com', emDias(0));
  assert.equal(orig.usos, 0);
  assert.equal(orig.usadoPor, undefined);
});

t('validade vence sozinha na leitura — inclusive no link por tipo', () => {
  assert.equal(statusAoVivo(individual({ expiraEm: emDias(-1) }), AGORA), 'expirado');
  assert.equal(statusAoVivo(tipo({ expiraEm: emDias(-1) }), AGORA), 'expirado');
  assert.equal(podeUsar(tipo({ expiraEm: emDias(-1) }), AGORA), false);
});

t('cancelar derruba o link por tipo para todo mundo', () => {
  assert.equal(podeUsar(tipo({ status: 'cancelado' }), AGORA), false);
});

t('status já resolvido não é reescrito pela validade', () => {
  assert.equal(statusAoVivo(individual({ status: 'usado', expiraEm: emDias(-9) }), AGORA), 'usado');
  assert.equal(statusAoVivo(individual({ status: 'cancelado', expiraEm: emDias(-9) }), AGORA), 'cancelado');
});

// ── Acesso definido no convite (produtores/fazendas) ────────────────────────
t('acesso do convite vale quando o cadastro chegou sem vínculo', () => {
  const c = individual({ clientesVinculados: ['p1'], fazendasVinculadas: ['f1'] });
  const a = acessoDoConvite({}, c);
  assert.deepEqual(a.clientesVinculados, ['p1']);
  assert.deepEqual(a.fazendasVinculadas, ['f1']);
});

t('o que o cadastro trouxe tem preferência sobre o convite', () => {
  // A pessoa se cadastrou quando o convite ainda apontava para outro produtor:
  // vale o que ficou gravado no cadastro dela.
  const a = acessoDoConvite(
    { clientesVinculados: ['p9'] },
    individual({ clientesVinculados: ['p1'], fazendasVinculadas: ['f1'] }));
  assert.deepEqual(a.clientesVinculados, ['p9']);
  assert.deepEqual(a.fazendasVinculadas, ['f1'], 'fazenda cai para o convite, que é quem tem');
});

t('convite sem restrição não devolve vínculo nenhum', () => {
  const a = acessoDoConvite({}, individual());
  assert.deepEqual(a.clientesVinculados, []);
  assert.deepEqual(a.fazendasVinculadas, []);
  // Lista vazia é o sinal de "não mexa nos vínculos" na aprovação — nunca
  // pode virar um [] gravado por cima de quem já tinha acesso restrito.
});

t('sem cadastro e sem convite não quebra', () => {
  const a = acessoDoConvite(null, null);
  assert.deepEqual(a.clientesVinculados, []);
  assert.deepEqual(a.fazendasVinculadas, []);
});

t('link por tipo carrega o acesso para todos que o usarem', () => {
  const a = acessoDoConvite(undefined, tipo({ clientesVinculados: ['p1', 'p2'] }));
  assert.deepEqual(a.clientesVinculados, ['p1', 'p2']);
});

// ── Liberação automática (quem vem por link não passa por aprovação) ────────
t('o papel do CONVITE vence o "leitor" provisório que o cadastro trouxe', () => {
  // O cadastro que caiu na fila foi gravado leitor/interno porque a tela do
  // convite não sabia o que conceder. Usar o do cadastro daria à pessoa um
  // acesso MENOR do que o link prometia — liberar assim é pior que não liberar.
  const lib = liberacaoDoConvite(
    { papel: 'leitor', categoria: 'interno' },
    individual({ papel: 'produtor', categoria: 'produtor', perfilId: 'perf1' }),
    AGORA);
  assert.equal(lib.papel, 'produtor');
  assert.equal(lib.categoria, 'produtor');
  assert.equal(lib.perfilId, 'perf1');
});

t('convite CANCELADO não libera ninguém — é a defesa de quem administra', () => {
  assert.equal(liberacaoDoConvite({}, individual({ status: 'cancelado' }), AGORA), null);
  assert.equal(liberacaoDoConvite({}, null, AGORA), null, 'sem convite não dá para saber o que conceder');
});

t('convite USADO ou VENCIDO ainda libera quem ficou na fila', () => {
  // O individual vira 'usado' no próprio cadastro que estamos liberando, e a
  // fila antiga é varrida depois da validade vencer. Barrar aqui seria deixar
  // gente presa para sempre.
  assert.ok(liberacaoDoConvite({}, individual({ status: 'usado', papel: 'produtor' }), AGORA));
  assert.ok(liberacaoDoConvite({}, individual({ expiraEm: emDias(-30), papel: 'produtor' }), AGORA));
});

t('papel privilegiado NUNCA sai de um link', () => {
  assert.equal(liberacaoDoConvite({}, individual({ papel: 'owner' }), AGORA), null);
});

t('sem papel no convite, cai em leitor — nunca num acesso maior por descuido', () => {
  const lib = liberacaoDoConvite({}, individual(), AGORA);
  assert.equal(lib.papel, 'leitor');
  assert.equal(lib.categoria, undefined, 'sem categoria o chamador deriva do papel');
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
