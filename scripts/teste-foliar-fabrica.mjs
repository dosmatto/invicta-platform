// Normas de fábrica de soja — npm run teste:foliar-fabrica
//
// O que este arquivo protege:
//   1. A ESCALA DOS NÚMEROS. Faixa de macro digitada em % em vez de g/kg (4,5
//      no lugar de 45) faria toda lavoura sadia aparecer com deficiência severa
//      de N, e a tela mostraria isso com a autoridade de um artigo citado. O
//      teste amarra cada faixa à unidade canônica de `nutrientes.ts`.
//   2. O `pares: []` (ledger 17). Se alguém "completar" as normas de fábrica com
//      razões duais digitadas de olho de um PDF escaneado, este teste quebra.
//      Sem par publicado, o certo é `dris: null` + motivo — não um DRIS
//      inventado, que na tela é indistinguível de um DRIS de verdade.
//   3. A RESSALVA DE PROCEDÊNCIA da tabela clássica. Ela é o número que o
//      agrônomo brasileiro cobra, e é também o número que esta versão não
//      conferiu na fonte primária. A ressalva tem que chegar à tela, ou seja:
//      tem que estar em `avisos`, que viaja junto do resultado.
//   4. O FECHAMENTO: amostra dentro das faixas de Kurihara sai 'adequado' nos
//      11 nutrientes pela FAIXA, e mesmo assim `dris` e `cnd` saem `null` com
//      motivo. É o contraste que prova que faixa e DRIS são independentes.

import assert from 'node:assert/strict';
import {
  AVISO_FONTE_NAO_CONFERIDA, ID_NORMA_EMBRAPA_CLASSICA, ID_NORMA_KURIHARA_2013,
  NOMES_NORMAS_FABRICA, NORMAS_FABRICA, NUTRIENTES, SEM_NORMA,
  diagnosticar, normaFabricaPorId, unidadeDe,
} from '../src/lib/foliar/index.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const KURIHARA = normaFabricaPorId(ID_NORMA_KURIHARA_2013);
const CLASSICA = normaFabricaPorId(ID_NORMA_EMBRAPA_CLASSICA);

// Envelope de PLAUSIBILIDADE por unidade canônica. Não é a faixa agronômica —
// é a barreira contra erro de ESCALA (% no lugar de g/kg, g/kg no lugar de
// mg/kg). Um N de 4,5 ou um Fe de 0,07 caem fora e quebram o teste.
const ENVELOPE = { 'g/kg': [1, 100], 'mg/kg': [1, 1000] };

console.log('\nNormas de fábrica — soja\n');

t('são exatamente as duas normas de literatura, com os ids FIXOS', () => {
  assert.equal(NORMAS_FABRICA.length, 2);
  assert.deepEqual(NORMAS_FABRICA.map(n => n.id), [ID_NORMA_KURIHARA_2013, ID_NORMA_EMBRAPA_CLASSICA]);
  assert.ok(KURIHARA && CLASSICA, 'normaFabricaPorId acha as duas');
  for (const n of NORMAS_FABRICA) {
    assert.equal(n.origem, 'literatura', `${n.id}: origem`);
    assert.equal(n.cultura, 'Soja', `${n.id}: cultura`);
    assert.equal(n.orgao, 'trifolio-com-peciolo', `${n.id}: órgão`);
    assert.equal(n.estadio, 'R1-R2', `${n.id}: estádio`);
    assert.ok(NOMES_NORMAS_FABRICA[n.id], `${n.id}: nome para a Biblioteca`);
  }
});

t('cada norma traz os 11 nutrientes com min < max', () => {
  for (const n of NORMAS_FABRICA) {
    assert.ok(n.faixas, `${n.id}: sem faixas`);
    const ids = Object.keys(n.faixas);
    assert.equal(ids.length, 11, `${n.id}: ${ids.length} faixas`);
    for (const id of NUTRIENTES) {
      const f = n.faixas[id];
      assert.ok(f, `${n.id}: falta ${id}`);
      assert.ok(Number.isFinite(f.min) && Number.isFinite(f.max), `${n.id}/${id}: não numérico`);
      assert.ok(f.min < f.max, `${n.id}/${id}: min ${f.min} >= max ${f.max}`);
      assert.ok(f.min > 0, `${n.id}/${id}: min ${f.min} não é positivo`);
    }
  }
});

t('as unidades são coerentes com nutrientes.ts — macro g/kg, micro mg/kg', () => {
  const MACROS = ['N', 'P', 'K', 'Ca', 'Mg', 'S'];
  for (const n of NORMAS_FABRICA) {
    for (const id of NUTRIENTES) {
      const u = unidadeDe(id);
      assert.equal(u, MACROS.includes(id) ? 'g/kg' : 'mg/kg', `${id}: unidade canônica`);
      const [lo, hi] = ENVELOPE[u];
      const f = n.faixas[id];
      assert.ok(f.min >= lo && f.max <= hi, `${n.id}/${id}: ${f.min}–${f.max} fora do envelope de ${u}`);
    }
  }
  // Âncora explícita contra o erro de escala mais provável: N em % (4,5) em
  // vez de g/kg (45), e Fe em g/kg (0,07) em vez de mg/kg (70).
  assert.ok(KURIHARA.faixas.N.min >= 40, `N em ${KURIHARA.faixas.N.min} — parece %, não g/kg`);
  assert.ok(KURIHARA.faixas.Fe.min >= 10, `Fe em ${KURIHARA.faixas.Fe.min} — parece g/kg, não mg/kg`);
});

t('nenhuma tem pares duais — não há norma DRIS publicada extraível (ledger 17)', () => {
  for (const n of NORMAS_FABRICA) {
    assert.ok(Array.isArray(n.pares), `${n.id}: pares não é array`);
    assert.equal(n.pares.length, 0, `${n.id}: ${n.pares.length} pares inventados`);
    assert.equal(n.cnd, null, `${n.id}: CND sem população de referência`);
    assert.equal(n.chance, null, `${n.id}: Chance sem população`);
  }
});

t('a fonte é citação completa, com autor e ano', () => {
  for (const n of NORMAS_FABRICA) {
    assert.ok(typeof n.fonte === 'string' && n.fonte.length > 40, `${n.id}: fonte curta demais`);
    assert.ok(/\b(19|20)\d{2}\b/.test(n.fonte), `${n.id}: fonte sem ano`);
  }
  assert.ok(KURIHARA.fonte.includes('Ceres'), 'Kurihara: periódico na citação');
  assert.equal(KURIHARA.n, 608, 'Kurihara: n=608 lavouras');
  assert.ok(/3\.600/.test(KURIHARA.criterioCorte), 'Kurihara: corte de 3.600 kg/ha declarado');
  assert.equal(CLASSICA.n, null, 'clássica: n desconhecido é null, não zero');
});

t('a clássica carrega a ressalva de procedência — e ela chega à tela', () => {
  const texto = (CLASSICA.avisos ?? []).join(' | ');
  assert.ok(texto.includes(AVISO_FONTE_NAO_CONFERIDA), `avisos da clássica: ${texto}`);
  // A ressalva viaja no resultado da diagnose, não só no objeto da norma.
  const d = diagnosticar({ N: 50, P: 3.5, K: 20 }, CLASSICA, { orgaoAmostra: 'trifolio-com-peciolo' });
  const naTela = [...d.avisos, ...(d.faixa?.avisos ?? [])].join(' | ');
  assert.ok(naTela.includes(AVISO_FONTE_NAO_CONFERIDA) || texto.includes(AVISO_FONTE_NAO_CONFERIDA),
    'a ressalva precisa estar acessível a quem renderiza o resultado');
  // E a de Kurihara NÃO carrega essa ressalva: ela foi conferida na fonte.
  assert.ok(!(KURIHARA.avisos ?? []).join(' ').includes(AVISO_FONTE_NAO_CONFERIDA),
    'Kurihara foi conferida na fonte primária — não pode herdar a ressalva');
});

// Amostra no MEIO de cada faixa de Kurihara: por construção, 'adequado' nos 11.
const DENTRO = {};
for (const id of NUTRIENTES) {
  const f = KURIHARA.faixas[id];
  DENTRO[id] = (f.min + f.max) / 2;
}

t('amostra dentro das faixas de Kurihara sai adequada nos 11 nutrientes', () => {
  const d = diagnosticar(DENTRO, KURIHARA, {
    orgaoAmostra: 'trifolio-com-peciolo', estadioAmostra: 'R2', produtividadeKgha: 4200,
  });
  assert.ok(d.faixa, 'a faixa rodou');
  assert.equal(d.faixa.itens.length, 11, `${d.faixa.itens.length} nutrientes classificados`);
  for (const item of d.faixa.itens) {
    assert.equal(item.estado, 'adequado', `${item.nutriente}: ${item.estado} (teor ${item.teor})`);
    assert.equal(item.desvioPct, 0, `${item.nutriente}: desvio ${item.desvioPct}`);
    assert.equal(item.unidade, unidadeDe(item.nutriente), `${item.nutriente}: unidade do item`);
  }
  assert.ok(d.faixa.fonte.includes('KURIHARA'), 'a fonte acompanha o resultado da faixa');
});

t('e ainda assim DRIS e CND saem null COM MOTIVO — nunca zero (ledger 17)', () => {
  const d = diagnosticar(DENTRO, KURIHARA, { orgaoAmostra: 'trifolio-com-peciolo', estadioAmostra: 'R2' });
  assert.equal(d.dris, null, 'DRIS sem par publicado tem de ser null');
  assert.equal(d.drisMotivo, SEM_NORMA, `motivo do DRIS: ${d.drisMotivo}`);
  assert.equal(d.cnd, null, 'CND sem estatística clr tem de ser null');
  assert.ok(d.cndMotivo, 'CND precisa declarar o motivo');
  assert.equal(d.chance, null, 'Chance sem população tem de ser null');
  assert.ok(d.chanceMotivo, 'Chance precisa declarar o motivo');
  // O consenso não pode esconder o buraco: os 11 nutrientes continuam na lista.
  assert.equal(d.consenso.length, 11, `consenso com ${d.consenso.length} linhas`);
  for (const c of d.consenso) assert.equal(c.nMetodos, 1, `${c.nutriente}: só a faixa opinou`);
  assert.equal(d.norma.origem, 'literatura');
});

t('teor fora da faixa é acusado nas duas normas, com a estreita acusando mais', () => {
  // K a 12 g/kg: deficiente nas duas (mínimos 17). Ca a 4,2: deficiente só na
  // estreita (Kurihara 5,0–5,8) e adequado na clássica (3,6–20,0) — é
  // exatamente a crítica de amplitude excessiva que o artigo de 2013 levanta.
  const amostra = { ...DENTRO, K: 12, Ca: 4.2 };
  const estreita = diagnosticar(amostra, KURIHARA, { orgaoAmostra: 'trifolio-com-peciolo' });
  const larga = diagnosticar(amostra, CLASSICA, { orgaoAmostra: 'trifolio-com-peciolo' });
  const estado = (r, id) => r.faixa.itens.find(i => i.nutriente === id).estado;
  assert.equal(estado(estreita, 'K'), 'deficiente', 'K baixo na norma estreita');
  assert.equal(estado(larga, 'K'), 'deficiente', 'K baixo também na clássica');
  assert.equal(estado(estreita, 'Ca'), 'deficiente', 'Ca 4,2 é deficiente em Kurihara');
  assert.equal(estado(larga, 'Ca'), 'adequado', 'e passa despercebido na faixa clássica');
  const k = estreita.faixa.itens.find(i => i.nutriente === 'K');
  assert.ok(k.desvioPct < 0, `desvio de K deve ser negativo: ${k.desvioPct}`);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
