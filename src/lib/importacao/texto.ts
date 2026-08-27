// NÚCLEO DE TEXTO da importação de planilhas. Puro — sem DOM, sem 'use client',
// sem I/O. Roda no navegador, em script node (`npm run teste:importacao`) e, se
// um dia houver ingestão por API, no servidor.
//
// Por que um módulo novo em vez de reusar `laudo/nucleo.ts`: a `norm` de lá
// derruba TUDO que não é [a-z0-9%] e devolve minúsculas — ela monta chaves de
// talhão/profundidade do laudo e não pode mudar. Aqui o problema é outro:
// comparar NOMES DE GENTE E DE IMÓVEL, onde o espaço entre as palavras é a
// informação principal ("GASPAR JOAO DE GEUS" tem de virar quatro tokens, não
// um blob). São duas normalizações com propósitos diferentes; fundir as duas foi
// tentado e quebra o casamento por token.
//
// Existem hoje ~20 cópias locais de `normalize('NFD')` espalhadas pelo repo
// (compactacao.ts, condutividade.ts, store.ts, FazendaDetailPanel.tsx…), cada
// uma com uma agressividade. Não estamos mexendo nelas — mas tudo que for
// importação nasce daqui.

/** Remove acentos, preservando o resto do texto (inclusive caixa e pontuação). */
export function semAcento(s: string): string {
  // ̀-ͯ = marcas diacríticas combinantes que o NFD separa da letra.
  // Escrito com escape, e não com os caracteres literais, porque combinante solto
  // no fonte é invisível no editor e some em qualquer copiar/colar descuidado.
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalização de EXIBIÇÃO/COMPARAÇÃO: sem acento, MAIÚSCULA, espaços
 * colapsados, sem espaço nas pontas. Preserva pontuação e dígitos.
 *
 * Maiúscula (e não minúscula) porque é assim que o cadastro guarda — `comNome()`
 * em `store.ts:724` força caixa alta em Cliente/Fazenda/Talhão. Comparar na
 * mesma caixa do banco evita uma conversão a cada leitura.
 */
export function na(s: string): string {
  return semAcento(String(s ?? '')).replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Chave de igualdade estrita: só [A-Z0-9]. Some espaço, hífen, ponto, barra e
 * parêntese. É o que faz "FAZENDA SÃO MIGUEL" e "FAZENDA SAO  MIGUEL." darem a
 * mesma chave.
 */
export function chave(s: string): string {
  return na(s).replace(/[^A-Z0-9]/g, '');
}

/**
 * Tira o código de sistema que a planilha do cliente cola no fim do nome:
 * "GASPAR JOAO DE GEUS-4931" → "GASPAR JOAO DE GEUS".
 *
 * Remove hífen + dígitos no FIM da string em dois casos: quando vem depois de um
 * caractere não numérico ("...GEUS-4931", "FAZENDA 4E-281611") ou quando são 3+
 * dígitos ("...LOTES 51/53-674").
 *
 * A dupla condição existe para não estragar INTERVALO DE TALHÃO, que tem a mesma
 * forma: "MGEPE 1-2", "MGESA 12-13" e "ATSBO  3-7" são um talhão que cobre dois —
 * ali o `-2` vem depois de dígito e tem menos de 3 casas, então fica. Códigos de
 * sistema reais no cadastro vão de 3 a 6 dígitos (256, 4931, 281611); intervalos
 * de talhão não passam de 2.
 */
const RE_SUFIXO_ID = /(?:(?<=\D)-(\d+)|-(\d{3,}))\s*$/;

export function semSufixoId(s: string): string {
  return String(s ?? '').replace(RE_SUFIXO_ID, '').trim();
}

/**
 * O código que foi removido, quando existe. NÃO é lixo sempre: a planilha traz
 * dois produtores chamados `MARIO DYKSTRA`, `-2073` e `-4073`, que são pessoas
 * diferentes com 1 e 8 linhas. Sem o código, os dois viram a mesma string e a
 * tela pede que o usuário escolha entre duas opções idênticas.
 *
 * Não dá para casar por ele — o cadastro da plataforma não guarda o código do
 * sistema do cliente. Serve para EXIBIR e para o relatório, e é por isso que
 * `Casamento.entrada` guarda o nome cru, com o código.
 */
export function idExterno(s: string): string {
  const m = RE_SUFIXO_ID.exec(String(s ?? ''));
  return m ? (m[1] ?? m[2] ?? '') : '';
}

/**
 * Palavras que NÃO carregam identidade: conectivos do português, partículas de
 * sobrenome holandês/alemão (a região é colônia holandesa — "VAN DEN BOOGAARD",
 * "DE GEUS") e sufixos societários.
 *
 * JUNIOR, NETO, FILHO e SOBRINHO ficaram DE FORA de propósito. São marcadores de
 * geração: distinguem pessoas diferentes da mesma família. Tratá-los como ruído
 * faz "CARLOS FREDERICO MARGRAF JUNIOR" casar com o pai, e faz "OSMAR NETO"
 * (que existe no cadastro) virar só "OSMAR" e casar com qualquer Osmar.
 *
 * "E" também ficou de fora: é conectivo em "HARMS E FILHOS", mas é a INICIAL em
 * "JOSE E. SLOB" — e apagar a inicial some justamente com o que distingue dois
 * irmãos. Mantido como token, o conectivo custa no máximo um ponto de score;
 * apagado, ele custa a identidade.
 */
export const PARTICULAS = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'DEL',
  'VAN', 'DEN', 'DER', 'VON', 'TER',
  'LTDA', 'LTD', 'EPP', 'SA', 'S/A', 'EIRELI', 'CIA',
]);

/**
 * Quebra em tokens significativos: sem acento, maiúsculo, sem pontuação, sem
 * partículas. O ponto de abreviatura vira separador, então "RAPHAEL C.
 * HOOGERHEIDE" produz ['RAPHAEL', 'C', 'HOOGERHEIDE'] — é o que permite casar a
 * inicial com o nome inteiro depois.
 */
export function palavras(s: string): string[] {
  return na(s)
    .split(/[^A-Z0-9]+/)
    .filter(t => t.length > 0 && !PARTICULAS.has(t));
}

/**
 * Distância de edição de Levenshtein, com corte: assim que a menor distância
 * possível da linha passa de `maxDist`, devolve `maxDist + 1` e para.
 *
 * O corte importa porque isto roda O(produtores × linhas) — 75 × 592 na planilha
 * de referência, e cresce com o cadastro. Sem ele, a tela trava em cadastros
 * grandes; com ele, a maioria das comparações morre na primeira linha.
 */
export function lev(entradaA: string, entradaB: string, maxDist = Infinity): number {
  // Coerção na porta: `lev` e `similaridade` são exportadas e a fase 5 vai
  // chamá-las direto sobre células de XLSX, onde `raw:false` nem sempre devolve
  // string. Sem isto, um número vira `NaN` lá na frente e a linha some sem erro.
  const a = String(entradaA ?? ''), b = String(entradaB ?? '');
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let menor = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const custo = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
      if (cur[j] < menor) menor = cur[j];
    }
    if (menor > maxDist) return maxDist + 1;
    const troca = prev; prev = cur; cur = troca;
  }
  return prev[b.length];
}

/**
 * Similaridade 0..1 derivada da distância de edição.
 *
 * Foi medido contra o cadastro real: a razão de Levenshtein é mais CONSERVADORA
 * que a razão de subsequência comum (tipo `difflib`), que inflava o acerto
 * aparente em ~2,7 pontos aceitando pares que um humano rejeitaria. Preferimos
 * errar para o lado de pedir confirmação.
 */
export function similaridade(entradaA: string, entradaB: string): number {
  const a = String(entradaA ?? ''), b = String(entradaB ?? '');
  const maior = Math.max(a.length, b.length);
  if (maior === 0) return 1;
  return 1 - lev(a, b) / maior;
}

/**
 * Um token é um ERRO DE DIGITAÇÃO do outro?
 *
 * Deliberadamente restrita. A versão frouxa (1 erro em tokens de 5+ letras)
 * casava automaticamente, com score 1,0:
 *
 *   MARIO × MARIA · PAULO × PAULA · JULIO × JULIA · CLAUDIO × CLAUDIA
 *   DANIEL × DANIELA · MEIJER × MEIJERS · VISSER × VISSERS · PAULS × PAULUS
 *
 * Ou seja: fundia marido e mulher, pai e filha, e duas famílias holandesas
 * diferentes. Em português a última letra É o gênero, e em holandês o "S" final
 * É outro sobrenome — as duas posições onde uma troca de letra quase nunca é
 * engano de digitação são justamente as que a regra frouxa aceitava.
 *
 * As três exigências, e o que cada uma barra:
 *   • 7 letras no mínimo   → mata MARIO/MARIA, PAULO/PAULA, JULIO/JULIA
 *   • mesmas 5 primeiras   → mata ERNST/ERNESTO e trocas no começo do nome
 *   • MESMA última letra   → mata CLAUDIO/CLAUDIA, MEIJER/MEIJERS, DANIEL/DANIELA
 *
 * O caso real que a regra existe para salvar continua passando: o cadastro tem
 * `DANIELLLE NEVES HILGEMBERG` com três Ls, e `DANIELLE` × `DANIELLLE` tem 8
 * letras, começa igual, termina igual e está a distância 1.
 */
export function ehErroDeDigitacao(a: string, b: string): boolean {
  if (Math.min(a.length, b.length) < 7) return false;
  if (a.slice(0, 5) !== b.slice(0, 5)) return false;
  if (a[a.length - 1] !== b[b.length - 1]) return false;
  return lev(a, b, 1) <= 1;
}

/**
 * Dois tokens são a mesma palavra?
 *
 *  - iguais;
 *  - um é a INICIAL do outro ("C" ≡ "CORNELIS"). A inicial precisa ser LETRA:
 *    sem isso, "2" casava com "2000" e um dígito solto virava coringa;
 *  - erro de digitação, pelas regras estritas de `ehErroDeDigitacao`.
 */
export function tokensCompativeis(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1) return /[A-Z]/.test(a) && b.length > 1 && b.startsWith(a);
  if (b.length === 1) return /[A-Z]/.test(b) && a.length > 1 && a.startsWith(b);
  return ehErroDeDigitacao(a, b);
}
