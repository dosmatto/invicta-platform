// Testes do PADRÃO DE NOME dos arquivos exportados (src/lib/nomeExport.ts).
//
// Pedido de 07/08/2026: "gostaria de que o nome tivesse sempre uma lógica — nome
// do talhão, ano (EP 01 para época 1, EP 02 para época 2), tipo". Antes disso
// eram 43 pontos montando nome inline, com 7 regexes de saneamento diferentes.
//
// O invariante mais importante é o charset: qualquer pedaço novo que entre no
// nome tem de sobreviver a /^[A-Z0-9_]+$/ — é o que o monitor da máquina e o
// download do navegador engolem sem reclamar.
//
// Roda: `npm run teste:nomes`.
import assert from 'node:assert/strict';
import {
  nomeExport, periodoParaNome, idTalhao, siglaFazenda, numeroTalhao, sanitizar,
} from '../src/lib/nomeExport.ts';
import { nomeArquivoPrescricao } from '../src/lib/prescricao/nomeArquivo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const JM = { fazenda: 'SERRA AZUL', talhao: 'JCASA 03' };

console.log('\nPadrão de nome dos arquivos exportados\n');

// ── A ordem pedida: talhão · tipo · ano · época ──────────────────────────────

t('CASO PEDIDO: talhão, tipo, ano e época na ordem', () => {
  assert.equal(nomeExport({ ...JM, tipo: 'FERT', ano: 2026, epoca: '1' }), 'SA03_FERT_2026_EP01');
  assert.equal(nomeExport({ ...JM, tipo: 'FERT', ano: 2026, epoca: '2' }), 'SA03_FERT_2026_EP02');
});

t('o detalhe entra por ÚLTIMO', () => {
  assert.equal(nomeExport({ ...JM, tipo: 'FERT', ano: 2026, epoca: '1', detalhe: 'satca' }), 'SA03_FERT_2026_EP01_SATCA');
});

t('ordenar a pasta agrupa por talhão e depois por tipo', () => {
  const nomes = [
    nomeExport({ ...JM, tipo: 'NDVI', ano: 2026 }),
    nomeExport({ ...JM, tipo: 'FERT', ano: 2025, epoca: '2' }),
    nomeExport({ ...JM, tipo: 'FERT', ano: 2026, epoca: '1' }),
  ].sort();
  assert.deepEqual(nomes, ['SA03_FERT_2025_EP02', 'SA03_FERT_2026_EP01', 'SA03_NDVI_2026']);
});

// ── O que falta é OMITIDO, nunca vira placeholder ────────────────────────────

t('sem época, o nome simplesmente não leva época', () => {
  assert.equal(nomeExport({ ...JM, tipo: 'RECOM', ano: 2026 }), 'SA03_RECOM_2026');
});

t('sem ano nem época, sobra talhão e tipo', () => {
  assert.equal(nomeExport({ ...JM, tipo: 'MDE', detalhe: 'altitude' }), 'SA03_MDE_ALTITUDE');
});

t('nada de "—", "null" ou "undefined" no nome', () => {
  const n = nomeExport({ fazenda: '', talhao: '', tipo: 'ZONAS', ano: null, epoca: null, detalhe: '' });
  assert.ok(!/null|undefined|—|NaN/.test(n), n);
  assert.ok(n.length > 0, 'nome vazio');
});

t('ano inválido não entra', () => {
  assert.equal(nomeExport({ ...JM, tipo: 'FERT', ano: NaN }), 'SA03_FERT');
  assert.equal(nomeExport({ ...JM, tipo: 'FERT', ano: 2026.7 }), 'SA03_FERT_2026');
});

// ── Charset: o guarda-corpo ──────────────────────────────────────────────────

t('CHARSET: acento, espaço, barra e % não sobrevivem', () => {
  const n = nomeExport({
    fazenda: 'Estância São José', talhao: 'Talhão 1/A', tipo: 'FERT',
    ano: 2026, epoca: '2', detalhe: 'Saturação por Cálcio (Ca%)',
  });
  assert.match(n, /^[A-Z0-9_]+$/, `nome com caractere que quebra o download: ${n}`);
});

t('detalhe comprido é cortado em 14', () => {
  const n = nomeExport({ ...JM, tipo: 'COND', detalhe: 'condutividadeeletricaprofunda' });
  assert.equal(n, 'SA03_COND_CONDUTIVIDADEE'.slice(0, 'SA03_COND_'.length + 14));
  assert.match(n, /^[A-Z0-9_]+$/);
});

// ── Identificador do talhão ──────────────────────────────────────────────────

t('idTalhao cola sigla e número, sem separador', () => {
  assert.equal(idTalhao('SERRA AZUL', 'JCASA 03'), 'SA03');
  assert.equal(idTalhao('Fazenda São João', 'T-7', 'FSJ'), 'FSJ07');
});

t('relatório de FAZENDA (sem talhão) leva só a sigla', () => {
  assert.equal(idTalhao('SERRA AZUL', ''), 'SA');
  assert.equal(idTalhao('SERRA AZUL', null), 'SA');
  assert.equal(nomeExport({ fazenda: 'SERRA AZUL', tipo: 'NDVI', ano: 2026 }), 'SA_NDVI_2026');
});

t('as primitivas continuam as mesmas da prescrição', () => {
  assert.equal(siglaFazenda('Fazenda Boa Vista'), 'BV');
  assert.equal(siglaFazenda(''), 'FAZ');
  assert.equal(numeroTalhao('JCASA 03'), '03');
  assert.equal(numeroTalhao('Baixada'), 'BAIXAD');
});

// ── Cascata do período ───────────────────────────────────────────────────────

t('dataReferencia manda: dá ano E época', () => {
  assert.deepEqual(periodoParaNome({ dataReferencia: '2026-03-15' }), { ano: 2026, epoca: '1' });
  assert.deepEqual(periodoParaNome({ dataReferencia: '2026-09-20' }), { ano: 2026, epoca: '2' });
});

t('sem dataReferencia, cai na data solta', () => {
  assert.deepEqual(periodoParaNome({ data: '2025-07-01' }), { ano: 2025, epoca: '2' });
});

t('só a safra dá o ANO — nunca a época (ela vem de data, não de safra)', () => {
  assert.deepEqual(periodoParaNome({ safra: '26/27' }), { ano: 2026, epoca: null });
  assert.deepEqual(periodoParaNome({ safra: '25/26' }), { ano: 2025, epoca: null });
});

t('ano/época explícitos ganham de tudo', () => {
  assert.deepEqual(periodoParaNome({ ano: 2020, epoca: '2', dataReferencia: '2026-03-15' }), { ano: 2020, epoca: '2' });
});

t('ano explícito + data: a época ainda sai da data', () => {
  assert.deepEqual(periodoParaNome({ ano: 2026, dataReferencia: '2026-09-01' }), { ano: 2026, epoca: '2' });
});

t('sem nada, devolve nulo — e o nome fica sem o segmento', () => {
  assert.deepEqual(periodoParaNome({}), { ano: null, epoca: null });
  assert.deepEqual(periodoParaNome({ dataReferencia: 'abc', safra: '' }), { ano: null, epoca: null });
});

// ── Saneamento único ─────────────────────────────────────────────────────────

t('sanitizar troca as SETE regexes que estavam espalhadas', () => {
  assert.equal(sanitizar('Cenário 1/A'), 'Cenario_1_A');
  assert.equal(sanitizar('  espaço  '), 'espaco');
  assert.equal(sanitizar('a//b'), 'a_b', 'runs viram UM underline');
  assert.equal(sanitizar(''), '');
});

// ── A prescrição não pode ter mudado ─────────────────────────────────────────

t('PRESCRIÇÃO INTACTA: SA03_TX_MILHO byte a byte', () => {
  assert.equal(nomeArquivoPrescricao({ ...JM, produto: 'Milho' }), 'SA03_TX_MILHO');
  assert.equal(nomeArquivoPrescricao({ ...JM, produto: 'Milho', unidade: 'sementes/m2' }), 'SA03_TX_MILHO_M2');
});


// Produtividade: o relatório de colheita entrou no padrão de nomes (v2.69).
t('produtividade sai como <talhão>_PROD_<ano>_EP0n_<cultura>', () => {
  assert.equal(
    nomeExport({ fazenda: 'Figueira', siglaFazenda: 'FRNFI', talhao: 'FRNFI 21', tipo: 'PROD', ano: 2026, epoca: '1', detalhe: 'soja' }),
    'FRNF21_PROD_2026_EP01_SOJA',   // a sigla cadastrada é truncada em 4 letras
  );
});

t('produtividade sem época não inventa segmento', () => {
  assert.equal(
    nomeExport({ fazenda: 'Barrinha', talhao: 'JRABA 01', tipo: 'PROD', ano: 2026, detalhe: 'milho' }),
    'B01_PROD_2026_MILHO',
  );
});
console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
