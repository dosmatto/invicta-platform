// Testes dos números do Portal do Produtor v2 (lib/portalPainel) — KPIs,
// classes com ha e %, régua "abaixo do crítico", médias ponderadas, Pearson,
// série de índices e a projeção do mini-mapa.
//
// O caso que a tela tem de acertar: cinco talhões de Soja com tamanhos
// diferentes (a média TEM de ser ponderada pela área), um de Milho no mesmo
// ano (não pode entrar na média da Soja) e o ano anterior para a variação.
// Roda: `node scripts/teste-portal-painel.mjs`
import assert from 'node:assert/strict';
import {
  normCultura, rotuloCultura, mediaPonderada, variacaoPct, colheitaDoAno, culturasDoAno, talhaoDaCultura,
  produtividadePorTalhao, kpiProdutividade, kpisPainel, historicoProdutividade,
  classesEmSacas, distribuirEmClasses, coresRelativas, classesCriticas, abaixoDoCritico,
  ultimoLaudo, mediasDoLaudo, fertilidadePorTalhao, mediasPonderadasAtributos, evolucaoAtributo,
  cePorTalhao, relevoPorTalhao, resumoRelevo, resumoZonas, cenasIndice, picoNdvi, serieIndices,
  pearson, betaIncompleta, interpretarR, rotuloP, correlacoes, alertasPropriedade, resumoPorTalhao,
  projetarMapa, caminhoGeo, caixaDosBounds, MIN_TALHOES_CORRELACAO,
  cicloDeData, rotuloCiclo, MESES_DO_CICLO, ordemNoCiclo, naJanela,
  areaColhidaPorCultura, culturaPredominanteDoAno, culturaEfetiva, talhoesSemColheita, rotuloCicloMeses, tituloCulturaPredominante,
} from '../src/lib/portalPainel.ts';
import { ITENS_MENU, itemDaRota, itemLiberado } from '../src/components/portal/shell/menu.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };
const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

// ── Fixtures ────────────────────────────────────────────────────────────────
const quad = (w, s, l, a) => JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w, s], [w + l, s], [w + l, s + a], [w, s + a], [w, s]]] } });
const amostras = (n, prof, base) => Array.from({ length: n }, (_, i) => ({ numero: i + 1, profundidade: prof, valores: { p: base.p, k: base.k, v: base.v, ph: base.ph } }));
// Legenda de 5 classes (forma das oficiais): bordas 6/12/18/30 para P.
const cls5 = (b, nomes = ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto']) => {
  const mm = [[null, b[0]], [b[0], b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], null]];
  const cores = ['#B00000', '#D4A800', '#7CFC00', '#66CCFF', '#C77DFF'];
  return nomes.map((nome, i) => ({ nome, valorMin: mm[i][0], valorMax: mm[i][1], corInicio: cores[i], corFim: cores[i], larguraVisual: 20, ordem: i + 1 }));
};
const LEG_P = cls5([6, 12, 18, 30]);
const LEG_K = cls5([0.08, 0.15, 0.3, 0.6]);
const LEG_V = cls5([40, 50, 60, 70]);
// Produtividade de Soja em kg/ha (oficial: 2700/3600/4500/5400) → sc/ha 45/60/75/90.
const LEG_PROD_SOJA = cls5([2700, 3600, 4500, 5400], ['Muito Baixa', 'Baixa', 'Média', 'Alta', 'Muito Alta']);

let seq = 0;
const tal = (nome, area, extra = {}) => {
  const id = `T${++seq}`;
  return { talhao: { id, fazendaId: 'F1', nome, areaHa: area, status: 'ativo', geojson: quad(-50 + seq * 0.02, -25, 0.01, 0.01) }, ...extra(id) };
};
const col = (ano, cultura, kgha, area, oficial = true, extra = {}) => ({ safra: `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`, ano, oficial, cultura, criadoEm: `${ano}-04-01T00:00:00Z`, stats: { mediaKgha: kgha, areaHa: area, minKgha: kgha - 600, maxKgha: kgha + 600, cv: 12 }, ...extra });

// 5 talhões de Soja em 2026 (área 10, 20, 30, 40, 100) + 1 de Milho.
const SOJA = [
  tal('A', 10,  id => ({ cultura: 'Soja', colheitas: [col(2026, 'Soja', 3000, 10), col(2025, 'Soja', 2700, 10)], laudos: [{ id: id + 'l', safra: '26/27', ano: 2026, criadoEm: '2026-02-01', resultados: [...amostras(4, '0-20', { p: 5, k: 0.1, v: 45, ph: 5 }), ...amostras(4, '20-40', { p: 2, k: 0.05, v: 30, ph: 4.5 })] }],
    condutividade: [{ oficial: true, criadoEm: '2024-01-01', profundidades: ['0-30'], profundidadeOficial: '0-30', pontos: [{ valores: { '0-30': 10 } }, { valores: { '0-30': 14 } }] }],
    mdes: [{ oficial: true, criadoEm: '2024-01-01', stats: { alt_min: 900, alt_med: 910, alt_max: 920, amplitude: 20, decl_media: 2, decl_max: 5 } }],
    zonasFc: [{ classe: 'Alta', areaHa: 4 }, { classe: 'Baixa', areaHa: 6 }],
    mapasNuvem: [
      { id: `${id}__ndvi__NDVI__2026-01-10`, indice: 'NDVI', cena: { data: '2026-01-10' }, stats: { media: 0.6 } },
      { id: `${id}__ndvi__NDVI__2026-02-10`, indice: 'NDVI', cena: { data: '2026-02-10' }, stats: { media: 0.8 } },
      { id: `${id}__ndvi__NDRE__2026-02-10`, indice: 'NDRE', cena: { data: '2026-02-10' }, stats: { media: 0.5 } },
      { id: `${id}__ndvi__NDVI__2025-02-10`, indice: 'NDVI', cena: { data: '2025-02-10' }, stats: { media: 0.9 } },
    ] })),
  tal('B', 20,  id => ({ cultura: 'Soja', colheitas: [col(2026, 'Soja', 3600, 20)], laudos: [{ id: id + 'l', safra: '25/26', ano: 2025, criadoEm: '2025-02-01', resultados: amostras(4, '0-20', { p: 20, k: 0.4, v: 65, ph: 5.5 }) }],
    condutividade: [{ oficial: true, criadoEm: '2024-01-01', profundidadeOficial: '0-30', pontos: [{ valores: { '0-30': 20 } }] }],
    mdes: [{ oficial: true, criadoEm: '2024-01-01', stats: { alt_min: 905, alt_med: 915, alt_max: 930, amplitude: 25, decl_media: 4, decl_max: 8 } }],
    mapasNuvem: [{ id: `${id}__ndvi__NDVI__2026-02-11`, indice: 'NDVI', cena: { data: '2026-02-11' }, stats: { media: 0.7 } }] })),
  tal('C', 30,  () => ({ cultura: 'soja', colheitas: [col(2026, 'SOJA', 4200, 30)],
    condutividade: [{ oficial: true, criadoEm: '2024-01-01', profundidadeOficial: '0-30', pontos: [{ valores: { '0-30': 30 } }] }],
    mdes: [{ oficial: true, criadoEm: '2024-01-01', stats: { alt_min: 910, alt_med: 920, alt_max: 940, amplitude: 30, decl_media: 3, decl_max: 6 } }] })),
  tal('D', 40,  () => ({ cultura: 'Soja', colheitas: [col(2026, 'Soja', 4800, 40)],
    condutividade: [{ oficial: true, criadoEm: '2024-01-01', profundidadeOficial: '0-30', pontos: [{ valores: { '0-30': 40 } }] }],
    mdes: [{ oficial: true, criadoEm: '2024-01-01', stats: { alt_min: 915, alt_med: 925, alt_max: 950, amplitude: 35, decl_media: 2, decl_max: 4 } }],
    prescricoes: [{ ano: '26/27', nome: 'Calcário', atualizadoEm: '2026-01-01', exportes: [] }] })),
  tal('E', 100, () => ({ cultura: 'Soja', colheitas: [col(2026, 'Soja', 5400, 100), col(2026, 'Soja', 1000, 100, false)],
    condutividade: [{ oficial: true, criadoEm: '2024-01-01', profundidadeOficial: '0-30', pontos: [{ valores: { '0-30': 50 } }] }],
    mdes: [{ oficial: true, criadoEm: '2024-01-01', stats: { alt_min: 920, alt_med: 930, alt_max: 960, amplitude: 40, decl_media: 1, decl_max: 3 } }] })),
];
const MILHO = tal('M', 50, () => ({ cultura: 'Milho', colheitas: [col(2026, 'Milho', 9000, 50)] }));
const VAZIO = tal('V', 25, () => ({}));
const TODOS = [...SOJA, MILHO, VAZIO];

// ── Básicos ─────────────────────────────────────────────────────────────────
t('cultura: normaliza para comparar e capitaliza para mostrar', () => {
  assert.equal(normCultura(' SÓJA '), 'soja');
  assert.equal(rotuloCultura('SOJA'), 'Soja');
  assert.equal(rotuloCultura(''), '');
});
t('média ponderada ignora sem valor e peso zero; variação % com base', () => {
  assert.equal(mediaPonderada([{ valor: 10, peso: 1 }, { valor: 20, peso: 3 }, { valor: null, peso: 5 }, { valor: 99, peso: 0 }]), 17.5);
  assert.equal(mediaPonderada([]), null);
  assert.equal(variacaoPct(110, 100), 10);
  assert.equal(variacaoPct(110, null), null);
  assert.equal(variacaoPct(110, 0), null);
});

// ── Produtividade ───────────────────────────────────────────────────────────
t('colheita do ano: a OFICIAL ganha da mais recente; cultura filtra', () => {
  const e = SOJA[4];
  assert.equal(colheitaDoAno(e, 2026).stats.mediaKgha, 5400);
  assert.equal(colheitaDoAno(MILHO, 2026, 'soja'), null);
  assert.equal(colheitaDoAno(e, null), null);
});
t('culturas do ano por área; talhão da cultura por plantio ou colheita', () => {
  assert.deepEqual(culturasDoAno(TODOS, 2026), ['Soja', 'Milho']);
  assert.equal(talhaoDaCultura(MILHO, 2026, 'Soja'), false);
  assert.equal(talhaoDaCultura(SOJA[2], 2026, 'Soja'), true);
  assert.equal(talhaoDaCultura(VAZIO, 2026, ''), true);
});
t('KPI de produtividade: ponderado pela área colhida, cultura predominante, delta vs. ano anterior', () => {
  const k = kpiProdutividade(TODOS, 2026);
  // Soja (200 ha) > Milho (50 ha). (50·10 + 60·20 + 70·30 + 80·40 + 90·100) / 200 = 80
  assert.equal(k.cultura, 'Soja');
  assert.equal(k.media, 80);
  assert.equal(k.n, 5);
  assert.equal(k.outrasCulturas, true);
  // 2025: só o talhão A, 45 sc/ha → +77,8%
  assert.equal(k.anterior, 45);
  assert.equal(k.deltaPct, 77.8);
  assert.equal(k.min, 50); assert.equal(k.max, 90);
  assert.equal(k.dentroDoTalhao, false);
  const m = kpiProdutividade(TODOS, 2026, 'milho');
  assert.equal(m.cultura, 'Milho'); assert.equal(m.media, 150); assert.equal(m.anterior, null); assert.equal(m.deltaPct, null);
  assert.equal(kpiProdutividade([VAZIO], 2026), null);
});
t('KPI de UM talhão: amplitude é a do próprio mapa', () => {
  const k = kpiProdutividade([SOJA[1]], 2026);
  assert.equal(k.dentroDoTalhao, true);
  assert.equal(k.min, 50); assert.equal(k.max, 70);
});
t('histórico do talhão: um ponto por ano', () => {
  assert.deepEqual(historicoProdutividade(SOJA[0]).map(h => [h.ano, h.mediaScHa]), [[2025, 45], [2026, 50]]);
});
t('KPIs: área mapeada, zonas e recomendação em ha e %', () => {
  const k = kpisPainel(TODOS, 2026);
  assert.equal(k.nTalhoes, 7);
  assert.equal(k.areaTotal, 275);
  assert.equal(k.areaMapeada, 250);  // todos menos o vazio
  assert.equal(k.areaZonas, 10); assert.equal(k.pctZonas, 3.6);
  assert.equal(k.areaRecomendacao, 40); assert.equal(k.nRecomendacao, 1);
});

// ── Classes ─────────────────────────────────────────────────────────────────
t('classes em sc/ha e distribuição por talhão com ha e %', () => {
  const sc = classesEmSacas(LEG_PROD_SOJA);
  assert.deepEqual(sc.map(c => [c.valorMin, c.valorMax]), [[null, 45], [45, 60], [60, 75], [75, 90], [90, null]]);
  const prods = produtividadePorTalhao(SOJA, 2026, 'Soja');
  const d = distribuirEmClasses([...prods.map(p => ({ id: p.talhaoId, valor: p.mediaScHa, areaHa: p.areaHa })), { id: 'x', valor: null, areaHa: 7 }], sc);
  // 50 e 60 → Baixa (45,60]; 70 → Média; 80 e 90 → Alta (75,90]
  assert.deepEqual(d.classes.map(c => [c.nome, c.ha, c.n]), [['Muito Baixa', 0, 0], ['Baixa', 30, 2], ['Média', 30, 1], ['Alta', 140, 2], ['Muito Alta', 0, 0]]);
  assert.equal(d.classes[3].pct, 70);
  assert.deepEqual(d.semDado, { ha: 7, n: 1 });
  assert.equal(d.areaComDado, 200);
  assert.equal(d.classePorId[SOJA[0].talhao.id], 'Baixa');
  assert.ok(d.corPorId[SOJA[0].talhao.id].startsWith('#'));
});
t('cores relativas: menor → primeira cor, maior → última', () => {
  const r = coresRelativas([{ id: 'a', valor: 1 }, { id: 'b', valor: 3 }, { id: 'c', valor: null }], ['#000', '#888', '#fff']);
  assert.deepEqual(r.corPorId, { a: '#000', b: '#fff' });
  assert.equal(r.min, 1); assert.equal(r.max, 3);
});
t('régua crítica: Muito baixo + Baixo pelo nome; sem nome, as duas primeiras; invertida = null', () => {
  assert.deepEqual([...classesCriticas(LEG_P)], ['Muito Baixo', 'Baixo']);
  const semNome = cls5([1, 2, 3, 4], ['N1', 'N2', 'N3', 'N4', 'N5']);
  assert.deepEqual([...classesCriticas(semNome)], ['N1', 'N2']);
  assert.equal(classesCriticas(LEG_P, true), null);
  assert.equal(abaixoDoCritico(5, LEG_P), true);
  assert.equal(abaixoDoCritico(12, LEG_P), true);   // fronteira (6,12] ainda é Baixo
  assert.equal(abaixoDoCritico(12.1, LEG_P), false);
  assert.equal(abaixoDoCritico(null, LEG_P), null);
});

// ── Fertilidade ─────────────────────────────────────────────────────────────
t('último laudo até o ano e médias da camada mais rasa', () => {
  const l = ultimoLaudo(SOJA[0].laudos, 2026);
  const m = mediasDoLaudo(l, ['p', 'v']);
  assert.equal(m.profundidade, '0-20');
  assert.deepEqual(m.valores, { p: 5, v: 45 });
  assert.equal(ultimoLaudo(SOJA[0].laudos, 2025), null, 'laudo de 2026 não vale para 2025');
});
t('fertilidade por talhão + média ponderada pela área', () => {
  const f = fertilidadePorTalhao(SOJA, 2026, ['p', 'v']);
  assert.equal(f.length, 2);
  const m = mediasPonderadasAtributos(f, ['p', 'v']);
  // P: (5·10 + 20·20) / 30 = 15
  assert.equal(m.p.valor, 15); assert.equal(m.p.n, 2); assert.equal(m.p.areaHa, 30);
});
t('evolução de P por ano, ponderada entre os talhões do ano', () => {
  assert.deepEqual(evolucaoAtributo(SOJA, 'p').map(e => [e.ano, e.valor, e.nTalhoes]), [[2025, 20, 1], [2026, 5, 1]]);
});

// ── CE, relevo, zonas, satélite ─────────────────────────────────────────────
t('CE do talhão: média dos pontos na profundidade oficial', () => {
  const c = cePorTalhao(SOJA[0]);
  assert.equal(c.media, 12); assert.equal(c.min, 10); assert.equal(c.max, 14); assert.equal(c.n, 2);
  assert.equal(cePorTalhao(VAZIO), null);
});
t('relevo: extremos entre talhões e declividade ponderada', () => {
  const r = resumoRelevo(SOJA.map(relevoPorTalhao).filter(Boolean));
  assert.equal(r.altMin, 900); assert.equal(r.altMax, 960); assert.equal(r.amplitude, 60);
  // (2·10 + 4·20 + 3·30 + 2·40 + 1·100) / 200 = 1,85 → 1,9
  assert.equal(r.declMedia, 1.9);
  assert.equal(resumoRelevo([]), null);
});
t('zonas: área por classe, ordem alta → baixa; zona numerada vira "Zona N"', () => {
  const z = resumoZonas([SOJA[0], { talhao: { id: 'Z', fazendaId: 'F', nome: 'Z', areaHa: 5 }, zonasFc: [{ classe: 'Z1', zona: 2, areaHa: 5 }] }]);
  assert.deepEqual(z.zonas.map(x => [x.rotulo, x.ha]), [['Zona alta', 4], ['Zona baixa', 6], ['Zona 2', 5]]);
  assert.equal(z.areaTotal, 15);
  assert.equal(z.zonas[0].pct, 26.7);
});
t('cenas de índice do ano, pico de NDVI e série mensal ponderada', () => {
  assert.equal(cenasIndice(SOJA[0], 2026).length, 3);
  assert.equal(picoNdvi(SOJA[0], 2026), 0.8);
  assert.equal(picoNdvi(SOJA[0], 2025), 0.9);
  const s = serieIndices(SOJA, 2026);
  assert.deepEqual(s.meses, [1, 2]);
  const ndvi = s.series.find(x => x.indice === 'NDVI');
  // fev: A 0,8 (10 ha) e B 0,7 (20 ha) → 0,733
  assert.equal(ndvi.valores[2], 0.733);
  assert.equal(ndvi.valores[1], 0.6);
  assert.deepEqual(s.series.map(x => x.indice), ['NDVI', 'NDRE']);
  assert.deepEqual(serieIndices([VAZIO], 2026), { meses: [], series: [] });
});

// ── Correlação ──────────────────────────────────────────────────────────────
t('beta incompleta: casos fechados', () => {
  perto(betaIncompleta(0.5, 1, 1), 0.5, 1e-9);
  perto(betaIncompleta(0.25, 2, 2), 0.15625, 1e-9);   // 3x² − 2x³
  assert.equal(betaIncompleta(0, 2, 3), 0);
  assert.equal(betaIncompleta(1, 2, 3), 1);
});
t('Pearson: perfeito, conhecido e mínimo de 5 pares', () => {
  const p = pearson([[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]]);
  assert.equal(p.r, 1); assert.equal(p.p, 0); assert.equal(p.n, 5);
  // r conhecido: x=1..6, y=[2,1,4,3,6,5] → r = 0,8286; t = 2,963 (gl 4) → p ≈ 0,0415
  const q = pearson([[1, 2], [2, 1], [3, 4], [4, 3], [5, 6], [6, 5]]);
  assert.equal(q.r, 0.83);
  perto(q.p, 0.0415, 0.001);
  assert.equal(pearson([[1, 2], [2, 3], [3, 4], [4, 5]]), null, 'n < 5');
  assert.equal(pearson([[1, 2], [1, 3], [1, 4], [1, 5], [1, 6]]), null, 'sem variância');
  assert.equal(MIN_TALHOES_CORRELACAO, 5);
});
t('interpretação e rótulo do p', () => {
  assert.equal(interpretarR(0.78), 'Forte e positiva');
  assert.equal(interpretarR(-0.5), 'Moderada e negativa');
  assert.equal(interpretarR(0.1), 'Fraca e positiva');
  assert.equal(rotuloP(0.004), 'p < 0,01');
  assert.equal(rotuloP(0.0004), 'p < 0,001');
  assert.equal(rotuloP(0.034), 'p = 0,03');
});
t('correlações entre talhões: CE e altitude com 5 talhões; NDVI com 2 → insuficiente', () => {
  const cs = correlacoes(TODOS, 2026);
  const ce = cs.find(c => c.id === 'ce'), alt = cs.find(c => c.id === 'altitude'), ndvi = cs.find(c => c.id === 'ndvi');
  assert.equal(ce.n, 5); assert.ok(ce.resultado.r > 0.9);
  assert.equal(alt.n, 5); assert.equal(alt.resultado.r, 1);   // altitude e prod sobem juntas, em passo
  assert.equal(ndvi.n, 2); assert.equal(ndvi.resultado, null);
});

// ── Alertas ─────────────────────────────────────────────────────────────────
t('alertas: P crítico em ha/%, análise antiga, produtividade baixa, zonas e VR', () => {
  const als = alertasPropriedade({
    dados: TODOS, ano: 2026,
    legendas: { p: { classes: LEG_P, simbolo: 'P' }, k: { classes: LEG_K, simbolo: 'K' }, v: { classes: LEG_V, simbolo: 'V%' } },
    legendaProdutividade: { classes: LEG_PROD_SOJA },
  });
  const por = Object.fromEntries(als.map(a => [a.id, a]));
  // P: A (5 → Muito Baixo) crítico; B (20 → Alto) não. Área total 275 → 10 ha = 3,6%
  assert.equal(por['crit-p'].tipo, 'critico');
  assert.equal(por['crit-p'].destaque, '10 ha (3,6%)');
  assert.match(por['crit-p'].texto, /P abaixo do nível crítico/);
  // V%: A (45 → Baixo) crítico
  assert.equal(por['crit-v'].destaque, '10 ha (3,6%)');
  // Análise antiga: C, D, E, M, V sem laudo → 245 ha
  assert.equal(por['analise-antiga'].destaque, '245 ha (89,1%)');
  // Produtividade: Baixa = (45, 60] → A (50) e B (60) = 30 ha
  assert.equal(por['prod-baixa'].destaque, '30 ha (10,9%)');
  assert.match(por['prod-baixa'].texto, /< 60 sc\/ha \(Soja\)/);
  assert.equal(por.zonas.tipo, 'info');
  assert.equal(por.vr.destaque, '40 ha (14,5%)');
  const semFert = alertasPropriedade({ dados: TODOS, ano: 2026, legendas: { p: { classes: LEG_P, simbolo: 'P' } }, liberado: s => s !== 'fertilidade' });
  assert.ok(!semFert.some(a => a.id.startsWith('crit-')), 'seção fora do plano não gera alerta');
  assert.deepEqual(alertasPropriedade({ dados: [], ano: 2026, legendas: {} }), []);
});

// ── Lista de talhões ────────────────────────────────────────────────────────
t('resumo por talhão', () => {
  const r = resumoPorTalhao(SOJA, 2026);
  assert.equal(r[0].prodScHa, 50); assert.equal(r[0].p, 5); assert.equal(r[0].anoAnalise, 2026);
  assert.equal(r[0].nZonas, 2); assert.equal(r[0].ce, true); assert.equal(r[0].cenas, 2, 'datas distintas (NDVI e NDRE no mesmo dia contam uma)');
  assert.equal(r[3].recomendacao, true);
  assert.equal(r[2].cultura, 'Soja');
});

// ── Ciclo da safra (janela da série de índices) ─────────────────────────────
t('ciclo ancorado na colheita: ano A = jul/A−1 → jun/A; rótulo "25/26" para 2026; meses na ordem do ciclo', () => {
  assert.equal(cicloDeData('2025-07-01'), 2026);      // plantio de 2025 → colheita de 2026
  assert.equal(cicloDeData('2025-10-15'), 2026);
  assert.equal(cicloDeData('2026-03-10'), 2026);      // colheita de mar/2026 = KPI do filtro 2026
  assert.equal(cicloDeData('2026-06-30'), 2026);
  assert.equal(cicloDeData('2026-07-01'), 2027);
  assert.equal(cicloDeData('2025-01-10'), 2025);
  assert.equal(cicloDeData('lixo'), null);
  assert.equal(rotuloCiclo(2026), '25/26');
  assert.equal(rotuloCiclo(2000), '99/00');
  assert.deepEqual([...MESES_DO_CICLO], [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
  assert.equal(ordemNoCiclo(7), 0);
  assert.equal(ordemNoCiclo(6), 11);
  assert.ok(naJanela('2025-11-01', 2026, 'ciclo') && !naJanela('2025-11-01', 2026, 'ano'));
  assert.ok(naJanela('2026-08-01', 2026, 'ano') && !naJanela('2026-08-01', 2026, 'ciclo'));
  assert.ok(naJanela('2000-01-01', null, 'ciclo'));
});
t('série de índices no ciclo: Out→Abr inteiro da lavoura colhida no ano, na ordem do ciclo', () => {
  const cena = (data, media, indice = 'NDVI') => ({ id: `C__ndvi__${indice}__${data}`, indice, cena: { data }, stats: { media } });
  const C = { talhao: { id: 'C', fazendaId: 'F', nome: 'C', areaHa: 10 }, mapasNuvem: [
    cena('2025-02-10', 0.85),                          // colheita de 2025 (ciclo 24/25): fora
    cena('2025-10-20', 0.35), cena('2025-12-05', 0.7), cena('2026-01-15', 0.82), cena('2026-03-25', 0.6),
    cena('2026-01-15', 0.4, 'NDRE'),
    cena('2026-08-01', 0.3),                           // lavoura do ciclo 26/27: fora
  ] };
  assert.equal(cenasIndice(C, 2026, 'ciclo').length, 5);
  assert.equal(cenasIndice(C, 2026).length, 4);          // ano civil (os cartões): jan (2), mar, ago de 2026
  const s = serieIndices([C], 2026, undefined, 'ciclo');
  assert.deepEqual(s.meses, [10, 12, 1, 3]);           // Out, Dez, Jan, Mar — não 1, 3, 10, 12
  const ndvi = s.series.find(x => x.indice === 'NDVI');
  assert.deepEqual(ndvi.valores, { 10: 0.35, 12: 0.7, 1: 0.82, 3: 0.6 });
  assert.deepEqual(s.series.find(x => x.indice === 'NDRE').valores, { 1: 0.4 });
  // O padrão continua o ano civil (quem não pede o ciclo não muda).
  assert.deepEqual(serieIndices([C], 2026).meses, [1, 3, 8]);
});

// ── Guarda de plano por rota (shell/menu.ts) ────────────────────────────────
t('guarda de plano: a rota usa o MESMO mapa do menu; qualquer seção da lista libera', () => {
  const lib = (...ss) => s => ss.includes(s);
  const fert = itemDaRota('/portal/fertilidade');
  assert.equal(fert.rota, '/portal/fertilidade');
  assert.equal(itemLiberado(fert, lib('ndvi')), false);           // URL digitada sem 'fertilidade' → bloqueia
  assert.equal(itemLiberado(fert, lib('fertilidade')), true);
  assert.equal(itemLiberado(itemDaRota('/portal/nutrientes/'), lib()), false);
  assert.equal(itemLiberado(itemDaRota('/portal'), lib()), true);  // Visão geral: sempre
  assert.equal(itemLiberado(itemDaRota('/portal/zonas'), lib()), true);
  const rel = itemDaRota('/portal/relatorios');
  assert.equal(itemLiberado(rel, lib('recomendacoes')), true);     // só recomendações já abre a página
  assert.equal(itemLiberado(rel, lib()), false);
  const comp = itemDaRota('/portal/comparativo');
  assert.equal(itemLiberado(comp, lib('fertilidade')), true);
  assert.equal(itemLiberado(comp, lib('ndvi')), false);
  assert.equal(itemLiberado(itemDaRota('/portal/prescricoes'), lib('produtividade')), false);
  // Toda rota com seção tem o item com `secoes` não vazio (o menu e a guarda leem o mesmo campo).
  for (const i of ITENS_MENU) assert.ok(!i.secoes || i.secoes.length > 0, i.rota);
});

// ── Projeção ────────────────────────────────────────────────────────────────
t('projeção: talhões no quadro, ponto e bounds no MESMO quadro', () => {
  const p = projetarMapa([{ id: 'a', geojson: quad(-50, -25, 0.01, 0.01) }, { id: 'b', geojson: quad(-49.99, -25, 0.01, 0.01) }, { id: 'c', geojson: null }], 600, 300, 10);
  assert.equal(p.formas.length, 2);
  const [x0, y0] = p.ponto(-50, -24.99);   // canto noroeste do talhão a
  assert.ok(x0 >= 10 && y0 >= 10);
  const cx = caixaDosBounds([-50, -25, -49.99, -24.99], p.ponto);
  assert.ok(cx.w > 0 && cx.h > 0);
  perto(cx.x, p.formas[0].cx - p.formas[0].w / 2, 0.2);
  assert.match(caminhoGeo(quad(-50, -25, 0.005, 0.005), p.ponto), /^M[\d.]+ [\d.]+L/);
  assert.equal(projetarMapa([], 100, 100).ponto, null);
});

t('projetarMapa: fazendas distantes viram grupos e o talhão não vira um ponto', () => {
  // Três talhões perto (fazenda A) e dois a ~80 km (fazenda B).
  const itens = [
    { id: 'a1', geojson: quad(-50, -25, 0.01, 0.01) }, { id: 'a2', geojson: quad(-49.988, -25, 0.01, 0.01) }, { id: 'a3', geojson: quad(-50, -24.988, 0.01, 0.01) },
    { id: 'b1', geojson: quad(-49.2, -24.5, 0.012, 0.008) }, { id: 'b2', geojson: quad(-49.186, -24.5, 0.01, 0.01) },
  ];
  const p = projetarMapa(itens, 600, 360, 10);
  assert.equal(p.grupos.length, 2);
  assert.deepEqual(new Set(p.formas.map(f => f.grupo)).size, 2);
  const a1 = p.formas.find(f => f.id === 'a1');
  assert.ok(a1.w > 60, `talhão largo o bastante (${a1.w} px)`);
  // Cada talhão usa a projeção do seu grupo: o canto do b1 cai dentro da forma dele.
  const b1 = p.formas.find(f => f.id === 'b1');
  const [x, y] = p.pontoDe('b1')(-49.194, -24.496);
  assert.ok(Math.abs(x - b1.cx) < b1.w && Math.abs(y - b1.cy) < b1.h);
  // Sem grupos extras, nada muda: um grupo só e sem molduras.
  const um = projetarMapa(itens.slice(0, 3), 600, 360, 10);
  assert.equal(um.grupos.length, 0);
  assert.notEqual(um.chave, p.chave);
});

// ── Cultura predominante: colheita por talhão E por cultura ─────────────────
// Soja de mar + milho safrinha de jul no MESMO talhão e ano (comum no PR): a
// soja não pode sumir porque o milho é o mapa mais recente.
const colEm = (cultura, kgha, area, criadoEm) => ({ ...col(2026, cultura, kgha, area), criadoEm });
t('200 ha de soja + 100 ha de milho safrinha: predominante = Soja, média só da soja', () => {
  const T1 = tal('S1', 100, () => ({ colheitas: [colEm('Soja', 3600, 100, '2026-03-10'), colEm('Milho safrinha', 9000, 100, '2026-07-20')] }));
  const T2 = tal('S2', 100, () => ({ colheitas: [colEm('Soja', 3000, 100, '2026-03-12')] }));
  const ds = [T1, T2];
  assert.deepEqual(areaColhidaPorCultura(ds, 2026).map(c => [c.cultura, c.area]), [['Soja', 200], ['Milho safrinha', 100]]);
  assert.equal(culturaPredominanteDoAno(ds, 2026), 'Soja');
  const k = kpiProdutividade(ds, 2026);
  assert.equal(k.cultura, 'Soja');
  assert.equal(k.n, 2);
  assert.equal(k.media, 55);                         // (60·100 + 50·100) / 200 — nada de milho
  assert.equal(k.outrasCulturas, true);
  assert.deepEqual(k.outras, ['Milho safrinha']);
  // Mapa / Top 5: os dois talhões, com o valor da SOJA.
  assert.deepEqual(produtividadePorTalhao(ds, 2026).map(p => [p.nome, p.cultura, p.mediaScHa]), [['S1', 'Soja', 60], ['S2', 'Soja', 50]]);
  // Com a cultura escolhida, vale a escolhida.
  assert.equal(kpiProdutividade(ds, 2026, 'Milho safrinha').media, 150);
  assert.equal(kpiProdutividade(ds, 2026, 'Milho safrinha').outrasCulturas, false);
  // Lista de talhões em "Todas": o S1 mostra a soja (predominante), não o milho.
  assert.equal(resumoPorTalhao(ds, 2026)[0].cultura, 'Soja');
});
t('caso da verificação: T1 100 ha soja+milho, T2 60 ha soja, T3 40 ha soja → Soja 59 sc/ha em 3', () => {
  const T1 = tal('R1', 100, () => ({ colheitas: [colEm('Soja', 3600, 100, '2026-03-01'), colEm('Milho', 9000, 100, '2026-07-01')] }));
  const T2 = tal('R2', 60, () => ({ colheitas: [colEm('Soja', 3000, 60, '2026-03-02')] }));
  const T3 = tal('R3', 40, () => ({ colheitas: [colEm('Soja', 4200, 40, '2026-03-03')] }));
  const k = kpiProdutividade([T1, T2, T3], 2026);
  assert.equal(k.cultura, 'Soja');
  assert.equal(k.n, 3);
  assert.equal(k.media, 59);                         // (60·100 + 50·60 + 70·40) / 200
  assert.equal(culturaEfetiva([T1, T2, T3], 2026, ''), 'Soja');
  assert.equal(culturaEfetiva([T1, T2, T3], 2026, 'milho'), 'Milho');
  // A correlação e os alertas usam a mesma cultura (só talhões de soja entram).
  assert.ok(correlacoes([T1, T2, T3], 2026).every(c => c.n <= 3));
});
t('painel de UM talhão herda a predominante do escopo (empate soja × safrinha não vira alfabético)', () => {
  // Mesma área de soja e de milho safrinha no talhão: sem escopo o empate cairia
  // na ordem alfabética ("Milho safrinha" < "Soja"); com o escopo vale a Soja.
  const T1 = tal('E1', 100, () => ({ colheitas: [colEm('Soja', 3600, 100, '2026-03-10'), colEm('Milho safrinha', 9000, 100, '2026-07-20')] }));
  const T2 = tal('E2', 80, () => ({ colheitas: [colEm('Soja', 3000, 80, '2026-03-12')] }));
  const escopo = [T1, T2];
  assert.equal(culturaPredominanteDoAno(escopo, 2026), 'Soja');
  assert.equal(culturaEfetiva([T1], 2026, ''), 'Milho safrinha');           // o empate sozinho
  assert.equal(culturaEfetiva([T1], 2026, '', escopo), 'Soja');             // herdada
  const k = kpiProdutividade([T1], 2026, '', escopo);
  assert.equal(k.cultura, 'Soja');
  assert.equal(k.media, 60);
  assert.deepEqual(k.outras, ['Milho safrinha']);
  assert.equal(kpisPainel([T1], 2026, '', escopo).produtividade.cultura, 'Soja');
  // Mesmo com o milho MAIOR no talhão, a cultura da propriedade vence se ele a tem.
  const T3 = tal('E3', 100, () => ({ colheitas: [colEm('Soja', 3600, 90, '2026-03-10'), colEm('Milho safrinha', 9000, 100, '2026-07-20')] }));
  assert.equal(culturaEfetiva([T3], 2026, '', [T3, T2]), 'Soja');
  // Talhão sem a predominante do escopo: vale a dele.
  const T4 = tal('E4', 50, () => ({ colheitas: [colEm('Milho', 9000, 50, '2026-03-10')] }));
  assert.equal(culturaEfetiva([T4], 2026, '', [T1, T2, T4]), 'Milho');
  // Filtro de cultura escolhido continua mandando.
  assert.equal(culturaEfetiva([T1], 2026, 'Milho safrinha', escopo), 'Milho safrinha');
  // Histórico do talhão na cultura herdada: só a soja.
  assert.deepEqual(historicoProdutividade(T1, k.cultura).map(h => h.cultura), ['Soja']);
  // Tooltip diz por que é a soja.
  assert.match(tituloCulturaPredominante({ cultura: 'Soja', outras: ['Milho safrinha'], anoTxt: '2026', um: true, predominanteEscopo: 'Soja' }), /^Mesma cultura da visão de todos os talhões/);
  assert.match(tituloCulturaPredominante({ cultura: 'Milho', outras: ['Trigo'], anoTxt: '2026', um: true, predominanteEscopo: 'Soja' }), /^Cultura de maior área colhida no talhão em 2026/);
  assert.match(tituloCulturaPredominante({ cultura: 'Soja', outras: ['Milho'], anoTxt: '2026', um: false, predominanteEscopo: 'Soja' }), /^Cultura de maior área colhida em 2026\. Também colhido: Milho/);
});
t('"sem colheita de X" não conta quem colheu outra cultura nem quem tem outra no cadastro', () => {
  const S = tal('Q1', 50, () => ({ colheitas: [colEm('Soja', 3600, 50, '2026-03-01')] }));
  const M = tal('Q2', 30, () => ({ colheitas: [colEm('Milho', 9000, 30, '2026-03-01')] }));
  const P = tal('Q3', 20, () => ({ cultura: 'Milho' }));
  const N = tal('Q4', 10, () => ({}));
  const s = talhoesSemColheita([S, M, P, N], 2026, 'Soja');
  assert.equal(s.n, 1);
  assert.deepEqual(s.ids, [N.talhao.id]);
  assert.equal(s.ha, 10);
  assert.deepEqual(s.outraCultura.sort(), [M.talhao.id, P.talhao.id].sort());
});
t('um talhão só: "Este talhão não tem…" no lugar de "Nenhum talhão com…"', () => {
  const B = SOJA[1];
  const als = alertasPropriedade({ dados: [B], ano: 2026, legendas: { p: { classes: LEG_P, simbolo: 'P' } }, legendaProdutividade: { classes: LEG_PROD_SOJA } });
  const p = als.find(a => a.id === 'crit-p');
  assert.equal(p.destaque, 'Este talhão');
  assert.match(p.texto, /^não tem P abaixo/);
  const varios = alertasPropriedade({ dados: [SOJA[1], SOJA[2]], ano: 2026, legendas: { p: { classes: LEG_P, simbolo: 'P' } } });
  assert.equal(varios.find(a => a.id === 'crit-p').destaque, 'Nenhum talhão');
});
t('pico de NDVI da correlação segue o ciclo jul(A−1)→jun(A)', () => {
  const X = tal('NX', 10, id => ({ mapasNuvem: [
    { id: `${id}__ndvi__NDVI__2025-12-15`, indice: 'NDVI', cena: { data: '2025-12-15' }, stats: { media: 0.85 } },  // ciclo 2026
    { id: `${id}__ndvi__NDVI__2026-02-15`, indice: 'NDVI', cena: { data: '2026-02-15' }, stats: { media: 0.7 } },   // ciclo 2026
    { id: `${id}__ndvi__NDVI__2026-11-15`, indice: 'NDVI', cena: { data: '2026-11-15' }, stats: { media: 0.95 } },  // ciclo 2027 (lavoura seguinte)
  ] }));
  assert.equal(picoNdvi(X, 2026), 0.85);
  assert.equal(picoNdvi(X, 2027), 0.95);
  assert.equal(rotuloCicloMeses(2026), 'jul/25–jun/26');
});

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
