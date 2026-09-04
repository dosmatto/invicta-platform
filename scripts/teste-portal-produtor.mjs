// Testes do Painel do Produtor (lib/portalProdutor) — regra de "o que está
// processado" em cada talhão, totais, séries dos gráficos e o mini-mapa.
//
// O caso que a tela tem de acertar: um produtor com talhões em estágios
// diferentes no MESMO ano — um com o ciclo inteiro (grade → laudo → mapas →
// recomendação → arquivo), um com amostras no laboratório e nada de volta, e
// um sem nenhum trabalho. E o filtro de ano não pode misturar as safras.
// Roda: `npm run teste:portal`
import assert from 'node:assert/strict';
import {
  avaliarTalhao, estadoEtapa, resumirPortal, areaAmostradaPorAno, evolucaoNutrientes,
  rankingColheita, linhaDoTempo, projetarTalhoes, anoDoRegistro, fmtDataCurta, isoDe, maxIso,
  ETAPAS, ETAPAS_CICLO, etapaDef,
} from '../src/lib/portalProdutor.ts';
import { abasComDados } from '../src/lib/portalProdutor.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// ── Fixtures ────────────────────────────────────────────────────────────────
const pontos = n => Array.from({ length: n }, (_, i) => ({ ordem: i, lng: -50 + i * 0.001, lat: -24.9, profs: 2 }));
const amostras = (n, prof, base) => Array.from({ length: n }, (_, i) => ({
  numero: i + 1, profundidade: prof, talhao: 'x', campanha: '',
  valores: { ph: base.ph + (i % 3) * 0.1, p: base.p + i, k: base.k, mo: base.mo, v: base.v },
}));

const quad = (w, s, l, a) => JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w, s], [w + l, s], [w + l, s + a], [w, s + a], [w, s]]] } });

const T1 = {
  talhao: { id: 'T1', fazendaId: 'F1', nome: 'WNOCG 01', areaHa: 92.12, status: 'ativo', geojson: quad(-50.30, -24.95, 0.010, 0.008) },
  cultura: 'Soja',
  grades: [
    { safra: '26/27', ano: 2026, criadoEm: '2026-02-10T12:00:00Z', nome: 'Grade 1', codigoRemessa: 'INV-AAAA-0001', pontos: pontos(42) },
    { safra: '25/26', ano: 2025, criadoEm: '2025-02-01T12:00:00Z', nome: 'Grade 1', pontos: pontos(40) },
  ],
  laudos: [
    { id: 'l26', safra: '26/27', ano: 2026, criadoEm: '2026-03-01T12:00:00Z', atualizadoEm: '2026-03-02T12:00:00Z', laboratorio: 'Fundação ABC',
      resultados: [...amostras(42, '00-20', { ph: 5.2, p: 12, k: 0.30, mo: 3.1, v: 58 }), ...amostras(8, '20-40', { ph: 4.9, p: 6, k: 0.20, mo: 2.0, v: 45 })] },
    { id: 'l25', safra: '25/26', ano: 2025, criadoEm: '2025-03-01T12:00:00Z', laboratorio: 'Fundação ABC',
      resultados: amostras(40, '0-20', { ph: 5.0, p: 9, k: 0.25, mo: 2.9, v: 52 }) },
  ],
  mapasNuvem: [
    { id: 'T1__l26__krige__5____ph__00-20', atualizadoEm: '2026-03-05T12:00:00Z' },
    { id: 'T1__l26__krige__5____p__00-20', atualizadoEm: '2026-03-05T12:10:00Z' },
    { id: 'T1__l26__zona__5____p__00-20', atualizadoEm: '2026-03-06T12:00:00Z' },   // mesmo nut/prof, outro método → conta 1
    { id: 'T1__ndvi__NDVI__2026-03-10', atualizadoEm: '2026-03-11T00:00:00Z', cena: { data: '2026-03-10' } },
    { id: 'T1__ndvi__NDVI__2025-03-10', atualizadoEm: '2025-03-11T00:00:00Z', cena: { data: '2025-03-10' } },
    { id: 'T1__prod__abc', atualizadoEm: '2026-04-21T00:00:00Z' },
  ],
  zoneamentos: [{ padrao: true, criadoEm: '2025-01-15T00:00:00Z', meta: { nZonas: 5 } }],
  cenarios: [
    { safra: '26/27', nome: 'Calcário', geradoEm: '1780000000000', oficial: 'true' },
    { safra: '26/27', nome: 'Gesso', geradoEm: 1780000001000, oficial: null },
    { safra: '25/26', nome: 'Antigo', geradoEm: 1750000000000, oficial: 'true' },
  ],
  prescricoes: [{ ano: '2026', nome: 'Calcário 2026', produto: 'Calcário', atualizadoEm: '2026-04-02T10:00:00Z',
    exportes: [{ em: '2026-04-03T10:00:00Z', formato: 'shp', arquivo: 'WNOCG01_calcario.zip' }] }],
  colheitas: [{ safra: '26/27', ano: 2026, oficial: true, cultura: 'Soja', criadoEm: '2026-04-20T00:00:00Z', stats: { mediaKgha: 3900, cv: 12 } }],
  mdes: [{ oficial: true, criadoEm: '2025-06-01T00:00:00Z', rotuloFonte: 'Copernicus DEM GLO-30 (30 m)' }],
  condutividade: [{ oficial: true, criadoEm: '2025-05-01T00:00:00Z', data: '2025-05-01' }],
  compactacao: [{ safra: '26/27', ano: 2026, criadoEm: '2026-05-01T00:00:00Z', pontos: pontos(20) }],
  relatorios: [{ safra: '26/27', tipo: 'Fertilidade', titulo: 'Book', geradoEm: 1781000000000 }],
};

const T2 = {
  talhao: { id: 'T2', fazendaId: 'F1', nome: 'WNOCG 02', areaHa: 44.38, status: 'ativo', geojson: quad(-50.28, -24.95, 0.006, 0.008) },
  grades: [{ safra: '26/27', ano: 2026, criadoEm: '2026-02-12T12:00:00Z', codigoRemessa: 'INV-AAAA-0002', pontos: pontos(30) }],
};

const T3 = { talhao: { id: 'T3', fazendaId: 'F2', nome: 'IGEFI 01', areaHa: 89.41, status: 'ativo', geojson: '{nao é json' } };

// ── Etapas ──────────────────────────────────────────────────────────────────
t('catálogo: 12 etapas, 5 no ciclo, todas com definição', () => {
  assert.equal(ETAPAS.length, 12);
  assert.deepEqual(ETAPAS_CICLO, ['amostragem', 'laudo', 'fertilidade', 'recomendacoes', 'prescricoes']);
  for (const e of ETAPAS) assert.equal(etapaDef(e.id), e);
  assert.throws(() => etapaDef('x'));
});

const a1 = avaliarTalhao(T1, '26/27');

t('T1 em 2026: as cinco etapas do ciclo prontas → ciclo completo', () => {
  for (const id of ETAPAS_CICLO) assert.equal(estadoEtapa(a1, id).situacao, 'pronto', id);
  assert.deepEqual(a1.ciclo, { feitas: 5, total: 5, proxima: null, situacao: 'completo' });
  assert.equal(a1.ano, 2026);
  assert.equal(a1.cultura, 'Soja');
});

t('amostragem: só a grade do ano, com pontos e a remessa ao laboratório', () => {
  const e = estadoEtapa(a1, 'amostragem');
  assert.equal(e.quantidade, 42);
  assert.match(e.resumo, /42 pontos/);
  assert.match(e.resumo, /enviado ao laboratório/);
  assert.equal(e.em, '2026-02-10T12:00:00Z');
});

t('laudo: amostras contadas por NÚMERO (duas profundidades não dobram) e o laboratório no resumo', () => {
  const e = estadoEtapa(a1, 'laudo');
  assert.equal(e.quantidade, 42);
  assert.match(e.resumo, /42 amostras · Fundação ABC/);
  assert.equal(e.em, '2026-03-02T12:00:00Z');   // atualizadoEm vence criadoEm
});

t('mapas de fertilidade: só os do laudo do ano; mesmo nut/prof por dois métodos conta UM', () => {
  const e = estadoEtapa(a1, 'fertilidade');
  assert.equal(e.quantidade, 2);
  assert.equal(e.resumo, '2 mapas prontos');
  assert.equal(e.em, '2026-03-06T12:00:00Z');
});

t('recomendações: cenários do ano, "para uso" = oficial (inclusive como texto da nuvem)', () => {
  const e = estadoEtapa(a1, 'recomendacoes');
  assert.equal(e.quantidade, 2);
  assert.equal(e.extra.paraUso, 1);
  assert.equal(e.resumo, '2 cenários · 1 para uso');
  assert.equal(e.em, new Date(1780000001000).toISOString());
});

t('arquivos de aplicação: prescrição do ano com exporte → pronto, data = a do arquivo', () => {
  const e = estadoEtapa(a1, 'prescricoes');
  assert.equal(e.situacao, 'pronto');
  assert.equal(e.quantidade, 1);
  assert.equal(e.resumo, '1 prescrição · 1 arquivo gerado');
  assert.equal(e.em, '2026-04-03T10:00:00Z');
});

t('satélite: cenas do ano por data, ignorando as do ano anterior e o raster de colheita', () => {
  const e = estadoEtapa(a1, 'ndvi');
  assert.equal(e.quantidade, 1);
  assert.equal(e.resumo, '1 cena · última 10/03/26');
});

t('camadas estruturais não dependem do ano: zonas, relevo e CE prontos', () => {
  assert.equal(estadoEtapa(a1, 'zonas').resumo, '5 zonas');
  assert.equal(estadoEtapa(a1, 'altimetria').resumo, 'Copernicus DEM GLO-30 (30 m)');
  assert.equal(estadoEtapa(a1, 'condutividade').resumo, 'levantamento de 01/05/25');
});

t('colheita em sacas (60 kg) e compactação/relatórios do ano', () => {
  const c = estadoEtapa(a1, 'produtividade');
  assert.equal(c.extra.mediaScHa, 65);
  assert.match(c.resumo, /Soja · média 65 sc\/ha/);
  assert.equal(estadoEtapa(a1, 'compactacao').quantidade, 20);
  assert.equal(estadoEtapa(a1, 'relatorios').quantidade, 1);
  assert.equal(a1.atualizadoEm, new Date(1781000000000).toISOString());   // o relatório é o mais recente
});

t('T1 em 2025: o filtro de ano troca tudo — laudo antigo, mapas em processamento, cenário antigo', () => {
  const a = avaliarTalhao(T1, '25/26');
  assert.equal(estadoEtapa(a, 'amostragem').quantidade, 40);
  assert.equal(estadoEtapa(a, 'laudo').quantidade, 40);
  assert.equal(estadoEtapa(a, 'fertilidade').situacao, 'andamento');
  assert.equal(estadoEtapa(a, 'fertilidade').resumo, 'Laudo recebido — mapas em processamento');
  assert.equal(estadoEtapa(a, 'recomendacoes').quantidade, 1);
  assert.equal(estadoEtapa(a, 'prescricoes').situacao, 'pendente');   // a prescrição é rotulada 2026
  assert.equal(estadoEtapa(a, 'ndvi').quantidade, 1);
  assert.equal(estadoEtapa(a, 'produtividade').situacao, 'pendente');
  assert.equal(a.ciclo.situacao, 'andamento');
  assert.equal(a.ciclo.proxima, 'fertilidade');
});

const a2 = avaliarTalhao(T2, '26/27');
t('T2: grade enviada e nada de volta → laudo "aguardando", ciclo em andamento com próxima = laudo', () => {
  assert.equal(estadoEtapa(a2, 'amostragem').situacao, 'pronto');
  assert.equal(estadoEtapa(a2, 'laudo').situacao, 'andamento');
  assert.match(estadoEtapa(a2, 'laudo').resumo, /aguardando o laudo/);
  assert.equal(estadoEtapa(a2, 'fertilidade').situacao, 'pendente');
  assert.deepEqual(a2.ciclo, { feitas: 1, total: 5, proxima: 'laudo', situacao: 'andamento' });
});

const a3 = avaliarTalhao(T3, '26/27');
t('T3: sem nada → tudo pendente, ciclo sem dado, sem data', () => {
  for (const e of a3.etapas) assert.equal(e.situacao, 'pendente', e.id);
  assert.equal(a3.ciclo.situacao, 'sem-dado');
  assert.equal(a3.ciclo.proxima, 'amostragem');
  assert.equal(a3.atualizadoEm, null);
});

t('safra que não parseia para ano cai na igualdade de texto', () => {
  const a = avaliarTalhao({ talhao: T3.talhao, grades: [{ safra: 'Inverno', criadoEm: '2026-01-01', pontos: 5 }] }, 'Inverno');
  assert.equal(estadoEtapa(a, 'amostragem').quantidade, 5);
  const b = avaliarTalhao({ talhao: T3.talhao, grades: [{ safra: 'Inverno', criadoEm: '2026-01-01', pontos: 5 }] }, 'Verão');
  assert.equal(estadoEtapa(b, 'amostragem').quantidade, 0);
});

// ── Totais ──────────────────────────────────────────────────────────────────
t('resumo do produtor: área amostrada, %, contagens e distribuição do ciclo', () => {
  const r = resumirPortal([a1, a2, a3]);
  assert.equal(r.nTalhoes, 3);
  assert.equal(r.nFazendas, 2);
  assert.equal(r.areaTotal, 225.91);
  assert.equal(r.areaAmostrada, 136.5);
  assert.equal(r.pctAmostrada, 60);
  assert.equal(r.nPontos, 72);
  assert.equal(r.nAmostras, 42);
  assert.equal(r.nLaudos, 1);
  assert.equal(r.nMapas, 2);
  assert.equal(r.nCenarios, 2);
  assert.equal(r.nArquivos, 1);
  assert.deepEqual(r.ciclo, { completo: 1, andamento: 1, semDado: 1, areaCompleta: 92.12, areaAndamento: 44.38, areaSemDado: 89.41 });
  const laudo = r.porEtapa.find(e => e.id === 'laudo');
  assert.deepEqual(laudo, { id: 'laudo', prontos: 1, andamento: 1, area: 92.12 });
  assert.equal(r.atualizadoEm, a1.atualizadoEm);
});

t('resumo vazio não divide por zero', () => {
  const r = resumirPortal([]);
  assert.equal(r.pctAmostrada, 0);
  assert.equal(r.atualizadoEm, null);
});

// ── Séries ──────────────────────────────────────────────────────────────────
t('área amostrada por ano: talhão conta uma vez por ano; anos forçados entram zerados', () => {
  const s = areaAmostradaPorAno([T1, T2, T3], [2024]);
  assert.deepEqual(s.map(x => x.ano), [2024, 2025, 2026]);
  assert.deepEqual(s[0], { ano: 2024, areaHa: 0, nTalhoes: 0, pontos: 0 });
  assert.deepEqual(s[1], { ano: 2025, areaHa: 92.12, nTalhoes: 1, pontos: 40 });
  assert.deepEqual(s[2], { ano: 2026, areaHa: 136.5, nTalhoes: 2, pontos: 72 });
});

t('evolução de nutrientes: camada mais rasa ("0-20" e "00-20" são a mesma), média por ano', () => {
  const ev = evolucaoNutrientes(T1.laudos);
  assert.equal(ev.profundidade, '00-20');
  assert.deepEqual(ev.pontos.map(p => p.ano), [2025, 2026]);
  assert.equal(ev.pontos[1].n, 42);
  assert.equal(ev.pontos[1].valores.mo, 3.1);
  assert.equal(ev.pontos[1].valores.v, 58);
  assert.equal(ev.pontos[0].valores.p, 9 + 19.5);      // média de 9..48
  assert.ok(Math.abs(ev.pontos[1].valores.ph - 5.3) < 0.01);
});

t('evolução sem laudo → sem pontos, sem quebrar', () => {
  const ev = evolucaoNutrientes([]);
  assert.equal(ev.profundidade, null);
  assert.deepEqual(ev.pontos, []);
});

t('ranking de colheita: só quem tem mapa, do maior para o menor', () => {
  const r = rankingColheita([a2, a1, a3]);
  assert.deepEqual(r, [{ talhaoId: 'T1', nome: 'WNOCG 01', cultura: 'Soja', mediaScHa: 65, cv: 12 }]);
});

t('linha do tempo: mais recente primeiro, sem etapas pendentes, com limite', () => {
  const lt = linhaDoTempo([a1, a2, a3], 4);
  assert.equal(lt.length, 4);
  assert.equal(lt[0].etapa, 'relatorios');
  assert.equal(lt[0].talhao, 'WNOCG 01');
  assert.ok(lt.every((e, i) => i === 0 || lt[i - 1].em >= e.em));
  assert.ok(lt.every(e => e.situacao !== 'pendente'));
  assert.match(lt[0].texto, /^Relatórios: 1 relatório gerado$/);
  const tudo = linhaDoTempo([a1, a2, a3], 100);
  assert.ok(tudo.some(e => e.talhaoId === 'T2' && e.etapa === 'laudo' && e.situacao === 'andamento'));
});

// ── Mini-mapa ───────────────────────────────────────────────────────────────
t('projeção: dois talhões cabem na caixa, o inválido fica de fora', () => {
  const p = projetarTalhoes([T1.talhao, T2.talhao, T3.talhao], 600, 400, 12);
  assert.equal(p.viewBox, '0 0 600 400');
  assert.deepEqual(p.formas.map(f => f.id), ['T1', 'T2']);
  for (const f of p.formas) {
    assert.match(f.d, /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){4}Z$/);
    const nums = f.d.match(/[\d.]+/g).map(Number);
    nums.forEach((v, i) => { assert.ok(v >= 12 - 0.01 && v <= (i % 2 === 0 ? 600 : 400) - 12 + 0.01, `coordenada ${v} fora da margem`); });
    assert.ok(f.cx > 0 && f.cy > 0);
  }
  // T2 está a LESTE de T1 → mais à direita na tela
  assert.ok(p.formas[1].cx > p.formas[0].cx);
});

t('projeção sem geometria válida → sem formas, sem erro', () => {
  const p = projetarTalhoes([T3.talhao, { id: 'x' }, { id: 'y', geojson: '{"type":"Point","coordinates":[1,2]}' }]);
  assert.deepEqual(p.formas, []);
});

t('projeção respeita a proporção real: caixa de 1 grau × 1 grau não vira quadrado na latitude 60', () => {
  const g = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 60], [1, 60], [1, 61], [0, 61], [0, 60]]] });
  const p = projetarTalhoes([{ id: 'a', geojson: g }], 400, 400, 0);
  const nums = p.formas[0].d.match(/[\d.]+/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(w / h - Math.cos(60.5 * Math.PI / 180)) < 0.01);
});

// ── Utilitários ─────────────────────────────────────────────────────────────
t('anoDoRegistro: ano gravado > data de referência > safra > data', () => {
  assert.equal(anoDoRegistro({ ano: 2024, safra: '26/27' }), 2024);
  assert.equal(anoDoRegistro({ dataReferencia: '2025-08-01', safra: '26/27' }), 2025);
  assert.equal(anoDoRegistro({ safra: '26/27' }), 2026);
  assert.equal(anoDoRegistro({ data: '2023-01-05' }), 2023);
  assert.equal(anoDoRegistro({}), null);
});

t('datas: isoDe aceita número e texto numérico; fmtDataCurta; maxIso', () => {
  assert.equal(isoDe(1780000000000), new Date(1780000000000).toISOString());
  assert.equal(isoDe('1780000000000'), new Date(1780000000000).toISOString());
  assert.equal(isoDe('2026-04-03'), '2026-04-03');
  assert.equal(isoDe(null), null);
  assert.equal(fmtDataCurta('2026-04-03T10:00:00Z'), '03/04/26');
  assert.equal(fmtDataCurta(null), '—');
  assert.equal(maxIso(['2026-01-01', null, '2026-03-01T00:00:00Z', '2025-12-31']), '2026-03-01T00:00:00Z');
});

t('abas do talhão: só o que existe, em qualquer ano — T1 tem tudo, na ordem do trilho', () => {
  assert.deepEqual(abasComDados(T1), ['resumo', 'altimetria', 'condutividade', 'zonas', 'amostragem', 'fertilidade', 'recomendacoes', 'prescricoes', 'arquivos', 'ndvi', 'produtividade', 'compactacao', 'relatorios']);
});
t('abas do talhão: T2 só grade → resumo + amostragem; T3 vazio → só resumo', () => {
  assert.deepEqual(abasComDados(T2), ['resumo', 'amostragem']);
  assert.deepEqual(abasComDados(T3), ['resumo']);
});
t('abas do talhão: laudo sem mapa já abre fertilidade; cena e colheita só na nuvem abrem satélite e produtividade; mapa de outro talhão não conta', () => {
  assert.deepEqual(abasComDados({ talhao: T3.talhao, laudos: [{ id: 'l1', safra: '26/27', criadoEm: '2026-01-01' }] }), ['resumo', 'fertilidade']);
  assert.deepEqual(abasComDados({ talhao: T3.talhao, mapasNuvem: [{ id: 'T3__ndvi__NDVI__2026-01-01', cena: { data: '2026-01-01' } }, { id: 'T3__prod__x' }] }), ['resumo', 'ndvi', 'produtividade']);
  assert.deepEqual(abasComDados({ talhao: T3.talhao, mapasNuvem: [{ id: 'OUTRO__ndvi__NDVI__2026-01-01' }, { id: 'OUTRO__l1__krige__5____ph__00-20' }] }), ['resumo']);
  assert.deepEqual(abasComDados({ talhao: T3.talhao, prescricoes: [{ nome: 'x', atualizadoEm: '2026-01-01', exportes: [{ em: '2026-01-02', formato: 'shp', arquivo: 'a.zip' }] }] }), ['resumo', 'prescricoes', 'arquivos']);
});

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
