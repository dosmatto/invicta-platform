// Testes da ÁREA DE CADA PARTE de um talhão multipolígono (lib/areaGeo →
// partesComArea). É o que a gaveta de áreas separadas mostra na lista da fazenda.
//
// O que pode dar errado e a tela não denuncia:
//  - a soma das partes não fechar com a área total do cadastro (o usuário soma
//    na calculadora e conclui que o app errou);
//  - furos entrarem na conta de uma parte;
//  - a ordem vir do shapefile (arbitrária), fazendo "Área 1" ser o pedaço menor.
// Roda: `npm run teste:areas`
import assert from 'node:assert/strict';
import { partesComArea, areaHaGeo } from '../src/lib/areaGeo.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// Retângulos em graus, na latitude do Paraná (~ -24,5): é onde o fator
// geodésico importa e onde estão os talhões reais.
const quad = (w, s, larg, alt) => [[[w, s], [w + larg, s], [w + larg, s + alt], [w, s + alt], [w, s]]];
const LAT = -24.5, LNG = -50.2;

t('Polygon: uma parte só, com 100% e a área do talhão', () => {
  const p = { type: 'Polygon', coordinates: quad(LNG, LAT, 0.02, 0.01) };
  const partes = partesComArea(p);
  assert.equal(partes.length, 1);
  assert.equal(partes[0].pct, 100);
  assert.equal(partes[0].areaHa, areaHaGeo(p));
});

t('MultiPolygon: uma parte por área, da MAIOR para a menor', () => {
  // Primeiro no arquivo vem a área PEQUENA — a ordem do shapefile é arbitrária.
  const p = { type: 'MultiPolygon', coordinates: [quad(LNG + 0.1, LAT, 0.004, 0.004), quad(LNG, LAT, 0.03, 0.02)] };
  const partes = partesComArea(p);
  assert.equal(partes.length, 2);
  assert.ok(partes[0].areaHa > partes[1].areaHa, 'a primeira da lista tem de ser a maior');
  assert.equal(partes[0].indice, 1, 'o índice preserva a posição na geometria');
  assert.equal(partes[1].indice, 0);
});

t('A SOMA DAS PARTES FECHA COM A ÁREA TOTAL — em 300 talhões diferentes', () => {
  // Arredondar cada parte por conta própria erra o centésimo de vez em quando,
  // e é exatamente a conta que o usuário refaz olhando a tela.
  let semente = 7;
  const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 300; k++) {
    const n = 2 + Math.floor(rnd() * 4);
    const coords = [];
    for (let i = 0; i < n; i++) coords.push(quad(LNG + i * 0.09, LAT, 0.005 + rnd() * 0.04, 0.005 + rnd() * 0.03));
    const p = { type: 'MultiPolygon', coordinates: coords };
    const soma = partesComArea(p).reduce((s, x) => s + x.areaHa, 0);
    assert.equal(Math.round(soma * 100), Math.round(areaHaGeo(p) * 100),
      `talhão ${k}: partes somam ${soma} e o total é ${areaHaGeo(p)}`);
  }
});

t('Furo é descontado da parte que o contém, e só dela', () => {
  const externo = quad(LNG, LAT, 0.02, 0.02)[0];
  const furo = quad(LNG + 0.005, LAT + 0.005, 0.01, 0.01)[0];
  const comFuro = { type: 'MultiPolygon', coordinates: [[externo, furo], quad(LNG + 0.1, LAT, 0.02, 0.02)] };
  const semFuro = { type: 'MultiPolygon', coordinates: [[externo], quad(LNG + 0.1, LAT, 0.02, 0.02)] };
  const [maior, menor] = partesComArea(comFuro);
  const iguais = partesComArea(semFuro);
  assert.ok(menor.areaHa < maior.areaHa, 'a parte com furo perde área');
  assert.equal(menor.indice, 0, 'a parte esburacada é a do índice 0');
  assert.equal(maior.areaHa, iguais[0].areaHa, 'a outra parte não muda');
});

t('As porcentagens somam 100', () => {
  const p = { type: 'MultiPolygon', coordinates: [quad(LNG, LAT, 0.03, 0.02), quad(LNG + 0.1, LAT, 0.01, 0.008), quad(LNG + 0.2, LAT, 0.004, 0.004)] };
  const soma = partesComArea(p).reduce((s, x) => s + x.pct, 0);
  assert.ok(Math.abs(soma - 100) < 1e-9, `somou ${soma}`);
});

t('Geometria vazia não quebra', () => {
  assert.deepEqual(partesComArea({ type: 'MultiPolygon', coordinates: [] }), []);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
