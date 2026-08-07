// Qual mapa interpolado alimenta a RECOMENDAÇÃO — regra única, sem dependências.
//
// A dose sai sempre em 20 m (PDF e arquivo de máquina), e para isso a aba
// Fertilidade interpola um mapa NATIVO nessa resolução junto com o fino.
//
// ONDE ELE MORA (v2.38.0): numa GAVETA PRÓPRIA da nuvem, `dose20__…`, e não mais
// junto dos mapas de fertilidade. Guardá-lo no mesmo prefixo custou DUAS
// regressões em dois dias: as zonas saíram em escadinha de 20 m (6bab014) e o
// relatório de fertilidade passou a imprimir a estatística do mapa grosso — porque
// os leitores daquele prefixo desempatam por "o mais recente vence", e o auxiliar
// é sempre o mais recente (sai da fila de segundo plano). Namespace separado
// resolve a CLASSE do problema: nenhum leitor de fertilidade o enxerga, hoje nem
// quando alguém escrever um laço novo. É o padrão que o repo já usa em
// `condutividade__`, `compactacao__`, `composicao__` e `mdecam__`.
//
// MEDIDO (backend real, 40 pontos de K%, variograma fixo e auto): entre krigar
// nativo a 20 m e tirar a média de blocos 4×4 do mapa fino, a diferença de DOSE é
// ~1% — a superfície krigada é lisa nessa escala. O mapa nativo vale por outra
// coisa: a reamostragem devolvia um shape novo com os `bounds` do grid fino
// (deslocamento de ~meio pixel) e carregava um `stats` que descrevia o mapa fino.
//
// Módulo separado de propósito: `aplicar.ts` arrasta cloud/biblioteca e não carrega
// em Node, então esta regra ficaria sem teste. Coberto por `npm run teste:grids`.

// Resolução em que a recomendação calcula. Espelhada em FertilidadeSection
// (PIXEL_RECOMENDACAO), que é quem gera o mapa nessa resolução.
export const PIXEL_RECOMENDACAO_M = 20;

// Gaveta do raster auxiliar de 20 m. Prefixos (fonte única — a aba grava, a
// recomendação lê, e as exclusões em cascata apagam):
export const prefixoDose20 = (talhaoId: string, importacaoId?: string) =>
  importacaoId ? `dose20__${talhaoId}__${importacaoId}__` : `dose20__${talhaoId}__`;
export const idDose20 = (
  talhaoId: string, importacaoId: string, metodo: string, modelo: string, nut: string, prof: string,
) => `${prefixoDose20(talhaoId, importacaoId)}${metodo}__${PIXEL_RECOMENDACAO_M}__${modelo || 'auto'}__${nut}__${prof}`;

// O auxiliar que a v2.37.0 gravou POR ENGANO no prefixo de fertilidade. Assinatura
// exata do que `processar20m` escrevia: pixel 20, sem rótulos e sem PNG. Um mapa de
// 20 m que o USUÁRIO escolheu no seletor tem rótulos — por isso não é confundido.
export function ehAuxiliar20mPerdido(
  id: string, prefixo: string, doc: { labels?: { features?: unknown[] }; resp?: { png?: string } },
): boolean {
  const info = lerChaveMapa(id.startsWith(prefixo) ? id.slice(prefixo.length) : id);
  if (info?.pixel !== PIXEL_RECOMENDACAO_M) return false;
  const semRotulos = !doc.labels?.features || doc.labels.features.length === 0;
  const semPng = !doc.resp?.png;
  return semRotulos && semPng;
}

// Lê o id do mapa salvo pela aba Fertilidade, do FIM para o começo:
//   talhao__importacao__metodo__pixel__modelo__nut__prof
// Ler do fim é o que mantém a leitura estável quando um segmento novo entra no
// miolo (foi assim que `krigefixa` da v2.34.0 passou sem quebrar nada).
// Ids legados (v0.21-0.22) tinham `legenda__nut__prof` no mesmo prefixo — ali o
// campo do pixel não é numérico, e é isso que os distingue.
export function lerChaveMapa(resto: string): { chave: string; pixel?: number; metodo?: string } | null {
  const p = resto.split('__');
  if (p.length < 2) return null;
  const chave = `${p[p.length - 2]}__${p[p.length - 1]}`;
  if (p.length < 5) return { chave };
  const px = Number(p[p.length - 4]);
  if (!isFinite(px) || px <= 0) return { chave };
  return { chave, pixel: px, metodo: p[p.length - 5] };
}

export interface CandidatoMapa { id: string; tem: boolean; em: string }
export interface EscolhaMapa { indice: number; pixel?: number; metodo?: string; eh20: boolean }

/**
 * Quem está pedindo o mapa — e por isso qual resolução ganha.
 *
 *  'dose'  (Recomendação): o de 20 m NATIVO. A dose sai em 20 m; pegar o fino e
 *          reamostrar desloca o mapa em ~meio pixel e leva um `stats` obsoleto.
 *  'zona'  (Zonas de Manejo): o mais FINO disponível. A divisa da zona é
 *          desenhada em cima da malha — a 20 m ela sai em escadinha de 20 m no
 *          mapa, e foi isso que apareceu quando o zoneamento passou a usar,
 *          sem querer, a mesma regra da dose (v2.37.0).
 */
export type UsoMapa = 'dose' | 'zona';

/**
 * Qual mapa entra na conta, por `nut__prof`. Preferência, nesta ordem:
 *   (1) tem grid  →  (2) a resolução que o USO pede  →  (3) o mais recente.
 *
 * O passo (2) é o que este arquivo existe para garantir: sem ele, um mapa fino
 * reprocessado depois ganharia do de 20 m só por ser mais novo — e, do outro
 * lado, o de 20 m recém-gerado rouba a vez do fino no zoneamento.
 */
export function escolherMapas(prefixo: string, itens: CandidatoMapa[], uso: UsoMapa): Record<string, EscolhaMapa> {
  const out: Record<string, EscolhaMapa> = {};
  // 'zona' quer o menor pixel; sem pixel no id (legado), fica por último.
  const melhorPixel = (a?: number, b?: number): boolean => {
    if (uso === 'dose') return false;                       // resolvido por eh20
    if (a == null) return false;
    if (b == null) return true;
    return a < b;
  };
  itens.forEach((c, indice) => {
    const info = lerChaveMapa(c.id.startsWith(prefixo) ? c.id.slice(prefixo.length) : c.id);
    if (!info) return;
    const eh20 = info.pixel === PIXEL_RECOMENDACAO_M;
    const atual = out[info.chave];
    if (atual) {
      const anterior = itens[atual.indice];
      const mesmoTem = c.tem === anterior.tem;
      const preferido = uso === 'dose'
        ? (eh20 && !atual.eh20)
        : melhorPixel(info.pixel, atual.pixel);
      const empatePref = uso === 'dose'
        ? (eh20 === atual.eh20)
        : (info.pixel === atual.pixel);
      const trocar = (c.tem && !anterior.tem)
        || (mesmoTem && preferido)
        || (mesmoTem && empatePref && c.em > anterior.em);
      if (!trocar) return;
    }
    out[info.chave] = { indice, pixel: info.pixel, metodo: info.metodo, eh20 };
  });
  return out;
}
