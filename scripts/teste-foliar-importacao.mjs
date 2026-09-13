// Importação de LAUDO FOLIAR em lote (src/lib/foliarImportacao.ts).
// Roda: npm run teste:foliar-importacao
//
// O que este arquivo existe para travar — todos são defeitos que passam em
// SILÊNCIO, importando o laudo inteiro com números plausíveis e errados:
//
//  1. ESCALA. "N 4,62 %" e "N 46,2 g/kg" são o MESMO teor. Se o % entrar sem
//     converter, a lavoura perfeita vira deficiência severa de N — e nada na
//     tela denuncia, porque 4,62 é um número perfeitamente aceitável.
//  2. ÓXIDO. "P₂O₅" na folha existe. Sem o fator, o P fica 2,29× alto.
//  3. NÚMERO DA AMOSTRA. É a junção de volta com a planilha do laboratório; se
//     ele se perder, não há como o consultor conferir uma linha suspeita.
//  4. ÓRGÃO E ESTÁDIO. `PerfilLabConfig` não tinha onde guardá-los; sem as
//     colunas novas, todo laudo importado herdaria o órgão do lote mesmo
//     quando a planilha diz o contrário — e norma de um órgão não vale para
//     outro (ledger 19).
//  5. PRODUTIVIDADE EM SACAS. "65 sc/ha" entrando como 65 kg/ha joga a lavoura
//     recordista na população de BAIXA produtividade do gerador de normas.
//  6. PERFIL POSICIONAL NO ARQUIVO ERRADO — o mesmo defeito que
//     `pontuarPerfil` denuncia no laudo de solo, aqui pela pontuação foliar.
//  7. N.D. VIRANDO ZERO. `valorLab` transforma "N.D." em 0, que é certo para
//     solo (o lab mediu e não achou) e VENENO para folha: zero como teor
//     zeraria toda razão dual que passasse por ele.

import assert from 'node:assert/strict';
import {
  autoConfigFoliar, colunasFoliares, escolherPerfilFoliar, importarFoliar,
  normalizarOrgao, fatorProdutividade, paraAmostras, paraTriagem,
  pontuarPerfilFoliar, teoresImplausiveis,
  PERFIS_FOLIAR_BUILTIN, PERFIL_FOLIAR_PADRAO, FAIXAS_PLAUSIVEIS_FOLIAR,
} from '../src/lib/foliarImportacao.ts';
import { CONFIANCA_MINIMA, PERFIS_BUILTIN } from '../src/lib/lab.ts';
import { NUTRIENTES } from '../src/lib/foliar/tipos.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
const perto = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log('\nImportação de laudo foliar\n');

// ── Fixture 1: laudo em unidade canônica, com órgão/estádio/produtividade ────
const AOA_COMPLETO = [
  ['Amostra', 'Talhão', 'Órgão', 'Estádio', 'Produtividade (sc/ha)', 'N g/kg', 'P g/kg', 'K g/kg', 'Ca g/kg', 'Mg g/kg', 'S g/kg', 'B mg/kg', 'Cu mg/kg', 'Fe mg/kg', 'Mn mg/kg', 'Zn mg/kg'],
  ['1', 'T-01', '3º trifólio com pecíolo', 'R1', '65', '46,2', '2,7', '18,5', '5,4', '2,65', '2,25', '41', '8', '72', '24', '24'],
  ['2', 'T-01', '3º trifólio sem pecíolo', 'R2', '58', '51,0', '3,1', '15,2', '6,1', '2,90', '2,40', '38', '9', '85', '31', '27'],
  ['3', 'T-02', '', '', '', '44,0', 'N.D.', '17,0', '5,0', '2,50', '2,10', '35', '7', '68', '22', '21'],
];

t('autoConfigFoliar acha cabeçalho, nº, talhão e as três colunas NOVAS', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  assert.equal(config.linhaCabecalho, 0);
  assert.equal(config.colId, 0);
  assert.equal(config.colTalhao, 1);
  assert.equal(config.colOrgao, 2, 'colOrgao é o campo novo do PerfilLabConfig');
  assert.equal(config.colEstadio, 3);
  assert.equal(config.colProdutividade, 4);
});

t('os 11 nutrientes mapeiam apesar do sufixo de unidade no cabeçalho', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const esperado = { N: 5, P: 6, K: 7, Ca: 8, Mg: 9, S: 10, B: 11, Cu: 12, Fe: 13, Mn: 14, Zn: 15 };
  for (const [id, col] of Object.entries(esperado)) {
    assert.equal(config.elementos[id], col, `${id} deveria vir da coluna ${col}`);
  }
  assert.equal(Object.keys(config.elementos).length, 11);
});

t('a coluna de metadado NÃO é disputada por nutriente ("Produtividade", "Estádio")', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const colsNutriente = Object.values(config.elementos);
  for (const meta of [config.colId, config.colTalhao, config.colOrgao, config.colEstadio, config.colProdutividade]) {
    assert.ok(!colsNutriente.includes(meta), `coluna de metadado ${meta} virou nutriente`);
  }
});

t('teores, nº da amostra, órgão e estádio saem por linha', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const r = importarFoliar(AOA_COMPLETO, config);
  assert.equal(r.linhas.length, 3);
  const a1 = r.linhas.find(l => l.numeroAmostra === 1);
  assert.equal(a1.talhao, 'T-01');
  assert.ok(perto(a1.teores.N, 46.2), 'N em g/kg');
  assert.ok(perto(a1.teores.B, 41), 'B em mg/kg');
  assert.equal(a1.orgao, 'trifolio-com-peciolo');
  assert.equal(a1.estadio, 'R1');
  const a2 = r.linhas.find(l => l.numeroAmostra === 2);
  assert.equal(a2.orgao, 'trifolio-sem-peciolo', 'com e sem pecíolo NÃO são o mesmo órgão');
});

t('produtividade em SACAS vira kg/ha (×60)', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const r = importarFoliar(AOA_COMPLETO, config);
  const a1 = r.linhas.find(l => l.numeroAmostra === 1);
  assert.equal(a1.produtividadeKgha, 3900, '65 sc/ha = 3.900 kg/ha');
  assert.equal(fatorProdutividade('Produtividade (t/ha)'), 1000);
  assert.equal(fatorProdutividade('Produtividade (kg/ha)'), 1);
});

t('"N.D." NÃO vira teor zero — vira nutriente não analisado', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const r = importarFoliar(AOA_COMPLETO, config);
  const a3 = r.linhas.find(l => l.numeroAmostra === 3);
  assert.equal(a3.teores.P, null, 'zero como teor zeraria toda razão dual que passasse por ele');
  assert.ok(perto(a3.teores.N, 44));
});

t('linha sem órgão declarado fica null (a tela aplica o padrão do lote)', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const a3 = importarFoliar(AOA_COMPLETO, config).linhas.find(l => l.numeroAmostra === 3);
  assert.equal(a3.orgao, null);
  assert.equal(a3.produtividadeKgha, null);
});

t('filtro por talhão recorta o lote', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const r = importarFoliar(AOA_COMPLETO, config, { filtroTalhao: 'T-02' });
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].numeroAmostra, 3);
});

// ── Fixture 2: unidades traiçoeiras (%, ppm, óxido) ─────────────────────────
const AOA_UNIDADES = [
  ['Amostra', 'Talhão', 'N (%)', 'P2O5 (%)', 'K (dag/kg)', 'Ca (g/kg)', 'Mg (g/kg)', 'S (g/kg)', 'B (ppm)', 'Cu (ppm)', 'Fe (ppm)', 'Mn (ppm)', 'Zn (ppm)'],
  ['1', 'T-01', '4,62', '0,619', '1,85', '5,4', '2,65', '2,25', '41', '8', '72', '24', '24'],
];

t('% e dag/kg viram g/kg (o erro de escala 10× que "parece certo")', () => {
  const { config } = autoConfigFoliar(AOA_UNIDADES);
  const l = importarFoliar(AOA_UNIDADES, config).linhas[0];
  assert.ok(perto(l.teores.N, 46.2, 1e-9), `N deveria ser 46,2 g/kg, veio ${l.teores.N}`);
  assert.ok(perto(l.teores.K, 18.5, 1e-9), `K deveria ser 18,5 g/kg, veio ${l.teores.K}`);
});

t('P2O5 é convertido para P elementar (senão fica 2,29× alto)', () => {
  const { config } = autoConfigFoliar(AOA_UNIDADES);
  const l = importarFoliar(AOA_UNIDADES, config).linhas[0];
  // 0,619 % de P2O5 = 6,19 g/kg de P2O5 × 0,4364 ≈ 2,70 g/kg de P
  assert.ok(l.teores.P > 2.5 && l.teores.P < 2.9, `P deveria ficar ~2,7 g/kg, veio ${l.teores.P}`);
});

t('ppm e mg/kg são a mesma coisa — micro não pode ser reescalado', () => {
  const { config } = autoConfigFoliar(AOA_UNIDADES);
  const l = importarFoliar(AOA_UNIDADES, config).linhas[0];
  assert.ok(perto(l.teores.B, 41, 1e-9));
  assert.ok(perto(l.teores.Fe, 72, 1e-9));
});

t('a conversão aplicada é ANUNCIADA nos avisos (não acontece em silêncio)', () => {
  const { config } = autoConfigFoliar(AOA_UNIDADES);
  const r = importarFoliar(AOA_UNIDADES, config);
  assert.ok(r.avisos.some(a => a.includes('Convertida')), 'a tela precisa poder mostrar o que foi reescalado');
  assert.ok(r.colunas.find(c => c.nutriente === 'N').unidade === '%');
});

t('faixa plausível de FOLHA denuncia o % que entrou sem converter', () => {
  const teores = {}; for (const id of NUTRIENTES) teores[id] = null;
  teores.N = 4.62;                                  // ficou em %, não em g/kg
  const alertas = teoresImplausiveis(teores);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].nutriente, 'N');
  assert.ok(alertas[0].motivo.includes('unidade'));
  // e o contrário: teor bom não alarma
  teores.N = 46.2;
  assert.equal(teoresImplausiveis(teores).length, 0);
});

t('as faixas plausíveis de folha cobrem os 11 nutrientes e são coerentes', () => {
  for (const id of NUTRIENTES) {
    const f = FAIXAS_PLAUSIVEIS_FOLIAR[id];
    assert.ok(f, `falta faixa plausível de ${id}`);
    assert.ok(f.min < f.max, `faixa de ${id} invertida`);
  }
});

// ── Perfis: escolha e denúncia ──────────────────────────────────────────────
const AOA_PADRAO_BR = [
  ['Amostra', 'Talhão', 'N', 'P', 'K', 'Ca', 'Mg', 'S', 'B', 'Cu', 'Fe', 'Mn', 'Zn'],
  ['1', 'T-01', '46.2', '2.7', '18.5', '5.4', '2.65', '2.25', '41', '8', '72', '24', '24'],
  ['2', 'T-01', '44.0', '2.5', '17.0', '5.0', '2.50', '2.10', '35', '7', '68', '22', '21'],
];

t('escolherPerfilFoliar reconhece o layout padrão pela assinatura', () => {
  assert.equal(escolherPerfilFoliar(AOA_PADRAO_BR), 'foliar-laudo-br');
});

t('layout desconhecido cai no automático, não num posicional qualquer', () => {
  const estranho = [
    ['Protocolo', 'Gleba', 'Nitrogenio', 'Fosforo', 'Potassio'],
    ['A-1', 'G1', '46', '2.7', '18'],
  ];
  assert.equal(escolherPerfilFoliar(estranho), 'foliar-auto');
  assert.equal(PERFIL_FOLIAR_PADRAO, 'foliar-auto');
});

t('perfil posicional no ARQUIVO ERRADO é denunciado pela pontuação', () => {
  const pos = PERFIS_FOLIAR_BUILTIN.find(p => p.id === 'foliar-laudo-br');
  const bom = pontuarPerfilFoliar(AOA_PADRAO_BR, pos.config);
  assert.ok(bom.confianca >= CONFIANCA_MINIMA, 'no arquivo certo a confiança é alta');
  // Mesmo nº de colunas, conteúdo completamente diferente: é assim que um
  // posicional importa tudo trocado sem dar erro nenhum.
  const outro = [
    ['Amostra', 'Talhão', 'pH', 'MO', 'P res', 'K', 'Ca', 'Mg', 'Al', 'CTC', 'V%', 'Argila', 'Silte'],
    ['1', 'T-01', '5.2', '38', '32', '3.6', '40', '18', '0', '104', '59', '53', '13'],
  ];
  const ruim = pontuarPerfilFoliar(outro, pos.config);
  assert.ok(ruim.confianca < CONFIANCA_MINIMA, `deveria desconfiar, deu ${ruim.confianca}`);
  assert.ok(ruim.exemplo, 'o primeiro desencontro tem de vir junto, p/ o aviso ser concreto');
});

t('os perfis foliares ficam FORA de PERFIS_BUILTIN (não poluem a escolha do solo)', () => {
  const idsFoliares = new Set(PERFIS_FOLIAR_BUILTIN.map(p => p.id));
  for (const p of PERFIS_BUILTIN) {
    assert.ok(!idsFoliares.has(p.id), `perfil foliar ${p.id} vazou para a lista de solo`);
  }
  for (const p of PERFIS_FOLIAR_BUILTIN) {
    const cols = Object.values(p.config.elementos ?? {});
    assert.equal(new Set(cols).size, cols.length, `perfil ${p.id} tem coluna repetida`);
  }
});

t('colunasFoliares respeita o perfil sobre o cabeçalho, mas herda a unidade', () => {
  const headers = ['Amostra', 'Talhão', 'N (%)'];
  const cols = colunasFoliares(headers, { N: 2 });
  assert.equal(cols.length, 1);
  assert.equal(cols[0].unidade, '%');
  assert.ok(perto(cols[0].fator, 10));
  // perfil dizendo que a coluna 2 é o K, cabeçalho dizendo N: o perfil manda,
  // e a unidade NÃO é herdada de um cabeçalho que fala de outro nutriente.
  const trocado = colunasFoliares(headers, { K: 2 });
  assert.equal(trocado[0].nutriente, 'K');
  assert.equal(trocado[0].fator, 1);
});

// ── Órgão ───────────────────────────────────────────────────────────────────
t('normalizarOrgao não adivinha: "trifólio" sozinho é inconclusivo', () => {
  assert.equal(normalizarOrgao('3º trifólio com pecíolo'), 'trifolio-com-peciolo');
  assert.equal(normalizarOrgao('trifolio SEM peciolo'), 'trifolio-sem-peciolo');
  assert.equal(normalizarOrgao('Folha da espiga'), 'folha-espiga');
  assert.equal(normalizarOrgao('folha bandeira'), 'folha-bandeira');
  assert.equal(normalizarOrgao('folha'), null, 'inconclusivo tem de ser null, não um chute');
  assert.equal(normalizarOrgao(''), null);
});

// ── Saída para o store e para a triagem ─────────────────────────────────────
t('paraAmostras aplica o órgão do lote só onde a planilha se calou', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const linhas = importarFoliar(AOA_COMPLETO, config).linhas;
  const amostras = paraAmostras(linhas, {
    talhaoId: 'tal-1', safra: '24/25', cultura: 'Soja',
    orgaoPadrao: 'trifolio-com-peciolo', estadioPadrao: 'R1-R2',
  });
  assert.equal(amostras.length, 3);
  assert.equal(amostras.find(a => a.numeroAmostra === 2).orgao, 'trifolio-sem-peciolo', 'a planilha manda');
  assert.equal(amostras.find(a => a.numeroAmostra === 3).orgao, 'trifolio-com-peciolo', 'o lote preenche a lacuna');
  assert.equal(amostras.find(a => a.numeroAmostra === 3).estadio, 'R1-R2');
  assert.ok(amostras.every(a => a.origem === 'planilha'));
  assert.equal(amostras.find(a => a.numeroAmostra === 1).origemProdutividade, 'manual');
});

t('paraTriagem produz a chave que labOutliers usa', () => {
  const { config } = autoConfigFoliar(AOA_COMPLETO);
  const linhas = importarFoliar(AOA_COMPLETO, config).linhas;
  const rs = paraTriagem(linhas);
  assert.equal(rs.length, 3);
  const chave = r => `${r.talhao}|${r.campanha}|${r.numero}|${r.profundidade}`;
  for (let i = 0; i < rs.length; i++) assert.equal(chave(rs[i]), linhas[i].chave);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
