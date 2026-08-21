// NOME DOS ARQUIVOS EXPORTADOS — um padrão só para a casa inteira.
//
//     SA03_FERT_2026_EP01_CA
//     │    │    │    │    └── detalhe (elemento, camada, produto…) — opcional
//     │    │    │    └─────── época: EP01 = 1ª (jan–jun), EP02 = 2ª (jul–dez)
//     │    │    └──────────── ano
//     │    └───────────────── tipo do artefato
//     └────────────────────── sigla da fazenda + nº do talhão
//                             ("SERRA AZUL" + "JCASA 03" → SA03)
//
// A ORDEM é talhão → tipo → ano → época de propósito: ordenar a pasta por nome
// agrupa tudo de um talhão e, dentro dele, junta os mapas do mesmo tipo — dá
// para ver a fertilidade de 2025 e a de 2026 uma embaixo da outra.
//
// Pedaço desconhecido é OMITIDO, nunca vira "—", "null" ou "undefined": nome de
// arquivo é chave, não frase. Melhor "SA03_NDVI_2026" que "SA03_NDVI_2026_EP".
//
// SEM acento, SEM espaço, SEM minúscula — a mesma regra do arquivo que vai para
// o monitor da máquina (ver prescricao/nomeArquivo.ts, que reusa as primitivas
// daqui e mantém o próprio formato, já em uso no campo).
//
// Módulo PURO. npm run teste:nomes

import { anoDaSafra, anoDeData, epocaDeData, type Epoca } from './periodo.ts';

/** Palavras que não entram na sigla — não distinguem uma fazenda de outra. */
const GENERICAS = new Set([
  'FAZENDA', 'FAZ', 'SITIO', 'CHACARA', 'ESTANCIA', 'AGROPECUARIA', 'GRANJA',
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E',
]);

export const semAcento = (s: string): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export const soLetrasNum = (s: string): string => semAcento(s).replace(/[^A-Z0-9]/g, '');

/**
 * Saneamento de nome livre (o que o usuário digitou) para virar nome de arquivo.
 *
 * Existe para acabar com as SETE regexes diferentes que estavam espalhadas pelos
 * geradores — cada uma trocando um conjunto próprio de caracteres, uma delas por
 * hífen em vez de underline. Preserva a caixa: serve para nome de cenário e de
 * mapa, onde a legibilidade importa mais que o formato de monitor.
 */
export function sanitizar(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Sigla da fazenda: a cadastrada, quando existe; senão as INICIAIS das palavras
 * que distinguem ("SERRA AZUL" → SA, "Fazenda Boa Vista" → BV).
 */
export function siglaFazenda(nome: string, sigla?: string | null): string {
  const s = soLetrasNum(sigla ?? '');
  if (s) return s.slice(0, 4);
  const palavras = semAcento(nome).split(/[^A-Z0-9]+/).filter(Boolean);
  const uteis = palavras.filter(p => !GENERICAS.has(p));
  const base = (uteis.length ? uteis : palavras).map(p => p[0]).join('');
  return base.slice(0, 4) || 'FAZ';
}

/**
 * Número do talhão: o NÚMERO no fim do nome ("JCASA 03" → 03, "T-7" → 07).
 * Sem número, usa o nome enxugado — melhor um nome feio que dois arquivos
 * diferentes com o mesmo nome.
 */
export function numeroTalhao(nome: string): string {
  const m = semAcento(nome).match(/(\d+)\s*$/);
  if (m) return m[1].padStart(2, '0');
  return soLetrasNum(nome).slice(0, 6) || 'T';
}

/**
 * "SA03" — sigla da fazenda colada ao número do talhão, sem separador.
 *
 * Sem talhão devolve só a sigla ("SA"): é o caso dos relatórios de FAZENDA, que
 * cobrem todos os talhões e não têm um número para citar.
 */
export function idTalhao(fazenda: string, talhao?: string | null, sigla?: string | null): string {
  const sig = siglaFazenda(fazenda || '', sigla);
  const t = (talhao ?? '').trim();
  return t ? `${sig}${numeroTalhao(t)}` : sig;
}

/** O que está sendo exportado — o segmento que agrupa a pasta por assunto. */
export type TipoExport =
  | 'FERT'      // mapa de fertilidade (1 elemento)
  | 'BOOK'      // book de fertilidade (vários elementos + capa)
  | 'ZONAS'     // zonas de manejo (PDF/SHP/KML)
  | 'NDVI'      // mapas de satélite
  | 'RECOM'     // recomendação / cenários
  | 'GRADE'     // grade de amostragem
  | 'ETIQ'      // etiquetas das amostras
  | 'CAMPO'     // caderno de campo / registros
  | 'MDE'       // relevo (altimetria, declividade e derivados)
  | 'COND'      // condutividade elétrica
  | 'PROD'      // produtividade/colheita (mapa absoluto + quantil + analise)
  | 'COMPARA'   // comparações (produtividade × NDVI, cenários)
  | 'VALID'     // validação de zoneamento
  | 'CONFER';   // conferência de cadastro

export interface DadosNomeExport {
  fazenda?: string;
  siglaFazenda?: string | null;
  talhao?: string;
  tipo: TipoExport;
  ano?: number | null;
  epoca?: Epoca | null;
  /** Elemento, camada, produto, nome do mapa… Vai por último e é opcional. */
  detalhe?: string;
}

/**
 * Nome base (SEM extensão) de qualquer arquivo exportado.
 *
 * Cuidado ao escolher o `detalhe`: use o ID do atributo, não a sigla de exibição.
 * "K%" e "K" viram os dois "K" depois do saneamento, e aí Potássio e Saturação
 * por Potássio brigam pelo mesmo nome de arquivo — 'satk' e 'k' não brigam.
 */
export function nomeExport(d: DadosNomeExport): string {
  const partes: string[] = [idTalhao(d.fazenda ?? '', d.talhao, d.siglaFazenda), d.tipo];
  if (d.ano != null && Number.isFinite(d.ano)) partes.push(String(Math.trunc(d.ano)));
  if (d.epoca === '1' || d.epoca === '2') partes.push(`EP0${d.epoca}`);
  const det = soLetrasNum(d.detalhe ?? '').slice(0, 14);
  if (det) partes.push(det);
  return partes.join('_');
}

/**
 * Resolve ano + época do que houver à mão, em CASCATA.
 *
 * Cada artefato guarda o período de um jeito: laudo e grade têm `dataReferencia`
 * (e daí sai a época); zonas e NDVI têm só a data de emissão/imagem; recomendação
 * tem só o nome da safra ("25/26"), que dá o ano e nunca a época. A cascata deixa
 * um chamador só servir a todos, e quem não tiver época simplesmente não a leva
 * no nome.
 */
export function periodoParaNome(f: {
  dataReferencia?: string | null;
  data?: string | null;
  safra?: string | null;
  ano?: number | null;
  epoca?: Epoca | null;
}): { ano: number | null; epoca: Epoca | null } {
  let ano: number | null = f.ano ?? null;
  let epoca: Epoca | null = f.epoca ?? null;
  for (const iso of [f.dataReferencia, f.data]) {
    if (ano != null && epoca != null) break;
    if (!iso) continue;
    if (ano == null) ano = anoDeData(iso);
    if (epoca == null) epoca = epocaDeData(iso);
  }
  if (ano == null && f.safra) ano = anoDaSafra(f.safra);
  return { ano, epoca };
}
