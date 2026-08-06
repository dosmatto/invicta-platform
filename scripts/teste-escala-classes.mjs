// Escala de classes do editor manual de zonas — roda: npm run teste:escala
//
// O que este arquivo protege: a ORDEM das classes que já estão no mapa. O rank
// é o que ordena a prescrição (rank 1 = maior potencial = mais/menos produto,
// conforme a relação escolhida). Se a inclusão das classes padrão embaralhar os
// ranks existentes, a dose troca de zona no campo.

import assert from 'node:assert/strict';
import { escalaClasses, remapeamentoDeRanks } from '../src/lib/meap/escalaClasses.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
const rot = (e) => e.map(c => `${c.label}${c.presente ? '' : '*'}`).join(' | ');

console.log('\nEscala de classes (presentes + padrão que faltam)\n');

t('CASO DO USUÁRIO: mapa só com as classes altas ganha Média, Média-baixa e Baixa', () => {
  const e = escalaClasses([
    { label: 'Muito alto', cor: '#16a34a', rank: 1 },
    { label: 'Alto', cor: '#22c55e', rank: 2 },
    { label: 'Médio-alto', cor: '#84cc16', rank: 3 },
  ]);
  assert.equal(rot(e), 'Muito alto | Alto | Médio-alto | Média* | Média-baixa* | Baixa*');
  assert.deepEqual(e.map(c => c.rank), [1, 2, 3, 4, 5, 6]);
  // as três que já estavam no mapa mantêm o rank — ninguém foi renumerado
  assert.deepEqual(remapeamentoDeRanks(e), new Map());
});

t('classe padrão que já existe no mapa NÃO vira chip duplicado', () => {
  const e = escalaClasses([
    { label: 'Alta', rank: 1 }, { label: 'Média', rank: 2 }, { label: 'Baixa', rank: 3 },
  ]);
  // cada classe que falta entra NO LUGAR dela, não no fim da fila
  assert.equal(rot(e), 'Alta | Média-alta* | Média | Média-baixa* | Baixa');
  // a escala renumera: Média sai de 2 para 3, Baixa de 3 para 5 — ordem intacta
  assert.deepEqual([...remapeamentoDeRanks(e).entries()], [[2, 3], [3, 5]]);
});

t('classe nova de potencial ALTO entra no topo e empurra as demais', () => {
  const e = escalaClasses([{ label: 'Média', rank: 1 }, { label: 'Baixa', rank: 2 }]);
  assert.equal(e[0].label, 'Alta', rot(e));
  assert.equal(e[0].presente, false);
  const de = remapeamentoDeRanks(e);
  // Média e Baixa desceram, mas continuam NA MESMA ORDEM relativa
  const media = e.find(c => c.label === 'Média'), baixa = e.find(c => c.label === 'Baixa');
  assert.ok(media.rank < baixa.rank, rot(e));
  assert.equal(de.get(1), media.rank);
  assert.equal(de.get(2), baixa.rank);
});

t('a ORDEM das classes presentes nunca muda (varredura)', () => {
  const casos = [
    [{ label: 'Alta', rank: 1 }],
    [{ label: 'Baixa', rank: 1 }],
    [{ label: 'Muito alto', rank: 1 }, { label: 'Baixo', rank: 2 }],
    [{ label: 'Média-baixa', rank: 1 }, { label: 'Média', rank: 2 }],   // fora de ordem no mapa
    [{ label: 'Zona A', rank: 1 }, { label: 'Zona B', rank: 2 }, { label: 'Zona C', rank: 3 }],
  ];
  for (const presentes of casos) {
    const e = escalaClasses(presentes);
    const naEscala = e.filter(c => c.presente).map(c => c.rankAtual);
    const esperado = [...presentes].sort((a, b) => a.rank - b.rank).map(c => c.rank);
    assert.deepEqual(naEscala, esperado, `ordem mudou em ${JSON.stringify(presentes)}`);
    // ranks contíguos 1..N, sem buraco e sem repetição
    assert.deepEqual(e.map(c => c.rank), e.map((_, i) => i + 1));
  }
});

t('rótulos fora do vocabulário continuam no mapa e ainda recebem as 5 padrão', () => {
  const e = escalaClasses([{ label: 'Argila A', rank: 1 }, { label: 'Argila B', rank: 2 }]);
  assert.equal(e.filter(c => c.presente).length, 2);
  assert.equal(e.filter(c => !c.presente).length, 5, rot(e));
  assert.equal(e.length, 7);
});

t('toda classe da escala tem cor válida (o chip e o mapa leem daqui)', () => {
  const e = escalaClasses([{ label: 'Muito alto', rank: 1 }]);
  for (const c of e) assert.match(c.cor, /^#[0-9a-fA-F]{6}$/, `${c.label}: ${c.cor}`);
});

t('mapa vazio devolve as 5 classes padrão', () => {
  const e = escalaClasses([]);
  assert.equal(rot(e), 'Alta* | Média-alta* | Média* | Média-baixa* | Baixa*');
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
