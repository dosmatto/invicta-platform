// Ingestão de laudo por API (src/lib/laudo/ingestao.ts) — `npm run teste:laudo-api`.
//
// O TESTE CENTRAL é o de equivalência: o MESMO laudo, entrando pelo arquivo e
// entrando pelo JSON da API, tem de produzir amostras idênticas. É a única
// defesa real contra a falha silenciosa deste recurso — se as duas portas
// divergirem (uma converte cmolc, a outra não; uma trata N.D. como zero, a outra
// como vazio), os dois lados continuam respondendo 200 e desenhando mapa, e a
// diferença só aparece no talhão, meses depois, numa dose errada de adubo.
//
// O fixture é o mesmo laudo real de scripts/teste-lab-import.mjs (export
// InCeres "Nhazinha-80 - 2025.xlsx"), de propósito: o payload da API é montado
// a partir das MESMAS células, então a comparação é sobre o caminho do código,
// não sobre dois conjuntos de números digitados à mão.

import assert from 'node:assert/strict';
import { autoConfig, aplicarPerfil, ELEMENTOS_LAB } from '../src/lib/lab.ts';
import { interpretarLaudo, numeroDoId, MAX_AMOSTRAS } from '../src/lib/laudo/ingestao.ts';
import { gerarCodigoRemessa, normalizarRemessa, ehCodigoRemessa, TAMANHO_REMESSA } from '../src/lib/remessa.ts';
import { VARIAVEIS_COMPLEMENTARES } from '../src/constants/variaveisSeedComplementar.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Fixture: o mesmo laudo do teste de importação de arquivo ─────────────────
const AOA = [
  ['id', 'prof', 'pH', 'MOS', 'P res', 'K', 'Ca', 'Mg', 'Al', 'CTC', 'V%', 'Argila', 'Silte', 'K%', 'Mg/K', 'C', 'Ca%', 'm%', 'Areia grossa', 'ph_kcl', 'Areia total', 'Areia fina', 'Ca/Mg', 'H/Al', 'Ca/K', 'H/Al%', 'pH CaCl2', 'Mg%', 'K mg', 't', 'SB', 'ph_smp', 'H%'],
  ['Identificador', 'Profundidade', 'Sem Unidade', 'g/dm³', 'mg/dm³', 'mmolc/dm³', 'mmolc/dm³', 'mmolc/dm³', 'mmolc/dm³', 'mmolc/dm³', '%', '%', '%', '%', 'Sem Unidade', 'mmolc/dm³', '%', '%', '%', 'Sem Unidade', '%', '%', 'Sem Unidade', 'mmolc/dm³', 'Sem Unidade', '%', 'Sem Unidade', '%', 'ppm', 'mmolc/dm³', 'mmolc/dm³', 'Sem Unidade', '%'],
  ['1', '0-20', '5.2', '38.77', '32.45', '3.6', '40.27', '18.24', '0', '104.47', '59.45', '53.3', '13.2', '3.45', '5.07', '22.49', '38.55', '0', '', '42.36', '33.5', '', '2.21', '42.36', '11.19', '40.55', '5.2', '17.46', '1404', '62.11', '62.11', '6.19', '40.55'],
  ['1', '20-40', '4.63', '29.32', '1.95', '2.7', '23.97', '5.44', '3.73', '100.93', '31.82', '', '', '2.68', '2.01', '17.01', '23.75', '10.41', '', '68.82', '', '', '4.41', '68.82', '8.88', '68.18', '4.63', '5.39', '1053', '35.84', '32.11', '5.64', '64.49'],
  ['2', '0-20', '4.95', '35.83', '31.95', '3.2', '35.67', '8.56', '0.45', '103.11', '46', '53.05', '13.55', '3.1', '2.67', '20.78', '34.59', '0.94', '', '55.68', '33.4', '', '4.17', '55.68', '11.15', '54', '4.95', '8.3', '1248', '47.88', '47.43', '5.88', '53.57'],
];

const ORDEM = ['mo', 'ph', 'm', 'v', 'ctc', 'p', 'k', 'satk', 'ca', 'mg', 'satca', 'satmg', 't', 's', 'b', 'zn', 'cu', 'mn', 'fe', 'al', 'textura'];
const porId = new Map([...ELEMENTOS_LAB, ...VARIAVEIS_COMPLEMENTARES].map(v => [v.id, v]));
const ativas = [
  ...ORDEM.map(id => porId.get(id)).filter(v => v && v.usar !== false),
  ...VARIAVEIS_COMPLEMENTARES.filter(v => v.usar && !ORDEM.includes(v.id)),
];
const VALIDAS = new Set(ativas.map(v => v.id));
const REMESSA = 'INV-BCDF-GHJK';

// Payload da API montado a partir das MESMAS células do arquivo: mesmo texto
// bruto ('N.D.', vazio, '5.2'), mesmas unidades da linha 2.
function payloadDoArquivo(config, { protocolo = 'LAB-2026-0001' } = {}) {
  const unidades = {};
  for (const [varId, det] of Object.entries(config.detalhes ?? {})) if (det.unidade) unidades[varId] = det.unidade;
  const amostras = AOA.slice(2).map(row => {
    const valores = {};
    for (const [varId, idx] of Object.entries(config.elementos)) valores[varId] = row[idx];
    return { id: row[config.colId], profundidade: row[config.colProfundidade], valores };
  });
  return { remessa: REMESSA, protocolo_laboratorio: protocolo, data_analise: '2026-08-14', unidades, amostras };
}

// Compara só o que as duas portas PODEM produzir igual. `campanha` fica de fora
// de propósito: no arquivo ela vem de uma coluna do laudo, na API é o protocolo
// do laboratório — e `talhao` idem. O que não pode divergir é número,
// profundidade e VALOR.
const comparavel = r => ({ numero: r.numero, profundidade: r.profundidade, valores: r.valores });

console.log('\nIngestão de laudo por API\n');

// ── Código de remessa ────────────────────────────────────────────────────────
t('gera código no formato INV-XXXX-XXXX, sem vogal e sem caractere ambíguo', () => {
  for (let i = 0; i < 200; i++) {
    const c = gerarCodigoRemessa();
    assert.match(c, /^INV-[A-Z0-9]{4}-[A-Z0-9]{4}$/, `formato inesperado: ${c}`);
    const corpo = c.slice(4).replace('-', '');
    assert.equal(corpo.length, TAMANHO_REMESSA);
    // Vogal formaria palavra num código impresso no papel do cliente.
    assert.ok(!/[AEIOU]/.test(corpo), `saiu vogal em ${c}`);
    // Pares que se confundem escritos à mão / ditados por telefone.
    assert.ok(!/[01ILSZ]/.test(corpo), `saiu caractere ambíguo em ${c}`);
  }
});

t('normaliza o que o laboratório digitar (minúscula, sem hífen, sem prefixo)', () => {
  for (const v of ['INV-BCDF-GHJK', 'inv-bcdf-ghjk', 'INVBCDFGHJK', 'bcdfghjk', ' inv bcdf ghjk ']) {
    assert.equal(normalizarRemessa(v), REMESSA, `não normalizou: ${v}`);
  }
});

t('recusa código com caractere trocado em vez de adivinhar', () => {
  // O ponto do código é eliminar palpite: 'O' não existe no alfabeto, e supor
  // que a pessoa quis '0' recria exatamente o risco que ele evita.
  assert.equal(normalizarRemessa('INV-BCDF-GHJO'), null);
  assert.equal(normalizarRemessa('INV-BCDF-GHJ'), null, 'curto demais');
  assert.equal(normalizarRemessa('INV-BCDF-GHJKL'), null, 'longo demais');
  assert.equal(normalizarRemessa(''), null);
  assert.equal(normalizarRemessa(null), null);
  assert.equal(ehCodigoRemessa(REMESSA), true);
});

t('não repete código em 5 mil sorteios', () => {
  const vistos = new Set();
  for (let i = 0; i < 5000; i++) vistos.add(gerarCodigoRemessa());
  assert.equal(vistos.size, 5000, 'houve colisão — o alfabeto ou o sorteio estão enviesados');
});

// ── EQUIVALÊNCIA: arquivo × API ──────────────────────────────────────────────
t('MESMO laudo pelo arquivo e pela API produz amostras IDÊNTICAS', () => {
  const { config } = autoConfig(AOA, ativas);
  const doArquivo = aplicarPerfil(AOA, config).resultados;
  const daApi = interpretarLaudo(payloadDoArquivo(config), { variaveisValidas: VALIDAS });

  assert.deepEqual(daApi.erros, [], 'a API recusou um laudo que o arquivo aceita');
  assert.equal(daApi.resultados.length, doArquivo.length, 'número de amostras diferente');
  assert.deepEqual(
    daApi.resultados.map(comparavel),
    doArquivo.map(comparavel),
    'os valores divergem entre as duas portas',
  );
});

t('a lista de elementos também bate entre as duas portas', () => {
  const { config } = autoConfig(AOA, ativas);
  const doArquivo = [...new Set(aplicarPerfil(AOA, config).resultados.flatMap(r => Object.keys(r.valores)))];
  const daApi = interpretarLaudo(payloadDoArquivo(config), { variaveisValidas: VALIDAS }).elementos;
  assert.deepEqual(daApi, doArquivo);
});

t('a conversão de unidade é a mesma: cmolc/dm³ entra multiplicado por 10', () => {
  const p = {
    remessa: REMESSA, protocolo_laboratorio: 'X',
    unidades: { ca: 'cmolc/dm³' },
    amostras: [{ id: 1, profundidade: '0-20', valores: { ca: 4.027 } }],
  };
  const r = interpretarLaudo(p, { variaveisValidas: VALIDAS });
  assert.deepEqual(r.erros, []);
  assert.ok(Math.abs(r.resultados[0].valores.ca - 40.27) < 0.001, `ca=${r.resultados[0].valores.ca}`);
});

// ── Semântica de valores (a mesma da §1.7 do documento) ──────────────────────
t('N.D. e "<x" viram ZERO; vazio e ">x" ficam SEM valor', () => {
  const p = {
    remessa: REMESSA, protocolo_laboratorio: 'X',
    amostras: [{ id: 1, profundidade: '0-20', valores: { p: 'N.D.', zn: '<0,5', cu: '', mn: '>200', k: 3.6 } }],
  };
  const v = interpretarLaudo(p, { variaveisValidas: VALIDAS }).resultados[0].valores;
  assert.equal(v.p, 0, 'N.D. tem de virar zero: o laboratório mediu e não achou');
  assert.equal(v.zn, 0, '<x é abaixo do limite de detecção → zero');
  assert.ok(!('cu' in v), 'vazio NÃO pode virar zero — não foi analisado');
  assert.ok(!('mn' in v), '>x não é número');
});

t('as colunas calculadas pela plataforma são ignoradas, com aviso', () => {
  const p = {
    remessa: REMESSA, protocolo_laboratorio: 'X',
    amostras: [{ id: 1, profundidade: '0-20', valores: { ca: 40.27, mg: 18.24, k: 3.6, al: 0, ctc: 104.47, t: 999, satk: 999 } }],
  };
  const r = interpretarLaudo(p, { variaveisValidas: VALIDAS });
  const v = r.resultados[0].valores;
  assert.notEqual(v.t, 999, 't veio do payload em vez de ser calculado');
  assert.equal(v.t, 62.1, 'CTCe = Ca+Mg+K+Al');
  assert.equal(v.satk, 3.4, 'K% = K/CTC×100');
  assert.ok(r.avisos.some(a => a.includes('.t:')), 'não avisou que ignorou');
});

// ── Validação ────────────────────────────────────────────────────────────────
t('remessa e protocolo são obrigatórios', () => {
  const r = interpretarLaudo({ amostras: [] }, { variaveisValidas: VALIDAS });
  assert.ok(r.erros.some(e => e.campo === 'remessa'));
  assert.ok(r.erros.some(e => e.campo === 'protocolo_laboratorio'));
});

t('unidade não reconhecida é ERRO, não aviso', () => {
  // Cair calado para a canônica é o que produz valor com ordem de grandeza
  // errada — o mapa desenha bonito e ninguém percebe.
  const r = interpretarLaudo({
    remessa: REMESSA, protocolo_laboratorio: 'X',
    unidades: { k: 'sacos por alqueire' },
    amostras: [{ id: 1, profundidade: '0-20', valores: { k: 3.6 } }],
  }, { variaveisValidas: VALIDAS });
  assert.ok(r.erros.some(e => e.campo === 'unidades.k'), 'aceitou unidade inventada');
});

t('junta TODOS os erros numa resposta só', () => {
  const r = interpretarLaudo({
    remessa: 'errado', protocolo_laboratorio: '',
    amostras: [{ id: 'sem digito', profundidade: '0-20', valores: {} }, { id: 2, valores: {} }],
  }, { variaveisValidas: VALIDAS });
  // Parar no primeiro erro transforma a integração em pingue-pongue.
  assert.ok(r.erros.length >= 4, `só ${r.erros.length} erros: ${JSON.stringify(r.erros)}`);
});

t('ponto fora da grade da remessa é erro, e diz QUAIS', () => {
  const r = interpretarLaudo({
    remessa: REMESSA, protocolo_laboratorio: 'X',
    amostras: [
      { id: 1, profundidade: '0-20', valores: { k: 3.6 } },
      { id: 99, profundidade: '0-20', valores: { k: 3.6 } },
    ],
  }, { variaveisValidas: VALIDAS, numerosDaGrade: new Set([1, 2, 3]) });
  const e = r.erros.find(x => x.campo === 'amostras');
  assert.ok(e, 'não acusou ponto fora da grade');
  assert.ok(e.mensagem.includes('99'), 'não disse qual ponto');
  assert.ok(!e.mensagem.includes('1,'), 'acusou um ponto que existe');
});

t('profundidade com grafia diferente vira AVISO (não barra o laudo)', () => {
  const r = interpretarLaudo({
    remessa: REMESSA, protocolo_laboratorio: 'X',
    amostras: [{ id: 1, profundidade: '0-20 cm', valores: { k: 3.6 } }],
  }, { variaveisValidas: VALIDAS, profundidadesDaGrade: new Set(['0-20']) });
  assert.deepEqual(r.erros, [], 'barrou um laudo que dá para importar');
  assert.ok(r.avisos.some(a => a.includes('0-20 cm')));
});

t('id aceita "7", "007" e "P-07" — igual ao arquivo', () => {
  assert.equal(numeroDoId(7), 7);
  assert.equal(numeroDoId('007'), 7);
  assert.equal(numeroDoId('P-07'), 7);
  assert.equal(numeroDoId('PONTO 7'), 7);
  assert.equal(numeroDoId('sem digito'), null);
  assert.equal(numeroDoId(0), null);
  assert.equal(numeroDoId(''), null);
});

t('variável desconhecida ou desligada é ignorada com aviso, sem derrubar o laudo', () => {
  const r = interpretarLaudo({
    remessa: REMESSA, protocolo_laboratorio: 'X',
    amostras: [{ id: 1, profundidade: '0-20', valores: { k: 3.6, inventada: 1, sb: 40 } }],
  }, { variaveisValidas: VALIDAS });
  assert.deepEqual(r.erros, []);
  assert.ok(!('inventada' in r.resultados[0].valores));
  assert.ok(r.avisos.some(a => a.includes('inventada')));
});

t('amostra repetida funde os valores (mesma regra do arquivo)', () => {
  const r = interpretarLaudo({
    remessa: REMESSA, protocolo_laboratorio: 'X',
    amostras: [
      { id: 1, profundidade: '0-20', valores: { k: 3.6 } },
      { id: 1, profundidade: '0-20', valores: { zn: 2.1 } },
    ],
  }, { variaveisValidas: VALIDAS });
  assert.equal(r.resultados.length, 1);
  assert.equal(r.resultados[0].valores.k, 3.6);
  assert.equal(r.resultados[0].valores.zn, 2.1);
});

t('payload gigante é barrado antes de virar trabalho', () => {
  const amostras = Array.from({ length: MAX_AMOSTRAS + 1 }, (_, i) => ({ id: i + 1, profundidade: '0-20', valores: { k: 1 } }));
  const r = interpretarLaudo({ remessa: REMESSA, protocolo_laboratorio: 'X', amostras }, { variaveisValidas: VALIDAS });
  assert.ok(r.erros.some(e => e.campo === 'amostras' && e.mensagem.includes(String(MAX_AMOSTRAS))));
});

t('data de análise fora do formato é erro (ela define Ano/Época)', () => {
  const base = { remessa: REMESSA, protocolo_laboratorio: 'X', amostras: [{ id: 1, profundidade: '0-20', valores: { k: 1 } }] };
  assert.ok(interpretarLaudo({ ...base, data_analise: '14/08/2026' }, { variaveisValidas: VALIDAS }).erros.some(e => e.campo === 'data_analise'));
  assert.ok(interpretarLaudo({ ...base, data_analise: '2026-02-31' }, { variaveisValidas: VALIDAS }).erros.some(e => e.campo === 'data_analise'));
  assert.deepEqual(interpretarLaudo({ ...base, data_analise: '2026-08-14' }, { variaveisValidas: VALIDAS }).erros, []);
  assert.deepEqual(interpretarLaudo(base, { variaveisValidas: VALIDAS }).erros, [], 'data é opcional');
});

console.log(`\n${ok} ok · ${fail} falhas\n`);
process.exit(fail ? 1 : 0);
