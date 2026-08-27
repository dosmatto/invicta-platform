// Testes do CULTIVO — o registro fitotécnico que substitui o Plantio
// (lib/cultivo: chaveCultivo / aplicarCultivo / culturaPrincipal /
// definirCulturaPrincipal / migrarPlantios).
//
// Testa `lib/cultivo.ts`, que é PURO. `store.ts` importa módulos de navegador e
// não roda em node — por isso a regra mora separada da gravação, mesmo motivo
// pelo qual `laudo/nucleo.ts` é separado de `lab.ts`.
//
// O que pode dar errado e a tela NÃO denuncia:
//  - o consórcio sobrescrever a cultura principal, e o talhão terminar só com
//    braquiária no lugar do milho;
//  - as duas partes de um talhão partido virarem uma só, somando área errada;
//  - `getPlantio` mudar de comportamento e quebrar, calados, os 14 pontos do app
//    que leem cultura por ele;
//  - a migração rodar duas vezes e duplicar todo o histórico de culturas.
// Roda: `npm run teste:cultivo`
import assert from 'node:assert/strict';

import {
  chaveCultivo, ehPrincipal, compararCultivos, aplicarCultivo,
  culturaPrincipal, definirCulturaPrincipal, migrarPlantios,
} from '../src/lib/cultivo.ts';

// A lista fixa da plataforma (store.ts).
const CULTURAS = ['Soja', 'Milho', 'Trigo', 'Feijão', 'Algodão', 'Aveia', 'Sorgo', 'Cevada', 'Pastagem', 'Outra'];

let ok = 0, fail = 0;
let db = [];        // faz o papel de `inv_cultivos`
let seq = 0;
const t = (n, f) => { try { db = []; seq = 0; f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const AGORA = '2026-08-27T12:00:00.000Z';
const gerarId = () => `c${++seq}`;
const base = { epoca: '', parte: '', ordem: 1, origem: 'manual' };

// Wrappers com a mesma semântica do store, para os testes lerem como a app.
const cultivo = (p) => { const r = aplicarCultivo(db, { ...base, ...p }, AGORA, gerarId); db = r.lista; return r.salvo; };
const getCultivos = (talhaoId, safra) => db
  .filter(c => (!talhaoId || c.talhaoId === talhaoId) && (!safra || c.safra === safra))
  .sort(compararCultivos);
const getPlantio = (talhaoId, safra) => culturaPrincipal(db, talhaoId, safra);
const setPlantio = (talhaoId, safra, cultura) => { db = definirCulturaPrincipal(db, talhaoId, safra, cultura, AGORA, gerarId); };
const importarCultivosLote = (novos, atualizacoes = []) => {
  let atualizados = 0;
  for (const a of atualizacoes) {
    const i = db.findIndex(c => c.id === a.id);
    if (i >= 0) { db[i] = { ...db[i], ...a.data, atualizadoEm: AGORA }; atualizados++; }
  }
  for (const n of novos) db.push({ ...n, id: gerarId(), criadoEm: AGORA, atualizadoEm: AGORA });
  return { criados: novos.length, atualizados };
};
const migrarPlantiosV1 = (antigos) => { db = migrarPlantios(antigos, db); };

console.log('\n── retrocompatibilidade: os 14 pontos que leem cultura ──');

t('setPlantio e getPlantio continuam funcionando como antes', () => {
  setPlantio('t1', '26/27', 'Soja');
  assert.equal(getPlantio('t1', '26/27'), 'Soja');
  setPlantio('t1', '26/27', 'Milho');
  assert.equal(getPlantio('t1', '26/27'), 'Milho', 'gravar de novo troca, não duplica');
  assert.equal(getCultivos('t1', '26/27').length, 1);
});

t('cultura vazia remove o principal, como antes', () => {
  setPlantio('t1', '26/27', 'Soja');
  setPlantio('t1', '26/27', '');
  assert.equal(getPlantio('t1', '26/27'), '');
  assert.equal(getCultivos('t1', '26/27').length, 0);
});

t('talhão/safra sem nada devolve string vazia, nunca undefined', () => {
  assert.equal(getPlantio('naoexiste', '26/27'), '');
  assert.equal(getPlantio('', ''), '');
  assert.equal(getPlantio(null, null), '');
});

t('safras diferentes não se misturam', () => {
  setPlantio('t1', '25/26', 'Soja');
  setPlantio('t1', '26/27', 'Milho');
  assert.equal(getPlantio('t1', '25/26'), 'Soja');
  assert.equal(getPlantio('t1', '26/27'), 'Milho');
});

console.log('\n── o que o Plantio não conseguia guardar ──');

t('CONSÓRCIO: duas culturas na mesma área não se sobrescrevem', () => {
  // CKLBV 10 a: milho + braquiária, 36,49 ha nas duas linhas.
  cultivo({ talhaoId: 't1', safra: '26/27', ordem: 1, cultura: 'Milho', areaHa: 36.49 });
  cultivo({ talhaoId: 't1', safra: '26/27', ordem: 2, cultura: 'Pastagem', areaHa: 36.49 });
  const cs = getCultivos('t1', '26/27');
  assert.equal(cs.length, 2, 'antes, o segundo apagava o primeiro');
  assert.equal(getPlantio('t1', '26/27'), 'Milho', 'o principal continua sendo o da ordem 1');
});

t('TALHÃO PARTIDO: cada parte guarda o seu cultivar e a sua área', () => {
  // HABPU 02 a (20,76) e HABPU 02 b (76,90).
  cultivo({ talhaoId: 't1', safra: '26/27', parte: 'A', cultura: 'Soja', cultivarNome: '56IX58RSF I2X', areaHa: 20.76 });
  cultivo({ talhaoId: 't1', safra: '26/27', parte: 'B', cultura: 'Soja', cultivarNome: '24406I2X', areaHa: 76.9 });
  const cs = getCultivos('t1', '26/27');
  assert.equal(cs.length, 2);
  assert.equal(cs.reduce((s, c) => s + (c.areaHa ?? 0), 0).toFixed(2), '97.66');
  assert.deepEqual(cs.map(c => c.parte), ['A', 'B'], 'vêm ordenadas pela parte');
});

t('SAFRINHA: soja no verão e milho depois, no mesmo talhão e ano', () => {
  cultivo({ talhaoId: 't1', safra: '26/27', epoca: 'verao', cultura: 'Soja' });
  cultivo({ talhaoId: 't1', safra: '26/27', epoca: 'safrinha', cultura: 'Milho' });
  assert.equal(getCultivos('t1', '26/27').length, 2);
});

t('gravar a mesma chave duas vezes ATUALIZA, não duplica', () => {
  cultivo({ talhaoId: 't1', safra: '26/27', parte: 'A', cultura: 'Soja' });
  cultivo({ talhaoId: 't1', safra: '26/27', parte: 'A', cultura: 'Milho' });
  const cs = getCultivos('t1', '26/27');
  assert.equal(cs.length, 1);
  assert.equal(cs[0].cultura, 'Milho');
});

t('setPlantio não encosta no consórcio nem nas partes', () => {
  cultivo({ talhaoId: 't1', safra: '26/27', ordem: 2, cultura: 'Pastagem' });
  cultivo({ talhaoId: 't1', safra: '26/27', parte: 'A', cultura: 'Feijão' });
  setPlantio('t1', '26/27', 'Soja');
  const cs = getCultivos('t1', '26/27');
  assert.equal(cs.length, 3, 'o principal entrou sem apagar os outros dois');
  setPlantio('t1', '26/27', '');
  assert.equal(getCultivos('t1', '26/27').length, 2, 'apagar o principal não leva os outros junto');
});

console.log('\n── o texto original da planilha e a área declarada ──');

t('culturaOrigem preserva o que veio na planilha', () => {
  cultivo({ talhaoId: 't1', safra: '26/27', cultura: 'Soja', culturaOrigem: 'SOJA TRANSGENICA' });
  const c = getCultivos('t1', '26/27')[0];
  assert.equal(c.cultura, 'Soja');
  assert.equal(c.culturaOrigem, 'SOJA TRANSGENICA', 'a transgenia não some do registro');
  assert.ok(CULTURAS.includes(c.cultura));
});

t('a área declarada vive no cultivo, separada da área do talhão', () => {
  cultivo({ talhaoId: 't1', safra: '26/27', cultura: 'Soja', areaHa: 52.51 });
  assert.equal(getCultivos('t1', '26/27')[0].areaHa, 52.51);
  // Talhao.areaHa é geodésica e calculada do polígono; o cultivo tem a sua
  // própria área declarada e as duas nunca se encostam.
  assert.equal(getCultivos('t1', '26/27')[0].talhaoId, 't1');
});

t('rastreabilidade: dá para achar tudo que veio de uma importação', () => {
  importarCultivosLote([
    { ...base, talhaoId: 't1', safra: '26/27', cultura: 'Soja', origem: 'importacao', importacaoId: 'imp-1' },
    { ...base, talhaoId: 't2', safra: '26/27', cultura: 'Milho', origem: 'importacao', importacaoId: 'imp-1' },
  ]);
  const daImportacao = getCultivos().filter(c => c.importacaoId === 'imp-1');
  assert.equal(daImportacao.length, 2, 'é o que permite auditar e desfazer');
});

console.log('\n── gravação em lote ──');

t('lote grava tudo e conta certo', () => {
  const r = importarCultivosLote([
    { ...base, talhaoId: 't1', safra: '26/27', cultura: 'Soja', origem: 'importacao' },
    { ...base, talhaoId: 't2', safra: '26/27', cultura: 'Milho', origem: 'importacao' },
  ]);
  assert.deepEqual(r, { criados: 2, atualizados: 0 });
  assert.equal(getCultivos().length, 2);
});

t('lote atualiza pelo id e conta só o que existia', () => {
  const c1 = cultivo({ talhaoId: 't1', safra: '26/27', cultura: 'Soja' });
  const r = importarCultivosLote([], [{ id: c1.id, data: { cultura: 'Milho' } }, { id: 'fantasma', data: { cultura: 'X' } }]);
  assert.equal(r.atualizados, 1, 'id inexistente não conta');
  assert.equal(getPlantio('t1', '26/27'), 'Milho');
});

t('lote vazio não quebra', () => {
  assert.deepEqual(importarCultivosLote([]), { criados: 0, atualizados: 0 });
});

console.log('\n── migração do Plantio antigo ──');

const ANTIGOS = [
  { id: 'p1', talhaoId: 't1', safra: '24/25', cultura: 'Soja', criadoEm: '2024-03-15T10:00:00.000Z' },
  { id: 'p2', talhaoId: 't1', safra: '25/26', cultura: 'Milho', criadoEm: '2025-01-01T00:00:00.000Z' },
  { id: 'p3', talhaoId: 't2', safra: '25/26', cultura: 'Trigo', criadoEm: '2025-01-01T00:00:00.000Z' },
];

t('migra o histórico e é IDEMPOTENTE', () => {
  migrarPlantiosV1(ANTIGOS);
  assert.equal(getCultivos().length, 3);
  assert.equal(getPlantio('t1', '24/25'), 'Soja');
  assert.equal(getCultivos()[0].origem, 'manual', 'histórico não é marcado como importação');

  // A flag do localStorage pode sumir (troca de navegador, limpeza de dados) e
  // uma segunda passada duplicaria o histórico INTEIRO de culturas do cliente.
  migrarPlantiosV1(ANTIGOS);
  assert.equal(getCultivos().length, 3, 'a segunda passada não pode duplicar nada');
});

t('migração preserva a data de criação original', () => {
  migrarPlantiosV1(ANTIGOS);
  assert.equal(getCultivos('t1', '24/25')[0].criadoEm, '2024-03-15T10:00:00.000Z');
});

t('plantio sem cultura não vira cultivo fantasma', () => {
  migrarPlantiosV1([{ id: 'p1', talhaoId: 't1', safra: '24/25', cultura: '', criadoEm: '2024-01-01T00:00:00.000Z' }]);
  assert.equal(getCultivos().length, 0);
});

t('migração não engole um cultivo que já existe para o mesmo talhão/safra', () => {
  cultivo({ talhaoId: 't1', safra: '24/25', cultura: 'Milho' });
  migrarPlantiosV1(ANTIGOS);
  assert.equal(getPlantio('t1', '24/25'), 'Milho', 'o registro atual manda');
  assert.equal(getCultivos('t1', '24/25').length, 1);
});

console.log('\n── chave de unicidade ──');

t('a chave separa época, parte e ordem', () => {
  const k = (p) => chaveCultivo({ talhaoId: 't1', safra: '26/27', ...p });
  const todas = [k({}), k({ epoca: 'safrinha' }), k({ parte: 'A' }), k({ ordem: 2 })];
  assert.equal(new Set(todas).size, 4, 'cada componente tem de distinguir');
  assert.equal(k({}), k({ epoca: '', parte: '', ordem: 1 }), 'ausente e vazio são a mesma coisa');
});

t('ehPrincipal só aceita época padrão, talhão inteiro e ordem 1', () => {
  assert.ok(ehPrincipal({}));
  assert.ok(ehPrincipal({ epoca: '', parte: '', ordem: 1 }));
  assert.ok(!ehPrincipal({ ordem: 2 }));
  assert.ok(!ehPrincipal({ parte: 'A' }));
  assert.ok(!ehPrincipal({ epoca: 'safrinha' }));
});

t('aplicarCultivo NÃO muta a lista recebida', () => {
  const antes = [];
  const r = aplicarCultivo(antes, { ...base, talhaoId: 't1', safra: '26/27', cultura: 'Soja' }, AGORA, gerarId);
  assert.equal(antes.length, 0, 'mutar a lista quebraria o React em qualquer consumidor');
  assert.equal(r.lista.length, 1);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
