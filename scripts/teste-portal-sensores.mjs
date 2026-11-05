// Testes das contas das páginas de sensores do Portal do Produtor v2
// (lib/portalPainelSensores): NDVI/NDRE, Produtividade, Condutividade e Altimetria.
//
// Casos que a tela tem de acertar: média ponderada pela ÁREA (não por talhão),
// Milho não entra na média da Soja, cena sem avaliação não conta como "limpa",
// CE por profundidade com área repartida pela proporção dos pontos, declividade
// em GRAUS (e a conversão para %), nenhum número saindo de dado ausente.
// Roda: `node scripts/teste-portal-sensores.mjs`
import assert from 'node:assert/strict';
import {
  cenasDoTalhao, anosComCena, ciclosComCena, indicesDisponiveis, serieMensal, serieMensalPorTalhao, picoDaSerie, resumoNdviPorTalhao,
  cenasRecentes, kpisNdvi, LIMPO_MIN,
  linhasProdutividade, resumoProdutividade, historicoPorSafra,
  ceNaProfundidade, profundidadesCe, profundidadePadraoCe, distribuirPontosEmClasses, agruparEmTres, resumoCe, variacaoInterna,
  relevoDetalhe, resumoRelevoDetalhe, grausParaPct, classeRelevo,
} from '../src/lib/portalPainelSensores.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// ── Fixtures ────────────────────────────────────────────────────────────────
let seq = 0;
const tal = (nome, area, extra) => {
  const id = `T${++seq}`;
  return { talhao: { id, fazendaId: 'F1', nome, areaHa: area, status: 'ativo' }, ...extra(id) };
};
const col = (ano, cultura, kgha, area, extra = {}) => ({ safra: `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`, ano, oficial: true, cultura, criadoEm: `${ano}-04-01T00:00:00Z`, stats: { mediaKgha: kgha, areaHa: area, minKgha: kgha - 600, maxKgha: kgha + 600, cv: 10, producaoTotalKg: kgha * area }, ...extra });
const cena = (id, indice, data, media, extra = {}) => ({ id: `${id}__ndvi__${indice}__${data}`, atualizadoEm: '2026-05-01', indice, cena: { data, plataforma: 'Sentinel-2', nuvem: 5 }, stats: { media, min: media - 0.2, max: media + 0.1 }, ...extra });
// Legenda de 5 classes (forma das oficiais).
const cls5 = (b, nomes = ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto']) => {
  const mm = [[null, b[0]], [b[0], b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], null]];
  const cores = ['#B00000', '#D4A800', '#7CFC00', '#66CCFF', '#C77DFF'];
  return nomes.map((nome, i) => ({ nome, valorMin: mm[i][0], valorMax: mm[i][1], corInicio: cores[i], corFim: cores[i], larguraVisual: 20, ordem: i + 1 }));
};

const A = tal('A', 10, id => ({
  colheitas: [col(2026, 'Soja', 3000, 10), col(2025, 'Soja', 2400, 10), col(2024, 'Milho', 9000, 10)],
  mapasNuvem: [
    cena(id, 'NDVI', '2026-01-10', 0.6, { pctLimpo: 90 }),
    cena(id, 'NDVI', '2026-02-10', 0.8, { pctLimpo: 40 }),
    cena(id, 'NDVI', '2026-02-20', 0.7),                       // sem avaliação de limpeza
    cena(id, 'NDRE', '2026-02-10', 0.5, { pctLimpo: 90 }),
    cena(id, 'NDVI', '2025-02-10', 0.9, { pctLimpo: 95 }),
    { id: `${id}__prod__abc`, atualizadoEm: 'x', stats: { media: 3000 } },        // não é cena de índice
    { id: `${id}__ndvicbers__NDVI__2026-03-05`, indice: 'NDVI', cena: { data: '2026-03-05' }, stats: { media: 0.5 }, pctLimpo: 80 },
  ],
  condutividade: [{ id: 'L1', oficial: true, criadoEm: '2024-01-01', data: '2024-01-01', profundidades: ['0-30', '0-90'], profundidadeOficial: '0-30',
    pontos: [{ valores: { '0-30': 5, '0-90': 8 } }, { valores: { '0-30': 15, '0-90': 18 } }, { valores: { '0-30': 25, '0-90': 28 } }, { valores: { '0-30': 45, '0-90': 48 } }] }],
  mdes: [{ id: 'M1', oficial: true, criadoEm: '2024-01-01', rotuloFonte: 'Copernicus 30 m', stats: { alt_min: 900, alt_med: 910, alt_max: 920, amplitude: 20, decl_media: 2, decl_max: 5 } }],
}));
const B = tal('B', 30, id => ({
  colheitas: [col(2026, 'Soja', 4200, 30), col(2025, 'Soja', 3600, 30)],
  mapasNuvem: [cena(id, 'NDVI', '2026-02-11', 0.7, { pctLimpo: 85 })],
  condutividade: [{ id: 'L2', oficial: true, criadoEm: '2024-01-01', profundidadeOficial: '0-30', profundidades: ['0-30'], pontos: [{ valores: { '0-30': 20 } }, { valores: { '0-30': 22 } }] }],
  mdes: [{ id: 'M2', oficial: true, criadoEm: '2024-01-01', stats: { alt_min: 905, alt_med: 915, alt_max: 935, amplitude: 30, decl_media: 4, decl_max: 9 } }],
}));
const M = tal('M', 20, () => ({ colheitas: [col(2026, 'Milho', 9000, 20)] }));
const V = tal('V', 25, () => ({}));
const TODOS = [A, B, M, V];

// ── NDVI / NDRE ─────────────────────────────────────────────────────────────
t('cenas: só índice de vegetação do próprio talhão, com data e média; ano filtra', () => {
  const todas = cenasDoTalhao(A);
  assert.equal(todas.length, 6);                      // sem o mapa de colheita; entra a cena CBERS
  assert.equal(cenasDoTalhao(A, 2026).length, 5);
  assert.equal(cenasDoTalhao(A, 2025).length, 1);
  assert.deepEqual(cenasDoTalhao(V), []);
  const cb = todas.find(c => c.fonte === 'cbers');
  assert.equal(cb.data, '2026-03-05');
  assert.equal(cenasDoTalhao(A, 2026).find(c => c.data === '2026-02-20').pctLimpo, null);
});
t('anos e índices disponíveis', () => {
  assert.deepEqual(anosComCena(TODOS), [2026, 2025]);
  assert.deepEqual(indicesDisponiveis(TODOS), ['NDVI', 'NDRE']);
  assert.deepEqual(anosComCena([V]), []);
});
t('série mensal: média do mês por talhão, depois ponderada pela área', () => {
  const s = serieMensal(TODOS, 2026, 'NDVI');
  assert.equal(s[1], 0.6);                            // só A em janeiro
  // fevereiro: A = (0,8+0,7)/2 = 0,75 (peso 10); B = 0,7 (peso 30) → (7,5+21)/40 = 0,7125
  assert.equal(s[2], 0.713);
  assert.equal(s[3], 0.5);                            // CBERS entra na série do índice
  assert.deepEqual(serieMensal([V], 2026, 'NDVI'), {});
  assert.deepEqual(serieMensal(TODOS, 2026, 'NDRE'), { 2: 0.5 });
});
t('pico do ciclo e série por talhão', () => {
  assert.deepEqual(picoDaSerie({ 1: 0.6, 2: 0.71, 3: 0.5 }), { mes: 2, valor: 0.71 });
  assert.equal(picoDaSerie({}), null);
  const por = serieMensalPorTalhao(TODOS, 2026, 'NDVI');
  assert.equal(por.length, 2);
  assert.equal(por[0].valores[2], 0.75);
});
t('série no ciclo da colheita (jul/A−1 → jun/A): o verão de jan–mar/2026 é o ciclo 2026 ("25/26")', () => {
  // As cenas de A/B (jan–mar 2026 e fev 2025) caem nos ciclos 2026 e 2025.
  assert.deepEqual(ciclosComCena(TODOS), [2026, 2025]);
  assert.deepEqual(ciclosComCena(TODOS, 'NDRE'), [2026]);
  assert.deepEqual(serieMensal(TODOS, 2027, 'NDVI', 'ciclo'), {});            // nada de jul/26 a jun/27
  const s = serieMensal(TODOS, 2026, 'NDVI', 'ciclo');                      // jul/25 → jun/26
  assert.deepEqual(s, { 1: 0.6, 2: 0.713, 3: 0.5 });
  assert.deepEqual(serieMensal(TODOS, 2025, 'NDVI', 'ciclo'), { 2: 0.9 });  // fev/2025
  assert.equal(cenasDoTalhao(A, 2026, 'ciclo').length, 5);
  const por = serieMensalPorTalhao(TODOS, 2026, 'NDVI', 'ciclo');
  assert.equal(por.length, 2);
  assert.equal(por[0].valores[2], 0.75);
});
t('resumo por talhão: última cena, pico e cenas confiáveis (≥ 70% limpo; sem avaliação não conta)', () => {
  const r = resumoNdviPorTalhao(TODOS, 2026, 'NDVI');
  const a = r.find(x => x.talhaoId === A.talhao.id);
  assert.equal(a.nCenas, 4);
  assert.equal(a.ultima.data, '2026-03-05');          // a mais nova, mesmo sendo CBERS
  assert.deepEqual(a.pico, { data: '2026-02-10', valor: 0.8 });
  assert.equal(a.nLimpas, 2);                         // 90 e 80; o 40 não; a sem avaliação não
  assert.equal(LIMPO_MIN, 70);
  assert.equal(r.length, 2);
});
t('cenas recentes: mais nova primeiro, limite respeitado', () => {
  const c = cenasRecentes(TODOS, 2026, 'NDVI', 3);
  assert.deepEqual(c.map(x => x.data), ['2026-03-05', '2026-02-20', '2026-02-11']);
  assert.equal(c[0].nome, 'A');
});
t('KPIs de NDVI: pico, delta contra o ano anterior, % de cenas limpas entre as avaliadas', () => {
  const k = kpisNdvi(TODOS, 2026, 'NDVI');
  assert.equal(k.nCenas, 5);
  assert.equal(k.nTalhoes, 2);
  assert.equal(k.ultimaData, '2026-03-05');
  assert.deepEqual(k.pico, { mes: 2, valor: 0.713 });
  assert.deepEqual(k.picoAnterior, { mes: 2, valor: 0.9 });
  assert.equal(k.deltaPicoPct, -20.8);
  assert.equal(k.nAvaliadas, 4);                      // a de 20/02 não foi avaliada
  assert.equal(k.pctCenasLimpas, 75);                 // 90, 80, 85 ok; 40 não
  const vazio = kpisNdvi([V], 2026, 'NDVI');
  assert.equal(vazio.pico, null); assert.equal(vazio.valorUltimo, null); assert.equal(vazio.pctCenasLimpas, null);
});

// ── Produtividade ───────────────────────────────────────────────────────────
t('linhas: Milho fora da média da Soja; delta por talhão contra o ano anterior', () => {
  const { linhas, cultura, outrasCulturas } = linhasProdutividade(TODOS, 2026, '');
  assert.equal(cultura, 'Soja');
  assert.equal(outrasCulturas, true);
  assert.deepEqual(linhas.map(l => l.nome), ['B', 'A']);          // ranking: 70 sc, 50 sc
  assert.equal(linhas[0].mediaScHa, 70);
  assert.equal(linhas[0].anteriorScHa, 60);
  assert.equal(linhas[0].deltaPct, 16.7);
  assert.equal(linhas[1].deltaPct, 25);
  assert.equal(linhas[0].producaoSc, 2100);                       // 4200·30 kg / 60
});
t('página Produtividade: 200 ha de soja + 100 ha de milho safrinha no mesmo talhão → Soja nos dois talhões', () => {
  const S1 = tal('S1', 100, () => ({ colheitas: [col(2026, 'Soja', 3600, 100, { criadoEm: '2026-03-10' }), col(2026, 'Milho safrinha', 9000, 100, { criadoEm: '2026-07-20' })] }));
  const S2 = tal('S2', 100, () => ({ colheitas: [col(2026, 'Soja', 3000, 100, { criadoEm: '2026-03-12' })] }));
  const r = linhasProdutividade([S1, S2], 2026, '');
  assert.equal(r.cultura, 'Soja');
  assert.deepEqual(r.linhas.map(l => [l.nome, l.mediaScHa]), [['S1', 60], ['S2', 50]]);
  assert.equal(r.outrasCulturas, true);
  assert.deepEqual(r.outras, ['Milho safrinha']);
  assert.equal(resumoProdutividade(r.linhas, r.cultura).mediaScHa, 55);
  assert.deepEqual(linhasProdutividade([S1, S2], 2026, 'Milho safrinha').linhas.map(l => l.nome), ['S1']);
});
t('NDVI no CICLO: cena de out/2025 conta em 2026; a de nov/2026 é do ciclo 2027', () => {
  const C = tal('C', 10, id => ({ mapasNuvem: [cena(id, 'NDVI', '2025-10-20', 0.4), cena(id, 'NDVI', '2026-01-15', 0.82), cena(id, 'NDVI', '2026-11-10', 0.9)] }));
  const k = kpisNdvi([C], 2026, 'NDVI');
  assert.equal(k.nCenas, 2);
  assert.deepEqual(k.pico, { mes: 1, valor: 0.82 });
  assert.equal(resumoNdviPorTalhao([C], 2026, 'NDVI')[0].nCenas, 2);
  assert.deepEqual(cenasRecentes([C], 2026, 'NDVI').map(c => c.data), ['2026-01-15', '2025-10-20']);
  assert.equal(kpisNdvi([C], 2027, 'NDVI').nCenas, 1);
  assert.equal(kpisNdvi([C], 2026, 'NDVI', 'ano').nCenas, 2);   // ano civil (01 e 11/2026) — só sob pedido
});
t('resumo: média PONDERADA pela área, produção total, CV entre talhões', () => {
  const { linhas } = linhasProdutividade(TODOS, 2026, 'Soja');
  const { linhas: ant } = linhasProdutividade(TODOS, 2025, 'Soja');
  const r = resumoProdutividade(linhas, 'Soja', ant);
  assert.equal(r.mediaScHa, 65);                                  // (50·10 + 70·30) / 40
  assert.equal(r.anteriorScHa, 55);                               // (40·10 + 60·30) / 40
  assert.equal(r.deltaPct, 18.2);
  assert.equal(r.producaoTotalSc, 2600);                          // 500 + 2100
  assert.equal(r.producaoTotalT, 156);
  assert.equal(r.cvEntreTalhoes, 16.7);                           // dp 10 / média 60
  assert.equal(r.cvDentro, 10);
  assert.equal(r.melhor.nome, 'B');
  assert.equal(r.pior.nome, 'A');
  assert.equal(r.areaHa, 40);
});
t('um talhão só: sem CV entre talhões, sem "pior"', () => {
  const { linhas } = linhasProdutividade([B], 2026, '');
  const r = resumoProdutividade(linhas, 'Soja');
  assert.equal(r.cvEntreTalhoes, null);
  assert.equal(r.pior, null);
  assert.equal(r.anteriorScHa, null);
  assert.equal(r.deltaPct, null);
});
t('sem colheita no ano ou sem ano: vazio, nunca zero', () => {
  assert.equal(linhasProdutividade([V], 2026, '').linhas.length, 0);
  assert.equal(linhasProdutividade(TODOS, null, '').linhas.length, 0);
  assert.equal(linhasProdutividade(TODOS, 2026, 'Feijão').linhas.length, 0);
  assert.equal(resumoProdutividade([], 'Soja'), null);
});
t('produção sem producaoTotalKg usa média × área', () => {
  const X = tal('X', 10, () => ({ colheitas: [col(2026, 'Soja', 3000, 10, { stats: { mediaKgha: 3000, areaHa: 10 } })] }));
  assert.equal(linhasProdutividade([X], 2026, '').linhas[0].producaoSc, 500);
});
t('histórico por safra e cultura (ponderado, uma linha por ano × cultura)', () => {
  const h = historicoPorSafra(TODOS);
  assert.deepEqual(h.map(x => `${x.ano}:${x.cultura}`), ['2024:Milho', '2025:Soja', '2026:Soja', '2026:Milho']);
  const s26 = h.find(x => x.ano === 2026 && x.cultura === 'Soja');
  assert.equal(s26.mediaScHa, 65);
  assert.equal(s26.nTalhoes, 2);
  assert.equal(historicoPorSafra(TODOS, 'soja').length, 2);
  assert.deepEqual(historicoPorSafra([V]), []);
});

// ── Condutividade ───────────────────────────────────────────────────────────
t('CE por profundidade: média/min/max dos pontos, levantamento e n', () => {
  const c = ceNaProfundidade(A, '0-30');
  assert.equal(c.media, 22.5); assert.equal(c.min, 5); assert.equal(c.max, 45); assert.equal(c.n, 4); assert.equal(c.levId, 'L1');
  assert.equal(ceNaProfundidade(A, '0-90').media, 25.5);
  assert.equal(ceNaProfundidade(B, '0-90'), null);                // B só tem 0-30
  assert.equal(ceNaProfundidade(V, '0-30'), null);
});
t('profundidades: união dos talhões, da mais rasa à mais funda; padrão = a oficial mais comum', () => {
  assert.deepEqual(profundidadesCe(TODOS), [{ valor: '0-30', nTalhoes: 2 }, { valor: '0-90', nTalhoes: 1 }]);
  assert.equal(profundidadePadraoCe(TODOS), '0-30');
  assert.equal(profundidadePadraoCe([V]), null);
});
t('classes por proporção dos pontos: a área do talhão se reparte; talhão sem CE vai para "sem dado"', () => {
  const classes = cls5([10, 20, 30, 40]);                         // A: 5 | 15 | 25 | 45 → MB, B, M, MA
  const itens = [ceNaProfundidade(A, '0-30'), ceNaProfundidade(B, '0-30')];
  const d = distribuirPontosEmClasses(itens, classes, TODOS.map(x => ({ id: x.talhao.id, areaHa: x.talhao.areaHa })));
  const por = Object.fromEntries(d.classes.map(c => [c.nome, c.ha]));
  // A (10 ha): 2,5 ha em cada uma de 4 classes. B (30 ha): 20 → Médio? (20,30] não: 20 cai em Baixo (10,20]; 22 em Médio.
  assert.equal(por['Muito Baixo'], 2.5);
  assert.equal(por['Baixo'], 17.5);                               // 2,5 (A) + 15 (B: ponto de 20)
  assert.equal(por['Médio'], 17.5);                               // 2,5 (A) + 15 (B: ponto de 22)
  assert.equal(por['Muito Alto'], 2.5);
  assert.equal(d.areaComDado, 40);
  assert.ok(Math.abs(d.classes.reduce((s, c) => s + c.pct, 0) - 100) <= 0.5);   // arredondamento de 1 casa
  assert.deepEqual(d.semDado, { ha: 45, n: 2 });                  // M (20) + V (25)
  assert.equal(d.classePorId[A.talhao.id], 'Médio');              // média 22,5
  assert.equal(d.classePorId[B.talhao.id], 'Médio');              // média 21
});
t('Baixa / Média / Alta: 5 classes viram 2 + 1 + 2; menos de 3 não divide', () => {
  const classes = cls5([10, 20, 30, 40]);
  const d = distribuirPontosEmClasses([ceNaProfundidade(A, '0-30')], classes);
  const tres = agruparEmTres(d.classes);
  assert.deepEqual(tres.map(x => x.rotulo), ['Baixa', 'Média', 'Alta']);
  assert.deepEqual(tres[0].classes, ['Muito Baixo', 'Baixo']);
  assert.deepEqual(tres[1].classes, ['Médio']);
  assert.deepEqual(tres.map(x => x.pct), [50, 25, 25]);
  assert.equal(agruparEmTres(d.classes.slice(0, 2)), null);
  assert.equal(agruparEmTres(d.classes.slice(0, 4)).length, 3);
});
t('resumo da CE: média ponderada pela área, extremos e variação interna', () => {
  const itens = [ceNaProfundidade(A, '0-30'), ceNaProfundidade(B, '0-30')];
  const r = resumoCe(itens);
  assert.equal(r.media, 21.38);                                   // (22,5·10 + 21·30) / 40 = 21,375
  assert.equal(r.min, 5); assert.equal(r.max, 45); assert.equal(r.nTalhoes, 2); assert.equal(r.nPontos, 6);
  assert.equal(r.maisCondutivo.nome, 'A'); assert.equal(r.menosCondutivo.nome, 'B');
  assert.equal(variacaoInterna(itens[0]), 178);                   // (45 − 5) / 22,5
  assert.equal(resumoCe([]), null);
});

// ── Altimetria ──────────────────────────────────────────────────────────────
t('relevo do talhão: MDE oficial, declividade em graus, fonte e id', () => {
  const r = relevoDetalhe(A);
  assert.equal(r.altMin, 900); assert.equal(r.altMax, 920); assert.equal(r.amplitude, 20);
  assert.equal(r.declMedia, 2); assert.equal(r.declMax, 5); assert.equal(r.fonte, 'Copernicus 30 m'); assert.equal(r.mdeId, 'M1');
  assert.equal(relevoDetalhe(V), null);
  assert.equal(relevoDetalhe({ talhao: V.talhao, mdes: [{ oficial: true, criadoEm: 'x' }] }), null);   // sem estatística
});
t('resumo do relevo: extremos, amplitude, declividade ponderada e o talhão mais inclinado', () => {
  const rel = [relevoDetalhe(A), relevoDetalhe(B)];
  const r = resumoRelevoDetalhe(rel);
  assert.equal(r.altMin, 900); assert.equal(r.altMax, 935); assert.equal(r.amplitude, 35);
  assert.deepEqual(r.amplitudeMaxTalhao, { talhaoId: B.talhao.id, nome: 'B', valor: 30 });
  assert.equal(r.declMedia, 3.5);                                 // (2·10 + 4·30) / 40
  assert.equal(r.declMax, 9);
  assert.equal(r.maisInclinado.nome, 'B');
  assert.equal(resumoRelevoDetalhe([]), null);
});
t('graus → % e classes de relevo da Embrapa', () => {
  assert.equal(Math.round(grausParaPct(45)), 100);
  assert.equal(Math.round(grausParaPct(2) * 10) / 10, 3.5);
  assert.equal(classeRelevo(2).rotulo, 'Plano');
  assert.equal(classeRelevo(3).rotulo, 'Plano');                  // limite superior inclusive
  assert.equal(classeRelevo(5).rotulo, 'Suave ondulado');
  assert.equal(classeRelevo(12).rotulo, 'Ondulado');
  assert.equal(classeRelevo(30).rotulo, 'Forte ondulado');
  assert.equal(classeRelevo(60).rotulo, 'Montanhoso');
  assert.equal(classeRelevo(90).rotulo, 'Escarpado');
  assert.equal(classeRelevo(null), null);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
