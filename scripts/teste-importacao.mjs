// Testes do NÚCLEO DE CASAMENTO da importação de planilha fitotécnica
// (lib/importacao: texto, identidade, casarTalhao).
//
// Todos os casos abaixo saíram da planilha real do cliente (592 linhas) e do
// cadastro de produção (75 produtores, 175 fazendas, 1.060 talhões). O que pode
// dar errado e a tela NÃO denuncia:
//
//  - casar o produtor errado da mesma família (Thiago × Luciano Aardoon) — a
//    linha entra bonita, no talhão de outra pessoa;
//  - tratar "01 E 02" como o talhão 1, perdendo o 2 em silêncio;
//  - somar as duas linhas de um CONSÓRCIO e dobrar a área do talhão;
//  - deixar "FAZENDA SANTA TEREZINHA" sem casar com "SANTA TEREZINHA", o que
//    sozinho derrubava 36,7% das linhas.
// Roda: `npm run teste:importacao`
import assert from 'node:assert/strict';
import { na, chave, semSufixoId, idExterno, palavras, lev, similaridade, tokensCompativeis } from '../src/lib/importacao/texto.ts';
import { nucleoImovel, tokensImovel, scorePessoa, casarProdutor, casarFazenda, PISO_FAZENDA_SUGESTAO, LARGURA_CAMPO_ORIGEM } from '../src/lib/importacao/identidade.ts';
import { analisarNomeTalhao, casarTalhao, classificarRepeticao, ehConsorcio, PISO_TALHAO_SUGESTAO } from '../src/lib/importacao/casarTalhao.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const nomeDe = x => x.nome;
const c = nome => ({ nome });

console.log('\n── texto ──');

t('na: sem acento, maiúscula, espaço colapsado', () => {
  assert.equal(na('  Fazenda   São  Miguel '), 'FAZENDA SAO MIGUEL');
  assert.equal(na('CORNÉLIO DYKSTRA'), 'CORNELIO DYKSTRA');
  assert.equal(na(null), '');
});

t('chave: pontuação some, acento some', () => {
  assert.equal(chave('FAZENDA SÃO MIGUEL'), chave('fazenda  sao-miguel.'));
  assert.equal(chave('SANTO ANDRÉ'), 'SANTOANDRE');
});

t('semSufixoId tira o código do cliente, mas NÃO o intervalo de talhão', () => {
  assert.equal(semSufixoId('GASPAR JOAO DE GEUS-4931'), 'GASPAR JOAO DE GEUS');
  assert.equal(semSufixoId('FAZENDA 4E-281611'), 'FAZENDA 4E');
  assert.equal(semSufixoId('FAZENDA SANTA TEREZINHA-256'), 'FAZENDA SANTA TEREZINHA');
  // Estes são NOMES DE TALHÃO que cobrem dois talhões — o sufixo é dado, não id.
  assert.equal(semSufixoId('MGEPE 1-2'), 'MGEPE 1-2');
  assert.equal(semSufixoId('MGESA 12-13'), 'MGESA 12-13');
  assert.equal(semSufixoId('ATSBO  3-7'), 'ATSBO  3-7');
});

t('idExterno guarda o código que semSufixoId remove', () => {
  // A planilha tem DOIS "MARIO DYKSTRA", -2073 e -4073, que são pessoas
  // diferentes. Sem guardar o código, a tela mostra duas opções idênticas.
  assert.equal(idExterno('MARIO DYKSTRA-2073'), '2073');
  assert.equal(idExterno('FAZENDA 4E-281611'), '281611');
  assert.equal(idExterno('MGEPE 1-2'), '', 'intervalo de talhão não é código');
  assert.equal(idExterno('GJGCC 01'), '');
});

t('palavras: partícula holandesa/portuguesa sai, geração FICA', () => {
  assert.deepEqual(palavras('THIAGO AARDOON VAN DEN BOOGAARD'), ['THIAGO', 'AARDOON', 'BOOGAARD']);
  assert.deepEqual(palavras('GASPAR JOAO DE GEUS'), ['GASPAR', 'JOAO', 'GEUS']);
  assert.deepEqual(palavras('AGRO PAULS LTDA'), ['AGRO', 'PAULS']);
  // "E" é conectivo em "HARMS E FILHOS" e INICIAL em "JOSE E. SLOB". Apagá-lo
  // sumia com o que distingue dois irmãos, então ele vale como token.
  assert.deepEqual(palavras('JOSE E. SLOB'), ['JOSE', 'E', 'SLOB']);
  // JUNIOR/NETO distinguem pessoas: não podem ser tratados como ruído.
  assert.deepEqual(palavras('CARLOS MARGRAF JUNIOR'), ['CARLOS', 'MARGRAF', 'JUNIOR']);
  assert.deepEqual(palavras('OSMAR NETO'), ['OSMAR', 'NETO']);
});

t('lev com corte devolve cedo, sem mentir sobre distância pequena', () => {
  assert.equal(lev('DANIELLE', 'DANIELLLE'), 1);
  assert.equal(lev('ABC', 'ABC'), 0);
  assert.ok(lev('ABCDEFGH', 'ZZZZZZZZ', 2) > 2, 'distante demais tem de estourar o corte');
  assert.equal(lev('DANIELLE', 'DANIELLLE', 1), 1, 'o corte não pode esconder distância dentro do limite');
});

t('lev e similaridade não devolvem NaN para entrada que não é string', () => {
  // A fase 5 vai chamá-las sobre células de XLSX, onde nem tudo vem string.
  // NaN >= piso é false, e a linha sumiria sem erro nenhum.
  assert.ok(!Number.isNaN(similaridade(42, 'ABC')));
  assert.ok(!Number.isNaN(similaridade(null, undefined)));
  assert.equal(typeof lev(null, 'ABC'), 'number');
});

t('similaridade é 1 para iguais e cai com a diferença', () => {
  assert.equal(similaridade('SANTAMARIA', 'SANTAMARIA'), 1);
  assert.ok(similaridade('SANTAMARIA', 'SANTAMARTA') > 0.8);
  assert.ok(similaridade('SANTAMARIA', 'MELKBRON') < 0.4);
});

t('tokensCompatíveis aceita inicial e o typo real do cadastro', () => {
  assert.ok(tokensCompativeis('C', 'CORNELIS'), 'inicial abreviada');
  assert.ok(tokensCompativeis('DANIELLE', 'DANIELLLE'), 'DANIELLLE, três Ls, está no cadastro');
  assert.ok(!tokensCompativeis('PAULS', 'MARGRAF'));
});

t('tokensCompatíveis NÃO funde gênero, geração nem família — o pior falso positivo', () => {
  // A versão frouxa (1 erro em 5+ letras) casava todos estes com score 1,0 e
  // gravava sozinho: marido/mulher, pai/filha e duas famílias holandesas.
  for (const [a, b] of [
    ['MARIO', 'MARIA'], ['PAULO', 'PAULA'], ['JULIO', 'JULIA'],
    ['CLAUDIO', 'CLAUDIA'], ['DANIEL', 'DANIELA'], ['ANDRE', 'ANDREA'],
    ['MEIJER', 'MEIJERS'], ['VISSER', 'VISSERS'], ['PAULS', 'PAULUS'],
    ['DEKKER', 'BEKKER'], ['LUIS', 'LUIZ'], ['ANA', 'ANO'],
  ]) {
    assert.ok(!tokensCompativeis(a, b), `${a} × ${b} não pode ser a mesma palavra`);
  }
});

t('inicial precisa ser LETRA — dígito solto não é coringa', () => {
  assert.ok(!tokensCompativeis('2', '2000'), 'senão "AGRO 2" casaria com "AGRO 2000"');
  assert.ok(!tokensCompativeis('1', '10'));
});

console.log('\n── identidade: imóvel ──');

t('núcleo do imóvel ignora o TIPO — a regra de maior retorno', () => {
  assert.equal(nucleoImovel('FAZENDA SANTA TEREZINHA-12208'), nucleoImovel('SANTA TEREZINHA'));
  assert.equal(nucleoImovel('CHACARA RINO-213046'), nucleoImovel('RINO'));
  assert.equal(nucleoImovel('AGRO FAZENDA PEREIRA-286009'), nucleoImovel('PEREIRA'), 'dois tipos empilhados');
  assert.equal(nucleoImovel('ESTANCIA PORTAL DO VENTO-3835'), nucleoImovel('PORTAL DO VENTO'));
});

t('imóvel chamado só "FAZENDA" não perde o nome inteiro', () => {
  assert.ok(nucleoImovel('FAZENDA').length > 0, 'sobrar vazio faria casar com qualquer fazenda');
});

t('tokens do imóvel descartam ruído curto', () => {
  assert.deepEqual([...tokensImovel('FAZENDA CRISTALINA I-3249')].sort(), ['CRISTALINA']);
});

t('fazenda: casa pelo núcleo', () => {
  const r = casarFazenda('FAZENDA SANTA TEREZINHA-12208', [c('SANTA TEREZINHA'), c('SANTA CLARA')], nomeDe);
  assert.equal(r.alvo.nome, 'SANTA TEREZINHA');
  assert.equal(r.motivo, 'nucleo');
  assert.ok(r.automatico);
});

t('fazenda: contenção de tokens resolve nome composto', () => {
  const r = casarFazenda('FAZENDA ROSEIRA / BOM SUCESSO-782', [c('BOM SUCESSO'), c('MELKBRON')], nomeDe);
  assert.equal(r.alvo.nome, 'BOM SUCESSO');
  assert.equal(r.motivo, 'contido');
  assert.ok(r.automatico);

  const r2 = casarFazenda('CHACARA TAINHA/LAGOA-22187', [c('TAINHA')], nomeDe);
  assert.equal(r2.alvo.nome, 'TAINHA');
  assert.ok(r2.automatico);
});

t('núcleo exato ganha da contenção (não vira ambiguidade à toa)', () => {
  const r = casarFazenda('FAZENDA SANTA MARIA', [c('SANTA MARIA'), c('SANTA MARIA DOIS')], nomeDe);
  assert.equal(r.motivo, 'nucleo');
  assert.equal(r.alvo.nome, 'SANTA MARIA');
  assert.ok(r.automatico, 'ter uma vizinha parecida não pode travar o casamento exato');
});

t('fazenda: contenção AMBÍGUA não grava sozinha', () => {
  // Nenhuma casa exato, e {BOA,VISTA} está contido nas duas — daqui é impossível
  // saber qual. No cadastro de hoje isso não acontece, mas o erro seria silencioso.
  const r = casarFazenda('FAZENDA BOA VISTA', [c('BOA VISTA DO SUL'), c('BOA VISTA GRANDE')], nomeDe);
  assert.equal(r.motivo, 'ambiguo');
  assert.equal(r.alvo, null);
  assert.ok(!r.automatico);
  assert.equal(r.opcoes.length, 2, 'a tela precisa das duas opções');
});

t('fazenda: sem candidato devolve as opções do produtor para escolher', () => {
  const r = casarFazenda('FAZENDA MELKBRON-283807', [c('SANTA CRUZ'), c('RINCAO')], nomeDe);
  assert.equal(r.alvo, null);
  assert.equal(r.acao, 'criar');
  assert.ok(r.opcoes.length > 0, 'ainda dá para escolher da lista em vez de criar');
});

t('fazenda é procurada só DENTRO do produtor', () => {
  // "FAZENDA 4E" existe para dois produtores; a lista já vem filtrada, e é isso
  // que impede o dono errado.
  const r = casarFazenda('FAZENDA 4E-281611', [c('4E')], nomeDe);
  assert.equal(r.alvo.nome, '4E');
});

console.log('\n── identidade: pessoa ──');

t('THIAGO nunca casa com LUCIANO — o erro que a similaridade bruta cometia', () => {
  assert.equal(scorePessoa('THIAGO AARDOON VAN DEN BOOGAARD', 'LUCIANO AARDOON VAN DEN BOOGAARD'), 0);
  const r = casarProdutor('THIAGO AARDOON VAN DEN BOOGAARD-2569', [c('LUCIANO AARDOON VAN DEN BOOGAARD')], nomeDe);
  assert.equal(r.alvo, null);
  assert.ok(!r.automatico);
});

t('pai e filho não se confundem', () => {
  assert.equal(scorePessoa('CARLOS FREDERICO MARGRAF JUNIOR', 'CARLOS FREDERICO MARGRAF'), 0);
  assert.equal(scorePessoa('OSMAR NETO', 'OSMAR DYKSTRA'), 0);
});

t('abreviatura do nome do meio casa', () => {
  const r = casarProdutor('RAPHAEL CORNELIS HOOGERHEIDE-1939', [c('RAPHAEL C. HOOGERHEIDE')], nomeDe);
  assert.equal(r.alvo.nome, 'RAPHAEL C. HOOGERHEIDE');
  assert.ok(r.automatico);
});

t('nome do meio faltando no cadastro casa', () => {
  const r = casarProdutor('HENDRIK ALBERT BARKEMA-2827', [c('HENDRIK BARKEMA')], nomeDe);
  assert.equal(r.alvo.nome, 'HENDRIK BARKEMA');
  assert.ok(r.automatico, 'score 2/3 fica acima do piso');
});

t('erro de digitação no cadastro casa (DANIELLLE, três Ls, é real)', () => {
  const r = casarProdutor('DANIELLE NEVES HILGEMBERG-3179', [c('DANIELLLE NEVES HILGEMBERG')], nomeDe);
  assert.equal(r.alvo.nome, 'DANIELLLE NEVES HILGEMBERG');
  assert.ok(r.automatico);
});

t('sobrenome final diferente vira CONFIRMAÇÃO, não casamento', () => {
  // Pode ser a mesma pessoa com o cadastro incompleto — ou pode ser parente.
  const r = casarProdutor('LUIZ UBIRAJARA GOMES DA SILVA-3099', [c('LUIZ UBIRAJARA GOMES')], nomeDe);
  assert.ok(!r.automatico, 'nunca grava sozinho quando o último sobrenome difere');
});

t('produtor exato ganha de tudo e é automático', () => {
  const r = casarProdutor('GASPAR JOAO DE GEUS-4931', [c('GASPAR JOÃO DE GEUS'), c('GASPAR JOAO GEUS')], nomeDe);
  assert.equal(r.motivo, 'exato');
  assert.ok(r.automatico);
});

t('empate entre duas pessoas nunca grava sozinho', () => {
  const r = casarProdutor('ANDRE SCHMIDT', [c('ANDRE SCHMIDT'), c('ANDRE SCHMIDT')], nomeDe);
  assert.equal(r.motivo, 'ambiguo');
  assert.equal(r.alvo, null);
});

t('sinônimo aprendido em importação anterior casa sozinho', () => {
  const lista = [{ nome: 'MORRO CHATO AGROPECUARIA', apelidos: ['MORRO CHATO AGROPECUARIA LTDA'] }];
  const r = casarProdutor('MORRO CHATO AGROPECUARIA LTDA-3229', lista, nomeDe, x => x.apelidos);
  assert.equal(r.motivo, 'sinonimo');
  assert.ok(r.automatico);
});

t('produtor inexistente devolve nenhum, sem inventar', () => {
  const r = casarProdutor('DAVID NOLTE-1', [c('MARIO DYKSTRA'), c('GERALDO SLOB')], nomeDe);
  assert.equal(r.alvo, null);
  assert.equal(r.motivo, 'nenhum');
});

console.log('\n── nome de talhão ──');

t('limpo', () => {
  const a = analisarNomeTalhao('GJGCC 01');
  assert.equal(a.classe, 'limpo');
  assert.equal(a.sigla, 'GJGCC');
  assert.deepEqual(a.numeros, [1]);
  assert.equal(a.base, 'GJGCC 01');
});

t('zero-padding: "MGEPE 1" e "MGEPE 01" têm a mesma base', () => {
  assert.equal(analisarNomeTalhao('MGEPE 1').base, analisarNomeTalhao('MGEPE 01').base);
});

t('sufixo colado, separado, maiúsculo e minúsculo dão o mesmo canônico', () => {
  const formas = ['DNHDV 09a', 'DNHDV 09 A', 'DNHDV 09A', 'dnhdv 09 a'];
  const canonicos = new Set(formas.map(f => analisarNomeTalhao(f).canonico));
  assert.equal(canonicos.size, 1, `deveria ser 1 canônico, veio ${[...canonicos].join(' | ')}`);
});

t('sufixo colado NÃO é quebrado letra a letra — 07A, 07AB e 07B são três talhões', () => {
  const ab = analisarNomeTalhao('MCACA 07AB');
  assert.deepEqual(ab.sufixos, ['AB']);
  const todos = ['MCACA 07A', 'MCACA 07AB', 'MCACA 07B'].map(n => analisarNomeTalhao(n).canonico);
  assert.equal(new Set(todos).size, 3, 'os três precisam continuar distintos');
});

t('dois níveis de sufixo', () => {
  const a = analisarNomeTalhao('GJGCC 09A a');
  assert.equal(a.base, 'GJGCC 09');
  assert.deepEqual(a.sufixos, ['A', 'A']);
  assert.notEqual(a.canonico, analisarNomeTalhao('GJGCC 09A').canonico);
});

t('apelido depois de hífen', () => {
  const a = analisarNomeTalhao('LFAIC 02 - Ilha');
  assert.equal(a.classe, 'apelidado');
  assert.equal(a.base, 'LFAIC 02');
  assert.equal(a.apelido, 'ILHA');
});

t('espaço duplo antes do hífen não atrapalha', () => {
  assert.equal(analisarNomeTalhao('LFAEN 03  - OLHO DE AGUA').base, 'LFAEN 03');
});

t('apelido entre parênteses, com sufixo DEPOIS dele', () => {
  const a = analisarNomeTalhao('LUGCG 04 (Klas)B');
  assert.equal(a.base, 'LUGCG 04');
  assert.deepEqual(a.sufixos, ['B']);
  assert.ok(a.apelido.includes('KLAS'));
  assert.notEqual(a.canonico, analisarNomeTalhao('LUGCG 04 (Klas)A').canonico);
});

t('agregado: E, vírgula e hífen entre números', () => {
  for (const [nome, esperado] of [['GSLTA 01 E 02', [1, 2]], ['GSLTA 04,05', [4, 5]], ['MGEPE 1-2', [1, 2]], ['ATSBO  3-7', [3, 7]], ['MSKMA 03 E 04', [3, 4]]]) {
    const a = analisarNomeTalhao(nome);
    assert.equal(a.classe, 'agregado', `${nome} tinha de ser agregado`);
    assert.deepEqual(a.numeros, esperado, nome);
  }
});

t('sem número não quebra', () => {
  assert.equal(analisarNomeTalhao('GVBIPE').classe, 'sem-numero');
  const ab = analisarNomeTalhao('GJGSM ABERTURA');
  assert.equal(ab.classe, 'sem-numero');
  assert.equal(ab.apelido, 'ABERTURA');
  assert.deepEqual(analisarNomeTalhao('').numeros, []);
});

console.log('\n── casamento de talhão ──');

t('exato e canônico gravam sozinhos', () => {
  const tl = [c('GJGCC 01'), c('GJGCC 02')];
  assert.ok(casarTalhao('GJGCC 01', tl, nomeDe).automatico);
  const r = casarTalhao('gjgcc 1', tl, nomeDe);
  assert.equal(r.alvo.nome, 'GJGCC 01');
  assert.ok(r.automatico);
});

t('nome estendido casa com a base', () => {
  const r = casarTalhao('LFAIC 02 - Ilha', [c('LFAIC 02'), c('LFAIC 03')], nomeDe);
  assert.equal(r.alvo.nome, 'LFAIC 02');
  assert.ok(r.automatico);
});

t('SUBDIVISÃO: planilha parte o que o cadastro tem inteiro — sempre confirma', () => {
  const r = casarTalhao('HABPU 02 a', [c('HABPU 02'), c('HABPU 04')], nomeDe);
  assert.equal(r.motivo, 'subdivisao');
  assert.ok(!r.automatico, 'partir um talhão nunca pode ser automático');
  assert.equal(r.pai.nome, 'HABPU 02', 'a tela precisa saber de qual talhão é parte');
});

t('AGREGADO: uma linha cobrindo dois talhões não pode casar só com o primeiro', () => {
  const r = casarTalhao('GSLTA 01 E 02', [c('GSLTA 01'), c('GSLTA 02'), c('GSLTA 03')], nomeDe);
  assert.equal(r.motivo, 'agregado');
  assert.equal(r.alvo, null, 'gravar num talhão só perderia o outro em silêncio');
  assert.deepEqual(r.cobertos.map(nomeDe), ['GSLTA 01', 'GSLTA 02']);
});

t('AGREGADO sem correspondência na base devolve lista vazia para o usuário resolver', () => {
  const r = casarTalhao('MGEPE 1-2', [c('OUTRO 05')], nomeDe);
  assert.equal(r.motivo, 'agregado');
  assert.deepEqual(r.cobertos, []);
});

t('talhão novo não é forçado em cima de um parecido demais', () => {
  const r = casarTalhao('RGC4E 20', [c('RGC4E 01'), c('RGC4E 02')], nomeDe);
  assert.ok(!r.automatico, 'RGC4E 20 não é RGC4E 02');
});

t('fazenda sem talhão nenhum devolve nenhum', () => {
  const r = casarTalhao('GJGCC 01', [], nomeDe);
  assert.equal(r.motivo, 'nenhum');
  assert.equal(r.alvo, null);
});

console.log('\n── consórcio × subdivisão ──');

t('áreas IGUAIS = consórcio (CKLBV 10 a: milho + braquiária em 36,49 ha)', () => {
  assert.ok(ehConsorcio([{ areaHa: 36.49, tipoPlantio: 'PLANTIO' }, { areaHa: 36.49, tipoPlantio: 'CONSÓRCIO' }]));
});

t('a coluna CONSÓRCIO decide mesmo se a área foi digitada diferente', () => {
  assert.ok(ehConsorcio([{ areaHa: 36.49, tipoPlantio: 'PLANTIO' }, { areaHa: 36.5, tipoPlantio: 'CONSÓRCIO' }]));
});

t('áreas DIFERENTES = partes do talhão (FCDPI 01: 71,53 + 3,70)', () => {
  assert.ok(!ehConsorcio([{ areaHa: 71.53, tipoPlantio: 'PLANTIO' }, { areaHa: 3.7, tipoPlantio: 'PLANTIO' }]));
});

t('uma linha só nunca é consórcio; área faltando não vira consórcio por acidente', () => {
  assert.ok(!ehConsorcio([{ areaHa: 36.49, tipoPlantio: 'PLANTIO' }]));
  assert.ok(!ehConsorcio([{ areaHa: null, tipoPlantio: 'PLANTIO' }, { areaHa: null, tipoPlantio: 'PLANTIO' }]));
});


console.log('\n── achados dos críticos adversariais ──');

t('IRMÃOS: nome do meio DIFERENTE não é nome do meio AUSENTE', () => {
  // Os dois davam exatamente 2/3 antes. O primeiro par são duas pessoas; o
  // segundo é a mesma pessoa com o cadastro incompleto.
  assert.ok(scorePessoa('GERRIT JAN LOS', 'GERRIT PIETER LOS') < 0.6, 'irmãos não podem gravar sozinhos');
  assert.ok(scorePessoa('GERRIT LOS', 'GERRIT JAN LOS') >= 0.6, 'nome do meio faltando continua casando');
  const r = casarProdutor('GERRIT JAN LOS-10', [c('GERRIT PIETER LOS')], nomeDe);
  assert.ok(!r.automatico);
  assert.ok(r.opcoes.length + (r.alvo ? 1 : 0) > 0, 'o quase-parente ainda aparece como opção');
});

t('scorePessoa é COMUTATIVA — a ordem dos argumentos não decide o resultado', () => {
  for (const [a, b] of [['A A DYKSTRA', 'ARIE DYKSTRA'], ['J J LOS', 'JAN LOS'], ['HENDRIK BARKEMA', 'HENDRIK ALBERT BARKEMA']]) {
    assert.equal(scorePessoa(a, b), scorePessoa(b, a), `${a} × ${b}`);
  }
});

t('primeiro token de UMA letra não desarma a trava do primeiro nome', () => {
  // "A.S. EMPREENDIMENTOS" começa com "A": sem cuidado, qualquer nome que comece
  // com A passaria pela trava.
  const s1 = scorePessoa('A S EMPREENDIMENTOS AGROPECUARIO', 'ANDRE AGROPECUARIO');
  assert.ok(s1 < 0.6, `inicial não é evidência forte: veio ${s1}`);
  assert.ok(!casarProdutor('A S EMPREENDIMENTOS AGROPECUARIO-2356', [c('ANDRE AGROPECUARIO')], nomeDe).automatico);
});

t('MARIO DYKSTRA -2073 e -4073 são pessoas diferentes: ambíguo, e o código fica visível', () => {
  const lista = [{ nome: 'MARIO DYKSTRA', id: 'a' }, { nome: 'MARIO DYKSTRA', id: 'b' }];
  const r = casarProdutor('MARIO DYKSTRA-2073', lista, nomeDe);
  assert.equal(r.motivo, 'ambiguo');
  assert.equal(r.acao, 'confirmar');
  assert.equal(r.idExterno, '2073', 'a tela precisa do código para o usuário distinguir');
  assert.equal(r.entrada, 'MARIO DYKSTRA-2073');
});

t('sinônimo que devolve undefined não derruba a tela', () => {
  // Cliente/Fazenda/Talhao NÃO têm campo `sinonimos` hoje; a fase 6 vai passar
  // `c => c.sinonimos` e o primeiro registro antigo quebraria tudo.
  assert.doesNotThrow(() => casarProdutor('X Y', [c('X Y')], nomeDe, () => undefined));
  assert.doesNotThrow(() => casarFazenda('X', [c('X')], nomeDe, () => undefined));
  assert.doesNotThrow(() => casarTalhao('ABC 01', [c('ABC 01')], nomeDe, () => undefined));
});

t('sinônimo AMBÍGUO avisa, em vez de cair fora calado', () => {
  const dois = [{ nome: 'A', ap: ['SM'] }, { nome: 'B', ap: ['SM'] }];
  for (const casar of [casarFazenda, casarTalhao]) {
    const r = casar('SM', dois, nomeDe, x => x.ap);
    assert.equal(r.motivo, 'ambiguo', 'quanto mais o dicionário aprende, mais provável a colisão');
    assert.equal(r.opcoes.length, 2);
  }
});

t('cadastro nulo ou vazio não lança', () => {
  assert.doesNotThrow(() => casarProdutor('X', null, nomeDe));
  assert.doesNotThrow(() => casarFazenda('X', undefined, nomeDe));
  assert.doesNotThrow(() => casarTalhao('ABC 01', null, nomeDe));
  assert.doesNotThrow(() => classificarRepeticao(null));
});

t('tokensImovel não deixa "FAZENDA" nem o código virarem identidade', () => {
  const t4e = tokensImovel('FAZENDA 4E-281611');
  assert.ok(!t4e.has('FAZENDA'), 'a palavra que todo imóvel tem não pode identificar nenhum');
  assert.ok(!t4e.has('281611'), 'código de sistema não é nome');
  const r = casarFazenda('FAZENDA 4E-281611', [c('FAZENDA 4B')], nomeDe);
  assert.ok(!r.automatico, '4E e 4B são imóveis diferentes');
});

t('núcleo e tokens do imóvel concordam sobre artigos', () => {
  assert.equal(nucleoImovel('FAZENDA DA GUARDA-37382'), nucleoImovel('GUARDA'));
  assert.equal(nucleoImovel('FAZENDA DAS VIOLAS-242683'), nucleoImovel('VIOLAS'));
});

t('CRISTALINA I × CRISTALINA II: a guarda de ambiguidade é real, não hipotética', () => {
  // Os algarismos romanos caem no filtro de ruído, então os tokens ficam IGUAIS.
  const r = casarFazenda('CRISTALINA', [c('FAZENDA CRISTALINA II'), c('FAZENDA CRISTALINA I')], nomeDe);
  assert.equal(r.motivo, 'ambiguo');
  assert.ok(!r.automatico);
});

t('fazenda sem candidato devolve a lista do produtor ORDENADA por parecença', () => {
  const r = casarFazenda('FAZENDA MELKBRON', [c('AAAA'), c('MELKBRAO'), c('BBBB')], nomeDe);
  const notas = r.opcoes.map(o => o.score);
  assert.deepEqual(notas, [...notas].sort((a, b) => b - a), 'a tela não pode receber ordem de inserção');
  assert.ok(r.opcoes.every(o => typeof o.score === 'number' && o.motivo));
});

t('AGREGADO com espaço em volta do separador — a tecla de espaço não pode mudar o resultado', () => {
  for (const nome of ['MGEPE 1 - 2', 'GSLTA 04, 05', 'MGEPE 1 – 2', 'GSLTA 01 E 02']) {
    const a = analisarNomeTalhao(nome);
    assert.equal(a.classe, 'agregado', `${nome} tinha de ser agregado`);
    assert.equal(a.numeros.length, 2, `${nome} → ${a.numeros}`);
  }
  const r = casarTalhao('MGEPE 1 - 2', [c('MGEPE 01'), c('MGEPE 02')], nomeDe);
  assert.equal(r.motivo, 'agregado');
  assert.ok(!r.automatico, 'casar com o talhão 1 e perder o 2 é o pior erro possível aqui');
  assert.deepEqual(r.cobertos.map(nomeDe), ['MGEPE 01', 'MGEPE 02']);
});

t('MCALN 01 E 02 e MCALN 01 NÃO podem ter a mesma chave — 307 ha num talhão de 184', () => {
  const agregado = analisarNomeTalhao('MCALN 01 E 02');
  const simples = analisarNomeTalhao('MCALN 01');
  assert.notEqual(agregado.base, simples.base, 'as duas são linhas distintas da mesma fazenda');
  assert.notEqual(agregado.canonico, simples.canonico);
});

t('AGREGADO pega TODAS as partes de cada talhão coberto, não a primeira', () => {
  const r = casarTalhao('ATSBO 3-7', [c('ATSBO 03A'), c('ATSBO 03B'), c('ATSBO 07A'), c('ATSBO 07B')], nomeDe);
  assert.equal(r.cobertos.length, 4, `veio ${r.cobertos.map(nomeDe).join(', ')}`);
});

t('AGREGADO não repete o mesmo talhão nos cobertos', () => {
  const r = casarTalhao('ABC 01,01', [c('ABC 01')], nomeDe);
  assert.equal(new Set(r.cobertos).size, r.cobertos.length);
});

t('MCACA 07A b é parte de 07A — não é o talhão 07AB', () => {
  // Os dois davam a mesma chave e casavam como EXATO, automaticamente.
  assert.notEqual(analisarNomeTalhao('MCACA 07A b').canonico, analisarNomeTalhao('MCACA 07AB').canonico);
  const r = casarTalhao('MCACA 07A b', [c('MCACA 07AB'), c('MCACA 07A'), c('MCACA 07B')], nomeDe);
  assert.notEqual(r.motivo, 'exato');
  assert.ok(!r.automatico);
});

t('subdivisão de 2º nível aponta para o PAI, não para o avô', () => {
  // GJGCC 09 existe no cadastro E tem linha própria de 70,26 ha.
  const r = casarTalhao('GJGCC 09A a', [c('GJGCC 09'), c('GJGCC 09A')], nomeDe);
  assert.equal(r.motivo, 'subdivisao');
  assert.equal(r.pai.nome, 'GJGCC 09A', 'o pai é 09A, não 09');
  assert.equal(r.acao, 'partir');
});

t('subdivisão devolve o pai em campo próprio, não misturado nas opções', () => {
  const r = casarTalhao('HABPU 02 a', [c('HABPU 02'), c('HABPU 04')], nomeDe);
  assert.equal(r.pai.nome, 'HABPU 02');
  assert.equal(r.acao, 'partir');
});

t('sufixo de 3 letras é sufixo, e palavra solta não grava sozinha', () => {
  assert.equal(analisarNomeTalhao('MCACA 07 ABC').classe, 'subdividido');
  const r = casarTalhao('MCACA 07 PIVO CENTRAL', [c('MCACA 07')], nomeDe);
  assert.ok(!r.automatico, 'palavra solta pode ser sufixo longo — pede confirmação');
});

t('sufixo preso por hífen ainda é subdivisão', () => {
  const a = analisarNomeTalhao('ABC 01-A');
  assert.deepEqual(a.numeros, [1]);
  assert.deepEqual(a.sufixos, ['A']);
});

t('motivo canônico se chama canônico (a tela mostra isso ao usuário)', () => {
  assert.equal(casarTalhao('gjgcc 1', [c('GJGCC 01')], nomeDe).motivo, 'canonico');
  assert.equal(casarTalhao('LFAIC 02 - Ilha', [c('LFAIC 02')], nomeDe).motivo, 'canonico');
});

t('acao cobre os quatro estados da tela', () => {
  assert.equal(casarTalhao('ABC 01', [c('ABC 01')], nomeDe).acao, 'gravar');
  assert.equal(casarTalhao('ABC 01 A', [c('ABC 01')], nomeDe).acao, 'partir');
  assert.equal(casarTalhao('ABC 01', [c('ZZZ 99')], nomeDe).acao, 'criar');
  assert.equal(casarTalhao('ABC 12', [c('ABC 13')], nomeDe).acao, 'confirmar');
});

t('chaveDecisao permite "aplicar aos outros N iguais"', () => {
  const a = casarTalhao('DNHDV 09a', [c('DNHDV 09')], nomeDe);
  const b = casarTalhao('DNHDV 09 A', [c('DNHDV 09')], nomeDe);
  assert.equal(a.chaveDecisao, b.chaveDecisao, 'mesma decisão para as duas grafias');
  assert.equal(casarProdutor('GASPAR-1', [c('X')], nomeDe).chaveDecisao, casarProdutor('gaspar-2', [c('X')], nomeDe).chaveDecisao);
});

t('os dois pisos de sugestão são exercitados', () => {
  const rt = casarTalhao('RGC4E 12', [c('RGC4E 13')], nomeDe);
  assert.equal(rt.motivo, 'similar');
  assert.ok(rt.score >= PISO_TALHAO_SUGESTAO && !rt.automatico);
  const rf = casarFazenda('FAZENDA SANTA MARIA', [c('SANTA MARTA')], nomeDe);
  assert.equal(rf.motivo, 'similar');
  assert.ok(rf.score >= PISO_FAZENDA_SUGESTAO && !rf.automatico);
});

t('as opções carregam nota e motivo, e não incluem o alvo', () => {
  const r = casarFazenda('FAZENDA SANTA MARIA', [c('SANTA MARTA'), c('SANTA MARIO')], nomeDe);
  assert.ok(r.opcoes.every(o => typeof o.score === 'number' && typeof o.motivo === 'string'));
  assert.ok(!r.opcoes.some(o => o.alvo === r.alvo));
  assert.ok(r.opcoes.length <= 5);
});

t('NOME CORTADO no campo de 33 do ERP casa; prefixo curto NÃO', () => {
  // A planilha corta em 33 caracteres. "A.S. EMPREENDIMENTOS AGROPECUARIO" tem
  // exatamente 33 e o cadastro tem "...AGROPECUARIOS", com S. A regra de erro de
  // digitação rejeita S final de propósito (MEIJER × MEIJERS), então sem esta
  // regra os 17 lançamentos viravam duplicata.
  const planilha = 'A.S. EMPREENDIMENTOS AGROPECUARIO';
  assert.equal(planilha.length, LARGURA_CAMPO_ORIGEM);
  const r = casarProdutor(planilha + '-2356', [c('A.S. EMPREENDIMENTOS AGROPECUARIOS'), c('AGROPECUARIA AARDOOM')], nomeDe);
  assert.equal(r.motivo, 'truncado');
  assert.ok(r.automatico);

  // Prefixo curto não é truncamento — é outro nome.
  const curto = casarProdutor('JOAO-1', [c('JOAO VERSCHOOR')], nomeDe);
  assert.notEqual(curto.motivo, 'truncado');
  assert.ok(!curto.automatico);
});

t('nome cortado que casa com DOIS cadastros pede confirmação', () => {
  const p = 'ESTANCIA PORTAL DO VENTO AGROPECU';
  const r = casarProdutor(p, [c(p + 'ARIA'), c(p + 'UARIA LTDA')], nomeDe);
  assert.equal(r.motivo, 'ambiguo');
  assert.ok(!r.automatico);
});

t('fazenda com nome cortado também casa', () => {
  const r = casarFazenda('FAZENDA SERRA DO GALVAO / AGUA CU-216706', [c('SERRA DO GALVAO / AGUA CURTA')], nomeDe);
  assert.ok(r.automatico, `veio ${r.motivo}`);
});

console.log('\n── repetição no mesmo talhão: consórcio, partes ou dúvida ──');

t('CONSÓRCIO declarado (CKLBV 10 a: milho + braquiária, 36,49 ha nas duas)', () => {
  assert.equal(classificarRepeticao([
    { areaHa: 36.49, tipoPlantio: 'PLANTIO', cultura: 'MILHO TRANSGENICO', cultivar: 'AG8707PRO4' },
    { areaHa: 36.49, tipoPlantio: 'CONSÓRCIO', cultura: 'BRACHIARIA', cultivar: 'Brachiaria ruziziensis' },
  ]), 'consorcio');
});

t('duas CULTURAS na mesma área é consórcio mesmo sem a coluna declarar', () => {
  assert.equal(classificarRepeticao([
    { areaHa: 50, tipoPlantio: 'PLANTIO', cultura: 'MILHO TRANSGENICO', cultivar: 'A' },
    { areaHa: 50, tipoPlantio: 'PLANTIO', cultura: 'BRACHIARIA', cultivar: 'B' },
  ]), 'consorcio');
});

t('PARTES: áreas e cultivares diferentes (FCDPI 01: 71,53 + 3,70)', () => {
  assert.equal(classificarRepeticao([
    { areaHa: 71.53, tipoPlantio: 'PLANTIO', cultura: 'MILHO TRANSGENICO', cultivar: 'AG9021PRO3' },
    { areaHa: 3.7, tipoPlantio: 'PLANTIO', cultura: 'MILHO TRANSGENICO', cultivar: 'SS261SVIP3' },
  ]), 'partes');
});

t('AMBÍGUO: tudo idêntico menos a área — 5 dos 11 grupos reais são assim', () => {
  // IGEFI 02: 91,60 + 20,00, mesma cultura, mesmo cultivar, mesma data. Somar
  // lança 111,60 ha num talhão que a outra linha diz ter 91,60.
  assert.equal(classificarRepeticao([
    { areaHa: 91.6, tipoPlantio: 'PLANTIO', cultura: 'SOJA TRANSGENICA', cultivar: '3577I2X' },
    { areaHa: 20, tipoPlantio: 'PLANTIO', cultura: 'SOJA TRANSGENICA', cultivar: '3577I2X' },
  ]), 'ambiguo');
});

t('áreas iguais com mesma cultura E mesmo cultivar não é consórcio', () => {
  assert.equal(classificarRepeticao([
    { areaHa: 18.5, tipoPlantio: 'PLANTIO', cultura: 'SOJA TRANSGENICA', cultivar: 'X' },
    { areaHa: 18.5, tipoPlantio: 'PLANTIO', cultura: 'SOJA TRANSGENICA', cultivar: 'X' },
  ]), 'ambiguo');
});

t('a tolerância de área compara centésimos, não float', () => {
  // 20,00 × 20,01 e 10,00 × 10,01 têm de dar a MESMA resposta.
  const par = (a, b) => classificarRepeticao([
    { areaHa: a, tipoPlantio: 'PLANTIO', cultura: 'SOJA', cultivar: 'X' },
    { areaHa: b, tipoPlantio: 'PLANTIO', cultura: 'SOJA', cultivar: 'X' },
  ]);
  assert.equal(par(20.00, 20.01), par(10.00, 10.01));
});

t('área faltando não vira consórcio por acidente; uma linha só nunca é consórcio', () => {
  assert.ok(!ehConsorcio([{ areaHa: 36.49, tipoPlantio: 'PLANTIO', cultura: 'SOJA' }]));
  assert.ok(!ehConsorcio([{ areaHa: null, cultura: 'SOJA' }, { areaHa: null, cultura: 'SOJA' }]));
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
