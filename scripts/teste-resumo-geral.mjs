// Resumo geral das recomendações marcadas (src/lib/recomendacao/resumoGeral.ts).
// Roda: `npm run teste:resumo-geral`.
//
// A invariante que este arquivo protege: o resumo é base de COMPRA. Se a área
// for contada uma vez por dose, ou se um produto não recebido virar zero em vez
// de célula vazia, o relatório mente sobre quanto comprar e onde aplicar.
import assert from 'node:assert/strict';
import { montarResumoGeral, produtosDe, planejarTabela, nomeArquivoResumo, LARGURA_UTIL_MM, LARG_MIN_PRODUTO_MM } from '../src/lib/recomendacao/resumoGeral.ts';
import { comExtensao } from '../src/lib/abrirPdf.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ok  ', nome); }
  catch (e) { fail++; console.error('  FALHOU', nome, '-', e.message); }
}

// Lançamento com defaults — cada teste muda só o que interessa.
let seq = 0;
const L = (o) => ({
  fazenda: 'Figueira', talhaoId: o.talhao ?? `t${seq++}`, talhao: 'IGEFI 01', areaHa: 10,
  ano: 2026, safra: '26/27', numero: 1, rotulo: '01 - Calcario', produto: 'Calcario',
  toneladas: 1, custo: 100, ...o,
});

console.log('\nResumo geral das recomendacoes marcadas\n');

t('matriz: produto que o talhao NAO recebeu fica AUSENTE (celula vazia, nao zero)', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'a', talhao: 'A', produto: 'Calcario', toneladas: 30 }),
    L({ talhaoId: 'b', talhao: 'B', produto: 'Gesso', toneladas: 12 }),
  ]);
  const [linhaA, linhaB] = r.anos[0].linhas;
  assert.equal(linhaA.porProduto.Calcario, 30);
  assert.equal('Gesso' in linhaA.porProduto, false, 'A nao recebeu Gesso: a chave nao pode existir');
  assert.equal(linhaB.porProduto.Gesso, 12);
  assert.equal('Calcario' in linhaB.porProduto, false);
});

t('AREA do talhao conta UMA vez, mesmo com varias recomendacoes no ano', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'a', areaHa: 15.61, produto: 'Calcario' }),
    L({ talhaoId: 'a', areaHa: 15.61, produto: 'Gesso', rotulo: '02 - Gesso' }),
    L({ talhaoId: 'a', areaHa: 15.61, produto: 'KCl', rotulo: '03 - KCl' }),
  ]);
  assert.equal(r.anos[0].areaHa, 15.61);
  assert.equal(r.anos[0].nTalhoes, 1);
  assert.equal(r.totalGeral.areaHa, 15.61);
});

t('AREA nao dobra quando o mesmo talhao aparece em DOIS anos', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'a', areaHa: 20, ano: 2026, safra: '26/27' }),
    L({ talhaoId: 'a', areaHa: 20, ano: 2025, safra: '25/26' }),
  ]);
  assert.equal(r.anos.length, 2);
  assert.equal(r.anos[0].areaHa, 20);   // cada ano conta a sua
  assert.equal(r.anos[1].areaHa, 20);
  assert.equal(r.totalGeral.areaHa, 20, 'no total geral o talhao vale UMA area');
  assert.equal(r.totalGeral.nTalhoes, 1);
});

t('anos vem do mais recente para o mais antigo, com as safras do ano', () => {
  const r = montarResumoGeral([
    L({ ano: 2024, safra: '24/25' }), L({ ano: 2026, safra: '26/27' }), L({ ano: 2025, safra: '25/26' }),
  ]);
  assert.deepEqual(r.anos.map(a => a.ano), [2026, 2025, 2024]);
});

t('um ANO com DUAS safras entra inteiro, e as duas ficam registradas', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'a', ano: 2026, safra: '26/27', toneladas: 4 }),
    L({ talhaoId: 'b', ano: 2026, safra: '2026-2', toneladas: 6 }),
  ]);
  assert.equal(r.anos.length, 1);
  assert.deepEqual(r.anos[0].safras, ['2026-2', '26/27']);
  assert.equal(r.anos[0].totalProduto.Calcario, 10);
  assert.equal(r.anos[0].nTalhoes, 2);
});

t('subtotal do ano e total geral fecham com a soma dos lancamentos', () => {
  const lancs = [
    L({ talhaoId: 'a', ano: 2026, produto: 'Calcario', toneladas: 30, custo: 3000 }),
    L({ talhaoId: 'b', ano: 2026, produto: 'Calcario', toneladas: 20, custo: 2000 }),
    L({ talhaoId: 'a', ano: 2025, produto: 'Calcario', toneladas: 10, custo: 1000 }),
  ];
  const r = montarResumoGeral(lancs);
  assert.equal(r.anos[0].totalProduto.Calcario, 50);
  assert.equal(r.anos[0].totalCusto, 5000);
  assert.equal(r.anos[1].totalProduto.Calcario, 10);
  assert.equal(r.totalGeral.porProduto.Calcario, 60);
  assert.equal(r.totalGeral.custo, 6000);
});

t('produtos saem ordenados pelo VOLUME (maior primeiro)', () => {
  const lancs = [
    L({ talhaoId: 'a', produto: 'Gesso', toneladas: 5 }),
    L({ talhaoId: 'b', produto: 'Calcario', toneladas: 80 }),
    L({ talhaoId: 'c', produto: 'KCl', toneladas: 12 }),
  ];
  assert.deepEqual(produtosDe(lancs), ['Calcario', 'KCl', 'Gesso']);
  assert.deepEqual(montarResumoGeral(lancs).produtos, ['Calcario', 'KCl', 'Gesso']);
});

t('FILTRO de produtos recalcula os totais e some com o talhao que ficou sem nada', () => {
  const lancs = [
    L({ talhaoId: 'a', talhao: 'A', produto: 'Calcario', toneladas: 30, custo: 3000 }),
    L({ talhaoId: 'b', talhao: 'B', produto: 'Gesso', toneladas: 12, custo: 1200 }),
  ];
  const r = montarResumoGeral(lancs, ['Calcario']);
  assert.deepEqual(r.produtos, ['Calcario']);
  assert.equal(r.anos[0].linhas.length, 1, 'o talhao B so tinha Gesso: sai da tabela');
  assert.equal(r.anos[0].linhas[0].talhao, 'A');
  assert.equal(r.totalGeral.porProduto.Gesso, undefined);
  assert.equal(r.totalGeral.custo, 3000);
  assert.equal(r.totalGeral.areaHa, 10, 'a area do talhao filtrado nao conta');
});

t('filtro vazio devolve resumo vazio, sem quebrar', () => {
  const r = montarResumoGeral([L({})], []);
  assert.deepEqual(r.produtos, []);
  assert.deepEqual(r.anos, []);
  assert.equal(r.totalGeral.nTalhoes, 0);
  assert.deepEqual(r.recomendacoes, []);
});

t('indice recomendacao -> talhoes nao repete talhao e vem em ordem alfanumerica', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'c', talhao: 'IGEFI 10', rotulo: '03 - Calcario', numero: 3, toneladas: 1 }),
    L({ talhaoId: 'a', talhao: 'IGEFI 02', rotulo: '03 - Calcario', numero: 3, toneladas: 2 }),
    L({ talhaoId: 'a', talhao: 'IGEFI 02', rotulo: '03 - Calcario', numero: 3, toneladas: 3 }),
  ]);
  assert.equal(r.recomendacoes.length, 1);
  const rec = r.recomendacoes[0];
  assert.deepEqual(rec.talhoes, ['IGEFI 02', 'IGEFI 10'], 'ordem numerica: 02 antes de 10, sem repetir');
  assert.equal(rec.toneladas, 6, 'a quantidade soma todas as ocorrencias');
});

t('a mesma recomendacao em anos diferentes sao DUAS entradas no indice', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'a', ano: 2026, rotulo: '03 - Calcario' }),
    L({ talhaoId: 'a', ano: 2025, rotulo: '03 - Calcario' }),
  ]);
  assert.equal(r.recomendacoes.length, 2);
  assert.deepEqual(r.recomendacoes.map(x => x.ano), [2026, 2025], 'ano mais recente primeiro');
});

t('indice ordena pelo No do cadastro dentro do ano', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'a', numero: 10, rotulo: '10 - KCl' }),
    L({ talhaoId: 'b', numero: 2, rotulo: '02 - Gesso' }),
    L({ talhaoId: 'c', numero: 1e9, rotulo: 'Sem numero' }),
  ]);
  assert.deepEqual(r.recomendacoes.map(x => x.rotulo), ['02 - Gesso', '10 - KCl', 'Sem numero']);
});

t('lista vazia devolve estrutura vazia coerente', () => {
  const r = montarResumoGeral([]);
  assert.deepEqual(r.produtos, []);
  assert.deepEqual(r.anos, []);
  assert.equal(r.totalGeral.areaHa, 0);
  assert.equal(r.totalGeral.custo, 0);
});

t('toneladas invalidas (NaN) nao contaminam o total', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'a', toneladas: 10 }),
    L({ talhaoId: 'b', toneladas: NaN }),
  ]);
  assert.equal(r.totalGeral.porProduto.Calcario, 10);
});

t('escopo produtor: linhas ordenam por FAZENDA e depois por talhao', () => {
  const r = montarResumoGeral([
    L({ talhaoId: 'x', fazenda: 'Serra Azul', talhao: 'SA 02' }),
    L({ talhaoId: 'y', fazenda: 'Figueira', talhao: 'IGEFI 10' }),
    L({ talhaoId: 'z', fazenda: 'Figueira', talhao: 'IGEFI 02' }),
  ]);
  assert.deepEqual(r.anos[0].linhas.map(l => `${l.fazenda}/${l.talhao}`),
    ['Figueira/IGEFI 02', 'Figueira/IGEFI 10', 'Serra Azul/SA 02']);
});


console.log('\nGeometria da matriz no PDF\n');

const FIXAS_FAZENDA = 28 + 15 + 26;      // talhao + area + investimento
const FIXAS_PRODUTOR = 30 + FIXAS_FAZENDA;
const prods = (n) => Array.from({ length: n }, (_, i) => `Produto ${i + 1}`);
const largura = (plano, fixas) => fixas + plano.grupos[0].length * Math.max(LARG_MIN_PRODUTO_MM, plano.wProduto);

t('poucos produtos: uma tabela so, ocupando a largura util', () => {
  const plano = planejarTabela(prods(4), FIXAS_FAZENDA);
  assert.equal(plano.grupos.length, 1);
  assert.ok(Math.abs(largura(plano, FIXAS_FAZENDA) - LARGURA_UTIL_MM) < 0.01, `largura ${largura(plano, FIXAS_FAZENDA)}`);
});

t('MUITOS produtos quebram em grupos, sem perder nem repetir nenhum', () => {
  const lista = prods(30);
  const plano = planejarTabela(lista, FIXAS_FAZENDA);
  assert.ok(plano.grupos.length > 1, 'deveria quebrar em mais de uma tabela');
  assert.deepEqual(plano.grupos.flat(), lista, 'a uniao dos grupos e a lista original, na ordem');
});

t('nenhum grupo estoura a folha, nem no escopo produtor (coluna Fazenda a mais)', () => {
  for (const fixas of [FIXAS_FAZENDA, FIXAS_PRODUTOR]) {
    for (const n of [1, 2, 3, 5, 8, 12, 20, 40]) {
      const plano = planejarTabela(prods(n), fixas);
      for (const g of plano.grupos) {
        const w = fixas + g.length * Math.max(LARG_MIN_PRODUTO_MM, plano.wProduto);
        assert.ok(w <= LARGURA_UTIL_MM + 0.01, `n=${n} fixas=${fixas}: ${w.toFixed(1)}mm > ${LARGURA_UTIL_MM}mm`);
      }
    }
  }
});

t('coluna de produto nunca fica menor que o minimo legivel', () => {
  const plano = planejarTabela(prods(40), FIXAS_PRODUTOR);
  assert.ok(plano.wProduto >= LARG_MIN_PRODUTO_MM - 0.01, `wProduto=${plano.wProduto}`);
});

t('sem produto nenhum nao quebra', () => {
  assert.deepEqual(planejarTabela([], FIXAS_FAZENDA).grupos, []);
});


console.log('\nNome do arquivo\n');

const resumoDe = (...anos) => montarResumoGeral(anos.map(ano => L({ talhaoId: 't' + ano, ano, safra: String(ano).slice(2) + '/x' })));

t('nome LEGIVEL, com o nome da fazenda e o ano — nao a sigla de maquina', () => {
  const n = nomeArquivoResumo(resumoDe(2026), { escopo: 'fazenda', produtor: 'William Nolte', fazenda: 'Campos Gerais' });
  assert.equal(n, 'Resumo Campos Gerais 2026');
});

t('varios anos viram um intervalo', () => {
  const n = nomeArquivoResumo(resumoDe(2024, 2025, 2026), { escopo: 'fazenda', produtor: 'W', fazenda: 'Campos Gerais' });
  assert.equal(n, 'Resumo Campos Gerais 2024-2026');
});

t('escopo produtor usa o nome do produtor', () => {
  const n = nomeArquivoResumo(resumoDe(2026), { escopo: 'produtor', produtor: 'William Nolte' });
  assert.equal(n, 'Resumo William Nolte 2026');
});

t('caractere que quebra nome de arquivo sai; acento e espaco ficam', () => {
  const n = nomeArquivoResumo(resumoDe(2026), { escopo: 'fazenda', produtor: 'W', fazenda: 'São João / Gleba 2' });
  assert.equal(n, 'Resumo São João Gleba 2 2026');
  assert.ok(!/[\\/:*?"<>|]/.test(n));
});

t('sem nada preenchido ainda devolve um nome utilizavel', () => {
  const vazio = montarResumoGeral([]);
  assert.equal(nomeArquivoResumo(vazio, { escopo: 'fazenda', produtor: '', fazenda: '' }), 'Resumo de recomendações');
});

t('a extensao entra uma vez so', () => {
  assert.equal(comExtensao('Resumo Campos Gerais 2026'), 'Resumo Campos Gerais 2026.pdf');
  assert.equal(comExtensao('Resumo Campos Gerais 2026.pdf'), 'Resumo Campos Gerais 2026.pdf');
  assert.equal(comExtensao('Resumo.PDF'), 'Resumo.PDF');
  assert.equal(comExtensao('planilha', '.xlsx'), 'planilha.xlsx');
  assert.equal(comExtensao(''), 'relatorio.pdf');
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
