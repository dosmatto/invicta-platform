// Testes dos números das páginas do SOLO do Portal do Produtor v2
// (lib/portalPainelSolo) — Fertilidade, Nutrientes, Zonas, Prescrições e
// Compactação.
//
// Os casos que a tela tem de acertar: média ponderada pela área; "abaixo do
// crítico" pela régua das legendas da Biblioteca; variação PAREADA (só talhões
// com duas análises); versão mais nova da prescrição vale; total do produto com
// compensação de germinação; camada crítica da compactação.
// Roda: `node scripts/teste-portal-solo.mjs`
import assert from 'node:assert/strict';
import {
  limiteCritico, resumoAtributo, pontosAteAno, evolucaoPonderada, amostrasDoLaudo, distribuirAmostras, direcao, contarDirecoes,
  potencialDaZona, zonasPorTalhao, prescricoesVigentes, resumirPrescricao, produtosPrescritos, escalaDeDoses,
  distribuirDoses, doseMediaDoConjunto, resumoExportes, rotuloExporte,
  classesCriticasCompactacao, limiteCompactacao, medicaoDoTalhao, camadasDasMedicoes, perfilPorCamada, camadaMaisResistente,
} from '../src/lib/portalPainelSolo.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };
const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

// ── Fixtures ────────────────────────────────────────────────────────────────
const cls5 = (b, nomes = ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto']) => {
  const mm = [[null, b[0]], [b[0], b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], null]];
  const cores = ['#B00000', '#D4A800', '#7CFC00', '#66CCFF', '#C77DFF'];
  return nomes.map((nome, i) => ({ nome, valorMin: mm[i][0], valorMax: mm[i][1], corInicio: cores[i], corFim: cores[i], larguraVisual: 20, ordem: i + 1 }));
};
const LEG_P = cls5([6, 12, 18, 30]);
const LEG_COMP = cls5([1.0, 1.5, 2.0, 3.0]);
const quad = (w, s, l, a) => JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w, s], [w + l, s], [w + l, s + a], [w, s + a], [w, s]]] } });
const amostras = (n, prof, valores) => Array.from({ length: n }, (_, i) => ({ numero: i + 1, profundidade: prof, valores: { ...valores } }));
let seq = 0;
const tal = (nome, area, extra = {}) => {
  const id = `T${++seq}`;
  return { talhao: { id, fazendaId: 'F1', nome, areaHa: area, status: 'ativo', geojson: quad(-50 + seq * 0.02, -25, 0.01, 0.01) }, ...extra };
};
const laudo = (id, ano, p, prof = '0-20', n = 3) => ({ id, safra: `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`, ano, criadoEm: `${ano}-02-01`, resultados: amostras(n, prof, { p }) });

// A (10 ha): P 5 em 2026 e 10 em 2023 · B (30 ha): P 20 em 2026, 18 em 2023 · C (60 ha): só P 8 em 2020 (análise antiga) · D: sem análise
const A = tal('A', 10, { laudos: [laudo('la1', 2026, 5), laudo('la0', 2023, 10)] });
const B = tal('B', 30, { laudos: [laudo('lb1', 2026, 20), laudo('lb0', 2023, 18)] });
const C = tal('C', 60, { laudos: [laudo('lc0', 2020, 8)] });
const D = tal('D', 100, {});
const TODOS = [A, B, C, D];

// ── Fertilidade ─────────────────────────────────────────────────────────────
t('limite crítico = topo da última classe crítica (Muito baixo + Baixo)', () => {
  assert.equal(limiteCritico(LEG_P), 12);
  assert.equal(limiteCritico(LEG_P, true), null);   // legenda invertida não tem "abaixo do crítico"
  assert.equal(limiteCritico([]), null);
});
t('resumo do atributo: média ponderada, crítico por classe, % sobre a área TOTAL', () => {
  const r = resumoAtributo(TODOS, 2026, 'p', LEG_P);
  // A=5 (10 ha), B=20 (30 ha), C=8 (60 ha, 2020): (50 + 600 + 480) / 100
  perto(r.media, 11.3);
  assert.equal(r.classeMedia.nome, 'Baixo');
  assert.equal(r.nComValor, 3);
  assert.equal(r.areaComValor, 100);
  assert.equal(r.areaTotal, 200);
  // A (Muito Baixo) e C (Baixo) estão abaixo do crítico: 70 ha de 200
  assert.equal(r.nCriticos, 2);
  assert.equal(r.areaCritica, 70);
  assert.equal(r.pctCritica, 35);
  const d = r.linhas.find(l => l.nome === 'D');
  assert.equal(d.valor, null);
  assert.equal(d.critico, null);   // sem análise não é "crítico" nem "ok"
});
t('análise antiga: 3 anos ou mais, ou nunca', () => {
  const r = resumoAtributo(TODOS, 2026, 'p', LEG_P);
  // C (2020) e D (nunca): 160 ha
  assert.equal(r.nAntigos, 2);
  assert.equal(r.areaAntigos, 160);
  assert.deepEqual(r.anos, [2020, 2026]);
});
t('distribuição por classe: ha e % sobre a área COM dado', () => {
  const r = resumoAtributo(TODOS, 2026, 'p', LEG_P);
  const mb = r.dist.classes.find(c => c.nome === 'Muito Baixo');
  assert.equal(mb.ha, 10); assert.equal(mb.pct, 10);
  const alto = r.dist.classes.find(c => c.nome === 'Alto');       // B = 20 mg/dm³ → 18–30
  assert.equal(alto.ha, 30); assert.equal(alto.pct, 30);
  assert.equal(r.dist.semDado.n, 1);
  assert.equal(r.dist.areaComDado, 100);
});
t('variação pareada: só talhões com duas análises (última × anterior)', () => {
  const r = resumoAtributo(TODOS, 2026, 'p', LEG_P);
  // A: 10→5 (10 ha), B: 18→20 (30 ha); C só tem uma análise e fica de fora
  assert.equal(r.deltaMedia.n, 2);
  perto(r.deltaMedia.atual, (5 * 10 + 20 * 30) / 40);        // 16,25
  perto(r.deltaMedia.anterior, (10 * 10 + 18 * 30) / 40);    // 16
  assert.equal(r.deltaMedia.pct, 1.6);
  const a = r.linhas.find(l => l.nome === 'A');
  assert.deepEqual(a.anterior, { ano: 2023, valor: 10, delta: -5 });
  assert.equal(r.linhas.find(l => l.nome === 'C').anterior, null);
});
t('safra antiga do filtro só enxerga laudos até aquele ano', () => {
  const r = resumoAtributo(TODOS, 2023, 'p', LEG_P);
  assert.equal(r.linhas.find(l => l.nome === 'A').valor, 10);
  assert.equal(r.linhas.find(l => l.nome === 'A').anterior, null);   // só há 2023 até 2023
  assert.deepEqual(pontosAteAno(A, 'p', 2023).map(p => p.ano), [2023]);
  assert.deepEqual(pontosAteAno(A, 'p', null).map(p => p.ano), [2023, 2026]);
});
t('evolução ponderada: média por ano pela área, só até a safra do filtro', () => {
  const e = evolucaoPonderada(TODOS, 'p', 2026);
  assert.deepEqual(e.map(x => x.ano), [2020, 2023, 2026]);
  perto(e.find(x => x.ano === 2023).valor, (10 * 10 + 18 * 30) / 40);     // A e B em 2023
  assert.equal(e.find(x => x.ano === 2023).nTalhoes, 2);
  assert.equal(e.find(x => x.ano === 2020).valor, 8);                      // só o C
  assert.deepEqual(evolucaoPonderada(TODOS, 'p', 2023).map(x => x.ano), [2020, 2023]);
  assert.deepEqual(evolucaoPonderada([D], 'p', 2026), []);
});
t('sem legenda ou invertida: nada é "crítico"', () => {
  const r = resumoAtributo(TODOS, 2026, 'p', [], false);
  assert.equal(r.nCriticos, 0);
  assert.equal(r.linhas[0].critico, null);
  assert.equal(r.media != null, true);   // a média existe mesmo sem legenda
  assert.equal(r.classeMedia, null);
  const inv = resumoAtributo(TODOS, 2026, 'p', LEG_P, true);
  assert.equal(inv.nCriticos, 0);
  assert.equal(inv.limite, null);
});
t('camada mais rasa: a análise lê 0-20 e ignora 20-40', () => {
  const x = tal('X', 10, { laudos: [{ id: 'lx', safra: '26/27', ano: 2026, criadoEm: '2026-02-01', resultados: [...amostras(2, '0-20', { p: 14 }), ...amostras(2, '20-40', { p: 3 })] }] });
  assert.equal(resumoAtributo([x], 2026, 'p', LEG_P).linhas[0].valor, 14);
  assert.equal(resumoAtributo([x], 2026, 'p', LEG_P).linhas[0].profundidade, '0-20');
});
t('amostras de um talhão: valores, mín/máx e % por classe', () => {
  const l = { id: 'l', safra: '26/27', ano: 2026, criadoEm: '2026-01-01', resultados: [
    { profundidade: '0-20', valores: { p: 4 } }, { profundidade: '0-20', valores: { p: 9 } }, { profundidade: '0-20', valores: { p: 20 } }, { profundidade: '0-20', valores: { p: 40 } },
    { profundidade: '20-40', valores: { p: 1 } }] };
  const vs = amostrasDoLaudo(l, 'p');
  assert.deepEqual(vs, [4, 9, 20, 40]);
  const d = distribuirAmostras(vs, LEG_P);
  assert.equal(d.n, 4); assert.equal(d.min, 4); assert.equal(d.max, 40); assert.equal(d.media, 18.25);
  assert.deepEqual(d.classes.map(c => c.n), [1, 1, 0, 1, 1]);
  assert.equal(d.classes[0].pct, 25);
  assert.deepEqual(amostrasDoLaudo(null, 'p'), []);
  assert.equal(distribuirAmostras([], LEG_P).media, null);
});

// ── Nutrientes ──────────────────────────────────────────────────────────────
t('direção: estável dentro de 5% do valor inicial; sem base sem duas análises', () => {
  assert.equal(direcao(10, 10.4, 0.4), 'estavel');
  assert.equal(direcao(10, 12, 2), 'subiu');
  assert.equal(direcao(10, 5, -5), 'caiu');
  assert.equal(direcao(10, 10, null), 'sem-base');
  assert.equal(direcao(null, null, null), 'sem-base');
  assert.deepEqual(contarDirecoes(['subiu', 'caiu', 'subiu', 'sem-base']), { subiu: 2, caiu: 1, estavel: 0, 'sem-base': 1 });
});

// ── Zonas ───────────────────────────────────────────────────────────────────
const ZA = tal('ZA', 10, { zonasFc: [{ classe: 'Alta', areaHa: 4 }, { classe: 'Baixa', areaHa: 6 }] });
const ZB = tal('ZB', 20, { zonasFc: [{ classe: 'Alta', areaHa: 12 }, { classe: 'Média', areaHa: 8 }],
  prescricoes: [{ id: 'p1', talhaoId: 'x', ano: '26/27', nome: 'Calcário', produto: 'Calcário', unidade: 't/ha', tipo: 'corretivo', versao: 1, atualizadoEm: '2026-01-01', zonas: [], exportes: [] }] });
const ZC = tal('ZC', 15, {});
t('zonas por talhão: mesma chave/cor do geral, dominante, nº de prescrições', () => {
  const z = zonasPorTalhao([ZA, ZB, ZC], 2026);
  assert.equal(z.areaGeral, 30);
  assert.deepEqual(z.geral.map(g => g.chave), ['Alta', 'Média', 'Baixa']);
  const a = z.talhoes.find(x => x.nome === 'ZA');
  assert.equal(a.nZonas, 2); assert.equal(a.areaZonas, 10);
  assert.equal(a.dominante.chave, 'Baixa');
  assert.equal(a.partes.find(p => p.chave === 'Alta').cor, z.geral.find(g => g.chave === 'Alta').cor);
  assert.equal(z.talhoes.find(x => x.nome === 'ZB').nPrescricoes, 1);
  const c = z.talhoes.find(x => x.nome === 'ZC');
  assert.equal(c.nZonas, 0); assert.equal(c.dominante, null);
});
t('potencial da zona pelo nome da classe', () => {
  assert.equal(potencialDaZona('Alta'), 'alto');
  assert.equal(potencialDaZona('Baixa'), 'baixo');
  assert.equal(potencialDaZona('z:3'), null);
});

// ── Prescrições ─────────────────────────────────────────────────────────────
const pres = (id, o = {}) => ({
  id, talhaoId: 'T', ano: '26/27', nome: 'Calcário', tipo: 'corretivo', produto: 'Calcário', unidade: 't/ha', versao: 1, atualizadoEm: '2026-03-01',
  zoneamentoId: 'z', zoneamentoNome: 'z', modo: 'manual', params: {}, historico: [], exportes: [], criadoEm: '2026-03-01', criadoPor: 'x',
  zonas: [
    { idZona: 'a', nomeZona: 'Zona 1', classe: 'Alta', cor: '#0a0', areaHa: 10, dose: 1 },
    { idZona: 'b', nomeZona: 'Zona 2', classe: 'Baixa', cor: '#a00', areaHa: 30, dose: 3 },
  ], fc: { type: 'FeatureCollection', features: [] }, ...o,
});
t('prescrição: a versão mais nova da cadeia vale; Lavra removida e outro ano ficam de fora', () => {
  const d = tal('P', 40, { prescricoes: [
    pres('v1'), pres('v2', { origemId: 'v1', versao: 2, atualizadoEm: '2026-04-01' }),
    pres('outra', { nome: 'Fosfato', produto: 'Fosfato', versao: 1 }),
    pres('velha', { ano: '24/25', nome: 'Velha' }),
    pres('lavra', { nome: 'Lavra', origemLavra: { removida: true } }),
  ] });
  const v = prescricoesVigentes(d, 2026);
  assert.deepEqual(v.map(p => p.id).sort(), ['outra', 'v2']);
});
t('resumo da prescrição: dose média PONDERADA, total do produto, área', () => {
  const r = resumirPrescricao(pres('x'), 'T-01');
  assert.equal(r.areaHa, 40);
  perto(r.doseMedia, (1 * 10 + 3 * 30) / 40);   // 2,5 t/ha
  assert.equal(r.doseMin, 1); assert.equal(r.doseMax, 3);
  assert.equal(r.total, 100);                    // 2,5 × 40 = 100 t
  assert.equal(r.unidadeTotal, 't');
  assert.equal(r.comAjusteGerminacao, false);
  assert.equal(r.nZonas, 2);
});
t('semente em população desejada: o total já vem compensado pela germinação', () => {
  const s = pres('s', { tipo: 'sementes', unidade: 'sementes/ha', produto: 'Soja',
    params: { doseEhPopulacao: true, sementes: { germinacaoPct: 80 } },
    zonas: [{ idZona: 'a', nomeZona: 'Z1', classe: 'Alta', cor: '#0a0', areaHa: 10, dose: 100000 }] });
  const r = resumirPrescricao(s, 'T');
  assert.equal(r.doseMedia, 100000);
  assert.equal(r.total, 1250000);                // 100 000 ÷ 0,8 × 10 ha
  assert.equal(r.comAjusteGerminacao, true);
});
t('semente por metro sem espaçamento: total fica sem número (não inventa)', () => {
  const s = pres('s', { tipo: 'sementes', unidade: 'sementes/m', produto: 'Soja', params: { sementes: { germinacaoPct: 90 } },
    zonas: [{ idZona: 'a', nomeZona: 'Z1', classe: 'Alta', cor: '#0a0', areaHa: 10, dose: 14 }] });
  const r = resumirPrescricao(s, 'T');
  assert.equal(r.total, null);
  assert.equal(r.doseMedia, 14);
  const com = resumirPrescricao({ ...s, params: { sementes: { germinacaoPct: 90, espacamentoM: 0.5 } } }, 'T');
  assert.equal(com.total, 14 * (10000 / 0.5) * 10);
});
t('prescrição sem zona com área: sem dose nem total', () => {
  const r = resumirPrescricao(pres('v', { zonas: [{ idZona: 'a', nomeZona: 'Z', classe: 'Alta', cor: '#0a0', areaHa: 0, dose: 2 }] }), 'T');
  assert.equal(r.doseMedia, null); assert.equal(r.total, null); assert.equal(r.areaHa, 0);
});
t('produtos: agrupa por produto+unidade, soma área e total, ordena por área', () => {
  const a = resumirPrescricao(pres('a'), 'T1');
  const b = resumirPrescricao(pres('b', { talhaoId: 'T2' }), 'T2');
  const f = resumirPrescricao(pres('f', { nome: 'Fosfato', produto: 'FOSFATO', unidade: 'kg/ha', zonas: [{ idZona: 'a', nomeZona: 'Z', classe: 'Alta', cor: '#0a0', areaHa: 5, dose: 100 }] }), 'T1');
  const ps = produtosPrescritos([f, a, b]);
  assert.equal(ps.length, 2);
  assert.equal(ps[0].produto, 'Calcário');
  assert.equal(ps[0].areaHa, 80); assert.equal(ps[0].total, 200); assert.equal(ps[0].nTalhoes, 2);
  assert.equal(ps[1].total, 500);
  // mesmo produto em outra unidade NÃO se mistura
  const g = resumirPrescricao(pres('g', { unidade: 'kg/ha' }), 'T3');
  assert.equal(produtosPrescritos([a, g]).length, 2);
});
t('escala de doses: poucas doses = uma faixa por dose; muitas = 5 faixas iguais', () => {
  const e = escalaDeDoses([1, 3, 3, 2.5, 1]);
  assert.deepEqual(e.faixas.map(f => f.min), [1, 2.5, 3]);
  assert.equal(e.faixaDe(3), 2);
  assert.notEqual(e.corDe(1), e.corDe(3));
  const muitas = escalaDeDoses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(muitas.faixas.length, 5);
  assert.equal(muitas.faixaDe(1), 0); assert.equal(muitas.faixaDe(10), 4);
  assert.equal(escalaDeDoses([]).faixas.length, 0);
  assert.equal(escalaDeDoses([2]).faixas.length, 1);
});
t('distribuição de doses: ha e % por faixa; dose média do conjunto ponderada', () => {
  const a = resumirPrescricao(pres('a'), 'T1');
  const e = escalaDeDoses(a.zonas.map(z => z.dose));
  const d = distribuirDoses([a], e);
  assert.equal(d.areaTotal, 40);
  assert.deepEqual(d.faixas.map(f => f.ha), [10, 30]);
  assert.deepEqual(d.faixas.map(f => f.pct), [25, 75]);
  const b = resumirPrescricao(pres('b', { zonas: [{ idZona: 'a', nomeZona: 'Z', classe: 'Alta', cor: '#0a0', areaHa: 40, dose: 1 }] }), 'T2');
  perto(doseMediaDoConjunto([a, b]), (2.5 * 40 + 1 * 40) / 80);
  assert.equal(doseMediaDoConjunto([]), null);
});
t('exportações: conta por formato e acha o mais recente', () => {
  const a = resumirPrescricao(pres('a', { exportes: [{ em: '2026-03-02T10:00:00Z', formato: 'shp', arquivo: 'a.zip', por: 'x' }, { em: '2026-03-05T10:00:00Z', formato: 'pdf', arquivo: 'a.pdf', por: 'x' }] }), 'T');
  const b = resumirPrescricao(pres('b', { exportes: [{ em: '2026-03-09T10:00:00Z', formato: 'shp', arquivo: 'b.zip', por: 'x' }] }), 'T');
  const r = resumoExportes([a, b]);
  assert.deepEqual(r.map(x => [x.formato, x.n]), [['shp', 2], ['pdf', 1]]);
  assert.equal(r[0].ultimo, '2026-03-09T10:00:00Z');
  assert.equal(rotuloExporte({ formato: 'shp', em: '2026-03-09T10:00:00Z' }), 'SHP · 09/03/26');
});

// ── Compactação ─────────────────────────────────────────────────────────────
const pontosComp = (camadas) => camadas[Object.keys(camadas)[0]].map((_, i) => ({ valores: Object.fromEntries(Object.entries(camadas).map(([k, vs]) => [k, vs[i]])) }));
const imp = (id, ano, camadas, extra = {}) => ({ id, nome: `Pen ${ano}`, safra: `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`, ano, criadoEm: `${ano}-05-01T00:00:00Z`, dataReferencia: `${ano}-05-10`, profundidades: Object.keys(camadas), pontos: pontosComp(camadas), ...extra });
// Camadas: 0-10 baixa, 10-20 média, 20-30 crítica (média 2,5, 3 dos 4 pontos acima de 2,0)
const CA = { '20-30': [1.8, 2.4, 2.6, 3.2], '0-10': [0.6, 0.8, 1.0, 1.2], '10-20': [1.2, 1.4, 1.6, 1.8] };
const CT1 = tal('K1', 20, { compactacao: [imp('i1', 2026, CA), imp('i0', 2022, { '0-10': [4, 4, 4, 4] })] });
const CT2 = tal('K2', 80, { compactacao: [imp('i2', 2026, { '0-10': [1.0, 1.2], '20-30': [0.9, 1.1] })] });
const CT3 = tal('K3', 50, {});
t('classes críticas da compactação: Alto e Muito Alto; limite = início da faixa (2,0 MPa)', () => {
  assert.deepEqual([...classesCriticasCompactacao(LEG_COMP)].sort(), ['Alto', 'Muito Alto']);
  assert.equal(limiteCompactacao(LEG_COMP), 2);
  // nomes próprios: valem as duas últimas pela ordem
  const outra = cls5([1, 2, 3, 4], ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual([...classesCriticasCompactacao(outra)].sort(), ['D', 'E']);
  assert.equal(classesCriticasCompactacao([]), null);
});
t('medição do talhão: importação mais recente até o ano, camadas ordenadas por profundidade', () => {
  const m = medicaoDoTalhao(CT1, 2026, LEG_COMP);
  assert.equal(m.importacaoId, 'i1');
  assert.deepEqual(m.camadas.map(c => c.prof), ['0-10', '10-20', '20-30']);
  const c = m.camadas[2];
  assert.equal(c.n, 4); assert.equal(c.media, 2.5); assert.equal(c.min, 1.8); assert.equal(c.max, 3.2);
  assert.equal(c.critica, true); assert.equal(c.classe, 'Alto');
  assert.equal(c.pctCritico, 75);                      // 2,4 / 2,6 / 3,2 acima de 2,0
  assert.deepEqual(m.criticas, ['20-30']);
  assert.equal(m.pior.prof, '20-30');
  assert.equal(m.nPontos, 4);
});
t('medição: o filtro de safra mostra a medição daquele ano, não a futura; sem medição = null', () => {
  assert.equal(medicaoDoTalhao(CT1, 2023, LEG_COMP).importacaoId, 'i0');
  assert.equal(medicaoDoTalhao(CT1, 2021, LEG_COMP), null);
  assert.equal(medicaoDoTalhao(CT3, 2026, LEG_COMP), null);
  // pontos como número (forma mínima de outros fluxos) não quebra
  assert.equal(medicaoDoTalhao(tal('N', 5, { compactacao: [{ safra: '26/27', criadoEm: '2026-01-01', pontos: 12 }] }), 2026, LEG_COMP), null);
});
t('perfil por camada: média ponderada pela área e % de pontos críticos', () => {
  const ms = [CT1, CT2].map(d => medicaoDoTalhao(d, 2026, LEG_COMP));
  assert.deepEqual(camadasDasMedicoes(ms), ['0-10', '10-20', '20-30']);
  const p = perfilPorCamada(ms, LEG_COMP);
  const c0 = p.find(x => x.prof === '0-10');
  // K1 0-10 = 0,9 (20 ha); K2 0-10 = 1,1 (80 ha) → 1,06
  perto(c0.media, 1.06, 0.005);
  assert.equal(c0.nTalhoes, 2);
  const c2 = p.find(x => x.prof === '20-30');
  // K1 2,5 (20 ha) e K2 1,0 (80 ha) → 1,3: não é crítica na média do conjunto…
  perto(c2.media, 1.3, 0.005);
  assert.equal(c2.critica, false);
  // …mas 3 dos 6 pontos (K1: 3 de 4; K2: 0 de 2) passam de 2,0 → 50%
  assert.equal(c2.pctCritico, 50);
  assert.equal(c2.min, 0.9); assert.equal(c2.max, 3.2);
  assert.equal(camadaMaisResistente(p).prof, '10-20');   // 1,5 MPa (só o K1 mediu), acima de 1,3 e 1,06
  assert.equal(c0.nTalhoes, 2);
  const so10 = p.find(x => x.prof === '10-20');
  assert.equal(so10.nTalhoes, 1);   // K2 não mediu 10-20
  assert.equal(camadaMaisResistente([]), null);
});

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
