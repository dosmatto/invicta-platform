// TESTE dos gráficos da diagnose foliar (lib/foliarGraficos.ts): roda as quatro
// funções de desenho contra um contexto de canvas FALSO e confere que nenhuma
// quebra — inclusive com entrada vazia, NaN e um ponto só. npm run teste:foliar-graficos
import {
  desenharBarrasIndices, desenharRadar, desenharMatrizConcordancia, desenharLinhaIbn,
  TEMA_CLARO,
} from '../src/lib/foliarGraficos.ts';

function ctxFalso() {
  const chamadas = [];
  const reg = nome => (...args) => { chamadas.push([nome, args]); };
  return {
    chamadas,
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    beginPath: reg('beginPath'), closePath: reg('closePath'), moveTo: reg('moveTo'),
    lineTo: reg('lineTo'), arc: reg('arc'), fill: reg('fill'), stroke: reg('stroke'),
    fillRect: reg('fillRect'), clearRect: reg('clearRect'), fillText: reg('fillText'),
    setTransform: reg('setTransform'),
  };
}

const dims = { largura: 320, altura: 200 };
let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('  ok', nome); } catch (e) { console.error('  FALHA', nome, e); process.exitCode = 1; } };

t('barras: caso normal desenha texto e retângulos', () => {
  const c = ctxFalso();
  desenharBarrasIndices(c, [
    { rotulo: 'N', valor: -8.3, cor: '#dc2626' },
    { rotulo: 'K', valor: 0, cor: '#22c55e' },
    { rotulo: 'P', valor: 5.1, cor: '#7c3aed' },
  ], dims);
  if (!c.chamadas.some(([n]) => n === 'fillRect')) throw new Error('sem barra');
  if (!c.chamadas.some(([n, a]) => n === 'fillText' && a[0] === 'N')) throw new Error('sem rótulo N');
});
t('barras: lista vazia e valores não finitos não quebram', () => {
  desenharBarrasIndices(ctxFalso(), [], dims);
  desenharBarrasIndices(ctxFalso(), [{ rotulo: 'N', valor: NaN, cor: '#fff' }], dims);
});
t('radar: 11 nutrientes fecha o polígono', () => {
  const c = ctxFalso();
  const p = ['N', 'P', 'K', 'Ca', 'Mg', 'S', 'B', 'Cu', 'Fe', 'Mn', 'Zn'].map((r, i) => ({ rotulo: r, valor: i - 5 }));
  desenharRadar(c, p, dims);
  if (!c.chamadas.some(([n]) => n === 'closePath')) throw new Error('polígono aberto');
});
t('radar: menos de 3 eixos não desenha (e não quebra)', () => {
  const c = ctxFalso();
  desenharRadar(c, [{ rotulo: 'N', valor: 1 }, { rotulo: 'P', valor: -1 }], dims);
  if (c.chamadas.length) throw new Error('desenhou com 2 eixos');
});
t('matriz: pinta uma célula por coluna e escreve o rótulo da linha', () => {
  const c = ctxFalso();
  desenharMatrizConcordancia(c, {
    colunas: ['DRIS', 'CND', 'Faixa', 'Chance', 'Consenso'],
    linhas: [
      { rotulo: 'N', celulas: [{ texto: 'Def.', cor: '#dc2626' }, { texto: '—', cor: '#1e293b', corTexto: '#64748b' }, { texto: 'Def.', cor: '#dc2626' }, { texto: '—', cor: '#1e293b' }, { texto: 'Def.', cor: '#dc2626' }] },
      { rotulo: 'K', celulas: [{ texto: 'Adeq.', cor: '#22c55e' }, { texto: 'Adeq.', cor: '#22c55e' }, { texto: 'Exc.', cor: '#7c3aed' }, { texto: '—', cor: '#1e293b' }, { texto: 'Adeq.', cor: '#22c55e' }] },
    ],
  }, dims);
  const rects = c.chamadas.filter(([n]) => n === 'fillRect').length;
  if (rects !== 10) throw new Error(`esperava 10 células, veio ${rects}`);
});
t('matriz: sem linhas não quebra', () => {
  desenharMatrizConcordancia(ctxFalso(), { colunas: ['DRIS'], linhas: [] }, dims);
});
t('linha do IBN: buraco quebra a linha (2 pontos ⇒ 0 segmentos)', () => {
  const c = ctxFalso();
  desenharLinhaIbn(c, [
    { rotulo: '2024', valor: 30 }, { rotulo: '2025', valor: null }, { rotulo: '2026', valor: 12 },
  ], dims);
  // 3 linhas de grade + nenhum segmento ligando 2024 a 2026.
  const strokes = c.chamadas.filter(([n]) => n === 'stroke').length;
  if (strokes !== 3) throw new Error(`esperava só as 3 linhas de grade, veio ${strokes}`);
});
t('linha do IBN: um ponto só, e lista toda nula, não quebram', () => {
  desenharLinhaIbn(ctxFalso(), [{ rotulo: '2026', valor: 9 }], dims);
  desenharLinhaIbn(ctxFalso(), [{ rotulo: '2026', valor: null }], dims);
  desenharLinhaIbn(ctxFalso(), [], dims);
});
t('tema claro pinta o fundo branco', () => {
  const c = ctxFalso();
  desenharBarrasIndices(c, [{ rotulo: 'N', valor: 1, cor: '#000' }], dims, { tema: TEMA_CLARO });
  if (!c.chamadas.some(([n, a]) => n === 'fillRect' && a[2] === dims.largura)) throw new Error('sem fundo');
});

console.log(`\n${ok} ok`);
