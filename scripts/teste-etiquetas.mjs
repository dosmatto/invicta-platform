// Testes das etiquetas de amostra (src/lib/etiquetas.ts).
//
// O que estraga uma folha de etiqueta não é o texto — é a GEOMETRIA. Uma linha
// a mais por folha, um pitch diferente do tamanho da etiqueta, ou uma margem
// que não centraliza, e a impressão inteira sai deslocada: 100 folhas adesivas
// no lixo e as amostras sem identificação no laboratório. E como a etiqueta é
// colada num saco de terra e lida no galpão, texto que estoura a largura (ou
// que o jsPDF quebra em duas linhas por conta própria, invadindo a faixa de
// baixo) é erro de leitura de número de amostra.
//
// Rodar: npm run teste:etiquetas

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUTS_ETIQUETA, LAYOUT_PADRAO, layoutPorId, itensDeGrade, desenharEtiquetas,
} from '../src/lib/etiquetas.ts';

const MM_PT = 2.83465;
const perto = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;

// ── Doc falso: registra o que seria desenhado ────────────────────────────────
// Larguras aproximadas da Helvetica (em em). Só precisam ser boas o bastante
// para pegar texto estourando a etiqueta.
function larguraEm(ch) {
  if (/[0-9]/.test(ch)) return 0.556;
  if (ch === ' ') return 0.278;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[.,:;'|/·-]/.test(ch)) return 0.3;
  return 0.55;
}

function docFalso() {
  const d = {
    paginas: 1, textos: [], retangulos: [], _fs: 12,
    setFont() {}, setTextColor() {}, setDrawColor() {}, setLineWidth() {},
    setFontSize(v) { d._fs = v; },
    getTextWidth(t) { return [...t].reduce((s, c) => s + larguraEm(c), 0) * d._fs / MM_PT; },
    rect(x, y, w, h) { d.retangulos.push({ x, y, w, h }); },
    addPage() { d.paginas++; },
    text(txt, x, y, opts) {
      d.textos.push({ txt, x, y, fs: d._fs, opts: opts ?? {}, larguraMm: d.getTextWidth(txt) });
    },
  };
  return d;
}

const ITEM = { titulo: 'NHAZINHA 80', numero: '001', sub: '00-20 cm', rodape: 'Ano 25/26 · 1ª época' };
const layout = id => LAYOUTS_ETIQUETA.find(l => l.id === id);

// ── Padrão da casa ───────────────────────────────────────────────────────────
test('A A4350 é o padrão e é o primeiro da lista', () => {
  assert.equal(LAYOUT_PADRAO, 'A4350');
  // O <select> abre no primeiro; se o padrão não for o primeiro, a tela mostra
  // um modelo e o PDF sai em outro.
  assert.equal(LAYOUTS_ETIQUETA[0].id, LAYOUT_PADRAO);
});

test('layoutPorId cai no padrão quando o id não existe (ou some)', () => {
  assert.equal(layoutPorId('A4361').id, 'A4361');
  assert.equal(layoutPorId(undefined).id, LAYOUT_PADRAO);
  assert.equal(layoutPorId('folha-que-foi-removida').id, LAYOUT_PADRAO);
});

test('A4350: 10 etiquetas de 99,0 × 55,8 mm numa A4', () => {
  const l = layout('A4350');
  assert.equal(l.cols * l.rows, 10);
  assert.equal(l.labelW, 99);
  assert.equal(l.labelH, 55.8);
  assert.equal(l.pageW, 210);
  assert.equal(l.pageH, 297);
  // Centralizada: 2×99 = 198 (6 mm de cada lado) e 5×55,8 = 279 (9 mm em cima e embaixo).
  assert.ok(perto(l.marginLeft * 2 + l.cols * l.labelW, l.pageW), 'margens laterais não centralizam');
  assert.ok(perto(l.marginTop * 2 + l.rows * l.labelH, l.pageH), 'margens verticais não centralizam');
});

// ── Geometria de todos os presets ────────────────────────────────────────────
for (const l of LAYOUTS_ETIQUETA) {
  test(`${l.id}: a grade inteira cabe na folha e não se sobrepõe`, () => {
    assert.ok(l.pitchX >= l.labelW - 0.001, `${l.id}: pitch horizontal menor que a etiqueta (sobreposição)`);
    assert.ok(l.pitchY >= l.labelH - 0.001, `${l.id}: pitch vertical menor que a etiqueta (sobreposição)`);
    const direita = l.marginLeft + (l.cols - 1) * l.pitchX + l.labelW;
    const fundo = l.marginTop + (l.rows - 1) * l.pitchY + l.labelH;
    assert.ok(direita <= l.pageW + 0.001, `${l.id}: estoura a largura da folha (${direita} > ${l.pageW})`);
    assert.ok(fundo <= l.pageH + 0.001, `${l.id}: estoura a altura da folha (${fundo} > ${l.pageH})`);
    assert.ok(l.marginLeft >= 0 && l.marginTop >= 0);
  });
}

// ── Itens a partir da grade ──────────────────────────────────────────────────
test('itensDeGrade dá uma etiqueta por ponto × profundidade', () => {
  const grade = {
    safra: 2025, epoca: 1,
    profundidades: [{ rotulo: '0-20' }, { rotulo: '20-40' }],
    pontos: [
      { ordem: 0, profs: 2, profundidades: ['0-20', '20-40'] },
      { ordem: 1, profs: 1, profundidades: ['0-20'] },
    ],
  };
  const itens = itensDeGrade('NHAZINHA 80', grade);
  assert.equal(itens.length, 3);
  assert.deepEqual(itens.map(i => i.numero), ['001', '001', '002']);
  assert.deepEqual(itens.map(i => i.sub), ['0-20 cm', '20-40 cm', '0-20 cm']);
  assert.ok(itens.every(i => i.titulo === 'NHAZINHA 80'));
});

// ── Desenho na A4350 ─────────────────────────────────────────────────────────
test('A4350: 10 por página — a 11ª abre folha nova', () => {
  const l = layout('A4350');
  const d = docFalso();
  desenharEtiquetas(d, Array.from({ length: 11 }, (_, i) => ({ ...ITEM, numero: String(i + 1).padStart(3, '0') })), l);
  assert.equal(d.paginas, 2);
});

test('A4350: a 1ª etiqueta começa em 6 mm / 9 mm e a 2ª coluna em 105 mm', () => {
  const l = layout('A4350');
  const d = docFalso();
  desenharEtiquetas(d, Array.from({ length: 3 }, () => ITEM), l);
  // Tudo centralizado: o x de cada texto é o centro da etiqueta.
  const centros = [...new Set(d.textos.map(t => Math.round(t.x * 100) / 100))].sort((a, b) => a - b);
  assert.deepEqual(centros, [55.5, 154.5]);   // 6 + 99/2  e  6 + 99 + 99/2
});

test('A4350: os quatro campos saem, e nenhum escapa da etiqueta', () => {
  const l = layout('A4350');
  const d = docFalso();
  desenharEtiquetas(d, [ITEM], l);
  assert.deepEqual(d.textos.map(t => t.txt), [ITEM.titulo, ITEM.numero, ITEM.sub, ITEM.rodape]);

  const x0 = l.marginLeft, y0 = l.marginTop;
  for (const t of d.textos) {
    const alturaMm = t.fs * 0.717 / MM_PT;          // topo aproximado das maiúsculas
    const descidaMm = t.fs * 0.21 / MM_PT;          // descida do g/p/ç
    assert.ok(t.y - alturaMm >= y0 - 0.001, `"${t.txt}" sobe acima da etiqueta`);
    assert.ok(t.y + descidaMm <= y0 + l.labelH + 0.001, `"${t.txt}" desce abaixo da etiqueta`);
    assert.ok(t.larguraMm <= l.labelW - 3, `"${t.txt}" (${t.larguraMm.toFixed(1)} mm) estoura a largura útil`);
    assert.ok(t.x - t.larguraMm / 2 >= x0, `"${t.txt}" vaza pela esquerda`);
    assert.ok(t.x + t.larguraMm / 2 <= x0 + l.labelW, `"${t.txt}" vaza pela direita`);
  }
});

test('A4350: nada se cruza — as quatro faixas saem em ordem, de cima para baixo', () => {
  const d = docFalso();
  desenharEtiquetas(d, [ITEM], layout('A4350'));
  const [tit, num, sub, rod] = d.textos;
  const topo = t => t.y - t.fs * 0.717 / MM_PT;
  assert.ok(tit.y < topo(num), 'título encosta no número');
  assert.ok(num.y < topo(sub), 'número encosta na profundidade');
  assert.ok(sub.y < topo(rod), 'profundidade encosta no rodapé');
});

// ── A regra do `k`: cresce nas grandes, não encolhe nas pequenas ─────────────
test('A4361 e as menores saem EXATAMENTE como antes (9 / 13 / 8 pt)', () => {
  for (const id of ['A4361', 'A4260', 'A4355', 'A4356', '6181', 'generico']) {
    const l = layout(id);
    const d = docFalso();
    desenharEtiquetas(d, [ITEM], l);
    const por = txt => d.textos.find(t => t.txt === txt);
    assert.equal(por(ITEM.numero).fs, l.labelH * 0.42 * MM_PT, `${id}: número mudou de tamanho`);
    if (por(ITEM.titulo)) assert.equal(por(ITEM.titulo).fs, 9, `${id}: título mudou de tamanho`);
    if (por(ITEM.sub)) assert.equal(por(ITEM.sub).fs, Math.min(13, Math.max(7, l.labelH * 0.17 * MM_PT)), `${id}: profundidade mudou`);
    if (por(ITEM.rodape)) assert.equal(por(ITEM.rodape).fs, 8, `${id}: rodapé mudou de tamanho`);
  }
});

test('A4350: título, profundidade e rodapé crescem junto com o número (k = 55,8/46,5)', () => {
  const k = 55.8 / 46.5;
  const d = docFalso();
  desenharEtiquetas(d, [ITEM], layout('A4350'));
  const [tit, num, sub, rod] = d.textos;
  assert.ok(perto(tit.fs, 9 * k, 0.01), `título ${tit.fs} ≠ ${9 * k}`);
  assert.ok(perto(sub.fs, 13 * k, 0.01), `profundidade ${sub.fs} ≠ ${13 * k}`);
  assert.ok(perto(rod.fs, 8 * k, 0.01), `rodapé ${rod.fs} ≠ ${8 * k}`);
  assert.ok(perto(num.fs, 55.8 * 0.42 * MM_PT, 0.01));
  // A proporção com o número é a mesma da A4361 — é a "mesma cara, tudo maior".
  const d61 = docFalso();
  desenharEtiquetas(d61, [ITEM], layout('A4361'));
  assert.ok(perto(num.fs / tit.fs, d61.textos[1].fs / d61.textos[0].fs, 0.01), 'proporção número/título mudou');
});

// ── Texto comprido ───────────────────────────────────────────────────────────
test('nome de talhão comprido ENCOLHE — não quebra em duas linhas', () => {
  const l = layout('A4355');   // a mais apertada que ainda mostra título
  const d = docFalso();
  const longo = { ...ITEM, titulo: 'FAZENDA SANTO ANDRE - TALHAO NOROESTE 12B' };
  desenharEtiquetas(d, [longo], l);
  const tit = d.textos.find(t => t.txt === longo.titulo);
  // maxWidth faria o jsPDF empurrar a 2ª linha para dentro da faixa do número.
  assert.equal(tit.opts.maxWidth, undefined, 'voltou a usar maxWidth (quebra de linha)');
  assert.ok(tit.fs < 9, 'não encolheu');
  assert.ok(tit.larguraMm <= l.labelW - 3, 'encolheu mas ainda estoura');
});

test('número de 4 dígitos ainda cabe na A4350', () => {
  const d = docFalso();
  desenharEtiquetas(d, [{ ...ITEM, numero: '1234' }], layout('A4350'));
  const num = d.textos.find(t => t.txt === '1234');
  assert.ok(num.larguraMm <= 99 - 3.75, `1234 estourou (${num.larguraMm.toFixed(1)} mm)`);
});
