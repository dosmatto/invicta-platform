// Regras do convite (src/lib/iam/conviteRegras.ts) — o que decide quem consegue
// se cadastrar na plataforma. Roda: `npm run teste:convite-regras`.
//
// Trava as duas trocas que seriam desastrosas em direções opostas:
//   · link POR TIPO que se esgota no 1º cadastro → o resto do grupo fica de fora;
//   · convite INDIVIDUAL que sobrevive ao uso → o link vira acesso reaproveitável.
import assert from 'node:assert/strict';
import { statusAoVivo, podeUsar, aplicarUso } from '../src/lib/iam/conviteRegras.ts';

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

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
