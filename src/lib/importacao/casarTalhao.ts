// NOME DE TALHÃO: gramática, canonicalização e casamento. Puro — sem DOM, sem I/O.
//
// O nome de talhão da região segue uma convenção de dados (não de código):
// SIGLA DA FAZENDA + NÚMERO — "GJGCC 01", "RGC4E 18". Em cima disso o cliente
// escreve seis variações. Percentuais medidos sobre as 592 linhas da planilha de
// referência (579 nomes distintos):
//
//   limpo        GJGCC 01                                              82,3%
//   subdividido  CFMMB 04 A · DNHDV 09a · MCACA 07AB · GJGCC 09A a     10,1%
//   apelidado    LFAIC 02 - Ilha · LUGCG 01 (Mauri)                     5,6%
//   agregado     GSLTA 01 E 02 · GSLTA 04,05 · MGEPE 1-2 · ATSBO  3-7   1,7%
//   sem número   GVBIPE · GJGSM ABERTURA                                0,3%
//
// O que este módulo NÃO faz: decidir. Ele diz "isto parece uma subdivisão de
// GJGCC 08" e devolve `acao: 'partir'`; quem confirma é a tela.

import { na, chave, similaridade } from './texto.ts';
import { montarCasamento, porSinonimo } from './identidade.ts';
import type { Casamento, Motivo, Opcao } from './identidade.ts';

export type ClasseNome = 'limpo' | 'subdividido' | 'apelidado' | 'agregado' | 'sem-numero';

export interface NomeTalhao {
  original: string;
  /** Prefixo da fazenda: "GJGCC", "RGC4E". Vazio quando não dá para isolar. */
  sigla: string;
  /** Números que o nome cobre. Mais de um = agregado. */
  numeros: number[];
  /**
   * Grupos de letra depois do número, na ordem em que aparecem e em CAIXA ALTA.
   * "GJGCC 09A a" → ['A','A'];  "MCACA 07AB" → ['AB'].
   *
   * Grupo colado NÃO é quebrado letra a letra de propósito: na Fazenda Capivari
   * convivem 07A (109,87 ha), 07AB (15,76) e 07B (66,89) — três talhões
   * distintos, e "AB" é o pedaço do meio, não a soma de A com B.
   */
  sufixos: string[];
  /** Nome próprio do pedaço: "ILHA", "MAURI", "ABERTURA". */
  apelido: string;
  /**
   * O apelido veio de um marcador EXPLÍCITO (hífen cercado de espaço, ou
   * parênteses)? Palavra solta depois do número é ambígua — pode ser apelido ou
   * um sufixo mais longo do que o previsto — e por isso não grava sozinha.
   */
  apelidoExplicito: boolean;
  /**
   * Canônico sem sufixo: "GJGCC 09". Chave de agrupamento das partes.
   *
   * Em nome AGREGADO a base inclui TODOS os números ("MCALN 01+02"), e não só o
   * primeiro. Com o primeiro só, "MCALN 01 E 02" e "MCALN 01" — que são linhas
   * distintas da mesma fazenda, com 123,28 e 184,05 ha — geravam a MESMA chave,
   * e qualquer consumidor que agrupasse por ela lançava 307,33 ha num talhão de
   * 184,05 sem emitir um aviso.
   */
  base: string;
  /** Canônico com sufixo: "GJGCC 09 A". É a chave de casamento. */
  canonico: string;
  /**
   * Bases dos níveis mais específicos para o mais geral. "GJGCC 09A a" devolve
   * ['GJGCC 09 A', 'GJGCC 09']: a subdivisão de 2º nível é parte de "GJGCC 09A",
   * que existe no cadastro, e não de "GJGCC 09", que também existe e tem linha
   * própria de 70,26 ha.
   */
  basesPorNivel: string[];
  classe: ClasseNome;
}

const SO_DIGITOS = /^\d+$/;
// Aceita o sufixo colado ou preso por hífen: "09A" e "09-A" são o mesmo pedaço.
const NUM_COM_SUFIXO = /^(\d+)-?([A-Z]+)$/;
const SO_LETRAS = /^[A-Z]+$/;
/** Palavra que é só número (com pontuação): nunca é apelido de talhão. */
const APELIDO_NUMERICO = /^\d+[.,\-–]?$/;

/**
 * Lê o nome do talhão. Nunca lança: nome que não segue convenção nenhuma volta
 * com `classe: 'sem-numero'` e o texto inteiro como base, o que faz o casamento
 * cair no modo exato/similaridade — que é o comportamento correto para "GVBIPE".
 */
export function analisarNomeTalhao(nome: string): NomeTalhao {
  const original = String(nome ?? '');
  let s = na(original);

  // 0) Colar os intervalos ANTES de qualquer outra coisa. "MGEPE 1 - 2" e
  //    "GSLTA 04, 05" são a mesma informação de "MGEPE 1-2" e "GSLTA 04,05" —
  //    só que digitadas com espaço. Sem esta linha, o espaço fazia o segundo
  //    número virar "apelido", a linha casava com o talhão 1 e o talhão 2 sumia
  //    em silêncio, AUTOMATICAMENTE. É o pior erro que este módulo pode cometer,
  //    e a diferença entre acertar e errar era uma tecla de espaço no Excel.
  s = s.replace(/(\d)\s*([,\-–/])\s*(\d)/g, '$1$2$3');

  // 1) Apelido entre parênteses sai antes do resto, porque pode haver sufixo
  //    DEPOIS dele: "LUGCG 04 (KLAS)B" é a parte B do talhão 04 apelidado "Klas".
  const apelidos: string[] = [];
  let explicito = false;
  s = s.replace(/\(([^)]*)\)/g, (_, dentro: string) => {
    if (dentro.trim()) { apelidos.push(dentro.trim()); explicito = true; }
    return ' ';
  });

  // 2) Apelido depois de hífen CERCADO DE ESPAÇO. O espaço é o que separa
  //    "LFAIC 02 - ILHA" (apelido) de "MGEPE 1-2" (intervalo) — e o passo 0
  //    garantiu que nenhum intervalo ainda tenha espaço em volta do hífen.
  const comHifen = s.match(/^(.*?)\s+[-–]\s*(.+)$/);
  if (comHifen && comHifen[1].trim()) {
    s = comHifen[1];
    apelidos.push(comHifen[2].trim());
    explicito = true;
  }

  const tokens = s.split(/\s+/).filter(Boolean);
  const sigla = tokens.length ? tokens[0] : '';
  const numeros: number[] = [];
  const sufixos: string[] = [];
  const soltos: string[] = [];

  for (const t of tokens.slice(1)) {
    if (SO_DIGITOS.test(t)) { numeros.push(parseInt(t, 10)); continue; }

    // "01,02" / "1-2" / "12-13" — um talhão que cobre vários.
    if (/^\d+([,\-–/]\d+)+$/.test(t)) {
      for (const n of t.split(/[,\-–/]/)) numeros.push(parseInt(n, 10));
      continue;
    }

    const comSufixo = t.match(NUM_COM_SUFIXO);
    if (comSufixo) { numeros.push(parseInt(comSufixo[1], 10)); sufixos.push(comSufixo[2]); continue; }

    // "E" entre dois números é o conectivo de "01 E 02", não um sufixo.
    if (t === 'E' && numeros.length) continue;

    // Até 3 letras é sufixo de parte. Acima disso é palavra, e vira apelido —
    // mas apelido IMPLÍCITO, que não grava sozinho.
    if (SO_LETRAS.test(t) && t.length <= 3) { sufixos.push(t); continue; }
    soltos.push(t);
  }

  // Um "apelido" puramente numérico é resto de intervalo mal digitado, nunca um
  // nome. Recupera o número em vez de jogá-lo fora.
  for (let i = apelidos.length - 1; i >= 0; i--) {
    if (APELIDO_NUMERICO.test(apelidos[i])) {
      numeros.push(parseInt(apelidos[i], 10));
      apelidos.splice(i, 1);
    }
  }
  numeros.sort((a, b) => a - b);

  apelidos.push(...soltos);
  const apelido = apelidos.join(' ').trim();
  const apelidoExplicito = explicito && !soltos.length;

  // Zero-padding uniforme: "MGEPE 1" e "MGEPE 01" são o mesmo talhão, e a
  // planilha usa as duas formas na mesma fazenda.
  const dd = (n: number) => String(n).padStart(2, '0');
  const base = numeros.length ? `${sigla} ${numeros.map(dd).join('+')}` : na(original);
  const canonico = sufixos.length ? `${base} ${sufixos.join(' ')}` : base;

  const basesPorNivel: string[] = [];
  for (let i = sufixos.length - 1; i >= 0; i--) basesPorNivel.push(`${base} ${sufixos.slice(0, i).join(' ')}`.trim());

  let classe: ClasseNome;
  if (!numeros.length) classe = 'sem-numero';
  else if (numeros.length > 1) classe = 'agregado';
  else if (sufixos.length) classe = 'subdividido';
  else if (apelido) classe = 'apelidado';
  else classe = 'limpo';

  return { original, sigla, numeros, sufixos, apelido, apelidoExplicito, base, canonico, basesPorNivel, classe };
}

/**
 * Comparação de canônicos por string, NÃO por `chave()`.
 *
 * `chave()` remove o espaço, e é justamente o espaço que separa os sufixos:
 * "MCACA 07A b" (parte b do talhão 07A) e "MCACA 07AB" (talhão próprio, 15,76 ha)
 * viravam os dois `MCACA07AB` e casavam como EXATO, automaticamente, na área
 * errada. Como os dois lados passam por `analisarNomeTalhao`, o canônico já sai
 * normalizado e a comparação direta é segura.
 */
const mesmoCanonico = (a: NomeTalhao, b: NomeTalhao) => a.canonico === b.canonico;

/** Piso para SUGERIR um talhão parecido. Acima disso ainda é confirmação. */
export const PISO_TALHAO_SUGESTAO = 0.8;

export interface CasamentoTalhao<T> extends Casamento<T> {
  /** Como a planilha escreveu o nome. A tela mostra isso ao pedir confirmação. */
  analise: NomeTalhao;
  /** Em 'subdivisao', o talhão INTEIRO do cadastro de que esta linha é parte. */
  pai: T | null;
  /**
   * Em 'agregado', TODOS os talhões do cadastro que a linha cobre — inclusive as
   * partes de cada um. Nunca é gravado sozinho.
   */
  cobertos: T[];
}

/**
 * Casa o talhão DENTRO da fazenda já resolvida.
 *
 * A cascata, na ordem em que o código executa. Só os quatro primeiros gravam
 * sozinhos:
 *
 *  1. chave exata            GJGCC 01 = GJGCC 01
 *  2. sinônimo confirmado antes
 *  3. AGREGADO               "GSLTA 01 E 02" → GSLTA 01 + GSLTA 02      partir
 *     (vem cedo de propósito: se o canônico rodasse antes, a linha casaria
 *      com um talhão só e o outro sumiria sem aviso)
 *  4. canônico               "DNHDV 09a" = "DNHDV 09 A";  "MGEPE 1" = "MGEPE 01"
 *  5. base sem o sufixo      "HABPU 02 a" → HABPU 02                    partir
 *  6. similaridade                                                      confirmar
 */
export function casarTalhao<T>(
  nomePlanilha: string,
  daFazenda: T[] | null | undefined,
  nomeDe: (t: T) => string,
  sinonimosDe?: (t: T) => string[] | undefined,
): CasamentoTalhao<T> {
  const entrada = String(nomePlanilha ?? '');
  const lista = daFazenda ?? [];
  const analise = analisarNomeTalhao(entrada);

  const feito = (
    motivo: Motivo, alvo: T | null, score: number,
    opcoes: Opcao<T>[] = [], extra: { pai?: T | null; cobertos?: T[] } = {},
  ): CasamentoTalhao<T> => ({
    ...montarCasamento(entrada, motivo, alvo, score, opcoes),
    // A decisão de um talhão se repete por CANÔNICO, não pelo texto cru: é o que
    // faz "resolver esta subdivisão" valer para as outras escritas do mesmo jeito.
    chaveDecisao: analise.canonico,
    analise,
    pai: extra.pai ?? null,
    cobertos: extra.cobertos ?? [],
  });

  const k = chave(entrada);
  if (!k || !lista.length) return feito('nenhum', null, 0);

  const analisados = lista.map(t => ({ t, a: analisarNomeTalhao(nomeDe(t)) }));

  // 1) exato — comparado por `na()`, NÃO por `chave()`. `chave()` apaga o espaço,
  //    e é o espaço que separa os sufixos: "MCACA 07A b" (parte b do talhão 07A)
  //    e "MCACA 07AB" (talhão próprio, 15,76 ha) viravam a mesma chave e casavam
  //    como EXATO, automaticamente, na área errada.
  const alvoExato = na(entrada);
  const exatos = lista.filter(t => na(nomeDe(t)) === alvoExato);
  if (exatos.length === 1) return feito('exato', exatos[0], 1);

  // 2) sinônimo aprendido
  const sin = porSinonimo(k, lista, sinonimosDe);
  if (sin.length === 1) return feito('sinonimo', sin[0], 1);
  if (sin.length > 1) {
    return feito('ambiguo', null, 1, sin.map(t => ({ alvo: t, score: 1, motivo: 'sinonimo' as Motivo })));
  }

  // 3) agregado — uma linha para vários talhões
  if (analise.classe === 'agregado') {
    // `filter`, não `find`: se o cadastro tiver o talhão 03 partido em 03A e 03B,
    // pegar só o primeiro faria a outra metade sumir dos `cobertos`.
    const cobertos = analise.numeros.flatMap(n => {
      const alvoBase = `${analise.sigla} ${String(n).padStart(2, '0')}`;
      return analisados.filter(x => x.a.basesPorNivel.includes(alvoBase) || x.a.base === alvoBase).map(x => x.t);
    });
    const unicos = [...new Set(cobertos)];
    return feito('agregado', null, unicos.length ? 0.9 : 0,
      unicos.map(t => ({ alvo: t, score: 0.9, motivo: 'agregado' as Motivo })), { cobertos: unicos });
  }

  // 4) canônico — cobre zero-padding, caixa, espaço no sufixo e apelido explícito
  const porCanonico = analisados.filter(x => mesmoCanonico(analise, x.a));
  if (porCanonico.length === 1) {
    // Apelido que veio de palavra solta (não de hífen nem parêntese) pode ser um
    // sufixo mais longo do que o previsto — nesse caso pede confirmação.
    const seguro = analise.apelidoExplicito || !analise.apelido;
    return feito(seguro ? 'canonico' : 'similar', porCanonico[0].t, seguro ? 1 : 0.9);
  }
  if (porCanonico.length > 1) {
    return feito('ambiguo', null, 1, porCanonico.map(x => ({ alvo: x.t, score: 1, motivo: 'canonico' as Motivo })));
  }

  // 5) subdivisão — a planilha parte o que o cadastro tem inteiro. Procura do
  //    nível MAIS ESPECÍFICO para o mais geral: "GJGCC 09A a" é parte de
  //    "GJGCC 09A" (que existe), não do avô "GJGCC 09" (que também existe e tem
  //    linha própria).
  for (const nivel of analise.basesPorNivel) {
    const pais = analisados.filter(x => x.a.canonico === nivel);
    if (pais.length === 1) return feito('subdivisao', null, 0.9, [], { pai: pais[0].t });
    if (pais.length > 1) {
      return feito('ambiguo', null, 0.9, pais.map(x => ({ alvo: x.t, score: 0.9, motivo: 'subdivisao' as Motivo })));
    }
  }
  if (analise.sufixos.length) {
    // Cadastro já subdividido, mas com outra letra ("07A" existe, veio "07AB"):
    // ainda é assunto do mesmo talhão-pai, e quem decide é o usuário.
    const irmaos = analisados.filter(x => x.a.base === analise.base);
    if (irmaos.length) {
      return feito('subdivisao', null, 0.85,
        irmaos.map(x => ({ alvo: x.t, score: 0.85, motivo: 'subdivisao' as Motivo })));
    }
  }

  // 6) similaridade
  const pontuados = analisados
    .map(x => ({ alvo: x.t, score: similaridade(chave(analise.canonico), chave(x.a.canonico)) }))
    .filter(x => x.score >= PISO_TALHAO_SUGESTAO)
    .sort((a, b) => b.score - a.score);

  if (!pontuados.length) return feito('nenhum', null, 0);
  return feito('similar', pontuados[0].alvo, pontuados[0].score,
    pontuados.slice(1).map(x => ({ ...x, motivo: 'similar' as Motivo })));
}

// ── Duas linhas no mesmo talhão: o que são? ─────────────────────────────────

export type TipoRepeticao =
  | 'consorcio' // duas culturas sobre a MESMA área
  | 'partes'    // o talhão foi partido; as áreas somam
  | 'ambiguo';  // a planilha não diz — a tela tem de perguntar

export interface LinhaRepetida {
  areaHa?: number | null;
  /** Coluna PLANTIO/REPLANTIO da planilha. */
  tipoPlantio?: string | null;
  /** Coluna CULTURA. É o dado que DEFINE consórcio, e sem ele sobra chute. */
  cultura?: string | null;
  cultivar?: string | null;
}

/** Área em centésimos, para não comparar float com float. */
const cent = (a: number) => Math.round(a * 100);

/**
 * Duas ou mais linhas do mesmo talhão: é o talhão PARTIDO, ou duas culturas
 * sobre a MESMA área (consórcio)?
 *
 * Devolve TRÊS respostas, não duas, porque a planilha tem três situações. Dos 11
 * grupos repetidos da planilha de referência: 1 é consórcio declarado, 5 são
 * partes com áreas e cultivares distintos, e **5 têm cultura, cultivar,
 * propósito, data e população IDÊNTICOS, diferindo só na área** — e em todos os
 * cinco uma das áreas é exatamente 20,00 ha. Podem ser duas remessas do mesmo
 * pedido ou um talhão realmente partido; a planilha não diz. Chamar isso de
 * "partes" e somar lança 111,60 ha num talhão que a outra linha diz ter 91,60.
 *
 * A regra:
 *  - alguém marcou CONSÓRCIO na coluna PLANTIO/REPLANTIO → consórcio;
 *  - culturas diferentes na mesma área                    → consórcio;
 *  - áreas diferentes E (cultura ou cultivar diferentes)  → partes;
 *  - o resto                                              → ambíguo.
 */
export function classificarRepeticao(linhas: LinhaRepetida[] | null | undefined): TipoRepeticao {
  const ls = (linhas ?? []).filter(Boolean);
  if (ls.length < 2) return 'partes';

  if (ls.some(l => na(l?.tipoPlantio ?? '').includes('CONSORCIO'))) return 'consorcio';

  const areas = ls.map(l => l?.areaHa).filter((a): a is number => typeof a === 'number' && a > 0);
  const temTodasAsAreas = areas.length === ls.length;
  const areasIguais = temTodasAsAreas && areas.every(a => cent(a) === cent(areas[0]));

  const culturas = new Set(ls.map(l => na(l?.cultura ?? '')));
  const cultivares = new Set(ls.map(l => na(l?.cultivar ?? '')));

  // Duas culturas na mesma área é a definição de consórcio.
  if (areasIguais && culturas.size > 1) return 'consorcio';
  // Mesma cultura E mesmo cultivar, com áreas iguais: não é consórcio de jeito
  // nenhum, e também não dá para afirmar que são partes.
  if (areasIguais) return 'ambiguo';

  if (!temTodasAsAreas) return 'ambiguo';
  if (culturas.size > 1 || cultivares.size > 1) return 'partes';
  // Áreas diferentes com tudo o mais idêntico — os 5 casos de "20,00 ha".
  return 'ambiguo';
}

/** Atalho de leitura: `classificarRepeticao(...) === 'consorcio'`. */
export const ehConsorcio = (linhas: LinhaRepetida[] | null | undefined): boolean =>
  classificarRepeticao(linhas) === 'consorcio';
