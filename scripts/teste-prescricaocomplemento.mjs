// Complementação por nutriente sobre uma prescrição base
// (src/lib/prescricao/complemento.ts). Roda: `npm run teste:prescricaocomplemento`.
//
// O que este arquivo protege: com base POR CONDIÇÃO (faixas f1..fN de um mapa
// de fertilidade), a prescrição de complemento herda as faixas da base como
// áreas (snapshot — a base pode mudar depois) e cada faixa recebe
// max(0, meta − doseBase × garantiaBase) ÷ garantiaComp, com o mesmo
// arredondamento do fluxo por zoneamento — que não pode mudar.
import assert from 'node:assert/strict';
import { areasDaBaseCondicao, baseTemAreasProprias, dosesDoComplemento, fatorParaKgHa, erroUnidadeBase, dosesDaBaseEmKgHa } from '../src/lib/prescricao/complemento.ts';
import { complementarPorZona } from '../src/lib/insumos.ts';
import { arredondarDose } from '../src/lib/prescricao/calculo.ts';
import { casarZonas } from '../src/lib/prescricao/casar.ts';
import { montarResumoPdf } from '../src/lib/prescricao/resumo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const quadrado = (x0) => ({
  type: 'Polygon',
  coordinates: [[[x0, 0], [x0 + 0.01, 0], [x0 + 0.01, 0.01], [x0, 0.01], [x0, 0]]],
});

// 00-30-10: 150 kg onde P < 40, 100 kg onde P ≥ 40.
function baseCondicao() {
  return {
    id: 'b1', talhaoId: 't1', nome: 'Base P', tipo: 'fertilizante', produto: '00-30-10', unidade: 'kg/ha',
    zoneamentoId: '', zoneamentoNome: 'Condição · Fósforo (P) · 0-20 cm',
    modo: 'condicao',
    params: { condicao: { importacaoId: 'i1', nut: 'p', prof: '0-20', sigla: 'P', rotuloMapa: 'Fósforo (P) · 0-20 cm', limiares: [40], faixas: [{ dose: 150 }, { dose: 100 }], areaMinHa: 0.5 } },
    zonas: [
      { idZona: 'f1', nomeZona: 'P < 40', classe: 'Faixa 1', cor: '#dc2626', areaHa: 30, dose: 150 },
      { idZona: 'f2', nomeZona: 'P >= 40', classe: 'Faixa 2', cor: '#16a34a', areaHa: 70, dose: 100 },
    ],
    fc: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { id: 'f1', zona: 'P < 40', classe: 'Faixa 1', cor: '#dc2626', areaHa: 30 }, geometry: quadrado(0) },
        { type: 'Feature', properties: { id: 'f2', zona: 'P >= 40', classe: 'Faixa 2', cor: '#16a34a', areaHa: 70 }, geometry: quadrado(0.02) },
      ],
    },
    versao: 2, criadoEm: '', criadoPor: '', atualizadoEm: '', historico: [], exportes: [],
  };
}

// K2O: meta 60; base 00-30-10 = 10% K2O; KCl = 60% K2O.
const ENTRADA = { metaKgHa: 60, baseGarantiaPct: 10, compGarantiaPct: 60 };

console.log('\nÁreas a partir da base por condição\n');

t('só a base por condição traz as próprias áreas', () => {
  assert.equal(baseTemAreasProprias({ modo: 'condicao' }), true);
  assert.equal(baseTemAreasProprias({ modo: 'manual' }), false);
  assert.equal(areasDaBaseCondicao({ ...baseCondicao(), modo: 'manual' }), null);
  assert.equal(areasDaBaseCondicao({ ...baseCondicao(), fc: { type: 'FeatureCollection', features: [] } }), null);
});

t('áreas = faixas da base (ids f1..fN, nome, cor, área), dose nasce 0, sem zoneamento', () => {
  const a = areasDaBaseCondicao(baseCondicao());
  assert.deepEqual(a.zonas.map(z => [z.idZona, z.nomeZona, z.cor, z.areaHa, z.dose]),
    [['f1', 'P < 40', '#dc2626', 30, 0], ['f2', 'P >= 40', '#16a34a', 70, 0]]);
  assert.equal(a.zoneamentoNome, 'Áreas de Base P (v2)');
  assert.deepEqual(a.baseDosePorZona, { f1: 150, f2: 100 });
  assert.deepEqual(a.baseCondicao, { rotuloMapa: 'Fósforo (P) · 0-20 cm', sigla: 'P', limiares: [40] });
});

t('snapshot: mexer na base depois não muda as áreas nem as doses copiadas', () => {
  const base = baseCondicao();
  const a = areasDaBaseCondicao(base);
  base.zonas[0].dose = 999;
  base.fc.features[0].properties.id = 'mudou';
  base.fc.features[0].geometry.coordinates[0][0][0] = 50;
  base.params.condicao.limiares.push(80);
  assert.equal(a.baseDosePorZona.f1, 150);
  assert.equal(a.fc.features[0].properties.id, 'f1');
  assert.equal(a.fc.features[0].geometry.coordinates[0][0][0], 0);
  assert.deepEqual(a.baseCondicao.limiares, [40]);
});

t('as áreas casam 1:1 com os polígonos (SHP/PDF/Excel via casarZonas)', () => {
  const a = areasDaBaseCondicao(baseCondicao());
  const c = casarZonas(a.fc, a.zonas);
  assert.equal(c.pares.length, 2);
  assert.equal(c.semPoligono.length, 0);
  assert.equal(c.semZona.length, 0);
});

console.log('\nDose do complemento faixa a faixa\n');

t('cada faixa fecha a meta descontando o que a base entregou ali', () => {
  const a = areasDaBaseCondicao(baseCondicao());
  const r = dosesDoComplemento(a.zonas, a.baseDosePorZona, ENTRADA);
  // f1: 150 × 10% = 15 → falta 45 → 45 / 0,60 = 75
  // f2: 100 × 10% = 10 → falta 50 → 50 / 0,60 = 83,33
  assert.equal(r.doses.f1, 75);
  assert.equal(r.doses.f2, 83.33);
  assert.deepEqual(r.porZona.map(x => x.fornecidoKgHa), [15, 10]);
  assert.deepEqual(r.semBase, []);
  assert.deepEqual(r.baseZero, []);
});

t('base acima da meta → complemento 0 (nunca negativo) e aviso', () => {
  const r = dosesDoComplemento([{ idZona: 'f1', nomeZona: 'P < 40' }], { f1: 800 }, ENTRADA);
  assert.equal(r.doses.f1, 0);
  assert.ok(r.porZona[0].avisos.some(a => /ACIMA da meta/.test(a)));
});

t('faixa onde a base não aplica (0) ou sem dose no snapshot → complemento cobre a meta inteira', () => {
  const zonas = [{ idZona: 'f1', nomeZona: 'P < 40' }, { idZona: 'f2', nomeZona: 'P >= 40' }];
  const r = dosesDoComplemento(zonas, { f1: 0 }, ENTRADA);
  assert.equal(r.doses.f1, 100);
  assert.equal(r.doses.f2, 100);
  assert.deepEqual(r.baseZero, ['P < 40']);
  assert.deepEqual(r.semBase, ['P >= 40']);
});

t('regressão: com zoneamento, o resultado é o de complementarPorZona + arredondarDose', () => {
  const zonas = [{ idZona: 'z1', nomeZona: '1' }, { idZona: 'z2', nomeZona: '2' }, { idZona: 'z3', nomeZona: '3' }];
  const dz = { z1: 133.3, z2: 0, z3: 420 };
  const r = dosesDoComplemento(zonas, dz, ENTRADA);
  const antigo = complementarPorZona(zonas.map(z => ({ idZona: z.idZona, baseDoseKgHa: dz[z.idZona] ?? 0 })), ENTRADA);
  for (const x of antigo) assert.equal(r.doses[x.idZona], arredondarDose(x.doseCompKgHa));
  assert.deepEqual(r.porZona, antigo);
});

console.log('\nUnidade da dose da base\n');

t('kg/ha passa direto; t/ha vira kg/ha (×1000); L/ha e sementes são recusadas', () => {
  assert.equal(fatorParaKgHa('kg/ha'), 1);
  assert.equal(fatorParaKgHa('t/ha'), 1000);
  for (const u of ['L/ha', 'sementes/ha', 'sementes/m', 'sementes/m2']) assert.equal(fatorParaKgHa(u), null, u);
  assert.equal(erroUnidadeBase({ nome: 'X', unidade: 'kg/ha' }), null);
  assert.equal(erroUnidadeBase({ nome: 'X', unidade: 't/ha' }), null);
  assert.match(erroUnidadeBase({ nome: 'X', unidade: 'L/ha' }), /massa por hectare/);
});

t('base por ZONEAMENTO em t/ha: snapshot em kg/ha e a conta fecha a meta certo', () => {
  const base = { unidade: 't/ha', zonas: [{ idZona: 'z1', dose: 0.15 }, { idZona: 'z2', dose: 0.1 }] };
  const dz = dosesDaBaseEmKgHa(base);
  assert.deepEqual(dz, { z1: 150, z2: 100 });
  const r = dosesDoComplemento([{ idZona: 'z1', nomeZona: '1' }, { idZona: 'z2', nomeZona: '2' }], dz, ENTRADA);
  assert.equal(r.doses.z1, 75);
  assert.equal(r.doses.z2, 83.33);
  assert.equal(dosesDaBaseEmKgHa({ unidade: 'L/ha', zonas: base.zonas }), null);
});

t('base por CONDIÇÃO em t/ha converte; em L/ha não gera áreas', () => {
  const b = baseCondicao();
  b.unidade = 't/ha';
  b.zonas = b.zonas.map(z => ({ ...z, dose: z.dose / 1000 }));
  assert.deepEqual(areasDaBaseCondicao(b).baseDosePorZona, { f1: 150, f2: 100 });
  assert.equal(areasDaBaseCondicao({ ...baseCondicao(), unidade: 'L/ha' }), null);
});

console.log('\nRelatório (PDF)\n');

function complemento(baseCond) {
  const a = areasDaBaseCondicao(baseCondicao());
  const r = dosesDoComplemento(a.zonas, a.baseDosePorZona, ENTRADA);
  return {
    ...baseCondicao(), id: 'c1', nome: 'KCl', produto: 'KCl', modo: 'complemento',
    zoneamentoNome: a.zoneamentoNome,
    zonas: a.zonas.map(z => ({ ...z, dose: r.doses[z.idZona] })), fc: a.fc,
    params: { complemento: {
      nutriente: 'k2o', metaKgHa: 60, baseNome: '00-30-10', baseGarantiaPct: 10, compNome: 'KCl', compGarantiaPct: 60,
      basePrescricaoId: 'b1', basePrescricaoNome: 'Base P (v2)', baseDosePorZona: a.baseDosePorZona,
      ...(baseCond ? { baseCondicao: a.baseCondicao } : {}),
    } },
  };
}
const R = { areaHa: 100, nZonas: 2, usado: 8083, doseMin: 75, doseMax: 83.33, doseMedia: 80.8, custo: null };

t('base por condição: o texto diz que a base é por condição e que a conta foi faixa a faixa', () => {
  const txt = montarResumoPdf(complemento(true), R, 1, 2).map(l => l.txt).join(' | ');
  assert.match(txt, /POR CONDIÇÃO/);
  assert.match(txt, /Fósforo \(P\) · 0-20 cm/);
  assert.match(txt, /as 2 faixas da prescrição base/);
  assert.match(txt, /FAIXA A FAIXA/);
  assert.match(txt, /100 a 150 kg\/ha/);
});

t('base por zoneamento: o texto do relatório continua o de antes (ZONA A ZONA)', () => {
  const txt = montarResumoPdf(complemento(false), R, 1, 2).map(l => l.txt).join(' | ');
  assert.match(txt, /TAXA VARIÁVEL/);
  assert.match(txt, /ZONA A ZONA/);
  assert.doesNotMatch(txt, /POR CONDIÇÃO|FAIXA A FAIXA/);
});

console.log(`\n${ok} ok, ${fail} falha(s)\n`);
if (fail) process.exit(1);
