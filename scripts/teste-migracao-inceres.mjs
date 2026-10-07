// Importador de migração (InCeres) — lógica pura. Roda: npm run teste:migracao
//
// Protege as decisões do usuário (ledger do importador, 07/10/2026):
//   • talhão = CÓDIGO da grade, não a pasta de talhão da InCeres;
//   • nome fora do padrão, mesmo código+safra com polígonos diferentes, pasta
//     sem laudo/pontos → pulados e listados com o motivo;
//   • polígono da safra mais nova = limite; os outros viram versões por safra;
//   • reimportar não muda nada; data de referência no ano da safra.
//
// Se o export real existir (MIGRACAO_EXPORT ou ~/dev/inceres-migracao/export),
// roda também contra as pastas reais: parse de TODAS, laudos de uma amostra,
// os casos grid / zona / multi-polígono / multi-safra.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSXmod from 'xlsx';
import {
  codigoDaGrade, safraDaInceres, dataReferenciaDaSafra, normNome, sugerirExistente,
  assinaturaGeo, prepararPasta, montarPlano, planejarLimites, montarGrade, lerLaudo,
  montarLaudo, amostrasForaDaGrade, agruparArquivosPorPasta, bindingDaGradeMigrada,
  parseJsonTolerante,
} from '../src/lib/migracaoInceres.ts';

const XLSX = XLSXmod.default ?? XLSXmod;

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Fixtures sintéticas ─────────────────────────────────────────────────────
const quadrado = (x0, y0, l = 0.01) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { area_id: 1 }, geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x0 + l, y0], [x0 + l, y0 + l], [x0, y0 + l], [x0, y0]]] } }],
});
const pontosFC = (nums, x0 = -50, y0 = -25) => ({
  type: 'FeatureCollection',
  features: nums.map((n, i) => ({ type: 'Feature', properties: { numero: n, profundidades: i % 2 ? '0-20|20-40' : '0-20' }, geometry: { type: 'Point', coordinates: [x0 + 0.001 * (i + 1), y0 + 0.001 * (i + 1)] } })),
});
function pasta({ produtor = 'Produtor X', fazenda = 'Faz', talhao = 'Talhão 1', safra = '2024-2025', grade = 'PXFA 01 - 2024', car = 1, tipo = 'grid', contorno = quadrado(-50, -25), pontos = pontosFC([1, 2, 3]), zonas, laudo = true, data = '2024-05-07' } = {}) {
  return {
    caminho: `${produtor}/${fazenda}/${talhao}/${safra} - ${grade} [${car}]`,
    meta: JSON.stringify({ produtor, fazenda, talhao, safra, grade_nome: grade, car_id: car, tipo_grade: tipo, unidade: 'cmolc/dm3', profundidades: ['0-20', '20-40'], car: { dateOfManufacture: data } }).replace('"unidade"', '"x":NaN,"unidade"'),
    contorno: JSON.stringify(contorno), pontos: pontos && JSON.stringify(pontos), zonas: zonas && JSON.stringify(zonas), temLaudo: laudo,
  };
}

console.log('Nomes, safra e data');
t('código da grade', () => {
  assert.equal(codigoDaGrade('FCDSR 05 - 2024'), 'FCDSR 05');
  assert.equal(codigoDaGrade('ACHIN 01 - 2026 - Sup'), 'ACHIN 01');
  assert.equal(codigoDaGrade('ARNCA 07B - 2024'), 'ARNCA 07B');
  assert.equal(codigoDaGrade('AFSSA 04 - 2023_TEMPORARIO'), null);   // "2023_" não fecha a palavra
  assert.equal(codigoDaGrade('Amostragem Geral'), null);
  assert.equal(codigoDaGrade('MCAPE 09'), null);
  assert.equal(codigoDaGrade('ARNPR 06 - TOMATE'), null);
});
t('safra InCeres → plataforma', () => {
  assert.deepEqual(safraDaInceres('2020-2021'), { nome: '20/21', anoInicio: 2020, anoFim: 2021 });
  assert.equal(safraDaInceres('2020'), null);
});
t('data de referência sempre no ano inicial da safra', () => {
  const s = safraDaInceres('2023-2024');
  assert.equal(dataReferenciaDaSafra(s, '2023-09-22'), '2023-09-22');
  assert.equal(dataReferenciaDaSafra(s, '2024-04-16'), '2023-07-01');
  assert.equal(dataReferenciaDaSafra(s, null), '2023-07-01');
});
t('nome normalizado (acento/caixa/espaços/pontuação)', () => {
  assert.equal(normNome('  Agropecuária  Vale '), 'agropecuaria vale');
  const lista = [{ id: 'a', nome: 'A.S EMPREENDIMENTOS' }, { id: 'b', nome: 'FOPPE CARRIEL' }];
  assert.equal(sugerirExistente('A S Empreendimentos', lista)?.id, 'a');
  assert.equal(sugerirExistente('Outro', lista), null);
});
t('JSON com NaN cru', () => assert.deepEqual(parseJsonTolerante('{"a":NaN}'), { a: null }));
t('agrupa arquivos por pasta de grade (export inteira ou subpasta)', () => {
  const m = agruparArquivosPorPasta(['export/P/F/T/G [1]/meta.json', 'export/P/F/T/G [1]/laudo.xlsx', 'P/F/T/G [2]/meta.json', 'P/F/T/sem meta/x.txt']);
  assert.deepEqual([...m.keys()], ['export/P/F/T/G [1]', 'P/F/T/G [2]']);
  assert.ok(m.get('export/P/F/T/G [1]').has('laudo.xlsx'));
});

console.log('Preparo de pasta');
t('grid: pontos numerados, profundidades e car_id', () => {
  const r = prepararPasta(pasta({ pontos: pontosFC([3, 1, 2]) }));
  assert.ok(r.ok, r.pulada?.motivo);
  assert.deepEqual(r.ok.pontos.map(p => p.numero), [1, 2, 3]);
  assert.deepEqual(r.ok.pontos.map(p => p.ordem), [0, 1, 2]);
  assert.equal(r.ok.codigo, 'PXFA 01');
  assert.equal(r.ok.dataReferencia, '2024-05-07');
  assert.deepEqual(r.ok.profundidades.map(p => [p.rotulo, p.percentual]), [['0-20', 100], ['20-40', 33]]);
});
t('pulos com motivo', () => {
  assert.match(prepararPasta(pasta({ laudo: false })).pulada.motivo, /sem laudo/);
  assert.match(prepararPasta(pasta({ pontos: null })).pulada.motivo, /sem pontos/);
  assert.match(prepararPasta(pasta({ grade: 'Amostragem Geral' })).pulada.motivo, /fora do padrão/);
});
t('nome sem código usa o talhao_codigo do meta (ligação pelo polígono)', () => {
  const p = pasta({ grade: 'Amostragem Geral' });
  p.meta = p.meta.replace('"car_id"', '"talhao_codigo":" jmgal  03 ","car_id"');
  const r = prepararPasta(p);
  assert.equal(r.ok.codigo, 'JMGAL 03');
  assert.equal(r.ok.nomeGrade, 'Amostragem Geral');
  // o código do nome da grade continua tendo prioridade
  const q = pasta({ grade: 'PXFA 01 - 2024' });
  q.meta = q.meta.replace('"car_id"', '"talhao_codigo":"OUTRO 99","car_id"');
  assert.equal(prepararPasta(q).ok.codigo, 'PXFA 01');
});
const zonasFC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { numero: 2, zona: 2, classe: 'Zona 2', id: 330486, hectares: 10 }, geometry: quadrado(-50.005, -25).features[0].geometry },
    { type: 'Feature', properties: { numero: 1, zona: 1, classe: 'Zona 1', id: 330487, hectares: 6 }, geometry: quadrado(-50, -25, 0.005).features[0].geometry },
    { type: 'Feature', properties: { numero: 2, zona: 2, classe: 'Zona 2', id: 330488, hectares: 1 }, geometry: quadrado(-49.99, -25, 0.002).features[0].geometry },
  ],
};
t('zona: ids "01"/"02"/"02_2", pontos modelo A com numero = zona, zonasGeo congeladas', () => {
  const r = prepararPasta(pasta({ tipo: 'zona', grade: 'PXFA 02 - 2024', zonas: zonasFC, pontos: pontosFC([1, 2]) }));
  assert.ok(r.ok, r.pulada?.motivo);
  assert.deepEqual(r.ok.zonasFC.features.map(f => f.properties.id), ['02', '01', '02_2']);
  assert.deepEqual(r.ok.zonasFC.features.map(f => f.properties.classe), ['Zona 2', 'Zona 1', 'Zona 2']);
  assert.deepEqual(r.ok.pontos.map(p => [p.numero, p.rotulo, p.zona]), [[1, '1-1', '01'], [2, '2-1', '02']]);
  assert.deepEqual(r.ok.zonasGeo.map(z => [z.id, z.rotulo]), [['01', '1'], ['02', '2'], ['02_2', '2']]);
  const g = montarGrade(r.ok, 'T', '24/25', true);
  assert.equal(g.metodo, 'zonas'); assert.equal(g.modelo, 'A'); assert.equal(g.origemExterna.id, '1');
  assert.deepEqual(bindingDaGradeMigrada(g.zonasGeo), { '01': 1, '02': 2, '02_2': 2 });
});
t('zona sem número → pula', () => {
  const z = structuredClone(zonasFC); delete z.features[0].properties.numero;
  assert.match(prepararPasta(pasta({ tipo: 'zona', zonas: z })).pulada.motivo, /vínculo/);
});

console.log('Plano');
t('talhão = código; conflito mesmo código+safra com polígonos diferentes é pulado', () => {
  const plano = montarPlano([
    pasta({ talhao: 'Talhão 1', grade: 'PXFA 05 - 2024', car: 1 }),
    pasta({ talhao: 'Talhão 1 + Talhão 2', safra: '2026-2027', grade: 'PXFA 05 - 2026', car: 2 }),
    pasta({ talhao: 'Talhão 1', grade: 'PXFA 06 - 2024', car: 3, contorno: quadrado(-49, -25) }),
    pasta({ talhao: 'Talhão 9', grade: 'PXFA 07 - 2024', car: 4 }),
    pasta({ talhao: 'Talhão 9', grade: 'PXFA 07 - 2024', car: 5, contorno: quadrado(-48, -25) }),
    pasta({ talhao: 'Talhão 3', grade: 'PXFA 08A - 2024', car: 6 }),
    pasta({ talhao: 'Talhão 3', grade: 'PXFA 08A - 2024 B', car: 7 }),   // mesmo polígono: entram as duas
  ].map(prepararPasta));
  const tal = plano.produtores[0].fazendas[0].talhoes;
  assert.deepEqual(tal.map(x => [x.codigo, x.grades.length]), [['PXFA 05', 2], ['PXFA 06', 1], ['PXFA 08A', 2]]);
  assert.equal(plano.puladas.length, 2);
  assert.ok(plano.puladas.every(p => /polígonos diferentes/.test(p.motivo)));
});

console.log('Limites e versões');
const A = quadrado(-50, -25), B = quadrado(-50, -25, 0.02), C = quadrado(-50, -25, 0.03);
const aplicar = (atual, patch) => ({ ...(atual ?? {}), ...(patch ?? {}) });
t('talhão novo: mais nova = limite; antigas diferentes = versões com as safras', () => {
  const p = planejarLimites(null, [{ safra: '20/21', contorno: A }, { safra: '21/22', contorno: A }, { safra: '22/23', contorno: B }, { safra: '24/25', contorno: C }], 'X');
  assert.equal(assinaturaGeo(JSON.parse(p.geojson)), assinaturaGeo(C));
  assert.deepEqual(p.geoVersoes.map(v => [v.versao, v.safras]), [[1, ['20/21', '21/22']], [2, ['22/23']]]);
  assert.equal(p.geoVersao, 3);
  assert.equal(p.origemExterna.safraLimite, '24/25');
  assert.ok(p.areaHa > 0 && p.bbox.length === 4);
});
t('reimportar não muda nada', () => {
  const entrada = [{ safra: '20/21', contorno: A }, { safra: '24/25', contorno: C }];
  const t1 = aplicar(null, planejarLimites(null, entrada, 'X'));
  assert.equal(planejarLimites(t1, entrada, 'Y'), null);
});
t('safra nova numa reimportação troca o limite e arquiva o anterior', () => {
  const t1 = aplicar(null, planejarLimites(null, [{ safra: '20/21', contorno: A }], 'X'));
  const p = planejarLimites(t1, [{ safra: '20/21', contorno: A }, { safra: '25/26', contorno: B }], 'Y');
  assert.equal(assinaturaGeo(JSON.parse(p.geojson)), assinaturaGeo(B));
  assert.deepEqual(p.geoVersoes.map(v => [v.versao, v.safras]), [[1, ['20/21']]]);
  assert.equal(p.geoVersao, 2);
});
t('limite cadastrado na plataforma nunca é sobrescrito', () => {
  const nativo = { geojson: JSON.stringify(A), geoVersao: 1, areaHa: 10 };
  const p = planejarLimites(nativo, [{ safra: '24/25', contorno: B }], 'X');
  assert.equal(p.geojson, undefined);
  assert.deepEqual(p.geoVersoes.map(v => [v.versao, v.safras]), [[2, ['24/25']]]);
  assert.equal(p.geoVersao, 3);
  assert.equal(planejarLimites(aplicar(nativo, p), [{ safra: '24/25', contorno: B }], 'Y'), null);
});
t('talhão existente sem limite recebe o da safra mais nova', () => {
  const p = planejarLimites({ areaHa: 0 }, [{ safra: '24/25', contorno: B }], 'X');
  assert.equal(assinaturaGeo(JSON.parse(p.geojson)), assinaturaGeo(B));
  assert.equal(p.geoVersoes, undefined);
});

console.log('Laudo (fixture)');
const AOA = [
  ['id', 'prof', 'pH', 'MOS', 'P res', 'K', 'Ca', 'Mg', 'Al', 'CTC', 'V%'],
  ['Identificador', 'Profundidade', 'Sem Unidade', 'g/dm³', 'mg/dm³', 'cmolc/dm³', 'cmolc/dm³', 'cmolc/dm³', 'cmolc/dm³', 'cmolc/dm³', '%'],
  ['1', '0-20', '5.2', '38', '12', '0.36', '4.0', '1.8', '0', '10.4', '59'],
  ['2', '0-20', '4.9', '35', '11', '0.32', '3.5', '0.8', '0.1', '10.3', '46'],
  ['2', '20-40', '4.6', '29', '2', '0.27', '2.4', '0.5', '0.4', '10.1', '31'],
];
t('perfil inceres + unidade cmolc convertida para mmolc', () => {
  const l = lerLaudo(AOA);
  const r1 = l.resultados.find(r => r.numero === 1 && r.profundidade === '0-20');
  assert.equal(r1.valores.ca, 40);
  assert.ok(l.elementos.includes('ph'));
  const g = prepararPasta(pasta({ pontos: pontosFC([1, 2]) })).ok;
  assert.deepEqual(amostrasForaDaGrade(l.resultados, g.pontos), []);
  const imp = montarLaudo(g, 'T', '24/25', 'G', l, 'LAB');
  assert.equal(imp.dataReferencia, '2024-05-07'); assert.equal(imp.origemExterna.id, '1');
});
t('planilha que não é InCeres é recusada', () => {
  assert.throws(() => lerLaudo([['Amostra', 'pH', 'Ca', 'Mg'], ['1', '5', '3', '1']]), /não é o laudo InCeres/);
});

// ── Export real ─────────────────────────────────────────────────────────────
const RAIZ = process.env.MIGRACAO_EXPORT ?? path.join(os.homedir(), 'dev/inceres-migracao/export');
if (fs.existsSync(RAIZ)) {
  console.log(`Export real (${RAIZ})`);
  const caminhos = [];
  (function andar(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) andar(path.join(d, e.name), r); else caminhos.push(r);
    }
  })(RAIZ, 'export');
  const pastas = agruparArquivosPorPasta(caminhos);
  const ler = (pasta, nome, arqs) => (arqs.has(nome) ? fs.readFileSync(path.join(RAIZ, '..', pasta, nome), 'utf8') : undefined);
  const preps = [...pastas].map(([p, arqs]) => prepararPasta({
    caminho: p, meta: ler(p, 'meta.json', arqs), contorno: ler(p, 'contorno.geojson', arqs),
    pontos: ler(p, 'pontos.geojson', arqs), zonas: ler(p, 'zonas.geojson', arqs), temLaudo: arqs.has('laudo.xlsx'),
  }));
  const plano = montarPlano(preps);
  const todas = plano.produtores.flatMap(p => p.fazendas.flatMap(f => f.talhoes.flatMap(t => t.grades)));
  const motivos = {};
  for (const p of plano.puladas) { const m = p.motivo.replace(/^\S+ \S+ tem/, 'X tem').replace(/\(\d+ grades\)/, ''); motivos[m] = (motivos[m] ?? 0) + 1; }
  console.log(`    ${pastas.size} pastas → ${todas.length} grades em ${plano.produtores.length} produtores; puladas ${plano.puladas.length}:`, motivos);
  t('todas as 1700 pastas lidas; puladas = sem laudo + sem pontos + fora do padrão + conflito', () => {
    assert.equal(todas.length + plano.puladas.length, pastas.size);
    assert.ok(todas.length > 1000);
    // o export muda conforme laudos são rebaixados: confere contra as pastas de fato sem laudo.xlsx
    const semLaudo = [...pastas.values()].filter(arqs => !arqs.has('laudo.xlsx')).length;
    assert.equal(motivos['sem laudo (laudo.xlsx)'] ?? 0, semLaudo);
  });
  t('Foppe / Santa Rosa: 7 talhões FCDSR 01..07, multi-safra, mesmo polígono', () => {
    const p = plano.produtores.find(x => x.nome.startsWith('Foppe'));
    const f = p.fazendas.find(x => x.nome === 'Santa Rosa');
    assert.deepEqual(f.talhoes.map(t => t.codigo), ['FCDSR 01', 'FCDSR 02', 'FCDSR 03', 'FCDSR 04', 'FCDSR 05', 'FCDSR 06', 'FCDSR 07']);
    for (const tal of f.talhoes) {
      assert.deepEqual(tal.grades.map(g => g.safra.nome), ['24/25', '26/27']);
      const patch = planejarLimites(null, tal.grades.map(g => ({ safra: g.safra.nome, contorno: g.contorno })), 'X');
      assert.equal(patch.origemExterna.safraLimite, '26/27');
      assert.equal(planejarLimites(patch, tal.grades.map(g => ({ safra: g.safra.nome, contorno: g.contorno })), 'Y'), null);
    }
  });
  t('zona real (ACHIN 01): 7 zonas, laudo casa por número', () => {
    const g = todas.find(x => x.carId === '474640');
    assert.equal(g.tipo, 'zona');
    assert.equal(g.zonasGeo.length, 7);
    assert.deepEqual(g.pontos.map(p => p.numero), [1, 2, 3, 4, 5, 6, 7]);
    const wb = XLSX.read(fs.readFileSync(path.join(RAIZ, '..', g.caminho, 'laudo.xlsx')), { type: 'buffer', codepage: 1252 });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, raw: false, defval: '' });
    const l = lerLaudo(aoa);
    assert.deepEqual(amostrasForaDaGrade(l.resultados, g.pontos), []);
    assert.deepEqual([...new Set(l.resultados.map(r => r.profundidade))], ['0-20', '20-40']);
  });
  t('multi-polígono no contorno vira um limite com várias partes', () => {
    const g = todas.find(x => x.contorno.features.length >= 5);
    assert.ok(g);
    const p = planejarLimites(null, [{ safra: g.safra.nome, contorno: g.contorno }], 'X');
    assert.equal(JSON.parse(p.geojson).features.length, g.contorno.features.length);
  });
  t('todas as grades: data de referência no ano da safra', () => {
    for (const g of todas) assert.equal(+g.dataReferencia.slice(0, 4), g.safra.anoInicio, g.caminho);
  });
  // MIGRACAO_TODOS=1 lê TODOS os laudos (lento); por padrão, 1 a cada 10.
  t('laudos reais: perfil inceres e nenhuma amostra fora da grade', () => {
    const fora = [], erros = [];
    let n = 0;
    for (const g of todas.filter((_, i) => process.env.MIGRACAO_TODOS || i % 10 === 0)) {
      const wb = XLSX.read(fs.readFileSync(path.join(RAIZ, '..', g.caminho, 'laudo.xlsx')), { type: 'buffer', codepage: 1252 });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, raw: false, defval: '' }).map(r => r.map(c => String(c ?? '')));
      n++;
      // Laudo ruim é erro DA PASTA (o importador registra e segue), não do teste.
      let l;
      try { l = lerLaudo(aoa); } catch (e) { erros.push(`${g.caminho}: ${e.message}`); continue; }
      const f = amostrasForaDaGrade(l.resultados, g.pontos);
      if (f.length) fora.push(`${g.nomeGrade}: ${f.join(',')}`);
    }
    console.log(`    ${n} laudos lidos; erros ${erros.length}; com amostra fora da grade: ${fora.length}`, erros.slice(0, 5), fora.slice(0, 5));
    assert.ok(erros.length <= n * 0.02, `muitos laudos ilegíveis: ${erros.length}`);
    assert.ok(fora.length <= n * 0.05, `muitos laudos com amostra fora da grade: ${fora.length}`);
  });
} else {
  console.log(`(export real ausente em ${RAIZ} — só os testes sintéticos)`);
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
