// Auto-mapeamento de LAUDO em colunas (src/lib/lab) — roda: `npm run teste:lab`.
//
// Fixture = cabeçalho REAL de um export InCeres/Interpartner ("Nhazinha-80 -
// 2025.xlsx", 05/08/2026), com as duas linhas de cabeçalho (nomes + UNIDADES) e
// três linhas de amostra copiadas do arquivo.
//
// O que este arquivo existe para travar:
//  1. "MOS" e "P res" TÊM de virar MO e P. Eram descartados em silêncio — o
//     laudo entrava sem os dois parâmetros mais importantes e ninguém percebia,
//     porque as outras 9 colunas mapeavam normalmente.
//  2. A 2ª linha (unidades) não pode virar amostra, e a unidade escrita nela é a
//     que manda na conversão — antes o app ASSUMIA a canônica e acertava por sorte.
//  3. "Ca/Mg" (relação) ≠ "Ca+Mg" (soma): com a normalização antiga as duas viravam
//     'camg' e uma roubava a coluna da outra.
//  4. Perfil POSICIONAL no arquivo errado tem de ser denunciado: ele importa tudo
//     trocado sem erro nenhum (o pH do laudo entrando como P).
import assert from 'node:assert/strict';
import {
  autoConfig, aplicarPerfil, escolherPerfil, pontuarPerfil, normCab,
  PERFIS_BUILTIN, CONFIANCA_MINIMA, ELEMENTOS_LAB, completarPorCabecalho,
} from '../src/lib/lab.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Fixture: laudo InCeres/Interpartner ──────────────────────────────────────
const AOA = [
  ['id', 'prof', 'pH', 'MOS', 'P res', 'K', 'Ca', 'Mg', 'Al', 'CTC', 'V%', 'Argila', 'Silte', 'K%', 'Mg/K', 'C', 'Ca%', 'm%', 'Areia grossa', 'ph_kcl', 'Areia total', 'Areia fina', 'Ca/Mg', 'H/Al', 'Ca/K', 'H/Al%', 'pH CaCl2', 'Mg%', 'K mg', 't', 'SB', 'ph_smp', 'H%'],
  ['Identificador', 'Profundidade', 'Sem Unidade', 'g/dm³', 'mg/dm³', 'mmolc/dm³', 'mmolc/dm³', 'mmolc/dm³', 'mmolc/dm³', 'mmolc/dm³', '%', '%', '%', '%', 'Sem Unidade', 'mmolc/dm³', '%', '%', '%', 'Sem Unidade', '%', '%', 'Sem Unidade', 'mmolc/dm³', 'Sem Unidade', '%', 'Sem Unidade', '%', 'ppm', 'mmolc/dm³', 'mmolc/dm³', 'Sem Unidade', '%'],
  ['1', '0-20', '5.2', '38.77', '32.45', '3.6', '40.27', '18.24', '0', '104.47', '59.45', '53.3', '13.2', '3.45', '5.07', '22.49', '38.55', '0', '', '42.36', '33.5', '', '2.21', '42.36', '11.19', '40.55', '5.2', '17.46', '1404', '62.11', '62.11', '6.19', '40.55'],
  ['1', '20-40', '4.63', '29.32', '1.95', '2.7', '23.97', '5.44', '3.73', '100.93', '31.82', '', '', '2.68', '2.01', '17.01', '23.75', '10.41', '', '68.82', '', '', '4.41', '68.82', '8.88', '68.18', '4.63', '5.39', '1053', '35.84', '32.11', '5.64', '64.49'],
  ['2', '0-20', '4.95', '35.83', '31.95', '3.2', '35.67', '8.56', '0.45', '103.11', '46', '53.05', '13.55', '3.1', '2.67', '20.78', '34.59', '0.94', '', '55.68', '33.4', '', '4.17', '55.68', '11.15', '54', '4.95', '8.3', '1248', '47.88', '47.43', '5.88', '53.57'],
];
const cab = AOA[0];
const col = nome => cab.indexOf(nome);

// Catálogo ATIVO como a tela monta (ORDEM_PADRAO_FERT + as complementares ligadas).
// Não importa store.ts: ele é 'use client' e depende de localStorage.
import { VARIAVEIS_COMPLEMENTARES } from '../src/constants/variaveisSeedComplementar.ts';
const ORDEM = ['mo', 'ph', 'm', 'v', 'ctc', 'p', 'k', 'satk', 'ca', 'mg', 'satca', 'satmg', 't', 's', 'b', 'zn', 'cu', 'mn', 'fe', 'al', 'textura'];
const porId = new Map([...ELEMENTOS_LAB, ...VARIAVEIS_COMPLEMENTARES].map(v => [v.id, v]));
const ativas = [
  ...ORDEM.map(id => porId.get(id)).filter(v => v && v.usar !== false),
  ...VARIAVEIS_COMPLEMENTARES.filter(v => v.usar && !ORDEM.includes(v.id)),
];
// Todas as complementares (o usuário pode ligar qualquer uma na Biblioteca).
const todas = [...ativas, ...VARIAVEIS_COMPLEMENTARES.filter(v => !ativas.includes(v))];

console.log('\nAuto-mapeamento do laudo em colunas\n');

t('acha o cabeçalho, o id, a profundidade e a linha de UNIDADES', () => {
  const { config } = autoConfig(AOA, ativas);
  assert.equal(config.linhaCabecalho, 0);
  assert.equal(config.linhaUnidades, 1, 'a 2ª linha é de unidades, não de amostra');
  assert.equal(config.colId, 0);
  assert.equal(config.colProfundidade, 1);
});

t('MOS → MO e "P res" → P (os dois que sumiam do laudo)', () => {
  const { config } = autoConfig(AOA, ativas);
  assert.equal(config.elementos.mo, col('MOS'), 'MOS tem de virar Matéria Orgânica');
  assert.equal(config.elementos.p, col('P res'), '"P res" tem de virar Fósforo');
});

t('os 11 parâmetros de rotina mapeiam nas colunas certas', () => {
  const { config } = autoConfig(AOA, ativas);
  const esperado = { ph: 'pH', mo: 'MOS', p: 'P res', k: 'K', ca: 'Ca', mg: 'Mg', al: 'Al', ctc: 'CTC', v: 'V%', m: 'm%', textura: 'Argila' };
  for (const [elId, header] of Object.entries(esperado)) {
    assert.equal(config.elementos[elId], col(header), `${elId} deveria vir de "${header}"`);
  }
});

t('granulometria completa entra (Silte e as três areias)', () => {
  const { config } = autoConfig(AOA, ativas);
  assert.equal(config.elementos.silte, col('Silte'));
  assert.equal(config.elementos.areia_total, col('Areia total'));
  assert.equal(config.elementos.areia_grossa, col('Areia grossa'));
  assert.equal(config.elementos.areia_fina, col('Areia fina'));
});

t('unidade vem da LINHA DE UNIDADES, não de suposição', () => {
  const { config } = autoConfig(AOA, ativas);
  for (const el of ['k', 'ca', 'mg', 'al', 'ctc']) {
    assert.equal(config.detalhes?.[el]?.unidade, 'mmolc/dm³', `${el} em mmolc/dm³`);
  }
  assert.equal(config.detalhes?.p?.unidade, 'mg/dm³');
  assert.equal(config.detalhes?.mo?.unidade, 'g/dm³');
  assert.equal(config.detalhes?.textura?.unidade, '%');
  assert.equal(config.detalhes?.ph, undefined, '"Sem Unidade" não vira unidade');
});

t('linha de unidades NÃO vira amostra', () => {
  const { config } = autoConfig(AOA, ativas);
  const r = aplicarPerfil(AOA, config);
  assert.equal(r.resultados.length, 3, '3 linhas de dado no fixture');
  assert.equal(r.ignoradas, 0, 'nada descartado — a linha de unidades ficou fora do fatiamento');
  assert.deepEqual(r.resultados.map(a => a.numero), [1, 1, 2]);
  assert.deepEqual(r.resultados.map(a => a.profundidade), ['0-20', '20-40', '0-20']);
});

t('valores e derivados batem com as colunas do próprio laudo', () => {
  const { config } = autoConfig(AOA, ativas);
  const a1 = aplicarPerfil(AOA, config).resultados[0];
  assert.equal(a1.valores.ph, 5.2);
  assert.equal(a1.valores.p, 32.45);
  assert.equal(a1.valores.mo, 38.77);
  // Derivados calculados pela plataforma × as mesmas colunas trazidas pelo laudo.
  // Tolerância 0,06 = meio passo do arredondamento a 1 casa de calcularDerivados
  // (o laudo publica 2 casas: K% 3,45 → a plataforma grava 3,4).
  const igualAoLaudo = (elId, header) =>
    assert.ok(Math.abs(a1.valores[elId] - Number(AOA[2][col(header)])) < 0.06, `${header}: ${a1.valores[elId]} × ${AOA[2][col(header)]}`);
  igualAoLaudo('t', 't');        // CTCe = Ca+Mg+K+Al
  igualAoLaudo('satk', 'K%');
  igualAoLaudo('satca', 'Ca%');
  igualAoLaudo('satmg', 'Mg%');
});

console.log('\nCabeçalho com barra e sinal (Ca/Mg ≠ Ca+Mg)\n');

t('normCab preserva / e + (norm comum fundia os dois)', () => {
  assert.equal(normCab('Ca/Mg'), 'ca/mg');
  assert.equal(normCab('Ca+Mg'), 'ca+mg');
  assert.equal(normCab('H/Al%'), 'h/al%');
  assert.equal(normCab('V%'), 'v%');
});

t('relações e somas caem cada uma na sua variável', () => {
  const { config } = autoConfig(AOA, todas);
  assert.equal(config.elementos.rel_ca_mg, col('Ca/Mg'), 'Ca/Mg é a RELAÇÃO');
  assert.equal(config.elementos.rel_ca_k, col('Ca/K'));
  assert.equal(config.elementos.rel_mg_k, col('Mg/K'));
  assert.equal(config.elementos.h_al, col('H/Al'), 'H/Al é a soma H+Al');
  assert.equal(config.elementos.h_al_pct, col('H/Al%'));
  assert.equal(config.elementos.ca_mg, undefined, 'não há coluna "Ca+Mg" neste laudo');
});

t('pH por método e SB/C/H% não roubam a coluna do canônico', () => {
  const { config } = autoConfig(AOA, todas);
  assert.equal(config.elementos.ph, col('pH'), 'o pH canônico fica com a coluna "pH"');
  assert.equal(config.elementos.ph_cacl2, col('pH CaCl2'));
  assert.equal(config.elementos.ph_kcl, col('ph_kcl'));
  assert.equal(config.elementos.ph_smp, col('ph_smp'));
  assert.equal(config.elementos.sb, col('SB'));
  assert.equal(config.elementos.c, col('C'));
  assert.equal(config.elementos.h_pct, col('H%'));
});

t('K canônico fica com "K"; "K mg" só sobra para o K em ppm', () => {
  const { config } = autoConfig(AOA, todas);
  assert.equal(config.elementos.k, col('K'), 'o K oficial NÃO pode ir para "K mg"');
  assert.equal(config.elementos.k_ppm, col('K mg'));
});

t('CTCe (t) é sempre CALCULADA — nunca lida da coluna "t"', () => {
  const { config } = autoConfig(AOA, todas);
  assert.equal(config.elementos.t, undefined);
});

console.log('\nEscolha do perfil e trava do perfil errado\n');

t('a assinatura id·prof pré-seleciona o perfil InCeres', () => {
  assert.equal(escolherPerfil(AOA, [], ativas), 'inceres');
  assert.ok(PERFIS_BUILTIN.find(p => p.id === 'inceres')?.auto, 'o perfil InCeres roda autoConfig');
});

t('perfil posicional errado é DENUNCIADO (importaria tudo trocado)', () => {
  const abc = PERFIS_BUILTIN.find(p => p.id === 'fundacao-abc-planilha');
  const r = aplicarPerfil(AOA, abc.config);
  assert.ok(r.resultados.length > 0, 'ele "funciona": é isso que torna o caso perigoso');
  const pont = pontuarPerfil(AOA, abc.config, ativas);
  assert.ok(pont.confianca < CONFIANCA_MINIMA, `confiança=${pont.confianca}`);
  assert.ok(pont.exemplo, 'o aviso precisa de um exemplo concreto do desencontro');
});

t('perfil certo tem confiança máxima', () => {
  const { config } = autoConfig(AOA, ativas);
  assert.equal(pontuarPerfil(AOA, config, ativas).confianca, 1);
});

// ── Ferro (v2.77.0) ──────────────────────────────────────────────────────────
// O Fe faltava em ELEMENTOS_LAB, então a coluna do laudo era lida e descartada
// em SILÊNCIO — o Ferro nunca chegava à lista de mapas da Fertilidade. O resto do
// app já contava com ele (ORDEM_PADRAO_FERT em store.ts e o catálogo de
// variáveis), o que tornava a ausência invisível: nada acusava nada.
t('Fe está no catálogo de elementos do laudo', () => {
  const fe = ELEMENTOS_LAB.find(e => e.id === 'fe');
  assert.ok(fe, 'sem isto a coluna Fe do laudo é descartada sem aviso');
  assert.equal(fe.simbolo, 'Fe');
});

t('cabeçalhos reais de Fe são reconhecidos', () => {
  const fe = ELEMENTOS_LAB.find(e => e.id === 'fe');
  for (const cab of ['Fe', 'fe', 'FERRO', 'Ferro']) {
    assert.ok(fe.sinonimos.includes(normCab(cab)), `"${cab}" deveria casar com Fe`);
  }
});

t('Fe não rouba coluna de outro elemento', () => {
  // "Fe/Mn" é RELAÇÃO (variável complementar), não o micro Ferro.
  const fe = ELEMENTOS_LAB.find(e => e.id === 'fe');
  assert.ok(!fe.sinonimos.includes(normCab('Fe/Mn')), 'Fe/Mn é relação, não o Ferro');
  const ids = ELEMENTOS_LAB.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados no catálogo');
});

t('a ordem do catálogo põe Fe depois de Mn, como o resto do app espera', () => {
  const ids = ELEMENTOS_LAB.map(e => e.id);
  assert.ok(ids.indexOf('fe') > ids.indexOf('mn'), 'Fe depois de Mn');
  assert.ok(ids.indexOf('fe') < ids.indexOf('textura'), 'Fe antes da textura');
});

// ── Ferro: os TRÊS bloqueios (v2.78.0) ───────────────────────────────────────
// Adicionar Fe ao catálogo de elementos (v2.77.0) não bastou. O usuário reimportou
// e o Fe continuou sumindo. Rodando o caminho real, apareceram mais dois:
//   1. o perfil POSICIONAL 'fundacao-abc-planilha' pulava a coluna 17 (= Fe);
//   2. o catálogo JÁ MATERIALIZADO tinha o Fe como variável complementar
//      DESLIGADA e com sinônimo só 'ferro' — então nem ligando ele casava com um
//      cabeçalho escrito "Fe", porque o casamento é pelos sinônimos.
// A tela importa com `autoConfig(aoa, getVariaveisAtivas())`, e é aí que os dois
// se combinavam para deixar tudo em silêncio.
t('Fe está no perfil posicional da Fundação ABC (planilha), coluna 17', () => {
  const pl = PERFIS_BUILTIN.find(p => p.id === 'fundacao-abc-planilha');
  assert.equal(pl.config.elementos.fe, 17,
    'conferido contra public/teste/igefi07_lab.xlsx, o arquivo real deste layout');
});

t('as colunas derivadas seguem FORA do perfil (t e K% são calculadas)', () => {
  const pl = PERFIS_BUILTIN.find(p => p.id === 'fundacao-abc-planilha');
  const cols = Object.values(pl.config.elementos);
  assert.ok(!cols.includes(12), 'col 12 = t (CTCe) é derivada, não pode ser lida');
  assert.ok(!cols.includes(20), 'col 20 = K% é derivada, não pode ser lida');
});

t('nenhuma coluna do perfil é mapeada duas vezes', () => {
  for (const p of PERFIS_BUILTIN) {
    const cols = Object.values(p.config.elementos ?? {});
    assert.equal(new Set(cols).size, cols.length, `perfil ${p.id} tem coluna repetida`);
  }
});

t('cabeçalho "Fe" casa por autoConfig (era o que falhava no catálogo antigo)', () => {
  const aoa = [
    ['id', 'prof', 'pH', 'K', 'Ca', 'Fe'],
    ['1', '0-20', '5.2', '3.1', '40', '74'],
    ['2', '0-20', '5.4', '2.8', '38', '68'],
  ];
  const { config } = autoConfig(aoa);
  assert.equal(config.elementos.fe, 5, '"Fe" tem de casar, não só "Ferro" por extenso');
});

t('cabeçalho "Ferro" por extenso também casa', () => {
  const aoa = [['id', 'prof', 'Ferro'], ['1', '0-20', '74']];
  assert.equal(autoConfig(aoa).config.elementos.fe, 2);
});

// ── Rede de segurança do perfil posicional (v2.79.0) ─────────────────────────
// Perfil posicional lê por índice fixo e descarta em SILÊNCIO toda coluna fora da
// lista — foi assim que o Ferro sumiu. A rede aproveita as sobras pelo cabeçalho.
// Uma versão ingênua disso CORROMPE dados (medido: 4 valores trocados num laudo
// com colunas repetidas), então as três travas abaixo não são opcionais.
const CFG_POS = {
  linhaCabecalho: 0, colId: 0, colProfundidade: 1,
  elementos: { ph: 2, k: 3, s: 4 },
};
const AOA_POS = [
  ['id', 'prof', 'pH', 'K', 'S', 'Fe', 'H + Al', 'pH CaCl2', 'S'],
  ['1', '0-20', '5.1', '3.1', '8.1', '74', '4.8', '4.7', '9.9'],
];

t('REDE: aproveita a coluna que o perfil não previa (o caso do Ferro)', () => {
  const { config, adicionados } = completarPorCabecalho(AOA_POS, CFG_POS);
  assert.equal(config.elementos.fe, 5, 'Fe estava fora do perfil e tem de entrar');
  assert.ok(adicionados.includes('fe'));
});

t('TRAVA 1: coluna já mapeada pelo perfil fica intocada', () => {
  const { config } = completarPorCabecalho(AOA_POS, CFG_POS);
  assert.equal(config.elementos.ph, 2, 'pH continua na coluna do perfil');
  assert.equal(config.elementos.k, 3);
  assert.equal(config.elementos.s, 4);
});

t('TRAVA 3: elemento já mapeado NÃO é remapeado (era o que corrompia)', () => {
  // O arquivo tem uma SEGUNDA coluna "S" (índice 8) e uma "pH CaCl2" (7).
  // Sem esta trava, elas roubavam o S e o pH que o perfil já lia certo.
  const { config, adicionados } = completarPorCabecalho(AOA_POS, CFG_POS);
  assert.equal(config.elementos.s, 4, 'o S do perfil (col 4) não pode virar col 8');
  assert.equal(config.elementos.ph, 2, 'o pH do perfil não pode virar "pH CaCl2"');
  assert.ok(!adicionados.includes('s') && !adicionados.includes('ph'));
});

t('TRAVA 2: coluna de metadado declarada no perfil fica de fora', () => {
  const cfg = { linhaCabecalho: 0, colId: 2, colProfundidade: 1, elementos: { ph: 3 } };
  const aoa = [['x', 'prof', 'Amostra', 'pH'], ['1', '0-20', '7', '5.2']];
  const { adicionados } = completarPorCabecalho(aoa, cfg);
  assert.deepEqual(adicionados, [], 'a coluna de id não pode virar elemento');
});

t('REDE: nenhum valor pré-existente muda', () => {
  const antes = aplicarPerfil(AOA_POS, CFG_POS).resultados[0].valores;
  const { config } = completarPorCabecalho(AOA_POS, CFG_POS);
  const depois = aplicarPerfil(AOA_POS, config).resultados[0].valores;
  for (const [id, v] of Object.entries(antes)) {
    assert.equal(depois[id], v, `${id} mudou de ${v} para ${depois[id]} — a rede tem de ser ADITIVA`);
  }
});

t('REDE: sem coluna nova, devolve a MESMA config (não recria objeto à toa)', () => {
  const cfg = { linhaCabecalho: 0, colId: 0, colProfundidade: 1, elementos: { ph: 2 } };
  const aoa = [['id', 'prof', 'pH'], ['1', '0-20', '5.2']];
  const r = completarPorCabecalho(aoa, cfg);
  assert.equal(r.config, cfg);
  assert.deepEqual(r.adicionados, []);
});

// ── "Amostra" não é Matéria Orgânica (v2.79.0) ───────────────────────────────
// BUG VIVO, independente da rede: 'mos' (sinônimo de MO) é substring de
// "aMOStra". Com UMA coluna de amostra o estrago não aparecia — ela vira a coluna
// de id e sai do rastreio. Com DUAS ("ID Amostra" + "Nº Amostra"), o NÚMERO da
// amostra era importado como valor de Matéria Orgânica. Reproduzido antes do fix.
t('BUG QUE ISTO TRAVA: "Nº Amostra" não vira M.O.', () => {
  const aoa = [['ID Amostra', 'prof', 'Nº Amostra', 'pH'], ['1', '0-20', '101', '5.2']];
  assert.equal(autoConfig(aoa).config.elementos.mo, undefined,
    'o número da amostra entrando como M.O. é corrupção silenciosa');
});

t('...e as formas legítimas de M.O. continuam casando', () => {
  for (const cab of ['MOS', 'M.O.', 'MO', 'Matéria Orgânica']) {
    const aoa = [['id', 'prof', cab, 'pH'], ['1', '0-20', '35.2', '5.2']];
    assert.equal(autoConfig(aoa).config.elementos.mo, 2, `"${cab}" deveria casar com M.O.`);
  }
});

t('a regra do "contido" segue valendo para os demais', () => {
  const aoa = [['id', 'prof', 'Argila (%)', 'pH'], ['1', '0-20', '35', '5.2']];
  assert.equal(autoConfig(aoa).config.elementos.textura, 2);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
