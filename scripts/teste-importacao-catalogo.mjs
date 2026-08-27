// Testes dos CATÁLOGOS da importação (lib/importacao: catalogo, culturas).
//
// O que pode dar errado e a tela NÃO denuncia:
//  - o sistema ADIVINHAR o nome de um cultivar. "55I57RSF IPRO" é o Brasmax
//    Zeus IPRO, e não há como deduzir isso do código — um palpite entra bonito
//    e errado, e ninguém confere um nome de material depois;
//  - a sigla confirmada não ficar gravada, fazendo o usuário repetir os mesmos
//    47 cultivares na planilha do ano que vem;
//  - "SOJA TRANSGENICA" não casar com "Soja" e travar 391 linhas de uma vez.
// Roda: `npm run teste:importacao-catalogo`
import assert from 'node:assert/strict';
import { casarCatalogo, nomeComercial, marcaProvavel, aprenderSinonimo } from '../src/lib/importacao/catalogo.ts';
import { casarCultura, SINONIMOS_CULTURA } from '../src/lib/importacao/culturas.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// A lista fixa da plataforma (store.ts:109). O usuário decidiu mantê-la.
const CULTURAS = ['Soja', 'Milho', 'Trigo', 'Feijão', 'Algodão', 'Aveia', 'Sorgo', 'Cevada', 'Pastagem', 'Outra'];

console.log('\n── cultura da planilha → cultura da plataforma ──');

t('as 4 culturas da planilha casam sozinhas', () => {
  const esperado = { 'SOJA TRANSGENICA': 'Soja', 'MILHO TRANSGENICO': 'Milho', 'FEIJAO': 'Feijão', 'BRACHIARIA': 'Pastagem' };
  for (const [planilha, alvo] of Object.entries(esperado)) {
    const r = casarCultura(planilha, CULTURAS);
    assert.equal(r.cultura, alvo, `${planilha} → esperado ${alvo}, veio ${r.cultura || '(nada)'}`);
    assert.ok(r.automatico, `${planilha} tinha de ser automático`);
  }
});

t('o texto original NUNCA é jogado fora', () => {
  // A decisão foi descartar o "TRANSGENICA" do CAMPO, não do registro: se um dia
  // existir subcultura, a informação tem de estar lá para migrar.
  const r = casarCultura('SOJA TRANSGENICA', CULTURAS);
  assert.equal(r.origem, 'SOJA TRANSGENICA');
});

t('cultura desconhecida vira sugestão, não chute', () => {
  const r = casarCultura('MILHO 2A SAFRA', CULTURAS);
  assert.ok(!r.automatico);
  assert.ok(r.opcoes.includes('Milho'), `sugeriu ${r.opcoes.join(', ')}`);
});

t('cultura irreconhecível não casa com nada', () => {
  const r = casarCultura('CANA DE ACUCAR', CULTURAS);
  assert.equal(r.cultura, '');
  assert.ok(!r.automatico);
});

t('vazio não quebra', () => {
  assert.equal(casarCultura('', CULTURAS).cultura, '');
  assert.equal(casarCultura(null, CULTURAS).cultura, '');
});

t('todo sinônimo aponta para uma cultura que existe na lista fixa', () => {
  for (const c of Object.keys(SINONIMOS_CULTURA)) {
    assert.ok(CULTURAS.includes(c), `"${c}" não está em CULTURAS — sinônimo órfão`);
  }
});

console.log('\n── catálogo: propósito ──');

const PROPOSITOS = [
  { nome: 'Produção de Grãos', sinonimos: ['PRODUCAO DE GRAOS', 'GRAOS'], equivaleAGrao: true },
  { nome: 'Campo de Semente', sinonimos: ['CAMPO DE SEMENTE-UBS', 'UBS'], equivaleAGrao: true },
  { nome: 'Silagem de Planta Inteira', sinonimos: ['SIL.PLANTA INTEIRA', 'SILAGEM'], equivaleAGrao: false },
  { nome: 'Cobertura', sinonimos: ['COBERTURA'], equivaleAGrao: false },
];

t('os 4 propósitos da planilha casam sozinhos, do jeito que o cliente escreve', () => {
  const daPlanilha = ['Produção de Grãos', 'Campo de Semente-UBS', 'Sil.Planta Inteira', 'Cobertura'];
  for (const v of daPlanilha) {
    const r = casarCatalogo(v, PROPOSITOS);
    assert.ok(r.automatico, `"${v}" não casou (${r.motivo})`);
  }
});

t('Campo de Semente conta como grão, mas continua sendo Campo de Semente', () => {
  const r = casarCatalogo('Campo de Semente-UBS', PROPOSITOS);
  assert.equal(r.alvo.nome, 'Campo de Semente');
  assert.equal(r.alvo.equivaleAGrao, true, 'é o pedido do item 5: UBS conta como grão');
  assert.notEqual(r.alvo.nome, 'Produção de Grãos', 'mas não pode virar Produção de Grãos');
});

t('propósito novo não é forçado em cima de um existente', () => {
  const r = casarCatalogo('Pastejo Direto', PROPOSITOS);
  assert.equal(r.acao, 'criar');
});

console.log('\n── catálogo: cultivar (o dicionário que aprende) ──');

t('cultivar NUNCA é adivinhado — catálogo vazio devolve "criar"', () => {
  // Este é o teste mais importante do arquivo. "55I57RSF IPRO" é o Brasmax Zeus
  // IPRO, e nenhuma heurística pode chegar nisso a partir do código.
  const r = casarCatalogo('55I57RSF IPRO', []);
  assert.equal(r.alvo, null);
  assert.equal(r.acao, 'criar');
});

t('a sigla confirmada UMA vez casa sozinha depois — é o multiplicador', () => {
  const catalogo = [{ nome: 'Brasmax Zeus IPRO', siglas: [], sinonimos: ['55I57RSF IPRO'] }];
  const r = casarCatalogo('55I57RSF IPRO', catalogo);
  assert.equal(r.alvo.nome, 'Brasmax Zeus IPRO');
  assert.equal(r.motivo, 'sinonimo');
  assert.ok(r.automatico);
});

t('material sem apelido casa pelo próprio nome', () => {
  // "5995I2X" é o nome comercial, não um código a traduzir.
  const r = casarCatalogo('5995I2X', [{ nome: '5995I2X' }]);
  assert.equal(r.motivo, 'exato');
  assert.ok(r.automatico);
});

t('nome comercial entre parênteses resolve de graça', () => {
  assert.equal(nomeComercial('DP155100886 (P25300PWU)'), 'P25300PWU');
  assert.equal(nomeComercial('7602PRO4 (AS 1901 PRO4)'), 'AS 1901 PRO4');
  assert.equal(nomeComercial('SS261SVIP3 (NK 301 VIP3)'), 'NK 301 VIP3');
  // "(Mauri)" sozinho é apelido de talhão, não código de cultivar.
  assert.equal(nomeComercial('(Mauri)'), '');
  assert.equal(nomeComercial('AG9021PRO3'), '');

  const r = casarCatalogo('7602PRO4 (AS 1901 PRO4)', [{ nome: 'AS 1901 PRO4' }]);
  assert.ok(r.automatico, 'o cadastro já tem o nome que está no parêntese');
});

t('marca é sugerida só quando o prefixo não deixa dúvida', () => {
  assert.equal(marcaProvavel('AG9021PRO3'), 'Agroceres');
  assert.equal(marcaProvavel('DKB230PRO3'), 'Dekalb');
  assert.equal(marcaProvavel('AS1955PRO4'), 'Agroeste');
  assert.equal(marcaProvavel('IPR Sabiá'), 'IAPAR');
  assert.equal(marcaProvavel('IAC 2051'), 'IAC');
  assert.equal(marcaProvavel('NS5922IPRO'), 'Nidera');
  // Códigos numéricos são de vários obtentores: chutar aqui só geraria cadastro
  // errado, então não se chuta.
  for (const s of ['5995I2X', '581 E', '55I57RSF IPRO', 'B2801PWU', 'SSS612361I2X', 'C2575E']) {
    assert.equal(marcaProvavel(s), '', `${s} não pode ter marca deduzida`);
  }
});

t('aprender sinônimo não duplica nem apaga o que já havia', () => {
  let sin = aprenderSinonimo(undefined, '55I57RSF IPRO');
  assert.deepEqual(sin, ['55I57RSF IPRO']);
  sin = aprenderSinonimo(sin, '55i57rsf ipro');
  assert.equal(sin.length, 1, 'mesma sigla em outra caixa não entra de novo');
  sin = aprenderSinonimo(sin, '55I57RSF');
  assert.equal(sin.length, 2);
  assert.deepEqual(aprenderSinonimo(sin, ''), sin, 'vazio não entra');
});

t('duas siglas iguais em cultivares diferentes pedem confirmação', () => {
  const cat = [{ nome: 'A', sinonimos: ['X1'] }, { nome: 'B', sinonimos: ['X1'] }];
  const r = casarCatalogo('X1', cat);
  assert.equal(r.motivo, 'ambiguo');
  assert.ok(!r.automatico);
});

t('cultivar inativo não é oferecido', () => {
  const r = casarCatalogo('VELHO', [{ nome: 'VELHO', ativo: false }]);
  assert.equal(r.acao, 'criar');
});

t('catálogo nulo ou vazio não lança', () => {
  assert.doesNotThrow(() => casarCatalogo('X', null));
  assert.doesNotThrow(() => casarCatalogo(null, [{ nome: 'X' }]));
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
