// Edições por registro no sincronismo (src/lib/edicoesSync.ts).
// Roda: `npm run teste:edicoes`.
//
// O caso real (31/10/2026): um navegador com a cópia local de dias antes abriu
// a AP, o boot passou dos 12 s, e a primeira gravação de talhão da sessão subiu
// a lista local INTEIRA — 1102 talhões regravados num envio só. O limite novo do
// MCABV 08 (gravado por outra pessoa depois daquela cópia) voltou ao antigo.
import assert from 'node:assert/strict';
import { mapaPorId, calcularEdicoes, mesclarComEdicoes, mesclarPorId, idsDoEnvio, idsParaJuncao, confirmarEnvio, podarIguaisANuvem } from '../src/lib/edicoesSync.ts';

let ok = 0, fail = 0;
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
};

// Cópia LOCAL velha deste aparelho (tirada antes da troca de limite do MCABV 08).
const mcabv08Velho = { id: 'mcabv08', nome: 'MCABV 08', geojson: 'LIMITE-ANTIGO', geoVersao: 3 };
const mcabv08Novo  = { id: 'mcabv08', nome: 'MCABV 08', geojson: 'LIMITE-NOVO', geoVersao: 4 };
const mcaov01      = { id: 'mcaov01', nome: 'MCAOV 01', geojson: 'A', geoVersao: 1 };
const mcaov01Edit  = { ...mcaov01, zonasGeojson: 'ZONAS-DA-GRADE' };
const outro        = { id: 'outro', nome: 'OUTRO', geojson: 'B', geoVersao: 2 };

const localVelho = [mcabv08Velho, mcaov01, outro];
const nuvem      = [mcabv08Novo, mcaov01, outro];   // outra pessoa já trocou o limite

console.log('\nEdições por registro × cópia local velha\n');

t('31/10: 1º envio sem espelho sobe SÓ o talhão editado, não a lista inteira', () => {
  const base = mapaPorId(localVelho);                      // foto do início do boot
  const depois = [mcabv08Velho, mcaov01Edit, outro];       // usuário mexeu só no MCAOV 01
  const ids = calcularEdicoes(base, mapaPorId(depois), null);
  assert.deepEqual(ids, { up: ['mcaov01'], del: [] });
  const envio = idsDoEnvio(mapaPorId(depois), undefined, ids);   // boot ainda rodando: sem espelho
  assert.deepEqual(envio.upsert, ['mcaov01'], 'o MCABV 08 velho NÃO pode subir');
  assert.equal(envio.porRegistro, true);
});

t('boot com pendência: a nuvem vence no MCABV 08, o local vence no MCAOV 01', () => {
  const final = mesclarComEdicoes(nuvem, [mcabv08Velho, mcaov01Edit, outro], { up: ['mcaov01'], del: [] });
  const porId = Object.fromEntries(final.map(r => [r.id, r]));
  assert.equal(porId.mcabv08.geojson, 'LIMITE-NOVO');
  assert.equal(porId.mcaov01.zonasGeojson, 'ZONAS-DA-GRADE');
  assert.equal(final.length, 3);
});

t('o modo antigo (local vence em tudo) é o que trazia o limite antigo de volta', () => {
  const final = mesclarPorId(nuvem, localVelho);
  assert.equal(final.find(r => r.id === 'mcabv08').geojson, 'LIMITE-ANTIGO');
});

t('diff contra espelho velho também fica restrito aos ids editados', () => {
  const espelho = mapaPorId(nuvem);                         // espelho = nuvem (boot terminou)
  const listaLocal = [mcabv08Velho, mcaov01Edit, outro];    // local ainda com o MCABV 08 velho
  const envio = idsDoEnvio(mapaPorId(listaLocal), espelho, { up: ['mcaov01'], del: [] });
  assert.deepEqual(envio.upsert, ['mcaov01']);
  assert.deepEqual(envio.del, []);
});

t('pendência antiga sem registro de ids: local só ACRESCENTA, nunca sobrescreve', () => {
  const novoOffline = { id: 'novo', nome: 'NOVO', geojson: 'C' };
  const final = mesclarComEdicoes(nuvem, [...localVelho, novoOffline], null);
  const porId = Object.fromEntries(final.map(r => [r.id, r]));
  assert.equal(porId.mcabv08.geojson, 'LIMITE-NOVO');
  assert.ok(porId.novo, 'lançamento offline preservado');
});

t('exclusão local vira del e some na junção', () => {
  const base = mapaPorId(localVelho);
  const ids = calcularEdicoes(base, mapaPorId([mcabv08Velho, mcaov01]), null);
  assert.deepEqual(ids, { up: [], del: ['outro'] });
  const final = mesclarComEdicoes(nuvem, [mcabv08Velho, mcaov01], ids);
  assert.equal(final.some(r => r.id === 'outro'), false);
  const envio = idsDoEnvio(mapaPorId([mcabv08Velho, mcaov01]), undefined, ids);
  assert.deepEqual(envio.del, ['outro']);
  assert.deepEqual(envio.upsert, []);
});

t('recriar um id excluído tira ele do del', () => {
  const ids = calcularEdicoes(mapaPorId([mcaov01]), mapaPorId([mcaov01, outro]), { up: [], del: ['outro'] });
  assert.deepEqual(ids, { up: ['outro'], del: [] });
});

t('edições somam entre gravações; sem mudança devolve null', () => {
  const b1 = mapaPorId(localVelho);
  const l2 = [mcabv08Velho, mcaov01Edit, outro];
  const i1 = calcularEdicoes(b1, mapaPorId(l2), null);
  const l3 = [mcabv08Velho, mcaov01Edit, { ...outro, nome: 'OUTRO 2' }];
  const i2 = calcularEdicoes(mapaPorId(l2), mapaPorId(l3), i1);
  assert.deepEqual(i2.up.sort(), ['mcaov01', 'outro']);
  assert.equal(calcularEdicoes(mapaPorId(l3), mapaPorId(l3), i2), null);
});

t('sem base conhecida: cai no modo antigo (`todos`), sem perder a gravação', () => {
  const ids = calcularEdicoes(undefined, mapaPorId(localVelho), null);
  assert.equal(ids.todos, true);
  const envio = idsDoEnvio(mapaPorId(localVelho), undefined, ids);
  assert.equal(envio.porRegistro, false);
  assert.equal(envio.upsert.length, 3);
  assert.equal(calcularEdicoes(undefined, mapaPorId(localVelho), ids), null, 'já está em todos');
});

t('`todos` (chave nova no sync): junção dá vitória ao local, envio sobe tudo', () => {
  const ids = { up: [], del: [], todos: true };
  const final = mesclarComEdicoes([], localVelho, ids);
  assert.equal(final.length, 3);
  const envio = idsDoEnvio(mapaPorId(localVelho), mapaPorId([]), ids);
  assert.equal(envio.upsert.length, 3);
});

t('sem registro e com espelho: diff normal (modo antigo, ex.: obj/retry)', () => {
  const envio = idsDoEnvio(mapaPorId([mcaov01Edit]), mapaPorId([mcaov01]), null);
  assert.deepEqual(envio.upsert, ['mcaov01']);
  assert.equal(envio.porRegistro, false);
});

console.log('\nAchados da verificação independente\n');

t('[V1] pendência antiga com lançamento offline: o id novo entra no registro e sobe', () => {
  const novoOffline = { id: 'novo', nome: 'NOVO', geojson: 'C' };
  const local = [...localVelho, novoOffline];
  const ids = idsParaJuncao(null, mapaPorId(local), local, nuvem);   // base = local (nada editado nesta sessão)
  assert.deepEqual(ids, { up: ['novo'], del: [] });
  const final = mesclarComEdicoes(nuvem, local, ids);
  assert.equal(final.find(r => r.id === 'mcabv08').geojson, 'LIMITE-NOVO', 'cópia velha não vence');
  // re-envio do fim do boot: espelho = nuvem, base = final
  const envio = idsDoEnvio(mapaPorId(final), mapaPorId(nuvem), ids);
  assert.deepEqual(envio.upsert, ['novo']);
});

t('[V2] exclusão no modo por registro sem espelho vai no envio (del explícito)', () => {
  const envio = idsDoEnvio(mapaPorId([mcaov01]), undefined, { up: [], del: ['outro'] });
  assert.deepEqual(envio.del, ['outro']);
  assert.equal(envio.porRegistro, true);
});

t('[V3] outra aba editou e já confirmou durante o boot: a junção mantém a edição', () => {
  const baseInicio = mapaPorId(localVelho);                  // retrato do início do boot desta aba
  const localAgora = [mcabv08Velho, mcaov01Edit, outro];     // aba B gravou o MCAOV 01 no local compartilhado
  const ids = idsParaJuncao({ up: [], del: [] }, baseInicio, localAgora, nuvem);   // B já limpou o registro
  assert.deepEqual(ids.up, ['mcaov01']);
  const final = mesclarComEdicoes(nuvem, localAgora, ids);
  assert.equal(final.find(r => r.id === 'mcaov01').zonasGeojson, 'ZONAS-DA-GRADE');
  assert.equal(final.find(r => r.id === 'mcabv08').geojson, 'LIMITE-NOVO');
});

t('[V3] confirmação tira do registro só o id enviado que não mudou de novo', () => {
  const reg = { up: ['a', 'b'], del: ['c'] };
  const enviado = new Map([['a', '{"v":1}'], ['b', '{"v":1}']]);
  const atual = id => ({ a: '{"v":1}', b: '{"v":2}' })[id];   // b foi editado de novo (outra aba)
  assert.deepEqual(confirmarEnvio(reg, ['a', 'b'], ['c'], enviado, atual), { up: ['b'], del: [] });
  assert.equal(confirmarEnvio({ up: ['a'], del: [] }, ['a'], [], enviado, atual), null);
  assert.equal(confirmarEnvio({ up: [], del: [], todos: true }, ['a'], [], enviado, atual), null, 'envio em todos encerra o modo antigo');
});

t('[V4] base de dias atrás: ids iguais à nuvem não ficam presos no registro', () => {
  // Aba A reabre com base do dia D; aba C já gravou no local a nuvem de D+3 + a edição Y.
  const xD  = { id: 'x', v: 'D' },  xD3 = { id: 'x', v: 'D3' };
  const yD  = { id: 'y', v: 'D' },  yEd = { id: 'y', v: 'EDITADO' };
  const baseInicio = mapaPorId([xD, yD]);
  const nuvemD3 = [xD3, yD];
  const localAgora = [xD3, yEd];
  const ids = idsParaJuncao({ up: ['y'], del: [] }, baseInicio, localAgora, nuvemD3);
  assert.deepEqual(ids.up.sort(), ['x', 'y'], 'o diff do início do boot pega x');
  const final = mesclarComEdicoes(nuvemD3, localAgora, ids);
  const fin = mapaPorId(final), nv = mapaPorId(nuvemD3);
  const resto = podarIguaisANuvem(ids, id => fin.get(id), id => nv.get(id));
  assert.deepEqual(resto, { up: ['y'], del: [] }, 'x é igual à nuvem: sai do registro');
  // Boot seguinte: a nuvem mudou x (D5). Com o registro podado, x NÃO vence mais.
  const xD5 = { id: 'x', v: 'D5' };
  const final2 = mesclarComEdicoes([xD5, yEd], localAgora, resto);
  assert.equal(final2.find(r => r.id === 'x').v, 'D5');
});

t('[V4] poda: edição desfeita sai; del já ausente nos dois lados sai; todos não mexe', () => {
  const reg = { up: ['a', 'b'], del: ['c', 'd'] };
  const local = id => ({ a: '1', b: '2', d: '9' })[id];
  const nuvem = id => ({ a: '1', b: '1', c: undefined, d: '9' })[id];
  assert.deepEqual(podarIguaisANuvem(reg, local, nuvem), { up: ['b'], del: ['d'] });
  assert.equal(podarIguaisANuvem({ up: ['a'], del: [] }, local, nuvem), null);
  const todos = { up: [], del: [], todos: true };
  assert.equal(podarIguaisANuvem(todos, local, nuvem), todos);
});

console.log(`\n${ok} ok, ${fail} falha(s)\n`);
if (fail) process.exit(1);
