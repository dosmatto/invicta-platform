// Testes da escolha dos MAPAS DE COLHEITA que entram nas Zonas de Manejo
// (pendência 42): um por contexto (cultura + ano + época), o oficial manda,
// o ano selecionado vem primeiro. Roda: `npm run teste:prod-zonas`.
import assert from 'node:assert/strict';
import { selecionarMapasParaZonas, rotuloMapaColheita, nutMapaColheita, anoDoMapa } from '../src/lib/meap/produtividadeZonas.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const M = (id, o) => ({ id, safra: '2025', epoca: '', cultura: 'soja', versao: 1, oficial: false, criadoEm: '2026-01-01T00:00:00Z', ...o });
const ids = (l) => l.map(m => m.id);

t('uma camada por contexto: o OFICIAL ganha da versão mais nova', () => {
  const sel = selecionarMapasParaZonas([M('v1', { versao: 1, oficial: true }), M('v2', { versao: 2 }), M('v3', { versao: 3 })]);
  assert.deepEqual(ids(sel), ['v1']);
});

t('sem oficial, entra a MAIOR versão', () => {
  const sel = selecionarMapasParaZonas([M('v2', { versao: 2 }), M('v1', { versao: 1 }), M('v3', { versao: 3 })]);
  assert.deepEqual(ids(sel), ['v3']);
});

t('cultura, época e safra diferentes são contextos diferentes', () => {
  const sel = selecionarMapasParaZonas([
    M('soja25'), M('milho25', { cultura: 'milho', epoca: 'safrinha' }), M('soja24', { safra: '2024', ano: 2024 }),
  ]);
  assert.equal(sel.length, 3);
});

t('o ANO selecionado vem primeiro; depois do mais recente ao mais antigo', () => {
  const sel = selecionarMapasParaZonas([
    M('s26', { safra: '2026', ano: 2026 }), M('s24', { safra: '2024', ano: 2024 }), M('s25', { safra: '2025', ano: 2025 }),
  ], 2024);
  assert.deepEqual(ids(sel), ['s24', 's26', 's25']);
});

t('sem ano selecionado: só do mais recente ao mais antigo', () => {
  const sel = selecionarMapasParaZonas([M('s24', { safra: '2024', ano: 2024 }), M('s26', { safra: '2026', ano: 2026 }), M('s25', { safra: '2025', ano: 2025 })]);
  assert.deepEqual(ids(sel), ['s26', 's25', 's24']);
});

t('cultura com maiúscula/minúscula é o mesmo contexto', () => {
  const sel = selecionarMapasParaZonas([M('a', { cultura: 'Soja', versao: 1 }), M('b', { cultura: 'soja', versao: 2 })]);
  assert.deepEqual(ids(sel), ['b']);
});

t('lista vazia devolve lista vazia', () => {
  assert.deepEqual(selecionarMapasParaZonas([]), []);
});

t('ano: campo `ano` manda; senão sai do nome da safra ("24/25" → 2024)', () => {
  assert.equal(anoDoMapa({ ano: 2023, safra: '2025' }), 2023);
  assert.equal(anoDoMapa({ safra: '24/25' }), 2024);
  assert.equal(anoDoMapa({ safra: 'Safra 2025' }), 2025);
  assert.equal(anoDoMapa({ safra: '' }), null);
});

t('rótulo: cultura + ano (+ época), sem lixo quando falta algo', () => {
  assert.equal(rotuloMapaColheita(M('x', { cultura: 'soja', ano: 2025 })), 'Soja 2025');
  assert.equal(rotuloMapaColheita(M('x', { cultura: 'milho', ano: 2025, epoca: 'safrinha' })), 'Milho 2025 safrinha');
  assert.equal(rotuloMapaColheita(M('x', { cultura: 'trigo', ano: 2024, epoca: 'verao' })), 'Trigo 2024 verão');
  assert.equal(rotuloMapaColheita(M('x', { cultura: '', safra: '', ano: undefined })), 'Colheita');
});

t('nut: prod_<cultura> sem acento nem espaço (é o que casa com a legenda)', () => {
  assert.equal(nutMapaColheita({ cultura: 'Soja' }), 'prod_soja');
  assert.equal(nutMapaColheita({ cultura: 'Trigo/Cevada' }), 'prod_trigo_cevada');
  assert.equal(nutMapaColheita({ cultura: 'Feijão carioca' }), 'prod_feijao_carioca');
  assert.equal(nutMapaColheita({ cultura: '' }), 'prod_colheita');
});

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
