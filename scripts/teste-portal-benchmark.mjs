// Testes do benchmark anônimo do Portal (lib/portal/benchmarkCalc) — o núcleo
// puro que decide o número do "Comparativo Invicta".
//
// O que a tela NÃO pode errar: com 4 produtores não sai número nenhum; com 5–9
// sai só a média (desvio e quantis só com 10+); vários talhões do
// mesmo produtor contam 1; o escopo da fertilidade cai cidade → UF → geral; e
// nada de terceiros (ids, nomes, mín./máx., listas) aparece na saída.
// Roda: `node scripts/teste-portal-benchmark.mjs`
import assert from 'node:assert/strict';
import {
  montarBase, montarResposta, normalizarCultura, normalizarCamada, quantil, percentil, desvio,
  laudosDaJanela, talhoesDoEscopo, anoBenchmarkValido, totalAnosBenchmark, itemDaCulturaBench, chaveCulturaBench, MINIMO_PRODUTORES, MINIMO_QUANTIS, CAMADA_PADRAO, ROTULO_GERAL,
} from '../src/lib/portal/benchmarkCalc.ts';
import { criarLimitador, criarCacheLru } from '../src/lib/portal/memoriaServidor.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// ── Fixtures ────────────────────────────────────────────────────────────────
// N produtores C1..CN, cada um com 1 talhão de 100 ha e um mapa de soja.
const ANO = 2026;
function cenario(kgs, extra = {}) {
  const talhoes = [], mapas = [], laudos = [], locais = new Map();
  kgs.forEach((kg, i) => {
    const c = `C${i + 1}`, tid = `T${i + 1}`;
    talhoes.push({ id: tid, clienteId: c, areaHa: 100 });
    mapas.push({ talhaoId: tid, cultura: 'Soja', oficial: true, criadoEm: '2026-03-01', ano: ANO, mediaKgha: kg, areaHa: 100 });
    laudos.push({ id: `L${i + 1}`, talhaoId: tid, ano: ANO, resultados: [{ profundidade: '00-20', valores: { p: 10 + i, k: 0.3, v: 50 + i } }] });
    locais.set(c, { cidade: 'Castro', uf: 'PR' });
  });
  return { ano: ANO, talhoes, mapas, laudos, locais, ...extra };
}
const resp = (e, cli = 'C1') => montarResposta(montarBase(e), cli, '2026');
const soja = r => r.produtividade.find(x => x.cultura === 'Soja');

// ── Mínimo de produtores ────────────────────────────────────────────────────
t('n=4: insuficiente, sem média/desvio/quantis/voce', () => {
  const s = soja(resp(cenario([3000, 3300, 3600, 3900])));
  assert.equal(s.nProdutores, 4);
  assert.equal(s.insuficiente, true);
  for (const k of ['mediaScHa', 'desvioScHa', 'quantis', 'voce']) assert.equal(k in s, false, k);
  const r = resp(cenario([3000, 3300, 3600, 3900]));
  assert.equal(r.fertilidade.insuficiente, true);
  assert.equal('medias' in r.fertilidade, false);
});

t('n=5..9: só a média em sc/ha; desvio e quantis AUSENTES (cercariam cada valor)', () => {
  const s = soja(resp(cenario([3000, 3300, 3600, 3900, 4200])));
  assert.equal(s.nProdutores, 5);
  assert.equal(s.insuficiente, false);
  assert.equal(s.mediaScHa, 60);                       // 3600 kg/ha / 60
  assert.equal('desvioScHa' in s, false);
  assert.equal(s.quantis, undefined);
  assert.deepEqual(s.voce, { mediaScHa: 50, percentil: 10 }); // C1 é o menor: rank médio 0,5/5
  const s9 = soja(resp(cenario(Array.from({ length: MINIMO_QUANTIS - 1 }, (_, i) => 3000 + i * 100))));
  assert.equal('desvioScHa' in s9, false);
});

t('n=10: desvio e quantis aparecem (quantis inteiros); percentil do topo = 95', () => {
  const kgs = Array.from({ length: MINIMO_QUANTIS }, (_, i) => 3000 + i * 120);
  const s = soja(resp(cenario(kgs), 'C10'));
  assert.equal(s.desvioScHa, Math.round((desvio(kgs) / 60) * 10) / 10);
  assert.ok(s.quantis);
  for (const v of Object.values(s.quantis)) assert.ok(Number.isInteger(v));
  assert.ok(s.quantis.p10 <= s.quantis.p50 && s.quantis.p50 <= s.quantis.p90);
  assert.equal(s.voce.percentil, 95);
});

t('vários talhões do MESMO produtor contam 1 (ponderado pela área)', () => {
  const e = cenario([3000, 3300, 3600, 3900]);           // 4 produtores…
  // …e o C1 ganha mais 3 talhões: continua 4 → insuficiente.
  for (let j = 0; j < 3; j++) {
    e.talhoes.push({ id: `T1x${j}`, clienteId: 'C1', areaHa: 100 });
    e.mapas.push({ talhaoId: `T1x${j}`, cultura: 'soja', oficial: false, criadoEm: '2026-03-02', ano: ANO, mediaKgha: 4200, areaHa: 100 });
  }
  const s = soja(resp(e));
  assert.equal(s.nProdutores, 4);
  assert.equal(s.insuficiente, true);
  // Com um 5º produtor: C1 = (3000·100 + 3·4200·100)/400 = 3900 kg/ha = 65 sc/ha.
  e.talhoes.push({ id: 'T5', clienteId: 'C5', areaHa: 50 });
  e.mapas.push({ talhaoId: 'T5', cultura: 'Soja', oficial: true, criadoEm: '2026-03-01', ano: ANO, mediaKgha: 3600, areaHa: 50 });
  const s2 = soja(resp(e));
  assert.equal(s2.nProdutores, 5);
  assert.equal(s2.voce.mediaScHa, 65);
});

t('mapa: oficial vence o mais recente; outro ano não entra; cultura normalizada', () => {
  const e = cenario([3000, 3300, 3600, 3900, 4200]);
  e.mapas.push({ talhaoId: 'T1', cultura: 'SOJA', oficial: false, criadoEm: '2026-09-01', ano: ANO, mediaKgha: 9000, areaHa: 100 });
  e.mapas.push({ talhaoId: 'T1', cultura: 'Soja', oficial: true, criadoEm: '2025-03-01', ano: 2025, mediaKgha: 9000, areaHa: 100 });
  assert.equal(soja(resp(e)).voce.mediaScHa, 50);
  // Milho safrinha no mesmo talhão entra em "Milho", não some.
  e.mapas.push({ talhaoId: 'T1', cultura: 'Milho safrinha', oficial: true, criadoEm: '2026-08-01', ano: ANO, mediaKgha: 6000, areaHa: 100 });
  const milho = resp(e).produtividade.find(x => x.cultura === 'Milho');
  assert.equal(milho.nProdutores, 1);
  assert.equal(milho.insuficiente, true);
  assert.equal(normalizarCultura('  feijão '), 'Feijão');
  assert.equal(normalizarCultura('Feijao'), 'Feijão');
  assert.equal(normalizarCultura(''), null);
  assert.equal(normalizarCultura('canola'), 'Canola');
});

t('cultura que o cliente não tem e com n<5 nem aparece', () => {
  const e = cenario([3000, 3300, 3600, 3900, 4200]);
  e.mapas.push({ talhaoId: 'T2', cultura: 'Sorgo', oficial: true, criadoEm: '2026-03-01', ano: ANO, mediaKgha: 5000, areaHa: 100 });
  assert.equal(resp(e).produtividade.some(x => x.cultura === 'Sorgo'), false);         // C1 não tem sorgo
  assert.equal(resp(e, 'C2').produtividade.some(x => x.cultura === 'Sorgo'), true);    // C2 tem
});

// ── Fertilidade: escopo e camada ────────────────────────────────────────────
t('escopo cai cidade → UF → geral', () => {
  // 5 em Castro/PR → cidade.
  let r = resp(cenario([1, 2, 3, 4, 5].map(x => x * 1000)));
  assert.equal(r.fertilidade.escopo, 'cidade');
  assert.equal(r.fertilidade.rotulo, 'Castro/PR');
  assert.equal(r.fertilidade.nProdutores, 5);
  assert.equal(r.fertilidade.camada, CAMADA_PADRAO);
  assert.deepEqual(r.fertilidade.voce, { p: 10, k: 0.3, v: 50 });
  assert.equal(r.fertilidade.medias.p, 12);
  // 2 em Castro, 3 em Ponta Grossa (todos PR) → UF.
  const e = cenario([1, 2, 3, 4, 5].map(x => x * 1000));
  ['C3', 'C4', 'C5'].forEach(c => e.locais.set(c, { cidade: 'Ponta Grossa', uf: 'pr' }));
  r = resp(e);
  assert.equal(r.fertilidade.escopo, 'uf');
  assert.equal(r.fertilidade.rotulo, 'PR');
  // Metade em SP → geral (5 no total).
  ['C3', 'C4', 'C5'].forEach(c => e.locais.set(c, { cidade: 'Itapeva', uf: 'SP' }));
  r = resp(e);
  assert.equal(r.fertilidade.escopo, 'geral');
  assert.equal(r.fertilidade.rotulo, ROTULO_GERAL);
  assert.equal(r.fertilidade.nProdutores, 5);
  assert.equal(r.fertilidade.insuficiente, false);
  // Cidade com acento/caixa diferente é a mesma cidade.
  const e2 = cenario([1, 2, 3, 4, 5].map(x => x * 1000));
  e2.locais.set('C2', { cidade: 'CASTRO ', uf: 'PR' });
  assert.equal(resp(e2).fertilidade.escopo, 'cidade');
});

t('fertilidade: só 0-20; janela de 3 anos; o ano mais recente do talhão vence', () => {
  assert.equal(normalizarCamada('00-20'), '0-20');
  assert.equal(normalizarCamada('0 a 20 cm'), '0-20');
  assert.equal(normalizarCamada('20-40'), '20-40');
  const e = cenario([1, 2, 3, 4, 5].map(x => x * 1000));
  // C1: amostra 20-40 com P absurdo não entra; laudo de 2024 (mais antigo) não entra.
  e.laudos[0].resultados.push({ profundidade: '20-40', valores: { p: 999, k: 9, v: 99 } });
  e.laudos.push({ id: 'Lvelho', talhaoId: 'T1', ano: 2024, resultados: [{ profundidade: '0-20', valores: { p: 500 } }] });
  assert.deepEqual(resp(e).fertilidade.voce, { p: 10, k: 0.3, v: 50 });
  // Sem laudo em 2026, o de 2024 (dentro da janela) vale; o de 2023 não.
  const so = laudosDaJanela([{ id: 'a', talhaoId: 'X', ano: 2024 }, { id: 'b', talhaoId: 'X', ano: 2023 }, { id: 'c', talhaoId: 'Y', ano: 2023 }], ANO);
  assert.deepEqual(so.map(l => l.id), ['a']);
});

// ── Vazamento ───────────────────────────────────────────────────────────────
t('nada de terceiros na saída: sem ids, nomes, mín./máx. ou listas de valores', () => {
  const kgs = Array.from({ length: 12 }, (_, i) => 3000 + i * 97);
  const e = cenario(kgs);
  e.locais.set('C7', { cidade: 'Castro', uf: 'PR' });
  const r = resp(e);
  const texto = JSON.stringify(r);
  for (let i = 1; i <= 12; i++) { assert.equal(texto.includes(`"C${i}"`), false); assert.equal(texto.includes(`T${i}`), false); assert.equal(texto.includes(`L${i}`), false); }
  // Nenhuma chave proibida em nível nenhum.
  const proibidas = /^(min|max|minimo|maximo|minScHa|maxScHa|valores|clientes|produtores|ids?|nomes?|talhoes|lista)$/i;
  const visitar = (o, caminho) => {
    if (Array.isArray(o)) { if (caminho !== 'produtividade') assert.fail(`lista inesperada em ${caminho}`); o.forEach(x => visitar(x, caminho + '[]')); return; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { assert.equal(proibidas.test(k), false, `chave ${k}`); visitar(v, k); }
  };
  visitar(r, '');
  // O valor individual do maior/menor produtor NÃO aparece como número.
  const sc = kgs.map(k => Math.round((k / 60) * 10) / 10);
  const s = soja(r);
  const numeros = [s.mediaScHa, s.desvioScHa, ...Object.values(s.quantis)];
  assert.equal(numeros.includes(sc[0]), false);
  assert.equal(numeros.includes(sc[11]), false);
});

t('owner/admin sem cliente: agregado sem "voce"', () => {
  const r = montarResposta(montarBase(cenario([3000, 3300, 3600, 3900, 4200])), null, '2026');
  assert.equal(soja(r).voce, undefined);
  assert.equal(r.fertilidade.voce, undefined);
  assert.equal(r.fertilidade.escopo, 'geral');
  assert.equal(r.minimoProdutores, MINIMO_PRODUTORES);
});

// ── "Você" = escopo do usuário ──────────────────────────────────────────────
t('produtor: o "você" usa só os talhões do escopo dele; o grupo não muda', () => {
  const e = cenario([3000, 3300, 3600, 3900, 4200]);
  e.talhoes.forEach(t0 => { t0.fazendaId = `F${t0.clienteId}`; });
  // C1 tem mais uma fazenda (F1b) com um talhão de 6000 kg/ha.
  e.talhoes.push({ id: 'T1b', clienteId: 'C1', areaHa: 100, fazendaId: 'F1b' });
  e.mapas.push({ talhaoId: 'T1b', cultura: 'Soja', oficial: true, criadoEm: '2026-03-01', ano: ANO, mediaKgha: 6000, areaHa: 100 });
  e.laudos.push({ id: 'L1b', talhaoId: 'T1b', ano: ANO, resultados: [{ profundidade: '0-20', valores: { p: 30, k: 0.5, v: 70 } }] });
  const base = montarBase(e);
  // Sem escopo (owner no preview): o cliente inteiro = (3000 + 6000) / 2 = 4500 → 75 sc/ha.
  assert.equal(soja(montarResposta(base, 'C1', '2026')).voce.mediaScHa, 75);
  // Produtor com só a F1 marcada: o "você" é só o T1 (3000 → 50 sc/ha) e o P/K/V% só dele.
  const reg = { papel: 'produtor', status: 'ativo', clienteId: 'C1', fazendasVinculadas: ['FC1'] };
  const escopo = talhoesDoEscopo(reg, base, [{ id: 'FC1', clienteId: 'C1' }]);
  assert.deepEqual([...escopo].sort(), ['T1']);
  const r = montarResposta(base, { clienteId: 'C1', talhoes: escopo }, '2026');
  assert.equal(soja(r).voce.mediaScHa, 50);
  assert.deepEqual(r.fertilidade.voce, { p: 10, k: 0.3, v: 50 });
  // A média do grupo é a mesma nos dois pedidos.
  assert.equal(soja(r).mediaScHa, soja(montarResposta(base, 'C1', '2026')).mediaScHa);
  // Sem fazenda marcada: todas as fazendas do cliente entram.
  assert.deepEqual([...talhoesDoEscopo({ papel: 'produtor', status: 'ativo', clienteId: 'C1' }, base)].sort(), ['T1', 'T1b']);
  // talhoesVinculados restringe; fazenda de condomínio marcada (de outro cliente) entra.
  assert.deepEqual([...talhoesDoEscopo({ papel: 'produtor', status: 'ativo', clienteId: 'C1', talhoesVinculados: ['T1b'] }, base)], ['T1b']);
  assert.deepEqual([...talhoesDoEscopo({ papel: 'produtor', status: 'ativo', clienteId: 'C1', fazendasVinculadas: ['FC1', 'FC2'] }, base, [{ id: 'FC1', clienteId: 'C1' }, { id: 'FC2', clienteId: 'C2' }])].sort(), ['T1', 'T2']);
  // Escopo sem nenhum talhão com colheita: sem "voce".
  assert.equal(soja(montarResposta(base, { clienteId: 'C1', talhoes: new Set() }, '2026')).voce, undefined);
});

t('portal acha o benchmark de "Milho safrinha" no "Milho" do servidor (mesma normalização)', () => {
  const e = cenario([3000, 3300, 3600, 3900, 4200]);
  e.mapas.forEach(m => { m.cultura = 'Milho safrinha'; });
  const r = resp(e);
  assert.deepEqual(r.produtividade.map(x => x.cultura), ['Milho']);
  // A cultura como o portal a mostra (rótulo do mapa de colheita) acha o item do servidor.
  assert.equal(itemDaCulturaBench(r.produtividade, 'Milho safrinha')?.cultura, 'Milho');
  assert.equal(itemDaCulturaBench(r.produtividade, 'MILHO 2ª safra')?.cultura, 'Milho');
  assert.equal(itemDaCulturaBench(r.produtividade, 'Soja'), undefined);
  assert.equal(itemDaCulturaBench(r.produtividade, ''), undefined);
  assert.equal(chaveCulturaBench('Milho safrinha'), chaveCulturaBench('milho'));
});

t('safra pedida: só [2000, ano atual + 1]', () => {
  assert.equal(anoBenchmarkValido(2026, 2026), true);
  assert.equal(anoBenchmarkValido(2027, 2026), true);
  assert.equal(anoBenchmarkValido(2028, 2026), false);
  assert.equal(anoBenchmarkValido(2000, 2026), true);
  assert.equal(anoBenchmarkValido(1999, 2026), false);
  assert.equal(anoBenchmarkValido(9999, 2026), false);
  assert.equal(anoBenchmarkValido(null, 2026), false);
});

t('estatística: quantil tipo 7 e percentil por rank médio', () => {
  assert.equal(quantil([1, 2, 3, 4, 5], 0.25), 2);
  assert.equal(quantil([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentil([1, 2, 3, 4, 5], 3), 50);
  assert.equal(percentil([1, 1, 1, 1, 1], 1), 50);
});

// ── Limite de pedidos e cache de bases (lib/portal/memoriaServidor) ─────────
t('limite: 10 pedidos por minuto por usuário; o 11º é recusado com o tempo de espera', () => {
  const lim = criarLimitador({ max: 10, janelaMs: 60_000 });
  for (let i = 0; i < 10; i++) assert.equal(lim.permitir('a@x', 1000 + i).ok, true);
  const r = lim.permitir('a@x', 1010);
  assert.equal(r.ok, false);
  assert.equal(r.esperarMs, 60_000 - 10);          // o 1º (t=1000) sai da janela em t=61000
  assert.equal(lim.permitir('b@x', 1010).ok, true); // outro usuário não é afetado
  // Recusado não conta: assim que o 1º sai da janela, volta a passar.
  assert.equal(lim.permitir('a@x', 60_999).ok, false);
  assert.equal(lim.permitir('a@x', 61_000).ok, true);
});
t('limite: o número de usuários guardados tem teto (sai o usado há mais tempo)', () => {
  const lim = criarLimitador({ max: 1, janelaMs: 60_000, maxChaves: 3 });
  for (const u of ['u1', 'u2', 'u3', 'u4']) lim.permitir(u, 0);
  assert.equal(lim.tamanho(), 3);
  assert.equal(lim.permitir('u1', 1).ok, true);     // u1 foi esquecido
  assert.equal(lim.permitir('u4', 1).ok, false);    // u4 continua contado
});
t('cache: o teto cobre todos os anos válidos [2000, atual + 1]', () => {
  assert.equal(totalAnosBenchmark(2026), 28);
  let n = 0;
  for (let a = 1990; a <= 2030; a++) if (anoBenchmarkValido(a, 2026)) n++;
  assert.equal(n, totalAnosBenchmark(2026));
});

const tAsync = [];
const ta = (n, f) => tAsync.push(f().then(() => { ok++; console.log('  ✓', n); }, e => { fail++; console.error('  ✗', n, '—', e.message); }));
ta('cache: alternar entre TODOS os anos válidos lê cada ano uma vez só', async () => {
  const c = criarCacheLru({ max: totalAnosBenchmark(2026) + 1, ttlMs: 600_000, agora: () => 0 });
  let leituras = 0;
  const carregar = ano => () => { leituras++; return Promise.resolve({ ano }); };
  for (let volta = 0; volta < 3; volta++) for (let a = 2000; a <= 2027; a++) assert.equal((await c.obter(a, carregar(a))).ano, a);
  assert.equal(leituras, 28);
});
ta('cache: pedidos simultâneos do mesmo ano esperam a MESMA carga (dedupe)', async () => {
  const c = criarCacheLru({ max: 4, ttlMs: 600_000, agora: () => 0 });
  let leituras = 0, soltar;
  const carga = () => { leituras++; return new Promise(r => { soltar = r; }); };
  const ps = Array.from({ length: 6 }, () => c.obter(2026, carga));
  await Promise.resolve(); await Promise.resolve();
  soltar('base');
  assert.deepEqual(await Promise.all(ps), Array(6).fill('base'));
  assert.equal(leituras, 1);
});
ta('cache: LRU — hit não relê e o usado há mais tempo é o que sai', async () => {
  const c = criarCacheLru({ max: 2, ttlMs: 600_000, agora: () => 0 });
  const lidos = [];
  const carregar = a => () => { lidos.push(a); return Promise.resolve(a); };
  await c.obter(1, carregar(1)); await c.obter(2, carregar(2));
  await c.obter(1, carregar(1));                    // hit: 1 vira o mais recente
  await c.obter(3, carregar(3));                    // sai o 2
  assert.deepEqual(c.chaves(), [1, 3]);
  assert.deepEqual(lidos, [1, 2, 3]);
});
ta('cache: falha não fica presa e a base vence pelo TTL', async () => {
  let agora = 0;
  const c = criarCacheLru({ max: 4, ttlMs: 1000, agora: () => agora });
  await assert.rejects(c.obter(2026, () => Promise.reject(new Error('SEGREDO_INTERNO'))));
  assert.equal(await c.obter(2026, () => Promise.resolve('v1')), 'v1');
  agora = 1000; assert.equal(await c.obter(2026, () => Promise.resolve('v2')), 'v1');
  agora = 1001; assert.equal(await c.obter(2026, () => Promise.resolve('v2')), 'v2');
});
await Promise.all(tAsync);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
