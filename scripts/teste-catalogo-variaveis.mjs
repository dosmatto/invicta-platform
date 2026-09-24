// Catálogo de variáveis: quando é seguro semear/migrar, e como curar as gêmeas.
// Roda: `npm run teste:catalogo`.
//
// Trava o bug de 27/08/2026 — ordem dos elementos (Perfil) e a tela Preferências
// de Análise mudando sozinhas. Diferente das legendas (id fixo → sobrescreve),
// variável tem id aleatório: semear na hora errada DUPLICA, e a leitura passa a
// escolher ora uma cópia ora outra.
import assert from 'node:assert/strict';
import {
  deveSemearCatalogo, podeMigrarCatalogo, gemeasAExcluir,
  curaSeedAntigo, temAssinaturaSeedAntigo, ordemDeFabrica, casasDeFabrica, ORDEM_PADRAO_FERT,
} from '../src/lib/catalogoVariaveis.ts';

let ok = 0, fail = 0;
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
};

console.log('\nCatálogo de variáveis\n');

t('conta nova com a nuvem já respondida → semeia', () => {
  assert.equal(deveSemearCatalogo(0, false), true);
});

t('NUVEM AINDA NÃO RESPONDEU → NÃO semeia (é a fábrica de gêmeas)', () => {
  assert.equal(deveSemearCatalogo(0, true), false,
    'vazio antes de a nuvem responder quer dizer "ainda não sei", não "não existe"');
});

t('catálogo já existe → nunca semeia, respondida ou não', () => {
  assert.equal(deveSemearCatalogo(17, false), false);
  assert.equal(deveSemearCatalogo(17, true), false);
});

t('migração que reescreve a ordem exige catálogo MATERIALIZADO', () => {
  // A guarda antiga perguntava a uma função com fallback em memória e nunca era
  // falsa: rodava contra o seed, gravava a ordem de fábrica e queimava a flag.
  assert.equal(podeMigrarCatalogo(0, false), false, 'nada gravado = não migra');
  assert.equal(podeMigrarCatalogo(17, true), false, 'nuvem muda = espera');
  assert.equal(podeMigrarCatalogo(17, false), true);
});

t('sem duplicata, nada a excluir', () => {
  assert.deepEqual(gemeasAExcluir([
    { id: 'a', varId: 'ph' }, { id: 'b', varId: 'ca' },
  ]), []);
});

t('gêmeas: sobra a EDITADA POR ÚLTIMO', () => {
  const fora = gemeasAExcluir([
    { id: 'velha', varId: 'ph', atualizadoEm: '2026-08-01T10:00:00Z' },
    { id: 'nova',  varId: 'ph', atualizadoEm: '2026-08-27T10:00:00Z' },
  ]);
  assert.deepEqual(fora, ['velha']);
});

t('empate de data desempata por id — dois aparelhos chegam ao mesmo resultado', () => {
  const itens = [
    { id: 'zzz', varId: 'k', atualizadoEm: '2026-08-27T10:00:00Z' },
    { id: 'aaa', varId: 'k', atualizadoEm: '2026-08-27T10:00:00Z' },
  ];
  assert.deepEqual(gemeasAExcluir(itens), ['zzz']);
  assert.deepEqual(gemeasAExcluir([...itens].reverse()), ['zzz'], 'independe da ordem de chegada');
});

t('linha sem data perde para a que tem (o seed novo não rouba o ajuste antigo)', () => {
  const fora = gemeasAExcluir([
    { id: 'seed', varId: 'mo' },
    { id: 'usuario', varId: 'mo', atualizadoEm: '2026-08-20T10:00:00Z' },
  ]);
  assert.deepEqual(fora, ['seed']);
});

t('três cópias do mesmo varId → sobra uma só', () => {
  const fora = gemeasAExcluir([
    { id: 'a', varId: 'p', atualizadoEm: '2026-08-01T00:00:00Z' },
    { id: 'b', varId: 'p', atualizadoEm: '2026-08-10T00:00:00Z' },
    { id: 'c', varId: 'p', atualizadoEm: '2026-08-05T00:00:00Z' },
  ]);
  assert.deepEqual(fora.sort(), ['a', 'c']);
});

t('cura vários varIds de uma vez, sem tocar nos únicos', () => {
  const fora = gemeasAExcluir([
    { id: '1', varId: 'ph', atualizadoEm: '2026-08-02T00:00:00Z' },
    { id: '2', varId: 'ph', atualizadoEm: '2026-08-01T00:00:00Z' },
    { id: '3', varId: 'ca', atualizadoEm: '2026-08-02T00:00:00Z' },
    { id: '4', varId: 'ca', atualizadoEm: '2026-08-03T00:00:00Z' },
    { id: '5', varId: 'mg', atualizadoEm: '2026-08-01T00:00:00Z' },
  ]);
  assert.deepEqual(fora.sort(), ['2', '3']);
});

// ── Cura do seed antigo (24/09/2026) ────────────────────────────────────────
// Um app de campo anterior à v2.78.0 recriou o catálogo do zero na nuvem: Fe
// desligado com ordem 119 e só 'ferro' nos sinônimos, micros sem casas decimais
// e a ordem de fábrica antiga (ph = 0, p = 1…). As migrações com flag por
// navegador não curam isso; a cura sem flag precisa reconhecer a assinatura.

// Seed antigo como veio no banco: básico na ordem antiga + complementares ≥ 100.
const BASICO_ANTIGO = ['ph', 'p', 'k', 'ca', 'mg', 'al', 'ctc', 'v', 'm', 'mo', 's', 'b', 'zn', 'cu', 'mn', 'textura'];
const seedAntigo = () => [
  ...BASICO_ANTIGO.map((varId, i) => ({ id: 'l-' + varId, varId, sigla: varId.toUpperCase(), usar: true, ordem: i, sinonimos: [varId] })),
  { id: 'l-satk', varId: 'satk', sigla: 'K%', usar: true, ordem: 2.5, sinonimos: [], casasDecimais: 1 },
  { id: 'l-fe', varId: 'fe', sigla: 'Fe', usar: false, ordem: 119, sinonimos: ['ferro'] },
  { id: 'l-areia', varId: 'areia_fina', sigla: 'AF', usar: false, ordem: 120, sinonimos: [] },
  { id: 'l-silte', varId: 'silte', sigla: 'Silte', usar: false, ordem: 118, sinonimos: [] },
  { id: 'l-hal', varId: 'hal', sigla: 'H+Al', usar: true, ordem: 118, sinonimos: [] },
];
const porVar = (curas) => Object.fromEntries(curas.map(c => [c.varId, c]));

t('assinatura do seed antigo é reconhecida', () => {
  assert.equal(temAssinaturaSeedAntigo(seedAntigo()), true);
});

t('seed antigo: Fe ligado e sinônimos ∪ [fe, ferro]', () => {
  const fe = porVar(curaSeedAntigo(seedAntigo())).fe;
  assert.equal(fe.usar, true);
  assert.deepEqual(fe.sinonimos, ['ferro', 'fe'], 'união, sem perder o que havia');
  assert.equal(fe.ordem, ORDEM_PADRAO_FERT.indexOf('fe'));
});

t('seed antigo: 2 casas nos micros SÓ onde não havia valor', () => {
  const c = porVar(curaSeedAntigo(seedAntigo()));
  for (const m of ['b', 's', 'zn', 'cu', 'mn', 'fe']) assert.equal(c[m].casasDecimais, 2, m);
  assert.equal(c.satk?.casasDecimais, undefined, 'satk já tinha 1 casa e não é micro');
  assert.equal(c.ph?.casasDecimais, undefined, 'macro não ganha casas');
});

t('seed antigo: ordem padrão nas 21 e as complementares depois, na ordem relativa (desempate por sigla)', () => {
  const itens = seedAntigo();
  const curas = porVar(curaSeedAntigo(itens));
  const ordemFinal = Object.fromEntries(itens.map(i => [i.varId, curas[i.varId]?.ordem ?? i.ordem]));
  for (const [i, v] of ORDEM_PADRAO_FERT.entries()) {
    if (v in ordemFinal) assert.equal(ordemFinal[v], i, v);
  }
  // hal e silte empatam em 118: H+Al < Silte pela sigla; areia_fina (120) por último.
  assert.equal(ordemFinal.hal, 21);
  assert.equal(ordemFinal.silte, 22);
  assert.equal(ordemFinal.areia_fina, 23);
});

t('seed antigo: complementar desligada continua desligada', () => {
  const c = porVar(curaSeedAntigo(seedAntigo()));
  assert.equal(c.areia_fina.usar, undefined, 'só a ordem muda');
  assert.equal(c.silte.usar, undefined);
});

t('a cura é idempotente: aplicada uma vez, a segunda passada não acha nada', () => {
  const itens = seedAntigo();
  const curas = new Map(curaSeedAntigo(itens).map(c => [c.id, c]));
  const curados = itens.map(i => {
    const { id, varId, ...campos } = curas.get(i.id) ?? { id: i.id, varId: i.varId };
    return { ...i, ...campos };
  });
  assert.equal(temAssinaturaSeedAntigo(curados), false);
  assert.deepEqual(curaSeedAntigo(curados), []);
});

// Catálogo saudável: ordem padrão, Fe ligado com 'fe', micros com casas.
const saudavel = () => ORDEM_PADRAO_FERT.map((varId, i) => ({
  id: 's-' + varId, varId, sigla: varId, usar: true, ordem: i,
  sinonimos: varId === 'fe' ? ['fe', 'ferro'] : [varId],
  casasDecimais: ['b', 's', 'zn', 'cu', 'mn', 'fe'].includes(varId) ? 2 : undefined,
}));

t('catálogo saudável → nenhuma correção', () => {
  assert.equal(temAssinaturaSeedAntigo(saudavel()), false);
  assert.deepEqual(curaSeedAntigo(saudavel()), []);
});

t('catálogo saudável com escolhas do usuário → nenhuma correção', () => {
  const itens = saudavel();
  // Usuário DESLIGOU o Fe (com o sinônimo 'fe' presente), trocou a casa do Zn,
  // tirou as casas do B e reordenou pH para o fim.
  const fe = itens.find(i => i.varId === 'fe'); fe.usar = false;
  itens.find(i => i.varId === 'zn').casasDecimais = 3;
  itens.find(i => i.varId === 'b').casasDecimais = undefined;
  itens.find(i => i.varId === 'ph').ordem = 40;
  assert.deepEqual(curaSeedAntigo(itens), []);
});

t('Fe ligado mas sem "fe" nos sinônimos → só completa os sinônimos', () => {
  const itens = saudavel();
  const fe = itens.find(i => i.varId === 'fe'); fe.sinonimos = ['ferro'];
  itens.find(i => i.varId === 'b').casasDecimais = undefined;   // não é assinatura: fica
  assert.equal(temAssinaturaSeedAntigo(itens), false);
  assert.deepEqual(curaSeedAntigo(itens), [{ id: 's-fe', varId: 'fe', sinonimos: ['ferro', 'fe'] }]);
});

t('Fe ligado mas com ordem ≥ 100 e o básico na ordem antiga → é assinatura', () => {
  const itens = seedAntigo();
  const fe = itens.find(i => i.varId === 'fe'); fe.usar = true;
  assert.equal(temAssinaturaSeedAntigo(itens), true);
  const c = porVar(curaSeedAntigo(itens)).fe;
  assert.equal(c.usar, undefined, 'já estava ligado');
  assert.equal(c.ordem, ORDEM_PADRAO_FERT.indexOf('fe'));
});

t('casasDecimais já definidas NÃO são sobrescritas, mesmo com a assinatura', () => {
  const itens = seedAntigo();
  itens.find(i => i.varId === 'zn').casasDecimais = 3;
  itens.find(i => i.varId === 'cu').casasDecimais = 0;
  const c = porVar(curaSeedAntigo(itens));
  assert.equal(c.zn.casasDecimais, undefined);
  assert.equal(c.cu.casasDecimais, undefined, 'zero é valor, não ausência');
  assert.equal(c.mn.casasDecimais, 2);
});

t('gêmeas do Fe: cada linha recebe a sua correção', () => {
  const itens = [...seedAntigo(), { id: 'l-fe2', varId: 'fe', sigla: 'Fe', usar: false, ordem: 119, sinonimos: ['ferro'] }];
  const fes = curaSeedAntigo(itens).filter(c => c.varId === 'fe');
  assert.deepEqual(fes.map(c => c.id).sort(), ['l-fe', 'l-fe2']);
  for (const c of fes) assert.equal(c.usar, true);
});

t('sinônimo " FE " não conta como "fe" (o laudo compara o texto exato)', () => {
  const itens = saudavel();
  itens.find(i => i.varId === 'fe').sinonimos = [' FE ', 'ferro'];
  assert.deepEqual(curaSeedAntigo(itens), [{ id: 's-fe', varId: 'fe', sinonimos: [' FE ', 'ferro', 'fe'] }]);
  // …e Fe desligado só com " FE " ainda é a assinatura A.
  const antigo = seedAntigo();
  antigo.find(i => i.varId === 'fe').sinonimos = [' FE '];
  assert.equal(temAssinaturaSeedAntigo(antigo), true);
});

t('conta nova nasce na ordem padrão (sem depender de migração com flag)', () => {
  for (const [i, v] of ORDEM_PADRAO_FERT.entries()) assert.equal(ordemDeFabrica(v, 99), i, v);
  assert.equal(ordemDeFabrica('ph_cacl2', 0), ORDEM_PADRAO_FERT.length);
  assert.equal(ordemDeFabrica('ph_cacl2', 3), ORDEM_PADRAO_FERT.length + 3);
  // Um catálogo recém-semeado assim não tem a assinatura do seed antigo.
  const novo = ORDEM_PADRAO_FERT.map(v => ({ id: v, varId: v, usar: true, ordem: ordemDeFabrica(v, 0), sinonimos: v === 'fe' ? ['fe', 'ferro'] : [v] }));
  assert.equal(temAssinaturaSeedAntigo(novo), false);
});

t('conta nova nasce com 2 casas nos micros (e só neles)', () => {
  for (const m of ['b', 's', 'zn', 'cu', 'mn', 'fe']) assert.equal(casasDeFabrica(m), 2, m);
  for (const v of ['ph', 'p', 'k', 'ca', 'mo', 'textura', 'satk']) assert.equal(casasDeFabrica(v), undefined, v);
  // Semeado assim, o catálogo não pede cura nenhuma.
  const novo = ORDEM_PADRAO_FERT.map(v => ({ id: v, varId: v, usar: true, ordem: ordemDeFabrica(v, 0), sinonimos: v === 'fe' ? ['fe', 'ferro'] : [v], casasDecimais: casasDeFabrica(v) }));
  assert.deepEqual(curaSeedAntigo(novo), []);
});

t('catálogo vazio ou sem Fe → nada', () => {
  assert.deepEqual(curaSeedAntigo([]), []);
  assert.deepEqual(curaSeedAntigo(seedAntigo().filter(i => i.varId !== 'fe')), []);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
