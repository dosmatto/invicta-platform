// NORMAS DE FÁBRICA — soja (ledger 22).
//
// POR QUE ESTE ARQUIVO EXISTE: o módulo foliar nasce com a Biblioteca vazia, e
// Biblioteca vazia significa DRIS sem norma — isto é, a tela só sabe dizer
// "sem norma" (ledger 17). Estas duas normas de literatura dão à plataforma um
// diagnóstico útil no primeiro dia, pelo único método cujo número está
// publicado e é verificável para a soja brasileira: a FAIXA DE SUFICIÊNCIA.
//
// TRÊS DECISÕES QUE PARECEM OMISSÃO E NÃO SÃO:
//
//  1. `pares: []` EM AMBAS. Não existe, em formato extraível, tabela publicada
//     de médias/DP das razões duais de soja — os artigos (Kurihara et al. 2013,
//     Tabelas 1–4; Hoogerheide 2005) trazem as normas como IMAGEM. Digitar
//     "de olho" 55 pares de um PDF escaneado é exatamente o que o ledger 17
//     proíbe. Par vazio faz `diagnosticar` devolver `dris: null` + motivo, que
//     é a verdade. O DRIS de verdade vem do gerador de normas, com o banco de
//     laudos e os mapas de colheita do próprio cliente.
//  2. `cnd: null` e `chance: null` pelo mesmo motivo: CND precisa das
//     estatísticas clr da população de referência e a Chance Matemática precisa
//     da população inteira. Nenhuma das duas cabe numa tabela de artigo.
//  3. A norma CLÁSSICA vai marcada com a ressalva de procedência no campo
//     `avisos`, e não num comentário de código. Os números dela são os mais
//     reproduzidos da literatura brasileira, mas a pesquisa desta versão não
//     conseguiu conferi-los na fonte primária (a tabela é imagem no PDF da
//     Embrapa). Quem usa a norma na tela precisa ler isso — o `avisos` viaja
//     junto do resultado e é renderizado ao lado da fonte.
//
// UNIDADES: g/kg para macro (N, P, K, Ca, Mg, S) e mg/kg para micro
// (B, Cu, Fe, Mn, Zn), exatamente a unidade canônica de `nutrientes.ts`. Errar
// a escala aqui dispararia "deficiência severa" de N em lavoura perfeita.
//
// IDs FIXOS: a semeadura grava por estes ids (store.seedNormasFoliaresSistema)
// e o `save` espelha na nuvem. Id gerado a cada boot criaria uma norma nova por
// navegador, e o histórico de diagnoses apontaria para normas que ninguém mais
// enxerga.
//
// Módulo PURO — sem DOM, sem I/O, sem store. npm run teste:foliar-fabrica

import type { FaixaNutriente, NormaDris, NutrienteId } from './tipos.ts';

/** Id fixo da norma regional MS/MT (Kurihara et al. 2013, Rev. Ceres 60(3)). */
export const ID_NORMA_KURIHARA_2013 = 'norma-soja-kurihara-2013';

/** Id fixo da tabela clássica (Sfredo et al. 1986 / Embrapa Soja). */
export const ID_NORMA_EMBRAPA_CLASSICA = 'norma-soja-embrapa-classica';

/**
 * A ressalva de procedência da norma clássica. Constante exportada porque a
 * tela e o teste precisam falar do MESMO texto — ressalva reescrita em dois
 * lugares é ressalva que um dia some de um deles.
 */
export const AVISO_FONTE_NAO_CONFERIDA =
  'valores amplamente reproduzidos na literatura, não conferidos na fonte primária nesta versão';

/** Açúcar para escrever a tabela de faixas legível, na ordem do laudo. */
const faixas = (
  t: Record<NutrienteId, [number, number]>,
): Partial<Record<NutrienteId, FaixaNutriente>> => {
  const saida: Partial<Record<NutrienteId, FaixaNutriente>> = {};
  for (const [id, [min, max]] of Object.entries(t) as [NutrienteId, [number, number]][]) {
    saida[id] = { min, max };
  }
  return saida;
};

/**
 * Kurihara et al. (2013), Rev. Ceres 60(3):320-327 — norma REGIONAL de MS/MT,
 * n=608 lavouras, 3º trifólio COM pecíolo em R1–R2, população de referência
 * acima de 3.600 kg/ha (34,2% da amostragem).
 *
 * É a faixa ESTREITA, e é esse o ponto do artigo: as amplitudes clássicas
 * (limite superior de 5 a 12× o inferior em Ca, Fe e Mn) fazem quase toda
 * amostra cair em "adequado" e o método perder utilidade diagnóstica.
 * Faixas conferidas na fonte primária.
 */
const KURIHARA_2013: NormaDris = {
  id: ID_NORMA_KURIHARA_2013,
  versao: 1,
  cultura: 'Soja',
  orgao: 'trifolio-com-peciolo',
  estadio: 'R1-R2',
  fonte: 'KURIHARA, C. H.; STAUT, L. A.; MAEDA, S.; PEREIRA, H. S. Faixas de suficiência e normas DRIS para a cultura da soja em Mato Grosso do Sul e Mato Grosso. Revista Ceres, v. 60, n. 3, p. 320-327, 2013.',
  origem: 'literatura',
  n: 608,
  criterioCorte: 'População de referência = lavouras com produtividade acima de 3.600 kg/ha (34,2% das 608 lavouras amostradas em MS e MT).',
  // Ver decisão 1 do cabeçalho: as Tabelas 1–4 do artigo são imagem no PDF.
  pares: [],
  cnd: null,
  chance: null,
  faixas: faixas({
    N: [45.0, 46.9], P: [2.5, 2.9], K: [17.0, 20.0], Ca: [5.0, 5.8],
    Mg: [2.5, 2.8], S: [2.1, 2.4],
    B: [36, 46], Cu: [7, 9], Fe: [59, 86], Mn: [21, 28], Zn: [21, 28],
  }),
  avisos: [
    'Norma REGIONAL (Mato Grosso do Sul e Mato Grosso). Aplicada fora dessa região, use-a como referência e não como veredito — solo, cultivar e regime hídrico deslocam as faixas.',
    'Só traz FAIXAS DE SUFICIÊNCIA: as normas DRIS de razões duais do artigo estão publicadas como imagem e não foram transcritas. Para DRIS e CND, gere a norma a partir dos seus próprios laudos e mapas de colheita.',
  ],
};

/**
 * Tabela clássica de faixas de suficiência da soja — Sfredo et al. (1986),
 * reproduzida pela Embrapa Soja em Tecnologias de Produção de Soja, e que
 * remonta a Peck (1979), média de seis regiões dos EUA.
 *
 * Entra de propósito, apesar de larga: é o número que o agrônomo brasileiro
 * conhece e cobra da tela. O que NÃO pode acontecer é ela entrar sem a
 * ressalva de procedência — daí `AVISO_FONTE_NAO_CONFERIDA` no `avisos`.
 */
const EMBRAPA_CLASSICA: NormaDris = {
  id: ID_NORMA_EMBRAPA_CLASSICA,
  versao: 1,
  cultura: 'Soja',
  orgao: 'trifolio-com-peciolo',
  estadio: 'R1-R2',
  fonte: 'SFREDO, G. J.; BORKERT, C. M.; LANTMANN, A. F.; MEYER, M. C. Soja: nutrição mineral, calagem e adubação. Londrina: Embrapa Soja, 1986; faixas reproduzidas em EMBRAPA SOJA. Tecnologias de Produção de Soja (várias edições).',
  origem: 'literatura',
  n: null,
  criterioCorte: 'Faixas de suficiência de literatura — o trabalho original não documenta separação de população de alta produtividade em formato recuperável.',
  pares: [],
  cnd: null,
  chance: null,
  faixas: faixas({
    N: [45, 55], P: [2.6, 5.0], K: [17, 25], Ca: [3.6, 20.0],
    Mg: [2.6, 10.0], S: [2.1, 4.0],
    B: [21, 55], Cu: [10, 30], Fe: [51, 350], Mn: [21, 100], Zn: [21, 50],
  }),
  avisos: [
    `Procedência: ${AVISO_FONTE_NAO_CONFERIDA}.`,
    'Faixas LARGAS — o limite superior chega a 5–12× o inferior em Ca, Fe e Mn, então quase toda amostra cai em "adequado". Para discriminar de fato, prefira a norma de Kurihara et al. (2013) ou uma norma gerada com os seus dados.',
    'Só traz FAIXAS DE SUFICIÊNCIA: não há pares duais nem estatísticas clr, logo DRIS e CND não rodam com esta norma.',
  ],
};

/** As normas de literatura embarcadas, na ordem em que a Biblioteca as mostra. */
export const NORMAS_FABRICA: NormaDris[] = [KURIHARA_2013, EMBRAPA_CLASSICA];

/**
 * Nome de cada norma na Biblioteca. Fica fora da `NormaDris` porque "nome" é
 * atributo do ITEM da Biblioteca (que o usuário renomeia), não da norma — a
 * norma responde por cultura/órgão/estádio/fonte.
 */
export const NOMES_NORMAS_FABRICA: Record<string, string> = {
  [ID_NORMA_KURIHARA_2013]: 'Soja — Kurihara et al. (2013), MS/MT',
  [ID_NORMA_EMBRAPA_CLASSICA]: 'Soja — Sfredo et al. (1986) / Embrapa Soja (clássica)',
};

/** Busca por id fixo. `undefined` quando o id não é de fábrica. */
export const normaFabricaPorId = (id: string): NormaDris | undefined =>
  NORMAS_FABRICA.find(n => n.id === id);
