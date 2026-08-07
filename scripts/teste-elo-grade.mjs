// Testes do ELO LAUDO ↔ GRADE (src/lib/eloGrade.ts).
// Trava o bug de 07/08/2026: o relatório de fertilidade saiu sem o NÚMERO dos
// pontos no 1º mapa (capa) e sem os VALORES sobre os mapas de cada nutriente,
// enquanto a mesma tela mostrava tudo. Não era desenho: a tela tinha dois
// fallbacks (grade sem pontos / laudo renumerado pelo lab) e o relatório exigia
// o casamento exato — duas regras para a mesma pergunta.
// Roda: `npm run teste:elo`.
import assert from 'node:assert/strict';
import { resolverGradeDoLaudo, pontosPorNumero, casarAmostrasComPontos } from '../src/lib/eloGrade.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Grade com n pontos numerados 1..n (coordenadas fáceis de conferir).
const G = (id, n, extra = {}) => ({
  id, pontos: Array.from({ length: n }, (_, i) => ({ ordem: i, numero: i + 1, lng: -50 - i / 100, lat: -20 - i / 100 })),
  ...extra,
});
const amostras = nums => nums.map(n => ({ numero: n, valor: n * 10 }));

console.log('\nElo laudo ↔ grade\n');

t('a grade APONTADA pelo laudo ganha quando tem pontos', () => {
  const alvo = G('g1', 12), outra = G('g2', 40);
  assert.equal(resolverGradeDoLaudo([outra, alvo], 'g1').id, 'g1');
});

t('laudo apontando p/ grade ESVAZIADA cai na grade com mais pontos', () => {
  const vazia = G('g1', 0), media = G('g2', 12), maior = G('g3', 40);
  assert.equal(resolverGradeDoLaudo([vazia, media, maior], 'g1').id, 'g3');
});

t('laudo apontando p/ grade INEXISTENTE cai na grade com mais pontos', () => {
  assert.equal(resolverGradeDoLaudo([G('g2', 12), G('g3', 40)], 'sumiu').id, 'g3');
});

t('sem nenhuma grade com pontos, devolve a apontada (ainda que vazia) ou null', () => {
  assert.equal(resolverGradeDoLaudo([G('g1', 0)], 'g1').id, 'g1');
  assert.equal(resolverGradeDoLaudo([], 'g1'), null);
  assert.equal(resolverGradeDoLaudo([G('g9', 0)], 'g1'), null);
});

t('nº do ponto = `numero`; sem ele, `ordem + 1`', () => {
  const g = { id: 'g', pontos: [{ ordem: 0, numero: 7, lng: -50, lat: -20 }, { ordem: 1, lng: -51, lat: -21 }] };
  const m = pontosPorNumero(g);
  assert.deepEqual(m.get(7), { lng: -50, lat: -20 });
  assert.deepEqual(m.get(2), { lng: -51, lat: -21 });
  assert.equal(pontosPorNumero(null).size, 0);
});

t('casamento pelo NÚMERO: cada amostra no seu ponto', () => {
  const pts = casarAmostrasComPontos(amostras([1, 2, 3, 4]), G('g', 10));
  assert.equal(pts.length, 4);
  assert.deepEqual(pts[0], { lng: -50, lat: -20, valor: 10 });
  assert.deepEqual(pts[3], { lng: -50.03, lat: -20.03, valor: 40 });
});

t('LAB RENUMEROU (101..104): fallback por ORDEM casa i-ésima amostra ↔ i-ésimo ponto', () => {
  const pts = casarAmostrasComPontos(amostras([101, 102, 103, 104]), G('g', 10));
  assert.equal(pts.length, 4);
  assert.deepEqual(pts[0], { lng: -50, lat: -20, valor: 1010 });
  assert.deepEqual(pts[1], { lng: -50.01, lat: -20.01, valor: 1020 });
});

t('fallback por ordem respeita a ORDEM DO NÚMERO, não a ordem de chegada', () => {
  const bagunca = [{ numero: 103, valor: 3 }, { numero: 101, valor: 1 }, { numero: 102, valor: 2 }];
  const pts = casarAmostrasComPontos(bagunca, G('g', 10));
  assert.deepEqual(pts.map(p => p.valor), [1, 2, 3]);
});

t('grade MENOR que o laudo não vira fallback por ordem (devolve só o que casou)', () => {
  assert.equal(casarAmostrasComPontos(amostras([101, 102, 103, 104]), G('g', 3)).length, 0);
});

t('menos de 3 amostras: sem fallback por ordem (acerto por acaso não vale)', () => {
  assert.equal(casarAmostrasComPontos(amostras([101, 102]), G('g', 10)).length, 0);
  assert.equal(casarAmostrasComPontos(amostras([1, 2]), G('g', 10)).length, 2); // pelo número, sempre
});

t('sem grade: nenhum ponto (o PDF cai nos rótulos salvos com o mapa)', () => {
  assert.equal(casarAmostrasComPontos(amostras([1, 2, 3]), null).length, 0);
});

t('casamento PARCIAL pelo número (≥3) é aceito sem cair no fallback', () => {
  // 3 das 4 amostras existem na grade → mantém as 3, não reordena por ordem.
  const pts = casarAmostrasComPontos(amostras([1, 2, 3, 99]), G('g', 5));
  assert.deepEqual(pts.map(p => p.valor), [10, 20, 30]);
});

console.log(`\n${ok} ok, ${fail} falha(s)\n`);
process.exit(fail ? 1 : 0);
