// Testes da escolha do mapa que alimenta a RECOMENDAÇÃO.
//
// Regra: a dose é calculada em 20 m. Até a v2.36.0 pegávamos o mapa fino e
// fazíamos a MÉDIA de blocos 4×4; agora a Fertilidade grava também um mapa
// interpolado NATIVAMENTE a 20 m, e é ele que tem de ser escolhido. Com DOIS
// mapas por atributo na nuvem, a regra deixou de ser "o mais recente ganha" —
// sem estes testes, um mapa fino reprocessado depois voltaria a sequestrar a
// conta em silêncio. Cobrem também o parser do id, que precisa continuar lendo
// ids legados e o segmento novo `krigefixa` (v2.34.0).
// Roda: `npm run teste:grids`.
import assert from 'node:assert/strict';
import { lerChaveMapa, escolherMapas } from '../src/lib/recomendacao/escolhaMapa.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const PREFIXO = 'tal1__imp1__';
const id = (metodo, pixel, modelo, nut, prof) => `${PREFIXO}${metodo}__${pixel}__${modelo}__${nut}__${prof}`;

// ── parser do id ──────────────────────────────────────────────────────────
t('id novo: extrai chave, pixel e método', () => {
  const r = lerChaveMapa(id('krige', 5, 'auto', 'satk', '0-20').slice(PREFIXO.length));
  assert.deepEqual(r, { chave: 'satk__0-20', pixel: 5, metodo: 'krige' });
});

t('Krigagem fixa: o método novo não confunde o parser', () => {
  const r = lerChaveMapa(id('krigefixa', 20, 'spherical', 'ctc', '0-20').slice(PREFIXO.length));
  assert.deepEqual(r, { chave: 'ctc__0-20', pixel: 20, metodo: 'krigefixa' });
});

t('modo zona: método "zona" é lido como qualquer outro', () => {
  const r = lerChaveMapa(id('zona', 5, '', 'k', '0-20').slice(PREFIXO.length));
  assert.equal(r.chave, 'k__0-20');
  assert.equal(r.metodo, 'zona');
});

t('id LEGADO (legenda__nut__prof): chave certa, sem pixel', () => {
  const r = lerChaveMapa('fabc_ph__ph__0-20');
  assert.deepEqual(r, { chave: 'ph__0-20' });
});

t('id curto demais: null (não vira mapa)', () => {
  assert.equal(lerChaveMapa('so-uma-parte'), null);
});

t('pixel decimal (2,5 m gravado como 2.5) é numérico e não vira 20', () => {
  const r = lerChaveMapa(id('krige', 2.5, 'auto', 'k', '0-20').slice(PREFIXO.length));
  assert.equal(r.pixel, 2.5);
});

// ── escolha entre candidatos ──────────────────────────────────────────────
t('BUG QUE ISTO TRAVA: com 5 m e 20 m do mesmo atributo, vence o de 20 m', () => {
  // o de 5 m é MAIS RECENTE — antes o desempate era só por data e ele ganharia
  const itens = [
    { id: id('krige', 20, 'auto', 'satk', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krige', 5, 'auto', 'satk', '0-20'), tem: true, em: '2026-08-07T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens)['satk__0-20'];
  assert.equal(e.indice, 0, 'deve escolher o de 20 m mesmo sendo o mais antigo');
  assert.equal(e.eh20, true);
  assert.equal(e.pixel, 20);
});

t('sem mapa de 20 m: usa o fino e marca para reamostrar', () => {
  const itens = [{ id: id('krige', 5, 'auto', 'ctc', '0-20'), tem: true, em: '2026-08-07T10:00:00Z' }];
  const e = escolherMapas(PREFIXO, itens)['ctc__0-20'];
  assert.equal(e.eh20, false, 'eh20=false é o que liga a reamostragem em carregarGridsTalhao');
  assert.equal(e.pixel, 5);
});

t('ter grid vence ser de 20 m (mapa de 20 m só com metadados não serve)', () => {
  const itens = [
    { id: id('krige', 20, 'auto', 'k', '0-20'), tem: false, em: '2026-08-07T10:00:00Z' },
    { id: id('krige', 5, 'auto', 'k', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens)['k__0-20'];
  assert.equal(e.indice, 1, 'sem grid não dá para calcular nada');
  assert.equal(e.eh20, false);
});

t('dois mapas de 20 m: desempata pelo mais recente', () => {
  const itens = [
    { id: id('krige', 20, 'auto', 'k', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krigefixa', 20, 'spherical', 'k', '0-20'), tem: true, em: '2026-08-07T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens)['k__0-20'];
  assert.equal(e.indice, 1);
  assert.equal(e.metodo, 'krigefixa');
});

t('id legado nunca ganha de um mapa de 20 m', () => {
  const itens = [
    { id: `${PREFIXO}legenda__ph__0-20`, tem: true, em: '2026-08-07T10:00:00Z' },
    { id: id('krige', 20, 'auto', 'ph', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
  ];
  const e = escolherMapas(PREFIXO, itens)['ph__0-20'];
  assert.equal(e.indice, 1, 'legado não tem pixel → eh20=false → perde');
});

t('profundidades e atributos diferentes não se misturam', () => {
  const itens = [
    { id: id('krige', 20, 'auto', 'k', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krige', 20, 'auto', 'k', '20-40'), tem: true, em: '2026-08-01T10:00:00Z' },
    { id: id('krige', 20, 'auto', 'ctc', '0-20'), tem: true, em: '2026-08-01T10:00:00Z' },
  ];
  const r = escolherMapas(PREFIXO, itens);
  assert.deepEqual(Object.keys(r).sort(), ['ctc__0-20', 'k__0-20', 'k__20-40']);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
