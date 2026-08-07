// Testes do TAMANHO DOS NÚMEROS sobre o mapa do relatório (tamanhoRotuloPontos).
// Pedido de 07/08/2026: o número saía pequeno demais no PDF impresso — aumentar
// "sem afetar a estética e sem sobrepor nada". A regra: cresce até onde a grade
// deixa (folga = 1º quartil da distância ao vizinho mais próximo), nunca abaixo
// do tamanho histórico (piso) nem acima do teto.
// Roda: `npm run teste:rotulos`.
import assert from 'node:assert/strict';
import { tamanhoRotuloPontos } from '../src/lib/capturaMapa.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const PISO = 12, TETO = 18;
const LARG3 = 21;   // largura de "100" em negrito no piso (px)
const LARG1 = 7;    // largura de "8"

// Malha regular n×n com espaçamento `s` — a distância ao vizinho é exatamente s.
const malha = (n, s) => {
  const p = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) p.push({ x: i * s, y: j * s });
  return p;
};

console.log('\nTamanho dos rótulos no mapa do PDF\n');

t('grade FOLGADA usa o teto (era o caso que saía pequeno demais)', () => {
  assert.equal(tamanhoRotuloPontos(malha(5, 200), LARG3, PISO, TETO), TETO);
});

t('grade APERTADA para no piso — nunca encolhe o que já saía', () => {
  assert.equal(tamanhoRotuloPontos(malha(5, 20), LARG3, PISO, TETO), PISO);
});

t('grade intermediária cresce PARCIALMENTE (entre piso e teto)', () => {
  const tam = tamanhoRotuloPontos(malha(5, 40), LARG3, PISO, TETO);
  assert.ok(tam > PISO && tam < TETO, `esperado entre ${PISO} e ${TETO}, veio ${tam}`);
});

t('rótulo mais LARGO segura o tamanho (mesma grade, texto maior = fonte menor)', () => {
  const estreito = tamanhoRotuloPontos(malha(5, 45), LARG1, PISO, TETO);
  const largo = tamanhoRotuloPontos(malha(5, 45), 34, PISO, TETO);
  assert.ok(largo <= estreito, `largo=${largo} deveria ser ≤ estreito=${estreito}`);
});

t('ALTURA também trava: número de 1 dígito é estreito, mas não pode empilhar', () => {
  // Só pela largura daria o teto; a trava de altura (75% da folga) segura antes.
  const tam = tamanhoRotuloPontos(malha(5, 18), LARG1, PISO, TETO);
  assert.ok(tam < TETO, `esperado < ${TETO} pela altura, veio ${tam}`);
});

t('um par quase coincidente NÃO encolhe o mapa inteiro (quartil, não mínimo)', () => {
  const pts = malha(5, 200);
  pts.push({ x: pts[0].x + 1, y: pts[0].y });     // duplicata praticamente em cima
  assert.equal(tamanhoRotuloPontos(pts, LARG3, PISO, TETO), TETO);
});

t('metade dos pontos apertados puxa o tamanho para baixo', () => {
  const pts = [...malha(4, 200), ...malha(4, 16).map(p => ({ x: p.x + 2000, y: p.y }))];
  assert.ok(tamanhoRotuloPontos(pts, LARG3, PISO, TETO) < TETO);
});

t('um rótulo só (ou nenhum vizinho) usa o teto', () => {
  assert.equal(tamanhoRotuloPontos([{ x: 0, y: 0 }], LARG3, PISO, TETO), TETO);
});

t('largura medida inválida (0) cai no piso, não em NaN', () => {
  assert.equal(tamanhoRotuloPontos(malha(5, 200), 0, PISO, TETO), PISO);
});

t('o resultado é sempre inteiro e dentro de [piso, teto]', () => {
  for (const s of [4, 9, 17, 23, 31, 55, 90, 140, 300]) {
    for (const larg of [LARG1, LARG3, 40]) {
      const tam = tamanhoRotuloPontos(malha(6, s), larg, PISO, TETO);
      assert.equal(tam, Math.round(tam), `s=${s} larg=${larg} não é inteiro`);
      assert.ok(tam >= PISO && tam <= TETO, `s=${s} larg=${larg} fora da faixa: ${tam}`);
    }
  }
});

t('SEM SOBREPOSIÇÃO enquanto o tamanho não bate no piso', () => {
  // Largura do texto no canvas escala LINEARMENTE com o corpo da fonte, então a
  // largura no tamanho escolhido = larguraNoPiso × (tam/piso). Numa malha
  // regular de espaçamento s, dois vizinhos (centrados no ponto) só encostam se
  // a largura passar de s (horizontal) ou o corpo da fonte passar de s (vertical).
  for (const s of [30, 45, 60, 80, 120, 200]) {
    for (const larg of [LARG1, LARG3, 34]) {
      const tam = tamanhoRotuloPontos(malha(6, s), larg, PISO, TETO);
      if (tam === PISO) continue;                    // regime do piso: mantém o histórico
      const largNoTam = larg * (tam / PISO);
      assert.ok(largNoTam < s, `s=${s} larg=${larg}: rótulo ${largNoTam.toFixed(1)}px encosta no vizinho`);
      assert.ok(tam < s, `s=${s} larg=${larg}: altura ${tam}px encosta no vizinho de cima`);
    }
  }
});

t('grade grande (600+ pontos) não trava e continua coerente', () => {
  const pts = malha(30, 60);   // 900 pontos → amostrado internamente
  const tam = tamanhoRotuloPontos(pts, LARG3, PISO, TETO);
  assert.ok(tam >= PISO && tam <= TETO);
});

console.log(`\n${ok} ok, ${fail} falha(s)\n`);
process.exit(fail ? 1 : 0);
