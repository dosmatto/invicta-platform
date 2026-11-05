// Testes das contas das páginas extras do Portal do Produtor v2
// (lib/portalPainelExtras): linhas de plantio, relatórios/recomendações e
// comparativo Invicta. Roda: `node scripts/teste-portal-extras.mjs`
import assert from 'node:assert/strict';
import {
  camadasComLinhas, feicoesDaCamada, resumirLinhas, contarFeicoes, caminhoLinhas,
  instanteDe, documentosDoPortal, docsPorTalhao,
  topoPct, diferenca, posicaoNoEixo, linhasFertilidade, ordenarCulturasBench,
} from '../src/lib/portalPainelExtras.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// ── Linhas ──────────────────────────────────────────────────────────────────
const camada = (o = {}) => ({
  resourceId: 'r1', ciclo: 'summer', categoria: 'planting', espacamentoM: 0.5, revisaoGeometria: 2, arquivada: false,
  ultimaSincronizacao: '2026-10-01T10:00:00Z', situacao: 'atualizado',
  revisoes: [{ n: 1, operacao: 'upsert', nFeicoes: 100 }, { n: 2, operacao: 'upsert', nFeicoes: 120 }], ...o,
});

t('camadasComLinhas: sem geometria e arquivada ficam de fora', () => {
  const r = camadasComLinhas([camada(), camada({ revisaoGeometria: null }), camada({ arquivada: true })]);
  assert.equal(r.length, 1);
});
t('feicoesDaCamada: usa a revisão desenhável', () => {
  assert.equal(feicoesDaCamada(camada()), 120);
  assert.equal(feicoesDaCamada(camada({ revisoes: [] })), null);
  assert.equal(feicoesDaCamada(camada({ revisoes: [{ n: 2, operacao: 'upsert', nFeicoes: null }] })), null);
});
t('resumirLinhas: talhões, área, espaçamento mais comum e última sincronização', () => {
  const r = resumirLinhas([
    { talhaoId: 'a', areaHa: 40, camadas: [camada(), camada({ resourceId: 'r2', espacamentoM: 0.45, ultimaSincronizacao: '2026-10-05T10:00:00Z' })] },
    { talhaoId: 'b', areaHa: 60, camadas: [camada({ espacamentoM: 0.5, situacao: 'erro' })] },
    { talhaoId: 'c', areaHa: 30, camadas: [camada({ revisaoGeometria: null })] },
    { talhaoId: 'd', areaHa: 10, camadas: [] },
  ]);
  assert.equal(r.nTalhoes, 2); assert.equal(r.areaHa, 100); assert.equal(r.nCamadas, 3);
  assert.deepEqual(r.espacamentos, [{ m: 0.5, nCamadas: 2 }, { m: 0.45, nCamadas: 1 }]);
  assert.equal(r.ultimaSincronizacao, '2026-10-05T10:00:00Z');
  assert.equal(r.nErro, 1); assert.equal(r.nSincronizando, 0);
});
t('resumirLinhas: vazio não inventa nada', () => {
  const r = resumirLinhas([]);
  assert.equal(r.nTalhoes, 0); assert.equal(r.ultimaSincronizacao, null); assert.deepEqual(r.espacamentos, []);
});
t('contarFeicoes: bordadura = kind headland, o resto é guia', () => {
  const c = contarFeicoes({ features: [{ properties: { kind: 'headland' } }, { properties: { kind: 'guidance' } }, { properties: null }, {}] });
  assert.deepEqual(c, { guia: 3, bordadura: 1 });
  assert.deepEqual(contarFeicoes(null), { guia: 0, bordadura: 0 });
});
t('caminhoLinhas: LineString, MultiLineString, vértices colados e lixo', () => {
  const ponto = (x, y) => [x, y];
  assert.equal(caminhoLinhas({ type: 'LineString', coordinates: [[0, 0], [10, 0]] }, ponto), 'M0 0L10 0');
  assert.equal(caminhoLinhas({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[5, 5], [6, 6]]] }, ponto, 0), 'M0 0L1 1M5 5L6 6');
  // vértice do meio a 0,1 px do anterior é descartado; o último sempre fica
  assert.equal(caminhoLinhas({ type: 'LineString', coordinates: [[0, 0], [0.1, 0], [10, 0]] }, ponto, 0.6), 'M0 0L10 0');
  assert.equal(caminhoLinhas({ type: 'Polygon', coordinates: [] }, ponto), '');
  assert.equal(caminhoLinhas(null, ponto), '');
  assert.equal(caminhoLinhas({ type: 'LineString', coordinates: [[0, 0]] }, ponto), '');
});

// ── Relatórios / recomendações ──────────────────────────────────────────────
const talhao = (id, nome, extra = {}) => ({ talhao: { id, fazendaId: 'f', nome, areaHa: 50, status: 'ativo' }, ...extra });
const dados = [
  talhao('a', 'T1', {
    relatorios: [
      { safra: '26/27', tipo: 'Fertilidade', titulo: 'Relatório completo', geradoEm: 1000 },
      { safra: '25/26', tipo: 'Compactação', titulo: 'Compactação', geradoEm: 5000 },
      { safra: null, tipo: 'Camadas', titulo: 'Camadas', geradoEm: 9000 },
    ],
    cenarios: [{ safra: '26/27', nome: 'Calagem', geradoEm: 2000, oficial: true }],
  }),
  talhao('b', 'T2', { relatorios: [{ safra: '26/27', tipo: null, titulo: null, geradoEm: '2026-10-01T00:00:00Z' }], cenarios: [{ safra: '26/27', nome: null, geradoEm: null, oficial: 'true' }] }),
  talhao('c', 'T3'),
];
t('instanteDe: ms, ISO, texto numérico e lixo', () => {
  assert.equal(instanteDe(1234), 1234);
  assert.equal(instanteDe('2026-10-01T00:00:00Z'), Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(instanteDe('1760000000000'), 1760000000000);
  assert.equal(instanteDe(null), null); assert.equal(instanteDe('xyz'), null); assert.equal(instanteDe(NaN), null);
});
t('documentosDoPortal: filtra pela safra; sem safra só em "todas"', () => {
  const d26 = documentosDoPortal(dados, 2026);
  assert.equal(d26.relatorios.length, 2); assert.equal(d26.cenarios.length, 2);
  const todas = documentosDoPortal(dados, null);
  assert.equal(todas.relatorios.length, 4);
  assert.ok(!d26.relatorios.some(r => r.safra == null));
});
t('documentosDoPortal: mais recente primeiro; textos de reserva; oficial', () => {
  const todas = documentosDoPortal(dados, null);
  assert.equal(todas.relatorios[0].talhaoId, 'b'); // a data ISO de 2026 é a mais recente
  assert.equal(todas.relatorios[1].titulo, 'Camadas'); // 9000
  const t2 = todas.relatorios.find(r => r.talhaoId === 'b');
  assert.equal(t2.tipo, 'Relatório'); assert.equal(t2.titulo, 'Relatório');
  assert.equal(todas.cenarios.find(c => c.talhaoId === 'a').oficial, true);
  assert.equal(todas.cenarios.find(c => c.talhaoId === 'b').oficial, true);
  assert.equal(todas.cenarios.find(c => c.talhaoId === 'b').titulo, 'Recomendação');
  assert.equal(todas.cenarios.find(c => c.talhaoId === 'b').em, null);
});
t('docsPorTalhao: lista também o talhão sem nada', () => {
  const docs = documentosDoPortal(dados, 2026);
  const l = docsPorTalhao(dados, docs);
  assert.equal(l.length, 3);
  const a = l.find(x => x.talhaoId === 'a'), c = l.find(x => x.talhaoId === 'c');
  assert.equal(a.nRelatorios, 1); assert.equal(a.nCenarios, 1); assert.equal(a.ultimo, 2000);
  assert.equal(c.nRelatorios, 0); assert.equal(c.nCenarios, 0); assert.equal(c.ultimo, null);
});

// ── Comparativo ─────────────────────────────────────────────────────────────
t('topoPct: 100 − percentil, mínimo 1, nulo sem dado', () => {
  assert.equal(topoPct(80), 20); assert.equal(topoPct(99.7), 1); assert.equal(topoPct(100), 1);
  assert.equal(topoPct(0), 100); assert.equal(topoPct(37.5), 63); // 62,5 → 63
  assert.equal(topoPct(null), null); assert.equal(topoPct(undefined), null);
});
t('diferenca: absoluta e em % da média', () => {
  assert.deepEqual(diferenca(66, 60), { abs: 6, pct: 10 });
  assert.deepEqual(diferenca(54, 60), { abs: -6, pct: -10 });
  assert.deepEqual(diferenca(5, 0), { abs: 5, pct: null });
  assert.equal(diferenca(null, 60), null); assert.equal(diferenca(60, undefined), null);
});
t('posicaoNoEixo: limita em 0–1', () => {
  assert.equal(posicaoNoEixo(5, 0, 10), 0.5); assert.equal(posicaoNoEixo(-5, 0, 10), 0); assert.equal(posicaoNoEixo(50, 0, 10), 1);
  assert.equal(posicaoNoEixo(3, 4, 4), 0.5);
});
t('linhasFertilidade: só nutrientes com média; você pode faltar', () => {
  const l = linhasFertilidade({ medias: { p: 20, v: 55 }, voce: { p: 25 } });
  assert.deepEqual(l.map(x => x.id), ['p', 'v']);
  assert.equal(l[0].dif.abs, 5); assert.equal(l[0].dif.pct, 25);
  assert.equal(l[1].voce, null); assert.equal(l[1].dif, null);
  assert.deepEqual(linhasFertilidade({ medias: undefined }), []);
  assert.deepEqual(linhasFertilidade(null), []);
});
t('ordenarCulturasBench: a do filtro, depois as com você, depois o resto (estável)', () => {
  const n = s => s.toLowerCase();
  const itens = [{ cultura: 'Trigo' }, { cultura: 'Soja', voce: {} }, { cultura: 'Milho' }, { cultura: 'Feijão', voce: {} }];
  assert.deepEqual(ordenarCulturasBench(itens, '', n).map(x => x.cultura), ['Soja', 'Feijão', 'Trigo', 'Milho']);
  assert.deepEqual(ordenarCulturasBench(itens, 'milho', n).map(x => x.cultura), ['Milho', 'Soja', 'Feijão', 'Trigo']);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
