// Testes do LEITOR e do MOTOR DE CONFERÊNCIA da planilha fitotécnica
// (lib/importacao: planilha, conferencia).
//
// O que pode dar errado e a tela NÃO denuncia:
//  - o de-para de coluna casar "DT. RET." com "DATA CRIAÇÃO" e a época do
//    cultivo sair do ano errado;
//  - "1.799,10" virar 1,799 ha — a planilha é pt-BR e o SheetJS entrega texto;
//  - uma linha de rodapé virar registro fantasma;
//  - o consórcio ser somado como se fossem partes, dobrando a área do talhão;
//  - "aplicar aos outros iguais" atravessar produtores diferentes — nomes de
//    fazenda se repetem onze vezes na planilha real.
// Roda: `npm run teste:importacao-planilha`
import assert from 'node:assert/strict';
import {
  lerPlanilhaFitotecnica, parseArea, parseDataBR, epocaDePlantio, casarSafra, OBRIGATORIAS,
} from '../src/lib/importacao/planilha.ts';
import { conferirPlanilha, linhasEquivalentes } from '../src/lib/importacao/conferencia.ts';
import { anoDaSafra } from '../src/lib/periodo.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

// Cabeçalho igual ao da planilha real, com as colunas de ruído no meio.
const CAB = ['SAFRA', 'TIPO SAFRA', 'AGRÔNOMO', 'PRODUTOR', 'NR. MATRÍCULA', 'FAZENDA', 'MUNICÍPIO',
  'TALHÃO', 'ÁREA', 'DT. RET.', 'CULTURA', 'PROPÓSITO', 'CULTIVAR', 'USUARIO CRIAÇÃO', 'DATA CRIAÇÃO',
  'DATA ATUALIZAÇÃO', 'PLANTIO/REPLANTIO'];
const linha = (o = {}) => {
  const l = new Array(CAB.length).fill('');
  l[0] = o.safra ?? '2026/2027'; l[3] = o.produtor ?? 'GASPAR JOAO DE GEUS-4931';
  l[4] = o.matricula ?? '4931'; l[5] = o.fazenda ?? 'FAZENDA CERRADO CAJURU-1786';
  l[7] = o.talhao ?? 'GJGCC 01'; l[8] = o.area ?? '52,51'; l[9] = o.data ?? '05/10/2026';
  l[10] = o.cultura ?? 'SOJA TRANSGENICA'; l[11] = o.proposito ?? 'Produção de Grãos';
  l[12] = o.cultivar ?? '59IX61RSF I2X'; l[14] = '26/05/2026 14:56:46';
  l[16] = o.tipoPlantio ?? 'PLANTIO';
  return l;
};

console.log('\n── números e datas em pt-BR ──');

t('área aceita vírgula e ponto de milhar', () => {
  assert.equal(parseArea('52,51'), 52.51);
  assert.equal(parseArea('1.799,10'), 1799.1);
  assert.equal(parseArea('1799.10'), 1799.1);
  assert.equal(parseArea(180.58), 180.58);
});

t('área inválida é null, nunca zero', () => {
  // Zero silencioso viraria "talhão de 0 ha" e passaria batido.
  for (const v of ['', '  ', '—', 'n/d', '0', '-5', null, undefined]) {
    assert.equal(parseArea(v), null, `${JSON.stringify(v)} devia ser null`);
  }
});

t('data BR e ISO viram ISO; lixo vira vazio', () => {
  assert.equal(parseDataBR('05/10/2026'), '2026-10-05');
  assert.equal(parseDataBR('5/1/2026'), '2026-01-05');
  assert.equal(parseDataBR('26/05/2026 14:56:46'), '2026-05-26');
  assert.equal(parseDataBR('2026-10-05'), '2026-10-05');
  assert.equal(parseDataBR('31/13/2026'), '', 'mês 13 não existe');
  assert.equal(parseDataBR(''), '');
});

t('época sai do mês do plantio; sem data é a época principal', () => {
  assert.equal(epocaDePlantio('2026-10-05'), 'verao');
  assert.equal(epocaDePlantio('2026-08-15'), 'verao');
  assert.equal(epocaDePlantio('2027-02-10'), 'safrinha');
  assert.equal(epocaDePlantio('2026-05-20'), 'inverno');
  assert.equal(epocaDePlantio(''), '', 'sem data não se inventa uma segunda safra');
});

console.log('\n── de-para de coluna, por NOME ──');

t('acha as 12 colunas mesmo com ruído no meio', () => {
  const r = lerPlanilhaFitotecnica([CAB, linha()]);
  assert.deepEqual(r.faltando, []);
  assert.equal(r.colunas.talhao, 7);
  assert.equal(r.colunas.areaHa, 8);
  assert.equal(r.colunas.cultivar, 12);
  assert.equal(r.colunas.tipoPlantio, 16);
});

t('"DT. RET." não é roubada por "DATA CRIAÇÃO"', () => {
  const r = lerPlanilhaFitotecnica([CAB, linha()]);
  assert.equal(r.colunas.dataRetirada, 9, `veio ${r.colunas.dataRetirada}`);
  assert.equal(r.linhas[0].dataRetirada, '2026-10-05', 'a data do plantio define a época');
});

t('a POSIÇÃO das colunas não importa — só o nome', () => {
  const embaralhado = [...CAB].reverse();
  const dados = [...linha()].reverse();
  const r = lerPlanilhaFitotecnica([embaralhado, dados]);
  assert.deepEqual(r.faltando, []);
  assert.equal(r.linhas[0].talhao, 'GJGCC 01');
  assert.equal(r.linhas[0].areaHa, 52.51);
  assert.equal(r.linhas[0].cultivar, '59IX61RSF I2X');
});

t('arquivo que não é planilha fitotécnica é recusado com o que falta', () => {
  const r = lerPlanilhaFitotecnica([['NOME', 'VALOR'], ['x', '1']]);
  assert.ok(r.faltando.length > 0);
  assert.deepEqual(r.faltando, OBRIGATORIAS);
  assert.equal(r.linhas.length, 0, 'não lê linha nenhuma de um arquivo recusado');
});

t('cabeçalho depois de linhas de título é encontrado', () => {
  const r = lerPlanilhaFitotecnica([[''], ['Relatório de Insumos'], CAB, linha()]);
  assert.equal(r.linhaCabecalho, 2);
  assert.equal(r.linhas.length, 1);
});

t('a linha do arquivo é a que o Excel mostra', () => {
  const r = lerPlanilhaFitotecnica([CAB, linha(), linha()]);
  assert.deepEqual(r.linhas.map(l => l.linha), [2, 3], 'erro "na linha 47" tem de achar a linha 47');
});

t('rodapé e linha em branco são ignorados, não viram registro', () => {
  const rodape = new Array(CAB.length).fill('');
  rodape[8] = '1.799,10';
  const r = lerPlanilhaFitotecnica([CAB, linha(), rodape, new Array(CAB.length).fill('')]);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.ignoradas, 2);
});

t('mapa manual sobrepõe a detecção', () => {
  const r = lerPlanilhaFitotecnica([CAB, linha()], { talhao: 5 });
  assert.equal(r.linhas[0].talhao, 'FAZENDA CERRADO CAJURU-1786', 'a tela precisa poder corrigir');
});

t('colunas não usadas são reportadas para a tela', () => {
  const r = lerPlanilhaFitotecnica([CAB, linha()]);
  assert.ok(r.colunasIgnoradas.includes('MUNICÍPIO'));
  assert.ok(!r.colunasIgnoradas.includes('TALHÃO'));
});

console.log('\n── safra: "2026/2027" da planilha × "26/27" do cadastro ──');

t('casa pelo ANO, não pela string', () => {
  assert.equal(casarSafra('2026/2027', ['25/26', '26/27'], anoDaSafra), '26/27');
  assert.equal(casarSafra('26/27', ['26/27'], anoDaSafra), '26/27');
  assert.equal(casarSafra('2030/2031', ['25/26', '26/27'], anoDaSafra), '', 'ano ausente não casa com nada');
  assert.equal(casarSafra('', ['26/27'], anoDaSafra), '');
});

console.log('\n── motor de conferência ──');

const CULTURAS = ['Soja', 'Milho', 'Trigo', 'Feijão', 'Algodão', 'Aveia', 'Sorgo', 'Cevada', 'Pastagem', 'Outra'];
const cadastroCheio = {
  clientes: [{ id: 'c1', nome: 'GASPAR JOÃO DE GEUS' }],
  fazendas: [{ id: 'f1', nome: 'CERRADO CAJURU', clienteId: 'c1' }],
  talhoes: [{ id: 't1', nome: 'GJGCC 01', fazendaId: 'f1', areaHa: 52.51 },
            { id: 't2', nome: 'GJGCC 08', fazendaId: 'f1', areaHa: 90 }],
  safras: ['26/27'],
  culturas: CULTURAS,
  propositos: [{ id: 'p1', nome: 'Produção de Grãos', sinonimos: ['PRODUCAO DE GRAOS'] }],
  cultivares: [{ id: 'cv1', nome: 'Brasmax Zeus IPRO', sinonimos: ['59IX61RSF I2X'] }],
  anoDaSafra,
};
const conferir = (linhas, cad = cadastroCheio) =>
  conferirPlanilha(lerPlanilhaFitotecnica([CAB, ...linhas]).linhas, cad);

t('linha completa e casada fica PRONTA', () => {
  const p = conferir([linha()]);
  assert.equal(p.resumo.gravar, 1, JSON.stringify(p.linhas[0].bloqueios));
  const l = p.linhas[0];
  assert.equal(l.produtor.alvo.nome, 'GASPAR JOÃO DE GEUS');
  assert.equal(l.fazenda.alvo.nome, 'CERRADO CAJURU');
  assert.equal(l.talhao.alvo.nome, 'GJGCC 01');
  assert.equal(l.cultura.cultura, 'Soja');
  assert.equal(l.cultura.origem, 'SOJA TRANSGENICA', 'o texto do cliente não some');
  assert.equal(l.cultivar.alvo.nome, 'Brasmax Zeus IPRO');
  assert.equal(l.safra, '26/27');
  assert.equal(l.epoca, 'verao');
  assert.deepEqual(l.bloqueios, []);
});

t('a PIOR etapa manda na ação da linha', () => {
  // Produtor e fazenda casam; o talhão não existe.
  const p = conferir([linha({ talhao: 'ZZZZZ 99' })]);
  assert.equal(p.linhas[0].acao, 'criar');
  assert.ok(p.linhas[0].bloqueios.some(b => b.includes('Talhão')));
});

t('cultivar fora do cadastro bloqueia e aparece no pré-voo', () => {
  const p = conferir([linha({ cultivar: 'AG9021PRO3' })]);
  assert.equal(p.linhas[0].acao, 'criar');
  assert.deepEqual(p.preVoo.cultivares, [{ nome: 'AG9021PRO3', linhas: 1 }]);
});

t('linha sem cultivar não é bloqueada por causa dele', () => {
  const p = conferir([linha({ cultivar: '' })]);
  assert.equal(p.resumo.gravar, 1, JSON.stringify(p.linhas[0].bloqueios));
});

t('ano não cadastrado bloqueia e é listado', () => {
  const p = conferir([linha({ safra: '2030/2031' })]);
  assert.ok(p.linhas[0].bloqueios.some(b => b.includes('2030/2031')));
  assert.deepEqual(p.preVoo.safrasAusentes, ['2030/2031']);
});

t('CONSÓRCIO: mesma área, culturas diferentes → duas ordens, sem somar', () => {
  const p = conferir([
    linha({ talhao: 'GJGCC 01', area: '36,49', cultura: 'MILHO TRANSGENICO', cultivar: '' }),
    linha({ talhao: 'GJGCC 01', area: '36,49', cultura: 'BRACHIARIA', cultivar: '', tipoPlantio: 'CONSÓRCIO' }),
  ]);
  assert.equal(p.linhas[0].repeticao, 'consorcio');
  assert.deepEqual(p.linhas.map(l => l.ordemNoGrupo), [1, 2], 'a ordem é o que distingue na mesma área');
});

t('PARTES: áreas e cultivares diferentes → cada uma é o seu cultivo', () => {
  // FCDPI 01 na planilha real: 71,53 + 3,70, dois cultivares.
  const p = conferir([
    linha({ talhao: 'GJGCC 01', area: '71,53', cultivar: 'AG9021PRO3' }),
    linha({ talhao: 'GJGCC 01', area: '3,70', cultivar: 'SS261SVIP3' }),
  ]);
  assert.equal(p.linhas[0].repeticao, 'partes');
  assert.deepEqual(p.linhas.map(l => l.ordemNoGrupo), [1, 1]);
});

t('mesma área e mesmo cultivar NÃO é consórcio nem partes — é dúvida', () => {
  // Sem cultivar dos dois lados, cultura igual e áreas diferentes: é exatamente
  // o padrão dos 5 grupos de "20,00 ha" da planilha real.
  const p = conferir([
    linha({ talhao: 'GJGCC 01', area: '20,76', cultivar: '' }),
    linha({ talhao: 'GJGCC 01', area: '76,90', cultivar: '' }),
  ]);
  assert.equal(p.linhas[0].repeticao, 'ambiguo');
  assert.equal(p.linhas[0].acao, 'confirmar');
});

t('AMBÍGUO: tudo igual menos a área vira pergunta, não chute', () => {
  const p = conferir([
    linha({ talhao: 'GJGCC 01', area: '91,60' }),
    linha({ talhao: 'GJGCC 01', area: '20,00' }),
  ]);
  assert.equal(p.linhas[0].repeticao, 'ambiguo');
  assert.equal(p.linhas[0].acao, 'confirmar');
  assert.ok(p.linhas[0].bloqueios.some(b => b.includes('partido') || b.includes('repetido')));
});

t('SUBDIVISÃO: parte de um talhão que o cadastro tem inteiro', () => {
  const p = conferir([linha({ talhao: 'GJGCC 08 a', cultivar: '' })]);
  assert.equal(p.linhas[0].talhao.motivo, 'subdivisao');
  assert.equal(p.linhas[0].acao, 'partir');
  assert.equal(p.linhas[0].talhao.pai.nome, 'GJGCC 08');
});

console.log('\n── pré-voo e aplicar-a-todos ──');

t('pré-voo conta LINHAS por item, ordenado pelo que mais destrava', () => {
  const p = conferir([
    linha({ produtor: 'FULANO DE TAL-1' }), linha({ produtor: 'FULANO DE TAL-1' }),
    linha({ produtor: 'BELTRANO SILVA-2' }),
  ]);
  assert.equal(p.preVoo.produtores[0].linhas, 2, 'o maior primeiro — é o que rende mais');
  assert.equal(p.preVoo.produtores.length, 2);
});

t('produtor resolvido não aparece na lista de fazendas ausentes duas vezes', () => {
  const p = conferir([linha({ fazenda: 'FAZENDA INEXISTENTE-9' }), linha({ fazenda: 'FAZENDA INEXISTENTE-9' })]);
  assert.equal(p.preVoo.fazendas.length, 1);
  assert.equal(p.preVoo.fazendas[0].linhas, 2);
  assert.equal(p.preVoo.fazendas[0].produtor, 'GASPAR JOÃO DE GEUS');
});

t('aplicar ao produtor pega todas as linhas dele', () => {
  const p = conferir([linha(), linha({ talhao: 'GJGCC 08' }), linha({ produtor: 'OUTRO NOME-9' })]);
  assert.deepEqual(linhasEquivalentes(p, 0, 'produtor'), [0, 1]);
});

t('aplicar à fazenda NÃO atravessa produtores diferentes', () => {
  // "FAZENDA SANTO ANDRE" existe para dois produtores na planilha real.
  const p = conferir([
    linha({ produtor: 'GASPAR JOAO DE GEUS-4931', fazenda: 'FAZENDA SANTO ANDRE-1' }),
    linha({ produtor: 'OUTRO PRODUTOR-2', fazenda: 'FAZENDA SANTO ANDRE-2' }),
  ]);
  assert.deepEqual(linhasEquivalentes(p, 0, 'fazenda'), [0], 'mesma fazenda, donos diferentes');
});

t('aplicar ao talhão junta as grafias diferentes do mesmo talhão', () => {
  const p = conferir([linha({ talhao: 'GJGCC 08 a' }), linha({ talhao: 'GJGCC 08A' }), linha({ talhao: 'GJGCC 01' })]);
  assert.deepEqual(linhasEquivalentes(p, 0, 'talhao'), [0, 1], '"08 a" e "08A" são a mesma decisão');
});

t('aplicar ao cultivar atravessa produtores — o código é global', () => {
  const p = conferir([
    linha({ cultivar: 'AG9021PRO3' }),
    linha({ cultivar: 'AG9021PRO3', produtor: 'OUTRO-9' }),
    linha({ cultivar: 'DKB230PRO3' }),
  ]);
  assert.deepEqual(linhasEquivalentes(p, 0, 'cultivar'), [0, 1]);
});

t('planilha vazia não quebra', () => {
  const p = conferirPlanilha([], cadastroCheio);
  assert.equal(p.resumo.total, 0);
  assert.deepEqual(p.preVoo.produtores, []);
});

t('cadastro vazio manda tudo para "cadastrar", sem lançar', () => {
  const vazio = { clientes: [], fazendas: [], talhoes: [], safras: [], culturas: CULTURAS, propositos: [], cultivares: [], anoDaSafra };
  const p = conferir([linha()], vazio);
  assert.equal(p.resumo.criar, 1);
  assert.ok(p.linhas[0].bloqueios.length >= 2);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
