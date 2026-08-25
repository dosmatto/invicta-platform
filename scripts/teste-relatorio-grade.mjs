// Testes do relatório de conferência da grade (src/lib/relatorioGrade.ts).
//
// O que erra num relatório desses NÃO é escrever o arquivo — é a expansão
// ponto × profundidade e o join com o padrão de elementos. Um ponto que devia
// ir a duas profundidades e sai com uma vira amostra faltando no laboratório,
// e ninguém percebe olhando a planilha.
//
// Rodar: npm run teste:relatorio-grade

import test from 'node:test';
import assert from 'node:assert/strict';
import { linhasDaGrade, resumoDaGrade, nomeArquivoRelatorio, linhasDasZonas, resumoDasZonas } from '../src/lib/relatorioGrade.ts';

const CTX = {
  produtor: 'Arthur Ferreira do Amaral',
  municipio: 'Carambeí',
  fazenda: 'Santo André',
  talhao: 'AFSSA 01',
  analisePorProfundidade: { '0-20': 'basica', '20-40': 'basica+textura' },
};

// Grade-molde: 3 pontos, o do meio só na superfície.
const grade = (pontos, profundidades = [{ rotulo: '0-20' }, { rotulo: '20-40' }]) => ({
  id: 'g1', nome: 'Grade 1', profundidades, pontos,
});

test('expande uma linha por ponto × profundidade', () => {
  const g = grade([
    { ordem: 0, profs: 2, profundidades: ['0-20', '20-40'] },
    { ordem: 1, profs: 1, profundidades: ['0-20'] },
    { ordem: 2, profs: 2, profundidades: ['0-20', '20-40'] },
  ]);
  const linhas = linhasDaGrade(CTX, g);
  assert.equal(linhas.length, 5, '3 pontos com 2+1+2 profundidades = 5 amostras');
  assert.deepEqual(linhas.map(l => `${l.ID}:${l.Profundidade}`),
    ['1:0-20', '1:20-40', '2:0-20', '3:0-20', '3:20-40']);
});

test('ID é 1-based e segue a ordem da grade', () => {
  const g = grade([{ ordem: 0, profs: 1, profundidades: ['0-20'] }, { ordem: 1, profs: 1, profundidades: ['0-20'] }]);
  assert.deepEqual(linhasDaGrade(CTX, g).map(l => l.ID), [1, 2]);
});

test('numero da grade importada tem prioridade sobre a ordem', () => {
  // Grade que veio de fora: a numeração do laboratório não começa em 1.
  const g = grade([{ ordem: 0, numero: 107, profs: 1, profundidades: ['0-20'] }]);
  assert.equal(linhasDaGrade(CTX, g)[0].ID, 107);
});

test('sem rótulos no ponto, deriva da config da grade pelo nº de profundidades', () => {
  const g = grade([{ ordem: 0, profs: 2 }, { ordem: 1, profs: 1 }]);
  const linhas = linhasDaGrade(CTX, g);
  assert.deepEqual(linhas.map(l => l.Profundidade), ['0-20', '20-40', '0-20']);
});

test('cada profundidade recebe a análise do seu padrão', () => {
  const g = grade([{ ordem: 0, profs: 2, profundidades: ['0-20', '20-40'] }]);
  const linhas = linhasDaGrade(CTX, g);
  assert.equal(linhas[0]['Análises'], 'basica');
  assert.equal(linhas[1]['Análises'], 'basica+textura');
});

test('profundidade sem padrão casado NÃO some — vira "—" na planilha', () => {
  // Cadastro incompleto tem de aparecer na conferência, não desaparecer dela.
  const g = grade([{ ordem: 0, profs: 2, profundidades: ['0-20', '40-60'] }]);
  const linhas = linhasDaGrade(CTX, g);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[1]['Análises'], '—');
});

test('contexto (produtor/município/fazenda/talhão) repete em toda linha', () => {
  const g = grade([{ ordem: 0, profs: 2, profundidades: ['0-20', '20-40'] }]);
  for (const l of linhasDaGrade(CTX, g)) {
    assert.equal(l.Produtor, 'Arthur Ferreira do Amaral');
    assert.equal(l['Município'], 'Carambeí');
    assert.equal(l.Fazenda, 'Santo André');
    assert.equal(l['Talhão'], 'AFSSA 01');
  }
});

test('grade vazia gera zero linhas (não quebra)', () => {
  assert.deepEqual(linhasDaGrade(CTX, grade([])), []);
});

test('resumo separa amostras de pontos', () => {
  const g = grade([
    { ordem: 0, profs: 2, profundidades: ['0-20', '20-40'] },
    { ordem: 1, profs: 1, profundidades: ['0-20'] },
  ]);
  const r = resumoDaGrade(linhasDaGrade(CTX, g));
  assert.equal(r.amostras, 3);
  assert.equal(r.pontos, 2, 'o ponto com 2 profundidades conta UMA vez');
  assert.equal(r.porProfundidade.get('0-20'), 2);
  assert.equal(r.porProfundidade.get('20-40'), 1);
});

test('nome do arquivo não carrega caractere que quebre o download', () => {
  const nome = nomeArquivoRelatorio({ ...CTX, talhao: 'AFSSA 01/A' }, { nome: 'Grade 1' });
  assert.match(nome, /^[\w.\-]+\.xlsx$/);
});

// A invariante que a conferência inteira depende: o total de linhas da planilha
// tem de ser a soma das profundidades de cada ponto. Se ela quebrar, a contagem
// de sacos que chega ao laboratório não bate com a planilha.
test('invariante: linhas = soma das profundidades dos pontos', () => {
  const pontos = Array.from({ length: 40 }, (_, i) => ({
    ordem: i, profs: i % 3 === 0 ? 2 : 1,
    profundidades: i % 3 === 0 ? ['0-20', '20-40'] : ['0-20'],
  }));
  const esperado = pontos.reduce((s, p) => s + p.profundidades.length, 0);
  assert.equal(linhasDaGrade(CTX, grade(pontos)).length, esperado);
});

// ─── CARTA DA AMOSTRAGEM POR ZONAS ────────────────────────────────────────
// O que erra aqui é a expansão: na amostra COMPOSTA os 50 pontos da caminhada
// viram 4 sacos. Listar ponto a ponto faria a planilha prometer 50 amostras ao
// laboratório e chegarem 4 — e o erro só apareceria no laudo, semanas depois.

const ptZ = (ordem, numero, rotulo, zona) => ({ ordem, numero, rotulo, zona, lng: -50, lat: -25 });

// 4 zonas; a zona 1 com 3 pontos, as outras com 2 — 9 pontos, 4 sacos.
const PONTOS_ZONA = [
  ptZ(0, 1, '1-1', '1'), ptZ(1, 1, '1-2', '1'), ptZ(2, 1, '1-3', '1'),
  ptZ(3, 2, '2-1', '2'), ptZ(4, 2, '2-2', '2'),
  ptZ(5, 3, '3-1', '3'), ptZ(6, 3, '3-2', '3'),
  ptZ(7, 4, '4-1', '4'), ptZ(8, 4, '4-2', '4'),
];
const gradeZona = (modelo, profundidades) => ({
  id: 'gz1', nome: 'Zonas 1', metodo: 'zonas', modelo, profundidades, pontos: PONTOS_ZONA,
});
const P2 = [{ rotulo: '0-20', percentual: 100 }, { rotulo: '20-40', percentual: 100 }];

test('COMPOSTA: uma linha por SACO × profundidade, não por ponto', () => {
  const linhas = linhasDasZonas(CTX, gradeZona('A', P2));
  assert.equal(linhas.length, 8, '4 sacos × 2 profundidades');
  const r = resumoDasZonas(linhas);
  assert.equal(r.sacos, 4, `9 pontos têm de virar 4 sacos, veio ${r.sacos}`);
  assert.equal(r.amostras, 8);
});

test('COMPOSTA: o ID da planilha é o MESMO texto da etiqueta do saco', () => {
  const linhas = linhasDasZonas(CTX, gradeZona('A', P2));
  assert.deepEqual([...new Set(linhas.map(l => l.ID))], ['01', '02', '03', '04']);
});

test('INDIVIDUAL: uma linha por PONTO × profundidade, com o rótulo zona-seq', () => {
  const linhas = linhasDasZonas(CTX, gradeZona('B', P2));
  assert.equal(linhas.length, 18, '9 pontos × 2 profundidades');
  assert.equal(linhas[0].ID, '1-1');
  assert.ok(linhas.some(l => l.ID === '3-2'), 'o rótulo do campo tem de aparecer');
});

test('profundidade PARCIAL vale para as primeiras amostras, na ordem', () => {
  // 20-40 em 50% de 4 sacos → só os sacos 01 e 02 vão à camada profunda.
  const linhas = linhasDasZonas(CTX, gradeZona('A', [
    { rotulo: '0-20', percentual: 100 }, { rotulo: '20-40', percentual: 50 },
  ]));
  const fundas = linhas.filter(l => l.Profundidade === '20-40').map(l => l.ID);
  assert.deepEqual(fundas, ['01', '02']);
  assert.equal(linhas.filter(l => l.Profundidade === '0-20').length, 4);
});

test('a remessa se repete em TODA linha (sobrevive ao copiar-e-colar do lab)', () => {
  const g = { ...gradeZona('A', P2), codigoRemessa: 'INV-2026-0042' };
  for (const l of linhasDasZonas(CTX, g)) assert.equal(l.Remessa, 'INV-2026-0042');
});

test('as colunas são EXATAMENTE as da carta da grade comum', () => {
  const zon = Object.keys(linhasDasZonas(CTX, gradeZona('A', P2))[0]);
  const gri = Object.keys(linhasDaGrade(CTX, grade([
    { ordem: 0, profs: 1, profundidades: ['0-20'] },
  ])) [0]);
  assert.deepEqual(zon, gri, 'a carta de zonas tem de seguir o mesmo padrão');
});

test('profundidade sem padrão cadastrado marca "—" em vez de sumir', () => {
  const linhas = linhasDasZonas(
    { ...CTX, analisePorProfundidade: { '0-20': 'basica' } }, gradeZona('A', P2));
  assert.equal(linhas.filter(l => l['Análises'] === '—').length, 4, 'as 4 de 20-40');
});
