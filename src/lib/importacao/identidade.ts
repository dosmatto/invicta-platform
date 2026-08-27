// CASAMENTO DE IDENTIDADE: liga o nome que veio na planilha do cliente ao
// cadastro da plataforma. Puro — sem DOM, sem I/O.
//
// A regra de ouro: NADA que possa ser a pessoa errada entra sozinho. Todo
// resultado diz por que casou (`motivo`), o que a tela deve fazer com ele
// (`acao`) e quais eram as outras opções, com nota (`opcoes`). Quem decide o que
// fazer com "quase" é a tela, não este módulo.
//
// Os limiares e as regras daqui foram medidos contra o cadastro de produção
// (75 produtores, 175 fazendas, 1.060 talhões) usando a planilha de 592 linhas.
// Ver docs/IMPORTACAO-FITOTECNICA.md, seção 3.

import { na, chave, semSufixoId, idExterno, palavras, similaridade, tokensCompativeis } from './texto.ts';

/** Por que casou. Aparece na tela — o usuário precisa saber em que confiar. */
export type Motivo =
  | 'exato'      // chave normalizada idêntica
  | 'sinonimo'   // apelido/sigla já confirmado antes e gravado no cadastro
  | 'nucleo'     // igual depois de remover o tipo do imóvel (FAZENDA, CHÁCARA…)
  | 'canonico'   // igual depois de normalizar o nome do talhão (zero, letra, espaço)
  | 'contido'    // os tokens de um nome contêm os do outro
  | 'truncado'   // o nome da planilha é o começo exato do nome do cadastro
  | 'tokens'     // mesmas palavras, com abreviatura ou 1 erro de digitação
  | 'similar'    // parecido o bastante para sugerir, não para gravar
  | 'subdivisao' // a planilha parte em pedaços um talhão que o cadastro tem inteiro
  | 'agregado'   // uma linha da planilha cobre VÁRIOS talhões do cadastro
  | 'ambiguo'    // mais de um candidato igualmente bom
  | 'nenhum';

/**
 * O que a tela faz com a linha. Existe porque a tela tem QUATRO estados (as
 * quatro abas e as quatro cores do painel de conferência) e um booleano só
 * expressa dois — sem isto, o componente teria de reimplementar, num `switch`
 * fora deste módulo, o conhecimento de quais motivos são graves.
 */
export type Acao =
  | 'gravar'    // verde   — casou com segurança
  | 'confirmar' // âmbar   — há um candidato, mas alguém tem de olhar
  | 'partir'    // violeta — subdivisão ou agregado: a linha vira N registros
  | 'criar';    // vermelho— não existe no cadastro

const ACAO_DE: Record<Motivo, Acao> = {
  exato: 'gravar', sinonimo: 'gravar', nucleo: 'gravar', canonico: 'gravar',
  contido: 'gravar', tokens: 'gravar', truncado: 'gravar',
  similar: 'confirmar', ambiguo: 'confirmar',
  subdivisao: 'partir', agregado: 'partir',
  nenhum: 'criar',
};

export interface Opcao<T> {
  alvo: T;
  /** 0..1 — a mesma escala do `score` do casamento. */
  score: number;
  motivo: Motivo;
}

export interface Casamento<T> {
  /** O texto exatamente como veio da planilha, COM o código do cliente. */
  entrada: string;
  /** O código que a planilha colou no fim do nome ("4931"), ou ''. */
  idExterno: string;
  /**
   * Linhas com a mesma chave merecem a mesma decisão. É o que sustenta o
   * "aplicar aos outros N casos idênticos" — sem ela, resolver as 23
   * subdivisões custa 23 cliques em vez de um.
   */
  chaveDecisao: string;
  /** O candidato escolhido, ou null quando não há um em quem apostar. */
  alvo: T | null;
  motivo: Motivo;
  /** 0..1. Em 'exato'/'sinonimo' é sempre 1. */
  score: number;
  acao: Acao;
  /** Atalho de `acao === 'gravar'`. */
  automatico: boolean;
  /** Outros candidatos, do melhor para o pior, sem o `alvo`. No máximo 5. */
  opcoes: Opcao<T>[];
}

function montar<T>(entrada: string, motivo: Motivo, alvo: T | null, score: number, opcoes: Opcao<T>[] = []): Casamento<T> {
  const acao = alvo ? ACAO_DE[motivo] : (motivo === 'nenhum' ? 'criar' : ACAO_DE[motivo]);
  return {
    entrada, idExterno: idExterno(entrada), chaveDecisao: chave(semSufixoId(entrada)),
    alvo, motivo, score, acao, automatico: acao === 'gravar', opcoes: opcoes.slice(0, 5),
  };
}

/**
 * Casamento por SINÔNIMO — apelidos confirmados em importações anteriores.
 *
 * Estava escrito três vezes, cada cópia tratando o empate de um jeito. Aqui:
 *  - `sinonimosDe` pode devolver `undefined` (nenhuma entidade do cadastro tem
 *    o campo hoje, e a fase 6 vai passar `c => c.sinonimos` sem pensar);
 *  - dois registros com o mesmo apelido devolvem AMBÍGUO, nunca silêncio. Quanto
 *    mais o dicionário aprende, mais provável a colisão — falhar mudo aqui
 *    esvaziaria justamente o mecanismo que faz o trabalho não se repetir.
 */
function porSinonimo<T>(k: string, lista: T[], sinonimosDe?: (t: T) => string[] | undefined): T[] {
  if (!sinonimosDe) return [];
  return lista.filter(t => (sinonimosDe(t) ?? []).some(s => chave(s) === k));
}

/**
 * Largura do campo NOME no sistema que gera a planilha do cliente.
 *
 * Medida, não suposta: entre os 60 produtores e as 106 fazendas da planilha de
 * referência, NENHUM nome passa de 33 caracteres, e exatamente três de cada
 * param em 33 cravados —
 *   "A.S. EMPREENDIMENTOS AGROPECUARIO"   (o cadastro tem …AGROPECUARIOS)
 *   "ESTANCIA PORTAL DO VENTO AGROPECU"
 *   "AGROPECUARIA VAN DEN BOOGAARD LTD"
 *   "FAZENDA SERRA DO GALVAO / AGUA CU"
 * Não é coincidência: é o ERP cortando o campo.
 */
export const LARGURA_CAMPO_ORIGEM = 33;

/**
 * O nome da planilha é o COMEÇO EXATO do nome do cadastro, e bateu no teto do
 * campo? Então foi cortado, não é outro nome.
 *
 * Vale a pena separar isso de "erro de digitação": `AGROPECUARIO` ×
 * `AGROPECUARIOS` difere por um S final, e a regra de digitação REJEITA S final
 * de propósito (é o que separa as famílias MEIJER e MEIJERS). Sem esta regra, os
 * 17 lançamentos da A.S. Empreendimentos caíam em "cadastrar duplicata" mesmo
 * com o produtor já cadastrado.
 *
 * Só conta quando o nome da planilha bateu no limite: um prefixo curto ("JOAO"
 * dentro de "JOAO VERSCHOOR") não é truncamento, é outro nome.
 */
// ── Imóvel (fazenda) ────────────────────────────────────────────────────────

/**
 * Palavras que dizem o TIPO do imóvel, não QUAL imóvel é. A planilha do cliente
 * escreve "FAZENDA SANTA TEREZINHA"; o cadastro guarda "SANTA TEREZINHA".
 *
 * Foi a regra de maior retorno de todas: sozinha, recuperou 217 das 592 linhas
 * (36,7%) que o casamento por igualdade descartava. Cobre 100% dos prefixos
 * presentes na planilha de referência.
 */
const TIPOS_IMOVEL = /^(AGRO\s+|GRUPO\s+)?(FAZENDA|FAZ|CHACARA|CHAC|SITIO|ESTANCIA|GRANJA|AGROPECUARIA|HARAS|RETIRO)\.?\s+/;

/** Nome do imóvel sem código de sistema e sem os tipos empilhados na frente. */
function nucleoTexto(nome: string): string {
  let s = na(semSufixoId(nome));
  for (let i = 0; i < 3; i++) {
    const antes = s;
    s = s.replace(TIPOS_IMOVEL, '');
    if (s === antes) break;
  }
  return s.trim();
}

/**
 * Chave de igualdade do imóvel. Passa por `palavras()`, igual a `tokensImovel` —
 * as duas eram inconsistentes: o núcleo mantinha os artigos e os tokens não, de
 * modo que "FAZENDA DA GUARDA" tinha núcleo `DAGUARDA` e tokens `[GUARDA]`. Um
 * cadastro que guardasse "GUARDA" perdia o casamento forte e caía no fraco.
 * São 10 fazendas assim na planilha de referência.
 *
 * Nunca devolve vazio: um imóvel chamado só "FAZENDA" perderia o nome inteiro e
 * casaria com qualquer outro.
 */
export function nucleoImovel(nome: string): string {
  const k = palavras(nucleoTexto(nome)).join('');
  return k || chave(semSufixoId(nome));
}

/**
 * Tokens de identidade do imóvel. Descarta ruído de 1–2 letras ("I", "II", "DO").
 *
 * Quando SÓ sobra ruído — "FAZENDA 4E" tem núcleo "4E" — devolve o núcleo curto
 * como está. A versão anterior caía para `palavras(nome)` sobre o nome CRU, o
 * que trazia de volta a palavra `FAZENDA` (que todo imóvel tem) e o código do
 * sistema: `tokensImovel('FAZENDA 4E-281611')` dava `{FAZENDA, 281611}`, e
 * `{FAZENDA}` está contido em tudo — "FAZENDA 4E" casava com "FAZENDA 4B".
 */
export function tokensImovel(nome: string): Set<string> {
  const nuc = palavras(nucleoTexto(nome));
  const grandes = nuc.filter(p => p.length > 2);
  return new Set(grandes.length ? grandes : nuc);
}

const contido = (a: Set<string>, b: Set<string>): boolean => {
  if (!a.size || !b.size) return false;
  const [menor, maior] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of menor) if (!maior.has(t)) return false;
  return true;
};

// ── Pessoa (produtor) ───────────────────────────────────────────────────────

/**
 * Teto do score quando os dois nomes têm token que o outro não tem. Fica ABAIXO
 * de `PISO_PESSOA_AUTO` (nunca grava sozinho) e ACIMA de `PISO_PESSOA_SUGESTAO`
 * (continua aparecendo como opção na tela).
 */
export const TETO_CONFLITO = 0.5;

/**
 * Quanto dois nomes de pessoa/empresa são a MESMA identidade. 0 = não são.
 *
 * Três travas, nesta ordem:
 *
 * 1. PRIMEIRO nome e ÚLTIMO sobrenome têm de ser compatíveis. Sem isto, a
 *    similaridade bruta casava "THIAGO AARDOON VAN DEN BOOGAARD" com "LUCIANO
 *    AARDOON VAN DEN BOOGAARD" a 0,87 — pessoas diferentes da mesma família, e
 *    a região inteira é assim.
 *
 * 2. Pareamento com CONSUMO: um token do cadastro serve a um token da planilha
 *    só. Sem isto, "A A DYKSTRA" × "ARIE DYKSTRA" dava 1,0 numa direção e 0,67
 *    na outra, porque as duas iniciais casavam com o mesmo "ARIE" — o score nem
 *    era comutativo, e quem chamava decidia o resultado pela ordem dos
 *    argumentos.
 *
 * 3. Token sobrando DOS DOIS LADOS é CONTRADIÇÃO, não omissão. "GERRIT JAN LOS"
 *    × "GERRIT PIETER LOS" tinha exatamente o mesmo 2/3 de "GERRIT LOS" ×
 *    "GERRIT JAN LOS" — o primeiro par são dois irmãos, o segundo é a mesma
 *    pessoa com o cadastro incompleto. A trava 1 não ajuda aqui: numa colônia
 *    holandesa os irmãos compartilham primeiro nome e sobrenome, e é o nome do
 *    meio que os separa.
 */
export function scorePessoa(a: string, b: string): number {
  const A = palavras(semSufixoId(a));
  const B = palavras(semSufixoId(b));
  if (!A.length || !B.length) return 0;
  if (!tokensCompativeis(A[0], B[0])) return 0;
  if (!tokensCompativeis(A[A.length - 1], B[B.length - 1])) return 0;

  const usados = new Set<number>();
  let pares = 0;
  for (const t of A) {
    const j = B.findIndex((u, i) => !usados.has(i) && tokensCompativeis(t, u));
    if (j >= 0) { usados.add(j); pares++; }
  }

  // Quando o primeiro token é uma INICIAL, a trava 1 vale pouco: "A. S.
  // EMPREENDIMENTOS AGROPECUARIO" casaria o "A" com qualquer nome começando por
  // A. Nesse caso exigimos mais de um token pareado para a comparação valer.
  const primeiroFraco = A[0].length === 1 || B[0].length === 1;
  if (primeiroFraco && pares < 2) return 0;

  const score = pares / Math.max(A.length, B.length);
  const sobraDosDoisLados = A.length - pares > 0 && B.length - pares > 0;
  // Inicial no lugar do primeiro nome nunca é evidência forte o bastante para
  // gravar sozinho: "A" casa com todo Andre, Arie e Alberto da colônia.
  const teto = sobraDosDoisLados || primeiroFraco;
  return teto ? Math.min(score, TETO_CONFLITO) : score;
}

/**
 * Piso para gravar um produtor sem perguntar. 0,60 aceita "HENDRIK BARKEMA" ≡
 * "HENDRIK ALBERT BARKEMA" (2/3) e "LUCAS GUERREIRO" ≡ "LUCAS SLUSARZ
 * GUERREIRO" (2/3) — casos em que primeiro e último já bateram e só falta nome
 * do meio de um dos lados.
 */
export const PISO_PESSOA_AUTO = 0.6;

/** Abaixo disto nem como sugestão vale a pena mostrar. */
export const PISO_PESSOA_SUGESTAO = 0.35;

/**
 * Casa o produtor da planilha contra o cadastro.
 *
 * `sinonimosDe` devolve apelidos já confirmados em importações anteriores — é o
 * que faz o trabalho manual de hoje não se repetir amanhã.
 */
export function casarProdutor<T>(
  nomePlanilha: string,
  cadastro: T[] | null | undefined,
  nomeDe: (t: T) => string,
  sinonimosDe?: (t: T) => string[] | undefined,
): Casamento<T> {
  const entrada = String(nomePlanilha ?? '');
  const lista = cadastro ?? [];
  const bruto = semSufixoId(entrada);
  const k = chave(bruto);
  if (!k || !lista.length) return montar<T>(entrada, 'nenhum', null, 0);

  // `semSufixoId` dos DOIS lados: se o cadastro guardar o mesmo código do
  // cliente no nome, comparar cru faria o passo exato nunca disparar.
  const exatos = lista.filter(c => chave(semSufixoId(nomeDe(c))) === k);
  if (exatos.length === 1) return montar(entrada, 'exato', exatos[0], 1);
  if (exatos.length > 1) return montar(entrada, 'ambiguo', null, 1, exatos.map(c => ({ alvo: c, score: 1, motivo: 'exato' as Motivo })));

  const sin = porSinonimo(k, lista, sinonimosDe);
  if (sin.length === 1) return montar(entrada, 'sinonimo', sin[0], 1);
  if (sin.length > 1) return montar(entrada, 'ambiguo', null, 1, sin.map(c => ({ alvo: c, score: 1, motivo: 'sinonimo' as Motivo })));

  const cortados = lista.filter(c => {
    const cad = na(semSufixoId(nomeDe(c)));
    const pla = na(semSufixoId(entrada));
    return pla.length >= LARGURA_CAMPO_ORIGEM && cad.length > pla.length && cad.startsWith(pla);
  });
  if (cortados.length === 1) return montar(entrada, 'truncado', cortados[0], 1);
  if (cortados.length > 1) return montar(entrada, 'ambiguo', null, 1, cortados.map(c => ({ alvo: c, score: 1, motivo: 'truncado' as Motivo })));

  const pontuados = lista
    .map(c => ({ alvo: c, score: scorePessoa(bruto, nomeDe(c)) }))
    .filter(x => x.score >= PISO_PESSOA_SUGESTAO)
    .sort((x, y) => y.score - x.score);

  if (!pontuados.length) return montar<T>(entrada, 'nenhum', null, 0);

  const melhor = pontuados[0];
  const empatados = pontuados.filter(x => x.score === melhor.score);
  // Empate técnico entre duas pessoas nunca grava sozinho, por melhor que seja o
  // score: é exatamente a situação em que errar é caro e passa despercebido. Na
  // planilha de referência isso acontece com os dois "MARIO DYKSTRA" (-2073 e
  // -4073), que são pessoas diferentes.
  if (empatados.length > 1) {
    return montar(entrada, 'ambiguo', null, melhor.score,
      empatados.map(x => ({ ...x, motivo: 'tokens' as Motivo })));
  }

  const automatico = melhor.score >= PISO_PESSOA_AUTO;
  const motivo: Motivo = automatico ? 'tokens' : 'similar';
  return montar(entrada, motivo, melhor.alvo, melhor.score,
    pontuados.slice(1).map(x => ({ ...x, motivo: 'similar' as Motivo })));
}

// ── Fazenda ─────────────────────────────────────────────────────────────────

/**
 * Piso de similaridade bruta para SUGERIR uma fazenda. Não existe piso de
 * gravação automática por similaridade: medido contra o cadastro real, núcleo +
 * contenção resolvem 429 das 446 linhas elegíveis (96%), e a similaridade solta
 * só acrescentava falso positivo. O que sobra vira confirmação.
 */
export const PISO_FAZENDA_SUGESTAO = 0.55;

/**
 * Casa a fazenda DENTRO do produtor já resolvido — nunca no cadastro inteiro.
 * Onze núcleos de fazenda se repetem entre produtores diferentes na planilha de
 * referência ("4E", "SANTO ANDRE", "CRISTALINA I", "SANTA TEREZINHA", "PEREIRA"…);
 * buscar globalmente daria o dono errado.
 */
export function casarFazenda<T>(
  nomePlanilha: string,
  doProdutor: T[] | null | undefined,
  nomeDe: (t: T) => string,
  sinonimosDe?: (t: T) => string[] | undefined,
): Casamento<T> {
  const entrada = String(nomePlanilha ?? '');
  const lista = doProdutor ?? [];
  const k = chave(semSufixoId(entrada));
  if (!k || !lista.length) return montar<T>(entrada, 'nenhum', null, 0);

  const exatos = lista.filter(f => chave(semSufixoId(nomeDe(f))) === k);
  if (exatos.length === 1) return montar(entrada, 'exato', exatos[0], 1);

  const sin = porSinonimo(k, lista, sinonimosDe);
  if (sin.length === 1) return montar(entrada, 'sinonimo', sin[0], 1);
  if (sin.length > 1) return montar(entrada, 'ambiguo', null, 1, sin.map(f => ({ alvo: f, score: 1, motivo: 'sinonimo' as Motivo })));

  const cortadas = lista.filter(f => {
    const cad = nucleoTexto(nomeDe(f)), pla = nucleoTexto(entrada);
    return na(semSufixoId(entrada)).length >= LARGURA_CAMPO_ORIGEM && cad.length > pla.length && cad.startsWith(pla);
  });
  if (cortadas.length === 1) return montar(entrada, 'truncado', cortadas[0], 1);

  const nuc = nucleoImovel(entrada);
  const porNucleo = lista.filter(f => nucleoImovel(nomeDe(f)) === nuc);
  if (porNucleo.length === 1) return montar(entrada, 'nucleo', porNucleo[0], 1);
  if (porNucleo.length > 1) return montar(entrada, 'ambiguo', null, 1, porNucleo.map(f => ({ alvo: f, score: 1, motivo: 'nucleo' as Motivo })));

  // Contenção de tokens: "FAZENDA ROSEIRA / BOM SUCESSO" contém "BOM SUCESSO";
  // "CHACARA TAINHA/LAGOA" contém "TAINHA"; "PIERRE BILLARD" contém "BILLARD".
  // Vale nos dois sentidos — às vezes é o cadastro que tem o nome mais longo.
  const toks = tokensImovel(entrada);
  const porContencao = lista.filter(f => contido(toks, tokensImovel(nomeDe(f))));
  if (porContencao.length === 1) return montar(entrada, 'contido', porContencao[0], 0.9);
  // Duas fazendas do mesmo produtor cujos tokens se contêm são indistinguíveis
  // daqui, e ISSO ACONTECE: Ernst Pauls tem "CRISTALINA I" e "CRISTALINA II" (os
  // algarismos romanos caem no filtro de ruído, então os tokens ficam IGUAIS);
  // Cristina Schmidt tem "CHACARA CRISTINA" e "CHACARA JOANA CRISTINA"; Morro
  // Chato tem "OURO VERDE" e "OURO VERDE DAS VIOLAS". Esta guarda é o que
  // impede um casamento errado silencioso nos três.
  if (porContencao.length > 1) {
    return montar(entrada, 'ambiguo', null, 0.9,
      porContencao.map(f => ({ alvo: f, score: 0.9, motivo: 'contido' as Motivo })));
  }

  const pontuados = lista
    .map(f => ({ alvo: f, score: similaridade(nuc, nucleoImovel(nomeDe(f))) }))
    .sort((x, y) => y.score - x.score);
  const acimaDoPiso = pontuados.filter(x => x.score >= PISO_FAZENDA_SUGESTAO);

  if (!acimaDoPiso.length) {
    // Nenhuma serve, mas a tela ainda oferece a lista do produtor — ORDENADA por
    // parecença, não pela ordem de inserção do cadastro.
    return montar<T>(entrada, 'nenhum', null, 0,
      pontuados.map(x => ({ ...x, motivo: 'similar' as Motivo })));
  }

  return montar(entrada, 'similar', acimaDoPiso[0].alvo, acimaDoPiso[0].score,
    pontuados.slice(1).map(x => ({ ...x, motivo: 'similar' as Motivo })));
}

export { montar as montarCasamento, porSinonimo, ACAO_DE };
