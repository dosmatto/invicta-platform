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
import { linhasDaGrade, resumoDaGrade, nomeArquivoRelatorio } from '../src/lib/relatorioGrade.ts';

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
